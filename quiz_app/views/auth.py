"""
Authentication views for user login and logout.

This module provides secure and modular authentication views with:
- Improved error handling
- Security best practices
- Session management
- IP address tracking
"""
import logging
from urllib.parse import urlencode, urlparse

from django.shortcuts import redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import SetPasswordForm
from django.contrib.auth.tokens import default_token_generator
from django.contrib import messages
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_protect
from django.conf import settings
from django.utils import timezone
from django.http import JsonResponse

from ..account_security import SafePasswordResetForm
from ..models import User

logger = logging.getLogger(__name__)


def get_client_ip(request):
    """
    Get the client's IP address from the request.
    
    Args:
        request: Django HttpRequest object
        
    Returns:
        str: IP address or empty string if not found
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR', '')
    return ip.strip()


def _wants_json_login_response(request):
    return "application/json" in request.headers.get("Accept", "").lower()


def _auth_app_redirect(request):
    next_url = request.GET.get("next")
    query = urlencode({"next": next_url}) if next_url else ""
    return redirect(f"/auth-app/?{query}" if query else "/auth-app/")


def _login_failure_response(request, code, message, status):
    if _wants_json_login_response(request):
        return JsonResponse({"code": code, "message": message}, status=status)

    messages.error(request, message)
    return _auth_app_redirect(request)


@csrf_protect
@require_http_methods(["GET", "POST"])
def password_reset_view(request):
    if request.method == "GET":
        return redirect("/auth-app/?flow=password-reset")

    form = SafePasswordResetForm(request.POST)
    if not form.is_valid():
        return JsonResponse(
            {
                "code": "VALIDATION_ERROR",
                "message": form.errors.get("email", ["Enter a valid email address."])[0],
            },
            status=400,
        )

    site_url = urlparse(settings.SITE_URL)
    if not site_url.scheme or not site_url.netloc:
        raise ImproperlyConfigured("SITE_URL must include a scheme and hostname.")
    form.save(
        domain_override=site_url.netloc,
        use_https=site_url.scheme == "https",
        from_email=settings.DEFAULT_FROM_EMAIL,
        subject_template_name="",
        email_template_name="",
    )
    return JsonResponse(
        {
            "success": True,
            "message": (
                "If an account with that email exists, a password reset link "
                "has been sent."
            ),
        }
    )


@csrf_protect
@require_http_methods(["GET", "POST"])
def password_reset_confirm_view(request, uidb64, token):
    if request.method == "GET":
        query = urlencode(
            {
                "flow": "password-reset-confirm",
                "uid": uidb64,
                "token": token,
            }
        )
        return redirect(f"/auth-app/?{query}")

    try:
        user_id = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    if user is None or not default_token_generator.check_token(user, token):
        return JsonResponse(
            {
                "code": "INVALID_RESET_LINK",
                "message": "This password reset link is invalid or has expired.",
            },
            status=400,
        )

    form = SetPasswordForm(user, request.POST)
    if not form.is_valid():
        messages = form.errors.get("new_password2") or form.errors.get("new_password1")
        return JsonResponse(
            {
                "code": "PASSWORD_VALIDATION_ERROR",
                "message": messages[0] if messages else "Enter a valid new password.",
            },
            status=400,
        )

    form.save()
    return JsonResponse(
        {
            "success": True,
            "redirect_url": "/auth-app/?flow=password-reset-complete",
        }
    )


@require_http_methods(["GET"])
def password_reset_done_view(request):
    return redirect("/auth-app/?flow=password-reset-sent")


@require_http_methods(["GET"])
def password_reset_complete_view(request):
    return redirect("/auth-app/?flow=password-reset-complete")


@csrf_protect
@require_http_methods(["GET", "POST"])
def login_view(request):
    """
    Handle user login with improved security and error handling.
    
    Features:
    - Supports both username and email login
    - Remember me functionality
    - IP address tracking
    - Secure session management
    - Proper error messages
    - Redirects authenticated users
    """
    # Redirect if already authenticated
    if request.user.is_authenticated:
        if _wants_json_login_response(request):
            return JsonResponse(
                {"success": True, "redirect_url": reverse("quiz_app:dashboard")}
            )
        return redirect("quiz_app:dashboard")

    if request.method == "POST":
        identifier = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        remember_me = request.POST.get("remember") == "on"
        
        # Validate input
        if not identifier:
            return _login_failure_response(
                request,
                "VALIDATION_ERROR",
                "Please enter your username or email.",
                400,
            )
        
        if not password:
            return _login_failure_response(
                request,
                "VALIDATION_ERROR",
                "Please enter your password.",
                400,
            )
        
        # Get user by username or email
        user_obj = None
        try:
            user_obj = User.get_by_email_or_username(identifier)
        except Exception as e:
            logger.warning(f"Error retrieving user {identifier}: {str(e)}")
            return _login_failure_response(
                request,
                "INVALID_CREDENTIALS",
                "Invalid username or password. Please try again.",
                401,
            )
        
        # Authenticate user
        user = None
        if user_obj:
            try:
                user = authenticate(
                    request,
                    username=user_obj.username,
                    password=password
                )
            except Exception as e:
                logger.warning(f"Authentication error for user {identifier}: {str(e)}")
                user = None
        
        if user is not None:
            # Check if user is active
            if not user.is_active:
                return _login_failure_response(
                    request,
                    "ACCOUNT_INACTIVE",
                    "Your account has been deactivated. Please contact an administrator."
                    ,
                    403,
                )
            
            # Log the user in
            login(request, user)
            
            # Update last login information
            try:
                ip_address = get_client_ip(request)
                if hasattr(user, "update_last_login"):
                    user.update_last_login(ip_address)
            except Exception as e:
                logger.error(f"Error updating last login for user {user.username}: {str(e)}")
            
            # Set session expiry based on remember me
            if remember_me:
                # 30 days in seconds
                request.session.set_expiry(2592000)
                request.session.setdefault('remember_me', True)
            else:
                request.session.set_expiry(settings.SESSION_COOKIE_AGE)
                request.session.setdefault('remember_me', False)
            
            # Log successful login
            logger.info(f"User {user.username} logged in successfully from IP {get_client_ip(request)}")
            
            # Redirect based on user role
            # Superadmins should use superadmin login, redirect them there
            if user.role == "superadmin":
                logout(request)
                if _wants_json_login_response(request):
                    return JsonResponse(
                        {
                            "code": "SUPERADMIN_LOGIN_REQUIRED",
                            "message": "Please use the superadmin login page.",
                            "redirect_url": reverse("quiz_app:superadmin_login"),
                        },
                        status=409,
                    )
                messages.warning(request, "Please use the superadmin login page.")
                return redirect("quiz_app:superadmin_login")
            
            # Redirect based on next parameter or default dashboard
            next_url = request.GET.get("next")
            redirect_url = None
            if next_url:
                # Security: Only redirect to same domain
                from django.utils.http import url_has_allowed_host_and_scheme
                if url_has_allowed_host_and_scheme(next_url, allowed_hosts=request.get_host()):
                    redirect_url = next_url

            if _wants_json_login_response(request):
                return JsonResponse(
                    {
                        "success": True,
                        "redirect_url": redirect_url or reverse("quiz_app:dashboard"),
                    }
                )

            if redirect_url:
                return redirect(redirect_url)
            
            messages.success(request, f"Welcome back, {user.full_name or user.username}!")
            return redirect("quiz_app:dashboard")
        else:
            # Log failed login attempt
            logger.warning(f"Failed login attempt for identifier: {identifier} from IP {get_client_ip(request)}")
            return _login_failure_response(
                request,
                "INVALID_CREDENTIALS",
                "Invalid username or password. Please try again.",
                401,
            )
    
    return _auth_app_redirect(request)


@login_required
@require_http_methods(["GET", "POST"])
def logout_view(request):
    """
    Handle user logout with proper session cleanup.
    
    Features:
    - Personalized logout message
    - Proper session cleanup
    - Security logging
    """
    if request.method == "POST":
        # Get user info before logout
        user = request.user
        user_name = getattr(user, "full_name", None) or user.username
        
        # Log logout
        logger.info(f"User {user.username} logged out from IP {get_client_ip(request)}")
        
        # Logout user
        logout(request)
        
        # Clear session data
        request.session.flush()
        
        messages.success(
            request,
            f"Goodbye, {user_name}! You have been successfully logged out."
        )
        return redirect("quiz_app:auth_core_app")
    
    # GET request - show logout confirmation or redirect
    # For security, we can require POST, but for better UX, we'll allow GET
    user = request.user
    user_name = getattr(user, "full_name", None) or user.username
    
    logout(request)
    request.session.flush()
    
    messages.success(
        request,
        f"Goodbye, {user_name}! You have been successfully logged out."
    )
    return redirect("quiz_app:auth_core_app")

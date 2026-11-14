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
from django.views.decorators.http import require_http_methods, require_POST
from django.views.decorators.csrf import csrf_protect
from django.conf import settings
from django.utils import timezone
from django.http import JsonResponse

from ..account_security import SafePasswordResetForm
from ..models import User
from ..rate_limiting import get_client_ip as trusted_client_ip
from ..rate_limiting import is_auth_rate_limited, record_auth_attempt

logger = logging.getLogger(__name__)


def get_client_ip(request):
    return trusted_client_ip(request)


def _wants_json_login_response(request):
    return "application/json" in request.headers.get("Accept", "").lower()


def _auth_app_redirect(request):
    next_url = request.GET.get("next")
    query = urlencode({"next": next_url}) if next_url else ""
    return redirect(f"/?{query}" if query else "/")


def _react_dashboard_url(user):
    return {
        "superadmin": "/app/superadmin/dashboard",
        "teacher": "/app/teacher/dashboard",
        "student": "/app/student/dashboard",
    }.get(user.role, "/app/admin/dashboard")


def _login_failure_response(request, code, message, status):
    if _wants_json_login_response(request):
        return JsonResponse({"code": code, "message": message}, status=status)

    messages.error(request, message)
    return _auth_app_redirect(request)


@csrf_protect
@require_http_methods(["GET", "POST"])
def password_reset_view(request):
    if request.method == "GET":
        return redirect("/?flow=password-reset")

    identifier = request.POST.get("email", "")
    if is_auth_rate_limited(request, "password_reset", identifier):
        return JsonResponse(
            {
                "code": "RATE_LIMITED",
                "message": "Too many password reset requests. Please try again later.",
            },
            status=429,
        )
    record_auth_attempt(request, "password_reset", identifier)

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
        return redirect(f"/?{query}")

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
        password_errors = form.errors.get("new_password2") or form.errors.get("new_password1")
        return JsonResponse(
            {
                "code": "PASSWORD_VALIDATION_ERROR",
                "message": password_errors[0] if password_errors else "Enter a valid new password.",
            },
            status=400,
        )

    form.save()
    return JsonResponse(
        {
            "success": True,
            "redirect_url": "/?flow=password-reset-complete",
        }
    )


@require_http_methods(["GET"])
def password_reset_done_view(request):
    return redirect("/?flow=password-reset-sent")


@require_http_methods(["GET"])
def password_reset_complete_view(request):
    return redirect("/?flow=password-reset-complete")


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
                {"success": True, "redirect_url": _react_dashboard_url(request.user)}
            )
        return redirect(_react_dashboard_url(request.user))

    if request.method == "POST":
        identifier = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        remember_me = request.POST.get("remember") == "on"

        if is_auth_rate_limited(request, "login", identifier):
            return _login_failure_response(
                request,
                "RATE_LIMITED",
                "Too many sign-in attempts. Please try again later.",
                429,
            )
        
        # Validate input
        if not identifier:
            record_auth_attempt(request, "login", identifier)
            return _login_failure_response(
                request,
                "VALIDATION_ERROR",
                "Please enter your username or email.",
                400,
            )
        
        if not password:
            record_auth_attempt(request, "login", identifier)
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
            record_auth_attempt(request, "login", identifier)
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
                record_auth_attempt(request, "login", identifier)
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
                        "redirect_url": redirect_url or _react_dashboard_url(user),
                    }
                )

            if redirect_url:
                return redirect(redirect_url)
            
            messages.success(request, f"Welcome back, {user.full_name or user.username}!")
            return redirect(_react_dashboard_url(user))
        else:
            # Log failed login attempt
            logger.warning(f"Failed login attempt for identifier: {identifier} from IP {get_client_ip(request)}")
            record_auth_attempt(request, "login", identifier)
            return _login_failure_response(
                request,
                "INVALID_CREDENTIALS",
                "Invalid username or password. Please try again.",
                401,
            )
    
    return _auth_app_redirect(request)


@login_required
@csrf_protect
@require_POST
def logout_view(request):
    """
    Handle user logout with proper session cleanup.
    
    Features:
    - Personalized logout message
    - Proper session cleanup
    - Security logging
    """
    user = request.user
    user_name = getattr(user, "full_name", None) or user.username
    logger.info(f"User {user.username} logged out from IP {get_client_ip(request)}")
    logout(request)
    request.session.flush()
    messages.success(
        request,
        f"Goodbye, {user_name}! You have been successfully logged out."
    )
    return redirect("quiz_app:auth_core_app")

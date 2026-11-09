"""
Superadmin authentication views.

Separate login/logout for superadmin users to keep them isolated from school users.
"""
import logging
from django.shortcuts import redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_protect
from django.conf import settings
from django.utils import timezone
from django.http import JsonResponse
from django.utils.http import url_has_allowed_host_and_scheme
from urllib.parse import urlencode

from ..models import User
from .auth import get_client_ip

logger = logging.getLogger(__name__)


def _wants_json_login_response(request):
    return "application/json" in request.headers.get("Accept", "").lower()


def _superadmin_login_failure_response(request, code, message, status, context=None):
    if _wants_json_login_response(request):
        return JsonResponse({"code": code, "message": message}, status=status)

    messages.error(request, message)
    return redirect("/auth-app/?portal=superadmin")


@csrf_protect
@require_http_methods(["GET", "POST"])
def superadmin_login_view(request):
    """
    Handle superadmin login with separate interface.
    
    Only allows users with role="superadmin" to login.
    Redirects to superadmin dashboard on success.
    """
    # Redirect if already authenticated
    if request.user.is_authenticated:
        if request.user.role == "superadmin":
            if _wants_json_login_response(request):
                return JsonResponse(
                    {
                        "success": True,
                        "redirect_url": "/app/superadmin/dashboard",
                    }
                )
            return redirect("/app/superadmin/dashboard")
        else:
            # If logged in as non-superadmin, logout first
            logout(request)
            if _wants_json_login_response(request):
                return JsonResponse(
                    {
                        "code": "SUPERADMIN_LOGIN_REQUIRED",
                        "message": "Please sign in with a superadministrator account.",
                    },
                    status=409,
                )
            messages.info(request, "Please login with superadmin credentials.")

    if request.method == "GET":
        query = {"portal": "superadmin"}
        next_url = request.GET.get("next")
        if next_url:
            query["next"] = next_url
        return redirect(f"/auth-app/?{urlencode(query)}")
    
    context = {}
    
    if request.method == "POST":
        identifier = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        remember_me = request.POST.get("remember") == "on"
        
        # Validate input
        if not identifier:
            return _superadmin_login_failure_response(
                request,
                "VALIDATION_ERROR",
                "Please enter your username or email.",
                400,
                context,
            )
        
        if not password:
            return _superadmin_login_failure_response(
                request,
                "VALIDATION_ERROR",
                "Please enter your password.",
                400,
                context,
            )
        
        # Get user by username or email
        user_obj = None
        try:
            user_obj = User.get_by_email_or_username(identifier)
        except Exception as e:
            logger.warning(f"Error retrieving user {identifier}: {str(e)}")
            return _superadmin_login_failure_response(
                request,
                "INVALID_CREDENTIALS",
                "Invalid username or password. Please try again.",
                401,
                context,
            )
        
        # Check if user is superadmin
        if not user_obj or user_obj.role != "superadmin":
            logger.warning(f"Non-superadmin attempt to access superadmin login: {identifier}")
            return _superadmin_login_failure_response(
                request,
                "SUPERADMIN_LOGIN_REQUIRED",
                "Access denied. This login is for superadministrators only.",
                403,
                context,
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
            # Double check role
            if user.role != "superadmin":
                return _superadmin_login_failure_response(
                    request,
                    "SUPERADMIN_LOGIN_REQUIRED",
                    "Access denied. This login is for superadministrators only.",
                    403,
                    context,
                )
            
            # Check if user is active
            if not user.is_active:
                return _superadmin_login_failure_response(
                    request,
                    "ACCOUNT_INACTIVE",
                    "Your account has been deactivated. Please contact system administrator.",
                    403,
                    context,
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
                request.session.set_expiry(2592000)  # 30 days
                request.session.setdefault('remember_me', True)
            else:
                request.session.set_expiry(settings.SESSION_COOKIE_AGE)
                request.session.setdefault('remember_me', False)
            
            # Mark as superadmin session
            request.session['is_superadmin'] = True
            
            # Log successful login
            logger.info(f"Superadmin {user.username} logged in successfully from IP {get_client_ip(request)}")
            
            # Redirect based on next parameter or default superadmin dashboard
            next_url = request.GET.get("next")
            redirect_url = None
            if next_url:
                if url_has_allowed_host_and_scheme(next_url, allowed_hosts=request.get_host()):
                    redirect_url = next_url

            if _wants_json_login_response(request):
                return JsonResponse(
                    {
                        "success": True,
                        "redirect_url": redirect_url or "/app/superadmin/dashboard",
                    }
                )

            if redirect_url:
                return redirect(redirect_url)
            
            messages.success(request, f"Welcome back, {user.full_name or user.username}!")
            return redirect("quiz_app:superadmin_dashboard")
        else:
            # Log failed login attempt
            logger.warning(f"Failed superadmin login attempt for identifier: {identifier} from IP {get_client_ip(request)}")
            if _wants_json_login_response(request):
                return _superadmin_login_failure_response(
                    request,
                    "INVALID_CREDENTIALS",
                    "Invalid username or password. Please try again.",
                    401,
                    context,
                )
            messages.error(request, "Invalid username or password. Please try again.")
    
    # GET request or failed POST - show login form
    return redirect("/auth-app/?portal=superadmin")


@login_required
@require_http_methods(["GET", "POST"])
def superadmin_logout_view(request):
    """
    Handle superadmin logout.
    """
    if request.user.role != "superadmin":
        messages.error(request, "Access denied.")
        return redirect("/auth-app/?portal=superadmin")
    
    if request.method == "POST":
        # Get user info before logout
        user = request.user
        user_name = getattr(user, "full_name", None) or user.username
        
        # Log logout
        logger.info(f"Superadmin {user.username} logged out from IP {get_client_ip(request)}")
        
        # Logout user
        logout(request)
        
        # Clear session data
        request.session.flush()
        
        messages.success(
            request,
            f"Goodbye, {user_name}! You have been successfully logged out."
        )
        return redirect("/auth-app/?portal=superadmin")
    
    # GET request - logout immediately
    user = request.user
    user_name = getattr(user, "full_name", None) or user.username
    
    logout(request)
    request.session.flush()
    
    messages.success(
        request,
        f"Goodbye, {user_name}! You have been successfully logged out."
    )
    return redirect("/auth-app/?portal=superadmin")



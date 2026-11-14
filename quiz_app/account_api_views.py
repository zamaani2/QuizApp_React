import json

from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from .rate_limiting import is_auth_rate_limited, record_auth_attempt


@require_POST
def change_password_api_view(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"code": "UNAUTHORIZED", "message": "Authentication required."},
            status=401,
        )

    if is_auth_rate_limited(request, "password_change", request.user.username):
        return JsonResponse(
            {"code": "RATE_LIMITED", "message": "Too many password change attempts. Try again later."},
            status=429,
        )

    try:
        data = json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"code": "VALIDATION_ERROR", "message": "Request body must be valid JSON."},
            status=400,
        )
    if not isinstance(data, dict):
        return JsonResponse(
            {"code": "VALIDATION_ERROR", "message": "Request body must be a JSON object."},
            status=400,
        )

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")
    if not isinstance(current_password, str) or not isinstance(new_password, str):
        return JsonResponse(
            {"code": "VALIDATION_ERROR", "message": "Enter valid password values."},
            status=400,
        )
    if not request.user.check_password(current_password):
        record_auth_attempt(request, "password_change", request.user.username)
        return JsonResponse(
            {
                "code": "INVALID_CURRENT_PASSWORD",
                "message": "Current password is incorrect.",
                "fields": {"current_password": ["Current password is incorrect."]},
            },
            status=400,
        )

    try:
        validate_password(new_password, user=request.user)
    except ValidationError as error:
        record_auth_attempt(request, "password_change", request.user.username)
        return JsonResponse(
            {
                "code": "WEAK_PASSWORD",
                "message": "Choose a stronger password.",
                "fields": {"new_password": error.messages},
            },
            status=400,
        )

    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    update_session_auth_hash(request, request.user)
    return JsonResponse({"success": True, "message": "Password changed successfully."})

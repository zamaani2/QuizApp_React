"""Role-based entry points for the React dashboards."""
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import redirect
from django.views.decorators.http import require_http_methods


@login_required
def dashboard_view(request):
    """Send each authenticated user to their React workspace."""
    app_routes = {
        "superadmin": "/app/superadmin/dashboard",
        "admin": "/app/admin/dashboard",
        "teacher": "/app/teacher/dashboard",
        "student": "/app/student/dashboard",
    }
    route = app_routes.get(request.user.role)
    if route:
        return redirect(route)

    messages.error(request, "Unknown user role. Please contact administrator.")
    return redirect("quiz_app:login")


@login_required
def admin_dashboard_view(request):
    """Redirect admins to the React dashboard while preserving role checks."""
    if request.user.role == "superadmin":
        return redirect("/app/superadmin/dashboard")
    if request.user.role != "admin":
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    if request.user.school is None:
        return HttpResponseForbidden("A valid school association is required.")
    return redirect("/app/admin/dashboard")


@login_required
def teacher_dashboard_view(request):
    """Redirect teachers to the React dashboard while preserving profile checks."""
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")

    if request.user.school is None:
        return HttpResponseForbidden("A valid school association is required.")
    if request.user.role == "teacher" and not request.user.teacher_profile:
        messages.error(request, "Teacher profile not found. Please contact administrator.")
        return redirect("quiz_app:dashboard")

    return redirect("/app/teacher/dashboard")


@login_required
def student_dashboard_view(request):
    """Redirect students to the React dashboard while preserving profile checks."""
    if request.user.role != "student":
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")

    student = request.user.student_profile
    if not student:
        messages.error(request, "Student profile not found. Please contact administrator.")
        return redirect("quiz_app:dashboard")

    school = request.user.school
    if school is None or student.school_id != school.pk:
        return HttpResponseForbidden("A valid school association is required.")
    return redirect("/app/student/dashboard")


@login_required
@require_http_methods(["POST"])
def extend_session_view(request):
    """Extend the authenticated user's session."""
    try:
        request.session.set_expiry(settings.SESSION_COOKIE_AGE)
        return JsonResponse({"success": True})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)})

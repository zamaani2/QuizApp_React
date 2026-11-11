"""GET redirects for grading pages. Writes live on /api/v1/teacher/grading/."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_http_methods

from ..models import QuizAttempt
from ..utils.legacy_api import legacy_write_gone


def _staff_or_dashboard(request):
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    if request.user.role == "teacher" and not request.user.teacher_profile:
        messages.error(request, "Teacher profile not found. Please contact administrator.")
        return redirect("quiz_app:dashboard")
    return None


@login_required
@require_http_methods(["GET"])
def quiz_grading_list_view(request):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    return redirect("/app/teacher/grading")


@login_required
@require_http_methods(["GET"])
def quiz_attempt_grading_view(request, attempt_id):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    school = request.user.school
    attempts = QuizAttempt.objects.filter(
        pk=attempt_id,
        quiz__school=school,
        student__school=school,
        school=school,
        is_submitted=True,
    )
    if request.user.role == "teacher":
        attempts = attempts.filter(quiz__teacher=request.user.teacher_profile)
    attempt = get_object_or_404(attempts)
    return redirect(f"/app/teacher/grading/{attempt.pk}")


@login_required
@require_http_methods(["GET", "POST"])
def quiz_response_grade_view(request, response_id):
    if request.method == "GET":
        return redirect("/app/teacher/grading")
    return legacy_write_gone(f"/api/v1/teacher/responses/{response_id}/grade/")


@login_required
@require_http_methods(["POST"])
def quiz_attempt_bulk_grade_view(request, attempt_id):
    return legacy_write_gone(f"/api/v1/teacher/grading/{attempt_id}/bulk/")

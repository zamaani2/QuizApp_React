"""GET redirects for quiz assignment pages. Writes live on /api/v1/teacher/quizzes/."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_http_methods

from ..models import Class, Quiz
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
def quiz_assignment_list_view(request, quiz_id):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    school = request.user.school
    if request.user.role == "teacher":
        quiz = get_object_or_404(Quiz, pk=quiz_id, teacher=request.user.teacher_profile, school=school)
    else:
        quiz = get_object_or_404(Quiz, pk=quiz_id, school=school)
    return redirect(f"/app/teacher/quizzes/{quiz.pk}/assignments")


@login_required
@require_http_methods(["POST"])
def quiz_assignment_create_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/assignments/")


@login_required
@require_http_methods(["POST"])
def quiz_assignment_delete_view(request, quiz_id, class_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/assignments/{class_id}/")


@login_required
@require_http_methods(["POST"])
def quiz_assignment_bulk_delete_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/assignments/bulk-delete/")


@login_required
@require_http_methods(["GET"])
def quiz_assignment_overview_view(request):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    return redirect("/app/teacher/quizzes")


@login_required
@require_http_methods(["GET"])
def class_quiz_list_view(request, class_id):
    if request.user.role not in ["teacher", "admin", "superadmin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    get_object_or_404(Class, pk=class_id, school=request.user.school)
    return redirect("/app/teacher/quizzes")

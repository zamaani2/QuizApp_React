"""GET redirects for retired quiz pages. Writes live on /api/v1/teacher/quizzes/."""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_http_methods

from ..models import AcademicYear, Quiz, Term
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
def quiz_list_view(request):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    return redirect("/app/teacher/quizzes")


@login_required
@require_http_methods(["POST"])
def quiz_create_view(request):
    return legacy_write_gone("/api/v1/teacher/quizzes/")


@login_required
@require_http_methods(["POST"])
def quiz_edit_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/")


@login_required
@require_http_methods(["POST"])
def quiz_delete_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/")


@login_required
@require_http_methods(["GET"])
def quiz_detail_view(request, quiz_id):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    school = request.user.school
    if request.user.role == "teacher":
        quiz = get_object_or_404(Quiz, pk=quiz_id, teacher=request.user.teacher_profile, school=school)
    else:
        quiz = get_object_or_404(Quiz, pk=quiz_id, school=school)
    return redirect(f"/app/teacher/quizzes/{quiz.pk}")


@login_required
@require_http_methods(["POST"])
def quiz_update_status_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/status/")


@login_required
@require_http_methods(["GET"])
def get_terms_for_academic_year_view(request):
    if request.user.role not in ["teacher", "admin"]:
        return JsonResponse({"error": "Permission denied"}, status=403)
    school = request.user.school
    academic_year_id = request.GET.get("academic_year_id")
    if not academic_year_id:
        return JsonResponse({"error": "Academic year ID is required."}, status=400)
    academic_year = get_object_or_404(AcademicYear, pk=academic_year_id, school=school)
    terms = Term.objects.filter(academic_year=academic_year, school=school).order_by("term_number")
    return JsonResponse({
        "success": True,
        "terms": [
            {"id": term.id, "name": term.get_term_number_display(), "term_number": term.term_number}
            for term in terms
        ],
    })

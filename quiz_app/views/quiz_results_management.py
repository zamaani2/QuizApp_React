"""
Quiz Results Management views for teachers.

This module provides views for managing quiz results including:
- Listing quiz results/attempts
- Viewing individual quiz results
- Redirecting legacy exports to the React results screen
- Printing individual result reports
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.http import require_http_methods
from django.db.models import OuterRef, Q, Subquery
from urllib.parse import urlencode

from ..models import (
    Quiz,
    QuizAttempt,
)


def _best_attempts_per_quiz_student(attempts):
    best_attempt_id = (
        attempts.filter(
            quiz_id=OuterRef("quiz_id"),
            student_id=OuterRef("student_id"),
        )
        .order_by("-score", "-percentage", "-submitted_at", "-pk")
        .values("pk")[:1]
    )
    return attempts.filter(pk=Subquery(best_attempt_id))


def _dashboard_url(user):
    return {
        "superadmin": "/app/superadmin/dashboard",
        "teacher": "/app/teacher/dashboard",
        "student": "/app/student/dashboard",
    }.get(user.role, "/app/admin/dashboard")


@login_required
@require_http_methods(["GET"])
def quiz_results_list_view(request):
    """
    Redirect the legacy results list to the React results screen.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect(_dashboard_url(request.user))
    
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect(_dashboard_url(request.user))
    return redirect("/app/teacher/results")


@login_required
@require_http_methods(["GET"])
def quiz_result_detail_view(request, attempt_id):
    """
    Display detailed view of a quiz result/attempt.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect(_dashboard_url(request.user))
    
    school = request.user.school
    attempts = QuizAttempt.objects.filter(
        pk=attempt_id,
        school=school,
        quiz__school=school,
        student__school=school,
        is_submitted=True,
    )
    if request.user.role == "teacher":
        teacher = request.user.teacher_profile
        if not teacher:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect(_dashboard_url(request.user))
        attempts = attempts.filter(quiz__teacher=teacher)
    attempt = get_object_or_404(attempts)

    if request.GET.get("print") == "1":
        return redirect(f"/app/teacher/results/{attempt.pk}/print")
    return redirect(f"/app/teacher/results/{attempt.pk}")


@login_required
@require_http_methods(["GET"])
def quiz_results_export_view(request):
    """
    Retire the legacy export in favor of the React results page.
    """
    return redirect("/app/teacher/results")


@login_required
@require_http_methods(["GET"])
def quiz_result_print_view(request, attempt_id):
    """
    Route individual quiz result printing through the React report.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect(_dashboard_url(request.user))
    
    school = request.user.school
    attempts_queryset = QuizAttempt.objects.filter(
        pk=attempt_id,
        school=school,
        quiz__school=school,
        student__school=school,
        is_submitted=True,
    )
    if request.user.role == "teacher":
        teacher = request.user.teacher_profile
        if not teacher:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect(_dashboard_url(request.user))
        attempts_queryset = attempts_queryset.filter(quiz__teacher=teacher)
    attempt = get_object_or_404(attempts_queryset)
    return redirect(f"/app/teacher/results/{attempt.pk}/print")


@login_required
@require_http_methods(["GET"])
def quiz_results_bulk_print_view(request):
    """
    Bulk print view for multiple quiz results.
    Allows teachers to print all student results at once.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect(_dashboard_url(request.user))
    
    school = request.user.school
    
    # Teachers see only their quizzes, admins see all quizzes in school
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect(_dashboard_url(request.user))
        teacher = request.user.teacher_profile
        teacher_quizzes = Quiz.objects.filter(teacher=teacher, school=school)
    else:
        # Admin sees all quizzes in their school
        teacher_quizzes = Quiz.objects.filter(school=school)
    
    # Get attempt IDs from query parameters
    attempt_ids = request.GET.getlist('attempt_ids')
    
    if not attempt_ids:
        # If no specific attempts selected, use filters from query params
        all_attempts = QuizAttempt.objects.filter(
            quiz__in=teacher_quizzes,
            school=school,
            quiz__school=school,
            student__school=school,
            is_submitted=True
        ).select_related('quiz', 'student', 'academic_year', 'term')
        
        # Apply filters
        quiz_filter = request.GET.get('quiz', '')
        if quiz_filter:
            all_attempts = all_attempts.filter(quiz_id=quiz_filter)
        
        academic_year_filter = request.GET.get('academic_year', '')
        if academic_year_filter:
            all_attempts = all_attempts.filter(academic_year_id=academic_year_filter)
        
        from ..models import StudentClass
        class_filter = request.GET.get('class', '')
        if class_filter:
            student_ids = StudentClass.objects.filter(
                assigned_class_id=class_filter,
                is_active=True,
                school=school
            ).values_list('student_id', flat=True)
            all_attempts = all_attempts.filter(student_id__in=student_ids)
        
        search_query = request.GET.get('search', '')
        if search_query:
            all_attempts = all_attempts.filter(
                Q(student__full_name__icontains=search_query) |
                Q(student__admission_number__icontains=search_query) |
                Q(quiz__title__icontains=search_query)
            )
        
        attempts_queryset = _best_attempts_per_quiz_student(all_attempts).select_related(
            "quiz", "student", "academic_year", "term"
        ).order_by("quiz__title", "student__full_name")
    else:
        # Get specific attempts
        attempts_queryset = QuizAttempt.objects.filter(
            id__in=attempt_ids,
            quiz__in=teacher_quizzes,
            school=school,
            quiz__school=school,
            student__school=school,
            is_submitted=True
        ).select_related('quiz', 'student', 'academic_year', 'term').order_by('quiz__title', 'student__full_name')
    
    selected_attempt_ids = list(attempts_queryset.values_list('pk', flat=True))
    if not selected_attempt_ids:
        messages.warning(request, "No results found to print.")
        return redirect("/app/teacher/results")

    query_string = urlencode(
        {'attempt_ids': selected_attempt_ids},
        doseq=True,
    )
    return redirect(f"/app/teacher/results/print/?{query_string}")

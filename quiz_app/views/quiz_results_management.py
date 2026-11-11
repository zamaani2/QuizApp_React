"""
Quiz Results Management views for teachers.

This module provides views for managing quiz results including:
- Listing quiz results/attempts
- Viewing individual quiz results
- Exporting results to Excel
- Printing individual result reports
"""
from django.shortcuts import redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from django.db.models import F, Q, Count, Avg, Max, Min, OuterRef, Prefetch, Subquery
from django.utils import timezone
from io import BytesIO
from urllib.parse import urlencode

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False

from ..models import (
    Quiz,
    QuizAttempt,
    QuizResponse,
    Teacher,
    AnswerChoice,
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


@login_required
@require_http_methods(["GET"])
def quiz_results_list_view(request):
    """
    Redirect the legacy results list to the React results screen.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect("quiz_app:dashboard")
    return redirect("/app/teacher/results")


@login_required
@require_http_methods(["GET"])
def quiz_result_detail_view(request, attempt_id):
    """
    Display detailed view of a quiz result/attempt.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
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
            return redirect("quiz_app:dashboard")
        attempts = attempts.filter(quiz__teacher=teacher)
    attempt = get_object_or_404(attempts)

    if request.GET.get("print") == "1":
        return redirect(f"/app/teacher/results/{attempt.pk}/print")
    return redirect(f"/app/teacher/results/{attempt.pk}")


@login_required
@require_http_methods(["GET"])
def quiz_results_export_view(request):
    """
    Export quiz results to Excel.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to perform this action.")
        return redirect("quiz_app:dashboard")
    
    if not OPENPYXL_AVAILABLE:
        messages.error(request, "Excel export requires openpyxl. Please install it.")
        return redirect("quiz_app:quiz_results_list")

    school = request.user.school
    quizzes = Quiz.objects.filter(school=school)
    if request.user.role == "teacher":
        teacher = request.user.teacher_profile
        if not teacher:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect("quiz_app:dashboard")
        quizzes = quizzes.filter(teacher=teacher)
    
    # Get filter parameters
    quiz_id = request.GET.get('quiz', '')
    academic_year_id = request.GET.get('academic_year', '')
    class_id = request.GET.get('class', '')
    
    # Build query - get all attempts first
    all_attempts = QuizAttempt.objects.filter(
        quiz__in=quizzes,
        school=school,
        quiz__school=school,
        student__school=school,
        is_submitted=True
    ).select_related('quiz', 'student', 'academic_year', 'term')
    
    if quiz_id:
        all_attempts = all_attempts.filter(quiz_id=quiz_id)
    if academic_year_id:
        all_attempts = all_attempts.filter(academic_year_id=academic_year_id)
    if class_id:
        from ..models import StudentClass
        student_ids = StudentClass.objects.filter(
            assigned_class_id=class_id,
            is_active=True,
            school=school
        ).values_list('student_id', flat=True)
        all_attempts = all_attempts.filter(student_id__in=student_ids)
    
    attempts = _best_attempts_per_quiz_student(all_attempts).select_related(
        "quiz", "quiz__subject", "student", "academic_year", "term"
    ).order_by("quiz__title", "student__full_name", "-submitted_at")
    
    # Create workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Quiz Results"
    
    # Define styles
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=12)
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Headers
    headers = [
        'Student Name',
        'Admission Number',
        'Quiz Title',
        'Subject',
        'Attempt #',
        'Score',
        'Total Marks',
        'Percentage',
        'Correct Answers',
        'Wrong Answers',
        'Unanswered',
        'Started At',
        'Submitted At',
        'Time Taken',
        'Academic Year',
        'Term',
    ]
    
    # Write headers
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = border
    
    # Write data
    for row_num, attempt in enumerate(attempts, 2):
        time_taken_str = ""
        if attempt.time_taken:
            total_seconds = int(attempt.time_taken.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            if hours > 0:
                time_taken_str = f"{hours}h {minutes}m {seconds}s"
            elif minutes > 0:
                time_taken_str = f"{minutes}m {seconds}s"
            else:
                time_taken_str = f"{seconds}s"
        
        row_data = [
            attempt.student.full_name,
            attempt.student.admission_number,
            attempt.quiz.title,
            attempt.quiz.subject.subject_name if attempt.quiz.subject else '',
            attempt.attempt_number,
            attempt.score,
            attempt.quiz.total_marks,
            attempt.percentage,
            attempt.correct_answers,
            attempt.wrong_answers,
            attempt.unanswered,
            attempt.started_at.strftime('%Y-%m-%d %H:%M:%S') if attempt.started_at else '',
            attempt.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if attempt.submitted_at else '',
            time_taken_str,
            attempt.academic_year.name if attempt.academic_year else '',
            (
                f"{attempt.academic_year.name} - Term {attempt.term.term_number}"
                if attempt.academic_year and attempt.term
                else ""
            ),
        ]
        
        for col_num, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_num, column=col_num, value=value)
            if isinstance(value, str):
                cell.data_type = "s"
            cell.border = border
            if col_num in [6, 7, 8]:  # Score, Total Marks, Percentage columns
                cell.alignment = Alignment(horizontal="center")
    
    # Auto-adjust column widths
    for col in ws.columns:
        max_length = 0
        column = col[0].column_letter
        for cell in col:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[column].width = adjusted_width
    
    # Create response
    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    filename = f"quiz_results_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    # Save workbook to response
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    response.write(output.getvalue())
    output.close()
    
    return response


@login_required
@require_http_methods(["GET"])
def quiz_result_print_view(request, attempt_id):
    """
    Route individual quiz result printing through the React report.
    """
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    
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
            return redirect("quiz_app:dashboard")
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
        return redirect("quiz_app:dashboard")
    
    school = request.user.school
    
    # Teachers see only their quizzes, admins see all quizzes in school
    if request.user.role == "teacher":
        if not request.user.teacher_profile:
            messages.error(request, "Teacher profile not found. Please contact administrator.")
            return redirect("quiz_app:dashboard")
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
        return redirect("quiz_app:quiz_results_list")

    query_string = urlencode(
        {'attempt_ids': selected_attempt_ids},
        doseq=True,
    )
    return redirect(f"/app/teacher/results/print/?{query_string}")

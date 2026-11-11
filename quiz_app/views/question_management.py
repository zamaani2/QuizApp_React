"""GET redirects and import templates. Question writes live on /api/v1/teacher/quizzes/."""
import csv

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.views.decorators.http import require_http_methods

from ..models import Quiz
from ..utils.legacy_api import legacy_write_gone


def _staff_or_dashboard(request):
    if request.user.role not in ["teacher", "admin"]:
        messages.error(request, "You don't have permission to access this page.")
        return redirect("quiz_app:dashboard")
    if request.user.role == "teacher" and not request.user.teacher_profile:
        messages.error(request, "Teacher profile not found. Please contact administrator.")
        return redirect("quiz_app:dashboard")
    return None


def _quiz_for_user(request, quiz_id):
    school = request.user.school
    filters = {"pk": quiz_id, "school": school}
    if request.user.role == "teacher":
        filters["teacher"] = request.user.teacher_profile
    return get_object_or_404(Quiz, **filters)


@login_required
@require_http_methods(["GET"])
def question_list_view(request, quiz_id):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    quiz = _quiz_for_user(request, quiz_id)
    return redirect(f"/app/teacher/quizzes/{quiz.pk}")


@login_required
@require_http_methods(["POST"])
def question_create_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/questions/")


@login_required
@require_http_methods(["POST"])
def question_edit_view(request, quiz_id, question_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/questions/{question_id}/")


@login_required
@require_http_methods(["POST"])
def question_delete_view(request, quiz_id, question_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/questions/{question_id}/")


@login_required
@require_http_methods(["POST"])
def question_reorder_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/questions/reorder/")


@login_required
@require_http_methods(["GET", "POST"])
def question_duplicate_view(request, quiz_id, question_id):
    if request.method == "GET":
        denied = _staff_or_dashboard(request)
        if denied:
            return denied
        quiz = _quiz_for_user(request, quiz_id)
        return redirect(f"/app/teacher/quizzes/{quiz.pk}")
    return legacy_write_gone(
        f"/api/v1/teacher/quizzes/{quiz_id}/questions/{question_id}/duplicate/"
    )


@login_required
@require_http_methods(["POST"])
def question_bulk_import_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/questions/import/")


@login_required
@require_http_methods(["POST"])
def question_bulk_delete_view(request, quiz_id):
    return legacy_write_gone(f"/api/v1/teacher/quizzes/{quiz_id}/questions/bulk-delete/")


@login_required
@require_http_methods(["GET"])
def question_import_template_view(request, quiz_id, format_type="csv"):
    denied = _staff_or_dashboard(request)
    if denied:
        return denied
    _quiz_for_user(request, quiz_id)
    headers = [
        "question_text", "question_type", "marks", "difficulty", "correct_answer",
        "choice1", "choice2", "choice3", "choice4", "choice5", "explanation",
    ]
    examples = [
        ["What is the capital of France?", "multiple_choice", "1", "easy", "3",
         "London", "Berlin", "Paris", "Madrid", "", "Paris is the capital and largest city of France."],
        ["Python is a programming language.", "true_false", "1", "easy", "true",
         "", "", "", "", "", "Python is indeed a programming language."],
        ["What is 2 + 2?", "short_answer", "1", "easy", "4",
         "", "", "", "", "", "The answer is 4."],
        ["The capital of England is _____.", "fill_blank", "1", "easy", "London",
         "", "", "", "", "", "London is the capital of England."],
    ]
    if format_type == "csv":
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="question_import_template.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow(headers)
        writer.writerows(examples)
        return response
    if format_type == "xlsx":
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Question Import Template"
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF")
        for col_idx, header in enumerate(headers, start=1):
            cell = sheet.cell(row=1, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
        for row_idx, example in enumerate(examples, start=2):
            for col_idx, value in enumerate(example, start=1):
                sheet.cell(row=row_idx, column=col_idx, value=value)
        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="question_import_template.xlsx"'
        workbook.save(response)
        return response
    messages.error(request, 'Invalid format type. Please use "csv" or "xlsx".')
    return redirect("quiz_app:quiz_detail", quiz_id=quiz_id)

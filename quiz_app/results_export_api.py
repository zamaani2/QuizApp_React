import csv
import tempfile
from io import StringIO

from django.db.models import Exists, OuterRef, Q, Subquery
from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import (
    AcademicYear,
    Class,
    Quiz,
    QuizAttempt,
    QuizResponse,
    StudentClass,
    TeacherSubjectAssignment,
    Term,
)
from .utils.tenant_utils import get_user_school

try:
    from openpyxl import Workbook
except ImportError:
    Workbook = None


EXPORT_COLUMNS = (
    ("admission_number", "Admission number"),
    ("student_name", "Student name"),
    ("class_name", "Class"),
    ("subject_name", "Subject"),
    ("quiz_title", "Quiz title"),
    ("score", "Total score"),
    ("total_marks", "Total marks"),
    ("attempt_number", "Attempt number"),
    ("status", "Status"),
    ("submitted_at", "Submitted at"),
    ("percentage", "Percentage"),
)


def _error(code, message, status):
    return JsonResponse({"code": code, "message": message}, status=status)


def parse_boolean_filter(request, name, default):
    value = request.GET.get(name)
    if value is None:
        return default
    if value in ("0", "1"):
        return value == "1"
    raise ValueError(f"{name} must be 0 or 1.")


def annotate_pending_essays(attempts, school):
    ungraded_essays = QuizResponse.objects.filter(
        attempt_id=OuterRef("pk"),
        school=school,
        question__school=school,
        question__quiz_id=OuterRef("quiz_id"),
        question__question_type="essay",
        is_graded=False,
    )
    return attempts.annotate(has_pending_essay=Exists(ungraded_essays))


def select_result_attempts(attempts, attempt_rule, include_pending):
    if include_pending:
        graded_attempts = attempts.filter(
            student_id=OuterRef("student_id"),
            quiz_id=OuterRef("quiz_id"),
            has_pending_essay=False,
        ).values("pk")[:1]
        eligible = attempts.annotate(
            has_graded_attempt=Exists(graded_attempts)
        ).filter(
            Q(has_pending_essay=False)
            | Q(has_pending_essay=True, has_graded_attempt=False)
        )
    else:
        eligible = attempts.filter(has_pending_essay=False)

    if attempt_rule == "best":
        chosen_attempt = (
            eligible.filter(
                student_id=OuterRef("student_id"),
                quiz_id=OuterRef("quiz_id"),
            )
            .order_by("-score", "-submitted_at", "-pk")
            .values("pk")[:1]
        )
    elif attempt_rule == "latest":
        chosen_attempt = (
            eligible.filter(
                student_id=OuterRef("student_id"),
                quiz_id=OuterRef("quiz_id"),
            )
            .order_by("-submitted_at", "-pk")
            .values("pk")[:1]
        )
    else:
        return eligible

    return eligible.filter(pk=Subquery(chosen_attempt))


def _safe_cell(value):
    if value is None:
        return ""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    if not isinstance(value, str) and str(value).startswith(("-", "=", "+", "@", "\t", "\r")):
        return "'" + str(value)
    return value


def _row_for_attempt(attempt, include_percentage):
    values = {
        "admission_number": attempt.student.admission_number or "",
        "student_name": attempt.student.full_name or "",
        "class_name": attempt.export_class_name or "Unassigned",
        "subject_name": attempt.quiz.subject.subject_name if attempt.quiz.subject else "",
        "quiz_title": attempt.quiz.title,
        "score": attempt.score,
        "total_marks": attempt.quiz.total_marks,
        "attempt_number": attempt.attempt_number,
        "status": "Pending grading" if attempt.has_pending_essay else "Submitted",
        "submitted_at": (
            timezone.localtime(attempt.submitted_at).strftime("%Y-%m-%d %H:%M:%S")
            if attempt.submitted_at
            else ""
        ),
        "percentage": attempt.percentage,
    }
    columns = EXPORT_COLUMNS if include_percentage else EXPORT_COLUMNS[:-1]
    return [_safe_cell(values[key]) for key, _ in columns]


def _csv_stream(attempts, include_percentage):
    columns = EXPORT_COLUMNS if include_percentage else EXPORT_COLUMNS[:-1]
    yield b"\xef\xbb\xbf"
    buffer = StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow([header for _, header in columns])
    yield buffer.getvalue().encode("utf-8")
    for attempt in attempts.iterator(chunk_size=2000):
        buffer.seek(0)
        buffer.truncate(0)
        writer.writerow(_row_for_attempt(attempt, include_percentage))
        yield buffer.getvalue().encode("utf-8")


def _temporary_file_stream(file_obj):
    try:
        while True:
            chunk = file_obj.read(64 * 1024)
            if not chunk:
                break
            yield chunk
    finally:
        file_obj.close()


def _xlsx_stream(attempts, include_percentage):
    columns = EXPORT_COLUMNS if include_percentage else EXPORT_COLUMNS[:-1]
    workbook = Workbook(write_only=True)
    worksheet = workbook.create_sheet("Quiz Results")
    worksheet.append([header for _, header in columns])
    for attempt in attempts.iterator(chunk_size=2000):
        worksheet.append(_row_for_attempt(attempt, include_percentage))

    output = tempfile.SpooledTemporaryFile(max_size=1024 * 1024, mode="w+b")
    workbook.save(output)
    output.seek(0)
    return _temporary_file_stream(output)


@require_http_methods(["GET"])
def teacher_results_export_api_view(request):
    user = request.user
    if not getattr(user, "is_authenticated", False):
        return _error("UNAUTHORIZED", "Authentication required.", 401)
    if getattr(user, "role", "") not in ("teacher", "admin"):
        return _error("FORBIDDEN", "Teacher or Admin role required.", 403)

    school = get_user_school(request)
    if school is None:
        return _error("FORBIDDEN", "A valid school association is required.", 403)

    if user.role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            return _error("FORBIDDEN", "Teacher profile not found.", 403)
        quizzes = Quiz.objects.filter(
            school=school,
            teacher=teacher,
            teacher__school=school,
            subject__school=school,
        )
        class_ids = TeacherSubjectAssignment.objects.filter(
            teacher=teacher,
            school=school,
            is_active=True,
            class_assigned__school=school,
            class_assigned__is_active=True,
        ).values_list("class_assigned_id", flat=True)
        classes = Class.objects.filter(
            school=school, is_active=True, pk__in=class_ids
        )
    else:
        quizzes = Quiz.objects.filter(
            school=school,
            teacher__school=school,
            subject__school=school,
        )
        classes = Class.objects.filter(school=school, is_active=True)

    quiz_id = request.GET.get("quiz_id", "").strip()
    if not quiz_id:
        return _error("VALIDATION_ERROR", "Select one quiz to export.", 400)
    if not quiz_id.isdecimal():
        return _error("VALIDATION_ERROR", "quiz_id must be a positive integer.", 400)
    quiz = quizzes.filter(pk=int(quiz_id)).select_related("subject").first()
    if quiz is None:
        return _error("NOT_FOUND", "Quiz not found.", 404)

    try:
        format_name = request.GET.get("format", "xlsx").lower()
        attempt_rule = request.GET.get("attempt", "best").lower()
        include_pending = parse_boolean_filter(request, "include_pending", False)
        include_percentage = parse_boolean_filter(request, "include_percentage", False)
    except ValueError as exc:
        return _error("VALIDATION_ERROR", str(exc), 400)
    if format_name not in ("csv", "xlsx"):
        return _error("VALIDATION_ERROR", "format must be csv or xlsx.", 400)
    if attempt_rule not in ("best", "latest", "all"):
        return _error("VALIDATION_ERROR", "attempt must be best, latest, or all.", 400)
    if format_name == "xlsx" and Workbook is None:
        return _error("EXPORT_UNAVAILABLE", "Excel export requires openpyxl.", 503)

    class_id = request.GET.get("class_id", "").strip()
    if class_id:
        if not class_id.isdecimal() or not classes.filter(pk=int(class_id)).exists():
            return _error("FORBIDDEN", "The selected class is outside your access scope.", 403)

    academic_year_id = request.GET.get("academic_year_id", "").strip()
    if academic_year_id:
        if not academic_year_id.isdecimal() or not AcademicYear.objects.filter(
            pk=int(academic_year_id), school=school
        ).exists():
            return _error("NOT_FOUND", "Academic year not found in this school.", 404)

    term_id = request.GET.get("term_id", "").strip()
    if term_id:
        terms = Term.objects.filter(school=school, academic_year__school=school)
        if academic_year_id:
            terms = terms.filter(academic_year_id=int(academic_year_id))
        if not term_id.isdecimal() or not terms.filter(pk=int(term_id)).exists():
            return _error("NOT_FOUND", "Term not found in the selected school and year.", 404)

    attempts = annotate_pending_essays(
        QuizAttempt.objects.filter(
            quiz=quiz,
            school=school,
            quiz__school=school,
            quiz__teacher__school=school,
            quiz__subject__school=school,
            student__school=school,
            is_submitted=True,
        ).filter(
            Q(academic_year__isnull=True) | Q(academic_year__school=school),
            Q(term__isnull=True)
            | Q(term__school=school, term__academic_year__school=school),
        ),
        school,
    )
    if class_id:
        attempts = attempts.filter(
            student__studentclass__assigned_class_id=int(class_id),
            student__studentclass__is_active=True,
            student__studentclass__school=school,
            student__studentclass__assigned_class__school=school,
        )
    if academic_year_id:
        attempts = attempts.filter(
            academic_year_id=int(academic_year_id),
            academic_year__school=school,
        )
    if term_id:
        attempts = attempts.filter(term_id=int(term_id), term__school=school)
    attempts = attempts.distinct()
    skipped_pending_count = attempts.filter(has_pending_essay=True).count()

    attempts = select_result_attempts(attempts, attempt_rule, include_pending)

    current_enrollment = StudentClass.objects.filter(
        student_id=OuterRef("student_id"),
        school=school,
        student__school=school,
        is_active=True,
        assigned_class__school=school,
    ).select_related("assigned_class").order_by("-date_assigned", "-pk")
    attempts = attempts.annotate(
        export_class_name=Subquery(current_enrollment.values("assigned_class__name")[:1])
    ).select_related(
        "student",
        "quiz",
        "quiz__subject",
    ).order_by("student__full_name", "student__admission_number", "-submitted_at")

    response_timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
    filename = f"quiz_results_{quiz.pk}_{response_timestamp}.{format_name}"
    if format_name == "csv":
        response = StreamingHttpResponse(
            _csv_stream(attempts, include_percentage),
            content_type="text/csv; charset=utf-8",
        )
    else:
        response = StreamingHttpResponse(
            _xlsx_stream(attempts, include_percentage),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-Skipped-Pending-Count"] = str(
        skipped_pending_count if not include_pending else 0
    )
    response["Cache-Control"] = "no-store"
    return response

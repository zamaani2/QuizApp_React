import json

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from .models import Question
from .services.assessment_management import (
    AssessmentConflict,
    MAX_IMPORT_FILE_SIZE,
    assign_classes,
    assign_questions,
    bulk_delete_questions,
    bulk_grade_attempt,
    bulk_unassign_classes,
    delete_question,
    delete_question_group,
    delete_quiz,
    delete_quiz_section,
    duplicate_question,
    get_staff_school,
    grade_response,
    import_questions,
    reorder_quiz_sections,
    reorder_question_groups,
    reorder_questions,
    save_question_group,
    release_quiz_results,
    save_question,
    save_quiz,
    save_quiz_section,
    unassign_class,
    update_quiz_status,
    writable_quiz,
)


def _error(code, message, status, fields=None):
    result = {"code": code, "message": message}
    if fields:
        result["fields"] = fields
    return JsonResponse(result, status=status)


def _data(request):
    if request.content_type and "application/json" in request.content_type:
        try:
            data = json.loads(request.body or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValidationError({"body": ["Request body must be valid JSON."]}) from error
        if not isinstance(data, dict):
            raise ValidationError({"body": ["Request body must be a JSON object."]})
        return data
    payload = {key: request.POST.get(key) for key in request.POST}
    for key in request.POST:
        values = request.POST.getlist(key)
        if len(values) > 1:
            payload[key] = values
    return payload


def _staff(request):
    if not getattr(request.user, "is_authenticated", False):
        return None, _error("UNAUTHORIZED", "Authentication required.", 401)
    try:
        return get_staff_school(request.user), None
    except PermissionDenied as error:
        return None, _error("FORBIDDEN", str(error), 403)


def _validation_error(error):
    if hasattr(error, "message_dict"):
        fields = error.message_dict
        message = next(iter(error.messages), "Please correct the highlighted fields.")
    else:
        fields = {"non_field_errors": error.messages}
        message = "; ".join(error.messages)
    return _error("VALIDATION_ERROR", message, 400, fields)


def _handle(action):
    try:
        return action()
    except AssessmentConflict as error:
        return _error(error.code, error.message, 409, error.fields)
    except ValidationError as error:
        return _validation_error(error)
    except Http404:
        return _error("NOT_FOUND", "Resource not found.", 404)
    except PermissionDenied as error:
        return _error("FORBIDDEN", str(error), 403)


@require_http_methods(["GET", "POST"])
def teacher_quizzes_collection_api_view(request):
    if request.method == "GET":
        from .api_views import teacher_quizzes_api_view
        return teacher_quizzes_api_view(request)
    school, denied = _staff(request)
    if denied:
        return denied

    def create():
        with transaction.atomic():
            quiz = save_quiz(request.user, school, _data(request))
        return JsonResponse({
            "success": True,
            "id": quiz.pk,
            "quiz_id": quiz.pk,
            "message": "Quiz created successfully.",
        }, status=201)

    return _handle(create)


@require_http_methods(["GET", "PATCH", "DELETE"])
def teacher_quiz_detail_write_api_view(request, quiz_id):
    if request.method == "GET":
        from .api_views import teacher_quiz_detail_api_view
        return teacher_quiz_detail_api_view(request, quiz_id)
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            if request.method == "DELETE":
                title = delete_quiz(quiz, school)
                return JsonResponse({"success": True, "message": f'Quiz "{title}" deleted successfully.'})
            quiz = save_quiz(request.user, school, _data(request), quiz)
        return JsonResponse({
            "success": True,
            "id": quiz.pk,
            "quiz_id": quiz.pk,
            "message": "Quiz updated successfully.",
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_quiz_status_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            quiz = update_quiz_status(quiz, data.get("status"))
        return JsonResponse({
            "success": True,
            "status": quiz.status,
            "message": f"Quiz status updated to {quiz.status}.",
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_quiz_results_release_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def release():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            quiz = release_quiz_results(quiz)
        return JsonResponse({
            "success": True,
            "results_released_at": quiz.results_released_at.isoformat(),
            "message": "Quiz results released to students.",
        })

    return _handle(release)


@require_http_methods(["POST"])
def teacher_question_create_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            question = save_question(quiz, school, _data(request))
        return JsonResponse({
            "success": True,
            "question_id": question.pk,
            "message": "Question created successfully.",
        }, status=201)

    return _handle(mutate)


@require_http_methods(["PATCH", "DELETE"])
def teacher_question_detail_api_view(request, quiz_id, question_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            if request.method == "DELETE":
                delete_question(quiz, school, question_id)
                return JsonResponse({"success": True, "message": "Question deleted successfully."})
            question = get_object_or_404(Question, pk=question_id, quiz=quiz, school=school)
            question = save_question(quiz, school, _data(request), question)
        return JsonResponse({
            "success": True,
            "question_id": question.pk,
            "message": "Question updated successfully.",
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_question_duplicate_api_view(request, quiz_id, question_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            question = get_object_or_404(Question, pk=question_id, quiz=quiz, school=school)
            new_question = duplicate_question(quiz, school, question)
        return JsonResponse({
            "success": True,
            "question_id": new_question.pk,
            "message": "Question duplicated successfully.",
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_question_reorder_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        ordered = data.get("question_ids") or data.get("question_orders") or []
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            reorder_questions(quiz, school, ordered)
        return JsonResponse({"success": True, "message": "Questions reordered successfully."})

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_question_bulk_delete_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            count = bulk_delete_questions(quiz, school, data.get("question_ids") or [])
        return JsonResponse({
            "success": True,
            "message": f"{count} question(s) deleted successfully.",
        })

    return _handle(mutate)


def _section_payload(section):
    return {
        "id": section.pk,
        "title": section.title,
        "instructions": section.instructions,
        "order": section.order,
        "time_limit_minutes": section.time_limit_minutes,
        "choose_n": section.choose_n,
        "question_ids": list(
            section.questions.filter(school_id=section.school_id)
            .order_by("order", "pk")
            .values_list("pk", flat=True)
        ),
        "groups": [
            {
                "id": group.pk,
                "title": group.title,
                "stimulus_text": group.stimulus_text,
                "order": group.order,
            }
            for group in section.groups.filter(school_id=section.school_id)
        ],
    }


@require_http_methods(["GET", "POST"])
def teacher_quiz_sections_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=request.method == "POST")
            if request.method == "GET":
                sections = quiz.sections.filter(school=school).prefetch_related(
                    "groups", "questions"
                )
                return JsonResponse({"sections": [_section_payload(item) for item in sections]})
            section = save_quiz_section(quiz, school, _data(request))
        return JsonResponse({
            "success": True,
            "section": _section_payload(section),
        }, status=201)

    return _handle(mutate)


@require_http_methods(["PATCH", "DELETE"])
def teacher_quiz_section_detail_api_view(request, quiz_id, section_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            section = get_object_or_404(
                quiz.sections.select_for_update(), pk=section_id, school=school
            )
            if request.method == "DELETE":
                delete_quiz_section(quiz, school, section.pk)
                return JsonResponse({"success": True})
            section = save_quiz_section(quiz, school, _data(request), section)
        return JsonResponse({"success": True, "section": _section_payload(section)})

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_quiz_sections_reorder_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            reorder_quiz_sections(quiz, school, data.get("section_ids") or [])
        return JsonResponse({"success": True})

    return _handle(mutate)


@require_http_methods(["GET", "POST"])
def teacher_quiz_groups_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=request.method == "POST")
            if request.method == "GET":
                groups = quiz.question_groups.filter(school=school).order_by(
                    "section__order", "order", "pk"
                )
                return JsonResponse({
                    "groups": [
                        {
                            "id": group.pk,
                            "section_id": group.section_id,
                            "title": group.title,
                            "stimulus_text": group.stimulus_text,
                            "order": group.order,
                        }
                        for group in groups
                    ]
                })
            group = save_question_group(quiz, school, _data(request))
        return JsonResponse({
            "success": True,
            "group": {
                "id": group.pk,
                "section_id": group.section_id,
                "title": group.title,
                "stimulus_text": group.stimulus_text,
                "order": group.order,
            },
        }, status=201)

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_quiz_groups_reorder_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            reorder_question_groups(
                quiz, school, data.get("section_id"), data.get("group_ids") or []
            )
        return JsonResponse({"success": True})

    return _handle(mutate)


@require_http_methods(["PATCH", "DELETE"])
def teacher_quiz_group_detail_api_view(request, quiz_id, group_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            group = get_object_or_404(
                quiz.question_groups.select_for_update(), pk=group_id, school=school
            )
            if request.method == "DELETE":
                delete_question_group(quiz, school, group.pk)
                return JsonResponse({"success": True})
            group = save_question_group(quiz, school, _data(request), group)
        return JsonResponse({
            "success": True,
            "group": {
                "id": group.pk,
                "section_id": group.section_id,
                "title": group.title,
                "stimulus_text": group.stimulus_text,
                "order": group.order,
            },
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_question_assignment_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            questions = assign_questions(quiz, school, _data(request))
        return JsonResponse({"success": True, "assigned_count": len(questions)})

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_question_import_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied
    upload = request.FILES.get("import_file") or request.FILES.get("file")
    if upload is not None and upload.size > MAX_IMPORT_FILE_SIZE:
        return _error("PAYLOAD_TOO_LARGE", "File exceeds the 5 MB import limit.", 413)

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            imported, errors = import_questions(quiz, school, upload)
        message = f"Successfully imported {imported} question(s)." if imported else "No questions were imported."
        return JsonResponse({
            "success": True,
            "complete": not errors,
            "partial_success": bool(imported and errors),
            "imported": imported,
            "errors": errors,
            "error_count": len(errors),
            "message": message,
        })

    return _handle(mutate)


@require_http_methods(["GET", "POST"])
def teacher_quiz_assignments_write_api_view(request, quiz_id):
    if request.method == "GET":
        from .api_views import teacher_quiz_assignments_api_view
        return teacher_quiz_assignments_api_view(request, quiz_id)
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        class_ids = data.get("class_ids") or data.get("classes") or []
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            count = assign_classes(request.user, quiz, school, class_ids)
        return JsonResponse({
            "success": True,
            "assigned_count": count,
            "message": f"Successfully assigned {count} class(es) to the quiz.",
        })

    return _handle(mutate)


@require_http_methods(["DELETE"])
def teacher_quiz_assignment_delete_api_view(request, quiz_id, class_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            class_obj = unassign_class(quiz, school, class_id)
        return JsonResponse({
            "success": True,
            "message": f'Class "{class_obj.name}" has been unassigned from the quiz.',
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_quiz_assignment_bulk_delete_api_view(request, quiz_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        with transaction.atomic():
            quiz = writable_quiz(request.user, school, quiz_id, lock=True)
            count = bulk_unassign_classes(quiz, school, data.get("class_ids") or [])
        return JsonResponse({
            "success": True,
            "message": f"{count} class(es) unassigned successfully.",
        })

    return _handle(mutate)


@require_http_methods(["GET", "POST"])
def teacher_grading_detail_write_api_view(request, attempt_id):
    if request.method == "GET":
        from .api_views import teacher_grading_detail_api_view
        return teacher_grading_detail_api_view(request, attempt_id)
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        response, all_graded = grade_response(
            request.user,
            school,
            data.get("response_id"),
            data.get("marks_awarded"),
            data.get("grading_notes") or "",
        )
        return JsonResponse({
            "success": True,
            "message": "Response graded successfully.",
            "marks_awarded": response.marks_awarded,
            "all_graded": all_graded,
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_grading_bulk_api_view(request, attempt_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        graded_count, errors, all_graded = bulk_grade_attempt(
            request.user, school, attempt_id, data.get("grades") or []
        )
        message = f"{graded_count} response(s) graded successfully."
        if errors:
            message += f" {len(errors)} error(s) occurred."
        return JsonResponse({
            "success": True,
            "message": message,
            "graded_count": graded_count,
            "errors": errors,
            "all_graded": all_graded,
        })

    return _handle(mutate)


@require_http_methods(["POST"])
def teacher_response_grade_api_view(request, response_id):
    school, denied = _staff(request)
    if denied:
        return denied

    def mutate():
        data = _data(request)
        response, all_graded = grade_response(
            request.user,
            school,
            response_id,
            data.get("marks_awarded"),
            data.get("grading_notes") or "",
        )
        return JsonResponse({
            "success": True,
            "message": "Response graded successfully.",
            "marks_awarded": response.marks_awarded,
            "all_graded": all_graded,
        })

    return _handle(mutate)

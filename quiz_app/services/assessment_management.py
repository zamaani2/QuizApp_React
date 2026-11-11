import csv
import io
import json
from datetime import datetime
from itertools import islice

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import F, Max, Q
from django.db.models.deletion import ProtectedError
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone

from ..models import (
    AcademicYear,
    AnswerChoice,
    Class,
    Question,
    Quiz,
    QuizAttempt,
    QuizCategory,
    QuestionGroup,
    QuizSection,
    QuizResponse,
    Subject,
    Teacher,
    TeacherSubjectAssignment,
    Term,
)

MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_IMPORT_COLUMNS = 64
VALID_QUESTION_TYPES = [
    "multiple_choice",
    "true_false",
    "short_answer",
    "fill_blank",
    "matching",
    "ordering",
    "essay",
]


class AssessmentConflict(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _int(value, field, default=None, required=False):
    if value in (None, ""):
        if required:
            raise ValidationError({field: ["This field is required."]})
        return default
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValidationError({field: ["Enter a valid integer."]}) from error


def _float(value, field, default=0.0):
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise ValidationError({field: ["Enter a valid number."]}) from error


def _flag(data, key, default=False):
    if key not in data:
        return default
    value = data[key]
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"on", "true", "1", "yes"}


def _text(data, key, default=""):
    value = data.get(key, default)
    if value is None:
        return default
    return str(value).strip()


def _ids(value):
    if value in (None, ""):
        return []
    if isinstance(value, (list, tuple)):
        raw = value
    else:
        raw = [value]
    try:
        return [int(item) for item in raw if item not in (None, "")]
    except (TypeError, ValueError) as error:
        raise ValidationError({"ids": ["IDs must be integers."]}) from error


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return timezone.make_aware(value) if timezone.is_naive(value) else value
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = datetime.strptime(text, "%Y-%m-%dT%H:%M")
        except ValueError:
            return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed)
    return parsed


def writable_quiz(user, school, quiz_id, lock=False):
    quizzes = Quiz.objects.filter(pk=quiz_id, school=school)
    if lock:
        quizzes = quizzes.select_for_update()
    if user.role == "teacher":
        teacher = getattr(user, "teacher_profile", None)
        if not teacher:
            raise Http404("Quiz not found.")
        quizzes = quizzes.filter(teacher=teacher)
    quiz = quizzes.first()
    if quiz is None:
        raise Http404("Quiz not found.")
    return quiz


def get_staff_school(user):
    if getattr(user, "role", None) not in {"teacher", "admin"}:
        raise PermissionDenied("Teacher or Admin role required.")
    school = getattr(user, "school", None)
    if school is None:
        raise PermissionDenied("A valid school association is required.")
    if user.role == "teacher" and not getattr(user, "teacher_profile", None):
        raise PermissionDenied("Teacher profile not found.")
    return school


def _classes_for_ids(school, class_ids):
    classes = Class.objects.filter(pk__in=class_ids, school=school)
    if len(set(class_ids)) != classes.count():
        raise ValidationError({"classes": ["One or more selected classes are invalid."]})
    return classes


def _academic_context(school, data):
    academic_year_id = data.get("academic_year") or data.get("academic_year_id")
    term_id = data.get("term") or data.get("term_id")
    if term_id and not academic_year_id:
        raise ValidationError({"academic_year": ["Select an academic year for the selected term."]})
    academic_year = None
    term = None
    if academic_year_id:
        academic_year = AcademicYear.objects.filter(pk=academic_year_id, school=school).first()
        if academic_year is None:
            raise ValidationError({"academic_year": ["Invalid academic year selected."]})
        if term_id:
            term = Term.objects.filter(pk=term_id, academic_year=academic_year, school=school).first()
            if term is None:
                raise ValidationError({"term": ["Invalid term selected."]})
    return academic_year, term


def _teacher_for_quiz(user, school, data, existing=None):
    if user.role == "admin":
        teacher_id = data.get("teacher") or data.get("teacher_id")
        if existing and not teacher_id:
            return existing.teacher
        if not teacher_id:
            raise ValidationError({"teacher": ["Teacher is required."]})
        teacher = Teacher.objects.filter(pk=teacher_id, school=school).first()
        if teacher is None:
            raise ValidationError({"teacher": ["Invalid teacher selected."]})
        return teacher
    return user.teacher_profile


def _subject_for_quiz(user, school, teacher, data, existing=None):
    subject_id = data.get("subject") or data.get("subject_id")
    if existing and not subject_id:
        return existing.subject
    if not subject_id:
        raise ValidationError({"subject": ["Subject is required."]})
    subject = Subject.objects.filter(pk=subject_id, school=school).first()
    if subject is None:
        raise ValidationError({"subject": ["Invalid subject selected."]})
    if user.role == "teacher" and (existing is None or subject.pk != existing.subject_id):
        assigned = TeacherSubjectAssignment.objects.filter(
            teacher=teacher, subject=subject, school=school, is_active=True
        ).exists()
        if not assigned:
            raise ValidationError({
                "subject": [f'You are not assigned to teach "{subject.subject_name}".']
            })
    return subject


def save_quiz(user, school, data, quiz=None):
    title = _text(data, "title")
    if not title:
        raise ValidationError({"title": ["Quiz title is required."]})
    teacher = _teacher_for_quiz(user, school, data, quiz)
    subject = _subject_for_quiz(user, school, teacher, data, quiz)
    category = None
    category_id = data.get("category") or data.get("category_id") or None
    if category_id:
        category = QuizCategory.objects.filter(pk=category_id, school=school).first()
        if category is None:
            raise ValidationError({"category": ["Invalid category selected."]})
    class_ids = _ids(data.get("classes") or data.get("class_ids"))
    classes = _classes_for_ids(school, class_ids) if class_ids else Class.objects.none()
    academic_year, term = _academic_context(school, data)
    status = _text(data, "status", quiz.status if quiz else "draft") or "draft"
    if status not in {"draft", "published", "archived"}:
        raise ValidationError({"status": ["Invalid status."]})
    difficulty = _text(data, "difficulty", quiz.difficulty if quiz else "medium") or "medium"
    if quiz is None:
        quiz = Quiz(school=school, quiz_id=f"QZ-{school.id:03d}{Quiz.objects.filter(school=school).count() + 1:05d}")
    quiz.title = title
    quiz.description = _text(data, "description") or None
    quiz.instructions = _text(data, "instructions") or None
    quiz.subject = subject
    quiz.category = category
    quiz.teacher = teacher
    quiz.academic_year = academic_year
    quiz.term = term
    quiz.difficulty = difficulty
    quiz.status = status
    quiz.time_limit = _int(data.get("time_limit"), "time_limit", 0) or 0
    quiz.passing_marks = _int(data.get("passing_marks"), "passing_marks", 0) or 0
    quiz.max_attempts = _int(data.get("max_attempts"), "max_attempts", 1) or 1
    quiz.available_from = _parse_datetime(data.get("available_from"))
    quiz.available_until = _parse_datetime(data.get("available_until"))
    quiz.randomize_questions = _flag(data, "randomize_questions")
    quiz.randomize_answers = _flag(data, "randomize_answers")
    quiz.show_results_immediately = _flag(data, "show_results_immediately")
    quiz.show_correct_answers = _flag(data, "show_correct_answers")
    quiz.allow_review = _flag(data, "allow_review", True if quiz is None else quiz.allow_review)
    quiz.require_password = _flag(data, "require_password")
    quiz.quiz_password = _text(data, "quiz_password") or None
    quiz.save()
    quiz.classes.set(classes)
    return quiz


def _validate_quiz_sections(quiz):
    for section in quiz.sections.filter(school_id=quiz.school_id):
        if section.choose_n is None:
            continue
        questions = Question.objects.filter(
            quiz=quiz, school_id=quiz.school_id, section=section
        )
        count = questions.count()
        if section.choose_n > count:
            raise ValidationError({
                "choose_n": ["Choose-N cannot exceed the number of questions in this section."]
            })
        if questions.values_list("marks", flat=True).distinct().count() > 1:
            raise ValidationError({
                "choose_n": ["All questions in a Choose-N section must have equal marks."]
            })


def save_quiz_section(quiz, school, data, section=None):
    title = _text(data, "title", section.title if section else "")
    if not title:
        raise ValidationError({"title": ["Section title is required."]})
    if section is None:
        order = _int(
            data.get("order"),
            "order",
            (quiz.sections.aggregate(max_order=Max("order"))["max_order"] or 0) + 1,
        )
        section = QuizSection(quiz=quiz, school=school)
    else:
        order = _int(data.get("order"), "order", section.order)
    if order < 1:
        raise ValidationError({"order": ["Section order must be a positive integer."]})
    section.title = title
    section.instructions = _text(data, "instructions", section.instructions if section.pk else "")
    section.order = order
    for name in ("time_limit_minutes", "choose_n"):
        if name not in data:
            continue
        value = data.get(name)
        if value in (None, ""):
            setattr(section, name, None)
        else:
            parsed = _int(value, name, required=True)
            if parsed < 1:
                raise ValidationError({name: ["Enter a positive integer or leave this field empty."]})
            setattr(section, name, parsed)
    section.full_clean()
    section.save()
    _validate_quiz_sections(quiz)
    quiz.calculate_total_marks()
    return section


def delete_quiz_section(quiz, school, section_id):
    section = get_object_or_404(
        QuizSection.objects.select_for_update(), pk=section_id, quiz=quiz, school=school
    )
    section.delete()
    quiz.calculate_total_marks()


def reorder_quiz_sections(quiz, school, section_ids):
    ids = _ids(section_ids)
    if len(ids) != len(set(ids)):
        raise ValidationError({"section_ids": ["Section IDs must be unique."]})
    valid = set(
        quiz.sections.filter(school=school, pk__in=ids).values_list("pk", flat=True)
    )
    if valid != set(ids) or len(ids) != quiz.sections.filter(school=school).count():
        raise ValidationError({"section_ids": ["Provide every section in this quiz exactly once."]})
    for index, section_id in enumerate(ids, start=1):
        QuizSection.objects.filter(pk=section_id, quiz=quiz, school=school).update(order=index)


def save_question_group(quiz, school, data, group=None):
    title = _text(data, "title", group.title if group else "")
    if not title:
        raise ValidationError({"title": ["Group title is required."]})
    section_id = data.get("section_id", group.section_id if group else None)
    section = None
    if section_id not in (None, ""):
        section = QuizSection.objects.filter(
            pk=section_id, quiz=quiz, school=school
        ).first()
        if section is None:
            raise ValidationError({"section_id": ["Section does not belong to this quiz."]})
    order = _int(
        data.get("order"),
        "order",
        group.order if group else (
            quiz.question_groups.filter(section=section).aggregate(max_order=Max("order"))["max_order"] or 0
        ) + 1,
    )
    if order < 1:
        raise ValidationError({"order": ["Group order must be a positive integer."]})
    if group is None:
        group = QuestionGroup(quiz=quiz, school=school)
    group.title = title
    group.section = section
    group.stimulus_text = _text(data, "stimulus_text", group.stimulus_text if group.pk else "")
    group.order = order
    group.full_clean()
    group.save()
    return group


def delete_question_group(quiz, school, group_id):
    group = get_object_or_404(
        QuestionGroup.objects.select_for_update(), pk=group_id, quiz=quiz, school=school
    )
    group.delete()


def reorder_question_groups(quiz, school, section_id, group_ids):
    section = None
    if section_id not in (None, ""):
        section = QuizSection.objects.filter(
            pk=section_id, quiz=quiz, school=school
        ).first()
        if section is None:
            raise ValidationError({"section_id": ["Section does not belong to this quiz."]})
    ids = _ids(group_ids)
    if len(ids) != len(set(ids)):
        raise ValidationError({"group_ids": ["Group IDs must be unique."]})
    groups = quiz.question_groups.filter(school=school, section=section)
    valid = set(groups.filter(pk__in=ids).values_list("pk", flat=True))
    if valid != set(ids) or len(ids) != groups.count():
        raise ValidationError({"group_ids": ["Provide every group in this section exactly once."]})
    for index, group_id in enumerate(ids, start=1):
        QuestionGroup.objects.filter(
            pk=group_id, quiz=quiz, school=school, section=section
        ).update(order=index)


def assign_questions(quiz, school, data):
    question_ids = _ids(data.get("question_ids"))
    replace = _flag(data, "replace")
    if (not question_ids and not (replace and data.get("section_id"))) or len(question_ids) != len(set(question_ids)):
        raise ValidationError({"question_ids": ["Select one or more unique question IDs."]})

    section_id = data.get("section_id")
    section = None
    if section_id not in (None, ""):
        section = QuizSection.objects.filter(
            pk=section_id, quiz=quiz, school=school
        ).first()
        if section is None:
            raise ValidationError({"section_id": ["Section does not belong to this quiz."]})

    group_id = data.get("group_id")
    group = None
    if group_id not in (None, ""):
        group = QuestionGroup.objects.filter(
            pk=group_id, quiz=quiz, school=school
        ).first()
        if group is None or group.section_id != (section.pk if section else None):
            raise ValidationError({
                "group_id": ["Group must belong to the selected quiz and section."]
            })

    questions = list(
        Question.objects.select_for_update().filter(
            pk__in=question_ids, quiz=quiz, school=school
        )
    )
    if len(questions) != len(question_ids):
        raise ValidationError({"question_ids": ["One or more questions do not belong to this quiz."]})
    if replace and section:
        quiz.questions.filter(
            school=school, section=section
        ).exclude(pk__in=question_ids).update(section=None, group=None)
    for question in questions:
        question.section = section
        question.group = group
        question.full_clean(exclude=["answer_choices"])
        question.save(update_fields=["section", "group"])
    _validate_quiz_sections(quiz)
    quiz.calculate_total_marks()
    return questions


def delete_quiz(quiz, school):
    quiz = Quiz.objects.select_for_update().get(pk=quiz.pk, school=school)
    if quiz.attempts.exists():
        raise AssessmentConflict(
            "QUIZ_HAS_ATTEMPTS",
            "This quiz has recorded attempts and cannot be deleted without erasing assessment history.",
        )
    title = quiz.title
    quiz.delete()
    return title


def update_quiz_status(quiz, status):
    if status not in {"draft", "published", "archived"}:
        raise ValidationError({"status": ["Invalid status."]})
    if status == "published" and not quiz.questions.exists():
        raise ValidationError({"status": ["Publish a quiz only after it has at least one question."]})
    quiz.status = status
    quiz.save(update_fields=["status"])
    return quiz


def _question_config(question_type, data):
    config = data.get("config")
    if config is None:
        return None
    if isinstance(config, str):
        try:
            config = json.loads(config or "{}")
        except json.JSONDecodeError as error:
            raise ValidationError({"config": ["Invalid question configuration."]}) from error
    from ..question_types import get_question_type

    try:
        return get_question_type(question_type).validate_config(config)
    except (TypeError, ValueError) as error:
        raise ValidationError({"config": [f"Invalid question configuration: {error}"]}) from error


def _apply_text_answer(question, data):
    correct_answer = _text(data, "correct_answer")
    if question.question_type in {"matching", "ordering"} and not correct_answer:
        raise ValidationError({"correct_answer": ["A correct answer is required for this question type."]})
    if question.question_type == "ordering":
        items = [item.strip() for item in correct_answer.split(";") if item.strip()]
        if len(items) < 2 or len({item.casefold() for item in items}) != len(items):
            raise ValidationError({
                "correct_answer": ["Ordering questions require at least two distinct items separated by semicolons."]
            })
        correct_answer = "; ".join(items)
    if question.question_type == "matching" and any(
        "=" not in pair for pair in correct_answer.split(";") if pair.strip()
    ):
        raise ValidationError({"correct_answer": ["Each matching pair must use the left=right format."]})
    question.correct_answer_text = correct_answer or None
    question.save(update_fields=["correct_answer_text"])


def _choice_payload(data):
    choices = data.get("choices")
    if isinstance(choices, list):
        return [
            {
                "id": item.get("id"),
                "text": str(item.get("text") or item.get("choice_text") or "").strip(),
                "is_correct": bool(item.get("is_correct")),
            }
            for item in choices
            if isinstance(item, dict)
        ]
    texts = data.get("choice_text") or []
    ids = data.get("choice_id") or []
    correct = {str(item) for item in (data.get("is_correct") or [])}
    if not isinstance(texts, list):
        texts = [texts]
    if not isinstance(ids, list):
        ids = [ids]
    payload = []
    index = 0
    for idx, text in enumerate(texts):
        cleaned = str(text or "").strip()
        if not cleaned:
            continue
        choice_id = ids[idx] if idx < len(ids) else ""
        payload.append({
            "id": choice_id,
            "text": cleaned,
            "is_correct": str(index) in correct,
        })
        index += 1
    return payload


def _sync_true_false(question, school, data):
    tf_correct = _text(data, "tf_correct").lower()
    if tf_correct not in {"true", "false"}:
        existing = question.answer_choices.filter(is_correct=True).first()
        tf_correct = "false" if existing and existing.choice_text.strip().lower() == "false" else "true"
    true_choice = question.answer_choices.filter(choice_text="True").first()
    false_choice = question.answer_choices.filter(choice_text="False").first()
    if true_choice is None:
        true_choice = AnswerChoice.objects.create(
            question=question, choice_text="True", is_correct=tf_correct == "true", order=1, school=school
        )
    else:
        true_choice.is_correct = tf_correct == "true"
        true_choice.order = 1
        true_choice.save()
    if false_choice is None:
        false_choice = AnswerChoice.objects.create(
            question=question, choice_text="False", is_correct=tf_correct == "false", order=2, school=school
        )
    else:
        false_choice.is_correct = tf_correct == "false"
        false_choice.order = 2
        false_choice.save()
    extras = question.answer_choices.exclude(pk__in=[true_choice.pk, false_choice.pk])
    if extras.exists():
        try:
            extras.delete()
        except ProtectedError as error:
            raise AssessmentConflict(
                "CHOICE_HAS_ATTEMPTS",
                "Answer choices in quizzes with attempts cannot be removed.",
            ) from error


def _sync_multiple_choice(question, school, data):
    payload = [item for item in _choice_payload(data) if item["text"]]
    existing = {choice.pk: choice for choice in question.answer_choices.all()}
    processed = set()
    for index, item in enumerate(payload):
        choice_id = item["id"]
        try:
            choice_id = int(choice_id) if choice_id not in (None, "") else None
        except (TypeError, ValueError):
            choice_id = None
        if choice_id in existing:
            choice = existing[choice_id]
            choice.choice_text = item["text"]
            choice.is_correct = item["is_correct"]
            choice.order = index + 1
            choice.save()
            processed.add(choice_id)
        else:
            created = AnswerChoice.objects.create(
                question=question,
                choice_text=item["text"],
                is_correct=item["is_correct"],
                order=index + 1,
                school=school,
            )
            processed.add(created.pk)
    removed = [choice for pk, choice in existing.items() if pk not in processed]
    if removed:
        try:
            for choice in removed:
                choice.delete()
        except ProtectedError as error:
            raise AssessmentConflict(
                "CHOICE_HAS_ATTEMPTS",
                "Answer choices in quizzes with attempts cannot be removed.",
            ) from error


def save_question(quiz, school, data, question=None):
    question_type = _text(data, "question_type", question.question_type if question else "multiple_choice") or "multiple_choice"
    if question is None and question_type not in VALID_QUESTION_TYPES:
        raise ValidationError({"question_type": ["Invalid question type."]})
    question_text = _text(data, "question_text")
    if not question_text:
        raise ValidationError({"question_text": ["Question text is required."]})
    marks = _int(data.get("marks"), "marks", 1) or 1
    order = data.get("order")
    if not order:
        order = (Question.objects.filter(quiz=quiz).aggregate(max_order=Max("order"))["max_order"] or 0) + 1
    else:
        order = _int(order, "order", 1)
    if question is None:
        question = Question(quiz=quiz, question_type=question_type, school=school)
    question.question_text = question_text
    question.marks = marks
    question.order = order
    question.explanation = _text(data, "explanation") or None
    question.difficulty = _text(data, "difficulty", "medium") or "medium"
    question.negative_marks = _float(data.get("negative_marks"), "negative_marks")
    question.is_required = _flag(data, "is_required", True)
    config = _question_config(question.question_type, data)
    if config is not None:
        question.config = config
    question.save()
    if question.question_type == "true_false":
        payload = dict(data)
        if payload.get("choice_text") and not _text(payload, "tf_correct"):
            correct = {str(item) for item in (payload.get("is_correct") or [])}
            payload["tf_correct"] = "true" if "0" in correct or not correct else "false"
        _sync_true_false(question, school, payload)
    elif question.question_type == "multiple_choice":
        _sync_multiple_choice(question, school, data)
    elif question.question_type in {"short_answer", "fill_blank", "matching", "ordering"}:
        _apply_text_answer(question, data)
    _validate_quiz_sections(quiz)
    quiz.calculate_total_marks()
    return question


def delete_question(quiz, school, question_id):
    quiz = Quiz.objects.select_for_update().get(pk=quiz.pk, school=school)
    question = get_object_or_404(
        Question.objects.select_for_update(), pk=question_id, quiz=quiz, school=school
    )
    if quiz.attempts.exists():
        raise AssessmentConflict(
            "QUESTION_HAS_ATTEMPTS",
            "Questions in a quiz with attempts cannot be deleted.",
        )
    try:
        question.delete()
    except ProtectedError as error:
        raise AssessmentConflict(
            "QUESTION_HAS_ATTEMPTS",
            "This question cannot be deleted because it is referenced by existing records.",
        ) from error
    _validate_quiz_sections(quiz)
    quiz.calculate_total_marks()


def bulk_delete_questions(quiz, school, question_ids):
    ids = _ids(question_ids)
    if not ids:
        raise ValidationError({"question_ids": ["No questions selected."]})
    if len(ids) != len(set(ids)):
        raise ValidationError({"question_ids": ["Question IDs must be unique."]})
    questions = Question.objects.filter(pk__in=ids, quiz=quiz, school=school)
    if questions.count() != len(ids):
        raise ValidationError({"question_ids": ["One or more questions do not belong to this quiz."]})
    if quiz.attempts.exists():
        raise AssessmentConflict(
            "QUESTION_HAS_ATTEMPTS",
            "Questions in a quiz with attempts cannot be deleted.",
        )
    questions.delete()
    _validate_quiz_sections(quiz)
    quiz.calculate_total_marks()
    return len(ids)


def reorder_questions(quiz, school, question_ids):
    data_orders = question_ids or []
    if data_orders and isinstance(data_orders[0], dict):
        parsed = []
        seen = set()
        for item in data_orders:
            question_id = _int(item.get("question_id"), "question_ids", required=True)
            order = _int(item.get("order"), "question_ids", required=True)
            if order < 1 or question_id in seen:
                raise ValidationError({"question_ids": ["Question orders must be positive and IDs unique."]})
            seen.add(question_id)
            parsed.append((question_id, order))
    else:
        ids = _ids(data_orders)
        if len(ids) != len(set(ids)):
            raise ValidationError({"question_ids": ["Question IDs must be unique."]})
        parsed = [(question_id, index + 1) for index, question_id in enumerate(ids)]
        seen = set(ids)
    valid = set(Question.objects.filter(quiz=quiz, school=school, pk__in=seen).values_list("pk", flat=True))
    if valid != seen:
        raise ValidationError({"question_ids": ["One or more questions do not belong to this quiz."]})
    with transaction.atomic():
        for question_id, order in parsed:
            Question.objects.filter(pk=question_id, quiz=quiz, school=school).update(order=order)


def duplicate_question(quiz, school, question):
    max_order = Question.objects.filter(quiz=quiz).aggregate(max_order=Max("order"))["max_order"] or 0
    new_question = Question(
        quiz=quiz,
        question_type=question.question_type,
        question_text=question.question_text,
        marks=question.marks,
        order=max_order + 1,
        explanation=question.explanation,
        difficulty=question.difficulty,
        negative_marks=question.negative_marks,
        is_required=question.is_required,
        correct_answer_text=question.correct_answer_text,
        config=question.config,
        school=school,
    )
    new_question.save()
    if question.question_type in {"multiple_choice", "true_false"}:
        for choice in question.answer_choices.all():
            AnswerChoice.objects.create(
                question=new_question,
                choice_text=choice.choice_text,
                is_correct=choice.is_correct,
                order=choice.order,
                explanation=choice.explanation,
                partial_credit=choice.partial_credit,
                school=school,
            )
    quiz.calculate_total_marks()
    return new_question


def _import_choice_question(question, row, fieldnames, school, row_num, errors):
    question_type = question.question_type
    choices = []
    if question_type == "true_false":
        choices = ["True", "False"]
    else:
        for index in range(1, 11):
            key = f"choice{index}"
            if key in fieldnames:
                text = (row.get(key) or "").strip()
                if text:
                    choices.append(text)
        if len(choices) < 2:
            errors.append(f"Row {row_num}: Multiple choice questions need at least 2 choices")
            question.delete()
            return False
    correct_answer = (row.get("correct_answer") or "").strip()
    correct_indices = set()
    if question_type == "true_false":
        lowered = correct_answer.lower()
        if lowered in {"true", "t", "1"}:
            correct_indices.add(0)
        elif lowered in {"false", "f", "2"}:
            correct_indices.add(1)
        else:
            correct_indices.add(0)
    else:
        if correct_answer:
            for sep in [",", ";", "|"]:
                if sep in correct_answer:
                    for part in correct_answer.split(sep):
                        part = part.strip()
                        try:
                            idx = int(float(part)) - 1
                        except (TypeError, ValueError):
                            continue
                        if 0 <= idx < len(choices):
                            correct_indices.add(idx)
                    break
            else:
                try:
                    idx = int(float(correct_answer)) - 1
                    if 0 <= idx < len(choices):
                        correct_indices.add(idx)
                except (TypeError, ValueError):
                    for idx, choice in enumerate(choices):
                        if choice.strip().lower() == correct_answer.lower():
                            correct_indices.add(idx)
                            break
        if not correct_indices:
            correct_indices.add(0)
    for idx, choice_text in enumerate(choices):
        AnswerChoice.objects.create(
            question=question,
            choice_text=choice_text,
            is_correct=idx in correct_indices,
            order=idx + 1,
            school=school,
        )
    return True


def import_question_rows(quiz, school, rows, fieldnames):
    imported = 0
    errors = []
    max_order = Question.objects.filter(quiz=quiz).aggregate(max_order=Max("order"))["max_order"] or 0
    with transaction.atomic():
        for row_num, row in enumerate(rows, start=2):
            try:
                question_text = (row.get("question_text") or "").strip()
                if not question_text:
                    errors.append(f"Row {row_num}: Missing question text")
                    continue
                question_type = (row.get("question_type") or "multiple_choice").strip().lower()
                valid_types = ["multiple_choice", "true_false", "short_answer", "fill_blank", "essay"]
                if question_type not in valid_types:
                    errors.append(f'Row {row_num}: Invalid question_type "{question_type}". Using "multiple_choice"')
                    question_type = "multiple_choice"
                marks = 1
                if row.get("marks"):
                    try:
                        marks = int(float(row.get("marks")))
                        if marks < 1:
                            marks = 1
                    except (TypeError, ValueError):
                        marks = 1
                difficulty = (row.get("difficulty") or "medium").strip().lower()
                if difficulty not in {"easy", "medium", "hard"}:
                    difficulty = "medium"
                max_order += 1
                question = Question(
                    quiz=quiz,
                    question_type=question_type,
                    question_text=question_text,
                    marks=marks,
                    difficulty=difficulty,
                    order=max_order,
                    explanation=(row.get("explanation") or "").strip() or None,
                    school=school,
                )
                if question_type in {"short_answer", "fill_blank"}:
                    question.correct_answer_text = (row.get("correct_answer") or "").strip() or None
                    question.save()
                elif question_type == "essay":
                    question.save()
                else:
                    question.save()
                    if not _import_choice_question(question, row, fieldnames, school, row_num, errors):
                        continue
                imported += 1
            except Exception as error:
                errors.append(f"Row {row_num}: {error}")
    quiz.calculate_total_marks()
    return imported, errors


def import_questions_from_csv(quiz, csv_file, school):
    errors = []
    try:
        try:
            file_data = csv_file.read().decode("utf-8")
        except UnicodeDecodeError:
            csv_file.seek(0)
            file_data = csv_file.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(file_data))
        fieldnames = reader.fieldnames or []
        if len(fieldnames) > MAX_IMPORT_COLUMNS:
            return 0, [f"File exceeds the {MAX_IMPORT_COLUMNS}-column import limit"]
        if "question_text" not in fieldnames:
            return 0, ['CSV file must contain "question_text" column']
        rows = list(islice(reader, MAX_IMPORT_ROWS + 1))
        if len(rows) > MAX_IMPORT_ROWS:
            return 0, [f"File exceeds the {MAX_IMPORT_ROWS}-row import limit"]
        return import_question_rows(quiz, school, rows, fieldnames)
    except Exception as error:
        errors.append(f"Error reading CSV file: {error}")
        return 0, errors


def import_questions_from_excel(quiz, excel_file, school):
    from openpyxl import load_workbook

    excel_file.seek(0)
    workbook = load_workbook(excel_file, read_only=True, data_only=True)
    sheet = workbook.active
    headers = []
    for cell in sheet[1]:
        if cell.value:
            headers.append(str(cell.value).strip())
        else:
            break
    if len(headers) > MAX_IMPORT_COLUMNS:
        workbook.close()
        return 0, [f"File exceeds the {MAX_IMPORT_COLUMNS}-column import limit"]
    if not headers or "question_text" not in headers:
        workbook.close()
        return 0, ['Excel file must contain "question_text" column in the first row']
    rows = []
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if any(cell is not None for cell in row):
            if len(rows) >= MAX_IMPORT_ROWS:
                workbook.close()
                return 0, [f"File exceeds the {MAX_IMPORT_ROWS}-row import limit"]
            rows.append({
                header: str(row[idx]).strip() if idx < len(row) and row[idx] is not None else ""
                for idx, header in enumerate(headers)
            })
    workbook.close()
    return import_question_rows(quiz, school, rows, headers)


def import_questions(quiz, school, upload):
    if upload is None:
        raise ValidationError({"import_file": ["No file uploaded."]})
    if upload.size > MAX_IMPORT_FILE_SIZE:
        raise ValidationError({"import_file": ["File exceeds the 5 MB import limit."]})
    name = upload.name.lower()
    if name.endswith(".xls"):
        raise ValidationError({"import_file": ["Only CSV and XLSX files are supported."]})
    if name.endswith(".xlsx"):
        try:
            return import_questions_from_excel(quiz, upload, school)
        except ImportError as error:
            raise ValidationError({"import_file": ["Excel support requires openpyxl."]}) from error
    if name.endswith(".csv"):
        return import_questions_from_csv(quiz, upload, school)
    raise ValidationError({"import_file": ["Unsupported file format. Please use CSV or XLSX."]})


def assign_classes(user, quiz, school, class_ids):
    if not quiz.subject_id:
        raise ValidationError({"quiz": ["Quiz must have a subject assigned before assigning classes."]})
    ids = _ids(class_ids)
    if not ids:
        raise ValidationError({"class_ids": ["Please select at least one class to assign."]})
    classes = Class.objects.filter(pk__in=ids, school=school)
    if classes.count() != len(ids):
        raise ValidationError({"class_ids": ["One or more selected classes are invalid."]})
    if user.role == "teacher":
        assigned = set(
            TeacherSubjectAssignment.objects.filter(
                teacher=user.teacher_profile,
                subject=quiz.subject,
                class_assigned__in=classes,
                is_active=True,
                school=school,
            ).values_list("class_assigned_id", flat=True)
        )
        selected = set(ids)
        if assigned != selected:
            names = Class.objects.filter(id__in=selected - assigned).values_list("name", flat=True)
            raise ValidationError({
                "class_ids": [
                    f'You are not assigned to teach "{quiz.subject.subject_name}" in the following class(es): {", ".join(names)}.'
                ]
            })
    quiz.classes.add(*classes)
    return classes.count()


def unassign_class(quiz, school, class_id):
    class_obj = get_object_or_404(Class, pk=class_id, school=school)
    if not quiz.classes.filter(pk=class_obj.pk, school=school).exists():
        raise Http404("Class is not assigned to this quiz")
    quiz.classes.remove(class_obj)
    return class_obj


def bulk_unassign_classes(quiz, school, class_ids):
    ids = _ids(class_ids)
    if not ids:
        raise ValidationError({"class_ids": ["No classes selected."]})
    if len(ids) != len(set(ids)):
        raise ValidationError({"class_ids": ["Class IDs must be unique."]})
    classes = Class.objects.filter(pk__in=ids, school=school, assigned_quizzes=quiz)
    if classes.count() != len(ids):
        raise ValidationError({"class_ids": ["One or more classes are invalid or not assigned to this quiz."]})
    quiz.classes.remove(*classes)
    return classes.count()


def _response_queryset(user, school):
    responses = QuizResponse.objects.filter(
        school=school,
        attempt__school=school,
        attempt__quiz__school=school,
        attempt__student__school=school,
        question__school=school,
        question__quiz_id=F("attempt__quiz_id"),
    ).filter(Q(selected_choice__isnull=True) | Q(selected_choice__school=school))
    if user.role == "teacher":
        teacher = user.teacher_profile
        if not teacher:
            raise Http404("Teacher profile not found")
        responses = responses.filter(attempt__quiz__teacher=teacher)
    return responses


def _attempt_queryset(user, school):
    attempts = QuizAttempt.objects.filter(
        school=school,
        quiz__school=school,
        student__school=school,
        is_submitted=True,
    )
    if user.role == "teacher":
        teacher = user.teacher_profile
        if not teacher:
            raise Http404("Teacher profile not found")
        attempts = attempts.filter(quiz__teacher=teacher)
    return attempts


def _max_marks(response):
    return response.attempt.configuration_snapshot.get("questions", {}).get(
        str(response.question_id), {}
    ).get("marks", response.question.marks)


def _apply_grade(response, user, marks_awarded, grading_notes):
    max_marks = _max_marks(response)
    if marks_awarded < 0:
        raise ValidationError({"marks_awarded": ["Marks cannot be negative."]})
    if marks_awarded > max_marks:
        raise ValidationError({
            "marks_awarded": [f"Marks cannot exceed the maximum marks for this question ({max_marks})."]
        })
    response.marks_awarded = marks_awarded
    response.grading_notes = grading_notes
    response.is_graded = True
    response.graded_by = user
    response.graded_at = timezone.now()
    response.grading_history = [
        *response.grading_history,
        {
            "marks_awarded": marks_awarded,
            "graded_by_id": user.pk,
            "graded_at": response.graded_at.isoformat(),
            "grading_notes": grading_notes,
        },
    ]
    if response.question.question_type == "essay":
        response.is_correct = marks_awarded > 0
    else:
        response.check_correctness()
    response.save()


def _refresh_attempt_grading(attempt, school):
    attempt.calculate_score()
    essay_responses = attempt.responses.filter(
        school=school,
        question__school=school,
        question__quiz_id=F("attempt__quiz_id"),
        question__question_type="essay",
    ).filter(Q(selected_choice__isnull=True) | Q(selected_choice__school=school))
    all_graded = all(item.is_graded for item in essay_responses) if essay_responses.exists() else True
    if all_graded and essay_responses.exists():
        attempt.is_graded = True
        attempt.needs_grading = False
        attempt.save(update_fields=["is_graded", "needs_grading"])
    return all_graded


def grade_response(user, school, response_id, marks_awarded, grading_notes=""):
    response = get_object_or_404(_response_queryset(user, school), pk=response_id)
    marks_awarded = _float(marks_awarded, "marks_awarded")
    with transaction.atomic():
        _apply_grade(response, user, marks_awarded, grading_notes or "")
        all_graded = _refresh_attempt_grading(response.attempt, school)
    return response, all_graded


def bulk_grade_attempt(user, school, attempt_id, grades):
    attempt = get_object_or_404(_attempt_queryset(user, school), pk=attempt_id)
    if not grades:
        raise ValidationError({"grades": ["No grades provided."]})
    graded_count = 0
    errors = []
    with transaction.atomic():
        for item in grades:
            response_id = item.get("response_id")
            try:
                response = _response_queryset(user, school).get(pk=response_id, attempt=attempt)
                _apply_grade(response, user, _float(item.get("marks_awarded", 0), "marks_awarded"), item.get("grading_notes") or "")
                graded_count += 1
            except QuizResponse.DoesNotExist:
                errors.append(f"Response {response_id}: Not found")
            except ValidationError as error:
                errors.append(f"Response {response_id}: {'; '.join(error.messages) if hasattr(error, 'messages') else error}")
            except (TypeError, ValueError):
                errors.append(f"Response {response_id}: Invalid marks value")
        all_graded = _refresh_attempt_grading(attempt, school)
    return graded_count, errors, all_graded

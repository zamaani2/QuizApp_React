from .choice import ChoiceQuestionType
from .matching import MatchingQuestionType
from .ordering import OrderingQuestionType
from .text import EssayQuestionType, TextQuestionType


class TrueFalseQuestionType(ChoiceQuestionType):
    key = "true_false"

    def validate_config(self, config):
        config = super().validate_config(config)
        if config["allow_multiple"]:
            raise ValueError("True/False questions allow only one answer.")
        return config


class MultipleChoiceQuestionType(ChoiceQuestionType):
    key = "multiple_choice"


class ShortAnswerQuestionType(TextQuestionType):
    key = "short_answer"


class FillBlankQuestionType(TextQuestionType):
    key = "fill_blank"


class MatchingRegistryType(MatchingQuestionType):
    key = "matching"


class OrderingRegistryType(OrderingQuestionType):
    key = "ordering"


class EssayRegistryType(EssayQuestionType):
    key = "essay"


question_type_registry = {
    question_type.key: question_type()
    for question_type in (
        MultipleChoiceQuestionType,
        TrueFalseQuestionType,
        ShortAnswerQuestionType,
        FillBlankQuestionType,
        MatchingRegistryType,
        OrderingRegistryType,
        EssayRegistryType,
    )
}


def get_question_type(question_type):
    try:
        return question_type_registry[question_type]
    except KeyError as error:
        raise ValueError(f"Unsupported question type: {question_type}") from error


def grade_response(question, response, snapshot):
    handler = get_question_type(snapshot.get("question_type", question.question_type))
    result = handler.grade(question, response, snapshot)
    response.is_correct = result.is_correct
    response.marks_awarded = result.marks_awarded
    return result


def requires_manual_grading(question, snapshot):
    handler = get_question_type(snapshot.get("question_type", question.question_type))
    return handler.requires_manual_grading(question, snapshot)


def validate_answer_data(question_type, config, answer_data):
    return get_question_type(question_type).validate_answer_data(config, answer_data)


def serialize_for_student(question, snapshot, answer_order=None):
    handler = get_question_type(snapshot.get("question_type", question.question_type))
    serialized = handler.serialize_for_student(question, snapshot, answer_order or [])
    return {
        "id": question.pk,
        "order": snapshot.get("order", question.order),
        "question_type": snapshot.get("question_type", question.question_type),
        "question_text": snapshot.get("question_text", question.question_text),
        "marks": snapshot.get("marks", question.marks),
        **serialized,
    }


def serialize_for_review(question, response, snapshot, show_correct_answers=True):
    handler = get_question_type(snapshot.get("question_type", question.question_type))
    return handler.serialize_for_review(
        question, response, snapshot, show_correct_answers
    )

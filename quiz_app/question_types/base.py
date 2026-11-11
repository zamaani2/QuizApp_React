from dataclasses import dataclass


@dataclass(frozen=True)
class GradeResult:
    is_correct: bool
    marks_awarded: float


class QuestionType:
    key = ""

    def validate_config(self, config):
        if not isinstance(config, dict):
            raise ValueError("Question configuration must be an object.")
        return config

    def validate_answer_data(self, config, answer_data):
        if not isinstance(answer_data, dict):
            raise ValueError("answer_data must be an object.")
        return answer_data

    def serialize_for_student(self, question, snapshot, answer_order):
        raise NotImplementedError

    def grade(self, question, response, snapshot):
        raise NotImplementedError

    def serialize_for_review(self, question, response, snapshot, show_correct_answers):
        raise NotImplementedError

    @staticmethod
    def config(snapshot):
        config = snapshot.get("config", {})
        return config if isinstance(config, dict) else {}

    @staticmethod
    def mark_result(is_correct, marks, negative_marks, partial_credit=False, ratio=0):
        if is_correct:
            return GradeResult(True, marks)
        if partial_credit:
            return GradeResult(
                False,
                max(-negative_marks, marks * ratio - negative_marks * (1 - ratio)),
            )
        return GradeResult(False, -negative_marks)

    def serialize_for_review(self, question, response, snapshot, show_correct_answers):
        answer_data = getattr(response, "answer_data", None) or {}
        return {
            "student_answer": answer_data if answer_data else (response.text_answer or ""),
            "correct_answer": self.config(snapshot) if show_correct_answers else None,
        }

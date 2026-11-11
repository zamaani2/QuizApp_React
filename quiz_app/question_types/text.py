from .base import GradeResult, QuestionType


class TextQuestionType(QuestionType):
    def validate_config(self, config):
        config = super().validate_config(config)
        answers = config.get("accepted_answers", [])
        if not isinstance(answers, list) or not all(
            isinstance(answer, str) for answer in answers
        ):
            raise ValueError("accepted_answers must be a list of strings.")
        normalized = {
            "accepted_answers": [answer.strip() for answer in answers if answer.strip()],
            "case_sensitive": bool(config.get("case_sensitive", False)),
        }
        if "blanks" in config:
            blanks = config["blanks"]
            if not isinstance(blanks, list) or any(
                not isinstance(blank, list)
                or not blank
                or not all(isinstance(answer, str) and answer.strip() for answer in blank)
                for blank in blanks
            ):
                raise ValueError("blanks must be a list of non-empty answer lists.")
            normalized["blanks"] = [
                [answer.strip() for answer in blank] for blank in blanks
            ]
        return normalized

    def validate_answer_data(self, config, answer_data):
        answer_data = super().validate_answer_data(config, answer_data)
        if set(answer_data) - {"text"}:
            raise ValueError("text answers may contain only text.")
        text = answer_data.get("text", "")
        if not isinstance(text, (str, list)) or (
            isinstance(text, list) and not all(isinstance(item, str) for item in text)
        ):
            raise ValueError("text answer must be a string or a list of strings.")
        return {"text": text}

    def expected_answers(self, question, snapshot):
        config = self.config(snapshot)
        answers = config.get("accepted_answers")
        if answers:
            return answers
        legacy = snapshot.get("correct_answer_text", question.correct_answer_text or "")
        return [answer.strip() for answer in legacy.split(";") if answer.strip()]

    def answer_text(self, response):
        answer_data = getattr(response, "answer_data", None)
        if isinstance(answer_data, dict):
            answer_data = answer_data.get("text", "")
        if isinstance(answer_data, list):
            return [str(item) for item in answer_data]
        if isinstance(answer_data, str) and answer_data:
            return answer_data
        return response.text_answer or ""

    def grade(self, question, response, snapshot):
        marks = snapshot.get("marks", question.marks)
        negative_marks = snapshot.get("negative_marks", question.negative_marks)
        config = self.config(snapshot)
        if question.question_type == "fill_blank" and config.get("blanks"):
            submitted = self.answer_text(response)
            if not isinstance(submitted, list):
                submitted = [part.strip() for part in str(submitted).split(";")]
            if not any(item.strip() for item in submitted):
                return GradeResult(False, 0)
            expected_blanks = config["blanks"]
            normalize_answer = (lambda value: value.strip()) if config.get(
                "case_sensitive", False
            ) else (lambda value: value.strip().casefold())
            matched = [
                index < len(submitted)
                and normalize_answer(submitted[index])
                in {normalize_answer(answer) for answer in blank}
                for index, blank in enumerate(expected_blanks)
            ]
            ratio = sum(matched) / len(expected_blanks)
            is_correct = all(matched) and len(submitted) == len(expected_blanks)
            return self.mark_result(
                is_correct,
                marks,
                negative_marks,
                snapshot.get("partial_credit", question.partial_credit),
                ratio,
            )
        expected = self.expected_answers(question, snapshot)
        submitted = self.answer_text(response)
        if isinstance(submitted, list):
            submitted_values = submitted
        else:
            submitted_values = [submitted.strip()]
        if not any(submitted_values):
            return GradeResult(False, 0)

        case_sensitive = config.get("case_sensitive", False)
        normalize = (lambda value: value.strip()) if case_sensitive else (
            lambda value: value.strip().casefold()
        )
        normalized_expected = {normalize(answer) for answer in expected}
        matched = [normalize(answer) in normalized_expected for answer in submitted_values]
        is_correct = any(matched)
        ratio = sum(matched) / len(matched) if matched else 0
        if is_correct:
            return GradeResult(True, marks)
        return self.mark_result(
            False,
            marks,
            negative_marks,
            snapshot.get("partial_credit", question.partial_credit),
            ratio,
        )

    def serialize_for_student(self, question, snapshot, answer_order):
        config = self.config(snapshot)
        if question.question_type == "fill_blank" and config.get("blanks"):
            return {
                "choices": [],
                "config": {
                    "answer_format": "blanks",
                    "blank_count": len(config["blanks"]),
                },
            }
        return {"choices": [], "config": {"answer_format": "text"}}

    def serialize_for_review(self, question, response, snapshot, show_correct_answers):
        result = super().serialize_for_review(
            question, response, snapshot, show_correct_answers
        )
        result["student_answer"] = self.answer_text(response)
        if question.question_type == "fill_blank" and self.config(snapshot).get("blanks"):
            correct_answer = self.config(snapshot)["blanks"]
        else:
            correct_answer = self.expected_answers(question, snapshot)
        result["correct_answer"] = correct_answer if show_correct_answers else None
        return result


class EssayQuestionType(TextQuestionType):
    def validate_config(self, config):
        config = QuestionType.validate_config(self, config)
        rubric = config.get("rubric", "")
        if not isinstance(rubric, str):
            raise ValueError("rubric must be a string.")
        return {"rubric": rubric}

    def grade(self, question, response, snapshot):
        if response.is_graded:
            return GradeResult(response.is_correct, response.marks_awarded)
        return GradeResult(False, 0)

    def serialize_for_student(self, question, snapshot, answer_order):
        return {"choices": [], "config": {"answer_format": "long_text"}}

    def serialize_for_review(self, question, response, snapshot, show_correct_answers):
        return {
            "student_answer": response.text_answer or "",
            "correct_answer": None,
        }

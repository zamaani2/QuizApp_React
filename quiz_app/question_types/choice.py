from .base import GradeResult, QuestionType


class ChoiceQuestionType(QuestionType):
    def requires_manual_grading(self, question, snapshot):
        choices = snapshot.get("choices")
        if not isinstance(choices, dict):
            choices = {
                str(choice.pk): {"is_correct": choice.is_correct}
                for choice in question.answer_choices.all()
            }
        return not any(
            isinstance(choice, dict) and choice.get("is_correct")
            for choice in choices.values()
        )

    def validate_config(self, config):
        config = super().validate_config(config)
        allow_multiple = config.get("allow_multiple", False)
        if not isinstance(allow_multiple, bool):
            raise ValueError("allow_multiple must be a boolean.")
        return {"allow_multiple": allow_multiple}

    def validate_answer_data(self, config, answer_data):
        answer_data = super().validate_answer_data(config, answer_data)
        if set(answer_data) - {"choice_ids"}:
            raise ValueError("choice answers may contain only choice_ids.")
        choice_ids = answer_data.get("choice_ids", [])
        if not isinstance(choice_ids, list) or any(
            not isinstance(choice_id, (int, str)) for choice_id in choice_ids
        ):
            raise ValueError("choice_ids must be a list of choice IDs.")
        return {"choice_ids": choice_ids}

    def serialize_for_student(self, question, snapshot, answer_order):
        choices = snapshot.get("choices", {})
        ordered_ids = answer_order or list(choices)
        question_config = snapshot.get("config", {})
        allow_multiple = question_config.get("allow_multiple")
        if allow_multiple is None:
            allow_multiple = sum(
                1 for choice in choices.values() if choice.get("is_correct")
            ) > 1
        return {
            "choices": [
                {"id": int(choice_id), "choice_text": choices[str(choice_id)]["text"]}
                for choice_id in ordered_ids
                if str(choice_id) in choices
            ],
            "config": {"allow_multiple": allow_multiple},
        }

    def grade(self, question, response, snapshot):
        config = self.config(snapshot)
        marks = snapshot.get("marks", question.marks)
        negative_marks = snapshot.get("negative_marks", question.negative_marks)
        choice_snapshot = snapshot.get("choices", {})
        selected_ids = {
            int(choice_id)
            for choice_id in (getattr(response, "answer_data", None) or {}).get(
                "choice_ids", []
            )
            if str(choice_id).isdigit()
        }
        selected_ids.update(
            getattr(response, "_selected_choice_ids_for_score", set())
        )
        if response.pk and not hasattr(response, "_selected_choice_ids_for_score"):
            selected_ids.update(
                choice.pk for choice in response.selected_choices.all()
            )
        if response.selected_choice_id:
            selected_ids.add(response.selected_choice_id)
        correct_ids = {
            int(choice_id)
            for choice_id, choice in choice_snapshot.items()
            if choice.get("is_correct")
        }
        if not snapshot:
            choices = list(question.answer_choices.all())
            correct_ids = {choice.pk for choice in choices if choice.is_correct}
            choice_snapshot = {
                str(choice.pk): {"partial_credit": choice.partial_credit}
                for choice in choices
            }

        if not selected_ids:
            return GradeResult(False, 0)
        is_correct = selected_ids == correct_ids
        if is_correct:
            return GradeResult(True, marks)
        if snapshot.get("partial_credit", question.partial_credit):
            correct_selected = len(selected_ids & correct_ids)
            incorrect_selected = len(selected_ids - correct_ids)
            incorrect_total = max(0, len(choice_snapshot) - len(correct_ids))
            earned = marks * correct_selected / len(correct_ids) if correct_ids else 0
            penalty = (
                negative_marks * incorrect_selected / incorrect_total
                if incorrect_total
                else 0
            )
            return GradeResult(
                False, min(marks, max(-negative_marks, earned - penalty))
            )
        return GradeResult(False, -negative_marks)

    def serialize_for_review(self, question, response, snapshot, show_correct_answers):
        selected_ids = {
            choice.pk for choice in response.selected_choices.all()
        } if response.pk else set()
        if response.selected_choice_id:
            selected_ids.add(response.selected_choice_id)
        if not selected_ids:
            selected_ids.update(
                (getattr(response, "answer_data", None) or {}).get("choice_ids", [])
            )
        choices = snapshot.get("choices", {})
        result = {
            "student_answer": [
                choice.get("text", "")
                for choice_id, choice in choices.items()
                if int(choice_id) in selected_ids
            ],
            "correct_answer": [
                choice.get("text", "")
                for choice in choices.values()
                if show_correct_answers and choice.get("is_correct")
            ] if show_correct_answers else None,
        }
        correct_ids = {
            int(choice_id)
            for choice_id, choice in choices.items()
            if choice.get("is_correct")
        }
        result["correct_choice_ids"] = sorted(correct_ids) if show_correct_answers else []
        return result

import hashlib
import uuid

from django.conf import settings

from .base import GradeResult, QuestionType


def _stable_item_id(question, index):
    value = f"{settings.SECRET_KEY}:{question.pk}:ordering:{index}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class OrderingQuestionType(QuestionType):
    def requires_manual_grading(self, question, snapshot):
        return not self.items(question, snapshot)

    def validate_config(self, config):
        config = super().validate_config(config)
        items = config.get("items", [])
        if not isinstance(items, list) or not all(isinstance(item, str) for item in items):
            raise ValueError("items must be a list of strings.")
        items = [item.strip() for item in items if item.strip()]
        if len(items) < 2 or len({item.casefold() for item in items}) != len(items):
            raise ValueError("Ordering questions require at least two distinct items.")
        item_ids = config.get("item_ids")
        if item_ids is None:
            item_ids = [uuid.uuid4().hex for _ in items]
        if (
            not isinstance(item_ids, list)
            or len(item_ids) != len(items)
            or not all(isinstance(item_id, str) and item_id for item_id in item_ids)
            or len(set(item_ids)) != len(item_ids)
        ):
            raise ValueError("item_ids must be unique IDs matching the item count.")
        return {"items": items, "item_ids": item_ids}

    def validate_answer_data(self, config, answer_data):
        answer_data = super().validate_answer_data(config, answer_data)
        if set(answer_data) - {"items"}:
            raise ValueError("ordering answers may contain only items.")
        items = answer_data.get("items", [])
        if not isinstance(items, list) or any(not isinstance(item, str) for item in items):
            raise ValueError("items must be a list of ordering item IDs.")
        return {"items": items}

    def items(self, question, snapshot):
        items = self.config(snapshot).get("items", [])
        if items:
            return items
        legacy = snapshot.get("correct_answer_text", question.correct_answer_text or "")
        return [item.strip() for item in legacy.split(";") if item.strip()]

    def item_ids(self, question, snapshot):
        config_ids = self.config(snapshot).get("item_ids")
        items = self.items(question, snapshot)
        if config_ids and len(config_ids) == len(items):
            return config_ids
        return [_stable_item_id(question, index) for index in range(len(items))]

    def serialize_for_student(self, question, snapshot, answer_order):
        items = self.items(question, snapshot)
        by_id = {
            f"item:{item_id}": item
            for item_id, item in zip(self.item_ids(question, snapshot), items)
        }
        if answer_order and all(item_id in by_id for item_id in answer_order):
            ordered_ids = answer_order
        elif answer_order and all(item in items for item in answer_order):
            ordered_ids = [
                f"item:{item_id}"
                for item, item_id in zip(items, self.item_ids(question, snapshot))
                if item in answer_order
            ]
            ordered_ids.sort(key=lambda item_id: answer_order.index(by_id[item_id]))
        else:
            ordered_ids = list(by_id)
        return {
            "choices": [],
            "config": {
                "items": [
                    {"id": item_id, "text": by_id[item_id]}
                    for item_id in ordered_ids
                    if item_id in by_id
                ]
            },
        }

    def grade(self, question, response, snapshot):
        expected = self.items(question, snapshot)
        answer_data = getattr(response, "answer_data", None)
        submitted = answer_data.get("items", []) if isinstance(answer_data, dict) else []
        if not submitted and response.text_answer:
            submitted = [item.strip() for item in response.text_answer.split(";") if item.strip()]
        if not submitted:
            return GradeResult(False, 0)
        expected_ids = [
            f"item:{item_id}" for item_id in self.item_ids(question, snapshot)
        ]
        if not all(
            isinstance(item, str) and item.startswith("item:")
            for item in submitted
        ):
            expected_ids = expected
        is_correct = submitted == expected_ids
        correct_positions = sum(
            index < len(submitted) and submitted[index] == expected_ids[index]
            for index in range(len(expected_ids))
        )
        ratio = correct_positions / len(expected_ids) if expected_ids else 0
        return self.mark_result(
            is_correct,
            snapshot.get("marks", question.marks),
            snapshot.get("negative_marks", question.negative_marks),
            snapshot.get("partial_credit", question.partial_credit),
            ratio,
        )

    def serialize_for_review(self, question, response, snapshot, show_correct_answers):
        items = self.items(question, snapshot)
        answer_data = getattr(response, "answer_data", None) or {}
        submitted = answer_data.get("items", []) if isinstance(answer_data, dict) else []
        text_answer = response.text_answer or ""
        if not submitted and text_answer:
            legacy_items = [item.strip() for item in text_answer.split(";") if item.strip()]
            if legacy_items and all(item.startswith("item:") for item in legacy_items):
                submitted = legacy_items
        if submitted and all(
            isinstance(item, str) and item.startswith("item:") for item in submitted
        ):
            text_by_id = {
                f"item:{item_id}": item
                for item_id, item in zip(self.item_ids(question, snapshot), items)
            }
            student_answer = [
                text_by_id.get(item, "Unavailable item") for item in submitted
            ]
        else:
            student_answer = submitted or text_answer
        return {
            "student_answer": student_answer,
            "correct_answer": items if show_correct_answers else None,
        }

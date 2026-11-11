import hashlib
import uuid

from django.conf import settings

from .base import GradeResult, QuestionType


def _stable_side_id(question, side, pair_id):
    value = f"{settings.SECRET_KEY}:{question.pk}:{side}:{pair_id}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class MatchingQuestionType(QuestionType):
    def validate_config(self, config):
        config = super().validate_config(config)
        pairs = config.get("pairs", [])
        if not isinstance(pairs, list) or any(
            not isinstance(pair, dict)
            or not isinstance(pair.get("left"), str)
            or not isinstance(pair.get("right"), str)
            for pair in pairs
        ):
            raise ValueError("pairs must contain left/right string objects.")
        normalized = []
        for index, pair in enumerate(pairs):
            left = pair["left"].strip()
            right = pair["right"].strip()
            if left and right:
                normalized.append(
                    {
                        "id": str(pair.get("id") or f"pair-{index + 1}"),
                        "left_id": str(pair.get("left_id") or uuid.uuid4().hex),
                        "right_id": str(pair.get("right_id") or uuid.uuid4().hex),
                        "left": left,
                        "right": right,
                    }
                )
        if len(normalized) < 2:
            raise ValueError("Matching questions require at least two pairs.")
        if (
            len({pair["id"] for pair in normalized}) != len(normalized)
            or len({pair["left_id"] for pair in normalized}) != len(normalized)
            or len({pair["right_id"] for pair in normalized}) != len(normalized)
            or {pair["left_id"] for pair in normalized}
            & {pair["right_id"] for pair in normalized}
        ):
            raise ValueError("Matching pair and side IDs must be unique and independent.")
        return {"pairs": normalized}

    def validate_answer_data(self, config, answer_data):
        answer_data = super().validate_answer_data(config, answer_data)
        if set(answer_data) - {"matches"}:
            raise ValueError("matching answers may contain only matches.")
        matches = answer_data.get("matches", {})
        if not isinstance(matches, dict) or any(
            not isinstance(left, str) or not isinstance(right, str)
            for left, right in matches.items()
        ):
            raise ValueError("matches must map left-side IDs to right-side IDs.")
        return {"matches": matches}

    def pairs(self, question, snapshot):
        pairs = self.config(snapshot).get("pairs", [])
        if pairs:
            return [
                {
                    "id": pair.get("id") or f"pair-{index + 1}",
                    "left_id": pair.get("left_id")
                    or _stable_side_id(
                        question, "left", pair.get("id") or index
                    ),
                    "right_id": pair.get("right_id")
                    or _stable_side_id(
                        question, "right", pair.get("id") or index
                    ),
                    "left": pair["left"],
                    "right": pair["right"],
                }
                for index, pair in enumerate(pairs)
            ]
        legacy = snapshot.get("correct_answer_text", question.correct_answer_text or "")
        result = []
        for pair in legacy.split(";"):
            if "=" in pair:
                left, right = pair.split("=", 1)
                index = len(result)
                result.append({
                    "id": f"legacy-{index}",
                    "left_id": _stable_side_id(question, "left", f"legacy:{index}"),
                    "right_id": _stable_side_id(question, "right", f"legacy:{index}"),
                    "left": left.strip(),
                    "right": right.strip(),
                })
        return result

    def serialize_for_student(self, question, snapshot, answer_order):
        pairs = self.pairs(question, snapshot)
        right_by_id = {
            f"right:{pair['right_id']}": pair["right"] for pair in pairs
        }
        ordered_ids = answer_order or list(right_by_id)
        return {
            "choices": [],
            "config": {
                "pairs": [
                    {"id": f"left:{pair['left_id']}", "text": pair["left"]}
                    for pair in pairs
                ],
                "right_options": [
                    {"id": option_id, "text": right_by_id[option_id]}
                    for option_id in ordered_ids
                    if option_id in right_by_id
                ],
            },
        }

    def grade(self, question, response, snapshot):
        pairs = self.pairs(question, snapshot)
        expected = {
            f"left:{pair['left_id']}": f"right:{pair['right_id']}"
            for pair in pairs
        }
        submitted = getattr(response, "answer_data", None) or {}
        submitted = submitted.get("matches", submitted) if isinstance(submitted, dict) else {}
        if not submitted and response.text_answer:
            submitted = {}
            for pair in response.text_answer.split(";"):
                if "=" in pair:
                    left, right = pair.split("=", 1)
                    submitted[left.strip().casefold()] = right.strip().casefold()
            if pairs and all(pair["id"].startswith("legacy-") for pair in pairs):
                expected = {
                    pair["left"].casefold(): pair["right"].casefold() for pair in pairs
                }
        if not submitted:
            return GradeResult(False, 0)
        correct_count = sum(
            submitted.get(left) == right for left, right in expected.items()
        )
        is_correct = bool(expected) and correct_count == len(expected) and len(submitted) == len(expected)
        marks = snapshot.get("marks", question.marks)
        negative_marks = snapshot.get("negative_marks", question.negative_marks)
        ratio = correct_count / len(expected) if expected else 0
        return self.mark_result(
            is_correct,
            marks,
            negative_marks,
            snapshot.get("partial_credit", question.partial_credit),
            ratio,
        )

    def serialize_for_review(self, question, response, snapshot, show_correct_answers):
        pairs = self.pairs(question, snapshot)
        answer_data = getattr(response, "answer_data", None) or {}
        matches = answer_data.get("matches", {}) if isinstance(answer_data, dict) else {}
        left_labels = {
            f"left:{pair['left_id']}": pair["left"] for pair in pairs
        }
        right_labels = {
            f"right:{pair['right_id']}": pair["right"] for pair in pairs
        }
        if matches:
            student_answer = [
                {
                    "left": left_labels.get(left_id, left_id),
                    "right": right_labels.get(right_id, right_id),
                }
                for left_id, right_id in matches.items()
            ]
        else:
            student_answer = response.text_answer or ""
        result = {
            "student_answer": student_answer,
            "correct_answer": [
                {"left": pair["left"], "right": pair["right"]} for pair in pairs
            ] if show_correct_answers else None,
        }
        return result

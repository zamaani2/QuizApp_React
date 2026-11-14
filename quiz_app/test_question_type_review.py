from types import SimpleNamespace

from django.test import SimpleTestCase

from .question_types import serialize_for_review


class StructuredQuestionReviewTests(SimpleTestCase):
    def test_matching_review_resolves_ids_in_legacy_text_answers(self):
        question = SimpleNamespace(
            pk=1,
            question_type="matching",
            correct_answer_text="",
        )
        response = SimpleNamespace(
            answer_data={},
            text_answer="left:word=right:application; left:linux=right:system",
        )
        snapshot = {
            "config": {
                "pairs": [
                    {
                        "id": "word",
                        "left_id": "word",
                        "right_id": "application",
                        "left": "Microsoft Word",
                        "right": "Application software",
                    },
                    {
                        "id": "linux",
                        "left_id": "linux",
                        "right_id": "system",
                        "left": "Linux",
                        "right": "System software",
                    },
                ]
            }
        }

        review = serialize_for_review(question, response, snapshot, True)

        self.assertEqual(
            review["student_answer"],
            [
                {"left": "Microsoft Word", "right": "Application software"},
                {"left": "Linux", "right": "System software"},
            ],
        )

    def test_ordering_review_resolves_ids_in_legacy_text_answers(self):
        question = SimpleNamespace(
            pk=2,
            question_type="ordering",
            correct_answer_text="",
        )
        response = SimpleNamespace(
            answer_data={},
            text_answer="item:needs; item:design; item:build",
        )
        snapshot = {
            "config": {
                "items": ["Requirements analysis", "Design", "Coding"],
                "item_ids": ["needs", "design", "build"],
            }
        }

        review = serialize_for_review(question, response, snapshot, True)

        self.assertEqual(
            review["student_answer"],
            ["Requirements analysis", "Design", "Coding"],
        )

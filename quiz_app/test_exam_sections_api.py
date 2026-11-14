import datetime
import json
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import (
    AnswerChoice,
    Question,
    QuestionGroup,
    Quiz,
    QuizAttempt,
    QuizResponse,
    QuizSection,
    SchoolInformation,
    Student,
    Subject,
    Teacher,
    User,
)


class ExamSectionsApiTests(TestCase):
    def setUp(self):
        self.school = SchoolInformation.objects.create(
            name="Section School",
            short_name="SECTION",
            slug="section-school",
            school_code="SEC01",
            address="1 Section Road",
            phone_number="1111111111",
        )
        self.other_school = SchoolInformation.objects.create(
            name="Other School",
            short_name="OTHER",
            slug="other-section-school",
            school_code="OTH01",
            address="2 Section Road",
            phone_number="2222222222",
        )
        self.teacher = Teacher.objects.create(
            full_name="Section Teacher",
            contact_number="111",
            school=self.school,
        )
        self.teacher_user = User.objects.get(teacher_profile=self.teacher)
        self.student = Student.objects.create(
            admission_number="SEC-001",
            full_name="Section Student",
            date_of_birth=datetime.date(2010, 1, 1),
            gender="F",
            parent_contact="111",
            admission_date=datetime.date(2026, 1, 1),
            school=self.school,
        )
        self.student_user = User.objects.get(student_profile=self.student)
        self.subject = Subject.objects.create(
            subject_name="Science", school=self.school
        )
        self.quiz = Quiz.objects.create(
            title="Sections Exam",
            slug="sections-exam",
            subject=self.subject,
            teacher=self.teacher,
            school=self.school,
            status="published",
            time_limit=0,
            max_attempts=3,
        )
        self._save_sequences = {}
        self.other_teacher = Teacher.objects.create(
            full_name="Other Section Teacher",
            contact_number="222",
            school=self.other_school,
        )
        self.other_subject = Subject.objects.create(
            subject_name="History", school=self.other_school
        )
        self.other_quiz = Quiz.objects.create(
            title="Other Exam",
            slug="other-exam-sections",
            subject=self.other_subject,
            teacher=self.other_teacher,
            school=self.other_school,
            status="published",
            time_limit=0,
        )

    def create_essay(self, title, section=None, marks=1):
        return Question.objects.create(
            quiz=self.quiz,
            school=self.school,
            section=section,
            question_text=title,
            question_type="essay",
            marks=marks,
        )

    def create_attempt(self):
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz,
            student=self.student,
            school=self.school,
            attempt_number=1,
        )
        attempt.capture_configuration()
        return attempt

    def save_text_answer(self, attempt, question, text="answer"):
        sequence = self._save_sequences.get(attempt.pk, 0) + 1
        self._save_sequences[attempt.pk] = sequence
        return self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": question.pk,
                "text_answer": text,
                "client_sequence": sequence,
            }),
            content_type="application/json",
        )

    def test_take_and_save_return_server_time_and_absolute_deadlines(self):
        self.quiz.time_limit = 30
        self.quiz.save(update_fields=["time_limit"])
        section = QuizSection.objects.create(
            quiz=self.quiz,
            school=self.school,
            title="Timed",
            order=1,
            time_limit_minutes=5,
        )
        question = self.create_essay("Timed answer", section)
        attempt = self.create_attempt()
        self.client.force_login(self.student_user)

        take = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        self.assertEqual(take.status_code, 200)
        take_data = take.json()
        self.assertIsNotNone(take_data["server_time"])
        self.assertEqual(
            datetime.datetime.fromisoformat(take_data["attempt_deadline_at"])
            - attempt.started_at,
            timedelta(minutes=30),
        )
        section_data = take_data["sections"][0]
        self.assertIsNotNone(section_data["deadline_at"])
        self.assertEqual(
            datetime.datetime.fromisoformat(section_data["deadline_at"])
            - datetime.datetime.fromisoformat(section_data["started_at"]),
            timedelta(minutes=5),
        )

        saved = self.save_text_answer(attempt, question)
        self.assertEqual(saved.status_code, 200, saved.content)
        self.assertIsNotNone(saved.json()["server_time"])
        self.assertEqual(saved.json()["attempt_deadline_at"], take_data["attempt_deadline_at"])
        self.assertEqual(saved.json()["section_deadline_at"], section_data["deadline_at"])

    def test_section_crud_and_tenant_isolation(self):
        self.client.force_login(self.teacher_user)
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_sections", args=[self.quiz.pk]),
            data=json.dumps({"title": "Part A", "instructions": "Read carefully."}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        section_id = response.json()["section"]["id"]

        response = self.client.patch(
            reverse(
                "quiz_app:api_teacher_quiz_section_detail",
                args=[self.other_quiz.pk, section_id],
            ),
            data=json.dumps({"title": "Foreign edit"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        self.client.force_login(self.student_user)
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_sections", args=[self.quiz.pk]),
            data=json.dumps({"title": "Student write"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_group_assignment_cannot_cross_quiz_or_section(self):
        section = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="Local section"
        )
        foreign_section = QuizSection.objects.create(
            quiz=self.other_quiz, school=self.other_school, title="Foreign section"
        )
        foreign_group = QuestionGroup.objects.create(
            quiz=self.other_quiz,
            school=self.other_school,
            section=foreign_section,
            title="Foreign group",
        )
        first_group = QuestionGroup.objects.create(
            quiz=self.quiz, school=self.school, section=section, title="First"
        )
        second_group = QuestionGroup.objects.create(
            quiz=self.quiz, school=self.school, section=section, title="Second"
        )
        question = self.create_essay("Local question", section)
        self.client.force_login(self.teacher_user)

        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_groups_reorder", args=[self.quiz.pk]),
            data=json.dumps({
                "section_id": section.pk,
                "group_ids": [second_group.pk, first_group.pk],
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        first_group.refresh_from_db()
        second_group.refresh_from_db()
        self.assertEqual((second_group.order, first_group.order), (1, 2))

        response = self.client.post(
            reverse("quiz_app:api_teacher_question_assignment", args=[self.quiz.pk]),
            data=json.dumps({
                "question_ids": [question.pk],
                "section_id": section.pk,
                "group_id": foreign_group.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_groups", args=[self.quiz.pk]),
            data=json.dumps({
                "section_id": foreign_section.pk,
                "title": "Invalid group",
                "stimulus_text": "Should not cross schools.",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_sections", args=[self.other_quiz.pk]),
            data=json.dumps({"title": "Foreign create"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_choose_n_requires_enough_equal_mark_questions_and_adjusts_total(self):
        section = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="Choose one", choose_n=1
        )
        first = self.create_essay("Question 1", section=section, marks=3)
        second = self.create_essay("Question 2", section=section, marks=3)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.total_marks, 3)

        self.client.force_login(self.teacher_user)
        response = self.client.patch(
            reverse(
                "quiz_app:api_teacher_quiz_section_detail",
                args=[self.quiz.pk, section.pk],
            ),
            data=json.dumps({"choose_n": 3}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.patch(
            reverse(
                "quiz_app:api_teacher_question_detail",
                args=[self.quiz.pk, second.pk],
            ),
            data=json.dumps({
                "question_type": "essay",
                "question_text": "Question 2",
                "marks": 4,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(first.section_id, section.pk)
        second.refresh_from_db()
        self.assertEqual(second.marks, 3)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.total_marks, 3)

    def test_timed_section_expiration_rejects_answer_and_locks_previous_section(self):
        first = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="Timed", order=1, time_limit_minutes=1
        )
        second = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="Next", order=2
        )
        first_question = self.create_essay("Timed question", first)
        second_question = self.create_essay("Next question", second)
        attempt = self.create_attempt()
        attempt.section_state = {
            str(first.pk): {
                "started_at": (timezone.now() - timedelta(minutes=2)).isoformat()
            }
        }
        attempt.save(update_fields=["section_state"])
        self.client.force_login(self.student_user)

        expired = self.save_text_answer(attempt, first_question)
        self.assertEqual(expired.status_code, 409)
        self.assertEqual(expired.json()["code"], "SECTION_TIME_EXPIRED")
        attempt.refresh_from_db()
        self.assertIn("started_at", attempt.section_state[str(second.pk)])

        next_save = self.save_text_answer(attempt, second_question)
        self.assertEqual(next_save.status_code, 200, next_save.content)
        locked = self.save_text_answer(attempt, first_question, "changed")
        self.assertEqual(locked.status_code, 409)
        self.assertEqual(locked.json()["code"], "SECTION_LOCKED")

    def test_leaving_a_timed_section_locks_it(self):
        first = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="First", order=1, time_limit_minutes=5
        )
        second = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="Second", order=2
        )
        question = self.create_essay("First question", first)
        self.create_essay("Second question", second)
        attempt = self.create_attempt()
        self.client.force_login(self.student_user)
        take = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        self.assertEqual(take.status_code, 200)
        self.assertEqual(take.json()["active_section_id"], first.pk)

        response = self.client.post(
            reverse(
                "quiz_app:api_student_quiz_section_submit",
                args=[attempt.pk, first.pk],
            ),
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["active_section_id"], second.pk)
        locked = self.save_text_answer(attempt, question)
        self.assertEqual(locked.status_code, 409)
        self.assertEqual(locked.json()["code"], "SECTION_LOCKED")

    def test_choose_n_limit_rejects_answers_beyond_the_rule(self):
        section = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="Pick one", choose_n=1
        )
        first = self.create_essay("First choice", section)
        second = self.create_essay("Second choice", section)
        attempt = self.create_attempt()
        self.client.force_login(self.student_user)

        accepted = self.save_text_answer(attempt, first)
        rejected = self.save_text_answer(attempt, second)
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(rejected.json()["code"], "CHOOSE_N_LIMIT")
        self.assertEqual(attempt.responses.count(), 1)

    def test_section_score_is_derived_from_attempt_responses(self):
        section = QuizSection.objects.create(
            quiz=self.quiz, school=self.school, title="Pick one", choose_n=1
        )
        question = self.create_essay("Graded response", section, marks=2)
        self.create_essay("Alternative response", section, marks=2)
        attempt = self.create_attempt()
        QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            school=self.school,
            text_answer="Student answer",
            marks_awarded=1,
            is_graded=True,
        )
        attempt.submit()
        self.client.force_login(self.student_user)

        response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.json()["section_scores"],
            [{"section_id": section.pk, "title": "Pick one", "score": 1.0, "total_marks": 2}],
        )

        self.client.force_login(self.teacher_user)
        teacher_result = self.client.get(
            reverse("quiz_app:api_teacher_result_detail", args=[attempt.pk])
        )
        self.assertEqual(teacher_result.status_code, 200, teacher_result.content)
        self.assertEqual(
            teacher_result.json()["section_scores"],
            [{"section_id": section.pk, "title": "Pick one", "score": 1.0, "total_marks": 2}],
        )

    def test_snapshot_is_immutable_and_take_payload_has_no_correct_answers(self):
        section = QuizSection.objects.create(
            quiz=self.quiz,
            school=self.school,
            title="Reading",
            instructions="Use the passage.",
            time_limit_minutes=5,
        )
        group = QuestionGroup.objects.create(
            quiz=self.quiz,
            school=self.school,
            section=section,
            title="Passage",
            stimulus_text="Snapshot passage.",
        )
        question = Question.objects.create(
            quiz=self.quiz,
            school=self.school,
            section=section,
            group=group,
            question_text="Choose the answer.",
            question_type="multiple_choice",
            marks=2,
        )
        AnswerChoice.objects.create(
            question=question,
            school=self.school,
            choice_text="Correct",
            is_correct=True,
        )
        AnswerChoice.objects.create(
            question=question,
            school=self.school,
            choice_text="Incorrect",
            is_correct=False,
        )
        attempt = self.create_attempt()
        old_snapshot = json.loads(json.dumps(attempt.configuration_snapshot))
        section.title = "Edited title"
        section.instructions = "Edited instructions."
        section.save()
        group.stimulus_text = "Edited passage."
        group.save()
        question.question_text = "Edited question."
        question.save(update_fields=["question_text"])

        self.client.force_login(self.student_user)
        response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["sections"][0]["title"], "Reading")
        self.assertEqual(payload["sections"][0]["instructions"], "Use the passage.")
        self.assertEqual(
            payload["sections"][0]["groups"][0]["stimulus_text"],
            "Snapshot passage.",
        )
        self.assertEqual(payload["questions"][0]["question_text"], "Choose the answer.")
        self.assertEqual(attempt.configuration_snapshot, old_snapshot)
        serialized = json.dumps(payload)
        self.assertNotIn('"is_correct"', serialized)
        self.assertNotIn('"correct_answer_text"', serialized)

    def test_quizzes_without_sections_keep_legacy_order_and_total_marks(self):
        first = self.create_essay("First question", marks=2)
        second = self.create_essay("Second question", marks=3)
        self.quiz.randomize_questions = False
        self.quiz.save(update_fields=["randomize_questions"])
        self.quiz.calculate_total_marks()
        attempt = self.create_attempt()
        self.assertEqual(attempt.question_order, [first.pk, second.pk])
        self.assertEqual(attempt.configuration_snapshot["sections"], [])
        self.assertEqual(attempt.configuration_snapshot["quiz"]["total_marks"], 5)

        self.client.force_login(self.student_user)
        response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["section_timing_enabled"], False)
        self.assertEqual(response.json()["sections"], [])

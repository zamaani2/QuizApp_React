"""
Integration and security tests for Phase 4 Teacher Workspace APIs.

Covers:
- GET /api/v1/dashboard/teacher/ (positive teacher/admin, negative student barrier)
- GET /api/v1/teacher/quizzes/ (cross-teacher and cross-school negative isolation, filtering)
- GET /api/v1/teacher/quizzes/<id>/ (ownership enforcement, question & choice breakdown)
- GET /api/v1/teacher/results/ (student attempts & scores)
- GET /api/v1/teacher/grading/ (manual grading queue)
"""
import json
import datetime
from django.test import TestCase, Client
from django.urls import reverse
from django.utils import timezone

from .models import (
    User,
    SchoolInformation,
    Teacher,
    Student,
    AcademicYear,
    Term,
    Subject,
    Class,
    StudentClass,
    Quiz,
    Question,
    AnswerChoice,
    QuizAttempt,
    QuizResponse,
)


class Phase4ApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.password = "TestPassword-123!"

        # School A
        self.school_a = SchoolInformation.objects.create(
            name="Alpha Academy",
            short_name="ALPHA",
            slug="alpha-academy",
            school_code="ALP01",
            address="1 Alpha Way",
            phone_number="1111111111",
            is_active=True,
        )
        self.academic_year_a = AcademicYear.objects.create(
            name="2026/2027",
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 12, 31),
            school=self.school_a,
            is_current=True,
        )
        self.term_a = Term.objects.create(
            academic_year=self.academic_year_a,
            term_number=1,
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 4, 30),
            school=self.school_a,
            is_current=True,
        )
        self.subject_a = Subject.objects.create(
            subject_name="Mathematics",
            subject_code="MATH01",
            school=self.school_a,
        )
        self.class_a = Class.objects.create(
            name="Class 1A",
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        # School B (cross-school negative isolation)
        self.school_b = SchoolInformation.objects.create(
            name="Beta High",
            short_name="BETA",
            slug="beta-high",
            school_code="BET01",
            address="2 Beta Blvd",
            phone_number="2222222222",
            is_active=True,
        )
        self.academic_year_b = AcademicYear.objects.create(
            name="2026/2027",
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 12, 31),
            school=self.school_b,
            is_current=True,
        )
        self.subject_b = Subject.objects.create(
            subject_name="Physics",
            subject_code="PHYS01",
            school=self.school_b,
        )

        # Teachers
        # Teacher A1 (School A)
        self.teacher_a1_profile = Teacher.objects.create(
            full_name="Teacher Alpha 1",
            contact_number="1111",
            school=self.school_a,
        )
        self.teacher_a1_user = User.objects.get(teacher_profile=self.teacher_a1_profile)
        self.teacher_a1_user.set_password(self.password)
        self.teacher_a1_user.save()

        # Teacher A2 (School A - for cross-teacher isolation tests)
        self.teacher_a2_profile = Teacher.objects.create(
            full_name="Teacher Alpha 2",
            contact_number="2222",
            school=self.school_a,
        )
        self.teacher_a2_user = User.objects.get(teacher_profile=self.teacher_a2_profile)
        self.teacher_a2_user.set_password(self.password)
        self.teacher_a2_user.save()

        # Teacher B1 (School B)
        self.teacher_b1_profile = Teacher.objects.create(
            full_name="Teacher Beta 1",
            contact_number="3333",
            school=self.school_b,
        )
        self.teacher_b1_user = User.objects.get(teacher_profile=self.teacher_b1_profile)
        self.teacher_b1_user.set_password(self.password)
        self.teacher_b1_user.save()

        # Admin in School A
        self.admin_a = User.objects.create_user(
            username="admin_alpha",
            email="admin@alpha.test",
            password=self.password,
            role="admin",
            school=self.school_a,
        )

        # Student in School A
        self.student_a1_profile = Student.objects.create(
            admission_number="STD-001",
            full_name="Student Alpha 1",
            date_of_birth="2010-01-01",
            gender="M",
            parent_contact="1234",
            admission_date="2026-01-01",
            school=self.school_a,
        )
        self.student_a1_user = User.objects.get(student_profile=self.student_a1_profile)
        self.student_a1_user.set_password(self.password)
        self.student_a1_user.save()

        StudentClass.objects.create(
            student=self.student_a1_profile,
            assigned_class=self.class_a,
            school=self.school_a,
            is_active=True,
        )

        # Quizzes
        # Quiz 1: Owned by Teacher A1 in School A (Published)
        self.quiz_a1 = Quiz.objects.create(
            title="Algebra Fundamentals",
            subject=self.subject_a,
            teacher=self.teacher_a1_profile,
            academic_year=self.academic_year_a,
            term=self.term_a,
            status="published",
            time_limit=45,
            total_marks=20,
            passing_marks=10,
            school=self.school_a,
            is_active=True,
        )
        self.quiz_a1.classes.add(self.class_a)

        # Question & Choices for Quiz A1
        self.question_mc = Question.objects.create(
            quiz=self.quiz_a1,
            question_type="multiple_choice",
            question_text="What is 5 + 3?",
            marks=10,
            order=1,
            school=self.school_a,
        )
        AnswerChoice.objects.create(
            question=self.question_mc,
            choice_text="8",
            is_correct=True,
            order=1,
            school=self.school_a,
        )
        AnswerChoice.objects.create(
            question=self.question_mc,
            choice_text="9",
            is_correct=False,
            order=2,
            school=self.school_a,
        )

        # Essay question for Quiz A1 (needs manual grading)
        self.question_essay = Question.objects.create(
            quiz=self.quiz_a1,
            question_type="essay",
            question_text="Explain the quadratic formula.",
            marks=10,
            order=2,
            school=self.school_a,
        )

        # Quiz 2: Owned by Teacher A2 in School A (Draft)
        self.quiz_a2 = Quiz.objects.create(
            title="Geometry Draft",
            subject=self.subject_a,
            teacher=self.teacher_a2_profile,
            academic_year=self.academic_year_a,
            term=self.term_a,
            status="draft",
            time_limit=30,
            total_marks=10,
            passing_marks=5,
            school=self.school_a,
            is_active=True,
        )

        # Quiz 3: Owned by Teacher B1 in School B
        self.quiz_b1 = Quiz.objects.create(
            title="Mechanics Intro",
            subject=self.subject_b,
            teacher=self.teacher_b1_profile,
            academic_year=self.academic_year_b,
            status="published",
            time_limit=60,
            total_marks=50,
            passing_marks=25,
            school=self.school_b,
            is_active=True,
        )

        # Attempts for Quiz A1
        self.attempt_graded = QuizAttempt.objects.create(
            quiz=self.quiz_a1,
            student=self.student_a1_profile,
            score=18.0,
            percentage=90.0,
            is_submitted=True,
            is_completed=True,
            needs_grading=False,
            is_graded=True,
            submitted_at=timezone.now(),
            school=self.school_a,
        )

        self.attempt_needs_grading = QuizAttempt.objects.create(
            quiz=self.quiz_a1,
            student=self.student_a1_profile,
            score=8.0,
            percentage=40.0,
            is_submitted=True,
            is_completed=True,
            needs_grading=True,
            is_graded=False,
            submitted_at=timezone.now(),
            school=self.school_a,
        )

        QuizResponse.objects.create(
            attempt=self.attempt_needs_grading,
            question=self.question_essay,
            text_answer="The formula is x = (-b +- sqrt(b^2-4ac))/(2a)",
            is_graded=False,
            school=self.school_a,
        )

    # 1. Teacher Dashboard API
    def test_teacher_dashboard_permitted_for_teacher(self):
        self.client.force_login(self.teacher_a1_user)
        response = self.client.get(reverse("quiz_app:api_teacher_dashboard"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["teacher_name"], "Teacher Alpha 1")
        # Teacher A1 owns 1 quiz
        self.assertEqual(data["total_quizzes"], 1)
        self.assertEqual(data["published_quizzes"], 1)
        self.assertEqual(data["draft_quizzes"], 0)
        self.assertEqual(data["total_attempts"], 2)
        self.assertEqual(data["quizzes_needing_grading_count"], 1)

    def test_teacher_dashboard_permitted_for_admin(self):
        self.client.force_login(self.admin_a)
        response = self.client.get(reverse("quiz_app:api_teacher_dashboard"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Admin sees all quizzes in School A (Quiz A1 and Quiz A2)
        self.assertEqual(data["total_quizzes"], 2)

    def test_teacher_dashboard_forbidden_for_student(self):
        self.client.force_login(self.student_a1_user)
        response = self.client.get(reverse("quiz_app:api_teacher_dashboard"))
        self.assertEqual(response.status_code, 403)

    def test_teacher_dashboard_unauthenticated_returns_401(self):
        response = self.client.get(reverse("quiz_app:api_teacher_dashboard"))
        self.assertEqual(response.status_code, 401)

    # 2. Teacher Quizzes List API (Cross-teacher & Cross-school isolation)
    def test_teacher_quizzes_scoped_to_teacher_and_school(self):
        self.client.force_login(self.teacher_a1_user)
        response = self.client.get(reverse("quiz_app:api_teacher_quizzes"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        quiz_titles = [q["title"] for q in data["results"]]

        # Teacher A1 sees their own quiz
        self.assertIn("Algebra Fundamentals", quiz_titles)
        # Negative isolation: Teacher A1 must NOT see Teacher A2's quiz
        self.assertNotIn("Geometry Draft", quiz_titles)
        # Negative cross-school isolation: Teacher A1 must NOT see School B's quiz
        self.assertNotIn("Mechanics Intro", quiz_titles)

    def test_teacher_quizzes_status_filter(self):
        self.client.force_login(self.admin_a)
        # Admin requests only draft quizzes
        response = self.client.get(reverse("quiz_app:api_teacher_quizzes") + "?status=draft")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        titles = [q["title"] for q in data["results"]]
        self.assertIn("Geometry Draft", titles)
        self.assertNotIn("Algebra Fundamentals", titles)

    # 3. Quiz Detail API
    def test_teacher_quiz_detail_permitted_for_owner(self):
        self.client.force_login(self.teacher_a1_user)
        response = self.client.get(
            reverse("quiz_app:api_teacher_quiz_detail", kwargs={"quiz_id": self.quiz_a1.pk})
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Algebra Fundamentals")
        self.assertEqual(len(data["questions"]), 2)
        # Verify choice text is present for owner
        mc_q = [q for q in data["questions"] if q["question_type"] == "multiple_choice"][0]
        choice_texts = [c["choice_text"] for c in mc_q["choices"]]
        self.assertIn("8", choice_texts)

    def test_teacher_quiz_detail_forbidden_for_other_teacher(self):
        # Teacher A2 attempts to access Teacher A1's quiz
        self.client.force_login(self.teacher_a2_user)
        response = self.client.get(
            reverse("quiz_app:api_teacher_quiz_detail", kwargs={"quiz_id": self.quiz_a1.pk})
        )
        # Fails closed (404/403)
        self.assertIn(response.status_code, [403, 404])

    # 4. Results & Grading APIs
    def test_teacher_results_and_grading_queues(self):
        self.client.force_login(self.teacher_a1_user)

        # Results endpoint
        res_response = self.client.get(reverse("quiz_app:api_teacher_results"))
        self.assertEqual(res_response.status_code, 200)
        res_data = res_response.json()
        self.assertEqual(res_data["count"], 2)
        students = [r["student_name"] for r in res_data["results"]]
        self.assertIn("Student Alpha 1", students)

        # Grading queue endpoint
        grade_response = self.client.get(reverse("quiz_app:api_teacher_grading"))
        self.assertEqual(grade_response.status_code, 200)
        grade_data = grade_response.json()
        self.assertEqual(grade_data["count"], 1)
        self.assertEqual(grade_data["results"][0]["ungraded_responses_count"], 1)

    def test_manual_grading_queue_includes_responses_without_answer_keys(self):
        matching = Question.objects.create(
            quiz=self.quiz_a1,
            question_type="matching",
            question_text="Match the terms",
            marks=4,
            order=3,
            school=self.school_a,
        )
        ordering = Question.objects.create(
            quiz=self.quiz_a1,
            question_type="ordering",
            question_text="Order the steps",
            marks=3,
            order=4,
            school=self.school_a,
        )
        short_answer = Question.objects.create(
            quiz=self.quiz_a1,
            question_type="short_answer",
            question_text="Explain the principle",
            marks=2,
            order=5,
            school=self.school_a,
        )
        multiple_choice = Question.objects.create(
            quiz=self.quiz_a1,
            question_type="multiple_choice",
            question_text="Choose the best explanation",
            marks=1,
            order=6,
            school=self.school_a,
        )
        first_choice = AnswerChoice.objects.create(
            question=multiple_choice,
            choice_text="First option",
            is_correct=False,
            order=1,
            school=self.school_a,
        )
        AnswerChoice.objects.create(
            question=multiple_choice,
            choice_text="Second option",
            is_correct=False,
            order=2,
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a1,
            student=self.student_a1_profile,
            attempt_number=3,
            is_submitted=True,
            is_completed=True,
            submitted_at=timezone.now(),
            school=self.school_a,
        )
        attempt.capture_configuration()
        matching_response = QuizResponse.objects.create(
            attempt=attempt,
            question=matching,
            answer_data={"matches": {"left-unmatched": "right-unmatched"}},
            school=self.school_a,
        )
        ordering_response = QuizResponse.objects.create(
            attempt=attempt,
            question=ordering,
            answer_data={"items": ["first", "second"]},
            school=self.school_a,
        )
        short_answer_response = QuizResponse.objects.create(
            attempt=attempt,
            question=short_answer,
            text_answer="My explanation",
            school=self.school_a,
        )
        multiple_choice_response = QuizResponse.objects.create(
            attempt=attempt,
            question=multiple_choice,
            selected_choice=first_choice,
            school=self.school_a,
        )
        attempt.calculate_score()
        attempt.refresh_from_db()
        self.assertTrue(attempt.needs_grading)

        self.client.force_login(self.teacher_a1_user)
        queue = self.client.get(reverse("quiz_app:api_teacher_grading")).json()
        queued_attempt = next(row for row in queue["results"] if row["id"] == attempt.pk)
        self.assertEqual(queued_attempt["ungraded_responses_count"], 4)

        detail = self.client.get(
            reverse("quiz_app:api_teacher_grading_detail", args=[attempt.pk])
        ).json()
        self.assertEqual(
            {response["question_type"] for response in detail["responses"]},
            {"matching", "ordering", "short_answer", "multiple_choice"},
        )
        self.assertEqual(
            {response["id"] for response in detail["responses"]},
            {
                matching_response.pk,
                ordering_response.pk,
                short_answer_response.pk,
                multiple_choice_response.pk,
            },
        )

        grades = (
            (matching_response, 3.5),
            (ordering_response, 2.5),
            (short_answer_response, 1.5),
            (multiple_choice_response, 0.5),
        )
        for response, marks in grades:
            grade_response = self.client.post(
                reverse("quiz_app:api_teacher_response_grade", args=[response.pk]),
                data=json.dumps({"marks_awarded": marks, "grading_notes": "Reviewed"}),
                content_type="application/json",
            )
            self.assertEqual(grade_response.status_code, 200, grade_response.content)

        attempt.refresh_from_db()
        self.assertAlmostEqual(attempt.score, 8)
        self.assertFalse(attempt.needs_grading)
        self.assertTrue(attempt.is_graded)
        queue = self.client.get(reverse("quiz_app:api_teacher_grading")).json()
        self.assertNotIn(attempt.pk, {row["id"] for row in queue["results"]})

    def test_teacher_grading_forbidden_for_student(self):
        self.client.force_login(self.student_a1_user)
        response = self.client.get(reverse("quiz_app:api_teacher_grading"))
        self.assertEqual(response.status_code, 403)

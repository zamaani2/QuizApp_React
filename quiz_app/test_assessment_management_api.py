import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from .models import (
    AcademicYear,
    Class,
    Question,
    Quiz,
    QuizAttempt,
    QuizResponse,
    SchoolInformation,
    Student,
    Subject,
    Teacher,
    TeacherSubjectAssignment,
    User,
)


class AssessmentManagementApiTests(TestCase):
    def setUp(self):
        self.school_a = SchoolInformation.objects.create(
            name="Alpha School", short_name="ALPHA", slug="alpha-assess",
            school_code="ALA01", is_active=True,
        )
        self.school_b = SchoolInformation.objects.create(
            name="Beta School", short_name="BETA", slug="beta-assess",
            school_code="BEA01", is_active=True,
        )
        self.admin = User.objects.create_user(
            username="assess-admin", email="assess-admin@example.com",
            password="TestPassword-123!", full_name="Assess Admin",
            role="admin", school=self.school_a,
        )
        self.teacher = Teacher.objects.create(
            full_name="Assess Teacher", contact_number="111", school=self.school_a,
        )
        self.teacher_user = User.objects.get(teacher_profile=self.teacher)
        self.teacher_user.set_password("TestPassword-123!")
        self.teacher_user.save(update_fields=["password"])
        self.other_teacher = Teacher.objects.create(
            full_name="Other Teacher", contact_number="222", school=self.school_a,
        )
        self.year = AcademicYear.objects.create(
            name="2026", start_date="2026-01-01", end_date="2026-12-31", school=self.school_a,
        )
        self.class_a = Class.objects.create(
            name="Alpha Class", academic_year=self.year, school=self.school_a,
        )
        self.subject = Subject.objects.create(subject_name="Science", school=self.school_a)
        TeacherSubjectAssignment.objects.create(
            teacher=self.teacher, subject=self.subject, class_assigned=self.class_a,
            academic_year=self.year, school=self.school_a, is_active=True,
        )
        self.quiz = Quiz.objects.create(
            title="Draft Quiz", slug="draft-quiz-assess", subject=self.subject,
            teacher=self.teacher, school=self.school_a, status="draft",
        )
        self.other_quiz = Quiz.objects.create(
            title="Other Quiz", slug="other-quiz-assess", subject=self.subject,
            teacher=self.other_teacher, school=self.school_a, status="published",
        )
        self.beta_teacher = Teacher.objects.create(
            full_name="Beta Teacher", contact_number="333", school=self.school_b,
        )
        self.beta_subject = Subject.objects.create(subject_name="History", school=self.school_b)
        self.beta_quiz = Quiz.objects.create(
            title="Beta Quiz", slug="beta-quiz-assess", subject=self.beta_subject,
            teacher=self.beta_teacher, school=self.school_b, status="published",
        )
        self.student = Student.objects.create(
            admission_number="ASS001", full_name="Assess Student",
            date_of_birth="2010-01-01", gender="F", parent_contact="111",
            admission_date="2026-01-01", school=self.school_a,
        )
        self.student_user = User.objects.get(student_profile=self.student)

    def test_tenant_isolation_blocks_cross_school_writes(self):
        self.client.force_login(self.admin)
        response = self.client.patch(
            reverse("quiz_app:api_teacher_quiz_detail", args=[self.beta_quiz.pk]),
            data=json.dumps({"title": "Hijacked"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            reverse("quiz_app:api_teacher_questions", args=[self.beta_quiz.pk]),
            data=json.dumps({"question_text": "Foreign", "question_type": "essay"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_teacher_owns_quiz_rule(self):
        self.client.force_login(self.teacher_user)
        response = self.client.patch(
            reverse("quiz_app:api_teacher_quiz_detail", args=[self.other_quiz.pk]),
            data=json.dumps({"title": "Taken over"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_status", args=[self.other_quiz.pk]),
            data=json.dumps({"status": "draft"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_wrong_role_cannot_mutate_assessments(self):
        self.client.force_login(self.student_user)
        response = self.client.post(
            reverse("quiz_app:api_teacher_quizzes"),
            data=json.dumps({"title": "Student quiz", "subject": self.subject.pk, "teacher": self.teacher.pk}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_published_quiz_requires_a_question(self):
        self.client.force_login(self.teacher_user)
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_status", args=[self.quiz.pk]),
            data=json.dumps({"status": "published"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "VALIDATION_ERROR")
        Question.objects.create(
            quiz=self.quiz, question_text="Ready", question_type="essay", marks=2, school=self.school_a,
        )
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_status", args=[self.quiz.pk]),
            data=json.dumps({"status": "published"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.status, "published")

    def test_import_reports_row_errors_and_partial_success(self):
        self.client.force_login(self.teacher_user)
        upload = SimpleUploadedFile(
            "questions.csv",
            b"question_text,question_type,marks\nValid essay,essay,2\n,essay,1\n",
            content_type="text/csv",
        )
        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {"import_file": upload},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["imported"], 1)
        self.assertTrue(payload["partial_success"])
        self.assertTrue(payload["errors"])
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.total_marks, 2)

    def test_grading_cannot_exceed_question_marks(self):
        question = Question.objects.create(
            quiz=self.quiz, question_text="Essay", question_type="essay", marks=4, school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz, student=self.student, school=self.school_a,
            attempt_number=1, is_submitted=True,
        )
        response_obj = QuizResponse.objects.create(
            attempt=attempt, question=question, school=self.school_a, text_answer="Answer",
        )
        self.client.force_login(self.teacher_user)
        response = self.client.post(
            reverse("quiz_app:api_teacher_response_grade", args=[response_obj.pk]),
            data=json.dumps({"marks_awarded": 9, "grading_notes": "Too high"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "VALIDATION_ERROR")
        response_obj.refresh_from_db()
        self.assertFalse(response_obj.is_graded)
        response = self.client.post(
            reverse("quiz_app:api_teacher_response_grade", args=[response_obj.pk]),
            data=json.dumps({"marks_awarded": 3, "grading_notes": "Good"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        response_obj.refresh_from_db()
        self.assertEqual(response_obj.marks_awarded, 3)

    def test_legacy_assessment_posts_are_gone(self):
        self.client.force_login(self.admin)
        response = self.client.post(reverse("quiz_app:quiz_create"), data={})
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "LEGACY_ENDPOINT_GONE")
        response = self.client.post(reverse("quiz_app:question_create", args=[self.quiz.pk]), data={})
        self.assertEqual(response.status_code, 410)

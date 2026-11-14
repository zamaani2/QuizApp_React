"""
Integration, security, and safeguard tests for Phase 5 Student Learning Portal & Quiz Taking APIs.

Governed by REACT_FRONTEND_MIGRATION_PLAN.md Section 8 and docs/REACT_API_CONTRACTS.md:
1. Server is authoritative for timer, attempt state, scoring, and correct answers.
2. Correct answers (is_correct) are NEVER returned during quiz taking (GET /api/v1/student/attempts/<id>/take/).
3. Submission is idempotent (POST /api/v1/student/attempts/<id>/submit/).
4. Deadline enforcement auto-submits on timer expiration.
5. Multi-tenant and role scoping: Students only see their school/class data; teachers/admins get 403.
"""
import datetime
import json
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


class Phase5StudentApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.password = "TestPassword-123!"

        # School A
        self.school_a = SchoolInformation.objects.create(
            name="Gryffindor Academy",
            short_name="GRYFF",
            slug="gryffindor-academy",
            school_code="GRY01",
            address="1 Lion Way",
            phone_number="1111111111",
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
        self.school_a.current_academic_year = self.academic_year_a
        self.school_a.current_term = self.term_a
        self.school_a.save()

        # Class A
        self.class_a = Class.objects.create(
            name="Year 1",
            school=self.school_a,
            academic_year=self.academic_year_a,
        )

        # Subject A
        self.subject_a = Subject.objects.create(
            subject_name="Defense Against the Dark Arts",
            subject_code="DADA101",
            school=self.school_a,
        )

        # Teacher A
        self.teacher_a = Teacher.objects.create(
            full_name="Prof Remus Lupin",
            contact_number="1111",
            school=self.school_a,
        )
        self.user_teacher_a = User.objects.get(teacher_profile=self.teacher_a)
        self.user_teacher_a.set_password(self.password)
        self.user_teacher_a.save()

        # Student A (Enrolled in Class A)
        self.student_a = Student.objects.create(
            admission_number="ADM-001",
            full_name="Harry Potter",
            date_of_birth="2010-07-31",
            gender="M",
            parent_contact="1111",
            admission_date="2026-01-01",
            school=self.school_a,
        )
        self.user_student_a = User.objects.get(student_profile=self.student_a)
        self.user_student_a.set_password(self.password)
        self.user_student_a.save()

        self.enrollment_a = StudentClass.objects.create(
            student=self.student_a,
            assigned_class=self.class_a,
            school=self.school_a,
            )

        # Student B (School A, Class B)
        self.class_b = Class.objects.create(
            name="Year 2",
            school=self.school_a,
            academic_year=self.academic_year_a,
        )
        self.student_b = Student.objects.create(
            admission_number="ADM-002",
            full_name="Ron Weasley",
            date_of_birth="2010-03-01",
            gender="M",
            parent_contact="2222",
            admission_date="2026-01-01",
            school=self.school_a,
        )
        self.user_student_b = User.objects.get(student_profile=self.student_b)
        self.user_student_b.set_password(self.password)
        self.user_student_b.save()

        self.enrollment_b = StudentClass.objects.create(
            student=self.student_b,
            assigned_class=self.class_b,
            school=self.school_a,
            )

        # School X (Multi-tenant check)
        self.school_x = SchoolInformation.objects.create(
            name="Slytherin Academy",
            short_name="SLYTH",
            slug="slytherin-academy",
            school_code="SLY01",
            address="1 Snake Road",
            phone_number="2222222222",
            )
        self.student_x = Student.objects.create(
            admission_number="ADM-009",
            full_name="Draco Malfoy",
            date_of_birth="2010-06-05",
            gender="M",
            parent_contact="3333",
            admission_date="2026-01-01",
            school=self.school_x,
        )
        self.user_student_x = User.objects.get(student_profile=self.student_x)
        self.user_student_x.set_password(self.password)
        self.user_student_x.save()

        # Published Quiz assigned to Class A
        self.quiz = Quiz.objects.create(
            title="Boggarts and Dementors Exam",
            description="Testing defensive charm knowledge",
            instructions="Answer all questions carefully.",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            academic_year=self.academic_year_a,
            term=self.term_a,
            status="published",
            
            
            time_limit=30,
            total_marks=20,
            passing_marks=10,
            
            max_attempts=2,
            allow_review=True,
            show_correct_answers=True,
        )
        self.quiz.classes.add(self.class_a)

        # Questions for Quiz
        self.question_mcq = Question.objects.create(
            quiz=self.quiz,
            school=self.school_a,
            question_text="Which charm banishes a Boggart?",
            question_type="multiple_choice",
            marks=10,
            order=1,
            )
        self.choice_correct = AnswerChoice.objects.create(
            question=self.question_mcq,
            school=self.school_a,
            choice_text="Riddikulus",
            is_correct=True,
            order=1,
        )
        self.choice_wrong = AnswerChoice.objects.create(
            question=self.question_mcq,
            school=self.school_a,
            choice_text="Lumos",
            is_correct=False,
            order=2,
        )

        self.question_essay = Question.objects.create(
            quiz=self.quiz,
            school=self.school_a,
            question_text="Explain the effect of a Patronus on a Dementor.",
            question_type="essay",
            marks=10,
            order=2,
            )

    def test_student_dashboard_requires_authentication(self):
        """Unauthenticated request must return 401."""
        response = self.client.get(reverse("quiz_app:api_student_dashboard"))
        self.assertEqual(response.status_code, 401)

    def test_student_dashboard_role_barrier(self):
        """Teacher cannot access student dashboard (403)."""
        self.client.login(username=self.user_teacher_a.username, password=self.password)
        response = self.client.get(reverse("quiz_app:api_student_dashboard"))
        self.assertEqual(response.status_code, 403)

    def test_student_dashboard_success(self):
        """Student gets class info, available quizzes, and attempts."""
        self.client.login(username=self.user_student_a.username, password=self.password)
        response = self.client.get(reverse("quiz_app:api_student_dashboard"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["student_name"], "Harry Potter")
        self.assertEqual(data["class_name"], "Year 1")
        self.assertEqual(data["total_available"], 1)
        self.assertEqual(len(data["available_quizzes"]), 1)
        self.assertEqual(data["available_quizzes"][0]["title"], "Boggarts and Dementors Exam")

    def test_student_quizzes_assigned_to_class_only(self):
        """Student A in Year 1 sees the quiz; Student B in Year 2 does not."""
        self.client.login(username=self.user_student_a.username, password=self.password)
        response_a = self.client.get(reverse("quiz_app:api_student_quizzes"))
        self.assertEqual(response_a.status_code, 200)
        self.assertEqual(len(response_a.json()["quizzes"]), 1)

        self.client.login(username=self.user_student_b.username, password=self.password)
        response_b = self.client.get(reverse("quiz_app:api_student_quizzes"))
        self.assertEqual(response_b.status_code, 200)
        self.assertEqual(len(response_b.json()["quizzes"]), 0)

    def test_student_quiz_detail_access(self):
        """Student can view rules of quiz assigned to class; unauthorized class gets 403."""
        self.client.login(username=self.user_student_a.username, password=self.password)
        response = self.client.get(
            reverse("quiz_app:api_student_quiz_detail", kwargs={"quiz_id": self.quiz.id})
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Boggarts and Dementors Exam")
        self.assertEqual(data["can_attempt"], True)
        self.assertEqual(data["duration_minutes"], 30)

        # Student B (different class) gets 403
        self.client.login(username=self.user_student_b.username, password=self.password)
        response_b = self.client.get(
            reverse("quiz_app:api_student_quiz_detail", kwargs={"quiz_id": self.quiz.id})
        )
        self.assertEqual(response_b.status_code, 403)

    def test_student_quiz_start_and_resume(self):
        """POST start creates attempt; second start resumes existing in-progress attempt."""
        self.client.login(username=self.user_student_a.username, password=self.password)
        url = reverse("quiz_app:api_student_quiz_start", kwargs={"quiz_id": self.quiz.id})

        response = self.client.post(url, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertFalse(data["resumed"])
        attempt_id = data["attempt_id"]

        # Call start again -> should resume existing attempt
        response_resume = self.client.post(url, content_type="application/json")
        self.assertEqual(response_resume.status_code, 200)
        data_resume = response_resume.json()
        self.assertTrue(data_resume["resumed"])
        self.assertEqual(data_resume["attempt_id"], attempt_id)

    def test_quiz_take_safeguard_never_exposes_is_correct(self):
        """
        HIGH-RISK SAFEGUARD (Rule 8.1):
        GET /api/v1/student/attempts/<id>/take/ must NEVER expose `is_correct` on choices.
        """
        self.client.login(username=self.user_student_a.username, password=self.password)
        start_res = self.client.post(
            reverse("quiz_app:api_student_quiz_start", kwargs={"quiz_id": self.quiz.id}),
            content_type="application/json",
        )
        attempt_id = start_res.json()["attempt_id"]

        take_res = self.client.get(
            reverse("quiz_app:api_student_quiz_take", kwargs={"attempt_id": attempt_id})
        )
        self.assertEqual(take_res.status_code, 200)
        take_data = take_res.json()
        self.assertEqual(take_data["total_questions"], 2)
        self.assertFalse(take_data["is_submitted"])

        # Check every question and choice for lack of is_correct flag
        for q in take_data["questions"]:
            for choice in q["choices"]:
                self.assertNotIn(
                    "is_correct",
                    choice,
                    "CRITICAL SECURITY FAILURE: is_correct leaked in take view choices!",
                )

    def test_quiz_save_autosave(self):
        """Student response save updates choices and text answers asynchronously."""
        self.client.login(username=self.user_student_a.username, password=self.password)
        start_res = self.client.post(
            reverse("quiz_app:api_student_quiz_start", kwargs={"quiz_id": self.quiz.id}),
            content_type="application/json",
        )
        attempt_id = start_res.json()["attempt_id"]

        save_url = reverse("quiz_app:api_student_quiz_save", kwargs={"attempt_id": attempt_id})

        # Save MCQ choice
        payload_mcq = {
            "question_id": self.question_mcq.id,
            "choice_id": self.choice_correct.id,
            "client_sequence": 1,
        }
        res_mcq = self.client.post(save_url, data=json.dumps(payload_mcq), content_type="application/json")
        self.assertEqual(res_mcq.status_code, 200)
        self.assertTrue(res_mcq.json()["success"])

        # Save Essay text answer
        payload_essay = {
            "question_id": self.question_essay.id,
            "text_answer": "A Patronus acts as a shield of positive energy that repels Dementors.",
            "client_sequence": 2,
        }
        res_essay = self.client.post(save_url, data=json.dumps(payload_essay), content_type="application/json")
        self.assertEqual(res_essay.status_code, 200)
        self.assertTrue(res_essay.json()["success"])

        # Verify take endpoint now returns these existing responses
        take_res = self.client.get(
            reverse("quiz_app:api_student_quiz_take", kwargs={"attempt_id": attempt_id})
        )
        existing = take_res.json()["existing_responses"]
        self.assertIn(str(self.question_mcq.id), existing)
        self.assertEqual(
            existing[str(self.question_mcq.id)]["selected_choice_id"], self.choice_correct.id
        )
        self.assertIn(str(self.question_essay.id), existing)
        self.assertIn("shield of positive energy", existing[str(self.question_essay.id)]["text_answer"])

    def test_quiz_submit_is_idempotent(self):
        """
        HIGH-RISK SAFEGUARD (Rule 8.2):
        Submitting an attempt multiple times produces identical outcome with zero duplicate scores.
        """
        self.client.login(username=self.user_student_a.username, password=self.password)
        start_res = self.client.post(
            reverse("quiz_app:api_student_quiz_start", kwargs={"quiz_id": self.quiz.id}),
            content_type="application/json",
        )
        attempt_id = start_res.json()["attempt_id"]

        # Save correct answer to question 1
        self.client.post(
            reverse("quiz_app:api_student_quiz_save", kwargs={"attempt_id": attempt_id}),
            data=json.dumps({
                "question_id": self.question_mcq.id,
                "choice_id": self.choice_correct.id,
                "client_sequence": 1,
            }),
            content_type="application/json",
        )

        submit_url = reverse("quiz_app:api_student_quiz_submit", kwargs={"attempt_id": attempt_id})

        # Submit 1
        res1 = self.client.post(submit_url, content_type="application/json")
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertTrue(data1["success"])
        score1 = data1["score"]

        # Submit 2 (Idempotency check: duplicate click or retry)
        res2 = self.client.post(submit_url, content_type="application/json")
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertTrue(data2["success"])
        self.assertEqual(data2["score"], score1)

        # Attempt in DB is locked as submitted
        attempt = QuizAttempt.objects.get(id=attempt_id)
        self.assertTrue(attempt.is_submitted)

    def test_quiz_save_ignores_older_client_sequences(self):
        self.client.login(username=self.user_student_a.username, password=self.password)
        start_res = self.client.post(
            reverse("quiz_app:api_student_quiz_start", kwargs={"quiz_id": self.quiz.id}),
            content_type="application/json",
        )
        attempt_id = start_res.json()["attempt_id"]
        save_url = reverse("quiz_app:api_student_quiz_save", kwargs={"attempt_id": attempt_id})

        newer = self.client.post(
            save_url,
            data=json.dumps({
                "question_id": self.question_essay.id,
                "text_answer": "Newer answer",
                "client_sequence": 2,
            }),
            content_type="application/json",
        )
        older = self.client.post(
            save_url,
            data=json.dumps({
                "question_id": self.question_essay.id,
                "text_answer": "Older answer",
                "client_sequence": 1,
            }),
            content_type="application/json",
        )

        self.assertEqual(newer.status_code, 200)
        self.assertEqual(older.status_code, 200)
        self.assertTrue(older.json()["stale"])
        self.assertEqual(older.json()["stored_response"]["text_answer"], "Newer answer")
        response = QuizResponse.objects.get(
            attempt_id=attempt_id, question=self.question_essay
        )
        self.assertEqual(response.text_answer, "Newer answer")
        self.assertEqual(response.client_sequence, 2)

    def test_quiz_result_review_and_tenant_isolation(self):
        """
        Student can review results after submission.
        Student X from School X cannot access Student A's result (404).
        """
        self.client.login(username=self.user_student_a.username, password=self.password)
        start_res = self.client.post(
            reverse("quiz_app:api_student_quiz_start", kwargs={"quiz_id": self.quiz.id}),
            content_type="application/json",
        )
        attempt_id = start_res.json()["attempt_id"]

        # Submit attempt
        self.client.post(
            reverse("quiz_app:api_student_quiz_submit", kwargs={"attempt_id": attempt_id}),
            content_type="application/json",
        )

        result_url = reverse("quiz_app:api_student_quiz_result", kwargs={"attempt_id": attempt_id})
        res = self.client.get(result_url)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["student_name"], "Harry Potter")
        self.assertEqual(data["quiz_title"], "Boggarts and Dementors Exam")
        self.assertTrue(data["allow_review"])

        # Cross-tenant isolation test: Draco Malfoy from Slytherin Academy attempts to access Harry's result
        self.client.login(username=self.user_student_x.username, password=self.password)
        res_x = self.client.get(result_url)
        self.assertEqual(res_x.status_code, 404)
    def test_student_profile_api_success_and_scoping(self):
        """
        Student can retrieve their own comprehensive profile, academic cohort,
        enrollment records, and quiz performance statistics.
        """
        self.client.login(username=self.user_student_a.username, password=self.password)
        profile_url = reverse("quiz_app:api_student_profile")
        res = self.client.get(profile_url)
        self.assertEqual(res.status_code, 200)

        data = res.json()
        self.assertEqual(data["personal"]["full_name"], "Harry Potter")
        self.assertEqual(data["personal"]["admission_number"], self.student_a.admission_number)
        self.assertEqual(data["personal"]["gender_display"], "Male")
        self.assertEqual(data["academic"]["school_name"], "Gryffindor Academy")
        self.assertIsNotNone(data["academic"]["current_class"])
        self.assertEqual(data["academic"]["current_class"]["name"], self.class_a.name)
        self.assertGreaterEqual(len(data["enrollments"]), 1)
        self.assertTrue(data["enrollments"][0]["is_active"])
        self.assertIn("stats", data)
        self.assertIn("pass_rate", data["stats"])

    def test_student_profile_role_authorization(self):
        """
        Anonymous users get 401; teachers and admins get 403.
        """
        profile_url = reverse("quiz_app:api_student_profile")

        # Anonymous
        self.client.logout()
        res_anon = self.client.get(profile_url)
        self.assertEqual(res_anon.status_code, 401)

        # Teacher
        self.client.login(username=self.user_teacher_a.username, password=self.password)
        res_teacher = self.client.get(profile_url)
        self.assertEqual(res_teacher.status_code, 403)

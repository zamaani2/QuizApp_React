import json
from io import BytesIO

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
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_results_release", args=[self.beta_quiz.pk]),
            data="{}",
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
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_results_release", args=[self.other_quiz.pk]),
            data="{}",
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
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "QUIZ_NO_QUESTIONS")
        Question.objects.create(
            quiz=self.quiz, question_text="Ready", question_type="essay", marks=2, school=self.school_a,
        )
        self.quiz.classes.add(self.class_a)
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
        content = b"question_text,question_type,marks\nValid essay,essay,2\n,essay,1\n"
        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {
                "import_file": SimpleUploadedFile("questions.csv", content, content_type="text/csv"),
                "dry_run": "true",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"], {"total": 2, "valid": 1, "invalid": 1})
        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {
                "import_file": SimpleUploadedFile("questions.csv", content, content_type="text/csv"),
                "skip_invalid": "true",
            },
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload["imported"], 1)
        self.assertTrue(payload["partial_success"])
        self.assertTrue(payload["errors"])
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.total_marks, 2)

    def test_question_import_dry_run_reports_row_fields_without_creating_questions(self):
        self.client.force_login(self.teacher_user)
        upload = SimpleUploadedFile(
            "questions.csv",
            (
                b"question_text,question_type,marks,difficulty,correct_answer\n"
                b"Explain gravity,essay,3,medium,\n"
                b"Unsupported prompt,not_a_type,1,easy,\n"
                b"Order the steps,ordering,2,medium,Plan; Build; Test\n"
            ),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {"import_file": upload, "dry_run": "true"},
        )

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload["summary"], {"total": 3, "valid": 2, "invalid": 1})
        self.assertEqual(
            [(row["row"], row["status"]) for row in payload["rows"]],
            [(2, "valid"), (3, "invalid"), (4, "valid")],
        )
        self.assertEqual(payload["rows"][1]["errors"][0]["field"], "question_type")
        self.assertEqual(self.quiz.questions.count(), 0)

    def test_question_import_requires_skip_confirmation_and_skips_only_invalid_rows(self):
        self.client.force_login(self.teacher_user)
        csv_content = (
            b"question_text,question_type,marks,difficulty,correct_answer\n"
            b"Valid essay,essay,2,medium,\n"
            b"Invalid type,not_a_type,1,easy,\n"
        )
        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {"import_file": SimpleUploadedFile("questions.csv", csv_content, content_type="text/csv")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "INVALID_IMPORT_ROWS")
        self.assertEqual(self.quiz.questions.count(), 0)

        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {
                "import_file": SimpleUploadedFile("questions.csv", csv_content, content_type="text/csv"),
                "skip_invalid": "true",
            },
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload["imported"], 1)
        self.assertEqual(payload["skipped"], 1)
        self.assertEqual(self.quiz.questions.count(), 1)
        self.assertEqual(payload["rows"][1]["status"], "invalid")

    def test_question_import_validates_matching_and_blank_rows_before_write(self):
        self.client.force_login(self.teacher_user)
        upload = SimpleUploadedFile(
            "questions.csv",
            (
                b"question_text,question_type,marks,difficulty,correct_answer\n"
                b"Match each item,matching,2,medium,Cat=Mammal; Rose=Flower\n"
                b"The sky is _____,fill_blank,1,easy,blue|azure\n"
                b"Missing marker,fill_blank,1,easy,green\n"
            ),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {"import_file": upload, "dry_run": "true"},
        )

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload["summary"], {"total": 3, "valid": 2, "invalid": 1})
        self.assertEqual(payload["rows"][2]["errors"][0]["field"], "question_text")
        self.assertEqual(self.quiz.questions.count(), 0)

    def test_question_import_creates_every_supported_question_type(self):
        self.client.force_login(self.teacher_user)
        upload = SimpleUploadedFile(
            "questions.csv",
            (
                b"question_text,question_type,marks,difficulty,correct_answer,choice1,choice2\n"
                b"Pick the answer,multiple_choice,1,easy,2,Wrong,Right\n"
                b"The Earth orbits the Sun.,true_false,1,easy,false,,\n"
                b"Largest planet,short_answer,1,medium,Jupiter|JOVE,,\n"
                b"The sky is _____,fill_blank,1,easy,blue|azure,,\n"
                b"Match each item,matching,2,medium,Cat=Mammal; Rose=Flower,,\n"
                b"Order the steps,ordering,2,medium,Plan; Build; Test,,\n"
                b"Explain your reasoning,essay,5,hard,,,\n"
            ),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {"import_file": upload},
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["imported"], 7)
        questions = list(self.quiz.questions.order_by("order"))
        self.assertEqual(
            [question.question_type for question in questions],
            ["multiple_choice", "true_false", "short_answer", "fill_blank", "matching", "ordering", "essay"],
        )
        self.assertEqual(
            [choice.choice_text for choice in questions[0].answer_choices.order_by("order")],
            ["Wrong", "Right"],
        )
        self.assertEqual(questions[0].config["allow_multiple"], False)
        self.assertEqual(questions[1].answer_choices.get(is_correct=True).choice_text, "False")
        self.assertEqual(questions[2].config["accepted_answers"], ["Jupiter", "JOVE"])
        self.assertEqual(questions[3].config["blanks"], [["blue", "azure"]])
        self.assertEqual(len(questions[4].config["pairs"]), 2)
        self.assertEqual(questions[5].config["items"], ["Plan", "Build", "Test"])

    def test_question_import_previews_xlsx(self):
        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["question_text", "question_type", "marks", "difficulty", "correct_answer"])
        sheet.append(["Explain gravity", "essay", 3, "medium", ""])
        output = BytesIO()
        workbook.save(output)
        workbook.close()
        self.client.force_login(self.teacher_user)

        response = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk]),
            {
                "import_file": SimpleUploadedFile(
                    "questions.xlsx",
                    output.getvalue(),
                    content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ),
                "dry_run": "true",
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["summary"], {"total": 1, "valid": 1, "invalid": 0})
        self.assertEqual(self.quiz.questions.count(), 0)

    def test_question_import_enforces_file_type_and_size_limits(self):
        self.client.force_login(self.teacher_user)
        endpoint = reverse("quiz_app:api_teacher_question_import", args=[self.quiz.pk])

        unsupported = self.client.post(
            endpoint,
            {"import_file": SimpleUploadedFile("questions.xls", b"legacy", content_type="application/vnd.ms-excel"),
             "dry_run": "true"},
        )
        self.assertEqual(unsupported.status_code, 400)
        self.assertIn("CSV or XLSX", unsupported.json()["fields"]["import_file"][0])

        oversized = self.client.post(
            endpoint,
            {"import_file": SimpleUploadedFile("large.csv", b"x" * (5 * 1024 * 1024 + 1), content_type="text/csv")},
        )
        self.assertEqual(oversized.status_code, 413)
        self.assertEqual(self.quiz.questions.count(), 0)

    def test_question_import_respects_quiz_ownership_and_school_scope(self):
        self.client.force_login(self.teacher_user)
        endpoint = reverse("quiz_app:api_teacher_question_import", args=[self.other_quiz.pk])
        payload = {
            "import_file": SimpleUploadedFile(
                "questions.csv",
                b"question_text,question_type\nUnauthorized,essay\n",
                content_type="text/csv",
            ),
            "dry_run": "true",
        }
        response = self.client.post(endpoint, payload)
        self.assertEqual(response.status_code, 404)

        self.client.force_login(self.admin)
        cross_school = self.client.post(
            reverse("quiz_app:api_teacher_question_import", args=[self.beta_quiz.pk]),
            {
                "import_file": SimpleUploadedFile(
                    "questions.csv",
                    b"question_text,question_type\nCross school,essay\n",
                    content_type="text/csv",
                ),
                "dry_run": "true",
            },
        )
        self.assertEqual(cross_school.status_code, 404)

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

    def test_quiz_creation_defaults_academic_year_and_term(self):
        from .models import Term
        term = Term.objects.create(
            academic_year=self.year,
            term_number=1,
            start_date="2026-01-01",
            end_date="2026-04-30",
            school=self.school_a,
        )
        self.school_a.current_academic_year = self.year
        self.school_a.current_term = term
        self.school_a.save(update_fields=["current_academic_year", "current_term"])

        self.client.force_login(self.teacher_user)
        response = self.client.post(
            reverse("quiz_app:api_teacher_quizzes"),
            data=json.dumps({
                "title": "Defaulted Year Quiz",
                "subject_id": self.subject.pk,
                "status": "published",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        quiz_id = response.json()["quiz_id"]
        created_quiz = Quiz.objects.get(pk=quiz_id)
        self.assertEqual(created_quiz.academic_year, self.year)
        self.assertEqual(created_quiz.term, term)
        self.assertEqual(created_quiz.status, "draft")

    def test_publish_refusal_validations(self):
        self.client.force_login(self.teacher_user)
        # 1. Refuse publish when no questions
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_status", args=[self.quiz.pk]),
            data=json.dumps({"status": "published"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "QUIZ_NO_QUESTIONS")
        self.assertIn("questions", response.json().get("fields", {}))

        # Add question
        Question.objects.create(
            quiz=self.quiz, question_text="Q1", question_type="essay", marks=10, school=self.school_a,
        )
        self.quiz.classes.add(self.class_a)

        # 2. Refuse publish when available_until <= available_from
        self.quiz.available_from = "2026-11-20T10:00:00Z"
        self.quiz.available_until = "2026-11-19T10:00:00Z"
        self.quiz.save()
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_status", args=[self.quiz.pk]),
            data=json.dumps({"status": "published"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "INVALID_AVAILABILITY_DATES")
        self.assertIn("available_until", response.json().get("fields", {}))

        # 3. Valid dates publish succeeds
        self.quiz.available_until = "2026-11-21T10:00:00Z"
        self.quiz.save()
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_status", args=[self.quiz.pk]),
            data=json.dumps({"status": "published"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.status, "published")

    def test_pass_percentage_and_marks_sync(self):
        self.client.force_login(self.teacher_user)
        Question.objects.create(
            quiz=self.quiz, question_text="Q1", question_type="essay", marks=40, school=self.school_a,
        )
        self.quiz.calculate_total_marks()
        self.assertEqual(self.quiz.total_marks, 40)

        # Set pass_percentage to 50%
        response = self.client.patch(
            reverse("quiz_app:api_teacher_quiz_detail", args=[self.quiz.pk]),
            data=json.dumps({"pass_percentage": 50}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.pass_percentage, 50.0)
        self.assertEqual(self.quiz.passing_marks, 20)

        # Add another 40 mark question -> total_marks becomes 80
        Question.objects.create(
            quiz=self.quiz, question_text="Q2", question_type="essay", marks=40, school=self.school_a,
        )
        self.quiz.calculate_total_marks()
        self.quiz.refresh_from_db()
        self.assertEqual(self.quiz.total_marks, 80)
        # Passing marks automatically syncs to 50% of 80 = 40!
        self.assertEqual(self.quiz.passing_marks, 40)

    def test_publish_invalid_time_limit_has_a_field_error_code(self):
        from .services.assessment_management import AssessmentConflict, update_quiz_status

        self.client.force_login(self.teacher_user)
        Question.objects.create(
            quiz=self.quiz, question_text="Q1", question_type="essay", marks=10, school=self.school_a,
        )
        self.quiz.classes.add(self.class_a)
        self.quiz.time_limit = -1
        with self.assertRaises(AssessmentConflict) as raised:
            update_quiz_status(self.quiz, "published")
        self.assertEqual(raised.exception.code, "INVALID_TIME_LIMIT")
        self.assertIn("time_limit", raised.exception.fields)

    def test_delayed_results_are_hidden_until_teacher_releases_them(self):
        self.quiz.status = "published"
        self.quiz.show_results_immediately = False
        self.quiz.allow_review = True
        self.quiz.classes.add(self.class_a)
        self.quiz.save()
        Question.objects.create(
            quiz=self.quiz, question_text="Q1", question_type="essay", marks=10, school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz,
            student=self.student,
            school=self.school_a,
            attempt_number=1,
            is_submitted=True,
            is_completed=True,
            score=7,
            configuration_snapshot={
                "quiz": {
                    "show_results_immediately": False,
                    "show_correct_answers": False,
                    "allow_review": True,
                    "total_marks": 10,
                    "passing_marks": 5,
                },
                "questions": {},
                "sections": [],
            },
        )

        self.client.force_login(self.student_user)
        response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "RESULTS_NOT_RELEASED")
        history = self.client.get(reverse("quiz_app:api_student_attempts")).json()
        self.assertIsNone(history["attempts"][0]["score"])
        self.assertFalse(history["attempts"][0]["results_available"])

        self.client.force_login(self.teacher_user)
        released = self.client.post(
            reverse("quiz_app:api_teacher_quiz_results_release", args=[self.quiz.pk]),
            data="{}",
            content_type="application/json",
        )
        self.assertEqual(released.status_code, 200)
        self.assertTrue(released.json()["results_released_at"])

        self.client.force_login(self.student_user)
        response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["score"], 7)
        self.assertTrue(response.json()["results_available"])

    def test_delayed_results_become_available_when_manual_grading_is_complete(self):
        self.quiz.status = "published"
        self.quiz.show_results_immediately = False
        self.quiz.allow_review = True
        self.quiz.total_marks = 20
        self.quiz.classes.add(self.class_a)
        self.quiz.save()
        first_question = Question.objects.create(
            quiz=self.quiz,
            question_text="Explain the first point",
            question_type="essay",
            marks=10,
            school=self.school_a,
        )
        second_question = Question.objects.create(
            quiz=self.quiz,
            question_text="Explain the second point",
            question_type="essay",
            marks=10,
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz,
            student=self.student,
            school=self.school_a,
            attempt_number=1,
            is_submitted=True,
            is_completed=True,
            configuration_snapshot={
                "quiz": {
                    "show_results_immediately": False,
                    "show_correct_answers": False,
                    "allow_review": True,
                    "total_marks": 20,
                    "passing_marks": 10,
                },
                "questions": {
                    str(first_question.pk): {
                        "question_type": "essay",
                        "marks": 10,
                        "config": {"rubric": ""},
                    },
                    str(second_question.pk): {
                        "question_type": "essay",
                        "marks": 10,
                        "config": {"rubric": ""},
                    },
                },
                "sections": [],
            },
        )
        first_response = QuizResponse.objects.create(
            attempt=attempt,
            question=first_question,
            school=self.school_a,
            text_answer="My first explanation",
        )
        second_response = QuizResponse.objects.create(
            attempt=attempt,
            question=second_question,
            school=self.school_a,
            text_answer="My second explanation",
        )

        self.client.force_login(self.student_user)
        result_url = reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        hidden_result = self.client.get(result_url)
        self.assertEqual(hidden_result.status_code, 403)
        history = self.client.get(reverse("quiz_app:api_student_attempts")).json()
        self.assertFalse(history["attempts"][0]["results_available"])

        self.client.force_login(self.teacher_user)
        graded = self.client.post(
            reverse("quiz_app:api_teacher_response_grade", args=[first_response.pk]),
            data=json.dumps({"marks_awarded": 6, "grading_notes": "Good explanation"}),
            content_type="application/json",
        )
        self.assertEqual(graded.status_code, 200)
        self.assertFalse(graded.json()["all_graded"])

        self.client.force_login(self.student_user)
        history = self.client.get(reverse("quiz_app:api_student_attempts")).json()
        self.assertFalse(history["attempts"][0]["results_available"])
        still_hidden = self.client.get(result_url)
        self.assertEqual(still_hidden.status_code, 403)

        self.client.force_login(self.teacher_user)
        final_grade = self.client.post(
            reverse("quiz_app:api_teacher_response_grade", args=[second_response.pk]),
            data=json.dumps({"marks_awarded": 4, "grading_notes": "Good explanation"}),
            content_type="application/json",
        )
        self.assertEqual(final_grade.status_code, 200)
        self.assertTrue(final_grade.json()["all_graded"])

        self.client.force_login(self.student_user)
        history = self.client.get(reverse("quiz_app:api_student_attempts")).json()
        self.assertTrue(history["attempts"][0]["results_available"])
        self.assertEqual(history["attempts"][0]["score"], 10)
        visible_result = self.client.get(result_url)
        self.assertEqual(visible_result.status_code, 200)
        self.assertEqual(visible_result.json()["score"], 10)

    def test_delayed_results_remain_hidden_for_fully_graded_objective_attempts(self):
        self.quiz.status = "published"
        self.quiz.show_results_immediately = False
        self.quiz.classes.add(self.class_a)
        self.quiz.save()
        question = Question.objects.create(
            quiz=self.quiz,
            question_text="Choose an answer",
            question_type="multiple_choice",
            marks=1,
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz,
            student=self.student,
            school=self.school_a,
            attempt_number=1,
            is_submitted=True,
            is_completed=True,
            is_graded=True,
            configuration_snapshot={
                "quiz": {"show_results_immediately": False},
                "questions": {
                    str(question.pk): {
                        "question_type": "multiple_choice",
                        "choices": {"1": {"is_correct": True, "text": "Option"}},
                    },
                },
            },
        )
        QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            school=self.school_a,
            is_graded=True,
        )

        self.client.force_login(self.student_user)
        response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "RESULTS_NOT_RELEASED")

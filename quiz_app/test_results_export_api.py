import csv
from datetime import datetime, timezone as datetime_timezone
from io import BytesIO, StringIO

from django.test import TestCase
from django.urls import reverse
from openpyxl import load_workbook

from .models import (
    AcademicYear,
    Class,
    Question,
    Quiz,
    QuizAttempt,
    QuizResponse,
    SchoolInformation,
    Student,
    StudentClass,
    Subject,
    Teacher,
    TeacherSubjectAssignment,
    Term,
    User,
)


class TeacherResultsExportApiTests(TestCase):
    def setUp(self):
        self.school = SchoolInformation.objects.create(
            name="Export School",
            short_name="EXPORT",
            slug="export-school",
            school_code="EXP01",
        )
        self.other_school = SchoolInformation.objects.create(
            name="Other Export School",
            short_name="OTHER",
            slug="other-export-school",
            school_code="EXP02",
        )
        self.admin = User.objects.create_user(
            username="export-admin",
            password="test-password",
            full_name="Export Admin",
            role="admin",
            school=self.school,
        )
        self.teacher = Teacher.objects.create(
            full_name="Export Teacher",
            contact_number="100",
            school=self.school,
        )
        self.teacher_user = User.objects.get(teacher_profile=self.teacher)
        self.other_teacher = Teacher.objects.create(
            full_name="Other Teacher",
            contact_number="200",
            school=self.school,
        )
        self.year = AcademicYear.objects.create(
            name="2026",
            start_date="2026-01-01",
            end_date="2026-12-31",
            school=self.school,
        )
        self.other_year = AcademicYear.objects.create(
            name="2027",
            start_date="2027-01-01",
            end_date="2027-12-31",
            school=self.school,
        )
        self.term = Term.objects.create(
            academic_year=self.year,
            term_number=1,
            start_date="2026-01-01",
            end_date="2026-04-30",
        )
        self.other_term = Term.objects.create(
            academic_year=self.other_year,
            term_number=1,
            start_date="2027-01-01",
            end_date="2027-04-30",
        )
        self.class_a = Class.objects.create(
            name="Class A", academic_year=self.year, school=self.school
        )
        self.class_b = Class.objects.create(
            name="Class B", academic_year=self.year, school=self.school
        )
        self.foreign_class = Class.objects.create(
            name="Foreign Class",
            academic_year=AcademicYear.objects.create(
                name="2026",
                start_date="2026-01-01",
                end_date="2026-12-31",
                school=self.other_school,
            ),
            school=self.other_school,
        )
        self.subject = Subject.objects.create(
            subject_name="Science", school=self.school
        )
        self.other_subject = Subject.objects.create(
            subject_name="History", school=self.other_school
        )
        TeacherSubjectAssignment.objects.create(
            teacher=self.teacher,
            subject=self.subject,
            class_assigned=self.class_a,
            academic_year=self.year,
            school=self.school,
        )
        TeacherSubjectAssignment.objects.create(
            teacher=self.other_teacher,
            subject=self.subject,
            class_assigned=self.class_b,
            academic_year=self.year,
            school=self.school,
        )
        self.quiz = Quiz.objects.create(
            title="Science quiz",
            slug="science-export-quiz",
            subject=self.subject,
            teacher=self.teacher,
            school=self.school,
            status="published",
        )
        self.other_quiz = Quiz.objects.create(
            title="Other teacher quiz",
            slug="other-export-quiz",
            subject=self.subject,
            teacher=self.other_teacher,
            school=self.school,
            status="published",
        )
        self.foreign_quiz = Quiz.objects.create(
            title="Foreign quiz",
            slug="foreign-export-quiz",
            subject=self.other_subject,
            teacher=Teacher.objects.create(
                full_name="Foreign Teacher",
                contact_number="300",
                school=self.other_school,
            ),
            school=self.other_school,
            status="published",
        )
        self.student_a = self.create_student("EXP-001", "Alex Student", self.class_a)
        self.student_b = self.create_student("EXP-002", "Blair Student", self.class_a)
        self.student_other_class = self.create_student(
            "EXP-003", "Casey Student", self.class_b
        )
        self.essay = Question.objects.create(
            quiz=self.quiz,
            school=self.school,
            question_text="Explain your answer",
            question_type="essay",
            marks=10,
        )

    def create_student(self, admission_number, full_name, assigned_class):
        student = Student.objects.create(
            admission_number=admission_number,
            full_name=full_name,
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="100",
            admission_date="2026-01-01",
            school=self.school,
        )
        StudentClass.objects.create(
            student=student,
            assigned_class=assigned_class,
            school=self.school,
            is_active=True,
        )
        return student

    def create_attempt(
        self,
        student,
        *,
        score,
        attempt_number,
        submitted_at,
        year=None,
        term=None,
        pending=False,
        quiz=None,
    ):
        attempt = QuizAttempt.objects.create(
            quiz=quiz or self.quiz,
            student=student,
            school=self.school,
            attempt_number=attempt_number,
            score=score,
            percentage=score * 10,
            is_submitted=True,
            is_completed=True,
            is_graded=not pending,
            needs_grading=pending,
            submitted_at=submitted_at,
            academic_year=year or self.year,
            term=term or self.term,
        )
        if pending:
            QuizResponse.objects.create(
                attempt=attempt,
                question=self.essay,
                school=self.school,
                text_answer="An unfinished essay",
                is_graded=False,
            )
        return attempt

    def export(self, **params):
        self.client.force_login(self.teacher_user)
        return self.client.get(reverse("quiz_app:api_teacher_results_export"), params)

    def results(self, **params):
        self.client.force_login(self.teacher_user)
        return self.client.get(reverse("quiz_app:api_teacher_results"), params)

    @staticmethod
    def csv_rows(response):
        content = b"".join(response.streaming_content)
        return content, list(csv.reader(StringIO(content.decode("utf-8-sig"))))

    @staticmethod
    def submitted_at(day):
        return datetime(2026, 2, day, 12, 0, tzinfo=datetime_timezone.utc)

    def test_quiz_is_required_and_must_be_owned_by_the_teacher_in_the_school(self):
        self.assertEqual(self.export(format="csv").status_code, 400)
        self.assertEqual(
            self.export(quiz_id=self.other_quiz.pk, format="csv").status_code, 404
        )
        self.assertEqual(
            self.export(quiz_id=self.foreign_quiz.pk, format="csv").status_code, 404
        )
        self.client.force_login(self.teacher_user)
        legacy = self.client.get(reverse("quiz_app:quiz_results_export"))
        self.assertRedirects(
            legacy,
            "/app/teacher/results",
            fetch_redirect_response=False,
        )

    def test_class_choices_and_submitted_class_filter_are_role_scoped(self):
        self.client.force_login(self.teacher_user)
        options = self.client.get(reverse("quiz_app:api_teacher_quiz_options"))
        self.assertEqual(
            options.json()["classes"],
            [{"id": self.class_a.pk, "name": self.class_a.name}],
        )
        self.assertEqual(
            self.client.get(
                reverse("quiz_app:api_teacher_results_export"),
                {"quiz_id": self.quiz.pk, "class_id": self.class_b.pk, "format": "csv"},
            ).status_code,
            403,
        )

        self.client.force_login(self.admin)
        admin_options = self.client.get(reverse("quiz_app:api_teacher_quiz_options"))
        admin_class_ids = {item["id"] for item in admin_options.json()["classes"]}
        self.assertEqual(admin_class_ids, {self.class_a.pk, self.class_b.pk})
        self.assertEqual(
            self.client.get(
                reverse("quiz_app:api_teacher_results_export"),
                {"quiz_id": self.quiz.pk, "class_id": self.class_b.pk, "format": "csv"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(
                reverse("quiz_app:api_teacher_results_export"),
                {
                    "quiz_id": self.quiz.pk,
                    "class_id": self.foreign_class.pk,
                    "format": "csv",
                },
            ).status_code,
            403,
        )

    def test_best_ties_latest_and_latest_all_and_year_term_class_filters(self):
        self.create_attempt(
            self.student_a,
            score=8,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
        )
        tied_latest = self.create_attempt(
            self.student_a,
            score=8,
            attempt_number=2,
            submitted_at=self.submitted_at(2),
        )
        self.create_attempt(
            self.student_a,
            score=9,
            attempt_number=3,
            submitted_at=self.submitted_at(3),
            year=self.other_year,
            term=self.other_term,
        )
        self.create_attempt(
            self.student_other_class,
            score=7,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
        )

        response = self.export(quiz_id=self.quiz.pk, format="csv")
        _, rows = self.csv_rows(response)
        self.assertEqual(len(rows), 3)
        self.assertEqual({row[0] for row in rows[1:]}, {"EXP-001", "EXP-003"})
        self.assertEqual(
            next(row for row in rows[1:] if row[0] == "EXP-001")[7], "3"
        )
        best_tie_response = self.export(
            quiz_id=self.quiz.pk,
            format="csv",
            academic_year_id=self.year.pk,
            term_id=self.term.pk,
            class_id=self.class_a.pk,
        )
        _, best_tie_rows = self.csv_rows(best_tie_response)
        self.assertEqual(best_tie_rows[1][7], "2")
        latest_response = self.export(
            quiz_id=self.quiz.pk, format="csv", attempt="latest", class_id=self.class_a.pk
        )
        _, latest_rows = self.csv_rows(latest_response)
        self.assertEqual(len(latest_rows), 2)
        self.assertEqual(latest_rows[1][0], "EXP-001")
        self.assertEqual(latest_rows[1][7], "3")

        all_response = self.export(quiz_id=self.quiz.pk, format="csv", attempt="all")
        _, all_rows = self.csv_rows(all_response)
        self.assertEqual(len(all_rows), 5)

        filtered_response = self.export(
            quiz_id=self.quiz.pk,
            format="csv",
            academic_year_id=self.year.pk,
            term_id=self.term.pk,
            class_id=self.class_a.pk,
        )
        _, filtered_rows = self.csv_rows(filtered_response)
        self.assertEqual(len(filtered_rows), 2)

    def test_pending_essays_are_skipped_or_used_only_as_best_attempt_fallbacks(self):
        graded = self.create_attempt(
            self.student_a,
            score=6,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
        )
        self.create_attempt(
            self.student_a,
            score=10,
            attempt_number=2,
            submitted_at=self.submitted_at(2),
            pending=True,
        )
        self.create_attempt(
            self.student_b,
            score=4,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
            pending=True,
        )

        excluded = self.export(quiz_id=self.quiz.pk, format="csv")
        _, excluded_rows = self.csv_rows(excluded)
        self.assertEqual(excluded["X-Skipped-Pending-Count"], "2")
        self.assertEqual(len(excluded_rows), 2)
        self.assertEqual(excluded_rows[1][0], "EXP-001")
        self.assertEqual(excluded_rows[1][7], str(graded.attempt_number))

        included = self.export(
            quiz_id=self.quiz.pk, format="csv", include_pending="1"
        )
        _, included_rows = self.csv_rows(included)
        self.assertEqual(included["X-Skipped-Pending-Count"], "0")
        self.assertEqual(len(included_rows), 3)
        self.assertEqual(included_rows[1][8], "Submitted")
        self.assertEqual(included_rows[2][8], "Pending grading")
        for attempt_rule in ("latest", "all"):
            response = self.export(
                quiz_id=self.quiz.pk,
                format="csv",
                attempt=attempt_rule,
                include_pending="1",
            )
            _, rows = self.csv_rows(response)
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[1][8], "Submitted")
            self.assertEqual(rows[2][8], "Pending grading")

    def test_results_table_uses_the_same_filters_and_attempt_rules_as_export(self):
        best_tie = self.create_attempt(
            self.student_a,
            score=8,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
        )
        latest_tie = self.create_attempt(
            self.student_a,
            score=8,
            attempt_number=2,
            submitted_at=self.submitted_at(2),
        )
        self.create_attempt(
            self.student_a,
            score=10,
            attempt_number=3,
            submitted_at=self.submitted_at(3),
            pending=True,
        )
        other_year_attempt = self.create_attempt(
            self.student_a,
            score=10,
            attempt_number=4,
            submitted_at=self.submitted_at(4),
            year=self.other_year,
            term=self.other_term,
        )
        self.create_attempt(
            self.student_b,
            score=5,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
            pending=True,
        )
        self.create_attempt(
            self.student_other_class,
            score=9,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
        )

        filters = {
            "quiz_id": self.quiz.pk,
            "class_id": self.class_a.pk,
            "academic_year_id": self.year.pk,
            "term_id": self.term.pk,
            "include_pending": "1",
        }
        best = self.results(**filters)
        self.assertEqual(best.status_code, 200)
        best_rows = best.json()["results"]
        self.assertEqual(len(best_rows), 2)
        alex = next(row for row in best_rows if row["admission_number"] == "EXP-001")
        blair = next(row for row in best_rows if row["admission_number"] == "EXP-002")
        self.assertEqual(alex["id"], latest_tie.pk)
        self.assertNotEqual(alex["id"], best_tie.pk)
        self.assertFalse(alex["has_pending_essay"])
        self.assertTrue(blair["has_pending_essay"])

        latest = self.results(**filters, attempt="latest").json()["results"]
        latest_alex = next(row for row in latest if row["admission_number"] == "EXP-001")
        self.assertEqual(latest_alex["id"], latest_tie.pk)
        all_attempts = self.results(**filters, attempt="all").json()["results"]
        self.assertEqual(len(all_attempts), 3)
        self.assertNotIn(
            True,
            [
                row["has_pending_essay"]
                for row in all_attempts
                if row["admission_number"] == "EXP-001"
            ],
        )
        excluded_pending = self.results(
            **{**filters, "include_pending": "0"},
            attempt="all",
        ).json()["results"]
        self.assertEqual(len(excluded_pending), 2)
        self.assertTrue(all(not row["has_pending_essay"] for row in excluded_pending))
        self.assertEqual(
            self.results(
                quiz_id=self.quiz.pk,
                class_id=self.class_b.pk,
            ).status_code,
            403,
        )
        self.client.force_login(self.admin)
        admin_class_rows = self.client.get(
            reverse("quiz_app:api_teacher_results"),
            {
                "quiz_id": self.quiz.pk,
                "class_id": self.class_b.pk,
                "attempt": "all",
            },
        ).json()["results"]
        self.assertEqual(
            [row["admission_number"] for row in admin_class_rows],
            ["EXP-003"],
        )
        self.assertEqual(
            self.client.get(
                reverse("quiz_app:api_teacher_results"),
                {"class_id": self.foreign_class.pk},
            ).status_code,
            403,
        )
        other_year = self.results(
            quiz_id=self.quiz.pk,
            class_id=self.class_a.pk,
            academic_year_id=self.other_year.pk,
            term_id=self.other_term.pk,
        ).json()["results"]
        self.assertEqual([row["id"] for row in other_year], [other_year_attempt.pk])

    def test_csv_and_xlsx_are_formula_safe_and_have_no_section_columns(self):
        self.student_a.admission_number = "=1+1"
        self.student_a.full_name = "+SUM(A1:A2)"
        self.student_a.save(update_fields=["admission_number", "full_name"])
        self.class_a.name = "-Class"
        self.class_a.save(update_fields=["name"])
        self.subject.subject_name = "@unsafe"
        self.subject.save(update_fields=["subject_name"])
        self.quiz.title = "\tunsafe"
        self.quiz.save(update_fields=["title"])
        self.create_attempt(
            self.student_a,
            score=5,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
        )
        self.student_b.admission_number = "\r=2"
        self.student_b.save(update_fields=["admission_number"])
        self.create_attempt(
            self.student_b,
            score=4,
            attempt_number=1,
            submitted_at=self.submitted_at(1),
        )

        csv_response = self.export(quiz_id=self.quiz.pk, format="csv")
        csv_content, csv_output = self.csv_rows(csv_response)
        self.assertTrue(csv_content.startswith(b"\xef\xbb\xbf"))
        self.assertNotIn("section", " ".join(csv_output[0]).lower())
        alex_csv = next(row for row in csv_output[1:] if row[1] == "'+SUM(A1:A2)")
        blair_csv = next(row for row in csv_output[1:] if row[1] == "Blair Student")
        self.assertEqual(alex_csv[0], "'=1+1")
        self.assertEqual(alex_csv[2], "'-Class")
        self.assertEqual(alex_csv[3], "'@unsafe")
        self.assertEqual(alex_csv[4], "'\tunsafe")
        self.assertEqual(blair_csv[0], "'\r=2")

        xlsx_response = self.export(quiz_id=self.quiz.pk, format="xlsx")
        xlsx_content = b"".join(xlsx_response.streaming_content)
        workbook = load_workbook(BytesIO(xlsx_content), read_only=True, data_only=False)
        worksheet = workbook["Quiz Results"]
        headers = [cell.value for cell in next(worksheet.iter_rows(max_row=1))]
        self.assertNotIn("Percentage", headers)
        self.assertFalse(any("section" in str(header).lower() for header in headers))
        rows = list(worksheet.iter_rows(min_row=2, values_only=True))
        alex_xlsx = next(row for row in rows if row[1] == "'+SUM(A1:A2)")
        blair_xlsx = next(row for row in rows if row[1] == "Blair Student")
        self.assertEqual(alex_xlsx[0], "'=1+1")
        self.assertEqual(alex_xlsx[2], "'-Class")
        self.assertEqual(alex_xlsx[3], "'@unsafe")
        self.assertEqual(alex_xlsx[4], "'\tunsafe")
        self.assertEqual(blair_xlsx[0], "'\r=2")
        workbook.close()

        percentage_response = self.export(
            quiz_id=self.quiz.pk, format="csv", include_percentage="1"
        )
        _, percentage_rows = self.csv_rows(percentage_response)
        self.assertEqual(percentage_rows[0][-1], "Percentage")
        self.assertEqual(len(percentage_rows[0]), 11)

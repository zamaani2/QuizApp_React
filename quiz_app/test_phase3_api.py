"""
Unit and negative authorization tests for Phase 3 API endpoints.

Covers:
- GET /api/v1/superadmin/schools/
- GET /api/v1/superadmin/admins/
- GET /api/v1/students/ (cross-school negative isolation & teacher class-scoping)
- GET /api/v1/teachers/ (cross-school negative isolation)
- GET /api/v1/dashboard/admin/
"""
import datetime
from unittest.mock import patch
from django.test import TestCase, Client
from django.urls import reverse

from .models import (
    User,
    SchoolInformation,
    Teacher,
    Student,
    Class,
    Department,
    AcademicYear,
    Term,
    TeacherSubjectAssignment,
    StudentClass,
    Subject,
)


class Phase3ApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.password = "TestPassword-123!"

        # School A
        self.school_a = SchoolInformation.objects.create(
            name="School Alpha",
            short_name="ALPHA",
            slug="school-alpha",
            school_code="ALP01",
            address="1 Alpha Way",
            phone_number="1111111111",
            is_active=True,
        )
        self.academic_year_a = AcademicYear.objects.create(
            name="2026-2027",
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
            is_current=True,
            school=self.school_a,
        )

        # School B (for cross-school isolation tests)
        self.school_b = SchoolInformation.objects.create(
            name="School Beta",
            short_name="BETA",
            slug="school-beta",
            school_code="BET01",
            address="2 Beta Blvd",
            phone_number="2222222222",
            is_active=True,
        )
        self.academic_year_b = AcademicYear.objects.create(
            name="2026-2027",
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 12, 31),
            school=self.school_b,
            is_current=True,
        )

        # Users
        self.superadmin = User.objects.create_user(
            username="super_alpha",
            email="super@system.test",
            password=self.password,
            role="superadmin",
            is_superadmin=True,
        )
        self.admin_a = User.objects.create_user(
            username="admin_alpha",
            email="admin@alpha.test",
            password=self.password,
            role="admin",
            school=self.school_a,
        )
        self.admin_b = User.objects.create_user(
            username="admin_beta",
            email="admin@beta.test",
            password=self.password,
            role="admin",
            school=self.school_b,
        )

        # Department & Teacher in School A
        self.dept_a = Department.objects.create(
            name="Math",
            code="MTH",
            school=self.school_a,
        )
        self.teacher_a_profile = Teacher.objects.create(
            full_name="Teacher Alpha",
            contact_number="12345",
            school=self.school_a,
            department=self.dept_a,
        )
        self.teacher_a_user = User.objects.get(teacher_profile=self.teacher_a_profile)
        self.teacher_a_user.set_password(self.password)
        self.teacher_a_user.save()

        # Teacher in School B
        self.teacher_b_profile = Teacher.objects.create(
            full_name="Teacher Beta",
            contact_number="67890",
            school=self.school_b,
        )

        # Class & Students in School A
        self.class_a = Class.objects.create(
            name="Class 1A",
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        self.student_a1_profile = Student.objects.create(
            admission_number="STD-A01",
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

        # Enroll student in Class A
        StudentClass.objects.create(
            student=self.student_a1_profile,
            assigned_class=self.class_a,
            school=self.school_a,
            is_active=True,
        )

        # Student in School B
        self.student_b1_profile = Student.objects.create(
            admission_number="STD-B01",
            full_name="Student Beta 1",
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="5678",
            admission_date="2026-01-01",
            school=self.school_b,
        )

    # 1. Superadmin Schools API
    def test_superadmin_schools_permitted_for_superadmin(self):
        self.client.force_login(self.superadmin)
        response = self.client.get(reverse("quiz_app:api_superadmin_schools"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 2)
        names = [s["name"] for s in data["results"]]
        self.assertIn("School Alpha", names)
        self.assertIn("School Beta", names)

    def test_superadmin_schools_forbidden_for_admin_and_teacher(self):
        self.client.force_login(self.admin_a)
        response = self.client.get(reverse("quiz_app:api_superadmin_schools"))
        self.assertEqual(response.status_code, 403)

        self.client.force_login(self.teacher_a_user)
        response = self.client.get(reverse("quiz_app:api_superadmin_schools"))
        self.assertEqual(response.status_code, 403)

    def test_superadmin_school_api_creates_school_and_rejects_invalid_input(self):
        response = self.client.post(
            reverse("quiz_app:api_superadmin_schools"),
            {
                "name": "North School",
                "short_name": "NORTH",
                "address": "3 North Road",
                "phone_number": "3333333333",
                "email": "office@north.test",
                "website": "https://north.test",
            },
        )
        self.assertEqual(response.status_code, 401)

        self.client.force_login(self.superadmin)
        response = self.client.post(
            reverse("quiz_app:api_superadmin_schools"),
            {
                "name": "North School",
                "short_name": "NORTH",
                "address": "3 North Road",
                "phone_number": "3333333333",
                "email": "office@north.test",
                "website": "https://north.test",
            },
        )
        self.assertEqual(response.status_code, 201, response.content)
        school = SchoolInformation.objects.get(pk=response.json()["school_id"])
        self.assertEqual(school.slug, "north-school")
        self.assertEqual(school.created_by, self.superadmin)

        invalid = self.client.post(
            reverse("quiz_app:api_superadmin_schools"),
            {"name": "", "short_name": "", "address": "", "phone_number": ""},
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.json()["code"], "VALIDATION_ERROR")

        delete = self.client.delete(
            reverse(
                "quiz_app:api_superadmin_school_detail",
                args=[school.pk],
            )
        )
        self.assertEqual(delete.status_code, 200, delete.content)
        self.assertFalse(SchoolInformation.objects.filter(pk=school.pk).exists())

    def test_superadmin_school_api_detail_update_validation_and_safe_delete(self):
        self.client.force_login(self.superadmin)
        self.school_a.current_academic_year = self.academic_year_a
        self.school_a.current_term = self.term_a
        self.school_a.save()

        detail_url = reverse(
            "quiz_app:api_superadmin_school_detail", args=[self.school_a.pk]
        )
        detail = self.client.get(detail_url)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(
            detail.json()["school"]["current_academic_year"]["name"],
            self.academic_year_a.name,
        )
        self.assertEqual(detail.json()["school"]["current_term"]["name"], "Term 1")
        self.assertEqual(len(detail.json()["school"]["academic_years"]), 1)

        update = self.client.post(
            detail_url,
            {
                "name": "School Alpha Updated",
                "short_name": "ALPHA",
                "address": "Updated address",
                "phone_number": "1111111111",
                "is_active": "false",
                "current_academic_year": str(self.academic_year_a.pk),
                "current_term": str(self.term_a.pk),
            },
        )
        self.assertEqual(update.status_code, 200, update.content)
        self.school_a.refresh_from_db()
        self.assertEqual(self.school_a.name, "School Alpha Updated")
        self.assertFalse(self.school_a.is_active)

        other_year = AcademicYear.objects.create(
            name="2027-2028",
            start_date=datetime.date(2027, 1, 1),
            end_date=datetime.date(2027, 12, 31),
            school=self.school_a,
        )
        invalid_term = self.client.post(
            detail_url,
            {
                "name": self.school_a.name,
                "short_name": self.school_a.short_name,
                "address": self.school_a.address,
                "phone_number": self.school_a.phone_number,
                "current_academic_year": str(other_year.pk),
                "current_term": str(self.term_a.pk),
            },
        )
        self.assertEqual(invalid_term.status_code, 400)
        self.assertIn("current_term", invalid_term.json()["fields"])

        blocked_delete = self.client.delete(detail_url)
        self.assertEqual(blocked_delete.status_code, 400)
        self.assertTrue(SchoolInformation.objects.filter(pk=self.school_a.pk).exists())

    def test_superadmin_school_api_is_forbidden_to_school_admin(self):
        self.client.force_login(self.admin_a)
        create = self.client.post(reverse("quiz_app:api_superadmin_schools"), {})
        detail = self.client.get(
            reverse(
                "quiz_app:api_superadmin_school_detail", args=[self.school_a.pk]
            )
        )
        self.assertEqual(create.status_code, 403)
        self.assertEqual(detail.status_code, 403)

    def test_superadmin_school_pages_redirect_to_react_and_keep_classic_fallback(self):
        self.client.force_login(self.superadmin)
        list_url = reverse("quiz_app:superadmin_school_list")
        detail_url = reverse(
            "quiz_app:superadmin_school_detail", args=[self.school_a.pk]
        )
        edit_url = reverse(
            "quiz_app:superadmin_school_edit", args=[self.school_a.pk]
        )
        create_url = reverse("quiz_app:superadmin_school_create")

        self.assertRedirects(
            self.client.get(list_url),
            "/app/superadmin/schools",
            fetch_redirect_response=False,
        )
        self.assertEqual(self.client.get(list_url + "?classic=1").status_code, 200)
        self.assertRedirects(
            self.client.get(detail_url),
            f"/app/superadmin/schools/{self.school_a.pk}",
            fetch_redirect_response=False,
        )
        self.assertEqual(
            self.client.get(detail_url + "?classic=1").status_code, 200
        )
        self.assertRedirects(
            self.client.get(edit_url),
            f"/app/superadmin/schools/{self.school_a.pk}/edit",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(create_url),
            "/app/superadmin/schools/new",
            fetch_redirect_response=False,
        )
        classic_create = self.client.get(create_url + "?classic=1")
        self.assertEqual(classic_create.status_code, 200)
        self.assertIn("html", classic_create.json())

    def test_superadmin_dashboard_returns_system_metrics_and_activity(self):
        response = self.client.get(reverse("quiz_app:api_superadmin_dashboard"))
        self.assertEqual(response.status_code, 401)

        self.client.force_login(self.superadmin)
        response = self.client.get(reverse("quiz_app:api_superadmin_dashboard"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["stats"]["total_schools"], 2)
        self.assertIn("total_users", data["stats"])
        self.assertIn("total_attempts", data["stats"])
        self.assertIn("schools_with_users", data)
        self.assertIn("schools_with_students", data)
        self.assertIn("recent_quizzes", data)
        self.assertEqual(
            {school["name"] for school in data["recent_schools"]},
            {"School Alpha", "School Beta"},
        )

    def test_superadmin_dashboard_forbidden_for_school_admin(self):
        self.client.force_login(self.admin_a)
        response = self.client.get(reverse("quiz_app:api_superadmin_dashboard"))
        self.assertEqual(response.status_code, 403)

    # 2. Superadmin Admins API
    def test_superadmin_admins_permitted_for_superadmin(self):
        self.client.force_login(self.superadmin)
        response = self.client.get(reverse("quiz_app:api_superadmin_admins"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        usernames = [a["username"] for a in data["results"]]
        self.assertIn("admin_alpha", usernames)
        self.assertIn("admin_beta", usernames)
        admin = next(a for a in data["results"] if a["username"] == "admin_alpha")
        self.assertEqual(admin["full_name"], self.admin_a.full_name or self.admin_a.username)
        self.assertEqual(admin["school"]["name"], self.school_a.name)
        self.assertIn("last_login_ip", admin)

    def test_superadmin_admin_api_create_detail_update_and_delete(self):
        self.client.force_login(self.superadmin)
        admins_url = reverse("quiz_app:api_superadmin_admins")
        create = self.client.post(
            admins_url,
            {
                "username": "new_school_admin",
                "email": "new-admin@alpha.test",
                "full_name": "New School Admin",
                "school": str(self.school_a.pk),
            },
        )
        self.assertEqual(create.status_code, 201, create.content)
        self.assertTrue(create.json()["password_setup_email_scheduled"])
        admin = User.objects.get(pk=create.json()["admin_id"])
        self.assertEqual(admin.role, "admin")
        self.assertEqual(admin.school, self.school_a)
        self.assertTrue(admin.is_active)
        self.assertTrue(admin.has_usable_password())

        detail_url = reverse("quiz_app:api_superadmin_admin_detail", args=[admin.pk])
        detail = self.client.get(detail_url)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["admin"]["school"]["id"], self.school_a.pk)

        update = self.client.post(
            detail_url,
            {
                "email": "updated-admin@beta.test",
                "full_name": "Updated School Admin",
                "school": str(self.school_b.pk),
                "is_active": "false",
                "password": "Temporary-Admin-Password-9!",
            },
        )
        self.assertEqual(update.status_code, 200, update.content)
        admin.refresh_from_db()
        self.assertEqual(admin.email, "updated-admin@beta.test")
        self.assertEqual(admin.full_name, "Updated School Admin")
        self.assertEqual(admin.school, self.school_b)
        self.assertFalse(admin.is_active)
        self.assertTrue(admin.check_password("Temporary-Admin-Password-9!"))

        filtered = self.client.get(
            admins_url, {"school": self.school_b.pk, "is_active": "false"}
        )
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual([item["id"] for item in filtered.json()["results"]], [admin.pk])

        delete = self.client.delete(detail_url)
        self.assertEqual(delete.status_code, 200, delete.content)
        self.assertFalse(User.objects.filter(pk=admin.pk).exists())

    def test_superadmin_admin_api_rejects_invalid_and_duplicate_values(self):
        self.client.force_login(self.superadmin)
        url = reverse("quiz_app:api_superadmin_admins")
        missing = self.client.post(url, {})
        self.assertEqual(missing.status_code, 400)
        self.assertIn("username", missing.json()["fields"])

        duplicate = self.client.post(
            url,
            {
                "username": "admin_alpha",
                "email": "different@alpha.test",
                "full_name": "Duplicate Username",
                "school": str(self.school_a.pk),
            },
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("username", duplicate.json()["fields"])

        invalid_school = self.client.post(
            url,
            {
                "username": "invalid_school_admin",
                "email": "invalid-school@alpha.test",
                "full_name": "Invalid School",
                "school": "999999",
            },
        )
        self.assertEqual(invalid_school.status_code, 400)
        self.assertIn("school", invalid_school.json()["fields"])

    def test_superadmin_admin_api_permissions_and_self_delete_protection(self):
        detail_url = reverse("quiz_app:api_superadmin_admin_detail", args=[self.admin_a.pk])
        self.assertEqual(self.client.get(reverse("quiz_app:api_superadmin_admins")).status_code, 401)

        self.client.force_login(self.admin_a)
        self.assertEqual(self.client.get(detail_url).status_code, 403)

        self.client.force_login(self.admin_a)
        self_url = reverse("quiz_app:api_superadmin_admin_detail", args=[self.admin_a.pk])
        with patch("quiz_app.api_views.is_authorized_superadmin", return_value=True):
            self_delete = self.client.delete(self_url)
        self.assertEqual(self_delete.status_code, 400)
        self.assertEqual(self_delete.json()["code"], "SELF_DELETE_FORBIDDEN")
        self.assertTrue(User.objects.filter(pk=self.admin_a.pk).exists())

    def test_superadmin_admin_pages_redirect_to_react_and_keep_classic_fallback(self):
        self.client.force_login(self.superadmin)
        list_url = reverse("quiz_app:superadmin_admin_list")
        detail_url = reverse("quiz_app:superadmin_admin_detail", args=[self.admin_a.pk])
        create_url = reverse("quiz_app:superadmin_admin_create")
        edit_url = reverse("quiz_app:superadmin_admin_edit", args=[self.admin_a.pk])

        self.assertRedirects(
            self.client.get(list_url),
            "/app/superadmin/admins",
            fetch_redirect_response=False,
        )
        self.assertEqual(self.client.get(list_url + "?classic=1").status_code, 200)
        self.assertRedirects(
            self.client.get(detail_url),
            f"/app/superadmin/admins/{self.admin_a.pk}",
            fetch_redirect_response=False,
        )
        self.assertEqual(self.client.get(detail_url + "?classic=1").status_code, 200)
        self.assertRedirects(
            self.client.get(create_url),
            "/app/superadmin/admins/new",
            fetch_redirect_response=False,
        )
        self.assertIn("html", self.client.get(create_url + "?classic=1").json())
        self.assertRedirects(
            self.client.get(edit_url),
            f"/app/superadmin/admins/{self.admin_a.pk}/edit",
            fetch_redirect_response=False,
        )
        self.assertEqual(self.client.get(edit_url + "?classic=1").status_code, 200)

    def test_superadmin_admins_forbidden_for_non_superadmin(self):
        self.client.force_login(self.admin_a)
        response = self.client.get(reverse("quiz_app:api_superadmin_admins"))
        self.assertEqual(response.status_code, 403)

    # 3. Students API (Cross-school isolation)
    def test_students_api_admin_scoped_to_own_school(self):
        self.client.force_login(self.admin_a)
        response = self.client.get(reverse("quiz_app:api_students"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        admissions = [s["admission_number"] for s in data["results"]]
        self.assertIn("STD-A01", admissions)
        # Verify cross-school negative isolation: School B student must NOT be visible
        self.assertNotIn("STD-B01", admissions)
        student = next(item for item in data["results"] if item["admission_number"] == "STD-A01")
        self.assertIn("admission_date", student)
        self.assertIn("form_id", student)
        self.assertIn("learning_area_id", student)
        self.assertIn("class_name", student)

    def test_students_api_forbidden_for_student_role(self):
        self.client.force_login(self.student_a1_user)
        response = self.client.get(reverse("quiz_app:api_students"))
        self.assertEqual(response.status_code, 403)

    def test_students_api_teacher_scoped_to_assigned_classes(self):
        # Teacher with no assignments sees 0 students
        self.client.force_login(self.teacher_a_user)
        response = self.client.get(reverse("quiz_app:api_students"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 0)

        # Now assign Teacher A to Class A
        subject_a = Subject.objects.create(
            subject_name="Algebra",
            subject_code="ALG01",
            school=self.school_a,
        )
        TeacherSubjectAssignment.objects.create(
            teacher=self.teacher_a_profile,
            class_assigned=self.class_a,
            subject=subject_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
            is_active=True,
        )

        response = self.client.get(reverse("quiz_app:api_students"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["admission_number"], "STD-A01")

    # 4. Teachers API (Cross-school isolation)
    def test_teachers_api_admin_scoped_to_own_school(self):
        self.client.force_login(self.admin_a)
        response = self.client.get(reverse("quiz_app:api_teachers"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        names = [t["full_name"] for t in data["results"]]
        self.assertIn("Teacher Alpha", names)
        # Verify cross-school negative isolation: School B teacher must NOT be visible
        self.assertNotIn("Teacher Beta", names)
        teacher = next(item for item in data["results"] if item["full_name"] == "Teacher Alpha")
        self.assertIn("department_id", teacher)
        self.assertIn("assigned_classes_count", teacher)

    def test_teachers_api_forbidden_for_teacher_and_student(self):
        self.client.force_login(self.teacher_a_user)
        response = self.client.get(reverse("quiz_app:api_teachers"))
        self.assertEqual(response.status_code, 403)

        self.client.force_login(self.student_a1_user)
        response = self.client.get(reverse("quiz_app:api_teachers"))
        self.assertEqual(response.status_code, 403)

    # 5. Admin Dashboard API
    def test_admin_dashboard_api(self):
        self.client.force_login(self.admin_a)
        response = self.client.get(reverse("quiz_app:api_admin_dashboard"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["school_name"], "School Alpha")
        self.assertEqual(data["total_students"], 1)
        self.assertEqual(data["total_teachers"], 1)
        self.assertEqual(data["total_classes"], 1)
        self.assertEqual(data["active_term"], self.term_a.get_term_number_display())

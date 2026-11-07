"""
Unit and integration tests for Phase 1 React Foundation.

Covers:
- GET /api/v1/me/ endpoint (unauthenticated, forbidden, authenticated roles: admin, teacher, student, superadmin)
- GET /app/ and /app/* React shell catch-all (auth redirection, CSRF cookie presence, root mount container)
"""
import datetime
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
)


class ReactFoundationApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.password = "TestPassword-123!"
        self.school = SchoolInformation.objects.create(
            name="Test Academy",
            short_name="TA",
            slug="test-academy",
            school_code="TA01",
            address="123 Test Street",
            phone_number="1234567890",
            is_active=True,
        )
        self.academic_year = AcademicYear.objects.create(
            name="2026-2027",
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 12, 31),
            school=self.school,
            is_current=True,
        )
        self.admin_user = User.objects.create_user(
            username="admin_user",
            email="admin@test.edu",
            password=self.password,
            role="admin",
            school=self.school,
            first_name="Admin",
            last_name="User",
        )
        self.superadmin_user = User.objects.create_user(
            username="super_user",
            email="super@test.edu",
            password=self.password,
            role="superadmin",
            is_superadmin=True,
            first_name="Super",
            last_name="Admin",
        )
        self.department = Department.objects.create(
            name="Science",
            code="SCI",
            school=self.school,
        )
        self.teacher_profile = Teacher.objects.create(
            full_name="Jane Teacher",
            contact_number="1234567891",
            school=self.school,
            department=self.department,
        )
        self.teacher_user = User.objects.get(teacher_profile=self.teacher_profile)
        self.teacher_user.set_password(self.password)
        self.teacher_user.save()

        self.student_profile = Student.objects.create(
            admission_number="STD-001",
            full_name="Sam Student",
            date_of_birth="2010-01-01",
            gender="M",
            parent_contact="1234567892",
            admission_date="2026-01-01",
            school=self.school,
        )
        self.student_user = User.objects.get(student_profile=self.student_profile)
        self.student_user.set_password(self.password)
        self.student_user.save()

    def test_me_api_unauthenticated_returns_401(self):
        response = self.client.get(reverse("quiz_app:api_me"))
        self.assertEqual(response.status_code, 401)
        self.assertIn("csrftoken", response.cookies)
        data = response.json()
        self.assertEqual(data["code"], "UNAUTHORIZED")

    def test_me_api_missing_school_returns_403(self):
        user_no_school = User.objects.create_user(
            username="no_school_user",
            password=self.password,
            role="admin",
            school=None,
        )
        self.client.force_login(user_no_school)
        response = self.client.get(reverse("quiz_app:api_me"))
        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertEqual(data["code"], "FORBIDDEN")

    def test_me_api_admin_returns_user_and_school(self):
        self.client.force_login(self.admin_user)
        response = self.client.get(reverse("quiz_app:api_me"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["user"]["username"], "admin_user")
        self.assertEqual(data["user"]["role"], "admin")
        self.assertFalse(data["user"]["is_superadmin"])
        self.assertEqual(data["school"]["id"], self.school.pk)
        self.assertEqual(data["school"]["name"], "Test Academy")
        self.assertEqual(data["profile"]["type"], "admin")

    def test_me_api_superadmin_returns_null_school(self):
        self.client.force_login(self.superadmin_user)
        response = self.client.get(reverse("quiz_app:api_me"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["user"]["username"], "super_user")
        self.assertEqual(data["user"]["role"], "superadmin")
        self.assertTrue(data["user"]["is_superadmin"])
        self.assertIsNone(data["school"])

    def test_me_api_teacher_profile(self):
        self.client.force_login(self.teacher_user)
        response = self.client.get(reverse("quiz_app:api_me"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["profile"]["type"], "teacher")
        self.assertEqual(data["profile"]["department"], "Science")

    def test_me_api_student_profile(self):
        self.client.force_login(self.student_user)
        response = self.client.get(reverse("quiz_app:api_me"))
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["profile"]["type"], "student")
        self.assertEqual(data["profile"]["student_id"], "STD-001")


class ReactAppShellViewTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.school = SchoolInformation.objects.create(
            name="Test Academy",
            short_name="TA",
            slug="test-academy",
            school_code="TA01",
            address="123 Test Street",
            phone_number="1234567890",
            is_active=True,
        )
        self.user = User.objects.create_user(
            username="shell_tester",
            password="password123",
            role="admin",
            school=self.school,
        )

    def test_shell_unauthenticated_redirects_to_login(self):
        response = self.client.get(reverse("quiz_app:react_app"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login/?next=/app/", response.url)

    def test_shell_authenticated_returns_200_with_csrf_and_root(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("quiz_app:react_app"))
        self.assertEqual(response.status_code, 200)

        # Check CSRF cookie is set
        self.assertIn("csrftoken", response.cookies)

        # Check HTML contains mount point and scripts
        content = response.content.decode("utf-8")
        self.assertIn('<div id="root"></div>', content)
        self.assertIn("react/assets/index.js", content)

    def test_shell_catchall_subpath(self):
        self.client.force_login(self.user)
        response = self.client.get("/app/teacher/quizzes/")
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn('<div id="root"></div>', content)

from pathlib import Path

from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from .models import (
    AcademicYear,
    Class,
    SchoolInformation,
    Student,
    StudentClass,
    Teacher,
    User,
)


APP_DIR = Path(__file__).resolve().parent


class ReactShellTemplateTests(SimpleTestCase):
    def test_only_react_shell_templates_remain(self):
        names = {
            path.relative_to(APP_DIR / "templates").as_posix()
            for path in (APP_DIR / "templates").rglob("*")
            if path.is_file()
        }
        self.assertEqual(names, {"auth_core_app.html", "react_app.html"})

        app_shell = (APP_DIR / "templates" / "react_app.html").read_text(
            encoding="utf-8"
        )
        auth_shell = (APP_DIR / "templates" / "auth_core_app.html").read_text(
            encoding="utf-8"
        )
        self.assertIn('id="root"', app_shell)
        self.assertIn('id="auth-core-root"', auth_shell)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AccentThemePageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.password = "Theme-System-Password-837!"
        cls.school = SchoolInformation.objects.create(
            name="Theme School",
            short_name="THM",
            slug="theme-school",
            address="Theme address",
            phone_number="5550300",
        )
        cls.superadmin = User.objects.create_user(
            username="theme-superadmin",
            email="theme-superadmin@example.test",
            password=cls.password,
            full_name="Theme Superadmin",
            role="superadmin",
        )
        cls.admin = User.objects.create_user(
            username="theme-admin",
            email="theme-admin@example.test",
            password=cls.password,
            full_name="Theme Admin",
            role="admin",
            school=cls.school,
        )
        academic_year = AcademicYear.objects.create(
            name="2026",
            start_date="2026-01-01",
            end_date="2026-12-31",
            school=cls.school,
        )
        class_obj = Class.objects.create(
            name="Theme Class",
            academic_year=academic_year,
            school=cls.school,
        )
        teacher = Teacher.objects.create(
            full_name="Theme Teacher",
            contact_number="5550310",
            school=cls.school,
        )
        cls.teacher_user = User.objects.get(teacher_profile=teacher)
        cls.teacher_user.set_password(cls.password)
        cls.teacher_user.save(update_fields=["password"])
        student = Student.objects.create(
            admission_number="TH-0001",
            full_name="Theme Student",
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="5550320",
            admission_date="2026-01-01",
            school=cls.school,
        )
        cls.student_user = User.objects.get(student_profile=student)
        cls.student_user.set_password(cls.password)
        cls.student_user.save(update_fields=["password"])
        StudentClass.objects.create(
            student=student,
            assigned_class=class_obj,
            school=cls.school,
        )

    def test_legacy_auth_routes_redirect_to_root_react_auth_shell(self):
        login = self.client.get(reverse("quiz_app:login"))
        superadmin_login = self.client.get(
            reverse("quiz_app:superadmin_login") + "?classic=1"
        )
        reset = self.client.get(reverse("quiz_app:password_reset"))
        self.assertRedirects(
            login, "/", fetch_redirect_response=False
        )
        self.assertRedirects(
            superadmin_login,
            "/?portal=superadmin",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            reset,
            "/?flow=password-reset",
            fetch_redirect_response=False,
        )

    def test_role_dashboards_use_react_shells(self):
        cases = (
            (
                self.superadmin,
                reverse("quiz_app:superadmin_dashboard") + "?classic=1",
            ),
            (self.admin, reverse("quiz_app:admin_dashboard")),
            (self.teacher_user, reverse("quiz_app:teacher_dashboard")),
            (self.student_user, reverse("quiz_app:student_dashboard")),
        )
        for user, url in cases:
            with self.subTest(role=user.role):
                self.client.force_login(user)
                response = self.client.get(url, follow=True)
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, 'id="root"')
                self.assertContains(response, 'data-app-theme="academic"')
                self.client.logout()

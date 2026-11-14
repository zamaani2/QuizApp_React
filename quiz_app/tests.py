import json
import re
from io import BytesIO
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib import admin as django_admin
from django.contrib.auth.models import AnonymousUser
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.db.models import F, Prefetch
from django.db.models.deletion import ProtectedError
from django.http import HttpResponse
from django.test import Client, RequestFactory, SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from django.urls import reverse

from .middleware import TenantAccessMiddleware
from .rate_limiting import AUTH_RATE_LIMITS, get_client_ip
from .urls import urlpatterns
from .models import (
    AcademicYear,
    AnswerChoice,
    Class,
    ClassTeacher,
    ClassSubject,
    Department,
    Form,
    LearningArea,
    Question,
    Quiz,
    QuizAttempt,
    QuizResponse,
    SchoolInformation,
    Student,
    StudentClass,
    Subject,
    Term,
    Teacher,
    TeacherSubjectAssignment,
    User,
)
from .utils.tenant_utils import (
    filter_by_school,
    get_object_or_404_with_school,
    get_user_school,
    is_authorized_superadmin,
    require_school,
)


def make_user(
    role="admin",
    school=None,
    *,
    authenticated=True,
    active=True,
    teacher_profile=None,
    student_profile=None,
    is_superadmin=False,
):
    return SimpleNamespace(
        is_authenticated=authenticated,
        is_active=active,
        role=role,
        school=school,
        teacher_profile=teacher_profile,
        student_profile=student_profile,
        is_superadmin=is_superadmin,
    )


class TenantUtilityTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.school = SimpleNamespace(pk=17)

    def test_school_admin_resolves_only_associated_school(self):
        request = self.factory.get("/")
        request.user = make_user(school=self.school)

        self.assertIs(get_user_school(request), self.school)

    def test_teacher_requires_a_matching_school_profile(self):
        request = self.factory.get("/")
        profile = SimpleNamespace(school_id=self.school.pk)
        request.user = make_user(
            role="teacher", school=self.school, teacher_profile=profile
        )

        self.assertIs(get_user_school(request), self.school)

        request.user.teacher_profile = SimpleNamespace(school_id=99)
        self.assertIsNone(get_user_school(request))

    def test_student_requires_a_matching_school_profile(self):
        request = self.factory.get("/")
        profile = SimpleNamespace(school_id=self.school.pk)
        request.user = make_user(
            role="student", school=self.school, student_profile=profile
        )

        self.assertIs(get_user_school(request), self.school)

        request.user.student_profile = None
        self.assertIsNone(get_user_school(request))

    def test_only_active_authenticated_superadmin_role_bypasses_school_scope(self):
        user = make_user(role="superadmin", school=None)
        request = self.factory.get("/")
        request.user = user

        self.assertTrue(is_authorized_superadmin(user))
        self.assertIsNone(get_user_school(request))

        user.is_active = False
        self.assertFalse(is_authorized_superadmin(user))
        self.assertIsNone(get_user_school(request))

    def test_legacy_superadmin_flag_does_not_grant_cross_school_access(self):
        user = make_user(role="admin", school=None, is_superadmin=True)

        self.assertFalse(is_authorized_superadmin(user))

    def test_non_superadmin_without_school_cannot_pass_school_decorator(self):
        request = self.factory.get("/")
        request.user = make_user(school=None)
        protected_view = require_school(lambda req: HttpResponse("ok"))

        with self.assertRaises(PermissionDenied):
            protected_view(request)

    def test_anonymous_user_is_redirected_by_school_decorator(self):
        request = self.factory.get("/students/")
        request.user = make_user(authenticated=False, active=False)
        protected_view = require_school(lambda req: HttpResponse("ok"))

        response = protected_view(request)

        self.assertEqual(response.status_code, 302)

    def test_school_filter_fails_closed_for_invalid_user(self):
        request = self.factory.get("/")
        request.user = make_user(school=None)
        queryset = Mock()
        queryset.none.return_value = "empty"

        self.assertEqual(filter_by_school(queryset, request), "empty")
        queryset.none.assert_called_once_with()
        queryset.filter.assert_not_called()

    def test_school_filter_uses_school_for_regular_user_and_bypasses_for_superadmin(
        self,
    ):
        request = self.factory.get("/")
        request.user = make_user(school=self.school)
        queryset = Mock()
        queryset.filter.return_value = "scoped"

        self.assertEqual(filter_by_school(queryset, request), "scoped")
        queryset.filter.assert_called_once_with(school=self.school)

        request.user = make_user(role="superadmin", school=None)
        self.assertIs(filter_by_school(queryset, request), queryset)

    @patch("quiz_app.utils.tenant_utils.get_object_or_404")
    def test_object_lookup_scopes_regular_user_to_school(self, get_object):
        request = self.factory.get("/")
        request.user = make_user(school=self.school)
        model = object()

        get_object_or_404_with_school(model, request, pk=23)

        get_object.assert_called_once_with(model, school=self.school, pk=23)

    @patch("quiz_app.utils.tenant_utils.get_object_or_404")
    def test_object_lookup_allows_explicit_superadmin_bypass(self, get_object):
        request = self.factory.get("/")
        request.user = make_user(role="superadmin", school=None)
        model = object()

        get_object_or_404_with_school(model, request, pk=23)

        get_object.assert_called_once_with(model, pk=23)


class TenantAccessMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.school = SimpleNamespace(pk=17)
        self.middleware = TenantAccessMiddleware(lambda request: HttpResponse("ok"))
        self.app_view = SimpleNamespace(
            __module__="quiz_app.views.student_management",
            __name__="student_list_view",
        )

    def test_application_view_redirects_anonymous_user_to_login(self):
        request = self.factory.get("/students/")
        request.user = AnonymousUser()

        response = self.middleware.process_view(request, self.app_view, (), {})

        self.assertEqual(response.status_code, 302)
        self.assertIn("/login/", response["Location"])

    def test_application_view_denies_user_without_school(self):
        request = self.factory.get("/students/")
        request.user = make_user(school=None)

        response = self.middleware.process_view(request, self.app_view, (), {})

        self.assertEqual(response.status_code, 403)

    def test_application_view_denies_teacher_with_mismatched_profile(self):
        request = self.factory.get("/students/")
        request.user = make_user(
            role="teacher",
            school=self.school,
            teacher_profile=SimpleNamespace(school_id=99),
        )

        response = self.middleware.process_view(request, self.app_view, (), {})

        self.assertEqual(response.status_code, 403)

    def test_application_view_allows_school_user_and_superadmin(self):
        request = self.factory.get("/students/")
        request.user = make_user(school=self.school)

        self.assertIsNone(
            self.middleware.process_view(request, self.app_view, (), {})
        )

        request.user = make_user(role="superadmin", school=None)
        self.assertIsNone(
            self.middleware.process_view(request, self.app_view, (), {})
        )

    def test_django_admin_denies_non_superadmin_staff(self):
        request = self.factory.get("/admin/")
        request.user = make_user(school=self.school)
        request.user.is_staff = True

        response = self.middleware.process_view(
            request,
            SimpleNamespace(
                __module__="django.contrib.admin.sites",
                __name__="index",
            ),
            (),
            {},
        )

        self.assertEqual(response.status_code, 403)

    def test_django_admin_allows_active_django_superuser_without_app_role(self):
        request = self.factory.get("/admin/")
        request.user = make_user(role="", school=None)
        request.user.is_staff = True
        request.user.is_superuser = True

        response = self.middleware.process_view(
            request,
            SimpleNamespace(
                __module__="django.contrib.admin.sites",
                __name__="index",
            ),
            (),
            {},
        )

        self.assertIsNone(response)

    def test_django_admin_denies_inactive_django_superuser(self):
        request = self.factory.get("/admin/")
        request.user = make_user(role="", school=None, active=False)
        request.user.is_staff = True
        request.user.is_superuser = True

        response = self.middleware.process_view(
            request,
            SimpleNamespace(
                __module__="django.contrib.admin.sites",
                __name__="index",
            ),
            (),
            {},
        )

        self.assertEqual(response.status_code, 403)

    def test_django_admin_allows_login_view_for_authentication(self):
        request = self.factory.get("/admin/login/")
        request.user = AnonymousUser()

        self.assertIsNone(
            self.middleware.process_view(
                request,
                SimpleNamespace(
                    __module__="django.contrib.admin.sites",
                    __name__="login",
                ),
                (),
                {},
            )
        )


class SchoolScopedManagementEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.school_a = SchoolInformation.objects.create(
            name="School A",
            short_name="A",
            slug="school-a",
            address="A address",
            phone_number="111",
        )
        cls.school_b = SchoolInformation.objects.create(
            name="School B",
            short_name="B",
            slug="school-b",
            address="B address",
            phone_number="222",
        )
        cls.admin_a = User.objects.create_user(
            username="admin-a",
            email="admin-a@example.test",
            password="test-password",
            role="admin",
            full_name="Admin A",
            school=cls.school_a,
        )
        cls.subject_b = Subject.objects.create(
            subject_name="School B Subject",
            school=cls.school_b,
        )
        cls.teacher_b = Teacher.objects.create(
            full_name="Teacher B",
            contact_number="222",
            school=cls.school_b,
        )
        cls.department_b = Department.objects.create(
            name="Department B",
            code="DEP-B",
            school=cls.school_b,
        )
        cls.academic_year_a = AcademicYear.objects.create(
            name="2026",
            start_date="2026-01-01",
            end_date="2026-12-31",
            school=cls.school_a,
        )
        cls.academic_year_b = AcademicYear.objects.create(
            name="2026",
            start_date="2026-01-01",
            end_date="2026-12-31",
            school=cls.school_b,
        )
        cls.term_b = Term.objects.create(
            academic_year=cls.academic_year_b,
            term_number=1,
            start_date="2026-01-01",
            end_date="2026-04-30",
        )
        cls.class_a = Class.objects.create(
            name="A Class",
            academic_year=cls.academic_year_a,
            school=cls.school_a,
        )
        cls.form_b = Form.objects.create(
            form_number=1,
            name="B Form",
            school=cls.school_b,
        )
        cls.class_b = Class.objects.create(
            name="B Class",
            academic_year=cls.academic_year_b,
            school=cls.school_b,
        )
        cls.user_b = User.objects.create_user(
            username="admin-b",
            email="admin-b@example.test",
            password="test-password",
            role="admin",
            full_name="Admin B",
            school=cls.school_b,
        )
        cls.teacher_a = Teacher.objects.create(
            full_name="Teacher A",
            contact_number="111",
            school=cls.school_a,
        )
        cls.teacher_a_other = Teacher.objects.create(
            full_name="Another Teacher A",
            contact_number="112",
            school=cls.school_a,
        )
        cls.teacher_user_a = User.objects.get(teacher_profile=cls.teacher_a)
        cls.subject_a = Subject.objects.create(
            subject_name="School A Subject",
            school=cls.school_a,
        )
        cls.student_a = Student.objects.create(
            admission_number="A-0001",
            full_name="Student A",
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="111",
            admission_date="2026-01-01",
            school=cls.school_a,
        )
        cls.student_b = Student.objects.create(
            admission_number="B-0001",
            full_name="Student B",
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="222",
            admission_date="2026-01-01",
            school=cls.school_b,
        )
        StudentClass.objects.create(
            student=cls.student_a,
            assigned_class=cls.class_a,
            school=cls.school_a,
        )
        cls.student_user_a = User.objects.get(student_profile=cls.student_a)
        cls.quiz_a = Quiz.objects.create(
            title="School A Quiz",
            slug="school-a-quiz",
            subject=cls.subject_a,
            teacher=cls.teacher_a,
            school=cls.school_a,
            status="published",
        )
        cls.quiz_a_other_teacher = Quiz.objects.create(
            title="School A Other Teacher Quiz",
            slug="school-a-other-teacher-quiz",
            subject=cls.subject_a,
            teacher=cls.teacher_a_other,
            school=cls.school_a,
            status="published",
        )
        cls.quiz_b = Quiz.objects.create(
            title="School B Quiz",
            slug="school-b-quiz",
            subject=cls.subject_b,
            teacher=cls.teacher_b,
            school=cls.school_b,
            status="published",
        )
        cls.quiz_a.classes.add(cls.class_a)
        cls.attempt_a = cls.create_submitted_attempt(
            cls.quiz_a, cls.student_a, cls.school_a
        )
        cls.attempt_a_other_teacher = cls.create_submitted_attempt(
            cls.quiz_a_other_teacher, cls.student_a, cls.school_a
        )
        cls.attempt_b = cls.create_submitted_attempt(
            cls.quiz_b, cls.student_b, cls.school_b
        )
        cls.response_a = cls.attempt_a.responses.first()
        cls.question_a = cls.response_a.question
        cls.question_b = cls.attempt_b.responses.first().question

    @classmethod
    def create_submitted_attempt(cls, quiz, student, school):
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=student,
            school=school,
            attempt_number=1,
            is_submitted=True,
        )
        question = Question.objects.create(
            quiz=quiz,
            question_text="Explain your answer",
            question_type="essay",
            school=school,
        )
        QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            school=school,
        )
        return attempt

    def setUp(self):
        self.client.force_login(self.admin_a)

    def test_retired_page_get_routes_redirect_for_each_role(self):
        superadmin = User.objects.create_user(
            username="route-audit-superadmin",
            email="route-audit-superadmin@example.test",
            role="superadmin",
            full_name="Route Audit Superadmin",
        )
        users = (
            self.admin_a,
            self.teacher_user_a,
            self.student_user_a,
            superadmin,
        )
        skipped_names = {
            "logout",
            "superadmin_logout",
        }
        route_values = {
            "admin_id": self.admin_a.pk,
            "attempt_id": self.attempt_a.pk,
            "class_id": self.class_a.pk,
            "class_subject_id": 1,
            "department_id": self.teacher_a.department_id or 1,
            "enrollment_id": StudentClass.objects.get(student=self.student_a).pk,
            "form_id": self.form_b.pk,
            "learning_area_id": 1,
            "question_id": self.question_a.pk,
            "quiz_id": self.quiz_a.pk,
            "response_id": self.response_a.pk,
            "school_id": self.school_a.pk,
            "student_id": self.student_a.pk,
            "subject_id": self.subject_a.pk,
            "teacher_id": self.teacher_a.pk,
            "term_id": self.term_b.pk,
            "user_id": self.admin_a.pk,
            "academic_year_id": self.academic_year_a.pk,
            "assignment_id": 1,
        }
        routes = []
        for pattern in urlpatterns:
            route = pattern.pattern._route
            name = pattern.name or ""
            if (
                not route
                or route.startswith(("api/", "app/", "auth-app/"))
                or name in skipped_names
                or any(part in name for part in ("_export", "_template"))
            ):
                continue
            def replace_parameter(match):
                converter, parameter = match.groups()
                if parameter == "uidb64":
                    return "dGVzdA"
                if parameter == "token":
                    return "invalid-token"
                if converter == "int":
                    return str(route_values.get(parameter, 1))
                return "sample"

            path = re.sub(
                r"<(?:(\w+):)?(\w+)>",
                replace_parameter,
                route,
            )
            routes.append((name, f"/{path}"))

        self.assertTrue(routes, "Expected to audit legacy page URL patterns.")
        for user in users:
            for name, path in routes:
                with self.subTest(role=user.role, route=name, path=path):
                    self.client.force_login(user)
                    response = self.client.get(path)
                    self.assertEqual(response.status_code, 302)
                    self.assertTrue(
                        response["Location"].startswith(("/app/", "/")),
                        response["Location"],
                    )

    def test_logout_is_post_only_and_requires_csrf(self):
        self.client.force_login(self.admin_a)
        get_response = self.client.get(reverse("quiz_app:logout"))
        self.assertEqual(get_response.status_code, 405)
        self.assertTrue(self.client.session.get("_auth_user_id"))

        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.admin_a)
        csrf_response = csrf_client.post(reverse("quiz_app:logout"))
        self.assertEqual(csrf_response.status_code, 403)

    def test_superadmin_logout_is_post_only(self):
        superadmin = User.objects.create_user(
            username="logout-superadmin",
            email="logout-superadmin@example.test",
            role="superadmin",
            full_name="Logout Superadmin",
        )
        self.client.force_login(superadmin)

        response = self.client.get(reverse("quiz_app:superadmin_logout"))

        self.assertEqual(response.status_code, 405)
        self.assertTrue(self.client.session.get("_auth_user_id"))

    def test_legacy_terms_endpoint_redirects_to_react(self):
        Term.objects.create(
            academic_year=self.academic_year_a,
            term_number=1,
            start_date="2026-01-01",
            end_date="2026-04-30",
        )
        self.client.force_login(self.teacher_user_a)

        response = self.client.get(
            reverse("quiz_app:get_terms_for_academic_year"),
            {"academic_year_id": self.academic_year_a.pk},
        )

        self.assertRedirects(
            response,
            "/app/teacher/quizzes",
            fetch_redirect_response=False,
        )

    def test_enrollment_endpoints_reject_records_with_foreign_relationships(self):
        invalid_enrollment = StudentClass.objects.create(
            student=self.student_b,
            assigned_class=self.class_a,
            school=self.school_a,
        )

        list_response = self.client.get(reverse("quiz_app:enrollment_list"))
        delete_response = self.client.post(
            reverse("quiz_app:enrollment_delete", args=[invalid_enrollment.pk])
        )
        bulk_response = self.client.post(
            reverse("quiz_app:enrollment_bulk_delete"),
            data=json.dumps({"enrollment_ids": [invalid_enrollment.pk]}),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )

        self.assertEqual(list_response.status_code, 302)
        self.assertTrue(list_response.url.startswith("/app/"))
        self.assertEqual(delete_response.status_code, 404)
        self.assertEqual(bulk_response.status_code, 400)
        invalid_enrollment.refresh_from_db()
        self.assertTrue(invalid_enrollment.is_active)

    def test_superadmin_enrollment_bulk_delete_requires_one_target_school(self):
        enrollment = StudentClass.objects.get(student=self.student_a)
        superadmin = User.objects.create_user(
            username="superadmin-enrollment-bulk",
            email="superadmin-enrollment-bulk@example.test",
            role="superadmin",
            full_name="Superadmin Enrollment Bulk",
        )
        self.client.force_login(superadmin)

        url = reverse("quiz_app:enrollment_bulk_delete")
        response_without_target = self.client.post(
            url,
            data=json.dumps({"enrollment_ids": [enrollment.pk]}),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        response_with_wrong_target = self.client.post(
            url,
            data=json.dumps({
                "enrollment_ids": [enrollment.pk],
                "target_school_id": self.school_b.pk,
            }),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(response_without_target.status_code, 400)
        self.assertEqual(response_with_wrong_target.status_code, 400)

        response_with_target = self.client.post(
            url,
            data=json.dumps({
                "enrollment_ids": [enrollment.pk],
                "target_school_id": self.school_a.pk,
            }),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(response_with_target.status_code, 200)
        enrollment.refresh_from_db()
        self.assertFalse(enrollment.is_active)

    def test_assignment_endpoints_reject_foreign_relationships(self):
        invalid_assignment = TeacherSubjectAssignment.objects.create(
            teacher=self.teacher_b,
            subject=self.subject_a,
            class_assigned=self.class_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        list_response = self.client.get(reverse("quiz_app:assignment_list"))
        edit_response = self.client.get(
            reverse("quiz_app:assignment_edit", args=[invalid_assignment.pk])
        )
        delete_response = self.client.post(
            reverse("quiz_app:assignment_delete", args=[invalid_assignment.pk])
        )

        self.assertEqual(list_response.status_code, 302)
        self.assertTrue(list_response.url.startswith("/app/"))
        self.assertEqual(edit_response.status_code, 302)
        self.assertTrue(edit_response.url.startswith("/app/"))
        self.assertEqual(delete_response.status_code, 404)
        self.assertTrue(
            TeacherSubjectAssignment.objects.filter(pk=invalid_assignment.pk).exists()
        )

    def test_teacher_assignment_requires_class_subject_allocation(self):
        assignment = TeacherSubjectAssignment(
            teacher=self.teacher_a,
            subject=self.subject_a,
            class_assigned=self.class_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        with self.assertRaises(ValidationError) as error:
            assignment.full_clean()

        self.assertIn(
            "The subject must be allocated to the selected class and academic year.",
            error.exception.messages,
        )

    def test_teacher_assignment_rejects_cross_school_relationships(self):
        assignment = TeacherSubjectAssignment(
            teacher=self.teacher_b,
            subject=self.subject_a,
            class_assigned=self.class_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        with self.assertRaises(ValidationError) as error:
            assignment.full_clean()

        self.assertIn(
            "Teacher, subject, class, academic year, and assignment must belong to the same school.",
            error.exception.messages,
        )

    def test_student_model_validation_rejects_foreign_school_relationships(self):
        student = Student(
            admission_number="A-0002",
            full_name="Invalid Student",
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="111",
            admission_date="2026-01-01",
            school=self.school_a,
            form=self.form_b,
        )

        with self.assertRaises(ValidationError) as error:
            student.full_clean()

        self.assertIn("form", error.exception.message_dict)

    def test_teacher_model_validation_rejects_foreign_department(self):
        teacher = Teacher(
            full_name="Invalid Teacher",
            contact_number="111",
            school=self.school_a,
            department=self.department_b,
        )

        with self.assertRaises(ValidationError) as error:
            teacher.full_clean()

        self.assertIn("department", error.exception.message_dict)

    def test_class_archive_preserves_records_and_restore_keeps_relationships_inactive(self):
        enrollment = StudentClass.objects.get(student=self.student_a)
        archive_response = self.client.post(
            reverse("quiz_app:class_delete", args=[self.class_a.pk])
        )

        self.assertEqual(archive_response.status_code, 200)
        self.class_a.refresh_from_db()
        enrollment.refresh_from_db()
        self.assertFalse(self.class_a.is_active)
        self.assertFalse(enrollment.is_active)
        self.assertTrue(Class.objects.filter(pk=self.class_a.pk).exists())
        class_list_response = self.client.get(reverse("quiz_app:class_list"))
        self.assertRedirects(
            class_list_response, "/app/admin/classes", fetch_redirect_response=False
        )

        restore_response = self.client.post(
            reverse("quiz_app:class_restore", args=[self.class_a.pk])
        )

        self.assertEqual(restore_response.status_code, 200)
        self.class_a.refresh_from_db()
        enrollment.refresh_from_db()
        self.assertTrue(self.class_a.is_active)
        self.assertFalse(enrollment.is_active)

    def test_subject_archive_preserves_quiz_and_assignment_history(self):
        allocation = ClassSubject.objects.create(
            class_name=self.class_a,
            subject=self.subject_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        assignment = TeacherSubjectAssignment.objects.create(
            teacher=self.teacher_a,
            subject=self.subject_a,
            class_assigned=self.class_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        archive_response = self.client.post(
            reverse("quiz_app:subject_delete", args=[self.subject_a.pk])
        )

        self.assertEqual(archive_response.status_code, 200)
        self.subject_a.refresh_from_db()
        assignment.refresh_from_db()
        self.assertFalse(self.subject_a.is_active)
        self.assertFalse(assignment.is_active)
        self.assertTrue(Subject.objects.filter(pk=self.subject_a.pk).exists())
        self.assertTrue(Quiz.objects.filter(pk=self.quiz_a.pk).exists())
        self.assertTrue(ClassSubject.objects.filter(pk=allocation.pk).exists())
        self.assertEqual(
            Subject.objects.filter(school=self.school_a, is_active=True).count(),
            0,
        )

        restore_response = self.client.post(
            reverse("quiz_app:subject_restore", args=[self.subject_a.pk])
        )

        self.assertEqual(restore_response.status_code, 200)
        self.subject_a.refresh_from_db()
        assignment.refresh_from_db()
        self.assertTrue(self.subject_a.is_active)
        self.assertFalse(assignment.is_active)

    def test_prefetched_current_class_uses_the_same_school_enrollment(self):
        student = Student.objects.prefetch_related(
            Prefetch(
                "studentclass_set",
                queryset=StudentClass.objects.filter(
                    is_active=True,
                    student__school_id=F("school_id"),
                    assigned_class__school_id=F("school_id"),
                ).select_related("assigned_class"),
            )
        ).get(pk=self.student_a.pk)

        with self.assertNumQueries(0):
            current_class = student.get_current_class()

        self.assertEqual(current_class, self.class_a)

    def test_active_teacher_assignment_has_database_duplicate_protection(self):
        ClassSubject.objects.create(
            class_name=self.class_a,
            subject=self.subject_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        assignment_values = {
            "teacher": self.teacher_a,
            "subject": self.subject_a,
            "class_assigned": self.class_a,
            "academic_year": self.academic_year_a,
            "school": self.school_a,
        }
        TeacherSubjectAssignment.objects.create(**assignment_values)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TeacherSubjectAssignment.objects.create(**assignment_values)

    def test_teacher_assignment_reassignment_preserves_history(self):
        ClassSubject.objects.create(
            class_name=self.class_a,
            subject=self.subject_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        assignment = TeacherSubjectAssignment.objects.create(
            teacher=self.teacher_a,
            subject=self.subject_a,
            class_assigned=self.class_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        assignment.teacher = self.teacher_a_other
        assignment.full_clean()
        assignment.save()
        assignment.refresh_from_db()

        self.assertEqual(assignment.previous_teacher, self.teacher_a)
        self.assertEqual(len(assignment.assignment_history), 1)
        self.assertEqual(
            assignment.assignment_history[0]["action"],
            "reassigned",
        )

    def test_student_archive_and_restore_preserve_history_and_account_state(self):
        enrollment = StudentClass.objects.get(student=self.student_a)
        enrollment_count = StudentClass.objects.filter(
            student=self.student_a
        ).count()
        archive_response = self.client.post(
            reverse("quiz_app:student_delete", args=[self.student_a.pk])
        )

        self.assertEqual(archive_response.status_code, 200)
        self.student_a.refresh_from_db()
        self.student_user_a.refresh_from_db()
        enrollment.refresh_from_db()
        self.assertFalse(self.student_a.is_active)
        self.assertFalse(self.student_user_a.is_active)
        self.assertFalse(enrollment.is_active)
        self.assertTrue(Student.objects.filter(pk=self.student_a.pk).exists())
        self.assertEqual(
            Student.objects.filter(school=self.school_a, is_active=True).count(),
            0,
        )
        self.assertEqual(
            Student.objects.filter(school=self.school_a, is_active=False).count(),
            1,
        )

        restore_response = self.client.post(
            reverse("quiz_app:student_restore", args=[self.student_a.pk])
        )

        self.assertEqual(restore_response.status_code, 200)
        self.student_a.refresh_from_db()
        self.student_user_a.refresh_from_db()
        enrollment.refresh_from_db()
        self.assertTrue(self.student_a.is_active)
        self.assertTrue(self.student_user_a.is_active)
        self.assertFalse(enrollment.is_active)
        self.assertEqual(
            StudentClass.objects.filter(student=self.student_a).count(),
            enrollment_count,
        )

    def test_student_restore_preserves_pre_archive_account_deactivation(self):
        self.student_user_a.is_active = False
        self.student_user_a.save(update_fields=["is_active"])

        self.client.post(reverse("quiz_app:student_delete", args=[self.student_a.pk]))
        self.client.post(reverse("quiz_app:student_restore", args=[self.student_a.pk]))

        self.student_a.refresh_from_db()
        self.student_user_a.refresh_from_db()
        self.assertTrue(self.student_a.is_active)
        self.assertFalse(self.student_user_a.is_active)

    def test_bulk_archive_and_restore_keep_student_records(self):
        response = self.client.post(
            reverse("quiz_app:student_bulk_delete"),
            data=json.dumps({
                "student_ids": [self.student_a.pk],
                "action": "archive",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updated"], 1)
        self.student_a.refresh_from_db()
        self.student_user_a.refresh_from_db()
        self.assertFalse(self.student_a.is_active)
        self.assertFalse(self.student_user_a.is_active)

        response = self.client.post(
            reverse("quiz_app:student_bulk_delete"),
            data=json.dumps({
                "student_ids": [self.student_a.pk],
                "action": "restore",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updated"], 1)
        self.student_a.refresh_from_db()
        self.student_user_a.refresh_from_db()
        self.assertTrue(self.student_a.is_active)
        self.assertTrue(self.student_user_a.is_active)

    def test_teacher_archive_and_restore_preserve_assignments_and_account_state(self):
        ClassSubject.objects.create(
            class_name=self.class_a,
            subject=self.subject_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        assignment = TeacherSubjectAssignment.objects.create(
            teacher=self.teacher_a,
            subject=self.subject_a,
            class_assigned=self.class_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        class_teacher = ClassTeacher.objects.create(
            teacher=self.teacher_a,
            class_assigned=self.class_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        archive_response = self.client.post(
            reverse("quiz_app:teacher_delete", args=[self.teacher_a.pk])
        )

        self.assertEqual(archive_response.status_code, 200)
        self.teacher_a.refresh_from_db()
        self.teacher_user_a.refresh_from_db()
        assignment.refresh_from_db()
        class_teacher.refresh_from_db()
        self.assertFalse(self.teacher_a.is_active)
        self.assertFalse(self.teacher_user_a.is_active)
        self.assertFalse(assignment.is_active)
        self.assertFalse(class_teacher.is_active)
        self.assertTrue(Teacher.objects.filter(pk=self.teacher_a.pk).exists())
        self.assertEqual(
            Teacher.objects.filter(school=self.school_a, is_active=True).count(),
            1,
        )
        self.assertEqual(
            Teacher.objects.filter(school=self.school_a, is_active=False).count(),
            1,
        )

        restore_response = self.client.post(
            reverse("quiz_app:teacher_restore", args=[self.teacher_a.pk])
        )

        self.assertEqual(restore_response.status_code, 200)
        self.teacher_a.refresh_from_db()
        self.teacher_user_a.refresh_from_db()
        assignment.refresh_from_db()
        self.assertTrue(self.teacher_a.is_active)
        self.assertTrue(self.teacher_user_a.is_active)
        self.assertFalse(assignment.is_active)

    def test_bulk_assignment_reports_created_and_invalid_combinations(self):
        second_class = Class.objects.create(
            name="A Second Class",
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        ClassSubject.objects.create(
            class_name=self.class_a,
            subject=self.subject_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        response = self.client.post(
            reverse("quiz_app:assignment_bulk_create"),
            data=json.dumps({
                "teacher_id": self.teacher_a.pk,
                "subject_ids": [self.subject_a.pk],
                "class_ids": [self.class_a.pk, second_class.pk],
                "academic_year_id": self.academic_year_a.pk,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["created"], 1)
        self.assertEqual(payload["skipped"], 0)
        self.assertEqual(payload["error_count"], 1)
        self.assertEqual(len(payload["errors"]), 1)

    def test_result_and_grading_views_hide_responses_with_foreign_questions(self):
        foreign_response = QuizResponse.objects.create(
            attempt=self.attempt_a,
            question=self.question_b,
            school=self.school_a,
        )

        result_response = self.client.get(
            reverse("quiz_app:quiz_result_detail", args=[self.attempt_a.pk])
        )
        grading_response = self.client.get(
            reverse("quiz_app:quiz_attempt_grading", args=[self.attempt_a.pk])
        )
        foreign_grade_response = self.client.post(
            reverse("quiz_app:api_teacher_response_grade", args=[foreign_response.pk]),
            data=json.dumps({"marks_awarded": 1}),
            content_type="application/json",
        )

        self.assertEqual(result_response.status_code, 302)
        self.assertTrue(result_response.url.startswith("/app/"))
        self.assertEqual(grading_response.status_code, 302)
        self.assertTrue(grading_response.url.startswith("/app/"))
        self.assertEqual(foreign_grade_response.status_code, 404)


    def test_admin_can_bulk_grade_in_school_essay_response(self):
        response = self.client.post(
            reverse("quiz_app:api_teacher_grading_bulk", args=[self.attempt_a.pk]),
            data=json.dumps({
                "grades": [{
                    "response_id": self.response_a.pk,
                    "marks_awarded": 1,
                    "grading_notes": "Reviewed",
                }],
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.response_a.refresh_from_db()
        self.assertTrue(self.response_a.is_graded)
        self.assertEqual(self.response_a.graded_by, self.admin_a)

    def test_results_export_is_school_scoped_and_formula_values_are_text(self):
        malicious_title = '=HYPERLINK("https://example.test","open")'
        self.quiz_a.title = malicious_title
        self.quiz_a.save(update_fields=["title"])

        response = self.client.get(reverse("quiz_app:quiz_results_export"))

        self.assertEqual(response.status_code, 200)
        from openpyxl import load_workbook

        workbook = load_workbook(BytesIO(response.content), data_only=False)
        worksheet = workbook.active
        rows = list(worksheet.iter_rows(min_row=2))
        titles = [row[2].value for row in rows]

        self.assertIn(malicious_title, titles)
        self.assertNotIn("School B Quiz", titles)
        formula_title_cell = next(row[2] for row in rows if row[2].value == malicious_title)
        self.assertEqual(formula_title_cell.data_type, "s")
        self.assertFalse(
            any(cell.data_type == "f" for row in rows for cell in row)
        )
        workbook.close()

    def test_results_export_includes_attempt_and_term_number(self):
        term = Term.objects.create(
            academic_year=self.academic_year_a,
            term_number=2,
            start_date="2026-05-01",
            end_date="2026-08-31",
        )
        self.attempt_a.academic_year = self.academic_year_a
        self.attempt_a.term = term
        self.attempt_a.save(update_fields=["academic_year", "term"])

        response = self.client.get(reverse("quiz_app:quiz_results_export"))

        self.assertEqual(response.status_code, 200)
        from openpyxl import load_workbook

        workbook = load_workbook(BytesIO(response.content), data_only=True)
        worksheet = workbook.active
        row = next(
            values
            for values in worksheet.iter_rows(min_row=2, values_only=True)
            if values[1] == self.student_a.admission_number
            and values[2] == self.quiz_a.title
        )
        self.assertEqual(row[2], self.quiz_a.title)
        self.assertEqual(row[14], self.academic_year_a.name)
        self.assertEqual(row[15], "2026 - Term 2")
        workbook.close()

    def test_student_exports_are_school_scoped_filtered_and_formula_safe(self):
        malicious_name = "=HYPERLINK(\"https://example.test\",\"open\")"
        Student.objects.create(
            admission_number="A-EXPORT",
            full_name=malicious_name,
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="+5551234",
            admission_date="2026-01-01",
            school=self.school_a,
        )

        csv_response = self.client.get(
            reverse("quiz_app:student_export", args=["csv"]),
            {"search": "HYPERLINK"},
        )
        self.assertEqual(csv_response.status_code, 200)
        csv_content = b"".join(csv_response.streaming_content).decode("utf-8")
        self.assertIn("'=HYPERLINK", csv_content)
        self.assertNotIn("Student B", csv_content)
        self.assertIn("A-EXPORT", csv_content)

        xlsx_response = self.client.get(
            reverse("quiz_app:student_export", args=["xlsx"]),
            {"search": "HYPERLINK"},
        )
        self.assertEqual(xlsx_response.status_code, 200)
        from openpyxl import load_workbook

        workbook = load_workbook(BytesIO(xlsx_response.content), data_only=False)
        worksheet = workbook.active
        exported_cell = worksheet["B2"]
        self.assertEqual(exported_cell.value, malicious_name)
        self.assertEqual(exported_cell.data_type, "s")
        self.assertFalse(
            any(
                cell.data_type == "f"
                for row in worksheet.iter_rows()
                for cell in row
            )
        )
        workbook.close()

    def test_student_export_includes_inactive_enrollment_for_selected_prior_year(self):
        previous_year = AcademicYear.objects.create(
            name="2025",
            start_date="2025-01-01",
            end_date="2025-12-31",
            school=self.school_a,
        )
        previous_class = Class.objects.create(
            name="Previous Year Class",
            academic_year=previous_year,
            school=self.school_a,
        )
        previous_enrollment = StudentClass.objects.create(
            student=self.student_a,
            assigned_class=previous_class,
            school=self.school_a,
            is_active=False,
        )

        response = self.client.get(
            reverse("quiz_app:student_export", args=["csv"]),
            {"academic_year": previous_year.pk},
        )

        self.assertEqual(response.status_code, 200)
        exported = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn(self.student_a.admission_number, exported)
        self.assertIn("Previous Year Class", exported)
        self.assertIn("2025", exported)
        self.assertFalse(previous_enrollment.is_active)

    def test_teacher_exports_are_school_scoped_and_honor_filters(self):
        department = Department.objects.create(
            name="Export Department",
            code="EXPORT",
            school=self.school_a,
        )
        Teacher.objects.create(
            full_name="@Teacher Export",
            contact_number="555-0101",
            department=department,
            school=self.school_a,
        )

        response = self.client.get(
            reverse("quiz_app:teacher_export", args=["csv"]),
            {"department": department.pk},
        )

        self.assertEqual(response.status_code, 200)
        content = b"".join(response.streaming_content).decode("utf-8")
        self.assertIn("'@Teacher Export", content)
        self.assertNotIn("Teacher B", content)

    def test_superadmin_exports_require_an_explicit_active_target_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-export",
            email="superadmin-export@example.test",
            role="superadmin",
            full_name="Superadmin Export",
        )
        self.client.force_login(superadmin)

        no_target = self.client.get(
            reverse("quiz_app:student_export", args=["csv"])
        )
        export = self.client.get(
            reverse("quiz_app:student_export", args=["csv"]),
            {"school_id": self.school_a.pk},
        )

        self.assertEqual(no_target.status_code, 400)
        self.assertEqual(export.status_code, 200)
        self.school_b.is_active = False
        self.school_b.save(update_fields=["is_active"])
        inactive_export = self.client.get(
            reverse("quiz_app:teacher_export", args=["csv"]),
            {"school_id": self.school_b.pk},
        )
        self.assertEqual(inactive_export.status_code, 400)

    def test_teacher_without_profile_cannot_export_results(self):
        teacher_without_profile = User.objects.create_user(
            username="teacher-without-profile",
            email="teacher-without-profile@example.test",
            password="test-password",
            role="teacher",
            full_name="Teacher Without Profile",
            school=self.school_a,
        )
        self.client.force_login(teacher_without_profile)

        response = self.client.get(reverse("quiz_app:quiz_results_export"))

        self.assertEqual(response.status_code, 403)

    def test_superadmin_class_subject_endpoint_uses_class_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-class-subjects",
            email="superadmin-class-subjects@example.test",
            role="superadmin",
            full_name="Superadmin Class Subjects",
        )
        self.client.force_login(superadmin)
        query = {"class_id": self.class_a.pk}
        legacy_url = reverse("quiz_app:get_class_subjects")

        legacy_response = self.client.get(
            legacy_url,
            {**query, "academic_year_id": self.academic_year_a.pk},
        )
        foreign_year_response = self.client.get(
            reverse("quiz_app:api_teacher_assignment_class_subjects"),
            {**query, "academic_year_id": self.academic_year_b.pk},
        )
        same_school_response = self.client.get(
            reverse("quiz_app:api_teacher_assignment_class_subjects"),
            {**query, "academic_year_id": self.academic_year_a.pk},
        )

        self.assertRedirects(
            legacy_response,
            "/app/admin/assignments",
            fetch_redirect_response=False,
        )
        self.assertEqual(foreign_year_response.status_code, 200)
        self.assertEqual(foreign_year_response.json()["subjects"], [])
        self.assertEqual(same_school_response.status_code, 200)
        self.assertEqual(same_school_response.json()["subjects"], [])

    def test_enrollment_create_enforces_capacity_and_is_idempotent(self):
        self.class_a.maximum_students = 1
        self.class_a.save(update_fields=["maximum_students"])
        existing_enrollment = StudentClass.objects.get(student=self.student_a)
        repeat_response = self.client.post(
            reverse("quiz_app:enrollment_create"),
            {
                "student": self.student_a.pk,
                "assigned_class": self.class_a.pk,
            },
        )
        new_student = Student.objects.create(
            admission_number="A-0002",
            full_name="Student A2",
            date_of_birth="2010-02-01",
            gender="F",
            parent_contact="112",
            admission_date="2026-01-02",
            school=self.school_a,
        )
        full_response = self.client.post(
            reverse("quiz_app:enrollment_create"),
            {
                "student": new_student.pk,
                "assigned_class": self.class_a.pk,
            },
        )

        self.assertEqual(repeat_response.status_code, 200)
        self.assertEqual(
            repeat_response.json()["enrollment_id"],
            existing_enrollment.pk,
        )
        self.assertEqual(full_response.status_code, 400)
        self.assertEqual(
            StudentClass.objects.filter(
                assigned_class=self.class_a,
                school=self.school_a,
                is_active=True,
            ).count(),
            1,
        )

    def test_enrollment_edit_transfer_creates_history_instead_of_rewriting_it(self):
        previous_enrollment = StudentClass.objects.get(student=self.student_a)
        target_class = Class.objects.create(
            name="Transferred Class",
            academic_year=self.academic_year_a,
            school=self.school_a,
        )

        response = self.client.post(
            reverse("quiz_app:enrollment_edit", args=[previous_enrollment.pk]),
            {
                "student": self.student_a.pk,
                "assigned_class": target_class.pk,
                "is_active": "on",
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        previous_enrollment.refresh_from_db()
        current_enrollment = StudentClass.objects.get(
            student=self.student_a,
            assigned_class=target_class,
            is_active=True,
        )
        self.assertFalse(previous_enrollment.is_active)
        self.assertEqual(previous_enrollment.assigned_class, self.class_a)
        self.assertEqual(previous_enrollment.school, self.school_a)
        self.assertEqual(current_enrollment.school, self.school_a)
        self.assertEqual(
            StudentClass.objects.filter(
                student=self.student_a,
                school=self.school_a,
            ).count(),
            2,
        )

    def test_enrollment_edit_reactivation_creates_new_row(self):
        previous_enrollment = StudentClass.objects.get(student=self.student_a)
        previous_enrollment.is_active = False
        previous_enrollment.save(update_fields=["is_active"])

        response = self.client.post(
            reverse("quiz_app:enrollment_edit", args=[previous_enrollment.pk]),
            {"is_active": "on"},
        )

        self.assertEqual(response.status_code, 200, response.content)
        previous_enrollment.refresh_from_db()
        self.assertFalse(previous_enrollment.is_active)
        self.assertEqual(
            StudentClass.objects.filter(
                student=self.student_a,
                school=self.school_a,
                is_active=True,
            ).count(),
            1,
        )
        self.assertEqual(
            StudentClass.objects.filter(
                student=self.student_a,
                school=self.school_a,
            ).count(),
            2,
        )

    def test_historical_enrollment_cannot_be_reassigned_or_reactivated(self):
        historical_enrollment = StudentClass.objects.get(student=self.student_a)
        target_class = Class.objects.create(
            name="History Guard Class",
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        historical_enrollment.is_active = False
        historical_enrollment.save(update_fields=["is_active"])

        historical_enrollment.assigned_class = target_class
        with self.assertRaises(ValidationError):
            historical_enrollment.full_clean()

        historical_enrollment.refresh_from_db()
        historical_enrollment.is_active = True
        with self.assertRaises(ValidationError):
            historical_enrollment.full_clean()

        historical_enrollment.refresh_from_db()
        self.assertFalse(historical_enrollment.is_active)
        self.assertEqual(historical_enrollment.assigned_class, self.class_a)

    def test_enrollment_edit_rejects_changing_the_student(self):
        previous_enrollment = StudentClass.objects.get(student=self.student_a)

        response = self.client.post(
            reverse("quiz_app:enrollment_edit", args=[previous_enrollment.pk]),
            {
                "student": self.student_b.pk,
                "assigned_class": self.class_a.pk,
                "is_active": "on",
            },
        )

        self.assertEqual(response.status_code, 400)
        previous_enrollment.refresh_from_db()
        self.assertTrue(previous_enrollment.is_active)
        self.assertEqual(previous_enrollment.student, self.student_a)

    def test_generic_enrollment_rejects_cross_year_promotion_without_policy(self):
        next_year = AcademicYear.objects.create(
            name="2027",
            start_date="2027-01-01",
            end_date="2027-12-31",
            school=self.school_a,
        )
        next_year_class = Class.objects.create(
            name="Next Year Class",
            academic_year=next_year,
            school=self.school_a,
        )
        previous_enrollment = StudentClass.objects.get(student=self.student_a)

        response = self.client.post(
            reverse("quiz_app:enrollment_create"),
            {
                "student": self.student_a.pk,
                "assigned_class": next_year_class.pk,
            },
        )

        self.assertEqual(response.status_code, 400)
        previous_enrollment.refresh_from_db()
        self.assertTrue(previous_enrollment.is_active)
        self.assertEqual(previous_enrollment.assigned_class, self.class_a)
        self.assertFalse(
            StudentClass.objects.filter(
                student=self.student_a,
                assigned_class=next_year_class,
                is_active=True,
            ).exists()
        )

    def test_student_school_cannot_be_changed_without_transfer_workflow(self):
        self.student_a.school = self.school_b

        with self.assertRaises(ValidationError):
            self.student_a.full_clean()

        self.student_a.refresh_from_db()
        self.assertEqual(self.student_a.school, self.school_a)

    def test_class_academic_year_cannot_change_after_history_exists(self):
        next_year = AcademicYear.objects.create(
            name="2027",
            start_date="2027-01-01",
            end_date="2027-12-31",
            school=self.school_a,
        )

        response = self.client.post(
            reverse("quiz_app:class_edit", args=[self.class_a.pk]),
            {
                "name": self.class_a.name,
                "academic_year": next_year.pk,
                "maximum_students": self.class_a.maximum_students,
            },
        )

        self.assertEqual(response.status_code, 400, response.content)
        self.class_a.refresh_from_db()
        self.assertEqual(self.class_a.academic_year, self.academic_year_a)
        self.assertTrue(
            StudentClass.objects.filter(
                assigned_class=self.class_a,
                student=self.student_a,
            ).exists()
        )

    def test_academic_year_and_term_deletion_preserve_history(self):
        term = Term.objects.create(
            academic_year=self.academic_year_a,
            term_number=1,
            start_date="2026-01-01",
            end_date="2026-04-30",
        )
        self.attempt_a.term = term
        self.attempt_a.academic_year = self.academic_year_a
        self.attempt_a.save(update_fields=["term", "academic_year"])

        year_response = self.client.post(
            reverse("quiz_app:academic_year_delete", args=[self.academic_year_a.pk])
        )
        term_response = self.client.post(
            reverse("quiz_app:term_delete", args=[term.pk])
        )

        self.assertEqual(year_response.status_code, 400)
        self.assertEqual(term_response.status_code, 400)
        self.assertTrue(AcademicYear.objects.filter(pk=self.academic_year_a.pk).exists())
        self.assertTrue(Term.objects.filter(pk=term.pk).exists())
        self.attempt_a.refresh_from_db()
        self.assertEqual(self.attempt_a.term, term)
        self.assertEqual(self.attempt_a.academic_year, self.academic_year_a)

    def test_quiz_with_attempts_cannot_be_deleted(self):
        response = self.client.delete(
            reverse("quiz_app:api_teacher_quiz_detail", args=[self.quiz_a.pk]),
        )

        self.assertEqual(response.status_code, 409)
        self.assertTrue(Quiz.objects.filter(pk=self.quiz_a.pk).exists())
        self.assertTrue(QuizAttempt.objects.filter(pk=self.attempt_a.pk).exists())
        self.assertTrue(QuizResponse.objects.filter(pk=self.response_a.pk).exists())

    def test_django_admin_disables_hard_delete_of_academic_history(self):
        request = RequestFactory().get("/admin/")
        request.user = self.admin_a

        for model in (
            Student,
            StudentClass,
            Class,
            AcademicYear,
            Term,
            QuizAttempt,
            QuizResponse,
        ):
            with self.subTest(model=model.__name__):
                self.assertFalse(
                    django_admin.site._registry[model].has_delete_permission(
                        request
                    )
                )
        quiz_admin = django_admin.site._registry[Quiz]
        self.assertFalse(quiz_admin.has_delete_permission(request, self.quiz_a))
        self.assertNotIn("delete_selected", quiz_admin.get_actions(request))

    def test_active_student_enrollment_is_unique_but_history_is_retained(self):
        duplicate_values = {
            "student": self.student_a,
            "assigned_class": self.class_a,
            "school": self.school_a,
        }

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                StudentClass.objects.create(**duplicate_values)

        historical_enrollment = StudentClass.objects.create(
            **duplicate_values,
            is_active=False,
        )
        self.assertFalse(historical_enrollment.is_active)
        self.assertEqual(
            StudentClass.objects.filter(
                student=self.student_a,
                school=self.school_a,
                is_active=True,
            ).count(),
            1,
        )

    def test_bulk_enrollment_stops_at_capacity_and_reports_remaining_errors(self):
        target_class = Class.objects.create(
            name="Limited Class",
            academic_year=self.academic_year_a,
            maximum_students=1,
            school=self.school_a,
        )
        new_student = Student.objects.create(
            admission_number="A-0003",
            full_name="Student A3",
            date_of_birth="2010-03-01",
            gender="M",
            parent_contact="113",
            admission_date="2026-01-03",
            school=self.school_a,
        )

        response = self.client.post(
            reverse("quiz_app:enrollment_bulk_create"),
            data=json.dumps({
                "class_id": target_class.pk,
                "student_ids": [self.student_a.pk, new_student.pk],
            }),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["created"], 1)
        self.assertEqual(response.json()["error_count"], 1)
        self.assertEqual(
            StudentClass.objects.filter(
                assigned_class=target_class,
                school=self.school_a,
                is_active=True,
            ).count(),
            1,
        )

    def test_school_admin_can_view_school_result_without_teacher_profile(self):
        response = self.client.get(
            reverse("quiz_app:quiz_result_detail", args=[self.attempt_a.pk])
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/app/"))

    def test_school_admin_cannot_view_another_school_result(self):
        response = self.client.get(
            reverse("quiz_app:quiz_result_detail", args=[self.attempt_b.pk])
        )

        self.assertEqual(response.status_code, 404)

    def test_teacher_can_only_view_results_for_owned_quizzes(self):
        self.client.force_login(self.teacher_user_a)

        own_result = self.client.get(
            reverse("quiz_app:quiz_result_detail", args=[self.attempt_a.pk])
        )
        other_teacher_result = self.client.get(
            reverse(
                "quiz_app:quiz_result_detail",
                args=[self.attempt_a_other_teacher.pk],
            )
        )

        self.assertEqual(own_result.status_code, 302)
        self.assertTrue(own_result.url.startswith("/app/"))
        self.assertEqual(other_teacher_result.status_code, 404)

    def test_teacher_print_route_redirects_to_react_only_for_owned_results(self):
        self.client.force_login(self.teacher_user_a)

        own_result = self.client.get(
            reverse("quiz_app:quiz_result_print", args=[self.attempt_a.pk])
        )
        other_teacher_result = self.client.get(
            reverse(
                "quiz_app:quiz_result_print",
                args=[self.attempt_a_other_teacher.pk],
            )
        )
        legacy_print_mode = self.client.get(
            reverse("quiz_app:quiz_result_detail", args=[self.attempt_a.pk]),
            {"print": "1"},
        )

        self.assertRedirects(
            own_result,
            f"/app/teacher/results/{self.attempt_a.pk}/print",
            fetch_redirect_response=False,
        )
        self.assertEqual(other_teacher_result.status_code, 404)
        self.assertRedirects(
            legacy_print_mode,
            f"/app/teacher/results/{self.attempt_a.pk}/print",
            fetch_redirect_response=False,
        )

    def test_bulk_print_redirects_selected_owned_results_to_react(self):
        self.client.force_login(self.teacher_user_a)

        response = self.client.get(
            reverse("quiz_app:quiz_results_bulk_print"),
            {"attempt_ids": [str(self.attempt_a.pk)]},
        )

        self.assertRedirects(
            response,
            f"/app/teacher/results/print/?attempt_ids={self.attempt_a.pk}",
            fetch_redirect_response=False,
        )

    def test_teacher_result_api_includes_unanswered_questions_for_print(self):
        self.client.force_login(self.teacher_user_a)
        unanswered = Question.objects.create(
            quiz=self.quiz_a,
            question_text="Unanswered report question",
            question_type="short_answer",
            marks=3,
            order=99,
            school=self.school_a,
            correct_answer_text="Expected answer",
        )

        response = self.client.get(
            reverse("quiz_app:api_teacher_result_detail", args=[self.attempt_a.pk])
        )

        self.assertEqual(response.status_code, 200)
        unanswered_response = next(
            item
            for item in response.json()["responses"]
            if item["question_text"] == unanswered.question_text
        )
        self.assertFalse(unanswered_response["is_answered"])
        self.assertEqual(unanswered_response["marks_awarded"], 0)
        self.assertEqual(unanswered_response["answer_key"], "Expected answer")

    def test_school_admin_can_open_in_school_response_for_grading(self):
        response = self.client.get(
            reverse(
                "quiz_app:api_teacher_grading_detail",
                args=[self.attempt_a.pk],
            ),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["responses"][0]["id"], self.response_a.pk)

    def test_school_admin_cannot_grade_response_from_another_school(self):
        response = self.client.get(
            reverse(
                "quiz_app:api_teacher_grading_detail",
                args=[self.attempt_b.pk],
            ),
        )

        self.assertEqual(response.status_code, 404)

    def test_school_admin_can_download_template_for_any_school_quiz(self):
        response = self.client.get(
            reverse(
                "quiz_app:question_import_template",
                args=[self.quiz_a_other_teacher.pk, "csv"],
            )
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")

    def test_school_admin_cannot_download_template_for_another_school(self):
        response = self.client.get(
            reverse(
                "quiz_app:question_import_template",
                args=[self.quiz_b.pk, "csv"],
            )
        )

        self.assertEqual(response.status_code, 404)

    def test_school_admin_can_duplicate_question_without_teacher_profile(self):
        response = self.client.post(
            reverse(
                "quiz_app:api_teacher_question_duplicate",
                args=[self.quiz_a.pk, self.question_a.pk],
            ),
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertEqual(
            Question.objects.filter(
                quiz=self.quiz_a,
                school=self.school_a,
                question_text=self.question_a.question_text,
            ).count(),
            2,
        )

    def test_school_admin_cannot_delete_question_with_attempt_history(self):
        response = self.client.delete(
            reverse(
                "quiz_app:api_teacher_question_detail",
                args=[self.quiz_a.pk, self.question_a.pk],
            ),
        )

        self.assertEqual(response.status_code, 409)
        self.assertTrue(Question.objects.filter(pk=self.question_a.pk).exists())
        self.assertTrue(
            QuizResponse.objects.filter(
                pk=self.response_a.pk,
                attempt=self.attempt_a,
                question=self.question_a,
            ).exists()
        )

    def test_bulk_delete_preserves_questions_with_attempt_history(self):
        response = self.client.post(
            reverse("quiz_app:api_teacher_question_bulk_delete", args=[self.quiz_a.pk]),
            data=json.dumps({"question_ids": [self.question_a.pk]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertTrue(Question.objects.filter(pk=self.question_a.pk).exists())
        self.assertTrue(
            QuizResponse.objects.filter(
                pk=self.response_a.pk,
                attempt=self.attempt_a,
            ).exists()
        )

    def test_queryset_delete_cannot_remove_questions_from_attempted_quiz(self):
        with self.assertRaises(ProtectedError):
            with transaction.atomic():
                Question.objects.filter(pk=self.question_a.pk).delete()

        self.assertTrue(Question.objects.filter(pk=self.question_a.pk).exists())
        self.assertTrue(
            QuizResponse.objects.filter(
                pk=self.response_a.pk,
                attempt=self.attempt_a,
            ).exists()
        )

    def test_question_edit_cannot_remove_a_choice_selected_in_an_attempt(self):
        question = Question.objects.create(
            quiz=self.quiz_a,
            question_text="Select an answer",
            question_type="multiple_choice",
            marks=1,
            school=self.school_a,
        )
        retained_choice = AnswerChoice.objects.create(
            question=question,
            choice_text="Retained choice",
            is_correct=True,
            school=self.school_a,
        )
        selected_choice = AnswerChoice.objects.create(
            question=question,
            choice_text="Selected choice",
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=9,
        )
        attempt.capture_configuration()
        answer = QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            selected_choice=selected_choice,
            school=self.school_a,
        )
        answer.selected_choices.set([selected_choice])

        response = self.client.patch(
            reverse(
                "quiz_app:api_teacher_question_detail",
                args=[self.quiz_a.pk, question.pk],
            ),
            data=json.dumps({
                "question_text": "Edited question",
                "marks": 1,
                "order": 1,
                "negative_marks": 0,
                "choices": [{"id": retained_choice.pk, "text": "Retained choice", "is_correct": True}],
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        question.refresh_from_db()
        self.assertEqual(question.question_text, "Select an answer")
        self.assertTrue(
            AnswerChoice.objects.filter(pk=selected_choice.pk).exists()
        )
        answer.refresh_from_db()
        self.assertEqual(answer.selected_choice_id, selected_choice.pk)

    def test_teacher_cannot_delete_question_from_another_teachers_quiz(self):
        self.client.force_login(self.teacher_user_a)

        response = self.client.delete(
            reverse(
                "quiz_app:api_teacher_question_detail",
                args=[self.quiz_a_other_teacher.pk, self.attempt_a_other_teacher.responses.first().question.pk],
            ),
        )

        self.assertEqual(response.status_code, 404)

    def test_bulk_delete_rejects_mixed_quiz_question_ids_without_deleting(self):
        response = self.client.post(
            reverse("quiz_app:api_teacher_question_bulk_delete", args=[self.quiz_a.pk]),
            data=json.dumps(
                {"question_ids": [self.question_a.pk, self.question_b.pk]}
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue(
            Question.objects.filter(pk=self.question_a.pk, quiz=self.quiz_a).exists()
        )

    def test_question_reorder_rejects_question_from_another_quiz(self):
        response = self.client.post(
            reverse("quiz_app:api_teacher_question_reorder", args=[self.quiz_a.pk]),
            data=json.dumps(
                {
                    "question_ids": [
                        {"question_id": self.question_b.pk, "order": 1}
                    ]
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_school_admin_can_unassign_class_without_teacher_profile(self):
        response = self.client.delete(
            reverse(
                "quiz_app:api_teacher_quiz_assignment_delete",
                args=[self.quiz_a.pk, self.class_a.pk],
            ),
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.quiz_a.classes.filter(pk=self.class_a.pk).exists())

    def test_quiz_assignment_enforces_teacher_ownership_and_school_scope(self):
        extra_class = Class.objects.create(
            name="Extra School A Class",
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        self.client.force_login(self.teacher_user_a)

        foreign_quiz_response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_assignments", args=[self.quiz_a_other_teacher.pk]),
            data=json.dumps({"class_ids": [extra_class.pk]}),
            content_type="application/json",
        )
        unauthorized_class_response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_assignments", args=[self.quiz_a.pk]),
            data=json.dumps({"class_ids": [extra_class.pk]}),
            content_type="application/json",
        )

        self.assertEqual(foreign_quiz_response.status_code, 404)
        self.assertEqual(unauthorized_class_response.status_code, 400)
        self.assertFalse(self.quiz_a.classes.filter(pk=extra_class.pk).exists())

        self.client.force_login(self.admin_a)
        valid_response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_assignments", args=[self.quiz_a_other_teacher.pk]),
            data=json.dumps({"class_ids": [extra_class.pk]}),
            content_type="application/json",
        )
        mixed_school_response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_assignments", args=[self.quiz_a_other_teacher.pk]),
            data=json.dumps({"class_ids": [extra_class.pk, self.class_b.pk]}),
            content_type="application/json",
        )

        self.assertEqual(valid_response.status_code, 200, valid_response.content)
        self.assertEqual(mixed_school_response.status_code, 400)
        self.assertTrue(
            self.quiz_a_other_teacher.classes.filter(pk=extra_class.pk).exists()
        )
        self.assertFalse(
            self.quiz_a_other_teacher.classes.filter(pk=self.class_b.pk).exists()
        )

    def test_school_admin_bulk_unassign_rejects_unassigned_class_ids(self):
        response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_assignment_bulk_delete", args=[self.quiz_a.pk]),
            data=json.dumps({"class_ids": [self.class_a.pk, self.class_b.pk]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue(self.quiz_a.classes.filter(pk=self.class_a.pk).exists())

    def test_set_quiz_classes_is_atomic_and_enforces_quiz_and_school_scope(self):
        self.client.force_login(self.admin_a)
        path = reverse("quiz_app:api_teacher_quiz_assignment_set", args=[self.quiz_a.pk])

        invalid_response = self.client.post(
            path,
            data=json.dumps({"class_ids": [self.class_b.pk]}),
            content_type="application/json",
        )
        self.assertEqual(invalid_response.status_code, 400)
        self.assertTrue(self.quiz_a.classes.filter(pk=self.class_a.pk).exists())

        missing_list_response = self.client.post(
            path,
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(missing_list_response.status_code, 400)
        self.assertTrue(self.quiz_a.classes.filter(pk=self.class_a.pk).exists())

        clear_response = self.client.post(
            path,
            data=json.dumps({"class_ids": []}),
            content_type="application/json",
        )
        self.assertEqual(clear_response.status_code, 200, clear_response.content)
        self.assertFalse(self.quiz_a.classes.filter(pk=self.class_a.pk).exists())

        self.client.force_login(self.teacher_user_a)
        foreign_quiz_response = self.client.post(
            reverse("quiz_app:api_teacher_quiz_assignment_set", args=[self.quiz_a_other_teacher.pk]),
            data=json.dumps({"class_ids": []}),
            content_type="application/json",
        )
        self.assertEqual(foreign_quiz_response.status_code, 404)

    def test_school_admin_assignment_overview_has_school_quizzes_without_profile(self):
        response = self.client.get(reverse("quiz_app:quiz_assignment_overview"))

        self.assertRedirects(
            response, "/app/teacher/quizzes", fetch_redirect_response=False
        )

    def test_legacy_quiz_read_pages_redirect_to_react_screens(self):
        routes = (
            (reverse("quiz_app:quiz_list"), "/app/teacher/quizzes"),
            (reverse("quiz_app:quiz_create"), "/app/teacher/quizzes/new"),
            (
                reverse("quiz_app:quiz_edit", args=[self.quiz_a.pk]),
                f"/app/teacher/quizzes/{self.quiz_a.pk}/edit",
            ),
            (
                reverse("quiz_app:quiz_detail", args=[self.quiz_a.pk]),
                f"/app/teacher/quizzes/{self.quiz_a.pk}",
            ),
            (
                reverse("quiz_app:question_list", args=[self.quiz_a.pk]),
                f"/app/teacher/quizzes/{self.quiz_a.pk}",
            ),
            (
                reverse("quiz_app:question_create", args=[self.quiz_a.pk]),
                f"/app/teacher/quizzes/{self.quiz_a.pk}/questions/new",
            ),
            (
                reverse(
                    "quiz_app:question_edit",
                    args=[self.quiz_a.pk, self.question_a.pk],
                ),
                f"/app/teacher/quizzes/{self.quiz_a.pk}/questions/{self.question_a.pk}/edit",
            ),
            (
                reverse("quiz_app:question_bulk_import", args=[self.quiz_a.pk]),
                f"/app/teacher/quizzes/{self.quiz_a.pk}/questions/import",
            ),
            (
                reverse("quiz_app:quiz_assignment_overview"),
                "/app/teacher/quizzes",
            ),
            (
                reverse("quiz_app:quiz_assignment_list", args=[self.quiz_a.pk]),
                f"/app/teacher/quizzes/{self.quiz_a.pk}/assignments",
            ),
            (
                reverse("quiz_app:quiz_assignment_create", args=[self.quiz_a.pk]),
                f"/app/teacher/quizzes/{self.quiz_a.pk}/assignments",
            ),
            (reverse("quiz_app:quiz_grading_list"), "/app/teacher/grading"),
            (
                reverse("quiz_app:quiz_attempt_grading", args=[self.attempt_a.pk]),
                f"/app/teacher/grading/{self.attempt_a.pk}",
            ),
            (reverse("quiz_app:quiz_results_list"), "/app/teacher/results"),
            (
                reverse("quiz_app:quiz_result_detail", args=[self.attempt_a.pk]),
                f"/app/teacher/results/{self.attempt_a.pk}",
            ),
        )

        for legacy_path, react_path in routes:
            with self.subTest(legacy_path=legacy_path):
                response = self.client.get(legacy_path)
                self.assertRedirects(
                    response, react_path, fetch_redirect_response=False
                )

    def test_student_quiz_pages_redirect_to_react_screens(self):
        self.client.force_login(self.student_user_a)
        routes = (
            (reverse("quiz_app:student_quiz_list"), "/app/student/quizzes"),
            (
                reverse("quiz_app:student_quiz_detail", args=[self.quiz_a.pk]),
                f"/app/student/quizzes/{self.quiz_a.pk}",
            ),
            (reverse("quiz_app:student_quiz_attempts"), "/app/student/attempts"),
            (
                reverse(
                    "quiz_app:student_quiz_take",
                    args=[self.attempt_a.pk],
                ),
                f"/app/student/take/{self.attempt_a.pk}",
            ),
            (
                reverse(
                    "quiz_app:student_quiz_result_detail",
                    args=[self.attempt_a.pk],
                ),
                f"/app/student/attempts/{self.attempt_a.pk}/result",
            ),
        )

        for legacy_path, react_path in routes:
            with self.subTest(legacy_path=legacy_path):
                response = self.client.get(legacy_path)
                self.assertRedirects(
                    response, react_path, fetch_redirect_response=False
                )

    def test_teacher_quiz_apis_provide_scoped_editor_and_detail_data(self):
        options_response = self.client.get(
            reverse("quiz_app:api_teacher_quiz_options"),
        )
        detail_response = self.client.get(
            reverse("quiz_app:api_teacher_quiz_detail", args=[self.quiz_a.pk]),
        )
        assignments_response = self.client.get(
            reverse("quiz_app:api_teacher_quiz_assignments", args=[self.quiz_a.pk]),
        )
        foreign_detail_response = self.client.get(
            reverse("quiz_app:api_teacher_quiz_detail", args=[self.quiz_b.pk]),
        )

        self.assertEqual(options_response.status_code, 200, options_response.content)
        self.assertEqual(detail_response.status_code, 200, detail_response.content)
        self.assertEqual(assignments_response.status_code, 200, assignments_response.content)
        self.assertEqual(foreign_detail_response.status_code, 404)
        self.assertIn("subjects", options_response.json())
        self.assertEqual(
            detail_response.json()["questions"][0]["id"], self.question_a.pk
        )
        self.assertEqual(
            assignments_response.json()["assigned_classes"],
            [{"id": self.class_a.pk, "name": self.class_a.name}],
        )

    def test_teacher_grading_and_result_apis_are_school_scoped(self):
        grading_response = self.client.get(
            reverse("quiz_app:api_teacher_grading_detail", args=[self.attempt_a.pk]),
        )
        result_response = self.client.get(
            reverse("quiz_app:api_teacher_result_detail", args=[self.attempt_a.pk]),
        )
        foreign_grading_response = self.client.get(
            reverse("quiz_app:api_teacher_grading_detail", args=[self.attempt_b.pk]),
        )

        self.assertEqual(grading_response.status_code, 200, grading_response.content)
        self.assertEqual(result_response.status_code, 200, result_response.content)
        self.assertEqual(foreign_grading_response.status_code, 404)
        self.assertEqual(grading_response.json()["responses"][0]["id"], self.response_a.pk)
        self.assertEqual(result_response.json()["responses"][0]["id"], self.response_a.pk)

    def test_teacher_legacy_quiz_route_redirects_to_react(self):
        self.client.force_login(self.teacher_user_a)

        response = self.client.get(
            reverse("quiz_app:quiz_detail", args=[self.quiz_a_other_teacher.pk])
        )

        self.assertRedirects(
            response,
            f"/app/teacher/quizzes/{self.quiz_a_other_teacher.pk}",
            fetch_redirect_response=False,
        )

    def test_legacy_dashboard_urls_redirect_to_react_routes(self):
        admin_response = self.client.get(reverse("quiz_app:admin_dashboard"))
        teacher_response = self.client.get(reverse("quiz_app:teacher_dashboard"))
        self.client.force_login(self.student_user_a)
        student_response = self.client.get(reverse("quiz_app:student_dashboard"))

        self.assertRedirects(
            admin_response, "/app/admin/dashboard", fetch_redirect_response=False
        )
        self.assertRedirects(
            teacher_response, "/app/teacher/dashboard", fetch_redirect_response=False
        )
        self.assertRedirects(
            student_response, "/app/student/dashboard", fetch_redirect_response=False
        )
        superadmin = User.objects.create_user(
            username="dashboard-superadmin",
            email="dashboard-superadmin@example.test",
            role="superadmin",
            full_name="Dashboard Superadmin",
        )
        self.client.force_login(superadmin)
        superadmin_response = self.client.get(reverse("quiz_app:dashboard"))
        self.assertRedirects(
            superadmin_response,
            "/app/superadmin/dashboard",
            fetch_redirect_response=False,
        )

    def test_legacy_admin_management_pages_redirect_to_react_routes(self):
        routes = (
            ("enrollment_list", (), "/app/admin/enrollments"),
            ("academic_year_list", (), "/app/admin/academic-years"),
            ("term_list", (), "/app/admin/terms"),
            ("form_list", (), "/app/admin/forms"),
            ("learning_area_list", (), "/app/admin/learning-areas"),
            ("department_list", (), "/app/admin/departments"),
            ("subject_list", (), "/app/admin/subjects"),
            ("school_detail", (), "/app/admin/school"),
            ("assignment_delete", (1,), "/app/admin/assignments"),
            ("class_detail", (self.class_a.pk,), f"/app/admin/classes/{self.class_a.pk}"),
        )

        for route_name, args, react_path in routes:
            with self.subTest(route_name=route_name):
                response = self.client.get(
                    reverse(f"quiz_app:{route_name}", args=args)
                )
                self.assertRedirects(
                    response, react_path, fetch_redirect_response=False
                )

        head_response = self.client.head(reverse("quiz_app:enrollment_list"))
        self.assertEqual(head_response.status_code, 302)
        self.assertEqual(head_response.url, "/app/admin/enrollments")

    def test_legacy_superadmin_pages_redirect_to_react_routes(self):
        superadmin = User.objects.create_user(
            username="legacy-superadmin-pages",
            email="legacy-superadmin-pages@example.test",
            role="superadmin",
            full_name="Legacy Superadmin Pages",
        )
        self.client.force_login(superadmin)
        routes = (
            ("superadmin_school_list", (), "/app/superadmin/schools"),
            ("superadmin_school_create", (), "/app/superadmin/schools/new"),
            (
                "superadmin_school_detail",
                (self.school_a.pk,),
                f"/app/superadmin/schools/{self.school_a.pk}",
            ),
            ("superadmin_admin_list", (), "/app/superadmin/admins"),
            ("superadmin_admin_create", (), "/app/superadmin/admins/new"),
        )

        for route_name, args, react_path in routes:
            with self.subTest(route_name=route_name):
                response = self.client.get(
                    reverse(f"quiz_app:{route_name}", args=args)
                )
                self.assertRedirects(
                    response, react_path, fetch_redirect_response=False
                )

    def test_student_bulk_delete_rejects_mixed_school_ids_atomically(self):
        response = self.client.post(
            reverse("quiz_app:student_bulk_delete"),
            data=json.dumps({"student_ids": [self.student_a.pk, self.student_b.pk]}),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Student.objects.filter(pk=self.student_a.pk).exists())
        self.assertTrue(Student.objects.filter(pk=self.student_b.pk).exists())

    def test_teacher_bulk_delete_rejects_mixed_school_ids_atomically(self):
        response = self.client.post(
            reverse("quiz_app:teacher_bulk_delete"),
            data=json.dumps({"teacher_ids": [self.teacher_a.pk, self.teacher_b.pk]}),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Teacher.objects.filter(pk=self.teacher_a.pk).exists())
        self.assertTrue(Teacher.objects.filter(pk=self.teacher_b.pk).exists())

    def test_user_bulk_password_reset_rejects_mixed_school_ids_atomically(self):
        old_password_hash = self.teacher_user_a.password

        response = self.client.post(
            reverse("quiz_app:user_bulk_password_reset"),
            data=json.dumps(
                {"user_ids": [self.teacher_user_a.pk, self.user_b.pk]}
            ),
            content_type="application/json",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )

        self.teacher_user_a.refresh_from_db()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.teacher_user_a.password, old_password_hash)

    def test_superadmin_bulk_writes_are_limited_to_explicit_target_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-bulk-target",
            email="superadmin-bulk@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin Bulk Test",
        )
        self.client.force_login(superadmin)

        payloads = [
            (
                "student_bulk_delete",
                {"student_ids": [self.student_a.pk, self.student_b.pk]},
            ),
            (
                "teacher_bulk_delete",
                {"teacher_ids": [self.teacher_a.pk, self.teacher_b.pk]},
            ),
            (
                "user_bulk_password_reset",
                {"user_ids": [self.teacher_user_a.pk, self.user_b.pk]},
            ),
        ]
        for route_name, payload in payloads:
            with self.subTest(route_name=route_name):
                response = self.client.post(
                    reverse(f"quiz_app:{route_name}"),
                    data=json.dumps(payload),
                    content_type="application/json",
                    HTTP_X_REQUESTED_WITH="XMLHttpRequest",
                )
                self.assertEqual(response.status_code, 400)

                payload["school_id"] = self.school_a.pk
                response = self.client.post(
                    reverse(f"quiz_app:{route_name}"),
                    data=json.dumps(payload),
                    content_type="application/json",
                    HTTP_X_REQUESTED_WITH="XMLHttpRequest",
                )
                self.assertEqual(response.status_code, 400)

        self.assertTrue(Student.objects.filter(pk=self.student_a.pk).exists())
        self.assertTrue(Teacher.objects.filter(pk=self.teacher_a.pk).exists())

    def test_superadmin_relationship_writes_follow_the_explicit_parent_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-relationships",
            email="superadmin-relationships@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin Relationship Test",
        )
        self.client.force_login(superadmin)

        invalid_enrollment = self.client.post(
            reverse("quiz_app:enrollment_create"),
            data={
                "student": self.student_b.pk,
                "assigned_class": self.class_a.pk,
            },
        )
        self.assertEqual(invalid_enrollment.status_code, 400)

        new_student = Student.objects.create(
            admission_number="A-0002",
            full_name="New A Student",
            date_of_birth="2010-01-01",
            gender="F",
            parent_contact="333",
            admission_date="2026-01-01",
            school=self.school_a,
        )
        valid_enrollment = self.client.post(
            reverse("quiz_app:enrollment_create"),
            data={
                "student": new_student.pk,
                "assigned_class": self.class_a.pk,
            },
        )
        self.assertEqual(valid_enrollment.status_code, 200)
        self.assertTrue(
            StudentClass.objects.filter(
                student=new_student,
                assigned_class=self.class_a,
                school=self.school_a,
                is_active=True,
            ).exists()
        )
        mixed_bulk_enrollment = self.client.post(
            reverse("quiz_app:enrollment_bulk_create"),
            data=json.dumps({
                "student_ids": [new_student.pk, self.student_b.pk],
                "class_id": self.class_a.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(mixed_bulk_enrollment.status_code, 400)

        ClassSubject.objects.create(
            class_name=self.class_a,
            subject=self.subject_a,
            academic_year=self.academic_year_a,
            school=self.school_a,
        )
        mixed_bulk_assignment = self.client.post(
            reverse("quiz_app:assignment_bulk_create"),
            data=json.dumps({
                "teacher_id": self.teacher_a.pk,
                "subject_ids": [self.subject_a.pk],
                "class_ids": [self.class_a.pk, self.class_b.pk],
                "academic_year_id": self.academic_year_a.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(mixed_bulk_assignment.status_code, 400)

        invalid_assignment = self.client.post(
            reverse("quiz_app:assignment_create"),
            data={
                "teacher": self.teacher_b.pk,
                "subject": self.subject_a.pk,
                "class_assigned": self.class_a.pk,
                "academic_year": self.academic_year_a.pk,
            },
        )
        self.assertEqual(invalid_assignment.status_code, 400)

        valid_assignment = self.client.post(
            reverse("quiz_app:assignment_create"),
            data={
                "teacher": self.teacher_a.pk,
                "subject": self.subject_a.pk,
                "class_assigned": self.class_a.pk,
                "academic_year": self.academic_year_a.pk,
            },
        )
        self.assertEqual(valid_assignment.status_code, 200)

    def test_school_admin_cannot_create_superadmin_or_schoolless_users(self):
        response = self.client.post(
            reverse("quiz_app:user_create"),
            data={
                "username": "unscoped-teacher",
                "email": "unscoped-teacher@example.test",
                "full_name": "Unscoped Teacher",
                "role": "teacher",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            User.objects.get(username="unscoped-teacher").school,
            self.school_a,
        )

        response = self.client.post(
            reverse("quiz_app:user_create"),
            data={
                "username": "unauthorized-superadmin",
                "email": "unauthorized-superadmin@example.test",
                "full_name": "Unauthorized Superadmin",
                "role": "superadmin",
            },
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            User.objects.filter(username="unauthorized-superadmin").exists()
        )

    def test_superadmin_admin_create_uses_password_setup_link(self):
        superadmin = User.objects.create_user(
            username="superadmin-create-admin",
            email="superadmin-create-admin@example.test",
            role="superadmin",
            full_name="Superadmin Create Admin",
        )
        self.client.force_login(superadmin)
        url = reverse("quiz_app:superadmin_admin_create")
        payload = {
            "username": "new-school-admin",
            "email": "new-school-admin@example.test",
            "full_name": "New School Admin",
            "school": self.school_a.pk,
        }

        created = self.client.post(url, data=payload)
        self.assertEqual(created.status_code, 200, created.content)
        created_admin = User.objects.get(username="new-school-admin")
        self.assertEqual(created_admin.role, "admin")
        self.assertEqual(created_admin.school, self.school_a)
        self.assertTrue(created_admin.is_active)
        self.assertTrue(created_admin.has_usable_password())
        self.assertFalse(created_admin.check_password("0000"))

    def test_superadmin_student_create_requires_and_uses_target_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-target-school",
            email="superadmin@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin",
        )
        self.client.force_login(superadmin)

        form_response = self.client.get(reverse("quiz_app:student_create"))
        self.assertEqual(form_response.status_code, 302)
        self.assertTrue(form_response.url.startswith("/app/"))

        payload = {
            "full_name": "Created by Superadmin",
            "date_of_birth": "2010-01-01",
            "gender": "F",
            "parent_contact": "333",
            "admission_date": "2026-01-01",
        }
        missing_target_response = self.client.post(
            reverse("quiz_app:student_create"), data=payload
        )
        self.assertEqual(missing_target_response.status_code, 400)
        self.assertFalse(
            Student.objects.filter(full_name="Created by Superadmin").exists()
        )

        payload["school_id"] = "999999"
        invalid_target_response = self.client.post(
            reverse("quiz_app:student_create"), data=payload
        )
        self.assertEqual(invalid_target_response.status_code, 400)

        payload["school_id"] = str(self.school_a.pk)
        created_response = self.client.post(
            reverse("quiz_app:student_create"), data=payload
        )
        self.assertEqual(created_response.status_code, 200)
        created_student = Student.objects.get(full_name="Created by Superadmin")
        self.assertEqual(created_student.school, self.school_a)

        self.school_b.is_active = False
        self.school_b.save(update_fields=["is_active"])
        payload["school_id"] = str(self.school_b.pk)
        inactive_target_response = self.client.post(
            reverse("quiz_app:student_create"), data=payload
        )
        self.assertEqual(inactive_target_response.status_code, 400)
        self.assertFalse(
            Student.objects.filter(
                full_name="Created by Superadmin",
                school=self.school_b,
            ).exists()
        )

    def test_superadmin_legacy_create_routes_redirect_to_react(self):
        superadmin = User.objects.create_user(
            username="superadmin-target-forms",
            email="superadmin-forms@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin Target Forms",
        )
        self.client.force_login(superadmin)

        routes = [
            "student_create",
            "teacher_create",
            "class_create",
            "subject_create",
            "academic_year_create",
            "form_create",
            "learning_area_create",
            "department_create",
            "student_bulk_import",
            "teacher_bulk_import",
        ]
        for route_name in routes:
            with self.subTest(route_name=route_name):
                response = self.client.get(reverse(f"quiz_app:{route_name}"))
                self.assertEqual(response.status_code, 302)
                self.assertTrue(response.url.startswith("/app/"))

    def test_superadmin_teacher_create_requires_and_uses_target_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-teacher-target",
            email="superadmin-teacher@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin Teacher Test",
        )
        self.client.force_login(superadmin)

        response = self.client.post(
            reverse("quiz_app:teacher_create"),
            data={
                "full_name": "Created by Superadmin",
                "contact_number": "444",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            Teacher.objects.filter(full_name="Created by Superadmin").exists()
        )

        response = self.client.post(
            reverse("quiz_app:teacher_create"),
            data={
                "full_name": "Created by Superadmin",
                "contact_number": "444",
                "school_id": self.school_a.pk,
            },
        )
        self.assertEqual(response.status_code, 200)
        created_teacher = Teacher.objects.get(full_name="Created by Superadmin")
        self.assertEqual(created_teacher.school, self.school_a)

    def test_superadmin_imports_require_an_explicit_target_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-import-target",
            email="superadmin-import@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin Import Test",
        )
        self.client.force_login(superadmin)

        def student_upload():
            return SimpleUploadedFile(
                "students.csv",
                b"full_name,gender,date_of_birth,parent_contact,admission_date\n"
                b"Imported Student,F,2012-01-03,555,2026-01-01\n",
                content_type="text/csv",
            )
        response = self.client.post(
            reverse("quiz_app:student_bulk_import"),
            {"csv_file": student_upload()},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Student.objects.filter(full_name="Imported Student").exists())

        response = self.client.post(
            reverse("quiz_app:student_bulk_import"),
            {"csv_file": student_upload(), "school_id": self.school_a.pk},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            Student.objects.get(full_name="Imported Student").school,
            self.school_a,
        )

        def teacher_upload():
            return SimpleUploadedFile(
                "teachers.csv",
                b"full_name,contact_number\nImported Teacher,555\n",
                content_type="text/csv",
            )
        response = self.client.post(
            reverse("quiz_app:teacher_bulk_import"),
            {"csv_file": teacher_upload()},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Teacher.objects.filter(full_name="Imported Teacher").exists())

        response = self.client.post(
            reverse("quiz_app:teacher_bulk_import"),
            {"csv_file": teacher_upload(), "school_id": self.school_a.pk},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            Teacher.objects.get(full_name="Imported Teacher").school,
            self.school_a,
        )

    def test_student_import_requires_only_name_and_gender(self):
        response = self.client.post(
            "/api/v1/students/import/",
            {
                "file": SimpleUploadedFile(
                    "students.csv",
                    b"full_name,gender\nImported With Optional Fields,F\n",
                    content_type="text/csv",
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertTrue(payload["complete"])
        self.assertEqual(payload["imported"], 1)
        student = Student.objects.get(full_name="Imported With Optional Fields")
        self.assertEqual(student.gender, "F")
        self.assertIsNone(student.date_of_birth)
        self.assertEqual(student.parent_contact, "")
        self.assertEqual(student.admission_date, timezone.localdate())
        self.assertTrue(student.admission_number)

    def test_student_import_rejects_mixed_valid_and_invalid_rows_without_writes(self):
        response = self.client.post(
            reverse("quiz_app:student_bulk_import"),
            {
                "csv_file": SimpleUploadedFile(
                    "students.csv",
                    (
                        b"full_name,gender,date_of_birth,parent_contact,admission_date,admission_number\n"
                        b"Valid Import Student,F,2012-01-03,555,2026-01-01,A-NEW1\n"
                        b"Conflicting Admission,F,2012-01-03,555,2026-01-01,B-0001\n"
                        b"Duplicate Admission,F,2012-01-03,555,2026-01-01,A-NEW1\n"
                    ),
                    content_type="text/csv",
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertFalse(payload["complete"])
        self.assertFalse(payload["partial_success"])
        self.assertEqual(payload["imported"], 0)
        self.assertTrue(any("Row 3" in error for error in payload["errors"]))
        self.assertTrue(any("Row 4" in error for error in payload["errors"]))
        self.assertFalse(
            Student.objects.filter(
                full_name="Valid Import Student",
                school=self.school_a,
            ).exists()
        )

    def test_student_import_accepts_utf8_bom_in_csv_header(self):
        response = self.client.post(
            reverse("quiz_app:student_bulk_import"),
            {
                "csv_file": SimpleUploadedFile(
                    "students.csv",
                    (
                        b"\xef\xbb\xbffull_name,gender,date_of_birth,parent_contact,admission_date\n"
                        b"BOM Student,F,2012-01-03,555,2026-01-01\n"
                    ),
                    content_type="text/csv",
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["imported"], 1)
        self.assertTrue(
            Student.objects.filter(full_name="BOM Student", school=self.school_a).exists()
        )

    def test_imports_reject_duplicate_column_names(self):
        student_response = self.client.post(
            reverse("quiz_app:student_bulk_import"),
            {
                "csv_file": SimpleUploadedFile(
                    "students.csv",
                    (
                        b"full_name,full_name,gender,date_of_birth,parent_contact,admission_date\n"
                        b"Duplicate Header,Overwritten,F,2012-01-03,555,2026-01-01\n"
                    ),
                    content_type="text/csv",
                )
            },
        )
        teacher_response = self.client.post(
            reverse("quiz_app:teacher_bulk_import"),
            {
                "csv_file": SimpleUploadedFile(
                    "teachers.csv",
                    b"full_name,contact_number,contact_number\nDuplicate,555,556\n",
                    content_type="text/csv",
                )
            },
        )

        self.assertEqual(student_response.status_code, 400)
        self.assertIn("duplicate column names", student_response.json()["error"])
        self.assertEqual(teacher_response.status_code, 400)
        self.assertIn("duplicate column names", teacher_response.json()["error"])
        self.assertFalse(Student.objects.filter(full_name="Overwritten").exists())
        self.assertFalse(Teacher.objects.filter(full_name="Duplicate").exists())

    def test_teacher_import_rejects_mixed_valid_and_invalid_rows_without_writes(self):
        response = self.client.post(
            reverse("quiz_app:teacher_bulk_import"),
            {
                "csv_file": SimpleUploadedFile(
                    "teachers.csv",
                    (
                        b"full_name,contact_number,gender\n"
                        b"Valid Import Teacher,555-0101,F\n"
                        b"Invalid Import Teacher,,M\n"
                    ),
                    content_type="text/csv",
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertFalse(payload["complete"])
        self.assertFalse(payload["partial_success"])
        self.assertEqual(payload["imported"], 0)
        self.assertTrue(any("Row 3" in error for error in payload["errors"]))
        self.assertFalse(
            Teacher.objects.filter(
                full_name="Valid Import Teacher",
                school=self.school_a,
            ).exists()
        )

    def test_teacher_import_rejects_ambiguous_department_name(self):
        Department.objects.create(
            name=self.department_b.name,
            code="DEP-A-1",
            school=self.school_a,
        )
        Department.objects.create(
            name=self.department_b.name,
            code="DEP-A-2",
            school=self.school_a,
        )

        response = self.client.post(
            reverse("quiz_app:teacher_bulk_import"),
            {
                "csv_file": SimpleUploadedFile(
                    "teachers.csv",
                    (
                        b"full_name,contact_number,department\n"
                        b"Ambiguous Department Teacher,555-0102,Department B\n"
                    ),
                    content_type="text/csv",
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["imported"], 0)
        self.assertTrue(
            any("ambiguous" in error.lower() for error in response.json()["errors"])
        )
        self.assertFalse(
            Teacher.objects.filter(
                full_name="Ambiguous Department Teacher",
                school=self.school_a,
            ).exists()
        )

    def test_student_import_rejects_class_from_a_different_academic_year(self):
        self.academic_year_a.is_current = True
        self.academic_year_a.save(update_fields=["is_current"])
        historical_year = AcademicYear.objects.create(
            name="2025",
            start_date="2025-01-01",
            end_date="2025-12-31",
            school=self.school_a,
        )
        historical_class = Class.objects.create(
            name="Historical Intake",
            academic_year=historical_year,
            school=self.school_a,
        )
        upload = SimpleUploadedFile(
            "students.csv",
            (
                b"full_name,gender,date_of_birth,parent_contact,admission_date\n"
                b"Imported Historical Student,F,2012-01-03,555,2026-01-01\n"
            ),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("quiz_app:student_bulk_import"),
            {"csv_file": upload, "assign_class": historical_class.pk},
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            Student.objects.filter(
                full_name="Imported Historical Student",
                school=self.school_a,
            ).exists()
        )

    def test_student_import_cannot_bypass_class_capacity(self):
        self.academic_year_a.is_current = True
        self.academic_year_a.save(update_fields=["is_current"])
        self.class_a.maximum_students = 1
        self.class_a.save(update_fields=["maximum_students"])
        upload = SimpleUploadedFile(
            "students.csv",
            (
                b"full_name,gender,date_of_birth,parent_contact,admission_date\n"
                b"Imported Full Class Student,F,2012-01-03,555,2026-01-01\n"
            ),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("quiz_app:student_bulk_import"),
            {"csv_file": upload, "assign_class": self.class_a.pk},
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["imported"], 0)
        self.assertEqual(response.json()["assigned_to_class"], 0)
        self.assertFalse(
            Student.objects.filter(
                full_name="Imported Full Class Student",
                school=self.school_a,
            ).exists()
        )

    def test_student_and_teacher_import_previews_return_sample_rows_without_writes(self):
        student_response = self.client.post(
            reverse("quiz_app:student_bulk_import_preview_headers"),
            {
                "csv_file": SimpleUploadedFile(
                    "students.csv",
                    b"name,sex,date_of_birth,parent_contact,admission_date\n"
                    b"Preview Student,F,2012-01-03,555,2026-01-01\n",
                    content_type="text/csv",
                )
            },
        )
        teacher_response = self.client.post(
            reverse("quiz_app:teacher_bulk_import_preview"),
            {
                "csv_file": SimpleUploadedFile(
                    "teachers.csv",
                    b"full_name,contact_number,gender\n"
                    b"Preview Teacher,555-0101,F\n",
                    content_type="text/csv",
                )
            },
        )

        self.assertEqual(student_response.status_code, 200)
        self.assertEqual(
            student_response.json()["preview_rows"][0]["name"],
            "Preview Student",
        )
        self.assertEqual(teacher_response.status_code, 200)
        self.assertEqual(
            teacher_response.json()["preview_rows"][0]["full_name"],
            "Preview Teacher",
        )
        self.assertFalse(Student.objects.filter(full_name="Preview Student").exists())
        self.assertFalse(Teacher.objects.filter(full_name="Preview Teacher").exists())

    def test_teacher_import_supports_bounded_xlsx_and_downloadable_templates(self):
        from openpyxl import Workbook, load_workbook

        workbook = Workbook()
        worksheet = workbook.active
        worksheet.append(["full_name", "contact_number", "gender", "email", "department"])
        worksheet.append(["XLSX Teacher", "555-0101", "F", "", ""])
        output = BytesIO()
        workbook.save(output)
        workbook.close()

        response = self.client.post(
            reverse("quiz_app:teacher_bulk_import"),
            {
                "csv_file": SimpleUploadedFile(
                    "teachers.xlsx",
                    output.getvalue(),
                    content_type=(
                        "application/vnd.openxmlformats-officedocument."
                        "spreadsheetml.sheet"
                    ),
                )
            },
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["imported"], 1)
        self.assertTrue(
            Teacher.objects.filter(
                full_name="XLSX Teacher",
                school=self.school_a,
            ).exists()
        )

        csv_template = self.client.get(
            reverse("quiz_app:teacher_bulk_import_template", args=["csv"])
        )
        self.assertEqual(csv_template.status_code, 200)
        self.assertIn(b"full_name,contact_number", csv_template.content)

        xlsx_template = self.client.get(
            reverse("quiz_app:teacher_bulk_import_template", args=["xlsx"])
        )
        self.assertEqual(xlsx_template.status_code, 200)
        template_workbook = load_workbook(BytesIO(xlsx_template.content), read_only=True)
        self.assertEqual(
            next(template_workbook.active.iter_rows(values_only=True))[0],
            "full_name",
        )
        template_workbook.close()

    def test_student_import_templates_are_downloadable_as_csv_and_xlsx(self):
        csv_response = self.client.get(
            reverse("quiz_app:student_bulk_import_template")
        )
        xlsx_response = self.client.get(
            reverse("quiz_app:student_bulk_import_template_xlsx")
        )

        self.assertEqual(csv_response.status_code, 200)
        self.assertEqual(xlsx_response.status_code, 200)
        import csv

        csv_rows = list(csv.reader(csv_response.content.decode("utf-8-sig").splitlines()))
        from openpyxl import load_workbook

        workbook = load_workbook(BytesIO(xlsx_response.content), read_only=True)
        xlsx_rows = [
            [value or "" for value in row]
            for row in workbook.active.iter_rows(values_only=True)
        ]
        workbook.close()
        self.assertEqual(csv_rows, xlsx_rows)
        self.assertEqual(csv_rows[3][3:6], ["", "", ""])

        import_response = self.client.post(
            "/api/v1/students/import/",
            {
                "file": SimpleUploadedFile(
                    "student_template.xlsx",
                    xlsx_response.content,
                    content_type=(
                        "application/vnd.openxmlformats-officedocument."
                        "spreadsheetml.sheet"
                    ),
                )
            },
        )
        self.assertEqual(import_response.status_code, 200, import_response.content)
        self.assertEqual(import_response.json()["imported"], 3)
        optional_fields_student = Student.objects.get(full_name="Michael Johnson")
        self.assertIsNone(optional_fields_student.date_of_birth)
        self.assertEqual(optional_fields_student.parent_contact, "")
        self.assertEqual(optional_fields_student.admission_date, timezone.localdate())
        self.assertTrue(optional_fields_student.admission_number)

    def test_question_import_rejects_row_limit_overflow_without_writes(self):
        question_count = self.quiz_a.questions.count()
        with patch("quiz_app.services.assessment_management.MAX_IMPORT_ROWS", 1):
            response = self.client.post(
                reverse("quiz_app:api_teacher_question_import", args=[self.quiz_a.pk]),
                {
                    "import_file": SimpleUploadedFile(
                        "questions.csv",
                        b"question_text,question_type\n"
                        b"First question,essay\n"
                        b"Second question,essay\n",
                        content_type="text/csv",
                    )
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "VALIDATION_ERROR")
        self.assertEqual(self.quiz_a.questions.count(), question_count)

    def test_student_and_teacher_imports_reject_row_limit_overflow(self):
        with (
            patch("quiz_app.views.student_management.MAX_IMPORT_ROWS", 1),
            patch("quiz_app.views.teacher_management.MAX_IMPORT_ROWS", 1),
        ):
            student_response = self.client.post(
                reverse("quiz_app:student_bulk_import"),
                {
                    "csv_file": SimpleUploadedFile(
                        "students.csv",
                        b"full_name,gender\nFirst Student,F\nSecond Student,M\n",
                    )
                },
            )
            teacher_response = self.client.post(
                reverse("quiz_app:teacher_bulk_import"),
                {
                    "csv_file": SimpleUploadedFile(
                        "teachers.csv",
                        b"full_name,contact_number\nFirst Teacher,111\nSecond Teacher,222\n",
                    )
                },
            )

        self.assertEqual(student_response.status_code, 413)
        self.assertEqual(teacher_response.status_code, 413)
        self.assertFalse(Student.objects.filter(full_name="First Student").exists())
        self.assertFalse(Teacher.objects.filter(full_name="First Teacher").exists())

    def test_superadmin_class_subject_and_academic_creates_require_target_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-school-records",
            email="superadmin-records@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin School Records",
        )
        self.client.force_login(superadmin)
        form_a = Form.objects.create(
            form_number=1,
            name="A Form",
            school=self.school_a,
        )
        learning_area_a = LearningArea.objects.create(
            code="LA-A",
            name="A Learning Area",
            school=self.school_a,
        )

        requests = [
            (
                "class_create",
                {
                    "name": "Target Class",
                    "academic_year": self.academic_year_a.pk,
                    "form": form_a.pk,
                    "learning_area": learning_area_a.pk,
                },
                Class,
                "name",
                "Target Class",
            ),
            (
                "subject_create",
                {
                    "subject_name": "Target Subject",
                    "learning_area": learning_area_a.pk,
                },
                Subject,
                "subject_name",
                "Target Subject",
            ),
            (
                "academic_year_create",
                {
                    "name": "2027",
                    "start_date": "2027-01-01",
                    "end_date": "2027-12-31",
                },
                AcademicYear,
                "name",
                "2027",
            ),
            (
                "form_create",
                {"form_number": "9", "name": "Target Form"},
                Form,
                "name",
                "Target Form",
            ),
            (
                "learning_area_create",
                {"code": "LA-B", "name": "Target Learning Area"},
                LearningArea,
                "name",
                "Target Learning Area",
            ),
            (
                "department_create",
                {"code": "DEP-A", "name": "Target Department"},
                Department,
                "name",
                "Target Department",
            ),
        ]

        for route_name, payload, model, field_name, expected_value in requests:
            with self.subTest(route_name=route_name):
                response = self.client.post(reverse(f"quiz_app:{route_name}"), data=payload)
                self.assertEqual(response.status_code, 400)
                self.assertFalse(model.objects.filter(**{field_name: expected_value}).exists())

                payload["school_id"] = self.school_a.pk
                response = self.client.post(
                    reverse(f"quiz_app:{route_name}"), data=payload
                )
                self.assertEqual(response.status_code, 200, response.content)
                self.assertTrue(
                    model.objects.filter(
                        **{field_name: expected_value, "school": self.school_a}
                    ).exists()
                )

    def test_superadmin_term_creation_uses_selected_academic_year_school(self):
        superadmin = User.objects.create_user(
            username="superadmin-term-target",
            email="superadmin-term@example.test",
            password=None,
            role="superadmin",
            full_name="Superadmin Term Target",
        )
        self.client.force_login(superadmin)

        form_response = self.client.get(reverse("quiz_app:term_create"))
        self.assertEqual(form_response.status_code, 302)
        self.assertTrue(form_response.url.startswith("/app/"))

        payload = {
            "academic_year": self.academic_year_a.pk,
            "term_number": "2",
            "start_date": "2026-05-01",
            "end_date": "2026-08-31",
        }
        missing_year = self.client.post(
            reverse("quiz_app:term_create"),
            data={key: value for key, value in payload.items() if key != "academic_year"},
        )
        self.assertEqual(missing_year.status_code, 400)

        response = self.client.post(
            reverse("quiz_app:term_create"),
            data=payload,
        )
        self.assertEqual(response.status_code, 200, response.content)
        term = Term.objects.get(
            academic_year=self.academic_year_a,
            term_number=2,
        )
        self.assertEqual(term.school, self.school_a)

        self.school_b.is_active = False
        self.school_b.save(update_fields=["is_active"])
        payload["academic_year"] = self.academic_year_b.pk
        response = self.client.post(
            reverse("quiz_app:term_create"),
            data=payload,
        )
        self.assertEqual(response.status_code, 400)

    def test_class_subject_add_rejects_subject_from_another_school(self):
        response = self.client.post(
            reverse("quiz_app:class_subject_add", args=[self.class_a.pk]),
            data=json.dumps({"subject_id": self.subject_b.pk}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            ClassSubject.objects.filter(
                class_name=self.class_a, subject=self.subject_b
            ).exists()
        )

    def test_student_cannot_open_or_start_quiz_without_class_assignment(self):
        self.client.force_login(self.student_user_a)

        detail_response = self.client.get(
            reverse("quiz_app:student_quiz_detail", args=[self.quiz_a_other_teacher.pk])
        )
        start_response = self.client.get(
            reverse("quiz_app:student_quiz_start", args=[self.quiz_a_other_teacher.pk])
        )

        self.assertEqual(detail_response.status_code, 302)
        self.assertEqual(start_response.status_code, 302)
        self.assertFalse(
            QuizAttempt.objects.filter(
                quiz=self.quiz_a_other_teacher,
                student=self.student_a,
                is_submitted=False,
            ).exists()
        )

    def test_student_cannot_start_quiz_outside_its_availability_window(self):
        self.client.force_login(self.student_user_a)
        initial_attempt_count = QuizAttempt.objects.filter(
            quiz=self.quiz_a, student=self.student_a
        ).count()

        self.quiz_a.available_from = timezone.now() + timedelta(days=1)
        self.quiz_a.available_until = None
        self.quiz_a.save(update_fields=["available_from", "available_until"])
        early_response = self.client.get(
            reverse("quiz_app:student_quiz_start", args=[self.quiz_a.pk])
        )

        self.quiz_a.available_from = None
        self.quiz_a.available_until = timezone.now() - timedelta(days=1)
        self.quiz_a.save(update_fields=["available_from", "available_until"])
        late_response = self.client.get(
            reverse("quiz_app:student_quiz_start", args=[self.quiz_a.pk])
        )

        self.assertEqual(early_response.status_code, 302)
        self.assertEqual(late_response.status_code, 302)
        self.assertEqual(
            QuizAttempt.objects.filter(
                quiz=self.quiz_a, student=self.student_a
            ).count(),
            initial_attempt_count,
        )

    def test_submitted_attempts_enforce_the_quiz_attempt_limit(self):
        self.quiz_a.max_attempts = 1
        self.quiz_a.save(update_fields=["max_attempts"])

        can_attempt, message = self.quiz_a.can_student_attempt(self.student_a)

        self.assertFalse(can_attempt)
        self.assertIn("Maximum attempts", message)

    def test_start_endpoint_enforces_the_attempt_limit(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.max_attempts = 1
        self.quiz_a.save(update_fields=["max_attempts"])
        initial_count = QuizAttempt.objects.filter(
            quiz=self.quiz_a,
            student=self.student_a,
        ).count()

        response = self.client.get(
            reverse("quiz_app:student_quiz_start", args=[self.quiz_a.pk])
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            QuizAttempt.objects.filter(
                quiz=self.quiz_a,
                student=self.student_a,
            ).count(),
            initial_count,
        )

    def test_expired_quiz_attempt_is_submitted_and_cannot_save_answers(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.time_limit = 1
        self.quiz_a.save(update_fields=["time_limit"])
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=2,
        )
        QuizAttempt.objects.filter(pk=attempt.pk).update(
            started_at=timezone.now() - timedelta(minutes=2)
        )

        response = self.client.post(
            reverse("quiz_app:student_quiz_save", args=[attempt.pk]),
            {"question_id": self.question_a.pk, "text_answer": "Late response"},
        )

        attempt.refresh_from_db()
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.json()["submitted"])
        self.assertTrue(attempt.is_submitted)
        self.assertFalse(attempt.responses.exists())

    def test_student_answer_save_persists_response_without_submitting(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.max_attempts = 2
        self.quiz_a.save(update_fields=["max_attempts"])

        start_response = self.client.post(
            reverse("quiz_app:api_student_quiz_start", args=[self.quiz_a.pk]),
            data=json.dumps({}),
            content_type="application/json",
        )
        attempt = QuizAttempt.objects.get(
            pk=start_response.json()["attempt_id"]
        )
        save_response = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": self.question_a.pk,
                "text_answer": "Saved draft response",
            }),
            content_type="application/json",
        )

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(save_response.status_code, 200, save_response.content)
        self.assertTrue(save_response.json()["success"])
        attempt.refresh_from_db()
        self.assertFalse(attempt.is_submitted)
        self.assertEqual(
            attempt.responses.get(question=self.question_a).text_answer,
            "Saved draft response",
        )

    def test_refresh_resume_and_two_tabs_reuse_attempt_and_answer(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.max_attempts = 3
        self.quiz_a.save(update_fields=["max_attempts"])

        start_response = self.client.post(
            reverse("quiz_app:api_student_quiz_start", args=[self.quiz_a.pk]),
            data=json.dumps({}),
            content_type="application/json",
        )
        attempt = QuizAttempt.objects.get(pk=start_response.json()["attempt_id"])
        first_tab = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        refresh = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        resume = self.client.post(
            reverse("quiz_app:api_student_quiz_start", args=[self.quiz_a.pk]),
            data=json.dumps({}),
            content_type="application/json",
        )
        first_save = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": self.question_a.pk,
                "text_answer": "First tab answer",
            }),
            content_type="application/json",
        )
        second_tab_save = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": self.question_a.pk,
                "text_answer": "Second tab answer",
            }),
            content_type="application/json",
        )

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(first_tab.status_code, 200)
        self.assertEqual(refresh.status_code, 200)
        self.assertEqual(resume.status_code, 200)
        self.assertEqual(resume.json()["attempt_id"], attempt.pk)
        self.assertTrue(resume.json()["resumed"])
        self.assertEqual(first_save.status_code, 200)
        self.assertEqual(second_tab_save.status_code, 200)
        self.assertEqual(
            QuizAttempt.objects.filter(
                quiz=self.quiz_a,
                student=self.student_a,
                is_submitted=False,
            ).count(),
            1,
        )
        self.assertEqual(attempt.responses.count(), 1)
        self.assertEqual(
            attempt.responses.get(question=self.question_a).text_answer,
            "Second tab answer",
        )

    def test_student_cannot_access_another_students_attempt(self):
        self.client.force_login(self.student_user_a)

        response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[self.attempt_b.pk])
        )

        self.assertEqual(response.status_code, 404)

    def test_answer_save_retry_is_idempotent_after_a_lost_response(self):
        self.client.force_login(self.student_user_a)
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=7,
        )
        payload = {
            "question_id": self.question_a.pk,
            "text_answer": "Retry-safe answer",
        }

        first_response = self.client.post(
            reverse("quiz_app:student_quiz_save", args=[attempt.pk]),
            payload,
        )
        retry_response = self.client.post(
            reverse("quiz_app:student_quiz_save", args=[attempt.pk]),
            payload,
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(retry_response.status_code, 200)
        self.assertEqual(attempt.responses.count(), 1)
        self.assertEqual(
            attempt.responses.get(question=self.question_a).text_answer,
            "Retry-safe answer",
        )

    def test_attempt_does_not_accept_questions_added_after_start(self):
        self.client.force_login(self.student_user_a)
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=11,
        )
        attempt.capture_configuration()
        later_question = Question.objects.create(
            quiz=self.quiz_a,
            question_text="Added after the attempt started",
            question_type="essay",
            school=self.school_a,
        )

        take_response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        save_response = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": later_question.pk,
                "text_answer": "Late question answer",
            }),
            content_type="application/json",
        )

        self.assertEqual(take_response.status_code, 200)
        self.assertNotIn(
            later_question.pk,
            [question["id"] for question in take_response.json()["questions"]],
        )
        self.assertEqual(save_response.status_code, 400)
        self.assertFalse(
            attempt.responses.filter(question=later_question).exists()
        )

    def test_attempt_does_not_accept_choices_added_after_start(self):
        self.client.force_login(self.student_user_a)
        question = Question.objects.create(
            quiz=self.quiz_a,
            question_text="Original multiple choice question",
            question_type="multiple_choice",
            marks=1,
            school=self.school_a,
        )
        original_choices = [
            AnswerChoice.objects.create(
                question=question,
                choice_text=f"Original choice {index}",
                is_correct=index == 1,
                school=self.school_a,
            )
            for index in (1, 2)
        ]
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=12,
        )
        attempt.capture_configuration()
        question.question_text = "Edited after the attempt started"
        question.save(update_fields=["question_text"])
        original_choices[0].choice_text = "Edited original choice"
        original_choices[0].is_correct = False
        original_choices[0].save(update_fields=["choice_text", "is_correct"])
        late_choice = AnswerChoice.objects.create(
            question=question,
            choice_text="Added after the attempt started",
            school=self.school_a,
        )

        take_response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        response = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": question.pk,
                "choice_ids": [late_choice.pk],
            }),
            content_type="application/json",
        )

        self.assertEqual(take_response.status_code, 200)
        take_data = take_response.json()
        take_question = next(
            item for item in take_data["questions"] if item["id"] == question.pk
        )
        self.assertEqual(take_question["question_text"], "Original multiple choice question")
        self.assertEqual(
            {choice["choice_text"] for choice in take_question["choices"]},
            {"Original choice 1", "Original choice 2"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(attempt.responses.exists())
        self.assertEqual(
            len(
                attempt.configuration_snapshot["questions"][str(question.pk)][
                    "choices"
                ]
            ),
            2,
        )
        self.assertEqual(len(original_choices), 2)

        valid_save = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": question.pk,
                "choice_ids": [original_choices[0].pk],
            }),
            content_type="application/json",
        )
        self.assertEqual(valid_save.status_code, 200)
        attempt.submit()
        attempt.refresh_from_db()
        self.assertEqual(attempt.score, 1)

    def test_quiz_start_persists_attempt_configuration_and_randomized_order(self):
        self.client.force_login(self.student_user_a)
        quiz = Quiz.objects.create(
            title="Randomized snapshot quiz",
            slug="randomized-snapshot-quiz",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            status="published",
            total_marks=2,
            max_attempts=1,
            randomize_questions=True,
            randomize_answers=True,
            show_correct_answers=False,
        )
        quiz.classes.add(self.class_a)
        questions = [
            Question.objects.create(
                quiz=quiz,
                question_text=f"Question {index}",
                question_type="multiple_choice",
                marks=1,
                order=index,
                school=self.school_a,
            )
            for index in (1, 2)
        ]
        choices = [
            AnswerChoice.objects.create(
                question=questions[0],
                choice_text=f"Choice {index}",
                is_correct=index == 1,
                order=index,
                school=self.school_a,
            )
            for index in (1, 2, 3)
        ]

        response = self.client.post(
            reverse("quiz_app:api_student_quiz_start", args=[quiz.pk]),
            data=json.dumps({}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        attempt = QuizAttempt.objects.get(pk=response.json()["attempt_id"])
        self.assertEqual(set(attempt.question_order), {q.pk for q in questions})
        self.assertEqual(
            set(attempt.answer_order[str(questions[0].pk)]),
            {choice.pk for choice in choices},
        )
        self.assertFalse(
            attempt.configuration_snapshot["quiz"]["show_correct_answers"]
        )
        self.assertEqual(
            attempt.configuration_snapshot["questions"][str(questions[0].pk)]["marks"],
            1,
        )
        original_question_order = attempt.question_order
        original_answer_order = attempt.answer_order

        repeated_start = self.client.post(
            reverse("quiz_app:api_student_quiz_start", args=[quiz.pk]),
            data=json.dumps({}),
            content_type="application/json",
        )

        attempt.refresh_from_db()
        self.assertEqual(repeated_start.status_code, 200)
        self.assertTrue(repeated_start.json()["resumed"])
        self.assertEqual(repeated_start.json()["attempt_id"], attempt.pk)
        self.assertEqual(
            QuizAttempt.objects.filter(quiz=quiz, student=self.student_a).count(), 1
        )
        self.assertEqual(attempt.question_order, original_question_order)
        self.assertEqual(attempt.answer_order, original_answer_order)

    def test_attempt_scoring_uses_snapshot_and_supports_partial_multiple_choice(self):
        quiz = Quiz.objects.create(
            title="Partial scoring quiz",
            slug="partial-scoring-quiz",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            total_marks=4,
        )
        question = Question.objects.create(
            quiz=quiz,
            question_text="Select all correct",
            question_type="multiple_choice",
            marks=4,
            negative_marks=1,
            partial_credit=True,
            school=self.school_a,
        )
        correct_one = AnswerChoice.objects.create(
            question=question,
            choice_text="Correct one",
            is_correct=True,
            order=1,
            school=self.school_a,
        )
        AnswerChoice.objects.create(
            question=question,
            choice_text="Correct two",
            is_correct=True,
            order=2,
            school=self.school_a,
        )
        incorrect = AnswerChoice.objects.create(
            question=question,
            choice_text="Incorrect",
            order=3,
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student_a,
            school=self.school_a,
            attempt_number=2,
        )
        attempt.capture_configuration()
        question.marks = 10
        question.save(update_fields=["marks"])
        correct_one.is_correct = False
        correct_one.save(update_fields=["is_correct"])

        response = QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            school=self.school_a,
        )
        response.selected_choices.set([correct_one, incorrect])
        response.save()

        attempt.calculate_score()
        attempt.refresh_from_db()
        response.refresh_from_db()
        self.assertEqual(response.marks_awarded, 1)
        self.assertEqual(attempt.score, 1)
        self.assertEqual(attempt.percentage, 25)
        self.assertEqual(attempt.wrong_answers, 1)

    def test_result_review_uses_attempt_snapshot_after_quiz_and_question_edits(self):
        quiz = Quiz.objects.create(
            title="Original snapshot quiz",
            slug="original-snapshot-quiz",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            status="published",
            total_marks=2,
            show_results_immediately=True,
            allow_review=True,
            show_correct_answers=True,
        )
        question = Question.objects.create(
            quiz=quiz,
            question_text="Original question",
            question_type="multiple_choice",
            marks=2,
            explanation="Original explanation",
            school=self.school_a,
        )
        correct_choice = AnswerChoice.objects.create(
            question=question,
            choice_text="Original correct choice",
            is_correct=True,
            school=self.school_a,
        )
        AnswerChoice.objects.create(
            question=question,
            choice_text="Original incorrect choice",
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student_a,
            school=self.school_a,
            attempt_number=8,
        )
        attempt.capture_configuration()
        QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            selected_choice=correct_choice,
            school=self.school_a,
        )
        attempt.submit()

        self.client.force_login(self.student_user_a)
        question.question_text = "Edited question"
        question.explanation = "Edited explanation"
        question.save(update_fields=["question_text", "explanation"])
        correct_choice.choice_text = "Edited correct choice"
        correct_choice.is_correct = False
        correct_choice.save(update_fields=["choice_text", "is_correct"])
        Quiz.objects.filter(pk=quiz.pk).update(
            title="Edited quiz",
            total_marks=99,
            show_correct_answers=False,
        )

        result = self.client.get(
            reverse("quiz_app:student_quiz_result_detail", args=[attempt.pk])
        )

        self.assertRedirects(
            result,
            f"/app/student/attempts/{attempt.pk}/result",
            fetch_redirect_response=False,
        )
        api_result = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        )
        self.assertEqual(api_result.status_code, 200)
        snapshot_result = api_result.json()
        self.assertEqual(snapshot_result["quiz_title"], "Original snapshot quiz")
        self.assertEqual(snapshot_result["questions"][0]["question_text"], "Original question")
        self.assertEqual(snapshot_result["questions"][0]["correct_answer"], "Original correct choice")
        self.assertEqual(snapshot_result["questions"][0]["explanation"], "Original explanation")
        self.assertNotIn("Edited question", api_result.content.decode())
        self.assertNotIn("Edited correct choice", api_result.content.decode())

        print_result = self.client.get(
            reverse("quiz_app:student_quiz_result_print", args=[attempt.pk])
        )
        self.assertRedirects(
            print_result,
            f"/app/student/attempts/{attempt.pk}/result/print",
            fetch_redirect_response=False,
        )
        print_api_result = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        )
        self.assertEqual(print_api_result.status_code, 200)
        self.assertEqual(print_api_result.json()["quiz_title"], "Original snapshot quiz")
        self.assertEqual(print_api_result.json()["questions"][0]["question_text"], "Original question")

    def test_result_review_displays_all_selected_multiple_answer_choices(self):
        quiz = Quiz.objects.create(
            title="Multiple answer result quiz",
            slug="multiple-answer-result-quiz",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            total_marks=2,
            show_results_immediately=True,
            allow_review=True,
        )
        question = Question.objects.create(
            quiz=quiz,
            question_text="Select both correct choices",
            question_type="multiple_choice",
            marks=2,
            school=self.school_a,
        )
        choices = [
            AnswerChoice.objects.create(
                question=question,
                choice_text=f"Correct choice {index}",
                is_correct=True,
                school=self.school_a,
            )
            for index in (1, 2)
        ]
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student_a,
            school=self.school_a,
            attempt_number=10,
        )
        attempt.capture_configuration()
        answer = QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            school=self.school_a,
        )
        answer.selected_choices.set(choices)
        attempt.submit()
        self.client.force_login(self.student_user_a)

        result = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[attempt.pk])
        )

        self.assertEqual(result.status_code, 200)
        questions = result.json()["questions"]
        self.assertEqual(len(questions), 1)
        self.assertEqual(
            {choice["choice_text"] for choice in questions[0]["choices"]},
            {"Correct choice 1", "Correct choice 2"},
        )

    def test_matching_and_ordering_questions_are_scored_from_attempt_snapshot(self):
        quiz = Quiz.objects.create(
            title="Question types quiz",
            slug="question-types-quiz",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            total_marks=5,
        )
        matching = Question.objects.create(
            quiz=quiz,
            question_text="Match terms",
            question_type="matching",
            correct_answer_text="one=1; two=2",
            marks=2,
            school=self.school_a,
        )
        ordering = Question.objects.create(
            quiz=quiz,
            question_text="Order items",
            question_type="ordering",
            correct_answer_text="first; second; third",
            marks=3,
            partial_credit=True,
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student_a,
            school=self.school_a,
            attempt_number=3,
        )
        attempt.capture_configuration()
        matching_response = QuizResponse.objects.create(
            attempt=attempt,
            question=matching,
            school=self.school_a,
            text_answer="two=2; one=1",
        )
        ordering_response = QuizResponse.objects.create(
            attempt=attempt,
            question=ordering,
            school=self.school_a,
            text_answer="first; third; second",
        )

        attempt.calculate_score()
        self.assertFalse(attempt.needs_grading)
        self.assertTrue(attempt.is_graded)
        self.assertTrue(matching_response.is_correct)
        self.assertEqual(matching_response.marks_awarded, 2)
        self.assertFalse(ordering_response.is_correct)
        self.assertEqual(ordering_response.marks_awarded, 1)

    def test_true_false_short_answer_and_fill_blank_are_scored(self):
        quiz = Quiz.objects.create(
            title="Basic question types",
            slug="basic-question-types",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            total_marks=6,
        )
        true_false = Question.objects.create(
            quiz=quiz,
            question_text="The statement is true",
            question_type="true_false",
            marks=2,
            school=self.school_a,
        )
        true_choice = AnswerChoice.objects.create(
            question=true_false,
            choice_text="True",
            is_correct=True,
            school=self.school_a,
        )
        AnswerChoice.objects.create(
            question=true_false,
            choice_text="False",
            is_correct=False,
            school=self.school_a,
        )
        short_answer = Question.objects.create(
            quiz=quiz,
            question_text="Give a short answer",
            question_type="short_answer",
            correct_answer_text="alpha; beta",
            marks=2,
            school=self.school_a,
        )
        fill_blank = Question.objects.create(
            quiz=quiz,
            question_text="Complete the sentence",
            question_type="fill_blank",
            correct_answer_text="complete",
            marks=2,
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student_a,
            school=self.school_a,
            attempt_number=7,
        )
        attempt.capture_configuration()
        true_false_response = QuizResponse.objects.create(
            attempt=attempt,
            question=true_false,
            school=self.school_a,
        )
        true_false_response.selected_choices.set([true_choice])
        true_false_response.save()
        short_response = QuizResponse.objects.create(
            attempt=attempt,
            question=short_answer,
            school=self.school_a,
            text_answer="BETA",
        )
        fill_response = QuizResponse.objects.create(
            attempt=attempt,
            question=fill_blank,
            school=self.school_a,
            text_answer="complete",
        )

        self.assertTrue(true_false_response.is_correct)
        self.assertTrue(short_response.is_correct)
        self.assertTrue(fill_response.is_correct)
        self.assertEqual(
            sum(
                [
                    true_false_response.marks_awarded,
                    short_response.marks_awarded,
                    fill_response.marks_awarded,
                ]
            ),
            6,
        )

    def test_registered_question_types_cover_correct_wrong_partial_blank_and_penalty(self):
        from .question_types import get_question_type

        grading_cases = [
            (
                "multiple_choice",
                {"allow_multiple": True},
                {"1": {"text": "A", "is_correct": True}, "2": {"text": "B", "is_correct": True}, "3": {"text": "C", "is_correct": False}},
                {"choice_ids": [1, 2]},
                {"choice_ids": [3]},
                {"choice_ids": [1]},
                {},
                (4, -1, 2, 0),
            ),
            (
                "true_false",
                {},
                {"1": {"text": "True", "is_correct": True}, "2": {"text": "False", "is_correct": False}},
                {"choice_ids": [1]},
                {"choice_ids": [2]},
                {"choice_ids": []},
                {},
                (4, -1, 0, 0),
            ),
            (
                "short_answer",
                {"accepted_answers": ["accepted"]},
                {},
                {"text": "ACCEPTED"},
                {"text": "wrong"},
                {"text": "wrong"},
                {"text": ""},
                (4, -1, -1, 0),
            ),
            (
                "fill_blank",
                {"blanks": [["first"], ["second"]]},
                {},
                {"text": ["first", "second"]},
                {"text": ["wrong", "wrong"]},
                {"text": ["first", "wrong"]},
                {"text": ["", ""]},
                (4, -1, 1.5, 0),
            ),
            (
                "matching",
                {"pairs": [{"id": "p1", "left_id": "left-one", "right_id": "right-one", "left": "one", "right": "1"}, {"id": "p2", "left_id": "left-two", "right_id": "right-two", "left": "two", "right": "2"}]},
                {},
                {"matches": {"left:left-one": "right:right-one", "left:left-two": "right:right-two"}},
                {"matches": {"left:left-one": "right:right-two", "left:left-two": "right:right-one"}},
                {"matches": {"left:left-one": "right:right-one"}},
                {"matches": {}},
                (4, -1, 1.5, 0),
            ),
            (
                "ordering",
                {"items": ["first", "second", "third"], "item_ids": ["a", "b", "c"]},
                {},
                {"items": ["item:a", "item:b", "item:c"]},
                {"items": ["item:b", "item:c", "item:a"]},
                {"items": ["item:a", "item:c", "item:b"]},
                {"items": []},
                (4, -1, 2 / 3, 0),
            ),
            (
                "essay",
                {"rubric": "Explain clearly"},
                {},
                {"text": "A detailed response"},
                {"text": "A different response"},
                {"text": ""},
                {"text": ""},
                (0, 0, 0, 0),
            ),
        ]

        for question_type, config, choices, correct, wrong, partial, blank, expected in grading_cases:
            question = SimpleNamespace(
                question_type=question_type,
                marks=4,
                negative_marks=1,
                partial_credit=True,
                correct_answer_text="",
            )
            snapshot = {
                "question_type": question_type,
                "marks": 4,
                "negative_marks": 1,
                "partial_credit": True,
                "config": config,
                "choices": choices,
                "correct_answer_text": "",
            }
            results = []
            for answer_data in (correct, wrong, partial, blank):
                response = SimpleNamespace(
                    pk=None,
                    selected_choice_id=None,
                    answer_data=answer_data,
                    text_answer="",
                    is_graded=False,
                    is_correct=False,
                    marks_awarded=0,
                    _selected_choice_ids_for_score=set(),
                )
                result = get_question_type(question_type).grade(
                    question, response, snapshot
                )
                results.append(result.marks_awarded)
            for actual, expected_score in zip(results, expected):
                self.assertAlmostEqual(
                    actual,
                    expected_score,
                    msg=f"{question_type} scoring matrix: {results}",
                )

    def test_question_configuration_snapshot_is_immutable_and_student_safe(self):
        quiz = self.quiz_a
        question = Question.objects.create(
            quiz=quiz,
            question_text="Choose all correct options",
            question_type="multiple_choice",
            correct_answer_text="private-answer-key",
            config={"allow_multiple": True},
            school=self.school_a,
        )
        correct_choice = AnswerChoice.objects.create(
            question=question,
            choice_text="Correct option",
            is_correct=True,
            school=self.school_a,
        )
        AnswerChoice.objects.create(
            question=question,
            choice_text="Incorrect option",
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student_a,
            school=self.school_a,
            attempt_number=30,
        )
        attempt.capture_configuration()
        original_config = attempt.configuration_snapshot["questions"][
            str(question.pk)
        ]["config"]

        question.config = {"allow_multiple": False}
        question.save(update_fields=["config"])
        attempt.capture_configuration()
        attempt.refresh_from_db()
        self.assertEqual(original_config, {"allow_multiple": True})
        self.assertEqual(
            attempt.configuration_snapshot["questions"][str(question.pk)]["config"],
            {"allow_multiple": True},
        )

        response = QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            selected_choice=correct_choice,
            school=self.school_a,
        )
        self.assertTrue(response.is_correct)

        self.client.force_login(self.student_user_a)
        take_response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        self.assertEqual(take_response.status_code, 200)
        payload = take_response.json()
        serialized = next(
            item for item in payload["questions"] if item["id"] == question.pk
        )
        self.assertEqual(serialized["config"], {"allow_multiple": True})
        self.assertNotIn("is_correct", serialized)
        self.assertNotIn("private-answer-key", take_response.content.decode())

    def test_structured_matching_and_ordering_answers_save_and_grade_end_to_end(self):
        quiz = Quiz.objects.create(
            title="Structured question quiz",
            slug="structured-question-quiz",
            subject=self.subject_a,
            teacher=self.teacher_a,
            school=self.school_a,
            total_marks=5,
            randomize_answers=False,
        )
        matching = Question.objects.create(
            quiz=quiz,
            question_text="Match terms",
            question_type="matching",
            marks=2,
            config={
                "pairs": [
                    {"id": "p1", "left": "one", "right": "1"},
                    {"id": "p2", "left": "two", "right": "2"},
                ]
            },
            school=self.school_a,
        )
        ordering = Question.objects.create(
            quiz=quiz,
            question_text="Order items",
            question_type="ordering",
            marks=3,
            config={"items": ["first", "second", "third"]},
            school=self.school_a,
        )
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            student=self.student_a,
            school=self.school_a,
            attempt_number=1,
        )
        attempt.capture_configuration()
        self.client.force_login(self.student_user_a)

        take_response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )
        self.assertEqual(take_response.status_code, 200)
        matching_data = next(
            item for item in take_response.json()["questions"] if item["id"] == matching.pk
        )
        ordering_data = next(
            item for item in take_response.json()["questions"] if item["id"] == ordering.pk
        )
        left_ids = {pair["id"] for pair in matching_data["config"]["pairs"]}
        right_ids = {option["id"] for option in matching_data["config"]["right_options"]}
        self.assertTrue(left_ids.isdisjoint(right_ids))
        self.assertNotIn("right_id", matching_data["config"]["pairs"][0])
        self.assertTrue(all(
            len(pair_id.split(":", 1)[1]) == 32
            for pair_id in left_ids | right_ids
        ))
        self.assertNotIn("item_ids", ordering_data["config"])
        self.assertTrue(all(
            len(item["id"].removeprefix("item:")) == 32
            for item in ordering_data["config"]["items"]
        ))

        matching_pairs = attempt.configuration_snapshot["questions"][
            str(matching.pk)
        ]["config"]["pairs"]
        partial_matching_save = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": matching.pk,
                "answer_data": {
                    "matches": {
                        f"left:{matching_pairs[0]['left_id']}":
                            f"right:{matching_pairs[0]['right_id']}",
                    },
                },
            }),
            content_type="application/json",
        )
        matching_save = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": matching.pk,
                "answer_data": {
                    "matches": {
                        f"left:{pair['left_id']}": f"right:{pair['right_id']}"
                        for pair in matching_pairs
                    }
                },
            }),
            content_type="application/json",
        )
        ordering_save = self.client.post(
            reverse("quiz_app:api_student_quiz_save", args=[attempt.pk]),
            data=json.dumps({
                "question_id": ordering.pk,
                "answer_data": {
                    "items": [
                        f"item:{item_id}"
                        for item_id in attempt.configuration_snapshot["questions"][
                            str(ordering.pk)
                        ]["config"]["item_ids"]
                    ]
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(partial_matching_save.status_code, 200, partial_matching_save.content)
        self.assertEqual(matching_save.status_code, 200, matching_save.content)
        self.assertEqual(ordering_save.status_code, 200, ordering_save.content)
        attempt.submit()
        matching_response = attempt.responses.get(question=matching)
        ordering_response = attempt.responses.get(question=ordering)
        self.assertTrue(matching_response.is_correct)
        self.assertTrue(ordering_response.is_correct)
        self.assertEqual(attempt.score, 5)

    def test_manual_grade_records_audit_history(self):
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=4,
        )
        question = Question.objects.create(
            quiz=self.quiz_a,
            question_text="Explain",
            question_type="essay",
            marks=1,
            school=self.school_a,
        )
        attempt.capture_configuration()
        response = QuizResponse.objects.create(
            attempt=attempt,
            question=question,
            school=self.school_a,
        )
        question.marks = 5
        question.question_type = "multiple_choice"
        question.save(update_fields=["marks", "question_type"])

        response.grade(0, self.admin_a, "Initial score")
        response.grade(4, self.admin_a, "Reviewed score")

        response.refresh_from_db()
        self.assertEqual(len(response.grading_history), 2)
        self.assertEqual(response.grading_history[-1]["marks_awarded"], 1)
        self.assertEqual(
            response.grading_history[-1]["grading_notes"], "Reviewed score"
        )

    def test_expired_attempt_is_submitted_when_resuming(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.time_limit = 1
        self.quiz_a.save(update_fields=["time_limit"])
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=5,
        )
        QuizAttempt.objects.filter(pk=attempt.pk).update(
            started_at=timezone.now() - timedelta(minutes=2)
        )

        legacy_response = self.client.get(
            reverse("quiz_app:student_quiz_resume", args=[self.quiz_a.pk])
        )
        attempt.refresh_from_db()
        self.assertFalse(attempt.is_submitted)
        self.assertRedirects(
            legacy_response,
            f"/app/student/quizzes/{self.quiz_a.pk}",
            fetch_redirect_response=False,
        )

        response = self.client.get(
            reverse("quiz_app:api_student_quiz_take", args=[attempt.pk])
        )

        attempt.refresh_from_db()
        self.assertTrue(attempt.is_submitted)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["time_expired"])

    def test_quiz_submission_is_idempotent(self):
        self.client.force_login(self.student_user_a)
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=6,
        )

        first_response = self.client.post(
            reverse("quiz_app:student_quiz_submit", args=[attempt.pk])
        )
        attempt.refresh_from_db()
        submitted_at = attempt.submitted_at
        score = attempt.score
        second_response = self.client.post(
            reverse("quiz_app:student_quiz_submit", args=[attempt.pk])
        )
        attempt.refresh_from_db()

        self.assertEqual(first_response.status_code, 302)
        self.assertEqual(second_response.status_code, 302)
        self.assertTrue(attempt.is_submitted)
        self.assertEqual(attempt.submitted_at, submitted_at)
        self.assertEqual(attempt.score, score)

    def test_manual_submission_after_expiry_submits_the_attempt(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.time_limit = 1
        self.quiz_a.save(update_fields=["time_limit"])
        attempt = QuizAttempt.objects.create(
            quiz=self.quiz_a,
            student=self.student_a,
            school=self.school_a,
            attempt_number=8,
        )
        QuizAttempt.objects.filter(pk=attempt.pk).update(
            started_at=timezone.now() - timedelta(minutes=2)
        )

        response = self.client.post(
            reverse("quiz_app:student_quiz_submit", args=[attempt.pk])
        )

        attempt.refresh_from_db()
        self.assertEqual(response.status_code, 302)
        self.assertTrue(attempt.is_submitted)
        self.assertIsNotNone(attempt.submitted_at)

    def test_student_gets_score_only_when_review_is_not_immediately_available(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.show_results_immediately = False
        self.quiz_a.allow_review = True
        self.quiz_a.save(update_fields=["show_results_immediately", "allow_review"])

        response = self.client.get(
            reverse("quiz_app:student_quiz_result_detail", args=[self.attempt_a.pk])
        )

        self.assertRedirects(
            response,
            f"/app/student/attempts/{self.attempt_a.pk}/result",
            fetch_redirect_response=False,
        )
        api_response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[self.attempt_a.pk])
        )
        self.assertEqual(api_response.status_code, 200)
        self.assertFalse(api_response.json()["allow_review"])
        self.assertEqual(api_response.json()["questions"], [])

    def test_student_cannot_review_when_quiz_review_is_disabled(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.allow_review = False
        self.quiz_a.save(update_fields=["allow_review"])

        response = self.client.get(
            reverse("quiz_app:student_quiz_result_print", args=[self.attempt_a.pk])
        )

        self.assertRedirects(
            response,
            f"/app/student/attempts/{self.attempt_a.pk}/result/print",
            fetch_redirect_response=False,
        )
        api_response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[self.attempt_a.pk])
        )
        self.assertEqual(api_response.status_code, 200)
        self.assertFalse(api_response.json()["allow_review"])
        self.assertEqual(api_response.json()["questions"], [])

    def test_student_answer_key_and_explanation_follow_quiz_visibility_setting(self):
        self.client.force_login(self.student_user_a)
        self.quiz_a.show_results_immediately = True
        self.quiz_a.allow_review = True
        self.quiz_a.show_correct_answers = False
        self.quiz_a.save(
            update_fields=[
                "show_results_immediately",
                "allow_review",
                "show_correct_answers",
            ]
        )
        self.question_a.question_type = "short_answer"
        self.question_a.correct_answer_text = "private answer key"
        self.question_a.explanation = "private explanation"
        self.question_a.save(
            update_fields=[
                "question_type",
                "correct_answer_text",
                "explanation",
            ]
        )
        self.response_a.text_answer = "incorrect response"
        self.response_a.save(update_fields=["text_answer"])

        response = self.client.get(
            reverse("quiz_app:student_quiz_result_detail", args=[self.attempt_a.pk])
        )

        self.assertRedirects(
            response,
            f"/app/student/attempts/{self.attempt_a.pk}/result",
            fetch_redirect_response=False,
        )
        api_response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[self.attempt_a.pk])
        )
        self.assertEqual(api_response.status_code, 200)
        self.assertIn(self.question_a.question_text, api_response.content.decode())
        self.assertNotIn("private answer key", api_response.content.decode())
        self.assertNotIn("private explanation", api_response.content.decode())

        print_response = self.client.get(
            reverse("quiz_app:student_quiz_result_print", args=[self.attempt_a.pk])
        )

        self.assertRedirects(
            print_response,
            f"/app/student/attempts/{self.attempt_a.pk}/result/print",
            fetch_redirect_response=False,
        )
        print_api_response = self.client.get(
            reverse("quiz_app:api_student_quiz_result", args=[self.attempt_a.pk])
        )
        self.assertEqual(print_api_response.status_code, 200)
        print_question = print_api_response.json()["questions"][0]
        self.assertNotIn("correct_answer", print_question)
        self.assertNotIn("explanation", print_question)

    def test_student_can_open_quiz_assigned_to_current_class(self):
        self.client.force_login(self.student_user_a)

        response = self.client.get(
            reverse("quiz_app:student_quiz_detail", args=[self.quiz_a.pk])
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/app/"))

    def test_student_current_class_ignores_foreign_school_assignment(self):
        StudentClass.objects.create(
            student=self.student_a,
            assigned_class=self.class_b,
            school=self.school_b,
        )

        self.assertEqual(self.student_a.get_current_class(), self.class_a)

    def test_quiz_creation_rejects_foreign_school_class(self):
        response = self.client.post(
            reverse("quiz_app:api_teacher_quizzes"),
            data=json.dumps({
                "title": "Invalid A Quiz",
                "subject": self.subject_a.pk,
                "teacher": self.teacher_a.pk,
                "academic_year": self.academic_year_a.pk,
                "classes": [self.class_b.pk],
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "VALIDATION_ERROR")
        self.assertEqual(
            response.json()["fields"]["classes"][0],
            "One or more selected classes are invalid.",
        )
        self.assertFalse(Quiz.objects.filter(title="Invalid A Quiz").exists())

    def test_quiz_edit_rejects_foreign_school_class_without_changing_quiz(self):
        response = self.client.patch(
            reverse("quiz_app:api_teacher_quiz_detail", args=[self.quiz_a.pk]),
            data=json.dumps({
                "title": "Changed Title",
                "subject": self.subject_a.pk,
                "teacher": self.teacher_a.pk,
                "academic_year": self.academic_year_a.pk,
                "classes": [self.class_b.pk],
            }),
            content_type="application/json",
        )

        self.quiz_a.refresh_from_db()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.quiz_a.title, "School A Quiz")
        self.assertEqual(list(self.quiz_a.classes.all()), [self.class_a])

    def test_quiz_creation_rejects_foreign_school_term(self):
        response = self.client.post(
            reverse("quiz_app:api_teacher_quizzes"),
            data=json.dumps({
                "title": "Invalid Term Quiz",
                "subject": self.subject_a.pk,
                "teacher": self.teacher_a.pk,
                "academic_year": self.academic_year_a.pk,
                "term": self.term_b.pk,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["term"][0], "Invalid term selected.")
        self.assertFalse(Quiz.objects.filter(title="Invalid Term Quiz").exists())

    def test_school_a_cannot_open_school_b_subject_edit_endpoint(self):
        response = self.client.get(
            reverse("quiz_app:subject_edit", args=[self.subject_b.pk])
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/app/"))

    def test_school_a_cannot_open_school_b_teacher_edit_endpoint(self):
        response = self.client.get(
            reverse("quiz_app:teacher_edit", args=[self.teacher_b.pk])
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/app/"))

    def test_school_a_cannot_open_school_b_class_detail_endpoint(self):
        response = self.client.get(
            reverse("quiz_app:class_detail", args=[self.class_b.pk])
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/app/"))

    def test_school_a_cannot_open_school_b_user_edit_endpoint(self):
        response = self.client.get(
            reverse("quiz_app:user_edit", args=[self.user_b.pk])
        )

        self.assertRedirects(
            response,
            "/app/admin/users",
            fetch_redirect_response=False,
        )

    def test_school_a_subject_list_excludes_school_b_records(self):
        response = self.client.get(reverse("quiz_app:subject_list"))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith("/app/"))

    def test_class_creation_rejects_foreign_school_form_instead_of_dropping_it(
        self,
    ):
        response = self.client.post(
            reverse("quiz_app:class_create"),
            {
                "name": "A Class",
                "academic_year": self.academic_year_a.pk,
                "form": self.form_b.pk,
                "maximum_students": 30,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["success"])
        self.assertEqual(response.json()["error"], "Invalid form selected.")

    def test_teacher_creation_rejects_foreign_school_department(self):
        response = self.client.post(
            reverse("quiz_app:teacher_create"),
            {
                "full_name": "New Teacher",
                "contact_number": "123",
                "department": self.department_b.pk,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["success"])
        self.assertEqual(response.json()["error"], "Invalid department selected.")

    def test_student_creation_rejects_foreign_school_form(self):
        response = self.client.post(
            reverse("quiz_app:student_create"),
            {
                "full_name": "New Student",
                "date_of_birth": "2010-01-01",
                "gender": "F",
                "parent_contact": "123",
                "admission_date": "2026-01-01",
                "form": self.form_b.pk,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["success"])
        self.assertEqual(response.json()["error"], "Invalid form selected.")


class AuthenticationRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_same_identifier_is_not_limited_across_different_ips(self):
        for attempt in range(8):
            response = self.client.post(
                reverse("quiz_app:login"),
                {"username": "unknown@example.test", "password": "wrong"},
                REMOTE_ADDR=f"192.0.2.{attempt + 1}",
                HTTP_ACCEPT="application/json",
            )
            self.assertEqual(response.status_code, 401)

    def test_login_is_limited_per_ip_across_identifiers(self):
        limit = AUTH_RATE_LIMITS["login"]["ip"][0]
        for attempt in range(limit):
            response = self.client.post(
                reverse("quiz_app:login"),
                {
                    "username": f"unknown-{attempt}@example.test",
                    "password": "wrong",
                },
                REMOTE_ADDR="192.0.2.10",
                HTTP_ACCEPT="application/json",
            )
            self.assertEqual(response.status_code, 401)

        response = self.client.post(
            reverse("quiz_app:login"),
            {"username": "another@example.test", "password": "wrong"},
            REMOTE_ADDR="192.0.2.10",
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(response.status_code, 429)

    def test_superadmin_login_uses_login_rate_limits(self):
        limit = AUTH_RATE_LIMITS["login"]["ip"][0]
        for _ in range(limit):
            response = self.client.post(
                reverse("quiz_app:superadmin_login"),
                {"username": "not-superadmin@example.test", "password": "wrong"},
                HTTP_ACCEPT="application/json",
            )
            self.assertEqual(response.status_code, 403)

        response = self.client.post(
            reverse("quiz_app:superadmin_login"),
            {"username": "not-superadmin@example.test", "password": "wrong"},
            HTTP_ACCEPT="application/json",
        )
        self.assertEqual(response.status_code, 429)

    def test_same_password_reset_identifier_is_not_limited_across_different_ips(self):
        for attempt in range(8):
            response = self.client.post(
                reverse("quiz_app:password_reset"),
                {"email": "unknown@example.test"},
                REMOTE_ADDR=f"198.51.100.{attempt + 1}",
            )
            self.assertEqual(response.status_code, 200)

    def test_password_reset_is_limited_per_ip_across_identifiers(self):
        limit = AUTH_RATE_LIMITS["password_reset"]["ip"][0]
        for attempt in range(limit):
            response = self.client.post(
                reverse("quiz_app:password_reset"),
                {"email": f"unknown-{attempt}@example.test"},
                REMOTE_ADDR="192.0.2.11",
            )
            self.assertEqual(response.status_code, 200)

        response = self.client.post(
            reverse("quiz_app:password_reset"),
            {"email": "another@example.test"},
            REMOTE_ADDR="192.0.2.11",
        )
        self.assertEqual(response.status_code, 429)

    def test_proxy_ip_is_used_only_when_trusted_header_is_configured(self):
        request = RequestFactory().get(
            "/",
            REMOTE_ADDR="10.0.0.4",
            HTTP_X_FORWARDED_FOR="192.0.2.45, 10.0.0.4",
        )
        self.assertEqual(get_client_ip(request), "10.0.0.4")
        with override_settings(TRUSTED_PROXY_HEADER="HTTP_X_FORWARDED_FOR"):
            self.assertEqual(get_client_ip(request), "192.0.2.45")


class ReactOwnedRouteContractTests(SimpleTestCase):
    def test_every_react_owned_redirect_target_matches_an_app_route(self):
        app_source = (
            settings.BASE_DIR / "frontend" / "src" / "App.tsx"
        ).read_text(encoding="utf-8")
        route_paths = re.findall(r'<Route\s+path="([^"]+)"', app_source)

        def matches_route(path):
            for route in route_paths:
                if route == "*":
                    continue
                route_pattern = "/".join(
                    "[^/]+" if segment.startswith(":") else re.escape(segment)
                    for segment in route.strip("/").split("/")
                )
                if re.fullmatch(route_pattern, path.strip("/")):
                    return True
            return False

        targets = []
        for pattern in urlpatterns:
            destination = getattr(pattern.callback, "react_destination", None)
            if destination is None:
                continue
            kwargs = {name: "1" for name in pattern.pattern.converters}
            for role in ("admin", "superadmin", "teacher", "student"):
                request = SimpleNamespace(user=SimpleNamespace(role=role))
                target = destination(request) if callable(destination) else destination.format(**kwargs)
                target_path = target.split("?", 1)[0]
                if target_path.startswith("/app/"):
                    targets.append(target_path[len("/app"):])

        missing = [target for target in targets if not matches_route(target)]
        self.assertTrue(targets, "Expected to find React-owned redirects in urls.py")
        self.assertEqual(missing, [])

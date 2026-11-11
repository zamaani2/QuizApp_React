import datetime
import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase

from .models import SchoolInformation, Student, Teacher, User


class DirectoryManagementApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.school_a = SchoolInformation.objects.create(
            name="Alpha School", short_name="ALPHA", slug="alpha-school",
            school_code="ALP01", is_active=True,
        )
        self.school_b = SchoolInformation.objects.create(
            name="Beta School", short_name="BETA", slug="beta-school",
            school_code="BET01", is_active=True,
        )
        self.admin = User.objects.create_user(
            username="alpha-admin", email="alpha-admin@example.com",
            password="TestPassword-123!", full_name="Alpha Admin",
            role="admin", school=self.school_a,
        )
        self.other_admin = User.objects.create_user(
            username="beta-admin", email="beta-admin@example.com",
            password="TestPassword-123!", full_name="Beta Admin",
            role="admin", school=self.school_b,
        )
        self.teacher_user = User.objects.create_user(
            username="teacher-user", email="teacher-user@example.com",
            password="TestPassword-123!", full_name="Teacher User",
            role="teacher", school=self.school_a,
        )
        self.student_a = Student.objects.create(
            admission_number="ALPHA001", full_name="Alpha Student",
            date_of_birth=datetime.date(2010, 1, 1), gender="M",
            parent_contact="12345", admission_date=datetime.date(2026, 1, 1),
            school=self.school_a,
        )
        self.teacher_b = Teacher.objects.create(
            full_name="Beta Teacher", contact_number="12345", school=self.school_b,
        )
        self.superadmin = User.objects.create_user(
            username="global-admin", email="global-admin@example.com",
            password="TestPassword-123!", full_name="Global Admin",
            role="superadmin", is_superadmin=True,
        )

    def test_admin_cannot_patch_cross_tenant_records(self):
        self.client.force_login(self.admin)
        student = Student.objects.create(
            admission_number="BETA001", full_name="Beta Student",
            date_of_birth=datetime.date(2010, 1, 1), gender="F",
            parent_contact="12345", admission_date=datetime.date(2026, 1, 1),
            school=self.school_b,
        )
        response = self.client.patch(
            "/api/v1/students/",
            data=json.dumps({"id": student.pk, "full_name": "Changed"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(f"/api/v1/teachers/{self.teacher_b.pk}/archive/")
        self.assertEqual(response.status_code, 404)
        response = self.client.patch(
            f"/api/v1/teachers/{self.teacher_b.pk}/",
            data=json.dumps({"full_name": "Changed", "contact_number": "555"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.patch(
            f"/api/v1/users/{self.other_admin.pk}/",
            data=json.dumps({"id": self.other_admin.pk}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.delete(f"/api/v1/users/{self.other_admin.pk}/")
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            "/api/v1/students/bulk-archive/",
            data=json.dumps({"student_ids": [student.pk]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            "/api/v1/teachers/bulk-archive/",
            data=json.dumps({"teacher_ids": [self.teacher_b.pk]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            "/api/v1/users/bulk-password-reset/",
            data=json.dumps({"user_ids": [self.other_admin.pk]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_wrong_role_cannot_write_student_teacher_or_user(self):
        self.client.force_login(self.teacher_user)
        payload = {
            "full_name": "New Person", "date_of_birth": "2010-01-01",
            "gender": "F", "parent_contact": "12345", "admission_date": "2026-01-01",
            "school_id": self.school_a.pk,
        }
        response = self.client.post("/api/v1/students/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 403)
        response = self.client.post(
            "/api/v1/teachers/",
            data=json.dumps({"full_name": "New Teacher", "contact_number": "12345"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        response = self.client.post(
            "/api/v1/users/",
            data=json.dumps({"username": "new", "email": "new@example.com", "full_name": "New", "role": "admin"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_wrong_role_is_denied_on_directory_actions_and_imports(self):
        self.client.force_login(self.teacher_user)
        requests = (
            self.client.post(f"/api/v1/students/{self.student_a.pk}/archive/"),
            self.client.post(f"/api/v1/students/{self.student_a.pk}/restore/"),
            self.client.post("/api/v1/students/bulk-archive/", data=json.dumps({"student_ids": [self.student_a.pk]}), content_type="application/json"),
            self.client.post("/api/v1/students/import/preview/"),
            self.client.post("/api/v1/students/import/"),
            self.client.post(f"/api/v1/teachers/{self.teacher_b.pk}/archive/"),
            self.client.post(f"/api/v1/teachers/{self.teacher_b.pk}/restore/"),
            self.client.post("/api/v1/teachers/bulk-archive/", data=json.dumps({"teacher_ids": [self.teacher_b.pk]}), content_type="application/json"),
            self.client.post("/api/v1/teachers/import/preview/"),
            self.client.post("/api/v1/teachers/import/"),
            self.client.get("/api/v1/teachers/export/"),
            self.client.delete(f"/api/v1/users/{self.admin.pk}/"),
            self.client.post("/api/v1/users/bulk-password-reset/", data=json.dumps({"user_ids": [self.admin.pk]}), content_type="application/json"),
        )
        self.assertTrue(all(response.status_code == 403 for response in requests))

    def test_validation_errors_use_field_error_envelope(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/v1/students/",
            data=json.dumps({"school_id": self.school_a.pk}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "VALIDATION_ERROR")
        self.assertIn("fields", payload)
        self.assertIn("full_name", payload["fields"])

    def test_duplicate_admission_numbers_and_partial_import(self):
        self.client.force_login(self.admin)
        csv_data = (
            "full_name,gender,admission_number,date_of_birth,parent_contact,admission_date\n"
            "Duplicate,M,ALPHA001,2010-01-01,12345,2026-01-01\n"
            "New Student,F,ALPHA002,2011-02-02,12345,2026-01-01\n"
        )
        upload = SimpleUploadedFile("students.csv", csv_data.encode(), content_type="text/csv")
        response = self.client.post(
            "/api/v1/students/import/",
            {"file": upload, "school_id": str(self.school_a.pk), "column_mappings": "{}"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["imported"], 1)
        self.assertTrue(payload["partial_success"])
        self.assertEqual(Student.objects.filter(admission_number="ALPHA002").count(), 1)

    def test_superadmin_must_select_school_for_writes(self):
        self.client.force_login(self.superadmin)
        payload = {
            "full_name": "New Student", "date_of_birth": "2010-01-01",
            "gender": "M", "parent_contact": "12345", "admission_date": "2026-01-01",
        }
        response = self.client.post("/api/v1/students/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        payload["school_id"] = self.school_b.pk
        response = self.client.post("/api/v1/students/", data=json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Student.objects.get(pk=response.json()["student_id"]).school_id, self.school_b.pk)

    def test_teacher_import_reports_partial_row_failures(self):
        self.client.force_login(self.admin)
        csv_data = "full_name,contact_number,gender,email\nValid Teacher,5551234,F,valid@example.com\nMissing Contact,,M,\n"
        upload = SimpleUploadedFile("teachers.csv", csv_data.encode(), content_type="text/csv")
        response = self.client.post(
            "/api/v1/teachers/import/",
            {"file": upload, "school_id": str(self.school_a.pk)},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["imported"], 1)
        self.assertTrue(payload["partial_success"])
        self.assertEqual(Teacher.objects.filter(full_name="Valid Teacher", school=self.school_a).count(), 1)

    def test_legacy_post_handlers_are_gone(self):
        self.client.force_login(self.admin)
        response = self.client.post("/students/create/", data={})
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["code"], "LEGACY_ENDPOINT_GONE")

    def test_user_create_patch_and_delete_use_versioned_endpoints(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/v1/users/",
            data=json.dumps({
                "username": "managed-user", "email": "managed@example.com",
                "full_name": "Managed User", "role": "teacher",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        user_id = response.json()["user_id"]
        user = User.objects.get(pk=user_id)
        self.assertEqual(user.school_id, self.school_a.pk)

        response = self.client.patch(
            f"/api/v1/users/{user_id}/",
            data=json.dumps({"full_name": "Updated Name"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.full_name, "Updated Name")

        response = self.client.delete(f"/api/v1/users/{user_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(pk=user_id).exists())

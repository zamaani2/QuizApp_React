import json
import datetime
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, Client, override_settings
from django.urls import reverse

from quiz_app.models import (
    SchoolInformation,
    User,
    AcademicYear,
    Term,
    Class,
    Subject,
    ClassSubject,
    TeacherSubjectAssignment,
    Form,
    LearningArea,
    Department,
    Student,
    Teacher,
    StudentClass,
)


class AcademicStructureApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.password = "TestPassword-123!"

        # School A
        self.school_a = SchoolInformation.objects.create(
            name="Alpha High",
            short_name="ALPHA",
            slug="alpha-high",
            school_code="ALP01",
            is_active=True,
        )

        # School B (for isolation test)
        self.school_b = SchoolInformation.objects.create(
            name="Beta High",
            short_name="BETA",
            slug="beta-high",
            school_code="BET01",
            is_active=True,
        )

        # Admin User A
        self.admin_a = User.objects.create_user(
            username="admin_a",
            email="admin_a@alpha.edu",
            password=self.password,
            role="admin",
            full_name="Admin Alpha",
            school=self.school_a,
        )

        # Teacher User A
        self.teacher_profile_a = Teacher.objects.create(
            full_name="Teacher Alpha",
            contact_number="1111",
            school=self.school_a,
        )
        self.teacher_a = User.objects.get(teacher_profile=self.teacher_profile_a)
        self.teacher_a.set_password(self.password)
        self.teacher_a.school = self.school_a
        self.teacher_a.save()

        # Student User A
        self.student_profile_a = Student.objects.create(
            admission_number="ADM-001",
            full_name="Student Alpha",
            date_of_birth="2010-01-01",
            gender="M",
            parent_contact="2222",
            admission_date="2026-01-01",
            school=self.school_a,
        )
        self.student_a = User.objects.get(student_profile=self.student_profile_a)
        self.student_a.set_password(self.password)
        self.student_a.school = self.school_a
        self.student_a.save()

        # Form & Learning Area
        self.form_1 = Form.objects.create(
            form_number=1,
            name="Form 1",
            school=self.school_a,
        )
        self.la_science = LearningArea.objects.create(
            name="Science",
            code="SCI",
            school=self.school_a,
        )
        self.dept_math = Department.objects.create(
            name="Mathematics",
            code="MATH",
            school=self.school_a,
        )

        # Academic Year A1
        self.year_a1 = AcademicYear.objects.create(
            name="2026/2027",
            start_date=datetime.date(2026, 9, 1),
            end_date=datetime.date(2027, 7, 1),
            is_current=True,
            school=self.school_a,
        )
        self.term_a1 = Term.objects.create(
            academic_year=self.year_a1,
            term_number=1,
            start_date=datetime.date(2026, 9, 1),
            end_date=datetime.date(2026, 12, 15),
            is_current=True,
            school=self.school_a,
        )
        self.school_a.current_academic_year = self.year_a1
        self.school_a.current_term = self.term_a1
        self.school_a.save()

    def test_academic_legacy_pages_always_redirect_to_react(self):
        self.client.force_login(self.admin_a)
        routes = (
            ("academic_year_list", (), "/app/admin/academic-years"),
            ("academic_year_create", (), "/app/admin/academic-years"),
            (
                "academic_year_edit",
                (self.year_a1.pk,),
                "/app/admin/academic-years",
            ),
            ("term_list", (), "/app/admin/terms"),
            ("term_create", (), "/app/admin/terms"),
            ("term_edit", (self.term_a1.pk,), "/app/admin/terms"),
        )

        for route_name, args, destination in routes:
            with self.subTest(route=route_name):
                response = self.client.get(
                    reverse(f"quiz_app:{route_name}", args=args),
                    {"classic": "1"},
                )
                self.assertRedirects(
                    response,
                    destination,
                    fetch_redirect_response=False,
                )

    def test_academic_years_list_and_create(self):
        """Admin can list and create academic years."""
        self.client.login(username="admin_a", password=self.password)

        # GET
        res = self.client.get(reverse("quiz_app:api_academic_years"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["academic_years"]), 1)
        self.assertEqual(data["academic_years"][0]["name"], "2026/2027")

        # POST (Valid)
        payload = {
            "name": "2027/2028",
            "start_date": "2027-09-01",
            "end_date": "2028-07-01",
            "is_current": False,
        }
        res = self.client.post(
            reverse("quiz_app:api_academic_years"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        res_data = res.json()
        self.assertTrue(res_data["success"])
        self.assertEqual(res_data["academic_year"]["name"], "2027/2028")

        # POST (Invalid dates: start >= end)
        invalid_payload = {
            "name": "2028/2029",
            "start_date": "2029-01-01",
            "end_date": "2028-01-01",
            "is_current": False,
        }
        res = self.client.post(
            reverse("quiz_app:api_academic_years"),
            data=json.dumps(invalid_payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json().get("code"), "VALIDATION_ERROR")

    def test_academic_year_update_and_delete(self):
        """Admin can update an academic year and delete an unused one."""
        self.client.login(username="admin_a", password=self.password)

        # Create unused year
        unused = AcademicYear.objects.create(
            name="2029/2030",
            start_date=datetime.date(2029, 9, 1),
            end_date=datetime.date(2030, 7, 1),
            school=self.school_a,
        )

        # PUT (Update)
        res = self.client.put(
            reverse("quiz_app:api_academic_year_detail", kwargs={"year_id": unused.id}),
            data=json.dumps({
                "name": "2029/2030 Revised",
                "start_date": "2029-10-01",
                "end_date": "2030-07-15",
                "is_current": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["academic_year"]["name"], "2029/2030 Revised")

        # DELETE unused year
        res = self.client.delete(
            reverse("quiz_app:api_academic_year_detail", kwargs={"year_id": unused.id})
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(AcademicYear.objects.filter(id=unused.id).exists())

        # DELETE year with terms (rejected)
        res = self.client.delete(
            reverse("quiz_app:api_academic_year_detail", kwargs={"year_id": self.year_a1.id})
        )
        self.assertEqual(res.status_code, 400)

    def test_academic_year_set_current(self):
        """Admin can set an academic year as current."""
        self.client.login(username="admin_a", password=self.password)

        year2 = AcademicYear.objects.create(
            name="2027/2028",
            start_date=datetime.date(2027, 9, 1),
            end_date=datetime.date(2028, 7, 1),
            school=self.school_a,
            is_current=False,
        )

        res = self.client.post(
            reverse("quiz_app:api_academic_year_set_current", kwargs={"year_id": year2.id})
        )
        self.assertEqual(res.status_code, 200)
        self.school_a.refresh_from_db()
        self.assertEqual(self.school_a.current_academic_year, year2)
        year2.refresh_from_db()
        self.assertTrue(year2.is_current)

    def test_terms_crud_and_set_current(self):
        """Admin can list, create, update, delete, and set current terms."""
        self.client.login(username="admin_a", password=self.password)

        # List
        res = self.client.get(reverse("quiz_app:api_terms"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["terms"]), 1)

        # Create Term 2
        payload = {
            "academic_year_id": self.year_a1.id,
            "term_number": 2,
            "start_date": "2027-01-05",
            "end_date": "2027-04-10",
            "is_current": False,
        }
        res = self.client.post(
            reverse("quiz_app:api_terms"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        term2_id = res.json()["term"]["id"]

        # Duplicate Term 2 (rejected)
        res = self.client.post(
            reverse("quiz_app:api_terms"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

        # Set Current
        res = self.client.post(
            reverse("quiz_app:api_term_set_current", kwargs={"term_id": term2_id})
        )
        self.assertEqual(res.status_code, 200)
        self.school_a.refresh_from_db()
        self.assertEqual(self.school_a.current_term_id, term2_id)

        # Delete Term 2
        res = self.client.delete(
            reverse("quiz_app:api_term_detail", kwargs={"term_id": term2_id})
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Term.objects.filter(id=term2_id).exists())

    def test_classes_crud_and_soft_delete(self):
        """Admin can create, list, update, archive, and restore classes."""
        self.client.login(username="admin_a", password=self.password)

        # Create Class
        payload = {
            "name": "Form 1 East",
            "form_id": self.form_1.id,
            "learning_area_id": self.la_science.id,
            "academic_year_id": self.year_a1.id,
            "maximum_students": 45,
        }
        res = self.client.post(
            reverse("quiz_app:api_classes"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        class_id = res.json()["class"]["id"]

        # List
        res = self.client.get(reverse("quiz_app:api_classes"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["classes"]), 1)
        self.assertEqual(res.json()["classes"][0]["name"], "Form 1 East")

        # Update
        res = self.client.put(
            reverse("quiz_app:api_class_detail", kwargs={"class_id": class_id}),
            data=json.dumps({"name": "Form 1 West", "maximum_students": 40}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["class"]["name"], "Form 1 West")

        # Soft Delete (Archive)
        res = self.client.delete(
            reverse("quiz_app:api_class_detail", kwargs={"class_id": class_id})
        )
        self.assertEqual(res.status_code, 200)
        cls_obj = Class.objects.get(id=class_id)
        self.assertFalse(cls_obj.is_active)

        # Restore
        res = self.client.post(
            reverse("quiz_app:api_class_restore", kwargs={"class_id": class_id})
        )
        self.assertEqual(res.status_code, 200)
        cls_obj.refresh_from_db()
        self.assertTrue(cls_obj.is_active)

    def test_class_detail_and_subject_assignment(self):
        """Admin can view class detail with students and assign/remove subjects."""
        self.client.login(username="admin_a", password=self.password)

        cls_obj = Class.objects.create(
            name="Form 1 North",
            form=self.form_1,
            academic_year=self.year_a1,
            school=self.school_a,
        )
        # Enroll student
        StudentClass.objects.create(
            student=self.student_profile_a,
            assigned_class=cls_obj,
            school=self.school_a,
            is_active=True,
        )

        subject = Subject.objects.create(
            subject_name="Physics",
            subject_code="PHY101",
            school=self.school_a,
        )

        # Detail View
        res = self.client.get(
            reverse("quiz_app:api_class_detail", kwargs={"class_id": cls_obj.id})
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["class"]["name"], "Form 1 North")
        self.assertEqual(len(data["enrolled_students"]), 1)
        self.assertEqual(data["enrolled_students"][0]["full_name"], "Student Alpha")
        self.assertEqual(len(data["assigned_subjects"]), 0)

        # Assign Subject
        res = self.client.post(
            reverse("quiz_app:api_class_subject_add", kwargs={"class_id": cls_obj.id}),
            data=json.dumps({"subject_id": subject.id}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        cs_id = res.json()["assigned_subject"]["id"]

        # Duplicate assignment rejected
        res = self.client.post(
            reverse("quiz_app:api_class_subject_add", kwargs={"class_id": cls_obj.id}),
            data=json.dumps({"subject_id": subject.id}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

        # Remove Subject
        res = self.client.delete(
            reverse("quiz_app:api_class_subject_remove", kwargs={"class_id": cls_obj.id, "class_subject_id": cs_id})
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(ClassSubject.objects.filter(id=cs_id).exists())

    def test_subjects_crud_and_restore(self):
        """Admin can list, create, update, archive, and restore subjects."""
        self.client.login(username="admin_a", password=self.password)

        # Create
        payload = {
            "subject_name": "Chemistry",
            "subject_code": "CHM101",
            "department_id": self.dept_math.id,
            "learning_area_id": self.la_science.id,
        }
        res = self.client.post(
            reverse("quiz_app:api_subjects"),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        sub_id = res.json()["subject"]["id"]
        generated_subject_code = res.json()["subject"]["subject_code"]
        self.assertEqual(res.json()["subject"]["school_id"], self.school_a.pk)
        self.assertEqual(res.json()["subject"]["class_count"], 0)
        self.assertEqual(res.json()["subject"]["quiz_count"], 0)

        # List
        res = self.client.get(reverse("quiz_app:api_subjects"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["subjects"]), 1)
        filtered = self.client.get(
            reverse("quiz_app:api_subjects"),
            {"department_id": self.dept_math.pk, "learning_area_id": self.la_science.pk},
        )
        self.assertEqual(len(filtered.json()["subjects"]), 1)
        self.assertEqual(
            self.client.get(
                reverse("quiz_app:api_subjects"), {"department_id": "invalid"}
            ).status_code,
            400,
        )

        # Update
        res = self.client.put(
            reverse("quiz_app:api_subject_detail", kwargs={"subject_id": sub_id}),
            data=json.dumps({"subject_name": "Organic Chemistry", "subject_code": "CHM102"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["subject"]["subject_name"], "Organic Chemistry")
        self.assertEqual(res.json()["subject"]["subject_code"], generated_subject_code)

        class_obj = Class.objects.create(
            name="Form 1 North",
            form=self.form_1,
            academic_year=self.year_a1,
            school=self.school_a,
        )
        assignment = TeacherSubjectAssignment.objects.create(
            teacher=self.teacher_profile_a,
            subject=Subject.objects.get(pk=sub_id),
            class_assigned=class_obj,
            academic_year=self.year_a1,
            school=self.school_a,
            is_active=True,
        )

        # Archive (Delete)
        res = self.client.delete(
            reverse("quiz_app:api_subject_detail", kwargs={"subject_id": sub_id})
        )
        self.assertEqual(res.status_code, 200)
        sub = Subject.objects.get(id=sub_id)
        self.assertFalse(sub.is_active)
        assignment.refresh_from_db()
        self.assertFalse(assignment.is_active)

        # Restore
        res = self.client.post(
            reverse("quiz_app:api_subject_restore", kwargs={"subject_id": sub_id})
        )
        self.assertEqual(res.status_code, 200)
        sub.refresh_from_db()
        self.assertTrue(sub.is_active)
        assignment.refresh_from_db()
        self.assertFalse(assignment.is_active)

    def test_subject_superadmin_school_scope_and_validation(self):
        superadmin = User.objects.create_user(
            username="subject_superadmin",
            email="superadmin@subjects.test",
            password=self.password,
            role="superadmin",
        )
        self.client.force_login(superadmin)

        missing_school = self.client.post(
            reverse("quiz_app:api_subjects"),
            data=json.dumps({"subject_name": "Visual Art"}),
            content_type="application/json",
        )
        self.assertEqual(missing_school.status_code, 400)

        created = self.client.post(
            reverse("quiz_app:api_subjects"),
            data=json.dumps({
                "subject_name": "Visual Art",
                "school_id": self.school_b.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(created.status_code, 201, created.json())
        self.assertEqual(created.json()["subject"]["school_id"], self.school_b.pk)

        filtered = self.client.get(
            reverse("quiz_app:api_subjects"), {"school_id": self.school_b.pk}
        )
        self.assertEqual(len(filtered.json()["subjects"]), 1)
        self.assertEqual(filtered.json()["subjects"][0]["school_name"], "Beta High")
        self.assertEqual(
            self.client.get(
                reverse("quiz_app:api_structure_lookups")
            ).json()["schools"][0]["name"],
            "Alpha High",
        )

        self.client.force_login(self.admin_a)
        foreign_department = Department.objects.create(
            name="Beta Department",
            code="BETA",
            school=self.school_b,
        )
        rejected = self.client.post(
            reverse("quiz_app:api_subjects"),
            data=json.dumps({
                "subject_name": "Foreign Department Subject",
                "department_id": foreign_department.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(rejected.status_code, 400)

    def test_subject_legacy_views_always_redirect_to_react(self):
        self.client.force_login(self.admin_a)
        list_url = reverse("quiz_app:subject_list")
        self.assertRedirects(
            self.client.get(list_url),
            "/app/admin/subjects",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(list_url + "?classic=1"),
            "/app/admin/subjects",
            fetch_redirect_response=False,
        )

        create_url = reverse("quiz_app:subject_create")
        self.assertRedirects(
            self.client.get(create_url),
            "/app/admin/subjects",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(create_url + "?classic=1"),
            "/app/admin/subjects",
            fetch_redirect_response=False,
        )

        subject = Subject.objects.create(
            subject_name="Physics",
            school=self.school_a,
        )
        edit_url = reverse("quiz_app:subject_edit", args=[subject.pk])
        self.assertRedirects(
            self.client.get(edit_url),
            "/app/admin/subjects",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(edit_url + "?classic=1"),
            "/app/admin/subjects",
            fetch_redirect_response=False,
        )

    def test_school_settings_get_and_update(self):
        """Admin can get school settings and update parameters."""
        self.client.login(username="admin_a", password=self.password)

        # GET
        res = self.client.get(reverse("quiz_app:api_school_settings"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["school"]["name"], "Alpha High")
        self.assertEqual(data["stats"]["total_students"], 1)
        self.assertIn("report_header", data["school"])
        self.assertIn("report_footer", data["school"])
        self.assertIn("grading_system_description", data["school"])
        self.assertIn("school_stamp_url", data["school"])
        self.assertIn("total_quizzes", data["stats"])

        # PUT
        res = self.client.put(
            reverse("quiz_app:api_school_settings"),
            data=json.dumps({
                "name": "Alpha Academy Pro",
                "short_name": "ALPHAPRO",
                "motto": "Knowledge is Power",
                "email": "info@alphapro.edu",
                "phone_number": "+1234567890",
                "current_academic_year_id": self.year_a1.pk,
                "current_term_id": self.term_a1.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.school_a.refresh_from_db()
        self.assertEqual(self.school_a.name, "Alpha Academy Pro")
        self.assertEqual(self.school_a.motto, "Knowledge is Power")
        self.assertEqual(self.school_a.current_academic_year, self.year_a1)
        self.assertEqual(self.school_a.current_term, self.term_a1)

    def test_school_settings_multipart_update_preserves_all_legacy_fields(self):
        self.client.login(username="admin_a", password=self.password)
        image_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00"
            b"\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDAT"
            b"\x08\xd7c\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x89\x81\x81"
            b"\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        with TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                response = self.client.post(
                    reverse("quiz_app:api_school_settings"),
                    {
                        "name": "Alpha Updated",
                        "short_name": "ALPHA2",
                        "school_code": "ALP02",
                        "address": "New address",
                        "postal_code": "A1",
                        "phone_number": "555-0101",
                        "email": "updated@alpha.test",
                        "website": "https://alpha.test",
                        "motto": "Aim higher",
                        "vision": "A better future",
                        "mission": "Learn every day",
                        "report_header": "Updated report header",
                        "report_footer": "Updated report footer",
                        "grading_system_description": "Updated grading rules",
                        "is_active": "false",
                        "current_academic_year_id": str(self.year_a1.pk),
                        "current_term_id": str(self.term_a1.pk),
                        "logo": SimpleUploadedFile(
                            "school-logo.png", image_bytes, content_type="image/png"
                        ),
                        "school_stamp": SimpleUploadedFile(
                            "school-stamp.png", image_bytes, content_type="image/png"
                        ),
                    },
                )
                self.assertEqual(response.status_code, 200, response.content)
                self.school_a.refresh_from_db()
                self.assertEqual(self.school_a.school_code, "ALP02")
                self.assertEqual(self.school_a.report_header, "Updated report header")
                self.assertEqual(self.school_a.report_footer, "Updated report footer")
                self.assertEqual(
                    self.school_a.grading_system_description, "Updated grading rules"
                )
                self.assertFalse(self.school_a.is_active)
                self.assertTrue(self.school_a.logo.name)
                self.assertTrue(self.school_a.school_stamp.name)
                self.assertEqual(response.json()["school"]["name"], "Alpha Updated")

    def test_school_settings_rejects_cross_school_year_and_term(self):
        self.client.login(username="admin_a", password=self.password)
        other_year = AcademicYear.objects.create(
            name="2027/2028",
            start_date=datetime.date(2027, 9, 1),
            end_date=datetime.date(2028, 7, 1),
            school=self.school_a,
        )
        other_term = Term.objects.create(
            academic_year=other_year,
            term_number=1,
            start_date=datetime.date(2027, 9, 1),
            end_date=datetime.date(2027, 12, 15),
            school=self.school_a,
        )
        response = self.client.put(
            reverse("quiz_app:api_school_settings"),
            data=json.dumps(
                {
                    "name": self.school_a.name,
                    "short_name": self.school_a.short_name,
                    "current_academic_year_id": self.year_a1.pk,
                    "current_term_id": other_term.pk,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_term_id", response.json()["fields"])

        school_b_year = AcademicYear.objects.create(
            name="2026/2027",
            start_date=datetime.date(2026, 9, 1),
            end_date=datetime.date(2027, 7, 1),
            school=self.school_b,
        )
        school_b_term = Term.objects.create(
            academic_year=school_b_year,
            term_number=1,
            start_date=datetime.date(2026, 9, 1),
            end_date=datetime.date(2026, 12, 15),
            school=self.school_b,
        )
        response = self.client.put(
            reverse("quiz_app:api_school_settings"),
            data=json.dumps(
                {
                    "name": self.school_a.name,
                    "short_name": self.school_a.short_name,
                    "current_academic_year_id": school_b_year.pk,
                    "current_term_id": school_b_term.pk,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_academic_year_id", response.json()["fields"])

        response = self.client.put(
            reverse("quiz_app:api_school_settings"),
            data=json.dumps(
                {
                    "name": self.school_a.name,
                    "short_name": self.school_a.short_name,
                    "current_academic_year_id": other_year.pk,
                    "current_term_id": self.term_a1.pk,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("current_term_id", response.json()["fields"])

    def test_school_pages_always_redirect_to_react(self):
        self.client.force_login(self.admin_a)
        self.assertRedirects(
            self.client.get(reverse("quiz_app:school_detail")),
            "/app/admin/school",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(reverse("quiz_app:school_detail") + "?classic=1"),
            "/app/admin/school",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(reverse("quiz_app:school_edit")),
            "/app/admin/school",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(reverse("quiz_app:school_edit") + "?classic=1"),
            "/app/admin/school",
            fetch_redirect_response=False,
        )

    def test_structure_lookups(self):
        """Admin can fetch consolidated dropdown lookups in one call."""
        self.client.login(username="admin_a", password=self.password)

        res = self.client.get(reverse("quiz_app:api_structure_lookups"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("academic_years", data)
        self.assertIn("terms", data)
        self.assertIn("forms", data)
        self.assertIn("learning_areas", data)
        self.assertIn("departments", data)
        self.assertIn("subjects", data)

    def test_authorization_negative_cases(self):
        """Non-admin roles and cross-school requests are forbidden or isolated."""
        # Unauthenticated -> 401
        res = self.client.get(reverse("quiz_app:api_academic_years"))
        self.assertEqual(res.status_code, 401)

        # Student -> 403
        self.client.login(username=self.student_a.username, password=self.password)
        res = self.client.get(reverse("quiz_app:api_academic_years"))
        self.assertEqual(res.status_code, 403)

        # Teacher -> 403
        self.client.login(username=self.teacher_a.username, password=self.password)
        res = self.client.get(reverse("quiz_app:api_classes"))
        self.assertEqual(res.status_code, 403)

        # Cross-School Isolation: Year from School B cannot be updated by Admin of School A
        year_b = AcademicYear.objects.create(
            name="2026/2027 Beta",
            start_date=datetime.date(2026, 9, 1),
            end_date=datetime.date(2027, 7, 1),
            school=self.school_b,
        )
        self.client.login(username="admin_a", password=self.password)
        res = self.client.put(
            reverse("quiz_app:api_academic_year_detail", kwargs={"year_id": year_b.id}),
            data=json.dumps({"name": "Hacked Year"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 404)

    def test_forms_api_supports_crud_and_preserves_student_delete_guard(self):
        self.client.force_login(self.admin_a)
        collection_url = reverse(
            "quiz_app:api_school_structure", kwargs={"resource": "forms"}
        )
        response = self.client.post(
            collection_url,
            data=json.dumps(
                {
                    "form_number": 2,
                    "name": "Form 2",
                    "description": "Second year",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        form_id = response.json()["item"]["id"]
        detail_url = reverse(
            "quiz_app:api_school_structure_detail",
            kwargs={"resource": "forms", "object_id": form_id},
        )

        self.student_profile_a.form = Form.objects.get(pk=form_id)
        self.student_profile_a.save(update_fields=["form"])
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, 400)
        self.assertIn("1 student", response.json()["message"])

        self.student_profile_a.form = None
        self.student_profile_a.save(update_fields=["form"])
        response = self.client.put(
            detail_url,
            data=json.dumps(
                {
                    "form_number": 3,
                    "name": "Form 3",
                    "description": "",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["item"]["form_number"], 3)
        self.assertEqual(self.client.delete(detail_url).status_code, 200)

    def test_learning_area_search_and_cross_school_isolation(self):
        LearningArea.objects.create(
            name="Beta Science", code="BSCI", school=self.school_b
        )
        self.client.force_login(self.admin_a)
        collection_url = reverse(
            "quiz_app:api_school_structure",
            kwargs={"resource": "learning-areas"},
        )
        response = self.client.get(collection_url, {"search": "sci"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.json()["learning_areas"]],
            [self.la_science.pk],
        )

        foreign_item_url = reverse(
            "quiz_app:api_school_structure_detail",
            kwargs={
                "resource": "learning-areas",
                "object_id": LearningArea.objects.get(code="BSCI").pk,
            },
        )
        response = self.client.delete(foreign_item_url)
        self.assertEqual(response.status_code, 404)

        response = self.client.post(
            collection_url,
            data=json.dumps(
                {"name": "Arts", "code": "ART", "description": "Creative studies"}
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        area_id = response.json()["item"]["id"]
        detail_url = reverse(
            "quiz_app:api_school_structure_detail",
            kwargs={"resource": "learning-areas", "object_id": area_id},
        )
        response = self.client.put(
            detail_url,
            data=json.dumps(
                {"name": "Visual Arts", "code": "ART", "description": ""}
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["item"]["name"], "Visual Arts")

        self.student_profile_a.learning_area_id = area_id
        self.student_profile_a.save(update_fields=["learning_area"])
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, 400)
        self.assertIn("1 student", response.json()["message"])
        self.student_profile_a.learning_area = None
        self.student_profile_a.save(update_fields=["learning_area"])
        self.assertEqual(self.client.delete(detail_url).status_code, 200)

    def test_department_api_scopes_head_and_preserves_teacher_delete_guard(self):
        self.client.force_login(self.admin_a)
        collection_url = reverse(
            "quiz_app:api_school_structure",
            kwargs={"resource": "departments"},
        )
        response = self.client.post(
            collection_url,
            data=json.dumps(
                {
                    "name": "Science Department",
                    "code": "SCI",
                    "head_of_department_id": self.teacher_profile_a.pk,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        department_id = response.json()["item"]["id"]
        self.assertEqual(
            response.json()["item"]["head_of_department_id"],
            self.teacher_profile_a.pk,
        )
        foreign_teacher = Teacher.objects.create(
            full_name="Teacher Beta",
            contact_number="3333",
            school=self.school_b,
        )
        detail_url = reverse(
            "quiz_app:api_school_structure_detail",
            kwargs={"resource": "departments", "object_id": response.json()["item"]["id"]},
        )
        response = self.client.put(
            detail_url,
            data=json.dumps(
                {
                    "name": "Science Department",
                    "code": "SCI",
                    "head_of_department_id": foreign_teacher.pk,
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.put(
            detail_url,
            data=json.dumps(
                {
                    "name": "Science Department",
                    "code": "SCI",
                    "head_of_department_id": self.teacher_profile_a.pk,
                    "description": "Updated description",
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.content)

        self.teacher_profile_a.department_id = department_id
        self.teacher_profile_a.save(update_fields=["department"])
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, 400)
        self.assertIn("1 teacher", response.json()["message"])

    def test_superadmin_structure_create_requires_active_target_school(self):
        superadmin = User.objects.create_user(
            username="structure-superadmin",
            email="structure-superadmin@example.test",
            password=self.password,
            role="superadmin",
            full_name="Structure Superadmin",
        )
        self.client.force_login(superadmin)
        collection_url = reverse(
            "quiz_app:api_school_structure", kwargs={"resource": "forms"}
        )
        payload = {"form_number": 8, "name": "Superadmin Form"}
        response = self.client.post(
            collection_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

        payload["school_id"] = "not-a-number"
        response = self.client.post(
            collection_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

        payload["school_id"] = self.school_a.pk
        response = self.client.post(
            collection_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["item"]["school_id"], self.school_a.pk)

        self.school_b.is_active = False
        self.school_b.save(update_fields=["is_active"])
        payload.update({"form_number": 9, "school_id": self.school_b.pk})
        response = self.client.post(
            collection_url,
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_school_structure_routes_always_redirect_to_react(self):
        self.client.force_login(self.admin_a)
        routes = (
            ("form_list", (), "/app/admin/forms"),
            ("form_create", (), "/app/admin/forms"),
            ("form_edit", (self.form_1.pk,), "/app/admin/forms"),
            ("learning_area_list", (), "/app/admin/learning-areas"),
            ("learning_area_create", (), "/app/admin/learning-areas"),
            ("learning_area_edit", (self.la_science.pk,), "/app/admin/learning-areas"),
            ("department_list", (), "/app/admin/departments"),
            ("department_create", (), "/app/admin/departments"),
            ("department_edit", (self.dept_math.pk,), "/app/admin/departments"),
        )

        for route_name, args, destination in routes:
            for query in ({}, {"classic": "1"}):
                with self.subTest(route=route_name, query=query):
                    response = self.client.get(
                        reverse(f"quiz_app:{route_name}", args=args),
                        query,
                    )
                    self.assertRedirects(
                        response,
                        destination,
                        fetch_redirect_response=False,
                    )

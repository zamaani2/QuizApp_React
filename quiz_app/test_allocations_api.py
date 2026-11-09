import json
from django.test import TestCase, Client
from django.urls import reverse
from django.utils import timezone
from datetime import date, timedelta

from quiz_app.models import (
    SchoolInformation,
    User,
    Student,
    Teacher,
    Class,
    AcademicYear,
    Subject,
    ClassSubject,
    StudentClass,
    TeacherSubjectAssignment,
    Department,
    Form,
    LearningArea,
)


class AcademicAllocationsApiTests(TestCase):
    def setUp(self):
        self.client = Client()

        # School 1 (Main)
        self.school = SchoolInformation.objects.create(
            name="Apex Academy",
            short_name="Apex",
            slug="apex-academy",
            school_code="APX001",
            is_active=True,
        )

        # School 2 (Other school for tenant isolation)
        self.other_school = SchoolInformation.objects.create(
            name="Beacon High",
            short_name="Beacon",
            slug="beacon-high",
            school_code="BCN002",
            is_active=True,
        )

        # Admin user
        self.admin_user = User.objects.create_user(
            username="admin_apex",
            email="admin@apex.edu",
            password="adminpassword123",
            role="admin",
            school=self.school,
        )

        # Teachers
        self.teacher = Teacher.objects.create(
            school=self.school,
            staff_id="TCH001",
            full_name="Prof. McGonagall",
            gender="F",
            contact_number="1111",
            is_active=True,
        )
        self.teacher_user = User.objects.get(teacher_profile=self.teacher)

        self.teacher2 = Teacher.objects.create(
            school=self.school,
            staff_id="TCH002",
            full_name="Prof. Flitwick",
            gender="M",
            contact_number="2222",
            is_active=True,
        )
        self.teacher2_user = User.objects.get(teacher_profile=self.teacher2)

        # Students
        self.student1 = Student.objects.create(
            school=self.school,
            admission_number="STD001",
            full_name="Harry Potter",
            gender="M",
            date_of_birth="2010-07-31",
            parent_contact="9991",
            admission_date="2026-01-01",
            is_active=True,
        )
        self.student_user = User.objects.get(student_profile=self.student1)

        self.student2 = Student.objects.create(
            school=self.school,
            admission_number="STD002",
            full_name="Hermione Granger",
            gender="F",
            date_of_birth="2010-09-19",
            parent_contact="9992",
            admission_date="2026-01-01",
            is_active=True,
        )

        self.student3 = Student.objects.create(
            school=self.school,
            admission_number="STD003",
            full_name="Ron Weasley",
            gender="M",
            date_of_birth="2010-03-01",
            parent_contact="9993",
            admission_date="2026-01-01",
            is_active=True,
        )

        # Other School Admin
        self.other_admin = User.objects.create_user(
            username="admin_beacon",
            email="admin@beacon.edu",
            password="adminpassword123",
            role="admin",
            school=self.other_school,
        )

        # Form & Learning Area
        self.form = Form.objects.create(school=self.school, form_number=1, name="Form 1")
        self.learning_area = LearningArea.objects.create(school=self.school, code="STEM", name="Science & Math")

        # Academic Year
        self.academic_year = AcademicYear.objects.create(
            school=self.school,
            name="2026/2027",
            start_date=date(2026, 1, 10),
            end_date=date(2026, 11, 30),
            is_current=True,
        )

        # Classes
        self.class1 = Class.objects.create(
            school=self.school,
            name="Form 1 Alpha",
            class_id="CLS001",
            form=self.form,
            learning_area=self.learning_area,
            academic_year=self.academic_year,
            maximum_students=2,  # Small cap to test capacity limits
            is_active=True,
        )

        self.class2 = Class.objects.create(
            school=self.school,
            name="Form 1 Beta",
            class_id="CLS002",
            form=self.form,
            learning_area=self.learning_area,
            academic_year=self.academic_year,
            maximum_students=50,
            is_active=True,
        )

        # Department & Subjects
        self.dept = Department.objects.create(school=self.school, code="SCI", name="Science")
        self.subject1 = Subject.objects.create(
            school=self.school,
            subject_name="Transfiguration",
            subject_code="TRN101",
            department=self.dept,
            learning_area=self.learning_area,
            is_active=True,
        )
        self.subject2 = Subject.objects.create(
            school=self.school,
            subject_name="Charms",
            subject_code="CHM101",
            department=self.dept,
            learning_area=self.learning_area,
            is_active=True,
        )

        # Map Subject 1 to Class 1 via ClassSubject
        self.cs1 = ClassSubject.objects.create(
            school=self.school,
            subject=self.subject1,
            class_name=self.class1,
            academic_year=self.academic_year,
        )

    def test_enrollments_list_and_create(self):
        """Admin can list and create a single student enrollment."""
        self.client.force_login(self.admin_user)

        # Create enrollment
        res = self.client.post(
            reverse("quiz_app:api_enrollments"),
            data=json.dumps({"student_id": self.student1.id, "class_id": self.class1.id}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["enrollment"]["student_name"], "Harry Potter")
        self.assertEqual(data["enrollment"]["class_name"], "Form 1 Alpha")

        # List enrollments
        res_list = self.client.get(reverse("quiz_app:api_enrollments"))
        self.assertEqual(res_list.status_code, 200)
        list_data = res_list.json()
        self.assertEqual(list_data["count"], 1)
        self.assertEqual(list_data["enrollments"][0]["student_name"], "Harry Potter")

    def test_enrollments_capacity_limit(self):
        """Cannot exceed maximum student capacity of a class."""
        self.client.force_login(self.admin_user)

        # Enroll student 1 & student 2 (cap is 2)
        res1 = self.client.post(
            reverse("quiz_app:api_enrollments"),
            data=json.dumps({"student_id": self.student1.id, "class_id": self.class1.id}),
            content_type="application/json",
        )
        self.assertEqual(res1.status_code, 201)

        res2 = self.client.post(
            reverse("quiz_app:api_enrollments"),
            data=json.dumps({"student_id": self.student2.id, "class_id": self.class1.id}),
            content_type="application/json",
        )
        self.assertEqual(res2.status_code, 201)

        # Third enrollment must fail due to capacity limit
        res3 = self.client.post(
            reverse("quiz_app:api_enrollments"),
            data=json.dumps({"student_id": self.student3.id, "class_id": self.class1.id}),
            content_type="application/json",
        )
        self.assertEqual(res3.status_code, 400)
        self.assertIn("capacity", res3.json()["message"].lower())

    def test_enrollments_bulk_create(self):
        """Admin can bulk enroll students into a class."""
        self.client.force_login(self.admin_user)

        res = self.client.post(
            reverse("quiz_app:api_enrollments_bulk"),
            data=json.dumps({
                "class_id": self.class2.id,
                "student_ids": [self.student1.id, self.student2.id, self.student3.id],
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["enrolled_count"], 3)

        # Verify in DB
        self.assertEqual(StudentClass.objects.filter(assigned_class=self.class2, is_active=True).count(), 3)

    def test_enrollment_update_and_delete(self):
        """Admin can transfer enrollment to another class and delete/unenroll."""
        self.client.force_login(self.admin_user)

        # Create enrollment
        enr = StudentClass.objects.create(
            student=self.student1,
            assigned_class=self.class1,
            is_active=True,
            school=self.school,
        )

        # Update / transfer to Class 2
        res = self.client.put(
            reverse("quiz_app:api_enrollment_detail", args=[enr.id]),
            data=json.dumps({"class_id": self.class2.id}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        enr.refresh_from_db()
        self.assertFalse(enr.is_active)
        self.assertEqual(enr.assigned_class_id, self.class1.id)
        transferred_enrollment = StudentClass.objects.get(
            pk=res.json()["enrollment"]["id"]
        )
        self.assertEqual(transferred_enrollment.assigned_class_id, self.class2.id)
        self.assertTrue(transferred_enrollment.is_active)

        # Delete/unassign keeps the historical record.
        res_del = self.client.delete(
            reverse("quiz_app:api_enrollment_detail", args=[transferred_enrollment.id])
        )
        self.assertEqual(res_del.status_code, 200)
        transferred_enrollment.refresh_from_db()
        self.assertFalse(transferred_enrollment.is_active)

    def test_bulk_unassignment_preserves_history_and_checks_superadmin_school(self):
        self.client.force_login(self.admin_user)
        enrollment = StudentClass.objects.create(
            student=self.student1,
            assigned_class=self.class1,
            is_active=True,
            school=self.school,
        )
        response = self.client.post(
            reverse("quiz_app:api_enrollments_bulk_delete"),
            data=json.dumps({"enrollment_ids": [enrollment.pk]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        enrollment.refresh_from_db()
        self.assertFalse(enrollment.is_active)
        self.assertEqual(response.json()["unassigned_count"], 1)

        superadmin = User.objects.create_user(
            username="enrollment_superadmin",
            email="superadmin@enrollment.test",
            password="test-password",
            role="superadmin",
        )
        superadmin_enrollment = StudentClass.objects.create(
            student=self.student2,
            assigned_class=self.class1,
            is_active=True,
            school=self.school,
        )
        self.client.force_login(superadmin)
        response = self.client.post(
            reverse("quiz_app:api_enrollments_bulk_delete"),
            data=json.dumps({"enrollment_ids": [superadmin_enrollment.pk]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            reverse("quiz_app:api_enrollments_bulk_delete"),
            data=json.dumps({
                "enrollment_ids": [superadmin_enrollment.pk],
                "target_school_id": self.other_school.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            reverse("quiz_app:api_enrollments_bulk_delete"),
            data=json.dumps({
                "enrollment_ids": [superadmin_enrollment.pk],
                "target_school_id": self.school.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        superadmin_enrollment.refresh_from_db()
        self.assertFalse(superadmin_enrollment.is_active)

    def test_cross_academic_year_enrollment_is_rejected(self):
        self.client.force_login(self.admin_user)
        StudentClass.objects.create(
            student=self.student1,
            assigned_class=self.class1,
            is_active=True,
            school=self.school,
        )
        next_year = AcademicYear.objects.create(
            school=self.school,
            name="2027/2028",
            start_date=date(2027, 1, 10),
            end_date=date(2027, 11, 30),
            is_current=False,
        )
        next_class = Class.objects.create(
            school=self.school,
            name="Form 2 Alpha",
            class_id="CLS003",
            form=self.form,
            learning_area=self.learning_area,
            academic_year=next_year,
            maximum_students=40,
            is_active=True,
        )
        response = self.client.post(
            reverse("quiz_app:api_enrollments"),
            data=json.dumps({
                "student_id": self.student1.pk,
                "class_id": next_class.pk,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Cross-year promotion", response.json()["message"])
        self.assertTrue(
            StudentClass.objects.get(
                student=self.student1, is_active=True
            ).assigned_class_id == self.class1.pk
        )

    def test_bulk_enrollment_returns_partial_cross_year_results(self):
        self.client.force_login(self.admin_user)
        previous_enrollment = StudentClass.objects.create(
            student=self.student1,
            assigned_class=self.class1,
            is_active=True,
            school=self.school,
        )
        next_year = AcademicYear.objects.create(
            school=self.school,
            name="2027/2028",
            start_date=date(2027, 1, 10),
            end_date=date(2027, 11, 30),
            is_current=False,
        )
        next_class = Class.objects.create(
            school=self.school,
            name="Form 2 Alpha",
            class_id="CLS003",
            form=self.form,
            learning_area=self.learning_area,
            academic_year=next_year,
            maximum_students=40,
            is_active=True,
        )
        response = self.client.post(
            reverse("quiz_app:api_enrollments_bulk"),
            data=json.dumps({
                "class_id": next_class.pk,
                "student_ids": [self.student1.pk, self.student2.pk],
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["created"], 1)
        self.assertEqual(response.json()["error_count"], 1)
        self.assertIn("Cross-year promotion", response.json()["errors"][0])
        previous_enrollment.refresh_from_db()
        self.assertTrue(previous_enrollment.is_active)
        self.assertTrue(
            StudentClass.objects.filter(
                student=self.student2,
                assigned_class=next_class,
                is_active=True,
            ).exists()
        )

    def test_enrollment_views_always_redirect_to_react(self):
        self.client.force_login(self.admin_user)
        list_url = reverse("quiz_app:enrollment_list")
        response = self.client.get(list_url)
        self.assertRedirects(
            response,
            "/app/admin/enrollments",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(list_url + "?classic=1"),
            "/app/admin/enrollments",
            fetch_redirect_response=False,
        )
        for route_name in ("enrollment_create", "enrollment_bulk_create"):
            route_url = reverse(f"quiz_app:{route_name}")
            response = self.client.get(route_url)
            self.assertRedirects(
                response,
                "/app/admin/enrollments",
                fetch_redirect_response=False,
            )
            self.assertRedirects(
                self.client.get(route_url + "?classic=1"),
                "/app/admin/enrollments",
                fetch_redirect_response=False,
            )

        enrollment = StudentClass.objects.create(
            student=self.student1,
            assigned_class=self.class1,
            is_active=True,
            school=self.school,
        )
        edit_url = reverse(
            "quiz_app:enrollment_edit", args=[enrollment.pk]
        )
        self.assertRedirects(
            self.client.get(edit_url),
            "/app/admin/enrollments",
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            self.client.get(edit_url + "?classic=1"),
            "/app/admin/enrollments",
            fetch_redirect_response=False,
        )

    def test_enrollments_lookups(self):
        """Lookups endpoint returns active classes and students."""
        self.client.force_login(self.admin_user)

        res = self.client.get(reverse("quiz_app:api_enrollments_lookups"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("classes", data)
        self.assertIn("students", data)
        self.assertTrue(len(data["classes"]) >= 2)
        self.assertTrue(len(data["students"]) >= 3)

    def test_teacher_assignments_list_and_create(self):
        """Admin can assign a teacher to a subject and class."""
        self.client.force_login(self.admin_user)

        res = self.client.post(
            reverse("quiz_app:api_teacher_assignments"),
            data=json.dumps({
                "teacher_id": self.teacher.id,
                "subject_id": self.subject1.id,
                "class_id": self.class1.id,
                "academic_year_id": self.academic_year.id,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["assignment"]["teacher_name"], "Prof. McGonagall")

        # List assignments
        res_list = self.client.get(reverse("quiz_app:api_teacher_assignments"))
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(res_list.json()["count"], 1)

    def test_teacher_assignment_requires_class_subject(self):
        """Fails if subject is not mapped to class via ClassSubject."""
        self.client.force_login(self.admin_user)

        # Subject 2 is NOT mapped to Class 1
        res = self.client.post(
            reverse("quiz_app:api_teacher_assignments"),
            data=json.dumps({
                "teacher_id": self.teacher.id,
                "subject_id": self.subject2.id,
                "class_id": self.class1.id,
                "academic_year_id": self.academic_year.id,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("not assigned to class", res.json()["message"].lower())

    def test_teacher_assignment_reassign(self):
        """Assigning a new teacher to an existing assignment tracks previous teacher."""
        self.client.force_login(self.admin_user)

        # Initial assignment
        tsa = TeacherSubjectAssignment.objects.create(
            teacher=self.teacher,
            subject=self.subject1,
            class_assigned=self.class1,
            academic_year=self.academic_year,
            is_active=True,
            school=self.school,
        )

        # Reassign to teacher 2
        res = self.client.post(
            reverse("quiz_app:api_teacher_assignments"),
            data=json.dumps({
                "teacher_id": self.teacher2.id,
                "subject_id": self.subject1.id,
                "class_id": self.class1.id,
                "academic_year_id": self.academic_year.id,
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 201)
        tsa.refresh_from_db()
        self.assertEqual(tsa.teacher_id, self.teacher2.id)
        self.assertEqual(tsa.previous_teacher_id, self.teacher.id)

    def test_teacher_assignment_class_subjects(self):
        """Returns subjects mapped to a specific class."""
        self.client.force_login(self.admin_user)

        res = self.client.get(
            reverse("quiz_app:api_teacher_assignment_class_subjects"),
            {"class_id": self.class1.id, "academic_year_id": self.academic_year.id},
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["subjects"]), 1)
        self.assertEqual(data["subjects"][0]["subject_code"], "TRN101")

    def test_authorization_negative_cases(self):
        """Students and teachers are rejected with 403 Forbidden."""
        self.client.force_login(self.student_user)
        res_stud = self.client.get(reverse("quiz_app:api_enrollments"))
        self.assertEqual(res_stud.status_code, 403)

        self.client.force_login(self.teacher_user)
        res_teach = self.client.get(reverse("quiz_app:api_teacher_assignments"))
        self.assertEqual(res_teach.status_code, 403)

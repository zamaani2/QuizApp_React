from django.test import TestCase, Client
from django.urls import reverse
from quiz_app.models import SchoolInformation, User, Student, Teacher, AcademicYear, Term, Class


class AuthCoreShellTests(TestCase):
    def test_auth_core_shell_is_public_and_supplies_csrf_token(self):
        response = self.client.get('/auth-app/')
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'auth_core_app.html')
        self.assertContains(response, 'id="auth-core-root"')
        self.assertContains(response, 'name="csrf-token"')
        self.assertContains(response, 'react/assets/auth-core.js')
        self.assertIn('csrftoken', response.cookies)


class Phase6IntegrationTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Create School
        self.school = SchoolInformation.objects.create(
            name="Integration High",
            short_name="INTEG",
            slug="integration-high",
            school_code="INT001",
            is_active=True
        )

        # Create Academic Year and Term
        self.academic_year = AcademicYear.objects.create(
            school=self.school,
            name="2026/2027",
            start_date="2026-09-01",
            end_date="2027-07-01",
            is_current=True
        )
        self.term = Term.objects.create(
            school=self.school,
            academic_year=self.academic_year,
            term_number=1,
            start_date="2026-09-01",
            end_date="2026-12-15",
            is_current=True
        )

        # Create Superadmin
        self.superadmin = User.objects.create_superuser(
            username="super1",
            email="super1@test.com",
            password="testpassword123",
            role="superadmin",
            full_name="Super Admin"
        )

        # Create Admin
        self.admin = User.objects.create_user(
            username="admin1",
            email="admin1@test.com",
            password="testpassword123",
            role="admin",
            full_name="Admin User",
            school=self.school
        )

        # Create Teacher
        self.teacher_profile = Teacher.objects.create(
            full_name="Teacher One",
            contact_number="1234567890",
            school=self.school
        )
        self.teacher_user = User.objects.get(teacher_profile=self.teacher_profile)
        self.teacher_user.set_password("testpassword123")
        self.teacher_user.school = self.school
        self.teacher_user.save()

        # Create Student
        self.student_profile = Student.objects.create(
            admission_number="ADM-INT-001",
            full_name="Student One",
            date_of_birth="2010-01-01",
            gender="M",
            parent_contact="0987654321",
            admission_date="2026-01-01",
            school=self.school,
        )
        self.student_user = User.objects.get(student_profile=self.student_profile)
        self.student_user.set_password("testpassword123")
        self.student_user.school = self.school
        self.student_user.save()

    def test_unauthenticated_react_shell_redirects_to_login(self):
        """Unauthenticated requests to /app/ should redirect to /login/?next=/app/"""
        res = self.client.get('/app/')
        self.assertEqual(res.status_code, 302)
        self.assertIn('/login/', res.url)

    def test_authenticated_admin_can_access_react_shell(self):
        """Authenticated admin can load the React SPA shell at /app/"""
        self.client.login(username="admin1", password="testpassword123")
        res = self.client.get('/app/')
        self.assertEqual(res.status_code, 200)
        self.assertTemplateUsed(res, 'react_app.html')
        self.assertContains(res, '<div id="root">')
        self.assertIn('csrftoken', res.cookies)

    def test_authenticated_teacher_can_access_react_shell(self):
        """Authenticated teacher can load the React SPA shell at /app/teacher/dashboard"""
        self.client.login(username=self.teacher_user.username, password="testpassword123")
        res = self.client.get('/app/teacher/dashboard')
        self.assertEqual(res.status_code, 200)
        self.assertTemplateUsed(res, 'react_app.html')

    def test_authenticated_student_can_access_react_shell(self):
        """Authenticated student can load the React SPA shell at /app/student/dashboard"""
        self.client.login(username=self.student_user.username, password="testpassword123")
        res = self.client.get('/app/student/dashboard')
        self.assertEqual(res.status_code, 200)
        self.assertTemplateUsed(res, 'react_app.html')

    def test_authenticated_superadmin_can_access_react_shell(self):
        """Authenticated superadmin can load the React SPA shell at /app/superadmin/schools"""
        self.client.login(username="super1", password="testpassword123")
        res = self.client.get('/app/superadmin/schools')
        self.assertEqual(res.status_code, 200)
        self.assertTemplateUsed(res, 'react_app.html')

    def test_role_based_scoping_student_cannot_call_admin_api(self):
        """Student role must receive 403 Forbidden when calling admin API"""
        self.client.login(username=self.student_user.username, password="testpassword123")
        res = self.client.get('/api/v1/dashboard/admin/')
        self.assertEqual(res.status_code, 403)
        data = res.json()
        self.assertEqual(data.get('code'), 'FORBIDDEN')

    def test_role_based_scoping_student_cannot_call_teacher_api(self):
        """Student role must receive 403 Forbidden when calling teacher API"""
        self.client.login(username=self.student_user.username, password="testpassword123")
        res = self.client.get('/api/v1/dashboard/teacher/')
        self.assertEqual(res.status_code, 403)

    def test_role_based_scoping_teacher_cannot_call_admin_api(self):
        """Teacher role must receive 403 Forbidden when calling admin API"""
        self.client.login(username=self.teacher_user.username, password="testpassword123")
        res = self.client.get('/api/v1/dashboard/admin/')
        self.assertEqual(res.status_code, 403)

    def test_role_based_scoping_admin_cannot_call_superadmin_api(self):
        """Admin role must receive 403 Forbidden when calling superadmin API"""
        self.client.login(username="admin1", password="testpassword123")
        res = self.client.get('/api/v1/superadmin/schools/')
        self.assertEqual(res.status_code, 403)

    def test_admin_dashboard_redirects_to_react_app(self):
        self.client.login(username="admin1", password="testpassword123")
        res = self.client.get(reverse('quiz_app:admin_dashboard'))
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, '/app/admin/dashboard')

    def test_teacher_dashboard_redirects_to_react_app(self):
        self.client.login(username=self.teacher_user.username, password="testpassword123")
        res = self.client.get(reverse('quiz_app:teacher_dashboard'))
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, '/app/teacher/dashboard')

    def test_student_dashboard_redirects_to_react_app(self):
        self.client.login(username=self.student_user.username, password="testpassword123")
        res = self.client.get(reverse('quiz_app:student_dashboard'))
        self.assertEqual(res.status_code, 302)
        self.assertEqual(res.url, '/app/student/dashboard')

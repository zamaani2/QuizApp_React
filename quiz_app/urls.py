"""
URL configuration for quiz_app.

This module defines all URL patterns for the quiz application,
including authentication, dashboards, and other features.
"""
from functools import wraps

from django.urls import path
from django.shortcuts import redirect
from .api_views import (
    me_api_view,
    react_app_shell_view,
    auth_core_shell_view,
    superadmin_dashboard_api_view,
    superadmin_schools_api_view,
    superadmin_school_detail_api_view,
    superadmin_admins_api_view,
    superadmin_admin_detail_api_view,
    admin_dashboard_api_view,
    teacher_dashboard_api_view,
    teacher_quiz_form_options_api_view,
    teacher_results_api_view,
    teacher_result_detail_api_view,
    teacher_grading_api_view,
    student_dashboard_api_view,
    student_quizzes_api_view,
    student_quiz_detail_api_view,
    student_quiz_start_api_view,
    student_quiz_take_api_view,
    student_quiz_save_api_view,
    student_quiz_section_submit_api_view,
    student_quiz_submit_api_view,
    student_attempts_api_view,
    student_quiz_result_api_view,
    student_profile_api_view,
    academic_years_api_view,
    academic_year_detail_api_view,
    academic_year_set_current_api_view,
    terms_api_view,
    term_detail_api_view,
    term_set_current_api_view,
    classes_api_view,
    class_detail_api_view,
    class_restore_api_view,
    class_subject_add_api_view,
    class_subject_remove_api_view,
    subjects_api_view,
    subject_detail_api_view,
    subject_restore_api_view,
    school_settings_api_view,
    structure_lookups_api_view,
    school_structure_api_view,
    school_structure_detail_api_view,
    enrollments_api_view,
    enrollments_bulk_api_view,
    enrollment_detail_api_view,
    enrollments_bulk_delete_api_view,
    enrollments_lookups_api_view,
    teacher_assignments_api_view,
    teacher_assignments_bulk_api_view,
    teacher_assignment_detail_api_view,
    teacher_assignments_lookups_api_view,
    teacher_assignment_class_subjects_api_view,
)
from .results_export_api import teacher_results_export_api_view
from .account_api_views import change_password_api_view
from .directory_api_views import (
    students_collection_api_view,
    teachers_collection_api_view,
    users_collection_api_view,
    student_archive_api_view,
    student_restore_api_view,
    student_bulk_archive_api_view,
    student_import_preview_api_view,
    student_import_api_view,
    teacher_archive_api_view,
    teacher_restore_api_view,
    teacher_bulk_archive_api_view,
    teacher_import_preview_api_view,
    teacher_import_api_view,
    teacher_export_api_view,
    user_write_api_view,
    user_delete_api_view,
    user_detail_api_view,
    user_bulk_password_reset_api_view,
    student_write_api_view,
    teacher_write_api_view,
)
from .assessment_api_views import (
    teacher_quizzes_collection_api_view,
    teacher_quiz_detail_write_api_view,
    teacher_quiz_status_api_view,
    teacher_quiz_results_release_api_view,
    teacher_question_create_api_view,
    teacher_question_detail_api_view,
    teacher_question_duplicate_api_view,
    teacher_question_reorder_api_view,
    teacher_question_assignment_api_view,
    teacher_question_bulk_delete_api_view,
    teacher_quiz_sections_api_view,
    teacher_quiz_section_detail_api_view,
    teacher_quiz_sections_reorder_api_view,
    teacher_quiz_groups_api_view,
    teacher_quiz_groups_reorder_api_view,
    teacher_quiz_group_detail_api_view,
    teacher_question_import_api_view,
    teacher_quiz_assignments_write_api_view,
    teacher_quiz_assignment_delete_api_view,
    teacher_quiz_assignment_bulk_delete_api_view,
    teacher_quiz_assignment_set_api_view,
    teacher_grading_detail_write_api_view,
    teacher_grading_bulk_api_view,
    teacher_response_grade_api_view,
)
from .views import (
    login_view,
    logout_view,
    password_reset_view,
    password_reset_done_view,
    password_reset_confirm_view,
    password_reset_complete_view,
    dashboard_view,
    admin_dashboard_view,
    teacher_dashboard_view,
    student_dashboard_view,
    extend_session_view,
    superadmin_login_view,
    superadmin_logout_view,
    superadmin_dashboard_view,
    superadmin_school_list_view,
    superadmin_school_create_view,
    superadmin_school_edit_view,
    superadmin_school_delete_view,
    superadmin_school_detail_view,
    superadmin_admin_list_view,
    superadmin_admin_create_view,
    superadmin_admin_edit_view,
    superadmin_admin_delete_view,
    superadmin_admin_detail_view,
    student_list_view,
    student_create_view,
    student_edit_view,
    student_delete_view,
    student_restore_view,
    student_bulk_delete_view,
    student_bulk_import_view,
    student_bulk_import_preview_headers_view,
    student_bulk_import_template_view,
    student_bulk_import_template_xlsx_view,
    student_export_view,
    student_detail_view,
    student_profile_view,
    student_enrollment_list_view,
    student_enrollment_create_view,
    student_enrollment_bulk_create_view,
    student_enrollment_edit_view,
    student_enrollment_delete_view,
    student_enrollment_bulk_delete_view,
    academic_year_list_view,
    academic_year_create_view,
    academic_year_edit_view,
    academic_year_delete_view,
    academic_year_set_current_view,
    term_list_view,
    term_create_view,
    term_edit_view,
    term_delete_view,
    term_set_current_view,
    form_list_view,
    form_create_view,
    form_edit_view,
    form_delete_view,
    learning_area_list_view,
    learning_area_create_view,
    learning_area_edit_view,
    learning_area_delete_view,
    department_list_view,
    department_create_view,
    department_edit_view,
    department_delete_view,
    subject_list_view,
    subject_create_view,
    subject_edit_view,
    subject_delete_view,
    subject_restore_view,
    class_list_view,
    class_create_view,
    class_edit_view,
    class_delete_view,
    class_restore_view,
    class_detail_view,
    class_subject_add_view,
    class_subject_remove_view,
    teacher_list_view,
    teacher_create_view,
    teacher_edit_view,
    teacher_delete_view,
    teacher_restore_view,
    teacher_bulk_delete_view,
    teacher_bulk_import_view,
    teacher_bulk_import_preview_view,
    teacher_bulk_import_template_view,
    teacher_export_view,
    teacher_detail_view,
    teacher_profile_view,
    assignment_list_view,
    assignment_create_view,
    assignment_bulk_create_view,
    assignment_edit_view,
    assignment_delete_view,
    get_class_subjects_view,
    school_edit_view,
    school_delete_view,
    school_detail_view,
    user_list_view,
    user_create_view,
    user_edit_view,
    user_delete_view,
    user_bulk_password_reset_view,
    quiz_list_view,
    quiz_create_view,
    quiz_edit_view,
    quiz_delete_view,
    quiz_detail_view,
    quiz_update_status_view,
    get_terms_for_academic_year_view,
    question_list_view,
    question_create_view,
    question_edit_view,
    question_delete_view,
    question_reorder_view,
    question_duplicate_view,
    question_bulk_import_view,
    question_import_template_view,
    question_bulk_delete_view,
    quiz_assignment_overview_view,
    quiz_assignment_list_view,
    quiz_assignment_create_view,
    quiz_assignment_delete_view,
    quiz_assignment_bulk_delete_view,
    class_quiz_list_view,
    quiz_grading_list_view,
    quiz_attempt_grading_view,
    quiz_response_grade_view,
    quiz_attempt_bulk_grade_view,
    quiz_results_list_view,
    quiz_result_detail_view,
    quiz_result_print_view,
    quiz_results_export_view,
    quiz_results_bulk_print_view,
    student_quiz_list_view,
    student_quiz_detail_view,
    student_quiz_start_view,
    student_quiz_resume_view,
    student_quiz_take_view,
    student_quiz_save_view,
    student_quiz_submit_view,
    student_quiz_attempts_view,
    student_quiz_result_detail_view,
    student_quiz_result_print_view,
)

app_name = "quiz_app"


def react_owned_page(view, destination):
    """Keep retired Django page URLs usable by sending GETs to React."""
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if request.method in {"GET", "HEAD"}:
            if not request.user.is_authenticated:
                return redirect(f"/?{urlencode({'next': request.path})}")
            target = (
                destination(request)
                if callable(destination)
                else destination.format(**kwargs)
            )
            return redirect(target)
        return view(request, *args, **kwargs)

    wrapped.react_destination = destination
    return wrapped


def dashboard_destination(request):
    return {
        "superadmin": "/app/superadmin/dashboard",
        "teacher": "/app/teacher/dashboard",
        "student": "/app/student/dashboard",
    }.get(request.user.role, "/app/admin/dashboard")


def app_entry_view(request):
    if request.user.is_authenticated:
        return redirect(dashboard_destination(request))
    return auth_core_shell_view(request)


def auth_app_legacy_redirect(request, subpath=""):
    query = request.GET.urlencode()
    return redirect(f"/?{query}" if query else "/")


urlpatterns = [
    # Authentication URLs (School Users)
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("password-reset/", password_reset_view, name="password_reset"),
    path("password-reset/done/", password_reset_done_view, name="password_reset_done"),
    path(
        "password-reset/<uidb64>/<token>/",
        password_reset_confirm_view,
        name="password_reset_confirm",
    ),
    path(
        "password-reset/complete/",
        password_reset_complete_view,
        name="password_reset_complete",
    ),
    
    # Superadmin Authentication URLs
    path("superadmin/login/", superadmin_login_view, name="superadmin_login"),
    path("superadmin/logout/", superadmin_logout_view, name="superadmin_logout"),
    
    # Dashboard URLs
    path("", app_entry_view, name="dashboard"),
    path("dashboard/", react_owned_page(dashboard_view, dashboard_destination), name="dashboard"),
    # Changed from admin/dashboard/ to dashboard/admin/ to avoid conflict with Django admin
    path("dashboard/admin/", react_owned_page(admin_dashboard_view, "/app/admin/dashboard"), name="admin_dashboard"),
    path("dashboard/teacher/", react_owned_page(teacher_dashboard_view, "/app/teacher/dashboard"), name="teacher_dashboard"),
    path("dashboard/student/", react_owned_page(student_dashboard_view, "/app/student/dashboard"), name="student_dashboard"),
    
    # Superadmin Dashboard
    path("superadmin/dashboard/", react_owned_page(superadmin_dashboard_view, "/app/superadmin/dashboard"), name="superadmin_dashboard"),
    
    # Session management
    path("extend-session/", react_owned_page(extend_session_view, dashboard_destination), name="extend_session"),
    
    # Student Management URLs
    path("students/", react_owned_page(student_list_view, "/app/admin/students"), name="student_list"),
    path("students/create/", react_owned_page(student_create_view, "/app/admin/students"), name="student_create"),
    path("students/<int:student_id>/edit/", react_owned_page(student_edit_view, "/app/admin/students"), name="student_edit"),
    path("students/<int:student_id>/delete/", react_owned_page(student_delete_view, "/app/admin/students"), name="student_delete"),
    path("students/<int:student_id>/restore/", react_owned_page(student_restore_view, "/app/admin/students"), name="student_restore"),
    path("students/<int:student_id>/detail/", react_owned_page(student_detail_view, "/app/admin/students"), name="student_detail"),
    path("students/profile/", react_owned_page(student_profile_view, "/app/student/profile"), name="student_profile"),
    path("students/bulk-import/", react_owned_page(student_bulk_import_view, "/app/admin/students"), name="student_bulk_import"),
    path("students/bulk-import/template/", student_bulk_import_template_view, name="student_bulk_import_template"),
    path("students/bulk-import/template-xlsx/", student_bulk_import_template_xlsx_view, name="student_bulk_import_template_xlsx"),
    path("students/bulk-import/preview-headers/", react_owned_page(student_bulk_import_preview_headers_view, "/app/admin/students"), name="student_bulk_import_preview_headers"),
    path("students/export/<str:format_type>/", student_export_view, name="student_export"),
    path("students/bulk-delete/", react_owned_page(student_bulk_delete_view, "/app/admin/students"), name="student_bulk_delete"),
    
    # Student Class Enrollment Management URLs
    path("enrollments/", react_owned_page(student_enrollment_list_view, "/app/admin/enrollments"), name="enrollment_list"),
    path("enrollments/create/", react_owned_page(student_enrollment_create_view, "/app/admin/enrollments"), name="enrollment_create"),
    path("enrollments/bulk-create/", react_owned_page(student_enrollment_bulk_create_view, "/app/admin/enrollments"), name="enrollment_bulk_create"),
    path("enrollments/<int:enrollment_id>/edit/", react_owned_page(student_enrollment_edit_view, "/app/admin/enrollments"), name="enrollment_edit"),
    path("enrollments/<int:enrollment_id>/delete/", react_owned_page(student_enrollment_delete_view, "/app/admin/enrollments"), name="enrollment_delete"),
    path("enrollments/bulk-delete/", react_owned_page(student_enrollment_bulk_delete_view, "/app/admin/enrollments"), name="enrollment_bulk_delete"),
    
    # Academic Year Management URLs
    path("academic-years/", react_owned_page(academic_year_list_view, "/app/admin/academic-years"), name="academic_year_list"),
    path("academic-years/create/", react_owned_page(academic_year_create_view, "/app/admin/academic-years"), name="academic_year_create"),
    path("academic-years/<int:academic_year_id>/edit/", react_owned_page(academic_year_edit_view, "/app/admin/academic-years"), name="academic_year_edit"),
    path("academic-years/<int:academic_year_id>/delete/", react_owned_page(academic_year_delete_view, "/app/admin/academic-years"), name="academic_year_delete"),
    path("academic-years/<int:academic_year_id>/set-current/", react_owned_page(academic_year_set_current_view, "/app/admin/academic-years"), name="academic_year_set_current"),
    
    # Term Management URLs
    path("terms/", react_owned_page(term_list_view, "/app/admin/terms"), name="term_list"),
    path("terms/create/", react_owned_page(term_create_view, "/app/admin/terms"), name="term_create"),
    path("terms/<int:term_id>/edit/", react_owned_page(term_edit_view, "/app/admin/terms"), name="term_edit"),
    path("terms/<int:term_id>/delete/", react_owned_page(term_delete_view, "/app/admin/terms"), name="term_delete"),
    path("terms/<int:term_id>/set-current/", react_owned_page(term_set_current_view, "/app/admin/terms"), name="term_set_current"),
    
    # Form Management URLs
    path("forms/", react_owned_page(form_list_view, "/app/admin/forms"), name="form_list"),
    path("forms/create/", react_owned_page(form_create_view, "/app/admin/forms"), name="form_create"),
    path("forms/<int:form_id>/edit/", react_owned_page(form_edit_view, "/app/admin/forms"), name="form_edit"),
    path("forms/<int:form_id>/delete/", react_owned_page(form_delete_view, "/app/admin/forms"), name="form_delete"),
    
    # Learning Area Management URLs
    path("learning-areas/", react_owned_page(learning_area_list_view, "/app/admin/learning-areas"), name="learning_area_list"),
    path("learning-areas/create/", react_owned_page(learning_area_create_view, "/app/admin/learning-areas"), name="learning_area_create"),
    path("learning-areas/<int:learning_area_id>/edit/", react_owned_page(learning_area_edit_view, "/app/admin/learning-areas"), name="learning_area_edit"),
    path("learning-areas/<int:learning_area_id>/delete/", react_owned_page(learning_area_delete_view, "/app/admin/learning-areas"), name="learning_area_delete"),
    
    # Department Management URLs
    path("departments/", react_owned_page(department_list_view, "/app/admin/departments"), name="department_list"),
    path("departments/create/", react_owned_page(department_create_view, "/app/admin/departments"), name="department_create"),
    path("departments/<int:department_id>/edit/", react_owned_page(department_edit_view, "/app/admin/departments"), name="department_edit"),
    path("departments/<int:department_id>/delete/", react_owned_page(department_delete_view, "/app/admin/departments"), name="department_delete"),
    
    # Subject Management URLs
    path("subjects/", react_owned_page(subject_list_view, "/app/admin/subjects"), name="subject_list"),
    path("subjects/create/", react_owned_page(subject_create_view, "/app/admin/subjects"), name="subject_create"),
    path("subjects/<int:subject_id>/edit/", react_owned_page(subject_edit_view, "/app/admin/subjects"), name="subject_edit"),
    path("subjects/<int:subject_id>/delete/", react_owned_page(subject_delete_view, "/app/admin/subjects"), name="subject_delete"),
    path("subjects/<int:subject_id>/restore/", react_owned_page(subject_restore_view, "/app/admin/subjects"), name="subject_restore"),
    
    # Class Management URLs
    path("classes/", react_owned_page(class_list_view, "/app/admin/classes"), name="class_list"),
    path("classes/create/", react_owned_page(class_create_view, "/app/admin/classes"), name="class_create"),
    path("classes/<int:class_id>/edit/", react_owned_page(class_edit_view, "/app/admin/classes"), name="class_edit"),
    path("classes/<int:class_id>/delete/", react_owned_page(class_delete_view, "/app/admin/classes"), name="class_delete"),
    path("classes/<int:class_id>/restore/", react_owned_page(class_restore_view, "/app/admin/classes"), name="class_restore"),
    path("classes/<int:class_id>/detail/", react_owned_page(class_detail_view, "/app/admin/classes/{class_id}"), name="class_detail"),
    path("classes/<int:class_id>/subjects/add/", react_owned_page(class_subject_add_view, "/app/admin/classes/{class_id}"), name="class_subject_add"),
    path("classes/<int:class_id>/subjects/<int:class_subject_id>/remove/", react_owned_page(class_subject_remove_view, "/app/admin/classes/{class_id}"), name="class_subject_remove"),
    
    # Teacher Management URLs
    path("teachers/", react_owned_page(teacher_list_view, "/app/admin/teachers"), name="teacher_list"),
    path("teachers/create/", react_owned_page(teacher_create_view, "/app/admin/teachers"), name="teacher_create"),
    path("teachers/<int:teacher_id>/edit/", react_owned_page(teacher_edit_view, "/app/admin/teachers"), name="teacher_edit"),
    path("teachers/<int:teacher_id>/delete/", react_owned_page(teacher_delete_view, "/app/admin/teachers"), name="teacher_delete"),
    path("teachers/<int:teacher_id>/restore/", react_owned_page(teacher_restore_view, "/app/admin/teachers"), name="teacher_restore"),
    path("teachers/<int:teacher_id>/detail/", react_owned_page(teacher_detail_view, "/app/admin/teachers"), name="teacher_detail"),
    path("teachers/profile/", react_owned_page(teacher_profile_view, "/app/teacher/profile"), name="teacher_profile"),
    path("teachers/bulk-import/", react_owned_page(teacher_bulk_import_view, "/app/admin/teachers"), name="teacher_bulk_import"),
    path("teachers/bulk-import/preview/", react_owned_page(teacher_bulk_import_preview_view, "/app/admin/teachers"), name="teacher_bulk_import_preview"),
    path(
        "teachers/bulk-import/template/<str:format_type>/",
        teacher_bulk_import_template_view,
        name="teacher_bulk_import_template",
    ),
    path("teachers/export/<str:format_type>/", teacher_export_view, name="teacher_export"),
    path("teachers/bulk-delete/", react_owned_page(teacher_bulk_delete_view, "/app/admin/teachers"), name="teacher_bulk_delete"),
    
    # Teacher Subject Assignment Management URLs
    path("assignments/", react_owned_page(assignment_list_view, "/app/admin/assignments"), name="assignment_list"),
    path("assignments/create/", react_owned_page(assignment_create_view, "/app/admin/assignments"), name="assignment_create"),
    path("assignments/bulk-create/", react_owned_page(assignment_bulk_create_view, "/app/admin/assignments"), name="assignment_bulk_create"),
    path("assignments/get-class-subjects/", react_owned_page(get_class_subjects_view, "/app/admin/assignments"), name="get_class_subjects"),
    path("assignments/<int:assignment_id>/edit/", react_owned_page(assignment_edit_view, "/app/admin/assignments"), name="assignment_edit"),
    path("assignments/<int:assignment_id>/delete/", react_owned_page(assignment_delete_view, "/app/admin/assignments"), name="assignment_delete"),
    
    # School Management URLs (School Admin - own school only)
    path("school/", react_owned_page(school_detail_view, "/app/admin/school"), name="school_detail"),
    path("school/edit/", react_owned_page(school_edit_view, "/app/admin/school"), name="school_edit"),
    
    # Superadmin School Management URLs (All schools)
    path("superadmin/schools/", react_owned_page(superadmin_school_list_view, "/app/superadmin/schools"), name="superadmin_school_list"),
    path("superadmin/schools/create/", react_owned_page(superadmin_school_create_view, "/app/superadmin/schools/new"), name="superadmin_school_create"),
    path("superadmin/schools/<int:school_id>/", react_owned_page(superadmin_school_detail_view, "/app/superadmin/schools/{school_id}"), name="superadmin_school_detail"),
    path("superadmin/schools/<int:school_id>/edit/", react_owned_page(superadmin_school_edit_view, "/app/superadmin/schools/{school_id}/edit"), name="superadmin_school_edit"),
    path("superadmin/schools/<int:school_id>/delete/", react_owned_page(superadmin_school_delete_view, "/app/superadmin/schools"), name="superadmin_school_delete"),
    
    # Superadmin Admin Management URLs (Manage school administrators)
    path("superadmin/admins/", react_owned_page(superadmin_admin_list_view, "/app/superadmin/admins"), name="superadmin_admin_list"),
    path("superadmin/admins/create/", react_owned_page(superadmin_admin_create_view, "/app/superadmin/admins/new"), name="superadmin_admin_create"),
    path("superadmin/admins/<int:admin_id>/", react_owned_page(superadmin_admin_detail_view, "/app/superadmin/admins/{admin_id}"), name="superadmin_admin_detail"),
    path("superadmin/admins/<int:admin_id>/edit/", react_owned_page(superadmin_admin_edit_view, "/app/superadmin/admins/{admin_id}/edit"), name="superadmin_admin_edit"),
    path("superadmin/admins/<int:admin_id>/delete/", react_owned_page(superadmin_admin_delete_view, "/app/superadmin/admins"), name="superadmin_admin_delete"),
    
    # User Management URLs
    path("users/", react_owned_page(user_list_view, lambda request: "/app/superadmin/users" if request.user.role == "superadmin" else "/app/admin/users"), name="user_list"),
    path("users/create/", react_owned_page(user_create_view, lambda request: "/app/superadmin/users" if request.user.role == "superadmin" else "/app/admin/users"), name="user_create"),
    path("users/<int:user_id>/edit/", react_owned_page(user_edit_view, lambda request: "/app/superadmin/users" if request.user.role == "superadmin" else "/app/admin/users"), name="user_edit"),
    path("users/<int:user_id>/delete/", react_owned_page(user_delete_view, lambda request: "/app/superadmin/users" if request.user.role == "superadmin" else "/app/admin/users"), name="user_delete"),
    path("users/bulk-password-reset/", react_owned_page(user_bulk_password_reset_view, lambda request: "/app/superadmin/users" if request.user.role == "superadmin" else "/app/admin/users"), name="user_bulk_password_reset"),
    
    # Quiz Management URLs (for teachers)
    path("quizzes/", react_owned_page(quiz_list_view, "/app/teacher/quizzes"), name="quiz_list"),
    path("quizzes/create/", react_owned_page(quiz_create_view, "/app/teacher/quizzes/new"), name="quiz_create"),
    path("quizzes/<int:quiz_id>/edit/", react_owned_page(quiz_edit_view, "/app/teacher/quizzes/{quiz_id}/settings"), name="quiz_edit"),
    path("quizzes/<int:quiz_id>/delete/", react_owned_page(quiz_delete_view, "/app/teacher/quizzes"), name="quiz_delete"),
    path("quizzes/<int:quiz_id>/detail/", react_owned_page(quiz_detail_view, "/app/teacher/quizzes/{quiz_id}"), name="quiz_detail"),
    path("quizzes/<int:quiz_id>/update-status/", react_owned_page(quiz_update_status_view, "/app/teacher/quizzes/{quiz_id}"), name="quiz_update_status"),
    path("quizzes/get-terms/", react_owned_page(get_terms_for_academic_year_view, "/app/teacher/quizzes"), name="get_terms_for_academic_year"),
    
    # Question Management URLs (for teachers)
    path("quizzes/<int:quiz_id>/questions/", react_owned_page(question_list_view, "/app/teacher/questions/{quiz_id}"), name="question_list"),
    path("quizzes/<int:quiz_id>/questions/create/", react_owned_page(question_create_view, "/app/teacher/questions/{quiz_id}/new"), name="question_create"),
    path("quizzes/<int:quiz_id>/questions/<int:question_id>/edit/", react_owned_page(question_edit_view, "/app/teacher/questions/{quiz_id}/{question_id}/edit"), name="question_edit"),
    path("quizzes/<int:quiz_id>/questions/<int:question_id>/delete/", react_owned_page(question_delete_view, "/app/teacher/questions/{quiz_id}"), name="question_delete"),
    path("quizzes/<int:quiz_id>/questions/<int:question_id>/duplicate/", react_owned_page(question_duplicate_view, "/app/teacher/questions/{quiz_id}"), name="question_duplicate"),
    path("quizzes/<int:quiz_id>/questions/reorder/", react_owned_page(question_reorder_view, "/app/teacher/questions/{quiz_id}"), name="question_reorder"),
    path("quizzes/<int:quiz_id>/questions/import/", react_owned_page(question_bulk_import_view, "/app/teacher/questions/{quiz_id}/import"), name="question_bulk_import"),
    path("quizzes/<int:quiz_id>/questions/import-template/<str:format_type>/", question_import_template_view, name="question_import_template"),
    path("quizzes/<int:quiz_id>/questions/bulk-delete/", react_owned_page(question_bulk_delete_view, "/app/teacher/questions/{quiz_id}"), name="question_bulk_delete"),
    
    # Quiz Assignment Management URLs (for teachers)
    path("quizzes/assignments/", react_owned_page(quiz_assignment_overview_view, "/app/teacher/assignments"), name="quiz_assignment_overview"),
    path("quizzes/<int:quiz_id>/assignments/", react_owned_page(quiz_assignment_list_view, "/app/teacher/assignments?quiz={quiz_id}"), name="quiz_assignment_list"),
    path("quizzes/<int:quiz_id>/assignments/create/", react_owned_page(quiz_assignment_create_view, "/app/teacher/assignments?quiz={quiz_id}"), name="quiz_assignment_create"),
    path("quizzes/<int:quiz_id>/assignments/<int:class_id>/delete/", react_owned_page(quiz_assignment_delete_view, "/app/teacher/assignments?quiz={quiz_id}"), name="quiz_assignment_delete"),
    path("quizzes/<int:quiz_id>/assignments/bulk-delete/", react_owned_page(quiz_assignment_bulk_delete_view, "/app/teacher/assignments?quiz={quiz_id}"), name="quiz_assignment_bulk_delete"),
    
    # Class Quiz List URL (view quizzes assigned to a class)
    path("classes/<int:class_id>/quizzes/", react_owned_page(class_quiz_list_view, "/app/admin/classes/{class_id}"), name="class_quiz_list"),
    
    # Quiz Grading Management URLs (for teachers)
    path("quizzes/grading/", react_owned_page(quiz_grading_list_view, "/app/teacher/grading"), name="quiz_grading_list"),
    path("quizzes/attempts/<int:attempt_id>/grading/", react_owned_page(quiz_attempt_grading_view, "/app/teacher/grading/{attempt_id}"), name="quiz_attempt_grading"),
    path("quizzes/responses/<int:response_id>/grade/", react_owned_page(quiz_response_grade_view, "/app/teacher/grading"), name="quiz_response_grade"),
    path("quizzes/attempts/<int:attempt_id>/bulk-grade/", react_owned_page(quiz_attempt_bulk_grade_view, "/app/teacher/grading/{attempt_id}"), name="quiz_attempt_bulk_grade"),
    
    # Quiz Results Management URLs (for teachers)
    path("quizzes/results/", quiz_results_list_view, name="quiz_results_list"),
    path("quizzes/results/<int:attempt_id>/", quiz_result_detail_view, name="quiz_result_detail"),
    path("quizzes/results/<int:attempt_id>/print/", quiz_result_print_view, name="quiz_result_print"),
    path("quizzes/results/bulk-print/", quiz_results_bulk_print_view, name="quiz_results_bulk_print"),
    path("quizzes/results/export/", quiz_results_export_view, name="quiz_results_export"),
    
    # Student Quiz URLs
    path("quizzes/available/", react_owned_page(student_quiz_list_view, "/app/student/quizzes"), name="student_quiz_list"),
    path("quizzes/my-attempts/", react_owned_page(student_quiz_attempts_view, "/app/student/attempts"), name="student_quiz_attempts"),
    path("quizzes/<int:quiz_id>/preview/", react_owned_page(student_quiz_detail_view, "/app/student/quizzes/{quiz_id}"), name="student_quiz_detail"),
    path("quizzes/<int:quiz_id>/start/", react_owned_page(student_quiz_start_view, "/app/student/quizzes/{quiz_id}"), name="student_quiz_start"),
    path("quizzes/<int:quiz_id>/resume/", react_owned_page(student_quiz_resume_view, "/app/student/quizzes/{quiz_id}"), name="student_quiz_resume"),
    path("quizzes/attempts/<int:attempt_id>/take/", react_owned_page(student_quiz_take_view, "/app/student/take/{attempt_id}"), name="student_quiz_take"),
    path("quizzes/attempts/<int:attempt_id>/save/", react_owned_page(student_quiz_save_view, "/app/student/attempts/{attempt_id}/result"), name="student_quiz_save"),
    path("quizzes/attempts/<int:attempt_id>/submit/", react_owned_page(student_quiz_submit_view, "/app/student/attempts/{attempt_id}/result"), name="student_quiz_submit"),
    path("quizzes/attempts/<int:attempt_id>/result/", react_owned_page(student_quiz_result_detail_view, "/app/student/attempts/{attempt_id}/result"), name="student_quiz_result_detail"),
    path("quizzes/attempts/<int:attempt_id>/result/print/", react_owned_page(student_quiz_result_print_view, "/app/student/attempts/{attempt_id}/result/print"), name="student_quiz_result_print"),
    
    # React Migration API v1
    path("api/v1/me/", me_api_view, name="api_me"),
    path("api/v1/me/password/", change_password_api_view, name="api_me_password"),
    path("api/v1/extend-session/", extend_session_view, name="api_extend_session"),
    path("api/v1/superadmin/dashboard/", superadmin_dashboard_api_view, name="api_superadmin_dashboard"),
    path("api/v1/superadmin/schools/", superadmin_schools_api_view, name="api_superadmin_schools"),
    path("api/v1/superadmin/schools/<int:school_id>/", superadmin_school_detail_api_view, name="api_superadmin_school_detail"),
    path("api/v1/superadmin/admins/", superadmin_admins_api_view, name="api_superadmin_admins"),
    path("api/v1/superadmin/admins/<int:admin_id>/", superadmin_admin_detail_api_view, name="api_superadmin_admin_detail"),
    path("api/v1/users/", users_collection_api_view, name="api_users"),
    path("api/v1/users/<int:user_id>/", user_detail_api_view, name="api_user_detail"),
    path("api/v1/users/<int:user_id>/delete/", user_delete_api_view, name="api_user_delete"),
    path("api/v1/users/bulk-password-reset/", user_bulk_password_reset_api_view, name="api_user_bulk_password_reset"),
    path("api/v1/students/", students_collection_api_view, name="api_students"),
    path("api/v1/students/<int:student_id>/", student_write_api_view, name="api_student_detail"),
    path("api/v1/students/<int:student_id>/archive/", student_archive_api_view, name="api_student_archive"),
    path("api/v1/students/<int:student_id>/restore/", student_restore_api_view, name="api_student_restore"),
    path("api/v1/students/bulk-archive/", student_bulk_archive_api_view, name="api_student_bulk_archive"),
    path("api/v1/students/import/preview/", student_import_preview_api_view, name="api_student_import_preview"),
    path("api/v1/students/import/", student_import_api_view, name="api_student_import"),
    path("api/v1/teachers/", teachers_collection_api_view, name="api_teachers"),
    path("api/v1/teachers/<int:teacher_id>/", teacher_write_api_view, name="api_teacher_detail"),
    path("api/v1/teachers/<int:teacher_id>/archive/", teacher_archive_api_view, name="api_teacher_archive"),
    path("api/v1/teachers/<int:teacher_id>/restore/", teacher_restore_api_view, name="api_teacher_restore"),
    path("api/v1/teachers/bulk-archive/", teacher_bulk_archive_api_view, name="api_teacher_bulk_archive"),
    path("api/v1/teachers/import/preview/", teacher_import_preview_api_view, name="api_teacher_import_preview"),
    path("api/v1/teachers/import/", teacher_import_api_view, name="api_teacher_import"),
    path("api/v1/teachers/export/", teacher_export_api_view, name="api_teacher_export"),
    path("api/v1/dashboard/admin/", admin_dashboard_api_view, name="api_admin_dashboard"),
    path("api/v1/dashboard/teacher/", teacher_dashboard_api_view, name="api_teacher_dashboard"),
    path("api/v1/teacher/quizzes/", teacher_quizzes_collection_api_view, name="api_teacher_quizzes"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/", teacher_quiz_detail_write_api_view, name="api_teacher_quiz_detail"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/status/", teacher_quiz_status_api_view, name="api_teacher_quiz_status"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/release-results/", teacher_quiz_results_release_api_view, name="api_teacher_quiz_results_release"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/sections/", teacher_quiz_sections_api_view, name="api_teacher_quiz_sections"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/sections/reorder/", teacher_quiz_sections_reorder_api_view, name="api_teacher_quiz_sections_reorder"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/sections/<int:section_id>/", teacher_quiz_section_detail_api_view, name="api_teacher_quiz_section_detail"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/groups/", teacher_quiz_groups_api_view, name="api_teacher_quiz_groups"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/groups/reorder/", teacher_quiz_groups_reorder_api_view, name="api_teacher_quiz_groups_reorder"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/groups/<int:group_id>/", teacher_quiz_group_detail_api_view, name="api_teacher_quiz_group_detail"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/questions/", teacher_question_create_api_view, name="api_teacher_questions"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/questions/reorder/", teacher_question_reorder_api_view, name="api_teacher_question_reorder"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/questions/assign/", teacher_question_assignment_api_view, name="api_teacher_question_assignment"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/questions/bulk-delete/", teacher_question_bulk_delete_api_view, name="api_teacher_question_bulk_delete"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/questions/import/", teacher_question_import_api_view, name="api_teacher_question_import"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/questions/<int:question_id>/", teacher_question_detail_api_view, name="api_teacher_question_detail"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/questions/<int:question_id>/duplicate/", teacher_question_duplicate_api_view, name="api_teacher_question_duplicate"),
    path("api/v1/teacher/quiz-options/", teacher_quiz_form_options_api_view, name="api_teacher_quiz_options"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/assignments/", teacher_quiz_assignments_write_api_view, name="api_teacher_quiz_assignments"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/assignments/set/", teacher_quiz_assignment_set_api_view, name="api_teacher_quiz_assignment_set"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/assignments/bulk-delete/", teacher_quiz_assignment_bulk_delete_api_view, name="api_teacher_quiz_assignment_bulk_delete"),
    path("api/v1/teacher/quizzes/<int:quiz_id>/assignments/<int:class_id>/", teacher_quiz_assignment_delete_api_view, name="api_teacher_quiz_assignment_delete"),
    path("api/v1/teacher/results/", teacher_results_api_view, name="api_teacher_results"),
    path("api/v1/teacher/results/export/", teacher_results_export_api_view, name="api_teacher_results_export"),
    path("api/v1/teacher/results/<int:attempt_id>/", teacher_result_detail_api_view, name="api_teacher_result_detail"),
    path("api/v1/teacher/grading/", teacher_grading_api_view, name="api_teacher_grading"),
    path("api/v1/teacher/grading/<int:attempt_id>/", teacher_grading_detail_write_api_view, name="api_teacher_grading_detail"),
    path("api/v1/teacher/grading/<int:attempt_id>/bulk/", teacher_grading_bulk_api_view, name="api_teacher_grading_bulk"),
    path("api/v1/teacher/responses/<int:response_id>/grade/", teacher_response_grade_api_view, name="api_teacher_response_grade"),
    path("api/v1/dashboard/student/", student_dashboard_api_view, name="api_student_dashboard"),
    path("api/v1/student/quizzes/", student_quizzes_api_view, name="api_student_quizzes"),
    path("api/v1/student/quizzes/<int:quiz_id>/", student_quiz_detail_api_view, name="api_student_quiz_detail"),
    path("api/v1/student/quizzes/<int:quiz_id>/start/", student_quiz_start_api_view, name="api_student_quiz_start"),
    path("api/v1/student/attempts/<int:attempt_id>/take/", student_quiz_take_api_view, name="api_student_quiz_take"),
    path("api/v1/student/attempts/<int:attempt_id>/save/", student_quiz_save_api_view, name="api_student_quiz_save"),
    path("api/v1/student/attempts/<int:attempt_id>/sections/<int:section_id>/submit/", student_quiz_section_submit_api_view, name="api_student_quiz_section_submit"),
    path("api/v1/student/attempts/<int:attempt_id>/submit/", student_quiz_submit_api_view, name="api_student_quiz_submit"),
    path("api/v1/student/attempts/", student_attempts_api_view, name="api_student_attempts"),
    path("api/v1/student/attempts/<int:attempt_id>/result/", student_quiz_result_api_view, name="api_student_quiz_result"),
    path("api/v1/student/profile/", student_profile_api_view, name="api_student_profile"),
    
    # Academic Structure & School Setup API v1 (ADR-014)
    path("api/v1/academic-years/", academic_years_api_view, name="api_academic_years"),
    path("api/v1/academic-years/<int:year_id>/", academic_year_detail_api_view, name="api_academic_year_detail"),
    path("api/v1/academic-years/<int:year_id>/set-current/", academic_year_set_current_api_view, name="api_academic_year_set_current"),
    path("api/v1/terms/", terms_api_view, name="api_terms"),
    path("api/v1/terms/<int:term_id>/", term_detail_api_view, name="api_term_detail"),
    path("api/v1/terms/<int:term_id>/set-current/", term_set_current_api_view, name="api_term_set_current"),
    path("api/v1/classes/", classes_api_view, name="api_classes"),
    path("api/v1/classes/<int:class_id>/", class_detail_api_view, name="api_class_detail"),
    path("api/v1/classes/<int:class_id>/restore/", class_restore_api_view, name="api_class_restore"),
    path("api/v1/classes/<int:class_id>/subjects/add/", class_subject_add_api_view, name="api_class_subject_add"),
    path("api/v1/classes/<int:class_id>/subjects/<int:class_subject_id>/remove/", class_subject_remove_api_view, name="api_class_subject_remove"),
    path("api/v1/subjects/", subjects_api_view, name="api_subjects"),
    path("api/v1/subjects/<int:subject_id>/", subject_detail_api_view, name="api_subject_detail"),
    path("api/v1/subjects/<int:subject_id>/restore/", subject_restore_api_view, name="api_subject_restore"),
    path("api/v1/school/", school_settings_api_view, name="api_school_settings"),
    path("api/v1/structure-lookups/", structure_lookups_api_view, name="api_structure_lookups"),
    path("api/v1/school-structure/<str:resource>/", school_structure_api_view, name="api_school_structure"),
    path("api/v1/school-structure/<str:resource>/<int:object_id>/", school_structure_detail_api_view, name="api_school_structure_detail"),
    
    # Academic Allocations API v1 (ADR-015)
    path("api/v1/enrollments/", enrollments_api_view, name="api_enrollments"),
    path("api/v1/enrollments/bulk/", enrollments_bulk_api_view, name="api_enrollments_bulk"),
    path("api/v1/enrollments/<int:enrollment_id>/", enrollment_detail_api_view, name="api_enrollment_detail"),
    path("api/v1/enrollments/bulk-delete/", enrollments_bulk_delete_api_view, name="api_enrollments_bulk_delete"),
    path("api/v1/enrollments/lookups/", enrollments_lookups_api_view, name="api_enrollments_lookups"),
    path("api/v1/teacher-assignments/", teacher_assignments_api_view, name="api_teacher_assignments"),
    path("api/v1/teacher-assignments/bulk/", teacher_assignments_bulk_api_view, name="api_teacher_assignments_bulk"),
    path("api/v1/teacher-assignments/<int:assignment_id>/", teacher_assignment_detail_api_view, name="api_teacher_assignment_detail"),
    path("api/v1/teacher-assignments/lookups/", teacher_assignments_lookups_api_view, name="api_teacher_assignments_lookups"),
    path("api/v1/teacher-assignments/class-subjects/", teacher_assignment_class_subjects_api_view, name="api_teacher_assignment_class_subjects"),
    
    # React App Shell Catch-All (governed by REACT_FRONTEND_MIGRATION_PLAN.md)
    path("app/", react_app_shell_view, name="react_app"),
    path("app/<path:subpath>/", react_app_shell_view, name="react_app_subpath"),
    path("app/<path:subpath>", react_app_shell_view, name="react_app_subpath_no_slash"),
    # Optional React Authentication & System Core frontend; Django owns all auth actions.
    path("auth-app/", auth_app_legacy_redirect, name="auth_core_app"),
    path("auth-app/<path:subpath>/", auth_app_legacy_redirect, name="auth_core_app_subpath"),
    path("auth-app/<path:subpath>", auth_app_legacy_redirect, name="auth_core_app_subpath_no_slash"),
]

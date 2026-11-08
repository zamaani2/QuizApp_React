# React Route Ownership Register

| Field | Value |
|---|---|
| Document status | **Authoritative Route Register** |
| Last updated | 2026-11-07 |
| Governed by | `REACT_FRONTEND_MIGRATION_PLAN.md` |

Columns:
`Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status`

Status vocabulary: `NOT STARTED` · `PLANNED` · `IN PROGRESS` · `IN REVIEW` · `DONE` · `RETAINED AS DJANGO` · `BLOCKED`

---

## Foundation & System Shell

| Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status |
|---|---|---|---|---|---|---|---|---|
| `/app/` and `/app/*` | `react_app_shell_view` | `quiz_app/react_app.html` | All authenticated | React (Bootstrap-dependent) | React (React-owned design system) | `GET /api/v1/me/` | Low | `IN PROGRESS` |
| `/auth-app/` and `/auth-app/*` | `auth_core_shell_view` | `quiz_app/auth_core_app.html` | All | React entry + Django auth handler | React sign-in presentation; Django auth | `GET /api/v1/me/`, JSON mode of existing `POST /login/`, existing `/logout/`, `/password-reset/*` | High | `IN PROGRESS` |
| `/api/v1/me/` | `me_api_view` | N/A (JSON) | All authenticated | Django API (new) | Django API | N/A | Low | `DONE` |
| `/extend-session/` | `extend_session_view` | N/A (JSON) | All authenticated | Django | Django API | N/A | Low | `DONE` |

---

## Authentication & Credentials

The `/auth-app/*` portal is the target React sign-in presentation. Django continues to validate credentials, manage sessions, and own password recovery; the existing Django routes remain available as classic fallbacks. React shell links are full-page navigation, not Django-template composition.

| Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status |
|---|---|---|---|---|---|---|---|---|
| `/login/` | `login_view` | `auth/login.html` | Anonymous | Django | Django HTML fallback; shared handler for React JSON mode | Existing session auth; React submits with `Accept: application/json` | High | `RETAINED AS DJANGO` |
| `/logout/` | `logout_view` | N/A (Redirect) | All | Django | Django | N/A | Low | `RETAINED AS DJANGO` |
| `/password-reset/` | `PasswordResetView` | `auth/password_reset.html` | Anonymous | Django | Django | N/A | High | `RETAINED AS DJANGO` |
| `/password-reset/done/` | `PasswordResetDoneView` | `auth/password_reset_done.html` | Anonymous | Django | Django | N/A | Low | `RETAINED AS DJANGO` |
| `/password-reset/<uidb64>/<token>/` | `PasswordResetConfirmView` | `auth/password_reset_confirm.html` | Anonymous | Django | Django | N/A | High | `RETAINED AS DJANGO` |
| `/password-reset/complete/` | `PasswordResetCompleteView` | `auth/password_reset_complete.html` | Anonymous | Django | Django | N/A | Low | `RETAINED AS DJANGO` |
| `/superadmin/login/` | `superadmin_login_view` | `superadmin/login.html` | Anonymous | Django | Django | N/A | High | `RETAINED AS DJANGO` |
| `/superadmin/logout/` | `superadmin_logout_view` | N/A (Redirect) | Superadmin | Django | Django | N/A | Low | `RETAINED AS DJANGO` |

---

## Dashboards

| Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status |
|---|---|---|---|---|---|---|---|---|
| `/` | `dashboard_view` | N/A (Role redirect) | All | Django | Django | N/A | Low | `RETAINED AS DJANGO` |
| `/dashboard/` | `dashboard_view` | N/A (Role redirect) | All | Django | Django | N/A | Low | `RETAINED AS DJANGO` |
| `/dashboard/admin/` | `admin_dashboard_view` | `dashboard/admin_dashboard.html` | Admin | Django (fallback) / React | React (`/app/admin/dashboard`) | `GET /api/v1/dashboard/admin/` | Low | `DONE` |
| `/dashboard/teacher/` | `teacher_dashboard_view` | `dashboard/teacher_dashboard.html` | Teacher | Django (fallback) / React | React (`/app/teacher/dashboard`) | `GET /api/v1/dashboard/teacher/` | Low | `DONE` |
| `/dashboard/student/` | `student_dashboard_view` | `dashboard/student_dashboard.html` | Student | Django | React (`/app/student/dashboard`) | `GET /api/v1/dashboard/student/` | Low | `DONE` |
| `/superadmin/dashboard/` | `superadmin_dashboard_view` | `superadmin/dashboard.html` | Superadmin | Django (fallback) / React redirect | React (`/app/superadmin/dashboard`) | `GET /api/v1/superadmin/dashboard/` | Low | `DONE` |

---

## Superadmin Console (Phase 3 Candidate)

| Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status |
|---|---|---|---|---|---|---|---|---|
| `/superadmin/schools/` | `superadmin_school_list_view` | `superadmin/school_list.html` | Superadmin | React redirect / Django (`?classic=1`) | React (`/app/superadmin/schools`) | `GET /api/v1/superadmin/schools/` | Low | `DONE` |
| `/superadmin/schools/create/` | `superadmin_school_create_view` | `superadmin/partials/school_form.html` | Superadmin | React redirect / Django fallback | React (`/app/superadmin/schools/new`) | `POST /api/v1/superadmin/schools/` | Medium | `DONE` |
| `/superadmin/schools/<id>/` | `superadmin_school_detail_view` | `superadmin/school_detail.html` | Superadmin | React redirect / Django (`?classic=1`) | React (`/app/superadmin/schools/:id`) | `GET /api/v1/superadmin/schools/<id>/` | Low | `DONE` |
| `/superadmin/schools/<id>/edit/` | `superadmin_school_edit_view` | `superadmin/partials/school_form.html` | Superadmin | React redirect / Django fallback | React (`/app/superadmin/schools/:id/edit`) | `POST /api/v1/superadmin/schools/<id>/` | Medium | `DONE` |
| `/superadmin/schools/<id>/delete/` | `superadmin_school_delete_view` | N/A | Superadmin | Django (fallback) / React | React school registry action | `DELETE /api/v1/superadmin/schools/<id>/` | High | `DONE` |
| `/superadmin/admins/` | `superadmin_admin_list_view` | `superadmin/admin_list.html` | Superadmin | React redirect / Django (`?classic=1`) | React (`/app/superadmin/admins`) | `GET /api/v1/superadmin/admins/` | Low | `DONE` |
| `/superadmin/admins/create/` | `superadmin_admin_create_view` | `superadmin/partials/admin_form.html` | Superadmin | React redirect / Django (`?classic=1`) | React (`/app/superadmin/admins/new`) | `POST /api/v1/superadmin/admins/` | Medium | `DONE` |
| `/superadmin/admins/<id>/` | `superadmin_admin_detail_view` | `superadmin/admin_detail.html` | Superadmin | React redirect / Django (`?classic=1`) | React (`/app/superadmin/admins/:id`) | `GET /api/v1/superadmin/admins/<id>/` | Low | `DONE` |
| `/superadmin/admins/<id>/edit/` | `superadmin_admin_edit_view` | `superadmin/partials/admin_form.html` | Superadmin | React redirect / Django (`?classic=1`) | React (`/app/superadmin/admins/:id/edit`) | `POST /api/v1/superadmin/admins/<id>/` | Medium | `DONE` |
| `/superadmin/admins/<id>/delete/` | `superadmin_admin_delete_view` | N/A | Superadmin | Django fallback / React | React registry and detail actions | `DELETE /api/v1/superadmin/admins/<id>/` | Medium | `DONE` |

---

## School Administration (Phase 3 Candidate)

| Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status |
|---|---|---|---|---|---|---|---|---|
| `/school/` | `school_detail_view` | `school/school_detail.html` | Admin | React redirect / Django (`?classic=1`) | React (`/app/admin/school`) | `GET /api/v1/school/` | Low | `DONE` |
| `/school/edit/` | `school_edit_view` | `school/partials/school_form.html` | Admin | React redirect / Django (`?classic=1`) | React (`/app/admin/school`) | `POST` multipart / `PUT` JSON `/api/v1/school/` | Medium | `DONE` |
| `/academic-years/` | `academic_year_list_view` | `academic/academic_year_list.html` | Admin | Django (fallback) / React | React (`/app/admin/academic-years`) | `GET /api/v1/academic-years/` | Low | `DONE` |
| `/academic-years/create/` | `academic_year_create_view` | `academic/partials/academic_year_form.html` | Admin | Django (fallback) / React | React (`/app/admin/academic-years`) | `POST /api/v1/academic-years/` | Medium | `DONE` |
| `/academic-years/<id>/edit/` | `academic_year_edit_view` | `academic/partials/academic_year_form.html` | Admin | Django (fallback) / React | React (`/app/admin/academic-years`) | `PUT /api/v1/academic-years/<id>/` | Medium | `DONE` |
| `/academic-years/<id>/delete/` | `academic_year_delete_view` | N/A | Admin | Django (fallback) / React | React (`/app/admin/academic-years`) | `DELETE /api/v1/academic-years/<id>/` | Medium | `DONE` |
| `/academic-years/<id>/set-current/` | `academic_year_set_current_view` | N/A | Admin | Django (fallback) / React | React (`/app/admin/academic-years`) | `POST /api/v1/academic-years/<id>/set-current/` | Medium | `DONE` |
| `/terms/` | `term_list_view` | `academic/term_list.html` | Admin | Django (fallback) / React | React (`/app/admin/terms`) | `GET /api/v1/terms/` | Low | `DONE` |
| `/terms/create/` | `term_create_view` | `academic/partials/term_form.html` | Admin | Django (fallback) / React | React (`/app/admin/terms`) | `POST /api/v1/terms/` | Medium | `DONE` |
| `/terms/<id>/edit/` | `term_edit_view` | `academic/partials/term_form.html` | Admin | Django (fallback) / React | React (`/app/admin/terms`) | `PUT /api/v1/terms/<id>/` | Medium | `DONE` |
| `/terms/<id>/delete/` | `term_delete_view` | N/A | Admin | Django (fallback) / React | React (`/app/admin/terms`) | `DELETE /api/v1/terms/<id>/` | Medium | `DONE` |
| `/terms/<id>/set-current/` | `term_set_current_view` | N/A | Admin | Django (fallback) / React | React (`/app/admin/terms`) | `POST /api/v1/terms/<id>/set-current/` | Medium | `DONE` |
| `/forms/`, `/forms/create/`, `/forms/<id>/edit/`, `/forms/<id>/delete/` | `form_*_view` | `school_structure/form_list.html`, `partials/form_form.html` | Admin, Superadmin | React redirect / Django (`?classic=1`) | React (`/app/admin/forms`) | `GET, POST /api/v1/school-structure/forms/`; `GET, PUT, DELETE /api/v1/school-structure/forms/<id>/` | Medium | `DONE` |
| `/learning-areas/`, `/learning-areas/create/`, `/learning-areas/<id>/edit/`, `/learning-areas/<id>/delete/` | `learning_area_*_view` | `school_structure/learning_area_list.html`, `partials/learning_area_form.html` | Admin, Superadmin | React redirect / Django (`?classic=1`) | React (`/app/admin/learning-areas`) | `GET, POST /api/v1/school-structure/learning-areas/`; `GET, PUT, DELETE /api/v1/school-structure/learning-areas/<id>/` | Medium | `DONE` |
| `/departments/`, `/departments/create/`, `/departments/<id>/edit/`, `/departments/<id>/delete/` | `department_*_view` | `school_structure/department_list.html`, `partials/department_form.html` | Admin, Superadmin | React redirect / Django (`?classic=1`) | React (`/app/admin/departments`) | `GET, POST /api/v1/school-structure/departments/`; `GET, PUT, DELETE /api/v1/school-structure/departments/<id>/` | Medium | `DONE` |
| `/subjects/` | `subject_list_view`, create, edit, delete, restore | `subject/subject_list.html` | Admin, Superadmin | React redirect / Django (`?classic=1`) | React (`/app/admin/subjects`) | `GET, POST, PUT, DELETE /api/v1/subjects/*` | Medium | `DONE` |
| `/classes/` | `class_list_view` | `class/class_list.html` | Admin | Django (fallback) / React | React (`/app/admin/classes`) | `GET /api/v1/classes/` | Low | `DONE` |
| `/classes/<id>/detail/` | `class_detail_view` | `class/class_detail.html` | Admin | Django (fallback) / React | React (`/app/admin/classes/:id`) | `GET /api/v1/classes/<id>/` | Low | `DONE` |
| `/students/` | `student_list_view` | `student/student_list.html` | Admin | Django (fallback) / React | React (`/app/admin/students`) | `GET /api/v1/students/` | Low | `DONE` |
| `/students/create/` | `student_create_view` | `student/partials/student_form.html` | Admin | Django | React | `POST /api/v1/students/` | Medium | `NOT STARTED` |
| `/students/<id>/detail/` | `student_detail_view` | `student/student_detail.html` | Admin | Django | React | `GET /api/v1/students/<id>/` | Low | `PLANNED` |
| `/students/<id>/edit/` | `student_edit_view` | `student/partials/student_form.html` | Admin | Django | React | `PUT /api/v1/students/<id>/` | Medium | `NOT STARTED` |
| `/students/<id>/delete/` | `student_delete_view` | N/A | Admin | Django | React | `DELETE /api/v1/students/<id>/` | Medium | `NOT STARTED` |
| `/students/<id>/restore/` | `student_restore_view` | N/A | Admin | Django | React | `POST /api/v1/students/<id>/restore/` | Medium | `NOT STARTED` |
| `/students/bulk-delete/` | `student_bulk_delete_view` | N/A | Admin | Django | React | `POST /api/v1/students/bulk-delete/` | High | `NOT STARTED` |
| `/students/bulk-import/*` | `student_bulk_import_view` | `student/student_bulk_import.html` | Admin | Django | Django | N/A | Medium | `RETAINED AS DJANGO` |
| `/students/export/<fmt>/` | `student_export_view` | N/A (Binary) | Admin | Django | Django | N/A | Low | `RETAINED AS DJANGO` |
| `/enrollments/` | `student_enrollment_list_view` | `student_enrollment/enrollment_list.html` | Admin, Superadmin | React redirect / Django (`?classic=1`) | React (`/app/admin/enrollments`) | `GET, POST, PUT, DELETE /api/v1/enrollments/*` | Medium | `DONE` |
| `/teachers/` | `teacher_list_view` | `teacher/teacher_list.html` | Admin | Django (fallback) / React | React (`/app/admin/teachers`) | `GET /api/v1/teachers/` | Low | `DONE` |
| `/teachers/create/` | `teacher_create_view` | `teacher/partials/teacher_form.html` | Admin | Django | React | `POST /api/v1/teachers/` | Medium | `NOT STARTED` |
| `/teachers/<id>/detail/` | `teacher_detail_view` | `teacher/teacher_detail.html` | Admin | Django | React | `GET /api/v1/teachers/<id>/` | Low | `PLANNED` |
| `/assignments/` | `assignment_list_view` | `teacher_assignment/assignment_list.html` | Admin | Django (fallback) / React | React (`/app/admin/assignments`) | `GET, POST, DELETE /api/v1/teacher-assignments/*` | Medium | `DONE` |
| `/users/` | `user_list_view` | `users/user_list.html` | Admin | Django | React | `GET /api/v1/users/` | Medium | `NOT STARTED` |

---

## Teacher Workspace (Phase 4)

| Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status |
|---|---|---|---|---|---|---|---|---|
| `/quizzes/` | `quiz_list_view` | `quiz/quiz_list.html` | Teacher | Django (fallback) / React | React (`/app/teacher/quizzes`) | `GET /api/v1/teacher/quizzes/` | Low | `DONE` |
| `/quizzes/create/` | `quiz_create_view` | `quiz/quiz_form.html` | Teacher | Django | Django | N/A | Medium | `RETAINED AS DJANGO` |
| `/quizzes/<id>/detail/` | `quiz_detail_view` | `quiz/quiz_detail.html` | Teacher | Django (fallback) / React | React (`/app/teacher/quizzes/:id`) | `GET /api/v1/teacher/quizzes/<id>/` | Low | `DONE` |
| `/quizzes/<id>/edit/` | `quiz_edit_view` | `quiz/quiz_form.html` | Teacher | Django | React | `PUT /api/v1/quizzes/<id>/` | Medium | `NOT STARTED` |
| `/quizzes/<id>/delete/` | `quiz_delete_view` | N/A | Teacher | Django | React | `DELETE /api/v1/quizzes/<id>/` | High | `NOT STARTED` |
| `/quizzes/<id>/questions/` | `question_list_view` | `quiz/question_list.html` | Teacher | Django | React | `GET /api/v1/quizzes/<id>/questions/` | Medium | `NOT STARTED` |
| `/quizzes/<id>/questions/create/` | `question_create_view` | `quiz/question_form.html` | Teacher | Django | React | `POST /api/v1/quizzes/<id>/questions/` | Medium | `NOT STARTED` |
| `/quizzes/<id>/questions/reorder/` | `question_reorder_view` | N/A (JSON) | Teacher | Django | React | `POST /api/v1/quizzes/<id>/questions/reorder/` | Medium | `NOT STARTED` |
| `/quizzes/assignments/` | `quiz_assignment_overview_view` | `quiz/quiz_assignment_overview.html` | Teacher | Django | React | `GET /api/v1/quizzes/assignments/` | Low | `NOT STARTED` |
| `/quizzes/grading/` | `quiz_grading_list_view` | `quiz/quiz_grading_list.html` | Teacher | Django (fallback) / React | React (`/app/teacher/grading`) | `GET /api/v1/teacher/grading/` | Medium | `DONE` |
| `/quizzes/attempts/<id>/grading/` | `quiz_attempt_grading_view` | `quiz/quiz_attempt_grading.html` | Teacher | Django | React | `GET, POST /api/v1/attempts/<id>/grade/` | Medium | `NOT STARTED` |
| `/quizzes/results/` | `quiz_results_list_view` | `quiz/quiz_results_list.html` | Teacher | Django (fallback) / React | React (`/app/teacher/results`) | `GET /api/v1/teacher/results/` | Low | `DONE` |
| `/quizzes/results/<id>/` | `quiz_result_detail_view` | `quiz/quiz_result_detail.html` | Teacher | Django | React | `GET /api/v1/quizzes/results/<id>/` | Low | `PLANNED` |
| `/quizzes/results/<id>/print/` | `quiz_result_print_view` | Redirect to React | Teacher | Django access check / React (`/app/teacher/results/:attemptId/print`) | React | `GET /api/v1/teacher/results/<id>/` | Low | `DONE` |
| `/quizzes/results/bulk-print/` | `quiz_results_bulk_print_view` | Redirect to React | Teacher | Django selection/access checks / React (`/app/teacher/results/print`) | React | `GET /api/v1/teacher/results/<id>/` | Medium | `DONE` |
| `/quizzes/results/export/` | `quiz_results_export_view` | N/A (Binary) | Teacher | Django | Django | N/A | Low | `RETAINED AS DJANGO` |

---

## Student Portal & Quiz Taking (Phase 5 Candidate)

| Existing URL | Django view | Template | User role | Current owner | Proposed owner | API dependencies | Migration risk | Status |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/student/` | `student_dashboard_view` | `student/dashboard.html` | Student | Django (fallback) / React | React (`/app/student/dashboard`) | `GET /api/v1/dashboard/student/` | Low | `DONE` |
| `/quizzes/available/` | `student_quiz_list_view` | `quiz/student/quiz_list.html` | Student | Django (fallback) / React | React (`/app/student/quizzes`) | `GET /api/v1/student/quizzes/` | Low | `DONE` |
| `/quizzes/my-attempts/` | `student_quiz_attempts_view` | `quiz/student/quiz_attempts.html` | Student | Django (fallback) / React | React (`/app/student/attempts`) | `GET /api/v1/student/attempts/` | Low | `DONE` |
| `/quizzes/<id>/preview/` | `student_quiz_detail_view` | `quiz/student/quiz_detail.html` | Student | Django (fallback) / React | React (`/app/student/quizzes/:id`) | `GET /api/v1/student/quizzes/<id>/` | Low | `DONE` |
| `/quizzes/<id>/start/` | `student_quiz_start_view` | N/A (Redirect) | Student | Django | React | `POST /api/v1/student/quizzes/<id>/start/` | High | `DONE` |
| `/quizzes/<id>/resume/` | `student_quiz_resume_view` | N/A (Redirect) | Student | Django | React | `POST /api/v1/student/quizzes/<id>/start/` | High | `DONE` |
| `/quizzes/attempts/<id>/take/` | `student_quiz_take_view` | `quiz/student/quiz_take.html` | Student | Django (fallback) / React | React (`/app/student/take/:attemptId`) | `GET /api/v1/student/attempts/<id>/take/` | High | `DONE` |
| `/quizzes/attempts/<id>/save/` | `student_quiz_save_view` | N/A (JSON) | Student | Django | React | `POST /api/v1/student/attempts/<id>/save/` | High | `DONE` |
| `/quizzes/attempts/<id>/submit/` | `student_quiz_submit_view` | N/A (Redirect) | Student | Django | React | `POST /api/v1/student/attempts/<id>/submit/` | High | `DONE` |
| `/quizzes/attempts/<id>/result/` | `student_quiz_result_detail_view` | `quiz/student/quiz_result_detail.html` | Student | Django (fallback) / React | React (`/app/student/attempts/:id/result`) | `GET /api/v1/student/attempts/<id>/result/` | Low | `DONE` |
| `/quizzes/attempts/<id>/result/print/` | `student_quiz_result_print_view` | Redirect to React | Student | Django access check / React (`/app/student/attempts/:id/result/print`) | React | `GET /api/v1/student/attempts/<id>/result/` | Low | `DONE` |
| `/students/profile/` | `student_profile_view` | `student/student_detail.html` | Student | Django (fallback) / React | React (`/app/student/profile`) | `GET /api/v1/student/profile/` | Low | `DONE` |

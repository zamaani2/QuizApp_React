# React Frontend Migration Status

| Field | Value |
|---|---|
| Document status | **Feature Inventory & Migration Tracking Register** |
| Last updated | 2026-11-07 |
| Governed by | `REACT_FRONTEND_MIGRATION_PLAN.md` |

Status vocabulary: `NOT STARTED` · `PLANNED` · `IN PROGRESS` · `IN REVIEW` · `DONE` · `RETAINED AS DJANGO` · `BLOCKED`
Risk scale: `Low` · `Medium` · `High`

---

## Migration Phases Overview

| Phase | Description | Status | Target Date |
|---|---|---|---|
| **Phase 0** | Audit and Governance (documentation only) | **DONE** | 2026-11-06 |
| **Phase 1** | Foundation (scaffold `frontend/`, API client, `/api/v1/me/`, `/app/` shell) | **DONE** | 2026-11-06 |
| **Phase 2** | Shared UI primitives & Layout Parity | **DONE** | 2026-11-06 |
| **Phase 3** | Admin and Superadmin modules | **DONE** | 2026-11-06 |
| **Phase 4** | Teacher workspace & Quiz authoring | **DONE** | 2026-11-07 |
| **Phase 5** | Student portal & Quiz Taking (high-risk safeguards) | **DONE** | 2026-11-07 |
| **Phase 6** | Integration, React visual independence & auth routing | `PLANNED` | TBD |
| **Phase 7** | Optional Cleanup & Legacy retirement | `NOT STARTED` | TBD |

---

## 1. Authentication & System Core

| Feature | Django View / URL | Role | Risk | Status | Notes |
|---|---|---|---|---|---|
| React Auth & System Core Experience | `auth_core_shell_view` (`/auth-app/*`) | All | High | `IN PROGRESS` | Separate React entry exists; React success/error handling and primary auth routing remain to be integrated |
| Login & Session Handler | `login_view` (`/login/`) | All | High | `DONE` (Django backend) | Django remains the only credential/session authority and the HTML flow works; React JSON response mode is pending under the Auth & System Core work |
| Classic Django Login Page | `login_view` (`/login/`) | All | High | `RETAINED AS DJANGO` | Keep as an explicit fallback; normal React and expired-session flows should use `/auth-app/` |
| Logout (School Users) | `logout_view` (`/logout/`) | All | Low | `RETAINED AS DJANGO` | Session invalidation |
| Password Reset Flow | `auth_views.PasswordReset*` (`/password-reset/*`) | All | High | `RETAINED AS DJANGO` | Sensitive auth flow |
| Superadmin Login | `superadmin_login_view` (`/superadmin/login/`) | Superadmin | High | `RETAINED AS DJANGO` | Dedicated credential flow |
| Superadmin Logout | `superadmin_logout_view` (`/superadmin/logout/`) | Superadmin | Low | `RETAINED AS DJANGO` | Session invalidation |
| Session Keep-Alive | `extend_session_view` (`/extend-session/`) | All | Low | `DONE` (Django) / `PLANNED` (React wrapper) | Preserved |
| Current User API | `/api/v1/me/` | All | Low | `DONE` (Phase 1) | Identity & permissions bootstrap |
| React Workspace Shell & Design System | `react_app_shell_view` (`/app/*`) | All | Low | `IN PROGRESS` | Routes and features exist; shell/components still depend on Bootstrap and Django theme CSS, which Phase 6 will replace |

---

## 2. Superadmin Management (Phase 3)

| Feature | Django View / URL | Role | Risk | Status | Notes |
|---|---|---|---|---|---|
| Superadmin Dashboard | `superadmin_dashboard_view` (`/superadmin/dashboard/`) | Superadmin | Low | **DONE** | React route `/app/superadmin/dashboard` (`GET /api/v1/superadmin/dashboard/`); legacy template remains at `?classic=1` |
| School List & Search | `superadmin_school_list_view` (`/superadmin/schools/`) | Superadmin | Low | **DONE** | React route `/app/superadmin/schools` (`GET /api/v1/superadmin/schools/`); classic template requires `?classic=1` |
| School Detail | `superadmin_school_detail_view` (`/superadmin/schools/<id>/`) | Superadmin | Low | **DONE** | React route `/app/superadmin/schools/:id` (`GET /api/v1/superadmin/schools/<id>/`) |
| School Create / Edit | `superadmin_school_create_view`, `edit` | Superadmin | Medium | **DONE** | React form routes use multipart `POST /api/v1/superadmin/schools/` and `/api/v1/superadmin/schools/<id>/` |
| School Delete | `superadmin_school_delete_view` | Superadmin | High | **DONE** | React list action uses `DELETE /api/v1/superadmin/schools/<id>/`; deletion remains blocked when users, students, or teachers are linked |
| Administrator List & Filters | `superadmin_admin_list_view` (`/superadmin/admins/`) | Superadmin | Low | **DONE** | React route `/app/superadmin/admins`, search and school/status filters use `GET /api/v1/superadmin/admins/`; classic Django fallback requires `?classic=1` |
| Administrator Detail | `superadmin_admin_detail_view` (`/superadmin/admins/<id>/`) | Superadmin | Low | **DONE** | React route `/app/superadmin/admins/:id` with school, login, and account details |
| Administrator Create / Edit / Delete | `superadmin_admin_create/edit/delete` | Superadmin | Medium | **DONE** | React form preserves active-school assignment, password setup email on create, optional password change and active-state editing; delete prevents self-deletion |

---

## 3. School Admin Management (Phase 3)

| Feature | Django View / URL | Role | Risk | Status | Notes |
|---|---|---|---|---|---|
| Admin Dashboard | `admin_dashboard_view` (`/dashboard/admin/`) | Admin | Low | **DONE** | React route `/app/admin/dashboard` (`GET /api/v1/dashboard/admin/`), Django fallback retained |
| Academic Years | `academic_year_list_view` (`/academic-years/`) | Admin | Medium | **DONE** | React route `/app/admin/academic-years` (`/api/v1/academic-years/`), full CRUD & Set-Current, Django fallback retained |
| Terms | `term_list_view` (`/terms/`) | Admin | Medium | **DONE** | React route `/app/admin/terms` (`/api/v1/terms/`), full CRUD & Set-Current, Django fallback retained |
| Class Management | `class_list_view`, `class_detail_view` (`/classes/`) | Admin | Medium | **DONE** | React routes `/app/admin/classes` and `/app/admin/classes/:id`, cohort capacity, subjects assignment, archive/restore, Django fallback retained |
| Subject Management | `subject_list_view`, create, edit, archive, restore (`/subjects/`) | Admin, Superadmin | Medium | **DONE** | React route `/app/admin/subjects`; active/archived/all, search, department/learning-area/school filters, class and quiz counts, generated immutable codes, tenant-safe CRUD; archive deactivates active teacher assignments; legacy GET routes redirect with `?classic=1` fallback |
| Forms & Grade Levels | `form_list_view` and CRUD (`/forms/`) | Admin, Superadmin | Medium | **DONE** | React route `/app/admin/forms`; CRUD, search, student counts, tenant isolation, and student-linked delete protection |
| Learning Areas | `learning_area_list_view` and CRUD (`/learning-areas/`) | Admin, Superadmin | Medium | **DONE** | React route `/app/admin/learning-areas`; CRUD, search, student counts, tenant isolation, and student-linked delete protection |
| Departments | `department_list_view` and CRUD (`/departments/`) | Admin, Superadmin | Medium | **DONE** | React route `/app/admin/departments`; CRUD, head-of-department assignment, teacher counts, tenant isolation, and teacher-linked delete protection |
| School Settings & Profile | `school_detail_view`, `school_edit_view` (`/school/`, `/school/edit/`) | Admin | Medium | **DONE** | React route `/app/admin/school` supports complete identity/contact, logo/stamp, vision/mission, report/grading, active status and validated academic year/term settings; classic Django fallback requires `?classic=1` |
| Student Directory | `student_list_view`, `student_detail_view` | Admin | Low | **DONE** | React route `/app/admin/students` (`GET /api/v1/students/`), Django fallback retained |
| Student Profile | `student_profile_view` | Student | Low | **DONE** | React route `/app/student/profile` (`GET /api/v1/student/profile/`), personal details, class enrollment timeline, and assessment analytics, Django fallback retained |
| Student Import / Export | `student_bulk_import_view`, `student_export_view` | Admin | Medium | `RETAINED AS DJANGO` | Heavy Excel file processing |
| Student Class Enrollments | `student_enrollment_list_view`, create, edit, bulk create/delete | Admin, Superadmin | Medium | **DONE** | React route `/app/admin/enrollments` (`/api/v1/enrollments/*`); school/student/status/search filters, history-preserving transfers and unassignment, partial bulk outcomes, capacity and academic-year safeguards; legacy GET routes redirect, with `?classic=1` fallback |
| Teacher Directory | `teacher_list_view`, `teacher_detail_view` | Admin | Low | **DONE** | React route `/app/admin/teachers` (`GET /api/v1/teachers/`), Django fallback retained |
| Teacher Assignments | `assignment_list_view`, create, bulk create | Admin | Medium | **DONE** | React route `/app/admin/assignments` (`/api/v1/teacher-assignments/*`), single & bulk allocations, dynamic class subjects, reassignment history audit, Django fallback retained |
| User Account Management | `user_list_view`, bulk password reset | Admin | Medium | `NOT STARTED` | User administration |

---

## 4. Teacher Workspace (Phase 4)

| Feature | Django View / URL | Role | Risk | Status | Notes |
|---|---|---|---|---|---|
| Teacher Dashboard | `teacher_dashboard_view` (`/dashboard/teacher/`) | Teacher | Low | **DONE** | React route `/app/teacher/dashboard` (`GET /api/v1/dashboard/teacher/`), Django fallback retained |
| Quiz List & Filter | `quiz_list_view` (`/quizzes/`) | Teacher | Low | **DONE** | React route `/app/teacher/quizzes` (`GET /api/v1/teacher/quizzes/`), Django fallback retained |
| Quiz Detail | `quiz_detail_view` (`/quizzes/<id>/detail/`) | Teacher | Low | **DONE** | React route `/app/teacher/quizzes/:id` (`GET /api/v1/teacher/quizzes/<id>/`), Django fallback retained |
| Quiz Create / Edit | `quiz_create_view`, `quiz_edit_view` | Teacher | Medium | `RETAINED AS DJANGO` (Direct link) | Direct link provided to Django creator view |
| Question Management | `question_list_view`, create, edit, duplicate, reorder | Teacher | Medium | `RETAINED AS DJANGO` | Managed via Django admin/views |
| Quiz Class Assignments | `quiz_assignment_overview_view`, assign | Teacher | Medium | `NOT STARTED` | Assigning quizzes to classes |
| Quiz Grading Workflow | `quiz_grading_list_view`, attempt grading | Teacher | Medium | **DONE** | React route `/app/teacher/grading` (`GET /api/v1/teacher/grading/`), links to attempt grading |
| Quiz Results & Analytics | `quiz_results_list_view`, `quiz_result_detail_view` | Teacher | Low | **DONE** | React route `/app/teacher/results` (`GET /api/v1/teacher/results/`), Django fallback retained |
| Results Print & Export | `quiz_result_print_view`, `quiz_results_export_view` | Teacher | Low | `RETAINED AS DJANGO` | Print-optimized HTML / Excel export |

---

## 5. Student Learning Portal (Phase 5) - FULLY MIGRATED

| Feature | Django View / URL | Role | Risk | Status | Notes |
|---|---|---|---|---|---|
| Student Dashboard | `student_dashboard_view` (`/dashboard/student/`) | Student | Low | **DONE** | React route `/app/student/dashboard` (`GET /api/v1/dashboard/student/`), Django fallback retained |
| Available Quizzes List | `student_quiz_list_view` (`/quizzes/available/`) | Student | Low | **DONE** | React route `/app/student/quizzes` (`GET /api/v1/student/quizzes/`), Django fallback retained |
| Quiz Preview & Rules | `student_quiz_detail_view` (`/quizzes/<id>/preview/`) | Student | Low | **DONE** | React route `/app/student/quizzes/:id` (`GET /api/v1/student/quizzes/<id>/`), Django fallback retained |
| My Quiz Attempts & History | `student_quiz_attempts_view` (`/quizzes/my-attempts/`) | Student | Low | **DONE** | React route `/app/student/attempts` (`GET /api/v1/student/attempts/`), Django fallback retained |
| Quiz Result Detail | `student_quiz_result_detail_view` | Student | Low | **DONE** | React route `/app/student/attempts/:id/result` (`GET /api/v1/student/attempts/<id>/result/`), Django fallback retained |
| Student Profile & Records | `student_profile_view` (`/students/profile/`) | Student | Low | **DONE** | React route `/app/student/profile` (`GET /api/v1/student/profile/`), personal details, class enrollment timeline, and assessment analytics, Django fallback retained |
| Quiz Result Print | `student_quiz_result_print_view` | Student | Low | `RETAINED AS DJANGO` | Print layout retained via Django direct link |
| Quiz Start / Resume | `student_quiz_start_view`, `student_quiz_resume_view` | Student | High | **DONE** | `POST /api/v1/student/quizzes/<id>/start/` with session check, password verification, attempt initialization |
| Quiz Taking Interface | `student_quiz_take_view` (`/quizzes/attempts/<id>/take/`) | Student | High | **DONE** | React route `/app/student/take/:attemptId` (`GET /api/v1/student/attempts/<id>/take/`), server-authoritative timer, offline fallback |
| Quiz Answer Save (Autosave) | `student_quiz_save_view` (`/quizzes/attempts/<id>/save/`) | Student | High | **DONE** | `POST /api/v1/student/attempts/<id>/save/` with debounce autosave, local draft storage |
| Quiz Submission | `student_quiz_submit_view` (`/quizzes/attempts/<id>/submit/`) | Student | High | **DONE** | `POST /api/v1/student/attempts/<id>/submit/` with database-level row locking (`select_for_update()`) and idempotent scoring |

---

## 6. Integration, React Independence & Route Takeover (Phase 6)

| Integration Feature | Scope | Role | Status | Notes |
|---|---|---|---|---|
| Role-Based Entry Points | `/app/` catch-all auto-redirects based on `request.user.role` | All | **DONE** | Superadmin -> `/app/superadmin/dashboard`, Admin -> `/app/admin/dashboard`, Teacher -> `/app/teacher/dashboard`, Student -> `/app/student/dashboard` |
| Django -> React Navigation | Sidebars & Dashboards | All | **DONE** | "Switch to React SPA" buttons and contextual opt-in banners in `base.html`, `_menu_items.html`, `_superadmin_menu_items.html`, and all role dashboards |
| React -> Django Fallbacks | App Header, Sidebar, Take/Result Views | All | **DONE** | "Classic Django" header button and explicit fallback links across all React views |
| Client-Side Route Guards | `RoleGuard` component | All | **DONE** | Accessible "Access Restricted" alert blocking unauthorized role traversal prior to API calls |
| Dynamic Code-Splitting | `React.lazy` & Vite dynamic chunks | All | **DONE** | Role code-split into distinct chunks (`superadmin`, `admin`, `teacher`, `student`); students never download admin/teacher code |
| Performance Budget Compliance | Production static assets | All | **DONE** | Core bundle `index.js`: **72.70 KB gzipped** (well under 200 KB budget); Student Quiz Taking payload: **~76.5 KB gzipped** |
| React Visual Independence | `/app/*` and `/auth-app/*` shells/components | All | `IN PROGRESS` | Replace Bootstrap utility/component classes and Django theme dependencies with the React-owned design system |
| React Auth Entry & Failure Handling | `/auth-app/`, `/login/` | All | `IN PROGRESS` | Make React sign-in primary for React routes; preserve failure state in React and route 401 users to `/auth-app/?next=...` |
| Session & CSRF Enforcement | Server-authoritative session cookies | All | **DONE** | Django session and CSRF enforcement are authoritative; React auth-entry routing is tracked separately above |

---

## 7. Production Readiness, Container Build & Release Verification (Phase 7)

| Verification Area | Target / Standard | Verification Mechanism | Status | Notes |
|---|---|---|---|---|
| Multi-Stage Docker Build | Zero node_modules in runtime, compiled static assets in Python image | `Dockerfile` (Node 20 Alpine stage + Python 3.12 Slim runtime stage) | **DONE** | Validated multi-stage compilation output in `quiz_app/static/react/` |
| Static File Distribution | WhiteNoise with compression, zero manifest clashes | `python manage.py collectstatic --noinput` | **DONE** | 318 static assets collected; WhiteNoise `CompressedStaticFilesStorage` serves gzipped/brotli bundles |
| CI Pipeline Automation | Automated frontend + backend checks on push & PR | `.github/workflows/django-tests.yml` | **DONE** | Independent jobs for Node 20 (typecheck, vitest, build) and Python 3.12 (system check, regression tests) |
| Rollback Governance | 100% legacy fallback availability without downtime | Retained Django templates & views | **DONE** | Per ADR-013 and Section 5, retained pages remain permanently active as reliable fallbacks |
| Full Regression Suite | All foundation, admin, teacher, student, and integration tests | Django test runner + Vitest | **DONE** | **51/51 Django tests passed** (OK); **45/45 Vitest frontend tests passed across 11 test suites** |

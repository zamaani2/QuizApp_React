# React Frontend Architecture Decision Records (ADRs)

| Field | Value |
|---|---|
| Document status | **Active Architectural Log** |
| Last updated | 2026-11-09 |
| Governed by | `REACT_FRONTEND_MIGRATION_PLAN.md` |

This document records the architectural findings from the repository audit and the binding architectural decisions (ADRs) for the incremental React migration of QuizApp_Local.

---

## Repository Audit Findings (Section 12 Open Questions)

### Q1: API Framework Selection & Authentication
- **Finding (`VERIFIED`):** No API framework (such as Django REST Framework / DRF or Django Ninja) exists in `requirements.txt` or `quiz_system/settings.py` (`INSTALLED_APPS`).
- **Finding (`VERIFIED`):** Authentication is purely session-based (`django.contrib.sessions`, `AUTH_USER_MODEL = "quiz_app.User"` in `quiz_system/settings.py:232-250`).
- **Resolution:** Plain Django views returning `JsonResponse` will be used for the `/api/v1/` endpoints. Introducing DRF is rejected to avoid adding dependencies, changing packaging footprint, or splitting serializer/auth patterns. Every API endpoint leverages existing model logic, `login_required`, and session-based authentication.

### Q2: Static Files & Serving in Production
- **Finding (`VERIFIED`):** In `quiz_system/settings.py:219-226`, static files use `STATIC_URL = "static/"`, `STATIC_ROOT = BASE_DIR / "staticfiles"`, and `STATICFILES_DIRS = [BASE_DIR / "quiz_app" / "static"]`. When `DEBUG=False`, `STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"` and `whitenoise.middleware.WhiteNoiseMiddleware` is active.
- **Finding (`VERIFIED`):** No CDN or external object storage is used.
- **Resolution:** WhiteNoise's `CompressedStaticFilesStorage` works cleanly with Vite's hashed asset filenames (e.g., `assets/index-*.js`). Unlike Django's `ManifestStaticFilesStorage`, `CompressedStaticFilesStorage` compresses files with gzip/brotli without post-processing or re-hashing CSS/JS references, eliminating manifest collisions.

### Q3: Route Namespace Collisions
- **Finding (`VERIFIED`):** Inspected `quiz_system/urls.py` and `quiz_app/urls.py`. Current URL patterns begin with `login/`, `logout/`, `password-reset/`, `superadmin/`, `dashboard/`, `students/`, `enrollments/`, `academic-years/`, `terms/`, `forms/`, `learning-areas/`, `departments/`, `subjects/`, `classes/`, `teachers/`, `assignments/`, `school/`, `users/`, and `quizzes/`.
- **Resolution:** Neither `/app/` nor `/api/v1/` collides with any existing URL pattern.

### Q4: Multi-Tenant & School-Level Scoping Enforcement
- **Finding (`VERIFIED`):** School scoping is enforced by `TenantAccessMiddleware` (`quiz_app/middleware.py`), which intercepts requests to `quiz_app.views` (except login/logout) and verifies `get_user_school(request)` is not `None` unless the user is an authorized superadmin (`is_authorized_superadmin(request.user)`).
- **Finding (`VERIFIED`):** Database queries use helper functions in `quiz_app/utils/tenant_utils.py`:
  - `get_user_school(request)`
  - `filter_by_school(queryset, request, school_field="school")`
  - `get_object_or_404_with_school(model, request, pk=None, ...)`
  - `get_write_school(request, target_school_id=None)`
- **Resolution:** All new `/api/v1/` endpoints must strictly use these utilities and fail closed.

### Q5: CSS Framework & Potential Style Interference
- **Historical finding:** The retired Django layout loaded Bootstrap and multiple competing icon/theme styles.
- **Current resolution:** Django feature templates and their shared layout have been removed. React owns page styling; only React mount shells remain in Django templates.

### Q6: Quiz Attempt, Timer, and Scoring Authoritativeness
- **Finding (`VERIFIED`):** `QuizAttempt.submit()`, `QuizAttempt.calculate_score()`, `QuizAttempt.is_time_expired()`, and question response correctness checks (`quiz_app/models.py:2598-2749`) are entirely executed on the backend.
- **Finding (`VERIFIED`):** `quiz_app/views/student_quiz_management.py:509-640` (`student_quiz_take_view`) does not send correct answer choices to the client. Responses are saved via POST (`student_quiz_save_view`) and finalized with `_submit_attempt_safely()`.
- **Resolution:** The React student quiz module will adhere to these server-authoritative rules.

### Q7: Frontend & JavaScript Test Infrastructure
- **Current finding (`VERIFIED`):** `frontend/package.json` defines Vite, React, TypeScript, Vitest, and React Testing Library scripts.
- **Finding (`VERIFIED`):** Playwright E2E browser tests exist in `quiz_app/test_browser_stabilisation.py` and run via the Django test runner (`python manage.py test quiz_app.test_browser_stabilisation`) when `PLAYWRIGHT_E2E=1`.
- **Resolution:** Keep frontend tests in `frontend/` and backend tests in Django; run both when changing shared flows.

### Q8: Docker Build and CI Pipeline
- **Finding (`VERIFIED`):** `Dockerfile` is a single-stage Python 3.12-slim image. `entrypoint.sh` runs `python manage.py collectstatic --noinput` followed by `gunicorn`.
- **Finding (`VERIFIED`):** CI in `.github/workflows/django-tests.yml` tests Python code with SQLite.
- **Resolution:** Dockerfile can be structured as a multi-stage build: a Node 20 stage builds `frontend/` into `frontend/dist/` (or directly into `quiz_app/static/react/`), and the Python runtime stage collects it. The Docker build must remain resilient when frontend is absent.

### Q9: Layout Fragments and Shell Parity
- **Current finding:** The legacy Django base layout and navigation fragments have been removed.
- **Resolution:** React owns the authenticated application layout. `react_app.html` and `auth_core_app.html` only mount the production React bundles.

---

## Architectural Decision Records

### ADR-001: Plain Django JsonResponse Views for API Layer
- **Status:** ACCEPTED
- **Context:** The project does not currently use Django REST Framework (DRF). The plan allows either DRF or plain `JsonResponse` views, deciding after audit.
- **Decision:** Implement all `/api/v1/` endpoints using standard Django class-based or function views returning `django.http.JsonResponse`.
- **Consequences:**
  - Zero new third-party Python dependencies in `requirements.txt`.
  - Native integration with Django's `CsrfViewMiddleware` and `TenantAccessMiddleware`.
  - Consistent error response structure: `{"code": "...", "message": "...", "fields": {}}`.

### ADR-002: Same-Origin Hosting via WhiteNoise
- **Status:** ACCEPTED
- **Context:** Deciding how React assets are built and served.
- **Decision:** React production build assets are output into `quiz_app/static/react/` and collected by `python manage.py collectstatic`. WhiteNoise serves them on the same origin.
- **Consequences:**
  - No CORS configuration required.
  - Session cookies and CSRF cookies work without cross-site cookie restrictions (`SameSite=Lax`).
  - Single deployment container on Railway.

### ADR-003: `/app/` React Shell Route and Catch-All
- **Status:** ACCEPTED
- **Context:** React routing needs to coexist with Django routes without URL clashes.
- **Decision:** Django registers `/app/` and `/app/<path:path>` pointing to a single Django view `react_app_shell_view`. This view renders `quiz_app/react_app.html`, decorated with `@ensure_csrf_cookie`.
- **Consequences:**
  - React Router handles client-side routing exclusively under `/app/*`.
  - Existing Django routes remain 100% operational.
  - Direct browser navigations to `/app/...` load the React shell and initialize user context.

### ADR-004: Session Authentication & CSRF
- **Status:** ACCEPTED
- **Context:** Authentication strategy for React frontend.
- **Decision:** Rely exclusively on Django session cookies (`sessionid`) and CSRF tokens (`csrftoken`). The React shell or initial `GET /api/v1/me/` ensures the CSRF cookie is present. The React API client passes `credentials: "same-origin"` and attaches the `X-CSRFToken` header on state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Consequences:**
  - No JWTs or separate token storage.
  - If a session expires, API requests return HTTP 401; React directs users to `/auth-app/?next=` preserving the same-origin destination (updated by ADR-016). There is no Django-rendered login fallback.

### ADR-005: Frontend Stack: React 18/19, TypeScript Strict, Vite, Vitest
- **Status:** ACCEPTED
- **Context:** Tooling for `frontend/` directory.
- **Decision:** Use Vite with React and TypeScript (`"strict": true`). Vitest + React Testing Library for frontend unit/integration testing.
- **Consequences:**
  - High development velocity with Vite HMR.
  - Type safety across all API client calls and UI props.
  - Fast unit tests matching the Node 20+ runtime.

### ADR-006: Shared UI Component Architecture & Layout Parity
- **Status:** ACCEPTED
- **Context:** Phase 2 requires visual parity with Django's layout and reusable UI primitives (Table, Form, Modal, Button, Alert).
- **Decision:** Implement the AppShell using the exact DOM structure and CSS classes (`app-wrapper`, `app-header`, `app-sidebar`, `app-main`, `app-content-header`, `app-content`, `app-footer`) already styled in `academic_pro_theme.css`. Reusable primitives (`DataTable`, `Modal`, `FormField`, `Button`, `Alert`, `ErrorBoundary`) adhere strictly to Bootstrap 5 markup standards.
- **Consequences:**
  - Zero visual disconnect when transitioning between Django views and React views.
  - Reusable components are fully typed, accessible, and testable across subsequent phases.

### ADR-007: Theme Accent Synchronization
- **Status:** ACCEPTED
- **Context:** DECISIONS.md mandates that QuizApp_Local supports only the four existing accent themes (`academic`, `green`, `purple`, `red`) through the `preferredTheme` key.
- **Decision:** The React `ThemeSelector` component and `AuthContext` synchronize the active accent theme by reading/writing `localStorage.preferredTheme` and toggling `data-app-theme` and active theme page classes on `document.documentElement` and `document.body`.
- **Consequences:**
  - Consistent appearance across Django and React frontends.
  - Theme choices persist across browser sessions and cross-frontend navigation.

### ADR-008: React Router under `/app/` Subpath
- **Status:** ACCEPTED
- **Context:** Multiple pages and views are being introduced in Phase 3 (Admin Students, Admin Teachers, Admin Dashboard, Superadmin Schools, Superadmin Admins). Fast client-side navigation without full page reloads is desirable while keeping Django catch-all routing.
- **Decision:** Use `react-router-dom` with `<BrowserRouter basename="/app">`. Routes are registered cleanly (`/`, `/admin/dashboard`, `/admin/students`, `/admin/teachers`, `/superadmin/schools`, `/superadmin/admins`).
- **Consequences:**
  - Zero round-trip latency when navigating between React-rendered views.
  - Browser history, back/forward buttons, and deep linking are maintained.
  - Existing Django navigation cross-links to `/dashboard/`, `/quizzes/`, etc. remain regular links.

### ADR-009: Teacher Workspace API Architecture and Multi-Tenant Scoping
- **Status:** ACCEPTED
- **Context:** Phase 4 requires migrating the Teacher workspace (dashboard, quiz management, quiz preview, results analytics, and manual grading queue) to React while strictly preserving the server-rendered Django login system and all legacy views as fallbacks.
- **Decision:**
  - Implement 5 dedicated JSON endpoints: `GET /api/v1/dashboard/teacher/`, `GET /api/v1/teacher/quizzes/`, `GET /api/v1/teacher/quizzes/<id>/`, `GET /api/v1/teacher/results/`, and `GET /api/v1/teacher/grading/`.
  - Multi-tenant and role-scoping: Teachers are restricted strictly to their own assigned quizzes and student submissions within their school (`request.user.school`). Admins can inspect any teacher's quizzes within their school. Students receive 403 Forbidden.
  - Frontend views mount under `/app/teacher/*` in React Router (`/app/teacher/dashboard`, `/app/teacher/quizzes`, `/app/teacher/quizzes/:id`, `/app/teacher/results`, `/app/teacher/grading`).
  - Existing Django views (`/dashboard/teacher/`, `/quizzes/`, `/quizzes/<id>/detail/`, `/quizzes/results/`, `/quizzes/grading/`) remain completely unmodified as fallbacks.
- **Consequences:**
  - Zero disruption to existing quiz workflows.
  - Teachers get modern, fast, searchable tables with instant pagination and stats overview.
  - Strict isolation prevents cross-teacher and cross-school data leaks.

### ADR-010: Student Portal & High-Risk Quiz Taking Architecture and Safeguards
- **Status:** ACCEPTED
- **Context:** Phase 5 encompasses the Student Learning Portal (dashboard, available quizzes list, quiz preview & rules, attempts history, and result detail) and the mission-critical Quiz Taking flow. Section 8 of `REACT_FRONTEND_MIGRATION_PLAN.md` establishes rigorous rules: server-authoritative timer and scoring, zero leak of correct answers prior to submission, idempotent submission, resilient autosave, and instantaneous fallback to legacy Django views.
- **Decision:**
  - Implement 9 dedicated JSON endpoints:
    - Read-only: `GET /api/v1/dashboard/student/`, `GET /api/v1/student/quizzes/`, `GET /api/v1/student/quizzes/<id>/`, `GET /api/v1/student/attempts/`, `GET /api/v1/student/attempts/<id>/result/`.
    - Quiz-taking flow: `POST /api/v1/student/quizzes/<id>/start/`, `GET /api/v1/student/attempts/<id>/take/`, `POST /api/v1/student/attempts/<id>/save/`, `POST /api/v1/student/attempts/<id>/submit/`.
  - **Zero Answer Leak:** In `GET /api/v1/student/attempts/<id>/take/`, answer choices never expose `is_correct` or answer keys. Only question text, type, marks, order, and choice IDs/text are returned.
  - **Server-Authoritative Timing:** Server calculates `time_remaining_seconds` based on `started_at` and `time_limit`. If expired during take, save, or submit, the backend auto-submits via `_submit_attempt_safely()` and returns `submitted: true`.
  - **Idempotency:** `POST /api/v1/student/attempts/<id>/submit/` utilizes transaction lock `select_for_update()`. Subsequent submit requests return the already finalized score without double counting.
  - **Autosave & Connection Resilience:** Student responses are sent asynchronously on choice selection or text blur. React maintains a backup draft in `localStorage` under `quiz_draft_${attemptId}` to safeguard against connectivity interruption.
  - **Instant Fallback:** All React quiz pages feature direct links to classic Django views (`/quizzes/available/`, `/quizzes/<id>/preview/`, `/quizzes/attempts/<id>/take/`, `/quizzes/attempts/<id>/result/`, `/quizzes/attempts/<id>/result/print/`).
- **Consequences:**
  - High fidelity and security: student assessments cannot be cheated via inspect element or network tab inspection.
  - Fail-safe user experience during quizzes with multiple recovery paths.

### ADR-011: Phase 6 Integration, Navigation Cross-Links, Role-Based Route Guards & Code-Splitting
- **Status:** ACCEPTED
- **Context:** Phase 6 integrates the hybrid Django/React architecture. Per `REACT_FRONTEND_MIGRATION_PLAN.md` Section 4.6 and Section 6, the system must:
  1. Provide seamless bi-directional navigation cross-links between classic Django views and modern React views with clear opt-in and rollback mechanisms.
  2. Implement client-side role guards to block inappropriate route traversal before API calls occur (e.g. students accessing admin routes).
  3. Code-split the React application per role area (`React.lazy` and dynamic imports) so that students never download admin or teacher code bundles, minimizing bandwidth on low-end devices.
  4. Ensure server-side authentication remains fully authoritative and unauthenticated visitors are redirected to `/login/?next=...`; ADR-016 updates the React destination to `/auth-app/?next=...`.
- **Decision:**
  - **Bi-Directional Navigation Cross-Links:**
    - Django layouts (`base.html`, `_menu_items.html`, `_superadmin_menu_items.html`) and key dashboards display "Switch to React SPA" actions and contextual opt-in banners linking directly to `/app/*`.
    - React layouts (`Header.tsx`, `Sidebar.tsx`) and views retain explicit "Classic Django View" rollback buttons.
  - **Role-Based Client Route Guards:**
    - Implement `<RoleGuard allowedRoles={[...]} fallbackPath="...">` in React Router to prevent unauthorized client-side route access.
    - If a user navigates to an unauthorized route, they see an accessible "Access Denied" notice with a direct link back to their role's home view.
  - **Dynamic Code-Splitting by Role:**
    - Wrap role route trees in `React.lazy()` chunks (`admin`, `teacher`, `student`, `superadmin`).
    - Core bundle only delivers the AppShell, authentication context, and navigation primitives (~80 KB gzipped). Role-specific chunks load on-demand.
  - **Route Takeover Governance:**
    - React views under `/app/*` serve as the primary interactive experience for migrated modules.
    - Legacy Django views remain 100% active and maintained as zero-latency failover fallbacks.
- **Consequences:**
  - Fulfills Section 4.6 code-splitting mandate; students experience rapid load times without downloading administrative components.
  - Users have full autonomy to switch between React and Django interfaces without breaking state or sessions.
  - Zero disruption to legacy workflows.

### ADR-012: Optional React Authentication & System Core Portal
- **Status:** ACCEPTED
- **Context:** The migration inventory retained authentication pages as Django-rendered, while the maintainer requested an additional React Authentication & System Core frontend that can be used alongside the existing React workspace and Django pages.
- **Decision:**
  - Add a separate Vite entry at `/auth-app/*`, independent from the authenticated `/app/*` workspace.
  - Django remains authoritative for login validation, session cookies, logout, password reset, and superadmin authentication. The React sign-in form submits to the existing CSRF-protected `/login/` handler; recovery and superadmin links continue to their existing Django routes.
  - The portal reads the signed-in identity from the existing `GET /api/v1/me/` endpoint and provides workspace and Django logout links. No new credential API, token store, or identity provider is added.
  - Existing Django auth pages and the `/app/*` workspace remain usable without redirection or route takeover.
- **Consequences:**
  - Authenticated users can inspect session identity and continue to the existing React workspace from a dedicated React entry.
  - Django owns all security-sensitive authentication behavior, preserving the existing session and CSRF model.
  - Failed credential submissions continue through the existing Django login response, preserving its established error handling and messages.

### ADR-013: Production Readiness, Multi-Stage Docker Build, CI Pipeline & Rollback Governance
- **Status:** ACCEPTED
- **Context:** Phase 7 concludes the incremental React frontend migration roadmap. Per `REACT_FRONTEND_MIGRATION_PLAN.md` Sections 4.8, 5, and 6, the release must verify containerized build automation, WhiteNoise static asset serving, CI integration, and formalize rollback governance. Section 5 explicitly specifies that retained Django views represent a valid, safe end state.
- **Decision:**
  - **Zero-Downtime Rollback Governance:** Rather than retiring legacy Django templates, all Django views and templates are permanently preserved as active, high-availability fallbacks. Bi-directional cross-links enable instant switching without system modifications.
  - **Multi-Stage Container Build:** The production `Dockerfile` is structured as a two-stage build:
    1. `frontend-builder` (Node 20 Alpine) installs dependencies and compiles TypeScript into `quiz_app/static/react/`.
    2. Runtime stage (Python 3.12-slim) bundles the compiled static assets and runs `collectstatic` for WhiteNoise compressed distribution.
  - **Continuous Integration (CI):** `.github/workflows/django-tests.yml` runs automated checks for both stacks:
    - Frontend: `npm run typecheck`, `npm test` (Vitest, 11 suites / 45 tests), `npm run build`.
    - Backend: `python manage.py check`, `python manage.py test` (51 regression tests).
  - **Performance Compliance:** Initial gzipped JavaScript payload is strictly under budget at **72.87 KB gzipped** (target < 200 KB), with individual role feature chunks loading on-demand (1–3 KB gzipped each).
- **Consequences:**
  - The migration is production-ready and fully verified.
  - The application provides modern, responsive SPA capabilities while retaining 100% operational safety and legacy fallback reliability.

### ADR-014: Academic Structure & School Setup Full CRUD React Migration
- **Status:** ACCEPTED
- **Context:** Following completion of core viewing and examination workflows, the administrative foundational setup workflows (Academic Years, Terms, Classes, Subjects, and School Settings) are being migrated from legacy modal-wrapped Django HTML into native React components under `/app/admin/*`.
- **Decision:**
  - **RESTful Endpoints:** Implement uniform JSON endpoints for all academic entities with full CRUD support:
    - Academic Years: `GET`, `POST /api/v1/academic-years/`, `PUT`, `DELETE /api/v1/academic-years/<id>/`, `POST /api/v1/academic-years/<id>/set-current/`.
    - Terms: `GET`, `POST /api/v1/terms/`, `PUT`, `DELETE /api/v1/terms/<id>/`, `POST /api/v1/terms/<id>/set-current/`.
    - Classes: `GET`, `POST /api/v1/classes/`, `GET`, `PUT`, `DELETE /api/v1/classes/<id>/`, `POST /api/v1/classes/<id>/restore/`, `POST /api/v1/classes/<id>/subjects/add/`, `DELETE /api/v1/classes/<id>/subjects/<cs_id>/remove/`.
    - Subjects: `GET`, `POST /api/v1/subjects/`, `PUT`, `DELETE /api/v1/subjects/<id>/`, `POST /api/v1/subjects/<id>/restore/`.
    - School Settings: `GET`, `PUT /api/v1/school/`.
    - Structure Lookups: `GET /api/v1/structure-lookups/` providing consolidated options for dropdowns.
  - **Fail-Closed Tenancy & Permissions:** Restricted strictly to `admin` and `superadmin`. Strict multi-tenant scoping ensures administrators can only read or mutate records belonging to their active `request.user.school`.
  - **Safety Checks:** Academic Year deletion is guarded against removing active terms/classes/quizzes/attempts. Soft deletion (archive/restore) is supported for Classes and Subjects.
  - **Component Architecture:**
    - Mount components under React Router: `/app/admin/academic-years`, `/app/admin/terms`, `/app/admin/classes`, `/app/admin/classes/:id`, `/app/admin/subjects`, and `/app/admin/school`.
    - Interactive modals for Create/Edit using existing accessible `Modal`, `FormField`, and `Button` primitives.
    - Deep linking and two-way fallbacks back to classic Django views remain intact.
- **Consequences:**
  - School administrators can fully configure academic periods, classes, subjects, and school parameters directly within the high-speed SPA.
  - Eliminates slow server-side modal reloads while preserving existing business logic and database constraints.

### ADR-015: Academic Allocations: Student Class Enrollments and Teacher Subject Assignments Full React Migration
- **Status:** ACCEPTED
- **Context:** Following the migration of the core academic structure (years, terms, classes, subjects), the operational allocation layers—Student Class Enrollments (`StudentClass`) and Teacher Subject Assignments (`TeacherSubjectAssignment` & `ClassTeacher`)—are being migrated into dedicated, accessible React SPA modules under `/app/admin/*`.
- **Decision:**
  - **RESTful Endpoints:** Implement uniform JSON endpoints for allocations with atomic transaction handling:
    - Enrollments: `GET`, `POST /api/v1/enrollments/`, `POST /api/v1/enrollments/bulk/`, `PUT`, `DELETE /api/v1/enrollments/<id>/`, `POST /api/v1/enrollments/bulk-delete/`, `GET /api/v1/enrollments/lookups/`.
    - Teacher Assignments: `GET`, `POST /api/v1/teacher-assignments/`, `POST /api/v1/teacher-assignments/bulk/`, `PUT`, `DELETE /api/v1/teacher-assignments/<id>/`, `GET /api/v1/teacher-assignments/lookups/`, `GET /api/v1/teacher-assignments/class-subjects/`.
  - **Capacity and Curriculum Validation:**
    - Student enrollment strictly checks target class capacity (`class_obj.is_class_full()`) and student active status. Re-enrolling a student automatically deactivates their previous active enrollment in atomic transactions.
    - Teacher subject assignment strictly enforces `ClassSubject` association (the subject must already be assigned to the class for that academic year). Reassigning tracks the previous teacher in `previous_teacher`.
  - **Component Architecture:**
    - Mount components under React Router: `/app/admin/enrollments` and `/app/admin/assignments`.
    - Single and bulk assignment modals with interactive multi-selects and capacity warnings.
    - Two-way fallbacks to classic Django views (`/enrollments/` and `/assignments/`) preserved in navigation and headers.
- **Consequences:**
  - Administrators can effortlessly manage student cohorts and teacher workloads directly inside the React interface.
  - Zero disruption: existing Django views, bulk import workflows, and database integrity rules remain fully functional.

### ADR-016: React-Owned Design System and Authentication Entry
- **Status:** ACCEPTED
- **Context:** The current React workspace is served at `/app/*`, but its shell and components depend on Bootstrap and Django theme CSS. The separate `/auth-app/*` entry exists, but normal sign-in and expired-session flows still lead to the server-rendered Django login page. The target is a distinct React frontend using the same Django backend, while the existing Django UI remains usable as a fallback.
- **Decision:**
  - **Same backend and origin:** Continue serving React assets through Django and use the existing database, APIs, Django session cookie, CSRF protection, and authorization. Do not introduce a second backend, identity provider, token store, or frontend deployment.
  - **React-owned styling:** The `/app/*` and `/auth-app/*` shells must not load Bootstrap CSS/JavaScript, Bootstrap Icons, or Django theme styles. React components must not rely on Bootstrap classes. Replace these dependencies in stages with React-owned responsive layout, design tokens, scoped CSS, and shared React components. Django templates remain unchanged by this styling migration.
  - **Separate documents:** Django-to-React controls are links between separate pages; the React shell does not extend or mount within the Django base template. React-to-Django links remain explicit fallback navigation.
  - **Primary React sign-in:** `/auth-app/` is the React sign-in and system-core entry. The existing Django `/login/` handler remains the credential and session authority and keeps its HTML behavior for classic users. React submits to that same handler in JSON mode, including CSRF and existing remember-me behavior. Success returns a server-validated same-origin redirect target; failed credentials return a generic error that React displays without sending the user to the Django login template.
  - **Session expiry:** React workspace 401 states link to `/auth-app/` with the current same-origin destination as `next`. The React sign-in flow returns users to that validated destination after successful login. Django password recovery and the dedicated superadmin login remain available as explicit classic flows.
  - **Migration order:** Replace Bootstrap-dependent shared components and feature classes before removing Bootstrap assets from `react_app.html`. Keep the old Django frontend and direct routes operational throughout.
- **Consequences:**
  - The React frontend becomes visually independent while continuing to use Django as its sole backend and security boundary.
  - Login success and failure stay within the React experience, while classic Django sign-in remains a fallback.
  - ADR-006's Bootstrap markup/parity requirement, ADR-011's React auth redirect destination, and ADR-012's optional-only auth presentation are superseded to the extent they conflict with this decision; their historical context remains recorded.
  - ADR-013's production-readiness findings cover the implementation verified at that time; they do not close the new Phase 6 visual-independence or React auth-routing criteria.

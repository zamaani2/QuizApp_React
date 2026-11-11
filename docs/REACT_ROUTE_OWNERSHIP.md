# React Route Ownership

The React/Vite frontend owns all application page presentation. Django remains
the authentication, session, API, and data backend.

## Local development and production

| Environment | User-facing app | Backend |
|---|---|---|
| Vite development | `http://localhost:5173/app/student/` (and other `/app/*` React routes) | Django at `http://127.0.0.1:8000`, reached through the Vite proxy |
| Production | `/app/*` and `/auth-app/*` | Django serves the React mount shells/static bundles and the API |

The Vite origin is the development UI URL. The Vite proxy sends `/api/*`,
authentication, session, and other configured backend requests to Django.
Port `8000` is not the normal browser-facing app URL during Vite development.

## React-owned routes

| React route | Owner | Django data/auth surface |
|---|---|---|
| `/auth-app/*` | React authentication and account-recovery UI | `/api/v1/me/`, `/login/`, `/superadmin/login/`, `/logout/`, `/password-reset/*` |
| `/app/superadmin/*` | React superadmin workspace | `/api/v1/superadmin/*`, `/api/v1/users/` |
| `/app/admin/*` | React school-administration workspace | `/api/v1/dashboard/admin/`, `/api/v1/students/`, `/api/v1/teachers/`, `/api/v1/users/`, `/api/v1/classes/`, `/api/v1/subjects/`, `/api/v1/academic-years/`, `/api/v1/terms/`, `/api/v1/school-structure/*`, `/api/v1/enrollments/`, `/api/v1/teacher-assignments/` |
| `/app/teacher/*` | React teacher workspace | `/api/v1/dashboard/teacher/`, `/api/v1/teacher/*` (including quiz, section, stimulus-group, question assignment, and grading writes) |
| `/app/student/*` | React student workspace | `/api/v1/dashboard/student/`, `/api/v1/student/*` (including section-aware quiz taking and section submission) |

## Legacy Django URLs

Retired page GET routes redirect to a React route; a `?classic=1` query does
not restore Django presentation. Authentication pages redirect to the React
auth shell, logout is POST-only, and API, utility, and download endpoints keep
their backend responses. Legacy student, teacher, user, quiz, question, assignment, and grading
mutation handlers return `410 Gone` with a pointer to the corresponding
`/api/v1/` endpoint. React feature screens use the versioned JSON APIs for
directory writes, assessment writes, imports, exports, and bulk actions.
Password-reset links open the React auth shell, while Django validates the
email request and one-time reset token and sends email.

The only Django templates retained are `react_app.html` and
`auth_core_app.html`. They are mount shells, not feature UIs. See
[LEGACY_DJANGO_TEMPLATE_CATALOG.md](./LEGACY_DJANGO_TEMPLATE_CATALOG.md) for
the template inventory and retirement policy.

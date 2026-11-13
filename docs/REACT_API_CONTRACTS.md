# React API Contracts & Specifications

| Field | Value |
|---|---|
| Document status | **Authoritative API Specification** |
| Version | 1.3 |
| Last updated | 2026-11-12 |
| Governed by | `REACT_FRONTEND_MIGRATION_PLAN.md` |

This document defines the formal request and response schemas for all `/api/v1/` endpoints, plus the React response mode planned for Django's existing `/login/` handler. Contracts must be documented here before backend implementation and frontend consumption.

---

## 1. Conventions & Standards

### 1.1 Base URL & Versioning
- All API routes are prefixed with `/api/v1/`.
- Trailing slashes are required to align with Django's URL dispatcher conventions (`APPEND_SLASH=True`).

### 1.2 Authentication & Headers
- **Session Authentication:** Every request must include the session cookie (`sessionid`).
- **CSRF Token:** State-modifying requests (`POST`, `PUT`, `PATCH`, `DELETE`) must include the `X-CSRFToken` header matching the `csrftoken` cookie.
- **Credentials:** Fetch / Axios requests must specify `credentials: "same-origin"`.

### 1.3 Standard Error Format
All non-2xx responses return a consistent JSON error envelope:

```json
{
  "code": "ERROR_CODE_STRING",
  "message": "Human-readable explanation of the error",
  "fields": {
    "field_name": ["Validation error message for this specific field"]
  }
}
```

Standard HTTP status codes:
- `400 Bad Request` — Validation failures, malformed input payload (`code: "VALIDATION_ERROR"`).
- `401 Unauthorized` — Missing or expired session cookie (`code: "UNAUTHORIZED"`).
- `403 Forbidden` — User lacks role permission or tenant/school scope (`code: "FORBIDDEN"`).
- `404 Not Found` — Resource does not exist or belongs to another tenant/school (`code: "NOT_FOUND"`).
- `405 Method Not Allowed` — HTTP verb not allowed for this route (`code: "METHOD_NOT_ALLOWED"`).
- `409 Conflict` — The change is blocked by assessment state or history (`QUIZ_NO_QUESTIONS`, `QUIZ_NO_CLASSES`, `INVALID_AVAILABILITY_DATES`, `INVALID_TIME_LIMIT`, `QUIZ_NOT_PUBLISHED`, `RESULTS_ALREADY_IMMEDIATE`, `QUIZ_HAS_ATTEMPTS`, `QUESTION_HAS_ATTEMPTS`, or `CHOICE_HAS_ATTEMPTS`).
- `500 Internal Server Error` — Unhandled server error (`code: "SERVER_ERROR"`).

### 1.4 Standard Pagination Format (When Querying Collections)
```json
{
  "count": 42,
  "next": "/api/v1/items/?page=2",
  "previous": null,
  "results": []
}
```

---

## 2. Phase 1 Core Endpoints

### 2.1 Current User Context (`GET /api/v1/me/`)
Retrieves identity, profile, school context, and role capabilities for the currently authenticated session.

- **URL:** `/api/v1/me/`
- **Method:** `GET`
- **Auth Required:** Yes (Session)
- **Permissions:** Any authenticated active user (`admin`, `teacher`, `student`, `superadmin`).

#### Response: `200 OK`
```json
{
  "user": {
    "id": 1,
    "username": "jdoe",
    "email": "jdoe@school.edu",
    "first_name": "John",
    "last_name": "Doe",
    "full_name": "John Doe",
    "role": "admin",
    "is_superadmin": false
  },
  "school": {
    "id": 10,
    "name": "Springfield High",
    "code": "SPH-01",
    "logo_url": null,
    "is_active": true
  },
  "profile": {
    "type": "admin",
    "id": 1,
    "teacher_id": null,
    "student_id": null,
    "department": null,
    "current_class": null
  },
  "ui_preferences": {
    "theme": "academic"
  }
}
```

*Notes for other roles:*
- For `teacher`: `profile.type = "teacher"`, `profile.teacher_id = "TCH-001"`, `profile.department = "Science"`.
- For `student`: `profile.type = "student"`, `profile.student_id = "STD-001"`, `profile.current_class = {"id": 5, "name": "Grade 10A"}`.
- For `superadmin`: `school` is `null` (unless viewing a targeted school).

#### Response: `401 Unauthorized`
```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required. Please log in."
}
```

#### Response: `403 Forbidden`
(Occurs if an authenticated school user has no valid school association):
```json
{
  "code": "FORBIDDEN",
  "message": "A valid school association is required."
}
```

---

### 2.2 Extend Session (`POST /api/v1/extend-session/` / `/extend-session/`)
Extends the current Django session age.

- **URL:** `/extend-session/` (existing) and `/api/v1/extend-session/` (alias)
- **Method:** `POST`
- **Auth Required:** Yes
- **Headers:** `X-CSRFToken`

#### Response: `200 OK`
```json
{
  "success": true,
  "expiry_seconds": 28800
}
```

### 2.3 React Sign-In Mode (Existing `POST /login/`)
The React Authentication & System Core uses the existing Django login handler. This is a response mode on the existing route, not a second authentication endpoint or authentication implementation.

- **URL:** `/login/?next=<same-origin-path>`
- **Method:** `POST`
- **Auth Required:** No
- **Request Content-Type:** `application/x-www-form-urlencoded`
- **Request Headers:** `Accept: application/json`, `X-CSRFToken`
- **Request Fields:** `username`, `password`, optional `remember=on`
- **Session:** On success, Django sets the ordinary session cookie. The React client must use `credentials: "same-origin"`.
- **Redirect Safety:** Django validates `next` against the request host. A client-supplied redirect is never trusted or returned without server validation.
- **Legacy Behavior:** Requests without `Accept: application/json` keep the existing Django HTML behavior and remain available as a fallback.

#### Response: `200 OK`
```json
{
  "success": true,
  "redirect_url": "/app/"
}
```

`redirect_url` is chosen and validated by Django. It uses the valid `next` path when provided, otherwise the existing role-appropriate destination. React navigates to this URL after the session is established.

#### Response: `401 Unauthorized`
```json
{
  "code": "INVALID_CREDENTIALS",
  "message": "Invalid username or password. Please try again."
}
```

Credential failures use a generic message and do not disclose whether an account exists. React displays the message in the current auth view.

#### Response: `400 Bad Request`
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Please enter your username or email."
}
```
The message identifies the missing field (`username` or `password`).

#### Response: `403 Forbidden`
```json
{
  "code": "ACCOUNT_INACTIVE",
  "message": "Your account has been deactivated. Please contact an administrator."
}
```

#### Special Role Case
Valid superadmin credentials submitted through the school-user login flow do not establish a session. Django returns `409 Conflict` with `code: "SUPERADMIN_LOGIN_REQUIRED"` and `redirect_url: "/superadmin/login/"`; React links to this existing flow rather than exposing a superadmin session through the school-user portal.

---

## 3. Phase 3 Endpoints (Admin & Superadmin)

### 3.1 Superadmin Schools (`GET, POST /api/v1/superadmin/schools/`)
- **URL:** `/api/v1/superadmin/schools/`
- **Methods:** `GET`, `POST`
- **Auth Required:** Yes
- **Permissions:** `role == "superadmin"` only (enforced fail-closed, returns 403 for non-superadmins).
- **POST Request:** `multipart/form-data` with required `name`, `short_name`, `address`, and `phone_number`; optional contact, image, report, and vision/mission fields use the names in the school form. Academic settings are configured after school creation.
- **POST Response `201 Created`:** `{ "success": true, "message": "...", "school_id": 1 }`.
- **Query Params:**
  - `search` (optional string): filters by name, short_name, school_code, address.
  - `is_active` (optional string): `"true"`, `"false"`, or empty for all.
- **Response `200 OK`:**
```json
{
  "count": 2,
  "results": [
    {
      "id": 1,
      "name": "Springfield High",
      "short_name": "SPH",
      "school_code": "SPH01",
      "slug": "springfield-high",
      "address": "742 Evergreen Terrace",
      "phone_number": "555-0100",
      "email": "info@springfield.edu",
      "website": "https://springfield.edu",
      "is_active": true,
      "current_academic_year": "2026-2027",
      "total_students": 450,
      "total_teachers": 32,
      "total_classes": 12
    }
  ]
}
```

### 3.2 Superadmin School Detail (`GET, POST, DELETE /api/v1/superadmin/schools/<id>/`)
- **URL:** `/api/v1/superadmin/schools/<id>/`
- **Methods:** `GET`, `POST`, `DELETE`
- **Auth Required:** Yes
- **Permissions:** `role == "superadmin"` only.
- **GET Response `200 OK`:** `{ "school": { ... } }` with the full school profile, current academic year and term, academic-year/term choices, image URLs, and creation metadata. Term labels are derived from `term_number`.
- **POST Request:** `multipart/form-data` with the same fields as school creation; supports edits to all school fields and uploads.
- **POST Response `200 OK`:** `{ "success": true, "message": "...", "school_id": 1 }`.
- **DELETE:** Returns `200 OK` on success; returns `400` with `code: "SCHOOL_HAS_ASSOCIATED_RECORDS"` if the school has users, students, or teachers.

### 3.3 Superadmin Administrators (`GET, POST /api/v1/superadmin/admins/`)
- **URL:** `/api/v1/superadmin/admins/`
- **Methods:** `GET`, `POST`
- **Auth Required:** Yes
- **Permissions:** `role == "superadmin"` only.
- **GET Query Params:**
  - `search` (optional string): filters by full_name, username, email, school name.
  - `school_id` or `school` (optional int): filters by school.
  - `is_active` (optional string): `"true"` or `"false"`.
- **POST Request:** `multipart/form-data` with required `username`, `email`, `full_name`, and active `school` ID. The server creates an active administrator with a randomly generated password and schedules the account setup email.
- **POST Response `201 Created`:** `{ "success": true, "message": "...", "admin_id": 12, "password_setup_email_scheduled": true }`.
- **Response `200 OK`:**
```json
{
  "count": 5,
  "results": [
    {
      "id": 12,
      "username": "admin_sph",
      "email": "principal@sph.edu",
      "full_name": "Seymour Skinner",
      "is_active": true,
      "date_joined": "2026-01-10T09:00:00+00:00",
      "last_login": null,
      "last_login_ip": null,
      "school": {
        "id": 1,
        "name": "Springfield High",
        "school_code": "SPH01",
        "address": "742 Evergreen Terrace",
        "phone_number": "555-0100",
        "is_active": true
      }
    }
  ]
}
```

### 3.4 Superadmin Administrator Detail (`GET, POST, DELETE /api/v1/superadmin/admins/<id>/`)
- **URL:** `/api/v1/superadmin/admins/<id>/`
- **Methods:** `GET`, `POST`, `DELETE`
- **Auth Required:** Yes
- **Permissions:** `role == "superadmin"` only.
- **GET Response `200 OK`:** `{ "admin": { ... } }` using the administrator shape above.
- **POST Request:** `multipart/form-data` with required `email`, `full_name`, and active school ID; `is_active` is `"true"`/`"false"` and `password` is optional. A blank password keeps the existing credential. An administrator may remain assigned to their current inactive school.
- **POST Response `200 OK`:** `{ "success": true, "message": "...", "admin_id": 12 }`.
- **DELETE:** Returns `200 OK` on success; returns `400` with `code: "SELF_DELETE_FORBIDDEN"` if deleting the current account.

### 3.5 Superadmin Dashboard (`GET /api/v1/superadmin/dashboard/`)
- **URL:** `/api/v1/superadmin/dashboard/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** `role == "superadmin"` only.
- **Response `200 OK`:** Returns system-wide counts, the five most recently added schools, the five schools with the most users and students, and up to ten recent quizzes.
```json
{
  "stats": {
    "total_schools": 2,
    "inactive_schools": 0,
    "total_users": 20,
    "total_admins": 2,
    "total_teachers": 5,
    "total_students": 12,
    "total_superadmins": 1,
    "total_students_all": 12,
    "total_teachers_all": 5,
    "total_classes": 4,
    "total_subjects": 3,
    "total_quizzes": 6,
    "published_quizzes": 4,
    "draft_quizzes": 2,
    "total_attempts": 18,
    "completed_attempts": 15
  },
  "recent_schools": [
    { "id": 2, "name": "North School", "is_active": true, "created_at": "2026-11-07T10:00:00+00:00" }
  ],
  "schools_with_users": [
    { "id": 2, "name": "North School", "is_active": true, "user_count": 12 }
  ],
  "schools_with_students": [
    { "id": 2, "name": "North School", "is_active": true, "student_count": 8 }
  ],
  "recent_quizzes": [
    {
      "id": 14,
      "title": "Term Assessment",
      "status": "published",
      "school_name": "North School",
      "teacher_name": "Jane Teacher",
      "subject_name": "Mathematics",
      "created_at": "2026-11-07T10:00:00+00:00"
    }
  ]
}
```

### 3.5 School Admin Students Directory (`GET /api/v1/students/`)
- **URL:** `/api/v1/students/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** `role in ["admin", "superadmin", "teacher"]`.
  - For `admin`: strictly scoped to `request.user.school`.
  - For `superadmin`: scoped to user's school if assigned, or all if none.
  - For `teacher`: strictly scoped to students in classes the teacher teaches.
- **Query Params:**
  - `search` (optional string): filters by full_name, admission_number, email.
  - `status` (optional string): `"active"` (default), `"archived"`, `"all"`.
  - `class_id` (optional int): filter by enrolled class.
- **Response `200 OK`:**
```json
{
  "count": 120,
  "results": [
    {
      "id": 101,
      "admission_number": "STD-2026-001",
      "full_name": "Bart Simpson",
      "gender": "M",
      "date_of_birth": "2012-04-01",
      "parent_contact": "555-0199",
      "form": "Grade 4",
      "learning_area": "General",
      "current_class": {
        "id": 3,
        "name": "Class 4B"
      },
      "is_active": true
    }
  ]
}
```

### 3.6 School Admin Teachers Directory (`GET /api/v1/teachers/`)
- **URL:** `/api/v1/teachers/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.
- **Query Params:**
  - `search` (optional string): filters by full_name, staff_id, email.
  - `department_id` (optional int): filter by department.
  - `is_active` (optional string): `"true"`, `"false"`, or empty.
- **Response `200 OK`:**
```json
{
  "count": 25,
  "results": [
    {
      "id": 42,
      "staff_id": "TCH-0042",
      "full_name": "Edna Krabappel",
      "gender": "F",
      "contact_number": "555-0144",
      "email": "edna@sph.edu",
      "department": "Language Arts",
      "is_active": true
    }
  ]
}
```

### 3.6.1 Directory mutations and imports

Student and teacher writes require an authenticated `admin` or `superadmin`.
School administrators are scoped to their active school; superadmins must
provide an active `school_id` for writes. Cross-school object ids are returned
as not found. Validation errors use the common envelope:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Please correct the highlighted fields.",
  "fields": { "full_name": ["This field is required."] }
}
```

| Method | URL | Purpose |
|---|---|---|
| `POST`, `PATCH` | `/api/v1/students/` | Create; update requires `id` in the JSON body |
| `POST` | `/api/v1/students/{id}/archive/` | Archive student and deactivate active enrollments |
| `POST` | `/api/v1/students/{id}/restore/` | Restore archived student |
| `POST` | `/api/v1/students/bulk-archive/` | Archive or restore IDs supplied as `student_ids` |
| `POST` multipart | `/api/v1/students/import/preview/` | Preview uploaded `file` headers and sample rows |
| `POST` multipart | `/api/v1/students/import/` | Import `file`; accepts `column_mappings`, `school_id`, optional `assign_class` |
| `POST`, `PATCH` | `/api/v1/teachers/` | Create; update requires `id` in the JSON body |
| `POST` | `/api/v1/teachers/{id}/archive/` | Archive teacher and deactivate assignments |
| `POST` | `/api/v1/teachers/{id}/restore/` | Restore archived teacher |
| `POST` | `/api/v1/teachers/bulk-archive/` | Archive or restore IDs supplied as `teacher_ids` |
| `POST` multipart | `/api/v1/teachers/import/preview/` | Preview uploaded `file` headers and sample rows |
| `POST` multipart | `/api/v1/teachers/import/` | Import `file`, optional `school_id` and `default_department` |
| `GET` | `/api/v1/teachers/export/?format=csv&school_id={id}` | Export teachers for the selected school |

Imports retain valid rows and report row-level failures in `errors`,
`partial_success`, and `imported`; student admission numbers remain globally
unique. Legacy student and teacher POST handlers return `410 Gone` and point to
the replacement API routes.

### 3.6.2 User management writes

| Method | URL | Purpose |
|---|---|---|
| `POST` | `/api/v1/users/` | Create a user and schedule a password-setup email |
| `PATCH` | `/api/v1/users/` | Update the user identified by JSON `id` |
| `DELETE` | `/api/v1/users/{id}/` | Delete a user |
| `POST` | `/api/v1/users/bulk-password-reset/` | Send setup/reset links for `user_ids` |

User writes are admin/superadmin-only and tenant-scoped. Superadmins can select
an active school for new users and bulk password resets; existing users cannot
be transferred between schools through this endpoint. Legacy mutation routes
return `410 Gone`.

### 3.7 School Admin Dashboard Metrics (`GET /api/v1/dashboard/admin/`)
- **URL:** `/api/v1/dashboard/admin/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.
- **Response `200 OK`:**
```json
{
  "school_name": "Springfield High",
  "total_students": 450,
  "total_teachers": 32,
  "total_classes": 18,
  "total_quizzes": 85,
  "active_academic_year": "2026-2027",
  "active_term": "Term 1"
}
```

---

## 4. Phase 4 Teacher Workspace Endpoints

### 4.1 Teacher Dashboard Metrics (`GET /api/v1/dashboard/teacher/`)
- **URL:** `/api/v1/dashboard/teacher/`
- **Method:** `GET`
- **Auth Required:** Yes (Session)
- **Permissions:** `role in ["teacher", "admin"]`. Teachers see statistics strictly for their own quizzes; Admins see school-wide statistics. Scoped to `request.user.school`.
- **Response `200 OK`:**
```json
{
  "teacher_name": "Edna Krabappel",
  "total_quizzes": 15,
  "published_quizzes": 10,
  "draft_quizzes": 4,
  "archived_quizzes": 1,
  "total_attempts": 128,
  "completed_attempts_count": 115,
  "quizzes_needing_grading_count": 3,
  "avg_score": 78.5,
  "recent_quizzes": [
    {
      "id": 1,
      "title": "Algebra Basics",
      "subject_name": "Mathematics",
      "status": "published",
      "total_questions": 10,
      "total_marks": 50,
      "created_at": "2026-11-01T10:00:00Z"
    }
  ],
  "recent_attempts": [
    {
      "id": 101,
      "quiz_title": "Algebra Basics",
      "student_name": "Bart Simpson",
      "admission_number": "STU001",
      "score": 42.0,
      "total_marks": 50,
      "percentage": 84.0,
      "submitted_at": "2026-11-06T14:30:00Z",
      "is_graded": true
    }
  ]
}
```

### 4.2 Teacher Quizzes List (`GET /api/v1/teacher/quizzes/`)
- **URL:** `/api/v1/teacher/quizzes/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** `role in ["teacher", "admin"]`. Teachers see only their own quizzes; Admins see all school quizzes.
- **Query Params:** `status` (e.g. `published`, `draft`, `archived`), `search` (title or subject), `page`.
- **Response `200 OK`:**
```json
{
  "count": 10,
  "page": 1,
  "total_pages": 1,
  "results": [
    {
      "id": 1,
      "title": "Midterm Examination",
      "subject_name": "Mathematics",
      "academic_year": "2026/2027",
      "term": "First Term",
      "status": "published",
      "duration_minutes": 60,
      "total_questions": 20,
      "total_marks": 100,
      "total_attempts": 25,
      "avg_score": 82.4,
      "created_at": "2026-10-15T09:00:00Z"
    }
  ]
}
```

### 4.3 Teacher Quiz Detail & Question Preview (`GET /api/v1/teacher/quizzes/<id>/`)
- **URL:** `/api/v1/teacher/quizzes/<int:quiz_id>/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** Teacher who owns the quiz or School Admin in the same school.
- **Response `200 OK`:**
```json
{
  "id": 1,
  "title": "Midterm Examination",
  "description": "Comprehensive review test",
  "subject_name": "Mathematics",
  "academic_year": "2026/2027",
  "term": "First Term",
  "status": "published",
  "duration_minutes": 60,
  "pass_percentage": 50.0,
  "max_attempts": 1,
  "total_questions": 2,
  "total_marks": 20,
  "passing_marks": 10,
  "total_attempts": 15,
  "results_released_at": null,
  "assigned_classes": [
    { "id": 5, "name": "Class 1A" }
  ],
  "questions": [
    {
      "id": 10,
      "question_text": "What is 2 + 2?",
      "question_type": "multiple_choice",
      "marks": 5,
      "order": 1,
      "choices": [
        { "id": 101, "choice_text": "4", "is_correct": true },
        { "id": 102, "choice_text": "5", "is_correct": false }
      ]
    }
  ]
}
```

### 4.4 Teacher Quiz Results & Analytics (`GET /api/v1/teacher/results/`)
- **URL:** `/api/v1/teacher/results/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** `role in ["teacher", "admin"]`.
- **Query Params:** `quiz_id` (optional int), `search` (student name/admission), `page`.
- **Response `200 OK`:**
```json
{
  "count": 25,
  "results": [
    {
      "id": 101,
      "quiz_id": 1,
      "quiz_title": "Midterm Examination",
      "student_name": "Alice Wonder",
      "admission_number": "STU-001",
      "class_name": "Class 1A",
      "score": 85.0,
      "total_marks": 100,
      "percentage": 85.0,
      "is_passed": true,
      "needs_grading": false,
      "is_graded": true,
      "started_at": "2026-11-05T10:00:00Z",
      "submitted_at": "2026-11-05T10:45:00Z"
    }
  ]
}
```

### 4.6 Teacher Assessment Writes
Teacher and school-admin quiz, question, assignment, and grading writes use the versioned JSON envelope. Teachers may mutate only quizzes they own; admins may mutate any quiz in their school.

| Method | URL | Behaviour |
|---|---|---|
| `POST` | `/api/v1/teacher/quizzes/` | Create a draft quiz (`title`, `subject`, `teacher` for admins, optional settings); academic year and term default to the school's current values |
| `PATCH` | `/api/v1/teacher/quizzes/{id}/` | Update quiz metadata and settings; `pass_percentage` is authoritative and `passing_marks` is rounded from the current `total_marks` |
| `DELETE` | `/api/v1/teacher/quizzes/{id}/` | Delete a quiz; `409 QUIZ_HAS_ATTEMPTS` when attempts exist |
| `POST` | `/api/v1/teacher/quizzes/{id}/status/` | Set `draft`, `published`, or `archived`. Publishing requires questions, assigned classes, valid availability dates, and a non-negative time limit; refusals use a specific `409` code and standard `fields` envelope |
| `POST` | `/api/v1/teacher/quizzes/{id}/release-results/` | Set `results_released_at` for a published quiz with delayed results |
| `POST` | `/api/v1/teacher/quizzes/{id}/questions/` | Create a question (`question_text`, `question_type`, optional `choices`/`config`) |
| `PATCH` | `/api/v1/teacher/quizzes/{id}/questions/{question_id}/` | Update a question; `409 CHOICE_HAS_ATTEMPTS` if a used choice is removed |
| `DELETE` | `/api/v1/teacher/quizzes/{id}/questions/{question_id}/` | Delete a question; `409 QUESTION_HAS_ATTEMPTS` when the quiz has attempts |
| `POST` | `/api/v1/teacher/quizzes/{id}/questions/{question_id}/duplicate/` | Duplicate a question |
| `POST` | `/api/v1/teacher/quizzes/{id}/questions/reorder/` | Reorder with `{ "question_ids": [3, 1, 2] }` |
| `GET, POST` | `/api/v1/teacher/quizzes/{id}/sections/` | List or create sections with instructions, optional time limit, and optional Choose-N |
| `PATCH, DELETE` | `/api/v1/teacher/quizzes/{id}/sections/{section_id}/` | Update or remove one section |
| `POST` | `/api/v1/teacher/quizzes/{id}/sections/reorder/` | Reorder every section with `{ "section_ids": [...] }` |
| `GET, POST` | `/api/v1/teacher/quizzes/{id}/groups/` | List or create shared stimulus groups |
| `POST` | `/api/v1/teacher/quizzes/{id}/groups/reorder/` | Reorder every group in a section with `{ "section_id": 4, "group_ids": [7, 5] }` |
| `PATCH, DELETE` | `/api/v1/teacher/quizzes/{id}/groups/{group_id}/` | Update or remove a stimulus group |
| `POST` | `/api/v1/teacher/quizzes/{id}/questions/assign/` | Assign questions using `{ "question_ids": [...], "section_id": id|null, "group_id": id|null, "replace": true }` |
| `POST` | `/api/v1/teacher/quizzes/{id}/questions/bulk-delete/` | Bulk delete `{ "question_ids": [...] }` |
| `POST` multipart | `/api/v1/teacher/quizzes/{id}/questions/import/` | Preview CSV/XLSX with `dry_run=true`, or import it with optional `skip_invalid=true` |
| `POST` | `/api/v1/teacher/quizzes/{id}/assignments/` | Assign `{ "class_ids": [...] }` |
| `POST` | `/api/v1/teacher/quizzes/{id}/assignments/set/` | Atomically set the complete class list with `{ "class_ids": [...] }`; an empty list removes all assignments |
| `DELETE` | `/api/v1/teacher/quizzes/{id}/assignments/{class_id}/` | Unassign one class |
| `POST` | `/api/v1/teacher/quizzes/{id}/assignments/bulk-delete/` | Unassign `{ "class_ids": [...] }` |
| `POST` | `/api/v1/teacher/responses/{response_id}/grade/` | Grade one response; marks cannot exceed the question's marks |
| `POST` | `/api/v1/teacher/grading/{attempt_id}/bulk/` | Bulk grade `{ "grades": [{ "response_id", "marks_awarded", "grading_notes" }] }` |
| `GET` | `/api/v1/teacher/grading/{attempt_id}/` | Read submitted responses requiring manual grading, with question type, attempt-snapshot marks, and the student's answer |

Manual grading includes essays and responses whose attempt snapshot has no usable answer key. Matching, ordering, choice, short-answer, and fill-blank questions with valid keys remain automatically graded and do not enter the queue.

When `show_results_immediately` is false and `results_released_at` is null, results stay hidden until explicitly released, except that an individual attempt becomes visible to its student once all its manual responses have been graded. Pending manual attempts and automatically graded attempts remain hidden until the teacher releases results. Student attempt lists, quiz summaries, submission responses, and progress metrics follow the same per-attempt visibility. Releasing results sets the timestamp once. Changing the immediate-results setting clears that timestamp. `show_correct_answers` and `allow_review` continue to determine which details are available after results are visible. `pass_percentage` remains the write contract; a total-mark recalculation keeps `passing_marks` synchronized.

Quiz `total_marks` is recalculated after question create, update, delete, duplicate, import, and section-rule updates. A Choose-N section requires at least N questions with equal marks and contributes `N × question marks` to the quiz total. Each attempt snapshots section rules, stimulus, question membership, and question configuration; edits do not change existing attempts. Per-section scores are calculated from the attempt's responses and are not stored separately.

#### Question import preview and confirmation
- `POST /api/v1/teacher/quizzes/{id}/questions/import/` accepts multipart fields `import_file` (CSV or XLSX, maximum 5 MB), optional `dry_run=true`, and optional `skip_invalid=true`. Files are limited to 5,000 data rows and 64 columns.
- A dry run creates no questions and returns `{ "rows": [{ "row", "status", "type", "text_preview", "errors": [{ "field", "message" }] }], "summary": { "total", "valid", "invalid" } }`.
- A real import with invalid rows and no `skip_invalid=true` returns `400 INVALID_IMPORT_ROWS` and creates nothing. With `skip_invalid=true`, only valid rows are created; the response includes `imported`, `skipped`, `rows`, and `summary`.
- Import is restricted to the staff member's writable quiz and school. Supported question types are `multiple_choice`, `true_false`, `short_answer`, `fill_blank`, `matching`, `ordering`, and `essay`.
- The template columns are `question_text`, `question_type`, `marks`, `difficulty`, `correct_answer`, `choice1`–`choice4`, and `explanation`. Multiple-choice correct answers are 1-based choice numbers or exact choice text (comma-separated for multiple correct choices); short-answer aliases use `;` or `|`; fill-blank answer groups use `;` with alternatives separated by `|`; matching pairs and ordering items use `;`.
- Quiz-scoped CSV and XLSX templates remain available at `/quizzes/{id}/questions/import-template/csv/` and `/quizzes/{id}/questions/import-template/xlsx/`; both require staff access to the quiz.

#### Choose-N and snapshot rules
- Sections and groups are scoped to the quiz's school. A group and its section must belong to the same quiz; questions assigned to a group must also match its section.
- Choose-N validation rejects a rule larger than the section question count or mixed question marks.
- Teacher routes use the standard `{ "code", "message", "fields" }` error envelope. All section and assignment routes enforce the same teacher ownership and school scope as quiz writes.

### 4.5 Teacher Grading Queue (`GET /api/v1/teacher/grading/`)
- **URL:** `/api/v1/teacher/grading/`
- **Method:** `GET`
- **Auth Required:** Yes
- **Permissions:** `role in ["teacher", "admin"]`.
- **Contents:** Submitted attempts with at least one ungraded response requiring manual review (essays or questions without a usable answer key).
- **Response `200 OK`:**
```json
{
  "count": 3,
  "results": [
    {
      "id": 102,
      "quiz_id": 1,
      "quiz_title": "Literature Essay Test",
      "student_name": "Bart Simpson",
      "admission_number": "STU-002",
      "class_name": "Class 1A",
      "submitted_at": "2026-11-06T15:00:00Z",
      "ungraded_responses_count": 2
    }
  ]
}
```

---

## 5. Phase 5: Student Workspace & Quiz Taking Endpoints

### 5.1 Student Dashboard (`GET /api/v1/dashboard/student/`)
- **Method:** `GET`
- **Auth Required:** Yes (Role: `student` with associated `Student` profile and `request.user.school`)
- **Response `200 OK`:**
```json
{
  "student_name": "Harry Potter",
  "admission_number": "STU-001",
  "class_name": "Gryffindor Year 1",
  "academic_year": "2026/2027",
  "term": "Term 1",
  "total_available": 3,
  "total_completed": 8,
  "total_in_progress": 1,
  "avg_score": 84.5,
  "best_score": 98.0,
  "available_quizzes": [
    {
      "id": 10,
      "title": "Defense Against the Dark Arts Quiz",
      "subject_name": "DADA",
      "duration_minutes": 45,
      "total_questions": 15,
      "total_marks": 50,
      "available_until": "2026-11-20T23:59:59Z"
    }
  ],
  "in_progress_attempts": [
    {
      "id": 101,
      "quiz_id": 10,
      "quiz_title": "Defense Against the Dark Arts Quiz",
      "started_at": "2026-11-07T05:00:00Z",
      "time_remaining_seconds": 1800
    }
  ],
  "recent_attempts": [
    {
      "id": 99,
      "quiz_id": 8,
      "quiz_title": "Transfiguration Basics",
      "subject_name": "Transfiguration",
      "score": 45.0,
      "total_marks": 50,
      "percentage": 90.0,
      "is_passed": true,
      "submitted_at": "2026-11-05T14:30:00Z"
    }
  ]
}
```

### 5.2 Student Quizzes List (`GET /api/v1/student/quizzes/`)
- **Method:** `GET`
- **Auth Required:** Yes (Role: `student`)
- **Query Params:** `subject`, `academic_year`, `term`, `status` (`all`, `available`, `in_progress`, `completed`, `upcoming`, `expired`), `search`
- **Response `200 OK`:**
```json
{
  "class_name": "Gryffindor Year 1",
  "quizzes": [
    {
      "id": 10,
      "title": "Defense Against the Dark Arts Quiz",
      "description": "Assessment of protective spells",
      "subject_name": "DADA",
      "teacher_name": "Prof. Remus Lupin",
      "academic_year": "2026/2027",
      "term": "Term 1",
      "duration_minutes": 45,
      "total_questions": 15,
      "total_marks": 50,
      "max_attempts": 2,
      "attempts_count": 0,
      "status": "available",
      "can_attempt": true,
      "attempt_message": "",
      "best_score": 0,
      "best_percentage": 0,
      "in_progress_attempt_id": null,
      "available_from": "2026-11-01T00:00:00Z",
      "available_until": "2026-11-20T23:59:59Z"
    }
  ]
}
```

### 5.3 Student Quiz Detail & Rules (`GET /api/v1/student/quizzes/<int:quiz_id>/`)
- **Method:** `GET`
- **Auth Required:** Yes (Role: `student`, quiz assigned to student's class)
- **Response `200 OK`:**
```json
{
  "id": 10,
  "title": "Defense Against the Dark Arts Quiz",
  "description": "Assessment of protective spells",
  "instructions": "Answer all questions. You have 45 minutes once started.",
  "subject_name": "DADA",
  "teacher_name": "Prof. Remus Lupin",
  "duration_minutes": 45,
  "total_questions": 15,
  "total_marks": 50,
  "passing_marks": 25,
  "pass_percentage": 50.0,
  "max_attempts": 2,
  "attempts_count": 1,
  "remaining_attempts": 1,
  "can_attempt": true,
  "attempt_message": "",
  "require_password": false,
  "in_progress_attempt_id": null,
  "best_score": 38.0,
  "best_percentage": 76.0,
  "available_from": "2026-11-01T00:00:00Z",
  "available_until": "2026-11-20T23:59:59Z",
  "past_attempts": [
    {
      "id": 95,
      "attempt_number": 1,
      "score": 38.0,
      "total_marks": 50,
      "percentage": 76.0,
      "is_passed": true,
      "started_at": "2026-11-02T10:00:00Z",
      "submitted_at": "2026-11-02T10:35:00Z"
    }
  ]
}
```

### 5.4 Start Quiz Attempt (`POST /api/v1/student/quizzes/<int:quiz_id>/start/`)
- **Method:** `POST`
- **Auth Required:** Yes (Role: `student`, CSRF token required)
- **Request Body (JSON or Form):**
```json
{
  "password": "optional_quiz_password"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "attempt_id": 102,
  "resumed": false,
  "message": "Quiz started successfully. Good luck!"
}
```

### 5.5 Student Quiz Taking Interface (`GET /api/v1/student/attempts/<int:attempt_id>/take/`)
- **Method:** `GET`
- **Auth Required:** Yes (Role: `student` who owns the attempt)
- **High-Risk Rule:** Correct answers (`is_correct`) are NEVER returned.
- When sections exist, the response also includes ordered `sections`; each section has its instructions, questions, stimulus groups, `choose_n`, `remaining_seconds`, `is_active`, and `is_locked`. The legacy flat `questions` list remains available.
- If any section is timed, sections advance in order. `POST /api/v1/student/attempts/{attempt_id}/sections/{section_id}/submit/` submits and locks the active section and starts the next. Save requests for expired or locked sections return `409 SECTION_TIME_EXPIRED` or `409 SECTION_LOCKED`.
- A Choose-N overflow returns `400 CHOOSE_N_LIMIT`.
- **Response `200 OK`:**
```json
{
  "attempt_id": 102,
  "quiz_id": 10,
  "quiz_title": "Defense Against the Dark Arts Quiz",
  "started_at": "2026-11-07T05:00:00Z",
  "time_remaining_seconds": 2700,
  "is_submitted": false,
  "total_questions": 2,
  "answered_count": 1,
  "questions": [
    {
      "id": 101,
      "order": 1,
      "question_type": "multiple_choice",
      "question_text": "What spell repels a Boggart?",
      "marks": 5,
      "config": { "allow_multiple": true },
      "choices": [
        { "id": 1, "choice_text": "Riddikulus" },
        { "id": 2, "choice_text": "Expelliarmus" },
        { "id": 3, "choice_text": "Lumos" }
      ]
    },
    {
      "id": 102,
      "order": 2,
      "question_type": "essay",
      "question_text": "Describe the characteristics of a Dementor.",
      "marks": 10,
      "config": { "answer_format": "long_text" },
      "choices": []
    }
  ],
  "existing_responses": {
    "101": {
      "selected_choice_id": 1,
      "selected_choice_ids": [1],
      "text_answer": "",
      "answer_data": { "choice_ids": [1] }
    }
  }
}
```

For other registered types, the same payload uses display-only configuration:
matching questions expose independent left-side pairs and shuffled
`right_options`; ordering questions expose a shuffled list of `{id, text}`
items; fill-in-the-blank questions expose only `blank_count`. These settings
never contain a correctness flag or correct-answer mapping.

### 5.6 Save Question Response / Autosave (`POST /api/v1/student/attempts/<int:attempt_id>/save/`)
- **Method:** `POST`
- **Auth Required:** Yes (Role: `student` who owns the attempt, CSRF token required)
- **Request Body (JSON or Form):**
```json
{
  "question_id": 101,
  "choice_id": 1,
  "choice_ids": [1],
  "text_answer": "",
  "answer_data": { "choice_ids": [1] }
}
```
- `answer_data` is the canonical structured answer (`{"text": "..."}`,
  `{"text": ["..."]}`, `{"matches": {"left-id": "right-id"}}`, or
  `{"items": ["item-id"]}` as appropriate for the question type). The legacy
  `choice_id`, `choice_ids`, and `text_answer` fields remain accepted.
- **Response `200 OK`:**
```json
{
  "success": true,
  "message": "Response saved successfully",
  "answered_count": 1
}
```

### 5.7 Submit Quiz Attempt (`POST /api/v1/student/attempts/<int:attempt_id>/submit/`)
- **Method:** `POST`
- **Auth Required:** Yes (Role: `student` who owns the attempt, CSRF token required)
- **High-Risk Rule:** Idempotent submission. Subsequent calls return the same result.
- **Response `200 OK`:**
```json
{
  "success": true,
  "attempt_id": 102,
  "score": 45.0,
  "total_marks": 50,
  "percentage": 90.0,
  "is_passed": true,
  "message": "Quiz submitted successfully!"
}
```

### 5.8 Student Attempts History (`GET /api/v1/student/attempts/`)
- **Method:** `GET`
- **Auth Required:** Yes (Role: `student`)
- **Query Params:** `quiz`, `subject`, `academic_year`, `term`, `status`, `search`
- **Response `200 OK`:**
```json
{
  "total_attempts": 5,
  "completed_attempts_count": 4,
  "avg_score": 42.5,
  "avg_percentage": 85.0,
  "best_percentage": 96.0,
  "attempts": [
    {
      "id": 102,
      "quiz_id": 10,
      "quiz_title": "Defense Against the Dark Arts Quiz",
      "subject_name": "DADA",
      "attempt_number": 2,
      "score": 45.0,
      "total_marks": 50,
      "percentage": 90.0,
      "is_passed": true,
      "is_submitted": true,
      "is_completed": true,
      "started_at": "2026-11-07T05:00:00Z",
      "submitted_at": "2026-11-07T05:30:00Z"
    }
  ]
}
```

### 5.9 Student Quiz Result Detail (`GET /api/v1/student/attempts/<int:attempt_id>/result/`)
- **Method:** `GET`
- **Auth Required:** Yes (Role: `student` who owns the attempt)
- **Response `200 OK`:**
```json
{
  "attempt_id": 102,
  "quiz_id": 10,
  "quiz_title": "Defense Against the Dark Arts Quiz",
  "subject_name": "DADA",
  "student_name": "Harry Potter",
  "admission_number": "STU-001",
  "score": 45.0,
  "total_marks": 50,
  "percentage": 90.0,
  "passing_marks": 25,
  "is_passed": true,
  "started_at": "2026-11-07T05:00:00Z",
  "submitted_at": "2026-11-07T05:30:00Z",
  "allow_review": true,
  "show_correct_answers": true,
  "questions": [
    {
      "id": 101,
      "question_text": "What spell repels a Boggart?",
      "question_type": "multiple_choice",
      "marks": 5,
      "marks_obtained": 5,
      "is_correct": true,
      "student_answer": "Riddikulus",
      "correct_answer": "Riddikulus",
      "explanation": "Riddikulus forces the Boggart to assume an amusing shape.",
      "choices": [
        { "id": 1, "choice_text": "Riddikulus", "is_correct": true, "is_selected": true },
        { "id": 2, "choice_text": "Expelliarmus", "is_correct": false, "is_selected": false }
      ]
    }
  ]
}
```

---

## 6. Academic Structure & School Setup (ADR-014)

### 6.1 Academic Years (`/api/v1/academic-years/` and `/<id>/`)
- **Methods:**
  - `GET /api/v1/academic-years/`: List academic years for current school.
  - `POST /api/v1/academic-years/`: Create new academic year (`name`, `start_date`, `end_date`, `is_current`).
  - `PUT /api/v1/academic-years/<id>/`: Update academic year.
  - `DELETE /api/v1/academic-years/<id>/`: Delete academic year (rejected if terms, classes, quizzes, or attempts exist).
  - `POST /api/v1/academic-years/<id>/set-current/`: Set as current academic year.
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.
- **Response `200 OK` (GET):**
```json
{
  "academic_years": [
    {
      "id": 1,
      "name": "2026/2027",
      "start_date": "2026-09-01",
      "end_date": "2027-07-01",
      "is_current": true,
      "terms_count": 3,
      "classes_count": 8,
      "quizzes_count": 14
    }
  ]
}
```

### 6.2 Terms (`/api/v1/terms/` and `/<id>/`)
- **Methods:**
  - `GET /api/v1/terms/`: List terms (optional `?academic_year_id=<id>`).
  - `POST /api/v1/terms/`: Create term (`academic_year_id`, `term_number`, `start_date`, `end_date`, `is_current`).
  - `PUT /api/v1/terms/<id>/`: Update term (`term_number`, `start_date`, `end_date`, `is_current`).
  - `DELETE /api/v1/terms/<id>/`: Delete term.
  - `POST /api/v1/terms/<id>/set-current/`: Set as current term.
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.

### 6.3 Classes (`/api/v1/classes/` and `/<id>/`)
- **Methods:**
  - `GET /api/v1/classes/`: List classes (`?status=active|archived|all`, `?academic_year_id=<id>`).
  - `POST /api/v1/classes/`: Create class (`name`, `class_code`, `academic_year_id`, `form_id`, `learning_area_id`, `maximum_students`).
  - `GET /api/v1/classes/<id>/`: Detail view including enrolled students and assigned subjects.
  - `PUT /api/v1/classes/<id>/`: Update class.
  - `DELETE /api/v1/classes/<id>/`: Soft delete / archive class (`is_active = False`).
  - `POST /api/v1/classes/<id>/restore/`: Restore archived class.
  - `POST /api/v1/classes/<id>/subjects/add/`: Add subject to class (`subject_id`).
  - `DELETE /api/v1/classes/<id>/subjects/<cs_id>/remove/`: Remove subject from class.
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.

### 6.4 Subjects (`/api/v1/subjects/` and `/<id>/`)
- **Methods:**
  - `GET /api/v1/subjects/`: List subjects (`status=active|archived|all`, `search`, `department_id`, `learning_area_id`); superadmins may also pass `school_id`.
  - `POST /api/v1/subjects/`: Create a subject with `subject_name`, optional `department_id` and `learning_area_id`; `school_id` is required for superadmins. Subject codes are generated and immutable.
  - `PUT /api/v1/subjects/<id>/`: Update the subject name and optional same-school department/learning area.
  - `DELETE /api/v1/subjects/<id>/`: Archive the subject and deactivate its active teacher assignments; historical assignments remain stored.
  - `POST /api/v1/subjects/<id>/restore/`: Restore the subject without reactivating historical assignments.
- **Permissions:** `role in ["admin", "superadmin"]`; admins are scoped to their school, superadmins may filter lists by active school and must choose an active school when creating a subject.
- **List fields:** `class_count` and `quiz_count` are included with school identity and subject status.
- **Legacy views:** `/subjects/`, `/subjects/create/`, and `/subjects/<id>/edit/` GET routes redirect to `/app/admin/subjects`. The Django page/form fallback and `?classic=1` behavior have been retired.

### 6.5 School Settings (`/api/v1/school/`)
- **Methods:**
  - `GET /api/v1/school/`: Current school details, logo/stamp URLs, reporting and grading settings, academic selections, and active enrollment/quiz statistics. The `stats` key includes `total_students`, `total_teachers`, `total_classes`, `total_subjects`, and `total_quizzes`.
  - `POST /api/v1/school/`: Multipart update supporting all legacy school profile fields, optional `logo` and `school_stamp` image uploads, active status, and academic year/term selections. Both selections can be cleared; selected years and terms are validated against the current school, and the term must belong to the selected year.
  - `PUT /api/v1/school/`: JSON compatibility update for the same non-file fields.
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.

### 6.6 Structure Lookups (`GET /api/v1/structure-lookups/`)
- **Method:** `GET`
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.
- **Response `200 OK`:** Returns consolidated arrays: `academic_years`, `terms`, `forms`, `learning_areas`, `departments`, `subjects`; superadmins also receive active `schools` and may pass `school_id` to scope the curriculum lookups.

### 6.7 Forms, Learning Areas, and Departments
- **Base URL:** `/api/v1/school-structure/<resource>/`, where `resource` is `forms`, `learning-areas`, or `departments`.
- **Permissions:** `role in ["admin", "superadmin"]`; school administrators are restricted to their school. Superadmins may list across schools or filter with `?school_id=<id>` and must provide an active `school_id` when creating a record.
- **Methods:** `GET` lists and searches records; `POST` creates; `GET /<id>/` retrieves; `PUT /<id>/` updates; `DELETE /<id>/` deletes.
- **Fields:** Forms require `form_number` and `name`; learning areas require `code` and `name`; departments require `code` and `name` and optionally accept `head_of_department_id`. All resources accept `description`.
- **Safeguards:** A form or learning area with associated students cannot be deleted. A department with associated teachers cannot be deleted. Department heads must belong to the same school.
- **Responses:** List keys are `forms`, `learning_areas`, or `departments`; each record includes school identity and the relevant student/teacher count. Department lists also return same-school teacher choices. Superadmin lists return active school choices.

---

## 7. Academic Allocations & Roster Contracts

### 7.1 Student Class Enrollments (`/api/v1/enrollments/`)
- **Base URL:** `/api/v1/enrollments/`
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.
- **Methods:**
  - `GET /api/v1/enrollments/`:
    - Query Parameters: `search` (student name, admission number, or class name), `class_id`, `student_id`, `is_active` (`true`/`false`), and superadmin-only `school_id`.
    - Response `200 OK`:
      ```json
      {
        "enrollments": [
          {
            "id": 142,
            "student_id": 25,
            "student_name": "Harry Potter",
            "admission_number": "STD-007",
            "gender": "M",
            "assigned_class_id": 4,
            "class_name": "Form 4 Gryffindor",
            "academic_year_name": "2026/2027",
            "date_assigned": "2026-11-01T08:00:00Z",
            "is_active": true,
            "assigned_by_name": "Admin Minerva",
            "school_id": 1,
            "school_name": "Springfield High"
          }
        ],
        "count": 1
      }
      ```
  - `POST /api/v1/enrollments/`:
    - Request: `{"student_id": 25, "class_id": 4}`
    - Logic: Validates active student/class, school ownership, available capacity, and academic-year eligibility. Same-year transfers deactivate the previous row and create a new active `StudentClass`; history is retained. Cross-year promotions are rejected until eligibility rules exist. Repeating the current assignment is idempotent.
    - Response `201 Created`: `{"success": true, "message": "...", "enrollment": {...}}`
  - `POST /api/v1/enrollments/bulk/`:
    - Request: `{"student_ids": [25, 26, 27], "class_id": 4}`
    - Logic: Processes each student independently, skipping same-class assignments and returning per-student errors for capacity, cross-year, or validation failures. Existing enrollment history is retained.
    - Response `200 OK`: includes `created`/`enrolled_count`, `skipped`/`skipped_count`, `errors`, and `error_count`.
  - `PUT /api/v1/enrollments/<int:enrollment_id>/`:
    - Request: `{"class_id": 5, "is_active": true}`
    - Logic: Deactivation soft-archives the row. A transfer creates a new enrollment row rather than mutating the old class assignment; cross-year promotions are rejected.
    - Response `200 OK`: `{"success": true, "message": "...", "enrollment": {...}}`
  - `DELETE /api/v1/enrollments/<int:enrollment_id>/`:
    - Logic: Soft-deactivates the enrollment; the row remains as history.
    - Response `200 OK`: `{"success": true, "message": "...history was retained."}`
  - `POST /api/v1/enrollments/bulk-delete/`:
    - Request: `{"enrollment_ids": [142, 143]}`; superadmins must also supply `target_school_id`.
    - Logic: Validates all selected rows belong to the requested school (or the admin's school), then soft-deactivates them.
    - Response `200 OK`: `{"success": true, "unassigned_count": 2, "message": "...history was retained."}`

The React screen is `/app/admin/enrollments`. Legacy `/enrollments/`, `/enrollments/create/`, `/enrollments/bulk-create/`, and `/enrollments/<id>/edit/` GET routes redirect there. The Django page/form fallback and `?classic=1` behavior have been retired.

### 7.2 Teacher Subject Assignments (`/api/v1/teacher-assignments/`)
- **Base URL:** `/api/v1/teacher-assignments/`
- **Permissions:** `role in ["admin", "superadmin"]`, scoped to user's school.
- **Methods:**
  - `GET /api/v1/teacher-assignments/`:
    - Query Parameters: `search`, `teacher_id`, `subject_id`, `class_id`, `academic_year_id`, `is_active`
    - Response `200 OK`:
      ```json
      {
        "assignments": [
          {
            "id": 88,
            "assignment_id": "TSA-0088",
            "teacher_id": 12,
            "teacher_name": "Prof. Severus Snape",
            "staff_id": "TCH-004",
            "subject_id": 3,
            "subject_code": "POT",
            "subject_name": "Potions",
            "class_id": 4,
            "class_name": "Form 4 Slytherin",
            "academic_year_id": 1,
            "academic_year_name": "2026/2027",
            "date_assigned": "2026-11-01T08:00:00Z",
            "is_active": true,
            "previous_teacher_name": null
          }
        ],
        "count": 1
      }
      ```
  - `POST /api/v1/teacher-assignments/`:
    - Request: `{"teacher_id": 12, "subject_id": 3, "class_id": 4, "academic_year_id": 1}`
    - Logic: Validates that subject is assigned to class via `ClassSubject`, reassigns if previously assigned, and saves.
    - Response `201 Created`: `{"success": true, "message": "...", "assignment": {...}}`
  - `POST /api/v1/teacher-assignments/bulk/`:
    - Request:
      ```json
      {
        "teacher_id": 12,
        "academic_year_id": 1,
        "assignments": [
          {"subject_id": 3, "class_id": 4},
          {"subject_id": 3, "class_id": 5}
        ]
      }
      ```
    - Response `200 OK`: `{"success": true, "assigned_count": 2, "skipped_count": 0, "message": "..."}`
  - `PUT /api/v1/teacher-assignments/<int:assignment_id>/`:
    - Request: `{"teacher_id": 14, "is_active": true}`
    - Response `200 OK`: `{"success": true, "message": "...", "assignment": {...}}`
  - `DELETE /api/v1/teacher-assignments/<int:assignment_id>/`:
    - Response `200 OK`: `{"success": true, "message": "Assignment deleted successfully."}`
  - `GET /api/v1/teacher-assignments/class-subjects/`:
    - Query Parameters: `class_id`, `academic_year_id`
    - Response `200 OK`:
      ```json
      {
        "subjects": [
          {"id": 3, "subject_code": "POT", "subject_name": "Potions"}
        ]
      }
      ```

### 7.3 Allocation Lookups
- `GET /api/v1/enrollments/lookups/`:
  - Returns `{ "classes": [...], "students": [...] }` with capacity and current enrollment statuses; superadmins may filter by `school_id` and receive active school choices.
- `GET /api/v1/teacher-assignments/lookups/`:
  - Returns `{ "teachers": [...], "classes": [...], "academic_years": [...] }`.

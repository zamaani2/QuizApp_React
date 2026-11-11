# QuizApp: UI Review, Migration Gaps and Implementation Plan

Reviewed against `zamaani2/QuizApp_React` at commit `ea04247` ('removing legacies templates', 2026-11-09). Prepared 2026-11-11. Part 1 is the review and plan; Part 2 (at the end) is the prompt pack.

## 1. Corrections to my earlier reviews

Earlier in this conversation I said Django templates were intact, that `/students/`, `/academic-years/` and `/terms/` had no redirect, and that authentication lived in two separate apps. Those findings came from an older snapshot of the repo. At `ea04247`:

- Only `react_app.html` and `auth_core_app.html` remain under `quiz_app/templates/`. Both are mount shells.
- Retired page URLs redirect to React, either through the `react_owned_page` wrapper in `urls.py` or inside the views (checked in `academic_management.py`, `quiz_results_management.py`, `dashboard.py`).
- React owns sign-in and password recovery at `/auth-app/*`. `views/auth.py` now answers with JSON for login, reset request and reset confirm, and redirects the old reset pages to the React flow.

So the presentation layer is migrated. What is left is the write path, a few missing screens, the exam engine, and several defects.

## 2. Executive summary

- **Done:** every role has React routes under `/app/*`; Django page templates are gone; code is split per role; the student exam player has autosave, a server-driven timer and a question palette.
- **Not done, in priority order:**
  1. Most create, edit and delete actions still post forms to old Django handlers instead of `/api/v1/`.
  2. Teacher management screens lack import, export, pagination and filters that the student screens have.
  3. Matching and ordering questions cannot be answered by students, and multi-correct multiple choice cannot be answered either.
  4. Results export will crash for most data, and a few security and quality items need attention.
- **New exam features** (maths, rubrics, AI marking, file upload, projects, WAEC-style papers) need a question-type framework first. Build it once, then add types.

## 3. Scope and method

**Read:** `quiz_app/urls.py`, `quiz_system/urls.py`, `settings.py`, `models.py`, `middleware.py`, `account_security.py`, `views/auth.py`, `views/dashboard.py`, `views/academic_management.py`, `views/quiz_results_management.py`, `frontend/src/App.tsx`, `Sidebar.tsx`, `AuthCoreApp.tsx`, `StudentQuizTake.tsx`, `QuestionEditor.tsx`, `StudentList.tsx`, `TeacherList.tsx`, `api/admin.ts`, `api/teacher.ts`, and the migration docs.

**Not read:** `api_views.py` (217 KB), the other view modules, `api/academic.ts`, `api/allocations.ts`, `api/student.ts`, most feature screens, CSS, test contents, Dockerfile and CI. I did not run the app. Items marked **verify** are inferred, not confirmed.

## 4. What is migrated (verified)

- **Routes:** `App.tsx` defines superadmin, admin, teacher and student routes, each behind `RoleGuard`, lazy-loaded per role.
- **Admin:** dashboard, academic years, terms, classes, class detail, subjects, forms, learning areas, departments, school settings, student directory with import dialog, teacher directory, enrollments, teacher assignments, users.
- **Teacher:** dashboard, quiz list and detail, quiz editor, question editor, question import, quiz assignments, grading queue and attempt grading, results list and detail, print and bulk print.
- **Student:** dashboard, quiz list and detail, exam player, attempts, results and print, profile, progress.
- **Auth:** login, superadmin login, password reset request, confirm and status screens, all in `AuthCoreApp.tsx`.
- **Redirects:** `/dashboard/*`, `/quizzes/results/*`, list and form pages for students, teachers, classes, assignments, users, quizzes and questions all send GETs to React.

## 5. Gap register

Severity: **P0** broken or unusable now; **P1** blocks the stated goal (Django as API only) or is a security gap; **P2** quality and polish.

### 5.1 Defects

| ID | Defect | Evidence | Sev |
| --- | --- | --- | --- |
| D1 | Results export raises `AttributeError`: it reads `attempt.term.name` but `Term` has no `name` field (only `term_number`). Any attempt with a term fails. | `quiz_results_management.py`, `models.Term` | P0 |
| D2 | Matching and ordering questions can be created, but the exam player renders no input for them. Students see the question text and nothing else. | `QuestionEditor.tsx` offers both types; `StudentQuizTake.tsx` renders only choices and text areas | P0 |
| D3 | Multiple choice with more than one correct answer cannot be answered. The editor allows several correct boxes and grading requires an exact set match, but the player only has radio buttons and sends one `choice_id`. | `StudentQuizTake.tsx`, `QuizResponse.check_correctness` | P0 |
| D4 | Teacher directory never sends a `page` parameter, so only the first page of teachers is reachable. **Verify** the page size in `teachers_api_view`. | `TeacherList.tsx` | P1 |
| D5 | `GET /logout/` logs the user out. A third-party page can log users out (logout CSRF). | `views/auth.py` | P1 |
| D6 | No throttling on login or password reset, and no rate-limit package in `requirements.txt`. | `views/auth.py`, `requirements.txt` | P1 |
| D7 | `/components` (developer component inventory) is routed for every signed-in role with no guard. | `App.tsx` | P2 |
| D8 | `SafePasswordResetForm.send_mail` calls `loader.render_to_string` without importing `loader`. It only fires if an HTML template is passed. | `account_security.py` | P2 |
| D9 | In `password_reset_confirm_view` a local variable named `messages` shadows the imported Django module. | `views/auth.py` | P2 |
| D10 | 'Best attempt per student per quiz' is computed with a query per pair, in both export and bulk print. | `quiz_results_management.py` | P2 |
| D11 | Views still call `messages.error(...)` and then redirect. React never renders Django messages, so permission and profile errors disappear silently. | multiple views | P2 |
| D12 | The exam player merges a saved local draft over server answers with `Object.assign`, so a stale local draft can overwrite newer server data. | `StudentQuizTake.tsx` | P2 |

### 5.2 Write path still on legacy handlers

The docs say React uses the versioned JSON APIs. For reads that is true. For these writes it is not: React posts form-encoded bodies with an `X-Requested-With` header to the old handlers, and `react_owned_page` only redirects GETs.

| Area | Legacy endpoints the React client calls |
| --- | --- |
| Students | `/students/create/`, `/<id>/edit/`, `/<id>/delete/`, `/<id>/restore/`, `/bulk-delete/`, `/bulk-import/`, `/bulk-import/preview-headers/` |
| Teachers | `/teachers/create/`, `/<id>/edit/`, `/<id>/delete/`, `/<id>/restore/` |
| Users | `/users/create/`, `/<id>/edit/`, `/<id>/delete/`, `/bulk-password-reset/` |
| Quizzes | `/quizzes/create/`, `/<id>/edit/`, `/<id>/delete/`, `/<id>/update-status/` |
| Questions | create, edit, delete, duplicate, reorder, import under `/quizzes/<id>/questions/` |
| Assignments | `/quizzes/<id>/assignments/create/`, `/<class_id>/delete/` |
| Grading | `/quizzes/responses/<id>/grade/` |

Already on `/api/v1/` for writes (per `urls.py` and docs; **verify** in `academic.ts` and `allocations.ts`): superadmin schools and admins, academic years, terms, classes, subjects, school structure, enrollments, teacher assignments, school settings.

**Impact:** inconsistent error shapes, no single API contract, and the legacy views (some very large, for example `question_management.py` at about 73 KB) cannot be deleted.

### 5.3 Missing or incomplete screens

| ID | Gap |
| --- | --- |
| M1 | Teacher bulk import and export. Django views for import, preview, templates and export exist, and `/teachers/bulk-import/` now redirects to a page with no import control. |
| M2 | Teacher directory lacks what the student directory has: pagination, department filter, bulk archive, details panel, superadmin school selector. |
| M3 | Teacher profile and detail pages. `/teachers/profile/` redirects to the dashboard and detail redirects to the list. |
| M4 | In-app change password for signed-in users. There is no route in `App.tsx` and no endpoint in `urls.py`. Users can only reset by email, and students or teachers without an email get a placeholder `@example.com` address. |
| M5 | `/classes/<id>/quizzes/` and `/quizzes/assignments/` are not wrapped by `react_owned_page`. **Verify** they redirect to a working React screen. |
| M6 | Export buttons (students, teachers, results) are plain links to Django downloads with no loading or error handling. |
| M7 | `/student/progress` is routed. **Verify** it is linked in `StudentAppLayout`. |
| M8 | No teacher preview of a quiz as a student sees it, and no reusable question bank. |

### 5.4 Navigation and UX

- Sidebar shows 'React Workspace' as the dashboard label, an implementation term leaking into the product.
- 'Class Assignments' and 'All Quizzes' share one href; 'Quiz Catalog & Class Assignments' and 'My Quizzes' share another.
- Superadmin sidebar has no academic or people sections even though the routes allow superadmin.
- Exam player has no flag-for-review, and its 'answered' check ignores multi-select answers.
- Timer effect recreates its interval every second and calls `handleSubmit` from a stale closure.

## 6. Target architecture

- **Django:** session auth, tenant enforcement, business rules, `/api/v1/*` JSON, and file downloads. No HTML rendering except the two mount shells.
- **API contract:** JSON in and out, one error envelope `{ code, message, fields? }`, documented in `REACT_API_CONTRACTS.md`. Decide whether to keep function views with shared helpers or adopt a typed layer such as Django Ninja for schemas and OpenAPI.
- **Question types:** a registry on both sides. Backend: validate config, serialize for student, grade. Frontend: editor, player, review. Two new JSON fields, `Question.config` and `QuizResponse.answer_data`.
- **Attempts:** every new field is written into `configuration_snapshot` so old attempts keep rendering.
- **Files:** object storage (S3-compatible or Supabase), private, served by signed URL. Local `MEDIA_ROOT` is not safe on serverless hosting (a `vercel.json` is present).
- **Background work:** a job queue for AI marking and batch operations (Celery with Redis, or a Postgres-backed queue). Nothing like it exists today.

## 7. Implementation plan

Sizes are relative (S under 3 days, M about a week, L two weeks or more) for one developer using an AI coding agent.

| Phase | Goal | Key work | Exit criteria | Size |
| --- | --- | --- | --- | --- |
| 0 | Verify and stabilise | Smoke-test every legacy URL; fix D1, D5, D8, D9, D7; correct the docs; add a CI test that every legacy GET redirects | No 500s on any legacy route; export downloads | S |
| 1 | API v1: people and access | Students, teachers, users, student import as JSON endpoints; switch `api/admin.ts` | No React call to `/students/`, `/teachers/`, `/users/` mutations | M |
| 2 | API v1: assessments | Quizzes, questions, assignments, grading as JSON endpoints; switch `api/teacher.ts`; then delete legacy POST handlers | Legacy quiz and question handlers removed; tenant tests pass | L |
| 3 | Missing screens | Teacher import, export, filters, pagination, details; profile; change password; route audit M5, M7; sidebar cleanup; throttling (D6) | M1 to M8 closed | M |
| 4 | Question engine foundation | Registry, `config`, `answer_data`; fix D2 and D3; real matching, ordering, multi-select, fill-in-blank | Every type creatable, answerable, graded, reviewable | L |
| 5 | Maths | KaTeX rendering; numeric answers with tolerance and units; optional expression equivalence | Maths quiz end to end | M |
| 6 | Rubrics and grading v2 | Rubric models; per-criterion scoring; grading UI | Essay graded by rubric with audit trail | M |
| 7 | AI-assisted marking | Queue; teacher-triggered suggestions; stored separately from final marks | Teacher approves or edits every AI score | M |
| 8 | File upload | Storage; multipart autosave; secure download; limits | Student uploads, teacher views | M |
| 9 | Exam sections, WAEC-style | Sections, shared stimulus, choose-N-of-M, A1 to F9 grading, per-section timing | Two-paper mock exam runs end to end | L |
| 10 | Project work | Separate assignment module reusing rubric, grading, files | Multi-week project with draft, submit, grade | L |
| 11 | Hardening | Accessibility audit, Playwright end-to-end tests, performance, observability | Budgets and audits pass in CI | M |

**Ordering rules:** 0 before everything; 1 and 2 before any new feature touches the write path; 4 before 5, 6 and 9; 6 before 7 and 10; 8 before 10.

**Definition of done for every phase:** Django tests, Vitest, typecheck, lint and build pass in CI; every new endpoint has a cross-tenant test; docs updated.

## 8. Risks

- **Tenant leaks** in new endpoints. Mitigation: use the helpers in `quiz_app/utils/tenant_utils.py` and test across two schools.
- **Breaking old attempts** when question fields change. Mitigation: snapshot every new field and keep a fallback reader.
- **Live-data migrations** (new JSON fields, rubric tables). Mitigation: additive migrations only, backfill separately.
- **AI privacy:** student writing is sent to a third party. Mitigation: per-school opt-in, no identifying fields in the prompt, store model and prompt version.
- **Serverless storage:** uploads vanish without external storage. Decide before Phase 8.

## 9. Decisions needed from you

1. API style: keep function views or adopt Django Ninja.
2. Queue: Celery with Redis, or a Postgres-backed queue.
3. File storage provider.
4. AI provider, and whether schools can switch AI marking off.
5. How close to WAEC: sections and grade bands only, or candidate numbers, timetables and sittings too.
6. Whether project work lives in this app or becomes its own module.

# Part 2: Prompt Pack

Run the prompts in order, one phase per branch and pull request. Paste the shared context block first in every session. Each prompt asks the agent to read named files and post a short plan before it writes code, so you can correct course early.

## Shared context block (paste first, every time)

```text
You are working in the QuizApp repo: Django 5 backend (quiz_app, quiz_system), React 18 + TypeScript + Vite frontend in /frontend, PostgreSQL, multi-tenant by `school`.

Rules:
1. Django is a JSON API plus session auth only. Do not add Django page templates. The only templates are react_app.html and auth_core_app.html.
2. New endpoints live under /api/v1/, take and return JSON (multipart only for files), and return errors as { code, message, fields? }.
3. Scope every queryset by school using quiz_app/utils/tenant_utils.py. Every endpoint needs a cross-tenant test and a wrong-role test.
4. Never break existing attempts. Attempts read QuizAttempt.configuration_snapshot; any new question field must be snapshotted, and readers must fall back for old attempts.
5. Migrations are additive. No destructive changes to live data.
6. Before finishing run: python manage.py test, npm run typecheck, npm run lint, npm test, npm run build.
7. Update docs/REACT_ROUTE_OWNERSHIP.md and docs/REACT_API_CONTRACTS.md for anything you add or remove.
8. Before coding: read the files I name, then post a plan of 10 lines or fewer and wait for my OK.
```

## Phase 0: Verify and stabilise

```text
Goal: prove no retired Django route returns a 500, and fix the known defects.

Read: quiz_app/urls.py, quiz_app/views/*.py, quiz_app/views/auth.py, quiz_app/account_security.py, frontend/src/App.tsx, docs/REACT_ROUTE_OWNERSHIP.md.

Do:
1. Write a Django test that signs in as each role and sends GET to every non-API, non-download URL in urls.py. Assert each returns a 302 to /app/... or /auth-app/ (never 200 HTML, never 500). Check especially /classes/<id>/quizzes/, /quizzes/, /quizzes/assignments/, /quizzes/<id>/detail/, /quizzes/grading/, /quizzes/available/, /school/ and /superadmin/*. Fix every failure.
2. Results export: quiz_results_export_view reads attempt.term.name but Term has no name field. Use academic year plus term number. Add a test that exports a real attempt.
3. Make logout POST-only (keep CSRF) and update the React sign-out flow.
4. account_security.SafePasswordResetForm uses `loader` without importing it: fix or remove that branch. Rename the `messages` variable that shadows the Django module in password_reset_confirm_view.
5. Remove the /components route from App.tsx or guard it to development builds.
6. Add throttling to login and password reset (per IP and per identifier, cache-based) with tests.
7. Replace the per-pair best-attempt loops in export and bulk print with one query.
8. Correct any docs claim that is not true.

Acceptance: new tests pass, export downloads a file with data, no retired route 500s.
```

## Phase 1: API v1 for people and access

```text
Goal: move student, teacher and user writes off the legacy form handlers.

Read: quiz_app/views/student_management.py, teacher_management.py, user_management.py, quiz_app/api_views.py (students, teachers, users sections), frontend/src/api/admin.ts, StudentList.tsx, StudentImportDialog.tsx, TeacherList.tsx, UserList.tsx.

Do:
1. Add JSON endpoints: POST/PATCH on /api/v1/students/ and /api/v1/teachers/; archive and restore; bulk archive; import preview and import (multipart) for both students and teachers; teacher export; POST /api/v1/users/ with PATCH, DELETE and bulk password reset.
2. Extract shared validation and tenant logic from the legacy handlers into service functions in quiz_app/services/ and call them from both until the legacy handlers are removed. Do not copy and paste logic.
3. Return the standard error envelope with field errors.
4. Switch frontend/src/api/admin.ts and the screens to the new endpoints.
5. Make the legacy POST handlers return 410 Gone with a pointer to the new route.

Tests: cross-tenant, wrong role, validation, duplicate admission numbers, partial import outcomes, superadmin school selection.

Acceptance: no React call to /students/, /teachers/ or /users/ mutation URLs remains (grep).
```

## Phase 2: API v1 for assessments

```text
Goal: quiz, question, assignment and grading writes on /api/v1/, then delete the legacy handlers.

Read: quiz_app/views/quiz_management.py, question_management.py, quiz_assignment_management.py, quiz_grading_management.py, models.py (Quiz, Question, AnswerChoice, QuizResponse), frontend/src/api/teacher.ts, QuizEditor.tsx, QuestionEditor.tsx, QuestionImport.tsx, QuizAssignments.tsx, GradingAttempt.tsx.

Do:
1. Endpoints: quizzes (create, update, delete, status), questions (create, update, delete, duplicate, reorder with an ordered id list, bulk delete, import with row-level errors), quiz assignments (assign, unassign, bulk), grading (single response and bulk per attempt).
2. Questions in a quiz that has attempts must not be deletable: return 409 with a clear code, mirroring the existing ProtectedError signals.
3. Keep total_marks recalculation behaviour.
4. Switch frontend/src/api/teacher.ts and screens. Remove X-Requested-With form posts.
5. After parity, delete the legacy handlers and their routes, and update tests.

Tests: tenant isolation, teacher-owns-quiz rule, published quiz edit rules, import errors, grading bounds (cannot exceed question marks).

Acceptance: views/quiz_management.py, question_management.py, quiz_assignment_management.py and quiz_grading_management.py contain no mutation handlers.
```

## Phase 3: Missing screens and navigation

```text
Goal: close gaps M1 to M8 from the review.

Read: frontend/src/features/admin/TeacherList.tsx, StudentList.tsx, StudentImportDialog.tsx, frontend/src/components/layout/Sidebar.tsx, TeacherAppLayout.tsx, StudentAppLayout.tsx, frontend/src/App.tsx.

Do:
1. Bring TeacherList to parity with StudentList: server pagination, department filter, status filter, bulk archive and restore, details panel, superadmin school selector, import dialog (copy the StudentImportDialog pattern), export buttons with loading and error states.
2. Add a teacher profile page and make /teachers/profile/ land on it.
3. Add change password for any signed-in user: POST /api/v1/me/password/ (current and new password, Django validators, keep the session with update_session_auth_hash), plus an Account screen reachable from the header menu for every role.
4. Sidebar: rename 'React Workspace' to 'Dashboard', remove duplicate links, add missing superadmin sections, and make sure Student Progress is linked.
5. Confirm /classes/<id>/quizzes/ and /quizzes/assignments/ lead to a working React screen; build one if not.

Tests: component tests for each new screen, API tests for password change (wrong current password, weak password, session stays valid).
```

## Phase 4: Question engine foundation

```text
Goal: one framework for question types, and fix the three P0 exam defects.

Read: quiz_app/models.py (Question, AnswerChoice, QuizAttempt.capture_configuration, QuizResponse.check_correctness and grade), frontend/src/features/student/StudentQuizTake.tsx, frontend/src/features/teacher/QuestionEditor.tsx, QuizResultDetail.tsx, StudentQuizResult.tsx.

Do:
1. Add Question.config (JSONField) and QuizResponse.answer_data (JSONField) with additive migrations.
2. Create quiz_app/question_types/ with a registry. Each type implements validate_config, serialize_for_student (never leak answers), grade, and serialize_for_review. Implement multiple_choice (single and multi-correct), true_false, short_answer, fill_blank, matching, ordering and essay by moving logic out of check_correctness. Keep reading the legacy fields (correct_answer_text, answer choices) as a fallback so old attempts still grade and render.
3. Extend capture_configuration to snapshot config.
4. Frontend: create src/question-types/ with a registry of Editor, Player and Review components per type. Fix matching (pairs, shuffled right column, select or drag with keyboard support), ordering (reorderable list with keyboard support) and multi-select (checkbox group). Compute 'answered' through the registry.
5. The save endpoint accepts answer_data for any type.

Tests: grading matrix per type (correct, wrong, partial, blank, negative marks), old attempts unchanged, snapshot is immutable after the quiz is edited, student payload contains no correct answers.

Acceptance: every type can be created, answered, auto-graded and reviewed end to end.
```

## Phase 5: Maths

```text
Goal: maths questions with proper rendering and marking.

Read: the Phase 4 registry and frontend/src/question-types/.

Do:
1. Add types numeric (value, absolute or relative tolerance, optional unit, optional significant figures) and math_expression (equivalence checked with SymPy behind a restricted parser, with a time limit; never eval).
2. Render LaTeX with KaTeX in question text, choices and explanations ($...$ and $$...$$), sanitised. Lazy-load KaTeX only when a question contains math, and keep the student bundle within the existing budget.
3. Add a math answer field with live preview and an optional symbol keypad. Add live preview in the question editor.
4. Accept equivalent forms: 1/2 and 0.5, x+1 and 1+x, with the teacher choosing strict or equivalent matching.

Tests: tolerance edges, unit handling, equivalent expressions, rejection of unsafe input, rendering test for inline and display math.
```

## Phase 6: Rubrics and grading v2

```text
Goal: criterion-based grading for essays, long answers and later projects.

Read: QuizResponse.grade and grading_history in models.py, GradingAttempt.tsx, quiz_grading_management.py.

Do:
1. Models: Rubric (school, owner, name), RubricCriterion (name, max points, order), RubricLevel (descriptor, points). Question.rubric FK (nullable). QuizResponse.rubric_scores JSON: [{criterion_id, points, comment}]. Snapshot the rubric into the attempt configuration.
2. API: rubric CRUD; grading accepts per-criterion scores, computes marks_awarded, clamps to question marks, appends to grading_history.
3. Frontend: rubric manager, rubric picker in the question editor, rubric grid in GradingAttempt with keyboard navigation, per-criterion feedback on the student result.

Tests: clamping, history entries, a rubric edited after an attempt does not change that attempt, tenant isolation.
```

## Phase 7: AI-assisted marking

```text
Goal: AI suggests marks against a rubric; a teacher always decides.

Prereqs: Phase 6 done; a job queue chosen (Celery with Redis, or a Postgres-backed queue). Read: the rubric models, GradingAttempt.tsx.

Do:
1. Model AiMarkSuggestion: response FK, provider, model, prompt_version, rubric snapshot, suggested_scores JSON, overall_feedback, status (pending, ready, failed), created_at. Suggestions are stored separately and never change marks_awarded.
2. A provider interface with keys from environment variables. The prompt carries the question, rubric and model answer, and treats the student answer as data: ignore any instructions inside it. Validate the output against a JSON schema; discard anything invalid.
3. Endpoints: POST /api/v1/teacher/responses/<id>/ai-suggest/ (queued, then poll) and a bulk version for an attempt.
4. School setting ai_marking_enabled, default off, with consent text. Remove student name and admission number from the prompt. Per-school rate limit and usage log.
5. Frontend: 'Suggest with AI' in GradingAttempt, suggestion beside the rubric grid with Accept, Edit and Dismiss, and an 'AI-assisted' mark in grading history.

Tests with a mocked provider: invalid output, prompt injection in the answer, disabled setting, rate limit, tenant isolation.
```

## Phase 8: File upload

```text
Goal: students upload files as answers, securely.

Read: settings.py (MEDIA settings), the student save endpoint in api_views.py, StudentQuizTake.tsx.

Do:
1. Configure private object storage with django-storages (S3-compatible or Supabase). No public URLs.
2. Question type file_upload with config: allowed extensions, max size, max files.
3. Model ResponseFile: response FK, school, storage key, original name, size, content type, sha256, uploaded_at.
4. Endpoints: multipart POST /api/v1/student/attempts/<id>/files/ (validate extension and magic bytes, size, count, and that the attempt is open and unexpired), DELETE, and a short-lived signed URL for the teacher or owner. Add a hook for virus scanning.
5. Frontend: drag-and-drop player with progress, retry and a clear error per file; image and PDF preview in GradingAttempt; upload state included in the autosave indicator.
6. Retention setting and deletion when an attempt is deleted.

Tests: oversize, wrong type, spoofed extension, expired attempt, cross-tenant download, signed URL expiry.
```

## Phase 9: Exam sections and WAEC-style papers

```text
Goal: multi-paper exams with sections, shared stimuli and grade bands.

Read: Quiz, Question, QuizAttempt.capture_configuration, get_grade in models.py, StudentQuizTake.tsx, QuizEditor.tsx.

Do:
1. Models: QuizSection (quiz, title, instructions, order, optional time limit, marks), QuestionGroup (shared passage, figure or data), Question.section and Question.group FKs (nullable), section rule choose_n (answer N of M). GradeScale (school, name, bands with remarks) with a WAEC preset A1 to F9; Quiz.grade_scale FK; replace the hard-coded get_grade with the scale, defaulting to the current behaviour.
2. Snapshot sections, groups and rules in the attempt. Enforce section timing and optional section locking on the server.
3. Student player: section header and instructions, per-section timer, pinned stimulus, choose-N controls that enforce the limit.
4. Teacher UI: section builder, group editor, grade scale editor.
5. Results: per-section scores, grade band and a printable result slip.

Tests: section time expiry, choose-N scoring, locked sections, grade band boundaries, old quizzes unchanged.
```

## Phase 10: Project work

```text
Goal: multi-week project assessments as their own module.

Read: the rubric and file-storage code from Phases 6 and 8.

Do:
1. New app `projects`: Project (subject, classes, teacher, brief, rubric, deadline, late policy, file rules, optional milestones), ProjectSubmission (student, status draft, submitted, graded, returned; files; notes; submitted_at; resubmission history), ProjectGrade (rubric scores and feedback).
2. API v1 and React screens. Teacher: create, publish, track submissions, grade with the rubric grid, return for revision. Student: read the brief, upload files, save a draft, submit, see feedback.
3. Reuse the rubric and storage services. Do not copy them.

Tests: deadline and late rules, resubmission, status transitions, tenant isolation.
```

## Phase 11: Hardening

```text
Goal: make it safe to run real exams.

Do:
1. Playwright end-to-end tests: sign-in; a student taking a quiz with each question type; teacher authoring; grading; results. Run them in CI.
2. Accessibility: run axe on the main screens and fix findings; complete an exam with the keyboard only; honour reduced motion.
3. Performance: keep the bundle budget check in CI; review EXPLAIN plans for results and grading queries and add indexes where needed.
4. Security checklist: CSRF, cookie flags, CORS, upload limits, rate limits, dependency audit, secrets handling.
5. Observability: structured logging, an error reporting hook, and an audit log for grading changes.
6. Update every doc and delete stale claims.
```

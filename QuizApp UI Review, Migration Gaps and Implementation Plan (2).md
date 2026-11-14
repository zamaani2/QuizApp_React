# QuizApp: UI Review, Migration Gaps and Implementation Plan

Status as of 2026-11-11 against `zamaani2/QuizApp_React` at commit `92c7848`. Work already built has been removed from this plan; only remaining work is listed. Part 1 is the review and plan; Part 2 is the prompt pack.

## 1. Status snapshot

Phases 0, 1, 2 and 4 are built. The next focus is Phase 9a (quiz workspace UX), then Phase 9 (exam sections with scores only, plus Excel and CSV export for teachers).

**Built and removed from this plan**

- Stabilisation: results export fixed, logout is POST-only, login and password-reset throttling added, `/components` route removed, missing `loader` import fixed, best-attempt query replaced by a subquery.
- API v1 for people: students, teachers, users, import, archive and teacher export. The React client no longer calls the legacy handlers.
- API v1 for assessments: quizzes, questions, assignments and grading, with tenant tests and 410 responses on legacy quiz and question posts.
- Question engine: a backend registry with multiple choice (single and multi-correct), true/false, short answer, fill-in-blank, matching, ordering and essay; migration `0009`; a frontend registry with a player and review component per type.

**Not started:** maths, rubrics, AI marking, file upload, sections, project work, hardening. Migrations stop at `0009`; there is no KaTeX, SymPy, `django-storages` or queue library in the repo.

## 2. Scope and method

**Method:** re-read the repo at commit `92c7848`: `urls.py`, the new API modules, `question_types/`, `settings.py`, `auth.py`, `rate_limiting.py`, the frontend API clients, `App.tsx`, `TeacherList.tsx`, the question-type registry and the new tests. **Not read:** `api_views.py` (224 KB), `StudentQuizTake.tsx` after the latest change, the question-type backend tests, and whether the people endpoints return 410 on legacy posts. I did not run the app. Items marked **verify** are inferred, not confirmed.

## 3. Remaining gaps

Severity: **P0** broken or unusable now; **P1** blocks the stated goal (Django as API only) or is a security gap; **P2** quality and polish.

### 3.1 Open defects

| ID | Defect | Evidence | Sev |
| --- | --- | --- | --- |
| R1 | `/students/<id>/detail/` and `/teachers/<id>/detail/` redirect to `/app/admin/students/{id}` and `/app/admin/teachers/{id}`, but `App.tsx` has no such routes, so users get the 404 page. | `urls.py`, `App.tsx` | P0 |
| R2 | Throttling is weak as deployed. `settings.py` has no `CACHES`, so the default per-process memory cache is used and is not shared across workers or instances. It keys on `REMOTE_ADDR`, which behind a proxy is the proxy address. The per-identifier limit also lets someone lock out a known username. | `rate_limiting.py`, `settings.py` | P1 |
| R3 | Teacher directory never sends a `page` parameter, so only the first page is reachable. **Verify** the page size in `teachers_api_view`. | `TeacherList.tsx` | P1 |
| R4 | Teacher import preview shows raw JSON with no column mapping; the bulk-archive API exists but has no button; there is no department filter. | `TeacherList.tsx`, `admin.ts` | P2 |
| R5 | `updateStudent` and `updateTeacher` PATCH the collection URL with the id in the body, although per-id routes exist. | `admin.ts`, `urls.py` | P2 |
| R6 | Views still call `messages.*`. React never shows Django messages, so those errors vanish. | `views/*.py` | P2 |
| R7 | `ComponentInventoryPreview` is unrouted dead code in `App.tsx`. | `App.tsx` | P2 |
| R8 | The exam player merges a saved local draft over server answers. **Verify** it still does after the latest change. | `StudentQuizTake.tsx` | P2 |
| R9 | The quiz page Delete button calls the delete function directly, so the confirm dialog never opens and one click deletes the quiz. | `QuizDetail.tsx` | P0 |
| R10 | Question import discards the row errors the API returns and shows only a count. | `QuestionImport.tsx` | P1 |
| R11 | The import page still uses a Bootstrap class (`link-primary`); other leftovers may exist. | `QuestionImport.tsx` | P2 |

### 3.2 Missing or incomplete screens

| ID | Gap |
| --- | --- |
| M1 | Change password for signed-in users. There is no route in `App.tsx` and no endpoint in `urls.py`. Users can only reset by email, and students or teachers without an email get a placeholder `@example.com` address. |
| M2 | Teacher profile page. `/teachers/profile/` still redirects to the dashboard. |
| M3 | Export links for students and teachers are plain downloads with no loading or error handling. The results export is replaced in Phase 9. |
| M4 | **Verify** that `/student/progress` is linked in `StudentAppLayout`. |
| M5 | No teacher preview of a quiz as a student sees it, and no reusable question bank. |

### 3.3 Navigation and UX

- Text is very small: labels 11px, inputs 12px, buttons 11px at 30 to 34px high, badges and helper text 10px (`assessment.css`). Touch targets are below 44px.
- The quiz page scatters actions across two button rows, and each question card adds six more controls.
- The question form is one flat grid. Matching, ordering and fill-in-blank are authored with special syntax in a text box.
- Classes can be assigned in two places (editor and Assignments page) and status in two places (editor and Publish button).
- The quiz editor is a four-step wizard with about 25 fields, used for both creating and editing.
- Sidebar shows 'React Workspace' as the dashboard label, and some entries share an href (**verify**). Superadmin sidebar has no academic or people sections (**verify**).
- Exam player has no flag-for-review, and its timer effect recreates its interval every second (**verify**).
- Essay rubrics are still free text.

## 4. Target architecture

- **Django:** session auth, tenant enforcement, business rules, `/api/v1/*` JSON, and file downloads. No HTML rendering except the two mount shells.
- **Attempts:** every new field is written into `configuration_snapshot` so old attempts keep rendering.
- **Shared cache:** a Redis or database cache for throttling, and trusted-proxy handling for client IPs.
- **Files:** private object storage (S3-compatible or Supabase), served by signed URL. Local `MEDIA_ROOT` is not safe on serverless hosting (a `vercel.json` is present). Needed from Phase 8.
- **Background work:** a job queue for AI marking and batch operations. Needed from Phase 7. Not needed for Phase 9.

## 5. Implementation plan

Sizes are relative (S under 3 days, M about a week, L two weeks or more) for one developer using an AI coding agent.

| Phase | Goal | Key work | Exit criteria | Size |
| --- | --- | --- | --- | --- |
| 3 (rest) | Close open gaps | Fix detail redirects (R1); shared cache and proxy IP handling (R2); teacher pagination, department filter, bulk archive, import column mapping (R3, R4); change password; teacher profile; sidebar cleanup | R1 to R8 and M1 to M4 closed; no retired route lands on the 404 page | M |
| 5 | Maths | KaTeX rendering; numeric answers with tolerance and units; optional expression equivalence | Maths quiz end to end | M |
| 6 | Rubrics and grading v2 | Rubric models; per-criterion scoring; grading UI | Essay graded by rubric with audit trail | M |
| 7 | AI-assisted marking | Queue; teacher-triggered suggestions stored separately from final marks | Teacher approves or edits every AI score | M |
| 8 | File upload | Private storage; multipart autosave; secure download; limits | Student uploads, teacher views | M |
| 9a | Quiz workspace UX (before Phase 9) | Bug fixes and readable base styles (R9 to R11); separate sidebar pages for Quizzes, Questions and Assignments; three-field quiz creation with presets and a sectioned settings page; compact questions list; sectioned question editor with preview; three-step import with preview; assignments table with side panel | Every quiz task reachable from the sidebar; no screen with competing primary actions; axe clean | M |
| 9 | Exam sections and score export (after 9a) | Sections, shared passages, answer N of M, per-section timing; per-section scores; Excel and CSV export | Two-section exam runs end to end; export opens in Excel | L |
| 10 | Project work | Separate module reusing rubric, grading and files | Multi-week project with draft, submit, grade | L |
| 11 | Hardening | Accessibility audit, Playwright end-to-end tests, performance, observability | Budgets and audits pass in CI | M |

**Ordering rules:** fix R1 first, and run UX-0 early because it fixes R9. Recommended order: Phase 3 (rest), 9a, 9, 5, 6, 7, 8, 10, 11. Do 9a before Phases 5, 6 and 8, because they add fields to the question editor and grading screens that 9a rebuilds. Inside 9a, run UX-0 and UX-1 first; UX-2 to UX-7 can then run in any order, and UX-8 closes it out. Phase 6 comes before 7 and 10; Phase 8 comes before 10.

**Definition of done for every phase:** Django tests, Vitest, typecheck, lint and build pass in CI; every new endpoint has a cross-tenant test; docs updated.

### 5.1 Phase 9 scope (decided)

Scores only: no WAEC grade bands, letter grades, result slips or candidate numbers. Results are uploaded to another platform, so teachers export scores to Excel or CSV after the exam.

- **In:** sections with instructions and an optional time limit; text-only shared passages; answer N of M rules; section-by-section navigation; per-section scores; Excel and CSV export.
- **Still manual:** essays are marked through the existing grading screen, so the export must know which attempts are pending.

Assumptions to confirm:

1. If any section has a time limit, sections run in order and each locks when submitted or when its time runs out. Otherwise navigation is free under the existing overall timer.
2. In an answer-N section all questions carry equal marks, so the section maximum is N times the marks per question.
3. Shuffling happens only inside a section; sections keep their order.
4. Quizzes without sections behave exactly as they do now.
5. The teacher selects one quiz for export. The export defaults to each student's best attempt for that quiz, with latest and all attempts as options.
6. Attempts with ungraded essays are left out by default, with a warning of how many were skipped; a toggle includes them marked as pending.
7. Percentage is left out unless switched on.

Export columns: admission number, student name, class, subject, quiz title, total score, total marks, attempt number, status, submitted time, and optional percentage. Exports are for one selected quiz and contain no section columns; section breakdowns appear on individual result slips. Cells that start with `=`, `+`, `-`, `@`, tab or CR are neutralised in both formats, and the CSV is UTF-8 with a BOM so Excel shows names correctly.

### 5.2 Phase 9a scope (revised recommendation)

Goal: make quiz setup, question authoring, importing and class assignment easier to find and complete. Use the quiz overview as the hub, with focused task pages, readable controls and clear next steps. Keep the first release focused; do not add a reusable question bank or redesign unrelated teacher screens.

- **Desktop sidebar:** Home; then Assessments: Quizzes, Questions, Assignments, Grading, Results. The quiz overview links directly to its Questions, Assignments and Settings tasks.
- **Mobile navigation:** prioritize Home and the main assessment workflow. Do not reserve three of five bottom-navigation slots for Quizzes, Questions and Assignments by default; use a compact Assessments entry or a clearly labelled More menu for less frequent destinations. Keep Grading and Results reachable without making the menu ambiguous.
- **Routes:** `/teacher/quizzes`, `/teacher/quizzes/new`, `/teacher/quizzes/:id` (overview), `/teacher/quizzes/:id/settings`, `/teacher/questions` (quiz picker), `/teacher/questions/:quizId`, `/teacher/questions/:quizId/new`, `/teacher/questions/:quizId/:questionId/edit`, `/teacher/questions/:quizId/import`, `/teacher/assignments` (with `?quiz=ID` opening the panel). Old routes redirect.
- **No data model change for questions** (Option A: separate pages with a quiz picker). A reusable question bank (Option B) can follow later.
- **Creating a quiz** asks for title, subject, and a preset (plus Teacher for admins); the plan's “three-field” description excludes the admin-only Teacher field. Presets are editable starting points: show a concise summary of timer, attempts and result visibility before creation, and make clear that the teacher can change these in Settings. Explicitly disclose when correct answers will be shown to students.
- **One home for each setting:** classes only on Assignments; status only through Publish, Unpublish and Archive.
- **Presets (defaults, editable afterwards):** Practice quiz: untimed, 3 attempts, score shown right away; showing correct answers is an explicit choice. Class test: 30 minutes, 1 attempt, questions shuffled, score only. Exam: 60 minutes, 1 attempt, questions and choices shuffled, results hidden until the teacher releases them.
- **Backend changes:** pass-mark percentage support, any results-release mechanism, import dry run and server-side publish validation are API/business-rule work, not merely presentation changes. Confirm existing behavior and agree each API contract before dependent UI work; results release may require a migration.
- **Assignments first release:** list quizzes, show their current class assignments and schedule/status, and provide a focused assignment panel with clear save feedback. Add advanced filters, academic-year grouping, student counts and attempt-aware removal confirmation only where existing data and teacher workflows justify them. Keep tenant/ownership checks and confirmation for consequential removals.

**Workflow rules:** The quiz overview is the hub and exposes the next incomplete task. The Questions page includes a visible quiz selector, supports direct links and may remember the last quiz as a convenience; browser storage must not be the only way to switch quizzes or recover context. Keep one visually dominant action for the page's current state, with secondary actions grouped nearby. On small screens, collapse the live question preview below the editor instead of squeezing the form and preview side by side.

**Acceptance criteria:** A teacher can create a quiz, add or import questions, assign classes and publish by following links from the overview. Each page has a clear primary action and a visible route back to the overview. Core flows work by keyboard, at 360px width and 200% zoom; touch controls meet the stated minimum size and text/contrast criteria. Validate these criteria directly rather than relying on the subjective claim that no page has “competing primary actions.”

## 6. Risks

- **Tenant leaks** in new endpoints. Mitigation: use the helpers in `quiz_app/utils/tenant_utils.py` and test across two schools.
- **Breaking old attempts** when question or section fields change. Mitigation: snapshot every new field and keep a fallback reader.
- **Live-data migrations** (sections, rubric tables, results release). Mitigation: additive migrations only, backfill separately.
- **AI privacy:** student writing is sent to a third party. Mitigation: per-school opt-in, no identifying fields in the prompt, store model and prompt version.
- **Serverless storage:** uploads vanish without external storage. Decide before Phase 8.
- **Broken links after the route split (9a):** old bookmarks and Django redirects can land on missing pages. Mitigation: redirect every old route and keep the redirect-target test in CI.
- **Exports opened in Excel:** a student name that starts with = + - or @ can run as a formula. Mitigation: neutralise those cells (Phase 9, Prompt 2).

## 7. Decisions needed from you

1. Queue and cache: Redis, which can serve both the throttling cache needed in Phase 3 and the queue needed before Phase 7, or a database cache plus a Postgres-backed queue.
2. File storage provider (needed before Phase 8).
3. AI provider, and whether schools can switch AI marking off.
4. Whether project work lives in this app or becomes its own module.
5. Confirm the seven Phase 9 assumptions above, or say which to change.
6. Phase 9a: the recommended first release is separate task pages with a visible quiz selector; defer a reusable question bank.
7. Phase 9a: confirm the Practice quiz, Class test and Exam preset defaults, including whether Practice reveals correct answers. Confirm the percentage pass-mark behavior before UX-3's backend/API work.

Decided since the first draft: function views stay (no Django Ninja), and WAEC-style grading is out of scope.

# Part 2: Prompt Pack

Run the prompts in the order given under Ordering rules in section 5, not the order they appear on this page, with one phase per branch and pull request. Paste the shared context block first in every session. Each prompt asks the agent to read named files and post a short plan before it writes code, so you can correct course early.

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
9. Add or change question types only through quiz_app/question_types/ and frontend/src/question-types/. Do not add type-specific branches anywhere else.
```

## Phase 3 (rest): Open gaps

```text
Goal: close the open Phase 3 gaps (R1 to R8 and M1 to M4 in the review).

Read: frontend/src/App.tsx, quiz_app/urls.py (react_owned_page and the detail redirects), quiz_app/rate_limiting.py, quiz_system/settings.py, quiz_app/directory_api_views.py, frontend/src/features/admin/TeacherList.tsx, StudentList.tsx, StudentImportDialog.tsx, frontend/src/api/admin.ts, frontend/src/components/layout/Sidebar.tsx, StudentAppLayout.tsx, frontend/src/features/student/StudentQuizTake.tsx. Do not edit the teacher navigation here; UX-1 rebuilds it.

Do:
1. R1 first: add React routes for /admin/students/:id and /admin/teachers/:id (a details view), or change the two detail redirects in urls.py to the list. Add a test that every redirect target in urls.py matches a route in App.tsx.
2. R2: configure a shared cache (Redis or database) in settings. Read the client IP from a trusted proxy header only when configured. Where possible slow repeated attempts down instead of locking out a username. Update the rate-limit tests.
3. R3 and R4: TeacherList gets server pagination, a department filter, bulk archive (the API exists) and an import dialog with column mapping, following StudentImportDialog. Use the id in the URL for update calls (R5).
4. Change password: POST /api/v1/me/password/ (current and new password, Django validators, keep the session with update_session_auth_hash, throttled) and an Account screen reachable from the header menu for every role.
5. Teacher profile page, and make /teachers/profile/ land on it.
6. Sidebar (admin and student layouts): rename 'React Workspace' to 'Dashboard', remove duplicate links, add the missing superadmin sections, link Student Progress. Delete the unrouted ComponentInventoryPreview (R7).
7. R6: where a legacy handler still calls messages.* and then redirects, return a JSON error instead if an API route exists, and remove the dead calls elsewhere.
8. R8: when StudentQuizTake restores a saved local draft, let server answers win unless the draft is newer (store a timestamp with the draft). Add a test.
9. M3: student and teacher export links become authenticated downloads with loading and error states.

Tests: component tests for each new screen; API tests for password change (wrong current password, weak password, session stays valid, rate limit); tenant and role tests for the teacher actions.
```

## Phase 5: Maths

```text
Goal: maths questions with proper rendering and marking.

Read: the Phase 4 registry and frontend/src/question-types/.

Do:
1. Add types numeric (value, absolute or relative tolerance, optional unit, optional significant figures) and math_expression (equivalence checked with SymPy behind a restricted parser, with a time limit; never eval).
2. Render LaTeX with KaTeX in question text, choices and explanations ($...$ and $$...$$), sanitised. Lazy-load KaTeX only when a question contains math, and keep the student bundle within the existing budget.
3. Add a math answer field with live preview and an optional symbol keypad. Add the numeric and expression editors to the sectioned question editor from UX-5, and render math in its live preview.
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

## Phase 9a: Quiz workspace UX (do before Phase 9)

Run UX-0 and UX-1 first, then UX-2 to UX-7 in any order, then UX-8. Assumed defaults: separate pages with a quiz picker (no data model change for questions), presets Practice quiz, Class test and Exam, and a percentage pass mark. Paste the shared context block first in every session.

### UX-0: Bug fixes and readable base styles

```text
Goal: fix defects R9 to R11 (quiz delete, import errors, Bootstrap class) and make text and controls readable everywhere in the teacher area.

Read: frontend/src/features/teacher/QuizDetail.tsx, QuestionImport.tsx, frontend/src/features/assessment.css, frontend/src/components/layout/core-shell.css and portal-shell.css.

Do:
1. R9: the Delete button on the quiz page calls handleDeleteQuiz directly. Open the ConfirmDialog instead (setDeleteQuizOpen(true)); the message names the quiz and says what is lost. Test: clicking Delete does not call the API until the dialog is confirmed.
2. R10: show every row error the import API returns in a table (row, field, message) with a count, and show the created count with a 'View questions' link on success.
3. R11: replace the Bootstrap class link-primary with the app's own link style, and grep frontend/src for other leftover Bootstrap class names (btn, col-, d-flex, text-muted, link-, badge bg-) and fix them.
4. Base styles inside .core-content: labels 13px weight 600; inputs and selects 15px with min-height 42px; buttons 14px with min-height 40px (small 36px); badges and helper text 12px; the small text class 12px. On narrow screens and (pointer: coarse) every button, input and select has min-height 44px. Card body padding 24px (16px on mobile).
5. Add reusable utilities: .page-section (32px vertical gap between sections), .form-page (max-width 880px, centred), and .sticky-actions (sticky bottom bar with a solid background, safe-area padding, and an offset above the mobile bottom navigation).
6. Keep colour contrast at 4.5:1 or better; check var(--core-muted) on the card background and fix the token if it fails.

Tests: update TeacherAdminResponsiveness.test.tsx and any snapshots. Acceptance: no text under 12px in the teacher area, main controls are at least 40px (44px on touch), the confirm dialog gate works.
```

### UX-1: Teacher navigation and route split

```text
Goal: give Quizzes, Questions and Assignments their own sidebar items and routes. Pages can wrap existing components until UX-2 to UX-7 replace them.

Read: frontend/src/components/layout/TeacherAppLayout.tsx (TEACHER_NAV_ITEMS), TeacherAppLayout.test.tsx, frontend/src/App.tsx (teacher routes), quiz_app/urls.py (react_owned_page redirects for quizzes, questions, assignments), docs/REACT_ROUTE_OWNERSHIP.md.

Do:
1. Nav items: Home (/teacher/dashboard) under Workspace; Quizzes (/teacher/quizzes), Questions (/teacher/questions), Assignments (/teacher/assignments), Grading (/teacher/grading), Results (/teacher/results) under Assessments. Remove 'Create Quiz' from the sidebar (it becomes a button on the Quizzes page). Use lucide icons.
2. Mobile navigation prioritizes Home and assessment tasks without dedicating three of five bottom-navigation slots to Quizzes, Questions and Assignments. Use a compact Assessments entry or a clearly labelled More sheet for less frequent destinations; keep Grading and Results easy to find.
3. Make isActive precise: Quizzes is active only on /teacher/quizzes and /teacher/quizzes/:id (including /settings); Questions on /teacher/questions/*; Assignments on /teacher/assignments.
4. Routes in App.tsx: /teacher/quizzes, /teacher/quizzes/new, /teacher/quizzes/:id, /teacher/quizzes/:id/settings, /teacher/questions, /teacher/questions/:quizId, /teacher/questions/:quizId/new, /teacher/questions/:quizId/:questionId/edit, /teacher/questions/:quizId/import, /teacher/assignments. Redirect the old routes (for example /teacher/quizzes/:id/questions/new to /teacher/questions/:id/new, /teacher/quizzes/:id/assignments to /teacher/assignments?quiz=:id, /teacher/quizzes/:id/edit to /teacher/quizzes/:id/settings) with <Navigate replace>.
5. Update every Django redirect in urls.py and the views that point at the old React routes. Add or extend the test that every redirect target in urls.py matches a route in App.tsx.
6. Rename dashboard label 'Teaching Workspace' to 'Home' and 'Quiz Catalog' to 'Quizzes' everywhere they appear.

Tests: layout tests for desktop sidebar and mobile bar, active-state rules, old-route redirects, redirect-target test. Update docs.
```

### UX-2: Quizzes list and quiz overview

```text
Goal: a clean quiz list, and an overview page that shows status and setup progress without the question list.

Read: frontend/src/features/teacher/QuizList.tsx, QuizDetail.tsx, frontend/src/api/teacher.ts, the QuizDetailData type, assessment_api_views.py (quiz detail and status).

Do:
1. Quizzes page: title row with a primary 'New quiz' button; search; status filter (All, Draft, Published, Archived). Each quiz shows title, subject, status chip, question count, classes (first two plus +N), and a schedule summary. A table on desktop and cards on mobile. A row menu holds Open, Settings, Archive and Delete (with confirm). Add Duplicate only if an API already exists.
2. Quiz overview (/teacher/quizzes/:id): header with title, status chip, subject and term, and exactly one primary action by state: Publish for a draft (disabled with the reason shown while the checklist is incomplete), Unpublish for a published quiz. A menu holds Settings, Archive and Delete (confirm). Remove the question list from this page.
3. Summary cards: questions, total marks, pass mark, attempts allowed, time limit.
4. Setup checklist card with progress ('2 of 4'): Add questions (N added) with a button to /teacher/questions/:id; Assign classes (N classes) with a button to /teacher/assignments?quiz=:id; Review settings with a button to settings; Publish. Done and to-do states come from the data.
5. A results card with the attempt count linking to /teacher/results?quiz_id=:id. Check that the Results page supports this filter and add it if it does not.

Tests: filters, empty states, checklist states, one primary action per state, delete confirm, mobile layout.
```

### UX-3: Quiz creation and settings

```text
Goal: replace the four-step, 25-field wizard with a three-field create form and a sectioned settings page.

Read: frontend/src/features/teacher/QuizEditor.tsx, assessment_api_views.py (quiz create, update, status), models.py (Quiz: passing_marks, pass_percentage, total_marks, show_results_immediately, show_correct_answers, allow_review, term and year defaults), frontend/src/api/teacher.ts and types.

Create (/teacher/quizzes/new):
1. Fields: Title, Subject, Teacher (admins only), and a Type picker shown as three cards. Show each preset's timer, attempt and result-visibility defaults before selection is committed. Practice quiz: untimed, 3 attempts, score shown right away; revealing correct answers is an explicit choice. Class test: 30 minutes, 1 attempt, questions shuffled, score only. Exam: 60 minutes, 1 attempt, questions and choices shuffled, results hidden until released. Keep the presets in one shared constants file. The UI sends explicit field values; the server has no hidden presets.
2. New quizzes start as draft with the school's current academic year and term (check the API; fix it server-side if it is not defaulted). Then open the quiz overview.

Settings (/teacher/quizzes/:id/settings): one page of collapsible section cards, each showing a one-line summary when closed:
3. Details: title, subject, student instructions; a 'More' disclosure for description, category and difficulty.
4. Timing and attempts: time limit, maximum attempts, pass mark as a percentage with a hint like '50% (20 of 40 marks)'.
5. Availability: 'Open now' or 'Schedule'. Date pickers appear only for Schedule; validate that until is after from.
6. Results and review: one choice, 'Score and answers right away', 'Score only', or 'Hide until I release them', mapped onto the existing flags.
7. Question order: randomise questions, randomise choices.
8. Security: a 'Require password' toggle that reveals the password field with show and hide.
9. Academic year and term appear as text with a 'Change' link opening a small dialog. Classes and status are not on this page.
10. Sticky save bar with an 'Unsaved changes' indicator, Save and Discard, and a guard when leaving with unsaved changes.

Backend:
11. Pass mark: read how passing_marks, pass_percentage and total_marks relate today. Agree the API contract before implementation. Preferred: the API accepts pass_percentage and keeps passing_marks in sync whenever total marks change.
12. Results release: check how student result APIs use show_results_immediately. If no teacher-release mechanism exists, document the gap and propose the smallest API/migration change before implementing it; add the UI only after that behavior is agreed. A minimal option is nullable results_released_at on Quiz, a 'Release results' action on the overview, and student APIs that honour it.
13. The publish endpoint refuses with clear error codes when the quiz has no questions, the dates are invalid, or the time limit is invalid. Field errors use the standard error envelope.
14. Remove the old wizard and the classes multi-select from QuizEditor.

Tests: preset values, validation, dirty guard, results-option round trip, percentage conversion when marks change, publish refusal codes, ownership and cross-tenant rules.
```

### UX-4: Questions page

```text
Goal: a dedicated, uncluttered page for the questions of one quiz.

Read: frontend/src/features/teacher/QuizDetail.tsx (question list), frontend/src/api/teacher.ts (reorder, duplicate, delete), frontend/src/question-types/ (Review components), QuizList.tsx.

Do:
1. /teacher/questions shows a searchable, visible quiz selector (grouped by status) and supports direct links to /teacher/questions/:quizId. Remembering the last quiz is a convenience only; the selector remains available. With no quizzes, show a 'Create a quiz' prompt.
2. For the chosen quiz: a summary strip (N questions, total marks, counts by type) and a toolbar with '+ Add question' (primary), 'Import' (secondary), a type filter and search, and bulk select with 'Delete selected' (confirm).
3. Compact rows: number, question text clamped to two lines, type chip, marks, and a flag when the answer key is missing. Clicking a row expands it and shows the registry Review component. A kebab menu per row holds Edit, Duplicate and Delete (confirm).
4. Reorder: a drag handle plus a keyboard alternative (move up and down buttons while the row is focused or in a 'Reorder' mode). Use the existing reorder API with an optimistic update and rollback on error.
5. Empty state: two large cards, 'Write a question' and 'Import from file'.
6. When the quiz is published and has attempts, show a non-blocking note that edits affect new attempts only, and surface the 409 message clearly when deletion is refused.
7. Leave a clearly named slot for a SectionsPanel (Phase 9). Do not build it.

Tests: picker memory, deep link, expand and collapse, reorder with rollback, bulk delete, empty states, 409 handling, keyboard use.
```

### UX-5: Question editor

```text
Goal: replace the flat question form with a sectioned editor, structured answer inputs and a live preview.

Read: frontend/src/features/teacher/QuestionEditor.tsx, frontend/src/question-types/index.tsx, the student player components, saveQuestion in frontend/src/api/teacher.ts, quiz_app/question_types/*.

Do:
1. Routes: /teacher/questions/:quizId/new and /teacher/questions/:quizId/:questionId/edit. Layout: form on the left, a live student preview on the right at 1024px and above; below that, a collapsible Preview under the form.
2. Section cards: (a) Type, as picker cards with an icon and a one-line description, editable only when creating (a read-only chip when editing); (b) Question text with an auto-sizing field; (c) Answer, type-specific; (d) Scoring: marks, negative marks, difficulty, required; (e) Feedback: explanation, inside an 'Advanced' disclosure.
3. Remove the Order field. New questions append; reordering lives on the Questions page.
4. Replace syntax inputs: matching becomes rows of two inputs (left, right) with add, remove and reorder; ordering becomes a list of item inputs with up and down buttons, labelled 'Correct order'; short answer becomes accepted-answer chips (Enter adds one), keeping the existing case rules; fill in the blank gets an 'Insert blank' button that puts a marker in the text and shows one answer group per blank. Serialise to the config shapes the API already accepts. If blank markers need new config, extend the registry and migrate on read; never break stored questions.
5. Multiple choice: explain that one correct choice means a single answer and more than one means students pick several; allow reordering choices; require at least two choices.
6. Show validation inline beside each field (not one banner), and focus the first invalid field.
7. Sticky footer: Cancel, 'Save and add another', Save. 'Save and add another' keeps the type and marks, clears the content, and shows a toast with the new count. Save returns to the Questions page with the new question highlighted.
8. Guard against leaving with unsaved changes.

Tests: every type round-trips (create, save, reload, same values), inline validation, save and add another, the guard, preview matches the student player, and existing stored questions load unchanged.
```

### UX-6: Question import flow

```text
Goal: a three-step import with a preview, so teachers see problems before anything is created.

Read: frontend/src/features/teacher/QuestionImport.tsx, the import handler in quiz_app/assessment_api_views.py, the import template download views, quiz_app/question_types/*.

Backend:
1. Add a dry run (a dry_run flag or a separate preview endpoint). It parses and validates everything and creates nothing. It returns rows [{row, status, type, text_preview, errors:[{field, message}]}] and a summary {total, valid, invalid}.
2. The real import takes the same file plus skip_invalid. Without it, refuse if any row is invalid. With it, import the valid rows and report the skipped ones.
3. Keep the 5 MB limit, a row cap, allowed types, and ownership and tenant checks. Serve the CSV and XLSX templates from /api/v1/ or keep the existing download routes and document them.

Frontend (/teacher/questions/:quizId/import), with a step indicator:
4. Step 1, Format: a collapsible 'How to format your file' with a table per question type (columns and an example row), and template download buttons.
5. Step 2, Upload and check: a drag-and-drop zone plus a file picker (csv or xlsx, 5 MB), then a preview table (row, type, question preview, status) with an 'Errors only' filter, per-row messages and counts. The user can fix the file and re-upload without leaving the page.
6. Step 3, Confirm: 'Import N valid questions' (with a 'skip N invalid rows' checkbox when needed), then a result summary with the created count, a 'View questions' link and 'Import another file'.
7. The drop zone is keyboard operable, and status changes are announced with aria-live.

Tests: preview creates nothing, invalid rows are listed, skip_invalid behaviour, size and type limits, ownership and cross-tenant rules, keyboard upload.
```

### UX-7: Assignments page

```text
Goal: one page to see and manage which classes have which quizzes.

Read: frontend/src/features/teacher/QuizAssignments.tsx, the assignment endpoints in assessment_api_views.py, frontend/src/api/teacher.ts, the classes API (student counts).

Do:
1. /teacher/assignments: a table of the teacher's quizzes (the whole school for admins) with Quiz, Status, Assigned classes, schedule summary and an 'Assign' action. Add basic search and useful filters only if supported by existing data. Cards on mobile.
2. An 'Assign' side panel (a drawer on desktop, a full-screen sheet on mobile), also opened by ?quiz=ID. It has class search, assigned classes pre-checked with an 'Assigned' badge, and clear select/deselect controls. Defer academic-year grouping and student counts unless existing data makes them inexpensive and useful.
3. A live summary ('Assign to 3 classes, remove from 1') and a single Save that calls the existing assign and unassign endpoints (add a bulk 'set classes' endpoint if that is simpler and safer). Confirm before removing a class when the change could affect students with existing attempts; explain the consequence.
4. Show who will see the quiz and when ('Visible to 2 classes from 12 Nov 08:00 to 14 Nov 17:00', from the quiz availability). For a draft, warn that students cannot see it until it is published.
5. Remove the old per-quiz Assignments page after its route redirects here.

Tests: basic search/filter behavior if implemented, panel diffing, bulk save, removal confirmation, draft warning, tenant and ownership rules, mobile sheet.
```

### UX-8: Cleanup, accessibility and docs

```text
Goal: close out Phase 9a.

Do:
1. Delete dead routes and components: the old QuizEditor wizard, the old QuizAssignments page, the question list inside QuizDetail, and CSS that nothing uses.
2. Run axe on every new page (Quizzes, overview, settings, Questions, editor, import, Assignments) and fix findings. Complete the create, add-question, import and assign flows with the keyboard only. Check 360px width and 200% zoom.
3. Confirm every old URL, including the Django redirects, lands on a working page (extend the redirect-target test).
4. Update the tests, docs/REACT_ROUTE_OWNERSHIP.md and docs/REACT_API_CONTRACTS.md, and list every API change made during UX-2 to UX-7.
5. Run python manage.py test, npm run typecheck, npm run lint, npm test and npm run build.
```

## Phase 9: Exam sections and score export (after 9a)

Scores only. No grade bands, letter grades, result slips or candidate numbers: results are uploaded to another platform. Run Prompt 1, then Prompt 2.

### Prompt 1: Sections engine

```text
Goal: add exam sections to quizzes. Scores only. No grade bands.

Read: quiz_app/models.py (Quiz, Question, QuizAttempt.capture_configuration, QuizResponse, scoring and time-limit logic), quiz_app/question_types/, quiz_app/assessment_api_views.py, the student take, save and submit views in api_views.py, frontend StudentQuizTake.tsx, the quiz settings page (UX-3), the Questions page and question editor (UX-4, UX-5) and the question-types registry.

Do:
1. Additive migration: QuizSection (school, quiz, title, instructions, order, time_limit_minutes nullable, choose_n nullable), QuestionGroup (school, quiz, section nullable, title, stimulus_text, order), Question.section and Question.group FKs (nullable). Validate: choose_n is no more than the questions in the section; marks are equal in a choose_n section; groups belong to the same quiz and section. Quiz total_marks counts N x marks for choose_n sections.
2. Snapshot sections, groups and rules in capture_configuration. Quizzes without sections and old attempts behave exactly as today.
3. Server rules: if any section has a time limit, sections run in order, the attempt records each section start, answers for an expired or already-submitted section are rejected, and moving on locks the previous section. Otherwise navigation is free under the overall timer. Shuffle only within a section. For choose_n, reject answers beyond N with a clear error code.
4. API v1: section and group CRUD plus reorder and question assignment under /api/v1/teacher/quizzes/<id>/. The student take payload groups questions by section with instructions, stimulus and remaining time per section, and never leaks answers.
5. Student UI: section header and instructions, per-section timer, pinned stimulus, section navigation, an N-of-M counter that blocks extra answers, and a confirm before leaving a timed section.
6. Teacher UI: a section builder in the SectionsPanel slot on the Questions page (add, reorder, assign questions, set time and choose-N, add a stimulus).
7. Per-section score is derived from responses, not stored separately, so it cannot drift.

Tests: tenant isolation, expired section rejects answers, locked section, choose_n limit, old quizzes unchanged, snapshot immutable after edits, student payload has no correct answers.
```

### Prompt 2: Results and export

```text
Goal: show section breakdowns on individual result slips and let teachers export filtered, quiz-specific results to Excel or CSV. Spreadsheet exports contain overall quiz results only, with no section columns or section-based export.

Read: views/quiz_results_management.py (quiz_results_export_view, _best_attempts_per_quiz_student), teacher_results_api_view in api_views.py, frontend QuizResultsList.tsx, QuizResultDetail.tsx, StudentQuizResult.tsx.

Do:
1. Show per-section scores on individual teacher and student result slips/views. Do not add letter grades or grade bands for section quizzes. Section breakdowns belong on result slips only; do not include section scores or section columns in CSV or XLSX exports.
2. Add GET /api/v1/teacher/results/export/ with format=csv|xlsx, required quiz_id, optional class_id, academic_year_id and term_id filters, attempt=best|latest|all, include_pending=0|1, and include_percentage=0|1. Require a specific quiz selection; never export across all quizzes in one request. Teachers may export only their own quizzes and filter only by classes assigned to them; admins may export quizzes and filter by classes in their school. Build the class filter choices from these same role-scoped sets, and reject a submitted class_id outside the caller's scope. Enforce school scope for every filter and result.
3. The default attempt rule is best: for the selected quiz, export one highest-scoring eligible attempt per student. Break score ties by choosing the most recently submitted attempt. Keep latest and all as explicit alternatives. Show the selected quiz and active filters before download.
4. Spreadsheet columns: admission number, student name, class, subject, quiz title, total score, total marks, attempt number, status, submitted at, and percentage only when requested. Do not add section columns.
5. By default exclude attempts with ungraded essays and report how many were skipped (response header and UI warning). include_pending=1 includes them with status 'Pending grading'. The best-attempt rule selects among fully graded attempts; when pending is included, include pending attempts only for students without a fully graded attempt for that quiz.
6. Neutralise formula injection in both formats (prefix cells that start with =, +, -, @, tab or CR). CSV is UTF-8 with BOM. Stream large exports.
7. UI: add export controls to QuizResultsList: require the teacher to select one quiz, then allow filters for class, academic year, term, attempt rule (default Best), format, pending attempts and percentage. The class filter lists only classes assigned to the teacher; admins see classes in their school. Show the selected quiz, active filters and pending/skipped count. Include loading and error states; download through an authenticated fetch and blob so API errors display in the UI.
8. Retire the legacy /quizzes/results/export/ (redirect to the React results page).

Tests: tenant and teacher scope; quiz_id is required and cross-quiz export is refused; class filter choices and submitted class_id are limited to the teacher's assigned classes (admins are school-scoped); class/year/term filters; best selects one highest-scoring attempt per student and uses the latest submission for ties; latest/all behavior; pending exclusion and inclusion; no section columns in either format; formula injection; CSV BOM; XLSX opens with openpyxl.
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

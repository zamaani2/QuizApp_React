# React Frontend Migration Plan — QuizApp_Local

| Field | Value |
|---|---|
| Document status | **Authoritative architectural specification** |
| Version | 0.2 (pre-audit draft) |
| Last updated | 2026-11-06 |
| Owner | Project maintainer |
| Applies to | QuizApp_Local (Django 5 + PostgreSQL) |

> **How to read this document.** Sections marked **[FIXED]** are binding principles. Sections marked **[PROVISIONAL]** are the best current decision and must be confirmed or corrected by the repository audit. Any conflict between this plan and the actual repository is recorded in `docs/REACT_ARCHITECTURE_DECISIONS.md` and resolved here by a versioned edit. Nobody changes architecture silently.

---

## 1. Purpose and Scope [FIXED]

QuizApp_Local is a working Django application. This plan introduces **React + TypeScript + Vite** as an **additional** frontend, adopted page by page, while the existing Django-rendered frontend remains fully operational.

**Goals**
- Improve interactivity where it matters (quiz taking, dashboards, data-heavy admin screens).
- Introduce a typed, testable frontend without a risky rewrite.
- Keep the system deployable at every step.

**Non-goals**
- Replacing Django as the backend, auth provider, or source of business logic.
- Migrating every page. Pages with no interactivity benefit stay **RETAINED AS DJANGO**.
- Changing the database schema as a side effect of frontend work.
- A big-bang cutover.

---

## 2. Governing Principles [FIXED]

1. **Django is the system of record.** Business rules, scoring, permissions, and data integrity live on the server.
2. **Strangler migration.** One page or feature at a time. Each migrated page has a working Django fallback until it is verified in production.
3. **Server-side authorization is the only authorization.** React route guards are a UX convenience, never a security control.
4. **No silent changes.** Existing URLs, templates, models, auth, and Docker config change only through an explicit, documented task.
5. **Evidence over assumption.** Statements about the codebase must cite file paths and carry a tag: `VERIFIED`, `INFERRED`, or `NOT FOUND`.
6. **Reversible by default.** Every migration step has a defined rollback (typically: switch the link or route back to the Django page).
7. **Do not migrate what is risky until the foundations are proven.** Quiz attempt and submission flows migrate last.
8. **Low-bandwidth realism.** Users may be on slow connections and low-end phones. Performance is a requirement, not a polish item.

---

## 3. System Context

**Existing stack** (to be confirmed by audit)
- Django 5, PostgreSQL, Django templates, Bootstrap, custom CSS and JavaScript
- Roles: Student, Teacher, Admin, Superadmin, with school-level scoping
- Docker/Podman, GitHub Actions, deployed on Railway

**Target stack**
- React + TypeScript (strict) + Vite, in a `frontend/` directory
- Same Django deployment, same database, same session authentication

---

## 4. Target Architecture

### 4.1 Hosting model — same origin [PROVISIONAL]
The React build is served by the same Django deployment (static files via the existing static-file mechanism, e.g. WhiteNoise if that is what the repo uses). **No separate frontend host, no CORS.**

*Rationale:* same origin keeps session cookies and CSRF simple, matches the single Railway service, and avoids a second deployment.

*Audit must confirm:* current static-file strategy, any CDN/object-storage usage for static files, and whether it can serve Vite's hashed assets.

### 4.2 Route namespace — dedicated prefix [PROVISIONAL]
All React-owned pages live under a dedicated prefix (working name: `/app/`). Django serves the React shell for `/app/*` through one catch-all view placed **after** all existing URL patterns.

- Existing Django URLs are never repurposed during the initial phases.
- A page moves from Django to React by (a) building the React page under `/app/...` and (b) pointing navigation links to it. The old Django URL stays alive until retirement is explicitly approved.
- Bare-URL takeover (React serving a path currently owned by Django) is allowed only after the page has been stable in production and is recorded in `docs/REACT_ROUTE_OWNERSHIP.md`.

*Audit must confirm:* the working prefix and `/api/` namespace do not collide with any existing pattern.

### 4.3 Authentication — Django sessions [FIXED]
- React uses the existing Django session cookie. **No JWT, no parallel auth system.**
- Login, logout, password reset, and password change remain Django-rendered unless a later, separate decision says otherwise.
- The React shell loads current-user context (id, role, school, permissions) from a single `GET /api/v1/me/` endpoint.
- Unauthenticated API calls return `401`. Forbidden calls return `403`. React redirects to the Django login page, preserving `next`.

### 4.4 CSRF [FIXED]
- Django's CSRF protection stays enabled for all state-changing API requests.
- The React shell guarantees a CSRF cookie is set (e.g. via `ensure_csrf_cookie` on the shell view or `/api/v1/me/`).
- A single API client module reads the token and sends `X-CSRFToken` on every `POST/PUT/PATCH/DELETE`, with `credentials: "same-origin"`.
- `CSRF_TRUSTED_ORIGINS`, cookie flags, and proxy/HTTPS settings are reviewed against Railway behaviour by the audit.

### 4.5 API layer [PROVISIONAL]
- Namespace: `/api/v1/`, versioned from day one.
- Framework (Django REST Framework vs plain `JsonResponse` views): **decided after audit.** If an API framework already exists, extend it. Do not introduce a second one.
- Every endpoint reuses existing service-layer or model logic. **Business rules are never reimplemented in an API view or in React.**
- Every endpoint enforces the same role and school-level scoping as its Django view equivalent. Querysets are filtered server-side; object IDs from the client are never trusted.
- Contracts are documented in `docs/REACT_API_CONTRACTS.md` **before** the React page that uses them is built.
- Consistent error shape (`code`, `message`, optional `fields`) and pagination convention, defined once.

### 4.6 Frontend structure [PROVISIONAL]
```
frontend/
  src/
    api/            # single API client, CSRF handling, typed endpoints
    auth/           # current-user context, route guards (UX only)
    components/     # shared UI components
    features/       # one folder per feature (admin/, teacher/, student/)
    routes/
    types/
  vite.config.ts
  tsconfig.json     # "strict": true
```
- TypeScript strict mode, no implicit `any`.
- Server state through one data-fetching approach (to be chosen and recorded as an ADR).
- Code-split per role area so students never download admin code.

### 4.7 Styling and CSS isolation [PROVISIONAL]
- React pages mount inside an isolated root element.
- **No global CSS resets** and no second CSS framework alongside Bootstrap unless an ADR approves it.
- Preferred approach: reuse the Bootstrap version already loaded by the Django base layout for visual consistency, and use scoped styles (CSS Modules or a prefixed convention) for custom React styling.
- Shared navigation/layout: the audit determines whether the React shell reuses the Django base layout or replicates it. The visual result must be consistent across both frontends.

### 4.8 Build and deployment [PROVISIONAL]
- Production: multi-stage Docker build. A Node stage runs `vite build`; output is copied into the Django static pipeline; Django serves it.
- Development: Vite dev server with proxy to Django for `/api/` and session cookies.
- Vite `base` and Django static URL configuration must agree; asset manifest handling (manual vs a library) is decided by ADR.
- CI (GitHub Actions) gains a frontend lint, type-check, test, and build step, only when the foundation phase is approved.
- The existing Docker build must keep working with the frontend absent or disabled.

### 4.9 Performance budget [PROVISIONAL]
- Initial JavaScript for the first React page: target under **200 KB gzipped**; revisit after first measurements.
- No heavy UI library without an ADR.
- Quiz-taking screens must remain usable on slow connections and low-end phones.

---

## 5. Migration Eligibility Rules [FIXED]

A page is a **React candidate** only if at least one is true:
- It has substantial client-side state or interaction (filters, live updates, multi-step forms, timers).
- It is data-dense and benefits from client-side sorting, searching, or pagination.
- It is a reusable component that several pages need.

A page is **RETAINED AS DJANGO** if:
- It is mostly static or a simple form/list that Django handles well.
- Migration risk outweighs the benefit.
- It involves authentication or security-sensitive flows with no user-visible gain from React.

Retained pages are a **valid end state**, not unfinished work.

---

## 6. Phased Roadmap

Order is deliberate. Do not start a phase until the previous phase's exit criteria are met.

### Phase 0 — Audit and Governance (documentation only)
Audit the repository; create and populate the documents in Section 9.
**Exit:** all five documents exist, conflicts with this plan are recorded, no application files changed.

### Phase 1 — Foundation
- Scaffold `frontend/` (Vite, React, TypeScript strict, lint, test runner).
- API client with CSRF handling; `/api/v1/me/`; the React shell view and `/app/` catch-all.
- Docker multi-stage build and static serving, verified locally and on a staging deploy.
- CI additions.
**Exit:** an empty authenticated React page loads in production-like conditions; existing Django pages and tests are unaffected.

### Phase 2 — Shared UI
- App shell, navigation parity with Django layout, error and loading states, table, form, and modal primitives.
- CSS isolation verified against Bootstrap pages.
**Exit:** shared components documented and tested; visual consistency confirmed.

### Phase 3 — Admin and Superadmin
Lowest student-facing risk, highest data-density benefit. Start with read-only views, then simple writes.
**Exit:** each migrated page has tests, contracts documented, Django fallback intact.

### Phase 4 — Teacher
Dashboards, results and analytics views first; quiz authoring only after the above is stable.
**Exit:** as Phase 3.

### Phase 5 — Student
Read-only pages (results, history, dashboards) first. **Quiz attempt and submission last** and only with the safeguards in Section 8.
**Exit:** as Phase 3, plus the quiz-flow acceptance criteria in Section 8.

### Phase 6 — Integration
Navigation cross-links, role-based entry points, route takeover decisions, performance review.

### Phase 7 — Optional Cleanup
Retire Django templates **only** where React has been stable in production and rollback is no longer needed. This phase is optional and each retirement needs explicit approval.

---

## 7. Authorization and Data-Scoping Rules [FIXED]

- Role and school-level checks are enforced in the API for every request, mirroring the existing Django enforcement.
- API tests must include cross-role and cross-school negative cases (a Teacher cannot read another school's data; a Student cannot call a Teacher endpoint).
- No endpoint returns data the corresponding Django page would not show to that user.
- Superadmin capabilities are never exposed through endpoints that lower-privilege roles can reach.
- Sensitive student data (names, scores, identifiers) is returned only to roles that need it, and only the fields needed.

---

## 8. Quiz Attempt and Submission — High-Risk Rules [FIXED]

This is the highest-risk area. Before any React quiz-taking page ships:

1. **The server is authoritative** for the timer, attempt state, scoring, and correct answers. Correct answers are never sent to the client before submission, unless the existing system already does so and it is documented as a known issue.
2. **Submission is idempotent.** Double-clicks, retries, and reconnects must not create duplicate attempts or scores.
3. **Autosave and connection loss** behaviour is defined and tested (what is preserved, what the student sees).
4. **Deadline enforcement** happens server-side regardless of client clock.
5. **Parity testing:** the React flow and the Django flow must produce identical scoring results on the same inputs.
6. **Feature flag / link-level switch** allows instant rollback to the Django quiz page per school or globally.
7. **Pilot first:** a small group, ideally outside an exam period, before general rollout.

---

## 9. Documentation Structure [FIXED]

| File | Role |
|---|---|
| `REACT_FRONTEND_MIGRATION_PLAN.md` | This file. Authoritative architecture and rules. |
| `docs/REACT_MIGRATION_STATUS.md` | Feature inventory per role and shared functionality, with migration status. |
| `docs/REACT_ARCHITECTURE_DECISIONS.md` | Decision log (ADRs), including audit conflicts with this plan. |
| `docs/REACT_ROUTE_OWNERSHIP.md` | Route register: who renders each URL now and in future. |
| `docs/REACT_API_CONTRACTS.md` | API endpoint specifications, written before implementation. |

**Precedence:** if documents disagree, this plan wins until it is edited. Edits to this plan record a version bump and a changelog line (Section 13).

### 9.1 Status vocabulary
`NOT STARTED` · `PLANNED` · `IN PROGRESS` · `IN REVIEW` · `DONE` · `RETAINED AS DJANGO` · `BLOCKED`

### 9.2 Risk scale
- **Low** — read-only, low traffic, no scoring or auth impact.
- **Medium** — writes data or is high traffic, but no scoring, auth, or cross-role exposure.
- **High** — quiz attempt/submission, scoring, authentication, authorization-sensitive, or exam-period critical.

### 9.3 Route register columns
Existing URL · Django view · Template · User role · Current owner · Proposed owner · API dependencies · Migration risk · Status

---

## 10. Engineering Standards [FIXED]

- TypeScript `strict`; lint and type-check pass before merge.
- Every React page ships with tests for its main states (loading, error, empty, success) and permission-denied behaviour.
- Every API endpoint ships with tests, including negative authorization cases.
- Existing Django tests must continue to pass unchanged at every step. A failing existing test blocks the migration step.
- Dependencies are added deliberately; each non-trivial library needs an ADR entry.
- No secrets in the frontend bundle. No environment-specific URLs hard-coded.
- Accessibility basics: keyboard navigation, labels, focus management, sufficient contrast.

---

## 11. Rules for AI-Assisted Implementation (Cursor and similar) [FIXED]

1. Read this plan completely before any task.
2. Do only the task requested. No opportunistic refactors.
3. Never modify existing Django views, models, URLs, templates, CSS, JavaScript, authentication, Docker, or schema unless the task explicitly authorizes that specific change.
4. Never install dependencies unless the task explicitly authorizes it.
5. Cite file paths for findings; tag `VERIFIED` / `INFERRED` / `NOT FOUND`.
6. Do not claim something is implemented if it was only documented or recommended.
7. When the repository conflicts with this plan, document the conflict and recommend a correction. Do not decide silently.
8. Never run tests against a production or Railway database. Use a local test database only.
9. End every task with a list of every file created, modified, or deleted, so the changes are visible.

---

## 12. Open Questions (to be resolved by the audit)

1. Does an API framework already exist (DRF or other)? If so, how are endpoints authenticated?
2. How are static files served in production (WhiteNoise, object storage, CDN)? Any conflict with hashed Vite assets?
3. Do `/app/` and `/api/v1/` collide with any existing URL pattern?
4. How is school-level scoping enforced (mixins, middleware, queryset managers, per-view checks)? Is it consistent?
5. Which Bootstrap version and which global CSS or JavaScript could interfere with a React root?
6. Is the timer, attempt state, and scoring fully server-side today?
7. What frontend or JavaScript test infrastructure exists, if any?
8. Does the Docker build or CI pipeline make assumptions that a Node build stage would break?
9. Which existing pages share templates or layout fragments that React would need to match?

---

## 13. Change Control and Changelog

Changes to this document require: a stated reason, the affected sections, and a version bump.

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-06 | Initial pre-audit draft. Provisional decisions to be confirmed by Phase 0 audit. |
| 0.2 | 2026-11-06 | Removed branch, commit, and push rules (Section 11). Development is local; version-control handling is left to the maintainer. |

# React Frontend Migration Status

| Field | Value |
|---|---|
| Document status | Current implementation summary |
| Last updated | 2026-11-11 |
| Route register | [REACT_ROUTE_OWNERSHIP.md](./REACT_ROUTE_OWNERSHIP.md) |
| API contracts | [REACT_API_CONTRACTS.md](./REACT_API_CONTRACTS.md) |
| Django template inventory | [LEGACY_DJANGO_TEMPLATE_CATALOG.md](./LEGACY_DJANGO_TEMPLATE_CATALOG.md) |

## Status

| Area | Status | Notes |
|---|---|---|
| React/Vite workspace | Complete | React owns the admin, teacher, student, and superadmin application screens under `/app/*`. |
| React authentication | Complete | React owns sign-in, session presentation, and password recovery under `/auth-app/*`. Django validates credentials and maintains sessions. |
| Django API/backend | Active | Django owns tenant checks, business rules, persistence, authentication, and `/api/v1/*` JSON endpoints. |
| Legacy Django page templates | Retired | Feature templates and legacy template-render branches have been removed. React-owned page GETs redirect to React; `?classic=1` does not restore Django UI. Legacy POST handlers remain POST-only for compatibility; React uses `/api/v1/*`. |
| React shell templates | Required | `react_app.html` and `auth_core_app.html` mount the production React bundles. |

## Development and deployment

During local Vite development, open
`http://localhost:5173/app/student/`. Vite serves the UI and proxies API and
authentication requests to Django at `http://127.0.0.1:8000`. The Django port
is the backend in this setup, not the user-facing development UI.

In production, Django serves the React shell and built static assets at
`/app/*` and `/auth-app/*`, in addition to the APIs.

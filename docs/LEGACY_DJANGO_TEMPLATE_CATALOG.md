# Django Template Inventory

The React/Vite frontend owns all user-facing application pages. Django remains
the authentication, session, API, and data backend; it also serves the React
shell in production.

## Remaining templates

| Template | Role |
|---|---|
| `auth_core_app.html` | Mounts the React authentication application at `/auth-app/`. |
| `react_app.html` | Mounts the React workspace at `/app/`. |

These are mount shells, not Django feature pages. The Vite development server
serves the same React UI at `http://localhost:5173`; its configured proxy sends
API and authentication requests to Django at `http://127.0.0.1:8000`.

## Retired Django UI

All Django-rendered login, dashboard, feature, and form templates have been
removed. Their GET routes redirect to the corresponding React route. Legacy
mutation handlers remain available where needed, while the React client uses
the `/api/v1/` endpoints for migrated features. Password-reset pages are also
React-owned; Django validates reset requests and one-time tokens and sends
reset email without depending on Django UI or email template files.

Do not restore a Django page template as a workaround for a route or test
failure. Instead, confirm the React screen and its API behavior, redirect any
remaining legacy page GET route to React, and keep backend behavior covered by
API and regression tests.

# Run QuizApp locally with Docker Desktop or Podman Desktop

The Compose setup builds the application from this checkout. It builds the
React frontend, packages it with Django, starts PostgreSQL, and stores database
and uploaded media in named volumes.

## Prepare the environment

Copy `.env.example` to `.env`, then set a unique Django `SECRET_KEY` and
`DB_PASSWORD`. Keep `.env` private. Compose reads it for local settings; the
Docker build excludes it from the image.

The Compose configuration runs Django with `DEBUG=False`. It defaults cookie
security off for local HTTP access. Keep this setup on a trusted local network;
for HTTPS hosting, set `SESSION_COOKIE_SECURE=True` and
`CSRF_COOKIE_SECURE=True` and configure HTTPS origins.

For a new database volume, Compose initializes PostgreSQL with `DB_PASSWORD`.
For an existing volume, the password must match the database user's current
password. Changing `.env` alone does not rotate a password in an existing
volume.

## Start with Docker Desktop

Open PowerShell in the project directory and run:

```powershell
docker compose up -d --build
docker compose logs -f web
```

Open <http://localhost:8000>. If port 8000 is occupied, set `APP_PORT` in
`.env` (for example, `APP_PORT=18080`) and use that port in the URL.

Create the first administrator account:

```powershell
docker compose exec web python manage.py createsuperuser
```

This creates a Django staff superuser for `/admin/`. It is separate from the
application's school `superadmin` role, which is used by the QuizApp workspace.

With Podman, use `podman compose exec web python manage.py createsuperuser`.

## Start with Podman Desktop

Start the Podman machine in Podman Desktop, and make sure a Compose provider
such as `podman-compose` or Docker Compose is installed. Then run:

```powershell
podman compose up -d --build
podman compose logs -f web
```

Podman's Compose command delegates to an installed provider, so supported
options depend on that provider. On Windows and macOS, Podman containers run in
a VM; confirm the machine's networking forwards published ports to the host.

## Allow access from other devices on your LAN

Use a stable LAN IP for the host, such as `192.168.1.50`, then set these values
in `.env` (replace the example host and port):

```dotenv
APP_PORT=8000
ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.50,quiz-server.local
CSRF_TRUSTED_ORIGINS=http://localhost:8000,http://192.168.1.50:8000,http://quiz-server.local:8000
SITE_URL=http://192.168.1.50:8000
SESSION_COOKIE_SECURE=False
CSRF_COOKIE_SECURE=False
```

Restart after changing `.env`:

```powershell
docker compose up -d
```

or:

```powershell
podman compose up -d
```

On Windows, allow inbound TCP traffic on the chosen port in Windows Defender
Firewall. Other devices can then open `http://192.168.1.50:8000`. For a
hostname, configure that name in your LAN DNS or each client device's hosts
file. The hostname must appear in both `ALLOWED_HOSTS` and
`CSRF_TRUSTED_ORIGINS`.

If you change `APP_PORT`, update the port in every `CSRF_TRUSTED_ORIGINS` URL
and in the browser address. `SITE_URL` should use the same host and port so
email links point back to this server.

## Email delivery

Account creation and password recovery need working SMTP settings. Configure
`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and the
appropriate TLS setting in `.env`. If delivery fails, users can request a new
password setup link from the login page.

## Stop and update

Stop containers without removing application data:

```powershell
docker compose down
```

Use `podman compose down` with Podman. Database and uploaded media persist in
named volumes. Do not use `down -v` unless you intend to permanently remove
both volumes.

To rebuild after changing source code, run `docker compose up -d --build` or
`podman compose up -d --build`. The image build uses `npm ci` and requires the
frontend lockfile to match `package.json`.

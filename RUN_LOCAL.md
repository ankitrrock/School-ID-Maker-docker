# Run School ID Maker

The current application is `server/` plus `public/`. Docker Compose runs PostgreSQL
(`db`) and the Express application (`app`). The React/TypeScript workspaces under
`artifacts/` and `lib/` are legacy code and are not part of this deployment.

## Docker (recommended)

Requires Docker Engine/Desktop with Compose v2 and Python 3.

```bash
python run.py
```

The launcher generates a private `.env` containing a random JWT secret when no
`.env` exists, starts the database, and waits for the application health check.
Open http://localhost:3000. Health: http://localhost:3000/api/healthz.

For direct Compose use, generate `.env` first or export a random `JWT_SECRET` of
at least 32 characters, then run `docker compose up --build`.

```bash
python run.py status
python run.py logs
python run.py down
python run.py down -v  # deletes database AND uploaded image volumes
```

## Local Node

Requires Node 22+ and PostgreSQL 16. npm is the package manager for the deployed
application; `package-lock.json` is used by Docker.

```bash
npm ci
cp .env.example .env
# Edit DATABASE_URL and replace JWT_SECRET with a random secret.
# Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm start
```

The start command loads `.env`. Leave `NODE_ENV=development` for local HTTP.
Uploaded images are stored under `data/uploads/` unless Supabase is configured.
Do not use real student data for local testing.

## Storage and production

Set both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to use Supabase, and create
the private bucket with `supabase/storage.sql`. Otherwise, local uploads require
a persistent volume. Render's free filesystem is ephemeral: configure Supabase
there. Never place the service-role key in frontend code.

Images are normalized to PNG and served through authenticated app URLs. Existing
Supabase signed URLs for this project's bucket are resolved to their underlying
objects, even after the old signature expires. External HTTPS image links remain
supported in previews, but PDF export embeds only images uploaded to this app.

Use HTTPS and `NODE_ENV=production` for secure cookies. Set `TRUST_PROXY_HOPS` only
to the number of reverse proxies you control (Render configuration uses one).
The login limiter is per process; multiple app replicas need a shared limiter
store. Back up PostgreSQL and local upload volumes, if used.

To bootstrap an admin, first register an account you control, set `ADMIN_EMAIL`
to its email, and restart the app. Do this before opening registration publicly.
Roles are checked against the database on every authenticated request.

## Tests

```bash
npm test
# Use a dedicated disposable PostgreSQL database; fixtures use an isolated schema.
TEST_DATABASE_URL=postgres://postgres@localhost:55432/school_id_test npm run test:integration
```

The pnpm workspace and lockfile are retained for legacy development. Changes to
root dependencies should update both lockfiles with `npm install` and
`pnpm install --lockfile-only`. Legacy workspace tests do not cover this app.

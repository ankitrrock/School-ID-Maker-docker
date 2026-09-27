# Run School-ID-Maker with Docker

This project runs entirely through Docker Compose: Postgres, the API server,
and the web frontend, each built and started in order.

## Prerequisites

Install Docker Desktop (or Docker Engine + Compose v2) and make sure it is
running:

```bash
docker --version
docker compose version
```

## Start everything

From the repo root:

```bash
python run.py
```

This builds and starts, in order:

1. **Database** (Postgres) — waits until it reports healthy.
2. **API server** — builds the image, then waits until `/api/healthz`
   responds.
3. **Web frontend** — builds the image (nginx serving the Vite build,
   proxying `/api` to the backend so there's no CORS setup needed).

A `.env` file with a randomly generated `JWT_SECRET` is created automatically
the first time you run this.

Once it finishes:

- Frontend: http://localhost:8080
- API: http://localhost:3001/api/healthz

## Other commands

```bash
python run.py status   # show container status
python run.py logs     # tail logs from all services
python run.py down     # stop everything
python run.py down -v  # stop everything and delete the database volume
```

## Project layout

```
docker-compose.yml            # db -> api -> web, wired with healthchecks
run.py                        # starts everything in order
artifacts/api-server/         # Express + Postgres (Drizzle) backend
artifacts/mockup-sandbox/     # React (Vite) web frontend
lib/db/                       # Drizzle schema shared by the backend
lib/api-zod/                  # Zod types generated from the API spec
```

## Notes

- Never commit the generated `.env` file, database passwords, or JWT
  secrets.
- For production SMTP-based password reset emails, set `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `APP_URL` as
  environment variables on the `api` service in `docker-compose.yml`.
  Without SMTP configured, the API logs the reset link instead (development
  only).

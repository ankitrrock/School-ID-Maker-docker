# Configuration and deployment

## Configuration reference

Use `.env.example` as the starting point. Keep real values outside Git. `npm start` loads `.env`; Docker Compose reads supported variables into the container.

| Variable                                    | Purpose / default                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | PostgreSQL connection; Compose supplies its internal database address                     |
| `JWT_SECRET`                                | At least 32 random characters; Compose generates and persists one when empty              |
| `ADMIN_EMAIL`                               | Existing account to promote on startup; create the account first                          |
| `NODE_ENV`                                  | `development` for local HTTP; `production` enables secure cookies and requires HTTPS      |
| `PORT`                                      | HTTP listener; Compose publishes port 3000                                                |
| `TRUST_PROXY_HOPS`                          | Number of trusted reverse proxies, default 0; configure only for your deployment topology |
| `PRINT_SHOP_NAME`                           | Public storefront name, default Print Studio                                              |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Set both to enable private Supabase storage                                               |
| `SUPABASE_BUCKET`                           | Private bucket, default `id-card-assets`                                                  |
| `UPLOAD_DIR`                                | Local Node upload path; default `data/uploads`                                            |
| `FREE_STUDENT_LIMIT`, `FREE_CARD_LIMIT`     | Default 50 each                                                                           |
| `PRO_STUDENT_LIMIT`, `PRO_CARD_LIMIT`       | Default 5,000 each                                                                        |

The Razorpay entries in `.env.example` are reserved and unused. They do not enable online payments. Compose intentionally defines its database URL and app port; edit an environment-specific Compose override for different networking. `TRUST_PROXY_HOPS` and `UPLOAD_DIR` are direct Node/hosting settings and need an explicit Compose environment override if used there.

## Continuous integration and delivery

[The workflow](../.github/workflows/ci.yml) runs on pull requests, pushes to `main` or `coderabbit/**`, and manual dispatch:

1. Node 22 and 24 install the npm lockfile and check Prettier formatting.
2. Unit/security and integration tests run against a disposable PostgreSQL 16 service.
3. A production dependency audit fails for high/critical advisories; Compose configuration is checked.
4. Python checks validate Black formatting and the launcher CLI.
5. Only after all checks succeed, Docker builds the production image.
6. Successful non-PR runs on `main` publish to `ghcr.io/ankitrrock/school-id-maker-docker`, tagged `latest` and `sha-<full-commit>`.

Pull requests and task branches build without publishing. Action versions are pinned to commit hashes; Dependabot proposes npm, Python and action updates. The workflow uses GitHub's provided `GITHUB_TOKEN` with package-write permission only in the image job. Enable Actions and allow package publishing in repository/organization settings. A pre-existing GHCR package may also need repository access granted in its settings. Package visibility is controlled in GHCR settings.

This pipeline delivers an image; it does not automatically restart a production host. Pin a tested SHA tag for deployment and rollback. No production SSH keys or hosting credentials are required by this workflow.

## Deploy with Docker

The included Compose file is a local starting point. For a production host, place the app behind HTTPS, use private database networking and operator-managed database credentials, set `NODE_ENV=production`, and configure trusted proxy hops explicitly. Preserve the database, upload and signing-secret volumes across upgrades.

To use a published image with the existing Compose stack, create an untracked override outside the repository:

```yaml
services:
  app:
    image: ghcr.io/ankitrrock/school-id-maker-docker:sha-REPLACE_WITH_FULL_COMMIT
```

Use it with `docker compose -f docker-compose.yml -f /path/to/override.yml pull app`, then `docker compose -f docker-compose.yml -f /path/to/override.yml up -d --no-build --wait`. Authenticate to GHCR first if the package is private. Production-specific environment, proxy and database settings belong in your deployment configuration. Back up before upgrades; an older image may not be compatible with a changed database schema.

## Render

[`render.yaml`](../render.yaml) describes the Docker web service. Configure PostgreSQL, a persistent `JWT_SECRET`, administrator email and Supabase storage. Run [`supabase/storage.sql`](../supabase/storage.sql) to prepare the private bucket. Local files on an ephemeral host are not persistent. The blueprint does not create a database or Supabase project. Render deployment remains controlled by your Render service settings; it is separate from GHCR publishing.

## Operations

- Health endpoint: `/api/healthz`.
- Logs: `docker compose logs -f app`.
- Back up PostgreSQL, local uploads (if used), and the JWT signing secret together. Test restoring to a separate environment.
- Rotate the signing secret to revoke existing sessions. Do not remove the secret volume casually.
- Run one app instance unless you configure a shared rate-limit store; the current limiter is per process.
- Account verification and password recovery require future implementation before a public production launch.

## Troubleshooting

**Upload permission denied:** use the current Compose file. Its `upload-permissions` service runs before the app and sets upload/secret volume ownership to UID 1000. For custom bind mounts, ensure the same UID can write. Avoid deleting data volumes to fix permissions.

**Login does not persist:** secure cookies require HTTPS when `NODE_ENV=production`. For local HTTP use `development`.

**Formatting check fails:** run `npm ci && npm run format`, review the diff and commit it. For Python use the virtual environment and `python -m black run.py`.

**Wrong printed size:** match paper dimensions in the app and printer driver, use 100%/actual size with headers disabled, and choose one printer copy because the document contains the selected batch pages. Verify on actual equipment before accepting a job as printed.

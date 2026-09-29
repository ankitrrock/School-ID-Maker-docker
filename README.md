# School ID Maker & Print Studio

Create branded ID cards, accept printing enquiries, and manage customer print requests from one responsive application.

**Node.js · Express · PostgreSQL · Docker · Installable web app**

## Start in one command

```bash
docker compose up --build
```

Requires Docker with Compose v2. Open **http://localhost:3000**. PostgreSQL, upload permissions and a persistent JWT signing secret are prepared automatically. Signup/login issues the session token; no manual token creation is needed.

## What you can do

| Workspace                   | Features                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ID Card Studio `/`          | Five templates, live customization, separate logo/background uploads, student photos, QR/barcodes, XLSX import and PDF export |
| Printing shop `/printing`   | Searchable catalog for flex boards, wedding cards, mugs, T-shirts and ID cards; public quote enquiries                        |
| Customer requests `/orders` | Artwork uploads, saved ID snapshots, dimensions, quantities and status tracking                                               |
| Administrator `/admin`      | Users, organizations, students, payments, enquiries, activity and print preparation                                           |
| Mobile                      | Responsive pages and an installable PWA with an offline fallback                                                              |

Admins choose dimensions and paper before opening the browser print dialog or downloading an exact-size PDF. The printer must be installed on the admin's computer. Printing is confirmed manually after checking the output.

## Documentation

- [Getting started](docs/getting-started.md) — Docker, local Node, persistent storage and troubleshooting.
- [User and administrator guide](docs/user-guide.md) — cards, plans, uploads, customer requests and printing.
- [Architecture](docs/architecture.md) — source map, data flow and application boundaries.
- [Configuration and deployment](docs/deployment.md) — environment variables, CI/CD, image publishing and backups.
- [Contributing](CONTRIBUTING.md) — VS Code format-on-save, development commands and verification.

## Development quick start

```bash
npm ci
npm run format
npm run format:check
npm test
```

Open the repository root in VS Code and install its recommended Prettier extension. Saving JavaScript, HTML, CSS, JSON, Markdown or YAML then applies the shared format. Python contributors can also use Black; see [Contributing](CONTRIBUTING.md).

## Current boundaries

Pro payments require manual approval. Email verification/password recovery and native Android APK delivery are not implemented. The Android experience is an installable web app served over HTTPS. Browser printing uses the operating system's print dialog; physical output and printer-specific behavior must be verified on the target device.

## Repository layout

```text
server/       Express routes, PostgreSQL schema, uploads and PDF rendering
public/       Browser pages, shared design code and PWA assets
test/         Unit, security and PostgreSQL integration tests
docs/         Project guides
supabase/     Optional private storage bucket setup
.github/      CI and container publishing workflow
.vscode/      Shared editor settings and extension recommendations
```

The retired React/TypeScript workspaces and pnpm configuration were removed. Their history remains in Git. The deployed application uses npm and `package-lock.json`.

# Contributing

## Prepare your workspace

Use Node.js 22+ (the `.nvmrc` selects 22) and npm. Run `npm ci` at the repository root. Follow [local setup](docs/getting-started.md) to configure PostgreSQL and `.env` when running the app. Never commit `.env`, signing secrets, student data or uploaded artwork.

## VS Code: format on save

1. Open this repository folder in VS Code.
2. Install the workspace's recommended **Prettier - Code formatter** extension when prompted (or search Extensions for `@recommended`).
3. Run `npm ci` so the extension uses the exact project version of Prettier.
4. Edit a supported file and save. `.vscode/settings.json` enables format-on-save; `.prettierrc.json` defines the shared style.

JavaScript uses two spaces, single quotes, semicolons and a 100-column print width. Prettier also handles HTML, CSS, JSON, web manifests, Markdown and YAML. `.editorconfig` and `.gitattributes` keep whitespace and line endings consistent. Formatters do not run merely because someone clones the repository: the editor extension must be installed.

For the optional Python launcher, install the Python and Black Formatter recommendations and prepare Black:

```bash
python -m venv .venv
# Linux/macOS:
.venv/bin/python -m pip install -r requirements-dev.txt
# Windows:
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

Choose `.venv` with **Python: Select Interpreter** in VS Code. Black uses the pinned version from that environment and the project's `pyproject.toml`. You can run `.venv/bin/python -m black run.py` manually (use `.venv\Scripts\python` on Windows). Python tooling is optional unless editing `run.py`.

## Before opening a pull request

```bash
npm run format
npm run format:check
npm test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/school_id_test npm run test:integration
npm audit --omit=dev --audit-level=high
```

Use a dedicated disposable PostgreSQL 16 database for integration tests. Tests create and remove an isolated schema, exercise quota/tenant boundaries and use synthetic data. They require the database owner or equivalent schema permissions. Missing `TEST_DATABASE_URL` fails the command instead of silently skipping tests.

If editing Python, also run `python -m black --check run.py` using the prepared virtual environment. Validate Docker changes with `docker compose up --build -d --wait` and check `/api/healthz`. Review the diff before committing; do not commit formatting changes mixed with unrelated feature work.

## Working on features

- Keep backend code in `server/` and browser code in `public/`; there is no frontend compilation step.
- Shared card and print configuration modules serve both preview and PDF rendering. Keep these outputs consistent.
- Enforce authentication, role and organization ownership in backend routes. Preserve transactional quota checks and imports.
- Add meaningful tests for changed behavior and update the matching guide.
- Use npm for dependency updates and commit `package-lock.json` with `package.json`.
- Keep uploaded files, local databases, secrets, logs and generated reports out of Git.

CI checks formatting, Python formatting, unit/security tests, PostgreSQL integration, production dependency audit and the Docker build. Configure branch protection to require successful checks before merging. See [deployment](docs/deployment.md) for container publishing.

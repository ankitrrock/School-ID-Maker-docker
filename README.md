# School ID Maker — Sellable Edition

A multi-tenant ID-card platform for **schools, colleges and individual users**.

## Main flow

1. User signs up / logs in.
2. First login opens Organization Setup.
3. Choose School, College or Individual.
4. Enter organization details and upload an organization image.
5. The image is used as the ID-card background.
6. Default background is white.
7. User can choose background and text colors.
8. Create classes and sections.
9. Add students.
10. Select a student and generate a live ID-card preview.
11. Print/save the card from the browser.

## Run

```bash
docker compose up --build
```

Requires Docker Compose v2. The app automatically generates its JWT signing
secret and saves it in a persistent Docker volume. No `.env` is needed. Open http://localhost:3000.

For local Node setup, storage, production configuration, and tests, see
[RUN_LOCAL.md](RUN_LOCAL.md).

## Current application

- `server/`: Express, PostgreSQL, authentication, usage limits, uploads and PDF export.
- `public/`: browser UI, organization setup and card previews.
- `artifacts/` and `lib/`: retained legacy React/TypeScript workspaces.

## Product behavior

Free and Pro limits are enforced for manual entry, XLSX import, and PDF generation.
Imports are atomic: invalid or duplicate rows roll back the entire import. Browser
print buttons open generated PDFs, and successful generation consumes card quota.
Cards already downloaded can be printed again without contacting the server.
Quotas are cumulative for generated cards and count currently stored students.

Exports accept up to 100 cards per request. Cards are 54 × 86 mm on A4 pages;
print at 100% scale. PDF output includes uploaded images, student details, QR and
Code 128 codes, colors, and the selected template. External HTTPS image links
appear in previews; upload the image to include it in PDF output. Excel imports
accept `.xlsx` files (not the legacy `.xls` format).

Before a public launch, configure HTTPS, a strong JWT secret, persistent storage,
backups, and transactional email for account verification and password recovery.
Pro activation remains manual/COD; online billing is not enabled.

# School ID Maker — Sellable Edition

A multi-tenant ID-card platform for **schools, colleges and individual users**.

## Main flow

1. User signs up / logs in.
2. First login opens Organization Setup.
3. Choose School, College or Individual.
4. Enter organization details and upload a logo and a separate ID-card background.
5. The logo appears in the header; the background fills the card with a faded image.
6. Default background is white.
7. User can choose background and text colors.
8. Create classes and sections.
9. Add students.
10. Select a student and generate a live ID-card preview.
11. Open **Customize ID card** to choose Classic, Modern, Minimal, Corporate or Event.
12. Save your design, then print/download the PDF.

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

Exports accept up to 100 cards per request. Cards are approximately 54 × 86 mm (or 86 × 54 mm landscape) on A4 pages;
print at 100% scale. PDF output includes uploaded images, student details, QR and
Code 128 codes, colors, and the selected template. External HTTPS image links
appear in previews; upload the image to include it in PDF output. Excel imports
accept `.xlsx` files (not the legacy `.xls` format).

Before a public launch, configure HTTPS, a strong JWT secret, persistent storage,
backups, and transactional email for account verification and password recovery.
Pro activation remains manual/COD; online billing is not enabled.

## Card customization

All five designs are available on Free and Pro. Choose portrait or landscape,
background/text/accent colors, font family and size, photo shape, visible student
fields, logo/background, QR/barcode, card title and footer. Upload or remove the logo and background independently in **Organization settings**,
then save. JPG, PNG and WEBP files up to 5 MB are supported. Existing combined images
are preserved as both images on upgrade; you can replace or remove either one.
Student photos are uploaded in the student form. Changes update the
live preview; **Save design** persists them for the organization and PDF exports.
Long text is shortened to fit the card, so check the preview before printing.

## Printing-services website

Open **http://localhost:3000/printing** for the public catalog: flex boards and
banners, wedding cards, personalized mugs, T-shirts, and ID cards with lanyards.
Visitors can search/filter products and submit a quote request without signing in.
The form stores contact details and requirements in PostgreSQL. It does not place
an order or collect payment.

Set `PRINT_SHOP_NAME` in `.env` to change the default **Print Studio** branding.
Set `ADMIN_EMAIL` to the shop operator's account email and restart the app. In the
ID Card Studio, the administrator can open **Admin** to see printing enquiries,
filter them, and update their status (new, contacted, quoted, closed). Contact the
customer separately to confirm pricing, artwork and delivery; notifications and
artwork uploads are not part of the quote form.

## Admin dashboard

Open **/admin** (or **Admin sign in** on the login page). First create your account,
set `ADMIN_EMAIL` to that account's email in `.env`, then restart/recreate the app
with `docker compose up --build -d`. Sign in using that account's password. Admins
can access this page without completing organization setup.

The dashboard includes platform totals, a 14-day card-generation chart, searchable
and paginated users, organizations, student records, manual payment requests,
printing enquiries, upload history and activity. Organization reports show class,
section and student counts, card quota usage, plan, design and image availability.
Admins can approve/reject manual payments and update enquiry status.

Activity and upload history start when this update is installed. Existing account,
organization, student, payment and enquiry records are visible immediately. Activity
is recorded in the same database transaction as successful changes. It records
related accounts, not browser page views, failed login attempts or physical prints.
Upload history shows original file sizes and includes files later removed from cards;
it is not a live storage inventory. Approved payment totals describe manual approvals,
not independently verified bank transactions. All admin data APIs require an admin
role read from the database on each request; credentials and signing secrets are
never included in reports.

## Customer app and print requests

Customers can use the website on desktop/mobile or install it from Android Chrome's
menu (or **Install app**, when offered). Serve the deployment over HTTPS. This is
an installable web app, not a native APK or Play Store release. `/orders` provides
print requests and status tracking; no private account data or artwork is cached
offline. Administrators use `/admin` in their desktop browser.

- Upload JPG/PNG/WEBP artwork (up to 5 MB, 16 megapixels), choose a product, quantity
  and dimensions, then submit. Print artwork preserves its original resolution.
- From a selected ID card, choose **Request shop printing**. The request saves the
  current design/student data and consumes one card generation from the owner's
  quota. Later design edits do not change the submitted request.
- Admins open **Print jobs → Prepare / print**, choose preset/custom width and
  height in mm/cm/inches, paper (matching item/A4/A3/Letter), orientation, margins,
  fit/crop and 1–20 copies per batch. One item is placed on each page.
- **Open print document** opens a printable page. **Choose printer & print** opens
  the browser's print dialog. Select an installed USB/network printer and set
  **Actual size / 100%**, the matching paper, no headers/footers, and one printer
  copy (the document already contains the chosen batch copies).
- **Download exact-size PDF** is available for external printer/RIP software.
  Large flex boards require a suitable wide-format device/media. Mug and T-shirt
  sizes refer to transfer artwork; finishing requires the appropriate equipment.
- The app does not detect printer connections, silently send jobs, or confirm
  physical output. Set the requested custom paper in the printer driver when
  necessary. After checking the entire requested quantity, the admin explicitly
  marks the request printed. Closing or cancelling a print dialog never does so.

Browser printing uses [window.print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print).
Printer-specific automatic dispatch needs a separately configured local print
agent or supported printer API; no hardware credentials are stored by this app.

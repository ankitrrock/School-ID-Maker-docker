# Sellable Product V1

This branch prepares School ID Maker for customer sales.

## Current payment mode: COD / manual activation

Online payment is intentionally bypassed for now.

Customer flow:
1. Create account.
2. Create School / College / Individual organization.
3. Use Free plan within usage limits.
4. Request Pro activation from Plan & product tools.
5. Admin verifies COD/manual payment.
6. Admin approves the request.
7. Organization changes to Pro.

Razorpay environment variables are reserved for a later online-payment rollout and are not required for the COD flow.

## Plans

Free: 50 students, 50 generated cards, 1 template, manual entry.

Pro: 5,000 students, 5,000 generated cards, 3 templates, Excel bulk import.

## Included product capabilities

- School / College / Individual organization types
- Organization branding and colors
- Organization logo/background image
- Student photo
- Responsive mobile/desktop interface
- Card templates
- QR code
- Code 128 barcode
- Bulk XLSX import
- Bulk PDF ID-card generation
- Browser printing
- Usage dashboard
- COD/manual Pro activation
- Platform admin payment-request dashboard
- Supabase Storage integration
- PostgreSQL persistence
- Render Docker deployment configuration

## Supabase

Create a Supabase project and run supabase/storage.sql.

Required server variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET=id-card-assets.

The service-role key must remain server-side.

## Render

Deploy the current branch as a Docker web service and configure DATABASE_URL, JWT_SECRET, ADMIN_EMAIL and Supabase variables. The Render blueprint is in render.yaml.

## Admin

First register an account you control, then set ADMIN_EMAIL to that email and restart before opening public registration. The Admin navigation shows customer counts, Pro organizations, pending COD requests and approve/reject controls.

## Excel columns

Accepted columns: student_id, name, date_of_birth, gender, blood_group, father_name, phone, address, photo_url. student_id and name are required.

## Production checklist

- Use a strong random JWT_SECRET.
- Use HTTPS on Render.
- Keep the Supabase service-role key private.
- Configure Supabase Storage policies/signed URLs for your privacy model.
- Add transactional email for password reset/verification before public launch.
- Configure PostgreSQL backups and retention.
- Add Razorpay only when online payments are enabled.
- Test PDF printing on the target ID-card paper dimensions.

## Export and quota details

See RUN_LOCAL.md and README.md for current runtime instructions. Imports accept XLSX only and roll back on invalid or duplicate rows. Exports are limited to 100 cards per request; successful PDF generation consumes cumulative card quota. Browser print buttons use the same PDF endpoint. Uploaded images are included in exports; external HTTPS image links are preview-only.

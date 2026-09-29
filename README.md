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

### Docker
```bash
docker compose up --build
```

Open http://localhost:3000

### Local Node
Requires PostgreSQL.
```bash
npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/school_id_maker JWT_SECRET=dev-secret npm start
```

## Production notes

- Replace `JWT_SECRET`.
- Put the app behind HTTPS.
- Use object storage such as S3/R2 for production uploads.
- Add payment/subscription before selling publicly.
- Add email verification and transactional email for password reset.

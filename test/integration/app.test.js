const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { Pool } = require('pg');
const sharp = require('sharp');
const ExcelJS = require('exceljs');
const jwt = require('jsonwebtoken');

// Deliberately fail if the integration command lacks its required database.
if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database.');
process.env.FREE_STUDENT_LIMIT = '2'; process.env.FREE_CARD_LIMIT = '2';
process.env.PRO_STUDENT_LIMIT = '5'; process.env.PRO_CARD_LIMIT = '5';
const { createApp, initDb } = require('../../server');
const { createStorage } = require('../../server/storage');

test('current application workflows against PostgreSQL', async t => {
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const dir = await mkdtemp('/tmp/school-id-integration-');
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  let server;
  const previousUploadDir = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = dir;
  try {
    await adminPool.query(`create schema ${schema}`);
    await initDb(pool);
    const secret = randomBytes(32).toString('hex');
    server = createApp({ pool, jwtSecret: secret, storage: createStorage(), authLimit: 100 }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, method = 'GET', body, cookie, expected = 200) {
      const headers = {}; if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      assert.equal(response.status, expected, `${method} ${path}: ${response.status}`);
      const data = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
      return { response, data };
    }
    async function account(email) {
      const signup = await request('/api/auth/signup', 'POST', { name: 'Test User', email, password: 'test-pass-123' }, null, 201);
      const cookie = signup.response.headers.get('set-cookie').split(';')[0];
      const org = (await request('/api/organization', 'PUT', { name: 'Test School' }, cookie)).data.organization;
      const cls = (await request('/api/classes', 'POST', { name: 'Class 1' }, cookie, 201)).data.class;
      const section = (await request(`/api/classes/${cls.id}/sections`, 'POST', { name: 'A' }, cookie, 201)).data.section;
      return { cookie, org, section, user: signup.data.user };
    }
    const alice = await account('alice@example.test'), bob = await account('bob@example.test');
    let first, asset;
    await t.test('tenant isolation and simultaneous manual student limits', async () => {
      await request(`/api/sections/${alice.section.id}/students`, 'POST', { name: 'Other', studentId: 'B0' }, bob.cookie, 404);
      const responses = await Promise.all([1, 2, 3].map(n => fetch(base + `/api/sections/${alice.section.id}/students`, {
        method: 'POST', headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Student ' + n, studentId: 'A' + n }) })));
      assert.deepEqual(responses.map(response => response.status).sort(), [201, 201, 402]);
      first = (await request(`/api/sections/${alice.section.id}/students`, 'GET', undefined, alice.cookie)).data.students[0];
      assert.equal((await request('/api/usage', 'GET', undefined, alice.cookie)).data.usage.students_count, 2);
      assert.equal((await request(`/api/sections/${alice.section.id}/students`, 'GET', undefined, bob.cookie)).data.students.length, 0);
      await request(`/api/students/${first.id}`, 'DELETE', undefined, bob.cookie, 404);
    });
    await t.test('upload endpoint returns a durable protected image, valid in PDF', async () => {
      const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer();
      const form = new FormData(); form.append('image', new Blob([png], { type: 'image/png' }), 'photo.png');
      const upload = await fetch(base + '/api/uploads', { method: 'POST', headers: { Cookie: alice.cookie }, body: form });
      assert.equal(upload.status, 201); asset = await upload.json();
      await request(asset.url, 'GET', undefined, bob.cookie, 404);
      await request(asset.url, 'GET', undefined, undefined, 401);
      const image = await request(asset.url, 'GET', undefined, alice.cookie);
      assert.equal(image.response.headers.get('content-type'), 'image/png');
      await request('/api/organization', 'PUT', { name: 'Test School', imageUrl: asset.url }, alice.cookie);
      await request('/api/organization', 'PUT', { name: 'Test School', imageUrl: 'javascript:alert(1)' }, alice.cookie, 400);
    });
    await t.test('card quotas are serialized, tenant checked, and PDFs contain images', async () => {
      await request('/api/bulk-cards', 'POST', { studentIds: [first.id] }, bob.cookie, 404);
      const responses = await Promise.all([1, 2, 3].map(() => fetch(base + '/api/bulk-cards', { method: 'POST', headers: { Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ studentIds: [first.id] }) })));
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 200, 402]);
      const pdf = Buffer.from(await responses.find(response => response.ok).arrayBuffer());
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.match(pdf.toString('latin1'), /\/Subtype \/Image/);
      assert.equal((await request('/api/usage', 'GET', undefined, alice.cookie)).data.usage.cards_generated, 2);
      await request('/api/templates', 'PUT', { templateId: 'modern' }, alice.cookie, 403);
    });
    await t.test('admin role comes from database and payment transitions are atomic', async () => {
      const forgedRole = 'sid=' + jwt.sign({ id: bob.user.id, role: 'admin' }, secret);
      await request('/api/admin/overview', 'GET', undefined, forgedRole, 403);
      const payment = (await request('/api/billing/cod', 'POST', { note: 'Test payment' }, alice.cookie, 201)).data.request;
      await request('/api/billing/cod', 'POST', {}, alice.cookie, 409);
      await pool.query("update users set role='admin' where id=$1", [bob.user.id]);
      await request('/api/admin/payment-requests/' + randomUUID() + '/approve', 'POST', undefined, bob.cookie, 404);
      await request(`/api/admin/payment-requests/${payment.id}/approve`, 'POST', undefined, bob.cookie);
      await request(`/api/admin/payment-requests/${payment.id}/reject`, 'POST', undefined, bob.cookie, 409);
      const templates = (await request('/api/templates', 'GET', undefined, alice.cookie)).data.templates;
      assert.equal(templates.length, 3);
      await request('/api/templates', 'PUT', { templateId: 'modern' }, alice.cookie);
      assert.equal((await request('/api/organization', 'GET', undefined, alice.cookie)).data.organization.template_id, 'modern');
    });
    await t.test('XLSX import rolls back duplicates and includes manual students in quota', async () => {
      async function importRows(rows, expected) {
        const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Students'); sheet.addRow(['student_id', 'name']);
        rows.forEach(row => sheet.addRow(row));
        const response = await fetch(base + '/api/bulk-import/' + alice.section.id, { method: 'POST', headers: { Cookie: alice.cookie, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: Buffer.from(await book.xlsx.writeBuffer()) });
        assert.equal(response.status, expected); return response.json();
      }
      await importRows([['NEW', 'New'], [first.student_id, 'Duplicate']], 409);
      assert.equal((await request('/api/usage', 'GET', undefined, alice.cookie)).data.usage.students_count, 2);
      assert.equal((await importRows([['NEW1', 'One'], ['NEW2', 'Two'], ['NEW3', 'Three']], 200)).inserted, 3);
      await importRows([['NEW4', 'Four']], 402);
      await request(`/api/students/${first.id}`, 'DELETE', undefined, alice.cookie, 204);
      await request(`/api/sections/${alice.section.id}/students`, 'POST', { name: 'Replacement', studentId: 'R1', photoUrl: asset.url }, alice.cookie, 201);
      assert.equal((await request('/api/usage', 'GET', undefined, alice.cookie)).data.usage.students_count, 5);
    });
    await t.test('health and API error responses are JSON', async () => {
      assert.deepEqual((await request('/api/healthz')).data, { status: 'ok' });
      await request('/api/missing', 'GET', undefined, alice.cookie, 404);
      await request('/api/students/not-a-uuid', 'DELETE', undefined, alice.cookie, 400);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    await adminPool.query(`drop schema if exists ${schema} cascade`); await adminPool.end();
    await rm(dir, { recursive: true, force: true });
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previousUploadDir;
  }
});

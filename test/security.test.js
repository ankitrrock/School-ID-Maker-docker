const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const { createApp } = require('../server');
const { createStorage } = require('../server/storage');
const { excelRows } = require('../server/product');
const ExcelJS = require('exceljs');

const secret = randomBytes(32).toString('hex');
async function serve(app, action) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await action(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('server requires a strong configured signing secret', () => {
  for (const jwtSecret of ['', 'dev-only-secret', 'replace-with-a-long-random-secret']) {
    assert.throws(() => createApp({ pool: {}, jwtSecret }), /JWT_SECRET/);
  }
});
test('production signup, login and logout cookies are Secure, HttpOnly and SameSite=Lax', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const user = { id: randomUUID(), name: 'Test', email: 'test@example.test', role: 'user', password_hash: await bcrypt.hash('test-pass-123', 4) };
    const app = createApp({ jwtSecret: secret, pool: { query: async () => ({ rows: [user] }) } });
    await serve(app, async base => {
      for (const route of ['signup', 'login', 'logout']) {
        const response = await fetch(base + '/api/auth/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...user, password: 'test-pass-123' }) });
        assert.equal(response.status, route === 'signup' ? 201 : 200);
        const cookie = response.headers.get('set-cookie');
        assert.match(cookie, /; Secure/); assert.match(cookie, /; HttpOnly/); assert.match(cookie, /SameSite=Lax/);
      }
    });
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test('login attempts are limited and unauthenticated assets are rejected', async () => {
  await serve(createApp({ jwtSecret: secret, authLimit: 2, pool: { query: async () => ({ rows: [] }) } }), async base => {
    assert.equal((await fetch(base + '/api/assets/file?path=x')).status, 401);
    for (const expected of [401, 401, 429]) {
      const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'invalid@example.test', password: 'bad' }) });
      assert.equal(response.status, expected);
    }
  });
});
test('frontend parses and escapes attacker-controlled image attributes and student text', () => {
  const nodes = new Map();
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { classList: { toggle() {}, add() {}, remove() {} }, addEventListener() {}, value: '' }); return nodes.get(id); }, addEventListener() {} };
  const context = vm.createContext({ document, URL, fetch: async () => { throw new Error('No session'); }, setTimeout, clearTimeout, console });
  vm.runInContext(readFileSync('public/app.js', 'utf8'), context);
  const payload = 'https://example.test/x" onerror="alert(1)';
  const html = vm.runInContext(`cardHTML(${JSON.stringify({ name: '<school>', image_url: payload, background_color: '" onclick="bad', text_color: '#123456' })}, ${JSON.stringify({ name: '<img src=x onerror=bad>', photo_url: payload, student_id: 'A1' })})`, context);
  assert.ok(!html.includes(' onerror="'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;school&gt;/);
  assert.equal(vm.runInContext('safeImage("javascript:alert(1)")', context), '');
  assert.equal(vm.runInContext('safeImage("data:image/svg+xml,bad")', context), '');
  assert.match(readFileSync('public/index.html', 'utf8'), /<script src="\/app.js" defer><\/script>/);
});
test('uploads validate real image content and prevent traversal or cross-owner reads', async () => {
  const { mkdtemp, rm } = require('node:fs/promises');
  const dir = await mkdtemp('/tmp/school-id-assets-test-');
  const previous = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = dir;
  try {
    const storage = createStorage(), owner = randomUUID(), other = randomUUID();
    await assert.rejects(storage.uploadAsset(Buffer.from('<svg>bad</svg>'), 'image/png', owner), { status: 400 });
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const asset = await storage.uploadAsset(png, 'image/png', owner);
    assert.match(asset.url, /^\/api\/assets\/file\?path=/);
    assert.ok((await storage.read({}, owner, asset.url)).length);
    await assert.rejects(storage.read({}, other, asset.url), { status: 404 });
    await assert.rejects(storage.read({}, owner, '/api/assets/file?path=..%2F..%2F.env'), { status: 404 });
    assert.equal(await storage.read({}, owner, 'https://127.0.0.1/private'), null);
  } finally { if (previous === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = previous; await rm(dir, { recursive: true, force: true }); }
});
test('XLSX import reads dates and aliases and rejects invalid workbooks', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Students');
  sheet.addRow(['Student ID', 'Student Name', 'DOB']); sheet.addRow(['S-1', 'Example', new Date('2012-01-02T00:00:00Z')]);
  const [row] = await excelRows(Buffer.from(await book.xlsx.writeBuffer()));
  assert.equal(row.studentId, 'S-1'); assert.equal(row.name, 'Example'); assert.equal(row.dateOfBirth, '2012-01-02');
  await assert.rejects(excelRows(Buffer.from('not a workbook')), { status: 400 });
});
test('Supabase legacy signed URLs recover durable paths and retain ownership checks', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BUCKET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SUPABASE_URL = 'https://storage.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
  process.env.SUPABASE_BUCKET = 'id-card-assets';
  try {
    const storage = createStorage(), owner = randomUUID();
    const path = `organizations/${owner}/old-photo.png`;
    const expired = `https://storage.example.test/storage/v1/object/sign/id-card-assets/${path}?token=expired`;
    const stable = '/api/assets/file?path=' + encodeURIComponent(path);
    assert.equal(storage.stableUrl(expired), stable);
    assert.equal(await storage.validateUrl({}, owner, expired), stable);
    await assert.rejects(storage.validateUrl({}, randomUUID(), expired), { status: 404 });
    assert.equal(storage.assetPath(expired.replace('storage.example.test', 'other.example.test')), null);
  } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});

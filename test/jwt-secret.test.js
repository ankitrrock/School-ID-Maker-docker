const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { loadOrCreateSecret } = require('../server/jwt-secret');

async function fixture(action) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'school-id-jwt-'));
  try { await action(path.join(directory, 'private', 'jwt-secret')); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}
test('generates a private signing secret and preserves sessions across restarts', async () => {
  await fixture(async filename => {
    const first = loadOrCreateSecret(filename);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(loadOrCreateSecret(filename), first);
    assert.equal((await fs.stat(filename)).mode & 0o777, 0o600);
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 'test-user' }, first, { expiresIn: '1h' });
    assert.equal(jwt.verify(token, loadOrCreateSecret(filename)).id, 'test-user');
  });
});
test('concurrent first starts agree on one complete signing secret', async () => {
  await fixture(async filename => {
    const script = `const {loadOrCreateSecret}=require('./server/jwt-secret');const crypto=require('node:crypto');process.stdout.write(crypto.createHash('sha256').update(loadOrCreateSecret(process.argv[1])).digest('hex'));`;
    const start = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script, filename]);
      let output = '', error = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { error += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(output) : reject(new Error(error)));
    });
    assert.equal(new Set(await Promise.all(Array.from({ length: 8 }, start))).size, 1);
    assert.deepEqual(await fs.readdir(path.dirname(filename)), ['jwt-secret']);
  });
});
test('corrupt stored secret fails without silently rotating it', async () => {
  await fixture(async filename => {
    await fs.mkdir(path.dirname(filename)); await fs.writeFile(filename, 'invalid');
    assert.throws(() => loadOrCreateSecret(filename), /Stored JWT signing secret is invalid/);
    assert.equal(await fs.readFile(filename, 'utf8'), 'invalid');
  });
});
test('Docker bootstrap honors an explicit JWT_SECRET without accessing storage', async () => {
  await fixture(async filename => {
    const result = spawnSync(process.execPath, ['--require', './server/docker-env.js', '-e', 'if(process.env.JWT_SECRET!=="explicit-test-secret-12345678901234567890")process.exit(1)'], {
      env: { ...process.env, JWT_SECRET: 'explicit-test-secret-12345678901234567890', JWT_SECRET_FILE: filename }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(fs.access(filename), { code: 'ENOENT' });
  });
});

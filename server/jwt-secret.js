const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function loadOrCreateSecret(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(filename)) {
    const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, crypto.randomBytes(32).toString('hex') + '\n');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      // Publish a complete file without replacing a secret another process created.
      try { fs.linkSync(temporary, filename); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      fs.rmSync(temporary, { force: true });
    }
  }
  const secret = fs.readFileSync(filename, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('Stored JWT signing secret is invalid. Restore the secret file or explicitly configure JWT_SECRET.');
  }
  return secret;
}

module.exports = { loadOrCreateSecret };

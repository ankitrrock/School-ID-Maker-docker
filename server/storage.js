const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');
const { problem } = require('./limits');

const ASSET_ROUTE = '/api/assets/file?path=';
function createStorage() {
  const bucket = process.env.SUPABASE_BUCKET || 'id-card-assets';
  const root = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');
  if (Boolean(process.env.SUPABASE_URL) !== Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or neither for local storage.');
  }
  const client = process.env.SUPABASE_URL ? createClient(process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;

  function assetPath(url) {
    if (typeof url !== 'string') return null;
    if (url.startsWith(ASSET_ROUTE)) {
      try { return decodeURIComponent(url.slice(ASSET_ROUTE.length)); } catch { return null; }
    }
    // Recover object paths from previously persisted (possibly expired) signed URLs.
    if (client) {
      try {
        const value = new URL(url), base = new URL(process.env.SUPABASE_URL);
        const prefix = `/storage/v1/object/sign/${bucket}/`;
        if (value.origin === base.origin && value.pathname.startsWith(prefix)) return decodeURIComponent(value.pathname.slice(prefix.length));
      } catch { /* Not a managed asset. */ }
    }
    return null;
  }
  async function authorize(db, userId, key) {
    if (!/^organizations\/[a-f0-9-]{36}\/[a-zA-Z0-9._-]+$/.test(key || '') &&
        !/^students\/[a-f0-9-]{36}\/[a-zA-Z0-9._-]+$/.test(key || '')) throw problem(404, 'Image not found.');
    const [kind, owner] = key.split('/');
    if (kind === 'organizations' && owner === userId) return;
    if (kind === 'students') {
      const r = await db.query(`select st.id from students st join sections s on s.id=st.section_id
        join classes c on c.id=s.class_id join organizations o on o.id=c.organization_id
        where st.id=$1 and o.user_id=$2`, [owner, userId]);
      if (r.rows.length) return;
    }
    throw problem(404, 'Image not found.');
  }
  async function read(db, userId, url, { original = false } = {}) {
    const key = assetPath(url);
    if (!key) return null; // Never fetch arbitrary user-provided URLs on the server.
    await authorize(db, userId, key);
    let buffer;
    if (client) {
      const { data, error } = await client.storage.from(bucket).download(key);
      if (error) throw problem(502, 'Unable to load stored image.');
      buffer = Buffer.from(await data.arrayBuffer());
    } else {
      try { buffer = await fs.readFile(path.join(root, key)); }
      catch (error) { if (error.code === 'ENOENT') throw problem(404, 'Image not found.'); throw error; }
    }
    const image = sharp(buffer, { limitInputPixels: 16000000 }).rotate();
    if (!original) image.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });
    return image.png().toBuffer();
  }
  async function uploadAsset(buffer, mime, userId, { original = false } = {}) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw problem(400, 'Choose a JPG, PNG or WEBP image.');
    let normalized;
    try {
      const image = sharp(buffer, { limitInputPixels: 16000000 });
      const meta = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format)) throw new Error('Unsupported image');
      image.rotate();
      if (!original) image.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });
      normalized = await image.png().toBuffer();
    } catch { throw problem(400, 'The uploaded file is not a supported image.'); }
    const key = `organizations/${userId}/${crypto.randomUUID()}.png`;
    if (client) {
      const { error } = await client.storage.from(bucket).upload(key, normalized, { contentType: 'image/png', upsert: false });
      if (error) throw problem(502, 'Unable to store image.');
    } else {
      await fs.mkdir(path.dirname(path.join(root, key)), { recursive: true });
      await fs.writeFile(path.join(root, key), normalized, { flag: 'wx', mode: 0o600 });
    }
    return { path: key, url: ASSET_ROUTE + encodeURIComponent(key) };
  }
  async function validateUrl(db, userId, url) {
    if (!url) return null;
    const key = assetPath(url);
    if (key) { await authorize(db, userId, key); return ASSET_ROUTE + encodeURIComponent(key); }
    // External links remain usable in previews; PDF embeds only managed images.
    try { const value = new URL(url); if (value.protocol === 'https:' && !value.username && !value.password) return value.href; } catch { /* Invalid URL. */ }
    throw problem(400, 'Use an uploaded image or an HTTPS image URL.');
  }
  function stableUrl(url) { const key = assetPath(url); return key ? ASSET_ROUTE + encodeURIComponent(key) : url; }
  return { uploadAsset, read, validateUrl, stableUrl, assetPath };
}
module.exports = { createStorage, ASSET_ROUTE };

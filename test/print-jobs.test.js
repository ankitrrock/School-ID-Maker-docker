const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const Options = require('../public/print-options');
const Renderer = require('../server/print-render');
const { validate } = require('../server/print-jobs');
const { createStorage } = require('../server/storage');
const { mkdtemp, rm } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

test('print dimensions reject impossible paper fits and preserve physical preset sizes', () => {
  for (const preset of Options.presets) {
    const layout = Options.validate({ ...preset, paper: 'match' });
    assert.deepEqual(Options.pageSize(layout), [preset.widthMm, preset.heightMm]);
  }
  assert.equal(Options.validate({ widthMm: 127, heightMm: 7 * 25.4 }).heightMm, 177.8);
  const base = { widthMm: 54, heightMm: 86 };
  for (const patch of [
    { widthMm: 0 },
    { heightMm: Infinity },
    { widthMm: '54' },
    { widthMm: 2001 },
    { copies: 21 },
    { copies: 1.1 },
    { marginMm: -1 },
    { paper: 'bad' },
    { landscape: 'yes' },
    { fit: 'stretch' },
    { widthMm: 400, paper: 'A4' },
    { widthMm: 210, heightMm: 297, paper: 'A4', marginMm: 5 },
  ])
    assert.throws(() => Options.validate({ ...base, ...patch }));
  const layout = Options.validate({ ...base, paper: 'A4', landscape: true, marginMm: 5 });
  assert.deepEqual(Options.pageSize(layout), [297, 210]);
  const contain = Options.placement(Options.validate({ widthMm: 100, heightMm: 100 }), 200, 100);
  assert.equal(contain.width, 100);
  assert.equal(contain.height, 50);
  assert.equal(contain.offsetY, 25);
  const cover = Options.placement(
    Options.validate({ widthMm: 100, heightMm: 100, fit: 'cover' }),
    200,
    100,
  );
  assert.equal(cover.width, 200);
  assert.equal(cover.offsetX, -50);
  assert.throws(
    () =>
      validate({ title: 'test', quantity: 1, productId: 'mugs', layout: { ...base, copies: 2 } }),
    { status: 400 },
  );
});
test('artwork PDF has exact page sizes and copies, matching printable HTML', async () => {
  const buffer = await sharp({
    create: { width: 200, height: 100, channels: 3, background: '#aa5533' },
  })
    .png()
    .toBuffer();
  const storage = { read: async () => buffer };
  for (const settings of [
    { widthMm: 127, heightMm: 177.8, paper: 'match', copies: 2 },
    { widthMm: 54, heightMm: 86, paper: 'A4', copies: 1 },
    { widthMm: 900, heightMm: 1800, paper: 'match', copies: 1 },
  ]) {
    const job = {
      id: randomUUID(),
      user_id: randomUUID(),
      kind: 'artwork',
      title: '<script>unsafe</script>',
      source: { artworkUrl: 'asset' },
      layout: Options.validate(settings),
    };
    const pdf = await Renderer.pdf(job, {}, storage),
      text = pdf.toString('latin1'),
      box = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(box);
    const [width, height] = Options.pageSize(job.layout);
    assert.ok(Math.abs(Number(box[1]) - (width * 72) / 25.4) < 0.001);
    assert.ok(Math.abs(Number(box[2]) - (height * 72) / 25.4) < 0.001);
    assert.equal((text.match(/\/Type \/Page\b/g) || []).length, settings.copies);
    const html = await Renderer.html(job, {}, storage);
    assert.ok(html.includes(`size:${width}mm ${height}mm`));
    assert.ok(!html.includes('<script>unsafe'));
    assert.ok(html.includes('&lt;script&gt;unsafe'));
  }
});
test('ID snapshot renders a custom landscape paper without losing logo, background or codes', async () => {
  const buffer = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#55aa88' },
  })
    .png()
    .toBuffer();
  const job = {
    id: randomUUID(),
    user_id: randomUUID(),
    kind: 'idcard',
    title: 'ID',
    layout: Options.validate({ widthMm: 86, heightMm: 54, copies: 2 }),
    source: {
      org: {
        name: 'School',
        image_url: 'logo',
        background_image_url: 'background',
        card_design: { orientation: 'landscape' },
      },
      student: { name: 'Name', student_id: 'ID-1', photo_url: 'photo' },
    },
  };
  const pdf = await Renderer.pdf(job, {}, { read: async () => buffer });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.toString('latin1'), /\/Subtype \/Image/);
  const html = await Renderer.html(job, {}, { read: async () => buffer });
  assert.match(html, /viewBox="0 0 510 320"/);
  assert.match(html, /image\/background/);
  assert.match(html, /image\/logo/);
});
test('print artwork upload preserves resolution while normal card assets stay bounded', async () => {
  const dir = await mkdtemp('/tmp/print-resolution-'),
    old = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = dir;
  try {
    const storage = createStorage(),
      owner = randomUUID(),
      buffer = await sharp({
        create: { width: 1800, height: 1400, channels: 3, background: '#ffaa00' },
      })
        .png()
        .toBuffer();
    const asset = await storage.uploadAsset(buffer, 'image/png', owner, { original: true });
    const full = await sharp(
      await storage.read({}, owner, asset.url, { original: true }),
    ).metadata();
    assert.equal(full.width, 1800);
    assert.equal(full.height, 1400);
    const preview = await sharp(await storage.read({}, owner, asset.url)).metadata();
    assert.equal(preview.width, 1200);
  } finally {
    if (old === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = old;
    await rm(dir, { recursive: true, force: true });
  }
});

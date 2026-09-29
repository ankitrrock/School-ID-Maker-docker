const { test } = require('node:test');
const assert = require('node:assert/strict');
const CardDesign = require('../public/card-design');
const { pdfCards } = require('../server/cards');
const { validateEnquiry } = require('../server/printing');
const sharp = require('sharp');

test('card settings reject unsafe or unsupported inputs without discarding explicit false/empty values', () => {
  for (const value of [null, [], { accentColor: 'red' }, { showPhoto: 1 }, { orientation: 'diagonal' }, { footerText: 'x'.repeat(61) }, { visibleFields: ['password'] }, { visibleFields: [['phone']] }, { visibleFields: ['phone', 'phone'] }, { arbitrary: true }]) {
    assert.throws(() => CardDesign.validate(value));
  }
  const settings = CardDesign.validate({ visibleFields: [], showQr: false, cardTitle: '' });
  assert.deepEqual(settings.visibleFields, []); assert.equal(settings.showQr, false); assert.equal(settings.cardTitle, '');
});
test('customization hides private fields/images and updates both card orientations', () => {
  const student = { name: 'Example Student', student_id: 'EX-1', phone: '5551234567', address: 'Private address', photo_url: 'photo' };
  for (const orientation of ['portrait', 'landscape']) {
    const scene = CardDesign.scene({ image_url: 'logo', background_image_url: 'background', card_design: { orientation, showPhoto: false, showLogo: false, showBackground: false, showQr: false, showBarcode: false, visibleFields: ['phone'], footerText: 'Return to reception' } }, student);
    assert.equal(scene.width > scene.height, orientation === 'landscape');
    assert.equal(scene.ops.filter(op => op.type === 'image').length, 0);
    assert.ok(scene.ops.some(op => op.text?.includes(student.phone)));
    assert.ok(!scene.ops.some(op => op.text?.includes(student.address)));
    assert.ok(scene.ops.some(op => op.text === 'Return to reception'));
  }
});
test('all five designs export PDFs in both orientations, including uploaded images', async () => {
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer();
  const student = { name: 'Example Student', student_id: 'EX-1', photo_url: 'photo', phone: '5551234567' };
  const appearances = new Set();
  for (const template of CardDesign.templates) {
    for (const orientation of ['portrait', 'landscape']) {
      const org = { template_id: template.id, image_url: 'logo', background_image_url: 'background', card_design: { orientation, fontFamily: 'serif', photoShape: 'circle' } };
      const scene = CardDesign.scene(org, student);
      if (orientation === 'portrait') appearances.add(JSON.stringify(scene.ops));
      for (const op of scene.ops) {
        assert.ok(op.x >= 0 && op.y >= 0 && op.x + op.w <= scene.width);
        assert.ok(op.y + (op.h || op.size * 1.6) <= scene.height);
      }
      const pdf = await pdfCards([student], org, {}, 'owner', { read: async () => image });
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.match(pdf.toString('latin1'), /\/Subtype \/Image/);
    }
  }
  assert.equal(appearances.size, 5);
  let reads = 0;
  const pdf = await pdfCards([student], { card_design: { showPhoto: false, showLogo: false, showBackground: false, showQr: false, showBarcode: false } }, {}, 'owner', { read: async () => { reads++; return image; } });
  assert.equal(reads, 0); assert.doesNotMatch(pdf.toString('latin1'), /\/Subtype \/Image/);
});
test('printing enquiries validate quantities, contact details and product options', () => {
  const input = { productId: 'flex', productOption: 'Frontlit flex', name: ' Customer ', phone: '+91 9876543210', city: ' Delhi ', quantity: 2 };
  assert.equal(validateEnquiry(input).name, 'Customer');
  for (const patch of [{ quantity: 1.5 }, { quantity: 100001 }, { phone: '123' }, { phone: 'call-me-now' }, { email: 'invalid' }, { name: '' }, { details: 'x'.repeat(2001) }, { productId: 'unknown' }]) {
    assert.throws(() => validateEnquiry({ ...input, ...patch }), { status: 400 });
  }
});

 test('independent logo and background assets are rendered and loaded only when enabled', async () => {
  const images = {};
  for (const [name, color] of [['logo', '#224488'], ['background', '#ffaa11']]) {
    images[name] = await sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).png().toBuffer();
  }
  for (const [showLogo, showBackground] of [[true, true], [false, true], [true, false], [false, false]]) {
    const org = { image_url: 'logo', background_image_url: 'background', card_design: { showLogo, showBackground, showPhoto: false, showQr: false, showBarcode: false } };
    const expected = [showLogo && 'logo', showBackground && 'background'].filter(Boolean).sort();
    const scene = CardDesign.scene(org, { name: 'Test', student_id: '1' });
    assert.deepEqual(scene.ops.filter(op => op.type === 'image').map(op => op.source).sort(), expected);
    const reads = [];
    const pdf = await pdfCards([{ name: 'Test', student_id: '1' }], org, {}, 'owner', { read: async (db, owner, url) => { reads.push(url); return images[url]; } });
    assert.deepEqual(reads.sort(), expected);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal((pdf.toString('latin1').match(/\/Subtype \/Image/g) || []).length, expected.length);
  }
});

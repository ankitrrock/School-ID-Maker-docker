const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const CardDesign = require('../public/card-design');
const Options = require('../public/print-options');
const { qr, barcode, renderScene } = require('./cards');
const { problem } = require('./limits');
const MM = 72 / 25.4;
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c],
  );
async function imageFor(job, key, pool, storage) {
  const source = job.source;
  if (job.kind === 'artwork' && key === 'artwork')
    return storage.read(pool, job.user_id, source.artworkUrl, { original: true });
  if (job.kind === 'idcard') {
    if (key === 'qr') return qr(source.student.student_id);
    if (key === 'barcode') return barcode(source.student.student_id);
    const url = {
      logo: source.org.image_url,
      background: source.org.background_image_url,
      photo: source.student.photo_url,
    }[key];
    if (url) return storage.read(pool, job.user_id, url);
  }
  throw problem(404, 'Image not found.');
}
async function load(job, pool, storage) {
  if (job.kind === 'artwork') {
    const artwork = await imageFor(job, 'artwork', pool, storage);
    if (!artwork) throw problem(404, 'Artwork is unavailable.');
    const meta = await sharp(artwork).metadata();
    return { width: meta.width, height: meta.height, images: { artwork } };
  }
  const scene = CardDesign.scene(job.source.org, job.source.student),
    images = {};
  for (const key of new Set(scene.ops.filter((op) => op.type === 'image').map((op) => op.source))) {
    const buffer = await imageFor(job, key, pool, storage);
    if (!buffer) throw problem(400, 'Upload the card images before requesting printing.');
    images[key] = buffer;
  }
  return { ...scene, scene, images };
}
async function pdf(job, pool, storage) {
  const layout = Options.validate(job.layout),
    data = await load(job, pool, storage),
    p = Options.placement(layout, data.width, data.height);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [p.pageWidth * MM, p.pageHeight * MM], margin: 0 }),
      chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const images = Object.fromEntries(
        Object.entries(data.images).map(([key, buffer]) => [key, doc.openImage(buffer)]),
      );
      for (let copy = 0; copy < layout.copies; copy++) {
        if (copy) doc.addPage();
        doc.save().scale(MM).rect(p.x, p.y, layout.widthMm, layout.heightMm).clip();
        if (data.scene) {
          doc.translate(p.x + p.offsetX, p.y + p.offsetY).scale(p.scale);
          renderScene(doc, data.scene, images);
        } else
          doc.image(images.artwork, p.x + p.offsetX, p.y + p.offsetY, {
            width: p.width,
            height: p.height,
          });
        doc.restore();
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
function svg(scene, jobId, index) {
  const fonts = {
    sans: 'Arial, sans-serif',
    serif: 'Times New Roman, serif',
    mono: 'Courier New, monospace',
  };
  return (
    `<svg viewBox="0 0 ${scene.width} ${scene.height}" xmlns="http://www.w3.org/2000/svg">` +
    scene.ops
      .map((op, n) => {
        if (op.type === 'rect')
          return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" rx="${op.radius}" fill="${op.fill || 'none'}" stroke="${op.stroke || 'none'}"/>`;
        if (op.type === 'text') {
          const x =
            op.align === 'center' ? op.x + op.w / 2 : op.align === 'right' ? op.x + op.w : op.x;
          return `<text x="${x}" y="${op.y + op.size}" fill="${op.fill}" font-family="${fonts[op.font]}" font-size="${op.size}" font-weight="${op.bold ? 700 : 400}" text-anchor="${op.align === 'center' ? 'middle' : op.align === 'right' ? 'end' : 'start'}">${esc(op.text)}</text>`;
        }
        const clip = `clip-${index}-${n}`;
        return `<defs><clipPath id="${clip}"><rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" rx="${op.radius}"/></clipPath></defs><image href="/api/admin/print-jobs/${jobId}/image/${op.source}" x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" opacity="${op.opacity}" preserveAspectRatio="xMidYMid ${op.cover ? 'slice' : 'meet'}" clip-path="url(#${clip})"/>`;
      })
      .join('') +
    '</svg>'
  );
}
async function html(job, pool, storage) {
  const layout = Options.validate(job.layout),
    data = await load(job, pool, storage),
    p = Options.placement(layout, data.width, data.height);
  const pages = Array.from(
    { length: layout.copies },
    (_, n) =>
      `<section class="sheet"><div class="item"><div class="art">${data.scene ? svg(data.scene, job.id, n) : `<img src="/api/admin/print-jobs/${job.id}/image/artwork" alt="Print artwork">`}</div></div></section>`,
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Print ${esc(job.title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#e7edf2;font:14px system-ui}.toolbar{padding:18px;background:white;position:sticky;top:0;z-index:2}button,a{margin-right:15px}button{padding:10px}.sheet{position:relative;width:${p.pageWidth}mm;height:${p.pageHeight}mm;background:white;margin:20px auto;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}.item{position:absolute;left:${p.x}mm;top:${p.y}mm;width:${layout.widthMm}mm;height:${layout.heightMm}mm;overflow:hidden}.art{position:absolute;left:${p.offsetX}mm;top:${p.offsetY}mm;width:${p.width}mm;height:${p.height}mm}.art>svg,.art>img{width:100%;height:100%;display:block}@page{size:${p.pageWidth}mm ${p.pageHeight}mm;margin:0}@media print{.toolbar{display:none}body{background:white}.sheet{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style><script src="/print-output.js" defer></script></head><body><div class="toolbar"><b>${esc(job.title)}</b> · Item ${layout.widthMm} × ${layout.heightMm} mm · ${layout.copies} page(s)<p>Choose your installed printer. Use 100% / Actual size, no headers or footers, and paper ${p.pageWidth} × ${p.pageHeight} mm. This document already contains ${layout.copies} copies; set printer copies to 1. Use PDF with the printer's RIP software for large-format or transfer printing.</p><button id="print" disabled>Loading artwork…</button><a href="/api/admin/print-jobs/${job.id}/pdf">Download PDF</a><a href="/orders?job=${job.id}">Back to job</a><span id="printStatus" role="status"></span></div>${pages}</body></html>`;
}
module.exports = { pdf, html, imageFor, load };

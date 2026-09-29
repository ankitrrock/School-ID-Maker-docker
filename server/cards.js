const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const PDFDocument = require('pdfkit');
const CardDesign = require('../public/card-design');

async function qr(value) { return QRCode.toBuffer(String(value), { width: 240, margin: 1 }); }
async function barcode(value) { return bwipjs.toBuffer({ bcid: 'code128', text: String(value), scale: 3, height: 12, includetext: true }); }
async function pdfCards(students, org, db, userId, storage) {
  const design = CardDesign.normalize(org.card_design);
  const logo = design.showLogo || design.showBackground ? await storage.read(db, userId, org.image_url) : null;
  const cards = [];
  for (const student of students) {
    cards.push({ scene: CardDesign.scene(org, student), images: { logo,
      photo: design.showPhoto ? await storage.read(db, userId, student.photo_url) : null,
      qr: design.showQr ? await qr(student.student_id) : null,
      barcode: design.showBarcode ? await barcode(student.student_id) : null } });
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 }), chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      cards.forEach(({ scene, images }, index) => {
        if (index) doc.addPage();
        const millimeters = scene.design.orientation === 'landscape' ? 86 : 54;
        doc.save().translate(24, 24).scale(millimeters * 72 / 25.4 / scene.width);
        for (const op of scene.ops) {
          if (op.type === 'rect') {
            doc.roundedRect(op.x, op.y, op.w, op.h, op.radius || 0);
            if (op.fill && op.stroke) doc.fillAndStroke(op.fill, op.stroke);
            else if (op.fill) doc.fill(op.fill);
            else if (op.stroke) doc.stroke(op.stroke);
          } else if (op.type === 'text') {
            const fonts = { sans: ['Helvetica', 'Helvetica-Bold'], serif: ['Times-Roman', 'Times-Bold'], mono: ['Courier', 'Courier-Bold'] };
            doc.fillColor(op.fill).font(fonts[op.font][op.bold ? 1 : 0]).fontSize(op.size)
              .text(op.text, op.x, op.y, { width: op.w, height: op.size * 1.6, lineBreak: false, align: op.align });
          } else if (op.type === 'image' && images[op.source]) {
            doc.save().roundedRect(op.x, op.y, op.w, op.h, op.radius || 0).clip().opacity(op.opacity);
            doc.image(images[op.source], op.x, op.y, { [op.cover ? 'cover' : 'fit']: [op.w, op.h], align: 'center', valign: 'center' });
            doc.restore();
          }
        }
        doc.restore();
      });
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
module.exports = { qr, barcode, pdfCards };

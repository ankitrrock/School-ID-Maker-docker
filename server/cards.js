const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const PDFDocument = require('pdfkit');

async function qr(value) { return QRCode.toBuffer(String(value), { width: 240, margin: 1 }); }
async function barcode(value) { return bwipjs.toBuffer({ bcid: 'code128', text: String(value), scale: 3, height: 12, includetext: true }); }
async function pdfCards(students, org, db, userId, storage) {
  const logo = await storage.read(db, userId, org.image_url);
  const cards = [];
  for (const student of students) {
    cards.push({ student, photo: await storage.read(db, userId, student.photo_url),
      qr: await qr(student.student_id), barcode: await barcode(student.student_id) });
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 }), chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      cards.forEach((card, index) => {
        if (index) doc.addPage();
        // Portrait ID: 54 x 86 mm on A4. Print at 100% scale.
        doc.save().translate(24, 24).scale(153.07 / 320);
        const minimal = org.template_id === 'minimal', modern = org.template_id === 'modern';
        const ink = minimal ? '#17212b' : org.text_color;
        doc.rect(0, 0, 320, 509.63).fill(minimal ? '#ffffff' : org.background_color);
        if (logo && !minimal) { doc.save().rect(0, 0, 320, 509.63).clip().opacity(0.15).image(logo, 0, 0, { cover: [320, 509.63] }).restore(); }
        if (modern) doc.rect(0, 0, 320, 9).fill(ink);
        if (logo) doc.image(logo, 18, 18, { fit: [45, 45] });
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text(org.name, 70, 20, { width: 230, height: 38, ellipsis: true });
        doc.font('Helvetica').fontSize(10).text(org.tagline || '', 70, 59, { width: 230, height: 14, ellipsis: true });
        if (card.photo) doc.image(card.photo, 116, 83, { fit: [88, 92], align: 'center', valign: 'center' });
        const student = card.student;
        doc.font('Helvetica-Bold').fontSize(19).text(student.name, 16, 185, { width: 288, height: 26, align: 'center', ellipsis: true });
        doc.font('Helvetica').fontSize(12).text(student.student_id, 16, 214, { width: 288, height: 18, align: 'center', ellipsis: true });
        const details = [['Father', student.father_name], ['Gender', student.gender], ['DOB', student.date_of_birth],
          ['Blood', student.blood_group], ['Phone', student.phone], ['Address', student.address]];
        let y = 242;
        for (const [label, value] of details) {
          if (value) { doc.fontSize(10).text(`${label}: ${value}`, 20, y, { width: 280, height: 24, ellipsis: true }); y += 23; }
        }
        doc.image(card.qr, 18, 402, { width: 78, height: 78 });
        doc.image(card.barcode, 110, 419, { fit: [188, 55] });
        doc.restore();
      });
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
module.exports = { qr, barcode, pdfCards };

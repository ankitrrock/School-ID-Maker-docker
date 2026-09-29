const ExcelJS = require('exceljs');
const {
  PLANS,
  TEMPLATES,
  problem,
  planOf,
  orgFor,
  usage,
  requireLimit,
  withOrganization,
} = require('./limits');
const CardDesign = require('../public/card-design');
const { qr, barcode, pdfCards } = require('./cards');

async function excelRows(buffer) {
  if (!Buffer.isBuffer(buffer)) throw problem(400, 'Upload an XLSX workbook.');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw problem(400, 'Unable to read the XLSX workbook.');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw problem(400, 'The workbook has no worksheet.');
  if (sheet.rowCount > 5001) throw problem(400, 'Upload at most 5,000 student rows.');
  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col] = cell.text.trim();
  });
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const values = {};
    row.eachCell((cell, col) => {
      if (headers[col])
        values[headers[col]] =
          cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : cell.text.trim();
    });
    const get = (...keys) =>
      keys.map((key) => values[key]).find((value) => value !== undefined) || '';
    rows.push({
      studentId: get('student_id', 'studentId', 'Student ID', 'Roll No'),
      name: get('name', 'Name', 'Student Name'),
      dateOfBirth: get('date_of_birth', 'dateOfBirth', 'DOB'),
      gender: get('gender', 'Gender'),
      bloodGroup: get('blood_group', 'bloodGroup', 'Blood Group'),
      fatherName: get('father_name', 'fatherName', 'Father Name'),
      phone: get('phone', 'Phone'),
      address: get('address', 'Address'),
      photoUrl: get('photo_url', 'photoUrl') || null,
    });
  });
  return rows;
}
async function insertStudent(db, org, sectionId, student, storage) {
  const name = String(student.name || '').trim(),
    id = String(student.studentId || '').trim();
  if (!name || !id || name.length > 150 || id.length > 100 || !/^[\x20-\x7e]+$/.test(id))
    throw problem(400, 'Name and a printable student ID (up to 100 characters) are required.');
  const photo = await storage.validateUrl(db, org.user_id, student.photoUrl);
  const result = await db.query(
    `insert into students(section_id,student_id,name,date_of_birth,gender,blood_group,father_name,phone,address,photo_url)
    select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 where exists(select 1 from sections s join classes c on c.id=s.class_id
    where s.id=$1 and c.organization_id=$11) returning *`,
    [
      sectionId,
      id,
      name,
      String(student.dateOfBirth || '').slice(0, 30),
      String(student.gender || '').slice(0, 30),
      String(student.bloodGroup || '').slice(0, 10),
      String(student.fatherName || '').slice(0, 150),
      String(student.phone || '').slice(0, 50),
      String(student.address || '').slice(0, 500),
      photo,
      org.id,
    ],
  );
  if (!result.rows[0]) throw problem(404, 'Section not found.');
  return result.rows[0];
}
function registerProductRoutes(app, pool, auth, upload, storage) {
  app.get('/api/plans', (req, res) => res.json({ plans: PLANS, templates: TEMPLATES }));
  app.get('/api/usage', auth, async (req, res) => {
    const org = await orgFor(pool, req.user.id);
    if (!org) throw problem(404, 'Organization not found.');
    res.json({ plan: org.plan, planDetails: planOf(org), usage: await usage(pool, org.id) });
  });
  app.get('/api/templates', auth, async (req, res) => {
    const org = await orgFor(pool, req.user.id);
    res.json({ templates: TEMPLATES.slice(0, planOf(org).templates) });
  });
  app.put('/api/templates', auth, async (req, res) => {
    const org = await withOrganization(pool, req.user.id, async (db, org) => {
      if (
        !TEMPLATES.slice(0, planOf(org).templates).some(
          (template) => template.id === req.body.templateId,
        )
      )
        throw problem(400, 'Choose one of the five card designs.');
      return (
        await db.query('update organizations set template_id=$2 where id=$1 returning *', [
          org.id,
          req.body.templateId,
        ])
      ).rows[0];
    });
    res.json({
      organization: {
        ...org,
        image_url: storage.stableUrl(org.image_url),
        background_image_url: storage.stableUrl(org.background_image_url),
      },
    });
  });
  app.put('/api/card-design', auth, async (req, res) => {
    let design;
    try {
      design = CardDesign.validate(req.body?.cardDesign);
    } catch (error) {
      throw problem(400, error.message);
    }
    if (!TEMPLATES.some((template) => template.id === req.body.templateId))
      throw problem(400, 'Choose a valid card design.');
    if (
      ![req.body.backgroundColor, req.body.textColor].every(
        (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
      )
    )
      throw problem(400, 'Choose valid background and text colors.');
    const org = await withOrganization(
      pool,
      req.user.id,
      async (db, org) =>
        (
          await db.query(
            'update organizations set template_id=$2,card_design=$3,background_color=$4,text_color=$5,updated_at=now() where id=$1 returning *',
            [
              org.id,
              req.body.templateId,
              JSON.stringify(design),
              req.body.backgroundColor,
              req.body.textColor,
            ],
          )
        ).rows[0],
    );
    res.json({
      organization: {
        ...org,
        image_url: storage.stableUrl(org.image_url),
        background_image_url: storage.stableUrl(org.background_image_url),
      },
    });
  });
  app.post(
    ['/api/uploads', '/api/assets/upload'],
    auth,
    upload.single('image'),
    async (req, res) => {
      if (!req.file) throw problem(400, 'Image is required.');
      const asset = await storage.uploadAsset(req.file.buffer, req.file.mimetype, req.user.id);
      await pool.query(
        'insert into asset_uploads(user_id,media_type,size_bytes) values($1,$2,$3)',
        [req.user.id, req.file.mimetype, req.file.size],
      );
      res.status(201).json(asset);
    },
  );
  app.get('/api/assets/file', auth, async (req, res) => {
    const buffer = await storage.read(
      pool,
      req.user.id,
      '/api/assets/file?path=' + encodeURIComponent(String(req.query.path || '')),
    );
    res.set('Cache-Control', 'private, no-store').type('png').send(buffer);
  });
  app.post('/api/assets/student/:studentId', auth, upload.single('image'), async (req, res) => {
    if (!req.file) throw problem(400, 'Image is required.');
    const result = await withOrganization(pool, req.user.id, async (db, org) => {
      const check = await db.query(
        `select st.id from students st join sections s on s.id=st.section_id join classes c on c.id=s.class_id
        where st.id=$1 and c.organization_id=$2`,
        [req.params.studentId, org.id],
      );
      if (!check.rows.length) throw problem(404, 'Student not found.');
      const asset = await storage.uploadAsset(req.file.buffer, req.file.mimetype, req.user.id);
      await db.query('insert into asset_uploads(user_id,media_type,size_bytes) values($1,$2,$3)', [
        req.user.id,
        req.file.mimetype,
        req.file.size,
      ]);
      await db.query('update students set photo_url=$2 where id=$1', [
        req.params.studentId,
        asset.url,
      ]);
      return asset;
    });
    res.status(201).json(result);
  });
  app.post('/api/bulk-import/:sectionId', auth, async (req, res) => {
    const result = await withOrganization(pool, req.user.id, async (db, org) => {
      if (!planOf(org).bulkExcel) throw problem(402, 'Bulk Excel import is available on Pro.');
      const rows = await excelRows(req.body);
      if (!rows.length || rows.length > 5000)
        throw problem(400, 'Upload between 1 and 5,000 student rows.');
      await requireLimit(db, org, 'students', rows.length);
      for (const row of rows) await insertStudent(db, org, req.params.sectionId, row, storage);
      return { inserted: rows.length, failed: 0, total: rows.length };
    });
    res.json(result);
  });
  // Browser printing and downloads share this server-authorized generation path.
  app.post('/api/bulk-cards', auth, async (req, res) => {
    const ids = req.body.studentIds;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => typeof id !== 'string')
    )
      throw problem(400, 'Select between 1 and 100 students.');
    if (new Set(ids).size !== ids.length) throw problem(400, 'Select each student only once.');
    const pdf = await withOrganization(pool, req.user.id, async (db, org) => {
      await requireLimit(db, org, 'cards', ids.length);
      const result = await db.query(
        `select st.* from students st join sections s on s.id=st.section_id join classes c on c.id=s.class_id
        where st.id=any($1::uuid[]) and c.organization_id=$2`,
        [ids, org.id],
      );
      if (result.rows.length !== ids.length) throw problem(404, 'Student not found.');
      const students = ids.map((id) => result.rows.find((student) => student.id === id));
      const buffer = await pdfCards(students, org, db, req.user.id, storage);
      await db.query(
        'update usage_counters set cards_generated=cards_generated+$2,updated_at=now() where organization_id=$1',
        [org.id, ids.length],
      );
      return buffer;
    });
    res
      .type('application/pdf')
      .set('Content-Disposition', 'inline; filename=id-cards.pdf')
      .send(pdf);
  });
  for (const [name, generate] of [
    ['qr', qr],
    ['barcode', barcode],
  ]) {
    app.get('/api/' + name, auth, async (req, res) => {
      const value = String(req.query.value || '');
      if (!value || value.length > 100 || !/^[\x20-\x7e]+$/.test(value))
        throw problem(400, 'Provide a printable student ID up to 100 characters.');
      const buffer = await generate(value);
      if (req.query.format === 'png') res.type('png').send(buffer);
      else res.json({ dataUrl: 'data:image/png;base64,' + buffer.toString('base64') });
    });
  }
  app.post('/api/billing/cod', auth, async (req, res) => {
    const request = await withOrganization(pool, req.user.id, async (db, org) => {
      if (org.plan === 'pro') throw problem(409, 'Pro is already active.');
      if (
        (
          await db.query(
            "select id from payment_requests where organization_id=$1 and status='pending'",
            [org.id],
          )
        ).rows.length
      )
        throw problem(409, 'An activation request is already pending.');
      return (
        await db.query(
          `insert into payment_requests(organization_id,user_id,plan_code,amount,status,note)
        values($1,$2,'pro',$3,'pending',$4) returning *`,
          [
            org.id,
            req.user.id,
            PLANS.pro.price,
            String(req.body.note || 'COD / manual payment request').slice(0, 1000),
          ],
        )
      ).rows[0];
    });
    res.status(201).json({
      request,
      message: 'An administrator must approve your payment before Pro activates.',
    });
  });
  app.get('/api/billing/status', auth, async (req, res) => {
    const org = await orgFor(pool, req.user.id);
    if (!org) throw problem(404, 'Organization not found.');
    const result = await pool.query(
      'select * from payment_requests where organization_id=$1 order by created_at desc limit 5',
      [org.id],
    );
    res.json({
      plan: org.plan,
      subscriptionStatus: org.subscription_status,
      requests: result.rows,
    });
  });
  app.post('/api/admin/payment-requests/:id/:action', async (req, res) => {
    if (!['approve', 'reject'].includes(req.params.action)) throw problem(404, 'Action not found.');
    const db = await pool.connect();
    try {
      await db.query('begin');
      const payment = (
        await db.query('select * from payment_requests where id=$1 for update', [req.params.id])
      ).rows[0];
      if (!payment) throw problem(404, 'Payment request not found.');
      if (payment.status !== 'pending')
        throw problem(409, 'This request has already been processed.');
      const status = req.params.action === 'approve' ? 'approved' : 'rejected';
      await db.query(
        'update payment_requests set status=$2,approved_at=now(),approved_by=$3 where id=$1',
        [payment.id, status, req.user.id],
      );
      if (status === 'approved')
        await db.query(
          "update organizations set plan='pro',subscription_status='manual_active' where id=$1",
          [payment.organization_id],
        );
      await db.query('commit');
      res.json({ ok: true });
    } catch (error) {
      await db.query('rollback');
      throw error;
    } finally {
      db.release();
    }
  });
}
module.exports = { registerProductRoutes, insertStudent, excelRows };

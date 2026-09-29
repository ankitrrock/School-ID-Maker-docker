const path = require('node:path');
const { rateLimit } = require('express-rate-limit');
const PRODUCTS = require('../public/print-products');
const { problem } = require('./limits');
const STATUSES = ['new', 'contacted', 'quoted', 'closed'];
async function initPrintDb(pool) {
  await pool.query(`create table if not exists print_enquiries (
    id uuid primary key default gen_random_uuid(), product_id text not null, product_option text not null,
    name text not null, phone text not null, email text not null default '', city text not null,
    quantity integer not null check(quantity > 0 and quantity <= 100000), details text not null default '',
    status text not null default 'new' check(status in ('new','contacted','quoted','closed')),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  )`);
}
function validateEnquiry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw problem(400, 'Enter your printing requirements.');
  const product = PRODUCTS.find(product => product.id === body.productId);
  if (!product || !product.options.includes(body.productOption)) throw problem(400, 'Choose a product and print option.');
  const clean = (key, max, required = false) => {
    if (typeof body[key] !== 'string' || body[key].trim().length > max || (required && !body[key].trim())) throw problem(400, `Enter a valid ${key} (up to ${max} characters).`);
    return body[key].trim();
  };
  const name = clean('name', 100, true), phone = clean('phone', 24, true), city = clean('city', 100, true);
  const email = body.email ? clean('email', 254) : '', details = body.details ? clean('details', 2000) : '';
  if (!/^[+\d ()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 10 || phone.replace(/\D/g, '').length > 15) throw problem(400, 'Enter a phone number with 10 to 15 digits.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw problem(400, 'Enter a valid email address.');
  if (!Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 100000) throw problem(400, 'Quantity must be between 1 and 100,000.');
  return { productId: product.id, productOption: body.productOption, name, phone, email, city, quantity: body.quantity, details };
}
function registerPrintRoutes(app, pool, auth) {
  app.get('/printing', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'printing.html')));
  app.get('/api/printing/catalog', (req, res) => res.json({ name: process.env.PRINT_SHOP_NAME || 'Print Studio', products: PRODUCTS }));
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { message: 'Too many requests. Please try again in 15 minutes.' } });
  app.post('/api/printing/enquiries', limiter, async (req, res) => {
    const input = validateEnquiry(req.body);
    const result = await pool.query(`insert into print_enquiries(product_id,product_option,name,phone,email,city,quantity,details)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning id`, [input.productId, input.productOption, input.name, input.phone, input.email, input.city, input.quantity, input.details]);
    res.status(201).json({ id: result.rows[0].id, message: 'Your quote request has been received by the print shop.' });
  });
  const admin = (req, res, next) => { if (req.user.role !== 'admin') throw problem(403, 'Admin access required.'); next(); };
  app.get('/api/admin/print-enquiries', auth, admin, async (req, res) => {
    const status = req.query.status || '';
    if (status && !STATUSES.includes(status)) throw problem(400, 'Invalid enquiry status.');
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw problem(400, 'Invalid page.');
    const result = await pool.query("select * from print_enquiries where ($1='' or status=$1) order by created_at desc,id desc limit 25 offset $2", [status, (page - 1) * 25]);
    const total = (await pool.query("select count(*)::int total from print_enquiries where ($1='' or status=$1)", [status])).rows[0].total;
    res.set('Cache-Control', 'no-store').json({ enquiries: result.rows, total, page });
  });
  app.patch('/api/admin/print-enquiries/:id', auth, admin, async (req, res) => {
    if (!STATUSES.includes(req.body?.status)) throw problem(400, 'Choose a valid enquiry status.');
    const result = await pool.query('update print_enquiries set status=$2,updated_at=now() where id=$1 returning id,status', [req.params.id, req.body.status]);
    if (!result.rows.length) throw problem(404, 'Enquiry not found.');
    res.json({ enquiry: result.rows[0] });
  });
}
module.exports = { registerPrintRoutes, initPrintDb, validateEnquiry };

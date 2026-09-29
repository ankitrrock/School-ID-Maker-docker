const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const { rateLimit } = require("express-rate-limit");
const { Pool } = require("pg");
const { registerProductRoutes, insertStudent } = require("./product");
const { registerPrintRoutes, initPrintDb } = require("./printing");
const { initAdminDb, registerAdminRoutes } = require("./admin");
const { createStorage } = require("./storage");
const { problem, requireLimit, withOrganization } = require("./limits");

async function initDb(pool) {
  await pool.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      email text unique not null,
      password_hash text not null,
      role text not null default 'user',
      created_at timestamptz not null default now()
    );
    create table if not exists organizations (
      id uuid primary key default gen_random_uuid(),
      user_id uuid unique not null references users(id) on delete cascade,
      organization_type text not null default 'school',
      name text not null,
      tagline text not null default '',
      address text not null default '',
      phone text not null default '',
      academic_year text not null default '',
      image_url text,
      background_color text not null default '#ffffff',
      text_color text not null default '#111827',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists classes (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references organizations(id) on delete cascade,
      name text not null,
      unique(organization_id,name)
    );
    create table if not exists sections (
      id uuid primary key default gen_random_uuid(),
      class_id uuid not null references classes(id) on delete cascade,
      name text not null,
      unique(class_id,name)
    );
    create table if not exists students (
      id uuid primary key default gen_random_uuid(),
      section_id uuid not null references sections(id) on delete cascade,
      student_id text not null,
      name text not null,
      date_of_birth text default '',
      gender text default '',
      blood_group text default '',
      father_name text default '',
      phone text default '',
      address text default '',
      photo_url text,
      created_at timestamptz not null default now(),
      unique(section_id,student_id)
    );
  `);
  await pool.query("alter table users add column if not exists role text not null default 'user'");
  await pool.query("alter table organizations add column if not exists plan text not null default 'free', add column if not exists subscription_status text not null default 'inactive', add column if not exists template_id text not null default 'classic'");
  await pool.query("create table if not exists usage_counters (organization_id uuid primary key references organizations(id) on delete cascade, students_count integer not null default 0, cards_generated integer not null default 0, updated_at timestamptz not null default now())");
  await pool.query("create table if not exists payment_requests (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade, user_id uuid not null references users(id) on delete cascade, plan_code text not null, amount numeric(12,2) not null default 0, status text not null default 'pending', note text not null default '', approved_at timestamptz, approved_by uuid references users(id), created_at timestamptz not null default now())");
  await pool.query("alter table organizations add column if not exists card_design jsonb not null default '{}'::jsonb");
  // Split the former combined image once; subsequent starts preserve removed backgrounds.
  await pool.query(`do $$ begin
    if not exists (select 1 from information_schema.columns where table_schema=current_schema()
      and table_name='organizations' and column_name='background_image_url') then
      alter table organizations add column background_image_url text;
      update organizations set background_image_url=image_url;
    end if;
  end $$`);
  await initPrintDb(pool);
  await initAdminDb(pool);
  if(process.env.ADMIN_EMAIL) await pool.query("update users set role='admin' where email=$1",[process.env.ADMIN_EMAIL.toLowerCase()]);
}

function createApp({ pool, jwtSecret = process.env.JWT_SECRET, storage = createStorage(), authLimit = 30 } = {}) {
  if (!jwtSecret || jwtSecret.length < 32 || /replace-with|change-this|dev-only/.test(jwtSecret)) {
    throw new Error('JWT_SECRET must be a random secret of at least 32 characters.');
  }
  const app = express();
  app.disable('x-powered-by');
  // Set only when the deployment has a known number of trusted proxy hops.
  if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  const cookie = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/bulk-import', express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '10mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'same-origin'); next(); });
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { message: 'Too many sign-in attempts. Try again later.' } });
  app.use(['/api/auth/signup', '/api/auth/login'], limiter);
  app.get('/api/healthz', async (req, res) => { await pool.query('select 1'); res.json({ status: 'ok' }); });
  async function auth(req, res, next) {
    let claims;
    try { claims = jwt.verify(req.cookies.sid, jwtSecret, { algorithms: ['HS256'] }); }
    catch { throw problem(401, 'Please login first.'); }
    if (typeof claims.id !== 'string' || !/^[a-f0-9-]{36}$/.test(claims.id)) throw problem(401, 'Please login first.');
    const user = (await pool.query('select id,name,email,role from users where id=$1', [claims.id])).rows[0];
    if (!user) throw problem(401, 'Please login first.');
    req.user = user;
    next();
  }
  registerAdminRoutes(app,pool,auth);
  function sign(user) { return jwt.sign({ id: user.id }, jwtSecret, { expiresIn: '7d', algorithm: 'HS256' }); }
  function clean(value) { return String(value ?? '').trim(); }
  function validColor(value, fallback) { return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback; }

app.post("/api/auth/signup", async (req,res)=>{
  try {
    const name=clean(req.body.name), email=clean(req.body.email).toLowerCase(), password=String(req.body.password||"");
    if(!name || name.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || Buffer.byteLength(password) > 72) return res.status(400).json({message:"Name, valid email and password of 8–72 bytes are required."});
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query("insert into users(name,email,password_hash) values($1,$2,$3) returning id,name,email,role",[name,email,hash]);
    res.cookie("sid",sign(r.rows[0]),{...cookie,maxAge:7*86400000});
    res.status(201).json({user:r.rows[0]});
  } catch(e){ if(e.code==="23505") return res.status(409).json({message:"Email already registered."}); console.error(e); res.status(500).json({message:"Signup failed."}); }
});
app.post("/api/auth/login", async (req,res)=>{
  const email=clean(req.body.email).toLowerCase(), password=String(req.body.password||"");
  const r=await pool.query("select id,name,email,password_hash,role from users where email=$1",[email]);
  if(!r.rows[0] || !(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({message:"Invalid email or password."});
  await pool.query("update users set last_login_at=now() where id=$1",[r.rows[0].id]);
  const u={id:r.rows[0].id,name:r.rows[0].name,email:r.rows[0].email,role:r.rows[0].role};
  res.cookie("sid",sign(u),{...cookie,maxAge:7*86400000});
  res.json({user:u});
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("sid",cookie);res.json({ok:true});});
app.get("/api/auth/me",auth,async(req,res)=>res.json({user:req.user}));
registerProductRoutes(app,pool,auth,upload,storage);
registerPrintRoutes(app,pool,auth);

app.get("/api/organization",auth,async(req,res)=>{
  const r=await pool.query("select * from organizations where user_id=$1",[req.user.id]);
  const org = r.rows[0];
  res.json({organization:org ? {...org,image_url:storage.stableUrl(org.image_url),background_image_url:storage.stableUrl(org.background_image_url)} : null});
});
app.put("/api/organization",auth,async(req,res)=>{
  const type=["school","college","individual"].includes(clean(req.body.organizationType))?clean(req.body.organizationType):"school";
  const name=clean(req.body.name);
  if(!name || name.length > 150) return res.status(400).json({message:"Organization name is required."});
  const values=[req.user.id,type,name,clean(req.body.tagline),clean(req.body.address),clean(req.body.phone),clean(req.body.academicYear),await storage.validateUrl(pool,req.user.id,req.body.imageUrl),validColor(req.body.backgroundColor,"#ffffff"),validColor(req.body.textColor,"#111827"),await storage.validateUrl(pool,req.user.id,req.body.backgroundImageUrl),Object.hasOwn(req.body,"backgroundImageUrl"),Object.hasOwn(req.body,"imageUrl")];
  const r=await pool.query(`
    insert into organizations(user_id,organization_type,name,tagline,address,phone,academic_year,image_url,background_color,text_color,background_image_url)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    on conflict(user_id) do update set organization_type=excluded.organization_type,name=excluded.name,tagline=excluded.tagline,
    address=excluded.address,phone=excluded.phone,academic_year=excluded.academic_year,
    image_url=case when $13 then excluded.image_url else organizations.image_url end,
    background_image_url=case when $12 then excluded.background_image_url else organizations.background_image_url end,
    background_color=excluded.background_color,text_color=excluded.text_color,updated_at=now()
    returning *`,values);
  res.json({organization:r.rows[0]});
});

async function orgId(req){ const r=await pool.query("select id from organizations where user_id=$1",[req.user.id]); return r.rows[0]?.id; }
app.get("/api/classes",auth,async(req,res)=>{
  const oid=await orgId(req); if(!oid)return res.json({classes:[]});
  const r=await pool.query(`select c.id,c.name,count(distinct s.id)::int section_count,count(st.id)::int student_count
    from classes c left join sections s on s.class_id=c.id left join students st on st.section_id=s.id
    where c.organization_id=$1 group by c.id order by c.name`,[oid]);
  res.json({classes:r.rows});
});
app.post("/api/classes",auth,async(req,res)=>{
  const oid=await orgId(req); if(!oid)return res.status(400).json({message:"Complete organization setup first."});
  try{const r=await pool.query("insert into classes(organization_id,name) values($1,$2) returning *",[oid,clean(req.body.name)]);res.status(201).json({class:r.rows[0]});}
  catch(e){res.status(e.code==="23505"?409:500).json({message:e.code==="23505"?"Class already exists.":"Could not create class."});}
});
app.get("/api/classes/:id/sections",auth,async(req,res)=>{
  const oid=await orgId(req);
  const r=await pool.query(`select s.id,s.name,count(st.id)::int student_count from sections s left join students st on st.section_id=s.id
    where s.class_id=$1 and exists(select 1 from classes c where c.id=s.class_id and c.organization_id=$2)
    group by s.id order by s.name`,[req.params.id,oid]);
  res.json({sections:r.rows});
});
app.post("/api/classes/:id/sections",auth,async(req,res)=>{
  const oid=await orgId(req);
  try{const r=await pool.query(`insert into sections(class_id,name) select id,$2 from classes where id=$1 and organization_id=$3 returning *`,[req.params.id,clean(req.body.name),oid]);if(!r.rows[0])return res.status(404).json({message:"Class not found."});res.status(201).json({section:r.rows[0]});}
  catch(e){res.status(e.code==="23505"?409:500).json({message:e.code==="23505"?"Section already exists.":"Could not create section."});}
});
app.get("/api/sections/:id/students",auth,async(req,res)=>{
  const oid=await orgId(req);
  const r=await pool.query(`select st.* from students st where st.section_id=$1 and exists(
    select 1 from sections s join classes c on c.id=s.class_id where s.id=st.section_id and c.organization_id=$2) order by st.name`,[req.params.id,oid]);
  res.json({students:r.rows.map(student=>({...student,photo_url:storage.stableUrl(student.photo_url)}))});
});
app.post('/api/sections/:id/students', auth, async (req, res) => {
  const student = await withOrganization(pool, req.user.id, async (db, org) => {
    await requireLimit(db, org, 'students', 1);
    return insertStudent(db, org, req.params.id, req.body, storage);
  });
  res.status(201).json({ student });
});
app.delete('/api/students/:id', auth, async (req, res) => {
  await withOrganization(pool, req.user.id, async (db, org) => {
    const result = await db.query(`delete from students where id=$1 and exists(select 1 from sections s
      join classes c on c.id=s.class_id where s.id=students.section_id and c.organization_id=$2) returning id`, [req.params.id, org.id]);
    if (!result.rows.length) throw problem(404, 'Student not found.');
  });
  res.status(204).send();
});

app.use((req,res,next)=>{
  if (req.method === "GET" && !req.path.startsWith("/api/") && !req.path.startsWith("/uploads/")) {
    return res.sendFile(path.join(__dirname,"..","public","index.html"));
  }
  next();
});

app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.code === '23505' ? 409 : error.code === '22P02' ? 400 : error instanceof multer.MulterError ? 400 : error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ message: error.code === '23505' ? 'This record already exists.' : status >= 500 ? 'Unable to complete the request.' : error.code === '22P02' ? 'Invalid identifier.' : error.message });
});
return app;
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = createApp({ pool });
  initDb(pool).then(() => {
    const server = app.listen(process.env.PORT || 3000, () => console.log('School ID Maker is ready.'));
    const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  }).catch(error => { console.error(error); pool.end().finally(() => process.exit(1)); });
}
module.exports = { createApp, initDb };

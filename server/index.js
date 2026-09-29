const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const { registerProductRoutes } = require("./product");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";
const uploadDir = path.join(__dirname, "..", "data", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/school_id_maker" });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, ["image/jpeg","image/png","image/webp"].includes(file.mimetype))
});

app.use(express.json({limit:"10mb"}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

async function initDb() {
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
  if(process.env.ADMIN_EMAIL) await pool.query("update users set role='admin' where email=$1",[process.env.ADMIN_EMAIL.toLowerCase()]);
}

function auth(req,res,next) {
  const token = req.cookies.sid;
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({message:"Please login first."}); }
}
function sign(user){ return jwt.sign({id:user.id,email:user.email,name:user.name,role:user.role||"user"},JWT_SECRET,{expiresIn:"7d"}); }
function clean(v){ return String(v ?? "").trim(); }
function validColor(v, fallback){ return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback; }

app.post("/api/auth/signup", async (req,res)=>{
  try {
    const name=clean(req.body.name), email=clean(req.body.email).toLowerCase(), password=String(req.body.password||"");
    if(!name||!email||password.length<6) return res.status(400).json({message:"Name, valid email and password of at least 6 characters are required."});
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query("insert into users(name,email,password_hash) values($1,$2,$3) returning id,name,email",[name,email,hash]);
    res.cookie("sid",sign(r.rows[0]),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000});
    res.status(201).json({user:r.rows[0]});
  } catch(e){ if(e.code==="23505") return res.status(409).json({message:"Email already registered."}); console.error(e); res.status(500).json({message:"Signup failed."}); }
});
app.post("/api/auth/login", async (req,res)=>{
  const email=clean(req.body.email).toLowerCase(), password=String(req.body.password||"");
  const r=await pool.query("select id,name,email,password_hash,role from users where email=$1",[email]);
  if(!r.rows[0] || !(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({message:"Invalid email or password."});
  const u={id:r.rows[0].id,name:r.rows[0].name,email:r.rows[0].email,role:r.rows[0].role};
  res.cookie("sid",sign(u),{httpOnly:true,sameSite:"lax",secure:false,maxAge:7*86400000});
  res.json({user:u});
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("sid");res.json({ok:true});});
app.get("/api/auth/me",auth,async(req,res)=>res.json({user:req.user}));
registerProductRoutes(app,pool,auth,upload);

app.get("/api/organization",auth,async(req,res)=>{
  const r=await pool.query("select * from organizations where user_id=$1",[req.user.id]);
  res.json({organization:r.rows[0]||null});
});
app.post("/api/uploads",auth,upload.single("image"),async(req,res)=>{ if(!req.file)return res.status(400).json({message:"JPG, PNG or WEBP image is required."}); try{const a=await require("./product").uploadAsset(req.file.buffer,req.file.mimetype,"organizations/"+req.user.id,req.file.originalname);res.status(201).json({url:a.url,path:a.path});}catch(e){res.status(500).json({message:e.message});} });
app.put("/api/organization",auth,async(req,res)=>{
  const type=["school","college","individual"].includes(clean(req.body.organizationType))?clean(req.body.organizationType):"school";
  const name=clean(req.body.name);
  if(!name) return res.status(400).json({message:"Organization name is required."});
  const values=[req.user.id,type,name,clean(req.body.tagline),clean(req.body.address),clean(req.body.phone),clean(req.body.academicYear),req.body.imageUrl||null,validColor(req.body.backgroundColor,"#ffffff"),validColor(req.body.textColor,"#111827")];
  const r=await pool.query(`
    insert into organizations(user_id,organization_type,name,tagline,address,phone,academic_year,image_url,background_color,text_color)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict(user_id) do update set organization_type=excluded.organization_type,name=excluded.name,tagline=excluded.tagline,
    address=excluded.address,phone=excluded.phone,academic_year=excluded.academic_year,image_url=excluded.image_url,
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
  res.json({students:r.rows});
});
app.post("/api/sections/:id/students",auth,async(req,res)=>{
  const oid=await orgId(req);
  try{
    const r=await pool.query(`insert into students(section_id,student_id,name,date_of_birth,gender,blood_group,father_name,phone,address,photo_url)
      select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 where exists(
      select 1 from sections s join classes c on c.id=s.class_id where s.id=$1 and c.organization_id=$11) returning *`,
      [req.params.id,clean(req.body.studentId),clean(req.body.name),clean(req.body.dateOfBirth),clean(req.body.gender),clean(req.body.bloodGroup),clean(req.body.fatherName),clean(req.body.phone),clean(req.body.address),req.body.photoUrl||null,oid]);
    if(!r.rows[0])return res.status(404).json({message:"Section not found."});res.status(201).json({student:r.rows[0]});
  }catch(e){res.status(e.code==="23505"?409:500).json({message:e.code==="23505"?"Student ID already exists in this section.":"Could not create student."});}
});
app.delete("/api/students/:id",auth,async(req,res)=>{
  const oid=await orgId(req);
  const r=await pool.query(`delete from students where id=$1 and exists(select 1 from sections s join classes c on c.id=s.class_id where s.id=students.section_id and c.organization_id=$2) returning id`,[req.params.id,oid]);
  if(!r.rows[0])return res.status(404).json({message:"Student not found."});res.status(204).send();
});

app.use((req,res,next)=>{
  if (req.method === "GET" && !req.path.startsWith("/api/") && !req.path.startsWith("/uploads/")) {
    return res.sendFile(path.join(__dirname,"..","public","index.html"));
  }
  next();
});

initDb().then(()=>app.listen(PORT,()=>console.log(`School ID Maker running on http://localhost:${PORT}`))).catch(e=>{console.error(e);process.exit(1)});

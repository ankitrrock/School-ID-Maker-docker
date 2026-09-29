const crypto = require("crypto");
const QRCode = require("qrcode");
const bwipjs = require("bwip-js");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const PLANS = {
  free: { name:"Free", students:50, cards:50, templates:1, bulkExcel:false, price:0 },
  pro:  { name:"Pro", students:5000, cards:5000, templates:3, bulkExcel:true, price:499 }
};
const TEMPLATES = [
  {id:"classic",name:"Classic",description:"Clean professional portrait"},
  {id:"modern",name:"Modern",description:"Bold accent layout"},
  {id:"minimal",name:"Minimal",description:"Simple white layout"}
];

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
 ? createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
 : null;

function planOf(org){ return PLANS[org?.plan] || PLANS.free; }
async function orgFor(pool,userId){const r=await pool.query("select * from organizations where user_id=$1",[userId]);return r.rows[0];}
async function usage(pool,orgId){
 await pool.query("insert into usage_counters(organization_id) values($1) on conflict do nothing",[orgId]);
 return (await pool.query("select * from usage_counters where organization_id=$1",[orgId])).rows[0];
}
async function requireLimit(pool,org,field,n){
 const u=await usage(pool,org.id), limit=planOf(org)[field];
 const current=field==="students"?u.students_count:u.cards_generated;
 if(current+n>limit){const e=new Error(\`Your \${planOf(org).name} plan allows \${limit} \${field}. Upgrade to Pro or contact the administrator.\`);e.status=402;throw e;}
 return u;
}
async function uploadAsset(buffer,mime,folder,originalName){
 if(!supabase) throw new Error("Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
 const bucket=process.env.SUPABASE_BUCKET||"id-card-assets";
 const safe=String(originalName||"image").replace(/[^a-zA-Z0-9._-]/g,"-");
 const path=\`\${folder}/\${Date.now()}-\${crypto.randomBytes(6).toString("hex")}-\${safe}\`;
 const {error}=await supabase.storage.from(bucket).upload(path,buffer,{contentType:mime,upsert:false,cacheControl:"3600"});
 if(error)throw error;
 const signed=await supabase.storage.from(bucket).createSignedUrl(path,60*60*24*7);
 return {path,url:signed.data?.signedUrl||null};
}
function excelRows(buf){
 const wb=XLSX.read(buf,{type:"buffer"}), ws=wb.Sheets[wb.SheetNames[0]];
 return XLSX.utils.sheet_to_json(ws,{defval:""}).map(r=>({
 studentId:String(r.student_id??r.studentId??r["Student ID"]??r["Roll No"]??"").trim(),
 name:String(r.name??r.Name??r["Student Name"]??"").trim(),
 dateOfBirth:String(r.date_of_birth??r.dateOfBirth??r.DOB??"").trim(),
 gender:String(r.gender??r.Gender??"").trim(),
 bloodGroup:String(r.blood_group??r.bloodGroup??r["Blood Group"]??"").trim(),
 fatherName:String(r.father_name??r.fatherName??r["Father Name"]??"").trim(),
 phone:String(r.phone??r.Phone??"").trim(),
 address:String(r.address??r.Address??"").trim(),
 photoUrl:String(r.photo_url??r.photoUrl??"").trim()||null
 })).filter(x=>x.studentId&&x.name);
}
async function qr(value){return QRCode.toDataURL(String(value),{width:240,margin:1});}
async function barcode(value){const b=await bwipjs.toBuffer({bcid:"code128",text:String(value),scale:3,height:12,includetext:true});return "data:image/png;base64,"+b.toString("base64");}
function pdfCards(cards){
 return new Promise((resolve,reject)=>{
  const d=new PDFDocument({size:"A4",margin:24}),chunks=[];
  d.on("data",x=>chunks.push(x));d.on("end",()=>resolve(Buffer.concat(chunks)));d.on("error",reject);
  cards.forEach((c,i)=>{
   if(i)d.addPage();
   d.roundedRect(180,45,235,360,14).fillAndStroke(c.backgroundColor||"#fff","#d1d5db");
   d.fillColor(c.textColor||"#111827").fontSize(16).text(c.organizationName||"Organization",195,68,{width:205,align:"center"});
   d.fontSize(20).text(c.name||"Student",195,175,{width:205,align:"center"});
   d.fontSize(11).text("ID: "+(c.studentId||""),195,208,{width:205,align:"center"});
   d.fontSize(10).text("Blood: "+(c.bloodGroup||"—"),195,232,{width:205,align:"center"});
   d.fontSize(9).text("School ID Maker",195,382,{width:205,align:"center"});
  }); d.end();
 });
}
function admin(req){return req.user?.role==="admin";}
function registerProductRoutes(app,pool,auth,upload){
 app.get("/api/plans",(req,res)=>res.json({plans:PLANS,templates:TEMPLATES}));

 app.get("/api/usage",auth,async(req,res)=>{
  const org=await orgFor(pool,req.user.id);if(!org)return res.status(404).json({message:"Organization not found."});
  res.json({plan:org.plan||"free",planDetails:planOf(org),usage:await usage(pool,org.id)});
 });

 app.get("/api/templates",auth,async(req,res)=>{
  const org=await orgFor(pool,req.user.id);res.json({templates:TEMPLATES.slice(0,planOf(org).templates)});
 });

 app.post("/api/assets/upload",auth,upload.single("image"),async(req,res)=>{
  if(!req.file)return res.status(400).json({message:"Image is required."});
  try{res.status(201).json(await uploadAsset(req.file.buffer,req.file.mimetype,"organizations/"+req.user.id,req.file.originalname));}
  catch(e){res.status(500).json({message:e.message});}
 });

 app.post("/api/assets/student/:studentId",auth,upload.single("image"),async(req,res)=>{
  if(!req.file)return res.status(400).json({message:"Image is required."});
  try{
   const org=await orgFor(pool,req.user.id);
   const check=await pool.query("select st.id from students st join sections s on s.id=st.section_id join classes c on c.id=s.class_id where st.id=$1 and c.organization_id=$2",[req.params.studentId,org?.id]);
   if(!check.rows[0])return res.status(404).json({message:"Student not found."});
   const a=await uploadAsset(req.file.buffer,req.file.mimetype,"students/"+req.params.studentId,req.file.originalname);
   await pool.query("update students set photo_url=$2 where id=$1",[req.params.studentId,a.url]);
   res.status(201).json(a);
  }catch(e){res.status(500).json({message:e.message});}
 });

 app.post("/api/bulk-import/:sectionId",auth,express.raw({type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",limit:"10mb"}),async(req,res)=>{
  try{
   const org=await orgFor(pool,req.user.id);if(!org)return res.status(404).json({message:"Organization not found."});
   if(!planOf(org).bulkExcel)return res.status(402).json({message:"Bulk Excel import is available on Pro."});
   const rows=excelRows(req.body);await requireLimit(pool,org,"students",rows.length);
   let inserted=0,failed=0;
   for(const x of rows)try{
    const r=await pool.query(\`insert into students(section_id,student_id,name,date_of_birth,gender,blood_group,father_name,phone,address,photo_url)
      select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 where exists(select 1 from sections s join classes c on c.id=s.class_id where s.id=$1 and c.organization_id=$11) returning id\`,
      [req.params.sectionId,x.studentId,x.name,x.dateOfBirth,x.gender,x.bloodGroup,x.fatherName,x.phone,x.address,x.photoUrl,org.id]);
    if(r.rows[0])inserted++;else failed++;
   }catch{failed++}
   await pool.query("update usage_counters set students_count=students_count+$2,updated_at=now() where organization_id=$1",[org.id,inserted]);
   res.json({inserted,failed,total:rows.length});
  }catch(e){res.status(e.status||500).json({message:e.message});}
 });

 app.post("/api/bulk-cards",auth,async(req,res)=>{
  try{
   const org=await orgFor(pool,req.user.id);if(!org)return res.status(404).json({message:"Organization not found."});
   const students=Array.isArray(req.body.students)?req.body.students:[];if(!students.length)return res.status(400).json({message:"No students supplied."});
   await requireLimit(pool,org,"cards",students.length);
   const cards=students.map(s=>({...s,organizationName:org.name,backgroundColor:org.background_color,textColor:org.text_color}));
   const pdf=await pdfCards(cards);
   await pool.query("update usage_counters set cards_generated=cards_generated+$2,updated_at=now() where organization_id=$1",[org.id,cards.length]);
   res.type("application/pdf").set("Content-Disposition","attachment; filename=id-cards.pdf").send(pdf);
  }catch(e){res.status(e.status||500).json({message:e.message});}
 });

 app.get("/api/qr",auth,async(req,res)=>{try{res.json({dataUrl:await qr(req.query.value||"")})}catch(e){res.status(500).json({message:e.message})}});
 app.get("/api/barcode",auth,async(req,res)=>{try{res.json({dataUrl:await barcode(req.query.value||"")})}catch(e){res.status(500).json({message:e.message})}});

 // COD/manual activation: no online payment is charged.
 app.post("/api/billing/cod",auth,async(req,res)=>{
  const org=await orgFor(pool,req.user.id);if(!org)return res.status(404).json({message:"Organization not found."});
  const r=await pool.query(\`insert into payment_requests(organization_id,user_id,plan_code,amount,status,note)
    values($1,$2,'pro',$3,'pending',$4) returning *\`,[org.id,req.user.id,PLANS.pro.price, String(req.body.note||"COD / manual payment request")]);
  res.status(201).json({request:r.rows[0],message:"Payment request submitted. An administrator must approve it before Pro features activate."});
 });
 app.get("/api/billing/status",auth,async(req,res)=>{
  const org=await orgFor(pool,req.user.id);if(!org)return res.status(404).json({message:"Organization not found."});
  const r=await pool.query("select * from payment_requests where organization_id=$1 order by created_at desc limit 5",[org.id]);
  res.json({plan:org.plan||"free",subscriptionStatus:org.subscription_status||"inactive",requests:r.rows});
 });

 // Platform admin dashboard and manual approval.
 app.get("/api/admin/overview",auth,async(req,res)=>{
  if(!admin(req))return res.status(403).json({message:"Admin access required."});
  const [u,o,p,s]=await Promise.all([
   pool.query("select count(*)::int count from users"),
   pool.query("select count(*)::int count from organizations"),
   pool.query("select count(*)::int count from payment_requests where status='pending'"),
   pool.query("select count(*)::int count from organizations where plan='pro'")
  ]);
  res.json({users:u.rows[0].count,organizations:o.rows[0].count,pendingPayments:p.rows[0].count,proOrganizations:s.rows[0].count});
 });
 app.get("/api/admin/payment-requests",auth,async(req,res)=>{
  if(!admin(req))return res.status(403).json({message:"Admin access required."});
  const r=await pool.query(\`select p.*,o.name organization_name,u.email from payment_requests p join organizations o on o.id=p.organization_id join users u on u.id=p.user_id order by p.created_at desc\`);
  res.json({requests:r.rows});
 });
 app.post("/api/admin/payment-requests/:id/approve",auth,async(req,res)=>{
  if(!admin(req))return res.status(403).json({message:"Admin access required."});
  const c=await pool.connect();try{
   await c.query("begin");
   const p=(await c.query("select * from payment_requests where id=$1 for update",[req.params.id])).rows[0];
   if(!p)return res.status(404).json({message:"Payment request not found."});
   await c.query("update payment_requests set status='approved',approved_at=now(),approved_by=$2 where id=$1",[p.id,req.user.id]);
   await c.query("update organizations set plan='pro',subscription_status='manual_active' where id=$1",[p.organization_id]);
   await c.query("commit");res.json({ok:true});
  }catch(e){await c.query("rollback");res.status(500).json({message:e.message})}finally{c.release();}
 });
 app.post("/api/admin/payment-requests/:id/reject",auth,async(req,res)=>{
  if(!admin(req))return res.status(403).json({message:"Admin access required."});
  const r=await pool.query("update payment_requests set status='rejected',approved_at=now(),approved_by=$2 where id=$1 returning id",[req.params.id,req.user.id]);
  if(!r.rows[0])return res.status(404).json({message:"Payment request not found."});res.json({ok:true});
 });
}
module.exports={registerProductRoutes,PLANS,TEMPLATES};
const path=require('node:path');
const {rateLimit}=require('express-rate-limit');
const {problem,withOrganization,requireLimit}=require('./limits');
const Options=require('../public/print-options');
const Products=require('../public/print-products');
const Renderer=require('./print-render');
const COLUMNS='j.id,j.user_id,j.kind,j.product_id,j.title,j.quantity,j.layout,j.status,j.created_at,j.updated_at';
async function initPrintJobs(pool){
  await pool.query(`create table if not exists print_jobs (
    id uuid primary key default gen_random_uuid(),user_id uuid not null references users(id) on delete cascade,
    kind text not null check(kind in ('artwork','idcard')),product_id text not null,title text not null,
    quantity integer not null check(quantity between 1 and 100000),source jsonb not null,layout jsonb not null,
    status text not null default 'requested' check(status in ('requested','ready','printed','cancelled')),
    updated_by uuid references users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
  );create index if not exists print_jobs_owner_time on print_jobs(user_id,created_at desc,id desc)`);
}
function validate(body){
  let layout;try{layout=Options.validate(body?.layout);}catch(error){throw problem(400,error.message);}
  if(!Products.some(p=>p.id===body.productId))throw problem(400,'Choose a print product.');
  if(typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>150)throw problem(400,'Enter a title up to 150 characters.');
  if(!Number.isSafeInteger(body.quantity)||body.quantity<1||body.quantity>100000)throw problem(400,'Quantity must be between 1 and 100,000.');
  if(layout.copies>body.quantity)throw problem(400,'Batch copies cannot exceed the requested quantity.');
  return {layout,title:body.title.trim()};
}
async function jobFor(pool,id,user){
  const result=await pool.query('select * from print_jobs where id=$1 and (user_id=$2 or $3)',[id,user.id,user.role==='admin']);
  if(!result.rows[0])throw problem(404,'Print request not found.');return result.rows[0];
}
function registerPrintJobs(app,pool,auth,upload,storage){
  app.get('/orders',(req,res)=>res.sendFile(path.join(__dirname,'..','public','orders.html')));
  const limit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false,message:{message:'Too many print submissions. Please try again later.'}});
  app.post('/api/print-artwork',auth,limit,upload.single('image'),async(req,res)=>{
    if(!req.file)throw problem(400,'Upload JPG, PNG or WEBP artwork (up to 5 MB).');
    const asset=await storage.uploadAsset(req.file.buffer,req.file.mimetype,req.user.id,{original:true});
    await pool.query('insert into asset_uploads(user_id,media_type,size_bytes) values($1,$2,$3)',[req.user.id,req.file.mimetype,req.file.size]);
    res.status(201).json(asset);
  });
  app.post('/api/print-jobs',auth,limit,async(req,res)=>{
    const {layout,title}=validate(req.body);let kind='artwork',source,userId=req.user.id;
    if(req.body.studentId){
      if(req.body.productId!=='idcards')throw problem(400,'Student cards must use the ID card product.');
      const record=(await pool.query(`select st.*,o.user_id from students st join sections s on s.id=st.section_id join classes c on c.id=s.class_id join organizations o on o.id=c.organization_id where st.id=$1 and (o.user_id=$2 or $3)`,[req.body.studentId,req.user.id,req.user.role==='admin'])).rows[0];
      if(!record)throw problem(404,'Student not found.');
      userId=record.user_id;kind='idcard';
      const result=await withOrganization(pool,userId,async(db,org)=>{
        // Read the student again while holding the same lock used for student deletion.
        const student=(await db.query('select * from students where id=$1',[record.id])).rows[0];
        if(!student)throw problem(404,'Student not found.');
        await requireLimit(db,org,'cards',1);
        for(const url of [org.image_url,org.background_image_url,student.photo_url]){
          if(url&&!storage.assetPath(url))throw problem(400,'Upload card images to the app before requesting printing.');
        }
        source={org,student};
        const row=(await db.query(`insert into print_jobs(user_id,kind,product_id,title,quantity,source,layout) values($1,$2,$3,$4,$5,$6,$7) returning id`,[userId,kind,req.body.productId,title,req.body.quantity,JSON.stringify(source),JSON.stringify(layout)])).rows[0];
        await db.query('update usage_counters set cards_generated=cards_generated+1,updated_at=now() where organization_id=$1',[org.id]);
        return row;
      });
      return res.status(201).json(result);
    }
    if(!storage.assetPath(req.body.artworkUrl))throw problem(400,'Upload artwork before sending a print request.');
    source={artworkUrl:await storage.validateUrl(pool,userId,req.body.artworkUrl)};
    const result=await pool.query(`insert into print_jobs(user_id,kind,product_id,title,quantity,source,layout) values($1,$2,$3,$4,$5,$6,$7) returning id`,[userId,kind,req.body.productId,title,req.body.quantity,JSON.stringify(source),JSON.stringify(layout)]);
    res.status(201).json(result.rows[0]);
  });
  app.get('/api/print-jobs',auth,async(req,res)=>{
    const page=Number(req.query.page||1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw problem(400,'Invalid page.');
    const result=await pool.query(`select ${COLUMNS} from print_jobs j where j.user_id=$1 order by j.created_at desc,j.id desc limit 25 offset $2`,[req.user.id,(page-1)*25]);
    const total=(await pool.query('select count(*)::int total from print_jobs where user_id=$1',[req.user.id])).rows[0].total;
    res.set('Cache-Control','no-store').json({jobs:result.rows,total,page});
  });
  app.get('/api/print-jobs/:id',auth,async(req,res)=>{
    const job=await jobFor(pool,req.params.id,req.user);const {source,...details}=job;
    res.set('Cache-Control','no-store').json({job:details});
  });
  app.post('/api/print-jobs/:id/cancel',auth,async(req,res)=>{
    const result=await pool.query("update print_jobs set status='cancelled',updated_by=$2,updated_at=now() where id=$1 and user_id=$2 and status='requested' returning id",[req.params.id,req.user.id]);
    if(!result.rows.length)throw problem(409,'This request cannot be cancelled. It may already be prepared by the print shop.');
    res.json({ok:true});
  });
  // /api/admin is protected by the shared role guard registered before these routes.
  app.patch('/api/admin/print-jobs/:id',async(req,res)=>{
    if(!['ready','printed','cancelled'].includes(req.body?.status))throw problem(400,'Choose a valid print status.');
    const job=await jobFor(pool,req.params.id,req.user);
    let layout=job.layout;
    if(req.body.status==='ready'){
      try{layout=Options.validate(req.body.layout);}catch(error){throw problem(400,error.message);}
      if(layout.copies>job.quantity)throw problem(400,'Batch copies cannot exceed the requested quantity.');
      // Verify all stored assets are readable before marking the job ready.
      await Renderer.load({...job,layout},pool,storage);
    }
    const allowed=req.body.status==='printed'?['ready']:['requested','ready'];
    const result=await pool.query('update print_jobs set status=$2,layout=$3,updated_by=$4,updated_at=now() where id=$1 and status=any($5::text[]) returning id',[job.id,req.body.status,JSON.stringify(layout),req.user.id,allowed]);
    if(!result.rows.length)throw problem(409,'This job is already completed or cancelled.');
    res.json({ok:true});
  });
  for(const format of ['pdf','document'])app.get('/api/admin/print-jobs/:id/'+format,async(req,res)=>{
    const job=await jobFor(pool,req.params.id,req.user);
    if(!['ready','printed'].includes(job.status))throw problem(409,'Prepare this job before printing.');
    if(format==='pdf')res.type('pdf').set('Content-Disposition','attachment; filename=print-job.pdf').send(await Renderer.pdf(job,pool,storage));
    else res.type('html').send(await Renderer.html(job,pool,storage));
  });
  app.get('/api/admin/print-jobs/:id/image/:key',async(req,res)=>{
    const job=await jobFor(pool,req.params.id,req.user);
    if(!['artwork','logo','background','photo','qr','barcode'].includes(req.params.key))throw problem(404,'Image not found.');
    const image=await Renderer.imageFor(job,req.params.key,pool,storage);if(!image)throw problem(404,'Image not found.');
    res.type('png').send(image);
  });
}
module.exports={initPrintJobs,registerPrintJobs,validate};

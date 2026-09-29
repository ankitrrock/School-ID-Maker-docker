'use strict';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const query=new URLSearchParams(location.search);let me,job=null,page=1,lastUnit='mm';
const factor={mm:1,cm:10,in:25.4};
const mm=value=>Number(Number(value).toFixed(3));
async function api(path,options){const response=await fetch('/api/'+path,options),data=await response.json();if(!response.ok)throw Error(data.message||'Unable to complete the request.');return data;}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function error(message){$('error').textContent=message;$('error').hidden=!message;}
function layout(){return PrintOptions.validate({widthMm:Number($('width').value)*factor[$('unit').value],heightMm:Number($('height').value)*factor[$('unit').value],paper:$('paper').value,landscape:$('orientation').value==='landscape',marginMm:Number($('margin').value),fit:$('fit').value,copies:Number($('copies').value)});}
function summary(){try{const value=layout(),size=PrintOptions.pageSize(value);$('sizeSummary').textContent=`Item ${value.widthMm.toFixed(2)} × ${value.heightMm.toFixed(2)} mm · Page ${size[0].toFixed(2)} × ${size[1].toFixed(2)} mm · ${value.copies} page(s)`;}catch(e){$('sizeSummary').textContent=e.message;}}
function fillLayout(value){$('unit').value=lastUnit='mm';$('width').value=value.widthMm;$('height').value=value.heightMm;$('paper').value=value.paper||'match';$('orientation').disabled=$('paper').value==='match';$('orientation').value=value.landscape?'landscape':'portrait';$('margin').value=value.marginMm||0;$('fit').value=value.fit||'contain';$('copies').value=value.copies||1;summary();}
function presets(){const options=PrintOptions.presets.filter(p=>p.product===$('product').value);$('preset').innerHTML=options.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')+'<option value="custom">Custom dimensions</option>';if(options[0])fillLayout(options[0]);}
$('product').innerHTML=PrintProducts.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
$('paper').onchange=()=>{$('orientation').disabled=$('paper').value==='match';summary();};
$('product').onchange=presets;$('preset').onchange=()=>{const preset=PrintOptions.presets.find(p=>p.id===$('preset').value);if(preset)fillLayout(preset);};
$('unit').onchange=()=>{const unit=$('unit').value;for(const id of ['width','height'])$(id).value=+(Number($(id).value)*factor[lastUnit]/factor[unit]).toFixed(6);lastUnit=unit;summary();};
$('jobForm').addEventListener('input',summary);
async function history(){const data=await api('print-jobs?page='+page);$('jobList').innerHTML=data.jobs.map(item=>`<a class="job" href="/orders?job=${item.id}"><span><strong>${esc(item.title)}</strong><small>${mm(item.layout.widthMm)} × ${mm(item.layout.heightMm)} mm · ${item.quantity} requested</small></span><span class="badge">${esc(item.status)}</span></a>`).join('')||'<p>No print requests yet.</p>';$('pageInfo').textContent=`Page ${page} · ${data.total} requests`;$('previous').disabled=page===1;$('next').disabled=page*25>=data.total;}
async function loadJob(id){
 job=(await api('print-jobs/'+id)).job;$('jobPanel').hidden=false;$('jobHeading').textContent=job.title;$('jobDetails').textContent=`${job.product_id} · ${job.quantity} requested · ${mm(job.layout.widthMm)} × ${mm(job.layout.heightMm)} mm`;$('jobStatus').textContent='Status: '+job.status;
 const admin=me.role==='admin',editable=admin&&['requested','ready'].includes(job.status),prepared=['ready','printed'].includes(job.status);
 $('requestPanel').hidden=!editable;$('adminActions').hidden=!admin;$('cancelOwn').hidden=admin||job.status!=='requested';$('cancelAdmin').disabled=!editable;$('markPrinted').disabled=job.status!=='ready';
 $('openPrint').hidden=$('downloadPdf').hidden=!prepared;$('openPrint').href='/api/admin/print-jobs/'+id+'/document';$('downloadPdf').href='/api/admin/print-jobs/'+id+'/pdf';
 if(editable){$('formTitle').textContent='Choose size and prepare printing';$('jobTitle').value=job.title;$('jobTitle').disabled=true;$('product').value=job.product_id;$('product').disabled=true;presets();fillLayout(job.layout);$('preset').value='custom';$('quantity').value=job.quantity;$('quantity').disabled=true;$('artworkLabel').hidden=true;$('sourceHint').textContent=job.kind==='idcard'?'Uses the saved ID-card design from when the request was submitted.':'Uses the customer’s uploaded artwork.';$('saveJob').textContent='Prepare print job';}
}
async function enter(user){me=user;$('loginPanel').hidden=true;$('content').hidden=false;$('adminLink').hidden=user.role!=='admin';presets();
 if(query.get('student')){$('product').value='idcards';$('product').disabled=true;presets();if(query.get('orientation')==='landscape'){fillLayout(PrintOptions.presets.find(p=>p.id==='id-landscape'));$('preset').value='id-landscape';}$('artworkLabel').hidden=true;$('sourceHint').textContent='This request uses the selected student’s saved card design. One card generation is charged to the organization when submitted.';$('jobTitle').value='ID card print request';}
 await history();if(query.get('job'))await loadJob(query.get('job'));
}
$('jobForm').onsubmit=async event=>{
 event.preventDefault();error('');const button=$('saveJob');if(button.disabled)return;button.disabled=true;
 try{
  const settings=layout();
  if(job&&me.role==='admin'){await api('admin/print-jobs/'+job.id,json('PATCH',{layout:settings,status:'ready'}));await loadJob(job.id);$('notice').textContent='Ready. Open the print document to choose your printer.';return;}
  let artworkUrl;
  if(!query.get('student')){const file=$('artwork').files[0];if(!file)throw Error('Choose artwork first.');if(file.size>5*1024*1024)throw Error('Choose artwork up to 5 MB.');const form=new FormData();form.append('image',file);artworkUrl=(await api('print-artwork',{method:'POST',body:form})).url;}
  const created=await api('print-jobs',json('POST',{title:$('jobTitle').value,productId:$('product').value,quantity:Number($('quantity').value),layout:settings,artworkUrl,studentId:query.get('student')||undefined}));
  location.assign('/orders?job='+created.id);
 }catch(e){error(e.message);}finally{button.disabled=false;}
};
async function changeStatus(status){error('');if(status==='printed'&&!confirm('Confirm that the entire requested quantity has physically printed successfully?'))return;if(status==='cancelled'&&!confirm('Cancel this print request?'))return;try{await api('admin/print-jobs/'+job.id,json('PATCH',{status}));await loadJob(job.id);await history();}catch(e){error(e.message);}}
$('markPrinted').onclick=()=>changeStatus('printed');$('cancelAdmin').onclick=()=>changeStatus('cancelled');$('cancelOwn').onclick=async()=>{try{await api('print-jobs/'+job.id+'/cancel',{method:'POST'});await loadJob(job.id);await history();}catch(e){error(e.message);}};
$('previous').onclick=()=>{if(page>1){page--;history().catch(e=>error(e.message));}};$('next').onclick=()=>{page++;history().catch(e=>error(e.message));};$('newRequest').onclick=()=>location.assign('/orders');
$('login').onsubmit=async event=>{event.preventDefault();$('loginButton').disabled=true;try{error('');const data=await api('auth/login',json('POST',Object.fromEntries(new FormData(event.target))));event.target.reset();await enter(data.user);}catch(e){error(e.message);}finally{$('loginButton').disabled=false;}};
(async()=>{let session;try{session=await api('auth/me');}catch(e){$('loginPanel').hidden=false;return;}try{await enter(session.user);}catch(e){error(e.message);}})();

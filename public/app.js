const $=id=>document.getElementById(id);
const J=(m,b)=>({method:m,headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
const SAMPLE={name:"Aarav Sharma",student_id:"STU-1024",blood_group:"B+",date_of_birth:"2012-05-14",father_name:"Rohit Sharma",phone:"98765 43210"};
let mode="login",me=null,org=null,classes=[],secs={},openC=null,cur=null,students=[],sel=null,q="",pend=null,mFn=null;
function safeImage(value){
  if(typeof value!=="string")return "";
  if(value.startsWith("/api/assets/file?path="))return value;
  try{const u=new URL(value);return ["https:","blob:"].includes(u.protocol)?u.href:""}catch{return ""}
}
function imageSrc(value){return esc(safeImage(value))}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function toast(m,bad){const t=$("toast");t.textContent=m;t.className="toast"+(bad?" bad":"");t.style.display="block";clearTimeout(t._t);t._t=setTimeout(()=>t.style.display="none",2800)}
async function api(url,opt={}){const r=await fetch(url,{credentials:"include",...opt});const d=r.status===204?{}:await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||"Something went wrong. Please try again.");return d}
async function busy(btn,fn){btn.classList.add("busy");try{return await fn()}finally{btn.classList.remove("busy")}}
async function upload(inp){const f=inp.files[0];if(!f)return null;if(f.size>5*1024*1024)throw Error("Image is larger than 5 MB. Choose a smaller one.");const fd=new FormData();fd.append("image",f);return(await api("/api/uploads",{method:"POST",body:fd})).url}

/* ---- auth ---- */
function setMode(m){mode=m;$("loginTab").classList.toggle("on",m==="login");$("signupTab").classList.toggle("on",m==="signup");$("nameField").classList.toggle("hidden",m!=="signup");$("authName").required=m==="signup";$("authSubmit").textContent=m==="signup"?"Create account":"Log in";$("pwHint").textContent=m==="signup"?"At least 8 characters (maximum 72 bytes).":"";$("authErr").textContent=""}
$("loginTab").onclick=()=>setMode("login");$("signupTab").onclick=()=>setMode("signup");
$("pwShow").onclick=()=>{const p=$("authPassword"),s=p.type==="password";p.type=s?"text":"password";$("pwShow").textContent=s?"Hide":"Show"};
$("authForm").onsubmit=async e=>{e.preventDefault();$("authErr").textContent="";
  await busy($("authSubmit"),async()=>{try{const d=await api("/api/auth/"+(mode==="signup"?"signup":"login"),J("POST",{name:$("authName").value,email:$("authEmail").value,password:$("authPassword").value}));me=d.user;await enter()}catch(x){$("authErr").textContent=x.message}})};
$("logoutBtn").onclick=async()=>{await api("/api/auth/logout",{method:"POST"}).catch(()=>{});location.reload()};
async function enter(){$("authView").classList.add("hidden");$("appView").classList.remove("hidden");$("hello").textContent=me.name;
  org=(await api("/api/organization")).organization;
  if(!org){showSetup(true)}else{show("dash");await loadClasses()}}

/* ---- views ---- */
function show(v){$("setupView").classList.toggle("hidden",v!=="setup");$("dashView").classList.toggle("hidden",v!=="dash");$("navDash").classList.toggle("on",v==="dash");$("navSetup").classList.toggle("on",v==="setup");
  if(v==="setup")showSetup(false)}
function showSetup(first){$("productPanel").classList.add("hidden");$("nav").classList.toggle("hidden",first);$("orgCancel").classList.toggle("hidden",first);
  $("setupTitle").textContent=first?"Welcome. Let's set up your organization":"Organization settings";
  $("setupView").classList.remove("hidden");$("dashView").classList.add("hidden");
  if(org){document.querySelector(`input[name=otype][value=${org.organization_type}]`).checked=true;$("orgName").value=org.name;$("orgTagline").value=org.tagline;$("orgYear").value=org.academic_year;$("orgPhone").value=org.phone;$("orgAddress").value=org.address;$("bgColor").value=org.background_color;$("textColor").value=org.text_color}
  pend=null;setupPrev()}
const PH={school:"ABC Public School",college:"XYZ College",individual:"Your name or business"};
function draft(){return{name:$("orgName").value,tagline:$("orgTagline").value,image_url:pend||org?.image_url,background_color:$("bgColor").value,text_color:$("textColor").value,template_id:org?.template_id||"classic"}}
function setupPrev(){$("setupCard").innerHTML=cardHTML(draft(),SAMPLE)}
$("orgForm").addEventListener("input",e=>{if(e.target.name==="otype")$("orgName").placeholder=PH[e.target.value];if(e.target.id==="orgImage"){const f=e.target.files[0];pend=f?URL.createObjectURL(f):null}setupPrev()});
$("orgForm").onsubmit=async e=>{e.preventDefault();$("orgErr").textContent="";
  await busy($("orgSave"),async()=>{try{let imageUrl=org?.image_url||null;const u=await upload($("orgImage"));if(u)imageUrl=u;
    org=(await api("/api/organization",J("PUT",{organizationType:document.querySelector("input[name=otype]:checked").value,name:$("orgName").value,tagline:$("orgTagline").value,address:$("orgAddress").value,phone:$("orgPhone").value,academicYear:$("orgYear").value,imageUrl,backgroundColor:$("bgColor").value,textColor:$("textColor").value}))).organization;
    $("nav").classList.remove("hidden");toast("Settings saved");show("dash");await loadClasses();prev()}catch(x){$("orgErr").textContent=x.message}})};

/* ---- ID card ---- */
function cardHTML(o,s){const img=safeImage(o.image_url),ini=(s.name||"?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const rows=[["Father",s.father_name],["Gender",s.gender],["DOB",s.date_of_birth],["Blood group",s.blood_group],["Phone",s.phone],["Address",s.address]].filter(r=>r[1]).map(r=>`<div><b>${r[0]}:</b> ${esc(r[1])}</div>`).join("");
  return `<div class="idcard template-${["classic","modern","minimal"].includes(o.template_id)?o.template_id:"classic"}" style="color:${/^#[0-9a-f]{6}$/i.test(o.text_color)?o.text_color:"#17212b"};background:${/^#[0-9a-f]{6}$/i.test(o.background_color)?o.background_color:"#ffffff"}"><div class="idbg">${img?`<img src="${imageSrc(img)}" alt="">`:""}</div><div class="idc"><div class="orgb">${img?`<img class="logo" src="${imageSrc(img)}" alt="">`:""}<h2>${esc(o.name||"Your organization")}</h2><div>${esc(o.tagline||"")}</div></div><div class="simg">${s.photo_url?`<img src="${imageSrc(s.photo_url)}" alt="">`:esc(ini)}</div><h3>${esc(s.name)}</h3><div class="sid">${esc(s.student_id)}</div>${rows?`<div class="meta">${rows}</div>`:""}<div class="card-codes"><img alt="QR code" src="/api/qr?format=png&value=${encodeURIComponent(s.student_id)}"><img alt="Barcode" src="/api/barcode?format=png&value=${encodeURIComponent(s.student_id)}"></div></div></div>`}
function prev(){const s=students.find(x=>x.id===sel);$("card").innerHTML=s?cardHTML(org,s):`<div class="empty" style="align-self:center"><b>No student selected</b>Pick a student from the list to see their card.</div>`;$("printOne").disabled=!s}
async function printCards(list){
  if(!list.length)return;
  const popup=window.open("about:blank","_blank");
  if(!popup)return toast("Allow pop-ups to open printable cards.",true);
  popup.opener=null;
  try{const url=await cardDownload(list);popup.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),300000)}
  catch(error){popup.close();toast(error.message,true)}
}

/* ---- classes, sections, students ---- */
async function loadClasses(){classes=(await api("/api/classes")).classes;side();stu()}
async function loadSecs(cid){secs[cid]=(await api(`/api/classes/${cid}/sections`)).sections}
function side(){$("classList").innerHTML=classes.length?classes.map(c=>{const o=c.id===openC;return `<div><button class="clsbtn ${o?"open":""}" data-a="toggle" data-id="${c.id}" aria-expanded="${o}"><span>${esc(c.name)}</span><small>${c.student_count}</small></button>${o?`<div class="secs">${(secs[c.id]||[]).map(s=>`<button class="sec ${cur&&cur.id===s.id?"on":""}" data-a="sec" data-id="${s.id}" data-c="${c.id}"><span>Section ${esc(s.name)}</span><small>${s.student_count}</small></button>`).join("")||'<div class="mut" style="padding:6px 10px">No sections yet.</div>'}<button class="link" data-a="addsec" data-id="${c.id}">+ Add section</button></div>`:""}</div>`}).join(""):`<div class="empty"><b>Start with a class</b>Add a class such as "Class 10", then add sections and students.</div>`}
async function pick(id,cid){cur={id,cid};q="";sel=null;students=(await api(`/api/sections/${id}/students`)).students;side();stu();prev()}
function stu(){const el=$("stuPanel");
  if(!cur){el.innerHTML=`<div class="empty"><b>${classes.length?"Choose a section":"No students yet"}</b>${classes.length?"Open a class on the left, then pick a section to see its students.":"Add your first class on the left to begin."}</div>`;return}
  const cn=classes.find(c=>c.id===cur.cid)?.name||"",sn=(secs[cur.cid]||[]).find(s=>s.id===cur.id)?.name||"";
  el.innerHTML=`<div class="sect"><div><h2>${esc(cn)}, section ${esc(sn)}</h2><div class="mut">${students.length} student${students.length===1?"":"s"}</div></div><div class="row"><button class="btn" data-a="printall" ${students.length?"":"disabled"}>Print all cards</button><button class="btn primary" data-a="addstu">+ Add student</button></div></div>${students.length?`<input class="search" id="search" placeholder="Search by name or ID" aria-label="Search students" value="${esc(q)}">`:""}<div id="stuList"></div>`;
  const s=$("search");if(s)s.oninput=()=>{q=s.value.toLowerCase();stuList()};stuList()}
function stuList(){const l=students.filter(s=>(s.name+" "+s.student_id).toLowerCase().includes(q));
  $("stuList").innerHTML=!students.length?`<div class="empty"><b>No students in this section</b>Add a student with their details and photo to create an ID card.</div>`:l.length?l.map(s=>`<div class="stu ${s.id===sel?"on":""}" data-a="prev" data-id="${s.id}" tabindex="0"><div class="av">${s.photo_url?`<img src="${imageSrc(s.photo_url)}" alt="">`:esc(s.name.trim()[0]||"?").toUpperCase()}</div><div class="grow"><b>${esc(s.name)}</b><div class="mut">${esc(s.student_id)}${s.blood_group?" · "+esc(s.blood_group):""}</div></div><button class="btn sm danger" data-a="del" data-id="${s.id}" aria-label="Delete ${esc(s.name)}">Delete</button></div>`).join(""):`<div class="empty">No student matches "${esc(q)}".</div>`}
async function afterChange(){await loadProduct();await loadClasses();if(cur)await loadSecs(cur.cid);side();stu()}

/* ---- modal ---- */
function modal(title,body,ok,fn,danger){$("mTitle").textContent=title;$("mBody").innerHTML=body;$("mErr").textContent="";const b=$("mOk");b.textContent=ok;b.className="btn "+(danger?"dangerfill":"primary");mFn=fn;$("modal").classList.remove("hidden");const i=$("mBody").querySelector("input,select");if(i)i.focus()}
function closeModal(){$("modal").classList.add("hidden");mFn=null}
$("mForm").onsubmit=async e=>{e.preventDefault();if(!mFn)return;await busy($("mOk"),async()=>{try{await mFn();closeModal()}catch(x){$("mErr").textContent=x.message}})};
$("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();if((e.key==="Enter"||e.key===" ")&&e.target.classList?.contains("stu")){e.preventDefault();e.target.click()}});
function askName(title,label,ph,fn){modal(title,`<div class="f"><label for="mIn">${label}</label><input id="mIn" required placeholder="${ph}"></div>`,"Add",()=>fn($("mIn").value.trim()))}
function studentForm(){const bg=["","A+","A-","B+","B-","O+","O-","AB+","AB-"];
  modal("Add student",`<div class="g2"><div class="f full"><label for="sName">Full name</label><input id="sName" required></div><div class="f"><label for="sId">Student ID or roll number</label><input id="sId" required></div><div class="f"><label for="sDob">Date of birth</label><input id="sDob" type="date"></div><div class="f"><label for="sGender">Gender</label><select id="sGender"><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option></select></div><div class="f"><label for="sBlood">Blood group</label><select id="sBlood">${bg.map(b=>`<option value="${b}">${b||"Select"}</option>`).join("")}</select></div><div class="f"><label for="sFather">Father's name</label><input id="sFather"></div><div class="f"><label for="sPhone">Phone</label><input id="sPhone" type="tel"></div><div class="f full"><label for="sAddr">Address</label><textarea id="sAddr"></textarea></div><div class="f full"><label for="sPhoto">Photo</label><input id="sPhoto" type="file" accept="image/png,image/jpeg,image/webp"><span class="hint">A clear, front-facing photo works best. Up to 5 MB.</span></div></div>`,"Save student",async()=>{
    const photoUrl=await upload($("sPhoto"));await api(`/api/sections/${cur.id}/students`,J("POST",{name:$("sName").value,studentId:$("sId").value,dateOfBirth:$("sDob").value,gender:$("sGender").value,bloodGroup:$("sBlood").value,fatherName:$("sFather").value,phone:$("sPhone").value,address:$("sAddr").value,photoUrl}));
    await pick(cur.id,cur.cid);await afterChange();toast("Student added")})}

/* ---- click actions ---- */
const A={
  nav:d=>{if(d.v==="dash"&&!org)return;show(d.v);if(d.v==="dash")prev()},
  toggle:async d=>{openC=openC===d.id?null:d.id;if(openC&&!secs[openC])await loadSecs(openC);side()},
  addclass:()=>askName("Add class","Class name","e.g. Class 10",async n=>{await api("/api/classes",J("POST",{name:n}));await loadClasses();toast("Class added")}),
  addsec:d=>askName("Add section","Section name","e.g. A",async n=>{await api(`/api/classes/${d.id}/sections`,J("POST",{name:n}));await loadSecs(d.id);await loadClasses();toast("Section added")}),
  sec:d=>pick(d.id,d.c).catch(x=>toast(x.message,true)),
  addstu:studentForm,
  prev:d=>{sel=d.id;stuList();prev()},
  del:d=>{const s=students.find(x=>x.id===d.id);modal("Delete student",`<p>Delete <b>${esc(s.name)}</b> (${esc(s.student_id)})? This can't be undone.</p>`,"Delete",async()=>{await api("/api/students/"+d.id,{method:"DELETE"});if(sel===d.id)sel=null;students=students.filter(x=>x.id!==d.id);await afterChange();prev();toast("Student deleted")},true)},
  printone:()=>{const s=students.find(x=>x.id===sel);if(s)return printCards([s])},
  printall:()=>printCards(students),
  close:closeModal
};
document.addEventListener("click",e=>{const b=e.target.closest("[data-a]");if(!b)return;e.stopPropagation();const f=A[b.dataset.a];if(f)Promise.resolve(f(b.dataset)).catch(x=>toast(x.message,true))});
setMode("login");


async function loadProduct(){
 try{
  const d=await api("/api/usage"); $("planBadge").textContent=d.planDetails.name;
  $("usageText").textContent="Students "+d.usage.students_count+"/"+d.planDetails.students+" · Cards "+d.usage.cards_generated+"/"+d.planDetails.cards;
  const t=await api("/api/templates");$("templateSelect").innerHTML=t.templates.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("");$("templateSelect").value=org?.template_id||"classic";
  const b=await api("/api/billing/status");$("billingStatus").textContent=b.requests.length?"Latest request: "+b.requests[0].status:"No activation request yet.";
 }catch(e){}
}
async function requestCOD(){
 const note=prompt("Payment/reference note (optional):","COD / manual payment");
 if(note===null)return;
 try{await api("/api/billing/cod",J("POST",{note}));toast("Pro activation request submitted");loadProduct()}catch(e){toast(e.message,true)}
}
async function bulkImport(){
 if(!cur)return toast("Select a section first.",true);
 const inp=document.createElement("input");inp.type="file";inp.accept=".xlsx";
 inp.onchange=async()=>{if(!inp.files[0])return;try{
   const d=await api("/api/bulk-import/"+cur.id,{method:"POST",headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},body:await inp.files[0].arrayBuffer()});
   toast("Imported "+d.inserted+" students");await pick(cur.id,cur.cid);await afterChange();loadProduct();
 }catch(e){toast(e.message,true)}};inp.click();
}
async function cardDownload(list){
  const r=await fetch("/api/bulk-cards",J("POST",{studentIds:list.map(s=>s.id)}));
  if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.message||"PDF generation failed")}
  const url=URL.createObjectURL(await r.blob());await loadProduct();return url;
}
async function pdfAll(){
  if(!students.length)return toast("No students in this section.",true);
  try{const url=await cardDownload(students),a=document.createElement("a");a.href=url;a.download="id-cards.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  catch(error){toast(error.message,true)}
}
$("templateSelect").onchange=async()=>{
  try{org=(await api("/api/templates",J("PUT",{templateId:$("templateSelect").value}))).organization;prev();setupPrev();toast("Template saved")}
  catch(error){$("templateSelect").value=org?.template_id||"classic";toast(error.message,true)}
};
async function codes(){
 const value=sel?(students.find(x=>x.id===sel)?.student_id||""):"";
 if(!value)return toast("Select a student first.",true);
 try{
  const [q,b]=await Promise.all([api("/api/qr?value="+encodeURIComponent(value)),api("/api/barcode?value="+encodeURIComponent(value))]);
  modal("QR & Barcode",'<div style="text-align:center"><p><b>'+esc(value)+'</b></p><img src="'+q.dataUrl+'" style="width:180px;height:180px;display:block;margin:auto"><img src="'+b.dataUrl+'" style="max-width:100%;margin-top:12px"></div>',"Close",async()=>{});
 }catch(e){toast(e.message,true)}
}
async function adminLoad(){
 try{
  const d=await api("/api/admin/overview");$("adminStats").innerHTML='<div class="product-box"><b>Users</b>'+d.users+'</div><div class="product-box"><b>Organizations</b>'+d.organizations+'</div><div class="product-box"><b>Pro</b>'+d.proOrganizations+'</div><div class="product-box"><b>Pending COD</b>'+d.pendingPayments+'</div>';
  const p=await api("/api/admin/payment-requests");
  $("adminRows").innerHTML=p.requests.map(x=>'<tr><td>'+esc(x.organization_name)+'</td><td>'+esc(x.email)+'</td><td>'+esc(x.plan_code)+'</td><td>₹'+esc(x.amount)+'</td><td>'+esc(x.status)+'</td><td>'+(x.status==="pending"?'<button class="btn sm primary" data-a="approve" data-id="'+x.id+'">Approve</button> <button class="btn sm danger" data-a="reject" data-id="'+x.id+'">Reject</button>':"—")+'</td></tr>').join("");
 }catch(e){toast(e.message,true)}
}
async function approvePayment(id,yes){
 try{await api("/api/admin/payment-requests/"+id+"/"+(yes?"approve":"reject"),{method:"POST"});toast(yes?"Pro activated":"Request rejected");adminLoad()}catch(e){toast(e.message,true)}
}
const oldShow=show;
show=function(v){
 $("productPanel").classList.toggle("hidden",v!=="dash");
 if(v==="admin"){ $("setupView").classList.add("hidden");$("dashView").classList.add("hidden");$("adminView").classList.remove("hidden");$("navAdmin").classList.add("on");adminLoad();return;}
 $("adminView").classList.add("hidden");$("navAdmin").classList.remove("on");oldShow(v); if(v==="dash")loadProduct();
};
const oldEnter=enter;
enter=async function(){await oldEnter();if(me?.role==="admin")$("navAdmin").classList.remove("hidden");if(org)loadProduct()};
A.cod=requestCOD;A.bulkImport=bulkImport;A.pdfAll=pdfAll;A.codes=codes;A.adminRefresh=adminLoad;A.approve=d=>approvePayment(d.id,true);A.reject=d=>approvePayment(d.id,false);

(async()=>{try{me=(await api("/api/auth/me")).user;await enter()}catch{}})();

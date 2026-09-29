let selectedDesign='classic',enquiryPage=1;
const designFlags={showPhoto:'cardPhoto',showLogo:'cardLogo',showBackground:'cardBackground',showQr:'cardQr',showBarcode:'cardBarcode'};
function fillDesigner(design){
  $('cardOrientation').value=design.orientation;$('cardFont').value=design.fontFamily;$('cardFontSize').value=design.fontSize;
  $('cardPhotoShape').value=design.photoShape;$('cardAccent').value=design.accentColor;
  $('cardTitle').value=design.cardTitle;$('cardFooter').value=design.footerText;
  for(const [key,id] of Object.entries(designFlags))$(id).checked=design[key];
  $('designFields').innerHTML=Object.entries(CardDesign.fields).map(([key,label])=>`<label><input type="checkbox" data-field="${key}" ${design.visibleFields.includes(key)?'checked':''}> ${label}</label>`).join('');
}
function drawDesignChoices(){
  $('designChoices').innerHTML=CardDesign.templates.map((template,index)=>`<label class="design-choice ${selectedDesign===template.id?'selected':''}"><input type="radio" name="cardTemplate" value="${template.id}" ${selectedDesign===template.id?'checked':''}><span class="design-thumb thumb-${template.id}" aria-hidden="true"><span>${String(index+1).padStart(2,'0')}</span><i></i><b></b><b></b></span><strong>${template.name}</strong><small>${template.description}</small></label>`).join('');
}
function openDesigner(){
  if(!org){showSetup(true);return;}
  selectedDesign=org.template_id||'classic';drawDesignChoices();fillDesigner(CardDesign.normalize(org.card_design));
  $('cardBg').value=org.background_color;$('cardInk').value=org.text_color;$('designError').textContent='';
  renderDesign(false);
}
function readDesigner(){
  return {orientation:$('cardOrientation').value,fontFamily:$('cardFont').value,fontSize:$('cardFontSize').value,photoShape:$('cardPhotoShape').value,accentColor:$('cardAccent').value,cardTitle:$('cardTitle').value,footerText:$('cardFooter').value,
    visibleFields:Array.from(document.querySelectorAll('#designFields input:checked')).map(input=>input.dataset.field),
    ...Object.fromEntries(Object.entries(designFlags).map(([key,id])=>[key,$(id).checked]))};
}
function renderDesign(dirty=true){
  const draft={...org,template_id:selectedDesign,background_color:$('cardBg').value,text_color:$('cardInk').value,card_design:readDesigner()};
  $('designCard').innerHTML=cardHTML(draft,students.find(student=>student.id===sel)||SAMPLE);
  $('designSaved').textContent=dirty?'Unsaved changes':'Your saved design';
}
$('designForm').addEventListener('input',event=>{
  if(event.target.name==='cardTemplate'){selectedDesign=event.target.value;document.querySelectorAll('.design-choice').forEach(label=>label.classList.toggle('selected',label.querySelector('input').value===selectedDesign));}
  renderDesign();
});
$('resetDesign').onclick=()=>{selectedDesign='classic';drawDesignChoices();fillDesigner(CardDesign.normalize({}));$('cardBg').value='#ffffff';$('cardInk').value='#17212b';renderDesign();};
$('designForm').onsubmit=async event=>{
  event.preventDefault();$('designError').textContent='';
  await busy($('saveDesign'),async()=>{
    try{org=(await api('/api/card-design',J('PUT',{templateId:selectedDesign,cardDesign:readDesigner(),backgroundColor:$('cardBg').value,textColor:$('cardInk').value}))).organization;prev();renderDesign(false);toast('Card design saved');}
    catch(error){$('designError').textContent=error.message;}
  });
};
async function loadEnquiries(){
  $('enquiryError').textContent='';
  try{
    const data=await api('/api/admin/print-enquiries?status='+encodeURIComponent($('enquiryFilter').value)+'&page='+enquiryPage);
    $('enquiryList').innerHTML=data.enquiries.length?data.enquiries.map(item=>`<article class="enquiry-card"><div class="sect"><div><strong>${esc(item.name)}</strong><span class="mut"> · ${esc(item.city)}</span><p>${esc(item.product_option)} · ${item.quantity} requested</p></div><label>Status <select data-enquiry-id="${item.id}" aria-label="Status for ${esc(item.name)}">${['new','contacted','quoted','closed'].map(status=>`<option value="${status}" ${item.status===status?'selected':''}>${status}</option>`).join('')}</select></label></div><p><b>Phone:</b> ${esc(item.phone)} ${item.email?'<b>Email:</b> '+esc(item.email):''}</p><p class="enquiry-details">${esc(item.details||'No extra requirements supplied.')}</p><small>Reference ${esc(item.id.slice(0,8).toUpperCase())} · ${esc(new Date(item.created_at).toLocaleDateString())}</small></article>`).join(''):'<p class="empty">No printing enquiries in this view.</p>';
    $('enquiryPage').textContent=`Page ${data.page} · ${data.total} request${data.total===1?'':'s'}`;
    $('enquiryPrev').disabled=enquiryPage===1;$('enquiryNext').disabled=enquiryPage*25>=data.total;
  }catch(error){$('enquiryError').textContent=error.message;}
}
$('enquiryFilter').onchange=()=>{enquiryPage=1;loadEnquiries();};
$('enquiryPrev').onclick=()=>{if(enquiryPage>1){enquiryPage--;loadEnquiries();}};
$('enquiryNext').onclick=()=>{enquiryPage++;loadEnquiries();};
$('enquiryList').addEventListener('change',async event=>{
  const id=event.target.dataset.enquiryId;if(!id)return;
  event.target.disabled=true;
  try{await api('/api/admin/print-enquiries/'+id,J('PATCH',{status:event.target.value}));await loadEnquiries();toast('Enquiry updated');}
  catch(error){await loadEnquiries();$('enquiryError').textContent=error.message;}
});

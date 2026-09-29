'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const date = value => value ? new Date(value).toLocaleString() : '—';
const number = value => Number(value || 0).toLocaleString();
const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const badge = value => `<span class="badge">${esc(value || '—')}</span>`;
const views = {
  overview: { title: 'Overview', icon: '◫', description: 'A current snapshot of your ID-card platform and printing shop.' },
  users: { title: 'Users', icon: '◎', description: 'Accounts, administrator roles, organization links and successful sign-ins.', endpoint: 'users', key: 'users', statuses: ['user', 'admin'], columns: ['Name / email', 'Role', 'Organization', 'Plan', 'Joined', 'Last sign-in'], row: r => [person(r.name, r.email), badge(r.role), esc(r.organization_name || 'Setup incomplete'), badge(r.plan), esc(date(r.created_at)), esc(date(r.last_login_at))] },
  organizations: { title: 'Organizations', icon: '▦', description: 'Schools, colleges and individual accounts, with live student counts and cumulative card usage.', endpoint: 'organizations', key: 'organizations', statuses: ['free', 'pro'], columns: ['Organization / owner', 'Type / plan', 'Classes / sections', 'Students / limit', 'Cards / limit', 'Design / images', 'Phone'], row: r => [person(r.name, r.email), badge(r.organization_type) + ' ' + badge(r.plan), number(r.classes) + ' / ' + number(r.sections), usage(r.students, r.plan, 'students'), usage(r.cards_generated, r.plan, 'cards'), esc(r.template_id) + `<small>Logo: ${r.has_logo ? 'Yes' : 'No'} · Background: ${r.has_background ? 'Yes' : 'No'}</small>`, esc(r.phone || '—')] },
  students: { title: 'Students', icon: '▤', description: 'Find student records across organizations by name, student ID or organization.', endpoint: 'students', key: 'students', columns: ['Student', 'Student ID', 'Organization', 'Class', 'Section', 'Photo', 'Added'], row: r => [esc(r.name), esc(r.student_id), esc(r.organization_name), esc(r.class_name), esc(r.section_name), r.has_photo ? 'Uploaded' : 'None', esc(date(r.created_at))] },
  payments: { title: 'Payments', icon: '₹', description: 'Review manual/COD plan activation requests. Approve only after confirming payment outside the app.', endpoint: 'payment-requests', key: 'requests', statuses: ['pending', 'approved', 'rejected'], columns: ['Organization / email', 'Amount / plan', 'Status', 'Note', 'Requested', 'Reviewed', 'Action'], row: r => [person(r.organization_name, r.email), money(r.amount) + '<small>' + esc(r.plan_code) + '</small>', badge(r.status), esc(r.note), esc(date(r.created_at)), person(date(r.approved_at), r.reviewed_by || ''), r.status === 'pending' ? `<div class="row-actions"><button data-payment="${esc(r.id)}" data-action="approve">Approve</button><button class="secondary" data-payment="${esc(r.id)}" data-action="reject">Reject</button></div>` : '—'] },
  enquiries: { title: 'Printing enquiries', icon: '✉', description: 'Customer quote requests for flex boards, wedding cards, mugs, T-shirts and ID cards.', endpoint: 'print-enquiries', key: 'enquiries', statuses: ['new', 'contacted', 'quoted', 'closed'], columns: ['Customer / city', 'Contact', 'Product / quantity', 'Requirements', 'Status', 'Received / reference'], row: r => [person(r.name, r.city), person(r.phone, r.email), person(r.product_option, number(r.quantity) + ' requested'), esc(r.details || '—'), `<select data-enquiry="${esc(r.id)}" aria-label="Status for ${esc(r.name)}">${['new', 'contacted', 'quoted', 'closed'].map(s => `<option ${s === r.status ? 'selected' : ''} value="${s}">${s}</option>`).join('')}</select>`, person(date(r.created_at), r.id)] },
  uploads: { title: 'Uploads', icon: '▧', description: 'Image upload history since tracking began. Sizes describe uploaded files, not current storage usage; removing an image from a card keeps its upload record.', endpoint: 'uploads', key: 'uploads', columns: ['Account', 'Organization', 'Type', 'Uploaded size', 'Uploaded'], row: r => [person(r.name || 'Deleted account', r.email), esc(r.organization_name || '—'), esc(r.media_type), number(Math.ceil(r.size_bytes / 1024)) + ' KB', esc(date(r.created_at))] },
  activity: { title: 'Activity', icon: '◷', description: 'Successful database changes, sign-ins, image uploads and card generation since tracking began. Failed attempts and physical printing are not recorded.', endpoint: 'activity', key: 'events', statuses: ['account', 'organization', 'class', 'section', 'student', 'design', 'cards', 'payment', 'plan', 'enquiry', 'image'], columns: ['Activity', 'Related account', 'Organization', 'Quantity', 'Time', 'Record reference'], row: r => [badge(r.action), person(r.name || 'Visitor / unavailable', r.email), esc(r.organization_name || '—'), number(r.quantity), esc(date(r.created_at)), `<span class="reference">${esc(r.entity_id || '—')}</span>`] },
};
let current = 'overview', page = 1, version = 0, plans = {}, payment = null;
function person(name, detail) { return `<strong>${esc(name || '—')}</strong><small>${esc(detail || '')}</small>`; }
function usage(count, plan, key) { const limit = plans[plan]?.[key]; return `${number(count)} / ${limit ? number(limit) : '—'}`; }
async function api(path, options) {
  const response = await fetch('/api/' + path, options);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) { version++; $('dashboard').hidden = true; $('access').hidden = false; $('accessError').textContent = data.message; }
    throw new Error(data.message || 'Unable to load records.');
  }
  return data;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function showError(error) { $('error').textContent = error.message; $('error').hidden = false; }
function selectView(view) {
  if (!views[view]) view = 'overview';
  current = view; page = 1; location.hash = view; $('search').value = '';
  $('status').innerHTML = '<option value="">All</option>' + (views[view].statuses || []).map(value => `<option value="${value}">${value}</option>`).join('');
  $('statusLabel').hidden = !views[view].statuses;
  $('adminNav').querySelectorAll('button').forEach(button => button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'));
  $('pageTitle').textContent = views[view].title; $('pageDescription').textContent = views[view].description;
  $('overview').hidden = view !== 'overview'; $('records').hidden = view === 'overview';
  load();
}
async function load() {
  const sequence = ++version, view = current; $('error').hidden = true; $('loading').hidden = false;
  $('tableBody').innerHTML = ''; $('empty').hidden = true; $('pageInfo').textContent = ''; $('prev').disabled = true; $('next').disabled = true;
  try {
    if (view === 'overview') {
      const [data, activity] = await Promise.all([api('admin/overview'), api('admin/activity')]);
      if (sequence !== version) return;
      plans = data.plans;
      const metrics = [['Users', data.users, 'users'], ['Organizations', data.organizations, 'organizations'], ['Students', data.students, 'students'], ['Cards generated', data.cardsGenerated, 'organizations'], ['Pro organizations', data.proOrganizations, 'organizations'], ['Approved manual payments', money(data.approvedPaymentAmount), 'payments'], ['Printing enquiries', data.enquiries, 'enquiries'], ['Uploads tracked', data.uploads, 'uploads']];
      $('metrics').innerHTML = metrics.map(([label, value, target]) => `<button data-view="${target}" class="metric"><span>${label}</span><strong>${typeof value === 'number' ? number(value) : value}</strong><small>View records ↗</small></button>`).join('');
      const max = Math.max(1, ...data.trends.map(day => day.cards));
      $('chart').innerHTML = data.trends.map(day => `<div class="bar-column" title="${day.day}: ${day.cards} cards"><span>${day.cards || ''}</span><div class="bar" style="height:${Math.max(2, day.cards / max * 130)}px"></div><small>${day.day.slice(8)}</small></div>`).join('');
      $('chartSummary').textContent = `${number(data.trends.reduce((sum, day) => sum + day.cards, 0))} cards in the last 14 days. ${number(data.classes)} classes and ${number(data.sections)} sections currently stored.`;
      $('attention').innerHTML = `<button class="attention" data-view="payments"><strong>${number(data.pendingPayments)}</strong><span>Pending payment reviews →</span></button><button class="attention" data-view="enquiries"><strong>${number(data.openEnquiries)}</strong><span>Open printing enquiries →</span></button>`;
      $('recentActivity').innerHTML = activity.events.slice(0, 6).map(event => `<div class="activity-line"><span>${badge(event.action)}<small>${esc(event.email || 'Visitor / unavailable')}</small></span><time>${esc(date(event.created_at))}</time></div>`).join('') || '<p class="muted">No activity recorded yet.</p>';
      $('trackingNote').textContent = `Activity and upload history started ${date(data.trackingStartedAt)}. Totals show current records and cumulative card generation; approved payments are recorded manual approvals.`;
    } else {
      const config = views[view], query = new URLSearchParams({ page, q: $('search').value.trim(), status: $('status').value });
      const data = await api(`admin/${config.endpoint}?${query}`);
      if (sequence !== version) return;
      $('tableCaption').textContent = config.title;
      $('tableHead').innerHTML = '<tr>' + config.columns.map(label => `<th scope="col">${label}</th>`).join('') + '</tr>';
      $('tableBody').innerHTML = data[config.key].map(row => '<tr>' + config.row(row).map(cell => `<td>${cell}</td>`).join('') + '</tr>').join('');
      $('empty').hidden = data.total !== 0 && data[config.key].length !== 0;
      $('pageInfo').textContent = `Page ${page} of ${Math.max(1, Math.ceil(data.total / 25))} · ${number(data.total)} records`;
      $('prev').disabled = page <= 1; $('next').disabled = page * 25 >= data.total;
    }
  } catch (error) { if (sequence === version) showError(error); }
  finally { if (sequence === version) $('loading').hidden = true; }
}
async function enter(user) {
  if (user.role !== 'admin') { $('accessError').textContent = 'This account does not have administrator access.'; $('accessLogout').hidden = false; return; }
  $('access').hidden = true; $('dashboard').hidden = false; $('adminName').textContent = user.name;
  try { plans = (await api('admin/overview')).plans; selectView(location.hash.slice(1)); } catch (error) { showError(error); }
}
$('adminNav').innerHTML = Object.entries(views).map(([key, config]) => `<button data-view="${key}"><span aria-hidden="true">${config.icon}</span>${config.title}</button>`).join('');
document.addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) selectView(button.dataset.view); });
window.addEventListener('hashchange', () => { const view = location.hash.slice(1); if (view !== current) selectView(view); });
$('filters').onsubmit = event => { event.preventDefault(); page = 1; load(); };
$('status').onchange = () => { page = 1; load(); };
$('clear').onclick = () => { $('search').value = ''; $('status').value = ''; page = 1; load(); };
$('prev').onclick = () => { if (page > 1) { page--; load(); } };
$('next').onclick = () => { page++; load(); };
$('refresh').onclick = load;
$('tableBody').addEventListener('click', event => {
  const button = event.target.closest('[data-payment]'); if (!button) return;
  payment = { id: button.dataset.payment, action: button.dataset.action };
  $('confirmTitle').textContent = payment.action === 'approve' ? 'Approve payment and activate Pro?' : 'Reject this activation request?';
  $('confirmText').textContent = payment.action === 'approve' ? 'Confirm that you received the manual payment. Approval activates Pro for this organization.' : 'The request will be marked rejected. The customer can submit a new request.';
  $('confirmError').textContent = ''; $('paymentDialog').showModal();
});
$('confirmPayment').onclick = async () => {
  if (!payment) return; const selected = payment; $('confirmPayment').disabled = true;
  try { await api(`admin/payment-requests/${selected.id}/${selected.action}`, { method: 'POST' }); $('paymentDialog').close(); payment = null; await load(); }
  catch (error) { $('confirmError').textContent = error.message; }
  finally { $('confirmPayment').disabled = false; }
};
$('tableBody').addEventListener('change', async event => {
  if (!event.target.dataset.enquiry) return; const select = event.target; select.disabled = true;
  try { await api('admin/print-enquiries/' + select.dataset.enquiry, json('PATCH', { status: select.value })); await load(); }
  catch (error) { await load(); showError(error); }
});
$('loginForm').onsubmit = async event => {
  event.preventDefault(); $('accessError').textContent = ''; $('loginButton').disabled = true;
  try { const data = await api('auth/login', json('POST', Object.fromEntries(new FormData(event.target)))); event.target.reset(); await enter(data.user); }
  catch (error) { $('accessError').textContent = error.message; }
  finally { $('loginButton').disabled = false; }
};
async function logout() { await api('auth/logout', { method: 'POST' }); location.reload(); }
$('logout').onclick = logout; $('accessLogout').onclick = logout;
api('auth/me').then(data => enter(data.user)).catch(() => {});

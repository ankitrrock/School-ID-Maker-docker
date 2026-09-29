const path = require('node:path');
const { problem, PLANS } = require('./limits');

async function initAdminDb(pool) {
  await pool.query(`
    alter table users add column if not exists last_login_at timestamptz;
    alter table print_enquiries add column if not exists updated_by uuid references users(id) on delete set null;
    create table if not exists asset_uploads (
      id uuid primary key default gen_random_uuid(), user_id uuid references users(id) on delete set null,
      media_type text not null, size_bytes integer not null, created_at timestamptz not null default now()
    );
    create table if not exists activity_events (
      id bigserial primary key, account_id uuid references users(id) on delete set null,
      organization_id uuid, action text not null, entity_id uuid, quantity integer not null default 1,
      created_at timestamptz not null default now()
    );
    create index if not exists activity_events_time_idx on activity_events(created_at desc,id desc);
    create index if not exists activity_events_account_idx on activity_events(account_id);
    create index if not exists asset_uploads_time_idx on asset_uploads(created_at desc,id desc);
    create table if not exists admin_tracking (id integer primary key check(id=1), started_at timestamptz not null default now());
    insert into admin_tracking(id) values(1) on conflict do nothing;
    create or replace function track_platform_activity() returns trigger language plpgsql as $$
    declare record_data jsonb; owner_id uuid; org_id uuid; target_id uuid; event_name text; amount integer := 1;
    begin
      if TG_OP='DELETE' then record_data := to_jsonb(OLD); else record_data := to_jsonb(NEW); end if;
      target_id := (record_data->>'id')::uuid;
      if TG_TABLE_NAME='users' then
        owner_id := target_id;
        if TG_OP='INSERT' then event_name := 'account.created';
        elsif NEW.last_login_at is distinct from OLD.last_login_at then event_name := 'account.login';
        elsif NEW.role is distinct from OLD.role then event_name := 'account.role_changed'; end if;
      elsif TG_TABLE_NAME='organizations' then
        owner_id := (record_data->>'user_id')::uuid; org_id := target_id;
        if TG_OP='INSERT' then event_name := 'organization.created';
        elsif NEW.plan is distinct from OLD.plan then event_name := 'plan.changed';
        elsif NEW.card_design is distinct from OLD.card_design or NEW.template_id is distinct from OLD.template_id then event_name := 'design.updated';
        else event_name := 'organization.updated'; end if;
      elsif TG_TABLE_NAME='classes' then
        org_id := (record_data->>'organization_id')::uuid; event_name := 'class.created';
      elsif TG_TABLE_NAME='sections' then
        select organization_id into org_id from classes where id=(record_data->>'class_id')::uuid;
        event_name := 'section.created';
      elsif TG_TABLE_NAME='students' then
        select c.organization_id into org_id from sections s join classes c on c.id=s.class_id where s.id=(record_data->>'section_id')::uuid;
        event_name := case when TG_OP='INSERT' then 'student.created' when TG_OP='DELETE' then 'student.deleted' else 'student.updated' end;
      elsif TG_TABLE_NAME='usage_counters' then
        org_id := NEW.organization_id; target_id := org_id;
        amount := NEW.cards_generated - OLD.cards_generated;
        if amount > 0 then event_name := 'cards.generated'; end if;
      elsif TG_TABLE_NAME='payment_requests' then
        org_id := NEW.organization_id; owner_id := coalesce(NEW.approved_by,NEW.user_id);
        if TG_OP='INSERT' or NEW.status is distinct from OLD.status then event_name := 'payment.' || NEW.status; end if;
      elsif TG_TABLE_NAME='print_enquiries' then
        if TG_OP='INSERT' then event_name := 'enquiry.created';
        elsif NEW.status is distinct from OLD.status then event_name := 'enquiry.' || NEW.status; owner_id := NEW.updated_by; end if;
      elsif TG_TABLE_NAME='asset_uploads' then
        owner_id := NEW.user_id; event_name := 'image.uploaded';
      end if;
      if org_id is not null and owner_id is null then select user_id into owner_id from organizations where id=org_id; end if;
      if org_id is null and owner_id is not null and TG_TABLE_NAME<>'print_enquiries' then select id into org_id from organizations where user_id=owner_id; end if;
      if event_name is not null then
        insert into activity_events(account_id,organization_id,action,entity_id,quantity) values(owner_id,org_id,event_name,target_id,amount);
      end if;
      return null;
    end $$;
  `);
  // Triggers run in the same transaction as the action, so rolled-back work is not logged.
  const tables = { users: 'insert or update', organizations: 'insert or update', classes: 'insert', sections: 'insert', students: 'insert or update or delete', usage_counters: 'update', payment_requests: 'insert or update', print_enquiries: 'insert or update', asset_uploads: 'insert' };
  for (const [table, events] of Object.entries(tables)) {
    await pool.query(`create or replace trigger platform_activity after ${events} on ${table} for each row execute function track_platform_activity()`);
  }
}
function filters(query, statuses = []) {
  const page = Number(query.page || 1), q = query.q || '', status = query.status || '';
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw problem(400, 'Choose a valid page.');
  if (typeof q !== 'string' || q.length > 150) throw problem(400, 'Search must be up to 150 characters.');
  if (typeof status !== 'string' || (status && !statuses.includes(status))) throw problem(400, 'Invalid filter.');
  return { page, q: q.trim(), status, offset: (page - 1) * 25 };
}
async function list(pool, query, from, columns, where, order, key, statuses = []) {
  const f = filters(query, statuses), args = [f.q, f.status];
  const count = await pool.query(`select count(*)::int total ${from} where ${where}`, args);
  const rows = await pool.query(`select ${columns} ${from} where ${where} order by ${order} limit 25 offset $3`, [...args, f.offset]);
  return { [key]: rows.rows, total: count.rows[0].total, page: f.page, pageSize: 25 };
}
function registerAdminRoutes(app, pool, auth) {
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
  app.use('/api/admin', auth, (req, res, next) => {
    if (req.user.role !== 'admin') throw problem(403, 'Admin access required.');
    res.set('Cache-Control', 'no-store'); next();
  });
  app.get('/api/admin/overview', async (req, res) => {
    const result = await pool.query(`select
      (select count(*)::int from users) users,
      (select count(*)::int from organizations) organizations,
      (select count(*)::int from organizations where plan='pro') "proOrganizations",
      (select count(*)::int from students) students,
      (select count(*)::int from classes) classes,
      (select count(*)::int from sections) sections,
      (select coalesce(sum(cards_generated),0)::float8 from usage_counters) "cardsGenerated",
      (select count(*)::int from payment_requests where status='pending') "pendingPayments",
      (select coalesce(sum(amount),0)::float8 from payment_requests where status='approved') "approvedPaymentAmount",
      (select count(*)::int from print_enquiries) enquiries,
      (select count(*)::int from print_enquiries where status<>'closed') "openEnquiries",
      (select count(*)::int from asset_uploads) uploads,
      (select started_at from admin_tracking where id=1) "trackingStartedAt"`);
    const trends = await pool.query(`select to_char(bucket,'YYYY-MM-DD') as "day",
      count(e.id)::int actions, coalesce(sum(case when e.action='cards.generated' then e.quantity else 0 end),0)::int cards
      from generate_series((now() at time zone 'UTC')::date-13,(now() at time zone 'UTC')::date,interval '1 day') as dates(bucket)
      left join activity_events e on (e.created_at at time zone 'UTC')::date=bucket::date group by bucket order by bucket`);
    res.json({ ...result.rows[0], trends: trends.rows, plans: PLANS });
  });
  app.get('/api/admin/users', async (req, res) => res.json(await list(pool, req.query,
    'from users u left join organizations o on o.user_id=u.id',
    'u.id,u.name,u.email,u.role,u.created_at,u.last_login_at,o.id organization_id,o.name organization_name,o.plan',
    "($1='' or strpos(lower(u.name||' '||u.email),lower($1))>0) and ($2='' or u.role=$2)", 'u.created_at desc,u.id desc', 'users', ['user', 'admin'])));
  app.get('/api/admin/organizations', async (req, res) => res.json(await list(pool, req.query,
    'from organizations o join users u on u.id=o.user_id left join usage_counters uc on uc.organization_id=o.id',
    `o.id,o.name,o.organization_type,o.plan,o.subscription_status,o.template_id,o.phone,o.created_at,u.email,
     o.image_url is not null has_logo,o.background_image_url is not null has_background,coalesce(uc.cards_generated,0) cards_generated,
     (select count(*)::int from classes c where c.organization_id=o.id) classes,
     (select count(*)::int from sections s join classes c on c.id=s.class_id where c.organization_id=o.id) sections,
     (select count(*)::int from students st join sections s on s.id=st.section_id join classes c on c.id=s.class_id where c.organization_id=o.id) students`,
    "($1='' or strpos(lower(o.name||' '||u.email),lower($1))>0) and ($2='' or o.plan=$2)", 'o.created_at desc,o.id desc', 'organizations', ['free', 'pro'])));
  app.get('/api/admin/students', async (req, res) => res.json(await list(pool, req.query,
    'from students st join sections s on s.id=st.section_id join classes c on c.id=s.class_id join organizations o on o.id=c.organization_id',
    'st.id,st.student_id,st.name,st.created_at,st.photo_url is not null has_photo,s.name section_name,c.name class_name,o.name organization_name',
    "($1='' or strpos(lower(st.name||' '||st.student_id||' '||o.name),lower($1))>0) and $2=''", 'st.created_at desc,st.id desc', 'students')));
  app.get('/api/admin/payment-requests', async (req, res) => res.json(await list(pool, req.query,
    'from payment_requests p join organizations o on o.id=p.organization_id join users u on u.id=p.user_id left join users a on a.id=p.approved_by',
    'p.id,p.organization_id,p.plan_code,p.amount,p.status,p.note,p.created_at,p.approved_at,o.name organization_name,u.email,a.email reviewed_by',
    "($1='' or strpos(lower(o.name||' '||u.email),lower($1))>0) and ($2='' or p.status=$2)", 'p.created_at desc,p.id desc', 'requests', ['pending', 'approved', 'rejected'])));
  app.get('/api/admin/uploads', async (req, res) => res.json(await list(pool, req.query,
    'from asset_uploads a left join users u on u.id=a.user_id left join organizations o on o.user_id=a.user_id',
    'a.id,a.media_type,a.size_bytes,a.created_at,u.name,u.email,o.name organization_name',
    "($1='' or strpos(lower(coalesce(u.email,'')||' '||coalesce(o.name,'')),lower($1))>0) and $2=''", 'a.created_at desc,a.id desc', 'uploads')));
  app.get('/api/admin/activity', async (req, res) => res.json(await list(pool, req.query,
    'from activity_events e left join users u on u.id=e.account_id left join organizations o on o.id=e.organization_id',
    'e.id,e.action,e.entity_id,e.quantity,e.created_at,u.name,u.email,o.name organization_name',
    "($1='' or strpos(lower(e.action||' '||coalesce(u.email,'')||' '||coalesce(o.name,'')),lower($1))>0) and ($2='' or split_part(e.action,'.',1)=$2)", 'e.created_at desc,e.id desc', 'events', ['account', 'organization', 'class', 'section', 'student', 'design', 'cards', 'payment', 'plan', 'enquiry', 'image'])));
}
module.exports = { initAdminDb, registerAdminRoutes, filters };

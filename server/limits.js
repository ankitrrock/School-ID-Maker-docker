function limit(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
const PLANS = {
  free: { name: 'Free', students: limit('FREE_STUDENT_LIMIT', 50), cards: limit('FREE_CARD_LIMIT', 50), templates: 5, bulkExcel: false, price: 0 },
  pro: { name: 'Pro', students: limit('PRO_STUDENT_LIMIT', 5000), cards: limit('PRO_CARD_LIMIT', 5000), templates: 5, bulkExcel: true, price: 499 },
};
const TEMPLATES = require('../public/card-design').templates;
function problem(status, message) { return Object.assign(new Error(message), { status }); }
function planOf(org) { return PLANS[org?.plan] || PLANS.free; }
async function orgFor(db, userId) {
  return (await db.query('select * from organizations where user_id=$1', [userId])).rows[0];
}
async function usage(db, orgId) {
  await db.query('insert into usage_counters(organization_id) values($1) on conflict do nothing', [orgId]);
  return (await db.query(`select u.cards_generated, (select count(*)::int from students st
    join sections s on s.id=st.section_id join classes c on c.id=s.class_id
    where c.organization_id=u.organization_id) students_count
    from usage_counters u where organization_id=$1`, [orgId])).rows[0];
}
async function requireLimit(db, org, field, count) {
  const current = await usage(db, org.id);
  if (current[field === 'students' ? 'students_count' : 'cards_generated'] + count > planOf(org)[field]) {
    throw problem(402, `Your ${planOf(org).name} plan allows ${planOf(org)[field]} ${field}. Upgrade to Pro or contact the administrator.`);
  }
}
// Every student mutation and card reservation takes the same organization lock.
async function withOrganization(pool, userId, action) {
  const db = await pool.connect();
  try {
    await db.query('begin');
    const org = (await db.query('select * from organizations where user_id=$1 for update', [userId])).rows[0];
    if (!org) throw problem(404, 'Complete organization setup first.');
    const result = await action(db, org);
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally { db.release(); }
}
module.exports = { PLANS, TEMPLATES, problem, planOf, orgFor, usage, requireLimit, withOrganization };

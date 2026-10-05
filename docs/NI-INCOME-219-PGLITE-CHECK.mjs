// ‼ בדיקת 219 במסד זמני (PGlite) — לא תלות של הפרויקט. להרצה: בתיקייה זמנית
//   npm i @electric-sql/pglite@0.3 ; העתיקו לשם את הקובץ ; BODY=lf|crlf FILE=lf|crlf node <file>
//   הורץ 05.10.2026: 4 צירופים × 12 בדיקות — הכול עבר.
// בדיקת 219 במסד זמני בזיכרון (PGlite) — לא נוגע בשום מסד משותף.
// בונה את _tax_fact_field_op מהצילום החי (04.09, כולל 154), מריץ 197 ו-219
// כלשונם, ובודק כתיבה/קריאה, לקוח/בן-זוג, ניקוי, ריצה חוזרת וחסימת עמודות.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const WT = 'C:/Users/guyas/pivo-wt/ni-income-basis/supabase';
// BODY=lf|crlf — סופי השורות של גוף הפונקציה במסד; FILE=lf|crlf — של קובץ 219.
const BODY = process.env.BODY ?? 'crlf', FILE = process.env.FILE ?? 'lf';
const eol = (txt, mode) => { const lf = txt.split(String.fromCharCode(13,10)).join(String.fromCharCode(10)); return mode === 'crlf' ? lf.split(String.fromCharCode(10)).join(String.fromCharCode(13,10)) : lf; };
const readBody = (f) => eol(readFileSync(f, 'utf8'), BODY);
const read219 = () => eol(readFileSync(`${WT}/219-ni-income-list.sql`, 'utf8'), FILE);
const db = new PGlite();
const notices = [];
const run = async (sql) => {
  const res = await db.exec(sql);
  return res;
};
// הודעות NOTICE (raise notice) — דרך onNotice
db.onNotice?.((n) => notices.push(n.message));

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message]); }
};

await run(`
  create role anon; create role authenticated; create role service_role;
  create table public.clients (
    id text primary key, field_meta jsonb,
    ni_income_basis_monthly numeric, spouse_ni_income_basis_monthly numeric
  );
  insert into public.clients (id) values ('c1'), ('c2');
`);
await run(readBody(`${WT}/live-2026-09-04/_tax_fact_field_op.sql`));
// _governed_client_columns כלשונה מ-182
const m182 = readFileSync(`${WT}/182-partial-writes-and-task-order.sql`, 'utf8');
const gStart = m182.indexOf('create or replace function public._governed_client_columns()');
const gEnd = m182.indexOf('grant  execute on function public._governed_client_columns()');
await run(m182.slice(gStart, m182.indexOf('\n', gEnd) + 1));

const op = async (key, write, value, source = 'automation', id = 'c1') =>
  (await db.query(`select * from public._tax_fact_field_op($1, $2, $3, $4::jsonb, $5)`,
    [id, key, write, value === undefined ? null : JSON.stringify(value), source])).rows[0];
const col = async (c, id = 'c1') => (await db.query(`select ${c} as v from public.clients where id = $1`, [id])).rows[0].v;

await check('לפני 219: המפתח niIncomeList אינו מוכר (out_ok=false) — אתר חדש מול מסד ישן לא כותב דבר', async () => {
  const r = await op('niIncomeList', true, { declaration: null, assessment: null });
  assert.equal(r.out_ok, false);
});

await run(readBody(`${WT}/197-ni-insurance-basis.sql`));
const defBefore219 = (await db.query(`select pg_get_functiondef('public._tax_fact_field_op'::regproc) d`)).rows[0].d;
notices.length = 0;
await run(read219());
const defAfter219 = (await db.query(`select pg_get_functiondef('public._tax_fact_field_op'::regproc) d`)).rows[0].d;

await check('219 הוחלה: שתי עמודות jsonb ושני ענפים בדיוק', async () => {
  const cols = (await db.query(`select column_name, data_type from information_schema.columns where table_name='clients' and column_name like '%ni_income_list'`)).rows;
  assert.deepEqual(cols.map(c => [c.column_name, c.data_type]).sort(), [['ni_income_list', 'jsonb'], ['spouse_ni_income_list', 'jsonb']]);
  const count = (s) => (s.match(/\n    when '/g) ?? []).length;
  assert.equal(count(defAfter219) - count(defBefore219), 2);
  assert.ok(defAfter219.includes("when 'niIncomeList' then") && defAfter219.includes("when 'spouseNiIncomeList' then"));
});

await check('ריצה חוזרת של 219: בלי שגיאה, והפונקציה זהה תו-בתו', async () => {
  notices.length = 0;
  await run(read219());
  const again = (await db.query(`select pg_get_functiondef('public._tax_fact_field_op'::regproc) d`)).rows[0].d;
  assert.equal(again, defAfter219);
});

const DECL = { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 16500, receivedDate: '2025-06-15', status: 'תקף' };
const ASSESS = { year: 2025, fromMonth: 1, toMonth: 12, infoSource: 'שומה עצמי', incomeSource: 'עצמאי', amount: 47800, receivedDate: '2026-09-05', status: 'תקף' };

await check('לקוח: כתיבה ⇒ העמודה, field_meta(source=automation), וקריאה חוזרת זהה', async () => {
  const list = { declaration: DECL, assessment: ASSESS };
  const w = await op('niIncomeList', true, list);
  assert.equal(w.out_ok, true);
  assert.equal(w.out_current, null, 'הערך הקודם — ריק');
  assert.deepEqual(await col('ni_income_list'), list);
  const meta = await col('field_meta');
  assert.equal(meta.niIncomeList.source, 'automation');
  assert.match(meta.niIncomeList.syncedAt, /^\d{4}-\d{2}-\d{2}T/);
  const r = await op('niIncomeList', false);
  assert.deepEqual(r.out_current, list, 'p_write=false קורא בלי לשנות');
  assert.equal(await col('spouse_ni_income_list'), null, 'בן/בת הזוג לא נגעו');
});

await check('בן/בת זוג: spouseNiIncomeList לעמודה שלו/ה בלבד', async () => {
  const sp = { declaration: null, assessment: ASSESS };
  await op('spouseNiIncomeList', true, sp);
  assert.deepEqual(await col('spouse_ni_income_list'), sp);
  assert.deepEqual((await col('ni_income_list')).declaration, DECL, 'של הלקוח לא השתנה');
  assert.ok((await col('field_meta')).spouseNiIncomeList, 'meta נפרד');
});

await check('רשימה ריקה (קריאה שלמה בלי שורה תקפה) נשמרת כאובייקט, לא כ-NULL', async () => {
  const empty = { declaration: null, assessment: null };
  const w = await op('niIncomeList', true, empty);
  assert.deepEqual(w.out_current, { declaration: DECL, assessment: ASSESS }, 'הקודם מוחזר — ליומן');
  assert.deepEqual(await col('ni_income_list'), empty);
});

await check('ניקוי «הכנסה מוצהרת»: JSON null ⇒ NULL של SQL בעמודה המספרית', async () => {
  await op('niIncomeBasisMonthly', true, 47800);
  assert.equal(Number(await col('ni_income_basis_monthly')), 47800);
  await op('niIncomeBasisMonthly', true, null);
  assert.equal(await col('ni_income_basis_monthly'), null);
  const r = await db.query(`select * from public._tax_fact_field_op('c1','niIncomeBasisMonthly', true, 'null'::jsonb, 'automation')`);
  assert.equal(r.rows[0].out_ok, true);
  assert.equal(await col('ni_income_basis_monthly'), null);
});

await check('null עבור הרשימה נשמר כ-JSON null (כמו 197) — האתר לעולם לא שולח null לרשימה', async () => {
  await op('niIncomeList', true, null, 'automation', 'c2');
  const raw = (await db.query(`select ni_income_list is null as sqlnull, jsonb_typeof(ni_income_list) t from public.clients where id='c2'`)).rows[0];
  results.push(['ℹ', `niIncomeList=null ⇒ sqlnull=${raw.sqlnull}, jsonb_typeof=${raw.t}`]);
});

await check('חסימה: _governed_client_columns כוללת את שתי העמודות החדשות (update_client_fields חוסם כתיבה ישירה)', async () => {
  const g = (await db.query(`select public._governed_client_columns() g`)).rows[0].g;
  for (const c of ['ni_income_list', 'spouse_ni_income_list', 'ni_income_basis_monthly', 'ni_insurance_basis']) assert.ok(g.includes(c), c);
});

await check('הרשאות: הפונקציה פנימית — anon/authenticated ללא EXECUTE', async () => {
  const r = (await db.query(`select has_function_privilege('anon','public._tax_fact_field_op(text,text,boolean,jsonb,text)','execute') a,
                                    has_function_privilege('authenticated','public._tax_fact_field_op(text,text,boolean,jsonb,text)','execute') b`)).rows[0];
  assert.equal(r.a, false);
  assert.equal(r.b, false);
});

await check('סופי השורות של הענפים החדשים זהים לגוף — בלי ערבוב', async () => {
  const i = defAfter219.indexOf("when 'niIncomeList'"), j = defAfter219.indexOf("when 'vatBalance'");
  const injected = defAfter219.slice(i, j);
  const CRLF = String.fromCharCode(13, 10);
  const crlf = injected.split(CRLF).length - 1;
  const lfOnly = injected.split(String.fromCharCode(10)).length - 1 - crlf;
  if (BODY === 'crlf') assert.ok(crlf > 0 && lfOnly === 0, 'crlf=' + crlf + ' lf=' + lfOnly);
  else assert.ok(crlf === 0 && lfOnly > 0, 'crlf=' + crlf + ' lf=' + lfOnly);
});

await check('ענפים קיימים לא נפגעו (מדגם: vatBalance, niInsuranceBasis, spouseNiOccupations, familyStatus)', async () => {
  for (const k of ["when 'vatBalance' then", "when 'niInsuranceBasis' then", "when 'spouseNiOccupations' then", "when 'familyStatus' then"]) {
    assert.ok(defAfter219.includes(k), k);
  }
  assert.ok(defAfter219.indexOf("when 'niIncomeList'") < defAfter219.indexOf("when 'vatBalance'"), 'הוזרק לפני העוגן');
});

console.log(`── גוף ${BODY} · קובץ 219 ${FILE} ──`);
for (const r of results) console.log(r.join(' '));
console.log(`${results.filter(r => r[0] === '✓').length} עברו, ${results.filter(r => r[0] === '✗').length} נכשלו`);
process.exit(results.some(r => r[0] === '✗') ? 1 : 0);

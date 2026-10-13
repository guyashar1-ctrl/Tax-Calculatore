// בדיקת מיגרציה 230 (הכנה להצהרת הון) בבידוד: PGlite, על אותה הקמה של בדיקת 229 + 229 + 230.
//   PGLITE_DIR=<tmp> node scripts/sql/230/test-230-wealth.pglite.mjs <tmp>/items.json
// (items.json — מ-scripts/sql/230/items.ts; ראו fill-items.mjs)
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const sql229 = readFileSync(WT + 'supabase/229-tax-year-collection.sql', 'utf8');
const sql230 = readFileSync(WT + 'supabase/230-wealth-declaration-collection.sql', 'utf8');
const sql222 = readFileSync(WT + 'supabase/222-request-preview.sql', 'utf8').replace(/\r\n/g, '\n');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = readFileSync(WT + 'scripts/sql/229/test-229-tax-year.pglite.mjs', 'utf8');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);'))
  .replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);
// ‼ פריטי הקליטה (intake.*) שייכים ל-236 — 230 משווה בלעדיהם.
const codeItems = Object.fromEntries(Object.entries(JSON.parse(readFileSync(process.argv[2], 'utf8'))).filter(([k]) => !k.startsWith('intake.')));

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

await db.exec(setup);
// סטאבים לאסמכתאות של דרישה: מסמכים בתיק ורשומות מהרשות (בשרת — 01-schema, 90-tax-fact-reconciliation)
await db.exec(`
  create table public.documents (id text primary key, client_id text not null, file_name text);
  create table public.tax_fact_changes (id uuid primary key default gen_random_uuid(), client_id text not null, field_key text not null, source text not null, status text not null);
  insert into public.documents values ('d-letter', 'c1', 'מכתב דרישה.pdf'), ('d-ext', 'c1', 'אישור ארכה.pdf'), ('d-other', 'c2', 'של לקוח אחר.pdf');
  insert into public.tax_fact_changes (id, client_id, field_key, source, status) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'c1', 'capitalDeclarationRequired', 'institution_alignment', 'accepted'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'c1', 'capitalDeclarationRequired', 'manual', 'accepted'),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'c1', 'capitalDeclarationRequired', 'automation', 'pending');`);
await db.exec(psi);
await db.exec(sql229);
await db.exec(sql230);
await db.exec(sql230); // החלה חוזרת
console.log('הוחל: 222 + 229 + 230 (פעמיים)');

// ── 1. פתיחה ──
await as(OFFICE);
const w1 = await rpc('ensure_wealth_declaration', ['c1', '2025-12-31', null]);
const w1b = await rpc('ensure_wealth_declaration', ['c1', '2025-12-31', null]);
ok(w1.ok && w1.created && w1.kind === 'first' && !w1b.created && w1b.stepId === w1.stepId, 'פתיחה: ראשונה; לחיצה כפולה → אותה הכנה', JSON.stringify([w1, w1b]));
const p1 = (await one(`select payload, step_type, ball from public.onboarding_steps where id = $1`, [w1.stepId]));
ok(p1.step_type === 'wealth_declaration' && p1.payload.purpose === 'wealth' && p1.payload.asOfDate === '2025-12-31' && p1.payload.taxYear === 2025 && p1.payload.title === 'הצהרת הון ליום 31.12.2025', 'payload: תכלית, יום, שנה וכותרת', JSON.stringify(p1.payload));
ok(p1.payload.history?.length === 1 && p1.payload.history[0].what === 'opened', 'היסטוריה: נרשמה הפתיחה');
ok((await rpc('ensure_wealth_declaration', ['c1', null, null])).error === 'bad_date', 'בלי יום הצהרה — נדחה');
ok((await rpc('ensure_wealth_declaration', ['c1', '2025-12-31', 'x'])).error === 'bad_kind', 'סוג לא מוכר — נדחה');
await as(OTHER);
ok(!!(await throws(`select public.ensure_wealth_declaration('c1', '2025-12-31', null)`)), 'משרד אחר — אסור');
await as(OFFICE);

// ── 2. שאלות ותשובות «נכון ליום ההצהרה» ──
const P = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra } });
const add = await rpc('add_tax_info_asks', [w1.stepId, JSON.stringify([
  { itemKey: 'wealth.cash', subjectRole: 'couple', prompt: P('מזומן', 'amount') },
  { itemKey: 'wealth.realEstate.has', subjectRole: 'client', prompt: P('נדל״ן?', 'yesno') },
  { itemKey: 'wealth.bank.certs', subjectRole: 'couple', prompt: P('אישורי יתרות', 'file', { docKind: 'bankBalanceCert' }) },
])]);
ok(add.ok && add.added === 3, 'שאלות הון נוספו לבקשה', JSON.stringify(add));
const info = await one(`select payload from public.onboarding_steps where id = $1`, [add.infoStepId]);
ok(info.payload.title === 'השלמת מידע להצהרת הון' && info.payload.asOfDate === '2025-12-31', 'בקשת־הבת: כותרת הצהרת הון ויום ההצהרה', JSON.stringify(info.payload));
ok((await rpc('add_tax_info_asks', [w1.stepId, JSON.stringify([{ itemKey: 'wealth.nope', subjectRole: 'couple', prompt: P('x', 'yesno') }])])).error === 'unknown_item', 'פריט הון לא מוכר — נדחה');
await rpc('publish_tax_info', [add.infoStepId]);
const v = await rpc('portal_tax_info', ['tok-c1', add.infoStepId]);
const askId = k => v.asks.find(a => a.itemKey === k).id;
await rpc('portal_submit_tax_info', ['tok-c1', askId('wealth.cash'), JSON.stringify({ kind: 'amount', amount: 12000 })]);
await rpc('portal_submit_tax_info', ['tok-c1', askId('wealth.realEstate.has'), JSON.stringify({ kind: 'yes' })]);
const fc = await one(`select period_kind, period_from, period_to, basis, tax_year, status from public.tax_year_facts where item_key = 'wealth.cash'`);
ok(fc.period_kind === 'as_of' && fc.period_from === null && fc.period_to.toISOString().slice(0, 10) === '2025-12-31' && fc.basis === 'declared' && fc.tax_year === 2025 && fc.status === 'pending', 'סכום: «נכון ליום ההצהרה», מוצהר, ממתין', JSON.stringify(fc));
ok((await one(`select basis from public.tax_year_facts where item_key = 'wealth.realEstate.has'`)).basis === 'actual', 'שאלת פתיחה: בסיס בפועל');
await rpc('portal_submit_tax_info', ['tok-c1', askId('wealth.bank.certs'), JSON.stringify({ kind: 'file', fileName: 'יתרות.pdf', documentId: 'd-1' })]);
ok((await one(`select doc_kind, review from public.tax_evidence where doc_kind = 'bankBalanceCert'`))?.review === 'needs_review', 'אישור יתרות → ראיה ממתינה לבדיקה');

// ── 3. דרישה, יעד פנימי, הצהרה קודמת, בסיס ──
const pay = async () => (await one(`select payload from public.onboarding_steps where id = $1`, [w1.stepId])).payload;
// מידע חלקי — מותר, «טרם אומת», בלי רצפה (אין תאריך מכתב)
const u0 = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demand: { source: 'client', note: 'הלקוח סיפר בטלפון' } }), null]);
let pd = await pay();
ok(u0.ok && pd.demand.status === 'reported' && !pd.demand.computedDue && !pd.demand.dueInLetter, 'מידע חלקי על דרישה: נשמר «טרם אומת», בלי מועד', JSON.stringify(pd.demand));
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandVerify: { kind: 'document', documentId: 'd-letter' } }), null])).error === 'demand_date_required', 'אימות בלי תאריך מכתב/קבלה — נדחה');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demand: { source: 'nope' } }), null])).error === 'bad_source', 'מקור לא מוכר — נדחה');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demand: { letterDate: '2026-02-01', dueInLetter: '2026-01-15' } }), null])).error === 'due_before_letter', 'מועד לפני תאריך המכתב — נדחה');
// מכתב: רצפה = 120 יום מהמאוחר מבין תאריך המכתב (1.2.2026) ויום ההצהרה (31.12.2025) ⇒ 1.6.2026; לא מתאריך הקבלה
const u1 = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demand: { source: 'letter', letterDate: '2026-02-01', receivedOn: '2026-02-09', dueInLetter: '2026-06-30' }, internalTarget: '2026-05-15' }), 'מכתב מפקיד השומה']);
pd = await pay();
ok(u1.ok && pd.demand.status === 'reported' && pd.demand.computedDue === '2026-06-01' && pd.demand.dueInLetter === '2026-06-30' && pd.internalTarget === '2026-05-15' && !pd.demand.verifiedAt,
  'דרישה: מועד מהמכתב, רצפה מתאריך המכתב (לא מהקבלה) ויעד פנימי — נפרדים; עדיין לא מאומתת', JSON.stringify(pd.demand));
ok((await one(`select public._wealth_min_due('2026-09-14', '2025-12-31') d`)).d.toISOString().slice(0, 10) === '2027-01-12', 'הדוגמה מהתוכנית: דרישה 14.09.2026, יום 31.12.2025 ⇒ 12.01.2027');
ok((await one(`select public._wealth_min_due('2025-10-01', '2025-12-31') d`)).d.toISOString().slice(0, 10) === '2026-04-30', 'יום הצהרה מאוחר מהדרישה ⇒ סופרים מיום ההצהרה');
// אימות: רק מול אסמכתה של אותו לקוח, ורשומה מהרשות — רק מיישור קו/בדיקה אוטומטית שאושרה
for (const [v, err, m] of [
  [{ kind: 'document', documentId: 'd-other' }, 'evidence_not_found', 'מסמך של לקוח אחר'],
  [{ kind: 'document', documentId: 'nope' }, 'evidence_not_found', 'מסמך שלא קיים'],
  [{ kind: 'authority_record', recordId: 'aaaaaaaa-0000-0000-0000-000000000002' }, 'evidence_not_found', 'עריכה ידנית אינה רשומה מהרשות'],
  [{ kind: 'authority_record', recordId: 'aaaaaaaa-0000-0000-0000-000000000003' }, 'evidence_not_found', 'רשומה שלא אושרה'],
  [{ note: 'סמכו עליי' }, 'evidence_required', 'בלי אסמכתה'],
]) ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandVerify: v }), null])).error === err, `אימות נדחה: ${m}`);
const vr = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandVerify: { kind: 'document', documentId: 'd-letter', label: 'מכתב דרישה' } }), null]);
pd = await pay();
ok(vr.ok && pd.demand.status === 'verified' && pd.demand.verifiedBy === OFFICE && pd.demand.verifiedAt && pd.demand.evidence.documentId === 'd-letter' && pd.demand.dueInLetter === '2026-06-30',
  'אימות מול מסמך בתיק: «מאומתת», עם מי ומתי, והמועד שבמכתב נשמר', JSON.stringify(pd.demand));
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandVerify: { kind: 'authority_record', recordId: 'aaaaaaaa-0000-0000-0000-000000000001' } }), null])).ok, 'אימות מול רשומה מאושרת מיישור קו — מותר');
// ארכה — רשומה נפרדת; המועד שבמכתב לא משתנה
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandExtension: { kind: 'personal' } }), null])).error === 'extension_date_required', 'ארכה בלי תאריך — נדחית');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandExtension: { until: '2026-09-30', kind: 'personal', documentId: 'd-other' } }), null])).error === 'evidence_not_found', 'ארכה עם מסמך של לקוח אחר — נדחית');
const ex = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandExtension: { until: '2026-09-30', kind: 'personal', documentId: 'd-ext' } }), null]);
pd = await pay();
ok(ex.ok && pd.demand.extension.until === '2026-09-30' && pd.demand.extension.status === 'documented' && pd.demand.dueInLetter === '2026-06-30' && pd.demand.status === 'verified',
  'ארכה מתועדת נרשמה בנפרד; המועד שבמכתב והאימות נשארו', JSON.stringify(pd.demand));
// שינוי במידע אחרי אימות ⇒ חוזר ל«טרם אומת»
await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demand: { source: 'letter', letterDate: '2026-02-01', receivedOn: '2026-02-09', dueInLetter: '2026-07-31' } }), null]);
pd = await pay();
ok(pd.demand.status === 'reported' && !pd.demand.verifiedAt && pd.demand.unverifiedFrom, 'שינוי בדרישה מאומתת מבטל את האימות (ונרשם מתי אומתה)', JSON.stringify(pd.demand));
await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ demandVerify: { kind: 'document', documentId: 'd-letter' } }), null]);
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ previous: { asOfDate: '2026-01-31' } }), null])).error === 'previous_not_before', 'הצהרה קודמת אחרי יום ההצהרה — נדחית');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ previous: { asOfDate: '2019-12-31', netWorth: 650000, basis: { funds: 'employeeOnly', securities: 'marketValueOldForm' }, documentId: 'd-prev' } }), null])).ok, 'הצהרה קודמת נקלטה עם הבסיס שלה');
ok((await one(`select payload->>'kind' k from public.onboarding_steps where id = $1`, [w1.stepId])).k === 'followup', 'קליטת הצהרה קודמת ⇒ הצהרת המשך');
// אפשרות שאינה לשון הטופס — רק עם ביסוס מתועד (גם כשהיא כמו בהצהרה הקודמת)
const nj = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { funds: 'employeeOnly' } }), null]);
ok(nj.error === 'basis_needs_justification' && nj.field === 'funds', 'המשך «רק חלק העובד» בלי ביסוס — נדחה, גם כשזה הבסיס הקודם', JSON.stringify(nj));
const fxj = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { fxBalances: 'declarationDateRate' }, basisJustification: { fxBalances: { text: 'נוהג מקצועי; הטופס שותק', source: 'professional-rules §3' } } }), null]);
const pj = await pay();
ok(fxj.ok && pj.basisJustification.fxBalances.value === 'declarationDateRate' && pj.basisJustification.fxBalances.by === OFFICE, 'פרשנות עם ביסוס: נשמרת, עם מי ומתי', JSON.stringify(pj.basisJustification));
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { fxBalances: 'declarationDateRate' } }), null])).ok, 'שמירה חוזרת של אותה בחירה — הביסוס כבר מתועד');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { businessAssets: 'notDecided' } }), null])).ok, '«טרם הוכרע» — מותר בלי ביסוס (לא נכנס לחישוב)');
const noExp = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { funds: 'allDeposits' } }), null]);
ok(noExp.error === 'basis_change_needs_explanation' && noExp.field === 'funds', 'שינוי בסיס מול הקודמת בלי הסבר — נדחה', JSON.stringify(noExp));
const withExp = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { funds: 'allDeposits', securities: 'cost' }, basisChange: { explanation: 'לשון הטופס: סכום כל ההפקדות; בהשוואה — מותאם' } }), null]);
const p3 = (await one(`select payload from public.onboarding_steps where id = $1`, [w1.stepId])).payload;
ok(withExp.ok && withExp.basisChanges === 2 && p3.basisChanges.length === 2 && p3.basisChanges.every(b => b.approvedBy === OFFICE && b.explanation && b.approvedAt), 'שינוי בסיס עם הסבר: נשמר, עם מי אישר ומתי', JSON.stringify(p3.basisChanges));
ok(p3.previous.basis.funds === 'employeeOnly' && p3.basis.funds === 'allDeposits', 'ההצהרה הקודמת נשמרת כפי שהייתה; הבסיס החדש בנפרד');
const again = await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { funds: 'allDeposits', securities: 'cost' } }), null]);
const p3b = (await one(`select payload from public.onboarding_steps where id = $1`, [w1.stepId])).payload;
ok(again.ok && again.basisChanges === 0 && p3b.basisChanges.length === 2, 'שמירה חוזרת של בסיס שכבר אושר — בלי הסבר נוסף ובלי רישום כפול', JSON.stringify(again));
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ basis: { funds: 'whatever' } }), null])).error === 'bad_basis', 'ערך בסיס לא מוכר — נדחה');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ status: 'completed' }), null])).error === 'bad_field', 'שדה שאינו מותר — נדחה');
ok(p3.history.length >= 4, `היסטוריה: ${p3.history.length} רשומות`);
await as(OTHER);
ok(!!(await throws(`select public.update_wealth_declaration('${w1.stepId}', '{"internalTarget":"2026-01-01"}'::jsonb, null)`)), 'משרד אחר לא יכול לעדכן');
await as(OFFICE);

// ── 4. הצהרה נוספת ליום מאוחר — המשך אוטומטית ──
const w2 = await rpc('ensure_wealth_declaration', ['c1', '2030-12-31', null]);
const p4 = (await one(`select payload from public.onboarding_steps where id = $1`, [w2.stepId])).payload;
ok(w2.kind === 'followup' && p4.previous.fromStepId === w1.stepId && p4.previous.asOfDate === '2025-12-31', 'יום מאוחר יותר ⇒ המשך, מקושר להכנה הקודמת', JSON.stringify(p4.previous));

// ── 5. החלה חוזרת, קטלוג, ושנת המס לא נפגעה ──
for (const [fn, mark] of [['add_tax_info_asks', '230 · הצהרת הון'], ['portal_submit_tax_info', '230 · הצהרת הון']]) {
  const n = (await one(`select (length(prosrc) - length(replace(prosrc, $1, ''))) / length($1) as n from pg_proc where proname = $2`, [mark, fn])).n;
  ok(n === 1, `${fn}: ההזרקה פעם אחת (${n})`);
}
const items = await rpc('_tax_year_items', []);
ok(JSON.stringify(Object.keys(items).sort()) === JSON.stringify(Object.keys(codeItems).sort()) && Object.entries(codeItems).every(([k, v]) => items[k] === v), `רשימת הפריטים בשרת = הקטלוג בקוד (${Object.keys(items).length})`);
const te = await rpc('ensure_tax_year_request', ['c1', 'estimate', 2026, 9]);
const tadd = await rpc('add_tax_info_asks', [te.stepId, JSON.stringify([{ itemKey: 'donations.given', subjectRole: 'client', prompt: P('תרמת?', 'yesno') }])]);
ok((await one(`select payload->>'title' t from public.onboarding_steps where id = $1`, [tadd.infoStepId])).t === 'השלמת מידע לשנת 2026', 'שנת מס: הכותרת כמו קודם');
await rpc('publish_tax_info', [tadd.infoStepId]);
const tv = await rpc('portal_tax_info', ['tok-c1', tadd.infoStepId]);
await rpc('portal_submit_tax_info', ['tok-c1', tv.asks[0].id, JSON.stringify({ kind: 'yes' })]);
const tf = await one(`select period_kind, basis, period_to from public.tax_year_facts where item_key = 'donations.given' and tax_year = 2026`);
ok(tf.period_kind === 'months' && tf.basis === 'actual_to_date' && tf.period_to.toISOString().slice(0, 10) === '2026-09-30', 'שנת מס: התקופה עד החתך — לא השתנתה', JSON.stringify(tf));

// ── 6. פריט לפי תכלית — לא מערבבים הון ושנת מס ──
const stepsBefore = (await one(`select count(*)::int n from public.onboarding_steps where step_type = 'info_collection'`)).n;
ok((await rpc('add_tax_info_asks', [te.stepId, JSON.stringify([{ itemKey: 'wealth.cash', subjectRole: 'couple', prompt: P('מזומן', 'amount') }])])).error === 'item_purpose_mismatch', 'שאלת הון בתוך הערכת מס — נדחית');
const w3 = await rpc('ensure_wealth_declaration', ['c1', '2025-06-30', null]);
ok((await rpc('add_tax_info_asks', [w3.stepId, JSON.stringify([{ itemKey: 'donations.given', subjectRole: 'client', prompt: P('תרמת?', 'yesno') }])])).error === 'item_purpose_mismatch', 'שאלת שנת מס בתוך הצהרת הון — נדחית');
ok((await one(`select count(*)::int n from public.onboarding_steps where step_type = 'info_collection'`)).n === stepsBefore, 'דחייה לא השאירה «השלמת מידע» ריקה');
// שתי הצהרות באותה שנה: אותו פריט, שתי עובדות נפרדות לפי יום ההצהרה
const a3 = await rpc('add_tax_info_asks', [w3.stepId, JSON.stringify([{ itemKey: 'wealth.cash', subjectRole: 'couple', prompt: P('מזומן', 'amount') }])]);
await rpc('publish_tax_info', [a3.infoStepId]);
const v3 = await rpc('portal_tax_info', ['tok-c1', a3.infoStepId]);
await rpc('portal_submit_tax_info', ['tok-c1', v3.asks[0].id, JSON.stringify({ kind: 'amount', amount: 5000 })]);
const cashes = (await db.query(`select period_to::text t, value from public.tax_year_facts where item_key = 'wealth.cash' order by period_to`)).rows;
ok(cashes.length === 2 && cashes[0].t === '2025-06-30' && Number(cashes[0].value) === 5000 && cashes[1].t === '2025-12-31' && Number(cashes[1].value) === 12000, 'שתי הצהרות באותה שנה — כל תשובה ליום שלה', JSON.stringify(cashes));

// ── 7. השמטה בהצהרה הקודמת — ממצא פתוח חוסם סגירה ──
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ omission: { add: { area: 'wBank' } } }), null])).error === 'omission_description_required', 'השמטה בלי תיאור — נדחית');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ omission: { add: { area: 'wBank', description: 'חשבון בחו״ל שהיה פתוח ב-2019 ולא הוצהר' } } }), null])).ok, 'השמטה נרשמה כממצא פתוח');
const om = (await pay()).omissions;
ok(om.length === 1 && om[0].status === 'open' && om[0].foundBy === OFFICE && om[0].id, 'הממצא: פתוח, עם מי ומתי', JSON.stringify(om));
ok(!!(await throws(`update public.onboarding_steps set status = 'completed' where id = '${w1.stepId}'`)), 'סגירה עם ממצא פתוח — נחסמת');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ omission: { resolve: { id: om[0].id } } }), null])).error === 'omission_resolution_required', 'סגירת ממצא בלי הכרעה כתובה — נדחית');
ok((await rpc('update_wealth_declaration', [w1.stepId, JSON.stringify({ omission: { resolve: { id: om[0].id, resolution: 'הועבר לבירור רו״ח; תיקון במסגרת גילוי מרצון' } } }), null])).ok, 'הממצא הוכרע עם נימוק');
ok((await pay()).omissions[0].status === 'resolved' && !(await throws(`update public.onboarding_steps set status = 'completed' where id = '${w1.stepId}'`)), 'אחרי הכרעה — אפשר לסגור');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

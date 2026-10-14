// בדיקת מיגרציה 231 (גרסאות הערכת מס) בבידוד: PGlite על הקמת 229 + 229 + 230 + 231.
//   PGLITE_DIR=<tmp> node scripts/sql/231/test-231-estimates.pglite.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const read = (f) => readFileSync(WT + f, 'utf8').replace(/\r\n/g, '\n');
const sql222 = read('supabase/222-request-preview.sql').replace(/\r\n/g, '\n');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = read('scripts/sql/229/test-229-tax-year.pglite.mjs');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);'))
  .replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

await db.exec(setup);
await db.exec(`create table auth.users (id uuid primary key); insert into auth.users values ('${OFFICE}'), ('${OTHER}');
  create table public.documents (id text primary key, client_id text not null);
  create table public.tax_fact_changes (id text primary key, client_id text, field_key text, source text, status text);`);
await db.exec(psi);
await db.exec(read('supabase/229-tax-year-collection.sql'));
await db.exec(read('supabase/230-wealth-declaration-collection.sql'));
await db.exec(read('supabase/231-tax-estimates.sql'));
await db.exec(read('supabase/231-tax-estimates.sql')); // החלה חוזרת
console.log('הוחל: 229 + 230 + 231 (פעמיים)');

await as(OFFICE);
await db.exec(`insert into public.clients values ('c3', '${OFFICE}', 'יעל', 'tok-c3', null, null)`);
const req = await rpc('ensure_tax_year_request', ['c1', 'estimate', 2026, 9]);
const D = (extra = {}) => JSON.stringify({ cutoffMonth: 9, preparedOn: '2026-10-11', lines: [{ id: 'b1', person: 'client', chosen: 'office' }], reconciliations: [], ...extra });
const O = (blockers = [], extra = {}) => JSON.stringify({ taxYear: 2026, blockers, rulesetVersion: 'r1', nextAction: 'x', ...extra });
const save = (stepId, d, o, base, facts = '[]') => rpc('save_tax_estimate', [stepId, d, o, facts, base == null ? null : JSON.stringify(base)]);
const row = (id) => one(`select * from public.tax_estimates where id = $1`, [id]);

// ── 1. שמירה ופתיחה מחדש: טיוטה אחת, מספר עדכון עולה ──
const s1 = await save(req.stepId, D(), O([{ code: 'missing_actual', text: 'חסר' }]), { latestVersion: 0 });
ok(s1.ok && s1.created && s1.version === 1 && s1.revision === 1, 'שמירה ראשונה ⇒ גרסה 1, עדכון 1', JSON.stringify(s1));
const s1b = await save(req.stepId, D({ note: 'עדכון' }), O([{ code: 'missing_actual', text: 'חסר' }]), { draftId: s1.id, revision: 1 });
ok(s1b.ok && !s1b.created && s1b.id === s1.id && s1b.revision === 2, 'שמירה על הטיוטה ⇒ אותה שורה, עדכון 2', JSON.stringify(s1b));
ok((await row(s1.id)).draft.note === 'עדכון', 'פתיחה מחדש מחזירה את מה שנשמר');

// ── 2. עריכה במקביל ולחיצה כפולה: אין דריסה ──
const stale = await save(req.stepId, D({ note: 'מחלון ישן' }), O(), { draftId: s1.id, revision: 1 });
ok(stale.error === 'conflict' && stale.current.revision === 2, 'שמירה מחלון שראה עדכון 1 — «conflict» עם המצב הנוכחי', JSON.stringify(stale));
ok((await row(s1.id)).draft.note === 'עדכון', 'הנתונים של העדכון החדש לא נדרסו');
const dbl1 = await save(req.stepId, D({ note: 'לחיצה 1' }), O(), { draftId: s1.id, revision: 2 });
const dbl2 = await save(req.stepId, D({ note: 'לחיצה 1' }), O(), { draftId: s1.id, revision: 2 });
ok(dbl1.ok && dbl1.revision === 3 && dbl2.error === 'conflict', 'לחיצה כפולה: השנייה נדחית, הראשונה נשמרה פעם אחת', JSON.stringify([dbl1, dbl2]));
ok((await save(req.stepId, D(), O(), null)).error === 'base_required', 'שמירה בלי «מה ראיתי» — נדחית');
ok((await save(req.stepId, D(), O([], { taxYear: 2025 }), { draftId: s1.id, revision: 3 })).error === 'year_mismatch', 'תוצאה של שנה אחרת לבקשת 2026 — נדחית');
ok((await save(req.stepId, D({ cutoffMonth: 13 }), O(), { draftId: s1.id, revision: 3 })).error === 'bad_cutoff', 'חודש חתך לא תקין — נדחה');
const wd = await rpc('ensure_wealth_declaration', ['c1', '2025-12-31', null]);
ok((await save(wd.stepId, D(), O(), { latestVersion: 0 })).error === 'bad_request', 'הערכה רק על בקשת «הערכת מס»');

// ── 3. התאוששות מכשל: פעולה שנכשלה באמצע לא משאירה חצי מצב ──
await db.exec('begin');
await save(req.stepId, D({ note: 'בתוך עסקה שנכשלה' }), O(), { draftId: s1.id, revision: 3 });
await db.exec('rollback');
const afterFail = await row(s1.id);
ok(afterFail.revision === 3 && afterFail.draft.note === 'לחיצה 1', 'כשל באמצע ⇒ חוזר לעדכון 3', JSON.stringify({ r: afterFail.revision, n: afterFail.draft.note }));
ok((await save(req.stepId, D({ note: 'לחיצה 1' }), O(), { draftId: s1.id, revision: 3 })).revision === 4, 'ניסיון חוזר אחרי כשל, עם אותו בסיס — נשמר');

// ── 4. אישור: חוסמים, יישור פתוח, תחזית, ומאשרים בדיוק את מה שהוצג ──
await save(req.stepId, D(), O([{ code: 'missing_actual', text: 'חסר' }]), { draftId: s1.id, revision: 4 });
const a1 = await rpc('approve_tax_estimate', [s1.id, 5]);
ok(a1.error === 'has_blockers' && a1.blockers.length === 1, 'אישור עם חוסם — נדחה, עם הרשימה', JSON.stringify(a1));
await save(req.stepId, D({ reconciliations: [{ id: 'r1', lineId: 'b1' }] }), O(), { draftId: s1.id, revision: 5 });
ok((await rpc('approve_tax_estimate', [s1.id, 6])).error === 'reconciliation_open', 'יישור שלא הוכרע — חוסם בשרת');
await save(req.stepId, D({ lines: [{ id: 'b1' }] }), O(), { draftId: s1.id, revision: 6 });
ok((await rpc('approve_tax_estimate', [s1.id, 7])).error === 'forecast_not_chosen', 'תחזית שלא נבחרה — חוסמת בשרת');
const fullD = D({ assumptions: 'קצב חודשי', decisions: [{ ruleId: 'x', text: 'הכרעה' }], catchUps: [{ id: 'cu', justification: 'דרישה', approvedAt: '2026-10-11' }] });
const fullO = O([], { household: { annualLiability: 65168 }, usedRules: [{ ruleId: 'core.creditPoint', basis: 'primary', taxYear: 2026 }], rulesetVersion: 'r2' });
await save(req.stepId, fullD, fullO, { draftId: s1.id, revision: 7 }, JSON.stringify([{ id: 'f1', value: 100 }]));
await as(OTHER);
ok(!!(await throws(`select public.approve_tax_estimate('${s1.id}', 8)`)), 'משרד אחר לא יכול לאשר');
ok(!!(await throws(`select public.save_tax_estimate('${req.stepId}', '{"cutoffMonth":9}'::jsonb, '{}'::jsonb, '[]'::jsonb, '{"draftId":"${s1.id}","revision":8}'::jsonb)`)), 'משרד אחר לא יכול לשמור');
await as(OFFICE);
ok((await rpc('approve_tax_estimate', [s1.id, 7])).error === 'conflict', 'אישור של מה שהוצג לפני השמירה האחרונה — «conflict»');
const a2 = await rpc('approve_tax_estimate', [s1.id, 8]);
const e1 = await row(s1.id);
ok(a2.ok && e1.status === 'approved' && e1.approved_by === OFFICE && e1.approved_at, 'אישור: מי ומתי', JSON.stringify(a2));
ok(e1.draft.assumptions === 'קצב חודשי' && e1.draft.decisions.length === 1 && e1.draft.catchUps[0].justification === 'דרישה'
  && e1.outputs.household.annualLiability === 65168 && e1.outputs.usedRules[0].basis === 'primary' && e1.ruleset_version === 'r2' && e1.input_facts[0].value === 100,
  'הגרסה המאושרת שומרת נתונים, הנחות, הכרעות, השלמות, תוצאה, כללים וגרסת המרשם');

// ── 5. אחרי אישור: שינוי = גרסה חדשה; הישנה נשמרת ──
ok(!!(await throws(`update public.tax_estimates set outputs = '{}'::jsonb where id = '${s1.id}'`)), 'עריכה ישירה של גרסה מאושרת — נחסמת בטריגר');
ok(!!(await throws(`update public.tax_estimates set revision = 99 where id = '${s1.id}'`)), 'גם מספר העדכון של גרסה מאושרת קפוא');
ok((await save(req.stepId, D({ note: 'תחזית חדשה' }), O(), { draftId: s1.id, revision: 8 })).error === 'conflict', 'שמירה «על» הגרסה שאושרה — «conflict» (נפתחת גרסה חדשה)');
const s2 = await save(req.stepId, D({ note: 'תחזית חדשה' }), O(), { latestVersion: 1 });
const s2dup = await save(req.stepId, D({ note: 'חלון שני' }), O(), { latestVersion: 1 });
ok(s2.ok && s2.created && s2.version === 2 && s2dup.error === 'conflict', 'שינוי תחזית אחרי אישור ⇒ גרסה 2; חלון שני שפותח גרסה במקביל — «conflict»', JSON.stringify([s2, s2dup]));
const v1 = await row(s1.id);
ok(v1.draft.note === undefined && v1.status === 'approved', 'גרסה 1 נשארה כפי שאושרה');
ok((await rpc('approve_tax_estimate', [s1.id, 8])).error === 'not_draft', 'אישור חוזר של גרסה מאושרת — נדחה');
await rpc('approve_tax_estimate', [s2.id, 1]);
const st = await q(`select version, status from public.tax_estimates where request_id = $1 order by version`, [req.stepId]);
ok(st.length === 2 && st[0].status === 'superseded' && st[1].status === 'approved', 'אישור גרסה 2 ⇒ גרסה 1 «הוחלפה» ונשמרת', JSON.stringify(st));
ok(!!(await throws(`update public.tax_estimates set status = 'approved' where id = '${s1.id}'`)), 'גרסה שהוחלפה — לא חוזרת');

// ── 6. בלי ערבוב: לקוחות, שנים ובקשות נפרדים ──
const r25 = await rpc('ensure_tax_year_request', ['c1', 'estimate', 2025, 12]);
const r3 = await rpc('ensure_tax_year_request', ['c3', 'estimate', 2026, 9]);
const x25 = await save(r25.stepId, D({ cutoffMonth: 12 }), O([], { taxYear: 2025 }), { latestVersion: 0 });
const x3 = await save(r3.stepId, D(), O(), { latestVersion: 0 });
ok(x25.ok && x25.version === 1 && x3.ok && x3.version === 1, 'שנה אחרת ולקוח אחר — כל אחד מתחיל בגרסה 1 משלו', JSON.stringify([r25, r3, x25, x3]));
ok((await save(r3.stepId, D(), O(), { draftId: s2.id, revision: 1 })).error === 'conflict', 'בסיס של בקשה אחרת — לא נשמר על הבקשה הזו');
const mix = await q(`select client_id, tax_year, count(*)::int n from public.tax_estimates group by 1, 2 order by 1, 2`);
ok(mix.length === 3 && mix.find(m => m.client_id === 'c3').n === 1 && mix.find(m => m.tax_year === 2025).n === 1, 'כל גרסה שייכת לבקשה, ללקוח ולשנה שלה', JSON.stringify(mix));

// ── 7. בקשה סגורה, הרשאות קריאה, חתימות ──
await db.exec(`update public.onboarding_steps set status = 'completed' where id = '${req.stepId}'`);
ok((await save(req.stepId, D(), O(), { latestVersion: 2 })).error === 'request_closed', 'בקשה שנסגרה — אין שמירה');
const pol = await one(`select count(*)::int n from pg_policies where tablename = 'tax_estimates' and cmd = 'SELECT'`);
ok(pol.n === 1, 'מדיניות קריאה בלבד לבעלים; אין מדיניות כתיבה');
const fns = await q(`select p.proname, pg_get_function_identity_arguments(p.oid) a from pg_proc p where p.proname in ('save_tax_estimate','approve_tax_estimate') order by 1`);
ok(fns.length === 2, 'אין חתימות ישנות שנשארו (העמסה)', JSON.stringify(fns));

// ── 8. התאוששות: ההחזרה מסירה הכול, ואפשר להחיל שוב ──
await db.exec(read('scripts/sql/231/rollback-231.sql'));
const gone = await one(`select to_regclass('public.tax_estimates') t, (select count(*)::int from pg_proc where proname in ('save_tax_estimate','approve_tax_estimate','_tax_estimate_immutable')) f`);
ok(gone.t === null && gone.f === 0, 'החזרה: הטבלה והפונקציות הוסרו', JSON.stringify(gone));
await db.exec(read('supabase/231-tax-estimates.sql'));
ok((await save(r3.stepId, D(), O(), { latestVersion: 0 })).ok, 'החלה מחדש אחרי החזרה — עובדת');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

// בדיקת 233 (גרסאות הדוח השנתי) + 258 (שורות מקור) בבידוד — PGlite, על ההקמה של בדיקת 229 + 229 עצמה.
//   PGLITE_DIR=<תיקייה עם node_modules/@electric-sql/pglite> node scripts/sql/233/test-233-258.pglite.mjs
// מה נבדק: 233 — שמירת טיוטה (גרסה 1, בסיס «מה ראיתי», התנגשות), אישור רק בלי חוסמים ורק «גיליון מלא», גרסה מאושרת לא נערכת,
//   רישום הגשה פעם אחת עם אסמכתה, גרסה 2 אחרי אישור («הוחלפה»), משרד אחר אסור, anon חסום.
// 258 — העמודות; הזנת מסמך חדש ⇒ מסמך מאושר + שורות מאושרות עם line_key/entered_by/evidence_id; שמירה חוזרת מחליפה (supersedes);
//   שורה שירדה — «הוחלפה»; אישור מתקן מחליף את שורות המסמך הקודם; פריט לא מוכר / ערך רע נדחים לפני כל כתיבה; מסמך «לא תואם» חוסם;
//   משרד אחר אסור; anon חסום; החלה חוזרת לא משנה.
// ‼ CRLF בעותקי pivo-wt — מנרמלים כל קריאה (worktree-crlf-breaks-pglite-harness).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const read = (p) => readFileSync(WT + p, 'utf8').replace(/\r\n/g, '\n');
const sql229 = read('supabase/229-tax-year-collection.sql');
const sql233 = read('supabase/233-annual-returns.sql');
const sql258 = read('supabase/258-return-source-lines.sql');
const sql222 = read('supabase/222-request-preview.sql');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = read('scripts/sql/229/test-229-tax-year.pglite.mjs');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);')).replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);
const announce = t229.slice(t229.indexOf('await db.exec(`create function public._client_announceable_steps') + 'await db.exec(`'.length, t229.indexOf('$f$;`);') + '$f$;'.length);

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 300)}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };
const J = (x) => JSON.stringify(x);

await db.exec(setup);
await db.exec(`create table auth.users (id uuid primary key); insert into auth.users values ('${OFFICE}'), ('${OTHER}');
  create table public.documents (id text primary key, client_id text not null, file_name text);
  insert into public.documents values ('doc1', 'c1', 'אישור הגשה.pdf'), ('docX', 'c2', 'של אחר.pdf');`);
await db.exec(psi); await db.exec(announce);
await db.exec(sql229);
await db.exec(sql233); await db.exec(sql233);
await db.exec(sql258); await db.exec(sql258);
console.log('הוחל: 222 (_portal_step_items) + 229 + 233 ×2 + 258 ×2');

// ── 233 · גרסאות ──
await as(OFFICE);
const step = await one(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload) values ('${OFFICE}', 'c1', 'annual_return', 'internal', 'person', 'in_progress', '{"taxYear":2025,"purpose":"annual"}') returning id`);
const draft = { taxYear: 2025, preparedOn: '2026-03-01', persons: ['client'], completions: [], adjustments: [], micro: {}, decisions: [] };
const outDraft = { taxYear: 2025, status: 'internalDraft', blockers: [{ code: 'x', text: 'חסר' }], unsupported: [], rulesetVersion: 'r1', formVersionId: '1301@2025' };
const outFull = { taxYear: 2025, status: 'completeWorksheet', blockers: [], unsupported: [], rulesetVersion: 'r1', formVersionId: '1301@2025' };
let r = await rpc('save_annual_return', [step.id, J(draft), J(outDraft), '[]', J({ latestVersion: 0 })]);
ok(r.ok && r.created && r.version === 1 && r.revision === 1, '233: שמירה ראשונה ⇒ גרסה 1 (טיוטה)', J(r));
const v1 = r.id;
r = await rpc('save_annual_return', [step.id, J(draft), J(outDraft), '[]', J({ latestVersion: 0 })]);
ok(!r.ok && r.error === 'conflict' && r.current?.draftId === v1, '233: שמירה עם בסיס ישן ⇒ התנגשות עם «מה שנשמר»', J(r));
r = await rpc('save_annual_return', [step.id, J(draft), J(outDraft), '[]', J({ draftId: v1, revision: 1 })]);
ok(r.ok && !r.created && r.revision === 2, '233: שמירה על הבסיס הנכון ⇒ מהדורה 2 של אותה טיוטה', J(r));
ok((await rpc('save_annual_return', [step.id, J({ ...draft, taxYear: 2024 }), J(outDraft), '[]', J({ draftId: v1, revision: 2 })])).error === 'year_mismatch', '233: שנה אחרת מהבקשה נדחית');
r = await rpc('approve_annual_return', [v1, 2]);
ok(!r.ok && r.error === 'has_blockers', '233: אישור עם חוסמים — נדחה', J(r));
await rpc('save_annual_return', [step.id, J(draft), J({ ...outFull, status: 'partialWorksheet' }), '[]', J({ draftId: v1, revision: 2 })]);
ok((await rpc('approve_annual_return', [v1, 3])).error === 'not_ready', '233: גיליון חלקי אינו «מוכן להגשה»');
await rpc('save_annual_return', [step.id, J(draft), J(outFull), '[]', J({ draftId: v1, revision: 3 })]);
ok((await rpc('approve_annual_return', [v1, 3])).error === 'conflict', '233: אישור עם מהדורה ישנה — התנגשות');
r = await rpc('approve_annual_return', [v1, 4]);
ok(r.ok && r.version === 1, '233: גיליון מלא בלי חוסמים ⇒ אושר «מוכן להגשה»', J(r));
const imm = await throws(`update public.annual_returns set draft = '{"taxYear":2025,"x":1}'::jsonb where id = $1`, [v1]);
ok(!!imm && imm.includes('annual_return_approved'), '233: גרסה מאושרת אינה נערכת', imm);
ok((await rpc('record_annual_return_filed', [v1, '2099-01-01', 'A1', null])).error === 'bad_date', '233: תאריך הגשה עתידי נדחה');
ok((await rpc('record_annual_return_filed', [v1, '2026-06-01', '', null])).error === 'evidence_required', '233: הגשה בלי אסמכתה נדחית');
ok((await rpc('record_annual_return_filed', [v1, '2026-06-01', '', 'docX'])).error === 'evidence_not_found', '233: מסמך של לקוח אחר אינו אסמכתה');
r = await rpc('record_annual_return_filed', [v1, '2026-06-01', 'ASM-1', 'doc1']);
ok(r.ok, '233: רישום הגשה (ידני) עם אסמכתה', J(r));
ok((await rpc('record_annual_return_filed', [v1, '2026-06-02', 'ASM-2', null])).error === 'already_filed', '233: רישום הגשה פעם אחת בלבד');
r = await rpc('save_annual_return', [step.id, J(draft), J(outDraft), '[]', J({ latestVersion: 1 })]);
ok(r.ok && r.created && r.version === 2, '233: שמירה אחרי אישור ⇒ גרסה 2 (דוח מתקן) — המאושרת נשארת', J(r));
await rpc('save_annual_return', [step.id, J(draft), J(outFull), '[]', J({ draftId: r.id, revision: 1 })]);
ok((await rpc('approve_annual_return', [r.id, 2])).ok, '233: אישור גרסה 2');
const st = await q(`select version, status, filed_ref from public.annual_returns where request_id = $1 order by version`, [step.id]);
ok(st.length === 2 && st[0].status === 'superseded' && st[0].filed_ref === 'ASM-1' && st[1].status === 'approved', '233: גרסה 1 «הוחלפה» ושומרת את רישום ההגשה שלה', J(st));
await as(OTHER);
ok(!!(await throws(`select public.save_annual_return($1, $2::jsonb, $3::jsonb, '[]'::jsonb, '{"latestVersion":2}'::jsonb)`, [step.id, J(draft), J(outDraft)])), '233: משרד אחר — אסור');
await as(OFFICE);
const perms = await one(`select has_function_privilege('anon', 'public.save_annual_return(text,jsonb,jsonb,jsonb,jsonb)', 'execute') a1,
  has_function_privilege('anon', 'public.record_source_lines(text,uuid,jsonb,jsonb,uuid)', 'execute') a2,
  has_function_privilege('authenticated', 'public.record_source_lines(text,uuid,jsonb,jsonb,uuid)', 'execute') au,
  (select relrowsecurity from pg_class where relname = 'annual_returns') rls`);
ok(!perms.a1 && !perms.a2 && perms.au && perms.rls, 'anon חסום לשתי הפונקציות; מחובר מורשה; RLS על annual_returns', J(perms));

// ── 258 · שורות מקור ──
const cols = await q(`select column_name from information_schema.columns where table_name = 'tax_year_facts' and column_name in ('line_key','entered_by')`);
ok(cols.length === 2, '258: העמודות line_key ו-entered_by קיימות');
const line = (lineKey, itemKey, value, extra = {}) => ({ lineKey, itemKey, subjectRole: 'client', entityKind: 'employer', entityRef: 'em1', taxYear: 2025, value, ...extra });
const ev106 = { docKind: 'form106', subjectRole: 'client', entityKind: 'employer', entityRef: 'em1', taxYear: 2025, fileName: '106-2025.pdf' };
r = await rpc('record_source_lines', ['c1', null, J(ev106), J([line('106.gross', 'salary.amounts', { gross: 152855 }), line('106.withheld', 'salary.amounts', { withheld: 19979 }), line('106.insured', 'salary.amounts', { insured: 140000 })]), null]);
ok(r.ok && r.evidenceId && r.factIds.length === 3 && r.superseded === 0, '258: מסמך חדש ⇒ 3 שורות מקור', J(r));
const E1 = r.evidenceId;
const ev = await one(`select doc_kind, review, extraction, identity_match, period_match, received_via, period_from::text pf, period_to::text pt from public.tax_evidence where id = $1`, [E1]);
ok(ev.doc_kind === 'form106' && ev.review === 'accepted' && ev.extraction === 'office_entered' && ev.identity_match === 'match' && ev.received_via === 'office' && ev.pf === '2025-01-01' && ev.pt === '2025-12-31', '258: המסמך נרשם מאושר, «הוזן במשרד», לשנת המס', J(ev));
let fs = await q(`select line_key, item_key, value, status, source, basis, entered_by, evidence_id, decided_by from public.tax_year_facts where evidence_id = $1 order by line_key`, [E1]);
ok(fs.length === 3 && fs.every(f => f.status === 'accepted' && f.source === 'document' && f.basis === 'final' && f.entered_by === OFFICE && f.evidence_id === E1) && fs[0].line_key === '106.gross' && fs[0].value.gross === 152855,
  '258: כל שורה — מאושרת, «מסמך», סופית, עם מי הזין ועם המסמך', J(fs));
// שמירה חוזרת: סכום תוקן, שורה אחת ירדה
r = await rpc('record_source_lines', ['c1', E1, null, J([line('106.gross', 'salary.amounts', { gross: 152900 }), line('106.withheld', 'salary.amounts', { withheld: 19979 })]), null]);
ok(r.ok && r.evidenceId === E1 && r.factIds.length === 2 && r.superseded === 3, '258: שמירה חוזרת של אותו מסמך מחליפה את שורותיו', J(r));
fs = await q(`select line_key, status, value, supersedes from public.tax_year_facts where evidence_id = $1 order by created_at, line_key`, [E1]);
const live = fs.filter(f => f.status === 'accepted'), old = fs.filter(f => f.status === 'superseded');
ok(live.length === 2 && live.find(f => f.line_key === '106.gross').value.gross === 152900 && old.length === 3 && live.every(f => !!f.supersedes), '258: הישנות «הוחלפו» (גם השורה שירדה), החדשות מצביעות אליהן', J(fs));
// אישור מתקן: מסמך חדש מחליף את שורות הקודם
r = await rpc('record_source_lines', ['c1', null, J({ ...ev106, fileName: '106-מתקן.pdf' }), J([line('106.gross', 'salary.amounts', { gross: 150000 })]), E1]);
ok(r.ok && r.evidenceId !== E1 && r.superseded >= 2, '258: אישור מתקן ⇒ מסמך חדש, שורות הקודם יוצאות מהחישוב', J(r));
const prevNote = await one(`select note, (select count(*)::int from public.tax_year_facts where evidence_id = $1 and status = 'accepted') n from public.tax_evidence where id = $1`, [E1]);
ok(prevNote.n === 0 && /הוחלף באישור מתקן/.test(prevNote.note ?? ''), '258: במסמך הקודם אין שורות חיות, והוא מסומן', J(prevNote));
// אימות לפני כתיבה
const before = (await one(`select count(*)::int n from public.tax_year_facts`)).n;
r = await rpc('record_source_lines', ['c1', null, J(ev106), J([line('106.gross', 'salary.amounts', { gross: 1 }), line('x', 'no.such', 5)]), null]);
ok(!r.ok && r.error === 'unknown_item' && (await one(`select count(*)::int n from public.tax_year_facts`)).n === before, '258: פריט לא מוכר ⇒ שום דבר לא נכתב', J(r));
ok((await rpc('record_source_lines', ['c1', null, J(ev106), J([line('106.gross', 'salary.amounts', 'abc')]), null])).error === 'bad_value', '258: ערך שאינו מספר/רכיבים נדחה');
ok((await rpc('record_source_lines', ['c1', null, J(ev106), J([line('', 'salary.amounts', 5)]), null])).error === 'line_key_required', '258: שורה בלי מפתח נדחית');
ok((await rpc('record_source_lines', ['c1', null, J(ev106), '[]', null])).error === 'no_lines', '258: בלי שורות — אין מה לשמור');
ok((await rpc('record_source_lines', ['c1', null, J({ subjectRole: 'client' }), J([line('a', 'salary.amounts', 5)]), null])).error === 'evidence_required', '258: מסמך חדש בלי סוג נדחה');
// מסמך קיים שסומן «לא תואם» — לא מזינים ממנו
const bad = await one(`insert into public.tax_evidence (user_id, client_id, tax_year, doc_kind, subject_role, received_via, identity_match) values ('${OFFICE}', 'c1', 2025, 'form106', 'client', 'portal', 'mismatch') returning id`);
ok((await rpc('record_source_lines', ['c1', bad.id, null, J([line('106.gross', 'salary.amounts', 5)]), null])).error === 'evidence_mismatch', '258: מסמך שסומן «לא תואם» חוסם הזנה');
// מסמך שהלקוח העלה (ממתין לבדיקה) — ההזנה מאשרת אותו
const up = await one(`insert into public.tax_evidence (user_id, client_id, tax_year, doc_kind, subject_role, received_via) values ('${OFFICE}', 'c1', 2025, 'niAnnualCert', 'spouse', 'portal') returning id`);
r = await rpc('record_source_lines', ['c1', up.id, null, J([{ lineKey: 'ni.paid', itemKey: 'payments.niPaid', subjectRole: 'spouse', taxYear: 2025, value: { amount: 11676, health: 5144 } }]), null]);
const upEv = await one(`select review, extraction, identity_match, period_match from public.tax_evidence where id = $1`, [up.id]);
ok(r.ok && upEv.review === 'accepted' && upEv.extraction === 'office_entered' && upEv.identity_match === 'match', '258: הזנה ממסמך שהלקוח העלה = בדיקת המשרד ואישורו', J([r, upEv]));
await as(OTHER);
ok(!!(await throws(`select public.record_source_lines('c1', null, $1::jsonb, $2::jsonb, null)`, [J(ev106), J([line('106.gross', 'salary.amounts', 5)])])), '258: משרד אחר — אסור');
await as(OFFICE);
ok((await rpc('record_source_lines', ['c1', up.id, null, J([{ lineKey: 'a', itemKey: 'payments.niPaid', subjectRole: 'client', taxYear: 2025, value: 1 }]), 'c0ffee00-0000-0000-0000-000000000000'])).error === 'replaced_not_found', '258: «מתקן» למסמך שאינו קיים נדחה');

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

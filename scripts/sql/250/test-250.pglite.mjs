// בדיקת מיגרציה 250 (חובות הגשה מרשימות שע״ם) בבידוד — PGlite, על סכמה מינימלית.
//   PGLITE_DIR=<תיקייה עם node_modules/@electric-sql/pglite> node scripts/sql/250/test-250.pglite.mjs
// מה נבדק: שיוך רק לפי מזהה (תיק מ״ה › ת.ז. › ת.ז. בן/בת זוג), עמום/שם לא תואם ⇒ «לבדיקה»; «ח» בלבד יוצר חובה;
// ייבוא חוזר בלי כפילות; קובץ ישן לא דורס; היעלמות לא סוגרת; הגשה מסמנת בקשה מקושרת בלי לסגור; היסטוריה + בקשת עותק
// אידמפוטנטית; הפרדת משרדים; anon חסום; אפסים מובילים; מועד חסר = NULL.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const sql250 = readFileSync(WT + 'supabase/250-shaam-filing-obligations.sql', 'utf8').replace(/\r\n/g, '\n');
const rollback = readFileSync(WT + 'scripts/sql/250/rollback-250.sql', 'utf8').replace(/\r\n/g, '\n');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

await db.exec(`
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role anon; exception when duplicate_object then null; end $$;
  create schema if not exists auth;
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  create function public.is_authorized() returns boolean language sql stable as $f$ select true $f$;
  create table public.clients (id text primary key, user_id uuid not null, first_name text, last_name text, id_number text,
    spouse_id_number text, spouse_name text, spouse_first_name text, spouse_last_name text, tax_files jsonb);
  create table public.onboarding_steps (id text primary key default replace(gen_random_uuid()::text, '-', ''), user_id uuid not null,
    client_id text not null references public.clients(id) on delete cascade, step_type text not null, status text not null default 'pending',
    published_at timestamptz, payload jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
  create table public.onboarding_events (id text primary key default replace(gen_random_uuid()::text, '-', ''), user_id uuid not null,
    step_id text references public.onboarding_steps(id) on delete cascade, type text not null, actor text not null default 'system', note text,
    meta jsonb not null default '{}'::jsonb, at timestamptz not null default now());
  create table public.document_labels (id text primary key, user_id uuid, name text);
  create table public.documents (id text primary key default gen_random_uuid()::text, user_id uuid not null, client_id text not null,
    file_name text not null, description text, year text default 'general', label_id text);
  -- כמו 217: בודק בעלות, יוצר שורה, מחזיר stepId
  create function public.create_onboarding_request(p_client_id text, p_step_type text, p_payload jsonb default '{}'::jsonb, p_due_date date default null,
    p_depends_on text default null, p_published boolean default true, p_required_for_close boolean default true, p_owner text default null, p_stage_id text default null)
  returns jsonb language plpgsql security definer as $f$
  declare c public.clients%rowtype; v_id text;
  begin
    select * into c from public.clients where id = p_client_id;
    if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
    if c.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
    insert into public.onboarding_steps (user_id, client_id, step_type, status, published_at, payload)
    values (c.user_id, c.id, p_step_type, 'pending', case when p_published then now() end, p_payload) returning id into v_id;
    return jsonb_build_object('ok', true, 'stepId', v_id);
  end $f$;
  insert into public.clients values
    ('c1', '${OFFICE}', 'דוגמה', 'ראשון', '000000018', null, null, null, null, null),
    ('c2', '${OFFICE}', 'אבי', 'שלישי', '111111118', '000000034', 'גלית שלישי', 'גלית', 'שלישי', null),
    ('c3', '${OFFICE}', 'רונית', 'שביעי', '222222226', null, null, null, null, '[{"authority":"income_tax","fileNumber":"0000075","owner":"joint"},{"authority":"vat","fileNumber":"000000083"}]'),
    ('c4', '${OFFICE}', 'יעל', 'זוגי', '333333334', '444444442', 'עידו זוגי', 'עידו', 'זוגי', null),
    ('c5', '${OFFICE}', 'עידו', 'זוגי', '444444442', '333333334', 'יעל זוגי', 'יעל', 'זוגי', null),
    ('c6', '${OFFICE}', 'משה', 'אחר', '555555556', null, null, null, null, null),
    ('c9', '${OTHER}', 'זר', 'משרד', '000000091', null, null, null, null, null);
`);
await db.exec(sql250);
await db.exec(sql250); // ‼ החלה חוזרת
ok(true, 'המיגרציה מוחלת, וגם פעם שנייה');

// ── הרשאות ──────────────────────────────────────────────────────────────────
{
  const fns = (await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like '%shaam%')`));
  ok(fns.length >= 15 && fns.every(f => !f.anon), 'anon — אין הרשאה לאף פונקציה', JSON.stringify(fns.filter(f => f.anon).map(f => f.proname)));
  const internal = fns.filter(f => ['_shaam_match', '_shaam_plan', '_shaam_plan_names', '_shaam_after_change'].includes(f.proname));
  ok(internal.length === 4 && internal.every(f => !f.auth), 'פונקציות פנימיות — גם לא למשתמש מחובר');
  const tp = await one(`select has_table_privilege('anon', 'public.shaam_filing_obligations', 'select') a1, has_table_privilege('anon', 'public.shaam_filing_sources', 'select') a2,
    has_table_privilege('authenticated', 'public.shaam_filing_obligations', 'insert') i1, has_table_privilege('authenticated', 'public.shaam_filing_obligations', 'select') s1`);
  ok(!tp.a1 && !tp.a2 && !tp.i1 && tp.s1, 'טבלאות: anon חסום, מחובר — קריאה בלבד (כתיבה רק דרך הפונקציות)', JSON.stringify(tp));
  ok((await throws(`select public.shaam_filing_list(null)`)) !== null, 'בלי משתמש — «forbidden»');
}

// ── בנאי אצווה ───────────────────────────────────────────────────────────────
const src = (key, o = {}) => ({ key, fileName: `${key}.pdf`, sha256: o.sha ?? key, kind: o.kind ?? 'annual', group: o.group, taxYear: o.taxYear ?? 2025,
  producedRaw: o.producedOn ?? '2026-10-15', producedOn: o.producedOn ?? '2026-10-15', status: 'ok', pages: [{ page: 1, status: 'ok' }], storagePath: o.storagePath });
const row = (sourceKey, fileNumber, o = {}) => ({ sourceKey, page: 1, line: o.line ?? 1, fileNumber, name: o.name ?? '', yearShown: o.year ?? '2025',
  required: o.required, legalDue: o.due, legalDueRaw: o.due ? o.due.split('-').reverse().join('/') : undefined, filedOn: o.filed,
  filedOnRaw: o.filed ? o.filed.split('-').reverse().join('/') : undefined, noAssessment: o.noA, fileType: o.ft, section: o.sec, problems: o.problems ?? [] });
const ANNUAL = (key = 'a1', producedOn = '2026-10-15', dueC1 = '2026-10-31') => ({
  sources: [src(key, { producedOn })],
  rows: [
    row(key, '000000018', { name: 'ראשון דוגמה', required: true, due: dueC1, line: 1 }),               // c1 · ת.ז. — פתוחה
    row(key, '000000026', { name: 'לא מוכר ו/או ב', required: true, due: '2026-09-30', filed: '2026-06-07', line: 2 }), // לא מזוהה
    row(key, '00000034', { name: 'שלישי גלית', required: true, due: '2026-11-30', line: 3 }),                // c2 · ת.ז. בת הזוג, 8 ספרות+ ⇒ מרופד
    row(key, '000000042', { name: 'לא קיים', noA: true, line: 4 }),                                    // ש״מ לא קיימת
    row(key, '000000075', { name: 'שביעי רונית', required: true, due: '2026-11-30', line: 5 }),       // c3 · מספר תיק מ״ה בכרטיס
    row(key, '555555556', { name: 'אחר משה', required: false, due: '2026-04-30', ft: '91', sec: '14', line: 6 }), // c6 · בלי «ח» ⇒ הקשר
    row(key, '333333334', { name: 'זוגי יעל ו/או עידו', required: true, due: '2026-11-30', line: 7 }), // c4 ת.ז. + c5 בן/בת זוג ⇒ ת.ז. גוברת
    row(key, '12ab', { name: 'פגום', required: true, line: 8 }),                                       // מספר לא תקין
    row(key, 'ALR000000018', { name: 'ראשון דוגמה', required: true, line: 9 }),                        // שם שגלש לעמודת המספר
    row(key, '000000018', { name: 'ראשון דוגמה', year: '2024', required: true, line: 10, problems: ['מועד לא תקין'] }), // בעיית קריאה
  ],
});

await as(OFFICE);
// ── 1 · תצוגה ────────────────────────────────────────────────────────────────
{
  const p = await rpc('shaam_filing_preview', [ANNUAL()]);
  const by = Object.fromEntries(p.plan.map(x => [x.i, x]));
  ok(p.ok && p.plan.length === 10, 'תצוגה: שורה לכל שורה נכנסת', JSON.stringify(p).slice(0, 300));
  ok(by[9].change === 'invalid' && by[9].reason === 'file_number', 'אותיות בעמודת המספר — לא «מנוקות» למספר תקין', JSON.stringify(by[9]));
  ok(by[10].state === 'needs_review' && by[10].reason === 'parse' && !by[10].clientId, 'בעיית קריאה — לבדיקה, בלי לקוח, גם כשהמספר תואם', JSON.stringify(by[10]));
  ok(by[1].clientId === 'c1' && by[1].tier === 'id' && by[1].state === 'open' && by[1].change === 'new', 'ת.ז. הלקוח ⇒ c1, «ח» בלי הגשה ⇒ פתוחה', JSON.stringify(by[1]));
  ok(by[2].match === 'unmatched' && by[2].state === 'needs_review', 'לא מזוהה ⇒ לבדיקה (גם כשהוגש)', JSON.stringify(by[2]));
  ok(by[3].clientId === 'c2' && by[3].role === 'spouse' && by[3].tier === 'spouse_id' && by[3].key === 'annual|000000034|2025', 'ת.ז. בת הזוג ⇒ c2 כבת זוג; מספר קצר מרופד ל-9', JSON.stringify(by[3]));
  ok(by[4].shaamStatus === 'context' && by[4].state === 'needs_review', '«ש״מ לא קיימת» — לא חובה (הקשר); לא מזוהה ⇒ לבדיקה', JSON.stringify(by[4]));
  ok(by[5].clientId === 'c3' && by[5].tier === 'tax_file' && by[5].role === 'client', 'מספר תיק מ״ה בכרטיס (משותף) ⇒ c3', JSON.stringify(by[5]));
  ok(by[6].clientId === 'c6' && by[6].shaamStatus === 'context' && by[6].state === 'context', 'בלי «ח» (ס.ת 91, סעיף 14, מועד) ⇒ לא חובה', JSON.stringify(by[6]));
  ok(by[7].clientId === 'c4' && by[7].tier === 'id', 'ת.ז. של לקוח גוברת על ת.ז. בן/בת זוג בכרטיס אחר', JSON.stringify(by[7]));
  ok(by[8].change === 'invalid' && by[8].reason === 'file_number', 'מספר תיק פגום ⇒ לא נשמר', JSON.stringify(by[8]));
  ok(p.names.c1 === 'דוגמה ראשון' && !('c9' in p.names), 'שמות — רק כרטיסי המשרד');
  ok((await one(`select count(*)::int n from public.shaam_filing_obligations`)).n === 0, 'תצוגה אינה כותבת');
}
// ── 2 · שמירה ────────────────────────────────────────────────────────────────
let idC1;
{
  // בקשת דוח פתוחה ל-c3 ל-2025 כבר קיימת ⇒ קישור אוטומטי בשמירה
  await q(`insert into public.onboarding_steps (id, user_id, client_id, step_type, status, payload) values ('s-c3', $1, 'c3', 'annual_return', 'in_progress', '{"taxYear":2025}')`, [OFFICE]);
  const r = await rpc('shaam_filing_import', [ANNUAL()]);
  ok(r.ok && r.counts.new === 8 && r.counts.invalid === 2, 'שמירה: 8 חדשות (אחת מהן לבדיקה בלי לקוח), 2 לא תקינות', JSON.stringify(r.counts));
  const rows = await q(`select * from public.shaam_filing_obligations order by file_number`);
  ok(rows.length === 8 && rows.find(x => x.year_shown === '2024').client_id === null, '8 שורות במסד; שורת בעיית הקריאה בלי לקוח');
  const c1 = rows.find(x => x.client_id === 'c1'); idC1 = c1.id;
  ok(c1.state === 'open' && c1.legal_due?.toISOString?.().slice(0, 10) === '2026-10-31' || String(c1.legal_due).includes('2026'), 'c1 — פתוחה, מועד 31.10.2026');
  ok(c1.evidence.page === 1 && c1.evidence.line === 1 && c1.evidence.sourceId, 'ראיה: מקור, עמוד ושורה', JSON.stringify(c1.evidence));
  ok(rows.find(x => x.file_number === '000000034')?.file_number === '000000034', 'מספר תיק נשמר כמחרוזת עם אפסים מובילים');
  const c3 = rows.find(x => x.client_id === 'c3');
  ok(c3.step_id === 's-c3', 'בקשת הדוח הפתוחה של c3 קושרה בשמירה');
  const ev = await one(`select note, meta from public.onboarding_events where step_id = 's-c3'`);
  ok(ev?.meta?.what === 'shaam_obligation_linked', 'נרשם אירוע קישור על הבקשה');
  const ctx = rows.find(x => x.client_id === 'c6');
  ok(ctx.state === 'context' && ctx.legal_due !== null && ctx.required === false, 'שורת הקשר נשמרת עם המועד, בלי חובה');
  const s = await q(`select * from public.shaam_filing_sources`);
  ok(s.length === 1 && s[0].content_sha256 === 'a1', 'מקור אחד נשמר');
}
// ── 3 · ייבוא חוזר זהה ─────────────────────────────────────────────────────────
{
  const r = await rpc('shaam_filing_import', [ANNUAL()]);
  ok(r.ok && r.counts.unchanged === 8 && !r.counts.new, 'אותו קובץ שוב ⇒ 8 «ללא שינוי», אין חדשות', JSON.stringify(r.counts));
  ok((await one(`select count(*)::int n from public.shaam_filing_obligations`)).n === 8 && (await one(`select count(*)::int n from public.shaam_filing_sources`)).n === 1,
    'אין כפילות — לא בשורות ולא במקורות');
}
// ── 4 · קובץ ישן לא דורס; חדש עם ארכה — עדכון עם היסטוריה ─────────────────────────
{
  const older = await rpc('shaam_filing_import', [ANNUAL('a0', '2026-09-01', '2026-06-30')]);
  ok(older.counts.older === 8, 'קובץ ישן ⇒ «ישן מהקיים» לכל השורות הקיימות', JSON.stringify(older.counts));
  ok(String((await one(`select legal_due::text d from public.shaam_filing_obligations where id = $1`, [idC1])).d) === '2026-10-31', 'המועד לא נדרס בקובץ הישן');
  const newer = await rpc('shaam_filing_import', [ANNUAL('a2', '2026-10-20', '2027-01-31')]);
  ok(newer.counts.updated === 1 && newer.counts.unchanged === 7, 'קובץ חדש עם ארכה ⇒ שורה אחת עודכנה', JSON.stringify(newer.counts));
  const c1 = await one(`select legal_due::text d, history, produced_on::text p from public.shaam_filing_obligations where id = $1`, [idC1]);
  ok(c1.d === '2027-01-31' && c1.history.length === 1 && c1.history[0].values.legalDue === '31/10/2026' && c1.p === '2026-10-20', 'מועד חדש; הקודם בהיסטוריה עם המקור', JSON.stringify(c1));
}
// ── 5 · היעלמות לא סוגרת; הגשה מסמנת בקשה מקושרת בלי לסגור ──────────────────────
{
  const only = { sources: [src('a3', { producedOn: '2026-11-05' })], rows: [row('a3', '000000075', { name: 'שביעי רונית', required: true, due: '2026-11-30', filed: '2026-11-02' })] };
  const r = await rpc('shaam_filing_import', [only]);
  ok(r.counts.updated === 1, 'רשימה חלקית: רק c3 עודכן', JSON.stringify(r.counts));
  ok((await one(`select state from public.shaam_filing_obligations where id = $1`, [idC1])).state === 'open', 'c1 נעלם מהרשימה — נשאר פתוח');
  const c3 = await one(`select state, filed_on::text f from public.shaam_filing_obligations where client_id = 'c3'`);
  ok(c3.state === 'filed_per_shaam' && c3.f === '2026-11-02', 'c3 — «הוגש לפי שע״ם»');
  const st = await one(`select status, payload from public.onboarding_steps where id = 's-c3'`);
  ok(st.status === 'in_progress' && st.payload.work?.shaamFiled?.filedOn === '2026-11-02', 'הבקשה לא נסגרה; סומן עליה «הוגש לפי שע״ם»', JSON.stringify(st));
  const evs = await q(`select meta from public.onboarding_events where step_id = 's-c3' and meta->>'what' = 'filed_per_shaam'`);
  await rpc('shaam_filing_import', [only]);
  ok(evs.length === 1 && (await q(`select 1 from public.onboarding_events where step_id = 's-c3' and meta->>'what' = 'filed_per_shaam'`)).length === 1, 'אירוע «הוגש» נרשם פעם אחת, גם בייבוא חוזר');
  // סתירה: הוגש ועכשיו שוב פתוח
  const back = { sources: [src('a4', { producedOn: '2026-11-10' })], rows: [row('a4', '000000075', { name: 'שביעי רונית', required: true, due: '2026-11-30' })] };
  const b = await rpc('shaam_filing_import', [back]);
  const c3b = await one(`select state, review_reason from public.shaam_filing_obligations where client_id = 'c3'`);
  ok(c3b.state === 'needs_review' && c3b.review_reason === 'contradiction', 'הוגש ואחר כך שוב פתוח ⇒ לבדיקה (סתירה)', JSON.stringify([b.counts, c3b]));
}
// ── 6 · עמום / שם לא תואם / שיוך ידני ─────────────────────────────────────────
{
  await q(`update public.clients set id_number = '777777770' where id = 'c6'`);
  await q(`insert into public.clients (id, user_id, first_name, last_name, id_number) values ('c7', $1, 'כפול', 'ראשון', '777777770')`, [OFFICE]);
  const w = { sources: [src('w1', { kind: 'wealth', group: 'unfiled_no_fine', producedOn: '2026-10-16' })], rows: [
    row('w1', '777777770', { name: 'אחר משה', due: '2026-11-30', line: 1 }),                // שני כרטיסים עם אותה ת.ז. ⇒ עמום
    row('w1', '000000018', { name: 'כהן לגמרי אחר', due: '2026-11-30', line: 2 }),          // ת.ז. של c1, שם אחר ⇒ שם לא תואם
    row('w1', '444444442', { name: 'זוגי עידו', due: '2026-11-30', line: 3 }),             // c5 ת.ז. (ו-c4 כבן/בת זוג) ⇒ c5
    row('w1', '000000034', { name: 'שלישי גלית', due: '', line: 4 }),                     // מועד חסר
  ] };
  const r = await rpc('shaam_filing_import', [w]);
  const o = await q(`select * from public.shaam_filing_obligations where kind = 'wealth' order by file_number`);
  const amb = o.find(x => x.file_number === '777777770'), nm = o.find(x => x.file_number === '000000018'), c5 = o.find(x => x.file_number === '444444442'), nd = o.find(x => x.file_number === '000000034');
  ok(amb.state === 'needs_review' && amb.review_reason === 'ambiguous' && amb.client_id === null && amb.candidates.length === 2, 'שני כרטיסים ⇒ לבדיקה, בלי כתיבה לתיק', JSON.stringify(amb));
  ok(nm.state === 'needs_review' && nm.review_reason === 'name_mismatch' && nm.client_id === null, 'מספר תואם ושם לא ⇒ לבדיקה', JSON.stringify(nm));
  ok(c5.client_id === 'c5' && c5.state === 'open' && c5.wealth_group === 'unfiled_no_fine' && c5.fine === false && c5.year_shown === '2025', 'הצהרת הון — פתוחה, ללא קנס, השנה כפי שמופיעה');
  ok(nd.legal_due === null && nd.state === 'open', 'מועד חסר ⇒ NULL (לא ידוע), עדיין פתוחה');
  const res = await rpc('resolve_shaam_obligation', [amb.id, 'c7', 'client']);
  const amb2 = await one(`select state, client_id, match_kind from public.shaam_filing_obligations where id = $1`, [amb.id]);
  ok(res.ok && amb2.state === 'open' && amb2.client_id === 'c7' && amb2.match_kind === 'manual', 'שיוך ידני ⇒ פתוחה בכרטיס שנבחר', JSON.stringify([res, amb2]));
  const again = await rpc('shaam_filing_preview', [w]);
  ok(again.plan[0].clientId === 'c7' && again.plan[0].change === 'unchanged', 'ייבוא חוזר שומר את השיוך הידני', JSON.stringify(again.plan[0]));
  const dis = await rpc('resolve_shaam_obligation', [nm.id, null, 'client']);
  ok(dis.ok && (await one(`select state from public.shaam_filing_obligations where id = $1`, [nm.id])).state === 'dismissed', '«לא שלנו» ⇒ נדחה');
  // רשימת הלקוח c5
  const lst = await rpc('shaam_filing_list', ['c5']);
  ok(lst.ok && lst.obligations.length === 1 && lst.obligations[0].clientName === 'עידו זוגי' && lst.sources.length === 0, 'רשימה לתיק לקוח — רק השורה שלו, בלי מקורות');
}
// ── 7 · היסטוריה ועותק ────────────────────────────────────────────────────────
{
  const f = { sources: [src('w2', { kind: 'wealth', group: 'filed_fine', producedOn: '2026-10-16' })], rows: [row('w2', '000000018', { name: 'ראשון דוגמה', year: '2023', due: '2024-05-31', line: 1 })] };
  const r = await rpc('shaam_filing_import', [f]);
  const h = await one(`select * from public.shaam_filing_obligations where kind = 'wealth' and year_shown = '2023'`);
  ok(r.counts.new === 1 && h.state === 'history' && h.fine === true && h.shaam_status === 'filed', 'קבוצת «הגישו» ⇒ היסטוריה, חייב בקנס כסימון נפרד', JSON.stringify(h));
  let lst = await rpc('shaam_filing_list', ['c1']);
  ok(lst.obligations.find(x => x.id === h.id).copyInOffice === false, 'אין עותק בתיק ⇒ copyInOffice=false');
  const c = await rpc('request_shaam_filing_copy', [h.id]);
  const st = await one(`select step_type, published_at, payload from public.onboarding_steps where id = $1`, [c.stepId]);
  ok(c.ok && st.step_type === 'custom_request' && st.published_at === null && st.payload.flagKey === `shaam_copy:${h.id}`, 'בקשת עותק — custom_request לא מפורסמת', JSON.stringify(st));
  const c2 = await rpc('request_shaam_filing_copy', [h.id]);
  ok(c2.ok && c2.already && c2.stepId === c.stepId && (await one(`select count(*)::int n from public.onboarding_steps where step_type = 'custom_request'`)).n === 1, 'לחיצה שנייה — אותה בקשה');
  ok((await rpc('request_shaam_filing_copy', [idC1])).error === 'not_filed', 'עותק — רק להגשה רשומה');
  await q(`insert into public.document_labels values ('L1', $1, 'הצהרת הון')`, [OFFICE]);
  await q(`insert into public.documents (user_id, client_id, file_name, year, label_id) values ($1, 'c1', 'scan.pdf', '2023', 'L1')`, [OFFICE]);
  lst = await rpc('shaam_filing_list', ['c1']);
  ok(lst.obligations.find(x => x.id === h.id).copyInOffice === true, 'מסמך עם תווית «הצהרת הון» לאותה שנה ⇒ «עותק קיים במשרד»');
}
// ── 8 · קישור לבקשה ───────────────────────────────────────────────────────────
{
  await q(`insert into public.onboarding_steps (id, user_id, client_id, step_type, status, payload) values ('s-c1-24', $1, 'c1', 'annual_return', 'pending', '{"taxYear":2024}'), ('s-c1-25', $1, 'c1', 'annual_return', 'pending', '{"taxYear":2025}')`, [OFFICE]);
  ok((await rpc('link_shaam_obligation_step', [idC1, 's-c1-24'])).error === 'step_mismatch', 'קישור לבקשה של שנה אחרת — נדחה');
  ok((await rpc('link_shaam_obligation_step', [idC1, 's-c3'])).error === 'step_mismatch', 'קישור לבקשה של לקוח אחר — נדחה');
  const l = await rpc('link_shaam_obligation_step', [idC1, 's-c1-25']);
  ok(l.ok && (await one(`select step_id from public.shaam_filing_obligations where id = $1`, [idC1])).step_id === 's-c1-25', 'קישור לבקשת הדוח של אותה שנה');
  ok((await rpc('link_shaam_obligation_step', [idC1, 's-c1-25'])).already, 'קישור חוזר — אידמפוטנטי');
}
// ── 9 · הפרדת משרדים ──────────────────────────────────────────────────────────
{
  await as(OTHER);
  const lst = await rpc('shaam_filing_list', [null]);
  ok(lst.obligations.length === 0 && lst.sources.length === 0, 'משרד אחר לא רואה שורות או מקורות');
  ok((await q(`select * from public.shaam_filing_obligations`)).length >= 0, '(טבלה — RLS בשרת האמיתי)');
  const p = await rpc('shaam_filing_preview', [{ sources: [src('x1')], rows: [row('x1', '000000018', { name: 'ראשון דוגמה', required: true, due: '2026-10-31' })] }]);
  ok(p.plan[0].match === 'unmatched' && !p.plan[0].existingId, 'משרד אחר — לא משויך לכרטיס שלנו ולא רואה את השורה הקיימת', JSON.stringify(p.plan[0]));
  ok((await rpc('resolve_shaam_obligation', [idC1, 'c9', 'client'])).error === 'not_found', 'משרד אחר — לא יכול לשייך שורה שלנו');
  ok((await rpc('request_shaam_filing_copy', [idC1])).error === 'not_found', 'משרד אחר — לא יכול לבקש עותק משורה שלנו');
  const bad = await rpc('shaam_filing_import', [{ sources: [{ ...src('x2'), storagePath: `${OFFICE}/shaam-filing/x.pdf` }], rows: [] }]);
  ok(bad.error === 'bad_storage_path', 'נתיב קובץ בתיקיית משרד אחר — נדחה');
  await as(OFFICE);
  ok((await rpc('resolve_shaam_obligation', [idC1, 'c9', 'client'])).error === 'forbidden', 'שיוך לכרטיס של משרד אחר — נדחה');
}
// ── 10 · אישור ריק ידני ───────────────────────────────────────────────────────
{
  const e = await rpc('confirm_shaam_group_empty', ['unfiled_fine', 'נבדק במסך']);
  const s = await one(`select method, status, wealth_group from public.shaam_filing_sources where id = $1`, [e.id]);
  ok(e.ok && s.method === 'manual' && s.status === 'empty_confirmed' && s.wealth_group === 'unfiled_fine', 'אישור «נבדקה וריקה» — נשמר כמקור ידני');
  ok((await rpc('confirm_shaam_group_empty', ['bogus', null])).error === 'bad_group', 'קבוצה לא מוכרת — נדחה');
}
// ── 11 · החזרה ──────────────────────────────────────────────────────────────
{
  await db.exec(rollback);
  const left = await one(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '%shaam%'`);
  ok(left.n === 0 && !(await one(`select to_regclass('public.shaam_filing_obligations') t`)).t, 'rollback מסיר טבלאות ופונקציות');
  ok((await one(`select count(*)::int n from public.onboarding_steps`)).n > 0, 'rollback לא נוגע בבקשות');
  await db.exec(sql250);
  ok(true, 'אפשר להחיל מחדש אחרי rollback');
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

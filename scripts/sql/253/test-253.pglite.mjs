// בדיקת מיגרציה 253 בבידוד: PGlite, על הגופים החיים של השרת (staging) — כמו test-241.
//   PGLITE_DIR=<tmp>/pgl node scripts/sql/253/test-253.pglite.mjs <items253.json> <live-dir>
//   <items253.json> — מ-scripts/sql/253/build-items.mjs (items + institutions); <live-dir> — גופי הפונקציות כפי שנקראו מהשרת.
// מה נבדק: (0) החלה והחלה חוזרת — הסימון פעם אחת; הרשימות = הקוד; (1) add_tax_info_asks מקבל multi/entity;
//   (2) מסך הרשת: עובדה כן/לא לכל אריח בתפקיד שלו, שאלות ההמשך נפתחות מפורסמות פעם אחת, אריח לא מוכר נדחה, שליחה כפולה;
//   (3) «של מי / איפה»: מהרשימה בלבד (גם «אחר»), «של מי», בחירה, שם עד 120, שדה חובה; הערך עם שם הגוף; (4) הכדור חוזר למשרד;
//   (5) החזרה (rollback-253.sql) והחלה מחדש אחריה.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const rd = (p) => readFileSync(WT + p, 'utf8').replace(/\r\n/g, '\n');
const sql229 = rd('supabase/229-tax-year-collection.sql'), sql230 = rd('supabase/230-wealth-declaration-collection.sql'), sql236 = rd('supabase/236-tax-file-intake.sql');
const sql253 = rd('supabase/253-intake-closed-lists.sql');
const rb253 = rd('scripts/sql/253/rollback-253.sql');
const sql222 = rd('supabase/222-request-preview.sql');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = rd('scripts/sql/229/test-229-tax-year.pglite.mjs');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);')).replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);
const announce = t229.slice(t229.indexOf('await db.exec(`create function public._client_announceable_steps') + 'await db.exec(`'.length, t229.indexOf('$f$;`);') + '$f$;'.length);
const code = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const LIVE = resolve(process.argv[3]);
const live = (fn) => readFileSync(join(LIVE, `${fn}.sql`), 'utf8');

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const marks = async (fn, mark) => (await one(`select (length(prosrc) - length(replace(prosrc, $2, ''))) / length($2) n from pg_proc where proname = $1`, [fn, mark])).n;
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

await db.exec(setup);
await db.exec(`create table public.documents (id text primary key, client_id text not null, file_name text);
  create table public.tax_fact_changes (id text primary key default gen_random_uuid()::text, user_id uuid, client_id text not null references public.clients(id), field_key text not null,
    label text, old_value jsonb, new_value jsonb, source text not null, source_ref text, note text, status text not null default 'pending',
    decided_by uuid, decided_at timestamptz, superseded_by text, created_at timestamptz not null default now());
  alter table public.clients add column city text, add column address text, add column zip_code text, add column family_status text,
    add column children jsonb default '[]'::jsonb, add column bank_accounts jsonb default '[]'::jsonb, add column employers jsonb default '[]'::jsonb, add column field_meta jsonb default '{}'::jsonb;`);
await db.exec(psi);
await db.exec(announce);
await db.exec(rd('scripts/sql/236/legacy-stubs.sql'));
await db.exec(sql229); await db.exec(sql230); await db.exec(sql236);
for (const fn of ['is_hebrew_only', '_tax_year_client', '_tax_year_items', 'add_tax_info_asks', 'portal_submit_tax_info', '_portal_step_items', 'ensure_tax_year_request', 'ensure_tax_file_intake']) await db.exec(live(fn));
console.log(`גופים חיים: ${LIVE}`);
const before = Object.fromEntries(await Promise.all(['add_tax_info_asks', 'portal_submit_tax_info'].map(async fn => [fn, (await one(`select md5(prosrc) h from pg_proc where proname = $1`, [fn])).h])));

// ── 0. החלה, והחלה חוזרת ──
await db.exec(sql253); await db.exec(sql253);
ok(await marks('add_tax_info_asks', '253 · רשת ושל מי') === 1 && await marks('portal_submit_tax_info', '253 · מסך הרשת') === 1 && await marks('portal_submit_tax_info', '253 · «של מי / איפה»') === 1, 'הסימון «253 ·» פעם אחת, גם אחרי החלה חוזרת');
ok(await marks('portal_submit_tax_info', '241 · רשומה') === 1, 'הבלוק של 241 נשאר אחד');
const items = (await one(`select public._tax_year_items() m`)).m;
ok(same(items, code.items), `רשימת הפריטים בשרת = הקטלוג בקוד (${Object.keys(items).length})`, JSON.stringify(Object.keys(code.items).filter(k => !(k in items))));
ok(['intake.whatYouHave', 'intake.cryptoDetails', 'intake.allowanceDetails', 'intake.insuranceDetails', 'intake.idCard'].every(k => k in items), 'פריטים חדשים ברשימה; מפתחות המסמך לא הוסרו');
const inst = (await one(`select public._tax_institutions() m`)).m;
ok(Object.keys(inst).length === Object.keys(code.institutions).length && Object.entries(code.institutions).every(([l, m]) => same(inst[l], m)), `הרשימות הסגורות בשרת = הקוד (${Object.keys(inst).length})`);
ok(!(await one(`select has_function_privilege('anon', 'public._tax_institutions()', 'execute') a`)).a, '_tax_institutions — לא ל-anon');

// ── 1. שאלות: מסך הרשת ו«של מי / איפה» ──
await as(OFFICE);
await db.query(`update public.clients set family_status = 'married' where id = 'c1'`);
const intake = await rpc('ensure_tax_file_intake', ['c1']);
const SPEC = { noun: 'חשבון', multiple: true, fields: [{ key: 'who', label: 'של מי?', type: 'who', required: true }, { key: 'where', label: 'איפה?', type: 'list', list: 'accounts', required: true }] };
const EMP = { noun: 'מעסיק', fields: [{ key: 'who', type: 'who', required: true }, { key: 'name', type: 'name', required: true }, { key: 'when', type: 'choice', required: true, options: [{ value: 'all' }, { value: 'part' }] }] };
const grid = { itemKey: 'intake.whatYouHave', subjectRole: 'couple', prompt: { title: 'סמנו מה יש לכם', why: '', input: { kind: 'multi', options: [
  { key: 'intake.hasInvestments', role: 'couple', label: 'תיק השקעות', followUp: { itemKey: 'intake.accountDetails', subjectRole: 'couple', entityKind: 'account', entityRef: 'inv-new-couple-intake', prompt: { title: 'של מי ואיפה', why: '', input: { kind: 'entity', spec: SPEC, context: { married: '1' } } } } },
  { key: 'intake.employed', role: 'couple', label: 'עבודה', followUp: { itemKey: 'intake.employerDetails', subjectRole: 'client', entityKind: 'employer', entityRef: 'emp-new-couple-intake', prompt: { title: 'מעסיק', why: '', input: { kind: 'entity', spec: EMP } } } },
  { key: 'intake.crypto', role: 'couple', label: 'קריפטו' },
  { key: 'intake.credits', role: 'couple', label: 'תואר', followUp: { itemKey: 'intake.credits', subjectRole: 'couple', prompt: { title: 'מי מכם?', why: '', input: { kind: 'who', clientName: 'א', spouseName: 'ב' } } } },
] } } };
const add1 = await rpc('add_tax_info_asks', [intake.stepId, JSON.stringify([grid])]);
ok(add1.ok && add1.added === 1, 'add_tax_info_asks מקבל input מסוג multi', JSON.stringify(add1));
ok((await rpc('add_tax_info_asks', [intake.stepId, JSON.stringify([{ itemKey: 'intake.funds', subjectRole: 'couple', prompt: { title: 't', input: { kind: 'magic' } } }])])).error === 'bad_prompt', 'סוג קלט לא מוכר — עדיין נדחה');
const info = (await one(`select step_id from public.tax_info_asks where parent_step_id = $1 limit 1`, [intake.stepId])).step_id;
await db.query(`update public.tax_info_asks set state = 'published' where step_id = $1`, [info]);
await db.query(`update public.onboarding_steps set published_at = now(), status = 'waiting_client', ball = 'client' where id = $1`, [info]);
const askId = async (key) => (await one(`select id from public.tax_info_asks where step_id = $1 and item_key = $2 and state <> 'cancelled' order by created_at desc limit 1`, [info, key])).id;
const submit = (key, answer) => askId(key).then(id => rpc('portal_submit_tax_info', ['tok-c1', id, JSON.stringify(answer)]));
await as('');

// ── 2. מסך הרשת ──
ok((await submit('intake.whatYouHave', { kind: 'multi', selected: ['intake.nope'] })).error === 'bad_option', 'אריח לא מוכר — נדחה');
ok((await submit('intake.whatYouHave', { kind: 'multi', selected: 'x' })).error === 'bad_kind', 'selected שאינו מערך — נדחה');
const m1 = await submit('intake.whatYouHave', { kind: 'multi', selected: ['intake.hasInvestments', 'intake.employed', 'intake.credits'] });
ok(m1.ok && m1.state === 'answered' && m1.opened === 3, 'מסך הרשת נענה; 3 שאלות המשך נפתחו', JSON.stringify(m1));
const facts = await q(`select item_key, subject_role, answer, value, period_kind, status from public.tax_year_facts where ask_id = $1 order by item_key`, [await askId('intake.whatYouHave')]);
ok(facts.length === 4 && facts.every(f => f.subject_role === 'couple' && f.status === 'pending' && f.period_kind === 'as_of'), 'עובדה לכל אריח, בתפקיד משק הבית, ממתינה, ליום הקליטה', JSON.stringify(facts));
ok(facts.find(f => f.item_key === 'intake.crypto').answer === 'no' && facts.find(f => f.item_key === 'intake.employed').answer === 'value' && facts.find(f => f.item_key === 'intake.employed').value === true, '«כן» למסומן, «לא» לשאר', JSON.stringify(facts));
const fu = await q(`select item_key, subject_role, entity_ref, item_kind, state, prompt->'input'->>'kind' k from public.tax_info_asks where step_id = $1 and item_key <> 'intake.whatYouHave' order by item_key`, [info]);
ok(fu.length === 3 && fu.every(a => a.state === 'published') && fu.map(a => `${a.item_key}:${a.subject_role}:${a.entity_ref ?? ''}:${a.item_kind}:${a.k}`).join(',') === 'intake.accountDetails:couple:inv-new-couple-intake:detail:entity,intake.credits:couple::screener:who,intake.employerDetails:client:emp-new-couple-intake:detail:entity',
  'שאלות ההמשך: מפורסמות, עם המזהה הזמני וסוג הפריט מהרשימה', JSON.stringify(fu));
ok((await submit('intake.whatYouHave', { kind: 'multi', selected: [] })).already === true, 'שליחה כפולה — לא כותבת שוב');
ok((await one(`select ball from public.onboarding_steps where id = $1`, [info])).ball === 'client', 'יש שאלות פתוחות — הכדור עדיין אצל הלקוח');

// ── 3. «של מי / איפה» ──
const bad = async (answer, err, why) => { const r = await submit('intake.accountDetails', answer); ok(r.error === err, `${why} — ${err}`, JSON.stringify(r)); };
await bad({ kind: 'entity', items: 'x' }, 'bad_entity', 'items שאינו מערך');
await bad({ kind: 'entity', items: [] }, 'bad_entity', 'ריק');
await bad({ kind: 'entity', items: [{ who: 'spouse', where: 'בנק שלי' }] }, 'not_in_list', 'ערך מחוץ לרשימה');
await bad({ kind: 'entity', items: [{ who: 'uncle', where: 'bank-12' }] }, 'bad_entity', '«של מי» לא מוכר');
await bad({ kind: 'entity', items: [{ where: 'bank-12' }] }, 'bad_entity', 'שדה חובה חסר');
await bad({ kind: 'entity', items: [{ who: 'both', where: 'bank-12' }, 'x'] }, 'bad_entity', 'פריט שאינו אובייקט');
const e1 = await submit('intake.accountDetails', { kind: 'entity', items: [{ who: 'spouse', where: 'ih-ibi', junk: 'x' }, { who: 'both', where: 'other' }] });
const fe = await one(`select value, subject_role, entity_ref, status from public.tax_year_facts where item_key = 'intake.accountDetails'`);
ok(e1.ok && fe.status === 'pending' && fe.entity_ref === 'inv-new-couple-intake' && JSON.stringify(fe.value) === JSON.stringify({ items: [{ who: 'spouse', where: 'ih-ibi', whereLabel: 'IBI בית השקעות' }, { who: 'both', where: 'other', whereLabel: 'אחר (לא ברשימה)' }] }),
  '«של מי / איפה» נשמר: רק השדות שבמפרט, שם הגוף לצד המזהה, «אחר» תשובה', JSON.stringify(fe));
ok((await submit('intake.employerDetails', { kind: 'entity', items: [{ who: 'client', name: 'א'.repeat(121), when: 'all' }] })).error === 'bad_entity', 'שם מעל 120 — נדחה');
ok((await submit('intake.employerDetails', { kind: 'entity', items: [{ who: 'client', name: 'קופת חולים', when: 'sometimes' }] })).error === 'bad_entity', 'בחירה מחוץ לאפשרויות — נדחה');
const e2 = await submit('intake.employerDetails', { kind: 'entity', items: [{ who: 'client', name: '  קופת חולים מאוחדת ', when: 'part' }] });
ok(e2.ok && JSON.stringify((await one(`select value from public.tax_year_facts where item_key = 'intake.employerDetails'`)).value) === JSON.stringify({ items: [{ who: 'client', name: 'קופת חולים מאוחדת', when: 'part' }] }), 'שם המעסיק — חופשי, מקוצץ', JSON.stringify(e2));
// «מי מכם?» על שאלת הפתיחה — עובדה לכל אדם, כמו 229
const w = await submit('intake.credits', { kind: 'who', value: 'spouse' });
const wf = await q(`select subject_role, answer from public.tax_year_facts where item_key = 'intake.credits' and subject_role <> 'couple' order by subject_role`);
ok(w.ok && wf.map(f => `${f.subject_role}:${f.answer}`).join(',') === 'client:no,spouse:value', '«מי מכם?» ⇒ עובדה לכל אדם', JSON.stringify(wf));

// ── 4. הכדור חוזר למשרד ──
ok((await one(`select ball, status from public.onboarding_steps where id = $1`, [info])).ball === 'me', 'הכול נענה — הכדור אצל המשרד');
ok(!(await q(`select 1 from public.tax_info_asks where step_id = $1 and state = 'published'`, [info])).length, 'אין שאלות פתוחות');

// ── 5. החזרה והחלה מחדש ──
await db.query(`insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, prompt, state)
  values ($1, 'c1', 2026, $2, $3, 'intake.cryptoDetails', 'detail', 'couple', $4, 'published')`, [OFFICE, info, intake.stepId, JSON.stringify({ title: 'x', input: { kind: 'entity', spec: SPEC } })]);
await db.exec(rb253);
ok(await marks('add_tax_info_asks', '253 ·') === 0 && await marks('portal_submit_tax_info', '253 ·') === 0, 'החזרה: הסימונים ירדו');
const afterRb = Object.fromEntries(await Promise.all(['add_tax_info_asks', 'portal_submit_tax_info'].map(async fn => [fn, (await one(`select md5(prosrc) h from pg_proc where proname = $1`, [fn])).h])));
ok(afterRb.add_tax_info_asks === before.add_tax_info_asks && afterRb.portal_submit_tax_info === before.portal_submit_tax_info, 'החזרה: הגופים זהים למה שהיה לפני 253 (md5)');
ok((await one(`select to_regprocedure('public._tax_institutions()') is null x`)).x, 'החזרה: _tax_institutions נמחקה');
ok(!('intake.whatYouHave' in (await one(`select public._tax_year_items() m`)).m), 'החזרה: הרשימה של 249');
ok((await one(`select state from public.tax_info_asks where item_key = 'intake.cryptoDetails'`)).state === 'cancelled', 'החזרה: שאלת entity פתוחה בוטלה');
ok((await one(`select count(*)::int n from public.tax_year_facts where item_key = 'intake.accountDetails'`)).n === 1, 'החזרה: העובדות נשארו');
await db.exec(sql253);
ok(await marks('portal_submit_tax_info', '253 · מסך הרשת') === 1 && 'intake.whatYouHave' in (await one(`select public._tax_year_items() m`)).m, 'החלה מחדש אחרי החזרה — עובדת');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

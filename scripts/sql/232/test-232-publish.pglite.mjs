// בדיקת חבילה 232 (פרסום הערכת מס בדף האישי) בבידוד: PGlite על הקמת 229 + 222 + 229 + 230 + 231 + 232 (פעמיים).
//   PGLITE_DIR=<tmp> node scripts/sql/232/test-232-publish.pglite.mjs
// ‼ לא הוחל על שום סביבה. הבדיקה מוודאת: אותה גרסה מאושרת בדף ובתצוגה, אין עותק; גרסה חדשה מחליפה;
//   שדות פנימיים לא נחשפים; «שלח בקשות» ומפתח הדף; החלה חוזרת והחזרה.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const read = (f) => readFileSync(WT + f, 'utf8').replace(/\r\n/g, '\n');
const sql222 = read('supabase/222-request-preview.sql');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = read('scripts/sql/229/test-229-tax-year.pglite.mjs');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const sub = (s) => s.replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);
const setup = sub(t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);')));
const annStart = t229.indexOf('await db.exec(`create function public._client_announceable_steps');
const stubs = t229.slice(annStart + 'await db.exec(`'.length, t229.indexOf('$f$;`);', annStart) + '$f$;'.length);

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
  create table public.tax_fact_changes (id text primary key, client_id text, field_key text, source text, status text);
  alter table public.clients add column if not exists last_name text, add column if not exists spouse jsonb, add column if not exists spouse_first_name text;`);
await db.exec(psi);
await db.exec(stubs);
for (const f of ['229-tax-year-collection', '230-wealth-declaration-collection', '231-tax-estimates', '232-tax-estimate-publish', '232-tax-estimate-publish']) await db.exec(read(`supabase/${f}.sql`));
console.log('הוחל: 229 + 230 + 231 + 232 (פעמיים)');

await as(OFFICE);
await db.exec(`update public.clients set last_name = 'כהן', spouse_first_name = 'מיכל' where id = 'c1'`);
const req = await rpc('ensure_tax_year_request', ['c1', 'estimate', 2026, 9]);
const D = (x = {}) => JSON.stringify({ cutoffMonth: 9, preparedOn: '2026-10-11', lines: [{ id: 'b1', label: 'העסק', person: 'client', source: 'business', chosen: 'office', actualSource: { note: 'פנימי' }, office: { method: 'runRate', assumption: 'קצב' } }],
  reconciliations: [{ id: 'r1', decision: 'books_correct', note: 'פנימי' }], oneOffs: [{ id: 'o1', label: 'הרצאה חד-פעמית', amount: 10000, timing: 'inActual', source: { note: 'פנימי' } }], adjustments: [{ id: 'a1', lineId: 'b1', bookCategory: 'כיבוד', amount: 1200, reason: 'חלק לא מוכר' }], decisions: [{ ruleId: 'x', text: 'הכרעה פנימית' }], note: 'הערת משרד', ...x });
const O = (x = {}) => JSON.stringify({ taxYear: 2026, blockers: [], rulesetVersion: 'r', nextAction: 'פנימי', usedRules: [{ ruleId: 'core.creditPoint' }], alignment: [{ authority: 'it', text: 'פנימי' }], household: { annualLiability: 65168 }, advances: [], ...x });
const save = async (base, d = D(), o = O()) => rpc('save_tax_estimate', [req.stepId, d, o, '[]', JSON.stringify(base)]);
const psiRow = async () => (await one(`select public._portal_step_items(s, c, null::public.profiles, null::public.representation_requests, null) as r
  from public.onboarding_steps s, public.clients c where s.id = $1 and c.id = s.client_id`, [req.stepId])).r;

// ── 1. אין פרסום לפני אישור ──
const s1 = await save({ latestVersion: 0 });
ok((await rpc('publish_tax_estimate', [s1.id, true])).error === 'not_approved', 'טיוטה — אי אפשר לפרסם');
ok(((await psiRow()).items ?? []).length === 0, 'בלי גרסה מפורסמת — אין פריט בדף');
ok((await one(`select published_at is not null p from public.onboarding_steps where id = $1`, [req.stepId])).p, 'הבקשה נוצרת «מפורסמת» (229) — לכן אסור להסתמך על זה');
ok(!(await q(`select step_id from public._client_announceable_steps('c1')`)).some(r => r.step_id === req.stepId), '«שלח בקשות»: בלי גרסה מפורסמת — לא נספרת (באג שנמצא ב-staging)');
await rpc('approve_tax_estimate', [s1.id, 1]);

// ── 2. פרסום: הבקשה מתפרסמת, הפריט מופיע, התצוגה מאותה שורה ──
await as(OTHER);
ok(!!(await throws(`select public.publish_tax_estimate('${s1.id}', true)`)), 'משרד אחר — אסור לפרסם');
await as(OFFICE);
const p1 = await rpc('publish_tax_estimate', [s1.id, true]);
const st1 = await one(`select published_at, payload from public.onboarding_steps where id = $1`, [req.stepId]);
ok(p1.ok && st1.published_at && st1.payload.publishedEstimateId === s1.id && /^גרסה 1 · אושרה/.test(st1.payload.clientSub), 'פרסום: הבקשה מפורסמת ומצביעה על הגרסה', JSON.stringify(st1.payload));
const it1 = (await psiRow()).items;
ok(it1.length === 1 && it1[0].bucket === 'action' && it1[0].key === `taxest_${req.stepId}` && it1[0].actionKind === 'taxEstimate' && it1[0].label === 'הערכת המס לשנת 2026', 'הדף האישי: פריט «הערכת המס לשנת 2026» לקריאה', JSON.stringify(it1));
const v1 = await rpc('portal_tax_estimate', ['tok-c1', req.stepId]);
ok(v1.ok && v1.version === 1 && v1.estimateId === s1.id && v1.outputs.household.annualLiability === 65168 && v1.clientName === 'נועה כהן' && v1.spouseName === 'מיכל', 'הלקוח רואה את הגרסה המאושרת עצמה', JSON.stringify(v1).slice(0, 200));
const txt = JSON.stringify(v1);
ok(txt.includes('הרצאה חד-פעמית') && txt.includes('כיבוד') && !txt.includes('alignment'), 'ללקוח: החד-פעמי וההתאמה — כן; מצב היישור — לא (13.10)', txt.slice(0, 300));
ok(!/הערכה פנימית|הכרעה פנימית|הערת משרד|פנימי|usedRules|blockers|reconciliations|decisions/.test(txt), 'לא נחשפים: הכרעות, הערות, יישור, מקורות פנימיים, חוסמים וכללים', txt.slice(0, 300));
ok(v1.draft.lines[0].office.assumption === 'קצב', 'ההנחות לתחזית — כן נחשפות (חלק מהסיכום)');
ok((await rpc('portal_tax_estimate', ['tok-c2', req.stepId])).ok === false, 'טוקן של לקוח אחר — לא רואה');
ok((await rpc('portal_tax_estimate', ['bad', req.stepId])).error === 'invalid', 'טוקן לא תקין — נדחה');

// ── 3. גרסה מאושרת: רק שדות הפרסום ניתנים לשינוי ──
ok(!!(await throws(`update public.tax_estimates set outputs = '{}'::jsonb where id = '${s1.id}'`)), 'עריכת תוצאה של גרסה מאושרת — עדיין חסומה');
ok(!(await throws(`update public.tax_estimates set published_at = published_at where id = '${s1.id}'`)), 'עדכון שדות הפרסום — מותר');

// ── 4. גרסה חדשה מאושרת ⇒ הישנה נעלמת מהדף; פרסום החדשה ⇒ הפריט חוזר עם גרסה 2 ──
const s2 = await save({ latestVersion: 1 }, D({ note: 'אחרי שינוי' }), O({ household: { annualLiability: 70000 } }));
await rpc('approve_tax_estimate', [s2.id, 1]);
ok(((await psiRow()).items ?? []).length === 0 && (await rpc('portal_tax_estimate', ['tok-c1', req.stepId])).ok === false, 'אחרי אישור גרסה 2 — הלקוח לא רואה את גרסה 1 (אין מספר ישן)');
const prev = await rpc('portal_tax_estimate_preview', ['c1', req.stepId]);
ok(prev.ok && prev.version === 2 && !prev.publishedAt, '«מה הלקוח יראה» במשרד — גרסה 2, לפני פרסום');
const cv0 = (await one(`select payload->>'clientSub' s from public.onboarding_steps where id = $1`, [req.stepId])).s;
await rpc('publish_tax_estimate', [s2.id, true]);
const cv1 = (await one(`select payload->>'clientSub' s from public.onboarding_steps where id = $1`, [req.stepId])).s;
ok(cv0 !== cv1 && /^גרסה 2/.test(cv1), 'פרסום גרסה 2 משנה את תווית המשנה ⇒ גרסת התוכן ללקוח עולה («שלח בקשות» יודע)', `${cv0} → ${cv1}`);
const v2 = await rpc('portal_tax_estimate', ['tok-c1', req.stepId]);
ok(v2.version === 2 && v2.outputs.household.annualLiability === 70000, 'הלקוח רואה גרסה 2');
ok((await one(`select count(*)::int n from public.tax_estimates where request_id = $1 and published_at is not null and status = 'approved'`, [req.stepId])).n === 1, 'גרסה מפורסמת אחת לבקשה');

// ── 5. «שלח בקשות» ומפתח הדף ──
ok((await q(`select step_id from public._client_announceable_steps('c1')`)).some(r => r.step_id === req.stepId), '«שלח בקשות»: הערכה שפורסמה נספרת');
ok((await one(`select public._client_step_portal_key($1, 'tax_estimate') k`, [req.stepId])).k === `taxest_${req.stepId}`, 'מפתח הפריט בדף — אותו מפתח של הענף');

// ── 6. הסרה ──
await rpc('publish_tax_estimate', [s2.id, false]);
ok(((await psiRow()).items ?? []).length === 0 && !(await q(`select step_id from public._client_announceable_steps('c1')`)).some(r => r.step_id === req.stepId), 'הסרה: הפריט יורד מהדף ומ«שלח בקשות»');
ok((await one(`select published_at is not null p from public.onboarding_steps where id = $1`, [req.stepId])).p, 'הסרה לא נוגעת בפרסום הבקשה עצמה');

// ── 7. החלה חוזרת והחזרה ──
ok((await one(`select (length(prosrc) - length(replace(prosrc, '232 · הערכת מס שפורסמה', ''))) / length('232 · הערכת מס שפורסמה') n from pg_proc where proname = '_portal_step_items'`)).n === 1, 'החלה חוזרת לא מכפילה את הענף');
await db.exec(read('scripts/sql/232/rollback-232.sql'));
const gone = await one(`select (select count(*)::int from pg_proc where proname in ('publish_tax_estimate','portal_tax_estimate','portal_tax_estimate_preview','_tax_estimate_client_view')) f,
  (select prosrc like '%232 · הערכת מס%' from pg_proc where proname = '_portal_step_items') b,
  (select count(*)::int from information_schema.columns where table_name = 'tax_estimates' and column_name in ('published_at','published_by')) c`);
ok(gone.f === 0 && gone.b === false && gone.c === 0, 'החזרה: הפונקציות, הענף והעמודות הוסרו', JSON.stringify(gone));
ok(!!(await throws(`update public.tax_estimates set outputs = '{}'::jsonb where id = '${s2.id}'`)), 'אחרי החזרה — הגרסה המאושרת עדיין מוגנת (טריגר 231)');
const it7 = await q(`select step_id from public._client_announceable_steps('c1')`);
ok(Array.isArray(it7), 'אחרי החזרה — «שלח בקשות» עובד');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

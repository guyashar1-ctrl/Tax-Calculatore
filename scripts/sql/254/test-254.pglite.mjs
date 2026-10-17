// בדיקת מיגרציה 254 בבידוד — PGlite: פתיחת הקליטה מוסיפה את השאלות ומפרסמת אותן, בפעולה אחת ואידמפוטנטית.
//   PGLITE_DIR=<תיקייה עם node_modules/@electric-sql/pglite> node scripts/sql/254/test-254.pglite.mjs
// אותה הקמה כמו בדיקת 236 (229 + 230 + 236 על הסטאבים של 229), ואחריה 254 (פעמיים — החלה חוזרת).
// מה נבדק: (0) תנאי מוקדם — בלי 236 נעצר; (1) פתיחה עם שאלות ⇒ בקשה + בת + שאלות מפורסמות + הכדור אצל הלקוח, בלי מייל;
// (2) קריאה חוזרת עם אותן שאלות ⇒ אותה בקשה, 0 נוספו, 0 פורסמו; (3) שאלה חדשה לשאלון שכבר בדף ⇒ מתפרסמת וגרסת התוכן עולה;
// (4) פתיחה בלי שאלות (236 הישנה) + טיוטה ⇒ קריאת 254 מפרסמת את הטיוטה; (5) פריט לא מוכר ⇒ הכול מתגלגל אחורה — גם הפתיחה;
// (6) הלקוח רואה את השאלות בדף (portal_tax_info); (7) משרד אחר — אסור; anon — אסור; (8) ההיסטוריה של הבקשה.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
// ‼ CRLF בעותקי pivo-wt — מנרמלים כל קריאה (worktree-crlf-breaks-pglite-harness)
const read = (p) => readFileSync(WT + p, 'utf8').replace(/\r\n/g, '\n');
const sql229 = read('supabase/229-tax-year-collection.sql');
const sql230 = read('supabase/230-wealth-declaration-collection.sql');
const sql236 = read('supabase/236-tax-file-intake.sql');
const sql254 = read('supabase/254-intake-publishes-itself.sql');
const sql222 = read('supabase/222-request-preview.sql');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = read('scripts/sql/229/test-229-tax-year.pglite.mjs');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);'))
  .replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);
const announce = t229.slice(t229.indexOf('await db.exec(`create function public._client_announceable_steps') + 'await db.exec(`'.length, t229.indexOf('$f$;`);') + '$f$;'.length);

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };
const throwsExec = async (s) => { try { await db.exec(s); return null; } catch (e) { return e.message; } };

await db.exec(setup);
await db.exec(`create table public.documents (id text primary key, client_id text not null, file_name text);
  create table public.tax_fact_changes (id uuid primary key default gen_random_uuid(), client_id text not null, field_key text not null, source text not null, status text not null);
  create table public.email_messages (id uuid primary key default gen_random_uuid(), client_id text, step_id text, status text);`);
await db.exec(psi);
await db.exec(announce);
await db.exec(read('scripts/sql/236/legacy-stubs.sql'));
await db.exec(sql229);
await db.exec(sql230);
// ── 0. תנאי מוקדם: 254 לפני 236 — נעצר, בלי להשאיר כלום ──
const early = await throwsExec(sql254);
ok(!!early && early.includes('236'), '254 לפני 236 — נעצר עם הסבר', early ?? 'לא נעצר');
ok(!(await one(`select to_regprocedure('public.ensure_tax_file_intake(text, jsonb)') is not null x`)).x, 'אחרי העצירה — ה-overload לא נוצר');
await db.exec(sql236);
await db.exec(sql254);
await db.exec(sql254); // החלה חוזרת
ok((await one(`select count(*)::int n from pg_proc where proname = 'ensure_tax_file_intake'`)).n === 2, 'שתי חתימות: (text) של 236 ו-(text, jsonb) של 254 — גם אחרי החלה חוזרת');
console.log('הוחל: 222 + 229 + 230 + 236 + 254 (254 פעמיים)');

const P = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra } });
const ASKS = [
  { itemKey: 'intake.employed', subjectRole: 'client', prompt: P('עובד/ת כשכיר/ה?', 'yesno') },
  { itemKey: 'intake.idCard', subjectRole: 'client', prompt: P('תעודת זהות', 'file', { docKind: 'idCard' }) },
  { itemKey: 'intake.family', subjectRole: 'couple', prompt: P('מצב משפחתי', 'choice', { options: [{ value: 'single', label: 'רווק/ה' }] }) },
];
const mailsBefore = (await one(`select count(*)::int n from public.email_messages`)).n;

// ── 1. פתיחה עם שאלות — בפעולה אחת: בקשה, בת, שאלות מפורסמות, הכדור אצל הלקוח ──
await as(OFFICE);
await db.query(`update public.clients set portal_token = 'ptok-c1' where id = 'c1'`);
const r1 = await rpc('ensure_tax_file_intake', ['c1', JSON.stringify(ASKS)]);
ok(r1.ok && r1.created && r1.asked === 3 && r1.published === 3 && !!r1.infoStepId, 'פתיחה עם 3 שאלות: נוצרה, 3 נוספו, 3 פורסמו', JSON.stringify(r1));
const par = await one(`select step_type, status, ball from public.onboarding_steps where id = $1`, [r1.stepId]);
ok(par.step_type === 'tax_file_intake' && par.status === 'in_progress' && par.ball === 'me', 'ההורה כמו ב-236: עבודת המשרד, בטיפול', JSON.stringify(par));
const info = await one(`select step_type, status, ball, published_at, client_content_version v, payload from public.onboarding_steps where id = $1`, [r1.infoStepId]);
ok(info.step_type === 'info_collection' && info.status === 'waiting_client' && info.ball === 'client' && info.published_at !== null && info.payload.parentStepId === r1.stepId && info.payload.title === 'השלמת פרטים לתיק המס',
  'הבת: «השלמת פרטים לתיק המס», מפורסמת, הכדור אצל הלקוח', JSON.stringify(info));
const states = await q(`select state, count(*)::int n from public.tax_info_asks where step_id = $1 group by state`, [r1.infoStepId]);
ok(states.length === 1 && states[0].state === 'published' && states[0].n === 3, 'כל השאלות במצב «מפורסם» — אין טיוטה', JSON.stringify(states));
ok((await one(`select count(*)::int n from public.email_messages`)).n === mailsBefore, 'אין מייל: 0 שורות חדשות ביומן המיילים');

// ── 2. קריאה חוזרת עם אותן שאלות — אותה בקשה, כלום לא נוסף ולא פורסם שוב ──
const r2 = await rpc('ensure_tax_file_intake', ['c1', JSON.stringify(ASKS)]);
ok(r2.ok && !r2.created && r2.stepId === r1.stepId && r2.infoStepId === r1.infoStepId && r2.asked === 0 && r2.published === 0, 'לחיצה כפולה / שתי לשוניות: אותה בקשה, 0 נוספו, 0 פורסמו', JSON.stringify(r2));
ok((await one(`select client_content_version v from public.onboarding_steps where id = $1`, [r1.infoStepId])).v === info.v, 'גרסת התוכן לא עלתה בלי שינוי');
ok((await one(`select count(*)::int n from public.tax_info_asks where step_id = $1`, [r1.infoStepId])).n === 3, 'עדיין 3 שאלות — לא נשאלו פעמיים');

// ── 3. שאלה חדשה לשאלון שכבר בדף — מתפרסמת מיד, וגרסת התוכן עולה («שלח בקשות» יציע עדכון) ──
const r3 = await rpc('ensure_tax_file_intake', ['c1', JSON.stringify([...ASKS, { itemKey: 'intake.bankAccount', subjectRole: 'couple', prompt: P('חשבון בנק', 'text') }])]);
ok(r3.ok && r3.asked === 1 && r3.published === 1, 'שאלה רביעית: 1 נוספה, 1 פורסמה', JSON.stringify(r3));
ok((await one(`select client_content_version v from public.onboarding_steps where id = $1`, [r1.infoStepId])).v === info.v + 1, 'גרסת התוכן עלתה ב-1');

// ── 4. פתיחה בלי שאלות (236 הישנה) ואז טיוטה — קריאת 254 בלי שאלות מפרסמת את הטיוטה ──
// ‼ סגירה בבדיקה = גם השאלות הפתוחות נסגרות (האינדקס הייחודי של 229 — שאלה פתוחה אחת לפריט ללקוח)
const close = async (ids) => { await db.query(`update public.onboarding_steps set status = 'completed' where id = any($1)`, [ids]); await db.query(`update public.tax_info_asks set state = 'cancelled' where step_id = any($1) and state in ('draft','published','unavailable')`, [ids]); };
await close([r1.stepId, r1.infoStepId]);
const r4 = await rpc('ensure_tax_file_intake', ['c1']);
ok(r4.ok && r4.created && r4.stepId !== r1.stepId && r4.asked === undefined, 'הפתיחה הישנה (text) עובדת כמו קודם — בלי שאלות', JSON.stringify(r4));
const draft = await rpc('add_tax_info_asks', [r4.stepId, JSON.stringify([ASKS[0]])]);
ok(draft.ok && draft.added === 1 && (await one(`select state from public.tax_info_asks where step_id = $1`, [draft.infoStepId])).state === 'draft', 'טיוטה (כמו «הוסף שאלות» הישן)');
const r4b = await rpc('ensure_tax_file_intake', ['c1', '[]']);
ok(r4b.ok && !r4b.created && r4b.stepId === r4.stepId && r4b.asked === 0 && r4b.published === 1, 'קריאת 254 בלי שאלות — מפרסמת את הטיוטה הקיימת', JSON.stringify(r4b));
const r4c = await rpc('ensure_tax_file_intake', ['c1', null]);
ok(r4c.ok && r4c.published === 0, 'ושוב — אין מה לפרסם (אידמפוטנטי)', JSON.stringify(r4c));
await close([r4.stepId, draft.infoStepId]);

// ── 5. פריט לא מוכר — הכול מתגלגל אחורה, גם הפתיחה (לא נשארת היכרות ריקה) ──
const before5 = (await one(`select count(*)::int n from public.onboarding_steps where client_id = 'c1' and step_type = 'tax_file_intake'`)).n;
const bad = await throws(`select public.ensure_tax_file_intake('c1', $1::jsonb)`, [JSON.stringify([{ itemKey: 'intake.nope', subjectRole: 'client', prompt: P('x', 'yesno') }])]);
ok(!!bad && bad.includes('unknown_item'), 'פריט לא מוכר — שגיאה עם הקוד', bad ?? 'לא נזרקה');
ok((await one(`select count(*)::int n from public.onboarding_steps where client_id = 'c1' and step_type = 'tax_file_intake'`)).n === before5, 'הפתיחה התגלגלה אחורה — לא נוצרה בקשה');
const bad2 = await throws(`select public.ensure_tax_file_intake('c1', $1::jsonb)`, [JSON.stringify([{ itemKey: 'salary.worked', subjectRole: 'client', prompt: P('x', 'yesno') }])]);
ok(!!bad2 && bad2.includes('item_purpose_mismatch'), 'פריט של שנת מס בתוך קליטה — נדחה (הבדיקה של 236 נשארת)', bad2 ?? '');

// ── 6. הלקוח רואה את השאלות בדף — בלי פעולה של המשרד ──
const r6 = await rpc('ensure_tax_file_intake', ['c1', JSON.stringify(ASKS)]);
const v = await rpc('portal_tax_info', ['ptok-c1', r6.infoStepId]);
ok(v.ok && v.title === 'השלמת פרטים לתיק המס' && v.asks.length === 3 && v.asks.every(a => a.state === 'published'), 'הלקוח: «השלמת פרטים לתיק המס» עם 3 שאלות מפורסמות', JSON.stringify(v).slice(0, 200));
const items = (await one(`select public._portal_step_items(s, c, null::public.profiles, null::public.representation_requests, null) as r
  from public.onboarding_steps s, public.clients c where s.id = $1 and c.id = s.client_id`, [r6.infoStepId])).r.items;
ok(items.length === 1 && items[0].label === 'השלמת פרטים לתיק המס', 'פריט אחד בדף האישי — אותו פריט כמו היום', JSON.stringify(items));
// תשובה של הלקוח — הכדור חוזר למשרד כשהכול נענה (229/236 בלי שינוי)
for (const a of v.asks) await rpc('portal_submit_tax_info', ['ptok-c1', a.id, JSON.stringify(a.itemKey === 'intake.idCard' ? { kind: 'unavailable', reason: 'אחפש' } : a.itemKey === 'intake.family' ? { kind: 'choice', value: 'single' } : { kind: 'yes' })]);
const after = await one(`select status, ball from public.onboarding_steps where id = $1`, [r6.infoStepId]);
ok(after.status === 'in_progress' && after.ball === 'me', 'הלקוח ענה על הכול — הכדור חזר למשרד', JSON.stringify(after));
const r6b = await rpc('ensure_tax_file_intake', ['c1', JSON.stringify(ASKS)]);
ok(r6b.ok && r6b.asked === 0 && r6b.published === 0 && r6b.alreadyAnswered === 2, 'קריאה חוזרת אחרי התשובות — לא שואלת שוב מה שנענה (2 נענו; «אין לי עדיין» עדיין פתוחה — האינדקס של 229 מדלג)', JSON.stringify(r6b));
ok((await one(`select count(*)::int n from public.tax_info_asks where step_id = $1`, [r6.infoStepId])).n === 3, 'עדיין 3 שאלות בשאלון — לא נוצרה שאלה חוזרת');

// ── 7. הרשאות ──
await as(OTHER);
ok(!!(await throws(`select public.ensure_tax_file_intake('c1', $1::jsonb)`, [JSON.stringify(ASKS)])), 'משרד אחר — אסור');
await as(OFFICE);
const priv = await one(`select has_function_privilege('anon', 'public.ensure_tax_file_intake(text, jsonb)', 'execute') an, has_function_privilege('authenticated', 'public.ensure_tax_file_intake(text, jsonb)', 'execute') au`);
ok(!priv.an && priv.au, 'anon — לא; authenticated — כן', JSON.stringify(priv));

// ── 8. היסטוריה על ההורה ──
const hist = (await one(`select payload->'history' h from public.onboarding_steps where id = $1`, [r6.stepId])).h;
ok(Array.isArray(hist) && hist[0]?.what === 'opened' && hist.some(h => h.what === 'questions_published' && h.added === 3 && h.published === 3), 'היסטוריה: «נפתחה» ואז «השאלות פורסמו» (3/3)', JSON.stringify(hist));

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

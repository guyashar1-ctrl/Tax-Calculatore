// בדיקת מיגרציה 246 בבידוד: PGlite על 206 (כמו שהיא בקובץ) + 246 — ביטול טופס 6101 מרשימת «בקשות» רק לפני חתימה.
//   PGLITE_DIR=<tmp עם node_modules/@electric-sql/pglite> node scripts/sql/246/test-246-cancel-scope.pglite.mjs
// ‼ לא הוחל על שום סביבה. PGlite אינה תלות של הפרויקט (npm i @electric-sql/pglite בתיקייה זמנית).
// מה נבדק (סקירת Codex 15.10, P1): הלקוח חותם בזמן שחלון הביטול פתוח ⇒ הביטול מהרשימה נדחה בשרת;
//   החתימה והמצב נשמרים; ביטול לפני חתימה עדיין עובד; מסך הטופס (בלי היקף) לא השתנה.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const read = (f) => readFileSync(WT + f, 'utf8').replace(/\r\n/g, '\n');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ''}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;

// ── סטאבים מינימליים לטבלאות/פונקציות שמחוץ ל-206 ──
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${OFFICE}'), ('${OTHER}');
  create function public.is_authorized() returns boolean language sql stable as $$ select true $$;
  create table public.clients (id text primary key, user_id uuid not null);
  create table public.profiles (id uuid primary key, settings jsonb, firm_name text, branding jsonb);
  create table public.onboarding_steps (id text primary key, user_id uuid not null, client_id text not null, step_type text not null,
    status text not null default 'pending', ball text not null default 'me', payload jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
  create function public._set_step_status(p_step text, p_status text, p_actor text, p_label text, p_meta jsonb, p_ball text, p_method text)
    returns void language sql as $$ update public.onboarding_steps set status = p_status, ball = p_ball where id = p_step $$;
  create function public.create_onboarding_request(a text, b text, c jsonb, d date, e text, f boolean, g boolean, h text, i text)
    returns jsonb language sql as $$ select '{"ok":true}'::jsonb $$;
  create table public.documents (id text primary key, user_id uuid, client_id text);
`);
const s206 = read('supabase/206-smart-form-filings.sql');
await db.exec(s206.slice(0, s206.indexOf('create or replace function public.assert_domain_function_invariants')));
console.log('הוחל: 206 (בלי בדיקת הכללים הסופית)');
const s246 = read('supabase/246-smart-form-cancel-scope.sql');
await db.exec(s246);
await db.exec(s246); // החלה חוזרת
console.log('הוחל: 246 (פעמיים)');

// ── נתונים ──
const PNG = 'data:image/png;base64,' + 'A'.repeat(400);
const SHA = 'abc123';
let n = 0;
/** הגשה + גרסה נעולה לחתימה (שני חותמים נדרשים) + שלב «בקשות» — במצב המבוקש. */
async function seed(state, { user = OFFICE } = {}) {
  n++;
  // ‼ הגשה פתוחה אחת ללקוח+טופס+נושא (smart_form_filings_one_open) — לכל בדיקה לקוח משלה.
  const client = `cl${n}`, f = `f${n}`, st = `st${n}`;
  await db.query(`insert into public.clients values ($1, $2)`, [client, user]);
  await db.query(`insert into public.onboarding_steps (id, user_id, client_id, step_type, payload) values ($1, $2, $3, 'custom_request', '{}')`, [st, user, client]);
  await db.query(`insert into public.smart_form_filings (id, user_id, client_id, template_key, state, current_revision, step_id) values ($1, $2, $3, 'btl-6101', $4, 1, $5)`, [f, user, client, state, st]);
  await db.query(`insert into public.smart_form_revisions (id, filing_id, user_id, revision, template_key, template_version, template_sha256, mapping_version, state, content_sha256, signers)
    values ($1, $2, $3, 1, 'btl-6101', 'v', 'h', 1, $4, $5, $6)`,
    [`r${n}`, f, user, ['awaiting_signatures'].includes(state) ? 'locked' : state === 'draft' ? 'draft' : 'signed', SHA,
      JSON.stringify([{ role: 'client', required: true, status: 'pending' }, { role: 'spouse', required: true, status: 'pending' }])]);
  return f;
}
const cancel = (f, d = { reason: 'נפתח בטעות', scope: 'request_list' }) => rpc('smart_form_advance', [f, 'cancel', JSON.stringify(d)]);
const filing = async (f) => one(`select state, closed_at from public.smart_form_filings where id = $1`, [f]);
const rev = async (f) => one(`select signatures, signers, sign_tokens, state from public.smart_form_revisions where filing_id = $1`, [f]);
const stepOf = async (f) => one(`select s.status from public.onboarding_steps s join public.smart_form_filings x on x.step_id = s.id where x.id = $1`, [f]);
const cancelEvents = async (f) => (await q(`select id from public.smart_form_events where filing_id = $1 and kind = 'cancel'`, [f])).length;

await as(OFFICE);

// ── 1 · לפני חתימה — הביטול מהרשימה עובד ──
let f = await seed('draft');
let r = await cancel(f);
ok(r.ok === true && r.state === 'cancelled', 'טיוטה: ביטול מהרשימה עובד', JSON.stringify(r));
f = await seed('awaiting_signatures');
await rpc('smart_form_issue_sign_link', [f, 1, 'client', 14]);
r = await cancel(f);
ok(r.ok === true, 'ממתין לחתימות, בלי חתימה: ביטול מהרשימה עובד', JSON.stringify(r));
ok((await filing(f)).state === 'cancelled' && (await stepOf(f)).status === 'cancelled', 'ההגשה והשלב בוטלו');
ok(JSON.stringify((await rev(f)).sign_tokens) === '{}', 'קישורי החתימה נסגרו');
ok((await cancelEvents(f)) === 1, 'נרשם אירוע ביטול אחד ביומן');

// ── 2 · המרוץ: חלון הביטול פתוח, הלקוח חותם, ואז לוחצים «בטל» ──
f = await seed('awaiting_signatures');
const seen = (await filing(f)).state; // «החלון נפתח» — המסך ראה מצב שמותר בו ביטול
ok(seen === 'awaiting_signatures', 'המסך ראה «ממתין לחתימות» (הביטול מוצע)');
const link = await rpc('smart_form_issue_sign_link', [f, 1, 'client', 14]);
await as(null);
const sg = await rpc('submit_smart_form_signature', [link.token, PNG, SHA, true]);
await as(OFFICE);
ok(sg.ok === true && sg.allSigned === false, 'הלקוח חתם בקישור (חתימה חלקית — בן/בת הזוג עוד לא)', JSON.stringify(sg));
r = await cancel(f);
ok(r.ok === false && r.error === 'signed_cannot_cancel', 'חתימה חלקית: הביטול מהרשימה נדחה בשרת', JSON.stringify(r));
ok((await filing(f)).state === 'awaiting_signatures' && (await stepOf(f)).status !== 'cancelled', 'המצב והשלב לא השתנו');
const kept = await rev(f);
ok(!!kept.signatures.client && kept.signers.find(s => s.role === 'client').status === 'signed', 'החתימה נשמרה כמו שהייתה');
ok((await cancelEvents(f)) === 0, 'שום אירוע ביטול לא נרשם בסירוב');
// חותם שני בחתימה במשרד ⇒ נחתם
const cap = await rpc('smart_form_capture_signature', [f, 1, 'spouse', PNG, SHA, 'נוכח וחותם']);
ok(cap.ok === true && cap.allSigned === true && (await filing(f)).state === 'signed', 'שני החותמים חתמו ⇒ «נחתם»', JSON.stringify(cap));
r = await cancel(f);
ok(r.ok === false && r.error === 'signed_cannot_cancel', 'נחתם: הביטול מהרשימה נדחה', JSON.stringify(r));
ok((await filing(f)).state === 'signed' && (await stepOf(f)).status !== 'cancelled', 'נחתם נשאר נחתם, והשלב לא בוטל');

// ── 3 · מצבים אחרי חתימה, עם היקף הרשימה ──
for (const st of ['signed', 'awaiting_client_submission']) {
  f = await seed(st);
  r = await cancel(f);
  ok(r.ok === false && r.error === 'signed_cannot_cancel' && (await filing(f)).state === st, `${st}: נדחה מהרשימה, המצב נשמר`, JSON.stringify(r));
}
for (const st of ['submitted', 'info_requested', 'result_received']) {
  f = await seed(st);
  r = await cancel(f);
  ok(r.ok === false && r.error === 'submitted_cannot_cancel', `${st}: נדחה כמו ב-206 (submitted_cannot_cancel)`, JSON.stringify(r));
}
f = await seed('awaiting_signatures');
await db.query(`update public.smart_form_revisions set signed_document_id = 'doc1' where filing_id = $1`, [f]);
r = await cancel(f);
ok(r.ok === false && r.error === 'signed_cannot_cancel', 'מסמך חתום קיים בגרסה ⇒ נדחה גם אם המצב עוד לא התעדכן', JSON.stringify(r));

// ── 4 · מסך הטופס עצמו (בלי היקף) — ההתנהגות של 206 ללא שינוי ──
f = await seed('signed');
r = await cancel(f, { reason: 'החלטה מקצועית במסך הטופס' });
ok(r.ok === true && (await filing(f)).state === 'cancelled', 'בלי היקף: «נחתם» עדיין ניתן לביטול (מסך הטופס)', JSON.stringify(r));
f = await seed('awaiting_client_submission');
r = await cancel(f, { reason: 'החלטה מקצועית' });
ok(r.ok === true, 'בלי היקף: «ממתין להגשת הלקוח» עדיין ניתן לביטול', JSON.stringify(r));
f = await seed('submitted');
r = await cancel(f, { reason: 'x' });
ok(r.ok === false && r.error === 'submitted_cannot_cancel', 'בלי היקף: «הוגש» עדיין חסום', JSON.stringify(r));

// ── 5 · שמירות נוספות ──
f = await seed('draft');
r = await cancel(f, { reason: 'x', scope: 'whatever' });
ok(r.ok === false && r.error === 'bad_scope' && (await filing(f)).state === 'draft', 'היקף לא מוכר ⇒ bad_scope, בלי שינוי', JSON.stringify(r));
r = await cancel(f, { scope: 'request_list' });
ok(r.ok === false && r.error === 'reason_required', 'בלי סיבה ⇒ reason_required', JSON.stringify(r));
r = await cancel(f, { reason: 'פעמיים', scope: 'request_list' });
r = await cancel(f, { reason: 'פעמיים', scope: 'request_list' });
ok(r.ok === false && r.error === 'bad_transition', 'ביטול שני על מבוטל ⇒ bad_transition', JSON.stringify(r));
f = await seed('draft', { user: OTHER });
r = await cancel(f);
ok(r.ok === false && r.error === 'forbidden', 'משרד אחר ⇒ forbidden', JSON.stringify(r));

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

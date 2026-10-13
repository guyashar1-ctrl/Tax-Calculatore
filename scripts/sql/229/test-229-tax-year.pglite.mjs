// בדיקת מיגרציה 229 בבידוד: PGlite (Postgres 18 ב-WASM), בלי שום סביבה אמיתית.
// סטאבים מינימליים לטבלאות הקיימות + גוף _portal_step_items מ-222 כמו שהוא בקובץ + 229.
// ‼ PGlite אינה תלות של הפרויקט. הרצה:
//   1. בתיקייה זמנית: npm i @electric-sql/pglite@0.5.8
//   2. צד הקוד (להשוואה): npx esbuild scripts/sql/229/ts-side.ts --bundle --platform=node --alias:@src=./src --outfile=<tmp>/ts-side.cjs && node <tmp>/ts-side.cjs > <tmp>/ts.json
//   3. PGLITE_DIR=<tmp> node scripts/sql/229/test-229-tax-year.pglite.mjs <tmp>/ts.json
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);

const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const sql229 = readFileSync(WT + 'supabase/229-tax-year-collection.sql', 'utf8');
const sql222 = readFileSync(WT + 'supabase/222-request-preview.sql', 'utf8').replace(/\r\n/g, '\n');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const ts = JSON.parse(readFileSync(process.argv[2], 'utf8')); // תוצאות הצד של TS (מהבנדל)

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, name, info = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, info); } };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const as = async (uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).r;
const throws = async (s, p) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };

const OFFICE = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function public.is_authorized() returns boolean language sql stable as $$ select true $$;
  create table public.clients (id text primary key, user_id uuid not null, first_name text, portal_token text, portal_token_expires_at timestamptz, intake_token text);
  create table public.profiles (id uuid primary key, settings jsonb, firm_name text, branding jsonb);
  create table public.representation_requests (id text primary key, execution jsonb);
  create table public.engagements (id text primary key);
  create table public.onboarding_steps (
    id text primary key default replace(gen_random_uuid()::text, '-', ''), user_id uuid not null, engagement_id text, client_id text not null references public.clients(id),
    step_type text not null, track text not null, scope text not null, status text not null default 'pending', ball text not null default 'me',
    depends_on_step_id text, due_date date, needs_attention boolean not null default false, payload jsonb not null default '{}'::jsonb,
    completion_method text not null default 'manual', completed_by uuid, completed_at timestamptz, verified_at timestamptz,
    published_at timestamptz default now(), client_content_version int not null default 0, sort_order int, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  -- ‼ כמו במסד האמיתי (214): ברירת המחדל של published_at היא now(), וגרסת התוכן עולה בפרסום ראשון.
  create function public.onboarding_step_content_version_trg() returns trigger language plpgsql as $t$
  begin
    if tg_op = 'INSERT' then new.client_content_version := case when new.published_at is not null then 1 else 0 end; return new; end if;
    if old.published_at is null and new.published_at is not null then new.client_content_version := old.client_content_version + 1; end if;
    return new;
  end $t$;
  create trigger onboarding_steps_content_version before insert or update on public.onboarding_steps for each row execute function public.onboarding_step_content_version_trg();
  create table public.annual_report_sessions (id uuid primary key default gen_random_uuid(), client_id text not null, tax_year int not null, superseded_by uuid, created_at timestamptz default now());
  insert into public.clients values ('c1', '${OFFICE}', 'נועה', 'tok-c1', null, null), ('c2', '${OTHER}', 'אחר', 'tok-c2', now() - interval '1 day', null);
  -- האינדקס של 220 כמו שהוא היום (229 מחליף אותו)
  create unique index onboarding_steps_person_type_idx on public.onboarding_steps (client_id, step_type)
    where scope = 'person' and status <> 'cancelled'
      and step_type <> all (array['custom_request','authority_representation','client_documents','prev_accountant_details','release_letter','materials_received','intake_questionnaire','retainer_authorization','business_details']);
`);
await db.exec(psi);          // גוף 222 כמו שהוא
// 214/220: הפונקציות של «שלח בקשות» — עם אותו טקסט עוגן כמו בגוף החי ב-staging (סעיף 12 של 229)
await db.exec(`create function public._client_announceable_steps(p_client_id text) returns table(step_id text, step_type text) language sql stable as $f$
  select s.id, s.step_type from public.onboarding_steps s
   where s.client_id = p_client_id and s.published_at is not null
     and s.step_type in ('client_documents', 'custom_request',
                         'business_details')
     and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')
$f$;
create function public._client_step_portal_key(p_step_id text, p_step_type text) returns text language sql immutable as $f$
  select case p_step_type
           when 'custom_request' then 'custom_' || p_step_id
           when 'rep_client_approval' then 'rep_approval'
         end
$f$;`);
await db.exec(sql229);       // המיגרציה
console.log('הוחל: 222 (_portal_step_items) + 229');
await db.exec(sql229); // החלה חוזרת — סעיפים 11 ו-12 לא מכפילים

// ── 1. בקשה ראשית: אידמפוטנטית, אחת לשנה ──
await as(OFFICE);
const sess = await one(`insert into public.annual_report_sessions (client_id, tax_year) values ('c1', 2025) returning id`);
const e1 = await rpc('ensure_tax_year_request', ['c1', 'estimate', 2026, 9]);
const e2 = await rpc('ensure_tax_year_request', ['c1', 'estimate', 2026, 9]);
ok(e1.ok && e1.created && e2.ok && !e2.created && e1.stepId === e2.stepId, 'לחיצה כפולה → אותה בקשה');
const e27 = await rpc('ensure_tax_year_request', ['c1', 'estimate', 2027, 3]);
ok(e27.ok && e27.created && e27.stepId !== e1.stepId, 'שנה אחרת = בקשה נפרדת (האינדקס של 220 לא חוסם)');
const dup = await throws(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, payload) values ('${OFFICE}','c1','tax_estimate','internal','person','in_progress','{"taxYear":2026}')`);
ok(!!dup && dup.includes('onboarding_steps_tax_year_open_idx'), 'השרת חוסם בקשה פתוחה שנייה לאותה שנה', dup);
ok((await rpc('ensure_tax_year_request', ['c1', 'estimate', 2026, null])).error === 'bad_cutoff', 'הערכה בלי חודש חתך נדחית');
const an = await rpc('ensure_tax_year_request', ['c1', 'annual', 2025, null]);
const anPayload = (await one(`select payload from public.onboarding_steps where id = $1`, [an.stepId])).payload;
ok(anPayload.legacySessionId === sess.id, 'דוח שנתי 2025 מקושר לסשן השאלון הישן — לא מסלול שני');
await as(OTHER);
ok(!!(await throws(`select public.ensure_tax_year_request('c1','estimate',2028,5)`)), 'משרד אחר — אסור');
await as(OFFICE);

// ── 2. «השלמת מידע»: הוספה, כפילות, פריט לא מוכר ──
const prompt = (title, kind, extra = {}) => ({ title, why: 'למה', input: { kind, ...extra } });
const asks = [
  { itemKey: 'donations.given', subjectRole: 'client', prompt: prompt('תרמת?', 'yesno') },
  { itemKey: 'donations.given', subjectRole: 'spouse', prompt: prompt('מיכל תרמה?', 'yesno') },
  { itemKey: 'household.children', subjectRole: 'couple', prompt: prompt('הילדים', 'confirm', { lines: ['דנה — 2014'] }) },
  { itemKey: 'rent.income', subjectRole: 'couple', entityKind: 'property', entityRef: 'p1', prompt: prompt('שכר דירה', 'amount') },
  { itemKey: 'salary.form106', subjectRole: 'client', entityKind: 'employer', entityRef: 'e1', prompt: prompt('106', 'file', { docKind: 'form106' }) },
  { itemKey: 'capital.form867', subjectRole: 'couple', entityKind: 'account', entityRef: 'a1', prompt: prompt('867', 'file', { docKind: 'form867' }) },
];
const add1 = await rpc('add_tax_info_asks', [e1.stepId, JSON.stringify(asks)]);
const add2 = await rpc('add_tax_info_asks', [e1.stepId, JSON.stringify(asks.slice(0, 2))]);
ok(add1.ok && add1.added === 6 && add2.added === 0 && add2.skipped === 2 && add1.infoStepId === add2.infoStepId, 'לא שואלים פעמיים; בקשת־בת אחת', JSON.stringify([add1, add2]));
ok((await rpc('add_tax_info_asks', [e1.stepId, JSON.stringify([{ itemKey: 'x.y', subjectRole: 'client', prompt: prompt('t', 'yesno') }])])).error === 'unknown_item', 'פריט לא מוכר נדחה');
const info = add1.infoStepId;
// לפני פרסום — הלקוח לא רואה כלום
ok((await rpc('portal_tax_info', ['tok-c1', info])).asks.length === 0, 'טיוטה לא מוצגת בדף האישי');
ok((await one(`select published_at is null as d, client_content_version v from public.onboarding_steps where id = $1`, [info])).d, 'טיוטה: «השלמת מידע» בלי תאריך פרסום (לא נספרת ב«שלח בקשות»)');
const pub = await rpc('publish_tax_info', [info]);
ok((await one(`select client_content_version v from public.onboarding_steps where id = $1`, [info])).v === 1, 'פרסום ראשון: גרסת תוכן 1');
ok(pub.ok && pub.published === 6, 'פרסום');
ok((await one(`select status, ball from public.onboarding_steps where id = $1`, [info])).status === 'waiting_client', 'הכדור אצל הלקוח');

// ── 3. הדף האישי ──
const view = await rpc('portal_tax_info', ['tok-c1', info]);
ok(view.ok && view.asks.length === 6 && view.taxYear === 2026, 'הדף האישי רואה את השאלות');
ok((await rpc('portal_tax_info', ['bad', info])).error === 'invalid', 'טוקן שגוי');
ok((await rpc('portal_tax_info', ['tok-c2', info])).error === 'invalid', 'טוקן שפג — נדחה');
const askId = k => view.asks.find(a => a.itemKey === k.split('|')[0] && a.subjectRole === k.split('|')[1]).id;
// שמירה ויציאה
ok((await rpc('portal_save_tax_info_draft', ['tok-c1', askId('rent.income|couple'), JSON.stringify({ amount: '48' })])).ok, 'טיוטה נשמרת בשרת');
ok((await rpc('portal_tax_info', ['tok-c1', info])).asks.find(a => a.itemKey === 'rent.income').savedDraft.amount === '48', 'חזרה — הטיוטה שם');

const sub = (k, ans) => rpc('portal_submit_tax_info', ['tok-c1', askId(k), JSON.stringify(ans)]);
const r1 = await sub('donations.given|client', { kind: 'yes' });
const r1b = await sub('donations.given|client', { kind: 'yes' });
ok(r1.ok && r1b.already, 'שליחה כפולה לא כותבת שוב');
const f1 = await one(`select * from public.tax_year_facts where item_key = 'donations.given' and subject_role = 'client'`);
ok(f1.status === 'pending' && f1.basis === 'actual_to_date' && String(f1.period_to).startsWith('2026-09-30') === false ? f1.period_to.toISOString().slice(0, 10) === '2026-09-30' : true, 'תשובה להערכה: ממתינה, עד סוף ספטמבר', JSON.stringify(f1));
ok(f1.period_to.toISOString().slice(0, 10) === '2026-09-30' && f1.basis === 'actual_to_date' && f1.source === 'portal', 'תקופה ובסיס נכונים');
await sub('donations.given|spouse', { kind: 'no' });
ok((await one(`select answer, value from public.tax_year_facts where item_key = 'donations.given' and subject_role = 'spouse'`)).answer === 'no', '«לא» נשמר כתשובה (לא ריק)');
await sub('household.children|couple', { kind: 'unchanged' });
const fu = await one(`select * from public.tax_year_facts where item_key = 'household.children'`);
ok(fu.client_assertion === 'unchanged' && fu.status === 'pending', '«אין שינוי» = הצהרת לקוח ממתינה');
ok((await sub('rent.income|couple', { kind: 'amount', amount: -5 })).error === 'bad_amount', 'סכום שלילי נדחה');
await sub('rent.income|couple', { kind: 'amount', amount: 0 });
ok((await one(`select answer from public.tax_year_facts where item_key = 'rent.income'`)).answer === 'zero', 'אפס נשמר כ«אפס»');
const un = await sub('salary.form106|client', { kind: 'unavailable', reason: 'המעסיק עוד לא שלח' });
const unRow = await one(`select state, unavailable from public.tax_info_asks where id = $1`, [askId('salary.form106|client')]);
ok(un.state === 'unavailable' && unRow.unavailable.followUpOn === ts.followUp106_2026, 'מסמך «אין עדיין» → מועד לפי סוג ושנה', JSON.stringify(unRow.unavailable));
ok(!(await one(`select count(*)::int n from public.tax_year_facts where item_key = 'salary.form106'`)).n, 'מסמך חסר אינו עובדה');
await sub('capital.form867|couple', { kind: 'file', fileName: '867.pdf', documentId: 'doc-1' });
const ev = await one(`select * from public.tax_evidence`);
ok(ev.review === 'needs_review' && ev.identity_match === 'unchecked' && ev.extraction === 'not_supported', 'מסמך שהתקבל: ממתין לבדיקה, בלי חילוץ');
const stepAfter = await one(`select status, ball from public.onboarding_steps where id = $1`, [info]);
ok(stepAfter.status === 'in_progress' && stepAfter.ball === 'me', 'כשנענה הכול — חזרה למשרד (מסמך «אין עדיין» לא חוסם)');

// ── 4. הדף האישי — הענף ב-_portal_step_items ──
const psiRow = async () => (await one(`select public._portal_step_items(s, c, null::public.profiles, null::public.representation_requests, null) as r
  from public.onboarding_steps s, public.clients c where s.id = $1 and c.id = s.client_id`, [info])).r;
const items1 = (await psiRow()).items;
ok(items1.length === 1 && items1[0].bucket === 'office' && items1[0].actionKind === 'taxInfo', 'נשאר רק מסמך «אין עדיין» → «מחכים למסמכים», בלי תזכורת', JSON.stringify(items1));
await db.query(`update public.tax_info_asks set state = 'published' where id = $1`, [askId('salary.form106|client')]);
ok((await psiRow()).items[0].bucket === 'action', 'שאלה פתוחה → פריט פעולה');
await db.query(`update public.tax_info_asks set state = 'answered' where id = $1`, [askId('salary.form106|client')]);
ok((await psiRow()).items[0].bucket === 'done', 'הכול נענה → «נשלח למשרד»');
ok((await one(`select prosrc like '%229 · «השלמת מידע»%' as x from pg_proc where proname = '_portal_step_items'`)).x, 'הענף הוזרק לגוף החי');
await db.exec(sql229.slice(sql229.indexOf('do $patch$')));
ok((await one(`select (length(prosrc) - length(replace(prosrc, '229 · «השלמת מידע»', ''))) / length('229 · «השלמת מידע»') as n from pg_proc where proname = '_portal_step_items'`)).n === 1, 'החלה חוזרת לא מכפילה את הענף');
// ‼ 12.10.2026 · ב-staging הוחלה גרסה ישנה של הענף («N שאלות»). החלה חוזרת חייבת לעדכן אותה — לא לדלג.
{
  const SUB_NEW = `'sub', case when v_ck_total = 1 then 'שאלה אחת' else v_ck_total || ' שאלות' end || ' · אפשר לעצור ולהמשיך',`;
  const SUB_OLD = `'sub', v_ck_total || ' שאלות · אפשר לעצור ולהמשיך',`;
  const def = async () => (await one(`select pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure) d`)).d;
  const cur = await def();
  ok(cur.includes(SUB_NEW), 'הענף בגרסה הנוכחית («שאלה אחת»)');
  await db.exec(cur.replace(SUB_NEW, SUB_OLD)); // מדמה את staging: הגרסה הישנה
  ok((await def()).includes(SUB_OLD), 'מצב staging מדומה: הגרסה הישנה');
  await db.exec(sql229.slice(sql229.indexOf('do $patch$')));
  const up = await def();
  ok(up.includes(SUB_NEW) && !up.includes(SUB_OLD) && (up.split('229 · «השלמת מידע»').length - 1) === 1, 'החלה חוזרת עדכנה את הגרסה הישנה במקומה — בלי כפילות');
  await db.query(`update public.tax_info_asks set state = 'published' where id = $1`, [askId('salary.form106|client')]);
  ok((await psiRow()).items[0].sub.startsWith('שאלה אחת'), 'בדף האישי: «שאלה אחת · אפשר לעצור ולהמשיך»', JSON.stringify((await psiRow()).items[0]));
  await db.query(`update public.tax_info_asks set state = 'answered' where id = $1`, [askId('salary.form106|client')]);
  // גרסה לא מוכרת (מישהו ערך ידנית) — עוצרים, לא מנחשים ולא דורסים
  await db.exec(up.replace(SUB_NEW, `'sub', 'נוסח שמישהו ערך ביד',`));
  const err = await throws(sql229.slice(sql229.indexOf('do $patch$'), sql229.indexOf('$patch$;') + '$patch$;'.length));
  ok(!!err && err.includes('גרסה לא מוכרת'), 'ענף בגרסה לא מוכרת — ההחלה נעצרת', err ?? 'לא נעצר');
  await db.exec(up); // חזרה לגרסה הנוכחית להמשך הבדיקה
}

// ── 5. המשרד: אישור מרוכז, תיקון, ראיות ──
const ids = (await q(`select id from public.tax_year_facts where status = 'pending' order by created_at`)).map(r => r.id);
const d1 = await rpc('decide_tax_year_facts', [ids, 'accept', null]);
ok(d1.decided === ids.length, 'אישור מרוכז לרשימה מפורשת');
const corr = await rpc('correct_tax_year_fact', [f1.id, 'value', JSON.stringify({ yes: true, note: 'רק לעמותה' }), 'תיקון משרד']);
const orig = await one(`select status from public.tax_year_facts where id = $1`, [f1.id]);
const neu = await one(`select status, source, supersedes from public.tax_year_facts where id = $1`, [corr.factId]);
ok(orig.status === 'superseded' && neu.status === 'accepted' && neu.source === 'office' && neu.supersedes === f1.id, 'תיקון: שורה חדשה, המקורית נשמרת');
ok((await rpc('review_tax_evidence', [ev.id, 'mismatch', 'match', 'accepted', null])).error === 'mismatch_cannot_accept', 'אי אפשר לאשר מסמך שלא תואם');
ok((await rpc('review_tax_evidence', [ev.id, 'match', 'match', 'accepted', null])).ok, 'מסמך תואם — אושר');
const rec = await rpc('record_tax_year_fact', ['c1', JSON.stringify({ taxYear: 2026, itemKey: 'capital.amounts', subjectRole: 'couple', entityKind: 'account', entityRef: 'a1', value: { gains: 1200 }, basis: 'final', evidenceId: ev.id })]);
ok((await one(`select source, status from public.tax_year_facts where id = $1`, [rec.factId])).source === 'document', 'הזנת משרד מהמסמך — מקור «מסמך»');
// אישור שני לאותה זהות → הקודם מוחלף
await db.query(`insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_to, answer, value, basis, source, status)
  values ('${OFFICE}','c1',2026,'donations.amount','client','months','2026-09-30','value','5000','actual_to_date','portal','accepted')`);
const p2 = await one(`insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_to, answer, value, basis, source, status)
  values ('${OFFICE}','c1',2026,'donations.amount','client','months','2026-09-30','value','6000','actual_to_date','portal','pending') returning id`);
await rpc('decide_tax_year_facts', [[p2.id], 'accept', null]);
ok((await one(`select count(*) filter (where status='accepted')::int a, count(*) filter (where status='superseded')::int s from public.tax_year_facts where item_key='donations.amount'`)).s === 1, 'אישור חדש מחליף את הקודם (היסטוריה נשמרת)');
ok(!!(await throws(`insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, answer, basis, source) values ('${OFFICE}','c1',2026,'x','client','year','value','actual','office')`)), 'ערך ריק לתשובה «ערך» — אסור');

// ── 6. העברה מהכרטיס ──
const tr = [
  { path: 'donationsAnnual', itemKey: 'donations.amount', subjectRole: 'client', original: 3000, suggestedYear: 2024, evidence: 'נכתב מהשאלון השנתי לשנת 2024', decision: 'year', year: 2024 },
  { path: 'rentalIncomeAnnual', itemKey: 'rent.incomeTotal', subjectRole: 'couple', original: 60000, decision: 'unknown_year' },
];
const t1 = await rpc('decide_card_transfers', ['c1', JSON.stringify(tr)]);
const t2 = await rpc('decide_card_transfers', ['c1', JSON.stringify(tr)]);
ok(t1.decided === 2 && t2.decided === 0, 'העברה: אידמפוטנטית, לא דורסת החלטה');
const tf = await one(`select tax_year, status, source, value, decided_by, basis from public.tax_year_facts where source = 'card_migration'`);
ok(tf.tax_year === 2024 && tf.status === 'accepted' && tf.decided_by === OFFICE && tf.basis === 'declared' && tf.value.donationsAnnual === 3000, 'שנה עם ראיה → אישור המשרד, «דווח», עם הערך המקורי');
const unk = await one(`select decision, fact_id, original from public.tax_card_transfers where path = 'rentalIncomeAnnual'`);
ok(unk.decision === 'unknown_year' && unk.fact_id === null && unk.original === 60000, '«שנה לא ידועה» — בלי עובדה, המקור נשמר');
ok((await rpc('decide_card_transfers', ['c1', JSON.stringify([{ path: 'x', itemKey: 'donations.amount', subjectRole: 'client', original: 1, decision: 'year' }])])).error === 'year_required', 'שנה בלי ערך — נדחה');

// ── 7. שאלון ישן ──
const lf = ts.legacyFacts.map(f => ({ ...f, taxYear: 2025 }));
const l1 = await rpc('record_legacy_tax_year_facts', ['c1', sess.id, JSON.stringify(lf)]);
const l2 = await rpc('record_legacy_tax_year_facts', ['c1', sess.id, JSON.stringify(lf)]);
ok(l1.recorded === lf.length && l2.recorded === 0, 'שאלון ישן: קליטה חוזרת בלי כפילות', JSON.stringify([l1, l2]));
ok((await rpc('record_legacy_tax_year_facts', ['c1', sess.id, JSON.stringify([{ ...lf[0], taxYear: 2026 }])])).error === 'year_mismatch', 'שנה שונה משנת הסשן — נדחה');

// ── 7ב. «מי מכם?» — עובדה לכל אחד מבני הזוג ──
const w = await rpc('add_tax_info_asks', [e27.stepId, JSON.stringify([{ itemKey: 'savings.insurance', subjectRole: 'couple', prompt: { title: 'מי מכם?', why: '', input: { kind: 'who', clientName: 'נועה', spouseName: 'מיכל' } } }])]);
await rpc('publish_tax_info', [w.infoStepId]);
const wv = await rpc('portal_tax_info', ['tok-c1', w.infoStepId]);
const wr = await rpc('portal_submit_tax_info', ['tok-c1', wv.asks[0].id, JSON.stringify({ kind: 'who', value: 'spouse' })]);
const wf = await q("select subject_role, answer, value from public.tax_year_facts where item_key = 'savings.insurance' and tax_year = 2027 order by subject_role");
ok(wr.ok && wf.length === 2 && wf[0].subject_role === 'client' && wf[0].answer === 'no' && wf[1].subject_role === 'spouse' && wf[1].answer === 'value', '«מי מכם?» → «לא» ללקוח, «כן» לבן/בת הזוג', JSON.stringify(wf));
ok((await rpc('portal_submit_tax_info', ['tok-c1', wv.asks[0].id, JSON.stringify({ kind: 'who', value: 'x' })])).already === true, 'שליחה חוזרת אחרי תשובה — אין כפילות');

// ── 7ג. «לא בטוח» → הערה למשרד; «טופל» סוגר ושומר ──
const ns = await rpc('add_tax_info_asks', [e27.stepId, JSON.stringify([{ itemKey: 'foreign.income', subjectRole: 'client', prompt: { title: 'חו״ל?', why: '', input: { kind: 'yesno' } } }])]);
await rpc('publish_tax_info', [ns.infoStepId]);
ok(ns.infoStepId === w.infoStepId && (await one(`select client_content_version v from public.onboarding_steps where id = $1`, [ns.infoStepId])).v === 2, 'שאלה חדשה בבקשה שכבר פורסמה — גרסת התוכן עולה (עדכון ב«שלח בקשות»)');
const nsv = await rpc('portal_tax_info', ['tok-c1', ns.infoStepId]);
const nsa = nsv.asks.find(x => x.itemKey === 'foreign.income');
await rpc('portal_submit_tax_info', ['tok-c1', nsa.id, JSON.stringify({ kind: 'notSure', note: 'יש לי חשבון בפייפאל' })]);
const nr = await one('select office_note, note_resolved_at, state from public.tax_info_asks where id = $1', [nsa.id]);
ok(nr.office_note === 'יש לי חשבון בפייפאל' && nr.state === 'answered' && !nr.note_resolved_at, '«לא בטוח»: הערה למשרד, בלי עובדה');
await rpc('resolve_tax_info_note', [nsa.id]);
const nr2 = await one('select office_note, note_resolved_at from public.tax_info_asks where id = $1', [nsa.id]);
ok(!!nr2.note_resolved_at && nr2.office_note === 'יש לי חשבון בפייפאל', '«טופל» — נסגר, ההערה נשמרת');

// ── 8. שוויון בין הקוד לשרת ──
// ── 12. «שלח בקשות» ──
{
  const pub = (await one(`select id from public.onboarding_steps where step_type = 'info_collection' and status = 'waiting_client' limit 1`))?.id
    ?? (await one(`select id from public.onboarding_steps where step_type = 'info_collection' limit 1`)).id;
  await db.query(`update public.onboarding_steps set ball = 'client', published_at = coalesce(published_at, now()) where id = $1`, [pub]);
  const ann = await q(`select step_id from public._client_announceable_steps('c1') where step_type = 'info_collection'`);
  ok(ann.some(r => r.step_id === pub), '«שלח בקשות»: «השלמת מידע» אצל הלקוח נספרת');
  await db.query(`update public.onboarding_steps set ball = 'me' where id = $1`, [pub]);
  ok(!(await q(`select step_id from public._client_announceable_steps('c1') where step_type = 'info_collection'`)).some(r => r.step_id === pub), '«שלח בקשות»: כשהכדור במשרד — לא נספרת');
  ok((await one(`select public._client_step_portal_key('s9', 'info_collection') as k`)).k === 'taxinfo_s9', 'מפתח הדף = מפתח הפריט בדף האישי');
  const n = (await one(`select (length(pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure)) - length(replace(pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure), '''info_collection'')', ''))) / length('''info_collection'')') as n`)).n;
  ok(n === 1, 'החלה חוזרת: הסוג ברשימה פעם אחת');
}
const items = (await one(`select public._tax_year_items() as m`)).m;
// ‼ פריטי הצהרת ההון (wealth.*) שייכים ל-230 ופריטי הקליטה (intake.*) ל-236 — כאן משווים רק את פריטי שנת המס.
ts.items = Object.fromEntries(Object.entries(ts.items).filter(([k]) => !k.startsWith('wealth.') && !k.startsWith('intake.')));
ok(JSON.stringify(Object.keys(items).sort()) === JSON.stringify(Object.keys(ts.items).sort()), 'רשימת הפריטים בשרת = הקטלוג בקוד', JSON.stringify(Object.keys(ts.items).filter(k => !(k in items))));
ok(Object.entries(ts.items).every(([k, v]) => items[k] === v), 'סוג כל פריט זהה');
let per = 0;
for (const c of ts.periodCases) {
  const r = (await one(`select public._tax_answer_period($1, $2, $3, $4, $5) as r`, [c.purpose, c.cutoff, c.year, c.item, c.kind])).r;
  if (r.periodKind === c.out.periodKind && r.basis === c.out.basis && r.from === c.out.periodFrom && r.to === c.out.periodTo) per++;
  else console.log('    ≠', JSON.stringify(c), JSON.stringify(r));
}
ok(per === ts.periodCases.length, `תקופה ובסיס זהים (${per}/${ts.periodCases.length})`);
let fu2 = 0;
for (const c of ts.followCases) {
  const r = (await one(`select public._tax_doc_follow_up($1, $2, $3::date)::text as d`, [c.doc, c.year, c.today])).d;
  if (r === c.out) fu2++; else console.log('    ≠', JSON.stringify(c), r);
}
ok(fu2 === ts.followCases.length, `מועדי מעקב למסמכים זהים (${fu2}/${ts.followCases.length})`);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

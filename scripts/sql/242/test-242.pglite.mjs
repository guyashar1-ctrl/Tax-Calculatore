// בדיקת מיגרציה 242 (הסרת עבודת מס) בבידוד — PGlite, על סכמה מינימלית עם האינדקסים הייחודיים האמיתיים (229, 236).
//   PGLITE_DIR=<tmp> node scripts/sql/242/test-242.pglite.mjs
// מה נבדק: מחיקה רק כשכלום לא יצא; ביטול סוגר שאלות פתוחות ושומר תשובות, עובדות, מסמכים והערכות מאושרות;
// עבודה שהושלמה — לא; «changed» כשהמצב השתנה מאז שהמסך הציג; החזרה — כולל עבודה שהוחלפה בינתיים; בעלים אחר — לא.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const sql242 = readFileSync(WT + 'supabase/242-tax-work-removal.sql', 'utf8').replace(/\r\n/g, '\n');
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
  create table public.clients (id text primary key, user_id uuid not null);
  create table public.onboarding_steps (id text primary key, user_id uuid not null, client_id text not null references public.clients(id) on delete cascade,
    step_type text not null, status text not null, ball text, needs_attention boolean not null default false, published_at timestamptz,
    payload jsonb not null default '{}'::jsonb, updated_at timestamptz default now(), created_at timestamptz default now());
  create unique index onboarding_steps_tax_year_open_idx on public.onboarding_steps (client_id, step_type, (payload->>'taxYear'))
    where step_type in ('tax_estimate', 'annual_return') and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);
  create unique index onboarding_steps_wealth_open_idx on public.onboarding_steps (client_id, (payload->>'asOfDate'))
    where step_type = 'wealth_declaration' and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);
  create unique index onboarding_steps_info_collection_open_idx on public.onboarding_steps (client_id, (payload->>'parentStepId'))
    where step_type = 'info_collection' and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);
  create table public.onboarding_events (id text primary key default replace(gen_random_uuid()::text, '-', ''), user_id uuid not null,
    step_id text references public.onboarding_steps(id) on delete cascade, type text not null, actor text not null default 'system', note text,
    meta jsonb not null default '{}'::jsonb, at timestamptz not null default now());
  create table public.tax_info_asks (id uuid primary key default gen_random_uuid(), client_id text not null, tax_year int not null, item_key text not null,
    subject_role text not null default 'client', entity_ref text, step_id text not null references public.onboarding_steps(id) on delete cascade,
    parent_step_id text not null references public.onboarding_steps(id) on delete cascade, state text not null default 'draft');
  create unique index tax_info_asks_open_uidx on public.tax_info_asks (client_id, tax_year, item_key, subject_role, coalesce(entity_ref, ''))
    where state in ('draft', 'published', 'unavailable');
  create table public.tax_year_facts (id uuid primary key default gen_random_uuid(), client_id text, request_id text, ask_id uuid, status text not null default 'pending');
  create table public.tax_evidence (id uuid primary key default gen_random_uuid(), client_id text, ask_id uuid, document_id text);
  create table public.email_messages (id uuid primary key default gen_random_uuid(), step_id uuid);
  create table public.client_notice_items (notice_id uuid not null default gen_random_uuid(), step_id text not null references public.onboarding_steps(id) on delete cascade, version int not null default 1);
  create table public.client_step_notice_state (step_id text primary key references public.onboarding_steps(id) on delete cascade, announced_version int not null default 0);
  create table public.tax_estimates (id text primary key, request_id text not null references public.onboarding_steps(id) on delete cascade,
    status text not null default 'draft', published_at timestamptz);
  create function public._tax_year_client(p_client_id text) returns public.clients language plpgsql stable security definer set search_path to 'public' as $f$
  declare c public.clients%rowtype;
  begin
    select * into c from public.clients where id = p_client_id;
    if c.id is null or c.user_id <> auth.uid() or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
    return c;
  end $f$;
  insert into public.clients values ('c1', '${OFFICE}'), ('c2', '${OTHER}');
`);
await db.exec(sql242);
await db.exec(sql242); // ‼ החלה חוזרת — create or replace בלבד
ok(true, 'המיגרציה מוחלת, וגם פעם שנייה');

let seq = 0;
const work = async ({ type = 'annual_return', year = 2025, status = 'in_progress', client = 'c1', infoPublished = false, asks = [] } = {}) => {
  // ‼ כמו במסד האמיתי: מזהה בקשה = uuid בלי מקפים; email_messages.step_id הוא uuid (נמצא ב-staging 15.10)
  const id = `a${String(++seq).padStart(31, '0')}`, info = `b${String(seq).padStart(31, '0')}`;
  const owner = client === 'c1' ? OFFICE : OTHER;
  await q(`insert into public.onboarding_steps (id, user_id, client_id, step_type, status, ball, payload) values ($1, $2, $3, $4, $5, 'me', jsonb_build_object('taxYear', $6::int))`, [id, owner, client, type, status, year]);
  await q(`insert into public.onboarding_steps (id, user_id, client_id, step_type, status, ball, published_at, payload) values ($1, $2, $3, 'info_collection', $4, 'client', $5, jsonb_build_object('parentStepId', $6::text))`,
    [info, owner, client, infoPublished ? 'waiting_client' : 'pending', infoPublished ? new Date().toISOString() : null, id]);
  const askIds = [];
  for (const [i, st] of asks.entries()) askIds.push((await one(`insert into public.tax_info_asks (client_id, tax_year, item_key, step_id, parent_step_id, state) values ($1, $2, $3, $4, $5, $6) returning id`, [client, year, `item${seq}_${i}`, info, id, st])).id);
  return { id, info, askIds };
};
const status = async (id) => (await one(`select status from public.onboarding_steps where id = $1`, [id]))?.status ?? null;
const askStates = async (ids) => (await q(`select state from public.tax_info_asks where id = any($1::uuid[]) order by id`, [ids])).map(r => r.state);

await as(OFFICE);

// 1 · טיוטה שלא יצאה — מחיקה
{
  const w = await work({ asks: ['draft', 'draft'] });
  const c = await rpc('tax_work_removal_check', [w.id]);
  ok(c.ok && c.mode === 'delete' && c.facts.asksDraft === 2, 'טיוטה שלא פורסמה ⇒ «מחיקה»', JSON.stringify(c));
  const r = await rpc('remove_tax_work', [w.id, 'delete', 'נפתח בטעות']);
  ok(r.ok && r.mode === 'delete', 'מחיקה בוצעה', JSON.stringify(r));
  ok(await status(w.id) === null && await status(w.info) === null && (await askStates(w.askIds)).length === 0, 'העבודה, השלמת המידע וטיוטת השאלות נמחקו (cascade)');
}
// 1א · טיוטת הערכה בלבד — מחיקה, וההערכה בטיוטה נמחקת איתה
{
  const w = await work({ type: 'tax_estimate', year: 2026 });
  await q(`insert into public.tax_estimates (id, request_id, status) values ('e1', $1, 'draft')`, [w.id]);
  const c = await rpc('tax_work_removal_check', [w.id]);
  ok(c.mode === 'delete' && c.facts.estimatesDraft === 1, 'הערכה בטיוטה בלבד ⇒ «מחיקה»');
  await rpc('remove_tax_work', [w.id, 'delete', null]);
  ok((await one(`select count(*)::int n from public.tax_estimates where id = 'e1'`)).n === 0, 'טיוטת ההערכה נמחקה עם העבודה');
}
// 2 · פורסם ונענה — ביטול; מחיקה נדחית
{
  const w = await work({ infoPublished: true, asks: ['published', 'answered', 'draft', 'unavailable'] });
  await q(`insert into public.tax_year_facts (client_id, request_id, ask_id, status) values ('c1', $1, $2, 'accepted'), ('c1', $1, $2, 'pending')`, [w.id, w.askIds[1]]);
  await q(`insert into public.tax_evidence (client_id, ask_id, document_id) values ('c1', $1, 'd1')`, [w.askIds[1]]);
  const c = await rpc('tax_work_removal_check', [w.id]);
  ok(c.mode === 'cancel' && c.facts.asksOpen === 2 && c.facts.asksAnswered === 1 && c.facts.factsAccepted === 1 && c.facts.factsPending === 1 && c.facts.documents === 1,
    'פורסם ונענה ⇒ «ביטול», עם הספירות', JSON.stringify(c.facts));
  const d = await rpc('remove_tax_work', [w.id, 'delete', null]);
  ok(!d.ok && d.error === 'changed' && d.mode === 'cancel', 'מחיקה של עבודה שיצאה — נדחית («changed»), לא מוחקת', JSON.stringify(d));
  ok(await status(w.id) === 'in_progress', 'אחרי הדחייה — העבודה לא השתנתה');
  const r = await rpc('remove_tax_work', [w.id, 'cancel', 'הלקוח עבר משרד']);
  ok(r.ok && r.asksClosed === 3, 'ביטול: 3 שאלות שלא נענו נסגרו (פתוחה, טיוטה, «אין לי עדיין»)', JSON.stringify(r));
  ok(await status(w.id) === 'cancelled' && await status(w.info) === 'cancelled', 'העבודה והשלמת המידע — «בוטלה»');
  ok(JSON.stringify(await askStates([w.askIds[1]])) === '["answered"]', 'התשובה של הלקוח נשארה');
  ok((await one(`select count(*)::int n from public.tax_year_facts where request_id = $1`, [w.id])).n === 2 && (await one(`select count(*)::int n from public.tax_evidence where ask_id = $1`, [w.askIds[1]])).n === 1,
    'עובדות (שאושרו וממתינות) והמסמך — נשארו');
  const ev = await one(`select note, meta from public.onboarding_events where step_id = $1`, [w.id]);
  ok(ev?.note === 'הלקוח עבר משרד' && ev.meta.what === 'tax_work_cancelled', 'נרשם אירוע עם הסיבה');
  const p = (await one(`select payload from public.onboarding_steps where id = $1`, [w.id])).payload;
  ok(p.removal?.prevStatus === 'in_progress' && p.removal.asks.length === 3 && p.workLog.at(-1).what === 'cancelled', 'המצב הקודם נשמר להחזרה');
  // ‼ עבודה חדשה לאותה שנה — השאלות שנסגרו כבר לא חוסמות את אותו פריט
  const again = await throws(`insert into public.tax_info_asks (client_id, tax_year, item_key, step_id, parent_step_id, state) values ('c1', 2025, $1, $2, $3, 'draft')`, [`item${seq}_0`, w.info, w.id]);
  ok(again === null, 'שאלה שנסגרה לא חוסמת שאלה חדשה לאותו פריט');
  await q(`delete from public.tax_info_asks where item_key = $1 and state = 'draft'`, [`item${seq}_0`]);

  // 3 · החזרה
  const back = await rpc('restore_tax_work', [w.id]);
  ok(back.ok && back.asksBack === 3, 'החזרה: העבודה והשאלות חזרו', JSON.stringify(back));
  ok(await status(w.id) === 'in_progress' && await status(w.info) === 'waiting_client', 'המצבים הקודמים חזרו (גם של השלמת המידע)');
  ok(JSON.stringify((await askStates(w.askIds)).sort()) === JSON.stringify(['answered', 'draft', 'published', 'unavailable'].sort()), 'כל שאלה חזרה למצב שלה');
  ok(!(await one(`select payload from public.onboarding_steps where id = $1`, [w.id])).payload.removal, 'סימון הביטול הוסר');
}
// 4 · החזרה כשבינתיים נפתחה עבודה חדשה לאותה שנה — «הוחלפה», בלי לשבור את החדשה
{
  const w = await work({ year: 2024, infoPublished: true, asks: ['published'] });
  await rpc('remove_tax_work', [w.id, 'cancel', null]);
  const fresh = await work({ year: 2024 });
  const back = await rpc('restore_tax_work', [w.id]);
  ok(!back.ok && back.error === 'superseded', 'יש עבודה פתוחה חדשה לאותה שנה ⇒ «הוחלפה»', JSON.stringify(back));
  ok(await status(w.id) === 'cancelled' && await status(fresh.id) === 'in_progress', 'הישנה נשארה מבוטלת, החדשה לא נפגעה');
}
// 5 · ביטול כשאפשר היה למחוק (בחירה לשמור היסטוריה) — מותר
{
  const w = await work({ year: 2023, asks: ['draft'] });
  const r = await rpc('remove_tax_work', [w.id, 'cancel', null]);
  ok(r.ok && await status(w.id) === 'cancelled', 'אפשר לבטל במקום למחוק, גם כשכלום לא יצא');
}
// 6 · הושלמה / בוטלה — אין הסרה
{
  const w = await work({ year: 2022, status: 'completed' });
  const c = await rpc('tax_work_removal_check', [w.id]);
  ok(c.mode === 'none', 'הושלמה ⇒ אין הסרה');
  const r = await rpc('remove_tax_work', [w.id, 'cancel', null]);
  ok(!r.ok && r.error === 'completed' && await status(w.id) === 'completed', 'ניסיון לבטל עבודה שהושלמה — נדחה');
}
// 7 · הערכה מאושרת — לא נמחקת; ביטול שומר את הגרסה
{
  const w = await work({ type: 'tax_estimate', year: 2027 });
  await q(`insert into public.tax_estimates (id, request_id, status, published_at) values ('e2', $1, 'approved', now())`, [w.id]);
  const c = await rpc('tax_work_removal_check', [w.id]);
  ok(c.mode === 'cancel' && c.facts.estimatesApproved === 1 && c.facts.estimatesPublished === 1, 'הערכה מאושרת ומפורסמת ⇒ «ביטול»');
  await rpc('remove_tax_work', [w.id, 'cancel', null]);
  ok((await one(`select status from public.tax_estimates where id = 'e2'`)).status === 'approved', 'הגרסה המאושרת נשמרה');
}
// 8 · מייל שנשלח — ביטול
{
  const w = await work({ year: 2021 });
  await q(`insert into public.email_messages (step_id) values ($1)`, [w.id]);
  ok((await rpc('tax_work_removal_check', [w.id])).mode === 'cancel', 'נשלח מייל ⇒ «ביטול», לא מחיקה');
}
// 9 · לא עבודת מס / לא שלי
{
  await q(`insert into public.onboarding_steps (id, user_id, client_id, step_type, status) values ('x1', '${OFFICE}', 'c1', 'paperless_invite', 'pending')`);
  ok((await rpc('remove_tax_work', ['x1', 'delete', null])).error === 'not_found' && await status('x1') === 'pending', 'בקשה שאינה עבודת מס — לא נוגעים');
  const theirs = await (async () => { await as(OTHER); const w = await work({ client: 'c2', year: 2020 }); await as(OFFICE); return w; })();
  const e = await throws(`select public.remove_tax_work($1, 'delete', null)`, [theirs.id]);
  ok(/forbidden/.test(e ?? ''), 'עבודה של משרד אחר — forbidden', e);
  ok(await status(theirs.id) === 'in_progress', 'ועבודה של משרד אחר לא השתנתה');
}
// 9ב · מה שמחיקה הייתה מוחקת בשרשור: הודעה ללקוח, הערת משרד, ביטול והחזרה קודמים
{
  const a = await work({ year: 2019 });
  await q(`insert into public.client_notice_items (step_id) values ($1)`, [a.id]);
  ok((await rpc('tax_work_removal_check', [a.id])).mode === 'cancel', 'נמסרה ללקוח הודעה על העבודה ⇒ «ביטול»');
  const b = await work({ year: 2018 });
  await q(`insert into public.client_step_notice_state (step_id, announced_version) values ($1, 2)`, [b.id]);
  ok((await rpc('tax_work_removal_check', [b.id])).facts.notices === 1, 'גרסה שהוכרזה ללקוח נספרת כהודעה');
  const c = await work({ year: 2017 });
  await q(`insert into public.onboarding_events (user_id, step_id, type, note) values ('${OFFICE}', $1, 'note', 'לבדוק עם הלקוח')`, [c.id]);
  const cc = await rpc('tax_work_removal_check', [c.id]);
  ok(cc.mode === 'cancel' && cc.facts.notes === 1, 'הערת משרד על העבודה ⇒ «ביטול», לא מחיקה');
  const d = await work({ year: 2016 });
  ok((await rpc('tax_work_removal_check', [d.id])).mode === 'delete', 'טיוטה נקייה — עדיין «מחיקה»');
  await rpc('remove_tax_work', [d.id, 'cancel', 'בדיקה']);
  await rpc('restore_tax_work', [d.id]);
  const dd = await rpc('remove_tax_work', [d.id, 'delete', null]);
  ok(!dd.ok && dd.error === 'changed' && await status(d.id) === 'in_progress', 'אחרי ביטול והחזרה — אין מחיקה (ההיסטוריה נשמרת)');
}
// 9ג · הצהרת הון: החזרה כשבינתיים נפתחה הצהרה לאותו יום — לא נוצרת כפילות; מה שהתקבל נשמר לאורך ביטול והחזרה
{
  const mk = async (id) => q(`insert into public.onboarding_steps (id, user_id, client_id, step_type, status, ball, payload) values ($1, '${OFFICE}', 'c1', 'wealth_declaration', 'in_progress', 'me', '{"asOfDate":"2025-12-31"}'::jsonb)`, [id]);
  await mk('wd1');
  await q(`insert into public.tax_year_facts (client_id, request_id, status) values ('c1', 'wd1', 'accepted')`);
  await q(`insert into public.tax_evidence (client_id, ask_id, document_id) values ('c1', null, 'doc-wd1')`);
  const r1 = await rpc('remove_tax_work', ['wd1', 'cancel', 'בדיקה']);
  ok(r1.ok && r1.mode === 'cancel', 'הצהרה עם עובדה שאושרה — מבוטלת');
  await mk('wd2');
  const r2 = await rpc('restore_tax_work', ['wd1']);
  ok(!r2.ok && r2.error === 'superseded' && await status('wd1') === 'cancelled', 'הצהרה חדשה לאותו יום ⇒ «superseded», הישנה נשארת מבוטלת (אין שתי הצהרות פתוחות)');
  const open = (await one(`select count(*)::int n from public.onboarding_steps where step_type = 'wealth_declaration' and client_id = 'c1' and status <> 'cancelled'`)).n;
  ok(open === 1, 'הצהרה פתוחה אחת בלבד', String(open));
  ok((await one(`select count(*)::int n from public.tax_year_facts where request_id = 'wd1' and status = 'accepted'`)).n === 1, 'העובדה שאושרה נשמרה');
  ok((await one(`select count(*)::int n from public.tax_evidence where document_id = 'doc-wd1'`)).n === 1, 'המסמך נשמר');
}
// 10 · הרשאות: anon לא מריץ
{
  const g = await one(`select has_function_privilege('anon', 'public.remove_tax_work(text, text, text)', 'execute') a, has_function_privilege('authenticated', 'public.remove_tax_work(text, text, text)', 'execute') u`);
  ok(g.a === false && g.u === true, 'anon — אין הרשאה; authenticated — יש');
}

// 11 · התאוששות: עבודות שבוטלו לפני החזרת המסד לאחור — בלי לאבד תשובות ומסמכים ובלי להשאיר אותן בלי טיפול
{
  await as(OFFICE);
  const rec = readFileSync(WT + 'scripts/sql/242/restore-cancelled-242.sql', 'utf8').replace(/\r\n/g, '\n');
  const rollback = readFileSync(WT + 'scripts/sql/242/rollback-242.sql', 'utf8').replace(/\r\n/g, '\n');
  const r1 = await work({ year: 2010, infoPublished: true, asks: ['published', 'answered', 'published'] });
  await q(`insert into public.tax_year_facts (client_id, request_id, ask_id, status) values ('c1', $1, $2, 'accepted')`, [r1.id, r1.askIds[1]]);
  await q(`insert into public.tax_evidence (client_id, ask_id, document_id) values ('c1', $1, 'doc-r1')`, [r1.askIds[1]]);
  ok((await rpc('remove_tax_work', [r1.id, 'cancel', 'לפני התאוששות'])).ok, 'התאוששות: עבודה עם תשובה ומסמך בוטלה');
  const r2 = await work({ year: 2009 });
  await rpc('remove_tax_work', [r2.id, 'cancel', null]);
  const r2b = await work({ year: 2009 }); // עבודה חדשה לאותה שנה — הישנה לא יכולה לחזור
  const guard = await db.exec(rollback).then(() => null, e => e.message);
  ok(/rollback-242/.test(guard ?? '') && (await one(`select count(*)::int n from pg_proc where proname = 'restore_tax_work'`)).n === 1, 'המגן: rollback נעצר כשיש עבודות שבוטלו ולא טופלו', guard);
  const outRes = await db.exec(rec);
  const out = outRes[outRes.length - 1].rows.map(r => r.result);
  const res = (id) => out.find(x => x.id === id)?.result;
  ok(res(r1.id) === 'restored' && await status(r1.id) === 'in_progress', 'restore-cancelled: העבודה חזרה למצבה הקודם', JSON.stringify(out.find(x => x.id === r1.id)));
  const st1 = await askStates(r1.askIds);
  ok(st1.filter(x => x === 'published').length === 2 && st1.filter(x => x === 'answered').length === 1, 'restore-cancelled: השאלות הפתוחות חזרו, התשובה נשארה', st1.join());
  ok((await one(`select count(*)::int n from public.tax_year_facts where ask_id = $1 and status = 'accepted'`, [r1.askIds[1]])).n === 1
    && (await one(`select count(*)::int n from public.tax_evidence where document_id = 'doc-r1'`)).n === 1, 'restore-cancelled: הפרט שאושר והמסמך נשמרו');
  const s2 = await one(`select status, payload ? 'removal' as has_removal, payload ? 'removalArchived' as archived from public.onboarding_steps where id = $1`, [r2.id]);
  ok(res(r2.id) === 'superseded' && s2.status === 'cancelled' && !s2.has_removal && s2.archived && await status(r2b.id) === 'in_progress', 'עבודה שהוחלפה: נשארת מבוטלת, המצב הקודם בארכיון, החדשה לא נפגעה', JSON.stringify(s2));
  ok((await one(`select count(*)::int n from public.onboarding_steps where status = 'cancelled' and payload ? 'removal'`)).n === 0, 'אין עבודה שבוטלה שנשארה בלי טיפול');
  await db.exec(rollback);
  ok((await one(`select count(*)::int n from pg_proc where proname in ('remove_tax_work','restore_tax_work','tax_work_removal_check','_tax_work_removal_facts','_tax_work_removal_mode')`)).n === 0, 'rollback-242: חמש הפונקציות הוסרו אחרי הטיפול');
  ok((await one(`select count(*)::int n from public.tax_evidence where document_id = 'doc-r1'`)).n === 1, 'אחרי rollback: המסמך עדיין במסד');
}

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

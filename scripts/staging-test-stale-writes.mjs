#!/usr/bin/env node
/**
 * staging-test-stale-writes.mjs — שער הרגרסיה של אשכול B: "עותק ישן שמהדהד
 * את השורה כולה" ו"שדות שאי אפשר לנקות" (מיגרציה 166).
 *
 * ‼ מה נבדק, ולמה כל סעיף הוא באג שכבר קרה:
 *  K1   משימה עם בקשת חתימה נשמרת (הייתה נופלת — אין עמודה).
 *  K2   ניקוי תאריך יעד/תיאור נשמר כ-NULL; פתיחה מחדש מנקה completed_at.
 *  A8/T2 update_client_fields: updated_at ישן ⇒ 'stale' ולא נכתב כלום;
 *       patch חלקי לא נוגע בעמודה שלא נמסרה; עובדת מס ב-p_patch נדחית;
 *       עובדת מס ב-p_facts נכתבת דרך record_manual_fact_change (היסטוריה +
 *       provenance) באותה טרנזקציה; עמודת שרת נדחית.
 *  K3   reorder_tasks כותבת sort_order בלבד, ומתעלמת ממזהה שאינו של הקורא.
 *  K4   bulk_update_tasks הכול-או-כלום: מזהה זר אחד ⇒ אף שורה לא משתנה.
 *  C3   expire_stale_quotations לעולם לא נוגעת בהצעה מאושרת, גם כשמועדה
 *       עבר; אידמפוטנטית (אירוע 'expired' אחד).
 *
 * הרצה:  node scripts/staging-test-stale-writes.mjs
 * לא דורש seed-staging; הקבועים מסומנים STALE / stale- ומנוקים בסוף.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const signin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: authErr } = await signin.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
/** לקוח שלעולם אינו מחובר — anon אמיתי. */
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const newId = () => 'stale-' + Math.random().toString(36).slice(2, 10);

console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  await writeStaging(`
    delete from public.tax_fact_changes where client_id in (select id from public.clients where last_name = 'STALE');
    delete from public.tasks where title like 'STALE %' or id like 'stale-%';
    delete from public.clients where last_name = 'STALE';
    delete from public.quotations where id like 'stale-%';
    delete from auth.users where email = 'stale-other@test.local';`);
}
await cleanup();

const taskRow = (id) => one(`select * from public.tasks where id = ${q(id)};`);
const clientRow = (id) => one(`select * from public.clients where id = ${q(id)};`);

try {
  // ─── 0 · קבועים ───────────────────────────────────────────────────────────
  const other = (await one(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'stale-other@test.local', '', now(), now(), now())
    returning id;`)).id;
  const clientId = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, phone, notes, spouse_name, ni_balance, lifecycle_stage)
    values (${q(newId())}, '${U}', 'ישן', 'STALE', 'delivered@resend.dev', '050-1111111', 'הערה מקורית', 'בת זוג', 100, 'active')
    returning id;`)).id;
  const foreignClientId = (await one(`
    insert into public.clients (id, user_id, first_name, last_name)
    values (${q(newId())}, '${other}', 'זר', 'STALE') returning id;`)).id;

  // ─── K1 · משימה עם בקשת חתימה ────────────────────────────────────────────
  console.log('— K1 · בקשת חתימה על משימה —');
  {
    const id = newId();
    const sig = { signers: [{ id: 's1', source: 'manual', name: 'חותם', email: 'delivered@resend.dev', order: 1 }], fields: [] };
    const { error } = await user.from('tasks').insert({
      id, user_id: U, client_id: clientId, category: 'ongoing', title: 'STALE חתימה',
      ball_with: 'me', status: 'open', priority: 'normal', signature_request: sig,
    });
    ok('K1 הכנסת משימה עם signature_request מצליחה', !error, error?.message);
    const { data, error: e2 } = await user.rpc('bulk_update_tasks', {
      p_ids: [id], p_patch: { signature_request: { ...sig, requireOrder: true } } });
    ok('K1 עדכון signature_request דרך bulk_update_tasks', !e2 && data?.[0]?.signature_request?.requireOrder === true, e2?.message);
  }

  // ─── K2 · ניקוי שדות ופתיחה מחדש ─────────────────────────────────────────
  console.log('— K2 · ניקוי שדות —');
  {
    const id = newId();
    await writeStaging(`
      insert into public.tasks (id, user_id, client_id, category, title, description, ball_with, status, priority, due_date, completed_at)
      values (${q(id)}, '${U}', ${q(clientId)}, 'ongoing', 'STALE ניקוי', 'תיאור', 'client', 'done', 'normal', '2026-01-01', now());`);
    const { error } = await user.rpc('bulk_update_tasks', {
      p_ids: [id], p_patch: { due_date: null, description: null, status: 'open', progress: 'in_progress', completed_at: null } });
    const r = await taskRow(id);
    ok('K2 תאריך יעד שנוקה נשמר כ-NULL', !error && r.due_date === null, error?.message ?? String(r.due_date));
    ok('K2 תיאור שנמחק נשמר כ-NULL', r.description === null);
    ok('K2 פתיחה מחדש מנקה completed_at', r.status === 'open' && r.completed_at === null, `status=${r.status} completed_at=${r.completed_at}`);
    ok('K2 «אצל מי הכדור» לא נגע (לא היה ב-patch)', r.ball_with === 'client', r.ball_with);
  }

  // ─── A8/T2 · update_client_fields ─────────────────────────────────────────
  console.log('— A8/T2 · עדכון חלקי של כרטיס —');
  {
    const before = await clientRow(clientId);
    // 1. patch חלקי — רק phone; notes/spouse_name/ni_balance לא נמסרו
    let { data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { phone: '050-2222222' }, p_expected_updated_at: before.updated_at });
    let r = await clientRow(clientId);
    ok('A8 patch חלקי נכתב ומחזיר ok + client', !error && data?.ok === true && data?.client?.phone === '050-2222222', error?.message ?? JSON.stringify(data));
    ok('A8 עמודות שלא נמסרו לא נגעו', r.notes === 'הערה מקורית' && r.spouse_name === 'בת זוג' && Number(r.ni_balance) === 100,
      `notes=${r.notes} spouse=${r.spouse_name} ni=${r.ni_balance}`);
    ok('A8 updated_at התקדם', r.updated_at !== before.updated_at);

    // 2. stale — שולחים את updated_at הישן
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { phone: '050-3333333' }, p_expected_updated_at: before.updated_at }));
    const afterStale = await clientRow(clientId);
    ok('T2 updated_at ישן ⇒ {ok:false,error:stale} עם השורה העדכנית',
      !error && data?.ok === false && data?.error === 'stale' && data?.client?.phone === '050-2222222', error?.message ?? JSON.stringify(data));
    ok('T2 stale לא כתב כלום', afterStale.phone === '050-2222222' && afterStale.updated_at === r.updated_at);

    // 3. ניקוי שדה: spouse_name=null נכתב באמת (H4/A5)
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { spouse_name: null, spouse_id_number: null }, p_expected_updated_at: afterStale.updated_at }));
    r = await clientRow(clientId);
    ok('A5 שדה בן/בת זוג שנוקה נשמר כ-NULL', !error && data?.ok === true && r.spouse_name === null, error?.message ?? `spouse_name=${r.spouse_name}`);

    // 4. עובדת מס ב-p_patch נדחית; השורה לא נגעת
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { phone: '050-4444444', ni_balance: 5 }, p_expected_updated_at: r.updated_at }));
    const afterGov = await clientRow(clientId);
    ok('A8 עובדת מס ב-p_patch ⇒ governed_field', !error && data?.ok === false && data?.error === 'governed_field' && data?.field === 'ni_balance', JSON.stringify(data));
    ok('A8 דחייה = אף עמודה לא נכתבה (גם phone לא)', afterGov.phone === '050-2222222' && Number(afterGov.ni_balance) === 100);

    // 5. עמודת שרת נדחית
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { lifecycle_stage: 'archived' } }));
    ok('A8 עמודת שרת (lifecycle_stage) ⇒ blocked_field', !error && data?.ok === false && data?.error === 'blocked_field', JSON.stringify(data));
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { field_meta: {} } }));
    ok('A8 field_meta ⇒ blocked_field', !error && data?.ok === false && data?.error === 'blocked_field', JSON.stringify(data));
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { no_such_column: 1 } }));
    ok('A8 עמודה לא קיימת ⇒ unknown_field', !error && data?.ok === false && data?.error === 'unknown_field', JSON.stringify(data));

    // 6. עובדת מס דרך p_facts — נכתבת עם היסטוריה ו-provenance, יחד עם patch רגיל
    const nChangesBefore = Number((await one(`select count(*) n from public.tax_fact_changes where client_id = ${q(clientId)};`)).n);
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { phone: '050-5555555' }, p_expected_updated_at: afterGov.updated_at,
      p_facts: { niBalance: 250, hasCrypto: true }, p_facts_label: 'עדכון בתיק · יתרה בב"ל' }));
    r = await clientRow(clientId);
    const chg = await one(`select count(*) n, max(status) st, max(source) src from public.tax_fact_changes where client_id = ${q(clientId)};`);
    ok('A8 p_facts נכתב לתיק', !error && data?.ok === true && Number(r.ni_balance) === 250 && r.has_crypto === true, error?.message ?? JSON.stringify(data));
    ok('A8 p_facts יצר שורת היסטוריה accepted/manual', Number(chg.n) === nChangesBefore + 1 && chg.st === 'accepted' && chg.src === 'manual', JSON.stringify(chg));
    ok('A8 p_facts כתב provenance ב-field_meta', r.field_meta?.niBalance?.source === 'manual', JSON.stringify(r.field_meta?.niBalance));
    ok('A8 ה-patch הרגיל נכתב באותה קריאה', r.phone === '050-5555555');

    // 7. p_facts שנכשל מגלגל אחורה גם את ה-patch (גבול הצלחה אחד)
    ({ data, error } = await user.rpc('update_client_fields', {
      p_client_id: clientId, p_patch: { phone: '050-6666666' }, p_facts: { noSuchFact: 1 } }));
    const afterFail = await clientRow(clientId);
    ok('A8 עובדה לא מוכרת ⇒ שגיאה, וה-patch הרגיל לא נכתב', !!error && afterFail.phone === '050-5555555', `error=${error?.message} phone=${afterFail.phone}`);

    // 8. בעלות ו-anon
    ({ data, error } = await user.rpc('update_client_fields', { p_client_id: foreignClientId, p_patch: { phone: '1' } }));
    ok('A8 כרטיס של משתמש אחר ⇒ forbidden', !error && data?.ok === false && data?.error === 'forbidden', JSON.stringify(data));
    const an = await anon.rpc('update_client_fields', { p_client_id: clientId, p_patch: { phone: '1' } });
    ok('A8 anon אינו יכול לקרוא ל-update_client_fields', !!an.error, JSON.stringify(an.data));
  }

  // ─── K3 · reorder_tasks ───────────────────────────────────────────────────
  console.log('— K3 · סדר משימות —');
  {
    const ids = ['a', 'b', 'c'].map(() => newId());
    for (const [i, id] of ids.entries()) {
      await writeStaging(`
        insert into public.tasks (id, user_id, client_id, category, title, ball_with, status, priority, sort_order)
        values (${q(id)}, '${U}', ${q(clientId)}, 'ongoing', 'STALE סדר ${i}', 'authority', 'open', 'normal', ${(i + 1) * 10});`);
    }
    const foreign = newId();
    await writeStaging(`
      insert into public.tasks (id, user_id, client_id, category, title, ball_with, status, priority, sort_order)
      values (${q(foreign)}, '${other}', ${q(foreignClientId)}, 'ongoing', 'STALE זר', 'me', 'open', 'normal', 999);`);
    const { data, error } = await user.rpc('reorder_tasks', { p_ids: [ids[2], foreign, 'no-such-id', ids[0], ids[1]] });
    const rows = await writeStaging(`select id, sort_order, ball_with, title from public.tasks where id in (${[...ids, foreign].map(q).join(',')}) order by sort_order;`);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    ok('K3 reorder_tasks מחזירה רק את השורות שלי', !error && data?.length === 3 && !data.some(t => t.id === foreign), error?.message ?? `n=${data?.length}`);
    ok('K3 sort_order לפי המיקום ברשימה (מדלג על זרים)',
      byId[ids[2]].sort_order === 10 && byId[ids[0]].sort_order === 40 && byId[ids[1]].sort_order === 50,
      rows.map(r => `${r.title}=${r.sort_order}`).join(' '));
    ok('K3 מזהה זר לא נגע', byId[foreign].sort_order === 999);
    ok('K3 שום עמודה אחרת לא השתנתה', ids.every(id => byId[id].ball_with === 'authority'));
  }

  // ─── K4 · bulk_update_tasks אטומי ─────────────────────────────────────────
  console.log('— K4 · עדכון מרוכז —');
  {
    const mine = [newId(), newId()];
    for (const id of mine) {
      await writeStaging(`
        insert into public.tasks (id, user_id, client_id, category, title, ball_with, status, priority)
        values (${q(id)}, '${U}', ${q(clientId)}, 'ongoing', 'STALE מרוכז', 'me', 'open', 'normal');`);
    }
    const foreign = newId();
    await writeStaging(`
      insert into public.tasks (id, user_id, client_id, category, title, ball_with, status, priority)
      values (${q(foreign)}, '${other}', ${q(foreignClientId)}, 'ongoing', 'STALE זר 2', 'me', 'open', 'normal');`);
    let { data, error } = await user.rpc('bulk_update_tasks', { p_ids: [...mine, foreign], p_patch: { ball_with: 'stuck' } });
    let rows = await writeStaging(`select id, ball_with from public.tasks where id in (${[...mine, foreign].map(q).join(',')});`);
    ok('K4 מזהה זר אחד ⇒ שגיאה', !!error, JSON.stringify(data));
    ok('K4 ואף שורה לא השתנתה', rows.every(r => r.ball_with === 'me'), JSON.stringify(rows));
    ({ data, error } = await user.rpc('bulk_update_tasks', { p_ids: mine, p_patch: { ball_with: 'stuck', priority: 'urgent' } }));
    rows = await writeStaging(`select id, ball_with, priority from public.tasks where id in (${mine.map(q).join(',')});`);
    ok('K4 עדכון תקין כותב את כולם ומחזיר את השורות', !error && data?.length === 2 && rows.every(r => r.ball_with === 'stuck' && r.priority === 'urgent'), error?.message);
    ({ data, error } = await user.rpc('bulk_update_tasks', { p_ids: mine, p_patch: { user_id: other } }));
    ok('K4 עמודה מחוץ לרשימה (user_id) נדחית', !!error, JSON.stringify(data));
    ({ data, error } = await user.rpc('bulk_update_tasks', { p_ids: mine, p_patch: { onboarding_step_id: 'x' } }));
    ok('K4 onboarding_step_id (שרת) נדחה', !!error, JSON.stringify(data));
  }

  // ─── C3 · expire_stale_quotations ─────────────────────────────────────────
  console.log('— C3 · תוקף הצעות —');
  {
    const sentId = newId(), approvedId = newId(), draftId = newId(), futureId = newId();
    const mk = (id, status, expiresSql, extra = '') => writeStaging(`
      insert into public.quotations (id, user_id, quotation_number, status, public_token, items, representation, vat_rate, expires_at, events ${extra ? ',' + extra.split('=')[0] : ''})
      values (${q(id)}, '${U}', ${q('STALE-' + id.slice(-4))}, ${q(status)}, ${q(id + '-tok')}, '[]'::jsonb, '{}'::jsonb, 18, ${expiresSql},
              '[{"type":"sent","at":"2026-01-01T00:00:00.000Z"}]'::jsonb ${extra ? ',' + extra.split('=')[1] : ''});`);
    await mk(sentId, 'sent', `now() - interval '1 day'`);
    await mk(approvedId, 'approved', `now() - interval '1 day'`, `approved_at=now()`);
    await mk(draftId, 'draft', `now() - interval '1 day'`);
    await mk(futureId, 'viewed', `now() + interval '1 day'`);

    let { data, error } = await user.rpc('expire_stale_quotations');
    let rows = await writeStaging(`select id, status, jsonb_array_length(events) n from public.quotations where id in (${[sentId, approvedId, draftId, futureId].map(q).join(',')});`);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    ok('C3 הצעה שנשלחה ועבר מועדה ⇒ expired + אירוע אחד', !error && data === 1 && byId[sentId].status === 'expired' && byId[sentId].n === 2, error?.message ?? JSON.stringify(rows));
    ok('C3 הצעה מאושרת עם מועד שעבר לא נגעת', byId[approvedId].status === 'approved' && byId[approvedId].n === 1);
    ok('C3 טיוטה לא נגעת', byId[draftId].status === 'draft');
    ok('C3 הצעה בתוקף לא נגעת', byId[futureId].status === 'viewed');

    ({ data, error } = await user.rpc('expire_stale_quotations'));
    rows = await writeStaging(`select id, status, jsonb_array_length(events) n from public.quotations where id = ${q(sentId)};`);
    ok('C3 ריצה שנייה אידמפוטנטית (0, בלי אירוע כפול)', !error && data === 0 && rows[0].n === 2, `data=${data} n=${rows[0]?.n}`);

    // בעלות: הצעה של משתמש אחר שעבר מועדה אינה נגעת כשמשתמש מחובר קורא
    const foreignQ = newId();
    await writeStaging(`
      insert into public.quotations (id, user_id, quotation_number, status, public_token, items, representation, vat_rate, expires_at, events)
      values (${q(foreignQ)}, '${other}', ${q('STALE-F')}, 'sent', ${q(foreignQ + '-tok')}, '[]'::jsonb, '{}'::jsonb, 18, now() - interval '1 day', '[]'::jsonb);`);
    ({ data, error } = await user.rpc('expire_stale_quotations'));
    const f = await one(`select status from public.quotations where id = ${q(foreignQ)};`);
    ok('C3 משתמש מחובר אינו מסמן הצעות של משרד אחר', !error && data === 0 && f.status === 'sent', `data=${data} status=${f.status}`);
    const an = await anon.rpc('expire_stale_quotations');
    ok('C3 anon אינו יכול לקרוא', !!an.error);
  }
} finally {
  await cleanup();
}

console.log(`\nעברו: ${pass}  נכשלו: ${fail}`);
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * staging-test-domain-invariants.mjs — הגבול בין מחזור חיי הבקשה למחזור חיי
 * הייצוג (מיגרציה 155, docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md).
 *
 * הבדיקות מנוסחות ככללים עסקיים ולא כפרטי מימוש:
 *   · «נדרש לסגירת הקליטה» קיים רק בתוך קליטה אמיתית.
 *   · בקשה אינה משנה את מצב הייצוג. לעולם.
 *   · לקוח מיוצג נשאר מיוצג.
 *   · לסגירת הקליטה יש כלל אחד — לכפתור ולמסלול האוטומטי.
 *   · הכרטיס והבקשה אינם יכולים להיפרד.
 *
 * ‼ דורש זריעה טרייה:
 *     node scripts/seed-staging.mjs && node scripts/staging-test-domain-invariants.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const env = loadEnv('.env.staging');
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const cidOf = async (k) => (await one(`select client_id from public.quotations where id = 'fx-q-${k}'`)).client_id;
const intakeOf = async (cid) => (await one(`select public.client_intake_state('${cid}') as r`)).r;
const stepOf = async (id) => one(`select status, required_for_close, ball from public.onboarding_steps where id = '${id}'`);

const F_OPEN = await cidOf('onb');    // קליטה פתוchה (התקשרות 'onboarding')
const F_QUOTED = await cidOf('quote'); // הצעה נשלחה, טרם אושרה
const F_CLOSE = await cidOf('close');  // קליטה שנייה — לבדיקות הסגירה

// ── לקוח מיוצג בלי שום התקשרות — בדיוק התרחיש שדווח ─────────────────────────
// ‼ נבנה כאן ולא בזריעה: הוא ייחודי לבדיקה הזאת, והזריעה מזהה לקוחות דמה דרך
//   ההצעה שלהם (fx-q-…). מנקים קודם כדי שהרצה חוזרת תתחיל מאותה נקודה.
const REP_C = 'fxdomrepclient';
const REP_R = 'fxdomrepreq';
await writeStaging(`
  delete from public.onboarding_steps      where client_id = '${REP_C}';
  delete from public.representation_requests where id = '${REP_R}';
  delete from public.clients                where id = '${REP_C}';
  insert into public.clients (id, user_id, first_name, last_name, email,
                              representation_status, representation_request_id,
                              authority_representations, lifecycle_stage)
  values ('${REP_C}', '${USER_ID}', 'מיוצג', 'בלי התקשרות', 'delivered+domrep@resend.dev',
          'awaiting_authorities', '${REP_R}',
          '{"incomeTax":{"level":"primary","status":"in_process"},"nationalInsurance":{"status":"in_process"}}'::jsonb,
          'onboarding');
  insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email,
                                              authorities, requested_docs, status, onboarding_status)
  values ('${REP_R}', '${USER_ID}', '${REP_C}', 'מיוצג בלי התקשרות', 'delivered+domrep@resend.dev',
          '{incomeTax}', '[]'::jsonb, 'awaiting_authorities', 'submitted');`);

console.log('— הקשר הקליטה —');
{
  ok('לקוח עם התקשרות בקליטה ⇒ open', (await intakeOf(F_OPEN)).state === 'open');
  ok('לקוח שקיבל הצעה וטרם אישר ⇒ pending', (await intakeOf(F_QUOTED)).state === 'pending',
    JSON.stringify(await intakeOf(F_QUOTED)));
  ok('לקוח מיוצג בלי התקשרות ⇒ none', (await intakeOf(REP_C)).state === 'none',
    JSON.stringify(await intakeOf(REP_C)));
  const st = await intakeOf(F_OPEN);
  const eng = await one(`select id from public.engagements where client_id = '${F_OPEN}' and status = 'onboarding'`);
  ok('open מחזיר את מזהה ההתקשרות הנכון', st.engagementId === eng.id);
}

// ── תרחיש 3+5: לקוח מיוצג בלי קליטה יוצר בקשה רגילה ────────────────────────
console.log('\n— בקשה ללקוח מיוצג בלי קליטה —');
let repReqStepId;
{
  const before = await one(`select representation_status, lifecycle_stage from public.clients where id = '${REP_C}'`);
  const { data } = await user.rpc('create_onboarding_request', {
    p_client_id: REP_C, p_step_type: 'custom_request',
    p_payload: { title: 'בקשה רגילה ללקוח מיוצג', requirements: [{ kind: 'confirm', key: 'a', label: 'לאשר' }] },
    p_required_for_close: true, p_published: true,
  });
  ok('הבקשה נוצרת — היא בקשה ככל בקשה', data?.ok === true, JSON.stringify(data));
  ok('השרת מדווח intakeState=none', data?.intakeState === 'none', JSON.stringify(data?.intakeState));
  // ‼ הלב של הבאג שדווח: המסך ביקש true, ואין קליטה לחסום.
  ok('הדגל הוסב ל-false אף שהמסך ביקש true', data?.requiredForClose === false, JSON.stringify(data));
  repReqStepId = data?.stepId;
  const row = await stepOf(repReqStepId);
  ok('וגם נשמר false במסד', row.required_for_close === false, String(row.required_for_close));

  const after = await one(`select representation_status, lifecycle_stage from public.clients where id = '${REP_C}'`);
  ok('מצב הייצוג של הלקוח לא זז', after.representation_status === before.representation_status,
    `${before.representation_status} → ${after.representation_status}`);
  ok('שלב החיים של הלקוח לא זז', after.lifecycle_stage === before.lifecycle_stage,
    `${before.lifecycle_stage} → ${after.lifecycle_stage}`);
}

// ── סימון ידני כ«נדרש» מחוץ לקליטה ─────────────────────────────────────────
{
  const { data } = await user.rpc('set_onboarding_step_required',
    { p_step_id: repReqStepId, p_required: true });
  ok('סימון כ«נדרש» נדחה כשאין קליטה', data?.ok === false && data?.error === 'no_open_intake',
    JSON.stringify(data));
  const { data: d2 } = await user.rpc('set_onboarding_step_required',
    { p_step_id: repReqStepId, p_required: false });
  ok('סימון כ«רשות» מותר תמיד — זו הדרך לנקות היסטוריה', d2?.ok === true, JSON.stringify(d2));
}

// ── תרחיש 1+2: קליטה פתוחה, וליד בהצעה ─────────────────────────────────────
console.log('\n— בקשה בתוך קליטה —');
{
  const { data } = await user.rpc('create_onboarding_request', {
    p_client_id: F_OPEN, p_step_type: 'custom_request',
    p_payload: { title: 'בקשה חוסמת', requirements: [{ kind: 'confirm', key: 'a', label: 'לאשר' }] },
    p_required_for_close: true, p_published: true,
  });
  ok('בקליטה פתוחה הדגל נשמר כמו שביקשו', data?.ok === true && data?.requiredForClose === true,
    JSON.stringify(data));
  ok('ומדווח intakeState=open', data?.intakeState === 'open');
  const eng = await one(`select id from public.engagements where client_id = '${F_OPEN}' and status = 'onboarding'`);
  const rd = (await one(`select public.onboarding_close_readiness('${eng.id}') as r`)).r;
  ok('והבקשה מופיעה ברשימת החוסמים', rd.blocking.some(b => b.id === data.stepId));
}
{
  const { data } = await user.rpc('create_onboarding_request', {
    p_client_id: F_QUOTED, p_step_type: 'client_documents',
    p_payload: { checklist: [{ key: 'd1', label: 'ת.ז.', done: false }] },
    p_required_for_close: true, p_published: true,
  });
  ok('ללקוח בהצעה הדגל נשמר — הקליטה עוד תיוולד', data?.requiredForClose === true, JSON.stringify(data));
  ok('והבקשה מוחזקת עד אישור ההצעה', data?.heldUntilApproval === true, JSON.stringify(data));
}

// ── תרחיש 6: ייצוג לאדם נוסף הוא בקשה רגילה ────────────────────────────────
console.log('\n— ייצוג לבן/בת זוג = בקשה רגילה —');
{
  await writeStaging(`update public.representation_requests set status = 'active' where id = '${REP_R}';`);
  const beforeC = await one(`select representation_status, lifecycle_stage,
                                    authority_representations::text as reps
                               from public.clients where id = '${REP_C}'`);
  ok('הלקוח הראשי מיוצג', beforeC.representation_status === 'active', beforeC.representation_status);

  const { data } = await user.rpc('create_onboarding_request', {
    p_client_id: REP_C, p_step_type: 'custom_request',
    p_payload: { title: 'ייצוג בב״ל לבת הזוג', requirements: [{ kind: 'file', key: 'f', label: 'ייפוי כוח חתום' }] },
    p_published: true,
  });
  ok('הבקשה נוצרת', data?.ok === true, JSON.stringify(data));
  const afterC = await one(`select representation_status, lifecycle_stage,
                                   authority_representations::text as reps
                              from public.clients where id = '${REP_C}'`);
  ok('הייצוג של הראשי נשאר active', afterC.representation_status === 'active');
  ok('שלב החיים לא זז', afterC.lifecycle_stage === beforeC.lifecycle_stage);
  ok('מרשם הרשויות לא זז', afterC.reps === beforeC.reps);
}

// ── תרחיש 7+8: עריכה ופתיחה מחדש אחרי שהלקוח כבר מיוצג ─────────────────────
console.log('\n— עריכה ופתיחה מחדש —');
{
  const before = await one(`select representation_status from public.clients where id = '${REP_C}'`);
  await user.rpc('update_onboarding_request', {
    p_step_id: repReqStepId, p_payload: { title: 'נוסח מעודכן', requirements: [{ kind: 'confirm', key: 'a', label: 'לאשר' }] },
  });
  await user.rpc('advance_onboarding_step', { p_step_id: repReqStepId, p_action: 'complete' });
  await user.rpc('advance_onboarding_step', { p_step_id: repReqStepId, p_action: 'reopen' });
  const after = await one(`select representation_status from public.clients where id = '${REP_C}'`);
  ok('עריכה, השלמה ופתיחה מחדש אינן נוגעות בייצוג',
    after.representation_status === before.representation_status,
    `${before.representation_status} → ${after.representation_status}`);
  const row = await stepOf(repReqStepId);
  ok('הבקשה נפתחה מחדש', row.status === 'pending', row.status);
  ok('ונשארה לא-חוסמת', row.required_for_close === false, String(row.required_for_close));
}

// ── «מיוצג נשאר מיוצג» ──────────────────────────────────────────────────────
console.log('\n— מיוצג נשאר מיוצג —');
{
  let blocked = false;
  try {
    await writeStaging(`update public.representation_requests set status = 'pending_fill' where id = '${REP_R}';`);
  } catch (e) { blocked = /representation_active_is_terminal/.test(e.message); }
  ok('אי אפשר להחזיר בקשת ייצוג פעילה ל-pending_fill', blocked);
  const st = await one(`select status from public.representation_requests where id = '${REP_R}'`);
  ok('והבקשה נשארה active', st.status === 'active', st.status);
}
{
  let rejected = false;
  try {
    await writeStaging(`update public.clients set representation_status = 'not_a_status' where id = '${REP_C}';`);
  } catch { rejected = true; }
  ok('ערך מצב ייצוג שאינו בתחום נדחה', rejected);
}

// ── תרחיש 12: הכרטיס נגזר מהבקשה, בכתיבה אחת ───────────────────────────────
console.log('\n— הכרטיס נגזר מהבקשה —');
{
  // לקוח שני, שממנו אפשר לעלות בשרשרת בלי להתנגש ב"active הוא סופי".
  const C2 = 'fxdomrepclient2', R2 = 'fxdomrepreq2';
  await writeStaging(`
    delete from public.onboarding_steps        where client_id = '${C2}';
    delete from public.representation_requests where id = '${R2}';
    delete from public.clients                 where id = '${C2}';
    insert into public.clients (id, user_id, first_name, last_name, email,
                                representation_status, representation_request_id,
                                authority_representations, lifecycle_stage)
    values ('${C2}', '${USER_ID}', 'בדרך', 'לייצוג', 'delivered+domrep2@resend.dev',
            'pending_fill', '${R2}',
            '{"incomeTax":{"level":"primary","status":"in_process"},"vat":{"level":"primary","status":"in_process"},"nationalInsurance":{"status":"in_process"}}'::jsonb,
            'onboarding');
    insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email,
                                                authorities, requested_docs, status, onboarding_status)
    values ('${R2}', '${USER_ID}', '${C2}', 'בדרך לייצוג', 'delivered+domrep2@resend.dev',
            '{incomeTax,vat}', '[]'::jsonb, 'pending_fill', 'pending');`);

  await writeStaging(`update public.representation_requests set status = 'awaiting_authorities' where id = '${R2}';`);
  let c = await one(`select representation_status, lifecycle_stage from public.clients where id = '${C2}'`);
  ok('עדכון הבקשה לבדה מסנכרן את הכרטיס', c.representation_status === 'awaiting_authorities',
    c.representation_status);

  await writeStaging(`update public.representation_requests set status = 'active' where id = '${R2}';`);
  c = await one(`select representation_status, lifecycle_stage,
                        authority_representations::text as reps from public.clients where id = '${C2}'`);
  ok('מעבר ל-active מסמן את הכרטיס כמיוצג', c.representation_status === 'active', c.representation_status);
  ok('שלב החיים התרענן מעצמו ל-active', c.lifecycle_stage === 'active', c.lifecycle_stage);
  const reps = JSON.parse(c.reps);
  ok('מ״ה ומע״מ סומנו פעילים', reps.incomeTax.status === 'active' && reps.vat.status === 'active', c.reps);
  // ‼ אישור שע״ם אינו אישור ביטוח לאומי — הוא מסתיים בנפרד ופר-אדם.
  ok('ביטוח לאומי **לא** סומן פעיל', reps.nationalInsurance.status === 'in_process', c.reps);

  const step = await one(`select status from public.onboarding_steps
                           where client_id = '${C2}' and step_type = 'representation'`);
  ok('שלב הייצוג במסע נסגר יחד איתו', step?.status === 'completed', JSON.stringify(step));
}

// ── כלל סגירה אחד, אבל רק בפעולה מפורשת (הכרעת מוצר, 156) ─────────────────
// המוכנות וההעברה הן שני דברים נפרדים: readiness ממשיכה להאיר "אפשר לסגור"
// ברגע שהנדרש הושלם, אבל שום דבר לא מזיז את ההתקשרות בלי לחיצה על הכפתור.
console.log('\n— מוכנות מול מעבר בפועל —');
{
  const eng = await one(`select id, status from public.engagements where client_id = '${F_CLOSE}' and status = 'onboarding'`);
  // משאירים בקשת **רשות** אחת פתוחה, ומשלימים את כל הנדרשות.
  const { data: opt } = await user.rpc('create_onboarding_request', {
    p_client_id: F_CLOSE, p_step_type: 'custom_request',
    p_payload: { title: 'בקשת רשות שנשארת פתוחה', requirements: [{ kind: 'confirm', key: 'a', label: 'לאשר' }] },
    p_required_for_close: false, p_published: true,
  });
  ok('נוצרה בקשת רשות', opt?.ok === true && opt?.requiredForClose === false, JSON.stringify(opt));

  const blockers = await writeStaging(`select id from public.onboarding_steps
     where engagement_id = '${eng.id}' and required_for_close
       and status not in ('completed','verified','skipped','cancelled')
       and step_type not in ('internal_setup','kyc_identification','first_month_review',
                             'representation_upgrade','opening_call','file_opening',
                             'data_import','data_verification')`);
  for (const b of blockers) {
    await writeStaging(`update public.onboarding_steps set status = 'completed', completed_at = now() where id = '${b.id}';`);
  }
  const last = blockers[blockers.length - 1];
  let e = await one(`select status from public.engagements where id = '${eng.id}'`);
  ok('לפני שהאחרון נסגר — הקליטה פתוחה', e.status === 'onboarding', e.status);

  // ‼ הבדיקה: משלימים את השלב הנדרש האחרון דרך ה-RPC האמיתי (advance_onboarding_step),
  // בדיוק כמו שהמסך עושה — וזה בכוונה **לא** אמור לסגור את ההתקשרות מעצמו.
  await user.rpc('advance_onboarding_step', { p_step_id: last.id, p_action: 'complete' });
  e = await one(`select status, activated_at from public.engagements where id = '${eng.id}'`);
  ok('ההתקשרות נשארה onboarding אחרי שהכול הושלם — אין סגירה אוטומטית',
    e.status === 'onboarding' && !e.activated_at, JSON.stringify(e));

  const c1 = await one(`select lifecycle_stage from public.clients where id = '${F_CLOSE}'`);
  ok('הלקוח נשאר "בקליטה" — לא קפץ ל-active מעצמו', c1.lifecycle_stage === 'onboarding', c1.lifecycle_stage);

  // readiness עדיין אומרת "מוכן": הכפתור מואר, המוכנות לא נעלמה.
  const rd = (await one(`select public.onboarding_close_readiness('${eng.id}') as r`)).r;
  ok('readiness מדווחת ready=true — המוכנות לא נעלמה', rd.ready === true && rd.blocking.length === 0,
    JSON.stringify(rd));

  const ev = await one(`select count(*)::int as n from public.onboarding_events
     where engagement_id = '${eng.id}' and type = 'status_changed' and meta->>'auto' = 'true'`);
  ok('שום אירוע סגירה אוטומטי לא נרשם', ev.n === 0, String(ev.n));
  const noteBefore = await one(`select count(*)::int as n from public.accountant_notifications
     where kind = 'onboarding_closed' and client_id = '${F_CLOSE}'`);
  ok('ושום התראת סגירה לא יצאה', noteBefore.n === 0, String(noteBefore.n));

  // עכשיו לוחצים בפועל — close_onboarding, אותה פונקציה שהכפתור קורא לה.
  const closed = await user.rpc('close_onboarding', { p_engagement_id: eng.id, p_force: false, p_reason: null });
  ok('הסגירה המפורשת מצליחה', closed.data?.ok === true, JSON.stringify(closed.data));
  e = await one(`select status, activated_at from public.engagements where id = '${eng.id}'`);
  ok('ורק עכשיו ההתקשרות עברה ל-active', e.status === 'active', e.status);
  ok('ונרשם activated_at', !!e.activated_at);

  const optRow = await stepOf(opt.stepId);
  ok('בקשת הרשות נשארה פתוחה ולא נגררה לסגירה', optRow.status === 'pending', optRow.status);

  const noteAfter = await one(`select count(*)::int as n from public.accountant_notifications
     where kind = 'onboarding_closed' and client_id = '${F_CLOSE}'`);
  ok('ההתראה יצאה רק עם הסגירה המפורשת', noteAfter.n === 1, String(noteAfter.n));

  const c2 = await one(`select lifecycle_stage from public.clients where id = '${F_CLOSE}'`);
  ok('שלב החיים של הלקוח עבר ל-active', c2.lifecycle_stage === 'active', c2.lifecycle_stage);
}

// ── אחרי סגירת הקליטה אין יותר «נדרש» ──────────────────────────────────────
console.log('\n— אחרי סגירה —');
{
  ok('הקשר הקליטה חזר ל-none', (await intakeOf(F_CLOSE)).state === 'none',
    JSON.stringify(await intakeOf(F_CLOSE)));
  const { data } = await user.rpc('create_onboarding_request', {
    p_client_id: F_CLOSE, p_step_type: 'custom_request',
    p_payload: { title: 'בקשה אחרי סגירת הקליטה', requirements: [{ kind: 'confirm', key: 'a', label: 'לאשר' }] },
    p_required_for_close: true, p_published: true,
  });
  ok('בקשה חדשה נוצרת כרגיל', data?.ok === true, JSON.stringify(data));
  ok('אבל אינה יכולה לחסום קליטה שכבר נסגרה', data?.requiredForClose === false, JSON.stringify(data));

  // סגירה חוזרת של התקשרות שכבר נסגרה היא no-op שקט, לא שגיאה.
  const eng = await one(`select id from public.engagements where client_id = '${F_CLOSE}' order by created_at desc limit 1`);
  const { data: cl } = await user.rpc('close_onboarding', { p_engagement_id: eng.id, p_force: false, p_reason: null });
  ok('סגירה חוזרת היא no-op', cl?.ok === true && cl?.noop === true, JSON.stringify(cl));
}

// ── המסך והשרת מסכימים על הקשר הקליטה ──────────────────────────────────────
// ‼ העותק ב-src/lib/clientState.ts הוא בבואה. כאן מוודאים שהוא לא נפרד.
console.log('\n— המסך והשרת —');
{
  const rows = await writeStaging(`
    select c.id, c.lifecycle_stage,
           coalesce((select 'open' from public.engagements e
                      where e.client_id = c.id and e.status = 'onboarding' limit 1),
                    case when c.lifecycle_stage in ('lead','quoted') then 'pending' else 'none' end) as ui_state,
           public.client_intake_state(c.id)->>'state' as server_state
      from public.clients c`);
  const bad = rows.filter(r => r.ui_state !== r.server_state);
  ok('כלל הקשר הקליטה זהה בין המסך לשרת על כל הלקוחות', bad.length === 0,
    JSON.stringify(bad.slice(0, 3)));
}

// ── דוח העקביות ────────────────────────────────────────────────────────────
console.log('\n— דוח עקביות —');
{
  const r = (await one(`select public.domain_consistency_report() as r`)).r;
  ok('אין סחף בשלב החיים', r.lifecycleDrift === 0, String(r.lifecycleDrift));
  ok('אין כרטיס שנשאר מאחורי הבקשה שלו', r.clientBehindRequest.length === 0,
    JSON.stringify(r.clientBehindRequest));
  // ‼ המחלקה השנייה אינה נכשלת: היא אינה ניתנת להסקה ומחכה להכרעה אנושית.
  //   מדווחת כדי שלא תיעלם — לא כדי להכשיל את הבנייה.
  if (r.clientAheadOfRequest.length > 0) {
    console.log(`  ⚠ דורש עין אנושית — כרטיס מיוצג שהבקשה שלו מאחור: ${JSON.stringify(r.clientAheadOfRequest)}`);
  }
  ok('אין לקוח עם יותר מבקשת ייצוג פתוחה אחת', r.multipleOpenRepRequests.length === 0,
    JSON.stringify(r.multipleOpenRepRequests));
  console.log(`  · דגלים אינרטיים (ידוע, לא מזיק): ${r.inertRequiredFlags}`);
}

// ── ניקוי ───────────────────────────────────────────────────────────────────
await writeStaging(`
  delete from public.onboarding_steps        where client_id in ('${REP_C}', 'fxdomrepclient2');
  delete from public.representation_requests where id in ('${REP_R}', 'fxdomrepreq2');
  delete from public.clients                 where id in ('${REP_C}', 'fxdomrepclient2');`);

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * staging-test-close-rules.mjs — מטריצת האימות של מיגרציה 68 (תוכנית §12.5),
 * מול ה-RPC האמיתי בסביבת הבדיקות.
 *
 * ‼ למה מול ה-RPC ולא מול העתק של הכלל: זרימת הסגירה מעולם לא הורצה מול
 * הפונקציה האמיתית. `verify-close-rules.mjs` בודק שהמסך והשרת *מנוסחים* אותו
 * דבר; הקובץ הזה בודק שהשרת באמת מתנהג כך.
 *
 * רץ אך ורק על לקוחות הדמה (fx-q-…). העותק המבני של הנתונים האמיתיים אינו נוגע.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`); }
};
const one = async (q) => (await writeStaging(q))[0];

const cidOf = async (key) => (await one(`select client_id from public.quotations where id = 'fx-q-${key}'`)).client_id;
const engOf = async (cid) => (await one(`select id from public.engagements where client_id = '${cid}' order by created_at desc limit 1`)).id;
const readiness = async (eng) => (await one(`select public.onboarding_close_readiness('${eng}') as r`)).r;

const F3 = await cidOf('onb');
const F4 = await cidOf('close');
const E4 = await engOf(F4);
console.log(`לקוח סגירה ${F4} · התקשרות ${E4}\n`);

// ── א · יצירת בקשה — הבדיקות השליליות ──────────────────────────────────────
console.log('— יצירת בקשה —');
{
  const { data } = await user.rpc('create_onboarding_request',
    { p_client_id: F3, p_step_type: 'not_a_real_type', p_payload: {} });
  ok('סוג שלב לא מורשה נדחה', data?.error === 'step_type_not_allowed', JSON.stringify(data));
}
{
  const { data } = await user.rpc('create_onboarding_request',
    { p_client_id: 'no-such-client', p_step_type: 'client_documents', p_payload: {} });
  ok('לקוח שאינו קיים נדחה', data?.error === 'client_not_found', JSON.stringify(data));
}
{
  const { data } = await user.rpc('create_onboarding_request',
    { p_client_id: F3, p_step_type: 'custom_request', p_payload: {} });
  ok('בקשה חופשית בלי דרישות נדחית', data?.error === 'no_requirements', JSON.stringify(data));
}
{
  // תלות בשלב פתוח ⇒ השלב נולד נעול, ו-sort_order ממשיך max+10.
  const openStep = await one(`select id, sort_order from public.onboarding_steps
     where client_id = '${F3}' and status = 'pending' order by sort_order limit 1`);
  const before = await one(`select max(sort_order) as m from public.onboarding_steps where client_id = '${F3}'`);
  // ‼ custom_request ולא client_documents: יש אינדקס ייחודי "שלב אחד מכל סוג
  //   ללקוח", והבקשה החופשית היא היחידה שהוחרגה ממנו (מיגרציה 63).
  const { data, error } = await user.rpc('create_onboarding_request', {
    p_client_id: F3, p_step_type: 'custom_request',
    p_payload: { title: 'תלות', requirements: [{ kind: 'confirm', key: 'k1', label: 'לאשר' }] },
    p_depends_on: openStep.id, p_required_for_close: false });
  ok('תלות בשלב פתוח ⇒ נולד נעול', data?.status === 'locked',
    JSON.stringify(data) + (error ? ' err=' + error.message : ''));
  if (!data?.stepId) { console.log('  (ללא stepId — דילוג על שתי הבדיקות הבאות)'); }
  else {
  const row = await one(`select sort_order, required_for_close from public.onboarding_steps where id = '${data.stepId}'`);
  ok('sort_order ממשיך max+10', Number(row.sort_order) === Number(before.m) + 10, `${row.sort_order} מול ${before.m}`);
  ok('חובה/רשות נשמר כפי שנמסר (רשות)', row.required_for_close === false, String(row.required_for_close));
  const meta = await one(`select count(*)::int as n from public.onboarding_events
     where step_id = '${data.stepId}' and meta ? 'requiredForClose'`);
  ok('היצירה נרשמה ביומן עם חובה/רשות', meta.n >= 1, String(meta.n));
  await writeStaging(`delete from public.onboarding_events where step_id = '${data.stepId}';
                      delete from public.onboarding_steps where id = '${data.stepId}';`);
  }
}

// ── ב · פייפרלס לפני הרשאת תשלום (R4) ──────────────────────────────────────
console.log('\n— פייפרלס לפני תשלום —');
{
  const ret = await one(`select id, status from public.onboarding_steps
    where client_id = '${F4}' and step_type = 'retainer_authorization'`);
  ok('הרשאת התשלום נולדת נעולה', ret.status === 'locked', ret.status);
  const { data } = await user.rpc('advance_onboarding_step',
    { p_step_id: ret.id, p_action: 'complete', p_payload: {} });
  ok('אי אפשר להשלים הרשאת תשלום לפני פייפרלס',
    data?.ok === false && ['locked', 'paperless_required'].includes(data?.error), JSON.stringify(data));
}

// ── ג · מטריצת הסגירה מול ה-RPC האמיתי ─────────────────────────────────────
console.log('\n— מטריצת הסגירה —');
{
  const r = await readiness(E4);
  ok('קליטה מלאה אינה מוכנה לסגירה', r.ready === false && r.blocking.length > 0, `blocking=${r.blocking.length}`);
  const { data } = await user.rpc('close_onboarding',
    { p_engagement_id: E4, p_force: false, p_reason: null });
  ok('סגירה רגילה נחסמת', data?.error === 'not_ready', JSON.stringify(data).slice(0, 120));
  ok('הסירוב מחזיר את רשימת החוסמים', Array.isArray(data?.readiness?.blocking) && data.readiness.blocking.length > 0);
}
{
  // רק שלב אחד נשאר נדרש — הרשימה חייבת להצטמצם בדיוק אליו.
  const keep = await one(`select id from public.onboarding_steps
    where client_id = '${F4}' and step_type = 'internal_setup'`);
  await writeStaging(`update public.onboarding_steps set required_for_close = false
                       where client_id = '${F4}' and id <> '${keep.id}';`);
  const r = await readiness(E4);
  ok('נשאר שלב נדרש אחד ⇒ חוסם אחד בדיוק', r.blocking.length === 1 && r.blocking[0].id === keep.id,
    JSON.stringify(r.blocking.map((b) => b.stepType)));
  const { data } = await user.rpc('close_onboarding', { p_engagement_id: E4, p_force: false, p_reason: null });
  ok('עדיין נחסם', data?.error === 'not_ready');
}
{
  // הכול רשות ⇒ נסגר בלי כפייה, למרות ששלבים פתוחים.
  await writeStaging(`update public.onboarding_steps set required_for_close = false where client_id = '${F4}';`);
  const r = await readiness(E4);
  ok('כשהכול רשות — מוכן לסגירה', r.ready === true && r.blocking.length === 0);
  const { data } = await user.rpc('close_onboarding', { p_engagement_id: E4, p_force: false, p_reason: null });
  ok('הסגירה מצליחה', data?.ok === true, JSON.stringify(data).slice(0, 160));
  const e = await one(`select status from public.engagements where id = '${E4}'`);
  ok('ההתקשרות עברה ל-active', e.status === 'active', e.status);
  const c = await one(`select lifecycle_stage from public.clients where id = '${F4}'`);
  ok('הלקוח הפך לפעיל', c.lifecycle_stage === 'active', c.lifecycle_stage);
  const openLeft = await one(`select count(*)::int as n from public.onboarding_steps
     where client_id = '${F4}' and status not in ('completed','verified','skipped','cancelled')`);
  ok('שלבים פתוחים שורדים כבקשות של לקוח פעיל', openLeft.n > 0, `${openLeft.n} פתוחים`);
  const notif = await one(`select count(*)::int as n from public.accountant_notifications
     where kind = 'onboarding_closed' and client_id = '${F4}'`);
  ok('נרשמה התראת סגירה לרו״ח', notif.n >= 1, String(notif.n));
}

// ── ד · חלון ההתנגדות של מכתב השחרור — התיקון של §10.3 ─────────────────────
console.log('\n— חלון ההתנגדות של מכתב השחרור —');
{
  const E3 = await engOf(F3);
  const rel = await one(`select id from public.onboarding_steps
    where client_id = '${F3}' and step_type = 'release_letter'`);
  // כל השאר רשות, כדי שרק מכתב השחרור יקבע.
  await writeStaging(`update public.onboarding_steps set required_for_close = false
                       where client_id = '${F3}' and id <> '${rel.id}';
                      update public.onboarding_steps set required_for_close = true
                       where id = '${rel.id}';`);

  await writeStaging(`update public.onboarding_steps
     set status = 'pending', due_date = current_date - 5 where id = '${rel.id}';`);
  ok('מכתב שלא נשלח + תאריך שעבר ⇒ עדיין חוסם', (await readiness(E3)).ready === false);

  await writeStaging(`update public.onboarding_steps
     set status = 'locked', due_date = current_date - 5 where id = '${rel.id}';`);
  ok('מכתב נעול + תאריך שעבר ⇒ עדיין חוסם', (await readiness(E3)).ready === false);

  await writeStaging(`update public.onboarding_steps
     set status = 'waiting_client', due_date = current_date - 5 where id = '${rel.id}';`);
  ok('מכתב שנשלח + החלון עבר ⇒ אינו חוסם', (await readiness(E3)).ready === true);

  await writeStaging(`update public.onboarding_steps
     set status = 'waiting_client', due_date = current_date + 5 where id = '${rel.id}';`);
  ok('מכתב שנשלח + החלון פתוח ⇒ חוסם', (await readiness(E3)).ready === false);

  await writeStaging(`update public.onboarding_steps
     set status = 'waiting_client', due_date = null where id = '${rel.id}';`);
  ok('מכתב שנשלח בלי תאריך יעד ⇒ חוסם', (await readiness(E3)).ready === false);
}

// ── ה · כפייה, קישורים, וברירת המחדל של העמודה ─────────────────────────────
console.log('\n— כפייה, קישורים, ברירת מחדל —');
{
  const E3 = await engOf(F3);
  const { data } = await user.rpc('close_onboarding',
    { p_engagement_id: E3, p_force: true, p_reason: 'סגירה כפויה — בדיקה' });
  ok('סגירה כפויה מצליחה למרות שלב חוסם', data?.ok === true, JSON.stringify(data).slice(0, 140));
  const ev = await one(`select count(*)::int as n from public.onboarding_events
     where engagement_id = '${E3}' and meta->>'forced' = 'true'`);
  ok('הכפייה נרשמה ביומן עם forced=true', ev.n >= 1, String(ev.n));
  const snap = await one(`select count(*)::int as n from public.onboarding_events
     where engagement_id = '${E3}' and meta ? 'readiness'`);
  ok('היומן שמר את תמונת המוכנות', snap.n >= 1, String(snap.n));
}
{
  const d = await one(`select
      (select count(*)::int from public.onboarding_steps where required_for_close is null) as nulls,
      (select column_default from information_schema.columns
        where table_schema='public' and table_name='onboarding_steps'
          and column_name='required_for_close') as dflt,
      (select is_nullable from information_schema.columns
        where table_schema='public' and table_name='onboarding_steps'
          and column_name='required_for_close') as nullable`);
  ok('אין שורות בלי ערך', d.nulls === 0, String(d.nulls));
  ok('ברירת המחדל היא true', String(d.dflt).includes('true'), String(d.dflt));
  ok('העמודה NOT NULL', d.nullable === 'NO', d.nullable);
}
{
  const sig = await writeStaging(`select count(*)::int as n from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='create_onboarding_request'`);
  ok('ל-create_onboarding_request חתימה אחת בלבד', sig[0].n === 1, String(sig[0].n));
}
{
  const h = await one(`select public.public_link_health() as h`);
  ok('כל הקישורים הציבוריים תקינים', h.h?.allHealthy === true, JSON.stringify(h.h));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);

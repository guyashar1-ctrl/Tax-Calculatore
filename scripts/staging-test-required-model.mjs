#!/usr/bin/env node
/**
 * staging-test-required-model.mjs — מודל חובה/רשות מקצה לקצה (תוכנית §7–§8).
 *
 * שרשרת אחת: תבנית ⇢ שלב שנוצר ⇢ עריכה אחרי כן ⇢ נשמר ⇢ והמוכנות מכבדת אותו
 * בדיוק אותו דבר במסך וב-RPC. מריץ מול ה-RPC האמיתי, על לקוחות דמה בלבד.
 *
 * ‼ דורש זריעה טרייה לפני כל הרצה — הבדיקות משנות מצב בכוונה (מסמנות רשות,
 *   שומרות תבנית, מחילות אותה). הרצה שנייה ברצף תיפול, וזה נכון: היא הייתה
 *   בודקת מצב שכבר אינו נקודת המוצא.
 *     node scripts/seed-staging.mjs && node scripts/staging-test-required-model.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

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
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const cidOf = async (k) => (await one(`select client_id from public.quotations where id = 'fx-q-${k}'`)).client_id;

const F3 = await cidOf('onb');
const F6 = await cidOf('tpl');

// ── א · המחולל קובע ערכים מפורשים (מיגרציה 70) ─────────────────────────────
console.log('— המחולל —');
{
  const rows = await writeStaging(`select step_type, required_for_close
     from public.onboarding_steps where client_id = '${F3}' order by step_type`);
  const by = Object.fromEntries(rows.map((r) => [r.step_type, r.required_for_close]));
  ok('ביקורת חודש ראשון נולדת כרשות', by.first_month_review === false, String(by.first_month_review));
  ok('פייפרלס נולד כנדרש', by.paperless_invite === true, String(by.paperless_invite));
  ok('הרשאת תשלום נולדת כנדרשת', by.retainer_authorization === true, String(by.retainer_authorization));
  ok('מכתב שחרור נולד כנדרש', by.release_letter === true, String(by.release_letter));
  // ‼ הרגרסיה שהמיגרציה מונעת: לפניה ביקורת החודש הראשון הייתה חוסמת סגירה.
  const eng = await one(`select id from public.engagements where client_id = '${F3}' limit 1`);
  const r = await one(`select public.onboarding_close_readiness('${eng.id}') as r`);
  const blocksReview = r.r.blocking.some((b) => b.stepType === 'first_month_review');
  ok('ביקורת החודש הראשון אינה ברשימת החוסמים', !blocksReview);
}

// ── א2 · שאלון פתיחת התיק (הכרעת גיא, מיגרציה 73) ──────────────────────────
// תזכורת אופציונלית בסוף הקליטה — נוצר אוטומטית, אבל אינו חוסם, אינו נחשף
// ללקוח, ואינו שולח דבר. חשיפה = פעולה מפורשת של הרו"ח.
console.log('\n— שאלון פתיחת התיק —');
{
  const st = await one(`select id, status, required_for_close, payload->>'published' as pub
     from public.onboarding_steps where client_id = '${F3}' and step_type = 'intake_questionnaire'`);
  ok('השאלון נוצר אוטומטית', !!st?.id);
  ok('נולד כרשות', st?.required_for_close === false, String(st?.required_for_close));
  ok('נולד כטיוטה — לא מפורסם ללקוח', st?.pub === 'false', String(st?.pub));

  const tok = (await one(`select portal_token from public.clients where id = '${F3}'`)).portal_token;
  const portal = (await one(`select public.get_client_portal('${tok}') as p`)).p;
  ok('אינו מופיע בדף האישי של הלקוח', !JSON.stringify(portal).includes('שאלון'));

  const eng = await one(`select id from public.engagements where client_id = '${F3}' limit 1`);
  const r = await one(`select public.onboarding_close_readiness('${eng.id}') as r`);
  ok('אינו חוסם סגירת קליטה',
    !r.r.blocking.some((b) => b.stepType === 'intake_questionnaire'));

  const before = await one(`select count(*)::int as n from public.email_messages`);
  const { data: up } = await user.rpc('set_onboarding_step_required',
    { p_step_id: st.id, p_required: true });
  ok('אפשר לסמן אותו ידנית כנדרש', up?.ok === true && up?.requiredForClose === true, JSON.stringify(up));
  const r2 = await one(`select public.onboarding_close_readiness('${eng.id}') as r`);
  ok('אחרי הסימון הידני הוא כן חוסם',
    r2.r.blocking.some((b) => b.stepType === 'intake_questionnaire'));
  const after = await one(`select count(*)::int as n from public.email_messages`);
  ok('שום מייל לא נשלח בעקבות השינוי', after.n === before.n, `${before.n} → ${after.n}`);
  await user.rpc('set_onboarding_step_required', { p_step_id: st.id, p_required: false });
}

// ── ב · שדרוג לייצוג ראשי — גם הוא זנב ארוך ────────────────────────────────
{
  const up = await one(`select count(*)::int as n from public.onboarding_steps
     where step_type = 'representation_upgrade' and required_for_close = true`);
  ok('אין שדרוג ייצוג שנולד כנדרש', up.n === 0, `${up.n} כאלה`);
}

// ── ג · עריכת שלב קיים (מיגרציה 71) ────────────────────────────────────────
console.log('\n— עריכת שלב קיים —');
{
  const step = await one(`select id, required_for_close from public.onboarding_steps
     where client_id = '${F3}' and step_type = 'paperless_invite'`);
  const { data: d1 } = await user.rpc('set_onboarding_step_required',
    { p_step_id: step.id, p_required: false });
  ok('אפשר להפוך שלב פתוח לרשות', d1?.ok === true && d1?.requiredForClose === false, JSON.stringify(d1));
  const after = await one(`select required_for_close from public.onboarding_steps where id = '${step.id}'`);
  ok('הערך נשמר במסד', after.required_for_close === false, String(after.required_for_close));
  const ev = await one(`select count(*)::int as n from public.onboarding_events
     where step_id = '${step.id}' and meta->'requiredForClose'->>'from' = 'true'
       and meta->'requiredForClose'->>'to' = 'false'`);
  ok('השינוי נרשם ביומן עם לפני/אחרי', ev.n >= 1, String(ev.n));

  const { data: d2 } = await user.rpc('set_onboarding_step_required',
    { p_step_id: step.id, p_required: false });
  ok('שינוי לאותו ערך אינו יוצר רעש', d2?.unchanged === true, JSON.stringify(d2));

  const { data: d3 } = await user.rpc('set_onboarding_step_required',
    { p_step_id: step.id, p_required: true });
  ok('אפשר להחזיר לנדרש', d3?.ok === true && d3?.requiredForClose === true);
}
{
  // שלב סגור אינו ניתן לשינוי.
  const closed = await one(`select id from public.onboarding_steps
     where client_id = '${F3}' and step_type = 'internal_setup'`);
  await writeStaging(`update public.onboarding_steps set status = 'completed' where id = '${closed.id}';`);
  const { data } = await user.rpc('set_onboarding_step_required', { p_step_id: closed.id, p_required: false });
  ok('שלב שהושלם אינו ניתן לשינוי', data?.ok === false && data?.error === 'step_closed', JSON.stringify(data));
  await writeStaging(`update public.onboarding_steps set status = 'pending' where id = '${closed.id}';`);
}
{
  const { data } = await user.rpc('set_onboarding_step_required',
    { p_step_id: 'no-such-step', p_required: false });
  ok('שלב שאינו קיים נדחה', data?.error === 'step_not_found', JSON.stringify(data));
}

// ── ד · התבנית נושאת את הדגל (מיגרציה 69) ──────────────────────────────────
console.log('\n— תבנית המסע —');
{
  // מצב מעורב על F3: הבקשה החופשית רשות, הפייפרלס נדרש.
  // ‼ הבדיקה נעשית על custom_request ולא על שלב רגיל: התבנית מדלגת על סוג
  //   שכבר קיים אצל הלקוח (היא מוסיפה, לעולם לא דורסת), ולכן שלב רגיל היה
  //   נבדק על העותק הישן ולא על מה שהתבנית יצרה. בקשה חופשית היא רב-פעמית
  //   ולכן תמיד נוספת.
  const a = await one(`select id from public.onboarding_steps
     where client_id = '${F3}' and step_type = 'custom_request' limit 1`);
  await user.rpc('set_onboarding_step_required', { p_step_id: a.id, p_required: false });
  const title = (await one(`select payload->>'title' as t from public.onboarding_steps where id = '${a.id}'`)).t;

  const { data: saved } = await user.rpc('save_journey_template',
    { p_client_id: F3, p_name: 'תבנית בדיקת חובה/רשות', p_description: null });
  ok('התבנית נשמרה', saved?.ok === true, JSON.stringify(saved));

  const t = await one(`select entries from public.journey_templates where id = '${saved?.templateId}'`);
  const entries = t.entries;
  ok('כל הרשומות נושאות requiredForClose',
    entries.every((e) => typeof e.requiredForClose === 'boolean'), JSON.stringify(entries.map((e) => e.stepType)));
  const docs = entries.find((e) => e.stepType === 'custom_request');
  ok('הבקשה החופשית נשמרה בתבנית כרשות', docs?.requiredForClose === false, JSON.stringify(docs?.requiredForClose));
  const pap = entries.find((e) => e.stepType === 'paperless_invite');
  ok('רשומת פייפרלס נשמרה כנדרשת', pap?.requiredForClose === true, JSON.stringify(pap?.requiredForClose));

  // החלה על לקוח נקי — הדגלים חייבים לעבור.
  const { data: applied } = await user.rpc('apply_journey_template',
    { p_client_id: F6, p_template_id: saved?.templateId });
  ok('התבנית הוחלה', applied?.ok === true && applied?.added > 0, JSON.stringify(applied));
  const got = await one(`select required_for_close from public.onboarding_steps
     where client_id = '${F6}' and step_type = 'custom_request'
       and payload->>'title' = ${JSON.stringify(title).replace(/^"|"$/g, "'")} limit 1`);
  ok('השלב שהוחל נולד רשות, כמו בתבנית', got?.required_for_close === false, JSON.stringify(got));
  const got2 = await one(`select required_for_close from public.onboarding_steps
     where client_id = '${F6}' and step_type = 'paperless_invite' and status <> 'cancelled' limit 1`);
  ok('שלב אחר נולד נדרש, כמו בתבנית', got2?.required_for_close === true, JSON.stringify(got2));

  // ‼ תאימות לאחור: תבנית ישנה בלי המפתח חייבת להתנהג כ"נדרש".
  await writeStaging(`insert into public.journey_templates (id, user_id, name, entries)
    select 'fx-tpl-legacy', user_id, 'תבנית ישנה',
      '[{"stepType":"custom_request","payload":{"title":"ישן","requirements":[{"kind":"confirm","key":"a","label":"לאשר"}]}}]'::jsonb
    from public.journey_templates where id = '${saved?.templateId}'
    on conflict (id) do nothing;`);
  const { data: legacy } = await user.rpc('apply_journey_template',
    { p_client_id: F6, p_template_id: 'fx-tpl-legacy' });
  ok('תבנית ישנה בלי המפתח עדיין עובדת', legacy?.ok === true, JSON.stringify(legacy));
  const leg = await one(`select required_for_close from public.onboarding_steps
     where client_id = '${F6}' and step_type = 'custom_request'
       and payload->>'title' = 'ישן' limit 1`);
  ok('שלב מתבנית ישנה נולד נדרש', leg?.required_for_close === true, JSON.stringify(leg));
}

// ── ה · המסך והשרת מסכימים על אותה רשימה ───────────────────────────────────
console.log('\n— המסך והשרת —');
{
  const eng = await one(`select id from public.engagements where client_id = '${F3}' limit 1`);
  const r = await one(`select public.onboarding_close_readiness('${eng.id}') as r`);
  const serverIds = r.r.blocking.map((b) => b.id).sort();
  // אותו כלל בדיוק כמו ב-src/types/onboarding.ts
  const steps = await writeStaging(`select id, step_type, status, required_for_close, due_date
     from public.onboarding_steps where engagement_id = '${eng.id}'`);
  const SAT = ['completed', 'verified', 'skipped'];
  const uiIds = steps.filter((x) => {
    if (x.status === 'cancelled') return false;
    const required = typeof x.required_for_close === 'boolean' ? x.required_for_close
      : !['representation_upgrade', 'first_month_review'].includes(x.step_type);
    if (!required) return false;
    if (SAT.includes(x.status)) return false;
    if (x.step_type === 'release_letter' && x.status !== 'pending' && x.status !== 'locked'
        && x.due_date && new Date(x.due_date) <= new Date()) return false;
    return true;
  }).map((x) => x.id).sort();
  ok('רשימת החוסמים זהה בין המסך לשרת',
    JSON.stringify(serverIds) === JSON.stringify(uiIds),
    `שרת ${serverIds.length} מול מסך ${uiIds.length}`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);

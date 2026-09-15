#!/usr/bin/env node
/**
 * staging-test-single-source.mjs — שערי הרגרסיה של מיגרציה 168 (אשכול D:
 * "אותה שאלה נענתה בכמה מקומות").
 *
 * ‼ מה נבדק ולמה:
 *
 *  A  ההתקשרות הנוכחית — התקשרות ראשונה שהחיוב שלה מתחיל בחודש הבא הייתה
 *     בלתי נראית ל-current_engagement_id, וההצעה הבאה נפלה על אילוץ
 *     הייחודיות. עכשיו היא נראית, וההצעה השנייה היא חידוש ('scheduled').
 *
 *  B  "הליד הומר" — נגזר מ-clients.merged_from_lead_id בטריגר: קישור מסמן
 *     converted, מחיקת הכרטיס מחזירה את הליד למצב שלפני ההמרה.
 *
 *  C  שנת המס — current_tax_year קוראת את הגדרת המשרד, ושלוש פונקציות
 *     השאלון משתמשות בה. ‼ הבדיקה משנה זמנית את profiles.settings של משתמש
 *     הבדיקה ומשחזרת ב-finally.
 *
 *  D  שלב «עדכון סטטוס מיסויי» נגזר מסשן השאלון: התחלה ⇒ ממתין ללקוח,
 *     סיום ⇒ הושלם, פתיחה מחדש ⇒ ממתין ללקוח, מחיקת הסשן ⇒ חזרה אחורה.
 *
 *  E  PORTAL_STEP_TYPES ב-TS שווה תו-בתו לענפי `when '…'` של build_client_portal
 *     בפרודקשן (קריאה בלבד).
 *
 * הרצה:  node scripts/staging-test-single-source.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, STAGING_REF, loadEnv, writeStaging, readProd, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: authErr } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
/** לקוח שמעולם לא התחבר — הדף הציבורי האמיתי. */
const pure = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

console.log(`סביבה: ${STAGING_REF}\n`);

const originalSettings = (await one(`select settings from public.profiles where id = '${USER_ID}';`))?.settings ?? {};

async function cleanup() {
  await writeStaging(`
    delete from public.onboarding_events where engagement_id in
      (select id from public.engagements where quotation_id like 'ssot-%');
    delete from public.onboarding_events where step_id in
      (select id from public.onboarding_steps where client_id in
        (select id from public.clients where last_name = 'SSOT'));
    delete from public.onboarding_steps where client_id in
      (select id from public.clients where last_name = 'SSOT');
    delete from public.journey_stages where client_id in
      (select id from public.clients where last_name = 'SSOT');
    delete from public.engagements where quotation_id like 'ssot-%';
    delete from public.additional_charges where source_quotation_id like 'ssot-%';
    delete from public.annual_report_sessions where client_id in
      (select id from public.clients where last_name = 'SSOT');
    delete from public.tax_fact_changes where client_id in
      (select id from public.clients where last_name = 'SSOT');
    delete from public.representation_requests where linked_client_id in
      (select id from public.clients where last_name = 'SSOT');
    delete from public.clients where last_name = 'SSOT';
    delete from public.quotations where id like 'ssot-%';
    delete from public.leads where id like 'ssot-lead-%';`);
}
await cleanup();

const nextMonth = (() => {
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

/** הצעה שנשלחה, עם כרטיס — כמו במסלול האמיתי. billingStartMonth ניתן להזרקה. */
async function makeQuote(key, { billingStartMonth, leadId } = {}) {
  const token = randomBytes(16).toString('hex');
  const items = [
    { id: 'i1', serviceId: 's1', name: 'הנהלת חשבונות', category: 'monthly',
      billingType: 'monthly', catalogPrice: 1200, clientPrice: 1200, quantity: 1, vatFlag: true,
      ...(billingStartMonth ? { billingStartMonth } : {}) },
  ];
  const lead = leadId ?? ('ssot-lead-' + key);
  if (!leadId) {
    await writeStaging(`
      insert into public.leads (id, user_id, full_name, email, phone, status)
      values (${q(lead)}, '${USER_ID}', 'מקור SSOT', 'delivered@resend.dev', '050-1${key.padStart(6, '0')}', 'new');`);
  }
  await writeStaging(`
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, sent_at)
    values (${q('ssot-' + key)}, '${USER_ID}', ${q(lead)}, ${q('SSOT-' + key)}, 'sent', ${q(token)},
            ${q(JSON.stringify(items))}::jsonb, '{}'::jsonb, 18, now());`);
  const { data: ens } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: 'ssot-' + key });
  if (ens?.ok === false) throw new Error(`ensure_client: ${JSON.stringify(ens)}`);
  await writeStaging(`update public.clients set last_name = 'SSOT'
                       where id = (select client_id from public.quotations where id = ${q('ssot-' + key)});`);
  const clientId = (await one(`select client_id from public.quotations where id = ${q('ssot-' + key)};`)).client_id;
  return { token, quoteId: 'ssot-' + key, clientId, leadId: lead };
}
const approve = (token) => pure.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: 'בודק SSOT' });

try {
  // ─── A · ההתקשרות הנוכחית ─────────────────────────────────────────────────
  console.log('— A · ההתקשרות הנוכחית —');
  {
    const first = await makeQuote('a1', { billingStartMonth: nextMonth });
    const r1 = await approve(first.token);
    ok('A1 אישור הצעה שהחיוב שלה מתחיל בחודש הבא מצליח', !r1.error && r1.data?.status === 'approved', r1.error?.message);

    const eng = await one(`
      select e.id, e.status, e.effective_from::text as eff, public.current_engagement_id(e.client_id) as cur
        from public.engagements e where e.quotation_id = ${q(first.quoteId)};`);
    ok('A1 נוצרה התקשרות בקליטה עם תאריך תוקף עתידי',
      eng?.status === 'onboarding' && eng.eff > new Date().toISOString().slice(0, 10), JSON.stringify(eng));
    ok('A1 current_engagement_id מחזירה אותה למרות התאריך העתידי (הבאג של 118)',
      eng?.cur === eng?.id, `cur=${eng?.cur} id=${eng?.id}`);

    // הבקשות המוחזקות שוחררו ושויכו להתקשרות — זה נכשל בשקט כשהיא הייתה בלתי נראית
    const orphan = (await one(`select count(*)::int as n from public.onboarding_steps
       where client_id = ${q(first.clientId)} and engagement_id is null and status <> 'cancelled';`)).n;
    ok('A1 אין בקשות יתומות (בלי התקשרות) אחרי האישור', orphan === 0, `orphans=${orphan}`);

    // הצעה שנייה לאותו לקוח — חידוש, לא "התקשרות ראשונה" ⇒ אין unique_violation
    const second = await makeQuote('a2', { leadId: first.leadId });
    await writeStaging(`update public.quotations set client_id = ${q(first.clientId)}, kind = 'engagement',
                          effective_from = (current_date + interval '2 month')::date where id = ${q(second.quoteId)};`);
    const r2 = await approve(second.token);
    ok('A2 אישור הצעה שנייה לאותו לקוח לא מפיל unique_violation', !r2.error && r2.data?.status === 'approved', r2.error?.message);
    const st = await one(`
      select count(*) filter (where status in ('onboarding','active'))::int as current,
             count(*) filter (where status = 'scheduled')::int as scheduled
        from public.engagements where client_id = ${q(first.clientId)};`);
    ok('A2 ההתקשרות השנייה נוצרה כחידוש עתידי (scheduled), הראשונה נשארה נוכחית',
      st.current === 1 && st.scheduled === 1, JSON.stringify(st));

    // 'scheduled' לעולם אינה נוכחית — גם אם מועדה הגיע ומשימת המעבר מאחרת
    await writeStaging(`update public.engagements set effective_from = current_date - 1
                         where quotation_id = ${q(second.quoteId)};`);
    const cur = (await one(`select public.current_engagement_id(${q(first.clientId)}) as c;`)).c;
    ok('A3 חידוש שמועדו הגיע אך טרם הועבר אינו נחשב נוכחי', cur === eng.id, `cur=${cur}`);
  }

  // ─── B · "הליד הומר" נגזר מהכרטיס ────────────────────────────────────────
  console.log('\n— B · הליד הומר —');
  {
    await writeStaging(`
      insert into public.leads (id, user_id, full_name, email, status)
      values ('ssot-lead-b1', '${USER_ID}', 'ליד SSOT', 'delivered@resend.dev', 'closed');`);
    const cid = (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email, merged_from_lead_id)
      values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'טריגר', 'SSOT', 'delivered@resend.dev', 'ssot-lead-b1')
      returning id;`)).id;
    let l = await one(`select status, converted_client_id, pre_conversion_status from public.leads where id = 'ssot-lead-b1';`);
    ok('B1 כרטיס עם merged_from_lead_id מסמן את הליד converted ומצביע עליו',
      l.status === 'converted' && l.converted_client_id === cid, JSON.stringify(l));
    ok('B1 המצב שלפני ההמרה נשמר', l.pre_conversion_status === 'closed', JSON.stringify(l));

    // כתיבה ישירה של status (הדפדפן הישן) לא יכולה לסתור את העובדה
    await writeStaging(`update public.leads set status = 'new' where id = 'ssot-lead-b1';`);
    l = await one(`select status from public.leads where id = 'ssot-lead-b1';`);
    ok('B2 status אינו עובדה עצמאית: כל עוד יש כרטיס הליד נשאר converted', l.status === 'converted', l.status);

    await writeStaging(`delete from public.clients where id = ${q(cid)};`);
    l = await one(`select status, converted_client_id, pre_conversion_status from public.leads where id = 'ssot-lead-b1';`);
    ok('B3 מחיקת הכרטיס מחזירה את הליד למצב שלפני ההמרה, בלי הצבעה',
      l.status === 'closed' && l.converted_client_id === null && l.pre_conversion_status === null, JSON.stringify(l));

    // הדלת של הדפדפן: link_lead_to_client
    await writeStaging(`
      insert into public.leads (id, user_id, full_name, email, status)
      values ('ssot-lead-b2', '${USER_ID}', 'ליד SSOT 2', 'delivered@resend.dev', 'new');`);
    const cid2 = (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email)
      values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'קישור', 'SSOT', 'delivered@resend.dev')
      returning id;`)).id;
    const { data: link, error: linkErr } = await user.rpc('link_lead_to_client', { p_lead_id: 'ssot-lead-b2', p_client_id: cid2 });
    const both = await one(`
      select l.status, l.converted_client_id, c.merged_from_lead_id
        from public.leads l join public.clients c on c.id = ${q(cid2)} where l.id = 'ssot-lead-b2';`);
    ok('B4 link_lead_to_client מקשר את הכרטיס והליד נגזר ממנו',
      !linkErr && link?.ok === true && both.status === 'converted'
        && both.converted_client_id === cid2 && both.merged_from_lead_id === 'ssot-lead-b2',
      linkErr?.message ?? JSON.stringify({ link, both }));

    const { data: forb } = await pure.rpc('link_lead_to_client', { p_lead_id: 'ssot-lead-b2', p_client_id: cid2 });
    ok('B5 לקוח שלא התחבר לא יכול לקשר (הרשאה נסגרת)', forb == null || forb?.ok === false, JSON.stringify(forb));
  }

  // ─── C · שנת המס — מקום אחד ──────────────────────────────────────────────
  console.log('\n— C · שנת המס —');
  const fallbackYear = new Date().getFullYear() - 1;
  {
    const y0 = (await one(`select public.current_tax_year('${USER_ID}') as y;`)).y;
    ok('C1 בלי הגדרה: השנה הקלנדרית הקודמת', Number(y0) === fallbackYear, `y=${y0}`);
    await writeStaging(`update public.profiles set settings = coalesce(settings,'{}'::jsonb) || '{"taxYear": "2023"}'::jsonb
                         where id = '${USER_ID}';`);
    const y1 = (await one(`select public.current_tax_year('${USER_ID}') as y;`)).y;
    ok('C2 עם settings.taxYear: ההגדרה גוברת', Number(y1) === 2023, `y=${y1}`);
  }

  // ─── D · שלב השאלון נגזר מהסשן ───────────────────────────────────────────
  console.log('\n— D · שלב השאלון נגזר מהסשן —');
  {
    const { token, clientId } = await makeQuote('d1');
    const r = await approve(token);
    if (r.error) throw new Error('D: approve failed: ' + r.error.message);
    const intakeToken = randomBytes(16).toString('hex');
    await writeStaging(`update public.clients set intake_token = ${q(intakeToken)} where id = ${q(clientId)};`);
    const step = () => one(`select status, ball, completion_method, published_at from public.onboarding_steps
       where client_id = ${q(clientId)} and step_type = 'intake_questionnaire' and status <> 'cancelled';`);
    ok('D0 שלב השאלון נולד ממתין (טיוטה)', (await step())?.status === 'pending', JSON.stringify(await step()));

    const { data: started, error: startErr } = await pure.rpc('start_intake', { p_token: intakeToken });
    const sess = Array.isArray(started) ? started[0] : started;
    ok('D1 start_intake פותח סשן על שנת המס של המשרד (ההגדרה, לא now()-1)',
      !startErr && Number(sess?.tax_year) === 2023, startErr?.message ?? JSON.stringify(sess));
    ok('D1 והשלב עבר ל"ממתין ללקוח" מעצמו', (await step())?.status === 'waiting_client', JSON.stringify(await step()));

    await writeStaging(`update public.annual_report_sessions set status = 'review', completed_at = now()
                         where client_id = ${q(clientId)} and tax_year = 2023;`);
    let st = await step();
    ok('D2 סיום השאלון ⇒ השלב הושלם אוטומטית', st?.status === 'completed' && st.completion_method === 'auto', JSON.stringify(st));

    const { data: reopened, error: reopenErr } = await pure.rpc('reopen_intake', { p_token: intakeToken });
    st = await step();
    ok('D3 reopen_intake מחזיר את השלב ל"ממתין ללקוח" (לא סונכרן עד 168)',
      !reopenErr && reopened === true && st?.status === 'waiting_client', reopenErr?.message ?? JSON.stringify(st));

    // get_intake רואה את אותו סשן — אותה שנה
    const { data: got } = await pure.rpc('get_intake', { p_token: intakeToken });
    const g = Array.isArray(got) ? got[0] : got;
    ok('D4 get_intake מוצא את הסשן לפי אותה שנה', Number(g?.tax_year) === 2023 && g?.session_status === 'in_progress', JSON.stringify(g));

    await writeStaging(`update public.annual_report_sessions set status = 'review'
                         where client_id = ${q(clientId)} and tax_year = 2023;`);
    await writeStaging(`delete from public.annual_report_sessions where client_id = ${q(clientId)} and tax_year = 2023;`);
    st = await step();
    ok('D5 מחיקת הסשן במשרד מחזירה שלב שהושלם אוטומטית לאחור (טיוטה ⇒ ממתין)',
      st?.status === 'pending' && st.completion_method === 'manual', JSON.stringify(st));

    // השלמה ידנית של המשרד אינה נדרסת ע"י הסשן
    await writeStaging(`update public.onboarding_steps set status = 'completed', completion_method = 'manual', completed_at = now()
                         where client_id = ${q(clientId)} and step_type = 'intake_questionnaire';`);
    await pure.rpc('start_intake', { p_token: intakeToken });
    st = await step();
    ok('D6 השלמה ידנית של המשרד לא נפתחת מחדש ע"י סשן חדש', st?.status === 'completed' && st.completion_method === 'manual', JSON.stringify(st));
  }

  // ─── E · PORTAL_STEP_TYPES מול build_client_portal בפרודקשן ───────────────
  console.log('\n— E · רשימת הסוגים של הדף האישי —');
  {
    const def = (await readProd(`select pg_get_functiondef(oid) as d from pg_proc
      where proname = 'build_client_portal' and pronamespace = 'public'::regnamespace;`))[0]?.d ?? '';
    const caseBody = def.slice(def.indexOf('case s.step_type'));
    const sqlTypes = [...caseBody.matchAll(/when '([a-z_]+)' then/g)].map(m => m[1]);
    const ts = readFileSync(resolve(ROOT, 'src/types/onboarding.ts'), 'utf8');
    const block = ts.match(/PORTAL_STEP_TYPES[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
    const tsTypes = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    ok('E1 הרשימה ב-TS זהה תו-בתו (וסדר) לענפי build_client_portal בפרודקשן',
      sqlTypes.length > 0 && JSON.stringify(sqlTypes) === JSON.stringify(tsTypes),
      `sql=${sqlTypes.join(',')} · ts=${tsTypes.join(',')}`);
  }

} finally {
  await writeStaging(`update public.profiles set settings = ${q(JSON.stringify(originalSettings))}::jsonb where id = '${USER_ID}';`);
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}

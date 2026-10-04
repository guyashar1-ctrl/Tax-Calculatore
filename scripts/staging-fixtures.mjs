/**
 * staging-fixtures.mjs — לקוחות דמה פרטיים לחבילה אחת.
 *
 * ‼ למה: החבילות ההרסניות (סגירת קליטה, סימון חובה/רשות) רצו על לקוחות הדמה
 * המשותפים של seed-staging (fx-q-onb / fx-q-close). close-rules סוגרת את הקליטה
 * של fx-q-onb בכוח, וסגירה מכבה את «נדרש לסגירה» — ומאז כל חבילה אחרת שקראה את
 * אותו לקוח נכשלה, עד זריעה מחדש. כאן כל חבילה בונה לעצמה לקוחות בתחילת הריצה,
 * בקידומת משלה, באותו מסלול בדיוק כמו seed-staging: ליד + הצעה שנשלחה →
 * ensure_client_for_quotation → approve_quotation (כמו הלקוח) → פתיחת התהליך.
 *
 * מזהים: הצעה fxs-<suite>-<key>, ליד fxs-lead-<suite>-<key>. מייל
 * delivered+<suite>-<key>@resend.dev (plus-addressing על דומיין הבדיקה — לא מגיע
 * לאף אדם), וטלפון ייחודי — ensure_client_for_quotation מאחדת כרטיסים לפי מייל
 * או טלפון, ולכן שני לקוחות עם אותם פרטים היו מתמזגים.
 */
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { writeStaging, loadEnv } from './staging-lib.mjs';

// ‼ האישור נעשה כמו אצל הלקוח: לקוח ציבורי שלא התחבר. (ה-anon של החבילות כבר מחובר.)
const ENV = loadEnv('.env.staging');
const pure = createClient(ENV.VITE_SUPABASE_URL, ENV.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const q = (v) => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

/** מוחק את לקוחות הדמה של החבילה (מהרצה קודמת). */
export async function cleanupSuiteFixtures(suite) {
  const like = `fxs-${suite}-%`;
  await writeStaging(`
    create temp table if not exists fxs_clients (id text);
    truncate fxs_clients;
    insert into fxs_clients select distinct client_id from public.quotations
     where id like ${q(like)} and client_id is not null;
    insert into fxs_clients select c.id from public.clients c
     where c.email like ${q(`delivered+${suite}-%@resend.dev`)} and c.id not in (select id from fxs_clients);
    delete from public.accountant_notifications where client_id in (select id from fxs_clients);
    delete from public.email_messages where client_id in (select id from fxs_clients);
    delete from public.client_notices where client_id in (select id from fxs_clients);
    delete from public.flow_runs where client_id in (select id from fxs_clients);
    delete from public.onboarding_events
     where step_id in (select id from public.onboarding_steps where client_id in (select id from fxs_clients))
        or engagement_id in (select id from public.engagements where client_id in (select id from fxs_clients));
    delete from public.onboarding_steps where client_id in (select id from fxs_clients);
    delete from public.engagements where client_id in (select id from fxs_clients);
    delete from public.tasks where client_id in (select id from fxs_clients);
    delete from public.representation_requests where linked_client_id in (select id from fxs_clients);
    delete from public.clients where id in (select id from fxs_clients);
    delete from public.quotations where id like ${q(like)};
    delete from public.leads where id like ${q(`fxs-lead-${suite}-%`)};`);
}

/**
 * לקוח בקליטה פתוחה (או בהצעה שנשלחה, approve=false), כמו F3/F4 של seed-staging.
 * מחזיר { clientId, engagementId, quoteId, token }.
 *
 * ‼ dealerType (ברירת מחדל 'licensed') נקבע על הכרטיס לפני האישור. 217: סוג עוסק שלא
 * ידוע אינו «עוסק מורשה» — מה שתלוי בסוג מוחזק, והקליטה אינה מוכנה לסגירה עד שהמשרד
 * קובע אותו (r4 · kind hold). חבילה שבודקת דבר אחר צריכה לקוח שהסוג שלו ידוע;
 * dealerType: null — לקוח בלי סוג, לבדיקת ההחזקה עצמה.
 */
export async function makeIntakeFixture({ suite, key, user, userId, name = key,
  withPrevAccountant = true, monthly = true, withRep = true, approve = true, publish = true, dealerType = 'licensed' }) {
  const quoteId = `fxs-${suite}-${key}`;
  const leadId = `fxs-lead-${suite}-${key}`;
  const email = `delivered+${suite}-${key}@resend.dev`;
  const digits = String(parseInt(createHash('sha1').update(quoteId).digest('hex').slice(0, 8), 16) % 10000000).padStart(7, '0');
  const phone = `059-${digits}`;
  const token = randomBytes(16).toString('hex');
  const items = monthly
    ? [{ id: 'i1', serviceId: 's1', name: 'הנהלת חשבונות', category: 'monthly',
         billingType: 'monthly', catalogPrice: 1200, clientPrice: 1200, quantity: 1, vatFlag: true }]
    : [{ id: 'i1', serviceId: 's2', name: 'דוח שנתי', category: 'annual',
         billingType: 'oneTime', catalogPrice: 2500, clientPrice: 2500, quantity: 1, vatFlag: true }];
  const rep = withRep
    ? { enabled: true, areas: { incomeTax: true }, spouse: null,
        prefill: { firstName: name, lastName: 'דמה', email, phone } }
    : {};
  await writeStaging(`
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values (${q(leadId)}, '${userId}', ${q(name + ' דמה')}, ${q(email)}, ${q(phone)}, 'new', ${withPrevAccountant});
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, expires_at, sent_at)
    values (${q(quoteId)}, '${userId}', ${q(leadId)}, ${q('FXS-' + suite + '-' + key)}, 'sent', ${q(token)},
            ${q(JSON.stringify(items))}::jsonb, ${q(JSON.stringify(rep))}::jsonb, 18,
            now() + interval '30 days', now());`);
  const { data: ens, error: eErr } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: quoteId });
  if (eErr || ens?.ok === false) throw new Error(`ensure_client_for_quotation(${quoteId}): ${eErr?.message ?? JSON.stringify(ens)}`);
  if (dealerType) {
    await writeStaging(`update public.clients set dealer_type = ${q(dealerType)}
      where id = (select client_id from public.quotations where id = ${q(quoteId)})`);
  }
  if (approve) {
    const { error } = await pure.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: `${name} דמה` });
    if (error) throw new Error(`approve_quotation(${quoteId}): ${error.message}`);
  }
  const row = (await writeStaging(`
    select q.client_id, (select e.id from public.engagements e where e.client_id = q.client_id
                          order by e.created_at desc limit 1) as engagement_id
      from public.quotations q where q.id = ${q(quoteId)}`))[0];
  if (approve && publish && row?.engagement_id) {
    const { data: pub } = await user.rpc('publish_onboarding_process', { p_engagement_id: row.engagement_id });
    if (pub?.ok === false) throw new Error(`publish_onboarding_process(${quoteId}): ${JSON.stringify(pub)}`);
  }
  return { clientId: row?.client_id ?? null, engagementId: row?.engagement_id ?? null, quoteId, token };
}

#!/usr/bin/env node
/**
 * seed-staging.mjs — לקוחות דמה לבדיקות ההרסניות בסביבת הבדיקות.
 *
 * ‼ אלה הלקוחות שעליהם מותר לסגור קליטה, לדלג על שלבים, לשלוח מיילים
 * ולשבור דברים. העותק המבני של הנתונים האמיתיים (staging-clone.mjs) נשאר
 * ללא נגיעה כדי שמבחן ההתאמה של המיגרציה יישאר תקף.
 *
 * ‼ הלקוחות לא נבנים בהוספת שורות ידנית אלא דרך `approve_quotation` —
 * אותה פונקציה בדיוק שרצה כשלקוח אמיתי מאשר הצעה. כך המצב שנוצר הוא מה
 * שהמערכת באמת מייצרת, ולא מה שנדמה לנו שהיא מייצרת.
 *
 * כל כתובות המייל: delivered@resend.dev.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
if (!env.VITE_SUPABASE_URL.includes(STAGING_REF)) {
  console.error('✋ .env.staging אינו מצביע לסביבת הבדיקות.'); process.exit(1);
}
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const EMAIL = 'delivered@resend.dev';
const tok = () => randomBytes(16).toString('hex');

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: session, error: authErr } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD,
});
if (authErr) { console.error('✋ התחברות נכשלה:', authErr.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
});
console.log(`מחובר כ-${env.VITE_DEV_USER_EMAIL} מול ${STAGING_REF}\n`);

const q = (v) => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

// ── ניקוי הרצה קודמת ────────────────────────────────────────────────────────
// ‼ נמחקים רק לקוחות הדמה (fx-), לעולם לא העותק המבני של הנתונים האמיתיים.
// ‼ לקוחות הדמה מזוהים דרך ההצעות שלהם (fx-q-…), לא דרך מזהה הלקוח —
//   הוא נוצר ע"י המערכת. onboarding_events נקשר דרך השלב וההתקשרות.
await writeStaging(`
  create temp table if not exists fx_clients as
    select distinct client_id as id from public.quotations
     where id like 'fx-q-%' and client_id is not null;
  delete from public.onboarding_events
   where step_id in (select id from public.onboarding_steps where client_id in (select id from fx_clients))
      or engagement_id in (select id from public.engagements where client_id in (select id from fx_clients));
  delete from public.onboarding_steps  where client_id in (select id from fx_clients);
  delete from public.engagements       where client_id in (select id from fx_clients);
  delete from public.tasks             where client_id in (select id from fx_clients);
  delete from public.representation_requests where linked_client_id in (select id from fx_clients);
  -- ‼ הכרטיס נמחק לפני ההצעה, לא אחריה: יש שומר שחוסם מחיקת הצעה שעדיין
  --   מקושרת ללקוח (block_quotation_delete_with_client). מחיקת הכרטיס מנתקת
  --   את ההצעה, ואז היא ניתנת למחיקה. זה השומר האמיתי של המערכת, לא תקלה.
  delete from public.clients           where id in (select id from fx_clients);
  delete from public.quotations        where id like 'fx-q-%';
  delete from public.leads             where id like 'fx-lead-%';`);

/**
 * יוצר ליד + הצעה במצב "נשלחה". מחזיר את הטוקן הציבורי של ההצעה.
 *
 * ‼ לכל לקוח דמה מייל וטלפון **שונים**. `ensure_client_for_quotation` מאחדת
 * כרטיסים לפי מייל או לפי ספרות הטלפון, ולכן כשכולם היו delivered@resend.dev
 * עם אותו טלפון — כל לקוחות הדמה התמזגו לכרטיס אחד עם ערימת שלבים משותפת.
 * הכתובות שאינן delivered@ הן plus-addressing על אותו דומיין בדיקה של Resend,
 * כלומר עדיין לא מגיעות לאף אדם. הלקוחות ששולחים מייל בפועל (F3, F5) מקבלים
 * את הכתובת המדויקת delivered@resend.dev.
 */
async function makeQuotation({ key, name, withPrevAccountant, monthly, withRep, expiresInDays, email, phone }) {
  const leadId = `fx-lead-${key}`;
  const quoteId = `fx-q-${key}`;
  const token = tok();
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
    values (${q(leadId)}, '${USER_ID}', ${q(name + ' דמה')}, ${q(email)}, ${q(phone)}, 'new', ${withPrevAccountant});
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, expires_at, sent_at)
    values (${q(quoteId)}, '${USER_ID}', ${q(leadId)}, ${q('FX-' + key)}, 'sent', ${q(token)},
            ${q(JSON.stringify(items))}::jsonb, ${q(JSON.stringify(rep))}::jsonb, 18,
            ${expiresInDays == null ? 'null' : `now() + interval '${expiresInDays} days'`}, now());`);
  return { token, quoteId, leadId };
}

/** מאשר את ההצעה בדיוק כמו הלקוח: פונקציה ציבורית, בלי משתמש מחובר. */
async function approve(token, signer) {
  const { data, error } = await anon.rpc('approve_quotation', {
    p_token: token, p_signature: null, p_signer_name: signer,
  });
  if (error) throw new Error(`approve_quotation: ${error.message}`);
  return data;
}

/**
 * מזהה הכרטיס שנולד מההצעה.
 *
 * ‼ בכוונה *לא* משנים לו מזהה. ניסיון לשנות נחסם ע"י מפתחות זרים, ולשבור
 * אותם זמנית כדי "לסדר" מזהים היה מסכן בדיוק את השלמות שהסביבה בודקת.
 * הזיהוי נעשה דרך ההצעה, שמזהה שלה כן בשליטתנו (fx-q-…).
 */
async function clientOf(quoteId) {
  const rows = await writeStaging(`select client_id from public.quotations where id = ${q(quoteId)}`);
  return rows[0]?.client_id ?? null;
}

const made = [];

// ── F1 · ליד בלבד ───────────────────────────────────────────────────────────
await writeStaging(`
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('fx-lead-only', '${USER_ID}', 'ליד בלבד דמה', 'delivered+lead@resend.dev', '050-0000001', 'new', false);`);
console.log('· F1 ליד בלבד');

// ── F2 · הצעה שנשלחה וטרם אושרה (שלב "בהצעה") ──────────────────────────────
const f2 = await makeQuotation({ key: 'quote', name: 'בהצעה', withPrevAccountant: false, monthly: true, withRep: true, expiresInDays: 30, email: 'delivered+quote@resend.dev', phone: '050-0000002' });
console.log('· F2 הצעה נשלחה — טוקן לבדיקות ידניות:', f2.token);

// ── F3 · קליטה מלאה: פייפרלס + הרשאת תשלום + רו"ח קודם + ייצוג ─────────────
const f3 = await makeQuotation({ key: 'onb', name: 'בקליטה', withPrevAccountant: true, monthly: true, withRep: true, expiresInDays: 30, email: EMAIL, phone: '050-0000003' });
await approve(f3.token, 'בקליטה דמה');
const f3id = await clientOf(f3.quoteId);
made.push(['F3 קליטה מלאה', f3id]);

// ── F4 · קליטה שנייה — עליה ירוצו בדיקות הסגירה ההרסניות ───────────────────
const f4 = await makeQuotation({ key: 'close', name: 'לסגירה', withPrevAccountant: true, monthly: true, withRep: true, expiresInDays: 30, email: 'delivered+close@resend.dev', phone: '050-0000004' });
await approve(f4.token, 'לסגירה דמה');
const f4id = await clientOf(f4.quoteId);
made.push(['F4 קליטה לבדיקות סגירה', f4id]);

// ── F5 · הצעה שפוקעת מחר — לבדיקת תזכורת הפקיעה (AT-5) ─────────────────────
const f5 = await makeQuotation({ key: 'exp', name: 'פוקעת', withPrevAccountant: false, monthly: false, withRep: false, expiresInDays: 1, email: EMAIL, phone: '050-0000005' });
console.log('· F5 הצעה פוקעת מחר — טוקן:', f5.token);

// ── בקשה חופשית על F3, דרך ה-RPC האמיתי ────────────────────────────────────
const { data: custom, error: cErr } = await user.rpc('create_onboarding_request', {
  p_client_id: f3id, p_step_type: 'custom_request',
  p_payload: { title: 'בקשה חופשית לבדיקה', requirements: [{ kind: 'confirm', key: 'ack', label: 'לאשר' }] },
  p_published: true,
});
if (cErr) console.log('  ⚠ בקשה חופשית נכשלה:', cErr.message);
else console.log('· בקשה חופשית נוספה ל-F3:', JSON.stringify(custom));

// ── סיכום ───────────────────────────────────────────────────────────────────
const summary = await writeStaging(`
  select c.id, c.lifecycle_stage,
         (select count(*) from public.onboarding_steps s where s.client_id = c.id) as steps
    from public.clients c where c.id in (select distinct client_id from public.quotations where id like 'fx-q-%' and client_id is not null) order by c.created_at`);
console.log('\nלקוחות דמה:');
for (const r of summary) console.log(`  ${r.id.padEnd(12)} ${String(r.lifecycle_stage).padEnd(12)} ${r.steps} שלבים`);

const types = await writeStaging(`
  select step_type, status, required_for_close from public.onboarding_steps
   where client_id = (select client_id from public.quotations where id = 'fx-q-onb') order by sort_order`);
console.log('\nשלבי F3:');
for (const t of types) console.log(`  ${t.step_type.padEnd(24)} ${String(t.status).padEnd(14)} נדרש=${t.required_for_close}`);

const mails = await writeStaging(`select count(*)::int as n from public.email_messages where to_email is not null and to_email not like '%@resend.dev'`);
if (mails[0].n !== 0) { console.log(`\n✗ ${mails[0].n} מיילים לכתובת שאינה ${EMAIL}`); process.exit(1); }
console.log(`\n✓ לקוחות הדמה מוכנים. כל המיילים בסביבה מופנים ל-${EMAIL} בלבד.`);

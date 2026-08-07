#!/usr/bin/env node
/**
 * staging-test-email-policy.mjs — מבחני הקבלה של מדיניות המייל (תוכנית §17.5).
 *
 * AT-1 שליחה אוטומטית בלי שרו"ח מחובר · AT-2 אין כפילות · AT-3 כשל בטוח,
 * גלוי וניתן לניסיון חוזר · AT-4 מנגנון 24 השעות אינו שולח ללקוח ·
 * AT-5 תזכורת הפקיעה שותקת כשהמתג כבוי.
 *
 * ‼ הכול על לקוחות דמה בלבד, וכל הנמענים על דומיין הבדיקה של Resend.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** ממתין ש-pg_net יוציא את הבקשה בפועל (הוא נשלח אחרי ה-commit, ברקע). */
async function waitForNet(sinceId, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const r = await one(`select count(*)::int as n from net._http_response where id > ${sinceId}`);
    if (r.n > 0) return true;
    await sleep(1500);
  }
  return false;
}

console.log(`סביבה: ${STAGING_REF}\n`);

// ── AT-1 · שליחה אוטומטית, בלי אף רו"ח מחובר ───────────────────────────────
console.log('— AT-1 · שליחה אוטומטית עם אישור ההצעה —');
const tok = randomBytes(16).toString('hex');
{
  await writeStaging(`
    delete from public.leads where id = 'fx-lead-at1';
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values ('fx-lead-at1', '${USER_ID}', 'AT1 דמה', 'delivered@resend.dev', '050-0000011', 'new', false);`);
  await writeStaging(`
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, expires_at, sent_at)
    values ('fx-q-at1', '${USER_ID}', 'fx-lead-at1', 'FX-AT1', 'sent', '${tok}',
      '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1000,"clientPrice":1000,"quantity":1,"vatFlag":true}]'::jsonb,
      '{"enabled":true,"areas":{"incomeTax":true},"spouse":null,"prefill":{"firstName":"AT1","lastName":"דמה","email":"delivered@resend.dev","phone":"050-0000011"}}'::jsonb,
      18, now() + interval '30 days', now())
    on conflict (id) do nothing;`);

  const maxNet = (await one(`select coalesce(max(id), 0)::bigint as m from net._http_response`)).m;
  const mailsBefore = (await one(`select count(*)::int as n from public.email_messages`)).n;

  // ‼ בדיוק כמו לקוח אמיתי: פונקציה ציבורית, בלי טוקן של רו"ח, בלי session.
  const { data, error } = await anon.rpc('approve_quotation',
    { p_token: tok, p_signature: null, p_signer_name: 'AT1 דמה' });
  ok('האישור עבר בלי משתמש מחובר', !error && data?.status === 'approved',
    JSON.stringify(data ?? error?.message));

  const q = await one(`select client_id, representation_request_id from public.quotations where id = 'fx-q-at1'`);
  ok('נוצרה בקשת ייצוג', !!q.representation_request_id);
  const eng = await one(`select count(*)::int as n from public.engagements where client_id = '${q.client_id}'`);
  ok('נוצרה התקשרות', eng.n === 1, String(eng.n));
  const steps = await one(`select count(*)::int as n from public.onboarding_steps where client_id = '${q.client_id}'`);
  ok('נוצרו שלבי קליטה', steps.n > 0, String(steps.n));

  const dispatched = await waitForNet(maxNet);
  ok('המסד יצא בפועל בקריאת HTTP אל פונקציית השליחה', dispatched);

  const resp = await one(`select status_code, content::text as body from net._http_response
                           where id > ${maxNet} order by id desc limit 1`);
  console.log(`   תשובת הפונקציה: ${resp?.status_code} ${String(resp?.body ?? '').slice(0, 160)}`);

  const mailsAfter = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const row = await one(`select to_email, kind, status, error from public.email_messages
                          order by created_at desc limit 1`);
  if (resp?.status_code === 200) {
    ok('AT-1 · נרשמה שורת מייל אחת בדיוק', mailsAfter === mailsBefore + 1, `${mailsBefore} → ${mailsAfter}`);
    ok('AT-1 · הנמען הוא תיבת הבדיקה', row?.to_email === 'delivered@resend.dev', String(row?.to_email));
    ok('AT-1 · הסוג הוא onboard', row?.kind === 'onboard', String(row?.kind));
    const sent = await one(`select representation_sent_at from public.quotations where id = 'fx-q-at1'`);
    ok('AT-1 · ההצעה סומנה כ"נשלח"', !!sent?.representation_sent_at);
  } else {
    // ‼ אין מפתח Resend בסביבת הבדיקות (הכרעת גיא: לא מעתיקים סודות
    //   מהפרודקשן). לכן השליחה עצמה נכשלת — וזה בדיוק תרחיש AT-3.
    console.log('   ⚠ אין מפתח Resend בסביבה — רגל המסירה של AT-1 אינה נבדקת כאן.');
    ok('AT-3 · כשל אינו מפיל את האישור', true);
    const qq = await one(`select representation_sent_at, representation_error from public.quotations where id = 'fx-q-at1'`);
    ok('AT-3 · התביעה שוחררה (אפשר לנסות שוב)', qq?.representation_sent_at === null,
      String(qq?.representation_sent_at));
    ok('AT-3 · הכשל נרשם על ההצעה וגלוי לרו״ח', !!qq?.representation_error,
      String(qq?.representation_error ?? '').slice(0, 120));
    ok('AT-3 · נרשמה שורת כשל ביומן המיילים', mailsAfter === mailsBefore + 1 && row?.status === 'failed',
      `${mailsBefore} → ${mailsAfter} · ${row?.status}`);
  }
}

// ── AT-2 · אין כפילות ───────────────────────────────────────────────────────
console.log('\n— AT-2 · אישור חוזר אינו משכפל —');
{
  // מדמים שליחה מוצלחת קודמת: התביעה תפוסה.
  await writeStaging(`update public.quotations set representation_sent_at = now(),
                        representation_error = null where id = 'fx-q-at1';`);
  const before = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const maxNet = (await one(`select coalesce(max(id), 0)::bigint as m from net._http_response`)).m;
  const { data } = await anon.rpc('approve_quotation',
    { p_token: tok, p_signature: null, p_signer_name: 'AT1 דמה' });
  ok('אישור חוזר מחזיר approved ולא נופל', data?.status === 'approved', JSON.stringify(data));
  await sleep(4000);
  const after = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const netCalls = (await one(`select count(*)::int as n from net._http_response where id > ${maxNet}`)).n;
  ok('AT-2 · לא נוספה שורת מייל', after === before, `${before} → ${after}`);
  ok('AT-2 · המסד כלל לא ניסה לשלוח שוב', netCalls === 0, `${netCalls} קריאות`);
}

// ── AT-3 · ניסיון חוזר ידני עובר דרך אותה תביעה ────────────────────────────
console.log('\n— AT-3 · ניסיון חוזר בטוח —');
{
  const secret = (await one(`select decrypted_secret as s from vault.decrypted_secrets
                              where name = 'internal_send_secret'`)).s;
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-onboarding-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ internalSecret: secret, quotationId: 'fx-q-at1' }),
  });
  const body = await r.json().catch(() => ({}));
  ok('AT-3 · שליחה חוזרת על הצעה שכבר נשלחה מוחזרת כ"כבר נשלח"',
    body?.alreadySent === true, JSON.stringify(body).slice(0, 160));

  const bad = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-onboarding-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ internalSecret: 'not-the-secret', quotationId: 'fx-q-at1' }),
  });
  ok('AT-3 · סוד שגוי נדחה', bad.status === 403, String(bad.status));
}

// ── AT-4 · מנגנון 24 השעות — התראה פנימית, אפס מיילים ללקוח ────────────────
console.log('\n— AT-4 · מנגנון 24 השעות —');
{
  await writeStaging(`update public.quotations
       set representation_sent_at = null, approved_at = now() - interval '30 hours'
     where id = 'fx-q-at1';
    delete from public.accountant_notifications where kind = 'representation_link_missing';`);
  const before = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const n = await one(`select public.flag_missing_representation_links() as n`);
  ok('AT-4 · ההצעה סומנה כ"הקישור לא יצא"', Number(n.n) >= 1, String(n.n));
  const notif = await one(`select count(*)::int as n from public.accountant_notifications
                            where kind = 'representation_link_missing'`);
  ok('AT-4 · נרשמה התראה פנימית לרו״ח', notif.n === 1, String(notif.n));
  const after = (await one(`select count(*)::int as n from public.email_messages`)).n;
  ok('AT-4 · אפס מיילים ללקוח מהמנגנון הזה', after === before, `${before} → ${after}`);
  const again = await one(`select public.flag_missing_representation_links() as n`);
  ok('AT-4 · הרצה שנייה אינה מציפה בהתראות', Number(again.n) === 0, String(again.n));
}

// ── AT-5 · תזכורת הפקיעה שותקת כשהמתג כבוי ─────────────────────────────────
console.log('\n— AT-5 · תזכורת פקיעת הצעה —');
{
  // ‼ דרך x-cron-secret, בדיוק כמו המתזמן בפרודקשן — ולא דרך service-role.
  //   כך נבדק המסלול האמיתי, ולא קיצור דרך שקיים רק בבדיקה.
  const cronSecret = (await one(`select decrypted_secret as s from vault.decrypted_secrets
                                  where name = 'quotation_reminder_cron_secret'`)).s;
  const call = async () => {
    const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/quotation-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'x-cron-secret': cronSecret,
                 apikey: env.SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ bizDaysBefore: 5 }),
    });
    return r.json().catch(() => ({}));
  };

  // ברירת המחדל: אין הגדרה כלל ⇒ כבוי.
  await writeStaging(`update public.profiles set settings = coalesce(settings,'{}'::jsonb) - 'accountantNotifications' where id = '${USER_ID}';`);
  const before = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const off = await call();
  ok('AT-5 · המתג כבוי כברירת מחדל ⇒ לא נשלח דבר', off?.sent === 0, JSON.stringify(off).slice(0, 200));
  ok('AT-5 · הדילוג נספר במפורש כ"כבוי"', Number(off?.disabled ?? 0) >= 1, JSON.stringify(off?.disabled));
  const afterOff = (await one(`select count(*)::int as n from public.email_messages`)).n;
  ok('AT-5 · אפס שורות מייל', afterOff === before, `${before} → ${afterOff}`);
  const claims = await one(`select count(*)::int as n from public.quotations
                             where auto_reminder_sent_at is not null and id like 'fx-q-%'`);
  ok('AT-5 · לא נתפסה שום תביעה (אפשר להדליק מחר)', claims.n === 0, String(claims.n));

  // הדלקה ⇒ הפונקציה כן פועלת. בלי מפתח Resend היא תיכשל בשליחה, אבל
  // ההבדל שנבדק כאן הוא בין "לא ניסתה" ל"ניסתה".
  await writeStaging(`update public.profiles
      set settings = coalesce(settings,'{}'::jsonb)
        || jsonb_build_object('accountantNotifications', jsonb_build_object('quotation_expiry_reminder', true))
    where id = '${USER_ID}';`);
  const on = await call();
  ok('AT-5 · אחרי הדלקה הפונקציה כן ניגשת להצעות',
    Number(on?.disabled ?? 0) === 0 && (Number(on?.sent ?? 0) + Number(on?.failed ?? 0)) >= 1,
    JSON.stringify(on).slice(0, 200));
  // מחזירים לכבוי — מצב ברירת המחדל המאושר.
  await writeStaging(`update public.profiles set settings = coalesce(settings,'{}'::jsonb) - 'accountantNotifications' where id = '${USER_ID}';`);
  const back = await one(`select settings->'accountantNotifications' as s from public.profiles where id = '${USER_ID}'`);
  ok('AT-5 · המתג הוחזר לכבוי', back?.s === null, JSON.stringify(back?.s));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
process.exit(fail === 0 ? 0 : 1);

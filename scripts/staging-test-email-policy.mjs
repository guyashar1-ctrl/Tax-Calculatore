#!/usr/bin/env node
/**
 * staging-test-email-policy.mjs — מבחני הקבלה של מדיניות המייל (תוכנית §17.5).
 *
 * ‼ מיגרציה 102 (הכרעת גיא) הסירה את השליחה האוטומטית מ-approve_quotation:
 * המעבר בדפדפן מ"אושר" לטופס הייצוג כבר עושה את העבודה, והמייל האוטומטי
 * היה כפילות. AT-1/AT-2 עודכנו בהתאם — הם מוכיחים עכשיו את **ההיעדר**:
 * אין net.http_post, אין שורת מייל, אין חותמת representation_sent_at.
 * AT-3/AT-3b ממשיכים לבדוק את send-onboarding-email עצמה (עדיין קיימת,
 * משמשת "שלח מייל שוב" ומיילים לחותמים) — רק שהפעם ה"שליחה הראשונה" שהם
 * בודקים היא קריאה ידנית מפורשת, לא תוצר לוואי של האישור.
 *
 * AT-1 אין מייל אוטומטי עם האישור, אבל הכול נוצר וה-onboardingToken חוזר ·
 * AT-2 אישור חוזר אינו יוצר בקשת ייצוג/התקשרות שנייה · AT-3 שליחה ידנית
 * (סימולציה של "שלח מייל שוב") — כשל בטוח, גלוי וניתן לניסיון חוזר ·
 * AT-4 "24 שעות" עובר לבדוק השלמה, לא שליחת מייל · AT-5 תזכורת הפקיעה
 * שותקת כשהמתג כבוי · AT-6 משימות אוטומטיות (D3): טיוטה לא יורה, חימוש
 * רק בפרסום, בדיוק פעם אחת, כשל משחרר, נמען חיצוני חסר חוסם, ועריכה/נטרול
 * נכנסים לתוקף רק בפרסום.
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
const deferred = [];
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** ממתין ש-pg_net יוציא את הבקשה בפועל (הוא נשלח אחרי ה-commit, ברקע).
 *  ‼ הסבלנות רחבה בכוונה: השיגור אסינכרוני, ובהרצות רצופות נצפתה נפילה
 *  בודדת (1 מתוך 9) שכולה תזמון — לא התנהגות. עדיף להמתין מאשר לדווח
 *  אדום על מנגנון תקין. */
async function waitForNet(sinceId, tries = 32) {
  for (let i = 0; i < tries; i++) {
    const r = await one(`select count(*)::int as n from net._http_response where id > ${sinceId}`);
    if (r.n > 0) return true;
    await sleep(1500);
  }
  return false;
}

console.log(`סביבה: ${STAGING_REF}\n`);

// ── AT-1 · אישור ההצעה — הכול נוצר, שום מייל לא יוצא לבד ───────────────────
console.log('— AT-1 · אישור ההצעה: אין מייל אוטומטי (הכרעת גיא, מיגרציה 102) —');
const tok = randomBytes(16).toString('hex');
{
  await writeStaging(`
    delete from public.leads where id = 'fx-lead-at1';
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values ('fx-lead-at1', '${USER_ID}', 'AT1 דמה', 'delivered@resend.dev', '050-0000011', 'new', false);`);
  /* ‼ איפוס מלא בכל ריצה. `on conflict do nothing` השאיר את ההצעה במצב
     "אושרה" עם הטוקן של הריצה הקודמת, ולכן הריצה השנייה קיבלה `invalid` —
     כישלון שמדווח על שארית ולא על המנגנון. מוחקים גם את מה שהאישור הקודם
     ייצר (לקוח, התקשרות, בקשת ייצוג), אחרת הספירות אינן דטרמיניסטיות. */
  await writeStaging(`
    delete from public.clients c
     where c.id in (select q.client_id from public.quotations q where q.id = 'fx-q-at1' and q.client_id is not null);
    delete from public.representation_requests rr
     where rr.id in (select q.representation_request_id from public.quotations q
                      where q.id = 'fx-q-at1' and q.representation_request_id is not null);
    delete from public.quotations where id = 'fx-q-at1';
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, expires_at, sent_at)
    values ('fx-q-at1', '${USER_ID}', 'fx-lead-at1', 'FX-AT1', 'sent', '${tok}',
      '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1000,"clientPrice":1000,"quantity":1,"vatFlag":true}]'::jsonb,
      '{"enabled":true,"areas":{"incomeTax":true},"spouse":null,"prefill":{"firstName":"AT1","lastName":"דמה","email":"delivered@resend.dev","phone":"050-0000011"}}'::jsonb,
      18, now() + interval '30 days', now());`);

  const maxNet = (await one(`select coalesce(max(id), 0)::bigint as m from net._http_response`)).m;
  const mailsBefore = (await one(`select count(*)::int as n from public.email_messages`)).n;

  // ‼ בדיוק כמו לקוח אמיתי: פונקציה ציבורית, בלי טוקן של רו"ח, בלי session.
  const { data, error } = await anon.rpc('approve_quotation',
    { p_token: tok, p_signature: null, p_signer_name: 'AT1 דמה' });
  ok('האישור עבר בלי משתמש מחובר', !error && data?.status === 'approved',
    JSON.stringify(data ?? error?.message));
  ok('AT-1 · onboardingToken חוזר — זה מה שמפעיל את ההעברה האוטומטית בדפדפן',
    typeof data?.onboardingToken === 'string' && data.onboardingToken.length > 0,
    JSON.stringify(data?.onboardingToken));

  const q = await one(`select client_id, representation_request_id, representation_sent_at
                        from public.quotations where id = 'fx-q-at1'`);
  ok('נוצרה בקשת ייצוג', !!q.representation_request_id);
  const eng = await one(`select count(*)::int as n from public.engagements where client_id = '${q.client_id}'`);
  ok('נוצרה התקשרות', eng.n === 1, String(eng.n));
  const steps = await one(`select count(*)::int as n from public.onboarding_steps where client_id = '${q.client_id}'`);
  ok('נוצרו שלבי קליטה', steps.n > 0, String(steps.n));

  // ‼ ההיפוך של הבדיקה הישנה: עכשיו מוכיחים שהמסד *לא* יצא לשום קריאת HTTP.
  await sleep(3000);
  const netCalls = (await one(`select count(*)::int as n from net._http_response where id > ${maxNet}`)).n;
  ok('AT-1 · אין שום קריאת HTTP יוצאת (אין net.http_post ב-approve_quotation)',
    netCalls === 0, `${netCalls} קריאות`);
  const mailsAfter = (await one(`select count(*)::int as n from public.email_messages`)).n;
  ok('AT-1 · אפס שורות מייל נוספו', mailsAfter === mailsBefore, `${mailsBefore} → ${mailsAfter}`);
  ok('AT-1 · representation_sent_at נשאר ריק — לא נטען מעולם', q.representation_sent_at === null,
    String(q.representation_sent_at));
}

// ── AT-2 · אישור חוזר אינו יוצר בקשת ייצוג/התקשרות שנייה ───────────────────
console.log('\n— AT-2 · אישור חוזר אינו משכפל —');
{
  const before = await one(`select client_id, representation_request_id from public.quotations where id = 'fx-q-at1'`);
  const mailsBefore = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const engBefore = (await one(`select count(*)::int as n from public.engagements where client_id = '${before.client_id}'`)).n;

  const { data } = await anon.rpc('approve_quotation',
    { p_token: tok, p_signature: null, p_signer_name: 'AT1 דמה' });
  ok('אישור חוזר מחזיר approved ולא נופל', data?.status === 'approved', JSON.stringify(data));
  ok('AT-2 · repReused מדווח שהוא נצמד לבקשת הייצוג הקיימת', data?.repReused === true, JSON.stringify(data));

  const after = await one(`select client_id, representation_request_id from public.quotations where id = 'fx-q-at1'`);
  ok('AT-2 · אותה בקשת ייצוג בדיוק — לא נוצרה שנייה',
    after.representation_request_id === before.representation_request_id,
    `${before.representation_request_id} → ${after.representation_request_id}`);
  const engAfter = (await one(`select count(*)::int as n from public.engagements where client_id = '${before.client_id}'`)).n;
  ok('AT-2 · לא נוצרה התקשרות שנייה', engAfter === engBefore, `${engBefore} → ${engAfter}`);
  const mailsAfter = (await one(`select count(*)::int as n from public.email_messages`)).n;
  ok('AT-2 · לא נוספה שורת מייל', mailsAfter === mailsBefore, `${mailsBefore} → ${mailsAfter}`);
}

// ── AT-3-setup · שליחה ידנית ("שלח מייל שוב") — send-onboarding-email עדיין
//    עובדת ועדיין היחידה שכותבת representation_sent_at, רק שאף אחד לא קורא
//    לה אוטומטית יותר. מדמים בדיוק את הכפתור בכרטיס הלקוח. ─────────────────
console.log('\n— AT-3-setup · שליחה ידנית ("שלח מייל שוב") —');
let manualSendSucceeded = false;
{
  const secret0 = (await one(`select decrypted_secret as s from vault.decrypted_secrets
                              where name = 'internal_send_secret'`)).s;
  const maxNet = (await one(`select coalesce(max(id), 0)::bigint as m from net._http_response`)).m;
  const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-onboarding-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ internalSecret: secret0, quotationId: 'fx-q-at1' }),
  });
  const body0 = await r.json().catch(() => ({}));
  console.log(`   תשובת השליחה הידנית: ${r.status} ${JSON.stringify(body0).slice(0, 160)}`);
  if (String(JSON.stringify(body0)).includes('API key is invalid')) {
    deferred.push('AT-3-setup · מסירה חיצונית בפועל (שליחה ידנית)');
    deferred.push('AT-3 · תשובת 200 מ-Resend בניסיון חוזר');
    console.log('   ↷ נדחה: אין מפתח Resend בסביבת הבדיקות (הפרדת סודות מכוונת).');
  } else {
    manualSendSucceeded = r.status === 200;
    ok('AT-3-setup · השליחה הידנית יצאה', manualSendSucceeded, `status=${r.status}`);
  }
}

// ── AT-1 (המשך) · שליחה ידנית לא רצה מעצמה — רק כשמבקשים אותה ──────────────
{
  const q = await one(`select representation_sent_at from public.quotations where id = 'fx-q-at1'`);
  console.log(`   representation_sent_at אחרי השליחה הידנית: ${q.representation_sent_at ?? 'null (כשל Resend, ראה למעלה)'}`);
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
  if (manualSendSucceeded) {
    ok('AT-3 · שליחה חוזרת על הצעה שכבר נשלחה מוחזרת כ"כבר נשלח"',
      body?.alreadySent === true, JSON.stringify(body).slice(0, 160));
  } else {
    deferred.push('AT-3 · "כבר נשלח" (תלוי בשליחה ידנית מוצלחת שנדחתה למעלה)');
    console.log('   ↷ AT-3 נדחה: השליחה הידנית ב-AT-3-setup לא הצליחה (אין Resend).');
  }

  const bad = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-onboarding-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ internalSecret: 'not-the-secret', quotationId: 'fx-q-at1' }),
  });
  ok('AT-3 · סוד שגוי נדחה', bad.status === 403, String(bad.status));
}

// ── AT-3b · "בדיוק פעם אחת" — כל מה שאינו תלוי ב-Resend ────────────────────
// ‼ הסעיף הזה קיים כי מסירת המייל החיצונית נדחתה. שתי ההגנות מפני מייל כפול
//   הן שלנו, לא של Resend, ולכן אפשר להוכיח אותן כאן במלואן: התביעה המותנית
//   על ההצעה (index.ts:376) והמפתח הייחודי ביומן (index.ts:429).
console.log('\n— AT-3b · בדיוק פעם אחת, בלי תלות ב-Resend —');
{
  const secret = (await one(`select decrypted_secret as s from vault.decrypted_secrets
                              where name = 'internal_send_secret'`)).s;

  // 1 · ההגנה השנייה אמיתית: בלי אינדקס ייחודי, הטיפול ב-23505 הוא קוד מת.
  const idx = await one(`select count(*)::int as n from pg_indexes
                          where schemaname = 'public' and tablename = 'email_messages'
                            and indexdef ilike '%unique%' and indexdef ilike '%idempotency_key%'`);
  ok('AT-3b · קיים אינדקס ייחודי על מפתח האידמפוטנטיות', idx.n >= 1, String(idx.n));

  // 2 · המפתח באמת דוחה כפילות — הוכחה, לא הסתמכות על קיום האינדקס.
  let dupRejected = true;
  try {
    await writeStaging(`
      do $probe$
      declare k text := 'onboard:fx-idem-probe';
      begin
        delete from public.email_messages where idempotency_key = k;
        insert into public.email_messages (user_id, to_email, subject, kind, status, idempotency_key)
          values ('${USER_ID}', 'delivered@resend.dev', 'probe', 'onboard', 'sent', k);
        begin
          insert into public.email_messages (user_id, to_email, subject, kind, status, idempotency_key)
            values ('${USER_ID}', 'delivered@resend.dev', 'probe', 'onboard', 'sent', k);
          raise exception 'DUPLICATE_ALLOWED';
        exception when unique_violation then null;
        end;
        raise exception 'ROLLBACK_PROBE';
      end $probe$;`);
    dupRejected = false;
  } catch (e) {
    dupRejected = String(e?.message ?? e).includes('ROLLBACK_PROBE');
  }
  ok('AT-3b · שורה שנייה עם אותו מפתח נדחית (23505)', dupRejected);
  const leftover = await one(`select count(*)::int as n from public.email_messages
                               where idempotency_key = 'onboard:fx-idem-probe'`);
  ok('AT-3b · בדיקת המפתח לא השאירה שאריות', leftover.n === 0, String(leftover.n));

  // 3 · התביעה המותנית מודה בזוכה אחד בלבד תחת מרוץ אמיתי. זה בדיוק הפרדיקט
  //    שהפונקציה מריצה לפני הקריאה ל-Resend.
  await writeStaging(`update public.quotations set representation_sent_at = null where id = 'fx-q-at1';`);
  const racers = await Promise.all(Array.from({ length: 5 }, () =>
    writeStaging(`update public.quotations set representation_sent_at = now()
                   where id = 'fx-q-at1' and representation_sent_at is null
                   returning id;`).then((r) => r.length).catch(() => 0)));
  ok('AT-3b · חמש תביעות מקבילות — בדיוק אחת זוכה',
    racers.reduce((a, b) => a + b, 0) === 1, racers.join(','));

  // 4 · חמש קריאות מקבילות על הצעה שכבר נשלחה: אף אחת אינה שולחת שוב, אף אחת
  //    אינה כותבת ליומן, וחותמת השליחה המקורית אינה נדרסת.
  const stamp = (await one(`select representation_sent_at::text as t from public.quotations where id = 'fx-q-at1'`)).t;
  const mailsBefore = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const calls = await Promise.all(Array.from({ length: 5 }, () =>
    fetch(`${env.VITE_SUPABASE_URL}/functions/v1/send-onboarding-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ internalSecret: secret, quotationId: 'fx-q-at1' }),
    }).then((r) => r.json()).catch(() => ({}))));
  ok('AT-3b · כל חמש הקריאות המקבילות החזירו "כבר נשלח"',
    calls.every((c) => c?.alreadySent === true), JSON.stringify(calls).slice(0, 200));
  const mailsAfter = (await one(`select count(*)::int as n from public.email_messages`)).n;
  ok('AT-3b · אפס שורות מייל נוספו', mailsAfter === mailsBefore, `${mailsBefore} → ${mailsAfter}`);
  const stamp2 = (await one(`select representation_sent_at::text as t from public.quotations where id = 'fx-q-at1'`)).t;
  ok('AT-3b · חותמת השליחה לא נדרסה', stamp2 === stamp, `${stamp} → ${stamp2}`);

  // 5 · התנאי שמאפשר לניסיון החוזר להצליח: שורת הכשל נרשמת בלי מפתח ייחודי.
  //    אילו נרשמה עם מפתח, השליחה המוצלחת הבאה הייתה מתנגשת בה, נחשבת
  //    ל"כבר נשלח" — והמייל לא היה יוצא לעולם.
  const failRow = await one(`select idempotency_key from public.email_messages
                              where status = 'failed' and kind = 'onboard'
                              order by created_at desc limit 1`);
  ok('AT-3b · שורת כשל נרשמת בלי מפתח ייחודי (אחרת ניסיון חוזר ייחסם לנצח)',
    failRow !== undefined && failRow?.idempotency_key === null, JSON.stringify(failRow));
}

// ── AT-4 · "24 שעות" — בודק השלמה (onboarding_status), לא שליחת מייל ───────
// ‼ מיגרציה 102: התנאי המקורי הסיר את "representation_sent_at is null" —
// הפונקציה כבר לא שואלת אם מייל יצא, רק אם הלקוח סיים למלא. מוכיחים את זה
// ישירות: representation_sent_at מכוון ל-NOT NULL (כאילו נשלחה תזכורת ידנית)
// והדגל עדיין אמור לתפוס, כי onboarding_status עדיין 'pending'.
console.log('\n— AT-4 · "24 שעות" בודק השלמה, לא שליחת מייל —');
{
  await writeStaging(`update public.quotations
       set representation_sent_at = now(), approved_at = now() - interval '30 hours'
     where id = 'fx-q-at1';
    update public.representation_requests
       set onboarding_status = 'pending'
     where id = (select representation_request_id from public.quotations where id = 'fx-q-at1');
    delete from public.accountant_notifications where kind = 'representation_link_missing';`);
  const before = (await one(`select count(*)::int as n from public.email_messages`)).n;
  const n = await one(`select public.flag_missing_representation_links() as n`);
  ok('AT-4 · הדגל תפס גם כש-representation_sent_at אינו ריק — onboarding_status הוא שקובע',
    Number(n.n) >= 1, String(n.n));
  /* ‼ נספרת ההתראה של הפיקסטורה הזאת בלבד. ספירה גלובלית נכשלה ברגע
     שסקריפט אחר השאיר הצעה מאושרת שהקישור שלה לא יצא — כישלון שמדווח על
     נתוני שאריות ולא על התנהגות המנגנון. */
  const notif = await one(`select count(*)::int as n from public.accountant_notifications
                            where kind = 'representation_link_missing'
                              and payload->>'quotationId' = 'fx-q-at1'`);
  ok('AT-4 · נרשמה התראה פנימית לרו״ח', notif.n === 1, String(notif.n));
  const after = (await one(`select count(*)::int as n from public.email_messages`)).n;
  ok('AT-4 · אפס מיילים ללקוח מהמנגנון הזה', after === before, `${before} → ${after}`);
  const againBefore = (await one(`select count(*)::int as n from public.accountant_notifications
                                   where kind = 'representation_link_missing'`)).n;
  await one(`select public.flag_missing_representation_links() as n`);
  const againAfter = (await one(`select count(*)::int as n from public.accountant_notifications
                                  where kind = 'representation_link_missing'`)).n;
  ok('AT-4 · הרצה שנייה אינה מציפה בהתראות', againAfter === againBefore,
    `${againBefore} → ${againAfter}`);

  // ‼ בקרה שלילית: ברגע שהלקוח השלים (onboarding_status='active') — הדגל
  // מפסיק לתפוס גם אם עברו 24 שעות. זה ההבדל האמיתי בין "בדק מייל" ל"בדק השלמה".
  await writeStaging(`
    update public.representation_requests
       set onboarding_status = 'active'
     where id = (select representation_request_id from public.quotations where id = 'fx-q-at1');
    delete from public.accountant_notifications where kind = 'representation_link_missing';`);
  const doneRun = await one(`select public.flag_missing_representation_links() as n`);
  const doneNotif = await one(`select count(*)::int as n from public.accountant_notifications
                                where kind = 'representation_link_missing'
                                  and payload->>'quotationId' = 'fx-q-at1'`);
  ok('AT-4 · אחרי שהלקוח השלים — הדגל לא תופס יותר, גם עם representation_sent_at ריק',
    doneNotif.n === 0, `flag()=${doneRun.n} · notif=${doneNotif.n}`);
  // מחזירים למצב "ממתין" כדי לא להשפיע על ריצות אחרות שקוראות לפיקסטורה הזאת.
  await writeStaging(`
    update public.representation_requests
       set onboarding_status = 'pending'
     where id = (select representation_request_id from public.quotations where id = 'fx-q-at1');`);

  /* ‼ התראה פנימית שנושאת client_id נכנסת לכרטיס הלקוח דרך ההתאמה הראשית,
     לא רק דרך הכתובת — ולכן הסינון לפי סוג המייל הוא השער היחיד שעוצר אותה.
     הכלל עצמו נבדק בדפדפן; כאן רק מודדים כמה שורות היו דולפות בלעדיו, כדי
     שהמספר לא יגדל בשקט. אין כאן טענה שעוברת תמיד. */
  const leak = await one(`select count(*)::int as n from public.email_messages
     where (kind like 'notify_%' or kind = 'weekly_backup') and client_id is not null`);
  console.log(`   · דואר משרד שנושא מזהה לקוח: ${leak.n} שורות — היו מופיעות בכרטיס בלי הסינון לפי סוג`);
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

  /* ‼ הפיקסטורה נבנית כאן ולא מסתמכת על הצעה ששרדה מריצה קודמת: הצעה
     שנוצרה אתמול פוקעת היום, ואז הפונקציה לא מוצאת מועמד — והבדיקה "נכשלת"
     על תאריך, לא על התנהגות. expires_at נדחף קדימה בכל ריצה. */
  await writeStaging(`
    delete from public.leads where id = 'fx-lead-at5';
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values ('fx-lead-at5', '${USER_ID}', 'AT5 דמה', 'delivered@resend.dev', '050-0000055', 'new', false);
    delete from public.quotations where id = 'fx-q-at5';
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, vat_rate, expires_at, sent_at, auto_reminder_sent_at)
    values ('fx-q-at5', '${USER_ID}', 'fx-lead-at5', 'FX-AT5', 'sent', '${randomBytes(16).toString('hex')}',
      '[{"id":"i1","serviceId":"s1","name":"שירות","category":"monthly","billingType":"monthly","catalogPrice":500,"clientPrice":500,"quantity":1,"vatFlag":true}]'::jsonb,
      18, now() + interval '20 hours', now(), null);`);

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

// ── AT-6 · משימות אוטומטיות (D3) — חמוש-בפרסום, בדיוק פעם אחת ───────────────
// docs/EMAIL-POLICY.md §9. הביצוע: execute_automatic_step (מיגרציה 83) ⇒
// net.http_post ⇒ send-step-email במסלול הסוד הפנימי. ב-staging אין מפתח
// Resend, ולכן "ירייה" מסתיימת בכשל מבוקר: התביעה משתחררת ו-autoError נרשם —
// בדיוק ההתנהגות של מייל הייצוג. ההצלחה עצמה מדומה בתביעה ידנית.
console.log('\n— AT-6 · משימות אוטומטיות: חמוש-בפרסום, בדיוק פעם אחת —');
{
  const CLAIMS = `select set_config('request.jwt.claims', json_build_object('sub','${USER_ID}','role','authenticated')::text, false);`;
  const waitForCond = async (fn, tries = 25) => {
    for (let i = 0; i < tries; i++) { if (await fn()) return true; await sleep(1400); }
    return false;
  };

  // לקוח העוגן: לקוח קיים של משתמש הבדיקה עם דף אישי. בלי מייל לרו"ח קודם —
  // כדי לבדוק את דרישת-הקשר. שאריות מריצות קודמות מנוקות קודם.
  const cli = await one(`select id from public.clients
    where user_id = '${USER_ID}' and portal_token is not null limit 1`);
  const cid = cli.id;
  await writeStaging(`
    delete from public.email_messages where subject like 'fx-at6%';
    delete from public.onboarding_steps where client_id = '${cid}' and payload->>'title' like 'fx-at6%';
    update public.clients set prev_accountant_email = null where id = '${cid}';
    update public.engagements set process_published_at = coalesce(process_published_at, now())
      where client_id = '${cid}';`);

  const mk = async (payload, { published = false, owner = 'client', dependsOn = null } = {}) => {
    const r = await one(`${CLAIMS}
      select public.create_onboarding_request('${cid}', 'custom_request', '${payload}'::jsonb,
        null, ${dependsOn ? `'${dependsOn}'` : 'null'}, ${published}, true, '${owner}', null)::text as out;`);
    return JSON.parse(r.out);
  };
  const exec = async (id) =>
    JSON.parse((await one(`select public.execute_automatic_step('${id}')::text as out;`)).out);
  const publish = async () =>
    JSON.parse((await one(`${CLAIMS} select public.publish_case_changes('${cid}')::text as out;`)).out);
  const stepRow = async (id) =>
    await one(`select status, payload->>'autoExecutedAt' as claimed, payload->>'autoError' as err
                 from public.onboarding_steps where id = '${id}'`);

  // 1 · טיוטה אוטומטית לעולם אינה מבצעת
  const auto = await mk(`{"title":"fx-at6-auto","clientTitle":"fx-at6-auto","autoAction":{"kind":"email"},"requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}`);
  ok('AT-6 · טיוטה אוטומטית לעולם אינה מבצעת', (await exec(auto.stepId)).skipped === 'draft');

  // 2 · פרסום מחמש — אך אינו יורה כשתלות פתוחה
  const dep = await mk(`{"title":"fx-at6-dep","clientTitle":"fx-at6-dep","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}`);
  await one(`${CLAIMS} select public.set_onboarding_step_dependencies('${auto.stepId}', array['${dep.stepId}'])::text as out;`);
  const pub1 = await publish();
  const s1 = await stepRow(auto.stepId);
  ok('AT-6 · פרסום מחמש אך אינו יורה על תלות פתוחה',
    Number(pub1.autoQueued) === 0 && s1.claimed === null && s1.status === 'locked',
    JSON.stringify({ pub1, s1 }).slice(0, 160));

  // 3 · השלמת התלות האחרונה יורה — ניסיון שליחה אחד בדיוק
  const maxNet = (await one(`select coalesce(max(id),0)::bigint as m from net._http_response`)).m;
  await one(`${CLAIMS} select public.advance_onboarding_step('${dep.stepId}','start')::text as out;`);
  await one(`${CLAIMS} select public.advance_onboarding_step('${dep.stepId}','complete')::text as out;`);
  ok('AT-6 · השלמת התלות האחרונה ירתה', await waitForNet(maxNet));
  const attempts = await one(`select count(*)::int as n from net._http_response where id > ${maxNet}`);
  ok('AT-6 · ניסיון שליחה אחד בדיוק לטריגר', attempts.n === 1, String(attempts.n));

  // 6 · כשל השליחה (אין Resend ב-staging) שחרר את התביעה — ניסיון חוזר אפשרי
  ok('AT-6 · כשל שליחה שחרר את התביעה ורשם שגיאה',
    await waitForCond(async () => {
      const s = await stepRow(auto.stepId);
      return s.claimed === null && !!s.err;
    }), JSON.stringify(await stepRow(auto.stepId)).slice(0, 160));
  ok('AT-6 · אחרי כשל — הטריגר הבא רשאי לנסות שוב', (await exec(auto.stepId)).ok === true);

  /* ‼ השחרור-אחרי-כשל הוא אסינכרוני (pg_net → פונקציה → release). לפני
     שמדמים הצלחה חייבים להמתין שהוא ישקע, אחרת הוא ימחק את התביעה הידנית
     שלנו והבדיקה תמדוד מרוץ במקום התנהגות. דורשים שקט יציב בשתי דגימות. */
  const settled = async () => {
    let quiet = 0;
    for (let i = 0; i < 20; i++) {
      const s = await stepRow(auto.stepId);
      quiet = s.claimed === null ? quiet + 1 : 0;
      if (quiet >= 2) return true;
      await sleep(1500);
    }
    return false;
  };
  ok('AT-6 · מצב הביצוע נרגע אחרי הניסיון החוזר', await settled());

  // 4+5 · הצלחה (תביעה תפוסה) — שום דבר לא יורה שוב.
  // ‼ הטענה נבדקת על השלב עצמו ולא על המונה הכולל: המונה סופר את כל
  //   המשימות של הלקוח, ומשימה אחרת שנורית באותו רגע הייתה הופכת בדיקה
  //   נכונה לאדומה.
  await writeStaging(`select public.claim_auto_execution('${auto.stepId}');`);
  await publish();
  ok('AT-6 · פרסום חוזר אינו שולח שוב אחרי הצלחה',
    (await stepRow(auto.stepId)).claimed !== null,
    JSON.stringify(await stepRow(auto.stepId)).slice(0, 120));
  ok('AT-6 · ניסיון ישיר אחרי הצלחה מדלג', (await exec(auto.stepId)).skipped === 'already_executed');

  // 7 · נמען חיצוני חסר חוסם — בלי לצרוך את התביעה
  const ext = await mk(`{"title":"fx-at6-ext","autoAction":{"kind":"email"},"externalParty":{"kind":"prev_accountant"}}`,
    { published: true, owner: 'external' });
  const extRes = await exec(ext.stepId);
  const extRow = await stepRow(ext.stepId);
  ok('AT-6 · נמען חיצוני חסר חוסם בלי לתפוס תביעה',
    extRes.skipped === 'contact_missing' && extRow.claimed === null, JSON.stringify(extRes));

  // 8 · אוטומציה שנוספה בעריכה על בקשה שפורסמה — לא פעילה עד הפרסום
  const man = await mk(`{"title":"fx-at6-man","clientTitle":"fx-at6-man","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}`,
    { published: true });
  const edit1 = JSON.parse((await one(`${CLAIMS} select public.update_onboarding_request('${man.stepId}',
    '{"title":"fx-at6-man","clientTitle":"fx-at6-man","autoAction":{"kind":"email"},"requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}'::jsonb)::text as out;`)).out);
  ok('AT-6 · העריכה נרשמה כממתינה (draft_payload)', edit1.pendingEdit === true);
  ok('AT-6 · אוטומציה שנוספה בעריכה אינה פעילה לפני פרסום',
    (await exec(man.stepId)).skipped === 'not_automatic');
  // ‼ נמדד על השלב הזה בלבד: הפרסום החיל את העריכה, השלב נחמש ונורה בדיוק
  //   פעם אחת (ניסיון יחיד — ומכיוון שאין Resend ב-staging הוא נרשם ככשל).
  const netBefore = (await one(`select coalesce(max(id),0)::bigint as m from net._http_response`)).m;
  const pub2 = await publish();
  ok('AT-6 · הפרסום החיל את העריכה', Number(pub2.editsApplied) >= 1, JSON.stringify(pub2).slice(0, 140));
  ok('AT-6 · השלב שנחמש בפרסום נורה בדיוק פעם אחת',
    await waitForCond(async () => {
      const s = await stepRow(man.stepId);
      return s.claimed !== null || !!s.err;   // נתפס, או נורה ונכשל ושוחרר
    }) &&
    (await one(`select count(*)::int as n from net._http_response where id > ${netBefore}`)).n === 1,
    JSON.stringify(await stepRow(man.stepId)).slice(0, 120));
  await waitForCond(async () => {
    const s = await stepRow(man.stepId);
    return s.claimed === null && !!s.err; // הירייה נכשלה על Resend ושוחררה
  });

  // 9 · נטרול אוטומציה בעריכה — נכנס לתוקף רק בפרסום
  await one(`${CLAIMS} select public.update_onboarding_request('${man.stepId}',
    '{"title":"fx-at6-man","clientTitle":"fx-at6-man","autoAction":null,"requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false}]}'::jsonb)::text as out;`);
  ok('AT-6 · לפני הפרסום התצורה הישנה (החמושה) עדיין חיה',
    (await exec(man.stepId)).ok === true);
  await waitForCond(async () => (await stepRow(man.stepId)).claimed === null);
  await publish();
  ok('AT-6 · אחרי הפרסום הנטרול בתוקף', (await exec(man.stepId)).skipped === 'not_automatic');

  // ניקוי
  await writeStaging(`
    delete from public.email_messages where subject like 'fx-at6%';
    delete from public.onboarding_steps where client_id = '${cid}' and payload->>'title' like 'fx-at6%';`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} עברו ${pass} · נכשלו ${fail}`);
if (deferred.length) {
  // ‼ חוליה נדחית אינה כישלון ואינה PASS. היא מודפסת בנפרד כדי שלא ידווח
  //   "הכול עבר" על מסלול שלא רץ מעולם — גם אחרי שהוסכם שאינו חוסם מיזוג.
  console.log(`\n↷ ${deferred.length} חוליות נדחו במכוון — סיכון שיורי לפרודקשן:`);
  for (const b of deferred) console.log('   · ' + b);
  console.log('   הסיבה: הפרדת סודות. אין מפתח Resend ב-staging ואין להעתיק את של הפרודקשן.');
  console.log('   הכיסוי החלופי: AT-3b מוכיח את שתי הגנות "בדיוק פעם אחת" בלי Resend.');
  console.log('   ראה docs/EMAIL-POLICY.md · "מה לא נבדק".');
}
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * staging-test-p0-atomicity.mjs — שערי הרגרסיה של P0-B ו-P0-C.
 *
 * ‼ שתי התקלות שהמבחן הזה נועד למנוע מלחזור:
 *
 *  P0-B  approve_quotation סימנה הצעה כ"אושרה" וגם כשיצירת ההתקשרות נכשלה,
 *        כי הכשל נבלע (`exception when others then null`) והערך המוחזר של
 *        create_engagement_for_quotation לא נבדק כלל. התוצאה: הצעה מאושרת
 *        בלי התקשרות, בלי חיובים ובלי מסלול קליטה — והמסך אמר ללקוח "אושר".
 *
 *  P0-C  «סיים יישור» דיווח הצלחה בלי לכתוב כלום לתיק, כי propose_tax_facts
 *        לא החזירה מזהה והקוראים בדקו `propose.change?.id`.
 *
 * ‼ האישור נעשה כאן דרך לקוח anon אמיתי — בדיוק כמו הדפדפן של הלקוח —
 * ולא ב-SQL ישיר, אחרת לא היינו בודקים את המסלול שרץ בפרודקשן.
 *
 * הרצה:  node scripts/staging-test-p0-atomicity.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, STAGING_REF, loadEnv, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

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

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  await writeStaging(`
    delete from public.onboarding_events where engagement_id in
      (select id from public.engagements where quotation_id like 'p0at-%');
    delete from public.onboarding_steps where client_id in
      (select id from public.clients where last_name = 'P0ATOM');
    delete from public.journey_stages where client_id in
      (select id from public.clients where last_name = 'P0ATOM');
    delete from public.engagements where quotation_id like 'p0at-%';
    delete from public.additional_charges where source_quotation_id like 'p0at-%';
    delete from public.tax_fact_changes where client_id in
      (select id from public.clients where last_name = 'P0ATOM');
    delete from public.representation_requests where linked_client_id in
      (select id from public.clients where last_name = 'P0ATOM');
    delete from public.clients where last_name = 'P0ATOM';
    delete from public.quotations where id like 'p0at-%';
    delete from public.leads where id like 'p0at-lead-%';`);
}
await cleanup();

/** הצעה במצב "נשלחה" עם כרטיס לקוח, בדיוק כמו במסלול האמיתי. */
async function makeQuote(key) {
  const token = randomBytes(16).toString('hex');
  const items = [
    { id: 'i1', serviceId: 's1', name: 'הנהלת חשבונות', category: 'monthly',
      billingType: 'monthly', catalogPrice: 1200, clientPrice: 1200, quantity: 1, vatFlag: true },
    { id: 'i2', serviceId: 's2', name: 'פתיחת תיקים', category: 'one_time',
      billingType: 'oneTime', catalogPrice: 900, clientPrice: 900, quantity: 1, vatFlag: true },
  ];
  await writeStaging(`
    insert into public.leads (id, user_id, full_name, email, phone, status)
    values (${q('p0at-lead-' + key)}, '${USER_ID}', 'אטומי P0ATOM', 'delivered@resend.dev', '050-0000${key}', 'new');
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token,
                                   items, representation, vat_rate, sent_at)
    values (${q('p0at-' + key)}, '${USER_ID}', ${q('p0at-lead-' + key)}, ${q('P0AT-' + key)}, 'sent', ${q(token)},
            ${q(JSON.stringify(items))}::jsonb, '{}'::jsonb, 18, now());`);
  const { data: ens } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: 'p0at-' + key });
  if (ens?.ok === false) throw new Error(`ensure_client: ${JSON.stringify(ens)}`);
  await writeStaging(`update public.clients set last_name = 'P0ATOM'
                       where id = (select client_id from public.quotations where id = ${q('p0at-' + key)});`);
  return { token, quoteId: 'p0at-' + key };
}

const approve = (token) => anon.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: 'בודק P0' });
const stateOf = (quoteId) => one(`
  select q.status,
         (select count(*) from public.engagements e where e.quotation_id = q.id)::int as engagements,
         (select count(*) from public.additional_charges c where c.source_quotation_id = q.id)::int as charges,
         (select count(*) from public.onboarding_steps st
           where st.engagement_id in (select id from public.engagements where quotation_id = q.id))::int as steps
    from public.quotations q where q.id = ${q(quoteId)};`);

try {
  // ─── A1 · מסלול תקין: אישור יוצר הכל ──────────────────────────────────────
  console.log('— A · אטומיות אישור ההצעה —');
  {
    const { token, quoteId } = await makeQuote('a1');
    const { data, error } = await approve(token);
    const st = await stateOf(quoteId);
    ok('A1 אישור תקין מחזיר approved', !error && data?.status === 'approved', error?.message);
    ok('A1 ונוצרו התקשרות + חיובים + שלבים',
      st.engagements === 1 && st.charges >= 1 && st.steps > 0,
      `eng=${st.engagements} charges=${st.charges} steps=${st.steps}`);
  }

  // ─── A2 · כשל מאולץ: אין אישור שקרי ───────────────────────────────────────
  // ‼ מנתקים את כרטיס הלקוח מההצעה. create_engagement_for_quotation מחזירה
  // {ok:false,'no_client'} — בדיוק הכשל הרך שנבלע עד היום. ההצעה חייבת
  // להישאר "נשלחה", בלי התקשרות ובלי חיובים.
  {
    const { token, quoteId } = await makeQuote('a2');
    await writeStaging(`update public.quotations set client_id = null where id = ${q(quoteId)};`);
    const { data, error } = await approve(token);
    const st = await stateOf(quoteId);
    ok('A2 כשל ביצירת ההתקשרות מוחזר כשגיאה ולא כ-approved',
      !!error && data == null, `error=${error?.message ?? 'אין'} data=${JSON.stringify(data)}`);
    ok('A2 ההצעה **לא** סומנה כאושרה', st.status === 'sent', `status=${st.status}`);
    ok('A2 ולא נוצרו התקשרות/חיובים', st.engagements === 0 && st.charges === 0,
      `eng=${st.engagements} charges=${st.charges}`);
    ok('A2 השגיאה מזוהה ככשל השלמה', /approval_incomplete/.test(error?.message ?? ''), error?.message);

    // ─── A3 · ניסיון חוזר אחרי תיקון משלים הכל ──────────────────────────────
    await writeStaging(`
      update public.quotations set client_id = (select id from public.clients where last_name='P0ATOM'
        and user_id='${USER_ID}' order by created_at desc limit 1)
       where id = ${q(quoteId)};`);
    const retry = await approve(token);
    const st2 = await stateOf(quoteId);
    ok('A3 ניסיון חוזר אחרי תיקון מצליח', !retry.error && retry.data?.status === 'approved', retry.error?.message);
    ok('A3 ועכשיו ההתקשרות והחיובים קיימים',
      st2.status === 'approved' && st2.engagements === 1 && st2.charges >= 1,
      `status=${st2.status} eng=${st2.engagements} charges=${st2.charges}`);
  }

  // ─── A4 · אידמפוטנטיות: לחיצה שנייה לא מכפילה ─────────────────────────────
  {
    const { token, quoteId } = await makeQuote('a4');
    await approve(token);
    const first = await stateOf(quoteId);
    const second = await approve(token);
    const after = await stateOf(quoteId);
    ok('A4 אישור חוזר לא מחזיר שגיאה', !second.error, second.error?.message);
    ok('A4 ולא נוצרה התקשרות/חיוב/שלב כפולים',
      after.engagements === first.engagements && after.charges === first.charges && after.steps === first.steps,
      `לפני eng=${first.engagements}/charges=${first.charges}/steps=${first.steps} · אחרי eng=${after.engagements}/charges=${after.charges}/steps=${after.steps}`);
  }

  // ─── A5 · שתי לחיצות במקביל ───────────────────────────────────────────────
  {
    const { token, quoteId } = await makeQuote('a5');
    const [r1, r2] = await Promise.all([approve(token), approve(token)]);
    const st = await stateOf(quoteId);
    ok('A5 שתי לחיצות במקביל — שתיהן מסתיימות בלי שגיאה', !r1.error && !r2.error,
      `${r1.error?.message ?? ''} ${r2.error?.message ?? ''}`);
    ok('A5 ונוצרה התקשרות אחת בלבד', st.engagements === 1, `eng=${st.engagements}`);
  }

  // ─── A6 · לקוח anon אמיתי מקבל מסלול קליטה מלא ────────────────────────────
  // ‼ הבדיקה הזו קיימת כי כל שאר הבדיקות בפרויקט "מאשרות כמו לקוח" דרך לקוח
  // supabase-js שכבר הריץ signInWithPassword — ולכן הן שולחות JWT של הרו"ח
  // ומכסות מסלול שהלקוח האמיתי לעולם לא עובר בו. לקוח שמעולם לא התחבר חשף
  // שלושה שלבי יישור קו ושיחת פתיחה שפשוט לא נוצרו (מיגרציה 163).
  {
    const { token, quoteId } = await makeQuote('a6');
    const pure = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await pure.rpc('approve_quotation',
      { p_token: token, p_signature: null, p_signer_name: 'לקוח אנונימי' });
    const align = (await one(`
      select coalesce(string_agg(step_type, ',' order by step_type), '-') as a
        from public.onboarding_steps
       where client_id = (select client_id from public.quotations where id = ${q(quoteId)})
         and (step_type like 'institution_alignment%' or step_type = 'opening_call');`)).a;
    ok('A6 אישור מלקוח שמעולם לא התחבר מצליח', !error, error?.message);
    ok('A6 ומסלול הקליטה נבנה במלואו (יישור קו + שיחת פתיחה)',
      align.includes('institution_alignment_btl') && align.includes('institution_alignment_vat')
      && align.includes('institution_alignment_income') && align.includes('opening_call'), align);
  }

  // ─── B · «סיים יישור» כותב באמת ───────────────────────────────────────────
  console.log('\n— B · החלת עובדות מס —');
  const cid = (await one(`
    insert into public.clients (id, user_id, first_name, last_name, email, ni_balance)
    values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'עובדות', 'P0ATOM', 'delivered@resend.dev', 0)
    returning id;`)).id;

  const item = (oldVal, newVal) => ([{
    field_key: 'niBalance', label: 'יתרה בביטוח לאומי',
    old_value: { display: String(oldVal), patch: { niBalance: oldVal } },
    new_value: { display: String(newVal), patch: { niBalance: newVal } },
  }]);

  {
    const { data, error } = await user.rpc('apply_tax_facts', {
      p_client_id: cid, p_source: 'institution_alignment', p_source_ref: 'p0at', p_items: item(0, 250),
    });
    const bal = (await one(`select ni_balance from public.clients where id = ${q(cid)};`)).ni_balance;
    ok('B1 apply_tax_facts מדווח applied', !error && data?.ok === true && data?.applied === 1,
      error?.message ?? JSON.stringify(data));
    ok('B1 והערך באמת נכתב לתיק הלקוח', Number(bal) === 250, `ni_balance=${bal}`);
    const st = (await one(`select status from public.tax_fact_changes
                            where client_id = ${q(cid)} and field_key='niBalance' limit 1;`)).status;
    ok('B1 ושורת היומן סומנה accepted', st === 'accepted', `status=${st}`);
  }

  {
    // ניסיון חוזר עם אותם ערכים — לא סתירה, לא כתיבה כפולה.
    const { data } = await user.rpc('apply_tax_facts', {
      p_client_id: cid, p_source: 'institution_alignment', p_source_ref: 'p0at', p_items: item(0, 250),
    });
    const rows = (await one(`select count(*)::int as n from public.tax_fact_changes
                              where client_id = ${q(cid)} and field_key='niBalance';`)).n;
    ok('B2 ניסיון חוזר מדווח already_applied',
      data?.results?.[0]?.outcome === 'already_applied', JSON.stringify(data?.results));
    ok('B2 ולא נוספה שורת יומן חדשה', rows === 1, `שורות=${rows}`);
  }

  {
    // הערך בתיק זז מאז שהמסך נטען — לא נדרס.
    await writeStaging(`update public.clients set ni_balance = 999 where id = ${q(cid)};`);
    const { data } = await user.rpc('apply_tax_facts', {
      p_client_id: cid, p_source: 'institution_alignment', p_source_ref: 'p0at', p_items: item(0, 400),
    });
    const bal = (await one(`select ni_balance from public.clients where id = ${q(cid)};`)).ni_balance;
    ok('B3 ערך שהשתנה בינתיים מדווח pending_conflict',
      data?.results?.[0]?.outcome === 'pending_conflict' && data?.pending === 1, JSON.stringify(data?.results));
    ok('B3 ולא נדרס', Number(bal) === 999, `ni_balance=${bal}`);
  }

  {
    // חוזה propose_tax_facts — המזהה שחסר היה, ושבגללו האישור מעולם לא רץ.
    const { data } = await user.rpc('propose_tax_facts', {
      p_client_id: cid, p_source: 'import', p_source_ref: 'p0at',
      p_items: [{ field_key: 'vatBalance', label: 'יתרת מע״מ',
        old_value: { patch: { vatBalance: null } }, new_value: { patch: { vatBalance: 12 } } }],
    });
    ok('B4 propose_tax_facts מחזירה מזהה שינוי (החוזה שהיה שבור)',
      !!data?.change?.id && Array.isArray(data?.changes) && data.changes.length === 1,
      JSON.stringify(data));
  }

  {
    // בעלות: לקוח לא קיים לא נוגע בכלום.
    const { data } = await user.rpc('apply_tax_facts', {
      p_client_id: 'no-such-client', p_source: 'import', p_source_ref: 'p0at', p_items: item(0, 1),
    });
    ok('B5 לקוח לא קיים מוחזר כשגיאה מפורשת', data?.ok === false && data?.error === 'client_not_found',
      JSON.stringify(data));
  }

} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}

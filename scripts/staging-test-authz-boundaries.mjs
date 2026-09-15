#!/usr/bin/env node
/**
 * staging-test-authz-boundaries.mjs — שער הרגרסיה של מיגרציה 165 (גבולות הרשאה).
 *
 * מה נבדק כאן, ולמה כל בדיקה קיימת:
 *  1  PF6 · שער המורשים ב-RLS: משתמש מחובר שאינו ברשימת המורשים לא קורא ולא
 *     כותב בשש הטבלאות שנשארו בלי השער — גם כשהשורות שלו. המשתמש המורשה
 *     ממשיך לעבוד (לא "אבטחנו ושברנו").
 *  2  PF11 · הצעה מבוטלת/פגה: get_quotation מחזירה מעטפה בלבד — בלי פריטים
 *     ובלי onboardingToken. הצעה מאושרת עדיין מחזירה את הטוקן.
 *  3  PF11 · תפוגת טוקן הדף האישי ומכתב שבוטל — user_id_for_public_token
 *     מכבדת את אותו כלל כמו get_client_portal.
 *  4  PF3 · הגשה חוזרת של טופס הזיהוי נדחית ואינה משנה זהות/סטטוס/חותמים.
 *  5  JF26/PF17 · release_portal_sign נמחקה; טוקן של מכתב שבוטל מת בכל
 *     חמש הדלתות; מכתב חי ממשיך לעבוד.
 *  6  H1 · שני כרטיסים עם אותו מייל ⇒ נפתח כרטיס חדש ונרשם אירוע עמימות;
 *     כרטיס יחיד ⇒ ההצעה נצמדת אליו.
 *
 * ‼ הכול על סביבת הבדיקות בלבד. קידומת הנתונים: AUTHZ / authz-… — נמחקים
 * בסוף הריצה, גם בכישלון. לא מריץ seed-staging.
 *
 * הרצה:  node scripts/staging-test-authz-boundaries.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, writeStaging, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const U = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}${d ? ' — ' + d : ''}`); } };
const one = async (q) => (await writeStaging(q))[0];
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const uid = () => "replace(gen_random_uuid()::text,'-','')";

const AS = (id) => `select set_config('request.jwt.claims', json_build_object('sub','${id}','role','authenticated')::text, false);`;
const asAnon = (sql) => writeStaging(`set role anon; ${sql}`);
const asUser = (id, sql) => writeStaging(`${AS(id)} set role authenticated; ${sql}`);

/** מריץ ומחזיר {denied, value, message}. הרשאה חסרה / RLS = denied. */
async function tryRun(runner, sql) {
  try {
    return { denied: false, value: await runner(sql) };
  } catch (e) {
    const m = String(e.message || '');
    return { denied: /permission denied|row-level security|not authorized|must be owner/i.test(m), message: m.slice(0, 200) };
  }
}

const OTHER_EMAIL = 'authz-other@test.local';

console.log(`סביבה: ${STAGING_REF}\n`);

async function cleanup() {
  await writeStaging(`
    delete from public.accountant_notifications where client_id in (select id from public.clients where last_name = 'AUTHZ');
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = 'AUTHZ'));
    delete from public.onboarding_steps where client_id in (select id from public.clients where last_name = 'AUTHZ');
    delete from public.journey_stages where client_id in (select id from public.clients where last_name = 'AUTHZ');
    delete from public.engagements where client_id in (select id from public.clients where last_name = 'AUTHZ');
    delete from public.tax_fact_changes where client_id in (select id from public.clients where last_name = 'AUTHZ');
    delete from public.additional_charges where client_id in (select id from public.clients where last_name = 'AUTHZ');
    delete from public.representation_requests where linked_client_id in (select id from public.clients where last_name = 'AUTHZ')
       or id like 'authz-%';
    delete from public.tasks where client_id in (select id from public.clients where last_name = 'AUTHZ');
    update public.quotations set client_id = null where id like 'authz-%';
    delete from public.clients where last_name = 'AUTHZ';
    delete from public.quotations where id like 'authz-%';
    delete from public.leads where id like 'authz-lead-%';
    delete from public.journey_templates where id like 'authz-%';
    delete from public.office_journey_defaults where id like 'authz-%';
    delete from public.automation_jobs where id like 'authz-%';
    delete from public.automation_workers where worker_id like 'authz-%';
    delete from public.profiles where email = '${OTHER_EMAIL}';
    delete from auth.users where email = '${OTHER_EMAIL}';`);
}
await cleanup();

try {
  // ‼ המשתמש השני: מחובר, עם פרופיל ומשרד משלו — אבל **לא** ברשימת המורשים.
  const other = (await one(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            '${OTHER_EMAIL}', '', now(), now(), now())
    returning id;`)).id;
  await writeStaging(`
    insert into public.profiles (id, email, office_id) values ('${other}', '${OTHER_EMAIL}', '${other}')
    on conflict (id) do nothing;`);
  const authz = await one(`select exists(select 1 from public.authorized_users a join auth.users u on lower(u.email)=lower(a.email) where u.id='${U}' and a.active) as a,
                                  exists(select 1 from public.authorized_users where lower(email)='${OTHER_EMAIL}') as o;`);
  ok('0 המשתמש הקבוע מורשה והמשתמש השני לא (תנאי מקדים)', authz.a === true && authz.o === false, JSON.stringify(authz));

  // ─── 1 · PF6: שער המורשים ─────────────────────────────────────────────────
  {
    const gated = await writeStaging(`
      select tablename from pg_policies
       where schemaname = 'public' and policyname = 'require_authorized' and permissive = 'RESTRICTIVE'
         and tablename in ('additional_charges','tax_fact_changes','automation_jobs','automation_workers','journey_templates','office_journey_defaults')
       order by 1;`);
    ok('1 שש הטבלאות נושאות require_authorized (RESTRICTIVE)', gated.length === 6, gated.map(r => r.tablename).join(','));

    // שורות בבעלות המשתמש הלא-מורשה, בכל טבלה — כדי שהחסימה תיוחס לשער ולא ל"השורה שלך".
    const cOther = (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email)
      values (${uid()}, '${other}', 'זר', 'AUTHZ', 'delivered@resend.dev') returning id;`)).id;
    await writeStaging(`
      insert into public.additional_charges (id, user_id, client_id, description, amount)
      values ('authz-charge-1', '${other}', '${cOther}', 'AUTHZ', 100);
      insert into public.tax_fact_changes (id, user_id, client_id, field_key, label, new_value, source)
      values ('authz-fact-1', '${other}', '${cOther}', 'niBalance', 'AUTHZ', '1'::jsonb, 'import');
      insert into public.automation_jobs (id, user_id, client_id, action_type)
      values ('authz-job-1', '${other}', '${cOther}', 'shaam_fetch');
      insert into public.automation_workers (worker_id, user_id) values ('authz-worker-1', '${other}');
      insert into public.journey_templates (id, user_id, office_id, name) values ('authz-tpl-1', '${other}', '${other}', 'AUTHZ');
      insert into public.office_journey_defaults (id, office_id, client_kind) values ('authz-ojd-1', '${other}', 'exempt_dealer');`);

    const READS = [
      ['additional_charges', `select count(*)::int as n from public.additional_charges where id = 'authz-charge-1'`],
      ['tax_fact_changes', `select count(*)::int as n from public.tax_fact_changes where id = 'authz-fact-1'`],
      ['automation_jobs', `select count(*)::int as n from public.automation_jobs where id = 'authz-job-1'`],
      ['automation_workers', `select count(*)::int as n from public.automation_workers where worker_id = 'authz-worker-1'`],
      ['journey_templates', `select count(*)::int as n from public.journey_templates where id = 'authz-tpl-1'`],
      ['office_journey_defaults', `select count(*)::int as n from public.office_journey_defaults where id = 'authz-ojd-1'`],
    ];
    for (const [t, sql] of READS) {
      const r = await tryRun((s) => asUser(other, s), sql);
      ok(`1 לא-מורשה לא רואה את השורה שלו ב-${t}`, !r.denied && r.value?.[0]?.n === 0, r.message || `n=${r.value?.[0]?.n}`);
    }
    const WRITES = [
      ['additional_charges', `insert into public.additional_charges (id, user_id, client_id, description, amount) values ('authz-charge-2', '${other}', '${cOther}', 'AUTHZ', 1)`],
      ['journey_templates', `insert into public.journey_templates (id, user_id, office_id, name) values ('authz-tpl-2', '${other}', '${other}', 'AUTHZ')`],
      ['office_journey_defaults', `insert into public.office_journey_defaults (id, office_id, client_kind) values ('authz-ojd-2', '${other}', 'company')`],
    ];
    for (const [t, sql] of WRITES) {
      const r = await tryRun((s) => asUser(other, s), sql);
      ok(`1 לא-מורשה לא כותב ב-${t}`, r.denied, r.denied ? '' : 'הכתיבה עברה!');
    }

    // המורשה — הכול ממשיך לעבוד.
    const cMine = (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email)
      values (${uid()}, '${U}', 'שלי', 'AUTHZ', 'delivered@resend.dev') returning id;`)).id;
    await writeStaging(`
      insert into public.additional_charges (id, user_id, client_id, description, amount)
      values ('authz-charge-mine', '${U}', '${cMine}', 'AUTHZ', 100);
      insert into public.journey_templates (id, user_id, office_id, name) values ('authz-tpl-mine', '${U}', '${U}', 'AUTHZ');`);
    const mineRead = await tryRun((s) => asUser(U, s), `select count(*)::int as n from public.additional_charges where id = 'authz-charge-mine'`);
    ok('1 המורשה רואה את החיוב שלו', !mineRead.denied && mineRead.value?.[0]?.n === 1, mineRead.message || `n=${mineRead.value?.[0]?.n}`);
    const mineTpl = await tryRun((s) => asUser(U, s), `select count(*)::int as n from public.journey_templates where id = 'authz-tpl-mine'`);
    ok('1 המורשה רואה את תבנית המסע שלו', !mineTpl.denied && mineTpl.value?.[0]?.n === 1, mineTpl.message || `n=${mineTpl.value?.[0]?.n}`);
    const mineWrite = await tryRun((s) => asUser(U, s),
      `insert into public.office_journey_defaults (id, office_id, client_kind) values ('authz-ojd-mine', '${U}', 'tax_refund') on conflict (office_id, client_kind) do update set updated_at = now()`);
    ok('1 המורשה כותב בברירות המחדל של המשרד', !mineWrite.denied, mineWrite.message);
  }

  // ─── 2 · PF11: הצעה מבוטלת / פגה ─────────────────────────────────────────
  {
    const mk = async (key, status, extra = '') => (await one(`
      insert into public.quotations (id, user_id, quotation_number, status, public_token, items, vat_rate ${extra ? ', ' + extra.split('=')[0] : ''})
      values ('authz-${key}', '${U}', 'AUTHZ-${key}', '${status}', ${uid()},
              '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1,"clientPrice":1,"quantity":1,"vatFlag":true}]'::jsonb, 18
              ${extra ? ', ' + extra.split('=')[1] : ''})
      returning public_token;`)).public_token;

    // מבוטלת, עם בקשת ייצוג מקושרת — הטוקן שלה הוא הדלת לטופס הזיהוי.
    await writeStaging(`
      insert into public.representation_requests (id, user_id, client_name, status, onboarding_token, onboarding_status)
      values ('authz-rep-cancelled', '${U}', 'AUTHZ', 'pending_fill', 'authz-onb-cancelled', 'pending');`);
    const tCancelled = await mk('q-cancelled', 'cancelled', `representation_request_id='authz-rep-cancelled'`);
    const rc = (await asAnon(`select public.get_quotation(${q(tCancelled)}) as r`))[0].r;
    ok('2 מבוטלת: הסטטוס מדווח', rc?.status === 'cancelled', JSON.stringify(rc).slice(0, 160));
    ok('2 מבוטלת: בלי פריטים', Array.isArray(rc?.items) && rc.items.length === 0, JSON.stringify(rc?.items));
    ok('2 מבוטלת: בלי onboardingToken ובלי ייצוג', rc?.onboardingToken == null && rc?.representation == null && rc?.futureServices == null,
      JSON.stringify(rc).slice(0, 200));
    ok('2 מבוטלת: המיתוג נשאר (הדף מציג "בוטלה" במיתוג המשרד)', rc?.firm != null && typeof rc.firm === 'object');

    const tExpired = await mk('q-expired', 'sent', `expires_at=now() - interval '1 day'`);
    const re = (await asAnon(`select public.get_quotation(${q(tExpired)}) as r`))[0].r;
    ok('2 פגה (sent + expires_at בעבר): מדווחת expired', re?.status === 'expired', JSON.stringify(re).slice(0, 160));
    ok('2 פגה: בלי פריטים', Array.isArray(re?.items) && re.items.length === 0);

    // מאושרת שתוקפה עבר — אינה פגה (כלל 161), והטוקן שלה עדיין מוחזר.
    await writeStaging(`
      insert into public.representation_requests (id, user_id, client_name, status, onboarding_token, onboarding_status)
      values ('authz-rep-approved', '${U}', 'AUTHZ', 'pending_fill', 'authz-onb-approved', 'pending');`);
    const tApproved = await mk('q-approved', 'approved', `representation_request_id='authz-rep-approved'`);
    await writeStaging(`update public.quotations set expires_at = now() - interval '1 day' where id = 'authz-q-approved';`);
    const ra = (await asAnon(`select public.get_quotation(${q(tApproved)}) as r`))[0].r;
    ok('2 מאושרת שתאריך התוקף שלה עבר — עדיין approved, עם פריטים וטוקן',
      ra?.status === 'approved' && ra?.items?.length === 1 && ra?.onboardingToken === 'authz-onb-approved',
      JSON.stringify(ra).slice(0, 200));

    const tLive = await mk('q-live', 'sent', `expires_at=now() + interval '10 day'`);
    const rl = (await asAnon(`select public.get_quotation(${q(tLive)}) as r`))[0].r;
    ok('2 הצעה חיה — ממשיכה לחזור במלואה', rl?.status === 'sent' && rl?.items?.length === 1);
  }

  // ─── 3 · PF11: תפוגת טוקן הדף האישי, ומכתב שבוטל ─────────────────────────
  {
    const cExp = (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email, portal_token, portal_token_expires_at)
      values (${uid()}, '${U}', 'פג', 'AUTHZ', 'delivered@resend.dev', 'authz-portal-expired', now() - interval '1 hour')
      returning id;`)).id;
    await writeStaging(`
      insert into public.clients (id, user_id, first_name, last_name, email, portal_token, portal_token_expires_at)
      values (${uid()}, '${U}', 'חי', 'AUTHZ', 'delivered@resend.dev', 'authz-portal-live', now() + interval '1 day');`);
    const gcp = (await asAnon(`select public.get_client_portal('authz-portal-expired') as r`))[0].r;
    const uidExp = (await one(`select public.user_id_for_public_token('authz-portal-expired') as u`)).u;
    const uidLive = (await one(`select public.user_id_for_public_token('authz-portal-live') as u`)).u;
    ok('3 טוקן דף אישי שפג: get_client_portal דוחה', gcp?.ok === false, JSON.stringify(gcp));
    ok('3 טוקן דף אישי שפג: user_id_for_public_token אינה מזהה (אותו כלל)', uidExp == null, `החזיר ${uidExp}`);
    ok('3 טוקן דף אישי חי: user_id_for_public_token מזהה', uidLive === U, `החזיר ${uidLive}`);
    void cExp;
  }

  // ─── 4 · PF3: הגשה חוזרת של טופס הזיהוי ──────────────────────────────────
  {
    const cid = (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email, representation_status)
      values (${uid()}, '${U}', 'ממתין', 'AUTHZ', 'delivered@resend.dev', 'pending_fill') returning id;`)).id;
    await writeStaging(`
      insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email, authorities,
                                                  status, onboarding_token, onboarding_status, signers)
      values ('authz-rep-fill', '${U}', '${cid}', 'ממתין AUTHZ', 'delivered@resend.dev', '{incomeTax}',
              'pending_fill', 'authz-onb-fill', 'pending',
              '[{"id":"client","role":"client","signStatus":"pending","signToken":"authz-sign-1"}]'::jsonb);`);
    const call = (first, idn) => `select public.submit_onboarding_full('authz-onb-fill', ${q(first)}, 'AUTHZ', ${q(idn)}, '1990-01-01',
      'passport', 'P1', '050-0000000', 'delivered@resend.dev', 'תל אביב', 'רחוב 1', 'married', 2015,
      'בת זוג AUTHZ', null, '000000018', 'בת', 'זוג AUTHZ', 1991) as r`;
    const first = (await asAnon(call('ראשון', '000000000')))[0].r;
    ok('4 הגשה ראשונה מתקבלת', first === true, String(first));
    const s1 = await one(`select status, onboarding_status, identification, signers, client_name from public.representation_requests where id = 'authz-rep-fill'`);
    ok('4 אחרי ההגשה: submitted / awaiting_accountant', s1.onboarding_status === 'submitted' && s1.status === 'awaiting_accountant',
      `${s1.onboarding_status}/${s1.status}`);
    // המשרד מתקדם: מדמים חתימה של הלקוח (החותם signed) ומעבר ל-awaiting_stamp — כפי שקורה בפועל.
    await writeStaging(`
      update public.representation_requests
         set signers = jsonb_set(signers, '{0,signStatus}', '"signed"'), status = 'awaiting_stamp'
       where id = 'authz-rep-fill';`);
    const before = await one(`select status, onboarding_status, identification, signers, client_name from public.representation_requests where id = 'authz-rep-fill'`);
    const replay = (await asAnon(call('מתחזה', '999999999')))[0].r;
    ok('4 הגשה חוזרת נדחית', replay === false, String(replay));
    const after = await one(`select status, onboarding_status, identification, signers, client_name from public.representation_requests where id = 'authz-rep-fill'`);
    ok('4 הזהות לא נדרסה', after.identification?.firstName === 'ראשון' && after.identification?.idNumber === '000000000',
      JSON.stringify(after.identification).slice(0, 120));
    ok('4 הסטטוס לא חזר אחורה', after.status === before.status && after.onboarding_status === 'submitted', `${after.status}/${after.onboarding_status}`);
    ok('4 החותמים לא נבנו מחדש', JSON.stringify(after.signers) === JSON.stringify(before.signers), JSON.stringify(after.signers).slice(0, 120));
    ok('4 שם הלקוח בבקשה לא השתנה', after.client_name === before.client_name, after.client_name);
    const cli = await one(`select first_name, id_number from public.clients where id = '${cid}'`);
    ok('4 הכרטיס לא נדרס', cli.first_name === 'ראשון' && cli.id_number === '000000000', JSON.stringify(cli));
  }

  // ─── 5 · JF26/PF17: מכתב השחרור ──────────────────────────────────────────
  {
    const signExists = (await one(`select exists(select 1 from pg_proc where proname = 'release_portal_sign' and pronamespace = 'public'::regnamespace) as e`)).e;
    ok('5 release_portal_sign נמחקה', signExists === false);

    const cid = (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email, prev_accountant_name)
      values (${uid()}, '${U}', 'שחרור', 'AUTHZ', 'delivered@resend.dev', 'רו"ח קודם') returning id;`)).id;
    const mkStep = async (type, status, payload) => (await one(`
      insert into public.onboarding_steps (id, user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
      values (${uid()}, '${U}', '${cid}', '${type}', 'custom', 'person', '${status}', 'client', now(), ${q(JSON.stringify(payload))}::jsonb)
      returning id;`)).id;
    await mkStep('materials_received', 'pending', { checklist: [{ key: 'last_return', label: 'דוח אחרון' }] });
    await mkStep('release_letter', 'cancelled', { releaseToken: 'authz-rel-cancelled', releaseSentAt: '2026-01-01' });
    await mkStep('release_letter', 'waiting_client', { releaseToken: 'authz-rel-live', releaseSentAt: '2026-01-01' });

    const dead = 'authz-rel-cancelled', live = 'authz-rel-live';
    const DOORS = [
      ['get_release_portal', (t) => `select public.get_release_portal(${q(t)}) as r`],
      ['release_portal_set_item', (t) => `select public.release_portal_set_item(${q(t)}, 'last_return', true) as r`],
      ['release_portal_mark_items', (t) => `select public.release_portal_mark_items(${q(t)}, '["last_return"]'::jsonb) as r`],
      ['release_portal_respond', (t) => `select public.release_portal_respond(${q(t)}, 'הערה', 'שם') as r`],
      ['release_portal_remove_upload', (t) => `select public.release_portal_remove_upload(${q(t)}, 'no-such-doc') as r`],
    ];
    for (const [name, sql] of DOORS) {
      const r = (await asAnon(sql(dead)))[0].r;
      ok(`5 מכתב שבוטל: ${name} דוחה כטוקן לא תקין`, r?.ok === false && r?.error === 'invalid', JSON.stringify(r).slice(0, 120));
    }
    const liveGet = (await asAnon(DOORS[0][1](live)))[0].r;
    ok('5 מכתב חי: get_release_portal עובד', liveGet?.ok === true && liveGet?.materialsTotal === 1, JSON.stringify(liveGet).slice(0, 160));
    const liveMark = (await asAnon(DOORS[2][1](live)))[0].r;
    ok('5 מכתב חי: release_portal_mark_items עובד', liveMark?.ok === true && liveMark?.marked === 1, JSON.stringify(liveMark));
    const liveUnmark = (await asAnon(DOORS[1][1](live).replace(', true)', ', false)')))[0].r;
    ok('5 מכתב חי: release_portal_set_item מבטל סימון שהוא סימן', liveUnmark?.ok === true && liveUnmark?.done === false, JSON.stringify(liveUnmark));
    const uidDead = (await one(`select public.user_id_for_public_token(${q(dead)}) as u`)).u;
    const uidLive = (await one(`select public.user_id_for_public_token(${q(live)}) as u`)).u;
    ok('5 user_id_for_public_token: מבוטל אינו מזהה, חי כן', uidDead == null && uidLive === U, `${uidDead} / ${uidLive}`);
    // ‼ מכתב שבוטל אינו יכול "להיסגר בהצלחה" מהדף — אין יותר דלת שמשלימה אותו.
    const st = await one(`select status from public.onboarding_steps where client_id = '${cid}' and step_type = 'release_letter' and payload->>'releaseToken' = ${q(dead)}`);
    ok('5 המכתב המבוטל נשאר מבוטל', st.status === 'cancelled', st.status);
  }

  // ─── 6 · H1: הצמדה לפי מייל — רק כשחד-משמעי ──────────────────────────────
  {
    const DUP = 'authz-dup@test.local', ONE = 'authz-one@test.local';
    const mkClient = async (first, email, rep) => (await one(`
      insert into public.clients (id, user_id, first_name, last_name, email, representation_request_id, representation_status, authority_representations)
      values (${uid()}, '${U}', ${q(first)}, 'AUTHZ', ${q(email)}, ${q(rep)}, 'active', '{"incomeTax":{"status":"active"}}'::jsonb)
      returning id;`)).id;
    const mkRep = (id, cid) => writeStaging(`
      insert into public.representation_requests (id, user_id, linked_client_id, client_name, status, authorities, onboarding_token, onboarding_status)
      values (${q(id)}, '${U}', ${q(cid)}, 'AUTHZ', 'active', '{incomeTax}', ${q('authz-onb-' + id)}, 'submitted');`);
    const dupA = await mkClient('כפול-א', DUP, 'authz-rep-dup-a');
    const dupB = await mkClient('כפול-ב', DUP, 'authz-rep-dup-b');
    await mkRep('authz-rep-dup-a', dupA);
    await mkRep('authz-rep-dup-b', dupB);
    const single = await mkClient('יחיד', ONE, 'authz-rep-one');
    await mkRep('authz-rep-one', single);

    const mkQuote = (key, email) => writeStaging(`
      insert into public.quotations (id, user_id, quotation_number, status, public_token, items, vat_rate, representation, approved_at)
      values ('authz-${key}', '${U}', 'AUTHZ-${key}', 'approved', ${uid()}, '[]'::jsonb, 18,
              ${q(JSON.stringify({ enabled: true, areas: { vat: { status: 'requested' } }, prefill: { firstName: 'הצעה', lastName: 'AUTHZ', email } }))}::jsonb,
              now());`);

    await mkQuote('h1-dup', DUP);
    const repDup = (await one(`select public.open_quotation_representation('authz-h1-dup') as r`)).r;
    const qDup = await one(`select client_id, events from public.quotations where id = 'authz-h1-dup'`);
    ok('6 שני כרטיסים עם אותו מייל: נפתח כרטיס חדש, לא הוצמד לאחד מהם',
      qDup.client_id && qDup.client_id !== dupA && qDup.client_id !== dupB, `client_id=${qDup.client_id}`);
    ok('6 …ונפתחה בקשת ייצוג חדשה', repDup && repDup !== 'authz-rep-dup-a' && repDup !== 'authz-rep-dup-b', String(repDup));
    const amb = (qDup.events || []).find(e => e.type === 'client_match_ambiguous');
    ok('6 …והעמימות נרשמה באירועי ההצעה', !!amb && /2 /.test(amb.note || ''), JSON.stringify(amb));
    const untouched = await one(`select count(*)::int as n from public.clients where id in ('${dupA}','${dupB}') and authority_representations ? 'vat'`);
    ok('6 הכרטיסים הכפולים לא נגעו (לא קיבלו מע"מ)', untouched.n === 0, `n=${untouched.n}`);

    await mkQuote('h1-one', ONE);
    const repOne = (await one(`select public.open_quotation_representation('authz-h1-one') as r`)).r;
    const qOne = await one(`select client_id, events from public.quotations where id = 'authz-h1-one'`);
    ok('6 כרטיס יחיד עם אותו מייל: ההצעה נצמדת אליו', qOne.client_id === single && repOne === 'authz-rep-one',
      `client_id=${qOne.client_id} rep=${repOne}`);
    ok('6 …בלי אירוע עמימות', !(qOne.events || []).some(e => e.type === 'client_match_ambiguous'));
    const singleAuth = await one(`select authority_representations ? 'vat' as v from public.clients where id = '${single}'`);
    ok('6 …והרשות החדשה נוספה לכרטיס היחיד', singleAuth.v === true);

    // converted_client_id של הליד קודם למייל, גם כשהמייל כפול.
    await writeStaging(`
      insert into public.leads (id, user_id, full_name, email, status, converted_client_id)
      values ('authz-lead-conv', '${U}', 'ליד AUTHZ', ${q(DUP)}, 'converted', '${dupB}');
      insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, vat_rate, representation, approved_at)
      values ('authz-h1-lead', '${U}', 'authz-lead-conv', 'AUTHZ-h1-lead', 'approved', ${uid()}, '[]'::jsonb, 18,
              ${q(JSON.stringify({ enabled: true, areas: { withholding: { status: 'requested' } }, prefill: { email: DUP } }))}::jsonb, now());`);
    const repLead = (await one(`select public.open_quotation_representation('authz-h1-lead') as r`)).r;
    const qLead = await one(`select client_id from public.quotations where id = 'authz-h1-lead'`);
    ok('6 הליד כבר הומר לכרטיס: מצמידים אליו ולא מנחשים לפי מייל', qLead.client_id === dupB && repLead === 'authz-rep-dup-b',
      `client_id=${qLead.client_id} rep=${repLead}`);
  }

  const inv = await tryRun((s) => asUser(U, s), 'select public.assert_domain_function_invariants() as r');
  ok('7 שומר הקבועים של פונקציות הדומיין מאשר', !inv.denied && inv.value?.[0]?.r === 'ok', inv.message || JSON.stringify(inv.value));

} catch (e) {
  fail++;
  console.error('✋ הבדיקה נפלה באמצע:', e?.message || e);
} finally {
  await cleanup();
  console.log(`\n${pass} עברו · ${fail} נכשלו`);
  process.exit(fail === 0 ? 0 : 1);
}

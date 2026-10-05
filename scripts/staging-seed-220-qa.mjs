#!/usr/bin/env node
/**
 * staging-seed-220-qa.mjs — לקוחות בדיקה לבדיקה בדפדפן של 220 על staging (ושמירה אחרי רענון).
 *
 *   node scripts/staging-seed-220-qa.mjs          יוצר (או יוצר מחדש) את שני לקוחות QA220
 *   node scripts/staging-seed-220-qa.mjs --clean  מוחק אותם ואת כל מה שנוצר עליהם
 *
 * ‼ staging בלבד (staging-lib חוסם פרודקשן). השמות מסומנים QA220. שום מייל לא נשלח מכאן;
 *   הודעות למשרד שנכנסות לתור בזמן הבדיקה נמחקות ב---clean.
 *   1. «אילן QA220» — כמו אילן (אנונימי): ההרשמה סומנה בידי המשרד, «פרטי העסק» פתוחה, ההקמה
 *      1/5, תשלום נעול, העברה מרו״ח קודם, מסמכים שהושלמו. סוג עוסק פטור + סיווג מע״מ מורשה.
 *   2. «נועה QA220» — דף אישי (טוקן קבוע) עם הרשמה פתוחה ו«פרטי העסק» שנפתחה איתה.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, sql } from './staging-lib.mjs';

const UID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const ILAN = 'qa220ilan', NOA = 'qa220noa', E1 = 'qa220ilan-eng', E2 = 'qa220noa-eng';
export const NOA_TOKEN = 'qa220-noa-portal-token';
const ids = `('${ILAN}', '${NOA}')`;

async function clean() {
  await sql(STAGING_REF, `
    delete from public.accountant_notifications where client_id in ${ids};
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in ${ids})
       or engagement_id in ('${E1}', '${E2}');
    delete from public.tax_fact_changes where client_id in ${ids};
    delete from public.clients where id in ${ids};`);
}

if (process.argv.includes('--clean')) {
  await clean();
  const left = await sql(STAGING_REF, `select count(*)::int n from public.clients where id in ${ids}`);
  console.log(`נמחק · נשארו ${left[0].n} לקוחות QA220`);
  process.exit(0);
}

await clean();
await sql(STAGING_REF, `
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, vat_status,
                              id_number, business_name, portal_token)
  values ('${ILAN}', '${UID}', 'אילן', 'QA220', 'delivered@resend.dev', 'onboarding', 'single', 'exempt', 'authorizedDealer',
          '000000018', null, 'qa220-ilan-portal-token'),
         ('${NOA}', '${UID}', 'נועה', 'QA220', 'delivered@resend.dev', 'onboarding', 'single', 'exempt', 'exemptDealer',
          null, 'סטודיו נועה', '${NOA_TOKEN}');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values ('${E1}', '${UID}', '${ILAN}', 'onboarding', now() - interval '60 days'),
         ('${E2}', '${UID}', '${NOA}', 'onboarding', now());
  -- אילן: הרשמה שהמשרד סימן (נכנסת סגורה ⇒ הטריגר לא פותח «פרטי העסק» — פותחים ידנית, כמו לקוח קיים)
  insert into public.onboarding_steps (id, user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload,
                                       published_at, completion_method, completed_at, sort_order, created_at)
  values
   ('qa220ilan-inv', '${UID}', '${E1}', '${ILAN}', 'paperless_invite', 'tools', 'person', 'completed', 'me',
    '{"paperlessStatus":"none","dataSource":"none","clientTitle":"הרשמה לפייפרלס"}', now() - interval '60 days', 'manual', now() - interval '2 hours', 10, now() - interval '60 days'),
   ('qa220ilan-bd', '${UID}', '${E1}', '${ILAN}', 'business_details', 'tools', 'person', 'pending', 'client',
    '{"clientTitle":"פרטי העסק","clientSub":"שם העסק ושאלה קצרה על עבודה מהבית"}', now() - interval '1 hour', 'manual', null, 11, now() - interval '59 days'),
   ('qa220ilan-con', '${UID}', '${E1}', '${ILAN}', 'paperless_connection', 'tools', 'person', 'pending', 'me',
    '{"paperlessStatus":"none","checklist":[{"key":"id_number","label":"הזנת מספר הזהות של הלקוח בפייפרלס","done":true}]}', now() - interval '60 days', 'manual', null, 12, now() - interval '58 days'),
   ('qa220ilan-ret', '${UID}', '${E1}', '${ILAN}', 'retainer_authorization', 'payment', 'engagement', 'locked', 'me',
    '{"amount":350}', now() - interval '60 days', 'manual', null, 13, now() - interval '57 days'),
   ('qa220ilan-prev', '${UID}', '${E1}', '${ILAN}', 'prev_accountant_details', 'prev_accountant', 'person', 'completed', 'client',
    '{}', now() - interval '60 days', 'manual', now() - interval '50 days', 20, now() - interval '56 days'),
   ('qa220ilan-docs', '${UID}', '${E1}', '${ILAN}', 'client_documents', 'tools', 'person', 'completed', 'client',
    '{"checklist":[{"key":"id","label":"צילום תעודת זהות","done":true}]}', now() - interval '60 days', 'manual', now() - interval '30 days', 30, now() - interval '55 days');
  update public.onboarding_steps set depends_on_step_id = 'qa220ilan-inv' where id = 'qa220ilan-con';
  update public.onboarding_steps set depends_on_step_id = 'qa220ilan-con' where id = 'qa220ilan-ret';
  -- נועה: הרשמה פתוחה ⇒ הטריגר פותח לה «פרטי העסק»
  insert into public.onboarding_steps (id, user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, sort_order)
  values ('qa220noa-inv', '${UID}', '${E2}', '${NOA}', 'paperless_invite', 'tools', 'person', 'pending', 'client',
          '{"paperlessStatus":"none","clientTitle":"הרשמה לפייפרלס"}', now(), 10),
         ('qa220noa-con', '${UID}', '${E2}', '${NOA}', 'paperless_connection', 'tools', 'person', 'locked', 'me', '{}', now(), 12);
  update public.onboarding_steps set depends_on_step_id = 'qa220noa-inv' where id = 'qa220noa-con';`);
const check = await sql(STAGING_REF, `select client_id, step_type, status, ball from public.onboarding_steps where client_id in ${ids} order by client_id, sort_order`);
console.log(JSON.stringify(check));
console.log(`נוצר · אילן=${ILAN} · נועה=${NOA} (דף: ?portal=${NOA_TOKEN})`);

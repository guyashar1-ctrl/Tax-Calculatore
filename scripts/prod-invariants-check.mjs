#!/usr/bin/env node
/**
 * prod-invariants-check.mjs — בדיקה שקטה של כללים חוצי-מסכים בנתונים החיים (קריאה בלבד).
 *
 * ‼ למה (21.10.2026, ליאת ואוריה): שינוי בקוד (269) שבר כלל שחי בקובץ אחר (218: מי חותם/ת
 *   ב«בן זוג רשום»), והטעות נראתה רק בעין, בטופס של לקוחה אמיתית. בדיקה כזאת הייתה מראה
 *   את זה תוך דקות. כל בדיקה כאן = כלל מ-docs/INVARIANTS.md, עם המזהה שלו.
 * ‼ קריאה בלבד: רק SELECT, דרך readProd (staging-lib). שום כתיבה, שום מייל, שום רשות.
 *
 *   שימוש:  node scripts/prod-invariants-check.mjs            (ייצור)
 *           node scripts/prod-invariants-check.mjs --staging  (סביבת הבדיקות)
 *   יציאה 1 = נמצאה הפרה (או שהבדיקה עצמה נכשלה). רץ גם בבדיקה שלפני push (pre-push-check).
 */
import { readProd, sql, STAGING_REF, PROD_REF } from './staging-lib.mjs';

const staging = process.argv.includes('--staging');
const q = (query) => (staging ? sql(STAGING_REF, query) : readProd(query));

// ‼ ידועות ומוכרות לפני 21.10.2026 — לא חוסמות; שם חדש ברשימה כן חוסם.
const KNOWN_ANON_LEGACY = ['portal_tax_estimate', 'portal_note_tax_evidence_parts', 'portal_submit_tax_info',
  'portal_tax_info', 'portal_save_tax_info_draft', 'intake_replaced_state'];

const CHECKS = [
  {
    id: 'INV-REP-02',
    title: 'בטופס של זוג: ב«חתימת בן זוג רשום» חותם/ת הרשום/ה',
    sql: `
      select r.id as request, r.client_name, d ->> 'key' as submission,
             (select x ->> 'signerId' from jsonb_array_elements(d -> 'fields') x
               where x ->> 'kind' = 'signature' and (x ->> 'xPct')::numeric between 0.39 and 0.40 limit 1) as in_slot,
             public._rep_registered_signer(r.id, d ->> 'key') as should_be
        from public.representation_requests r
        join public.clients c on c.id = r.linked_client_id,
             jsonb_array_elements(case when jsonb_typeof(r.signature_documents) = 'array' then r.signature_documents else '[]'::jsonb end) d
       where r.status in ('awaiting_accountant', 'pending_signature', 'awaiting_stamp')
         and coalesce(c.family_status, '') = 'married'
         and (r.execution #> array['shaam', d ->> 'key', 'requestedSystems']) ? 'מס הכנסה'
         and (select count(*) from jsonb_array_elements(d -> 'fields') x where x ->> 'kind' = 'signature') = 2
         and (select x ->> 'signerId' from jsonb_array_elements(d -> 'fields') x
               where x ->> 'kind' = 'signature' and (x ->> 'xPct')::numeric between 0.39 and 0.40 limit 1)
             is distinct from public._rep_registered_signer(r.id, d ->> 'key')`,
  },
  {
    id: 'INV-REP-03',
    title: 'מס הכנסה בבקשה אחת בלבד בשע״ם לכל בקשת ייצוג',
    sql: `
      select r.id as request, r.client_name, count(*) as requests_with_income_tax
        from public.representation_requests r,
             jsonb_each(case when jsonb_typeof(r.execution -> 'shaam') = 'object' then r.execution -> 'shaam' else '{}'::jsonb end) e(k, v)
       where (v -> 'requestedSystems') ? 'מס הכנסה' and not (v ? 'replacement')
       group by r.id, r.client_name having count(*) > 1`,
  },
  {
    id: 'INV-AUTO-01',
    title: '«המשך» לא תקוע: ממתין לקודמת שכבר הסתיימה (לא מ«ממתין לך») יותר מ-10 דקות',
    sql: `
      select f.id as followup, f.client_id, f.action_type, j.status as previous_status, j.updated_at
        from public.automation_job_followups f
        join public.automation_jobs j on j.id = f.after_job_id
       where f.status = 'waiting' and j.status in ('succeeded', 'failed')
         and j.updated_at < now() - interval '10 minutes'`,
  },
  {
    id: 'INV-AUTO-02',
    title: 'לא שתי משימות הזנה לאותו אדם שהצליחו באותו יום (שליחה כפולה)',
    sql: `
      select client_id, action_type, coalesce(input ->> 'submissionKey', input ->> 'role') as who, count(*) as succeeded_today
        from public.automation_jobs
       where action_type in ('shaam.create_representation', 'btl.create_representation')
         and status = 'succeeded' and created_at > now() - interval '1 day'
         and coalesce(result ->> 'reconciled', 'false') <> 'true'
       group by 1, 2, 3 having count(*) > 1`,
  },
  {
    id: 'INV-SEC-01',
    title: 'אין פונקציה חדשה פתוחה ל-anon מחוץ לרשימה (מעבר למוכרות מלפני 21.10)',
    run: async () => {
      try {
        await q('select public.assert_domain_function_invariants()');
        return [];
      } catch (e) {
        const m = /מחוץ לרשימה: ([^"\\\n]+)/.exec(String(e.message));
        if (!m) return [{ error: String(e.message).slice(0, 300) }];
        const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
        return names.filter(n => !KNOWN_ANON_LEGACY.includes(n)).map(n => ({ function: n }));
      }
    },
  },
];

let failed = 0;
console.log(`בדיקת כללים חיים · ${staging ? `staging (${STAGING_REF})` : `ייצור (${PROD_REF})`} · קריאה בלבד\n`);
for (const c of CHECKS) {
  let rows;
  try {
    rows = c.run ? await c.run() : await q(c.sql);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${c.id} · ${c.title} — הבדיקה עצמה נכשלה: ${String(e.message).slice(0, 200)}`);
    continue;
  }
  if (!rows || rows.length === 0) { console.log(`  ✓ ${c.id} · ${c.title}`); continue; }
  failed++;
  console.log(`  ✗ ${c.id} · ${c.title} — ${rows.length} הפרות:`);
  for (const r of rows.slice(0, 10)) console.log(`      ${JSON.stringify(r)}`);
}
console.log(failed ? `\n${failed} כללים מופרים — לבדוק לפני שממשיכים.` : '\nהכול תקין.');
process.exitCode = failed ? 1 : 0;

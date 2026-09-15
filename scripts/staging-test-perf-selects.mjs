// ─── אשכול G: השאילתות הרזות מתקבלות ב-PostgREST ───────────────────────────
// קריאה בלבד — לא יוצר ולא מוחק דבר. מוודא שרשימות העמודות המפורשות
// (useEmailMessages, useRepresentationRequests במצב lean, annualReport/repository)
// ומסנן ה-or של המיילים לא מפילים את השאילתה על עמודה לא קיימת.
// הרצה: node scripts/staging-test-perf-selects.mjs (מהשורש, עם .env.staging)

import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './staging-lib.mjs';

const env = loadEnv('.env.staging');
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const { data: s, error: signErr } = await anon.auth.signInWithPassword({
  email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (signErr || !s?.session) { console.error('✋ כניסה נכשלה:', signErr?.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

// ‼ אותן רשימות כמו בקוד — אם משנים שם, לעדכן בשני המקומות.
const EMAIL_LIST_COLUMNS = [
  'id', 'user_id', 'client_id', 'request_id', 'resend_id', 'to_email', 'subject', 'kind',
  'status', 'error', 'sent_at', 'delivered_at', 'opened_at', 'clicked_at', 'meta',
  'created_at', 'updated_at', 'idempotency_key', 'step_id',
].join(',');
const REP_LEAN_COLUMNS = [
  'id', 'user_id', 'linked_client_id', 'client_name', 'client_email', 'authorities',
  'requested_docs', 'notes', 'status', 'submission', 'submitted_at', 'part_b',
  'signed_pdf_path', 'ocr_extracted', 'created_at', 'updated_at', 'onboarding_token',
  'onboarding_status', 'identification', 'onboarding_submitted_at', 'signers',
  'signature_setup', 'prefill', 'execution', 'scope', 'identity_docs',
  'signature_documents', 'spouse_onboarding_token',
].join(',');
const SESSION_COLUMNS = 'id,user_id,client_id,tax_year,status,model,current_question_id,created_at,updated_at,completed_at';
const SESSION_LIST_COLUMNS = 'id,user_id,client_id,tax_year,status,current_question_id,created_at,updated_at,completed_at';

try {
  {
    const r = await user.from('email_messages').select(EMAIL_LIST_COLUMNS)
      .order('sent_at', { ascending: false }).limit(5);
    ok('email_messages: רשימת העמודות הרזה מתקבלת', !r.error, r.error?.message);
    ok('email_messages: html לא נכלל', !r.error && (r.data ?? []).every(m => !('html' in m)));
  }
  {
    const r = await user.from('email_messages').select(EMAIL_LIST_COLUMNS)
      .or('client_id.is.null,client_id.eq.some-client,request_id.eq.some-request')
      .order('sent_at', { ascending: false }).limit(5);
    ok('email_messages: מסנן or (לקוח + בקשה + ללא שיוך) מתקבל', !r.error, r.error?.message);
  }
  {
    const r = await user.from('email_messages').select('html').limit(1).maybeSingle();
    ok('email_messages: fetchEmailHtml — select(html) לפי דרישה מתקבל', !r.error, r.error?.message);
  }
  {
    const r = await user.from('representation_requests').select(REP_LEAN_COLUMNS)
      .order('created_at', { ascending: true }).limit(5);
    ok('representation_requests: רשימת lean מתקבלת', !r.error, r.error?.message);
    ok('representation_requests: signature_values לא נכלל', !r.error && (r.data ?? []).every(m => !('signature_values' in m)));
  }
  {
    const a = await user.from('annual_report_sessions').select(SESSION_LIST_COLUMNS).limit(5);
    ok('annual_report_sessions: רשימה משרדית בלי model מתקבלת', !a.error, a.error?.message);
    const b = await user.from('annual_report_sessions').select(SESSION_COLUMNS).limit(5);
    ok('annual_report_sessions: רשימת לקוח עם model מתקבלת', !b.error, b.error?.message);
  }
} finally {
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
}

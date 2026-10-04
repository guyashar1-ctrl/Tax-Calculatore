#!/usr/bin/env node
/**
 * staging-seed-flows-demo.mjs — נתוני הדגמה למסלולים ב-staging (לא לבדיקות אוטומטיות).
 * יוצר (או מנקה עם --clean) לקוחות QAFLOW:
 *   · «נועה QAFLOW» — הצעה שאושרה דרך המסלול האמיתי (approve_quotation כ-anon) ⇒ ריצת קליטה.
 *   · «דוד QAFLOW» — נשוי לרונית, לקוח פעיל, עם מסלול ידני «מסמכים לדוח השנתי» בשני שלבים.
 * ‼ staging בלבד (staging-lib חוסם ייצור). כל המיילים delivered@resend.dev. שום מייל לא נשלח כאן.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, loadEnv, writeStaging as sqlq, assertTriggersEnabled } from './staging-lib.mjs';

await assertTriggersEnabled();
const env = loadEnv('.env.staging');
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const q = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const one = async (s) => (await sqlq(s))[0];
const LAST = 'QAFLOW';

async function clean() {
  await sqlq(`
    delete from public.email_messages where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.client_notices where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (select id from public.clients where last_name = '${LAST}'));
    delete from public.onboarding_events where engagement_id in (select id from public.engagements where client_id in (select id from public.clients where last_name = '${LAST}'));
    delete from public.flow_runs where client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.representation_requests where linked_client_id in (select id from public.clients where last_name = '${LAST}');
    delete from public.quotations where id like 'qaflow-%';
    delete from public.leads where id like 'qaflow-lead-%';
    delete from public.clients where last_name = '${LAST}';
    delete from public.office_flow_versions where flow_id in (select id from public.office_flows where name like 'QAFLOW %' or seed_key = 'qaflow');
    delete from public.office_flows where seed_key = 'qaflow';
    delete from public.journey_templates where description = 'QAFLOW';`);
}
if (process.argv.includes('--clean')) { await clean(); console.log('נוקה.'); process.exit(0); }
await clean();

const login = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);
const { data: s, error } = await login.auth.signInWithPassword({ email: env.VITE_DEV_USER_EMAIL, password: env.VITE_DEV_USER_PASSWORD });
if (error) { console.error('✋ כניסה למשתמש הבדיקות נכשלה — עוצרים:', error.message); process.exit(1); }
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } });
const pure = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, opts);

// ── 1 · נועה: הצעה שאושרה ⇒ מסלול הקליטה ─────────────────────────────────
const token = randomBytes(16).toString('hex');
const items = [{ id: 'i1', serviceId: 's1', name: 'הנהלת חשבונות', category: 'monthly', billingType: 'monthly',
  catalogPrice: 1200, clientPrice: 1200, quantity: 1, vatFlag: true }];
await sqlq(`insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qaflow-lead-1', '${USER_ID}', 'נועה QAFLOW', 'delivered@resend.dev', '050-7000001', 'new', true);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values ('qaflow-1', '${USER_ID}', 'qaflow-lead-1', 'QAFLOW-1', 'sent', ${q(token)}, ${q(JSON.stringify(items))}::jsonb,
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"נועה","lastName":"QAFLOW","email":"delivered@resend.dev","phone":"050-7000001"}}'::jsonb, 18, now());`);
const { data: ens } = await user.rpc('ensure_client_for_quotation', { p_quotation_id: 'qaflow-1' });
if (ens?.ok === false) throw new Error('ensure_client: ' + JSON.stringify(ens));
const noa = (await one(`select client_id from public.quotations where id = 'qaflow-1'`)).client_id;
await sqlq(`update public.clients set last_name = '${LAST}', first_name = 'נועה', dealer_type = 'licensed', email = 'delivered@resend.dev' where id = ${q(noa)}`);
const { error: apErr } = await pure.rpc('approve_quotation', { p_token: token, p_signature: null, p_signer_name: 'נועה QAFLOW' });
if (apErr) throw new Error('approve: ' + apErr.message);
const run1 = await one(`select id, status, (select count(*)::int from public.onboarding_steps where flow_run_id = fr.id) n from public.flow_runs fr where client_id = ${q(noa)}`);
console.log('נועה:', noa, 'ריצת קליטה', run1);

// ── 2 · דוד: לקוח פעיל, נשוי, מסלול ידני בשני שלבים ───────────────────────
const office = (await one(`select office_id from public.profiles where id = '${USER_ID}'`)).office_id;
const tpl = async (name, payload) => (await one(`insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values ('${USER_ID}', '${office}', 'request', ${q(name)}, 'QAFLOW',
          ${q(JSON.stringify([{ key: 'e1', stepType: 'custom_request', owner: 'client', requiredForClose: true, payload }]))}::jsonb) returning id`)).id;
const tDocs = await tpl('מסמכים לדוח השנתי', { title: 'מסמכים לדוח השנתי', clientTitle: 'מסמכים לדוח השנתי', clientSub: 'טופסי 106, אישורי הפקדה, קבלות',
  requirements: [{ key: 'f106', kind: 'file', label: 'טופסי 106', done: false, required: true },
                 { key: 'pension', kind: 'file', label: 'אישורי הפקדה לפנסיה', done: false, required: true }] });
const tSign = await tpl('אישור הדוח לפני הגשה', { title: 'אישור הדוח לפני הגשה', clientTitle: 'לעבור על הדוח ולאשר',
  requirements: [{ key: 'ok', kind: 'confirm', label: 'עברתי על הדוח ואני מאשר/ת', done: false, required: true }] });
const def = {
  stages: [
    { key: 'collect', name: 'איסוף', opens: { after: 'start' }, delivery: 'approve', reminder: { afterDays: 7, max: 2 }, notifyOffice: true,
      items: [{ key: 'docs', ref: { kind: 'template', templateId: tDocs }, perPerson: true }] },
    { key: 'approve', name: 'אישור הלקוח', opens: { after: 'stage', stage: 'collect' }, delivery: 'auto', reminder: { afterDays: 3, max: 2 }, notifyOffice: true,
      items: [{ key: 'sign', ref: { kind: 'template', templateId: tSign } }] },
  ],
};
const { data: cf } = await user.rpc('create_office_flow', { p_name: 'דוח שנתי (QAFLOW)', p_trigger: 'annual', p_definition: def });
if (!cf?.ok) throw new Error('create_office_flow: ' + JSON.stringify(cf));
await sqlq(`update public.office_flows set seed_key = 'qaflow' where id = ${q(cf.flowId)}`);
const david = (await one(`insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, spouse_first_name, spouse_last_name, dealer_type)
  values (replace(gen_random_uuid()::text,'-',''), '${USER_ID}', 'דוד', '${LAST}', 'delivered@resend.dev', 'active', 'married', 'רונית', '${LAST}', 'licensed') returning id`)).id;
const { data: st } = await user.rpc('start_flow_run', { p_client_id: david, p_flow_id: cf.flowId, p_cycle_key: '2026', p_allow_auto_actions: false });
console.log('דוד:', david, 'מסלול שנתי', st);

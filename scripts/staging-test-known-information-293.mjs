// Staging-only contract/security test. No production write path.
// STAGING_ENV_DIR=... node scripts/staging-test-known-information-293.mjs [--apply]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeStaging, readProd } from './staging-lib.mjs';
import { prepare } from './e2e/staging-session.mjs';

const backup = resolve('../known-information-evidence');
mkdirSync(backup, { recursive: true });
if (process.argv.includes('--apply')) {
  for (const [name, query] of [['staging', writeStaging], ['production', readProd]]) {
    const rows = await query("select pg_get_functiondef('public._tax_info_view(text,text)'::regprocedure) as def");
    const path = resolve(backup, `${name}-tax-info-view-before.sql`);
    if (!existsSync(path)) writeFileSync(path, rows[0].def);
  }
  await writeStaging(readFileSync('supabase/293-questionnaire-known-information.sql', 'utf8'));
}
const env = await prepare();
const lit = v => `$known$${typeof v === 'string' ? v : JSON.stringify(v)}$known$`;
let passed = 0;
const ok = (b, message) => { if (!b) throw new Error(message); passed++; console.log(`✓ ${message}`); };
try {
  const id = env.clientId;
  await env.sql(`update public.clients set employers = '[{"id":"e1","name":"מהתיק","grossSalaryAnnual":123456}]',
    ni_occupations = '[{"id":"n1","type":"employee","fromDate":"2021-01-01","employerName":"מעסיק מביטוח לאומי","btlDetail":{"definitionIncome":99999}}]',
    spouse_ni_occupations = '[{"id":"s1","type":"employee","fromDate":"2023-02-01","btlDetail":{"employerName":"מעסיק בת הזוג","definitionIncome":88888}}]',
    bank_accounts = '[{"id":"b1","bankName":"בנק שלא נשאל"}]' where id = '${id}'`);
  const parent = (await env.sql(`insert into public.onboarding_steps(user_id,client_id,step_type,track,scope,status,payload)
    select user_id,id,'annual_return','tools','person','pending','{"taxYear":2025,"purpose":"annual"}'::jsonb from public.clients where id='${id}' returning id`))[0].id;
  const step = (await env.sql(`insert into public.onboarding_steps(user_id,client_id,step_type,track,scope,status,payload,published_at)
    select user_id,id,'info_collection','tools','person','waiting_client', ${lit({ taxYear: 2025, purpose: 'annual', parentStepId: parent, title: 'בדיקת שאלון' })}::jsonb, now()
    from public.clients where id='${id}' returning id`))[0].id;
  const prompt = { title: 'איפה עבדת ב-2025?', why: '', input: { kind: 'record', schema: 'employer', context: { taxYear: '2025' } } };
  const ask = (await env.sql(`insert into public.tax_info_asks(user_id,client_id,tax_year,step_id,parent_step_id,item_key,item_kind,subject_role,prompt,state,saved_draft)
    select user_id,id,2025,'${step}','${parent}','salary.employerDetails','detail','client',${lit(prompt)}::jsonb,'published','{"text":"טיוטה שמורה"}'::jsonb
    from public.clients where id='${id}' returning id`))[0].id;
  const token = new URL(env.portalUrl()).searchParams.get('portal');
  const rpc = async target => (await env.sql(`begin; set local role anon; select public.portal_tax_info(${lit(token)},${lit(target)}) as r; commit;`))[0].r;
  const response = await rpc(step);
  ok(response.ok && response.knownClient, 'authorized portal receives known-information context');
  ok(response.knownClient.niOccupations[0].employerName === 'מעסיק מביטוח לאומי', 'NI employer and dates available');
  ok(response.knownClient.spouseNiOccupations[0].employerName === 'מעסיק בת הזוג', 'spouse identity stays separate');
  ok(!JSON.stringify(response.knownClient).includes('123456') && !JSON.stringify(response.knownClient).includes('99999') && !JSON.stringify(response.knownClient).includes('88888'), 'salary amounts and NI details are excluded');
  ok(!response.knownClient.bankAccounts, 'unasked schema is excluded');
  const saved = (await env.sql(`select prompt,saved_draft from public.tax_info_asks where id='${ask}'`))[0];
  ok(JSON.stringify(saved.prompt) === JSON.stringify(response.asks[0].prompt) && saved.saved_draft.text === 'טיוטה שמורה', 'reading preserves stored prompt and customer draft');
  const denied = await rpc('not-this-clients-step');
  ok(!denied.ok && !denied.knownClient, 'unknown/other step has no context');
  const priv = (await env.sql(`select has_function_privilege('anon','public._tax_info_known_client(text,text)','execute') a,
    has_function_privilege('authenticated','public._tax_info_known_client(text,text)','execute') b,
    has_function_privilege('anon','public._tax_info_pick_rows(jsonb,text[])','execute') c`))[0];
  ok(!priv.a && !priv.b && !priv.c, 'private helpers are inaccessible to public callers');
  const invalid = (await env.sql(`begin; set local role anon; select public.portal_tax_info('invalid-known-information-token',${lit(step)}) as r; commit;`))[0].r;
  ok(!invalid.ok && !invalid.knownClient, 'invalid portal token cannot read context');
  await writeStaging(readFileSync('supabase/293-questionnaire-known-information.sql', 'utf8'));
  ok((await rpc(step)).ok, 'migration can be reapplied safely');
  await writeStaging(readFileSync('scripts/sql/293/rollback.sql', 'utf8'));
  const reverted = await rpc(step);
  ok(reverted.ok && !reverted.knownClient && reverted.asks[0].savedDraft.text === 'טיוטה שמורה', 'rollback preserves portal access and customer drafts');
  await writeStaging(readFileSync('supabase/293-questionnaire-known-information.sql', 'utf8'));
  ok(!!(await rpc(step)).knownClient, 'migration works again after rollback');
  console.log(`${passed} passed`);
} finally {
  const left = await env.cleanup();
  if (left.left || left.storageLeft) throw new Error('Staging fixtures were not fully cleaned');
  console.log('Staging fixtures cleaned');
}

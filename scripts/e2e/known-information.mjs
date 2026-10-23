// Actual portal + staging RPCs, synthetic clients only; production is blocked.
// STAGING_ENV_DIR=... node scripts/e2e/known-information.mjs --base=http://127.0.0.1:5378
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepare } from './staging-session.mjs';
const { chromium } = createRequire(process.env.PW_CORE ?? 'C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const env = await prepare();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const shots = resolve('../known-information-evidence'); mkdirSync(shots, { recursive: true });
const widths = (process.argv.find(a => a.startsWith('--widths='))?.slice('--widths='.length) ?? '1280,390,360').split(',').map(Number);
const lit = v => `$known$${typeof v === 'string' ? v : JSON.stringify(v)}$known$`;
let passed = 0;
const ok = (b, message) => { if (!b) throw new Error(message); passed++; console.log(`✓ ${message}`); };
try {
  for (const width of widths) {
    const id = env.clientId;
    await env.sql(`update public.clients set employers='[]', ni_occupations='[
      {"id":"n1","type":"employee","employerName":"המעסיק מביטוח לאומי","fromDate":"2020-03-01","toDate":"2025-08-31"},
      {"id":"future","type":"employee","employerName":"מעסיק משנת 2026","fromDate":"2026-01-01"}]',
      spouse_ni_occupations='[{"id":"s1","type":"employee","employerName":"המעסיק של רחל","fromDate":"2024-02-01"}]' where id='${id}'`);
    const parent = (await env.sql(`insert into public.onboarding_steps(user_id,client_id,step_type,track,scope,status,payload)
      select user_id,id,'annual_return','tools','person','pending','{"taxYear":2025,"purpose":"annual"}'::jsonb from public.clients where id='${id}' returning id`))[0].id;
    const step = (await env.sql(`insert into public.onboarding_steps(user_id,client_id,step_type,track,scope,status,payload,published_at)
      select user_id,id,'info_collection','tools','person','waiting_client',${lit({ taxYear: 2025, purpose: 'annual', parentStepId: parent, title: 'הדוח השנתי 2025' })}::jsonb,now()
      from public.clients where id='${id}' returning id`))[0].id;
    const rows = ['client', 'spouse'].map((role, i) => ({ itemKey: 'salary.employerDetails', role,
      ref: `emp-new-${role}-annual`, prompt: { title: 'איפה עבדת ב-2025?', why: 'מכל מעסיק נדרש אישור שנתי', subjectName: role === 'client' ? 'דוד' : 'רחל', order: i,
        input: { kind: 'record', schema: 'employer', context: { taxYear: '2025', clientName: 'דוד', spouseName: 'רחל', married: '1' } } } }));
    rows.push({ itemKey: 'annual.whatHappened', role: 'client', prompt: { title: 'האם היה עוד משהו ב-2025?', why: '', order: 9, input: { kind: 'multi', options: [] } } });
    for (const a of rows) await env.sql(`insert into public.tax_info_asks(user_id,client_id,tax_year,step_id,parent_step_id,item_key,item_kind,subject_role,entity_kind,entity_ref,prompt,state)
      select user_id,id,2025,'${step}','${parent}',${lit(a.itemKey)},'detail',${lit(a.role)},${a.ref ? "'employer'" : 'null'},${a.ref ? lit(a.ref) : 'null'},${lit(a.prompt)}::jsonb,'published'
      from public.clients where id='${id}'`);
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'he-IL', isMobile: width < 700, hasTouch: width < 700 });
    const blocked = [], errors = [];
    await ctx.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('uoweoqtuiettozagwgdw')) { blocked.push(url); return route.abort(); }
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return route.fulfill({ status: 200, body: '' });
      const host = new URL(url).hostname;
      return ['127.0.0.1', 'localhost'].includes(host) || host.includes('evdfxjqrkgugssfrdoxd') || /^(data|blob):/.test(url) ? route.continue() : route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${env.portalUrl()}#q=${step}`, { waitUntil: 'domcontentloaded' });
    const flow = page.locator('.ty-flow');
    await flow.locator('[data-confirm="salary.employerDetails"]').first().waitFor({ timeout: 40000 });
    const text = await flow.innerText();
    ok(text.includes('המעסיק מביטוח לאומי') && text.includes('המעסיק של רחל'), `${width}: both NI employers appear for confirmation`);
    ok(!text.includes('מעסיק משנת 2026'), `${width}: future employer excluded from 2025`);
    ok(text.includes('מועד הסיום לא ידוע'), `${width}: unknown end is not shown as still employed`);
    ok(await flow.locator('.rec-field').count() === 0, `${width}: known details require no typing`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal overflow`);
    await page.screenshot({ path: resolve(shots, `known-${width}.png`), fullPage: true });
    await flow.locator('[data-confirm="salary.employerDetails"]').first().getByRole('button', { name: 'נכון', exact: true }).click();
    await flow.getByRole('button', { name: 'עבודה: נכון — לפתוח שוב', exact: true }).first().click();
    ok(await flow.getAttribute('data-screen') === 'confirmAll' && await flow.locator('.rec-field').count() === 0, `${width}: reopening one approved row keeps the confirmation screen`);
    const clientRow = flow.locator('[data-confirm="salary.employerDetails"]').first();
    await clientRow.getByRole('button', { name: 'הוספת מעסיק · דוד', exact: true }).click();
    const employerCards = clientRow.locator('.rec-card');
    ok(await employerCards.count() === 2 && await employerCards.first().locator('input').first().inputValue() === 'המעסיק מביטוח לאומי', `${width}: direct add preserves known employer`);
    await employerCards.last().locator('input').first().fill('מעסיק נוסף לדוד');
    await employerCards.last().locator('select').first().selectOption('unknown');
    ok(await employerCards.last().locator('select').last().inputValue() === 'unknown', `${width}: new employer has no assumed employment end`);
    await clientRow.locator('.ty-seg').getByRole('button', { name: 'נכון', exact: true }).click();
    await flow.getByRole('button', { name: 'הכול נכון, ממשיכים', exact: true }).click();
    await flow.locator('[data-annual-send]').waitFor();
    await page.waitForTimeout(1300);
    const saved = (await env.sql(`select saved_draft from public.tax_info_asks where step_id='${step}' and item_key='annual.whatHappened'`))[0].saved_draft;
    ok(JSON.stringify(saved).includes('המעסיק מביטוח לאומי') && JSON.stringify(saved).includes('המעסיק של רחל') && JSON.stringify(saved).includes('מעסיק נוסף לדוד'), `${width}: grouped approval saves actual values including added employer`);
    // Change the source after approval. A reload must retain the confirmed snapshot.
    await env.sql(`update public.clients set ni_occupations='[]',spouse_ni_occupations='[]' where id='${id}'`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await flow.locator('[data-annual-send]').waitFor({ timeout: 30000 });
    await flow.getByRole('button', { name: 'הקודם', exact: true }).click();
    await flow.locator('[data-confirm="salary.employerDetails"]').first().waitFor();
    ok((await flow.innerText()).includes('המעסיק מביטוח לאומי'), `${width}: saved approval survives source changes and reload`);
    await flow.getByRole('button', { name: 'הכול נכון, ממשיכים', exact: true }).click();
    await flow.locator('[data-annual-send]').click();
    await page.locator('.ty-flow[data-finish]').waitFor({ timeout: 30000 });
    const facts = await env.sql(`select value,status from public.tax_year_facts where client_id='${id}' and request_id='${parent}' and item_key='salary.employerDetails'`);
    ok(facts.length === 2 && facts.every(f => f.status === 'pending') && JSON.stringify(facts).includes('המעסיק מביטוח לאומי') && JSON.stringify(facts).includes('מעסיק נוסף לדוד'), `${width}: displayed records including added employer reach office as pending facts`);
    ok(!blocked.length && !errors.length, `${width}: no production requests or browser exceptions`);
    await env.sql(`update public.onboarding_steps set status='cancelled' where id='${parent}'`);
    await ctx.close();
  }
  console.log(`${passed} passed`);
} finally {
  await browser.close();
  const left = await env.cleanup();
  if (left.left || left.storageLeft) throw new Error('Staging fixtures not fully cleaned');
  console.log('Staging fixtures cleaned');
}

#!/usr/bin/env node
/**
 * collection-ux-phone-setup.mjs — לקוח בדיקה ב-staging לבדיקת טלפון אמיתי של סבב האיסוף. נשאר עד הניקוי.
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/collection-ux-phone-setup.mjs --base=http://localhost:4746 --host=http://10.0.0.9:4746 --out=<קובץ json>
 *   STAGING_ENV_DIR=… node scripts/e2e/collection-ux-phone-setup.mjs --cleanup --out=<אותו קובץ>
 *
 * ‼ staging בלבד. לקוח עם ילדים, חשבון בנק, נכס וחשבון השקעות בלי תאריך; הקליטה ודוח 2024 מפורסמים בדף האישי (בלי מייל).
 * ‼ הקובץ שנוצר (--out) מחזיק את מזהי הלקוחות ואת קישור הדף האישי — לשמור מחוץ לריפו ולמחוק אחרי הניקוי.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:4746');
const HOST = arg('host', BASE);
const OUT = arg('out', '');
if (!OUT) throw new Error('--out חובה');
const STAGING = 'evdfxjqrkgugssfrdoxd';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const readEnv = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
const TOKEN = readEnv(`${process.env.STAGING_ENV_DIR}/.env.local`).SUPABASE_ACCESS_TOKEN;
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`sql ${r.status}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : [];
}

if (process.argv.includes('--cleanup')) {
  const { ids } = JSON.parse(readFileSync(OUT, 'utf8'));
  const list = ids.map(c => `'${c}'`).join(',');
  await sql(`
    delete from public.tax_evidence where client_id in (${list});
    delete from public.tax_card_transfers where client_id in (${list});
    delete from public.tax_year_facts where client_id in (${list});
    delete from public.tax_info_asks where client_id in (${list});
    delete from public.tax_fact_changes where client_id in (${list});
    delete from public.accountant_notifications where client_id in (${list});
    delete from public.onboarding_events where step_id in (select id from public.onboarding_steps where client_id in (${list}));
    delete from public.client_notice_items where step_id in (select id from public.onboarding_steps where client_id in (${list}));
    delete from public.client_step_notice_state where step_id in (select id from public.onboarding_steps where client_id in (${list}));
    delete from public.client_notices where client_id in (${list});
    delete from public.email_messages where client_id in (${list});
    delete from public.documents where client_id in (${list});
    delete from public.annual_report_answers where session_id in (select id from public.annual_report_sessions where client_id in (${list}));
    delete from public.annual_report_sessions where client_id in (${list});
    delete from public.onboarding_steps where client_id in (${list});
    delete from public.clients where id in (${list});`);
  let left = 0;
  for (const t of await sql(`select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('client_id','linked_client_id') and table_name not like 'v\\_%'`)) {
    const n = (await sql(`select count(*)::int n from public."${t.table_name}" where "${t.column_name}" in (${list})`).catch(() => [{ n: 0 }]))[0]?.n ?? 0;
    if (n) { left += n; console.log(`  שארית: ${t.table_name} = ${n}`); }
    await sleep(120);
  }
  console.log(left ? `ניקוי: נשארו ${left} שורות` : 'ניקוי: 0 שאריות (קבצים באחסון נמחקים מהמסמכים של הלקוח בניקוי נפרד, אם הועלו)');
  process.exit(left ? 1 : 0);
}

if (existsSync(OUT)) throw new Error(`${OUT} כבר קיים — לקוח טלפון קודם עוד לא נוקה`);
const env = await (await import('./staging-session.mjs')).prepare();
const A = env.clientId;
await sql(`update public.clients set first_name = 'נועה', last_name = 'בדיקת טלפון ${env.run.slice(-5)}',
  children = '[{"id":"k1","birthYear":2015,"birthDate":"2015-04-12","hasDisability":false},{"id":"k2","birthYear":2018,"birthDate":"2018-09-03","hasDisability":false}]'::jsonb,
  bank_accounts = '[{"id":"b1","bankName":"בנק לאומי","branchNumber":"902","accountNumber":"0012345","isPrimary":true}]'::jsonb,
  investment_accounts = '[{"id":"a1","institutionName":"מיטב טרייד"}]'::jsonb, address = 'הנשיא 5' where id = '${A}'`);
writeFileSync(OUT, JSON.stringify({ ids: [env.clientId, env.otherClientId], run: env.run, createdAt: new Date().toISOString() }, null, 1));

const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--headless=new'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
await env.initContext(ctx);
await ctx.route('**/*', r => { const h = new URL(r.request().url()).hostname; return h === 'localhost' || h === `${STAGING}.supabase.co` || r.request().url().startsWith('data:') ? r.continue() : r.abort(); });
const page = await ctx.newPage();
// הקליטה: «החלף בקליטה», כל השאלות, פרסום
await page.goto(env.officeUrl(A), { waitUntil: 'domcontentloaded' });
await page.locator('[data-intake-open]').click({ timeout: 45000 });
const ov = page.locator('.ty-overlay'); await ov.waitFor({ timeout: 20000 });
const rep = ov.getByRole('button', { name: 'החלף בקליטה' });
if (await rep.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) { await rep.click(); await rep.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await sleep(800); }
await ov.getByRole('button', { name: /^הוסף \d+ שאלות/ }).first().click();
await ov.locator('h3', { hasText: 'מוכן לדף האישי' }).waitFor({ timeout: 20000 });
for (let k = 0; k < 3 && !(await page.locator('.ty-ok').innerText().catch(() => '')).includes('פורסם'); k++) { await ov.getByRole('button', { name: 'פרסם בדף האישי' }).click({ timeout: 8000 }).catch(() => {}); await sleep(2000); }
await ov.getByRole('button', { name: 'סגירה' }).first().click().catch(() => {});
// דוח 2024 מהתיק, ופרסום
await page.locator('[data-section="works"]').getByRole('button', { name: /הוסף דוח או הצהרת הון/ }).click();
const dlg = page.locator('[data-add-work]');
await dlg.locator('select').first().selectOption('2024');
await dlg.getByRole('button', { name: /המשך לבדיקה/ }).click();
await dlg.locator('[data-aw-create]').click();
await ov.waitFor({ timeout: 30000 });
for (let k = 0; k < 3 && !(await page.locator('.ty-ok').innerText().catch(() => '')).includes('פורסם'); k++) { await ov.getByRole('button', { name: 'פרסם בדף האישי' }).click({ timeout: 8000 }).catch(() => {}); await sleep(2000); }
await browser.close();

const pub = await sql(`select count(*) filter (where published_at is not null)::int pub, count(*)::int n from public.onboarding_steps where client_id = '${A}' and step_type = 'info_collection'`);
const tok = env.portalUrl().split('?portal=')[1];
const portal = `${HOST}/?portal=${tok}`;
writeFileSync(OUT, JSON.stringify({ ids: [env.clientId, env.otherClientId], run: env.run, createdAt: new Date().toISOString(), portal }, null, 1));
console.log(`השלמת מידע מפורסמת: ${pub[0].pub}/${pub[0].n} · מיילים: ${(await sql(`select count(*)::int n from public.email_messages where client_id = '${A}'`))[0].n}`);
console.log(`נשמר: ${OUT}`);

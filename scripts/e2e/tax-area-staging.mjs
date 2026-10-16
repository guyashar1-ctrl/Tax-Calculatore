#!/usr/bin/env node
/**
 * tax-area-staging.mjs — «מס › עבודות לקוחות» (סקירה בלבד, 16.10.2026) ומפת הטופס מול המסד האמיתי של staging, בבנייה לפרסום (vite build --mode staging).
 *
 *   STAGING_ENV_DIR=<תיקייה עם .env.staging ו-.env.local> node scripts/e2e/tax-area-staging.mjs --base=http://localhost:4747 [--vp=desktop|mobile] [--shots=<dir>]
 *
 * ‼ לקוח בדיקה חדש לכל ריצה (staging-session.mjs), נמחק בסוף עם סריקת שאריות. כל פנייה שאינה ל-staging או ל-localhost נחסמת.
 * ‼ אין מיילים: בסוף נבדק שאין שורות ב-email_messages ללקוחות הבדיקה.
 * המסלול: עבודה נפתחת ללקוח הבדיקה (אותה פונקציה כמו «＋ בקשה») ⇒ מופיעה בסקירה, פעם אחת ⇒ סינון לפי סוג ושם ⇒ שורה ⇒ «בקשות»
 *   של הלקוח, והעבודה שם ⇒ «אחורה» ⇒ קישורים ישנים ⇒ מפת הטופס מול הלקוח. טלפון: הסקירה ושורה ⇒ «בקשות».
 *   הסרה, החזרה ופרסום — ב«בקשות» (מסלול ב׳: scripts/e2e/work-as-request.mjs).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:4747');
const VP = arg('vp', 'desktop');
const SHOTS = arg('shots', '');
const STAGING = 'evdfxjqrkgugssfrdoxd';
const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
const ok = (c, m, info = '') => { c ? pass++ : fail++; results.push({ ok: !!c, m, info: c ? '' : String(info).slice(0, 500) }); console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${String(info).slice(0, 500)}` : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const env = await (await import('./staging-session.mjs')).prepare();
const { sql, clientId: A, otherClientId: B } = env;
const one = async (q) => (await sql(q))[0];
const lit = (v) => `$q$${v}$q$`;
const OFFICE = 'ca158d52-5ad7-47f5-b228-4b7703978b84';
const asUser = async (sub, expr) => (await sql(`begin; set local role authenticated;
  select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub, role: 'authenticated' }))}, true);
  select (${expr}) as r; commit;`))[0]?.r;
console.log(`לקוחות בדיקה: ${env.run} (A=${A.slice(0, 8)}…) · ${VP}`);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const consoleErrors = [], blocked = [], httpErrors = [], http401 = [];
async function newPage() {
  const mobile = VP === 'mobile';
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'he-IL' });
  await env.initContext(ctx);
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    const host = new URL(u).hostname;
    if (host === 'localhost' || host === `${STAGING}.supabase.co` || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    blocked.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver/.test(m.text())) consoleErrors.push(m.text().slice(0, 240)); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + String(e).slice(0, 240)));
  page.on('response', async r => {
    if (!r.url().includes(STAGING)) return;
    const path = r.url().replace(/\?.*/, '').slice(-70);
    if (r.status() === 401) http401.push({ path, body: (await r.text().catch(() => '')).slice(0, 160), t: Date.now() });
    else if (r.status() < 300) { for (const x of http401) if (x.path === path && x.recoveredMs === undefined) x.recoveredMs = Date.now() - x.t; }
    if (r.status() >= 400) httpErrors.push(`${r.status()} ${path}`);
  });
  return { ctx, page };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${VP}.png`), fullPage: full }).catch(() => {}); };
const text = async (loc) => ((await loc.count().catch(() => 0)) ? loc.first().innerText({ timeout: 5000 }).catch(() => '') : '');
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const go = async (page, hash) => {
  await page.goto('about:blank');
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-tax-area]').waitFor({ timeout: 40000 });
  await page.locator('[data-work-overview], [data-domain], [data-domain-card]').first().waitFor({ timeout: 40000 }).catch(() => {});
  await sleep(1200);
};
// ‼ 16.10: «עבודות לקוחות» היא סקירה בלבד — אין ממנה הוספה. העבודה נפתחת כמו מ«＋ בקשה» אצל הלקוח: אותה פונקציה בשרת
//   (ensure_tax_year_request), בזהות משתמש המשרד של staging. ההסרה/החזרה נבדקות ב«בקשות» (מסלול ב׳, work-as-request.mjs).
const openWork = async (clientId, taxYear = 2025) => asUser(OFFICE, `public.ensure_tax_year_request(p_client_id => '${clientId}', p_purpose => 'annual', p_tax_year => ${taxYear}, p_cutoff_month => null)`);
const annualOf = async (clientId) => sql(`select id, status, payload from public.onboarding_steps where client_id = '${clientId}' and step_type = 'annual_return' order by created_at`);
const woRow = (page) => page.locator('[data-wo-row]', { hasText: env.run });
const waitOverview = async (page) => {
  const wo = page.locator('[data-work-overview]');
  await wo.waitFor({ timeout: 40000 });
  for (let k = 0; k < 40 && /טוען/.test(await text(wo)); k++) await sleep(500);
  return wo;
};

async function desktop() {
  const { ctx, page } = await newPage();
  try {
    // ── 1 · עבודה שנפתחה ללקוח מופיעה בסקירה ──
    const res = await openWork(A);
    const [w] = await annualOf(A);
    ok(!!w, 'נפתח דוח שנתי 2025 ללקוח הבדיקה (ensure_tax_year_request, כמשרד)', JSON.stringify(res).slice(0, 200));
    const again = await openWork(A);
    ok((await annualOf(A)).length === 1, 'פתיחה שנייה לאותה שנה — לא נוצרת עבודה כפולה', JSON.stringify(again).slice(0, 200));
    await go(page, '/tax/work/all');
    const wo = await waitOverview(page);
    ok(!/לא ניתן לטעון/.test(await text(wo)), 'staging: הסקירה נטענת מהמסד', (await text(wo)).slice(0, 200));
    ok(await woRow(page).count() === 1, 'השורה של לקוח הבדיקה בסקירה', await woRow(page).count());
    const rt = await text(woRow(page));
    ok(/דוח שנתי/.test(rt) && /2025/.test(rt), 'בשורה: סוג ושנה', rt.replace(/\n/g, ' · '));
    ok(!(await wo.getByRole('button', { name: /^＋|הסר…|^פתח$|פרסם/ }).count()), 'אין פעולות בסקירה — רק מעבר ל«בקשות»');
    await shot(page, 'st-01-overview');
    // ── 2 · סינון לפי סוג ──
    await go(page, '/tax/work/annual');
    await waitOverview(page);
    ok(await woRow(page).count() === 1, '«דוחות שנתיים»: השורה כאן');
    await go(page, '/tax/work/wealth');
    await waitOverview(page);
    ok(await woRow(page).count() === 0, '«הצהרות הון»: השורה לא כאן');
    await go(page, '/tax/work/annual');
    const wo2 = await waitOverview(page);
    await wo2.locator('[data-wo-q]').fill(env.run); await sleep(300);
    ok(await wo2.locator('[data-wo-row]').count() === 1, 'חיפוש לפי שם הלקוח');
    // ── 3 · שורה ⇒ «בקשות» של הלקוח, והעבודה שם ──
    await woRow(page).first().click(); await sleep(3000);
    const h = await page.evaluate(() => location.hash);
    ok(h.startsWith(`#/client/${A}/journey`), 'שורה ⇒ «בקשות» של לקוח הבדיקה', h);
    ok(/^בקשות/.test((await text(page.locator('.cw-tab.active'))).trim()), 'הלשונית הפעילה: «בקשות»');
    ok(/דוח שנתי 2025/.test(await text(page.locator('body'))), 'העבודה מופיעה ב«בקשות» של הלקוח');
    await shot(page, 'st-02-requests');
    await page.goBack(); await sleep(2000);
    ok((await page.evaluate(() => location.hash)).startsWith('#/tax/work/annual'), '«אחורה» חוזר לסקירה');
    // ── 4 · קישורים ישנים ──
    for (const [old, want] of [['/firm/taxWork', '#/tax/work'], ['/tax/work/intake', '#/tax/work/intake']]) {
      await go(page, old);
      ok((await page.evaluate(() => location.hash)).startsWith(want) && await page.locator('[data-work-overview]').count() === 1, `קישור ישן ‎#${old}‎ ⇒ הסקירה`);
    }
    // ── 5 · מפת הטופס מול לקוח אמיתי (קריאה בלבד) ──
    await go(page, '/tax/learn/annual');
    const fm = page.locator('[data-form-map="1301"]');
    ok(await fm.isVisible(), 'דוח שנתי: מפת הטופס');
    await fm.locator('[data-fm-client]').selectOption(A); await sleep(3000);
    ok(await page.locator('[data-fm-summary]').isVisible(), 'מצב השדות אצל לקוח הבדיקה', await text(page.locator('[data-fm-summary]')));
  } finally { await ctx.close(); }
}

async function mobile() {
  const { ctx, page } = await newPage();
  try {
    await openWork(A);
    await go(page, '/tax/work/all');
    if (!(await page.locator('[data-work-overview]').isVisible())) { await page.locator('[data-rail="work-all"]').click(); await sleep(800); }
    await waitOverview(page);
    ok(await woRow(page).count() === 1, 'טלפון: השורה בסקירה');
    ok(await noHScroll(page), 'טלפון: בלי גלילה הצידה');
    await shot(page, 'st-m-overview');
    await woRow(page).first().click(); await sleep(3000);
    ok((await page.evaluate(() => location.hash)).startsWith(`#/client/${A}/journey`), 'טלפון: שורה ⇒ «בקשות»');
    await shot(page, 'st-m-requests');
  } finally { await ctx.close(); }
}

try {
  if (VP === 'mobile') await mobile(); else await desktop();
  const em = (await one(`select count(*)::int n from public.email_messages m join public.onboarding_steps s on s.id = replace(m.step_id::text, '-', '') where s.client_id in ('${A}', '${B}')`)).n
    + (await one(`select count(*)::int n from public.email_messages where client_id in ('${A}', '${B}')`).catch(() => ({ n: 0 }))).n;
  ok(em === 0, 'אין מיילים ללקוחות הבדיקה', String(em));
  ok(blocked.length === 0, 'אין פנייה מחוץ ל-staging / localhost', blocked.slice(0, 3).join(' | '));
  // ‼ 401 «JWT issued at future» (PGRST303) — הפרש שעונים ב-staging מיד אחרי כניסה; האפליקציה מנסה שוב פעם אחת (jwtClockSkewRetry).
  //   הדפדפן רושם את ה-401 הראשון גם כשהניסיון החוזר הצליח — נחשב שגיאה רק אם לא התאושש או שהגוף אחר.
  const skewOk = http401.length > 0 && http401.every(x => /PGRST303/.test(x.body) && /issued at future/i.test(x.body) && x.recoveredMs !== undefined);
  if (http401.length) ok(skewOk, `401: ${http401.length} — «JWT issued at future», והבקשה הצליחה בניסיון החוזר`, JSON.stringify(http401));
  const realConsole = consoleErrors.filter(e => !(skewOk && /status of 401/.test(e)));
  ok(realConsole.length === 0, 'בלי שגיאות קונסול (מלבד 401 שהתאושש)', realConsole.slice(0, 3).join(' | '));
  if (httpErrors.length) console.log('   (שגיאות HTTP:', httpErrors.slice(0, 6).join(' | '), ')');
} finally {
  await browser.close();
  const c = await env.cleanup();
  ok(c.left === 0 && c.storageLeft === 0, `ניקוי: לקוחות הבדיקה נמחקו, אין שאריות (${c.files} קבצים)`, JSON.stringify(c));
  console.log(`\n${pass} עברו, ${fail} נכשלו`);
  if (SHOTS) writeFileSync(join(SHOTS, `results-${VP}.json`), JSON.stringify({ pass, fail, results, httpErrors }, null, 1));
  process.exit(fail ? 1 : 0);
}

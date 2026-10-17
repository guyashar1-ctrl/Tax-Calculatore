#!/usr/bin/env node
// צילום עמוד הנושא «עוסק פטור או עוסק מורשה» (ידע המס) ב-1280 וב-390 — למדריך השחרור. סשן משרד של staging-session.
//   STAGING_ENV_DIR=<dir> node scripts/e2e/capture-knowledge-dealer.mjs --base=http://localhost:5321 --shots=<dir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d);
const BASE = arg('base', 'http://localhost:5321'), SHOTS = arg('shots', '.');
mkdirSync(SHOTS, { recursive: true });
const { chromium } = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json')('playwright-core');
const env = await (await import('./staging-session.mjs')).prepare();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--headless=new'] });
let errors = [];
try {
  for (const [tag, vp] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: tag === 'mobile' ? 2 : 1, isMobile: tag === 'mobile', locale: 'he-IL' });
    await env.initContext(ctx);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/favicon|ResizeObserver|401|PGRST303/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    await page.goto(`${BASE}/#/tax/learn/business/dealerType`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /עוסק פטור או עוסק מורשה/.test(document.body.textContent ?? ''), null, { timeout: 30000 });
    await page.screenshot({ path: join(SHOTS, `k1-dealer-topic-${tag}.png`) });
    // הפרק «ענף ⇒ סיווג»: פותחים את תקנה 13(1) ומצלמים
    // השלבים: הטבלה ב«מסמכים ומה מזינים», המחשבון ב«איך מחשבים»
    await page.locator('[data-stage-btn="read"]').click();
    await page.waitForSelector('#dt-3', { timeout: 15000 });
    const sec = page.locator('#dt-3');
    if (await sec.count()) {
      await sec.locator('details').first().evaluate(d => { d.open = true; });
      await sec.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(SHOTS, `k2-dealer-branches-${tag}.png`) });
      await page.locator('#dt-search').fill('ייעוץ');
      await page.waitForTimeout(300);
    }
    await page.locator('[data-stage-btn="calc"]').click();
    await page.waitForSelector('#dt-4', { timeout: 15000 });
    const dt4 = page.locator('#dt-4');
    if (await dt4.count()) {
      await dt4.locator('#dt-c').fill('6921');
      await dt4.scrollIntoViewIfNeeded();
      const v = await page.locator('[data-dt-verdict]').textContent();
      console.log(`${tag}: verdict for 6921 → ${v?.trim().slice(0, 80)}`);
      await page.screenshot({ path: join(SHOTS, `k3-dealer-calc-${tag}.png`) });
    }
    console.log(`${tag}: ok`);
    await ctx.close();
  }
} finally {
  await browser.close();
  console.log(errors.length ? `console errors: ${errors.join(' | ')}` : 'no console errors');
  const r = await env.cleanup();
  console.log(`cleanup left=${r.left}`);
}

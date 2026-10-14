// QA: עמוד «עסק זעיר» בידע המס — כל הלשוניות, מחשבון (87ד(ג), צינון), מחשב וטלפון, בלי שגיאות וגלילה הצידה.
//   node micro.mjs <trialDir> <shotsDir>
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json');
const { chromium } = require('playwright-core');
const [dir, shots] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/favicon.ico') { res.statusCode = 204; return res.end(); } if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync(join(dir, 'tax-knowledge.html'), 'utf8') + '</body></html>'); } const f = join(dir, p); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', /\.m?js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'application/octet-stream'); res.end(readFileSync(f)); }).listen(5397);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 300)}` : ''}`); };
for (const vp of [{ n: 'desktop', w: 1440, h: 900 }, { n: 'phone', w: 390, h: 844, m: true }]) {
  console.log(`== ${vp.n}`);
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, ...(vp.m ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/127\.0\.0\.1:9|Failed to load/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5397/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  if (vp.m) { const t = page.locator('.pg-rail-item', { hasText: 'נושאים' }).first(); if (await t.count()) await t.click(); await page.waitForTimeout(300); }
  await page.locator('.kn-card', { hasText: 'עסק זעיר' }).first().click(); await page.waitForTimeout(500);
  const tabs = page.locator('.kn-tabs [role=tab]');
  const nTabs = await tabs.count();
  ok(nTabs >= 3, `לשוניות: ${nTabs}`);
  const all = [];
  for (let i = 0; i < nTabs; i++) {
    await tabs.nth(i).click(); await page.waitForTimeout(350);
    const t = await page.locator('article.kn-page').innerText();
    all.push(t);
    await page.screenshot({ path: join(shots, `${vp.n}-micro-tab${i}.png`) });
    const over = await page.evaluate(() => { const vw = innerWidth; return [...document.querySelectorAll('article.kn-page *')].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !x.closest('table, .kn-table-wrap, pre, [style*="overflow"]'); }).map(x => x.tagName + '.' + x.className).slice(0, 4); });
    ok(over.length === 0, `לשונית ${i + 1}: בלי גלילה הצידה`, JSON.stringify(over));
  }
  const text = all.join('\n');
  ok(/87ד\(ג\)/.test(text) && /36,849/.test(text), 'חריגה: 87ד(ג) ו-36,849.90 מוצגים');
  ok(/שתי/.test(text) && /שלוש/.test(text), 'צינון: «שתי שנים» לפי החוק, וה«שלוש» במדריכים מוצג כסתירה');
  ok(/מע״מ|מע"מ/.test(text) && /אינו קובע|לא קובע|אינו מעיד|נפרד/.test(text), 'מסלול מס הכנסה ≠ מעמד במע״מ');
  ok(/מאומת/.test(text) && /פרשנות/.test(text) && /פתוח/.test(text), 'סימון מאומת / פרשנות / פתוח');
  ok(/36,000/.test(text) && /130,000/.test(text), 'דוגמה 3 מתוקנת (130,000 ⇒ 36,000 לרשום מ-1.1)');
  ok(errors.length === 0, 'בלי שגיאות בדפדפן', errors.join(' | '));
  await ctx.close();
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);

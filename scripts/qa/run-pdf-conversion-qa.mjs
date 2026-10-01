#!/usr/bin/env node
// מריץ את בדיקת האיכות של ההמרה ל-PDF בכרום ללא-ראש, מול שרת הפיתוח.
// שימוש: node scripts/qa/run-pdf-conversion-qa.mjs <port> <heic-sample> <out-dir>
// ‼ לא שולח כלום ולא נוגע במסד: הכול רץ בדפדפן, על תמונות שנבנות בבדיקה עצמה.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = await import('file:///C:/Users/guyas/pivo-wt/shaam-required-docs/worker/node_modules/playwright-core/index.mjs');
const [, , port = '5188', heicPath, outDir = '.'] = process.argv;
mkdirSync(outDir, { recursive: true });
const heicB64 = readFileSync(heicPath).toString('base64');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const t0 = Date.now();
const results = await page.evaluate(async (b64) => {
  const m = await import('/scripts/qa/pdfConversionHarness.ts');
  return m.runPdfConversionQa(b64);
}, heicB64);
writeFileSync(`${outDir}/results.json`, JSON.stringify(results.map(({ expectThumb, gotThumb, pageThumb, textExpect, textGot, ...r }) => r), null, 2));
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail} (${r.ms}ms)${r.notes?.length ? ' · ' + r.notes.join(' ') : ''}`);
console.log(`\n${results.filter(r => r.ok).length}/${results.length} עברו · ${Math.round((Date.now() - t0) / 1000)}s`);
// דף סיכום: מה היה צריך להופיע מול מה שמופיע ב-PDF
const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
body{font-family:Arial;background:#f3f2f0;margin:0;padding:24px;color:#25282d;width:1500px}
h1{font-size:24px;margin:0 0 4px}.sub{color:#63686f;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.c{background:#fff;border-radius:10px;padding:12px;border:2px solid transparent}.c.bad{border-color:#a63a3a}
.n{font-weight:700;font-size:14px}.d{font-size:12px;color:#4b5058;margin:4px 0 8px;direction:rtl}
.row{display:flex;gap:8px;align-items:flex-start}.row figure{margin:0;text-align:center;font-size:11px;color:#63686f}
.row img{max-width:150px;max-height:150px;border:1px solid #ddd;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0/12px 12px}
.ok{color:#24654e}.x{color:#a63a3a}
</style></head><body><h1>בדיקת המרה לתמונות ⇠ PDF</h1><p class="sub">${results.filter(r => r.ok).length} מתוך ${results.length} עברו · מימין מה שהיה צריך להופיע, משמאל מה שמופיע ב-PDF שנוצר (רינדור אמיתי של הקובץ). בזום: למעלה המקור, למטה ה-PDF — או למעלה ה-PDF באיכות המקור ולמטה גרסת ההגשה</p>
${results.filter(r => r.textExpect).map(r => `<div class="c" style="margin-bottom:14px"><div class="n">זום 1:1 על הטקסט הקטן ביותר — ${r.name}</div><div class="d">למעלה המקור, למטה ה-PDF ברזולוציה המקורית</div><img src="${r.textExpect}" style="display:block;width:1450px;image-rendering:pixelated;border:1px solid #ddd"><img src="${r.textGot}" style="display:block;width:1450px;margin-top:6px;image-rendering:pixelated;border:1px solid #ddd"></div>`).join("")}<div class="grid">${results.map(r => `<div class="c ${r.ok ? '' : 'bad'}"><div class="n"><span class="${r.ok ? 'ok' : 'x'}">${r.ok ? '✓' : '✗'}</span> ${r.name}</div><div class="d">${r.detail}${r.notes?.length ? '<br>' + r.notes.join('<br>') : ''}</div>
${r.expectThumb ? `<div class="row"><figure><img src="${r.expectThumb}"><figcaption>צפוי</figcaption></figure><figure><img src="${r.gotThumb}"><figcaption>ב-PDF</figcaption></figure>${r.pageThumb ? `<figure><img src="${r.pageThumb}"><figcaption>העמוד</figcaption></figure>` : ''}</div>` : ''}</div>`).join('')}</div></body></html>`;
writeFileSync(`${outDir}/contact.html`, html);
const p2 = await (await browser.newContext({ viewport: { width: 1548, height: 900 } })).newPage();
await p2.setContent(html, { waitUntil: 'load' });
await p2.screenshot({ path: `${outDir}/contact.png`, fullPage: true });
await browser.close();

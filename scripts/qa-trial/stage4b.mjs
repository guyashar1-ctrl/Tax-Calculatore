// QA שלב 4, סבב 8 — מסלול מלא עד «מוכן להגשה» על לקוחת הדגמה (אורית, sample-4: שכירה ועצמאית, נשואה לשכיר).
//   טיוטה פנימית → הצהרות (כולל ניהול ספרים מקודד) → פרטים שהכרטיס לא מחזיק → חשבון להחזר → שאלות פתיחה →
//   נספח 1320 → «גיליון עבודה מלא» → בחירת מסלול פנסיה → אישור «מוכן להגשה» → קובץ לפי מבנה 2025 (הפקה, בדיקה,
//   הורדה) → גיליון → «הוגש». מחשב 1440 וטלפון 390; שגיאות, פניות החוצה, גלילה הצידה.
//   node stage4b.mjs <trialDir> <shotsDir>
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json');
const { chromium } = require('playwright-core');
const [dir, shots] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/favicon.ico') { res.statusCode = 204; return res.end(); } if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync(join(dir, 'tax-knowledge.html'), 'utf8') + '</body></html>'); } const f = join(dir, p); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', /\.m?js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'application/octet-stream'); res.end(readFileSync(f)); }).listen(5412);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 500)}` : ''}`); };
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`== ${name}`);
  const ctx = await b.newContext({ viewport: vp, acceptDownloads: true, ...(name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errs = [], outside = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!/^(http:\/\/127\.0\.0\.1:5412|data:|blob:|https:\/\/fonts\.(googleapis|gstatic)\.com)/.test(u)) outside.push(u); });
  const overflow = () => page.evaluate(() => { const vw = innerWidth; return [...document.querySelectorAll('.ty-overlay *')].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !x.closest('.ar-table-wrap, table, pre'); }).map(x => `${x.tagName}.${x.className}`).slice(0, 4); });
  const panel = page.locator('section.te-panel[aria-labelledby="ar-title"]');
  const chip = () => panel.locator('.te-head .ty-chip').innerText();
  const openAnnual = async () => {
    await page.evaluate(() => { location.hash = '#/client/sample-4/taxfile'; }); await page.waitForTimeout(1200);
    await page.locator('.ty-year', { hasText: '2025' }).first().locator('div, li', { hasText: 'דוח שנתי' }).last().locator('button').first().click(); await page.waitForTimeout(1500);
  };
  await page.goto('http://127.0.0.1:5412/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.clear(); location.hash = '#/client/sample-4/taxfile'; }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await openAnnual();
  ok(await panel.count() === 1, 'דוח 2025 של אורית נפתח');
  ok(/טיוטה פנימית/.test(await chip()), `סטטוס: ${await chip()}`);
  ok(!(await panel.getByRole('button', { name: 'אשר «מוכן להגשה»' }).isEnabled()), 'אישור חסום כשחסר');
  await page.screenshot({ path: join(shots, `${name}-b1-draft.png`) });

  // ── הצהרות: ניהול ספרים מקודד, ואז «לא» לכל השאר ──
  const decl = panel.locator('[aria-label="הצהרות בהגשה"]');
  await decl.locator('select').nth(0).selectOption('60');
  await decl.locator('input:not([type=radio])').first().fill('2');
  const sels = decl.locator('select');
  for (let i = 1; i < await sels.count(); i++) { const opts = await sels.nth(i).locator('option').allInnerTexts(); await sels.nth(i).selectOption({ index: opts.findIndex(o => /חד צידית|ממוחשב/.test(o)) }); }
  await decl.getByRole('button', { name: /סמן «לא» בכל מה שלא סומן/ }).click(); await page.waitForTimeout(1200);
  ok(!(await panel.innerText()).includes('הצהרות בהגשה:'), 'ההצהרות נשמרו בשנת המס — הפער נסגר');

  // ── פרטים שהכרטיס לא מחזיק ──
  const idEd = panel.locator('[aria-label="פרטים שהכרטיס לא מחזיק"]');
  const idInputs = idEd.locator('input');
  for (let i = 0; i < await idInputs.count(); i++) await idInputs.nth(i).fill(i === 0 ? 'יעקב' : 'משה');
  await idEd.getByRole('button', { name: 'שמור' }).click(); await page.waitForTimeout(1000);
  ok(!(await panel.innerText()).includes('פרטים שהכרטיס לא מחזיק:'), 'שמות האב נשמרו (עובדת שנת המס)');

  // ── חשבון להחזר ──
  const rf = panel.locator('[aria-label="חשבון להחזר"]');
  await rf.getByLabel('מספר בנק').fill('12'); await rf.getByLabel('סניף').fill('345'); await rf.getByLabel('מספר חשבון').fill('654321'); await rf.getByLabel('שם בעל החשבון').fill('אורית שפירא');
  await rf.getByRole('button', { name: 'שמור' }).click(); await page.waitForTimeout(1000);

  // ── שאלות פתיחה: «אין» לכל אחת ──
  for (let i = 0; i < 15; i++) {
    const sa = panel.locator('[aria-label="שאלות פתיחה שלא נענו"]');
    if (!(await sa.count())) break;
    await sa.getByRole('button', { name: 'אין' }).first().click(); await page.waitForTimeout(700);
  }
  ok(!(await panel.locator('[aria-label="שאלות פתיחה שלא נענו"]').count()), 'כל שאלות הפתיחה נענו («לא ידוע» ≠ «אין»)');

  // ── נספח 1320 ──
  await page.evaluate(() => { const d = document.querySelector('#ar-micro'); if (d) d.open = true; }); await page.waitForTimeout(200);
  const bk = panel.locator('[aria-label^="נספח 1320"]').first();
  await bk.getByLabel('בסיס הדיווח').selectOption('cash');
  await bk.locator('label.te-field', { hasText: '1. סה״כ הכנסות' }).locator('input').fill('190000');
  await bk.locator('label.te-field', { hasText: '9. הוצאות משרדיות' }).locator('input').fill('50000');
  const radios = bk.locator('fieldset .ar-decl');
  for (let i = 0; i < await radios.count(); i++) { const yes = i === 0 || i === 4; await radios.nth(i).locator('input[type=radio]').nth(yes ? 0 : 1).check(); }
  const txt = bk.locator('fieldset label.te-field input');
  for (let i = 0; i < await txt.count(); i++) await txt.nth(i).fill(i === 0 ? 'ה׳' : 'במשרד');
  await page.waitForTimeout(400);
  ok(/מלא/.test(await bk.locator('.ty-label').first().innerText()), `נספח 1320 מלא: ${await bk.locator('.ty-label').first().innerText()}`);
  await page.screenshot({ path: join(shots, `${name}-b2-1320.png`) });

  const st = await chip();
  ok(/גיליון עבודה מלא/.test(st), `סטטוס: ${st}`, (await panel.innerText()).split('מה חסר')[1]?.slice(0, 600));
  ok(!(await panel.locator('[aria-labelledby="ar-unsup"]').count()), 'אין «מה המערכת לא מפיקה»');

  // ── פנסיה: עמית מוטב — בחירת מסלול ──
  await page.evaluate(() => { const d = document.querySelector('#ar-pension'); if (d) d.open = true; }); await page.waitForTimeout(200);
  const pen = panel.locator('#ar-pension');
  ok(await pen.count() === 1 && /מסלול ב׳: ניכוי/.test(await pen.innerText()), 'פנסיה: עמית מוטב — שני המסלולים מוצגים', await pen.innerText().catch(() => ''));

  // ── בדיקת כיסוי ──
  await page.evaluate(() => { const d = document.querySelector('#ar-coverage'); if (d) d.open = true; }); await page.waitForTimeout(200);
  const covSum = await panel.locator('#ar-coverage summary').innerText();
  ok(/0 חסרים · 0 לא מופקים/.test(covSum), `בדיקת כיסוי: ${covSum}`);

  // ── אישור ──
  await panel.getByRole('button', { name: 'אשר «מוכן להגשה»' }).click(); await page.waitForTimeout(1500);
  ok(/מוכן להגשה · גרסה 1/.test(await chip()), `אחרי אישור: ${await chip()}`);

  // ── תוצרים: קובץ לפי מבנה 2025 ──
  await page.evaluate(() => { const d = document.querySelector('#ar-products'); if (d) d.open = true; }); await page.waitForTimeout(200);
  const prod = panel.locator('#ar-products');
  ok(/טופס רשמי/.test(await prod.innerText()) && /אינם PDF למילוי/.test(await prod.innerText()), 'מוסבר: אין טופס רשמי למילוי — שידור בלבד');
  await prod.getByRole('button', { name: 'הפק ובדוק' }).click(); await page.waitForTimeout(500);
  const fileRes = await prod.locator('[role=status]').innerText();
  ok(/נבדק: רשומות 1000 ו-9999 באורך המפרט/.test(fileRes), `קובץ: ${fileRes.slice(0, 200)}`);
  const [dl] = await Promise.all([page.waitForEvent('download'), prod.getByRole('button', { name: 'הורד קובץ' }).click()]);
  const buf = readFileSync(await dl.path());
  const recs = buf.toString('latin1').split('\r\n').filter(Boolean);
  ok(recs.length === 2 && recs[0].length === 4232 && recs[1].length === 150 && recs[0].startsWith('13011000') && recs[1].startsWith('13019999'), `קובץ שהורד: ${recs.map(r => r.length).join(', ')}`);
  ok(recs[0].slice(136, 145) === '456789012' && recs[0].slice(145, 149) === '2025', 'מספר תיק ושנת מס במקומם');
  ok(buf.includes(0xe0 + ('ש'.charCodeAt(0) - 0x5d0)), 'עברית ב-Windows-1255 (הנחה מסומנת)');
  // גיליון
  const [dl2] = await Promise.all([page.waitForEvent('download'), prod.getByRole('button', { name: 'הורד גיליון' }).click()]);
  const html = readFileSync(await dl2.path(), 'utf8');
  ok(html.includes('מוכן להגשה — אושר בסקירת המשרד') && html.includes('בדיקת כיסוי') && html.includes('לא טופס רשמי'), 'גיליון: סטטוס, כיסוי, «לא טופס רשמי»');

  // ── הוגש בפועל ──
  await page.evaluate(() => { const d = document.querySelector('#ar-versions'); if (d) d.open = true; }); await page.waitForTimeout(150);
  const vers = panel.locator('#ar-versions');
  await vers.locator('label.te-field', { hasText: 'הוגש בתאריך' }).locator('input').fill(today);
  await vers.locator('label.te-field', { hasText: 'מספר אישור' }).locator('input').fill('B-55123');
  await vers.getByRole('button', { name: 'רשום הגשה (ידני)' }).click(); await page.waitForTimeout(1200);
  ok(/הוגש בפועל/.test(await chip()), `אחרי רישום: ${await chip()}`);
  ok((await overflow()).length === 0, 'בלי גלילה הצידה', JSON.stringify(await overflow()));
  await page.screenshot({ path: join(shots, `${name}-b3-filed.png`) });
  // טעינה מחדש
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await openAnnual();
  ok(/הוגש בפועל/.test(await chip()), 'אחרי טעינה מחדש: «הוגש בפועל»');
  ok(errs.length === 0, 'בלי שגיאות בדפדפן', errs.join(' | '));
  ok(outside.length === 0, 'בלי פניות החוצה', outside.slice(0, 3).join(' | '));
  await ctx.close();
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);

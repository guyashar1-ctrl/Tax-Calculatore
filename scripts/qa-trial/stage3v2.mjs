// QA שלב 3 (סבב 5) על חבילת הניסיון: מחשב 1440 וטלפון 390 — המסלול המלא: נתונים, קליטה, מקדמות לפי
// רשות, השלמה מאושרת, עסק זעיר, שמירה, אישור, סיכום ללקוח, הורדה ופרסום (מדומה). צילומים ושגיאות.
//   node stage3v2.mjs <trialDir> <shotsDir>
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json');
const { chromium } = require('playwright-core');
const [dir, shots] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/favicon.ico') { res.statusCode = 204; return res.end(); } if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync(join(dir, 'tax-knowledge.html'), 'utf8') + '</body></html>'); } const f = join(dir, p); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', /\.m?js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'application/octet-stream'); res.end(readFileSync(f)); }).listen(5399);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 400)}` : ''}`); };
const PNL = [['ישראל ישראלי - עוסק מורשה 123456782'], ['קוד מיון', ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/26`), 'סכום'],
  ['סך הכנסות', ...Array.from({ length: 12 }, (_, i) => (i < 9 ? '33,000' : '')), '297,000'], ['הוצאות'], ['אחזקת רכב', ...Array.from({ length: 12 }, (_, i) => (i < 9 ? '3,000' : '')), '27,000'],
  ['סך הוצאות', ...Array.from({ length: 12 }, (_, i) => (i < 9 ? '3,000' : '')), '27,000'], ['סך רווח והפסד', ...Array.from({ length: 12 }, (_, i) => (i < 9 ? '30,000' : '')), '270,000']].map(r => r.join('\t')).join('\n');

for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`== ${name}`);
  const ctx = await b.newContext({ viewport: vp, acceptDownloads: true, ...(name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('response', r => { if (r.status() === 404) console.log('    404:', r.url()); });
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:5399/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.clear(); location.hash = '#/client/sample-1/taxfile'; }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { location.hash = '#/client/sample-1/taxfile'; }); await page.waitForTimeout(1500);
  const y26 = page.locator('.ty-year', { hasText: '2026' }).first();
  await y26.locator('button', { hasText: /^(התחל|פתח)$/ }).first().click(); await page.waitForTimeout(1500);
  const panel = page.locator('.te-panel');
  ok(await panel.count() === 1, 'דף הערכת המס נפתח');
  ok(!(await panel.locator('.te-result').innerText()).includes('אין עדיין חבות שאפשר להציג כוודאית'), '2026: ליבת המס ממקור ראשי — אין חסימת «כלל לא מוכרע»');
  await page.screenshot({ path: join(shots, `${name}-1-start.png`) });
  const r0 = await panel.locator('.te-result').innerText();
  ok(r0.includes('חסרים נתוני הכנסה') && !/0 ₪|מאוזן/.test(r0.split('הצעד הבא')[0]), 'בלי נתונים: «חסר» — לא 0 ₪ ולא «מאוזן»', r0.slice(0, 300));
  const open = (id) => page.evaluate((i) => { const d = document.querySelector(i); if (d) d.open = true; }, id);

  // ── שורת עסק + קליטת רו״ה ──
  await open('#te-income'); await page.waitForTimeout(150);
  const add = panel.locator('#te-income .te-add').last();
  await add.locator('select').last().selectOption('business').catch(async () => { await add.locator('select').first().selectOption('business'); });
  await add.locator('input').last().fill('ייעוץ — דוד');
  await add.locator('button', { hasText: 'הוסף שורת' }).click();
  await open('#te-import'); await page.waitForTimeout(150);
  await panel.locator('#te-import select').nth(1).selectOption({ label: /ייעוץ — דוד/ }).catch(() => {});
  await panel.locator('#te-import textarea').fill(PNL); await page.waitForTimeout(300);
  const prev = await panel.locator('#te-import .te-preview').innerText();
  ok(prev.includes('תצוגה לפני קליטה') && prev.includes('123456782') && prev.includes('270,000'), 'קליטת רו״ה: תצוגה עם זיהוי, חודשים ורווח עד החתך', prev.slice(0, 300));
  await page.screenshot({ path: join(shots, `${name}-2-import.png`), fullPage: false });
  const importBtn = panel.locator('#te-import button', { hasText: 'קלוט לשורה' });
  ok(!(await importBtn.isEnabled()) && prev.includes('לא תואם לכרטיס'), 'מספר עוסק של מישהו אחר — «לא תואם», והקליטה חסומה');
  await panel.locator('#te-import textarea').fill(PNL.replace('123456782', '123456789')); await page.waitForTimeout(300);
  ok((await panel.locator('#te-import .te-preview').innerText()).includes('תואם לכרטיס') && await importBtn.isEnabled(), 'מספר הלקוח — «תואם», הקליטה זמינה');
  await importBtn.click(); await page.waitForTimeout(400);
  ok((await panel.locator('.te-result').innerText()).includes('רו״ה נקלט'), 'אחרי הקליטה — הודעה עם הסכומים');

  // ── שאר השורות: בפועל ותחזית ──
  const lines = panel.locator('#te-income .te-line');
  const n = await lines.count();
  const vals = [216000, 126000, 39600, 8000];
  for (let i = 0; i < n; i++) { const inp = lines.nth(i).locator('input').first(); if (!(await inp.inputValue())) await inp.fill(String(vals[i] ?? 1000)); }
  const fld = (l, t) => l.locator('label.te-field', { hasText: t }).locator('input');
  const bizLine = lines.filter({ hasText: 'ייעוץ — דוד' });
  await fld(bizLine, 'מחזור צפוי').fill('100000');
  await fld(bizLine, 'ניכוי במקור מלקוחות').fill('6000');
  for (let i = 0; i < n; i++) {
    const side = lines.nth(i).locator('.te-fc-side', { hasText: 'תחזית המשרד' });
    await side.locator('select').selectOption('runRate');
    await side.locator('input[type=radio]').check();
  }
  // ── מקדמות לפי רשות ואדם ──
  await open('#te-it-client'); await page.waitForTimeout(150);
  const it = panel.locator('#te-it-client');
  await it.locator('input[type=date]').first().fill('2026-10-10');
  await it.locator('select').first().selectOption('turnoverRate');
  await fld(it, 'שיעור נוכחי').fill('5');
  await open('#te-ni-client'); await page.waitForTimeout(150);
  const ni = panel.locator('#te-ni-client');
  await ni.locator('input[type=date]').first().fill('2026-10-10');
  await fld(ni, 'מקדמה חודשית נוכחית').fill('2500');
  await fld(ni, 'שולם עד סוף').fill('22500');
  await page.waitForTimeout(300);
  let res = await panel.locator('.te-result').innerText();
  ok(/מס הכנסה לשנה/.test(res) && /מקדמת מס הכנסה — מומלץ/.test(res) && /מקדמת ב״ל — מומלץ/.test(res), 'תוצאה: חבות, יתרה והמלצה לכל רשות', res.slice(0, 400));
  await panel.locator('.te-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shots, `${name}-3-result.png`) });
  await it.locator('details.te-explain summary').first().click(); await page.waitForTimeout(150);
  const expl = await it.locator('details.te-explain').first().innerText();
  ok(expl.includes('בלי העסק') && expl.includes('÷ מחזור שנתי'), '«איך חושב» — המספרים לבדיקה ביד', expl.slice(0, 300));
  // ── השלמה: רשומה, ביסוס, אישור ──
  const cu = it.locator('.te-line', { hasText: 'השלמה לתקופות שעברו' });
  await cu.locator('select').nth(1).selectOption('manualAmount');
  await fld(cu, 'סכום ההשלמה').fill('5000');
  await fld(cu, 'ביסוס').fill('הודעת פקיד השומה — בדיקת QA');
  await cu.locator('button', { hasText: 'רשום השלמה' }).click(); await page.waitForTimeout(200);
  ok((await it.locator('.te-adv').innerText()).includes('ממתינה לביסוס ולאישור') || (await it.locator('.te-adv').innerText()).includes('לא מחושב'), 'השלמה לפני אישור — לא מחושבת');
  await cu.locator('button', { hasText: 'אשר השלמה' }).click(); await page.waitForTimeout(250);
  ok((await it.locator('.te-adv').innerText()).includes('5,000'), 'השלמה מאושרת — 5,000 נכנס, מסומן «לפי רשומה מאושרת»');
  await it.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, `${name}-4-it.png`) });

  // ── שמירה ואישור ──
  await panel.locator('.te-result button', { hasText: 'שמור טיוטה' }).click(); await page.waitForTimeout(700);
  res = await panel.locator('.te-result').innerText();
  const blockers = await panel.locator('.te-blockers').allInnerTexts();
  ok(!blockers.length, 'אין חוסמים לפני אישור', blockers.join(' | '));
  await panel.locator('.te-result button', { hasText: /^אשר/ }).click(); await page.waitForTimeout(900);
  ok((await panel.locator('.te-result').innerText()).includes('גרסה 1 · מאושרת'), 'גרסה 1 אושרה', (await panel.locator('.te-result').innerText()).slice(0, 300));
  // ── סיכום ללקוח ──
  await open('#te-summary'); await page.waitForTimeout(400);
  const frame = page.frameLocator('#te-summary iframe');
  const sumTxt = await frame.locator('body').innerText();
  ok(sumTxt.includes('הערכת מס לשנת 2026') && sumTxt.includes('מקדמות — היום והמלצה') && sumTxt.includes('להשלים עכשיו') && sumTxt.includes('אינו חיוב'), 'סיכום ללקוח: תוצאה, מקדמות, עכשיו מול בהמשך, הבהרה', sumTxt.slice(0, 300));
  await page.locator('#te-summary').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, `${name}-5-summary.png`) });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), panel.locator('#te-summary button', { hasText: 'הורד ללקוח' }).click()]);
  ok(!!dl && /הערכת-מס-2026-גרסה-1\.html$/.test(dl.suggestedFilename()), 'הורדה: קובץ HTML של אותה גרסה', dl?.suggestedFilename());
  await panel.locator('#te-summary button', { hasText: 'פרסם בדף האישי' }).click(); await page.waitForTimeout(500);
  ok((await panel.locator('#te-summary').innerText()).includes('פורסם בדף האישי'), 'פרסום (מדומה) — מצביע על אותה גרסה, והשליחה דרך «שלח בקשות»');

  // ── עסק זעיר: מסלול על אותה שורה ⇒ טיוטה חדשה, בלי לגעת בגרסה המאושרת ──
  await open('#te-income');
  await bizLine.locator('label.te-field', { hasText: 'מסלול לשנת' }).locator('select').selectOption('micro'); await page.waitForTimeout(300);
  const micro = await bizLine.locator('.te-micro').innerText();
  ok(micro.includes('עסק זעיר') && micro.includes('חרג מהתקרה'), 'עסק זעיר: מחזור 397,000 — «חרג מהתקרה», לפי הספרים', micro.slice(0, 300));
  await bizLine.locator('.te-micro').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, `${name}-6-micro.png`) });
  ok((await panel.locator('.te-result .ty-chip').first().innerText()).includes('שינויים שלא נשמרו'), 'שינוי אחרי אישור — טיוטה, הגרסה המאושרת לא משתנה');

  // ── עסק זעיר בתוך התקרה: ב״ל לא מחושב בלי השלמה מאושרת — והאישור חסום ──
  await fld(bizLine, `מחזור עד סוף`).fill('80000'); await fld(bizLine, 'מחזור צפוי').fill('20000'); await page.waitForTimeout(300);
  const approveBtn = panel.locator('.te-result button', { hasText: /^אשר/ });
  const blk = (await panel.locator('.te-blockers').allInnerTexts()).join(' ');
  ok(blk.includes('דמי ב״ל לעסק זעיר') && await approveBtn.isDisabled(), 'זעיר בתקרה: «ב״ל לא מחושב» חוסם, וכפתור האישור כבוי', blk.slice(0, 300));
  await open('#te-ni-client'); await page.waitForTimeout(150);
  const niOv = ni.locator('.te-line', { hasText: 'עסק זעיר — דמי ב״ל' });
  await niOv.locator('select').first().selectOption('assessedIncome70');
  await fld(niOv, 'מקור וביסוס').fill('בדיקת QA — החלה מפורשת של 70%');
  await niOv.locator('button', { hasText: 'רשום השלמה' }).click(); await page.waitForTimeout(200);
  ok((await panel.locator('.te-blockers').allInnerTexts()).join(' ').includes('דמי ב״ל לעסק זעיר'), 'השלמה שלא אושרה — עדיין חוסמת');
  await niOv.locator('button', { hasText: /^אשר$/ }).click(); await page.waitForTimeout(300);
  const blk2 = (await panel.locator('.te-blockers').allInnerTexts()).join(' ');
  ok(!blk2.includes('דמי ב״ל לעסק זעיר') && (await ni.locator('.te-adv').innerText()).includes('לפי רשומה מאושרת'), 'אחרי אישור ההשלמה: ב״ל מחושב ומסומן «לפי רשומה מאושרת»', blk2.slice(0, 200));
  await ni.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(shots, `${name}-7-micro-ni.png`) });
  ok((await bizLine.locator('.te-micro').innerText()).includes('מסלול הדיווח לשנה'), 'בחירת מסלול הדיווח מוצגת בשורת העסק הזעיר');

  const over = await page.evaluate(() => { const vw = innerWidth; return [...document.querySelectorAll('.ty-overlay *')].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !x.closest('.te-table-wrap'); }).map(x => x.className).slice(0, 5); });
  ok(over.length === 0, 'בלי גלילה הצידה', JSON.stringify(over));
  ok(errs.length === 0, 'בלי שגיאות בדפדפן', errs.join(' | '));
  await ctx.close();
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);

// QA שלב 4 (סבב 7) על חבילת הניסיון: מחשב 1440 וטלפון 390 — הדוח השנתי מקצה לקצה, ותיק המס כמרכז.
//   פתיחת דוח 2025 · «חסר» ולא 0 · דירה מהשאלון → «הוסף לתיק» (הצעה) · הזנה במשרד (ברוטו + מס שנוכה) · השלמה
//   מקצועית · אישור «מוכן להגשה» · הורדת הגיליון ופתיחה מחדש · רישום «הוגש בפועל» · אישור ההצעה בתיק המס →
//   «לבדיקה» בדוח שאושר, והוא עצמו לא משתנה · טעינה מחדש. צילומים, שגיאות וגלילה הצידה.
//   node stage4.mjs <trialDir> <shotsDir>
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json');
const { chromium } = require('playwright-core');
const [dir, shots] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const srv = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); if (p === '/favicon.ico') { res.statusCode = 204; return res.end(); } if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + readFileSync(join(dir, 'tax-knowledge.html'), 'utf8') + '</body></html>'); } const f = join(dir, p); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', /\.m?js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'application/octet-stream'); res.end(readFileSync(f)); }).listen(5402);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 400)}` : ''}`); };
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`== ${name}`);
  const ctx = await b.newContext({ viewport: vp, acceptDownloads: true, ...(name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errs = [], outside = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!/^(http:\/\/127\.0\.0\.1:5402|data:|blob:|https:\/\/fonts\.(googleapis|gstatic)\.com)/.test(u)) outside.push(u); });
  const flash = async () => (await page.locator('.ty-ok, .ty-err').allInnerTexts()).join(' | ');
  const overflow = () => page.evaluate(() => { const vw = innerWidth; return [...document.querySelectorAll('.ty-overlay *')].filter(x => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !x.closest('.ar-table-wrap, table, pre'); }).map(x => `${x.tagName}.${x.className}`).slice(0, 4); });
  const openAnnual = async () => {
    await page.evaluate(() => { location.hash = '#/client/sample-1/taxfile'; }); await page.waitForTimeout(1200);
    const y25 = page.locator('.ty-year', { hasText: '2025' }).first();
    await y25.locator('div, li', { hasText: 'דוח שנתי' }).last().locator('button').first().click(); await page.waitForTimeout(1500);
  };
  await page.goto('http://127.0.0.1:5402/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.clear(); location.hash = '#/client/sample-1/taxfile'; }); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await openAnnual();
  const panel = page.locator('section.te-panel[aria-labelledby="ar-title"]');
  ok(await panel.count() === 1, 'דוח 2025 נפתח מתוך «תיק מס» → שנות מס');
  const r0 = await panel.locator('.te-result').innerText();
  ok(/טיוטה פנימית/.test(r0) && /חסרים נתוני הכנסה/.test(r0) && !/מאוזן/.test(r0) && /חסר/.test(r0.split('הצעד הבא')[0]), 'בלי נתונים סופיים: «חסר» ו«טיוטה פנימית» — לא 0 ולא «מאוזן»', r0.slice(0, 300));
  ok(!(await panel.getByRole('button', { name: 'אשר «מוכן להגשה»' }).isEnabled()), 'אישור חסום כשחסר');
  const gaps0 = await panel.locator('.te-gaps li').count();
  ok(gaps0 >= 2, `מה חסר: ${gaps0} פריטים, כל אחד עם דרך להשלים`);
  await page.screenshot({ path: join(shots, `${name}-1-open.png`) });
  ok((await overflow()).length === 0, 'בלי גלילה הצידה (פתיחה)', JSON.stringify(await overflow()));

  // ── דירה מהשאלון הקודם → «הוסף לתיק» = הצעה, לא כתיבה ──
  const rentRow = page.locator('.ty-row', { hasText: 'נכסים מושכרים' }).first();
  await rentRow.getByRole('button', { name: 'הוסף לתיק' }).click(); await page.waitForTimeout(200);
  await rentRow.getByLabel('כתובת הנכס').fill('הרצל 5'); await rentRow.getByLabel('עיר').fill('חיפה');
  await rentRow.locator('label.ty-check input[type=checkbox]').check();
  await rentRow.getByRole('button', { name: 'הצע לתיק' }).click(); await page.waitForTimeout(900);
  ok(/הוצע לתיק המס — ממתין לאישור/.test(await flash()), '«הוסף לתיק» → הצעה שממתינה לאישור בלשונית «תיק מס»', await flash());

  // ── הזנה במשרד לפני שסיימו שאלות ללקוח: ברוטו ומס שנוכה, בנפרד ──
  await page.getByRole('button', { name: 'להשלים עכשיו' }).click(); await page.waitForTimeout(500);
  const sal = page.locator('.ty-row', { hasText: 'חברת הייטק' }).filter({ has: page.getByLabel('מס שנוכה') }).first();
  ok(await sal.count() === 1, 'השלמה במשרד: שורת משכורת עם «ברוטו» ו«מס שנוכה» נפרדים');
  await sal.getByLabel('ברוטו').fill('240000'); await sal.getByLabel('מס שנוכה').fill('33000');
  await sal.getByRole('button', { name: 'שמור' }).click(); await page.waitForTimeout(1200);
  // בן/בת הזוג — אותו מסלול (משכורת משרד החינוך)
  const sal2 = page.locator('.ty-row', { hasText: 'משרד החינוך' }).filter({ has: page.getByLabel('מס שנוכה') }).first();
  await sal2.getByLabel('ברוטו').fill('96000'); await sal2.getByLabel('מס שנוכה').fill('2500');
  await sal2.getByRole('button', { name: 'שמור' }).click(); await page.waitForTimeout(1200);
  await page.evaluate(() => { const d = document.querySelector('#ar-fields'); if (d) d.open = true; }); await page.waitForTimeout(150);
  const r1 = await panel.innerText(), fieldsTxt = (await panel.locator('#ar-fields').textContent()) ?? '';
  ok(!/חברת הייטק בע״מ: אין נתון סופי/.test(r1) && /158/.test(fieldsTxt) && /172/.test(fieldsTxt) && /042/.test(fieldsTxt) && /240,000/.test(fieldsTxt) && /35,500/.test(fieldsTxt) && /✎ הוזן/.test(fieldsTxt), 'אחרי ההזנה: הפערים נסגרו; 158 = 240,000, 172 = 96,000, 042 = 35,500 — עם מקור', fieldsTxt.slice(0, 400));
  await page.screenshot({ path: join(shots, `${name}-2-office.png`) });

  // ── המצב אחרי ההזנה: טיוטה פנימית; העורכים לכל חוסר מופיעים ב«מה חסר» (המסלול המלא עד «מוכן להגשה» — stage4b.mjs) ──
  const r2 = await panel.innerText();
  ok(/טיוטה פנימית/.test(await panel.locator('.te-head .ty-chip').innerText()), 'בלי הצהרות, פרטים וחשבון להחזר — עדיין «טיוטה פנימית»');
  for (const lbl of ['הצהרות בהגשה', 'חשבון להחזר', 'שאלות פתיחה שלא נענו']) ok(await panel.locator(`[aria-label="${lbl}"]`).count() === 1, `עורך «${lbl}» מופיע במקום החוסר`);
  ok(!(await panel.getByRole('button', { name: 'אשר «מוכן להגשה»' }).isEnabled()), 'אישור חסום');
  const covSummary = await panel.locator('#ar-coverage summary').innerText();
  ok(/רלוונטיים מולאו/.test(covSummary), `בדיקת כיסוי מוצגת: ${covSummary}`);
  void r2;
  await page.screenshot({ path: join(shots, `${name}-3-draft-editors.png`) });

  // ── סתירה לישות קיימת: הלקוח ענה שהדירה בהרצל 12 כבר לא מושכרת ⇒ «סותר את התיק» ⇒ «עדכן בתיק» = הצעה ──
  const back = page.getByRole('button', { name: 'חזרה לסדר המומלץ' });
  if (await back.count()) { await back.click(); await page.waitForTimeout(500); }
  const conflictRow = page.locator('.ty-row', { hasText: 'סותר את התיק' }).first();
  ok(await conflictRow.count() === 1 && /הרצל 12.*מושכר: בתיק כן, בתשובה לא/.test(await conflictRow.innerText()), 'סתירה מוצגת: «הרצל 12 — מושכר: בתיק כן, בתשובה לא»', await conflictRow.innerText().catch(() => ''));
  await conflictRow.getByRole('button', { name: 'עדכן בתיק' }).click(); await page.waitForTimeout(900);
  ok(/הוצע עדכון בתיק המס — ממתין לאישור/.test(await page.locator('.ty-ok, .ty-err').allInnerTexts().then(x => x.join(' '))), 'עדכון ישות קיימת = הצעה לאישור, לא כתיבה');

  // ── בתיק המס: שתי ההצעות (נכס חדש + עדכון) ממתינות; אישור — הכרטיס מתעדכן ──
  await page.getByRole('button', { name: 'סגירה' }).first().click(); await page.waitForTimeout(800);
  const grp = page.locator('.txf-qchange', { hasText: 'עדכון משאלון' }).first();
  if (await grp.count()) { await grp.locator('.txf-qchange-head').click(); await page.waitForTimeout(300); }
  ok(await grp.locator('.txf-qtable-row', { hasText: 'נכס חדש מהשאלון: הרצל 5, חיפה' }).count() === 1, 'בתיק המס: «נכס חדש מהשאלון: הרצל 5, חיפה» ממתין');
  ok(await grp.locator('.txf-qtable-row', { hasText: 'עדכון נכס בתיק: הרצל 12, חיפה' }).count() === 1, 'בתיק המס: «עדכון נכס בתיק: הרצל 12, חיפה — מושכר» ממתין');
  await grp.locator('.txf-qtable-row', { hasText: 'עדכון נכס בתיק' }).getByRole('button', { name: 'אשר' }).click(); await page.waitForTimeout(1200);
  const staleRow = grp.locator('.txf-qtable-row', { hasText: 'הרצל 5' });
  if (await staleRow.count()) { await staleRow.getByRole('button', { name: 'אשר' }).click(); await page.waitForTimeout(1200); }
  ok(/הערך בתיק השתנה אחרי שההצעה הזו נוצרה/.test(await page.locator('main').innerText()), 'ההצעה השנייה נבנתה על תיק ישן — נדחית כסתירה, לא דורסת');
  await page.screenshot({ path: join(shots, `${name}-5-taxfile-accepted.png`) });

  await openAnnual();
  // ── חפיפה עם שאלון הקליטה הישן (פתוח אצל הלקוח): פרטים קבועים לא נשאלים פעמיים, סכומי השנה כן ──
  const prep = page.getByRole('button', { name: 'להכין עכשיו' });
  if (await prep.count()) { await prep.first().click(); await page.waitForTimeout(500); }
  const nowTxt = await page.locator('.ty-now').innerText();
  ok(/שאלון הקליטה הישן עדיין פתוח/.test(nowTxt) && /סכומים ומסמכים ל-2025 נשאלים כאן/.test(nowTxt), 'שאלון קליטה ישן פתוח — הודעה גלויה לפני הכנת שאלות', nowTxt.slice(0, 300));
  const boxes = page.locator('.ty-now label.ty-check');
  let confOn = 0, confAll = 0, otherOn = 0;
  for (let i = 0; i < await boxes.count(); i++) {
    const t = await boxes.nth(i).innerText(), on = await boxes.nth(i).locator('input').isChecked();
    if (t.startsWith('לאשר:')) { confAll++; if (on) confOn++; } else if (on) otherOn++;
  }
  ok(confOn === 0 && otherOn > 0, `אישורי פרטים קבועים (${confAll}) לא מסומנים; שאלות השנה (${otherOn}) מסומנות`);
  await page.screenshot({ path: join(shots, `${name}-7-intake-overlap.png`) });
  await page.getByRole('button', { name: 'סגירה' }).first().click(); await page.waitForTimeout(500);

  // ── ידע מס → טופס 1301: ציר «ממולא בטיוטת הדוח השנתי» ──
  if (name === 'desktop') {
    await page.locator('.pg-rail-item, nav a, nav button', { hasText: 'ידע מס' }).first().click(); await page.waitForTimeout(800);
    await page.locator('.pg-rail-item, nav a, nav button', { hasText: 'טופס 1301' }).first().click(); await page.waitForTimeout(1200);
    const kt = await page.locator('body').innerText();
    ok(/ממולא בטיוטת הדוח השנתי/.test(kt) && /[0-9]+ שדות · רק 2025/.test(kt), 'מפת הכיסוי: ציר «ממולא בטיוטת הדוח השנתי»');
    await page.screenshot({ path: join(shots, `${name}-8-coverage.png`) });
  }
  ok(errs.length === 0, 'בלי שגיאות בדפדפן', errs.join(' | '));
  ok(outside.length === 0, 'בלי פניות החוצה', outside.slice(0, 3).join(' | '));
  await ctx.close();
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
await b.close(); srv.close();
process.exit(fail ? 1 : 0);

// QA דפדפן — הערכת המס (13.10.2026) על שרת ההדגמה (?office-app, מסד מדומה): מחשב 1440 וטלפון 390.
// המסלול: אורית שפירא › תיק מס › 2026 › הערכת מס — מול הרשויות, מה בדקנו, זיכויים; אישור; סיכום ללקוח;
// משימת המשך; «ללמוד» ⇒ ידע המס ⇒ «חזרה לתיק» ⇒ אותה הערכה נפתחת; שינוי חודש חתך; ידע מס (דוח שנתי, 6111, 1219,
// תחזוקה). שגיאות קונסול וגלילה הצידה בכל שלב.
//   node scripts/qa-trial/estimate-e2e.mjs [baseUrl] [shotsDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire('C:/Users/guyas/Desktop/code Projects/Tax Calculator/worker/package.json');
const { chromium } = require('playwright-core');
const [base = 'http://localhost:5261', shots = 'qa-shots'] = process.argv.slice(2);
mkdirSync(shots, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let pass = 0, fail = 0;
const ok = (c, m, i = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && i ? ` — ${String(i).slice(0, 300)}` : ''}`); };

for (const [name, vp] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`== ${name}`);
  const ctx = await b.newContext({ viewport: vp, ...(name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const noOverflow = async (where) => ok(!(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), `${where}: בלי גלילה הצידה`);
  const shot = (n) => page.screenshot({ path: join(shots, `${name}-${n}.png`) });
  const openEstimate = async () => {
    await page.evaluate(() => { location.hash = '#/client/sample-4/taxfile'; }); await page.waitForTimeout(1800);
    await page.locator('[data-section="works"] li[data-work="tax_estimate"] button:has-text("פתח")').first().click(); await page.waitForTimeout(1500);
  };

  await page.goto(`${base}/?office-app&fresh-taxyear`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  await openEstimate();
  const panel = page.locator('.te-panel');
  ok(await panel.count() === 1, 'ההערכה של אורית נפתחה');
  const res = await panel.locator('.te-result').innerText();
  ok(/מס הכנסה לשנה/.test(res) && !/חסר\n/.test(res.split('הצעד הבא')[0]), 'יש חבות ויתרה — לא «חסר»', res.slice(0, 200));
  // 16.10.2026 (שלב 0): הבסיס לב״ל אחרי הניכוי לפנסיה ⇒ ניכוי 47א קטן במעט ⇒ המקדמה המומלצת 8.1% (היה 8%)
  ok(res.includes('8.1%') && res.includes('12%'), 'המלצת מקדמה: 8.1% מול 12% היום', res.slice(0, 400));
  ok(await page.locator('#te-authorities').count() === 1, '«מול הרשויות» מוצג');
  const auth = await page.locator('#te-authorities').innerText();
  ok(auth.includes('תזרים ב-60 הימים') && auth.includes('15.11.2026'), 'תזרים עם מועדים', auth.slice(0, 300));
  ok(auth.includes('המשרד בדק מול הרשות') && auth.includes('נקרא מהרשות'), 'מצב היישור: 134 ידני, ב״ל מהאוטומציה');
  await page.locator('#te-authorities button:has-text("לוח תשלומים")').first().click(); await page.waitForTimeout(300);
  const authOpen = await page.locator('#te-authorities').innerText();
  ok(authOpen.includes('מה עדיין לא ודאי') && authOpen.includes('190(א)(2)'), 'הקטנה — אזהרת 190(א)(2) ב«לא ודאי»');
  await page.locator('#te-authorities').scrollIntoViewIfNeeded(); await shot('1-authorities');
  await page.evaluate(() => { document.querySelector('#te-checks').open = true; });
  const checks = await page.locator('#te-checks').innerText();
  ok(checks.includes('קרן השתלמות') && checks.includes('פנסיה לעצמאי') && checks.includes('נפרד או מאוחד'), '«מה בדקנו»: קרן, פנסיה, בני זוג', checks.slice(0, 300));
  ok(/נמצא חיסכון/.test(checks), 'נמצא חיסכון — עם סכום');
  { const all = await page.locator('#te-checks').innerText(); const i = all.indexOf('בני זוג — חישוב נפרד או מאוחד'); const blk = all.slice(i, all.indexOf('ללמוד את הנושא', i));
    ok(blk.includes('חושב בשתי הדרכים') && blk.includes('מאוחד') && !blk.includes('אין חיסכון נוסף'), 'בני זוג: שני המספרים — לא «אין חיסכון»', blk); }
  await page.locator('#te-checks').scrollIntoViewIfNeeded(); await shot('2-checks');
  await page.evaluate(() => { document.querySelector('#te-credits').open = true; });
  ok((await page.locator('#te-credits').innerText()).includes('האם הכנסת אחד מהם תלויה'), 'שער 66(ד) לבני זוג מוצג');
  await noOverflow('הערכה');

  // אישור ⇒ סיכום ומשימות המשך
  await panel.locator('button:has-text("אשר גרסה")').first().click(); await page.waitForTimeout(1800);
  const msg = await panel.locator('.ty-ok, .ty-err').first().innerText().catch(() => '');
  ok(/אושרה/.test(msg), 'גרסה אושרה', msg);
  ok(await page.locator('#te-summary').count() === 1, 'סיכום ללקוח הופיע');
  const frame = page.frameLocator('#te-summary iframe');
  const sum = await frame.locator('body').evaluate(el => el.textContent ?? '').catch(() => '');
  ok(sum.includes('מה בדקנו בשבילך') && sum.includes('תשלומים עד סוף השנה') && sum.includes('התאמות מס'), 'הסיכום: מה בדקנו, תשלומים, התאמות', sum.slice(0, 300));
  ok(sum.includes('הרצאה בכנס') && sum.includes('כיבוד'), 'החד-פעמי וההתאמה — בנפרד');
  ok(!/מצב היישור|alignment|המשרד בדק מול הרשות/.test(sum), 'הסיכום ללקוח בלי מצב היישור הפנימי');
  // שלב 0 (R11): ב״ל ובריאות בנפרד; הבסיס אחרי הניכוי לקופת גמל (345); ב״ל לשנה 23,131 (היה 23,939)
  ok(sum.includes('ביטוח לאומי ובריאות לשנה') && sum.includes('מזה ביטוח לאומי') && sum.includes('· ביטוח בריאות'), 'הסיכום: ב״ל ובריאות מופרדים', sum.slice(sum.indexOf('ביטוח לאומי'), sum.indexOf('ביטוח לאומי') + 200));
  ok(sum.includes('23,131') && sum.includes('סעיף 345'), 'ב״ל לשנה 23,131 — אחרי הניכוי לפנסיה (345)');
  await page.locator('#te-summary').scrollIntoViewIfNeeded(); await shot('3-summary');
  ok(await page.locator('#te-followups').count() === 1, 'משימות המשך הופיעו');
  const fu = await page.locator('#te-followups').innerText();
  ok(fu.includes('לעדכן מקדמת מס הכנסה ל-8.1%') && fu.includes('לקרוא שוב'), 'משימות: עדכון מקדמה וקריאה חוזרת', fu.slice(0, 300));
  await page.locator('#te-followups').scrollIntoViewIfNeeded(); await shot('4-followups');
  await page.locator('#te-followups button:has-text("פתח משימה")').first().click(); await page.waitForTimeout(800);
  const dlg = page.locator('[role="dialog"]');
  ok(await dlg.count() > 0, 'נפתח טופס משימה (ממולא מראש)');
  if (await dlg.count()) { ok((await dlg.first().innerText()).includes('מקדמת') || (await dlg.first().locator('input, textarea').first().inputValue().catch(() => '')).includes('מקדמת'), 'כותרת המשימה ממולאת'); await shot('5-task'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }

  // «ללמוד» ⇒ ידע מס ⇒ «חזרה לתיק» ⇒ אותה הערכה
  if (!(await page.locator('.te-panel').count())) await openEstimate();
  await page.evaluate(() => { document.querySelector('#te-checks').open = true; });
  await page.locator('#te-checks button:has-text("ללמוד את הנושא")').first().click(); await page.waitForTimeout(1500);
  ok(await page.locator('.kn-topic').count() === 1, '«ללמוד» פתח נושא בידע המס');
  await page.locator('button:has-text("חזרה לתיק")').first().click(); await page.waitForTimeout(2500);
  ok(await page.locator('.te-panel').count() === 1, '«חזרה לתיק» — אותה הערכה נפתחה מחדש');

  // שינוי חודש חתך
  await page.evaluate(() => { document.querySelector('#te-income').open = true; });
  await page.locator('#te-income select').first().selectOption('6'); await page.waitForTimeout(600);
  const r6 = await page.locator('.te-result').innerText();
  ok(r6.includes('נתוני אמת עד סוף יוני') && r6.includes('שינויים שלא נשמרו'), 'שינוי חתך ליוני — טיוטה חדשה, לא דורס את המאושרת', r6.slice(0, 200));

  // ידע מקצועי (14.10.2026: «מס» ← «ידע מקצועי» ← תחום ← נושא, ומסלול שלבים במקום לשוניות)
  const kn = async (path, stage) => {
    await page.goto(`${base}/?office-app#/tax/learn/${path}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    if (stage) { await page.locator(`[data-stage-btn="${stage}"]`).first().click(); await page.waitForTimeout(400); }
  };
  await kn('annual/annualReturn', 'read');
  await page.locator('#ar-code-q').fill('172'); await page.waitForTimeout(300);
  ok((await page.locator('#ar-code').innerText()).includes('בן/בת הזוג'), 'איתור קוד 172 ⇒ בן/בת הזוג');
  await page.locator('#ar-code').scrollIntoViewIfNeeded(); await shot('6-code');
  await page.locator('[data-stage-btn="calc"]').first().click(); await page.waitForTimeout(400);
  ok(await page.locator('#ar-spouses').count() === 1 && (await page.locator('#ar-spouses').innerText()).includes('בן זוג עובד'), 'ידע: «בני זוג — נפרד או מאוחד» עם הטבלה והדוגמה');
  await noOverflow('דוח שנתי');
  await kn('business/form6111', 'read');
  await page.locator('#f6-q').fill('Claude'); await page.waitForTimeout(300);
  ok((await page.locator('.kn-dict').innerText()).includes('מנויי תוכנה'), 'מילון: Claude ⇒ מנויי תוכנה');
  await shot('7-dictionary'); await noOverflow('6111');
  await kn('wealth/wealth', 'read');
  ok(await page.locator('#wd-fields').count() === 1 && (await page.locator('#wd-fields').innerText()).includes('נכסים דיגיטליים'), '1219 שדה אחר שדה');
  await page.locator('#wd-fields').scrollIntoViewIfNeeded(); await shot('8-wealth');
  await kn('reference/maintenance');
  ok((await page.locator('body').innerText()).includes('טופס לשנה חדשה') && (await page.locator('body').innerText()).includes('R14'), 'תחזוקה: טופס לשנה חדשה ו-R01 עד R14');
  await page.locator('details.kn-dict-row:has-text("R09") summary').first().click(); await page.waitForTimeout(300);
  const r9 = await page.locator('details.kn-dict-row:has-text("R09")').first().innerText();
  ok(['נחקר', 'הוסבר בידע', 'בדיקת זכאות', 'חישוב מספרי', 'אוטומציה מול רשות', 'נבדק'].every(x => r9.includes(x)), 'R09: שש יכולות נפרדות', r9.slice(0, 200));
  await page.locator('#mt-newform').scrollIntoViewIfNeeded(); await shot('9-maintenance'); await noOverflow('תחזוקה');

  ok(errs.length === 0, 'בלי שגיאות בקונסול', errs.slice(0, 3).join(' | '));
  await ctx.close();
}
await b.close();
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);

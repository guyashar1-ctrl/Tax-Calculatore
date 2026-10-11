// ‼ 11.10.2026 · הדסה: «המסך שנפתח אינו תואם את מספר התיק שנשלח» — GMF מציגה
// 34605212, PIVO שלחה 034605212. הבדיקה רצה על הקוד האמיתי בדפדפן אמיתי.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { verifyFileDetailsFor } from '../src/browserSession.mjs';

const CHROME = process.env.PIVO_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HAVE_CHROME = existsSync(CHROME);
let browser;
test.before(async () => { if (HAVE_CHROME) browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
test.after(async () => { await browser?.close(); });

const screen = (fileShown) => `<!doctype html><html dir="rtl"><body>
  <h1>134 מקדמות - פרטי דרישה ודיווח לשנת 2026</h1>
  <label>מספר תיק <input value="034605212"></label>
  <table><tr><th>מספר תיק</th><th>שם</th><th>בז"ר</th><th>פקיד שומה</th><th>סוג תיק</th><th>ענף כלכלי</th></tr>
  <tr><td>${fileShown}</td><td>סלע הדסה ו/או יאיר</td><td>${fileShown}</td><td>45 - י"ם 2</td><td>52</td><td>8576</td></tr></table>
  <h2>לא נדרש במקדמה</h2><p>סיבת אי חיוב בסיס אפס</p><p>${'פירוט '.repeat(40)}</p></body></html>`;

async function check(fileShown, wanted) {
  const page = await browser.newPage();
  await page.setContent(screen(fileShown));
  const r = await verifyFileDetailsFor(page, wanted);
  await page.close();
  return r;
}

test('מספר תיק שמוצג בלי אפס מוביל הוא אותו תיק', { skip: !HAVE_CHROME }, async () => {
  assert.equal((await check('34605212', '034605212')).fileNumberInScreenText, true);
  assert.equal((await check('034605212', '034605212')).fileNumberInScreenText, true, 'הצגה מלאה עדיין עובדת');
});

test('תיק אחר — גם כשהספרות דומות — אינו התאמה; והמספר שהקלדנו בשדה אינו ראיה', { skip: !HAVE_CHROME }, async () => {
  assert.equal((await check('318853694', '034605212')).fileNumberInScreenText, false);
  assert.equal((await check('134605212', '034605212')).fileNumberInScreenText, false, 'ספרה מובילה שאינה אפס — תיק אחר');
  assert.equal((await check('3460521', '034605212')).fileNumberInScreenText, false);
});

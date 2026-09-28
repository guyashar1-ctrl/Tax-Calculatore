// ─── הקוד האמיתי של העובד, בדפדפן אמיתי, מול מבנה «בקשות בתהליך» ────────────
// ‼ דף הבדיקה (fixtures/shaamRequestsListPage.mjs) משחזר את מה שנצפה חי
// (28.09.2026): נתוני Kendo, «ניקוי», טופס שזוכר ערכים, «סינון לפי», «לא נמצאו
// רשומות מתאימות», ופירוט עם «תיק החזר מס (91)» מוסתר/גלוי.
// ‼ דורש Chrome מקומי. בלעדיו — מדלגים.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { findRequestRows, createPreflightDecision, currentRequestRows } from '../src/shaamRepresentationSession.mjs';
import { reportedRows } from '../src/handlers/shaamCheckRepresentation.mjs';
import { requestsListHtml } from './fixtures/shaamRequestsListPage.mjs';

const CHROME = process.env.PIVO_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HAVE_CHROME = existsSync(CHROME);
const GRID = JSON.parse(readFileSync(new URL('./fixtures/shaam-requests-grid-2026-09-28.json', import.meta.url), 'utf8'));
const APPROVAL = '500033345';   // בקשה 2026900021, מ"ה קוד 7
const SUSPENDED = '500000013';  // בקשה 2026900000
const TWO_REQS = '500055561';
const NOBODY = '318800007';     // אין לו שום שורה (כמו עידן רוקח)

let browser;
test.before(async () => { if (HAVE_CHROME) browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
test.after(async () => { await browser?.close(); });

async function pageWith(opts = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(requestsListHtml({ rows: GRID.rows, ...opts }));
  return page;
}
const log = (page) => page.evaluate(() => window.__log);

test('דפדפן · אין בקשה לישות: «לא נמצאו רשומות מתאימות» + «סינון לפי : מספר ישות» ⇒ none (עידן רוקח)', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith();
  const found = await findRequestRows(page, { entityId: NOBODY, expectedClientName: 'פלוני אלמוני' });
  assert.equal(found.ok, true, JSON.stringify(found));
  assert.deepEqual([found.rows.length, found.source, found.listed.noRecords], [0, 'empty_alert', true]);
  assert.equal(createPreflightDecision(found).decision, 'none');
  assert.deepEqual((await log(page)).slice(0, 2), ['clear', `search:${NOBODY}|`], '«ניקוי» לפני החיפוש');
});

test('דפדפן · שדה שנשאר מחיפוש קודם — «ניקוי» מאפס, והחיפוש לפי מספר בקשה מוצא את השורה', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ prefill: { yeshut: NOBODY } });
  const found = await findRequestRows(page, { requestNumber: '2026900021', entityId: APPROVAL, expectedClientName: 'דורית מבחן' });
  assert.equal(found.ok, true, JSON.stringify(found));
  assert.equal(found.rows.length, 1);
  assert.equal(found.rows[0].detail.requestNumber, '2026900021');
});

test('דפדפן · בקשה מלפני יותר מ-30 יום: חיפוש לפי מספר בלבד לא מוצא — לכן מחפשים לפי ישות ומסננים לפי מספר', { skip: !HAVE_CHROME }, async () => {
  // ‼ נצפה חי (28.09): «מספר בקשה» 2026462261 (12/08) ⇒ «לא נמצאו רשומות»; לפי ת.ז. — נמצאה.
  const onlyNumber = await findRequestRows(await pageWith(), { requestNumber: '2026900021', expectedClientName: 'דורית מבחן' });
  assert.deepEqual([onlyNumber.ok, onlyNumber.rows.length, onlyNumber.searchedBy], [true, 0, 'requestNumber'], 'מספר בלבד — לא נמצא (החלון של שע״ם)');
  const both = await findRequestRows(await pageWith(), { requestNumber: '2026900021', entityId: APPROVAL, expectedClientName: 'דורית מבחן' });
  assert.equal(both.ok, true, JSON.stringify(both));
  assert.deepEqual([both.searchedBy, both.rows.length, both.rows[0].detail.requestNumber], ['entityId', 1, '2026900021']);
  // מספר שאינו של האדם ⇒ שום שורה (לא שורות של בקשה אחרת).
  const other = await findRequestRows(await pageWith(), { requestNumber: '2026999999', entityId: APPROVAL });
  assert.deepEqual([other.ok, other.rows.length], [true, 0]);
});

test('דפדפן · «ניקוי» שלא ניקה ⇒ עוצרים (search_form_not_cleared), בלי חיפוש ובלי «אין בקשה»', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ prefill: { yeshut: NOBODY }, brokenClear: true });
  const found = await findRequestRows(page, { requestNumber: '2026900021', entityId: APPROVAL, expectedClientName: 'דורית מבחן' });
  assert.deepEqual([found.ok, found.reason], [false, 'search_form_not_cleared']);
  assert.equal(createPreflightDecision(found).decision, 'unreadable');
  assert.ok(!(await log(page)).some((x) => x.startsWith('search:')), 'לא חיפשנו עם סינון שגוי');
});

test('דפדפן · בדיקה עם פירוט: קוד 7 + «תיק החזר מס (91)» גלוי ⇒ tik91; מוסתר ⇒ לא', { skip: !HAVE_CHROME }, async () => {
  const p91 = await pageWith({ tik91: ['2026900021'] });
  const a = await findRequestRows(p91, { requestNumber: '2026900021', entityId: APPROVAL, expandDetails: true });
  assert.equal(a.ok, true, JSON.stringify(a));
  const [r] = reportedRows(a.rows);
  assert.deepEqual([r.systemStateCode, r.tik91, r.suspensionEndsRaw], [7, true, 'ממתין לאישור לקוח']);
  const pNot = await pageWith({ tik91: [] });
  const b = await findRequestRows(pNot, { requestNumber: '2026900021', entityId: APPROVAL, expandDetails: true });
  assert.equal(reportedRows(b.rows)[0].tik91, false, 'הטקסט קיים ב-DOM אבל מוסתר — לא ראיה');
});

test('דפדפן · שורות מהנתונים: מיקום בטבלה לשורות שבעמוד, קודים, ו«אין תיק»', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith();
  const found = await findRequestRows(page, { entityId: SUSPENDED, expectedClientName: 'אלון בדיקה' });
  assert.equal(found.ok, true, JSON.stringify(found));
  assert.equal(found.source, 'grid');
  assert.equal(found.rows.length, 3);
  assert.ok(found.rows.every((r) => Number.isInteger(r.trIndex) && Number.isInteger(r.tableIndex)));
  const w = found.rows.find((r) => r.codes.system === 5);
  assert.deepEqual([w.noFile, w.codes.systemState, w.detail.suspensionEnds], [true, 2, '06/10/2026']);
});

test('דפדפן · שתי בקשות לאותו אדם (אחת בוטלה) ⇒ הבקשה שנקלטה, והמבוטלת לא נכנסת לדיווח', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith();
  const found = await findRequestRows(page, { entityId: TWO_REQS, expectedClientName: 'ורד בדויה' });
  assert.equal(found.ok, true, JSON.stringify(found));
  const cur = currentRequestRows(found.rows);
  assert.equal(cur.requestNumber, '2026900035');
  assert.ok(reportedRows(cur.rows).every((r) => r.systemStateCode === 5));
});

// ─── 204 · הקוד האמיתי של העובד, בדפדפן אמיתי, מול מבנה מסך שלב 4 ────────────
// ‼ דף הבדיקה (fixtures/shaamStep4Page.mjs) מחקה את מבנה המסך מקוד האפליקציה
// של שע״ם — לא את שע״ם עצמה. כך נבדקים הקריאה, פתיחת הדיאלוג הנכון, ההעלאה,
// הראיה בשורה ו«המשך» האחד — כולל מקרים שאסור לייצר מול הרשות.
// ‼ דורש Chrome מקומי (PIVO_TEST_CHROME או הנתיב הרגיל). בלעדיו — מדלגים.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import {
  SHAAM_DOC_SLOTS, readDocumentsStep, documentsStepPlan, openSlotUploadDialog, inspectSlotDialog,
  uploadIntoSlot, confirmDocumentsStep, currentWizardStep,
} from '../src/shaamRepresentationSession.mjs';
import { step4Html } from './fixtures/shaamStep4Page.mjs';

const CHROME = process.env.PIVO_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HAVE_CHROME = existsSync(CHROME);
const ID = '034605212';
const NAME = 'סלע הדסה';
const WHO = { entityId: ID, expectedClientName: 'הדסה סלע' };
const [POA, IDL, , , PASS] = SHAAM_DOC_SLOTS;
const PDF = Buffer.from('%PDF-1.4\n%fixture\n');

let browser;
test.before(async () => { if (HAVE_CHROME) browser = await chromium.launch({ executablePath: CHROME, headless: true }); });
test.after(async () => { await browser?.close(); });

async function pageWith(opts) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(step4Html({ entityId: ID, name: NAME, ...opts }));
  return page;
}
const log = (page) => page.evaluate(() => window.__log);
const upload = async (page, slot, fileName = `${slot.id}.pdf`) => {
  const d = await openSlotUploadDialog(page, slot);
  assert.equal(d.ok, true, JSON.stringify(d));
  return uploadIntoSlot(page, slot, { fileName, buffer: PDF, inputIndex: d.inputIndex });
};

test('דפדפן · טופס בלבד: קריאה → «+» → דיאלוג נכון → PDF → V בשורה → «המשך» אחד → returnUpload', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1] });
  const st = await readDocumentsStep(page, WHO);
  assert.equal(st.headerEntityId, ID);
  const plan = documentsStepPlan(st);
  assert.deepEqual([plan.ok, plan.extraSlots.length], [true, 0]);
  const u = await upload(page, POA, 'הדסה סלע - ייפוי כוח חתום.pdf');
  assert.deepEqual([u.ok, u.uploadName], [true, 'הדסה סלע - ייפוי כוח חתום.pdf']);
  const c = await confirmDocumentsStep(page, { ...WHO, checkSpouse: false, expectedSlotIds: [1] });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(await currentWizardStep(page), 5);
  assert.deepEqual((await log(page)).filter((x) => x === 'hemshech'), ['hemshech'], '«המשך» פעם אחת');
});

test('דפדפן · טופס + ת.ז./רישיון: בדיקת הדיאלוג (תצוגה בלבד) לא נוגעת בשורה; ואז שני קבצים לשתי שורות', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1, 2] });
  const plan = documentsStepPlan(await readDocumentsStep(page, WHO));
  assert.deepEqual(plan.extraSlots.map((s) => s.id), [2]);
  const seen = await inspectSlotDialog(page, IDL);
  assert.deepEqual([seen.ok, seen.dialog], [true, 'dialogTeinatTzilumTz']);
  assert.ok(!(await log(page)).some((x) => x.startsWith('file:')), 'בדיקת הדיאלוג לא בחרה קובץ');
  assert.equal((await upload(page, POA)).ok, true);
  assert.equal((await upload(page, IDL, 'צילום תעודת זהות - הדסה סלע.pdf')).ok, true);
  const c = await confirmDocumentsStep(page, { ...WHO, expectedSlotIds: [1, 2] });
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.deepEqual(c.documents.map((d) => d.slotId), [1, 2]);
});

test('דפדפן · טופס + ת.ז. + דרכון: כל קובץ לשורה שלו', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1, 2, 5] });
  for (const s of [POA, IDL, PASS]) assert.equal((await upload(page, s)).ok, true, s.label);
  const files = (await log(page)).filter((x) => x.startsWith('file:'));
  assert.deepEqual(files, ['file:1:1.pdf', 'file:2:2.pdf', 'file:5:5.pdf']);
  assert.equal((await confirmDocumentsStep(page, { ...WHO, expectedSlotIds: [1, 2, 5] })).ok, true);
});

test('דפדפן · «+» של שורה פותח דיאלוג של שורה אחרת ⇒ upload_dialog_mismatch, ושום קובץ לא נבחר', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1, 2], wrongDialog: { 2: 'dialogTeinatTzilumDarkon' } });
  const d = await openSlotUploadDialog(page, IDL);
  assert.deepEqual([d.ok, d.reason], [false, 'upload_dialog_mismatch']);
  const seen = await inspectSlotDialog(page, IDL);
  assert.equal(seen.ok, false);
  assert.ok(!(await log(page)).some((x) => x.startsWith('file:')));
});

test('דפדפן · קובץ שאינו PDF ⇒ שע״ם דוחה ⇒ upload_rejected (לא «נטען»)', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1] });
  const r = await upload(page, POA, 'צילום.jpg');
  assert.deepEqual([r.ok, r.reason], [false, 'upload_rejected']);
});

test('דפדפן · שורה ריקה או שורה שלא תוכננה ⇒ «המשך» לא נלחץ', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1, 2] });
  assert.equal((await upload(page, POA)).ok, true);
  const changed = await confirmDocumentsStep(page, { ...WHO, expectedSlotIds: [1] });
  assert.equal(changed.reason, 'document_rows_changed');
  const empty = await confirmDocumentsStep(page, { ...WHO, expectedSlotIds: [1, 2] });
  assert.equal(empty.reason, 'no_file_listed');
  assert.ok(!(await log(page)).includes('hemshech'));
});

test('דפדפן · שורה שכבר נטען בה קובץ ⇒ התוכנית עוצרת; «+» לא נלחץ', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1, 2], prefilled: { 2: 'משהו.pdf' } });
  assert.equal(documentsStepPlan(await readDocumentsStep(page, WHO)).reason, 'row_already_populated');
  const d = await openSlotUploadDialog(page, IDL);
  assert.equal(d.reason, 'row_already_populated');
  assert.ok(!(await log(page)).includes('plus:2'));
});

test('דפדפן · כותרת עם ת.ז. אחרת ⇒ התוכנית עוצרת לפני כל נגיעה', { skip: !HAVE_CHROME }, async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(step4Html({ entityId: '000000273', name: 'בדיקה מיכל', shown: [1, 2] }));
  const st = await readDocumentsStep(page, WHO);
  assert.equal(documentsStepPlan(st).reason, 'documents_screen_identity_unverified');
});

test('דפדפן · נשואים: התיבה מסומנת רק כשהוכחה, לפני «המשך»', { skip: !HAVE_CHROME }, async () => {
  const page = await pageWith({ shown: [1], spouse: 'required' });
  const st = await readDocumentsStep(page, WHO);
  assert.equal(documentsStepPlan(st, { spouseSignatureConfirmed: false }).reason, 'spouse_signature_not_proven');
  const plan = documentsStepPlan(st, { spouseSignatureConfirmed: true });
  assert.equal(plan.checkSpouse, true);
  assert.equal((await upload(page, POA)).ok, true);
  const c = await confirmDocumentsStep(page, { ...WHO, checkSpouse: true, expectedSlotIds: [1] });
  assert.equal(c.ok, true, JSON.stringify(c));
});

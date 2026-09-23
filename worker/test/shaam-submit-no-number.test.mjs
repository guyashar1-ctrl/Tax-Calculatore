// ─── שידור הטופס החתום כשמספר הבקשה לא מוצג ברשימה (23.09.2026) ────────────
// ‼ המקרה האמיתי של הדסה סלע: «בדוק» מצא שלוש שורות בשע״ם, אבל מספר הבקשה
// לא נחשף. השידור מאתר את הבקשה לפי ישות + שם, ועוצר לפני העלאה אם הייחוס
// אינו חד-משמעי. כאן נבדק שהכלל הזה טהור, חד, ושאין לו מסלול עוקף.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { singleAttributedRequest, openedScreenMatches } from '../src/shaamRepresentationSession.mjs';
import { run } from '../src/handlers/shaamSubmitPoa.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** שלוש השורות כפי שנקראו בפועל מהרשימה (הדסה סלע, 23.09.2026). */
const HADASSA = [
  { tableIndex: 1, trIndex: 4, date: '23/09/2026', clientName: 'סלע הדסה', requestState: 'המתנה למסמכים', system: 'מס הכנסה', detail: {} },
  { tableIndex: 1, trIndex: 6, date: '23/09/2026', clientName: 'סלע הדסה', requestState: 'המתנה למסמכים', system: 'מעמ', detail: {} },
  { tableIndex: 1, trIndex: 8, date: '23/09/2026', clientName: 'סלע הדסה', requestState: 'המתנה למסמכים', system: 'ניכויים', detail: {} },
];

test('29 · שורות הדסה — בקשה אחת; לוחצים על השורה הראשונה שיוחסה, לפי מיקומה', () => {
  const r = singleAttributedRequest(HADASSA);
  assert.equal(r.ok, true);
  assert.equal(r.row.trIndex, 4);
  assert.equal(r.row.tableIndex, 1);
  assert.equal(r.requestNumber, null);
});

test('29 · מערך כפול — שתי בקשות פתוחות אפשריות ⇒ עצירה', () => {
  const r = singleAttributedRequest([...HADASSA, { ...HADASSA[0], trIndex: 12 }]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ambiguous_request');
});

test('29 · תאריכי הזנה שונים ⇒ עצירה', () => {
  const r = singleAttributedRequest([HADASSA[0], { ...HADASSA[1], date: '01/08/2026' }]);
  assert.equal(r.reason, 'ambiguous_request');
});

test('29 · מצבי בקשה שונים ⇒ עצירה', () => {
  const r = singleAttributedRequest([HADASSA[0], { ...HADASSA[1], requestState: 'מסמכים אושרו' }]);
  assert.equal(r.reason, 'ambiguous_request');
});

test('29 · שני מספרי בקשה שונים בפירוט ⇒ עצירה; מספר אחד ⇒ מוחזר', () => {
  const two = singleAttributedRequest([
    { ...HADASSA[0], detail: { requestNumber: '2026000001' } },
    { ...HADASSA[1], detail: { requestNumber: '2026000002' } },
  ]);
  assert.equal(two.reason, 'ambiguous_request');
  const one = singleAttributedRequest([
    { ...HADASSA[0], detail: { requestNumber: '2026000001' } }, HADASSA[1],
  ]);
  assert.equal(one.ok, true);
  assert.equal(one.requestNumber, '2026000001');
});

test('29 · אין שורות ⇒ לא נמצא; מיקום לא נקרא ⇒ עצירה', () => {
  assert.equal(singleAttributedRequest([]).reason, 'request_not_found_in_list');
  const { trIndex, ...noIndex } = HADASSA[0];
  assert.equal(singleAttributedRequest([noIndex]).reason, 'ambiguous_request');
});

test('29 · המסך שנפתח — ת.ז. (גם בלי אפס מוביל) או שם מלא בכל סדר; אחרת עצירה', () => {
  const id = '034605212';
  assert.equal(openedScreenMatches('טעינת מסמכים למיוצג 34605212 סלע הדסה', { entityId: id }), true);
  assert.equal(openedScreenMatches('טעינת מסמכים למיוצג 034605212', { entityId: id }), true);
  assert.equal(openedScreenMatches('טעינת מסמכים למיוצג סלע הדסה', { entityId: id, expectedClientName: 'הדסה סלע' }), true);
  assert.equal(openedScreenMatches('טעינת מסמכים למיוצג לזימי שמעון 312359193', { entityId: id, expectedClientName: 'הדסה סלע' }), false);
  assert.equal(openedScreenMatches('טעינת מסמכים למיוצג הדסה כהן', { entityId: id, expectedClientName: 'הדסה סלע' }), false);
  assert.equal(openedScreenMatches('', { entityId: id, expectedClientName: 'הדסה סלע' }), false);
});

test('29 · בלי מספר בקשה, בלי שם — נעצר לפני כל פנייה לשע״ם', async () => {
  const ctx = { job: { id: 'j', progress: {} }, workerId: 'w', log() {} };
  await assert.rejects(
    run(ctx, { submissionKey: 'person:client', role: 'client', entityId: '034605212', signedDocumentId: 'd' }),
    (e) => e.code === 'missing_request_number',
  );
});

test('29 · הטופס כבר שודר ⇒ אין שידור שני', async () => {
  const ctx = { job: { id: 'j', progress: {} }, workerId: 'w', log() {} };
  await assert.rejects(
    run(ctx, {
      submissionKey: 'person:client', role: 'client', entityId: '034605212', personName: 'הדסה סלע',
      signedDocumentId: 'd', alreadySubmittedAt: '2026-09-23T19:00:00Z',
    }),
    (e) => e.code === 'already_submitted',
  );
});

test('29 · סדר ההגנות בקוד: ייחוס ואימות המסך — לפני סימון הנגיעה; העלאה והמשך — פעם אחת', () => {
  const s = src('../src/handlers/shaamSubmitPoa.mjs');
  const at = (needle) => { const i = s.indexOf(needle); assert.ok(i > 0, `חסר: ${needle}`); return i; };
  const gate = at('assertNotAlreadyAttempted(progress');
  const locate = at('await openRequestForDocuments(');
  const ambiguous = at("opened.reason === 'ambiguous_request'");
  const unverified = at("opened.reason === 'cannot_verify_opened_request'");
  const mark = at("markExternalAttempt('upload_signed_form')");
  const upload = at('await uploadSignedForm(');
  assert.ok(gate < locate && locate < ambiguous && ambiguous < mark && unverified < mark && mark < upload,
    'שער «כבר נוסה» → איתור → עצירות זהות → סימון נגיעה → העלאה');
  assert.equal((s.match(/await uploadSignedForm\(/g) || []).length, 1, 'העלאה אחת בלבד');
  assert.equal((s.match(/await confirmDocumentsStep\(/g) || []).length, 1, '«המשך» אחד בלבד');
  assert.ok(!/for\s*\(|while\s*\(|\.retry|attempt\s*\+\+/.test(s), 'אין לולאה ואין מונה ניסיונות');
  // ‼ «נשלח» רק אחרי ראיית קליטה, ותוצאה לא ודאית אינה «נשלח».
  assert.ok(s.lastIndexOf('submitted: true,') > s.indexOf('await confirmDocumentsStep('), 'submitted רק אחרי האישור');
  assert.equal((s.match(/submitted: true,/g) || []).length, 1, 'מקום אחד בלבד מחזיר submitted');
  assert.ok(s.slice(mark).includes("'ambiguous_submit_result'"), 'כשל אחרי הנגיעה = תוצאה לא ידועה');
});

test('29 · בסשן: ניסיון בלי מספר לוחץ על השורה שיוחסה, ומאמת את המסך לפני שחוזר', () => {
  const s = src('../src/shaamRepresentationSession.mjs');
  const fn = s.slice(s.indexOf('export async function openRequestForDocuments'));
  assert.ok(fn.includes('singleAttributedRequest(found.rows)'), 'ייחוס חד-משמעי לפני לחיצה');
  assert.ok(fn.indexOf('openedScreenMatches(') > fn.indexOf('currentWizardStep(page)'), 'אימות המסך אחרי הפתיחה');
  assert.ok(!fn.slice(0, fn.indexOf('\n}')).includes('uploadSignedForm'), 'הפונקציה מנווטת בלבד');
});

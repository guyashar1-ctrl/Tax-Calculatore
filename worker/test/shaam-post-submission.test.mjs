// ─── בדיקות העובד: מחזור החיים אחרי ההגשה (201) ──────────────────────────────
// ‼ פונקציות טהורות בלבד — בלי Playwright ובלי רשת.
//
//   node --test worker/test/shaam-post-submission.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseRequestDetailText, attributeRows } from '../src/shaamRepresentationSession.mjs';
import { allRowsAccepted } from '../src/handlers/shaamCheckRepresentation.mjs';

test('201 · פירוט הבקשה בניסוח האמיתי (הדסה, 2026538930)', () => {
  const d = parseRequestDetailText('מספר בקשה: 2026538930 מספר לקוח: 034605212 צפי לסיום השהייה: 06/10/2026');
  assert.equal(d.requestNumber, '2026538930');
  assert.equal(d.entityId, '034605212');
  assert.equal(d.suspensionEnds, '06/10/2026');
});

test('201 · גם הניסוח הישן נקרא («צפוי», «ישות הלקוח», בלי נקודתיים)', () => {
  const d = parseRequestDetailText('מספר בקשה 2026495063 ת. עדכון מערך 01/09/2026 צפוי לסיום השהייה 15/09/2026 ישות הלקוח 12345678');
  assert.equal(d.requestNumber, '2026495063');
  assert.equal(d.systemUpdatedAt, '01/09/2026');
  assert.equal(d.suspensionEnds, '15/09/2026');
  assert.equal(d.entityId, '12345678');
});

test('201 · «צפי לסיום השהייה» שאינו תאריך נשמר כטקסט — לא ממציאים תאריך', () => {
  const d = parseRequestDetailText('צפי לסיום השהייה: הסתיימה מספר בקשה: 2026538930');
  assert.equal(d.suspensionEnds, 'הסתיימה');
  assert.equal(d.requestNumber, '2026538930');
});

test('201 · פירוט ריק או חסר ⇒ אין שדות', () => {
  assert.deepEqual(parseRequestDetailText(''), {});
  assert.deepEqual(parseRequestDetailText(undefined), {});
  assert.deepEqual(parseRequestDetailText('סלע הדסה מס הכנסה ראשי'), {});
});

test('201 · «מספר לקוח» בלי אפס מוביל הוא אותה ישות', () => {
  const r = attributeRows(
    [{ clientName: 'סלע הדסה', detail: { requestNumber: '2026538930', entityId: '34605212' } }],
    { requestNumber: '2026538930', entityId: '034605212', searchedBy: 'requestNumber' },
  );
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
});

test('201 · לקוח אחר בפירוט ⇒ עצירה (fail closed)', () => {
  const r = attributeRows(
    [{ clientName: 'סלע הדסה', detail: { requestNumber: '2026538930', entityId: '012345678' } }],
    { requestNumber: '2026538930', entityId: '034605212', searchedBy: 'requestNumber' },
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'identity_mismatch');
});

test('201 · בקשה אחרת בפירוט, חיפוש לפי מספר ⇒ עצירה', () => {
  const r = attributeRows(
    [{ clientName: 'סלע הדסה', detail: { requestNumber: '2026000001' } }],
    { requestNumber: '2026538930', entityId: '034605212', searchedBy: 'requestNumber' },
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'identity_mismatch');
});

test('201 · חיפוש לפי ישות: שורות של בקשה אחרת (מספר מפורט) לא נכנסות', () => {
  const r = attributeRows(
    [
      { clientName: 'סלע הדסה', detail: { requestNumber: '2026538930' } },
      { clientName: 'סלע הדסה', detail: { requestNumber: '2026111111' } },
    ],
    { requestNumber: '2026538930', entityId: '034605212', searchedBy: 'entityId', expectedClientName: 'הדסה סלע' },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => x.detail.requestNumber), ['2026538930']);
});

test('201 · «השהייה» / «ממתין לאישור לקוח» / «ממתין לפתיחת תיק» אינם «נקלט»', () => {
  for (const s of ['השהייה', 'ממתין לאישור לקוח', 'ממתין לפתיחת תיק', '']) {
    assert.equal(allRowsAccepted([{ rawSystemState: 'נקלט בהצלחה' }, { rawSystemState: s }]), false, s);
  }
  assert.equal(allRowsAccepted([{ rawSystemState: 'נקלט בהצלחה' }, { rawSystemState: 'נקלט בהצלחה' }]), true);
});

test('201 · הבדיקה פותחת פירוט רק כקריאה, והשידור לא מרחיב שורות', () => {
  const check = readFileSync(new URL('../src/handlers/shaamCheckRepresentation.mjs', import.meta.url), 'utf8');
  assert.match(check, /expandDetails:\s*true/);
  assert.match(check, /observedAt/);
  const session = readFileSync(new URL('../src/shaamRepresentationSession.mjs', import.meta.url), 'utf8');
  // openRequestForDocuments (השידור) קורא לרשימה בלי expandDetails — trIndex משמש שם ללחיצה.
  const open = session.slice(session.indexOf('export async function openRequestForDocuments'));
  const call = /findRequestRows\(page, \{[^}]*\}\)/.exec(open)?.[0] ?? '';
  assert.ok(call && !/expandDetails/.test(call), call);
  // מסנן ההרחבה חוסם כל פקד שנראה כמו פעולה אצל הרשות.
  assert.match(session, /forbidden = \/ביטול\|מחיק/);
});

test('201 · השידור מדווח מסמכים נוספים לפני העצירה, ולא מעלה אותם', () => {
  const submit = readFileSync(new URL('../src/handlers/shaamSubmitPoa.mjs', import.meta.url), 'utf8');
  const report = submit.indexOf('shaamRequiredDocuments');
  const plan = submit.indexOf('documentsStepPlan(opened.documents');
  const touch = submit.indexOf("markExternalAttempt('upload_signed_form')");
  assert.ok(report > 0 && report < plan && plan < touch, 'הדיווח קודם להחלטה, וההחלטה קודמת לכל נגיעה');
});

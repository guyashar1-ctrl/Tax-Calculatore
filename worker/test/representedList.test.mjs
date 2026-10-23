// representedList.test.mjs — «רשימת מיוצגים» (מבנה שנצפה חי 23.10.2026; נתוני דמה).
//   node --test test/representedList.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepresentedList, incomeTaxFieldsFrom, searchIsUnfiltered } from '../src/representedList.mjs';
import { reshBody, reshPost } from './fixtures/represented-list-sample.mjs';

const F = '123456789';

test('שורה לכל נושא מס: ראשי/נוסף, ארכה והרשאה לחיוב — בחיפוש אחד', () => {
  const r = parseRepresentedList(reshBody(F), { fileNumber: F, post: reshPost(F) });
  assert.equal(r.ok, true);
  const it = r.rows.find((x) => x.subject === 'income_tax');
  assert.deepEqual(it, { subject: 'income_tax', subjectRaw: 'מס הכנסה', repType: 'נוסף', extensionUntil: '30/11/2026', extensionSource: 'למיוצגים', debitAccount: '12-170-48047' });
  const vat = r.rows.find((x) => x.subject === 'vat');
  assert.equal(vat.debitAccount, null);
  assert.equal(vat.extensionUntil, null, '«0» אינו ארכה');
  assert.deepEqual(incomeTaxFieldsFrom(r.rows), { repType: 'נוסף', debitAuthorization: 'קיימת · 12-170-48047', extensionUntil: '30/11/2026', extensionSource: 'למיוצגים' });
});

test('בלי הרשאה ⇒ «אין הרשאה»', () => {
  const r = parseRepresentedList(reshBody(F, { debit: false, extension: null, itRep: 'ראשי' }), { fileNumber: F, post: reshPost(F) });
  assert.deepEqual(incomeTaxFieldsFrom(r.rows), { repType: 'ראשי', debitAuthorization: 'אין הרשאה' });
});

test('סינון פעיל במסך (למשל «הרשאה לחיוב חשבון» מסומן) ⇒ לא משתמשים — היעדר אינו מוכח', () => {
  assert.equal(parseRepresentedList(reshBody(F), { fileNumber: F, post: reshPost(F, { harshaaCheshbon: 1 }) }).reason, 'filters_active');
  assert.equal(searchIsUnfiltered(reshPost(F, { tarTchilatYezugMe: '01/01/2026' }), F), false);
  assert.equal(searchIsUnfiltered(reshPost(F, { kodMaarach: 1 }), F), false);
  assert.equal(searchIsUnfiltered(reshPost('987654321'), F), false, 'חיפוש של תיק אחר');
  assert.equal(searchIsUnfiltered(null, F), false);
});

test('שורה של תיק אחר בתשובה ⇒ לא משתמשים', () => {
  const b = reshBody(F); b.listReshMeyuzagim[0].iORmMisTikMeyuzag = 999;
  assert.equal(parseRepresentedList(b, { fileNumber: F, post: reshPost(F) }).reason, 'other_file_rows');
});

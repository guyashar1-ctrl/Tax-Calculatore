// ─── בדיקות: ניקוי מידע אישי בעותקי staging ─────────────────────────────────
// ‼ רגרסיה לממצא 23.09.2026: ת.ז. אמיתיות עברו ל-staging דרך tax_files
// ודרך identification, כי אלה לא היו ברשימת החסימה. המזהים כאן סינתטיים.
//
//   node --test scripts/staging-anonymize.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubTaxFiles, syntheticIdentification, redactSecrets, findRealIdLeaks } from './staging-anonymize.mjs';

const REAL = '123456782';
const SYN = '100000007';

test('tax_files: מספר התיק (= ת.ז. אצל יחיד) מוחלף; מבנה התיק נשמר', () => {
  const out = scrubTaxFiles([
    { id: 'a', authority: 'income_tax', owner: 'client', repStatus: 'active', fileNumber: REAL },
    { id: 'b', authority: 'vat', owner: 'client', repStatus: 'none' },
  ], SYN);
  assert.equal(out[0].fileNumber, SYN);
  assert.equal(out[0].authority, 'income_tax');
  assert.equal(out[0].repStatus, 'active');
  assert.equal('fileNumber' in out[1], false, 'תיק בלי מספר נשאר בלי מספר');
  assert.equal(scrubTaxFiles(null, SYN), null);
});

test('identification: כל ערך אישי מוחלף, שדות מבניים נשמרים', () => {
  const out = syntheticIdentification({
    idNumber: REAL, firstName: 'אמיתי', lastName: 'אמיתי', birthDate: '1990-05-05', address: 'רחוב אמיתי 9',
    city: 'עיר אמיתית', email: 'real@example.com', phone: '054-1234567', secondaryType: 'id_card',
    secondaryValue: '98765432', familyStatus: 'married', familyStatusYear: 2020,
  }, { idNumber: SYN, firstName: 'לקוח1' });
  assert.equal(out.idNumber, SYN);
  assert.equal(out.firstName, 'לקוח1');
  assert.equal(out.lastName, 'בדיקה');
  assert.equal(out.email, 'delivered@resend.dev');
  assert.equal(out.secondaryValue, '0000000');
  assert.equal(out.secondaryType, 'id_card', 'סוג המסמך — מבני');
  assert.equal(out.familyStatus, 'married', 'מצב משפחתי — מבני');
  assert.ok(!JSON.stringify(out).includes(REAL));
  assert.ok(!JSON.stringify(out).includes('אמיתי'));
});

test('redactSecrets: מחליף בכל עומק, לא נוגע במה שאינו סוד', () => {
  const out = redactSecrets({ activity: [{ text: 'שוחחתי עם דנה כהן על התיק', at: '2026-01-01' }], n: 5 }, new Set(['דנה כהן', 'x']));
  assert.equal(out.activity[0].text, 'שוחחתי עם בדיקה על התיק');
  assert.equal(out.activity[0].at, '2026-01-01');
  assert.equal(out.n, 5);
});

test('findRealIdLeaks: מוצא ת.ז. בכל עומק ומחזיר נתיב בלי הערך; אפסים מובילים לא מסתירים', () => {
  const hits = findRealIdLeaks(new Set(['023456782']), {
    clients: [{ id: 'c1', tax_files: [{ fileNumber: '23456782' }], id_number: SYN }],
    representation_requests: [{ id: 'r1', identification: { idNumber: '023456782' } }, { id: 'r2', identification: { idNumber: SYN } }],
  });
  assert.deepEqual(hits, [
    { table: 'clients', rowId: 'c1', path: 'tax_files.[].fileNumber' },
    { table: 'representation_requests', rowId: 'r1', path: 'identification.idNumber' },
  ]);
  assert.ok(!JSON.stringify(hits).includes('23456782'), 'הערך עצמו לא יוצא');
});

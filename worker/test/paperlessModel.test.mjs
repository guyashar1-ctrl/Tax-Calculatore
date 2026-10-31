// ─── בדיקות: פייפרלס — מה ראינו בטבלת הריטיינר, ומה מותר לעשות (304) ─────────
// הצורות כפי שנצפו חי ב-26.10.2026 (worker/test/fixtures/paperless-2026-10-26/README.md),
// עם נתוני דמה.
//
//   node --test worker/test/paperlessModel.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  paymentMethodFromLabel, findRetainerClient, observationFrom, retainerPlan, matchDealer, sameId,
} from '../src/paperlessModel.mjs';

// לקוח שהזין כרטיס וחויב פעמיים · לקוחה חדשה שנמשכה והוגדרה בלי כרטיס · עוסק שלא נמשך.
const CLIENTS = [
  { sID: 'c1', sNumber: '000000018', sBusinessName: 'מספרה לדוגמה', Payment: { Type: 3, sCreditNumber: '1234' },
    fee: { iMonthlyFee: 252, iMonthlyFeePaymentType: 31, sCardSuffix: '1234' }, bIsBU: true, sPLID: 'd1' },
  { sID: 'c2', sNumber: '000000026', sBusinessName: 'ישראלה ישראלי', fee: { iMonthlyFee: 250, iMonthlyFeePaymentType: 31 },
    bIsBU: true, sPLID: 'd2' },
  { sID: 'c3', sNumber: '000000034', sBusinessName: 'משרד אחר', fee: {} },
];
const FEES = [
  { sID: 'f1', sClientID: 'c1', iFee: 297.36, sPeriod: '2609', bCharged: true },
  { sID: 'f2', sClientID: 'c1', iFee: 297.36, sPeriod: '2608', bCharged: true },
  { sID: 'f3', sClientID: 'c1', iFee: 297.36, sPeriod: '2610' },
  { sID: 'f4', sClientID: 'c2', iFee: 295, sPeriod: '2610' },
];

test('אמצעי תשלום מהטקסט בטבלה; טקסט לא מוכר לא מנוחש', () => {
  assert.equal(paymentMethodFromLabel('סליקת אשראי'), 'credit');
  assert.equal(paymentMethodFromLabel(' העברה  בנקאית '), 'bank');
  assert.equal(paymentMethodFromLabel('לא לתשלום'), 'none');
  assert.equal(paymentMethodFromLabel(''), 'none');
  assert.equal(paymentMethodFromLabel('ביט'), 'unknown');
});

test('ת״ז בלי אפסים מובילים ובלי סימנים', () => {
  assert.ok(sameId('000000018', '18'));
  assert.ok(sameId('20-591-7354', '205917354'));
  assert.ok(!sameId('', ''));
});

test('לקוח שהזין כרטיס וחויב', () => {
  const o = observationFrom({ clientsAll: CLIENTS, fees: FEES, idNumber: '18', row: { paymentLabel: 'סליקת אשראי', withVatText: '297.36' } });
  assert.equal(o.inRetainer, true);
  assert.equal(o.paymentMethod, 'credit');
  assert.equal(o.amountBeforeVat, 252);
  assert.equal(o.amountWithVat, 297.36);
  assert.equal(o.cardEntered, true);
  assert.deepEqual(o.chargedPeriods, ['2608', '2609']);
});

test('לקוחה חדשה: נמשכה והוגדרה, בלי כרטיס ובלי חיוב', () => {
  const o = observationFrom({ clientsAll: CLIENTS, fees: FEES, idNumber: '26', row: { paymentLabel: 'סליקת אשראי', withVatText: '295' } });
  assert.equal(o.cardEntered, false);
  assert.deepEqual(o.chargedPeriods, []);
  assert.equal(o.businessNumber, '000000026');
});

test('לא בריטיינר (לא נמשך) ⇒ לא נמצא; לא נמצא כלל ⇒ ריק', () => {
  const o = observationFrom({ clientsAll: CLIENTS, fees: FEES, idNumber: '34' });
  assert.equal(o.inRetainer, false);
  assert.equal(o.dealerFound, false);
  const none = observationFrom({ clientsAll: CLIENTS, fees: FEES, idNumber: '999' });
  assert.equal(none.inRetainer, false);
  assert.equal(none.paymentMethod, null);
});

test('שני לקוחות עם אותה ת״ז ⇒ ambiguous, לא בוחרים', () => {
  const twice = [...CLIENTS, { ...CLIENTS[1], sID: 'c9' }];
  assert.equal(findRetainerClient(twice, '26').ambiguous, true);
  assert.equal(observationFrom({ clientsAll: twice, fees: [], idNumber: '26' }).ambiguous, true);
});

test('תכנית: חדש לגמרי ⇒ אשראי + סכום', () => {
  const p = retainerPlan({ paymentMethod: 'none', amountBeforeVat: null }, { monthlyBeforeVat: 250 });
  assert.deepEqual(p, { setPayment: true, setAmount: true, conflict: null });
});

test('תכנית: כבר מוגדר כמו בהסכם ⇒ כלום (אידמפוטנטי)', () => {
  const p = retainerPlan({ paymentMethod: 'credit', amountBeforeVat: 250 }, { monthlyBeforeVat: 250 });
  assert.deepEqual(p, { setPayment: false, setAmount: false, conflict: null });
});

test('לא דורסים: סכום אחר ⇒ conflict בלי פעולה', () => {
  const p = retainerPlan({ paymentMethod: 'credit', amountBeforeVat: 200 }, { monthlyBeforeVat: 250 });
  assert.equal(p.setAmount, false);
  assert.equal(p.setPayment, false);
  assert.deepEqual(p.conflict, { paperlessBeforeVat: 200, agreedBeforeVat: 250, paperlessPayment: 'credit' });
});

test('לא דורסים: העברה בנקאית ⇒ conflict', () => {
  const p = retainerPlan({ paymentMethod: 'bank', amountBeforeVat: null }, { monthlyBeforeVat: 250 });
  assert.ok(p.conflict);
  assert.equal(p.setPayment, false);
});

test('«עדכן לסכום שבהסכם» (override) ⇒ מעדכן', () => {
  const p = retainerPlan({ paymentMethod: 'credit', amountBeforeVat: 200 }, { monthlyBeforeVat: 250, overrideAmount: true });
  assert.deepEqual(p, { setPayment: false, setAmount: true, conflict: null });
});

test('עוסק: לפי ת״ז; אחרת לפי שם — רק כשיש בדיוק אחד בלי ת״ז', () => {
  const ds = [
    { sID: 'd1', sFirstName: 'ישראלה', sFamilyName: 'ישראלי', sBusinessNumber: '' },
    { sID: 'd2', sFirstName: 'משה', sFamilyName: 'כהן', sBusinessNumber: '000000026' },
  ];
  assert.equal(matchDealer(ds, { idNumber: '26' }).dealer.sID, 'd2');
  assert.equal(matchDealer(ds, { idNumber: '42', firstName: 'ישראלה', lastName: 'ישראלי' }).dealer.sID, 'd1');
  assert.equal(matchDealer(ds, { idNumber: '42', firstName: 'אחר', lastName: 'לגמרי' }).dealer, null);
  const twins = [...ds, { sID: 'd3', sFirstName: 'ישראלה', sFamilyName: 'ישראלי', sBusinessNumber: '' }];
  assert.equal(matchDealer(twins, { idNumber: '42', firstName: 'ישראלה', lastName: 'ישראלי' }).ambiguous, true);
  // עוסק שיש לו ת״ז אחרת לא נבחר לפי שם.
  const other = [{ sID: 'd4', sFirstName: 'ישראלה', sFamilyName: 'ישראלי', sBusinessNumber: '000000059' }];
  assert.equal(matchDealer(other, { idNumber: '42', firstName: 'ישראלה', lastName: 'ישראלי' }).dealer, null);
});

// ── 316 · קריאת הריטיינר כולו וטבלת הממתינים ─────────────────────────────────
import { retainerSnapshot, parsePendingRows } from '../src/paperlessModel.mjs';

test('retainerSnapshot: לכל לקוח כרטיס, סכום וחודשים; חודש הגבייה נשמר', () => {
  const clients = [
    { sID: 'a', sNumber: '012345678', sBusinessName: 'עסק א', sPLID: 'p1', fee: { iMonthlyFee: 365, iMonthlyFeePaymentType: 31, sCardSuffix: '1234' } },
    { sID: 'b', sNumber: '22', sBusinessName: 'עסק ב', fee: { iMonthlyFee: '', iMonthlyFeePaymentType: 7 } },
  ];
  const fees = [
    { sClientID: 'a', sPeriod: '2609', iFee: 431, bCharged: true, dtCharged: '2026-09-27' },
    { sClientID: 'a', sPeriod: '2608', iFee: 431, bCharged: true },
    { sClientID: 'a', sPeriod: '2610', iFee: 431, bCharged: false },
  ];
  const s = retainerSnapshot({ clients, fees, period: 2610, invoiceDate: '2026-10-31' });
  assert.equal(s.period, '2610');
  assert.deepEqual(s.clients[0].fees.map(f => [f.period, f.charged]), [['2608', true], ['2609', true], ['2610', false]]);
  assert.equal(s.clients[0].cardEntered, true);
  assert.equal(s.clients[0].paymentMethod, 'credit');
  assert.equal(s.clients[0].idNumber, '012345678');
  assert.equal(s.clients[1].amountBeforeVat, null);
  assert.equal(s.clients[1].paymentMethod, 'unknown');
  assert.equal(s.clients[1].fees.length, 0);
});

test('parsePendingRows: שורה לכל לקוח, סה״כ מחושב ושורת הסיכום נפרדת', () => {
  const rows = [
    ['1', 'גרוסמן יובל', 'יובל גרוסמן', 'מורשה', '10', '0', ''],
    ['2', 'סימנטוב אילן', 'אילן סימנטוב מספרה', 'פטור', '1', '0', ''],
    ['', '', '', '', '11', '0', ''],
  ];
  const p = parsePendingRows(rows);
  assert.equal(p.clients.length, 2);
  assert.equal(p.total, 11);
  assert.equal(p.tableTotal, 11);
  assert.deepEqual(p.clients[1], { name: 'סימנטוב אילן', business: 'אילן סימנטוב מספרה', type: 'פטור', all: 1, upcoming: 0 });
  assert.deepEqual(parsePendingRows([]).clients, []);
});

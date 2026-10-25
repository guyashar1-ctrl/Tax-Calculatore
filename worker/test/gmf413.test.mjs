// 413 «הנפקת אישורים שנתיים» — פענוח ותכנית השיעור. המבנה נלקח מתשובת GetIshur שנצפתה חי
// ב-25.10.2026 (שמות ומספרים הוחלפו בדוגמה).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIshur, plannedRates, rateFromError, ratesText, decToIso } from '../src/gmf413.mjs';

const NOW = new Date('2026-10-25T09:00:00Z');
const hkt = (cur, tkn, sw) => ({ ahzKdm: cur, ahzCur: cur, ahzTkn: tkn, swSeif: sw });
const prt = (year = 2026) => ({ isurYear: year, OPrtTikIsr: { misYeshut: 123456782, misTikMH: 22334455 } });
const NEW_FORM = {
  lstHkt: [hkt(5, 30, true), hkt(0, 30, false), hkt(0, 40, false), hkt(5, 47, true), hkt(0, 47, false), hkt(5, 35, true)],
  moneLikuim: 0, objPrtIsr: prt(),
};

const validWithholding = {
  lstTeurEfun: ['עסק חדש', null, null, null, null],
  objIsrKayam: {
    isn: 20000001, kodMazav: 910, teurMazav: 'יש אישור (יזום)',
    decTokefMe: 20261025, decTokefAd: 20270331, taIdkun: 20261025,
    lstAhuzim: [5, null, null, 5, null, 5], objPrtIsr: prt(), kodMazavGfm: 910,
  },
  objIsrNew: NEW_FORM,
};
const noneWithholding = {
  lstTeurEfun: [null, null, null, null, null],
  objIsrKayam: { isn: 0, kodMazav: 220, teurMazav: 'ממתין לייזום', decTokefAd: 0 },
  objIsrNew: NEW_FORM,
};

test('decToIso', () => {
  assert.equal(decToIso(20270331), '2027-03-31');
  assert.equal(decToIso(0), null);
});

test('אישור הקטנות בתוקף — שיעורים, תוקף, עסק חדש, מזהה', () => {
  const r = parseIshur(validWithholding, 'withholding', { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.valid, true);
  assert.equal(r.entity, '123456782');
  assert.equal(r.year, 2026);
  assert.equal(r.validUntil, '2027-03-31');
  assert.equal(r.updatedOn, '2026-10-25');
  assert.deepEqual(r.rates, [{ section: 'שירותים', rate: 5 }, { section: 'שכר', rate: 5 }, { section: 'שכירות', rate: 5 }]);
  assert.equal(r.newBusiness, true);
  assert.equal(ratesText(r.rates), '5% · שירותים, שכר, שכירות');
});

test('אין אישור — לא בתוקף, בלי שיעורים; הסעיפים מהטופס', () => {
  const r = parseIshur(noneWithholding, 'withholding', { now: NOW });
  assert.equal(r.valid, false);
  assert.equal(r.statusText, 'ממתין לייזום');
  assert.deepEqual(r.rates, []);
  assert.equal(r.entity, '123456782', 'המזהה מהטופס כשאין אישור קיים');
  assert.deepEqual(r.sections.filter((s) => s.editable).map((s) => s.section), ['שירותים', 'שכר', 'שכירות']);
});

test('אישור שתוקפו עבר אינו בתוקף, גם עם קוד 910', () => {
  const old = structuredClone(validWithholding);
  old.objIsrKayam.decTokefAd = 20260331;
  assert.equal(parseIshur(old, 'withholding', { now: NOW }).valid, false);
});

test('ניהול ספרים בתוקף — בלי שיעורים', () => {
  const b = structuredClone(validWithholding);
  b.objIsrKayam.lstAhuzim = [];
  const r = parseIshur(b, 'bookkeeping', { now: NOW });
  assert.equal(r.valid, true);
  assert.deepEqual(r.rates, []);
});

test('פטור מלא = 99', () => {
  const ex = structuredClone(validWithholding);
  ex.objIsrKayam.lstAhuzim = [99, null, null, 99, null, 99];
  const r = parseIshur(ex, 'withholding', { now: NOW });
  assert.equal(ratesText(r.rates), 'פטור מלא');
});

test('התכנית: הנמוך ביותר — פטור מלא כשמותר', () => {
  const info = parseIshur(noneWithholding, 'withholding', { now: NOW });
  const p = plannedRates(info, null);
  assert.deepEqual(p.rows.map((r) => r.exempt), [true, true, true]);
  assert.equal(p.reason, null);
});

test('התכנית: עסק חדש ⇒ 5% במקום פטור, עם הסבר', () => {
  const info = parseIshur({ ...noneWithholding, lstTeurEfun: ['עסק חדש'] }, 'withholding', { now: NOW });
  const p = plannedRates(info, null);
  assert.deepEqual(p.rows.map((r) => r.rate), [5, 5, 5]);
  assert.ok(p.rows.every((r) => !r.exempt));
  assert.match(p.reason, /5%/);
});

test('התכנית: שיעור מבוקש, לא מעל שיעור התקנות', () => {
  const info = parseIshur(noneWithholding, 'withholding', { now: NOW });
  assert.deepEqual(plannedRates(info, 10).rows.map((r) => r.rate), [10, 10, 10]);
  assert.deepEqual(plannedRates(info, 40).rows.map((r) => r.rate), [30, 40, 35]);
});

test('התכנית: שותפות לא יורדת מתחת לשיעור המוצע', () => {
  const info = parseIshur({ ...noneWithholding, swShutfut: true }, 'withholding', { now: NOW });
  assert.deepEqual(plannedRates(info, null).rows.map((r) => r.rate), [5, 5, 5]);
});

test('rateFromError — רק כשיש מספר', () => {
  assert.equal(rateFromError('לא ניתן להקטין את שיעור הניכוי מעבר ל 5% עבור עסק חדש/עוסק מורשה חדש'), 5);
  assert.equal(rateFromError('לא בוצעו שינויים'), null);
});

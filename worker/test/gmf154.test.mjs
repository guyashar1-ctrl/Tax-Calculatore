// gmf154.test.mjs — פענוח שאילתה 154 מתשובות ה-JSON (מבנה שנצפה חי 21.10.2026).
//   node --test test/gmf154.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaxYears, openYears, advanceStateOf, dmyToIso, pageHasExistingYear } from '../src/gmf154.mjs';
import { sample154, head154, table154 } from './fixtures/gmf154-sample.mjs';

const parse = (s, fileNumber = '123456789') => parseTaxYears({ head: s.head, pages: s.pages, fileNumber });

test('ראש התיק — אותם ערכים ואותה צורה כמו 134', () => {
  const r = parse(sample154());
  assert.equal(r.ok, true);
  assert.equal(r.fields.taxOffice, '26 - רחובות');
  assert.equal(r.fields.fileType, '52');
  assert.equal(r.fields.unit, '2');
  assert.equal(r.fields.economicIndustry, '6921');
});

test('יתרה = סך יתרת חוב פחות סך יתרת זכות (חיובי = חוב)', () => {
  assert.equal(parse(sample154({ hov: 1200, zhut: 200 })).fields.balance, '1000');
  assert.equal(parse(sample154({ hov: 0, zhut: 4430 })).fields.balance, '-4430');
  assert.equal(parse(sample154({ hov: 0, zhut: 0 })).fields.balance, '0');
});

test('חייב ולא הוגש — רק «חייב בהגשה» בלי תאריך הגשה; לא «לא חייב» ולא «שנה לא קיימת»', () => {
  const r = parse(sample154());
  assert.deepEqual(openYears(r.filing).map((y) => y.year), [2023, 2019]);
  const y2023 = r.filing.years.find((y) => y.year === 2023);
  assert.equal(y2023.legalDue, '2024-04-30');
  assert.equal(y2023.extension, '2024-08-31');
  assert.equal(y2023.extensionSource, 'הכנה');
  const y2021 = r.filing.years.find((y) => y.year === 2021);
  assert.equal(y2021.required, 'not_required');
  assert.equal(y2021.filedOn, '2025-11-08', 'הוגש גם בלי חובה — נשמר כהגשה');
});

test('שנים מכל העמודים, בלי כפילות, מהחדשה לישנה; «מלא» רק כשהעמוד האחרון ריק', () => {
  const s = sample154();
  const all = parse(s);
  assert.deepEqual(all.filing.years.map((y) => y.year).slice(0, 7), [2025, 2024, 2023, 2022, 2021, 2020, 2019]);
  assert.equal(all.filing.complete, true);
  const two = parseTaxYears({ head: s.head, pages: s.pages.slice(0, 2), fileNumber: '123456789' });
  assert.equal(two.filing.complete, false, 'בעמוד 2 יש עוד שנים קיימות — לא קראנו הכול');
  assert.equal(pageHasExistingYear(s.pages[2]), false);
  assert.equal(pageHasExistingYear(s.pages[1]), true);
});

test('הצהרת הון: «דרישה עד …» עם שנה ומועד; בלי דרישה — «אין דרישה»', () => {
  const r = parse(sample154());
  assert.equal(r.fields.wealthDemand, 'דרישה עד 31/12/2026 · שנת 2025');
  assert.equal(r.fields.wealthDemandDue, '2026-12-31');
  const none = sample154();
  none.pages[0].tableData.allZhanData = { zhanMone: 0, zhanArr: [] };
  assert.equal(parse(none).fields.wealthDemand, 'אין דרישה');
  assert.equal(parse(none).fields.wealthDemandDue, undefined);
});

test('טקסט הצהרת הון לא מוכר — נשמר כלשונו, בלי מועד מומצא', () => {
  const s = sample154();
  s.pages[0].tableData.allZhanData.zhanArr = [{ text: 'הוגשה', shantMas: 2024, isDatePass: true }];
  const r = parse(s);
  assert.equal(r.fields.wealthDemand, 'הוגשה · שנת 2024');
  assert.equal(r.fields.wealthDemandDue, undefined);
});

test('מקדמות: «לא נדרש» ו«בוטלה» מכריעים; כל טקסט אחר ⇒ צריך 134', () => {
  assert.equal(advanceStateOf('לא נדרש'), 'no_advance');
  assert.equal(advanceStateOf('בוטלה (שעור דו)'), 'cancelled');
  assert.equal(advanceStateOf('שעור דו'), 'active');
  assert.equal(advanceStateOf(''), 'active');
  const cancelled = parse(sample154({ sugDrisha: 'בוטלה (שעור דו)' }));
  assert.equal(cancelled.fields.advanceStatus, 'cancelled');
  assert.equal(cancelled.fields.advanceStatusRaw, 'בוטלה (שעור דו)');
  const active = parse(sample154({ sugDrisha: 'שעור דו' }));
  assert.equal(active.advance, 'active');
  assert.equal(active.fields.advanceStatus, undefined, 'פעילות — השיעור והסטטוס מגיעים מ-134');
});

test('תיק אחר במסך ⇒ לא קוראים ממנו דבר; אפסים מובילים אינם שוני', () => {
  assert.deepEqual(parse(sample154(), '987654321'), { ok: false, reason: 'file_mismatch' });
  const lead = sample154({ fileNumber: '034605212' });
  assert.equal(parseTaxYears({ head: lead.head, pages: lead.pages, fileNumber: '034605212' }).ok, true);
});

test('קוד חבות שלא נצפה ⇒ other, ולא חובה', () => {
  const s = { head: head154(), pages: [table154([{ year: 2025, hayav: 'required' }])] };
  s.pages[0].tableData.kodHayav = ['משהו חדש'];
  s.pages[0].tableData.kodHayavCode = [199];
  const r = parse(s);
  assert.equal(r.filing.years[0].required, 'other');
  assert.equal(openYears(r.filing).length, 0);
});

test('שגיאה מהשרת או תשובה חסרה ⇒ לא ok', () => {
  const s = sample154();
  s.pages[0].rc = 8; s.pages[0].rcText = 'תקלה';
  assert.equal(parse(s).reason, 'table_error');
  assert.equal(parseTaxYears({ head: null, pages: [], fileNumber: '1' }).reason, 'head_missing');
});

test('dmyToIso', () => {
  assert.equal(dmyToIso(' דרישה עד 31/12/2026'), '2026-12-31');
  assert.equal(dmyToIso(''), null);
  assert.equal(dmyToIso('2026-12-31'), null);
});

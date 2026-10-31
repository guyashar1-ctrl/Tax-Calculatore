// gmf134.test.mjs — «מצב דיווח» מ-getTikData של 134 (מבנה שנצפה חי 23.10.2026; נתוני דמה).
//   node --test test/gmf134.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingFrom134, periodLabel } from '../src/gmf134.mjs';
import { tik134 } from './fixtures/gmf134-sample.mjs';

test('המונה של שע״ם 0 ⇒ «אין דיווחים חסרים», עם התקופות כלשונן', () => {
  const r = reportingFrom134(tik134());
  assert.equal(r.status, 'אין דיווחים חסרים');
  assert.deepEqual(r.periods.map((p) => `${p.period} ${p.status}`), [
    '01-02/2026 דווח', '03-04/2026 דווח', '05-06/2026 דווח', '07-08/2026 דווח', '09-10/2026 טרם הגיע המועד', '11-12/2026 טרם הגיע המועד',
  ]);
});

test('חסר ⇒ התקופות שאינן «דווח» / «טרם הגיע המועד» / «פטור»', () => {
  const r = reportingFrom134(tik134({ missing: { 202607: 'לא דווח', 202605: 'לא דווח' } }));
  assert.equal(r.status, 'חסר דיווח: 05-06/2026, 07-08/2026');
});

test('מונה חיובי בלי תקופה מזוהה ⇒ מספר בלבד; בלי מונה ⇒ לא מכריעים', () => {
  const t = tik134(); t.moneDvcChaser = 2;
  assert.equal(reportingFrom134(t).status, 'חסרים 2 דיווחים');
  const n = tik134(); delete n.moneDvcChaser;
  assert.equal(reportingFrom134(n).status, null);
  assert.equal(reportingFrom134(null).status, null);
});

test('periodLabel', () => {
  assert.equal(periodLabel(202607, 202608), '07-08/2026');
  assert.equal(periodLabel(202607, 202607), '07/2026');
  assert.equal(periodLabel(998, 998), null);
});

// 31.10.2026 · ההחלטה והתשלומים (נצפה חי, קריאה בלבד; נתוני דמה)
test('advanceDetailsFrom134: «עודכן ב», «חודש שינוי», ההחלטה, ותשלום לכל תקופה — בלי שורות הסיכום ובלי שם האדם', async () => {
  const { advanceDetailsFrom134 } = await import('../src/gmf134.mjs');
  const t = { ...tik134(), tDvc: 20260329, hodeshTchula: 202603, hodeshDrisha1: 202601, hachlata: 'דרישת שעור', sibatHachlataMsrd: 'הגדלה ע"פ בקשה', goremMdvc: 'מייצגים', shemMdvc: 'שם אדם' };
  t.lstTkufot = t.lstTkufot.map((r) => (r.misMikForSchum ? { ...r, machzor: 20000, hiuv: 3000, tash: r.mazavDvc === 'דווח' ? 3000 : 0, nikuy: 0, tDvc: r.mazavDvc === 'דווח' ? 20260409 : 0 } : r));
  t.lstTkufot.push({ misMikForSchum: null, tkufaMe: 999, tkufa: 0, machzor: 80000, hiuv: 12000, tash: 12000 });
  const d = advanceDetailsFrom134(t);
  assert.equal(d.updatedOn, '2026-03-29');
  assert.equal(d.changeMonth, '2026-03');
  assert.equal(d.firstMonth, '2026-01');
  assert.equal(d.decision, 'דרישת שעור — הגדלה ע"פ בקשה');
  assert.equal(d.updatedBy, 'מייצגים');
  assert.ok(!JSON.stringify(d).includes('שם אדם'), 'שם האדם לא נשמר');
  assert.equal(d.periods.length, 6);
  assert.deepEqual(d.periods[0], { from: '2026-01', to: '2026-02', status: 'דווח', code: 1, turnover: 20000, charge: 3000, paid: 3000, withheld: 0, reportedOn: '2026-04-09' });
  assert.equal(d.periods[5].status, 'טרם הגיע המועד');
  assert.equal(d.periods[5].reportedOn, null);
  assert.equal(advanceDetailsFrom134(null), null);
  assert.equal(advanceDetailsFrom134({ tDvc: 0 }).updatedOn, null);
});

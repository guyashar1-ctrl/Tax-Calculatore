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

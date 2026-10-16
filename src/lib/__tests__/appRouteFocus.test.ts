// ─── קישור לשורת בקשה: ‎#/client/<id>/journey/<stepId>‎ (16.10.2026) ──────────────
// ‼ «כל עבודה היא בקשה»: קישור לעבודה (מ«מס › עבודות לקוחות», קישורים ישנים) נוחת בשורה שלה ב«בקשות».
//   הכתובת הקיימת ‎#/client/<id>/<tab>‎ לא משתנה; השורה — רק עם לשונית.

import { test, equal, deepEqual } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { formatRoute, parseHash } from '../appRoute';

export const TESTS: TestCase[] = [
  test('לקוח + לשונית + שורה — הלוך וחזור', () => {
    equal(formatRoute({ view: 'form', clientId: 'c1', clientTab: 'journey', clientFocus: 's9' }), '/client/c1/journey/s9');
    deepEqual(parseHash('#/client/c1/journey/s9'), { view: 'form', clientId: 'c1', clientTab: 'journey', clientFocus: 's9' });
  }),
  test('הכתובות הקיימות לא השתנו', () => {
    deepEqual(parseHash('#/client/c1/taxfile'), { view: 'form', clientId: 'c1', clientTab: 'taxfile' });
    deepEqual(parseHash('#/client/c1'), { view: 'form', clientId: 'c1', clientTab: undefined });
    equal(formatRoute({ view: 'form', clientId: 'c1', clientTab: 'journey' }), '/client/c1/journey');
  }),
  test('שורה בלי לשונית — לא נכתבת לכתובת', () => {
    equal(formatRoute({ view: 'form', clientId: 'c1', clientFocus: 's9' }), '/client/c1');
  }),
];

// ─── בדיקות: «לא נבדקה» מול «נבדקה ואינה מוכנה» ─────────────────────────────
// ‼ 23.09.2026: אחרי הפעלת העובד מחדש, representation = {ready:false,
// checkedAt:1970}. זו שכבה שלא נבדקה — לא שכבה מנותקת.

import { test, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { layerNeverChecked } from '../shaamReadiness';

export const TESTS: TestCase[] = [
  test('checkedAt 1970 / חסר / לא תקין ⇒ לא נבדקה', () => {
    equal(layerNeverChecked({ ready: false, checkedAt: '1970-01-01T00:00:00.000Z' }), true);
    equal(layerNeverChecked({ ready: false }), true);
    equal(layerNeverChecked(undefined), true);
    equal(layerNeverChecked({ ready: false, checkedAt: 'x' }), true);
  }),
  test('נבדקה (גם אם לא מוכנה) ⇒ לא «לא נבדקה»', () => {
    equal(layerNeverChecked({ ready: false, checkedAt: '2026-09-23T20:24:34.381Z' }), false);
    equal(layerNeverChecked({ ready: true, checkedAt: '2026-09-23T20:24:34.381Z' }), false);
  }),
];

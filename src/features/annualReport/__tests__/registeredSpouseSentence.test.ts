// ─── בדיקות: משפט בן/בת הזוג הרשום/ה ────────────────────────────────────────
// ‼ המשפט לא נשען על שדה המגדר בכרטיס: אצל לקוחה אמיתית נשמר שם "male",
// והמסך כתב «הדסה סלע הוא בן הזוג הרשום».

import type { Client } from '../../../types';
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { registeredSpouseSentence } from '../profile';

const client = {
  firstName: 'הדסה', lastName: 'סלע', gender: 'male',
  spouseName: 'יאיר סלע', spouse: { firstName: 'יאיר', lastName: 'סלע' },
} as unknown as Client;

export const TESTS: TestCase[] = [
  test('מגדר שגוי בכרטיס אינו משנה את הניסוח', () => {
    const s = registeredSpouseSentence(client, 'client');
    equal(s, 'התיק במס הכנסה רשום על שם הדסה סלע');
    assert(!s.includes('הוא בן הזוג'), s);
  }),
  test('בן/בת הזוג — אותו ניסוח, השם של בן/בת הזוג', () => {
    const s = registeredSpouseSentence(client, 'spouse');
    assert(s.startsWith('התיק במס הכנסה רשום על שם ') && s.includes('יאיר'), s);
  }),
];

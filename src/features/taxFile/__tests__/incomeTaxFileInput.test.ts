// ─── בדיקות: מספר התיק לקריאה ממס הכנסה ──────────────────────────────────────
// ‼ תהליך הייצוג אינו ממלא «מספר תיק», ולכן קריאת התיק נופלת לת.ז. של
// בן/בת הזוג הרשום/ה. אצל זוג שטרם הוכרע מי רשום — חסימה, לא ניחוש.

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, TaxFileInfo } from '../../../types';
import { incomeTaxFileInput } from '../incomeTaxFileInput';

function client(over: Partial<Client>): Client {
  return {
    firstName: 'שמעון', lastName: 'לוי', idNumber: '312359193',
    familyStatus: 'single', spouseName: '', spouseIdNumber: '',
    ...over,
  } as unknown as Client;
}

const itFile = (over: Partial<TaxFileInfo>): TaxFileInfo =>
  ({ id: 'tf', authority: 'income_tax', owner: 'client', repStatus: 'active', ...over });

const blocked = (res: ReturnType<typeof incomeTaxFileInput>): string => {
  assert('blocked' in res, `expected blocked, got ${JSON.stringify(res)}`);
  return res.blocked;
};

export const TESTS: TestCase[] = [
  test('מספר תיק שהוזן גובר על הכול', () => {
    deepEqual(incomeTaxFileInput(client({ taxFiles: [itFile({ fileNumber: '0-2232-1673' })] })), { fileNumber: '022321673' });
  }),
  test('גרוש בלי שורת תיק ⇒ הת.ז. שלו', () => {
    deepEqual(incomeTaxFileInput(client({ familyStatus: 'divorced' })), { fileNumber: '312359193' });
  }),
  test('רווק בלי ת.ז. ⇒ חסום', () => {
    assert(blocked(incomeTaxFileInput(client({ idNumber: '' }))).includes('ת.ז.'), 'הודעה על ת.ז. חסרה');
  }),
  test('נשוי, הוכרע: בת הזוג רשומה ⇒ הת.ז. שלה', () => {
    deepEqual(incomeTaxFileInput(client({
      familyStatus: 'married', spouseName: 'רחל לוי', spouseIdNumber: '022321673',
      registeredSpouseVerified: true, taxFiles: [itFile({ owner: 'spouse' })],
    })), { fileNumber: '022321673' });
  }),
  test('נשוי, הוכרע: הוא רשום ⇒ הת.ז. שלו', () => {
    deepEqual(incomeTaxFileInput(client({
      familyStatus: 'married', spouseName: 'רחל לוי', spouseIdNumber: '022321673',
      registeredSpouseVerified: true, taxFiles: [itFile({ owner: 'client' })],
    })), { fileNumber: '312359193' });
  }),
  test('נשוי שטרם הוכרע ⇒ חסום, לא ניחוש', () => {
    const msg = blocked(incomeTaxFileInput(client({
      familyStatus: 'married', spouseName: 'רחל לוי', spouseIdNumber: '022321673',
      taxFiles: [itFile({ owner: 'client' })],
    })));
    assert(msg.includes('לא סומן'), msg);
  }),
  test('נשוי בלי שורת תיק ⇒ חסום גם אם סומן «אומת»', () => {
    blocked(incomeTaxFileInput(client({ familyStatus: 'married', spouseName: 'רחל לוי', registeredSpouseVerified: true })));
  }),
  test('נשוי, הוכרע, אין ת.ז. לרשומה ⇒ חסום עם שמה', () => {
    const msg = blocked(incomeTaxFileInput(client({
      familyStatus: 'married', spouseName: 'רחל לוי', spouseIdNumber: '',
      registeredSpouseVerified: true, taxFiles: [itFile({ owner: 'spouse' })],
    })));
    equal(msg.includes('רחל לוי'), true, msg);
  }),
];

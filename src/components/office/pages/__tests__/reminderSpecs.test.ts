// ─── בדיקות: שדה המספר בתזכורות («אחרי [5] ימים», «עד [2] פעמים») ───────────
// ‼ ההגבלה לטווח קורית רק בעזיבה / Enter. הגבלה בכל הקשה הפכה מחיקה ל-1,
// ואז «7» ל-17 — ו«שמירה» שמרה ערך שלא הוקלד (תזכורות ללקוחות יצאו במועד אחר).
import { test, equal } from '../../../../testkit/tinyTest';
import type { TestCase } from '../../../../testkit/tinyTest';
import { numCommit, numDigits, numLive } from '../reminderSpecs';

/** הקלדה כמו בשדה: כל תו עובר דרך numDigits, ומה שבטווח עובר מיד. */
function type(start: string, keys: string, min: number, max: number) {
  let text = start;
  let live: number | null = null;
  for (const k of keys) {
    text = numDigits(k === '⌫' ? text.slice(0, -1) : text + k);
    const n = numLive(text, min, max);
    if (n !== null) live = n;
  }
  return { text, live };
}

export const TESTS: TestCase[] = [
  test('מחיקה והקלדה של 7 נותנת 7 — לא 1 ולא 17', () => {
    const r = type('', '7', 1, 60);
    equal(r.text, '7');
    equal(r.live, 7);
    equal(numCommit(r.text, 1, 60, 5), 7);
  }),

  test('«עד [2] פעמים»: מחיקה ו-4 נותנת 4 — לא 5', () => {
    const r = type('2', '⌫4', 1, 5);
    equal(r.text, '4');
    equal(r.live, 4);
    equal(numCommit(r.text, 1, 5, 2), 4);
  }),

  test('ריק בזמן ההקלדה — מותר, ולא עובר; בעזיבה חוזר לערך הקודם', () => {
    equal(numLive('', 1, 60), null);
    equal(numCommit('', 1, 60, 5), 5);
  }),

  test('מחוץ לטווח: לא עובר בזמן ההקלדה; בעזיבה — הגבול הקרוב', () => {
    equal(numLive('70', 1, 60), null);
    equal(numCommit('70', 1, 60, 5), 60);
    equal(numLive('0', 1, 60), null);
    equal(numCommit('0', 1, 60, 5), 1);
  }),

  test('רק ספרות: אותיות, מינוס ונקודה לא נכנסים', () => {
    equal(numDigits('1a2'), '12');
    equal(numDigits('-3'), '3');
    equal(numDigits('4.5'), '45');
    equal(numDigits('١٢'), '', 'ספרות לא-לטיניות אינן מספר כאן');
  }),
];

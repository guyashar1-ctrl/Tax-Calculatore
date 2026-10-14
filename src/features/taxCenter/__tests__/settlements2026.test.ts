// ─── בדיקות: רשימת היישובים המוטבים 2026 — הודעת ינואר + שינויים (10.10.2026) ──
// ‼ מה נעול כאן:
//   · השינויים מלוח הניכויים של אפריל 2026 (16 שינויים, 5 תוספות) מוחלים — והרשימה
//     של ינואר נשארת כפי שפורסמה (גרסה קודמת נשמרת, לא נדרסת).
//   · שם שמשתנה חייב להיות ברשימת ינואר; שם שנוסף — לא.
//   · לשנה שאין לה רשימה (2027) מוחזרת רשימת 2026 מסומנת fallback.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  ELIGIBLE_SETTLEMENTS_2026, ELIGIBLE_SETTLEMENTS_2026_CURRENT, SETTLEMENTS_2026_AMENDMENTS,
  getEligibleSettlements, resolveSettlement, settlementListStatus,
} from '../../../data/eligibleSettlements';

export const TESTS: TestCase[] = [
  test('16 שינויים ו-5 תוספות; רשימת ינואר לא נדרסה', () => {
    const changed = SETTLEMENTS_2026_AMENDMENTS.filter(a => a.kind === 'changed');
    const added = SETTLEMENTS_2026_AMENDMENTS.filter(a => a.kind === 'added');
    equal(changed.length, 16);
    equal(added.length, 5);
    const jan = new Map(ELIGIBLE_SETTLEMENTS_2026.map(s => [s.name, s]));
    for (const a of changed) assert(jan.has(a.name), `${a.name} ברשימת ינואר`);
    for (const a of added) assert(!jan.has(a.name), `${a.name} לא ברשימת ינואר`);
    equal(jan.get('רוחמה')?.ratePercent, 7, 'הודעת ינואר נשמרת כפי שפורסמה');
    equal(ELIGIBLE_SETTLEMENTS_2026_CURRENT.length, ELIGIBLE_SETTLEMENTS_2026.length + 5);
  }),

  test('הרשימה בתוקף: רוחמה 14% עד 180,000, עכו 226,560, אשקלון נוספה — עם הסבר', () => {
    const r = resolveSettlement('רוחמה', 2026)!;
    equal(r.ratePercent, 14);
    equal(r.ceilingAnnual, 180_000);
    assert(r.amendment?.includes('בהודעת ינואר: 7%'), 'הערך הקודם מוצג בהסבר');
    equal(resolveSettlement('עכו', 2026)?.ceilingAnnual, 226_560);
    equal(resolveSettlement('אשקלון', 2026)?.ratePercent, 7);
    equal(resolveSettlement('אשקלון', 2025), undefined, 'אשקלון לא חלה על 2025');
    equal(resolveSettlement('רוחמה', 2025)?.ratePercent, 7, '2025 לא השתנתה');
  }),

  test('2027 — רשימת 2026 מסומנת fallback', () => {
    equal(settlementListStatus(2027).fallback, true);
    equal(settlementListStatus(2026).fallback, false);
    equal(getEligibleSettlements(2027), ELIGIBLE_SETTLEMENTS_2026_CURRENT);
  }),
];

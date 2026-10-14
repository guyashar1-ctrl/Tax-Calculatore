// ─── בדיקות: נקודות זיכוי — הורה אחד ושירות לאומי (10.10.2026) ──────────────
// ‼ מה נעול כאן (מדריך 2025, עמ׳ 69, 94, 95):
//   · «הורה אחד» מקבל את שני מסלולי הילדים, ועוד נקודה.
//   · שירות לאומי — אותם ספים כמו שירות סדיר.

import { test, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { calcCreditPointsV2 } from '../creditPoints';

const total = (r: ReturnType<typeof calcCreditPointsV2>) => r.lines.reduce((a, l) => a + l.points, 0);

export const TESTS: TestCase[] = [
  test('הורה אחד, ילד בן 10: 2.25 + 0.5 + (2 + 1) + 1 = 6.75', () => {
    const r = calcCreditPointsV2({ year: 2026, gender: 'female', children: [{ birthYear: 2016 }], isSoleParent: true }, 2_904);
    equal(total(r), 6.75);
  }),
  test('לא הורה אחד, אותו ילד: 2.25 + 0.5 + 2 = 4.75', () => {
    const r = calcCreditPointsV2({ year: 2026, gender: 'female', children: [{ birthYear: 2016 }] }, 2_904);
    equal(total(r), 4.75);
  }),
  test('פרוד שהילדים בחזקתו: +1 (40(ב)(2), מדריך עמ׳ 95)', () => {
    const r = calcCreditPointsV2({ year: 2026, gender: 'female', children: [{ birthYear: 2016 }], custodialSeparatedParent: true }, 2_904);
    equal(total(r), 5.75);
  }),
  test('נער/ה 16 עד 18 (40ב): נקודה בגיל 16 ו-17 בלבד', () => {
    equal(total(calcCreditPointsV2({ year: 2026, gender: 'male', children: [], teenBirthYear: 2010 }, 2_904)), 3.25);
    equal(total(calcCreditPointsV2({ year: 2026, gender: 'male', children: [], teenBirthYear: 2008 }, 2_904)), 2.25);
  }),
  test('מסיימי 2014 עד 2022: הנקודה בשנה שאחרי הסיום, או בזו שאחריה לפי בחירה', () => {
    const d = (defer: boolean, year: number) => total(calcCreditPointsV2({ year, gender: 'male', children: [], degrees: [{ kind: 'bachelor', endYear: 2022, deferToSecondYear: defer }] }, 2_904));
    equal(d(false, 2023), 3.25); equal(d(false, 2024), 2.25);
    equal(d(true, 2023), 2.25); equal(d(true, 2024), 3.25);
  }),
];

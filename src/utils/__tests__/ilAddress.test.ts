// ─── בדיקות: כתובת מרשימה סגורה ויישוב מזכה (285, 21.10.2026) ─────────────────
// ‼ מה נעול כאן:
//   · הפורמט שהטופס בונה הוא הפורמט שהשרת מפרק (_il_address_parts) — אותם מקרים
//     כמו ב-supabase/tests/test-285-address.sql.
//   · כל יישוב מזכה בכל שנה מחובר לסמל רשמי, או מסומן במפורש שאין לו.
//   · אותו יישוב בשם אחר בשנה אחרת נמצא לפי הסמל.

import { test, equal, assert, deepEqual } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { composeAddress, normIl, searchByName, splitAddress, findByName } from '../ilAddress';
import { getEligibleSettlements, resolveSettlement } from '../../data/eligibleSettlements';
import { SETTLEMENT_LOCALITY_CODES, SETTLEMENTS_WITHOUT_LOCALITY_CODE } from '../../data/eligibleSettlementCodes';

export const TESTS: TestCase[] = [
  test('נרמול: כתיב מלא/חסר, גרש ומקף', () => {
    equal(normIl('קריית שמונה'), normIl('קרית שמונה'));
    equal(normIl("ג'וליס"), 'גוליס');
    equal(normIl('אל־רום'), 'אל רום');
    equal(normIl('  תל אביב - יפו '), 'תל אביב יפו');
  }),
  test('בנייה ופירוק: רחוב, מספר, דירה', () => {
    const a = composeAddress('הרצל', '8', '3');
    equal(a, 'הרצל 8, דירה 3');
    deepEqual(splitAddress(a), { street: 'הרצל', house: '8', apartment: '3' });
    deepEqual(splitAddress('רחוב הרצל 8/2'), { street: 'הרצל', house: '8', apartment: '2' });
    deepEqual(splitAddress('הרצל 8 ד׳ 4'), { street: 'הרצל', house: '8', apartment: '4' });
    equal(composeAddress('בארי', '', ''), 'בארי');
  }),
  test('«דוד 3» אינו דירה 3', () => {
    deepEqual(splitAddress('דוד 3'), { street: 'דוד', house: '3', apartment: '' });
  }),
  test('רחוב שבשמו מספר — מזוהה כשלם כשהרשימה ידועה', () => {
    const streets = [{ code: 1, name: 'דרך 4' }];
    deepEqual(splitAddress('דרך 4', streets), { street: 'דרך 4', house: '', apartment: '' });
  }),
  test('חיפוש: ערים לפני יישובים במועצה אזורית, מתחילים-ב לפני מכילים', () => {
    const list = [
      { code: 1, name: 'שדה דוד', municipal: false },
      { code: 2, name: 'שדרות', municipal: true },
      { code: 3, name: 'נווה שדה', municipal: false },
    ];
    deepEqual(searchByName(list, 'שד').map(x => x.name), ['שדרות', 'שדה דוד', 'נווה שדה']);
    equal(findByName(list, 'שדרות')?.code, 2);
    equal(findByName(list, 'שד'), undefined);
  }),
  test('כל יישוב מזכה בכל שנה — עם סמל רשמי או מסומן במפורש', () => {
    const missing: string[] = [];
    for (const y of [2025, 2026]) {
      for (const s of getEligibleSettlements(y)) {
        if (!SETTLEMENT_LOCALITY_CODES[s.name] && !SETTLEMENTS_WITHOUT_LOCALITY_CODE[s.name]) missing.push(`${y}:${s.name}`);
      }
    }
    deepEqual(missing, []);
  }),
  test('«מולדה» לא חוברה ל«מולדת» (269)', () => {
    equal(SETTLEMENT_LOCALITY_CODES['מולדה'], undefined);
    assert(!!SETTLEMENTS_WITHOUT_LOCALITY_CODE['מולדה'], 'מולדה מסומנת');
  }),
  test('אותו יישוב בשם אחר בשנה אחרת — לפי הסמל', () => {
    const in2025 = resolveSettlement('אבו קורינאת (יישוב)', 2025);
    assert(!!in2025, 'נמצא ב-2025');
    equal(SETTLEMENT_LOCALITY_CODES[in2025!.name], SETTLEMENT_LOCALITY_CODES['אבו קורינאת (יישוב)']);
    equal(resolveSettlement('שדרות', 2026)?.ratePercent, 20);
  }),
];

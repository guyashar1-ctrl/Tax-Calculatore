// ─── בדיקות: «הפעלת מסלול» ללקוח אחד — מה התכנון אומר לפני שלוחצים ────────────
// ‼ מה נעול כאן:
//   · השם הפרטי של בן/בת הזוג — כלל אחד עם השרת (client_spouse_first_name, 215): השדה
//     המפוצל, ואם ריק — המילה הראשונה של «שם בן/בת הזוג». כרטיס עם השם המשורשר בלבד
//     לא מעלים את בן/בת הזוג מ«לכל אדם».
//   · נשוי/אה בלי שום שם בכרטיס — התכנון אומר שלא ייפתח לבן/בת הזוג ואיפה משלימים.
//   · סוג עוסק לא ידוע במסלול ידני/שנתי — משפט אחד לשלב ולפריט: לא ייפתח עכשיו, ויוצע
//     ב«מה מוצע» אחרי שקובעים אותו (לא «ייפתח לבד»).
//   · התנאים של «לבד» — מהקטלוג (AUTO_ACTION_GATES), לא עותק שני בחלון.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import {
  clientFactsFromCard, spouseFirstNameOf, spouseNameMissing, KIND_LATER_TEXT, SPOUSE_NAME_MISSING_TEXT,
} from '../StartFlowDialog';
import { KIND_UNKNOWN_TEXT } from '../../../features/flows/preview';
import SOURCE from '../StartFlowDialog.tsx?raw';

const card = (p: Partial<Client>) => ({ familyStatus: 'single', spouseName: '', ...p }) as Client;
const LATIN = /[A-Za-z_]{3,}/;

export const TESTS: TestCase[] = [
  test('השם הפרטי של בן/בת הזוג: השדה המפוצל, ואם ריק — המילה הראשונה של השם המלא', () => {
    equal(spouseFirstNameOf(card({ spouseFirstName: 'רחל', spouseName: 'רוחלה כהן' })), 'רחל');
    equal(spouseFirstNameOf(card({ spouseFirstName: '  ', spouseName: ' רחל  כהן ' })), 'רחל');
    equal(spouseFirstNameOf(card({ spouseName: 'רחל כהן' })), 'רחל');
    equal(spouseFirstNameOf(card({ spouseFirstName: 'אנה מריה', spouseName: '' })), 'אנה מריה', 'שם פרטי כפול נשאר שלם');
    equal(spouseFirstNameOf(card({})), '');
  }),

  test('נשוי/אה עם «שם בן/בת הזוג» בלבד ⇒ «לכל אדם» כולל את בן/בת הזוג (כמו השרת)', () => {
    const f = clientFactsFromCard(card({ familyStatus: 'married', spouseName: 'רחל כהן' }));
    equal(f.married, true);
    equal(f.hasSpouse, true);
    equal(clientFactsFromCard(card({ familyStatus: 'married', spouseName: 'רחל כהן', spouseClientId: 'c2' })).hasSpouse, false,
      'בן/בת זוג עם כרטיס משלו — העבודה נוצרת מהכרטיס שלו/ה');
    equal(clientFactsFromCard(card({ familyStatus: 'single', spouseName: 'רחל כהן' })).hasSpouse, false);
  }),

  test('נשוי/אה בלי שום שם בכרטיס ⇒ התכנון אומר שלא ייפתח לבן/בת הזוג, ואיפה משלימים', () => {
    assert(spouseNameMissing(card({ familyStatus: 'married' })), 'אין שם');
    assert(!spouseNameMissing(card({ familyStatus: 'married', spouseName: 'רחל' })), 'יש שם');
    assert(!spouseNameMissing(card({ familyStatus: 'married', spouseClientId: 'c2' })), 'כרטיס משלו — לא חסר');
    assert(!spouseNameMissing(card({ familyStatus: 'single' })), 'לא נשוי');
    equal(clientFactsFromCard(card({ familyStatus: 'married' })).hasSpouse, false);
    assert(/תיק המס/.test(SPOUSE_NAME_MISSING_TEXT) && /«משפחה ובן\/בת זוג»/.test(SPOUSE_NAME_MISSING_TEXT),
      'המשפט מפנה לשורה בתיק המס: ' + SPOUSE_NAME_MISSING_TEXT);
    assert(!LATIN.test(SPOUSE_NAME_MISSING_TEXT), 'בלי קודים');
  }),

  test('סוג עוסק לא ידוע — משפט אחד: לא ייפתח עכשיו, ויוצע ב«מה מוצע» (לא «ייפתח לבד»)', () => {
    assert(KIND_LATER_TEXT.startsWith(KIND_UNKNOWN_TEXT), KIND_LATER_TEXT);
    assert(/«מה מוצע»/.test(KIND_LATER_TEXT), 'שם הכפתור האמיתי בשורת המסלול');
    assert(!/ייפתח אחרי ש|יחכה לסוג/.test(KIND_LATER_TEXT), 'לא מבטיח פתיחה לבד');
    // השלב והפריט קוראים לאותו קבוע — ואין בחלון נוסח שני.
    const uses = SOURCE.split('KIND_LATER_TEXT').length - 1;
    assert(uses >= 3, `KIND_LATER_TEXT בהגדרה, בשלב ובפריט (${uses})`);
    assert(!SOURCE.includes('ייפתח אחרי שקובעים אותו בתיק המס, אם הוא מתאים'), 'הנוסח הישן של השלב');
    assert(!SOURCE.includes('יוצע להוסיף אם מתאים'), 'הנוסח הישן של הפריט');
  }),

  test('התנאים של «לבד» — AUTO_ACTION_GATES מהקטלוג, בלי עותק בחלון', () => {
    assert(/import \{ AUTO_ACTION_GATES \} from '\.\/builder\/ItemSheet'/.test(SOURCE), 'מייבא את הקטלוג');
    assert(SOURCE.includes('{AUTO_ACTION_GATES}'), 'מציג אותו ליד התיבה');
    assert(!SOURCE.includes('ולא נקרא השבוע'), 'העותק הישן של התנאים ירד');
    assert(!SOURCE.includes('כשמחשב העבודה פנוי — אחרת תחכה לך'), 'גם ההעתק החלקי בשורת הפריט');
  }),
];

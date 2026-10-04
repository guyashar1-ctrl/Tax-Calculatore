// ─── בדיקות: שם בן/בת הזוג בתיק המס — שם פרטי ושם משפחה, והשם המלא נגזר ──────────
// ‼ החוזה: «משפחה ובן/בת זוג» עורכת שם פרטי ושם משפחה בלבד; «שם בן/בת הזוג» נשמר כשרשור
// שלהם (כמו הקליטה, 110) — כך מה שהמסלולים, ביטוח לאומי והדף האישי קוראים (השם הפרטי)
// ומה שהתיק מציג (השם המלא) לא נפרדים. כרטיס שיש בו רק השם המשורשר נפתח לעריכה מפוצל.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { GOVERNED_FACT_KEYS } from '../../../types/taxFacts';
import {
  EDIT_SECTIONS, EDIT_FIELD_BY_KEY, editFieldValue, spouseNameParts, withSpouseFullName,
} from '../editModel';
import TAB_SOURCE from '../../../components/clientTabs/TaxFileTab.tsx?raw';

const card = (p: Partial<Client>) => ({ familyStatus: 'married', spouseName: '', ...p }) as Client;

export const TESTS: TestCase[] = [
  test('«מצב משפחתי ובן/בת זוג»: שם פרטי ושם משפחה — לא «שם בן/בת הזוג» כשדה נפרד', () => {
    const fam = EDIT_SECTIONS.find(s => s.id === 'famStatus')!;
    const keys = fam.fields.map(f => f.key);
    assert(keys.includes('spouseFirstName') && keys.includes('spouseLastName'), JSON.stringify(keys));
    assert(!keys.includes('spouseName'), 'השם המלא אינו נערך בנפרד — הוא נגזר');
    for (const k of ['spouseFirstName', 'spouseLastName']) {
      const f = EDIT_FIELD_BY_KEY[k];
      assert(f && !f.governed, `${k} נשמר במסלול הרגיל (update_client_fields)`);
      assert(!GOVERNED_FACT_KEYS.has(k), `${k} אינו עובדה מנוהלת — השרת היה דוחה אותו`);
    }
  }),

  test('כרטיס עם השם המשורשר בלבד — העריכה נפתחת מפוצלת (כמו המילוי של 110)', () => {
    deepEqual(spouseNameParts(card({ spouseName: 'רחל כהן' })), { first: 'רחל', last: 'כהן' });
    deepEqual(spouseNameParts(card({ spouseName: ' רחל  בן דוד ' })), { first: 'רחל', last: 'בן דוד' });
    deepEqual(spouseNameParts(card({ spouseFirstName: 'רחל', spouseLastName: '', spouseName: 'רחל לוי' })), { first: 'רחל', last: '' },
      'שדה מפוצל שמולא — הוא המקור, גם כשהשני ריק');
    deepEqual(spouseNameParts(card({})), { first: '', last: '' });
    equal(editFieldValue(card({ spouseName: 'רחל כהן' }), EDIT_FIELD_BY_KEY.spouseFirstName), 'רחל');
    equal(editFieldValue(card({ spouseName: 'רחל כהן' }), EDIT_FIELD_BY_KEY.spouseLastName), 'כהן');
  }),

  test('שמירה: שם פרטי או שם משפחה שהשתנו ⇒ שלושת השדות, והשם המלא = השרשור', () => {
    deepEqual(withSpouseFullName({ spouseFirstName: 'רחלי' }, { spouseFirstName: ' רחלי ', spouseLastName: 'כהן' }),
      { spouseFirstName: 'רחלי', spouseLastName: 'כהן', spouseName: 'רחלי כהן' });
    deepEqual(withSpouseFullName({ spouseLastName: 'לוי' }, { spouseFirstName: 'רחל', spouseLastName: 'לוי' }),
      { spouseLastName: 'לוי', spouseFirstName: 'רחל', spouseName: 'רחל לוי' });
    deepEqual(withSpouseFullName({ spouseFirstName: '' }, { spouseFirstName: '', spouseLastName: '' }),
      { spouseFirstName: '', spouseLastName: '', spouseName: '' }, 'ניקוי — שלושתם ריקים, לא שם ישן שנשאר');
    const untouched = { familyStatus: 'married' } as Partial<Client>;
    equal(withSpouseFullName(untouched, { spouseFirstName: 'רחל', spouseLastName: 'כהן' }), untouched,
      'שם שלא נגעו בו — לא נשלח (אין «עריכה» על ערך שלא השתנה)');
  }),

  test('תיק המס: השורה עורכת את שני השמות, והשמירה עוברת דרך withSpouseFullName', () => {
    assert(/startSectionEdit\('family', familyFields\(client\)/.test(TAB_SOURCE), 'העריכה נפתחת עם שדות השם');
    assert(/plain = withSpouseFullName\(plain, sectionDrafts\)/.test(TAB_SOURCE), 'השמירה גוזרת את השם המלא');
    assert(!/fieldsOf\('famStatus'\)\.map/.test(TAB_SOURCE), 'לא נשארה עריכה בלי שדות השם');
  }),
];

// ─── טפסי הלקוח (247) — השאלון, המפתחות מול השרת, והפריסה ───────────────────
// הרצה: node scripts/run-unit-tests.mjs clientForms

import { test, assert, equal, deepEqual, type TestCase } from '../../../../testkit/tinyTest';
import { CLIENT_FORMS, blockers, flowScreens, screenValues, editableFields } from '../registry';
import { ITA4440, clientColumn } from '../ita4440';
import { VAT821, splitActivity } from '../vat821';
import { ilDate, splitPhone, validIsraeliId, inputError } from '../format';
import type { CfData } from '../types';
import MIGRATION_246 from '../../../../../supabase/247-smart-client-forms.sql?raw';

/** המפתחות ב-_scf_spec (שרת) לכל טופס: card / filing / required. */
function serverSpec(key: string) {
  const sql = MIGRATION_246.replace(/\r\n/g, '\n');
  const start = sql.indexOf(`when '${key}' then jsonb_build_object(\n      'card'`);
  assert(start >= 0, `_scf_spec: אין ענף ל-${key}`);
  const block = sql.slice(start, sql.indexOf('))', sql.indexOf("'required'", start)) + 2);
  const list = (name: string) => {
    const s = block.indexOf(`'${name}', jsonb_build_array(`);
    const e = block.indexOf(')', s);
    return [...block.slice(s, e).matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]).filter(x => x !== name);
  };
  return { card: list('card'), filing: list('filing'), required: list('required') };
}

const DERIVED_ONLY = new Set(['bankName']); // נשלח עם הבנק, לא שאלה בפני עצמה

export const TESTS: TestCase[] = [
  test('מפתחות · כל שאלה בקוד קיימת בשרת עם אותו מקום שמירה (כרטיס/טופס), ולהפך', () => {
    for (const def of Object.values(CLIENT_FORMS)) {
      const spec = serverSpec(def.key);
      const qs = new Map<string, 'card' | 'filing'>();
      for (const s of def.screens) for (const f of s.fields) qs.set(f.key, f.store);
      for (const [k, store] of qs) {
        const inCard = spec.card.includes(k), inFiling = spec.filing.includes(k);
        assert(inCard || inFiling, `${def.key}: «${k}» לא ברשימת השרת`);
        equal(store === 'card', inCard, `${def.key}: «${k}» נשמר ב-${store} בקוד אבל לא כך בשרת`);
      }
      for (const k of [...spec.card, ...spec.filing]) {
        if (DERIVED_ONLY.has(k)) continue;
        assert(qs.has(k), `${def.key}: «${k}» בשרת בלי שאלה בקוד`);
      }
      // חובה בשרת ⇒ חובה (או מותנה) גם בקוד, אחרת הלקוח היה נחסם בלי להבין למה
      for (const k of spec.required) {
        const f = def.screens.flatMap(s => s.fields).find(x => x.key === k);
        assert(f && f.required, `${def.key}: «${k}» חובה בשרת אבל לא בשאלון`);
      }
    }
  }),

  test('שאלון · לקוח עם כרטיס מלא נשאל רק את ההצהרות (4440)', () => {
    const d: CfData = { ...ITA4440.sample, marriageDate: undefined, separationDate: undefined, spouseAddress: undefined, incSalary: undefined };
    const ids = flowScreens(ITA4440, d, new Set()).map(s => s.id);
    deepEqual(ids, ['dates', 'spouseAddress', 'income', 'spouseIncome']);
  }),

  test('שאלון · מסך כרטיס מופיע רק כשחסר בו פרט חובה', () => {
    const d: CfData = { ...ITA4440.sample, homeStreet: undefined, spouseIdNumber: undefined };
    const ids = flowScreens(ITA4440, d, new Set()).map(s => s.id);
    assert(ids.includes('contact') && ids.includes('spouse'), ids.join(','));
    assert(!ids.includes('identity'), 'זהות מלאה לא נשאלת');
  }),

  test('שאלון · זהות שכבר בכרטיס אינה ניתנת לעריכה מהדף; החסר בה — כן', () => {
    const card: CfData = { firstName: 'ישראל', lastName: 'ישראלי' };
    const s = ITA4440.screens.find(x => x.id === 'identity')!;
    const keys = editableFields(s, { ...card }, card).map(f => f.key);
    deepEqual(keys, ['idNumber', 'gender']);
  }),

  test('שאלון · 821 בלי כתובת עסק שואל «מהבית?», ו«כן» מעתיק את כתובת המגורים לעסק', () => {
    const d: CfData = { ...VAT821.sample, bizStreet: undefined, bizHouse: undefined, bizCity: undefined, bizZip: undefined, bizAtHome: undefined };
    assert(flowScreens(VAT821, d, new Set()).some(s => s.id === 'bizAddress'), 'מסך כתובת העסק חסר');
    const s = VAT821.screens.find(x => x.id === 'bizAddress')!;
    const v = screenValues(s, { bizAtHome: 'yes', bizPhone: '050-1234567' }, d);
    equal(v.bizStreet, 'הרצל'); equal(v.bizCity, 'חיפה'); equal(v.bizAtHome, 'yes');
  }),

  test('שאלון · שדה מותנה שהוסתר מנוקה (לא נשאר «אחר» ישן בטופס)', () => {
    const d: CfData = { ...VAT821.sample, propKind: 'other', propKindOther: 'דירת מגורים' };
    const s = VAT821.screens.find(x => x.id === 'property')!;
    const v = screenValues(s, { propKind: 'office' }, d);
    equal(v.propKindOther, '');
    equal(v.propKind, 'office');
  }),

  test('שאלון · שנת המס נשמרת עם מסך ההכנסה גם כשאינה מוצגת', () => {
    const d: CfData = { ...ITA4440.sample, incomeYear: undefined };
    const s = ITA4440.screens.find(x => x.id === 'income')!;
    const v = screenValues(s, { incSalary: '1' }, d);
    equal(v.incomeYear, String(new Date().getFullYear() - 1));
  }),

  test('חוסמים · דוגמה מלאה — אין; ת.ז. שגויה ומיקוד קצר — נחסם', () => {
    equal(blockers(ITA4440, ITA4440.sample).length, 0, 'דוגמת 4440');
    equal(blockers(VAT821, VAT821.sample).length, 0, 'דוגמת 821');
    const bad = blockers(VAT821, { ...VAT821.sample, idNumber: '123456789', homeZip: '123' }).map(b => b.field.key);
    assert(bad.includes('idNumber') && bad.includes('homeZip'), bad.join(','));
  }),

  test('4440 · הלקוח בטור לפי המגדר; בן/בת הזוג בטור השני', () => {
    equal(clientColumn({ gender: 'male' }), 'M');
    equal(clientColumn({ gender: 'female' }), 'F');
    const last = (col: 'M' | 'F', d: CfData) => ITA4440.valueOf(ITA4440.template.fields.find(f => f.id === `${col}.lastName`)!, d);
    const d = { ...ITA4440.sample, gender: 'female', lastName: 'כהן', spouseLastName: 'לוי' };
    equal(last('F', d), 'כהן'); equal(last('M', d), 'לוי');
    const sig = ITA4440.template.fields.filter(f => f.kind === 'signature' && ITA4440.isActive(f, d)).map(f => f.id);
    deepEqual(sig, ['F.signature'], 'רק הלקוח חותם');
  }),

  test('821 · תאריך הפתיחה בתיבות חודש|שנה, טלפון לקידומת ומספר, תיאור לשלוש שורות', () => {
    const f = VAT821.template.fields.find(x => x.id === 'openDate')!;
    equal(VAT821.valueOf(f, { openMonth: '2026-11' }), '11|26');
    deepEqual(splitPhone('050-1234567'), ['050', '1234567']);
    deepEqual(splitPhone('04-8123456'), ['04', '8123456']);
    const [a, b, c] = splitActivity('מילה '.repeat(40));
    assert(a.length <= 56 && b.length <= 98 && c.length > 0, `${a.length}/${b.length}/${c.length}`);
  }),

  test('עיצוב ובדיקה · תאריך, ת.ז., עברית בכתובת', () => {
    equal(ilDate('2025-03-01'), '01/03/2025');
    assert(validIsraeliId('000000018'), 'ת.ז. תקינה');
    assert(!validIsraeliId('000000019'), 'ספרת ביקורת שגויה');
    equal(inputError('hebrew', 'Herzl 5'), 'בעברית בלבד');
    equal(inputError('hebrew', 'הרצל 5'), null);
    assert(inputError('date', '2999-01-01'), 'תאריך עתידי נחסם');
  }),
];

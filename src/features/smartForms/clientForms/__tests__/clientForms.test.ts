// ─── טפסי הלקוח (247) — השאלון, המפתחות מול השרת, והפריסה ───────────────────
// הרצה: node scripts/run-unit-tests.mjs clientForms

import { test, assert, equal, deepEqual, type TestCase } from '../../../../testkit/tinyTest';
import { CLIENT_FORMS, blockers, flowScreens, screenValues, editableFields, formMarkers, screenOfQuestion } from '../registry';
import { ITA4440, clientColumn } from '../ita4440';
import { VAT821, splitActivity, activityText, dealerKindOf, dealerReason } from '../vat821';
import { ilDate, splitPhone, validIsraeliId, inputError, fieldError } from '../format';
import type { CfData } from '../types';
import MIGRATION_247 from '../../../../../supabase/247-smart-client-forms.sql?raw';
import MIGRATION_251 from '../../../../../supabase/251-form-821-live-fields.sql?raw';

/** המפתחות ב-_scf_spec (שרת) לכל טופס: card / filing / required. ‼ 251 מחליפה את הגוף של 247 — קוראים מהאחרונה. */
function serverSpec(key: string) {
  const sql = MIGRATION_251.replace(/\r\n/g, '\n');
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

const DERIVED_ONLY = new Set(['bankName', 'openMonth']); // bankName נשלח עם הבנק; openMonth — מפתח ישן (לפני 251) שנשאר לקריאה בלבד

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
    // 251 רק מחליפה גופים של 247 — ה-4440 לא השתנה בה
    const sql247 = MIGRATION_247.replace(/\r\n/g, '\n');
    assert(sql247.includes("when 'ita-4440' then jsonb_build_object(\n      'card'"), '247 עדיין מכילה את מפרט 4440');
  }),

  test('821 · «לא קיים נכס»: תיבות הנכס לא מצוירות ולא נדרשות; קיים — חובה', () => {
    const none: CfData = { ...VAT821.sample, propExists: 'no', propKind: undefined, propTenure: undefined, propParty: undefined, propKindOther: undefined };
    equal(blockers(VAT821, none).length, 0, 'בלי נכס — אין חוסמים');
    const propOps = VAT821.template.fields.filter(f => f.id.startsWith('prop.') && VAT821.isActive(f, none));
    equal(propOps.length, 0, 'אף תיבת נכס אינה פעילה');
    assert(!formMarkers(VAT821, none).some(m => m.key.startsWith('prop.') || m.key.startsWith('g:prop')), 'אין סימוני נכס');
    const some: CfData = { ...none, propExists: 'yes' };
    const keys = blockers(VAT821, some).map(b => b.field.key);
    assert(keys.includes('propKind') && keys.includes('propTenure'), keys.join(','));
    const marks = formMarkers(VAT821, some);
    equal(marks.find(m => m.key === 'g:prop.kind')?.state, 'missing');
    equal(marks.find(m => m.key === 'g:prop.tenure')?.state, 'missing');
    // המסך שבו השאלה — ללחיצה על הסימון
    equal(screenOfQuestion(VAT821, marks.find(m => m.key === 'g:prop.kind')!.questionKeys, some)?.id, 'property');
  }),

  test('821 · סימוני חובה על הטופס: ריק = חסר, מלא = ✓, חתימת הלקוח מסומנת תמיד', () => {
    const full = formMarkers(VAT821, VAT821.sample);
    assert(full.every(m => m.state !== 'missing'), 'דוגמה מלאה — אין «חסר»: ' + full.filter(m => m.state === 'missing').map(m => m.key).join(','));
    const sig = full.find(m => m.key === 'signature');
    equal(sig?.state, 'sign'); assert(sig && sig.box.w === 96 && sig.box.h === 19, 'תיבת החתימה הנמדדת');
    assert(!full.some(m => m.key === 'rep.stamp'), 'חותמת המשרד אינה סימון של הלקוח');
    equal(formMarkers(VAT821, VAT821.sample, { signed: true }).find(m => m.key === 'signature')?.state, 'signed');
    const empty = formMarkers(VAT821, { firstName: 'ישראל', lastName: 'ישראלי' });
    const missing = empty.filter(m => m.state === 'missing').map(m => m.key);
    for (const k of ['idNumber', 'businessName', 'activity.1', 'turnover', 'openDate', 'employees', 'biz.street', 'bank.account']) assert(missing.includes(k), 'חסר: ' + k);
    equal(empty.find(m => m.key === 'dealerName')?.state, 'ok', 'שם העוסק מהכרטיס — ✓');
    assert(!missing.includes('mail.street'), 'מען להתכתבות אינו חובה');
    assert(!empty.some(m => m.key === 'signDate'), 'תאריך החתימה אינו מסומן');
  }),

  test('821 · תאריך פתיחה מלא ⇒ חודש|שנה; ענף בשורת התיאור; סוג עוסק לפי המחזור', () => {
    const f = VAT821.template.fields.find(x => x.id === 'openDate')!;
    equal(VAT821.valueOf(f, { openDate: '2026-08-31' }), '08|26');
    equal(VAT821.valueOf(f, { openMonth: '2025-03' }), '03|25', 'הגשה ישנה');
    equal(VAT821.valueOf(f, {}), undefined);
    equal(activityText({ activity: 'שליחויות', industry: '5320' }), 'שליחויות · ענף: שירותי בלדרות');
    equal(activityText({ activity: 'שליחויות', industry: 'H' }), 'שליחויות · ענף: תחבורה, אחסנה, דואר ובלדרות', 'ערך ישן (אות) נקרא לתצוגה');
    // ענף שחייב ברישום כמורשה (תקנה 13) ⇒ מורשה בלי קשר למחזור
    equal(dealerKindOf({ turnover: '40000', openDate: '2026-08-31', industry: '6921' }), 'licensed', 'רואה חשבון — תקנה 13(1)');
    equal(dealerKindOf({ turnover: '40000', openDate: '2026-08-31', industry: '8571' }), 'exempt', 'ענף מותנה — לפי המחזור');
    assert(/תקנה 13\(1\)/.test(dealerReason({ turnover: '40000', industry: '6921' }) ?? ''), 'הסיבה מציינת את התקנה');
    equal(activityText({ activity: 'שליחויות' }), 'שליחויות');
    equal(dealerKindOf({ turnover: '40000', openDate: '2026-08-31' }), 'exempt');
    equal(dealerKindOf({ turnover: '180000', openDate: '2026-08-31' }), 'licensed');
    equal(dealerKindOf({ turnover: '122833', openDate: '2026-01-01' }), 'exempt', 'בדיוק על התקרה 2026');
    equal(dealerKindOf({}), undefined);
    // השמירה של מסך הפתיחה גוזרת את סוג העוסק מחדש
    const s = VAT821.screens.find(x => x.id === 'opening')!;
    equal(screenValues(s, { openDate: '2026-08-31', employees: '1', turnover: '40000' }, {}).dealerKind, 'exempt');
    // תאריך עתידי מותר לפתיחה, אסור לשאר
    const od = s.fields.find(x => x.key === 'openDate')!;
    equal(fieldError(od, '2027-01-01', {}), null);
    assert(fieldError(od, '2099-01-01', {}), 'יותר משלוש שנים קדימה — נחסם');
    const ind = VAT821.screens.find(x => x.id === 'business')!.fields.find(x => x.key === 'industry')!;
    assert(fieldError(ind, '9999', {}), 'ענף שאינו ברשימה נדחה');
    equal(fieldError(ind, '6920', {}), null);
    equal(fieldError(ind, 'M', {}), null, 'ערך ישן (אות) נסבל');
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

  test('821 · טלפון לקידומת ומספר, תיאור לשלוש שורות', () => {
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

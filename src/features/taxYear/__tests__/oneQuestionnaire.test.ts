// ─── בדיקות: לקוח אחד = שאלון אחד פתוח (263, 20.10.2026) ────────────────────────────────────────────
// ‼ מה נעול כאן: שאלון אחר פתוח חוסם פתיחה/פרסום של שאלון חדש; **אותו** שאלון (אותה בקשה, או אותה זהות שהשרת יחזיר
//   במקום ליצור שנייה) — לא חוסם; שאלון הקליטה הישן לא חוסם את פתיחת הקליטה (בשורה שלה «החלף בקליטה»);
//   הנוסח אחד, עם השם והכותרת; ותשובת השרת נקראת נכון.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { blockingQuestionnaire, parseOpenQuestionnaire, questionnaireOpenText, type OpenQuestionnaire } from '../oneQuestionnaire';
import { serverErrorText } from '../../flows/api';

const intake: OpenQuestionnaire = { stepId: 'intake-1', infoStepId: 'info-1', parentStepId: 'intake-1', stepType: 'tax_file_intake', title: 'קליטה והשלמת תיק המס', taxYear: 2026, asOfDate: '2026-10-20' };
const annual25: OpenQuestionnaire = { stepId: 'ar-25', infoStepId: 'info-25', parentStepId: 'ar-25', stepType: 'annual_return', title: 'דוח שנתי 2025', taxYear: 2025 };
const legacy: OpenQuestionnaire = { stepId: 'legacy-1', stepType: 'intake_questionnaire', title: 'עדכון סטטוס מס' };

export const TESTS: TestCase[] = [
  test('אין שאלון פתוח — לא חוסם', () => {
    equal(blockingQuestionnaire(null, { stepType: 'annual_return', taxYear: 2025 }), null);
  }),

  test('קליטה פתוחה חוסמת דוח שנתי חדש, ודוח פתוח חוסם קליטה', () => {
    equal(blockingQuestionnaire(intake, { stepType: 'annual_return', taxYear: 2025 })?.stepId, 'intake-1');
    equal(blockingQuestionnaire(annual25, { stepType: 'tax_file_intake' })?.stepId, 'ar-25');
    equal(blockingQuestionnaire(annual25, { stepType: 'wealth_declaration', asOfDate: '2025-12-31' })?.stepId, 'ar-25');
  }),

  test('אותו שאלון — לא חוסם: אותה בקשה, אותה שנה, קליטה אחת ללקוח, הצהרה לאותו יום', () => {
    equal(blockingQuestionnaire(annual25, { stepType: 'annual_return', stepId: 'ar-25', taxYear: 2025 }), null);
    equal(blockingQuestionnaire(annual25, { stepType: 'annual_return', taxYear: 2025 }), null);
    equal(blockingQuestionnaire(intake, { stepType: 'tax_file_intake' }), null);
    const wealth: OpenQuestionnaire = { stepId: 'wd', stepType: 'wealth_declaration', title: 'הצהרת הון', asOfDate: '2025-12-31' };
    equal(blockingQuestionnaire(wealth, { stepType: 'wealth_declaration', asOfDate: '2025-12-31' }), null);
    equal(blockingQuestionnaire(wealth, { stepType: 'wealth_declaration', asOfDate: '2026-06-30' })?.stepId, 'wd', 'הצהרה ליום אחר — שאלון אחר');
  }),

  test('דוח של שנה אחרת — שאלון אחר, חוסם', () => {
    equal(blockingQuestionnaire(annual25, { stepType: 'annual_return', taxYear: 2024 })?.stepId, 'ar-25');
    equal(blockingQuestionnaire(annual25, { stepType: 'annual_return', stepId: 'ar-24', taxYear: 2024 })?.stepId, 'ar-25');
  }),

  test('שאלון הקליטה הישן: חוסם דוח שנתי, לא חוסם את פתיחת הקליטה (שם «החלף בקליטה»)', () => {
    equal(blockingQuestionnaire(legacy, { stepType: 'annual_return', taxYear: 2025 })?.stepId, 'legacy-1');
    equal(blockingQuestionnaire(legacy, { stepType: 'tax_file_intake' }), null);
  }),

  test('הנוסח: שם וכותרת; בלי שם — «ללקוח»; אותו נוסח כללי בתרגום קודי השרת', () => {
    equal(questionnaireOpenText('נועה', annual25), 'יש לנועה שאלון פתוח: «דוח שנתי 2025» — קודם מסיימים אותו');
    equal(questionnaireOpenText(undefined, null), 'יש ללקוח שאלון פתוח — קודם מסיימים אותו');
    equal(questionnaireOpenText('  ', legacy), 'יש ללקוח שאלון פתוח: «עדכון סטטוס מס» — קודם מסיימים אותו');
    equal(serverErrorText('questionnaire_open'), questionnaireOpenText(undefined));
  }),

  test('תשובת השרת: null / ריק ⇒ אין; שדות חסרים ⇒ ברירות מחדל', () => {
    equal(parseOpenQuestionnaire(null), null);
    equal(parseOpenQuestionnaire({}), null);
    const p = parseOpenQuestionnaire({ stepId: 'x', stepType: 'annual_return', taxYear: 2025, title: '' });
    assert(!!p, 'נקרא');
    equal(p?.title, 'שאלון');
    equal(p?.taxYear, 2025);
    equal(p?.infoStepId, undefined);
  }),
];

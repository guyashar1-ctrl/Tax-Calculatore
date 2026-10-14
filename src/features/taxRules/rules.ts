// ─── מרשם הכללים ────────────────────────────────────────────────────────────
// ‼ ערך נכנס לכאן רק עם מקור, מיקום במקור ותאריך בדיקה. ערך לשנה חדשה נוסף
// כ-RuleValue חדש — לא מחליפים את הישן. שינוי מקור/ניסוח אינו שינוי ערך.
// ‼ ערכי 2026 של פנסיה וקרן השתלמות מסומנים secondary עד שרשות המסים תפרסם
// את מדריך 2026 — ולכן הם לא נכנסים לחישוב (registry.gate), רק להמחשה.

import type { Rule } from './types';

const G25 = 'itaGuide2025';
const C = '10.10.2026';
const C13 = '13.10.2026';
const C14 = '14.10.2026';
// ‼ פרק ח במדריך 2025 (שפורסם על שנת 2025) מתאר את מקדמות 2026 — הערכים שייכים ל-2026 לפי תוכנם.
const ADV26 = 'פרק ח במדריך 2025 מתאר את מקדמות 2026';

const RULE_LIST: Rule[] = [
  // ── קרן השתלמות לעצמאי ────────────────────────────────────────────────────
  { id: 'sf.se.rate', label: 'שיעור הניכוי לקרן השתלמות לעצמאי', unit: 'rate', law: 'סעיף 17(5א)', computable: true, scope: ['selfEmployed'], values: [
    { taxYear: 2025, value: 0.045, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיפים 51 עד 52', checkedAt: C },
    { taxYear: 2026, value: 0.045, basis: 'derived', sourceId: 'knessetAmendments', locator: 'סעיף 17(5א) — חוק ההסדרים 1995 ותיקון 231 (ספר החוקים 2592); אין תיקון מאוחר עד 08.06.2026', checkedAt: C, note: 'נוסח רשמי + רשימת התיקונים הרשמית',
      revisions: [{ value: 0.045, basis: 'secondary', sourceId: 'nevoOrdinance', checkedAt: C, replacedAt: C, reason: 'נמצא נוסח רשמי והוכח שאין תיקון ב-2025 וב-2026' }, { value: 0.045, basis: 'secondary', sourceId: 'institutional2026', checkedAt: C, replacedAt: C, reason: 'המקור הוחלף מטבלת גוף מוסדי לנוסח החוק' }] },
  ] },
  { id: 'sf.se.ceiling', label: 'תקרת «הכנסה קובעת» שנתית לעצמאי', unit: '₪', law: 'סעיף 17(5א)', computable: true, scope: ['selfEmployed'], values: [
    { taxYear: 2025, value: 293_397, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיפים 51 עד 52; טבלת ניכויים', checkedAt: C },
    { taxYear: 2026, value: 293_397, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12', checkedAt: C, note: 'מוקפא — סעיף 120ב(ה)',
      revisions: [{ value: 293_397, basis: 'secondary', sourceId: 'institutional2026', checkedAt: C, replacedAt: C, reason: 'נמצא בלוח העזר הרשמי 2026' }] },
  ] },
  { id: 'sf.se.maxDeduction', label: 'ניכוי מרבי לקרן השתלמות לעצמאי', unit: '₪', computable: false, scope: ['selfEmployed'], values: [
    { taxYear: 2025, value: 13_203, basis: 'primary', sourceId: G25, locator: '4.5% × 293,397', checkedAt: C, note: 'תוצאה מעוגלת; החישוב עצמו נעשה מהשיעור והתקרה' },
    { taxYear: 2026, value: 13_203, basis: 'derived', sourceId: 'itaBooklet2026', locator: '4.5% × 293,397', checkedAt: C, note: 'התקרה רשמית; השיעור מנוסח החוק (משני)' },
  ] },
  { id: 'sf.mixed.formula', label: 'עצמאי שגם שכיר ומעבידו הפקיד לקרן: «סכום התקרה»', unit: 'text', computable: true, scope: ['selfEmployed', 'employee', 'employerStudyFund'], values: [
    { taxYear: 2025, value: 'הנמוך מבין: ההכנסה מעסק או ממשלח יד, לבין התקרה פחות «המשכורת הקובעת» שבשלה הפקיד המעביד (סעיף 52 בדוח, קוד 218/219 בטופס 106)', basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיפים 51 עד 52 ודוגמה 104,853 → 4,718', checkedAt: C },
    { taxYear: 2026, value: 'הנמוך מבין: ההכנסה מעסק או ממשלח יד, לבין התקרה פחות «המשכורת הקובעת» שבשלה הפקיד המעביד (סעיף 52 בדוח, קוד 218/219 בטופס 106)', basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 17(5א) עד 08.06.2026', checkedAt: C },
  ] },
  { id: 'sf.mixed.maxDeterminingSalary', label: 'משכורת קובעת מרבית לקרן השתלמות (שכיר)', unit: '₪', computable: true, values: [
    { taxYear: 2025, value: 188_544, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 52', checkedAt: C },
    { taxYear: 2026, value: 188_544, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12 — סעיף 3(ה)', checkedAt: C, note: 'לא צמוד לפי 120ב' },
  ] },
  { id: 'sf.se.exemptDeposit', label: 'תקרת «הפקדה מוטבת» לעצמאי (פטור ממס רווחי הון)', unit: '₪', computable: false, values: [
    { taxYear: 2025, value: 20_566, basis: 'derived', sourceId: 'freezeLaw2024', locator: 'סעיף 120ב(ה): 2025 = הסכום מ-1.1.2024 = הסכום ב-2026', checkedAt: C, note: 'נגזר: חוק ההקפאה + הסכום הרשמי ל-2026',
      revisions: [{ value: 20_566, basis: 'secondary', sourceId: 'institutional2026', checkedAt: C, replacedAt: C, reason: 'נמצא בסיס רשמי: חוק ההקפאה ולוח העזר 2026' }] },
    { taxYear: 2026, value: 20_566, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12 — סעיף 9(16א) ו־(16ב)', checkedAt: C,
      revisions: [{ value: 20_566, basis: 'secondary', sourceId: 'institutional2026', checkedAt: C, replacedAt: C, reason: 'נמצא בלוח העזר הרשמי 2026' }] },
  ] },
  { id: 'sf.liquidity', label: 'משיכה פטורה מקרן השתלמות לעצמאים', unit: 'text', law: 'סעיף 9(16ב)', computable: false, values: [
    { taxYear: 2025, value: 'אחרי 6 שנים ממועד התשלום הראשון; אחרי 3 שנים — למטרת השתלמות או למי שהגיע לגיל פרישה', basis: 'primary', sourceId: G25, locator: 'פרק ט, טבלת הפטורים, סעיף 9(16ב)', checkedAt: C },
  ] },
  { id: 'sf.seniorityStart', label: 'ממתי נספר הוותק (תאריך ההפקדה או תחילת השנה)', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'מסוף החודש שבעדו שולם התשלום הראשון, אך לא לפני תחילת שנת המס שבה שולם (המוקדם מבין סוף חודש התשלום לסוף החודש שבעדו שולם). תשלום בינואר 2026 לא נזקף ל-2025', basis: 'secondary', sourceId: 'nevoOrdinance', locator: 'סעיף 9(16א)(ג), שחל על 9(16ב) בשינויים המחויבים', checkedAt: C, note: 'ההגדרה עצמה — נוסח מאוחד (משני). רשמי: ההגדרה קיימת בסעיף 9(16א)(ג) לפחות מ-2002 (תיקון 132, ספר החוקים 1863), והחלתה על 9(16ב) «בשינויים המחויבים» — חוק ההסדרים 1995. אין תיקון ב-2025 וב-2026',
      revisions: [{ value: 'לא הוכרע', basis: 'unverified', sourceId: 'officeMaterials', checkedAt: C, replacedAt: C, reason: 'נמצאה ההגדרה בסעיף 9(16א)(ג)' }] },
  ] },

  // ── פנסיה לעצמאי ──────────────────────────────────────────────────────────
  { id: 'pen.qualifying.work', label: 'הכנסה מזכה — הכנסת עבודה (שנתי)', unit: '₪', law: 'סעיפים 45א, 47', computable: true, values: [
    { taxYear: 2025, value: 116_400, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיפים 53, 75', checkedAt: C },
    { taxYear: 2026, value: 116_400, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12 — 9,700 לחודש', checkedAt: C, note: 'מוקפא — סעיף 120ב(ה)',
      revisions: [{ value: 116_400, basis: 'secondary', sourceId: 'institutional2026', checkedAt: C, replacedAt: C, reason: 'נמצא בלוח העזר הרשמי 2026' }] },
  ] },
  { id: 'pen.qualifying.nonWork', label: 'הכנסה מזכה — הכנסה שאינה מעבודה (שנתי)', unit: '₪', law: 'סעיף 47', computable: true, values: [
    { taxYear: 2025, value: 164_400, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53', checkedAt: C },
    { taxYear: 2026, value: 164_400, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12 — 13,700 לחודש', checkedAt: C, note: 'מוקפא — סעיף 120ב(ה)' },
  ] },
  { id: 'pen.additionalIncome.ceiling', label: 'תקרת «הכנסה נוספת» (מסלול ב׳, שנתי)', unit: '₪', law: 'סעיף 47(א)(5)', computable: true, values: [
    { taxYear: 2025, value: 291_000, basis: 'derived', sourceId: 'freezeLaw2024', locator: 'סעיף 120ב(ה): 2025 = הסכום ב-2026', checkedAt: C, note: 'נגזר: חוק ההקפאה + הסכום הרשמי ל-2026' },
    { taxYear: 2026, value: 291_000, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12 — 24,250 לחודש', checkedAt: C },
  ] },
  { id: 'pen.trackA.baseRate', label: 'מסלול א׳ — שיעור הניכוי הבסיסי', unit: 'rate', law: 'סעיף 47', computable: true, values: [ // 13.10.2026: בלי scope — מגיל 50 אותו 7% הוא בסיס התקרה בשקלים (תקנה 1)
    { taxYear: 2025, value: 0.07, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, דוגמה 1', checkedAt: C },
    { taxYear: 2026, value: 0.07, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 47 עד 08.06.2026', checkedAt: C, note: 'נוסח 47(ב)(1) — תיקון 173 (ספר החוקים 2220, מ-1.1.2009) נקרא; אין תיקון מאוחר לסעיף. התיקון שקבע לראשונה את השיעור לא אותר' },
  ] },
  { id: 'pen.trackA.extraThreshold', label: 'מסלול א׳ — סף ההפקדה לתוספת', unit: 'rate', computable: true, values: [
    { taxYear: 2025, value: 0.12, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53', checkedAt: C },
    { taxYear: 2026, value: 0.12, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 47 עד 08.06.2026', checkedAt: C, note: 'נוסח 47(ב)(1) — תיקון 173 (ספר החוקים 2220, מ-1.1.2009) נקרא; אין תיקון מאוחר לסעיף. התיקון שקבע לראשונה את השיעור לא אותר' },
  ] },
  { id: 'pen.trackA.extraRate', label: 'מסלול א׳ — תוספת מרבית על החלק שמעל הסף', unit: 'rate', computable: true, values: [ // מגיל 50: 7% + 4% = 11% × התקרה הוא תקרת כל הניכוי
    { taxYear: 2025, value: 0.04, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53', checkedAt: C },
    { taxYear: 2026, value: 0.04, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 47 עד 08.06.2026', checkedAt: C, note: 'נוסח 47(ב)(1) — תיקון 173 (ספר החוקים 2220, מ-1.1.2009) נקרא; אין תיקון מאוחר לסעיף. התיקון שקבע לראשונה את השיעור לא אותר' },
  ] },
  // 13.10.2026 · גיל 50 — מחקר: pension-age50-2026-10-13.md. ‼ התחולה מדויקת: מסלול א׳ (47(ב)) בלבד, עצמאי בלי משכורת,
  //   הפקדה בעד קצבה, שנים 2025–2026. עמית מוטב (47(ב1)), משכורת, ושיעור 7.5% למשכורת לא מבוטחת — לא מחושבים כאן.
  { id: 'pen.trackA.age50', label: 'מסלול א׳ — מגיל 50: שיעורים מוגדלים, אותן תקרות בשקלים', unit: 'text', computable: false, scope: ['age50plus'], values: [
    { taxYear: 2025, value: 'מי שמלאו לו 50 ביום 1.1 של שנת המס (נולד עד 1.1.1975 כולל), יחיד שאינו עמית מוטב (47(ב)): ניכוי בסיסי 10.5% מההכנסה המזכה שאינה מעבודה — עד 11,508 ₪ (7% × 164,400); ניכוי נוסף עד 6% למי ששילם בעד קצבה בלבד מעל הניכוי הבסיסי המותר + 5% מההכנסה — וכל הניכוי עד 18,084 ₪ (11% × 164,400). מהכנסה מזכה של 164,400 ומעלה אין שינוי לעומת מי שמתחת לגיל 50. ההגדלה המרבית: 6,028 ₪ בהכנסה מזכה של 109,600. משכורת לא מבוטחת (47(ב)(2)): 7.5% עד 5,820 ₪. עמית מוטב (47(ב1)) — התקנה לא חלה. הזיכוי לפי 45א — ללא שינוי', basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, «ניכוי מוגדל לגיל 50», עמ׳ 60 («בכפוף לסכומים המרביים… 11,508 ₪ או 18,084 ₪»); ק״ת 4077 עמ׳ 760, תקנות 1 ו-2', checkedAt: C13, note: 'מדריך 2024 — אותו נוסח ואותם סכומים. קריאה חלופית (תקרה אחת 18,084 גם לבסיסי) — נדחתה לטובת עמדת הרשות; השפעתה: עד 5,754 ₪ שעוברים בין ניכוי לזיכוי' },
    { taxYear: 2026, value: 'כמו 2025 (נולד עד 1.1.1976 כולל): תקנה 2 לא תוקנה מאז 1980; התקרות 116,400 / 164,400 מוקפאות (120ב(ה)); לא נמצא תיקון לסעיף 47', basis: 'derived', sourceId: 'regs1980Official', locator: 'ק״ת 4077, עמ׳ 760; לוח העזר 2026 פרק ג עמ׳ 12', checkedAt: C13, note: 'אין מדריך 2026 (יתפרסם ב-2027)' },
  ] },
  { id: 'pen.trackA.workRate', label: 'מסלול א׳ — ניכוי בשל משכורת שאינה מבוטחת (47(ב)(2))', unit: 'rate', law: 'סעיף 47(ב)(2)', computable: true, values: [
    { taxYear: 2025, value: 0.05, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, דוגמה 3 (9,500)', checkedAt: C14, note: 'עד 5% × 116,400 = 5,820; ועוד המגבלה השנייה 47(ב)(2)(ב): 5% × (הכנסת עבודה עד 291,000 − ההכנסה המבוטחת)' },
    { taxYear: 2026, value: 0.05, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 47; התקרות מוקפאות (לוח העזר 2026)', checkedAt: C14 },
  ] },
  { id: 'pen.trackA.age50.workRate', label: 'מסלול א׳, מגיל 50 — ניכוי בשל משכורת שאינה מבוטחת (עד 5,820)', unit: 'rate', law: 'תקנה 2(ב) לתקנות 1980', computable: true, scope: ['age50plus', 'notBeneficialMember'], values: [
    { taxYear: 2025, value: 0.075, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, עמ׳ 60 — 7.5% עד 5,820', checkedAt: C14, note: 'מסמך הרשות 2005 (itaExamples45a2005), דוגמאות ט ו-י״א — משוחזרות בבדיקות. פתוח רק: משכורת מעל 291,000 עם חלק לא מבוטח (המגבלה השנייה) — לא מחושב' },
    { taxYear: 2026, value: 0.075, basis: 'derived', sourceId: 'regs1980Official', locator: 'ק״ת 4077 עמ׳ 760 — לא תוקנה', checkedAt: C14 },
  ] },
  { id: 'pen.trackA.age50.baseRate', label: 'מסלול א׳, מגיל 50 — ניכוי בסיסי (עד 7% × תקרת ההכנסה בשקלים)', unit: 'rate', law: 'תקנה 2(א)(1) לתקנות 1980', computable: true, scope: ['age50plus', 'notBeneficialMember'], values: [
    { taxYear: 2025, value: 0.105, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, עמ׳ 60', checkedAt: C13 },
    { taxYear: 2026, value: 0.105, basis: 'derived', sourceId: 'regs1980Official', locator: 'ק״ת 4077 עמ׳ 760 — לא תוקנה', checkedAt: C13 },
  ] },
  { id: 'pen.trackA.age50.extraRate', label: 'מסלול א׳, מגיל 50 — ניכוי נוסף (בעד קצבה בלבד; כל הניכוי עד 11% × התקרה)', unit: 'rate', law: 'תקנה 2(א)(2) לתקנות 1980', computable: true, scope: ['age50plus', 'notBeneficialMember'], values: [
    { taxYear: 2025, value: 0.06, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, עמ׳ 60', checkedAt: C13 },
    { taxYear: 2026, value: 0.06, basis: 'derived', sourceId: 'regs1980Official', locator: 'ק״ת 4077 עמ׳ 760 — לא תוקנה', checkedAt: C13 },
  ] },
  { id: 'pen.beneficial.threshold', label: 'רף «עמית מוטב» (16% מהשכר הממוצע השנתי)', unit: '₪', computable: true, values: [
    { taxYear: 2025, value: 24_069, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, מסלול ב׳', checkedAt: C },
    { taxYear: 2026, value: 26_436, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12 — 16% × 13,769 × 12', checkedAt: C, note: 'צמוד לשכר הממוצע — לא מוקפא',
      revisions: [{ value: 26_436, basis: 'secondary', sourceId: 'institutional2026', checkedAt: C, replacedAt: C, reason: 'נמצא בלוח העזר הרשמי 2026' }] },
  ] },
  { id: 'pen.trackB', label: 'מסלול ב׳ (עמית מוטב) — שני רבדים', unit: 'text', computable: false, scope: ['beneficialMember'], values: [
    { taxYear: 2025, value: 'רובד א׳: 11% מ«הכנסת העמית העצמאי» עד 116,400 פחות ההכנסה המבוטחת. רובד ב׳: 7% מ«ההכנסה הנוספת», ועוד עד 4% אם יתרת ההפקדות עולה על 12% ממנה. לא מעבירים הפקדות בין בני זוג.', basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, מסלול ב׳ ודוגמאות א–ג', checkedAt: C, note: 'הנוסחה המלאה (הגדרת «הכנסה נוספת») לא מומשה לחישוב בסבב זה' },
  ] },
  { id: 'pen.credit.rate', label: 'שיעור הזיכוי על הפקדה לקצבה', unit: 'rate', law: 'סעיף 45א', computable: true, values: [
    { taxYear: 2025, value: 0.35, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיפים 73 עד 76', checkedAt: C },
    { taxYear: 2026, value: 0.35, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 45א עד 08.06.2026', checkedAt: C, note: 'עצמאי: 5% מההכנסה, ועוד 0.5% רק למי שלא ניכה ביטוח אובדן כושר לפי 32(14)(ב) (45א(ו), ספר החוקים 2592 עמ׳ 221, מ-2017; נקרא) — ומכאן «5.5%» בטבלאות הקופות' },
  ] },
  // 11.10.2026 (סבב 8) — מסלול ב׳ והזיכוי לעצמאי, מפרק ד במדריך 2025 (סעיפים 53, 76; עמ׳ PDF 61–64, 71–72)
  { id: 'pen.trackB.tier1Rate', label: 'מסלול ב׳ — רובד א׳: שיעור הניכוי', unit: 'rate', law: 'סעיף 47', computable: true, scope: ['beneficialMember'], values: [
    { taxYear: 2025, value: 0.11, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, מסלול ב׳ — רובד א׳ (11% מהכנסת העמית העצמאי עד 116,400 פחות ההכנסה המבוטחת)', checkedAt: '11.10.2026' },
    { taxYear: 2026, value: 0.11, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 47 עד 08.06.2026', checkedAt: '11.10.2026' },
  ] },
  { id: 'pen.credit.nonWorkRate', label: 'זיכוי לעצמאי — שיעור מההכנסה המזכה שאינה מעבודה', unit: 'rate', law: 'סעיף 45א', computable: true, values: [
    { taxYear: 2025, value: 0.05, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 76 — 5% מההכנסה המזכה', checkedAt: '11.10.2026', note: 'הסדר: קודם ניכוי 7%, אחריו זיכוי עד 5%, ואז תוספת ניכוי על מה שמעל 12% (דוגמת המדריך: 100,000 / 17,000 ⇒ ניכוי 11,000, זיכוי על 5,000)' },
    { taxYear: 2026, value: 0.05, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 45א עד 08.06.2026', checkedAt: '11.10.2026' },
  ] },
  { id: 'pen.credit.extraRate', label: 'זיכוי נוסף 0.5% לעצמאי שלא ניכה אובדן כושר עבודה', unit: 'rate', law: 'סעיף 45א(ו)', computable: true, values: [
    { taxYear: 2025, value: 0.005, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 76 — בתנאי שלא נדרש ניכוי אכ״ע (112/113, 206/207) ויש הכנסה מעסק', checkedAt: '11.10.2026', note: 'הבסיס: 0.5% × הנמוך מ-(232,800 פחות ההכנסה המבוטחת) ומההכנסה מעסק. במסלול ב׳ — לא אומת שחל; לא מוחל שם' },
    { taxYear: 2026, value: 0.005, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + אין תיקון לסעיף 45א עד 08.06.2026', checkedAt: '11.10.2026' },
  ] },
  { id: 'pen.credit.extraCeiling', label: 'תקרת הבסיס לזיכוי הנוסף ולזיכוי במסלול ב׳', unit: '₪', law: 'סעיף 45א', computable: true, values: [
    { taxYear: 2025, value: 232_800, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 76', checkedAt: '11.10.2026' },
    { taxYear: 2026, value: 232_800, basis: 'derived', sourceId: 'itaBooklet2026', locator: '= 2 × 116,400 (מוקפא, סעיף 120ב(ה)) — לא נמצא מפורש בחוברת', checkedAt: '11.10.2026', note: 'נגזר, לא אומת ישירות' },
  ] },
  { id: 'pen.mandatory.rates', label: 'פנסיית חובה לעצמאי — שיעורים', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: '4.45% עד מחצית השכר הממוצע; 12.55% מהחלק שמעליה ועד השכר הממוצע. חל מגיל 21 ועד גיל פרישה מוקדמת; מי שמלאו לו 55 ביום 1.1.2017 פטור', basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53, חוק פנסיה חובה לעצמאים', checkedAt: C },
  ] },
  { id: 'pen.mandatory.lowRate', label: 'פנסיית חובה — שיעור עד מחצית השכר הממוצע', unit: 'rate', computable: true, values: [
    { taxYear: 2025, value: 0.0445, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53', checkedAt: C },
    { taxYear: 2026, value: 0.0445, basis: 'primary', sourceId: 'efficiencyLaw2016', locator: 'פרק ב׳, סעיף 3(א); אין תיקון לפרק', checkedAt: C },
  ] },
  { id: 'pen.mandatory.highRate', label: 'פנסיית חובה — שיעור מהחלק שמעל מחצית ועד השכר הממוצע', unit: 'rate', computable: true, values: [
    { taxYear: 2025, value: 0.1255, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53', checkedAt: C },
    { taxYear: 2026, value: 0.1255, basis: 'primary', sourceId: 'efficiencyLaw2016', locator: 'פרק ב׳, סעיף 3(א); אין תיקון לפרק', checkedAt: C },
  ] },
  { id: 'pen.mandatory.halfWage', label: 'מחצית השכר הממוצע במשק (שנתי)', unit: '₪', computable: true, values: [
    { taxYear: 2025, value: 75_216, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53', checkedAt: C },
    { taxYear: 2026, value: 82_614, basis: 'derived', sourceId: 'itaBooklet2026', locator: 'שכר ממוצע 13,769 (פרק ג, עמ׳ 12) × 12 ÷ 2', checkedAt: C, note: 'השכר הממוצע רשמי (רשות המסים וב״ל); ההגדרה בחוק פנסיה חובה — נוסח משני' },
  ] },
  { id: 'pen.mandatory.fine', label: 'פנסיית חובה — קנס על היעדר הפקדה', unit: '₪', computable: false, values: [
    { taxYear: 2025, value: 500, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 53', checkedAt: C, note: 'סעיף 7 לחוק (ספר החוקים 2592, נקרא): קנס 500 ₪ אחרי התראה שלא נענתה, להפקדות משנת 2018; ההתראה רק כשההכנסה מעל 12 × שכר המינימום, ו-90 יום להפקיד (סעיף 6). סעיף 8: הצמדה למדד ב-1 בינואר בהודעה ברשומות — הודעה לשנים 2025 ו-2026 לא נמצאה (חיפוש לפי כותרת). האוכף: המרכז לגביית קנסות לפי נתוני רשות המסים (סעיף 9); יש טופס רשמי לדיווח הפקדות שם. היקף האכיפה בפועל — לא אומת' },
  ] },

  // ── ביטוח לאומי לעצמאי ────────────────────────────────────────────────────
  { id: 'ni.se.rates', label: 'שיעורי דמי ביטוח לעצמאי בגיל העבודה', unit: 'text', computable: true, scope: ['beforeRetirementAge'], values: [
    { taxYear: 2026, value: 'לאומי 4.47% / 12.83% · בריאות 3.23% / 5.17% (מופחת / רגיל)', basis: 'primary', sourceId: 'btlRates2026', checkedAt: C },
  ] },
  { id: 'ni.se.lowRateNi', label: 'ב״ל לעצמאי — שיעור מופחת (לאומי)', unit: 'rate', computable: true, scope: ['beforeRetirementAge'], values: [{ taxYear: 2026, value: 0.0447, basis: 'primary', sourceId: 'btlRates2026', checkedAt: C }] },
  { id: 'ni.se.highRateNi', label: 'ב״ל לעצמאי — שיעור רגיל (לאומי)', unit: 'rate', computable: true, scope: ['beforeRetirementAge'], values: [{ taxYear: 2026, value: 0.1283, basis: 'primary', sourceId: 'btlRates2026', checkedAt: C }] },
  { id: 'ni.se.lowRateHealth', label: 'ב״ל לעצמאי — שיעור מופחת (בריאות)', unit: 'rate', computable: true, scope: ['beforeRetirementAge'], values: [{ taxYear: 2026, value: 0.0323, basis: 'primary', sourceId: 'btlRates2026', checkedAt: C }] },
  { id: 'ni.se.highRateHealth', label: 'ב״ל לעצמאי — שיעור רגיל (בריאות)', unit: 'rate', computable: true, scope: ['beforeRetirementAge'], values: [{ taxYear: 2026, value: 0.0517, basis: 'primary', sourceId: 'btlRates2026', checkedAt: C }] },
  { id: 'ni.se.reducedThreshold', label: 'ב״ל — סף ההכנסה לשיעור המופחת (חודשי)', unit: '₪', computable: true, values: [{ taxYear: 2026, value: 7_703, basis: 'primary', sourceId: 'btlRates2026', checkedAt: C }] },
  { id: 'ni.se.maxIncome', label: 'ב״ל — הכנסה מרבית החייבת (חודשי)', unit: '₪', computable: true, values: [{ taxYear: 2026, value: 51_910, basis: 'primary', sourceId: 'btlRates2026', checkedAt: C }] },
  { id: 'ni.se.minIncome', label: 'ב״ל — הכנסה מזערית לעצמאי (חודשי)', unit: '₪', computable: false, values: [{ taxYear: 2026, value: 3_442, basis: 'primary', sourceId: 'btlRates2026', checkedAt: C, note: 'החישוב מהכנסה מזערית לא מומש' }] },
  { id: 'ni.se.deductionShare', label: 'ב״ל — החלק מדמי הביטוח הלאומי שמופחת מההכנסה', unit: 'rate', law: 'סעיף 345 לחוק; סעיף 47א לפקודה', computable: true, values: [{ taxYear: 2026, value: 0.52, basis: 'primary', sourceId: 'btlCalc2026', checkedAt: C }] },
  { id: 'ni.advances.basis', label: 'ב״ל — על מה נשענות המקדמות', unit: 'text', computable: false, values: [
    { taxYear: 2026, value: 'עד השומה הסופית — לפי ההכנסה העדכנית שהתקבלה בב״ל עד 31.12 של השנה הקודמת. עם השומה הסופית לשנה נערך חישוב הפרשים. ההכנסה היא לפני פטורים, ניכויים וזיכויים, אחרי הפחתת 52% מדמי הביטוח הלאומי וחלק מההפקדה לקופת גמל (שנקבע במס הכנסה)', basis: 'primary', sourceId: 'btlCalc2026', checkedAt: C },
  ] },
  { id: 'ni.advances.change', label: 'ב״ל — תיקון מקדמות', unit: 'text', computable: false, values: [
    { taxYear: 2026, value: 'רק כשההכנסה השתנתה ב-10% לפחות (עלייה או ירידה), פעם אחת ברבעון, עם מסמכים, ולא אחרי 31 בדצמבר של השנה. המקדמות משתנות לפי ההכנסה החדשה. הקטנה משפיעה גם על ההכנסה שלפיה מחושבות גמלאות', basis: 'primary', sourceId: 'btlForm672', locator: 'טופס בל/672, 10.2025; דף «תיקון מקדמות»', checkedAt: C },
  ] },
  { id: 'ni.advances.changeThreshold', label: 'ב״ל — שינוי הכנסה מינימלי לתיקון מקדמות', unit: 'rate', computable: true, values: [{ taxYear: 2026, value: 0.10, basis: 'primary', sourceId: 'btlTikun', checkedAt: C }] },
  { id: 'ni.advances.retroScope', label: 'ב״ל — האם תיקון חל גם על חודשים שעברו', unit: 'text', computable: false, values: [
    { taxYear: 2026, value: 'עדכון הכנסה באמצע השנה מחשב מחדש את מקדמות השנה השוטפת כולה, מינואר, והמקדמות החדשות נחשבות כמגיעות במועדים המקוריים (תקנה 6(ב)). ההפרש לחודשים שעברו מחויב כסוג חיוב נפרד — «הגדלת מקדמות» — עם מועד חיוב משלו. הצמדה מהמועדים המקוריים — צפויה, לא אושרה ברשות; ריבית — אין; קנס — רק אם החיוב לא שולם במועדו', basis: 'primary', sourceId: 'btlRegs1985', locator: 'תקנה 6(ב) — ק״ת 4801; חוזר 1502 (07.01.2026) עמ׳ 5; שאלות ותשובות ב״ל: התיקון «יחול מתחילת השנה הקלנדרית»', checkedAt: C14,
      note: 'נוסח התקנה — רשמי (ק״ת 4801); החיוב הנפרד — חוזר רשמי של 2026. מה שלא אומת (הצמדה וקנס על ההפרש) כתוב בערך עצמו',
      revisions: [{ value: 'עדכון הכנסה באמצע השנה מחשב מחדש את מקדמות השנה השוטפת כולה, והמקדמות החדשות נחשבות כמגיעות במועדים המקוריים (תקנה 6). ההפרש לחודשים שעברו מחויב כסוג חיוב נפרד — «הגדלת מקדמות» — עם מועד חיוב משלו. האם נוספים הצמדה או קנס מהמועדים המקוריים — לא אומת', basis: 'primary', sourceId: 'btlRegs1985', checkedAt: C, replacedAt: C14, reason: 'הובחנו הצמדה, ריבית וקנס (research/advances-topup-charges)' }, { value: 'אותו ערך — בביסוס משני (חוזר 1502 ונוסח וויקיטקסט)', basis: 'secondary', sourceId: 'btlCircular1502', checkedAt: '10.10.2026', replacedAt: '10.10.2026', reason: 'נמצא הנוסח הרשמי של תקנה 6 (ק״ת 4801) — הביסוס עלה ממשני לרשמי' }, { value: 'קצה חוט: לפי נוסח התקנות בוויקיטקסט (תקנה 6) המקדמה מחושבת מחדש לשנה ובמועדים המקוריים, ובהקטנה מחושבת «הצמדה לזכות». אופן הגבייה של הפרש לחודשים שעברו — לא אומת', basis: 'secondary', sourceId: 'wikisourceNiAdvances', checkedAt: '10.10.2026', replacedAt: '10.10.2026', reason: 'נמצא חוזר ב״ל 1472 שמפרט «הגדלת מקדמות» כחיוב נפרד' }] },
  ] },
  { id: 'ni.advances.charges', label: 'ב״ל — קנס, ריבית והצמדה על מקדמות והפרשים', unit: 'text', law: 'סעיפים 345 ו־364; תקנות שומה סופית', computable: false, values: [
    { taxYear: 2026, value: 'קנס פיגורים (סעיף 364) — רק על חיוב שלא שולם במועדו. ריבית — רק בתשלום חוב בהסדר. בשומה הסופית: ההפרש לכל חודש צמוד מהמועד של אותה מקדמה, לחובה ולזכות, בלי ריבית; הפרש עד 90 ₪ לשנה לא נגבה ולא מוחזר; ההפרש לתשלום תוך 30 יום מההודעה. על הפרש «הגדלת מקדמות» באמצע שנה — לא אומת', basis: 'secondary', sourceId: 'wikisourceNiLaw', locator: 'סעיפים 345(ג), 364; תקנות 2א(ב) ו־6 לתקנות השומה הסופית; תקנה 10 לתקנות המקדמות', checkedAt: C, note: 'קריאה של סעיף 345(ב)(1) («דין המקדמות כדין דמי ביטוח») עם סעיף 364 ותקנה 6(ב) (רשמית, ק״ת 4801) מצביעה על הצמדה וקנס מהמועדים המקוריים; ב״ל לא כתב בשום פרסום אם הוא גובה אותם עד מועד חיוב «הגדלת מקדמות». לא שונו בתיקונים 252 עד 265 שנקראו' },
  ] },
  { id: 'ni.payment.day', label: 'ב״ל — מועד חיוב בהוראת קבע', unit: 'text', computable: false, values: [
    { taxYear: 2026, value: 'ב-22 בכל חודש עבור החודש הקודם (נדחה אחרי שבת). חוב — לא נגבה בהוראת הקבע בלי הסכמה', basis: 'primary', sourceId: 'btlHowToPay', checkedAt: C },
  ] },

  // ── מקדמות מס הכנסה ───────────────────────────────────────────────────────
  { id: 'it.advances.methods', label: 'מס הכנסה — שיטות מקדמה ומועדים', unit: 'text', law: 'סעיפים 174 עד 175', computable: false, values: [
    { taxYear: 2026, value: 'לפי שיעור ממחזור: חודשי 15.02.2026 עד 15.01.2027; דו־חודשי למי שמקדמותיו השנתיות עד 35,000 ₪ (15.03.2026 עד 15.01.2027). לפי סכום: 10 תשלומים שווים פברואר–נובמבר, לפי המס ב«שנה הקובעת» מתואם', basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 1', checkedAt: C, note: 'המדריך 2025 מתאר את מקדמות 2026' },
  ] },
  { id: 'it.advances.reduce', label: 'מס הכנסה — הקטנה או ביטול של מקדמות', unit: 'text', law: 'סעיף 180(א)', computable: false, values: [
    { taxYear: 2026, value: 'בבקשה לפקיד השומה (טופס 2216א) או דרך המייצג; עד 31.01.2027 לשנת 2026. מי שלא מנהל ספרים כנדרש אינו זכאי', basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 4', checkedAt: C, note: ADV26 },
  ] },
  { id: 'it.advances.unjustifiedReduction', label: 'מס הכנסה — הקטנה שלא הייתה מוצדקת', unit: 'text', law: 'סעיף 190(א)(2)', computable: false, values: [
    { taxYear: 2026, value: 'אם אחרי הדוח מתברר שהמס עולה על המקדמה המופחתת: ריבית והפרשי הצמדה מאמצע שנת המס עד סופה (או עד יום תשלום המקדמה — המוקדם), על ההפרש בין המקדמה המופחתת לבין הנמוך מבין המס לפי הדוח והמקדמה המקורית', basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 5', checkedAt: C, note: ADV26 },
  ] },
  { id: 'it.advances.increase', label: 'מס הכנסה — הגדלת מקדמות במהלך השנה', unit: 'text', law: 'סעיף 180(ב)', computable: false, values: [
    { taxYear: 2026, value: 'א) דוח לשנה קודמת שהוגש אחרי 1.1 והמס בו גבוה — המקדמה תיקבע לפיו, אחרי 30 ימי השהיה. ב) פקיד השומה רשאי להגדיל כשהמס הצפוי גבוה ב-20% או ב-500,000 ₪ (הנמוך); יש זכות השגה', basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 6', checkedAt: C, note: ADV26 },
  ] },
  { id: 'it.advances.voluntaryIncreaseRetro', label: 'מס הכנסה — שינוי שיעור המקדמה באמצע השנה: מה קורה לחודשים שעברו', unit: 'text', computable: false, values: [
    { taxYear: 2026, value: 'השלמה מרצון לחודשים שעברו אינה דרישה ואינה חוב — תשלום על חשבון השנה. ריבית 4% והצמדה — רק על יתרה שנשארה אחרי 31.12 (187), עם הקלה (187א): תשלום עד 31.1 — פטור מלא; בפברואר — חצי; במרץ — רבע. קנס 190(א)(1) — רק על מקדמה שנדרשה ולא שולמה יותר מ-7 ימים; קנס הפיגורים 0.2% לשבוע אינו חל על מקדמות. לכן השלמה עכשיו לא חוסכת לעומת תשלום עד 31.1 — אלא אם הוקטנה מקדמה השנה (190(א)(2)) או שהעסק לא דווח (190(א)(4)). פתוח: הגדלה בידי פקיד השומה (180(ב)) — האם נשלחת דרישה גם לחודשים שעברו; לא פורסם, לבדוק במכתב ההגדלה וב-134', basis: 'secondary', sourceId: 'wikisourceOrdinance', locator: 'סעיפים 175(א), 180(ב), 187, 187א, 190(א); חוק קנס פיגורים; research/advances-topup-charges-2026-10-14 חלק ב', checkedAt: C14,
      note: 'ההכרעה — ממקורות רשמיים (חוק, תקנות, הנחיות לפקידי שומה). דוגמה מהמשרד מאמתת רק התנהגות במקרה מסוים ומשמשת להצלבה. 10.10.2026: טופס 2216ב מפנה להוראת ביצוע 4/94 — לא פורסמה ברשת; היא או מדריך המייצגים של שע״ם הם המקור החסר',
      revisions: [{ value: 'לא הוכרע. נבדק רק מקדמה לפי שיעור מהמחזור ששיעורה משתנה באמצע השנה (לבקשת הנישום או לפי סעיף 180(ב)): בנוסח החוק והתקנות (משני) המקדמה לכל חודש מחושבת לפי השיעור שבתוקף, ולא נמצאה הוראה שמחייבת מחדש חודשים שעברו; הפער מתברר בדוח או בשומה. לא אומת: נוסח רשמי, דרישה חד־פעמית בהגדלה לפי 180(ב), תצוגת שע״ם, ומקדמה לפי סכום קבוע', basis: 'secondary', sourceId: 'wikisourceOrdinance', checkedAt: C, replacedAt: C14, reason: 'נקראו 187, 187א ו-190 — ריבית מסוף השנה בלבד, הקלה עד 31.1, וקנס רק על מקדמה שנדרשה; נשארה רק שאלת 180(ב)' }, { value: 'לא נמצאה הוראה שיוצרת חוב לחודשים שעברו: כל מקדמה חושבה לפי השיעור שהיה בתוקף, ושינוי חל רק מכאן והלאה. החסר עובר ליתרה השנתית — משולם עם הדוח או אחרי השומה. פתוח: איך שע״ם מציג הגדלה לפי סעיף 180(ב) — שיעור חדש בלבד או גם דרישה חד־פעמית', basis: 'secondary', sourceId: 'wikisourceOrdinance', checkedAt: C, replacedAt: C, reason: 'הניסוח הקודם הציג מסקנה גורפת; תוחם להיקף שנבדק' }, { value: 'לא אומת. המדריך לא מתאר השלמה רטרואקטיבית בהגדלה יזומה; תשלום על חשבון ופיגור הם מנגנונים נפרדים', basis: 'unverified', sourceId: G25, checkedAt: '10.10.2026', replacedAt: '10.10.2026', reason: 'נבדק נוסח סעיפים 175 עד 190 ותקנות המקדמות לפי מחזור' }] },
  ] },
  { id: 'it.advances.latePayment', label: 'מס הכנסה — פיגור בתשלום מקדמה', unit: 'text', law: 'סעיף 190(א)(1)', computable: false, values: [
    { taxYear: 2026, value: 'ריבית והפרשי הצמדה מהמועד החוקי ועד התשלום או סוף שנת המס (המוקדם), ואחר כך מסוף השנה ועד התשלום', basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 7', checkedAt: C, note: ADV26 },
  ] },
  { id: 'it.advances.yearEndBalance', label: 'מס הכנסה — יתרת מס בסוף השנה (מקדמות נמוכות שלא הוקטנו)', unit: 'text', law: 'סעיפים 187 ו־187א', computable: false, values: [
    { taxYear: 2026, value: 'מקדמות נמוכות שלא הוקטנו — אין ריבית במהלך השנה. על כל מס שלא שולם עד סוף השנה: הפרשי הצמדה וריבית מסוף שנת המס ועד התשלום; הקלה על תשלום בחודש הראשון שאחרי סוף השנה (מלאה), בשני (מחצית) ובשלישי (רבע). זה אומדן עד שהדוח או השומה קובעים את המס', basis: 'secondary', sourceId: 'wikisourceOrdinance', locator: 'סעיפים 187(א)(1), 187א, 159א(א)', checkedAt: C },
  ] },
  { id: 'it.advances.notSaving', label: 'מס הכנסה — הקטנת מקדמה אינה חיסכון במס', unit: 'text', law: 'סעיף 175(א)', computable: false, values: [
    { taxYear: 2026, value: 'מקדמה היא תשלום על חשבון המס של אותה שנה. הקטנה משנה רק את מועד התשלום; המס נקבע בדוח. הקטנה לא מוצדקת עולה בהפרשי הצמדה וריבית מאמצע השנה', basis: 'secondary', sourceId: 'wikisourceOrdinance', locator: 'סעיפים 175(א), 190(א)(2)', checkedAt: C },
  ] },
  { id: 'it.lateFine', label: 'מס הכנסה — קנס פיגורים על מס לפי הדוח או השומה', unit: 'text', computable: false, values: [
    { taxYear: 2026, value: 'קנס פיגורים לפי חוק המסים (קנס פיגורים) — על מס שלא שולם במועד לפי הדוח או השומה: 0.2% לכל שבוע של פיגור או חלק ממנו. לא על מקדמות: על מקדמה באיחור חלים הפרשי הצמדה וריבית לפי סעיף 190', basis: 'primary', sourceId: 'latePenaltyOrder', locator: 'סעיף 2(א) לחוק (תיקון 72, ספר החוקים 1212); הגדרת «חוב מס» (תיקון 64, ספר החוקים 1119); השיעור — ק״ת 5646 ו-5743 (מ-1.1.1995)', checkedAt: C,
      note: 'ההחרגה של מקדמות והשיעור — נוסח רשמי. אין תיקון לחוק מאז 2020; לא נמצא שינוי שיעור אחרי 1996 (חיפוש לפי כותרת). לא נבדק לכל סוג חוב מס בנפרד',
      revisions: [{ value: 'אותו ערך, בלי השיעור — «0.2% לפי המדריך, הצו לא נקרא»', basis: 'secondary', sourceId: 'latePenaltyLaw', checkedAt: C, replacedAt: C, reason: 'נקרא צו שינוי השיעור (ק״ת 5646, 5743)' }, { value: 'קנס פיגורים של 0.2% לכל שבוע מהמועד החוקי, בנוסף להפרשי הצמדה וריבית. המקור בחוק לא אותר', basis: 'secondary', sourceId: G25, checkedAt: C, replacedAt: C, reason: 'נמצא החוק; התברר שאינו חל על מקדמות' }] },
  ] },
  { id: 'it.advances.withholdingOffset', label: 'מס הכנסה — קיזוז ניכוי במקור מהמקדמה', unit: 'text', law: 'סעיף 177', computable: false, values: [
    { taxYear: 2026, value: 'מותר לקזז ניכוי במקור שאינו משכר, עם אישור. ניכוי משכר אינו מקוזז מהמקדמה העסקית. קיזוז שלא כדין — קנס פי שלושה', basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 3', checkedAt: C, note: ADV26 },
  ] },
  { id: 'it.refund', label: 'מס הכנסה — החזר לפי הדוח', unit: 'text', law: 'סעיף 159א', computable: false, values: [
    { taxYear: 2026, value: 'תוך 90 ימים מהגשת הדוח, עם ריבית והפרשי הצמדה, לחשבון הבנק שנמסר. זכות ברשות אינה החזר מיידי', basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 10', checkedAt: C, note: ADV26 },
  ] },

  // ── הצהרת הון ────────────────────────────────────────────────────────────
  { id: 'wealth.deadlineDays', label: 'הצהרת הון — הרצפה למועד שבדרישה (ימים)', unit: 'days', law: 'סעיף 135(1)(א)', computable: true, values: [
    { taxYear: 2025, value: 120, basis: 'primary', sourceId: 'itc1219', locator: 'סעיף 135(1)(א) לפקודה; דף השירות ודברי ההסבר לטופס', checkedAt: '11.10.2026',
      note: 'המועד המחייב הוא זה שפורש בדרישה. פקיד השומה לא רשאי לקבוע מועד לפני תום 120 יום מהמאוחר מבין יום הדרישה והיום שההצהרה מתייחסת אליו — רצפה, לא מועד. הספירה מיום הדרישה (פרשנות של הלשון), לא מיום הקבלה; דואר רשום נחשב נמסר ביום השישי אחרי המשלוח (סעיף 238). ארכה — לבקשת הנישום, או ארכה כללית שהרשות פרסמה. מחקר: docs/tax-foundation/wealth/deadline-rule-2026-10-11.md' },
  ] },
  { id: 'wealth.scope', label: 'הצהרת הון — מי ומה נכלל', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'ממלאים לפי דרישת פקיד השומה. כוללת את הנישום, בן/בת הזוג וילדים שטרם מלאו להם 18 בשנת המס; רכוש והתחייבויות בארץ ובחו״ל', basis: 'primary', sourceId: 'itc1219', checkedAt: C },
  ] },
  { id: 'wealth.costBasis', label: 'הצהרת הון — כללי רישום', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'עלות ולא שווי; עלויות נלוות ושיפורים נכללים; ירושה או מתנה — 1 ₪; נכס בתשלומים — מחיר מלא והחוב בנפרד; מט״ח לפי שער יציג ביום התשלום; אין קיזוז חייבים מול זכאים; קופות לפי סכום ההפקדות בלי רווחים; שקלים שלמים', basis: 'primary', sourceId: 'itc1219', locator: 'דברי ההסבר, עמ׳ 8 עד 10 בטופס', checkedAt: C },
  ] },
  { id: 'wealth.onlineSystem', label: 'הצהרת הון — הגשה מקוונת', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'מ-05.05.2025: מערכת מקוונת (רשות, לא חובה), שמירת טיוטה, צירוף מסמכים לכל סעיף ו«הסברים לגידול הון»; מייצג מצרף טופס חתום ע״י הנישום; הגשה נחשבת רק עם הודעת הגשה', basis: 'primary', sourceId: 'itaNotice20250505', checkedAt: C },
    { taxYear: 2027, effectiveFrom: '2027-01-01', value: 'מ-1.1.2027 הגשה מקוונת בלבד: הצהרה סרוקה או בנייר לא תתקבל ונחשבת כלא הוגשה (סעיף 131ג(ו)). מייצג מזדהה בתעודה אלקטרונית ומצרף פלט חתום ע״י הנישום; ההגשה מושלמת רק עם אישור קבלה במערכת', basis: 'primary', sourceId: 'itaNotice20260908', checkedAt: C, note: 'ההודעה רשמית; הכללים וצו התחילה נקראו מעותק משני. עד 31.12.2026 — שלושה ערוצים (מקוון, פניות, דלפק)' },
  ] },
  { id: 'wealth.comparison', label: 'השוואת הון בין הצהרות', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'גידול בהון נטו בין שתי הצהרות שאינו מוסבר — חזקה שמקורו בהכנסה שלא דווחה, ועל הנישום להסביר בראיות. בהיעדר ראיות אחרות — נפרס בשווה על השנים שבין ההצהרות; כשחלק מהשנים התיישנו — רק על השנים הפתוחות; טענה שהגידול שייך לשנים סגורות — בראיות אובייקטיביות (הצהרה מאוחרת אינה מספיקה); אין לטעון גם «לא חייב» וגם «התיישן». הוצאות מחיה — לפי טבלאות רשות המסים בהיעדר הסבר', basis: 'primary', sourceId: 'supremeCapitalComparison', locator: 'יוסף 2388/13, סלוקי 9114/15, חנני 552/02, בן חיים 562/08', checkedAt: C,
      revisions: [{ value: 'גידול בהון נטו בין שתי הצהרות, שאינו מוסבר בהכנסות מדווחות ובמקורות פטורים בניכוי הוצאות מחיה, משמש בסיס לשומה; הנטל להסביר בראיות עובר לנישום', basis: 'secondary', sourceId: 'caseLawSummaries', checkedAt: C, replacedAt: C, reason: 'נקראו פסקי הדין עצמם' }], note: 'אין הוראה של רשות המסים עם נוסחה רשמית — המבנה המעשי מופיע בפסק פרץ (מחוזי, 2026). התוכן הסופי והשאלונים — אחרי סקירת חומרי גיא; שיטת המשרד ממתינה לחומרי גיא' },
  ] },
  { id: 'wealth.lateFine', label: 'הצהרת הון — קנס על איחור', unit: 'text', law: 'סעיף 188(ז)', computable: false, values: [
    { taxYear: 2025, value: '200 ₪ לכל חודש איחור; אחרי מועד שהוארך — 400 ₪ לחודש מהמועד המוארך. הסכומים צמודים מדי שנה (188(ח)) — הסכום המעודכן לא נמצא', basis: 'secondary', sourceId: 'wikisourceOrdinance', locator: 'סעיפים 188(ז) ו־188(ח); דברי ההסבר לטופס 1219 מפנים לסעיף 188(ז)', checkedAt: C },
  ] },
  { id: 'wealth.refundHold', label: 'הצהרת הון באיחור — עיכוב החזר מס', unit: 'text', law: 'סעיף 159א(ב1)', computable: false, values: [
    { taxYear: 2025, value: 'החזר מס יכול להתעכב עד 90 יום מהגשת הצהרת הון שהוגשה באיחור', basis: 'secondary', sourceId: 'wikisourceOrdinance', locator: 'סעיף 159א(ב1)', checkedAt: C },
  ] },
  { id: 'wealth.periodicity', label: 'הצהרת הון — כמה פעמים נדרשים', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: '«סמוך לפתיחת תיק ואחר כך כל ארבע שנים» — טענה במקורות משניים, לא נמצאה בפרסום רשמי', basis: 'unverified', sourceId: 'caseLawSummaries', checkedAt: C, note: 'בפרסומים הרשמיים: הגשה רק לפי דרישה (135(1)), בלי קריטריונים ובלי מחזוריות. בפסקי הדין שנקראו — דרישות במרווחים של 10 עד 11 שנים (עדות מקרים, לא כלל). 11.10.2026: מבקר המדינה (2022) — «לפי מדיניות … שנקבעת מפעם לפעם»; «5 עד 6 שנים» (מכתב משרד אחר) ו«5 ומעלה» (קורס) לא נמצאו. לא להבטיח ללקוח מחזוריות' },
  ] },

  // ── הצהרת הון — מחקר חומרי הקורס מול מקורות (11.10.2026, docs/tax-foundation/wealth/) ──
  { id: 'wealth.livingTables', label: 'השוואת הון — טבלאות הוצאות מחיה: מה כלול ואיך בוחרים', unit: 'text', computable: false, values: [
    { taxYear: 2023, value: 'שורה לפי עשירון הכנסה שנתית ברוטו למשק בית; עמודה לפי מספר נפשות (1 עד 6+). לוחות 1 עד 2 — כל ההוצאות; 3 עד 4 — בלי תכולה ותכשיטים (סעיפים 100 ו-110 בטופס החדש) כשיש נתונים מפורטים; 5 עד 6 — גם בלי הוצאות רמת חיים, ומוסיפים הוצאות בפועל שאומתו. ריבית, הפרשי הצמדה ושכר דירה אינם כלולים באף לוח — מוסיפים לפי תשלום בפועל. לוחות 2, 4 ו-6 — אחוז מההכנסה ברוטו (עשירונים 2 עד 9)', basis: 'primary', sourceId: 'itaLivingTables', locator: 'הדף «מבנה הלוחות»; קובץ 2023 עמ׳ 1 עד 2', checkedAt: '11.10.2026', note: 'הקורס טען ששכר דירה כלול וצריך לנטרל — שגוי לפי הטבלאות הרשמיות. עוזרת, רכב, נסיעות, חינוך ורפואה כלולים בלוחות 1 עד 4 — להוסיף אותם בנפרד רק עם לוחות 5 עד 6. «2% בשנה» אינו כלל — לוקחים את הטבלה של כל שנה; לשנה בלי טבלה — האחרונה שפורסמה (פרשנות)' },
  ] },
  { id: 'wealth.funds', label: 'הצהרת הון — קופות, קרנות וביטוח עם חיסכון', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'סכום כל ההפקדות בתוכניות, בלי ריבית, הצמדה או רווחים', basis: 'primary', sourceId: 'itc1219', locator: 'דברי ההסבר, חלק א׳ 6 (עמ׳ 9)', checkedAt: '11.10.2026', note: 'פרשנות: «כל ההפקדות» כולל תגמולי מעסיק ופיצויים, ולעצמאי — כל מה שהפקיד. פתוח: האם פקיד השומה מקבל «חלק העובד בלבד» — נוהג בקורס ובפורומים, לא נמצא לו מקור רשמי. זו הכרעה מקצועית בתיק, לא מדיניות משרד; הצהרה קודמת בבסיס אחר — מגשרים בהשוואה (wealth.basisChange)' },
  ] },
  { id: 'wealth.securities', label: 'הצהרת הון — ניירות ערך', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'במונחי עלות בלבד, לפי תדפיסי המוסד. הטופס הישן (שאפשר בו שווי שוק וסיכום קניות ומכירות) התקבל עד 30.6.2025; מ-1.9.2025 — רק הטופס החדש', basis: 'primary', sourceId: 'itaNotice20250505', locator: 'סעיף 1; טופס 1219 חלק א׳ 7', checkedAt: '11.10.2026', note: 'השוואה מול הצהרה קודמת שנערכה בשווי שוק דורשת התאמת בסיס — אין הנחיה רשמית (פתוח)' },
  ] },
  { id: 'wealth.recordingDetails', label: 'הצהרת הון — כללי רישום נוספים מדברי ההסבר', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'משיכת יתר — מספר שלילי בסעיף הבנקים, לא בהתחייבויות; חשבון בשליטתך שאינו על שמך — נרשם; דירה בתשלומים (על הנייר) — המחיר הכולל בנכסים והיתרה לקבלן בהתחייבויות; בנייה עצמית — העלויות ששולמו; עלות קטנה מ-1 ₪ — 1 ₪; סעיף בלי נכסים — 0; חוב — קרן בלבד; עסק בלי מאזן — נספח לכל עסק', basis: 'primary', sourceId: 'itc1219', locator: 'דברי ההסבר, סעיפים 1, 2, 7, 8, 13; חלק א׳ 3, 8, 13; עמ׳ 8 סעיף 15', checkedAt: '11.10.2026' },
  ] },
  // ── כללי רישום מקצועיים — מחקר 11.10.2026 (docs/tax-foundation/wealth/professional-rules-2026-10-11.md).
  // ‼ אלה כללים מקצועיים עם סטטוס, לא העדפות משרד: מה שפתוח מוכרע בתיק על ידי רו"ח ומתועד.
  { id: 'wealth.businessAssets', label: 'הצהרת הון — רכוש קבוע בעסק בלי מאזן', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'עלות מקורית ותאריך רכישה לכל פריט (מכונות, ציוד, רכב, נדל״ן) — לא עלות מופחתת ולא שווי. עסק עם מאזן — רק חשבון ההון (חלק ב׳)', basis: 'primary', sourceId: 'itc1219', locator: 'דברי ההסבר, חלק ג׳ סעיפים 8 עד 11 (עמ׳ 13); עמ׳ 8 סעיף 3', checkedAt: '11.10.2026', note: 'הנוהג לרשום «עלות מופחתת» — לא נמצא לו מקור רשמי או מקצועי. הצהרה קודמת בעלות מופחתת — גישור בהשוואה' },
  ] },
  { id: 'wealth.foreignCurrency', label: 'הצהרת הון — מטבע חוץ', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'נכס או התחייבות במט״ח — הסכום במט״ח, ובשקלים לפי השער היציג ביום התשלום או הקבלה (ני״ע, קריפטו, נדל״ן בחו״ל). יתרות בנק ומזומן במט״ח — היתרה במט״ח כפי שבתדפיס ליום ההצהרה', basis: 'primary', sourceId: 'itc1219', locator: 'דברי ההסבר, עמ׳ 8 סעיף 12; חלק א׳ 3 ו-7 (עמ׳ 9)', checkedAt: '11.10.2026', note: 'פתוח: באיזה שער מתרגמים יתרות בנק ומזומן — הטופס לא קובע. הנוהג המקצועי: שער יציג ליום ההצהרה (פרשנות). הכרעה בתיק, עם הערה בנספח' },
  ] },
  { id: 'wealth.liabilities', label: 'הצהרת הון — הלוואות ומשכנתאות', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'חוב במונחי עלות (קרן) בלבד, בלי ריבית שטרם שולמה. נכס שנרכש בתשלומים — המחיר הכולל בנכסים, והיתרה בהתחייבויות', basis: 'primary', sourceId: 'itc1219', locator: 'דברי ההסבר, חלק א׳ 13 עד 14 (עמ׳ 10); חלק ג׳ 15 עד 16 (עמ׳ 13 עד 14); עמ׳ 8 סעיף 7', checkedAt: '11.10.2026', note: 'פתוח: הפרשי הצמדה על הקרן — נומינלית או צמודה. שתיהן תקינות רק אם השימוש בהשוואה תואם (שולמו מול נצברו). פתוח גם: חיובי אשראי פרטיים שטרם ירדו' },
  ] },
  { id: 'wealth.basisChange', label: 'הצהרת הון — שינוי בסיס מול ההצהרה הקודמת', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'בחלק ד׳ 4 רושמים את ההון נטו של ההצהרה הקודמת כפי שהוצהר. אחרי ההגשה אפשר להוסיף מסמכים במערכת המקוונת, כולל «הסברים לגידול הון»', basis: 'primary', sourceId: 'itc1219', locator: 'עמ׳ 7 ו-15 (חלק ד׳ 4); הודעה למייצגים 05.05.2025 סעיף 2.2', checkedAt: '11.10.2026', note: 'פרשנות מקצועית: ההצהרה הנוכחית נערכת לפי הטופס, לא לפי שיטה קודמת שגויה. בהשוואה — גישור: הקודמת מחושבת מחדש בבסיס הנוכחי, והפרש הבסיס מוצג בנפרד עם הסבר וראיה, באישור רו"ח. נכס שהיה ולא הוצהר אינו שינוי בסיס — השמטה, לבירור (סעיפים 216, 220). פתוח: נוהל רשמי לתיקון הצהרה' },
  ] },
  { id: 'wealth.filedEvidence', label: 'הצהרת הון — מתי היא «הוגשה»', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'רק אחרי השלמת תהליך החתימה וקבלת הודעת הגשה במערכת המקוונת (או אישור הגשה על העתק בדלפק). חתימה של אחד מבני הזוג; מייצג מצרף טופס חתום ע״י הנישום', basis: 'primary', sourceId: 'itaNotice20250505', locator: 'סעיפים 2.3 עד 2.4; טופס 1219 עמ׳ 15', checkedAt: '11.10.2026' },
  ] },

  // ── עסק זעיר ומדדים כלליים ───────────────────────────────────────────────
  // ‼ מסלול של מס הכנסה בלבד (87ב עד 87ז, מ-1.1.2024). התקרה = הסכום בהגדרת «עוסק פטור» בחוק מע״מ — הסכום, לא המעמד:
  //   עוסק מורשה יכול להיות עסק זעיר, ועוסק פטור אינו בהכרח. docs/tax-foundation/micro/micro-business-research-2026-10-11.md
  { id: 'micro.turnoverCeiling', label: 'עסק זעיר — תקרת מחזור (= הסכום בהגדרת «עוסק פטור»)', unit: '₪', law: 'סעיף 87ב(1); חוק מע״מ סעיפים 1 ו-126', computable: true, values: [
    { taxYear: 2024, value: 120_000, basis: 'primary', sourceId: 'efficiencyLaw2023', locator: 'ס׳ 35, עמ׳ 173; מדריך 2024 פרק א׳ סעיף 9', checkedAt: '11.10.2026' },
    { taxYear: 2025, value: 120_000, basis: 'primary', sourceId: G25, locator: 'פרק א, סעיף 9; פרק ד', checkedAt: C },
    { taxYear: 2026, value: 122_833, basis: 'primary', sourceId: 'itaMicroFaq', locator: '«נכון לשנת 2026… כ-122,833» (עודכן 24.02.2026); דף «בקשה לשינוי סוג תיק»', checkedAt: '11.10.2026', note: 'הצמדה ראשונה 1.1.2026 (ס׳ 37(ב)). הפרסום אומר «כ-»; הסכום המדויק — בהערת הנוסח של חוק מע״מ (משני).' },
  ] },
  { id: 'micro.normativeRate', label: 'עסק זעיר — ניכוי הוצאות נורמטיבי (במקום סעיפים 17 עד 27 ו-47א; 17(5א) נשמר)', unit: 'rate', law: 'סעיף 87ד(א); שינוי בצו — 87ז(ב)', computable: true, values: [
    { taxYear: 2024, value: 0.30, basis: 'primary', sourceId: 'efficiencyLaw2023', locator: 'ס׳ 87ד(א), עמ׳ 172', checkedAt: '11.10.2026' },
    { taxYear: 2025, value: 0.30, basis: 'primary', sourceId: 'efficiencyLaw2023', locator: 'ס׳ 87ד(א), עמ׳ 172', checkedAt: '11.10.2026',
      revisions: [{ value: 0.30, basis: 'primary', sourceId: 'form1301_2025', checkedAt: C, replacedAt: '11.10.2026', reason: 'המקור הוחלף לנוסח החוק; קודי 1301 שבמיקום הקודם לא אומתו' }] },
    { taxYear: 2026, value: 0.30, basis: 'derived', sourceId: 'efficiencyLaw2023', locator: 'ס׳ 87ד(א); לא נמצא צו לפי 87ז(ב)', checkedAt: '11.10.2026', note: 'נוסח רשמי + היעדר צו שינוי שאותר' },
  ] },
  { id: 'micro.coolingYears', label: 'עסק זעיר — שנות צינון אחרי שנה שבה לא ניכה (אחרי שנה שבה ניכה)', unit: 'count', law: 'סעיף 87ה(ב)', computable: true, values: [
    { taxYear: 2024, value: 2, basis: 'primary', sourceId: 'efficiencyLaw2023', locator: 'ס׳ 87ה(ב), עמ׳ 173 — «בשתי שנות המס שלאחר…»; שנת 87ד(ג) נחשבת «לא ניכה»', checkedAt: '11.10.2026', note: 'מדריכי 2024 ו-2025: «שלוש השנים הבאות» — כולל שנת היציאה; אותה תקופה כמו בחוק (דברי ההסבר: «שנתיים נוספות»). ניכה 2024, לא ניכה 2025 ⇒ חסום 2026 ו-2027, חוזר 2028.' },
    { taxYear: 2025, value: 2, basis: 'derived', sourceId: 'efficiencyLaw2023', locator: 'נוסח 2024 בתוקף; לא אותר תיקון לסעיף', checkedAt: '11.10.2026' },
    { taxYear: 2026, value: 2, basis: 'derived', sourceId: 'efficiencyLaw2023', locator: 'נוסח 2024 בתוקף; לא אותר תיקון לסעיף', checkedAt: '11.10.2026' },
  ] },
  { id: 'micro.niBase', label: 'עסק זעיר — בסיס דמי הביטוח הלאומי', unit: 'text', law: 'סעיף 345(ב)(1)(א) לחוק הביטוח הלאומי (תיקון 237)', computable: false, values: [
    { taxYear: 2024, value: 'אין ניכוי 52% לבעל עסק זעיר (מאומת). הבסיס — «ההכנסה בשומה», כלומר 70% מהמחזור — קריאה חזקה, לא כתוב במפורש; אין הנחיה של ב״ל', basis: 'secondary', sourceId: 'efficiencyLaw2023', locator: 'ס׳ 36, עמ׳ 173 — «ובלבד שלא חלות עליו ההוראות לעניין סכום הניכוי לבעל עסק זעיר»; דברי ההסבר, הצ״ח 1612 עמ׳ 936', checkedAt: '11.10.2026', note: 'לא לחישוב: בהערכה — השלמה מקצועית מאושרת בלבד' },
  ] },
  { id: 'micro.exceededCap', label: 'עסק זעיר שחרג (רשום בתחילת השנה) — תקרת הניכוי: 30% מתקרת «עוסק פטור»', unit: 'rate', law: 'סעיף 87ד(ג)', computable: true, values: [
    { taxYear: 2024, value: 0.30, basis: 'primary', sourceId: 'efficiencyLaw2023', locator: 'ס׳ 87ד(ג), עמ׳ 172 — «ובלבד שסכום הניכוי לא יעלה על 30% מהסכום הקבוע בהגדרה "עוסק פטור"»', checkedAt: '11.10.2026', note: '2024 ו-2025: 36,000; 2026: 36,849.90. בתנאי ש-87ה(א)(2), (4), (6) ו-87ה(ב) לא מתקיימים. שילוב עם הוצאות בפועל על היתרה — לא מותר לפי הקריאה הסבירה (פרשנות).' },
    { taxYear: 2025, value: 0.30, basis: 'derived', sourceId: 'efficiencyLaw2023', locator: 'נוסח 2024 בתוקף; לא אותר תיקון לסעיף', checkedAt: '11.10.2026' },
    { taxYear: 2026, value: 0.30, basis: 'derived', sourceId: 'efficiencyLaw2023', locator: 'נוסח 2024 בתוקף; לא אותר תיקון לסעיף', checkedAt: '11.10.2026' },
  ] },
  { id: 'core.creditPoint', label: 'שווי נקודת זיכוי (שנתי)', unit: '₪', computable: true, values: [
    { taxYear: 2025, value: 2_904, basis: 'primary', sourceId: G25, checkedAt: C },
    { taxYear: 2026, value: 2_904, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ג, עמ׳ 12 — «נקודת זיכוי 33א: 242 לחודש» (× 12)', checkedAt: '11.10.2026',
      revisions: [{ value: 2_904, basis: 'secondary', sourceId: 'existingDataset', checkedAt: '07.2026', replacedAt: '11.10.2026', reason: 'נקרא בלוח העזר הרשמי («מעודכן לאפריל 2026»)' }] },
  ] },
  { id: 'core.rentalExemption', label: 'תקרת פטור על שכר דירה למגורים (חודשי)', unit: '₪', law: 'חוק מס הכנסה (פטור ממס על הכנסה מהשכרת דירת מגורים)', computable: true, values: [
    { taxYear: 2025, value: 5_654, basis: 'primary', sourceId: 'itaBooklet2025', locator: 'עמ׳ 11', checkedAt: C },
    { taxYear: 2026, value: 5_654, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'עמ׳ 13', checkedAt: C, note: 'מוקפא — סעיף 120ב(ה)' },
  ] },
  // ‼ שלב 3 (הערכת מס): המדרגות נקראות מ-taxData.ts; הכלל כאן הוא השער — לשנה בלי מקור ראשי אין
  //   חבות שנראית ודאית, אלא אם המשרד תיעד הכרעה (בגרסת ההערכה עצמה).
  { id: 'core.incomeTaxBrackets', label: 'מדרגות מס הכנסה ליחיד (שנתי)', unit: 'text', computable: true, values: [
    { taxYear: 2025, value: '10% עד 84,120 · 14% עד 120,720 · 20% עד 193,800 · 31% עד 269,280 · 35% עד 560,280 · 47% מעל', basis: 'primary', sourceId: G25, locator: 'מדריך 2025 — מדרגות המס', checkedAt: C },
    { taxYear: 2026, value: '10% עד 84,120 · 14% עד 120,720 · 20% עד 228,000 · 31% עד 301,200 · 35% עד 560,280 · 47% מעל', basis: 'primary', sourceId: 'itaBooklet2026',
      locator: 'פרק ב, עמ׳ 10 — «שיעורי המס לשנת 2026 (לאחר חוק ריווח מדרגות מס הכנסה)»; פרק א עמ׳ 4 — תיקון סעיף 121 ב-31.3.2026, מ-1.1.2026', checkedAt: '11.10.2026',
      note: 'זהה ל-taxData.ts. הלוח בגרסת אפריל 2026 פורסם מחדש אחרי חוק ההתייעלות (31.3.2026); לפי הלוח, בסתירה — הדין גובר.',
      revisions: [{ value: '10% עד 84,120 · 14% עד 120,720 · 20% עד 228,000 · 31% עד 301,200 · 35% עד 560,280 · 47% מעל', basis: 'secondary', sourceId: 'existingDataset', checkedAt: '11.10.2026', replacedAt: '11.10.2026', reason: 'נקרא בלוח העזר הרשמי («מעודכן לאפריל 2026»), עמ׳ 4 ו-10' }] },
  ] },
  { id: 'core.surtaxThreshold', label: 'סף מס יסף (הכנסה חייבת שנתית)', unit: '₪', computable: true, values: [
    { taxYear: 2025, value: 721_560, basis: 'primary', sourceId: 'form1301_2025', checkedAt: C },
    { taxYear: 2026, value: 721_560, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'פרק ב, עמ׳ 11 — סעיף 121ב: «עלתה על 721,560 ₪», 3%; ועוד 2% על הכנסה חייבת ממקורות הוניים', checkedAt: '11.10.2026',
      revisions: [{ value: 721_560, basis: 'secondary', sourceId: 'existingDataset', checkedAt: '07.2026', replacedAt: '11.10.2026', reason: 'נקרא בלוח העזר הרשמי («מעודכן לאפריל 2026»)' }] },
  ] },
  { id: 'core.foreignAssetsReport', label: 'חובת דוח — נכסים בחו״ל', unit: '₪', computable: true, values: [
    { taxYear: 2025, value: 2_086_000, basis: 'primary', sourceId: 'form1301_2025', checkedAt: C },
  ] },
  { id: 'core.securitiesTurnoverReport', label: 'חובת דוח — מחזור מכירות ני״ע', unit: '₪', computable: true, values: [
    { taxYear: 2025, value: 2_810_000, basis: 'primary', sourceId: 'form1301_2025', checkedAt: C },
  ] },

  // ── 13.10.2026 · הכנסה הונית של יחיד (מחקר: docs/tax-foundation/research/controlling-shareholder-capital-2026-10-13.md) ──
  // ‼ 2026: השיעורים קבועים בחוק ולא נמצא תיקון — אבל רשימת התיקונים לא נבדקה לסעיפים 91, 125ב, 125ג ⇒ secondary;
  //   הערכה לשנת 2026 עם הכנסה הונית דורשת הכרעת משרד מתועדת (כמו כל כלל ליבה שאינו ממקור ראשי).
  { id: 'cap.gain.realRate', label: 'רווח הון ריאלי של יחיד (נכס מ-2012)', unit: 'rate', law: 'סעיף 91(ב)', computable: true, values: [
    { taxYear: 2025, value: 0.25, basis: 'primary', sourceId: G25, locator: 'פרק ה, עמ׳ 48 («עד 25%»)', checkedAt: C13 },
    { taxYear: 2026, value: 0.25, basis: 'derived', sourceId: 'wikisourceOrdinance', locator: 'תגיות התיקון בנוסח: סעיף 91 — אחרון תשע״ז (2017)', checkedAt: '14.10.2026', note: 'הערך של 2025 (מדריך 2025, ראשי) — הסעיף לא תוקן מאז, ולכן אין צורך בהכרעת משרד' },
  ] },
  { id: 'cap.dividend.regularRate', label: 'דיבידנד ליחיד', unit: 'rate', law: 'סעיף 125ב(1)', computable: true, values: [
    { taxYear: 2025, value: 0.25, basis: 'primary', sourceId: G25, locator: 'פרק ה, עמ׳ 40', checkedAt: C13 },
    { taxYear: 2026, value: 0.25, basis: 'derived', sourceId: 'wikisourceOrdinance', locator: 'תגיות התיקון בנוסח: סעיף 125ב — אחרון תשע״ב (2012)', checkedAt: '14.10.2026', note: 'הערך של 2025 (מדריך 2025, ראשי) — הסעיף לא תוקן מאז, ולכן אין צורך בהכרעת משרד' },
  ] },
  { id: 'cap.dividend.substantialRate', label: 'דיבידנד מחברה שבה הוא בעל מניות מהותי (10%+)', unit: 'rate', law: 'סעיף 125ב(1)', computable: true, values: [
    { taxYear: 2025, value: 0.30, basis: 'primary', sourceId: G25, locator: 'פרק ה, עמ׳ 40 — רק מאותה חברה', checkedAt: C13, note: 'לא כל ההכנסה ההונית של בעל המניות — רק הדיבידנד מאותה חברה' },
    { taxYear: 2026, value: 0.30, basis: 'derived', sourceId: 'wikisourceOrdinance', locator: 'תגיות התיקון בנוסח: סעיף 125ב — אחרון תשע״ב (2012)', checkedAt: '14.10.2026', note: 'הערך של 2025 (מדריך 2025, ראשי) — הסעיף לא תוקן מאז, ולכן אין צורך בהכרעת משרד' },
  ] },
  { id: 'cap.interest.unlinkedRate', label: 'ריבית על פיקדון / ני״ע לא צמודים', unit: 'rate', law: 'סעיף 125ג(ג)(1)', computable: true, values: [
    { taxYear: 2025, value: 0.15, basis: 'primary', sourceId: G25, locator: 'פרק ה, עמ׳ 41 עד 42', checkedAt: C13 },
    { taxYear: 2026, value: 0.15, basis: 'derived', sourceId: 'wikisourceOrdinance', locator: 'תגיות התיקון בנוסח: סעיף 125ג — אחרון תשע״ב (2012)', checkedAt: '14.10.2026', note: 'הערך של 2025 (מדריך 2025, ראשי) — הסעיף לא תוקן מאז, ולכן אין צורך בהכרעת משרד' },
  ] },
  { id: 'cap.interest.linkedRealRate', label: 'ריבית צמודה / זרה — הרווח הריאלי', unit: 'rate', law: 'סעיף 125ג', computable: true, values: [
    { taxYear: 2025, value: 0.25, basis: 'primary', sourceId: G25, locator: 'פרק ה, עמ׳ 41 עד 42 («עד 25%»)', checkedAt: C13 },
    { taxYear: 2026, value: 0.25, basis: 'derived', sourceId: 'wikisourceOrdinance', locator: 'תגיות התיקון בנוסח: סעיף 125ג — אחרון תשע״ב (2012)', checkedAt: '14.10.2026', note: 'הערך של 2025 (מדריך 2025, ראשי) — הסעיף לא תוקן מאז, ולכן אין צורך בהכרעת משרד' },
  ] },
  { id: 'cap.interest.ownCompany', label: 'ריבית מחברה שהוא בעל מניות מהותי בה / עובד בה', unit: 'text', computable: false, values: [
    { taxYear: 2025, value: 'בשיעורי המס הרגילים (לא 15%/25%) — שדה 167/150', basis: 'primary', sourceId: G25, locator: 'פרק ה, עמ׳ 41', checkedAt: C13 },
  ] },

  // ── 13.10.2026 · זיכויים (מחקר: credits-spouses-2026-10-13.md) ──
  { id: 'credit.lifeIns.rate', label: 'זיכוי בעד ביטוח חיים (ריסק)', unit: 'rate', law: 'סעיף 45א(א)', computable: true, values: [
    { taxYear: 2025, value: 0.25, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 73, עמ׳ 70', checkedAt: C13, note: 'גם פוליסה על חיי בן/בת הזוג; רק ריסק בחברת ביטוח — כיסוי מוות בתוך קרן פנסיה הוא חלק מההפקדה לקצבה (35%). תקרה אחת עם ההפקדות לקצבה (45א(ד)); סדר המילוי — פנסיה קודם, ביטוח חיים ביתרה (itaExamples45a2005, משני: עותק לא רשמי)' },
    { taxYear: 2026, value: 0.25, basis: 'derived', sourceId: 'knessetAmendments', locator: 'סעיף 45א לא תוקן בתיקונים 275 עד 292', checkedAt: C13 },
  ] },
  { id: 'credit.45a.workRate', label: '45א — התקרה מהכנסת עבודה (7% מההכנסה המזכה)', unit: 'rate', law: 'סעיף 45א(ד)(2)(ב)(2)', computable: true, values: [
    { taxYear: 2025, value: 0.07, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיפים 73 עד 76, עמ׳ 70 ו-71', checkedAt: C13, note: 'בתוך ה-7%: ביטוח חיים + שאירים + בשל הכנסה שאינה מעבודה — עד 5%; שאירים עד 1.5%' },
    { taxYear: 2026, value: 0.07, basis: 'derived', sourceId: 'knessetAmendments', locator: 'סעיף 45א לא תוקן בתיקונים 275 עד 292', checkedAt: C13 },
  ] },
  { id: 'credit.45a.fixedCeiling', label: 'תקרת הסכום המזכה ב-45א «ללא הגבלה באחוזים» (שנתי)', unit: '₪', law: 'סעיף 45א(ד)', computable: true, values: [
    { taxYear: 2025, value: 2_268, basis: 'primary', sourceId: 'itaBooklet2025', locator: 'עמ׳ 10 — 189 לחודש', checkedAt: C13 },
    { taxYear: 2026, value: 2_268, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'עמ׳ 12 — 189 לחודש', checkedAt: C13 },
  ] },
  { id: 'credit.donation.minExclusive', label: 'תרומות — הסכום שמעליו יש זיכוי (סעיף 46)', unit: '₪', law: 'סעיף 46', computable: true, values: [
    { taxYear: 2025, value: 207, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 78, עמ׳ 72; לוח העזר 2025 עמ׳ 11', checkedAt: C13, note: '«יותר מ-207» — 207 בדיוק אינו מזכה' },
    { taxYear: 2026, value: 207, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'עמ׳ 13', checkedAt: C13 },
  ] },
  { id: 'credit.donation.maxAmount', label: 'תרומות — תקרה בשקלים (בנוסף ל-30% מההכנסה החייבת)', unit: '₪', law: 'סעיף 46', computable: true, values: [
    { taxYear: 2025, value: 10_354_816, basis: 'primary', sourceId: G25, locator: 'פרק ד, סעיף 78', checkedAt: C13 },
    { taxYear: 2026, value: 10_354_816, basis: 'primary', sourceId: 'itaBooklet2026', locator: 'עמ׳ 13', checkedAt: C13 },
  ] },

  // ── 13.10.2026 · 6111 (מחקר: form6111-expense-dictionary-2026-10-13.md) ──
  { id: 'form6111.threshold', label: '6111 — מי פטור לפי מחזור', unit: 'text', law: 'סעיף 240ב(ג) ו-(ד)(1); הגדרת «מחזור» בהוראות ניהול פנקסי חשבונות, סעיף 1', computable: false, values: [
    { taxYear: 2025, value: 'חייבים: מי שחייב בהנהלת חשבונות כפולה, או מנהל רישום ממוחשב כלשהו (כמעט כל עסק). פטור מי שמחזור עסקיו אינו עולה על 300,000 ₪ כולל מע״מ; וחקלאים בתוספת יב. «מחזור» בהוראות ניהול פנקסים כולל מסים עקיפים — ולכן «כולל מע״מ» הוא ההגדרה. 256,410 (טופס 1301) ו-254,777 (מבנה הקובץ) הן תוויות המרה ישנות. השנה הנבדקת: מחזור השנה הקודמת בהיקף שנתי (× 12 ÷ חודשי הפעילות), או מחזור השומה הסופית האחרונה — הגבוה; עסק חדש — לפי אומדן. בני זוג — כל אחד לבד (לא מצרפים); ס׳ 33 בטופס = כן אם אחד מהם חייב. פטור לפי ההגדרה אבל שנת הדוח מעל הסף — מומלץ לשדר. שארית: אין הודעה מפורשת של הרשות על השנה', basis: 'primary', sourceId: G25, locator: 'פרק ב, עמ׳ 9; 1301 חלק א סעיף 33; הגדרת «מחזור» בהוראות ניהול פנקסים (משני); research/remaining-leads-2026-10-14 §1', checkedAt: C14, note: 'research/open-law-questions-2026-10-13.md §1. סעיף 240ב לא תוקן מאז תשע״ו לפי ויקיטקסט',
      revisions: [{ value: 'חייבים: מי שחייב בהנהלת חשבונות כפולה, או מנהל רישום ממוחשב כלשהו (כמעט כל עסק). פטור מי שמחזור עסקיו אינו עולה על 300,000 ₪ כולל מע״מ; וחקלאים בתוספת יב. «מחזור» בהוראות ניהול פנקסים כולל מסים עקיפים — ולכן «כולל מע״מ» הוא ההגדרה, לא פרשנות. 256,410 (טופס 1301) ו-254,777 (מבנה הקובץ) הן תוויות המרה ישנות (17% ו-17.75% של 2015); ההמרה ל-18% היא 254,237. פתוח: איזו שנה קובעת (ההגדרה — השנה הקודמת בהיקף שנתי; הטופס — שנת הדוח, יחד עם בן/בת הזוג). אם אחת הקריאות מעל הסף — לשדר', basis: 'primary', sourceId: G25, checkedAt: C13, replacedAt: C14, reason: 'נמצא כלל השנה הנבדקת (הגדרת «מחזור» בהוראות ניהול פנקסים, הפניה בדברי ההסבר) ובני זוג לא מצורפים' }] },
    { taxYear: 2026, value: 'כמו 2025, עד פרסום מדריך 2026 — הסף הוא קביעה מנהלית שנתית', basis: 'derived', sourceId: G25, locator: 'מדריך 2025 + אין תיקון ל-240ב', checkedAt: C13, note: 'המדריך מתאר את 2025; ל-2026 — אותו כלל עד שיתפרסם הסף לשנה (240ב לא תוקן)' },
  ] },

  // ── 13.10.2026 · בני זוג (טקסט — לא לחישוב) ──
  { id: 'spouse.jointDefault', label: 'בני זוג — חישוב מאוחד הוא ברירת המחדל', unit: 'text', law: 'סעיפים 65, 66', computable: false, values: [
    { taxYear: 2025, value: 'הכנסות שני בני הזוג הן הכנסת בן הזוג הרשום. חישוב נפרד — רק בתנאי סעיף 66; גם כשביקשו, אם המאוחד זול יותר — השומה לפיו. אין «בחירה» חופשית', basis: 'primary', sourceId: G25, locator: 'פרק א, עמ׳ 16 עד 17; עמ׳ 67', checkedAt: C13 },
  ] },
  { id: 'spouse.separateEligibility', label: 'בני זוג — מתי מותר חישוב נפרד', unit: 'text', law: 'סעיף 66(א), 66(ד)', computable: false, values: [
    { taxYear: 2025, value: 'הכנסה מיגיעה אישית (עסק/משלח יד/עבודה, קצבה, מענק פרישה חייב, שכירות מנכס עסקי 10 שנים, קצבת אכ״ע). מקור תלוי בבן הזוג — רק אם יגיעת כל אחד נדרשת, ההכנסה כנגד תרומתו, ובבית — דרך קבע ומרבית הפעילות (1301 חלק א׳ סעיף 2)', basis: 'primary', sourceId: G25, locator: 'עמ׳ 16, 20', checkedAt: C13 },
  ] },
  { id: 'spouse.propertyIncomeAttribution', label: 'בני זוג — שיוך הכנסה שאינה מיגיעה אישית', unit: 'text', law: 'סעיף 66(א)(2), 66(ב)', computable: false, values: [
    { taxYear: 2025, value: 'שכירות, ריבית, דיבידנד ורווח הון נזקפים לבן הזוג שהכנסתו החייבת מיגיעה אישית גבוהה יותר — אלא רכוש מלפני הנישואים (שנה לפחות) או מירושה, לבקשת הבעלים. אין פיצול לפי בחירה', basis: 'primary', sourceId: G25, locator: 'עמ׳ 16, 20, 37, 48', checkedAt: C13, note: 'הערה ישנה בקוד המחשבון (taxCalculations) שמתירה פיצול — לא מגובה; הו״ב 9/2015 לא נקראה' },
  ] },

  // ── 13.10.2026 · בני זוג — חישוב מאוחד במספרים (מחקר: spouses-joint-separate-numeric-2026-10-13.md) ──
  { id: 'spouse.workingSpousePoints.noChildren', label: 'מאוחד — נקודות «בן זוג עובד» לרשום (בלי ילדים מזכים)', unit: 'count', law: 'סעיף 38(א)', computable: true, values: [
    { taxYear: 2025, value: 1.75, basis: 'primary', sourceId: G25, locator: 'עמ׳ 66, 94 — ¼ + 1.5', checkedAt: C13 },
    { taxYear: 2026, value: 1.75, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + נוסח 38 בוויקיטקסט (13.10.2026); אין מדריך 2026', checkedAt: C13 },
  ] },
  { id: 'spouse.workingSpousePoints.withChildren', label: 'מאוחד — נקודות «בן זוג עובד» לרשום (עם ילדים מזכים)', unit: 'count', law: 'סעיף 38(א)', computable: true, values: [
    { taxYear: 2025, value: 2, basis: 'primary', sourceId: G25, locator: 'עמ׳ 66 (הדוגמה), 94 — ¼ + 1.75', checkedAt: C13 },
    { taxYear: 2026, value: 2, basis: 'derived', sourceId: 'knessetAmendments', locator: 'מדריך 2025 + נוסח 38 בוויקיטקסט (13.10.2026); אין מדריך 2026', checkedAt: C13 },
  ] },
  { id: 'spouse.fiveTimesExclusion', label: 'מאוחד — הכנסת בן הזוג עד פי 5 מנקודות 38 לא נכללת', unit: 'text', law: 'סעיף 38(ב)', computable: false, values: [
    { taxYear: 2025, value: 'הכנסת בן הזוג מיגיעה אישית שאינה עולה על פי 5 משווי נקודות 38 — לא נכללת, והנקודות לא ניתנות: 25,410 (1.75 נק׳) / 29,040 (2 נק׳). חל על כל חישוב מאוחד', basis: 'primary', sourceId: G25, locator: 'עמ׳ 66, 94', checkedAt: C13, note: 'מתקן את המחקר הקודם שתלה את המבחן ב«יחיד מוטב»' },
  ] },
  { id: 'spouse.registeredSpouse', label: 'בני זוג — מי הרשום', unit: 'text', law: 'סעיף 64ב', computable: false, values: [
    { taxYear: 2025, value: 'ברירת המחדל: מי שהכנסתו החייבת עולה על 50% מהכנסת שניהם שנתיים לפני השנה הרלוונטית; או בחירה (תנאי 25%, הודעה 3 חודשים מראש, לפחות 5 שנים). מי הרשום בפועל — עובדה ברשומות הרשות (שע״ם), לא הסקה. כשלא אושר — מחשבים לשני הכיוונים', basis: 'secondary', sourceId: 'wikisourceOrdinance', locator: 'סעיף 64ב(א), (ב), (ד)', checkedAt: C14 },
  ] },
  { id: 'spouse.surtaxPerSpouse', label: 'בני זוג — מס יסף בחישוב נפרד', unit: 'text', law: 'סעיף 121ב', computable: false, values: [
    { taxYear: 2025, value: 'מס יסף לפי אופן החישוב: בנפרד — סף לכל בן זוג; במאוחד — על ההכנסה המשותפת. הכנסה מרכוש (כולל שכירות 10%) — לפי כללי השיוך של המס עצמו. היסף הנוסף 2% על הכנסה הונית — לכל בן זוג (פרשנות: הו״ב 05/2025 אינה מתייחסת לבני זוג)', basis: 'primary', sourceId: G25, locator: 'הו״ב 9/2015; הו״ב 05/2025 (research/joint-child-points §3)', checkedAt: C14 },
  ] },
  { id: 'spouse.jointChildPoints', label: 'מאוחד — נקודות ילדים', unit: 'text', law: 'סעיף 66(ג) («ההוראות שיחולו על החישוב הנפרד»), (4), (5)', computable: false, values: [
    { taxYear: 2025, value: 'במאוחד אין נקודות ילדים לאף אחד מבני הזוג — גם לא לטור של הרשום, וגם כשהמאוחד חובה לפי 66(ד). נקודות ילדים לזוג נשוי — רק בחישוב נפרד, וכנגד המס על היגיעה האישית של ההורה. השפעת ילדים במאוחד: 2 נקודות «בן זוג עובד» במקום 1.75 (38), או 1.75 במקום 1.5 (39)', basis: 'primary', sourceId: G25, locator: 'עמ׳ PDF 67 (מודפס 65) — «רק בחישוב נפרד», פעמיים; הו״ב 3/2015 עמ׳ 2', checkedAt: C14, note: 'research/joint-child-points-2026-10-14.md. סיכון שנשאר: טענה לטור הרשום — בלי מקור, כל מסמכי הרשות סותרים; חשיפה עד הטור × 2,904' },
    { taxYear: 2026, value: 'כמו 2025: סעיף 66 לא שונה (ויקיטקסט); מדריך 2026 טרם פורסם', basis: 'derived', sourceId: 'wikisourceOrdinance', locator: 'סעיף 66 — תגיות התיקון', checkedAt: C14 },
  ] },

  // ── 13.10.2026 · מקדמות ותשלומים (מחקר: advances-mechanisms-2026-10-13.md) ──
  { id: 'it.advances.dueDay', label: 'מס הכנסה — יום התשלום של מקדמה', unit: 'count', law: 'סעיף 175(א); תקנה 2 לתקנות המחזור', computable: true, values: [
    { taxYear: 2026, value: 15, basis: 'primary', sourceId: G25, locator: 'פרק ח, סעיף 1, עמ׳ 115', checkedAt: C13, note: 'ה-15 בחודש שאחרי התקופה; דחייה בימי מנוחה (175(ו)); קנס רק אחרי 7 ימי פיגור (190(א)(1)(א), משני)' },
  ] },
  { id: 'ni.advances.dueDay', label: 'ב״ל — יום התשלום של מקדמה לעצמאי', unit: 'count', law: 'תקנה 2(א)(1) לתקנות הגבייה', computable: true, values: [
    { taxYear: 2026, value: 15, basis: 'primary', sourceId: 'btlCircular1502', locator: 'עמ׳ 5 — «מקדמת 12/2025 שמועד תשלומה 15/1/2026»', checkedAt: C13, note: 'בעד החודש הקודם; בהוראת קבע — ה-22 (ni.payment.day); ביום מנוחה — היום שאחריו' },
  ] },
  { id: 'ni.advances.increaseCharge', label: 'ב״ל — «הגדלת מקדמות» כחיוב נפרד', unit: 'text', computable: false, values: [
    { taxYear: 2026, value: 'סוג חיוב נפרד גם ב-2026, עם מועד חיוב משלו — יכול להיות אחרי סוף השנה (עד 3.3). התיקון חל מינואר, ולכן החיוב = ההפרש × החודשים שעברו. הצמדה מהמועדים המקוריים — צפויה (תקנה 6(ב); תקנות השומה הסופית מצמידות כל חודש ממועדו), לא אושרה ברשות. ריבית — אין, אלא בהסדר תשלומים (368(ב)). קנס 364 — רק על פיגור; לא צפוי אם החיוב משולם עד המועד שב״ל קובע, ולא פורסם אם נגבה מהמועדים המקוריים. בלי הגדלה — ההפרש לכל השנה נגבה בשומה הסופית, עם הצמדה עד יום החישוב', basis: 'primary', sourceId: 'btlCircular1502', locator: 'עמ׳ 5; שאלות ותשובות ב״ל (תיקון «יחול מתחילת השנה»); טופס 672 (10.2025); research/advances-topup-charges-2026-10-14 חלק א', checkedAt: C14,
      revisions: [{ value: 'סוג חיוב נפרד גם ב-2026, עם מועד חיוב משלו — יכול להיות אחרי סוף השנה (עד 3.3). הצמדה — כנראה מהמועדים המקוריים: תקנה 6(ב) רואה במקדמות המחושבות מחדש כאילו חלו במועדיהן, ותקנות השומה הסופית מצמידות כל חודש ממועדו (פרשנות חזקה). קנס לפי 364 — לא הוכרע. הגדלה באמצע השנה אינה חוסכת את ההצמדה שכבר נצברה', basis: 'primary', sourceId: 'btlCircular1502', checkedAt: C13, replacedAt: C14, reason: 'אומת שהתיקון חל מינואר; ריבית וקנס הובחנו מהצמדה' }] },
  ] },
  { id: 'ni.advances.changeGrounds', label: 'ב״ל — עילות לתיקון מקדמות', unit: 'text', law: 'תקנה 4(א) לתקנות המקדמות', computable: false, values: [
    { taxYear: 2026, value: 'שומה לשנה הקודמת; שינוי של 10% לפחות במקדמת מס הכנסה (180); שינוי של 20% במחזור ב-3 חודשים רצופים; שינוי של 10% בהכנסה. פעם ברבעון, עד 31.12', basis: 'secondary', sourceId: 'wikisourceNiAdvances', locator: 'תקנות 4(א), 5; טופס 672 (רשמי)', checkedAt: C13 },
  ] },
  { id: 'ni.lateFine', label: 'ב״ל — קנס פיגורים על דמי ביטוח', unit: 'text', law: 'סעיף 364; צו 2010', computable: false, values: [
    { taxYear: 2026, value: '0.07% ליום עד ה-1 בחודש שאחרי המועד, ואחר כך 0.2% לכל שבוע או חלק ממנו; הצמדה מה-1 בחודש שאחרי. הפרשי שומה סופית — חוב כדין, לא קנס (תוך 30 יום מההודעה)', basis: 'primary', sourceId: 'btlFineOrder2010', locator: 'סעיפים 2, 2א', checkedAt: C13 },
  ] },
  { id: 'it.interest.annualRate', label: 'מס הכנסה — ריבית על הפרשי הצמדה (שנתי)', unit: 'rate', law: 'סעיף 159א(א)', computable: false, values: [
    { taxYear: 2026, value: 0.04, basis: 'primary', sourceId: G25, locator: 'עמ׳ 119', checkedAt: C13, note: 'ריבית והצמדה אינן קנס. שיטת הצבירה לא מפורטת — לכן תמיד אומדן' },
  ] },
  { id: 'ni.deduction47a.payments', label: 'ניכוי 52% מדמי ב״ל (47א) — לפי תשלומים בפועל', unit: 'text', law: 'סעיף 47א; עע״מ 624/20 קירשבלום', computable: false, values: [
    { taxYear: 2024, value: 'עד 2024: 52% מהתשלומים ששולמו בפועל בשנה, בלי להפחית החזרים לשנים קודמות (שדה 030/089)', basis: 'primary', sourceId: 'kirshblum2022', locator: 'פס״ד 1.5.2022; הוראת ביצוע 03/2023', checkedAt: C13 },
    { taxYear: 2025, value: 'מ-2025: התשלומים פחות החזרים שהתקבלו באותה שנה; 52% מהחזר עודף — הכנסה בשדה 250/270', basis: 'primary', sourceId: G25, locator: 'עמ׳ 65', checkedAt: C13, note: 'נוסח התיקון בחוק והחזר ב-2025 על תשלומים לפני 2025 — פתוח' },
  ] },
];

export const RULES: Record<string, Rule> = Object.fromEntries(RULE_LIST.map(r => [r.id, r]));
export const ALL_RULES: readonly Rule[] = RULE_LIST;

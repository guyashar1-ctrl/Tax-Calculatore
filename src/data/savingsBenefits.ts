// ─────────────────────────────────────────────────────────────────────────────
// הטבות המס על חיסכון אישי של עצמאי — פנסיה וקרן השתלמות
//
// למה מודול נפרד: אלה אינן "הוצאות של העסק" אלא מנגנוני חיסכון אישיים
// שהמדינה מתמרצת. הן גם ההטבות היחידות שבהן מעורבים שלושה מנגנוני מס
// שונים לחלוטין — ניכוי, זיכוי ופטור ממס רווחי הון — וערבוב ביניהם הוא
// הטעות הנפוצה ביותר בתחום. המבנה כאן מכריח להציג כל מנגנון בנפרד.
//
// מקור הערכים: אותם ערכים שכבר קיימים במאגר הפרויקט —
// data/taxKnowledge.ts (נושאי pension ו-studyFund) ו-data/expenseKnowledge.ts
// (נושא pension-owner). אומתו: יולי 2026.
//
// שנתיות: כל הערכים כאן שייכים לשנת המס SAVINGS_DATA_YEAR בלבד. אין להסיק
// מהם על שנה אחרת — המסך מציג התראה כשהשנה הנבחרת שונה.
// ─────────────────────────────────────────────────────────────────────────────

/** שנת המס שאליה שייכים כל הערכים במודול הזה */
export const SAVINGS_DATA_YEAR = 2026;

// ─── קבועי הבסיס ─────────────────────────────────────────────────────────────
// רק הערכים שנשלפו ממקור. כל שאר הסכומים נגזרים מהם בחישוב, כדי שלא
// ייווצר פער בין השיעור לסכום כשאחד מהם מתעדכן.

const C = {
  /** תקרת ההכנסה המזכה השנתית לעצמאי (ס' 47) — מוקפאת 2025–2027 */
  pensionEligibleIncome: 232_800,
  /** שיעור הניכוי המרבי לעצמאי (ס' 47) */
  pensionDeductionRate: 0.11,
  /** שיעור ההפקדה המזכה בזיכוי (ס' 45א) — הבסיס, בלי התוספת המותנית */
  pensionCreditDepositRate: 0.05,
  /** תוספת מותנית לשיעור ההפקדה המזכה — לא זכאות אוטומטית */
  pensionCreditDepositRateExtra: 0.005,
  /** שיעור הזיכוי עצמו (ס' 45א) */
  pensionCreditRate: 0.35,
  /** השכר הממוצע במשק לצורך פנסיית חובה — חודשי */
  averageWageMonthly: 13_769,
  /** פנסיית חובה — שיעור על החלק שעד מחצית השכר הממוצע */
  mandatoryLowRate: 0.0445,
  /** פנסיית חובה — שיעור על החלק שבין מחצית השכר הממוצע לשכר הממוצע */
  mandatoryHighRate: 0.1255,
  /** תקרת ההכנסה הקובעת לניכוי הפקדות עצמאי לקרן השתלמות (ס' 17(5א)) */
  studyFundEligibleIncome: 293_397,
  /** שיעור הניכוי מההכנסה הקובעת */
  studyFundDeductionRate: 0.045,
  /**
   * הניכוי השנתי המרבי כפי שהוא מפורסם — 13,203 ₪.
   * החישוב המדויק (4.5% × 293,397) נותן 13,202.865, והסכום המפורסם הוא
   * העיגול שלו. מוצג כאן כערך בפני עצמו כדי שלא נציג ללקוח 13,202 ₪
   * רק מפני שהעיגול הפנימי כלפי מטה. החישוב המדויק נשמר בנפרד.
   */
  studyFundMaxDeductionPublished: 13_203,
  /**
   * תקרת ההפקדה השנתית שרווחיה פטורים ממס רווחי הון.
   * ‼ תקרה נפרדת — אינה נגזרת מההכנסה הקובעת של אותה שנה.
   */
  studyFundExemptDeposit: 20_566,
  /** שיעור מס רווחי הון הרגיל שממנו נחסכים */
  capitalGainsTaxRate: 0.25,
  /** שנות הצבירה עד נזילות לכל מטרה */
  studyFundLiquidityYears: 6,
};

// עיגול כלפי מטה בסכומי הטבה — לא להציג ללקוח שקל שאולי לא מגיע לו.
// מחצית השכר הממוצע נופלת על חצי שקל, ולכן נשמרת ספרה אחת כשיש שארית.
const nis = (n: number) =>
  (Number.isInteger(n) ? n : Math.floor(n * 10) / 10).toLocaleString('he-IL') + ' ₪';
// עיגול לשתי ספרות — בלעדיו 12.55% מודפס כ-12.549999999999999%
const pct = (r: number) => +(r * 100).toFixed(2) + '%';

/** תקרות הפקדה — כלפי מטה, כדי לא להציג ללקוח שקל שאולי לא מגיע לו */
const shekels = (n: number) => Math.floor(n);
/**
 * סכומי זיכוי מוצגים כהערכה ("עד כ-"), ולכן מעוגלים לשקל הקרוב ולא כלפי
 * מטה: 232,800 × 5% × 35% נותן 4073.9999999999995 בחישוב עשרוני בינארי,
 * ועיגול כלפי מטה היה מציג 4,073 ₪ במקום 4,074 ₪.
 */
const shekelsRounded = (n: number) => Math.round(n);

/** תוצאת החישוב המדויקת, בלי עיגול — לשימוש בהשוואות ובבדיקות */
export const studyFundMaxDeductionExact =
  C.studyFundEligibleIncome * C.studyFundDeductionRate;                                    // 13,202.865

/** שיעור ההפקדה המזכה בזיכוי כשמתקיים גם התנאי לתוספת */
const pensionCreditDepositRateWithExtra =
  C.pensionCreditDepositRate + C.pensionCreditDepositRateExtra;                            // 5.5%

export const SAVINGS_FIGURES = {
  pensionMaxDeduction: shekels(C.pensionEligibleIncome * C.pensionDeductionRate),          // 25,608
  /** הפקדה מזכה לפי שיעור הבסיס בלבד */
  pensionMaxCreditDeposit: shekels(C.pensionEligibleIncome * C.pensionCreditDepositRate),  // 11,640
  pensionMaxCredit: shekelsRounded(
    C.pensionEligibleIncome * C.pensionCreditDepositRate * C.pensionCreditRate,            // 4,074
  ),
  /** הפקדה מזכה כשמתקיים גם התנאי לתוספת 0.5% */
  pensionMaxCreditDepositWithExtra: shekels(
    C.pensionEligibleIncome * pensionCreditDepositRateWithExtra,                           // 12,804
  ),
  pensionMaxCreditWithExtra: shekelsRounded(
    C.pensionEligibleIncome * pensionCreditDepositRateWithExtra * C.pensionCreditRate,     // 4,481
  ),
  /** הפקדה שממצה ניכוי + זיכוי לפי שיעור הבסיס */
  pensionOptimalDeposit: shekels(
    C.pensionEligibleIncome * (C.pensionDeductionRate + C.pensionCreditDepositRate),       // 37,248
  ),
  /** אותה הפקדה כשמתקיים גם התנאי לתוספת */
  pensionOptimalDepositWithExtra: shekels(
    C.pensionEligibleIncome * (C.pensionDeductionRate + pensionCreditDepositRateWithExtra), // 38,412
  ),
  mandatoryHalfWageMonthly: C.averageWageMonthly / 2,
  mandatoryHalfWageAnnual: (C.averageWageMonthly / 2) * 12,
  mandatoryFullWageAnnual: C.averageWageMonthly * 12,
  /** הסכום שמוצג ללקוח — הניכוי השנתי המרבי כפי שהוא מפורסם */
  studyFundMaxDeduction: C.studyFundMaxDeductionPublished,                                 // 13,203
  studyFundExemptDeposit: C.studyFundExemptDeposit,
  /** ההפרש שנהנה מהפטור אך אינו בר-ניכוי — הנקודה שהכי מבלבלת */
  studyFundExemptButNotDeductible:
    C.studyFundExemptDeposit - C.studyFundMaxDeductionPublished,                           // 7,363
};

// ─── מודל התצוגה ─────────────────────────────────────────────────────────────

/**
 * סוג מנגנון המס. ההפרדה הזו היא כל העניין: ניכוי, זיכוי ופטור ממס רווחי
 * הון הם שלושה דברים שונים לחלוטין, ואסור שייראו במסך כאותו דבר.
 */
export type BenefitKind = 'obligation' | 'deduction' | 'credit' | 'capitalGains' | 'liquidity';

export const BENEFIT_KIND_META: Record<BenefitKind, { label: string; effect: string; tone: string }> = {
  obligation:   { label: 'חובה שבחוק',            effect: 'לא הטבת מס - חובת הפקדה מינימלית',            tone: 'check' },
  deduction:    { label: 'ניכוי',                  effect: 'מקטין את ההכנסה שעליה מחשבים את המס',         tone: 'ok' },
  credit:       { label: 'זיכוי',                  effect: 'מקטין את המס עצמו, שקל בשקל',                 tone: 'ok' },
  capitalGains: { label: 'פטור ממס רווחי הון',     effect: 'הרווחים בקרן פטורים ממס - לא נוגע להכנסה החייבת', tone: 'ok' },
  liquidity:    { label: 'נזילות',                 effect: 'מתי אפשר למשוך את הכסף',                      tone: 'na' },
};

/** רמת הביסוס של הערך המספרי המוצג */
export type ValueBasis =
  | 'sourced'    // נשלף כמות שהוא ממאגר מאומת
  | 'derived'    // חושב משיעור × תקרה — נכון למקרה שמתואר, לא תקרה אוניברסלית
  | 'needsCheck'; // דורש אימות לפני הסתמכות

export interface BenefitBlock {
  kind: BenefitKind;
  title: string;
  /** מה זה אומר — עברית פשוטה, בלי מונחי מס */
  plain: string;
  /** השיעור עצמו */
  rate: string;
  /** התקרה או הסכום המרבי */
  ceiling?: string;
  /** מה בדיוק הסכום הזה — למשל "תוצאה מחושבת, לא תקרה אוניברסלית" */
  ceilingNote?: string;
  basis: ValueBasis;
  legalBasis?: string;
  /** תנאים וסייגים — נפתחים בלחיצה, לא מוצגים מראש */
  caveats: string[];
}

export interface SavingsTrack {
  id: 'pension' | 'studyFund';
  icon: string;
  title: string;
  /** משפט אחד שמסביר מה זה, לפני כל מספר */
  lead: string;
  /** למה זה לא הוצאה רגילה של העסק */
  notAnExpense: string;
  blocks: BenefitBlock[];
  /** ההבחנה שאסור לפספס — מוצגת בבירור, לא כהערת שוליים */
  keyDistinction: { title: string; text: string };
  /** נושא ההוצאה המקביל במאגר "הוצאות מוכרות" */
  expenseTopicId: string;
  sources: { label: string; url: string }[];
}

// ─── פנסיה לעצמאי ────────────────────────────────────────────────────────────

const PENSION: SavingsTrack = {
  id: 'pension',
  icon: '🏦',
  title: 'פנסיה לעצמאי',
  lead: 'הפקדה לקרן פנסיה או לקופת גמל לקצבה. שלושה דברים שונים מתערבבים כאן: כמה חייבים להפקיד לפי חוק, כמה מקטין את ההכנסה החייבת, וכמה מקטין את המס עצמו.',
  notAnExpense: 'ההפקדה אינה הוצאה של העסק - הכסף נשאר שלך, בחיסכון על שמך. מה שהמדינה נותנת זה הטבת מס על ההפקדה, ולא הכרה בהוצאה.',
  blocks: [
    {
      kind: 'obligation',
      title: 'פנסיית חובה לעצמאי',
      plain: 'מ-2017 עצמאי חייב בהפקדה פנסיונית מינימלית. חשוב: הסכום שחייבים בו נמוך בהרבה מהסכום שממצה את הטבות המס - אלה שני מספרים שונים לגמרי.',
      rate: `${pct(C.mandatoryLowRate)} מההכנסה עד מחצית השכר הממוצע · ${pct(C.mandatoryHighRate)} מהחלק שמעליה ועד השכר הממוצע`,
      ceiling: `מחצית השכר הממוצע ${SAVINGS_DATA_YEAR}: ${nis(SAVINGS_FIGURES.mandatoryHalfWageMonthly)} לחודש (${nis(SAVINGS_FIGURES.mandatoryHalfWageAnnual)} לשנה) · השכר הממוצע: ${nis(SAVINGS_FIGURES.mandatoryFullWageAnnual)} לשנה`,
      basis: 'sourced',
      legalBasis: 'חוק ההתייעלות הכלכלית לשנים 2017–2018, פרק ב\'',
      caveats: [
        'על הכנסה שמעל השכר הממוצע במשק אין חובת הפקדה כלל - אבל הטבות המס ממשיכות הרבה מעבר לו.',
        'אי-הפקדה חושפת לעיצום כספי, בנוסף לאובדן הטבות המס לאותה שנה.',
        '⚠ לאימות לפני הסתמכות: רשימת הפטורים מחובת ההפקדה (בין היתר גיל צעיר, גיל מבוגר ותקופת ההתחלה שלאחר הרישום כעוסק) - הנוסח המדויק והגילאים לא אומתו כאן מול לשון החוק.',
      ],
    },
    {
      kind: 'deduction',
      title: 'ניכוי מההכנסה החייבת',
      plain: 'הסכום יורד מההכנסה שעליה מחשבים לך מס. החיסכון בפועל אינו הסכום עצמו אלא הסכום כפול שיעור המס השולי שלך - מי שבמדרגה נמוכה חוסך פחות ממי שבמדרגה גבוהה.',
      rate: `עד ${pct(C.pensionDeductionRate)} מההכנסה המזכה`,
      ceiling: `הכנסה מזכה מרבית ${SAVINGS_DATA_YEAR}: ${nis(C.pensionEligibleIncome)} → ניכוי מרבי ${nis(SAVINGS_FIGURES.pensionMaxDeduction)}`,
      basis: 'sourced',
      legalBasis: 'סעיף 47 לפקודת מס הכנסה',
      caveats: [
        'תקרת ההכנסה המזכה מוקפאת לשנים 2025–2027 (הקפאת עדכוני המס) - אין להצמיד אותה למדד.',
        'ההפקדה חייבת להתבצע בפועל עד 31 בדצמבר של שנת המס. הפקדה בינואר נזקפת לשנה הבאה.',
        'מי שגם שכיר וגם עצמאי - ההכנסה המזכה כעצמאי מצטמצמת בשל השכר, ונדרש תיאום. אין להשתמש בתקרה המלאה פעמיים.',
      ],
    },
    {
      kind: 'credit',
      title: 'זיכוי ממס',
      plain: 'זיכוי הוא דבר אחר לגמרי מניכוי: הוא יורד מהמס עצמו, לא מההכנסה. שקל של זיכוי שווה שקל, ולא תלוי במדרגת המס שלך.',
      rate: `${pct(C.pensionCreditRate)} מההפקדה, על הפקדה של עד ${pct(C.pensionCreditDepositRate)} מההכנסה המזכה`,
      ceiling: `במקרה הטיפוסי - עצמאי בלבד שהכנסתו מגיעה לתקרה: הפקדה מזכה עד ${nis(SAVINGS_FIGURES.pensionMaxCreditDeposit)} → זיכוי של עד כ-${nis(SAVINGS_FIGURES.pensionMaxCredit)}`,
      ceilingNote: 'זו תוצאת חישוב למקרה שתואר, ולא תקרה אחידה שחלה על כל נישום - ראו סייגים.',
      basis: 'derived',
      legalBasis: 'סעיף 45א לפקודת מס הכנסה',
      caveats: [
        `תוספת מותנית: בנסיבות המתאימות ניתן להוסיף ${pct(C.pensionCreditDepositRateExtra)} לשיעור ההפקדה המזכה - בין היתר כשלא נוצלה הטבת מס בשל תשלומים לביטוח אובדן כושר עבודה (סעיף 32(14)). בהתקיים התנאי מגיע השיעור ל-${pct(pensionCreditDepositRateWithExtra)} - הפקדה מזכה עד ${nis(SAVINGS_FIGURES.pensionMaxCreditDepositWithExtra)} וזיכוי של עד כ-${nis(SAVINGS_FIGURES.pensionMaxCreditWithExtra)}. זו אינה זכאות אוטומטית, ואין להציג ${pct(pensionCreditDepositRateWithExtra)} כשיעור שחל על כולם.`,
        'הסכום המרבי כאן נגזר מהנחה של עצמאי בלבד שהכנסתו מגיעה לתקרה. מי שגם שכיר, מי שהכנסתו נמוכה מהתקרה, ומי שאינו עונה להגדרת "עמית מוטב" - התקרה שחלה עליו שונה, ונדרש חישוב פרטני. אין להציג את הסכום הזה כתקרה אוניברסלית ללקוח.',
        'הזיכוי מחושב על ההפקדה בפועל - לא על התקרה. הפקדה נמוכה יותר מזכה בזיכוי נמוך יותר.',
      ],
    },
  ],
  keyDistinction: {
    title: 'ניכוי ≠ זיכוי',
    text: `ניכוי מקטין את ההכנסה שעליה מחשבים את המס - ולכן שוויו תלוי במדרגת המס השולית. זיכוי מקטין את המס עצמו - ולכן שוויו קבוע. שתי ההטבות פועלות במקביל על אותה הפקדה: הפקדה של ${pct(C.pensionDeductionRate + C.pensionCreditDepositRate)} מההכנסה המזכה - עד ${nis(SAVINGS_FIGURES.pensionOptimalDeposit)} בשנת ${SAVINGS_DATA_YEAR} - ממצה את שתיהן, וכשמתקיים גם התנאי לתוספת ה-${pct(C.pensionCreditDepositRateExtra)} השיעור עולה ל-${pct(C.pensionDeductionRate + pensionCreditDepositRateWithExtra)} (עד ${nis(SAVINGS_FIGURES.pensionOptimalDepositWithExtra)}).`,
  },
  expenseTopicId: 'pension-owner',
  sources: [
    { label: 'pensuni - תקרות 2026', url: 'https://pensuni.com/?p=827' },
    { label: 'יובלים - טבלת תקרות רב-שנתית', url: 'https://www.yuvalim-ins.co.il/ceilings-deductions/' },
  ],
};

// ─── קרן השתלמות לעצמאי ──────────────────────────────────────────────────────

const STUDY_FUND: SavingsTrack = {
  id: 'studyFund',
  icon: '💰',
  title: 'קרן השתלמות לעצמאי',
  lead: 'אפיק חיסכון אישי עם שתי הטבות מס שונות שפועלות על שני סכומים שונים - וזה בדיוק מה שמבלבל: הניכוי תלוי בהכנסה, ואילו תקרת הפטור ממס רווחי הון היא תקרה נפרדת שאינה נגזרת מההכנסה.',
  notAnExpense: 'קרן השתלמות אינה הוצאה של העסק ואינה קשורה להשתלמויות מקצועיות. זהו חיסכון אישי על שמך - הכסף נשאר שלך, והמדינה מתמרצת אותו בשתי הטבות נפרדות.',
  blocks: [
    {
      kind: 'deduction',
      title: 'ניכוי מההכנסה החייבת',
      plain: 'חלק מההפקדה יורד מההכנסה שעליה מחשבים מס. גם כאן - החיסכון בפועל הוא הסכום כפול שיעור המס השולי שלך.',
      rate: `עד ${pct(C.studyFundDeductionRate)} מההכנסה הקובעת`,
      ceiling: `הכנסה קובעת מרבית ${SAVINGS_DATA_YEAR}: ${nis(C.studyFundEligibleIncome)} → ניכוי מרבי ${nis(SAVINGS_FIGURES.studyFundMaxDeduction)}`,
      basis: 'sourced',
      legalBasis: 'סעיף 17(5א) לפקודת מס הכנסה',
      caveats: [
        'הניכוי מחושב על ההכנסה הקובעת בפועל, עד התקרה. מי שהכנסתו נמוכה מהתקרה - הניכוי שלו נמוך בהתאם.',
        'ההפקדה חייבת להתבצע בפועל עד 31 בדצמבר של שנת המס.',
        'הפקדה מעבר לסכום בר-הניכוי אינה מוכרת כניכוי - אבל היא עדיין יכולה ליהנות מהפטור ממס רווחי הון (ראו למטה).',
      ],
    },
    {
      kind: 'capitalGains',
      title: 'פטור ממס רווחי הון',
      plain: `הטבה שנייה ונפרדת לגמרי מהניכוי: על הרווחים שנצברו בקרן לא משלמים את מס רווחי ההון הרגיל (${pct(C.capitalGainsTaxRate)}), כשהמשיכה נעשית בתנאים. זה לא מקטין את ההכנסה החייבת ולא את המס השוטף - זה חוסך מס עתידי על הרווח.`,
      rate: `פטור מלא על רווחי ההפקדה, עד תקרת ההפקדה השנתית`,
      ceiling: `תקרת הפקדה שנתית ${SAVINGS_DATA_YEAR}: ${nis(C.studyFundExemptDeposit)} - תקרה נפרדת, שאינה נגזרת מההכנסה`,
      ceilingNote: `שימו לב לפער: ${nis(C.studyFundExemptDeposit)} פטורים ממס רווחי הון, אבל רק ${nis(SAVINGS_FIGURES.studyFundMaxDeduction)} מהם ניתנים לניכוי מההכנסה החייבת.`,
      basis: 'sourced',
      caveats: [
        `זו תקרה שנתית קבועה ואינה תלויה בגובה ההכנסה מעסק באותה שנה - בשונה מהניכוי, שנגזר מההכנסה הקובעת. שני המספרים אינם מדברים זה עם זה.`,
        `ההפרש - ${nis(SAVINGS_FIGURES.studyFundExemptButNotDeductible)} - נהנה מהפטור ממס רווחי הון בלבד. הוא אינו מקטין את ההכנסה החייבת ואין עליו שום הטבה שוטפת.`,
        'הפטור מותנה בתנאי הזכאות והמשיכה (תום תקופת הצבירה או משיכה למטרת השתלמות). משיכה שלא כדין - הרווחים מתחייבים במס, ולעיתים גם ההפקדה עצמה.',
      ],
    },
    {
      kind: 'liquidity',
      title: 'נזילות',
      plain: `אחרי ${C.studyFundLiquidityYears} שנות צבירה הקרן נזילה לכל מטרה - לא רק להשתלמות - בכפוף לתנאים. זה מה שהופך אותה לאפיק החיסכון הגמיש ביותר עם פטור ממס רווחי הון.`,
      rate: `${C.studyFundLiquidityYears} שנים לכל מטרה`,
      basis: 'sourced',
      caveats: [
        '⚠ לאימות לפני הסתמכות: מסלולי המשיכה המוקדמת (משיכה למטרת השתלמות לפני תום התקופה, ומשיכה בגיל פרישה) - התנאים והתקופות המדויקים לא אומתו כאן מול לשון ההוראות.',
        'משיכה לפני תום התקופה ושלא באחד המסלולים המותרים - מאבדת את הפטור.',
      ],
    },
  ],
  keyDistinction: {
    title: 'הוצאה/ניכוי לצורכי מס ≠ תקרת ההפקדה לפטור ממס רווחי הון',
    text: `הניכוי תלוי בהכנסה. תקרת הפטור ממס רווחי הון היא תקרה נפרדת. בשנת ${SAVINGS_DATA_YEAR}: עד ${nis(SAVINGS_FIGURES.studyFundMaxDeduction)} מקטינים את ההכנסה החייבת - לפי ${pct(C.studyFundDeductionRate)} מההכנסה הקובעת ועד תקרתה; ובמקביל, עד ${nis(C.studyFundExemptDeposit)} הפקדה בשנה נהנים מפטור ממס רווחי הון - סכום קבוע שאינו תלוי בהכנסה. אין להסיק שכל ההפקדה הפטורה ממס רווחי הון היא גם ברת-ניכוי - היא אינה.`,
  },
  expenseTopicId: 'study-fund',
  sources: [
    { label: 'pensuni - תקרות 2026', url: 'https://pensuni.com/?p=827' },
    { label: 'אנליסט - סכומי הפקדה', url: 'https://www.analyst.co.il/articles/deposit-amount/' },
  ],
};

export const SAVINGS_TRACKS: SavingsTrack[] = [PENSION, STUDY_FUND];

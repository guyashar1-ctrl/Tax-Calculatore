// ─── טופס 1301 — גרסאות, שדות ממופים ונספחים ──────────────────────────────
// ‼ רק מה שנקרא בפועל: הקודים והסעיפים מהגרסה המונגשת של הטופס (2025 ו-2024),
// המשמעות והוראות המילוי מפרק ד במדריך 2025 (אין מסמך הוראות נפרד ל-1301).
// ‼ מה שלא נקרא (הגרסה הסרוקה, הנספחים עצמם, «מבני הקבצים» לשידור) — מסומן
// בגרסה כ«נקרא חלקית», לא מוסק.
// ‼ התנאים נבדקים מול הכרטיס — מצב עדכני, לא של שנה מסוימת. לכן «חל» כאן הוא
// נקודת פתיחה, וכל ערך מהכרטיס מסומן «לאמת לשנה» (ראה engine.fieldReadiness).

import type { AnnexRule, FieldContext, FormField, FormVersion, Tri } from './types';

const C = '10.10.2026';

export const FORM_VERSIONS: FormVersion[] = [
  {
    id: '1301@2024', formId: '1301', title: 'דוח שנתי ליחיד (1301) לשנת המס 2024', authority: 'ita', refersToTaxYear: 2024,
    sourceIds: ['form1301_2024'], documentVersion: '«מעודכן ל-2.2025»', readStatus: 'partlyRead',
    readScope: 'נקרא טקסט הגרסה המונגשת לצורך השוואה ל-2025 בלבד: מספרי הסעיפים והקודים של השדות הממופים כאן.',
    checkedAt: C,
  },
  {
    id: '1301@2025', formId: '1301', title: 'דוח שנתי ליחיד (1301) לשנת המס 2025', authority: 'ita', refersToTaxYear: 2025,
    sourceIds: ['form1301_2025', 'itaGuide2025', 'service1301_2025', 'fieldMap1301_2025'], documentVersion: '«מעודכן ל-1.2026»', supersedes: '1301@2024',
    readStatus: 'partlyRead',
    readScope: 'נקראו כל עמודי הגרסה המונגשת (20) והרגילה (4) ופרק ד במדריך (עמ׳ PDF 16 עד 76): 305 שדות ותיבות סימון בקטלוג, 254 עם הוראה; 11 נספחים נקראו במלואם (1342 הושלם 10.10.2026). לא ודאי: 2 קריאות מתוך 13 — סעיף 65 (הטופס הרגיל והמונגש סותרים: כן=2/לא=1 מול כן=1/לא=2) ומשמעות האותיות ב/ס/מ בתיבת מספר התיק; 11 הוכרעו בצפייה חזותית (277/278, 361/362, 255, 096/111, 038/082, סעיף 30). לא נקראו: «מבני הקבצים לדוחות מס שנתיים» — שדות שמופיעים רק בשידור (כמו 130/189), ולכן 7 שדות כאלה ידועים רק מהמדריך.',
    checkedAt: C,
  },
];

// ── תנאים מול הכרטיס ────────────────────────────────────────────────────────
const documented = (ctx: FieldContext, key: string) => !!ctx.fieldMeta?.[key]?.source;
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** יש הכנסה מעסק/משלח יד. ‼ 'employee' הוא ברירת המחדל של כרטיס חדש — בלי מקור זה «לא ידוע». */
export function hasBusiness(ctx: FieldContext): Tri {
  const t = ctx.facts.incomeTaxType;
  if (t === 'selfEmployed' || t === 'both' || arr(ctx.facts.businesses).length > 0) return 'yes';
  if (t === 'employee' && documented(ctx, 'incomeTaxType')) return 'no';
  return 'unknown';
}
export function hasSalary(ctx: FieldContext): Tri {
  const t = ctx.facts.incomeTaxType;
  if (arr(ctx.facts.employers).length > 0 || t === 'both') return 'yes';
  if (t === 'employee') return documented(ctx, 'incomeTaxType') ? 'yes' : 'unknown';
  if (t === 'selfEmployed') return documented(ctx, 'incomeTaxType') ? 'no' : 'unknown';
  return 'unknown';
}
const and = (a: Tri, b: Tri): Tri => (a === 'no' || b === 'no' ? 'no' : a === 'yes' && b === 'yes' ? 'yes' : 'unknown');
/** מסלול שכר דירה בכרטיס: «כן» רק למסלול המבוקש; מסלול אחר מתועד = «לא». */
const rentTrack = (ctx: FieldContext, track: string): Tri => {
  const t = ctx.facts.rentalTaxTrack;
  if (t === track) return 'yes';
  if (t && documented(ctx, 'rentalTaxTrack')) return 'no';
  return 'unknown';
};
const positive = (ctx: FieldContext, key: string): Tri => {
  const v = ctx.facts[key];
  if (typeof v === 'number' && v > 0) return 'yes';
  if (v === true) return 'yes';
  if ((v === 0 || v === false) && documented(ctx, key)) return 'no';
  return 'unknown';
};

const F = 'form1301_2025';
const V = '1301@2025';
const MEANING = 'הסבר: מדריך 2025, פרק ד';

export const FIELDS_1301_2025: FormField[] = [
  {
    key: 'ins.disabilitySelfEmployed', formVersionId: V, part: 'יב', section: '49', codes: { registered: '112', spouse: '113' },
    label: 'ביטוח אובדן כושר עבודה — שולם כעצמאי', kind: 'amount',
    meaning: 'הסכום ששולם לביטוח מפני אובדן כושר עבודה, שלא נרשם כהוצאה בדוח רווח והפסד. הניכוי המותר מחושב במערכת.',
    relevantWhen: 'יש פוליסת אובדן כושר עבודה שהלקוח משלם בעצמו', relevance: () => 'unknown',
    sources: ['document', 'client'], evidence: ['אישור שנתי מחברת הביטוח'],
    fillCheck: 'סכום ששולם בשנת המס; לא כפול עם הוצאה בדוח רווח והפסד.',
    basis: 'primary', sourceId: F, locator: `סעיף 49; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'ins.disabilityEmployee', formVersionId: V, part: 'יב', section: '50', codes: { registered: '206', spouse: '207' },
    label: 'ביטוח אובדן כושר עבודה — כשכיר (טופס 134)', kind: 'amount',
    meaning: 'הניכוי המותר לפי טופס 134 — לא הסכום ששולם.',
    relevantWhen: 'שכיר שתובע ניכוי ביטוח אובדן כושר עבודה', relevance: ctx => and(hasSalary(ctx), 'unknown'),
    sources: ['document', 'calculation'], evidence: ['טופס 134'],
    fillCheck: 'הסכום = הניכוי המותר שבטופס 134; טופס 134 מצורף.',
    basis: 'primary', sourceId: F, locator: `סעיף 50; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'sf.selfEmployedDeposit', formVersionId: V, part: 'יב', section: '51', codes: { registered: '136', spouse: '137' },
    label: 'הפקדה לקרן השתלמות לעצמאים', kind: 'amount',
    meaning: 'הסכום המלא ששולם בשנת המס לקרן השתלמות לעצמאים. התקרה (4.5%) מוחלת במערכת — לא מזינים את הסכום המותר.',
    relevantWhen: 'יש הכנסה מעסק או משלח יד והופקד לקרן השתלמות כעצמאי בשנת המס',
    relevance: ctx => and(hasBusiness(ctx), positive(ctx, 'krenHashtalmutSE')),
    sources: ['document', 'fileFact'], fact: { key: 'krenHashtalmutSE', scope: 'current', label: 'הפקדה כעצמאי לקרן בכרטיס' },
    evidence: ['אישור שנתי מקרן ההשתלמות על הפקדות כעצמאי'],
    calculation: { ruleIds: ['sf.se.rate', 'sf.se.ceiling', 'sf.mixed.formula'], description: 'הניכוי: 4.5% מהנמוך מבין ההכנסה מהעסק לבין התקרה פחות המשכורת שבשלה הפקיד המעביד' },
    fillCheck: 'סך ההפקדות באישור השנתי לשנת המס; לבן הזוג הנכון (136 רשום, 137 בן/בת זוג).',
    basis: 'primary', sourceId: F, locator: `סעיף 51; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'sf.employerDeterminingSalary', formVersionId: V, part: 'יב', section: '52', codes: { registered: '218', spouse: '219' },
    label: 'משכורת שבשלה שילם המעביד לקרן השתלמות', kind: 'amount',
    meaning: 'המשכורת שבשלה המעביד הפקיד לקרן השתלמות — מטופס 106 (אותו קוד). מקטינה את תקרת הניכוי כעצמאי.',
    relevantWhen: 'יש גם הכנסה מעסק וגם משכורת',
    relevance: ctx => and(hasSalary(ctx), hasBusiness(ctx)),
    sources: ['document'], evidence: ['טופס 106 לשנת המס, מכל מעביד'],
    calculation: { ruleIds: ['sf.mixed.formula', 'sf.mixed.maxDeterminingSalary'], description: 'מופחת מתקרת ההכנסה המזכה לעצמאי' },
    emptyMeaning: '0 = המעביד לא הפקיד לקרן השתלמות — וזה משנה את התקרה לשכיר־עצמאי. ריק אינו 0.',
    fillCheck: 'הסכום מכל טופסי 106 של אותו בן זוג; 0 כשהמעביד לא הפקיד; לא המשכורת הכוללת.',
    basis: 'primary', sourceId: F, locator: `סעיף 52; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'pen.selfEmployedDeduction', formVersionId: V, part: 'יב', section: '53', codes: { registered: '135', spouse: '180' },
    label: 'קופת גמל לקצבה כעמית עצמאי — לניכוי', kind: 'amount',
    meaning: 'הסכום ששולם לקופת גמל לקצבה כעמית עצמאי. מה שלא מותר בניכוי עובר לזיכוי במערכת; אפשר לפצל עם סעיף 76.',
    relevantWhen: 'הופקד לקצבה כעמית עצמאי בשנת המס',
    relevance: ctx => and(hasBusiness(ctx), positive(ctx, 'selfEmployedPensionAmount')),
    sources: ['document', 'fileFact'], fact: { key: 'selfEmployedPensionAmount', scope: 'current', label: 'הפקדה לפנסיה כעצמאי בכרטיס' },
    evidence: ['אישור שנתי מקופת הגמל לקצבה על הפקדות כעמית עצמאי'],
    calculation: { ruleIds: ['pen.qualifying.work', 'pen.qualifying.nonWork', 'pen.trackA.baseRate', 'pen.credit.rate'], description: 'פיצול בין ניכוי (סעיף 47) לזיכוי (סעיף 45א) לפי מעמד הלקוח' },
    fillCheck: 'סך ההפקדות כעמית עצמאי לפי האישור; לא כולל הפקדות מעביד; סכום 53 + 76 = מה ששולם.',
    basis: 'primary', sourceId: F, locator: `סעיף 53; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'ni.nonWorkContribution', formVersionId: V, part: 'יב', section: '54', codes: { registered: '030', spouse: '089' },
    label: 'דמי ביטוח לאומי על הכנסה שאינה מעבודה', kind: 'amount',
    meaning: 'הסכום המלא ששולם לביטוח לאומי על הכנסה שאינה מעבודה; הניכוי מחושב במערכת. לא במסלול עסק זעיר. דמי ביטוח ששולמו השנה על שנים קודמות — בשדה מקוון נפרד (130/189).',
    relevantWhen: 'שולמו דמי ביטוח לאומי על הכנסה שאינה מעבודה בשנת המס, והלקוח לא בחר במסלול עסק זעיר', relevance: () => 'unknown',
    sources: ['document'], evidence: ['אישור שנתי מביטוח לאומי'],
    calculation: { ruleIds: ['ni.se.deductionShare'], description: 'חלק מהסכום מותר בניכוי' },
    fillCheck: 'הסכום ששולם בשנת המס עבור השנה; תשלומים על שנים קודמות — לא כאן. ריק כשבחר עסק זעיר.',
    basis: 'primary', sourceId: F, locator: `סעיף 54; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'pen.insuredIncome', formVersionId: V, part: 'יב', section: '58', codes: { registered: '244', spouse: '245' },
    label: 'הכנסה מבוטחת (מטופס 106)', kind: 'amount',
    meaning: 'ההכנסה המבוטחת כשכיר — מטופס 106.', relevantWhen: 'יש משכורת עם הפקדות לקצבה', relevance: ctx => hasSalary(ctx),
    sources: ['document'], evidence: ['טופס 106'], fillCheck: 'כפי שבטופס 106, סכום מכל המעבידים.',
    basis: 'primary', sourceId: F, locator: `סעיף 58; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'pen.employerDeposits', formVersionId: V, part: 'יב', section: '59', codes: { registered: '248', spouse: '249' },
    label: 'הפקדות המעביד לקופת גמל לקצבה (מטופס 106)', kind: 'amount',
    meaning: 'הפקדות המעביד לקצבה — מטופס 106.', relevantWhen: 'יש משכורת עם הפקדות מעביד לקצבה', relevance: ctx => hasSalary(ctx),
    sources: ['document'], evidence: ['טופס 106'], fillCheck: 'כפי שבטופס 106.',
    basis: 'primary', sourceId: F, locator: `סעיף 59; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'pen.employeeCredit', formVersionId: V, part: 'יד', section: '75', codes: { registered: '045', spouse: '086' },
    label: 'קופת גמל לקצבה כעמית שכיר — לזיכוי', kind: 'amount',
    meaning: 'הסכום ששולם לקצבה כעמית שכיר (חלק העובד) — לזיכוי.', relevantWhen: 'שכיר שהפקיד לקצבה', relevance: ctx => hasSalary(ctx),
    sources: ['document'], evidence: ['טופס 106'], calculation: { ruleIds: ['pen.credit.rate'], description: 'זיכוי בשיעור 35% עד התקרה' },
    fillCheck: 'כפי שבטופס 106.',
    basis: 'primary', sourceId: F, locator: `סעיף 75; ${MEANING}`, checkedAt: C,
  },
  {
    key: 'pen.selfEmployedCredit', formVersionId: V, part: 'יד', section: '76', codes: { registered: '268', spouse: '269' },
    label: 'קופת גמל לקצבה כעמית עצמאי — לזיכוי', kind: 'amount',
    meaning: 'הסכום ששולם כעמית עצמאי שמיועד לזיכוי; אפשר לפצל עם סעיף 53.',
    relevantWhen: 'הופקד לקצבה כעמית עצמאי והמשרד הכריע על פיצול לזיכוי',
    relevance: ctx => and(hasBusiness(ctx), positive(ctx, 'selfEmployedPensionAmount')),
    sources: ['document', 'office'], evidence: ['אישור שנתי מקופת הגמל לקצבה'],
    calculation: { ruleIds: ['pen.credit.rate'], description: 'זיכוי בשיעור 35%' },
    fillCheck: 'סעיף 53 + סעיף 76 = מה ששולם כעמית עצמאי; הפיצול הוא הכרעת המשרד ונשמר איתה.',
    basis: 'primary', sourceId: F, locator: `סעיף 76; ${MEANING}`, checkedAt: C,
  },

  // ── הרחבה 10.10.2026 (סבב 3): שדות נפוצים בתיקי המשרד, מהקטלוג שנקרא מהטופס ──
  {
    key: 'inc.business', formVersionId: V, part: 'ג', section: '1', codes: { registered: '150', spouse: '170' },
    label: 'הכנסה מעסק או ממשלח יד', kind: 'amount',
    meaning: 'הכנסה חייבת מהעסק אחרי הוצאות, לפני ניכויים אישיים; כוללת פיצוי נזק עקיף. קרן השתלמות ואובדן כושר לא נרשמים כהוצאה (הם בסעיפים 49 ו-51).',
    relevantWhen: 'יש הכנסה מעסק או משלח יד', relevance: ctx => hasBusiness(ctx),
    sources: ['document', 'calculation'], evidence: ['נספח א׳ (1320) לכל עסק', 'דוח רווח והפסד'],
    fillCheck: 'הסכום = שורת ההכנסה החייבת בנספח א׳ של כל עסק של אותו בן זוג; קרן השתלמות ואובדן כושר לא נוכו כהוצאה.',
    basis: 'primary', sourceId: F, locator: `סעיף 1; מדריך 2025 (פרק ד), עמ׳ PDF 29`, checkedAt: C,
  },
  {
    key: 'inc.niBenefitsSelfEmployed', formVersionId: V, part: 'ג', section: '2א', codes: { registered: '250', spouse: '270' },
    label: 'תקבולים חייבים מביטוח לאומי בגין הכנסה כעצמאי', kind: 'amount',
    meaning: 'סכומים מב״ל בגין הכנסה כעצמאי (מילואים, לידה ועוד). החזר הפרשי שומה מב״ל: 52% מההפרש נוסף לכאן.',
    relevantWhen: 'עצמאי שקיבל תקבולים מב״ל בשנת המס', relevance: ctx => (hasBusiness(ctx) === 'no' ? 'no' : 'unknown'),
    sources: ['document'], evidence: ['אישור שנתי מביטוח לאומי'],
    fillCheck: 'הסכום לפי האישור השנתי של ב״ל לשנת המס; לא תקבולים כשכיר שנכללו ב-106.',
    basis: 'primary', sourceId: F, locator: `סעיף 2א; מדריך 2025 (פרק ד), עמ׳ PDF 30`, checkedAt: C,
  },
  {
    key: 'inc.salary', formVersionId: V, part: 'ג', section: '3', codes: { registered: '158', spouse: '172' },
    label: 'הכנסה ממשכורת', kind: 'amount',
    meaning: 'הכנסת עבודה כולל זקיפות ותקבולי ב״ל הכלולים ב-106, הכנסה מחו״ל ומענק קרן הסיוע לשכיר. לא כולל קצבאות, פיצויים ומשמרות.',
    relevantWhen: 'היה שכיר בשנת המס', relevance: ctx => hasSalary(ctx),
    sources: ['document'], fact: { key: 'employers', scope: 'current', label: 'מעבידים בכרטיס' }, evidence: ['טופס 106 מכל מעביד', 'טופס 134 אם יש'],
    fillCheck: 'סך שורות ההכנסה בכל טופסי 106 של אותו בן זוג לשנת המס; משמרות — בסעיף 4.',
    basis: 'primary', sourceId: F, locator: `סעיף 3; מדריך 2025 (פרק ד), עמ׳ PDF 30`, checkedAt: C,
  },
  {
    key: 'inc.rent10', formVersionId: V, part: 'ה', section: '24', codes: { registered: '284', spouse: '344' },
    label: 'שכר דירה למגורים — מסלול 10%', kind: 'amount',
    meaning: 'דמי שכירות למגורים במסלול 10%: בלי הוצאות, והמס משולם תוך 30 יום מסוף השנה. גם הכנסה מאנרגיה מתחדשת בתחום הקבוע.',
    relevantWhen: 'בחר במסלול 10% לדירת מגורים', relevance: ctx => rentTrack(ctx, 'flat10'),
    sources: ['client', 'fileFact'], fact: { key: 'rentalIncomeAnnual', scope: 'current', label: 'אומדן שכר דירה שנתי בכרטיס' }, evidence: ['חוזי שכירות', 'אישור תשלום המס (3302)'],
    fillCheck: 'סך דמי השכירות בשנת המס בדירות שבמסלול 10%; ההחלטה למסלול — לכל דירה.',
    basis: 'primary', sourceId: F, locator: `סעיף 24; מדריך 2025 (פרק ד), עמ׳ PDF 44`, checkedAt: C,
  },
  {
    key: 'bus.turnover', formVersionId: V, part: 'ז', section: '36', codes: { registered: '238', spouse: '239' },
    label: 'מחזור מעסק או ממשלח יד (בלי מע״מ)', kind: 'amount',
    meaning: 'מחזור בלי מע״מ; שותף — חלקו היחסי. בלי משכורת ובלי תמורות הון. במסלול עסק זעיר — עד התקרה.',
    relevantWhen: 'יש הכנסה מעסק או משלח יד', relevance: ctx => hasBusiness(ctx),
    sources: ['document'], evidence: ['נספח א׳ (1320)', 'דוחות מע״מ'],
    fillCheck: 'המחזור בנספח א׳ ובדוחות המע״מ השנתיים תואמים; בלי מע״מ.',
    basis: 'primary', sourceId: F, locator: `סעיף 36; מדריך 2025 (פרק ד), עמ׳ PDF 47`, checkedAt: C,
  },
  {
    key: 'inc.foreignTotal', formVersionId: V, part: 'ט', section: '40', codes: { registered: '290' },
    label: 'סך הכנסות חו״ל', kind: 'amount',
    meaning: 'סיכום הכנסות החו״ל שנרשמו גם בסעיפים לפי סוגן. המס ששולם בחו״ל — רק בנספח ד׳ (1324), לא בטופס.',
    relevantWhen: 'היו הכנסות מחו״ל', relevance: ctx => positive(ctx, 'hasForeignIncome'),
    sources: ['document', 'fileFact'], fact: { key: 'foreignIncomeAnnual', scope: 'current', label: 'אומדן הכנסות חו״ל בכרטיס' }, evidence: ['נספח ד׳ (1324)', 'אסמכתאות מס זר'],
    fillCheck: 'הסכום = סך נספח ד׳; כל הכנסה רשומה גם בסעיף של סוגה.',
    basis: 'primary', sourceId: F, locator: `סעיף 40; מדריך 2025 (פרק ד), עמ׳ PDF 51`, checkedAt: C,
  },
  {
    key: 'inc.rentExempt', formVersionId: V, part: 'י', section: '42', codes: { registered: '332' },
    label: 'שכר דירה למגורים — פטור', kind: 'amount',
    meaning: 'ההכנסה הפטורה עד התקרה המתואמת (מופחתת בעודף); היתרה החייבת — בסעיף 8.',
    relevantWhen: 'שכר דירה למגורים במסלול הפטור', relevance: ctx => rentTrack(ctx, 'exempt'),
    sources: ['calculation', 'client'], fact: { key: 'rentalIncomeAnnual', scope: 'current', label: 'אומדן שכר דירה שנתי בכרטיס' }, evidence: ['חוזי שכירות'],
    calculation: { ruleIds: ['core.rentalExemption'], description: 'התקרה המתואמת: התקרה פחות העודף מעליה' },
    fillCheck: 'הפטור + החלק החייב בסעיף 8 = דמי השכירות; התקרה לכל התא המשפחתי.',
    basis: 'primary', sourceId: F, locator: `סעיף 42; מדריך 2025 (פרק ד), עמ׳ PDF 52`, checkedAt: C,
  },
  {
    key: 'credit.soldierRelease', formVersionId: V, part: 'יג', section: '71', codes: { registered: '224', spouse: '324' },
    label: 'חייל משוחרר — חודש ושנת שחרור', kind: 'date',
    meaning: 'חודש ושנת השחרור משירות סדיר (למשל 082022); הזיכוי — ל-36 חודשים אחרי השחרור. מספר חודשי השירות — בשדה 024/124.',
    relevantWhen: 'שוחרר משירות סדיר או לאומי ב-36 החודשים שלפני סוף שנת המס', relevance: ctx => positive(ctx, 'completedIdf'),
    sources: ['document', 'fileFact'], fact: { key: 'idfReleaseYear', scope: 'current', label: 'שנת שחרור בכרטיס (בלי חודש)' }, evidence: ['תעודת שחרור'],
    fillCheck: 'חודש ושנה לפי תעודת השחרור; השחרור בתוך 36 החודשים.',
    basis: 'primary', sourceId: F, locator: `סעיף 71; מדריך 2025 (פרק ד), עמ׳ PDF 69`, checkedAt: C,
  },
  {
    key: 'credit.degree', formVersionId: V, part: 'יג', section: '72', codes: { registered: '181', spouse: '182' },
    label: 'סיום לימודים לתואר או למקצוע — קוד מטופס 119', kind: 'choice',
    meaning: 'קוד: 1 ראשון · 2 שני · 3 שלישי ברפואה · 4 שלישי במסלול ישיר · 5 תעודת מקצוע · 12 ראשון ושני באותה שנה. מצרפים 119 ואישור סיום.',
    relevantWhen: 'סיים תואר או לימודי מקצוע בתקופה המזכה', relevance: ctx => positive(ctx, 'hasAcademicDegree'),
    sources: ['document', 'fileFact'], fact: { key: 'academicDegreeType', scope: 'current', label: 'סוג תואר בכרטיס' }, evidence: ['טופס 119', 'אישור סיום לימודים'],
    fillCheck: 'הקוד תואם לטופס 119 ולאישור; שנת הסיום ושנת ההתמחות בשדות שלהם.',
    basis: 'primary', sourceId: F, locator: `סעיף 72; מדריך 2025 (פרק ד), עמ׳ PDF 69`, checkedAt: C,
  },
  {
    key: 'credit.lifeInsurance', formVersionId: V, part: 'יד', section: '73', codes: { registered: '036', spouse: '081' },
    label: 'ביטוח חיים — הסכום ששולם', kind: 'amount',
    meaning: 'פרמיות ביטוח חיים בלי מרכיב חיסכון; זיכוי 25% בכפוף לתקרות.',
    relevantWhen: 'שולם ביטוח חיים פרטי', relevance: ctx => positive(ctx, 'hasLifeInsurance'),
    sources: ['document', 'fileFact'], fact: { key: 'lifeInsuranceAnnual', scope: 'current', label: 'אומדן ביטוח חיים בכרטיס' }, evidence: ['אישור שנתי מחברת הביטוח'],
    fillCheck: 'הסכום ששולם לפי האישור השנתי; בלי מרכיב חיסכון ובלי מה שנוכה במשכורת.',
    basis: 'primary', sourceId: F, locator: `סעיף 73; מדריך 2025 (פרק ד), עמ׳ PDF 70`, checkedAt: C,
  },
  {
    key: 'credit.donations', formVersionId: V, part: 'יד', section: '78א', codes: { registered: '037', spouse: '237' },
    label: 'תרומות למוסדות בישראל', kind: 'amount',
    meaning: 'סכום התרומות בשנת המס (מעל המינימום); זיכוי 35% עד 30% מההכנסה. במקוון — פיצול בין 037 ל-237.',
    relevantWhen: 'נתרמו סכומים למוסדות מאושרים', relevance: ctx => positive(ctx, 'donationsAnnual'),
    sources: ['document', 'fileFact'], fact: { key: 'donationsAnnual', scope: 'current', label: 'אומדן תרומות בכרטיס' }, evidence: ['קבלות לפי סעיף 46', 'ריכוז תרומות מהרשות'],
    fillCheck: 'הסכום לפי הקבלות (או הריכוז) של אותה שנה; הפיצול בין בני הזוג.',
    basis: 'primary', sourceId: F, locator: `סעיף 78א; מדריך 2025 (פרק ד), עמ׳ PDF 73`, checkedAt: C,
  },
  {
    key: 'wh.salaryTax', formVersionId: V, part: 'טו', section: '84', codes: { registered: '042' },
    label: 'מס שנוכה במקור ממשכורת', kind: 'amount',
    meaning: 'לפי טופסי 106, ועוד החלק היחסי ממס שנוכה מפיצויים שנפרסו.',
    relevantWhen: 'היה שכיר או קיבל קצבה בשנת המס', relevance: ctx => hasSalary(ctx),
    sources: ['document'], evidence: ['טופס 106 מכל מעביד', 'טופס 161 / אישור פריסה'],
    fillCheck: 'סך המס שנוכה בכל טופסי 106 של שני בני הזוג (קוד אחד).',
    basis: 'primary', sourceId: F, locator: `סעיף 84; מדריך 2025 (פרק ד), עמ׳ PDF 75`, checkedAt: C,
  },
];

/**
 * 2024 — אותם שדות ואותם קודים; מספרי הסעיפים זזו: +2 מסעיף 31 הישן ו-+3 מסעיף 39 הישן (סעיף 51 ב-2025 היה 48).
 * ‼ נגזר מהשוואת הטקסט של שתי הגרסאות הרשמיות, לא נקרא שדה־שדה.
 */
const SHIFT_2024 = (s: string) => {
  const m = /^(\d+)(.*)$/.exec(s);
  if (!m) return s;
  const n = Number(m[1]);
  const old = n >= 42 ? n - 3 : n >= 33 ? n - 2 : n;
  return `${old}${m[2]}`;
};
export const FIELDS_1301_2024: FormField[] = FIELDS_1301_2025.map(f => ({
  ...f, formVersionId: '1301@2024', section: SHIFT_2024(f.section), basis: 'derived', sourceId: 'form1301_2024',
  locator: `סעיף ${SHIFT_2024(f.section)} בגרסת 2024 (הסטת מספור מול 2025)`,
}));

// ── נספחים ──────────────────────────────────────────────────────────────────
const G = 'itaGuide2025';
const A = (formId: string, title: string, requiredWhen: string, relevance?: (c: FieldContext) => Tri, locator = 'רשימת הטפסים, עמ׳ 12, 13 ו־130'): AnnexRule =>
  ({ formId, title, forVersionId: V, requiredWhen, relevance, basis: 'primary', sourceId: G, locator, checkedAt: C });

/** ‼ «לא ידוע» הוא ברירת המחדל: נספח לא «לא נדרש» רק כי הכרטיס לא יודע. */
export const ANNEXES_1301_2025: AnnexRule[] = [
  A('106/867/857', 'אישורי ניכוי במקור (משכורת / שוק ההון / אחר)', 'תמיד, לכל סכום שנוכה במקור', ctx => (hasSalary(ctx) === 'yes' ? 'yes' : 'unknown')),
  A('1320', 'נספח א — הכנסה מעסק או משלח יד', 'יש הכנסה מעסק או משלח יד', hasBusiness),
  A('6111', 'דוחות כספיים מקודדים', 'עסק עם מחזור מעל 300,000 ₪ כולל מע״מ שמנהל ספרים כפולים או ממוחשבים; משודר מקוון בלבד', ctx => (hasBusiness(ctx) === 'no' ? 'no' : 'unknown'), 'פרק ב; ‼ בסימון בטופס מופיע 256,410 בלי מע״מ — כנראה לפי 17%'),
  A('1321', 'נספח ב — הכנסה שאינה מעסק (שכירות, ריבית, דיבידנד)', 'יש הכנסה פסיבית או מנכס'),
  A('1322', 'נספח ג — רווח הון מניירות ערך סחירים', 'רווח או הפסד מניירות ערך סחירים; לצרף 867'),
  A('1324', 'נספח ד — הכנסות מחו״ל ומס ששולם בחו״ל', 'יש הכנסה מחו״ל'),
  A('1399י', 'רווח הון לכל עסקה (נכס לא סחיר, כולל קריפטו)', 'רווח או הפסד מנכס שאינו נייר ערך סחיר; רווח שקוזז לאפס — חייב שידור'),
  A('134', 'הפקדות עודפות של מעביד / ניכוי ביטוח אובדן כושר לשכיר', 'מעביד הפקיד סכומים עודפים, או שכיר תובע ניכוי ביטוח אובדן כושר (206/207)'),
  A('1342', 'נכסים בני פחת', 'נתבע פחת'),
  A('1344', 'הפסדים מועברים', 'קיזוז הפסדים משנים קודמות או העברת הפסד'),
  A('1504', 'פרטי שותפות', 'שותף בשותפות'),
  A('119', 'זיכוי בשל תואר אקדמי או לימודי מקצוע', 'תובע את הזיכוי (181/182)'),
  A('116ד', 'דחיית נקודות זיכוי לילד שנולד בשנה', 'מבקש לדחות (361/362)'),
  A('150', 'החזקה בחברה זרה', 'שליטה בחברה זרה סחירה או זכויות בלא סחירה (סימון בחלק א)'),
  A('1350', 'משיכות בעל מניות מהותי', 'יתרת משיכות מעל 100,000 ₪'),
  A('1362', 'הכנסה לפי סעיף 62א (חברת מעטים)', 'הכנסה שיוחסה מחברת מעטים; מקוון בלבד', undefined, 'דף השירות 2025 — מופיע ב-2025 ולא בדף של 2024'),
];

export const FIELDS_BY_VERSION: Record<string, readonly FormField[]> = { [V]: FIELDS_1301_2025, '1301@2024': FIELDS_1301_2024 };
export const ANNEXES_BY_VERSION: Record<string, readonly AnnexRule[]> = { [V]: ANNEXES_1301_2025 };

/** הודעות ברמת הטופס לשנה — שינויים שאינם שדה ממופה. */
export const FORM_NOTES_2025: { text: string; basis: 'primary' | 'derived' | 'secondary'; sourceId: string }[] = [
  { text: 'טופס 0137 (דוח מקוצר) בוטל — לא ניתן להגיש אותו לשנת 2025.', basis: 'primary', sourceId: G },
  { text: 'נוספו סימוני עסק זעיר בחלק א (זכאות לניכוי הוצאות 30% / ויתור על הכללים השנה). בחירה במסלול חוסמת את 030/089, והמחזור ב-238/239 לא יעלה על התקרה (בשידור המקוון). 87ד(ג) — אין נתיב מקוון ידוע; טיפול ידני (פתוח).', basis: 'derived', sourceId: F },
  { text: 'נוספו שדות להוראת השעה על רווחים שלא חולקו (סעיפים 31, 32, 43, 86) וליחוס הכנסה לפי סעיף 62א (סעיף 47, טופס 1362).', basis: 'derived', sourceId: F },
  { text: 'מספרי הסעיפים זזו (ב-2 מסעיף 31 הישן וב-3 מסעיף 39 הישן); קודי השדות לא השתנו.', basis: 'derived', sourceId: F },
  { text: 'בגרסה המונגשת יש טעויות שהוכרעו לפי הטופס הרגיל והמדריך: חסרה שורת 6111 (חלק א), קוד 10% בסעיף 31 הוא 168 ולא 127, ליד 080 — 30% ולא 80%, סעיף 78ב — 046 ולא 460.', basis: 'primary', sourceId: F },
  { text: 'משמעות 0 וריק שונה בחלק מהשדות: 218/219 — 0 כשהמעביד לא הפקיד; הכנסה מועברת לקיבוץ (369/370) — 0 לחבר שאינו מעביר, ריק לבן זוג שאינו חבר.', basis: 'primary', sourceId: G },
  { text: 'מועדי הגשה: נייר 29.05.2026, מקוון 30.06.2026; מיוצגים — לפי הסדר הדחיות.', basis: 'primary', sourceId: 'service1301_2025' },
];

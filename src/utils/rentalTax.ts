// ─────────────────────────────────────────────────────────────────────────────
// מנוע השוואת מסלולי מיסוי שכר דירה למגורים בישראל
// מקורות: חוק מס הכנסה (פטור ממס על הכנסה מהשכרת דירת מגורים), התש"ן-1990;
//          סעיפים 122, 122(ו) לפקודה (תיקון 264 — ניכוי דמי שכירות מוטבים);
//          כל-זכות; רשות המסים. אומת יולי 2026.
//
// עקרון הפטור המתקפל ("תקרה מתואמת"): כשדמי השכירות החודשיים R עולים על
// התקרה T, הפטור קטן שקל מול שקל: פטור = 2T − R, חייב = 2(R − T).
// ב-R = 2T הפטור מתאפס לחלוטין.
// ─────────────────────────────────────────────────────────────────────────────

export interface RentalInput {
  year: number;
  /** דמי שכירות חודשיים מכלל דירות המגורים (כולל דירות במסלולים אחרים!) */
  monthlyRent: number;
  /** שכ"ד חודשי לכל דירה בנפרד (לאופטימיזציית שיוך מסלולים) */
  apartmentRents?: number[];
  /** תקרת הפטור החודשית לשנה (מ-TaxYearData) */
  exemptCeilingMonthly: number;
  /** שיעור המס השולי של המשכיר על הכנסה פסיבית (31 ומעלה מתחת לגיל 60) */
  marginalRatePct: number;
  /** האם מלאו למשכיר 60 (מדרגות מלאות מ-10% על הכנסה פסיבית) */
  isAge60Plus: boolean;
  /** הוצאות שנתיות מוכרות (ריבית משכנתא, תיקונים, ביטוח, ניהול) */
  annualExpenses: number;
  /** פחת שנתי (2% משווי הדירה — תקנות תשמ"ט) */
  annualDepreciation: number;
  /** סעיף 122(ו): בעל דירה יחידה שמשלם בעצמו שכ"ד למגוריו או בית אבות */
  eligibleForRentPaidDeduction: boolean;
  /** דמי שכירות שנתיים שהמשכיר משלם בעד מגוריו (למסלול 122(ו)) */
  annualRentPaidForOwnHome: number;
  /** מספר דירות מושכרות (לאיתור חזקת עסק) */
  propertyCount: number;
}

export interface RouteResult {
  key: 'exempt' | 'flat10' | 'marginal';
  title: string;
  /** הכנסה חייבת במסלול */
  taxableAnnual: number;
  /** מס שנתי משוער */
  taxAnnual: number;
  effectiveRatePct: number;
  available: boolean;
  unavailableReason?: string;
  steps: string[];
  pros: string[];
  cons: string[];
  warnings: string[];
}

export interface ExemptMechanism {
  monthlyRent: number;
  ceiling: number;
  zeroPoint: number;          // 2T — נקודת איפוס הפטור
  excess: number;             // חריגה מהתקרה
  adjustedExemption: number;  // הפטור בפועל (2T − R)
  taxableMonthly: number;     // החלק החייב לחודש
  zone: 'full' | 'partial' | 'none';
}

export interface RentalComparisonResult {
  routes: RouteResult[];
  mechanism: ExemptMechanism;
  recommendedKey: RouteResult['key'];
  recommendationNote: string;
  generalWarnings: string[];
}

const RENT_PAID_DEDUCTION_CEILING = 90_000; // סעיף 122(ו)

export function compareRentalRoutes(input: RentalInput): RentalComparisonResult {
  const R = Math.max(0, input.monthlyRent);
  const T = input.exemptCeilingMonthly;
  const annualRent = R * 12;
  const rate = input.marginalRatePct / 100;

  // ── מנגנון הפטור המתקפל ──
  const excess = Math.max(0, R - T);
  const adjustedExemption = Math.max(0, T - excess); // = 2T − R
  const taxableMonthly = Math.min(R, Math.max(0, R - adjustedExemption));
  const zone: ExemptMechanism['zone'] = R <= T ? 'full' : R < 2 * T ? 'partial' : 'none';
  const mechanism: ExemptMechanism = {
    monthlyRent: R, ceiling: T, zeroPoint: 2 * T,
    excess, adjustedExemption, taxableMonthly, zone,
  };

  const fmt = (n: number) => Math.round(n).toLocaleString('he-IL');

  // ── מסלול פטור ──
  const exemptSteps: string[] = [];
  let exemptTaxable = 0;
  let exemptTax = 0;
  if (zone === 'full') {
    exemptSteps.push(`שכ"ד ${fmt(R)} ₪/חודש ≤ תקרה ${fmt(T)} ₪ — פטור מלא, מס 0.`);
  } else if (zone === 'partial') {
    exemptSteps.push(`חריגה מהתקרה: ${fmt(R)} − ${fmt(T)} = ${fmt(excess)} ₪`);
    exemptSteps.push(`תקרה מתואמת (הפטור בפועל): ${fmt(T)} − ${fmt(excess)} = ${fmt(adjustedExemption)} ₪`);
    exemptSteps.push(`חלק חייב: ${fmt(R)} − ${fmt(adjustedExemption)} = ${fmt(taxableMonthly)} ₪/חודש (${fmt(taxableMonthly * 12)} ₪/שנה)`);
    // הוצאות ופחת — יחסית לחלק החייב בלבד
    const taxablePortion = taxableMonthly / R;
    const proportionalExpenses = (input.annualExpenses + input.annualDepreciation) * taxablePortion;
    exemptTaxable = Math.max(0, taxableMonthly * 12 - proportionalExpenses);
    if (proportionalExpenses > 0) {
      exemptSteps.push(`הוצאות ופחת יחסיים (${Math.round(taxablePortion * 100)}% מהחלק החייב): −${fmt(proportionalExpenses)} ₪`);
    }
    exemptTax = exemptTaxable * rate;
    exemptSteps.push(`מס: ${fmt(exemptTaxable)} × ${input.marginalRatePct}% = ${fmt(exemptTax)} ₪/שנה`);
  } else {
    exemptSteps.push(`שכ"ד ${fmt(R)} ₪ ≥ פי 2 מהתקרה (${fmt(2 * T)} ₪) — הפטור מתאפס לחלוטין.`);
    exemptTaxable = Math.max(0, annualRent - input.annualExpenses - input.annualDepreciation);
    exemptTax = exemptTaxable * rate;
    exemptSteps.push(`בפועל זהה למסלול השולי: מס ≈ ${fmt(exemptTax)} ₪/שנה`);
  }
  if (zone !== 'full') {
    exemptTaxable = Math.round(exemptTaxable);
  }

  const exemptRoute: RouteResult = {
    key: 'exempt',
    title: zone === 'full' ? 'פטור מלא' : zone === 'partial' ? 'פטור חלקי (תקרה מתואמת)' : 'פטור (התאפס)',
    taxableAnnual: exemptTaxable,
    taxAnnual: Math.round(exemptTax),
    effectiveRatePct: annualRent > 0 ? (exemptTax / annualRent) * 100 : 0,
    available: true,
    steps: exemptSteps,
    pros: [
      'ללא מס עד התקרה וללא חובת דיווח (אם אין חובה אחרת)',
      'פטור מדמי ביטוח לאומי',
    ],
    cons: [
      'הפטור נשחק שקל מול שקל מעל התקרה — כל שקל חריגה מוסיף 2 ₪ לחלק החייב',
      'התקרה משותפת לכל דירות התא המשפחתי (כולל דירות במסלול 10%)',
    ],
    warnings: [
      'במכירה עתידית חייבת במס שבח — רשות המסים מנכה משווי הרכישה את הפחת שניתן היה לדרוש (הו"ב 5/2007), גם אם לא נדרש בפועל.',
    ],
  };

  // ── מסלול 10% ──
  // ניכוי 122(ו) מותנה בבעלות על דירת מגורים יחידה — עם 2+ דירות מושכרות אינו חל
  const rentPaidDeduction = input.eligibleForRentPaidDeduction && input.propertyCount <= 1
    ? Math.min(input.annualRentPaidForOwnHome, RENT_PAID_DEDUCTION_CEILING, annualRent)
    : 0;
  const flat10Base = Math.max(0, annualRent - rentPaidDeduction);
  const flat10Tax = flat10Base * 0.10;
  const flat10Steps = [
    `בסיס: מלוא דמי השכירות ברוטו — ${fmt(annualRent)} ₪/שנה (ללא ניכוי הוצאות ופחת)`,
  ];
  if (rentPaidDeduction > 0) {
    flat10Steps.push(`ניכוי דמי שכירות מוטבים (סעיף 122(ו)): −${fmt(rentPaidDeduction)} ₪ (עד 90,000 ₪, דירה יחידה + שכירות/בית אבות)`);
  }
  flat10Steps.push(`מס: ${fmt(flat10Base)} × 10% = ${fmt(flat10Tax)} ₪/שנה`);
  flat10Steps.push(`מועד תשלום: עד 30 בינואר ${input.year + 1} — איחור גורר הצמדה וריבית.`);

  const flat10Route: RouteResult = {
    key: 'flat10',
    title: 'מסלול 10% (סעיף 122)',
    taxableAnnual: Math.round(flat10Base),
    taxAnnual: Math.round(flat10Tax),
    effectiveRatePct: annualRent > 0 ? (flat10Tax / annualRent) * 100 : 0,
    available: true,
    steps: flat10Steps,
    pros: [
      'שיעור קבוע ונמוך, ללא תלות במס השולי',
      'פטור מדמי ביטוח לאומי',
      'דיווח מקוצר (עד ~375,000 ₪ הכנסת שכירות, אם אין חובת דוח אחרת)',
      ...(rentPaidDeduction > 0 ? ['ניכוי 122(ו) — הטבה ייחודית למשכיר דירה יחידה שגר בשכירות/בית אבות'] : []),
    ],
    cons: [
      'אין ניכוי הוצאות, פחת, קיזוזים או פטורים אישיים',
      'ההכנסה במסלול זה נספרת לבדיקת תקרת הפטור של דירות אחרות',
    ],
    warnings: [
      'סעיף 122(ג): במכירה חייבת, הפחת המרבי שניתן היה לנכות מתווסף לשווי המכירה — "פצצת פחת" שחובה להציג ללקוח.',
      'תשלום עד 30.1 של השנה העוקבת — מקור החיכוך הנפוץ ביותר במסלול.',
    ],
  };

  // ── מסלול שולי ──
  const marginalTaxable = Math.max(0, annualRent - input.annualExpenses - input.annualDepreciation);
  const marginalTax = marginalTaxable * rate;
  const marginalRoute: RouteResult = {
    key: 'marginal',
    title: 'מסלול מס שולי (רגיל)',
    taxableAnnual: Math.round(marginalTaxable),
    taxAnnual: Math.round(marginalTax),
    effectiveRatePct: annualRent > 0 ? (marginalTax / annualRent) * 100 : 0,
    available: true,
    steps: [
      `הכנסה: ${fmt(annualRent)} ₪ − הוצאות ${fmt(input.annualExpenses)} ₪ − פחת ${fmt(input.annualDepreciation)} ₪ = ${fmt(marginalTaxable)} ₪`,
      `מס: ${fmt(marginalTaxable)} × ${input.marginalRatePct}% = ${fmt(marginalTax)} ₪/שנה`,
      input.isAge60Plus
        ? 'בני 60+ — מדרגות מלאות החל מ-10% גם על הכנסה פסיבית'
        : 'מתחת לגיל 60 — מדרגת פתיחה 31% על הכנסה פסיבית',
    ],
    pros: [
      'ניכוי מלוא ההוצאות והפחת (ריבית משכנתא, תיקונים, ניהול, ביטוח)',
      'לבני 60+ — לעיתים המסלול הזול ביותר (מדרגות מ-10% + נקודות זיכוי)',
      'הפסד שוטף ניתן לקיזוז כנגד הכנסות מאותו נכס בעתיד (סעיף 28(ח))',
    ],
    cons: [
      'חובת הגשת דוח שנתי מלא',
      'מתחת לגיל 60 — מס גבוה (31%+) אלא אם ההוצאות כבדות',
    ],
    warnings: [],
  };

  const routes = [exemptRoute, flat10Route, marginalRoute];

  // ── המלצה ──
  const best = [...routes].sort((a, b) => a.taxAnnual - b.taxAnnual)[0];
  let recommendationNote = '';
  if (best.key === 'exempt' && zone === 'full') {
    recommendationNote = 'עד התקרה — הפטור תמיד עדיף. שים לב לפחת הרעיוני במכירה עתידית חייבת.';
  } else if (best.key === 'exempt') {
    recommendationNote = 'בפטור חלקי המס נמוך יותר כל עוד השכירות קרובה לתקרה; נקודת האיזון מול 10% היא סביב 6,700–6,800 ₪/חודש (ללא הוצאות, 31%).';
  } else if (best.key === 'flat10') {
    recommendationNote = 'מסלול 10% משתלם בדרך כלל משכירות של כ-6,800 ₪/חודש ומעלה — אלא אם יש הוצאות/פחת כבדים (מעל כ-68% מההכנסה) או שהמשכיר בן 60+ עם מדרגות נמוכות.';
  } else {
    recommendationNote = input.isAge60Plus
      ? 'לבני 60+ עם הכנסות נמוכות, המסלול השולי (מ-10%) עם ניכוי הוצאות עשוי להיות הזול ביותר.'
      : 'המסלול השולי משתלם רק כשההוצאות והפחת גבוהים מאוד ביחס לשכירות (בדרך כלל שנים ראשונות עם ריבית משכנתא כבדה).';
  }

  const generalWarnings: string[] = [
    'ההשוואה היא כלי עזר להתלבטות — הבחירה הסופית דורשת שיקול דעת מקצועי מלא (מכירה צפויה, הכנסות אחרות, בני זוג).',
    'התקרה נבחנת על סך שכר הדירה של התא המשפחתי (בני זוג + ילדים עד 18) — אין תקרה כפולה לבני זוג.',
    'כל המסלולים פטורים מדמי ביטוח לאומי (סעיף 350(א)(7)) — כל עוד ההשכרה אינה מגיעה כדי עסק.',
  ];
  if (input.propertyCount >= 10) {
    generalWarnings.unshift('⚠ 10 דירות ומעלה — חזקת עסק לפי הפסיקה (לשם/בירן): אין פטור ואין מסלול 10%, ההכנסה חייבת במס שולי מלא + ביטוח לאומי.');
  } else if (input.propertyCount >= 6) {
    generalWarnings.unshift('⚠ 6–9 דירות — אזור אפור לפי הפסיקה: ייתכן סיווג כעסק. נדרשת בחינה פרטנית.');
  }

  return {
    routes,
    mechanism,
    recommendedKey: best.key,
    recommendationNote,
    generalWarnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// אופטימיזציית שיוך מסלולים לריבוי דירות
//
// הבחירה במסלול היא לכל דירה בנפרד, אבל תקרת הפטור נבחנת מול סך דמי
// השכירות מכל דירות המגורים — כולל דירות שבמסלול 10%. לכן שיוך חכם
// (איזו דירה בפטור ואיזו ב-10%) יכול לחסוך מס אמיתי.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApartmentAssignment {
  monthlyRent: number;
  route: 'exempt' | 'flat10';
  /** הפטור החודשי שנוצל על הדירה (במסלול הפטור) */
  exemptionUsedMonthly: number;
  /** חלק חייב חודשי (במסלול הפטור — החלק שמעל הפטור, במס שולי) */
  taxableMonthly: number;
  taxAnnual: number;
}

export interface MixedRouteResult {
  apartments: ApartmentAssignment[];
  /** התקרה המתואמת (הפטור הזמין) לפי סך ההכנסות מכל הדירות */
  adjustedExemptionMonthly: number;
  totalTaxAnnual: number;
  /** המס בחלופה הפשוטה הטובה ביותר (כל הדירות באותו מסלול) */
  bestUniformTaxAnnual: number;
  bestUniformLabel: string;
  savingVsUniform: number;
  notes: string[];
}

export function optimizeApartmentRoutes(
  apartmentRents: number[],
  exemptCeilingMonthly: number,
  marginalRatePct: number,
): MixedRouteResult | null {
  const rents = apartmentRents.filter(r => r > 0);
  if (rents.length < 2 || rents.length > 10) return null;

  const T = exemptCeilingMonthly;
  const rate = marginalRatePct / 100;
  const totalRent = rents.reduce((s, r) => s + r, 0);
  // התקרה המתואמת נקבעת לפי סך השכירות מכל הדירות — בכל שיוך שהוא
  const excess = Math.max(0, totalRent - T);
  const adjustedExemption = Math.max(0, T - excess);

  interface Candidate { mask: number; tax: number; exemptRent: number }
  let best: Candidate | null = null;

  for (let mask = 0; mask < (1 << rents.length); mask++) {
    let exemptRent = 0;
    let flatRent = 0;
    for (let i = 0; i < rents.length; i++) {
      if (mask & (1 << i)) exemptRent += rents[i];
      else flatRent += rents[i];
    }
    const exemptionUsed = Math.min(exemptRent, adjustedExemption);
    const taxableAtMarginal = exemptRent - exemptionUsed;
    const tax = (taxableAtMarginal * rate + flatRent * 0.10) * 12;
    if (
      best === null ||
      tax < best.tax - 0.5 ||
      // שוברי שוויון: עדיף לנצל יותר פטור (פחות תשלומי 10% ודיווח)
      (Math.abs(tax - best.tax) <= 0.5 && exemptRent > best.exemptRent)
    ) {
      best = { mask, tax, exemptRent };
    }
  }
  if (!best) return null;

  // בניית השיוך המנצח, עם חלוקת הפטור לפי סדר הדירות בפול הפטור
  let exemptionLeft = adjustedExemption;
  const apartments: ApartmentAssignment[] = rents.map((r, i) => {
    if (best!.mask & (1 << i)) {
      const used = Math.min(r, exemptionLeft);
      exemptionLeft -= used;
      const taxable = r - used;
      return { monthlyRent: r, route: 'exempt', exemptionUsedMonthly: used, taxableMonthly: taxable, taxAnnual: taxable * rate * 12 };
    }
    return { monthlyRent: r, route: 'flat10', exemptionUsedMonthly: 0, taxableMonthly: r, taxAnnual: r * 0.10 * 12 };
  });

  // חלופות אחידות להשוואה
  const allExemptTaxable = totalRent - Math.min(totalRent, adjustedExemption);
  const allExemptTax = allExemptTaxable * rate * 12;
  const allFlatTax = totalRent * 0.10 * 12;
  const uniform = allExemptTax <= allFlatTax
    ? { tax: allExemptTax, label: 'כל הדירות במסלול הפטור' }
    : { tax: allFlatTax, label: 'כל הדירות במסלול 10%' };

  const notes: string[] = [
    `התקרה המתואמת חושבה לפי סך השכירות מכל הדירות (${Math.round(totalRent).toLocaleString('he-IL')} ₪/חודש) — גם דירות במסלול 10% נספרות בבדיקת התקרה.`,
    'החישוב ללא הוצאות ופחת פר-דירה; דירה עם ריבית משכנתא כבדה עשויה להצדיק מסלול שולי פרטני.',
  ];
  if (adjustedExemption === 0) {
    notes.unshift('סך השכירות מעל כפל התקרה — הפטור התאפס לחלוטין, ולכן ההשוואה היא בעיקר 10% מול שולי.');
  }

  return {
    apartments,
    adjustedExemptionMonthly: adjustedExemption,
    totalTaxAnnual: Math.round(best.tax),
    bestUniformTaxAnnual: Math.round(uniform.tax),
    bestUniformLabel: uniform.label,
    savingVsUniform: Math.round(uniform.tax - best.tax),
    notes,
  };
}

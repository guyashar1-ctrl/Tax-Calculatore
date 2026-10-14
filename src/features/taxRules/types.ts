// ─── מרשם כללי המס — טיפוסים ─────────────────────────────────────────────────
// מקור אחד לערכים שמזינים את ידע המס, את השאלונים ואת החישובים.
// ‼ כל ערך שייך לשנת מס (או לתחולה בתאריכים), נושא רמת ביסוס ומקור, ויכול
// להיות מוגבל לתרחיש. ערך שלא אומת לשנה ולתרחיש הנדרשים לא נכנס לחישוב —
// ראה registry.ts (gate). הסבר מקצועי בלבד מסומן computable:false.

/** רמת הביסוס של ערך. רק primary (ו-derived מכלל primary) נכנסים לחישוב. */
export type Basis = 'primary' | 'secondary' | 'derived' | 'unverified';

/**
 * תנאי תרחיש. כלל עם scope חל רק כשכל התנאים מתקיימים בתרחיש.
 * ‼ תנאי שהתרחיש לא אומר עליו כלום הוא «לא ידוע» — לא «מתקיים».
 */
export type ScenarioTag =
  | 'selfEmployed'        // יש הכנסה מעסק או משלח יד
  | 'employee'            // יש משכורת
  | 'employerStudyFund'   // המעביד מפקיד לקרן השתלמות
  | 'noWorkIncome'        // אין הכנסת עבודה (משכורת) — רק הכנסה שאינה מעבודה
  | 'under50'             // טרם מלאו 50 ביום 1.1 של שנת המס
  | 'age50plus'
  | 'beneficialMember'    // עמית מוטב
  | 'notBeneficialMember'
  | 'beforeRetirementAge' // בגיל העבודה (ב״ל: שיעורים רגילים)
  | 'insuredSalary'       // ההכנסה המבוטחת (244/245) ידועה
  | 'uninsuredSalaryTrackA' // משכורת שאינה מבוטחת במסלול א׳ — ניכוי 5% להכנסת עבודה
  | 'age50plusWithSalary'    // מגיל 50 ויש גם משכורת — חלוקת התקרה לא אומתה
  | 'age50plusBeneficialTrackA'; // עמית מוטב מגיל 50 שבוחר במסלול א׳ — לא נמצא מקור

export interface RuleValue {
  /** שנת המס שהערך שייך לה. */
  taxYear: number;
  /** תחולה בתאריכים כשהיא אינה שנה מלאה (YYYY-MM-DD). */
  effectiveFrom?: string;
  effectiveTo?: string;
  value: number | string;
  basis: Basis;
  sourceId: string;
  /** איפה במקור: «מדריך 2025, פרק ד, סעיפים 51 עד 52». */
  locator?: string;
  /** מתי נבדק בפועל מול המקור (DD.MM.YYYY). */
  checkedAt: string;
  note?: string;
  /**
   * ‼ גרסאות קודמות של הערך לאותה שנה — כשמקור תוקן או פורסם מחדש. לא דורסים:
   * הערך הנוכחי למעלה, וכל מה שהיה לפניו כאן, עם מתי ולמה הוחלף.
   */
  revisions?: RuleRevision[];
}

export interface RuleRevision {
  value: number | string;
  basis: Basis;
  sourceId: string;
  locator?: string;
  checkedAt: string;
  /** מתי הוחלף (DD.MM.YYYY) ולמה. */
  replacedAt: string;
  reason: string;
}

export interface Rule {
  id: string;
  label: string;
  unit: '₪' | 'rate' | 'text' | 'days' | 'count';
  law?: string;
  /** false = הסבר מקצועי בלבד; אסור כבסיס לחישוב גם אם ביסוסו רשמי. */
  computable: boolean;
  /** התרחיש שבו הכלל חל. ריק = חל תמיד. */
  scope?: ScenarioTag[];
  /** ‼ היסטוריה מלאה. לא מוחקים שנים — מוסיפים. */
  values: RuleValue[];
}

/** סוג המסמך — לא רק ערכים: גם טפסים, נספחים, הוראות ומיפוי שדות מתעדכנים. */
export type DocKind = 'guide' | 'form' | 'annex' | 'instructions' | 'fieldMap' | 'servicePage' | 'notice' | 'law' | 'table' | 'other';

/**
 * מקור = מסמך מסוים בגרסה מסוימת.
 * ‼ ארבעה מאפיינים נפרדים, ואסור לגזור אחד מהאחר:
 *   refersToTaxYear — שנת המס שהמידע מתאר (דוח 2026 מתפרסם ב-2027 ומתאר את 2026);
 *   publishedAt     — מתי הרשות פרסמה את הגרסה;
 *   effectiveFrom   — ממתי הכלל חל (יכול להקדים את הפרסום, למשל תיקון רטרואקטיבי);
 *   documentVersion — גרסת המסמך (מהדורה, «מעודכן ל…», טופס בנוסח חדש).
 * מה שלא ידוע — נשאר ריק. לא ממלאים לפי שנת הפרסום.
 */
export interface Source {
  id: string;
  label: string;
  kind: 'primary' | 'secondary' | 'office';
  docKind: DocKind;
  publisher: string;
  url?: string;
  refersToTaxYear?: number;
  publishedAt?: string;
  effectiveFrom?: string;
  documentVersion?: string;
  /** המקור שהגרסה הזו מחליפה (אותו מסמך, גרסה קודמת). הקודם נשאר ברשימה. */
  supersedes?: string;
  checkedAt: string;
  note?: string;
}

/**
 * פרסום שעדיין לא נמצא — מה לחפש בסבב הבא. כך פרסום מאוחר (דוח 2026
 * ונספחיו ב-2027) לא נשכח ולא משויך לשנה הלא נכונה.
 */
export interface ExpectedPublication {
  id: string;
  docKind: DocKind;
  title: string;
  refersToTaxYear: number;
  /** מתי בדרך כלל מתפרסם — הערכה, לא עובדה. */
  usuallyPublished: string;
  /** מה יתעדכן כשיתפרסם. */
  affects: string[];
}

/**
 * מה נכנס לחישוב בפועל — נשמר עם כל תוצאה שמאושרת, כדי שאפשר יהיה לדעת
 * אחר כך שכלל השתנה, בלי לחשב מחדש בשקט.
 */
export interface UsedRule {
  ruleId: string;
  /** השנה שביקשו. */
  requestedYear: number;
  /** שנת הערך שנכנס בפועל (בהמחשה יכולה להיות קודמת). */
  taxYear: number;
  basis: Basis;
  value: number | string | null;
  sourceId: string | null;
}

/** מה ידוע על המקרה. תנאי שלא צוין = לא ידוע. */
export type Scenario = Partial<Record<ScenarioTag, boolean>>;

export type GateProblem =
  | { kind: 'missingRule'; ruleId: string }
  | { kind: 'noValueForYear'; ruleId: string; year: number; nearestYear?: number }
  | { kind: 'weakBasis'; ruleId: string; year: number; basis: Basis }
  | { kind: 'notComputable'; ruleId: string }
  | { kind: 'outOfScope'; ruleId: string; tag: ScenarioTag }
  | { kind: 'unknownScenario'; ruleId: string; tag: ScenarioTag };

/** תוצאת חישוב שעוברת דרך השער. */
export interface GatedResult<T> {
  ok: boolean;
  value?: T;
  /** הכללים והגרסאות שנכנסו לחישוב — נשמרים עם תמונת מצב. */
  usedRules: UsedRule[];
  problems: GateProblem[];
  /** «המחשה»: ערך משני הותר להצגה בלימוד בלבד — לעולם לא לשמירה. */
  illustrative: boolean;
}

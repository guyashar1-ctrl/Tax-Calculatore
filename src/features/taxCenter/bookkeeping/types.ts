// ─────────────────────────────────────────────────────────────────────────────
// מודל ידע — ניהול ספרים (הוראות מס הכנסה (ניהול פנקסי חשבונות), תשל"ג-1973)
//
// עקרון: כל עוסק משתייך לתוספת אחת לפי סוג העסק; בתוך התוספת, החובות נקבעות
// לפי מדרגה (מחזור / מועסקים). המודל משקף את זה ישירות:
//   סוג עסק → תוספת → מדרגה → ספרים + תיעוד.
// כל נתון נושא sectionRef למקור בהוראות. ערכי הסף הועתקו מהנוסח המשולב
// המעודכן — אין כאן מספר שלא הופיע במקור.
// ─────────────────────────────────────────────────────────────────────────────

export type AddendumId =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'
  | 'i' | 'j' | 'k' | 'l' | 'n' | 'o' | 'p';

/** תנאי כניסה למדרגה בתוך תוספת */
export interface TierCondition {
  /** מחזור שנתי מעל סכום זה (₪) */
  turnoverAboveILS?: number;
  /** מחזור שנתי עד סכום זה (₪, כולל) */
  turnoverUpToILS?: number;
  /** מספר מועסקים מינימלי */
  employeesAtLeast?: number;
  /** מספר מועסקים מקסימלי (עד וכולל) */
  employeesAtMost?: number;
  /** 'or' = מספיק תנאי אחד (מחזור או מועסקים); 'and' = שניהם */
  logic?: 'or' | 'and';
  /** תנאי שאינו מחזור/מועסקים (מספר רכבים, תלמידים, תפקיד...) — מוכרע ידנית */
  custom?: boolean;
  /** ניסוח התנאי בשפה ברורה — לתצוגה. תמיד קיים. */
  asWritten: string;
}

export interface RequiredBook {
  /** שם הספר/המסמך */
  name: string;
  /** סעיף בתוספת */
  sectionRef?: string;
  /** פרטים ספציפיים לתוספת הזו (אם יש) */
  details?: string;
}

export interface AddendumTier {
  id: string;
  /** שם קצר לתצוגה, למשל: "עסק גדול — חשבונאות כפולה" */
  label: string;
  /** האם המדרגה מחייבת הנהלת חשבונות כפולה */
  doubleEntry: boolean;
  condition: TierCondition;
  requiredBooks: RequiredBook[];
  /** תיעוד נדרש בשפה חופשית (חשבוניות, שוברי קבלה, תעודות משלוח...) */
  requiredDocs?: string;
  notes?: string[];
}

/** ספר ייחודי לתוספת — מה הוא ומה רושמים בו */
export interface SpecialBook {
  name: string;
  whatIsRecorded: string;
}

export interface BookkeepingAddendum {
  id: AddendumId;
  /** האות העברית הרשמית: א', ב'... */
  letter: string;
  title: string;
  icon: string;
  /** על מי חלה — ההגדרה בשפה ברורה, נאמנה למקור */
  appliesTo: string;
  /** מונחים שהוגדרו בתוספת */
  definitions: { term: string; definition: string }[];
  /** המדרגות — מסודרות מהמחמירה (עסק גדול) לקלה */
  tiers: AddendumTier[];
  /** מה האשף שואל כדי להכריע מדרגה */
  wizard: {
    askTurnover: boolean;
    askEmployees: boolean;
    /** שאלה ייחודית (מספר רכבים / תלמידים / תת-תפקיד) במקום או בנוסף */
    customQuestion?: string;
  };
  /** מתי חובה קופה רושמת */
  cashRegister?: string;
  /** כללי מלאי/מפקד אם יש */
  inventoryRules?: string;
  /** ספרים ייחודיים לתוספת */
  specialBooks?: SpecialBook[];
  /** הערות מיוחדות (הקלות פנימיות, חריגים, מסלולים מיוחדים) */
  specialNotes?: string[];
  /** פריטים שדורשים אימות ידני נוסף */
  needsReview?: string[];
}

/** ערך במילון הספרים והתיעוד */
export interface BookDefinition {
  id: string;
  name: string;
  /** שמות נוספים/כינויים */
  aka?: string[];
  kind: 'book' | 'doc';
  icon: string;
  /** מה זה — משפט אחד ברור */
  whatIsIt: string;
  /** מה רושמים בו — רשימת השדות/הפרטים */
  whatIsRecorded: string[];
  /** מתי ואיך רושמים (מועדים מפרק ד') */
  whenRecorded?: string;
  /** טעויות נפוצות שמובילות לפסילה */
  commonMistakes?: string[];
  /** מקור בהוראות */
  sectionRef: string;
}

/** רשומה במיפוי סוגי העסקים → תוספת */
export interface BusinessTypeEntry {
  label: string;
  keywords: string[];
  addendumId: AddendumId;
  /** למה סווג כך */
  reasoning?: string;
  /** הסתייגות למקרי גבול ("נגר שמייצר = יצרן, נגר שמתקן = נותן שירות") */
  caveat?: string | null;
  confidence: 'high' | 'medium';
}

/** שאלת הכרעה למי שלא מצא את העסק ברשימה */
export interface DecisionQuestion {
  question: string;
  yesAddendum?: AddendumId;
  /** אם אין תשובה חיובית לאף שאלה — נופלים לסעיף הסל (יא') */
}

export const ADDENDUM_ICONS: Record<AddendumId, string> = {
  a: '🏭', b: '📦', c: '🛒', d: '🏗️', e: '⚖️', f: '🩺', g: '🚗', h: '🏫',
  i: '🏠', j: '🚙', k: '🧰', l: '🚜', n: '⛽', o: '🛡️', p: '💎',
};

// ─── חיפוש (אותה גישה כמו מודול ההוצאות) ────────────────────────────────────

const normalize = (s: string) =>
  s.replace(/["'׳״]/g, '')
   .replace(/\s+/g, ' ')
   .trim()
   .toLowerCase();

export function searchBusinessTypes(entries: BusinessTypeEntry[], query: string): BusinessTypeEntry[] {
  const q = normalize(query);
  if (!q) return entries;
  const words = q.split(' ').filter(w => w.length >= 2).flatMap(w => {
    const v = [w];
    if (w.length >= 4 && /^[מבלכשה]/.test(w)) v.push(w.slice(1));
    return v;
  });
  const score = (e: BusinessTypeEntry, term: string): number => {
    const label = normalize(e.label);
    const kws = e.keywords.map(normalize);
    if (label === term) return 100;
    if (label.startsWith(term)) return 80;
    if (kws.some(k => k === term)) return 70;
    if (label.includes(term)) return 60;
    if (kws.some(k => k.startsWith(term) || term.startsWith(k))) return 50;
    if (kws.some(k => k.includes(term) || term.includes(k))) return 40;
    return 0;
  };
  return entries
    .map(e => ({ e, s: Math.max(score(e, q), ...words.map(w => score(e, w) * 0.9)) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.e);
}

/**
 * התאמת מדרגה אוטומטית לפי מחזור ומועסקים.
 * המדרגות מסודרות מהמחמירה לקלה — המדרגה הראשונה שתנאיה מתקיימים תופסת.
 * מחזירה null כשהתוספת דורשת הכרעה ידנית (תנאי custom — רכבים/תלמידים/תפקיד).
 */
export function matchTier(
  addendum: BookkeepingAddendum,
  turnoverILS: number | null,
  employees: number | null,
): AddendumTier | null {
  if (addendum.tiers.some(t => t.condition.custom)) return null;
  if (addendum.tiers.length === 1) return addendum.tiers[0];
  if (turnoverILS === null) return null;
  const emp = employees ?? 0;
  for (const tier of addendum.tiers) {
    const c = tier.condition;
    const turnoverAbove = c.turnoverAboveILS !== undefined && turnoverILS > c.turnoverAboveILS;
    const turnoverInRange =
      (c.turnoverAboveILS === undefined || turnoverILS > c.turnoverAboveILS) &&
      (c.turnoverUpToILS === undefined || turnoverILS <= c.turnoverUpToILS);
    const employeesEnough = c.employeesAtLeast !== undefined && emp >= c.employeesAtLeast;
    const employeesInRange =
      (c.employeesAtLeast === undefined || emp >= c.employeesAtLeast) &&
      (c.employeesAtMost === undefined || emp <= c.employeesAtMost);
    const passes = c.logic === 'or'
      ? (turnoverAbove || employeesEnough)
      : turnoverInRange && employeesInRange;
    if (passes) return tier;
  }
  return addendum.tiers[addendum.tiers.length - 1];
}

// ─── מצב העסק בקליטה: עסק חדש שהמשרד פותח · עובר מרו״ח אחר · עסק קיים בלי רו״ח ───
//
// ‼ שתי עמודות קיימות מחזיקות את העובדה, ולא נוספה שלישית:
//   business_transfer      false = עסק חדש (המשרד פותח את התיקים) · true = עסק קיים
//   has_previous_accountant true = יש רו״ח קודם (מכתב העברה, חומרים)
// «עסק קיים בלי רו״ח קודם» = עסק קיים + אין רו״ח קודם. עד 12.10.2026 לא היה אפשר
// לסמן אותו, ו«אין רו״ח קודם» נקרא כ«עסק חדש» — כך נפתחה פתיחת תיקים לעסק פתוח.
// ‼ «לא סומן» נשאר «לא סומן»: לא מסיקים «עסק חדש» מהיעדר רו״ח קודם.

export type BusinessSituation = 'new' | 'transfer' | 'existing';

export const BUSINESS_SITUATION_ORDER: BusinessSituation[] = ['new', 'transfer', 'existing'];

export const BUSINESS_SITUATION_LABELS: Record<BusinessSituation, string> = {
  new: 'עסק חדש - אנחנו פותחים',
  transfer: 'עובר מרו״ח אחר',
  existing: 'עסק קיים, בלי רו״ח קודם',
};

/** מה כל בחירה מפעילה בקליטה — שורה אחת, לאותו מסך שבו בוחרים. */
export const BUSINESS_SITUATION_HINTS: Record<BusinessSituation, string> = {
  new: 'נפתח את התיקים ברשויות. פייפרלס נפתח ללקוח מיד; רק החיבור לרשות המסים מחכה לתיקים.',
  transfer: 'מכתב העברת טיפול וחומרים מהרו״ח הקודם.',
  existing: 'בלי פתיחת תיקים ובלי מכתב העברה.',
};

export function businessSituationOf(f: { businessTransfer?: boolean | null; hasPreviousAccountant?: boolean | null }): BusinessSituation | undefined {
  if (f.businessTransfer === false) return 'new';
  if (f.hasPreviousAccountant === true) return 'transfer';
  if (f.businessTransfer === true) return 'existing';
  return undefined;
}

/** הבחירה ⇒ שני השדות. undefined = «לא סומן» (businessTransfer ריק). */
export function businessSituationFields(s: BusinessSituation | undefined): { businessTransfer: boolean | undefined; hasPreviousAccountant: boolean } {
  switch (s) {
    case 'new': return { businessTransfer: false, hasPreviousAccountant: false };
    case 'transfer': return { businessTransfer: true, hasPreviousAccountant: true };
    case 'existing': return { businessTransfer: true, hasPreviousAccountant: false };
    default: return { businessTransfer: undefined, hasPreviousAccountant: false };
  }
}

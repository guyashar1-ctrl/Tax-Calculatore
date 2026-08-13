// ─── תיק מס — הצעות שינוי ומעברים על עובדות מקצועיות ──────────────────────────
// הערך המקובל של כל עובדה נשאר על Client (השדות הקיימים). הטיפוס הזה מתאר
// רק מעברים: הצעה ממתינה, החלטה, והיסטוריה. ראה supabase/90-tax-fact-reconciliation.sql.

export type TaxFactSource = 'questionnaire' | 'manual' | 'institution_alignment' | 'import';
export type TaxFactStatus = 'pending' | 'accepted' | 'rejected';

/** מה שרואים בעמודת "לפני"/"אחרי" — לא בהכרח ערך גולמי, לפעמים תיאור אנושי. */
export interface TaxFactValue {
  display: string;
  /**
   * ב-new_value: הפאץ' שיוחל בפועל אם ההצעה תאושר. חסר = הצעה מידעית בלבד
   * (למשל "מספר ילדים השתנה" — לא ניתן ליישם אוטומטית, דורש עריכה ידנית).
   *
   * ב-old_value: תמונת מצב של הערך המקובל *באותם מפתחות* בזמן שההצעה נוצרה
   * (לא רק טקסט לתצוגה). השרת (accept_tax_fact_change) משווה אותה מול הערך
   * המקובל בפועל בזמן האישור — אם הוא כבר השתנה, האישור נדחה כ-stale_conflict
   * במקום לדרוס בשקט ערך שהתעדכן בינתיים.
   */
  patch?: Record<string, unknown>;
}

export interface TaxFactChange {
  id: string;
  userId?: string;
  clientId: string;
  fieldKey: string;
  label: string;
  oldValue?: TaxFactValue;
  newValue: TaxFactValue;
  source: TaxFactSource;
  sourceRef?: string;
  status: TaxFactStatus;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  createdAt: string;
}

export const TAX_FACT_SOURCE_LABELS: Record<TaxFactSource, string> = {
  questionnaire: 'שאלון נתוני מס',
  manual: 'עריכה ידנית',
  institution_alignment: 'יישור קו מול הרשויות',
  import: 'יבוא',
};

/** פריט להצעה — נשלח כמו שהוא ל-propose_tax_facts. */
export interface ProposedFact {
  fieldKey: string;
  label: string;
  oldValue?: TaxFactValue;
  newValue: TaxFactValue;
  note?: string;
}

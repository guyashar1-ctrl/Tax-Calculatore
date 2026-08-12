// ─── חיוב חד-פעמי — פריט כספי חד-פעמי מעבר לריטיינר ──────────────────────────
// המקור החזותי המחייב: docs/prototypes/customers-v3-production-reference.html
//
// ‼ מודל מצבים קטן בכוונה: 'pending' → 'requested' → 'paid'. "שולם" הוא
// תמיד סימון ידני של הרו"ח — אין אינטגרציית סליקה במערכת, ולכן אי אפשר
// לדעת אוטומטית שהתשלום התקבל.
//
// ‼ המקור (source) הוא ידני או הצעת מחיר מאושרת (רכיב חד-פעמי בתוכה) —
// לא רכיב חודשי/שנתי, שנשאר בריטיינר ולא מופיע כאן בכלל.

export type ChargeStatus = 'pending' | 'requested' | 'paid';

export type ChargeSourceType = 'manual' | 'quotation';

export interface AdditionalCharge {
  id: string;
  clientId: string;
  description: string;
  amount: number;
  currency: string;
  status: ChargeStatus;
  /** ISO date (YYYY-MM-DD) — חובה בהזנה ידנית חדשה; ריק בחיובים ישנים/מהצעה (אין תאריך יעד אמיתי במקור). */
  dueDate?: string;
  requestedAt?: string;
  paidAt?: string;
  sourceType: ChargeSourceType;
  sourceQuotationId?: string;
  sourceItemId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: 'טרם נשלחה דרישת תשלום',
  requested: 'ממתין לתשלום',
  paid: 'שולם',
};

/** תג התצוגה לכל מצב — כתום=טרם נשלח, כחול=ממתין ללקוח, אפור=שולם (שקט, היסטורי). */
export const CHARGE_STATUS_BADGE: Record<ChargeStatus, 'quote' | 'rep' | 'gray'> = {
  pending: 'quote',
  requested: 'rep',
  paid: 'gray',
};

/** "הפעולה הבאה" — pending ו-requested ניתנים ללחיצה; paid הוא היסטוריה בלבד. */
export const CHARGE_NEXT_ACTION: Record<ChargeStatus, string> = {
  pending: 'שלח דרישת תשלום',
  requested: 'סמן כשולם',
  paid: 'שולם',
};

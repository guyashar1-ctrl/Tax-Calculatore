// ─── חיוב נוסף — פריט כספי חד-פעמי מעבר לריטיינר ─────────────────────────────
// המקור החזותי המחייב: docs/prototypes/customers-v3-production-reference.html
//
// ‼ מודל מצבים קטן בכוונה: 'pending' → 'requested' בלבד. אין 'paid' — אין
// אינטגרציית סליקה במערכת, ולכן אי אפשר לדעת בביטחון שהתשלום התקבל.

export type ChargeStatus = 'pending' | 'requested';

export interface AdditionalCharge {
  id: string;
  clientId: string;
  description: string;
  amount: number;
  currency: string;
  status: ChargeStatus;
  requestedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: 'ממתין לתשלום',
  requested: 'דרישת תשלום נשלחה',
};

/** תג התצוגה לכל מצב — 'quote' (כתום) כמו בייחוס; 'rep' (כחול) לאחרי שליחה. */
export const CHARGE_STATUS_BADGE: Record<ChargeStatus, 'quote' | 'rep'> = {
  pending: 'quote',
  requested: 'rep',
};

/** "הפעולה הבאה" — טקסט בכרטיס. pending בלבד ניתן ללחיצה. */
export const CHARGE_NEXT_ACTION: Record<ChargeStatus, string> = {
  pending: 'שלח דרישת תשלום',
  requested: 'ממתין לתשלום מהלקוח',
};

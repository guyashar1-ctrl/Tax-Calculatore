// ─── מודול הצעות מחיר — טיפוסים ─────────────────────────────────────────────
// הזרימה: ליד → הצעת מחיר → אישור → המרה ללקוח → ייצוג (SPEC של גיא, PRD 2026-07).
// אין דחייה/בקשת שינויים מצד הלקוח — שינוי מטופל בביטול והוצאת הצעה חדשה.

// ─── לידים ──────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'quoted' | 'converted' | 'closed';

export type LeadDealerType = 'exempt' | 'licensed' | 'company' | 'other';

export interface Lead {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  businessName?: string;
  dealerType?: LeadDealerType;
  notes?: string;
  status: LeadStatus;
  convertedClientId?: string;
  // רו"ח קודם — רלוונטי רק אם הליד עובר מרו"ח אחר; מפעיל את זרימת השחרור
  hasPreviousAccountant?: boolean;
  prevAccountantName?: string;
  prevAccountantEmail?: string;
  prevAccountantPhone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'חדש',
  quoted: 'נשלחה הצעה',
  converted: 'הפך ללקוח',
  closed: 'נסגר',
};

export const LEAD_DEALER_TYPE_LABELS: Record<LeadDealerType, string> = {
  exempt: 'עוסק פטור',
  licensed: 'עוסק מורשה',
  company: 'חברה',
  other: 'אחר',
};

// ─── קטלוג שירותים ──────────────────────────────────────────────────────────

export type ServiceCategory = 'monthly' | 'annual' | 'one_time' | 'included';

export type ServiceBillingType = 'fixed' | 'per_unit';

export interface ServiceCatalogItem {
  id: string;
  name: string;
  category: ServiceCategory;
  description?: string;
  defaultPrice: number;
  vatFlag: boolean;
  billingType: ServiceBillingType;
  unitLabel?: string;
  includeByDefault: boolean;
  active: boolean;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  monthly: 'חודשי',
  annual: 'שנתי',
  one_time: 'חד־פעמי',
  included: 'כלול במחיר',
};

export const SERVICE_CATEGORY_ORDER: ServiceCategory[] = ['monthly', 'annual', 'one_time', 'included'];

// ─── תבניות הצעה ────────────────────────────────────────────────────────────

export type QuotationTemplateKind =
  | 'exempt_dealer'
  | 'licensed_dealer'
  | 'company'
  | 'tax_refund'
  | 'representation_only'
  | 'custom';

export interface QuotationTemplate {
  id: string;
  name: string;
  kind: QuotationTemplateKind;
  serviceIds: string[];
  emailSubject?: string;
  emailBody?: string;
  displayOrder: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const TEMPLATE_KIND_LABELS: Record<QuotationTemplateKind, string> = {
  exempt_dealer: 'עוסק פטור',
  licensed_dealer: 'עוסק מורשה',
  company: 'חברה',
  tax_refund: 'החזר מס',
  representation_only: 'ייצוג בלבד',
  custom: 'מותאם אישית',
};

// ─── הצעת מחיר ──────────────────────────────────────────────────────────────

export type QuotationStatus = 'draft' | 'sent' | 'viewed' | 'approved' | 'cancelled' | 'expired';

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: 'טיוטה',
  sent: 'נשלחה',
  viewed: 'נצפתה',
  approved: 'אושרה',
  cancelled: 'בוטלה',
  expired: 'פג תוקף',
};

export interface QuotationItem {
  id: string;                 // מזהה שורה בתוך ההצעה (לא מזהה קטלוג)
  serviceId?: string;         // קישור לקטלוג; ריק = שירות חד־פעמי מותאם
  name: string;
  description?: string;
  category: ServiceCategory;
  billingType: ServiceBillingType;
  unitLabel?: string;
  quantity: number;
  // שנת המס שאליה השורה מתייחסת — לדוחות שנתיים, ובמיוחד לשנים פתוחות שטרם
  // הוגשו. כל שנה היא שורה נפרדת עם מחיר ותדירות חיוב משלה.
  year?: number;
  catalogPrice: number;       // המחיר בקטלוג ברגע ההוספה — לתיעוד הנחות
  clientPrice: number;        // מחיר ליחידה אחרי דריסה ידנית (לפני הנחה)
  discountPercent?: number;
  vatFlag: boolean;
  clientNote?: string;        // מוצג ללקוח
  internalNote?: string;      // פנימי בלבד — לא נשלח ולא מודפס
}

// שירות עתידי — לא כלול בהצעה, אבל המחיר ידוע מראש כדי שהלקוח לא יופתע
// (הצהרת הון, מעבר מעוסק פטור למורשה וכו'). המחיר מוקפא יחד עם ההצעה.
export interface FutureService {
  id: string;
  serviceId?: string;        // קישור לקטלוג
  name: string;
  description?: string;
  category: ServiceCategory;
  price: number;             // מחיר לפני מע"מ, כפי שהיה בקטלוג בזמן ההצעה
  vatFlag: boolean;
  billingType: ServiceBillingType;
  unitLabel?: string;
}

export type QuotationEventType =
  | 'created'
  | 'edited'
  | 'sent'
  | 'test_email_sent'
  | 'reminder_sent'
  | 'viewed'
  | 'approved'
  | 'cancelled'
  | 'expired'
  | 'lead_converted';

export interface QuotationEvent {
  type: QuotationEventType;
  at: string;                 // ISO timestamp
  note?: string;
}

export const QUOTATION_EVENT_LABELS: Record<QuotationEventType, string> = {
  created: 'נוצרה',
  edited: 'נערכה',
  sent: 'נשלחה ללקוח',
  test_email_sent: 'נשלח מייל בדיקה',
  reminder_sent: 'נשלחה תזכורת',
  viewed: 'נצפתה על ידי הלקוח',
  approved: 'אושרה על ידי הלקוח',
  cancelled: 'בוטלה',
  expired: 'פג תוקפה',
  lead_converted: 'הליד הומר ללקוח',
};

// העתק קפוא של ההצעה ברגע השליחה — לא משתנה גם אם המחירון או הפרטים ישתנו
export interface QuotationSnapshot {
  frozenAt: string;
  quotationNumber: string;
  revision: number;
  recipientName: string;
  recipientEmail?: string;
  businessName?: string;
  items: QuotationItem[];
  futureServices?: FutureService[];
  vatRate: number;
  notesForClient?: string;
  emailSubject?: string;
  emailMessage?: string;
  firmName?: string;
}

export interface Quotation {
  id: string;
  leadId?: string;            // הצעה לליד (לקוח חדש) — או —
  clientId?: string;          // הצעה ללקוח קיים (שירות נוסף)
  quotationNumber: string;
  revision: number;
  status: QuotationStatus;
  publicToken?: string;
  items: QuotationItem[];
  futureServices: FutureService[];   // מחירון שירותים עתידיים — למניעת הפתעות
  vatRate: number;
  emailSubject?: string;
  emailMessage?: string;
  notesForClient?: string;
  internalNotes?: string;
  templateId?: string;
  expiresAt?: string;
  sentAt?: string;
  firstViewedAt?: string;
  approvedAt?: string;
  cancelledAt?: string;
  snapshot?: QuotationSnapshot;
  events: QuotationEvent[];
  // תזכורת אוטומטית לפני פקיעה (מנוהל בצד-שרת ע"י ה-cron)
  autoReminderSentAt?: string;
  autoReminderError?: string;
  autoReminderErrorAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── ברירות מחדל עסקיות ────────────────────────────────────────────────────

export const DEFAULT_VAT_RATE = 18;              // מע"מ בישראל נכון ל-2026
export const DEFAULT_EXPIRY_BUSINESS_DAYS = 3;   // תוקף הצעה — 3 ימי עסקים (החלטת גיא)
export const REMINDER_BUSINESS_DAYS_BEFORE = 1;  // תזכורת יום עסקים אחד לפני פקיעה

// ─── מודול הצעות מחיר — טיפוסים ─────────────────────────────────────────────
// הזרימה: ליד → הצעת מחיר → אישור → המרה ללקוח → ייצוג (SPEC של גיא, PRD 2026-07).
// אין דחייה/בקשת שינויים מצד הלקוח — שינוי מטופל בביטול והוצאת הצעה חדשה.

import type { AuthorityRepresentations, OnboardingPrefill } from './index';
import { REP_AUTHORITIES_WITH_LEVEL } from './index';

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
  /** איך הגיע אלינו — טקסט חופשי; שיחת ליד אינה חקירה, והשדה תמיד רשות. */
  referralSource?: string;
  /** true = העברה מרו"ח אחר, false = עסק חדש. undefined = לא נשאל. */
  businessTransfer?: boolean;
  /** מי הזין את הליד — הרו"ח (ברירת מחדל) או האדם עצמו דרך קישור ציבורי (שלב 4). */
  source?: 'accountant' | 'self_intake';
  /**
   * התאמה אפשרית ללקוח קיים — נקבעת בשרת בזמן ההגשה הציבורית ומוצגת אך ורק
   * לרו"ח המחובר (RLS על leads כבר מגביל ל-auth.uid()=user_id). המגיש
   * הציבורי לעולם לא רואה את השדות האלה ואינו יודע שהם קיימים.
   */
  matchClientId?: string;
  matchKind?: 'email';
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

// לקוח שנכנס באמצע שנה משלם פחות מ-12 תשלומים, וצריך להכריע מה זה עושה למחיר:
//   prorata  — משלם רק על החודשים שקיבל; התשלום החודשי נשאר המחיר הרגיל.
//              היתרה שלא נגבתה נמחלת בשקט — הדוח השנתי מכסה שנה שלמה, אבל
//              נגבו עליו רק ארבעה חודשים ואיש לא ידרוש את השאר.
//   full     — המחיר השנתי המלא נפרס על פחות חודשים; התשלום החודשי עולה
//              (הדוח השנתי מכסה שנה שלמה גם אם הליווי התחיל באוגוסט).
//   deferred — כמו יחסי, אבל היתרה אינה נמחלת: הריטיינר בולע את החלק היחסי,
//              והשאר נגבה במועד מאוחר (הגשת הדוח, הצהרת הון וכו'). כשהשורה
//              מגיעה ל-12 תשלומים היתרה מתאפסת מעצמה והסעיף נעלם.
//   manual   — הרו"ח קבע סכום חודשי בעצמו; המערכת לא נוגעת בו.
export type ProrationMode = 'prorata' | 'full' | 'deferred' | 'manual';

export const PRORATION_MODE_LABELS: Record<ProrationMode, string> = {
  prorata: 'יחסי — רק על החודשים שנותרו',
  full: 'פריסת המחיר השנתי המלא',
  deferred: 'יתרה לתשלום במועד מאוחר',
  manual: 'סכום חודשי שקבעתי',
};

// איך הוזן המחיר בשורה חודשית — סכום לחודש, או סכום לשנה שמתחלק לתשלומים
export type PriceBasis = 'monthly' | 'annual';

export const DEFAULT_INSTALLMENTS = 12;

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
  // "מחיר לפני הנחה" שהרו"ח קובע במפורש — העוגן שמוצג מחוק ללקוח. דורס את
  // החישוב האוטומטי מהקטלוג. ליחידה, באותה סקאלה של clientPrice (לתשלום).
  displayFullPrice?: number;
  vatFlag: boolean;
  // ─── פריסת תשלומים (רלוונטי רק לשורה חודשית) ───
  // clientPrice נשאר תמיד הסכום של תשלום בודד, גם כשמתמחרים לפי מחיר שנתי.
  // כל החישובים, המייל וה-PDF נשענים עליו — ולכן הצעות שנוצרו לפני הפריסה
  // ממשיכות לעבוד בדיוק כמו קודם, בלי המרה.
  priceBasis?: PriceBasis;
  annualPrice?: number;       // מחיר ליחידה לשנה מלאה, כשמתמחרים שנתית
  // התשלום החודשי החל מהשנה הבאה (ליחידה, לפני מע"מ, אחרי הנחה) — כשהרו"ח
  // קובע אותו במפורש. ריק = אוטומטי: שנתי ÷ 12, או המחיר הנוכחי בשורה ידנית.
  ongoingPrice?: number;
  installments?: number;      // מספר תשלומים בפועל (ברירת מחדל 12)
  billingStartMonth?: string; // 'YYYY-MM' — חודש התשלום הראשון
  prorationMode?: ProrationMode;
  // ─── יתרה לתשלום מאוחר (רלוונטי רק ל-prorationMode === 'deferred') ───
  /** מתי נגבית היתרה. טקסט חופשי, כדי שישרת גם הצהרת הון, ביקורת ותיאום מס
      ולא רק את הדוח השנתי. ריק = "עם הגשת הדוח השנתי". */
  deferredTrigger?: string;
  /** הנחה בשקלים על היתרה בלבד. אינה נוגעת במה שהתשלום החודשי כבר בלע —
      הריטיינר נשאר כפי שסוכם, ההנחה יורדת רק מהסכום שייגבה במועד.
      נשמר לתאימות לאחור ולצד-השרת; deferredChargeAmount גובר עליו. */
  deferredDiscount?: number;
  /** כמה מהיתרה ייגבה בפועל. הרו"ח מזין את התוצאה ("שישלם 600") ולא את ההנחה. */
  deferredChargeAmount?: number;
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

// ─── הייצוג שנפתח עם אישור ההצעה ────────────────────────────────────────────
// הרו"ח מגדיר את הייצוג כבר בהצעה, כי ברגע שהלקוח מאשר אין אף אחד שיגדיר אותו:
// האישור פותח את הלקוח, את בקשת הייצוג ואת החותמים — ושולח את הקישור מיד.
// זה בדיוק המידע שדיאלוג "קישור ייצוג חדש" אוסף (CreateRepresentationInput),
// מוקפא יחד עם ההצעה כדי שעריכה מאוחרת של הקטלוג לא תשנה ייצוג שכבר אושר.
export interface QuotationRepresentation {
  /** false ⇒ ההצעה היא שירות בלבד; האישור לא יפתח ייצוג. */
  enabled: boolean;
  /** רשות → סטטוס ורמת ייצוג. אותו מבנה של מרשם הייצוג בכרטיס הלקוח. */
  areas: AuthorityRepresentations;
  /** מה שהרו"ח כבר יודע. שדה שמופיע כאן לא יישאל שוב מהלקוח בקישור. */
  prefill: OnboardingPrefill;
  /** חותם שני. null ⇒ ייווצר רק אם הלקוח יצהיר בקישור שהוא נשוי. */
  spouse: { name: string; email: string; idNumber?: string } | null;
}

/**
 * מוריד ל"מייצג משני" את הרשויות שנושאות רמת ייצוג (מ"ה, ניכויים, מע"מ).
 * ביטוח לאומי הוא ייצוג יחיד ואין לו רמה — ולכן לא נוגעים בו.
 */
export function applySecondaryLevels(areas: AuthorityRepresentations): AuthorityRepresentations {
  const next: AuthorityRepresentations = { ...areas };
  for (const a of REP_AUTHORITIES_WITH_LEVEL) {
    const area = next[a];
    if (area) next[a] = { ...area, level: 'secondary' };
  }
  return next;
}

/**
 * ברירת המחדל — זהה לדיאלוג הייצוג: מ"ה, מע"מ וב"ל.
 * ‼ לקוח שעובר מרו"ח אחר נפתח כמייצג משני: הרו"ח הקודם עדיין תופס את מקום
 * המייצג הראשי ברשויות, ואי אפשר להירשם ראשי לפני שהוא משחרר אותו.
 */
export function defaultQuotationRepresentation(isTransfer = false): QuotationRepresentation {
  const areas: AuthorityRepresentations = {
    incomeTax: { status: 'in_process', level: 'primary' },
    vat: { status: 'in_process', level: 'primary' },
    nationalInsurance: { status: 'in_process' },
  };
  return {
    enabled: true,
    areas: isTransfer ? applySecondaryLevels(areas) : areas,
    prefill: {},
    spouse: null,
  };
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
  | 'lead_converted'
  | 'representation_opened'
  | 'client_precreated'
  | 'client_linked';

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
  representation_opened: 'נפתח תהליך ייצוג אוטומטית',
  client_precreated: 'נפתח כרטיס לקוח ודף אישי',
  client_linked: 'שויכה לכרטיס לקוח קיים',
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
  representation?: QuotationRepresentation;
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
  // חתימת הלקוח שניתנה באישור — PNG dataURL + שם החותם, נשמרות כראיה
  approvalSignature?: string;
  approvalSignerName?: string;
  cancelledAt?: string;
  // ─── ייצוג ───
  /** הגדרת הייצוג שתיפתח אוטומטית עם האישור. */
  representation?: QuotationRepresentation;
  /** הבקשה שנפתחה בפועל באישור. קיומה = האוטומציה רצה (ומונעת כפילות). */
  representationRequestId?: string;
  /** מתי יצא ללקוח מייל קישור הייצוג. ריק + יש בקשה ⇒ נדרשת שליחה חוזרת. */
  representationSentAt?: string;
  /** למה המייל לא יצא — כדי שהרו"ח יראה את זה ולא יגלה מהלקוח. */
  representationError?: string;
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

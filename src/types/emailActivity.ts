// מרכז התקשורת — רשומת מייל יוצא. מבנה עצמאי, ניתן לקידום למרכז תקשורת מלא.

export type EmailStatus =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'failed';

export interface EmailMessage {
  id: string;
  clientId?: string;
  requestId?: string;
  resendId?: string;
  toEmail: string;
  subject?: string;
  kind?: string;
  status: EmailStatus;
  error?: string;
  sentAt: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
  /** גוף המייל כפי שנשלח. חסר במיילים שנשלחו לפני שהשמירה נוספה. */
  html?: string;
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  sent: 'נשלח',
  delivered: 'נמסר',
  delivery_delayed: 'מתעכב',
  bounced: 'הוקפץ',
  complained: 'סומן כספאם',
  opened: 'נפתח',
  clicked: 'נלחץ',
  failed: 'נכשל',
};

// שם המייל בשפה של הרו"ח. ה-kind נשמר באנגלית ע"י פונקציות השרת, וברשימה של
// הלקוח צריך לקרוא "בקשת חתימה" ולא "sign".
export const EMAIL_KIND_LABEL: Record<string, string> = {
  onboard: 'קישור ייצוג — אימות זהות',
  onboarding: 'קישור ייצוג — אימות זהות',   // שם ישן של אותו מייל
  sign: 'בקשת חתימה על ייפוי הכוח',
  active: 'הייצוג אושר',
  intake: 'שאלון עדכון פרטים',
  intake_questionnaire: 'שאלון פתיחת תיק',
  ni_approve: 'אישור ייפוי כוח בביטוח לאומי',
  quotation: 'הצעת מחיר',
  quotation_test: 'הצעת מחיר — שליחת בדיקה',
  quotation_reminder: 'תזכורת להצעת מחיר',
  release: 'מכתב שחרור לרו״ח הקודם',
  // מיילים של שלבי הקליטה
  paperless_invite: 'הזמנה לפייפרלס',
  retainer_request: 'בקשת הרשאת תשלום',
  step_reminder: 'תזכורת קליטה',
  weekly_backup: 'גיבוי שבועי',
  // התראות פנימיות — נשלחות לרו"ח עצמו, לא ללקוח
  notify_quotation_approved: 'התראה — הצעה אושרה',
  notify_onboarding_submitted: 'התראה — מולאו פרטי ייצוג',
  notify_poa_signed: 'התראה — נחתם ייפוי כוח',
};

export const emailKindLabel = (kind?: string): string =>
  (kind && EMAIL_KIND_LABEL[kind]) || 'מייל';

/**
 * מייל שנשלח לרו״ח עצמו ולא ללקוח.
 *
 * ‼ אסור שיופיע תחת "מיילים שנשלחו ללקוח". חלק מההתראות **כן** נושאות
 * `client_id` (הן יודעות על איזה לקוח הן מדווחות), ולכן הן נכנסו לכרטיס דרך
 * ההתאמה הראשית ולא רק דרך הכתובת — הסינון הזה הוא השער היחיד שעוצר אותן.
 * מקומן ביומן המיילים של המשרד.
 */
export const isInternalEmailKind = (kind?: string): boolean =>
  !!kind && (kind.startsWith('notify_') || kind === 'weekly_backup');

// bg/fg/dot — צבעים תואמי כהה/בהיר דרך ערכים מפורשים
export const EMAIL_STATUS_STYLE: Record<EmailStatus, { bg: string; fg: string; dot: string }> = {
  sent: { bg: 'var(--chip-blue-bg)', fg: 'var(--chip-blue-tx)', dot: 'var(--br)' },
  delivered: { bg: 'var(--chip-green-bg)', fg: 'var(--chip-green-tx)', dot: 'var(--ok)' },
  delivery_delayed: { bg: 'var(--chip-amber-bg)', fg: 'var(--chip-amber-tx)', dot: 'var(--warn)' },
  opened: { bg: 'var(--chip-violet-bg)', fg: 'var(--chip-violet-tx)', dot: 'var(--info)' },
  clicked: { bg: 'var(--chip-violet-bg)', fg: 'var(--chip-violet-tx)', dot: 'var(--info)' },
  bounced: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
  complained: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
  failed: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
};

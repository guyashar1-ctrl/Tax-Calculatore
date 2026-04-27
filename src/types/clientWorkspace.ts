// ─── תוספי טיפוסים לתיק הלקוח החדש ──────────────────────────────────────
// הקובץ הזה מרחיב את Client עם פרופיל מיסוי/רגולציה מורחב, אנשי קשר נוספים,
// תיוג, הערה מוצמדת ויומן פעילות. כל השדות אופציונליים — לא שובר רשומות קיימות.

import { Client } from './index';

// ── מטא-נתונים על שדה רגולטורי ──
export type FieldSource = 'manual' | 'shaam' | 'authority' | 'import';

export interface FieldMeta {
  source?: FieldSource;
  syncedAt?: string;     // ISO
  override?: boolean;
  validUntil?: string;    // YYYY-MM-DD
}

export const FIELD_SOURCE_LABELS: Record<FieldSource, string> = {
  manual: 'ידני',
  shaam: 'שע״ם',
  authority: 'הרשות',
  import: 'יבוא',
};

// ── איש קשר נוסף (עו"ד, מנהל חשבונות, רו"ח אחר וכו') ──
export interface ClientContact {
  id: string;
  role: string;          // "עו״ד", "מנהל חשבונות"
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

// ── רשומת פעילות ──
export type ActivityKind =
  | 'note'
  | 'task_created'
  | 'task_completed'
  | 'doc_uploaded'
  | 'status_change'
  | 'manual';

export interface ActivityEntry {
  id: string;
  at: string;             // ISO
  kind: ActivityKind;
  text: string;
  refId?: string;
  authorName?: string;
}

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  note: 'הערה',
  task_created: 'משימה חדשה',
  task_completed: 'משימה הושלמה',
  doc_uploaded: 'מסמך חדש',
  status_change: 'שינוי סטטוס',
  manual: 'רישום ידני',
};

export const ACTIVITY_ICON: Record<ActivityKind, string> = {
  note: '📝',
  task_created: '➕',
  task_completed: '✅',
  doc_uploaded: '📎',
  status_change: '🔄',
  manual: '🗒',
};

// ── פרופיל מיסוי וביטוח לאומי מורחב ──
export type VATFrequency = 'monthly' | 'bi_monthly';
export type VATFrequencySource = VATFrequency | 'unknown';

export type WithholdingFrequency = 'monthly' | 'bi_monthly' | 'none';

export type ShaamStatus = 'active' | 'inactive' | 'pending' | 'unknown';
export type BookStatus = 'kosher' | 'rejected' | 'unknown';

export const VAT_FREQ_LABELS: Record<VATFrequency, string> = {
  monthly: 'חד-חודשי',
  bi_monthly: 'דו-חודשי',
};

export const SHAAM_STATUS_LABELS: Record<ShaamStatus, string> = {
  active: 'פעיל',
  inactive: 'לא פעיל',
  pending: 'בטיפול',
  unknown: 'לא ידוע',
};

export const SHAAM_STATUS_BADGE: Record<ShaamStatus, string> = {
  active: 'badge-green',
  inactive: 'badge-red',
  pending: 'badge-orange',
  unknown: 'badge-gray',
};

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  kosher: 'ספרים תקינים',
  rejected: 'ספרים נפסלו',
  unknown: 'לא ידוע',
};

// ── כל ההרחבות שמתווספות ל-Client ──
export interface ClientWorkspaceExtensions {
  // שירות
  assignedAccountantId?: string;
  tags?: string[];
  pinnedNote?: string;
  additionalContacts?: ClientContact[];

  // מע"מ
  vatFrequency?: VATFrequency;
  vatDetailedReport?: boolean;
  vatDetailedReportStartDate?: string;

  // מס הכנסה — מקדמות
  pitAdvancePercent?: number;
  pitAdvanceFrequency?: VATFrequency;

  // ניכויים
  withholdingFrequency?: WithholdingFrequency;
  withholdingRate?: number;
  withholdingValidUntil?: string;
  bookStatus?: BookStatus;

  // ביטוח לאומי
  niAdvanceMonthly?: number;

  // שע"ם
  shaamStatus?: ShaamStatus;
  shaamCreatedAt?: string;
  shaamLastUsed?: string;
  shaamSource?: FieldSource;

  // משרדים
  taxOfficeName?: string;
  withholdingOfficeName?: string;
  niBranchName?: string;

  // פרופיל שנתי
  hasWealthDeclaration?: boolean;
  lastWealthDeclarationYear?: number;

  // מטא-נתונים על שדות רגולטוריים (לפי שם השדה)
  fieldMeta?: Record<string, FieldMeta>;

  // יומן פעילות
  activity?: ActivityEntry[];
}

// ── טיפוס משולב נוח ──
export type ClientExt = Client & ClientWorkspaceExtensions;

// ── עובד במשרד ──
export interface Employee {
  id: string;
  name: string;
  role: string;          // "רו״ח", "מנהל חשבונות", "מתמחה"
  initials: string;
  color: string;          // hex לאווטאר
}

// ── התראה מחושבת על לקוח ──
export type AlertKind =
  | 'upcoming_debt'
  | 'missing_docs'
  | 'open_tasks'
  | 'withholding_expired'
  | 'shaam_inactive'
  | 'book_rejected';

export interface ClientAlert {
  kind: AlertKind;
  level: 'info' | 'warning' | 'danger';
  text: string;
  count?: number;
}

export const ALERT_LABELS: Record<AlertKind, string> = {
  upcoming_debt: 'חוב קרוב',
  missing_docs: 'מסמכים חסרים',
  open_tasks: 'משימות פתוחות',
  withholding_expired: 'ניכוי פג תוקף',
  shaam_inactive: 'שע״ם לא פעיל',
  book_rejected: 'ספרים נפסלו',
};

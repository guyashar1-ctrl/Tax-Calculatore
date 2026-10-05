// ─── «צפייה» בבקשה — החוזה מול השרת (preview_request_sample, מיגרציה 222) ─────
// ‼ אין כאן טקסט שהלקוח רואה: רק בחירת מצבים (מצב הבקשה, אדם, רגע בתהליך) ומפתחות. התוכן עצמו נבנה בשרת
// באותו קוד של הדף האמיתי (_portal_step_items) — ראה supabase/222-request-preview.sql.

import type { PortalData } from '../../components/PublicPortalPage';

export type PreviewRef =
  | { kind: 'template'; templateId: string }
  | { kind: 'document'; docId: string }
  | { kind: 'system'; stepType: string };

export type PreviewStepStatus =
  | 'pending' | 'in_progress' | 'waiting_client' | 'blocked' | 'completed' | 'verified' | 'skipped' | 'locked';

export type PreviewRepStatus =
  | 'pending_fill' | 'pending_signature' | 'awaiting_accountant' | 'awaiting_stamp' | 'awaiting_authorities' | 'active';

/** דוגמה אחת = שלב אחד בדף הלקוח הווירטואלי. ref ⇒ מהספרייה; בלי ref — payload שנבנה בנתיב היצירה בדפדפן. */
export interface PreviewSample {
  key: string;
  ref?: PreviewRef | null;
  /** רק כש-ref ריק. */
  stepType?: string;
  payload?: Record<string, unknown>;
  owner?: 'client' | 'me' | 'external';
  /** קלטי בונה ה-payload של סוג מערכת (checklist · needsDetails · paperlessStatus · amount…). */
  inputs?: Record<string, unknown>;
  /** מסלול שחוזר (שנתי/ידני) — «מסמכים מהלקוח» נוצרת כבקשה רגילה עם שדות קובץ. */
  repeatable?: boolean;
  status?: PreviewStepStatus;
  ball?: string;
  /** שדות שמתמזגים על ה-payload (למשל clientDeclaredAt אחרי «אישרתי»). */
  patch?: Record<string, unknown>;
  /** «התקבל חלק»: N הראשונים ברשימת המסמכים/הדרישות שבבקשה — מסומנים. */
  markDone?: number;
  /** «בהמשך»: שמות הבקשות שהיא נפתחת אחריהן — קלט, כמו שם הלקוח. */
  lockAfter?: string[];
  /** אישור הייצוג: שע״ם דורשת (אותו קוד של shaam_require_client_approval). */
  required?: boolean;
}

export interface PreviewPersona {
  couple?: boolean;
  /** פרטי הרו״ח הקודם ידועים בכרטיס — מילוי מראש לאישור. */
  prevKnown?: boolean;
}

export interface PreviewRep {
  status?: PreviewRepStatus;
  spousePending?: boolean;
  signed?: boolean;
  niReference?: boolean;
  approvals?: 'single' | 'couple' | 'none';
  awaiting?: 'client' | 'spouse' | 'both';
}

export interface PreviewRequest {
  samples: PreviewSample[];
  persona?: PreviewPersona;
  rep?: PreviewRep;
}

export interface PreviewSpec {
  key: string;
  ok: boolean;
  /** למה הבקשה לא תיווצר כמו שהיא (library_item_missing · not_repeatable · not_creatable · bad_variant …). */
  reason?: string;
  stepType?: string;
  title?: string | null;
  owner?: string | null;
  /** משימה של המשרד — לא מופיעה ללקוח. */
  internal?: boolean;
  /** מפתחות הפריטים שנוצרו מהדוגמה הזאת בדף. */
  itemKeys?: string[];
}

export type PreviewData = PortalData & { sample: true; specs: PreviewSpec[] };

export type PreviewLoad =
  | { ok: true; data: PreviewData }
  | { ok: false; error: string; message: string };

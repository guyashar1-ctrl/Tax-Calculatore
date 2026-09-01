// ─── יסוד האוטומציה — משימות דטרמיניסטיות שרצות מול רשות ממשלתית ────────────
// כללי ואינו ספציפי לשע״ם: כל בדיקה/פעולה עתידית (שע״ם, ב״ל, ...) עוברת דרך
// אותו מודל. ראה supabase/150-automation-jobs.sql לסמנטיקה המלאה,
// docs/PIVO-AUTOMATION-FOUNDATION.html לארכיטקטורה.

export type AutomationJobStatus =
  | 'queued' | 'running' | 'needs_human' | 'succeeded' | 'failed' | 'cancelled';

export interface AutomationJob {
  id: string;
  userId: string;
  clientId: string;
  actionType: string;
  input: Record<string, unknown>;

  status: AutomationJobStatus;
  claimedBy?: string;
  claimedAt?: string;
  leaseUntil?: string;
  attempts: number;
  maxAttempts: number;

  result?: Record<string, unknown>;
  artifacts: Record<string, unknown>[];
  errorCode?: string;
  errorDetail?: string;
  needsHuman?: string;

  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

/** מצבים "פתוחים" — עוד לא הגיעו לתוצאה סופית. */
export const OPEN_AUTOMATION_STATUSES: ReadonlySet<AutomationJobStatus> =
  new Set(['queued', 'running', 'needs_human']);

export const AUTOMATION_JOB_STATUS_LABELS: Record<AutomationJobStatus, string> = {
  queued: 'בתור',
  running: 'רץ',
  needs_human: 'דרוש אישור',
  succeeded: 'הושלם',
  failed: 'נכשל',
  cancelled: 'בוטל',
};

/** נוכחות עובד — heartbeat/last-seen, כדי להבחין "רץ" מ"המחשב כבוי". */
export interface AutomationWorker {
  workerId: string;
  userId: string;
  version?: string;
  lastSeenAt: string;
  /** מצב חיבור לרשויות. דגלים בלבד — אין ולא יהיה כאן מידע אימות. */
  status?: AutomationWorkerStatus;
}

export interface AuthorityConnection {
  connected: boolean;
  checkedAt?: string;
}

/**
 * ‼ שתי שכבות אימות נפרדות, ו"ירוק" פירושו ששתיהן מוכנות:
 *   shaam — פורטל שע״ם (כרטיס חכם + PIN)
 *   gmf   — מערכת גביית מס הכנסה (שם משתמש וסיסמה משלה)
 * ירוק שמסתמך רק על הראשונה היה שולח כל אוטומציה היישר לקיר סיסמה.
 */
export interface AutomationWorkerStatus {
  shaam?: AuthorityConnection;
  gmf?: { ready: boolean; checkedAt?: string };
  vat?: { ready: boolean; checkedAt?: string };
  nikui?: { ready: boolean; checkedAt?: string };
  btl?: AuthorityConnection;
}

/** הרשויות שמוצגות בכותרת. btl עדיין ללא פונקציונליות — תצוגה בלבד. */
export type AuthorityKey = 'shaam' | 'btl';

export const AUTHORITY_LABELS: Record<AuthorityKey, string> = {
  shaam: 'שע״ם',
  btl: 'ביטוח לאומי',
};

/** מעל זה — העובד המקומי נחשב כבוי, וכל מצב חיבור שדיווח כבר לא רלוונטי. */
export const WORKER_STALE_AFTER_MS = 90_000;

// ── פעולת הפיתוח היחידה של אבן דרך 1 — לא לבלבל עם פעולה אמיתית ─────────────
// ‼ שם עם קידומת dev. כדי שלעולם לא יתבלבל עם action_type אמיתי (למשל
// shaam.withholding_certificate) — לא ב-UI ולא בלוגים.
export const DEV_STUB_ACTION_TYPE = 'dev.test_automation';

// ── תשתית שע״ם: primitives דטרמיניסטיים, אחד לכל כפתור ──────────────────────
// כל אחד מוכיח יכולת אחת בלבד ולא מנחש את מה שאחריה. ראה worker/src/handlers/.
// שם הפעולה בכוונה כללי (shaam.*), לא shaam.open_income_tax_file — עוד לא
// ידוע אם/איך primitives אלה יורכבו לפעולת מוצר אחת.
/** שלב 1 — יש דפדפן שמיש, ושע״ם מגיב (בלי לשפוט אימות). */
export const SHAAM_DETECT_ACTION_TYPE = 'shaam.detect';
/** שלב 2 — מאומת/לא-מאומת, דטרמיניסטית. לא-מאומת ⇒ needs_human, לעולם לא ניסיון עקיפה. */
export const SHAAM_CHECK_AUTH_ACTION_TYPE = 'shaam.check_auth';
/** כפתור "התחברות" בכותרת — פותח את חלון שע״ם. האימות עצמו נשאר אצל הרו"ח. */
export const SHAAM_CONNECT_ACTION_TYPE = 'shaam.connect';
/** כפתור "התנתקות" בכותרת — סוגר את חלון שע״ם הייעודי. */
export const SHAAM_DISCONNECT_ACTION_TYPE = 'shaam.disconnect';
/** «פתח מס הכנסה» — ניווט למערכת גביית מס הכנסה מתוך סשן מאומת. */
export const SHAAM_OPEN_INCOME_TAX_ACTION_TYPE = 'shaam.open_income_tax';
/** «פתח פרטי תיק» — שאילתה 181 ב-GMF עבור מספר תיק שמגיע מ-PIVO. */
export const SHAAM_OPEN_CLIENT_FILE_ACTION_TYPE = 'shaam.open_client_file';

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
}

// ── פעולת הפיתוח היחידה של אבן דרך 1 — לא לבלבל עם פעולה אמיתית ─────────────
// ‼ שם עם קידומת dev. כדי שלעולם לא יתבלבל עם action_type אמיתי (למשל
// shaam.withholding_certificate) — לא ב-UI ולא בלוגים.
export const DEV_STUB_ACTION_TYPE = 'dev.test_automation';

// ‼ אבן הדרך הראשונה מוכיחה את הצנרת בלבד, לא בדיקת שע״ם אמיתית. הפעולה
// שאליה זה מכוון בעתיד — לתצוגה בלבד, עדיין לא הפעולה שרצה בפועל.
export const WITHHOLDING_CERTIFICATE_ACTION_TYPE = 'shaam.withholding_certificate';

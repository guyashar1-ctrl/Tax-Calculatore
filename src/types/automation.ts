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

  /** 168: התקדמות עמידה לפי capability — ראה CapabilityEvidence. */
  progress?: JobProgress;
  /** 168: מונה CAS — worker כותב progress רק כשהוא מחזיק את הגרסה האחרונה. */
  revision?: number;
  /** 168: דגל שהדפדפן מרים כשמבטלים job שכבר running; ה-worker בודק בין capabilities. */
  cancelRequested?: boolean;

  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

/**
 * ‼ פרק 16 §16.4 — תשעה מצבים לכל capability, לא boolean ready/לא-ready:
 * "ready" בלבד לא מבחין בין "עוד לא נבדק", "מתעכב אצל הרשות", "דורש אותך"
 * ו"דילגת עליו". ה-UI צריך את ההבדל כדי לתאר partial readiness באמת.
 */
export type CapabilityState =
  | 'unknown' | 'checking' | 'waiting_external' | 'ready'
  | 'human_required' | 'stale' | 'expired' | 'unavailable' | 'deferred';

export interface CapabilityEvidence {
  state: CapabilityState;
  reasonCode?: string;
  observedAt?: string;
  evidenceKind?: string;
}

export interface JobProgress {
  capabilities?: Record<string, CapabilityEvidence>;
  challenges?: unknown[];
  /**
   * 196: **הסימן שהמשימה כבר נגעה במערכת חיצונית.** נכתב ע"י העובד
   * מיד **לפני** האינטראקציה הראשונה, ולא אחריה — ולכן קריסה בדיוק שם
   * משאירה אותו דלוק, וזה מה שמבדיל «נכשל לפני שנגענו» מ«לא ידוע אם נקלט».
   * ‼ התשתית (claim_next_automation_job / cancel_automation_job) קוראת אותו
   * כדי לסרב לניסיון חוזר אוטומטי על פעולה משנה.
   */
  externalAttempt?: { at: string; stage?: string };
  /** השלב שהמשימה הגיעה אליו, לאבחון. */
  stage?: string;
  /** מזהה חיצוני שנתפס תוך כדי, כדי שלא יאבד בקריסה. */
  requestNumber?: string;
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
  /**
   * ‼ bootstrapped (16.09.2026): החיבור **הטרי** הזה עבר גם את שער GMF.
   * דגל מחזור-חיים שהצופה מאפס כשהחלון נסגר/הסשן פג — לא מדידה עם שעון.
   * הירוק בכותרת נגזר ממנו, לא מ-gmf.ready (שיש לו התיישנות משלו).
   */
  shaam?: AuthorityConnection & { bootstrapped?: boolean };
  gmf?: { ready: boolean; checkedAt?: string };
  vat?: { ready: boolean; checkedAt?: string };
  nikui?: { ready: boolean; checkedAt?: string };
  /** 168: מערכת רישום ייצוג — סשן נפרד לגמרי, לא נגזר מ-shaam/gmf/vat/nikui. */
  representation?: { ready: boolean; checkedAt?: string };
  btl?: AuthorityConnection;
}

/** הרשויות שמוצגות בכותרת. לכל אחת חלון ייעודי משלה ונורית עצמאית. */
export type AuthorityKey = 'shaam' | 'btl';

export const AUTHORITY_LABELS: Record<AuthorityKey, string> = {
  shaam: 'שע״ם',
  btl: 'ביטוח לאומי',
};

/** מעל זה — העובד המקומי נחשב כבוי, וכל מצב חיבור שדיווח כבר לא רלוונטי. */
export const WORKER_STALE_AFTER_MS = 90_000;

/**
 * ‼ מעל זה — מדידה ישירה **של שכבת GMF/מע״מ/מגן** (checkedAt) נחשבת ישנה
 * מכדי לסמוך עליה, גם אם ready=true. "לא נמדד לאחרונה" הוא "לא ידוע",
 * ו"לא ידוע" אינו מוכן — בדיוק כמו פעימת הלב של העובד למעלה.
 *
 * ‼ למה 10 דקות ולא פחות: כשהפורטל אינו מוכן, הצופה (connectionMonitor)
 * אסור לו לנווט כדי לרענן שכבה — זה היה מפריע לרו"ח שעומד על מסך עבודה,
 * ובכל מקרה ינחת על מסך הפורטל ולא ילמד כלום. המדידה היחידה האפשרית
 * במצב הזה היא קריאה חינמית מהלשונית הפתוחה, בקצב הבדיקה הרגיל
 * (LOCAL_CHECK_MS=30s ב-connectionMonitor.mjs). 10 דקות משאירות מרווח
 * נדיב לעבודה רציפה על אותו מסך בזמן שהפורטל מתאושש, בלי להישאר "מוכן"
 * שעות אחרי שהמצב האמיתי כבר לא ידוע — אותו סף בדיוק כמו התיישנות הודעת
 * כשל של משימה בכרטיס הרשות (JOB_ERROR_MAX_AGE_MS ב-authorityAutomation.ts),
 * מאותה משפחת החלטות.
 */
export const SUBSYSTEM_STALE_AFTER_MS = 10 * 60_000;

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
/** «קרא משע״ם» — שאילתה 134, שדות ראש התיק במס הכנסה. */
export const SHAAM_SYNC_INCOME_TAX_ACTION_TYPE = 'shaam.sync_income_tax_file';
/** «עדכן נתונים מביטוח לאומי» — קריאת תיק המבוטח לכל אדם (קריאה בלבד). */
export const BTL_SYNC_FILE_ACTION_TYPE = 'btl.sync_file';
/** 168: שחזור נקודתי — "הכן רק capability X", לא warm-up מלא. ראה פרק 16 §16.1. */
export const SHAAM_ENSURE_CAPABILITY_ACTION_TYPE = 'shaam.ensure_capability';

// ── מערכת רישום ייצוג בשע״ם — שלוש הפעולות של מחזור חיי הבקשה ───────────────
// ‼ שלוש פעולות ולא אחת, כי הן נפרדות בזמן ובאחריות: הראשונה פותחת בקשה
// ומביאה את הטופס, השנייה משדרת את הטופס **אחרי** שהוחתם אצלנו, והשלישית
// רק קוראת מצב. ניסיון חוזר של כל אחת מהן מתחיל מאותה נקודה בדיוק (194).
// ‼ המפתח לכל השלוש הוא `submissionKey` (`person:client`) — בשע״ם נכנסים
// עם ת.ז. אחת, ולכן «הגשה» היא אדם ולא רשות.
/**
 * «הזן את הפרטים בשע״ם» — אימות ישות → בקשות ייפוי כוח → פרטי התקשרות,
 * ואז הורדת טופס 2279 שנוצר ושמירתו בתיק הלקוח.
 * ‼ input: `{ submissionKey, role, systems[], fileNumbers{}, person{}, ... }`.
 * התוצאה נכתבת ל-`representation_requests.execution.shaam` בטריגר (194).
 */
export const SHAAM_CREATE_REPRESENTATION_ACTION_TYPE = 'shaam.create_representation';
/**
 * «שלח טופס חתום לשע״ם» — טעינת מסמכים → «טופס ייפוי כוח» → העלאה → המשך.
 * ‼ `submittedAt` נכתב **רק** כשהמסך אישר קליטה. לחיצה אינה ראיה.
 */
export const SHAAM_SUBMIT_POA_ACTION_TYPE = 'shaam.submit_poa';
/**
 * «בדוק קבלת הייצוג» — קריאת «מצב בקשה» ו«מצב מערך» מרשימת הבקשות, לפי
 * מספר הבקשה שנשמר. ‼ פעולה קוראת בלבד: אינה יוצרת, אינה משדרת.
 */
export const SHAAM_CHECK_REPRESENTATION_ACTION_TYPE = 'shaam.check_representation';

/** 168: רשימת ברירת המחדל של warm-up — ניתנת להגדרה ב-profiles.settings.shaamWarmup. */
export const SHAAM_WARMUP_CAPABILITIES = ['gmf', 'vat', 'nikui', 'representation'] as const;
export type ShaamWarmupCapability = typeof SHAAM_WARMUP_CAPABILITIES[number];

export const SHAAM_WARMUP_CAPABILITY_LABELS: Record<ShaamWarmupCapability, string> = {
  gmf: 'מערכת גביית מס הכנסה',
  vat: 'מע״מ',
  nikui: 'מגן (ניכויים)',
  representation: 'רישום ייצוג',
};

// ── ביטוח לאומי: «מערכת ייצוג לקוחות» ──────────────────────────────────────
// ‼ רשות נפרדת לחלוטין משע״ם — חלון Chrome ייעודי משלה, סשן משלה, ונורית
// משלה. אימות: ת.ז. + קוד משתמש + סיסמה + קוד חד-פעמי לנייד, וכולו מוזן
// ידנית על ידי הרו"ח. שע״ם וב״ל לא מושפעות זו מזו בשום מצב.
/** כפתור «ביטוח לאומי» בכותרת — פותח את חלון מערכת הייצוג. */
export const BTL_CONNECT_ACTION_TYPE = 'btl.connect';
/** לחיצה כשמחובר — סוגרת את חלון ביטוח לאומי הייעודי. */
export const BTL_DISCONNECT_ACTION_TYPE = 'btl.disconnect';
/**
 * "הזן ייפוי כוח בביטוח לאומי" — לאדם אחד (154): מיוצגים → ייפוי כוח →
 * הוספת ייפוי כוח מבוטח. ‼ input: `{ role, idNumber, firstName, lastName,
 * birthYear }`. תוצאה מוצלחת נכתבת ל-`representation_requests.execution`
 * בטריגר בשרת (187) — לא בדפדפן. ראה worker/src/handlers/btlCreateRepresentation.mjs.
 */
export const BTL_CREATE_REPRESENTATION_ACTION_TYPE = 'btl.create_representation';
/**
 * "בדוק קבלת הייצוג" — מסך «מעקב ייפוי כוח» בב"ל, לפי אסמכתא + ת.ז.
 * ‼ input: `{ role, idNumber, referenceNumber }`. תוצאה `{status:
 * 'approved'|'pending'|'unknown', ...}` — 'approved' בלבד מסמן פעיל,
 * בטריגר בשרת (187). ראה worker/src/handlers/btlCheckRepresentation.mjs.
 */
export const BTL_CHECK_REPRESENTATION_ACTION_TYPE = 'btl.check_representation';

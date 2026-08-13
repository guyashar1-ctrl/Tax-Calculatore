// ─── קליטת לקוח — התקשרות, שלבים ויומן ─────────────────────────────────────
// התקשרות = הצעת מחיר שאושרה. השלבים שלה נגזרים ממה שנמכר, ולא נשאלים בטופס.
//
// ‼ סטטוס של שלב משתנה אך ורק דרך advance_onboarding_step בשרת — שם נאכפת
// התלות הקשיחה "חיבור פייפרלס לפני הרשאת תשלום" (ראה supabase/31-onboarding-engine.sql).

export type EngagementStatus = 'onboarding' | 'active' | 'ended' | 'cancelled';

export interface Engagement {
  id: string;
  userId?: string;
  clientId: string;
  quotationId?: string;
  status: EngagementStatus;
  monthlyTotal?: number;
  billingStartMonth?: string;   // 'YYYY-MM'
  approvedAt?: string;
  activatedAt?: string;
  /** מתי התהליך נפתח ללקוח בבונה. ריק ⇒ הלקוח רואה רק את ייפוי הכוח. */
  processPublishedAt?: string;
  endedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  onboarding: 'בקליטה',
  active: 'פעילה',
  ended: 'הסתיימה',
  cancelled: 'בוטלה',
};

export type OnboardingStepType =
  | 'representation'
  // נפתח אוטומטית כשקיים ייצוג ברמת "משני", ונסגר מעצמו כשלא נותר אף אחד כזה.
  | 'representation_upgrade'
  | 'file_opening'
  | 'release_letter'
  | 'materials_received'
  | 'paperless_invite'
  | 'paperless_connection'
  | 'data_import'
  | 'data_verification'
  | 'retainer_authorization'
  | 'internal_setup'
  | 'kyc_identification'
  | 'first_month_review'
  | 'intake_questionnaire'
  | 'client_documents'
  | 'prev_accountant_details'
  // בקשה שהרו"ח הרכיב בעצמו. מה נדרש מהלקוח נקבע ב-payload.requirements.
  | 'custom_request'
  // ‼ M2 — יכולת אחת בשלושה הקשרי מחזור-חיים (קליטה חדשה / הקמת תיק במערכת /
  // יישור קו מחדש אצל לקוח פעיל). ערך ייעודי לכל מוסד ולא 'institution_alignment'
  // משותף+key, כדי שאינדקס הייחודיות (client_id,step_type) ימשיך לעבוד בלי שינוי.
  | 'institution_alignment_btl'
  | 'institution_alignment_vat'
  | 'institution_alignment_income'
  // תלוי בשלושת המוסדות (multi-parent) — לקליטה חדשה בלבד.
  | 'opening_call';

export const STEP_TYPE_LABELS: Record<OnboardingStepType, string> = {
  representation: 'ייצוג מול הרשויות',
  representation_upgrade: 'שדרוג לייצוג ראשי',
  file_opening: 'פתיחת תיקים ברשויות',
  release_letter: 'מכתב שחרור לרו״ח הקודם',
  materials_received: 'קבלת חומרים מהרו״ח הקודם',
  paperless_invite: 'הזמנה לפייפרלס',
  paperless_connection: 'חיבור לפייפרלס',
  data_import: 'ייבוא היסטוריה',
  data_verification: 'אימות הנתונים',
  retainer_authorization: 'הרשאה לתשלום חודשי',
  internal_setup: 'הקמה פנימית',
  kyc_identification: 'הכרת הלקוח',
  first_month_review: 'ביקורת חודש ראשון',
  intake_questionnaire: 'שאלון פתיחת תיק',
  client_documents: 'מסמכים מהלקוח',
  prev_accountant_details: 'פרטי הרו״ח הקודם',
  custom_request: 'בקשה מהמשרד',
  institution_alignment_btl: 'יישור קו · ביטוח לאומי',
  institution_alignment_vat: 'יישור קו · מע״מ',
  institution_alignment_income: 'יישור קו · מס הכנסה',
  opening_call: 'שיחת פתיחה',
};

/** שלושת שלבי המוסדות, בסדר התצוגה המאושר (מוקאפ v3-final2). */
export const INSTITUTION_STEP_TYPES: OnboardingStepType[] = [
  'institution_alignment_btl', 'institution_alignment_vat', 'institution_alignment_income',
];

export type InstitutionKey = 'btl' | 'vat' | 'income';

export const INSTITUTION_STEP_TYPE_TO_KEY: Record<string, InstitutionKey> = {
  institution_alignment_btl: 'btl',
  institution_alignment_vat: 'vat',
  institution_alignment_income: 'income',
};

export const INSTITUTION_NAMES: Record<InstitutionKey, string> = {
  btl: 'ביטוח לאומי', vat: 'מע״מ', income: 'מס הכנסה',
};

export type OnboardingTrack =
  | 'authorities'
  | 'prev_accountant'
  | 'tools'
  | 'payment'
  | 'internal'
  | 'review'
  | 'custom';

export const TRACK_LABELS: Record<OnboardingTrack, string> = {
  authorities: 'רשויות',
  prev_accountant: 'רו״ח קודם',
  tools: 'כלים וחומרים',
  payment: 'תשלום',
  internal: 'הקמה פנימית',
  review: 'מעקב',
  custom: 'בקשות נוספות',
};

export const TRACK_ORDER: OnboardingTrack[] = [
  'authorities', 'prev_accountant', 'tools', 'payment', 'custom', 'internal', 'review',
];

export type OnboardingStepStatus =
  | 'locked' | 'pending' | 'in_progress' | 'waiting_client'
  | 'completed' | 'verified' | 'skipped' | 'blocked' | 'failed' | 'cancelled';

export const STEP_STATUS_LABELS: Record<OnboardingStepStatus, string> = {
  locked: 'נעול',
  pending: 'ממתין',
  in_progress: 'בטיפול',
  waiting_client: 'ממתין ללקוח',
  completed: 'הושלם',
  verified: 'אומת',
  skipped: 'דולג',
  blocked: 'חסום',
  failed: 'נכשל',
  cancelled: 'בוטל',
};

export type StepTone = 'ok' | 'warn' | 'err' | 'muted';

export const STEP_STATUS_TONE: Record<OnboardingStepStatus, StepTone> = {
  locked: 'muted',
  pending: 'warn',
  in_progress: 'warn',
  waiting_client: 'muted',
  completed: 'ok',
  verified: 'ok',
  skipped: 'muted',
  blocked: 'err',
  failed: 'err',
  cancelled: 'muted',
};

export type OnboardingBall = 'me' | 'client' | 'authority' | 'prev_accountant' | 'system' | 'external';

export const STEP_BALL_LABELS: Record<OnboardingBall, string> = {
  me: 'אצלי',
  client: 'אצל הלקוח',
  authority: 'אצל הרשות',
  prev_accountant: 'אצל הרו״ח הקודם',
  system: 'אוטומטי',
  external: 'אצל גורם חיצוני',
};

export type StepCompletionMethod = 'manual' | 'auto' | 'system';

/** פריט ברשימת סימון של שלב (קבלת חומרים, הקמה פנימית). */
export interface StepChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** נכתב כשהפריט נסגר בהעלאת קובץ מדף ציבורי — ולא בסימון ידני. */
  documentId?: string;
  doneAt?: string;
}

/** מה נדרש מהלקוח בבקשה חופשית. שילובים מותרים באותה בקשה.
 *  ‼ אלה שדות בתוך בקשה אחת — לעולם לא משימות נפרדות (מרכז התיק, 6+7). */
export type CustomRequirementKind =
  | 'confirm' | 'text' | 'email' | 'phone' | 'number' | 'date'
  | 'select' | 'file' | 'files';

export const REQUIREMENT_KIND_LABELS: Record<CustomRequirementKind, string> = {
  confirm: 'לקרוא ולאשר',
  text: 'לענות בטקסט',
  email: 'אימייל',
  phone: 'טלפון',
  number: 'מספר',
  date: 'תאריך',
  select: 'בחירה מרשימה',
  file: 'להעלות קובץ',
  files: 'להעלות כמה קבצים',
};

export interface CustomRequirement {
  key: string;
  kind: CustomRequirementKind;
  label: string;
  done: boolean;
  /**
   * חובה ⇒ חוסם את השלמת הבקשה; רשות ⇒ לא חוסם לעולם (הכרעת גיא, 6+7).
   * היעדר השדה = חובה — כל הדרישות שנוצרו לפני השדה הזה היו חוסמות.
   */
  required?: boolean;
  /** תשובת הלקוח (text/email/phone/number/date/select). */
  value?: string;
  /** אפשרויות הבחירה (kind='select'). */
  options?: string[];
  /** תקרת קבצים (kind='files'). היעדר = בלי תקרה. */
  maxFiles?: number;
  /** המסמך שנוצר בהעלאה (kind='file'). */
  documentId?: string;
  /** המסמכים שהצטברו (kind='files'). */
  documentIds?: string[];
  doneAt?: string;
}

/** הדרישה חוסמת השלמה? היעדר required = חובה (תאימות לאחור). */
export function isRequirementRequired(r: Pick<CustomRequirement, 'required'>): boolean {
  return r.required !== false;
}

/** מי הגורם החיצוני של משימת-חוץ, ומאיפה פרטי הקשר שלו.
 *  ‼ מוכנות פרטי הקשר היא דרישת-מערכת, לא תלות-משימה: אי אפשר "להסיר" אותה
 *  כמו צ'יפ תלות — בלי אימייל אין למי לשלוח (הכרעת גיא, מרכז התיק). */
export interface ExternalPartyConfig {
  kind: 'prev_accountant' | 'other';
  /** ל-kind='other' — פרטים שהוזנו ידנית. */
  contact?: { name?: string; email?: string; phone?: string };
}

export interface StepPayload {
  /**
   * שם הבקשה כפי שהרו״ח נתן לה. עד כה השדה הזה נכתב ונקרא בלי שהוגדר
   * בחוזה, ובקשה ששמה נשמר במקום אחר "נעלמה" והוצגה בשם הגנרי של הסוג
   * («בקשה מהמשרד»). בקשה שאיבדה את שמה היא בקשה שאי אפשר לזהות ברשימה.
   */
  title?: string;
  checklist?: StepChecklistItem[];
  /** בקשה חופשית בלבד — הדרישות שהרו״ח הרכיב. */
  requirements?: CustomRequirement[];
  /**
   * מכתב השחרור: הנוסח שנשלח, והטוקן של דף הרו״ח הקודם (?release=).
   * הרו״ח הקודם חותם ומעלה שם את החומרים — הלקוח מכותב בלבד ואינו חותם.
   */
  releaseToken?: string;
  releaseSubject?: string;
  releaseBody?: string;
  releaseSentAt?: string;
  objectionDueDate?: string;
  prevAccountantSignature?: string;
  prevAccountantSignedAt?: string;
  prevAccountantSignerName?: string;
  paperlessStatus?: string;
  dataSource?: string;
  softwareName?: string;
  amount?: number;
  billingStartMonth?: string;
  authUrl?: string;
  providerRef?: string;
  /** מפתחות הרשויות שעדיין רשומות כמייצג משני (RepAuthorityKind). */
  secondaryAuthorities?: string[];
  skipReason?: string;
  /**
   * קול-הלקוח. אותה עובדה, ניסוח שני: מה שהרו״ח רואה נגזר מ-STEP_TYPE_LABELS,
   * ומה שהלקוח רואה בדף האישי נלקח מכאן. חסר ⇒ השרת נופל לניסוח ברירת מחדל.
   */
  clientTitle?: string;
  clientSub?: string;
  clientCta?: string;
  /** false ⇒ הבקשה מוכנה אצל הרו״ח אך אינה מוצגת ללקוח. היעדר השדה = מפורסמת. */
  published?: boolean;
  /** משימת גורם חיצוני — מי הגורם ומאיפה פרטי הקשר. */
  externalParty?: ExternalPartyConfig;
  /**
   * תצורת ביצוע אוטומטי (D3). null מפורש = ביטול (נדרס בפרסום); היעדר = ידני.
   * ‼ נחמשת רק אחרי "עדכן את דף הלקוח" — טיוטה לעולם אינה מבצעת.
   */
  autoAction?: { kind: 'email' } | null;
  /** חותמת הביצוע האוטומטי — התביעה של "בדיוק פעם אחת". */
  autoExecutedAt?: string;
  /** שגיאת הביצוע האחרון — התביעה שוחררה ויינסה שוב בטריגר הבא. */
  autoError?: string;
  // ── M2: יישור קו מול הרשויות ────────────────────────────────────────────
  /** איזה משלושת המוסדות — זהה לסיומת ה-step_type, נוח לקריאה ב-UI. */
  institution?: 'btl' | 'vat' | 'income';
  /** מה שהועתק מהמסך של הרשות — מפתחות ספציפיים לכל מוסד (ראה InstitutionAlignmentWorkspace). */
  collected?: Record<string, unknown>;
  /** תשובות שדה "יש משהו חריג?" — מפתח לכל שאלת חריגה במוסד. */
  exceptions?: Record<string, unknown>;
  /** מתי הושלמה הבדיקה בפועל — מתעדכן בכל השלמה, גם אחרי ריצה מחדש (בשונה מ-completedAt שנשאר על הראשונה). */
  checkedAt?: string;
  /** תמונות מצב קודמות — נוספת ב-reopen_institution_alignment לפני איפוס. */
  history?: Array<{ checkedAt?: string; collected: Record<string, unknown>; exceptions: Record<string, unknown> }>;
  // ── M2: שיחת פתיחה ───────────────────────────────────────────────────────
  /** נקודות שהצטברו מיישור הקו — "יש משהו לברר עם הלקוח", לא בקשה. */
  clarifications?: Array<{ text: string; institution: 'btl' | 'vat' | 'income'; at: string }>;
  [key: string]: unknown;
}

export interface OnboardingStep {
  id: string;
  userId?: string;
  engagementId?: string;
  clientId: string;
  stepType: OnboardingStepType;
  track: OnboardingTrack;
  scope: 'person' | 'engagement';
  status: OnboardingStepStatus;
  ball: OnboardingBall;
  dependsOnStepId?: string;
  /**
   * האם השלב חוסם סגירת קליטה. נקבע לכל שלב בנפרד — לא לפי סוג בלבד —
   * כי אותו סוג יכול להיות חובה במסע אחד ורשות במסע אחר (ייבוא היסטוריה,
   * שאלון, בקשה חופשית). חסר ⇒ נופלים לברירת המחדל לפי סוג, עבור שורות
   * שנוצרו לפני שהעמודה קיימת.
   */
  requiredForClose?: boolean;
  dueDate?: string;
  /** סדר התצוגה שהרו״ח קבע בבונה. גובר על סדר היצירה בכל מסך ובדף האישי. */
  sortOrder?: number;
  /** שלב-העל בתיק (journey_stages, מיגרציה 79). חסר ⇒ דלי ברירת-מחדל בתצוגה. */
  stageId?: string | null;
  /** מקור האמת לפרסום פר-בקשה (מיגרציה 77). null = טיוטה שהלקוח אינו רואה. */
  publishedAt?: string | null;
  /** עריכות ממתינות לבקשה שפורסמה — הלקוח רואה את payload עד הפרסום הבא. */
  draftPayload?: StepPayload | null;
  needsAttention: boolean;
  payload: StepPayload;
  completionMethod: StepCompletionMethod;
  completedBy?: string;
  completedAt?: string;
  verifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type OnboardingEventActor = 'accountant' | 'client' | 'system';

export const EVENT_ACTOR_LABELS: Record<OnboardingEventActor, string> = {
  accountant: 'אני',
  client: 'הלקוח',
  system: 'המערכת',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  created: 'נוצר',
  status_changed: 'שינוי סטטוס',
  email_prepared: 'מייל הוכן',
  email_sent: 'מייל נשלח',
  reminder_prepared: 'תזכורת הוכנה',
  blocked: 'נחסם',
  note: 'הערה',
};

export interface OnboardingEvent {
  id: string;
  userId?: string;
  stepId?: string;
  engagementId?: string;
  type: string;
  actor: OnboardingEventActor;
  note?: string;
  meta: Record<string, unknown>;
  at: string;
}

const CLOSED_STATUSES: OnboardingStepStatus[] = ['completed', 'verified', 'skipped', 'cancelled'];

/** שלב פתוח = עוד דורש טיפול של מישהו. */
export function isStepOpen(status: OnboardingStepStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

/**
 * שלב שמחכה לרו"ח *עכשיו* — מה שנספר בתג של לשונית המסע ובמונה "אצלי".
 * ‼ שלב נעול נושא ball='me' אף שהוא ממתין לתלות שלו (מכתב שחרור מחכה
 * לפרטי הרו"ח הקודם מהלקוח). ספירה שלו כ"אצלי" מבטיחה עבודה שאי אפשר לעשות.
 */
export function stepAwaitsMe(s: Pick<OnboardingStep, 'status' | 'ball'>): boolean {
  return s.ball === 'me' && isStepOpen(s.status) && s.status !== 'locked';
}

// ─── כללי סגירת הקליטה · מקור אחד ────────────────────────────────────────────
// ‼ הכללים האלה הם בבואה של onboarding_close_readiness בשרת. השרת הוא הסמכות
// — הוא זה שחוסם סגירה — והעתק הכללים כאן קיים כדי שהמסך יוכל לומר *מראש*
// מה חוסם, בלי לנחש ובלי להמציא כלל משלו. כל שינוי כאן חייב להיעשות גם שם.

/**
 * ברירת מחדל לפי סוג — משמשת אך ורק כשאין לשלב ערך משלו, כלומר לשורות
 * שנוצרו לפני שהעמודה required_for_close קיימת. שני הסוגים האלה הם עבודה
 * שממשיכה ברקע אחרי שהלקוח כבר שוטף, ומעולם לא חסמו סגירה גם בשרת.
 */
export const DEFAULT_OPTIONAL_STEP_TYPES: OnboardingStepType[] = [
  'representation_upgrade',
  'first_month_review',
];

/** מצבים שנחשבים "סגור" לצורך הסגירה. */
export const SATISFIED_STATUSES: OnboardingStepStatus[] = ['completed', 'verified', 'skipped'];

/**
 * האם השלב חוסם סגירה. הערך שעל השלב גובר תמיד; ברירת המחדל לפי סוג היא
 * רשת ביטחון לשורות ישנות בלבד.
 *
 * ‼ שלב מותנה אינו זקוק לבדיקת תנאי כאן: המחולל יוצר מכתב שחרור רק כשיש
 * רו״ח קודם, הרשאת תשלום רק כשיש חיוב חודשי, וחיבור פייפרלס רק כשהוא חלק
 * מהמסע. קיום השלב הוא התנאי — ולכן שלב מותנה שקיים הוא נדרש.
 */
export function isStepRequiredForClose(step: OnboardingStep): boolean {
  if (step.status === 'cancelled') return false;
  if (typeof step.requiredForClose === 'boolean') return step.requiredForClose;
  return !DEFAULT_OPTIONAL_STEP_TYPES.includes(step.stepType);
}

/**
 * האם השלב מסופק.
 *
 * ‼ ההקלה "השאלון נשלח ⇒ מספיק" הוסרה. שאלון שהוגדר כנדרש חוסם עד שנענה,
 * עד שדולג במפורש, או עד שהוגדר כרשות. מי שרוצה לסגור בלי תשובה מסמן את
 * השלב כרשות — החלטה גלויה, במקום הקלה שקטה שאיש לא ביקש.
 *
 * ההקלה שנשארה: מכתב שחרור שחלון ההתנגדות שלו עבר נחשב מסופק — שתיקת הרו״ח
 * הקודם היא הסכמה. ‼ זהו **כלל עבודה פנימי של המשרד**, לא חוק, לא תקנה ולא
 * כלל מקצועי מאומת. אין לו מקור מצוטט, ואין לתאר אותו ככזה בשום מקום.
 *
 * ‼ שתיקה נחשבת הסכמה רק אחרי ששאלנו. תאריך יעד אפשר לקבוע לכל שלב ידנית,
 * ולכן מכתב שמעולם לא נשלח ותאריכו עבר היה "מספק" את הסגירה בלי שאיש ראה
 * אותו. לכן החלון תקף רק אחרי שהשלב יצא מהכנה (לא pending ולא locked).
 * זהה לתנאי שב-onboarding_close_readiness (מיגרציה 68).
 */
export function isStepSatisfiedForClose(step: OnboardingStep): boolean {
  if (SATISFIED_STATUSES.includes(step.status)) return true;
  if (
    step.stepType === 'release_letter' &&
    step.status !== 'pending' &&
    step.status !== 'locked' &&
    step.dueDate &&
    new Date(step.dueDate) <= new Date()
  ) return true;
  return false;
}

/** מה חוסם סגירה רגילה — ורק זה. הרשימה שמוצגת בחלון הסגירה. */
export function blockingStepsForClose(steps: OnboardingStep[]): OnboardingStep[] {
  return steps.filter(s => isStepRequiredForClose(s) && !isStepSatisfiedForClose(s));
}

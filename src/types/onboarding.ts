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
  | 'intake_questionnaire';

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
};

export type OnboardingTrack =
  | 'authorities'
  | 'prev_accountant'
  | 'tools'
  | 'payment'
  | 'internal'
  | 'review';

export const TRACK_LABELS: Record<OnboardingTrack, string> = {
  authorities: 'רשויות',
  prev_accountant: 'רו״ח קודם',
  tools: 'כלים וחומרים',
  payment: 'תשלום',
  internal: 'הקמה פנימית',
  review: 'מעקב',
};

export const TRACK_ORDER: OnboardingTrack[] = [
  'authorities', 'prev_accountant', 'tools', 'payment', 'internal', 'review',
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

export type OnboardingBall = 'me' | 'client' | 'authority' | 'prev_accountant' | 'system';

export const STEP_BALL_LABELS: Record<OnboardingBall, string> = {
  me: 'אצלי',
  client: 'אצל הלקוח',
  authority: 'אצל הרשות',
  prev_accountant: 'אצל הרו״ח הקודם',
  system: 'אוטומטי',
};

export type StepCompletionMethod = 'manual' | 'auto' | 'system';

/** פריט ברשימת סימון של שלב (קבלת חומרים, הקמה פנימית). */
export interface StepChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface StepPayload {
  checklist?: StepChecklistItem[];
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
  dueDate?: string;
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

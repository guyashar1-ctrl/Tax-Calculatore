// ─── מסלולים והודעות: השכבה היחידה שמדברת עם השרת ──────────────────────────
// ‼ כל כתיבה עוברת דרך פונקציות השרת (214–216). אין כאן כתיבה ישירה לטבלאות:
// הטבלאות החדשות פתוחות לקריאה בלבד, וכל החלטה (מה נפתח, מה נמסר, מה נשלח)
// נעשית בשרת. המסך שואל ומציג.

import { supabase } from '../../lib/supabase';
import { formatDate } from '../../utils/dateFormat';
import type { NoticeSendResult } from './noticeText';
import type { ClientKind, FlowDefinition, FlowTrigger, OfficeFlow, RunStatus, StageState, Opens, Delivery, ItemRef, When } from './types';

type Rpc<T> = { ok?: boolean; error?: string } & T;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<Rpc<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  // ‼ הודעת השגיאה של השרת/הרשת באנגלית — לקונסול, לא למסך.
  if (error) { console.warn('[flows]', fn, error.message); return { ok: false, error: 'request_failed' } as Rpc<T>; }
  return (data ?? { ok: false, error: 'request_failed' }) as Rpc<T>;
}

// ── מסלולי המשרד ────────────────────────────────────────────────────────────
export interface OfficeFlowsResult { flows: (OfficeFlow & { versions?: { version: number; note?: string | null; createdAt: string }[]; activeRuns?: number })[] }

export async function loadOfficeFlows() {
  const r = await rpc<OfficeFlowsResult>('get_office_flows');
  return { ok: r.ok !== false, error: r.error, flows: (r.flows ?? []).map(f => ({ ...f, definition: f.definition ?? { stages: [] } })) };
}

export const createOfficeFlow = (name: string, trigger: Exclude<FlowTrigger, 'quote_approved'>, definition: FlowDefinition) =>
  rpc<{ flowId?: string; version?: number }>('create_office_flow', { p_name: name, p_trigger: trigger, p_definition: definition });

/** שמירה = גרסה חדשה. במסלול הקליטה — יחד עם חמש הרשימות שהמחולל קורא. */
export const saveOfficeFlow = (flowId: string, baseVersion: number, definition: FlowDefinition,
  opts: { name?: string; note?: string; compiled?: Record<ClientKind, unknown[]> } = {}) =>
  rpc<{ version?: number; current?: number }>('save_office_flow', {
    p_flow_id: flowId, p_base_version: baseVersion, p_definition: definition,
    p_name: opts.name ?? null, p_note: opts.note ?? null, p_compiled: opts.compiled ?? null,
  });

export const archiveOfficeFlow = (flowId: string) => rpc<{ activeRuns?: number }>('archive_office_flow', { p_flow_id: flowId });
export const convertJourneyTemplate = (templateId: string) =>
  rpc<{ flowId?: string; existed?: boolean }>('convert_journey_template_to_flow', { p_template_id: templateId });

// ── ספרייה ─────────────────────────────────────────────────────────────────
export interface LibraryEntryInput {
  stepType?: string;
  owner?: 'client' | 'me' | 'external';
  requiredForClose?: boolean;
  payload: Record<string, unknown>;
}
export const upsertLibraryRequest = (templateId: string | null, name: string, description: string | null, entry: LibraryEntryInput) =>
  rpc<{ templateId?: string; copiedFromSeed?: boolean }>('upsert_library_request', {
    p_template_id: templateId, p_name: name, p_description: description, p_entry: entry,
  });
export const deleteLibraryRequest = (templateId: string) =>
  rpc<{ flows?: string[] }>('delete_library_request', { p_template_id: templateId });

// ── ריצות אצל לקוח ─────────────────────────────────────────────────────────
export interface RunActionState {
  itemKey: string;
  ref: ItemRef & { actionType?: string };
  mode: 'auto' | 'manual';
  state: { state: 'waiting_office' | 'queued' | 'already_open'; reason?: string; jobId?: string; at?: string } | null;
  job: { id: string; status: string; errorCode?: string | null; errorDetail?: string | null; needsHuman?: string | null; createdAt: string; finishedAt?: string | null; auto: boolean } | null;
}
export interface RunStage {
  key: string;
  name: string;
  opens: Opens;
  delivery: Delivery;
  reminder?: { afterDays: number; max: number } | null;
  notifyOffice: boolean;
  state: StageState;
  openedAt?: string | null;
  doneAt?: string | null;
  counts: {
    total: number; done: number; client: number; office: number; external: number; unannounced: number; drafts: number; awaitingStage: number;
    /**
     * כמה בקשות בשלב מחזיקות את השלב הבא — לא בוטלו, ומפריט חובה או שצורפו ידנית
     * (אותו מסנן כמו _flow_gate_steps). 0 ⇒ השלב «עובר הלאה». חסר = שרת ישן.
     */
    gates?: number;
    /** דולגו בלי סיבה מוכרת («אין צורך») — לא נחשבות כבוצעו, והשלב מחכה להן. */
    stuck?: number;
  };
  actions: RunActionState[] | null;
  /**
   * השלב מוגבל לסוגי עוסק, וסוג העוסק של הלקוח לא ידוע — הוא לא נפתח ולא סומן «לא חל»;
   * ייפתח כשסוג העוסק ייקבע (217). חסר = שרת ישן.
   */
  waitingKind?: boolean;
  /**
   * (B1) שלב שמחכה: האם יחול על הלקוח הזה לפי עובדות הריצה (_flow_when_matches_kind). false — ענף
   * של סוג אחר: לא «הבא» ולא «במקביל» (willNotApply). רק בשלב שמחכה; חסר = שרת ישן.
   */
  willApply?: boolean;
  /** (B4) כמה בקשות בשלב מחכות לסוג העוסק (אותו כלל כמו kind_unknown). חסר = שרת ישן. */
  kindWaitItems?: number;
  /** התנאי של השלב (סוגים/עובדות) — לקיבוץ ענפים חלופיים. */
  when?: When | null;
}
export interface ClientFlowRun {
  id: string;
  flowId: string;
  flowName: string;
  trigger: FlowTrigger;
  version: number;
  currentVersion: number;
  upgradeAvailable: boolean;
  /** האם בהפעלה הורשו פעולות «לבד» מול רשות (state.autoActions בשרת). */
  autoActions?: boolean;
  cycleKey: string;
  status: RunStatus;
  startedAt: string;
  pausedAt?: string | null;
  cancelledAt?: string | null;
  doneAt?: string | null;
  /**
   * מי סגר ריצה שבוטלה. 'engagement_ended' — ההתקשרות הקודמת הסתיימה והלקוח חזר
   * (נפתחה קליטה חדשה); זה לא «בוטל» של המשרד. חסר = שרת ישן / ביטול רגיל.
   */
  closedBy?: string | null;
  stages: RunStage[];
  suggestions: number;
}

export async function loadClientFlowRuns(clientId: string) {
  const r = await rpc<{ runs: ClientFlowRun[] }>('get_client_flow_runs', { p_client_id: clientId });
  return { ok: r.ok !== false, error: r.error, runs: r.runs ?? [] };
}

export interface RunMaterialized {
  runId?: string;
  alreadyStarted?: boolean;
  /** שנה שבוטלה והופעלה שוב — אותה ריצה, מחדש. */
  restarted?: boolean;
  status?: string;
  created?: { itemKey: string; stepId: string; role?: string; attached?: boolean; officeTask?: boolean }[];
  /**
   * ‼ problem — הפריט היה אמור להיווצר ולא נוצר (ספרייה, תוכן, הגדרה, שרת): השרת פתח
   * שורה אדומה ב«בקשות» (problemStepId). בלי problem — דילוג תמים (לא חל, כבר קיים…).
   */
  skipped?: { itemKey: string; role?: string; reason: string; stepId?: string; problem?: boolean; problemStepId?: string }[];
}
export const startFlowRun = (clientId: string, flowId: string, cycleKey: string | null, allowAutoActions: boolean) =>
  rpc<RunMaterialized>('start_flow_run', {
    p_client_id: clientId, p_flow_id: flowId, p_cycle_key: cycleKey, p_allow_auto_actions: allowAutoActions,
  });
export const pauseFlowRun = (runId: string) => rpc<{ cancelledJobs?: number }>('pause_flow_run', { p_run_id: runId });
export const resumeFlowRun = (runId: string) => rpc<{ unlocked?: number }>('resume_flow_run', { p_run_id: runId });
export const cancelFlowRun = (runId: string) =>
  rpc<{ cancelled?: number; kept?: { stepId: string; stepType: string; title: string }[] }>('cancel_flow_run', { p_run_id: runId });
export const reattachOnboardingFlow = (clientId: string) =>
  rpc<{ runId?: string; matched?: number; skipped?: string }>('reattach_onboarding_flow_run', { p_client_id: clientId });
export const addFlowItems = (runId: string, itemKeys: string[], roles: string[] | null = null) =>
  rpc<RunMaterialized>('flow_run_add_items', { p_run_id: runId, p_item_keys: itemKeys, p_roles: roles });
export const attachStepToStage = (stepId: string, runId: string, stageKey: string) =>
  rpc<{ status?: string }>('attach_step_to_flow_stage', { p_step_id: stepId, p_run_id: runId, p_stage_key: stageKey });

export interface UpgradePreview {
  upToDate?: boolean;
  from: number;
  to: number;
  added: { stageKey: string; stageName: string; itemKey: string; ref: ItemRef; applies: boolean; stageOpen: boolean;
           action: boolean; mode?: string; fixed: boolean; addable: boolean;
           /** למה לא ייווצר (בקשה ריקה בספרייה, סוג שלא חוזר…) — אותם קודים כמו סיבת דילוג. */
           notAddableReason?: string | null }[];
  removed: { itemKey: string; ref: ItemRef; stageName: string;
             steps: { stepId: string; status: string; title: string; canSkip: boolean }[] }[];
  changed: { itemKey: string; ref: ItemRef; stageName: string; fromStageName?: string | null; what?: string[] }[];
  /** שינויים בשלב עצמו — חלים על הריצה מהעדכון. */
  stageChanges?: { stageKey: string; stageName: string; fromName?: string | null; what: string[] }[];
}

/** מה השתנה בפריט — ‼ חלק מזה חל מיד גם על מה שכבר נפתח (קובע מתי שלב נסגר). */
export const ITEM_CHANGE_TEXT: Record<string, { text: string; now: boolean }> = {
  moved: { text: 'עבר לשלב אחר', now: true },
  now_optional: { text: 'עכשיו רשות — השלב לא מחכה לה', now: true },
  now_required: { text: 'עכשיו חובה — השלב מחכה לה', now: true },
  after: { text: 'השתנה «נפתח אחרי»', now: true },
  when: { text: 'השתנה על מי זה חל', now: false },
  mode: { text: 'השתנה «לבד» / «בלחיצה»', now: true },
  perPerson: { text: 'השתנה «גם לבן/בת הזוג»', now: false },
  due: { text: 'השתנה היעד בימים', now: false },
  content: { text: 'נוסח חדש', now: false },
};
/** מה השתנה בשלב — חל על הריצה מהעדכון. */
export const STAGE_CHANGE_TEXT: Record<string, string> = {
  name: 'שם השלב', opens: 'מתי השלב נפתח', when: 'על מי השלב חל', delivery: 'איך מגיע ללקוח',
  reminder: 'תזכורות ללקוח', notifyOffice: 'הודעה אליך כשהשלב הושלם',
};
export const previewUpgrade = (runId: string) => rpc<UpgradePreview>('flow_run_upgrade_preview', { p_run_id: runId });
export const applyUpgrade = (runId: string, toVersion: number, addItemKeys: string[], skipStepIds: string[]) =>
  rpc<RunMaterialized & { skippedSteps?: number }>('flow_run_upgrade_apply', {
    p_run_id: runId, p_to_version: toVersion, p_add_item_keys: addItemKeys, p_skip_step_ids: skipStepIds,
  });

export interface RunSuggestion {
  kind: 'add' | 'not_needed' | 'add_person';
  itemKey: string;
  ref: ItemRef;
  stageName: string;
  role?: 'spouse';
  name?: string;
  steps?: string[];
  /** add_person: בבקשה יש אישור אישי — לבן/בת הזוג נפתחת משימה אליך (_flow_has_personal_confirm). */
  personalConfirm?: boolean;
  /**
   * add_person עם אישור אישי: יש בבקשה גם קבצים/פרטים — החלק הזה נפתח בדף של בעל
   * הכרטיס בשם בן/בת הזוג, לצד המשימה אליך (_flow_materialize: page + office).
   */
  pagePart?: boolean;
}
export const loadSuggestions = (runId: string) => rpc<{ suggestions: RunSuggestion[] }>('flow_run_suggestions', { p_run_id: runId });

// ── סוג העוסק לא ידוע — בקשות שמחכות לו (engagements.kind_hold, 217) ─────────
// ‼ הטיפוס ו«ממתינה» — מקור אחד ב-types/onboarding (Engagement.kindHold, engagementFromDb).
// כאן: הפעולה מול השרת והטקסטים שלה.
export { kindHoldPending, type KindHold } from '../../types/onboarding';

/** «לפתוח את הבקשות שחיכו» — retry_kind_hold (217): {ok, created, notApplicable} או {ok:false, error}. */
export const retryKindHold = (clientId: string) =>
  rpc<{ created?: number; notApplicable?: number }>('retry_kind_hold', { p_client_id: clientId });

/** כשאין קוד מוכר — ‼ לא «נכשל»: לא תמיד ידוע מה קרה בשרת, והפעולות כאן בטוחות לחזרה. */
export const GENERIC_RETRY_TEXT = 'לא הצלחנו — נסה שוב';

/**
 * הקודים ש-retry_kind_hold מחזירה בפועל (217), ו-request_failed מהשכבה כאן (אין תשובה).
 * ‼ release_failed — השרת תפס תקלה ולא פתח דבר (נרשם ב-failedAt); בטוח לנסות שוב.
 */
export const RETRY_KIND_HOLD_ERROR_TEXT: Record<string, string> = {
  forbidden: 'אין הרשאה לכרטיס הזה',
  kind_unknown: 'סוג העוסק עדיין לא נקבע — קובעים אותו בתיק המס, ב«פרטי הנישום»',
  release_failed: 'הבקשות שחיכו לא נפתחו הפעם — אפשר לנסות שוב בעוד רגע',
  client_not_found: 'הלקוח לא נמצא — רעננו',
  request_failed: 'אין תשובה מהשרת — בדקו את החיבור ונסו שוב',
};
export function retryKindHoldErrorText(code: string | null | undefined): string {
  return (code && RETRY_KIND_HOLD_ERROR_TEXT[code]) || GENERIC_RETRY_TEXT;
}

// ── בקשה שהייתה אמורה להיווצר ולא נוצרה — שורה אדומה ב«בקשות» (217) ─────────
// ‼ השורה היא בקשה פנימית של המשרד (custom_request, ball 'me', internalTask) עם
// payload.creationProblem. הסיבה ומה עושים — נבנים כאן מהקודים (creationProblemText),
// לא מטקסט שנשמר בשרת: טקסט שמור מתיישן. הלקוח לא רואה אותה.

export type CreationProblemClass = 'library' | 'content' | 'config' | 'card' | 'system';
export type CreationProblemNext = 'retry' | 'library' | 'add' | 'flow';
export interface CreationProblem {
  key: string;
  source: 'flow' | 'generator';
  reason: string;
  cls: CreationProblemClass;
  next: CreationProblemNext;
  runId?: string;
  stageKey?: string;
  itemKey?: string;
  role?: string;
  engagementId?: string;
  entryKey?: string;
  ref?: { kind?: string; templateId?: string; docId?: string } | null;
  itemTitle: string;
  attempts: number;
  firstAt: string;
  lastAt: string;
  resolvedStepId?: string | null;
}

/**
 * התשובה של retry_request_creation (217).
 *   · resolved=true — השורה נסגרה. how: created (נוצרה, stepId) | exists (כבר קיימת) |
 *     not_applicable (כבר לא חלה); reason — אותו מידע בקוד 'exists' | 'not_applicable'.
 *   · resolved=false — אותה שורה: reason = סיבת היצירה שעודכנה, attempts = מספר הניסיונות.
 *   · ok=false — error: not_a_problem | entry_not_found | not_running | forbidden (או request_failed).
 */
export interface RetryCreationReply {
  resolved?: boolean;
  how?: 'created' | 'exists' | 'not_applicable';
  stepId?: string;
  reason?: string;
  attempts?: number;
}
/** «צור שוב» — השרת מנסה ליצור שוב את הבקשה, ובהצלחה סוגר את השורה האדומה. */
export const retryRequestCreation = (stepId: string) =>
  rpc<RetryCreationReply>('retry_request_creation', { p_step_id: stepId });

/** הקודים ש-retry_request_creation מחזירה בפועל (217, כולל מה ש-flow_run_add_items מעביר). */
export const RETRY_CREATION_ERROR_TEXT: Record<string, string> = {
  not_a_problem: 'השורה כבר נסגרה — רעננו',
  entry_not_found: 'הבקשה כבר לא ברשימת הקליטה של המשרד — מוסיפים אותה מ«＋ בקשה חדשה», ואז «אין צורך»',
  not_running: 'המסלול כבר לא רץ — אולי הושלם או בוטל. רעננו',
  forbidden: 'אין הרשאה',
  request_failed: 'אין תשובה מהשרת — בדקו את החיבור ונסו שוב',
};

/**
 * «הסתר מהדף» על משימה ישנה בלי תוכן (216 §9): {ok} | {ok, already} | {ok, backToOffice} | {ok:false, error}.
 * backToOffice — המשימה חיכתה ללקוח ולכן חזרה אליך (אחרת הייתה נשארת «ממתין ל…» בלי דרך לסיים).
 */
export const hideStepFromClient = (stepId: string) =>
  rpc<{ already?: boolean; backToOffice?: boolean }>('hide_step_from_client', { p_step_id: stepId });

/** המשפט אחרי «הסתר מהדף» שהצליח — מה קרה, ואם המשימה חזרה אליך. */
export function hideStepDoneText(o: { backToOffice?: boolean }, clientName: string): string {
  return `הוסתרה מהדף של ${clientName} — עברה ל«עבודה פנימית»${o.backToOffice ? ' וחזרה אליך' : ''}`;
}

/** הקודים ש-hide_step_from_client מחזירה בפועל (216 §9). */
export const HIDE_STEP_ERROR_TEXT: Record<string, string> = {
  forbidden: 'אין הרשאה',
  step_not_found: 'הבקשה לא נמצאה — רעננו',
  not_a_request: 'אפשר להסתיר מהדף רק בקשה חופשית',
  has_client_content: 'יש בבקשה משהו בשביל הלקוח, ולכן היא נשארת בדף. אם היא של המשרד — עורכים אותה',
  request_failed: 'אין תשובה מהשרת — בדקו את החיבור ונסו שוב',
};
export function hideStepErrorText(code: string | null | undefined): string {
  return (code && HIDE_STEP_ERROR_TEXT[code]) || GENERIC_RETRY_TEXT;
}

/** מצב השורה — במקום «ממתין ל…». */
export const CREATION_PROBLEM_STATUS = 'אצלך — הבקשה לא נוצרה';

const CREATION_REASON_TEXT: Record<string, string> = {
  missing_payload: 'הבקשה בספרייה ריקה',
  no_requirements: 'בבקשה בספרייה אין מה למלא',
  missing_requirement_label: 'לאחד הפריטים בבקשה בספרייה אין שם',
  bad_requirement_kind: 'בבקשה בספרייה יש פריט מסוג לא מוכר',
  select_needs_options: 'לשאלת בחירה בבקשה בספרייה אין אפשרויות',
  not_creatable: 'סוג הבקשה הזה לא נוצר מתוך מסלול',
  not_a_request: 'סוג הבקשה הזה לא נוצר מתוך מסלול',
  step_type_not_allowed: 'סוג הבקשה הזה לא נוצר מתוך מסלול',
  bad_owner: 'בבקשה בספרייה חסר מי מבצע אותה',
  missing_external_party: 'בבקשה בספרייה חסר מי מבצע אותה',
  // ‼ card (217): הנתון חסר בכרטיס, לא בספרייה — «צור שוב» קורא את הכרטיס מחדש.
  spouse_name_missing: 'חסר שם בן/בת הזוג בכרטיס — משלימים אותו בתיק המס, ב«משפחה ובן/בת זוג»',
};
/** הקודים ש-_creation_problem_class בשרת מסווג כבעיה — כולם מקבלים כאן משפט (נבדק). */
export const CREATION_PROBLEM_CODES = [
  'library_item_missing', ...Object.keys(CREATION_REASON_TEXT),
  'forbidden', 'client_not_found', 'stage_not_found', 'dependency_not_found', 'create_failed',
];

/**
 * למה לא נוצרה — בלי «לא נוצרה כי». ‼ קוד שאינו בטבלה (תקלה בשרת, קוד חדש) — משפט
 * כללי, לא הקוד עצמו.
 */
export function creationReasonText(code: string | null | undefined, refKind?: string | null): string {
  if (code === 'library_item_missing') {
    return refKind === 'document' ? 'המסמך הוסר מהספרייה'
      : refKind === 'template' ? 'הבקשה כבר לא קיימת בספרייה'
      : 'הפריט כבר לא קיים בספרייה';
  }
  return (code && CREATION_REASON_TEXT[code]) || 'היצירה נכשלה בשרת';
}

export type CreationProblemAction = 'retry' | 'library' | 'add' | 'flow';
const CREATION_NEXT: Record<CreationProblemNext, { text: string; actions: CreationProblemAction[] }> = {
  retry: { text: 'אפשר ללחוץ «צור שוב». אם זה חוזר — מוסיפים מ«＋ בקשה חדשה» ולוחצים «אין צורך».', actions: ['retry'] },
  library: { text: 'מתקנים את הבקשה ב«פתח בספרייה» ולוחצים «צור שוב» — או «אין צורך».', actions: ['retry', 'library'] },
  // ‼ הפריט נמחק מהספרייה — «צור שוב» לא יכול להצליח, ולכן אין אותו.
  add: { text: 'אם עדיין צריך — מוסיפים מ«＋ בקשה חדשה», ואז «אין צורך».', actions: ['add'] },
  flow: { text: 'מחליפים את הפריט במסלול («פתח את המסלול»). אם עדיין צריך ללקוח הזה — «＋ בקשה חדשה», ואז «אין צורך».', actions: ['flow'] },
};

/** חסר נתון בכרטיס (card) — משלימים בכרטיס, ואז «צור שוב» (הניסיון קורא את הכרטיס מחדש). */
const CARD_NEXT = { text: 'כשהפרט בכרטיס — «צור שוב». אם כבר לא צריך — «אין צורך».', actions: ['retry'] as CreationProblemAction[] };

export interface CreationProblemText {
  /** הסיבה בלבד — ‼ «לא נוצרה» כבר במצב השורה, ולא חוזרים עליו. */
  reason: string;
  /** מה עושים — בשמות הכפתורים שבשורה. */
  next: string;
  /** הכפתורים בשורה, לפי הסדר. «אין צורך» — תמיד, ולא ברשימה. */
  actions: CreationProblemAction[];
  /** «ניסיון אחרון: …» — רק כשניסו יותר מפעם אחת. */
  lastTry: string | null;
}

/** הסיבה ומה עושים, מהקודים שנשמרו בשורה. */
export function creationProblemText(cp: Pick<CreationProblem, 'reason' | 'next'> & Partial<Pick<CreationProblem, 'ref' | 'attempts' | 'lastAt' | 'cls'>>): CreationProblemText {
  const card = cp.cls === 'card' || cp.reason === 'spouse_name_missing';
  const n = card ? CARD_NEXT : (CREATION_NEXT[cp.next] ?? CREATION_NEXT.retry);
  const last = (cp.attempts ?? 0) > 1 && cp.lastAt ? formatDate(cp.lastAt, 'list') : '';
  return {
    reason: creationReasonText(cp.reason, cp.ref?.kind),
    next: n.text,
    actions: n.actions,
    lastTry: last ? `ניסיון אחרון: ${last}` : null,
  };
}

/** «אין צורך» על השורה — החלון, ומה שנשלח לשרת (advance_onboarding_step 'skip'). */
export function creationSkipConfirm(o: { itemTitle: string; requiredForClose?: boolean; inFlow?: boolean }) {
  return {
    title: `אין צורך ב«${o.itemTitle}»?`,
    message: `${o.requiredForClose ? 'הבקשה נדרשת לסגירת הקליטה. ' : ''}«אין צורך» סוגר את השורה בלי ליצור את הבקשה, וזה נרשם בהיסטוריה.${o.inFlow ? ' השלב במסלול ימשיך בלעדיה.' : ''}`,
    confirmLabel: 'אין צורך',
    payload: { reason: 'not_applicable', note: 'אין צורך — הבקשה לא נוצרה' },
  };
}

/** אחרי «צור שוב» — רק מה שהשרת אמר. */
export function retryCreationText(
  r: { ok?: boolean; error?: string } & RetryCreationReply,
  itemTitle: string,
): { text: string; err: boolean } {
  if (r.ok === false || r.error) {
    return { text: (r.error && RETRY_CREATION_ERROR_TEXT[r.error]) || GENERIC_RETRY_TEXT, err: true };
  }
  if (!r.resolved) return { text: 'עדיין לא נוצרה — הסיבה עודכנה בשורה', err: true };
  // ‼ how קודם (217); reason — שרת שמחזיר רק אותו.
  const how = r.how ?? r.reason;
  if (how === 'not_applicable') return { text: 'לא חלה עוד על הלקוח — השורה נסגרה', err: false };
  if (how && ['exists', 'already_done', 'in_other_run', 'step_type_exists'].includes(how)) {
    return { text: 'כבר קיימת אצל הלקוח — השורה נסגרה', err: false };
  }
  return { text: r.stepId ? `נוצרה — «${itemTitle}» ברשימה` : 'השורה נסגרה', err: false };
}

// ── הודעות ללקוח ───────────────────────────────────────────────────────────
export type NoticeKind = 'new' | 'reminder' | 'update';

// ‼ הטקסטים והטיפוס במודול טהור (noticeText.ts) — כדי שאפשר לבדוק אותם בלי דפדפן.
export { noticeErrorText, type NoticeSendResult } from './noticeText';

/**
 * שליחת הודעה דרך השרת. ‼ idempotencyKey — אחד לכל חלון שליחה (לא לכל לחיצה):
 * לחיצה כפולה וניסיון חוזר מאותו חלון הם אותה הודעה. השרת מחליט מה נכלל.
 */
export async function sendClientNotice(args: {
  clientId: string; kind: NoticeKind; idempotencyKey: string; expectedFingerprint?: string;
  overrides?: { subject?: string; body?: string };
}): Promise<NoticeSendResult> {
  const { data, error } = await supabase.functions.invoke('send-process-open-email', {
    body: { clientId: args.clientId, kind: args.kind, idempotencyKey: args.idempotencyKey,
            expectedFingerprint: args.expectedFingerprint, overrides: args.overrides },
  });
  if (error) return await errorBody(error);
  return (data ?? {}) as NoticeSendResult;
}

/** «שלח שוב (אותו מייל)» על הודעה שלא ידוע אם יצאה. */
export async function retryUnknownNotice(clientId: string, noticeId: string): Promise<NoticeSendResult> {
  const { data, error } = await supabase.functions.invoke('send-process-open-email', {
    body: { clientId, noticeId, retry: true },
  });
  if (error) return await errorBody(error);
  return (data ?? {}) as NoticeSendResult;
}

/**
 * resolve_client_notice (214). 'not_sent' = שחרור של מייל שלא ידוע אם יצא: {ok, status:'failed',
 * reason: 'recipient_changed' (הכתובת בכרטיס שונה) | 'office_marked_not_sent'}; שגיאה: not_unknown.
 * 'cancel_queued' — {ok, status:'cancelled'}; שגיאה: not_queued.
 */
export const resolveNotice = (noticeId: string, action: 'not_sent' | 'cancel_queued') =>
  rpc<{ status?: string; reason?: 'recipient_changed' | 'office_marked_not_sent' | string }>('resolve_client_notice', { p_notice_id: noticeId, p_action: action });

/** functions.invoke מחזיר את גוף השגיאה בתוך error.context — מוציאים אותו. */
async function errorBody(error: unknown): Promise<NoticeSendResult> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try { return { ok: false, ...(await ctx.json()) } as NoticeSendResult; } catch { /* not json */ }
  }
  return { ok: false, error: (error as Error)?.message ?? 'send_failed' };
}

// ── טקסטים לקודים מהשרת — מקום אחד ─────────────────────────────────────────
// ‼ המשתמש לא רואה קוד באנגלית. קוד שאין לו טקסט — משפט כללי בעברית, והקוד
// נרשם בקונסול (כדי שאפשר יהיה להוסיף אותו כאן). כל מסכי המסלולים קוראים מכאן.
export const SERVER_ERROR_TEXT: Record<string, string> = {
  // הגדרת מסלול (flow_definition_error)
  version_conflict: 'מישהו שמר את המסלול בינתיים — טענו מחדש',
  variant_without_documents: 'ב«מסמכים מהלקוח» יש מצב בלי אף מסמך — לקוח במצב הזה יקבל בקשה ריקה. מוסיפים מסמך, או מסירים את המצב',
  no_stages: 'אין במסלול אף שלב',
  stage_without_key: 'לשלב חסר מזהה',
  duplicate_stage_key: 'שני שלבים עם אותו מזהה',
  stage_without_name: 'לשלב אין שם',
  bad_delivery: 'בשלב חסרה הבחירה «איך מגיע ללקוח»',
  stage_without_items: 'שלב בלי רשימת פריטים',
  item_without_key: 'לפריט חסר מזהה',
  duplicate_item_key: 'שני פריטים עם אותו מזהה',
  bad_ref: 'פריט שאינו בקשה, מסמך או פעולה',
  action_not_supported: 'פעולה מול רשות שלא נתמכת במסלול',
  action_per_person: 'פעולה מול רשות אינה «לכל אדם»',
  system_in_repeatable_flow: 'בקשת מערכת נוצרת רק במסלול הקליטה',
  system_in_later_stage: 'בקשת מערכת נפתחת רק בשלב שנפתח מיד',
  system_with_facts: 'בקשת מערכת מוגבלת רק לפי סוג לקוח',
  system_per_person: 'בקשת מערכת אינה «לכל אדם»',
  per_person_in_onboarding: '«גם לבן/בת הזוג» לא אפשרי במסלול הקליטה',
  bad_opens: 'שלב נפתח אחרי שלב או פריט שלא קיים',
  opens_after_action: 'שלב לא נפתח אחרי פעולה מול רשות',
  bad_after: '«אחרי» מתייחס לפריט באותו שלב בלבד',
  after_action: 'פעולה מול רשות לא מחכה לפריט ואין מה לחכות לה',
  stage_cycle: 'השלבים נפתחים זה אחרי זה במעגל',
  missing_compiled: 'התרגום לרשימות הקליטה חסר — נסו לשמור שוב',
  missing_name: 'חסר שם',
  bad_trigger: 'סוג מסלול לא מוכר',
  save_failed: 'השמירה לא הצליחה — אפשר לנסות שוב',
  // מסלולים, ריצות והפעלה
  flow_not_found: 'המסלול לא נמצא — אולי הועבר לארכיון',
  flow_archived: 'המסלול הועבר לארכיון',
  onboarding_cannot_archive: 'את מסלול הקליטה אי אפשר להעביר לארכיון',
  onboarding_starts_on_approval: 'מסלול הקליטה מתחיל לבד כשההצעה מאושרת',
  already_active: 'המסלול הזה כבר פעיל אצל הלקוח. אפשר להפעיל שוב אחרי שיסתיים או יבוטל',
  cycle_done: 'השנה הזו כבר הושלמה אצל הלקוח — אין מה להפעיל',
  bad_cycle: 'שנה לא תקינה',
  client_not_found: 'הלקוח לא נמצא',
  run_not_found: 'המסלול אצל הלקוח לא נמצא — רעננו',
  not_active: 'המסלול כבר לא פעיל — אולי הושלם או בוטל בחלון אחר. רעננו',
  not_paused: 'המסלול כבר לא בעצירה — אולי חודש בחלון אחר. רעננו',
  not_running: 'המסלול כבר לא רץ — אולי הושלם או בוטל. רעננו',
  no_onboarding: 'אין קליטה פתוחה להצמיד אליה',
  stage_not_found: 'השלב כבר לא קיים בגרסה הזו — רעננו',
  step_not_found: 'הבקשה לא נמצאה — רעננו',
  step_terminal: 'הבקשה כבר הסתיימה',
  in_other_run: 'הבקשה כבר שייכת למסלול אחר',
  // ספרייה
  template_not_found: 'הבקשה כבר לא קיימת — אולי נמחקה בחלון אחר. טענו מחדש',
  in_use: 'הבקשה בשימוש במסלול — קודם מסירים אותה משם',
  missing_payload: 'הבקשה ריקה',
  step_type_not_allowed: 'אי אפשר לשמור בקשה מהסוג הזה בספרייה',
  bad_owner: 'מי עושה — לא תקין',
  no_documents: 'צריך לפחות מסמך אחד ברשימה',
  no_requirements: 'צריך לפחות פריט אחד שהלקוח מעלה או מאשר',
  bad_requirement_kind: 'לאחד הפריטים סוג לא מוכר',
  missing_requirement_label: 'יש פריט בלי שם',
  select_needs_options: 'פריט «בחירה מרשימה» צריך לפחות שתי אפשרויות',
  // בקשה שלא נוצרה («צור שוב»)
  not_a_problem: 'השורה כבר נסגרה — רעננו',
  entry_not_found: 'הבקשה כבר לא ברשימת הקליטה של המשרד — מוסיפים אותה מ«＋ בקשה חדשה», ואז «אין צורך»',
  // סוג העוסק («לפתוח את הבקשות שחיכו») — הקודים של retry_kind_hold (217)
  kind_unknown: RETRY_KIND_HOLD_ERROR_TEXT.kind_unknown,
  release_failed: RETRY_KIND_HOLD_ERROR_TEXT.release_failed,
  // «הסתר מהדף» (216 §9)
  has_client_content: HIDE_STEP_ERROR_TEXT.has_client_content,
  // כללי
  forbidden: 'אין הרשאה',
  no_office: 'החשבון לא משויך למשרד',
  request_failed: 'אין תשובה מהשרת — בדקו את החיבור ונסו שוב',
};
export function serverErrorText(code?: string | null, fallback = 'הפעולה לא הצליחה — אפשר לנסות שוב'): string {
  if (code && SERVER_ERROR_TEXT[code]) return SERVER_ERROR_TEXT[code];
  if (code) console.warn('[flows] קוד שגיאה בלי טקסט:', code);
  return fallback;
}

// ── שמות ─────────────────────────────────────────────────────────────────────
/** למה פריט לא נוצר אצל לקוח — במשפט. ‼ מקום אחד לכל המסכים (רצועה, הפעלה, הפעלה לכמה לקוחות). */
export const SKIP_REASON_TEXT: Record<string, string> = {
  not_applicable: 'לא חל על הלקוח',
  exists: 'כבר קיים במסלול',
  already_done: 'הושלם בעבר (פעם אחת)',
  in_other_run: 'פתוח במסלול אחר',
  library_item_missing: 'נמחק מהספרייה',
  not_creatable: 'סוג שלא נוצר כך',
  generator_only: 'נוצר באישור ההצעה בלבד',
  step_type_exists: 'כבר קיים אצל הלקוח',
  not_a_request: 'אינו בקשה',
  // מה שהשרת דוחה בבקשה עצמה (validate_requirements) — יש לתקן אותה בספרייה
  no_requirements: 'בבקשה בספרייה אין מה למלא — מוסיפים לה פריטים בספרייה',
  missing_requirement_label: 'לאחד הפריטים בבקשה בספרייה אין שם',
  bad_requirement_kind: 'סוג פריט לא מוכר בבקשה בספרייה',
  select_needs_options: 'לשאלת בחירה בבקשה בספרייה אין אפשרויות',
  create_failed: 'היצירה נכשלה',
  not_repeatable: 'סוג בקשה שנוצר פעם אחת ללקוח — לא חוזר כל שנה. במסלול שחוזר: בקשה חופשית או בקשת מסמכים',
  personal_confirm: 'יש בה אישור אישי — נפתחת רק לבעל הכרטיס, לא לבן/בת הזוג',
  // ‼ סוג עוסק לא ידוע לא נהיה «עוסק מורשה» בשקט — הפריט מחכה לו (217).
  kind_unknown: 'סוג העוסק לא ידוע — קובעים אותו בתיק המס',
  // מה ש-_creation_problem_class מסווג כבעיה (שורה אדומה) — כל קוד במשפט
  missing_payload: 'הבקשה בספרייה ריקה',
  step_type_not_allowed: 'סוג הבקשה הזה לא נוצר מתוך מסלול',
  bad_owner: 'בבקשה בספרייה חסר מי מבצע אותה',
  missing_external_party: 'בבקשה בספרייה חסר מי מבצע אותה',
  forbidden: 'אין הרשאה',
  client_not_found: 'הלקוח לא נמצא',
  stage_not_found: 'השלב כבר לא קיים במסלול',
  dependency_not_found: 'הבקשה שהיא מחכה לה לא נמצאה',
  spouse_name_missing: 'חסר שם בן/בת הזוג בכרטיס',
};
export function skipReasonText(r: string): string {
  if (SKIP_REASON_TEXT[r]) return SKIP_REASON_TEXT[r];
  console.warn('[flows] סיבת דילוג בלי טקסט:', r);
  return 'לא נוצרה';
}

/**
 * שנת המס במסלול שנתי — מקום אחד לשני חלונות ההפעלה (בכרטיס ולכמה לקוחות).
 * ברירת המחדל: השנה האחרונה שהסתיימה — באוקטובר 2026 עובדים על הדוח של 2025.
 */
export const defaultTaxYear = () => new Date().getFullYear() - 1;
export const taxYearOptions = () => { const y = new Date().getFullYear(); return [y + 1, y, y - 1, y - 2]; };

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  active: 'פעיל', paused: 'בעצירה', cancelled: 'בוטל', done: 'הושלם',
};

/** סיבה ש«פעולה מול רשות» ממתינה לך — במשפט. */
export const ACTION_WAIT_REASON: Record<string, string> = {
  run_not_authorized: 'כשהופעל המסלול ללקוח הזה לא אושר להריץ פעולות לבד — מריצים בלחיצה',
  not_represented: 'אין עדיין ייצוג פעיל ברשות',
  missing_input: 'חסר מספר תיק או ת.ז. בכרטיס',
  recent_job: 'כבר נקרא השבוע — אין צורך שוב',
  open_needs_you: 'הקריאה הקודמת עצרה וצריכה אותך — ממשיכים אותה מתיק המס',
  deferred: 'קריאה אוטומטית אחרת כבר בתור',
  worker_offline: 'מחשב העבודה כבוי',
  not_connected: 'אין חיבור פעיל לרשות',
  office_busy: 'מישהו עובד במחשב העבודה — לא משתלטים על החלון',
  auto_expired: 'לא נלקחה תוך רבע שעה',
  added_in_upgrade: 'נוספה בעדכון — מריצים בלחיצה',
  not_supported: 'הפעולה לא נתמכת במסלול',
  error: 'תקלה בהכנה',
};

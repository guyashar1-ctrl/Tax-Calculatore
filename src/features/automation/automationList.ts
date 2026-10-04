// ─── «אוטומציות» · רשימה אחת: מה מפעיל · מה קורה · תוצאה אחרונה (סבב 4) ──────
// לוגיקה טהורה (בלי React), כדי שתיבדק ב-node.
//
// ‼ שורה = מנגנון, לא שלב. «מייל מרוכז כשנפתח שלב» הוא שורה אחת גם כשהוא מסומן
// ב-12 שלבים: הרשימה לא מתארכת עם המסלולים, והשלבים עצמם — בפתיחת השורה, עם
// קישור לכל אחד. כך משתמש חדש סורק ~15 שורות ומבין מה קורה לבד.
// ‼ מקור אחד לכל הגדרה: מה שמוגדר בשלב (מייל לבד, תזכורת, הודעה אליך, קריאה
// לבד) נגזר כאן מהמסלולים לקריאה בלבד; מה שאינו של מסלול (תזכורת פקיעה,
// תזכורות הייצוג, ההודעות למשרד) נערך בעמוד עצמו.
// ‼ «תוצאה אחרונה» היא ראיה: שורה ביומן המיילים, הודעה ללקוח (client_notices)
// או ריצה — לא ההגדרה. מתג דולק בלי ראיה פירושו «עוד לא יצא», וזה מה שנאמר.
// ‼ (3.10, סבב 4) כל שורה נשאלת בנפרד, לפי הסינון שלה (MailQuery) — לא מתוך
// 200 המיילים האחרונים של המשרד, שבהם מנגנון נדיר נראה כאילו לא רץ מעולם.

import type { EmailMessage, EmailStatus } from '../../types/emailActivity';
import {
  DELIVERY_LABELS, FLOW_ACTION_NAMES, actionTypeOf, type Delivery, type FlowDefinition, type FlowItem, type OfficeFlow,
} from '../flows/types';
import { flowMoments, systemGate, systemName } from '../flows/preview';
import { isEmptyWhen, onlyPhrase, whenParts } from '../flows/conditions';
import type { AutomationJob } from '../../types/automation';
import { runAwaitsLogin, runOutcomeUnknown, runTime, summarizeRun, type AutomationAction } from './automationCatalog';

export type AutoGroupId = 'client' | 'office' | 'card' | 'authority';

export const AUTO_GROUPS: { id: AutoGroupId; title: string }[] = [
  { id: 'client', title: 'מיילים שיוצאים לבד' },
  { id: 'office', title: 'הודעות אליך' },
  { id: 'card', title: 'נפתח לבד בכרטיס הלקוח' },
  { id: 'authority', title: 'פעולות מול הרשויות' },
];

export type ResultTone = 'ok' | 'warn' | 'bad' | 'muted' | 'live';

/** שלב במסלול שבו המנגנון מסומן — לקישור «עריכה בשלב». */
export interface StageUse {
  flowId: string;
  flowName: string;
  stageKey: string;
  stageName: string;
  /** «אחרי 7 ימים, עד 3 פעמים» · «לבד» / «בלחיצה שלך». */
  detail?: string;
  /** פעולה מול רשות: האם מסומנת «לבד». */
  auto?: boolean;
}

export interface FlowUses {
  autoMail: StageUse[];
  reminders: StageUse[];
  notify: StageUse[];
  /** לכל סוג פעולה מול רשות — איפה היא במסלולים. */
  actions: Record<string, StageUse[]>;
}

const times = (n: number) => (n === 1 ? 'פעם אחת' : `${n} פעמים`);

/** מה המסלולים מגדירים שיקרה לבד. ‼ «רק בדף» — בלי מייל ולכן בלי תזכורת (214). */
export function flowUses(flows: OfficeFlow[]): FlowUses {
  const out: FlowUses = { autoMail: [], reminders: [], notify: [], actions: {} };
  for (const f of flows) {
    if (f.status === 'archived') continue;
    for (const s of f.definition.stages) {
      const base = { flowId: f.id, flowName: f.name, stageKey: s.key, stageName: s.name };
      if (s.delivery === 'auto') out.autoMail.push(base);
      if (s.reminder && s.delivery !== 'page') {
        out.reminders.push({ ...base, detail: `אחרי ${s.reminder.afterDays} ימים, עד ${times(s.reminder.max)}` });
      }
      if (s.notifyOffice) out.notify.push(base);
      for (const i of s.items) {
        const t = actionTypeOf(i.ref);
        if (!t) continue;
        const auto = i.mode === 'auto';
        (out.actions[t] ??= []).push({ ...base, auto, detail: auto ? AUTO_WHEN_POSSIBLE : 'בלחיצה שלך' });
      }
    }
  }
  return out;
}

/**
 * ‼ «לבד» של פעולה במסלול אינו מובטח: רק בריצה שהורשתה בהפעלה, ללקוח מיוצג,
 * כשמחשב העבודה פנוי ולא נקרא השבוע (215). אותה מילה כמו בבונה (StageCard),
 * והשערים עצמם — בפתיחת השורה (FLOW_AUTO_GATES).
 */
export const AUTO_WHEN_POSSIBLE = 'לבד, כשאפשר';

/** «כשנפתח השלב «X» במסלול «Y»» · «כשנפתח אחד מ-3 שלבים במסלול «Y»». */
export function stagesPhrase(uses: StageUse[], verb: string): string {
  if (uses.length === 1) return `${verb} השלב «${uses[0].stageName}» במסלול «${uses[0].flowName}»`;
  const flows = new Set(uses.map(u => u.flowId));
  return `${verb} אחד מ-${uses.length} שלבים ${flows.size === 1 ? `במסלול «${uses[0].flowName}»` : `ב-${flows.size} מסלולים`}`;
}

/** «מה מפעיל» של פעולה מול רשות: הלחיצה, ומה שבמסלולים מסומן «לבד» — «כשאפשר», לא תמיד. */
export function actionTrigger(a: Pick<AutomationAction, 'trigger'>, uses: StageUse[] | undefined): string {
  const auto = (uses ?? []).filter(u => u.auto);
  if (auto.length === 0) return a.trigger;
  const when = auto.length === 1 ? `כשנפתח «${auto[0].stageName}»` : `כשנפתח אחד מ-${auto.length} שלבים במסלולים`;
  return `${a.trigger} · ${when} — ${AUTO_WHEN_POSSIBLE}`;
}

// ─── שורה ───────────────────────────────────────────────────────────────────

/**
 * אילו מיילים הם הראיה של שורה. ‼ אותו סינון רץ בשרת (שאילתה לכל שורה) ובדפדפן
 * (matchesMail) — כך גם מסד מדומה שמתעלם ממסנן מחזיר רק את מה ששייך לשורה.
 */
export interface MailQuery {
  kinds?: string[];
  /** כל ההודעות אל המשרד (notify_*, גיבוי שבועי) — כשאין kinds. */
  internal?: boolean;
  excludeKinds?: string[];
  /** רק מה שיצא לבד (meta.origin = auto, 214). */
  origin?: 'auto';
  /** מפתח היומן מתחיל ב… — «auto:step:» = מייל אוטומטי של בקשה (send-step-email). */
  keyPrefix?: string;
}

export type RowSource =
  /** notices — גם הודעות ללקוח מהדף (client_notices) מהסוג הזה: מתוזמן, דולג, לא ידוע. */
  | { type: 'emails'; mail: MailQuery; notices?: 'new' | 'reminder' }
  | { type: 'jobs'; actionType: string }
  | { type: 'runs'; flowId: string }
  | { type: 'none'; text: string };

export interface AutoRow {
  /** עוגן: data-auto, והמפתח שקישור מעמוד אחר פותח. */
  id: string;
  group: AutoGroupId;
  name: string;
  trigger: string;
  effect: string;
  state: { label: string; tone: 'on' | 'off' | 'manual' | 'warn' };
  source: RowSource;
  /** שלבים שבהם זה מוגדר (מסלולים) — לקישורים בפתיחה. */
  uses?: StageUse[];
  /** פעולה מול רשות — הפירוט מהקטלוג. */
  action?: AutomationAction;
}

export interface RowsInput {
  /** null — עוד נטען (או נכשל: flowsError). */
  flows: OfficeFlow[] | null;
  flowsError?: boolean;
  expiryOn: boolean;
  repOn: number;
  repTotal: number;
  firmOn: number;
  firmTotal: number;
  officeEmail: string;
  actions: AutomationAction[];
}

/** שורות שאינן פעולה מול רשות — לפתיחה מקישור (focus). פעולות: לפי מזהה בקטלוג. */
export const MECHANISM_ROW_IDS = ['flow-mail', 'flow-reminder', 'expiry', 'rep-reminders', 'auto-request', 'notifications', 'flow-notify', 'intake'];

/** ‼ סוגי המייל של «הודעה ללקוח» מהדף (214): «חדש» נרשם כאחד משני אלה. */
export const NOTICE_NEW_KINDS = ['process_open', 'documents_sent'];
export const REP_REMINDER_KINDS = ['representation_reminder_sign', 'representation_reminder_niClient', 'representation_reminder_niSpouse', 'representation_reminder_portal'];
export const FLOW_DONE_KIND = 'notify_flow_stage_done';
export const AUTO_STEP_KEY = 'auto:step:';

/** מצב התזכורות הקבועות — אותה מילה ב«אוטומציות» וב«מיילים». */
export const expiryState = (on: boolean): AutoRow['state'] =>
  (on ? { label: 'פעילה', tone: 'on' } : { label: 'כבויה', tone: 'off' });
export const repRemindersState = (on: number, total: number): AutoRow['state'] =>
  (on ? { label: `${on} מתוך ${total} פעילות`, tone: 'on' } : { label: 'כבויות', tone: 'off' });

export function automationRows(inp: RowsInput): AutoRow[] {
  const loaded = inp.flows !== null;
  const failed = !loaded && !!inp.flowsError;
  // ‼ מסלולים שלא נטענו אינם «לא בשימוש» — אומרים שלא נטען, לא שאין.
  const pending = failed ? 'המסלולים לא נטענו — זה לא אומר שאין בהם דבר שקורה לבד' : 'טוען את המסלולים…';
  const u = flowUses(inp.flows ?? []);
  const onboarding = (inp.flows ?? []).find(f => f.trigger === 'quote_approved' && f.status !== 'archived') ?? null;
  const flowsState = (n: number, on: string): AutoRow['state'] =>
    failed ? { label: 'לא נטען', tone: 'warn' } : !loaded ? { label: '…', tone: 'off' }
      : n ? { label: on, tone: 'on' } : { label: 'לא בשימוש', tone: 'off' };
  const rows: AutoRow[] = [
    {
      id: 'flow-mail', group: 'client', name: 'מייל מרוכז ללקוח כשנפתח שלב',
      trigger: !loaded ? pending : u.autoMail.length ? stagesPhrase(u.autoMail, 'כשנפתח')
        : 'אף שלב לא מוגדר «מייל אוטומטי» — כל מייל של מסלול מחכה לשליחה שלך',
      // ‼ ברשימה — המשפט הקצר; מה נרשם כנשלח ומה רק מוזכר — בפתיחת השורה (AUTO_MAIL_RECORDED).
      effect: DELIVERY_LABELS.auto.long,
      state: flowsState(u.autoMail.length, u.autoMail.length === 1 ? 'בשלב אחד' : `ב-${u.autoMail.length} שלבים`),
      source: { type: 'emails', mail: { kinds: NOTICE_NEW_KINDS, origin: 'auto' }, notices: 'new' },
      uses: u.autoMail,
    },
    {
      id: 'flow-reminder', group: 'client', name: 'תזכורת ללקוח על מה שממתין בדף',
      trigger: !loaded ? pending
        : u.reminders.length === 1 ? `${u.reminders[0].detail} — בשלב «${u.reminders[0].stageName}»`
        : u.reminders.length ? `כמה ימים אחרי המייל — ב-${u.reminders.length} שלבים במסלולים`
        : 'לא מוגדרת באף שלב',
      effect: 'מייל ללקוח על מה שעוד פתוח בדף — לכל היותר אחד ביום, ונעצר כשהלקוח מסיים',
      state: flowsState(u.reminders.length, u.reminders.length === 1 ? 'בשלב אחד' : `ב-${u.reminders.length} שלבים`),
      source: { type: 'emails', mail: { kinds: ['portal_reminder'], origin: 'auto' }, notices: 'reminder' },
      uses: u.reminders,
    },
    {
      id: 'expiry', group: 'client', name: 'תזכורת לפני שהצעת מחיר פוקעת',
      trigger: 'יום עסקים לפני שהצעת מחיר שנשלחה פוקעת',
      effect: 'מייל ללקוח שקיבל את ההצעה · נוסח קבוע',
      state: expiryState(inp.expiryOn),
      source: { type: 'emails', mail: { kinds: ['quotation_reminder'] } },
    },
    {
      id: 'rep-reminders', group: 'client', name: 'תזכורות על ייצוג שממתין ללקוח',
      trigger: 'כמה ימים אחרי בקשה לחתום או לאשר את הייצוג, כל עוד לא בוצע',
      effect: 'מייל תזכורת ללקוח או לבן/בת הזוג · נוסח קבוע',
      state: repRemindersState(inp.repOn, inp.repTotal),
      source: { type: 'emails', mail: { kinds: REP_REMINDER_KINDS } },
    },
    {
      id: 'auto-request', group: 'client', name: 'מייל לגורם חיצוני כשבקשה מוכנה',
      trigger: 'כשבקשה לגורם חיצוני שסומנה «אוטומטי ⚡» מוכנה — כל מה שהיא מחכה לו הושלם',
      effect: 'מייל אחד לגורם (למשל לרו״ח הקודם) על הבקשה — פעם אחת',
      state: { label: 'לפי בקשה', tone: 'manual' },
      // ‼ send-step-email רושם שליחה אוטומטית עם המפתח auto:step:<בקשה> — זו הראיה.
      source: { type: 'emails', mail: { kinds: ['step_reminder'], keyPrefix: AUTO_STEP_KEY } },
    },
    {
      id: 'notifications', group: 'office', name: 'מיילים אליך כשמשהו קורה',
      trigger: 'כשלקוח או רו״ח קודם פועלים: אישור הצעה, חתימה, העלאת מסמך…',
      effect: inp.officeEmail ? `מייל אל ${inp.officeEmail}` : 'אין אימייל למשרד — שום הודעה לא נשלחת',
      state: !inp.officeEmail ? { label: 'אין כתובת', tone: 'warn' }
        : { label: `${inp.firmOn} מתוך ${inp.firmTotal} פעילות`, tone: inp.firmOn ? 'on' : 'off' },
      // ‼ «שלב במסלול הושלם» — בשורה משלו; לא נספר כאן פעמיים.
      source: { type: 'emails', mail: { internal: true, excludeKinds: [FLOW_DONE_KIND] } },
    },
    {
      id: 'flow-notify', group: 'office', name: 'מייל אליך כששלב במסלול הושלם',
      trigger: !loaded ? pending : u.notify.length ? stagesPhrase(u.notify, 'כשהושלם') : 'לא מסומן באף שלב',
      effect: inp.officeEmail ? `מייל אל ${inp.officeEmail}` : 'אין אימייל למשרד — שום הודעה לא נשלחת',
      state: !inp.officeEmail && u.notify.length ? { label: 'אין כתובת', tone: 'warn' }
        : flowsState(u.notify.length, u.notify.length === 1 ? 'בשלב אחד' : `ב-${u.notify.length} שלבים`),
      source: { type: 'emails', mail: { kinds: [FLOW_DONE_KIND] } },
      uses: u.notify,
    },
    onboarding ? {
      id: 'intake', group: 'card', name: onboarding.name,
      trigger: 'כשהלקוח מאשר הצעת מחיר',
      effect: onboardingEffect(onboarding),
      state: { label: 'פעיל', tone: 'on' },
      source: { type: 'runs', flowId: onboarding.id },
    } : {
      // ‼ משרד חדש: המסלול נוצר בשרת באישור ההצעה הראשון (216: attach_onboarding_flow_run →
      // ensure_onboarding_flow), כמו שאומר «מסלולים». זה לא חוסר שצריך לטפל בו — לא ב«צריך אותך».
      id: 'intake', group: 'card', name: 'קליטת לקוח חדש',
      trigger: 'כשהלקוח מאשר הצעת מחיר',
      effect: loaded ? INTAKE_ON_FIRST_APPROVAL : pending,
      state: loaded ? { label: 'ייווצר באישור הראשון', tone: 'manual' } : flowsState(0, ''),
      source: { type: 'none', text: loaded ? 'עוד לא נפתח לאף לקוח' : '' },
    },
    ...inp.actions.filter(a => a.actionType).map((a): AutoRow => ({
      id: a.id, group: 'authority', name: a.name,
      trigger: actionTrigger(a, a.actionType ? u.actions[a.actionType] : undefined),
      effect: a.short,
      state: a.effect === 'read' ? { label: 'קורא בלבד', tone: 'manual' } : { label: 'משנה אצל הרשות', tone: 'manual' },
      source: { type: 'jobs', actionType: a.actionType! },
      uses: a.flow && a.actionType ? (u.actions[a.actionType] ?? []) : undefined,
      action: a,
    })),
  ];
  return rows;
}

const gatedItem = (i: FlowItem) => !isEmptyWhen(i.when) || (i.ref.kind === 'system' && !!systemGate(i.ref.stepType, {}).rule);

/**
 * ‼ בלי מספר: ענפים לפי סוג אינם מצטברים, ואף לקוח לא מקבל את כל הפריטים.
 * «איך מגיע» — לכל שלב בפתיחה (intakeMoments), כי הוא שונה משלב לשלב.
 */
export function onboardingEffect(flow: OfficeFlow): string {
  const branches = flow.definition.stages.some(s => !isEmptyWhen(s.when) || s.items.some(gatedItem));
  return branches ? 'נפתחות בקשות בכרטיס הלקוח — לפי סוג הלקוח ומה שבהצעה' : 'נפתחות בקשות בכרטיס הלקוח';
}

/**
 * משרד שעוד לא אישר הצעה: המסלול שייווצר הוא שלב אחד «מחכה לאישורך» (216:
 * ensure_onboarding_flow, delivery 'hold') — שום דבר לא מגיע ללקוח לפני הפרסום.
 */
export const INTAKE_ON_FIRST_APPROVAL = 'נפתחות בקשות בכרטיס הלקוח, ומחכות לאישורך';
export const INTAKE_FIRST_DELIVERY: Delivery = 'hold';

/** המשפטים שאחרי הראשון — לפתיחת השורה, כשהמשפט הראשון כבר מוצג ברשימה. */
export function afterFirstSentence(s: string): string {
  const i = s.search(/[.!?]\s/);
  return i < 0 ? '' : s.slice(i + 2).trim();
}

// ─── מסלול הקליטה בפתיחה: רגעים, ענפים ואיך מגיע ───────────────────────────
// ‼ אותה גזירה כמו בבונה (flowMoments): סדר לפי «נפתח אחרי», לא לפי מיקום.

export interface IntakeStage {
  key: string;
  name: string;
  /** «רק לעוסק פטור» — null כשהשלב לכולם. */
  condition: string | null;
  /** בקשות שנפתחות לכל לקוח שהשלב חל עליו. */
  always: number;
  /** בקשות עם תנאי (סוג, עובדה, או שער קבוע של בקשת מערכת). */
  conditional: number;
  /** ‼ מסמך מהספרייה שהלקוח מקבל — אינו «בקשה». */
  docs?: { always: number; conditional: number };
  /** פעולות מול רשות בשלב — הן לא מגיעות ללקוח, אבל קורות כשהשלב נפתח. */
  actions?: { name: string; auto: boolean; conditional: boolean }[];
  delivery: Delivery;
}
export interface IntakeMoment { key: string; label: string; stages: IntakeStage[] }

/** שם פריט בלי ספרייה טעונה — משם בקשת המערכת, משם הפעולה, או מהעותק. */
export function itemShortTitle(i: FlowItem): string {
  if (i.ref.kind === 'system') return systemName(i.ref.stepType);
  if (i.ref.kind === 'action') return FLOW_ACTION_NAMES[actionTypeOf(i.ref)] ?? 'פעולה מול רשות';
  return i.snapshot?.title || (i.ref.kind === 'document' ? 'מסמך' : 'בקשה');
}

export function intakeMoments(flow: OfficeFlow): IntakeMoment[] {
  const def = flow.definition;
  const byKey = new Map(def.stages.map(s => [s.key, s]));
  return flowMoments(def, { onboarding: flow.trigger === 'quote_approved', title: itemShortTitle }).map(m => ({
    key: m.key,
    label: m.label,
    stages: m.stageKeys.map(k => byKey.get(k)!).map(s => {
      const requests = s.items.filter(i => i.ref.kind !== 'action' && i.ref.kind !== 'document');
      const docs = s.items.filter(i => i.ref.kind === 'document');
      return {
        key: s.key, name: s.name,
        condition: isEmptyWhen(s.when) ? null : onlyPhrase(whenParts(s.when)),
        always: requests.filter(i => !gatedItem(i)).length,
        conditional: requests.filter(gatedItem).length,
        docs: { always: docs.filter(i => !gatedItem(i)).length, conditional: docs.filter(gatedItem).length },
        actions: s.items.filter(i => i.ref.kind === 'action').map(i => ({
          name: itemShortTitle(i), auto: i.mode === 'auto', conditional: gatedItem(i),
        })),
        delivery: s.delivery,
      };
    }),
  }));
}

const BY_KIND = 'לפי סוג הלקוח ומה שבהצעה';

function countPart(always: number, conditional: number, n: (k: number) => string): string | null {
  if (!always && !conditional) return null;
  if (!conditional) return n(always);
  if (!always) return `${n(conditional)} — ${BY_KIND}`;
  return `${n(always)} · ועוד ${conditional} ${BY_KIND}`;
}

/** האם משהו מהשלב מגיע ללקוח (בקשה או מסמך) — רק אז «איך מגיע» רלוונטי. */
export function intakeReachesClient(s: Pick<IntakeStage, 'always' | 'conditional' | 'docs'>): boolean {
  return s.always + s.conditional + (s.docs?.always ?? 0) + (s.docs?.conditional ?? 0) > 0;
}

/**
 * מה מגיע ללקוח: «3 בקשות · ועוד 2 לפי סוג הלקוח ומה שבהצעה · מסמך אחד».
 * ‼ מסמך אינו בקשה (היה: «בקשה אחת» לשלב שיש בו רק מסמך).
 */
export function intakeCountText(s: Pick<IntakeStage, 'always' | 'conditional' | 'docs'>): string {
  const parts = [
    countPart(s.always, s.conditional, k => (k === 1 ? 'בקשה אחת' : `${k} בקשות`)),
    countPart(s.docs?.always ?? 0, s.docs?.conditional ?? 0, k => (k === 1 ? 'מסמך אחד' : `${k} מסמכים`)),
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(' · ') : 'בלי בקשות ללקוח';
}

/**
 * שורת השלב בפתיחת «קליטת לקוח חדש»: מה מגיע ללקוח, איך הוא מגיע, ומה קורה מול
 * הרשות. ‼ הפעולה אחרי «איך מגיע» — היא לא מגיעה ללקוח, והיא לא נעלמת מהשורה.
 */
export function intakeStageMeta(s: Pick<IntakeStage, 'always' | 'conditional' | 'docs' | 'actions' | 'delivery'>): string {
  const parts = [
    intakeCountText(s),
    ...(intakeReachesClient(s) ? [DELIVERY_LABELS[s.delivery].long] : []),
    ...(s.actions ?? []).map(a => `${a.name} — ${a.auto ? AUTO_WHEN_POSSIBLE : 'בלחיצה שלך'}${a.conditional ? ` (${BY_KIND})` : ''}`),
  ];
  return parts.join(' · ');
}

// ─── מיילים כראיה ───────────────────────────────────────────────────────────

/** ‼ 214: הודעה ללקוח נרשמת עם meta.origin — «auto» = יצאה לבד מהדופק. */
export function emailOrigin(m: Pick<EmailMessage, 'meta'>): 'auto' | 'manual' | undefined {
  const o = m.meta?.origin;
  return o === 'auto' || o === 'manual' ? o : undefined;
}

const mailTime = (m: Pick<EmailMessage, 'sentAt' | 'createdAt'>) => String(m.sentAt ?? m.createdAt ?? '');

export function matchesMail(m: EmailMessage, q: MailQuery, internal: (kind?: string) => boolean): boolean {
  if (q.kinds?.length) { if (!m.kind || !q.kinds.includes(m.kind)) return false; }
  else if (q.internal) { if (!internal(m.kind)) return false; }
  else return false;
  if (q.excludeKinds?.includes(m.kind ?? '')) return false;
  if (q.origin && emailOrigin(m) !== q.origin) return false;
  if (q.keyPrefix && !String((m as EmailMessage & { idempotencyKey?: string }).idempotencyKey ?? '').startsWith(q.keyPrefix)) return false;
  return true;
}

/** המיילים של שורה, מהחדש לישן. */
export function emailsFor(messages: EmailMessage[], q: MailQuery, internal: (kind?: string) => boolean): EmailMessage[] {
  return messages.filter(m => matchesMail(m, q, internal)).sort((a, b) => mailTime(b).localeCompare(mailTime(a)));
}

const EMAIL_RESULT: Record<EmailStatus, { label: string; tone: ResultTone }> = {
  sent: { label: 'נשלח', tone: 'ok' },
  delivered: { label: 'נמסר', tone: 'ok' },
  opened: { label: 'נפתח', tone: 'ok' },
  clicked: { label: 'נפתח ונלחץ', tone: 'ok' },
  delivery_delayed: { label: 'מתעכב בדרך', tone: 'warn' },
  bounced: { label: 'לא הגיע — הכתובת דחתה', tone: 'bad' },
  complained: { label: 'סומן כספאם', tone: 'bad' },
  failed: { label: 'השליחה נכשלה', tone: 'bad' },
  // ‼ רשת שנפלה / 5xx / תשובה בלי מזהה (218): אולי יצא — ענבר, לא «נכשלה».
  unknown: { label: 'לא ידוע אם יצא', tone: 'warn' },
};

export function emailResult(m: Pick<EmailMessage, 'status'>): { label: string; tone: ResultTone } {
  return EMAIL_RESULT[m.status] ?? { label: 'נשלח', tone: 'ok' };
}

/** תוצאה שצריכה אותך — לשורת «צריך אותך» בראש העמוד. */
export const needsAttention = (tone: ResultTone | undefined) => tone === 'warn' || tone === 'bad';

// ─── אירוע אחד בתוצאות של שורה: מייל, הודעה ללקוח או ריצה ──────────────────

export interface RowEvent {
  id: string;
  tone: ResultTone;
  label: string;
  note?: string;
  clientId?: string;
  /** לזמן ולמיון. בהודעה מתוזמנת — מתי היא אמורה לצאת. */
  at?: string;
  /** הזמן כבר בתווית («מתוזמן ל-14:05») — לא מוסיפים «לפני…». */
  timeInLabel?: boolean;
  /** העותק ביומן — ל«צפייה». */
  email?: EmailMessage;
  /** צריך החלטה שלך. חסר = לפי הגוון. */
  attention?: boolean;
  /**
   * ‼ נשאר ב«צריך אותך» גם כשהוא ישן וגם כשהמנגנון כבוי: הודעה ש«לא ידוע אם
   * יצאה» חוסמת את ההודעות הבאות מאותו סוג ללקוח הזה עד שמכריעים (214).
   */
  sticky?: boolean;
  /**
   * מה שחסר הוא חיבור, לא החלטה בכרטיס הלקוח: ריצה שממתינה להתחברות, או קריאה
   * במסלול שלא רצה כי אין חיבור / מחשב העבודה כבוי. ‼ לקישור «להתחברות» — לא
   * לפתוח את הלקוח ולחפש שם.
   */
  connect?: 'shaam' | 'btl' | 'worker';
}

export type NoticeStatus = 'queued' | 'claimed' | 'sending' | 'sent' | 'failed' | 'unknown' | 'cancelled' | 'skipped';

/** שורה מ-client_notices (214) — מה שהמסך צריך ממנה, בלי כתובות ובלי גוף. */
export interface NoticeRow {
  id: string;
  clientId: string;
  kind: 'new' | 'reminder' | 'update';
  status: NoticeStatus;
  reason?: string | null;
  dueAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  emailMessageId?: string | null;
  kickAttempts?: number | null;
  /** עד מתי התפיסה / השליחה חיה. «בשליחה» אחרי זה — לא ידוע אם יצא (214: _expire_client_notice_leases). */
  leaseUntil?: string | null;
}

/** למה הודעה לא יצאה — במילים. ‼ הקודים מ-214 (claim/fail/resolve_client_notice, kick_due_client_notices). */
export const NOTICE_REASON: Record<string, { label: string; tone: ResultTone; attention?: boolean }> = {
  no_email: { label: 'לא נשלח — אין ללקוח כתובת מייל', tone: 'warn' },
  nothing_to_announce: { label: 'לא נשלח — כבר לא היה מה לבשר', tone: 'muted' },
  unknown_pending: { label: 'לא נשלח — מחכה להחלטה על מייל קודם', tone: 'warn' },
  kick_exhausted: { label: 'לא יצא — השליחה האוטומטית לא הופעלה', tone: 'bad', attention: true },
  superseded: { label: 'לא יצא לבד — יצא במקומו מייל שלך', tone: 'muted' },
  office_cancelled: { label: 'עצרת אותו לפני שיצא', tone: 'muted' },
  // ‼ שחרור של המשרד אינו «לא נשלח»: לא ידוע אם הקודם יצא — רק שהבקשות שוחררו למייל הבא.
  office_marked_not_sent: { label: 'שחררת לשליחה מחדש — לא ידוע אם יצא', tone: 'muted' },
  // ‼ את זה קבע השרת, לא המשרד: לא היה מה לשלוח שוב — המייל נעצר לפני ספק הדואר.
  never_sent: { label: 'לא יצא — נעצר לפני ספק הדואר', tone: 'warn' },
  // 217: נרשם כשהמשרד שחרר אחרי שהכתובת בכרטיס השתנתה (השליחה החוזרת כבר לא משחררת לבד).
  recipient_changed: { label: 'שחררת לכתובת החדשה — לא ידוע אם הקודם יצא', tone: 'muted' },
  retry_window_passed: { label: 'לא נשלח שוב — עבר הזמן לשליחה חוזרת בטוחה', tone: 'warn', attention: true },
  lease_expired_before_send: { label: 'השליחה נקטעה לפני שיצאה', tone: 'bad', attention: true },
};

/** «בשליחה» שהחכירה שלו פקעה — השרת יעביר אותו ל«לא ידוע» בבדיקה הבאה; המסך כבר אומר את זה. */
const UNKNOWN_LABEL = 'לא ידוע אם יצא — ההחלטה בכרטיס הלקוח';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
const dayTime = (iso: string, now: number) => {
  const d = new Date(iso);
  return d.toDateString() === new Date(now).toDateString() ? hhmm(iso)
    : `${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} ${hhmm(iso)}`;
};

/** אחרי כמה זמן הודעה שבתור «איחרה» — כמו במגש בכרטיס (NoticeTray). */
const QUEUED_LATE_MS = 15 * 60_000;

export function noticeEvent(n: NoticeRow, now: number, email?: EmailMessage): RowEvent {
  const base = { id: `n:${n.id}`, clientId: n.clientId, at: n.sentAt ?? n.updatedAt ?? n.createdAt };
  // ‼ סיבה שאין בה מה להכריע (אין כתובת, יצא ידני במקומו) — מוצגת, אבל לא ב«צריך אותך».
  const known = n.reason ? NOTICE_REASON[n.reason] : undefined;
  const why = known && { ...known, attention: !!known.attention };
  switch (n.status) {
    case 'queued': {
      const due = n.dueAt ?? n.createdAt;
      const late = (n.kickAttempts ?? 0) >= 5 || Date.parse(due) < now - QUEUED_LATE_MS;
      // ‼ איחור אינו כשל: המנגנון מנסה שוב, ואחרי 5 ניסיונות ההודעה עוברת ל«לא יצא» (kick_exhausted).
      return late
        ? { ...base, at: due, timeInLabel: true, tone: 'warn', attention: false, label: `היה אמור לצאת ב-${dayTime(due, now)} — עוד לא יצא` }
        : { ...base, at: due, timeInLabel: true, tone: 'live', label: `מתוזמן ל-${dayTime(due, now)}` };
    }
    case 'claimed':
    case 'sending': {
      // ‼ חכירה שפקעה: נתפסה ולא נשלחה ⇒ לא יצא (כשל ודאי); נשלחה ולא הושלמה ⇒ לא ידוע.
      // רק חכירה חיה היא «נשלח עכשיו».
      const expired = !!n.leaseUntil && Date.parse(n.leaseUntil) < now;
      if (expired && n.status === 'sending') return { ...base, tone: 'warn', label: UNKNOWN_LABEL, attention: true, sticky: true, email };
      if (expired) return { ...base, ...NOTICE_REASON.lease_expired_before_send, email };
      return { ...base, tone: 'live', label: 'נשלח עכשיו' };
    }
    case 'sent': {
      const r = email ? emailResult(email) : { label: 'נשלח', tone: 'ok' as ResultTone };
      return { ...base, at: email?.sentAt ?? base.at, tone: r.tone, label: r.label, email };
    }
    case 'unknown':
      return { ...base, tone: 'warn', label: UNKNOWN_LABEL, attention: true, sticky: true, email };
    case 'failed':
      return why ? { ...base, ...why, email } : { ...base, tone: 'bad', label: 'השליחה נכשלה', attention: true, email };
    case 'cancelled':
      return why ? { ...base, ...why } : { ...base, tone: 'muted', label: 'בוטל לפני שיצא' };
    default:
      return why ? { ...base, ...why } : { ...base, tone: 'muted', label: 'לא נשלח' };
  }
}

export function jobEvent(j: AutomationJob): RowEvent {
  const s = summarizeRun(j);
  const login = runAwaitsLogin(j);
  return {
    id: `j:${j.id}`, tone: s.tone, label: s.label, note: s.note, clientId: j.clientId || undefined, at: runTime(j),
    sticky: runOutcomeUnknown(j), ...(login ? { connect: login } : {}),
  };
}

// ─── קריאה במסלול שלא רצה — «ממתינה לך» (215: flow_runs.state.actions) ──────
// ‼ כשנפתח שלב והקריאה לא יכולה לרוץ (מחשב כבוי, אין חיבור, לא אושר בהפעלה…)
// השרת רושם את הסיבה בריצה ולא יוצר משימה — ולכן היא לא מופיעה בין ההרצות.
// בלי זה השורה אמרה «עוד לא רצה» ו«צריך אותך» שתק, בזמן שלקוחות חיכו.

/** שורה מ-flow_runs — רק מה שצריך כדי לדעת מה ממתין. */
export interface WaitRun { id: string; clientId: string; flowId: string; flowVersion: number; state: unknown }
/** משימה מול רשות — לבדוק אם כבר הריצו אחרי שהקריאה נעצרה. */
export interface WaitJob { clientId: string | null; actionType: string; status: string; createdAt: string }

export interface FlowWait {
  runId: string;
  clientId: string;
  itemKey: string;
  actionType: string;
  /** בפריט במסלול נבחר «לבד» — ההמתנה היא שער שלא התקיים, לא ההגדרה. */
  auto: boolean;
  reason?: string;
  at: string;
  flowName?: string;
  stageName?: string;
}

/** «ממתין» שאין בו מה לעשות — כמו ברצועה בכרטיס (runSummary: NOTHING_NEEDED). */
const WAIT_NOTHING_NEEDED = new Set(['recent_job']);
/** ממתינה לך כי כך נקבע (לא אושר בהפעלה / נוספה בעדכון) — מוצג בשורה, לא «צריך אותך». */
const WAIT_BY_CHOICE = new Set(['run_not_authorized', 'added_in_upgrade']);

export const flowDefKey = (flowId: string, version: number) => `${flowId}:${version}`;

const timeOf = (iso: string | null | undefined) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : NaN; };

/**
 * מה ממתין לך בריצות הפעילות: פריט פעולה במצב waiting_office, שלא הורץ אחריו.
 * ‼ «הורץ אחריו» = משימה מאותו סוג לאותו לקוח שנוצרה מאז ולא בוטלה — כמו ברצועה
 * (get_client_flow_runs: המשימה האחרונה גוברת, חוץ מזו שבוטלה כשהפריט חזר אליך).
 * פריט שלא נמצא בהגדרה של הגרסה — לא מנחשים לאיזו שורה הוא שייך.
 */
export function flowWaits(runs: WaitRun[], defs: Map<string, FlowDefinition>, jobs: WaitJob[],
  flowNames: Record<string, string> = {}): FlowWait[] {
  const out: FlowWait[] = [];
  for (const r of runs) {
    const actions = (r.state as { actions?: unknown } | null)?.actions;
    if (!actions || typeof actions !== 'object') continue;
    const def = defs.get(flowDefKey(r.flowId, r.flowVersion));
    for (const [itemKey, raw] of Object.entries(actions as Record<string, unknown>)) {
      const st = raw as { state?: string; reason?: string; at?: string } | null;
      if (st?.state !== 'waiting_office' || WAIT_NOTHING_NEEDED.has(st.reason ?? '')) continue;
      let item: FlowItem | undefined;
      let stageName: string | undefined;
      for (const s of def?.stages ?? []) {
        item = (s.items ?? []).find(i => i.key === itemKey);
        if (item) { stageName = s.name; break; }
      }
      const actionType = item ? actionTypeOf(item.ref) : '';
      if (!item || !actionType) continue;
      const at = st.at ?? '';
      const since = timeOf(at);
      const ranSince = jobs.some(j => j.clientId === r.clientId && j.actionType === actionType && j.status !== 'cancelled'
        && (!Number.isFinite(since) || timeOf(j.createdAt) >= since));
      if (ranSince) continue;
      out.push({
        runId: r.id, clientId: r.clientId, itemKey, actionType, auto: item.mode === 'auto',
        ...(st.reason ? { reason: st.reason } : {}), at, flowName: flowNames[r.flowId], stageName,
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * אירוע בשורה של הפעולה. ‼ reasonText = ACTION_WAIT_REASON (features/flows/api.ts) —
 * אותו משפט כמו ברצועה בכרטיס; מועבר מבחוץ כדי שהקובץ יישאר טהור.
 */
export function waitEvent(w: FlowWait, reasonText: Record<string, string>): RowEvent {
  const why = w.reason ? reasonText[w.reason] : undefined;
  const attention = w.auto && !WAIT_BY_CHOICE.has(w.reason ?? '');
  const connect: RowEvent['connect'] = w.reason === 'worker_offline' ? 'worker'
    : w.reason === 'not_connected' ? (w.actionType.startsWith('btl.') ? 'btl' : 'shaam') : undefined;
  return {
    id: `w:${w.runId}:${w.itemKey}`,
    tone: attention ? 'warn' : 'muted',
    label: !w.auto ? 'ממתינה ללחיצה שלך' : why ? `ממתינה לך — ${why}` : 'ממתינה לך',
    note: w.flowName && w.stageName ? `במסלול «${w.flowName}», בשלב «${w.stageName}»` : undefined,
    clientId: w.clientId, at: w.at, attention,
    ...(connect ? { connect } : {}),
  };
}

export function emailEvent(m: EmailMessage): RowEvent {
  const r = emailResult(m);
  return { id: `m:${m.id}`, tone: r.tone, label: r.label, clientId: m.clientId, at: m.sentAt ?? m.createdAt, email: m };
}

/**
 * התוצאות של שורה, מהחדש לישן: הודעות ללקוח (עם המייל שלהן, אם יצא) ומיילים
 * שאין להם הודעה ברשימה. ‼ הודעה ומייל של אותה שליחה הם אירוע אחד.
 */
export function rowEvents(emails: EmailMessage[], notices: NoticeRow[], now: number): RowEvent[] {
  const byId = new Map(emails.map(m => [m.id, m]));
  const byNotice = new Map(emails.filter(m => typeof m.meta?.noticeId === 'string').map(m => [String(m.meta!.noticeId), m]));
  const used = new Set<string>();
  const out: RowEvent[] = notices.map(n => {
    const m = (n.emailMessageId ? byId.get(n.emailMessageId) : undefined) ?? byNotice.get(n.id);
    if (m) used.add(m.id);
    return noticeEvent(n, now, m);
  });
  for (const m of emails) if (!used.has(m.id)) out.push(emailEvent(m));
  return out.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
}

/** כמה זמן תוצאה רעה נשארת ב«צריך אותך». */
export const ATTENTION_DAYS = 7;

/**
 * ‼ «צריך אותך» — רק מה שאפשר לפעול עליו: התוצאה האחרונה של המנגנון (כלומר
 * אין הצלחה מאוחרת יותר), מהשבוע האחרון, ובמנגנון שעדיין פועל. חריג: sticky.
 */
export function raisesAttention(ev: Pick<RowEvent, 'tone' | 'attention' | 'sticky' | 'at'> | undefined,
  opts: { on: boolean; now: number }): boolean {
  if (!ev) return false;
  if (ev.sticky) return true;
  if (!(ev.attention ?? needsAttention(ev.tone))) return false;
  if (!opts.on) return false;
  const t = Date.parse(ev.at ?? '');
  return !Number.isFinite(t) || opts.now - t <= ATTENTION_DAYS * 86_400_000;
}

/**
 * מה משורה אחת עולה ל«צריך אותך» (events מהחדש לישן): לכל לקוח — התוצאה
 * האחרונה שלו לפי raisesAttention, וכל «לא ידוע» שעוד פתוח — פעם אחת ללקוח.
 * ‼ לכל לקוח בנפרד, לא רק האירוע האחרון של השורה: ריצה של לקוח אחר אינה טיפול
 * בכשל של מיכל (היה: הכשל שלה נעלם כשדוד נכנס לתור). אירוע בלי לקוח (הודעה
 * אליך) — כולם קבוצה אחת: רק האחרון.
 * ‼ ריצה מול רשות: רק האחרונה של אותו לקוח — ריצה מאוחרת יותר אומרת שכבר
 * טיפלו (ניסיון חוזר מחייב אישור). הודעה ש«לא ידוע אם יצאה» — תמיד: היא
 * חוסמת את הבאות ולא מוכרעת מעצמה, גם כשאחריה נרשם דילוג.
 */
export function attentionEvents(events: RowEvent[], opts: { on: boolean; now: number }): RowEvent[] {
  const out: RowEvent[] = [];
  const seen = new Set<string>();
  const flagged = new Set<string>();
  for (const e of events) {
    const who = e.clientId ?? (e.sticky ? e.id : '');
    const newest = !seen.has(who);
    seen.add(who);
    if (!e.sticky) {
      if (newest && raisesAttention(e, opts)) out.push(e);
      continue;
    }
    if (flagged.has(who) || !(newest || e.id.startsWith('n:'))) continue;
    flagged.add(who);
    out.push(e);
  }
  return out;
}

/** כמה פריטים לכל שורה ב«צריך אותך» — השאר: «ועוד N» שפותח את השורה. */
export const ATTENTION_PER_ROW = 3;

// ─── הגעה מעמוד אחר ─────────────────────────────────────────────────────────

/**
 * לאן נוחתים: שורה לפתוח (ותת-שורה לגלול אליה), או קבוצה. ערכים ישנים
 * (‎'reminders'‎, ‎'notifications'‎, ‎'rem-<מפתח>'‎) מגיעים מ«מיילים», מ«הצעות
 * מחיר» ומכתובות שמורות; מזהה פעולה (shaam-sync…) — מהכרטיס ומהמסלולים.
 */
export function resolveAutomationFocus(focus: string | null | undefined, known: {
  rowIds: string[]; repAudiences: string[]; notificationKinds: string[];
}): { row?: string; sub?: string; group?: AutoGroupId } | null {
  if (!focus) return null;
  if (focus === 'reminders') return { group: 'client' };
  if (focus === 'authority') return { group: 'authority' };
  if (focus === 'onboarding') return { row: 'intake' };
  if (known.rowIds.includes(focus)) return { row: focus };
  if (focus.startsWith('rem-')) {
    const key = focus.slice(4);
    if (key === 'expiry' || key === 'quotation_expiry_reminder') return { row: 'expiry' };
    if (key === 'flow_stage_done') return { row: 'flow-notify' };
    if (known.repAudiences.includes(key)) return { row: 'rep-reminders', sub: key };
    if (known.notificationKinds.includes(key)) return { row: 'notifications', sub: key };
  }
  return null;
}

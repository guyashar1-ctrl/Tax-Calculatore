// ─── שורת המסלול בכרטיס הלקוח — מה קורה עכשיו ומה הבא, במשפט אחד ──────────────
// ‼ הכרטיס מציג קודם את הבקשות; המסלול הוא שורה מתחתן: «דוח שנתי 2026 · איסוף —
// 2 ממתינים לדוד · הבא: אישור הלקוח». הפירוט (רגעים, איך מגיע, עצירה, גרסאות)
// נפתח לפי צורך. כל ההחלטות בשרת — כאן רק ניסוח של מה ש-get_client_flow_runs החזיר.
// ‼ סדר הביצוע = עומק השרשרת של «נפתח אחרי», לא המקום ברשימה: שני שלבים שנפתחים
// באותו רגע הם «במקביל», ושלב שנפתח אחרי פריט בשלב הראשון בא אחריו גם אם הוגדר ראשון.

import {
  ACTION_WAIT_REASON, RUN_STATUS_LABELS, creationReasonText, skipReasonText,
  type ClientFlowRun, type RunActionState, type RunMaterialized, type RunStage,
} from '../../features/flows/api';
import { DELIVERY_LABELS, FLOW_ACTION_NAMES, actionTypeOf } from '../../features/flows/types';
import { AUTOMATION_JOB_STATUS_LABELS, type AutomationJobStatus } from '../../types/automation';
import { firstSentence } from '../../features/automation/automationCatalog';
import { formatDate } from '../../utils/dateFormat';
import { isSpouseConfirmTask } from '../../utils/requestAttention';

export type LineTone = 'blue' | 'red' | 'amber' | 'gray' | 'green';

/** שמות שהכרטיס יודע לתת — שלב לפי מפתח, פריט לפי מפתח, והשלב שבו הפריט נוצר. */
export interface RunNames {
  stage: (key: string) => string;
  item: (key: string) => string;
  /** השלב של פריט אצל הלקוח הזה (מהבקשה שנוצרה ממנו) — לעומק של «אחרי פריט». */
  itemStage: (key: string) => string | undefined;
}

export interface RunMoment<T = RunStage> {
  key: string;
  label: string;
  depth: number;
  stages: T[];
  /** כמה שלבים שחלים על הלקוח נפתחים ברגע הזה — «במקביל» רק כשיותר מאחד. */
  parallel: number;
}

/** שם בתוך כותרת רגע — קצר; השם המלא בשורת הבקשה. */
const clip = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/**
 * ‼ (4.10.2026, B1) שלב שמחכה ושלא יחול על הלקוח הזה (ענף של סוג אחר) — השרת מסמן אותו
 * «לא חל» רק כשההורה שלו מסתיים. אם השרת שולח willApply (לפי _flow_when_matches_kind על
 * עובדות הריצה), שלב כזה לא נספר «במקביל» ולא «הבא», ונאמר עליו «לא חל». בלי השדה — כמו קודם.
 */
export const willNotApply = (s: Pick<RunStage, 'state' | 'waitingKind' | 'willApply'>) =>
  s.state === 'waiting' && s.willApply === false && !s.waitingKind;

/** חל על הלקוח הזה — לא «לא חל», ולא ענף שכבר ידוע שלא יחול. */
const appliesHere = (s: RunStage) => s.state !== 'not_applicable' && !willNotApply(s);

/** רגעי הביצוע של ריצה אצל לקוח. */
export function runMoments(run: Pick<ClientFlowRun, 'stages' | 'trigger'>, names: RunNames): RunMoment[] {
  return momentsOf(run.stages, run.trigger, names, appliesHere);
}

/**
 * השלבים «הבאים» — שמחכים, חלים על הלקוח, ובעומק הקטן ביותר בשרשרת. ‼ אותו כלל כמו «הבא:»
 * בשורה הסגורה — ובפתיחה רק להם (ולשלב הפתוח) יש שורת «ללקוח».
 */
export function nextStageKeys(run: Pick<ClientFlowRun, 'stages' | 'trigger'>, names: RunNames): Set<string> {
  const moments = runMoments(run, names);
  const depthOf = new Map(moments.flatMap(m => m.stages.map(s => [s.key, m.depth] as const)));
  const waiting = run.stages.filter(s => s.state === 'waiting' && appliesHere(s));
  if (!waiting.length) return new Set();
  const min = Math.min(...waiting.map(s => depthOf.get(s.key) ?? 0));
  return new Set(waiting.filter(s => (depthOf.get(s.key) ?? 0) === min).map(s => s.key));
}

/**
 * רגעי הביצוע: «באישור ההצעה» / «כשהמסלול מתחיל», ואז «אחרי ש…» — לכל רשימת שלבים
 * עם «נפתח» (ריצה אצל לקוח, או תכנון בחלון ההפעלה).
 */
export function momentsOf<T extends { key: string; opens: RunStage['opens'] }>(
  stages: T[], trigger: ClientFlowRun['trigger'], names: RunNames, applies: (s: T) => boolean,
): RunMoment<T>[] {
  const byKey = new Map(stages.map(s => [s.key, s]));
  const memo = new Map<string, number>();
  const depth = (st: T, seen: Set<string>): number => {
    const hit = memo.get(st.key);
    if (hit !== undefined) return hit;
    if (seen.has(st.key)) return 0;
    seen.add(st.key);
    const o = st.opens;
    let d = 0;
    if (o?.after === 'stage') {
      const p = byKey.get(o.stage);
      d = p ? depth(p, seen) + 1 : 1;
    } else if (o?.after === 'item') {
      const sk = names.itemStage(o.item);
      const p = sk ? byKey.get(sk) : undefined;
      d = p && p.key !== st.key ? depth(p, seen) + 1 : 1;
    }
    memo.set(st.key, d);
    return d;
  };
  const start = trigger === 'quote_approved' ? 'באישור ההצעה' : 'כשהמסלול מתחיל';
  const moments = new Map<string, RunMoment<T>>();
  stages.forEach(st => {
    const d = depth(st, new Set());
    const o = st.opens;
    const key = o?.after === 'stage' ? `s:${o.stage}` : o?.after === 'item' ? `i:${o.item}` : 'start';
    // ‼ «אחרי ש…» ולא «אחרי «X»»: שלב בשם «אחרי אישור ההצעה» הפך ל«אחרי «אחרי…»», ולא
    // היה ברור שהשלב הקודם צריך להסתיים קודם.
    const label = o?.after === 'stage' ? `אחרי שהשלב «${clip(names.stage(o.stage))}» הושלם`
      : o?.after === 'item' ? `אחרי שהבקשה «${clip(names.item(o.item))}» הושלמה`
      : start;
    const m = moments.get(key);
    if (m) m.stages.push(st);
    else moments.set(key, { key, label, depth: d, stages: [st], parallel: 0 });
  });
  for (const m of moments.values()) m.parallel = m.stages.filter(applies).length;
  // יציב: אותו עומק — לפי הסדר שבו הרגע הופיע לראשונה.
  return [...moments.values()].map((m, i) => ({ m, i })).sort((a, b) => a.m.depth - b.m.depth || a.i - b.i).map(x => x.m);
}

/** משפט ראשון — רק אם הוא בעברית (חריגה לא צפויה נושאת אנגלית של הדפדפן האוטומטי). */
const hebrewSentence = (s?: string | null) => (s && /[֐-׿]/.test(s) ? firstSentence(s) : undefined);

export interface ActionStatus {
  name: string;
  text: string;
  waitsForYou: boolean;
  failed: boolean;
  /** רצה (או תרוץ) לבד — רק אז מוצג «לבד». ‼ לפי מה שהריצה הורשתה, לא לפי ההגדרה במסלול. */
  auto: boolean;
}

/** «ממתין» שאין בו מה לעשות — לא «ממתין לך», לא כחול ולא כפתור. */
const NOTHING_NEEDED = new Set(['recent_job']);
/** סיבות שהשרת מגיע אליהן רק אחרי שווידא שהריצה הורשתה לרוץ לבד (_flow_run_action, לפי הסדר). */
const AFTER_PERMISSION = new Set(['missing_input', 'not_represented', 'recent_job', 'deferred', 'worker_offline', 'not_connected', 'office_busy', 'auto_expired']);

/**
 * האם הריצה הורשתה להריץ פעולות «לבד» מול רשות. השרת שולח את זה (state.autoActions,
 * get_client_flow_runs) — ואם חסר (גרסה ישנה), מסיקים ממה שכבר קרה בפעולות.
 * לא ידוע ⇒ undefined, והמסך לא מבטיח «לבד».
 */
export function runAutoPermitted(run: Pick<ClientFlowRun, 'stages'> & { autoActions?: unknown }): boolean | undefined {
  if (typeof run.autoActions === 'boolean') return run.autoActions;
  const acts = run.stages.flatMap(st => st.actions ?? []);
  if (acts.some(a => a.state?.reason === 'run_not_authorized')) return false;
  if (acts.some(a => a.job?.auto || a.state?.state === 'queued'
    || (a.mode === 'auto' && a.state?.state === 'waiting_office' && AFTER_PERMISSION.has(a.state.reason ?? '')))) return true;
  return undefined;
}

/** פעולה מול רשות בתוך שלב — מה קרה בה ואם היא מחכה לך. */
export function actionStatus(a: RunActionState, stageOpen: boolean, permitted?: boolean): ActionStatus {
  const name = FLOW_ACTION_NAMES[actionTypeOf(a.ref)] ?? 'פעולה מול רשות';
  let text: string;
  let waitsForYou = false;
  let failed = false;
  let auto = false;
  // ‼ קריאה שבוטלה כי לא נלקחה בזמן — השרת כבר החזיר אותה אליך (waiting_office) עם הסיבה.
  const jobSuperseded = a.job?.status === 'cancelled' && a.state?.state === 'waiting_office';
  if (a.job && !jobSuperseded) {
    const st = a.job.status as AutomationJobStatus;
    auto = !!a.job.auto;
    if (st === 'succeeded') text = `נקרא${a.job.finishedAt ? ` ${formatDate(a.job.finishedAt, 'list')}` : ''}`;
    else if (st === 'failed') { const why = hebrewSentence(a.job.errorDetail); text = `נכשל${why ? ` — ${why}` : ''}`; failed = true; waitsForYou = true; }
    else if (st === 'needs_human') { const why = hebrewSentence(a.job.needsHuman) ?? hebrewSentence(a.job.errorDetail); text = `עצר — צריך אותך${why ? ` — ${why}` : ''}`; waitsForYou = true; }
    else if (st === 'cancelled') { const why = hebrewSentence(a.job.errorDetail); text = `בוטל${why ? ` — ${why}` : ''}`; waitsForYou = stageOpen; }
    else text = AUTOMATION_JOB_STATUS_LABELS[st] ?? 'בטיפול';
  } else if (a.state?.state === 'waiting_office') {
    const r = a.state.reason ?? '';
    if (NOTHING_NEEDED.has(r)) {
      text = 'לא נדרש — כבר נקרא בשבוע האחרון';
    } else if (r === 'run_not_authorized') {
      text = 'בלחיצה שלך — כשהופעל המסלול לא אושר להריץ פעולות לבד';
      waitsForYou = true;
    } else {
      const reason = r ? (ACTION_WAIT_REASON[r] ?? null) : null;
      text = `ממתין לך${reason ? ` — ${reason}` : ''}`;
      waitsForYou = true;
    }
  } else if (a.state?.state === 'queued') {
    text = 'בתור — ירוץ כשמחשב העבודה פנוי';
    auto = true;
  } else if (a.state?.state === 'already_open') {
    text = 'כבר יש קריאה פתוחה ללקוח הזה — אין צורך בעוד אחת';
  } else if (stageOpen) {
    text = 'ממתין לך';
    waitsForYou = true;
  } else if (a.mode !== 'auto') {
    text = 'בהמשך — בלחיצה שלך כשהשלב ייפתח';
  } else if (permitted === true) {
    text = 'בהמשך — תרוץ לבד כשהשלב ייפתח, אם מחשב העבודה פנוי';
    auto = true;
  } else if (permitted === false) {
    text = 'בהמשך — בלחיצה שלך (כשהופעל המסלול לא אושר להריץ פעולות לבד)';
  } else {
    text = 'בהמשך — כשהשלב ייפתח: לבד אם אישרת זאת בהפעלה, אחרת בלחיצה שלך';
  }
  return { name, text, waitsForYou, failed, auto };
}

/**
 * בקשות שדולגו בלי סיבה מוכרת (counts.stuck) — לא נחשבות כבוצעו, והשלב מחכה להן.
 * ‼ שלב כזה לעולם לא «הושלם»: הספירה הראתה «הושלם» והשלב הבא לא נפתח, בלי הסבר.
 */
const stuckOf = (st: Pick<RunStage, 'counts'>) => st.counts?.stuck ?? 0;
const stuckPart = (n: number) => (n === 1 ? '1 דולגה בלי «אין צורך»' : `${n} דולגו בלי «אין צורך»`);

/**
 * שורת הסבר בשלב פתוח שיש בו בקשה שדולגה בלי «אין צורך» — מה עוצר ואיך ממשיכים.
 * null = אין. ‼ רק בשלב פתוח: שלב שכבר נסגר לא «מחכה» (שם רק לא אומרים «הושלם»).
 */
export function stageStuckLine(st: Pick<RunStage, 'counts' | 'state'>): string | null {
  const n = stuckOf(st);
  if (n === 0 || st.state !== 'open') return null;
  return n === 1
    ? 'בקשה אחת דולגה בלי «אין צורך», ולכן לא נחשבת כבוצעה. השלב מחכה לה — עד שתפתח אותה מחדש או תסמן אותה «אין צורך».'
    : `${n} בקשות דולגו בלי «אין צורך», ולכן לא נחשבות כבוצעו. השלב מחכה להן — עד שתפתח אותן מחדש או תסמן אותן «אין צורך».`;
}

/**
 * שלב בריצה שהסתיימה — מילה אחת. ‼ גם כאן: דילוג בלי «אין צורך» אינו «הושלם».
 * ‼ ריצה שנסגרה כי ההתקשרות הסתיימה (closedBy 'engagement_ended') — השלב הפתוח לא «נסגר
 * באמצע» בידי מישהו; הבקשות שבו לא נגעו (end_engagement, 217) ועוברות לקליטה הבאה אם הלקוח חוזר.
 */
export function endedStageText(st: Pick<RunStage, 'state' | 'counts'>, closedBy?: string | null): string {
  if (st.state === 'done') { const n = stuckOf(st); return n ? stuckPart(n) : 'הושלם'; }
  if (st.state === 'open' && closedBy === 'engagement_ended') return 'נסגר עם סיום ההתקשרות';
  return st.state === 'not_applicable' ? 'לא חל' : st.state === 'open' ? 'נסגר באמצע' : 'לא נפתח';
}

/**
 * «קודם:» בפתיחת מסלול הקליטה של לקוח שחזר. ‼ ריצה שנסגרה עם סיום ההתקשרות הקודמת: מה שהיה
 * פתוח בה עבר לקליטה הזו כשנפתחה (217: _carry_open_work_to_engagement) — אומרים את זה, ולא רק «נסגר».
 */
export function previousRunText(prev: Pick<ClientFlowRun, 'flowName' | 'trigger' | 'cycleKey' | 'status' | 'doneAt' | 'cancelledAt' | 'closedBy'>,
  live: Pick<ClientFlowRun, 'trigger'>): string {
  const base = `${runTitle(prev)} — ${endedRunText(prev)}`;
  return prev.status === 'cancelled' && prev.closedBy === 'engagement_ended' && live.trigger === 'quote_approved'
    ? `${base}; הבקשות שהיו פתוחות בו עברו לקליטה הזו` : base;
}

/**
 * שלב שמוגבל לסוגי עוסק וסוג העוסק של הלקוח לא ידוע — לא נפתח ולא «לא חל» (217).
 * ‼ לא «בהמשך»: הוא לא מחכה לשלב קודם, הוא מחכה שמישהו יקבע את סוג העוסק.
 */
export const WAITING_KIND_TEXT = 'מחכה לסוג העוסק';

/**
 * (B4) בקשות בשלב שמחכות לסוג העוסק (kindWaitItems) — קצר, בשורת השלב. 0/חסר ⇒ null.
 * ‼ שלב שכולו מחכה לסוג (waitingKind) כבר אומר את זה — שם לא חוזרים.
 */
export function kindWaitPart(st: Pick<RunStage, 'kindWaitItems'>): string | null {
  const n = st.kindWaitItems ?? 0;
  if (n <= 0) return null;
  return n === 1 ? '1 מחכה לסוג העוסק' : `${n} מחכות לסוג העוסק`;
}

/** «אצל מי» בשלב פתוח — מספרים, בלי שמות בקשות (הן בשורות שמעל). */
export function stageWho(st: RunStage, firstName: string): string {
  const c = st.counts;
  const stuck = stuckOf(st);
  if (st.state === 'done' && stuck === 0) return `הושלם${st.doneAt ? ` ${formatDate(st.doneAt, 'list')}` : ''}`;
  if (st.state === 'not_applicable' || willNotApply(st)) return 'לא חל על הלקוח הזה';
  if (st.waitingKind && st.state !== 'open') return WAITING_KIND_TEXT;
  const kindPart = kindWaitPart(st);
  if (st.state === 'waiting') {
    // ‼ «הכול באישורך»: גם כשהשלב ייפתח — לא יופיע בדף עד שתאשר.
    const base = st.delivery === 'hold' && (c?.awaitingStage ?? 0) > 0 ? 'בהמשך · יחכה לאישורך כשייפתח' : 'בהמשך';
    return kindPart ? `${base} · ${kindPart}` : base;
  }
  const parts: string[] = [];
  if (stuck) parts.push(stuckPart(stuck));
  if (kindPart && st.state !== 'done') parts.push(kindPart);
  if (c?.office) parts.push(`${c.office} אצלך`);
  if (st.delivery === 'hold' && c?.drafts) parts.push(c.drafts === 1 ? '1 מחכה לאישורך' : `${c.drafts} מחכים לאישורך`);
  if (c?.client) parts.push(c.client === 1 ? `1 ממתין ל${firstName}` : `${c.client} ממתינים ל${firstName}`);
  if (c?.external) parts.push(`${c.external} אצל גורם חיצוני`);
  if (parts.length === 0) return c && c.total > 0 && c.done === c.total ? 'הושלם' : 'פתוח';
  return parts.join(' · ');
}

/**
 * שלב ש«עובר הלאה» — אין בו למה לחכות: לא חל, או שאין בו בקשה שמחזיקה את השלב הבא
 * (counts.gates === 0 — אותו מסנן כמו _flow_gate_steps: לא בוטלה, ומפריט חובה או
 * שצורפה ידנית). ‼ לכל סוגי המסלולים — גם ידני ושנתי, שבהם «חובה לסגירה» תמיד false
 * ולא מבדיל בין חובה לרשות. שרת ישן בלי gates — legacy (מה שהכרטיס יודע).
 */
export function stagePassesThrough(s: Pick<RunStage, 'state' | 'counts'>, legacy: () => boolean = () => false): boolean {
  if (s.state === 'not_applicable') return true;
  const g = s.counts?.gates;
  if (typeof g === 'number') return g === 0;
  if ((s.counts?.total ?? 0) === 0) return true;
  return legacy();
}

/** ‼ בתוך כרטיס הלקוח לא אומרים «בכרטיס הלקוח» — המשתמש כבר בו (DELIVERY_LABELS נכתבו לבונה). */
const inCard = (s: string) => s.replace(/ בכרטיס הלקוח/g, '');

/**
 * «מה מגיע ללקוח» בשלב — ההגדרה: איך מגיע, ותזכורת/הודעה אליך אם הוגדרו. ‼ לחלון ההפעלה, שמראה
 * מה יקרה לפני שמשהו נפתח; בפתיחת מסלול שכבר רץ — stageClientLine (המצב, לא ההגדרה).
 */
export function stageDeliveryLines(st: Pick<RunStage, 'delivery' | 'reminder'> & { notifyOffice?: boolean }): string[] {
  const d = DELIVERY_LABELS[st.delivery] ?? DELIVERY_LABELS.approve;
  // ‼ «הכול באישורך»: העובדה החשובה היא שהלקוח לא רואה כלום עד שתאשר — לפני המייל.
  const out = [inCard(st.delivery === 'hold' ? `${d.short} — ${d.page}; ${d.mail}` : `${d.short} — ${d.mail}`)];
  const extra: string[] = [];
  // ‼ «רק בדף» — בלי מייל ולכן בלי תזכורת (214), גם אם נשאר ערך ישן.
  if (st.reminder && st.delivery !== 'page') {
    extra.push(`תזכורת ללקוח אחרי ${st.reminder.afterDays} ימים${st.reminder.max > 1 ? `, עד ${st.reminder.max} פעמים` : ''}`);
  }
  if (st.notifyOffice) extra.push('הודעה אליך כשהשלב מסתיים');
  if (extra.length) out.push(extra.join(' · '));
  return out;
}

/**
 * «ללקוח:» בשלב, בפתיחת המסלול בכרטיס הלקוח — שורה אחת, ורק בשלב הפתוח ובבא אחריו (B2/B3,
 * 4.10.2026). ‼ מצב, לא הגדרה: שלב «מחכה לאישורך» שמה שבו כבר בדף אומר «בדף», לא «לא מופיע
 * בדף עד שתאשר» (זו הייתה סתירה ל«2 ממתינים לשרון» שלידו). הגדרת השלב — בבונה.
 * ‼ בלי «בכרטיס הלקוח» — המשתמש כבר בו.
 * ‼ «מייל כשתלחץ…» רק כשיש בדף מה שעוד לא הוכרז (counts.unannounced — אותו מסנן כמו
 * _client_announceable_steps, 214): אחרי שהמייל יצא אין מה לומר עליו כאן.
 * @returns null — שלב שאין עליו מה לומר (לא פתוח ולא הבא).
 */
export function stageClientLine(
  st: Pick<RunStage, 'delivery' | 'reminder' | 'state'> & { counts?: Partial<RunStage['counts']> | null },
  o: { paused?: boolean } = {},
): string | null {
  const page = st.delivery === 'page';
  if (st.state === 'waiting') {
    return page ? 'כשייפתח — רק בדף ובלי מייל'
      : st.delivery === 'hold' ? 'כשייפתח — לא בדף עד «פרסם בדף»'
      : st.delivery === 'auto' ? 'כשייפתח — מייל יוצא לבד תוך כמה דקות'
      : 'כשייפתח — מייל כשתלחץ «שלח מייל…»';
  }
  if (st.state !== 'open') return null;
  // ‼ «רק בדף» — בלי מייל ולכן בלי תזכורת (214), גם אם נשאר ערך ישן.
  if (page) return 'רק בדף — בלי מייל ובלי תזכורות';
  const c = st.counts ?? {};
  const parts: string[] = [(st.delivery === 'hold' && (c.drafts ?? 0) > 0) ? 'מה שמחכה לאישורך — לא בדף עד «פרסם בדף»' : 'בדף'];
  if ((c.unannounced ?? 0) > 0) {
    parts.push(st.delivery !== 'auto' ? 'מייל כשתלחץ «שלח מייל…»'
      : o.paused ? 'בעצירה — מייל לא יוצא לבד עד «חידוש…»' : 'מייל יוצא לבד תוך כמה דקות');
  }
  if (st.reminder) parts.push(`תזכורת אחרי ${st.reminder.afterDays} ימים${st.reminder.max > 1 ? `, עד ${st.reminder.max} פעמים` : ''}`);
  return parts.join(' · ');
}

/**
 * מה קרה בהפעלה / בהוספה / בעדכון — שורה לכל דבר, מתשובת השרת.
 * ‼ בקשה שהייתה אמורה להיווצר ולא נוצרה (problem) — קודם, ובנפרד מדילוג תמים: היא
 * שורה אדומה ברשימת הבקשות, עם הסיבה ו«צור שוב» / «אין צורך». דילוג תמים (לא חל,
 * כבר קיים) — «דולגה …» כמו קודם. שרת ישן (בלי problem) — הכול «דולגה».
 * @param firstName שם בעל הכרטיס — «מופיעה באדום ברשימת הבקשות של דוד».
 */
export function materializedSummary(r: RunMaterialized, title: (key: string) => string, firstName?: string): string[] {
  const out: string[] = [];
  const skipped = r.skipped ?? [];
  const who = (role?: string) => (role === 'spouse' ? ' (בן/בת הזוג)' : '');
  const where = firstName ? `ברשימת הבקשות של ${firstName}` : 'ברשימת הבקשות של הלקוח';
  for (const s of skipped.filter(x => x.problem)) {
    out.push(`לא נוצרה «${title(s.itemKey)}»${who(s.role)} — ${creationReasonText(s.reason)}. היא מופיעה באדום ${where}.`);
  }
  // משימה למשרד (אישור אישי של בן/בת הזוג) אינה «בקשה» ללקוח — נאמרת בנפרד.
  const tasks = (r.created ?? []).filter(c => c.officeTask);
  const created = (r.created?.length ?? 0) - tasks.length;
  if (created > 0) out.push(created === 1 ? 'נוספה בקשה אחת' : `נוספו ${created} בקשות`);
  for (const t of tasks) out.push(`נפתחה לך משימה: להשיג את האישור האישי של בן/בת הזוג ל«${title(t.itemKey)}» (אין לו/ה דף משלו) — היא בראש רשימת הבקשות`);
  for (const s of skipped.filter(x => !x.problem)) out.push(`דולגה «${title(s.itemKey)}»${who(s.role)} — ${skipReasonText(s.reason)}`);
  if (out.length === 0) out.push('לא נוסף דבר');
  return out;
}

/** משימת המשרד במקום אישור אישי של בן/בת הזוג — ההגדרה ב-requestAttention (מקור אחד). */
export { isSpouseConfirmTask };

/**
 * שם השורה של משימת האישור האישי: «אישור אישי של רותם · אישור תנאי שכר טרחה».
 * ‼ הכותרת מהשרת היא «… — «X»», והחיתוך הרגיל השאיר רק «אישור אישי של רותם» —
 * שתי משימות כאלה נראו זהות.
 */
export function spouseTaskName(title: string): string {
  const m = /^(.+?)\s+[—–-]\s+«?(.+?)»?$/.exec(title.trim());
  return m ? `${m[1]} · ${m[2]}` : title.trim();
}

/**
 * בקשה שנוספה ידנית אחרי שהמסלול התחיל — אפשר לצרף אותה לשלב פתוח (attach_step_to_flow_stage).
 * ‼ draft: עוד לא פורסמה (publishedAt === null; חסר = נתון ישן, מפורסם — stepFromDb).
 * הצירוף לא מפרסם ולא שולח מייל עליה (215: התור רק לבקשה שפורסמה), וגם «פרסם בדף»
 * אחר כך לא שולח — החלון חייב לומר את זה.
 */
export interface LateCandidate { id: string; title: string; draft: boolean }
export function lateCandidates<S extends {
  id: string; stepType: string; status: string; ball?: string | null; flowRunId?: string | null; createdAt?: string; payload?: object;
  publishedAt?: string | null;
}>(steps: S[], run: Pick<ClientFlowRun, 'startedAt'>, repeatable: readonly string[], title: (s: S) => string): LateCandidate[] {
  const started = Date.parse(run.startedAt ?? '') || 0;
  return steps
    .filter(s => !s.flowRunId && repeatable.includes(s.stepType)
      && !['completed', 'verified', 'skipped', 'cancelled', 'locked'].includes(s.status)
      // ‼ טופס חכם ומשימת האישור האישי של בן/בת הזוג — מחזור משלהם, לא חלק משלב.
      && !(s.payload as { smartForm?: unknown } | undefined)?.smartForm
      && !isSpouseConfirmTask(s)
      // ‼ שורה «לא נוצרה» — משימה של המשרד במקום בקשה שלא נוצרה; היא לא «נוספה» לשלב.
      && !(s.payload as { creationProblem?: unknown } | undefined)?.creationProblem
      // ‼ בקשות הקליטה נוצרות באותה עסקה שבה הריצה מתחילה (אותו now()) — הן לא
      // «נוספו אחר כך». מה שנוסף ב«＋ בקשה חדשה» בא דקות או ימים אחרי.
      && (Date.parse(s.createdAt ?? '') || 0) > started + 60_000)
    .map(s => ({ id: s.id, title: title(s), draft: s.publishedAt === null }));
}

/**
 * השלבים שמחכים לשלב — מי שנפתח אחריו ישירות, ומי שנפתח אחרי שלב שאין בו מה לחכות
 * לו (passThrough) ולכן מחכה ישר לשלב הזה. ‼ כמו _flow_gate_steps (215): שלב בלי
 * בקשת חובה (לא חל, רק רשות, רק פעולות) עובר הלאה להורה שלו — ובקשה שצורפה לשלב
 * מעכבת גם את מי שמעבר לו. שלב «אחרי פריט» מחכה לפריט עצמו, לא לבקשה שצורפה.
 */
export function stagesHeldBy<T extends { key: string; opens?: RunStage['opens'] | null; state?: string }>(
  stages: T[], stageKey: string, passThrough: (s: T) => boolean,
): T[] {
  const out: T[] = [];
  const seen = new Set([stageKey]);
  const queue = [stageKey];
  while (queue.length) {
    const from = queue.shift()!;
    for (const s of stages) {
      if (seen.has(s.key) || s.opens?.after !== 'stage' || s.opens.stage !== from) continue;
      seen.add(s.key);
      // לא חל — לא נפתח בכלל; פתוח/הושלם — כבר לא «ייפתח».
      if (!['not_applicable', 'open', 'done'].includes(s.state ?? '')) out.push(s);
      if (passThrough(s)) queue.push(s.key);
    }
  }
  return out;
}

/**
 * ‼ (B5, 4.10.2026) חלון העדכון לגרסה חדשה: בקשת חובה שנוספת לשלב פתוח (או עוברת אליו)
 * מעכבת את מה שנפתח אחריו — כמו בצירוף. «‹«X» ייפתח רק כשגם היא תסתיים›». השלב לא פתוח /
 * רשות / לא ידוע אם חובה — null (לא אומרים מה שלא בטוח).
 */
export function heldByAddedText<T extends { key: string; name: string; opens?: RunStage['opens'] | null; state?: string }>(
  stages: T[], stageKey: string | undefined, required: boolean | undefined, passThrough: (s: T) => boolean,
): string | null {
  const st = stages.find(x => x.key === stageKey);
  if (!st || st.state !== 'open' || required !== true) return null;
  const held = stagesHeldBy(stages, st.key, passThrough);
  if (!held.length) return null;
  return `${held.map(x => `«${x.name}»`).join(', ')} ${held.length > 1 ? 'ייפתחו' : 'ייפתח'} רק כשגם היא תסתיים`;
}

/**
 * מה קורה לבקשה שמצורפת לשלב — שורות לחלון הצירוף, לפי מה שנבחר.
 * ‼ טיוטה: הצירוף מעכב את השלב, אבל לא מפרסם ולא שולח (215: attach_step_to_flow_stage
 * מכניס לתור רק בקשה שפורסמה; publish_case_changes לא מכניס לתור).
 * ‼ מסלול בעצירה: שום מייל לא יוצא לבד עכשיו — החידוש מוציא אותו (resume_flow_run).
 * ‼ «מחכה לאישורך» ובקשה שכבר בדף: הצירוף לא מוריד אותה מהדף (215) — לא אומרים עליה
 * «לא מופיע בדף עד שתאשר»; המייל עליה — כשתלחץ «שלח מייל…» (השלב לא שולח לבד).
 * ‼ «מייל אוטומטי» וטיוטה: הפרסום עצמו לא שולח, אבל אחריו היא חדשה ולא הוכרזה, ולכן
 * נכללת במייל האוטומטי הבא של הלקוח (214: האוטומטי לוקח כל בקשת «אוטומטי» שלא הוכרזה).
 * ‼ (4.10.2026, B:X-2) שורה אחת לכל קבוצה — מה קורה בדף ואם יוצא מייל, בלי לחזור על «נשארת
 * בדף» ובלי «הודעה אליך» (היא על השלב, לא על הבקשה). מה שמחכה לה — בחלון עצמו (stagesHeldBy).
 */
export function attachLines(
  stage: Pick<RunStage, 'delivery'>,
  o: { paused: boolean; drafts: number; published: number },
): { label?: string; text: string }[] {
  const out: { label?: string; text: string }[] = [];
  const page = stage.delivery === 'page';
  const auto = stage.delivery === 'auto';
  if (o.published > 0) {
    const many = o.published > 1;
    const it = many ? 'עליהן' : 'עליה';
    const mail = page ? 'בלי מייל ובלי תזכורות — השלב «רק בדף»'
      : auto ? (o.paused ? 'המסלול בעצירה — מייל לא ייצא לבד עד «חידוש…»' : `מייל ${it} יוצא לבד תוך כמה דקות`)
      : `מייל ${it} — כשתלחץ «שלח מייל…»`;
    out.push({ label: o.drafts > 0 ? 'מה שכבר בדף:' : 'כבר בדף:', text: `${many ? 'נשארות בדף' : 'נשארת בדף'}; ${mail}` });
  }
  if (o.drafts > 0) {
    const one = o.drafts === 1;
    const notYet = one ? 'לא תופיע בדף עד «פרסם בדף»' : 'לא יופיעו בדף עד «פרסם בדף»';
    // ‼ «רק בדף»: גם «שלח מייל…» לא כולל אותה (214) — אין מייל עליה בכלל.
    const mail = page ? (one ? 'ומייל עליה לא ייצא גם אחר כך' : 'ומייל עליהן לא ייצא גם אחר כך')
      : auto ? `הפרסום עצמו לא שולח — אחריו ${one ? 'היא תיכלל' : 'הן ייכללו'} במייל האוטומטי הבא${o.paused ? ' (אחרי «חידוש…»)' : ''}, או כשתלחץ «שלח מייל…»`
      : 'גם הפרסום עצמו לא שולח מייל — שולחים ב«שלח מייל…»';
    out.push({ label: one ? 'עדיין טיוטה:' : 'עדיין טיוטות:', text: `${notYet}; ${mail}` });
  }
  return out;
}

export interface RunLineText {
  /** «דוח שנתי 2026» */
  title: string;
  /** השלב (או השלבים) הפתוח — «איסוף». גם בטלפון: נחתך «הבא», לא השלב. */
  stage: string | null;
  /** אצל מי — מה שאצלך קודם: «1 אצלך · 2 ממתינים לדוד» / «בעצירה — …» */
  who: string;
  /** stage — who, כמשפט אחד. */
  where: string;
  /** «הבא: אישור הלקוח» */
  next: string | null;
  tone: LineTone;
  /** סימנים קטנים בתוך השורה — לא באנר מעל העבודה. ‼ לכל סימן גם ניסוח קצר לטלפון. */
  marks: LineMark[];
}

export interface LineMark { full: string; short: string }

export const runTitle = (run: Pick<ClientFlowRun, 'flowName' | 'trigger' | 'cycleKey'>) =>
  `${run.flowName}${run.trigger === 'annual' && /^\d{4}$/.test(run.cycleKey ?? '') ? ` ${run.cycleKey}` : ''}`;

/**
 * ריצה שהסתיימה — במילים ועם התאריך: «הושלם 02.10.26» / «בוטל 02.10.26».
 * ‼ ריצה שנסגרה כי ההתקשרות הקודמת הסתיימה (לקוח שחזר — closedBy='engagement_ended')
 * אינה «בוטל»: אף אחד לא ביטל אותה.
 */
export function endedRunText(run: Pick<ClientFlowRun, 'status' | 'doneAt' | 'cancelledAt' | 'closedBy'>): string {
  const at = run.status === 'done' ? run.doneAt : run.cancelledAt;
  const date = at ? ` ${formatDate(at, 'list')}` : '';
  if (run.status === 'cancelled' && run.closedBy === 'engagement_ended') return `נסגר עם סיום ההתקשרות${date}`;
  return `${RUN_STATUS_LABELS[run.status]}${date}`;
}

/**
 * ‼ «לא נשלח ללקוח לבד» נשען על השרת: עצירה עוצרת את מיילי השלבים והתזכורות של
 * המסלול, ובמסלול הקליטה גם את תזכורות הייצוג. פעולה מול רשות שכבר התחילה — ממשיכה,
 * ומייל שהמשרד שולח בעצמו יוצא כרגיל; זה נאמר בפתיחה ובחלון העצירה.
 */
/**
 * ‼ (4.10.2026, B6) «בעצירה» במילה אחת בשורה — המשפט המלא פעם אחת, בתיבה שבפתיחה (עם «חידוש…»),
 * ולא ארבע פעמים (מגש, שורה, הודעה ירוקה ותיבה).
 */
export const PAUSED_LINE = 'בעצירה';

/**
 * השורה הסגורה של ריצה אחת.
 * @param late כמה בקשות שנוספו ידנית אפשר לצרף לשלב פתוח — סימן בשורה, כדי שלא
 *   יימצא רק בתוך הפתיחה.
 */
export function runLine(run: ClientFlowRun, firstName: string, names: RunNames, late = 0): RunLineText {
  const marks: LineMark[] = [];
  if (late > 0) marks.push({ full: late === 1 ? 'נוספה בקשה — לצרף לשלב?' : `נוספו ${late} בקשות — לצרף לשלב?`, short: 'לצרף בקשה?' });
  if (run.upgradeAvailable) marks.push({ full: 'יש עדכון למסלול', short: 'עדכון' });
  if (run.suggestions > 0) marks.push({ full: 'פרטי הלקוח השתנו', short: 'פרטים השתנו' });
  // ‼ שלב שמחכה לסוג העוסק — סימן בשורה (הוא לא נפתח עד שקובעים אותו בתיק המס).
  // (B4) גם בקשות בשלב פתוח שמחכות לסוג (kindWaitItems) — אותו סימן: קובעים את הסוג בתיק המס.
  const kindWait = run.status === 'active' && run.stages.some(s => s.state !== 'not_applicable'
    && ((s.waitingKind && s.state !== 'open' && s.state !== 'done') || (s.state !== 'done' && (s.kindWaitItems ?? 0) > 0)));
  if (kindWait) marks.push({ full: WAITING_KIND_TEXT, short: 'סוג העוסק' });
  const title = runTitle(run);
  const line = (stage: string | null, who: string, next: string | null, tone: LineTone): RunLineText =>
    ({ title, stage, who, where: stage ? `${stage} — ${who}` : who, next, tone, marks });

  const open = run.stages.filter(s => s.state === 'open');
  const permitted = runAutoPermitted(run);
  const acts = open.flatMap(st => (st.actions ?? []).map(a => actionStatus(a, true, permitted)));
  const failed = acts.some(a => a.failed || /^עצר/.test(a.text));
  const actsWaiting = acts.filter(a => a.waitsForYou);

  if (run.status === 'paused') return line(null, PAUSED_LINE, null, 'amber');

  const moments = runMoments(run, names);
  const depthOf = new Map(moments.flatMap(m => m.stages.map(s => [s.key, m.depth] as const)));
  // ‼ ענף שכבר ידוע שלא יחול (willApply=false) — לא «הבא».
  const waiting = run.stages.filter(s => s.state === 'waiting' && appliesHere(s));
  const minDepth = Math.min(...waiting.map(s => depthOf.get(s.key) ?? 0));
  const nextStages = waiting.filter(s => (depthOf.get(s.key) ?? 0) === minDepth);
  const next = nextStages.length === 0 ? null
    : `הבא: ${nextStages[0].name}${nextStages.length > 1 ? ` ועוד ${nextStages.length - 1}` : ''}`;

  if (open.length === 0) {
    const live = run.stages.filter(appliesHere);
    // ‼ בקשה שדולגה בלי «אין צורך» — לא «הכול הושלם» (stuckOf).
    const stuckDone = live.reduce((a, s) => a + stuckOf(s), 0);
    if (stuckDone > 0) return line(null, stuckPart(stuckDone), next, 'blue');
    if (live.length > 0 && live.every(s => s.state === 'done')) return line(null, 'הכול הושלם', null, 'green');
    // שום דבר לא פתוח, והבא מחכה לסוג העוסק — זה מה שעוצר, וזה אצלך. השורה אומרת את זה — בלי סימן כפול.
    if (kindWait && nextStages.length > 0 && nextStages.every(s => s.waitingKind)) {
      return { ...line(null, WAITING_KIND_TEXT, next, 'blue'), marks: marks.filter(m => m.full !== WAITING_KIND_TEXT) };
    }
    return line(null, 'ממתין לשלב הבא', next, 'gray');
  }

  const sum = (k: keyof RunStage['counts']) => open.reduce((a, s) => a + (s.counts?.[k] ?? 0), 0);
  const client = sum('client'), office = sum('office'), external = sum('external'), stuck = sum('stuck');
  const drafts = open.filter(s => s.delivery === 'hold').reduce((a, s) => a + (s.counts?.drafts ?? 0), 0);
  // ‼ מה שאצלך קודם — זו שורת עבודה של המשרד; בטלפון הסוף עלול להיחתך.
  const who: string[] = [];
  if (actsWaiting.length === 1) who.push(`${actsWaiting[0].name} ${actsWaiting[0].failed ? 'נכשלה' : 'ממתינה לך'}`);
  else if (actsWaiting.length > 1) who.push(`${actsWaiting.length} פעולות מול רשות ממתינות לך`);
  if (stuck) who.push(stuckPart(stuck));
  if (office) who.push(`${office} אצלך`);
  if (drafts) who.push(drafts === 1 ? '1 מחכה לאישורך' : `${drafts} מחכים לאישורך`);
  if (client) who.push(client === 1 ? `1 ממתין ל${firstName}` : `${client} ממתינים ל${firstName}`);
  if (external) who.push(`${external} אצל גורם חיצוני`);
  const stageNames = open.length <= 2 ? open.map(s => s.name).join(' + ') : `${open.length} שלבים פתוחים`;
  const tone: LineTone = failed ? 'red' : (office > 0 || drafts > 0 || stuck > 0 || actsWaiting.length > 0) ? 'blue' : 'gray';
  return line(stageNames, who.length ? who.join(' · ') : 'פתוח', next, tone);
}

/** אצל מי שורת בקשה — כפי שהרשימה מציגה אותה (null = לא נספרת: נעולה / הושלמה). */
export type RowBucket = 'office' | 'client' | 'external' | 'draft' | null;

/**
 * «אצל מי» בשלב — נספר לפי השורות שהרשימה מציגה, לא לפי בקשות.
 * ‼ השרת סופר בקשות; הרשימה מקפלת שרשרת (פרטי רו״ח קודם בתוך מכתב ההעברה) לשורה
 * אחת שמצבה לפי הראשית. «3 ממתינים לנועה» מעל שתי שורות «ממתין לנועה» לימד לא
 * לסמוך על השורה. אין בכרטיס אף בקשה של השלב ⇒ null, ונשארים עם מה שהשרת ספר.
 */
export function rowCounts<S extends { id: string; status: string; flowRunId?: string | null; flowStageKey?: string | null }>(
  runId: string, stageKey: string, steps: S[], rowOf: (s: S) => S, bucketOf: (row: S) => RowBucket,
  base: RunStage['counts'],
): RunStage['counts'] | null {
  const inStage = steps.filter(s => s.flowRunId === runId && s.flowStageKey === stageKey && s.status !== 'cancelled');
  if (inStage.length === 0) return null;
  const rows = new Map<string, S>();
  for (const s of inStage) {
    if (['completed', 'verified', 'skipped'].includes(s.status)) continue;
    const row = rowOf(s);
    rows.set(row.id, row);
  }
  const n = { office: 0, client: 0, external: 0, drafts: 0 };
  for (const row of rows.values()) {
    const b = bucketOf(row);
    if (b === 'draft') n.drafts++;
    else if (b) n[b]++;
  }
  return { ...base, ...n };
}

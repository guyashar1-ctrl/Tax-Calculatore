import { Task, BallWith, Client } from '../types';
import { BALL_WITH_LABELS } from '../types';
import { daysBetween, todayIso, formatDate, daysLate } from './dateFormat';

export { daysLate, lateLabel } from './dateFormat';

/* ─── הפרדיקטים של משימה — נכתבים פעם אחת ─────────────────────────────────
 * ‼ (168) הביקורת מצאה 11 ניסוחים של "משימה פתוחה", 5 של "באיחור" (אחד מהם
 * השווה תאריכים ב-UTC וקפץ יום בלילה), ותג בכותרת שספר "אצלי+תקועה" בזמן
 * שלשונית «לטיפולי» ספרה את כל הפתוחות. כל מסך ומונה עובר דרך הפונקציות
 * האלה; מסנן מקומי על task.status או על task.dueDate הוא באג.
 */

/** פתוחה = כל מה שלא הושלם. */
export const isOpenTask = (t: Pick<Task, 'status'>): boolean => t.status !== 'done';

/** באיחור = פתוחה, ותאריך היעד קטן מהיום. ‼ השוואת תאריכים בלבד, לפי השעון
 *  המקומי (todayIso) — לא מילישניות ולא UTC, אחרת "היום" קופץ ב-21:00. */
export const isLateTask = (t: Pick<Task, 'status' | 'dueDate'>): boolean =>
  isOpenTask(t) && !!t.dueDate && daysLate(t.dueDate) > 0;

/** דורשת אותי = פתוחה והכדור אצלי, או תקועה (תקועה היא תמיד שלי לשחרר). */
export const taskNeedsMe = (t: Pick<Task, 'status' | 'ballWith'>): boolean =>
  isOpenTask(t) && (t.ballWith === 'me' || t.ballWith === 'stuck');

/** משפט המצב של הכדור — "הכדור אצל הלקוח", לא "הכדור אצלי" לכל מה שלא תקוע. */
export function ballLabel(t: Pick<Task, 'ballWith'>): string {
  if (t.ballWith === 'stuck') return 'תקועה';
  if (t.ballWith === 'me') return 'הכדור אצלי';
  return `הכדור אצל ${BALL_WITH_LABELS[t.ballWith]}`;
}

/** לקוחות בארכיון — המשימות שלהם לא נספרות בשום מונה. */
export function archivedClientIds(clients: Pick<Client, 'id' | 'lifecycleStage'>[]): Set<string> {
  return new Set(clients.filter(c => c.lifecycleStage === 'archived').map(c => c.id));
}

/** האם המשימה נספרת — משימה של לקוח בארכיון לא. משימה בלי לקוח כן. */
export const countsForClient = (t: Pick<Task, 'clientId'>, archived: Set<string>): boolean =>
  !t.clientId || !archived.has(t.clientId);

/** המספר על תג «משימות» בכותרת: דורשות אותי, בלי לקוחות בארכיון. */
export function countTasksNeedingMe(tasks: Task[], clients: Pick<Client, 'id' | 'lifecycleStage'>[]): number {
  const archived = archivedClientIds(clients);
  return tasks.filter(t => taskNeedsMe(t) && countsForClient(t, archived)).length;
}

export type DeskBucket = 'urgent' | 'thisWeek' | 'stuck' | 'backlog';

export interface BucketedTasks {
  urgent: Task[];      // דחוף או עבר דד-ליין
  thisWeek: Task[];    // דד-ליין בשבוע הקרוב
  stuck: Task[];       // תקוע
  backlog: Task[];     // FIFO
}

/**
 * חלוקת משימות פתוחות למקטעים של מסך "על השולחן" — רק אצלי + תקועות.
 * מיון בכל מקטע: דד-ליין עולה ואז createdAt עולה (FIFO).
 */
export function bucketMyDeskTasks(tasks: Task[]): BucketedTasks {
  const today = todayIso();
  const openMine = tasks.filter(taskNeedsMe);

  const urgent: Task[] = [];
  const thisWeek: Task[] = [];
  const stuck: Task[] = [];
  const backlog: Task[] = [];

  for (const t of openMine) {
    const daysToDue = t.dueDate ? daysBetween(t.dueDate, today) : null;

    if (t.priority === 'urgent' || (daysToDue !== null && daysToDue <= 0)) {
      urgent.push(t);
    } else if (daysToDue !== null && daysToDue <= 7) {
      thisWeek.push(t);
    } else if (t.ballWith === 'stuck') {
      stuck.push(t);
    } else {
      backlog.push(t);
    }
  }

  const sortFn = (a: Task, b: Task): number => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  };

  urgent.sort(sortFn);
  thisWeek.sort(sortFn);
  stuck.sort(sortFn);
  backlog.sort(sortFn);

  return { urgent, thisWeek, stuck, backlog };
}

/** האם המשימה באיחור (דד-ליין עבר + לא סגורה). שם ישן ל-isLateTask. */
export const isOverdue = isLateTask;

/** האם דד-ליין תוך 7 ימים */
export function isDueThisWeek(task: Task): boolean {
  if (!isOpenTask(task) || !task.dueDate) return false;
  const d = daysBetween(task.dueDate, todayIso());
  return d >= 0 && d <= 7;
}

/**
 * פורמט תאריך יעד לרשימות — dd.mm.yy (D8).
 * "היום"/"מחר" נשארו כי הם קריאים יותר ממספר, אבל המילה "פג" הוסרה:
 * האיחור מסומן בצבע ובטולטיפ, לא בטקסט שני ליד התאריך (D2/§4.3).
 */
export function formatDueDate(iso: string): string {
  const diff = daysBetween(iso, todayIso());
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  return formatDate(iso, 'list');
}

/** פורמט תאריך יצירה — dd.mm.yy */
export function formatCreatedAt(iso: string): string {
  return formatDate(iso, 'list');
}

/**
 * דחיפות התאריך — קובעת את הצבע, ורק אותו (D2).
 * אדום = איחור בלבד. שבוע קרוב = הדגשה בלי צבע. כל השאר = רגיל.
 */
export type DueTone = 'late' | 'soon' | 'normal' | 'none';

export function dueTone(task: Task): DueTone {
  if (!task.dueDate) return 'none';
  if (!isOpenTask(task)) return 'normal';
  if (isLateTask(task)) return 'late';
  const d = daysBetween(task.dueDate, todayIso());
  return d <= 7 ? 'soon' : 'normal';
}

/** ─── קיבוץ משימות · אפיון D6 / L8 ──────────────────────────────────────
 * ארבע קבוצות, בסדר קבוע, זהות במסך המשימות ובלשונית המשימות של הלקוח.
 * "תקועות" היא קבוצה בפני עצמה ולא נבלעת בתוך קבוצה בריאה — משימה תקועה
 * שמסתתרת בין משימות רגילות היא בדיוק המשימה שנשכחת.
 */
export type TaskGroupKey = 'now' | 'stuck' | 'later' | 'done';

export const TASK_GROUP_ORDER: TaskGroupKey[] = ['now', 'stuck', 'later', 'done'];

export const TASK_GROUP_LABELS: Record<TaskGroupKey, string> = {
  now: 'לטיפול מיידי',
  stuck: 'תקועות',
  later: 'בהמשך',
  done: 'הושלמו',
};

export function taskGroupOf(task: Task): TaskGroupKey {
  if (!isOpenTask(task)) return 'done';
  if (task.ballWith === 'stuck') return 'stuck';
  const tone = dueTone(task);
  return tone === 'late' || tone === 'soon' ? 'now' : 'later';
}

/** ממיין בתוך קבוצה: תאריך יעד עולה, ואז ותק (FIFO). חסרי תאריך בסוף. */
export function compareTasks(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

export function groupTasks(tasks: Task[]): Record<TaskGroupKey, Task[]> {
  const out: Record<TaskGroupKey, Task[]> = { now: [], stuck: [], later: [], done: [] };
  for (const t of tasks) out[taskGroupOf(t)].push(t);
  for (const k of TASK_GROUP_ORDER) {
    // הושלמו יורדות מהחדשה לישנה — מה שסגרת עכשיו הוא מה שרלוונטי לבדוק
    out[k].sort(k === 'done'
      ? (a, b) => (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '')
      : compareTasks);
  }
  return out;
}

/* ─── תצוגה שנייה: קיבוץ לפי שלב ─────────────────────────────────────────────
 * "איפה כל דבר עומד" במקום "מה דחוף עכשיו". שלוש קבוצות קבועות שתמיד
 * מוצגות — גם ריקות: "בתהליך: ריק" הוא מידע, וקבוצה שנעלמת שוברת את
 * המפה שהעין בנתה. הדחיפות לא הולכת לאיבוד — התאריך האדום נשאר בשורה.
 */
export type TaskStageKey = 'new' | 'in_progress' | 'done';

export const TASK_STAGE_ORDER: TaskStageKey[] = ['new', 'in_progress', 'done'];

export const TASK_STAGE_LABELS: Record<TaskStageKey, string> = {
  new: 'חדשה',
  in_progress: 'בתהליך',
  done: 'הושלמה',
};

/** רמז קצר לכל שלב — נכתב פעם אחת, כמו בשאר הקבוצות */
export const TASK_STAGE_HINTS: Record<TaskStageKey, string> = {
  new: 'טרם התחלת',
  in_progress: 'התחלת ולא סיימת',
  done: 'סגורות',
};

export function taskStageOf(task: Task): TaskStageKey {
  if (!isOpenTask(task)) return 'done';
  return task.progress === 'in_progress' ? 'in_progress' : 'new';
}

/* ─── מוצמדות ────────────────────────────────────────────────────────────────
 * הדחיפות המחושבת (תאריך יעד) שמה 24 מתוך 45 משימות ב"לטיפול מיידי" —
 * קבוצה שמחזיקה חצי מהרשימה היא הרשימה, לא סינון. מה שדחוף באמת יושב
 * בראש של רואה החשבון, לא בתאריך; ולכן ההצמדה ידנית.
 *
 * השדה ‎priority‎ כבר קיים על המשימה ולא היה בשימוש בשום מסך — הוא
 * מגויס לכאן, ולכן אין שינוי סכמה ואין מיגרציה.
 */
export function isPinned(task: Task): boolean {
  return task.priority === 'urgent' && isOpenTask(task);
}

export function groupTasksByStage(tasks: Task[]): Record<TaskStageKey, Task[]> {
  const out: Record<TaskStageKey, Task[]> = { new: [], in_progress: [], done: [] };
  for (const t of tasks) out[taskStageOf(t)].push(t);
  for (const k of TASK_STAGE_ORDER) {
    out[k].sort(k === 'done'
      ? (a, b) => (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '')
      : compareTasks);
  }
  return out;
}

/** הבא את הכדור "הבא" בהיגיון לאחר פעולה */
export const NEXT_BALL_WITH: Record<BallWith, BallWith> = {
  me: 'client',
  client: 'me',
  authority: 'me',
  stuck: 'me',
};

/** ספירת משימות פתוחות ללקוח */
export function countOpenTasksForClient(tasks: Task[], clientId: string): number {
  return tasks.filter(t => t.clientId === clientId && isOpenTask(t)).length;
}

/** ספירה של משימות שהכדור אצלי + פתוחות ללקוח */
export function countMyDeskTasksForClient(tasks: Task[], clientId: string): number {
  return tasks.filter(t => t.clientId === clientId && taskNeedsMe(t)).length;
}

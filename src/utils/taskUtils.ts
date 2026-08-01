import { Task, BallWith } from '../types';
import { daysBetween, todayIso, formatDate, daysLate } from './dateFormat';

export { daysLate, lateLabel } from './dateFormat';

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
  const openMine = tasks.filter(
    t => t.status === 'open' && (t.ballWith === 'me' || t.ballWith === 'stuck')
  );

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

/** האם המשימה באיחור (דד-ליין עבר + לא סגורה) */
export function isOverdue(task: Task): boolean {
  if (task.status !== 'open' || !task.dueDate) return false;
  return task.dueDate < todayIso();
}

/** האם דד-ליין תוך 7 ימים */
export function isDueThisWeek(task: Task): boolean {
  if (task.status !== 'open' || !task.dueDate) return false;
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
  if (task.status === 'done') return 'normal';
  if (daysLate(task.dueDate) > 0) return 'late';
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
  if (task.status === 'done') return 'done';
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

/** הבא את הכדור "הבא" בהיגיון לאחר פעולה */
export const NEXT_BALL_WITH: Record<BallWith, BallWith> = {
  me: 'client',
  client: 'me',
  authority: 'me',
  stuck: 'me',
};

/** ספירת משימות פתוחות ללקוח */
export function countOpenTasksForClient(tasks: Task[], clientId: string): number {
  return tasks.filter(t => t.clientId === clientId && t.status === 'open').length;
}

/** ספירה של משימות שהכדור אצלי + פתוחות ללקוח */
export function countMyDeskTasksForClient(tasks: Task[], clientId: string): number {
  return tasks.filter(
    t => t.clientId === clientId && t.status === 'open' && (t.ballWith === 'me' || t.ballWith === 'stuck')
  ).length;
}

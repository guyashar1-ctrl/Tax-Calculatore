import { Task, BallWith } from '../types';

/** מספר הימים בין שני תאריכי ISO (YYYY-MM-DD). חיובי = dateA אחרי dateB. */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00').getTime();
  const b = new Date(dateB + 'T00:00:00').getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

/** פורמט תאריך לתצוגה — DD/MM או "היום"/"מחר"/"אתמול" */
export function formatDueDate(iso: string): string {
  const diff = daysBetween(iso, todayIso());
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  const d = new Date(iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (diff < 0) return `פג ${dd}/${mm}`;
  return `${dd}/${mm}`;
}

/** פורמט תאריך יצירה — DD/MM (אם השנה הנוכחית) או DD/MM/YY */
export function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const currentYear = new Date().getFullYear();
  if (d.getFullYear() === currentYear) return `${dd}/${mm}`;
  return `${dd}/${mm}/${yy}`;
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

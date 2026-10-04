// ─── «לטיפולי» במסך המשימות — הגדרה אחת לרשימה, ללשונית ולתג בכותרת ─────────
// ‼ (04.10.2026) התג «משימות 27» בכותרת ספר משימות שדורשות אותי (אצלי / תקועה),
// בזמן שהלשונית «לטיפולי 40» ספרה כל משימה פתוחה — גם כשהכדור אצל הלקוח או
// אצל הרשות — ועוד שורות קליטה. משתמש חדש ראה שני מספרים שונים לשאלה אחת:
// "מה דורש אותי". עכשיו שלושתם נגזרים מכאן, ומשימה שהכדור בה אצל אחר עוברת
// ל«ממתינים לאחרים» — כמו בקשה שנשלחה ללקוח.

import type { Task, Client } from '../types';
import type { OnboardingStep } from '../types/onboarding';
import { isOpenTask, taskNeedsMe, archivedClientIds, countsForClient } from './taskUtils';
import { summarizeClientOnboarding, type ClientOnboardingSummary } from './onboardingNext';

type ClientRef = Pick<Client, 'id' | 'lifecycleStage'>;

/**
 * לקוחות בארכיון לא נספרים בשום מקום — חוץ מהלקוח שהמסך סונן אליו במפורש
 * («N משימות פתוחות ←» מהכרטיס): שם המשתמש ביקש לראות דווקא אותו.
 */
function hiddenClientIds(clients: ClientRef[], includeClientId?: string | null): Set<string> {
  const archived = archivedClientIds(clients);
  if (includeClientId) archived.delete(includeClientId);
  return archived;
}

export interface OpenTasksSplit {
  /** פתוחות שדורשות אותי (הכדור אצלי, או תקועה) — «לטיפולי». */
  mine: Task[];
  /** פתוחות שהכדור בהן אצל הלקוח או הרשות — «ממתינים לאחרים». */
  waiting: Task[];
}

export function splitOpenTasks(tasks: Task[], clients: ClientRef[], includeClientId?: string | null): OpenTasksSplit {
  const hidden = hiddenClientIds(clients, includeClientId);
  const mine: Task[] = [];
  const waiting: Task[] = [];
  for (const t of tasks) {
    if (!isOpenTask(t) || !countsForClient(t, hidden)) continue;
    (taskNeedsMe(t) ? mine : waiting).push(t);
  }
  return { mine, waiting };
}

export interface JourneyRowsSplit {
  /** שורת קליטה שדורשת אותי (או תקועה) — «לטיפולי». */
  mine: ClientOnboardingSummary[];
  /** שורת קליטה שכל מה שפתוח בה ממתין לאחרים. */
  waiting: ClientOnboardingSummary[];
}

/** שורות הקליטה — שורה נגזרת אחת ללקוח מוכר (לא שמורה, ולכן לא נגררת). */
export function splitJourneyRows(steps: OnboardingStep[], clients: ClientRef[], includeClientId?: string | null): JourneyRowsSplit {
  const hidden = hiddenClientIds(clients, includeClientId);
  const known = new Set(clients.filter(c => !hidden.has(c.id)).map(c => c.id));
  const rows = summarizeClientOnboarding(steps).filter(s => known.has(s.clientId));
  return {
    mine: rows.filter(s => s.bucket === 'stuck' || s.bucket === 'mine'),
    waiting: rows.filter(s => s.bucket === 'others'),
  };
}

/**
 * המספר על התג «משימות» בכותרת = מספר השורות ב«לטיפולי» כשאין חיפוש וסינון:
 * משימות שדורשות אותי + שורות קליטה שדורשות אותי.
 */
export function tasksPageMineCount(tasks: Task[], clients: ClientRef[], steps: OnboardingStep[]): number {
  return splitOpenTasks(tasks, clients).mine.length + splitJourneyRows(steps, clients).mine.length;
}

/**
 * הכותרת כפי שמוצגת ברשימה. ‼ משימת מערכת נושאת בסוף הכותרת מפתח זיהוי פנימי
 * בסוגריים מרובעים (‎[בדיקת-עדכניות Q4/2026]‎ — data/freshnessTask.ts), שבו
 * המערכת מזהה אותה כדי לא ליצור אותה פעמיים. המפתח נשאר בכותרת השמורה; במסך הוא
 * רק רעש — מילים פנימיות שהמשתמש לא צריך לקרוא.
 */
export function taskDisplayTitle(t: Pick<Task, 'title' | 'clientId'>): string {
  const title = t.title ?? '';
  if (t.clientId !== 'system') return title;
  return title.replace(/\s*\[[^\]]*\]\s*$/, '').trim() || title;
}

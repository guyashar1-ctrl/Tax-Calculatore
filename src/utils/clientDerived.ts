// ─── חישובים נגזרים על תיק לקוח ──────────────────────────────────────────
// פונקציות טהורות שמחשבות בזמן ריצה: התראות, חובות קרובים, מסמכים חסרים.

import { ClientExt, ClientAlert } from '../types/clientWorkspace';
import { Task } from '../types';

const DAYS_AHEAD = 21; // "חוב קרוב" = תאריך יעד בתוך 21 ימים
const WITHHOLDING_WARN_DAYS = 30;

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** משימות פתוחות הקשורות ללקוח */
export function getClientOpenTasks(clientId: string, tasks: Task[]): Task[] {
  return tasks.filter(t => t.clientId === clientId && t.status === 'open');
}

/** "חובות קרובים" = משימות פתוחות בקטגוריות רגולטוריות עם dueDate בתוך 21 יום */
export function getUpcomingDebts(clientId: string, tasks: Task[]): Task[] {
  const regCats = new Set(['ongoing', 'cutoff', 'annual_report', 'personal_report']);
  return tasks.filter(t => {
    if (t.clientId !== clientId) return false;
    if (t.status !== 'open') return false;
    if (!regCats.has(t.category)) return false;
    const d = daysUntil(t.dueDate);
    return d !== null && d <= DAYS_AHEAD;
  }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

/**
 * "מסמכים חסרים" — heuristic מהיר:
 * - לעוסק מורשה צריך אישור עוסק מורשה
 * - לכל לקוח צריך תעודת זהות
 * - לעצמאי צריך דוח רווח והפסד שנתי
 * המימוש האמיתי דורש מסמכים מ-IndexedDB; כאן מחזירים רק את הציפיות הקבועות,
 * וב-OverviewTab מחברים את זה למה שבאמת קיים ב-DB.
 */
export interface MissingDocItem { id: string; label: string; }

export function getExpectedDocs(client: ClientExt): MissingDocItem[] {
  const list: MissingDocItem[] = [
    { id: 'id_card', label: 'תעודת זהות + ספח' },
  ];
  if (client.vatStatus === 'authorizedDealer') {
    list.push({ id: 'vat_cert', label: 'אישור עוסק מורשה' });
  }
  if (client.incomeTaxType === 'selfEmployed' || client.incomeTaxType === 'both') {
    list.push({ id: 'business_pnl', label: 'רווח והפסד שנתי אחרון' });
  }
  if (client.qualifyingSettlementId) {
    list.push({ id: 'residence_certificate', label: 'אישור מגורים בישוב מזכה' });
  }
  if (client.hasPension) {
    list.push({ id: 'pension_statement', label: 'אישור קרן פנסיה שנתי' });
  }
  return list;
}

/**
 * מחזיר אילו מסמכים מהציפיה חסרים (לפי קטגוריות שכבר הועלו).
 * `existingCategories` מגיע מהמסמכים הקיימים ב-IndexedDB.
 */
export function getMissingDocs(client: ClientExt, existingCategories: Set<string>): MissingDocItem[] {
  return getExpectedDocs(client).filter(d => !existingCategories.has(d.id));
}

/** האם ניכוי במקור פג תוקף (או בקרוב יפוג) */
export function isWithholdingExpired(client: ClientExt): { expired: boolean; daysLeft: number | null } {
  const d = daysUntil(client.withholdingValidUntil);
  if (d === null) return { expired: false, daysLeft: null };
  return { expired: d <= 0, daysLeft: d };
}

/**
 * מחשב את כל ההתראות על לקוח. מקבל את משימות הלקוח + קטגוריות מסמכים שכבר קיימות.
 */
export function computeClientAlerts(
  client: ClientExt,
  tasks: Task[],
  existingDocCategories: Set<string>,
): ClientAlert[] {
  const alerts: ClientAlert[] = [];

  const openTasks = getClientOpenTasks(client.id, tasks);
  if (openTasks.length > 0) {
    alerts.push({
      kind: 'open_tasks',
      level: 'info',
      text: `${openTasks.length} משימות פתוחות`,
      count: openTasks.length,
    });
  }

  const debts = getUpcomingDebts(client.id, tasks);
  if (debts.length > 0) {
    alerts.push({
      kind: 'upcoming_debt',
      level: 'warning',
      text: `${debts.length} חובות קרובים (21 יום)`,
      count: debts.length,
    });
  }

  void existingDocCategories; // לא בשימוש כרגע — נשמר לתאימות חתימה

  const wh = isWithholdingExpired(client);
  if (wh.expired) {
    alerts.push({
      kind: 'withholding_expired',
      level: 'danger',
      text: 'ניכוי במקור פג תוקף',
    });
  } else if (wh.daysLeft !== null && wh.daysLeft <= WITHHOLDING_WARN_DAYS) {
    alerts.push({
      kind: 'withholding_expired',
      level: 'warning',
      text: `ניכוי פג תוקף בעוד ${wh.daysLeft} ימים`,
    });
  }

  if (client.shaamStatus === 'inactive') {
    alerts.push({
      kind: 'shaam_inactive',
      level: 'warning',
      text: 'הרשאת שע״ם לא פעילה',
    });
  }

  if (client.bookStatus === 'rejected') {
    alerts.push({
      kind: 'book_rejected',
      level: 'danger',
      text: 'ספרים נפסלו',
    });
  }

  return alerts;
}

/** פורמט תאריך עברי קצר */
export function shortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function shortDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/** "לפני 3 ימים" / "לפני שעה" */
export function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'עכשיו';
  if (diffMin < 60) return `לפני ${diffMin} דק׳`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `לפני ${diffH} שעות`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `לפני ${diffD} ימים`;
  if (diffD < 30) return `לפני ${Math.floor(diffD / 7)} שבועות`;
  return shortDate(iso);
}

// ─────────────────────────────────────────────────────────────────────────────
// משימת בדיקת העדכניות הרבעונית — נוצרת אוטומטית בתחילת כל רבעון
//
// בכניסה הראשונה לאפליקציה ברבעון חדש (ינואר/אפריל/יולי/אוקטובר) נוצרת משימה
// אחת עם צ'קליסט כל המאגרים. הזיהוי לפי תגית [בדיקת-עדכניות Qn/YYYY] בכותרת —
// כך לא נוצרת כפילות גם אם המשימה הושלמה או נמחקה שמה שונה ידנית לא.
// ⚠ שום נתון לא מתעדכן בלי אישור הרו"ח — המשימה רק מזכירה להריץ את הבדיקה.
// ─────────────────────────────────────────────────────────────────────────────
import type { Task } from '../types';
import { DATASETS, currentQuarterStart, quarterLabel } from './dataFreshness';

/** clientId מיוחד למשימות מערכת — אין לקוח אמיתי מאחוריהן */
export const SYSTEM_CLIENT_ID = 'system';

// נעילה ברמת המודול — שורדת את ההרכבה הכפולה של React StrictMode בפיתוח,
// שבה שני מופעים של האפליקציה רצים במקביל ו-useRef לא משותף ביניהם.
let creationAttemptedThisSession = false;
export function markFreshnessCreationAttempted(): boolean {
  if (creationAttemptedThisSession) return false;
  creationAttemptedThisSession = true;
  return true;
}

export function quarterTag(now = new Date()): string {
  return `[בדיקת-עדכניות ${quarterLabel(currentQuarterStart(now))}]`;
}

export function buildQuarterlyFreshnessTask(now = new Date()): Task {
  const iso = now.toISOString();
  const q = currentQuarterStart(now);
  // דד-ליין: שבועיים מיצירת המשימה (מקומי — בלי הסטת אזור זמן של toISOString)
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
  const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  const checklist = DATASETS
    .map(d => `☐ ${d.icon} ${d.label} — ${d.covers}\n   מקורות: ${d.officialSources.join(' · ')}`)
    .join('\n');

  return {
    id: crypto.randomUUID(),
    clientId: SYSTEM_CLIENT_ID,
    category: 'management',
    title: `בדיקת עדכניות נתוני מרכז הידע — ${quarterLabel(q)} ${quarterTag(now)}`,
    description:
`בדיקה רבעונית של כל מאגרי המידע במרכז ידע מס מול מקורות רשמיים בלבד.

איך מריצים: פותחים את Claude בפרויקט וכותבים "תריץ את בדיקת העדכניות הרבעונית".
Claude יעבור על כל המאגרים, יבדוק מול המקורות הרשמיים, ויגיש דוח מסודר:
מה השתנה · הערך הקודם · הערך החדש · קישור למקור.
שום נתון לא יעודכן במערכת לפני אישור מפורש שלך.

המאגרים לבדיקה:
${checklist}`,
    ballWith: 'me',
    status: 'open',
    progress: 'new',
    priority: 'normal',
    dueDate: dueStr,
    createdAt: iso,
    updatedAt: iso,
  };
}

/** האם כבר קיימת משימת הבדיקה של הרבעון הנוכחי (פתוחה או שהושלמה) */
export function quarterlyTaskExists(tasks: Task[], now = new Date()): boolean {
  const tag = quarterTag(now);
  return tasks.some(t => t.title.includes(tag));
}

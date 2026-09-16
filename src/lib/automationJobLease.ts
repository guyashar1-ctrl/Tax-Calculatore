// ─── חכירת משימת אוטומציה — לוגיקה טהורה, בלי supabase ──────────────────────
// מופרד מ-automationJobs.ts כדי שגם authorityConnectionModel.ts (נבדק ב-node,
// בלי דפדפן ובלי סשן) יוכל לייבא אותה בלי לגרור את לקוח ה-Supabase.

import type { AutomationJob } from '../types/automation';

/**
 * האם המשימה **באמת** רצה עכשיו — כלומר יש מי שמחזיק אותה.
 *
 * ‼ 'running' לבדו אינו הוכחה: העובד המקומי יכול להיהרג באמצע, והשורה נשארת
 * 'running' לנצח. ההוכחה היא החכירה (lease_until) שהעובד מאריך בכל פעימה —
 * חכירה שפקעה פירושה שאף אחד לא מחזיק. אותו כלל בדיוק שהשרת מפעיל כשהוא
 * תופס מחדש (claim_next_automation_job) וכשהוא מבטל (cancel_automation_job, 170).
 * 'queued' נחשב חי — הוא ממתין לעובד, וההתיישנות שלו היא עניין של המסך
 * (timeout בכותרת), לא של הבעלות.
 */
export function jobIsLive(job: AutomationJob | null | undefined, now: number = Date.now()): boolean {
  if (!job) return false;
  if (job.status === 'queued') return true;
  if (job.status !== 'running') return false;
  if (!job.leaseUntil) return false;
  const lease = new Date(job.leaseUntil).getTime();
  return !Number.isNaN(lease) && lease > now;
}

/**
 * האם לחיצה על «הרץ» היא פעולה — הכלל האחד לכל משפחת כרטיסי האוטומציה
 * (כרטיס הבדיקה, כרטיס הרשות בתיק המס, כפתורי החיבור בכותרת).
 *
 * ‼ needs_human ומשימה 'running' שהחכירה שלה פקעה הם **מבוי סתום**, לא ריצה:
 * שניהם ממתינים לאדם, והאדם בדיוק לחץ. לכן הם ניתנים לפעולה — `run` מבטל
 * אותם ויוצר משימה חדשה (בטל-ואז-נסה-שוב). רק משימה חיה חוסמת.
 * עד 170 שני המסכים התנהגו הפוך: כרטיס הבדיקה נעל את הכפתור על needs_human
 * (לנצח), ותיק המס ביטל ויצר חדשה.
 */
export function jobIsActionable(job: AutomationJob | null | undefined): boolean {
  return !jobIsLive(job);
}

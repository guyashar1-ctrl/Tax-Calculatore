// ─── מה שהרו"ח הקודם שלח ועוד לא נפתח ───────────────────────────────────────
// ‼ "נקרא" נקבע בפעולה מפורשת — לחיצה על "פתח את המסמכים" — ולא בכניסה
// למסך. מונה שמתאפס כשעוברים במקרה ליד הכרטיס הוא מונה שאי אפשר לסמוך עליו.
//
// המקור היחיד לחישוב הוא payload של שלב `materials_received`: bulkUploads
// (מה שהגיע) מול bulkSeenAt (מתי נפתח לאחרונה). ראה מיגרציה 119.

import { OnboardingStep } from '../types/onboarding';

/**
 * התיקייה היציבה בתיק המסמכים — אחת ללקוח, לא אחת לכל בקשה.
 * ‼ אותו טקסט בדיוק כמו במיגרציה 120 וב-portal-upload-document. שינוי כאן
 * בלי שינוי שם, וייווצרו שתי תיקיות שנראות זהות.
 */
export const PREV_ACCOUNTANT_FOLDER = 'חומרים מרו״ח קודם';

export interface PrevAccountantUpload {
  documentId: string;
  fileName: string;
  at: string;
}

/**
 * חותמות הזמן הן ISO ב-UTC משני הצדדים (הדפדפן ו-release_portal_remove_upload),
 * ולכן השוואת מחרוזות מספיקה ואין צורך ב-Date.
 */
export function unseenUploads(step?: OnboardingStep): PrevAccountantUpload[] {
  if (!step) return [];
  const payload = step.payload as { bulkUploads?: PrevAccountantUpload[]; bulkSeenAt?: string };
  const seenAt = payload.bulkSeenAt ?? '';
  return (payload.bulkUploads ?? []).filter(u => !seenAt || (u.at ?? '') > seenAt);
}

/** כמה קבצים חדשים מחכים בכל לקוח. שלב שנסגר עדיין נספר — הקבצים הגיעו. */
export function unseenUploadsByClient(steps: OnboardingStep[]): Map<string, number> {
  const byClient = new Map<string, number>();
  for (const step of steps) {
    if (step.stepType !== 'materials_received' || step.status === 'cancelled') continue;
    const count = unseenUploads(step).length;
    if (count > 0) byClient.set(step.clientId, (byClient.get(step.clientId) ?? 0) + count);
  }
  return byClient;
}

export function totalUnseenUploads(steps: OnboardingStep[]): number {
  let total = 0;
  for (const count of unseenUploadsByClient(steps).values()) total += count;
  return total;
}

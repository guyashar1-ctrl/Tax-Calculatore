// ─── אילו מיילים שייכים לכרטיס הלקוח ─────────────────────────────────────────
// ‼ הכלל יושב בקובץ משלו כדי שאפשר יהיה להריץ אותו על שורות אמיתיות ולא רק
// לקרוא אותו. הוא נכתב אחרי שכרטיס לקוח בן יום אחד הציג 46 מיילים, מתוכם 45
// זרים — כולם נגררו בגלל שהכתובת חזרה בבדיקות קודמות.

import { isInternalEmailKind } from '../types/emailActivity';

export interface ClientEmailScope {
  clientId: string;
  /** כתובות הלקוח, כבר ב-lowercase. */
  addresses: Set<string>;
  /** מתי נפתח כרטיס הלקוח. חסר ⇒ אין גבול זמן. */
  since?: string;
}

interface MinimalMessage {
  clientId?: string;
  toEmail?: string;
  kind?: string;
  sentAt?: string;
  createdAt?: string;
}

/**
 * שלוש שאלות, בסדר הזה:
 * 1. זה בכלל דואר ללקוח? התראה פנימית נשלחת לרו״ח, ולפעמים **נושאת** את מזהה
 *    הלקוח שעליו היא מדווחת — ולכן היא נכנסה לכרטיס דרך ההתאמה הראשית.
 * 2. יש שיוך מפורש? אז הוא מכריע, בלי ניחושים.
 * 3. אין שיוך — מנחשים לפי כתובת, אבל רק בתוך תקופת חיי הכרטיס. מייל שיצא
 *    לפני שהכרטיס נפתח אינו יכול להיות שלו.
 */
export function belongsToClientCard(m: MinimalMessage, scope: ClientEmailScope): boolean {
  if (isInternalEmailKind(m.kind)) return false;
  if (m.clientId) return m.clientId === scope.clientId;
  if (!scope.addresses.has((m.toEmail || '').toLowerCase())) return false;
  if (!scope.since) return true;
  const t = m.sentAt || m.createdAt;
  return !!t && new Date(t).getTime() >= new Date(scope.since).getTime();
}

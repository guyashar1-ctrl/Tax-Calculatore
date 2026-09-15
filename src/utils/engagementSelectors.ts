// ─── בחירת ההתקשרות הנוכחית — הגדרה אחת לכל המסכים ──────────────────────────
//
// ‼ עד 118 המסך בחר "התקשרות נוכחית" ב-engagements.find(clientId && status
// !== 'cancelled'). useOnboarding מביא ממוין created_at desc, ולכן זו הייתה
// תמיד ההתקשרות *האחרונה שנוצרה* — ומכירת שירות חד־פעמי, שיצרה התקשרות
// ריקה בלי שורות חודשיות, הייתה משתלטת על התצוגה ומראה 0 ₪ לחודש.
//
// ‼ (168) ההתקשרות הנוכחית היא השורה היחידה במצב 'onboarding' או 'active' —
// בלי סינון לפי תאריך. הסינון `effectiveFrom <= today` שהיה כאן (ובשרת)
// העלים התקשרות ראשונה שהחיוב שלה מתחיל בחודש הבא, וההצעה הבאה של אותו
// לקוח נפלה על אילוץ הייחודיות. הקליטה מתחילה באישור; החיוב מתחיל כשמתחיל.
// 'scheduled' הוא חידוש עתידי ואינו נוכחי לעולם — גם אם מועדו הגיע ומשימת
// המעבר בשרת מאחרת; הוא נהיה נוכחי רק כשהמעבר סוגר את הקודמת.
//
// ‼ חייב להישאר זהה תו-בתו ל-public.current_engagement_id (מיגרציה 168).
//   זו ההגדרה היחידה במסך: lib/clientState מאציל לכאן, ואסור לכתוב מסנן
//   engagements מקומי במסך.

import type { Engagement } from '../types/onboarding';

/** היום בפורמט 'YYYY-MM-DD' לפי השעון המקומי (ולא UTC, שקופץ יום בערב). */
export function todayKey(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** התאריך שממנו ההתקשרות נוכחית. נופל אחורה לחודש החיוב ואז ליצירה. */
function effectiveKey(e: Engagement): string {
  if (e.effectiveFrom) return e.effectiveFrom.slice(0, 10);
  if (e.billingStartMonth) return `${e.billingStartMonth}-01`;
  return (e.createdAt ?? '').slice(0, 10);
}

/**
 * ההסכם שבתוקף עכשיו: בקליטה או פעיל. האילוץ במסד מבטיח שיש לכל היותר
 * אחד כזה; המיון קיים רק כדי שהשרת והמסך יבחרו אותו דבר גם אם האילוץ
 * יוסר יום אחד (מי שכבר בתוקף קודם, ואז המאוחר).
 */
export function currentEngagement(engagements: Engagement[], clientId: string, today = todayKey()): Engagement | undefined {
  const inForce = (e: Engagement) => (effectiveKey(e) <= today ? 1 : 0);
  return engagements
    .filter(e => e.clientId === clientId
      && (e.status === 'onboarding' || e.status === 'active'))
    .sort((a, b) => inForce(b) - inForce(a)
      || effectiveKey(b).localeCompare(effectiveKey(a))
      || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
}

/** הסכם שאושר וטרם נכנס לתוקף. מוצג כמידע משני בלבד, לעולם לא כמספר הגדול. */
export function upcomingEngagement(engagements: Engagement[], clientId: string, today = todayKey()): Engagement | undefined {
  return engagements
    .filter(e => e.clientId === clientId && e.status === 'scheduled' && effectiveKey(e) > today)
    .sort((a, b) => effectiveKey(a).localeCompare(effectiveKey(b)))[0];
}

/** הסכמים קודמים, מהחדש לישן. ריק ⇒ אין למה לפתוח "התקשרויות קודמות". */
export function previousEngagements(engagements: Engagement[], clientId: string): Engagement[] {
  return engagements
    .filter(e => e.clientId === clientId && e.status === 'ended')
    .sort((a, b) => effectiveKey(b).localeCompare(effectiveKey(a)));
}

/** ההתקשרות שהקליטה רצה עליה — לשונית הקליטה, לא המסך המסחרי. */
export function onboardingEngagement(engagements: Engagement[], clientId: string): Engagement | undefined {
  return engagements.find(e => e.clientId === clientId && e.status === 'onboarding');
}

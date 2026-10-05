// ─── רצף הפייפרלס — «＋ בקשה חדשה» ← «רצף פייפרלס» ───────────────────────────────────────────
// ‼ מקור אחד לשני צרכנים: חלון ההוספה (יוצר מהם בקשות) ו«צפייה» בבקשה (features/requestPreview — מציגה בדיוק מה שנוצר).

import type { OnboardingStep } from '../types/onboarding';

/** רצף הפייפרלס — תבנית מוכרת, לא תצורה. שלושה שלבים, ובעלות שונה לכל אחד:
 *
 *   1. הרשמה לפייפרלס   — הלקוח. הוא נרשם ומאשר בעצמו בדף האישי.
 *   2. חיבור לפייפרלס    — המשרד. נכנסים לחשבון ומשלימים את ההגדרה (שם
 *      פייפרלס מבקשת את פרטי האשראי) — ולכן זו פעולה שלנו, לא שלו.
 *   3. הרשאה לתשלום חודשי — נפתחת אחרי (2).
 *
 * ‼ הבעלות היא מה שקובע מי רואה כפתור: הלקוח מקבל פעולה רק על (1), ורואה
 * את (2) כ"בטיפול המשרד" בלי שום פקד. הכדור והניסוחים זהים למה שהמנוע
 * בשרת יוצר מהצעת מחיר, כדי שרצף ידני ורצף מהצעה יתנהגו אותו דבר. */
export const PAPERLESS_SEQUENCE: {
  type: OnboardingStep['stepType'];
  owner: 'client' | 'me';
  payload: Record<string, unknown>;
}[] = [
  { type: 'paperless_invite', owner: 'client',
    payload: {
      paperlessStatus: 'unknown', dataSource: 'unknown',
      clientTitle: 'הרשמה לפייפרלס',
      clientSub: 'שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
      clientCta: 'נרשמתי לפייפרלס',
    } },
  { type: 'paperless_connection', owner: 'me',
    payload: {
      clientTitle: 'חיבור לפייפרלס',
      clientSub: 'בימים הקרובים ניכנס לחשבון ונשלים את החיבור. אין צורך לעשות דבר כרגע.',
    } },
  { type: 'retainer_authorization', owner: 'me',
    payload: {
      clientTitle: 'להזין אמצעי תשלום',
      clientSub: 'הסכום שסוכם בהצעה, כהרשאה קבועה',
      clientCta: 'להזנה',
    } },
];

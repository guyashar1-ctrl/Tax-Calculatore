// ─── בעלות מסחרית חוצה-כרטיסים ──────────────────────────────────────────────
//
// שני בני זוג יכולים להיות שני כרטיסים נפרדים (עם ייצוג נפרד — ראה
// personRepresentation.ts) בעוד ההתקשרות/הצעת המחיר/החיוב מנוהלים בכרטיס
// אחד בלבד. זו הפרדה מכוונת: בעלות מסחרית (154) ≠ בעלות ייצוג (150) — אף
// אחת מהן לא נגזרת מהשנייה ואף אחת לא משתנה כתוצאה מהשנייה.
//
// ‼ אין כאן שדה קישור נפרד ב-Client. הבעלות המסחרית נגזרת בלייב מ-
// currentEngagement, כמו שבעלות ייצוג נגזרת מ-authorityRepresentations: אם
// לכרטיס יש התקשרות נוכחית משלו — היא שלו, נקודה, גם אם לבן/בת הזוג יש
// התקשרות. רק כשאין לו/ה בכלל, ורק אז, נקראת התקשרות בן/בת הזוג כברירת
// מחדל. ברגע שנוצרת התקשרות עצמאית לכרטיס הזה — הגזירה הופכת אוטומטית
// בלי לכתוב או למחוק כלום. זה גם מבטיח שאף פעם לא "ממזגים" בטעות שתי
// התקשרויות עצמאיות קיימות: אם לשניהם יש התקשרות נוכחית משלהם, כל אחד
// נשאר עם שלו — 'own' תמיד גובר על 'spouse'.

import type { Client } from '../types';
import type { Engagement } from '../types/onboarding';
import { currentEngagement } from './engagementSelectors';

export interface BillingOwnershipState {
  /** 'own' — יש לכרטיס הזה התקשרות נוכחית משלו. 'spouse' — אין, ונקראת דרך בן/בת הזוג. 'none' — אין לאף אחד. */
  owner: 'own' | 'spouse' | 'none';
  /** הכרטיס שמחזיק את ההתקשרות בפועל (own ⇒ הכרטיס עצמו; spouse ⇒ בן/בת הזוג). */
  ownerClient?: Client;
  engagement?: Engagement;
}

export function resolveBillingOwnership(
  client: Client | undefined | null,
  spouseClient: Client | undefined | null,
  engagements: Engagement[],
): BillingOwnershipState {
  if (!client) return { owner: 'none' };
  const own = currentEngagement(engagements, client.id);
  if (own) return { owner: 'own', ownerClient: client, engagement: own };
  if (spouseClient) {
    const viaSpouse = currentEngagement(engagements, spouseClient.id);
    if (viaSpouse) return { owner: 'spouse', ownerClient: spouseClient, engagement: viaSpouse };
  }
  return { owner: 'none' };
}

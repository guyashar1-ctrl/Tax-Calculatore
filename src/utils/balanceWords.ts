// ─── יתרה מול רשות — במילים שאומרות מי משלם למי (26.10.2026) ──────────────────
// גיא (על יובל גרוסמן, «חוב 17,176» שהיה בעצם זכות): «שיהיה ברור מתי הוא זכאי לכסף ומתי הוא צריך
// לשלם». מקור אחד לכל הרשויות — מס הכנסה, מע״מ וביטוח לאומי — בכרטיס, בסיכום, בהשוואה ובדגלים.
// ‼ המוסכמה בכרטיס: חיובי = הלקוח חייב, שלילי = לזכות הלקוח. «לזכות הלקוח» ולא «החזר»: יתרת זכות
// מוחזרת או מקוזזת מול חיוב — לא תמיד החזר מיידי.

const ils = (n: number) => `${Math.abs(Math.round(n)).toLocaleString('he-IL')} ₪`;

export const BALANCE_OWES = 'לתשלום';
export const BALANCE_CREDIT = 'לזכות הלקוח';

/** «לתשלום 17,176 ₪» · «לזכות הלקוח 17,176 ₪» · «אין יתרה». null/NaN ⇒ null. */
export function balanceWords(n?: number | null): { text: string; tone: 'warn' | 'ok'; owes: boolean } | null {
  if (n == null || Number.isNaN(n)) return null;
  if (n > 0) return { text: `${BALANCE_OWES} ${ils(n)}`, tone: 'warn', owes: true };
  if (n < 0) return { text: `${BALANCE_CREDIT} ${ils(n)}`, tone: 'ok', owes: false };
  return { text: 'אין יתרה', tone: 'ok', owes: false };
}

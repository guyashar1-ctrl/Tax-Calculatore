// ─── התיק · מי מוצג עכשיו ───────────────────────────────────────────────────
// התיק מכיל עשרים קבוצות שדות. כשכולן פרושות זו מתחת לזו, המסך הוא גלילה
// של אלף פיקסלים שאי אפשר לסרוק — וזה בדיוק מה שהמוקאפ (מסך 08) מחליף
// במאסטר-דיטייל: מסילה צרה שמראה את כל הקבוצות, ופאנל שמראה אחת.
//
// הפילטר יושב כאן ולא בקומפוננטות עצמן, כדי שהשדות, ההנדלרים והשמירה
// יישארו בדיוק כפי שהם. ‎ColoredSection‎ שואל "אני הפעילה?" ומחזיר null
// כשלא — שום לוגיקה עסקית לא זזה.

import { createContext, useContext } from 'react';

export interface DossierFilter {
  /** התווית של הקבוצה שמוצגת עכשיו. null = הכול (מצב חיפוש / הדפסה). */
  active: string | null;
  /** מילת החיפוש הפעילה — כשהיא קיימת, כל הקבוצות מוצגות. */
  query: string;
}

const Ctx = createContext<DossierFilter | null>(null);

export const DossierFilterProvider = Ctx.Provider;

/** מחזיר true אם הקבוצה בשם הזה אמורה להיות מצוירת עכשיו. */
export function useSectionVisible(label: string): boolean {
  const f = useContext(Ctx);
  if (!f) return true;              // מחוץ להקשר — התנהגות המקורית
  if (f.query.trim()) return true;  // בחיפוש הכול פתוח, כדי שיימצא
  return f.active === null || f.active === label;
}

/** רשימת הקבוצות של התיק, בסדר שבו הן מופיעות במסך. */
export const DOSSIER_GROUPS: { label: string; pane: 'personal' | 'tax' }[] = [
  { label: 'פרטי נישום', pane: 'personal' },
  { label: 'מצב משפחתי', pane: 'personal' },
  { label: 'ילדים', pane: 'personal' },
  { label: 'פרטים הקשורים למס הכנסה', pane: 'personal' },
  { label: 'נכסים והשקעות', pane: 'personal' },
  { label: 'מעבידים', pane: 'personal' },
  { label: 'עסקים', pane: 'personal' },
  { label: 'חשבונות בנק', pane: 'personal' },
  { label: 'קופות פנסיה וחיסכון', pane: 'personal' },
  { label: 'קרובים תלויים במוסד', pane: 'personal' },
  { label: 'דיווחי חובה ומצבים מיוחדים', pane: 'personal' },
  { label: 'אנשי קשר', pane: 'personal' },
  { label: 'עובד מטפל', pane: 'personal' },
  { label: 'תגיות', pane: 'personal' },
  { label: 'מס הכנסה', pane: 'tax' },
  { label: 'ניכויים', pane: 'tax' },
  { label: 'מע״מ', pane: 'tax' },
  { label: 'ביטוח לאומי', pane: 'tax' },
  { label: 'הרשאת שע״ם', pane: 'tax' },
  { label: 'הצהרת הון', pane: 'tax' },
];

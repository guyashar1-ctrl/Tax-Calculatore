import type { PersonRole } from '../../types';

/**
 * «ייצוג» אינו עובדה מנוהלת (הוא נגזר בשרת מבקשת הייצוג) — ולכן אין לו
 * מפתח ב-Client. המפתח כאן הוא רק מזהה לשורה בכרטיס, כדי שהראיה מהפורטל
 * («מופיע ברשימת המיוצגים») תוצג לידה. לעולם לא «שונה», ולכן לעולם לא נכתב.
 */
export const BTL_REPRESENTATION_KEY: Record<PersonRole, string> = {
  client: 'niRepresentation', spouse: 'spouseNiRepresentation',
};

/**
 * «ת.ז.» בכרטיס ב״ל — אותו רעיון: מזהה לשורה בלבד. העובד פותח את המבוטח לפי
 * ת.ז. ומוודא אותה בכותרת לפני שהוא קורא דבר (identity_mismatch אחרת), ולכן
 * אדם שנקרא בהצלחה ⇒ ת.ז. ירוקה. לעולם לא «שונה», ולכן לעולם לא נכתב.
 */
export const BTL_ID_KEY: Record<PersonRole, string> = {
  client: 'niIdNumber', spouse: 'spouseNiIdNumber',
};

// ─── נירמול פרטי זיהוי ───────────────────────────────────────────────────────
// מקור אמת אחד לשאלה "האם 052-4491120 ו-9724491120+ הם אותו טלפון".
// משמש את חיפוש הלקוחות היום, ואת בדיקת הכפילויות בשלבים הבאים —
// כדי ששני המסכים לעולם לא יענו תשובות שונות על אותו קלט.

/** אותיות קטנות, בלי רווחים ומקפים — ההשוואה של הפרוטוטייפ המאושר. */
export function squash(v?: string | null): string {
  return (v ?? '').toLowerCase().replace(/[\s-]/g, '');
}

/** ספרות בלבד; קידומת בינלאומית 972 חוזרת להיות 0 מקומי. */
export function normalizePhone(v?: string | null): string {
  let digits = (v ?? '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  return digits;
}

export function normalizeEmail(v?: string | null): string {
  return (v ?? '').trim().toLowerCase();
}

/** ת"ז נשמרת לפעמים בלי אפסים מובילים — משלימים ל-9 ספרות לפני השוואה. */
export function normalizeIdNumber(v?: string | null): string {
  const digits = (v ?? '').replace(/\D/g, '');
  return digits ? digits.padStart(9, '0') : '';
}

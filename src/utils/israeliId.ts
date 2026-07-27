/**
 * ספרת ביקורת של ת.ז. ישראלית (אלגוריתם לון על 9 ספרות).
 * תופס שגיאות הקלדה לפני שהמספר מגיע לרשויות — שם תיקון דורש הגשה מחדש
 * של בקשת הייצוג כולה.
 */
export function isValidIsraeliId(id: string): boolean {
  const digits = (id || '').trim().padStart(9, '0');
  if (!/^\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const step = Number(digits[i]) * ((i % 2) + 1);
    sum += step > 9 ? step - 9 : step;
  }
  return sum % 10 === 0;
}

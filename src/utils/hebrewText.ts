// ─── טקסט שמוכרח להיות בעברית · עיר וכתובת ──────────────────────────────────
//
// ‼ עיר ורחוב נוסעים כמות שהם לטפסי הרשויות (ייפוי כוח, שע״ם, ב״ל). תעתיק
// לטינית נפסל שם, ולכן הכלל אינו העדפה ויזואלית אלא תנאי לכך שהבקשה תתקבל.
//
// ‼ הערך נדחה בשלמותו ולא מסונן תו־תו: המקור השכיח לערך לועזי הוא מילוי
// אוטומטי של הדפדפן מפרופיל באנגלית, וסינון האותיות ממנו היה משאיר "66," —
// שנראה כתקלה במקום כהסבר.
//
// ‼ אותו כלל נאכף בשרת (מיגרציה 193), כי מסך אינו אכיפה.

/**
 * אות שאינה עברית: תו שהוא אות בכל שפה (\p{L}) ואינו בטווח העברי.
 * ספרות, רווחים, מקף, פסיק, גרש וכל סימן פיסוק אחר — מותרים.
 */
const NON_HEBREW_LETTER = /[^\P{L}֐-׿]/gu;

export function countNonHebrewLetters(value: string): number {
  return (value.match(NON_HEBREW_LETTER) ?? []).length;
}

export function hasNonHebrewLetters(value: string): boolean {
  return countNonHebrewLetters(value) > 0;
}

/**
 * האם לדחות את הערך החדש. ‼ מחיקה מותרת גם כשמה שנשאר עדיין לועזי: ערך ישן
 * באנגלית חייב להיות ניתן לתיקון, ובלי זה כל Backspace היה נדחה והשדה היה
 * ננעל על הטעות.
 */
export function rejectsHebrewOnly(next: string, previous: string): boolean {
  const n = countNonHebrewLetters(next);
  return n > 0 && n >= countNonHebrewLetters(previous);
}

export const HEBREW_ONLY_HINT = 'יש להזין בעברית - כך הפרטים נשלחים לרשויות';

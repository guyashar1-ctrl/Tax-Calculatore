// errors.mjs — אוצר המילים שכל handler משתמש בו כדי לומר לעובד איך להגיב.
// כל שגיאה אחרת (רגילה, לא מהמחלקות האלה) מטופלת כ-failed רגיל.

/** "עצרתי, צריך בן אדם" — הכי חשוב מכל השלוש. אף פעם לא מנסים לעקוף. */
export class NeedsHumanError extends Error {
  constructor(message, code = 'auth_required') {
    super(message);
    this.name = 'NeedsHumanError';
    this.code = code;
  }
}

/** כישלון סופי — לא שווה לנסות שוב בלי קוד חדש. */
export class PermanentError extends Error {
  constructor(message, code = 'permanent_error') {
    super(message);
    this.name = 'PermanentError';
    this.code = code;
  }
}

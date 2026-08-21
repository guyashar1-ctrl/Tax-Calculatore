// ─── שדה כתובת מייל · הרכיב היחיד ────────────────────────────────────────────
// כל מקום שמבקש כתובת מייל משתמש בזה, ולכן מקבל בבת אחת: מקלדת מייל בנייד,
// כיוון LTR אמיתי (התכונה dir לבדה מפסידה ל-‎direction: rtl‎ הגלובלי ב-index.css),
// השלמה אוטומטית מתאימה, וסימון עדין של כתובת לא תקינה — לפי אותה בדיקה
// שרצה בשליחה עצמה (utils/email).
//
// ‼ הסימון מופיע רק אחרי שעוזבים את השדה, ולעולם אינו חוסם. הבדיקה החוסמת
// נשארת במקום היחיד שבו היא הייתה: ברגע השמירה/השליחה של המסך.
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { isValidEmail, MAX_EMAIL_LENGTH } from '../../utils/email';

export interface EmailInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'> {
  /**
   * השדה מבקש את הכתובת של מי שממלא אותו כרגע (טפסים ציבוריים שהלקוח פותח),
   * ולכן נכון להציע לו את הכתובת השמורה בדפדפן. במסכי המשרד מזינים כתובת
   * של אדם אחר — שם השלמה אוטומטית רק תדחוף את הכתובת של הרו״ח.
   */
  ownAddress?: boolean;
}

const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(function EmailInput(
  { ownAddress, autoComplete, className, onBlur, onChange, ...rest }, ref,
) {
  const [touched, setTouched] = useState(false);
  const raw = typeof rest.value === 'string' ? rest.value : '';
  const showInvalid = touched && raw.trim().length > 0 && !isValidEmail(raw);

  return (
    <input
      {...rest}
      ref={ref}
      type="email"
      inputMode="email"
      maxLength={rest.maxLength ?? MAX_EMAIL_LENGTH}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      autoComplete={autoComplete ?? (ownAddress ? 'email' : 'off')}
      className={['ui-email', className].filter(Boolean).join(' ')}
      aria-invalid={showInvalid || rest['aria-invalid'] === true ? true : undefined}
      onChange={e => { if (touched) setTouched(false); onChange?.(e); }}
      onBlur={e => { setTouched(true); onBlur?.(e); }}
    />
  );
});

export default EmailInput;

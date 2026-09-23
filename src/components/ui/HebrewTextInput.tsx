// ─── שדה טקסט בעברית בלבד · הרכיב היחיד ─────────────────────────────────────
// כל מקום שמבקש עיר או כתובת משתמש בזה, ולכן מקבל את אותה התנהגות: אות
// לועזית פשוט אינה נכנסת, ומתחת לשדה מופיעה שורת הסבר קצרה. ההסבר חיוני —
// שדה ששותק כשמקלידים בו נראה שבור.
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { rejectsHebrewOnly, HEBREW_ONLY_HINT } from '../../utils/hebrewText';

export type HebrewTextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

const HebrewTextInput = forwardRef<HTMLInputElement, HebrewTextInputProps>(function HebrewTextInput(
  { className, onChange, ...rest }, ref,
) {
  // ‼ מונה ולא דגל: כשהערך נדחה, ה-state חייב להשתנות בכל הקלדה כדי ש-React
  // ירנדר מחדש ויחזיר לשדה את הערך השמור. דגל בוליאני נשאר true בהקלדה
  // השנייה, אין רינדור — והאות הלועזית נשארת על המסך.
  const [rejects, setRejects] = useState(0);

  return (
    <>
      <input
        {...rest}
        ref={ref}
        type="text"
        lang="he"
        spellCheck={false}
        className={['ui-hebrew', className].filter(Boolean).join(' ')}
        onChange={e => {
          const previous = typeof rest.value === 'string' ? rest.value : '';
          if (rejectsHebrewOnly(e.target.value, previous)) { setRejects(n => n + 1); return; }
          if (rejects) setRejects(0);
          onChange?.(e);
        }}
      />
      {rejects > 0 && <div className="ui-hebrew-hint">{HEBREW_ONLY_HINT}</div>}
    </>
  );
});

export default HebrewTextInput;

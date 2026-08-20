// עורך טקסט שמראה את המרקר בזמן הכתיבה.
//
// ‼ לא עורך עשיר: הטקסט נשאר טקסט פשוט עם `==` סביב הקטע המסומן, בדיוק כמו
// שהוא נשמר ונשלח. מה שנוסף כאן הוא ויזואלי בלבד — שכבת רקע שמציירת את אותו
// טקסט עם רקע צהוב על הקטעים המסומנים, וה-textorea השקוף שמעליה מקבל את
// ההקלדה. עד היום ראו רק את התווים `==` בשחור-לבן, והצהוב הופיע רק אצל הנמען.
//
// ‼ שתי השכבות חייבות לגלוש בדיוק אותו דבר, אחרת הצהוב זז מהמילים: כל מה
// שמשפיע על גלישה מוגדר פעם אחת ב-ui.css לשתיהן. תווי ה-`==` מצוירים בתוך
// הצהוב ולא מוסתרים — הסתרתם הייתה מקצרת את השורה בשכבה אחת בלבד.

import { forwardRef, useRef, type CSSProperties } from 'react';
import { HIGHLIGHT_MARK, splitHighlights } from '../../utils/releaseLetter';

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  /** גובה שורה — חייב להיות זהה בשתי השכבות, ולכן עובר כמשתנה אחד. */
  lineHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const HighlightTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function HighlightTextarea({ value, onChange, rows = 12, disabled, lineHeight = 1.7, className, style }, ref) {
    const backdrop = useRef<HTMLDivElement | null>(null);

    const painted: React.ReactNode[] = [];
    value.split('\n').forEach((line, li) => {
      if (li > 0) painted.push('\n');
      splitHighlights(line).forEach((part, pi) => {
        const key = `${li}-${pi}`;
        painted.push(part.mark
          ? <span className="hl-mark" key={key}>{HIGHLIGHT_MARK}{part.text}{HIGHLIGHT_MARK}</span>
          : <span key={key}>{part.text}</span>);
      });
    });
    // שורה אחרונה ריקה מצוירת גם היא — אחרת הסמן יורד לשורה שאין לה רקע.
    painted.push('\n');

    return (
      <div className={`hl-editor${className ? ` ${className}` : ''}`}
        style={{ ...style, ['--hl-lh' as string]: lineHeight }}>
        <div className="hl-editor__backdrop" ref={backdrop} aria-hidden="true">{painted}</div>
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          onScroll={e => { if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop; }}
        />
      </div>
    );
  });

export default HighlightTextarea;

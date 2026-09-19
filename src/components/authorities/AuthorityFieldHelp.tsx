// ─── «?» ליד שדה רשות — איפה מוצאים את הערך בשע״ם / בביטוח לאומי ────────────
// ‼ גילוי הדרגתי: התצוגה הקומפקטית נשארת שקטה; ההסבר מופיע רק כשמבקשים —
// ריחוף עכבר, פוקוס מקלדת, או לחיצה (למסך מגע). התוכן מגיע ממטא-דאטה
// אחד (authorityFieldHelp) — לא ממחרוזות שמפוזרות ברכיבים.

import { useEffect, useId, useRef, useState } from 'react';
import type { AuthorityFieldHelp as HelpData } from '../../features/taxFile/authorityFieldHelp';

export default function AuthorityFieldHelp({ help }: { help: HelpData }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  // ‼ פתיחה בלחיצה (מגע/עכבר) נסגרת ב-Escape או בלחיצה מחוץ — לא נשארת
  // תלויה מעל הכרטיס. ריחוף/פוקוס נסגרים מעצמם דרך CSS.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const title = `איפה מוצאים ב${help.source}?`;
  return (
    <span className={`afh ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button type="button" className="afh-btn" aria-label={title} aria-describedby={tipId}
        aria-expanded={open} onClick={() => setOpen(o => !o)}>
        ?
      </button>
      <span className="afh-tip" role="tooltip" id={tipId}>
        <span className="afh-tip-title">{title}</span>
        {help.paths.map(p => <span className="afh-path" key={p}>{p}</span>)}
        {help.guide && (
          <span className="afh-guide">
            {help.guide.intro && <span className="afh-guide-intro">{help.guide.intro}</span>}
            <ol>
              {help.guide.steps.map(s => <li key={s}>{s}</li>)}
            </ol>
          </span>
        )}
      </span>
    </span>
  );
}

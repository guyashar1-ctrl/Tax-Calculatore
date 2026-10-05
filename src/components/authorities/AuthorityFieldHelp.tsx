// ─── «?» ליד שדה רשות — איפה מוצאים את הערך, ולפעמים גם מה הוא אומר ─────────
// ‼ גילוי הדרגתי: התצוגה הקומפקטית נשארת שקטה; ההסבר מופיע רק כשמבקשים —
// ריחוף עכבר, פוקוס מקלדת, או לחיצה (למסך מגע). התוכן מגיע ממטא-דאטה
// אחד (authorityFieldHelp) — לא ממחרוזות שמפוזרות ברכיבים.
// ‼ (219) `explain` — הסבר הערכים של הלקוח הזה (בסיס לדמי ביטוח): מה נקרא,
// מה חושב ומה הוערך. ההסבר נשאר בתוך המסך גם כשה-«?» צמוד לקצה (טלפון).

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { AuthorityFieldHelp as HelpData } from '../../features/taxFile/authorityFieldHelp';
import type { NiHelpSection } from '../../features/nationalInsurance/niBasisDisplay';

const EDGE = 12;

export default function AuthorityFieldHelp({ help, explain, label }: {
  help: HelpData | null;
  explain?: NiHelpSection[];
  /** שם השדה — לכותרת ההסבר ולתווית הנגישות. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const visible = open || peek;
  const rich = !!explain?.length;

  // ‼ פתיחה בלחיצה (מגע/עכבר) נסגרת ב-Escape או בלחיצה מחוץ — לא נשארת
  // תלויה מעל הכרטיס. pointerdown ולא mousedown: נגיעה בטלפון סוגרת מיד.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      setPeek(false);
      if (rootRef.current?.contains(document.activeElement)) btnRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setPeek(false); }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [visible]);

  // ‼ ההסבר ממוקם ביחס לחלון ולא לכרטיס: כרטיס הרשויות חותך את מה שגולש
  // ממנו (overflow:hidden), וה-«?» של «בסיס לדמי ביטוח» יושב בקצה השמאלי
  // ובתחתית. צמוד לצד הימני של ה-«?» (RTL), נדחף לתוך המסך, ונפתח למעלה
  // כשאין מקום למטה; ארוך מהמקום ⇒ גלילה בתוכו, לא חיתוך.
  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const tip = tipRef.current, btn = btnRef.current;
      if (!tip || !btn) return;
      const b = btn.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      tip.style.maxHeight = '';
      const w = tip.offsetWidth, h = tip.scrollHeight;
      const left = Math.max(EDGE, Math.min(b.right - w, vw - EDGE - w));
      const below = vh - b.bottom - 6 - EDGE, above = b.top - 6 - EDGE;
      const down = h <= below || below >= above;
      const room = Math.max(120, down ? below : above);
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(down ? b.bottom + 6 : b.top - 6 - Math.min(h, room))}px`;
      tip.style.maxHeight = `${Math.round(room)}px`;
    };
    place();
    // ‼ גלילה בתוך ההסבר עצמו אינה סיבה למקם מחדש (זה היה מאפס את הגלילה).
    const onScroll = (e: Event) => { if (!tipRef.current?.contains(e.target as Node)) place(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [visible]);

  const where = help?.paths.length ? `איפה מוצאים ב${help.source}?` : null;
  const title = rich ? `${label ?? 'השדה'} — מאיפה הערכים` : (where ?? label ?? 'עזרה');

  return (
    <span className={`afh${visible ? ' is-open' : ''}${rich ? ' afh-rich' : ''}`} ref={rootRef}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setPeek(true); }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setPeek(false); }}>
      <button type="button" className="afh-btn" ref={btnRef}
        aria-label={rich ? `הסבר: ${title}` : title} aria-describedby={tipId} aria-expanded={visible}
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) setPeek(true); }}
        onBlur={e => { if (!rootRef.current?.contains(e.relatedTarget as Node)) { setPeek(false); setOpen(false); } }}
        onClick={() => { if (open) { setOpen(false); setPeek(false); } else setOpen(true); }}>
        ?
      </button>
      <span className="afh-tip" role="tooltip" id={tipId} ref={tipRef}>
        <span className="afh-tip-title">{title}</span>
        {explain?.map(sec => (
          <span className={`afh-sec afh-sec-${sec.kind}`} key={sec.kind}>
            <span className="afh-sec-title">{sec.title}</span>
            {sec.lines.map((l, i) => (
              <span className="afh-line" key={i}>
                {l.text}
                {l.formula && <bdi className="afh-formula" dir="ltr">{l.formula}</bdi>}
              </span>
            ))}
          </span>
        ))}
        {rich && where && <span className="afh-sec-title afh-where-title">{where}</span>}
        {help?.paths.map(p => <span className="afh-path" key={p}>{p}</span>)}
        {help?.guide && (
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

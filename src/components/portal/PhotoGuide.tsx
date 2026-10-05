// ─── מדריך מצולם — הרכיב הגנרי ──────────────────────────────────────────────
// חולץ מ-RepApprovalGuide (אישור הייצוג) בלי לשנות את המראה: אותם class-ים (rag-*) ואותו
// repApprovalGuide.css. מי שמוסיף מדריך — photoGuides.ts (הרישום) או עטיפה דקה כמו RepApprovalGuide.
//
// ‼ שלב ושלב בכל פעם — בטלפון זה המסך כולו. התמונה נפתחת בגודל מלא בלחיצה, וממוקדת על הפקד
//   המסומן (focus, בפיקסלים של התמונה).
// ‼ צעד בלי `image` הוא צעד טקסט בלבד: בלי figure ובלי הגדלה. הוא יכול לשאת `link` (למשל טופס באתר
//   אחר) — שמוצג כמו קישור הכניסה, ואינרטי כש-entryInert (תצוגה במשרד).
// ‼ `copy` — נוסח מוכן להעתקה (למשל תוכן פנייה באתר): תיבה עם הטקסט וכפתור «העתקת הנוסח». בטלפון זה
//   מחליף סימון ידני של משפט ארוך. ההעתקה כולה בדפדפן — אין בה קריאה לשרת ושום דבר לא נרשם.
//   צעד שיש בו גם צילום וגם נוסח: קודם הצילום (איפה לוחצים ואיפה כותבים), ורק אחריו הנוסח להעתקה והמשך
//   ההוראות. בצעד עם צילום בלבד — הסדר כמו תמיד (הוראה, שורת משנה, צילום).
// ‼ המדריך הוא תוכן לקריאה: פתיחה, מעבר בין צעדים, הגדלה וקישורים — אף אחד מהם לא מדווח כלום
//   ולא משלים שום בקשה. מי שמשלים בקשה הוא המשתמש, בפקד נפרד.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './repApprovalGuide.css';

export interface PhotoGuideStep {
  title: string;
  text: string;
  /** שורת משנה. ‼ יכולה לכלול שורות נפרדות (\n). */
  extra?: string;
  /** בלי תמונה ⇒ צעד טקסט בלבד (בלי figure ובלי הגדלה). */
  image?: {
    alt: string;
    w: number;
    h: number;
    /** מרכז הפקד המסומן, בפיקסלים של התמונה — לשם ממוקדת ההגדלה. */
    focus: [number, number];
  };
  /** קישור בתוך הצעד (למשל הטופס). מוצג כמו קישור הכניסה; אינרטי בתצוגה במשרד. */
  link?: { url: string; label: string; host: string };
  /** נוסח להעתקה — תיבה עם הטקסט וכפתור «העתקת הנוסח». */
  copy?: { label: string; text: string };
}

export interface PhotoGuideEntry {
  url: string;
  label: string;
  host: string;
  note: string;
}

/** הכפתור שפותח מדריך — אותו נוסח בדף האישי ובמשרד. */
export function PhotoGuideButton({ steps, onClick, accent, className }: {
  steps: number; onClick: () => void; accent?: string; className?: string;
}) {
  return (
    <button type="button" className={`rag-open${className ? ` ${className}` : ''}`} onClick={onClick}
      style={accent ? { color: accent } : undefined}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3.2" /><path d="M8 5l1.5-2h5L16 5" />
      </svg>
      מדריך מצולם · {steps} צעדים
    </button>
  );
}

/** תיבת «נוסח להעתקה». ‼ הטקסט נשאר מסומן-אפשרי: אם ההעתקה האוטומטית לא עובדת, אפשר לסמן ולהעתיק ידנית. */
function CopyBox({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  const textRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* ננסה את הדרך הישנה */ }
    if (!ok) {
      // דפדפן בלי clipboard (או הקשר לא מאובטח): textarea זמני + execCommand.
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (!ok && textRef.current) {
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(textRef.current); sel?.removeAllRanges(); sel?.addRange(range);
    }
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2400);
  }

  return (
    <div className="rag-copy" data-testid="rag-copy">
      <div className="rag-copy-label">{label}</div>
      <p className="rag-copy-text" ref={textRef}>{text}</p>
      <button type="button" className="rag-copy-btn" onClick={() => void copy()} aria-live="polite">
        {state === 'copied' ? 'הועתק ✓' : state === 'failed' ? 'סימנו את הנוסח - אפשר להעתיק ידנית' : 'העתקת הנוסח'}
      </button>
    </div>
  );
}

export default function PhotoGuide({ onClose, accent, kicker, steps, imageUrl, entry, entryInert, fine, scopeNote }: {
  onClose: () => void;
  /** צבע המשרד בדף האישי; במשרד — ברירת המחדל. */
  accent?: string;
  /** «מדריך מצולם · …» — מעל כותרת הצעד. */
  kicker: string;
  steps: readonly PhotoGuideStep[];
  /** כתובת הצילום של צעד לפי המיקום שלו ברשימה (רק לצעד עם `image`). */
  imageUrl: (stepIndex: number) => string;
  /** קישור הכניסה לאתר — מוצג בצעד הראשון. */
  entry?: PhotoGuideEntry;
  /** בתצוגה המקדימה במשרד הקישורים אינם פעילים — רק היעד מוצג. */
  entryInert?: boolean;
  /** שורת ההסתייגות מתחת לצילום. ‼ מוצגת רק בצעד שיש בו צילום. */
  fine: string;
  /** במשרד, בלי לקוח: משפט אחד שאומר שזה המדריך הכללי. */
  scopeNote?: string;
}) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const n = steps.length;
  const step = steps[i];
  const last = i === n - 1;

  const next = useCallback(() => setI(v => Math.min(n - 1, v + 1)), [n]);
  const prev = useCallback(() => setI(v => Math.max(0, v - 1)), []);

  // פוקוס: נכנס לחלון, וחוזר למי שפתח אותו.
  useEffect(() => {
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // הצעד הבא נטען מראש (אם יש בו צילום), כדי שהמעבר לא יחכה לרשת.
  useEffect(() => {
    if (i + 1 < n && steps[i + 1].image) { const img = new Image(); img.src = imageUrl(i + 1); }
  }, [i, n, steps, imageUrl]);

  // ההגדלה ממוקדת על הפקד המסומן.
  useEffect(() => {
    if (!zoom || !step.image) return;
    const box = zoomRef.current;
    if (!box) return;
    const [fx, fy] = step.image.focus;
    box.scrollLeft = Math.max(0, fx - box.clientWidth / 2);
    box.scrollTop = Math.max(0, fy - box.clientHeight / 2);
    box.focus();
  }, [zoom, step]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // ‼ המדריך נפתח גם מתוך חלון אחר (עורך הבקשה בספרייה): Esc של אותו חלון נרשם ב-document בשלב
        // הלכידה ובולע את האירוע — בלי לעצור אותו כאן, Esc במדריך היה סוגר את העורך שמתחתיו.
        e.stopPropagation();
        if (zoom) setZoom(false); else onClose();
        return;
      }
      if (zoom) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      // ‼ RTL: שמאלה = קדימה.
      if (e.key === 'ArrowLeft') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); prev(); }
      else if (e.key === 'Tab' && dialogRef.current) {
        const f = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
        if (f.length === 0) return;
        const first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    };
    // ‼ שלב הלכידה על window: קודם לכל מאזין של document.
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [zoom, next, prev, onClose]);

  const style = accent ? ({ '--rag-accent': accent } as React.CSSProperties) : undefined;
  const img = step.image;
  const figure = img && (
    <>
      <figure className="rag-fig">
        <button type="button" className="rag-imgbtn" onClick={() => setZoom(true)} aria-label={`הגדלת הצילום של צעד ${i + 1}`}>
          <img key={i} src={imageUrl(i)} alt={img.alt} width={img.w} height={img.h} decoding="async" />
          <span className="rag-zoom-hint" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" /></svg>
            לחיצה על הצילום מגדילה אותו
          </span>
        </button>
      </figure>
      <p className="rag-fine">{fine}</p>
    </>
  );
  const figureFirst = !!(img && step.copy);

  return createPortal(
    <div className="rag-root" dir="rtl" style={style}>
      <div className="rag-scrim" onClick={onClose} />
      <div className="rag" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} tabIndex={-1}>
        <header className="rag-head">
          <div className="rag-head-text">
            <div className="rag-kicker">{kicker}</div>
            <h2 className="rag-title" id={titleId}>
              <span className="rag-num" aria-hidden="true">{i + 1}</span>
              {step.title}
            </h2>
          </div>
          <button type="button" className="rag-x" onClick={onClose} aria-label="סגירת המדריך">✕</button>
        </header>

        <div className="rag-body">
          <p className="rag-count" aria-live="polite">צעד {i + 1} מתוך {n}</p>
          {scopeNote && <p className="rag-fine rag-scope" data-testid="rag-scope-note">{scopeNote}</p>}
          <p className="rag-text">{step.text}</p>
          {i === 0 && entry && (
            <p className="rag-entry">
              עוד לא נכנסתם?{' '}
              {entryInert
                ? <span className="rag-entry-link is-inert">{entry.label}</span>
                : <a className="rag-entry-link" href={entry.url} target="_blank" rel="noopener noreferrer">{entry.label}</a>}
              <span className="rag-entry-host" dir="ltr">{entry.host}</span>
              <span className="rag-entry-note">{entry.note}</span>
            </p>
          )}
          {step.link && (
            <p className="rag-entry rag-step-link">
              {entryInert
                ? <span className="rag-entry-link is-inert">{step.link.label}</span>
                : <a className="rag-entry-link" href={step.link.url} target="_blank" rel="noopener noreferrer">{step.link.label}</a>}
              <span className="rag-entry-host" dir="ltr">{step.link.host}</span>
            </p>
          )}
          {figureFirst && figure}
          {step.copy && <CopyBox key={i} label={step.copy.label} text={step.copy.text} />}
          {step.extra && <p className="rag-extra" style={{ whiteSpace: 'pre-line' }}>{step.extra}</p>}
          {!figureFirst && figure}
        </div>

        <footer className="rag-foot">
          <button type="button" className="rag-btn is-ghost" onClick={prev} disabled={i === 0}>→ הקודם</button>
          <ol className="rag-dots" aria-label="צעדים">
            {steps.map((s, k) => (
              <li key={k}>
                <button type="button" className={`rag-dot${k === i ? ' is-on' : ''}`} onClick={() => setI(k)}
                  aria-label={`צעד ${k + 1}: ${s.title}`} aria-current={k === i ? 'step' : undefined} />
              </li>
            ))}
          </ol>
          {last
            ? <button type="button" className="rag-btn is-primary" onClick={onClose}>סיום</button>
            : <button type="button" className="rag-btn is-primary" onClick={next}>הבא ←</button>}
        </footer>
      </div>

      {zoom && img && (
        <div className="rag-zoom" role="dialog" aria-modal="true" aria-label={`הצילום של צעד ${i + 1} בגודל מלא`}>
          <button type="button" className="rag-zoom-x" onClick={() => setZoom(false)}>סגירת ההגדלה ✕</button>
          <div className="rag-zoom-scroll" ref={zoomRef} tabIndex={0} dir="ltr">
            <img src={imageUrl(i)} alt={img.alt} width={img.w} height={img.h} />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

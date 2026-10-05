// רכיבים קטנים של «מסלולים» — יריעה, בורר מקטעים, אייקונים.
// ‼ יריעה ולא חלון באמצע: בטלפון היא עולה מלמטה, במחשב נפתחת מהצד, והעמוד
// שמאחוריה נשאר גלוי — רואים על איזה שלב עובדים.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FlSheet({ title, sub, onClose, children, foot, wide }: {
  title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // ‼ ref ולא תלות: סוגר שנוצר בכל רינדור היה מפעיל את האפקט מחדש ומקפיץ את הפוקוס.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]');
    (first ?? ref.current)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // ‼ רק החלון העליון נסגר: מדריך מצולם, גיליון נוסף (צפייה מתוך גיליון) או חלון אחר שנפתח מעליי מטפל ב-Esc בעצמו —
        // שני המאזינים רשומים על window, ו-stopPropagation לא עוצר את המאזין השני.
        const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
        if (dialogs.length && dialogs[dialogs.length - 1] !== ref.current) return;
        e.stopPropagation(); closeRef.current(); return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null);
      if (!nodes.length) return;
      if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
    };
    window.addEventListener('keydown', h, true);
    return () => {
      window.removeEventListener('keydown', h, true);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="fl-sheet-root" dir="rtl">
      <div className="fl-scrim" onClick={onClose} />
      <div className={`fl-sheet${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <header className="fl-sheet-head">
          <div>
            <h2 className="fl-sheet-title" id={id}>{title}</h2>
            {sub && <div className="fl-sheet-sub">{sub}</div>}
          </div>
          <button type="button" className="fl-x" onClick={onClose} aria-label="סגירה">✕</button>
        </header>
        <div className="fl-sheet-body">{children}</div>
        {foot && <footer className="fl-sheet-foot">{foot}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function FlSeg<T extends string>({ value, options, onChange, label, small }: {
  value: T; options: { value: T; label: string; auto?: boolean; disabled?: boolean }[]; onChange: (v: T) => void; label: string; small?: boolean;
}) {
  return (
    <div className={`fl-seg${small ? ' is-small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled}
          className={`${value === o.value ? 'is-on' : ''}${o.auto ? ' is-auto' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

type IconName = 'person' | 'office' | 'external' | 'doc' | 'bolt' | 'mail' | 'clock' | 'check' | 'plus' | 'dots' | 'branch' | 'eye' | 'bell';

const PATHS: Record<IconName, ReactNode> = {
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></>,
  office: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  doc: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></>,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  check: <path d="M5 12l4 4 10-10" />,
  plus: <path d="M12 5v14M5 12h14" />,
  dots: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 7v10M6 12h10" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
};

export function FlIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="fl-ic">{PATHS[name]}</svg>
  );
}

export const ACTOR_ICON = {
  client: 'person', office: 'office', external: 'external', document: 'doc', action: 'bolt',
} as const;

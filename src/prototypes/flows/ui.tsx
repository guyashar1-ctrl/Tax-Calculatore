// רכיבים קטנים להדגמת המסלולים — יריעה, בורר מקטעים, צ'יפ, אייקונים.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Sheet({ title, sub, onClose, children, foot, wide }: {
  title: string; sub?: string; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  // ‼ ref ולא תלות: סוגר שנוצר בכל רינדור היה מפעיל את האפקט מחדש ומקפיץ את הפוקוס.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener('keydown', h);
    return () => { window.removeEventListener('keydown', h); opener?.focus?.(); };
  }, []);
  return createPortal(
    <div className="fd-sheet-root" dir="rtl">
      <div className="fd-scrim" onClick={onClose} />
      <div className={`fd-sheet${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <header className="fd-sheet-head">
          <div>
            <h2 className="fd-sheet-title" id={id}>{title}</h2>
            {sub && <div className="fd-sheet-sub">{sub}</div>}
          </div>
          <button type="button" className="fd-x" onClick={onClose} aria-label="סגירה">✕</button>
        </header>
        <div className="fd-sheet-body">{children}</div>
        {foot && <footer className="fd-sheet-foot">{foot}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Seg<T extends string>({ value, options, onChange, label, small }: {
  value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string; small?: boolean;
}) {
  return (
    <div className={`fd-seg${small ? ' is-small' : ''}`} role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value}
          className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="fd-seg-n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chip({ tone = 'gray', children, title }: { tone?: 'gray' | 'blue' | 'pink' | 'amber' | 'green' | 'red' | 'line'; children: ReactNode; title?: string }) {
  return <span className={`fd-chip is-${tone}`} title={title}>{children}</span>;
}

type IconName = 'person' | 'office' | 'external' | 'doc' | 'bolt' | 'mail' | 'clock' | 'check' | 'plus' | 'dots' | 'pause' | 'play' | 'stop' | 'arrow' | 'branch' | 'lib' | 'flow' | 'eye';

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
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5l11 7-11 7z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  arrow: <path d="M19 12H5M11 6l-6 6 6 6" />,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 7v10M6 12h10" /></>,
  lib: <><path d="M4 5h4v14H4zM10 5h4v14h-4z" /><path d="M16 6l3.5-1 3 13.5-3.5 1z" /></>,
  flow: <><rect x="3" y="4" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" /><path d="M6.5 9v4a2 2 0 0 0 2 2h5.5" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="fd-ic">{PATHS[name]}</svg>
  );
}

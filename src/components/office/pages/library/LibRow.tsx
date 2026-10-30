// ─── שורה בספרייה — בשפה של «בקשות» (הדמיה מאושרת, 30.10.2026) ─────────────────
// ‼ גיא: «למה זה נראה כל כך עמוס». בשורה רק נקודה, שם ומילה אחת («צפייה», או «חסר» בכתום);
// כל השאר — מה הלקוח רואה, מי עושה, «בשימוש ב», «עריכה» — בלחיצה על השורה.
// קבוצה = נקודה אחרי נקודה, כמו קבוצה ב«בקשות» של הלקוח.
// הדמיה: docs/proposals/2026-10-30-library-simple.html
import { useCallback, useState } from 'react';

/** שורה אחת פתוחה בכל פעם בעמוד. */
export function useOneOpen(initial: string | null = null) {
  const [openKey, setOpenKey] = useState<string | null>(initial);
  const toggle = useCallback((k: string) => setOpenKey(cur => (cur === k ? null : k)), []);
  return [openKey, toggle, setOpenKey] as const;
}

const Chev = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
);

export function LibRow({ id, name, marker = 'dot', side, open, onToggle, highlight, children }: {
  id?: string;
  name: React.ReactNode;
  /** dot = בקשה · ring = קבוצה · file / form / meet — סמל קטן במקום הנקודה. */
  marker?: 'dot' | 'ring' | 'file' | 'form' | 'meet';
  /** המילה האחת בצד — «צפייה» / «חסר». לא חלק מכפתור הפתיחה (כפתור בתוך כפתור אינו HTML תקין). */
  side?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li id={id} className={`lr${open ? ' is-open' : ''}${highlight ? ' is-focus' : ''}`}>
      <div className="lr-line">
        <button type="button" className="lr-hit" aria-expanded={open} onClick={onToggle}>
          {marker === 'dot' || marker === 'ring'
            ? <span className={`lr-${marker}`} aria-hidden="true" />
            : <span className="lr-ic" aria-hidden="true">{marker === 'file' ? 'PDF' : marker === 'form' ? 'טופס' : 'Meet'}</span>}
          <span className="lr-name">{name}</span>
        </button>
        {side && <span className="lr-side">{side}</span>}
        <button type="button" className="lr-chev" tabIndex={-1} aria-hidden="true" onClick={onToggle}><Chev /></button>
      </div>
      {open && children && <div className="lr-det">{children}</div>}
    </li>
  );
}

export interface ChainKid {
  key: string;
  title: string;
  /** מי עושה — מילה או שתיים בצד. */
  who: string;
  onPreview?: () => void;
  action?: { label: string; onClick: () => void; aria?: string } | null;
}

/** קבוצה — שורה עם טבעת ונקודות קטנות, ונפתחת לשרשרת: נקודה אחרי נקודה. */
export function LibGroup({ id, name, kids, side, open, onToggle, highlight, foot }: {
  id?: string;
  name: string;
  kids: ChainKid[];
  side?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  highlight?: boolean;
  foot?: React.ReactNode;
}) {
  return (
    <li id={id} className={`lr lr-group${open ? ' is-open' : ''}${highlight ? ' is-focus' : ''}`}>
      <div className="lr-line">
        <button type="button" className="lr-hit" aria-expanded={open} onClick={onToggle}>
          <span className="lr-ring" aria-hidden="true" />
          <span className="lr-name">{name}</span>
          <span className="lr-mini" aria-label={kids.length === 1 ? 'בקשה אחת' : `${kids.length} בקשות`}>
            {kids.map(k => <i key={k.key} />)}
          </span>
        </button>
        {side && <span className="lr-side">{side}</span>}
        <button type="button" className="lr-chev" tabIndex={-1} aria-hidden="true" onClick={onToggle}><Chev /></button>
      </div>
      {open && (
        <>
          <ol className="lr-chain">
            {kids.map(k => (
              <li key={k.key} className="lr-kid" data-kid={k.key}>
                <span className="lr-dot" aria-hidden="true" />
                {k.onPreview
                  ? <button type="button" className="lr-kid-name" aria-label={`צפייה: ${k.title}`} onClick={k.onPreview}>{k.title}</button>
                  : <span className="lr-kid-name">{k.title}</span>}
                <span className="lr-who">{k.who}</span>
                {k.action && (
                  <button type="button" className="of-link lr-kid-act" aria-label={k.action.aria ?? `${k.action.label}: ${k.title}`}
                    onClick={k.action.onClick}>{k.action.label}</button>
                )}
              </li>
            ))}
          </ol>
          {foot && <div className="lr-foot">{foot}</div>}
        </>
      )}
    </li>
  );
}

/**
 * מגירה צדדית (דסקטופ) / יריעה במסך מלא (מובייל) — התצוגה המהירה של אדם.
 * המקור החזותי: docs/prototypes/customers-v3-production-reference.html.
 *
 * מכניקת הנגישות זהה ל-Modal (פוקוס כלוא, Esc, נעילת גלילה, החזרת פוקוס
 * לפותח) — משוכפלת בכוונה ולא ממוחזרת ממנו: Modal משרת שלוש זרימות חיות,
 * ושליפת הליבה ממנו בשלב הזה הייתה מסכנת אותן בלי צורך.
 *
 * ‼ הסגירה היא באחריות ההורה (onClose) — כאן רק מדווחים. זה מה שמאפשר
 * לכתובת ‎#/clients/p/{id}‎ להיות מקור האמת, וכפתור "אחורה" במובייל סוגר.
 */
import { ReactNode, useEffect, useRef, useCallback } from 'react';

interface SheetProps {
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Sheet({ onClose, ariaLabel, children }: SheetProps) {
  const panelRef = useRef<HTMLElement>(null);
  const openerRef = useRef<Element | null>(null);

  const requestClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]')
      || panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => { (openerRef.current as HTMLElement | null)?.focus?.(); };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return; }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || [])
        .filter(n => n.offsetParent !== null);
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); firstNode.focus(); }
      if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); lastNode.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [requestClose]);

  return (
    <div className="pd-scrim" onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <aside
        className="pd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        ref={panelRef}
        onMouseDown={e => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
}

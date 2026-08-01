/**
 * חלון · אפיון §3.11.
 * הרקע נשאר גלוי אבל מטושטש ומעומעם — המשתמש לא מאבד את ההקשר שממנו הגיע.
 * פוקוס לכוד, Esc סוגר, יציאה עם שינויים שלא נשמרו מבקשת אישור,
 * והפוקוס חוזר לאלמנט שפתח את החלון.
 */
import { ReactNode, useEffect, useRef, useCallback } from 'react';
import Icon from './Icon';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** יש שינויים שלא נשמרו — Esc ולחיצה בחוץ יבקשו אישור לפני סגירה */
  dirty?: boolean;
  width?: number;
  /** נקרא במקום onClose כשיש שינויים; אם לא סופק, מוצג confirm סטנדרטי */
  onGuardedClose?: () => void;
  labelledBy?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  title, onClose, children, footer, dirty, width = 560, onGuardedClose,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  const requestClose = useCallback(() => {
    if (dirty) {
      if (onGuardedClose) { onGuardedClose(); return; }
      if (!window.confirm('לצאת בלי לשמור?')) return;
    }
    onClose();
  }, [dirty, onClose, onGuardedClose]);

  // שומר מי פתח, כדי להחזיר אליו את הפוקוס בסגירה
  useEffect(() => {
    openerRef.current = document.activeElement;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]')
      || panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => { (openerRef.current as HTMLElement | null)?.focus?.(); };
  }, []);

  // מונע גלילה של הדף מאחורי החלון
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return; }
      if (e.key !== 'Tab') return;
      // לכידת פוקוס: Tab מהאחרון חוזר לראשון ולהפך
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
    <div className="ui-modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <div
        className="ui-modal"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        ref={panelRef}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="ui-modal-head">
          <h2 className="ui-modal-title">{title}</h2>
          <button type="button" className="ui-icon-btn" onClick={requestClose} aria-label="סגירה">
            <Icon name="close" />
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

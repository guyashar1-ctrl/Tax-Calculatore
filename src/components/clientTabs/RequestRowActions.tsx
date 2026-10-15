// ─── ⋯ בשורת הבקשה: הסרה / ביטול, או למה אי אפשר (15.10.2026) ─────────────────
// ‼ גיא לא מצא איך מוחקים בקשה: הפעולה ישבה רק בתוך שורה פתוחה, כקישור אפור קטן,
// ובחלק מהסוגים לא ישבה בכלל ולא אמרה למה. עכשיו בכל שורה — סגורה או פתוחה — יש
// כפתור ⋯ קבוע, והוא תמיד עונה על אחת משלוש: מה ההסרה עושה (ומתי), איפה מבטלים
// את הסוג הזה, או למה אי אפשר. ההחלטה עצמה — utils/requestRemoval.ts.
//
// ‼ אין כאן שום סמנטיקה חדשה של שרת: הכפתורים קוראים לפעולות שכבר היו.

import { useEffect, useId, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import type { RemovalDialog, RemovalPlan } from '../../utils/requestRemoval';

export type RemovalOutcome = { ok: true } | { ok: false; text: string; unknown?: boolean };

interface MenuProps {
  /** שם הבקשה — לתווית הנגישה של הכפתור. */
  title: string;
  plan: RemovalPlan;
  busy?: boolean;
  onRemove: () => void;
  onUndo: () => void;
  onTaxWork: () => void;
  onCancelForm: () => void;
  onOpenRepresentation?: () => void;
  /** ב"ל לאדם: פותח את «מחיקת/ביטול הבקשה» הייעודי (NiCancelRequest) — החלון שלו יושב ב-niSlot, מחוץ לתפריט. */
  onNiCancel?: () => void;
  niSlot?: React.ReactNode;
}

export function RowActionsMenu({ title, plan, busy, onRemove, onUndo, onTaxWork, onCancelForm, onOpenRepresentation, onNiCancel, niSlot }: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    // ‼ הפריט הראשון מקבל פוקוס — מקלדת וקורא מסך נוחתים בתוך התפריט.
    window.setTimeout(() => wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"], .ob-menu-item, [data-focus-first]')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // ‼ הפוקוס חוזר ל-⋯ לפני שהחלון נפתח: ככה Modal זוכר אותו כפותח, וחוזר אליו ב-Esc (התפריט נסגר, והפריט שבו כבר לא קיים).
  const pick = (fn: () => void) => () => { btnRef.current?.focus(); setOpen(false); fn(); };
  const danger = plan.kind === 'remove' || plan.kind === 'cancel_form' || plan.kind === 'tax_work' || plan.kind === 'ni_cancel';

  return (
    <div className="ob-menu-wrap rl-more-wrap" ref={wrapRef}>
      <button ref={btnRef} type="button" className={`rl-rowmore${open ? ' is-open' : ''}`} disabled={busy}
        aria-haspopup="menu" aria-expanded={open} data-row-actions
        aria-label={`פעולות על הבקשה: ${title}`} title="הסרה וביטול"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {/* ‼ חלון הביטול של ב"ל אינו portal — הוא ב-niSlot, אחרי התפריט, ולא בתוכו (תפריט סגור = display:none). */}
      <div className="ob-menu rl-more-menu" role="menu" hidden={!open} aria-label={`פעולות על ${title}`}>
        {(plan.kind === 'remove' || plan.kind === 'cancel_form' || plan.kind === 'tax_work' || plan.kind === 'undo' || plan.kind === 'ni_cancel') && (
          <button type="button" role="menuitem" data-remove-action={plan.kind}
            className={`rl-mi${plan.kind === 'undo' || !danger ? '' : ' is-danger'}`}
            onClick={pick(plan.kind === 'remove' ? onRemove : plan.kind === 'undo' ? onUndo : plan.kind === 'tax_work' ? onTaxWork
              : plan.kind === 'ni_cancel' ? (onNiCancel ?? (() => undefined)) : onCancelForm)}>
            <span className="rl-mi-l">{plan.menuLabel}</span>
            <span className="rl-mi-h">{plan.kind === 'ni_cancel'
              ? `${plan.hint}. מה שקרה נשמר ב«פעילות»; לא מבטל בקשה או ייצוג בביטוח לאומי.` : plan.hint}</span>
          </button>
        )}
        {plan.kind === 'blocked' && (
          /* ‼ לא menuitem מושבת: קישור בתוך פריט מושבת אינו לחיץ (ובקורא מסך — אינו נשמע). קבוצה עם שם, וההסבר בתוכה. */
          <div className="rl-mi-blocked" role="group" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-why`}
            tabIndex={-1} data-focus-first={plan.next === 'representation' && onOpenRepresentation ? undefined : ''} data-remove-action="blocked">
            <span className="rl-mi-l" id={`${uid}-t`}>אי אפשר להסיר מכאן</span>
            <span className="rl-mi-h" id={`${uid}-why`}>{plan.reason}</span>
            {plan.next === 'representation' && onOpenRepresentation && (
              <button type="button" role="menuitem" className="ui-linkbtn rl-mi-link" onClick={pick(onOpenRepresentation)}>למרכז הייצוג ←</button>
            )}
          </div>
        )}
      </div>
      {niSlot}
    </div>
  );
}

// ─── חלון אישור ההסרה ───────────────────────────────────────────────────────

interface DialogProps {
  dialog: RemovalDialog;
  onConfirm: (reason?: string) => Promise<RemovalOutcome>;
  onClose: () => void;
  /** טופס חכם: סיבה חובה (השרת דורש). */
  reasonLabel?: string;
}

/** ‼ הסרה וביטול טופס: אותו חלון — מה יוצא, מה נשאר, מה מיידי. כישלון נשאר בחלון ואומר מה קרה. */
export function RemoveRequestDialog({ dialog, onConfirm, onClose, reasonLabel }: DialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; unknown: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const lock = useRef(false);
  const needsReason = !!reasonLabel;

  async function go() {
    // ‼ לחיצה כפולה: הנעילה ב-ref (לא ב-state) — שתי לחיצות באותו פריים לא יוצאות לשרת פעמיים.
    if (lock.current) return;
    if (needsReason && !reason.trim()) { setError({ text: 'יש לכתוב סיבה — היא נשמרת בהיסטוריה של הטופס.', unknown: false }); return; }
    lock.current = true;
    setBusy(true);
    setError(null);
    const res = await onConfirm(needsReason ? reason.trim() : undefined);
    lock.current = false;
    setBusy(false);
    if (res.ok) { onClose(); return; }
    setError({ text: res.text, unknown: !!res.unknown });
  }

  return (
    <Modal
      title={dialog.title}
      onClose={() => { if (!busy) onClose(); }}
      width={460}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={onClose} disabled={busy} data-autofocus>חזרה</button>
          <button type="button" className="ui-btn ui-btn-danger" onClick={() => void go()} disabled={busy} data-confirm-removal>
            {busy ? 'רגע…' : dialog.confirmLabel}
          </button>
        </>
      }
    >
      <div className="ui-confirm-text rl-rm">
        <p className="rl-rm-lead">{dialog.lead}</p>
        {dialog.goes.length > 0 && (
          <>
            <p className="rl-rm-h">מה קורה</p>
            <ul className="rl-rm-list">{dialog.goes.map(g => <li key={g}>{g}</li>)}</ul>
          </>
        )}
        {dialog.stays.length > 0 && (
          <>
            <p className="rl-rm-h">מה נשמר</p>
            <ul className="rl-rm-list">{dialog.stays.map(g => <li key={g}>{g}</li>)}</ul>
          </>
        )}
        {dialog.warn && <p className="rl-rm-warn" role="note">{dialog.warn}</p>}
        {needsReason && (
          <label className="rl-rm-reason">
            <span>{reasonLabel}</span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} disabled={busy} maxLength={300} />
          </label>
        )}
        {error && (
          <p className="rl-rm-err" role="alert" style={error.unknown ? { color: 'var(--chip-amber-tx)' } : undefined}>{error.text}</p>
        )}
      </div>
    </Modal>
  );
}

// ─── שורות תיק המס — אבני הבניין המשותפות ────────────────────────────────────
// ‼ יצאו מ-TaxFileTab כדי שהתצוגה הקומפקטית של הרשויות (AuthoritiesPanel)
// תצויר באותן אבנים בדיוק גם ב«בקשות» — לא עותק שני של אותו מבנה.

import type { ReactNode } from 'react';

/**
 * שורה מתקפלת אחת — סיכום קבוע, פרטים רק אחרי פתיחה.
 * ‼ `exception` הוא חריגה שנקראת **מתוך השורה הסגורה** (המודל המאושר):
 * סריקה של ארבע שורות אמורה לספר מה לא בסדר בלי לפתוח כלום.
 * ‼ `unknown` מסמן «טרם ביררנו» — במשקל נמוך ובלי צבע אזהרה, כי חוסר ידיעה
 * אינו תקלה. קיר של לא-ידועים צבוע באדום היה נקרא כשריפה.
 */
export function TRow({
  id, name, summary, warn, exception, unknown, stale, open, onToggle, action, children,
}: {
  id: string; name: string; summary: string; warn?: string;
  exception?: { text: string; tone: 'high' | 'warn' | 'ok' } | null;
  unknown?: boolean; stale?: boolean;
  open: boolean; onToggle: (id: string) => void;
  /**
   * פקד הפעולה של הכרטיס (למשל «בדוק מול שע״ם») — **ליד** כפתור הפתיחה,
   * לא בתוכו: כפתור בתוך כפתור אינו HTML תקין, ולחיצה עליו הייתה גם פותחת
   * וגם מריצה.
   */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`txf-row ${open ? 'is-open' : ''}`}>
      <div className="txf-row-headwrap">
        <button type="button" className="txf-row-head" onClick={() => onToggle(id)} aria-expanded={open}>
          <span className="txf-row-name">{name}</span>
          <span className="txf-row-sum">
            <span className={unknown ? 'txf-unknown' : ''}>{summary}</span>
            {unknown && <span className="txf-qmark" aria-hidden="true">?</span>}
            {stale && <span className="txf-stale">⏱</span>}
            {warn && <span className="txf-warn-inline">⚠ {warn}</span>}
            {exception && (
              <span className={`txf-exc is-${exception.tone}`}>
                {exception.tone === 'ok' ? '✓' : '⚠'} {exception.text}
              </span>
            )}
          </span>
          <span className="txf-row-chev">◂</span>
        </button>
        {action && <span className="txf-row-act">{action}</span>}
      </div>
      {open && <div className="txf-row-body">{children}</div>}
    </div>
  );
}

/**
 * שורת המקור בתחתית כרטיס — מאיפה הנתונים, ופעולות משניות (ערוך / תצוגה
 * מפורטת). ‼ פעולות משניות בלבד: לא אוטומציה (זו ורודה, בכותרת הכרטיס).
 */
export function SrcLine({ label, onEdit, onDetailed }: {
  label: string; onEdit?: () => void;
  /** «תצוגה מפורטת» — מסך יישור הקו המלא של הרשות הזו, כלי בדיקה זמני. */
  onDetailed?: () => void;
}) {
  return (
    <div className="txf-srcline">
      <span>{label}</span>
      {(onEdit || onDetailed) && (
        <span className="txf-srcline-acts">
          {onDetailed && <button type="button" className="txf-srcline-2nd" onClick={onDetailed}>תצוגה מפורטת</button>}
          {onEdit && <button type="button" onClick={onEdit}>ערוך</button>}
        </span>
      )}
    </div>
  );
}

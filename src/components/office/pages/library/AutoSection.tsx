// ─── «נפתחות אוטומטית בקליטה» ──────────────────────────────────────────────
// ‼ בקשות שהמערכת פותחת לבד כשהצעת מחיר מאושרת (ייצוג, מכתב לרו״ח הקודם,
// פייפרלס…) ושאין להן שורה ברשימה שמעל. לא נערכות בספרייה — מה מהן נפתח, לאיזה
// סוג לקוח ובאיזה סדר מוגדר בפריט שבמסלול הקליטה, ולשם הקישור נוחת. מקופל: זה מידע משני.
// ‼ (4.10.2026) רק מה שנפתח בפועל מופיע כשורה; מה שלא במסלול הקליטה מקופל לשורה
// אחת בסוף, עם הקישור לשלב שנפתח מיד (רק שם אפשר להוסיף בקשת מערכת — AddSheet).
// בחיפוש — כל מה שמתאים, ומה שלא במסלול מסומן כך.
import { DELIVERY_LABELS, type Delivery } from '../../../../features/flows/types';
import { autoCountText, autoHintText, autoOffText } from './libraryModel';
import type { GoFn } from './usedIn';

export interface AutoRow {
  stepType: string;
  label: string;
  when: string;
  /** הפריט במסלול הקליטה (או «ייצוג מההצעה»). */
  focus: string | null;
  /** במסלול הקליטה — נפתחת. ייצוג נפתח תמיד מההצעה. */
  inFlow: boolean;
  /** «איך מגיע ללקוח» של השלב שבו הפריט יושב. */
  delivery: Delivery | null;
}

export default function AutoSection({ rows, total, inFlowTotal, searching, open, onToggle, go, highlight, known, delivery, addFocus }: {
  rows: AutoRow[];
  total: number;
  inFlowTotal: number;
  searching: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  go: GoFn;
  highlight?: string | null;
  /** המסלולים נטענו ויש מסלול קליטה — אפשר לומר מה נפתח ומה לא. */
  known: boolean;
  /** «איך מגיע ללקוח» של השלב שנפתח מיד במסלול הקליטה. */
  delivery: Delivery | null;
  /** השלב שנפתח מיד במסלול הקליטה — לשם מוסיפים בקשת מערכת. */
  addFocus: string;
}) {
  // נפתחות קודם — ובלי חיפוש רק הן; מה שלא במסלול נספר בשורה אחת בסוף.
  const opening = known ? rows.filter(r => r.inFlow) : rows;
  const off = known ? rows.filter(r => !r.inFlow) : [];
  const listed = searching ? [...opening, ...off] : opening;
  const folded = searching ? 0 : off.length;
  return (
    <details className="lb-auto" id="lb-auto" open={open} onToggle={e => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="lb-auto-sum">
        <span className="lb-auto-title">נפתחות אוטומטית בקליטה</span>
        <span className="lb-auto-count">
          {autoCountText({ shown: rows.length, total, inFlow: inFlowTotal, searching, known })}
        </span>
        <span className="lb-auto-hint">{autoHintText(known ? delivery : null)}</span>
      </summary>
      {listed.length === 0 && folded === 0 ? <p className="lb-empty">אין כאן בקשה שמתאימה לחיפוש.</p> : (
        <ul className="lb-auto-list">
          {listed.map(r => {
            const isOff = known && !r.inFlow;
            // שלב אחר במסלול שמגיע ללקוח אחרת — אומרים בשורה; הכותרת מתארת את השלב הראשון.
            const other = known && r.inFlow && r.delivery && r.delivery !== delivery ? DELIVERY_LABELS[r.delivery].short : null;
            return (
              <li key={r.stepType} id={`lb-auto-${r.stepType}`}
                className={[isOff ? 'is-off' : '', highlight === r.stepType ? 'is-focus' : ''].filter(Boolean).join(' ') || undefined}>
                <span className="lb-auto-main">
                  <span className="lb-auto-name">{r.label}</span>
                  <span className="lb-auto-when">
                    {isOff ? 'לא במסלול הקליטה — לא נפתחת' : other ? `${r.when} · ${other}` : r.when}
                  </span>
                </span>
                <button type="button" className="of-link lb-auto-link"
                  onClick={() => go('flows', isOff ? addFocus : (r.focus ?? 'onboarding'))}>
                  {isOff ? 'להוספה במסלול הקליטה ←' : 'איפה מגדירים ←'}
                </button>
              </li>
            );
          })}
          {folded > 0 && (
            <li className="is-off">
              <span className="lb-auto-main">
                <span className="lb-auto-when">{autoOffText(folded)}</span>
              </span>
              <button type="button" className="of-link lb-auto-link" onClick={() => go('flows', addFocus)}>להוספה ←</button>
            </li>
          )}
        </ul>
      )}
    </details>
  );
}

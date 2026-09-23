// ─── «האוטומציה נעצרה» — מה שהרו"ח רואה ─────────────────────────────────────
//
// ‼ רכיב נפרד ולא JSX בתוך הכפתור, משתי סיבות: הוא מוצג בכמה מקומות, והוא
// **הדבר היחיד שהרו"ח רואה** כשמשהו מול שע״ם לא הלך כשורה. לכן הוא גם
// ניתן להצגה ולבדיקה בפני עצמו, בלי מסד ובלי משימה אמיתית.
//
// ‼ מה שהוא לא עושה: לא מציג שגיאת Playwright, לא שם של selector, ולא
// «נסה שוב» כפעולה ראשית כשייתכן ששע״ם כבר עשתה משהו. הפירוט הטכני נשאר
// ב-error_detail וביומן העובד.

import type { ShaamStopState } from '../features/representation/shaamJobSafety';

interface Props {
  stop: ShaamStopState;
  /** ההסבר שהעובד כתב — משפט אנושי, לא שגיאה. */
  workerMessage?: string;
  className?: string;
  /** המשתמש ביקש לשקול ניסיון נוסף. */
  confirming: boolean;
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmRetry: () => void;
  busy?: boolean;
}

export default function ShaamStopNotice({
  stop, workerMessage, className, confirming, onAskConfirm, onCancelConfirm, onConfirmRetry, busy,
}: Props) {
  return (
    <div className={className} style={{ lineHeight: 1.7 }}>
      <div style={{ fontWeight: 600 }}>{stop.title}</div>
      <div>{stop.next}</div>
      {workerMessage && (
        <div style={{ color: 'var(--ink-3)', marginTop: '.2rem' }}>{workerMessage}</div>
      )}
      {/* ‼ המשפט הזה הוא הלב: הרו"ח צריך לדעת שייתכן שמשהו כן קרה בצד
          הרשות, ושאיש לא ינסה שוב בלעדיו. */}
      {stop.mayHaveActed && (
        <div style={{ color: 'var(--ink-3)', marginTop: '.2rem' }}>
          ייתכן שהפעולה כן התקבלה בשע״ם. המערכת לא תנסה שוב מעצמה.
        </div>
      )}

      {!stop.allowDirectRetry && !confirming && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.35rem' }}
          onClick={onAskConfirm}>
          בכל זאת לנסות שוב
        </button>
      )}
      {!stop.allowDirectRetry && confirming && (
        <div style={{ marginTop: '.35rem' }}>
          <div style={{ color: 'var(--ink-2)' }}>
            {stop.mayHaveActed
              ? 'ניסיון נוסף עלול ליצור כפילות בשע״ם. לאשר?'
              : 'לאשר ניסיון נוסף?'}
          </div>
          <div style={{ display: 'flex', gap: '.4rem', marginTop: '.25rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
              onClick={onConfirmRetry}>
              כן, נסה שוב
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelConfirm}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// עדכניות הנתונים — תג פר-כלי + לוח מרכזי בסקירה
// ─────────────────────────────────────────────────────────────────────────────
import {
  DATASETS, DatasetFreshness, fmtMonth, fmtNextCheck, isVerifiedThisQuarter,
} from '../../data/dataFreshness';

/** תג עדכניות קטן — מוצג מעל כל כלי במרכז הידע */
export function FreshnessBadge({ datasetId }: { datasetId: string }) {
  const ds = DATASETS.find(d => d.id === datasetId);
  if (!ds) return null;
  const fresh = isVerifiedThisQuarter(ds);
  return (
    /* עדכניות היא מטא-דאטה, לא סטטוס: כשהנתון טרי הוא טקסט שקט.
       הצבע נשמר למקרה היחיד שדורש פעולה — מאגר שפספס את הבדיקה הרבעונית. */
    <div className="tc-fresh">
      <span
        title={`מקורות: ${ds.officialSources.join(' · ')}`}
        className={fresh ? 'tc-fresh-ok' : 'tc-fresh-stale'}
      >
        {fresh ? '' : '⚠ '}הנתונים אומתו {fmtMonth(ds.lastVerified)}
        {fresh ? ` · בדיקה הבאה ${fmtNextCheck()}` : ' · ממתין לבדיקה הרבעונית'}
      </span>
    </div>
  );
}

/** לוח העדכניות המרכזי — מוצג בסקירה של מרכז הידע */
export function FreshnessPanel({ onCreateCheckTask, checkTaskExists }: {
  onCreateCheckTask: () => void;
  checkTaskExists: boolean;
}) {
  const allFresh = DATASETS.every(d => isVerifiedThisQuarter(d));
  return (
    <div className="tc-fresh-panel">
      <div className="tc-fresh-panel-head">
        <div>
          <span className="tc-fresh-panel-title">עדכניות הנתונים</span>
          <span className="tc-fresh-panel-sub">
            בדיקה רבעונית: ינואר · אפריל · יולי · אוקטובר
          </span>
        </div>
        <button
          onClick={onCreateCheckTask}
          disabled={checkTaskExists}
          className="btn btn-secondary btn-sm"
        >
          {checkTaskExists ? 'משימת הבדיקה הרבעונית קיימת' : '+ צור משימת בדיקה עכשיו'}
        </button>
      </div>

      <table className="tc-fresh-table">
        <tbody>
          {DATASETS.map((ds: DatasetFreshness) => {
            const fresh = isVerifiedThisQuarter(ds);
            return (
              <tr key={ds.id}>
                <td className="tc-fresh-name">{ds.icon} {ds.label}</td>
                <td className="tc-fresh-covers">{ds.covers}</td>
                <td className={`tc-fresh-when ${fresh ? '' : 'is-stale'}`}>
                  {fresh ? '' : '⚠ '}{fmtMonth(ds.lastVerified)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="tc-fresh-note">
        {allFresh
          ? `כל המאגרים אומתו ברבעון הנוכחי מול מקורות רשמיים. הבדיקה הבאה: ${fmtNextCheck()} — המערכת תיצור אז משימת בדיקה אוטומטית.`
          : 'יש מאגרים שממתינים לבדיקה הרבעונית — משימת הבדיקה ממתינה במשימות.'}
        {' '}שום נתון לא מתעדכן ללא דוח שינויים (ערך קודם ← חדש + מקור) ואישור מפורש שלך.
      </div>
    </div>
  );
}

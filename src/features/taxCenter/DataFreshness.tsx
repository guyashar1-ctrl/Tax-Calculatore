// ─────────────────────────────────────────────────────────────────────────────
// עדכניות הנתונים — תג פר-כלי + לוח רבעוני בעמוד «עדכניות ותחזוקה»
// ‼ 10.10.2026: אין יותר «הנתונים אומתו» למאגר שלם. מאגר שעבר למרשם הכללים
// מציג ביסוס לכל כלל; מאגר ישן מציג מתי נבדק כמאגר — ובמפורש «לא לכל ערך».
// ─────────────────────────────────────────────────────────────────────────────
import {
  DATASETS, DatasetFreshness, fmtMonth, fmtNextCheck, isVerifiedThisQuarter,
} from '../../data/dataFreshness';

/** תג עדכניות קטן — מוצג ליד כל כלי במרכז הידע */
export function FreshnessBadge({ datasetId }: { datasetId: string }) {
  const ds = DATASETS.find(d => d.id === datasetId);
  if (!ds) return null;
  if (ds.id === 'taxRules') {
    return <div className="tc-fresh"><span className="tc-fresh-ok">ביסוס לכל כלל ולכל שנה · סבב אחרון {fmtMonth(ds.lastVerified)}</span></div>;
  }
  const fresh = isVerifiedThisQuarter(ds);
  return (
    /* עדכניות היא מטא-דאטה, לא סטטוס: כשהבדיקה בזמן היא טקסט שקט.
       הצבע נשמר למקרה שדורש פעולה — מאגר שפספס את הבדיקה הרבעונית. */
    <div className="tc-fresh">
      <span title={`מקורות: ${ds.officialSources.join(' · ')}`} className={fresh ? 'tc-fresh-ok' : 'tc-fresh-stale'}>
        {fresh ? '' : '⚠ '}נבדק כמאגר {fmtMonth(ds.lastVerified)} · לא לכל ערך
        {fresh ? ` · בדיקה הבאה ${fmtNextCheck()}` : ' · ממתין לבדיקה הרבעונית'}
      </span>
    </div>
  );
}

/** הלוח הרבעוני — בעמוד «עדכניות ותחזוקה» */
export function FreshnessPanel({ onCreateCheckTask, checkTaskExists }: {
  onCreateCheckTask: () => void;
  checkTaskExists: boolean;
}) {
  return (
    <div className="tc-fresh-panel">
      <div className="tc-fresh-panel-head">
        <div>
          <span className="tc-fresh-panel-title">מאגרים ובדיקה רבעונית</span>
          <span className="tc-fresh-panel-sub">ינואר · אפריל · יולי · אוקטובר</span>
        </div>
        <button onClick={onCreateCheckTask} disabled={checkTaskExists} className="btn btn-secondary btn-sm">
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
                <td className={`tc-fresh-when ${fresh ? '' : 'is-stale'}`}>{fresh ? '' : '⚠ '}{fmtMonth(ds.lastVerified)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="tc-fresh-note">
        התאריך הוא מתי המאגר נבדק לאחרונה — לא שכל ערך בו אומת. מה שנבדק בפועל מפורט ב«בדיקת הכיסוי» למעלה.
        {' '}שום נתון לא מתעדכן בלי דוח שינויים (ערך קודם ← חדש + מקור) ואישור מפורש שלך.
      </div>
    </div>
  );
}

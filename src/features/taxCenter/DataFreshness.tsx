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
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}>
      <span
        title={`מקורות: ${ds.officialSources.join(' · ')}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '.35rem',
          padding: '.2rem .65rem', borderRadius: 999, fontSize: '.72rem', fontWeight: 600,
          background: fresh ? 'var(--chip-green-bg)' : 'var(--chip-yellow-bg)',
          color: fresh ? 'var(--chip-green-tx)' : 'var(--warn)',
          border: `1px solid ${fresh ? 'var(--chip-green-bd)' : 'var(--chip-amber-bd)'}`,
        }}
      >
        {fresh ? '✓' : '⚠'} הנתונים אומתו {fmtMonth(ds.lastVerified)}
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
    <div style={{ background: 'var(--card)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '1rem 1.15rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
        <div>
          <span style={{ fontWeight: 700 }}>🔄 עדכניות הנתונים</span>
          <span style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginRight: '.5rem' }}>
            בדיקה רבעונית: ינואר · אפריל · יולי · אוקטובר
          </span>
        </div>
        <button
          onClick={onCreateCheckTask}
          disabled={checkTaskExists}
          style={{
            padding: '.35rem .8rem', borderRadius: 8, fontFamily: 'inherit', fontSize: '.8rem', fontWeight: 600,
            border: '1px solid var(--gray-300)', cursor: checkTaskExists ? 'default' : 'pointer',
            background: checkTaskExists ? 'var(--gray-100)' : 'var(--card)',
            color: checkTaskExists ? 'var(--gray-400)' : 'var(--blue)',
          }}
        >
          {checkTaskExists ? '✓ משימת הבדיקה הרבעונית קיימת' : '+ צור משימת בדיקה עכשיו'}
        </button>
      </div>

      <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
        <tbody>
          {DATASETS.map((ds: DatasetFreshness) => {
            const fresh = isVerifiedThisQuarter(ds);
            return (
              <tr key={ds.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                <td style={{ padding: '.4rem .3rem', whiteSpace: 'nowrap' }}>{ds.icon} <b>{ds.label}</b></td>
                <td style={{ padding: '.4rem .3rem', color: 'var(--gray-500)', fontSize: '.76rem' }}>{ds.covers}</td>
                <td style={{ padding: '.4rem .3rem', whiteSpace: 'nowrap', textAlign: 'left' }}>
                  <span style={{ color: fresh ? 'var(--chip-green-tx)' : 'var(--warn)', fontWeight: 600 }}>
                    {fresh ? '✓' : '⚠'} {fmtMonth(ds.lastVerified)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontSize: '.74rem', color: 'var(--gray-500)', marginTop: '.55rem', lineHeight: 1.55 }}>
        {allFresh
          ? `כל המאגרים אומתו ברבעון הנוכחי מול מקורות רשמיים. הבדיקה הבאה: ${fmtNextCheck()} — המערכת תיצור אז משימת בדיקה אוטומטית.`
          : 'יש מאגרים שממתינים לבדיקה הרבעונית — משימת הבדיקה ממתינה במשימות.'}
        {' '}שום נתון לא מתעדכן ללא דוח שינויים (ערך קודם ← חדש + מקור) ואישור מפורש שלך.
      </div>
    </div>
  );
}

// ─── טאב "פרופיל מס" — תמונת הפרופיל הקבוע של הלקוח ─────────────────────────
// "הפרופיל הוא המוצר": מה שידוע על הלקוח לשנים, מאיפה זה ידוע, ואילו
// מסמכים נדרשים ממנו כל שנה. הנתונים עצמם נערכים בטאבים הייעודיים
// ומתעדכנים אוטומטית מהשאלונים (קליטה / סקירה שנתית).

import type { Client } from '../../types';
import { buildProfileBlocks, deriveRecurringDocs, provenanceLabel } from '../../features/annualReport/profile';

interface Props {
  client: Client;
}

export default function TaxProfileTab({ client }: Props) {
  const blocks = buildProfileBlocks(client);
  const docs = deriveRecurringDocs(client);

  return (
    <div className="cw-tab">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {blocks.map((b) => (
          <div key={b.key} className="cw-section" style={{ margin: 0 }}>
            <div className="cw-section-head">{b.icon} {b.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {b.rows.map((row, i) => {
                  const prov = provenanceLabel(client, row.metaKey);
                  return (
                    <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '.45rem .2rem', color: 'var(--gray-500)', fontSize: '.85rem', width: '38%', verticalAlign: 'top' }}>
                        {row.label}
                      </td>
                      <td style={{ padding: '.45rem .2rem', fontSize: '.9rem', fontWeight: 600 }}>
                        {row.missing ? (
                          <span style={{ color: 'var(--orange, #d97706)', fontWeight: 500 }}>⚠ {row.value}</span>
                        ) : row.value}
                        {prov && (
                          <span style={{
                            display: 'inline-block', marginRight: 6, fontSize: '.66rem', fontWeight: 700,
                            background: 'var(--blue-light, #dbeafe)', color: 'var(--blue)',
                            borderRadius: 99, padding: '.02rem .5rem', verticalAlign: 'middle',
                          }}>
                            {prov}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* ── מסמכים קבועים ── */}
        <div className="cw-section" style={{ margin: 0 }}>
          <div className="cw-section-head">📎 מסמכים קבועים — נדרש כל שנה ({docs.length})</div>
          {docs.length === 0 ? (
            <div style={{ fontSize: '.85rem', color: 'var(--gray-500)', padding: '.4rem .2rem' }}>
              הרשימה תיבנה אוטומטית ככל שהפרופיל יתמלא (מעסיקים, חשבונות, נכסים...).
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={d.code} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '.4rem .2rem', fontSize: '.87rem' }}>{d.name}</td>
                    <td style={{ padding: '.4rem .2rem', fontSize: '.75rem', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{d.from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: '.5rem', borderTop: '1px dashed var(--gray-200)', paddingTop: '.5rem' }}>
            💡 הרשימה נגזרת אוטומטית מהפרופיל ומזינה את בקשת המסמכים של כל תיק שנה.
          </div>
        </div>
      </div>

      <div style={{
        marginTop: '1rem', padding: '.7rem 1rem', borderRadius: 8, fontSize: '.83rem',
        background: 'var(--gray-50)', border: '1px solid var(--gray-200)', color: 'var(--gray-600)',
      }}>
        🔄 הפרופיל מתעדכן אוטומטית מהשאלונים (קליטה וסקירה שנתית) ומעריכה בטאבים הייעודיים.
        עובדות עם תגית מקור — יודעים מתי ומאיפה הן הגיעו.
      </div>
    </div>
  );
}

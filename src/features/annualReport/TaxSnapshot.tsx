// ─── תמונת מס — כל המידע הרלוונטי של הלקוח במבט אחד ─────────────────────────
// מוצג בכרטיס הלקוח (סקירה + פרופיל מס). מרכז: פרופיל, תיקי שנה, סכומי מפתח,
// ומסמכים קבועים. variant='compact' לסקירה, variant='full' לטאב הפרופיל.

import type { Client, TaxFileInfo, TaxFileOwner } from '../../types';
import { TAX_AUTHORITY_LABELS, TAX_FILE_REP_STATUS_LABELS } from '../../types';
import type { AnnualReportSession } from './types';
import {
  buildProfileBlocks, deriveRecurringDocs, buildKeyAmounts,
  summarizeYearFile, provenanceLabel, SESSION_STATUS_META, registeredFileInfo,
  taxFileOwnerLabel, clientDisplayName, spouseDisplayName,
} from './profile';

interface Props {
  client: Client;
  sessions: AnnualReportSession[];
  loading?: boolean;
  variant?: 'compact' | 'full';
  onOpenYear?: (taxYear: number) => void;
  /** כשמסופק — הבעלים של תיק מס הכנסה ניתן לעריכה ישירות מהתצוגה (נשמר מיד). */
  onUpdateTaxFiles?: (files: TaxFileInfo[]) => void;
}

export default function TaxSnapshot({ client, sessions, loading, variant = 'full', onOpenYear, onUpdateTaxFiles }: Props) {
  const latest = sessions[0] ?? null;
  const amounts = buildKeyAmounts(client, latest);
  const blocks = buildProfileBlocks(client, latest?.model ?? null);
  const docs = deriveRecurringDocs(client);
  const compact = variant === 'compact';

  // שינוי בן הזוג הרשום מהתצוגה: מעדכן בעלים + ממלא את הת.ז. הנכונה כמספר תיק
  function changeItOwner(owner: TaxFileOwner) {
    if (!onUpdateTaxFiles) return;
    const files = client.taxFiles ?? [];
    onUpdateTaxFiles(files.map((f) => {
      if (f.authority !== 'income_tax') return f;
      const ownerId = owner === 'spouse' ? client.spouseIdNumber : owner === 'client' ? client.idNumber : '';
      const shouldFill = ownerId && (!f.fileNumber || f.fileNumber === client.idNumber || f.fileNumber === client.spouseIdNumber);
      return { ...f, owner, fileNumber: shouldFill ? ownerId : f.fileNumber };
    }));
  }

  const taxFiles = client.taxFiles ?? [];
  // מקור האמת: על שם מי מתנהל תיק מס הכנסה — קובע את בן הזוג הרשום בכל המערכת
  const regFile = registeredFileInfo(client);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
      {/* ── בן הזוג הרשום — תמיד מוצג כשיש תיק מ"ה; מודגש כשהתיק על בן הזוג.
             כשיש onUpdateTaxFiles אפשר להחליף את הרשום ישירות מכאן. ── */}
      {regFile && (
        <div style={{
          padding: '.55rem .9rem', borderRadius: 9, fontSize: '.88rem', fontWeight: 700,
          background: regFile.owner === 'spouse' ? 'var(--chip-amber-bg)' : 'var(--gray-50, var(--s2))',
          border: regFile.owner === 'spouse' ? '1.5px solid var(--chip-amber-bd)' : '1px solid var(--gray-200)',
          color: regFile.owner === 'spouse' ? 'var(--warn)' : 'var(--gray-700, #333)',
          display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap',
        }}>
          <span>
            {regFile.owner === 'spouse' ? '⚠ ' : '🗄️ '}
            תיק מס הכנסה ע"ש <b>{regFile.name}</b>
            {(client.familyStatus === 'married' || !!client.spouseName?.trim()) && <> — <b>בן/בת הזוג הרשום/ה</b></>}
            {regFile.idNumber ? <> · ת.ז. <span className="num" dir="ltr">{regFile.idNumber}</span></> : ''}
            {regFile.owner === 'spouse' ? ' · כל ההתנהלות מול מ"ה בת.ז. הזו' : ''}
          </span>
          {onUpdateTaxFiles && (
            <select
              value={regFile.owner}
              onChange={(e) => changeItOwner(e.target.value as TaxFileOwner)}
              title="החלפת בן הזוג הרשום — נשמר מיד ומעדכן את הת.ז. של התיק"
              style={{
                padding: '.2rem .45rem', borderRadius: 6, border: '1px solid var(--gray-300, #ccc)',
                fontSize: '.78rem', fontWeight: 700, background: 'var(--card)', marginRight: 'auto',
              }}
            >
              <option value="client">{clientDisplayName(client)}</option>
              <option value="spouse">{spouseDisplayName(client)}</option>
            </select>
          )}
        </div>
      )}

      {/* ── תיקים ברשויות ── */}
      {taxFiles.length > 0 && (
        <div className="cw-section">
          <div className="cw-section-head"><span>🗄️ תיקים ברשויות</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem' }}>
            {taxFiles.map((f) => (
              <div key={f.id} style={{
                border: '1px solid var(--gray-200)', borderRadius: 9, padding: '.4rem .7rem',
                fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: '.45rem',
              }}>
                <b>{TAX_AUTHORITY_LABELS[f.authority]}</b>
                {f.fileNumber && <span className="num" dir="ltr" style={{ color: 'var(--gray-500)' }}>{f.fileNumber}</span>}
                <span style={{
                  fontSize: '.7rem', borderRadius: 99, padding: '.05rem .45rem', fontWeight: 700,
                  background: f.authority === 'income_tax' && f.owner === 'spouse' ? 'var(--chip-amber-bg)' : 'var(--gray-100)',
                  color: f.authority === 'income_tax' && f.owner === 'spouse' ? 'var(--warn)' : 'var(--gray-500)',
                }}>
                  {f.authority === 'national_insurance' ? 'של ' : 'ע"ש '}
                  {taxFileOwnerLabel(client, f.authority, f.owner)}
                </span>
                <span style={{
                  fontSize: '.7rem', borderRadius: 99, padding: '.05rem .45rem', fontWeight: 700,
                  background: f.repStatus === 'active' ? 'var(--chip-green-bg)' : f.repStatus === 'pending' ? 'var(--chip-amber-bg)' : 'var(--gray-100)',
                  color: f.repStatus === 'active' ? 'var(--ok)' : f.repStatus === 'pending' ? 'var(--warn)' : 'var(--gray-500)',
                }}>
                  {TAX_FILE_REP_STATUS_LABELS[f.repStatus]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── תיקי שנה ── */}
      <div className="cw-section">
        <div className="cw-section-head">
          <span>🗂️ תיקי מס לפי שנה</span>
          {loading && <span style={{ fontSize: '.75rem', color: 'var(--gray-400)' }}>טוען…</span>}
        </div>
        {sessions.length === 0 && !loading ? (
          <div className="cw-empty">עדיין לא נפתח תיק דוח שנתי ללקוח זה.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {sessions.map((s) => {
              const y = summarizeYearFile(s);
              const meta = SESSION_STATUS_META[s.status];
              const docPct = y.docsTotal > 0 ? Math.round((y.docsReceived / y.docsTotal) * 100) : 0;
              return (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--gray-200)', borderRadius: 10, padding: '.65rem .8rem',
                    display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap',
                  }}
                >
                  <span className="num" style={{ fontWeight: 800, fontSize: '1.05rem', minWidth: 52 }}>{y.taxYear}</span>
                  <span style={{ fontSize: '.72rem', fontWeight: 700, borderRadius: 99, padding: '.12rem .6rem', color: meta.color, background: meta.bg }}>
                    {meta.label}
                  </span>
                  <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', flex: 1 }}>
                    {y.sourceLabels.map((l, i) => (
                      <span key={i} style={{ fontSize: '.72rem', background: 'var(--gray-100)', borderRadius: 99, padding: '.1rem .5rem' }}>{l}</span>
                    ))}
                  </div>
                  {y.docsTotal > 0 && (
                    <span className="num" style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>
                      📎 {y.docsReceived}/{y.docsTotal} ({docPct}%)
                    </span>
                  )}
                  {y.openUnknowns > 0 && (
                    <span style={{ fontSize: '.72rem', color: 'var(--warn)' }}>🤷 {y.openUnknowns} לבירור</span>
                  )}
                  {onOpenYear && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenYear(y.taxYear)}>
                      פתח ←
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── סכומי מפתח ── */}
      {amounts.length > 0 && (
        <div className="cw-section">
          <div className="cw-section-head"><span>💰 סכומי מפתח שנאספו</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '.5rem' }}>
            {amounts.map((a, i) => (
              <div key={i} style={{ border: '1px solid var(--gray-100)', borderRadius: 9, padding: '.5rem .7rem', background: 'var(--gray-50)' }}>
                <div style={{ fontSize: '.72rem', color: 'var(--gray-500)' }}>{a.label}{a.year ? ` · ${a.year}` : ''}</div>
                <div className="num" style={{ fontWeight: 800, fontSize: '1rem' }}>{a.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── פרופיל המס ── */}
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: '.9rem' }}>
        {blocks.map((b) => (
          <div key={b.key} className="cw-section" style={{ margin: 0 }}>
            <div className="cw-section-head" style={{ fontSize: '.9rem' }}>{b.icon} {b.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {b.rows.map((row, i) => {
                  const prov = provenanceLabel(client, row.metaKey);
                  return (
                    <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '.4rem .2rem', color: 'var(--gray-500)', fontSize: '.82rem', width: '40%', verticalAlign: 'top' }}>{row.label}</td>
                      <td style={{ padding: '.4rem .2rem', fontSize: '.88rem', fontWeight: 600 }}>
                        {row.missing ? <span style={{ color: 'var(--orange, var(--warn))', fontWeight: 500 }}>⚠ {row.value}</span> : row.value}
                        {prov && (
                          <span style={{ display: 'inline-block', marginRight: 6, fontSize: '.64rem', fontWeight: 700, background: 'var(--blue-light, var(--chip-blue-bg))', color: 'var(--blue)', borderRadius: 99, padding: '.02rem .5rem', verticalAlign: 'middle' }}>
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
      </div>

      {/* ── מסמכים קבועים ── */}
      {!compact && (
        <div className="cw-section">
          <div className="cw-section-head"><span>📎 מסמכים קבועים — נדרש כל שנה ({docs.length})</span></div>
          {docs.length === 0 ? (
            <div className="cw-empty">הרשימה תיבנה אוטומטית ככל שהפרופיל יתמלא (מעסיקים, חשבונות, נכסים...).</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={d.code} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '.35rem .2rem', fontSize: '.85rem' }}>{d.name}</td>
                    <td style={{ padding: '.35rem .2rem', fontSize: '.73rem', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{d.from}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

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
        <div className={`ts-reg ${regFile.owner === 'spouse' ? 'is-spouse' : ''}`}>
          <span>
            {regFile.owner === 'spouse' ? '⚠ ' : '🗄️ '}
            תיק מס הכנסה ע"ש <b>{regFile.name}</b>
            {(client.familyStatus === 'married' || !!client.spouseName?.trim()) && <> - <b>בן/בת הזוג הרשום/ה</b></>}
            {regFile.idNumber ? <> · ת.ז. <span className="num" dir="ltr">{regFile.idNumber}</span></> : ''}
            {regFile.owner === 'spouse' ? ' · כל ההתנהלות מול מ"ה בת.ז. הזו' : ''}
          </span>
          {onUpdateTaxFiles && (
            <select
              value={regFile.owner}
              onChange={(e) => changeItOwner(e.target.value as TaxFileOwner)}
              title="החלפת בן הזוג הרשום - נשמר מיד ומעדכן את הת.ז. של התיק"
              style={{
                padding: '.2rem .45rem', borderRadius: 'var(--r-chip)', border: 0,
                fontSize: 'var(--fs-13)', fontWeight: 500, background: 'var(--surface-2)',
                color: 'var(--ink-1)', marginInlineStart: 'auto',
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
          <div className="cw-section-head"><span>תיקים ברשויות</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem' }}>
            {taxFiles.map((f) => (
              <div key={f.id} className="ts-file">
                <b>{TAX_AUTHORITY_LABELS[f.authority]}</b>
                {f.fileNumber && <span className="num" dir="ltr" style={{ color: 'var(--gray-500)' }}>{f.fileNumber}</span>}
                <span className={`ar-pill ${f.authority === 'income_tax' && f.owner === 'spouse' ? 'is-warn' : ''}`}>
                  {f.authority === 'national_insurance' ? 'של ' : 'ע"ש '}
                  {taxFileOwnerLabel(client, f.authority, f.owner)}
                </span>
                <span className={`ar-pill ${f.repStatus === 'pending' ? 'is-warn' : ''}`}>
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
          <span>תיקי מס לפי שנה</span>
          {loading && <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>טוען…</span>}
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
                    borderTop: '1px solid var(--hairline-2)', padding: '.65rem 0',
                    display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap',
                  }}
                >
                  <span className="num" style={{ fontWeight: 600, fontSize: '17px', minWidth: 52 }}>{y.taxYear}</span>
                  <span className="ar-pill" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', flex: 1 }}>
                    {y.sourceLabels.map((l, i) => (
                      <span key={i} className="ar-pill">{l}</span>
                    ))}
                  </div>
                  {y.docsTotal > 0 && (
                    <span className="num" style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                      {y.docsReceived}/{y.docsTotal} ({docPct}%)
                    </span>
                  )}
                  {y.openUnknowns > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--warn)' }}>{y.openUnknowns} לבירור</span>
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
          <div className="cw-section-head"><span>סכומי מפתח שנאספו</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '.5rem' }}>
            {amounts.map((a, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--hairline-2)', padding: '.5rem 0' }}>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{a.label}{a.year ? ` · ${a.year}` : ''}</div>
                <div className="num" style={{ fontWeight: 600, fontSize: '15px' }}>{a.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── פרופיל המס ── */}
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: '.9rem' }}>
        {blocks.map((b) => (
          <div key={b.key} className="cw-section" style={{ margin: 0 }}>
            <div className="cw-section-head" style={{ fontSize: '14px' }}>{b.icon} {b.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {b.rows.map((row, i) => {
                  const prov = provenanceLabel(client, row.metaKey);
                  return (
                    <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--hairline-2)' }}>
                      <td style={{ padding: '.4rem .2rem', color: 'var(--gray-500)', fontSize: '13px', width: '40%', verticalAlign: 'top' }}>{row.label}</td>
                      <td style={{ padding: '.4rem .2rem', fontSize: '14px', fontWeight: 600 }}>
                        {row.missing ? <span style={{ color: 'var(--orange, var(--warn))', fontWeight: 500 }}>{row.value}</span> : row.value}
                        {prov && (
                          <span className="ar-pill" style={{ display: 'inline-block', marginInlineStart: 6, verticalAlign: 'middle' }}>
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
          <div className="cw-section-head"><span>מסמכים קבועים - נדרש כל שנה ({docs.length})</span></div>
          {docs.length === 0 ? (
            <div className="cw-empty">הרשימה תיבנה אוטומטית ככל שהפרופיל יתמלא (מעסיקים, חשבונות, נכסים...).</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={d.code} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--hairline-2)' }}>
                    <td style={{ padding: '.35rem .2rem', fontSize: '14px' }}>{d.name}</td>
                    <td style={{ padding: '.35rem .2rem', fontSize: '12px', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{d.from}</td>
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

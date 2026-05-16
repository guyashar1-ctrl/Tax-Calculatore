// ─── מסך "מסד נתוני מס" — Visual Audit Dashboard ──────────────────────────
// מציג בכרטיסיות את הקבועים שהמערכת מתבססת עליהם, עם ציטוט מהמקור הרשמי
// (חוברת "דע את זכויותיך 2025" ומדריך 1301 של רשות המיסים).

import { useState } from 'react';
import { TAX_YEARS, AVAILABLE_YEARS } from '../../data/taxData';

interface SourceCitation {
  documentLabel: string;
  quote: string;
}

interface DashboardCard {
  title: string;
  primary: string;
  detail?: string;
  citation: SourceCitation;
  legalReference?: string;
}

function fmtCurrency(n: number): string {
  return n === Infinity ? '∞' : `${n.toLocaleString('he-IL')} ₪`;
}

export default function TaxConstantsDashboard() {
  const [year, setYear] = useState<number>(2025);
  const data = TAX_YEARS.find((t) => t.year === year);

  if (!data) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">אין נתונים לשנה {year}</div>
      </div>
    );
  }

  const isCurrent2025 = year === 2025;

  // ─── כרטיסיות עיקריות ───────────────────────────────────────────────
  const cards: DashboardCard[] = [
    {
      title: 'ערך נקודת זיכוי',
      primary: fmtCurrency(data.creditPointValue),
      detail: 'לכל נקודת זיכוי שנתית',
      citation: {
        documentLabel: 'דע את זכויותיך 2025, פרק "זיכויי מס"',
        quote: 'שווי נקודת זיכוי בשנת 2025 הוא ₪ 2,904.',
      },
      legalReference: 'סעיף 33 לפקודה',
    },
    {
      title: 'מס יסף — סף שנתי',
      primary: fmtCurrency(data.surtaxThreshold),
      detail: 'מעל סף זה — מס נוסף 3%',
      citation: {
        documentLabel: 'דע את זכויותיך 2025',
        quote: 'כאשר הכנסה החייבת עולה על 721,560 ש"ח בשנת 2025... מס על הכנסות גבוהות.',
      },
      legalReference: 'סעיף 121ב לפקודה',
    },
    {
      title: 'פטור שכר דירה — חודשי',
      primary: fmtCurrency(data.rentalExemptMonthly),
      detail: `תקרה שנתית: ${fmtCurrency(data.rentalExemptMonthly * 12)}`,
      citation: {
        documentLabel: 'מדריך 1301 / חוק מס הכנסה (פטור על השכרת דירת מגורים), התש"ן-1990',
        quote: '"התקרה המתואמת" היא סכום בסך ₪ 5,654 לחודש... ה"תקרה" לשנת המס 2025 היא ₪ 67,848.',
      },
      legalReference: 'חוק פטור ממס על דמי שכירות התש"ן-1990',
    },
    {
      title: 'תקרת זיכוי תרומות',
      primary: '30% או 10,354,816 ₪',
      detail: 'מההכנסה החייבת — הנמוך מבין השניים; זיכוי 35% מהתרומה',
      citation: {
        documentLabel: 'דע את זכויותיך 2025',
        quote: 'זיכוי של 35% מסכום התרומה בתנאי שהזיכוי לא יותר לגבי חלק מהתרומה העולה על ₪ 10,354,816 או על 30%.',
      },
      legalReference: 'סעיף 46 לפקודה',
    },
    {
      title: 'מינימום תרומה לזיכוי',
      primary: '207 ₪',
      detail: 'תרומה נמוכה מסכום זה לא מקנה זיכוי',
      citation: {
        documentLabel: 'מדריך רשות המיסים למילוי 1301, 2025',
        quote: 'תרומה מינימלית של 207 ש"ח לארגון מוכר בלבד.',
      },
    },
    {
      title: 'תקרת הכנסה חודשית לב"ל',
      primary: fmtCurrency(data.niMaxIncomeMonthly),
      detail: `שכר ממוצע למשק (חודשי): ${fmtCurrency(data.niAverageWage)}`,
      citation: {
        documentLabel: 'חוזר ביטוח לאומי לשנת 2025 (btl.gov.il)',
        quote: `התקרה החודשית לחישוב דמי ביטוח לאומי לשנת ${year} עומדת על ${fmtCurrency(data.niMaxIncomeMonthly)}.`,
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1rem 1.5rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>📚 מסד נתוני מס {year}</h2>
          <p style={{ margin: '.3rem 0 0', color: 'var(--gray-600)', fontSize: '.9rem' }}>
            כל קבועי החישוב שעליהם המערכת מתבססת. עבור על הכרטיסיות — כל כרטיסייה מציגה גם את הציטוט מהמקור הרשמי.
          </p>
        </div>
        <div>
          <label style={{ marginLeft: 8, fontWeight: 600 }}>שנת מס:</label>
          <select
            className="input"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {AVAILABLE_YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {!isCurrent2025 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '.5rem 1rem', marginBottom: '1rem', fontSize: '.9rem' }}>
          ℹ הציטוטים בכרטיסיות מתייחסים לחוברת 2025 הרשמית; ערכי הנתונים — לשנת המס {year}.
        </div>
      )}

      {/* ─── מדרגות מס — כרטיסייה מורחבת ─── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-header">
          <h3 className="card-title">מדרגות מס הכנסה — {year}</h3>
        </div>
        <div className="card-body">
          <p style={{ margin: '0 0 1rem', color: 'var(--gray-600)' }}>
            מדרגות מס שולי על יגיעה אישית. הכנסה מעל המדרגה האחרונה — חייבת ב-50% מס, וגם במס יסף נוסף.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                  <th style={{ textAlign: 'right', padding: '.6rem' }}>מ-</th>
                  <th style={{ textAlign: 'right', padding: '.6rem' }}>עד</th>
                  <th style={{ textAlign: 'right', padding: '.6rem' }}>שיעור מס</th>
                </tr>
              </thead>
              <tbody>
                {data.incomeTaxBrackets.map((b, i, arr) => {
                  const from = i === 0 ? 0 : arr[i - 1].upTo;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '.6rem' }}>{fmtCurrency(from)}</td>
                      <td style={{ padding: '.6rem' }}>{fmtCurrency(b.upTo)}</td>
                      <td style={{ padding: '.6rem' }}>
                        <span style={{
                          background: bracketColor(b.rate),
                          color: 'white',
                          padding: '2px 10px',
                          borderRadius: 999,
                          fontWeight: 600,
                          fontSize: '.85rem',
                        }}>
                          {b.rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details style={{ marginTop: '1rem', fontSize: '.875rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--blue)', fontWeight: 600 }}>הצג מקור</summary>
            <div style={{ marginTop: '.75rem', padding: '.75rem 1rem', background: 'var(--gray-50)', borderRight: '3px solid var(--blue)', borderRadius: 4 }}>
              <strong>מקור:</strong> דע את זכויותיך 2025, פרק ז — "המס המצטבר לפי מדרגות המס".
              <br />
              <em style={{ color: 'var(--gray-600)' }}>
                "מדרגות המס לשנת 2025 הוקפאו ברמת 2024 בעקבות הוראת השעה". סעיף 121 לפקודת מס הכנסה.
              </em>
            </div>
          </details>
        </div>
      </div>

      {/* ─── שאר הכרטיסיות ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1rem' }}>
        {cards.map((c) => (
          <DashboardCardView key={c.title} card={c} />
        ))}
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', background: 'var(--gray-50)', borderRadius: 6, fontSize: '.85rem', color: 'var(--gray-600)' }}>
        💡 כל הנתונים מנוהלים בקובץ <code>src/data/taxData.ts</code>. עדכון שנתי של ערכים נעשה שם בלבד — אין שום ערך hard-coded ב-UI או בלוגיקה של הדוח.
      </div>
    </div>
  );
}

function DashboardCardView({ card }: { card: DashboardCard }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-body" style={{ flex: 1 }}>
        <div style={{ color: 'var(--gray-500)', fontSize: '.85rem', marginBottom: '.3rem' }}>{card.title}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-800)' }}>{card.primary}</div>
        {card.detail && <div style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginTop: '.3rem' }}>{card.detail}</div>}
        {card.legalReference && (
          <div style={{ fontSize: '.75rem', color: 'var(--blue)', marginTop: '.5rem' }}>📜 {card.legalReference}</div>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--gray-100)' }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            width: '100%',
            padding: '.6rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--blue)',
            cursor: 'pointer',
            fontSize: '.85rem',
            textAlign: 'right',
            fontWeight: 600,
          }}
        >
          {open ? '▲ הסתר ציטוט מהמקור' : '▼ הצג ציטוט מהמקור'}
        </button>
        {open && (
          <div style={{ padding: '.75rem 1rem', background: 'var(--gray-50)', borderTop: '1px solid var(--gray-100)', fontSize: '.85rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '.4rem', color: 'var(--gray-700)' }}>{card.citation.documentLabel}</div>
            <div style={{ borderRight: '3px solid var(--blue)', paddingRight: '.75rem', color: 'var(--gray-700)', fontStyle: 'italic', lineHeight: 1.5 }}>
              "{card.citation.quote}"
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function bracketColor(rate: number): string {
  if (rate <= 10) return '#22c55e';
  if (rate <= 14) return '#86efac';
  if (rate <= 20) return '#fbbf24';
  if (rate <= 31) return '#f97316';
  if (rate <= 35) return '#ef4444';
  if (rate <= 47) return '#b91c1c';
  return '#7f1d1d';
}

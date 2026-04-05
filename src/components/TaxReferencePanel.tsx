import { useState } from 'react';
import { TAX_YEARS, AVAILABLE_YEARS } from '../data/taxData';
import { SETTLEMENTS, SETTLEMENTS_SORTED } from '../data/settlements';
import type { SettlementRegion } from '../data/settlements';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';

const fmt = (n: number) =>
  n === Infinity ? '∞' : '₪' + n.toLocaleString('he-IL');

const REGION_LABELS: Record<SettlementRegion, string> = {
  negev: 'נגב',
  arava: 'ערבה',
  galilee: 'גליל',
  golan: 'גולן',
  'north-border': 'גבול צפון',
  'jordan-valley': 'בקעת הירדן',
};

const BRACKET_COLORS = ['#22c55e', '#86efac', '#fbbf24', '#f97316', '#ef4444', '#b91c1c', '#7f1d1d'];

const CREDIT_POINTS: Array<{
  section: string;
  description: string;
  points: string | number;
  eligibility: string;
}> = [
  // בסיס
  { section: '34', description: 'נקודות בסיס — תושב ישראל', points: 2.25, eligibility: 'כל תושב ישראל' },
  { section: '36', description: 'נקודות אישה', points: 0.5, eligibility: 'אישה תושבת ישראל (בנוסף לנקודות הבסיס)' },
  // ילדים
  { section: '40(ב)', description: 'ילד שנולד בשנת המס', points: 1.5, eligibility: 'שנת לידה בלבד' },
  { section: '40(ב)', description: 'ילד עד גיל 5', points: 2.5, eligibility: 'ילד בן 1–5 בשנת המס' },
  { section: '40(ב)', description: 'ילד בגיל 6–12', points: 2, eligibility: 'ילד בן 6–12 בשנת המס' },
  { section: '40(ב)', description: 'ילד בגיל 13–17', points: 1, eligibility: 'ילד בן 13–17 בשנת המס' },
  { section: '40(ב)', description: 'ילד בגיל 18 (בשנת 18)', points: 1, eligibility: 'ילד שמלאו לו 18 בשנת המס' },
  { section: '44', description: 'הורה יחיד', points: 1, eligibility: 'הורה לילד עד גיל 18 שאינו נשוי' },
  { section: '40(ד)', description: 'ילד עם מוגבלות', points: '0.5–2', eligibility: 'ילד עם נכות מוכרת (לפי דרגה)' },
  // נישואין ומשפחה
  { section: '37', description: 'נישואין — בן/בת זוג לא עובד/ת', points: 1, eligibility: 'בן/בת זוג שאינם עובדים ואין להם הכנסה מעל סף' },
  // עליה ותושבות
  { section: '35', description: 'עולה חדש — שנה 1–3', points: 1, eligibility: '3 שנים מיום העלייה' },
  { section: '35', description: 'עולה חדש — שנה 4–5', points: 0.5, eligibility: 'שנות 4–5 מיום העלייה' },
  { section: '35', description: 'תושב חוזר רגיל', points: 0.5, eligibility: 'שהה בחו"ל רצוף 6+ שנים וחזר' },
  // השכלה ושירות
  { section: '40(א)', description: 'תואר אקדמי ראשון (B.A/B.Sc)', points: 1, eligibility: 'בשנת קבלת התואר ובשלוש השנים שאחריה' },
  { section: '40(א)', description: 'תואר שני/שלישי (M.A/Ph.D)', points: 0.5, eligibility: 'בשנת קבלת התואר ובשלוש השנים שאחריה (נוסף לראשון)' },
  { section: '40(ג)', description: 'שחרור משירות סדיר / שרות לאומי', points: 2, eligibility: 'שנת השחרור ושנתיים לאחריה' },
  // נכות
  { section: '45', description: 'נכות עצמית 90%+ או ≥100% על פי ועדה', points: '2 (נוסף)', eligibility: 'נכות מוכרת 90%+ ע"פ ביטוח לאומי / ועדה רפואית' },
  { section: '9(5)', description: 'פטור ממס על הכנסת עבודה — נכות 100%', points: 'פטור עד 100%', eligibility: 'נכות 100% מוכרת — פטור מלא על הכנסת עבודה עד תקרה' },
  // ישוב מזכה
  { section: 'תקנות', description: 'תושב ישוב מזכה (מעגל א)', points: 0.5, eligibility: 'מגורים בישוב ברשימה + תעודת תושב' },
  { section: 'תקנות', description: 'תושב ישוב מזכה (מעגל ב)', points: 0.25, eligibility: 'מגורים בישוב ברשימה ב\' + תעודת תושב' },
];

interface Props {
  onBack: () => void;
}

export default function TaxReferencePanel({ onBack }: Props) {
  const [year, setYear] = useState<number>(AVAILABLE_YEARS[0]);
  const [settRegion, setSettRegion] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'brackets' | 'credits' | 'ni' | 'settlements'>('brackets');

  const data = TAX_YEARS.find(t => t.year === year)!;

  // Build bracket chart data
  const bracketChartData = data.incomeTaxBrackets.map((b, i, arr) => {
    const from = i === 0 ? 0 : arr[i - 1].upTo;
    const width = b.upTo === Infinity ? 300_000 : b.upTo - from;
    return {
      label: `${b.rate}%`,
      from,
      upTo: b.upTo === Infinity ? '∞' : b.upTo,
      rate: b.rate,
      width,
    };
  });

  // NI chart data — employee example at avg wage * 12
  const annualAvg = data.niAverageWage * 12;
  const niLowMax = data.niThreshold60Monthly * 12;
  const niMax = data.niMaxIncomeMonthly * 12;

  const filteredSettlements = settRegion === 'all'
    ? SETTLEMENTS_SORTED
    : SETTLEMENTS_SORTED.filter(s => s.region === settRegion);

  const regions = Array.from(new Set(SETTLEMENTS.map(s => s.region)));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginBottom: '.25rem' }}>
            <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={onBack}>← חזרה לרשימת לקוחות</span>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>📚 מדריך מס ומידע עזר</h1>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)' }}>נתוני מס לפי שנה, נקודות זיכוי, ביטוח לאומי וישובים מזכים</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <label style={{ fontSize: '.875rem', fontWeight: 600 }}>שנת מס:</label>
          <select
            value={year}
            onChange={e => setYear(+e.target.value)}
            style={{ padding: '.4rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--gray-300)', fontSize: '.9375rem' }}
          >
            {AVAILABLE_YEARS.map(y => (
              <option key={y} value={y}>{y}{TAX_YEARS.find(t => t.year === y)?.isEstimated ? ' (מוערך)' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {data.isEstimated && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          ⚠️ נתוני שנת {year} הם הערכה בלבד — יש לאמת מול פרסומי רשות המיסים וביטוח לאומי.
        </div>
      )}

      {/* Key Numbers Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'ערך נקודת זיכוי', value: fmt(data.creditPointValue), sub: 'לשנה' },
          { label: 'שכר ממוצע (B"ל)', value: fmt(data.niAverageWage), sub: 'לחודש' },
          { label: 'תקרה לתשלום ב"ל', value: fmt(data.niMaxIncomeMonthly), sub: 'לחודש' },
          { label: 'סף 60% שכר', value: fmt(data.niThreshold60Monthly), sub: 'לחודש' },
          { label: 'סף היטל יסף', value: fmt(data.surtaxThreshold), sub: 'לשנה' },
          { label: 'פטור שכר דירה', value: fmt(data.rentalExemptMonthly), sub: 'לחודש' },
          { label: 'ב"ל מינימום (לא-עובד)', value: fmt(data.nonQualifyingMonthlyNI), sub: 'לחודש' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '.75rem 1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--blue-dark)' }}>{card.value}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--gray-400)' }}>{card.sub}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--gray-600)', marginTop: '.2rem' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '.25rem', marginBottom: '1rem', borderBottom: '2px solid var(--gray-200)', paddingBottom: '.5rem', flexWrap: 'wrap' }}>
        {([
          ['brackets', '📊 מדרגות מס'],
          ['credits', '⭐ נקודות זיכוי'],
          ['ni', '🏥 ביטוח לאומי'],
          ['settlements', '📍 ישובים מזכים'],
        ] as [typeof activeTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '.45rem .9rem',
              borderRadius: 'var(--radius)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '.875rem',
              fontWeight: activeTab === tab ? 700 : 400,
              background: activeTab === tab ? 'var(--blue)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--gray-600)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: מדרגות מס ── */}
      {activeTab === 'brackets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Chart */}
          <div className="card">
            <div className="card-header"><span className="card-title">מדרגות מס הכנסה — {year}</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={bracketChartData} margin={{ top: 16, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fontFamily: 'Heebo' }} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(_val: unknown, _name: unknown, props: { payload?: typeof bracketChartData[number] }) => {
                      const d = props.payload!;
                      return [`${fmt(d.from)} – ${d.upTo === '∞' ? '∞' : fmt(d.upTo as number)}`, 'טווח'];
                    }}
                    labelFormatter={(label) => `מדרגה ${label}`}
                    contentStyle={{ fontFamily: 'Heebo', fontSize: 12 }}
                  />
                  <Bar dataKey="rate" name="שיעור מס %">
                    {bracketChartData.map((_, i) => (
                      <Cell key={i} fill={BRACKET_COLORS[i % BRACKET_COLORS.length]} />
                    ))}
                    <LabelList dataKey="label" position="top" style={{ fontSize: 11, fontFamily: 'Heebo', fill: '#374151' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="card">
            <div className="card-header"><span className="card-title">טבלת מדרגות מס — {year}</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>מדרגה</th>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>הכנסה שנתית (₪)</th>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>שיעור מס</th>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>מס מקסימלי במדרגה</th>
                  </tr>
                </thead>
                <tbody>
                  {data.incomeTaxBrackets.map((b, i, arr) => {
                    const from = i === 0 ? 0 : arr[i - 1].upTo;
                    const width = b.upTo === Infinity ? null : b.upTo - from;
                    const maxTax = width ? width * b.rate / 100 : null;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td style={{ padding: '.5rem 1rem' }}>
                          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: BRACKET_COLORS[i], marginLeft: '.4rem', verticalAlign: 'middle' }} />
                          {i + 1}
                        </td>
                        <td style={{ padding: '.5rem 1rem', direction: 'ltr', textAlign: 'right' }}>
                          {fmt(from)} – {b.upTo === Infinity ? '∞' : fmt(b.upTo)}
                        </td>
                        <td style={{ padding: '.5rem 1rem', fontWeight: 700, color: BRACKET_COLORS[i] }}>{b.rate}%</td>
                        <td style={{ padding: '.5rem 1rem', color: 'var(--gray-500)' }}>
                          {maxTax ? fmt(Math.round(maxTax)) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Surtax */}
          <div className="alert alert-info">
            <strong>היטל יסף (3%)</strong> — חל על הכנסה חייבת העולה על {fmt(data.surtaxThreshold)} לשנה, בנוסף למס השולי הרגיל.
            סה"כ מס שולי עליון אפקטיבי: <strong>53%</strong> (50% + 3%).
          </div>
        </div>
      )}

      {/* ── TAB: נקודות זיכוי ── */}
      {activeTab === 'credits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="alert alert-info">
            ערך נקודת זיכוי בשנת {year}: <strong>{fmt(data.creditPointValue)}</strong> לשנה ({fmt(Math.round(data.creditPointValue / 12))} לחודש).
            הזיכוי מחושב כ: <strong>מספר נקודות × ערך נקודה = סכום הפחתה מהמס עצמו</strong> (לא מההכנסה).
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">טבלת נקודות זיכוי — שנת {year}</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                    <th style={{ padding: '.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>סעיף</th>
                    <th style={{ padding: '.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>תיאור</th>
                    <th style={{ padding: '.5rem 1rem', textAlign: 'center', fontWeight: 600 }}>נקודות</th>
                    <th style={{ padding: '.5rem 1rem', textAlign: 'center', fontWeight: 600 }}>ערך ({year})</th>
                    <th style={{ padding: '.5rem 1rem', textAlign: 'right', fontWeight: 600 }}>תנאי זכאות</th>
                  </tr>
                </thead>
                <tbody>
                  {CREDIT_POINTS.map((row, i) => {
                    const pts = typeof row.points === 'number' ? row.points : null;
                    const val = pts ? fmt(Math.round(pts * data.creditPointValue)) : '—';
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                        <td style={{ padding: '.45rem 1rem', color: 'var(--gray-500)', fontFamily: 'monospace', fontSize: '.75rem' }}>{row.section}</td>
                        <td style={{ padding: '.45rem 1rem', fontWeight: 500 }}>{row.description}</td>
                        <td style={{ padding: '.45rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--blue-dark)' }}>{row.points}</td>
                        <td style={{ padding: '.45rem 1rem', textAlign: 'center', color: 'var(--green-dark)' }}>{val}</td>
                        <td style={{ padding: '.45rem 1rem', color: 'var(--gray-600)', fontSize: '.75rem' }}>{row.eligibility}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="alert alert-warning">
            <strong>שים לב:</strong> נקודות זיכוי מופחתות ישירות מסכום המס ולא מההכנסה החייבת.
            אם סך הזיכוי עולה על המס המחושב — לא מקבלים החזר (הנקודות "אובדות").
            מומלץ לבדוק שימוש מיטבי בנקודות הזיכוי לכל לקוח.
          </div>
        </div>
      )}

      {/* ── TAB: ביטוח לאומי ── */}
      {activeTab === 'ni' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Key NI numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.75rem' }}>
            {[
              { label: 'שכר ממוצע במשק', value: fmt(data.niAverageWage) + '/חודש' },
              { label: 'שכר ממוצע (שנתי)', value: fmt(data.niAverageWage * 12) + '/שנה' },
              { label: 'סף 60% (מדרגה ראשונה)', value: fmt(data.niThreshold60Monthly) + '/חודש' },
              { label: 'תקרת הכנסה לב"ל', value: fmt(data.niMaxIncomeMonthly) + '/חודש' },
              { label: 'תקרת הכנסה לב"ל (שנתי)', value: fmt(data.niMaxIncomeMonthly * 12) + '/שנה' },
            ].map(item => (
              <div key={item.label} className="card" style={{ padding: '.75rem 1rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--blue-dark)' }}>{item.value}</div>
                <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Rates table */}
          <div className="card">
            <div className="card-header"><span className="card-title">שיעורי ביטוח לאומי ומס בריאות — {year}</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'right', fontWeight: 600 }}>סוג</th>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'center', fontWeight: 600 }}>ב"ל מדרגה ראשונה<br /><span style={{ fontSize: '.7rem', fontWeight: 400 }}>(עד {fmt(data.niThreshold60Monthly)}/חודש)</span></th>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'center', fontWeight: 600 }}>ב"ל מדרגה שנייה<br /><span style={{ fontSize: '.7rem', fontWeight: 400 }}>(מעל {fmt(data.niThreshold60Monthly)}/חודש)</span></th>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'center', fontWeight: 600 }}>בריאות מדרגה ראשונה</th>
                    <th style={{ padding: '.6rem 1rem', textAlign: 'center', fontWeight: 600 }}>בריאות מדרגה שנייה</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '.5rem 1rem', fontWeight: 600 }}>שכיר (חלק עובד)</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.employeeNI.lowRate}%</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.employeeNI.highRate}%</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.employeeNI.healthLowRate}%</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.employeeNI.healthHighRate}%</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
                    <td style={{ padding: '.5rem 1rem', fontWeight: 600 }}>עצמאי</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.selfEmployedNI.lowRate}%</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.selfEmployedNI.highRate}%</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.selfEmployedNI.healthLowRate}%</td>
                    <td style={{ padding: '.5rem 1rem', textAlign: 'center' }}>{data.selfEmployedNI.healthHighRate}%</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '.5rem 1rem', fontWeight: 600 }}>שאינו עובד / פסיבי</td>
                    <td colSpan={4} style={{ padding: '.5rem 1rem', textAlign: 'center', color: 'var(--gray-600)' }}>
                      {fmt(data.nonQualifyingMonthlyNI)} לחודש (סכום קבוע)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* NI Deduction rule */}
          <div className="card" style={{ border: '2px solid var(--blue-border)' }}>
            <div className="card-header" style={{ background: 'var(--blue-light)' }}>
              <span className="card-title">⚖️ ניכוי ביטוח לאומי עצמאי מהכנסה החייבת (סעיף 17(5) לפקודה)</span>
            </div>
            <div className="card-body">
              <p style={{ marginBottom: '.75rem' }}>
                עצמאי רשאי לנכות <strong>52% מתשלומי ביטוח הלאומי</strong> (לא כולל מס בריאות) כהוצאה מוכרת מהכנסתו החייבת לצורכי מס הכנסה.
              </p>
              <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '1rem', fontFamily: 'monospace', fontSize: '.8125rem', lineHeight: 1.8 }}>
                <div>1. חישוב ב"ל על <strong>הכנסה גולמית</strong> (לפני ניכוי)</div>
                <div>2. ניכוי = 52% × תשלום ב"ל ביטוח (לא בריאות)</div>
                <div>3. <strong>הכנסה חייבת למ"ה</strong> = הכנסה גולמית − ניכויים אחרים − 52% × ב"ל</div>
                <div>4. חישוב מס הכנסה על הכנסה המופחתת</div>
              </div>
              <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
                <strong>חשוב:</strong> החישוב אינו מעגלי — ביטוח לאומי מחושב על ההכנסה הגולמית (לפני ניכוי),
                ואז 52% מה-ב"ל מנוכים לחישוב מס הכנסה. לא נדרשת איטרציה.
              </div>

              {/* Example at average wage */}
              <div style={{ marginTop: '.75rem' }}>
                <strong>דוגמה חישובית בשנת {year} (הכנסה = שכר ממוצע × 12 = {fmt(annualAvg)}):</strong>
                <div style={{ marginTop: '.5rem', fontSize: '.8125rem', color: 'var(--gray-700)' }}>
                  {(() => {
                    const lowMax = data.niThreshold60Monthly * 12;
                    const lowNI = Math.min(annualAvg, lowMax) * data.selfEmployedNI.lowRate / 100;
                    const highNI = Math.max(0, Math.min(annualAvg, niMax) - lowMax) * data.selfEmployedNI.highRate / 100;
                    const totalNIinsurance = lowNI + highNI;
                    const deduction = totalNIinsurance * 0.52;
                    const saving = deduction * 0.31; // rough 31% bracket
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                        <div>ב"ל ביטוח (רכיב ביטוח בלבד): <strong>{fmt(Math.round(totalNIinsurance))}</strong></div>
                        <div>ניכוי 52%: <strong>{fmt(Math.round(deduction))}</strong></div>
                        <div>חיסכון במס (מדרגה 31%): <strong>~{fmt(Math.round(saving))}</strong></div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* NI Bar Chart */}
          <div className="card">
            <div className="card-header"><span className="card-title">מבנה תשלום ב"ל עצמאי לפי רמת הכנסה — {year}</span></div>
            <div className="card-body">
              {(() => {
                const incomes = [50_000, 100_000, 150_000, 200_000, 300_000, 400_000, niMax * 12 / 12 * 12];
                const chartData = incomes.map(inc => {
                  const lowMax = niLowMax;
                  const lowNI = Math.min(inc, lowMax) * data.selfEmployedNI.lowRate / 100;
                  const highNI = Math.max(0, Math.min(inc, niMax) - lowMax) * data.selfEmployedNI.highRate / 100;
                  const lowH = Math.min(inc, lowMax) * data.selfEmployedNI.healthLowRate / 100;
                  const highH = Math.max(0, Math.min(inc, niMax) - lowMax) * data.selfEmployedNI.healthHighRate / 100;
                  return {
                    income: `₪${(inc / 1000).toFixed(0)}K`,
                    niInsurance: Math.round(lowNI + highNI),
                    niHealth: Math.round(lowH + highH),
                  };
                });
                return (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="income" tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                      <YAxis tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10, fontFamily: 'Heebo' }} />
                      <Tooltip formatter={(v: unknown, name: unknown) => [fmt(v as number), (name as string) === 'niInsurance' ? 'ב"ל ביטוח' : 'מס בריאות']} contentStyle={{ fontFamily: 'Heebo', fontSize: 12 }} />
                      <Bar dataKey="niInsurance" name='ב"ל ביטוח' stackId="a" fill="#3b82f6" />
                      <Bar dataKey="niHealth" name="מס בריאות" stackId="a" fill="#93c5fd" />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
              <p style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: '.5rem', textAlign: 'center' }}>
                הכנסה מעל {fmt(data.niMaxIncomeMonthly)}/חודש — פטורה מתשלום ב"ל
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ישובים מזכים ── */}
      {activeTab === 'settlements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="alert alert-info">
            תושבי ישובים מזכים זכאים ל-<strong>0.5 נקודת זיכוי</strong> ({fmt(Math.round(0.5 * data.creditPointValue))} לשנה בשנת {year}).
            נדרשת <strong>תעודת תושב</strong> מהרשות המקומית. הרשימה מתעדכנת מדי שנה — יש לאמת מול רשות המיסים.
          </div>

          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600, fontSize: '.875rem' }}>אזור:</label>
            <select
              value={settRegion}
              onChange={e => setSettRegion(e.target.value)}
              style={{ padding: '.4rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--gray-300)' }}
            >
              <option value="all">כל האזורים ({SETTLEMENTS.length} ישובים)</option>
              {regions.map(r => (
                <option key={r} value={r}>{REGION_LABELS[r]} ({SETTLEMENTS.filter(s => s.region === r).length})</option>
              ))}
            </select>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                ישובים מזכים {settRegion !== 'all' ? `— ${REGION_LABELS[settRegion as SettlementRegion]}` : ''}
                <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--gray-400)', marginRight: '.5rem' }}>
                  ({filteredSettlements.length} ישובים)
                </span>
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 0 }}>
                {filteredSettlements.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      padding: '.5rem 1rem',
                      borderBottom: '1px solid var(--gray-100)',
                      borderLeft: (i % 3 !== 2) && (i < filteredSettlements.length - 1) ? '1px solid var(--gray-100)' : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: i % 2 === 0 ? 'white' : 'var(--gray-50)',
                    }}
                  >
                    <span style={{ fontSize: '.875rem' }}>{s.name}</span>
                    <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                      <span className="badge badge-blue" style={{ fontSize: '.65rem' }}>{REGION_LABELS[s.region]}</span>
                      <span className="badge badge-gray" style={{ fontSize: '.65rem' }}>מעגל {s.tier}</span>
                      <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--green-dark)' }}>{s.creditPoints} נק׳</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="alert alert-warning">
            <strong>הגדרת "תושב" לצורך ישוב מזכה:</strong> מגורים בפועל ביישוב לפחות 12 חודשים ברציפות בשנת המס.
            יש להגיש טופס 101 עם ציון הישוב ולצרף תעודת תושב מהמועצה האזורית/עירייה.
          </div>
        </div>
      )}
    </div>
  );
}

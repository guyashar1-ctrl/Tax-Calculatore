import { useState } from 'react';
import { TAX_YEARS, AVAILABLE_YEARS } from '../data/taxData';
import { SETTLEMENTS, SETTLEMENTS_SORTED } from '../data/settlements';
import type { SettlementRegion } from '../data/settlements';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import NIReferenceSection from './NIReferenceSection';

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

  // Inline income tax calculator state
  const [calcIncome, setCalcIncome] = useState<number>(0);
  // Credit points selector state
  const [cpGender, setCpGender] = useState<'male' | 'female'>('male');
  const [cpFamilyStatus, setCpFamilyStatus] = useState<'single' | 'singleParent'>('single');
  const [cpChildBirthYears, setCpChildBirthYears] = useState<number[]>([]);
  const [cpNewImmigrant, setCpNewImmigrant] = useState(false);
  const [cpAliyahYear, setCpAliyahYear] = useState(0);
  const [cpDegree, setCpDegree] = useState<'' | 'bachelor' | 'master'>('');
  const [cpDegreeYear, setCpDegreeYear] = useState(0);
  const [cpIDF, setCpIDF] = useState(false);
  const [cpIDFYear, setCpIDFYear] = useState(0);
  const [cpSettlement, setCpSettlement] = useState(false);
  const [cpSettlementPts, setCpSettlementPts] = useState(0.5);
  const [cpDisability, setCpDisability] = useState(0);

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

          {/* ── Inline Income Tax Calculator ── */}
          {(() => {
            // ── Credit points calculation ──
            const cpLines: { desc: string; pts: number }[] = [];
            cpLines.push({ desc: 'תושב ישראל', pts: 2.25 });
            if (cpGender === 'female') cpLines.push({ desc: 'תוספת לאישה', pts: 0.5 });
            if (cpFamilyStatus === 'singleParent') cpLines.push({ desc: 'הורה יחיד', pts: 1 });
            for (const by of cpChildBirthYears) {
              const age = year - by;
              if (age < 0 || age > 18) continue;
              const pts = age === 0 ? 1.5 : age <= 5 ? 2.5 : age <= 12 ? 2 : age <= 17 ? 1 : 0.5;
              cpLines.push({ desc: `ילד/ה (${by}) גיל ${age}`, pts });
            }
            if (cpNewImmigrant && cpAliyahYear > 0) {
              const d = year - cpAliyahYear;
              if (d >= 0 && d <= 1) cpLines.push({ desc: `עולה חדש שנה ${d + 1}`, pts: 3 });
              else if (d === 2) cpLines.push({ desc: 'עולה חדש שנה 3', pts: 2 });
              else if (d === 3) cpLines.push({ desc: 'עולה חדש שנה 4', pts: 1 });
            }
            if (cpDegree && cpDegreeYear > 0 && cpDegreeYear <= year && year - cpDegreeYear <= 3) {
              cpLines.push({ desc: cpDegree === 'bachelor' ? 'תואר ראשון' : 'תואר שני', pts: 1 });
            }
            if (cpIDF && cpIDFYear > 0) {
              const d = year - cpIDFYear;
              if (d === 0) cpLines.push({ desc: 'שחרור צה"ל — שנת השחרור', pts: 2 });
              else if (d === 1) cpLines.push({ desc: 'שחרור צה"ל — שנה לאחר', pts: 1 });
            }
            if (cpSettlement) cpLines.push({ desc: 'ישוב מזכה', pts: cpSettlementPts });
            if (cpDisability >= 90) cpLines.push({ desc: `נכות ${cpDisability}%`, pts: 4 });
            else if (cpDisability >= 60) cpLines.push({ desc: `נכות ${cpDisability}%`, pts: 2.5 });
            else if (cpDisability >= 30) cpLines.push({ desc: `נכות ${cpDisability}%`, pts: 1.5 });
            else if (cpDisability >= 10) cpLines.push({ desc: `נכות ${cpDisability}%`, pts: 0.5 });

            const calcCredits = cpLines.reduce((s, l) => s + l.pts, 0);

            // ── Tax calculation ──
            let remaining = calcIncome;
            let totalTax = 0;
            let prevLimit = 0;
            const lines: { from: number; to: number | null; rate: number; income: number; tax: number }[] = [];
            for (const b of data.incomeTaxBrackets) {
              if (remaining <= 0) break;
              const top = b.upTo === Infinity ? calcIncome : b.upTo;
              const size = top - prevLimit;
              const taxable = Math.min(remaining, size);
              const tax = taxable * b.rate / 100;
              if (taxable > 0) lines.push({ from: prevLimit, to: b.upTo === Infinity ? null : b.upTo, rate: b.rate, income: taxable, tax });
              totalTax += tax;
              remaining -= taxable;
              prevLimit = top;
            }
            const creditVal = calcCredits * data.creditPointValue;
            const taxAfterCredit = Math.max(0, totalTax - creditVal);
            const surtax = calcIncome > data.surtaxThreshold ? (calcIncome - data.surtaxThreshold) * 0.03 : 0;
            const finalTax = taxAfterCredit + surtax;
            const effective = calcIncome > 0 ? (finalTax / calcIncome * 100) : 0;
            const marginalBracket = data.incomeTaxBrackets.find(b => calcIncome <= b.upTo);
            const marginalRate = marginalBracket?.rate ?? 50;
            const unusedCredit = Math.max(0, creditVal - totalTax);

            return (
              <div className="card" style={{ border: '2px solid var(--blue-border)', borderRadius: 'var(--radius-lg)' }}>
                <div className="card-header" style={{ background: 'var(--blue-light)' }}>
                  <span className="card-title" style={{ color: 'var(--blue-dark)' }}>🧮 מחשבון מס הכנסה מהיר — {year}</span>
                </div>
                <div className="card-body">
                  {/* Income input */}
                  <div className="form-group" style={{ marginBottom: '1rem', maxWidth: 320 }}>
                    <label style={{ fontWeight: 700 }}>הכנסה שנתית חייבת (₪)</label>
                    <input
                      type="number"
                      min={0}
                      value={calcIncome || ''}
                      onChange={e => setCalcIncome(+e.target.value)}
                      placeholder="הזן הכנסה שנתית..."
                      style={{ fontSize: '1.1rem' }}
                    />
                  </div>

                  {/* Credit points selector */}
                  <div style={{ background: '#f0f9ff', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.75rem', color: 'var(--blue-dark)' }}>
                      נקודות זיכוי — סה"כ: <span style={{ fontSize: '1.1rem' }}>{calcCredits.toFixed(2)}</span> ({fmt(Math.round(creditVal))})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.75rem' }}>
                      {/* Gender */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>מין</label>
                        <select value={cpGender} onChange={e => setCpGender(e.target.value as 'male' | 'female')} style={{ padding: '.3rem .5rem' }}>
                          <option value="male">זכר</option>
                          <option value="female">נקבה (+0.5)</option>
                        </select>
                      </div>
                      {/* Family status */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>מצב משפחתי</label>
                        <select value={cpFamilyStatus} onChange={e => setCpFamilyStatus(e.target.value as 'single' | 'singleParent')} style={{ padding: '.3rem .5rem' }}>
                          <option value="single">לא הורה יחיד</option>
                          <option value="singleParent">הורה יחיד (+1)</option>
                        </select>
                      </div>
                      {/* Children */}
                      <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                        <label>
                          ילדים (שנות לידה, מופרדות בפסיק)
                          <span style={{ fontWeight: 400, color: 'var(--gray-500)', marginRight: '.3rem' }}>
                            למשל: 2015, 2018, 2021
                          </span>
                        </label>
                        <input
                          type="text"
                          placeholder="2015, 2018, 2021"
                          value={cpChildBirthYears.join(', ')}
                          onChange={e => {
                            const years = e.target.value.split(/[,\s]+/).map(Number).filter(n => n > 1950 && n <= year);
                            setCpChildBirthYears(years);
                          }}
                          style={{ padding: '.3rem .5rem' }}
                        />
                      </div>
                      {/* Academic degree */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>תואר אקדמי</label>
                        <select value={cpDegree} onChange={e => setCpDegree(e.target.value as '' | 'bachelor' | 'master')} style={{ padding: '.3rem .5rem' }}>
                          <option value="">ללא</option>
                          <option value="bachelor">תואר ראשון (+1)</option>
                          <option value="master">תואר שני (+1)</option>
                        </select>
                      </div>
                      {cpDegree && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>שנת סיום תואר</label>
                          <input type="number" min={1990} max={year} value={cpDegreeYear || ''} onChange={e => setCpDegreeYear(+e.target.value)} style={{ padding: '.3rem .5rem' }} />
                          <span style={{ fontSize: '.65rem', color: 'var(--gray-500)' }}>שנת הסיום + 3 שנים</span>
                        </div>
                      )}
                      {/* IDF */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={cpIDF} onChange={e => setCpIDF(e.target.checked)} />
                          שירות צבאי/לאומי
                        </label>
                      </div>
                      {cpIDF && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>שנת שחרור</label>
                          <input type="number" min={1990} max={year} value={cpIDFYear || ''} onChange={e => setCpIDFYear(+e.target.value)} style={{ padding: '.3rem .5rem' }} />
                        </div>
                      )}
                      {/* New immigrant */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={cpNewImmigrant} onChange={e => setCpNewImmigrant(e.target.checked)} />
                          עולה חדש
                        </label>
                      </div>
                      {cpNewImmigrant && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>שנת עלייה</label>
                          <input type="number" min={1990} max={year} value={cpAliyahYear || ''} onChange={e => setCpAliyahYear(+e.target.value)} style={{ padding: '.3rem .5rem' }} />
                        </div>
                      )}
                      {/* Settlement */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={cpSettlement} onChange={e => setCpSettlement(e.target.checked)} />
                          ישוב מזכה
                        </label>
                      </div>
                      {cpSettlement && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>נקודות ישוב</label>
                          <select value={cpSettlementPts} onChange={e => setCpSettlementPts(+e.target.value)} style={{ padding: '.3rem .5rem' }}>
                            <option value={0.25}>0.25 (מעגל ב)</option>
                            <option value={0.5}>0.5 (מעגל א)</option>
                          </select>
                        </div>
                      )}
                      {/* Disability */}
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>נכות (%)</label>
                        <input type="number" min={0} max={100} value={cpDisability || ''} onChange={e => setCpDisability(+e.target.value)} placeholder="0" style={{ padding: '.3rem .5rem' }} />
                      </div>
                    </div>

                    {/* Credit points summary */}
                    {cpLines.length > 1 && (
                      <div style={{ marginTop: '.75rem', display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                        {cpLines.map((l, i) => (
                          <span key={i} className="badge badge-blue" style={{ fontSize: '.7rem' }}>
                            {l.desc}: {l.pts}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Results */}
                  {calcIncome > 0 && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.5rem', marginBottom: '1rem' }}>
                        {[
                          { label: 'מס לפני זיכוי', value: fmt(Math.round(totalTax)), color: 'var(--gray-700)' },
                          { label: 'זיכוי נקודות', value: '-' + fmt(Math.round(Math.min(creditVal, totalTax))), color: '#16a34a' },
                          ...(surtax > 0 ? [{ label: 'היטל יסף', value: '+' + fmt(Math.round(surtax)), color: '#dc2626' }] : []),
                          { label: 'מס סופי', value: fmt(Math.round(finalTax)), color: '#dc2626' },
                          { label: 'שיעור אפקטיבי', value: effective.toFixed(1) + '%', color: '#7c3aed' },
                          { label: 'שיעור שולי', value: marginalRate + '%', color: '#d97706' },
                          { label: 'נטו (לפני ב"ל)', value: fmt(Math.round(calcIncome - finalTax)), color: '#16a34a' },
                        ].map(c => (
                          <div key={c.label} style={{ padding: '.6rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: c.color }}>{c.value}</div>
                            <div style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>{c.label}</div>
                          </div>
                        ))}
                      </div>

                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8125rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                            <th style={{ padding: '.4rem .6rem', textAlign: 'right' }}>מדרגה</th>
                            <th style={{ padding: '.4rem .6rem', textAlign: 'center' }}>שיעור</th>
                            <th style={{ padding: '.4rem .6rem', textAlign: 'center' }}>הכנסה במדרגה</th>
                            <th style={{ padding: '.4rem .6rem', textAlign: 'center' }}>מס</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((l, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                              <td style={{ padding: '.35rem .6rem' }}>
                                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: BRACKET_COLORS[i], marginLeft: '.3rem', verticalAlign: 'middle' }} />
                                {fmt(l.from)} – {l.to ? fmt(l.to) : '∞'}
                              </td>
                              <td style={{ padding: '.35rem .6rem', textAlign: 'center', fontWeight: 700, color: BRACKET_COLORS[i] }}>{l.rate}%</td>
                              <td style={{ padding: '.35rem .6rem', textAlign: 'center' }}>{fmt(Math.round(l.income))}</td>
                              <td style={{ padding: '.35rem .6rem', textAlign: 'center' }}>{fmt(Math.round(l.tax))}</td>
                            </tr>
                          ))}
                          <tr style={{ background: '#fef2f2', fontWeight: 700 }}>
                            <td colSpan={3} style={{ padding: '.5rem .6rem' }}>סה"כ מס הכנסה סופי (כולל היטל יסף)</td>
                            <td style={{ padding: '.5rem .6rem', textAlign: 'center', color: '#dc2626', fontSize: '.95rem' }}>{fmt(Math.round(finalTax))}</td>
                          </tr>
                        </tbody>
                      </table>

                      {unusedCredit > 0 && (
                        <div className="alert alert-warning" style={{ marginTop: '.75rem', marginBottom: 0 }}>
                          <strong>זיכוי לא מנוצל:</strong> {fmt(Math.round(unusedCredit))} מתוך הזיכוי לא נוצלו (המס נמוך מסך הזיכוי).
                          ניתן להרוויח עוד כ-{fmt(Math.round(unusedCredit / (marginalRate / 100)))} לפני תשלום מס.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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
      {activeTab === 'ni' && <NIReferenceSection taxData={data} year={year} />}

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

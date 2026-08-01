import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { TaxYearData } from '../../types';

const fmt = (n: number) => n === Infinity ? '∞' : '₪' + Math.round(n).toLocaleString('he-IL');
const BRACKET_COLORS = ['var(--ok)', 'var(--chip-green-tx)', 'var(--warn)', 'var(--chip-orange-tx)', 'var(--err)', 'var(--err)', 'var(--chip-red-tx)'];

interface Props {
  taxData: TaxYearData;
  year: number;
}

export default function IncomeTaxPanel({ taxData, year }: Props) {
  const [income, setIncome] = useState(0);
  const [capitalIncome, setCapitalIncome] = useState(0);
  const [credits, setCredits] = useState(2.25);

  const bracketChartData = taxData.incomeTaxBrackets.map((b, i, arr) => {
    const from = i === 0 ? 0 : arr[i - 1].upTo;
    return { label: `${b.rate}%`, from, upTo: b.upTo, rate: b.rate };
  });

  const calc = useMemo(() => {
    if (income <= 0 && capitalIncome <= 0) return null;
    let remaining = income, tax = 0, prev = 0;
    const lines: { from: number; to: number | null; rate: number; amount: number; tax: number }[] = [];
    for (const b of taxData.incomeTaxBrackets) {
      if (remaining <= 0) break;
      const top = b.upTo === Infinity ? income : b.upTo;
      const amount = Math.min(remaining, top - prev);
      const t = amount * b.rate / 100;
      if (amount > 0) lines.push({ from: prev, to: b.upTo === Infinity ? null : b.upTo, rate: b.rate, amount, tax: t });
      tax += t; remaining -= amount; prev = top;
    }
    const creditValue = credits * taxData.creditPointValue;
    const afterCredits = Math.max(0, tax - creditValue);

    // מס יסף דו-שכבתי
    const totalBase = income + capitalIncome;
    const th = taxData.surtaxThreshold;
    const surtax3 = totalBase > th ? (totalBase - th) * 0.03 : 0;
    const surtax2 = taxData.surtaxCapitalExtraRate > 0 && capitalIncome > th
      ? (capitalIncome - th) * (taxData.surtaxCapitalExtraRate / 100) : 0;

    const marginal = taxData.incomeTaxBrackets.find(b => income <= b.upTo)?.rate ?? 50;
    return { lines, tax, creditValue, afterCredits, surtax3, surtax2, marginal, totalBase };
  }, [income, capitalIncome, credits, taxData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* גרף + טבלה */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">מדרגות מס — {year} {year === 2026 && <span className="badge badge-blue" style={{ marginRight: '.5rem' }}>מדרגות 3–4 הורחבו רטרואקטיבית מ-1.1.2026</span>}</span>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bracketChartData} margin={{ top: 16, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fontFamily: 'Heebo' }} />
              <YAxis hide />
              <Tooltip
                formatter={(_v: unknown, _n: unknown, props: { payload?: typeof bracketChartData[number] }) => {
                  const d = props.payload!;
                  return [`${fmt(d.from)} – ${fmt(d.upTo)}`, 'טווח שנתי'];
                }}
                contentStyle={{ fontFamily: 'Heebo', fontSize: 12 }}
              />
              <Bar dataKey="rate" name="שיעור">
                {bracketChartData.map((_, i) => <Cell key={i} fill={BRACKET_COLORS[i % BRACKET_COLORS.length]} />)}
                <LabelList dataKey="label" position="top" style={{ fontSize: 11, fontFamily: 'Heebo', fill: 'var(--txb)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="table-wrap" style={{ marginTop: '.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                  <th style={{ padding: '.5rem .8rem', textAlign: 'right' }}>הכנסה שנתית</th>
                  <th style={{ padding: '.5rem .8rem', textAlign: 'right' }}>הכנסה חודשית</th>
                  <th style={{ padding: '.5rem .8rem', textAlign: 'center' }}>שיעור</th>
                </tr>
              </thead>
              <tbody>
                {bracketChartData.map((b, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td style={{ padding: '.4rem .8rem', direction: 'ltr', textAlign: 'right' }}>{fmt(b.from)} – {fmt(b.upTo)}</td>
                    <td style={{ padding: '.4rem .8rem', direction: 'ltr', textAlign: 'right', color: 'var(--gray-500)' }}>
                      {fmt(Math.round(b.from / 12))} – {b.upTo === Infinity ? '∞' : fmt(Math.round(b.upTo / 12))}
                    </td>
                    <td style={{ padding: '.4rem .8rem', textAlign: 'center', fontWeight: 600, color: BRACKET_COLORS[i] }}>{b.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="alert alert-info" style={{ marginTop: '.75rem', marginBottom: 0, fontSize: '14px' }}>
            הכנסה שאינה מיגיעה אישית (מתחת לגיל 60): מדרגת פתיחה <strong>31%</strong>. בני 60+ — מדרגות מלאות גם על הכנסה פסיבית.
          </div>
        </div>
      </div>

      {/* מס יסף */}
      <div className="card" style={{ border: '1px solid var(--chip-red-bd)' }}>
        <div className="card-header" style={{ background: 'var(--chip-red-bg)' }}>
          <span className="card-title">מס יסף — שתי שכבות (סעיף 121ב)</span>
        </div>
        <div className="card-body" style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <div>
            <strong>שכבה 1 — 3%</strong> על כלל ההכנסה החייבת מעל <strong>{fmt(taxData.surtaxThreshold)}</strong> לשנה (הסף הוקפא עד 2027).
          </div>
          {taxData.surtaxCapitalExtraRate > 0 ? (
            <div>
              <strong>שכבה 2 — {taxData.surtaxCapitalExtraRate}% נוסף</strong> (מ-2025, תיקון 276) על הכנסות שאינן מיגיעה אישית — רווח הון, שבח, דיבידנד, ריבית ושכירות — <u>רק אם ההכנסות ההוניות לבדן</u> עולות על הסף. סה"כ עד <strong>5%</strong> על הכנסות הוניות.
            </div>
          ) : (
            <div>בשנת {year} — אין עדיין את השכבה השנייה (נכנסה לתוקף ב-2025).</div>
          )}
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            מס יסף מחושב ליחיד (סף מלא לכל בן זוג בחישוב נפרד). שבח ממכירת דירת מגורים מתחת לתקרת ~5.38 מיליון ₪ מוחרג. מקור: הוראת ביצוע 5/2025.
          </div>
        </div>
      </div>

      {/* מחשבון מהיר */}
      <div className="card" style={{ border: '2px solid var(--blue-border)' }}>
        <div className="card-header" style={{ background: 'var(--blue-light)' }}>
          <span className="card-title" style={{ color: 'var(--blue-dark)' }}>חישוב מהיר — {year}</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label>הכנסה שנתית חייבת (יגיעה אישית) ₪</label>
              <input type="number" min={0} value={income || ''} placeholder="0" onChange={e => setIncome(+e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label>הכנסות הוניות (רווח הון, דיבידנד...) ₪</label>
              <input type="number" min={0} value={capitalIncome || ''} placeholder="0" onChange={e => setCapitalIncome(+e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>נקודות זיכוי</label>
              <input type="number" min={0} max={20} step={0.25} value={credits} onChange={e => setCredits(+e.target.value)} style={{ width: 100 }} />
            </div>
          </div>

          {calc && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.5rem', marginBottom: '.75rem' }}>
                {[
                  { label: 'מס לפי מדרגות', value: fmt(calc.tax), color: 'var(--gray-700)' },
                  { label: `זיכוי (${credits} נק')`, value: '−' + fmt(Math.min(calc.creditValue, calc.tax)), color: 'var(--ok)' },
                  ...(calc.surtax3 > 0 ? [{ label: 'מס יסף 3%', value: '+' + fmt(calc.surtax3), color: 'var(--err)' }] : []),
                  ...(calc.surtax2 > 0 ? [{ label: `יסף הוני ${taxData.surtaxCapitalExtraRate}%`, value: '+' + fmt(calc.surtax2), color: 'var(--err)' }] : []),
                  { label: 'מס סופי (ללא מס ההון עצמו)', value: fmt(calc.afterCredits + calc.surtax3 + calc.surtax2), color: 'var(--err)' },
                  { label: 'שיעור שולי', value: calc.marginal + '%', color: 'var(--warn)' },
                ].map(c => (
                  <div key={c.label} style={{ padding: '.6rem', background: 'var(--gray-50)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{c.label}</div>
                  </div>
                ))}
              </div>
              {calc.surtax3 > 0 && calc.surtax2 === 0 && capitalIncome > 0 && taxData.surtaxCapitalExtraRate > 0 && (
                <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                  היסף ההוני (2%) לא חל: ההכנסות ההוניות לבדן ({fmt(capitalIncome)}) אינן מעל הסף ({fmt(taxData.surtaxThreshold)}) — כך לפי הדוגמאות הרשמיות בהו"ב 5/2025.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { TaxYearData } from '../../types';
import { compareRentalRoutes, RentalInput } from '../../utils/rentalTax';

const fmt = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL');

interface Props {
  taxData: TaxYearData;
  year: number;
}

const MARGINAL_RATES = [10, 14, 20, 31, 35, 47, 50];

export default function RentalRouteCalculator({ taxData, year }: Props) {
  const [monthlyRent, setMonthlyRent] = useState(7000);
  const [propertyCount, setPropertyCount] = useState(1);
  const [isAge60Plus, setIsAge60Plus] = useState(false);
  const [marginalRate, setMarginalRate] = useState(31);
  const [annualExpenses, setAnnualExpenses] = useState(0);
  const [annualDepreciation, setAnnualDepreciation] = useState(0);
  const [eligible122f, setEligible122f] = useState(false);
  const [rentPaid, setRentPaid] = useState(0);

  const input: RentalInput = useMemo(() => ({
    year,
    monthlyRent,
    exemptCeilingMonthly: taxData.rentalExemptMonthly,
    marginalRatePct: marginalRate,
    isAge60Plus,
    annualExpenses,
    annualDepreciation,
    eligibleForRentPaidDeduction: eligible122f,
    annualRentPaidForOwnHome: rentPaid,
    propertyCount,
  }), [year, monthlyRent, taxData.rentalExemptMonthly, marginalRate, isAge60Plus, annualExpenses, annualDepreciation, eligible122f, rentPaid, propertyCount]);

  const result = useMemo(() => compareRentalRoutes(input), [input]);
  const m = result.mechanism;
  const annualRent = monthlyRent * 12;

  // ── ויזואליזציית הפטור המתקפל ──
  const scaleMax = Math.max(m.zeroPoint * 1.15, monthlyRent * 1.1);
  const pct = (v: number) => Math.min(100, (v / scaleMax) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── קלט ── */}
      <div className="card">
        <div className="card-header"><span className="card-title">🏠 נתוני ההשכרה</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.75rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontWeight: 700 }}>שכ"ד חודשי (כל הדירות) ₪</label>
              <input type="number" min={0} value={monthlyRent || ''} onChange={e => setMonthlyRent(+e.target.value)} style={{ fontSize: '1.05rem' }} />
              <span style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>= {fmt(annualRent)} לשנה</span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>מספר דירות מושכרות</label>
              <input type="number" min={1} max={20} value={propertyCount} onChange={e => setPropertyCount(+e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>שיעור מס שולי של המשכיר</label>
              <select value={marginalRate} onChange={e => setMarginalRate(+e.target.value)}>
                {MARGINAL_RATES.filter(r => isAge60Plus || r >= 31).map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
              <span style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>
                {isAge60Plus ? 'בני 60+ — מדרגות מלאות מ-10%' : 'מתחת לגיל 60 — מינימום 31% על הכנסה פסיבית'}
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="checkbox-row" style={{ marginTop: '1.4rem' }}>
                <input type="checkbox" checked={isAge60Plus}
                  onChange={e => { setIsAge60Plus(e.target.checked); if (!e.target.checked && marginalRate < 31) setMarginalRate(31); }} />
                המשכיר/ה בני 60+
              </label>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>הוצאות שנתיות (ריבית, תיקונים...) ₪</label>
              <input type="number" min={0} value={annualExpenses || ''} placeholder="0" onChange={e => setAnnualExpenses(+e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>פחת שנתי (2% משווי הדירה) ₪</label>
              <input type="number" min={0} value={annualDepreciation || ''} placeholder="0" onChange={e => setAnnualDepreciation(+e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: '.75rem', padding: '.6rem .8rem', background: 'var(--gray-50)', borderRadius: 8 }}>
            <label className="checkbox-row" style={{ fontWeight: 600 }}>
              <input type="checkbox" checked={eligible122f} onChange={e => setEligible122f(e.target.checked)} />
              💡 סעיף 122(ו): למשכיר דירה יחידה שגר בעצמו בשכירות או משלם על בית אבות
            </label>
            {eligible122f && (
              <div className="form-group" style={{ marginBottom: 0, marginTop: '.5rem', maxWidth: 300 }}>
                <label>שכ"ד שנתי שהמשכיר משלם בעד מגוריו ₪</label>
                <input type="number" min={0} value={rentPaid || ''} placeholder="0" onChange={e => setRentPaid(+e.target.value)} />
                <span style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>ניכוי במסלול 10% — עד 90,000 ₪ לשנה, לא מקרוב</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ויזואליזציה: הפטור המתקפל ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📐 מנגנון הפטור המתקפל — {year}</span>
          <span style={{ fontSize: '.8rem', color: 'var(--gray-500)' }}>
            תקרה: {fmt(m.ceiling)}/חודש · נקודת איפוס: {fmt(m.zeroPoint)}/חודש
          </span>
        </div>
        <div className="card-body">
          {/* פס אזורים */}
          <div style={{ position: 'relative', height: 62, marginBottom: '.5rem' }}>
            <div style={{ position: 'absolute', top: 22, left: 0, right: 0, height: 18, borderRadius: 9, overflow: 'hidden', display: 'flex', flexDirection: 'row-reverse' }}>
              <div style={{ width: `${pct(m.ceiling)}%`, background: '#86efac' }} title="פטור מלא" />
              <div style={{ width: `${pct(m.zeroPoint) - pct(m.ceiling)}%`, background: '#fde047' }} title="פטור חלקי" />
              <div style={{ flex: 1, background: '#fca5a5' }} title="אין פטור" />
            </div>
            {/* סמן שכ"ד נוכחי */}
            <div style={{ position: 'absolute', top: 0, right: `${pct(monthlyRent)}%`, transform: 'translateX(50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '.7rem', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--blue-dark)' }}>▼ {fmt(monthlyRent)}</div>
              <div style={{ width: 2, height: 44, background: 'var(--blue-dark)', margin: '0 auto' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--gray-500)', flexDirection: 'row-reverse' }}>
            <span>0</span>
            <span>🟢 פטור מלא עד {fmt(m.ceiling)}</span>
            <span>🟡 פטור חלקי</span>
            <span>🔴 אין פטור מ-{fmt(m.zeroPoint)}</span>
          </div>

          {m.zone === 'partial' && (
            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.5rem' }}>
              {[
                { label: 'חריגה מהתקרה', value: fmt(m.excess), color: '#b45309' },
                { label: 'הפטור בפועל (2×תקרה − שכ"ד)', value: fmt(m.adjustedExemption), color: '#15803d' },
                { label: 'חייב במס לחודש (2×החריגה)', value: fmt(m.taxableMonthly), color: '#b91c1c' },
                { label: 'חייב במס לשנה', value: fmt(m.taxableMonthly * 12), color: '#b91c1c' },
              ].map(c => (
                <div key={c.label} style={{ padding: '.55rem', background: 'var(--gray-50)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--gray-600)' }}>{c.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="alert alert-info" style={{ marginTop: '.75rem', marginBottom: 0, fontSize: '.83rem' }}>
            כל שקל חריגה מהתקרה מקטין את הפטור בשקל — כלומר מוסיף <strong>2 ₪</strong> להכנסה החייבת. זו הנקודה שהכי קשה להסביר ללקוחות, והגרף למעלה עושה את זה.
          </div>
        </div>
      </div>

      {/* ── השוואת מסלולים ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '.9rem' }}>
        {result.routes.map(r => {
          const isBest = r.key === result.recommendedKey;
          return (
            <div key={r.key} className="card" style={{
              border: isBest ? '2px solid #16a34a' : '1px solid var(--gray-200)',
              position: 'relative',
            }}>
              {isBest && (
                <div style={{
                  position: 'absolute', top: -12, right: 12, background: '#16a34a', color: 'white',
                  padding: '.15rem .7rem', borderRadius: 999, fontSize: '.72rem', fontWeight: 700,
                }}>
                  ✓ המס הנמוך ביותר
                </div>
              )}
              <div className="card-header">
                <span className="card-title" style={{ fontSize: '.95rem' }}>{r.title}</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: isBest ? '#15803d' : 'var(--gray-800)' }}>
                    {fmt(r.taxAnnual)}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--gray-500)' }}>
                    מס שנתי · {r.effectiveRatePct.toFixed(1)}% מהשכירות · חייב: {fmt(r.taxableAnnual)}
                  </div>
                </div>
                <details>
                  <summary style={{ cursor: 'pointer', fontSize: '.8rem', fontWeight: 600, color: 'var(--blue)' }}>איך חושב?</summary>
                  <ul style={{ paddingRight: '1rem', fontSize: '.75rem', color: 'var(--gray-600)', marginTop: '.3rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                    {r.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </details>
                <div style={{ fontSize: '.75rem' }}>
                  {r.pros.map((p, i) => <div key={i} style={{ color: '#15803d' }}>+ {p}</div>)}
                  {r.cons.map((c, i) => <div key={i} style={{ color: '#b45309' }}>− {c}</div>)}
                </div>
                {r.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '.72rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '.4rem .6rem', color: '#991b1b' }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── המלצה ואזהרות ── */}
      <div className="alert alert-info" style={{ marginBottom: 0 }}>
        <strong>שורה תחתונה:</strong> {result.recommendationNote}
      </div>
      {result.generalWarnings.map((w, i) => (
        <div key={i} className="alert alert-warning" style={{ marginBottom: 0, fontSize: '.85rem' }}>{w}</div>
      ))}
    </div>
  );
}

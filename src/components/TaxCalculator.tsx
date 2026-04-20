import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts';
import { Client, TaxCalcInput, TaxCalcResult, FamilyTaxResult, RentalTaxTrack } from '../types';
import { calculateTax, calcCreditPoints, calculateFamilyTax } from '../utils/taxCalculations';
import { getTaxYearData, AVAILABLE_YEARS } from '../data/taxData';

const fmt = (n: number) => n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
const fmtR = (n: number) => n.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

const IT_LABELS: Record<string, string> = {
  employee: 'שכיר', selfEmployed: 'עצמאי', both: 'שכיר + עצמאי',
  rentalOnly: 'שכירות', other: 'אחר',
};
const NI_LABELS: Record<string, string> = {
  employee: 'שכיר', selfEmployed: 'עצמאי', nonQualifying: 'שאינו עונה להגדרה',
  employeeAndSE: 'שכיר+עצמאי', passive: 'פסיבי', pensioner: 'פנסיונר',
};

const CHART_COLORS = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#db2777'];

function defaultInput(client: Client, year: number): TaxCalcInput {
  return {
    client, year,
    grossSalary: 0,
    employeePensionPct: client.employeePensionPct || 0,
    selfEmployedGrossIncome: 0,
    recognizedExpenses: 0,
    selfEmployedPensionAmount: 0,
    rentalIncome: 0,
    rentalExpenses: 0,
    rentalTaxTrack: 'exempt',
    otherIncome: 0,
    donationsSection46: 0,
    krenHashtalmutSE: client.krenHashtalmutMonthly ? client.krenHashtalmutMonthly * 12 : 0,
    overrideCreditPoints: false,
    manualCreditPoints: 0,
  };
}

interface Props { client: Client; onBack: () => void; }

export default function TaxCalculator({ client, onBack }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(Math.min(currentYear, Math.max(...AVAILABLE_YEARS)));
  const [input, setInput] = useState<TaxCalcInput>(() => defaultInput(client, year));
  const [calculated, setCalculated] = useState(false);
  const [showExplanation, setShowExplanation] = useState(true);

  const taxData = getTaxYearData(year);

  const result: TaxCalcResult | null = useMemo(() => {
    if (!taxData || !calculated) return null;
    return calculateTax({ ...input, year }, taxData);
  }, [input, year, taxData, calculated]);

  const familyResult: FamilyTaxResult | null = useMemo(() => {
    if (!taxData || !calculated) return null;
    return calculateFamilyTax({ ...input, year }, taxData);
  }, [input, year, taxData, calculated]);

  const hasSpouse = client.familyStatus === 'married' && client.spouse != null;
  const spouseResult = familyResult?.spouse ?? null;

  const previewCredits = useMemo(() => {
    if (!taxData) return [];
    if (input.overrideCreditPoints) return [];
    return calcCreditPoints(client, year, taxData.creditPointValue);
  }, [client, year, taxData, input.overrideCreditPoints]);

  function upd<K extends keyof TaxCalcInput>(k: K, v: TaxCalcInput[K]) {
    setInput(prev => ({ ...prev, [k]: v }));
    setCalculated(false);
  }

  function handleYearChange(y: number) {
    setYear(y);
    setInput(prev => ({ ...prev, year: y }));
    setCalculated(false);
  }

  const type = client.incomeTaxType;
  const showSalary = type === 'employee' || type === 'both';
  const showSE = type === 'selfEmployed' || type === 'both';
  const showRental = true;

  // ── Chart data ──────────────────────────────────────────────────────────
  const bracketChartData = result?.bracketLines.map(br => ({
    name: `${br.rate}%`,
    'הכנסה במדרגה': Math.round(br.taxableInBracket),
    'מס במדרגה': Math.round(br.taxInBracket),
  })) ?? [];

  const pieData = result ? [
    { name: 'מס הכנסה', value: Math.round(result.totalIncomeTax), color: '#2563eb' },
    { name: 'ביטוח לאומי', value: Math.round(result.niEmployee + result.niSelfEmployed), color: '#d97706' },
    { name: 'מס בריאות', value: Math.round(result.healthEmployee + result.healthSelfEmployed), color: '#7c3aed' },
    { name: 'נטו', value: Math.round(result.netAnnualIncome), color: '#059669' },
  ].filter(d => d.value > 0) : [];

  const niChartData = result ? (() => {
    const t60 = taxData!.niThreshold60Monthly * 12;
    const salary = input.grossSalary;
    const seNet = Math.max(0, input.selfEmployedGrossIncome - input.recognizedExpenses);
    const rows = [];
    if (salary > 0) {
      const low = Math.min(salary, t60);
      const high = Math.max(0, Math.min(salary, taxData!.niMaxIncomeMonthly * 12) - t60);
      if (low > 0) rows.push({ name: 'שכיר עד סף 60%', amount: Math.round(low), ni: Math.round(low * taxData!.employeeNI.lowRate / 100), pct: taxData!.employeeNI.lowRate });
      if (high > 0) rows.push({ name: 'שכיר מעל סף 60%', amount: Math.round(high), ni: Math.round(high * taxData!.employeeNI.highRate / 100), pct: taxData!.employeeNI.highRate });
    }
    if (seNet > 0 && (client.niType === 'selfEmployed' || client.niType === 'employeeAndSE')) {
      const alreadyInsured = client.niType === 'employeeAndSE' ? Math.min(salary, taxData!.niMaxIncomeMonthly * 12) : 0;
      const lowUsed = Math.min(alreadyInsured, t60);
      const lowAvail = Math.max(0, t60 - lowUsed);
      const seLow = Math.min(seNet, lowAvail);
      const seHigh = Math.max(0, Math.min(seNet, taxData!.niMaxIncomeMonthly * 12 - alreadyInsured) - seLow);
      if (seLow > 0) rows.push({ name: 'עצמאי עד סף 60%', amount: Math.round(seLow), ni: Math.round(seLow * taxData!.selfEmployedNI.lowRate / 100), pct: taxData!.selfEmployedNI.lowRate });
      if (seHigh > 0) rows.push({ name: 'עצמאי מעל סף 60%', amount: Math.round(seHigh), ni: Math.round(seHigh * taxData!.selfEmployedNI.highRate / 100), pct: taxData!.selfEmployedNI.highRate });
    }
    return rows;
  })() : [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginBottom: '.25rem' }}>
            <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={onBack}>← חזרה לפרטי לקוח</span>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>🧮 מחשבון מס — {client.firstName} {client.lastName}</h1>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)' }}>
            מ"ה: <strong>{IT_LABELS[type]}</strong> · ב"ל: <strong>{NI_LABELS[client.niType]}</strong>
            {client.gender === 'female' ? ' · נקבה' : ' · זכר'}
            {client.children.length > 0 ? ` · ${client.children.length} ילדים` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <label style={{ fontWeight: 600, color: 'var(--gray-700)' }}>שנת מס:</label>
          <select
            style={{ padding: '.4rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--gray-300)', fontWeight: 700, fontSize: '1rem', color: 'var(--blue)' }}
            value={year}
            onChange={e => handleYearChange(+e.target.value)}
          >
            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}{taxData?.isEstimated && y === year ? ' ★' : ''}</option>)}
          </select>
          {taxData?.isEstimated && <span className="badge badge-orange">מוערך</span>}
        </div>
      </div>

      {taxData?.isEstimated && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          ⚠️ נתוני שנת המס {year} הם הערכה — יש לאמת מול פרסומי רשות המיסים.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* ── LEFT: Inputs ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {showSalary && (
            <div className="card">
              <div className="card-header"><span className="card-title">💼 הכנסות משכר</span></div>
              <div className="card-body">
                <div className="form-group" style={{ marginBottom: '.75rem' }}>
                  <label>ברוטו שנתי ₪</label>
                  <input type="number" min={0} value={input.grossSalary || ''} onChange={e => upd('grossSalary', +e.target.value)} placeholder="0" />
                </div>
                <div className="form-group">
                  <label>% הפרשת עובד לפנסיה (לניכוי)</label>
                  <input type="number" min={0} max={7} step={0.5} value={input.employeePensionPct || ''} onChange={e => upd('employeePensionPct', +e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
          )}

          {showSE && (
            <div className="card">
              <div className="card-header"><span className="card-title">🏪 הכנסות מעסק</span></div>
              <div className="card-body">
                <div className="form-group" style={{ marginBottom: '.75rem' }}>
                  <label>ברוטו שנתי ₪</label>
                  <input type="number" min={0} value={input.selfEmployedGrossIncome || ''} onChange={e => upd('selfEmployedGrossIncome', +e.target.value)} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: '.75rem' }}>
                  <label>הוצאות מוכרות ₪</label>
                  <input type="number" min={0} value={input.recognizedExpenses || ''} onChange={e => upd('recognizedExpenses', +e.target.value)} placeholder="0" />
                </div>
                {input.selfEmployedGrossIncome > 0 && (
                  <div style={{ padding: '.4rem .75rem', background: 'var(--blue-light)', borderRadius: 'var(--radius)', fontSize: '.85rem', color: 'var(--blue-dark)', fontWeight: 600, marginBottom: '.75rem' }}>
                    נטו: ₪{fmt(Math.max(0, (input.selfEmployedGrossIncome || 0) - (input.recognizedExpenses || 0)))}
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: '.75rem' }}>
                  <label>הפקדה שנתית לפנסיה ₪</label>
                  <input type="number" min={0} value={input.selfEmployedPensionAmount || ''} onChange={e => upd('selfEmployedPensionAmount', +e.target.value)} placeholder="0" />
                </div>
                {client.hasKrenHashtalmut && (
                  <div className="form-group">
                    <label>הפקדה שנתית לקרן השתלמות ₪</label>
                    <input type="number" min={0} value={input.krenHashtalmutSE || ''} onChange={e => upd('krenHashtalmutSE', +e.target.value)} placeholder="0" />
                  </div>
                )}
              </div>
            </div>
          )}

          {showRental && (
            <div className="card">
              <div className="card-header"><span className="card-title">🏠 הכנסות שכירות</span></div>
              <div className="card-body">
                <div className="form-group" style={{ marginBottom: '.75rem' }}>
                  <label>ברוטו שנתי ₪</label>
                  <input type="number" min={0} value={input.rentalIncome || ''} onChange={e => upd('rentalIncome', +e.target.value)} placeholder="0" />
                </div>
                {input.rentalIncome > 0 && (
                  <>
                    <div className="form-group" style={{ marginBottom: '.75rem' }}>
                      <label>מסלול מיסוי</label>
                      <select value={input.rentalTaxTrack} onChange={e => upd('rentalTaxTrack', e.target.value as RentalTaxTrack)}>
                        <option value="exempt">פטור (עד תקרה)</option>
                        <option value="flat10">10% קבוע על ברוטו</option>
                        <option value="regular">מסלול רגיל + הוצאות</option>
                      </select>
                    </div>
                    {input.rentalTaxTrack === 'regular' && (
                      <div className="form-group">
                        <label>הוצאות מוכרות ₪</label>
                        <input type="number" min={0} value={input.rentalExpenses || ''} onChange={e => upd('rentalExpenses', +e.target.value)} placeholder="0" />
                      </div>
                    )}
                    {taxData && (
                      <div style={{ fontSize: '.78rem', color: 'var(--gray-500)', marginTop: '.5rem' }}>
                        תקרת פטור {year}: ₪{fmt(taxData.rentalExemptMonthly)}/חודש
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header"><span className="card-title">➕ הכנסות ונקודות נוספות</span></div>
            <div className="card-body">
              <div className="form-group" style={{ marginBottom: '.75rem' }}>
                <label>הכנסות אחרות ₪</label>
                <input type="number" min={0} value={input.otherIncome || ''} onChange={e => upd('otherIncome', +e.target.value)} placeholder="0" />
              </div>
              <div className="form-group" style={{ marginBottom: '.75rem' }}>
                <label>תרומות מוכרות (סעיף 46) ₪</label>
                <input type="number" min={0} value={input.donationsSection46 || ''} onChange={e => upd('donationsSection46', +e.target.value)} placeholder="0" />
              </div>
              <div className="form-group" style={{ marginBottom: '.5rem' }}>
                <label className="checkbox-row">
                  <input type="checkbox" checked={input.overrideCreditPoints} onChange={e => upd('overrideCreditPoints', e.target.checked)} />
                  הזנת נקודות זיכוי ידנית
                </label>
              </div>
              {input.overrideCreditPoints ? (
                <div className="form-group">
                  <label>נקודות זיכוי</label>
                  <input type="number" min={0} max={20} step={0.25} value={input.manualCreditPoints || ''} onChange={e => upd('manualCreditPoints', +e.target.value)} />
                </div>
              ) : (
                <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius)', padding: '.5rem .75rem' }}>
                  <div style={{ fontSize: '.78rem', color: 'var(--gray-600)', marginBottom: '.3rem', fontWeight: 600 }}>נקודות זיכוי מחושבות אוטומטית:</div>
                  {previewCredits.map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.775rem', padding: '.15rem 0', borderBottom: '1px solid var(--gray-100)' }}>
                      <span style={{ color: 'var(--gray-700)' }}>{l.description}</span>
                      <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{l.points}</span>
                    </div>
                  ))}
                  {previewCredits.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', fontWeight: 700, color: 'var(--blue-dark)', marginTop: '.3rem' }}>
                      <span>סה"כ</span>
                      <span>{previewCredits.reduce((s, l) => s + l.points, 0)} נקודות
                        {taxData && ` = ₪${fmt(Math.round(previewCredits.reduce((s, l) => s + l.points, 0) * taxData.creditPointValue))}`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button className="btn btn-primary btn-lg" onClick={() => setCalculated(true)} style={{ width: '100%', fontSize: '1rem', padding: '.85rem' }}>
            🧮 חשב חבות מס
          </button>
        </div>

        {/* ── RIGHT: Results ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!result ? (
            <div className="card">
              <div className="card-body">
                <div className="empty-state" style={{ padding: '4rem 1rem' }}>
                  <div className="empty-state-icon">🧮</div>
                  <div className="empty-state-title">הזן הכנסות ולחץ "חשב חבות מס"</div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div className="stats-grid">
                <div className="stat-card blue">
                  <div className="stat-label">מס הכנסה שנתי</div>
                  <div className="stat-value">₪{fmt(Math.round(result.totalIncomeTax))}</div>
                  <div className="stat-sub">אפקטיבי: {fmtR(result.effectiveIncomeTaxRate)} · שולי: {result.marginalRate}%</div>
                </div>
                <div className="stat-card orange">
                  <div className="stat-label">ביטוח לאומי + בריאות</div>
                  <div className="stat-value">₪{fmt(Math.round(result.totalNI))}</div>
                  <div className="stat-sub">ב"ל: ₪{fmt(Math.round(result.niEmployee + result.niSelfEmployed))} · בריאות: ₪{fmt(Math.round(result.healthEmployee + result.healthSelfEmployed))}</div>
                </div>
                <div className="stat-card red">
                  <div className="stat-label">סה"כ חבות מס</div>
                  <div className="stat-value">₪{fmt(Math.round(result.totalTaxBurden))}</div>
                  <div className="stat-sub">שיעור כולל: {fmtR(result.effectiveTotalRate)}</div>
                </div>
                <div className="stat-card green">
                  <div className="stat-label">הכנסה נטו לשנה</div>
                  <div className="stat-value">₪{fmt(Math.round(result.netAnnualIncome))}</div>
                  <div className="stat-sub">≈ ₪{fmt(Math.round(result.netAnnualIncome / 12))} לחודש</div>
                </div>
              </div>

              {/* Insights */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem' }}>
                <div className="stat-card blue" style={{ background: 'var(--blue-light)', borderColor: 'var(--blue-border)' }}>
                  <div className="stat-label">מס ללא זיכויים</div>
                  <div className="stat-value" style={{ fontSize: '1.1rem' }}>₪{fmt(Math.round(result.taxWithoutCredits))}</div>
                  <div className="stat-sub">חסכון מזיכויים: ₪{fmt(Math.round(result.totalCreditValue))}</div>
                </div>
                <div className="stat-card green" style={{ background: result.remainingFreeIncomeCapacity > 0 ? 'var(--green-light)' : 'var(--gray-50)', borderColor: result.remainingFreeIncomeCapacity > 0 ? '#a7f3d0' : 'var(--gray-200)' }}>
                  <div className="stat-label">פוטנציאל הכנסה ב-0% מס</div>
                  <div className="stat-value" style={{ fontSize: '1.1rem', color: result.remainingFreeIncomeCapacity > 0 ? 'var(--green)' : 'var(--gray-500)' }}>
                    {result.remainingFreeIncomeCapacity > 0 ? `₪${fmt(Math.round(result.remainingFreeIncomeCapacity))}` : '—'}
                  </div>
                  <div className="stat-sub">
                    {result.remainingFreeIncomeCapacity > 0
                      ? 'ניתן להרוויח עוד ללא מס הכנסה'
                      : 'כל הזיכויים מנוצלים'}
                  </div>
                </div>
                <div className="stat-card" style={{ background: 'var(--orange-light)', borderColor: '#fde68a' }}>
                  <div className="stat-label">מרחק למדרגה {result.nextBracketRate}%</div>
                  <div className="stat-value" style={{ fontSize: '1.1rem', color: 'var(--orange)' }}>
                    {result.distanceToNextBracket > 0 ? `₪${fmt(Math.round(result.distanceToNextBracket))}` : '—'}
                  </div>
                  <div className="stat-sub">
                    {result.distanceToNextBracket > 0 ? `עד שיעור ${result.nextBracketRate}%` : 'במדרגה העליונה'}
                  </div>
                </div>
              </div>

              {result.niDeductionFromIncomeTax > 0 && (
                <div className="alert alert-info">
                  💡 <strong>ניכוי ב"ל ממס הכנסה (סעיף 17(5)):</strong> 52% מהביטוח הלאומי העצמאי (₪{fmt(Math.round(result.niSelfEmployed))}) = <strong>₪{fmt(Math.round(result.niDeductionFromIncomeTax))}</strong> הופחתו מהכנסה החייבת → חיסכון במס הכנסה של ~₪{fmt(Math.round(result.niDeductionFromIncomeTax * result.marginalRate / 100))}.
                </div>
              )}

              <button className="btn btn-secondary" onClick={() => setShowExplanation(s => !s)} style={{ width: '100%' }}>
                {showExplanation ? '🔼 הסתר הסבר מלא' : '🔽 הצג הסבר מלא + גרפים'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── FULL EXPLANATION ─────────────────────────────────────────────────── */}
      {result && showExplanation && (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* PIE: income breakdown */}
          <div className="card">
            <div className="card-header"><span className="card-title">📊 חלוקת ההכנסה</span></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  {pieData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '.9rem' }}>{d.name}</span>
                      <span style={{ fontWeight: 700, color: d.color }}>₪{fmt(d.value)}</span>
                      <span style={{ fontSize: '.8rem', color: 'var(--gray-500)' }}>
                        ({result.grossIncome > 0 ? (d.value / result.grossIncome * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  ))}
                  <hr className="divider" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>סה"כ ברוטו</span>
                    <span>₪{fmt(Math.round(result.grossIncome))}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => `₪${fmt(v as number)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Deductions */}
          {result.deductionBreakdown.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">📉 ניכויים מהכנסה</span></div>
              <div className="card-body">
                <div className="explanation-block">
                  <ul>{result.deductionBreakdown.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  <div style={{ marginTop: '.75rem', fontWeight: 600, color: 'var(--blue-dark)' }}>
                    ניכויים כולל: ₪{fmt(Math.round(result.totalDeductions))} | הכנסה חייבת: ₪{fmt(Math.round(result.taxableIncome))}
                  </div>
                </div>
                {result.rentalExplanation && (
                  <div className="alert alert-info" style={{ marginTop: '.75rem' }}>🏠 {result.rentalExplanation}</div>
                )}
              </div>
            </div>
          )}

          {/* BAR: Tax brackets */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">📊 מדרגות מס הכנסה — {year}</span>
              <span style={{ fontSize: '.8125rem', color: 'var(--gray-500)' }}>הכנסה חייבת: ₪{fmt(Math.round(result.taxableIncome))}</span>
            </div>
            <div className="card-body">
              {bracketChartData.length > 0 && (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={bracketChartData} margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: unknown) => `₪${fmt(v as number)}`} />
                    <Legend />
                    <Bar dataKey="הכנסה במדרגה" fill="#bfdbfe">
                      {bracketChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length] + '55'} />)}
                    </Bar>
                    <Bar dataKey="מס במדרגה" fill="#2563eb">
                      {bracketChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      <LabelList dataKey="מס במדרגה" position="top" formatter={(v: unknown) => (v as number) > 0 ? `₪${fmt(v as number)}` : ''} style={{ fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="table-wrap" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>מדרגה (₪ שנתי)</th>
                      <th className="number">שיעור</th>
                      <th className="number">הכנסה במדרגה</th>
                      <th className="number">מס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.bracketLines.map((br, i) => (
                      <tr key={i}>
                        <td>{fmt(br.from)} – {br.to ? fmt(br.to) : 'ומעלה'}</td>
                        <td className="number">{br.rate}%</td>
                        <td className="number">₪{fmt(Math.round(br.taxableInBracket))}</td>
                        <td className="number">₪{fmt(Math.round(br.taxInBracket))}</td>
                      </tr>
                    ))}
                    <tr className="subtotal">
                      <td colSpan={2}>מס לפני ניכוי זיכויים</td>
                      <td className="number">₪{fmt(Math.round(result.taxableIncome))}</td>
                      <td className="number">₪{fmt(Math.round(result.taxBeforeCredit))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Credit points */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">⭐ נקודות זיכוי</span>
              {taxData && <span style={{ fontSize: '.8125rem', color: 'var(--gray-500)' }}>ערך נקודה {year}: ₪{fmt(taxData.creditPointValue)}/שנה</span>}
            </div>
            <div className="card-body">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>סיבה</th><th>סעיף</th><th className="number">נקודות</th><th className="number">זיכוי ₪</th></tr>
                  </thead>
                  <tbody>
                    {result.creditPointLines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.description}</td>
                        <td style={{ color: 'var(--gray-500)', fontSize: '.8rem' }}>{l.legalBasis}</td>
                        <td className="number">{l.points}</td>
                        <td className="number">₪{fmt(Math.round(l.valueNIS))}</td>
                      </tr>
                    ))}
                    <tr className="subtotal">
                      <td colSpan={2}>סה"כ נקודות זיכוי</td>
                      <td className="number">{result.totalCreditPoints}</td>
                      <td className="number">₪{fmt(Math.round(result.totalCreditValue))}</td>
                    </tr>
                    {result.donationCredit > 0 && (
                      <tr>
                        <td>זיכוי תרומות 35%</td>
                        <td style={{ fontSize: '.8rem' }}>סעיף 46</td>
                        <td className="number">—</td>
                        <td className="number">₪{fmt(Math.round(result.donationCredit))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'var(--blue-light)', borderRadius: 'var(--radius)', padding: '.75rem 1rem', marginTop: '.75rem', fontSize: '.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.3rem' }}>
                  <span>מס לפני זיכויים:</span><span style={{ fontWeight: 600 }}>₪{fmt(Math.round(result.taxBeforeCredit))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green)', marginBottom: '.3rem' }}>
                  <span>ניכוי נקודות זיכוי + תרומות:</span>
                  <span style={{ fontWeight: 600 }}>−₪{fmt(Math.round(result.totalCreditValue + result.donationCredit))}</span>
                </div>
                {result.surtax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red)', marginBottom: '.3rem' }}>
                    <span>היטל יסף 3% (מעל ₪{fmt(taxData?.surtaxThreshold ?? 0)}):</span>
                    <span style={{ fontWeight: 600 }}>+₪{fmt(Math.round(result.surtax))}</span>
                  </div>
                )}
                <hr style={{ margin: '.3rem 0', borderColor: 'var(--blue-border)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', color: 'var(--blue-dark)' }}>
                  <span>מס הכנסה סופי:</span><span>₪{fmt(Math.round(result.totalIncomeTax))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* BAR: National Insurance breakdown */}
          {niChartData.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">🏥 ביטוח לאומי — פירוט מדרגות</span></div>
              <div className="card-body">
                {taxData && (
                  <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.875rem' }}>
                    <strong>נתוני ב"ל {year}:</strong> שכר ממוצע ₪{fmt(taxData.niAverageWage)}/חודש ·
                    סף 60%: ₪{fmt(taxData.niThreshold60Monthly)}/חודש (₪{fmt(taxData.niThreshold60Monthly * 12)}/שנה) ·
                    תקרה: ₪{fmt(taxData.niMaxIncomeMonthly)}/חודש
                  </div>
                )}
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={niChartData} margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `₪${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: unknown) => `₪${fmt(v as number)}`} />
                    <Legend />
                    <Bar dataKey="amount" name="הכנסה מבוטחת" fill="#fde68a">
                      <LabelList dataKey="pct" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 11 }} />
                    </Bar>
                    <Bar dataKey="ni" name={'ב"ל לתשלום'} fill="#d97706">
                      <LabelList dataKey="ni" position="top" formatter={(v: unknown) => (v as number) > 0 ? `₪${fmt(v as number)}` : ''} style={{ fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="explanation-block" style={{ marginTop: '1rem' }}>
                  <ul>{result.niBreakdown.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>

                <div className="table-wrap" style={{ marginTop: '1rem' }}>
                  <table>
                    <thead>
                      <tr><th>סוג</th><th className="number">ב"ל</th><th className="number">מס בריאות</th><th className="number">סה"כ</th></tr>
                    </thead>
                    <tbody>
                      {(result.niEmployee > 0 || result.healthEmployee > 0) && (
                        <tr>
                          <td>שכיר</td>
                          <td className="number">₪{fmt(Math.round(result.niEmployee))}</td>
                          <td className="number">₪{fmt(Math.round(result.healthEmployee))}</td>
                          <td className="number">₪{fmt(Math.round(result.niEmployee + result.healthEmployee))}</td>
                        </tr>
                      )}
                      {(result.niSelfEmployed > 0 || result.healthSelfEmployed > 0) && (
                        <tr>
                          <td>עצמאי</td>
                          <td className="number">₪{fmt(Math.round(result.niSelfEmployed))}</td>
                          <td className="number">₪{fmt(Math.round(result.healthSelfEmployed))}</td>
                          <td className="number">₪{fmt(Math.round(result.niSelfEmployed + result.healthSelfEmployed))}</td>
                        </tr>
                      )}
                      <tr className="total">
                        <td>סה"כ</td>
                        <td className="number">₪{fmt(Math.round(result.niEmployee + result.niSelfEmployed))}</td>
                        <td className="number">₪{fmt(Math.round(result.healthEmployee + result.healthSelfEmployed))}</td>
                        <td className="number">₪{fmt(Math.round(result.totalNI))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Final summary */}
          <div className="card">
            <div className="card-header"><span className="card-title">📋 סיכום מלא</span></div>
            <div className="card-body">
              <div className="table-wrap">
                <table>
                  <tbody>
                    <tr><td>הכנסה ברוטו</td><td className="number">₪{fmt(Math.round(result.grossIncome))}</td></tr>
                    <tr><td>ניכויים מוכרים</td><td className="number" style={{ color: 'var(--green)' }}>−₪{fmt(Math.round(result.totalDeductions))}</td></tr>
                    <tr className="subtotal"><td>הכנסה חייבת</td><td className="number">₪{fmt(Math.round(result.taxableIncome))}</td></tr>
                    <tr><td>מס לפני זיכויים</td><td className="number">₪{fmt(Math.round(result.taxBeforeCredit))}</td></tr>
                    <tr><td>ניכוי נקודות זיכוי ({result.totalCreditPoints} נק')</td><td className="number" style={{ color: 'var(--green)' }}>−₪{fmt(Math.round(result.totalCreditValue))}</td></tr>
                    {result.surtax > 0 && <tr><td>היטל יסף 3%</td><td className="number">+₪{fmt(Math.round(result.surtax))}</td></tr>}
                    <tr><td>מס הכנסה</td><td className="number">₪{fmt(Math.round(result.totalIncomeTax))}</td></tr>
                    <tr><td>ביטוח לאומי + בריאות</td><td className="number">₪{fmt(Math.round(result.totalNI))}</td></tr>
                    <tr className="total"><td>סה"כ חבות מס</td><td className="number">₪{fmt(Math.round(result.totalTaxBurden))}</td></tr>
                    <tr><td>הכנסה נטו לשנה</td><td className="number" style={{ color: 'var(--green)', fontWeight: 700 }}>₪{fmt(Math.round(result.netAnnualIncome))}</td></tr>
                    <tr><td>≈ לחודש</td><td className="number" style={{ color: 'var(--green)' }}>₪{fmt(Math.round(result.netAnnualIncome / 12))}</td></tr>
                    <tr><td>שיעור מס הכנסה אפקטיבי</td><td className="number">{fmtR(result.effectiveIncomeTaxRate)}</td></tr>
                    <tr><td>שיעור מס שולי</td><td className="number">{result.marginalRate}%</td></tr>
                    <tr><td>שיעור מס כולל (כולל ב"ל)</td><td className="number" style={{ fontWeight: 700 }}>{fmtR(result.effectiveTotalRate)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ── Family unit summary ──────────────────────────────────────── */}
          {hasSpouse && familyResult && spouseResult && (
            <div className="card" style={{ border: '2px solid var(--purple)', borderRadius: 'var(--radius-lg)' }}>
              <div className="card-header" style={{ background: 'var(--purple-light)' }}>
                <span className="card-title" style={{ color: 'var(--purple)' }}>
                  {'\u{1F491}'} סיכום תא מ��פחתי — {client.firstName} + {client.spouse!.firstName}
                </span>
              </div>
              <div className="card-body">
                {/* Side by side comparison */}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th className="number">{client.firstName} {client.lastName}</th>
                        <th className="number">{client.spouse!.firstName} {client.spouse!.lastName}</th>
                        <th className="number" style={{ color: 'var(--purple)', fontWeight: 700 }}>תא משפחתי</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>הכנסה ברוטו</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(result.grossIncome))}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(spouseResult.grossIncome))}</td>
                        <td className="number" style={{ fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(familyResult.combinedGrossIncome))}</td>
                      </tr>
                      <tr>
                        <td>הכנסה חייבת</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(result.taxableIncome))}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(spouseResult.taxableIncome))}</td>
                        <td className="number" style={{ fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(result.taxableIncome + spouseResult.taxableIncome))}</td>
                      </tr>
                      <tr>
                        <td>נקודות זיכוי</td>
                        <td className="number">{result.totalCreditPoints.toFixed(1)}</td>
                        <td className="number">{spouseResult.totalCreditPoints.toFixed(1)}</td>
                        <td className="number" style={{ fontWeight: 700 }}>{(result.totalCreditPoints + spouseResult.totalCreditPoints).toFixed(1)}</td>
                      </tr>
                      <tr>
                        <td>מס הכנסה</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(result.totalIncomeTax))}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(spouseResult.totalIncomeTax))}</td>
                        <td className="number" style={{ fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(result.totalIncomeTax + spouseResult.totalIncomeTax))}</td>
                      </tr>
                      <tr>
                        <td>{`ביטוח לאומי + בריאות`}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(result.totalNI))}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(spouseResult.totalNI))}</td>
                        <td className="number" style={{ fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(result.totalNI + spouseResult.totalNI))}</td>
                      </tr>
                      {familyResult.combinedSurtax > 0 && (
                        <tr>
                          <td>היטל יסף 3% (תא משפחתי)</td>
                          <td className="number">{'\u20AA'}{fmt(Math.round(result.surtax))}</td>
                          <td className="number">{'\u20AA'}{fmt(Math.round(spouseResult.surtax))}</td>
                          <td className="number" style={{ fontWeight: 700, color: 'var(--red)' }}>{'\u20AA'}{fmt(Math.round(familyResult.combinedSurtax))}</td>
                        </tr>
                      )}
                      <tr className="total">
                        <td>{`סה"כ חבות מס`}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(result.totalTaxBurden))}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(spouseResult.totalTaxBurden))}</td>
                        <td className="number">{'\u20AA'}{fmt(Math.round(familyResult.combinedTaxBurden))}</td>
                      </tr>
                      <tr>
                        <td>הכנסה נטו לשנה</td>
                        <td className="number" style={{ color: 'var(--green)', fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(result.netAnnualIncome))}</td>
                        <td className="number" style={{ color: 'var(--green)', fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(spouseResult.netAnnualIncome))}</td>
                        <td className="number" style={{ color: 'var(--green)', fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(familyResult.combinedNetIncome))}</td>
                      </tr>
                      <tr>
                        <td>{'\u2248'} נטו לחודש</td>
                        <td className="number" style={{ color: 'var(--green)' }}>{'\u20AA'}{fmt(Math.round(result.netAnnualIncome / 12))}</td>
                        <td className="number" style={{ color: 'var(--green)' }}>{'\u20AA'}{fmt(Math.round(spouseResult.netAnnualIncome / 12))}</td>
                        <td className="number" style={{ color: 'var(--green)', fontWeight: 700 }}>{'\u20AA'}{fmt(Math.round(familyResult.combinedNetIncome / 12))}</td>
                      </tr>
                      <tr>
                        <td>שיעור מס אפקטיבי</td>
                        <td className="number">{fmtR(result.effectiveTotalRate)}</td>
                        <td className="number">{fmtR(spouseResult.effectiveTotalRate)}</td>
                        <td className="number" style={{ fontWeight: 700 }}>{fmtR(familyResult.combinedEffectiveRate)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Surtax note */}
                {familyResult.combinedSurtax > 0 && familyResult.surtaxSavingVsSeparate !== 0 && (
                  <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
                    {'\u2139\uFE0F'} היטל יסף: מחושב על הכנסת התא המשפחתי (סכום הכנסות שני בני הזוג).
                    {familyResult.surtaxSavingVsSeparate > 0 && (
                      <> חיסכון בחישוב משולב: <strong>{'\u20AA'}{fmt(Math.round(familyResult.surtaxSavingVsSeparate))}</strong></>
                    )}
                    {familyResult.surtaxSavingVsSeparate < 0 && (
                      <> תוספת בחישוב משולב: <strong>{'\u20AA'}{fmt(Math.round(Math.abs(familyResult.surtaxSavingVsSeparate)))}</strong></>
                    )}
                  </div>
                )}

                {/* Spouse credit points breakdown */}
                {spouseResult.creditPointLines.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontSize: '.875rem', fontWeight: 700, color: 'var(--gray-700)', marginBottom: '.5rem' }}>
                      {'\u2B50'} נקודות זיכוי — {client.spouse!.firstName}:
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>זיכוי</th>
                            <th>בסיס חוקי</th>
                            <th className="number">נקודות</th>
                            <th className="number">{`ערך (\u20AA)`}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {spouseResult.creditPointLines.map((l, i) => (
                            <tr key={i}>
                              <td>{l.description}</td>
                              <td style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{l.legalBasis}</td>
                              <td className="number">{l.points.toFixed(1)}</td>
                              <td className="number">{'\u20AA'}{fmt(Math.round(l.valueNIS))}</td>
                            </tr>
                          ))}
                          <tr className="total">
                            <td colSpan={2}>{`סה"כ`}</td>
                            <td className="number">{spouseResult.totalCreditPoints.toFixed(1)}</td>
                            <td className="number">{'\u20AA'}{fmt(Math.round(spouseResult.totalCreditValue))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="alert alert-warning">
            {'\u26A0\uFE0F'} חישוב זה הוא הערכה כללית בלבד ואינו מהווה ייעוץ מס. יש לאמת מול פרסומי רשות המיסים ומוסד הביטוח הלאומי.
          </div>
        </div>
      )}
    </div>
  );
}

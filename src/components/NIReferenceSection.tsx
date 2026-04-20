import { useState, useMemo } from 'react';
import { TaxYearData } from '../types';

const fmt = (n: number) => '\u20AA' + Math.round(n).toLocaleString('he-IL');
const fmtPct = (n: number) => n.toFixed(2) + '%';

// ─── Employer NI Rates — changed with Amendment 252 (Feb 2025) ──────────────
function getEmployerRates(year: number) {
  if (year >= 2025) return { niLow: 4.51, niHigh: 7.60, healthLow: 3.35, healthHigh: 5.17 };
  return { niLow: 3.55, niHigh: 7.60, healthLow: 3.35, healthHigh: 5.17 };
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const greenHeader: React.CSSProperties = {
  background: '#166534',
  color: 'white',
  padding: '8px 12px',
  fontWeight: 700,
  fontSize: '.8125rem',
  textAlign: 'right',
  borderBottom: '2px solid #14532d',
};

const greenSubHeader: React.CSSProperties = {
  background: '#15803d',
  color: 'white',
  padding: '6px 12px',
  fontWeight: 600,
  fontSize: '.8rem',
  textAlign: 'center',
  borderBottom: '1px solid #166534',
};

const cellStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '.85rem',
  textAlign: 'center',
  borderBottom: '1px solid var(--gray-200)',
};

const rowLabelStyle: React.CSSProperties = {
  ...cellStyle,
  textAlign: 'right',
  fontWeight: 600,
  background: 'var(--gray-50)',
};

const totalRowStyle: React.CSSProperties = {
  background: '#ecfdf5',
  fontWeight: 700,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid #166534',
  borderRadius: '8px',
  overflow: 'hidden',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 700,
  color: '#166534',
  marginBottom: '.75rem',
  paddingBottom: '.5rem',
  borderBottom: '2px solid #bbf7d0',
  display: 'flex',
  alignItems: 'center',
  gap: '.5rem',
};

const collapsibleHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  padding: '1rem 1.25rem',
  borderBottom: '1px solid var(--gray-100)',
  userSelect: 'none',
};

// ─── Axis Diagram Component ──────────────────────────────────────────────────
function AxisDiagram({ zones }: {
  zones: { from: number; to: number | null; label: string; color: string; rate?: string }[];
}) {
  const maxVal = zones.reduce((m, z) => Math.max(m, z.to ?? m), 0);
  return (
    <div style={{ margin: '1.25rem 0 .5rem', padding: '0 .5rem' }}>
      {/* Rate labels above the line */}
      <div style={{ display: 'flex', marginBottom: 6 }}>
        {zones.map((z, i) => {
          const width = z.to === null ? 15 : ((z.to - z.from) / maxVal) * 85;
          return (
            <div key={i} style={{
              flex: z.to === null ? '0 0 15%' : `0 0 ${width}%`,
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: '.8rem', fontWeight: 700,
                color: z.rate === '0%' || z.label === 'פטור' ? '#94a3b8' : '#1e293b',
              }}>
                {z.rate || '0%'}
              </div>
              <div style={{ fontSize: '.65rem', color: '#64748b', fontWeight: 500 }}>{z.label}</div>
            </div>
          );
        })}
      </div>
      {/* The line itself */}
      <div style={{ position: 'relative', height: 10 }}>
        <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 2, background: '#e2e8f0' }} />
        {zones.map((z, i) => {
          const width = z.to === null ? 15 : ((z.to - z.from) / maxVal) * 85;
          const left = z.to === null
            ? (zones.slice(0, i).reduce((s, zz) => s + (zz.to === null ? 15 : ((zz.to - zz.from) / maxVal) * 85), 0))
            : (zones.slice(0, i).reduce((s, zz) => s + (zz.to === null ? 15 : ((zz.to - zz.from) / maxVal) * 85), 0));
          const isExempt = z.rate === '0%' || z.label === 'פטור';
          return (
            <div key={i} style={{
              position: 'absolute', top: 1, left: `${left}%`, width: `${width}%`, height: 8,
              borderRadius: 4,
              background: isExempt ? '#f1f5f9' : `${z.color}20`,
              borderBottom: isExempt ? '2px solid #cbd5e1' : `3px solid ${z.color}`,
            }} />
          );
        })}
        {/* Tick marks at thresholds */}
        {zones.slice(0, -1).map((z, i) => {
          if (z.to === null) return null;
          const pos = zones.slice(0, i + 1).reduce((s, zz) => s + (zz.to === null ? 15 : ((zz.to - zz.from) / maxVal) * 85), 0);
          return (
            <div key={`tick-${i}`} style={{
              position: 'absolute', top: -2, left: `${pos}%`, width: 1, height: 14,
              background: '#94a3b8', transform: 'translateX(-0.5px)',
            }} />
          );
        })}
      </div>
      {/* Threshold labels below */}
      <div style={{ display: 'flex', marginTop: 6 }}>
        {zones.map((z, i) => {
          const width = z.to === null ? 15 : ((z.to - z.from) / maxVal) * 85;
          return (
            <div key={i} style={{
              flex: z.to === null ? '0 0 15%' : `0 0 ${width}%`,
              textAlign: 'center',
              fontSize: '.65rem', color: '#94a3b8',
            }}>
              {fmt(z.from)}{z.to ? ` – ${fmt(z.to)}` : '+'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Collapsible Info Section ────────────────────────────────────────────────
function InfoSection({ title, children, defaultOpen = false }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={collapsibleHeaderStyle} onClick={() => setOpen(!open)}>
        <span style={{ fontWeight: 600, fontSize: '.95rem', color: 'var(--gray-800)' }}>{title}</span>
        <span style={{ fontSize: '1.1rem', color: 'var(--gray-400)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          &#9660;
        </span>
      </div>
      {open && <div className="card-body" style={{ fontSize: '.875rem', lineHeight: 1.8, color: 'var(--gray-700)' }}>{children}</div>}
    </div>
  );
}

// ─── Calculator Types ────────────────────────────────────────────────────────
type CalcType = 'employee' | 'selfEmployed' | 'nonQualifying' | 'nonWorking' | 'combined' | 'employeeAndSE' | 'employeeAndNonQual';

interface CalcResult {
  ni: number;
  health: number;
  total: number;
  annual: number;
  steps: string[];
  deduction52?: number;
  employerNI: number;
  employerHealth: number;
}

// ─── Main Component ──────────────────────────────────────────────────────────
interface Props {
  taxData: TaxYearData;
  year: number;
}

export default function NIReferenceSection({ taxData, year }: Props) {
  // ── Derived thresholds ──
  const avgWage = taxData.niAverageWage;
  const threshold60 = taxData.niThreshold60Monthly;
  const maxIncome = taxData.niMaxIncomeMonthly;
  const threshold25 = Math.round(avgWage * 0.25);
  const threshold50 = Math.round(avgWage * 0.50);
  const minNI = taxData.nonQualifyingMonthlyNI;
  const employer = getEmployerRates(year);

  // ── Calculator state ──
  const [calcType, setCalcType] = useState<CalcType>('employee');
  const [incomeMode, setIncomeMode] = useState<'monthly' | 'annual'>('monthly');
  const [incomeInput, setIncomeInput] = useState(0);
  const [activeMonths, setActiveMonths] = useState(12);
  const [incomeModeSecondary, setIncomeModeSecondary] = useState<'monthly' | 'annual'>('monthly');
  const [secondaryInput, setSecondaryInput] = useState(0);

  // Derive monthly values from input
  const monthlyIncome = incomeMode === 'monthly' ? incomeInput : Math.round(incomeInput / 12);
  const passiveIncome = incomeModeSecondary === 'monthly' ? secondaryInput : Math.round(secondaryInput / 12);

  // ── NI Calculation Engine ──
  const calcResult: CalcResult | null = useMemo(() => {
    if (monthlyIncome <= 0 && passiveIncome <= 0) return null;

    const steps: string[] = [];
    let ni = 0;
    let health = 0;

    const calcEmployee = (income: number) => {
      let niCalc = 0, healthCalc = 0;
      const cappedIncome = Math.min(income, maxIncome);

      if (cappedIncome <= threshold60) {
        niCalc = cappedIncome * (taxData.employeeNI.lowRate / 100);
        healthCalc = cappedIncome * (taxData.employeeNI.healthLowRate / 100);
        steps.push(`הכנסה ${fmt(cappedIncome)} עד 60% מהשכר הממוצע: ב"ל ${fmtPct(taxData.employeeNI.lowRate)}, בריאות ${fmtPct(taxData.employeeNI.healthLowRate)}`);
      } else {
        const lowPart = threshold60;
        const highPart = cappedIncome - threshold60;
        niCalc = lowPart * (taxData.employeeNI.lowRate / 100) + highPart * (taxData.employeeNI.highRate / 100);
        healthCalc = lowPart * (taxData.employeeNI.healthLowRate / 100) + highPart * (taxData.employeeNI.healthHighRate / 100);
        steps.push(`חלק מופחת (עד ${fmt(threshold60)}): ב"ל ${fmtPct(taxData.employeeNI.lowRate)}, בריאות ${fmtPct(taxData.employeeNI.healthLowRate)}`);
        steps.push(`חלק מלא (${fmt(threshold60)} עד ${fmt(cappedIncome)}): ב"ל ${fmtPct(taxData.employeeNI.highRate)}, בריאות ${fmtPct(taxData.employeeNI.healthHighRate)}`);
      }
      if (income > maxIncome) {
        steps.push(`הכנסה מעל תקרה (${fmt(maxIncome)}) - לא חייבת בדמי ביטוח`);
      }
      return { ni: niCalc, health: healthCalc };
    };

    const calcSelfEmployed = (income: number) => {
      let niCalc = 0, healthCalc = 0;
      // מינימום הכנסה לעצמאי = 25% מהשכר הממוצע
      const effectiveIncome = Math.max(income, threshold25);
      const cappedIncome = Math.min(effectiveIncome, maxIncome);

      if (income > 0 && income < threshold25) {
        steps.push(`הכנסה ${fmt(income)} נמוכה מהמינימום (${fmt(threshold25)} = 25% משכר ממוצע) — חישוב לפי מינימום`);
      }

      if (cappedIncome <= threshold60) {
        niCalc = cappedIncome * (taxData.selfEmployedNI.lowRate / 100);
        healthCalc = cappedIncome * (taxData.selfEmployedNI.healthLowRate / 100);
        steps.push(`הכנסה ${fmt(cappedIncome)} עד 60% מהשכר הממוצע: ב"ל ${fmtPct(taxData.selfEmployedNI.lowRate)}, בריאות ${fmtPct(taxData.selfEmployedNI.healthLowRate)}`);
      } else {
        const lowPart = threshold60;
        const highPart = cappedIncome - threshold60;
        niCalc = lowPart * (taxData.selfEmployedNI.lowRate / 100) + highPart * (taxData.selfEmployedNI.highRate / 100);
        healthCalc = lowPart * (taxData.selfEmployedNI.healthLowRate / 100) + highPart * (taxData.selfEmployedNI.healthHighRate / 100);
        steps.push(`חלק מופחת (עד ${fmt(threshold60)}): ב"ל ${fmtPct(taxData.selfEmployedNI.lowRate)}, בריאות ${fmtPct(taxData.selfEmployedNI.healthLowRate)}`);
        steps.push(`חלק מלא (${fmt(threshold60)} עד ${fmt(cappedIncome)}): ב"ל ${fmtPct(taxData.selfEmployedNI.highRate)}, בריאות ${fmtPct(taxData.selfEmployedNI.healthHighRate)}`);
      }
      if (income > maxIncome) {
        steps.push(`הכנסה מעל תקרה (${fmt(maxIncome)}) - לא חייבת בדמי ביטוח`);
      }
      return { ni: niCalc, health: healthCalc };
    };

    const calcNonQualifying = (income: number) => {
      let niCalc = 0, healthCalc = 0;
      const cappedIncome = Math.min(income, maxIncome);

      if (cappedIncome <= threshold25) {
        steps.push(`הכנסה עד 25% מהשכר הממוצע (${fmt(threshold25)}) - פטור`);
        return { ni: 0, health: 0 };
      }

      if (cappedIncome <= threshold50) {
        const taxable = cappedIncome - threshold25;
        niCalc = taxable * (taxData.selfEmployedNI.lowRate / 100);
        healthCalc = taxable * (taxData.selfEmployedNI.healthLowRate / 100);
        steps.push(`הכנסה מ-${fmt(threshold25)} עד ${fmt(cappedIncome)}: שיעור מופחת`);
      } else {
        const lowPart = threshold50 - threshold25;
        const highPart = cappedIncome - threshold50;
        niCalc = lowPart * (taxData.selfEmployedNI.lowRate / 100) + highPart * (taxData.selfEmployedNI.highRate / 100);
        healthCalc = lowPart * (taxData.selfEmployedNI.healthLowRate / 100) + highPart * (taxData.selfEmployedNI.healthHighRate / 100);
        steps.push(`חלק מופחת (${fmt(threshold25)} עד ${fmt(threshold50)}): שיעור מופחת`);
        steps.push(`חלק מלא (${fmt(threshold50)} עד ${fmt(cappedIncome)}): שיעור מלא`);
      }
      return { ni: niCalc, health: healthCalc };
    };

    const calcPassive = (income: number) => {
      let niCalc = 0, healthCalc = 0;
      const cappedIncome = Math.min(income, maxIncome);

      if (cappedIncome <= threshold25) {
        steps.push(`הכנסה פסיבית עד 25% מהשכר הממוצע (${fmt(threshold25)}) - פטור`);
        return { ni: 0, health: 0 };
      }

      if (cappedIncome <= threshold60) {
        const taxable = cappedIncome - threshold25;
        niCalc = taxable * (taxData.selfEmployedNI.lowRate / 100);
        healthCalc = taxable * (taxData.selfEmployedNI.healthLowRate / 100);
        steps.push(`הכנסה פסיבית מ-${fmt(threshold25)} עד ${fmt(cappedIncome)}: שיעור מופחת`);
      } else {
        const lowPart = threshold60 - threshold25;
        const highPart = cappedIncome - threshold60;
        niCalc = lowPart * (taxData.selfEmployedNI.lowRate / 100) + highPart * (taxData.selfEmployedNI.highRate / 100);
        healthCalc = lowPart * (taxData.selfEmployedNI.healthLowRate / 100) + highPart * (taxData.selfEmployedNI.healthHighRate / 100);
        steps.push(`חלק מופחת (${fmt(threshold25)} עד ${fmt(threshold60)}): שיעור מופחת`);
        steps.push(`חלק מלא (${fmt(threshold60)} עד ${fmt(cappedIncome)}): שיעור מלא`);
      }
      return { ni: niCalc, health: healthCalc };
    };

    let deduction52 = 0;

    switch (calcType) {
      case 'employee': {
        const r = calcEmployee(monthlyIncome);
        ni = r.ni; health = r.health;
        break;
      }
      case 'selfEmployed': {
        const r = calcSelfEmployed(monthlyIncome);
        ni = r.ni; health = r.health;
        deduction52 = ni * 0.52;
        steps.push(`ניכוי 52% מדמי ביטוח לאומי: ${fmt(deduction52)} (ניתן לניכוי ממס הכנסה)`);
        break;
      }
      case 'nonQualifying': {
        const r = calcNonQualifying(monthlyIncome);
        ni = r.ni; health = r.health;
        if (ni + health < minNI && monthlyIncome > 0) {
          steps.push(`סכום מינימלי: ${fmt(minNI)} (גבוה מהחישוב)`);
          ni = minNI - health;
          if (ni < 0) { ni = 0; health = minNI; }
        }
        break;
      }
      case 'nonWorking': {
        const r = calcPassive(monthlyIncome);
        ni = r.ni; health = r.health;
        if (ni + health < minNI && monthlyIncome > 0) {
          steps.push(`סכום מינימלי: ${fmt(minNI)} (גבוה מהחישוב)`);
          ni = minNI - health;
          if (ni < 0) { ni = 0; health = minNI; }
        }
        break;
      }
      case 'combined': {
        steps.push('--- חישוב חלק שכיר ---');
        const empR = calcEmployee(monthlyIncome);
        steps.push('--- חישוב חלק פסיבי ---');
        const passR = calcPassive(passiveIncome);
        ni = empR.ni + passR.ni;
        health = empR.health + passR.health;
        steps.push(`סה"כ משולב: ב"ל ${fmt(ni)}, בריאות ${fmt(health)}`);
        break;
      }
      case 'employeeAndSE': {
        steps.push('--- חישוב חלק שכיר ---');
        const empPart = calcEmployee(monthlyIncome);
        steps.push('--- חישוב חלק עצמאי ---');
        // SE income fills remaining ceiling after employee
        const empCapped = Math.min(monthlyIncome, maxIncome);
        const remainingCeiling = Math.max(0, maxIncome - empCapped);
        const seEffective = Math.min(passiveIncome, remainingCeiling);
        if (seEffective <= 0 && passiveIncome > 0) {
          steps.push(`הכנסה עצמאית: הגיע לתקרת ב"ל (${fmt(maxIncome)}) מהשכר — אין תשלום נוסף`);
        }
        const sePart = seEffective > 0 ? calcSelfEmployed(seEffective) : { ni: 0, health: 0 };
        ni = empPart.ni + sePart.ni;
        health = empPart.health + sePart.health;
        deduction52 = sePart.ni * 0.52;
        if (deduction52 > 0) steps.push(`ניכוי 52% מב"ל עצמאי: ${fmt(deduction52)}`);
        steps.push(`סה"כ משולב: ב"ל ${fmt(ni)}, בריאות ${fmt(health)}`);
        break;
      }
      case 'employeeAndNonQual': {
        steps.push('--- חישוב חלק שכיר ---');
        const empPart2 = calcEmployee(monthlyIncome);
        steps.push('--- חישוב חלק עצמאי שלא עונה להגדרה ---');
        const nqPart = calcNonQualifying(passiveIncome);
        ni = empPart2.ni + nqPart.ni;
        health = empPart2.health + nqPart.health;
        steps.push(`סה"כ משולב: ב"ל ${fmt(ni)}, בריאות ${fmt(health)}`);
        break;
      }
    }

    const total = ni + health;
    const monthFactor = (calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : 12;
    const annual = total * monthFactor;

    // Employer portion (for display only)
    let employerNI = 0, employerHealth = 0;
    if (calcType === 'employee' || calcType === 'employeeAndSE' || calcType === 'employeeAndNonQual' || calcType === 'combined') {
      const cappedSalary = Math.min(monthlyIncome, maxIncome);
      const low = Math.min(cappedSalary, threshold60);
      const high = Math.max(0, cappedSalary - threshold60);
      employerNI = low * (employer.niLow / 100) + high * (employer.niHigh / 100);
      employerHealth = low * (employer.healthLow / 100) + high * (employer.healthHigh / 100);
    }

    return { ni, health, total, annual, steps, deduction52: deduction52 > 0 ? deduction52 : undefined, employerNI, employerHealth };
  }, [calcType, monthlyIncome, activeMonths, passiveIncome, taxData, threshold60, maxIncome, threshold25, threshold50, minNI]);

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div style={{ direction: 'rtl' }}>
      {/* ═══════════════ PART 1: Stat Cards ═══════════════ */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card blue">
          <div className="stat-label">שכר ממוצע חודשי</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(avgWage)}</div>
          <div className="stat-sub">{year}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">60% מהשכר הממוצע</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(threshold60)}</div>
          <div className="stat-sub">סף שיעור מופחת</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-label">הכנסה מרבית חייבת</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(maxIncome)}</div>
          <div className="stat-sub">תקרת ב"ל חודשית</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">מינימום עצמאי (חודשי)</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(Math.round(threshold25 * (taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate) / 100))}</div>
          <div className="stat-sub">על בסיס {fmt(threshold25)}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">מינימום לא-עובד (חודשי)</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{fmt(minNI)}</div>
          <div className="stat-sub">סכום קבוע</div>
        </div>
      </div>

      {/* ═══════════════ PART 2: Rate Tables ═══════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '2rem' }}>

        {/* ── A. שכיר ── */}
        <div className="card">
          <div className="card-body">
            <div style={sectionTitleStyle}>א. עובד שכיר</div>
            <div className="table-wrap">
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...greenHeader, width: '30%' }}></th>
                    <th style={greenSubHeader}>
                      עד 60% מהשכר הממוצע<br />(שיעור מופחת)
                    </th>
                    <th style={greenSubHeader}>
                      מעל 60% עד ההכנסה המרבית<br />(שיעור מלא)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={rowLabelStyle}>ב"ל - חלק עובד</td>
                    <td style={cellStyle}>{fmtPct(taxData.employeeNI.lowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.employeeNI.highRate)}</td>
                  </tr>
                  <tr>
                    <td style={rowLabelStyle}>ב"ל - חלק מעסיק</td>
                    <td style={cellStyle}>{fmtPct(employer.niLow)}</td>
                    <td style={cellStyle}>{fmtPct(employer.niHigh)}</td>
                  </tr>
                  <tr>
                    <td style={rowLabelStyle}>בריאות - חלק עובד</td>
                    <td style={cellStyle}>{fmtPct(taxData.employeeNI.healthLowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.employeeNI.healthHighRate)}</td>
                  </tr>
                  <tr>
                    <td style={rowLabelStyle}>בריאות - חלק מעסיק</td>
                    <td style={cellStyle}>{fmtPct(employer.healthLow)}</td>
                    <td style={cellStyle}>{fmtPct(employer.healthHigh)}</td>
                  </tr>
                  <tr style={totalRowStyle}>
                    <td style={{ ...rowLabelStyle, ...totalRowStyle }}>סה"כ חלק עובד</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.employeeNI.lowRate + taxData.employeeNI.healthLowRate)}</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.employeeNI.highRate + taxData.employeeNI.healthHighRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AxisDiagram zones={[
              { from: 0, to: threshold60, label: 'שיעור מופחת', color: '#3b82f6', rate: fmtPct(taxData.employeeNI.lowRate + taxData.employeeNI.healthLowRate) },
              { from: threshold60, to: maxIncome, label: 'שיעור מלא', color: '#d97706', rate: fmtPct(taxData.employeeNI.highRate + taxData.employeeNI.healthHighRate) },
              { from: maxIncome, to: null, label: 'פטור', color: '#cbd5e1' },
            ]} />
          </div>
        </div>

        {/* ── B. עצמאי ── */}
        <div className="card">
          <div className="card-body">
            <div style={sectionTitleStyle}>ב. עצמאי (עונה להגדרה)</div>
            <div className="table-wrap">
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...greenHeader, width: '30%' }}></th>
                    <th style={greenSubHeader}>
                      עד 60% מהשכר הממוצע<br />(שיעור מופחת)
                    </th>
                    <th style={greenSubHeader}>
                      מעל 60% עד ההכנסה המרבית<br />(שיעור מלא)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={rowLabelStyle}>דמי ביטוח לאומי</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.lowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.highRate)}</td>
                  </tr>
                  <tr>
                    <td style={rowLabelStyle}>דמי ביטוח בריאות</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.healthLowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.healthHighRate)}</td>
                  </tr>
                  <tr style={totalRowStyle}>
                    <td style={{ ...rowLabelStyle, ...totalRowStyle }}>סה"כ</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate)}</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.selfEmployedNI.highRate + taxData.selfEmployedNI.healthHighRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.75rem' }}>
              <div className="alert alert-warning" style={{ marginBottom: 0 }}>
                <strong>מינימום לעצמאי:</strong> הכנסה מינימלית לחישוב = {fmt(threshold25)} (25% מהשכר הממוצע).
                גם עצמאי שהכנסתו נמוכה יותר ישלם לפחות <strong>{fmt(Math.round(threshold25 * (taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate) / 100))}/חודש</strong>.
              </div>
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                <span>52% מדמי הביטוח הלאומי (ללא דמי בריאות) מוכרים כניכוי ממס הכנסה (סעיף 17(5))</span>
              </div>
            </div>
            <AxisDiagram zones={[
              { from: 0, to: threshold60, label: 'שיעור מופחת', color: '#3b82f6', rate: fmtPct(taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate) },
              { from: threshold60, to: maxIncome, label: 'שיעור מלא', color: '#d97706', rate: fmtPct(taxData.selfEmployedNI.highRate + taxData.selfEmployedNI.healthHighRate) },
              { from: maxIncome, to: null, label: 'פטור', color: '#cbd5e1' },
            ]} />
          </div>
        </div>

        {/* ── C. עצמאי שאינו עונה להגדרה ── */}
        <div className="card">
          <div className="card-body">
            <div style={sectionTitleStyle}>ג. עצמאי שאינו עונה להגדרה</div>
            <div className="table-wrap">
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...greenHeader, width: '25%' }}></th>
                    <th style={greenSubHeader}>
                      עד 25% מהשכר הממוצע<br />({fmt(threshold25)})
                    </th>
                    <th style={greenSubHeader}>
                      25% עד 50%<br />({fmt(threshold25)}-{fmt(threshold50)})
                    </th>
                    <th style={greenSubHeader}>
                      מעל 50% עד מרבית<br />({fmt(threshold50)}-{fmt(maxIncome)})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={rowLabelStyle}>דמי ביטוח לאומי</td>
                    <td style={cellStyle}>0%</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.lowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.highRate)}</td>
                  </tr>
                  <tr>
                    <td style={rowLabelStyle}>דמי ביטוח בריאות</td>
                    <td style={cellStyle}>0%</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.healthLowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.healthHighRate)}</td>
                  </tr>
                  <tr style={totalRowStyle}>
                    <td style={{ ...rowLabelStyle, ...totalRowStyle }}>סה"כ</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>0%</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate)}</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.selfEmployedNI.highRate + taxData.selfEmployedNI.healthHighRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="alert alert-warning" style={{ marginTop: '.75rem' }}>
              <span>תשלום מינימלי חודשי: {fmt(minNI)}</span>
            </div>
            <AxisDiagram zones={[
              { from: 0, to: threshold25, label: 'פטור', color: '#cbd5e1', rate: '0%' },
              { from: threshold25, to: threshold50, label: 'מופחת', color: '#3b82f6', rate: fmtPct(taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate) },
              { from: threshold50, to: maxIncome, label: 'מלא', color: '#d97706', rate: fmtPct(taxData.selfEmployedNI.highRate + taxData.selfEmployedNI.healthHighRate) },
              { from: maxIncome, to: null, label: 'פטור', color: '#cbd5e1' },
            ]} />
          </div>
        </div>

        {/* ── D. הכנסה שאינה מעבודה ── */}
        <div className="card">
          <div className="card-body">
            <div style={sectionTitleStyle}>ד. הכנסה שאינה מעבודה (פסיבית)</div>
            <div className="table-wrap">
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...greenHeader, width: '25%' }}></th>
                    <th style={greenSubHeader}>
                      עד 25% מהשכר הממוצע<br />({fmt(threshold25)})
                    </th>
                    <th style={greenSubHeader}>
                      25% עד 60%<br />({fmt(threshold25)}-{fmt(threshold60)})
                    </th>
                    <th style={greenSubHeader}>
                      מעל 60% עד מרבית<br />({fmt(threshold60)}-{fmt(maxIncome)})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={rowLabelStyle}>דמי ביטוח לאומי</td>
                    <td style={cellStyle}>0%</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.lowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.highRate)}</td>
                  </tr>
                  <tr>
                    <td style={rowLabelStyle}>דמי ביטוח בריאות</td>
                    <td style={cellStyle}>0%</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.healthLowRate)}</td>
                    <td style={cellStyle}>{fmtPct(taxData.selfEmployedNI.healthHighRate)}</td>
                  </tr>
                  <tr style={totalRowStyle}>
                    <td style={{ ...rowLabelStyle, ...totalRowStyle }}>סה"כ</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>0%</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate)}</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.selfEmployedNI.highRate + taxData.selfEmployedNI.healthHighRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
              <span>הכנסה פסיבית: שכ"ד, ריבית, דיבידנד, פנסיה מוקדמת ועוד</span>
            </div>
            <AxisDiagram zones={[
              { from: 0, to: threshold25, label: 'פטור', color: '#cbd5e1', rate: '0%' },
              { from: threshold25, to: threshold60, label: 'מופחת', color: '#3b82f6', rate: fmtPct(taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate) },
              { from: threshold60, to: maxIncome, label: 'מלא', color: '#d97706', rate: fmtPct(taxData.selfEmployedNI.highRate + taxData.selfEmployedNI.healthHighRate) },
              { from: maxIncome, to: null, label: 'פטור', color: '#cbd5e1' },
            ]} />
          </div>
        </div>
      </div>

      {/* ═══════════════ PART 3: NI Calculator ═══════════════ */}
      <div style={{
        marginBottom: '2rem',
        border: '2px solid #7c3aed',
        borderRadius: 12,
        background: 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)',
        overflow: 'hidden',
      }}>
        <div style={{
          background: '#7c3aed', color: 'white', padding: '.9rem 1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>🧮 מחשבון ביטוח לאומי — {year}</span>
          <span style={{
            background: 'rgba(255,255,255,.2)', padding: '.2rem .7rem',
            borderRadius: 20, fontSize: '.8rem', fontWeight: 600,
          }}>חישוב מיידי</span>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <div className="form-grid form-grid-3" style={{ marginBottom: '1.25rem' }}>
            <div className="form-group">
              <label style={{ fontWeight: 600 }}>סוג מבוטח</label>
              <select value={calcType} onChange={e => { setCalcType(e.target.value as CalcType); setSecondaryInput(0); }}>
                <option value="employee">שכיר</option>
                <option value="selfEmployed">עצמאי (עונה להגדרה)</option>
                <option value="nonQualifying">עצמאי (שאינו עונה להגדרה)</option>
                <option value="nonWorking">מי שאינו עובד</option>
                <option value="employeeAndSE">שכיר + עצמאי (עונה להגדרה)</option>
                <option value="employeeAndNonQual">שכיר + עצמאי (שאינו עונה להגדרה)</option>
                <option value="combined">שכיר + הכנסה פסיבית</option>
              </select>
            </div>
            <div className="form-group">
              <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                {calcType === 'employeeAndSE' || calcType === 'employeeAndNonQual' || calcType === 'combined'
                  ? 'הכנסה (שכיר) ₪' : 'הכנסה ₪'}
                <span style={{
                  display: 'inline-flex', borderRadius: 6, overflow: 'hidden',
                  border: '1px solid #cbd5e1', fontSize: '.7rem', fontWeight: 500,
                }}>
                  <button type="button" onClick={() => { if (incomeMode === 'annual') { setIncomeMode('monthly'); setIncomeInput(Math.round(incomeInput / 12)); } }}
                    style={{ padding: '.15rem .5rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: incomeMode === 'monthly' ? '#7c3aed' : 'white', color: incomeMode === 'monthly' ? 'white' : '#64748b' }}>
                    חודשי
                  </button>
                  <button type="button" onClick={() => { if (incomeMode === 'monthly') { setIncomeMode('annual'); setIncomeInput(incomeInput * 12); } }}
                    style={{ padding: '.15rem .5rem', border: 'none', borderRight: '1px solid #cbd5e1', cursor: 'pointer', fontFamily: 'inherit',
                      background: incomeMode === 'annual' ? '#7c3aed' : 'white', color: incomeMode === 'annual' ? 'white' : '#64748b' }}>
                    שנתי
                  </button>
                </span>
              </label>
              <input
                type="number" min={0}
                value={incomeInput || ''}
                onChange={e => setIncomeInput(Number(e.target.value) || 0)}
                placeholder="0"
                style={{ fontSize: '1.05rem' }}
              />
              {incomeInput > 0 && (
                <span style={{ fontSize: '.7rem', color: '#64748b' }}>
                  = {incomeMode === 'monthly' ? `${fmt(incomeInput * 12)}/שנה` : `${fmt(Math.round(incomeInput / 12))}/חודש`}
                </span>
              )}
            </div>
            {(calcType === 'selfEmployed' || calcType === 'nonQualifying') && (
              <div className="form-group">
                <label style={{ fontWeight: 600 }}>חודשי פעילות</label>
                <input
                  type="number" min={1} max={12}
                  value={activeMonths}
                  onChange={e => setActiveMonths(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
                />
              </div>
            )}
            {(calcType === 'combined' || calcType === 'employeeAndSE' || calcType === 'employeeAndNonQual') && (
              <div className="form-group">
                <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  {calcType === 'employeeAndSE' ? 'הכנסה עצמאית ₪'
                    : calcType === 'employeeAndNonQual' ? 'הכנסה (לא עונה להגדרה) ₪'
                    : 'הכנסה פסיבית ₪'}
                  <span style={{
                    display: 'inline-flex', borderRadius: 6, overflow: 'hidden',
                    border: '1px solid #cbd5e1', fontSize: '.7rem', fontWeight: 500,
                  }}>
                    <button type="button" onClick={() => { if (incomeModeSecondary === 'annual') { setIncomeModeSecondary('monthly'); setSecondaryInput(Math.round(secondaryInput / 12)); } }}
                      style={{ padding: '.15rem .5rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: incomeModeSecondary === 'monthly' ? '#7c3aed' : 'white', color: incomeModeSecondary === 'monthly' ? 'white' : '#64748b' }}>
                      חודשי
                    </button>
                    <button type="button" onClick={() => { if (incomeModeSecondary === 'monthly') { setIncomeModeSecondary('annual'); setSecondaryInput(secondaryInput * 12); } }}
                      style={{ padding: '.15rem .5rem', border: 'none', borderRight: '1px solid #cbd5e1', cursor: 'pointer', fontFamily: 'inherit',
                        background: incomeModeSecondary === 'annual' ? '#7c3aed' : 'white', color: incomeModeSecondary === 'annual' ? 'white' : '#64748b' }}>
                      שנתי
                    </button>
                  </span>
                </label>
                <input
                  type="number" min={0}
                  value={secondaryInput || ''}
                  onChange={e => setSecondaryInput(Number(e.target.value) || 0)}
                  placeholder="0"
                />
                {secondaryInput > 0 && (
                  <span style={{ fontSize: '.7rem', color: '#64748b' }}>
                    = {incomeModeSecondary === 'monthly' ? `${fmt(secondaryInput * 12)}/שנה` : `${fmt(Math.round(secondaryInput / 12))}/חודש`}
                  </span>
                )}
              </div>
            )}
          </div>

          {calcResult && (
            <div>
              {/* Results table */}
              <div style={{
                background: 'white', borderRadius: 8, overflow: 'hidden',
                border: '1px solid #e2e8f0', marginBottom: '1rem',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'right', fontWeight: 600 }}></th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontWeight: 600 }}>ביטוח לאומי</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontWeight: 600 }}>מס בריאות</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontWeight: 700 }}>סה"כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '.5rem .75rem', fontWeight: 600 }}>חודשי (חלק עובד)</td>
                      <td style={{ padding: '.5rem .75rem', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>{fmt(calcResult.ni)}</td>
                      <td style={{ padding: '.5rem .75rem', textAlign: 'center', fontWeight: 700, color: '#0891b2' }}>{fmt(calcResult.health)}</td>
                      <td style={{ padding: '.5rem .75rem', textAlign: 'center', fontWeight: 700, color: '#7c3aed', fontSize: '1rem' }}>{fmt(calcResult.total)}</td>
                    </tr>
                    {(calcResult.employerNI > 0 || calcResult.employerHealth > 0) && (
                      <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 500, color: '#64748b' }}>חודשי (חלק מעסיק)</td>
                        <td style={{ padding: '.5rem .75rem', textAlign: 'center', color: '#64748b' }}>{fmt(calcResult.employerNI)}</td>
                        <td style={{ padding: '.5rem .75rem', textAlign: 'center', color: '#64748b' }}>{fmt(calcResult.employerHealth)}</td>
                        <td style={{ padding: '.5rem .75rem', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{fmt(calcResult.employerNI + calcResult.employerHealth)}</td>
                      </tr>
                    )}
                    <tr style={{ background: '#f0f9ff', fontWeight: 700 }}>
                      <td style={{ padding: '.6rem .75rem' }}>שנתי (עובד × {(calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : 12})</td>
                      <td style={{ padding: '.6rem .75rem', textAlign: 'center', color: '#2563eb' }}>{fmt(calcResult.ni * ((calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : 12))}</td>
                      <td style={{ padding: '.6rem .75rem', textAlign: 'center', color: '#0891b2' }}>{fmt(calcResult.health * ((calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : 12))}</td>
                      <td style={{ padding: '.6rem .75rem', textAlign: 'center', color: '#7c3aed', fontSize: '1.05rem' }}>{fmt(calcResult.annual)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 52% deduction highlight */}
              {calcResult.deduction52 !== undefined && (
                <div style={{
                  background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8,
                  padding: '.75rem 1rem', marginBottom: '.75rem', fontSize: '.875rem',
                }}>
                  <strong style={{ color: '#166534' }}>ניכוי 52% מב"ל:</strong> {fmt(calcResult.deduction52)}/חודש | {fmt(calcResult.deduction52 * ((calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : 12))}/שנה — ניתן לניכוי ממס הכנסה (סעיף 17(5))
                </div>
              )}

              {/* Steps */}
              {calcResult.steps.length > 0 && (
                <details style={{ marginTop: '.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '.85rem', fontWeight: 600, color: '#475569' }}>
                    פירוט החישוב ({calcResult.steps.length} שלבים)
                  </summary>
                  <div className="explanation-block" style={{ marginTop: '.5rem' }}>
                    <ul>
                      {calcResult.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ PART 4: Reference Information ═══════════════ */}

      <InfoSection title="1. הגדרת עצמאי לצורכי ביטוח לאומי" defaultOpen>
        <p style={{ marginBottom: '.75rem' }}>עובד עצמאי מוגדר בחוק הביטוח הלאומי כמי שעונה על אחד מהתנאים הבאים:</p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li><strong>תנאי א':</strong> מי שעוסק במשלח ידו 20 שעות בשבוע לפחות בממוצע</li>
          <li><strong>תנאי ב':</strong> הכנסתו החודשית ממשלח ידו עולה על 50% מהשכר הממוצע ({fmt(avgWage * 0.5)})</li>
          <li><strong>תנאי ג':</strong> מי שעוסק במשלח ידו 12 שעות בשבוע לפחות בממוצע, והכנסתו ממשלח ידו עולה על 15% מהשכר הממוצע ({fmt(avgWage * 0.15)})</li>
        </ul>
        <p>מי שלא עונה לאף אחד מהתנאים הנ"ל מסווג כ"עצמאי שאינו עונה להגדרה" ומשלם שיעורים שונים.</p>
      </InfoSection>

      <InfoSection title="2. מבוטח שאינו עובד שכיר ואינו עובד עצמאי">
        <p style={{ marginBottom: '.75rem' }}>
          מבוטח שאינו עובד שכיר ואינו עונה להגדרת "עובד עצמאי" חייב בתשלום דמי ביטוח מינימליים.
        </p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li>התשלום המינימלי החודשי: <strong>{fmt(minNI)}</strong></li>
          <li>התשלום כולל דמי ביטוח לאומי ודמי ביטוח בריאות</li>
          <li>חובת תשלום חלה גם על מי שאין לו הכנסה כלל (אלא אם קיים פטור כגון עקרת בית)</li>
          <li>דוגמאות: סטודנט, מובטל, אדם שאינו עובד, בעל הכנסות פסיביות בלבד</li>
        </ul>
      </InfoSection>

      <InfoSection title="3. הכנסות שאינן חייבות בדמי ביטוח (סעיף 350)">
        <p style={{ marginBottom: '.75rem' }}>הכנסות הפטורות מדמי ביטוח לאומי לפי סעיף 350(א) לחוק:</p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li><strong>דיבידנד:</strong> הכנסה מדיבידנד לפי סעיף 125ב לפקודה (דיבידנד בשיעור מס מוגבל) - פטורה מדמי ביטוח</li>
          <li><strong>רווח הון:</strong> רווח הון ממכירת ני"ע, נכסים ועוד - פטור מדמי ביטוח</li>
          <li><strong>ריבית:</strong> הכנסה מריבית לפי סעיף 125ג לפקודה (ריבית בשיעור מס מוגבל) - פטורה מדמי ביטוח</li>
          <li><strong>שכירות פטורה:</strong> הכנסה משכ"ד למגורים לפי סעיף 122 (מסלול פטור) - פטורה מדמי ביטוח עד תקרת הפטור ({fmt(taxData.rentalExemptMonthly)}/חודש)</li>
          <li><strong>שכירות 10%:</strong> הכנסה משכ"ד למגורים במסלול 10% - פטורה מדמי ביטוח</li>
          <li><strong>קצבאות ביטוח לאומי:</strong> קצבת זקנה, שאירים, נכות ועוד - פטורות</li>
        </ul>
        <div className="alert alert-warning">
          <span>שימו לב: הכנסות שאינן פטורות לפי סעיף 350 חייבות בדמי ביטוח גם אם הן "פסיביות" - למשל שכ"ד במסלול רגיל, פנסיה מוקדמת, תמלוגים.</span>
        </div>
      </InfoSection>

      <InfoSection title="4. סדר חיוב בהכנסות מעורבות">
        <p style={{ marginBottom: '.75rem' }}>
          כאשר למבוטח מספר סוגי הכנסות, החיוב בדמי ביטוח נעשה לפי סדר עדיפויות:
        </p>
        <ol style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li><strong>הכנסה כשכיר</strong> - נגבית ראשונה, על ידי המעסיק</li>
          <li><strong>הכנסה כעצמאי</strong> - נגבית שנית, מעל ההכנסה כשכיר</li>
          <li><strong>הכנסה שלא מעבודה</strong> - נגבית שלישית (שכ"ד במסלול רגיל, תמלוגים וכד')</li>
          <li><strong>הכנסה מפנסיה מוקדמת</strong> - נגבית אחרונה</li>
        </ol>
        <div className="alert alert-info">
          <span>
            תקרת ההכנסה המרבית החייבת ({fmt(maxIncome)}/חודש) היא תקרה משולבת לכל סוגי ההכנסות יחד.
            כלומר, אם הכנסתך כשכיר כבר הגיעה לתקרה - לא תשלם דמי ביטוח על הכנסות נוספות.
          </span>
        </div>
      </InfoSection>

      <InfoSection title="5. ניכוי 52% מדמי ביטוח לאומי לעצמאי">
        <p style={{ marginBottom: '.75rem' }}>
          עצמאי זכאי לנכות 52% מדמי הביטוח הלאומי ששילם (ללא דמי ביטוח בריאות) כהוצאה מוכרת לצורכי מס הכנסה.
        </p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li>הניכוי חל רק על החלק של דמי ביטוח לאומי (לא כולל דמי בריאות)</li>
          <li>הניכוי מקטין את ההכנסה החייבת לצורכי מס הכנסה</li>
          <li>למעשה, אם שיעור המס השולי הוא 47%, החיסכון בפועל הוא 52% * 47% = כ-24.4% מדמי הב"ל</li>
          <li>הניכוי מתבצע בדו"ח השנתי (מקדמות לא מביאות זאת בחשבון)</li>
        </ul>
        <div style={{ background: 'var(--green-light)', padding: '.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid #a7f3d0' }}>
          <strong>דוגמה:</strong> עצמאי ששילם {fmt(1000)} דמי ב"ל בחודש, יכול לנכות {fmt(520)} מההכנסה החייבת.
          בשיעור מס שולי 47%, החיסכון: {fmt(244)} בחודש.
        </div>
      </InfoSection>

      <InfoSection title="6. מעמד תושבות וביטוח לאומי">
        <p style={{ marginBottom: '.75rem' }}>
          תושב ישראל חייב בתשלום דמי ביטוח לאומי ודמי בריאות גם אם הוא שוהה בחו"ל.
        </p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li><strong>שהייה מעל שנתיים:</strong> ניתן לאבד מעמד תושבות לצורכי ביטוח לאומי. המוסד לביטוח לאומי בוחן את מרכז החיים</li>
          <li><strong>שהייה מעל 5 שנים:</strong> בדיקה מעמיקה יותר של מעמד התושבות</li>
          <li><strong>חזרה לישראל:</strong> מי שאיבד תושבות ומבקש לחזור לביטוח בריאות עשוי להידרש לתקופת המתנה ותשלום רטרואקטיבי</li>
          <li><strong>תשלום בחו"ל:</strong> תושב ישראל השוהה בחו"ל וממשיך לשלם דמי ביטוח - שומר על זכויותיו</li>
        </ul>
      </InfoSection>

      <InfoSection title='7. עקרת/עקר בית - פטור מדמי ביטוח'>
        <p style={{ marginBottom: '.75rem' }}>
          לפי סעיפים 342, 351, 335 לחוק הביטוח הלאומי:
        </p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li>אישה נשואה שאינה עובדת כשכירה ואינה עצמאית - פטורה מדמי ביטוח לאומי</li>
          <li>הפטור חל גם על דמי ביטוח בריאות (בן/בת הזוג משלמ/ת עבורה)</li>
          <li>אם יש לה הכנסה פסיבית (שכ"ד, ריבית) - עדיין חל הפטור כל עוד ההכנסה אינה מעבודה</li>
          <li>חשוב: הפטור חל רק על מי שבן/בת הזוג תושב/ת ישראל ומבוטח/ת בביטוח לאומי</li>
        </ul>
        <div className="alert alert-info">
          <span>
            פסיקה עדכנית: בתי הדין הרחיבו את הפטור גם לגברים ("עקר בית") בנסיבות דומות, בהתאם לעקרון השוויון.
          </span>
        </div>
      </InfoSection>

      <InfoSection title="8. גיל פרישה וזכאות">
        <p style={{ marginBottom: '.75rem' }}>
          גיל הפרישה וגיל הזכאות משפיעים על חובת תשלום דמי ביטוח:
        </p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li><strong>עד גיל 18:</strong> פטור מדמי ביטוח. אם עובד כשכיר - המעסיק משלם חלקו בלבד</li>
          <li><strong>גיל 18 עד גיל פרישה:</strong> חובת תשלום מלאה (גיל פרישה: 67 לגברים, 65 לנשים בשנת 2026)</li>
          <li><strong>גיל פרישה עד גיל זכאות:</strong> שיעורים מופחתים, פטור על הכנסות שאינן מעבודה עד לתקרה</li>
          <li><strong>מעל גיל זכאות (70):</strong> פטור מדמי ביטוח לאומי. חובת דמי בריאות בלבד (על הכנסה מעבודה)</li>
        </ul>
        <div className="table-wrap" style={{ marginTop: '.75rem' }}>
          <table style={{ ...tableStyle, border: '1px solid var(--gray-300)' }}>
            <thead>
              <tr>
                <th style={{ ...greenHeader, background: 'var(--blue)' }}>קבוצת גיל</th>
                <th style={{ ...greenHeader, background: 'var(--blue)' }}>ביטוח לאומי</th>
                <th style={{ ...greenHeader, background: 'var(--blue)' }}>ביטוח בריאות</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={rowLabelStyle}>עד 18</td>
                <td style={cellStyle}>פטור</td>
                <td style={cellStyle}>פטור</td>
              </tr>
              <tr>
                <td style={rowLabelStyle}>18 - גיל פרישה</td>
                <td style={cellStyle}>חובה</td>
                <td style={cellStyle}>חובה</td>
              </tr>
              <tr>
                <td style={rowLabelStyle}>פרישה - זכאות</td>
                <td style={cellStyle}>מופחת / פטור חלקי</td>
                <td style={cellStyle}>חובה</td>
              </tr>
              <tr>
                <td style={rowLabelStyle}>מעל גיל זכאות (70)</td>
                <td style={cellStyle}>פטור</td>
                <td style={cellStyle}>חובה (מעבודה בלבד)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </InfoSection>

      <InfoSection title="9. דמי לידה לעצמאית">
        <p style={{ marginBottom: '.75rem' }}>
          עצמאית הזכאית לדמי לידה מחושבת לפי השכר הגבוה מבין:
        </p>
        <ul style={{ paddingRight: '1.5rem', marginBottom: '.75rem' }}>
          <li><strong>שנת הלידה:</strong> הכנסה חייבת בדמי ביטוח ב-3 החודשים שקדמו ללידה (חלקי 3)</li>
          <li><strong>השנה הקודמת:</strong> הכנסה חייבת בדמי ביטוח ב-12 החודשים שקדמו ל-3 החודשים האחרונים (חלקי 12)</li>
        </ul>
        <div style={{ background: 'var(--blue-light)', padding: '.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--blue-border)' }}>
          <strong>טיפ מקסום:</strong> ניתן להגדיל את דמי הלידה על ידי הגדלת המקדמות לביטוח לאומי ב-3 החודשים שלפני הלידה.
          המוסד לביטוח לאומי יחשב לפי הגבוה מבין שתי התקופות, כך שהגדלה זמנית לא תפגע.
          יש לוודא שהמקדמות משולמות בזמן ושההכנסה המדווחת תואמת.
        </div>
      </InfoSection>
    </div>
  );
}

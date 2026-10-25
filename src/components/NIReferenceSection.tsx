import { useState, useMemo } from 'react';
import { TaxYearData } from '../types';
import { AVAILABLE } from '../features/taxKnowledge/availability';

const fmt = (n: number) => Math.round(n).toLocaleString('he-IL') + ' ₪';
const fmtPct = (n: number) => n.toFixed(2) + '%';

// ─── Employer NI Rates — changed with Amendment 252 (Feb 2025) ──────────────
function getEmployerRates(year: number) {
  if (year >= 2025) return { niLow: 4.51, niHigh: 7.60, healthLow: 0, healthHigh: 0 };
  return { niLow: 3.55, niHigh: 7.60, healthLow: 0, healthHigh: 0 };
}

// ─── Styles ──────────────────────────────────────────────────────────────────
// המסך הזה נבנה בירוק משלו — ראשי טבלה ירוקים מלאים, מסגרות ירוקות וכותרות
// ירוקות. ירוק אינו מידע כאן: אין שום שיעור ביטוח לאומי שהוא "טוב" או "רע".
// לכן הכרומה כולה יורדת לדיו ולקווי שערה, והמספרים נשארים הדבר היחיד שנקרא.
const greenHeader: React.CSSProperties = {
  padding: '8px 12px 6px',
  fontWeight: 500,
  fontSize: 'var(--fs-12)',
  color: 'var(--ink-4)',
  letterSpacing: '.02em',
  textAlign: 'right',
  borderBottom: '1px solid var(--hairline-1)',
};

const greenSubHeader: React.CSSProperties = {
  padding: '6px 12px',
  // ‼ כותרות המדרגות נשברות לשורות: ב-th הכללי יש nowrap, והטבלה (459px) לא נכנסה לטלפון.
  whiteSpace: 'normal',
  fontWeight: 500,
  fontSize: 'var(--fs-12)',
  color: 'var(--ink-4)',
  textAlign: 'center',
  borderBottom: '1px solid var(--hairline-1)',
};

const cellStyle: React.CSSProperties = {
  padding: '7px 12px',
  fontSize: 'var(--fs-13)',
  textAlign: 'center',
  borderBottom: '1px solid var(--hairline-2)',
  fontVariantNumeric: 'tabular-nums',
};

const rowLabelStyle: React.CSSProperties = {
  ...cellStyle,
  textAlign: 'right',
  fontWeight: 500,
  color: 'var(--ink-1)',
};

// שורת הסיכום מסומנת במשקל ובקו — לא ברקע צבוע
const totalRowStyle: React.CSSProperties = {
  fontWeight: 600,
  borderTop: '1px solid var(--hairline-1)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 'var(--fs-17)',
  fontWeight: 600,
  color: 'var(--ink-1)',
  letterSpacing: '-.015em',
  marginBottom: '.7rem',
  paddingBottom: '.4rem',
  borderBottom: '1px solid var(--hairline-1)',
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
    <div className="ni-axis" style={{ margin: '1.25rem 0 .5rem', padding: '0 .5rem' }}>
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
                fontSize: 'var(--fs-13)', fontWeight: 600,
                color: z.rate === '0%' || z.label === 'פטור' ? 'var(--tx3)' : 'var(--tx)',
              }}>
                {z.rate || '0%'}
              </div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--tx2)', fontWeight: 500 }}>{z.label}</div>
            </div>
          );
        })}
      </div>
      {/* The line itself */}
      <div style={{ position: 'relative', height: 10 }}>
        <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 2, background: 'var(--bd)' }} />
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
              background: isExempt ? 'var(--s2)' : `${z.color}20`,
              borderBottom: isExempt ? '2px solid var(--bd-strong)' : `3px solid ${z.color}`,
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
              background: 'var(--tx3)', transform: 'translateX(-0.5px)',
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
              fontSize: 'var(--fs-12)', color: 'var(--tx3)',
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
      <button type="button" aria-expanded={open} className="ni-disclosure-toggle" style={{ ...collapsibleHeaderStyle, width: "100%", border: 0, borderRadius: 0, textAlign: "right" }} onClick={() => setOpen(!open)}>
        <span style={{ fontWeight: 600, fontSize: 'var(--fs-15)', color: 'var(--gray-800)' }}>{title}</span>
        <span style={{ fontSize: 'var(--fs-17)', color: 'var(--gray-400)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          &#9660;
        </span>
      </button>
      {open && <div className="card-body" style={{ fontSize: 'var(--fs-14)', lineHeight: 1.8, color: 'var(--gray-700)' }}>{children}</div>}
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

export default function NIReferenceSection({ taxData: incomingData, year }: Props) {
 const [healthPeriod,setHealthPeriod]=useState('feb');
 const isJan2025=year===2025&&healthPeriod==='jan';
 const taxData={...incomingData, employeeNI:{...incomingData.employeeNI,healthHighRate:isJan2025?5.16:5.17},selfEmployedNI:{...incomingData.selfEmployedNI,healthHighRate:isJan2025?5.16:5.17},passiveNI:{...incomingData.passiveNI,healthLowRate:isJan2025?5.16:5.17,healthHighRate:isJan2025?5.16:5.17}};
 const periodMonths=year===2025?(isJan2025?1:11):12;
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
    if (['combined','employeeAndSE','employeeAndNonQual'].includes(calcType)) return null;
    if (monthlyIncome <= 0 && passiveIncome <= 0 && calcType!=='nonWorking' && calcType!=='nonQualifying') return null;

    const steps: string[] = [];
    let ni = 0;
    let health = 0;

    const calcEmployee = (income: number) => {
      let niCalc = 0, healthCalc = 0;
      const cappedIncome = Math.min(income, maxIncome);

      if (cappedIncome <= threshold60) {
        niCalc = cappedIncome * (taxData.employeeNI.lowRate / 100);
        healthCalc = cappedIncome * (taxData.employeeNI.healthLowRate / 100);
        steps.push(`הכנסה ${fmt(cappedIncome)} עד מדרגת הגבייה המופחתת: ב"ל ${fmtPct(taxData.employeeNI.lowRate)}, בריאות ${fmtPct(taxData.employeeNI.healthLowRate)}`);
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
        steps.push(`הכנסה ${fmt(income)} נמוכה מהמינימום (${fmt(threshold25)} = 25% משכר ממוצע) - חישוב לפי מינימום`);
      }

      if (cappedIncome <= threshold60) {
        niCalc = cappedIncome * (taxData.selfEmployedNI.lowRate / 100);
        healthCalc = cappedIncome * (taxData.selfEmployedNI.healthLowRate / 100);
        steps.push(`הכנסה ${fmt(cappedIncome)} עד מדרגת הגבייה המופחתת: ב"ל ${fmtPct(taxData.selfEmployedNI.lowRate)}, בריאות ${fmtPct(taxData.selfEmployedNI.healthLowRate)}`);
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

    const calcPassive = (income: number) => {
      // BTL published example: first subtract25%, then apply the reduced band to the remainder.
      const base=Math.min(Math.max(0,income-threshold25),maxIncome);
      const low=Math.min(base,threshold60),high=Math.max(0,base-threshold60);
      const ni=low*taxData.passiveNI.lowRate/100+high*taxData.passiveNI.highRate/100;
      const health=low*taxData.passiveNI.healthLowRate/100+high*taxData.passiveNI.healthHighRate/100;
      steps.push('בסיס אחרי הפחתת הסכום הפטור: '+fmt(base)+'; מופחת '+fmt(low)+'; רגיל '+fmt(high));
      // The published nonwork example is an estimate, without a345 circular deduction.
      if(ni+health<minNI)return {ni:Math.max(0,minNI-(year===2026?123:120)),health:year===2026?123:120};
      return {ni,health};
    };
    const calcNonQualifying=calcPassive;

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
        steps.push(`אומדן רכיב 52% מדמי הביטוח: ${fmt(deduction52)}. הניכוי במס הכנסה דורש בדיקת 47א, אישור תשלומים וזכאות; אינו נובע אוטומטית מהאומדן.`);
        break;
      }
      case 'nonQualifying': {
        const r = calcNonQualifying(monthlyIncome);
        ni = r.ni; health = r.health;
        if (false) {
          steps.push(`סכום מינימלי: ${fmt(minNI)} (גבוה מהחישוב)`);
          ni = minNI - health;
          if (ni < 0) { ni = 0; health = minNI; }
        }
        break;
      }
      case 'nonWorking': {
        const r = calcPassive(monthlyIncome);
        ni = r.ni; health = r.health;
        if (false) {
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
          steps.push(`הכנסה עצמאית: הגיע לתקרת ב"ל (${fmt(maxIncome)}) מהשכר - אין תשלום נוסף`);
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
    const monthFactor = Math.min(periodMonths, (calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : periodMonths);
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
<p className="kn-soft">קלט במצב «מקביל ל־12 חודשים» מחולק ב־12; זו אינה הכנסה בפועל לתקופת פעילות קצרה. לתקופה קצרה מזינים בסיס חודשי ואת חודשי הפעילות. תושב ישראל מגיל 18 עד גיל פרישה, ללא מעמד מיוחד. הכנסה עצמאית: בסיס שכבר נקבע לדמי ביטוח, אחרי הפחתות 345. הכנסה שלא מעבודה: אומדן לפי דוגמת ב״ל, ורק לאחר שבודקים שההכנסה אכן חייבת. המעסיק משלם ביטוח לאומי בלבד.</p>
 {year===2025&&<label className="year">תקופת חיוב<select aria-label="תקופת חיוב בשנת 2025" value={healthPeriod} onChange={e=>setHealthPeriod(e.target.value)}><option value="jan">ינואר 2025 — בריאות מלא 5.16%</option><option value="feb">פברואר עד דצמבר 2025 — בריאות מלא 5.17%</option></select></label>}
 <p className="kn-small"><a href="https://www.btl.gov.il/Insurance/Rates/Pages/לעובדים%20שכירים.aspx" target="_blank" rel="noreferrer">שיעורי שכיר</a> · <a href="https://www.btl.gov.il/Insurance/HozrimBituah/Hozrim/מקדמות%20ודמי%20ביטוח%20לעצמאים%202025.pdf" target="_blank" rel="noreferrer">חוזר 1498 לשנת 2025</a>{year===2026?<span className="kn-year-chip"> · שיעורי שכיר ל־2026 לפי חוזר 2025 — לאימות</span>:null} · <a href="https://www.btl.gov.il/Insurance/Rates/Pages/מי%20שאינם%20עובדים%20ובעלי%20הכנסה%20שלא%20מעבודה.aspx" target="_blank" rel="noreferrer">הכנסה שלא מעבודה</a></p>
      {/* ═══════════════ PART 1: Stat Cards ═══════════════ */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card blue">
          <div className="stat-label">שכר ממוצע חודשי</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-20)' }}>{fmt(avgWage)}</div>
          <div className="stat-sub">{year}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">מדרגת הגבייה המופחתת</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-20)' }}>{fmt(threshold60)}</div>
          <div className="stat-sub">סף שיעור מופחת</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-label">הכנסה מרבית חייבת</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-20)' }}>{fmt(maxIncome)}</div>
          <div className="stat-sub">תקרת ב"ל חודשית</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">מינימום עצמאי (חודשי)</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-20)' }}>{fmt(Math.round(threshold25 * (taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate) / 100))}</div>
          <div className="stat-sub">על בסיס {fmt(threshold25)}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">מינימום לא-עובד (חודשי)</div>
          <div className="stat-value" style={{ fontSize: 'var(--fs-20)' }}>{fmt(minNI)}</div>
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
                      עד מדרגת הגבייה המופחתת<br />(שיעור מופחת)
                    </th>
                    <th style={greenSubHeader}>
                      מעל המדרגה המופחתת עד ההכנסה המרבית<br />(שיעור מלא)
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
                  <tr style={totalRowStyle}>
                    <td style={{ ...rowLabelStyle, ...totalRowStyle }}>סה"כ חלק עובד</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.employeeNI.lowRate + taxData.employeeNI.healthLowRate)}</td>
                    <td style={{ ...cellStyle, ...totalRowStyle }}>{fmtPct(taxData.employeeNI.highRate + taxData.employeeNI.healthHighRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AxisDiagram zones={[
              { from: 0, to: threshold60, label: 'שיעור מופחת', color: 'var(--br)', rate: fmtPct(taxData.employeeNI.lowRate + taxData.employeeNI.healthLowRate) },
              { from: threshold60, to: maxIncome, label: 'שיעור מלא', color: 'var(--warn)', rate: fmtPct(taxData.employeeNI.highRate + taxData.employeeNI.healthHighRate) },
              { from: maxIncome, to: null, label: 'פטור', color: 'var(--bd-strong)' },
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
                      עד מדרגת הגבייה המופחתת<br />(שיעור מופחת)
                    </th>
                    <th style={greenSubHeader}>
                      מעל המדרגה המופחתת עד ההכנסה המרבית<br />(שיעור מלא)
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
                <span>הפחתת 52% מבסיס ב״ל לפי 345 אינה זהה אוטומטית לניכוי במס הכנסה; שם בודקים 47א, תשלומים בפועל וחריג עסק זעיר.</span>
              </div>
            </div>
            <AxisDiagram zones={[
              { from: 0, to: threshold60, label: 'שיעור מופחת', color: 'var(--br)', rate: fmtPct(taxData.selfEmployedNI.lowRate + taxData.selfEmployedNI.healthLowRate) },
              { from: threshold60, to: maxIncome, label: 'שיעור מלא', color: 'var(--warn)', rate: fmtPct(taxData.selfEmployedNI.highRate + taxData.selfEmployedNI.healthHighRate) },
              { from: maxIncome, to: null, label: 'פטור', color: 'var(--bd-strong)' },
            ]} />
          </div>
        </div>

        <div className="card"><div className="card-body">
 <div style={sectionTitleStyle}>ג. הכנסה שלא מעבודה ועצמאי שאינו עונה להגדרה</div>
 <p>תחילה בודקים שההכנסה חייבת ומפחיתים {fmt(threshold25)} לחודש. את היתרה מחלקים למדרגות שלהלן; אין מדרגה נפרדת של 50% למי שאינו עונה להגדרה.</p>
 <div className="table-wrap"><table style={tableStyle}><thead><tr><th style={greenHeader}>רכיב</th><th style={greenSubHeader}>יתרה עד {fmt(threshold60)}</th><th style={greenSubHeader}>יתרה מעל המדרגה עד התקרה</th></tr></thead><tbody>
 <tr><td style={rowLabelStyle}>ביטוח לאומי</td><td style={cellStyle}>{fmtPct(taxData.passiveNI.lowRate)}</td><td style={cellStyle}>{fmtPct(taxData.passiveNI.highRate)}</td></tr>
 <tr><td style={rowLabelStyle}>ביטוח בריאות</td><td style={cellStyle}>{fmtPct(taxData.passiveNI.healthLowRate)}</td><td style={cellStyle}>{fmtPct(taxData.passiveNI.healthHighRate)}</td></tr>
 <tr><td style={rowLabelStyle}>סך הכול</td><td style={cellStyle}>{fmtPct(taxData.passiveNI.lowRate+taxData.passiveNI.healthLowRate)}</td><td style={cellStyle}>{fmtPct(taxData.passiveNI.highRate+taxData.passiveNI.healthHighRate)}</td></tr>
 </tbody></table></div>
 <p className="kn-small">מי שאינו עובד וללא פטור: לא פחות מ־{fmt(minNI)} לחודש. ריבית ודיבידנד בשיעור מוגבל ושכירות מגורים פסיבית נבדקים לפטור; פנסיה מוקדמת נבדקת בטבלה שלה. האומדן כאן לפי דוגמת ב״ל, לפני התאמה אפשרית לפי 345.</p>
 </div></div></div>
 {/* ═══════════════ PART 3: NI Calculator ═══════════════ */}
      <div className="ni-calc">
        <div className="ni-calc-head">
          <span style={{ fontSize: 'var(--fs-17)', fontWeight: 600 }}>מחשבון ביטוח לאומי - {year}</span>
          <span className="ni-calc-tag">חישוב מיידי</span>
        </div>
        <div className="ni-calc-body">
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
                  ? 'הכנסה (שכיר) ₪' : calcType === 'selfEmployed' ? 'הכנסה חייבת בדמי ביטוח ₪' : 'הכנסה ₪'}
                <span style={{
                  display: 'inline-flex', borderRadius: 'var(--r-chip)', overflow: 'hidden',
                  background: 'var(--surface-2)', fontSize: 'var(--fs-12)', fontWeight: 500,
                }}>
                  <button type="button" onClick={() => { if (incomeMode === 'annual') { setIncomeMode('monthly'); setIncomeInput(Math.round(incomeInput / 12)); } }}
                    style={{ padding: '.15rem .5rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: incomeMode === 'monthly' ? 'var(--info)' : 'var(--card)', color: incomeMode === 'monthly' ? 'var(--card)' : 'var(--tx2)' }}>
                    חודשי
                  </button>
                  <button type="button" onClick={() => { if (incomeMode === 'monthly') { setIncomeMode('annual'); setIncomeInput(incomeInput * 12); } }}
                    style={{ padding: '.15rem .5rem', border: 'none', borderRight: '1px solid var(--bd-strong)', cursor: 'pointer', fontFamily: 'inherit',
                      background: incomeMode === 'annual' ? 'var(--info)' : 'var(--card)', color: incomeMode === 'annual' ? 'var(--card)' : 'var(--tx2)' }}>
                    מקביל ל־12 חודשים
                  </button>
                </span>
              </label>
              <input
                type="number" min={0}
                value={incomeInput || ''}
                onChange={e => setIncomeInput(Number(e.target.value) || 0)}
                placeholder="0"
                style={{ fontSize: 'var(--fs-17)' }}
              />
              {incomeInput > 0 && (
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--tx2)' }}>
                  = {incomeMode === 'monthly' ? `${fmt(incomeInput * 12)}/שנה` : `${fmt(Math.round(incomeInput / 12))}/חודש`}
                </span>
              )}
              {(calcType === 'selfEmployed' || calcType === 'employeeAndSE') && (
                <small style={{ display: 'block', fontSize: 'var(--fs-12)', color: 'var(--tx2)', marginTop: '.25rem' }}>
                  כאן מזינים את ההכנסה שעליה משלמים דמי ביטוח (אחרי ניכוי 52% מדמי הביטוח). מרווח העסק לפני הניכוי — {AVAILABLE.taxEstimate ? 'מחשבון המס והערכת המס ממירים' : 'מחשבון המס ממיר'} לפי נוסחת ב״ל (סעיף 345), ולכן אותו רווח נותן שם בסיס נמוך מעט.
                </small>
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
                    display: 'inline-flex', borderRadius: 'var(--r-chip)', overflow: 'hidden',
                    background: 'var(--surface-2)', fontSize: 'var(--fs-12)', fontWeight: 500,
                  }}>
                    <button type="button" onClick={() => { if (incomeModeSecondary === 'annual') { setIncomeModeSecondary('monthly'); setSecondaryInput(Math.round(secondaryInput / 12)); } }}
                      style={{ padding: '.15rem .5rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: incomeModeSecondary === 'monthly' ? 'var(--info)' : 'var(--card)', color: incomeModeSecondary === 'monthly' ? 'var(--card)' : 'var(--tx2)' }}>
                      חודשי
                    </button>
                    <button type="button" onClick={() => { if (incomeModeSecondary === 'monthly') { setIncomeModeSecondary('annual'); setSecondaryInput(secondaryInput * 12); } }}
                      style={{ padding: '.15rem .5rem', border: 'none', borderRight: '1px solid var(--bd-strong)', cursor: 'pointer', fontFamily: 'inherit',
                        background: incomeModeSecondary === 'annual' ? 'var(--info)' : 'var(--card)', color: incomeModeSecondary === 'annual' ? 'var(--card)' : 'var(--tx2)' }}>
                      מקביל ל־12 חודשים
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
                  <span style={{ fontSize: 'var(--fs-12)', color: 'var(--tx2)' }}>
                    = {incomeModeSecondary === 'monthly' ? `${fmt(secondaryInput * 12)}/שנה` : `${fmt(Math.round(secondaryInput / 12))}/חודש`}
                  </span>
                )}
              </div>
            )}
          </div>

{['combined','employeeAndSE','employeeAndNonQual'].includes(calcType)&&<div className="kn-blocked" role="status"><strong>בהכנסות מעורבות בונים חישוב משולב.</strong> השכר צורך את המדרגה המופחתת ואת התקרה לפני ההכנסות הנוספות. לא מחברים שני חישובים נפרדים. <a href="#/tax/learn/ni/niSelfEmployed/ni-5">לכללי המעמדות והבסיס</a> · <a href="https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/default.aspx" target="_blank" rel="noreferrer">לדפי ב״ל ולמחשבון הרשמי</a></div>}
          {calcResult && (
            <div>
              {/* Results table */}
              <div style={{ marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-14)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--hairline-1)' }}>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'right', fontWeight: 600 }}></th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontWeight: 600 }}>ביטוח לאומי</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontWeight: 600 }}>מס בריאות</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontWeight: 600 }}>סה"כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--s2)' }}>
                      <td style={{ padding: '.5rem .75rem', fontWeight: 600 }}>חודשי — המבוטח</td>
                      <td style={{ padding: '.5rem .75rem', textAlign: 'center', fontWeight: 600, color: 'var(--br)' }}>{fmt(calcResult.ni)}</td>
                      <td style={{ padding: '.5rem .75rem', textAlign: 'center', fontWeight: 600, color: 'var(--chip-teal-tx)' }}>{fmt(calcResult.health)}</td>
                      <td style={{ padding: '.5rem .75rem', textAlign: 'center', fontWeight: 600, color: 'var(--info)', fontSize: 'var(--fs-15)' }}>{fmt(calcResult.total)}</td>
                    </tr>
                    {(calcResult.employerNI > 0 || calcResult.employerHealth > 0) && (
                      <tr style={{ borderBottom: '1px solid var(--s2)', background: 'var(--s2)' }}>
                        <td style={{ padding: '.5rem .75rem', fontWeight: 500, color: 'var(--tx2)' }}>חודשי (חלק מעסיק)</td>
                        <td style={{ padding: '.5rem .75rem', textAlign: 'center', color: 'var(--tx2)' }}>{fmt(calcResult.employerNI)}</td>
                        <td style={{ padding: '.5rem .75rem', textAlign: 'center', color: 'var(--tx2)' }}>—</td>
                        <td style={{ padding: '.5rem .75rem', textAlign: 'center', color: 'var(--tx2)', fontWeight: 600 }}>{fmt(calcResult.employerNI + calcResult.employerHealth)}</td>
                      </tr>
                    )}
                    <tr style={{ background: 'var(--chip-teal-bg)', fontWeight: 600 }}>
                      <td style={{ padding: '.6rem .75rem' }}>לתקופה בהכנסה קבועה (× {Math.min(periodMonths,(calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : periodMonths)} חודשים)</td>
                      <td style={{ padding: '.6rem .75rem', textAlign: 'center', color: 'var(--br)' }}>{fmt(calcResult.ni * Math.min(periodMonths,(calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : periodMonths))}</td>
                      <td style={{ padding: '.6rem .75rem', textAlign: 'center', color: 'var(--chip-teal-tx)' }}>{fmt(calcResult.health * Math.min(periodMonths,(calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : periodMonths))}</td>
                      <td style={{ padding: '.6rem .75rem', textAlign: 'center', color: 'var(--info)', fontSize: 'var(--fs-17)' }}>{fmt(calcResult.annual)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 52% deduction highlight */}
              {calcResult.deduction52 !== undefined && (
                <div className="ni-note">
                  <strong>ניכוי 52% מב"ל:</strong> {fmt(calcResult.deduction52)}/חודש | {fmt(calcResult.deduction52 * Math.min(periodMonths,(calcType === 'selfEmployed' || calcType === 'nonQualifying') ? activeMonths : periodMonths))}/לתקופה - אומדן רכיב 52%; הניכוי בפועל לפי 47א, אישור תשלומים ותנאי הזכאות
                </div>
              )}

              {/* Steps */}
              {calcResult.steps.length > 0 && (
                <details style={{ marginTop: '.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--txc)' }}>
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

      <InfoSection title="איך מסווגים את ההכנסה" defaultOpen>
 <p>עובד עצמאי: 20 שעות בממוצע בשבוע, או הכנסה לפחות 50% מהשכר הממוצע הרלוונטי, או 12 שעות לפחות והכנסה לפחות 15%. מי שאינו עונה להגדרה נחשב בעל הכנסה שלא מעבודה לעניין חיוב וזכאות; אין לו מדרגת 50% נפרדת.</p>
 <a href="https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/pages/default.aspx" target="_blank" rel="noreferrer">להגדרה הרשמית ולסכומים העדכניים</a>
 </InfoSection>
 <InfoSection title="שכירות, גמלאות ומקרים מיוחדים">
 <p>שכירות מגורים פסיבית למגורים בישראל עשויה להיות פטורה מב״ל גם במסלול מס הכנסה רגיל. שדה בדוח אינו יוצר את הפטור; בודקים את השימוש והאופי ושומרים אסמכתאות.</p>
 <p><a href="#/tax/learn/rent/rental">מסלולי שכירות</a> · <a href="#/tax/learn/ni/maternity">דמי לידה</a> · <a href="#/tax/learn/ni/niSelfEmployed/ni-5">גיל, מעמד והכנסות מעורבות</a> · <a href="#/tax/learn/ni/niSelfEmployed/ni-6">תשלומי ב״ל והדוח השנתי</a></p>
 </InfoSection>
    </div>
  );
}

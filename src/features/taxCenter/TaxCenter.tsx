import { useState } from 'react';
import { TAX_YEARS, AVAILABLE_YEARS } from '../../data/taxData';
import NIReferenceSection from '../../components/NIReferenceSection';
import CreditPointsWizard from './CreditPointsWizard';
import ExpenseKnowledge from './expenses/ExpenseKnowledge';
import RentalRouteCalculator from './RentalRouteCalculator';
import SettlementLookup from './SettlementLookup';
import IncomeTaxPanel from './IncomeTaxPanel';
import KnowledgeTopics from './KnowledgeTopics';
import BookkeepingKnowledge from './bookkeeping/BookkeepingKnowledge';
import { FreshnessBadge, FreshnessPanel } from './DataFreshness';

const fmt = (n: number) => '₪' + n.toLocaleString('he-IL');

type Tool =
  | 'overview' | 'expenses' | 'bookkeeping' | 'wizard' | 'rental' | 'incomeTax' | 'ni' | 'settlements' | 'topics';

const TOOLS: { key: Tool; label: string; desc: string }[] = [
  { key: 'expenses',     label: 'הוצאות מוכרות',       desc: '"אפשר לנכות את זה?" — תשובה בשניות: מס הכנסה, מע"מ, מקורות ופסיקה' },
  { key: 'bookkeeping',  label: 'ניהול ספרים',          desc: 'איזו תוספת ואילו ספרים כל עוסק חייב — אשף, 15 התוספות ומילון הספרים' },
  { key: 'wizard',       label: 'אשף נקודות זיכוי',   desc: 'עונים על שאלות — המערכת קובעת את הנקודות ומסבירה למה' },
  { key: 'rental',       label: 'מחשבון שכר דירה',     desc: 'השוואת פטור / 10% / שולי, כולל הפטור המתקפל ו-122(ו)' },
  { key: 'incomeTax',    label: 'מדרגות ומס יסף',      desc: 'מדרגות עדכניות, מס יסף דו-שכבתי וחישוב מהיר' },
  { key: 'ni',           label: 'ביטוח לאומי',          desc: 'שיעורים, תקרות ומחשבון לכל סוגי המבוטחים' },
  { key: 'settlements',  label: 'יישובים מוטבים',       desc: 'הרשימה הרשמית המלאה + מחשבון זיכוי' },
  { key: 'topics',       label: 'נושאים מקצועיים',      desc: 'פנסיה, פרישה, מע"מ, חברות, מקרקעין, מועדים ועוד' },
];

/** מיפוי כלי → מאגר הנתונים שמזין אותו (לתג העדכניות) */
const TOOL_DATASET: Partial<Record<Tool, string>> = {
  expenses: 'expenses',
  bookkeeping: 'bookkeeping',
  wizard: 'taxData',
  rental: 'taxData',
  incomeTax: 'taxData',
  ni: 'taxData',
  settlements: 'settlements',
  topics: 'topics',
};

interface Props {
  onBack: () => void;
  freshnessTaskExists: boolean;
  onCreateFreshnessTask: () => void;
}

export default function TaxCenter({ onBack, freshnessTaskExists, onCreateFreshnessTask }: Props) {
  const [year, setYear] = useState<number>(2026);
  const [tool, setTool] = useState<Tool>('overview');
  const data = TAX_YEARS.find(t => t.year === year)!;

  const keyValues = [
    { label: 'ערך נקודת זיכוי', value: fmt(data.creditPointValue), sub: 'לשנה · מוקפא עד 2027' },
    { label: 'סף מס יסף', value: fmt(data.surtaxThreshold), sub: data.surtaxCapitalExtraRate > 0 ? '3% + 2% על הוני' : '3%' },
    { label: 'פטור שכר דירה', value: fmt(data.rentalExemptMonthly), sub: 'לחודש · מוקפא' },
    { label: 'שכר ממוצע (ב"ל)', value: fmt(data.niAverageWage), sub: 'לחודש' },
    { label: 'תקרת ב"ל חודשית', value: fmt(data.niMaxIncomeMonthly), sub: 'לחודש' },
    { label: 'מדרגת גבייה מופחתת', value: fmt(data.niThreshold60Monthly), sub: year >= 2026 ? 'צמודת מדד (לא עוד 60%)' : '60% מהשכר הממוצע' },
    ...(data.gamblingExemptionCeiling ? [{ label: 'פטור הגרלות', value: fmt(data.gamblingExemptionCeiling), sub: 'לזכייה' }] : []),
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '14px', color: 'var(--gray-500)', marginBottom: '.25rem' }}>
            <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={onBack}>← חזרה</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 600 }}>מרכז ידע מס</h1>
          <p style={{ fontSize: '14px', color: 'var(--gray-500)' }}>
            כלי החלטה, מחשבונים ונתונים מאומתים — לא עוד דפדוף בטבלאות
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <label style={{ fontSize: '14px', fontWeight: 600 }}>שנת מס:</label>
          <select
            value={year}
            onChange={e => setYear(+e.target.value)}
            style={{ padding: '.4rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--gray-300)', fontSize: '15px', fontWeight: 600, color: 'var(--blue)' }}
          >
            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ניווט כלים */}
      <div style={{ display: 'flex', gap: '.35rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--gray-200)', paddingBottom: '.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setTool('overview')}
          style={{
            padding: '.45rem .9rem', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '14px',
            fontWeight: tool === 'overview' ? 600 : 400,
            background: tool === 'overview' ? 'var(--blue)' : 'transparent',
            color: tool === 'overview' ? 'var(--card)' : 'var(--gray-600)',
          }}
        >
          סקירה
        </button>
        {TOOLS.map(t => (
          <button
            key={t.key}
            onClick={() => setTool(t.key)}
            style={{
              padding: '.45rem .9rem', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '14px',
              fontWeight: tool === t.key ? 600 : 400,
              background: tool === t.key ? 'var(--blue)' : 'transparent',
              color: tool === t.key ? 'var(--card)' : 'var(--gray-600)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── סקירה ── */}
      {tool === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '.75rem' }}>
            {keyValues.map(card => (
              <div key={card.label} className="card" style={{ padding: '.75rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--blue-dark)' }}>{card.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{card.sub}</div>
                <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '.2rem' }}>{card.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.9rem' }}>
            {TOOLS.map(t => (
              <div key={t.key} className="card" onClick={() => setTool(t.key)}
                style={{ cursor: 'pointer', transition: 'box-shadow .15s' }}>
                <div className="card-body" style={{ display: 'flex', gap: '.9rem', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{t.label}</div>
                    <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{t.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <FreshnessPanel checkTaskExists={freshnessTaskExists} onCreateCheckTask={onCreateFreshnessTask} />

          <div className="alert alert-info" style={{ marginBottom: 0, fontSize: '13px' }}>
            שנים 2025–2027: רוב התקרות מוקפאות (חוק ההתייעלות — הקפאת עדכוני מס).
          </div>
        </div>
      )}

      {tool !== 'overview' && TOOL_DATASET[tool] && <FreshnessBadge datasetId={TOOL_DATASET[tool]!} />}

      {tool === 'expenses' && <ExpenseKnowledge />}
      {tool === 'bookkeeping' && <BookkeepingKnowledge />}
      {tool === 'wizard' && <CreditPointsWizard taxData={data} year={year} />}
      {tool === 'rental' && <RentalRouteCalculator taxData={data} year={year} />}
      {tool === 'incomeTax' && <IncomeTaxPanel taxData={data} year={year} />}
      {tool === 'ni' && <NIReferenceSection taxData={data} year={year} />}
      {tool === 'settlements' && <SettlementLookup year={year} />}
      {tool === 'topics' && <KnowledgeTopics year={year} />}
    </div>
  );
}

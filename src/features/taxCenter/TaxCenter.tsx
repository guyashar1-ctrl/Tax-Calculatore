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

  const current = TOOLS.find(t => t.key === tool);

  return (
    /* מסילה ופאנל, לפי מסך 18. הסרגל האופקי של תשעה כלים הוחלף במסילה:
       שמונה שמות בשורה אחת נקראים כטאבים ("איפה אני"), ובעמודה הם
       נקראים כמה שהם — תוכן עניינים של ספר עיון. */
    <div className="tax-center pg-split">
      <nav className="pg-rail" aria-label="כלי ידע המס">
        <div className="pg-rail-eyebrow">ידע מס · {year}</div>
        <button type="button" className={`pg-rail-item ${tool === 'overview' ? 'is-active' : ''}`} onClick={() => setTool('overview')}>
          <span className="pg-rail-name">סקירה</span>
        </button>
        {TOOLS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`pg-rail-item ${tool === t.key ? 'is-active' : ''}`}
            onClick={() => setTool(t.key)}
            aria-current={tool === t.key ? 'true' : undefined}
          >
            <span className="pg-rail-name">{t.label}</span>
          </button>
        ))}

        {/* עדכניות הנתונים היא תכונה של המאגר כולו, לא של הכלי הפתוח.
            מקומה בתחתית המסילה, פעם אחת — ולא כתג מעל כל אחד מתשעת הכלים. */}
        <div className="pg-rail-foot">
          {tool !== 'overview' && TOOL_DATASET[tool]
            ? <FreshnessBadge datasetId={TOOL_DATASET[tool]!} />
            : null}
        </div>

        <label className="pg-rail-year">
          שנת מס
          <select value={year} onChange={e => setYear(+e.target.value)}>
            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>

        <button type="button" className="pg-rail-back" onClick={onBack}>← חזרה</button>
      </nav>

      <div className="pg-pane">
        <div className="pg-head">
          <div className="pg-head-main">
            <div className="pg-title pg-title-lg">{current ? current.label : 'מרכז ידע מס'}</div>
            <div className="pg-status">
              {current ? current.desc : 'כלי החלטה, מחשבונים ונתונים מאומתים — לא עוד דפדוף בטבלאות'}
            </div>
          </div>
        </div>

        {/* ── סקירה ── */}
        {tool === 'overview' && (
          <>
            {/* ערכי המפתח של השנה — שורת מספרים, לא תשעה כרטיסים ממורכזים */}
            <div className="tc-keyvals">
              {keyValues.map(card => (
                <div key={card.label} className="tc-keyval">
                  <div className="tc-keyval-num">{card.value}</div>
                  <div className="tc-keyval-label">{card.label}</div>
                  <div className="tc-keyval-sub">{card.sub}</div>
                </div>
              ))}
            </div>

            <FreshnessPanel checkTaskExists={freshnessTaskExists} onCreateCheckTask={onCreateFreshnessTask} />

            <div className="alert alert-info">
              שנים 2025–2027: רוב התקרות מוקפאות (חוק ההתייעלות — הקפאת עדכוני מס).
            </div>
          </>
        )}

        {tool === 'expenses' && <ExpenseKnowledge />}
        {tool === 'bookkeeping' && <BookkeepingKnowledge />}
        {tool === 'wizard' && <CreditPointsWizard taxData={data} year={year} />}
        {tool === 'rental' && <RentalRouteCalculator taxData={data} year={year} />}
        {tool === 'incomeTax' && <IncomeTaxPanel taxData={data} year={year} />}
        {tool === 'ni' && <NIReferenceSection taxData={data} year={year} />}
        {tool === 'settlements' && <SettlementLookup year={year} />}
        {tool === 'topics' && <KnowledgeTopics year={year} />}
      </div>
    </div>
  );
}

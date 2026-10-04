import { useState } from 'react';
import { TAX_YEARS, AVAILABLE_YEARS } from '../../data/taxData';
import NIReferenceSection from '../../components/NIReferenceSection';
import CreditPointsWizard from './CreditPointsWizard';
import ExpenseKnowledge from './expenses/ExpenseKnowledge';
import RentalRouteCalculator from './RentalRouteCalculator';
import SettlementLookup from './SettlementLookup';
import IncomeTaxPanel from './IncomeTaxPanel';
import KnowledgeTopics from './KnowledgeTopics';
import SavingsBenefits from './SavingsBenefits';
import BookkeepingKnowledge from './bookkeeping/BookkeepingKnowledge';
import { FreshnessBadge, FreshnessPanel } from './DataFreshness';
import { OVERVIEW_LABEL, TOOLS, taxCenterHead, type Tool } from './taxCenterNav';

const fmt = (n: number) => '₪' + n.toLocaleString('he-IL');

interface Props {
  onBack: () => void;
  freshnessTaskExists: boolean;
  onCreateFreshnessTask: () => void;
}

export default function TaxCenter({ onBack, freshnessTaskExists, onCreateFreshnessTask }: Props) {
  const [year, setYear] = useState<number>(2026);
  /** הכלי שנבחר. null = עוד לא נבחר: במחשב מוצגת הסקירה, בטלפון רשימת הכלים. */
  const [picked, setPicked] = useState<Tool | null>(null);
  /** נושא הוצאה שנפתח ישירות כשמגיעים מקישור במסך אחר */
  const [expenseJump, setExpenseJump] = useState<string | null>(null);
  const data = TAX_YEARS.find(t => t.year === year)!;
  const head = taxCenterHead(picked, year);
  const tool = head.tool;

  // כלי חדש מתחיל מראש העמוד — בטלפון הרשימה גוללת, והכלי נפתח במקומה.
  function open(next: Tool | null) {
    setExpenseJump(null);
    setPicked(next);
    window.scrollTo({ top: 0 });
  }

  function openExpenseTopic(topicId: string) {
    setExpenseJump(topicId);
    setPicked('expenses');
    window.scrollTo({ top: 0 });
  }

  const keyValues = [
    { label: 'ערך נקודת זיכוי', value: fmt(data.creditPointValue), sub: 'לשנה · מוקפא עד 2027' },
    { label: 'סף מס יסף', value: fmt(data.surtaxThreshold), sub: data.surtaxCapitalExtraRate > 0 ? '3% + 2% על הוני' : '3%' },
    { label: 'פטור שכר דירה', value: fmt(data.rentalExemptMonthly), sub: 'לחודש · מוקפא' },
    { label: 'שכר ממוצע (ב"ל)', value: fmt(data.niAverageWage), sub: 'לחודש' },
    { label: 'תקרת ב"ל חודשית', value: fmt(data.niMaxIncomeMonthly), sub: 'לחודש' },
    { label: 'מדרגת גבייה מופחתת', value: fmt(data.niThreshold60Monthly), sub: year >= 2026 ? 'צמודת מדד (לא עוד 60%)' : '60% מהשכר הממוצע' },
    ...(data.gamblingExemptionCeiling ? [{ label: 'פטור הגרלות', value: fmt(data.gamblingExemptionCeiling), sub: 'לזכייה' }] : []),
  ];

  const yearSelect = (
    <select value={year} onChange={e => setYear(+e.target.value)}>
      {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  return (
    /* מסילה ופאנל, לפי מסך 18. הסרגל האופקי של תשעה כלים הוחלף במסילה:
       שמונה שמות בשורה אחת נקראים כטאבים ("איפה אני"), ובעמודה הם
       נקראים כמה שהם — תוכן עניינים של ספר עיון.
       ‼ בטלפון (מתחת ל-900px, כשהמסילה נערמת): הרשימה היא דף הכניסה וכלי
       נפתח במסך מלא עם «› ידע מס» — אחרת עשרת הפריטים מילאו את המסך הראשון
       והכלי שנבחר נפתח מתחת לקפל. */
    <div className={`tax-center pg-split${picked ? ' has-tool' : ''}`}>
      <nav className="pg-rail" aria-label="כלי ידע המס">
        <h1 className="tc-list-title">ידע מס</h1>
        <div className="pg-rail-eyebrow">ידע מס · {year}</div>
        <button type="button" className={`pg-rail-item ${tool === 'overview' ? 'is-active' : ''}`}
          onClick={() => open('overview')} aria-current={tool === 'overview' ? 'true' : undefined}>
          <span className="pg-rail-name">{OVERVIEW_LABEL}</span>
          <span className="tc-chev" aria-hidden="true">‹</span>
        </button>
        {TOOLS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`pg-rail-item ${tool === t.key ? 'is-active' : ''}`}
            onClick={() => open(t.key)}
            aria-current={tool === t.key ? 'true' : undefined}
          >
            <span className="pg-rail-name">{t.label}</span>
            <span className="tc-chev" aria-hidden="true">‹</span>
          </button>
        ))}

        {/* עדכניות הנתונים היא תכונה של המאגר כולו, לא של הכלי הפתוח.
            מקומה בתחתית המסילה, פעם אחת — ולא כתג מעל כל אחד מתשעת הכלים. */}
        <div className="pg-rail-foot">
          {head.datasetId ? <FreshnessBadge datasetId={head.datasetId} /> : null}
        </div>

        <label className="pg-rail-year">
          שנת מס
          {yearSelect}
        </label>

        <button type="button" className="pg-rail-back" onClick={onBack}>← חזרה</button>
      </nav>

      <div className="pg-pane">
        <div className="pg-head">
          <div className="pg-head-main">
            <button type="button" className="tc-back" onClick={() => open(null)}>
              <span aria-hidden="true">›</span> ידע מס
            </button>
            <div className="pg-title pg-title-lg">{head.title}</div>
            <div className="pg-status">{head.status}</div>
            {/* בטלפון המסילה מוסתרת כשכלי פתוח — העדכניות והשנה עוברות לכותרת. */}
            {head.datasetId && <div className="tc-head-fresh"><FreshnessBadge datasetId={head.datasetId} /></div>}
          </div>
          {head.usesYear && (
            <label className="tc-year">
              שנת מס
              {yearSelect}
            </label>
          )}
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
              שנים 2025–2027: רוב התקרות מוקפאות (חוק ההתייעלות - הקפאת עדכוני מס).
            </div>
          </>
        )}

        {tool === 'expenses' && <ExpenseKnowledge key={expenseJump ?? 'all'} initialTopicId={expenseJump} />}
        {tool === 'savings' && <SavingsBenefits year={year} onOpenExpenseTopic={openExpenseTopic} />}
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

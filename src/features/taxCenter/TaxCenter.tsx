import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
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
import { OVERVIEW_LABEL, TOOLS, taxCenterHead, type Tool } from './taxCenterNav';
import KnowledgeHome from '../taxKnowledge/KnowledgeHome';
import TopicPage from '../taxKnowledge/TopicPage';
import Map1301 from '../taxKnowledge/Map1301';
import Maintenance from '../taxKnowledge/Maintenance';
import { TOPIC_BY_ID, TOPICS } from '../taxKnowledge/topics';

const fmt = (n: number) => '₪' + n.toLocaleString('he-IL');

interface Props {
  onBack: () => void;
  freshnessTaskExists: boolean;
  onCreateFreshnessTask: () => void;
  clients?: Client[];
  /** נושא לפתיחה ישירה — למשל מתוך תיק המס של לקוח. */
  initialTopic?: string | null;
  /** הלקוח שממנו נפתח הנושא (לחזרה ולמילוי מה שידוע). */
  contextClientId?: string | null;
  onOpenClient?: (clientId: string) => void;
}

export default function TaxCenter({ onBack, freshnessTaskExists, onCreateFreshnessTask, clients = [], initialTopic = null, contextClientId = null, onOpenClient }: Props) {
  const [year, setYear] = useState<number>(2026);
  /** הכלי שנבחר. null = עוד לא נבחר: במחשב מוצגים הנושאים, בטלפון רשימת הכלים. */
  const [picked, setPicked] = useState<Tool | null>(initialTopic ? 'overview' : null);
  /** נושא פתוח בתוך «נושאים». */
  const [topicId, setTopicId] = useState<string | null>(initialTopic && TOPIC_BY_ID[initialTopic] ? initialTopic : null);
  const [ctxClientId, setCtxClientId] = useState<string | null>(contextClientId);
  /** נושא הוצאה שנפתח ישירות כשמגיעים מקישור במסך אחר */
  const [expenseJump, setExpenseJump] = useState<string | null>(null);

  // ‼ כניסה חוזרת מהתיק עם נושא אחר — App מעביר נושא חדש; לא לפספס אותו.
  useEffect(() => {
    if (initialTopic && TOPIC_BY_ID[initialTopic]) { setPicked('overview'); setTopicId(initialTopic); setCtxClientId(contextClientId); window.scrollTo({ top: 0 }); }
  }, [initialTopic, contextClientId]);

  const data = TAX_YEARS.find(t => t.year === year)!;
  const head = taxCenterHead(picked, year);
  const tool = head.tool;
  const topic = tool === 'overview' && topicId ? TOPIC_BY_ID[topicId] : undefined;
  const ctxClient = useMemo(() => clients.find(c => c.id === ctxClientId) ?? null, [clients, ctxClientId]);

  // כלי חדש מתחיל מראש העמוד — בטלפון הרשימה גוללת, והכלי נפתח במקומה.
  function open(next: Tool | null) {
    setExpenseJump(null);
    setTopicId(null);
    setCtxClientId(null);
    setPicked(next);
    window.scrollTo({ top: 0 });
  }

  function openTopic(id: string) {
    setPicked('overview');
    setTopicId(id);
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
    <select value={year} onChange={e => setYear(+e.target.value)} aria-label="שנת מס">
      {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  const railItem = (key: Tool | 'overview', label: string) => (
    <button key={key} type="button" className={`pg-rail-item ${tool === key && !(key === 'overview' && topic) ? 'is-active' : ''}`}
      onClick={() => open(key)} aria-current={tool === key ? 'true' : undefined}>
      <span className="pg-rail-name">{label}</span>
      <span className="tc-chev" aria-hidden="true">‹</span>
    </button>
  );

  return (
    /* מסילה ופאנל, לפי מסך 18.
       ‼ בטלפון (מתחת ל-900px, כשהמסילה נערמת): הרשימה היא דף הכניסה וכלי
       נפתח במסך מלא עם «› ידע מס» — אחרת הפריטים מילאו את המסך הראשון
       והכלי שנבחר נפתח מתחת לקפל.
       ‼ 10.10.2026: «נושאים» בראש — ללמוד נושא; «כלים» — הכלים הקיימים כמו שהם;
       «בקרה» — טופס 1301 (גרסה, שדות, מוכנות לקוח) ועדכניות. נושא נפתח בתוך «נושאים», בלי מסילה נוספת. */
    <div className={`tax-center pg-split${picked ? ' has-tool' : ''}`}>
      <nav className="pg-rail" aria-label="כלי ידע המס">
        <h1 className="tc-list-title">ידע מס</h1>
        <div className="pg-rail-eyebrow">ללמוד</div>
        {railItem('overview', OVERVIEW_LABEL)}
        {topic && (
          <button type="button" className="pg-rail-item is-active" aria-current="true" onClick={() => window.scrollTo({ top: 0 })}>
            <span className="pg-rail-name" style={{ paddingInlineStart: 10 }}>{topic.title}</span>
          </button>
        )}
        <div className="pg-rail-eyebrow">כלים</div>
        {TOOLS.filter(t => t.group === 'tools').map(t => railItem(t.key, t.label))}
        <div className="pg-rail-eyebrow">בקרה</div>
        {TOOLS.filter(t => t.group === 'control').map(t => railItem(t.key, t.label))}

        {/* עדכניות היא תכונה של המאגר, לא של הכלי הפתוח — פעם אחת בתחתית. */}
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
            <div className="kn-crumbs">
              <button type="button" className="tc-back" onClick={() => open(null)}>
                <span aria-hidden="true">›</span> ידע מס
              </button>
              {topic ? (
                <button type="button" className="kn-crumb" onClick={() => { setTopicId(null); setCtxClientId(null); window.scrollTo({ top: 0 }); }}>
                  <span aria-hidden="true">›</span> כל ה{OVERVIEW_LABEL}
                </button>
              ) : null}
            </div>
            {!topic && <div className="pg-title pg-title-lg">{head.title}</div>}
            {!topic && <div className="pg-status">{head.status}</div>}
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

        {tool === 'overview' && (topic ? (
          <TopicPage
            key={topic.id}
            topicId={topic.id}
            year={year}
            clients={clients}
            context={ctxClient ? { id: ctxClient.id, name: `${ctxClient.firstName ?? ''} ${ctxClient.lastName ?? ''}`.trim(), client: ctxClient } : null}
            onBackToClient={ctxClient && onOpenClient ? () => onOpenClient(ctxClient.id) : undefined}
            onOpenClient={onOpenClient}
            onOpenTopic={openTopic}
          />
        ) : (
          <>
            <KnowledgeHome year={year} onOpenTopic={openTopic} />
            {/* ערכי המפתח של השנה — שורת מספרים, כמו בסקירה הקודמת */}
            <div className="pg-rail-eyebrow" style={{ marginTop: 18 }}>ערכי מפתח · {year}</div>
            <div className="tc-keyvals">
              {keyValues.map(card => (
                <div key={card.label} className="tc-keyval">
                  <div className="tc-keyval-num">{card.value}</div>
                  <div className="tc-keyval-label">{card.label}</div>
                  <div className="tc-keyval-sub">{card.sub}</div>
                </div>
              ))}
            </div>
            <p className="tc-fresh-note" style={{ marginTop: 6 }}>ערכי המפתח מהמאגר הקיים. מה נבדק בהם בפועל — ב«עדכניות ותחזוקה».</p>
          </>
        ))}

        {tool === 'expenses' && <ExpenseKnowledge key={expenseJump ?? 'all'} initialTopicId={expenseJump} />}
        {tool === 'bookkeeping' && <BookkeepingKnowledge />}
        {tool === 'wizard' && <CreditPointsWizard taxData={data} year={year} />}
        {tool === 'rental' && <RentalRouteCalculator taxData={data} year={year} />}
        {tool === 'incomeTax' && <IncomeTaxPanel taxData={data} year={year} />}
        {tool === 'ni' && <NIReferenceSection taxData={data} year={year} />}
        {tool === 'settlements' && <SettlementLookup year={year} />}
        {tool === 'topics' && <KnowledgeTopics year={year} onOpenTopic={openTopic} />}
        {tool === 'map1301' && <Map1301 onOpenTopic={openTopic} clients={clients} contextClientId={contextClientId} onOpenClient={onOpenClient} />}
        {tool === 'maintenance' && (
          <Maintenance year={year} freshnessPanel={<FreshnessPanel checkTaskExists={freshnessTaskExists} onCreateCheckTask={onCreateFreshnessTask} />} />
        )}
      </div>
    </div>
  );
}

/** לבדיקות: כל נושא בנושאים מוכר למסך. */
export const TOPIC_IDS = TOPICS.map(t => t.id);

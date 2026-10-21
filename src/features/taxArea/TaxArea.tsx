// ─── «מס» — עבודות לקוחות וידע מקצועי באזור אחד (14.10.2026) ─────────────────────────────────────
// ‼ גיא (14.10): «ידע מס» ו«עבודת מס» היו דומים בשם ובמקומות שונים. עכשיו כניסה אחת, ושני מרחבים בשמות ברורים:
//   «עבודות לקוחות» — עמוד לכל סוג עבודה (קליטה, דוחות, הצהרות הון, הערכות), ו«כל העבודות» כסקירה;
//   «ידע מקצועי» — עמוד לכל תחום (דוח שנתי, פנסיה, ב״ל…), ובתוכו הנושאים והכלים של התחום, לא רשימה ארוכה אחת.
// ‼ הכתובת קובעת (‎#/tax/…‎, areaModel.ts) — «אחורה» בדפדפן חוזר לעמוד הקודם, גם בין המרחבים.
// ‼ בטלפון — כמו קודם: הרשימה היא דף הכניסה, ועמוד נפתח במסך מלא עם «› מס».

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Client } from '../../types';
import { TAX_YEARS, AVAILABLE_YEARS } from '../../data/taxData';
import NIReferenceSection from '../../components/NIReferenceSection';
import CreditPointsWizard from '../taxCenter/CreditPointsWizard';
import ExpenseKnowledge from '../taxCenter/expenses/ExpenseKnowledge';
import RentalRouteCalculator from '../taxCenter/RentalRouteCalculator';
import SettlementLookup from '../taxCenter/SettlementLookup';
import IncomeTaxPanel from '../taxCenter/IncomeTaxPanel';
import BookkeepingKnowledge from '../taxCenter/bookkeeping/BookkeepingKnowledge';
import { FreshnessBadge, FreshnessPanel } from '../taxCenter/DataFreshness';
import { TOOL_DATASET, type Tool } from '../taxCenter/taxCenterNav';
import TopicPage from '../taxKnowledge/TopicPage';
import Map1301 from '../taxKnowledge/Map1301';
import Maintenance from '../taxKnowledge/Maintenance';
import { TOPIC_BY_ID } from '../taxKnowledge/topics';
import { plainStatus, askAreasView } from '../taxKnowledge/learnPath';
import ClientAsksPanel from '../taxKnowledge/ClientAsksPanel';
import { ClaimTag } from '../taxKnowledge/claim';
import DomainValues, { DeadlinesTool } from '../taxKnowledge/DomainValuesPanel';
import { MOVED_GROUPS, searchValues, valueGroupsOf } from '../taxKnowledge/domainValues';
import { weakestBasis } from '../taxRules/registry';
import WorkOverview from './WorkOverview';
import { ShaamFilingPanel } from '../shaamFiling';
import FormMap from '../taxKnowledge/formMap/FormMap';
import { useTaxWork } from '../taxYear/useTaxWork';
import {
  DOMAINS, DOMAIN_BY_ID, MODE_HINT, MODE_LABEL, WORK_BY_ID, WORK_SECTIONS,
  askAreasOf, domainOf, formatAreaPath, itemOf, parseAreaPath, type AreaPath, type DomainId, type DomainItem, type PlannedItem,
} from './areaModel';
import './taxArea.css';

const fmt = (n: number) => '₪' + n.toLocaleString('he-IL');
/** כלים שאינם תלויים בשנת המס. */
const YEARLESS = new Set<Tool>(['expenses', 'bookkeeping', 'map1301']);

interface Props {
  /** מה שאחרי ‎#/tax/‎ — ‎"work/annual"‎ · ‎"learn/savings/pensionSE"‎. */
  path: string;
  onPath: (path: string) => void;
  onBack: () => void;
  freshnessTaskExists: boolean;
  onCreateFreshnessTask: () => void;
  clients: Client[];
  /** נושא שנפתח מתוך תיק לקוח — לחזרה ולמילוי מה שידוע. */
  contextTopic?: string | null;
  contextClientId?: string | null;
  /** ‼ 16.10: 'journey' = לשונית «בקשות» של הלקוח; focusStepId — הבקשה שממנה הגיעו (המיקוד לשורה — בצד הבקשות). */
  onOpenClient: (clientId: string, tab?: 'taxfile' | 'docs' | 'journey', focusStepId?: string) => void;
}

export default function TaxArea({ path, onPath, onBack, freshnessTaskExists, onCreateFreshnessTask, clients, contextTopic = null, contextClientId = null, onOpenClient }: Props) {
  const p = useMemo(() => parseAreaPath(path), [path]);
  const work = useTaxWork(clients);
  const [year, setYear] = useState<number>(2026);
  // ‼ בטלפון: כניסה ל«מס» מהסרגל (בלי עמוד בכתובת) פותחת את הרשימה; קישור לעמוד מסוים — את העמוד. במחשב הרשימה תמיד בצד.
  const [phoneList, setPhoneList] = useState<boolean>(() => !path);
  useEffect(() => { if (!path) setPhoneList(true); }, [path]);
  const [lastWork, setLastWork] = useState<string>(p.mode === 'work' ? formatAreaPath(p) : 'work/all');
  const [lastLearn, setLastLearn] = useState<string>(p.mode === 'learn' ? formatAreaPath(p) : 'learn');
  useEffect(() => { if (p.mode === 'work') setLastWork(formatAreaPath(p)); else setLastLearn(formatAreaPath(p)); }, [p]);
  // ‼ כניסה מתיק לקוח לנושא — נשארים בהקשר הלקוח כל עוד הנושא הזה פתוח
  const ctxClient = useMemo(() => (contextClientId && p.mode === 'learn' && p.item === contextTopic ? clients.find(c => c.id === contextClientId) ?? null : null), [clients, contextClientId, contextTopic, p]);
  useEffect(() => { if (contextTopic && p.mode === 'learn' && p.item === contextTopic) setPhoneList(false); }, [contextTopic, p]);

  const go = (next: AreaPath | string) => {
    onPath(typeof next === 'string' ? next : formatAreaPath(next));
    setPhoneList(false);
    window.scrollTo({ top: 0 });
  };
  const openTopic = (id: string) => go({ mode: 'learn', domain: domainOf(id), item: id });
  const canLearn = (id: string) => !!domainOf(id);
  const data = TAX_YEARS.find(t => t.year === year)!;
  const yearSelect = (
    <select value={year} onChange={e => setYear(+e.target.value)} aria-label="שנת מס">
      {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  const item = itemOf(p);
  const domain = p.mode === 'learn' && p.domain ? DOMAIN_BY_ID[p.domain] : undefined;

  // ── המסילה ──
  const railItem = (key: string, label: string, active: boolean, onClick: () => void, extra?: ReactNode) => (
    <button key={key} type="button" className={`pg-rail-item${active ? ' is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} data-rail={key}>
      <span className="pg-rail-name">{label}</span>
      {extra}
      <span className="tc-chev" aria-hidden="true">‹</span>
    </button>
  );
  const countBadge = (open: number, mine: number) => (open > 0 ? (
    <span className={`ta-count${mine > 0 ? ' is-mine' : ''}`} aria-label={`${open} פתוחות${mine ? `, מהן ${mine} ממתינות לך` : ''}`} title={mine ? `${mine} ממתינות לטיפולך` : undefined}>{open}</span>
  ) : null);

  const rail = (
    <nav className="pg-rail ta-rail" aria-label="מס">
      <h1 className="tc-list-title">מס</h1>
      <div className="ta-modes" role="group" aria-label="מרחב">
        {(['work', 'learn'] as const).map(m => (
          <button key={m} type="button" className={`ta-mode${p.mode === m ? ' is-on' : ''}`} aria-pressed={p.mode === m}
            onClick={() => { if (p.mode !== m) { onPath(m === 'work' ? lastWork : lastLearn); window.scrollTo({ top: 0 }); } }} data-mode={m}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="ta-mode-hint">{MODE_HINT[p.mode]}</p>
      {p.mode === 'work' && (
        <>
          {WORK_SECTIONS.map(s => railItem(`work-${s.id}`, s.label, p.section === s.id, () => go({ mode: 'work', section: s.id }), countBadge(work.counts[s.id].open, work.counts[s.id].mine)))}
          <p className="pg-rail-foot ta-legend">המספר — עבודות פתוחות. <b className="ta-mine-t">בצבע</b> — יש ביניהן עבודה שממתינה לך.</p>
        </>
      )}
      {p.mode === 'learn' && (
        <>
          {railItem('learn-home', 'כל התחומים', !p.domain, () => go({ mode: 'learn' }))}
          {/* ‼ גיא (15.10): תת-נושאים נראו כמו תחומים ראשיים. עכשיו: תחום = שורה עם חץ פתיחה; תחום פתוח = קבוצה
              ברקע משלה, והנושאים בתוכה מוזחים, קטנים יותר ומסומנים בנקודה; הנבחר — רקע, הדגשה ופס בצד (לא צבע בלבד). */}
          {DOMAINS.map(d => {
            const open = p.domain === d.id;
            return (
              <div key={d.id} className={`ta-domain${open ? ' is-open' : ''}`}>
                <button type="button" className={`pg-rail-item ta-dom-row${open ? ' is-open' : ''}${open && !p.item ? ' is-active' : ''}`}
                  onClick={() => go({ mode: 'learn', domain: d.id })} aria-expanded={open} aria-controls={`ta-sub-${d.id}`}
                  aria-current={open && !p.item ? 'page' : undefined} data-rail={`learn-${d.id}`}>
                  <svg className={`ta-chev${d.items.length ? '' : ' is-empty'}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="pg-rail-name">{d.label}</span>
                </button>
                {open && d.items.length > 0 && (
                  <ul className="ta-sub" id={`ta-sub-${d.id}`} aria-label={`בתוך ${d.label}`}>
                    {d.items.map(i => (
                      <li key={i.id}>
                        <button type="button" className={`ta-sub-item${p.item === i.id ? ' is-active' : ''}`}
                          onClick={() => go({ mode: 'learn', domain: d.id, item: i.id })} aria-current={p.item === i.id ? 'page' : undefined} data-rail={`learn-${d.id}-${i.id}`}>
                          <span className="ta-sub-name">{i.label}</span>
                          {i.kind === 'tool' && <span className="ta-sub-kind">כלי</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <label className="pg-rail-year">שנת מס{yearSelect}</label>
        </>
      )}
      <button type="button" className="pg-rail-back" onClick={onBack}>→ חזרה ללקוחות</button>
    </nav>
  );

  // ── הכותרת והפירורים ──
  const crumbs = (
    <div className="kn-crumbs ta-crumbs">
      <button type="button" className="tc-back" onClick={() => { setPhoneList(true); window.scrollTo({ top: 0 }); }}><span aria-hidden="true">›</span> מס</button>
      {p.mode === 'learn' && p.domain && (
        <span className="ta-crumb-trail">
          <button type="button" className="kn-crumb" onClick={() => go({ mode: 'learn' })}>{MODE_LABEL.learn}</button>
          {item && <><span aria-hidden="true"> › </span><button type="button" className="kn-crumb" onClick={() => go({ mode: 'learn', domain: p.domain })}>{domain!.label}</button></>}
        </span>
      )}
    </div>
  );

  const workLinksFor = (d?: DomainId) => (d ? DOMAIN_BY_ID[d].workKinds.filter(k => WORK_BY_ID[k]).map(k => ({
    label: `${WORK_BY_ID[k].label}${work.counts[k].open ? ` (${work.counts[k].open})` : ''}`, onOpen: () => go({ mode: 'work', section: k }),
  })) : []);

  const toolBody = (t: Tool) => {
    switch (t) {
      case 'expenses': return <ExpenseKnowledge initialTopicId={null} />;
      case 'bookkeeping': return <BookkeepingKnowledge />;
      case 'wizard': return <CreditPointsWizard taxData={data} year={year} />;
      case 'rental': return <RentalRouteCalculator taxData={data} year={year} />;
      case 'incomeTax': return <IncomeTaxPanel taxData={data} year={year} />;
      case 'ni': return <NIReferenceSection taxData={data} year={year} />;
      case 'settlements': return <SettlementLookup year={year} />;
      case 'deadlines': return <DeadlinesTool year={year} domainLabel={d => DOMAIN_BY_ID[d].label} onOpenDomain={d => go({ mode: 'learn', domain: d })} />;
      // ‼ 16.10: הטופס עצמו עם הסימונים, מול תיק הלקוח שנכנסו ממנו; הבקרה הישנה (מה השתנה, כיסוי, מוכנות) — מקופלת מתחת
      case 'map1301': return (
        <>
          <FormMap domain="annual" clients={clients} contextClient={ctxClient} onBackToClient={ctxClient ? () => onOpenClient(ctxClient.id, 'taxfile') : undefined}
            canLearn={canLearn} onLearn={openTopic} />
          <details className="ta-control" data-map-control>
            <summary>בקרת הטופס: מה השתנה מול 2024, כיסוי לפי חלקים ומוכנות לקוח</summary>
            <Map1301 onOpenTopic={openTopic} clients={clients} contextClientId={contextClientId} onOpenClient={id => onOpenClient(id, 'taxfile')} />
          </details>
        </>
      );
      case 'maintenance': return <Maintenance year={year} freshnessPanel={<FreshnessPanel checkTaskExists={freshnessTaskExists} onCreateCheckTask={onCreateFreshnessTask} />} />;
      default: return null;
    }
  };

  const pane = (() => {
    if (p.mode === 'work') {
      return (
        <>
          {crumbs}
          <WorkOverview key={p.section} section={p.section} work={work}
            onOpenRequests={(clientId, stepId) => onOpenClient(clientId, 'journey', stepId)}
            onLearn={d => go({ mode: 'learn', domain: d })}
            top={<ShaamFilingPanel clients={clients} onOpenRequests={(clientId, stepId) => onOpenClient(clientId, 'journey', stepId)} onChanged={() => { void work.load(); }} />} />
        </>
      );
    }
    if (!domain) return <>{crumbs}<LearnHome year={year} onGo={go} moved={p.mode === 'learn' && !!p.moved} /></>;
    if (!item) return <>{crumbs}<DomainPage d={domain.id} year={year} onGo={go} counts={work.counts} focusValues={p.mode === 'learn' ? p.values : undefined} yearSelect={yearSelect} clients={clients} canLearn={canLearn} onLearn={openTopic} /></>;
    if (item.kind === 'topic') {
      return (
        <>
          {crumbs}
          <TopicPage key={item.id} topicId={item.id} year={year} clients={clients}
            context={ctxClient ? { id: ctxClient.id, name: `${ctxClient.firstName ?? ''} ${ctxClient.lastName ?? ''}`.trim(), client: ctxClient } : null}
            onBackToClient={ctxClient ? () => onOpenClient(ctxClient.id, 'taxfile') : undefined}
            onOpenClient={id => onOpenClient(id, 'taxfile')} onOpenTopic={openTopic} workLinks={workLinksFor(domain.id)} />
        </>
      );
    }
    const ds = TOOL_DATASET[item.id] ?? null;
    return (
      <>
        <div className="pg-head">
          <div className="pg-head-main">
            {crumbs}
            <div className="pg-title pg-title-lg">{item.label}</div>
            <div className="pg-status">{item.purpose}</div>
            {ds && <div className="tc-head-fresh"><FreshnessBadge datasetId={ds} /></div>}
          </div>
          {!YEARLESS.has(item.id) && <label className="tc-year">שנת מס{yearSelect}</label>}
        </div>
        {ds && <div className="ta-tool-fresh"><FreshnessBadge datasetId={ds} /></div>}
        {toolBody(item.id)}
      </>
    );
  })();

  return (
    <div className={`tax-center tax-area pg-split${phoneList ? '' : ' has-tool'}`} data-tax-area data-mode={p.mode}>
      {rail}
      <div className="pg-pane">{pane}</div>
    </div>
  );
}

// ── «ידע מקצועי» — דף הכניסה: תחום לכל כרטיס, וחיפוש על הכול ───────────────────────
// ‼ 15.10: החיפוש מוצא גם ערכים («מס רכישה» ← שכר דירה ונדל״ן), וכל כרטיס «ערך מפתח» מוביל לתחום שלו.
function LearnHome({ year, onGo, moved }: { year: number; onGo: (p: AreaPath) => void; moved: boolean }) {
  const [q, setQ] = useState('');
  const data = TAX_YEARS.find(t => t.year === year)!;
  const words = q.trim().split(/\s+/).filter(Boolean);
  // ‼ 15.10: כל המילים (לא «אחת מהן») — כמו בחיפוש הערכים
  const hits = words.length ? DOMAINS.flatMap(d => d.items.filter(i => words.every(w => (i.label + ' ' + i.purpose + ' ' + d.label + ' ' + (i.kind === 'topic' ? TOPIC_BY_ID[i.id]?.title ?? '' : '')).includes(w))).map(i => ({ d, i }))) : [];
  const valueHits = searchValues(words);
  const plannedHits = words.length ? DOMAINS.flatMap(d => (d.planned ?? []).filter(x => words.every(w => `${x.label} ${x.purpose}`.includes(w))).map(x => ({ d, x }))) : [];
  const keyValues: { label: string; value: string; sub: string; to: AreaPath }[] = [
    { label: 'ערך נקודת זיכוי', value: fmt(data.creditPointValue), sub: 'לשנה', to: { mode: 'learn', domain: 'credits' } },
    { label: 'סף מס יסף', value: fmt(data.surtaxThreshold), sub: data.surtaxCapitalExtraRate > 0 ? '3% + 2% על הוני' : '3%', to: { mode: 'learn', domain: 'credits', item: 'incomeTax' } },
    { label: 'פטור שכר דירה', value: fmt(data.rentalExemptMonthly), sub: 'לחודש', to: { mode: 'learn', domain: 'rent', values: 'realEstate' } },
    { label: 'שכר ממוצע (ב"ל)', value: fmt(data.niAverageWage), sub: 'לחודש', to: { mode: 'learn', domain: 'ni', item: 'ni' } },
    { label: 'תקרת ב"ל חודשית', value: fmt(data.niMaxIncomeMonthly), sub: 'לחודש', to: { mode: 'learn', domain: 'ni', item: 'ni' } },
  ];
  return (
    <div className="ta-learn">
      <header className="ta-page-head">
        <h2 className="tw-h">{MODE_LABEL.learn}</h2>
        <p className="tw-lead">תחום לכל נושא מקצועי. בכל תחום: מה זה ומתי חל, ללמוד ולבדוק, הערכים לשנה, מה מבקשים מהלקוח, והעבודה בתיקים.</p>
      </header>
      {moved && (
        <section className="ta-moved" role="status" aria-labelledby="ta-moved-h" data-moved>
          <h3 className="ta-sec-h" id="ta-moved-h">«ערכים לפי נושא» עברו לתחומים</h3>
          <p className="kn-small kn-muted">כל ערך נמצא עכשיו בעמוד התחום שלו, תחת «ערכים לשנה» — ליד ההסבר, השאלון והעבודה בתיקים.</p>
          <ul className="ta-moved-list">
            {MOVED_GROUPS.map(m => (
              <li key={m.from}>
                <button type="button" className="kn-link" data-moved-to={`${m.domain}/${m.group ?? m.item}`}
                  onClick={() => onGo(m.item ? { mode: 'learn', domain: m.domain, item: m.item } : { mode: 'learn', domain: m.domain, values: m.group })}>
                  {m.from}
                </button>
                <span className="kn-muted"> ← {DOMAIN_BY_ID[m.domain].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <label className="kn-field" htmlFor="ta-q">חיפוש בכל התחומים
        <input id="ta-q" className="kn-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="למשל: קרן השתלמות, מס רכישה, עוסק פטור" />
      </label>
      {words.length > 0 && (
        <div className="ta-hits" role="status">
          {hits.length === 0 && valueHits.length === 0 && plannedHits.length === 0 ? <p className="kn-muted kn-small">לא נמצא. נסו מילה אחרת — או פתחו את התחום מהרשימה.</p> : (
            <ul className="ta-item-list">
              {hits.map(({ d, i }) => (
                <li key={d.id + i.id}><button type="button" className="ta-item" onClick={() => onGo({ mode: 'learn', domain: d.id, item: i.id })}>
                  <span className="ta-item-t">{i.label}</span><span className="ta-item-p">{d.label} · {i.purpose}</span></button></li>
              ))}
              {plannedHits.map(({ d, x }) => (
                <li key={`p.${d.id}.${x.label}`}><button type="button" className="ta-item is-planned" data-planned-hit={d.id} onClick={() => onGo({ mode: 'learn', domain: d.id })}>
                  <span className="ta-item-kind">טרם נכתב</span>
                  <span className="ta-item-t">{x.label}</span><span className="ta-item-p">{d.label} · {x.purpose}</span></button></li>
              ))}
              {valueHits.map(h => (
                <li key={`${h.domain}.${h.group}.${h.label}`}><button type="button" className="ta-item" data-value-hit={`${h.domain}/${h.group}`} onClick={() => onGo({ mode: 'learn', domain: h.domain, values: h.group })}>
                  <span className="ta-item-kind">ערך</span>
                  <span className="ta-item-t">{h.label}</span><span className="ta-item-p">{DOMAIN_BY_ID[h.domain].label} · {h.groupTitle}</span></button></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="ta-domains">
        {DOMAINS.map(d => (
          <button key={d.id} type="button" className="ta-dom-card" onClick={() => onGo({ mode: 'learn', domain: d.id })} data-domain-card={d.id}>
            <span className="ta-dom-t">{d.label}</span>
            <span className="ta-dom-p">{d.what}</span>
            <span className="ta-dom-n">{[...d.items.map(i => i.label), ...(valueGroupsOf(d.id).length ? ['ערכים לשנה'] : [])].join(' · ')}</span>
          </button>
        ))}
      </div>
      <div className="pg-rail-eyebrow" style={{ marginTop: 18 }}>ערכי מפתח · {year}</div>
      <div className="tc-keyvals">
        {keyValues.map(card => (
          <button key={card.label} type="button" className="tc-keyval ta-keyval" onClick={() => onGo(card.to)} data-keyval={card.label}>
            <span className="tc-keyval-num">{card.value}</span>
            <span className="tc-keyval-label">{card.label}</span>
            <span className="tc-keyval-sub">{card.sub}</span>
          </button>
        ))}
      </div>
      <p className="tc-fresh-note">מהמאגר הקיים. מה נבדק בכל ערך — ב«מקורות ועדכניות» ← «עדכניות ותחזוקה».</p>
    </div>
  );
}

// ── עמוד תחום (16.10.2026): מה זה ← הטופס או הכלי ← הערכים לשנה ← מה מבקשים מהלקוח ← ללמוד לעומק ──────────
// ‼ גיא (16.10): ההסבר הקצר — ליד השדה בטופס; הלימוד הארוך — בנפרד («ללמוד לעומק»). עמוד התחום אינו מאמר.
// ‼ «דוח שנתי» ו«הצהרת הון»: הטופס הרשמי עצמו עם הסימונים (FormMap) הוא העמוד.
const FORM_DOMAINS: Partial<Record<DomainId, 'annual' | 'wealth'>> = { annual: 'annual', wealth: 'wealth' };

function DomainPage({ d, year, onGo, counts, focusValues, yearSelect, clients, canLearn, onLearn }: {
  d: DomainId; year: number; onGo: (p: AreaPath) => void; counts: ReturnType<typeof useTaxWork>['counts']; focusValues?: string; yearSelect: ReactNode;
  clients: Client[]; canLearn: (id: string) => boolean; onLearn: (id: string) => void;
}) {
  const dom = DOMAIN_BY_ID[d];
  // ‼ אותו מקור ואותו רכיב כמו בשלב «מה מבקשים מהלקוח» של מסלול הלימוד — הכמויות והפירוט נגזרים מאותה רשימה.
  const areas = useMemo(() => askAreasView(askAreasOf(dom)), [dom]);
  const formDomain = FORM_DOMAINS[d];
  const itemLine = (i: DomainItem) => {
    const t = i.kind === 'topic' ? TOPIC_BY_ID[i.id] : undefined;
    const st = t ? plainStatus(t.status, weakestBasis(t.ruleIds, year), t.gaps.length) : undefined;
    return (
      <li key={i.id}>
        <button type="button" className="ta-item" onClick={() => onGo({ mode: 'learn', domain: d, item: i.id })} data-domain-item={i.id}>
          <span className="ta-item-kind">{i.kind === 'topic' ? 'מסלול לימוד' : 'כלי'}</span>
          <span className="ta-item-t">{i.label}</span>
          <span className="ta-item-p">{i.purpose}</span>
          {st && <span className={`ta-item-st is-${st.tone}`}>{st.label}</span>}
        </button>
      </li>
    );
  };
  // ‼ 16.10: מה שחסר בתחום — גלוי, לא מוסתר: שם, מה יעשה, מה יש היום, והאם צריך מחקר
  const plannedLine = (x: PlannedItem) => (
    <li key={x.label} className="ta-planned" data-planned={x.label}>
      <span className="ta-item-kind">{x.kind === 'tool' ? 'כלי' : 'נושא'} · <b className="ta-planned-tag">טרם נכתב</b></span>
      <span className="ta-item-t">{x.label}</span>
      <span className="ta-item-p">{x.purpose}</span>
      {x.today && <span className="ta-planned-now">היום: {x.today}</span>}
      <span className="ta-planned-res">{x.research}</span>
    </li>
  );
  const plannedTools = (dom.planned ?? []).filter(x => x.kind === 'tool');
  const plannedTopics = (dom.planned ?? []).filter(x => x.kind === 'topic');
  // בתחום עם טופס — כלי «בקרת הטופס» נפתח מתוך הטופס, לא כפריט נוסף ברשימה
  const tools = dom.items.filter(i => i.kind === 'tool' && !(formDomain && i.id === 'map1301'));
  const topics = dom.items.filter(i => i.kind === 'topic');
  const seeAlso = (dom.seeAlso ?? []).filter(x => TOPIC_BY_ID[x.id] && domainOf(x.id));
  const works = dom.workKinds.filter(k => WORK_BY_ID[k]);
  const hasValues = valueGroupsOf(d).length > 0;
  return (
    <div className={`ta-domain-page${formDomain ? ' has-form' : ''}`} data-domain={d}>
      <header className="ta-page-head">
        <h2 className="tw-h">{dom.label}</h2>
        <p className="tw-lead">{dom.what}</p>
        <p className="ta-when"><b>מתי רלוונטי:</b> {dom.when}</p>
      </header>
      {formDomain && (
        <section aria-labelledby="ta-form-h" data-domain-form>
          <h3 className="ta-sec-h" id="ta-form-h">{formDomain === 'annual' ? 'הטופס — שדה אחר שדה' : 'טופס 1219 — שורה אחר שורה'}</h3>
          <FormMap key={formDomain} domain={formDomain} clients={clients} canLearn={canLearn} onLearn={onLearn} />
          {formDomain === 'annual' && (
            <p className="ta-form-more"><button type="button" className="ta-link" onClick={() => onGo({ mode: 'learn', domain: d, item: 'map1301' })} data-domain-control>בקרת הטופס: מה השתנה מול 2024, כיסוי לפי חלקים ומוכנות לקוח ←</button></p>
          )}
        </section>
      )}
      {(tools.length > 0 || plannedTools.length > 0) && (
        <section aria-labelledby="ta-tools-h">
          <h3 className="ta-sec-h" id="ta-tools-h">{tools.length + plannedTools.length === 1 ? 'הכלי' : 'הכלים'}</h3>
          {tools.length > 0 && <ul className="ta-item-list">{tools.map(itemLine)}</ul>}
          {plannedTools.length > 0 && (
            <details className="ta-planned-box" data-planned-tools={plannedTools.length}>
              <summary>{plannedTools.length === 1 ? 'כלי אחד שעוד לא נבנה' : `${plannedTools.length} כלים שעוד לא נבנו`}</summary>
              <ul className="ta-item-list">{plannedTools.map(plannedLine)}</ul>
            </details>
          )}
        </section>
      )}
      {hasValues && (
        <section aria-labelledby="ta-val-h">
          <h3 className="ta-sec-h" id="ta-val-h">ערכים לשנה</h3>
          <DomainValues domain={d} year={year} focusGroup={focusValues} yearControl={<label className="ta-val-year">שנת מס{yearSelect}</label>} />
        </section>
      )}
      {areas.length > 0 && (
        <section aria-labelledby="ta-ask-h">
          <h3 className="ta-sec-h" id="ta-ask-h">מה מבקשים מהלקוח</h3>
          <ClientAsksPanel areas={areas} level={4} idPrefix={`ta-ask-${d}`} />
        </section>
      )}
      {(topics.length > 0 || dom.learnGap || plannedTopics.length > 0 || seeAlso.length > 0 || (dom.notes ?? []).length > 0) && (
        <section aria-labelledby="ta-learn-h">
          <h3 className="ta-sec-h" id="ta-learn-h">ללמוד לעומק</h3>
          {topics.length > 0 && <ul className="ta-item-list">{topics.map(itemLine)}</ul>}
          {seeAlso.length > 0 && (
            <ul className="ta-item-list" data-see-also>
              {seeAlso.map(x => {
                const home = domainOf(x.id)!;
                return (
                  <li key={x.id}>
                    <button type="button" className="ta-item" onClick={() => onGo({ mode: 'learn', domain: home, item: x.id })} data-see-also-item={x.id}>
                      <span className="ta-item-kind">מסלול לימוד · בתחום «{DOMAIN_BY_ID[home].label}»</span>
                      <span className="ta-item-t">{TOPIC_BY_ID[x.id].title}</span>
                      <span className="ta-item-p">{x.why}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {(dom.notes ?? []).map(n => (
            <div key={n.id} className="ta-note" data-domain-note={n.id}>
              <h4 className="ta-note-h">{n.title}</h4>
              <ul>{n.points.map(p => <li key={p.text}>{p.text} <ClaimTag status={p.status} /></li>)}</ul>
              {n.where && <p className="ta-note-where">{n.where}</p>}
            </div>
          ))}
          {dom.learnGap && <p className="ta-gap" data-learn-gap>{dom.learnGap}</p>}
          {plannedTopics.length > 0 && (
            <details className="ta-planned-box" data-planned-topics={plannedTopics.length}>
              <summary>{plannedTopics.length === 1 ? 'נושא אחד שעוד לא נכתב' : `${plannedTopics.length} נושאים שעוד לא נכתבו`}</summary>
              <ul className="ta-item-list">{plannedTopics.map(plannedLine)}</ul>
            </details>
          )}
        </section>
      )}
      {works.length > 0 && (
        <section aria-labelledby="ta-work-h">
          <h3 className="ta-sec-h" id="ta-work-h">העבודות אצל הלקוחות</h3>
          <div className="kn-row">{works.map(k => (
            <button key={k} type="button" className="btn btn-secondary btn-sm" onClick={() => onGo({ mode: 'work', section: k })} data-domain-work={k}>
              {WORK_BY_ID[k].label}{counts[k].open ? ` · ${counts[k].open} פתוחות` : ''}
            </button>
          ))}</div>
        </section>
      )}
    </div>
  );
}

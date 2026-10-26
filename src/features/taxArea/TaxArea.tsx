// ─── «מס» — עבודות לקוחות וידע מקצועי באזור אחד (14.10.2026) ─────────────────────────────────────
// ‼ גיא (14.10): «ידע מס» ו«עבודת מס» היו דומים בשם ובמקומות שונים. עכשיו כניסה אחת, ושני מרחבים בשמות ברורים:
//   «עבודות לקוחות» — עמוד לכל סוג עבודה (קליטה, דוחות, הצהרות הון, הערכות), ו«כל העבודות» כסקירה;
//   «ידע מקצועי» — עמוד לכל תחום (דוח שנתי, פנסיה, ב״ל…), ובתוכו הנושאים והכלים של התחום, לא רשימה ארוכה אחת.
// ‼ הכתובת קובעת (‎#/tax/…‎, areaModel.ts) — «אחורה» בדפדפן חוזר לעמוד הקודם, גם בין המרחבים.
// ‼ 21.10.2026 (הצעה מאושרת docs/proposals/2026-10-21-tax-area-reimagined.html): בלי מסילה. בראש — מתג אחד
//   «עבודות לקוח | ידע מקצועי»; «ידע מקצועי» נפתח בספרייה (AskHome, 25.10), ותחום/נושא/כלי — עם פירורים ושנת מס.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import TopicPage, { BODIES } from '../taxKnowledge/TopicPage';
import { readingPeriod } from '../taxKnowledge/learnPath';
import { saveLastRead } from '../taxKnowledge/readingMarks';
import { requestSearchFocus } from '../taxKnowledge/searchHighlight';
import AddMaterial, { type MaterialContext } from '../taxKnowledge/ask/AddMaterial';
import Map1301 from '../taxKnowledge/Map1301';
import Maintenance from '../taxKnowledge/Maintenance';
import { TOPIC_BY_ID } from '../taxKnowledge/topics';
import { plainStatus, askAreasView } from '../taxKnowledge/learnPath';
import ClientAsksPanel from '../taxKnowledge/ClientAsksPanel';
import { ClaimTag } from '../taxKnowledge/claim';
import DomainValues, { DeadlinesTool } from '../taxKnowledge/DomainValuesPanel';
import { valueGroupsOf } from '../taxKnowledge/domainValues';
import { SOURCE_DOCS } from '../taxKnowledge/sourceDocs';
import { weakestBasis } from '../taxRules/registry';
import WorkOverview from './WorkOverview';
import AskHome from '../taxKnowledge/ask/AskHome';
import { ShaamFilingPanel } from '../shaamFiling';
import FormMap from '../taxKnowledge/formMap/FormMap';
import DocCards from '../taxKnowledge/topics/DocCards';
import { MAP_FORM_BY_SLUG, fieldsOf, type FormSlug } from '../taxKnowledge/formMap/model';
import { useTaxWork } from '../taxYear/useTaxWork';
import {
  DOMAIN_BY_ID, MODE_LABEL, WORK_BY_ID,
  advanceTrail, askAreasOf, clampYear, defaultYearFor, domainOf, formatAreaPath, itemOf, parseAreaPath, reportSeasonYear, returnTargetOf, type AreaPath, type DomainId, type DomainItem, type PlannedItem,
} from './areaModel';
import './taxArea.css';

// ── מסגרת לכל כלי (26.10.2026, ההדמיה המאושרת): מה הכלי מחשב ומה לא, מקור רשמי לעיון, וההסבר בתחום שלו ──
// ‼ «תחום השימוש» אומר מתי התוצאה אינה תשובה — לא הסתייגות כללית. מאגר משולב (הוצאות, ניהול ספרים) — השנה בכל פריט.
const TOOL_META: Partial<Record<Tool, { type: string; scope: string; source: string; mixed?: boolean }>> = {
  wizard: { type: 'חישוב', scope: 'החישוב מניח מצב משפחתי קבוע לאורך השנה. אירוע משפחתי, דחייה נפרדת לכל ילד ותקופות זכאות מיוחדות דורשים בדיקה פרטנית.', source: 'https://www.btl.gov.il/Laws1/00_0103_000000.pdf' },
  rental: { type: 'השוואת מסלולים', scope: 'משווים מסלולי מס הכנסה לפי הנתונים שהוזנו. סיווג עסק, שימוש בנכס וביטוח לאומי נבדקים בנפרד.', source: 'https://www.btl.gov.il/Laws1/00_0103_000000.pdf' },
  incomeTax: { type: 'טבלאות וחישוב', scope: 'שיעורי המס אינם לבדם שומה סופית. זיכויים, פטורים ומס נוסף נבחנים לפי סוג ההכנסה והתיק.', source: 'https://www.gov.il/he/departments/topics/income_tax/govil-landing-page' },
  ni: { type: 'טבלאות וחישוב', scope: 'מגדירים תחילה את סוג המבוטח, מקור ההכנסה והתקופה. ההפחתה בבסיס דמי הביטוח והניכוי בדוח המס הן בדיקות נפרדות.', source: 'https://www.btl.gov.il/Insurance/Rates/Pages/default.aspx' },
  settlements: { type: 'איתור נתונים', scope: 'הופעה ברשימה אינה בדיקת תושבות. האומדן לפי הכנסה מוגבל למס החל על ההכנסה המזכה; חיפוש בלי התאמה אינו קביעת אי־זכאות.', source: 'https://www.gov.il/he/departments/topics/income_tax/govil-landing-page' },
  expenses: { type: 'מדריך עבודה', scope: 'מאגר עיון משולב לשנים 2025 ו־2026. הדוגמאות והתקרות נבחנות לפי השנה שמצוינת בכל פריט.', source: 'https://www.btl.gov.il/Laws1/00_0103_000000.pdf', mixed: true },
  bookkeeping: { type: 'מדריך ואיתור', scope: 'מאגר עיון משולב לשנים 2025 ו־2026. תנאי הענף המלאים ושנת התחולה קודמים לתוצאת האשף; נתון חסר אינו אפס.', source: 'https://www.gov.il/he/departments/topics/income_tax/govil-landing-page', mixed: true },
  deadlines: { type: 'לוח עזר', scope: 'לוח כללי אינו מחליף דרישה אישית, ארכה למייצג או עדכון רשמי. את חובות הלקוחות והמועדים שנקלטו מנהלים בתיקים.', source: 'https://www.gov.il/he/departments/israel_tax_authority/govil-landing-page' },
};

/** נקודות זיכוי בשנה שהיה בה אירוע משפחתי — לא מחשבים כאן את שנת האירוע (סעיף 41), אומרים מה כן. */
function CreditEventScope({ children, onOpenDomain }: { children: ReactNode; onOpenDomain: () => void }) {
  const [event, setEvent] = useState(false);
  return (
    <>
      <section className="ta-credit-scope" data-credit-scope>
        <label><input type="checkbox" checked={event} onChange={e => setEvent(e.target.checked)} data-credit-event /> בשנת המס היו נישואין, גירושין, פרידה או פטירה של בן/בת זוג</label>
        {event ? (
          <div role="status">
            <h3>כאן צריך חישוב לפי תקופות ותחולה</h3>
            <p>סעיף 41 קובע חלוקה חודשית בנסיבות המנויות בו לבן זוג שאינו הרשום שהיה נשוי חלק מהשנה. סעיף 40(ב)(3) כולל גם ילד שאחד מהוריו נפטר בשנת המס. תאריך האירוע המלא, זהות בן הזוג הרשום, הילדים ואופן החישוב נבדקים יחד.</p>
            <p>המחשבון אינו מחשב את שנת האירוע. מכינים נייר עבודה לפי הסעיפים; המצב ב־31.12 לבדו אינו תשובה לחישוב השנתי.</p>
            <button type="button" className="kn-link" onClick={onOpenDomain}>להסבר ולמקורות על שנת האירוע ←</button>
          </div>
        ) : <p className="kn-xs kn-muted">המחשבון מניח מצב משפחתי קבוע לאורך השנה. דחיית נקודה לכל ילד, דחייה לשנת הלידה ותקופות זכאות מיוחדות — מחוץ למחשבון.</p>}
      </section>
      {!event && children}
    </>
  );
}

/** כלים שאינם תלויים בשנת המס. */
const YEARLESS = new Set<Tool>(['expenses', 'bookkeeping', 'map1301']);

interface Props {
  /** מה שאחרי ‎#/tax/‎ — ‎"work/annual"‎ · ‎"learn/savings/pensionSE"‎. */
  path: string;
  onPath: (path: string) => void;
  /** ‼ 21.10: בלי מסילה אין «חזרה ללקוחות» (הסרגל העליון מוביל לשם). נשאר בממשק — App מעביר אותו. */
  onBack: () => void;
  freshnessTaskExists: boolean;
  onCreateFreshnessTask: () => void;
  clients: Client[];
  /** נושא שנפתח מתוך תיק לקוח — לחזרה ולמילוי מה שידוע. */
  contextTopic?: string | null;
  contextClientId?: string | null;
  /** שנת העבודה שממנה נכנסו (שורת הגשה בתיק) — גוברת על שנה שנבחרה קודם. */
  contextYear?: number | null;
  /** ‼ 16.10: 'journey' = לשונית «בקשות» של הלקוח; focusStepId — הבקשה שממנה הגיעו (המיקוד לשורה — בצד הבקשות). */
  onOpenClient: (clientId: string, tab?: 'taxfile' | 'docs' | 'journey', focusStepId?: string) => void;
}

export default function TaxArea({ path, onPath, freshnessTaskExists, onCreateFreshnessTask, clients, contextTopic = null, contextClientId = null, contextYear = null, onOpenClient }: Props) {
  const p = useMemo(() => parseAreaPath(path), [path]);
  const work = useTaxWork(clients);
  // ‼ 25.10.2026: שנה שנבחרה ביד נשמרת; אחרת — לפי סוג העמוד (defaultYearFor), ומתיק לקוח — שנת הדוח שלו
  // שנה שנבחרה ביד נשמרת גם ברענון (בלשונית הזו בלבד)
  const [chosenYear, setChosenYear] = useState<number | null>(() => { try { const v = Number(sessionStorage.getItem('pivo.tax.year')); return AVAILABLE_YEARS.includes(v) ? v : null; } catch { return null; } });
  const setYear = (y: number) => { setChosenYear(y); try { sessionStorage.setItem('pivo.tax.year', String(y)); } catch { /* בלי אחסון — רק עד הרענון */ } };
  const [lastWork, setLastWork] = useState<string>(p.mode === 'work' ? formatAreaPath(p) : 'work/all');
  const [lastLearn, setLastLearn] = useState<string>(p.mode === 'learn' ? formatAreaPath(p) : 'learn');
  useEffect(() => { if (p.mode === 'work') setLastWork(formatAreaPath(p)); else setLastLearn(formatAreaPath(p)); }, [p]);
  // ‼ כניסה מתיק לקוח לנושא — נשארים בהקשר הלקוח כל עוד הנושא הזה פתוח
  const ctxClient = useMemo(() => (contextClientId && p.mode === 'learn' && p.item === contextTopic ? clients.find(c => c.id === contextClientId) ?? null : null), [clients, contextClientId, contextTopic, p]);
  // ‼ מתיק לקוח — שנת העבודה שלו (מהשורה, אחרת עונת הדוחות); אחרת שנה שנבחרה, ואחרת לפי סוג העמוד
  const year = ctxClient ? clampYear(contextYear ?? reportSeasonYear(), AVAILABLE_YEARS) : chosenYear ?? defaultYearFor(p, AVAILABLE_YEARS);

  const go = (next: AreaPath | string) => {
    onPath(typeof next === 'string' ? next : formatAreaPath(next));
    window.scrollTo({ top: 0 });
  };
  const openTopic = (id: string) => go({ mode: 'learn', domain: domainOf(id), item: id });
  const openTool = (id: string) => { const d = domainOf(id); if (d) go({ mode: 'learn', domain: d, item: id }); };
  const canLearn = (id: string) => !!domainOf(id);
  const data = TAX_YEARS.find(t => t.year === year)!;
  const yearSelect = (
    <select value={year} onChange={e => setYear(+e.target.value)} aria-label="שנת מס">
      {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  const item = itemOf(p);
  const domain = p.mode === 'learn' && p.domain ? DOMAIN_BY_ID[p.domain] : undefined;
  const sub = p.mode === 'learn' ? p.sub ?? null : null;
  // ‼ סעיף שנכתב לשנה אחת — הנושא מציג «שנת מס X · קבועה», ואין בורר שנה שמבטיח משהו אחר
  const fixedYear = item?.kind === 'topic' && readingPeriod(item.id, sub, year).fixed;
  // «להמשיך מהמקום האחרון» בספרייה — הנושא, ואם נפתח — הסיכום או השלב
  useEffect(() => {
    if (item?.kind !== 'topic') return;
    const t = TOPIC_BY_ID[item.id];
    const where = sub === 'summary' ? 'הסיכום המקצועי' : sub === 'apply' ? 'יישום בתיק' : sub ? BODIES[item.id]?.toc.find(x => x.id === sub)?.label : undefined;
    if (t) saveLastRead({ path: formatAreaPath(p), title: where ? `${t.title} · ${where}` : t.title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, sub]);

  // ── המתג בראש: שני מרחבים, וכל אחד חוזר לעמוד האחרון שהיה בו; לחיצה על המרחב הפעיל — לדף הבית שלו ──
  const modes = (
    <div className="ta2-top">
      <div className="ta2-modes" role="group" aria-label="מס">
        {(['work', 'learn'] as const).map(m => (
          <button key={m} type="button" className={`ta2-mode${p.mode === m ? ' is-on' : ''}`} aria-pressed={p.mode === m}
            onClick={() => {
              if (p.mode !== m) { onPath(m === 'work' ? lastWork : lastLearn); window.scrollTo({ top: 0 }); }
              else if (p.mode === 'learn' && p.domain) go({ mode: 'learn' });
              else if (p.mode === 'work' && p.section !== 'all') go({ mode: 'work', section: 'all' });
            }} data-mode={m}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );

  // ── «חזרה ל…» — העמוד שממנו הגיעו (טופס, כלי, נושא אחר), לא רק «אחורה» בדפדפן ──
  const trailRef = useRef<string[]>([]);
  const [backTo, setBackTo] = useState<string | null>(null);
  useEffect(() => {
    if (p.mode !== 'learn') { trailRef.current = []; setBackTo(null); return; }
    trailRef.current = advanceTrail(trailRef.current, formatAreaPath(p));
    setBackTo(returnTargetOf(trailRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  const backLabel = (target: string) => {
    const b = parseAreaPath(target);
    if (b.mode !== 'learn' || !b.domain) return '';
    if (b.code) return `חזרה לטופס ${b.domain === 'wealth' ? '1219' : '1301'} · קוד ${b.code}`;
    if (b.form) {
      const slug = b.form as FormSlug;
      const formId = MAP_FORM_BY_SLUG[slug]?.formId ?? b.form;
      const label = b.field && MAP_FORM_BY_SLUG[slug] ? fieldsOf(slug).find(f => f.key === b.field)?.label : undefined;
      return `חזרה לטופס ${formId}${b.mark ? ` · קוד ${b.mark}` : label ? ` · ${label}` : ''}`;
    }
    if (b.doc) return `חזרה למסמך «${SOURCE_DOCS.find(x => x.id === b.doc)?.title.split(' — ')[0] ?? b.doc}»`;
    const it = itemOf(b);
    if (!it) return `חזרה ל«${DOMAIN_BY_ID[b.domain].label}»`;
    return it.kind === 'topic' ? `חזרה ל«${it.label}»` : `חזרה לכלי «${it.label}»`;
  };
  // ── «＋ חומר חדש» מכל עמוד — עם המקום שבו עלה (נושא/שלב/כלי/טופס) ושנת המס ──
  const [material, setMaterial] = useState<MaterialContext | null>(null);
  const materialContext = (seed?: string): MaterialContext => {
    const d = p.mode === 'learn' ? p.domain : undefined;
    const it = itemOf(p);
    const where = it?.kind === 'topic' && sub ? (sub === 'summary' ? 'הסיכום המקצועי' : sub === 'apply' ? 'יישום בתיק' : BODIES[it.id]?.toc.find(x => x.id === sub)?.label) : undefined;
    const label = it ? `${it.label}${where ? ` · ${where}` : ''}` : p.mode === 'learn' && p.code ? `טופס ${d === 'wealth' ? '1219' : '1301'} · קוד ${p.code}` : d ? DOMAIN_BY_ID[d].label : 'הידע המקצועי';
    return { label, domain: d, year: d === 'wealth' ? 'ליום ההצהרה' : String(year), seed };
  };
  // ── חיפוש מכל עמוד: הכפתור ו-Ctrl+K פותחים את הספרייה עם הסמן בתיבה ──
  const openSearch = () => {
    if (p.mode === 'learn' && !p.domain) { document.querySelector<HTMLInputElement>('[data-ask-input]')?.focus(); return; }
    requestSearchFocus(); go({ mode: 'learn' });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── הכותרת והפירורים ──
  const crumbs = p.mode === 'learn' && p.domain ? (
    <div className="kn-crumbs ta-crumbs ta2-crumbs">
      <span className="ta-crumb-trail">
        <button type="button" className="kn-crumb" onClick={() => go({ mode: 'learn' })}>{MODE_LABEL.learn}</button>
        {item && <><span aria-hidden="true"> › </span><button type="button" className="kn-crumb" onClick={() => go({ mode: 'learn', domain: p.domain })}>{domain!.label}</button></>}
      </span>
      <span className="ta2-crumb-tools">
        <button type="button" className="ta2-search" onClick={openSearch} aria-label="חיפוש בידע המקצועי (Ctrl+K)" data-ta-search>⌕ חיפוש</button>
        <button type="button" className="ta2-search" onClick={() => setMaterial(materialContext())} aria-label="הוספת חומר או שאלה על העמוד הזה" data-ta-material>＋ חומר חדש</button>
        {!fixedYear && <label className="ta2-year">שנת מס{yearSelect}</label>}
      </span>
    </div>
  ) : null;
  const returnBar = p.mode === 'learn' && backTo ? (
    <div className="ta2-return"><button type="button" className="kn-link" onClick={() => go(backTo)} data-ta-return>→ {backLabel(backTo)}</button></div>
  ) : null;

  const workLinksFor = (d?: DomainId) => (d ? DOMAIN_BY_ID[d].workKinds.filter(k => WORK_BY_ID[k]).map(k => ({
    label: `${WORK_BY_ID[k].label}${work.counts[k].open ? ` (${work.counts[k].open})` : ''}`, onOpen: () => go({ mode: 'work', section: k }),
  })) : []);

  // מה שנבחר בתוך הכלי — בכתובת, כדי ש«אחורה» ורענון יחזירו לאותו מקום
  const setSub = (s: string | null) => { if (p.mode === 'learn') go({ mode: 'learn', domain: p.domain, item: p.item, sub: s ?? undefined }); };
  const toolBody = (t: Tool) => {
    switch (t) {
      case 'expenses': return <ExpenseKnowledge selected={sub} onSelect={setSub} />;
      case 'bookkeeping': return <BookkeepingKnowledge selected={sub} onSelect={setSub} />;
      case 'wizard': return <CreditEventScope onOpenDomain={() => go({ mode: 'learn', domain: 'credits' })}><CreditPointsWizard taxData={data} year={year} /></CreditEventScope>;
      case 'rental': return <RentalRouteCalculator taxData={data} year={year} />;
      case 'incomeTax': return <IncomeTaxPanel taxData={data} year={year} />;
      case 'ni': return <NIReferenceSection taxData={data} year={year} />;
      case 'settlements': return <SettlementLookup year={year} />;
      case 'deadlines': return <DeadlinesTool year={year} domainLabel={d => DOMAIN_BY_ID[d].label} onOpenDomain={d => go({ mode: 'learn', domain: d })} />;
      // ‼ 16.10: הטופס עצמו עם הסימונים, מול תיק הלקוח שנכנסו ממנו; הבקרה הישנה (מה השתנה, כיסוי, מוכנות) — מקופלת מתחת
      case 'map1301': return (
        <>
          <FormMap domain="annual" clients={clients} contextClient={ctxClient} onBackToClient={ctxClient ? () => onOpenClient(ctxClient.id, 'taxfile') : undefined}
            canLearn={canLearn} onLearn={openTopic} onOpenTool={openTool} year={year} />
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
          <WorkOverview key={p.section} section={p.section} work={work}
            onOpenRequests={(clientId, stepId) => onOpenClient(clientId, 'journey', stepId)}
            onLearn={d => go({ mode: 'learn', domain: d })}
            onSection={s => go({ mode: 'work', section: s })}
            top={<ShaamFilingPanel clients={clients} onOpenRequests={(clientId, stepId) => onOpenClient(clientId, 'journey', stepId)} onChanged={() => { void work.load(); }} />} />
        </>
      );
    }
    if (!domain) return <AskHome onGo={go} onOpenTopic={openTopic} moved={p.mode === 'learn' && !!p.moved} />;
    if (!item) return <>{crumbs}<DomainPage d={domain.id} year={year} onGo={go} counts={work.counts} focusValues={p.mode === 'learn' ? p.values : undefined} focusCode={p.mode === 'learn' ? p.code : undefined} yearSelect={yearSelect} clients={clients} canLearn={canLearn} onLearn={openTopic} onOpenTool={openTool}
      focus={p.mode === 'learn' ? { form: p.form, field: p.field, mark: p.mark, doc: p.doc } : {}}
      onField={v => onPath(formatAreaPath({ mode: 'learn', domain: domain.id, ...v }))}
      onOpenDomain={id => { if (DOMAIN_BY_ID[id as DomainId]) go({ mode: 'learn', domain: id as DomainId }); }} /></>;
    if (item.kind === 'topic') {
      return (
        <>
          {crumbs}
          <TopicPage key={item.id} topicId={item.id} year={year} clients={clients}
            context={ctxClient ? { id: ctxClient.id, name: `${ctxClient.firstName ?? ''} ${ctxClient.lastName ?? ''}`.trim(), client: ctxClient } : null}
            onBackToClient={ctxClient ? () => onOpenClient(ctxClient.id, 'taxfile') : undefined}
            onOpenClient={id => onOpenClient(id, 'taxfile')} onOpenTopic={openTopic} workLinks={workLinksFor(domain.id)}
            section={sub} onSection={setSub}
            onOpenForm={t => go(t.code ? { mode: 'learn', domain: t.domain, code: t.code } : { mode: 'learn', domain: t.domain })} />
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
        {TOOL_META[item.id] && (
          <div className="ta-tool-meta" data-tool-meta={item.id}>
            <span className="kn-xs kn-eyebrow">{TOOL_META[item.id]!.type}{TOOL_META[item.id]!.mixed ? ' · מאגר משולב, השנה מצוינת בפריט' : ''}</span>
            <details><summary>תחום השימוש והמקורות</summary>
              <p>{TOOL_META[item.id]!.scope}</p>
              <a href={TOOL_META[item.id]!.source} target="_blank" rel="noreferrer">מקור רשמי לעיון ↗</a>
              <p className="kn-xs kn-muted">קישור לתשתית הדין או לרשות. הפניות ממוקדות — ליד הטבלה או ההסבר.</p>
            </details>
            <button type="button" className="kn-link" onClick={() => go({ mode: 'learn', domain: domain.id })}>הסבר ונתונים קשורים ←</button>
            {item.id === 'deadlines' && <button type="button" className="kn-link" onClick={() => go({ mode: 'work', section: 'all' })}>קליטת חובות לקוחות משע״ם ←</button>}
          </div>
        )}
        {toolBody(item.id)}
      </>
    );
  })();

  return (
    <div className="tax-center tax-area ta2 has-tool" data-tax-area data-mode={p.mode}>
      {modes}
      <div className="pg-pane ta2-pane">{returnBar}{pane}</div>
      {material && <AddMaterial context={material} onClose={() => setMaterial(null)} />}
    </div>
  );
}

// ── עמוד תחום (16.10.2026): מה זה ← הטופס או הכלי ← הערכים לשנה ← מה מבקשים מהלקוח ← ללמוד לעומק ──────────
// ‼ גיא (16.10): ההסבר הקצר — ליד השדה בטופס; הלימוד הארוך — בנפרד («ללמוד לעומק»). עמוד התחום אינו מאמר.
// ‼ «דוח שנתי» ו«הצהרת הון»: הטופס הרשמי עצמו עם הסימונים (FormMap) הוא העמוד.
const FORM_DOMAINS: Partial<Record<DomainId, 'annual' | 'wealth'>> = { annual: 'annual', wealth: 'wealth' };

function DomainPage({ d, year, onGo, counts, focusValues, focusCode, yearSelect, clients, canLearn, onLearn, onOpenTool, focus, onField, onOpenDomain }: {
  d: DomainId; year: number; onGo: (p: AreaPath) => void; counts: ReturnType<typeof useTaxWork>['counts']; focusValues?: string; focusCode?: string; yearSelect: ReactNode;
  clients: Client[]; canLearn: (id: string) => boolean; onLearn: (id: string) => void; onOpenTool: (id: string) => void;
  /** הטופס, הסעיף והמסמך מהכתובת (‎f/…‎ · ‎d/…‎). onField — בחירה בטופס, בלי לגלול לראש העמוד. */
  focus: { form?: string; field?: string; mark?: string; doc?: string }; onField: (v: { form?: string; field?: string; mark?: string }) => void; onOpenDomain: (id: string) => void;
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
  // מסמך מקור מהכתובת — הכרטיס נפתח מתחת לטופס, ומובא לעין
  const docRef = useRef<HTMLElement>(null);
  // ‼ אחרי שהטופס שמעליו התעדכן לכתובת (הוא משנה גובה) — אחרת הכרטיס נדחף מחוץ לעין
  useEffect(() => { if (focus.doc) requestAnimationFrame(() => requestAnimationFrame(() => docRef.current?.scrollIntoView({ block: 'start' }))); }, [focus.doc]);
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
          <FormMap key={formDomain} domain={formDomain} clients={clients} canLearn={canLearn} onLearn={onLearn} onOpenTool={onOpenTool} year={year} initialCode={focusCode}
            initialForm={focus.form} initialField={focus.field} initialMark={focus.mark} onSelectField={onField} onOpenDomain={onOpenDomain} />
          {formDomain === 'annual' && (
            <p className="ta-form-more">
              {!focus.doc && <><button type="button" className="kn-link" onClick={() => onGo({ mode: 'learn', domain: d, doc: SOURCE_DOCS[0].id })} data-domain-docs>מסמכי מקור: מהמסמך לשדה ←</button><br /></>}
              <button type="button" className="ta-link" onClick={() => onGo({ mode: 'learn', domain: d, item: 'map1301' })} data-domain-control>בקרת הטופס: מה השתנה מול 2024, כיסוי לפי חלקים ומוכנות לקוח ←</button>
            </p>
          )}
        </section>
      )}
      {d === 'annual' && focus.doc && (
        <section aria-labelledby="ta-doc-h" ref={docRef} data-domain-doc={focus.doc}>
          <div className="ta-doc-head">
            <h3 className="ta-sec-h" id="ta-doc-h">מסמך מקור — מהמסמך לשדה</h3>
            <button type="button" className="kn-link" onClick={() => onGo({ mode: 'learn', domain: d })} data-domain-doc-close>סגירה</button>
          </div>
          <DocCards selected={focus.doc} onSelect={id => onGo({ mode: 'learn', domain: d, doc: id })} idPrefix="ta" />
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

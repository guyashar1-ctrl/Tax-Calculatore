// 27.10.2026: approved prototype B — one work list, the existing SHAAM import, contextual knowledge.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { todayIso } from '../../utils/dateFormat';
import type { TaxWorkState } from '../taxYear/useTaxWork';
import { useObligations } from '../shaamFiling/useObligations';
import OpenRequestsDialog from '../shaamFiling/OpenRequestsDialog';
import { HistoryRow } from '../shaamFiling/ShaamFilingPanel';
import { needsRequest, type Obligation } from '../shaamFiling/model';
import { BODIES } from '../taxKnowledge/TopicPage';
import { Txt } from '../taxKnowledge/topics/lesson';
import { ClaimTag } from '../taxKnowledge/claim';
import { readingPeriod } from '../taxKnowledge/learnPath';
import { agoText, dueRelative, dueShort, lastShaamUpdate, seasonOf, SEASON_LABEL, SEASON_ORDER, type SeasonPart } from './workOverviewModel';
import { HUB_KINDS, groupedHub, hubRows, hubSource, readHubView, saveHubView, topicForWork, visibleHub, type HubRow, type HubView } from './workHubModel';
import type { WorkSection } from './areaModel';
import './workOverview.css';
import './workHub.css';

export type WorkKnowledgeMode = 'summary' | 'plan' | 'apply' | 'form';
interface Props {
  section: WorkSection; work: TaxWorkState; top?: ReactNode;
  onOpenRequests: (clientId: string, stepId: string) => void;
  onOpenClient: (clientId: string, tab?: 'taxfile' | 'docs') => void;
  onKnowledge: (row: HubRow, mode: WorkKnowledgeMode) => void;
  onSection: (section: WorkSection) => void;
}
const Book = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>;

export default function WorkOverview({ section, work, top, onOpenRequests, onOpenClient, onKnowledge, onSection }: Props) {
  const { data, err, rows, load, byId } = work;
  const shaam = useObligations();
  const today = todayIso();
  const [view, setView] = useState<HubView>(readHubView);
  const viewRef = useRef(view);
  const restoreTarget = useRef(view.lastId);
  const [sheet, setSheet] = useState(false);
  const [knowledge, setKnowledge] = useState<HubRow | null>(null);
  const [source, setSource] = useState<HubRow | null>(null);
  const [opening, setOpening] = useState<Obligation[] | null>(null);
  const [closed, rawSetClosed] = useState<HubView['closed']>(() => readHubView().closed);
  const restored = useRef(false);
  const clients = useMemo(() => [...byId.values()], [byId]);
  const all = useMemo(() => hubRows(rows, shaam.obligations ?? [], clients, today), [rows, shaam.obligations, clients, today]);
  const filtered = visibleHub(all, section, view.q, view.who);
  const unopened = filtered.flatMap(r => r.state === 'open' && r.obligation && needsRequest(r.obligation) ? [r.obligation] : []);
  const groups = groupedHub(filtered);
  const archived = (state: HubRow['state']) => filtered.filter(r => r.state === state);
  const filed = archived('filed'), done = archived('done'), cancelled = archived('cancelled');
  const last = lastShaamUpdate(shaam.sources);
  const toReview = (shaam.obligations ?? []).filter(o => o.state === 'needs_review').length;
  const bucketOfStep = useCallback((id: string) => rows.find(r => r.parent.id === id)?.bucket, [rows]);
  const season = seasonOf(shaam.obligations ?? [], bucketOfStep);
  const refresh = () => { void load(); void shaam.load(); };
  const update = (v: Partial<HubView>) => { const next = { ...viewRef.current, ...v }; viewRef.current = next; saveHubView(next); setView(next); };
  const setClosed = (v: HubView['closed']) => { rawSetClosed(v); update({ closed: v }); };
  const sourceRow = source ? all.find(r => r.id === source.id) ?? source : null;
  const remember = (r: HubRow, action: HubView['action']) => update({ lastId: r.id, action });
  useEffect(() => {
    if (restored.current || !data || shaam.obligations === null || !restoreTarget.current || sheet || knowledge || source || opening) return;
    const row = document.querySelector<HTMLElement>(`[data-hub-id="${CSS.escape(restoreTarget.current)}"]`);
    if (!row) return;
    const button = row.querySelector<HTMLElement>(view.action === 'knowledge' ? '[data-work-knowledge]' : '[data-work-open]');
    restored.current = true;
    requestAnimationFrame(() => { button?.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' }); });
  }, [data, shaam.obligations, view.action, closed, sheet, knowledge, source, opening]);
  const open = (r: HubRow) => {
    remember(r, 'open');
    if (r.state === 'filed') onOpenClient(r.clientId, 'docs');
    else if (r.obligation && needsRequest(r.obligation)) setOpening([r.obligation]);
    else if (r.stepId) onOpenRequests(r.clientId, r.stepId);
    else onOpenClient(r.clientId, 'taxfile');
  };
  const row = (r: HubRow) => <li key={r.id} className="wov-hub-row" data-hub-id={r.id}>
    <button type="button" className="wov-item" data-work-open data-wo-row={r.kind} data-wo-bucket={r.work?.bucket ?? r.bucket} data-wo-due={r.days !== undefined && r.days < 0 ? 'overdue' : ''}
      aria-label={`${r.name} · ${r.title} ${r.period} · ${r.status} · ${r.dueDate ? `${dueShort(r.dueDate, today)} · ${dueRelative(r.days!)} · ${r.dueKind}` : 'בלי מועד'} — ${r.state === 'filed' ? 'פתיחת מסמכים' : 'פתיחת העבודה'}`} onClick={() => open(r)}>
      <span className="wov-ini" aria-hidden="true">{r.name.slice(0, 1)}</span>
      <span className="wov-who"><b>{r.name}</b><span>{r.title} <bdi>{r.period}</bdi>{r.obligation?.role === 'spouse' ? ' · בן/בת הזוג' : ''}</span></span>
      <span className={`wov-st is-${r.state === 'filed' ? r.copyMissing ? 'client' : 'done' : r.bucket}`}><i aria-hidden="true"/>{r.status}</span>
      {r.dueDate ? <span className={`wov-due${(r.days ?? 0) < 0 ? ' is-late' : ''}`} title={r.dueKind}><b><bdi>{dueShort(r.dueDate, today)}</bdi></b><span>{dueRelative(r.days!)}</span></span>
        : <span className="wov-due is-none">{r.state === 'open' ? 'לא צוין מועד' : ''}</span>}
    </button>
    {topicForWork(r.kind) ? <button type="button" className="wov-knowledge" data-work-knowledge title="מה צריך לדעת" aria-label={`מה צריך לדעת · ${r.name} · ${r.title} ${r.period}`} onClick={() => { remember(r, 'knowledge'); setKnowledge(r); }}><Book/></button>
      : <button type="button" className="wov-knowledge" aria-label={`לתיק של ${r.name}`} onClick={() => { remember(r, 'client'); onOpenClient(r.clientId, 'taxfile'); }}>←</button>}
    {r.state === 'filed' && r.obligation && <button type="button" className="wov-file-source" onClick={() => { remember(r, 'open'); setSource(r); }}>מקור ועותק</button>}
  </li>;
  const count = (kind: WorkSection) => visibleHub(all, kind, view.q, view.who).filter(r => r.state === 'open').length;
  const onPart = (p: SeasonPart) => {
    if (p === 'mine' || p === 'client') { update({ q: '', who: p, lastId: '' }); setClosed(null); onSection('annual'); }
    else if (p === 'noRequest') {
      const pending = all.flatMap(r => r.kind === 'annual' && r.year === season?.year && r.obligation && needsRequest(r.obligation) ? [r.obligation] : []);
      if (pending.length) setOpening(pending); else setSheet(true);
    } else if (p === 'filed') { update({ q: '', who: 'all', lastId: '' }); onSection('annual'); setClosed('filed'); }
  };
  return <div className="wov" data-work-overview data-section={section}>
    <header className="wov-head"><h1 className="wov-title">עבודות</h1><span className="wov-sp"/>{top && <button type="button" className="wov-sync" aria-haspopup="dialog" data-wo-shaam onClick={() => setSheet(true)} aria-label={`עדכון משע״ם · ${last ? `עודכן ${agoText(last, today)}` : 'לא נקלט'}${toReview ? ` · ${toReview} לבדיקה` : ''}`}>שע״ם<em> · {last ? `עודכן ${agoText(last, today)}` : 'לא נקלט'}</em>{toReview > 0 && <span className="wov-badge" data-wo-shaam-review>{toReview}</span>}<span aria-hidden="true">↻</span></button>}</header>
    <div className="wov-tools"><nav className="wov-tabs" aria-label="סוג העבודה">{HUB_KINDS.filter(t => !['estimate', 'intake'].includes(t.id) || count(t.id) > 0 || t.id === section || all.some(r => r.kind === t.id)).map(t => <button key={t.id} type="button" aria-pressed={section === t.id} className={section === t.id ? 'is-on' : ''} data-wo-kind={t.id} onClick={() => { update({ lastId: '' }); setClosed(null); onSection(t.id); }}>{t.label}<span className="wov-n">{count(t.id)}</span></button>)}</nav>
      <label className="wov-find"><span aria-hidden="true">⌕</span><input type="search" value={view.q} onChange={e => { update({ q: e.target.value, lastId: '' }); setClosed(null); }} placeholder="לקוח, תיק או שנה" aria-label="חיפוש לקוח, תיק או שנה" data-wo-q/></label></div>
    <div className="wov-owner"><label>אצל מי<select value={view.who} aria-label="אצל מי" data-wo-owner onChange={e => update({ who: e.target.value as HubView['who'], lastId: '' })}><option value="all">כולם</option><option value="mine">אצלי</option><option value="client">אצל הלקוח</option></select></label>{view.who !== 'all' && filtered.some(r => r.state === 'open' && r.bucket !== view.who) && <small>כולל עבודות באיחור</small>}{(view.q || section !== 'all' || view.who !== 'all') && <button type="button" className="wov-link" onClick={() => { update({ q: '', who: 'all', lastId: '' }); onSection('all'); }}>ניקוי סינון</button>}</div>
    {(err || shaam.err) && <p className="wov-msg is-err" role="alert">{err ? 'לא ניתן לטעון את העבודות.' : 'רשימות שע״ם לא נטענו; ייתכן שחסרות חובות בריכוז.'} <button type="button" className="wov-link" onClick={refresh}>נסה שוב</button></p>}
    {(!data || shaam.obligations === null) && !err && !shaam.err && <p className="wov-msg" role="status">טוען עבודות ורשימות שע״ם…</p>}
    {data && <>{unopened.length > 1 && <p className="wov-bulk"><button type="button" className="wov-link" data-work-open-all onClick={() => setOpening(unopened)}>פתח בקשות ל-{unopened.length} החובות שטרם נפתחו ←</button></p>}{groups.map(g => <section key={g.id} className="wov-grp" data-wo-group={g.id} aria-labelledby={`wov-g-${g.id}`}><h3 id={`wov-g-${g.id}`} className={g.id === 'overdue' ? 'is-late' : undefined}>{g.label}</h3><ul className="wov-list">{g.rows.map(row)}</ul></section>)}
      {!groups.length && <div className="wov-empty" role="status" data-wo-empty><p>{view.q || section !== 'all' || view.who !== 'all' ? 'אין עבודות פתוחות שמתאימות לסינון.' : 'אין עבודות פתוחות.'}</p>{!all.length && <span>מעלים רשימת שע״ם, או פותחים עבודה מתוך הבקשות בתיק הלקוח.</span>}</div>}
      <div className="wov-closed">{([['filed', filed, 'הוגשו לפי שע״ם'], ['done', done, 'הושלמו במשרד'], ['cancelled', cancelled, 'בוטלו']] as const).map(([state, list, label]) => list.length > 0 && <section key={state}><button type="button" className="wov-link wov-archive" aria-expanded={closed === state} data-wo-closed={state} onClick={() => setClosed(closed === state ? null : state)}><span aria-hidden="true">{closed === state ? '⌄' : '‹'}</span>{label} · {list.length}{state === 'filed' && filed.some(r => r.copyMissing) && <em> · {filed.filter(r => r.copyMissing).length} {filed.filter(r => r.copyMissing).length === 1 ? 'עותק חסר' : 'עותקים חסרים'}</em>}</button>{closed === state && <ul className="wov-list is-compact" aria-label={label}>{list.map(row)}</ul>}</section>)}</div>
    </>}
    {season && season.total > 0 && <details className="wov-season-wrap"><summary>עונת הדוחות {season.year} · {season.total} חייבים</summary><section className="wov-season" data-wo-season={season.year} aria-label={`דוחות ${season.year}`}><div className="wov-legend">{SEASON_ORDER.map(part => <button key={part} type="button" disabled={!season.counts[part] || part === 'other'} data-wo-season-part={part} onClick={() => onPart(part)}><i className={`is-${part}`} aria-hidden="true"/>{SEASON_LABEL[part]} <b>{season.counts[part]}</b></button>)}</div></section></details>}
    {sheet && top && <ShaamSheet onClose={() => { setSheet(false); refresh(); }}>{top}</ShaamSheet>}
    {knowledge && <ShaamSheet title={`${knowledge.title} · ${knowledge.period}`} onClose={() => setKnowledge(null)}><KnowledgeNote row={knowledge} onGo={mode => { setKnowledge(null); onKnowledge(knowledge, mode); }} onClient={() => { remember(knowledge, 'client'); onOpenClient(knowledge.clientId, 'taxfile'); }}/></ShaamSheet>}
    {sourceRow?.obligation && <ShaamSheet title="מקור ההגשה ועותק במשרד" onClose={() => setSource(null)}><ul className="shf-rows"><HistoryRow o={sourceRow.obligation} onOpenRequests={onOpenRequests} onDone={refresh} showClient={false}/></ul></ShaamSheet>}
    {opening && createPortal(<div className="pivo-light"><OpenRequestsDialog obligations={opening} clients={clients} onClose={() => { setOpening(null); refresh(); }} onDone={refresh} onOpenRequests={onOpenRequests}/></div>, document.body)}
  </div>;
}
function KnowledgeNote({ row, onGo, onClient }: { row: HubRow; onGo: (mode: WorkKnowledgeMode) => void; onClient: () => void }) {
  const id = topicForWork(row.kind)!;
  const period = readingPeriod(id, 'summary', row.year ?? new Date().getFullYear() - 1);
  const lesson = BODIES[id]?.lesson;
  return <div className="wov-knowledge-note"><p className="wov-note-context">{row.name} · {row.period}</p><h3>לפני שמתחילים</h3>{(row.year === null || period.year !== row.year) && <p className="wov-scope">הסיכום מתייחס ל-{period.year}.{row.kind === 'wealth' && !row.asOfDate ? ' יום ההצהרה נבדק לפי הדרישה, ולא נגזר מהשנה ברשימת שע״ם.' : ` העבודה מתייחסת ל-${row.year}; יש לבדוק התאמה לשנה שלה.`}</p>}{lesson?.mustKnow.slice(0, 3).map((p, i) => <p key={i}><Txt text={p.text} year={period.year}/> <ClaimTag status={p.status}/></p>)}<div className="wov-knowledge-links"><button type="button" onClick={() => onGo('summary')}>הסיכום המקצועי ←</button><button type="button" onClick={() => onGo('plan')}>ללמוד את הנושא ←</button><button type="button" onClick={() => onGo('apply')}>יישום בתיק ←</button>{['annual', 'wealth'].includes(row.kind) && <button type="button" onClick={() => onGo('form')}>הסעיפים בטופס ←</button>}</div>{hubSource(row) && <p className="wov-note-source">{hubSource(row)}</p>}<button type="button" className="wov-link" onClick={onClient}>לתיק של {row.name} ←</button></div>;
}
// ── יריעת «עדכון משע״ם»: חלון במחשב, יריעה מלמטה בטלפון ─────────────────────────────────────────
// ‼ בפורטל לגוף המסמך: אב עם transform היה הופך את position:fixed ליחסי אליו.
// ‼ חלון שנפתח מתוך הלוח (OpenRequestsDialog) יושב בתוך היריעה — Esc שלו לא סוגר את היריעה מתחתיו.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ShaamSheet({ onClose, children, title = 'עדכון משע״ם' }: { onClose: () => void; children: ReactNode; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; opener?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const panel = ref.current;
      if (!panel) return;
      if (panel.querySelector('[aria-modal="true"]')) return; // חלון פנימי פתוח — שלו
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null);
      if (!nodes.length) return;
      if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="wov-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wov-sheet pivo-light" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} data-wo-sheet>
        <div className="wov-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="wov-x" onClick={onClose} aria-label="סגירה" data-autofocus>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="wov-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

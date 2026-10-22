// ─── «עבודות» — סקירה רוחבית, בלי פעולות (16.10.2026 · עיצוב מחדש 21.10.2026) ──────────────────────
// ‼ הכרעת גיא (16.10): העבודה עצמה ב«בקשות» של הלקוח. כאן רואים מה אצלי, מה אצל הלקוח ומה מועד —
//   ולחיצה על שורה פותחת ישר את «בקשות» של אותו לקוח (onOpenRequests(id, stepId)). אין מגירה: הפעולה היחידה שלה
//   הייתה «פתח בבקשות».
// ‼ ההפניה המאושרת: docs/proposals/2026-10-21-tax-area-reimagined.html (מקטע «עבודות»).
// ‼ «שע״ם» בראש פותח יריעה עם ShaamFilingPanel כפי שהוא (העלאה, «בלי בקשה פתוחה», לבדיקה). שורות «לבדיקה»
//   מסומנות במספר על הכפתור — כדי שדבר שדורש החלטה לא ייעלם מאחורי היריעה.
// ‼ קישור ישן ‎#/tax/work/<סוג>‎ נוחת כאן, מסונן לסוג — עם תג שאפשר להסיר.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Client } from '../../types';
import { todayIso } from '../../utils/dateFormat';
import type { TaxWorkState } from '../taxYear/useTaxWork';
import type { WorkKind, WorkRow } from '../taxYear/taxWork';
import { useObligations } from '../shaamFiling/useObligations';
import {
  KIND_NAME, SEASON_LABEL, SEASON_ORDER, WORK_TABS, agoText, closedRows, dueRelative, dueShort, groupByDue, lastShaamUpdate,
  seasonOf, tabCounts, tabRows, toOverview, type OverviewRow, type SeasonPart, type WorkTab,
} from './workOverviewModel';
import { WORK_BY_ID, type DomainId, type WorkSection } from './areaModel';
import './workOverview.css';

interface Props {
  section: WorkSection;
  work: TaxWorkState;
  onOpenRequests: (clientId: string, stepId: string) => void;
  /** נשמר לתאימות — הקישור «ללמוד את התחום» ירד מהמסך (21.10). */
  onLearn?: (d: DomainId) => void;
  /** «הפקת דוחות משע״ם והעלאה» (ShaamFilingPanel) — מוצג ביריעה שנפתחת מכפתור «שע״ם». */
  top?: ReactNode;
  /** הסרת הסינון לסוג (קישור ישן ‎#/tax/work/<סוג>‎) ← «הכול». */
  onSection?: (section: 'all') => void;
}

const workLine = (x: OverviewRow) => (x.period ? `${KIND_NAME[x.kind]}${x.kind === 'intake' ? ' · ' : ' '}${x.period}` : KIND_NAME[x.kind]);

export default function WorkOverview({ section, work, onOpenRequests, top, onSection }: Props) {
  const { data, err, rows, load, byId } = work;
  const shaam = useObligations();
  const today = todayIso();
  const kind: WorkKind | 'all' = section;
  const [tab, setTab] = useState<WorkTab>('mine');
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<'done' | 'cancelled' | null>(null);
  const [sheet, setSheet] = useState(false);

  const nameOf = useCallback((id: string) => { const c: Client | undefined = byId.get(id); return `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'לקוח'; }, [byId]);
  const all = useMemo(() => toOverview(rows, today), [rows, today]);
  const query = { kind, q, nameOf };
  const counts = tabCounts(all, query);
  const groups = groupByDue(tabRows(all, { ...query, tab }));
  const done = closedRows(all, { ...query, today });

  const bucketOfStep = useMemo(() => { const m = new Map<string, WorkRow['bucket']>(rows.map(r => [r.parent.id, r.bucket])); return (id: string) => m.get(id); }, [rows]);
  const season = section === 'all' || section === 'annual' ? seasonOf(shaam.obligations ?? [], bucketOfStep) : null;
  const toReview = (shaam.obligations ?? []).filter(o => o.state === 'needs_review').length;
  const last = lastShaamUpdate(shaam.sources);
  const closeSheet = () => { setSheet(false); void shaam.load(); };

  const onPart = (p: SeasonPart) => {
    if (p === 'mine' || p === 'client') setTab(p);
    else if (p === 'noRequest') setSheet(true);
  };

  const item = (x: OverviewRow) => {
    const r = x.row; const name = nameOf(x.clientId);
    const late = x.days !== undefined && x.days < 0;
    const dueText = x.dueDate && x.days !== undefined ? `${dueShort(x.dueDate, today)}, ${dueRelative(x.days)}` : 'בלי מועד';
    return (
      <li key={x.stepId}>
        <button type="button" className="wov-item" onClick={() => onOpenRequests(x.clientId, x.stepId)}
          data-wo-row={x.kind} data-wo-bucket={r.bucket} data-wo-due={late ? 'overdue' : x.due}
          aria-label={`${name} · ${workLine(x)} · ${r.next} · ${dueText}${x.dueKind ? ` (${x.dueKind})` : ''} — פתיחת «בקשות»`}>
          <span className="wov-ini" aria-hidden="true">{name.slice(0, 1)}</span>
          <span className="wov-who"><b>{name}</b><span>{workLine(x)}</span></span>
          <span className={`wov-st is-${r.bucket}`}><i aria-hidden="true" />{r.next}</span>
          {x.dueDate && x.days !== undefined
            ? <span className={`wov-due${late ? ' is-late' : ''}`} title={x.dueKind}><b>{dueShort(x.dueDate, today)}</b><span>{dueRelative(x.days)}</span></span>
            : <span className="wov-due is-none" aria-hidden="true" />}
        </button>
      </li>
    );
  };

  const shownClosed = closed === 'done' ? done.done : closed === 'cancelled' ? done.cancelled : [];
  const empty = rows.length === 0 ? 'עוד אין עבודות. פותחים עבודה ב«בקשות» של הלקוח.'
    : q.trim() && counts.all === 0 ? 'אין לקוח בשם הזה.' : null;

  return (
    <div className="wov" data-work-overview data-section={section}>
      <header className="wov-head">
        <h2 className="wov-title">עבודות</h2>
        {section !== 'all' && (onSection
          ? <button type="button" className="wov-chip" onClick={() => onSection('all')} aria-label={`הסרת הסינון: ${WORK_BY_ID[section].label}`} data-wo-section-chip>
            {WORK_BY_ID[section].label}<span aria-hidden="true">✕</span></button>
          : <span className="wov-chip is-static" data-wo-section-chip>{WORK_BY_ID[section].label}</span>)}
        <span className="wov-sp" />
        {top && (
          <button type="button" className="wov-sync" onClick={() => setSheet(true)} aria-haspopup="dialog" data-wo-shaam
            aria-label={`עדכון משע״ם · ${last ? `עודכן ${agoText(last, today)}` : 'לא נקלט'}${toReview ? ` · ${toReview} לבדיקה` : ''}`}>
            שע״ם<em> · {last ? `עודכן ${agoText(last, today)}` : 'לא נקלט'}</em>
            {toReview > 0 && <span className="wov-badge" data-wo-shaam-review>{toReview}</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
          </button>
        )}
      </header>

      {season && season.total > 0 && (
        <section className="wov-season" aria-label={`דוחות ${season.year}`} data-wo-season={season.year}>
          <div className="wov-season-head"><b>דוחות {season.year}</b><span>{season.total} חייבים</span></div>
          <div className="wov-bar" aria-hidden="true">
            {SEASON_ORDER.filter(p => season.counts[p] > 0).map(p => (
              <div key={p} className={`is-${p}${p === 'mine' || p === 'client' || (p === 'noRequest' && top) ? ' is-click' : ''}`} style={{ flexGrow: season.counts[p] }}
                title={`${SEASON_LABEL[p]} ${season.counts[p]}`} onClick={() => onPart(p)} />
            ))}
          </div>
          <div className="wov-legend">
            {SEASON_ORDER.filter(p => season.counts[p] > 0 || (p !== 'other')).map(p => {
              const body = <><i className={`is-${p}`} aria-hidden="true" />{SEASON_LABEL[p]} <b>{season.counts[p]}</b></>;
              const can = season.counts[p] > 0 && (p === 'mine' || p === 'client' || (p === 'noRequest' && !!top));
              return can
                ? <button key={p} type="button" onClick={() => onPart(p)} data-wo-season-part={p}>{body}</button>
                : <span key={p} data-wo-season-part={p}>{body}</span>;
            })}
          </div>
        </section>
      )}

      <div className="wov-tools">
        <div className="wov-tabs" role="group" aria-label="אצל מי">
          {WORK_TABS.map(t => (
            <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} aria-pressed={tab === t.id} onClick={() => { setTab(t.id); setClosed(null); }} data-wo-tab={t.id}>
              {t.label}<span className="wov-n">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <span className="wov-sp" />
        <label className="wov-find">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="לקוח" aria-label="חיפוש לקוח" data-wo-q />
        </label>
      </div>

      {err && <div className="wov-msg is-err" role="alert">לא ניתן לטעון: {err} <button type="button" className="wov-link" onClick={() => void load()}>נסה שוב</button></div>}
      {!data && !err && <div className="wov-msg" role="status">טוען…</div>}
      {data && (
        <>
          {groups.map(g => (
            <section key={g.id} className="wov-grp" aria-labelledby={`wov-g-${g.id}`} data-wo-group={g.id}>
              <h3 id={`wov-g-${g.id}`} className={g.id === 'overdue' ? 'is-late' : undefined}>{g.label}</h3>
              <ul className="wov-list">{g.rows.map(item)}</ul>
            </section>
          ))}
          {groups.length === 0 && (
            <div className="wov-empty" role="status" data-wo-empty>
              {empty ?? <><b>אין כאן כלום.</b>הכול זז.</>}
            </div>
          )}

          {(done.done.length > 0 || done.cancelled.length > 0) && (
            <div className="wov-closed">
              <div className="wov-closed-links">
                <button type="button" className="wov-link" aria-expanded={closed === 'done'} onClick={() => setClosed(closed === 'done' ? null : 'done')} data-wo-closed="done">
                  הושלמו לאחרונה ({done.done.length})</button>
                {done.cancelled.length > 0 && (
                  <button type="button" className="wov-link" aria-expanded={closed === 'cancelled'} onClick={() => setClosed(closed === 'cancelled' ? null : 'cancelled')} data-wo-closed="cancelled">
                    בוטלו ({done.cancelled.length})</button>
                )}
              </div>
              {closed && (
                <ul className="wov-list is-compact" aria-label={closed === 'done' ? 'הושלמו לאחרונה' : 'בוטלו'}>
                  {shownClosed.map(x => {
                    const name = nameOf(x.clientId);
                    return (
                      <li key={x.stepId}>
                        <button type="button" className="wov-item is-closed" onClick={() => onOpenRequests(x.clientId, x.stepId)} data-wo-row={x.kind} data-wo-bucket={x.row.bucket}
                          aria-label={`${name} · ${workLine(x)} · ${x.row.next} — פתיחת «בקשות»`}>
                          <span className="wov-who"><b>{name}</b><span>{workLine(x)}</span></span>
                          <span className="wov-st is-closed">{x.row.next}</span>
                        </button>
                      </li>
                    );
                  })}
                  {shownClosed.length === 0 && <li className="wov-msg">אין.</li>}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {sheet && top && <ShaamSheet onClose={closeSheet}>{top}</ShaamSheet>}
    </div>
  );
}

// ── יריעת «עדכון משע״ם»: חלון במחשב, יריעה מלמטה בטלפון ─────────────────────────────────────────
// ‼ בפורטל לגוף המסמך: אב עם transform היה הופך את position:fixed ליחסי אליו.
// ‼ חלון שנפתח מתוך הלוח (OpenRequestsDialog) יושב בתוך היריעה — Esc שלו לא סוגר את היריעה מתחתיו.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ShaamSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
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
      <div className="wov-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} data-wo-sheet>
        <div className="wov-sheet-head">
          <h2 id={titleId}>עדכון משע״ם</h2>
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

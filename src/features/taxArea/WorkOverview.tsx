// ─── «עבודות לקוחות» — סקירה רוחבית, בלי פעולות (16.10.2026) ────────────────────────────────────
// ‼ הכרעת גיא (16.10): העבודה עצמה ב«בקשות» של הלקוח. כאן רואים מה פתוח אצל מי, מה מועד ומה באיחור —
//   ולחיצה על שורה פותחת את «בקשות» של אותו לקוח (onOpenClient(id, 'journey', stepId); המיקוד לשורה — בצד הבקשות).
// ‼ קישור ישן ‎#/tax/work/<סוג>‎ נוחת כאן, מסונן לסוג.

import { useMemo, useState, type ReactNode } from 'react';
import type { Client } from '../../types';
import { todayIso } from '../../utils/dateFormat';
import type { TaxWorkState } from '../taxYear/useTaxWork';
import type { WorkKind } from '../taxYear/taxWork';
import { KIND_NAME, OVERVIEW_DUES, OVERVIEW_STATES, filterOverview, overviewCounts, toOverview, type OverviewDue, type OverviewRow, type OverviewState } from './workOverviewModel';
import { DOMAIN_BY_ID, WORK_BY_ID, type DomainId, type WorkSection } from './areaModel';
// אותו מראה כמו טבלת העבודות הקודמת (התראות, מסננים) — קריאה בלבד מקבצי taxYear
import '../taxYear/taxYear.css';
import '../taxYear/taxWorkArea.css';

interface Props {
  section: WorkSection;
  work: TaxWorkState;
  onOpenRequests: (clientId: string, stepId: string) => void;
  onLearn: (d: DomainId) => void;
  /** ‼ 16.10: מקום שמור בראש הסקירה — «הפקת דוחות משע״ם והעלאה» ושורות חובת הגשה (src/features/shaamFiling, סשן אחר). */
  top?: ReactNode;
}
const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

export default function WorkOverview({ section, work, onOpenRequests, onLearn, top }: Props) {
  const { data, err, rows, load, byId } = work;
  const today = todayIso();
  const kind: WorkKind | 'all' = section;
  const def = WORK_BY_ID[section];
  const [state, setState] = useState<OverviewState>('open');
  const [due, setDue] = useState<OverviewDue>('any');
  const [q, setQ] = useState('');
  const all = useMemo(() => toOverview(rows, today), [rows, today]);
  const nameOf = (id: string) => { const c: Client | undefined = byId.get(id); return `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'לקוח'; };
  const shown = filterOverview(all, { kind, state, due, q, nameOf, today });
  const n = overviewCounts(all, kind, today);
  const domain = def.domain ? DOMAIN_BY_ID[def.domain] : undefined;
  const countOf = (s: OverviewState) => (s === 'open' ? n.open : n[s]);

  const dueCell = (x: OverviewRow) => {
    if (!x.dueDate) return <span className="wo-due is-none">{x.row.bucket === 'cancelled' ? '—' : 'אין מועד'}</span>;
    return (
      <span className={`wo-due is-${x.due}`} title={x.dv.short}>
        <b>{dmy(x.dueDate)}</b>
        <small>{x.dueKind}{x.due === 'overdue' && x.days !== undefined ? ` · באיחור ${-x.days} ימים` : x.due === 'soon' && x.days !== undefined ? ` · בעוד ${x.days} ימים` : ''}</small>
      </span>
    );
  };

  return (
    <div className="wo" data-work-overview data-section={section}>
      <header className="ta-page-head">
        <h2 className="tw-h">{section === 'all' ? 'כל העבודות' : def.label}</h2>
        <p className="tw-lead">סקירה של העבודות אצל כל הלקוחות — מה פתוח, אצל מי ומה המועד. <b>העבודה עצמה ב«בקשות» של הלקוח</b>: לוחצים על שורה.</p>
        {domain && <p className="wo-learn"><button type="button" className="ta-link" onClick={() => onLearn(domain.id)} data-wo-learn>ללמוד את התחום: {domain.label} ←</button></p>}
      </header>

      {top && <section className="wo-top" data-wo-slot-top aria-label="חובות הגשה מול הרשויות">{top}</section>}
      {(n.overdue > 0 || n.soon > 0) && (
        <div className="tw-alerts" role="status">
          {n.overdue > 0 && <button type="button" className="tw-alert is-overdue" onClick={() => { setDue('overdue'); setState('open'); }} data-wo-alert="overdue">{n.overdue === 1 ? 'עבודה אחת באיחור' : `${n.overdue} עבודות באיחור`}</button>}
          {n.soon > 0 && <button type="button" className="tw-alert is-soon" onClick={() => { setDue('soon'); setState('open'); }} data-wo-alert="soon">{n.soon === 1 ? 'מועד אחד מתקרב' : `${n.soon} מועדים מתקרבים`} (3 שבועות)</button>}
        </div>
      )}

      <div className="wo-filters">
        <div className="tw-kinds" role="group" aria-label="מצב העבודה">
          {OVERVIEW_STATES.map(s => {
            const c = countOf(s.id);
            if (s.id === 'cancelled' && c === 0 && state !== 'cancelled') return null;
            return (
              <button key={s.id} type="button" className={`tw-kind${state === s.id ? ' is-on' : ''}`} aria-pressed={state === s.id} onClick={() => setState(s.id)} data-wo-state={s.id}>
                {s.label} <span className="tw-kind-n">{c}</span>
              </button>
            );
          })}
        </div>
        <label className="tw-select">מועד
          <select value={due} onChange={e => setDue(e.target.value as OverviewDue)} data-wo-due>{OVERVIEW_DUES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </label>
        <label className="tw-select wo-q">לקוח
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="שם" data-wo-q />
        </label>
      </div>

      {err && <div className="ty-err" role="alert">לא ניתן לטעון: {err} <button type="button" className="ta-link" onClick={() => void load()}>נסה שוב</button></div>}
      {!data && !err && <div className="ty-note" role="status">טוען…</div>}
      {data && (
        <ul className="wo-list" aria-label={section === 'all' ? 'כל העבודות' : def.label}>
          {shown.map(x => {
            const r = x.row; const name = nameOf(x.clientId);
            const cancelled = r.bucket === 'cancelled';
            return (
              <li key={x.stepId}>
                <button type="button" className={`wo-row is-${x.due}${cancelled ? ' is-cancelled' : ''}`} onClick={() => onOpenRequests(x.clientId, x.stepId)}
                  data-wo-row={x.kind} data-wo-bucket={r.bucket} aria-label={`${name} · ${KIND_NAME[x.kind]} ${x.period} · ${r.next} — פתיחת «בקשות» של ${name}`}>
                  <span className="wo-who"><b>{name}</b><small>{KIND_NAME[x.kind]}{x.period ? ` · ${x.period}` : ''}</small></span>
                  <span className="wo-state">
                    <span className={`wo-bucket is-${r.bucket}`}>{r.bucket === 'mine' ? 'ממתין למשרד' : r.bucket === 'client' ? 'אצל הלקוח' : r.bucket === 'done' ? 'הושלם' : 'בוטל'}</span>
                    <span className="wo-next">{r.next}</span>
                  </span>
                  {dueCell(x)}
                  <span className="wo-go" aria-hidden="true">לבקשות ←</span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="ty-note wo-empty">
              {rows.length === 0 ? 'עוד אין עבודות מס. פותחים עבודה ב«בקשות» של הלקוח («＋ בקשה») או מתיק המס.'
                : state === 'cancelled' ? 'אין עבודות שבוטלו.' : state === 'done' ? 'לא הושלמו עבודות ב-30 הימים האחרונים.'
                  : due !== 'any' ? 'אין עבודות במועד הזה. אפשר לבחור «כל המועדים».' : q ? 'אין לקוח בשם הזה בעבודות.' : 'אין עבודות בסינון הזה.'}
            </li>
          )}
        </ul>
      )}
      <p className="kn-xs kn-muted wo-foot">פתיחת עבודה חדשה, פרסום ללקוח, בדיקת תשובות, אישור לתיק והסרה — ב«בקשות» של הלקוח.</p>
    </div>
  );
}

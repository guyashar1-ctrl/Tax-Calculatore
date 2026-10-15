// ─── «עבודות לקוחות» — עמוד לכל סוג עבודה, וסקירה של כולן (236; 13.10 · 14.10.2026) ─────────────────
// ‼ לא רשימה חדשה ולא משימות: אותן בקשות כמו ב«בקשות» של הלקוח ובתיק המס. «פתח» פותח את אותו דף תהליך.
// ‼ 14.10.2026: העמוד מקבל את הסוג מהמסילה של «מס» (section) ואת הנתונים מ-useTaxWork — כך המספר במסילה
//   והרשימה באים מאותו מקור. לכל סוג: מה זו העבודה, איך פותחים, ואיפה לומדים את התחום.
// ‼ «הסר…» — מחיקה רק כשדבר לא יצא מהמשרד, אחרת ביטול שאפשר להחזיר (242, RemoveWorkDialog). עבודה שהושלמה לא מוסרת.
// ‼ מועד «רשמי» — רק עם בסיס (workMeta.deadlineView).

import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { formatDate, todayIso } from '../../utils/dateFormat';
import TaxYearProcess from './TaxYearProcess';
import AddTaxWorkDialog from './AddTaxWorkDialog';
import RemoveWorkDialog from './RemoveWorkDialog';
import { isOpenStep, type WorkKind, type WorkRow } from './taxWork';
import { daysTo, deadlineView, dueState, type DueState } from './workMeta';
import type { TaxWorkState } from './useTaxWork';
import { DOMAIN_BY_ID, WORK_BY_ID, type DomainId, type WorkSection } from '../taxArea/areaModel';
import './taxYear.css';
import './taxWorkArea.css';

interface Props {
  section: WorkSection;
  work: TaxWorkState;
  clients: Client[];
  /** פתיחת תיק הלקוח בלשונית — «תיק המס» או «מסמכים». */
  onOpenClient: (clientId: string, tab: 'taxfile' | 'docs') => void;
  /** «ללמוד את התחום» — מעבר ל«ידע מקצועי» בלי לאבד את המקום (הכתובת נשמרת בהיסטוריה). */
  onLearn?: (domain: DomainId) => void;
}

type StateFilter = 'open' | 'mine' | 'client' | 'done' | 'cancelled';
const STATES: { id: StateFilter; label: string }[] = [
  { id: 'open', label: 'פתוחות' }, { id: 'mine', label: 'לטיפולי' }, { id: 'client', label: 'אצל הלקוח' },
  { id: 'done', label: 'הושלמו' }, { id: 'cancelled', label: 'בוטלו' },
];
type DueFilter = 'any' | 'overdue' | 'soon' | 'none';
const DUES: { id: DueFilter; label: string }[] = [{ id: 'any', label: 'כל המועדים' }, { id: 'overdue', label: 'באיחור' }, { id: 'soon', label: 'מתקרב (3 שבועות)' }, { id: 'none', label: 'בלי מועד' }];
const he = (iso?: string) => (iso ? formatDate(iso) : '');
const KIND_NAME: Record<WorkKind, string> = { annual: 'דוח שנתי', wealth: 'הצהרת הון', intake: 'קליטה והשלמת תיק', estimate: 'הערכת מס' };

export default function TaxWorkView({ section, work, clients, onOpenClient, onLearn }: Props) {
  const { data, err, rows, load, byId } = work;
  const def = WORK_BY_ID[section];
  const [openId, setOpenId] = useState<string | null>(null);
  const [stateF, setStateF] = useState<StateFilter>('open');
  const [dueF, setDueF] = useState<DueFilter>('any');
  const [adding, setAdding] = useState<'annual' | 'wealth' | null>(null);
  const [removing, setRemoving] = useState<WorkRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // ‼ אחרי יצירה הרשימה נטענת מחדש; עד שהיא מתעדכנת אין לפתוח שוב את ההוספה — «כבר קיימת» נשען עליה
  const [refreshing, setRefreshing] = useState(false);
  const today = todayIso();

  const mineRows = useMemo(() => rows.filter(r => section === 'all' || r.kind === section), [rows, section]);
  const withDue = useMemo(() => mineRows.map(r => {
    const dv = deadlineView(r.parent);
    return { r, dv, ds: dueState(dv, today, isOpenStep(r.parent)) as DueState };
  }), [mineRows, today]);

  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  const recent = (r: WorkRow) => String(r.parent.updatedAt ?? r.parent.createdAt ?? '') >= monthAgo;
  const isActive = (r: WorkRow) => r.bucket !== 'done' && r.bucket !== 'cancelled';
  const shown = withDue.filter(({ r, ds }) =>
    (stateF === 'open' ? isActive(r) : stateF === 'done' ? r.bucket === 'done' && recent(r) : r.bucket === stateF)
    && (dueF === 'any' || (dueF === 'overdue' ? ds === 'overdue' : dueF === 'soon' ? ds === 'soon' : ds === 'none')));
  // ‼ סדר: באיחור → מתקרב → לטיפולי → אצל הלקוח; בתוך כל קבוצה — המועד הקרוב קודם
  const rank = (x: typeof withDue[number]) => (x.ds === 'overdue' ? 0 : x.ds === 'soon' ? 1 : x.r.bucket === 'mine' ? 2 : 3);
  const sorted = [...shown].sort((a, b) => rank(a) - rank(b)
    || String(a.dv.effectiveDue ?? a.dv.internalTarget ?? '9999').localeCompare(String(b.dv.effectiveDue ?? b.dv.internalTarget ?? '9999'))
    || (b.r.toReview - a.r.toReview));

  const openRows = withDue.filter(x => isActive(x.r));
  const overdue = openRows.filter(x => x.ds === 'overdue').length;
  const soon = openRows.filter(x => x.ds === 'soon').length;
  const toReviewTotal = openRows.reduce((n, x) => n + x.r.toReview, 0);
  const countOf = (f: StateFilter) => (f === 'open' ? openRows.length : f === 'done' ? withDue.filter(x => x.r.bucket === 'done' && recent(x.r)).length : withDue.filter(x => x.r.bucket === f).length);

  const open = openId ? rows.find(r => r.parent.id === openId) : undefined;
  const openClient = open ? byId.get(open.parent.clientId) : undefined;
  const clientName = (id: string) => { const c = byId.get(id); return `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'לקוח'; };

  const periodOf = (r: WorkRow) => {
    const p = (r.parent.payload ?? {}) as { taxYear?: number; asOfDate?: string };
    if (r.kind === 'wealth') return p.asOfDate ? `ליום ${he(p.asOfDate)}` : '';
    if (r.kind === 'intake') return p.asOfDate ? `נכון ל-${he(p.asOfDate)}` : 'פרטים קבועים';
    return p.taxYear ? `שנת ${p.taxYear}` : '';
  };
  const dueCell = ({ r, dv, ds }: typeof withDue[number]) => {
    if (r.bucket === 'cancelled') return <span className="tw-due is-none">—</span>;
    const d = dv.effectiveDue ?? dv.internalTarget;
    if (!d) return <span className="tw-due is-none">אין מועד</span>;
    const n = daysTo(d, today);
    const which = dv.extensionUntil ? 'ארכה' : dv.officialDue ? 'מועד הגשה' : dv.reportedDue ? 'מועד שנמסר' : 'יעד פנימי';
    return (
      <span className={`tw-due is-${ds}`} title={dv.short}>
        <b>{he(d)}</b>
        <small>{which}{dv.reportedDue && !dv.officialDue && !dv.extensionUntil ? ' · לא מאומת' : ''}{ds === 'overdue' ? ` · באיחור ${-n} ימים` : ds === 'soon' ? ` · בעוד ${n} ימים` : ''}</small>
      </span>
    );
  };

  const line = (x: typeof withDue[number]) => {
    const { r } = x;
    const c = byId.get(r.parent.clientId)!;
    const name = clientName(c.id);
    const since = r.info?.publishedAt ? ` · בדף האישי מ-${formatDate(r.info.publishedAt)}` : '';
    const cancelled = r.bucket === 'cancelled';
    const removal = (r.parent.payload as unknown as { removal?: { at?: string } } | undefined)?.removal;
    return (
      <div key={r.parent.id} className={`tw-row is-${x.ds}${cancelled ? ' is-cancelled' : ''}`} data-tw-row={r.kind} data-tw-bucket={r.bucket} role="row">
        <div className="tw-c tw-c-client" role="cell"><b className="tw-title">{name}</b></div>
        <div className="tw-c tw-c-work" role="cell"><span>{section === 'all' ? KIND_NAME[r.kind] : r.title}</span><small>{periodOf(r)}</small></div>
        <div className="tw-c tw-c-due" role="cell">{dueCell(x)}</div>
        <div className="tw-c tw-c-state" role="cell">
          <span className="tw-next">{r.next}{r.bucket === 'client' ? since : ''}{cancelled && removal?.at ? ` · ${he(removal.at)}` : ''}</span>
          {!cancelled && (
            <span className="tw-counts">
              {r.toReview > 0 && <span className="tw-chip is-review">ממתין לבדיקתך: {r.toReview}</span>}
              {r.missing.length > 0 && <span className="tw-chip">חסר אצל הלקוח: {r.missing.length}{r.unavailable ? ` (${r.unavailable} מסמכים)` : ''}</span>}
              {r.drafts > 0 && <span className="tw-chip is-quiet">טיוטה: {r.drafts} — לא פורסמה</span>}
            </span>
          )}
          {!cancelled && r.missing.length > 0 && (
            <details className="tw-missing">
              <summary>מה חסר</summary>
              <ul>{r.missing.slice(0, 12).map(a => <li key={a.id}>{a.title}{a.subjectName ? ` · ${a.subjectName}` : ''}{a.state === 'unavailable' ? ' — עוד לא הועלה' : ''}</li>)}
                {r.missing.length > 12 && <li>ועוד {r.missing.length - 12}…</li>}</ul>
            </details>
          )}
        </div>
        <div className="tw-actions" role="cell">
          {cancelled
            ? <button type="button" className="btn btn-sm btn-secondary" onClick={() => setRemoving(r)} data-tw-restore>החזר…</button>
            : <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpenId(r.parent.id)} aria-label={`פתח: ${r.title} · ${name}`}>פתח</button>}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenClient(c.id, 'taxfile')}>תיק המס</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenClient(c.id, 'docs')}>מסמכים</button>
          {isActive(r) && <button type="button" className="btn btn-sm btn-ghost tw-remove" onClick={() => setRemoving(r)} aria-label={`הסר: ${r.title} · ${name}`} data-tw-remove>הסר…</button>}
        </div>
      </div>
    );
  };

  const addLabel = (k: 'annual' | 'wealth') => (k === 'annual' ? '＋ דוח שנתי' : '＋ הצהרת הון');
  const adds: ('annual' | 'wealth')[] = section === 'all' ? ['annual', 'wealth'] : def.addKind ? [def.addKind] : [];
  const domain = def.domain ? DOMAIN_BY_ID[def.domain] : undefined;
  const emptyText = (() => {
    if (rows.length === 0 && section === 'all') return 'עוד אין עבודות מס. «＋ דוח שנתי» או «＋ הצהרת הון» — ללקוח אחד או לכמה.';
    if (stateF === 'cancelled') return 'אין עבודות שבוטלו.';
    if (stateF === 'done') return 'לא הושלמו עבודות ב-30 הימים האחרונים.';
    if (dueF !== 'any') return 'אין עבודות במועד הזה. אפשר לבחור «כל המועדים».';
    if (mineRows.length === 0) return `אין עבודות מהסוג הזה. ${def.howToOpen}`;
    return 'אין עבודות בסינון הזה.';
  })();

  return (
    <div className="tw" data-tax-work data-section={section}>
      <header className="tw-head">
        <div className="tw-head-text">
          <h2 className="tw-h">{def.label}</h2>
          <p className="tw-lead">{def.lead}</p>
          <p className="tw-how">
            <span>{def.howToOpen}</span>
            {domain && onLearn && <> · <button type="button" className="ta-link" onClick={() => onLearn(domain.id)} data-tw-learn>ללמוד את התחום: {domain.label} ←</button></>}
          </p>
        </div>
        {adds.length > 0 && (
          <div className="tw-adds">
            {adds.map(k => (
              <button key={k} type="button" className="btn btn-primary tw-add" onClick={() => setAdding(k)} disabled={refreshing || !data} data-tw-add={k}>
                {refreshing ? 'מעדכן את הרשימה…' : addLabel(k)}
              </button>
            ))}
          </div>
        )}
      </header>
      {flash && <div className="ty-ok" role="status">{flash} <button type="button" className="ta-link" onClick={() => setFlash(null)} aria-label="סגור הודעה">✕</button></div>}
      {(overdue > 0 || soon > 0 || toReviewTotal > 0) && (
        <div className="tw-alerts" role="status">
          {overdue > 0 && <button type="button" className="tw-alert is-overdue" onClick={() => { setDueF('overdue'); setStateF('open'); }}>{overdue === 1 ? 'עבודה אחת באיחור' : `${overdue} עבודות באיחור`}</button>}
          {soon > 0 && <button type="button" className="tw-alert is-soon" onClick={() => { setDueF('soon'); setStateF('open'); }}>{soon === 1 ? 'מועד אחד מתקרב' : `${soon} מועדים מתקרבים`} (3 שבועות)</button>}
          {toReviewTotal > 0 && <button type="button" className="tw-alert is-review" onClick={() => { setStateF('mine'); setDueF('any'); }}>{toReviewTotal === 1 ? 'פריט אחד ממתין' : `${toReviewTotal} פריטים ממתינים`} לבדיקתך</button>}
        </div>
      )}
      <div className="tw-filters">
        <div className="tw-kinds" role="group" aria-label="מצב העבודה">
          {STATES.map(s => {
            const n = countOf(s.id);
            if (s.id === 'cancelled' && n === 0 && stateF !== 'cancelled') return null;
            return (
              <button key={s.id} type="button" className={`tw-kind${stateF === s.id ? ' is-on' : ''}`} aria-pressed={stateF === s.id} onClick={() => setStateF(s.id)} data-tw-state={s.id}>
                {s.label} <span className="tw-kind-n">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="tw-select">מועד
          <select value={dueF} onChange={e => setDueF(e.target.value as DueFilter)}>{DUES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
      </div>
      {err && <div className="ty-err" role="alert">לא ניתן לטעון: {err} <button type="button" className="ta-link" onClick={() => void load()}>נסה שוב</button></div>}
      {!data && !err && <div className="ty-note" role="status">טוען…</div>}
      {data && (
        <div className="tw-table" role="table" aria-label={def.label}>
          <div className="tw-row tw-headrow" role="row">
            <div className="tw-c" role="columnheader">לקוח</div><div className="tw-c" role="columnheader">{section === 'all' ? 'עבודה ותקופה' : 'עבודה'}</div>
            <div className="tw-c" role="columnheader">מועד</div><div className="tw-c" role="columnheader">מצב · מה חסר · הבא</div><div className="tw-actions" role="columnheader" />
          </div>
          {sorted.map(line)}
          {sorted.length === 0 && <p className="ty-note tw-empty">{emptyText}</p>}
        </div>
      )}
      {adding && data && (
        <AddTaxWorkDialog clients={clients} steps={data.steps} initialKind={adding} onClose={() => setAdding(null)}
          onDone={res => { setRefreshing(true); void load().finally(() => setRefreshing(false)); if (res.length) setFlash(`${res.length === 1 ? 'עבודה אחת נוספה' : `${res.length} עבודות נוספו`} — עם טיוטת שאלות שלא פורסמה. מופיעות גם בתיק הלקוח וב«בקשות».`); }} />
      )}
      {removing && (
        <RemoveWorkDialog stepId={removing.parent.id} title={`${removing.title} · ${clientName(removing.parent.clientId)}`}
          onClose={() => setRemoving(null)}
          onDone={(what, text) => {
            setRemoving(null); setFlash(text); void load();
            // ‼ אחרי החזרה עוברים ל«פתוחות», שם השורה חוזרת; אחרי ביטול — נשארים, והשורה יורדת מהרשימה
            if (what === 'restored') setStateF('open');
          }} />
      )}
      {open && openClient && (
        <TaxYearProcess client={openClient} step={open.parent} infoStep={open.info}
          onClose={() => { setOpenId(null); void load(); }} onChanged={() => void load()} onRemoved={setFlash} />
      )}
    </div>
  );
}

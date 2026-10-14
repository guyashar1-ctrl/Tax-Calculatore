// ─── «עבודת מס» — כל העבודות של כל הלקוחות, לתצוגת המשרד (236; 13.10.2026) ─────────────────
// ‼ לא רשימה חדשה ולא משימות: אותן בקשות כמו ב«בקשות» של הלקוח ובתיק המס. «פתח» פותח את אותו דף תהליך.
// ‼ 13.10.2026: «הוסף דוח או הצהרת הון» (ללקוח אחד או לכמה), ורשימה: לקוח · עבודה · תקופה · מועד · מצב · מה חסר ·
//   הבא; סינון לפי סוג, מצב ומועד; איחורים ומועדים קרובים בראש. מועד «רשמי» — רק עם בסיס (workMeta.deadlineView).
// ‼ קורא רק onboarding_steps ו-tax_info_asks / tax_year_facts / tax_evidence — לא טבלאות הערכה או הכנת דוח.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { supabase } from '../../lib/supabase';
import { stepFromDb } from '../../lib/dbMappers';
import { formatDate, todayIso } from '../../utils/dateFormat';
import TaxYearProcess from './TaxYearProcess';
import AddTaxWorkDialog from './AddTaxWorkDialog';
import { buildWorkRows, isOpenStep, WORK_STEP_TYPES, type WorkKind, type WorkRow } from './taxWork';
import { daysTo, deadlineView, dueState, type DueState } from './workMeta';
import { AVAILABLE } from '../taxKnowledge/availability';
import './taxYear.css';

interface Props {
  clients: Client[];
  /** פתיחת תיק הלקוח בלשונית — «תיק המס» או «מסמכים». */
  onOpenClient: (clientId: string, tab: 'taxfile' | 'docs') => void;
}

const KINDS: { id: WorkKind | 'all'; label: string }[] = [
  { id: 'all', label: 'הכול' }, { id: 'annual', label: 'דוחות שנתיים' }, { id: 'wealth', label: 'הצהרות הון' }, { id: 'intake', label: 'קליטה' },
  ...(AVAILABLE.taxEstimate ? [{ id: 'estimate' as const, label: 'הערכות מס' }] : []),
];
type StateFilter = 'open' | 'mine' | 'client' | 'done';
const STATES: { id: StateFilter; label: string }[] = [{ id: 'open', label: 'פתוחות' }, { id: 'mine', label: 'לטיפולי' }, { id: 'client', label: 'אצל הלקוח' }, { id: 'done', label: 'הושלמו' }];
type DueFilter = 'any' | 'overdue' | 'soon' | 'none';
const DUES: { id: DueFilter; label: string }[] = [{ id: 'any', label: 'כל המועדים' }, { id: 'overdue', label: 'באיחור' }, { id: 'soon', label: 'מתקרב (3 שבועות)' }, { id: 'none', label: 'בלי מועד' }];
type Row = Record<string, unknown>;
const he = (iso?: string) => (iso ? formatDate(iso) : '');

export default function TaxWorkView({ clients, onOpenClient }: Props) {
  const [data, setData] = useState<{ steps: OnboardingStep[]; asks: Row[]; facts: Row[]; evidence: Row[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<WorkKind | 'all'>('all');
  const [stateF, setStateF] = useState<StateFilter>('open');
  const [dueF, setDueF] = useState<DueFilter>('any');
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // ‼ אחרי יצירה הרשימה נטענת מחדש; עד שהיא מתעדכנת אין לפתוח שוב את ההוספה — «כבר קיימת» נשען עליה
  const [refreshing, setRefreshing] = useState(false);
  const today = todayIso();

  const load = useCallback(async () => {
    const st = await supabase.from('onboarding_steps').select('*').in('step_type', [...WORK_STEP_TYPES, 'info_collection']);
    if (st.error) { setErr(st.error.message); return; }
    const steps = ((st.data ?? []) as Row[]).map(r => stepFromDb(r));
    const infoIds = steps.filter(s => s.stepType === 'info_collection').map(s => s.id);
    if (!infoIds.length) { setData({ steps, asks: [], facts: [], evidence: [] }); setErr(null); return; }
    const a = await supabase.from('tax_info_asks').select('id, step_id, state, prompt, unavailable').in('step_id', infoIds);
    if (a.error) { setErr(a.error.message); return; }
    const askIds = ((a.data ?? []) as Row[]).map(x => String(x.id));
    const [f, e] = askIds.length
      ? await Promise.all([
        supabase.from('tax_year_facts').select('ask_id, status').in('ask_id', askIds).eq('status', 'pending'),
        supabase.from('tax_evidence').select('ask_id, review').in('ask_id', askIds).eq('review', 'needs_review'),
      ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (f.error || e.error) { setErr((f.error ?? e.error)!.message); return; }
    setData({ steps, asks: (a.data ?? []) as Row[], facts: (f.data ?? []) as Row[], evidence: (e.data ?? []) as Row[] });
    setErr(null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const rows = useMemo(() => !data ? [] : buildWorkRows(
    data.steps,
    data.asks.map(x => {
      const p = (x.prompt ?? {}) as { title?: string; subjectName?: string };
      return { id: String(x.id), stepId: String(x.step_id), state: String(x.state), title: p.title ?? '', subjectName: p.subjectName };
    }),
    data.facts.map(x => ({ askId: x.ask_id ? String(x.ask_id) : undefined, status: String(x.status) })),
    data.evidence.map(x => ({ askId: x.ask_id ? String(x.ask_id) : undefined, review: String(x.review) })),
    id => byId.get(id)?.firstName ?? '',
  ).filter(r => byId.has(r.parent.clientId)), [data, byId]);

  const withDue = useMemo(() => rows.map(r => {
    const dv = deadlineView(r.parent);
    return { r, dv, ds: dueState(dv, today, isOpenStep(r.parent)) as DueState };
  }), [rows, today]);

  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  const shown = withDue.filter(({ r, ds }) => (kind === 'all' || r.kind === kind)
    && (stateF === 'open' ? r.bucket !== 'done' : stateF === 'done' ? r.bucket === 'done' && String(r.parent.updatedAt ?? r.parent.createdAt ?? '') >= monthAgo : r.bucket === stateF)
    && (dueF === 'any' || (dueF === 'overdue' ? ds === 'overdue' : dueF === 'soon' ? ds === 'soon' : ds === 'none')));
  // ‼ סדר: באיחור → מתקרב → לטיפולי → אצל הלקוח; בתוך כל קבוצה — המועד הקרוב קודם
  const rank = (x: typeof withDue[number]) => (x.ds === 'overdue' ? 0 : x.ds === 'soon' ? 1 : x.r.bucket === 'mine' ? 2 : 3);
  const sorted = [...shown].sort((a, b) => rank(a) - rank(b)
    || String(a.dv.effectiveDue ?? a.dv.internalTarget ?? '9999').localeCompare(String(b.dv.effectiveDue ?? b.dv.internalTarget ?? '9999'))
    || (b.r.toReview - a.r.toReview));

  const openRows = withDue.filter(x => x.r.bucket !== 'done');
  const overdue = openRows.filter(x => x.ds === 'overdue').length;
  const soon = openRows.filter(x => x.ds === 'soon').length;
  const toReviewTotal = rows.reduce((n, r) => n + r.toReview, 0);

  const open = openId ? rows.find(r => r.parent.id === openId) : undefined;
  const openClient = open ? byId.get(open.parent.clientId) : undefined;

  const periodOf = (r: WorkRow) => {
    const p = (r.parent.payload ?? {}) as { taxYear?: number; asOfDate?: string; cutoffMonth?: number };
    if (r.kind === 'wealth') return p.asOfDate ? `ליום ${he(p.asOfDate)}` : '';
    if (r.kind === 'intake') return p.asOfDate ? `נכון ל-${he(p.asOfDate)}` : 'פרטים קבועים';
    return p.taxYear ? `שנת ${p.taxYear}` : '';
  };
  const kindName = (k: WorkKind) => (k === 'annual' ? 'דוח שנתי' : k === 'wealth' ? 'הצהרת הון' : k === 'intake' ? 'קליטה והשלמת תיק' : 'הערכת מס');
  const dueCell = ({ dv, ds }: typeof withDue[number]) => {
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
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח';
    const since = r.info?.publishedAt ? ` · בדף האישי מ-${formatDate(r.info.publishedAt)}` : '';
    return (
      <div key={r.parent.id} className={`tw-row is-${x.ds}`} data-tw-row={r.kind} role="row">
        <div className="tw-c tw-c-client" role="cell"><b className="tw-title">{name}</b></div>
        <div className="tw-c tw-c-work" role="cell"><span>{kindName(r.kind)}</span><small>{periodOf(r)}</small></div>
        <div className="tw-c tw-c-due" role="cell">{dueCell(x)}</div>
        <div className="tw-c tw-c-state" role="cell">
          <span className="tw-next">{r.next}{r.bucket === 'client' ? since : ''}</span>
          <span className="tw-counts">
            {r.toReview > 0 && <span className="tw-chip is-review">ממתין לבדיקתך: {r.toReview}</span>}
            {r.missing.length > 0 && <span className="tw-chip">חסר אצל הלקוח: {r.missing.length}{r.unavailable ? ` (${r.unavailable} מסמכים)` : ''}</span>}
            {r.drafts > 0 && <span className="tw-chip is-quiet">טיוטה: {r.drafts} — לא פורסמה</span>}
          </span>
          {r.missing.length > 0 && (
            <details className="tw-missing">
              <summary>מה חסר</summary>
              <ul>{r.missing.slice(0, 12).map(a => <li key={a.id}>{a.title}{a.subjectName ? ` · ${a.subjectName}` : ''}{a.state === 'unavailable' ? ' — עוד לא הועלה' : ''}</li>)}
                {r.missing.length > 12 && <li>ועוד {r.missing.length - 12}…</li>}</ul>
            </details>
          )}
        </div>
        <div className="tw-actions" role="cell">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpenId(r.parent.id)}>פתח</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenClient(c.id, 'taxfile')}>תיק המס</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenClient(c.id, 'docs')}>מסמכים</button>
        </div>
      </div>
    );
  };

  return (
    <div className="tw" data-tax-work>
      <div className="tw-top">
        <p className="ty-note" style={{ margin: 0 }}>
          אותן עבודות כמו בתיק הלקוח וב«בקשות»; «פתח» — אותו דף.
          {toReviewTotal > 0 && <> <b>{toReviewTotal === 1 ? 'פריט אחד ממתין' : `${toReviewTotal} פריטים ממתינים`} לבדיקתך.</b></>}
        </p>
        <button type="button" className="btn btn-primary tw-add" onClick={() => setAdding(true)} disabled={refreshing} data-tw-add>{refreshing ? 'מעדכן את הרשימה…' : '＋ הוסף דוח או הצהרת הון'}</button>
      </div>
      {flash && <div className="ty-ok" role="status">{flash}</div>}
      {(overdue > 0 || soon > 0) && (
        <div className="tw-alerts" role="status">
          {overdue > 0 && <button type="button" className="tw-alert is-overdue" onClick={() => { setDueF('overdue'); setStateF('open'); }}>{overdue === 1 ? 'עבודה אחת באיחור' : `${overdue} עבודות באיחור`}</button>}
          {soon > 0 && <button type="button" className="tw-alert is-soon" onClick={() => { setDueF('soon'); setStateF('open'); }}>{soon === 1 ? 'מועד אחד מתקרב' : `${soon} מועדים מתקרבים`} (3 שבועות)</button>}
        </div>
      )}
      <div className="tw-filters">
        <div className="tw-kinds" role="group" aria-label="סוג עבודה">
          {KINDS.map(k => (
            <button key={k.id} type="button" className={`tw-kind${kind === k.id ? ' is-on' : ''}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
              {k.label} <span className="tw-kind-n">{k.id === 'all' ? openRows.length : openRows.filter(x => x.r.kind === k.id).length}</span>
            </button>
          ))}
        </div>
        <label className="tw-select">מצב
          <select value={stateF} onChange={e => setStateF(e.target.value as StateFilter)}>{STATES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
        <label className="tw-select">מועד
          <select value={dueF} onChange={e => setDueF(e.target.value as DueFilter)}>{DUES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
      </div>
      {err && <div className="ty-err" role="alert">לא ניתן לטעון: {err}</div>}
      {!data && !err && <div className="ty-note">טוען…</div>}
      {data && (
        <div className="tw-table" role="table" aria-label="עבודות מס">
          <div className="tw-row tw-headrow" role="row">
            <div className="tw-c" role="columnheader">לקוח</div><div className="tw-c" role="columnheader">עבודה ותקופה</div>
            <div className="tw-c" role="columnheader">מועד</div><div className="tw-c" role="columnheader">מצב · מה חסר · הבא</div><div className="tw-actions" role="columnheader" />
          </div>
          {sorted.map(line)}
          {sorted.length === 0 && <p className="ty-note tw-empty">אין עבודות בסינון הזה.{rows.length === 0 ? ' «＋ הוסף דוח או הצהרת הון» — ללקוח אחד או לכמה.' : ''}</p>}
        </div>
      )}
      {adding && data && (
        <AddTaxWorkDialog clients={clients} steps={data.steps} onClose={() => setAdding(false)}
          onDone={res => { setRefreshing(true); void load().finally(() => setRefreshing(false)); if (res.length) setFlash(`${res.length === 1 ? 'עבודה אחת נוספה' : `${res.length} עבודות נוספו`} — עם טיוטת שאלות שלא פורסמה. מופיעות גם בתיק הלקוח וב«בקשות».`); }} />
      )}
      {open && openClient && (
        <TaxYearProcess client={openClient} step={open.parent} infoStep={open.info}
          onClose={() => { setOpenId(null); void load(); }} onChanged={() => void load()} />
      )}
    </div>
  );
}

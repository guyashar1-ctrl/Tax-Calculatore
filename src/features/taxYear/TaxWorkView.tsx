// ─── «עבודת מס» — תצוגת משרד של תהליכי האיסוף של כל הלקוחות ───────────────────────
// ‼ לא רשימה חדשה ולא משימות: אותן בקשות כמו ב«בקשות» של הלקוח (קליטה, דוח שנתי, הצהרות הון),
//   לפי אצל מי הכדור. «פתח» פותח את אותו דף תהליך; «תיק המס» ו«מסמכים» — את תיק הלקוח במקום הנכון.
// ‼ קורא רק onboarding_steps ו-tax_info_asks / tax_year_facts / tax_evidence (229) — לא טבלאות הערכה או הכנת דוח.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { supabase } from '../../lib/supabase';
import { stepFromDb } from '../../lib/dbMappers';
import { formatDate } from '../../utils/dateFormat';
import TaxYearProcess from './TaxYearProcess';
import { buildWorkRows, sortWorkRows, WORK_STEP_TYPES, type WorkKind, type WorkRow } from './taxWork';
import { AVAILABLE } from '../taxKnowledge/availability';
import './taxYear.css';

interface Props {
  clients: Client[];
  /** פתיחת תיק הלקוח בלשונית — «תיק המס» או «מסמכים». */
  onOpenClient: (clientId: string, tab: 'taxfile' | 'docs') => void;
}

const KINDS: { id: WorkKind | 'all'; label: string }[] = [
  { id: 'all', label: 'הכול' }, { id: 'intake', label: 'קליטה' }, { id: 'annual', label: 'דוח שנתי' }, { id: 'wealth', label: 'הצהרות הון' },
  ...(AVAILABLE.taxEstimate ? [{ id: 'estimate' as const, label: 'הערכות מס' }] : []),
];
type Row = Record<string, unknown>;

export default function TaxWorkView({ clients, onOpenClient }: Props) {
  const [data, setData] = useState<{ steps: OnboardingStep[]; asks: Row[]; facts: Row[]; evidence: Row[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [kind, setKind] = useState<WorkKind | 'all'>('all');

  const load = useCallback(async () => {
    const st = await supabase.from('onboarding_steps').select('*').in('step_type', [...WORK_STEP_TYPES, 'info_collection']);
    if (st.error) { setErr(st.error.message); return; }
    const steps = ((st.data ?? []) as Row[]).map(r => stepFromDb(r));
    const infoIds = steps.filter(s => s.stepType === 'info_collection').map(s => s.id);
    if (!infoIds.length) { setData({ steps, asks: [], facts: [], evidence: [] }); setErr(null); return; }
    const a = await supabase.from('tax_info_asks').select('id, step_id, state, prompt').in('step_id', infoIds);
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

  const shown = rows.filter(r => kind === 'all' || r.kind === kind);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
  const mine = sortWorkRows(shown.filter(r => r.bucket === 'mine'));
  const atClient = sortWorkRows(shown.filter(r => r.bucket === 'client'));
  const done = shown.filter(r => r.bucket === 'done' && String(r.parent.updatedAt ?? r.parent.createdAt ?? '') >= monthAgo);
  const toReviewTotal = rows.reduce((n, r) => n + r.toReview, 0);

  const open = openId ? rows.find(r => r.parent.id === openId) : undefined;
  const openClient = open ? byId.get(open.parent.clientId) : undefined;

  const line = (r: WorkRow) => {
    const c = byId.get(r.parent.clientId)!;
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'לקוח';
    const since = r.info?.publishedAt ? ` · בדף האישי מ-${formatDate(r.info.publishedAt)}` : '';
    return (
      <div key={r.parent.id} className="tw-row" data-tw-row={r.kind}>
        <div className="tw-main">
          <b className="tw-title">{name} · {r.title}</b>
          <span className="tw-next">{r.next}{r.bucket === 'client' ? since : ''}</span>
          <span className="tw-counts">
            {r.missing.length > 0 && <span className="tw-chip">חסר אצל הלקוח: {r.missing.length}{r.unavailable ? ` (מתוכם ${r.unavailable} «אין לי עדיין»)` : ''}</span>}
            {r.toReview > 0 && <span className="tw-chip is-review">ממתין לבדיקתך: {r.toReview}</span>}
            {r.answered > 0 && <span className="tw-chip is-quiet">נענו: {r.answered}</span>}
            {r.drafts > 0 && <span className="tw-chip is-quiet">בטיוטה: {r.drafts}</span>}
          </span>
          {r.missing.length > 0 && (
            <details className="tw-missing">
              <summary>מה חסר</summary>
              <ul>{r.missing.slice(0, 12).map(a => <li key={a.id}>{a.title}{a.subjectName ? ` · ${a.subjectName}` : ''}{a.state === 'unavailable' ? ' — «אין לי עדיין»' : ''}</li>)}
                {r.missing.length > 12 && <li>ועוד {r.missing.length - 12}…</li>}</ul>
            </details>
          )}
        </div>
        <div className="tw-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpenId(r.parent.id)}>פתח את התהליך</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenClient(c.id, 'taxfile')}>תיק המס</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenClient(c.id, 'docs')}>מסמכים</button>
        </div>
      </div>
    );
  };

  return (
    <div className="tw" data-tax-work>
      <p className="ty-note" style={{ margin: 0 }}>
        אותן בקשות כמו בתיק הלקוח; «פתח את התהליך» — אותו דף כמו מהתיק.
        {toReviewTotal > 0 && <> <b>{toReviewTotal === 1 ? 'פריט אחד ממתין' : `${toReviewTotal} פריטים ממתינים`} לבדיקתך.</b></>}
      </p>
      <div className="tw-kinds" role="group" aria-label="סוג תהליך">
        {KINDS.map(k => (
          <button key={k.id} type="button" className={`tw-kind${kind === k.id ? ' is-on' : ''}`} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label} <span className="tw-kind-n">{k.id === 'all' ? rows.filter(r => r.bucket !== 'done').length : rows.filter(r => r.kind === k.id && r.bucket !== 'done').length}</span>
          </button>
        ))}
      </div>
      {err && <div className="ty-err" role="alert">לא ניתן לטעון: {err}</div>}
      {!data && !err && <div className="ty-note">טוען…</div>}
      {data && (
        <>
          <section aria-labelledby="tw-mine"><p className="ty-label" id="tw-mine">לטיפולי ({mine.length})</p>
            <div className="tw-rows">{mine.map(line)}{mine.length === 0 && <p className="ty-note">אין כרגע.</p>}</div></section>
          <section aria-labelledby="tw-client"><p className="ty-label" id="tw-client">אצל הלקוח ({atClient.length})</p>
            <div className="tw-rows">{atClient.map(line)}{atClient.length === 0 && <p className="ty-note">אין כרגע.</p>}</div></section>
          <details className="ty-details"><summary><b>הושלמו בחודש האחרון</b><span>{done.length}</span></summary>
            <div className="ty-details-body"><div className="tw-rows">{done.map(line)}</div></div></details>
        </>
      )}
      {open && openClient && (
        <TaxYearProcess client={openClient} step={open.parent} infoStep={open.info}
          onClose={() => { setOpenId(null); void load(); }} onChanged={() => void load()} />
      )}
    </div>
  );
}

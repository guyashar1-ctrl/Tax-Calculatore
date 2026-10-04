// «הפעלה ללקוחות…» — מסלול ידני או שנתי אצל כמה לקוחות בבת אחת.
// ‼ כל לקוח הוא קריאה נפרדת לשרת (start_flow_run), אחת אחרי השנייה: השרת מחליט
// לכל אחד מה חל עליו, ומה כבר קיים. התוצאה מוצגת לכל לקוח — לא «הצליח» כללי.
// ‼ «פעולות מול רשות ירוצו לבד» כבוי כברירת מחדל: זה אישור מפורש לריצות האלה
// בלבד, ולא שינוי של המסלול.
import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { creationReasonText, defaultTaxYear, serverErrorText, skipReasonText, startFlowRun, taxYearOptions, type RunMaterialized } from '../../features/flows/api';
import { TRIGGER_LABELS } from '../../features/flows/types';
import type { OfficeFlowRow } from './FlowBuilder';
import { FlSheet } from './builder/ui';
import { hasAutoActions } from '../../features/flows/compile';
import { AUTO_ACTION_GATES } from './builder/ItemSheet';
import './flows.css';

type Outcome =
  | { state: 'pending' }
  | { state: 'running' }
  | { state: 'done'; r: RunMaterialized & { ok?: boolean; error?: string } };

const nameOf = (c: Client) => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.businessName || 'לקוח בלי שם';
/** לקוח פעיל = בקליטה או פעיל (וגם רשומה ישנה בלי שלב). לידים וארכיון — רק כשמבקשים. */
const isActive = (c: Client) => !c.lifecycleStage || c.lifecycleStage === 'active' || c.lifecycleStage === 'onboarding';

export default function StartForClientsDialog({ flow, clients, itemTitle, onClose, onOpenClient }: {
  flow: OfficeFlowRow;
  clients: Client[];
  itemTitle: (itemKey: string) => string;
  onClose: () => void;
  onOpenClient?: (clientId: string, tab?: 'journey') => void;
}) {
  const annual = flow.trigger === 'annual';
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [year, setYear] = useState(defaultTaxYear);
  const [allowAuto, setAllowAuto] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome> | null>(null);
  const [busy, setBusy] = useState(false);
  const autoActions = hasAutoActions(flow.definition);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients
      .filter(c => all || isActive(c))
      .filter(c => !needle || [nameOf(c), c.businessName, c.idNumber].filter(Boolean).join(' ').toLowerCase().includes(needle))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'he'));
  }, [clients, q, all]);

  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownPicked = list.length > 0 && list.every(c => picked.has(c.id));

  async function run() {
    const ids = clients.filter(c => picked.has(c.id)).map(c => c.id);
    setBusy(true);
    const init: Record<string, Outcome> = {};
    for (const id of ids) init[id] = { state: 'pending' };
    setOutcomes(init);
    // ‼ אחד-אחד, לא במקביל: כל קריאה פותחת בקשות ויוצרת תלות; ריצה במקביל
    // הייתה מעמיסה על השרת בלי שום תועלת למשרד.
    for (const id of ids) {
      setOutcomes(o => ({ ...o, [id]: { state: 'running' } }));
      const r = await startFlowRun(id, flow.id, annual ? String(year) : null, autoActions && allowAuto);
      setOutcomes(o => ({ ...o, [id]: { state: 'done', r } }));
    }
    setBusy(false);
  }

  if (outcomes) {
    const rows = clients.filter(c => outcomes[c.id]);
    const finished = rows.filter(c => outcomes[c.id].state === 'done').length;
    return (
      <FlSheet title={`«${flow.name}»${annual ? ` · ${year}` : ''}`} sub={busy ? `מפעיל… ${finished} מתוך ${rows.length}` : `הסתיים · ${rows.length} לקוחות`}
        onClose={() => { if (!busy) onClose(); }} wide
        foot={<><span className="fl-spacer" /><button type="button" className="btn btn-primary" disabled={busy} onClick={onClose}>סגירה</button></>}>
        <ul className="fl-results">
          {rows.map(c => {
            const o = outcomes[c.id];
            return (
              <li key={c.id}>
                <div className="fl-results-head">
                  <span className="fl-results-name">{nameOf(c)}</span>
                  {onOpenClient && o.state === 'done' && (
                    <button type="button" className="of-link" onClick={() => onOpenClient(c.id, 'journey')}>לכרטיס ←</button>
                  )}
                </div>
                <ResultLine o={o} itemTitle={itemTitle} />
              </li>
            );
          })}
        </ul>
        <p className="fl-hint">מה שנפתח מופיע אצל כל לקוח ב«בקשות», לפי «איך מגיע ללקוח» של כל שלב.</p>
      </FlSheet>
    );
  }

  return (
    <FlSheet title={`הפעלת «${flow.name}»`} sub={TRIGGER_LABELS[flow.trigger].label} onClose={onClose} wide
      foot={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>ביטול</button>
        <span className="fl-spacer" />
        <button type="button" className="btn btn-primary" disabled={picked.size === 0} onClick={() => void run()}>
          {picked.size === 0 ? 'בחרו לקוחות' : picked.size === 1 ? 'הפעלה אצל לקוח אחד' : `הפעלה אצל ${picked.size} לקוחות`}
        </button>
      </>}>
      {annual && (
        <label className="fl-field is-short">
          <span>שנת מס</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {taxYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      )}

      <div className="fl-pickbar">
        <input className="of-search" value={q} onChange={e => setQ(e.target.value)} data-autofocus
          placeholder="חיפוש לפי שם, עסק או ת.ז." aria-label="חיפוש לקוח" />
        <label className="fl-check is-inline">
          <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
          <span>גם לידים וארכיון</span>
        </label>
      </div>
      <div className="fl-pickhead">
        <label className="fl-check is-inline">
          <input type="checkbox" checked={allShownPicked} disabled={list.length === 0} onChange={e => {
            const on = e.target.checked;
            setPicked(s => { const n = new Set(s); for (const c of list) { if (on) n.add(c.id); else n.delete(c.id); } return n; });
          }} />
          <span>{allShownPicked ? 'ביטול הבחירה' : `סימון כל ${list.length} המוצגים`}</span>
        </label>
        <span className="fl-hint">{picked.size > 0 ? `נבחרו ${picked.size}` : ''}</span>
      </div>
      {list.length === 0 ? <p className="fl-empty">לא נמצא לקוח.</p> : (
        <ul className="fl-clients">
          {list.map(c => (
            <li key={c.id}>
              <label className="fl-check">
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                <span>{nameOf(c)}{c.businessName && nameOf(c) !== c.businessName && <span className="fl-hint is-block">{c.businessName}</span>}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {autoActions && (
        <label className="fl-check fl-auto-opt">
          <input type="checkbox" checked={allowAuto} onChange={e => setAllowAuto(e.target.checked)} />
          <span>
            פעולות מול רשות שבמסלול ירוצו לבד אצל הלקוחות האלה
            <span className="fl-hint is-block">{AUTO_ACTION_GATES}</span>
          </span>
        </label>
      )}
      <p className="fl-hint">
        {annual ? 'המסלול נפתח לכל לקוח לשנה שנבחרה; לקוח שכבר הופעל לו המסלול לשנה הזו — מדולג. ' : 'לקוח שהמסלול כבר פעיל אצלו — מדולג. '}
        השרת בודק לכל לקוח מה חל עליו לפי מה שידוע בכרטיס.
      </p>
    </FlSheet>
  );
}

function ResultLine({ o, itemTitle }: { o: Outcome; itemTitle: (k: string) => string }) {
  if (o.state === 'pending') return <div className="fl-hint">ממתין…</div>;
  if (o.state === 'running') return <div className="fl-hint">מפעיל…</div>;
  const r = o.r;
  if (r.ok === false || r.error) {
    return <div className={r.error === 'already_active' || r.error === 'cycle_done' ? 'fl-hint' : 'fl-issue-inline'}>{serverErrorText(r.error, 'לא הופעל — אפשר לנסות שוב')}</div>;
  }
  if (r.alreadyStarted) return <div className="fl-hint">{r.status === 'paused' ? 'כבר מופעל לשנה הזו (בעצירה)' : 'כבר מופעל לשנה הזו'}</div>;
  const created = r.created ?? [];
  // ‼ בקשה שהייתה אמורה להיווצר ולא נוצרה — בחוץ, לא בתוך «דולגו»: אצל הלקוח היא שורה
  // אדומה ב«בקשות» עם הסיבה ומה עושים. דילוג תמים (לא חל, כבר קיים) — מקופל.
  const problems = (r.skipped ?? []).filter(s => s.problem);
  // ‼ (B4) מה שמחכה לסוג העוסק — לא מקופל ב«דולגו»: אחרי שקובעים אותו בתיק המס הוא מוצע
  // ב«מה מוצע» בכרטיס (flow_run_suggestions) — לא נפתח לבד, ולכן צריך שיראו אותו כאן.
  const kindHeld = (r.skipped ?? []).filter(s => !s.problem && s.reason === 'kind_unknown');
  const skipped = (r.skipped ?? []).filter(s => !s.problem && s.reason !== 'kind_unknown');
  const who = (role?: string) => (role === 'spouse' ? ' (בן/בת הזוג)' : '');
  return (
    <div className="fl-results-line">
      <span>{created.length === 0 ? 'לא נפתח כלום' : created.length === 1 ? 'נפתחה בקשה אחת' : `נפתחו ${created.length} בקשות`}</span>
      {kindHeld.length > 0 && (
        <div className="fl-hint" role="note" style={{ flexBasis: '100%' }}>
          {kindHeld.length === 1 ? `«${itemTitle(kindHeld[0].itemKey)}» מחכה` : `${kindHeld.length} בקשות מחכות`} לסוג העוסק — אחרי שקובעים אותו בתיק המס, מה שמתאים מוצע ב«מה מוצע» בכרטיס.
        </div>
      )}
      {problems.length > 0 && (
        <div className="fl-issue-inline" role="note" style={{ flexBasis: '100%' }}>
          {problems.length === 1
            ? `לא נוצרה «${itemTitle(problems[0].itemKey)}»${who(problems[0].role)} — ${creationReasonText(problems[0].reason)}. מופיעה באדום אצל הלקוח.`
            : <>
                לא נוצרו {problems.length} — מופיעות באדום אצל הלקוח:
                <ul style={{ margin: '2px 0 0', paddingInlineStart: 18 }}>
                  {problems.map((s, i) => (
                    <li key={`${s.itemKey}-${s.role ?? ''}-${i}`}>«{itemTitle(s.itemKey)}»{who(s.role)} — {creationReasonText(s.reason)}</li>
                  ))}
                </ul>
              </>}
        </div>
      )}
      {skipped.length > 0 && (
        <details className="fl-more is-inline">
          <summary>דולגו {skipped.length}</summary>
          <ul>
            {skipped.map((s, i) => (
              <li key={`${s.itemKey}-${s.role ?? ''}-${i}`}>
                {itemTitle(s.itemKey)}{who(s.role)}: {skipReasonText(s.reason)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── «הפעלת מסלול» ללקוח אחד ───────────────────────────────────────────────
// מחליף את «בקשה מתבנית»: במקום כמה בקשות בלי שם ובלי מעקב — מסלול שהוגדר
// במשרד («המשרד ← מסלולים»), עם שלבים, ומה קורה בכל אחד.
//
// ‼ התצוגה כאן היא ניחוש מהכרטיס, לא הכרעה: השרת מחשב את העובדות בעצמו
// (client_flow_facts) ומחליט מה נפתח. לכן הכותרת אומרת «תצוגה מקדימה — מה שייפתח בפועל נקבע בהפעלה»,
// ותוצאת ההפעלה מוצגת כפי שהשרת החזיר (נוצר / דולג ולמה).
// ‼ פעולות מול רשות שבמסלול רצות לבד רק אם סימנת כאן — ברירת המחדל: בלחיצה שלך. לכן
// «לבד» בתכנון מופיע רק כשהתיבה מסומנת; אחרת כתוב «בלחיצה שלך».

import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import { defaultTaxYear, loadOfficeFlows, serverErrorText, startFlowRun, taxYearOptions, type ClientFlowRun, type OfficeFlowsResult } from '../../features/flows/api';
import { hasAutoActions } from '../../features/flows/compile';
import { KIND_UNKNOWN_TEXT, planFor } from '../../features/flows/preview';
import { TRIGGER_LABELS, type ClientFacts } from '../../features/flows/types';
import type { ClientKind } from '../../types/journeyDefaults';
import type { Client } from '../../types';
import { useFlowLibrary } from '../../hooks/useClientFlowRuns';
import { materializedSummary, momentsOf, stageDeliveryLines } from './runSummary';
import { planSpouseText } from './builder/model';
import { AUTO_ACTION_GATES } from './builder/ItemSheet';
import './clientFlows.css';

type Flow = OfficeFlowsResult['flows'][number];

interface Props {
  clientId: string;
  client: Client;
  firstName: string;
  /** הריצות של הלקוח — כדי לומר «כבר פעיל» לפני שלוחצים. */
  runs: ClientFlowRun[];
  /** מסלול שנבחר כבר (מ«בקשה חדשה ← מסלולים»). */
  preselectFlowId?: string;
  onClose: () => void;
  /** אחרי הפעלה (גם חלקית) — בקשות, המגש והמסלולים נטענים מחדש. */
  onStarted: () => void;
}

/** סוג הלקוח מהכרטיס — אותו סדר כמו client_flow_facts בשרת. */
function kindFromClient(c: Client): ClientKind | null {
  if (c.dealerType === 'company') return 'company';
  if (c.dealerType === 'licensed' || c.vatStatus === 'authorizedDealer') return 'licensed_dealer';
  if (c.dealerType === 'exempt' || c.vatStatus === 'exemptDealer') return 'exempt_dealer';
  return null;
}

/**
 * השם הפרטי של בן/בת הזוג — ‼ אותו כלל כמו client_spouse_first_name בשרת (215): השדה
 * המפוצל, ואם הוא ריק — המילה הראשונה של «שם בן/בת הזוג». כרטיס שנוצר מהצעה / מליד
 * נושא רק את השם המשורשר, ובלי זה בן/בת הזוג נעלם/ה מהמסלול בשקט.
 */
export function spouseFirstNameOf(c: Pick<Client, 'spouseFirstName' | 'spouseName'>): string {
  return c.spouseFirstName?.trim() || (c.spouseName ?? '').trim().split(/\s+/)[0] || '';
}

/** נשוי/אה, בלי כרטיס לבן/בת הזוג, ובלי שום שם בכרטיס — «לכל אדם» לא ייפתח לבן/בת הזוג (spouseNameMissing בשרת). */
export function spouseNameMissing(c: Pick<Client, 'familyStatus' | 'spouseFirstName' | 'spouseName' | 'spouseClientId'>): boolean {
  return c.familyStatus === 'married' && !spouseFirstNameOf(c) && !c.spouseClientId;
}

/** «גם לבן/בת הזוג» כשאין שם בכרטיס — מה התכנון אומר (השרת רושם שורת «לא נוצרה»). */
export const SPOUSE_NAME_MISSING_TEXT = ' · לבן/בת הזוג לא ייפתח — אין שם בכרטיס. משלימים אותו בתיק המס, ב«משפחה ובן/בת זוג»';

/**
 * סוג עוסק לא ידוע במסלול ידני או שנתי — ‼ טקסט אחד לשלב ולפריט. השרת לא יוצר את מה
 * שמחכה לסוג (kind_unknown) ולא פותח אותו לבד כשהסוג נקבע: הוא מוצע אז ב«מה מוצע» בשורת
 * המסלול (flow_run_suggestions), ושום דבר לא נוסף בלי לחיצה.
 */
export const KIND_LATER_TEXT = `${KIND_UNKNOWN_TEXT} — לא ייפתח עכשיו. אחרי שקובעים אותו בתיק המס, מה שמתאים יוצע ב«מה מוצע»`;

export function clientFactsFromCard(c: Client): ClientFacts {
  const married = c.familyStatus === 'married';
  return {
    kind: kindFromClient(c),
    married,
    // ‼ בן/בת זוג עם כרטיס משלו — העבודה עליו/ה נוצרת מהכרטיס שלו/ה, לא מכאן.
    hasSpouse: married && !!spouseFirstNameOf(c) && !c.spouseClientId,
    has_prev: !!c.hasPreviousAccountant,
    no_prev_email: !c.prevAccountantEmail?.trim(),
    licensed: c.dealerType === 'licensed' || c.dealerType === 'company' || c.vatStatus === 'authorizedDealer',
    rep: !!c.representationStatus || !!c.representationRequestId,
  };
}

export default function StartFlowDialog({ clientId, client, firstName, runs, preselectFlowId, onClose, onStarted }: Props) {
  const library = useFlowLibrary(true);
  const title = library.title;
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(preselectFlowId ?? null);
  const [year, setYear] = useState(defaultTaxYear);
  const [allowAuto, setAllowAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadOfficeFlows().then(r => {
      if (!alive) return;
      if (!r.ok) { setLoadError('לא הצלחתי לטעון את המסלולים.'); return; }
      setFlows(r.flows.filter(f => f.status === 'active' && (f.trigger === 'manual' || f.trigger === 'annual')));
    });
    return () => { alive = false; };
  }, []);

  const flow = flows?.find(f => f.id === flowId) ?? null;
  const facts = useMemo(() => clientFactsFromCard(client), [client]);
  const noSpouseName = spouseNameMissing(client);
  const plan = useMemo(() => (flow
    ? planFor(flow.definition, flow.trigger, facts, item => title(item.ref, item.snapshot?.title))
    : []), [flow, facts, title]);
  const auto = !!flow && hasAutoActions(flow.definition);
  // ‼ סדר הביצוע — רגעים לפי «נפתח», לא לפי המקום ברשימה (כמו בשורת המסלול בכרטיס).
  const moments = useMemo(() => {
    if (!flow) return [];
    const def = flow.definition;
    const stageOfItem = new Map(def.stages.flatMap(st => st.items.map(i => [i.key, st.key] as const)));
    const itemTitle = (k: string) => {
      const it = def.stages.flatMap(st => st.items).find(i => i.key === k);
      return it ? title(it.ref, it.snapshot?.title) : 'בקשה קודמת';
    };
    const withOpens = plan.map(st => ({ ...st, opens: def.stages.find(x => x.key === st.key)!.opens,
      src: def.stages.find(x => x.key === st.key)! }));
    return momentsOf(withOpens, flow.trigger, {
      stage: k => def.stages.find(x => x.key === k)?.name ?? 'שלב קודם',
      item: itemTitle,
      itemStage: k => stageOfItem.get(k),
    }, st => st.applies);
  }, [flow, plan, title]);
  const itemOf = (key: string) => flow?.definition.stages.flatMap(st => st.items).find(i => i.key === key);

  const liveRun = (f: Flow) => runs.find(r => r.flowId === f.id && (r.status === 'active' || r.status === 'paused')
    && (f.trigger !== 'annual' || r.cycleKey === String(year)));
  // שנה שהסתיימה או בוטלה — אומרים מראש מה «הפעל» יעשה (start_flow_run: בוטלה ⇒ נפתחת מחדש; הושלמה ⇒ אין מה להפעיל).
  const endedRun = (f: Flow) => f.trigger === 'annual'
    ? runs.find(r => r.flowId === f.id && r.cycleKey === String(year) && (r.status === 'done' || r.status === 'cancelled'))
    : undefined;
  const activeYears = (f: Flow) => runs
    .filter(r => r.flowId === f.id && (r.status === 'active' || r.status === 'paused') && f.trigger === 'annual')
    .map(r => r.cycleKey);

  async function start() {
    if (!flow) return;
    setBusy(true); setError(null);
    const r = await startFlowRun(clientId, flow.id, flow.trigger === 'annual' ? String(year) : null, auto && allowAuto);
    setBusy(false);
    if (r.ok === false) { setError(serverErrorText(r.error, 'ההפעלה לא הצליחה — אפשר לנסות שוב') + '.'); return; }
    // ‼ «הופעל» רק כשהשרת החזיר ריצה. תשובה בלי ריצה אינה הפעלה — לא מדווחים הצלחה.
    if (!r.runId) { setError('השרת לא אישר שהמסלול הופעל — רעננו את הכרטיס ובדקו בשורת המסלולים.'); onStarted(); return; }
    if (r.alreadyStarted) {
      setResult([`«${flow.name}»${flow.trigger === 'annual' ? ` לשנת ${year}` : ''} כבר פעיל אצל ${firstName} — לא נוצר דבר חדש.`]);
      onStarted();
      return;
    }
    const keyTitle = (key: string) => {
      const it = flow.definition.stages.flatMap(s => s.items).find(i => i.key === key);
      return it ? title(it.ref, it.snapshot?.title) : 'פריט';
    };
    // שנה שבוטלה ונפתחה שוב — מה שהושלם בה נשאר, מה שבוטל נוצר מחדש (start_flow_run).
    setResult([r.restarted
      ? `«${flow.name}»${flow.trigger === 'annual' ? ` לשנת ${year}` : ''} הופעל מחדש אצל ${firstName}. מה שכבר הושלם בה נשאר.`
      : `«${flow.name}» הופעל אצל ${firstName}.`, ...materializedSummary(r, keyTitle, firstName)]);
    onStarted();
  }

  const footer = result ? (
    <div className="cf-foot"><button type="button" className="btn btn-primary" onClick={onClose}>חזרה לבקשות</button></div>
  ) : (
    <div className="cf-foot">
      <span className="cf-foot-note">
        {flow ? 'הבקשות נוצרות לפי השלבים. מה שנפתח עכשיו מגיע לדף לפי ההגדרה של כל שלב.' : 'בחרו מסלול.'}
      </span>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>ביטול</button>
      <button type="button" className="btn btn-primary"
        disabled={!flow || busy || !!(flow && liveRun(flow)) || (!!flow && endedRun(flow)?.status === 'done')}
        onClick={() => void start()}>
        {busy ? 'מפעיל…' : flow && endedRun(flow)?.status === 'cancelled' ? 'הפעל מחדש' : 'הפעל'}
      </button>
    </div>
  );

  return (
    <Modal title={`הפעלת מסלול · ${firstName}`} onClose={onClose} width={600} footer={footer}>
      {result ? (
        <div role="status">{result.map((l, i) => <p key={i} className={i === 0 ? 'cf-ok' : 'cf-note'}>{l}</p>)}</div>
      ) : (
        <>
          {!flows && !loadError && <p className="cf-note">טוען מסלולים…</p>}
          {loadError && <div className="cf-err">⚠ {loadError}</div>}
          {flows && flows.length === 0 && (
            <p className="cf-note">
              עוד אין מסלולים ידניים או שנתיים. מגדירים אותם ב«המשרד ← מסלולים» — ומשם הם זמינים כאן לכל לקוח.
            </p>
          )}
          {flows && flows.map(f => {
            const years = activeYears(f);
            const busyRun = f.trigger === 'manual' && runs.some(r => r.flowId === f.id && (r.status === 'active' || r.status === 'paused'));
            return (
              <button key={f.id} type="button" className={`cf-pick${f.id === flowId ? ' is-on' : ''}`}
                aria-pressed={f.id === flowId} onClick={() => { setFlowId(f.id); setResult(null); setError(null); }}>
                <span className="cf-pick-name">
                  {f.name}
                  {busyRun && <span className="cf-tag">כבר פעיל</span>}
                  {years.length > 0 && <span className="cf-tag">פעיל ל-{years.join(', ')}</span>}
                </span>
                <span className="cf-pick-sub">
                  {TRIGGER_LABELS[f.trigger].label} · {f.definition.stages.length === 1 ? 'שלב אחד' : `${f.definition.stages.length} שלבים`}
                </span>
              </button>
            );
          })}

          {flow && flow.trigger === 'annual' && (
            <label className="cf-field">
              <span>לשנת מס</span>
              <select value={year} onChange={e => setYear(Number(e.target.value))}>
                {taxYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {liveRun(flow) && <span className="cf-tag">כבר פעיל לשנה הזו</span>}
              {!liveRun(flow) && endedRun(flow)?.status === 'done' && <span className="cf-tag">הושלם לשנה הזו</span>}
              {!liveRun(flow) && endedRun(flow)?.status === 'cancelled' && (
                <span className="cf-note">השנה הזו בוטלה. «הפעל מחדש» פותח אותה שוב — מה שכבר הושלם בה נשאר.</span>
              )}
            </label>
          )}

          {flow && (
            <div className="cf-sec" style={{ marginTop: 12 }}>
              <div className="cf-sec-title">מה יקרה אצל {firstName} · תצוגה מקדימה — מה שייפתח בפועל נקבע בהפעלה</div>
              {moments.map(m => (
                <div key={m.key} className="cf-plan-moment">
                  <div className="cf-moment-label">
                    {m.label}
                    {m.parallel > 1 && <span className="cf-par"> · {m.parallel} שלבים במקביל</span>}
                  </div>
                  {m.stages.map(st => (
                    <div key={st.key} className={`cf-plan-stage${st.applies ? '' : ' is-off'}`}>
                      <div className="cf-plan-head">
                        <strong>{st.name}</strong>
                        {!st.applies && (
                          <span className="cf-note" style={{ margin: 0 }}>
                            {/* ‼ סוג עוסק לא ידוע — לא «לא חל», ולא «ייפתח לבד»: מוצע ב«מה מוצע» (KIND_LATER_TEXT). */}
                            {st.kindUnknown ? KIND_LATER_TEXT : `לא ייפתח${st.why ? ` — ${st.why}` : ''}`}
                          </span>
                        )}
                      </div>
                      {st.applies && (
                        <div className="cf-stage-deliv" style={{ paddingInlineStart: 0 }}>
                          {stageDeliveryLines(st.src).map((l, i) => <div key={i}>{i === 0 ? <><b>ללקוח:</b> {l}</> : l}</div>)}
                        </div>
                      )}
                      <ul className="cf-plan-items">
                        {st.items.map(it => {
                          const src = itemOf(it.key);
                          // ‼ אישור אישי לא נפתח לבן/בת הזוג בדף של בעל הכרטיס — נפתחת משימה אליך;
                          // קבצים/פרטים באותה בקשה — כן בדף (refPersonalConfirm).
                          const confirm = src && it.roles.includes('spouse')
                            ? library.personalConfirm(src.ref, src.snapshot?.payload) : false;
                          return (
                            <li key={it.key} className={it.applies ? '' : 'is-off'}>
                              {it.title}
                              {/* ‼ «לבד» — אותו תג כמו בבונה; מתי בדיוק — AUTO_ACTION_GATES ליד התיבה למטה. */}
                              {it.kind === 'action' && (it.mode === 'auto' && allowAuto
                                ? <> <span className="cf-tag is-auto">לבד, כשאפשר</span></>
                                : it.mode === 'auto'
                                ? ' · בלחיצה שלך (אפשר לאשר למטה שתרוץ לבד)'
                                : ' · בלחיצה שלך')}
                              {it.roles.includes('spouse') && planSpouseText(confirm, firstName)}
                              {it.applies && src?.perPerson && noSpouseName && SPOUSE_NAME_MISSING_TEXT}
                              {it.optional && ' · רשות'}
                              {/* שלב שמחכה לסוג העוסק — המשפט כבר בשורת השלב; כאן לא חוזרים עליו. */}
                              {!it.applies && st.applies && it.kindUnknown
                                ? ` · ${KIND_LATER_TEXT}`
                                : !it.applies && !st.kindUnknown && it.why ? ` · לא ייפתח: ${it.why}` : ''}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {flow && auto && (
            <div>
              <label className="cf-check">
                <input type="checkbox" checked={allowAuto} onChange={e => setAllowAuto(e.target.checked)} />
                <span>פעולות מול רשות שבמסלול ירוצו לבד אצל {firstName}</span>
              </label>
              {/* ‼ מקור אחד לתנאים (FLOW_AUTO_GATES דרך AUTO_ACTION_GATES) — כמו הפעלה לכמה לקוחות.
                  נפתח לפי בקשה, ומחוץ ל-label: לחיצה על «מתי» לא מסמנת את התיבה. */}
              <details style={{ marginInlineStart: 24 }}>
                <summary className="cf-note" style={{ cursor: 'pointer', color: 'var(--accent)' }}>מתי זה רץ לבד</summary>
                <p className="cf-note">{AUTO_ACTION_GATES}</p>
              </details>
            </div>
          )}
          {error && <div className="cf-err">⚠ {error}</div>}
        </>
      )}
    </Modal>
  );
}

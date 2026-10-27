// ─── הערכת מס במשרד: מסך אחד — מספר אחד, המלצה אחת (27.10.2026) ──────────────────────────────────────────
// ‼ הדמיה מאושרת: docs/proposals/2026-10-27-tax-estimate.html. ארבעה שלבים: שאלון ← רו״ה מפייפרלס ← הצפי של הלקוח
//   ← הערכה והמלצה. כל השאר (חוסמים מפורטים, קליטות, יישור, גרסאות) — ב«כלים מתקדמים» (EstimatePanel), לא נמחק.
// ‼ אותו מנוע ואותן גרסאות (231/232): «פרסם» = שמירה + אישור + פרסום של הגרסה שעל המסך. PIVO לא משנה מקדמות —
//   «עדכנתי את המקדמות» רק רושם שבוצע (estimate.applied).
// ‼ התקרה (עסק זעיר / עוסק פטור) — רק כאן במשרד; ללקוח — המספרים שלו בלבד.
import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { YearData } from '../taxYear/api';
import * as tyApi from '../taxYear/api';
import { CATALOG_VERSION } from '../taxYear/catalog';
import { computeEstimate, MONTH_HE } from './engine';
import { buildDraft, reconciliationsNeeded } from './prefill';
import * as api from './api';
import { cardSnapshot } from '../taxFile/hub';
import ImportPanel from './ImportPanel';
import { adjustmentRows, deriveDraft, FORECAST_ITEM, forecastAnswerOf, incomeExpenses } from './forecastFlow';
import { he, nis, today, uid } from './parts';
import type { AuthorityAdvance, EstimateDraft, EstimateOutputs, EstimateVersion, IncomeLine } from './types';
import { isNum } from './types';
import './estimateWorkspace.css';

type Stage = 'q' | 'waiting' | 'answered' | 'pulled' | 'ready' | 'published' | 'done';

interface Props {
  client: Client;
  step: OnboardingStep;
  year: number;
  cutoffMonth: number;
  data: YearData;
  busy: boolean;
  /** «שליחת השאלון» בלחיצה אחת — אותו מנוע כמו בדוח השנתי (TaxYearProcess). */
  sendMore?: { count: number; run: () => Promise<boolean> };
  advancedOpen: boolean;
  onAdvanced: (open: boolean) => void;
  onChanged: () => void;
}

const n0 = (v: number) => Math.round(v).toLocaleString('he-IL');
const pct = (v: number) => `${v % 1 ? v.toFixed(1) : v}%`;
const valOf = (a: AuthorityAdvance, v: number) => (a.unit === '%' ? pct(v) : nis(v));
const changedAdv = (a: AuthorityAdvance) => a.current != null && a.recommended != null
  && (a.authority === 'it' ? Math.abs(a.recommended - a.current) >= 0.1 : !a.belowChangeThreshold && Math.abs(a.recommended - a.current) >= 1);

export default function EstimateWorkspace({ client, step, year, cutoffMonth, data, busy, sendMore, advancedOpen, onAdvanced, onChanged }: Props) {
  const firstName = client.firstName || 'הלקוח';
  const [versions, setVersions] = useState<EstimateVersion[] | null>(null);
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [open, setOpen] = useState(false);
  const [sf, setSf] = useState(0);
  const [pn, setPn] = useState(0);
  const [working, setWorking] = useState(false);

  const pre = useMemo(() => buildDraft({ client, taxYear: year, cutoffMonth, facts: data.facts, evidence: data.evidence, today: today() }), [client, year, cutoffMonth, data.facts, data.evidence]);
  const load = async () => {
    try {
      const vs = await api.loadEstimates(step.id);
      setVersions(vs);
      const cur = vs.find(v => v.status === 'draft') ?? [...vs].reverse().find(v => v.status === 'approved');
      setDraft(cur ? cur.draft : pre.draft);
    } catch (e) { setErr((e as Error).message); setVersions([]); setDraft(pre.draft); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step.id]);

  // ‼ אותה טיוטה כמו ב«כלים מתקדמים», ועליה מה שנגזר מהרו״ה ומהתשובות (הצפי וההתאמות) — בכל חישוב מחדש
  const eff = useMemo<EstimateDraft | null>(() => {
    if (!draft) return null;
    const recs = reconciliationsNeeded(draft, year).map(n => {
      const had = draft.reconciliations.find(r => r.lineId === n.lineId);
      const same = had && had.books === n.books && had.vat === n.vat && had.it134 === n.it134;
      return { id: had?.id ?? uid(), lineId: n.lineId, what: 'turnover' as const, books: n.books, vat: n.vat, it134: n.it134, ...(same ? { decision: had!.decision, note: had!.note, decidedAt: had!.decidedAt } : {}) };
    });
    return deriveDraft({ ...draft, reconciliations: recs }, data.facts, today());
  }, [draft, year, data.facts]);
  const out = useMemo(() => (eff ? computeEstimate(eff, { client, taxYear: year }) : null), [eff, client, year]);
  const what = useMemo(() => (eff && out && (sf || pn) ? computeEstimate(eff, { client, taxYear: year }, { extraStudyFund: { client: sf }, extraPension: { client: pn }, noChecks: true }) : null), [eff, out, client, year, sf, pn]);

  if (!versions || !eff || !out) return <section className="ew"><p className="ty-note">טוען…</p></section>;

  // ── איפה אנחנו ──
  const asks = data.asks.filter(a => a.parentStepId === step.id && a.state !== 'cancelled');
  const qAsks = asks.filter(a => a.itemKey !== FORECAST_ITEM);
  const fAsks = asks.filter(a => a.itemKey === FORECAST_ITEM);
  const filling = qAsks.some(a => a.state === 'published' && a.prompt.input.kind !== 'file');
  const biz = eff.lines.filter(l => l.source === 'business' && l.period?.actual !== 'out');
  const needsPull = biz.some(l => !l.months?.length);
  const answeredAll = biz.every(l => !!forecastAnswerOf(data.facts, l));
  const approved = [...versions].reverse().find(v => v.status === 'approved');
  const latest = versions[versions.length - 1];
  const upToDate = !!approved && latest?.id === approved.id && JSON.stringify(approved.outputs) === JSON.stringify(out);
  const advKeys = (approved?.outputs?.advances ?? []).filter(changedAdv).map(a => `adv-${a.authority}-${a.person}`);
  const appliedAt = (key: string) => (data.facts.find(f => f.itemKey === 'estimate.applied' && f.status !== 'rejected' && f.status !== 'superseded'
    && (f.value as { key?: string; version?: number } | undefined)?.key === key && (f.value as { version?: number }).version === approved?.version)?.value as { at?: string } | undefined)?.at;
  const stage: Stage = !qAsks.length && !fAsks.length ? 'q'
    : filling ? 'waiting'
    : biz.length && needsPull ? 'answered'
    : biz.length && !answeredAll ? 'pulled'
    : !(upToDate && approved?.publishedAt) ? 'ready'
    : advKeys.some(k => !appliedAt(k)) ? 'published' : 'done';
  const withData = !biz.length || !needsPull;
  const steps: [string, Stage[]][] = biz.length
    ? [['שאלון', ['q', 'waiting']], ['פייפרלס', ['answered']], [`הצפי של ${firstName}`, ['pulled']], ['הערכה והמלצה', ['ready', 'published']]]
    : [['שאלון', ['q', 'waiting']], ['הערכה והמלצה', ['ready', 'published']]];
  const curStep = stage === 'done' ? steps.length : steps.findIndex(s => s[1].includes(stage));

  // ── פעולות ──
  const save = async (d: EstimateDraft) => {
    const de = deriveDraft(d, data.facts, today());
    const o = computeEstimate(de, { client, taxYear: year });
    const vs = await api.loadEstimates(step.id);
    const r = await api.saveEstimate(step.id, de, o, [...pre.inputFacts, ...cardSnapshot(client)], api.baseOf(vs));
    if (!r.ok) throw new Error(r.error === 'conflict' ? 'מישהו שמר את ההערכה בינתיים — לרענן ולנסות שוב' : `השמירה נכשלה (${r.error})`);
  };
  /** בקשת הצפי — לכל עסק שיש לו רו״ה ואין לו עוד בקשה פתוחה. אותה בקשת «השלמת מידע» של ההערכה; בלי מייל. */
  const askForecast = async (d: EstimateDraft) => {
    const list = d.lines.filter(l => l.source === 'business' && l.months?.length && !fAsks.some(a => !l.entityRef || a.entityRef === l.entityRef));
    if (!list.length) return null;
    const micro = (l: IncomeLine) => l.track === 'micro';
    const r = await tyApi.addAsks(step.id, list.map(l => {
      const ms = (l.months ?? []).filter(x => x.m <= d.cutoffMonth);
      const byM = (k: 'income' | 'expenses') => Array.from({ length: d.cutoffMonth }, (_, i) => Math.round(ms.find(x => x.m === i + 1)?.[k] ?? 0));
      const first = ms.find(x => x.income != null || x.expenses != null)?.m ?? 1;
      return {
        itemKey: FORECAST_ITEM, subjectRole: l.person, entityKind: 'business' as const, entityRef: l.entityRef,
        prompt: { templateVersion: CATALOG_VERSION, title: biz.length > 1 ? `${l.label} — עד סוף השנה, זה נראה נכון?` : 'עד סוף השנה — זה נראה נכון?',
          why: 'זו הערכה שלך: לפי הקצב עד עכשיו, או מה שאתה יודע על החודשים הבאים. ממנה נקבעות המקדמות.',
          input: { kind: 'record' as const, schema: 'forecastMonths' as const, context: { data: JSON.stringify({ cutoff: d.cutoffMonth, first, inc: byM('income'), exp: micro(l) ? null : byM('expenses') }) } } },
      };
    }));
    if (!r.ok) throw new Error(`בקשת הצפי לא נוצרה (${r.error})`);
    const p = await tyApi.publishInfo(r.infoStepId);
    if (!p.ok) throw new Error(`בקשת הצפי לא פורסמה (${p.error})`);
    return true;
  };
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setWorking(true); setErr(null); setFlash(null);
    try { await fn(); setFlash(done); await load(); onChanged(); }
    catch (e) { setErr((e as Error).message); }
    finally { setWorking(false); }
  };
  const onPulled = (f: (d: EstimateDraft) => EstimateDraft) => act(async () => {
    const next = f(draft!);
    await save(next);
    setPulling(false);
    await askForecast(next);
  }, `נקלט · הצפי יצא לדף של ${firstName} — בלי מייל`);
  const publish = () => act(async () => {
    await save(draft!);
    const vs = await api.loadEstimates(step.id);
    const d = vs.find(v => v.status === 'draft');
    if (!d) throw new Error('אין טיוטה לאשר');
    const a = await api.approveEstimate(d.id, d.revision);
    if (!a.ok) throw new Error(a.error === 'has_blockers' ? 'יש עוד מה להשלים — ברשימה למטה' : a.error === 'reconciliation_open' ? 'יש יישור שלא הוכרע — ב«כלים מתקדמים»' : `האישור נכשל (${a.error})`);
    const p = await api.publishEstimate(a.id, true);
    if (!p.ok) throw new Error(`הפרסום נכשל (${p.error})`);
  }, `בדף של ${firstName} — בלי מייל`);
  const markApplied = () => act(async () => {
    if (!approved?.outputs) return;
    const at = today();
    for (const a of approved.outputs.advances.filter(changedAdv)) {
      const key = `adv-${a.authority}-${a.person}`;
      if (appliedAt(key)) continue;
      const r = await tyApi.recordFact(client.id, { taxYear: year, itemKey: 'estimate.applied', subjectRole: 'couple', periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31`,
        answer: 'value', value: { key, title: `${a.authority === 'it' ? 'מקדמת מס הכנסה' : 'מקדמת ב״ל'} ← ${valOf(a, a.recommended!)}`, version: approved.version, at }, basis: 'actual', requestId: step.id } as never);
      if ((r as { ok?: boolean; error?: string }).ok === false) throw new Error(`הסימון נכשל (${(r as { error?: string }).error})`);
    }
  }, 'נרשם: המקדמות עודכנו');

  // ── המספרים ──
  const niAdv = out.advances.filter(a => a.authority === 'ni');
  const fresh = out.advances.length > 0 && out.advances.every(a => a.current == null);
  const sumNum = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);
  const itBal = out.household.incomplete ? null : out.household.balanceAtCurrent;
  const niBals = niAdv.map(a => a.balanceAtCurrent).filter(isNum);
  const niBal = niBals.length ? sumNum(niBals) : null;
  const niDue = niAdv.map(a => a.annualDue).filter(isNum);
  const total = fresh ? out.household.annualLiability + (niDue.length ? sumNum(niDue) : 0) : (itBal ?? 0) + (niBal ?? 0);
  const blocked = out.blockers.length > 0;
  const ruleBlocked = out.blockers.some(b => b.code === 'rule_not_verified' || b.code === 'no_tax_data');
  const savings = what ? out.household.annualLiability - what.household.annualLiability : 0;
  const cut = eff.cutoffMonth;
  const mPast = `ינואר–${MONTH_HE[cut]}`;

  const action = (() => {
    if (stage === 'q') return sendMore && sendMore.count > 0
      ? <button type="button" className="btn btn-primary" disabled={busy || working} data-ew-send onClick={() => void sendMore.run()}>שלח שאלון ל{firstName}</button>
      : <span className="ew-pill grey">אין עוד מה לשאול</span>;
    if (stage === 'waiting') return <span className="ew-pill grey">השאלון אצל {firstName}</span>;
    if (stage === 'answered') return <><span className="ew-pill">השאלון נענה</span><button type="button" className="btn btn-primary" disabled={working} data-ew-pull onClick={() => setPulling(true)}>משוך מפייפרלס</button></>;
    if (stage === 'pulled') return <span className="ew-pill grey">הצפי אצל {firstName}</span>;
    if (stage === 'ready') return <><span className="ew-pill">{biz.length ? `${firstName} אישר/ה את הצפי` : 'התשובות נכנסו'}</span>
      <button type="button" className="btn btn-primary" disabled={working || blocked} title={blocked ? 'יש מה להשלים' : ''} data-ew-publish onClick={() => void publish()}>{approved?.publishedAt ? `פרסם עדכון בדף של ${firstName}` : `פרסם בדף של ${firstName}`}</button></>;
    if (stage === 'published') return <><span className="ew-pill grey">בדף של {firstName}</span><button type="button" className="btn btn-primary" disabled={working} data-ew-applied onClick={() => void markApplied()}>עדכנתי את המקדמות</button></>;
    const at = advKeys.map(appliedAt).filter(Boolean).sort().pop();
    return <span className="ew-pill">{advKeys.length ? `המקדמות עודכנו${at ? ` · ${he(at)}` : ''}` : 'בדף של ' + firstName}</span>;
  })();
  const wait = stage === 'q' || stage === 'waiting' ? 'לפי מה שבתיק — עד שהתשובות ייכנסו'
    : stage === 'answered' ? 'לפי מה שבתיק — עד המשיכה מפייפרלס'
    : stage === 'pulled' ? `הצפי כאן לפי הקצב — עד ש${firstName} יאשר או ישנה` : '';

  return (
    <section className="ew" aria-label="הערכת מס" data-ew-stage={stage}>
      <div className="ew-top">
        <div className="ew-steps" aria-label="שלבים">
          {steps.map(([n], i) => (
            <span key={n} className={i < curStep ? 'is-done' : i === curStep ? 'is-cur' : ''}>{i ? <b aria-hidden="true" /> : null}<i>{i < curStep ? '✓' : i + 1}</i>{n}</span>
          ))}
        </div>
        <div className="ew-act">{action}</div>
      </div>
      {err && <p className="ty-err" role="alert">{err}</p>}
      {flash && <p className="ty-ok" role="status">{flash}</p>}
      {wait && <p className="ew-wait">{wait}</p>}

      {pulling && (
        <div className="ew-card">
          <h3 className="ew-h3">רו״ה חודשי מפייפרלס <small>עד החודש האחרון שנרשם במלואו</small></h3>
          <p className="ty-note">עד שהמשיכה האוטומטית תופעל — מורידים מפייפרלס את דוח הרווח והפסד החודשי (Excel) ומעלים כאן. אחרי הקליטה הצפי יוצא ל{firstName} לבד.</p>
          <ImportPanel client={client} year={year} draft={eff} onApply={f => void onPulled(f)} />
          <div><button type="button" className="btn btn-sm btn-ghost" onClick={() => setPulling(false)}>ביטול</button></div>
        </div>
      )}

      {ruleBlocked ? (
        <div className="ew-card"><p className="te-nc">{out.blockers.filter(b => b.code === 'rule_not_verified' || b.code === 'no_tax_data').map(b => b.text).join(' · ')}</p></div>
      ) : (
        <div className="ew-card ew-hero">
          <small>{fresh ? 'צפוי לשנה הראשונה' : 'אם לא משנים כלום — בסוף השנה'}</small>
          {out.household.incomplete ? <div className="ew-big is-wait">יחושב כשהנתונים ייכנסו</div> : (
            <div className={`ew-big${fresh ? '' : total > 0 ? ' is-due' : ' is-ok'}`} data-ew-total>
              {fresh ? `כ-${nis(total)}` : `${total > 0 ? 'חוב של כ-' : total < 0 ? 'זכות של כ-' : ''}${total === 0 ? 'מאוזן' : nis(Math.abs(total))}`}
            </div>
          )}
          {!out.household.incomplete && (
            <div className="ew-parts">
              <span>מס הכנסה {fresh ? nis(out.household.annualLiability) : itBal == null ? 'חסר' : itBal >= 0 ? nis(itBal) : `זכות ${nis(-itBal)}`}</span>
              {niAdv.length > 0 && <span>ביטוח לאומי {fresh ? (niDue.length ? nis(sumNum(niDue)) : 'חסר') : niBal == null ? 'חסר' : niBal >= 0 ? nis(niBal) : `זכות ${nis(-niBal)}`}</span>}
            </div>
          )}
          <button type="button" className="ew-lnk" aria-expanded={open} onClick={() => setOpen(o => !o)}>ממה זה מורכב</button>
          {open && (
            <div className="ew-bd">
              <div><span>מס הכנסה לשנה</span><b>{nis(out.household.annualLiability)}</b></div>
              <div><span>נוכה במקור</span><b>{nis(out.household.withheldAnnual)}</b></div>
              <div><span>מקדמות ששולמו</span><b>{nis(out.household.advancesPaid)}</b></div>
              {!fresh && <div><span>מקדמות מס הכנסה בשיעור הנוכחי, עד סוף השנה</span><b>{nis(out.household.futureAtCurrent)}</b></div>}
              {niAdv.map(a => <div key={a.person}><span>ביטוח לאומי לשנה{a.person === 'spouse' ? ' (בן/בת הזוג)' : ''}</span><b>{isNum(a.annualDue) ? nis(a.annualDue.value) : 'חסר'}</b></div>)}
            </div>
          )}
        </div>
      )}

      {biz.map(l => <IncomeCard key={l.id} line={l} draft={eff} out={out} withData={withData} firstName={firstName} pulledAt={l.pulledAt} cut={cut} />)}

      {!ruleBlocked && !out.household.incomplete && out.advances.some(a => a.recommended != null) && (
        <div className="ew-card">
          <h3 className="ew-h3">{fresh ? 'מקדמות לקבוע' : 'ההמלצה'} <small>{fresh ? 'מהחודש הראשון' : 'מתחילת השנה · מינימום, מעוגל כלפי מעלה'}</small></h3>
          {out.advances.map(a => {
            const diff = a.changeCharges?.find(c => c.kind === 'difference' && c.status === 'computed' && c.amount);
            const same = a.current != null && a.recommended != null && !changedAdv(a);
            return (
              <div key={a.authority + a.person} className="ew-rec" data-ew-rec={a.authority}>
                <span className="ew-auth">{a.authority === 'it' ? 'מס הכנסה' : 'ביטוח לאומי'}{a.person === 'spouse' ? ` · ${client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג'}` : ''}</span>
                <span className="ew-chg">{a.recommended == null ? <u>חסר — {isNum(a.annualDue) ? 'אין שיטת מקדמה' : 'אין חישוב'}</u>
                  : same ? <>{valOf(a, a.current!)} <u>{a.unit === '%' ? 'מהמחזור' : 'לחודש'} — בלי שינוי</u></>
                  : <>{a.current != null && <><em>{valOf(a, a.current)}</em><i aria-hidden="true">←</i></>}<span className="ew-min">לפחות</span> {valOf(a, a.recommended)} <u>{a.unit === '%' ? 'מהמחזור' : a.unit === '₪ לחודש' ? 'לחודש' : 'לתשלום'}</u></>}</span>
                {!same && diff && a.recommended != null && <span className={`ew-cu${(diff.amount ?? 0) < 0 ? ' is-cr' : ''}`} title={diff.text}>{(diff.amount ?? 0) > 0 ? 'הפרש לתשלום' : 'זיכוי'} {mPast}: {nis(Math.abs(diff.amount ?? 0))}</span>}
                {!same && a.whereToChange && <span className="ew-where">{a.whereToChange} — אתה מגיש</span>}
              </div>
            );
          })}
          <p className="ew-after">✓ {fresh ? 'ככה השנה נסגרת מאוזנת' : 'מעוגל כלפי מעלה — אחרי העדכון השנה נסגרת בלי חוב'}</p>
        </div>
      )}

      {!ruleBlocked && !out.household.incomplete && out.persons.some(p => p.businessTaxable > 0) && (
        <div className="ew-card">
          <h3 className="ew-h3">מה אם {firstName} יפקיד עד 31.12</h3>
          <Slider label="קרן השתלמות" value={sf} max={20000} onChange={setSf} saving={sf ? savings : 0} />
          <Slider label="פנסיה" value={pn} max={30000} onChange={setPn} saving={pn ? savings : 0} />
          {(sf > 0 && pn > 0) && <p className="ew-cap">החיסכון — של שתי ההפקדות יחד</p>}
        </div>
      )}

      {blocked && !ruleBlocked && (stage === 'ready' || stage === 'published') && (
        <div className="ew-card ew-missing">
          <h3 className="ew-h3">לפני פרסום — חסר <small>{out.blockers.length}</small></h3>
          <ul>{out.blockers.slice(0, 5).map((b, i) => <li key={i}>{b.text}</li>)}</ul>
          {out.blockers.length > 5 && <p className="ty-note">ועוד {out.blockers.length - 5}</p>}
          {!advancedOpen && <div><button type="button" className="btn btn-sm btn-ghost" onClick={() => onAdvanced(true)}>להשלים בכלים המתקדמים</button></div>}
        </div>
      )}

      <p className="ew-src">{withData && biz[0]?.pulledAt ? `רו״ה מפייפרלס עד ${MONTH_HE[cut]} · נקלט ${he(biz[0].pulledAt)}` : `חתך הנתונים: סוף ${MONTH_HE[cut]} ${year}`}{approved ? ` · גרסה ${approved.version}${approved.publishedAt ? ' בדף של ' + firstName : ''}` : ''}</p>
      <div><button type="button" className="btn btn-sm btn-ghost" aria-expanded={advancedOpen} data-ew-advanced onClick={() => onAdvanced(!advancedOpen)}>{advancedOpen ? 'סגור כלים מתקדמים' : 'כלים מתקדמים'}</button></div>
    </section>
  );
}

function IncomeCard({ line, draft, out, withData, firstName, pulledAt, cut }: { line: IncomeLine; draft: EstimateDraft; out: EstimateOutputs; withData: boolean; firstName: string; pulledAt?: string; cut: number }) {
  if (!withData || !line.months?.length) return (
    <div className="ew-card"><h3 className="ew-h3">הכנסות והוצאות</h3><p className="ew-empty">יופיע אחרי המשיכה מפייפרלס</p></div>
  );
  const x = incomeExpenses(draft, line);
  const micro = out.micro.find(m => m.lineId === line.id);
  const isMicro = line.track === 'micro' && !!micro;
  const max = Math.max(x.incYear, isMicro ? micro!.ceiling * 1.08 : 0, 1);
  const w = (v: number) => `${Math.max(0, (v / max) * 100).toFixed(2)}%`;
  const basis = line.chosen === 'client' ? (line.client?.assumption ?? `הצפי של ${firstName}`) : 'צפי לפי הקצב';
  const rows = adjustmentRows(line, cut).filter(r => r.rule && r.adj !== 0);
  const rest = x.expTo - rows.reduce((s, r) => s + r.book, 0);
  return (
    <div className="ew-card" data-ew-ie>
      <h3 className="ew-h3">הכנסות והוצאות <small>{line.label}{pulledAt ? ` · נקלט ${he(pulledAt)}` : ''}</small></h3>
      <div className="ew-ie">
        <span className="ew-lb">הכנסות</span>
        <div className="ew-track"><div className="a" style={{ width: w(x.incTo) }} /><div className="f" style={{ right: w(x.incTo), width: w(x.incYear - x.incTo) }} />
          {isMicro && <div className="ew-ceil" style={{ left: `${(100 - (micro!.ceiling / max) * 100).toFixed(2)}%` }} title="תקרת עסק זעיר ועוסק פטור" />}</div>
        <div className="ew-nums"><span>עד עכשיו <b>{nis(x.incTo)}</b></span><span>צפי לשנה <b>{nis(x.incYear)}</b></span>{isMicro && <span>תקרה {nis(micro!.ceiling)}</span>}</div>
        <span className="ew-lb">הוצאות</span>
        {isMicro ? (
          <>
            <div className="ew-track is-flat"><div className="a" style={{ width: w(micro!.deduction) }} /></div>
            <div className="ew-nums"><span>{micro!.chosen === 'normative' ? '30% קבוע — עסק זעיר' : 'לפי הוצאות בפועל'} · <b>{nis(micro!.chosen === 'normative' ? micro!.deduction : x.recognizedYear)}</b></span></div>
          </>
        ) : (
          <>
            <div className="ew-track is-exp"><div className="a" style={{ width: w(x.recognizedTo) }} /><div className="f" style={{ right: w(x.recognizedTo), width: w(x.recognizedYear - x.recognizedTo) }} /></div>
            <div className="ew-nums"><span>עד עכשיו <b>{nis(x.recognizedTo)}</b></span><span>צפי לשנה <b>{nis(x.recognizedYear)}</b></span>{rows.length > 0 && <span>מוכרות, אחרי התאמות</span>}</div>
          </>
        )}
      </div>
      {cut < 12 && <div className="ew-legend"><span><i className="ia" />{`ינואר–${MONTH_HE[cut]}, בפועל`}</span><span><i className="if" />{`${MONTH_HE[cut + 1]}–דצמבר, צפי`}</span><span className="ew-basis">{basis}</span></div>}
      {!isMicro && rows.length > 0 && (
        <div className="ew-adj" data-ew-adj>
          <div className="ew-adj-h"><b>התאמות לספרים</b><small>{`ינואר–${MONTH_HE[cut]}`} · ₪ · לפי הנוהל</small></div>
          <table>
            <thead><tr><th>הוצאה</th><th>בספרים</th><th>התאמה</th><th>מוכרת</th></tr></thead>
            <tbody>
              {rows.map(r => <tr key={r.label}><td>{r.label}<small>{r.rule!.label}</small></td><td>{n0(r.book)}</td><td className="neg" dir="ltr">−{n0(r.adj)}</td><td className="rcg">{n0(r.recognized)}</td></tr>)}
              {rest !== 0 && <tr><td>שאר ההוצאות<small>בלי התאמה</small></td><td>{n0(rest)}</td><td>—</td><td className="rcg">{n0(rest)}</td></tr>}
            </tbody>
            <tfoot><tr><td>סה״כ</td><td>{n0(x.expTo)}</td><td className="neg" dir="ltr">−{n0(x.adjTo)}</td><td>{n0(x.recognizedTo)}</td></tr></tfoot>
          </table>
          <p className="ew-mute">רכוש קבוע ופחת — בשלב הבא</p>
        </div>
      )}
      <div className="ew-profit"><span>רווח צפוי לשנה</span><b>{nis(x.incYear - (isMicro ? micro!.deduction : x.recognizedYear))}</b></div>
      {isMicro && (
        micro!.status === 'within' && micro!.mode === 'regular'
          ? <p className="ew-note is-ok">מתחת לתקרה — עסק זעיר ועוסק פטור גם השנה · נשארו {nis(micro!.ceiling - micro!.annualTurnover)}</p>
          : micro!.status !== 'within'
            ? <p className="ew-note is-bad">הצפי חוצה את התקרה ב-{nis(micro!.annualTurnover - micro!.ceiling)} — השנה לא עסק זעיר (מס לפי הוצאות בפועל), ועוסק פטור עובר למורשה</p>
            : <p className="ew-note is-bad">השנה לא עסק זעיר — {micro!.explain[0] ?? 'לפי התשובות'}</p>
      )}
    </div>
  );
}

function Slider({ label, value, max, onChange, saving }: { label: string; value: number; max: number; onChange: (v: number) => void; saving: number }) {
  return (
    <div className="ew-wi">
      <label>{label}<small>{nis(value)}</small>
        <input type="range" min={0} max={max} step={500} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} />
      </label>
      <span className={`ew-sv${saving > 0 ? '' : ' is-zero'}`}>{saving > 0 ? `חוסך ${nis(saving)}` : '—'}</span>
    </div>
  );
}

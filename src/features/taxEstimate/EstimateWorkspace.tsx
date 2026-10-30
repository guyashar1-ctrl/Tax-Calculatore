// ─── הערכת מס במשרד: אנחנו · הלקוח · התוצאה (30.10.2026) ─────────────────────────────────────────────────────
// ‼ הדמיה מאושרת: docs/proposals/2026-10-30-tax-estimate-simple.html (גיא: «אני מכניס קצת נתונים, הוא את השאר — וזהו»).
//   שלושה חלקים: מה אנחנו מביאים (מקדמות מהרשויות, רו״ה מפייפרלס) · מה הלקוח משלים (בדף שלו) · התוצאה.
//   כל השאר (חוסמים מפורטים, קליטות, יישור, גרסאות) — ב«כלים מתקדמים» (EstimatePanel), לא נמחק.
// ‼ «פרסם בדף של X» מפרסם בלי מייל; המייל — רק בבחירה, מאותו מגש של «שלח בקשות» (onSendMail).
// ‼ אותו מנוע ואותן גרסאות (231/232): «פרסם את ההמלצה» = שמירה + אישור + פרסום. PIVO לא משנה מקדמות —
//   «עדכנתי את המקדמות» רק רושם שבוצע (estimate.applied).
// ‼ עסק חדש (המשרד פותח את התיקים): יישור קו מול הרשויות, הלקוח צופה בחודש, והמקדמות — לשנה מלאה (forecastFlow.ts).
import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { YearData } from '../taxYear/api';
import * as tyApi from '../taxYear/api';
import { CATALOG_VERSION } from '../taxYear/catalog';
import { niSelfEmployedSince } from '../taxYear/niRegistrations';
import { computeEstimate, MONTH_HE } from './engine';
import { buildDraft, reconciliationsNeeded } from './prefill';
import * as api from './api';
import { cardSnapshot } from '../taxFile/hub';
import ImportPanel from './ImportPanel';
import AutomationStepButton from '../requests/AutomationStepButton';
import { AUTOMATION_STEP_ACTIONS } from '../requests/automationSteps';
import { BTL_SYNC_FILE_ACTION_TYPE, SHAAM_SYNC_INCOME_TAX_ACTION_TYPE } from '../../types/automation';
import { adjustmentRows, deriveDraft, FORECAST_ITEM, forecastAnswerOf, incomeExpenses, isNewBusiness } from './forecastFlow';
import { he, nis, today, uid } from './parts';
import type { AuthorityAdvance, EstimateDraft, EstimateOutputs, EstimateVersion, IncomeLine } from './types';
import './estimateWorkspace.css';
import { questionnaireState, questionnaireText } from '../taxYear/questionnaireState';

type Stage = 'q' | 'waiting' | 'answered' | 'published' | 'done';

interface Props {
  client: Client;
  step: OnboardingStep;
  year: number;
  cutoffMonth: number;
  data: YearData;
  busy: boolean;
  /** השאלון בלחיצה אחת — אותו מנוע כמו בדוח השנתי (TaxYearProcess). */
  sendMore?: { count: number; run: () => Promise<boolean> };
  /** «וגם שלח לו מייל» — פותח את המגש של «שלח בקשות» (מייל אחד, גלוי, בבחירה). */
  onSendMail?: () => void;
  advancedOpen: boolean;
  onAdvanced: (open: boolean) => void;
  onChanged: () => void;
}

const n0 = (v: number) => Math.round(v).toLocaleString('he-IL');
const pct = (v: number) => `${v % 1 ? v.toFixed(1) : v}%`;
const valOf = (a: AuthorityAdvance, v: number) => (a.unit === '%' ? pct(v) : nis(v));
const changedAdv = (a: AuthorityAdvance) => a.current != null && a.recommended != null
  && (a.authority === 'it' ? Math.abs(a.recommended - a.current) >= 0.1 : !a.belowChangeThreshold && Math.abs(a.recommended - a.current) >= 1);
const resultKey = (o: EstimateOutputs) => JSON.stringify([o.household.annualLiability, o.advances.map(a => [a.authority, a.person, a.current ?? null, a.recommended ?? null]), o.persons.map(p => [p.person, p.incomeTax, p.businessTaxable, p.creditPoints])]);
const SHAAM_READ = AUTOMATION_STEP_ACTIONS.find(a => a.type === SHAAM_SYNC_INCOME_TAX_ACTION_TYPE)!;
const BTL_READ = AUTOMATION_STEP_ACTIONS.find(a => a.type === BTL_SYNC_FILE_ACTION_TYPE)!;

export default function EstimateWorkspace({ client, step, year, cutoffMonth, data, busy, sendMore, onSendMail, advancedOpen, onAdvanced, onChanged }: Props) {
  const firstName = client.firstName || 'הלקוח';
  const [versions, setVersions] = useState<EstimateVersion[] | null>(null);
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
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

  // ‼ אותה טיוטה כמו ב«כלים מתקדמים», ועליה מה שנגזר מהרו״ה ומהתשובות (הצפי, ההתאמות, משכורת וב״ל בערך, עסק חדש)
  const eff = useMemo<EstimateDraft | null>(() => {
    if (!draft) return null;
    const recs = reconciliationsNeeded(draft, year).map(n => {
      const had = draft.reconciliations.find(r => r.lineId === n.lineId);
      const same = had && had.books === n.books && had.vat === n.vat && had.it134 === n.it134;
      return { id: had?.id ?? uid(), lineId: n.lineId, what: 'turnover' as const, books: n.books, vat: n.vat, it134: n.it134, ...(same ? { decision: had!.decision, note: had!.note, decidedAt: had!.decidedAt } : {}) };
    });
    return deriveDraft({ ...draft, reconciliations: recs }, data.facts, today(), client);
  }, [draft, year, data.facts, client]);
  const out = useMemo(() => (eff ? computeEstimate(eff, { client, taxYear: year }) : null), [eff, client, year]);

  if (!versions || !eff || !out) return <section className="ew"><p className="ty-note">טוען…</p></section>;

  // ── איפה אנחנו ──
  const fresh = !!eff.newBusiness;
  const asks = data.asks.filter(a => a.parentStepId === step.id && a.state !== 'cancelled');
  const fAsks = asks.filter(a => a.itemKey === FORECAST_ITEM);
  const filling = asks.some(a => a.state === 'published' && a.prompt.input.kind !== 'file');
  const biz = eff.lines.filter(l => (l.source === 'business' && l.period?.actual !== 'out') || l.id === 'biz-new');
  const pulledBiz = biz.filter(l => l.months?.length);
  const needsPull = !fresh && biz.some(l => !l.months?.length);
  const approved = [...versions].reverse().find(v => v.status === 'approved');
  const latest = versions[versions.length - 1];
  // ‼ «ההמלצה בדף מעודכנת» = אותן המלצות ואותו מס — לא כל הפלט (מזהי עובדות ותאריכים משתנים כשתשובה מאושרת לבד)
  const upToDate = !!approved?.outputs && latest?.id === approved.id && resultKey(approved.outputs) === resultKey(out);
  const advKeys = (approved?.outputs?.advances ?? []).filter(changedAdv).map(a => `adv-${a.authority}-${a.person}`);
  const appliedAt = (key: string) => (data.facts.find(f => f.itemKey === 'estimate.applied' && f.status !== 'rejected' && f.status !== 'superseded'
    && (f.value as { key?: string; version?: number } | undefined)?.key === key && (f.value as { version?: number }).version === approved?.version)?.value as { at?: string } | undefined)?.at;
  const stage: Stage = !asks.length ? 'q' : filling ? 'waiting'
    : !(upToDate && approved?.publishedAt) ? 'answered'
    : advKeys.some(k => !appliedAt(k)) ? 'published' : 'done';
  const publishedOn = asks.map(a => a.createdAt?.slice(0, 10)).filter(Boolean).sort()[0];
  const cut = eff.cutoffMonth;

  // ── פעולות ──
  const save = async (d: EstimateDraft) => {
    const de = deriveDraft(d, data.facts, today(), client);
    const o = computeEstimate(de, { client, taxYear: year });
    const vs = await api.loadEstimates(step.id);
    const r = await api.saveEstimate(step.id, de, o, [...pre.inputFacts, ...cardSnapshot(client)], api.baseOf(vs));
    if (!r.ok) throw new Error(r.error === 'conflict' ? 'מישהו שמר את ההערכה בינתיים — לרענן ולנסות שוב' : `השמירה נכשלה (${r.error})`);
  };
  /**
   * בקשת הצפי — לכל עסק שאין לו עוד בקשה. עסק עם רו״ה: «עד סוף השנה — זה נראה נכון?» לפי הקצב.
   * עסק חדש: מתי מתחיל וכמה בחודש. אותה בקשת «השלמת מידע» של ההערכה; בלי מייל.
   */
  const askForecast = async (d: EstimateDraft) => {
    const isNew = isNewBusiness(client, d);
    const list = d.lines.filter(l => l.source === 'business' && (l.months?.length || isNew) && !fAsks.some(a => !l.entityRef || a.entityRef === l.entityRef));
    if (!list.length) return false;
    const micro = (l: IncomeLine) => l.track === 'micro';
    const r = await tyApi.addAsks(step.id, list.map(l => {
      const ms = (l.months ?? []).filter(x => x.m <= d.cutoffMonth);
      const byM = (k: 'income' | 'expenses') => Array.from({ length: d.cutoffMonth }, (_, i) => Math.round(ms.find(x => x.m === i + 1)?.[k] ?? 0));
      const first = ms.find(x => x.income != null || x.expenses != null)?.m ?? 1;
      const ctxData = isNew ? { cutoff: 0, inc: [], exp: micro(l) ? null : [], today: today() } : { cutoff: d.cutoffMonth, first, inc: byM('income'), exp: micro(l) ? null : byM('expenses') };
      return {
        itemKey: FORECAST_ITEM, subjectRole: l.person, ...(l.entityRef ? { entityKind: 'business' as const, entityRef: l.entityRef } : {}),
        prompt: { templateVersion: CATALOG_VERSION, order: 0.5,
          title: isNew ? 'העסק החדש' : biz.length > 1 ? `${l.label} — עד סוף השנה, זה נראה נכון?` : 'עד סוף השנה — זה נראה נכון?',
          why: isNew ? 'בערך, לפי מה שאתה צופה. ממנו נקבעות המקדמות.' : 'זו הערכה שלך: לפי הקצב עד עכשיו, או מה שאתה יודע על החודשים הבאים. ממנה נקבעות המקדמות.',
          input: { kind: 'record' as const, schema: 'forecastMonths' as const, context: { data: JSON.stringify(ctxData) } } },
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
  const toAsk = (sendMore?.count ?? 0) > 0 || biz.some(l => (l.months?.length || fresh) && !fAsks.some(a => !l.entityRef || a.entityRef === l.entityRef));
  const publishQ = (mail: boolean) => act(async () => {
    if (sendMore && sendMore.count > 0 && !(await sendMore.run())) throw new Error('השאלון לא פורסם — הסיבה למעלה');
    await askForecast(eff);
    if (mail) onSendMail?.();
  }, mail ? `פורסם בדף של ${firstName} — המייל: במגש שנפתח` : `פורסם בדף של ${firstName} — בלי מייל`);
  const onPulled = (f: (d: EstimateDraft) => EstimateDraft) => act(async () => {
    const next = f(draft!);
    await save(next);
    setPulling(false);
    // ‼ השאלון כבר בדף — הצפי מצטרף אליו מיד; עוד לא פורסם — יצא יחד איתו ב«פרסם»
    if (asks.length) await askForecast(next);
  }, asks.length ? `נקלט · הצפי יצא לדף של ${firstName} — בלי מייל` : 'נקלט');
  const publish = () => act(async () => {
    await save(draft!);
    const vs = await api.loadEstimates(step.id);
    const d = vs.find(v => v.status === 'draft');
    if (!d) throw new Error('אין טיוטה לאשר');
    const a = await api.approveEstimate(d.id, d.revision);
    if (!a.ok) throw new Error(a.error === 'has_blockers' ? 'יש עוד מה להשלים — ברשימה למטה' : a.error === 'reconciliation_open' ? 'יש יישור שלא הוכרע — ב«כלים מתקדמים»' : `האישור נכשל (${a.error})`);
    const p = await api.publishEstimate(a.id, true);
    if (!p.ok) throw new Error(`הפרסום נכשל (${p.error})`);
  }, `ההמלצה בדף של ${firstName} — בלי מייל`);
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

  // ── 1 · מה אנחנו מביאים ──
  const itCur = out.advances.find(a => a.authority === 'it' && a.person === 'client');
  const known1 = fresh || (!needsPull && !!eff.it.readOn && !!eff.ni.readOn);
  const itText = eff.it.method === 'turnoverRate' && eff.it.ratePct != null ? `${pct(eff.it.ratePct)} מהמחזור`
    : eff.it.method === 'fixed' && eff.it.fixedPerPeriod != null ? `${nis(eff.it.fixedPerPeriod)} לתשלום`
    : eff.it.method === 'none' ? 'אין מקדמות' : null;
  const niText = eff.ni.monthlyAdvance != null ? `${nis(eff.ni.monthlyAdvance)} לחודש` : null;
  const sourceOr = (readOn: string | undefined, label: string, btn: React.ReactNode) => readOn ? <span className="ew-src-chip" title={`נבדק ${he(readOn)}`}>⚡ {label}</span> : btn;

  // ── 2 · מה הלקוח משלים ──
  const persons = out.persons.filter(p => p.person === 'client' || (client.familyStatus === 'married' && p.creditPoints > 0));
  const answered = stage !== 'q' && stage !== 'waiting';
  const extra = eff.lines.filter(l => l.id.startsWith('sal-est-') || l.id.startsWith('ni-est-'));
  const personName = (p: string) => (p === 'spouse' ? client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג' : firstName);

  // ── 3 · התוצאה ──
  const blocked = out.blockers.length > 0;
  const ruleBlocked = out.blockers.some(b => b.code === 'rule_not_verified' || b.code === 'no_tax_data');
  const recs = out.advances.filter(a => a.recommended != null);
  const ready = answered && !out.household.incomplete && recs.length > 0 && !ruleBlocked;
  const catchUp = out.advances.reduce((s, a) => s + Math.max(0, (changedAdv(a) && a.changeCharges?.find(c => c.kind === 'difference' && c.status === 'computed')?.amount) || 0), 0);
  const it0 = out.persons.find(p => p.person === 'client');
  const sumIE = biz.reduce((s, l) => { const x = incomeExpenses(eff, l); return { inc: s.inc + x.incYear, exp: s.exp + x.recognizedYear }; }, { inc: 0, exp: 0 });
  const itAdv = recs.filter(a => a.authority === 'it'), niAdv = recs.filter(a => a.authority === 'ni');
  const status = stage === 'q' ? { t: 'לא התחיל', c: 'grey' } : stage === 'waiting' ? { t: `ממתין ל${firstName}`, c: 'wait' }
    : stage === 'answered' ? { t: ready && !blocked ? 'מוכן להמלצה' : 'ענה/תה', c: '' } : stage === 'published' ? { t: 'ההמלצה בדף', c: '' } : { t: 'המקדמות עודכנו', c: '' };

  return (
    <section className="ew ew3" aria-label="הערכת מס" data-ew-stage={stage} data-ew-new={fresh ? '' : undefined}>
      <div className="ew3-top"><b>{fresh ? 'מקדמות לעסק חדש' : `הערכת מס ${year}`}</b><span className={`ew-pill ${status.c}`} data-ew-status>{status.t}</span></div>
      {err && <p className="ty-err" role="alert">{err}</p>}
      {flash && <p className="ty-ok" role="status">{flash}</p>}

      {/* 1 · מה אנחנו מביאים */}
      <div className="ew-card" data-ew-part="ours">
        <PartHead n={1} done={known1} title="מה אנחנו מביאים" sub={fresh ? 'יישור קו: מה רשום היום ברשויות' : 'לבד, מהרשויות ומפייפרלס'} />
        <div className="ew3-rows">
          {fresh ? (<>
            <Row k="תיק במס הכנסה" v={<>{client.incomeTaxFileType ? 'פתוח' : 'עוד לא נפתח'} <small>· אין מקדמות</small></>}
              end={<AutomationStepButton action={SHAAM_READ} client={client} onDone={onChanged} />} />
            <Row k="ביטוח לאומי" v={niSelfEmployedSince(client, 'client', year) ? 'רשום כעצמאי' : 'עוד לא רשום כעצמאי'}
              end={<AutomationStepButton action={BTL_READ} client={client} onDone={onChanged} />} />
            <Row k="הכנסות עד היום" v={eff.newBusiness?.start ? `העסק מתחיל ב-${MONTH_HE[Number(eff.newBusiness.start.slice(5, 7))]} ${eff.newBusiness.start.slice(0, 4)}` : 'אין — העסק עוד לא התחיל'} />
          </>) : (<>
            <Row k="מקדמות מס הכנסה" v={itText ? <>{itText}{itCur?.paidPast ? <small> · {nis(itCur.paidPast)} עד היום</small> : null}</> : <span className="ew-miss">לא נקרא</span>}
              end={sourceOr(eff.it.readOn, 'שע״ם', <AutomationStepButton action={SHAAM_READ} client={client} onDone={onChanged} />)} />
            <Row k="מקדמות ביטוח לאומי" v={niText ?? <span className="ew-miss">לא נקרא</span>}
              end={sourceOr(eff.ni.readOn, 'ביטוח לאומי', <AutomationStepButton action={BTL_READ} client={client} onDone={onChanged} />)} />
            {biz.map(l => {
              const x = l.months?.length ? incomeExpenses(eff, l) : null;
              return <Row key={l.id} k={`${biz.length > 1 ? `${l.label} · ` : 'הכנסות והוצאות '}ינו׳–${MONTH_HE[cut].slice(0, 4)}׳`}
                v={x ? <>{n0(x.incTo)} <small>הכנסות</small> · {n0(x.expTo)} <small>הוצאות</small></> : <span className="ew-miss">עוד לא נקלט</span>}
                end={x ? <span className="ew-src-chip is-plain" title={l.pulledAt ? `נקלט ${he(l.pulledAt)}` : ''}>פייפרלס</span>
                  : <button type="button" className="btn btn-sm btn-ghost" disabled={working} data-ew-pull onClick={() => setPulling(true)}>קלוט רו״ה מפייפרלס</button>} />;
            })}
          </>)}
        </div>
        {pulling && (
          <div className="ew3-pull">
            <p className="ty-note">עד שהמשיכה האוטומטית תופעל — מורידים מפייפרלס את דוח הרווח והפסד החודשי (Excel) ומעלים כאן.</p>
            <ImportPanel client={client} year={year} draft={eff} onApply={f => void onPulled(f)} />
            <div><button type="button" className="btn btn-sm btn-ghost" onClick={() => setPulling(false)}>ביטול</button></div>
          </div>
        )}
      </div>

      {/* 2 · מה הלקוח משלים */}
      <div className="ew-card" data-ew-part="client">
        <PartHead n={2} done={answered} title={`מה ${firstName} משלים/ה`} sub={fresh ? 'המשפחה ונקודות הזיכוי, ומה צפוי בעסק' : 'המשפחה ונקודות הזיכוי, וכמה ייכנס'} />
        {stage === 'q' && (toAsk ? (
          <div className="ew3-acts">
            <button type="button" className="btn btn-primary" disabled={busy || working} data-ew-publish-q onClick={() => void publishQ(false)}>פרסם בדף של {firstName}</button>
            {onSendMail && <button type="button" className="ew-lnk" disabled={busy || working} data-ew-publish-mail onClick={() => void publishQ(true)}>וגם שלח לו מייל</button>}
          </div>
        ) : <p className="ew-mute">אין מה לשאול את {firstName} — הכול כבר בתיק.</p>)}
        {stage === 'waiting' && (
          <p className="ew-wait" data-ew-waiting data-ew-qstate={questionnaireState(asks)}>
            {/* ‼ «עוד לא התחיל» עד שיש טיוטה בשרת; «באמצע השאלון» — כשהתחיל (questionnaireState, 30.10) */}
            {questionnaireState(asks) === 'filling' ? questionnaireText('filling', firstName) : <>בדף של {firstName}{publishedOn ? ` מ-${he(publishedOn)}` : ''} · עוד לא התחיל/ה</>}
            {onSendMail && <button type="button" className="ew-lnk ew-inline" onClick={onSendMail}>שלח תזכורת במייל</button>}</p>
        )}
        {answered && (
          <div className="ew3-rows" data-ew-answers>
            {persons.map(p => (
              <Row key={p.person} k={`נקודות זיכוי${persons.length > 1 ? ` · ${personName(p.person)}` : ''}`}
                v={<>{p.creditPoints} <small>· {(p.creditLines ?? []).map(l => l.description.replace(/\s*\(.*\)$/, '')).join(', ')}</small></>} end={<span className="ew-src-chip is-client">מהשאלון</span>} />
            ))}
            {biz.map(l => {
              const got = forecastAnswerOf(data.facts, l);
              if (!got) return null;
              const x = incomeExpenses(eff, l);
              return <Row key={l.id} k={fresh ? 'צפי לשנה מלאה' : 'צפי לכל השנה'} v={<>{n0(x.incYear)} <small>הכנסות</small> · {n0(x.expYear)} <small>הוצאות</small></>} end={<span className="ew-src-chip is-client">מהשאלון</span>} />;
            })}
            <Row k="הכנסה נוספת" v={extra.length ? extra.map(l => `${l.label}${persons.length > 1 ? ` (${personName(l.person)})` : ''} ${n0((l.actualToCutoff ?? 0) + (l.client?.amount ?? 0))} ₪`).join(' · ') : 'אין'}
              end={<span className="ew-src-chip is-client">מהשאלון</span>} />
            <p className="ew-mute">התשובות נכנסו לתיק לבד.</p>
          </div>
        )}
      </div>

      {/* 3 · התוצאה */}
      <div className={`ew-card${ready ? '' : ' is-dim'}`} data-ew-part="result">
        <PartHead n={3} done={stage === 'published' || stage === 'done'} title={fresh ? 'המקדמות לפתיחת התיק' : 'התוצאה'}
          sub={ready ? 'מינימום, מעוגל כלפי מעלה' : answered ? (ruleBlocked ? out.blockers[0].text : 'חסר — ברשימה למטה') : `תופיע כש${firstName} יענה/תענה`} />
        {ready && (<>
          <div className="ew3-res">
            {[...itAdv, ...niAdv].map(a => (
              <div key={a.authority + a.person} className="ew3-box" data-ew-rec={a.authority}>
                <span className="ew3-lab">{a.authority === 'it' ? 'מס הכנסה' : 'ביטוח לאומי'}{a.person === 'spouse' ? ` · ${personName('spouse')}` : ''}</span>
                <b className={`ew3-big${changedAdv(a) || a.current == null ? ' is-due' : ''}`}>{a.current != null && !changedAdv(a) ? valOf(a, a.current) : `לפחות ${valOf(a, a.recommended!)}`}</b>
                <span className="ew3-was">{a.unit === '%' ? 'מהמחזור' : 'לחודש'} · {fresh ? (a.authority === 'it' ? 'שנה מלאה' : 'מתחילת העסק') : a.current == null ? 'אין היום' : !changedAdv(a) ? 'בלי שינוי' : `היום ${valOf(a, a.current)}`}</span>
              </div>
            ))}
          </div>
          {catchUp > 0 && <div className="ew3-gap"><span>להשלים על החודשים שעברו</span><b>כ-{nis(catchUp)}</b></div>}
          {fresh && <p className="ew-wait">נכנס לפתיחת התיקים: השיעור — לפתיחת התיק במס הכנסה, וההכנסה הצפויה — לטופס 6101 בביטוח לאומי.</p>}
          <details className="ew3-how">
            <summary>איך חישבנו</summary>
            <div className="ew-bd">
              <div><span>{fresh ? 'הכנסות לשנה מלאה של העסק' : 'הכנסות לכל השנה'}</span><b>{nis(sumIE.inc)}</b></div>
              <div><span>הוצאות מוכרות</span><b>−{nis(sumIE.exp)}</b></div>
              <div><span>רווח</span><b>{nis(sumIE.inc - sumIE.exp)}</b></div>
              {extra.length > 0 && <div><span>הכנסה נוספת</span><b>{nis(extra.reduce((s, l) => s + (l.actualToCutoff ?? 0) + (l.client?.amount ?? 0), 0))}</b></div>}
              <div><span>מס לפי המדרגות, אחרי {it0?.creditPoints ?? 0} נקודות זיכוי</span><b>{nis(out.household.annualLiability)}</b></div>
              {[...itAdv, ...niAdv].map(a => ('value' in a.annualDue ? <div key={'w' + a.authority + a.person}><span>{a.authority === 'it' ? 'מס הכנסה בגלל העסק' : 'ביטוח לאומי'}{a.person === 'spouse' ? ` · ${personName('spouse')}` : ''} — לשנה</span><b>{nis(a.annualDue.value)}</b></div> : null))}
            </div>
            {pulledBiz.map(l => <Adjustments key={l.id} line={l} cut={cut} />)}
          </details>
          {blocked && <Missing out={out} advancedOpen={advancedOpen} onAdvanced={onAdvanced} />}
          {(stage === 'answered' || (stage === 'published' && !upToDate)) && (
            <div className="ew3-acts">
              <button type="button" className="btn btn-primary" disabled={working || blocked} title={blocked ? 'יש מה להשלים' : ''} data-ew-publish onClick={() => void publish()}>
                {approved?.publishedAt ? `פרסם עדכון בדף של ${firstName}` : `פרסם את ההמלצה בדף של ${firstName}`}</button>
            </div>
          )}
          {stage === 'published' && (
            <div className="ew3-acts">
              <p className="ew-wait" data-ew-published>בדף של {firstName} · את השינוי מול הרשויות אתה מגיש</p>
              {advKeys.length > 0 && <button type="button" className="btn btn-sm btn-primary" disabled={working} data-ew-applied onClick={() => void markApplied()}>עדכנתי את המקדמות</button>}
            </div>
          )}
          {stage === 'done' && <p className="ew-wait">{advKeys.length ? `המקדמות עודכנו${(() => { const at = advKeys.map(appliedAt).filter(Boolean).sort().pop(); return at ? ` · ${he(at)}` : ''; })()}` : `בדף של ${firstName}`}</p>}
        </>)}
        {!ready && answered && blocked && <Missing out={out} advancedOpen={advancedOpen} onAdvanced={onAdvanced} />}
      </div>

      <div><button type="button" className="ew-lnk ew-adv" aria-expanded={advancedOpen} data-ew-advanced onClick={() => onAdvanced(!advancedOpen)}>{advancedOpen ? 'סגור כלים מתקדמים' : 'כלים מתקדמים'}</button></div>
    </section>
  );
}

function PartHead({ n, done, title, sub }: { n: number; done: boolean; title: string; sub: string }) {
  return (
    <div className="ew3-head">
      <span className={`ew3-num${done ? ' is-done' : ''}`} aria-hidden="true">{done ? '✓' : n}</span>
      <div><h3 className="ew-h3">{title}</h3><span className="ew3-sub">{sub}</span></div>
    </div>
  );
}

function Row({ k, v, end }: { k: string; v: React.ReactNode; end?: React.ReactNode }) {
  return <div className="ew3-row"><span className="ew3-k">{k}</span><span className="ew3-v">{v}</span>{end && <span className="ew3-end">{end}</span>}</div>;
}

function Missing({ out, advancedOpen, onAdvanced }: { out: EstimateOutputs; advancedOpen: boolean; onAdvanced: (open: boolean) => void }) {
  return (
    <div className="ew-missing" data-ew-missing>
      <b>לפני פרסום — חסר</b>
      <ul>{out.blockers.slice(0, 3).map((b, i) => <li key={i}>{b.text}</li>)}</ul>
      {out.blockers.length > 3 && <p className="ew-mute">ועוד {out.blockers.length - 3}</p>}
      {!advancedOpen && <button type="button" className="ew-lnk" onClick={() => onAdvanced(true)}>להשלים בכלים המתקדמים</button>}
    </div>
  );
}

/** טבלת ההתאמות לספרים (גיא, 27.10: «הוצאה · התאמה · מוכרת») — בתוך «איך חישבנו». */
function Adjustments({ line, cut }: { line: IncomeLine; cut: number }) {
  const rows = adjustmentRows(line, cut).filter(r => r.rule && r.adj !== 0);
  if (!rows.length) return null;
  return (
    <div className="ew-adj" data-ew-adj>
      <div className="ew-adj-h"><b>התאמות לספרים{line.label ? ` · ${line.label}` : ''}</b><small>{`ינואר–${MONTH_HE[cut]}`} · ₪ · לפי הנוהל</small></div>
      <table>
        <thead><tr><th>הוצאה</th><th>בספרים</th><th>התאמה</th><th>מוכרת</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.label}><td>{r.label}<small>{r.rule!.label}</small></td><td>{n0(r.book)}</td><td className="neg" dir="ltr">−{n0(r.adj)}</td><td className="rcg">{n0(r.recognized)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

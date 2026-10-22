// ─── דף התהליך: הערכת מס / דוח שנתי לשנה (229) ──────────────────────────────
// ‼ «עכשיו / אחר כך / פירוט כשצריך» (ההדמיה המאושרת). כרטיס «עכשיו» אחד בלבד —
// הפעולה הבאה של המשרד; השאר מתחת.
// ‼ השאלות נבחרות מתמונת השנה (picture.ts) — לא ממפת 1301. «שלח» אינו כאן:
// פרסום בדף האישי כאן, והמייל ב«שלח בקשות» הקיים (מייל אחד, הכתובת מהכרטיס).
// ‼ אישור מרוכז רק ל«הלקוח אישר שאין שינוי», עם פירוט פתוח. שינויים, סכומים,
// סתירות ומסמכים — אחד אחד.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { todayIso, formatDate } from '../../utils/dateFormat';
import { replaceLegacyIntake } from '../../lib/intakeSync';
import { stepGateOpen } from '../../utils/clientPageGate';
import { AREAS, AREA_BY_ID, ITEMS, type AreaId } from './catalog';
import { buildYearPicture, type ItemStatus } from './picture';
import { buildAskPlan, correctionAsk, MONTHS, type AskPlanEntry, isLegacyAnnual } from './asks';
import { DOCS } from './documents';
import { groupForReview, describeValue, type ReviewRow } from './review';
import * as api from './api';
import type { Evidence, FactBasis, Purpose } from './types';
import AnnualSummary from './AnnualSummary';
import TaxInfoFlow from './TaxInfoFlow';
import WealthDeclarationPanel, { previousByArea, wealthSubtitle, type WealthPayload } from './WealthDeclarationPanel';
import QuestionnaireMap from './QuestionnaireMap';
import { EstimatePanel, AnnualReturnPanel } from './extensions';
import { NEW_ENTITY_ITEMS, cardFieldProposal, entityConflicts, newEntityProposal, updateEntityProposal, type CardEntityKind } from '../taxFile/hub';
import { applyTaxFacts, proposeTaxFacts } from '../../lib/taxFacts';
import { clientFromDb } from '../../lib/dbMappers';
import type { ProposedFact } from '../../types/taxFacts';
import { isProvisionalRef } from './picture';
import { cardUpdateFor, periodDatesPatch, updatesCard, OMIT_LABEL, END_LABEL, type OmitDecision, type Omitted } from './recordToCard';
import { RECORD_OF } from './structured';
import { UNAVAILABLE_LABEL } from './asks';
import { mergePrevious, previousFromFacts } from './wealthPrevious';
import { DURABLE_KINDS, scopeYearData } from './yearData';
import { PENSION_FUND_KIND_LABELS, type PensionFundKind } from '../../types';
import ProcessSteps from '../../components/office/ProcessSteps';
import { processByKey } from '../../lib/processCatalog';
import '../../components/office/office.css';
import './taxYear.css';
import RemoveWorkDialog from './RemoveWorkDialog';
import MaternitySpreadLine from './MaternitySpread';
import { isOpenStep } from './taxWork';
import { toAskInput, reopenAnnualInNewVersion, questionnaireBlocker } from './workCreate';
import { withOneRound } from './oneRound';
import QuestionnaireOpenNotice from './QuestionnaireOpenNotice';
import { parseOpenQuestionnaire, questionnaireOpenText, QUESTIONNAIRE_OPEN, type OpenQuestionnaire } from './oneQuestionnaire';
import { buildQuestionTree, countsLine, TREE_MARK } from './questionTree';

interface Props {
  client: Client;
  step: OnboardingStep;
  infoStep?: OnboardingStep;
  onClose: () => void;
  onChanged: () => void;
  /** 236 · עדכון הכרטיס מתוך התהליך (הוספת ישות, «עדכן בתיק») מחזיר את הכרטיס המעודכן — כדי שהמסך לא יישאר ישן. */
  onClientPersisted?: (c: Client) => void;
  /** אחרי «הסר עבודה…» — ההודעה עוברת למסך שמתחת, כי הדף נסגר. */
  onRemoved?: (text: string) => void;
  /**
   * 16.10.2026 · «כל עבודה היא בקשה»: העבודה נפתחת **בתוך שורת הבקשה** ב«בקשות», לא כמסך שלישי.
   * בלי מסגרת מסך מלא, בלי «סגירה» ובלי Escape; הכותרת וה«הסר…» כבר בשורה (⋯).
   */
  embedded?: boolean;
  /** 263 · «לבקשה ←» מהודעת «יש ל… שאלון פתוח» — השורה של השאלון הפתוח ב«בקשות». */
  onOpenRequest?: (stepId: string) => void;
}

const STATE_CHIP: Record<string, { label: string; tone: string }> = {
  known: { label: 'ידוע', tone: 'green' }, partial: { label: 'חלקי', tone: 'amber' }, fromCard: { label: 'מהכרטיס', tone: 'blue' },
  pendingReview: { label: 'לבדיקה', tone: 'violet' }, docReceived: { label: 'מסמך התקבל', tone: 'violet' }, asked: { label: 'נשלח', tone: 'blue' },
  unavailable: { label: 'עוד לא זמין', tone: 'amber' }, notYetAvailable: { label: 'עוד לא זמין', tone: '' }, missing: { label: 'חסר', tone: 'red' },
  notApplicable: { label: 'לא חל', tone: '' },
};
const who = (s: ItemStatus) => (s.item.who === 'office' ? 'המשרד' : s.subjectRole === 'spouse' ? 'בן/בת הזוג' : 'הלקוח');
const target = (s: { entityLabel?: string; subjectRole: string }, c: Client) =>
  s.entityLabel && s.subjectRole !== 'client' && s.subjectRole !== 'spouse' ? s.entityLabel
  : s.subjectRole === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג') + (s.entityLabel && s.entityLabel !== (c.spouseFirstName || c.spouse?.firstName) ? ` · ${s.entityLabel}` : '')
  : s.entityLabel && s.entityLabel !== c.firstName ? s.entityLabel : '';

export default function TaxYearProcess({ client, step, infoStep, onClose, onChanged, onClientPersisted, onRemoved, embedded, onOpenRequest }: Props) {
  const purpose: Purpose = step.stepType === 'tax_estimate' ? 'estimate' : step.stepType === 'wealth_declaration' ? 'wealth' : step.stepType === 'tax_file_intake' ? 'intake' : 'annual';
  // ‼ 254 (17.10.2026) · «היכרות שנשלחת לבד»: בשורת הקליטה ב«בקשות» אין «הוסף שאלות» ואין «פרסם» — מה שהתמונה
  //   אומרת לשאול נוסף ומתפרסם בדף של הלקוח בפעולה אחת בשרת (ensure_tax_file_intake עם השאלות), אידמפוטנטית.
  //   רק לקליטה, ורק בתוך השורה; דוח שנתי / הצהרת הון / הערכה — כמו קודם (עד שלב 5).
  const autoIntake = !!embedded && purpose === 'intake' && isOpenStep(step);
  const p = step.payload as unknown as { taxYear: number; cutoffMonth?: number; title?: string; legacySessionId?: string; legacyStepId?: string; legacyReplaced?: { stepId: string; at: string } } & WealthPayload;
  const year = Number(p.taxYear);
  const firstName = client.firstName || 'הלקוח';
  const [data, setData] = useState<api.YearData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // ‼ 263 · לקוח אחד = שאלון אחד פתוח: השרת סירב לחשוף את השאלון הזה, כי יש ללקוח שאלון אחר שמחכה לו
  const [blockedBy, setBlockedBy] = useState<OpenQuestionnaire | null>(null);
  /** תשובת סירוב ⇒ הודעת «שאלון פתוח» (true); כל תשובה אחרת — false. */
  const showRefusal = async (r: { ok?: boolean; error?: string; openQuestionnaire?: unknown }): Promise<boolean> => {
    if (r.ok !== false || r.error !== QUESTIONNAIRE_OPEN) return false;
    const open = parseOpenQuestionnaire(r.openQuestionnaire) ?? await api.openQuestionnaireOf(client.id, step.id).catch(() => null);
    setBlockedBy(open); setErr(open ? null : errText(r.error));
    return true;
  };
  const [preview, setPreview] = useState(false);
  // ‼ 14.10.2026 · «הסר עבודה…» גם מתוך דף העבודה — אותו חלון (242). Escape סוגר רק אותו, לא את הדף
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false);
  removingRef.current = removing;
  // «השאלון» ו«איך עושים ביד» — מקופלים; «איך עושים» יכול לפתוח את השאלון.
  const [qOpen, setQOpen] = useState(false);
  // ‼ 19.10.2026 · דוח שנתי: «פירוט מלא» מקופל; «השלמות במשרד» בסיכום פותח אותו על «להשלים במשרד»
  const [fullOpen, setFullOpen] = useState(false);
  const fullRef = useRef<HTMLElement>(null);
  const [pick, setPick] = useState<'office' | 'ask' | 'publish' | null>(null);
  // ‼ שאלון קליטה ישן שעדיין פתוח אצל הלקוח — כדי לא לשאול פעמיים את הפרטים הקבועים (229 קושר אותו לבקשה)
  const [openIntake, setOpenIntake] = useState<api.OpenLegacyIntake | null>(null);
  useEffect(() => { let live = true; void api.openIntakeStep(p.legacyStepId).then(x => { if (live) setOpenIntake(x); }).catch(() => undefined); return () => { live = false; }; }, [p.legacyStepId]);
  const qRef = useRef<HTMLDetailsElement>(null);
  // ‼ 236 · שער הדף האישי (אותו כלל כמו build_client_portal): null = לא ידוע — לא טוענים «פורסם» ולא «ממתין»
  const [gateOpen, setGateOpen] = useState<boolean | null>(null);
  useEffect(() => { let live = true; void api.loadGateEngagements(client.id).then(e => { if (live) setGateOpen(stepGateOpen(new Date().toISOString(), e)); }).catch(() => { if (live) setGateOpen(null); }); return () => { live = false; }; }, [client.id]);

  // ‼ הנתונים נטענים לפי לקוח ושנה, ומשותפים לדוח השנתי ולהצהרת הון של אותה שנה. כל דף
  // רואה רק את שלו: הצהרת הון — פריטי הון ליום ההצהרה והשאלות של הבקשה הזו; שנת מס — בלי פריטי הון.
  // ‼ 12.10.2026: מסמך מאושר שאינו שייך לתקופה (תעודת זהות, תעודת עוסק, חוזה רכישה…) — מכל שנה ומכל תהליך — לא מתבקש שוב
  const [prior, setPrior] = useState<Evidence[]>([]);
  // ‼ 12.10.2026 · הצהרת המשך: העובדות המאושרות של ההצהרה הקודמת במערכת — בסיס ל«מה השתנה מאז» (לא מועתקות ליום החדש)
  const [prevFacts, setPrevFacts] = useState<api.YearData['facts']>([]);
  const prevAsOf = purpose === 'wealth' && p.kind === 'followup' ? p.previous?.asOfDate : undefined;
  useEffect(() => {
    if (!prevAsOf) { setPrevFacts([]); return; }
    let live = true;
    void api.loadYearData(client.id, Number(prevAsOf.slice(0, 4))).then(d => { if (live) setPrevFacts(d.facts.filter(f => f.periodTo === prevAsOf && f.status === 'accepted')); }).catch(() => undefined);
    return () => { live = false; };
  }, [client.id, prevAsOf]);
  const prevArea = useMemo(() => mergePrevious(previousFromFacts(prevFacts, prevAsOf), previousByArea(p)), [prevFacts, prevAsOf, p]);
  const reload = useCallback(async () => {
    try {
      const [d, pe] = await Promise.all([api.loadYearData(client.id, year), api.loadPriorEvidence(client.id, DURABLE_KINDS)]);
      setData(scopeYearData(d, purpose, step.id, p.asOfDate)); setPrior(pe); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, [client.id, year, purpose, step.id, p.asOfDate]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !removingRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, embedded]);

  const pictureInput = useMemo(() => data && {
    client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, today: todayIso(), asOfDate: p.asOfDate, declKind: p.kind,
    facts: data.facts, evidence: data.evidence, asks: data.asks, priorEvidence: prior,
    openedRare: [...new Set([...data.asks.map(a => a.itemKey), ...data.facts.map(f => f.itemKey)])],
  }, [data, client, year, purpose, p.cutoffMonth, p.asOfDate, p.kind, prior]);
  const picture = useMemo(() => pictureInput && buildYearPicture(pictureInput), [pictureInput]);
  // 16.10.2026 · «של מי» בתשובות מהרשימות — בשם (רחל), לא בתפקיד
  const review = useMemo(() => data && groupForReview(data.facts, data.evidence, { clientName: client.firstName || 'הלקוח', spouseName: client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג' }), [data, client]);
  // ‼ בקליטה בתוך השורה הטיוטות אינן «עכשיו» של המשרד — הן מתפרסמות לבד (autoIntake)
  const drafts = (autoIntake ? [] : data?.asks.filter(a => a.state === 'draft')) ?? [];
  const waitingAsks = data?.asks.filter(a => a.state === 'published') ?? [];
  const notSure = data?.asks.filter(a => a.state === 'answered' && a.officeNote && !a.noteResolvedAt) ?? [];

  const run = async (fn: () => Promise<{ ok: boolean; error?: string } | unknown>, done?: string) => {
    setBusy(true); setFlash(null);
    try {
      const r = await fn() as { ok?: boolean; error?: string; openQuestionnaire?: unknown };
      if (r && await showRefusal(r)) return false;
      if (r && r.ok === false) { setErr(errText(r.error)); return false; }
      setErr(null); setBlockedBy(null); if (done) setFlash(done);
      await reload(); onChanged();
      return true;
    } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(false); }
  };

  // ‼ 236 · עדכון הכרטיס מתשובה מאושרת: הצעה שמוחלת מיד (apply_tax_facts) — עם הערך הקודם, המקור וההיסטוריה.
  //   הכרטיס השתנה בינתיים ⇒ ההצעה נשארת ממתינה בתיק המס, לא נדרסת.
  const applyCard = async (items: ProposedFact[], sourceRef: string): Promise<{ ok: boolean; error?: string }> => {
    const r = await applyTaxFacts(client.id, 'questionnaire', sourceRef, items);
    if (!r.ok) return { ok: false, error: r.error ?? 'apply_failed' };
    if (r.client && onClientPersisted) onClientPersisted(clientFromDb(r.client));
    if ((r.pending ?? 0) > 0) return { ok: false, error: 'card_changed_meanwhile' };
    return { ok: true };
  };

  // ‼ «החזר ללקוח לתיקון»: התשובה (או המסמך) נדחית עם ההערה ונשארת בהיסטוריה; אותה שאלה נוספת שוב
  //   לטיוטה עם «המשרד ביקש לתקן», ומתפרסמת עם שאר השאלות ב«עכשיו» — בלי מייל מעצמה.
  const returnToClient = (from: ReturnFrom, note: string) => run(async () => {
    if (!data || !picture) return { ok: false, error: 'not_loaded' };
    const ask = correctionAsk(from, data.asks, picture.statuses, { client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, asOfDate: p.asOfDate, declKind: p.kind, previousByArea: prevArea }, note);
    if (!ask) return { ok: false, error: 'not_askable' };
    const why = `הוחזר ללקוח: ${note.trim()}`;
    const r1 = from.evidenceId
      ? await api.reviewEvidence(from.evidenceId, data.evidence.find(x => x.id === from.evidenceId)?.identityMatch ?? 'unchecked', data.evidence.find(x => x.id === from.evidenceId)?.periodMatch ?? 'unchecked', 'rejected', why) as { ok?: boolean; error?: string }
      : await api.decideFacts([from.factId!], 'reject', why) as { ok?: boolean; error?: string };
    if (r1 && r1.ok === false) return r1;
    return api.addAsks(step.id, [ask]);
  }, autoIntake ? `הוחזר ל${firstName} — השאלה חוזרת לדף שלו, עם מה שצריך לתקן` : 'הוחזר ל' + firstName + ' — השאלה נוספה לשאלות לפרסום, עם מה שצריך לתקן');

  // ‼ autoIntake: מה שצריך לשאול + טיוטות ⇒ קריאה אחת לשרת; סט שכבר נשלח (מפתח) לא נשלח שוב, גם לא אחרי כשל —
  //   «נסה שוב» מאפס את המפתח. שאלון קליטה ישן שעדיין פתוח — אישורי הפרטים הקבועים נשארים לו (כמו ב-AskPanel).
  const autoKeyRef = useRef<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoRetry, setAutoRetry] = useState(0);
  const autoPlan = useMemo(() => {
    if (!autoIntake || !data || !picture) return null;
    const askableNow = [...picture.toConfirm, ...picture.toAsk];
    const planAll = askableNow.length ? buildAskPlan(askableNow, { client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, asOfDate: p.asOfDate, declKind: p.kind, previousByArea: prevArea }) : [];
    const plan = openIntake ? planAll.filter(e => e.statuses[0]?.state !== 'fromCard') : planAll;
    const draftIds = data.asks.filter(a => a.state === 'draft').map(a => a.id);
    return { plan, draftIds, key: [...plan.map(e => e.key), ...draftIds].sort().join('|') };
  }, [autoIntake, data, picture, client, year, purpose, p.cutoffMonth, p.asOfDate, p.kind, prevArea, openIntake]);
  const autoPending = !!autoPlan && (autoPlan.plan.length > 0 || autoPlan.draftIds.length > 0);
  useEffect(() => {
    if (!autoPlan || !autoPending || busy || autoBusy) return;
    if (autoKeyRef.current === autoPlan.key) return;
    autoKeyRef.current = autoPlan.key;
    setAutoBusy(true);
    void api.ensureTaxFileIntake(client.id, autoPlan.plan.map(toAskInput)).then(async r => {
      if (await showRefusal(r)) return;
      if (!r.ok) { setErr(errText(r.error)); return; }
      setBlockedBy(null);
      const n = (r.asked ?? 0) || (r.published ?? 0);
      if (n > 0) {
        const msg = `${count(n, 'שאלה אחת', 'שאלות')} בדף של ${firstName} — בלי מייל. המייל, אם צריך — מ«הדף של ${firstName}» למעלה.`;
        setFlash(prev => (prev && /הוחזר ל/.test(prev) ? `${prev} · ${msg}` : msg));
      }
      setErr(null);
      await reload(); onChanged();
    }).catch(e => setErr((e as Error).message)).finally(() => setAutoBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlan?.key, autoPending, busy, autoBusy, autoRetry]);

  const subtitle = purpose === 'wealth' ? [wealthSubtitle(p), `נפתחה ${formatDate(step.createdAt)}`].join(' · ')
    : purpose === 'intake' ? [`פרטים מתמשכים ומסמכים, נכון ל-${p.asOfDate ? formatDate(p.asOfDate) : formatDate(step.createdAt)}`, 'סכומים לשנה — בדוח השנתי'].join(' · ') : [
    purpose === 'estimate' ? `חתך הנתונים: סוף ${MONTHS[p.cutoffMonth ?? 12]} ${year}` : `דוח לשנת ${year}`,
    `נפתחה ${formatDate(step.createdAt)}`,
  ].join(' · ');

  if (!data || !picture || !review) {
    if (embedded) return <div className="ty-inline" data-ty-inline>{err ? <div className="ty-err" role="alert">לא ניתן לטעון: {err}</div> : <div className="ty-note">טוען…</div>}</div>;
    return (
      <div className="ty-overlay" role="dialog" aria-label={p.title}>
        <div className="ty-head"><h2>{p.title}</h2><span style={{ flex: 1 }} /><button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>סגירה</button></div>
        <div className="ty-body">{err ? <div className="ty-err" role="alert">לא ניתן לטעון את שנת המס: {err}</div> : <div className="ty-note">טוען…</div>}</div>
      </div>
    );
  }

  // ── מה עכשיו ──
  const reviewCount = review.unchanged.length + review.negatives.length + review.individual.length + review.legacy.length + review.documents.length + notSure.length;
  // ‼ 20.10.2026 · דוח שנתי בגרסה הקודמת — לא מוסיפים לו שאלות מאף כפתור (isLegacyAnnual); הסיכום מציע «סגור ופתח מחדש»
  const legacyAnnual = purpose === 'annual' && isLegacyAnnual(data.asks.filter(a => a.parentStepId === step.id));
  const askable = autoIntake || legacyAnnual ? [] : [...picture.toConfirm, ...picture.toAsk];
  // ‼ 19.10.2026 · דוח שנתי: שאלות שנוספו בעקבות התשובות (למשל פרטי דמי לידה) או טיוטות — «הכן ופרסם» בלחיצה אחת מהסיכום,
  //   בלי לפתוח את «פירוט מלא». אותו מנוע (buildAskPlan) ואותן קריאות כמו «להכין» + «לפרסם» למטה; בלי מייל.
  const annualCtx = { client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, asOfDate: p.asOfDate, declKind: p.kind, previousByArea: prevArea };
  const annualMorePlan = purpose === 'annual' ? buildAskPlan(askable, annualCtx) : [];
  const annualMore = purpose === 'annual' && isOpenStep(step) && !legacyAnnual ? {
    count: annualMorePlan.length + drafts.length,
    run: () => run(async () => {
      // ‼ 263 · שאלון ראשון בבקשה הזו כשיש ללקוח שאלון אחר פתוח ⇒ כלום לא נוסף (הוספה לשאלון שכבר בדף — מותרת)
      if (!waitingAsks.length) {
        const blocker = await questionnaireBlocker(client.id, { stepType: 'annual_return', stepId: step.id, taxYear: year });
        if (blocker) return { ok: false, error: QUESTIONNAIRE_OPEN, openQuestionnaire: blocker };
      }
      let infoId = infoStep?.id;
      // ‼ 20.10.2026 · «סבב אחד» (oneRound.ts) — רק בלחיצה: הניחוש «מה ייפתח מכל כן» כבד מכדי לרוץ בכל ציור
      const plan = annualMorePlan.length && pictureInput ? withOneRound(annualMorePlan, pictureInput, annualCtx) : annualMorePlan;
      if (plan.length) { const r = await api.addAsks(step.id, plan.map(toAskInput)); if (!r.ok) return r; infoId = r.infoStepId; }
      return infoId ? api.publishInfo(infoId) : { ok: false, error: 'not_loaded' };
    }, `פורסם בדף של ${firstName} — בלי מייל`),
  } : undefined;
  const suggested: 'stale' | 'review' | 'publish' | 'ask' | 'office' | 'waiting' | 'done' | 'syncing' =
    // ‼ autoIntake: בזמן שהשאלון מתעדכן בדף (או כשהעדכון נכשל ומחכה ל«נסה שוב») — לא «הושלם» ולא «ממתין»
    autoIntake && (autoBusy || autoPending) ? 'syncing'
    // ‼ שאלה שכבר אינה רלוונטית (התשובה שעליה נשענה שונתה) — קודם מבטלים, כדי שלא תפורסם ולא תחכה לשווא
    : picture.stale.length > 0 ? 'stale'
    : reviewCount > 0 ? 'review' : drafts.length > 0 ? 'publish'
    // מסמך שאושר ומחכה להזנה — המשרד יכול לסיים עכשיו, לפני שאלות חדשות
    : picture.officeTodo.some(x => x.state === 'docReceived') ? 'office'
    : askable.length > 0 ? 'ask'
    : picture.officeTodo.length > 0 ? 'office' : waitingAsks.length > 0 || picture.waiting.length > 0 ? 'waiting' : 'done';
  // ‼ הסדר המומלץ אינו חובה: למשרד שכבר מחזיק טופסי 106 מותר להזין אותם לפני שמסיימים את שאלות הלקוח
  const now = pick === 'office' && picture.officeTodo.length > 0 ? 'office' : pick === 'ask' && askable.length > 0 ? 'ask'
    : pick === 'publish' && drafts.length > 0 ? 'publish' : suggested;

  const later: (string | { text: string; go: 'office' | 'ask' | 'publish' })[] = [];
  if (now !== 'stale' && picture.stale.length) later.push(`${count(picture.stale.length, 'שאלה אחת כבר לא רלוונטית', 'שאלות כבר לא רלוונטיות')} — לבטל`);
  // ‼ 12.10.2026: שאלות בטיוטה (כולל «החזר ללקוח») אפשר לפרסם גם כשיש עוד תשובות לבדוק — אחרת תיקון נתקע עד סוף הבדיקה
  if (now !== 'publish' && drafts.length) later.push({ go: 'publish', text: `לפרסם בדף האישי ${count(drafts.length, 'שאלה אחת', 'שאלות')} שבטיוטה` });
  if (now !== 'ask' && askable.length) later.push({ go: 'ask', text: `להכין ${count(buildAskPlan(askable, { client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, asOfDate: p.asOfDate, declKind: p.kind, previousByArea: prevArea }).length, 'שאלה אחת', 'שאלות')} ל${firstName}` });
  if (now !== 'office' && picture.officeTodo.length) later.push({ go: 'office', text: `להשלים במשרד ${picture.officeTodo.length} פריטים (סכומים ממסמכים, מסלולים, יתרות)` });
  if (now !== 'waiting' && waitingAsks.length) later.push(`ממתין ל${firstName}: ${waitingAsks.length} שאלות שפורסמו`);
  const docsLater = picture.statuses.filter(s => s.state === 'notYetAvailable' || s.state === 'unavailable');
  for (const s of docsLater.slice(0, 4)) later.push(`${s.item.label}${target(s, client) ? ` (${target(s, client)})` : ''} — ${s.detail}`);
  if (docsLater.length > 4) later.push(`ועוד ${docsLater.length - 4} מסמכים שעוד לא זמינים`);

  return (
    <div className={embedded ? 'ty-inline' : 'ty-overlay'} role={embedded ? 'region' : 'dialog'} aria-label={`${p.title} · ${client.firstName} ${client.lastName ?? ''}`} data-ty-inline={embedded ? '' : undefined}>
      {/* ‼ 21.10.2026 · דוח שנתי בתוך השורה: בלי «דוח לשנת … · נפתחה …» ובלי «מה X רואה» — פס השלבים הוא המצב,
          והדף עצמו — ב-⋯ של «הדף של X» */}
      {embedded ? (purpose === 'annual' ? null : (
        <div className="ty-inline-head">
          <span className="ty-sub">{subtitle}</span>
          {infoStep && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreview(true)} data-ty-preview>מה {firstName} רואה</button>}
        </div>
      )) : (
      <div className="ty-head">
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h2>{p.title} · {client.firstName} {client.lastName}</h2>
          <span className="ty-sub">{subtitle}</span>
        </div>
        <span style={{ flex: 1 }} />
        {infoStep && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreview(true)}>מה {firstName} רואה</button>}
        {isOpenStep(step) && <button type="button" className="btn btn-sm btn-ghost tw-remove" onClick={() => setRemoving(true)} data-ty-remove>הסר עבודה…</button>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="סגירה">סגירה</button>
      </div>
      )}
      {removing && (
        <RemoveWorkDialog stepId={step.id} title={`${p.title} · ${client.firstName ?? ''} ${client.lastName ?? ''}`.trim()}
          onClose={() => setRemoving(false)}
          onDone={(_w, text) => { setRemoving(false); onRemoved?.(text); onChanged(); onClose(); }} />
      )}
      <div className={embedded ? undefined : 'ty-scroll'}>
        <div className={embedded ? 'ty-body is-inline' : 'ty-body'}>
          {err && <div className="ty-err" role="alert">{err}</div>}
          {blockedBy && <QuestionnaireOpenNotice open={blockedBy} firstName={firstName} onOpen={onOpenRequest} />}
          {flash && <div className="ty-ok" role="status">{flash}</div>}
          {/* ‼ 19.10.2026 · דוח שנתי: דף הסיכום (מה למלא · מסמכים · רק אתה יודע · הכרעות · מה פתוח) למעלה; כל השאר — מקופל
              ב«פירוט מלא» (הדמיה מאושרת docs/proposals/2026-10-19-simple-annual-questionnaire.html). */}
          {purpose === 'annual' && data && <AnnualSummary client={client} step={step} year={year} data={data} busy={busy} run={run} more={annualMore} onClientPersisted={onClientPersisted}
            legacy={legacyAnnual && isOpenStep(step) ? { reopen: () => run(() => reopenAnnualInNewVersion(client, step.id, year), `הבקשה הקודמת נסגרה ונשמרה בהיסטוריה, ונפתחה «דוח שנתי ${year}» חדשה — בשורה שלה ב«בקשות». בלי מייל.`) } : undefined}
            officeTodo={picture.officeTodo.length ? { count: picture.officeTodo.length, open: () => { setPick('office'); setFullOpen(true); requestAnimationFrame(() => fullRef.current?.scrollIntoView({ block: 'start' })); } } : undefined}
            statuses={picture.statuses} applyCard={applyCard}
            openFull={() => { setPick(null); setFullOpen(true); requestAnimationFrame(() => fullRef.current?.scrollIntoView({ block: 'start' })); }} />}
          <FullDetails enabled={purpose === 'annual'} open={fullOpen} onToggle={setFullOpen} innerRef={fullRef}>

          {purpose === 'wealth' && <WealthDeclarationPanel client={client} step={step} payload={p} busy={busy} run={run} />}
          {prevAsOf && (
            <div className="ty-note" role="note">{prevFacts.length
              ? `ההצהרה הקודמת במערכת (ליום ${formatDate(prevAsOf)}): ${prevFacts.length} נתונים מאושרים. השאלות ללקוח שואלות מה השתנה מאז, ומציגות מה הוצהר — הנתונים הישנים לא מועתקים ליום החדש.`
              : `ההצהרה הקודמת (ליום ${formatDate(prevAsOf)}) לא הוכנה במערכת — הבסיס הוא מה שנרשם ב«ההצהרה הקודמת» למעלה.`}</div>
          )}
          {purpose === 'estimate' && EstimatePanel && <EstimatePanel client={client} step={step} year={year} cutoffMonth={p.cutoffMonth ?? 12} facts={data.facts} evidence={data.evidence} />}
          {purpose === 'intake' && openIntake && (
            // ‼ 236 · השאלון הישן והקליטה לא רצים במקביל בלי שהמשרד החליט. «החלף» — השאלון יורד מהדף האישי,
            //   ומה שהלקוח כבר ענה נקלט כהצעות לאישור בתיק המס (לא נמחק). «להשאיר» — הקליטה לא שואלת את הפרטים הקבועים.
            <div className="ty-note wd-hint" role="note" data-legacy-intake>
              <strong>שאלון הקליטה הישן («עדכון סטטוס מיסויי») עדיין פתוח ל{firstName}</strong>
              {openIntake.published ? ` — בדף האישי מ-${formatDate(openIntake.since ?? '')}` : ' — טיוטה, עוד לא בדף האישי'}
              {openIntake.started ? `. ${firstName} כבר התחיל/ה לענות עליו.` : openIntake.published ? `. ${firstName} עוד לא התחיל/ה לענות.` : '.'}
              <br />כדי שלא יקבל שני שאלונים: <b>להחליף אותו בקליטה הזו</b> — הוא יורד מהדף האישי{openIntake.started ? ', ותשובות שכבר נתן נשמרות ומחכות לאישורך בתיק המס' : ''}{openIntake.published
                // ‼ 263 · לקוח אחד = שאלון אחד פתוח: כל עוד הישן בדף — השאלות של הקליטה לא עולות (השרת מסרב)
                ? <>. עד אז השאלות של הקליטה לא עולות לדף — לכל לקוח שאלון אחד פתוח בכל פעם.</>
                : <>; או <b>להשאיר אותו</b> — ואז הקליטה לא שואלת את הפרטים הקבועים, רק מסמכים ושאלות המשך.</>}
              <div className="ty-actions">
                <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                  onClick={() => void run(async () => {
                    const r = await replaceLegacyIntake(client, step.id, openIntake.created);
                    if (r.ok) { setOpenIntake(null); setFlash(r.imported ? `השאלון הישן הוחלף בקליטה. ${count(r.imported, 'תשובה אחת', 'תשובות')} שכבר נתן מחכות לאישורך בתיק המס.` : 'השאלון הישן הוחלף בקליטה — הוא כבר לא בדף האישי.'); }
                    return r;
                  })}>החלף בקליטה</button>
              </div>
            </div>
          )}
          {purpose === 'intake' && !openIntake && p.legacyReplaced?.at && (
            <div className="ty-note" role="note">שאלון הקליטה הישן הוחלף בקליטה הזו ב-{formatDate(p.legacyReplaced.at.slice(0, 10))}. תשובות שנתן בו — בתיק המס, לאישור.</div>
          )}
          {purpose === 'intake' && !embedded && (
            <div className="ty-note" role="note">כאן משלימים את התיק עצמו: מי הלקוח, מקורות ההכנסה, הנכסים והמסמכים הקבועים. תשובה של הלקוח היא הצעה — נכנסת לתיק רק אחרי אישור, דרך הצעה עם מקור והיסטוריה. אימות מול הרשויות הוא יישור הקו (בתיק המס), לא השאלון.</div>
          )}
          {purpose === 'annual' && !AnnualReturnPanel && (
            <div className="ty-note" role="note">הכנת הדוח עצמו (מילוי 1301 והקובץ לשידור) — עוד לא באתר. כאן אוספים, בודקים ומאשרים את הנתונים והמסמכים, והם נשמרים לשנה בתיק המס.</div>
          )}
          {purpose === 'annual' && AnnualReturnPanel && <AnnualReturnPanel client={client} step={step} year={year} facts={data.facts} evidence={data.evidence} run={run} />}

          <section aria-labelledby="ty-now">
            <p className="ty-label" id="ty-now">עכשיו</p>
            <div className="ty-now">
              {now === 'stale' && (
                <>
                  <h3>{count(picture.stale.length, 'שאלה אחת כבר לא רלוונטית', 'שאלות כבר לא רלוונטיות')}</h3>
                  <p className="ty-why">התשובה שעליה הן נשענו שונתה (למשל «כן» שתוקן ל«לא»). ביטול שומר אותן בהיסטוריה כמבוטלות; שאלה שכבר בדף האישי יורדת ממנו.</p>
                  <ul className="ty-lines">{picture.stale.map(s => <li key={s.ask!.id}>{s.ask!.prompt.title}{target(s, client) ? ` · ${target(s, client)}` : ''} — {s.ask!.state === 'draft' ? 'טיוטה' : s.ask!.state === 'unavailable' ? `«${s.ask!.unavailable?.code ? UNAVAILABLE_LABEL[s.ask!.unavailable.code] : s.ask!.unavailable?.reason ?? UNAVAILABLE_LABEL.legacy}»` : 'בדף האישי'}</li>)}</ul>
                  <div className="ty-actions">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(async () => { for (const s of picture.stale) { const r = await api.cancelAsk(s.ask!.id); if (!r.ok) return r; } return { ok: true }; }, 'השאלות שכבר לא רלוונטיות בוטלו — נשמרו בהיסטוריה')}>בטל אותן</button>
                  </div>
                </>
              )}
              {now === 'syncing' && (
                <div data-ty-syncing>
                  <h3>{autoBusy ? `מעדכן את השאלון בדף של ${firstName}…` : err || blockedBy ? 'השאלון לא עודכן בדף' : `מכין את השאלון ל${firstName}`}</h3>
                  <p className="ty-why">השאלות נגזרות מהתיק ומתפרסמות בדף של {firstName} לבד — בלי מייל. המייל, אם צריך — מ«הדף של {firstName}» למעלה.</p>
                  {!autoBusy && (err || blockedBy) && (
                    <div className="ty-actions">
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => { autoKeyRef.current = null; setAutoRetry(n => n + 1); }} data-ty-retry>נסה שוב</button>
                    </div>
                  )}
                </div>
              )}
              {now === 'review' && <ReviewPanel client={client} review={review} notSure={notSure} busy={busy} run={run} evidence={data.evidence} onReturn={returnToClient} applyCard={applyCard} />}
              {now === 'publish' && (
                <>
                  <h3>מוכן לדף האישי: {count(drafts.length, 'שאלה אחת', 'שאלות')} ל{firstName}</h3>
                  {gateOpen === false && <p className="ty-why wd-hint" role="note" data-gate-closed>התהליך של {firstName} עוד לא נפתח לו בדף האישי: השאלות יישמרו כמפורסמות, ויופיעו לו רק אחרי «פרסם בדף» {embedded ? `בכרטיס «הדף של ${firstName}» למעלה` : 'ב«בקשות»'} (גם שם — בלי מייל).</p>}
                  <p className="ty-why">{embedded
                    ? `«פרסם את השאלות בדף» מוסיף אותן לדף של ${firstName} — בלי מייל. מייל, אם צריך — מ«הדף של ${firstName}» למעלה.`
                    : 'השאלות יופיעו ב«השלמת מידע» בדף האישי. המייל יוצא ב«שלח בקשות» — מייל אחד, לכתובת שבכרטיס.'}</p>
                  <ul className="ty-lines">{drafts.slice(0, 6).map(a => <li key={a.id}>{a.prompt.title}{a.prompt.subjectName ? ` · על ${a.prompt.subjectName}` : ''}</li>)}{drafts.length > 6 && <li>ועוד {drafts.length - 6}…</li>}</ul>
                  <div className="ty-actions">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => infoStep && void run(() => api.publishInfo(infoStep.id), gateOpen === false ? (embedded ? `נשמר כמפורסם — יופיע ל${firstName} אחרי «פרסם בדף» בכרטיס «הדף של ${firstName}» למעלה. לא נשלח מייל.` : 'נשמר כמפורסם — יופיע בדף האישי אחרי «פרסם בדף» ב«בקשות». המייל — ב«שלח בקשות».') : embedded ? `פורסם בדף של ${firstName} — לא נשלח מייל.` : 'פורסם בדף האישי. המייל — ב«שלח בקשות».')} data-ty-publish>{embedded ? 'פרסם את השאלות בדף' : 'פרסם בדף האישי'}</button>
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPreview(true)}>איך זה ייראה</button>
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(async () => { for (const a of drafts) await api.cancelAsk(a.id); return { ok: true }; }, 'השאלות בוטלו')}>בטל טיוטה</button>
                  </div>
                </>
              )}
              {now === 'ask' && <AskPanel client={client} plan={buildAskPlan(askable, { client, taxYear: year, purpose, cutoffMonth: p.cutoffMonth, asOfDate: p.asOfDate, declKind: p.kind, previousByArea: prevArea })} picture={picture} busy={busy} purpose={purpose} year={year} cutoff={p.cutoffMonth} openIntake={openIntake}
                onAdd={sel => run(() => api.addAsks(step.id, sel.map(e => ({ itemKey: e.itemKey, subjectRole: e.subjectRole, entityKind: e.entityKind, entityRef: e.entityRef, prompt: e.prompt }))),
                  'נוספו לבקשת «השלמת מידע» — טיוטה, עד שתפרסם').then(ok => { if (ok) setPick('publish'); return ok; })} />}
              {now === 'office' && <OfficePanel client={client} statuses={picture.officeTodo} evidence={data.evidence} facts={data.facts} busy={busy} purpose={purpose} year={year} cutoff={p.cutoffMonth} asOf={p.asOfDate} stepId={step.id} run={run} applyCard={applyCard} />}
              {now === 'waiting' && (
                <>
                  <h3>ממתין ל{firstName}</h3>
                  <p className="ty-why">{waitingAsks.length ? `${waitingAsks.length} שאלות פורסמו בדף האישי${infoStep?.publishedAt ? ` ב-${formatDate(infoStep.publishedAt)}` : ''}.` : ''} {picture.waiting.filter(s => s.state === 'unavailable').length ? 'יש מסמכים שהלקוח סימן «אין לי עדיין» — עם מועד מעקב לכל אחד.' : ''} אין הודעה אוטומטית; תזכורת — ב«שלח בקשות».</p>
                </>
              )}
              {now === 'done' && (<><h3>{purpose === 'intake' ? 'התיק הושלם לפי מה שנבדק' : purpose === 'wealth' ? 'הכול נאסף ונבדק ליום ההצהרה' : `הכול ידוע לשנה ${year}, לפי מה שנבדק`}</h3><p className="ty-why">אין שאלות פתוחות ואין מה לאשר. פירוט מלא — למטה.{purpose === 'intake' ? ' הצעד הבא: דוח שנתי לשנה שנסגרה, או הצהרת הון — מ«תיק מס».' : ''}</p></>)}
            </div>
          </section>

          {later.length > 0 && (
            <section aria-labelledby="ty-later">
              <p className="ty-label" id="ty-later">אחר כך</p>
              <ol className="ty-later">{later.map((l, i) => <li key={i}>{typeof l === 'string' ? l : <>{l.text} <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPick(l.go)}>{l.go === 'office' ? 'להשלים עכשיו' : l.go === 'publish' ? 'לפרסם עכשיו' : 'להכין עכשיו'}</button></>}</li>)}</ol>
              {pick && now !== suggested && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPick(null)}>חזרה לסדר המומלץ</button>}
            </section>
          )}

          <section aria-labelledby="ty-detail">
            <p className="ty-label" id="ty-detail">{embedded ? 'השאלון — לפי תחום' : 'פירוט, כשצריך'}</p>
            <Details tree={embedded} client={client} statuses={picture.statuses} evidence={data.evidence} purpose={purpose} legacy={!!p.legacySessionId}
              facts={data.facts} busy={busy} onMark={(key, yes) => run(() => api.recordFact(client.id, { taxYear: year, itemKey: key, subjectRole: 'client', ...(purpose === 'wealth' ? { periodKind: 'as_of', periodTo: p.asOfDate } : { periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31` }), answer: yes ? 'value' : 'no', value: yes ? true : undefined, basis: 'actual', requestId: step.id } as never), yes ? 'סומן «חל» — מופיע עכשיו ברשימת החסרים' : 'סומן «לא חל»')} />
          </section>

          <section aria-label="השאלון ואיך עושים ביד">
            <details className="ty-details" ref={qRef} open={qOpen} onToggle={e => setQOpen((e.currentTarget as HTMLDetailsElement).open)}>
              <summary><b>השאלון</b><span>מה נשאל את {firstName} ולמה, והשאלון המלא עם ההסתעפויות</span></summary>
              <div className="ty-details-body">{qOpen && <QuestionnaireMap client={client} picture={picture} asks={data.asks} />}</div>
            </details>
            {processByKey(step.stepType) && (
              <details className="ty-details">
                <summary><b>איך עושים את זה ביד</b><span>מה מכינים, השלבים, מה בודקים ומה נחשב ראיה — גם בלי המערכת</span></summary>
                <div className="ty-details-body">
                  <ProcessSteps def={processByKey(step.stepType)!} manual onOpenQuestionnaire={() => { setQOpen(true); requestAnimationFrame(() => qRef.current?.scrollIntoView({ block: 'start' })); }} />
                </div>
              </details>
            )}
          </section>
          </FullDetails>
        </div>
      </div>
      {preview && infoStep && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setPreview(false); }}>
          <div className="modal" style={{ maxWidth: 440 }} role="dialog" aria-label="מה הלקוח רואה">
            <div className="modal-head"><h3 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>מה {firstName} רואה בדף האישי</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreview(false)} aria-label="סגירה">✕</button></div>
            <div className="modal-body"><TaxInfoFlow stepId={infoStep.id} previewAsks={data.asks.filter(a => a.stepId === infoStep.id && a.state !== 'cancelled')} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

/** דוח שנתי: כל מה שמתחת לסיכום — בקיפול אחד. בשאר העבודות — כמו שהיה. */
// ‼ 21.10.2026 · בלי קיפול משלו: נפתח מ«פירוט ▾» ← «החישוב ואיך עושים ביד — פתח» או מכפתור בשורה (AnnualSummary),
//   ונסגר כאן. התוכן טעון גם כשהוא סגור (כמו בקיפול) — פאנל הדוח מודיע מכאן על הגרסאות לפס השלבים.
function FullDetails({ enabled, open, onToggle, innerRef, children }: { enabled: boolean; open: boolean; onToggle: (v: boolean) => void; innerRef: React.RefObject<HTMLElement>; children: React.ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <section className="as-full" data-annual-full ref={innerRef} hidden={!open} aria-label="החישוב ואיך עושים ביד">
      <div className="as-full-head"><b>החישוב ואיך עושים ביד</b>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onToggle(false)} data-annual-full-close>סגירה</button></div>
      {children}
    </section>
  );
}

function errText(e?: string): string {
  switch (e) {
    case 'mismatch_cannot_accept': return 'אי אפשר לאשר מסמך שלא תואם ללקוח או לתקופה.';
    case 'nothing_to_publish': return 'אין שאלות לפרסום.';
    // 263 · לקוח אחד = שאלון אחד פתוח (כשאין פרטים — הנוסח הכללי; עם פרטים: QuestionnaireOpenNotice)
    case 'questionnaire_open': return questionnaireOpenText(undefined) + '.';
    case 'parent_closed': return 'הבקשה כבר סגורה.';
    case 'not_askable': return 'אין שאלה ללקוח לפריט הזה (פריט של המשרד, או מסמך שלא הועלה דרך שאלה) — אפשר לדחות ולהשלים במשרד.';
    case 'bad_value': return 'ערך לא תקין.';
    // 230 · הצהרת הון
    case 'item_purpose_mismatch': return 'שאלת הון שייכת רק להצהרת הון, ושאלת שנת מס — רק לשנת מס.';
    case 'demand_date_required': return 'כדי לאמת דרישה צריך תאריך מכתב או תאריך קבלה.';
    case 'due_before_letter': return 'המועד שנרשם מוקדם מתאריך המכתב — לבדוק שוב.';
    case 'evidence_required': return 'אימות דורש אסמכתה: מסמך בתיק או רשומה שנקראה מהרשות.';
    case 'evidence_not_found': return 'האסמכתה לא נמצאה בתיק של הלקוח הזה (או שאינה רשומה מאושרת מהרשות).';
    case 'no_demand': return 'אין דרישה רשומה.';
    case 'bad_source': return 'מקור לא מוכר.';
    case 'extension_date_required': return 'צריך תאריך לארכה.';
    case 'basis_needs_justification': return 'אפשרות שאינה לשון הטופס נשמרת רק עם ביסוס מתועד.';
    case 'basis_change_needs_explanation': return 'שינוי בסיס מול ההצהרה הקודמת דורש הסבר.';
    case 'omission_description_required': return 'צריך לתאר מה לא הוצהר.';
    case 'omission_resolution_required': return 'סגירת ממצא דורשת הכרעה כתובה.';
    case 'previous_not_before': return 'ההצהרה הקודמת חייבת להיות ליום מוקדם יותר.';
    // 236 · קליטה ועדכון הכרטיס
    case 'card_changed_meanwhile': return 'הכרטיס השתנה מאז — העדכון נשמר כהצעה ממתינה בתיק המס, לבדיקה ולאישור שם (לא נדרס דבר).';
    case 'item_purpose_mismatch_intake': return 'שאלת קליטה שייכת רק לקליטה והשלמת תיק.';
    default: return e ? `הפעולה נכשלה (${e})` : 'הפעולה נכשלה';
  }
}

// ── בדיקה ואישור ─────────────────────────────────────────────────────────────
const nameOf = (c: Client, role: string) => role === 'spouse' ? (c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג') : role === 'client' ? (c.firstName || 'הלקוח') : '';
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

type ReturnFrom = Parameters<typeof correctionAsk>[0];

type ApplyCard = (items: ProposedFact[], sourceRef: string) => Promise<{ ok: boolean; error?: string }>;

function ReviewPanel({ client, review, notSure, busy, run, evidence, onReturn, applyCard }: {
  onReturn: (from: ReturnFrom, note: string) => Promise<boolean>;
  applyCard: ApplyCard;
  client: Client; review: NonNullable<ReturnType<typeof groupForReview>>; notSure: api.YearData['asks']; busy: boolean;
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>; evidence: Evidence[];
}) {
  const first = client.firstName || 'הלקוח';
  const total = review.unchanged.length + review.negatives.length + review.individual.length + review.legacy.length + review.documents.length;
  void evidence;
  return (
    <>
      <h3>לבדוק את מה ש{first} מסר ({total})</h3>
      <p className="ty-why">תשובה של לקוח נכנסת לשימוש רק אחרי אישור. «אין שינוי» של הלקוח אינו אישור מקצועי — הוא מאושר כאן במרוכז, עם הפירוט.</p>
      {review.unchanged.length > 0 && (
        <div className="ty-bulk">
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 'var(--fs-14)' }}>לפי {first}: אין שינוי — {count(review.unchanged.length, 'פריט אחד', 'פריטים')}</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm btn-primary" disabled={busy}
              onClick={() => void run(() => api.decideFacts(review.unchanged.map(r => r.fact.id), 'accept'), `אושרו ${review.unchanged.length} פריטים ללא שינוי`)}>אשר את כולם</button>
          </div>
          <details open={review.unchanged.length <= 4}>
            <summary>מה בדיוק אושר</summary>
            <div className="ty-rows">{review.unchanged.map(r => (
              <div key={r.fact.id} className="ty-row">
                <div className="ty-main"><b>{r.label}{nameOf(client, r.fact.subjectRole) ? ` · ${nameOf(client, r.fact.subjectRole)}` : ''}</b><small>{r.knownText || '—'}</small></div>
                <div className="ty-side"><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.decideFacts([r.fact.id], 'reject', 'לא אושר במשרד'))}>לא לאשר</button></div>
              </div>))}</div>
          </details>
        </div>
      )}
      {review.negatives.length > 0 && (
        <div className="ty-bulk">
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 'var(--fs-14)' }}>לפי {first}: «לא» — {count(review.negatives.length, 'נושא אחד', 'נושאים')}</b>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm btn-primary" disabled={busy}
              onClick={() => void run(() => api.decideFacts(review.negatives.map(r => r.fact.id), 'accept'), `אושרו ${review.negatives.length} תשובות «לא»`)}>אשר את כולם</button>
          </div>
          <details open={review.negatives.length <= 4}>
            <summary>על מה</summary>
            <div className="ty-rows">{review.negatives.map(r => (
              <div key={r.fact.id} className="ty-row">
                <div className="ty-main"><b>{r.label}{nameOf(client, r.fact.subjectRole) ? ` · ${nameOf(client, r.fact.subjectRole)}` : ''}</b><small>{r.areaTitle}</small></div>
                <div className="ty-side"><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.decideFacts([r.fact.id], 'reject', 'לא אושר במשרד'))}>לא לאשר</button></div>
              </div>))}</div>
          </details>
        </div>
      )}
      {[...review.individual, ...review.legacy].length > 0 && (
        <div className="ty-rows">{[...review.individual, ...review.legacy].map(r => <ReviewLine key={r.fact.id} r={r} who={nameOf(client, r.fact.subjectRole)} busy={busy} run={run} client={client} onReturn={onReturn} applyCard={applyCard} />)}</div>
      )}
      {notSure.length > 0 && (
        <div className="ty-rows">{notSure.map(a => (
          <div key={a.id} className="ty-row"><div className="ty-main"><b>{a.prompt.title}</b><small>«{a.officeNote}» — לבירור במשרד (לא נשמרה תשובה). אפשר להשלים במשרד או לשאול שוב.</small></div>
            <div className="ty-side"><span className="ty-chip amber">לא בטוח/ה</span>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.resolveNote(a.id), 'סומן «טופל»')}>טופל</button></div></div>))}</div>
      )}
      {review.documents.length > 0 && (
        <div className="ty-rows">{review.documents.map(e => <DocLine key={e.id} e={e} client={client} busy={busy} run={run} onReturn={onReturn} />)}</div>
      )}
    </>
  );
}

function ReviewLine({ r, who, busy, run, client, onReturn, applyCard }: { r: ReviewRow; who: string; busy: boolean; run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>; client: Client; onReturn: (from: ReturnFrom, note: string) => Promise<boolean>; applyCard: ApplyCard }) {
  const [fix, setFix] = useState(false);
  const [back, setBack] = useState<string | null>(null);
  // ‼ ישות חדשה שהתגלתה בשאלון — הצעה לתיק (המשרד מאשר בלשונית «תיק מס»), לא כתיבה ישירה ולא שינוי של תוצר מאושר
  const entityKind = NEW_ENTITY_ITEMS[r.fact.itemKey];
  const [addOpen, setAddOpen] = useState(false);
  // ‼ ישות זמנית (נולדה מ«כן» בלי ישות בתיק): נכנסת לתיק עם אותו מזהה, והתשובה מאושרת באותה פעולה. ישות שהתגלתה
  //   ב«משהו השתנה» — הצעה לתיק (המשרד מאשר בלשונית «תיק מס»), כמו קודם.
  const provisional = isProvisionalRef(r.fact.entityRef);
  const addEntity = (entity: Record<string, unknown>) => run(async () => {
    const proposal = newEntityProposal(client, entityKind!, entity, { factId: r.fact.id, itemKey: r.fact.itemKey, year: r.fact.taxYear }, provisional ? r.fact.entityRef : undefined);
    if (provisional) {
      const a = await applyCard([proposal], `tax_year_fact:${r.fact.id}`);
      if (!a.ok) return a;
      setAddOpen(false);
      return api.decideFacts([r.fact.id], 'accept');
    }
    const res = await proposeTaxFacts(client.id, 'questionnaire', `tax_year_fact:${r.fact.id}`, [proposal]);
    if (!res.ok) throw new Error(res.error ?? 'propose_failed');
    setAddOpen(false);
    return { ok: true };
  }, provisional ? 'נוסף לתיק המס עם אותו מזהה, והתשובה אושרה. המסמכים שהועלו עליו נשארים משויכים; תוצרים שאושרו קודם יסומנו «לבדיקה»'
    : 'הוצע לתיק המס — ממתין לאישור בלשונית «תיק מס». תוצרים שכבר אושרו לא משתנים; יסומנו «לבדיקה» אחרי האישור');
  // ‼ תשובה שסותרת ישות שכבר בתיק — לא כותבים ולא מתעלמים: מציגים, והמשרד מכריע (עדכון = הצעה לאישור בתיק)
  const conflicts = entityConflicts(client, [r.fact]);
  const fmtV = (v: unknown) => (typeof v === 'boolean' ? (v ? 'כן' : 'לא') : String(v ?? '—'));
  const proposeUpdate = () => run(async () => {
    const c0 = conflicts[0];
    const patch = Object.fromEntries(conflicts.filter(c => c.entityId === c0.entityId).map(c => [c.field, c.answer]));
    const res = await proposeTaxFacts(client.id, 'questionnaire', `tax_year_fact:${r.fact.id}`, [updateEntityProposal(client, c0.kind, c0.entityId, patch, { factId: r.fact.id, itemKey: r.fact.itemKey, year: r.fact.taxYear })]);
    if (!res.ok) throw new Error(res.error ?? 'propose_failed');
  }, 'הוצע עדכון בתיק המס — ממתין לאישור בלשונית «תיק מס». תוצרים שאושרו לא משתנים; יסומנו «לבדיקה»');
  // ‼ 13.10.2026 · תשובה מובנית ← עדכון בתיק באותה לחיצה של האישור (ילדים, בנק, כתובת; תאריכי נכס/חשבון מתחולה).
  //   ההצעה נושאת את תמונת המצב שהלקוח ראה — כרטיס שהשתנה בינתיים ⇒ ממתין בתיק המס, לא נדרס. לא מוחקים דבר.
  const from = { factId: r.fact.id, itemKey: r.fact.itemKey, year: r.fact.taxYear };
  // ‼ מה שהיה בתיק ולא הופיע בתשובה — הכרעה מפורשת לכל פריט לפני «אשר ועדכן בתיק» (גם «להשאיר» היא הכרעה)
  const [dec, setDec] = useState<Record<string, OmitDecision>>({});
  const plan = updatesCard(r.fact.itemKey) ? cardUpdateFor(client, r.fact.itemKey, r.fact.value, from, r.fact.subjectRole, dec) : null;
  const undecided = (plan?.omitted ?? []).filter(o => !dec[o.id] || (dec[o.id].action === 'end' && !(dec[o.id] as { date: string }).date));
  const canUpdate = !!plan && (plan.proposals.length > 0 || plan.omitted.length > 0);
  const dates = RECORD_OF[r.fact.itemKey] === 'period' ? periodDatesPatch(client, r.fact.entityKind, r.fact.entityRef, r.fact.value) : null;
  const approveWith = (proposals: ProposedFact[], done: string) => run(async () => {
    const a = await applyCard(proposals, `tax_year_fact:${r.fact.id}`);
    const d = await api.decideFacts([r.fact.id], 'accept') as { ok?: boolean; error?: string };
    if (d && d.ok === false) return d;
    return a.ok ? { ok: true } : a;
  }, done);
  const [val, setVal] = useState('');
  const src = r.fact.source === 'legacy_questionnaire' ? 'שאלון קודם' : r.fact.source === 'card_migration' ? 'מהכרטיס' : 'דף אישי';
  const isNum = typeof r.fact.value === 'number' || r.fact.answer === 'zero';
  return (
    <div className="ty-row">
      <div className="ty-main">
        <b>{r.label}{who ? ` · ${who}` : ''}</b>
        <small>{src} · {formatDate(r.fact.createdAt)} · {r.answerText}{r.knownText && !r.conflict ? ` (ידוע: ${r.knownText})` : ''}</small>
        {r.conflict && <span className="ty-warn">⚠ {r.conflict}</span>}
        {conflicts.length > 0 && <span className="ty-warn">⚠ סותר את התיק: {conflicts.map(c => `${c.entityLabel} — ${c.fieldLabel}: בתיק ${fmtV(c.card)}, בתשובה ${fmtV(c.answer)}`).join(' · ')}</span>}
        {r.fact.note && r.fact.source === 'card_migration' && <small>{r.fact.note}</small>}
        {plan && <small className="ty-card-plan" data-card-plan>{plan.proposals.length ? 'יעודכן בתיק באישור: ' : ''}{plan.lines.join(' · ')}</small>}
        {plan && plan.omitted.length > 0 && (
          <div className="ty-omitted" data-omitted-list>
            <b>{plan.omitted.length === 1 ? 'פריט אחד בתיק לא הופיע בתשובה' : `${plan.omitted.length} פריטים בתיק לא הופיעו בתשובה`} — מה לעשות?</b>
            {plan.omitted.map((o, k) => <OmittedChoice key={o.id || `${o.kind}-${k}`} o={o} d={dec[o.id]} busy={busy} onChange={d => setDec(x => ({ ...x, [o.id]: d }))} />)}
            <small>כלום לא נמחק בלי הכרעה. הערך הקודם נשמר בהיסטוריית התיק.</small>
          </div>
        )}
        {dates && <small className="ty-card-plan" data-card-plan>יעודכן בתיק באישור: {dates.text}</small>}
        {entityKind && addOpen && (
          <EntityForm kind={entityKind} subjectRole={r.fact.subjectRole} hint={typeof r.fact.value === 'string' ? r.fact.value : (r.fact.value as { note?: string } | undefined)?.note}
            busy={busy} submitLabel={provisional ? 'הוסף לתיק ואשר' : 'הצע לתיק'} onSubmit={e => void addEntity(e)} />
        )}
        {back !== null && (
          <ReturnBox value={back} onChange={setBack} busy={busy} onSend={() => void onReturn({ factId: r.fact.id, askId: r.fact.askId, itemKey: r.fact.itemKey, subjectRole: r.fact.subjectRole, entityKind: r.fact.entityKind, entityRef: r.fact.entityRef }, back).then(ok => ok && setBack(null))} />
        )}
        {fix && (
          <div className="ty-inline">
            <input aria-label="ערך מתוקן" type={isNum ? 'number' : 'text'} value={val} onChange={e => setVal(e.target.value)} />
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || !val.trim()} onClick={() => void run(() => api.correctFact(r.fact.id,
              isNum && Number(val) === 0 ? 'zero' : 'value', isNum ? Number(val) : val.trim(), 'תיקון משרד'), 'נשמר תיקון משרד; התשובה המקורית נשמרה כהיסטוריה').then(ok => ok && setFix(false))}>שמור תיקון</button>
          </div>
        )}
      </div>
      <div className="ty-side">
        {plan && canUpdate && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || undecided.length > 0} data-approve-update
            title={undecided.length ? 'קודם להכריע מה לעשות עם מה שלא הופיע בתשובה' : undefined}
            onClick={() => void approveWith(plan.proposals, plan.proposals.length ? 'אושר ועודכן בתיק — הערך הקודם נשמר בהיסטוריה' : 'אושר — התיק נשאר כמו שהוא')}>{plan.proposals.length ? 'אשר ועדכן בתיק' : 'אשר'}</button>
        )}
        {dates && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} data-approve-update
            onClick={() => void approveWith([updateEntityProposal(client, dates.kind, dates.id, dates.patch, from)], 'אושר והתאריכים עודכנו בתיק')}>אשר ועדכן תאריכים</button>
        )}
        <button type="button" className={`btn btn-sm ${canUpdate || dates ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={() => void run(() => api.decideFacts([r.fact.id], 'accept'), 'אושר — התיק לא עודכן')}>{canUpdate || dates ? 'אשר בלי לעדכן את התיק' : 'אשר'}</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setFix(f => !f)}>תקן</button>
        {entityKind && !canUpdate && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAddOpen(o => !o)} title="ישות שאינה בתיק — הצעה לתיק, לאישור המשרד">הוסף לתיק</button>}
        {conflicts.length > 0 && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void proposeUpdate()} title="הצעת עדכון לתיק — לאישור המשרד">עדכן בתיק</button>}
        {r.fact.source !== 'office' && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setBack(b => (b === null ? '' : null))} title="דחייה עם הערה, ואותה שאלה חוזרת ללקוח לתיקון">החזר ללקוח</button>}
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.decideFacts([r.fact.id], 'reject', 'נדחה במשרד'), 'נדחה')}>דחה</button>
      </div>
    </div>
  );
}

/** פריט שהיה בתיק ולא הופיע בתשובה — להשאיר / לתקן / נרשם בטעות / לסיים תוקף. */
function OmittedChoice({ o, d, busy, onChange }: { o: Omitted; d?: OmitDecision; busy: boolean; onChange: (d: OmitDecision) => void }) {
  const name = `omit-${o.id}`;
  const fixPatch = d?.action === 'fix' ? d.patch : Object.fromEntries(o.fields.map(f => [f.key, f.value]));
  return (
    <fieldset className="ty-omit" data-omitted={o.id} disabled={busy}>
      <legend>{o.label}</legend>
      <div className="ty-omit-opts" role="radiogroup" aria-label={`מה לעשות עם ${o.label}`}>
        {o.can.map(a => (
          <label key={a} className="ty-omit-opt">
            <input type="radio" name={name} checked={d?.action === a} data-omit-action={a}
              onChange={() => onChange(a === 'fix' ? { action: 'fix', patch: fixPatch } : a === 'end' ? { action: 'end', date: '' } : { action: a })} />
            {a === 'end' ? END_LABEL[o.kind] : OMIT_LABEL[a]}
          </label>
        ))}
      </div>
      {d?.action === 'fix' && (
        <div className="ty-inline">
          {o.fields.map(f => (
            <label key={f.key}>{f.label} <input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'digits' ? 'numeric' : undefined} value={d.patch[f.key] ?? ''}
              onChange={e => onChange({ action: 'fix', patch: { ...d.patch, [f.key]: e.target.value } })} /></label>
          ))}
        </div>
      )}
      {d?.action === 'end' && (
        <div className="ty-inline"><label>מתאריך <input type="date" value={d.date} data-omit-date onChange={e => onChange({ action: 'end', date: e.target.value })} /></label></div>
      )}
    </fieldset>
  );
}

function ReturnBox({ value, onChange, busy, onSend }: { value: string; onChange: (v: string) => void; busy: boolean; onSend: () => void }) {
  return (
    <div className="ty-inline">
      <input aria-label="מה צריך לתקן" placeholder="מה צריך לתקן (הלקוח יראה את זה)" value={value} onChange={x => onChange(x.target.value)} style={{ flex: 1, minWidth: 0 }} />
      <button type="button" className="btn btn-sm btn-primary" disabled={busy || !value.trim()} onClick={onSend}>החזר</button>
    </div>
  );
}

function DocLine({ e, client, busy, run, onReturn }: { e: Evidence; client: Client; busy: boolean; run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>; onReturn: (from: ReturnFrom, note: string) => Promise<boolean> }) {
  const [back, setBack] = useState<string | null>(null);
  const [idm, setIdm] = useState<Evidence['identityMatch']>(e.identityMatch);
  const [pm, setPm] = useState<Evidence['periodMatch']>(e.periodMatch);
  const whoName = e.subjectRole === 'spouse' ? (client.spouseFirstName || client.spouse?.firstName || 'בן/בת הזוג') : client.firstName;
  return (
    <div className="ty-row">
      <div className="ty-main">
        <b>{DOCS[e.docKind]?.label ?? 'מסמך'} · {e.fileName ?? ''}</b>
        <small>התקבל {formatDate(e.receivedAt)} · {e.receivedVia === 'portal' ? 'מהדף האישי' : 'מהמשרד'} · חילוץ אוטומטי לא נתמך — הסכומים מוזנים במשרד</small>
        <div className="ty-inline">
          <label>של {whoName}? <select value={idm} onChange={x => setIdm(x.target.value as Evidence['identityMatch'])}><option value="unchecked">לא נבדק</option><option value="match">כן</option><option value="mismatch">לא</option></select></label>
          <label>לשנה הנכונה? <select value={pm} onChange={x => setPm(x.target.value as Evidence['periodMatch'])}><option value="unchecked">לא נבדק</option><option value="match">כן</option><option value="mismatch">לא</option></select></label>
        </div>
        {back !== null && <ReturnBox value={back} onChange={setBack} busy={busy} onSend={() => void onReturn({ evidenceId: e.id, askId: e.askId, itemKey: '', subjectRole: e.subjectRole, entityKind: e.entityKind, entityRef: e.entityRef }, back).then(ok => ok && setBack(null))} />}
      </div>
      <div className="ty-side">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || idm !== 'match' || pm !== 'match'} onClick={() => void run(() => api.reviewEvidence(e.id, idm, pm, 'accepted'), 'המסמך אושר — עכשיו להזין ממנו את הסכומים')}>אשר מסמך</button>
        {e.receivedVia === 'portal' && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setBack(b => (b === null ? '' : null))} title="דחיית המסמך עם הערה, ובקשת קובץ מתוקן מהלקוח">החזר ללקוח</button>}
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.reviewEvidence(e.id, idm, pm, 'rejected', 'נדחה במשרד'), 'המסמך נדחה')}>דחה</button>
      </div>
    </div>
  );
}

// ── הכנת שאלות ───────────────────────────────────────────────────────────────
function AskPanel({ client, plan, picture, busy, purpose, year, cutoff, openIntake, onAdd }: {
  client: Client; plan: AskPlanEntry[]; picture: NonNullable<ReturnType<typeof buildYearPicture>>; busy: boolean; purpose: Purpose; year: number; cutoff?: number;
  openIntake?: api.OpenLegacyIntake | null;
  onAdd: (sel: AskPlanEntry[]) => Promise<boolean>;
}) {
  // ‼ כשהקליטה הישנה פתוחה: אישור פרטים קבועים (מעסיקים, עסקים, נכסים, משפחה) נשאר לה — לא מסומן כברירת מחדל.
  //   סכומי השנה ומסמכי השנה נשאלים כאן תמיד: הם לתקופה החדשה, והקליטה לא שואלת אותם.
  const cardKeys = plan.filter(e => e.statuses[0].state === 'fromCard').map(e => e.key);
  const [off, setOff] = useState<Set<string>>(() => new Set(openIntake ? cardKeys : []));
  useEffect(() => { setOff(o => { const n = new Set(o); for (const k of cardKeys) { if (openIntake) n.add(k); else n.delete(k); } return n; }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [openIntake?.id]);
  const byArea = AREAS.map(a => [a.id, plan.filter(e => e.statuses[0].area === a.id)] as const).filter(([, l]) => l.length > 0);
  const skip = {
    known: picture.counts.known + picture.counts.notApplicable, pending: picture.counts.pendingReview + picture.counts.docReceived,
    asked: picture.counts.asked + picture.counts.unavailable, later: picture.counts.notYetAvailable,
  };
  const chosen = plan.filter(e => !off.has(e.key));
  const ctxNote = purpose === 'intake' ? 'פרטים קבועים ומסמכים, נכון ליום הקליטה. מה שבכרטיס — לאישור; «כן» בלי ישות בתיק פותח שאלת פרטים ומסמך מיד.'
    : purpose === 'wealth' ? 'תשובות נשמרות «נכון ליום ההצהרה». בהצהרת המשך — שואלים מה השתנה מאז הקודמת.' : purpose === 'estimate' ? `תשובות נשמרות עד סוף ${MONTHS[cutoff ?? 12]} ${year}.` : `לדוח ${year} — מה שכבר ידוע מההערכה לא נשאל שוב; שואלים מה השתנה מאז ומבקשים מסמכים סופיים.`;
  return (
    <>
      <h3>{count(plan.length, 'שאלה אחת', 'שאלות')} ל{client.firstName || 'הלקוח'} — רק על מה שחסר</h3>
      {openIntake && (
        <p className="ty-why wd-hint" role="note">שאלון הקליטה הישן עדיין פתוח אצל {client.firstName || 'הלקוח'}{openIntake.since ? ` (מ-${openIntake.since.slice(8, 10)}.${openIntake.since.slice(5, 7)})` : ''}. {cardKeys.length ? `${count(cardKeys.length, 'אישור פרט קבוע אחד', 'אישורי פרטים קבועים')} נשאר לו ולא סומן כאן — כדי שלא יישאל פעמיים.` : ''} {purpose === 'intake' ? 'מסמכים, «אין לי עדיין» ושאלות המשך — כאן: השאלון הישן לא מבקש אותם. כשהלקוח יסיים אותו, התשובות יחכו לאישור בתיק המס.' : `סכומים ומסמכים ל-${year} נשאלים כאן: הם לתקופה הזו, והקליטה לא שואלת אותם.`}</p>
      )}
      <p className="ty-why">{ctxNote} לא יישאל: {skip.known} ידועים, {skip.pending} ממתינים לבדיקה, {skip.asked} כבר נשלחו{skip.later ? `, ${skip.later} מסמכים שעוד לא זמינים` : ''}.</p>
      {byArea.map(([area, list]) => (
        <div key={area} className="ty-area">
          <h4>{AREA_BY_ID[area].title}</h4>
          {list.map(e => { const s = e.statuses[0]; return (
            <label key={e.key} className="ty-check">
              <input type="checkbox" checked={!off.has(e.key)} onChange={x => setOff(o => { const n = new Set(o); if (x.target.checked) n.delete(e.key); else n.add(e.key); return n; })} />
              <span className="ty-main" style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{s.state === 'fromCard' ? 'לאשר: ' : ''}{e.subjectRole === 'couple' && e.statuses.length > 1 ? `${s.item.label} · שניכם, שאלה אחת` : `${s.item.label}${target(s, client) ? ` · ${target(s, client)}` : ''}`}</span>
                <small className="ty-note">«{e.prompt.title}»{(e.prompt.why ?? '').split(' · ').filter(x => x.startsWith('בהצהרה הקודמת')).map(x => ` · ${x}`).join('')}{s.item.calcBlockedBy ? ' · החישוב התלוי בזה חסום עד הכרעה, האיסוף ממשיך' : ''}</small>
              </span>
            </label>
          ); })}
        </div>
      ))}
      <div className="ty-actions">
        <button type="button" className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={() => void onAdd(chosen)}>הוסף {count(chosen.length, 'שאלה אחת', 'שאלות')} לבקשה «השלמת מידע»</button>
        <span className="ty-note">נשמר כטיוטה. הלקוח רואה רק אחרי פרסום.</span>
      </div>
    </>
  );
}

// ── השלמה במשרד ──────────────────────────────────────────────────────────────
function OfficePanel({ client, statuses, evidence, facts, busy, purpose, year, cutoff, asOf, stepId, run, applyCard }: {
  client: Client; statuses: ItemStatus[]; evidence: Evidence[]; facts: api.YearData['facts']; busy: boolean; purpose: Purpose; year: number; cutoff?: number; asOf?: string; stepId: string;
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>; applyCard: ApplyCard;
}) {
  const [all, setAll] = useState(false);
  return (
    <>
      <h3>להשלים במשרד: {statuses.length} פריטים</h3>
      <p className="ty-why">{purpose === 'intake' ? 'עדכון הכרטיס מתשובות שאושרו, הוספת ישויות חדשות לתיק, ויישור קו מול הרשויות. כל עדכון נשמר עם המקור וההיסטוריה.' : 'סכומים ממסמכים שאושרו, מסלולים והחלטות של המשרד. נשמר כמאושר, עם המסמך כשיש.'}</p>
      <div className="ty-rows">{(all ? statuses : statuses.slice(0, 8)).map(s => <OfficeLine key={`${s.item.key}|${s.subjectRole}|${s.entityRef ?? ''}`} s={s} client={client} evidence={evidence} facts={facts} busy={busy} purpose={purpose} year={year} cutoff={cutoff} asOf={asOf} stepId={stepId} run={run} applyCard={applyCard} />)}</div>
      {statuses.length > 8 && !all && <div><button type="button" className="btn btn-sm btn-ghost" onClick={() => setAll(true)}>הצג את כל {statuses.length}</button></div>}
    </>
  );
}

/**
 * סכומים שהמסמך מפרט לכמה רכיבים — נשמרים כרכיבים בשם (אותו קורא בהערכה ובדוח: annualReturn/facts.ts).
 * ‼ בלי זה המשרד יכול היה להזין רק ברוטו, והמס שנוכה (042) נשאר «חסר» בלי דרך להשלים אותו.
 */
const AMOUNT_PARTS: Record<string, [string, string][]> = {
  'salary.amounts': [['gross', 'ברוטו'], ['withheld', 'מס שנוכה']],
  'business.profit': [['profit', 'רווח'], ['turnover', 'מחזור ללא מע״מ'], ['customerWithholding', 'ניכוי במקור מלקוחות']],
  'capital.amounts': [['interest', 'ריבית'], ['dividend', 'דיבידנד'], ['gains', 'רווח הון'], ['withheld', 'מס שנוכה']],
  'savings.selfAmounts': [['pension', 'פנסיה כעצמאי'], ['studyFund', 'קרן השתלמות']],
  // 12.10.2026 · סיכום לכל מקור בחו״ל (פירוט המכירות — ב-1325)
  'foreign.amounts': [['dividendGross', 'דיבידנד ברוטו'], ['interest', 'ריבית'], ['foreignTax', 'מס זר'], ['proceeds', 'תמורת מכירות'], ['cost', 'עלות']],
};

function OfficeLine({ s, client, evidence, facts, busy, purpose, year, cutoff, asOf, stepId, run, applyCard }: {
  s: ItemStatus; client: Client; evidence: Evidence[]; facts: api.YearData['facts']; busy: boolean; purpose: Purpose; year: number; cutoff?: number; asOf?: string; stepId: string;
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>; applyCard: ApplyCard;
}) {
  const [val, setVal] = useState('');
  const docs = evidence.filter(e => e.review === 'accepted' && (e.entityRef ?? null) === (s.entityRef ?? null));
  const [ev, setEv] = useState(docs[0]?.id ?? '');
  const isAmount = s.item.kind === 'amount';
  const isYesNo = s.item.kind === 'screener';
  const parts = isAmount ? AMOUNT_PARTS[s.item.key] : undefined;
  const [pv, setPv] = useState<Record<string, string>>({});
  const partsValue = () => Object.fromEntries((parts ?? []).filter(([k]) => (pv[k] ?? '').trim() !== '').map(([k]) => [k, Number(pv[k])]));
  const basis: FactBasis = docs.length ? 'final' : purpose === 'estimate' && (cutoff ?? 12) < 12 ? 'actual_to_date' : 'actual';
  const m = cutoff ?? 12;
  const save = (answer: 'value' | 'no' | 'zero', value?: unknown) => run(() => api.recordFact(client.id, {
    taxYear: year, itemKey: s.item.key, subjectRole: s.subjectRole, entityKind: s.entityKind, entityRef: s.entityRef === 'new' ? undefined : s.entityRef,
    // הצהרת הון / קליטה: «נכון ליום ההצהרה / הקליטה»
    ...(purpose === 'wealth' || purpose === 'intake' ? { periodKind: 'as_of', periodTo: asOf } : {
    periodKind: basis === 'actual_to_date' ? 'months' : 'year', periodFrom: `${year}-01-01`,
    periodTo: basis === 'actual_to_date' ? `${year}-${String(m).padStart(2, '0')}-${new Date(year, m, 0).getDate()}` : `${year}-12-31` }),
    answer, value, basis, evidenceId: ev || undefined, requestId: stepId,
  } as never), 'נשמר');
  // ‼ 16.10.2026 · פריסת דמי לידה — הצעת חלוקה לפי ימים והחלטה שנשמרת לשתי השנים
  if (s.item.key === 'niBenefits.maternitySpread') return <MaternitySpreadLine s={s} client={client} facts={facts} year={year} stepId={stepId} busy={busy} run={run} />;
  const task = s.officeTask;
  const title = <b>{s.item.label}{target(s, client) ? ` · ${target(s, client)}` : ''}</b>;
  // ── 236 · משימות אחרי אישור: עדכון הכרטיס / הוספת ישות / «עודכן בתיק» / יישור קו ──
  if (task?.kind === 'cardFlag' || task?.kind === 'cardChoice') return (
    <div className="ty-row">
      <div className="ty-main">{title}<small>{s.officeAction}. בכרטיס היום: {fmtCard((client as unknown as Record<string, unknown>)[task.field])} · אחרי העדכון: {fmtCard(task.value)}</small></div>
      <div className="ty-side">
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void run(() => applyCard([cardFieldProposal(client, task.field, task.value, { factId: task.factId, itemKey: s.item.key })], `tax_year_fact:${task.factId}`), 'עודכן בתיק המס — עם המקור (התשובה בקליטה) והערך הקודם')}>עדכן בתיק</button>
      </div>
    </div>
  );
  if (task?.kind === 'addEntity') {
    const kind = NEW_ENTITY_ITEMS[s.item.key];
    return (
      <div className="ty-row">
        <div className="ty-main">{title}<small>{s.officeAction}</small>
          {kind && <EntityForm kind={kind} subjectRole={s.ownerRole ?? s.subjectRole} hint={task.text} busy={busy} submitLabel="הוסף לתיק"
            onSubmit={e => void run(() => applyCard([newEntityProposal(client, kind, e, { factId: task.factId, itemKey: s.item.key, year }, task.entityRef)], `tax_year_fact:${task.factId}`), 'נוסף לתיק המס עם אותו מזהה — המסמכים שכבר הועלו עליו נשארים משויכים')} />}
        </div>
      </div>
    );
  }
  if (task?.kind === 'cardEdit') return (
    <div className="ty-row">
      <div className="ty-main">{title}<small>{s.officeAction}. העריכה עצמה — בתיק המס (הכרטיס), ואז לסמן כאן.</small></div>
      <div className="ty-side">
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(() => api.recordFact(client.id, {
          taxYear: year, itemKey: s.item.key, subjectRole: s.subjectRole, entityKind: s.entityKind, entityRef: s.entityRef,
          ...(purpose === 'wealth' || purpose === 'intake' ? { periodKind: 'as_of', periodTo: asOf } : { periodKind: 'year', periodFrom: `${year}-01-01`, periodTo: `${year}-12-31` }),
          answer: 'value', value: { cardUpdated: true, note: task.text }, basis: 'actual', requestId: stepId, note: 'עודכן בתיק בידי המשרד',
        } as never), 'סומן «עודכן בתיק» — נשמר מי ומתי')}>עודכן בתיק</button>
      </div>
    </div>
  );
  if (task?.kind === 'officeCheck') return (
    <div className="ty-row">
      <div className="ty-main">{title}<small>{s.item.why} · {s.item.officeNext}</small></div>
      <div className="ty-side">
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void save('value', { done: true, at: new Date().toISOString().slice(0, 10) })}>בוצע</button>
      </div>
    </div>
  );
  // ‼ פעולה מחוץ לשאלון (עדכון הכרטיס): אין כאן «כן/לא» — התשובה כבר אושרה; הפריט נעלם כשהכרטיס מתעדכן.
  if (s.officeAction) return (
    <div className="ty-row">
      <div className="ty-main">
        <b>{s.item.label}{target(s, client) ? ` · ${target(s, client)}` : ''}</b>
        <small>{s.officeAction}. בכרטיס הלקוח: שנת הסיום וסוג התואר, שנת השחרור, או יישוב המגורים.</small>
      </div>
    </div>
  );
  return (
    <div className="ty-row">
      <div className="ty-main">
        <b>{s.item.label}{target(s, client) ? ` · ${target(s, client)}` : ''}</b>
        <small>{s.detail}{docs.length ? '' : s.item.kind === 'amount' ? ' · אין מסמך מאושר — יישמר כ«בפועל» בלי אסמכתה' : ''}</small>
        <div className="ty-inline">
          {isYesNo ? (
            <>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void save('value', true)}>כן</button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void save('no')}>לא</button>
            </>
          ) : parts ? (
            <>
              {parts.map(([k, label]) => <input key={k} aria-label={label} type="number" inputMode="decimal" placeholder={`${label} ₪`} value={pv[k] ?? ''} onChange={e => setPv(v => ({ ...v, [k]: e.target.value }))} />)}
              {docs.length > 0 && <select aria-label="מסמך" value={ev} onChange={e => setEv(e.target.value)}>{docs.map(d => <option key={d.id} value={d.id}>{DOCS[d.docKind].label}</option>)}<option value="">בלי מסמך</option></select>}
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || Object.keys(partsValue()).length === 0}
                onClick={() => { const v = partsValue(); void save(Object.values(v).every(x => x === 0) ? 'zero' : 'value', v); }}>שמור</button>
            </>
          ) : (
            <>
              <input aria-label={s.item.label} type={isAmount ? 'number' : 'text'} inputMode={isAmount ? 'decimal' : undefined} placeholder={isAmount ? 'סכום ₪' : 'פירוט'} value={val} onChange={e => setVal(e.target.value)} />
              {docs.length > 0 && <select aria-label="מסמך" value={ev} onChange={e => setEv(e.target.value)}>{docs.map(d => <option key={d.id} value={d.id}>{DOCS[d.docKind].label}</option>)}<option value="">בלי מסמך</option></select>}
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || !val.trim()} onClick={() => void save(isAmount && Number(val) === 0 ? 'zero' : 'value', isAmount ? Number(val) : val.trim())}>שמור</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── פירוט ────────────────────────────────────────────────────────────────────
function groupByArea(list: ItemStatus[]): [AreaId, ItemStatus[]][] {
  const m = new Map<AreaId, ItemStatus[]>();
  for (const s of list) m.set(s.area, [...(m.get(s.area) ?? []), s]);
  return AREAS.map(a => a.id).filter(id => m.has(id)).map(id => [id, m.get(id)!]);
}

function Details({ client, statuses, evidence, purpose, legacy, facts, busy, onMark, tree }: { client: Client; statuses: ItemStatus[]; evidence: Evidence[]; purpose: Purpose; legacy: boolean;
  facts: api.YearData['facts']; busy: boolean; onMark: (key: string, yes: boolean) => Promise<boolean>;
  /** 16.10.2026 · בשורת הבקשה: עץ אחד לפי תחום (נענה / חסר / מסמך הגיע / לבדיקת משרד) במקום «מה ידוע» + «מה חסר». */
  tree?: boolean }) {
  const known = statuses.filter(s => s.state === 'known' || s.state === 'partial');
  const missing = statuses.filter(s => !['known', 'partial', 'notApplicable'].includes(s.state));
  const special = ITEMS.filter(i => i.area === 'special' && i.rare);
  const blocked = statuses.filter(s => s.item.calcBlockedBy && s.state !== 'notApplicable');
  const qt = tree ? buildQuestionTree(statuses) : null;
  return (
    <div>
      {qt && (
        <div className="ty-tree" data-q-tree>
          <p className="ty-tree-sum">{countsLine(qt.totals) || 'אין פריטים פתוחים'}{qt.notApplicable ? ` · ${qt.notApplicable} לא חלים` : ''}</p>
          {qt.areas.map(a => (
            <details key={a.area} className="ty-details" open={a.needsOffice} data-q-area={a.area}>
              <summary><b>{AREA_BY_ID[a.area].title}</b><span>{countsLine(a.counts)}</span></summary>
              <div className="ty-details-body"><div className="ty-rows">{a.items.map(({ status: s, mark }, i) => (
                <div key={i} className="ty-row" data-q-mark={mark}><div className="ty-main"><b>{s.item.label}{target(s, client) ? ` · ${target(s, client)}` : ''}</b>
                  <small>{mark === 'answered' ? (s.facts.filter(f => f.status === 'accepted').map(f => describeValue(f)).join(' · ') || s.detail) : `${who(s)} · ${s.detail}`}</small></div>
                  <div className="ty-side">{mark === 'answered' && <span className={`ty-chip ${provenanceOf(s, client).tone}`} title="מקור המידע">{provenanceOf(s, client).label}</span>}
                    <span className={`ty-chip ${TREE_MARK[mark].tone}`}>{TREE_MARK[mark].label}</span></div></div>))}</div></div>
            </details>
          ))}
        </div>
      )}
      {!qt && <>
      <details className="ty-details">
        <summary><b>מה ידוע</b><span>{known.length} פריטים</span></summary>
        <div className="ty-details-body">{groupByArea(known).map(([area, list]) => (
          <div key={area} className="ty-area"><h4>{AREA_BY_ID[area].title}</h4><div className="ty-rows">{list.map((s, i) => (
            <div key={i} className="ty-row"><div className="ty-main"><b>{s.item.label}{target(s, client) ? ` · ${target(s, client)}` : ''}</b>
              <small>{s.facts.filter(f => f.status === 'accepted').map(f => describeValue(f)).join(' · ') || s.detail} · {s.detail}</small></div>
              <div className="ty-side"><span className={`ty-chip ${provenanceOf(s, client).tone}`} title="מקור המידע">{provenanceOf(s, client).label}</span><span className={`ty-chip ${STATE_CHIP[s.state].tone}`}>{STATE_CHIP[s.state].label}</span></div></div>))}</div></div>))}
          {known.length > 0 && <p className="ty-note">«נמסר בידי הלקוח» הוא הצהרה שהמשרד אישר — לא אימות ברשות. «אומת במסמך» — מסמך מאושר. «נבדק ברשות» — ערך שנקרא ביישור קו או בבדיקה אוטומטית.</p>}
          {known.length === 0 && <p className="ty-note">עוד אין עובדות מאושרות לשנה.</p>}
        </div>
      </details>
      <details className="ty-details">
        <summary><b>מה חסר ומי משלים</b><span>{missing.length} פריטים</span></summary>
        <div className="ty-details-body">{groupByArea(missing).map(([area, list]) => (
          <div key={area} className="ty-area"><h4>{AREA_BY_ID[area].title}</h4><div className="ty-rows">{list.map((s, i) => (
            <div key={i} className="ty-row"><div className="ty-main"><b>{s.item.label}{target(s, client) ? ` · ${target(s, client)}` : ''}</b><small>{who(s)} · {s.detail}</small></div>
              <div className="ty-side"><span className={`ty-chip ${STATE_CHIP[s.state].tone}`}>{STATE_CHIP[s.state].label}</span></div></div>))}</div></div>))}
        </div>
      </details>
      </>}
      <details className="ty-details">
        <summary><b>מסמכים</b><span>{evidence.length} התקבלו</span></summary>
        <div className="ty-details-body"><div className="ty-rows">{evidence.map(e => (
          <div key={e.id} className="ty-row"><div className="ty-main"><b>{DOCS[e.docKind]?.label} · {e.fileName}</b>
            <small>התקבל {formatDate(e.receivedAt)} · של הלקוח: {e.identityMatch === 'match' ? 'כן' : e.identityMatch === 'mismatch' ? 'לא' : 'לא נבדק'} · לשנה: {e.periodMatch === 'match' ? 'כן' : e.periodMatch === 'mismatch' ? 'לא' : 'לא נבדק'}</small></div>
            <div className="ty-side"><span className={`ty-chip ${e.review === 'accepted' ? 'green' : e.review === 'rejected' ? 'red' : 'violet'}`}>{e.review === 'accepted' ? 'אושר' : e.review === 'rejected' ? 'נדחה' : 'ממתין לבדיקה'}</span></div></div>))}
          {evidence.length === 0 && <p className="ty-note">עוד לא התקבלו מסמכים לשנה.</p>}</div></div>
      </details>
      {blocked.length > 0 && (
        <details className="ty-details">
          <summary><b>חישובים שחסומים עד הכרעה</b><span>האיסוף ממשיך</span></summary>
          <div className="ty-details-body"><p className="ty-note">פנסיה מגיל 50 והשלמת מקדמות לחודשים שעברו — לא מחושבים עד שתתקבל הכרעה מקצועית (ראו «פריטים פתוחים» בידע המקצועי). המידע שהם צריכים נאסף כרגיל.</p></div>
        </details>
      )}
      <details className="ty-details">
        <summary><b>מצבים מיוחדים</b><span>נבדקים במשרד; ללקוח רק מה שסומן</span></summary>
        <div className="ty-details-body"><div className="ty-rows">{special.map(i => {
            const f = facts.filter(x => x.itemKey === i.key && (x.status === 'accepted' || x.status === 'pending')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            return (
              <div key={i.key} className="ty-row"><div className="ty-main"><b>{i.label}</b><small>{i.question ? 'אם חל — אפשר לשאול את הלקוח' : 'המשרד בלבד'}</small></div>
                <div className="ty-side">{f ? <span className={`ty-chip ${f.answer === 'no' ? '' : 'amber'}`}>{f.answer === 'no' ? 'לא חל' : 'חל'}</span> : (
                  <><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void onMark(i.key, true)}>חל</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void onMark(i.key, false)}>לא חל</button></>)}</div></div>);
          })}</div>
          <p className="ty-note">נבדק במשרד. ללקוח עוברת שאלה רק על מה שסומן «חל» ויש בו מה לשאול.</p></div>
      </details>
      {legacy && purpose === 'annual' && (
        <details className="ty-details">
          <summary><b>השאלון הקודם לשנה זו</b><span>קישור שנשלח לפני המעבר</span></summary>
          <div className="ty-details-body"><p className="ty-note">הקישור ממשיך לעבוד. התשובות נקלטות לשנה הזו כממתינות לבדיקה, ולא נכתבות לכרטיס. תשובה שסותרת את הדף האישי מוצגת לבדיקה ולא נדרסת.</p></div>
        </details>
      )}
    </div>
  );
}


const fmtCard = (v: unknown) => (typeof v === 'boolean' ? (v ? 'כן' : 'לא') : v == null || v === '' ? '—'
  : ({ single: 'רווק/ה', married: 'נשוי/אה', divorced: 'גרוש/ה', widowed: 'אלמן/ה', singleParent: 'הורה יחיד/ה' } as Record<string, string>)[String(v)] ?? String(v));

/**
 * ‼ #7 · מקור המידע — כדי שלא תוצג תשובת שאלון כאימות ברשות. סדר: מסמך מאושר → נבדק ברשות (יישור קו / בדיקה
 *   אוטומטית, לפי field_meta של הכרטיס) → משרד → «נמסר בידי הלקוח» (תשובה שאושרה) → מהכרטיס.
 */
function provenanceOf(s: ItemStatus, client: Client): { label: string; tone: string } {
  const acc = s.facts.filter(f => f.status === 'accepted');
  if (s.reusedEvidence || s.evidence.some(e => e.review === 'accepted') || acc.some(f => !!f.evidenceId || f.source === 'document')) return { label: 'אומת במסמך', tone: 'green' };
  const meta = (client.fieldMeta ?? {}) as Record<string, { source?: string } | undefined>;
  const auth = (s.item.cardKeys ?? []).some(k => ['institution_alignment', 'automation', 'shaam', 'authority'].includes(String(meta[k]?.source ?? '')));
  if (auth && !acc.some(f => f.clientAssertion === 'changed')) return { label: 'נבדק ברשות', tone: 'green' };
  if (acc.some(f => f.source === 'office')) return { label: 'המשרד', tone: 'blue' };
  if (acc.some(f => f.source === 'portal' || f.source === 'legacy_questionnaire')) return { label: 'נמסר בידי הלקוח', tone: 'amber' };
  if (acc.some(f => f.source === 'card_migration')) return { label: 'מהכרטיס', tone: '' };
  return { label: 'מהכרטיס', tone: '' };
}

/**
 * טופס קצר להוספת ישות לתיק מתוך תשובה — ממולא מראש מהמילים של הלקוח. ‼ המשרד מקליד את מה שנכנס לכרטיס;
 * הטקסט של הלקוח מוצג לצד, לא מועתק בעיוורון.
 */
function EntityForm({ kind, subjectRole, hint, busy, submitLabel, onSubmit }: {
  kind: Exclude<CardEntityKind, 'businesses'>; subjectRole: string; hint?: string; busy: boolean; submitLabel: string;
  onSubmit: (entity: Record<string, unknown>) => void;
}) {
  const first = (hint ?? '').split(/[,\n·]/)[0]?.trim() ?? '';
  const [a, setA] = useState(first);
  const [b, setB] = useState('');
  const [rented, setRented] = useState(true);
  const [fk, setFk] = useState<PensionFundKind>('new_pension');
  const L: Record<typeof kind, [string, string?]> = {
    employers: ['שם המעסיק', 'תאריך התחלה (לא חובה)'], properties: ['כתובת', 'עיר'], investmentAccounts: ['בנק / בית השקעות'],
    foreignAccounts: ['הגוף (בנק, ברוקר)', 'מדינה'], pensionFunds: ['החברה המנהלת'],
  };
  const build = (): Record<string, unknown> => {
    const x = a.trim(), y = b.trim();
    switch (kind) {
      case 'employers': return { name: x, ...(y && /^\d{4}-\d{2}-\d{2}$/.test(y) ? { startDate: y } : {}), belongsToSpouse: subjectRole === 'spouse' };
      case 'properties': return { address: x, city: y || undefined, isRented: rented };
      case 'investmentAccounts': return { institutionName: x };
      case 'foreignAccounts': return { institutionName: x, country: y || undefined };
      case 'pensionFunds': return { institutionName: x, kind: fk, hasSelfDeposits: true };
    }
  };
  return (
    <div className="ty-inline" role="group" aria-label="הוספה לתיק">
      {hint && <small style={{ flexBasis: '100%' }}>הלקוח כתב: «{hint}»</small>}
      <input aria-label={L[kind][0]} placeholder={L[kind][0]} value={a} onChange={e => setA(e.target.value)} />
      {L[kind][1] && <input aria-label={L[kind][1]} placeholder={L[kind][1]} value={b} onChange={e => setB(e.target.value)} />}
      {kind === 'properties' && <label className="ty-check"><input type="checkbox" checked={rented} onChange={e => setRented(e.target.checked)} /> מושכר</label>}
      {kind === 'pensionFunds' && <select aria-label="סוג הקופה" value={fk} onChange={e => setFk(e.target.value as PensionFundKind)}>{Object.entries(PENSION_FUND_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      <button type="button" className="btn btn-sm btn-primary" disabled={busy || !a.trim()} onClick={() => onSubmit(build())}>{submitLabel}</button>
    </div>
  );
}

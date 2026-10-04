// ─── המסלולים שרצים אצל הלקוח — שורה לכל ריצה, מתחת לבקשות ────────────────────
// ‼ סבב 3 (DESIGN-FLOWS-R3 §5): הבקשות קודם. כאן שורה אחת לכל ריצה — «דוח שנתי
// 2026 · איסוף — 2 ממתינים לדוד · הבא: אישור הלקוח». הפתיחה מראה את סדר הביצוע
// (רגעים, «במקביל»), מה מגיע ללקוח בכל שלב, פעולות מול רשות, עצירה/חידוש/ביטול,
// עדכון לגרסה חדשה והצעות. גרסה ו«עודכן» — סימן קטן בתוך השורה, לא באנר.
// כל החלטה (מה נפתח, מה נמסר, אם פעולה רצה לבד) בשרת — המסך שואל ומציג.
//
// ‼ ארבעה פעלים נפרדים, גם בניסוח: פתיחה (הבקשה קיימת) · פרסום (מופיע בדף) ·
// מייל (מרוכז, רק מה שחדש) · פעולה מול רשות. עצירה/ביטול אומרים בדיוק מה
// קורה לכל אחד מהם — לפני הלחיצה.
// ‼ «נעצר» / «חודש» / «בוטל» נאמרים רק אחרי שהשורה שנטענה מחדש מראה את זה —
// לא מהלחיצה. תשובת «בסדר» שלא שינתה כלום הייתה מראה «נעצר» על שורה פעילה.

import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import {
  RUN_STATUS_LABELS,
  addFlowItems, applyUpgrade, attachStepToStage, cancelFlowRun, loadOfficeFlows, loadSuggestions, pauseFlowRun, previewUpgrade,
  ITEM_CHANGE_TEXT, STAGE_CHANGE_TEXT, reattachOnboardingFlow, resumeFlowRun, serverErrorText, skipReasonText,
  type ClientFlowRun, type RunActionState, type RunStage, type RunSuggestion, type UpgradePreview,
} from '../../features/flows/api';
import type { RunStatus } from '../../features/flows/types';
import { STEP_TYPE_LABELS, type OnboardingStep, type OnboardingStepType } from '../../types/onboarding';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import { useFlowItemTitles, useFlowLibrary } from '../../hooks/useClientFlowRuns';
import { spouseAddText, suggestionPersonalConfirm } from './builder/model';
import { REPEATABLE_STEP_TYPES } from '../../features/flows/compile';
import { formatDate } from '../../utils/dateFormat';
import {
  actionStatus, attachLines, endedRunText, endedStageText, heldByAddedText, lateCandidates, materializedSummary, nextStageKeys, previousRunText, rowCounts,
  runAutoPermitted, runLine, runMoments, runTitle, stageClientLine, stagePassesThrough, stageStuckLine, stageWho, stagesHeldBy,
  type LateCandidate, type RowBucket, type RunNames,
} from './runSummary';
import './clientFlows.css';

interface Props {
  clientId: string;
  /** שם פרטי של בעל הכרטיס — «2 ממתינים לשרון», «יופיע בדף של שרון». */
  firstName: string;
  runs: ClientFlowRun[];
  loading: boolean;
  /** הבקשות של הלקוח — לשם הפריט ש«אחריו» שלב נפתח, לצירוף לשלב ולהצעות «אין צורך». */
  steps: OnboardingStep[];
  /** יש קליטה פתוחה — רק אז יש למה להצמיד את מסלול הקליטה. */
  onboardingOpen: boolean;
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  /** אחרי כל פעולה: בקשות, המגש והמסלולים נטענים מחדש. */
  onChanged: () => void;
  /** פעולה מול רשות שממתינה לך — מבצעים אותה מתיק המס. */
  onOpenTaxFile?: () => void;
  /** «לפרטי המסלול» מהמגש — פותח את השורה של הריצה וגולל אליה. */
  focus?: { runId: string; n: number } | null;
  /**
   * השורה שבה הבקשה מוצגת ברשימה (שרשרת מקופלת ⇒ הראשית) ואצל מי השורה הזאת —
   * כדי ש«2 ממתינים לדוד» יתאים לשורות שמעל. בלי — סופרים כמו השרת.
   */
  rowOf?: (s: OnboardingStep) => OnboardingStep;
  bucketOf?: (row: OnboardingStep) => RowBucket;
  /** שלב שמחכה לסוג העוסק — «לקביעת סוג העוסק» פותח את תיק המס על השדה. */
  onOpenKindField?: () => void;
}

const stepTitle = (s: Pick<OnboardingStep, 'stepType' | 'payload'>) =>
  String(s.payload?.title ?? '').trim() || String(s.payload?.clientTitle ?? '').trim()
  || STEP_TYPE_LABELS[s.stepType as OnboardingStepType] || s.stepType;

// ‼ materializedSummary עבר ל-runSummary.ts (טהור — נבדק בלי דפדפן); מיוצא מכאן גם בשביל קוראים ישנים.
export { materializedSummary };

const Chev = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
);

type ConfirmKind = 'pause' | 'resume' | 'cancel';
/** משפט על השורה אחרי פעולה — ירוק כשהשורה מאשרת, ענבר כשלא. */
interface RunNote { text: string; warn?: boolean }
/** פעולה שהשרת אישר — מחכים שהשורה שנטענה מחדש תראה אותה לפני שאומרים «בוצע». */
interface Pending { runId: string; expect: RunStatus; ok: string; seenLoading: boolean }

const KIND_EXPECT: Record<ConfirmKind, RunStatus> = { pause: 'paused', resume: 'active', cancel: 'cancelled' };

export default function ClientFlowStrip({
  clientId, firstName, runs, loading, steps, onboardingOpen, advance, onChanged, onOpenTaxFile, focus, rowOf, bucketOf, onOpenKindField,
}: Props) {
  const live = runs.filter(r => r.status === 'active' || r.status === 'paused');
  const ended = runs.filter(r => r.status === 'done' || r.status === 'cancelled');
  // ‼ קליטה שנוצרה לפני 216 (או שהחיבור נכשל) — בלי ריצה, השלבים והמיילים
  // האוטומטיים שלה לא עובדים. מציעים להצמיד, בשקט, ורק כשבאמת יש מה להצמיד.
  const needsReattach = !loading && onboardingOpen && steps.length > 0
    && !runs.some(r => r.trigger === 'quote_approved');
  const [reattach, setReattach] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const [openId, setOpenId] = useState<string | null>(null);
  const [endedOpen, setEndedOpen] = useState(false);
  // ‼ החלון ותוצאת הפעולה חיים כאן, לא בשורה: ביטול מוריד את השורה מהרשימה, ואיתה
  // נעלמו גם «נשארו פתוחות…» וגם האישור — המשרד לא ידע מה נשאר.
  const [confirm, setConfirm] = useState<{ run: ClientFlowRun; kind: ConfirmKind } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notes, setNotes] = useState<Record<string, RunNote>>({});
  const note = (runId: string, n: RunNote | null) => setNotes(cur => {
    const next = { ...cur };
    if (n) next[runId] = n; else delete next[runId];
    return next;
  });

  useEffect(() => {
    if (!focus) return;
    setOpenId(focus.runId);
    const t = window.setTimeout(() => {
      document.getElementById(`cf-run-${focus.runId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 30);
    return () => window.clearTimeout(t);
  }, [focus]);

  // אישור רק מהשורה שנטענה מחדש. לא הגיעה תוך כמה שניות / נטענה בלי השינוי ⇒ אומרים את זה.
  useEffect(() => {
    if (!pending) return;
    const now = runs.find(r => r.id === pending.runId);
    // ‼ עצירה: השורה עצמה אומרת «בעצירה», והתיבה בפתיחה — המשפט המלא; הודעה ירוקה שלישית לא נוספת (ok ריק).
    if (now?.status === pending.expect) { if (pending.ok) note(pending.runId, { text: pending.ok }); setPending(null); return; }
    const mismatch = () => {
      note(pending.runId, {
        warn: true,
        text: `השרת קיבל את הבקשה, אבל המסלול עדיין מוצג «${RUN_STATUS_LABELS[now?.status ?? 'active']}». רעננו את הדף כדי לראות את המצב האמיתי.`,
      });
      setPending(null);
    };
    if (loading && !pending.seenLoading) { setPending({ ...pending, seenLoading: true }); return; }
    if (!loading && pending.seenLoading) { mismatch(); return; }
    const t = window.setTimeout(mismatch, 6000);
    return () => window.clearTimeout(t);
  }, [pending, runs, loading]);

  // משפט אחרי פעולה — נשאר כמה שניות; אזהרה נשארת עד הפעולה הבאה.
  useEffect(() => {
    const ok = Object.entries(notes).filter(([, n]) => !n.warn);
    if (ok.length === 0) return;
    const t = window.setTimeout(() => setNotes(cur => Object.fromEntries(Object.entries(cur).filter(([, n]) => n.warn))), 9000);
    return () => window.clearTimeout(t);
  }, [notes]);

  // ריצה שהסתיימה של מסלול שרץ עכשיו — בתוך הפתיחה שלו; השאר — בשורה שקטה בסוף.
  const otherEnded = ended.filter(e => !live.some(l => l.flowId === e.flowId));
  // הודעה על ריצה שכבר לא בשורות (בוטלה) — מתחת לשורות, כדי שלא תיעלם איתה.
  const strayNotes = Object.entries(notes).filter(([id]) => !live.some(r => r.id === id));

  if (live.length === 0 && ended.length === 0 && !needsReattach && strayNotes.length === 0 && !confirm) return null;

  async function doReattach() {
    setReattach({ busy: true, msg: null });
    const r = await reattachOnboardingFlow(clientId);
    if (r.ok === false || r.skipped) {
      setReattach({ busy: false, msg: r.error === 'no_onboarding' || r.skipped === 'not_onboarding'
        ? 'אין קליטה פתוחה להצמיד אליה.' : serverErrorText(r.error, 'ההצמדה לא הצליחה — אפשר לנסות שוב') + '.' });
      return;
    }
    setReattach({ busy: false, msg: r.matched != null ? `הוצמד · ${r.matched} בקשות שויכו לשלבים` : 'הוצמד' });
    onChanged();
  }

  return (
    <section className="cf" aria-label="מסלולים">
      {live.length > 0 && (
        <div className="cf-head">
          <span className="cf-head-title">{live.length === 1 ? 'מסלול' : 'מסלולים'}</span>
          <span className="cf-head-hint">מה פתוח עכשיו ומה הבא · לחיצה לפרטים</span>
        </div>
      )}
      {live.length > 0 && (
        <div className="cf-lines">
          {live.map(run => (
            <RunRow key={run.id} run={run} open={openId === run.id}
              onToggle={() => setOpenId(id => (id === run.id ? null : run.id))}
              firstName={firstName} steps={steps} endedSame={ended.filter(e => e.flowId === run.flowId)}
              note={notes[run.id] ?? null} onNote={n => note(run.id, n)}
              onConfirm={kind => { note(run.id, null); setConfirm({ run, kind }); }}
              rowOf={rowOf} bucketOf={bucketOf}
              advance={advance} onChanged={onChanged} onOpenTaxFile={onOpenTaxFile} onOpenKindField={onOpenKindField} />
          ))}
        </div>
      )}
      {strayNotes.map(([id, n]) => (
        <div key={id} className={`cf-flash${n.warn ? ' is-warn' : ''}`} role="status">{n.warn ? '⚠' : '✓'} {n.text}</div>
      ))}
      {needsReattach && (
        <div className="cf-quiet">
          <span>מסלול הקליטה לא מחובר ללקוח הזה — בלי זה השלבים והתזכורות שלו לא פועלים.</span>
          <button type="button" className="cf-link" disabled={reattach.busy} onClick={() => void doReattach()}>
            {reattach.busy ? 'מצמיד…' : 'הצמד'}
          </button>
          {reattach.msg && <span role="status">{reattach.msg}</span>}
        </div>
      )}
      {otherEnded.length > 0 && (
        <div className="cf-ended">
          <button type="button" className="cf-link cf-ended-toggle" aria-expanded={endedOpen} onClick={() => setEndedOpen(v => !v)}>
            {live.length === 0 ? 'מסלולים שהסתיימו' : 'הסתיימו'} · {otherEnded.length}
            <Chev />
          </button>
          {endedOpen && otherEnded.map(run => <EndedRun key={run.id} run={run} />)}
        </div>
      )}

      {confirm && (
        <RunConfirm run={confirm.run} kind={confirm.kind} firstName={firstName}
          onClose={() => setConfirm(null)} onDone={onChanged}
          onAccepted={ok => setPending({ runId: confirm.run.id, expect: KIND_EXPECT[confirm.kind], ok, seenLoading: false })} />
      )}
    </section>
  );
}

// ── ריצה פעילה / בעצירה — שורה אחת, והפירוט בפתיחה ──────────────────────────
function RunRow({ run: rawRun, open, onToggle, firstName, steps, endedSame, note, onNote, onConfirm, rowOf, bucketOf, advance, onChanged, onOpenTaxFile, onOpenKindField }: {
  run: ClientFlowRun; open: boolean; onToggle: () => void; firstName: string; steps: OnboardingStep[];
  endedSame: ClientFlowRun[]; note: RunNote | null; onNote: (n: RunNote | null) => void; onConfirm: (kind: ConfirmKind) => void;
  rowOf?: Props['rowOf']; bucketOf?: Props['bucketOf'];
  advance: Props['advance']; onChanged: () => void; onOpenTaxFile?: () => void; onOpenKindField?: () => void;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [attachFor, setAttachFor] = useState<RunStage | null>(null);
  // ‼ בקשה שצורפה זה עתה — יורדת מהרשימה מיד, גם לפני שהשרת ענה ברענון.
  const [attached, setAttached] = useState<Set<string>>(new Set());
  const paused = rawRun.status === 'paused';

  // ‼ «אצל מי» בשלבים הפתוחים — לפי השורות שברשימה מעל (שרשרת מקופלת = שורה אחת).
  const run = useMemo<ClientFlowRun>(() => {
    if (!rowOf || !bucketOf) return rawRun;
    return {
      ...rawRun,
      stages: rawRun.stages.map(st => (st.state !== 'open' ? st
        : { ...st, counts: rowCounts(rawRun.id, st.key, steps, rowOf, bucketOf, st.counts) ?? st.counts })),
    };
  }, [rawRun, steps, rowOf, bucketOf]);

  const names = useMemo<RunNames>(() => {
    // ‼ בקשת מערכת בקליטה — מפתח הפריט הוא סוג הבקשה; גם בקשה שלא שויכה מזוהה לפיו.
    // ‼ שורה «לא נוצרה» יושבת על אותו מפתח פריט — השם הוא של הפריט, לא «לא נוצרה — …».
    const problemOf = (x: OnboardingStep) => (x.payload as { creationProblem?: { itemTitle?: string } } | undefined)?.creationProblem;
    const ofItem = (k: string) => steps.find(x => x.flowRunId === run.id && x.flowItemKey === k && !problemOf(x))
      ?? steps.find(x => x.stepType === k && x.status !== 'cancelled' && !problemOf(x))
      ?? steps.find(x => x.flowRunId === run.id && x.flowItemKey === k);
    return {
      stage: k => run.stages.find(s => s.key === k)?.name ?? 'שלב קודם',
      item: k => {
        const s = ofItem(k);
        if (!s) return 'בקשה קודמת';
        return problemOf(s)?.itemTitle?.trim() || stepTitle(s);
      },
      itemStage: k => {
        const s = ofItem(k);
        return s?.flowRunId === run.id ? (s.flowStageKey ?? undefined) : undefined;
      },
    };
  }, [run, steps]);
  const candidates = useMemo(() => lateCandidates(steps, run, REPEATABLE_STEP_TYPES, stepTitle)
    .filter(c => !attached.has(c.id)), [steps, run, attached]);
  const hasOpenStage = run.stages.some(s => s.state === 'open');
  const line = runLine(run, firstName, names, hasOpenStage ? candidates.length : 0);
  const moments = useMemo(() => runMoments(run, names), [run, names]);
  // ‼ «ללקוח:» רק בשלב הפתוח ובבא אחריו — לא משפט הגדרה על כל שלב (B2).
  const nextKeys = useMemo(() => nextStageKeys(run, names), [run, names]);
  const permitted = runAutoPermitted(run);

  return (
    <div id={`cf-run-${run.id}`} className={`cf-run is-${line.tone}${open ? ' is-open' : ''}`}>
      <span className="cf-dot" aria-hidden="true" />
      <div className="cf-main">
        <div className="cf-line">
          <button type="button" className="cf-hit" aria-expanded={open} onClick={onToggle}
            title={[line.title, line.where, line.next, ...line.marks.map(m => m.full)].filter(Boolean).join(' · ')}>
            {/* ‼ שתי «שורות»: במחשב זורמות כשורה אחת; בטלפון — שם+סימנים קצרים, ואז שלב·אצל מי·הבא. */}
            <span className="cf-row1">
              <span className="cf-name">{line.title}</span>
              {line.marks.map(m => (
                <span key={m.full} className="cf-mark">
                  <span className="cf-mark-full">{m.full}</span>
                  <span className="cf-mark-short" aria-hidden="true">{m.short}</span>
                </span>
              ))}
            </span>
            <span className="cf-row2">
              <span className="cf-where">{line.stage && <span className="cf-stg">{line.stage} — </span>}{line.who}</span>
              {line.next && <span className="cf-next">{line.next}</span>}
            </span>
          </button>
          <button type="button" className="rl-chev cf-chev" aria-expanded={open}
            aria-label={open ? `סגירת הפרטים של «${line.title}»` : `פתיחת הפרטים של «${line.title}»`} onClick={onToggle}>
            <Chev />
          </button>
        </div>
        {note && <div className={`cf-flash${note.warn ? ' is-warn' : ''}`} role="status">{note.warn ? '⚠' : '✓'} {note.text}</div>}

        {open && (
          <div className="cf-body">
            {paused && (
              <div className="cf-callout is-paused">
                <span>
                  בעצירה{run.pausedAt ? ` מ-${formatDate(run.pausedAt, 'list')}` : ''}: שום שלב לא נפתח, ומיילים ותזכורות לא יוצאים לבד — ללקוח ולגורם חיצוני
                  {run.trigger === 'quote_approved' ? ', וגם לא תזכורות הייצוג' : ''}.
                  מה שכבר בדף נשאר, מייל שתשלח בעצמך יוצא כרגיל, ופעולה מול רשות שכבר התחילה — ממשיכה.
                </span>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => onConfirm('resume')}>חידוש…</button>
              </div>
            )}

            <ol className="cf-moments" aria-label="סדר הביצוע">
              {moments.map(m => (
                <li key={m.key} className="cf-moment">
                  <div className="cf-moment-label">
                    {m.label}
                    {m.parallel > 1 && <span className="cf-par"> · {m.parallel} שלבים במקביל</span>}
                  </div>
                  {m.stages.map(st => (
                    <StageBlock key={st.key} st={st} firstName={firstName} permitted={permitted} onOpenTaxFile={onOpenTaxFile}
                      onOpenKindField={onOpenKindField} onboarding={run.trigger === 'quote_approved'}
                      clientLine={st.state === 'open' || nextKeys.has(st.key) ? stageClientLine(st, { paused }) : null}
                      onOpenSuggestions={run.suggestions > 0 ? () => setSuggestOpen(true) : undefined}
                      candidates={st.state === 'open' ? candidates : []} onAttach={() => setAttachFor(st)} />
                  ))}
                </li>
              ))}
            </ol>

            {run.upgradeAvailable && (
              <div className="cf-callout">
                <span>
                  המסלול השתנה במשרד מאז ש{firstName} התחיל/ה. {firstName} ממשיך/ה לפי מה שהיה, עד שתבחר מה מהשינוי חל עליו/ה.
                </span>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setUpgradeOpen(true)}>מה ישתנה</button>
              </div>
            )}
            {run.suggestions > 0 && (
              <div className="cf-callout">
                <span>הפרטים של {firstName} השתנו — {run.suggestions === 1 ? 'יש הצעה אחת' : `יש ${run.suggestions} הצעות`}. שום דבר לא נוסף לבד.</span>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setSuggestOpen(true)}>מה מוצע</button>
              </div>
            )}
            {endedSame.length > 0 && (
              <div className="cf-prev">
                קודם: {endedSame.map(e => previousRunText(e, run)).join(' · ')}
              </div>
            )}

            <div className="cf-runfoot">
              <span className="rl-links">
                {/* בעצירה — «חידוש…» כבר בראש הפתיחה. */}
                {!paused && (
                  <button type="button" className="rl-link" onClick={() => onConfirm('pause')}>עצירה</button>
                )}
                <button type="button" className="rl-link is-danger" onClick={() => onConfirm('cancel')}>ביטול המסלול</button>
              </span>
              <span className="cf-ver">
                גרסה {run.version}{run.upgradeAvailable ? ` · במשרד כבר גרסה ${run.currentVersion}` : ''} · מאז {formatDate(run.startedAt, 'list')}
              </span>
            </div>
          </div>
        )}
      </div>

      {upgradeOpen && (
        <UpgradeDialog run={run} firstName={firstName} steps={steps} onClose={() => setUpgradeOpen(false)} onDone={onChanged} />
      )}
      {suggestOpen && (
        <SuggestionsDialog run={run} firstName={firstName} steps={steps} advance={advance}
          onClose={() => setSuggestOpen(false)} onDone={onChanged} />
      )}
      {attachFor && (
        <AttachDialog run={run} stage={attachFor} candidates={candidates} steps={steps} firstName={firstName}
          onClose={() => setAttachFor(null)}
          onDone={(ids, text) => { setAttached(s => new Set([...s, ...ids])); onNote({ text }); onChanged(); }} />
      )}
    </div>
  );
}

/** שלב אחד בתוך רגע: מי מחזיק, מה מגיע ללקוח, פעולות מול רשות, וצירוף בקשה מאוחרת. */
function StageBlock({ st, firstName, permitted, onOpenTaxFile, onOpenKindField, onboarding, clientLine, onOpenSuggestions, candidates, onAttach }: {
  st: RunStage; firstName: string; permitted: boolean | undefined; onOpenTaxFile?: () => void; onOpenKindField?: () => void;
  /** מסלול הקליטה — שם קביעת הסוג פותחת את מה שחיכה לבד (217). */
  onboarding: boolean;
  /** «ללקוח:» — רק בשלב הפתוח ובבא אחריו (stageClientLine); null — בלי שורה. */
  clientLine: string | null;
  /** יש הצעות («הפרטים השתנו») — במסלול ידני/שנתי, שם מוצע מה שחיכה לסוג העוסק. */
  onOpenSuggestions?: () => void;
  candidates: LateCandidate[]; onAttach: () => void;
}) {
  // ‼ גם בשלב שעוד לא נפתח — «מה יקרה בו» כולל את הפעולה מול רשות (במצב «בהמשך»).
  const acts = st.state === 'not_applicable' ? [] : (st.actions ?? []);
  const stuckLine = stageStuckLine(st);
  const kindWait = !!st.waitingKind && st.state !== 'open' && st.state !== 'done';
  return (
    <div className={`cf-stage is-${st.state}`}>
      <div className="cf-stage-head">
        <span className="cf-sdot" aria-hidden="true" />
        <span className="cf-stage-name">{st.name}</span>
        <span className="cf-stage-who">{stageWho(st, firstName)}</span>
      </div>
      {stuckLine && <div className="cf-stage-deliv" role="note">{stuckLine}</div>}
      {/* ‼ בקליטה, קביעת הסוג פותחת לבד את מה שחיכה (217). במסלול ידני/שנתי — לא: מה שמתאים מוצע
          ב«מה מוצע» (flow_run_suggestions), ושם מוסיפים. «ייפתח אחרי שקובעים» שם לא היה נכון. */}
      {kindWait && (
        <div className="cf-stage-deliv" role="note">
          {onboarding
            ? <>השלב הזה רק לחלק מסוגי העוסקים, וסוג העוסק של {firstName} עוד לא ידוע. הוא ייפתח אחרי שקובעים אותו בתיק המס — אם הוא מתאים.</>
            : <>השלב הזה רק לחלק מסוגי העוסקים, וסוג העוסק של {firstName} לא היה ידוע כשהמסלול הופעל. אחרי שקובעים אותו בתיק המס — מה שמתאים מוצע ב«מה מוצע», ושם מוסיפים.</>}
          {!onboarding && onOpenSuggestions
            ? <> <button type="button" className="cf-link" onClick={onOpenSuggestions}>מה מוצע</button></>
            : onOpenKindField && <> <button type="button" className="cf-link" onClick={onOpenKindField}>לקביעת סוג העוסק</button></>}
        </div>
      )}
      {/* (B4) בקשות בשלב שמחכות לסוג העוסק — המספר כבר בשורת השלב (stageWho); כאן רק מה קורה ואיפה קובעים. */}
      {!kindWait && (st.kindWaitItems ?? 0) > 0 && st.state !== 'done' && st.state !== 'not_applicable' && (
        <div className="cf-stage-deliv" role="note">
          {onboarding
            ? <>{st.kindWaitItems === 1 ? 'הבקשה שמחכה תיפתח' : 'הבקשות שמחכות ייפתחו'} אחרי שקובעים את סוג העוסק בתיק המס — אם {st.kindWaitItems === 1 ? 'מתאימה' : 'מתאימות'}.</>
            : <>אחרי שקובעים את סוג העוסק בתיק המס — מה שמתאים מוצע ב«מה מוצע».</>}
          {!onboarding && onOpenSuggestions
            ? <> <button type="button" className="cf-link" onClick={onOpenSuggestions}>מה מוצע</button></>
            : onOpenKindField && <> <button type="button" className="cf-link" onClick={onOpenKindField}>לקביעת סוג העוסק</button></>}
        </div>
      )}
      {clientLine && !kindWait && (
        <div className="cf-stage-deliv"><b>ללקוח:</b> {clientLine}</div>
      )}
      {acts.length > 0 && (
        <div className="cf-acts">
          {acts.map(a => <ActionRow key={a.itemKey} a={a} stageOpen={st.state === 'open'} permitted={permitted} onOpenTaxFile={onOpenTaxFile} />)}
        </div>
      )}
      {candidates.length > 0 && (
        <button type="button" className="cf-link cf-attach" onClick={onAttach}>
          ＋ צירוף {candidates.length === 1 ? `«${candidates[0].title}»` : `${candidates.length} בקשות שנוספו ידנית`} לשלב הזה
        </button>
      )}
    </div>
  );
}

function ActionRow({ a, stageOpen, permitted, onOpenTaxFile }: {
  a: RunActionState; stageOpen: boolean; permitted: boolean | undefined; onOpenTaxFile?: () => void;
}) {
  const s = actionStatus(a, stageOpen, permitted);
  return (
    <div className={`cf-act${s.failed ? ' is-failed' : ''}`}>
      <span className="cf-act-name">{s.name}</span>
      {/* ורוד רק כשבאמת רצה/תרוץ לבד — לא לפי ההגדרה במסלול. */}
      {s.auto && <span className="cf-tag is-auto">לבד</span>}
      <span className="cf-act-state">{s.text}</span>
      {s.waitsForYou && onOpenTaxFile && (
        <button type="button" className="cf-link" onClick={onOpenTaxFile}>לתיק המס</button>
      )}
    </div>
  );
}

// ── צירוף בקשה שנוספה ידנית לשלב פתוח ──────────────────────────────────────
// ‼ «＋ בקשה חדשה» יוצרת בקשה רגילה, מחוץ למסלול. כאן מצרפים אותה לשלב: היא
// מקבלת את «איך מגיע» והתזכורת של השלב ונספרת בשורת המסלול (attach_step_to_flow_stage).
// ‼ היא מעכבת את סיום השלב ואת מה שנפתח אחריו, כמו פריט מקורי (215: _flow_progress
// ו-_flow_gate_steps סופרים גם «adhoc-…», והצירוף מוסיף אותה כתנאי לשלבים הבאים — גם
// דרך שלב ריק / שלא חל / שכולו רשות, _flow_rearc_locked). כך גם נאמר, עם כל השלבים האלה.
// ‼ טיוטה נשארת טיוטה: לא מופיעה בדף ולא יוצא עליה מייל עד «פרסם בדף» (attachLines).
function AttachDialog({ run, stage, candidates, steps, firstName, onClose, onDone }: {
  run: ClientFlowRun; stage: RunStage; candidates: LateCandidate[]; steps: OnboardingStep[]; firstName: string;
  onClose: () => void; onDone: (ids: string[], text: string) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(candidates.map(c => c.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = candidates.filter(c => sel.has(c.id));
  const drafts = chosen.filter(c => c.draft).length;
  const lines = attachLines(stage, { paused: run.status === 'paused', drafts, published: chosen.length - drafts });
  // ‼ «אין בו למה לחכות» — לפי השרת (counts.gates, אותו מסנן כמו _flow_gate_steps), בכל
  // סוגי המסלולים. שרת ישן בלי השדה — לפי מה שהכרטיס יודע (בקליטה: כולן רשות).
  // טעות לכיוון «עובר הלאה» רק מוסיפה שם לרשימה — וגם השלב ההוא באמת מחכה, דרך השלב שלפניו.
  const passThrough = runPassThrough(run, steps);
  const after = stagesHeldBy(run.stages, stage.key, passThrough);
  const many = chosen.length > 1;

  async function go() {
    setBusy(true); setError(null);
    const done: string[] = [];
    const failed: string[] = [];
    for (const c of candidates.filter(x => sel.has(x.id))) {
      const r = await attachStepToStage(c.id, run.id, stage.key);
      if (r.ok === false) failed.push(`«${c.title}» — ${serverErrorText(r.error, 'לא צורפה')}`);
      else done.push(c.id);
    }
    setBusy(false);
    if (done.length > 0) {
      const titles = candidates.filter(c => done.includes(c.id)).map(c => `«${c.title}»`).join(', ');
      onDone(done, `${titles} ${done.length === 1 ? 'צורפה' : 'צורפו'} לשלב «${stage.name}»`);
    }
    if (failed.length > 0) { setError(failed.join(' · ')); return; }
    onClose();
  }

  return (
    <Modal title={`צירוף לשלב «${stage.name}»`} onClose={onClose} width={500} footer={
      <div className="cf-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>ביטול</button>
        <button type="button" className="btn btn-primary" disabled={busy || sel.size === 0} onClick={() => void go()}>
          {busy ? 'מצרף…' : sel.size > 1 ? `צירוף ${sel.size} בקשות` : 'צירוף'}
        </button>
      </div>
    }>
      <p className="cf-note" style={{ marginTop: 0 }}>
        בקשות שנוספו ל{firstName} אחרי ש«{runTitle(run)}» התחיל. בקשה שמצורפת לשלב:
      </p>
      <ul className="cf-bullets">
        {lines.map((l, i) => <li key={i}>{l.label && <><b>{l.label}</b>{' '}</>}{l.text}</li>)}
        <li>
          השלב מחכה גם {many ? 'להן' : 'לה'} — {after.length > 0
            ? <>{after.map(s => `«${s.name}»`).join(', ')} {after.length > 1 ? 'ייפתחו' : 'ייפתח'} רק כשגם {many ? 'הן יסתיימו' : 'היא תסתיים'}.</>
            : `הוא יסתיים רק כשגם ${many ? 'הן יסתיימו' : 'היא תסתיים'}.`}
        </li>
      </ul>
      <ul className="cf-list">
        {candidates.map(c => (
          <li key={c.id} className="cf-li">
            <input type="checkbox" checked={sel.has(c.id)} disabled={busy} aria-label={`לצרף את «${c.title}»`}
              onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
            <span className="cf-li-main">
              <span className="cf-li-title">{c.title}</span>
              {c.draft && <span className="cf-li-sub">טיוטה — עוד לא בדף</span>}
            </span>
          </li>
        ))}
      </ul>
      {error && <div className="cf-err">⚠ {error}</div>}
    </Modal>
  );
}

/**
 * ‼ «אין בו למה לחכות» — לפי השרת (counts.gates, אותו מסנן כמו _flow_gate_steps), בכל
 * סוגי המסלולים. שרת ישן בלי השדה — לפי מה שהכרטיס יודע (בקליטה: כולן רשות).
 * טעות לכיוון «עובר הלאה» רק מוסיפה שם לרשימה — וגם השלב ההוא באמת מחכה, דרך השלב שלפניו.
 */
const runPassThrough = (run: ClientFlowRun, steps: OnboardingStep[]) => (s: RunStage) => stagePassesThrough(s, () => {
  if (run.trigger !== 'quote_approved') return false;
  const own = steps.filter(x => x.flowRunId === run.id && x.flowStageKey === s.key && x.status !== 'cancelled');
  return own.length > 0 && own.every(x => x.requiredForClose === false && !(x.flowItemKey ?? '').startsWith('adhoc-'));
});


// ── עצירה / חידוש / ביטול — עם המשפט שאומר מה קורה ───────────────────────────
function RunConfirm({ run, kind, firstName, onClose, onDone, onAccepted }: {
  run: ClientFlowRun; kind: ConfirmKind; firstName: string; onClose: () => void; onDone: () => void;
  /** השרת קיבל — המשפט שיוצג על השורה כשהיא תראה את המצב החדש. */
  onAccepted: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<{ stepId: string; title: string }[] | null>(null);
  const name = runTitle(run);
  // ‼ תזכורות הייצוג (חתימה, ביטוח לאומי, אישור באזור האישי) נעצרות בשרת רק כשהמסלול
  // שנעצר הוא מסלול הקליטה — רק בו יש את בקשת הייצוג.
  const onboarding = run.trigger === 'quote_approved';

  const copy = {
    pause: {
      title: `עצירת «${name}» אצל ${firstName}`,
      // ‼ גם מיילים לגורם חיצוני (execute_automatic_step: run_paused, 216) — לא רק ללקוח.
      text: `שום שלב לא ייפתח, ולא ייצאו לבד מיילים ותזכורות — ללקוח ולגורם חיצוני${onboarding ? ' (למשל המכתב לרו״ח הקודם), וגם לא תזכורות הייצוג (חתימה, ביטוח לאומי, אישור באזור האישי)' : ''}. מה שכבר בדף נשאר.`,
      sub: 'פעולה מול רשות שעוד לא התחילה — לא תרוץ לבד; פעולה שכבר התחילה (למשל הגשה לשע״ם שמחכה למסמכים) — ממשיכה. מייל שתשלח בעצמך יוצא כרגיל. אפשר לחדש בכל רגע.',
      label: 'עצירה',
    },
    resume: {
      title: `חידוש «${name}» אצל ${firstName}`,
      // ‼ תזכורת שהגיע זמנה בזמן העצירה לא נבלעת: היא יוצאת בסבב הראשון אחרי החידוש (214; ייצוג — 216).
      text: `מה שהתעכב ייפתח עכשיו. אם השלב שולח מייל אוטומטי — יוצא מייל מרוכז אחד על מה שנפתח. תזכורות שהגיע זמנן בזמן העצירה יוצאות מיד אחרי החידוש, לכל היותר אחת ביום${onboarding ? ' — גם של הייצוג' : ''}.`,
      sub: 'שלב שמחכה לאישורך — ממשיך לחכות לך. פעולה מול רשות שבוטלה בגלל העצירה לא תרוץ שוב לבד — מפעילים אותה בלחיצה, מהשורה שלה בפרטי המסלול («לתיק המס»).',
      label: 'חידוש',
    },
    cancel: {
      title: `ביטול «${name}» אצל ${firstName}`,
      text: 'מה שפתוח יורד מהדף, מה שהושלם נשאר בהיסטוריה, ולא יוצא מייל.',
      sub: 'רוצים רק להקפיא? «עצירה» משאירה הכול במקום.',
      label: 'ביטול המסלול',
    },
  }[kind];

  async function go() {
    setBusy(true); setError(null);
    const r = kind === 'pause' ? await pauseFlowRun(run.id)
      : kind === 'resume' ? await resumeFlowRun(run.id)
      : await cancelFlowRun(run.id);
    setBusy(false);
    if (r.ok === false) { setError(serverErrorText(r.error) + '.'); return; }
    const k = kind === 'cancel' ? ((r as { kept?: { stepId: string; title: string }[] }).kept ?? []) : [];
    if (kind === 'pause') onAccepted('');
    else if (kind === 'resume') {
      const n = (r as { unlocked?: number }).unlocked ?? 0;
      onAccepted(n > 0
        ? `«${name}» חודש — ${n === 1 ? 'בקשה אחת שהתעכבה נפתחה' : `${n} בקשות שהתעכבו נפתחו`} עכשיו`
        : `«${name}» חודש — ממשיך מאיפה שעצר`);
    } else {
      const gone = (r as { cancelled?: number }).cancelled;
      onAccepted(k.length > 0
        ? `«${name}» בוטל. ${k.length === 1 ? 'נשארה פתוחה' : 'נשארו פתוחות'}: ${k.map(x => `«${x.title}»`).join(', ')} (${k.length === 1 ? 'יש לה' : 'לכל אחת'} ביטול משלה ברשימה)`
        : `«${name}» בוטל — ${gone ? `${gone === 1 ? 'בקשה אחת ירדה' : `${gone} בקשות ירדו`} מהדף` : 'מה שהיה פתוח ירד מהדף'}, ולא יצא מייל`);
    }
    onDone();
    if (k.length > 0) { setKept(k); return; }
    onClose();
  }

  return (
    <Modal title={copy.title} onClose={onClose} width={480} footer={kept ? (
      <div className="cf-foot"><button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button></div>
    ) : (
      <div className="cf-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>חזרה</button>
        <button type="button" className={`btn ${kind === 'cancel' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}
          onClick={() => void go()}>{busy ? 'רגע…' : copy.label}</button>
      </div>
    )}>
      {kept ? (
        <>
          <p className="cf-ok" role="status" style={{ marginTop: 0 }}>המסלול בוטל. מה שהיה פתוח בו ירד מהדף.</p>
          <p className="cf-note">
            {kept.length === 1
              ? 'בקשה אחת נשארה פתוחה — היא חלק מתהליך משלה (ייצוג, טופס מול רשות), ולכן יש לה ביטול משלה ברשימת הבקשות:'
              : `${kept.length} בקשות נשארו פתוחות — הן חלק מתהליך משלהן (ייצוג, טופס מול רשות), ולכן לכל אחת ביטול משלה ברשימת הבקשות:`}
          </p>
          <ul className="cf-bullets">{kept.map(k => <li key={k.stepId}>{k.title}</li>)}</ul>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--ink-1)' }}>{copy.text}</p>
          <p className="cf-note">{copy.sub}</p>
          {error && <div className="cf-err">⚠ {error}</div>}
        </>
      )}
    </Modal>
  );
}

// ── עדכון לגרסה חדשה ─────────────────────────────────────────────────────────
function UpgradeDialog({ run, firstName, steps, onClose, onDone }: {
  run: ClientFlowRun; firstName: string; steps: OnboardingStep[]; onClose: () => void; onDone: () => void;
}) {
  const title = useFlowItemTitles(true);
  // ‼ (B5) בקשה שנוספת לשלב פתוח (או עוברת אליו) מעכבת את מה שנפתח אחריו — כמו בצירוף. חובה או
  // רשות — מההגדרה הנוכחית של המסלול (הגרסה שאליה מעדכנים); לא ידוע ⇒ לא אומרים.
  const [def, setDef] = useState<{ required: Map<string, boolean>; stageOf: Map<string, string> } | null>(null);
  useEffect(() => {
    let alive = true;
    void loadOfficeFlows().then(r => {
      if (!alive || !r.ok) return;
      const f = r.flows.find(x => x.id === run.flowId);
      if (!f) return;
      setDef({
        required: new Map(f.definition.stages.flatMap(st => st.items.map(i => [i.key, !i.optional] as const))),
        stageOf: new Map(f.definition.stages.flatMap(st => st.items.map(i => [i.key, st.key] as const))),
      });
    });
    return () => { alive = false; };
  }, [run.flowId]);
  const passThrough = runPassThrough(run, steps);
  const holdsOpen = (itemKey: string, stageKey: string | undefined) =>
    heldByAddedText(run.stages, stageKey, def?.required.get(itemKey), passThrough);
  const [pv, setPv] = useState<UpgradePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState<Set<string>>(new Set());
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    void previewUpgrade(run.id).then(r => {
      if (!alive) return;
      if (r.ok === false) { setError(serverErrorText(r.error, 'לא הצלחתי לטעון מה השתנה — אפשר לנסות שוב') + '.'); return; }
      setPv(r);
      setAdd(new Set((r.added ?? []).filter(a => a.applies && a.addable).map(a => a.itemKey)));
    });
    return () => { alive = false; };
  }, [run.id]);

  const toggle = (set: Set<string>, key: string, on: boolean) => {
    const n = new Set(set);
    if (on) n.add(key); else n.delete(key);
    return n;
  };

  async function apply() {
    if (!pv) return;
    setBusy(true); setError(null);
    const r = await applyUpgrade(run.id, pv.to, [...add], [...skip]);
    setBusy(false);
    if (r.ok === false) {
      setError(r.error === 'version_conflict'
        ? 'המסלול השתנה שוב בינתיים — פתחו מחדש.' : serverErrorText(r.error, 'העדכון לא הצליח — אפשר לנסות שוב') + '.');
      return;
    }
    const keyTitle = (k: string) => {
      const a = pv.added.find(x => x.itemKey === k);
      return a ? title(a.ref) : 'פריט';
    };
    const lines = materializedSummary(r, keyTitle, firstName);
    if (r.skippedSteps) lines.push(r.skippedSteps === 1 ? 'בקשה אחת סומנה «אין צורך»' : `${r.skippedSteps} בקשות סומנו «אין צורך»`);
    setResult(lines);
    onDone();
  }

  const nothing = pv && (pv.upToDate || (!pv.added.length && !pv.removed.length && !pv.changed.length && !pv.stageChanges?.length));
  // ‼ השורה אמרה «יש עדכון» והשרת אומר שאין — טוענים מחדש כדי שהסימן ירד, ולא
  // מציגים «עדכון לגרסה 1» על מסלול שכבר בגרסה 1.
  // פעם אחת לכל תצוגה — onDone מתחלף בכל רינדור של הכרטיס, ולולאת טעינות היא סופת בקשות.
  const upToDateNotified = pv?.upToDate === true;
  useEffect(() => {
    if (upToDateNotified && run.upgradeAvailable) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upToDateNotified]);

  return (
    <Modal title={nothing ? `«${runTitle(run)}» אצל ${firstName} — אין עדכון` : `עדכון ${firstName} לגרסה ${pv?.to ?? run.currentVersion}`}
      onClose={onClose} width={560} footer={
      result || nothing ? (
        <div className="cf-foot"><button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button></div>
      ) : (
        <div className="cf-foot">
          <span className="cf-foot-note">ההיסטוריה נשמרת. מה שלא סימנת — לא משתנה.</span>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>ביטול</button>
          <button type="button" className="btn btn-primary" disabled={busy || !pv} onClick={() => void apply()}>
            {busy ? 'מעדכן…' : 'עדכון'}
          </button>
        </div>
      )}>
      {!pv && !error && <p className="cf-note">טוען מה השתנה…</p>}
      {result ? (
        <div role="status">{result.map((l, i) => <p key={i} className="cf-note">{l}</p>)}</div>
      ) : nothing ? (
        <p className="cf-note">{firstName} כבר בגרסה האחרונה — אין מה לעדכן.</p>
      ) : pv && (
        <>
          <p className="cf-note" style={{ marginTop: 0 }}>
            {firstName} באמצע גרסה {pv.from}. כאן בוחרים מה מהגרסה החדשה חל עליו/ה. בקשה שכבר נפתחה שומרת את הנוסח שלה;
            מה שקובע את ההתקדמות (מתי שלב נפתח ונסגר, חובה או רשות, תזכורות והודעה אליך) — חל מהעדכון.
          </p>
          {pv.added.length > 0 && (
            <div className="cf-sec">
              <div className="cf-sec-title">נוסף בגרסה החדשה</div>
              <ul className="cf-list">
                {pv.added.map(a => {
                  const disabled = !a.addable || !a.applies;
                  const why = !a.addable ? (a.notAddableReason ? skipReasonText(a.notAddableReason) : 'נוצר רק באישור הצעה')
                    : !a.applies ? 'לא חל על הלקוח הזה'
                    : a.action ? 'פעולה מול רשות — תחכה לך'
                    : a.stageOpen ? 'ייפתח עכשיו' : 'ייפתח עם השלב';
                  return (
                    <li key={a.itemKey} className={`cf-li${disabled ? ' is-off' : ''}`}>
                      <input type="checkbox" disabled={disabled || busy} checked={add.has(a.itemKey)}
                        aria-label={`להוסיף את «${title(a.ref)}»`}
                        onChange={e => setAdd(s => toggle(s, a.itemKey, e.target.checked))} />
                      <span className="cf-li-main">
                        <span className="cf-li-title">{title(a.ref)}</span>
                        <span className="cf-li-sub">{a.stageName} · {why}{!disabled && !a.action && holdsOpen(a.itemKey, a.stageKey) ? ` · ${holdsOpen(a.itemKey, a.stageKey)}` : ''}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {pv.removed.length > 0 && (
            <div className="cf-sec">
              <div className="cf-sec-title">ירד מהגרסה החדשה</div>
              <ul className="cf-list">
                {pv.removed.flatMap(rm => (rm.steps.length ? rm.steps : [null]).map(s => {
                  if (!s) {
                    return (
                      <li key={rm.itemKey} className="cf-li is-off">
                        <span className="cf-li-main">
                          <span className="cf-li-title">{title(rm.ref)}</span>
                          <span className="cf-li-sub">{rm.stageName} · לא נפתח אצל {firstName} — אין מה לסגור</span>
                        </span>
                      </li>
                    );
                  }
                  const done = ['completed', 'verified', 'skipped', 'cancelled'].includes(s.status);
                  return (
                    <li key={s.stepId} className={`cf-li${done || !s.canSkip ? ' is-off' : ''}`}>
                      {!done && (
                        <input type="checkbox" disabled={!s.canSkip || busy} checked={skip.has(s.stepId)}
                          aria-label={`אין צורך ב«${s.title}»`}
                          onChange={e => setSkip(set => toggle(set, s.stepId, e.target.checked))} />
                      )}
                      <span className="cf-li-main">
                        <span className="cf-li-title">{s.title || title(rm.ref)}</span>
                        <span className="cf-li-sub">
                          {rm.stageName} · {done ? 'הושלם — נשאר בהיסטוריה'
                            : s.canSkip ? 'פתוח — סמנו «אין צורך» כדי לסגור' : 'פתוח — נשאר כמו שהוא'}
                        </span>
                      </span>
                    </li>
                  );
                }))}
              </ul>
            </div>
          )}
          {(pv.stageChanges?.length ?? 0) > 0 && (
            <div className="cf-sec">
              <div className="cf-sec-title">השתנה בשלבים — חל מהעדכון</div>
              <ul className="cf-list">
                {pv.stageChanges!.map(sc => (
                  <li key={sc.stageKey} className="cf-li is-off">
                    <span className="cf-li-main">
                      <span className="cf-li-title">{sc.fromName ? `«${sc.fromName}» ← «${sc.stageName}»` : sc.stageName}</span>
                      <span className="cf-li-sub">{sc.what.map(w => STAGE_CHANGE_TEXT[w]).filter(Boolean).join(', ')}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pv.changed.length > 0 && (
            <div className="cf-sec">
              <div className="cf-sec-title">השתנה</div>
              <ul className="cf-list">
                {pv.changed.map(c => {
                  const what = (c.what ?? []).map(w => ITEM_CHANGE_TEXT[w]).filter(Boolean);
                  const now = what.filter(w => w.now).map(w => w.text);
                  const later = what.filter(w => !w.now).map(w => w.text);
                  return (
                    <li key={c.itemKey} className="cf-li is-off">
                      <span className="cf-li-main">
                        <span className="cf-li-title">{title(c.ref)}</span>
                        <span className="cf-li-sub">
                          {c.fromStageName ? `«${c.fromStageName}» ← «${c.stageName}»` : c.stageName}
                          {c.what?.includes('moved') && holdsOpen(c.itemKey, def?.stageOf.get(c.itemKey)) ? ` · ${holdsOpen(c.itemKey, def?.stageOf.get(c.itemKey))}` : ''}
                          {now.length > 0 && <> · חל מהעדכון: {now.join(', ')}</>}
                          {later.length > 0 && <> · {later.join(', ')} — רק בבקשה שעוד לא נפתחה</>}
                          {what.length === 0 && ' · לא חל על בקשה שכבר נפתחה'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
      {error && <div className="cf-err">⚠ {error}</div>}
    </Modal>
  );
}

// ── הצעות אחרי שינוי בפרטי הלקוח ─────────────────────────────────────────────
function SuggestionsDialog({ run, firstName, steps, advance, onClose, onDone }: {
  run: ClientFlowRun; firstName: string; steps: OnboardingStep[];
  advance: Props['advance']; onClose: () => void; onDone: () => void;
}) {
  const library = useFlowLibrary(true);
  const title = library.title;
  const [list, setList] = useState<RunSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadSuggestions(run.id).then(r => {
      if (!alive) return;
      if (r.ok === false) { setError(serverErrorText(r.error, 'לא הצלחתי לטעון את ההצעות — אפשר לנסות שוב') + '.'); return; }
      setList(r.suggestions ?? []);
    });
    return () => { alive = false; };
  }, [run.id, tick]);

  const stepById = useMemo(() => new Map(steps.map(s => [s.id, s])), [steps]);
  const keyOf = (s: RunSuggestion) => `${s.kind}:${s.itemKey}:${s.role ?? ''}`;

  async function act(s: RunSuggestion) {
    const k = keyOf(s);
    setBusyKey(k); setError(null);
    let note: string;
    if (s.kind === 'not_needed') {
      // ‼ אותו מסלול «אין צורך» שמשמש בשורת הבקשה — לא מחיקה; ההיסטוריה נשמרת.
      let failed = 0;
      for (const id of s.steps ?? []) {
        const r = await advance(id, 'skip', { reason: 'not_applicable', note: 'פרטי הלקוח השתנו - אין צורך' });
        if (!r.ok) failed++;
      }
      note = failed ? 'לא הצלחתי לסגור את כולן.' : 'סומן «אין צורך».';
    } else {
      const r = await addFlowItems(run.id, [s.itemKey], s.kind === 'add_person' && s.role ? [s.role] : null);
      note = r.ok === false ? serverErrorText(r.error, 'ההוספה לא הצליחה — אפשר לנסות שוב') + '.'
        : materializedSummary(r, () => title(s.ref), firstName).join(' · ');
    }
    setNotes(n => ({ ...n, [k]: note }));
    setBusyKey(null);
    onDone();
    setTick(t => t + 1);
  }

  return (
    <Modal title={`הפרטים של ${firstName} השתנו`} onClose={onClose} width={540} footer={
      <div className="cf-foot">
        <span className="cf-foot-note">שינוי בפרטים רק מציע — שום דבר לא נוסף ולא נסגר לבד.</span>
        <button type="button" className="btn btn-primary" onClick={onClose}>סגירה</button>
      </div>
    }>
      {!list && !error && <p className="cf-note">טוען…</p>}
      {list && list.length === 0 && Object.keys(notes).length === 0 && <p className="cf-note">אין כרגע הצעות.</p>}
      {list && (
        <ul className="cf-list">
          {list.map(s => {
            const k = keyOf(s);
            const name = title(s.ref);
            // ‼ אישור אישי לא נפתח לבן/בת הזוג בדף של בעל הכרטיס — נפתחת משימה אליך; קבצים/פרטים
            // באותה בקשה — כן בדף (_flow_materialize). השרת אומר את זה בשורה (personalConfirm,
            // pagePart); בלי השדות (שרת ישן) — לפי הספרייה במסך.
            const spouse = s.name ?? 'בן/בת הזוג';
            const sub = s.kind === 'add_person'
              ? `גם ל${spouse} · ${spouseAddText(suggestionPersonalConfirm(s, library.personalConfirm(s.ref)), firstName, spouse)}`
              : s.kind === 'add' ? `מתאים עכשיו · ${s.stageName}`
              : `כבר לא מתאים · ${(s.steps ?? []).map(id => stepById.get(id)).filter(Boolean).map(st => `«${stepTitle(st as OnboardingStep)}»`).join(', ') || s.stageName}`;
            return (
              <li key={k} className="cf-li">
                <span className="cf-li-main">
                  <span className="cf-li-title">{name}</span>
                  <span className="cf-li-sub">{sub}</span>
                  {notes[k] && <span className="cf-li-sub" role="status">{notes[k]}</span>}
                </span>
                <span className="cf-li-acts">
                  <button type="button" className="btn btn-sm btn-secondary"
                    disabled={busyKey !== null || (s.kind === 'not_needed' && !(s.steps ?? []).length)}
                    onClick={() => void act(s)}>
                    {busyKey === k ? 'רגע…' : s.kind === 'not_needed' ? 'אין צורך' : 'להוסיף'}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <div className="cf-err">⚠ {error}</div>}
    </Modal>
  );
}

// ── ריצה שהסתיימה — שורה שקטה אחת ────────────────────────────────────────────
function EndedRun({ run }: { run: ClientFlowRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cf-quiet">
      <button type="button" className="cf-link" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {open ? '−' : '+'} {runTitle(run)}
      </button>
      <span>· {endedRunText(run)}</span>
      {open && (
        <ol className="cf-ended-stages">
          {run.stages.map(st => (
            <li key={st.key} className={`cf-stage is-${st.state}`}>
              <div className="cf-stage-head">
                <span className="cf-sdot" aria-hidden="true" />
                <span className="cf-stage-name">{st.name}</span>
                <span className="cf-stage-who">{endedStageText(st, run.closedBy)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

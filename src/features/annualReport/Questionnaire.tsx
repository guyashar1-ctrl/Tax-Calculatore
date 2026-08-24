import { useMemo, useEffect, useRef, useState } from 'react';
import type { AnnualReportSession, AnswerValue, QuestionPreviewItem, ChapterKey } from './types';
import type { Client } from '../../types';
import CoverageRail from './CoverageRail';
import CardSectionEditor from './CardSectionEditor';
import AnnualDeltaScreen, { type DeltaResult } from './AnnualDeltaScreen';
import { replayAnswers } from './engine';
import { seedModelFromClient, registeredFileInfo } from './profile';
import { findSession, saveAnswer, updateSessionState } from './repository';
import { useAnnualReportFlow } from './useAnnualReportSession';
import { getQuestionById } from './engine';
import { estimateTotalQuestions, chaptersForModel } from './tree';
import { fieldByNumber } from './form1301Fields';
import { getAnswersForSession } from './repository';
import QuestionCard from './QuestionCard';
import ValidationCard from './ValidationCard';

interface Props {
  initialSession: AnnualReportSession;
  clientName: string;
  client?: Client | null;
  onFinished: (session: AnnualReportSession) => void;
  onExit: () => void;
  onPatchClient?: (partial: Partial<Client>) => Promise<void>;
}

export default function Questionnaire({ initialSession, clientName, client, onFinished, onExit, onPatchClient }: Props) {
  // תשובות שהועתקו מהשנה הקודמת (הסקירה השנתית) — נצרכות אוטומטית בזרימה.
  const autoAnswersRef = useRef<Map<string, AnswerValue>>(new Map());
  const flow = useAnnualReportFlow(initialSession, autoAnswersRef.current);
  const { session, saving, error, submitAnswer, goBack, canGoBack, restart, adoptSession, isFinished } = flow;
  const [applyingDelta, setApplyingDelta] = useState(false);
  // עורך הכרטיס — נפתח מכפתור "עדכן בכרטיס" שמופיע ליד כל שאלה עם editTarget
  const [cardEditorOpen, setCardEditorOpen] = useState(false);
  useEffect(() => { setCardEditorOpen(false); }, [session.currentQuestionId]);

  // תיק השנה הקודמת — אם קיים והושלם, מסך "מה השתנה?" מחליף את שער האריחים.
  const [prior, setPrior] = useState<{ session: AnnualReportSession; answers: Map<string, AnswerValue> } | null>(null);
  const [priorLoaded, setPriorLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prev = await findSession(initialSession.clientId, initialSession.taxYear - 1);
        if (cancelled || !prev || prev.status === 'in_progress') { setPriorLoaded(true); return; }
        const list = await getAnswersForSession(prev.id);
        if (cancelled) return;
        const m = new Map<string, AnswerValue>();
        for (const a of list) m.set(a.questionId, a.value);
        setPrior({ session: prev, answers: m });
      } catch {
        // אין שנה קודמת — שער רגיל
      } finally {
        if (!cancelled) setPriorLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [initialSession.clientId, initialSession.taxYear]);

  // החלת הסקירה: משחזרים מסלול מהתשובות שהועתקו ושומרים הכל לתיק החדש.
  async function applyDelta(result: DeltaResult) {
    setApplyingDelta(true);
    try {
      const answers = new Map<string, AnswerValue>(result.copiedAnswers);
      answers.set('year_map', result.gateTiles);
      const { model, currentQuestionId, usedQuestionIds } = replayAnswers(answers, session.taxYear, 'annual');
      for (const qid of usedQuestionIds) {
        await saveAnswer(session.id, qid, answers.get(qid)!);
      }
      const done = currentQuestionId === null;
      const updated = await updateSessionState(session.id, {
        model: client ? seedModelFromClient(model, client) : model,
        currentQuestionId,
        status: done ? 'review' : 'in_progress',
        completedAt: done ? new Date().toISOString() : null,
      });
      // תשובות שלא נכנסו במסלול (פרקים שעוד לא הגענו אליהם) — ייצרכו אוטומטית בהמשך.
      autoAnswersRef.current.clear();
      for (const [qid, v] of answers) {
        if (!usedQuestionIds.includes(qid)) autoAnswersRef.current.set(qid, v);
      }
      setPriorAnswers((prevMap) => {
        const next = new Map(prevMap);
        for (const [qid, v] of answers) next.set(qid, v);
        return next;
      });
      adoptSession(updated);
      if (done) onFinished(updated);
    } finally {
      setApplyingDelta(false);
    }
  }

  // טעינת תשובות קודמות מ-DB — כדי לסמן תשובות קיימות כברירת מחדל בכל שאלה.
  const [priorAnswers, setPriorAnswers] = useState<Map<string, AnswerValue>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getAnswersForSession(initialSession.id);
        if (cancelled) return;
        const m = new Map<string, AnswerValue>();
        for (const a of list) m.set(a.questionId, a.value);
        setPriorAnswers(m);
      } catch {
        // אם נכשל — פשוט נמשיך בלי prefills
      }
    })();
    return () => { cancelled = true; };
  }, [initialSession.id]);

  const node = useMemo(() => getQuestionById(session.currentQuestionId), [session.currentQuestionId]);
  const previewItems = useMemo(() => {
    if (!node?.dataPreview) return null;
    return node.dataPreview({ client: client ?? undefined, model: session.model });
  }, [node, client, session.model]);

  const chapters = useMemo(() => chaptersForModel(session.model), [session.model]);
  const currentChapter: ChapterKey = node?.chapter ?? 'finish';
  const currentChapterIdx = Math.max(0, chapters.indexOf(currentChapter));

  const totalEst = estimateTotalQuestions(session.model);
  const answered = priorAnswers.size;
  const remaining = Math.max(1, totalEst - answered);

  const isGate = node?.id === 'year_map';

  // תגית "בן הזוג הרשום" — נגזרת מתיק מס הכנסה בכרטיס (מקור האמת)
  const regFile = client ? registeredFileInfo(client) : null;
  const regChip = regFile && (
    <span
      className={`ar-pill ${regFile.owner === 'spouse' ? 'is-warn' : ''}`}
      style={{ marginInlineEnd: '.5rem' }}
      title="על שם מי מתנהל תיק מס הכנסה - נקבע בכרטיס הלקוח"
    >
      התיק ע"ש {regFile.name}{regFile.idNumber ? ` · ${regFile.idNumber}` : ''}
    </span>
  );

  // עוטף ל-submitAnswer שמעדכן גם את ה-map המקומי של התשובות הקודמות.
  async function handleSubmit(value: AnswerValue) {
    if (node) {
      setPriorAnswers((prev) => {
        const next = new Map(prev);
        next.set(node.id, value);
        return next;
      });
    }
    await submitAnswer(value);
  }

  useEffect(() => {
    if (isFinished) onFinished(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished]);

  if (isFinished) {
    return null; // parent will switch view
  }

  if (!node) {
    // שאלה שלא קיימת יותר בעץ (סשן מגרסה ישנה) — מציעים המשך בטוח.
    return (
      <div className="card" style={{ maxWidth: 700, margin: '2rem auto', padding: '2rem', textAlign: 'center' }}>
        <h3>השאלון עודכן מאז הביקור הקודם</h3>
        <p style={{ color: 'var(--gray-600)' }}>אפשר להמשיך לתוצאות עם מה שכבר נענה, או להתחיל את השאלון מחדש (התשובות הקודמות יסומנו אוטומטית).</p>
        <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => onFinished(session)}>המשך לתוצאות</button>
          <button className="btn btn-secondary" onClick={() => void restart()}>התחל מחדש</button>
        </div>
      </div>
    );
  }

  // ─── קודי 1301 שהשאלה מזינה — לשקיפות "מה מתעדכן" ─────────────────────
  const feedsCodes = (node.targetFieldCodes ?? [])
    .map((c) => fieldByNumber[c])
    .filter(Boolean)
    .map((f) => {
      const oc = f.codes;
      const official = oc ? [oc.registered, oc.spouse, oc.joint].filter(Boolean).join('/') : '';
      return official || f.fieldNumber;
    });
  const uniqueCodes = Array.from(new Set(feedsCodes)).slice(0, 4);

  // ─── מסך השער ────────────────────────────────────────────────────────────
  // לקוח חוזר (יש תיק שנה קודם) → סקירה שנתית "מה השתנה?";
  // לקוח חדש → שער האריחים (שאלון הקליטה).
  if (isGate) {
    if (!priorLoaded) {
      return (
        <div style={{ maxWidth: 860, margin: '3rem auto', textAlign: 'center', color: 'var(--gray-500)' }}>
          בודק אם קיים תיק משנה קודמת…
        </div>
      );
    }
    return (
      <div style={{ maxWidth: 860, margin: '1.5rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div style={{ color: 'var(--gray-600)' }}>
            <strong>{clientName}</strong> · שנת מס <strong>{session.taxYear}</strong>{regChip}
            {prior && <span style={{ fontSize: '13px' }}> · סקירה שנתית על בסיס {prior.session.taxYear}</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onExit}>שמור וצא</button>
        </div>
        {prior ? (
          <AnnualDeltaScreen
            clientName={clientName}
            taxYear={session.taxYear}
            priorYear={prior.session.taxYear}
            priorModel={prior.session.model}
            priorAnswers={prior.answers}
            saving={applyingDelta}
            onApply={(r) => void applyDelta(r)}
          />
        ) : (
          <div className="card">
            <div className="card-body" style={{ padding: '1.75rem' }}>
              <QuestionCard
                node={node}
                variant="tiles"
                initialValue={priorAnswers.get(node.id)}
                disabled={saving}
                onSubmit={(value) => void handleSubmit(value)}
                submitLabel="נתחיל ←"
              />
            </div>
          </div>
        )}
        {error && <ErrorBox message={error} />}
      </div>
    );
  }

  // ─── פריסת פרקים: סרגל פרקים מימין + שאלה במרכז ────────────────────────
  return (
    <div style={{ maxWidth: 1000, margin: '1.5rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ color: 'var(--gray-600)' }}>
          <strong>{clientName}</strong> · שנת מס <strong>{session.taxYear}</strong>{regChip}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onExit}>שמור וצא</button>
      </div>

      <div className="ar-qlayout">
        {/* ─── סרגל העץ החי (מצב רו"ח) ─── */}
        <nav aria-label="עץ הראיון" className="ar-chnav">
          <CoverageRail
            model={session.model}
            answeredQuestionIds={new Set(
              [...priorAnswers.entries()].filter(([, v]) => v !== 'unknown').map(([k]) => k),
            )}
            currentQuestionId={session.currentQuestionId}
            client={client}
            session={session}
          />
        </nav>

        {/* ─── אזור השאלה ─── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.6rem', fontSize: '13px', color: 'var(--gray-500)' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void goBack()}
              disabled={!canGoBack || saving}
              style={{ opacity: canGoBack ? 1 : 0.35 }}
            >
              → שאלה קודמת
            </button>
            <span className="num">
              פרק {currentChapterIdx + 1} מתוך {chapters.length} · נותרו כ-{remaining} שאלות
            </span>
          </div>

          <div className="card">
            <div className="card-body">
              {(() => {
                const eligible =
                  node.validationMode &&
                  !!node.deriveAnswerFromCard &&
                  !!previewItems &&
                  previewItems.length > 0 &&
                  previewItems.every((it) => !it.missing) &&
                  !!onPatchClient;
                if (eligible && node.deriveAnswerFromCard) {
                  const derived = node.deriveAnswerFromCard({ client: client ?? undefined, model: session.model });
                  if (derived !== null) {
                    return (
                      <ValidationCard
                        node={node}
                        previewItems={previewItems!}
                        client={client}
                        derivedAnswer={derived}
                        disabled={saving}
                        onConfirm={() => void handleSubmit(derived)}
                        onIrrelevant={() => void handleSubmit(irrelevantValue(node.type))}
                        onPatchClient={onPatchClient!}
                      />
                    );
                  }
                }
                const canEditCard = !!node.editTarget && !!client && !!onPatchClient;
                return (
                  <>
                    {previewItems && previewItems.length > 0 && (
                      <div>
                        <DataPreviewBox items={previewItems} />
                        {canEditCard && (
                          <div style={{ marginTop: '-.6rem', marginBottom: '1rem', textAlign: 'left' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setCardEditorOpen(true)}
                            >
                              השלם / עדכן בכרטיס
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {priorAnswers.has(node.id) && (
                      <div className="ar-note" style={{ marginBottom: '.75rem' }}>
                        ℹ ענית על השאלה הזו קודם. התשובה כבר מסומנת - לחץ "המשך" לאישור, או שנה לפי הצורך.
                      </div>
                    )}
                    <QuestionCard
                      node={node}
                      initialValue={priorAnswers.get(node.id)}
                      disabled={saving}
                      onSubmit={(value) => void handleSubmit(value)}
                    />
                    {canEditCard && (!previewItems || previewItems.length === 0) && (
                      <div style={{ marginTop: '.6rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setCardEditorOpen(true)}
                        >
                          עדכן בכרטיס הלקוח
                        </button>
                      </div>
                    )}
                    {cardEditorOpen && client && node.editTarget && onPatchClient && (
                      <CardSectionEditor
                        client={client}
                        editTarget={node.editTarget}
                        onPatchClient={onPatchClient}
                        onClose={() => setCardEditorOpen(false)}
                      />
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* ─── שקיפות: מה השאלה מזינה ─── */}
          {uniqueCodes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', marginTop: '.7rem', fontSize: '12px', color: 'var(--gray-500)', flexWrap: 'wrap' }}>
              מתעדכן:
              <span className="ar-pill">
                כרטיס הלקוח
              </span>
              <span className="ar-pill num">
                טופס 1301 · שדות {uniqueCodes.join(', ')}
              </span>
            </div>
          )}

          {error && <ErrorBox message={error} />}

          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void restart()} disabled={saving}>
              התחל מחדש
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="ar-note is-danger" style={{ marginTop: '1rem' }}>
      שגיאה בשמירה: {message}
    </div>
  );
}

// ─── רכיב תצוגת preview של נתונים קיימים מהכרטיס ──────────────────────────

function DataPreviewBox({ items }: { items: QuestionPreviewItem[] }) {
  return (
    <div
      className="ar-panel" style={{ marginBottom: '1rem' }}
    >
      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--gray-700)', marginBottom: '.6rem' }}>
        הנתונים הקיימים בכרטיס הלקוח
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--gray-100)' }}>
              <td style={{ padding: '.4rem 0', color: 'var(--gray-500)', width: '35%', fontSize: '14px' }}>
                {item.label}
              </td>
              <td style={{ padding: '.4rem 0', fontWeight: 500 }}>
                {item.missing ? (
                  <span style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>
                    (לא הוזן)
                  </span>
                ) : (
                  item.value
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ערך "לא רלוונטי השנה" עבור שאלה ב-ValidationCard ─────────────────────

function irrelevantValue(type: 'boolean' | 'number' | 'single_select' | 'multi_select' | 'text'): AnswerValue {
  if (type === 'boolean') return false;
  if (type === 'number') return 0;
  if (type === 'multi_select') return [];
  return '';
}

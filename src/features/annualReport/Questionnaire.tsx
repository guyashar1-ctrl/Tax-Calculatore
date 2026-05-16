import { useMemo, useEffect, useState } from 'react';
import type { AnnualReportSession, AnswerValue, QuestionPreviewItem } from './types';
import type { Client } from '../../types';
import { useAnnualReportFlow } from './useAnnualReportSession';
import { getQuestionById } from './engine';
import { estimateTotalQuestions } from './tree';
import { getAnswersForSession } from './repository';
import QuestionCard from './QuestionCard';

interface Props {
  initialSession: AnnualReportSession;
  clientName: string;
  client?: Client | null;
  onFinished: (session: AnnualReportSession) => void;
  onExit: () => void;
}

export default function Questionnaire({ initialSession, clientName, client, onFinished, onExit }: Props) {
  const flow = useAnnualReportFlow(initialSession);
  const { session, saving, error, submitAnswer, restart, isFinished } = flow;

  // טעינת תשובות קודמות מ-DB — כדי לסמן תשובות קיימות כברירת מחדל בכל שאלה.
  // עובד הן לזרימה רגילה (אחרי "שמור וצא" וחזרה) והן לעריכה (איפוס לשורש).
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
  const totalEst = estimateTotalQuestions(session.model);
  const answered = countAnswered(session.model);
  const progress = totalEst > 0 ? Math.min(100, Math.round((answered / totalEst) * 100)) : 0;

  // עוטף ל-submitAnswer שמעדכן גם את ה-map המקומי של התשובות הקודמות,
  // כך שאם המשתמש חוזר לשאלה הוא רואה את הערך החדש שלו, לא הישן.
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
    return (
      <div className="card" style={{ maxWidth: 700, margin: '2rem auto', padding: '2rem', textAlign: 'center' }}>
        <h3>השאלון הסתיים</h3>
        <button className="btn btn-primary" onClick={() => onFinished(session)}>המשך לתצוגת התוצאות</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '1.5rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ color: 'var(--gray-600)' }}>
          <strong>{clientName}</strong> · שנת מס <strong>{session.taxYear}</strong>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onExit}>שמור וצא</button>
      </div>

      <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden', marginBottom: '.4rem' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--blue)', transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: '.85rem', color: 'var(--gray-500)', marginBottom: '1.5rem' }}>
        שאלה {answered + 1} מתוך ~{totalEst}
      </div>

      <div className="card">
        <div className="card-body">
          {previewItems && previewItems.length > 0 && (
            <DataPreviewBox items={previewItems} />
          )}
          {priorAnswers.has(node.id) && (
            <div style={{ marginBottom: '.75rem', padding: '.4rem .75rem', background: 'var(--blue-light)', borderRadius: 4, fontSize: '.85rem', color: 'var(--gray-700)' }}>
              ℹ ענית על השאלה הזו קודם. התשובה כבר מסומנת — לחץ "המשך" לאישור, או שנה לפי הצורך.
            </div>
          )}
          <QuestionCard
            node={node}
            initialValue={priorAnswers.get(node.id)}
            disabled={saving}
            onSubmit={(value) => void handleSubmit(value)}
          />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: '1rem', padding: '.75rem 1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: 6 }}>
          שגיאה בשמירה: {error}
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => void restart()} disabled={saving}>
          התחל מחדש
        </button>
      </div>
    </div>
  );
}

// ─── רכיב תצוגת preview של נתונים קיימים מהכרטיס ──────────────────────────

function DataPreviewBox({ items }: { items: QuestionPreviewItem[] }) {
  return (
    <div
      style={{
        background: 'var(--gray-50)',
        border: '1px solid var(--gray-200)',
        borderRadius: 8,
        padding: '.85rem 1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: '.6rem' }}>
        📇 הנתונים הקיימים בכרטיס הלקוח
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--gray-100)' }}>
              <td style={{ padding: '.4rem 0', color: 'var(--gray-500)', width: '35%', fontSize: '.9rem' }}>
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

// ─── ספירת שאלות שנענו על בסיס המודל ─────────────────────────────────────

function countAnswered(model: AnnualReportSession['model']): number {
  let n = 0;
  // הגנה: בנתיב טעינת סשן ישן ייתכן שחלק מהנתיבים חסרים. אנחנו לא מסתכנים.
  const id = model.identity ?? {};
  const sp_ = model.spouse ?? {};
  const inc = model.income ?? { sources: [] as string[] };
  const tp = model.taxPaid ?? {};
  const ded = model.deductionsCredits ?? {};
  const sit = model.specialSituations ?? {};

  // זהות + משפחה
  if (id.maritalStatus) n++;
  if (id.spouseHasIncome !== undefined) n++;
  if (sp_.registeredRole) n++;
  if (sp_.has106 !== undefined) n++;
  if (sp_.hasBusinessIncome !== undefined) n++;
  if (sp_.eligibleSeparateCalc !== undefined) n++;
  if (id.childrenCount !== undefined) n++;
  if (id.childrenWithSpecialNeeds !== undefined) n++;
  if (id.residencyType) n++;
  if (id.livesInQualifyingSettlement !== undefined) n++;
  if (id.hasDisability !== undefined) n++;
  if (id.disabilityBand) n++;

  // הכנסות
  if (inc.sources && inc.sources.length > 0) n++;
  if (inc.salaryEmployerCount !== undefined) n++;
  if (inc.receivedSeverance !== undefined) n++;
  if (inc.businessKind) n++;
  if (inc.bizRevenueBand) n++;
  if (inc.bizHasClientWithholding !== undefined) n++;
  if (inc.rentalTrack) n++;
  if (inc.rentalGrossAnnual !== undefined) n++;
  if (inc.capitalSubTypes && inc.capitalSubTypes.length > 0) n++;
  if (inc.capitalHasWithholding !== undefined) n++;
  if (inc.isControllingShareholder !== undefined) n++;
  if (inc.hasInterestIncome !== undefined) n++;
  if (inc.interestHasWithholding !== undefined) n++;
  if (inc.hasPensionIncome !== undefined) n++;
  if (inc.hasOtherIncome !== undefined) n++;
  if (inc.foreignCountries !== undefined) n++;
  if (inc.foreignIncomeKinds && inc.foreignIncomeKinds.length > 0) n++;
  if (inc.foreignPaidTaxAbroad !== undefined) n++;

  // ניכויים וזיכויים
  if (ded.donationAmount !== undefined) n++;
  if (ded.lifeInsuranceAnnual !== undefined) n++;
  if (ded.selfPensionDeposits !== undefined) n++;
  if (ded.hasKerenHashtalmutSelf !== undefined) n++;
  if (ded.isDischargedSoldier !== undefined) n++;
  if (ded.hasAcademicDegree !== undefined) n++;

  // מיסים ששולמו
  if (tp.paidAdvancePayments !== undefined) n++;
  if (tp.withholdingSources !== undefined) n++;

  // נסיבות מיוחדות
  if (sit.hasCarriedLosses !== undefined) n++;
  if (sit.wealthDeclarationRequired !== undefined) n++;
  if (sit.electsSection14 !== undefined) n++;

  return n;
}


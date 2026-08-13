// ─── מסך מרכזי של מודול הדוח השנתי 1301 ────────────────────────────────────

import { useEffect, useState } from 'react';
import type { Client } from '../../types';
import type { AnnualReportSession } from './types';
import { useAnnualReportSessions } from './useAnnualReportSession';
import AnnualReportEntry from './AnnualReportEntry';
import Questionnaire from './Questionnaire';
import AnnualReportOutput from './AnnualReportOutput';
import AnswersReview from './AnswersReview';
import SyncConfirmation from './SyncConfirmation';
import { proposeTaxFacts, recordManualFactChange } from '../../lib/taxFacts';
import { clientFromDb } from '../../lib/dbMappers';
import TaxConstantsDashboard from './TaxConstantsDashboard';
import TreeMapView from './TreeMapView';
import CoverageGate from './CoverageGate';
import { seedModelFromClient } from './profile';

type Mode = 'entry' | 'questionnaire' | 'sync_confirmation' | 'answers_review' | 'gate' | 'output' | 'dashboard' | 'treemap';

// ‼ בקר גישה — "עדכן בכרטיס" בתוך השאלון (CardSectionEditor, מופעל דרך
// Questionnaire.onPatchClient) הוא הרו"ח שמקליד ערך בעצמו תוך כדי מילוי
// השאלון — לא הצעה ממתינה. אבל הוא נוגע באותם שדות מקצועיים בדיוק
// שהתאמה מנהלת, ולכן חייב לעבור באותו allowlist טרנזקציוני עם היסטוריה
// (record_manual_fact_change) ולא ב-updateClient() גולמי — אחרת זו בדיוק
// דריסה שקטה של עובדה מקובלת. שדות זיהוי/קשר (שם, כתובת, ת.ז.) אינם
// עובדות מקצועיות מבחינת הארכיטקטורה המאושרת וממשיכים בנתיב הרגיל.
// הרשימה זהה ל-allowlist בשרת: supabase/91-tax-fact-transactions.sql.
const GOVERNED_FACT_KEYS = new Set([
  'familyStatus', 'isNewImmigrant', 'aliyahYear', 'isReturningResident', 'disabilityPercentage',
  'hasAcademicDegree', 'academicDegreeYear', 'completedIdf', 'idfReleaseYear',
  'completedNationalService', 'nationalServiceYear', 'donationsAnnual', 'lifeInsuranceAnnual',
  'hasLifeInsurance', 'isFamilyCompanyMember', 'isForeignControllingShareholder', 'isKibbutzMember',
  'isSubstantialShareholder', 'hasResidentialProperty', 'numberOfProperties', 'hasCapitalIncome',
  'hasGamblingIncome', 'hasForeignAssets', 'spouseWorking', 'rentalTaxTrack', 'hasInvestments',
  'hasPension', 'taxFiles', 'bankAccounts', 'investmentAccounts', 'children', 'employers', 'pensionFunds',
]);

const GOVERNED_FIELD_LABELS: Record<string, string> = {
  familyStatus: 'מצב משפחתי', isNewImmigrant: 'עולה חדש', aliyahYear: 'שנת עלייה',
  isReturningResident: 'תושב חוזר', disabilityPercentage: 'אחוז נכות',
  hasAcademicDegree: 'תואר אקדמי', academicDegreeYear: 'שנת קבלת התואר',
  completedIdf: 'שירות צבאי', idfReleaseYear: 'שנת שחרור',
  completedNationalService: 'שירות לאומי', nationalServiceYear: 'שנת סיום שירות לאומי',
  donationsAnnual: 'תרומות שנתיות', lifeInsuranceAnnual: 'ביטוח חיים שנתי',
  hasLifeInsurance: 'ביטוח חיים', isFamilyCompanyMember: 'חברה משפחתית',
  isForeignControllingShareholder: 'שליטה בחברה זרה', isKibbutzMember: 'חבר קיבוץ',
  isSubstantialShareholder: 'בעל מניות מהותי', spouseWorking: 'תעסוקת בן/בת הזוג',
  children: 'רשימת ילדים', employers: 'רשימת מעבידים', pensionFunds: 'קופות פנסיה',
  hasPension: 'פנסיה', investmentAccounts: 'חשבונות השקעה', hasInvestments: 'השקעות',
  bankAccounts: 'חשבונות בנק', taxFiles: 'תיקי רשויות', rentalTaxTrack: 'מסלול מיסוי שכירות',
  hasResidentialProperty: 'נכס דיור', numberOfProperties: 'מספר נכסים',
  hasCapitalIncome: 'פעילות בשוק ההון', hasGamblingIncome: 'הכנסות מהגרלות',
  hasForeignAssets: 'נכסים בחו״ל',
};

interface Props {
  clients: Client[];
  userId: string | undefined;
  onUpdateClient?: (client: Client) => Promise<Client>;
  /** מציב לקוח שכבר נכתב בשרת (RPC טרנזקציוני) בקאש המקומי בלי כתיבה נוספת —
   *  ראה useClients().applyClientLocally. */
  onClientLocallyUpdated?: (client: Client) => void;
  /** בחירה מוקדמת (מ"פתח ←" בכרטיס הלקוח) — נפתחת אוטומטית פעם אחת. */
  initialSelection?: { clientId: string; taxYear: number } | null;
  onConsumeInitialSelection?: () => void;
}

export default function AnnualReport({ clients, userId, onUpdateClient, onClientLocallyUpdated, initialSelection, onConsumeInitialSelection }: Props) {
  const { sessions, loading, startOrResume, removeSession, restartForEdit } = useAnnualReportSessions(userId);
  const [mode, setMode] = useState<Mode>('entry');
  const [currentSession, setCurrentSession] = useState<AnnualReportSession | null>(null);

  // פתיחה אוטומטית של תיק שנבחר מהכרטיס
  useEffect(() => {
    if (!initialSelection) return;
    void handleStart(initialSelection.clientId, initialSelection.taxYear);
    onConsumeInitialSelection?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelection?.clientId, initialSelection?.taxYear]);

  // אם session מסומן כ-mapping_done/review, פתח את ה-output ישר
  // (אבל לא אם המשתמש כרגע במצב sync_confirmation — שזה שלב ביניים אחרי השאלון).
  useEffect(() => {
    // ניתוב אוטומטי רק ממסכי הכניסה — מסכים שנבחרו במפורש (מאזן, מפה, עריכה,
    // סנכרון) לא נדרסים כשהסשן מתעדכן בתוכם.
    if (mode !== 'entry' && mode !== 'questionnaire') return;
    if (currentSession && (currentSession.status === 'review' || currentSession.status === 'mapping_done')) {
      setMode('output');
    } else if (currentSession && currentSession.status === 'in_progress') {
      setMode('questionnaire');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession]);

  async function handleStart(clientId: string, taxYear: number) {
    const s = await startOrResume(clientId, taxYear);
    // עובדות שנגזרות מהכרטיס (ישוב מזכה לפי כתובת) נזרעות למודל בלי לשאול.
    const client = clients.find((c) => c.id === clientId);
    setCurrentSession(client ? { ...s, model: seedModelFromClient(s.model, client) } : s);
  }

  function handleQuestionnaireFinished(session: AnnualReportSession) {
    setCurrentSession(session);
    // אם יש לקוח + onUpdateClient — קודם מסך Sync Confirmation, אחר כך פלט.
    if (onUpdateClient && clients.find((c) => c.id === session.clientId)) {
      setMode('sync_confirmation');
    } else {
      setMode('output');
    }
  }

  function handleExitToEntry() {
    setCurrentSession(null);
    setMode('entry');
  }

  function handleBackToQuestionnaire() {
    if (currentSession) setMode('questionnaire');
  }

  function handleOpenAnswersReview() {
    if (currentSession) setMode('answers_review');
  }

  function handleBackToOutput() {
    if (currentSession) setMode('output');
  }

  async function handleDeleteSession(sessionId: string) {
    await removeSession(sessionId);
    if (currentSession && currentSession.id === sessionId) {
      setCurrentSession(null);
      setMode('entry');
    }
  }

  // עריכה דרך עץ ההחלטות: מאפס לשורש; תשובות קיימות נטענות כ-prefill בשאלון.
  async function handleStartEditViaTree() {
    if (!currentSession) return;
    const updated = await restartForEdit(currentSession.id);
    setCurrentSession(updated);
    setMode('questionnaire');
  }

  const selectedClient = currentSession
    ? clients.find((c) => c.id === currentSession.clientId) ?? null
    : null;
  const clientName = selectedClient
    ? `${selectedClient.firstName} ${selectedClient.lastName}`.trim() || 'לקוח'
    : '';

  // ─── סרגל ניווט פנימי ─────────────────────────────────────────────
  return (
    <div className="annual-report-page pg-split">
      {/* מסילה, לא סרגל טאבים. חמשת השלבים הראשונים הם רצף שעוברים בו לפי
          סדר — בעמודה, עם מספר לכל שלב, הם נקראים כרצף; בשורה הם נקראו
          כחמישה יעדים שווי-ערך. שני הכלים אינם חלק מהרצף ולכן מקובצים בנפרד. */}
      <nav className="pg-rail" aria-label="שלבי הדוח השנתי">
        <div className="pg-rail-eyebrow">הדוח</div>
        {([
          { id: 'entry', label: 'התחל', needsSession: false, go: () => { setCurrentSession(null); setMode('entry'); } },
          { id: 'questionnaire', label: 'שאלון', needsSession: true, go: () => setMode('questionnaire') },
          { id: 'answers_review', label: 'ערוך תשובות', needsSession: true, go: handleOpenAnswersReview },
          { id: 'gate', label: 'מאזן כיסוי', needsSession: true, go: () => setMode('gate') },
          { id: 'output', label: 'פלט ומיפוי', needsSession: true, go: () => setMode('output') },
        ] as const).map((step, i) => (
          <button
            key={step.id}
            type="button"
            className={`pg-rail-item ${mode === step.id ? 'is-active' : ''}`}
            disabled={step.needsSession && !currentSession}
            onClick={step.go}
            aria-current={mode === step.id ? 'true' : undefined}
          >
            <span className="pg-rail-name">{step.label}</span>
            <span className="pg-rail-state">{i + 1}</span>
          </button>
        ))}

        <div className="pg-rail-eyebrow">כלים</div>
        <button
          type="button"
          className={`pg-rail-item ${mode === 'treemap' ? 'is-active' : ''}`}
          onClick={() => setMode('treemap')}
        >
          <span className="pg-rail-name">מפת העץ</span>
        </button>
        <button
          type="button"
          className={`pg-rail-item ${mode === 'dashboard' ? 'is-active' : ''}`}
          onClick={() => setMode('dashboard')}
        >
          <span className="pg-rail-name">מסד נתוני מס</span>
        </button>
      </nav>

      <div className="pg-pane">

      {mode === 'entry' && (
        <AnnualReportEntry
          clients={clients}
          existingSessions={sessions}
          onStart={handleStart}
          onDeleteSession={handleDeleteSession}
          loading={loading}
        />
      )}

      {mode === 'questionnaire' && currentSession && (
        <Questionnaire
          initialSession={currentSession}
          clientName={clientName}
          client={selectedClient}
          onFinished={handleQuestionnaireFinished}
          onExit={handleExitToEntry}
          onPatchClient={onUpdateClient && selectedClient ? async (partial) => {
            const entries = Object.entries(partial);
            const governed = entries.filter(([k]) => GOVERNED_FACT_KEYS.has(k));
            const plain = entries.filter(([k]) => !GOVERNED_FACT_KEYS.has(k));

            // שדות זיהוי/קשר — לא עובדה מקצועית, ממשיכים בנתיב הרגיל.
            if (plain.length > 0) {
              await onUpdateClient({
                ...selectedClient, ...Object.fromEntries(plain), updatedAt: new Date().toISOString(),
              });
            }
            // עובדות מקצועיות — הרו"ח מקליד כאן ערך בעצמו (סמכות סופית), אבל
            // דרך אותה פעולה טרנזקציונית עם היסטוריה כמו עריכה ידנית בתיק המס.
            if (governed.length > 0) {
              const patch = Object.fromEntries(governed);
              const labels = governed.map(([k]) => GOVERNED_FIELD_LABELS[k] ?? k);
              const res = await recordManualFactChange(
                selectedClient.id,
                'questionnaire-card-edit',
                `עדכון מתוך השאלון · ${labels.join(', ')}`,
                'לפני העדכון',
                'עודכן מתוך השאלון',
                patch,
              );
              if (!res.ok) throw new Error(res.error || 'העדכון נכשל');
              // הכתיבה כבר קרתה בשרת — רק מציבים את הלקוח המעודכן בקאש
              // המקומי, לא כותבים אותו שוב דרך onUpdateClient.
              if (res.client) onClientLocallyUpdated?.(clientFromDb(res.client));
            }
          } : undefined}
        />
      )}

      {mode === 'sync_confirmation' && currentSession && selectedClient && onUpdateClient && (
        <SyncConfirmation
          session={currentSession}
          client={selectedClient}
          onProposeChanges={(items) =>
            proposeTaxFacts(selectedClient.id, 'questionnaire', currentSession.id, items)}
          onContinue={() => setMode('output')}
        />
      )}

      {mode === 'answers_review' && currentSession && (
        <AnswersReview
          session={currentSession}
          clientName={clientName}
          onStartEdit={handleStartEditViaTree}
          onBackToOutput={handleBackToOutput}
        />
      )}

      {mode === 'output' && currentSession && (
        <AnnualReportOutput
          session={currentSession}
          clientName={clientName}
          client={selectedClient}
          onBackToQuestionnaire={handleBackToQuestionnaire}
          onOpenAnswersReview={handleOpenAnswersReview}
          onMarkDone={async () => {
            const { updateSessionState } = await import('./repository');
            const updated = await updateSessionState(currentSession.id, { status: 'mapping_done' });
            setCurrentSession(updated);
          }}
          onRestart={async () => {
            const { updateSessionState } = await import('./repository');
            const { emptyModel } = await import('./types');
            const { getRootQuestion } = await import('./engine');
            const updated = await updateSessionState(currentSession.id, {
              model: emptyModel(currentSession.taxYear),
              currentQuestionId: getRootQuestion().id,
              status: 'in_progress',
              completedAt: null,
            });
            setCurrentSession(updated);
            setMode('questionnaire');
          }}
        />
      )}

      {mode === 'gate' && currentSession && (
        <CoverageGate
          session={currentSession}
          clientName={clientName}
          client={selectedClient}
          onSessionUpdate={setCurrentSession}
          onReady={() => setMode('output')}
        />
      )}

      {mode === 'treemap' && <TreeMapView clients={clients} sessions={sessions} />}

      {mode === 'dashboard' && <TaxConstantsDashboard />}
      </div>
    </div>
  );
}

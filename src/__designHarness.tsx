// ─────────────────────────────────────────────────────────────────────────────
// רתמת בדיקה זמנית · לא חלק מהאפליקציה
// מרכיבה מסכי דוח שנתי שלא ניתן להגיע אליהם עם משתמש הבדיקה (חסום לכתיבה
// ב-Supabase), כדי לבדוק אותם ויזואלית מול שפת העיצוב. נמחקת בסוף העבודה.
// ─────────────────────────────────────────────────────────────────────────────
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './components/ui/ui.css';
import './components/ui/pivo-design.css';
import Questionnaire from './features/annualReport/Questionnaire';
import CoverageGate from './features/annualReport/CoverageGate';
import AnnualReportOutput from './features/annualReport/AnnualReportOutput';
import AnswersReview from './features/annualReport/AnswersReview';
import TaxSnapshot from './features/annualReport/TaxSnapshot';
import type { AnnualReportSession } from './features/annualReport/types';
import { emptyModel } from './features/annualReport/types';
import type { Client } from './types';

const client = {
  id: 'harness-1', idNumber: '123456789', firstName: 'דוד', lastName: 'כהן',
  birthDate: '1980-05-01', gender: 'male', phone: '050-1234567', email: 'a@b.co',
  city: 'תל אביב', address: 'הרצל 1', incomeTaxType: 'employee', vatStatus: 'none',
  businessDescription: '', familyStatus: 'married', children: [], properties: [],
  contacts: [], taxFiles: [
    { id: 'f1', authority: 'income_tax', fileNumber: '123456789', owner: 'client', repStatus: 'active' },
    { id: 'f2', authority: 'national_insurance', fileNumber: '123456789', owner: 'client', repStatus: 'pending' },
  ],
  tags: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
} as unknown as Client;

const session: AnnualReportSession = {
  id: 'harness-session', userId: 'u', clientId: client.id, taxYear: 2025,
  status: 'in_progress', model: emptyModel(2025), currentQuestionId: 'year_map',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', completedAt: null,
};

const SCREENS = ['שאלון', 'מאזן כיסוי', 'פלט ומיפוי', 'סקירת תשובות', 'תמונת מצב'] as const;

function Harness() {
  const [screen, setScreen] = useState<(typeof SCREENS)[number]>('שאלון');
  const noop = () => {};
  const anoop = async () => {};
  return (
    <div className="app">
      <header className="header">
        <nav className="main-nav">
          {SCREENS.map((s) => (
            <button key={s} className={`nav-tab ${screen === s ? 'active' : ''}`} onClick={() => setScreen(s)}>{s}</button>
          ))}
        </nav>
      </header>
      <main className="main annual-report-page">
        {screen === 'שאלון' && (
          <Questionnaire initialSession={session} clientName="דוד כהן" client={client} onFinished={noop} onExit={noop} />
        )}
        {screen === 'מאזן כיסוי' && (
          <CoverageGate session={session} clientName="דוד כהן" client={client} onSessionUpdate={noop} onReady={noop} />
        )}
        {screen === 'פלט ומיפוי' && (
          <AnnualReportOutput session={session} clientName="דוד כהן" client={client}
            onBackToQuestionnaire={noop} onOpenAnswersReview={noop} onMarkDone={anoop} onRestart={anoop} />
        )}
        {screen === 'סקירת תשובות' && (
          <AnswersReview session={session} clientName="דוד כהן" onStartEdit={anoop} onBackToOutput={noop} />
        )}
        {screen === 'תמונת מצב' && <TaxSnapshot client={client} sessions={[session]} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);

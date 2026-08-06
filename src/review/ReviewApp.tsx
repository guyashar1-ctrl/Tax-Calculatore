// ─── סביבת סקירה ויזואלית · שלבים 0–5 ────────────────────────────────────────
// ‼ קיים רק בענף הסקירה. אינו מיועד למיזוג ל-master.
//
// המסכים הם רכיבי המוצר האמיתיים — TaskBoard, ClientList, JourneyTab — על
// נתונים סינתטיים (src/review/fixtures.ts). לחיצה על אדם פותחת את המסע שלו,
// בדיוק כמו במוצר. רק המעטפת נבנתה כאן מחדש, כי המעטפת האמיתית יושבת בתוך
// App.tsx ואינה ניתנת להפרדה מהתחברות ומהרשאות.

import { useEffect, useMemo, useState } from 'react';
import { PivoMark } from '../components/PivoMark';
import Icon from '../components/ui/Icon';
import { useTheme } from '../hooks/useTheme';
import TaskBoard from '../components/TaskBoard';
import ClientList from '../components/ClientList';
import JourneyTab from '../components/clientTabs/JourneyTab';
import type { Client } from '../types';
import { LIFECYCLE_STAGE_LABELS, REPRESENTATION_STATUS_LABELS } from '../types';
import { bindReviewCloseStore } from './closeReadiness';
import {
  CLIENTS, LEADS, LEAD_ID_BY_CLIENT, REQUESTS,
  ENGAGEMENTS, STEPS, QUOTATIONS, TASKS, ago,
} from './fixtures';
import type { EmailMessage } from '../types/emailActivity';
import type { AnnualReportSession } from '../features/annualReport/types';

const noop = () => {};

/** יומן מיילים סינתטי — מזין את לוח האירועים של ההצעה ואת מקטע המיילים. */
const EMAILS: EmailMessage[] = [
  { id: 'm1', kind: 'quotation', status: 'opened', toEmail: 'michal@synthetic.invalid',
    subject: 'הצעת מחיר ממשרד גיא ישר', sentAt: ago(4), deliveredAt: ago(4), openedAt: ago(2),
    clientId: 'c-quoted-michal' },
  { id: 'm2', kind: 'quotation_reminder', status: 'delivered', toEmail: 'michal@synthetic.invalid',
    subject: 'תזכורת — הצעת המחיר', sentAt: ago(1), deliveredAt: ago(1), clientId: 'c-quoted-michal' },
  { id: 'm3', kind: 'client_page', status: 'opened', toEmail: 'ilan@synthetic.invalid',
    subject: 'הדף האישי שלך', sentAt: ago(24), deliveredAt: ago(24), openedAt: ago(23),
    clientId: 'c-act-ilan' },
] as unknown as EmailMessage[];

const SESSIONS: AnnualReportSession[] = [
  { id: 'ss1', clientId: 'c-act-ilan', taxYear: 2025, status: 'in_progress', createdAt: ago(30), updatedAt: ago(2),
    model: { income: { sources: ['business'] }, meta: { docStatuses: { a: 'received', b: 'received', c: 'requested', d: 'pending' }, unknownQuestions: ['q17'] } } },
  { id: 'ss2', clientId: 'c-act-ilan', taxYear: 2024, status: 'mapping_done', createdAt: ago(400), updatedAt: ago(360),
    model: { income: { sources: ['business'] }, meta: { docStatuses: { a: 'received', b: 'received' }, unknownQuestions: [] } } },
] as unknown as AnnualReportSession[];

type Screen = 'tasks' | 'clients' | 'journey';

/** קיצורי דרך — כל מצב שהעיצוב מגדיר, בלחיצה אחת. */
const SHORTCUTS: { label: string; clientId: string }[] = [
  { label: 'ליד', clientId: 'c-lead-tal' },
  { label: 'ליד · לא רלוונטי', clientId: 'c-lead-ron' },
  { label: 'הצעה · נצפתה', clientId: 'c-quoted-michal' },
  { label: 'הצעה · פג תוקף', clientId: 'c-quoted-dana' },
  // ‼ הרצף המאושר המלא ראשון — לא דוגמה גנרית (דרישה 16)
  { label: 'קליטה · הרצף המלא', clientId: 'c-onb-yuval' },
  { label: 'קליטה · בונה התהליך', clientId: 'c-onb-shmulik' },
  { label: 'קליטה · בקשה נדרשת חוסמת', clientId: 'c-onb-lehem' },
  { label: 'קליטה · רק רשות פתוחה', clientId: 'c-onb-ori' },
  { label: 'פעיל · חריגות', clientId: 'c-act-ilan' },
  { label: 'פעיל · שקט', clientId: 'c-act-orit' },
];

export default function ReviewApp() {
  const [screen, setScreen] = useState<Screen>('clients');
  const [clients, setClients] = useState(CLIENTS);
  const [engagements, setEngagements] = useState(ENGAGEMENTS);
  const [steps] = useState(STEPS);
  const [cardTab, setCardTab] = useState<'journey'|'dossier'|'docs'|'tasks'>('journey');
  const [toast, setToast] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>('c-act-ilan');
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  /* ‼ הלשונית של מסך הלקוחות נשמרת ב-localStorage. בסקירה זה גרם למסך
     להיפתח על לשונית ריקה משיטוט קודם ("0 אנשים"). כאן מאפסים אותה פעם
     אחת בטעינה, כך שהסקירה תמיד נפתחת על מצב מאוכלס. */
  useEffect(() => { try { localStorage.removeItem('crm_clients_tab'); } catch { /* אין אחסון */ } }, []);

  const openClient = (id: string) => { setClientId(id); setCardTab('journey'); setScreen('journey'); };

  /* ‼ מה שהשרת עושה בסגירת קליטה, מסומלץ כאן בזיכרון בלבד: ההתקשרות
     עוברת ל-active והאדם עובר לשלב "לקוח פעיל". בלי זה אי אפשר לראות
     בסקירה שהסגירה באמת מזיזה אדם — רק שהכפתור נלחץ. אין כאן כתיבה
     לשום מקום; ריענון הדף מחזיר את המצב ההתחלתי. */
  /* ‼ הסגירה עצמה נעשית דרך המסלול האמיתי: הכפתור קורא ל-close_onboarding,
     והבדל מריץ את כללי המוכנות. כאן רק מוחל מה שהשרת היה מחיל אחרי ok —
     ההתקשרות עוברת ל-active והאדם לשלב "לקוח פעיל". אין כתיבה לשום מקום;
     ריענון הדף מחזיר את המצב ההתחלתי. */
  bindReviewCloseStore({
    steps,
    engagements,
    onClosed: (engagementId, forced) => {
      const eng = engagements.find(e => e.id === engagementId);
      if (!eng) return;
      setEngagements(prev => prev.map(e => e.id === engagementId
        ? { ...e, status: 'active', activatedAt: new Date().toISOString() } : e));
      setClients(prev => prev.map(c => c.id === eng.clientId ? { ...c, lifecycleStage: 'active' } : c));
      setToast(forced
        ? 'הקליטה נסגרה למרות שנותרו שלבים נדרשים — הם נשארו כבקשות פתוחות.'
        : 'הקליטה נסגרה — האדם עבר ל«לקוח פעיל».');
    },
  });
  const client: Client = clients.find(c => c.id === clientId) ?? clients[0];

  const openTasksCount = TASKS.filter(t => t.status === 'open' && (t.ballWith === 'me' || t.ballWith === 'stuck')).length;
  const clientTasks = useMemo(() => TASKS.filter(t => t.clientId === client.id), [client.id]);
  const openClientTasks = clientTasks.filter(t => t.status === 'open');

  return (
    <>
      <ReviewBanner theme={theme} onToggleTheme={toggleTheme} />

      <div className="app">
        <header className="header">
          <button type="button" className="header-logo" onClick={() => setScreen('tasks')} aria-label="חזרה למשימות">
            <span className="brand-lockup"><PivoMark size={28} /><span className="brand-wordmark">PIVO</span></span>
          </button>

          <nav className="main-nav">
            <button className={`nav-tab ${screen === 'tasks' ? 'active' : ''}`} onClick={() => setScreen('tasks')}>
              משימות{openTasksCount > 0 && <span className="nav-badge">{openTasksCount}</span>}
            </button>
            <button className={`nav-tab ${screen !== 'tasks' ? 'active' : ''}`} onClick={() => setScreen('clients')}>
              לקוחות
            </button>
          </nav>

          <div className="header-actions">
            <button type="button" className="header-tool-link">הצעות מחיר</button>
            <span className="header-divider" aria-hidden="true" />
            <div className="header-account">
              <button type="button" className={`header-user ${menuOpen ? 'is-open' : ''}`}
                aria-label="חשבון והגדרות" aria-expanded={menuOpen}
                onClick={() => setMenuOpen(v => !v)}>
                <span className="header-user-avatar">ג</span>
              </button>
              {menuOpen && (
                <div className="account-menu">
                  <div className="account-menu-id">
                    <div className="account-menu-name">review@synthetic.invalid</div>
                    <div className="account-menu-firm">גיא ישר · רואה חשבון</div>
                  </div>
                  <button type="button" className="account-menu-item"><Icon name="building" size={14} /><span>המשרד</span></button>
                  <button type="button" className="account-menu-item"><Icon name="book" size={14} /><span>ידע מס</span></button>
                  <span className="account-menu-sep" aria-hidden="true" />
                  <button type="button" className="account-menu-item account-menu-toggle"
                    role="menuitemcheckbox" aria-checked={theme === 'dark'} onClick={toggleTheme}>
                    <Icon name="moon" size={14} /><span>מצב כהה</span>
                  </button>
                  <button type="button" className="account-menu-item"><Icon name="logout" size={14} /><span>התנתק</span></button>
                </div>
              )}
            </div>
          </div>
        </header>

        {screen === 'journey' && (
          <div className="rv-shortcuts">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setScreen('clients')}>‹ לקוחות</button>
            <span className="rv-shortcuts-sep" aria-hidden="true" />
            {SHORTCUTS.map(s => (
              <button key={s.clientId} type="button"
                className={`btn btn-sm ${clientId === s.clientId ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => openClient(s.clientId)}>{s.label}</button>
            ))}
          </div>
        )}

        <main className={`main ${screen === 'tasks' ? 'tasks-page' : ''}`}>
          {screen === 'tasks' && (
            <TaskBoard
              tasks={TASKS} clients={clients}
              onSelectTask={noop} onAddTask={noop} onToggleDone={noop}
              onChangeStatus={noop} onChangeBall={noop} onChangeCategory={noop}
              onReorder={noop} onSelectClient={openClient} onDeleteTask={noop}
              onboardingSteps={steps} onOpenOnboarding={openClient}
            />
          )}

          {screen === 'clients' && (
            <ClientList
              clients={clients}
              requests={REQUESTS}
              tasks={TASKS}
              onSelect={openClient}
              onAdd={noop} onDelete={noop} onLoadSamples={noop}
              onArchive={async () => {}}
              onAddRequest={noop}
              onSelectRequest={() => openClient('c-onb-yuval')}
              journeyUi
              onboardingSteps={STEPS}
              engagements={engagements}
              onOpenOnboarding={openClient}
              leads={LEADS}
              leadIdByClient={LEAD_ID_BY_CLIENT}
              onOpenLead={() => openClient('c-lead-tal')}
              onNewLead={noop}
              onNewQuotation={noop}
            />
          )}

          {screen === 'journey' && (
            <div className="cw-shell">
              {/* ראש כרטיס הלקוח — הזהות, הפעולות וארבע הלשוניות, כמו במוצר.
                  «התחל דוח שנתי» כאן כדי שאפשר יהיה לסקור את ההפניה אליו. */}
              <div className="rv-client-head">
                <div>
                  <div className="rv-client-name">{`${client.firstName} ${client.lastName ?? ''}`.trim()}</div>
                  <div className="rv-client-meta">
                    {[client.idNumber && `ת.ז. ${client.idNumber}`, client.phone, client.city].filter(Boolean).join(' · ')}
                    {client.lifecycleStage && ` · ${LIFECYCLE_STAGE_LABELS[client.lifecycleStage] ?? client.lifecycleStage}`}
                  </div>
                </div>
                <div className="rv-client-actions">
                  <button type="button" className="btn btn-sm btn-secondary">+ משימה</button>
                  <button type="button" className="btn btn-sm btn-primary"
                    onClick={() => setToast('התחל דוח שנתי — פעולה מושבתת בסביבת הסקירה')}>
                    התחל דוח שנתי
                  </button>
                </div>
              </div>

              <div className="cw-tabs rv-card-tabs" role="tablist">
                {([['journey','המסע'],['dossier','התיק'],['docs','מסמכים'],['tasks','משימות']] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab"
                    aria-selected={cardTab === id}
                    className={`cw-tab ${cardTab === id ? 'is-active' : ''}`}
                    onClick={() => setCardTab(id)}>
                    {label}
                    {id === 'tasks' && openClientTasks.length > 0 && ` ${openClientTasks.length}`}
                  </button>
                ))}
              </div>

              {cardTab !== 'journey' && (
                <div className="cw-empty" style={{ padding: '2rem 0' }}>
                  הלשונית «{({ dossier: 'התיק', docs: 'מסמכים', tasks: 'משימות' } as Record<string, string>)[cardTab]}»
                  אינה נכללת בסקירת שלבים 0–5 — היא מוצגת כאן כדי להראות את הקשר הכרטיס בלבד.
                </div>
              )}

              {cardTab === 'journey' && (
              <JourneyTab
                client={client}
                tasks={clientTasks}
                alerts={client.id === 'c-act-ilan'
                  ? [{ kind: 'withholding_expired', level: 'danger', text: 'אישור ניכוי במקור פג תוקף' } as never]
                  : []}
                openTasks={openClientTasks}
                upcomingDebts={openClientTasks.filter(t => t.ballWith === 'me')}
                quotations={QUOTATIONS}
                engagements={engagements}
                steps={steps}
                events={[]}
                advance={async () => ({ ok: true })}
                lead={LEADS.find(l => l.convertedClientId === client.id)}
                onEditLead={noop}
                repStatusLabel={client.representationStatus ? REPRESENTATION_STATUS_LABELS[client.representationStatus] : undefined}
                onOpenRepresentation={() => setToast('מרכז הייצוג — מסך נפרד, מחוץ לסקירת שלבים 0–5')}
                onPrepareReleaseLetter={() => setToast('חלון מכתב השחרור — שולח מייל, ולכן מושבת בסבירה המבודדת')}
                refreshOnboarding={() => setToast(null)}
                onNewQuotation={noop}
                onOpenQuotation={noop}
                emailsOverride={EMAILS.filter(m => m.clientId === client.id)}
                onPinNote={noop} onAddNote={noop} onGotoTab={noop} onSelectTask={noop}
                taxSessions={SESSIONS.filter(s => s.clientId === client.id)}
                onOpenYear={noop}
              />
              )}
            </div>
          )}
        </main>

        {/* סרגל הניווט התחתון — מופיע במסך צר, כמו במוצר (דרישה 18) */}
        <nav className="mobile-nav" aria-label="ניווט ראשי">
          <button className={`mobile-nav-btn ${screen === 'tasks' ? 'active' : ''}`} onClick={() => setScreen('tasks')}>
            <span>משימות</span>
            {openTasksCount > 0 && <span className="nav-badge">{openTasksCount}</span>}
          </button>
          <button className={`mobile-nav-btn ${screen !== 'tasks' ? 'active' : ''}`} onClick={() => setScreen('clients')}>
            <span>לקוחות</span>
          </button>
        </nav>
      </div>

      {toast && (
        <div className="rv-toast" role="status" onClick={() => setToast(null)}>
          {toast}<span className="rv-toast-x" aria-hidden="true">✕</span>
        </div>
      )}
    </>
  );
}

function ReviewBanner({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  return (
    <div dir="rtl" className="rv-banner">
      <span style={{ fontSize: 14 }}>⚠ SYNTHETIC REVIEW DATA</span>
      <span style={{ fontWeight: 400, opacity: .92 }}>
        נתונים סינתטיים בלבד · אין חיבור למסד · אין שליחת מיילים · הבנייה אינה מכילה מפתחות פרודקשן
      </span>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={onToggleTheme} className="rv-banner-btn">
        {theme === 'dark' ? '☀ מצב בהיר' : '🌙 מצב כהה'}
      </button>
    </div>
  );
}

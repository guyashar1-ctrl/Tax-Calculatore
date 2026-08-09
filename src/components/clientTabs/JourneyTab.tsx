// ─── דף המסע — מה שנפתח כשלוחצים על לקוח ─────────────────────────────────────
// עד עכשיו הלקוח היה מפוזר: מרכז שליטה, לשונית קליטה שמופיעה ונעלמת, ולשונית
// משימות. שלושתם עונים על אותה שאלה — "מה קורה עם האדם הזה" — ולכן הם דף אחד.
//
// המבנה קבוע בכל שלב חיים, ומה שמשתנה הוא רק תוכן הפרק הנוכחי:
//   פס המסע → רצועת המונים → שורות הפרק → פרקים קודמים → עבודה שוטפת
//
// ‼ משימות המשרד אינן שורות מסע. משימה היא עבודה שלי, בקשה היא משהו שאני
// מחכה לו מאדם אחר — ערבוב שלהן היה מוחק את המשמעות של "אצל מי הכדור".

import { useMemo, useState } from 'react';
import type { Client, Task, RepresentationStatus } from '../../types';
import { LIFECYCLE_STAGE_LABELS } from '../../types';
import type { ClientAlert } from '../../types/clientWorkspace';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../../types/onboarding';
import { isStepOpen, stepAwaitsMe, STEP_TYPE_LABELS, STEP_BALL_LABELS } from '../../types/onboarding';
import type { Quotation, Lead } from '../../types/quotations';
import { QUOTATION_STATUS_LABELS } from '../../types/quotations';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import type { AnnualReportSession } from '../../features/annualReport/types';
import type { EmailMessage } from '../../types/emailActivity';
import { formatDate } from '../../utils/dateFormat';
import { useAuth } from '../../hooks/useAuth';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import {
  deriveNextAction, buildQuotationTimeline, leadKnownFacts,
  type NextActionButton,
} from '../../utils/journeyPresentation';
import OnboardingTab from './OnboardingTab';
import ClientCockpitTab from './ClientCockpitTab';

type BallFilter = 'me' | 'client' | 'third' | 'stuck' | 'done';

interface Props {
  client: Client;
  tasks: Task[];
  alerts: ClientAlert[];
  openTasks: Task[];
  upcomingDebts: Task[];
  quotations: Quotation[];
  engagements: Engagement[];
  steps: OnboardingStep[];
  events: OnboardingEvent[];
  onboardingLoading?: boolean;
  /** כבוי ⇒ שורות הקליטה יורדות, שאר הפרקים נשארים (settings.flags.onboardingTab). */
  onboardingEnabled?: boolean;
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  refreshOnboarding?: () => void;
  onOpenQuotation?: (quotationId: string) => void;
  onNewQuotation?: () => void;
  /** רשומת הליד שממנה נולד הכרטיס — מקור "מה ידוע עליו" ומצב "לא רלוונטי". */
  lead?: Lead;
  onEditLead?: (leadId: string) => void;
  /** דריסת יומן המיילים — לבדיקת המסך עם נתונים מדומים, כמו ב-ClientEmailsList. */
  emailsOverride?: EmailMessage[];
  onOpenRepresentation?: () => void;
  onPrepareReleaseLetter?: (stepId: string) => void;
  repStatusLabel?: string;
  /** אותו מצב, גולמי — כדי לגזור ממנו את הפעולה עצמה ולא רק את שמו. */
  repStatus?: RepresentationStatus;
  // ── מרכז השליטה ──
  onPinNote: (text: string) => void;
  onAddNote: (text: string) => void;
  onGotoTab: (tab: 'overview' | 'dossier' | 'docs' | 'tasks') => void;
  taxSessions: AnnualReportSession[];
  taxSessionsLoading?: boolean;
  onOpenYear?: (taxYear: number) => void;
  /** פתיחת משימה מתוך התמונה המקצועית. המשימות עצמן חיות בלשונית "משימות". */
  onSelectTask: (id: string) => void;
}

const CHAPTERS = [
  { key: 'lead', label: 'ליד' },
  { key: 'quoted', label: 'הצעה' },
  { key: 'onboarding', label: 'קליטה' },
  { key: 'active', label: 'פעיל' },
] as const;

export default function JourneyTab(p: Props) {
  const [ballFilter, setBallFilter] = useState<BallFilter | null>(null);
  const [showPast, setShowPast] = useState(false);

  const clientSteps = useMemo(
    () => p.steps.filter(s => s.clientId === p.client.id && s.status !== 'cancelled'),
    [p.steps, p.client.id],
  );
  const engagement = useMemo(
    () => p.engagements.find(e => e.clientId === p.client.id),
    [p.engagements, p.client.id],
  );
  const clientQuotations = useMemo(
    () => p.quotations
      .filter(q => q.clientId === p.client.id)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [p.quotations, p.client.id],
  );
  const liveQuotation = clientQuotations.find(q => q.status === 'sent' || q.status === 'viewed');
  const stage = p.client.lifecycleStage ?? 'active';
  const stageIndex = Math.max(0, CHAPTERS.findIndex(c => c.key === stage));

  // ‼ המונים סופרים בקשות מסע בלבד — לא משימות. משימות המשרד חיות בלשונית
  // משלהן (הכרעת גיא 2026-08-05), ומונה שמפנה למשהו שאינו בדף הזה הוא מונה
  // שמשקר: לוחצים עליו, הרשימה מסתננת, והפריט שנספר לא מופיע בה.
  const counts = useMemo(() => {
    const open = clientSteps.filter(s => isStepOpen(s.status));
    return {
      // ‼ שלב נעול אינו "אצלי" — הוא ממתין למה שהוא תלוי בו. ראה stepAwaitsMe.
      me: open.filter(stepAwaitsMe).length,
      client: open.filter(s => s.ball === 'client').length,
      third: open.filter(s => s.ball === 'authority' || s.ball === 'prev_accountant').length,
      stuck: open.filter(s => s.status === 'blocked' || s.status === 'failed' || s.needsAttention).length,
      done: clientSteps.filter(s => !isStepOpen(s.status)).length,
    };
  }, [clientSteps]);

  // ‼ מקטע הבקשות מוצג תמיד (כשהקליטה דלוקה), גם ללקוח ותיק בלי התקשרות.
  // בקשה אינה שייכת רק לקליטה — אפשר לבקש מסמך מלקוח פעיל בכל רגע.
  const showRequests = p.onboardingEnabled !== false;

  /* יומן המיילים נטען פעם אחת כאן ומוזרם גם ללוח האירועים של ההצעה וגם
     למקטע המיילים למטה — אותם נתונים, שאילתה אחת. */
  const { user } = useAuth();
  const { messages, loading: emailsLoading, reload: reloadEmails } = useEmailMessages(user?.id);
  const clientEmails = useMemo(() => {
    if (p.emailsOverride) return p.emailsOverride;
    const addr = new Set([p.client.email].filter(Boolean).map(e => e!.trim().toLowerCase()));
    return messages.filter(m => m.clientId === p.client.id || (!m.clientId && addr.has((m.toEmail || '').toLowerCase())));
  }, [p.emailsOverride, messages, p.client.id, p.client.email]);

  const leadClosed = p.lead?.status === 'closed';
  const knownFacts = useMemo(() => (p.lead ? leadKnownFacts(p.lead) : []), [p.lead]);

  const nextAction = useMemo(() => deriveNextAction({
    client: p.client,
    stage,
    lead: p.lead,
    liveQuotation,
    latestQuotation: clientQuotations[0],
    openTasks: p.openTasks,
    latestSession: p.taxSessions[0] ?? null,
    openRequests: clientSteps.filter(s => isStepOpen(s.status)).map(s => ({
      title: String(s.payload?.title ?? '').trim() || STEP_TYPE_LABELS[s.stepType],
      stuck: s.status === 'blocked' || s.status === 'failed' || !!s.needsAttention,
      ball: STEP_BALL_LABELS[s.ball],
    })),
    representationPending: p.repStatusLabel && p.repStatusLabel !== 'מיוצג פעיל' ? p.repStatusLabel : null,
  }), [p.client, stage, p.lead, liveQuotation, clientQuotations, p.openTasks, p.taxSessions,
    clientSteps, p.repStatusLabel]);

  const timeline = useMemo(
    () => (liveQuotation ? buildQuotationTimeline(liveQuotation, clientEmails) : []),
    [liveQuotation, clientEmails],
  );

  const doneSteps = clientSteps.filter(s => !isStepOpen(s.status)).length;

  function runAction(b: NextActionButton) {
    switch (b.action) {
      case 'newQuotation': p.onNewQuotation?.(); break;
      case 'openQuotation': if (b.quotationId) p.onOpenQuotation?.(b.quotationId); break;
      case 'openTask': if (b.taskId) p.onSelectTask(b.taskId); break;
      case 'openYear': if (b.taxYear) p.onOpenYear?.(b.taxYear); break;
      case 'editLead': if (p.lead) p.onEditLead?.(p.lead.id); break;
      case 'openRepresentation': p.onOpenRepresentation?.(); break;
      case 'gotoTasks': p.onGotoTab('tasks'); break;
    }
  }
  const dateFor = (key: string): string | undefined => {
    if (key === 'lead') return p.client.createdAt;
    if (key === 'quoted') return clientQuotations[0]?.sentAt ?? clientQuotations[0]?.createdAt;
    if (key === 'onboarding') return engagement?.approvedAt;
    if (key === 'active') return engagement?.activatedAt;
    return undefined;
  };

  return (
    <div className="cw-tabpanel">
      {/* ── פס המסע ── */}
      <div style={{
        display: 'flex', alignItems: 'stretch', gap: '.25rem', flexWrap: 'wrap',
        padding: '.6rem .75rem', background: 'var(--surface-2)', borderRadius: 'var(--radius)',
      }}>
        {CHAPTERS.map((c, i) => {
          const past = i < stageIndex;
          const now = i === stageIndex;
          const when = dateFor(c.key);
          return (
            <div key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: '.35rem',
              paddingInlineEnd: i < CHAPTERS.length - 1 ? '.5rem' : 0,
            }}>
              <span aria-hidden="true" style={{
                width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                background: now ? 'var(--accent)' : past ? 'var(--ink-3)' : 'var(--hairline-2)',
              }} />
              <span style={{
                fontSize: 'var(--fs-13)',
                fontWeight: now ? 700 : 500,
                color: now ? 'var(--ink-1)' : past ? 'var(--ink-3)' : 'var(--ink-4)',
              }}>{c.label}</span>
              {when && (past || now) && (
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>{formatDate(when, 'list')}</span>
              )}
              {i < CHAPTERS.length - 1 && (
                <span aria-hidden="true" style={{ color: 'var(--hairline-2)' }}>←</span>
              )}
            </div>
          );
        })}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', alignSelf: 'center' }}>
          {LIFECYCLE_STAGE_LABELS[stage] ?? stage}
        </span>
      </div>

      {/* ── רצועת המונים. צבע רק למה שדורש החלטה. ──
          ללקוח שאין לו אף בקשה הרצועה כולה יורדת: "אצלי 0" הוא מונה שמצביע
          על כלום, וזה הרוב — לקוח ותיק בלי התקשרות. כשיש בקשות "אצלי" נשאר
          גם באפס, כי אז הוא תשובה ("שום דבר לא מחכה לי") ולא רעש. */}
      {clientSteps.length > 0 && (
      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
        {([
          { key: 'me', label: 'אצלי', n: counts.me, tone: 'var(--accent)' },
          { key: 'client', label: 'אצל הלקוח', n: counts.client, tone: 'var(--ink-3)' },
          { key: 'third', label: 'אצל צד שלישי', n: counts.third, tone: 'var(--ink-3)' },
          { key: 'stuck', label: 'תקוע', n: counts.stuck, tone: 'var(--err)' },
          { key: 'done', label: 'הושלם', n: counts.done, tone: 'var(--ink-4)' },
        ] as { key: BallFilter; label: string; n: number; tone: string }[])
          .filter(c => c.n > 0 || c.key === 'me')
          .map(c => {
            const on = ballFilter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                className="btn btn-sm"
                aria-pressed={on}
                onClick={() => setBallFilter(on ? null : c.key)}
                style={{
                  border: `1px solid ${on ? c.tone : 'var(--hairline-2)'}`,
                  background: on ? 'var(--surface-2)' : 'transparent',
                  color: 'var(--ink-2)', fontWeight: on ? 700 : 500,
                }}
              >
                {c.label}
                <span style={{ color: c.n > 0 ? c.tone : 'var(--ink-4)', fontWeight: 700, marginInlineStart: '.35rem' }}>
                  {c.n}
                </span>
              </button>
            );
          })}
        {ballFilter && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setBallFilter(null)}>
            נקה סינון
          </button>
        )}
      </div>
      )}

      {/* ── ליד שסומן "לא רלוונטי" ──────────────────────────────────────────
          הרשומה נשארת ברשימה בכוונה: אם האדם יחזור, הוא לא ייפתח פעמיים. */}
      {leadClosed && (
        <div className="jt-panel jt-panel-quiet">
          <div className="jt-panel-head">
            <span className="jt-panel-title">ליד · לא רלוונטי</span>
            {p.lead?.updatedAt && (
              <span className="jt-panel-meta">סומן {formatDate(p.lead.updatedAt, 'list')}</span>
            )}
          </div>
          <p className="jt-panel-body">
            הליד נשאר ברשימה תחת «לידים» עם סימון לא רלוונטי — כדי שלא ייצור כפילות אם יחזור.
            אין לו דף אישי, אין הצעה פעילה, ואין בקשות.
          </p>
          <div className="jt-panel-actions">
            {p.lead && p.onEditLead && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => p.onEditLead!(p.lead!.id)}>
                ערוך פרטי ליד
              </button>
            )}
            {p.onNewQuotation && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={p.onNewQuotation}>
                בנה הצעה בכל זאת
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── הפעולה הבאה — משפט אחד ופעולה אחת ──────────────────────────────
          בפרק הקליטה הפאנל יורד בכוונה: שורות הקליטה כבר נושאות את הפעולה
          הבאה שלהן, ושתי חזיתות לאותה שאלה הן בדיוק הכפילות שסומנה בסקירה. */}
      {!leadClosed && nextAction && (
        <div className={`jt-panel jt-next jt-next-${nextAction.tone}`}>
          <div className="jt-panel-head">
            <span className="jt-panel-eyebrow">הפעולה הבאה</span>
          </div>
          <div className="jt-next-headline">{nextAction.headline}</div>
          {nextAction.detail && <div className="jt-next-detail">{nextAction.detail}</div>}
          {nextAction.buttons.length > 0 && (
            <div className="jt-panel-actions">
              {nextAction.buttons.map(b => (
                <button
                  key={b.label}
                  type="button"
                  className={`btn btn-sm btn-${b.kind}`}
                  onClick={() => runAction(b)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── מה ידוע עליו — חי ברשומת הליד עד שההצעה מאושרת ────────────────── */}
      {stage === 'lead' && knownFacts.length > 0 && (
        <div className="cw-section">
          <div className="cw-section-head">
            <span>מה ידוע עליו</span>
            {p.lead && p.onEditLead && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onEditLead!(p.lead!.id)}>
                עריכה
              </button>
            )}
          </div>
          <dl className="jt-facts">
            {knownFacts.map(f => (
              <div key={f.label} className="jt-fact">
                <dt className="jt-fact-label">{f.label}</dt>
                <dd className="jt-fact-value">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="jt-footnote">
            הפרטים האלה חיים ברשומת הליד. עם אישור ההצעה הם עוברים לתיק הקבוע — ואז «התיק» הופך למקור האמת.
          </p>
        </div>
      )}

      {/* ── שורת ההצעה. בפרק ההצעה היא הראשית; אחריו היא היסטוריה. ── */}
      {liveQuotation && (
        <div className="cw-section">
          <div className="cw-section-head"><span>הצעת מחיר</span></div>
          <div style={{
            display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap',
            padding: '.55rem 0', borderTop: '1px solid var(--hairline-2)',
          }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: 999, background: 'var(--accent)', flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-14)', fontWeight: 600 }}>
                הצעה {liveQuotation.quotationNumber ? `#${liveQuotation.quotationNumber}` : ''}
              </div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>
                {/* הסכום לא מופיע כאן בכוונה: הוא לא מניע פעולה במסך הזה,
                    והוא נמצא בהצעה עצמה במרחק לחיצה. */}
                {/* המצב פעם אחת: הצפייה עצמה מופיעה כשורה בלוח האירועים למטה */}
                <span style={{ fontWeight: 600 }}>{QUOTATION_STATUS_LABELS[liveQuotation.status]}</span>
                {liveQuotation.expiresAt && <span> · בתוקף עד {formatDate(liveQuotation.expiresAt, 'list')}</span>}
              </div>
            </div>
            {p.onOpenQuotation && (
              <button type="button" className="btn btn-sm btn-secondary"
                onClick={() => p.onOpenQuotation?.(liveQuotation.id)}>פתח את ההצעה</button>
            )}
          </div>

          {/* לוח האירועים — נבנה מאירועי ההצעה ומנתוני המסירה של המייל */}
          {timeline.length > 0 && (
            <ol className="jt-timeline">
              {timeline.map(r => (
                <li key={r.label + r.when} className={`jt-tl-row ${r.pending ? 'is-pending' : ''}`}>
                  <span className="jt-tl-dot" aria-hidden="true" />
                  <span className="jt-tl-label">{r.label}</span>
                  <span className="jt-tl-when">{r.when}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* ── מה יקרה כשההצעה תאושר — החוזה של המסך, לא הבטחה ────────────────
          הרשימה נגזרת מההצעה עצמה: ייצוג נפתח רק אם הוגדר, ומכתב שחרור
          נוצר רק אם סומן רו״ח קודם. */}
      {stage === 'quoted' && liveQuotation && !liveQuotation.approvedAt && (
        <div className="cw-section">
          <div className="cw-section-head"><span>מה יקרה כשהיא תאושר</span></div>
          <ol className="jt-consequences">
            <li>נוצר כרטיס לקוח קבוע, והליד נסגר — אותו אדם, אותה רשומה.</li>
            <li>נפתחת התקשרות, ונוצרות בקשות הקליטה לפי מה שנמכר.</li>
            {liveQuotation.representation && (
              <li>ייפוי הכוח נפתח מיד ללקוח; שאר הבקשות ממתינות לבונה התהליך.</li>
            )}
            {(p.lead?.hasPreviousAccountant ?? p.client.hasPreviousAccountant) && (
              <li>מסומן «יש רו״ח קודם» — ולכן ייווצרו גם מכתב שחרור ומעקב חומרים.</li>
            )}
          </ol>
          <p className="jt-footnote">
            אין שליחה אוטומטית של הדף האישי — היא נעשית בכפתור מפורש במסך הקליטה.
          </p>
        </div>
      )}

      {/* ליד שעוד לא קיבל הצעה — הפעולה היחידה שיש עליו */}
      {stage === 'lead' && !liveQuotation && p.onNewQuotation && (
        <div className="cw-section">
          <div className="cw-section-head"><span>הצעת מחיר</span></div>
          <div style={{
            display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap',
            padding: '.55rem 0', borderTop: '1px solid var(--hairline-2)',
          }}>
            {/* הפעולה עצמה יושבת בפאנל "הפעולה הבאה" למעלה; כאן רק מוסבר
                מה יופיע במקום הזה אחרי השליחה, כדי שלא יהיו שני כפתורים
                זהים באותו מסך. */}
            <span style={{ flex: 1, fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
              אין הצעה פעילה. אחרי השליחה תופיע כאן שורת ההצעה עם המצב — נשלחה · נצפתה · אושרה — ולוח האירועים שלה.
            </span>
          </div>
        </div>
      )}

      {/* ── שורות הבקשות ── */}
      {showRequests && (
        <OnboardingTab
          embedded
          ballFilter={ballFilter}
          clientId={p.client.id}
          clientDisplayName={`${p.client.firstName} ${p.client.lastName ?? ''}`.trim()}
          clientEmail={p.client.email}
          engagements={p.engagements}
          steps={p.steps}
          events={p.events}
          loading={p.onboardingLoading}
          advance={p.advance}
          refresh={p.refreshOnboarding}
          prevAccountant={{
            name: p.client.prevAccountantName,
            email: p.client.prevAccountantEmail,
            phone: p.client.prevAccountantPhone,
          }}
          onPrepareReleaseLetter={p.onPrepareReleaseLetter}
          repStatusLabel={p.repStatusLabel}
          repStatus={p.repStatus}
          onOpenRepresentation={p.onOpenRepresentation}
        />
      )}

      {/* ── התמונה המקצועית: התראות, לוח הגשות, תיקי שנה, מיילים ── */}
      <ClientCockpitTab
        client={p.client}
        tasks={p.tasks}
        alerts={p.alerts}
        openTasks={p.openTasks}
        upcomingDebts={p.upcomingDebts}
        onPinNote={p.onPinNote}
        onAddNote={p.onAddNote}
        onGotoTab={p.onGotoTab}
        onSelectTask={p.onSelectTask}
        taxSessions={p.taxSessions}
        taxSessionsLoading={p.taxSessionsLoading}
        onOpenYear={p.onOpenYear}
        emails={clientEmails}
        emailsLoading={emailsLoading}
        onEmailsChanged={reloadEmails}
      />

      {/* ── פרקים קודמים — מקופלים, אבל לא נעלמים ── */}
      {(clientQuotations.length > 0 || doneSteps > 0) && (
        <div className="cw-section">
          <div className="cw-section-head">
            <button type="button"
              onClick={() => setShowPast(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '.35rem', color: 'inherit', font: 'inherit',
                background: 'none', border: 'none', appearance: 'none', padding: 0, cursor: 'pointer',
                // ‼ 19 פיקסלים באגודל זה פספוס. גם קישור־טקסט צריך שטח נגיעה.
                minHeight: 44,
              }}>
              <span aria-hidden="true">{showPast ? '▾' : '▸'}</span>
              <span>מה היה עד כה</span>
            </button>
            {/* השורה המקופלת אומרת מה יש בפנים — כדי שלא צריך לפתוח כדי לדעת */}
            <span className="jt-past-summary">
              {[
                engagement?.activatedAt ? `קליטה נסגרה ${formatDate(engagement.activatedAt, 'list')}` : null,
                doneSteps > 0 ? (doneSteps === 1 ? 'בקשה אחת הושלמה' : `${doneSteps} בקשות הושלמו`) : null,
                clientQuotations.length > 0
                  ? (clientQuotations.length === 1 ? 'הצעה אחת' : `${clientQuotations.length} הצעות`)
                  : null,
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
          {showPast && (
            <div>
              {clientQuotations.map(q => (
                <div key={q.id} style={{
                  display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap',
                  padding: '.5rem 0', borderTop: '1px solid var(--hairline-2)',
                  fontSize: 'var(--fs-13)',
                }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-2)' }}>
                    הצעה {q.quotationNumber ? `#${q.quotationNumber}` : ''} · {QUOTATION_STATUS_LABELS[q.status]}
                    {q.approvedAt && <span style={{ color: 'var(--ink-4)' }}> · אושרה {formatDate(q.approvedAt, 'list')}</span>}
                  </span>
                  {p.onOpenQuotation && (
                    <button type="button" className="btn btn-sm btn-ghost"
                      onClick={() => p.onOpenQuotation?.(q.id)}>פתח</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

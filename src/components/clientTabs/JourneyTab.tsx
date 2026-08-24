// ─── דף המסע — מה שנפתח כשלוחצים על לקוח ─────────────────────────────────────
// עד עכשיו הלקוח היה מפוזר: מרכז שליטה, לשונית קליטה שמופיעה ונעלמת, ולשונית
// משימות. שלושתם עונים על אותה שאלה — "מה קורה עם האדם הזה" — ולכן הם דף אחד.
//
// המבנה קבוע בכל שלב חיים, ומה שמשתנה הוא רק תוכן הפרק הנוכחי:
//   פס המסע → רצועת המונים → שורות הפרק → פרקים קודמים → עבודה שוטפת
//
// ‼ משימות המשרד אינן שורות מסע. משימה היא עבודה שלי, בקשה היא משהו שאני
// מחכה לו מאדם אחר — ערבוב שלהן היה מוחק את המשמעות של "אצל מי הכדור".

import { useMemo } from 'react';
import type { Client, Task, RepresentationStatus } from '../../types';
import type { ClientAlert } from '../../types/clientWorkspace';
import type { Engagement, OnboardingEvent, OnboardingStep } from '../../types/onboarding';
import type { Quotation, Lead } from '../../types/quotations';
import { QUOTATION_STATUS_LABELS } from '../../types/quotations';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import type { AnnualReportSession } from '../../features/annualReport/types';
import type { EmailMessage } from '../../types/emailActivity';
import { formatDate } from '../../utils/dateFormat';
import { useAuth } from '../../hooks/useAuth';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import {
  buildQuotationTimeline, leadKnownFacts,
  type NextActionButton,
} from '../../utils/journeyPresentation';
import { nextActionForClient } from '../../utils/nextActionForClient';
import OnboardingTab from './OnboardingTab';

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
  onPrepareReleaseLetter?: (stepId: string, mode?: 'letter' | 'follow_up') => void;
  repStatusLabel?: string;
  /** אותו מצב, גולמי — כדי לגזור ממנו את הפעולה עצמה ולא רק את שמו. */
  repStatus?: RepresentationStatus;
  // ── מרכז השליטה ──
  onPinNote: (text: string) => void;
  onAddNote: (text: string) => void;
  onGotoTab: (tab: 'overview' | 'dossier' | 'docs' | 'tasks') => void;
  /** מ-M2: יישור קו כותב עובדות מקצועיות ישירות דרך M1 — צריך לשקף מיד. */
  onClientPersisted: (c: Client) => void;
  taxSessions: AnnualReportSession[];
  taxSessionsLoading?: boolean;
  onOpenYear?: (taxYear: number) => void;
  /** פתיחת משימה מתוך התמונה המקצועית. המשימות עצמן חיות בלשונית "משימות". */
  onSelectTask: (id: string) => void;
}

export default function JourneyTab(p: Props) {
  const clientQuotations = useMemo(
    () => p.quotations
      .filter(q => q.clientId === p.client.id)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')),
    [p.quotations, p.client.id],
  );
  const liveQuotation = clientQuotations.find(q => q.status === 'sent' || q.status === 'viewed');
  const stage = p.client.lifecycleStage ?? 'active';

  // ‼ מקטע הבקשות מוצג תמיד (כשהקליטה דלוקה), גם ללקוח ותיק בלי התקשרות.
  // בקשה אינה שייכת רק לקליטה — אפשר לבקש מסמך מלקוח פעיל בכל רגע.
  const showRequests = p.onboardingEnabled !== false;

  /* יומן המיילים נטען פעם אחת כאן ומוזרם גם ללוח האירועים של ההצעה וגם
     למקטע המיילים למטה — אותם נתונים, שאילתה אחת. */
  const { user } = useAuth();
  const { messages } = useEmailMessages(user?.id);
  const clientEmails = useMemo(() => {
    if (p.emailsOverride) return p.emailsOverride;
    const addr = new Set([p.client.email].filter(Boolean).map(e => e!.trim().toLowerCase()));
    return messages.filter(m => m.clientId === p.client.id || (!m.clientId && addr.has((m.toEmail || '').toLowerCase())));
  }, [p.emailsOverride, messages, p.client.id, p.client.email]);

  const leadClosed = p.lead?.status === 'closed';
  const knownFacts = useMemo(() => (p.lead ? leadKnownFacts(p.lead) : []), [p.lead]);

  /* ‼ ההרכבה עברה ל-nextActionForClient — אותה פונקציה משרתת גם את התצוגה
     המהירה במסך הלקוחות. שתי חזיתות, תשובה אחת. */
  const nextAction = useMemo(() => nextActionForClient({
    client: p.client,
    lead: p.lead,
    quotations: p.quotations,
    openTasks: p.openTasks,
    steps: p.steps,
    taxSessions: p.taxSessions,
    repStatusLabel: p.repStatusLabel,
  }), [p.client, p.lead, p.quotations, p.openTasks, p.steps, p.taxSessions, p.repStatusLabel]);

  const timeline = useMemo(
    () => (liveQuotation ? buildQuotationTimeline(liveQuotation, clientEmails) : []),
    [liveQuotation, clientEmails],
  );

  // ‼ open_tasks ו-upcoming_debt הן שתיהן ספירות של משימות משרד ("6 משימות
  // פתוחות", "3 חובות קרובים") — המקום שלהן הוא מסך המשימות, לא כאן. תהליך
  // לא צריך להיות לוח מחוונים שני למה שכבר יש לו מסך משלו.
  // ראה docs/UX-CONVERGENCE-AUDIT-2026-08.md §6/§17 #4.
  const attentionAlerts = useMemo(
    () => p.alerts.filter(a => a.kind !== 'open_tasks' && a.kind !== 'upcoming_debt'),
    [p.alerts]
  );

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
  return (
    <div className="cw-tabpanel">
      {/* ‼ פס המסע (ליד ← הצעה ← קליטה ← פעיל) ורצועת המונים ("אצלי 4 · אצל
          הלקוח 2…") הוסרו כאן: המסך הזה הוא משטח השליטה של מה שמבקשים מהלקוח,
          לא לוח מחוונים של מחזור החיים ולא לוח מדדים. ארבע תחנות ומונים
          שצריך לעבור אותם כדי להגיע לרשימת הבקשות הם בדיוק מה שהמהלך הזה בא
          להסיר. ההיסטוריה נשארת נגישה תחת «מה היה עד כה» (למטה), ומה שהמונים
          אמרו נמצא על השורה עצמה — "הכדור אצל X" על כל בקשה.
          מקור: אישור אב-הטיפוס requests-v2-approved.html (2026-08-15). */}

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
            הליד נשאר ברשימה תחת «לידים» עם סימון לא רלוונטי - כדי שלא ייצור כפילות אם יחזור.
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
            הפרטים האלה חיים ברשומת הליד. עם אישור ההצעה הם עוברים לתיק הקבוע - ואז «התיק» הופך למקור האמת.
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
            <li>נוצר כרטיס לקוח קבוע, והליד נסגר - אותו אדם, אותה רשומה.</li>
            <li>נפתחת התקשרות, ונוצרות בקשות הקליטה לפי מה שנמכר.</li>
            {/* ‼ "בונה התהליך" היה מסך נפרד שכבר לא קיים — הבקשות נולדות
                טיוטה בלשונית «בקשות» וממתינות ל"עדכן את דף הלקוח". */}
            {liveQuotation.representation && (
              <li>ייפוי הכוח נפתח מיד ללקוח; שאר הבקשות נולדות כטיוטה בלשונית «בקשות».</li>
            )}
            {(p.lead?.hasPreviousAccountant ?? p.client.hasPreviousAccountant) && (
              <li>מסומן «יש רו״ח קודם» - ולכן ייווצרו גם מכתב העברת טיפול ומעקב חומרים.</li>
            )}
          </ol>
          <p className="jt-footnote">
            אין שליחה אוטומטית של הדף האישי - היא נעשית בכפתור מפורש במסך הקליטה.
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
              אין הצעה פעילה. אחרי השליחה תופיע כאן שורת ההצעה עם המצב - נשלחה · נצפתה · אושרה - ולוח האירועים שלה.
            </span>
          </div>
        </div>
      )}

      {/* ── שורות הבקשות ── */}
      {showRequests && (
        <OnboardingTab
          embedded
          clientId={p.client.id}
          client={p.client}
          onClientPersisted={p.onClientPersisted}
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
          /* ‼ אותו מערך שכבר נטען לדף — לא שאילתה נוספת. משמש רק לקריאת
             approvedAt לצורך אבן-הדרך "הצעת מחיר · אושרה". */
          quotations={clientQuotations}
          repStatusLabel={p.repStatusLabel}
          repStatus={p.repStatus}
          onOpenRepresentation={p.onOpenRepresentation}
        />
      )}

      {/* ── התמונה המקצועית: התראות, לוח הגשות, תיקי שנה, מיילים ──────────
          ‼ שייכת ללקוח פעיל. בליד/הצעה/קליטה כמעט כולה מקטעים ריקים
          ("אין תיק דוח שנתי", "אין פעילות") שהאריכו את העמוד למסך שלם של
          גלילה — הכרעת גיא 2026-08-09: עד שהלקוח פעיל היא לא מוצגת, ורק
          המיילים וההערה המוצמדת נשארים, מקופלים. */}
      {/* ‼ חריגות — "מה דורש תשומת לב". הן היו קבורות בתוך מרכז השליטה שירד,
          וזו הייתה השאלה היחידה שם ששאר המסך לא ענה עליה. כאן הן שורות שקטות
          ולא כרטיסים, ומוצגות רק כשיש חריגה בפועל: "אין חריגות" הוא מקטע
          שתופס מקום כדי לומר כלום. */}
      {/* ‼ ספירת המשימות הפתוחות כבר מופיעה בשורת הזהות, שם היא גם קישור
          למסך המשימות. אותו מספר פעמיים באותו מסך מלמד להתעלם משניהם. */}
      {attentionAlerts.length > 0 && (
        <div className="cw-section">
          <div className="cw-section-head">
            <span>דורש תשומת לב</span>
            <span className="cw-section-count">{attentionAlerts.length}</span>
          </div>
          {attentionAlerts.map(a => (
            <div key={a.kind} className="jt-alert-row">
              <span className="jt-alert-dot" data-level={a.level} aria-hidden="true" />
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ‼ עד כאן "תהליך" עונה על מה קורה עכשיו ומה הלאה. מתחת לזה ישב עד
          עכשיו מרכז השליטה הישן (ClientCockpitTab) — אבל רק ללקוח פעיל,
          ודווקא שם הוא הזיק: רצועת מונים ("6 משימות פתוחות · 3 עם מועד
          קרוב"), רשימת משימות משרד שלישית, ועדכון "מה זז לאחרונה" שהוא
          בדיוק מה ש"פעילות" מציגה. שלושתם ענו על שאלות ששאר המסך כבר ענה,
          והפכו את התהליך ללוח מחוונים שצריך לעבור אותו כדי להגיע לעבודה.
          ‼ מקטע "מיילים שנשלחו ללקוח" שהיה כאן הוסר מאותה סיבה בדיוק —
          "פעילות" כבר מציגה תקשורת עם הלקוח (כולל מיילים) בציר זמן אחד,
          וכפילות בין שני מסכים היא בדיוק מה שהמהלך הזה בא לתקן.
          ראה docs/UX-CONVERGENCE-AUDIT-2026-08.md §6/§17 #4. נשארת רק
          הערה מוצמדת — שורה שקטה כשיש, כפתור קטן כשאין, לא מקטע שלם. */}
      {(
        <>
          {p.client.pinnedNote ? (
            <div className="jt-panel jt-panel-quiet">
              <div className="jt-panel-head">
                <span className="jt-panel-title">הערה מוצמדת</span>
                <button type="button" className="btn btn-sm btn-ghost"
                  onClick={() => {
                    const next = window.prompt('הערה מוצמדת:', p.client.pinnedNote ?? '');
                    if (next !== null) p.onPinNote(next.trim());
                  }}>עריכה</button>
              </div>
              <p className="jt-panel-body" style={{ whiteSpace: 'pre-wrap' }}>{p.client.pinnedNote}</p>
            </div>
          ) : (
            <div>
              <button type="button" className="btn btn-sm btn-ghost"
                onClick={() => {
                  const next = window.prompt('הערה מוצמדת:');
                  if (next && next.trim()) p.onPinNote(next.trim());
                }}>+ הערה מוצמדת</button>
            </div>
          )}
        </>
      )}

      {/* ‼ «מה היה עד כה» הוסר ממשטח הבקשות. אותה היסטוריה בדיוק — הצעות
          שאושרו, בקשות שהושלמו, סגירת הקליטה — נקראת בלשונית «פעילות», שם
          היא מקובצת לפי יום וניתנת לסינון. שני צירי זמן על אותו לקוח לימדו
          שיש שתי אמיתות. שום נתון לא נמחק: useClientActivity קורא בדיוק
          מאותם מקורות (quotations.events, onboarding_events). */}
    </div>
  );
}

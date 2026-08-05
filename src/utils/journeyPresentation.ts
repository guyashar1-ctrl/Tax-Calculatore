// ─── גזירת התצוגה של דף המסע ─────────────────────────────────────────────────
// הכל כאן טהור ונגזר ממה שכבר קיים: הצעות, אירועי הצעה, מיילים, משימות,
// תיקי שנה ורשומת הליד. אין כאן חוק עסקי חדש ואין כתיבה לשום מקום — רק
// הפיכת מצב קיים למשפט אחד ולפעולה אחת, כדי שלא יהיו שלוש חזיתות שונות
// לאותה שאלה ("מה הפעולה הבאה") בשלושה מסכים.

import type { Client, Task } from '../types';
import type { Quotation, Lead } from '../types/quotations';
import type { EmailMessage } from '../types/emailActivity';
import type { AnnualReportSession } from '../features/annualReport/types';
import { formatDate } from './dateFormat';

// ─── עזרי תאריך ──────────────────────────────────────────────────────────────

/** ‎"02.08 · 09:41"‎ — תאריך ושעה, כמו בלוח האירועים במוקאפ. */
export function stampDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** מספר ימים שלמים שעברו מאז התאריך. שלילי = עוד לא הגיע. */
export function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

// ─── הפעולה הבאה ─────────────────────────────────────────────────────────────

export type NextActionTone = 'urgent' | 'normal' | 'calm';

export interface NextActionButton {
  label: string;
  kind: 'primary' | 'secondary' | 'ghost';
  action: 'newQuotation' | 'openQuotation' | 'openTask' | 'openYear' | 'editLead' | 'openRepresentation' | 'gotoTasks';
  taskId?: string;
  taxYear?: number;
  quotationId?: string;
}

export interface NextAction {
  headline: string;
  /** שורת ההקשר מתחת לכותרת — למה זו הפעולה, ומה המספרים שמאחוריה. */
  detail?: string;
  tone: NextActionTone;
  buttons: NextActionButton[];
}

interface NextActionCtx {
  client: Client;
  stage: string;
  lead?: Lead;
  liveQuotation?: Quotation;
  latestQuotation?: Quotation;
  openTasks: Task[];
  latestSession?: AnnualReportSession | null;
}

const displayName = (c: Client) => `${c.firstName} ${c.lastName ?? ''}`.trim() || c.idNumber;

/** המשימה שהכי דורשת טיפול: תקועה קודם, אחריה האיחור הגדול ביותר. */
function mostUrgentTask(openTasks: Task[]): { task: Task; lateDays: number } | null {
  let best: { task: Task; lateDays: number } | null = null;
  for (const t of openTasks) {
    const late = t.dueDate ? (daysSince(t.dueDate) ?? 0) : 0;
    const stuck = t.ballWith === 'stuck';
    const score = (stuck ? 10_000 : 0) + Math.max(0, late);
    if (score <= 0) continue;
    const bestScore = best
      ? (best.task.ballWith === 'stuck' ? 10_000 : 0) + Math.max(0, best.lateDays)
      : -1;
    if (score > bestScore) best = { task: t, lateDays: late };
  }
  return best;
}

export function deriveNextAction(ctx: NextActionCtx): NextAction | null {
  const { client, stage, lead, liveQuotation, latestQuotation, openTasks, latestSession } = ctx;
  const name = displayName(client);

  // ── ליד ────────────────────────────────────────────────────────────────────
  if (stage === 'lead') {
    if (lead?.status === 'closed') return null; // מטופל במצב "לא רלוונטי" הנפרד
    return {
      headline: `לבנות הצעת מחיר ל${name}`,
      detail: 'טרם נשלחה הצעה. הכרטיס הקבוע והדף האישי של הלקוח נולדים ברגע השליחה — עד אז זו רשומת ליד בלבד.',
      tone: 'normal',
      buttons: [
        { label: 'בנה הצעה', kind: 'primary', action: 'newQuotation' },
        ...(lead ? [{ label: 'ערוך פרטי ליד', kind: 'ghost', action: 'editLead' } as NextActionButton] : []),
      ],
    };
  }

  // ── הצעה ───────────────────────────────────────────────────────────────────
  if (stage === 'quoted') {
    const q = liveQuotation ?? latestQuotation;
    if (!q) return null;

    if (q.status === 'approved' || q.approvedAt) {
      return {
        headline: 'ההצעה אושרה — להרכיב את תהליך הקליטה',
        detail: 'ייפוי הכוח נפתח ללקוח מיד. שאר הבקשות ממתינות לך בבונה התהליך, ואף אחת מהן אינה נחשפת לפני «פתח בדף הלקוח».',
        tone: 'normal',
        buttons: [{ label: 'פתח את ההצעה', kind: 'secondary', action: 'openQuotation', quotationId: q.id }],
      };
    }

    const expired = q.status === 'expired'
      || (!!q.expiresAt && new Date(q.expiresAt).getTime() < Date.now());
    if (expired) {
      const since = daysSince(q.expiresAt) ?? 0;
      return {
        headline: 'ההצעה פגה ולא אושרה — להחליט אם לחדש',
        detail: [
          q.expiresAt ? `הייתה בתוקף עד ${formatDate(q.expiresAt, 'list')}` : null,
          since > 0 ? `${since} ימים בלי תשובה` : null,
        ].filter(Boolean).join(' · '),
        tone: 'urgent',
        buttons: [{ label: 'פתח את ההצעה', kind: 'secondary', action: 'openQuotation', quotationId: q.id }],
      };
    }

    if (q.firstViewedAt) {
      const ballDays = daysSince(q.firstViewedAt);
      return {
        headline: 'ההצעה נצפתה ולא אושרה — לשלוח תזכורת',
        detail: [
          `נצפתה ${formatDate(q.firstViewedAt, 'list')}`,
          q.expiresAt ? `בתוקף עד ${formatDate(q.expiresAt, 'list')}` : null,
          ballDays !== null && ballDays > 0 ? `הכדור אצל הלקוח ${ballDays} ימים` : null,
        ].filter(Boolean).join(' · '),
        tone: 'normal',
        buttons: [{ label: 'פתח את ההצעה', kind: 'secondary', action: 'openQuotation', quotationId: q.id }],
      };
    }

    const sentDays = daysSince(q.sentAt);
    return {
      headline: 'ההצעה נשלחה וטרם נצפתה',
      detail: [
        q.sentAt ? `נשלחה ${formatDate(q.sentAt, 'list')}` : null,
        sentDays !== null && sentDays > 0 ? `לפני ${sentDays} ימים` : null,
        q.expiresAt ? `בתוקף עד ${formatDate(q.expiresAt, 'list')}` : null,
      ].filter(Boolean).join(' · '),
      tone: 'normal',
      buttons: [{ label: 'פתח את ההצעה', kind: 'secondary', action: 'openQuotation', quotationId: q.id }],
    };
  }

  // ── קליטה — הפעולה הבאה מוצגת בתוך שורות הקליטה עצמן. ─────────────────────
  // שתי חזיתות לאותה שאלה באותו מסך הן בדיוק הכפילות שהסקירה סימנה (§3.1).
  if (stage === 'onboarding') return null;

  // ── לקוח פעיל ──────────────────────────────────────────────────────────────
  const urgent = mostUrgentTask(openTasks);
  if (urgent) {
    const { task, lateDays } = urgent;
    const stuck = task.ballWith === 'stuck';
    return {
      headline: task.title,
      detail: [
        'משימת משרד',
        stuck ? 'תקועה' : 'הכדור אצלי',
        task.dueDate ? `יעד ${formatDate(task.dueDate, 'list')}` : null,
        !stuck && lateDays > 0 ? `באיחור ${lateDays} ימים` : null,
      ].filter(Boolean).join(' · '),
      tone: 'urgent',
      buttons: [{ label: 'פתח את המשימה', kind: 'secondary', action: 'openTask', taskId: task.id }],
    };
  }

  if (latestSession && (latestSession.status === 'in_progress' || latestSession.status === 'review')) {
    return {
      headline: `להמשיך את הדוח השנתי ${latestSession.taxYear}`,
      detail: 'התיק נפתח וממתין להמשך.',
      tone: 'normal',
      buttons: [{ label: 'פתח את הדוח', kind: 'secondary', action: 'openYear', taxYear: latestSession.taxYear }],
    };
  }

  // מצב שקט — אין חריגה, ולכן הפעולה הבאה היא העבודה היזומה.
  return {
    headline: `הכול מסודר אצל ${name}`,
    detail: 'אין הגשה באיחור, אין משימה תקועה ואין בקשה שממתינה.',
    tone: 'calm',
    buttons: [],
  };
}

// ─── לוח האירועים של ההצעה ───────────────────────────────────────────────────

export interface TimelineRow {
  label: string;
  when: string;
  /** שורה שעוד לא קרתה — מתוכננת, ולכן שקטה. */
  pending?: boolean;
}

/**
 * נבנה מאירועי ההצעה עצמה, ומועשר בנתוני המסירה של המייל שיצא בפועל.
 * שני המקורות כבר קיימים — אין כאן מעקב חדש ואין רישום חדש.
 */
export function buildQuotationTimeline(q: Quotation, emails: EmailMessage[]): TimelineRow[] {
  // נאסף עם החותמת הגולמית כדי שאפשר יהיה למיין כרונולוגית לפני העיצוב —
  // תזכורת שנשלחה אחרי הצפייה חייבת להופיע אחריה, אחרת הלוח משקר.
  const raw: { label: string; at: string; pending?: boolean; display?: string }[] = [];
  const rows: TimelineRow[] = [];

  const sentAt = q.sentAt ?? q.events?.find(e => e.type === 'sent')?.at;
  if (sentAt) raw.push({ label: 'נשלחה', at: sentAt });

  /* המייל שנשא את ההצעה הזו — מסירה ופתיחה מגיעות מיומן המיילים הקיים.
     ללקוח יכולות להיות כמה הצעות, ולכן נבחר המייל שיצא הכי קרוב לשליחה
     של ההצעה הזו (עד יממה); אחרת היינו תולים בהצעה אחת את המסירה של אחרת. */
  const mail = !sentAt ? undefined : emails
    .filter(m => (m.kind === 'quotation' || m.kind === 'quotation_reminder') && !!m.sentAt)
    .map(m => ({ m, gap: Math.abs(new Date(m.sentAt!).getTime() - new Date(sentAt).getTime()) }))
    .filter(x => Number.isFinite(x.gap) && x.gap <= 86_400_000)
    .sort((a, b) => a.gap - b.gap)[0]?.m;
  if (mail) {
    const opened = mail.openedAt || ['opened', 'clicked'].includes(mail.status);
    if (mail.deliveredAt || opened) {
      raw.push({
        label: opened ? 'נמסרה ונפתחה' : 'נמסרה',
        at: (mail.openedAt ?? mail.deliveredAt ?? mail.sentAt) as string,
      });
    } else if (['bounced', 'complained', 'failed'].includes(mail.status)) {
      raw.push({ label: 'המייל לא נמסר', at: mail.sentAt as string });
    }
  }

  const reminder = q.events?.filter(e => e.type === 'reminder_sent').slice(-1)[0];
  if (reminder) raw.push({ label: 'נשלחה תזכורת', at: reminder.at });

  if (q.firstViewedAt) raw.push({ label: 'נצפתה לראשונה', at: q.firstViewedAt });
  if (q.approvedAt) raw.push({ label: 'אושרה', at: q.approvedAt });
  if (q.cancelledAt) raw.push({ label: 'בוטלה', at: q.cancelledAt });

  // תזכורת אוטומטית — מה שכבר יצא, או מה שמתוכנן לצאת לפני הפקיעה.
  if (q.autoReminderSentAt) {
    raw.push({ label: 'תזכורת אוטומטית', at: q.autoReminderSentAt });
  } else if (q.expiresAt && !q.approvedAt && !q.cancelledAt) {
    const due = new Date(q.expiresAt);
    if (!Number.isNaN(due.getTime())) {
      due.setDate(due.getDate() - 3);
      if (due.getTime() > Date.now()) {
        raw.push({
          label: 'תזכורת אוטומטית',
          at: due.toISOString(),
          pending: true,
          display: `מוכנה ל-${formatDate(due.toISOString(), 'list')}`,
        });
      }
    }
  }

  raw
    .filter(r => !!r.at)
    .sort((a, b) => a.at.localeCompare(b.at))
    .forEach(r => rows.push({ label: r.label, when: r.display ?? stampDateTime(r.at), pending: r.pending }));

  return rows;
}

// ─── "מה ידוע עליו" — רשומת הליד ─────────────────────────────────────────────

export interface KnownFact { label: string; value: string }

const DEALER_LABELS: Record<string, string> = {
  exempt: 'עוסק פטור',
  licensed: 'עוסק מורשה',
  company: 'חברה',
  other: 'אחר',
};

export function leadKnownFacts(lead: Lead): KnownFact[] {
  const out: KnownFact[] = [];
  if (lead.businessName) out.push({ label: 'עסק', value: lead.businessName });
  if (lead.dealerType) out.push({ label: 'סוג עוסק (מוצהר)', value: DEALER_LABELS[lead.dealerType] ?? lead.dealerType });
  out.push({
    label: 'רו״ח קודם',
    value: lead.hasPreviousAccountant
      ? (lead.prevAccountantName || 'יש — השם טרם נרשם')
      : lead.businessTransfer === false ? 'אין — עסק חדש' : 'אין',
  });
  if (lead.referralSource) out.push({ label: 'מאיפה הגיע', value: lead.referralSource });
  if (lead.notes) out.push({ label: 'מה ביקש', value: lead.notes });
  return out;
}

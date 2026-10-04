// ─── "מה הפעולה הבאה" — הרכבת ההקשר במקום אחד ───────────────────────────────
// deriveNextAction דורש הקשר מלא (הצעות, שלבים, משימות). עד עכשיו רק דף
// המסע ידע להרכיב אותו; התצוגה המהירה צריכה את אותה תשובה בדיוק, ולכן
// ההרכבה יושבת כאן ושני המסכים קוראים לאותה פונקציה. שתי חזיתות שמחשבות
// "מה עכשיו" בנפרד הן שתי חזיתות שיסתרו זו את זו ביום שאחת תתוקן.

import type { Client, Task, NiTracking } from '../types';
import { representationStatusLabel, type RepSendPhase } from './representationAction';
import type { Quotation, Lead } from './../types/quotations';
import type { OnboardingStep } from '../types/onboarding';
import { STEP_TYPE_LABELS, STEP_BALL_LABELS } from '../types/onboarding';
import { requestRows, rowSummary, type AttentionContext } from './requestAttention';
import type { AnnualReportSession } from '../features/annualReport/types';
import { deriveNextAction, type NextAction } from './journeyPresentation';
import { representationState } from '../lib/clientState';

export interface NextActionSources {
  client: Client;
  /** רשומת הליד שממנה נולד הכרטיס, אם קיימת. */
  lead?: Lead;
  /** כלל ההצעות — הסינון לפי הלקוח נעשה כאן. */
  quotations: Quotation[];
  /** משימות פתוחות של הלקוח בלבד. */
  openTasks: Task[];
  /** כלל שלבי המסע — הסינון לפי הלקוח נעשה כאן. */
  steps: OnboardingStep[];
  taxSessions?: AnnualReportSession[];
  /** תווית מצב הייצוג; אם לא סופקה — נגזרת מהכרטיס (לפי repSendPhase). */
  repStatusLabel?: string;
  /**
   * ‼ אותו הקשר כמו בכרטיס («בקשות» והתג): מסלולי הביצוע של ב"ל לפי אדם.
   * בלעדיהם בקשת ב"ל שההוראות שלה כבר יצאו (ממתינה למבוטח) נקראה «לטיפולך».
   */
  niExecution?: { client?: NiTracking; spouse?: NiTracking };
  /** מייל החתימה טרם יצא ('unsent') — «מוכן לשליחה ללקוח», לא «נשלח לחתימת הלקוח». */
  repSendPhase?: RepSendPhase | null;
}

export function clientStepsOf(steps: OnboardingStep[], clientId: string): OnboardingStep[] {
  return steps.filter(s => s.clientId === clientId && s.status !== 'cancelled');
}

export function clientQuotationsOf(quotations: Quotation[], clientId: string): Quotation[] {
  return quotations
    .filter(q => q.clientId === clientId)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}

export function nextActionForClient(src: NextActionSources): NextAction | null {
  const { client } = src;
  const stage = client.lifecycleStage ?? 'active';
  const clientQuotations = clientQuotationsOf(src.quotations, client.id);
  const liveQuotation = clientQuotations.find(q => q.status === 'sent' || q.status === 'viewed');
  const clientSteps = clientStepsOf(src.steps, client.id);
  // ‼ «נשלח לחתימת הלקוח» רק כשהמייל באמת יצא — representationStatusLabel, כמו בכרטיס.
  const repStatusLabel = src.repStatusLabel
    ?? (client.representationStatus ? representationStatusLabel(client.representationStatus, src.repSendPhase) : undefined);
  const repCtx: AttentionContext = {
    niExecution: src.niExecution,
    repStatus: client.representationStatus ?? undefined,
    repSendPhase: src.repSendPhase ?? null,
    representationRequestId: client.representationRequestId ?? null,
  };

  return deriveNextAction({
    client,
    stage,
    lead: src.lead,
    liveQuotation,
    latestQuotation: clientQuotations[0],
    openTasks: src.openTasks,
    latestSession: src.taxSessions?.[0] ?? null,
    /* ‼ v3: רק מה שמוצג במסך הבקשות, עם אותה הגדרה של "לטיפולי" (requestAttention).
       שלבים מוסתרים ועבודה פנימית לא נספרים כאן — כמו בתג.
       ‼ סבב 4: תהליך אחד = בקשה אחת — אותו קיבוץ ואותו מצב-שורה של הרשימה
       («ייצוג מול הרשויות» עם החלקים שלו הוא בקשה אחת, לא שלוש). */
    openRequests: requestRows(clientSteps, repCtx).map(row => {
      const sum = rowSummary(row, repCtx);
      const who = sum.lead ?? sum.openParts[0] ?? row.primary;
      return {
        title: String(row.primary.payload?.title ?? '').trim() || STEP_TYPE_LABELS[row.primary.stepType],
        stuck: sum.attn.tone === 'red' || sum.openParts.some(s => s.status === 'blocked' || s.status === 'failed'),
        ball: STEP_BALL_LABELS[who.ball],
        mine: sum.attn.kind === 'mine',
      };
    }),
    /* ‼ נגזר ממצב הייצוג, לא מהשוואת מחרוזת עברית. קודם ישב כאן
       `repStatusLabel !== 'מיוצג פעיל'` — שינוי ניסוח אחד בתווית היה הופך כל
       לקוח מיוצג ל"ייצוג בתהליך" בלי ששום דבר בקוד ייראה שבור. */
    representationPending:
      representationState(client) === 'in_process' ? (repStatusLabel ?? null) : null,
  });
}

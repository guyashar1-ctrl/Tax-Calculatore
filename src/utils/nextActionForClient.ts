// ─── "מה הפעולה הבאה" — הרכבת ההקשר במקום אחד ───────────────────────────────
// deriveNextAction דורש הקשר מלא (הצעות, שלבים, משימות). עד עכשיו רק דף
// המסע ידע להרכיב אותו; התצוגה המהירה צריכה את אותה תשובה בדיוק, ולכן
// ההרכבה יושבת כאן ושני המסכים קוראים לאותה פונקציה. שתי חזיתות שמחשבות
// "מה עכשיו" בנפרד הן שתי חזיתות שיסתרו זו את זו ביום שאחת תתוקן.

import type { Client, Task } from '../types';
import { REPRESENTATION_STATUS_LABELS } from '../types';
import type { Quotation, Lead } from './../types/quotations';
import type { OnboardingStep } from '../types/onboarding';
import { isStepOpen, STEP_TYPE_LABELS, STEP_BALL_LABELS } from '../types/onboarding';
import type { AnnualReportSession } from '../features/annualReport/types';
import { deriveNextAction, type NextAction } from './journeyPresentation';

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
  /** תווית מצב הייצוג; אם לא סופקה — נגזרת מהכרטיס. */
  repStatusLabel?: string;
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
  const repStatusLabel = src.repStatusLabel
    ?? (client.representationStatus ? REPRESENTATION_STATUS_LABELS[client.representationStatus] : undefined);

  return deriveNextAction({
    client,
    stage,
    lead: src.lead,
    liveQuotation,
    latestQuotation: clientQuotations[0],
    openTasks: src.openTasks,
    latestSession: src.taxSessions?.[0] ?? null,
    openRequests: clientSteps.filter(s => isStepOpen(s.status)).map(s => ({
      title: String(s.payload?.title ?? '').trim() || STEP_TYPE_LABELS[s.stepType],
      stuck: s.status === 'blocked' || s.status === 'failed' || !!s.needsAttention,
      ball: STEP_BALL_LABELS[s.ball],
    })),
    representationPending: repStatusLabel && repStatusLabel !== 'מיוצג פעיל' ? repStatusLabel : null,
  });
}

// ─── «ממתין לך · N ימים» על בקשות פייפרלס שמחכות למשרד (23.10.2026) ───
//
// ‼ הגבייה עוברת בפייפרלס (גיא, 23.10.2026). בקשת פייפרלס שמחכה למשרד היא כסף שמחכה —
//   ולכן היא אומרת כמה זמן, ומתבלטת אחרי 3 ימים.
// ‼ הספירה מתחילה כשהבקשה נפתחה: ההורה האחרון שהושלם (החיבור נפתח כשהלקוח נרשם), ובלי
//   הורה — היצירה. לא updatedAt: כל עריכה (סעיף ברשימת ההקמה) איפסה את הספירה.

import type { OnboardingStep, OnboardingStepType } from '../../types/onboarding';
import { isStepOpen } from '../../types/onboarding';

export const OFFICE_WAIT_LATE_DAYS = 3;

const PAPERLESS_OFFICE_STEPS: OnboardingStepType[] = ['paperless_connection', 'retainer_authorization'];

export interface OfficeWait { days: number; late: boolean; text: string }

export function paperlessOfficeWait(
  step: Pick<OnboardingStep, 'id' | 'stepType' | 'status' | 'ball' | 'createdAt' | 'dependsOnStepId'>,
  all: Pick<OnboardingStep, 'id' | 'completedAt'>[],
  parentIds?: string[],
  now: number = Date.now(),
): OfficeWait | null {
  if (!PAPERLESS_OFFICE_STEPS.includes(step.stepType)) return null;
  if (step.ball !== 'me' || step.status === 'locked' || !isStepOpen(step.status)) return null;
  const parents = parentIds && parentIds.length ? parentIds : (step.dependsOnStepId ? [step.dependsOnStepId] : []);
  const opened = parents
    .map(id => all.find(s => s.id === id)?.completedAt)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? step.createdAt;
  if (!opened) return null;
  const days = Math.max(0, Math.floor((now - new Date(opened).getTime()) / 86400000));
  return {
    days,
    late: days >= OFFICE_WAIT_LATE_DAYS,
    text: days === 0 ? 'ממתין לך · מהיום' : days === 1 ? 'ממתין לך · יום אחד' : `ממתין לך · ${days} ימים`,
  };
}

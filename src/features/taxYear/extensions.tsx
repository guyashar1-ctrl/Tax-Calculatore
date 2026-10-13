// ─── שנת מס: רכיבים של שלבים שאחרי האיסוף ───────────────────────────────────
// ‼ הקובץ הזה שונה בין הענפים, בכוונה: בענף tax-foundation הוא מחבר את הכנת ההערכה
// (231–232) ואת הכנת הדוח השנתי (233); בחבילת איסוף הנתונים (master) הוא ריק — האיסוף,
// הבדיקה והחיבור לתיק עובדים בלעדיהם, ודף התהליך אומר שההכנה עצמה עוד לא באתר.
// כך דף התהליך ושאר קוד האיסוף זהים בשני הענפים.

import type { ComponentType } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { Evidence, YearFact } from './types';

export interface EstimatePanelProps { client: Client; step: OnboardingStep; year: number; cutoffMonth: number; facts: YearFact[]; evidence: Evidence[] }
export interface AnnualReturnPanelProps {
  client: Client; step: OnboardingStep; year: number; facts: YearFact[]; evidence: Evidence[];
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
}
export interface PortalTaxEstimateProps { stepId: string; token: string; onClose: () => void }

/** undefined = השלב לא קיים בגרסה הזו של האתר. */
export const EstimatePanel: ComponentType<EstimatePanelProps> | undefined = undefined;
export const AnnualReturnPanel: ComponentType<AnnualReturnPanelProps> | undefined = undefined;
export const PortalTaxEstimate: ComponentType<PortalTaxEstimateProps> | undefined = undefined;

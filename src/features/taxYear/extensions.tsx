// ─── שנת מס: רכיבים של שלבים שאחרי האיסוף ───────────────────────────────────
// ‼ הקובץ הזה מחבר לדף התהליך רק את מה ששוחרר. חבילת «ידע והערכת מס» (13.10.2026) מחברת
// את הכנת ההערכה (231–232); הכנת הדוח השנתי (233, features/annualReturn) נשארת בענף
// tax-foundation עד הסבב שלה — כאן undefined, ודף התהליך אומר שההכנה עצמה עוד לא באתר.

import type { ComponentType } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import type { Evidence, YearFact } from './types';
import EstimatePanelImpl from '../taxEstimate/EstimatePanel';
import PortalTaxEstimateImpl from '../taxEstimate/PortalTaxEstimate';

export interface EstimatePanelProps { client: Client; step: OnboardingStep; year: number; cutoffMonth: number; facts: YearFact[]; evidence: Evidence[] }
export interface AnnualReturnPanelProps {
  client: Client; step: OnboardingStep; year: number; facts: YearFact[]; evidence: Evidence[];
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;
}
export interface PortalTaxEstimateProps { stepId: string; token: string; onClose: () => void }

/** undefined = השלב לא קיים בגרסה הזו של האתר. */
export const EstimatePanel: ComponentType<EstimatePanelProps> | undefined = EstimatePanelImpl;
export const AnnualReturnPanel: ComponentType<AnnualReturnPanelProps> | undefined = undefined;
export const PortalTaxEstimate: ComponentType<PortalTaxEstimateProps> | undefined = PortalTaxEstimateImpl;

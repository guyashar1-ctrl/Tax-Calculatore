// ‼ בלי רשת: ראה sampleActions.ts. הקובץ שנבחר בהעלאה אינו נקרא ואינו יוצא מהדפדפן.
import type { OnboardingActions } from '../OnboardingPage';
import { SIMULATED } from './sampleActions';

export const sampleOnboardingActions: OnboardingActions = {
  saveStep: async () => SIMULATED,
  submit: async () => SIMULATED,
  submitSignature: async () => SIMULATED,
  makeSpouseLink: async () => SIMULATED,
  uploadIdDoc: async () => SIMULATED,
};

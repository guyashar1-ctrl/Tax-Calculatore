// ‼ בלי רשת: ראה sampleActions.ts. התשובה אינה נשמרת והשאלון אינו מתקדם.
import type { PublicIntakeActions } from '../PublicIntake';
import type { PublicIntakePageActions } from '../PublicIntakePage';
import { SIMULATED } from './sampleActions';

export const samplePublicIntakeActions: PublicIntakeActions = {
  saveAnswer: async () => SIMULATED,
};

export const samplePublicIntakePageActions: PublicIntakePageActions = {
  reopen: async () => SIMULATED,
};

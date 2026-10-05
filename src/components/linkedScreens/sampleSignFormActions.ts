// ‼ בלי רשת: ראה sampleActions.ts. החתימה אינה נשלחת, והדף אינו עובר ל«התקבלה».
import type { PublicSmartFormSignActions } from '../../features/smartForms/PublicSmartFormSignPage';
import { SIMULATED } from './sampleActions';

export const samplePublicSmartFormSignActions: PublicSmartFormSignActions = {
  submit: async () => SIMULATED,
};

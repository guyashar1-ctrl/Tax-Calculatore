// ‼ בלי רשת: ראה sampleActions.ts. הקבצים שנבחרים בהעלאה אינם נקראים ואינם יוצאים מהדפדפן.
import type { PublicReleaseActions } from '../PublicReleasePage';
import { SIMULATED } from './sampleActions';

export const samplePublicReleaseActions: PublicReleaseActions = {
  setItem: async () => SIMULATED,
  sendNote: async () => SIMULATED,
  removeUpload: async () => SIMULATED,
  markItems: async () => SIMULATED,
  uploadFile: async () => SIMULATED,
  flush() { /* אין התראה למשרד על תצוגה לדוגמה */ },
};

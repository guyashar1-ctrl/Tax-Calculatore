// ‼ בלי רשת: ראה sampleActions.ts. אין כאן הורדת מסמכים — לדוגמה יש טופס אחד, והבתים שלו נכנסים ב-data.
import type { PublicSignActions } from '../PublicSignPage';
import { SIMULATED } from './sampleActions';

export const samplePublicSignActions: PublicSignActions = {
  async loadDocument() { throw new Error('תצוגה לדוגמה: טופס אחד בלבד'); },
  submit: async () => SIMULATED,
  restart() { /* בתצוגה לדוגמה «ביטול» מאפס את החדר במסך עצמו */ },
  navigate() { /* אין מעבר לדף אחר */ },
  spouse: {
    handoff: async () => SIMULATED,
    invite: async () => SIMULATED,
  },
};

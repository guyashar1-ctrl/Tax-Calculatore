// ─── «ללמוד» מתוך עבודה בתיק — וחזרה לאותה עבודה ────────────────────────────
// ‼ מסך עבודה (הערכת מס, תהליך בשנת המס) פותח נושא בידע המס בלי לדעת על הניווט של האפליקציה:
//   כרטיס הלקוח מספק את הפעולה (Context). «חזרה לתיק» מהנושא נוחתת בלשונית «תיק מס»; כדי לחזור
//   לאותה עבודה (ולא רק לתיק) נשמר כאן — בלשונית הדפדפן בלבד — איזה תהליך היה פתוח, ומסך שנות המס
//   פותח אותו פעם אחת כשהוא נטען.
import { createContext, useContext } from 'react';

export interface KnowledgeLink {
  /** פותח נושא; returnStepId — התהליך בשנת המס שממנו יצאו (כדי לחזור אליו). */
  open: (topicId: string, returnStepId?: string) => void;
  /** משימת המשך ללקוח הזה (למשל «לעדכן מקדמה ברשות» אחרי אישור הערכה) — אותן משימות של «משימות». */
  createTask?: (title: string) => void;
}

export const KnowledgeLinkContext = createContext<KnowledgeLink | null>(null);
export const useKnowledgeLink = () => useContext(KnowledgeLinkContext);

const KEY = 'pivo.knowledgeReturn';

export function rememberKnowledgeReturn(clientId: string, stepId: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ clientId, stepId, at: Date.now() })); } catch { /* בלי אחסון — החזרה תהיה לתיק בלבד */ }
}

/** מחזיר (ומוחק) את התהליך שממנו יצאו ללמוד — רק ללקוח הזה ורק אם לא עברה שעה. */
export function consumeKnowledgeReturn(clientId: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as { clientId: string; stepId: string; at: number };
    if (r.clientId !== clientId) return null;
    sessionStorage.removeItem(KEY);
    return Date.now() - r.at < 3_600_000 ? r.stepId : null;
  } catch { return null; }
}

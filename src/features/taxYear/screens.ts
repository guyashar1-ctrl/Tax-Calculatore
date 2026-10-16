// ─── הדף האישי: מהשאלות למסכים (16.10.2026, «בקשה אחת לתיק המס» שלב 2) ─────────────────────────
// ‼ טהור. שאלה = שורה בשרת; מסך = מה שהלקוח רואה. כל אישורי הכרטיס («זה מה שידוע לנו») שעוד לא נענו מתקבצים
//   למסך אחד «מה שכבר ידוע לנו — נכון?»; «יש שינוי» בשורה פותח את השאלה שלה (עריכה מובנית) כמסך משלה.
// ‼ הסדר: אישורים → מסך הרשת → של מי / איפה ושאר השאלות → מסמכים (בהיכרות אין).

import type { InfoAsk } from './types';

export type Screen =
  | { kind: 'confirmAll'; asks: InfoAsk[] }
  | { kind: 'ask'; ask: InfoAsk };

const RANK = (a: InfoAsk) => (a.prompt.input.kind === 'confirm' ? 0 : a.prompt.input.kind === 'multi' ? 1 : a.prompt.input.kind === 'file' ? 3 : 2);
export const sortAsks = (asks: InfoAsk[]) => [...asks].sort((a, b) => RANK(a) - RANK(b));

/**
 * המסכים. `opened` — אישורים שהלקוח סימן בהם «יש שינוי» (או שכבר נענו) — כל אחד מסך משלו, מיד אחרי מסך האישור.
 * שני אישורים ומעלה שעוד פתוחים ⇒ מסך אישור אחד; אישור יחיד נשאר מסך רגיל (אין מה לקבץ).
 */
export function buildScreens(asks: InfoAsk[], opened: ReadonlySet<string>): Screen[] {
  const sorted = sortAsks(asks);
  const grouped = sorted.filter(a => a.prompt.input.kind === 'confirm' && a.state === 'published' && !opened.has(a.id));
  const out: Screen[] = [];
  let placed = false;
  for (const a of sorted) {
    if (grouped.length >= 2 && grouped.includes(a)) {
      if (!placed) { out.push({ kind: 'confirmAll', asks: grouped }); placed = true; }
      continue;
    }
    out.push({ kind: 'ask', ask: a });
  }
  return out;
}

/** המסך הראשון שעוד לא נענה (חזרה אחרי «שמירה ויציאה»). -1 = הכול נענה. */
export function firstOpenScreen(screens: Screen[]): number {
  return screens.findIndex(s => (s.kind === 'confirmAll' ? s.asks.some(a => a.state === 'published') : s.ask.state === 'published'));
}

export const screenAsks = (s: Screen): InfoAsk[] => (s.kind === 'confirmAll' ? s.asks : [s.ask]);

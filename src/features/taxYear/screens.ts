// ─── הדף האישי: מהשאלות למסכים (16.10.2026, «בקשה אחת לתיק המס» שלב 2) ─────────────────────────
// ‼ טהור. שאלה = שורה בשרת; מסך = מה שהלקוח רואה. כל אישורי הכרטיס («זה מה שידוע לנו») שעוד לא נענו מתקבצים
//   למסך אחד «מה שכבר ידוע לנו — נכון?»; «יש שינוי» בשורה פותח את השאלה שלה (עריכה מובנית) כמסך משלה.
// ‼ הסדר: אישורים → מסך הרשת → של מי / איפה ושאר השאלות → מסמכים (בהיכרות אין).

import type { InfoAsk } from './types';
import { ITEM_BY_KEY } from './catalog';
import { GRID_KEYS } from './asks';

export type Screen =
  | { kind: 'confirmAll'; asks: InfoAsk[] }
  | { kind: 'ask'; ask: InfoAsk };

// ‼ שאלות ההמשך של מסך הרשת («של מי / איפה», «מי מכם?») — מיד אחריו, לפני שאר השאלות (ילדים, חשבון בנק)
// ‼ 19.10.2026 · מסך רשת קטן בתוך ענף (למשל «מה קרה?» ⇒ «מה {בן/בת הזוג} קיבל/ה») — שאלת המשך, לא הרשת הראשית;
//   ובתוך שאלות שנפתחו יחד — לפי prompt.order (כך שהתאריך בא לפני «מה התקבל», והמסמכים בסוף).
const RANK = (a: InfoAsk) => (a.prompt.input.kind === 'confirm' ? 0 : a.prompt.input.kind === 'multi' && GRID_KEYS.includes(a.itemKey) ? 1
  : a.prompt.input.kind === 'file' ? 4 : (ITEM_BY_KEY[a.itemKey]?.after || a.prompt.input.kind === 'who' || a.prompt.input.kind === 'multi') ? 2 : 3);
export const sortAsks = (asks: InfoAsk[]) => [...asks].sort((a, b) => RANK(a) - RANK(b) || (a.prompt.order ?? 0) - (b.prompt.order ?? 0));

/**
 * המסכים. `opened` — אישורים שהלקוח סימן בהם «יש שינוי» (או שכבר נענו) — כל אחד מסך משלו, מיד אחרי מסך האישור.
 * שני אישורים ומעלה שעוד פתוחים ⇒ מסך אישור אחד; אישור יחיד נשאר מסך רגיל (אין מה לקבץ).
 */
export function buildScreens(asks: InfoAsk[], opened: ReadonlySet<string>): Screen[] {
  const sorted = sortAsks(asks);
  const confirms = sorted.filter(a => a.prompt.input.kind === 'confirm');
  const grouped = confirms.filter(a => a.state === 'published' && !opened.has(a.id));
  if (grouped.length < 2) return sorted.map(a => ({ kind: 'ask', ask: a }));
  // ‼ השורות שסומנו «יש שינוי» — מיד אחרי מסך האישור (לא במקומן הממוין), כדי שהתיקון יבוא ברצף
  const openedList = confirms.filter(a => a.state === 'published' && opened.has(a.id));
  const out: Screen[] = [];
  let placed = false;
  for (const a of sorted) {
    if (grouped.includes(a) || openedList.includes(a)) {
      if (!placed) { out.push({ kind: 'confirmAll', asks: grouped }, ...openedList.map(ask => ({ kind: 'ask' as const, ask }))); placed = true; }
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

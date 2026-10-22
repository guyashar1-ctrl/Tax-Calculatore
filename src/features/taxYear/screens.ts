// ─── הדף האישי: מהשאלות למסכים (16.10.2026, «בקשה אחת לתיק המס» שלב 2) ─────────────────────────
// ‼ טהור. שאלה = שורה בשרת; מסך = מה שהלקוח רואה. כל אישורי הכרטיס («זה מה שידוע לנו») שעוד לא נענו מתקבצים
//   למסך אחד «מה שכבר ידוע לנו — נכון?»; «יש שינוי» בשורה פותח את השאלה שלה (עריכה מובנית) כמסך משלה.
// ‼ הסדר: אישורים → מסך הרשת → של מי / איפה ושאר השאלות → מסמכים (בהיכרות אין).

import type { InfoAsk } from './types';
import { ITEM_BY_KEY } from './catalog';
import { GRID_KEYS } from './asks';

/** 21.10.2026 · «לימודים וצבא» — מסך אחד לכל בני הבית, בסוף השאלות (flowDraft.ts › walkScreens). */
export const STUDIES_KEY = 'household.studies';

export type Screen =
  | { kind: 'confirmAll'; asks: InfoAsk[] }
  | { kind: 'ask'; ask: InfoAsk }
  /** 20.10.2026 · אותה שאלת בחירה לכמה אנשים («מה שולם מביטוח לאומי?» לכל אחד מבני הזוג) — מסך אחד, כרטיס לכל אדם. */
  | { kind: 'group'; asks: InfoAsk[] };

// ‼ שאלות ההמשך של מסך הרשת («של מי / איפה», «מי מכם?») — מיד אחריו, לפני שאר השאלות (ילדים, חשבון בנק)
// ‼ 19.10.2026 · מסך רשת קטן בתוך ענף (למשל «מה קרה?» ⇒ «מה {בן/בת הזוג} קיבל/ה») — שאלת המשך, לא הרשת הראשית;
//   ובתוך שאלות שנפתחו יחד — לפי prompt.order (כך שהתאריך בא לפני «מה התקבל», והמסמכים בסוף).
const RANK = (a: InfoAsk) => (a.prompt.input.kind === 'confirm' || a.prompt.knownRow ? 0 : a.prompt.input.kind === 'multi' && GRID_KEYS.includes(a.itemKey) ? 1
  : a.prompt.input.kind === 'file' ? 4 : (ITEM_BY_KEY[a.itemKey]?.after || a.prompt.input.kind === 'who' || a.prompt.input.kind === 'multi') ? 2 : 3);
export const sortAsks = (asks: InfoAsk[]) => [...asks].sort((a, b) => RANK(a) - RANK(b) || (a.prompt.order ?? 0) - (b.prompt.order ?? 0));

/**
 * המסכים. `opened` — אישורים שהלקוח סימן בהם «יש שינוי» (או שכבר נענו) — כל אחד מסך משלו, מיד אחרי מסך האישור.
 * שני אישורים ומעלה שעוד פתוחים ⇒ מסך אישור אחד; אישור יחיד נשאר מסך רגיל (אין מה לקבץ).
 */
export function buildScreens(asks: InfoAsk[], opened: ReadonlySet<string>, opts: { knownAll?: boolean } = {}): Screen[] {
  return groupSame(buildScreensRaw(asks, opened, opts));
}

/** מסכים רצופים של אותה שאלת בחירה (לא מסך הרשת) לאנשים שונים — מסך אחד. */
function groupSame(list: Screen[]): Screen[] {
  const out: Screen[] = [];
  for (const s of list) {
    const prev = out[out.length - 1];
    const groupable = (x: Screen | undefined): x is Extract<Screen, { kind: 'ask' } | { kind: 'group' }> => !!x && x.kind !== 'confirmAll'
      && screenAsks(x).every(a => (a.prompt.input.kind === 'multi' && !GRID_KEYS.includes(a.itemKey)) || a.itemKey === STUDIES_KEY);
    if (groupable(s) && groupable(prev) && screenAsks(prev)[0].itemKey === screenAsks(s)[0].itemKey) {
      out[out.length - 1] = { kind: 'group', asks: [...screenAsks(prev), ...screenAsks(s)] };
      continue;
    }
    out.push(s);
  }
  return out;
}

function buildScreensRaw(asks: InfoAsk[], opened: ReadonlySet<string>, opts: { knownAll?: boolean }): Screen[] {
  const sorted = sortAsks(asks);
  // ‼ 21.10.2026 · סבב 2 (השאלון השנתי, knownAll): גם שורה ממולאת מהכרטיס (חשבון להחזר) בתוך «זה עדיין נכון?», וגם שורה אחת היא מסך כזה
  const confirms = sorted.filter(a => a.prompt.input.kind === 'confirm' || (opts.knownAll && a.prompt.knownRow));
  const grouped = confirms.filter(a => a.state === 'published' && !opened.has(a.id));
  if (grouped.length < (opts.knownAll ? 1 : 2)) return sorted.map(a => ({ kind: 'ask', ask: a }));
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
  return screens.findIndex(s => screenAsks(s).some(a => a.state === 'published'));
}

export const screenAsks = (s: Screen): InfoAsk[] => (s.kind === 'ask' ? [s.ask] : s.asks);

// ─── עץ השאלון בשורת הבקשה (16.10.2026) ─────────────────────────────────────
// ‼ «כל עבודה היא בקשה»: שורת הבקשה ב«בקשות» מציגה תחומים ← פריטים, ולכל פריט מצב אחד בשפת המשרד:
//   נענה / חסר / מסמך הגיע / לבדיקת משרד. ‼ טהור — אותו מקור (picture.ts ItemStatus), בלי חישוב שני.
// ‼ «לא חל» אינו פריט בעץ — נספר בנפרד, כדי שהעץ יראה רק מה שעוד רלוונטי.

import { AREAS, type AreaId } from './catalog';
import type { ItemState, ItemStatus } from './picture';

export type TreeMark = 'answered' | 'review' | 'docArrived' | 'asked' | 'missing' | 'later';

export const TREE_MARK: Record<TreeMark, { label: string; tone: string }> = {
  answered: { label: 'נענה', tone: 'green' },
  review: { label: 'לבדיקת משרד', tone: 'violet' },
  docArrived: { label: 'מסמך הגיע', tone: 'violet' },
  asked: { label: 'נשאל — ממתין', tone: 'blue' },
  missing: { label: 'חסר', tone: 'red' },
  later: { label: 'עוד לא זמין', tone: 'amber' },
};

export function markOf(state: ItemState): TreeMark | null {
  switch (state) {
    case 'known': case 'partial': case 'fromCard': return 'answered';
    case 'pendingReview': return 'review';
    case 'docReceived': return 'docArrived';
    case 'asked': return 'asked';
    case 'unavailable': case 'notYetAvailable': return 'later';
    case 'missing': return 'missing';
    case 'notApplicable': return null;
  }
}

export interface TreeArea {
  area: AreaId;
  items: { status: ItemStatus; mark: TreeMark }[];
  counts: Record<TreeMark, number>;
  /** יש בתחום משהו שהמשרד צריך לעשות עכשיו (לבדוק תשובה / מסמך שהגיע). */
  needsOffice: boolean;
}

const zero = (): Record<TreeMark, number> => ({ answered: 0, review: 0, docArrived: 0, asked: 0, missing: 0, later: 0 });

/** תחומים לפי סדר הקטלוג; בתוך תחום — מה שדורש את המשרד קודם, אחריו חסר, ואז השאר. */
export function buildQuestionTree(statuses: ItemStatus[]): { areas: TreeArea[]; notApplicable: number; totals: Record<TreeMark, number> } {
  const order: TreeMark[] = ['review', 'docArrived', 'missing', 'asked', 'later', 'answered'];
  const by = new Map<AreaId, TreeArea>();
  const totals = zero();
  let notApplicable = 0;
  for (const s of statuses) {
    const mark = markOf(s.state);
    if (!mark) { notApplicable++; continue; }
    const a = by.get(s.area) ?? { area: s.area, items: [], counts: zero(), needsOffice: false };
    a.items.push({ status: s, mark });
    a.counts[mark]++;
    totals[mark]++;
    if (mark === 'review' || mark === 'docArrived') a.needsOffice = true;
    by.set(s.area, a);
  }
  const areas = AREAS.map(x => by.get(x.id)).filter((x): x is TreeArea => !!x);
  for (const a of areas) a.items.sort((x, y) => order.indexOf(x.mark) - order.indexOf(y.mark));
  return { areas, notApplicable, totals };
}

/** «3 נענו · 2 חסרים · 1 לבדיקה» — רק מה שאינו אפס. */
export function countsLine(c: Record<TreeMark, number>): string {
  const parts: string[] = [];
  if (c.answered) parts.push(c.answered === 1 ? 'אחד נענה' : `${c.answered} נענו`);
  if (c.review) parts.push(`${c.review} לבדיקה`);
  if (c.docArrived) parts.push(c.docArrived === 1 ? 'מסמך אחד הגיע' : `${c.docArrived} מסמכים הגיעו`);
  if (c.asked) parts.push(`${c.asked} ממתינים לתשובה`);
  if (c.missing) parts.push(c.missing === 1 ? 'אחד חסר' : `${c.missing} חסרים`);
  if (c.later) parts.push(`${c.later} עוד לא זמינים`);
  return parts.join(' · ');
}

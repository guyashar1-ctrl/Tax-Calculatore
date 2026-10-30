// ─── סדר הרשימה ב«בקשות» — גרירה (310, 29.10.2026) ─────────────────────────────
// ‼ הסדר שהמשרד קובע הוא הסדר היחיד: ברשימה במשרד ובדף של הלקוח (build_client_portal
// ממיין לפי sort_order). השורות ברשימה הן «פריטים»: בקשה בודדת, או קבוצה שלמה —
// וקבוצה זזה כגוש אחד, עם כל הבקשות שבה בסדר הפנימי שלה.

/** פריט ברשימה: מפתח יציב והבקשות שהוא מחזיק, בסדר. */
export interface ListEntry {
  key: string;
  stepIds: readonly string[];
}

/**
 * מקומו של פריט = המקום של הבקשה הראשונה שלו בסדר הקיים.
 * בקשה שאינה בסדר (חדשה, עוד לא נטענה) — בסוף.
 */
export function entryPosition(entry: ListEntry, order: ReadonlyMap<string, number>): number {
  let best = Number.POSITIVE_INFINITY;
  for (const id of entry.stepIds) {
    const p = order.get(id);
    if (p !== undefined && p < best) best = p;
  }
  return best;
}

/** מיון יציב של הפריטים לפי הסדר הקיים (שובר שוויון: הסדר שבו התקבלו). */
export function sortEntries<T extends ListEntry>(entries: readonly T[], orderedIds: readonly string[]): T[] {
  const order = new Map(orderedIds.map((id, i) => [id, i]));
  return entries
    .map((e, i) => ({ e, i, p: entryPosition(e, order) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map(x => x.e);
}

/**
 * הגרירה עצמה: מעבירה את `fromKey` למקום של `toKey` ומחזירה את כל מזהי הבקשות בסדר
 * החדש — הפריטים שעל המסך קודם, ואחריהם כל מה שלא מוצג (שהושלם, מוסתר) בסדר שהיה לו.
 * ‼ שולחים את כל הרשימה ולא רק את מה שזז: אחרת שני פריטים מקבלים אותו sort_order.
 * הזזה למטה ⇒ אחרי היעד; למעלה ⇒ לפניו (כמו שהעין רואה את קו הנחיתה).
 * אותו פריט, או מפתח לא מוכר ⇒ null (אין מה לשמור).
 */
export function moveEntry(
  entries: readonly ListEntry[], fromKey: string, toKey: string, allIds: readonly string[],
): string[] | null {
  if (fromKey === toKey) return null;
  const from = entries.findIndex(e => e.key === fromKey);
  const to = entries.findIndex(e => e.key === toKey);
  if (from < 0 || to < 0) return null;
  const next = entries.slice();
  const [moved] = next.splice(from, 1);
  const at = next.findIndex(e => e.key === toKey);
  next.splice(from < to ? at + 1 : at, 0, moved);
  const shown = next.flatMap(e => e.stepIds);
  const seen = new Set(shown);
  return [...shown, ...allIds.filter(id => !seen.has(id))];
}

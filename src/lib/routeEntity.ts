// ─── מה מציגים בכתובת שמצביעה על ישות (בקשה, לקוח, הצעה) ──────────────────────
//
// ‼ 24.09.2026 · באג בייצור: F5 בתוך ‎#/request/<id>‎ הציג «הבקשה לא נמצאה» על
// בקשה קיימת. המסך שאל רק «יש לי את השורה?», ולכן «עוד לא נטען» ו«לא קיים»
// קרסו לאותה תשובה. כאן ארבעה מצבים מפורשים, ו«לא נמצא» מותר רק אחרי שאילתה
// שהסתיימה ואמרה את זה.

export type EntityResolution = 'loading' | 'found' | 'not_found' | 'error';

/** תוצאת שאילתה אחת לשורה אחת. שגיאה ≠ «אין שורה». טהורה. */
export function lookupOutcome(r: { data: unknown; error: unknown }): Exclude<EntityResolution, 'loading'> {
  if (r.error) return 'error';
  return r.data ? 'found' : 'not_found';
}

/**
 * ישות שנשלפת לבד (בקשה במצב lean — הרשימה אינה מספיקה, צריך את השורה המלאה).
 * @param signedIn האם זהות המשתמש כבר שוחזרה. לפני כן כל שאילתה רצה כאנונימי,
 *   ו-RLS מחזיר «אין שורה» — ולכן עד אז התשובה היא תמיד «טוען».
 * @param ready השורה המלאה נמצאת בזיכרון.
 * @param lookup התוצאה האחרונה של השאילתה לשורה הזאת, אם הסתיימה.
 */
export function resolveFetchedEntity(p: {
  signedIn: boolean;
  ready: boolean;
  lookup?: Exclude<EntityResolution, 'loading'>;
}): EntityResolution {
  if (!p.signedIn) return 'loading';
  if (p.ready) return 'found';
  if (p.lookup === 'not_found' || p.lookup === 'error') return p.lookup;
  return 'loading';
}

/** ישות שמגיעה מרשימה שנטענת כולה (לקוחות, הצעות). */
export function resolveListedEntity(p: {
  signedIn: boolean;
  listLoading: boolean;
  listError?: string | null;
  present: boolean;
}): EntityResolution {
  if (p.present) return 'found';
  if (!p.signedIn || p.listLoading) return 'loading';
  if (p.listError) return 'error';
  return 'not_found';
}

/**
 * רשימה רזה שהגיעה אחרי שבקשה מסוימת כבר נשלפה במלואה — לא דורסים את השורה
 * המלאה בשורה הרזה. ‼ זה היה חצי מהבאג: טעינת הרשימה איפסה את סימון
 * «נשלפה במלואה», והבקשה שנפתחה חזרה ל«לא נטען» ומשם ל«לא נמצאה». טהורה.
 */
export function mergeListKeepingHydrated<T extends { id: string }>(
  prev: T[], list: T[], hydrated: ReadonlySet<string>,
): T[] {
  const full = new Map(prev.filter(r => hydrated.has(r.id)).map(r => [r.id, r]));
  const merged = list.map(r => full.get(r.id) ?? r);
  for (const [id, r] of full) if (!list.some(x => x.id === id)) merged.push(r);
  return merged;
}

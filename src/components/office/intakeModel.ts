// «בקשות ללקוח חדש» · לוגיקה טהורה של הטיוטה (בלי React ובלי Supabase — נבדקת ב-node).
import type { ClientKind, DefaultEntry } from '../../types/journeyDefaults';
import { CLIENT_KIND_ORDER } from '../../types/journeyDefaults';
import { stableStringify } from './officeModel';

export type ByKind = Partial<Record<ClientKind, DefaultEntry[]>>;

/** סוגים שבהם הטיוטה שונה מהשמור. */
export function changedKinds(draft: ByKind, saved: ByKind): ClientKind[] {
  return CLIENT_KIND_ORDER.filter(k => draft[k] !== undefined
    && stableStringify(draft[k]) !== stableStringify(saved[k] ?? []));
}

/**
 * טעינה מחדש מהשרת. הטיוטה מחזיקה רק סוגים שנערכו (השאר נקראים מהשמור);
 * סוג שיש בו שינוי פתוח נשאר כפי שהוא, וסוג שאין בו שינוי יורד מהטיוטה.
 */
export function mergeLoaded(prevDraft: ByKind, prevSaved: ByKind): ByKind {
  const next: ByKind = {};
  for (const k of changedKinds(prevDraft, prevSaved)) next[k] = prevDraft[k];
  return next;
}

/** מה מוצג לסוג — הטיוטה אם נערך, אחרת השמור. */
export const entriesOf = (draft: ByKind, saved: ByKind, k: ClientKind): DefaultEntry[] =>
  draft[k] ?? saved[k] ?? [];


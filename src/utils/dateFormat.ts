/**
 * פורמט תאריך אחד לכל המוצר — אפיון L4 / D8.
 * רשימות וטבלאות: dd.mm.yy · טפסים ומסכי פירוט: dd.mm.yyyy.
 * שום מסך לא בונה תאריך בעצמו.
 */

/** היום, כמחרוזת ISO מקומית (YYYY-MM-DD). לא UTC — אחרת "היום" קופץ בלילה. */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** מספר הימים בין שני תאריכי ISO. חיובי = a אחרי b. */
export function daysBetween(a: string, b: string): number {
  const ta = new Date(a + 'T00:00:00').getTime();
  const tb = new Date(b + 'T00:00:00').getTime();
  return Math.round((ta - tb) / 86400000);
}

/** מנרמל קלט (ISO קצר, ISO מלא עם שעה, או Date) ל-YYYY-MM-DD. */
function toIsoDay(value: string | Date): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDay(parsed);
}

export type DateMode = 'list' | 'form';

/** dd.mm.yy ברשימות, dd.mm.yyyy בטפסים. מחזיר '' לקלט לא תקין. */
export function formatDate(value: string | Date | undefined | null, mode: DateMode = 'list'): string {
  if (!value) return '';
  const iso = toIsoDay(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return mode === 'form' ? `${d}.${m}.${y}` : `${d}.${m}.${y.slice(2)}`;
}

/**
 * כמה ימים המשימה באיחור. 0 או פחות = לא באיחור.
 * זהו התיקון של L1: ההשוואה היא מול היום, לא מול תאריך קבוע כלשהו,
 * ולכן תאריך עתידי לעולם לא נספר כאיחור.
 */
export function daysLate(dueIso: string | undefined | null): number {
  const iso = toIsoDay(dueIso || '');
  if (!iso) return 0;
  const diff = daysBetween(todayIso(), iso);
  return diff > 0 ? diff : 0;
}

/** ניסוח האיחור לטולטיפ — "באיחור יום" / "באיחור 5 ימים". */
export function lateLabel(dueIso: string | undefined | null): string | null {
  const n = daysLate(dueIso);
  if (n <= 0) return null;
  return n === 1 ? 'באיחור יום' : `באיחור ${n} ימים`;
}

// ─── ימי עסקים (ישראל) ──────────────────────────────────────────────────────
// שבוע העבודה בישראל: ראשון–חמישי. סוף שבוע: שישי (5) ושבת (6).
// חגים אינם מטופלים כאן (דורשים לוח שנה עברי) — רק סופי שבוע.

function isBusinessDay(d: Date): boolean {
  const day = d.getDay(); // 0=ראשון … 6=שבת
  return day !== 5 && day !== 6;
}

/** מוסיף n ימי עסקים לתאריך (מדלג על שישי/שבת). */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) added++;
  }
  return d;
}

/** מספר ימי העסקים מעכשיו ועד תאריך היעד (0 אם היעד עבר / היום). */
export function businessDaysUntil(target: Date, now: Date = new Date()): number {
  if (target.getTime() <= now.getTime()) return 0;
  const d = new Date(now);
  let count = 0;
  while (d.getTime() < target.getTime()) {
    d.setDate(d.getDate() + 1);
    if (d.getTime() > target.getTime()) break;
    if (isBusinessDay(d)) count++;
  }
  return count;
}

/** תאריך תפוגה סטנדרטי: n ימי עסקים מעכשיו, בסוף היום. */
export function businessDaysExpiry(n: number, from: Date = new Date()): string {
  const d = addBusinessDays(from, n);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

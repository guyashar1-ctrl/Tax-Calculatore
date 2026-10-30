// ─── נספח 1342 — פרטים על נכסים לפחת, לכל עסק (30.10.2026) ──────────────────────────────────────────────────
// ‼ גיא: «מה שאני צריך לעשות זה רווח והפסד, הפסדים מועברים ודוח פחת». ההמחשה שאושרה:
//   docs/proposals/2026-10-30-annual-office-only-three.html — נכס משנה קודמת עובר לבד עם הפחת שנצבר; המשרד מוסיף רק נכסים
//   חדשים ובוחר שיעור; פחת השנה מחושב, והסכום הוא שורה 17 בנספח 1320.
// ‼ העמודות לפי הטופס הרשמי (public/forms/2025/pdf/1342.pdf): 1 תאריך רכישה / הפעלה · 2 המחיר המקורי · 5 שיעור הפחת ·
//   7 הפחת לשנה · 8 פחת נצבר בשנים קודמות · 9 סה״כ פחת · 10 יתרה להפחתה.
// ‼ פחת לפי חודשים: מחודש ההפעלה (או הרכישה) — חודש ההפעלה נספר; נכס שיצא — עד חודש היציאה. לא יותר מהיתרה.
// ‼ השיעורים המוצעים — מהידע בפרויקט (תקנות מס הכנסה (פחת), 1941: מחשב אישי 33%, ריהוט כללי 6%; רכב 15%). השיעור עצמו
//   נקבע בכל נכס, והמשרד יכול להקליד אחר.

export interface DepAsset {
  id: string;
  name: string;
  /** YYYY-MM */
  acquired: string;
  /** YYYY-MM — הפעלת הנכס, כשהיא שונה מהרכישה */
  started?: string;
  cost: number;
  /** אחוז שנתי */
  rate: number;
  /** פחת שנצבר בשנים קודמות (עמודה 8) */
  accumulated: number;
  /** YYYY-MM — הנכס נמכר / יצא מהעסק בשנה */
  disposed?: string;
  /** הגיע לבד מדוח השנה הקודמת */
  fromPrior?: boolean;
}

/** טבלת הפחת של עסק אחד. none — אין לעסק רכוש קבוע (תשובה, לא חוסר). */
export interface DepTable { assets: DepAsset[]; none?: boolean }

export const DEP_RATES: { rate: number; label: string }[] = [
  { rate: 33, label: 'מחשבים וציוד היקפי' },
  { rate: 6, label: 'ריהוט וציוד משרדי' },
  { rate: 15, label: 'רכב' },
];

const ym = (s?: string): [number, number] | null => {
  const m = /^(\d{4})-(\d{2})/.exec(s ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** חודשי הפחת בשנה. */
export function depMonths(a: Pick<DepAsset, 'acquired' | 'started' | 'disposed'>, year: number): number {
  const st = ym(a.started) ?? ym(a.acquired);
  if (!st || st[0] > year) return 0;
  const from = st[0] < year ? 1 : st[1];
  const out = ym(a.disposed);
  if (out && out[0] < year) return 0;
  const to = out && out[0] === year ? out[1] : 12;
  return Math.max(0, to - from + 1);
}

/** פחת השנה — עמודה 7. */
export function depForYear(a: DepAsset, year: number): number {
  const left = Math.max(0, (a.cost || 0) - (a.accumulated || 0));
  const raw = ((a.cost || 0) * (a.rate || 0)) / 100 * depMonths(a, year) / 12;
  return Math.round(Math.min(raw, left));
}

export interface DepRow { asset: DepAsset; months: number; year: number; total: number; remaining: number }
export interface Dep1342 { rows: DepRow[]; total: number; problems: string[] }

export function compute1342(t: DepTable | undefined, year: number): Dep1342 {
  if (!t || t.none) return { rows: [], total: 0, problems: [] };
  const rows = t.assets.map(a => {
    const y = depForYear(a, year);
    return { asset: a, months: depMonths(a, year), year: y, total: y + (a.accumulated || 0), remaining: Math.max(0, (a.cost || 0) - (a.accumulated || 0) - y) };
  });
  const problems: string[] = [];
  for (const a of t.assets) {
    const nm = a.name.trim() || 'נכס בלי שם';
    if (!a.name.trim()) problems.push('נכס בלי שם');
    if (!ym(a.acquired)) problems.push(`${nm}: חסר תאריך רכישה`);
    if (!(a.cost > 0)) problems.push(`${nm}: חסר המחיר המקורי`);
    if (!(a.rate > 0)) problems.push(`${nm}: חסר שיעור פחת`);
  }
  return { rows, total: rows.reduce((s, r) => s + r.year, 0), problems };
}

/** הטבלה של השנה מהטבלה של השנה הקודמת: הפחת נצבר, נכס שהופחת עד הסוף או שיצא — לא עובר. */
export function carryForward(prev: DepTable | undefined, prevYear: number): DepTable | undefined {
  if (!prev) return undefined;
  if (prev.none) return { assets: [], none: true };
  const assets = prev.assets
    .filter(a => { const out = ym(a.disposed); return !out || out[0] > prevYear; })
    .map(a => ({ ...a, accumulated: (a.accumulated || 0) + depForYear(a, prevYear), fromPrior: true }))
    .filter(a => a.cost - a.accumulated > 0.5);
  return { assets };
}

export const isDone1342 = (t: DepTable | undefined, year: number) => !!t && (t.none || (t.assets.length > 0 && compute1342(t, year).problems.length === 0));

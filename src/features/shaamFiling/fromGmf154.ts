// ─── שאילתה 154 → חובות הגשה של הלקוח (21.10.2026) ─────────────────────────────────────────────────
// ‼ יישור הקו של מס הכנסה קורא 154 («מידע אודות שנות מס») לתיק אחד, והתוצאה נכנסת לאותו מקום כמו
//   רשימות IDOM/AHZM (250 — shaam_filing_import): «מרשימות שע״ם» ב«דוחות והצהרות» וב«כל העבודות».
//   כל הכללים בשרת (שיוך, השוואה לקיים, מצב); כאן רק בונים את האצווה.
// ‼ מה נכנס: דוח שנתי «חייב בהגשה» בלי תאריך הגשה (פתוח); שנה שכבר יש לה שורה — כדי שהגשה תעדכן אותה;
//   ודרישות הצהרת הון. שנים שהוגשו ושלא היו פתוחות — לא: 20 שורות «הוגש» לכל לקוח היו מציפות את התיק.
// ‼ טהור.

import type { Batch, BatchRow, BatchSource } from './parse/batch';
import type { Obligation, SourceSummary } from './model';

export interface Gmf154Year {
  year: number;
  page: number;
  required: 'required' | 'not_required' | 'no_year' | 'other';
  requiredRaw: string;
  filedOn: string | null;
  filedRaw: string | null;
  legalDue: string | null;
  legalDueRaw: string | null;
  extension: string | null;
  extensionRaw: string | null;
  extensionSource: string | null;
  section: string | null;
  sectionText: string | null;
}
export interface Gmf154Wealth { year: number | null; text: string; due: string | null; passed: boolean }
export interface Gmf154Filing {
  years: Gmf154Year[];
  wealth: Gmf154Wealth[];
  pagesRead: number;
  /** הגענו לעמוד שאין בו אף שנה קיימת — כל השנים נקראו. */
  complete: boolean;
  name: string | null;
}

/** שם המקור ב-shaam_filing_sources — כך מזהים בתצוגה שהשורה באה מ-154 ולא מקובץ. */
export const GMF154_SOURCE_NAME = 'שע״ם · שאילתה 154 — מידע אודות שנות מס';
export const isGmf154Source = (s: Pick<SourceSummary, 'method' | 'fileName'>) => s.method === 'manual' && s.fileName === GMF154_SOURCE_NAME;
export const isGmf154Obligation = (o: Pick<Obligation, 'sourceName'>) => o.sourceName === GMF154_SOURCE_NAME;

/** תוצאת המשימה ⇒ השנים מ-154, או null (ריצה ישנה של 134 בלבד / 154 לא נקראה). */
export function gmf154Filing(result: unknown): Gmf154Filing | null {
  const f = (result as { filing?: Gmf154Filing } | null | undefined)?.filing;
  return f && Array.isArray(f.years) && Array.isArray(f.wealth) ? f : null;
}

/** «חייב בהגשה» ואין תאריך הגשה — מהחדשה לישנה. */
export const openReturnYears = (f: Gmf154Filing) =>
  f.years.filter(y => y.required === 'required' && !y.filedOn).sort((a, b) => b.year - a.year);

/** המועד שנשמר לחובה: הארכה כשיש, אחרת המועד החוקי — כמו העמודה «מועד חוקי/תאריך ארכה» ב-IDOM. */
function dueOf(y: Gmf154Year): { legalDue?: string; legalDueRaw?: string } {
  if (y.extension) return { legalDue: y.extension, legalDueRaw: `${y.extensionRaw} (ארכה${y.extensionSource ? ` · ${y.extensionSource}` : ''})` };
  return y.legalDue ? { legalDue: y.legalDue, legalDueRaw: y.legalDueRaw ?? undefined } : {};
}

/**
 * האצווה לשרת. `knownAnnualYears` — שנים שכבר יש להן שורת דוח שנתי לתיק הזה (כדי שהגשה תעדכן אותן).
 * `listWealthYears` — שנות הצהרת הון שכבר נקלטו מרשימת AHZM: הרשימה ההיא עשירה יותר (קבוצה, «חייב
 * בקנס»), ועדכון מ-154 היה מוחק אותן — ולכן 154 רק מוסיפה דרישה שאין לה שורה.
 * ‼ sha256 = מזהה הריצה: אותה ריצה שנקלטת שוב (שתי לשוניות, רענון) — אותו מקור, בלי כפילות.
 */
export function batchFromGmf154(filing: Gmf154Filing, o: {
  fileNumber: string; runId: string; producedOn: string;
  knownAnnualYears?: ReadonlySet<string>; listWealthYears?: ReadonlySet<string>;
}): Batch | null {
  const digits = o.fileNumber.replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits) || digits.length > 9) return null;
  const file = digits.padStart(9, '0');
  const known = o.knownAnnualYears ?? new Set<string>();
  const name = filing.name ?? '';
  const src = (kind: 'annual' | 'wealth'): BatchSource => ({
    key: `gmf154:${kind}`, method: 'manual', fileName: GMF154_SOURCE_NAME, sha256: `gmf154:${o.runId}:${kind}`,
    kind, producedOn: o.producedOn, status: filing.complete ? 'ok' : 'partial', pages: [],
  });

  const annual: BatchRow[] = filing.years
    .filter(y => (y.required === 'required' && !y.filedOn) || known.has(String(y.year)))
    .map((y, i) => ({
      sourceKey: 'gmf154:annual', page: y.page, line: i + 1, fileNumber: file, name,
      section: y.section ?? undefined, yearShown: String(y.year),
      // ‼ «לא חייב» / «שנה לא קיימת» ⇒ false — השרת שומר כהקשר, לא כחובה.
      required: y.required === 'required',
      ...dueOf(y),
      filedOn: y.filedOn ?? undefined, filedOnRaw: y.filedRaw ?? undefined,
      problems: [],
    }));

  const wealth: BatchRow[] = filing.wealth
    .filter(w => w.year && w.due && !o.listWealthYears?.has(String(w.year)))
    .map((w, i) => ({
      sourceKey: 'gmf154:wealth', line: i + 1, fileNumber: file, name, yearShown: String(w.year),
      legalDue: w.due!, legalDueRaw: w.text, problems: [],
    }));

  if (!annual.length && !wealth.length) return null;
  return {
    sources: [...(annual.length ? [src('annual')] : []), ...(wealth.length ? [src('wealth')] : [])],
    rows: [...annual, ...wealth],
  };
}

/**
 * שורת הסיכום ב«דוחות והצהרות» אחרי הקריאה (22.10.2026: עברה לשם מכרטיס מס הכנסה).
 * ‼ כשיש שנה פתוחה — ריק: השורות שמתחת אומרות את זה. «כל הדוחות הנדרשים הוגשו» רק כשקראנו
 *   עד שנה שלא קיימת; אחרת — מאיזו שנה בדקנו.
 */
export function filingSummaryText(f: Gmf154Filing): string {
  if (openReturnYears(f).length) return '';
  const existing = f.years.filter(y => y.required !== 'no_year').map(y => y.year);
  if (f.complete || !existing.length) return 'כל הדוחות הנדרשים הוגשו';
  return `כל הדוחות הנדרשים הוגשו מ-${Math.min(...existing)}`;
}

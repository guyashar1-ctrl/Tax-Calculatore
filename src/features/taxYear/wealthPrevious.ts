// ─── הצהרת הון בהמשך: מה ידוע מההצהרה הקודמת שבמערכת ─────────────────────────────
// ‼ 12.10.2026 (גיא: «בהמשך צריך להשתמש בהצהרה הקודמת ולברר שינויים נכון למועד החדש»): כשההצהרה הקודמת הוכנה
//   במערכת, העובדות המאושרות שלה (ליום ההצהרה הקודם) הן הבסיס לשאלה «מה השתנה מאז» — לא רק סכומים שהוקלדו ביד.
// ‼ הן מוצגות כ«בהצהרה הקודמת: …» — לא מועתקות כעובדה ליום החדש. סכום ליום אחר אינו נכון ליום הזה.
// ‼ סדר העדיפות: עובדה מאושרת מהמערכת; ובהיעדרה — הסכום שהמשרד הקליד מההצהרה שהוגשה (payload.previous.sections).

import { ITEM_BY_KEY } from './catalog';
import type { YearFact } from './types';

const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** סיכום לכל תחום מההצהרה הקודמת במערכת — סכום המשרד (total) ופירוט קצר מהתשובות שאושרו. */
export function previousFromFacts(facts: YearFact[], prevAsOf: string | undefined): Record<string, string> {
  if (!prevAsOf) return {};
  const out: Record<string, { total?: number; words: string[] }> = {};
  const acc = facts.filter(f => f.status === 'accepted' && f.itemKey.startsWith('wealth.') && f.periodTo === prevAsOf);
  for (const f of acc) {
    const it = ITEM_BY_KEY[f.itemKey];
    if (!it) continue;
    const a = (out[it.area] ??= { words: [] });
    if (it.kind === 'amount' && typeof f.value === 'number') { a.total = (a.total ?? 0) + f.value; continue; }
    if (f.answer === 'zero' && it.kind === 'amount') { a.total = a.total ?? 0; continue; }
    if (typeof f.value === 'string' && f.value.trim()) a.words.push(clip(f.value.trim()));
  }
  return Object.fromEntries(Object.entries(out)
    .map(([area, v]) => [area, [v.total != null ? nis(v.total) : '', ...v.words.slice(0, 2)].filter(Boolean).join(' · ')])
    .filter(([, t]) => !!t));
}

/** מאחד: עובדה מהמערכת קודמת; סכום שהוקלד ביד — רק לתחום שאין לו עובדה. */
export function mergePrevious(fromFacts: Record<string, string>, typed: Record<string, string> | undefined): Record<string, string> | undefined {
  const m = { ...(typed ?? {}), ...fromFacts };
  return Object.keys(m).length ? m : undefined;
}

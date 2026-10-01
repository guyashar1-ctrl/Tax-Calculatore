// ─── הגדרת «עובד עצמאי» בביטוח לאומי — להערכה בלבד ─────────────────────────
// מקור: btl.gov.il › ביטוח › עובד עצמאי (נבדק 28.09.2026) ולשון טופס 6101:
//   • 20 שעות בשבוע בממוצע לפחות, או
//   • הכנסה חודשית ממוצעת ≥ 50% מהשכר הממוצע, או
//   • 12 שעות בשבוע בממוצע לפחות והכנסה ≥ 15% מהשכר הממוצע.
// הסכומים מ-01.01.2026: 50% = 6,885 ₪, 15% = 2,065 ₪.
//
// ‼ זו הערכה שמוצגת לרו"ח לצורך בדיקה — לא החלטה, לא ממליצה על ערכים,
// ואינה משנה אף שדה. הסיווג נקבע בביטוח לאומי. שנה בלי ספים ידועים ⇒ «לא ידוע».

export interface DefinitionThresholds { year: number; half: number; fifteenPct: number; source: string; }

export const SE_DEFINITION_THRESHOLDS: DefinitionThresholds[] = [
  { year: 2026, half: 6885, fifteenPct: 2065, source: 'btl.gov.il · עובד עצמאי · בתוקף מ-01.01.2026' },
];

export type DefinitionVerdict =
  | { kind: 'meets'; reason: string }
  | { kind: 'not_meets'; reason: string }
  | { kind: 'unknown'; reason: string };

/** hours: ממוצע שבועי; income: הכנסה חודשית ממוצעת. undefined = לא ידוע (לא 0). */
export function evaluateSelfEmployedDefinition(year: number, hours?: number, income?: number): DefinitionVerdict {
  const t = SE_DEFINITION_THRESHOLDS.find(x => x.year === year);
  if (hours != null && hours >= 20) return { kind: 'meets', reason: '20 שעות בשבוע ומעלה' };
  if (!t) return { kind: 'unknown', reason: `אין ב-PIVO ספי הכנסה מאומתים לשנת ${year}` };
  if (income != null && income >= t.half) return { kind: 'meets', reason: `הכנסה חודשית ≥ ${t.half.toLocaleString('en-US')} ₪ (50% מהשכר הממוצע)` };
  if (hours != null && hours >= 12 && income != null && income >= t.fifteenPct) {
    return { kind: 'meets', reason: `12 שעות ומעלה והכנסה ≥ ${t.fifteenPct.toLocaleString('en-US')} ₪` };
  }
  if (hours == null || income == null) return { kind: 'unknown', reason: 'חסרים שעות או הכנסה' };
  return { kind: 'not_meets', reason: 'אינו עומד באף אחת מהחלופות — «עצמאי שאינו עונה להגדרה»' };
}

/** פס השעות בטופס ⇒ טווח לחישוב (החסם התחתון, שמרני). */
export function hoursFromBand(band: string): number | undefined {
  return band === '20_plus' ? 20 : band === '12_19' ? 12 : band === '1_11' ? 1 : undefined;
}

export function bandFromHours(hours: number | undefined): '' | '1_11' | '12_19' | '20_plus' {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '';
  return hours >= 20 ? '20_plus' : hours >= 12 ? '12_19' : '1_11';
}

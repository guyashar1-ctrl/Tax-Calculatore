// ─── עיסוקים בביטוח לאומי — רשומות עם תקופות, לא ספירה ──────────────────────
// ‼ «2 עיסוקים» הוא תקציר, לא נתון. הנתון הוא הרשומות: מה כל עיסוק, ממתי,
// ועד מתי. עיסוקים **חופפים** מותרים (עצמאי וסטודנט באותה תקופה), ולא
// נחתכים זה מול זה. «בלי תאריך סיום» = נמשך; לעולם לא מסיקים סיום מהיום.

import type { NiOccupation, NiOccupationType } from '../../types';
import { NI_OCCUPATION_TYPE_LABELS } from '../../types';

/**
 * השם כפי שביטוח לאומי קורא לו ⇒ הסוג ב-PIVO (שקובע אילו שדות נוספים
 * רלוונטיים בעורך). ‼ התצוגה משתמשת ב-`sourceLabel` — הסוג הוא למיון
 * ולעורך בלבד. שם לא מוכר ⇒ 'other', והשם המקורי נשמר.
 */
export function niOccupationTypeFromBtl(label: string): NiOccupationType {
  const t = label.replace(/\s+/g, ' ').trim();
  if (t === 'עצמאי') return 'self_employed';
  if (/^עצמאי שאינו עונה/.test(t)) return 'self_employed_non_qualifying';
  if (/^(תלמיד|סטודנט)/.test(t)) return 'student';
  if (/^(עובד|שכיר)$/.test(t)) return 'employee';
  if (/פנסיה מוקדמת/.test(t)) return 'early_pension';
  if (/ללא עיסוק|לא עובד/.test(t)) return 'not_working';
  if (/הכנסה שאינה מעבודה/.test(t)) return 'non_work_income';
  return 'other';
}

/** השם שמוצג: המדויק מהפורטל כשיש, אחרת תווית הסוג. */
export function niOccupationLabel(o: NiOccupation): string {
  return o.sourceLabel?.trim() || NI_OCCUPATION_TYPE_LABELS[o.type] || 'עיסוק';
}

/**
 * חפיפה בין עיסוק לתקופה: מתחיל עד סוף התקופה, ונגמר (אם בכלל) לא לפני
 * תחילתה. ‼ עיסוק שהתחיל לפני התקופה עדיין רלוונטי אליה — סטודנט מ-01/10/2024
 * עד 30/09/2026 חופף ל-2025 ולחלק מ-2026.
 */
export function niOccupationOverlaps(o: NiOccupation, periodStart: string, periodEnd: string): boolean {
  if (!o.fromDate) return !o.toDate || o.toDate >= periodStart;
  return o.fromDate <= periodEnd && (!o.toDate || o.toDate >= periodStart);
}

/** עיסוקים שחופפים לשנה קלנדרית. */
export function niOccupationsInYear(list: readonly NiOccupation[], year: number): NiOccupation[] {
  return list.filter(o => niOccupationOverlaps(o, `${year}-01-01`, `${year}-12-31`));
}

/** «2025-06-01» ⇒ «01/06/2025». */
export function niDate(iso?: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * התקופה לתצוגה. ‼ «היום» רק כשאין תאריך סיום במקור — זה «נמשך», לא
 * תאריך שהוסק. עיסוק בלי תאריך התחלה ידוע מוצג «—».
 */
export function niOccupationPeriod(o: NiOccupation): { from: string; to: string; ongoing: boolean; unknown: boolean } {
  // ‼ בלי שום תאריך (הוזן ביד בלי תקופה) — התקופה **לא ידועה**. «עד היום»
  // כאן היה טוען שהעיסוק נמשך, בלי שום מקור שאומר זאת.
  if (!o.fromDate && !o.toDate) return { from: '', to: '', ongoing: false, unknown: true };
  return { from: niDate(o.fromDate) || '—', to: o.toDate ? niDate(o.toDate) : 'היום', ongoing: !o.toDate, unknown: false };
}

/** «2 עיסוקים» / «עיסוק אחד» — הספירה נגזרת מהרשומות עצמן. */
export function niOccupationsCountText(n: number): string {
  if (n === 0) return '';
  return n === 1 ? 'עיסוק אחד' : `${n} עיסוקים`;
}

/** מה שהעובד מחזיר לכל עיסוק (worker/src/btlFileSync.mjs · buildOccupationChains). */
export interface BtlOccupationChain {
  sourceLabel: string;
  fromDate: string;
  toDate: string | null;
  sourcePeriods: { fromDate: string; toDate: string | null }[];
}

/**
 * רצפי הפורטל ⇒ רשומות NiOccupation. ‼ שדות שהוזנו ביד על עיסוק מאותו סוג
 * (שעות, הכנסה להגדרה, מעסיק) נשמרים — הפורטל לא מחזיר אותם, ולכן אישור
 * העדכון לא אמור למחוק אותם.
 */
export function niOccupationsFromBtl(chains: readonly BtlOccupationChain[], existing: readonly NiOccupation[] = []): NiOccupation[] {
  return chains.map(c => {
    const type = niOccupationTypeFromBtl(c.sourceLabel);
    const prev = existing.find(o => (o.sourceLabel ?? '') === c.sourceLabel) ?? existing.find(o => o.type === type && !o.sourceLabel);
    return {
      ...(prev ? {
        employerName: prev.employerName, withholdingFile: prev.withholdingFile,
        weeklyHours: prev.weeklyHours, definitionIncome: prev.definitionIncome,
      } : {}),
      id: prev?.id ?? `btl-${type}-${c.fromDate}`,
      type,
      sourceLabel: c.sourceLabel,
      source: 'btl_portal' as const,
      fromDate: c.fromDate,
      ...(c.toDate ? { toDate: c.toDate } : {}),
      sourcePeriods: c.sourcePeriods.map(p => ({ fromDate: p.fromDate, toDate: p.toDate })),
    };
  }).map(o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as unknown as NiOccupation);
}

/**
 * מפתח השוואה — מה שבאמת משנה לרו"ח: שם, התחלה, סוף. ‼ לא id ולא שדות
 * ידניים: עיסוק שהוזן ביד עם אותו שם ואותן תקופות **תואם** לפורטל.
 */
export function niOccupationsKey(list: readonly NiOccupation[]): string {
  return list
    .map(o => `${niOccupationLabel(o)}|${o.fromDate ?? ''}|${o.toDate ?? ''}`)
    .sort()
    .join(' ; ');
}

/**
 * «עצמאי מ-01/06/2025 עד היום · תלמיד להשכלה גבוהה מ-01/10/2023 עד 30/09/2026».
 * ‼ «עד» ולא מקף: בשורה RTL תאריך–תאריך עם מקף מתהפך לעין.
 */
export function niOccupationPeriodText(o: NiOccupation): string {
  const p = niOccupationPeriod(o);
  return p.unknown ? '(תקופה לא ידועה)' : `${p.from} עד ${p.to}`;
}

export function niOccupationsInline(list: readonly NiOccupation[]): string {
  return niOccupationsForDisplay(list).map(o => `${niOccupationLabel(o)} ${niOccupationPeriodText(o)}`).join(' · ');
}

/**
 * סדר התצוגה: מה שנמשך קודם, אחר כך לפי תאריך הסיום (המאוחר קודם), ואז לפי
 * ההתחלה. כך השורה הראשונה היא תמיד המצב של היום.
 */
export function niOccupationsForDisplay(list: readonly NiOccupation[]): NiOccupation[] {
  return [...list].sort((a, b) => {
    if (!a.toDate !== !b.toDate) return a.toDate ? 1 : -1;
    const byEnd = (b.toDate ?? '').localeCompare(a.toDate ?? '');
    if (byEnd) return byEnd;
    return (b.fromDate ?? '').localeCompare(a.fromDate ?? '');
  });
}

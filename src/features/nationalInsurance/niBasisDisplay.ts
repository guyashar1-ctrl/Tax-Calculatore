// ─── איך מציגים בסיס דמי ביטוח — בלי שייקרא כהכנסה ───────────────────────────
// ‼ שלוש שורות, שלוש משמעויות:
//   «47,583 ₪ · 7–9/2026»         — הבסיס לתקופה, כפי שביטוח לאומי מציג.
//   «15,861 ₪ לחודש»              — אותו בסיס, לחודש. עדיין בסיס, לא הכנסה.
//   «≈ 16,500 ₪ הכנסה (2025)»     — שחזור ההכנסה המקורית, עם רמת ביטחון.
// כשיש הכנסה ישירה מרשימת ההכנסות — היא גוברת, והשחזור הוא רק בדיקת עקביות.

import type { NiInsuranceBasis } from '../../types';
import { niReverse, niCrossCheck, niDisplayRound, NI_ASSUMPTION_LABELS } from './niContribution';
import type { NiReverseResult } from './niContribution';

const ils = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/**
 * «יולי–ספטמבר 2026», «יוני 2026». ‼ שמות חודשים ולא «7–9/2026»: בשורה RTL
 * טווח מספרים עם מקף מתהפך ונקרא «9/2026–7».
 */
export function niMonthsText(fromMonth: number, toMonth: number, year: number): string {
  const a = MONTHS[fromMonth - 1] ?? String(fromMonth);
  const b = MONTHS[toMonth - 1] ?? String(toMonth);
  return fromMonth === toMonth ? `${a} ${year}` : `${a}–${b} ${year}`;
}

export function niBasisPeriodText(b: NiInsuranceBasis): string {
  return niMonthsText(b.fromMonth, b.toMonth, b.year);
}

export interface NiBasisView {
  /** «47,583 ₪ · 7–9/2026». */
  periodText: string;
  /** «15,861 ₪ לחודש». */
  monthlyText: string;
  /**
   * שחזור ההכנסה. null ⇒ לא ניתן לשחזר (הסיבה ב-`reconstructionNote`).
   * ‼ תמיד עם «≈» ועם השנה — זו הערכה של הכנסה, לא הבסיס עצמו.
   */
  reconstructionText: string | null;
  reconstructionNote: string | null;
  /** true/false כשיש ערך ישיר להשוות אליו; null כשאין. */
  matchesDirect: boolean | null;
  reconstruction: NiReverseResult | null;
}

/**
 * @param directMonthlyIncome ההכנסה הישירה מרשימת ההכנסות, כשידועה.
 * @param statusesCount כמה עיסוקים פעילים — יותר מאחד מוריד את הוודאות.
 */
export function niBasisView(b: NiInsuranceBasis, opts: { directMonthlyIncome?: number | null; statusesCount?: number } = {}): NiBasisView {
  const monthly = b.periodBasis / Math.max(1, b.months);
  const base = {
    periodText: `${ils(b.periodBasis)} · ${niBasisPeriodText(b)}`,
    monthlyText: `${ils(niDisplayRound(monthly))} לחודש`,
  };
  const r = niReverse({
    periodBasis: b.periodBasis,
    months: b.months,
    insuranceYear: b.year,
    sourceIncomeYear: b.sourceIncomeYear,
    assumeSourceYear: b.sourceIncomeYear == null,
    statusesCount: opts.statusesCount,
  });
  if (!r.ok) {
    return { ...base, reconstructionText: null, reconstructionNote: `לא ניתן לשחזר את ההכנסה: ${r.detail}`, matchesDirect: null, reconstruction: null };
  }
  const direct = opts.directMonthlyIncome;
  const matchesDirect = direct != null ? niCrossCheck(r, direct) : null;
  const notes = r.assumptions.map(a => NI_ASSUMPTION_LABELS[a]);
  return {
    ...base,
    // ‼ «הערכה» כשאין הכנסה ישירה לאמת מולה ויש הנחה בדרך — לא מציגים
    // שחזור לא-מאומת באותו טון של נתון.
    reconstructionText: `≈ ${ils(r.originalMonthlyIncome)} הכנסה (${r.sourceIncomeYear}${r.confidence === 'estimate' && direct == null ? ', הערכה' : ''})`,
    reconstructionNote: notes.length ? notes.join(' · ') : null,
    matchesDirect,
    reconstruction: r,
  };
}

// ─── איך מציגים בסיס דמי ביטוח — בלי שייקרא כהכנסה ───────────────────────────
// ‼ שלוש שורות, שלוש משמעויות, שלושה מקורות:
//   «47,583 ₪ · יולי–ספטמבר 2026» — הבסיס לתקופה. **נקרא** מביטוח לאומי.
//   «בסיס חודשי ≈ 15,861 ₪»       — אותו בסיס ÷ מספר החודשים. **חושב** ב-PIVO.
//                                    עדיין בסיס — לא הכנסה ולא תשלום.
//   «הערכת הכנסה ≈ 16,500 ₪ …»    — שחזור לאחור. **הערכה** של PIVO, על הנחות.
// ‼ (219) ביטוח לאומי אינו מציג על איזו הכנסה נשען הבסיס. שנת המקור תמיד
// מסומנת כהנחה, וההשוואה להצהרה נעשית רק מול הצהרה מאומתת מאותה שנה — ורק
// «קרוב» נאמר בתצוגה הקומפקטית; «רחוק» מוסבר ב-«?» עם הסתייגות, לא כפסק דין.

import type { NiIncomeEntry, NiInsuranceBasis } from '../../types';
import type { FieldMeta } from '../../types/clientWorkspace';
import { niReverse, niCrossCheck, niDisplayRound, niSelfEmployedYear, NI_ASSUMPTION_LABELS } from './niContribution';
import type { NiReverseResult } from './niContribution';
import { niIncomeMonthly, niIncomePeriodText, niIncomeUnit } from './niIncome';

const ils = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const num = (n: number, digits = 0) => n.toLocaleString('he-IL', { minimumFractionDigits: digits, maximumFractionDigits: digits });

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
  /** «47,583 ₪ · יולי–ספטמבר 2026». */
  periodText: string;
  /** «בסיס חודשי 15,861 ₪». */
  monthlyText: string;
  monthlyBasis: number;
  /**
   * «הערכת הכנסה ≈ 16,500 ₪ לחודש (2025)». null ⇒ לא ניתן להעריך (הסיבה
   * ב-`reconstructionNote`). ‼ תמיד «הערכה», תמיד עם השנה שהונחה.
   */
  reconstructionText: string | null;
  reconstructionNote: string | null;
  /**
   * מול הצהרה **מאומתת** מאותה שנה שהונחה: true = קרוב, false = לא קרוב.
   * null = אין מול מה להשוות באופן הוגן (אין הצהרה, שנה אחרת, לא מאומתת).
   */
  nearDeclaration: boolean | null;
  reconstruction: NiReverseResult | null;
}

export interface NiBasisContext {
  /** הצהרה חודשית — **רק** כשהיא מאומתת (niIncomeTrust). אחרת null. */
  declaration?: NiIncomeEntry | null;
  /** כמה עיסוקים פעילים — יותר מאחד מוריד את הוודאות. */
  statusesCount?: number;
}

export function niBasisView(b: NiInsuranceBasis, ctx: NiBasisContext = {}): NiBasisView {
  const monthly = b.periodBasis / Math.max(1, b.months);
  const base = {
    periodText: `${ils(b.periodBasis)} · ${niBasisPeriodText(b)}`,
    // ‼ «בסיס חודשי» ולא «X לחודש»: ליד «הכנסה מוצהרת 16,500 ₪ לחודש»,
    // «15,861 ₪ לחודש» נקרא כמו הכנסה. זה בסיס — וכך הוא נקרא.
    monthlyText: `בסיס חודשי ${ils(niDisplayRound(monthly))}`,
    monthlyBasis: monthly,
  };
  // ‼ שנת המקור **תמיד** הנחה (השנה הקודמת) — גם כשבסיס ישן נושא
  // sourceIncomeYear: הוא נגזר בעבר מ«ההכנסה שנבחרה», לא מקשר שב"ל הציג.
  const r = niReverse({
    periodBasis: b.periodBasis,
    months: b.months,
    insuranceYear: b.year,
    assumeSourceYear: true,
    statusesCount: ctx.statusesCount,
  });
  if (!r.ok) {
    return { ...base, reconstructionText: null, reconstructionNote: `לא ניתן להעריך את ההכנסה: ${r.detail}`, nearDeclaration: null, reconstruction: null };
  }
  const d = ctx.declaration;
  const nearDeclaration = d && niIncomeUnit(d) === 'monthly' && d.year === r.sourceIncomeYear
    ? niCrossCheck(r, d.amount) : null;
  const notes = r.assumptions.map(a => NI_ASSUMPTION_LABELS[a]);
  return {
    ...base,
    reconstructionText: `הערכת הכנסה ≈ ${ils(r.originalMonthlyIncome)} לחודש (${r.sourceIncomeYear})`,
    reconstructionNote: notes.length ? notes.join(' · ') : null,
    nearDeclaration,
    reconstruction: r,
  };
}

// ─── ההסבר שמאחורי ה-«?» ─────────────────────────────────────────────────────

/** שורה בהסבר: טקסט, ואופציונלית נוסחה שמוצגת משמאל לימין. */
export interface NiHelpLine { text: string; formula?: string }

export interface NiHelpSection {
  /** read = נקרא מהרשות · calc = חישוב של PIVO · estimate = הערכה של PIVO · compare = מול רשימת ההכנסות. */
  kind: 'read' | 'calc' | 'estimate' | 'compare';
  title: string;
  lines: NiHelpLine[];
}

export interface NiBasisExplainContext extends NiBasisContext {
  /** השומה האחרונה ברשימת ההכנסות, כלשונה. */
  assessment?: NiIncomeEntry | null;
  /** יש «הכנסה מוצהרת» בכרטיס, אבל היא טעונה אימות — לא מושווית. */
  declarationUnverified?: boolean;
  /** field_meta של הבסיס — מתי ואיך נשמר בכרטיס. */
  basisMeta?: FieldMeta;
}

const day = (iso?: string) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/**
 * ההסבר המלא לבסיס של הלקוח הזה — מה נקרא, מה חושב, מה הוערך ועם מה מותר
 * להשוות. ‼ רק עובדות שיש בידינו: בלי מסלול שלא תועד, בלי תאריך קריאה
 * שלא נשמר, ובלי הסבר «למה» שב"ל לא נתן.
 */
export function niBasisExplain(b: NiInsuranceBasis, ctx: NiBasisExplainContext = {}): NiHelpSection[] {
  const view = niBasisView(b, ctx);
  const sections: NiHelpSection[] = [];

  // ── נקרא מביטוח לאומי ──
  const read: NiHelpLine[] = [
    { text: `בסיס${b.category ? ` ${b.category}` : ''} לתקופה ${niBasisPeriodText(b)}: ${ils(b.periodBasis)}` },
  ];
  if (b.advanceMonthly != null) read.push({ text: `לצדו, באותה שורה: מקדמה ${ils(b.advanceMonthly)} לחודש` });
  const saved = day(ctx.basisMeta?.syncedAt);
  if (ctx.basisMeta?.source === 'automation') read.push({ text: `נשמר בכרטיס מקריאה של ביטוח לאומי${saved ? ` ב-${saved}` : ''}` });
  else if (ctx.basisMeta?.source) read.push({ text: `הוזן בכרטיס${saved ? ` ב-${saved}` : ''} — לא מקריאה אוטומטית` });
  sections.push({ kind: 'read', title: 'נקרא מביטוח לאומי', lines: read });

  // ── חישוב ──
  const calc: NiHelpLine[] = b.months > 1
    ? [{ text: 'בסיס חודשי = הבסיס לתקופה ÷ מספר החודשים בה', formula: `${num(b.periodBasis)} ÷ ${b.months} ≈ ${num(niDisplayRound(view.monthlyBasis))} ₪` }]
    : [{ text: `הבסיס הוא לחודש אחד — ${ils(b.periodBasis)}` }];
  calc.push({ text: 'זה עדיין בסיס: לא ההכנסה ולא הסכום לתשלום. התשלום הוא המקדמה.' });
  sections.push({ kind: 'calc', title: 'חישוב של PIVO', lines: calc });

  // ── הערכה ──
  const est: NiHelpLine[] = [];
  const r = view.reconstruction;
  if (r) {
    const cfg = niSelfEmployedYear(b.year);
    est.push({ text: `≈ ${ils(r.originalMonthlyIncome)} הכנסה לחודש, אם הבסיס נשען על הכנסת ${r.sourceIncomeYear}` });
    const parts = [
      `מקדם קידום מ-${r.sourceIncomeYear} ל-${b.year}: ${r.advancementFactor}`,
      cfg ? `ניכוי ${Math.round(cfg.deductibleShare * 100)}% מדמי הביטוח הלאומי (שיעורי ${b.year})` : null,
      r.assumptions.includes('deduction_unknown') ? 'בלי ניכוי נוסף' : null,
    ].filter((x): x is string => !!x);
    est.push({ text: `ההנחות: ${parts.join(' · ')}` });
    for (const a of r.assumptions) {
      if (a === 'multiple_statuses' || a === 'at_max_basis') est.push({ text: NI_ASSUMPTION_LABELS[a] });
    }
    est.push({ text: 'ודאות: הערכה. ביטוח לאומי אינו מציג על איזו הכנסה נשען הבסיס, ולכן ההערכה עשויה להיות שונה מכל הכנסה ברשימה.' });
  } else {
    est.push({ text: view.reconstructionNote ?? 'לא ניתן להעריך את ההכנסה.' });
  }
  sections.push({ kind: 'estimate', title: 'הערכה של PIVO — לא נתון של ביטוח לאומי', lines: est });

  // ── מול רשימת ההכנסות ──
  const cmp: NiHelpLine[] = [];
  const d = ctx.declaration;
  if (d) {
    const verdict = view.nearDeclaration === true ? 'ההערכה קרובה אליה'
      : view.nearDeclaration === false ? 'ההערכה אינה קרובה אליה — ייתכן שהבסיס נשען על נתון אחר'
      : 'משנה אחרת — לא הושוותה';
    cmp.push({ text: `הצהרה (${niIncomePeriodText(d)}): ${ils(d.amount)} לחודש — ${verdict}` });
  } else if (ctx.declarationUnverified) {
    cmp.push({ text: 'ההכנסה המוצהרת בכרטיס טעונה אימות — לא הושוותה.' });
  }
  const a = ctx.assessment;
  if (a) {
    const m = niIncomeMonthly(a);
    cmp.push(m
      ? { text: `שומה (${niIncomePeriodText(a)}): ${ils(a.amount)} לשנה — ממוצע מחושב`, formula: `${num(a.amount)} ÷ 12 = ${num(m.amount, 2)} ₪` }
      : { text: `שומה (${niIncomePeriodText(a)}): ${ils(a.amount)} — לא ידוע אם לשנה או לחודש, ולכן לא חושב ממוצע` });
    cmp.push({ text: `השומה היא הכנסת ${a.year} — לא בהכרח מה שעליו נשען הבסיס הנוכחי.` });
  }
  if (cmp.length === 0) cmp.push({ text: 'אין ברשימת ההכנסות שבכרטיס נתון להשוות אליו.' });
  sections.push({ kind: 'compare', title: 'מול רשימת ההכנסות', lines: cmp });

  return sections;
}

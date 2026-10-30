// ─── הערכת מס — המנוע (שלב 3) ────────────────────────────────────────────────
// ‼ טהור: בלי React ובלי supabase. אותו קלט ⇒ אותה תוצאה (בדיקות יחידה).
// ‼ חישוב המס עצמו — calculateTax הקיים (taxData.ts), לכל אדם בנפרד עם מקורות ההכנסה שלו.
//   בעל ההכנסה נשמר תמיד; תרחיש שהחישוב לא תומך בו מוצג כ«חלק חסר», והסיכום הכולל מסומן «חלקי».
// ‼ מקדמה — לכל רשות ולכל אדם: מס הכנסה = המס שנובע מהעסק (שולי) פחות ניכוי במקור מלקוחות, חלקי
//   המחזור השנתי; ב״ל = דמי הביטוח השנתיים חלקי 12. השלמה לתקופות שעברו — רכיב נפרד, רק מרשומה
//   מאושרת עם שיטה, תחולה וביסוס, ומחושבת מהתקופות והתשלומים בפועל.
// ‼ כלל שלא הוכרע לא מפיק מספר שנראה ודאי. אומדן אינו חיוב; הקטנת מקדמה אינה חיסכון במס.

import type { Client, TaxCalcInput } from '../../types';
import { calculateTax, niSelfEmployedBase, spouseAsClient } from '../../utils/taxCalculations';
import { asOfDate, clientForTaxYear, familyStatusForYear, WIDOWED_CHILDREN_NOTE } from '../../utils/familyStatusYear';
import { getTaxYearData } from '../../data/taxData';
import { gate, describeProblem, RULESET_VERSION, num, usedRule } from '../taxRules/registry';
import { microBusiness, niNonWorkIncome, niSelfEmployedQuarter, selfEmployedPension, studyFundLimit } from '../taxRules/calc';
import { niOccupationsInYear } from '../nationalInsurance/niOccupations';
import { niIncomePeriodText } from '../nationalInsurance/niIncome';
import { buildAlignment, buildCashflow } from './cashflow';
import { compareSpouses, jointTax } from './spouseCalc';
import type { SpouseComparison, SpouseSide } from './spouseCalc';
import type {
  Amount, AuthorityAdvance, Blocker, CatchUp, ChargeLine, EstimateDraft, EstimateOutputs, HouseholdIt, IncomeLine, ItAdvanceSetup,
  MicroLineResult, NiAdvanceSetup, OptimizationCheck, Person, PersonResult, SavingsResult,
} from './types';
import { isNum } from './types';

export const MONTH_HE = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const r0 = (n: number) => Math.round(n);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const period = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;

/**
 * 21.10.2026 · איפה משנים את המקדמה — רק כשיש מה לשנות (אותו סף כמו משימות ההמשך, followUps.ts).
 * מ״ה: 2216א / 2216ב (taxRules: itaForm2216b, rules.ts — עד 31.01 לשנה הבאה). ב״ל: «שינוי מקדמות» בפורטל
 * המייצגים (נצפה חי 21.10.2026: עיסוקים והכנסות ← שינוי מקדמות) או טופס 672.
 */
export function whereToChange(a: Pick<AuthorityAdvance, 'authority' | 'current' | 'recommended' | 'belowChangeThreshold'>): string | undefined {
  if (a.current == null || a.recommended == null) return undefined;
  if (a.authority === 'it') {
    if (Math.abs(a.recommended - a.current) < 0.1) return undefined;
    return a.recommended > a.current
      ? 'הגדלה — דרך המייצג (טופס 2216ב) או תשלום על חשבון'
      : 'הקטנה — טופס 2216א או דרך המייצג (2216ב), עד 31.01 של השנה הבאה';
  }
  if (a.belowChangeThreshold || Math.abs(a.recommended - a.current) < 1) return undefined;
  return 'באתר המייצגים של ב״ל: עיסוקים והכנסות ← שינוי מקדמות (או טופס 672)';
}
const PERSON_HE: Record<Person, string> = { client: 'הלקוח', spouse: 'בן/בת הזוג' };
/** מקדמה בסכום קבוע: 10 תשלומים שווים, פברואר עד נובמבר (it.advances.methods — מדריך 2025 פרק ח ס׳ 1ב; 175(א)). */
const FIXED_PAYMENTS = 10;
/** 27.10.2026 · עיגול ההמלצה כלפי מעלה: מ״ה — חצי אחוז מהמחזור / 10 ₪ לתשלום קבוע; ב״ל — 50 ₪ לחודש. */
export const ADVANCE_STEP = { itRate: 0.5, itFixed: 10, ni: 50 } as const;
const ceilTo = (v: number, step: number) => Math.round(Math.ceil(v / step - 1e-9) * step * 100) / 100;

/** מס הכנסה ליבה: הכללים שחייבים מקור ראשי (או הכרעה) כדי שהחבות תיראה כמספר. */
export const IT_CORE_RULES = ['core.creditPoint', 'core.surtaxThreshold', 'core.incomeTaxBrackets'];

/** תחזית לשורה — לחודשים שאחרי החתך, בלי אירועים חד־פעמיים. */
export function forecastFor(line: IncomeLine, draft: EstimateDraft): number | undefined {
  const rest = 12 - draft.cutoffMonth;
  if (rest <= 0) return 0;
  const side = line.chosen ? line[line.chosen] : undefined;
  if (!side) return undefined;
  if (side.method === 'none') return 0;
  if (side.method === 'manual' || side.method === 'lastYear') return side.amount;
  if (line.actualToCutoff == null) return undefined;
  const inActual = sum(draft.oneOffs.filter(o => o.lineId === line.id && o.timing === 'inActual').map(o => o.amount));
  const months = line.actualMonths ?? draft.cutoffMonth;
  if (months <= 0) return undefined;
  return ((line.actualToCutoff - inActual) / months) * rest;
}

/** שנתי לשורה = בפועל + תחזית + חד־פעמיים צפויים. undefined = חסר. */
export function annualFor(line: IncomeLine, draft: EstimateDraft): number | undefined {
  if (line.actualToCutoff == null && draft.cutoffMonth > 0) return undefined;
  const f = forecastFor(line, draft);
  if (f == null) return undefined;
  const expected = sum(draft.oneOffs.filter(o => o.lineId === line.id && o.timing === 'expected').map(o => o.amount));
  return (line.actualToCutoff ?? 0) + f + expected;
}

interface Ctx { client: Client; taxYear: number }

/** השלמה לתקופות שעברו — מרשומה מאושרת בלבד, מהתקופות והתשלומים בפועל. */
function catchUpFor(cu: CatchUp | undefined, setup: { periods?: { period: string; paid?: number; charged?: number; turnover?: number; state?: string }[]; paidToCutoff?: number },
  cutP: string, freq: number, year: number): { amount: Amount; lines?: AuthorityAdvance['catchUpLines'] } {
  if (!cu) return { amount: { why: 'אין השלמה רשומה. אם הרשות דרשה או שהוחלט להשלים — לרשום שיטה, תחולה, ביסוס ואישור' } };
  if (!cu.justification.trim() || !cu.approvedAt) return { amount: { why: 'השלמה רשומה וממתינה לביסוס ולאישור המשרד' } };
  if (cu.method === 'manualAmount') {
    return cu.amount == null ? { amount: { why: 'חסר הסכום שנקבע' } } : { amount: { value: r0(cu.amount), basis: 'officeDecision' } };
  }
  if (cu.newValue == null) return { amount: { why: 'חסר הערך החדש (שיעור או מקדמה חודשית)' } };
  const from = Number(cu.effectiveFrom.slice(5, 7)), to = Number(cutP.slice(5, 7));
  const step = cu.authority === 'it' ? freq : 1;
  const expected: string[] = [];
  // תקופה מזוהה בחודש הסיום שלה (דו־חודשי: 02, 04 … 12); נכללות רק תקופות שהסתיימו עד החתך
  for (let m = from; m <= to; m++) if (m % step === 0) expected.push(period(year, m));
  const byP = new Map((setup.periods ?? []).map(p => [p.period, p]));
  if (cu.authority === 'ni' && cu.method === 'monthlyDifference') {
    const missing = expected.filter(p => byP.get(p)?.paid == null);
    if (missing.length && !(from === 1 && setup.paidToCutoff != null)) return { amount: { why: `חסרים תשלומים לחודשים ${missing.map(p => p.slice(5)).join(', ')} — כדי לחשב השלמה שאינה מינואר` } };
    if (missing.length) {
      const due = cu.newValue * expected.length;
      return { amount: { value: r0(due - (setup.paidToCutoff ?? 0)), basis: 'officeDecision' }, lines: [{ period: `${expected[0].slice(5)}–${cutP.slice(5)}`, due: r0(due), paid: r0(setup.paidToCutoff ?? 0), diff: r0(due - (setup.paidToCutoff ?? 0)) }] };
    }
    const lines = expected.map(p => { const paid = byP.get(p)!.paid ?? 0; return { period: p, due: r0(cu.newValue!), paid: r0(paid), diff: r0(cu.newValue! - paid) }; });
    return { amount: { value: sum(lines.map(l => l.diff)), basis: 'officeDecision' }, lines };
  }
  if (cu.authority === 'it' && cu.method === 'rateOnReportedTurnover') {
    const missing = expected.filter(p => { const x = byP.get(p); return !x || x.state !== 'reported' || x.turnover == null; });
    if (missing.length) return { amount: { why: `חסרות ב-134 תקופות מדווחות עם מחזור: ${missing.map(p => p.slice(5)).join(', ')}` } };
    const lines = expected.map(p => { const x = byP.get(p)!; const due = (cu.newValue! / 100) * (x.turnover ?? 0); const paid = x.charged ?? x.paid ?? 0; return { period: p, due: r0(due), paid: r0(paid), diff: r0(due - paid) }; });
    return { amount: { value: sum(lines.map(l => l.diff)), basis: 'officeDecision' }, lines };
  }
  return { amount: { why: 'שיטת ההשלמה לא מתאימה לרשות' } };
}

export function computeEstimate(draft: EstimateDraft, ctx: Ctx, opts: { extraStudyFund?: Partial<Record<Person, number>>; extraPension?: Partial<Record<Person, number>>; noChecks?: boolean } = {}): EstimateOutputs {
  const { taxYear: year } = ctx;
  const cutoff = draft.cutoffMonth;
  const cutP = period(year, cutoff);
  const blockers: Blocker[] = [];
  const partial: Blocker[] = [];
  const limits: string[] = [];
  const openQuestions: NonNullable<EstimateOutputs['openQuestions']> = [];
  // ‼ 16.10.2026: המצב המשפחתי של שנת המס, לא של היום — לפי מועד ההכנה, כדי שגרסה שמורה תחושב מחדש אותו דבר.
  //   מכאן והלאה `client` הוא הלקוח כפי שהיה בשנה (familyStatus בלבד מוחלף). לא ידוע ⇒ המצב היום + חוסם אישור.
  const asOf = asOfDate(draft.preparedOn);
  const fam = familyStatusForYear(ctx.client, year, asOf);
  const client = clientForTaxYear(ctx.client, year, asOf);
  if (fam.certainty === 'unknown') blockers.push({ code: 'family_status_year', text: `מצב משפחתי ב-${year}: ${fam.review}` });
  else if (fam.isEventYear && fam.eventNote) {
    limits.push(fam.eventNote);
    openQuestions.push({ id: 'family-event-year', text: fam.current === 'married'
      ? `שנת הנישואין: אפשר לבחור לשנה הזו דוח משותף או דוחות נפרדים (בהצהרה לרשות המסים לפני ההגשה). ההערכה חושבה כדוח של נשואים — ההשפעה של הגשה נפרדת לא חושבה.`
      : `${fam.current === 'divorced' ? 'שנת הגירושין' : 'שנת הפטירה'}: עוד לא הוכרע איך מחשבים שנה שבה המצב המשפחתי השתנה. ההערכה חושבה לפי המצב בסוף השנה — הסכום עשוי להשתנות.` });
  } else if (fam.certainty === 'review' && fam.review) limits.push(`מצב משפחתי ב-${year}: ${fam.review}`);
  if (fam.status === 'widowed' && (client.children ?? []).length > 0) limits.push(WIDOWED_CHILDREN_NOTE);
  /** ההערכה הוכנה אחרי סוף שנת המס: הפקדה שתשולם עכשיו נספרת בשנה שבה שולמה — לא בשנה הזו. */
  const yearEnded = draft.preparedOn > `${year}-12-31`;
  // ‼ 14.10.2026 (גיא): «הכרעת משרד» אינה פותרת כלל שלא אומת — draft.decisions נשמרות להיסטוריה בלבד ואינן משנות את החישוב
  const used = new Map<string, { ruleId: string; basis: string; taxYear: number }>();
  const use = (id: string) => { const u = usedRule(id, year); used.set(id, { ruleId: id, basis: u.basis, taxYear: u.taxYear }); };

  // ── 0. עסק זעיר — לפני הכול: המסלול קובע אם צריך את רווח הספרים ──
  // ‼ 30% במקום הוצאות בפועל ובמקום 47א (87ד(א)); אין כפל: או הנורמטיבי, או הספרים — לעולם לא שניהם.
  // ‼ הזכאות נגזרת מהמחזור, מ-87ד(ג) ומהצינון; לא מסוג התיק ולא מהמעמד במע״מ.
  const micro: MicroLineResult[] = [];
  const microNoNi = new Set<Person>();
  /** שנת 87ד(ג) עם ניכוי מוגבל: האם 47א חל — שאלה פתוחה; מחושב בלעדיו, וההשפעה מוצגת בנפרד (ראו אחרי itFor). */
  const micro87dc = new Set<Person>();
  for (const l of draft.lines.filter(x => x.source === 'business' && x.track === 'micro')) {
    if (cutoff > 0 && l.turnoverToCutoff == null) { blockers.push({ code: 'missing_turnover', text: `חסר: ${l.label} — מחזור עד סוף ${MONTH_HE[cutoff]} (עסק זעיר: ההכנסה נגזרת מהמחזור)` }); continue; }
    const tCut = l.turnoverToCutoff ?? 0;
    const annualT = tCut + (cutoff < 12 ? l.turnoverForecast ?? 0 : 0);
    const r = microBusiness({ year, turnover: annualT, registeredAtYearStart: l.micro?.registeredAtYearStart, history: l.micro?.history });
    if (!r.ok || !r.value) { blockers.push({ code: 'micro_rule', text: `עסק זעיר (${l.label}): ${r.problems.map(describeProblem).join(' · ')}` }); continue; }
    ['micro.turnoverCeiling', 'micro.normativeRate', 'micro.exceededCap', 'micro.coolingYears'].forEach(use);
    const v = r.value;
    const books = annualFor(l, draft);
    const status: MicroLineResult['status'] = tCut > v.ceiling ? 'actualExceed' : annualT > v.ceiling ? 'forecastExceed' : 'within';
    const explain: string[] = [`מחזור לשנה ${nis(annualT)} (עד החתך ${nis(tCut)}${cutoff < 12 ? ` + צפוי ${nis(l.turnoverForecast ?? 0)}` : ''}) מול תקרה ${nis(v.ceiling)}`];
    let taxable: number | undefined, chosen: MicroLineResult['chosen'], alternatives: MicroLineResult['alternatives'];
    if (v.mode === 'regular') {
      taxable = annualT - v.deduction; chosen = 'normative'; microNoNi.add(l.person);
      explain.push(`${nis(annualT)} − 30% (${nis(v.deduction)}) = ${nis(taxable)} הכנסה מהעסק; הוצאות בפועל ו-47א לא נכנסים`);
    } else if (v.mode === 'exceeded87dc') {
      const norm = annualT - v.deduction;
      alternatives = { normativeCapped: norm, books };
      chosen = l.micro?.choice ?? (books != null && books < norm ? 'books' : 'normativeCapped');
      taxable = chosen === 'books' ? books : norm;
      if (chosen !== 'books') microNoNi.add(l.person);
      explain.push(`חריגה, רשום מתחילת השנה (87ד(ג)): ניכוי עד 30% מהתקרה = ${nis(v.deduction)} ⇒ ${nis(norm)}; או הוצאות בפועל לפי הספרים ⇒ ${books == null ? 'חסר רווח לפי הספרים' : nis(books)}. לא משלבים.`);
      explain.push(`נבחר: ${chosen === 'books' ? 'הוצאות בפועל' : 'ניכוי מוגבל'}${l.micro?.choice ? ' (בחירת המשרד)' : ' (הנמוך מהשניים)'}`);
      limits.push(`${l.label}: שנת חריגה — אין דיווח מקוצר; דוח שנתי מלא. אחריה — צינון לשנתיים אם ניכה בשנה הקודמת (87ה(ב))`);
      if (chosen !== 'books') micro87dc.add(l.person);
    } else {
      chosen = 'books'; taxable = books;
      explain.push(v.mode === 'blockedCooling'
        ? `צינון (87ה(ב)): ניכה 30% ב-${v.coolingBlockedBy!.deductedIn} ולא ניכה ב-${v.coolingBlockedBy!.notDeductedIn} ⇒ ב-${year} אין 30% — הספרים`
        : `חריגה בלי 87ד(ג) — הספרים (הוצאות בפועל, 47א חל)`);
      if (books == null) blockers.push({ code: 'micro_books_needed', text: `${l.label}: ${v.mode === 'blockedCooling' ? 'צינון' : 'חריגה מהתקרה'} — נדרש רווח לפי הספרים (בפועל ותחזית)` });
    }
    if (status === 'forecastExceed') limits.push(`${l.label}: עד החתך בתקרה, אבל השנה צפויה לחרוג (${nis(annualT)} מול ${nis(v.ceiling)}) — לעדכן תיאום מס, לשקול מקדמה מרצון ולהיערך לדוח מלא. מה שקובע הוא המחזור בפועל בסוף השנה`);
    for (const o of v.open) { limits.push(`${l.label}: ${o} (פתוח)`); openQuestions.push({ id: `micro-${l.id}-${openQuestions.length}`, text: `${l.label}, עסק זעיר: ${o} — שאלה מקצועית שעוד לא הוכרעה; המשרד בודק אותה לפני הדוח השנתי` }); }
    micro.push({ lineId: l.id, person: l.person, turnoverToCutoff: r0(tCut), annualTurnover: r0(annualT), ceiling: v.ceiling, status, mode: v.mode, taxable: taxable == null ? undefined : Math.round(taxable * 100) / 100, deduction: v.deduction, alternatives, chosen, open: v.open, explain });
  }
  const microOf = new Map(micro.map(m => [m.lineId, m]));
  // ‼ מסלול הדיווח של עסק זעיר קובע את הטבות ההפקדות: בדיווח מקוצר — אין ניכוי קרן השתלמות ואין ניכוי פנסיה,
  //   יש זיכוי 35% עד 5% מההכנסה החייבת (כשזו ההכנסה היחידה); בדוח מלא — 17(5א) נשמר, ו-45א/47 לא הוחרגו ב-87ד(א).
  //   מסלול שלא נבחר אינו «דוח מלא»: החישוב בלי הטבות ההפקדות, שתי החלופות מוצגות, והאישור נחסם.
  const microRegular = (p: Person) => micro.some(m => m.person === p && m.mode === 'regular');
  const reportingOf = (p: Person) => draft.lines.find(l => l.person === p && l.source === 'business' && l.track === 'micro')?.micro?.reporting;
  for (const p of ['client', 'spouse'] as Person[]) {
    if (reportingOf(p) === 'short' && micro.some(m => m.person === p && m.mode !== 'regular')) blockers.push({ code: 'micro_short_not_allowed', text: `דיווח מקוצר נבחר (${PERSON_HE[p]}), אבל בשנה הזו העסק אינו בתוך המסלול (חריגה / צינון) — חייבים דוח שנתי מלא` });
  }
  if (micro.length) limits.push('עסק זעיר — ב״ל: אין ניכוי 52% (מאומת); שהבסיס הוא 70% מהמחזור — קריאה של החוק, לא כתוב בו. לכן דמי הביטוח מחושבים רק מהשלמה מקצועית מאושרת');
  for (const p of ['client', 'spouse'] as Person[]) {
    const bl = draft.lines.filter(l => l.person === p && l.source === 'business');
    if (bl.some(l => l.track === 'micro') && bl.some(l => l.track !== 'micro')) partial.push({ code: 'micro_mixed', text: `עסק זעיר ועסק לפי ספרים אצל אותו אדם (${PERSON_HE[p]}): הסיווג נקבע לפי כל ההכנסה מעסק — לא נתמך; לחשב ביד` });
  }

  // ── 1. שלמות הנתונים ──
  for (const l of draft.lines) {
    const m = microOf.get(l.id);
    const needBooks = !m || m.chosen === 'books';
    if (needBooks && cutoff > 0 && l.actualToCutoff == null && !(l.track === 'micro' && !m)) blockers.push({ code: 'missing_actual', text: `חסר: ${l.label} — בפועל עד סוף ${MONTH_HE[cutoff]}${l.period?.actual === 'unknown' ? ' (לא ידוע מהתיק אם היה פעיל בתקופה — לברר מתי התחיל, או להזין סכום; 0 רק אם ידוע שלא היה)' : ''}` });
    // ‼ תחולה: ישות שהסתיימה לפני התחזית לא מקבלת תחזית חיובית בלי הכרעה; תאריך סיום לא ידוע — מגבלה גלויה
    // ‼ סגירה אינה בהכרח היעדר תקבולים מאוחרים: תחזית שהמשרד הזין בסכום — מותרת עם מגבלה גלויה; הקצב האוטומטי — חוסם
    if (cutoff < 12 && l.period?.forecast === 'out' && (forecastFor(l, draft) ?? 0) > 0) {
      const side = l.chosen ? l[l.chosen] : undefined;
      if (side && (side.method === 'manual' || side.method === 'lastYear')) limits.push(`${l.label}: לפי התיק הסתיים לפני ${MONTH_HE[Math.min(12, cutoff + 1)]}${l.period.span ? ` (${l.period.span})` : ''} — התחזית שהוזנה היא תקבולים מאוחרים לפי המשרד`);
      else blockers.push({ code: 'forecast_after_end', text: `${l.label}: לפי התיק הסתיים לפני ${MONTH_HE[Math.min(12, cutoff + 1)]}${l.period.span ? ` (${l.period.span})` : ''} — אין להמשיך את הקצב. להזין סכום לתקבולים מאוחרים (גם 0), או לתקן את התאריך בתיק` });
    }
    if (cutoff < 12 && l.period?.forecast === 'unknown') limits.push(`${l.label}: לא ידוע מהתיק אם ימשיך עד סוף השנה${l.period.span ? ` (${l.period.span})` : ''} — התחזית היא הנחה של המשרד`);
    if (cutoff < 12 && !l.chosen) blockers.push({ code: 'forecast_not_chosen', text: `לבחור תחזית ל${l.label}: של הלקוח או של המשרד` });
    else if (needBooks && cutoff < 12 && l.chosen && forecastFor(l, draft) == null) blockers.push({ code: 'forecast_incomplete', text: `התחזית ל${l.label} לא שלמה (חסר סכום)` });
    if (l.source === 'business' && l.track == null && /(^|\D)44(\D|$)/.test(client.incomeTaxFileType ?? '')) blockers.push({ code: 'micro_track_unknown', text: `סוג התיק 44 (עסק זעיר) — לבחור ל${l.label} מסלול לשנה: עסק זעיר או ספרים. סוג התיק לבדו אינו קובע זכאות` });
  }
  const adjKeys = new Set<string>();
  for (const a of draft.adjustments) {
    const k = `${a.lineId}|${a.bookCategory.trim()}`;
    if (adjKeys.has(k)) blockers.push({ code: 'duplicate_adjustment', text: `תיאום כפול לקטגוריה «${a.bookCategory}» — כל קטגוריה מתואמת פעם אחת` });
    adjKeys.add(k);
  }
  for (const r of draft.reconciliations) if (!r.decision) blockers.push({ code: 'reconciliation_open', text: `יישור פתוח: מחזור עד החתך לא תואם בין הספרים לרשות (${r.lineId})` });

  // ── 2. סכומים לכל אדם ומקור — בעל ההכנסה נשמר ──
  const married = client.familyStatus === 'married';
  const hasSpouseLines = draft.lines.some(l => l.person === 'spouse');
  const persons: Person[] = ['client', ...(hasSpouseLines ? ['spouse' as const] : [])];
  const tot = (p: Person, src: IncomeLine['source']) => sum(draft.lines.filter(l => l.person === p && l.source === src).map(l => (microOf.has(l.id) ? microOf.get(l.id)!.taxable : annualFor(l, draft)) ?? 0));
  const orphan = (p: Person) => sum(draft.oneOffs.filter(o => o.person === p && !o.lineId).map(o => o.amount));
  const lineAmt = (l: IncomeLine) => (microOf.has(l.id) ? microOf.get(l.id)!.taxable : annualFor(l, draft)) ?? 0;
  // ‼ ריבית מחברה שבשליטתו — במדרגות הרגילות (לא 15%/25%); שאר ההכנסה ההונית — בשיעור לפי סוגה (capCorr למטה)
  const ownCoInterest = (p: Person) => sum(draft.lines.filter(l => l.person === p && l.source === 'capital' && l.capitalKind === 'interestOwnCompany').map(lineAmt));
  const S = Object.fromEntries(persons.map(p => [p, {
    salary: tot(p, 'salary'), business: tot(p, 'business'), adj: sum(draft.adjustments.filter(a => a.person === p).map(a => a.amount)),
    rent: tot(p, 'rent'), capital: tot(p, 'capital') - ownCoInterest(p), other: tot(p, 'other') + orphan(p) + ownCoInterest(p),
  }])) as Record<Person, { salary: number; business: number; adj: number; rent: number; capital: number; other: number }>;
  if (hasSpouseLines && (!married || !client.spouse?.gender)) {
    partial.push({ code: 'spouse_card_missing', text: 'הכנסות בן/בת הזוג לא חושבו: חסרים פרטי הזיכוי של בן/בת הזוג — להשלים בתיק המס ← «זיכויים» ← עריכה' });
  }
  // ── 2א. הכנסה הונית לפי סוגה — בלי סוג אין שיעור (לא מנחשים 25%) ──
  {
    // השיעורים לפי סוג — מהמרשם, דרך השער: שיעור שלא אומת לשנה — חוסם את התרחיש הזה
    const CAP_RULE: Record<string, string> = { gains: 'cap.gain.realRate', dividend: 'cap.dividend.regularRate', dividendSubstantial: 'cap.dividend.substantialRate', interestUnlinked: 'cap.interest.unlinkedRate', interestLinked: 'cap.interest.linkedRealRate' };
    const ids = [...new Set(draft.lines.filter(x => x.source === 'capital' && x.capitalKind && CAP_RULE[x.capitalKind]).map(x => CAP_RULE[x.capitalKind!]))];
    for (const pr of gate(ids, year, {}, 'calculation').hard) if (!blockers.some(b => b.ruleId === pr.ruleId)) blockers.push({ code: 'rule_not_verified', ruleId: pr.ruleId, text: `הכנסה הונית: ${describeProblem(pr)} — הערך לשנה לא אומת במקור — לעדכן במרשם הכללים (ידע מקצועי ← עדכניות ותחזוקה), או לחשב ביד` });
  }
  for (const l of draft.lines.filter(x => x.source === 'capital' && !x.capitalKind)) blockers.push({ code: 'capital_kind_missing', text: `לסווג את «${l.label}»: רווח הון, דיבידנד (רגיל / כבעל מניות מהותי באותה חברה), ריבית לא צמודה (15%), צמודה (25%) או ריבית מחברה שבשליטתו (שולי)` });
  // ── 2ב. בני זוג: חישוב נפרד מותר רק בתנאי סעיף 66; הכנסה שאינה מיגיעה אישית — לבעל היגיעה הגבוהה ──
  const earned = (p: Person) => (S[p] ? S[p].salary + S[p].business + S[p].adj : 0);
  const bothEarn = persons.length === 2 && married && earned('client') > 0 && earned('spouse') > 0;
  if (bothEarn && !draft.spouseSource) blockers.push({ code: 'spouse_source_unknown', ruleId: 'spouse.separateEligibility', text: 'בני זוג: לסמן אם הכנסת אחד מהם תלויה במקור ההכנסה של השני (סעיף 66(ד), 1301 חלק א׳ סעיף 2). בלי זה אין בסיס לחישוב נפרד' });
  if (persons.length === 2 && married) {
    const hi: Person = earned('client') >= earned('spouse') ? 'client' : 'spouse';
    const lo: Person = hi === 'client' ? 'spouse' : 'client';
    for (const l of draft.lines.filter(x => x.person === lo && (x.source === 'rent' || x.source === 'capital') && x.capitalKind !== 'interestOwnCompany' && !x.attribution))
      blockers.push({ code: 'passive_attribution', ruleId: 'spouse.propertyIncomeAttribution', text: `«${l.label}» רשום אצל ${PERSON_HE[lo]}, שהכנסתו מיגיעה אישית נמוכה יותר. הכנסה שאינה מיגיעה אישית נזקפת לבן הזוג עם היגיעה הגבוהה (סעיף 66) — להעביר את השורה, או לסמן רכוש מלפני הנישואים / מירושה` });
  }
  // ── 2ג. בעל שליטה — מה שהמערכת לא מחשבת, גלוי ──
  const CTRL_HE: Record<string, string> = {
    withdrawals: 'משיכות / יתרת חובה בחברה (3(ט1)) — הסיווג (דיבידנד / משכורת / עסק) תלוי ברווחי החברה; טופס 1350',
    loans: 'הלוואה מהחברה בריבית נמוכה (3(ט)) — השווי הוא דיבידנד; שיעור הריבית לא נקרא',
    attribution62a: 'ייחוס הכנסה מחברה (62א) — דורש נתוני חברה וזיכוי ממס החברות (שדה 100); ב״ל כעצמאי',
    companyRent: 'שכירות שהחברה משלמת לו — חבות ב״ל לא הוכרעה',
    companyCar: 'רכב / נכס של החברה בשימושו — שווי לפי 106; אם אינו ב-106 — ביד',
  };
  for (const c of draft.controlling ?? []) for (const k of Object.keys(CTRL_HE) as (keyof typeof CTRL_HE)[])
    if ((c as Record<string, unknown>)[k]) partial.push({ code: `ctrl_${k}`, text: `בעל שליטה${c.company ? ` (${c.company})` : ''} · ${PERSON_HE[c.person]}: ${CTRL_HE[k]} — לא חושב, ביד` });

  // מסלול שכר הדירה מהכרטיס. בני זוג ששניהם בפטור — לא אומת אם תקרת הפטור משותפת או לכל אחד.
  const tracks = [...new Set((client.properties ?? []).filter(pr => pr.isRented && pr.rentalTaxTrack).map(pr => pr.rentalTaxTrack!))];
  const rentTrack = client.rentalTaxTrack ?? (tracks.length === 1 ? tracks[0] : undefined);
  const anyRent = persons.some(p => S[p].rent > 0);
  if (anyRent && tracks.length > 1 && !client.rentalTaxTrack) partial.push({ code: 'rent_track_mixed', text: 'שכר דירה לא חושב: לנכסים מסלולי מיסוי שונים, והחישוב תומך במסלול אחד — לחשב את המס על השכירות ביד' });
  else if (anyRent && !rentTrack) blockers.push({ code: 'rent_track_unknown', text: 'מסלול המיסוי של שכר הדירה לא נקבע בכרטיס (פטור / 10% / רגיל)' });
  if (rentTrack === 'exempt' && persons.length === 2 && persons.every(p => S[p].rent > 0)) partial.push({ code: 'rent_exempt_couple', text: 'שכר דירה בפטור אצל שני בני הזוג: לא אומת אם תקרת הפטור משותפת — המס על השכירות לא חושב' });
  const rentPartial = partial.some(x => x.code === 'rent_track_mixed' || x.code === 'rent_exempt_couple');

  // ── 3. הפקדות — מוגבלות לפי המרשם לפני החישוב ──
  const ageOnJan1 = (birth?: string) => { if (!birth) return undefined; const b = new Date(birth + 'T00:00:00Z'); return year - b.getUTCFullYear() - ((b.getUTCMonth() > 0 || b.getUTCDate() > 1) ? 1 : 0); };
  const deposits = (p: Person) => {
    const s = draft.savings.find(x => x.person === p);
    return { pension: (s?.pensionToCutoff ?? 0) + (s?.pensionPlanned ?? 0) + (opts.extraPension?.[p] ?? 0), study: (s?.studyFundToCutoff ?? 0) + (s?.studyFundPlanned ?? 0) + (opts.extraStudyFund?.[p] ?? 0) };
  };
  const capDeposits = (p: Person, bizTaxable: number, salary: number) => {
    const d = deposits(p);
    let study = 0, pension = 0;
    let sePension: TaxCalcInput['sePension'];
    let pensionCalc: { track: 'A' | 'B'; deduction: number; creditBase: number; extraCreditBase: number; beneficial: boolean; alternative?: { track: 'A' | 'B'; deduction: number; creditBase: number; extraCreditBase: number } } | undefined;
    if (bizTaxable > 0 && d.study > 0) {
      const sf = studyFundLimit({ year, businessIncome: bizTaxable, employerDeterminingSalary: salary, deposit: d.study });
      if (sf.ok && sf.value) study = sf.value.deducted;
      else blockers.push({ code: 'study_fund_rule', text: `קרן השתלמות: ${sf.problems.map(describeProblem).join(' · ')}` });
    }
    // ‼ 16.10.2026 (R07): גם שכיר בלי עסק שהפקיד בעצמו לקופה — ניכוי לפי 47(ב)(2) (מדריך 2025 עמ׳ 61, דוגמה 1)
    const sv = draft.savings.find(x => x.person === p);
    // ‼ R07: יש משכורת ו-045 (הפקדות העובד מ-106) חסר ⇒ חוסם, לא אפס: בלעדיו מקום ה-7% של העבודה נספר פעמיים (מס נמוך מדי)
    const employeeMissing = salary > 0 && d.pension > 0 && sv?.employeeDeposits == null;
    if (employeeMissing) {
      blockers.push({ code: `pension_employee_${p}`, text: `פנסיה (${PERSON_HE[p]}): יש משכורת — חסרות הפקדות העובד לקצבה מטופס 106 (שדה 045/086; 0 אם אין). בלעדיהן הזיכוי על ה-7% מהמשכורת עלול להיספר פעמיים — ההפקדה העצמאית לא חושבה` });
      pension = d.pension;
      sePension = { notComputed: 'חסרות הפקדות העובד מטופס 106 (045/086)' };
    }
    if ((bizTaxable > 0 || salary > 0) && d.pension > 0 && !employeeMissing) {
      const age = ageOnJan1(p === 'client' ? client.birthDate : client.spouse?.birthDate);
      if (age == null) blockers.push({ code: 'pension_age_unknown', text: `פנסיה: חסר תאריך לידה (${PERSON_HE[p]}) — התקרה תלויה בגיל 50` });
      // ‼ selfEmployedPension — אותה פונקציה במחשבון ובדוח: ניכוי 7% → זיכוי עד 5% → תוספת מעל 12%; מסלול ב׳ לעמית מוטב.
      // ‼ גיל 50 (14.10.2026): מחושב גם עם משכורת (research/pension-salary-ceilings). מחוץ לתחולה שאומתה — חוסם את התרחיש הזה בלבד.
      const run = (ageArg: number | undefined) => selfEmployedPension({ year, nonWorkIncome: Math.max(0, bizTaxable - study), businessIncome: bizTaxable, salary,
        insuredSalary: salary > 0 ? sv?.insuredSalary : 0, ownDeposits: d.pension, employeeDeposits: sv?.employeeDeposits, employerDeposits: sv?.employerDeposits,
        ageOnJan1: ageArg, forceTrackA: sv?.pensionTrack === 'A' });
      const r = run(age);
      const age50Out = !r.ok && r.problems.some(x => x.ruleId === 'pen.trackA.age50' && x.kind === 'outOfScope');
      // ‼ אי־ודאות אינה נפתרת בהכרעת משרד או בקצה שמרני (גיא, 14.10.2026): מחוץ לתחולה שאומתה — התרחיש הזה לא מחושב
      if (age50Out) blockers.push({ code: 'pension_age50', text: `פנסיה מגיל 50 (${PERSON_HE[p]}): ${r.problems.filter(x => x.ruleId === 'pen.trackA.age50').map(describeProblem).join(' · ')} — הניכוי לא מחושב בתרחיש הזה. לחשב ביד לפי מדריך 2025 סעיף 53` });
      if (r.ok && age != null && age >= 50) limits.push(`פנסיה מגיל 50 (${PERSON_HE[p]}): שיעורים מוגדלים במסלול א׳, בתוך אותן תקרות בשקלים כמו מתחת לגיל 50 (מדריך 2025 עמ׳ 60)`);
      pension = d.pension;
      if (r.ok && r.value) {
        const v = r.value;
        sePension = { deduction: v.deduction, creditBase: v.creditBase, extraCreditBase: v.extraCreditBase, explain: v.explain };
        pensionCalc = { track: v.track, deduction: v.deduction, creditBase: v.creditBase, extraCreditBase: v.extraCreditBase, beneficial: v.beneficial, alternative: v.alternative };
        r.usedRules.forEach(u => use(u.ruleId));
        if (v.alternative) limits.push(`פנסיה (${PERSON_HE[p]}): עמית מוטב — רשות המסים מחשבת במסלול ב׳ (ניכוי ${v.track === 'B' ? v.deduction : v.alternative.deduction}); במסלול א׳ — ניכוי ${v.track === 'A' ? v.deduction : v.alternative.deduction}. בחירה במסלול א׳ — סימון 233/234`);
      } else {
        const other = r.problems.filter(x => x.ruleId !== 'pen.trackA.age50' && !(x.kind === 'unknownScenario' && (x as { tag?: string }).tag === 'under50'));
        if (other.some(x => x.kind === 'unknownScenario' && x.tag === 'insuredSalary')) blockers.push({ code: `pension_insured_${p}`, text: `פנסיה (${PERSON_HE[p]}): יש משכורת — חסרה ההכנסה המבוטחת מטופס 106 (שדה 244/245), שמקטינה את תקרת ההכנסה המזכה` });
        else if (other.length) blockers.push({ code: `pension_rule_${p}`, text: `פנסיה (${PERSON_HE[p]}): ${other.map(describeProblem).join(' · ')}` });
        sePension = { notComputed: r.problems.map(describeProblem).join(' · ') };
      }
    }
    return { study, pension, sePension, pensionCalc };
  };

  // ── 4. שער הכללים ──
  const g = gate(IT_CORE_RULES, year, {}, 'calculation');
  for (const p of g.hard) {
    if (!blockers.some(b => b.ruleId === p.ruleId)) blockers.push({ code: 'rule_not_verified', ruleId: p.ruleId, text: `${describeProblem(p)} — הערך לשנה לא אומת במקור — לעדכן במרשם הכללים (ידע מקצועי ← עדכניות ותחזוקה), או לחשב ביד` });
  }
  IT_CORE_RULES.forEach(use);
  const td = getTaxYearData(year);
  if (!td) blockers.push({ code: 'no_tax_data', text: `אין נתוני מס לשנת ${year}` });

  // ניכוי 47א — calculateTax מחשב אותו מבסיס ב״ל (niSelfEmployedBase), כולל סף שנוצל במשכורת: אותו חישוב
  // כמו במחשבון הכללי. עסק זעיר (30%) — אין 47א (87ד(א)), ולכן 0.
  const niRulesKnown = niSelfEmployedQuarter({ year, quarterlyIncome: 1 }).ok;
  let niDeductionFallback = false;

  // ── 4א. המעמד בב״ל — מהעיסוקים שנקראו מב״ל או מהכרטיס; לא נגזר מהסכומים (C22, 16.10.2026) ──
  // ‼ מבחן השעות לא נראה בסכום: מי שאינו עונה להגדרה הוא «בעל הכנסה שלא מעבודה» — שיעורים אחרים. סתירה ⇒ «לבדוק מול ב״ל».
  const NI_TYPE_HE: Record<string, string> = { employee: 'שכיר', selfEmployed: 'עצמאי', nonQualifying: 'עצמאי שאינו עונה להגדרה', employeeAndSE: 'שכיר ועצמאי', passive: 'לא עובד (הכנסות פסיביות)', pensioner: 'פנסיונר' };
  const niStatusOf = (p: Person): { kind: 'se' | 'nonWork' | 'unknown'; text: string; assumed?: boolean } => {
    const occ = niOccupationsInYear((p === 'client' ? client.niOccupations : client.spouseNiOccupations) ?? [], year);
    if (occ.some(o => o.type === 'self_employed')) return { kind: 'se', text: 'עצמאי — לפי העיסוקים שנקראו מב״ל' };
    if (occ.some(o => o.type === 'self_employed_non_qualifying')) return { kind: 'nonWork', text: 'עצמאי שאינו עונה להגדרה — לפי העיסוקים שנקראו מב״ל' };
    const t = p === 'client' ? client.niType : client.spouse?.niType;
    if (t === 'selfEmployed' || t === 'employeeAndSE') return { kind: 'se', text: `${NI_TYPE_HE[t]} — לפי הכרטיס` };
    if (t === 'nonQualifying') return { kind: 'nonWork', text: `${NI_TYPE_HE[t]} — לפי הכרטיס` };
    // ‼ כרטיס שותק (אין מעמד ואין עיסוקים מב״ל) — מחושב כעצמאי, וזה כתוב; מעמד שסותר את ההכנסה מעסק — חוסם
    if (!t) return { kind: 'se', text: 'לא רשום בכרטיס — חושב כעצמאי', assumed: true };
    return { kind: 'unknown', text: `«${NI_TYPE_HE[t] ?? t}» בכרטיס` };
  };
  const niStatus = Object.fromEntries(persons.map(p => [p, niStatusOf(p)])) as Record<Person, ReturnType<typeof niStatusOf>>;
  for (const p of persons) {
    if (S[p].business + S[p].adj <= 0 || microNoNi.has(p)) continue;
    if (niStatus[p].assumed) limits.push(`ב״ל${p === 'spouse' ? ` (${PERSON_HE.spouse})` : ''}: המעמד לא רשום בכרטיס ולא נקרא מב״ל — חושב כעצמאי. מי שאינו עונה להגדרה (פחות מ-20 שעות בשבוע ופחות מ-50% מהשכר הממוצע, או 12 שעות ו-15%) משלם כבעל הכנסה שלא מעבודה — לעדכן בכרטיס`);
    if (niStatus[p].kind !== 'unknown') continue;
    blockers.push({ code: `ni_status_${p}`, text: `ב״ל${p === 'spouse' ? ` (${PERSON_HE.spouse})` : ''}: יש הכנסה מעסק, והמעמד בב״ל ${niStatus[p].text} — לבדוק מול ב״ל ולעדכן בכרטיס: «עצמאי» או «עצמאי שאינו עונה להגדרה». עד אז דמי הביטוח לא מחושבים (המעמד לא נגזר מהסכום)` });
  }

  // ── 5. מס הכנסה — לכל אדם בנפרד, עם המקורות שלו ──
  // ‼ סוג התיק במס הכנסה — לפי ההכנסות; המעמד בב״ל — לפי הכרטיס (4א). «שאינו עונה להגדרה» ⇒ ההכנסה מעסק היא הכנסה שלא מעבודה.
  const types = (salary: number, business: number, p: Person) => {
    const it = salary > 0 && business > 0 ? { incomeTaxType: 'both', niType: 'employeeAndSE' }
      : business > 0 ? { incomeTaxType: 'selfEmployed', niType: 'selfEmployed' } : salary > 0 ? { incomeTaxType: 'employee', niType: 'employee' } : {};
    return business > 0 && niStatus[p]?.kind === 'nonWork' ? { ...it, niType: 'nonQualifying' } : it;
  };
  const caps = Object.fromEntries(persons.map(p => [p, capDeposits(p, S[p].business + S[p].adj, S[p].salary)])) as Record<Person, ReturnType<typeof capDeposits>>;
  const computable = (p: Person) => !(p === 'spouse' && partial.some(x => x.code === 'spouse_card_missing'));
  /** תיקון שיעור ההכנסה ההונית: calculateTax מחשב 25% על הכול; כאן — ההפרש לפי סוג (15% / 25% / 30%). */
  const CAP_RATE: Record<string, string> = { gains: 'cap.gain.realRate', dividend: 'cap.dividend.regularRate', dividendSubstantial: 'cap.dividend.substantialRate', interestUnlinked: 'cap.interest.unlinkedRate', interestLinked: 'cap.interest.linkedRealRate' };
  const capCorr = (p: Person) => sum(draft.lines.filter(l => l.person === p && l.source === 'capital' && l.capitalKind && CAP_RATE[l.capitalKind]).map(l => {
    try { use(CAP_RATE[l.capitalKind!]); return lineAmt(l) * (num(CAP_RATE[l.capitalKind!], year) - 0.25); } catch { return 0; }
  }));
  /**
   * זיכוי ביטוח חיים (45א) — תקרה אחת עם ההפקדות לקצבה (45א(ד)): 7% מהכנסת עבודה + 5% מהכנסה אחרת; ביטוח החיים עד 5%.
   * ‼ סדר המילוי: הפנסיה (35%) קודם, ביטוח החיים (25%) ביתרה — הסדר שפרסמה רשות המסים (חטיבת שומה וביקורת, 30.5.2005;
   *   research/open-law-questions-2026-10-13.md §4). הרצפה 2,268 גוברת גם על 5% (מדריך 2025 עמ׳ 71).
   * ‼ 14.10.2026 · עמית מוטב (45א(ה)) — מחושב (research/pension-salary-ceilings §5): בלי הכנסה מבוטחת — 5% מההכנסה החייבת
   *   עד 232,800, בלי תת־תקרה לביטוח חיים; עם הכנסה מבוטחת — A (7% מהמבוטחת, ובתוכה ביטוח חיים עד 5%) + B (5% מהשאר).
   *   ‼ שאלה פתוחה אחת (4.5): האם ביטוח חיים נכנס גם ל־B. החלק שאינו שנוי במחלוקת — בחישוב; החלק השנוי (qualOpen) —
   *   מוצג בנפרד עם השפעתו, לא נבחר בשקט (גיא, 14.10.2026).
   */
  const lifeIns = (p: Person) => draft.credits?.find(c => c.person === p)?.lifeInsurance ?? 0;
  const lifeBeneficial = (p: Person) => {
    if (caps[p]?.pensionCalc) return caps[p].pensionCalc!.beneficial;
    const sv = draft.savings.find(x => x.person === p);
    return (caps[p]?.pension ?? 0) + (sv?.employeeDeposits ?? 0) + (sv?.employerDeposits ?? 0) >= num('pen.beneficial.threshold', year);
  };
  // עמית מוטב עם משכורת — צריך את ההכנסה המבוטחת (244/245); בלעדיה התקרה לא ידועה
  const lifeComputable = (p: Person) => {
    if (lifeIns(p) <= 0) return false;
    try { return !lifeBeneficial(p) || S[p].salary <= 0 || draft.savings.find(x => x.person === p)?.insuredSalary != null; } catch { return false; }
  };
  const lifeParts = (p: Person, withBusiness: boolean) => {
    const W = S[p].salary, qW = num('pen.qualifying.work', year);
    const QIw = Math.min(W, qW);
    // שכירות במסלול הרגיל היא הכנסה מזכה שאינה מעבודה (B3׳ במחקר: 5% × min(50,000, 48,000)); 10% ופטור — לא
    const nonWork = Math.max(0, (withBusiness ? S[p].business + S[p].adj - caps[p].study : 0) + S[p].other + (rentTrack === 'regular' ? S[p].rent : 0));
    // מה שהפנסיה כבר תפסה מהתקרה: בסיס הזיכוי 35% (שכיר ועצמאי, אחרי 47), בלי הזיכוי הנוסף 0.5% שיש לו תקרה משלו (45א(ו))
    const r = calcFor(p, withBusiness);
    const usedP = r ? Math.max(0, r.pensionCredit / num('pen.credit.rate', year) - (withBusiness ? caps[p]?.pensionCalc?.extraCreditBase ?? 0 : 0)) : 0;
    const L = lifeIns(p), floor = num('credit.45a.fixedCeiling', year), r5 = num('pen.credit.nonWorkRate', year);
    const withFloor = (T: number, q: number) => Math.min(usedP + L, T) < floor ? Math.min(L, Math.max(0, Math.min(usedP + L, floor) - usedP)) : q;
    if (lifeBeneficial(p)) {
      const ceil = num('pen.credit.extraCeiling', year), taxable = W + nonWork;
      const I = W > 0 ? Math.min(W, draft.savings.find(x => x.person === p)?.insuredSalary ?? 0) : 0;
      if (I <= 0) {
        const T = r5 * Math.min(taxable, ceil);
        return { T, TL: T, usedP, qual: withFloor(T, Math.min(L, Math.max(0, T - usedP))), qualOpen: 0, beneficial: true, credit: num('credit.lifeIns.rate', year) * withFloor(T, Math.min(L, Math.max(0, T - usedP))) };
      }
      const A = num('credit.45a.workRate', year) * Math.min(I, qW), TL = r5 * Math.min(I, qW);
      const B = r5 * Math.max(0, Math.min(taxable - I, ceil - Math.min(qW, I)));
      const roomA = Math.max(0, A - usedP), roomB = Math.max(0, B - Math.max(0, usedP - A));
      const qual = withFloor(A + B, Math.min(L, TL, roomA));
      const qualOpen = Math.max(0, Math.min(L, TL, roomA + roomB) - qual);
      return { T: A + B, TL, usedP, qual, qualOpen, beneficial: true, credit: num('credit.lifeIns.rate', year) * qual };
    }
    const QIo = Math.max(0, Math.min(nonWork, num('pen.qualifying.nonWork', year) - Math.min(qW, W)));
    const T = num('credit.45a.workRate', year) * QIw + r5 * QIo;
    const TL = r5 * (QIw + QIo);
    const qual = withFloor(T, Math.min(L, TL, Math.max(0, T - usedP)));
    return { T, TL, usedP, qual, qualOpen: 0, beneficial: false, credit: num('credit.lifeIns.rate', year) * qual };
  };
  const lifeCredit = (p: Person, withBusiness: boolean) => {
    if (!lifeComputable(p)) return 0;
    try {
      ['credit.lifeIns.rate', 'credit.45a.fixedCeiling', 'credit.45a.workRate', 'pen.credit.nonWorkRate', ...(lifeBeneficial(p) ? ['pen.credit.extraCeiling', 'pen.beneficial.threshold'] : [])].forEach(use);
      return lifeParts(p, withBusiness).credit;
    } catch { return 0; }
  };
  type DepMode = 'full' | 'short' | 'none';
  const hasDeposits = (p: Person) => { const d = deposits(p); return d.pension > 0 || d.study > 0; };
  const depModeOf = (p: Person): DepMode => (!microRegular(p) ? 'full' : reportingOf(p) ?? 'none');
  /** זיכוי פנסיה בדיווח מקוצר: 35% × הנמוך מההפקדה ו-5% מההכנסה החייבת מהעסק (רק כשזו ההכנסה היחידה). */
  const shortCredit = (p: Person) => Math.round(0.35 * Math.min(deposits(p).pension, 0.05 * Math.max(0, S[p].business + S[p].adj)));
  const calcFor = (p: Person, withBusiness: boolean, mode: DepMode = depModeOf(p)) => {
    if (!td || !computable(p)) return null;
    const base = p === 'client' ? client : spouseAsClient(client);
    if (!base) return null;
    const s = S[p], bz = withBusiness ? s.business + s.adj : 0;
    const nd = bz > 0 && microNoNi.has(p) ? 0 : undefined;
    if (bz > 0 && nd == null && !niRulesKnown) niDeductionFallback = true;
    const input: TaxCalcInput = {
      // ‼ השיעור על ההכנסה ההונית נקבע לפי סוג כל שורה (capCorr) — לא לפי דגל «בעל מניות מהותי» של הלקוח
      client: { ...base, ...types(s.salary, bz, p), isSubstantialShareholder: false } as Client,
      year, grossSalary: s.salary, employeePensionPct: base.employeePensionPct ?? 0,
      selfEmployedGrossIncome: bz, recognizedExpenses: 0, selfEmployedPensionAmount: withBusiness && mode === 'full' ? caps[p].pension : 0,
      sePension: withBusiness && mode === 'full' ? caps[p].sePension : undefined,
      rentalIncome: rentPartial ? 0 : s.rent, rentalExpenses: 0, rentalTaxTrack: rentTrack ?? 'regular',
      otherIncome: s.other, donationsSection46: draft.credits?.find(c => c.person === p)?.donations ?? 0, krenHashtalmutSE: withBusiness && mode === 'full' ? caps[p].study : 0,
      overrideCreditPoints: false, manualCreditPoints: 0, capitalGains: s.capital,
      niDeductionSEOverride: nd,
    };
    return calculateTax(input, td);
  };
  const itOfResult = (r: ReturnType<typeof calculateTax> | null) => (r ? r.totalTaxBurden - r.totalNI : null);
  /** מס הכנסה לאדם לפי מסלול הדיווח — כולל זיכוי הפנסיה של הדיווח המקוצר. */
  const itFor = (p: Person, withBusiness: boolean, mode: DepMode = depModeOf(p)) => {
    const v = itOfResult(calcFor(p, withBusiness, mode));
    return v == null ? null : Math.max(0, v + capCorr(p) - lifeCredit(p, withBusiness) - (mode === 'short' && withBusiness ? shortCredit(p) : 0));
  };
  // ‼ אין קצה שמרני שקט (גיא, 14.10.2026): 87ד(ג) פותח ב«על אף האמור בסעיף קטן (א)» ומתיר את «סכום הניכוי» — החוק לא אומר אם 47א
  //   חוזר למי שחדל להיות בעל עסק זעיר (micro-business-research §2.2). מחשבים בלעדיו ומציגים כמה המס יירד אם חל.
  for (const p of micro87dc) {
    const without = itFor(p, true); microNoNi.delete(p); const withNi = itFor(p, true); microNoNi.add(p);
    const gap = without != null && withNi != null ? r0(without - withNi) : null;
    limits.push(`עסק זעיר בשנת חריגה (87ד(ג)), ${PERSON_HE[p]}: האם מותר גם ניכוי ב״ל (47א) לצד הניכוי המוגבל — החוק לא קובע, ואין פרסום. חושב בלעדיו${gap != null && gap > 0 ? `; אם מותר — המס נמוך בכ-${nis(gap)}` : ''}. לבדוק בדוח השנתי`);
    openQuestions.push({ id: `micro87dc-${p}`, text: `בשנה שבה העסק חרג מתקרת עסק זעיר — עוד לא הוכרע אם מותר לנכות גם את דמי הביטוח הלאומי. הסכום חושב בלי הניכוי${gap != null && gap > 0 ? `; אם יתברר שמותר — המס נמוך בכ-${nis(gap)}` : ''}`, impact: gap != null && gap > 0 ? gap : undefined, direction: 'lower' });
  }
  for (const p of persons) {
    if (!microRegular(p)) continue;
    const otherIncome = S[p].salary + S[p].rent + S[p].capital + S[p].other > 0;
    const mode = reportingOf(p);
    if (mode === 'short' && deposits(p).pension > 0 && otherIncome) blockers.push({ code: 'micro_short_pension_other', text: `דיווח מקוצר עם הכנסה נוספת (${PERSON_HE[p]}): זיכוי הפנסיה אומת רק כשהעסק הזעיר הוא ההכנסה היחידה — לחשב ביד או לבחור דוח מלא` });
    if (mode === 'short') limits.push(`דיווח מקוצר (${PERSON_HE[p]}): לפי קביעת המשרד שמתקיימים תנאי הפטור (תיק 44, תיאום במהלך השנה, תקנות 2 ו-3 כולל בן/בת הזוג). אין ניכוי קרן השתלמות; פנסיה — זיכוי 35% עד 5% מההכנסה החייבת`);
    if (mode === 'full') limits.push(`דוח מלא עם 30% (${PERSON_HE[p]}): קרן השתלמות לפי 17(5א); פנסיה לפי 45א/47 — 87ד(א) אינו מחריג אותם (לשון החוק)`);
    const alt = hasDeposits(p) ? { short: itFor(p, true, 'short') ?? undefined, full: itFor(p, true, 'full') ?? undefined, withoutDeposits: itFor(p, true, 'none') ?? undefined } : {};
    if (!mode && hasDeposits(p)) blockers.push({ code: 'micro_reporting_unknown', text: `עסק זעיר (${PERSON_HE[p]}): לבחור מסלול דיווח — מקוצר או דוח מלא. ההפקדות לפנסיה ולקרן השתלמות מטופלות אחרת בכל אחד; עד הבחירה החישוב בלי הטבות ההפקדות` });
    for (const m of micro.filter(x => x.person === p && x.mode === 'regular')) {
      m.reporting = { chosen: mode, ...Object.fromEntries(Object.entries(alt).map(([k, v]) => [k, v == null ? undefined : r0(v)])),
        note: !hasDeposits(p) ? 'אין הפקדות — מסלול הדיווח לא משנה את המס כאן (רק את הטפסים והמועדים)'
          : mode ? `נבחר: ${mode === 'short' ? 'דיווח מקוצר' : 'דוח מלא'}` : 'מסלול הדיווח לא נבחר — החישוב בלי הטבות ההפקדות; אחרי הבחירה המס יירד' };
    }
  }

  // ── 6. ב״ל לעצמאי — מהמרשם (הנוסחה הרבעונית) ──
  // עסק זעיר: אין 47א, ולכן אין את הנוסחה שמקטינה את הבסיס — הבסיס הוא ההכנסה אחרי 30% (פרשנות; מסומן במגבלות)
  const niMicro = (income: number): Amount => {
    try {
      if (income / 12 > num('ni.se.maxIncome', year)) return { why: 'ההכנסה מעל תקרת ההכנסה החייבת — לא מחושב כאן', ruleId: 'ni.se.maxIncome' };
      const th = num('ni.se.reducedThreshold', year) * 12;
      const a = Math.min(income, th), b = Math.max(0, income - th);
      return { value: r0(a * (num('ni.se.lowRateNi', year) + num('ni.se.lowRateHealth', year)) + b * (num('ni.se.highRateNi', year) + num('ni.se.highRateHealth', year))), basis: 'computed' };
    } catch { return { why: `אין במרשם שיעורי ב״ל לשנת ${year}` }; }
  };
  const niFor = (annualBusiness: number, p?: Person): Amount => {
    if (p && microNoNi.has(p) && annualBusiness > 0) {
      // ‼ לא «פרשנות בהערה» — אין מספר בלי הכרעה מאושרת (סכום או שיטה, מקור ואישור)
      const ov = (draft.niOverrides ?? []).find(o => o.person === p && o.approvedAt && o.justification.trim());
      if (!ov) {
        if (!blockers.some(b => b.code === 'micro_ni_unverified' && b.text.includes(PERSON_HE[p]))) blockers.push({ code: 'micro_ni_unverified', ruleId: 'micro.niBase', text: `דמי ב״ל לעסק זעיר (${PERSON_HE[p]}) לא מחושבים: הבסיס לא אומת. להשלים — סכום משומת/מקדמות ב״ל, או החלה מפורשת של 70% מהמחזור — עם מקור ואישור` });
        return { why: 'עסק זעיר: בסיס ב״ל לא אומת — נדרשת השלמה מקצועית מאושרת', ruleId: 'micro.niBase' };
      }
      if (ov.method === 'manualAmount') return ov.amount == null ? { why: 'חסר הסכום בהשלמה' } : { value: r0(ov.amount), basis: 'officeDecision' };
      const v = niMicro(annualBusiness);
      return 'value' in v ? { value: v.value, basis: 'officeDecision' } : v;
    }
    if (annualBusiness <= 0) return { value: 0, basis: 'computed' };
    if (p && niStatus[p]?.kind === 'unknown') return { why: `המעמד בב״ל ${niStatus[p].text} — לבדוק מול ב״ל ולעדכן בכרטיס (עצמאי / עצמאי שאינו עונה להגדרה)` };
    if (p && niStatus[p]?.kind === 'nonWork') return { value: 0, basis: 'computed' }; // ההכנסה מעסק נספרת כהכנסה שלא מעבודה (niNonWorkFor)
    const q = niSelfEmployedQuarter({ year, quarterlyIncome: annualBusiness / 4 });
    if (!q.ok || !q.value) return { why: q.problems.map(describeProblem).join(' · ') || 'לא מחושב' };
    // אותה נוסחה כמו במחשבון הכללי: הסף המופחת והתקרה משותפים עם המשכורת (המשכורת קודם)
    const salary = p ? S[p].salary : 0;
    const maxA = num('ni.se.maxIncome', year) * 12, th = num('ni.se.reducedThreshold', year) * 12;
    const used = Math.min(salary, maxA), lowAvail = Math.max(0, th - Math.min(used, th));
    const t1 = num('ni.se.lowRateNi', year), t2 = num('ni.se.highRateNi', year);
    const base = Math.min(niSelfEmployedBase(annualBusiness, lowAvail, t1, t2, num('ni.se.deductionShare', year)), Math.max(0, maxA - used));
    if (base / 12 < num('ni.se.minIncome', year) && salary === 0) return { why: 'ההכנסה מתחת להכנסה המזערית לעצמאי — דמי ביטוח מינימליים, לא מחושב כאן', ruleId: 'ni.se.minIncome' };
    const a = Math.min(base, lowAvail), b = Math.max(0, base - lowAvail);
    const ni = a * t1 + b * t2, health = a * num('ni.se.lowRateHealth', year) + b * num('ni.se.highRateHealth', year);
    if (p) niParts[p] = { ...niParts[p], seNi: ni, seHealth: health, seBase: base };
    return { value: r0(ni + health), basis: 'computed' };
  };
  /** ‼ סעיף 345: ההכנסה לב״ל מעסק — אחרי הניכוי לקופת גמל שקבע מס הכנסה (47(ב)(1)); הקרן להשתלמות אינה מופחתת. */
  const niPensionCut = (p: Person) => {
    const pc = depModeOf(p) === 'full' ? caps[p]?.pensionCalc : undefined;
    return pc ? Math.min(pc.deduction, Math.max(0, S[p].business + S[p].adj)) : 0;
  };
  const niParts: Partial<Record<Person, { seNi?: number; seHealth?: number; seBase?: number; nwNi?: number; nwHealth?: number; nwChargeable?: number; nwIncome?: number }>> = {};
  /**
   * ב״ל על הכנסה שלא מעבודה — שכ״ד חייב (059: מסלול רגיל או פטור חלקי) ועסק של «עצמאי שאינו עונה להגדרה».
   * החלק הפטור ומסלול 10% — פטורים (350(א)(7)). אותה פונקציה כמו במחשבון (niNonWorkIncome).
   */
  const niNonWorkFor = (p: Person, rentChargeable: number): Amount | undefined => {
    const bizNw = niStatus[p]?.kind === 'nonWork' && !microNoNi.has(p) ? Math.max(0, S[p].business + S[p].adj - niPensionCut(p)) : 0;
    const income = Math.max(0, rentChargeable) + bizNw;
    if (income <= 0) return undefined;
    const cardType = p === 'client' ? client.niType : client.spouse?.niType;
    if (cardType === 'pensioner') return { why: 'מקבל פנסיה / קצבת אזרח ותיק — דמי הביטוח על הכנסה שלא מעבודה לא מחושבים כאן (351(ב))' };
    try {
      ['ni.nonWork.exemptMonthly', 'ni.nonWork.lowRateNi', 'ni.nonWork.highRateNi', 'ni.nonWork.healthRate'].forEach(use);
      const maxA = num('ni.se.maxIncome', year) * 12, th = num('ni.se.reducedThreshold', year) * 12;
      const usedWork = Math.min(S[p].salary, maxA) + (niParts[p]?.seBase ?? 0);
      const args = { income, exempt: num('ni.nonWork.exemptMonthly', year) * 12, lowAvail: Math.max(0, th - Math.min(usedWork, th)), maxAvail: Math.max(0, maxA - usedWork),
        lowNi: num('ni.nonWork.lowRateNi', year), highNi: num('ni.nonWork.highRateNi', year), health: num('ni.nonWork.healthRate', year), share: num('ni.se.deductionShare', year) };
      const nw = niNonWorkIncome(args);
      niParts[p] = { ...niParts[p], nwNi: nw.ni, nwHealth: nw.health, nwChargeable: nw.chargeable, nwIncome: income };
      if (bizNw > 0 && S[p].salary <= 0 && nw.ni + nw.health < 266 * 12) limits.push(`ב״ל${p === 'spouse' ? ` (${PERSON_HE.spouse})` : ''}: מי שאינו עובד משלם לפחות 266 ₪ לחודש (ni.nonWork.minimumMonthly; למעט אישה נשואה שאינה עובדת מחוץ למשק הבית) — החישוב (${nis(nw.ni + nw.health)} לשנה) נמוך מהמינימום; לבדוק מול ב״ל`);
      // ‼ דף ב״ל למי שאין לו הכנסת עבודה מציג חישוב «משוער» בלי הפחתת 345; דף העצמאי עם הכנסה שלא מעבודה — עם. לא מכריעים בשקט.
      if (S[p].salary <= 0 && niStatus[p]?.kind !== 'se') {
        const no345 = niNonWorkIncome({ ...args, share: 0 });
        const gap = r0(no345.ni + no345.health - nw.ni - nw.health);
        if (gap >= 1) openQuestions.push({ id: `ni345-${p}`, text: `ביטוח לאומי${p === 'spouse' ? ` (${PERSON_HE.spouse})` : ''} על הכנסה שלא מעבודה: חושב בהפחתת 52% מדמי הביטוח (סעיף 345), כמו בדף ב״ל לעצמאי עם הכנסה שלא מעבודה. בדף ב״ל למי שאינו עובד הדוגמה בלי ההפחתה — אם כך יחושב, דמי הביטוח גבוהים בכ-${nis(gap)} לשנה`, impact: gap, direction: 'higher' });
      }
      return { value: r0(nw.ni + nw.health), basis: 'computed' };
    } catch { return { why: `אין במרשם שיעורי ב״ל להכנסה שלא מעבודה לשנת ${year}` }; }
  };
  ['ni.se.lowRateNi', 'ni.se.highRateNi', 'ni.se.lowRateHealth', 'ni.se.highRateHealth', 'ni.se.reducedThreshold', 'ni.se.deductionShare'].forEach(id => { try { use(id); } catch { /* */ } });

  const withheld = (p: Person, src: IncomeLine['source'][]) => sum(draft.lines.filter(l => l.person === p && src.includes(l.source))
    .map(l => (l.withheldToCutoff ?? 0) + (cutoff < 12 ? (l.withheldForecast ?? 0) : 0)));

  const full = Object.fromEntries(persons.map(p => [p, calcFor(p, true)])) as Record<Person, ReturnType<typeof calculateTax> | null>;
  // ב״ל לכל אדם — פעם אחת: עסק (עצמאי) + הכנסה שלא מעבודה, עם הפירוק ללאומי ולבריאות
  const niOf = Object.fromEntries(persons.map(p => {
    const se = niFor(S[p].business + S[p].adj - (microNoNi.has(p) ? 0 : niPensionCut(p)), p);
    const nw = niNonWorkFor(p, rentPartial ? 0 : full[p]?.taxableRental ?? 0);
    const total: Amount = !isNum(se) ? se : nw && !isNum(nw) ? nw : { value: r0(se.value + (nw && isNum(nw) ? nw.value : 0)), basis: se.basis };
    const pt = niParts[p];
    const split = isNum(total) && pt && (pt.seNi != null || pt.nwNi != null) ? { ni: r0((pt.seNi ?? 0) + (pt.nwNi ?? 0)), health: r0((pt.seHealth ?? 0) + (pt.nwHealth ?? 0)) } : undefined;
    return [p, { se, nw, total, split }];
  })) as Record<Person, { se: Amount; nw?: Amount; total: Amount; split?: { ni: number; health: number } }>;
  const personResults: PersonResult[] = persons.map(p => {
    const r = full[p];
    return {
      person: p, salary: r0(S[p].salary), businessBooks: r0(S[p].business), adjustments: r0(S[p].adj), businessTaxable: r0(S[p].business + S[p].adj),
      rent: r0(S[p].rent), capital: r0(S[p].capital), other: r0(S[p].other),
      incomeTax: r ? r0(itFor(p, true) ?? 0) : 0, creditPoints: r?.totalCreditPoints ?? 0, creditLines: r ? r.creditPointLines.filter(l => l.points).map(l => ({ description: l.description, points: l.points })) : undefined, surtax: r0((r?.surtax ?? 0) + (r?.surtaxCapitalExtra ?? 0)),
      salaryWithheld: r0(withheld(p, ['salary', 'capital', 'business'])), niSelfEmployed: niOf[p].se, niNonWork: niOf[p].nw, niSplit: niOf[p].split, niStatus: niStatus[p]?.text,
      pension: caps[p]?.pensionCalc,
      breakdown: r ? { taxable: r0(r.taxableIncome), deductions: r0(r.totalDeductions), niDeduction: r0(r.niDeductionFromIncomeTax), creditPointsValue: r0(r.totalCreditValue), donationCredit: r0(r.donationCredit),
        pensionCredit: r0(r.pensionCredit), lifeCredit: r0(lifeCredit(p, true)), surtax: r0(r.surtax + r.surtaxCapitalExtra), capitalTax: r0((r.capitalGainsTax ?? 0) + (r.dividendInterestTax ?? 0) + capCorr(p)), lines: r.deductionBreakdown } : undefined,
      notComputed: !computable(p) ? 'אין בכרטיס פרטי בן/בת הזוג — המס שלו/ה לא חושב' : !r ? 'אין חישוב מס לשנה הזו' : undefined,
    };
  });

  // ── 5א. בני זוג: נפרד מול מאוחד — במספרים (spouseCalc.ts). ‼ בלי שני המספרים אין «נבדק» ──
  const sideOf = (p: Person, withBusiness = true): SpouseSide | null => {
    const r = calcFor(p, withBusiness), it = itFor(p, withBusiness);
    if (!r || it == null) return null;
    const s = S[p], mode = depModeOf(p);
    return {
      person: p, taxable: r.taxableIncome, exertion: s.salary + (withBusiness ? s.business + s.adj : 0),
      pointsValue: r.totalCreditValue, childPointsValue: sum(r.creditPointLines.filter(l => l.legalBasis.includes('66(ג)')).map(l => l.valueNIS)),
      credits: r.donationCredit + r.settlementCredit + r.pensionCredit + lifeCredit(p, withBusiness) + (mode === 'short' && withBusiness ? shortCredit(p) : 0),
      separateTaxes: r.totalTaxBurden - r.totalNI - r.incomeTax - r.surtax - r.surtaxCapitalExtra + capCorr(p),
      surtaxBase: r.taxableIncome + s.capital, capitalSource: s.capital + (rentTrack === 'regular' ? s.rent : 0), itSeparate: it,
    };
  };
  let spouseCmp: SpouseComparison | undefined;
  let spouseJoint: { registered: Person; withChildren: boolean; p38: number } | undefined;
  if (bothEarn && draft.spouseSource && computable('spouse') && td) {
    const sc = sideOf('client'), ss = sideOf('spouse');
    if (sc && ss) {
      const owner = (client.taxFiles ?? []).find(f => f.authority === 'income_tax')?.owner;
      // ‼ רק ערך שאושר מול שע״ם (registeredSpouseVerified) — אחרת מחשבים לשני הכיוונים (64ב: הרשום הוא עובדה ברשות, לא שאלה משפטית)
      const registered = client.registeredSpouseVerified && (owner === 'client' || owner === 'spouse') ? owner : undefined;
      const hasChildren = (client.children ?? []).some(c => { const by = c.birthYear || Number(String(c.birthDate ?? '').slice(0, 4)); return !!by && year - by >= 0 && year - by < 18; });
      let p38: number | undefined;
      try { const id = hasChildren ? 'spouse.workingSpousePoints.withChildren' : 'spouse.workingSpousePoints.noChildren'; use(id); p38 = num(id, year); } catch { /* בלי ערך במרשם — אין מאוחד */ }
      if (p38 != null) {
        spouseCmp = compareSpouses({ client: sc, spouse: ss }, { separateAllowed: draft.spouseSource !== 'dependentNotMet', registered, hasChildren, p38, cpValue: td.creditPointValue, td });
        ['spouse.jointDefault', 'spouse.separateEligibility', 'spouse.fiveTimesExclusion'].forEach(id => { try { use(id); } catch { /* */ } });
        // ‼ אין «הכרעת משרד» או קצה שמרני לשאלה מקצועית (גיא, 14.10.2026) — טווח שמשנה את התוצאה חוסם את התרחיש הזה בלבד
        // סיכון יחיד שנשאר (research/joint-child-points): טענה שהרשום זכאי לטור הילדים שלו גם בשומה מאוחדת — אין מקור; כל מסמכי הרשות סותרים
        if (spouseCmp.applies === 'joint' && hasChildren) limits.push('במאוחד לא ניתנות נקודות ילדים לאף אחד מבני הזוג (66(ג); מדריך 2025; הו״ב 3/2015). טענה הפוכה לטור של הרשום — בלי מקור; לא בחישוב');
        if (spouseCmp.applies === 'joint' && spouseCmp.household != null) {
          const sc0 = spouseCmp.joint.scenarios.find(x => x.tax === spouseCmp!.household) ?? spouseCmp.joint.scenarios[0];
          spouseJoint = { registered: sc0.registered, withChildren: sc0.withChildren, p38: p38! };
        }
        if (spouseCmp.household == null) blockers.push({ code: 'spouse_calc_open',
          text: `בני זוג: ${spouseCmp.applies === 'undecided' ? `לא הוכרע אם חל חישוב נפרד (${nis(spouseCmp.separate ?? 0)}) או מאוחד (${nis(spouseCmp.joint.low)} עד ${nis(spouseCmp.joint.high)})` : `חל חישוב מאוחד, והסכום ${nis(spouseCmp.joint.low)} עד ${nis(spouseCmp.joint.high)}`} — ${spouseCmp.openBecause.join('; ')}. לאשר מי הרשום בשלב «הפרטים הוזנו בשע״ם» בתיק המס` });
      }
    }
  }
  /** מס הכנסה שנובע מהעסק לאדם — לפי החישוב שיחול (במאוחד: המאוחד עם העסק פחות המאוחד בלעדיו). */
  const businessTaxOf = (p: Person): { withB: number | null; withoutB: number | null } => {
    if (spouseJoint && td) {
      const o: Person = p === 'client' ? 'spouse' : 'client';
      const mine = sideOf(p, false), other = sideOf(o, true), mineB = sideOf(p, true);
      if (mine && other && mineB) {
        const { p38 } = spouseJoint;
        const j = (a: SpouseSide, b: SpouseSide) => { const R = a.person === spouseJoint!.registered ? a : b, Sx = R === a ? b : a; return jointTax(R, Sx, { withChildren: spouseJoint!.withChildren, p38, cpValue: td.creditPointValue, td }).tax; };
        return { withB: j(mineB, other), withoutB: j(mine, other) };
      }
    }
    return { withB: itFor(p, true), withoutB: itFor(p, false) };
  };

  if (niDeductionFallback) limits.push(`ניכוי ב״ל (47א) לשנת ${year}: אין במרשם שיעורי ב״ל — חושב משיעורי ב״ל שבנתוני המחשבון, שלא אומתו במרשם לשנה זו`);

  // ── 7. מקדמות — לכל רשות ולכל אדם עם עסק ──
  const advances: AuthorityAdvance[] = [];
  const catchUps = draft.catchUps ?? [];
  for (const p of persons) {
    const bizLines = draft.lines.filter(l => l.person === p && l.source === 'business');
    if (!bizLines.length || !computable(p)) continue;
    const it: ItAdvanceSetup | undefined = p === 'client' ? draft.it : draft.itSpouse;
    const ni: NiAdvanceSetup | undefined = p === 'client' ? draft.ni : draft.niSpouse;
    const who = p === 'spouse' ? ` (${PERSON_HE.spouse})` : '';
    // מס הכנסה
    // עסק זעיר בתקרה: לא מחויב אוטומטית במקדמות (87ו — שיקול דעת); מקדמה מרצון היא המלצה, לא חוסם
    const microOnly = bizLines.every(l => microOf.get(l.id)?.mode === 'regular');
    if (!microOnly && (!it || !it.readOn || it.via === 'client')) blockers.push({ code: 'it_not_read', text: it?.via === 'client' ? `מקדמות מס הכנסה${who}: הנתון מהלקוח — לבדוק מול 134 ולרשום תאריך בדיקה` : `קריאת 134${who} לא נרשמה (מתי נבדק, שיטה ותשלומים)` });
    if (!microOnly && it && it.method === 'unknown') blockers.push({ code: 'it_method_unknown', text: `שיטת המקדמה במס הכנסה${who} לא ידועה — לקרוא מ-134 (שיעור או סכום קבוע)` });
    if (cutoff < 12 && bizLines.some(l => l.turnoverForecast == null)) blockers.push({ code: 'turnover_forecast_missing', text: `חסר מחזור צפוי לשאר השנה${who} — בסיס למקדמה לפי מחזור` });
    const freq = it?.frequency || 1;
    const turnoverToCutoff = sum(bizLines.map(l => l.turnoverToCutoff ?? 0));
    const remainingTurnover = cutoff >= 12 ? 0 : sum(bizLines.map(l => l.turnoverForecast ?? 0));
    const annualTurnover = turnoverToCutoff + remainingTurnover;
    const custWithheld = withheld(p, ['business']);
    const { withB, withoutB } = businessTaxOf(p);
    const businessTax = withB != null && withoutB != null ? Math.max(0, withB - withoutB) : null;
    const itDue = businessTax != null ? Math.max(0, businessTax - custWithheld) : null;
    const covered = new Set((it?.periods ?? []).filter(x => x.paid != null).map(x => x.period));
    const dup = draft.payments.filter(x => x.authority === 'it' && x.person === p && covered.has(x.period));
    if (dup.length) limits.push(`${dup.length} תשלומי מס הכנסה${who} כבר כלולים בקריאת 134 לאותן תקופות — נספרו פעם אחת`);
    const readPaid = (past: boolean) => sum((it?.periods ?? []).filter(x => x.paid != null && (past ? x.period <= cutP : x.period > cutP)).map(x => x.paid!));
    const extraPaid = (past: boolean) => sum(draft.payments.filter(x => x.authority === 'it' && x.person === p && !covered.has(x.period) && (past ? x.period <= cutP : x.period > cutP)).map(x => x.amount));
    const paidPast = readPaid(true) + extraPaid(true), paidFuture = readPaid(false) + extraPaid(false);
    const method = it?.method ?? 'unknown';
    const remaining = new Set<string>();
    // ‼ 16.10.2026 (R10): מקדמה בסכום קבוע — 10 תשלומים שווים, 15 בפברואר עד 15 בנובמבר (it.advances.methods; 175(א)).
    //   התקופה כאן = חודש התשלום. לפי מחזור — תקופות שמסתיימות אחרי החתך (דו־חודשי: חודש סיום זוגי).
    if (method === 'fixed') { for (let m = Math.max(2, cutoff + 1); m <= 11; m++) remaining.add(period(year, m)); }
    else for (let m = cutoff + 1; m <= 12; m++) if (m % freq === 0) remaining.add(period(year, m));
    const unpaid = [...remaining].filter(x => !covered.has(x) && !draft.payments.some(y => y.authority === 'it' && y.person === p && y.period === x));
    const share = remaining.size ? unpaid.length / remaining.size : 0;
    const turnoverForFuture = remainingTurnover * share;
    const current = method === 'turnoverRate' ? it?.ratePct : method === 'fixed' ? it?.fixedPerPeriod : undefined;
    // ‼ 27.10.2026 · גיא: ההמלצה היא מינימום, מעוגלת כלפי מעלה (ADVANCE_STEP) — כדי שהשנה תיסגר בלי חוב ושיהיה מספר שהפורטל מקבל
    const recommended = itDue == null ? undefined
      : method === 'turnoverRate' ? (annualTurnover > 0 ? ceilTo((itDue / annualTurnover) * 100, ADVANCE_STEP.itRate) : undefined)
      : method === 'fixed' ? ceilTo(itDue / FIXED_PAYMENTS, ADVANCE_STEP.itFixed) : undefined;
    const futureOf = (v?: number) => v == null ? 0 : method === 'turnoverRate' ? (v / 100) * turnoverForFuture : method === 'fixed' ? v * unpaid.length : 0;
    const fCur = futureOf(current), fRec = futureOf(recommended);
    const per = unpaid.length ? turnoverForFuture / unpaid.length : 0;
    const cu = catchUpFor(catchUps.find(c => c.authority === 'it' && c.person === p), it ?? { periods: [] }, cutP, freq, year);
    const explain: string[] = [];
    if (withB != null && withoutB != null) {
      explain.push(`מס${who} עם העסק ${nis(withB)} − בלי העסק ${nis(withoutB)} = מס שנובע מהעסק ${nis(businessTax!)}`);
      if (custWithheld) explain.push(`פחות ניכוי במקור מלקוחות ${nis(custWithheld)} = ${nis(itDue!)} לכיסוי במקדמות`);
      if (method === 'turnoverRate' && annualTurnover > 0) explain.push(`${nis(itDue!)} ÷ מחזור שנתי ${nis(annualTurnover)} (עד החתך ${nis(turnoverToCutoff)} + צפוי ${nis(remainingTurnover)}) = ${recommended}% מהמחזור (מעוגל כלפי מעלה לחצי אחוז — מינימום)`);
      if (method === 'fixed') explain.push(`${nis(itDue!)} ÷ ${FIXED_PAYMENTS} תשלומים (15 בפברואר עד 15 בנובמבר) = ${nis(recommended ?? 0)} לתשלום`);
      explain.push(`שולם עד החתך ${nis(paidPast)}${paidFuture ? ` ומראש ${nis(paidFuture)}` : ''}; בשיעור המומלץ מהתקופה הבאה — עוד ${nis(fRec)}. מה שחסר בגלל החודשים שעברו — השלמה נפרדת או בדוח השנתי`);
      if (microOnly && (method === 'none' || method === 'unknown')) explain.push(`עסק זעיר: אין חיוב אוטומטי במקדמות (87ו). כדי לא להגיע לחוב — מקדמה מרצון של כ-${nis(Math.max(0, itDue! - paidPast - paidFuture))} עד סוף השנה, או תיאום מס מעודכן`);
    }
    // ‼ 14.10.2026 · הגדלה באמצע שנה במס הכנסה — ארבע שורות (research/advances-topup-charges §ב, §ד.3)
    const itCharges: ChargeLine[] = [];
    if (current != null && recommended != null && recommended > current) {
      const past = (it?.periods ?? []).filter(x => x.period <= cutP);
      const diff = method === 'turnoverRate' ? sum(past.map(x => (x.turnover ?? 0) * (recommended - current) / 100)) : method === 'fixed' ? (recommended - current) * past.length : 0;
      itCharges.push(
        { kind: 'difference', status: past.some(x => x.turnover != null) || method === 'fixed' ? 'computed' : 'explain', amount: r0(diff),
          text: `השלמה מרצון לתקופות שעברו: ${nis(diff)} (${method === 'turnoverRate' ? 'הפרש השיעור × המחזור שדווח' : 'הפרש הסכום × התקופות'}) — תשלום על חשבון שנת ${year}, לא דרישה של הרשות. הגדלה בידי פקיד השומה (180(ב)): האם תישלח דרישה לחודשים שעברו — לא פורסם; לבדוק במכתב וב-134` },
        { kind: 'linkage', status: 'computed', amount: 0, text: 'הצמדה: אין בתוך השנה. על יתרה אחרי 31.12 — הפרשי הצמדה מסוף השנה (187); תשלום עד 31.1 — פטור מלא, בפברואר — חצי, במרץ — רבע (187א)' },
        { kind: 'interest', status: 'computed', amount: 0, text: 'ריבית 4%: אין בתוך השנה; מסוף השנה על יתרה שלא שולמה (187), באותה הקלה של 187א. השלמה עכשיו לא חוסכת לעומת תשלום עד 31.1 — אלא אם הוקטנה מקדמה השנה (190(א)(2)) או שהעסק לא דווח (190(א)(4))' },
        { kind: 'fine', status: 'computed', amount: 0, text: 'קנס: אין על השלמה מרצון. קנס 190(א)(1) — רק על מקדמה שנדרשה ולא שולמה יותר מ-7 ימים. קנס הפיגורים 0.2% לשבוע אינו חל על מקדמות' },
      );
      ['it.advances.latePayment', 'it.advances.yearEndBalance'].forEach(id => { try { use(id); } catch { /* */ } });
    }
    advances.push({
      authority: 'it', person: p, method, current, recommended, unit: method === 'fixed' ? '₪ לתקופה' : '%', changeCharges: itCharges.length ? itCharges : undefined,
      annualDue: itDue == null ? { why: 'אין חישוב מס (כללי ליבה או נתונים חסרים)' } : { value: r0(itDue), basis: 'computed' },
      paidPast: r0(paidPast), paidFuture: r0(paidFuture), futureAtCurrent: r0(fCur), futureAtRecommended: r0(fRec),
      balanceAtCurrent: itDue == null ? { why: 'אין חישוב' } : { value: r0(itDue - paidPast - paidFuture - fCur), basis: 'computed' },
      balanceAtRecommended: itDue == null ? { why: 'אין חישוב' } : { value: r0(itDue - paidPast - paidFuture - fRec), basis: 'computed' },
      catchUp: cu.amount, catchUpLines: cu.lines,
      interestLinkage: { why: 'ריבית והצמדה (סעיפים 187, 190) — תלויים בתאריכים ובהחלטת הרשות; לא מחושבים כאן', ruleId: 'it.advances.yearEndBalance' },
      fine: { why: 'קנס חל רק על מקדמה שהגיעה ולא שולמה במועד (190(א)(1)) — לא מחושב מראש', ruleId: 'it.advances.latePayment' },
      schedule: unpaid.map(x => ({ period: x, current: r0(method === 'turnoverRate' ? ((current ?? 0) / 100) * per : current ?? 0), recommended: r0(method === 'turnoverRate' ? ((recommended ?? 0) / 100) * per : recommended ?? 0) })),
      explain,
    });
    // ביטוח לאומי
    const niDue = niOf[p].total, niSplit = niOf[p].split, niPart = niParts[p];
    if (cutoff < 12 && (!ni || !ni.readOn || ni.via === 'client')) blockers.push({ code: 'ni_not_read', text: ni?.via === 'client' ? `מקדמת ב״ל${who}: הנתון מהלקוח — לבדוק מול אתר ב״ל ולרשום תאריך בדיקה` : `מקדמת ב״ל${who} לא נרשמה (מתי נבדק ומה הסכום)` });
    const niPaid = (ni?.paidToCutoff ?? sum((ni?.periods ?? []).filter(x => x.period <= cutP && x.paid != null).map(x => x.paid!)))
      + sum(draft.payments.filter(x => x.authority === 'ni' && x.person === p && x.period <= cutP).map(x => x.amount));
    const cur = ni?.monthlyAdvance;
    const rec = 'value' in niDue ? ceilTo(niDue.value / 12, ADVANCE_STEP.ni) : undefined;
    let thr = 0.1;
    try { use('ni.advances.changeThreshold'); thr = num('ni.advances.changeThreshold', year); } catch { /* 10% — טופס 672 */ }
    const niCu = catchUpFor(catchUps.find(c => c.authority === 'ni' && c.person === p), ni ?? {}, cutP, 1, year);
    if (cur != null && rec != null && rec < cur) limits.push(`הקטנת מקדמת ב״ל${who} עלולה להשפיע על זכאות וגובה גמלאות (טופס 672)`);
    // ‼ 14.10.2026 · תיקון מקדמה בב״ל חל מתחילת השנה (שאלות נפוצות ב״ל) ⇒ «הגדלת מקדמות» — חיוב חד־פעמי על החודשים שעברו
    const niCharges: ChargeLine[] = [];
    if (cur != null && rec != null && Math.abs(r0(rec) - cur) >= 1 && cutoff > 0) {
      const up = rec > cur, d = Math.abs(r0(rec) - cur) * cutoff;
      niCharges.push(
        { kind: 'difference', status: 'computed', amount: r0(up ? d : -d),
          text: up ? `«הגדלת מקדמות»: חיוב חד־פעמי של ${nis(d)} (${nis(Math.abs(r0(rec) - cur))} × ${cutoff} חודשים, ינואר עד ${MONTH_HE[cutoff]}). ב״ל קובע לו מועד חיוב משלו; יופיע בחיובים העתידיים`
            : `הקטנה חלה מינואר: זיכוי של ${nis(d)} על החודשים שעברו (${nis(Math.abs(r0(rec) - cur))} × ${cutoff})` },
        { kind: 'linkage', status: 'expected', text: up ? 'הצמדה מהמועד המקורי של כל חודש — צפויה (תקנה 6(ב)), לא אושרה ברשות; לא מחושבת כי תלויה במדד. ההגדלה עוצרת אותה; בלי הגדלה — ההפרש לכל השנה בשומה, עם הצמדה עד יום החישוב' : 'הצמדה לזכות על הקטנה — כך ב״ל נוהג; לא מחושבת' },
        { kind: 'interest', status: 'computed', amount: 0, text: 'ריבית: אין — אלא אם החוב נפרס בהסדר תשלומים (368(ב))' },
        { kind: 'fine', status: 'explain', text: 'קנס: לא צפוי אם החיוב ישולם עד המועד שב״ל יקבע; לא פורסם אם נגבה מהמועדים המקוריים. אם יופיע — אפשר לבקש הפחתה' },
      );
      ['ni.advances.increaseCharge', 'ni.advances.charges'].forEach(id => { try { use(id); } catch { /* */ } });
    }
    advances.push({
      authority: 'ni', person: p, method: 'monthly', current: cur, recommended: rec != null ? r0(rec) : undefined, unit: '₪ לחודש', changeCharges: niCharges.length ? niCharges : undefined,
      annualDue: niDue, split: niSplit, paidPast: r0(niPaid), paidFuture: 0, futureAtCurrent: r0((cur ?? 0) * (12 - cutoff)), futureAtRecommended: r0((rec ?? 0) * (12 - cutoff)),
      balanceAtCurrent: 'value' in niDue && cur != null ? { value: r0(niDue.value - niPaid - cur * (12 - cutoff)), basis: 'computed' } : { why: 'אין חבות ב״ל מחושבת או מקדמה נוכחית' },
      balanceAtRecommended: 'value' in niDue && rec != null ? { value: r0(niDue.value - niPaid - rec * (12 - cutoff)), basis: 'computed' } : { why: 'אין חבות ב״ל מחושבת' },
      catchUp: niCu.amount, catchUpLines: niCu.lines,
      interestLinkage: { why: 'הצמדה על הפרש «הגדלת מקדמות» — לא אומת מתי חלה (סעיף 364); לא מחושבת', ruleId: 'ni.advances.charges' },
      fine: { why: 'קנס בב״ל — לא אומת לגבי הפרשי מקדמות; לא מחושב', ruleId: 'ni.advances.charges' },
      belowChangeThreshold: cur != null && rec != null && cur > 0 ? Math.abs(rec - cur) / cur < thr : false,
      schedule: [],
      explain: 'value' in niDue ? [
        `דמי ביטוח לשנה${who} ${nis(niDue.value)} (${microNoNi.has(p) ? 'עסק זעיר: על ההכנסה אחרי 30%, בלי 47א' : niStatus[p]?.kind === 'nonWork' ? 'עצמאי שאינו עונה להגדרה — כהכנסה שלא מעבודה' : 'הנוסחה הרבעונית של ב״ל'} על הכנסה מעסק ${nis(S[p].business + S[p].adj)}${niPensionCut(p) > 0 && !microNoNi.has(p) ? ` פחות הניכוי לקופת גמל ${nis(niPensionCut(p))} (סעיף 345)` : ''}${niPart?.nwIncome && niStatus[p]?.kind !== 'nonWork' ? `, ועל שכ״ד חייב` : ''}) ÷ 12, מעוגל כלפי מעלה ל-50 ₪ = ${nis(rec ?? 0)} לחודש (מינימום)`,
        ...(niSplit ? [`מזה ביטוח לאומי ${nis(niSplit.ni)} ודמי ביטוח בריאות ${nis(niSplit.health)} — רק דמי הביטוח הלאומי מותרים בניכוי 52% ממס הכנסה (47א)`] : []),
        ...(niStatus[p] ? [`המעמד בב״ל: ${niStatus[p].text}`] : []),
        `שולם עד החתך ${nis(niPaid)}; במקדמה הנוכחית עוד ${nis((cur ?? 0) * (12 - cutoff))}`,
      ] : [],
    });
  }

  // ── 7. (21.10.2026) מה רשום היום, ואיפה משנים — גיא מגיש בעצמו; PIVO לא משנה מקדמות ──
  for (const a of advances) {
    if (a.authority === 'ni') {
      const d = (a.person === 'spouse' ? client.spouseNiIncomeList : client.niIncomeList)?.declaration;
      if (d) a.registered = `רשומה בב״ל הצהרה של ${nis(d.amount)} לחודש (${niIncomePeriodText(d)}) — ממנה המקדמה של היום`;
    }
    const whereTo = whereToChange(a);
    if (whereTo) a.whereToChange = whereTo;
  }

  // ── 7א. מצב היישור מול הרשויות — חסר אינו 0, חיוב אינו תשלום, «הלקוח מסר» אינו קריאה ──
  const bizPersons = new Set(persons.filter(p => computable(p) && draft.lines.some(l => l.person === p && l.source === 'business')));
  const alignment = buildAlignment(draft, persons, bizPersons, year);
  for (const a of alignment) {
    if (!a.gaps.length) continue;
    const who = a.person === 'spouse' ? ` (${PERSON_HE.spouse})` : '';
    const microOnlyP = draft.lines.filter(l => l.person === a.person && l.source === 'business').every(l => microOf.get(l.id)?.mode === 'regular');
    if (a.authority === 'it' && !microOnlyP)
      blockers.push({ code: 'it_periods_missing', text: `מס הכנסה${who}: ${a.gaps.join(' · ')} — להשלים מ-134 או לרשום «טרם הגיע המועד»` });
    if (a.authority === 'ni') blockers.push({ code: 'ni_paid_missing', text: `ב״ל${who}: ${a.gaps.join(' · ')} — להשלים מהאזור האישי בב״ל או לרשום סכום ששולם עד החתך` });
  }

  // ── 8. משק הבית מול מס הכנסה ──
  // ‼ בני זוג: לפי החישוב שיחול (נפרד / מאוחד). כשלא הוכרע — חוסם ו«חסר»; סכום הנפרד אינו מוצג כמס משק הבית
  const liability = spouseCmp?.household ?? sum(personResults.map(x => x.incomeTax));
  const allWithheld = sum(personResults.map(x => x.salaryWithheld));
  const itAdv = advances.filter(a => a.authority === 'it');
  const advPaid = sum(itAdv.map(a => a.paidPast + a.paidFuture));
  const fC = sum(itAdv.map(a => a.futureAtCurrent)), fR = sum(itAdv.map(a => a.futureAtRecommended));
  const cuApproved = sum(itAdv.map(a => ('value' in a.catchUp ? a.catchUp.value : 0)));
  const bal = liability - allWithheld - advPaid - fC;
  const household: HouseholdIt = {
    annualLiability: r0(liability), withheldAnnual: r0(allWithheld), advancesPaid: r0(advPaid),
    futureAtCurrent: r0(fC), futureAtRecommended: r0(fR),
    balanceAtCurrent: r0(bal), balanceAtRecommended: r0(liability - allWithheld - advPaid - fR - cuApproved),
    catchUpApproved: r0(cuApproved), partial: partial.length > 0,
    incomplete: blockers.some(b => ['missing_actual', 'missing_turnover', 'forecast_not_chosen', 'forecast_incomplete', 'micro_books_needed', 'no_tax_data', 'spouse_source_unknown', 'spouse_calc_open'].includes(b.code)),
    explain: [`חבות שנתית ${nis(liability)} − ניכוי במקור ${nis(allWithheld)} − מקדמות ששולמו ${nis(advPaid)} − מקדמות עתידיות במקדמה הנוכחית ${nis(fC)} = ${bal >= 0 ? 'חוב' : 'זכות'} ${nis(Math.abs(bal))}${partial.length ? ' — חלקי: חלק מהחבות לא חושב' : ''}`],
  };
  // ‼ חסרים נתוני הכנסה ⇒ אין מקדמה מומלצת ואין יתרה: סכום שנגזר מנתונים חסרים אינו תוצאה (ולא 0)
  if (household.incomplete) {
    const why = { why: 'חסרים נתוני הכנסה — להשלים קודם' };
    for (const a of advances) Object.assign(a, { recommended: undefined, annualDue: why, balanceAtCurrent: why, balanceAtRecommended: why, futureAtRecommended: 0, schedule: [], explain: [] });
  }
  if (!household.incomplete && household.balanceAtCurrent < 0) limits.push('יתרת זכות צפויה במס הכנסה אינה החזר מיידי — היא מתבררת בדוח השנתי');
  if (partial.length) blockers.push({ code: 'unsupported_part', text: `חלק מהחישוב חסר — הסיכום חלקי: ${partial.map(x => x.text.split(':')[0]).join('; ')}` });

  // ── 9. הפקדות: קרן השתלמות עד התקרה — והשפעה על המס ──
  const savings: SavingsResult[] = persons.map(p => {
    const pr = personResults.find(x => x.person === p)!;
    const dep = deposits(p);
    const sf = pr.businessTaxable > 0 ? studyFundLimit({ year, businessIncome: pr.businessTaxable, employerDeterminingSalary: pr.salary, deposit: dep.study }) : null;
    const max: Amount = !sf ? { why: 'אין הכנסה מעסק' } : sf.ok && sf.value ? { value: sf.value.maxDeduction, basis: 'computed' } : { why: sf.problems.map(describeProblem).join(' · ') };
    let topUp: SavingsResult['studyFundTopUp'];
    // בדיווח מקוצר (או כשמסלול הדיווח לא נבחר) אין ניכוי לקרן השתלמות — לא מציעים השלמה
    if ('value' in max && sf?.value && !opts.extraStudyFund && !opts.extraPension && !opts.noChecks && td && computable(p) && depModeOf(p) === 'full' && !yearEnded) {
      const extra = Math.max(0, r0(sf.value.maxDeduction - Math.min(dep.study, sf.value.maxDeduction)));
      if (extra > 0) {
        const alt = computeEstimate(draft, ctx, { extraStudyFund: { [p]: extra } });
        topUp = { extraDeposit: extra, taxSaving: Math.max(0, r0(pr.incomeTax - (alt.persons.find(x => x.person === p)?.incomeTax ?? pr.incomeTax))) };
      }
    }
    return {
      person: p, studyFundMaxDeduction: max, studyFundPlanned: r0(dep.study), pensionPlanned: r0(dep.pension), studyFundTopUp: topUp,
      pensionNote: 'פנסיה: התקרה תלויה במסלול (א׳/ב׳), בגיל 50 ובמעמד «עמית מוטב» — ראו «ידע מקצועי › פנסיה לעצמאי». מגיל 50 — לא מחושב (לא הוכרע).',
    };
  });
  ['sf.se.rate', 'sf.se.ceiling'].forEach(id => { try { use(id); } catch { /* */ } });

  // ── 9א. «מה בדקנו» — כל בדיקת מיצוי, גם כשלא נמצא חיסכון; בדיקה שלא בוצעה מוצגת כך ──
  const checks: OptimizationCheck[] = [];
  if (!opts.extraStudyFund && !opts.extraPension && !opts.noChecks) {
    // המצב המשפחתי שהחישוב רץ לפיו — תמיד גלוי, גם כשהוא ודאי
    checks.push({ id: 'family-year', title: `מצב משפחתי בשנת המס ${year}`, status: fam.certainty === 'known' ? 'checked' : fam.certainty === 'review' ? 'notSupported' : 'missingData',
      detail: fam.certainty === 'unknown'
        ? `${fam.review}. חושב בינתיים לפי המצב היום — לא לאישור.`
        : `${fam.label} (${fam.basis})${fam.review && !fam.isEventYear ? ` · ${fam.review}` : ''}${fam.isEventYear && fam.eventNote ? ` · ${fam.eventNote}` : ''}`,
      ruleIds: fam.isEventYear && fam.current === 'married' ? ['spouse.marriageYearFiling'] : undefined });
    const ended = 'ההערכה הוכנה אחרי סוף השנה: הפקדה שתשולם עכשיו נספרת בשנה שבה שולמה';
    for (const p of persons) {
      const pr = personResults.find(x => x.person === p)!;
      const sv = savings.find(x => x.person === p)!;
      const who = persons.length > 1 ? ` · ${PERSON_HE[p]}` : '';
      const hasBiz = pr.businessTaxable > 0;
      // קרן השתלמות לעצמאי
      if (!hasBiz) checks.push({ id: `sf-${p}`, person: p, title: `קרן השתלמות לעצמאי${who}`, status: 'notApplicable', detail: 'אין הכנסה מעסק — הניכוי לעצמאי לא חל. הפקדות המעביד — ב-106, לא כאן', topicId: 'studyFund' });
      else if (!computable(p) || !td) checks.push({ id: `sf-${p}`, person: p, title: `קרן השתלמות לעצמאי${who}`, status: 'missingData', detail: pr.notComputed ?? 'אין חישוב מס', topicId: 'studyFund' });
      else if (depModeOf(p) !== 'full') checks.push({ id: `sf-${p}`, person: p, title: `קרן השתלמות לעצמאי${who}`, status: 'notApplicable', detail: depModeOf(p) === 'short' ? 'דיווח מקוצר (עסק זעיר) — אין ניכוי לקרן השתלמות' : 'מסלול הדיווח של העסק הזעיר לא נבחר — הבדיקה אחרי הבחירה', topicId: 'studyFund' });
      else if (!isNum(sv.studyFundMaxDeduction)) checks.push({ id: `sf-${p}`, person: p, title: `קרן השתלמות לעצמאי${who}`, status: 'missingData', detail: (sv.studyFundMaxDeduction as { why: string }).why, topicId: 'studyFund' });
      else if (yearEnded) checks.push({ id: `sf-${p}`, person: p, title: `קרן השתלמות לעצמאי${who}`, status: 'notApplicable', detail: ended, topicId: 'studyFund' });
      else if (sv.studyFundTopUp && sv.studyFundTopUp.taxSaving > 0) checks.push({ id: `sf-${p}`, person: p, title: `קרן השתלמות לעצמאי${who}`, status: 'saving', saving: sv.studyFundTopUp.taxSaving,
        detail: `מופקד/מתוכנן ${nis(sv.studyFundPlanned)} מתוך ניכוי מרבי ${nis(sv.studyFundMaxDeduction.value)}. השלמה של ${nis(sv.studyFundTopUp.extraDeposit)} מורידה את המס בכ-${nis(sv.studyFundTopUp.taxSaving)} (חושב מחדש באותו מנוע)`,
        action: `להפקיד עוד ${nis(sv.studyFundTopUp.extraDeposit)} לקרן השתלמות לעצמאים עד 31.12.${year}`, topicId: 'studyFund', ruleIds: ['sf.se.rate', 'sf.se.ceiling'] });
      else checks.push({ id: `sf-${p}`, person: p, title: `קרן השתלמות לעצמאי${who}`, status: 'noSaving', detail: sv.studyFundPlanned >= sv.studyFundMaxDeduction.value ? `ההפקדה (${nis(sv.studyFundPlanned)}) כבר מנצלת את הניכוי המרבי (${nis(sv.studyFundMaxDeduction.value)})` : 'השלמה לא משנה את המס בתרחיש הזה', topicId: 'studyFund' });

      // פנסיה לעצמאי — השלמה עד התקרה המועילה (מסלול א׳ בלבד; מסלול ב׳ ומגיל 50 — ביד)
      const title = `פנסיה לעצמאי — השלמת הפקדה${who}`;
      const cp = caps[p];
      const age = ageOnJan1(p === 'client' ? client.birthDate : client.spouse?.birthDate);
      // ‼ R07: שכיר בלי עסק שהפקיד בעצמו — ההפקדה נכללת בחישוב (47(ב)(2)); רק ההשלמה האוטומטית לא נבדקת כאן
      if (!hasBiz) checks.push({ id: `pen-${p}`, person: p, title, status: 'notApplicable', topicId: 'pensionSE',
        detail: deposits(p).pension > 0 && pr.salary > 0
          ? (cp?.sePension && 'deduction' in cp.sePension ? `אין הכנסה מעסק. ההפקדה העצמאית (${nis(deposits(p).pension)}) נכללה בחישוב: ניכוי ${nis(cp.sePension.deduction)} בשל משכורת שאינה מבוטחת (47(ב)(2)), והשאר לזיכוי. השלמה נוספת — לבדיקה ידנית` : `אין הכנסה מעסק. ההפקדה העצמאית (${nis(deposits(p).pension)}) לא חושבה — ראו «להשלים לפני אישור»`)
          : 'אין הכנסה מעסק — השלמת הפקדה כעמית עצמאי לא נבדקת. הפקדה עצמאית של שכיר (47(ב)(2)) נכללת בחישוב כשהיא מוזנת; הפקדות דרך המשכורת — מ-106' });
      else if (!computable(p) || !td) checks.push({ id: `pen-${p}`, person: p, title, status: 'missingData', detail: pr.notComputed ?? 'אין חישוב מס', topicId: 'pensionSE' });
      else if (depModeOf(p) !== 'full') checks.push({ id: `pen-${p}`, person: p, title, status: 'notApplicable', detail: depModeOf(p) === 'short' ? 'דיווח מקוצר (עסק זעיר) — זיכוי 35% עד 5% מההכנסה החייבת; לא נבדקה השלמה' : 'מסלול הדיווח של העסק הזעיר לא נבחר', topicId: 'pensionSE' });
      else if (age == null) checks.push({ id: `pen-${p}`, person: p, title, status: 'missingData', detail: 'חסר תאריך לידה — התקרה תלויה בגיל 50', topicId: 'pensionSE' });
      else if (age >= 50) checks.push({ id: `pen-${p}`, person: p, title, status: 'notSupported', detail: 'מגיל 50 — קריאת התקרה לא הוכרעה (pen.trackA.age50); לבדוק ביד', topicId: 'pensionSE', ruleIds: ['pen.trackA.age50'] });
      else if (cp?.pensionCalc?.beneficial) checks.push({ id: `pen-${p}`, person: p, title, status: 'notSupported', detail: 'עמית מוטב (מסלול ב׳) — השלמה לא נבדקת אוטומטית; לבדוק ביד', topicId: 'pensionSE', ruleIds: ['pen.trackB'] });
      else if (yearEnded) checks.push({ id: `pen-${p}`, person: p, title, status: 'notApplicable', detail: ended, topicId: 'pensionSE' });
      else {
        const sv2 = draft.savings.find(x => x.person === p);
        const base = { year, nonWorkIncome: Math.max(0, pr.businessTaxable - caps[p].study), businessIncome: pr.businessTaxable, salary: pr.salary,
          insuredSalary: pr.salary > 0 ? sv2?.insuredSalary : 0, employeeDeposits: sv2?.employeeDeposits, employerDeposits: sv2?.employerDeposits, ageOnJan1: age, forceTrackA: true };
        const mx = selfEmployedPension({ ...base, ownDeposits: 1e9 });
        const cur = deposits(p).pension;
        if (!mx.ok || !mx.value) checks.push({ id: `pen-${p}`, person: p, title, status: 'missingData', detail: mx.problems.map(describeProblem).join(' · '), topicId: 'pensionSE' });
        else {
          const useful = mx.value.deduction + mx.value.creditBase + mx.value.extraCreditBase;
          const room = Math.max(0, r0(useful - cur));
          let threshold = Infinity;
          try { threshold = num('pen.beneficial.threshold', year); } catch { /* השער כבר דיווח */ }
          const others = (sv2?.employeeDeposits ?? 0) + (sv2?.employerDeposits ?? 0);
          // ‼ מעל רף «עמית מוטב» החישוב עובר למסלול ב׳ — שלא נבדק אוטומטית. לכן ההשלמה נעצרת שקל לפני הרף,
          //   ומה שמעבר מוצג במפורש כ«לבדוק ביד».
          const capped = cur + room + others >= threshold;
          const roomA = capped ? Math.max(0, Math.floor(threshold - 1 - cur - others)) : room;
          if (room <= 0) checks.push({ id: `pen-${p}`, person: p, title, status: 'noSaving', detail: `ההפקדה (${nis(cur)}) כבר מגיעה לתקרה המועילה במסלול א׳ (${nis(useful)}: ניכוי + בסיס לזיכוי)`, topicId: 'pensionSE' });
          else if (roomA <= 0) checks.push({ id: `pen-${p}`, person: p, title, status: 'notSupported', detail: `ההפקדות כבר בגובה רף «עמית מוטב» (${nis(threshold)}) — מסלול ב׳; לבדוק ביד`, topicId: 'pensionSE', ruleIds: ['pen.trackB'] });
          else {
            const alt = computeEstimate(draft, ctx, { extraPension: { [p]: roomA } });
            const saving = Math.max(0, r0(pr.incomeTax - (alt.persons.find(x => x.person === p)?.incomeTax ?? pr.incomeTax)));
            const niBefore = pr.niSelfEmployed, niAfter = alt.persons.find(x => x.person === p)?.niSelfEmployed;
            const niSave = isNum(niBefore) && niAfter && isNum(niAfter) ? Math.max(0, r0(niBefore.value - niAfter.value)) : 0;
            const niNote = niSave > 0 ? ` ובב״ל — דמי הביטוח יורדים בכ-${nis(niSave)} (הניכוי לפנסיה מקטין את ההכנסה לב״ל, סעיף 345; לא נכלל בחיסכון במס).` : '';
            const capNote = capped ? ` ההשלמה נעצרת לפני רף «עמית מוטב» (${nis(threshold)}): מעבר לו — מסלול ב׳, לבדוק ביד אם עוד ${nis(room - roomA)} משתלמים.` : '';
            checks.push(saving > 0
              ? { id: `pen-${p}`, person: p, title, status: 'saving', saving, detail: `מופקד/מתוכנן ${nis(cur)}; השלמה של ${nis(roomA)} מורידה את המס בכ-${nis(saving)} — ניכוי לפי סעיף 47 וזיכוי 35% לפי 45א (חושב מחדש באותו מנוע).${niNote}${capNote} הכסף נשאר שלו בקופה — זה לא «חיסכון» במזומן`,
                action: `להפקיד עוד ${nis(roomA)} לקופת גמל לקצבה כעמית עצמאי עד 31.12.${year}`, topicId: 'pensionSE', ruleIds: ['pen.trackA.baseRate', 'pen.credit.rate'] }
              : { id: `pen-${p}`, person: p, title, status: 'noSaving', detail: `השלמה של ${nis(roomA)} לא משנה את המס בתרחיש הזה.${capNote}`, topicId: 'pensionSE' });
          }
        }
      }
    }
    // ביטוח חיים ותרומות — לכל אדם שהוזן לו סכום
    for (const p of persons) {
      const who = persons.length > 1 ? ` · ${PERSON_HE[p]}` : '';
      const li = lifeIns(p);
      if (li > 0) {
        const cr = r0(lifeCredit(p, true));
        let lp: ReturnType<typeof lifeParts> | undefined;
        try { lp = lifeComputable(p) ? lifeParts(p, true) : undefined; } catch { lp = undefined; }
        const openCr = lp ? r0(num('credit.lifeIns.rate', year) * lp.qualOpen) : 0;
        if (openCr > 0) openQuestions.push({ id: `life-${p}`, text: `ביטוח חיים: עוד לא הוכרע אם חלק מהפרמיה מזכה גם כנגד הכנסה שאינה מבוטחת. הסכום חושב בלי החלק הזה; אם יתברר שמותר — המס נמוך בעד ${nis(openCr)}`, impact: openCr, direction: 'lower' });
        if (openCr > 0) limits.push(`ביטוח חיים (${PERSON_HE[p]}), עמית מוטב: ייתכן זיכוי נוסף של עד ${nis(openCr)} — אם ביטוח החיים נכנס גם לתקרת ההכנסה שאינה מבוטחת (45א(ה)). החוק והמדריך שותקים; לא נכלל בחישוב, והמס עשוי להיות נמוך בסכום הזה`);
        let benInsuredMissing = false;
        try { benInsuredMissing = !lp && lifeBeneficial(p) && S[p].salary > 0; } catch { /* */ }
        checks.push(lp
          ? { id: `life-${p}`, person: p, title: `ביטוח חיים — זיכוי 25%${who}`, status: openCr > 0 ? 'undecided' : 'noSaving', saving: undefined,
              detail: `פרמיה ${nis(li)} (ריסק בחברת ביטוח: 106 + ישירות, בלי כפל; כיסוי מוות בתוך קרן פנסיה הוא חלק מההפקדה לפנסיה). ${lp.beneficial ? 'עמית מוטב — תקרות 45א(ה): ' : ''}התקרה המשותפת (45א) ${nis(lp.T)}; ${lp.usedP > 0 ? `הפקדות הפנסיה ממלאות קודם (${nis(lp.usedP)}) — ` : ''}לביטוח החיים ${nis(lp.qual)} ← זיכוי ${nis(cr)} נכלל בחישוב${lp.usedP > 0 && cr === 0 ? '. הפנסיה תפסה את כל התקרה — הריסק לא מזכה' : ''}${openCr > 0 ? `. שנוי במחלוקת ולא נכלל: עוד ${nis(r0(lp.qualOpen))} בתקרת ההכנסה שאינה מבוטחת (זיכוי עד ${nis(openCr)})` : ''}. סדר המילוי — כפי שפרסמה רשות המסים (2005)`,
              ruleIds: ['credit.lifeIns.rate', 'credit.45a.fixedCeiling', 'credit.45a.workRate'], topicId: 'annualReturn' }
          : { id: `life-${p}`, person: p, title: `ביטוח חיים — זיכוי 25%${who}`, status: 'notSupported',
              detail: `פרמיה ${nis(li)}. ${benInsuredMissing ? 'עמית מוטב עם משכורת — חסרה ההכנסה המבוטחת (106, שדה 244/245), שקובעת את התקרה' : 'חסר כלל במרשם לשנה'} — הזיכוי (בין 0 ל-${nis(r0(0.25 * li))}) לא נכלל`, ruleIds: ['credit.lifeIns.rate'], topicId: 'annualReturn' });
      }
      const dn = draft.credits?.find(c => c.person === p)?.donations ?? 0;
      if (dn > 0) checks.push({ id: `don-${p}`, person: p, title: `תרומות — זיכוי 35% (סעיף 46)${who}`, status: dn > 207 ? 'noSaving' : 'notApplicable',
        detail: dn > 207 ? `${nis(dn)} נכלל בחישוב (עד 30% מההכנסה החייבת). חלוקה בין בני הזוג — כפי שהוזנה: החוק שותק, ואין כאן אופטימיזציה` : `${nis(dn)} — עד 207 ₪ בשנה אין זיכוי (צריך יותר מ-207)`, ruleIds: ['credit.donation.minExclusive'], topicId: 'annualReturn' });
    }
    // בני זוג — נפרד מול מאוחד: שני המספרים, או «ההשוואה טרם בוצעה». ‼ ההפרש אינו חיסכון של המשרד — הרשות מחילה את הזול
    if (persons.length === 2 && married) {
      const T = 'בני זוג — חישוב נפרד או מאוחד', R = ['spouse.jointDefault', 'spouse.separateEligibility'];
      const jr = (c: SpouseComparison) => (c.joint.low === c.joint.high ? nis(c.joint.low) : `${nis(c.joint.low)} עד ${nis(c.joint.high)}`);
      checks.push(!bothEarn
        ? { id: 'spouse-calc', topicId: 'annualReturn', title: T, status: 'notApplicable', detail: 'רק לאחד מבני הזוג הכנסה מיגיעה אישית — אין חישוב נפרד לבדוק. הכנסה שאינה מיגיעה אישית נזקפת לבעל היגיעה' }
        : !draft.spouseSource
          ? { id: 'spouse-calc', topicId: 'annualReturn', title: T, status: 'notCompared', detail: 'לא סומן אם יש מקור הכנסה משותף (66(ד)) — אין בסיס לקבוע אם חישוב נפרד מותר. ההשוואה טרם בוצעה', ruleIds: R }
          : !spouseCmp
            ? { id: 'spouse-calc', topicId: 'annualReturn', title: T, status: 'notCompared', detail: 'חסרים נתונים לחישוב של אחד מבני הזוג — ההשוואה טרם בוצעה', ruleIds: R }
            : spouseCmp.household == null
              ? { id: 'spouse-calc', topicId: 'annualReturn', title: T, status: 'undecided', detail: `חושב: ${spouseCmp.separate != null ? `נפרד ${nis(spouseCmp.separate)} · ` : ''}מאוחד ${jr(spouseCmp)}. לא הוכרע — ${spouseCmp.openBecause.join('; ')}`, ruleIds: [...R, 'spouse.jointChildPoints'] }
              : { id: 'spouse-calc', topicId: 'annualReturn', title: T, status: 'compared', ruleIds: R,
                  detail: spouseCmp.separate == null
                    ? `החוק מחייב חישוב מאוחד (מקור משותף בלי שלושת התנאים של 66(ד)). מס משק הבית במאוחד: ${nis(spouseCmp.household)}`
                    : `חושב בשתי הדרכים: נפרד ${nis(spouseCmp.separate)}, מאוחד ${jr(spouseCmp)}. חל: ${spouseCmp.applies === 'separate' ? 'נפרד' : 'מאוחד'} — הזול מבין השניים, כפי שהרשות מחילה בעצמה. זה לא חיסכון של המשרד` });
    }

    // ‼ 16.10.2026 (C18): ילד/ה נטול/ת יכולת — לנשואים 2 הנקודות (סעיף 45) להורה אחד, לבחירתם. חושב לשני הכיוונים,
    //   בלי ברירת מחדל מגדרית; הבחירה נרשמת בכרטיס הילד ובדוח (023 לרשום / 131 לבן/בת הזוג). אף פעם לא לשניהם.
    const disabledKids = married && client.spouse ? (client.children ?? []).filter(c => c.hasDisability) : [];
    if (disabledKids.length && td) {
      const T = 'ילד/ה נטול/ת יכולת — 2 נקודות להורה אחד (סעיף 45)';
      const to = (w: Person) => computeEstimate(draft, { client: { ...client, children: client.children.map(c => (c.hasDisability ? { ...c, disabilityPointsTo: w } : c)) }, taxYear: year }, { noChecks: true }).household;
      const atClient = to('client'), atSpouse = to('spouse');
      const nowAt = new Set(disabledKids.map(c => c.disabilityPointsTo ?? 'client'));
      const curP: Person | undefined = nowAt.size === 1 ? [...nowAt][0] : undefined;
      if (atClient.incomplete || atSpouse.incomplete || household.incomplete) checks.push({ id: 'disabled-child', topicId: 'annualReturn', title: T, status: 'missingData', detail: 'חסרים נתוני הכנסה — ההשוואה בין ההורים אחרי ההשלמה' });
      else {
        const best: Person = atSpouse.annualLiability < atClient.annualLiability ? 'spouse' : 'client';
        const curTax = curP === 'spouse' ? atSpouse.annualLiability : curP === 'client' ? atClient.annualLiability : household.annualLiability;
        const bestTax = Math.min(atClient.annualLiability, atSpouse.annualLiability);
        const both = `אצל ${PERSON_HE.client}: מס משק הבית ${nis(atClient.annualLiability)} · אצל ${PERSON_HE.spouse}: ${nis(atSpouse.annualLiability)}`;
        checks.push(curTax - bestTax >= 1
          ? { id: 'disabled-child', topicId: 'annualReturn', title: T, status: 'saving', saving: r0(curTax - bestTax),
              detail: `${both}. הנקודות נזקפות היום ${curP ? 'ל' + PERSON_HE[curP] : 'בחלוקה בין שני ההורים (לכל ילד להורה אחד)'} — אצל ${PERSON_HE[best]} המס נמוך יותר. בני הזוג בוחרים; לא לשניהם`,
              action: `לבקש את 2 הנקודות אצל ${PERSON_HE[best]} (בדוח: ${best === 'client' ? '023' : '131'} לפי מי הרשום) ולעדכן בכרטיס הילד` }
          : { id: 'disabled-child', topicId: 'annualReturn', title: T, status: 'noSaving',
              detail: `${both}. הנקודות אצל ${PERSON_HE[curP ?? best]} — ${atClient.annualLiability === atSpouse.annualLiability ? 'אין הבדל במס' : 'הזול מבין השניים'}. נזקפות להורה אחד בלבד` });
      }
    }

    // עסק זעיר — מסלול הדיווח (שתי החלופות כבר חושבו)
    for (const m of micro.filter(x => x.reporting && (x.reporting.short != null || x.reporting.full != null))) {
      const r = m.reporting!;
      const best = r.short != null && r.full != null ? (r.short <= r.full ? 'short' : 'full') : undefined;
      checks.push({ id: `micro-${m.lineId}`, person: m.person, title: 'עסק זעיר — דיווח מקוצר מול דוח מלא', status: best && r.short !== r.full ? 'saving' : 'noSaving',
        saving: best && r.short != null && r.full != null ? Math.abs(r.short - r.full) : undefined,
        detail: `מס בדיווח מקוצר ${r.short == null ? 'לא חושב' : nis(r.short)} · בדוח מלא ${r.full == null ? 'לא חושב' : nis(r.full)}${r.chosen ? ` · נבחר: ${r.chosen === 'short' ? 'מקוצר' : 'מלא'}` : ''}. המסלול משפיע גם על הטפסים והמועדים, לא רק על המס`,
        action: best ? `לשקול ${best === 'short' ? 'דיווח מקוצר' : 'דוח מלא'} — בכפוף לתנאי הפטור` : undefined, topicId: 'microBusiness' });
    }
  }

  // ── 10. מה עכשיו ──
  const changed = advances.filter(a => a.current != null && a.recommended != null && (a.authority === 'it' ? Math.abs(a.recommended - a.current) >= 0.1 : !a.belowChangeThreshold && Math.abs(a.recommended - a.current) >= 1));
  const exceed = micro.find(m => m.status !== 'within');
  const microFirst = exceed ? `עסק זעיר — ${exceed.status === 'actualExceed' ? 'המחזור כבר חרג מהתקרה' : 'צפויה חריגה מהתקרה'}: לעדכן תיאום מס ולהיערך לדוח מלא. ` : '';
  const nextAction = microFirst + (blockers.length
    ? `להשלים לפני אישור: ${blockers[0].text}${blockers.length > 1 ? ` (ועוד ${blockers.length - 1})` : ''}`
    : changed.length
      ? `לאשר את ההערכה, ולמסור ללקוח את המקדמות המומלצות: ${changed.map(a => `${a.authority === 'it' ? 'מס הכנסה' : 'ב״ל'}${a.person === 'spouse' ? ' (בן/בת הזוג)' : ''} ${a.unit === '%' ? `${a.recommended}%` : nis(a.recommended!)} (היום ${a.unit === '%' ? `${a.current}%` : nis(a.current!)})`).join(' · ')}`
      : household.balanceAtCurrent < 0
        ? `לאשר את ההערכה — צפויה יתרת זכות של כ-${nis(-household.balanceAtCurrent)} (מתבררת בדוח השנתי, לא החזר מיידי)`
        : household.balanceAtCurrent > 0
          ? `לאשר את ההערכה — צפוי חוב של כ-${nis(household.balanceAtCurrent)} בסוף השנה${itAdv.length ? '' : ' (אין מקדמות לעדכן — לשקול תיאום מס או מקדמה)'}`
          : 'לאשר את ההערכה — המקדמות והניכויים מכסים את החבות המשוערת');
  if (persons.some(p => S[p].business > 0 && !microNoNi.has(p))) limits.push('ניכוי 52% מדמי ב״ל (47א): בדוח השנתי — לפי התשלומים בפועל בשנה (עע״מ 624/20 קירשבלום; מ-2025 בניכוי החזרים שהתקבלו). כאן — לפי החבות המשוערת לשנה');
  if (draft.lines.some(l => l.source === 'capital')) limits.push('הכנסה הונית: השיעור לפי סוג כל שורה; רווח הון — הריאלי (בלי הסכום האינפלציוני). קיזוז הפסדים, ריבית שנצמחה לפני 2012 ובעל מניות מהותי במכירה — ביד');
  if (cutoff < 12 && !draft.newBusiness) limits.push(`נתוני אמת עד סוף ${MONTH_HE[cutoff]}; ${12 - cutoff} החודשים הבאים — תחזית שאושרה`);
  // ‼ 30.10.2026 · עסק חדש: עוד אין תיק ואין מקדמות — אין מה לקרוא מ-134 או מב״ל, והמעמד בב״ל ייקבע בפתיחת התיק (6101).
  //   מה שחוסם רק בגלל קריאה מהרשות — לא חוסם כאן. השנה המלאה של העסק היא הבסיס (forecastFlow.ts › withClientAnswers).
  const NEW_BIZ_SKIP = /^(it_not_read|it_method_unknown|it_periods_missing|ni_not_read|ni_paid_missing|ni_status_)/;
  const shown = draft.newBusiness ? blockers.filter(b => !NEW_BIZ_SKIP.test(b.code)) : blockers;
  if (draft.newBusiness) limits.push('עסק חדש: המקדמות מחושבות לשנה מלאה של העסק, לפי מה שהלקוח צופה בחודש');

  return {
    taxYear: year, cutoffMonth: cutoff, persons: personResults, household, advances, micro, savings, blockers: shown, partial, limits, openQuestions: openQuestions.length ? openQuestions : undefined,
    cashflow: household.incomplete ? [] : buildCashflow(advances, draft, year), alignment, checks,
    ...(spouseCmp ? { spouseCalc: { applies: spouseCmp.applies, separate: spouseCmp.separate, jointLow: spouseCmp.joint.low, jointHigh: spouseCmp.joint.high, household: spouseCmp.household, open: spouseCmp.openBecause } } : {}),
    usedRules: [...used.values()], rulesetVersion: RULESET_VERSION, nextAction,
  };
}

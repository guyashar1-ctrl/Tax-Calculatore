// ─── הערכת מס: סיכום ללקוח מגרסה מאושרת ──────────────────────────────────────
// ‼ נבנה רק מגרסה מאושרת (draft + outputs של אותה שורה) — אותו מודל למסך המשרד, לקובץ להורדה ולדף האישי.
//   אין עותק נפרד שיכול להתיישן: גרסה חדשה = סיכום חדש.
// ‼ אומדן משרדי, לא חיוב של רשות. הערות פנימיות (הכרעות, יישור, הערת המשרד) לא נכנסות.
import { MONTH_HE, annualFor, forecastFor } from './engine';
import type { EstimateDraft, EstimateOutputs, Person } from './types';
import { isNum } from './types';

export interface SummaryInput {
  clientName: string;
  spouseName?: string;
  taxYear: number;
  version: number;
  approvedAt?: string;
  /** oneOffs / adjustments — בגרסאות שפורסמו לפני 13.10.2026 לא הגיעו לדף האישי; ריק = לא מוצג. */
  draft: Pick<EstimateDraft, 'cutoffMonth' | 'preparedOn' | 'lines' | 'catchUps'> & Partial<Pick<EstimateDraft, 'oneOffs' | 'adjustments'>>;
  outputs: EstimateOutputs;
}

export interface SummaryModel {
  title: string;
  subtitle: string;
  period: string;
  /** detail — ממה מורכב הסכום (נפתח בלחיצה). */
  headline: { label: string; value: string; tone?: 'due' | 'credit'; detail?: string[] }[];
  /** הכנסות לפי מקור: בפועל עד החתך, תחזית, חד־פעמיים ושנתי — ולעסק גם מחזור והוצאות לפי הספרים. */
  incomes: { title: string; value: string; detail: string[] }[];
  /** התאמות מס — כל אחת בנפרד (לא מעורבבות בספרים). */
  adjustments: string[];
  /** «מה בדקנו» — גם כשלא נמצא חיסכון. */
  checks: { title: string; result: string; detail: string }[];
  /** תשלומים צפויים עד סוף השנה, עם מועדים. */
  schedule: { title: string; rows: { date: string; now: string; recommended: string }[]; note?: string }[];
  partial?: string;
  /** שאלות מקצועיות שעוד לא הוכרעו ומשפיעות על הסכום — ללקוח, עם ההשפעה. */
  open: string[];
  openNote?: string;
  advances: { who: string; authority: string; now: string; recommended: string; note?: string }[];
  nowVsLater: string[];
  assumptions: string[];
  gaps: string[];
  savings: string[];
  micro: string[];
  disclaimer: string;
}

const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const heDate = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const METHOD: Record<string, string> = { runRate: 'לפי הקצב החודשי עד עכשיו', lastYear: 'כמו אותם חודשים בשנה שעברה', manual: 'סכום שהוערך', none: 'אין הכנסה נוספת' };

export function buildSummary(x: SummaryInput): SummaryModel {
  const o = x.outputs, d = x.draft, h = o.household;
  const who = (p: Person) => (p === 'client' ? x.clientName : x.spouseName ?? 'בן/בת הזוג');
  const bal = (v: number) => (v > 0 ? `צפוי חוב של כ-${nis(v)}` : v < 0 ? `צפויה יתרת זכות של כ-${nis(-v)}` : 'מאוזן');
  const cut = d.cutoffMonth;
  // ── פירוט לכל סכום: מאיפה הוא בא ──
  const taxDetail = o.persons.flatMap(pr => {
    const b = pr.breakdown;
    const tag = o.persons.length > 1 ? `${who(pr.person)}: ` : '';
    if (pr.notComputed) return [`${tag}${pr.notComputed}`];
    const parts = [pr.salary ? `משכורת ${nis(pr.salary)}` : '', pr.businessTaxable ? `עסק ${nis(pr.businessTaxable)}${pr.adjustments ? ` (לפי הספרים ${nis(pr.businessBooks)}, התאמות ${pr.adjustments > 0 ? '+' : ''}${nis(pr.adjustments)})` : ''}` : '',
      pr.rent ? `שכר דירה ${nis(pr.rent)}` : '', pr.other ? `אחר ${nis(pr.other)}` : '', pr.capital ? `הון ${nis(pr.capital)} (בשיעור נפרד)` : ''].filter(Boolean);
    const out = [`${tag}מס הכנסה ${nis(pr.incomeTax)} — הכנסות: ${parts.join(' · ') || 'אין'}`];
    if (b) {
      out.push(`${tag}הכנסה חייבת ${nis(b.taxable)}${b.deductions ? ` אחרי ניכויים של ${nis(b.deductions)}` : ''}${b.niDeduction ? ` (מהם 52% מדמי ב״ל: ${nis(b.niDeduction)})` : ''}`);
      const cr = [b.creditPointsValue ? `נקודות זיכוי (${pr.creditPoints}) ${nis(b.creditPointsValue)}` : '', b.pensionCredit ? `זיכוי פנסיה ${nis(b.pensionCredit)}` : '', b.donationCredit ? `זיכוי תרומות ${nis(b.donationCredit)}` : '', b.lifeCredit ? `זיכוי ביטוח חיים ${nis(b.lifeCredit)}` : ''].filter(Boolean);
      if (cr.length) out.push(`${tag}זיכויים: ${cr.join(' · ')}`);
      if (b.surtax) out.push(`${tag}מס יסף ${nis(b.surtax)}`);
      if (b.capitalTax) out.push(`${tag}מס על הכנסה הונית ${nis(b.capitalTax)}`);
    }
    return out;
  });
  const withheldDetail = d.lines.filter(l => (l.withheldToCutoff ?? 0) + (l.withheldForecast ?? 0) > 0)
    .map(l => `${l.label}${l.person === 'spouse' ? ` (${who('spouse')})` : ''}: ${nis((l.withheldToCutoff ?? 0) + (d.cutoffMonth < 12 ? l.withheldForecast ?? 0 : 0))}${l.source === 'business' ? ' — ניכוי במקור מלקוחות' : ''}`);
  const paidDetail = o.advances.filter(a => a.authority === 'it').map(a => `מקדמות מס הכנסה${a.person === 'spouse' ? ` (${who('spouse')})` : ''}: ${nis(a.paidPast)} עד החתך${a.paidFuture ? ` + ${nis(a.paidFuture)} ששולמו מראש` : ''}`);
  // ‼ בני זוג: מס משק הבית לפי החישוב שחל; הסכומים לכל אחד למטה — מהחישוב הנפרד, ולכן במאוחד הם להשוואה בלבד
  const sc = o.spouseCalc;
  const spouseDetail = !sc || sc.household == null ? [] : [sc.separate == null
    ? `חישוב מאוחד (החוק מחייב אותו כאן): ${nis(sc.household)}. הסכומים לכל אחד מבני הזוג למטה — להשוואה בלבד`
    : `חושב בשתי הדרכים: נפרד ${nis(sc.separate)}, מאוחד ${sc.jointLow === sc.jointHigh ? nis(sc.jointLow) : `${nis(sc.jointLow)} עד ${nis(sc.jointHigh)}`}. חל ${sc.applies === 'separate' ? 'החישוב הנפרד' : 'החישוב המאוחד'} — הזול מבין השניים, כפי שרשות המסים מחילה${sc.applies === 'joint' ? '. הסכומים לכל אחד למטה — מהחישוב הנפרד, להשוואה בלבד' : ''}`];
  const headline: SummaryModel['headline'] = [
    { label: `מס הכנסה משוער לשנת ${x.taxYear}`, value: nis(h.annualLiability), detail: [...spouseDetail, ...taxDetail] },
    { label: 'נוכה במקור', value: nis(h.withheldAnnual), detail: withheldDetail },
    { label: 'מקדמות ששולמו', value: nis(h.advancesPaid), detail: paidDetail },
    { label: 'מס הכנסה בסוף השנה, אם לא משנים כלום', value: bal(h.balanceAtCurrent), tone: h.balanceAtCurrent > 0 ? 'due' : h.balanceAtCurrent < 0 ? 'credit' : undefined,
      detail: [`${nis(h.annualLiability)} מס − ${nis(h.withheldAnnual)} ניכוי במקור − ${nis(h.advancesPaid)} מקדמות ששולמו − ${nis(h.futureAtCurrent)} מקדמות עד סוף השנה במקדמה של היום`] },
  ];
  if (o.advances.some(a => a.authority === 'it' && a.recommended != null)) headline.push({ label: 'מס הכנסה בסוף השנה, לפי ההמלצה', value: bal(h.balanceAtRecommended), tone: h.balanceAtRecommended > 0 ? 'due' : h.balanceAtRecommended < 0 ? 'credit' : undefined });
  for (const a of o.advances.filter(y => y.authority === 'ni' && isNum(y.annualDue))) {
    const tag = a.person === 'spouse' ? ` · ${who('spouse')}` : '';
    const due = (a.annualDue as { value: number }).value;
    headline.push({ label: `ביטוח לאומי לשנה${tag}`, value: nis(due), detail: [...a.explain, 'דמי ביטוח לאומי ובריאות לעצמאי — לפי ההכנסה מהעסק; נקבעים סופית בשומה של ב״ל'] });
    // ‼ יתרת מ״ה של משק הבית אינה כוללת את ב״ל — בלי השורה הזו לקוח עם זכות במ״ה וחוב בב״ל קורא «זכות» על הכול.
    if (isNum(a.balanceAtCurrent)) {
      const now = a.balanceAtCurrent.value, reco = isNum(a.balanceAtRecommended) ? a.balanceAtRecommended.value : undefined;
      headline.push({ label: `ביטוח לאומי בסוף השנה, אם לא משנים כלום${tag}`, value: bal(now), tone: now > 0 ? 'due' : now < 0 ? 'credit' : undefined,
        detail: [`${nis(due)} דמי ביטוח − ${nis(a.paidPast + a.paidFuture)} ששולמו − ${nis(a.futureAtCurrent)} מקדמות עד סוף השנה במקדמה של היום`,
          ...(reco != null && a.recommended != null ? [`במקדמה המומלצת: ${bal(reco)}`] : []),
          ...((reco ?? now) > 0 ? ['הפרש לחודשים שכבר עברו נגבה בדרך כלל בחיוב נפרד של ב״ל או בשומה הסופית. אפשר להשלים אותו מראש'] : [])] });
    }
  }

  const fmt = (v: number | undefined, unit: string) => (v == null ? '—' : unit === '%' ? `${v}% מהמחזור` : unit === '₪ לחודש' ? `${nis(v)} לחודש` : `${nis(v)} לתקופה`);
  const advances = o.advances.filter(a => a.recommended != null || a.current != null).map(a => ({
    who: who(a.person),
    authority: a.authority === 'it' ? 'מקדמת מס הכנסה' : 'מקדמת ביטוח לאומי',
    now: fmt(a.current, a.unit),
    recommended: a.recommended == null ? 'ללא שינוי' : fmt(a.recommended, a.unit),
    note: a.belowChangeThreshold ? 'השינוי קטן — אין צורך לעדכן' : a.recommended != null && a.current != null && a.recommended < a.current && a.authority === 'ni' ? 'הקטנת מקדמת ב״ל עלולה להשפיע על גמלאות' : undefined,
  }));

  const nowVsLater: string[] = [];
  const catchUps = o.advances.filter(a => isNum(a.catchUp));
  for (const a of catchUps) nowVsLater.push(`להשלים עכשיו ל${a.authority === 'it' ? 'מס הכנסה' : 'ביטוח לאומי'}${a.person === 'spouse' ? ` (${who('spouse')})` : ''}: ${nis((a.catchUp as { value: number }).value)} — לתקופות שכבר עברו`);
  if (o.advances.some(a => a.recommended != null)) nowVsLater.push('מהתקופה הבאה — המקדמה המומלצת בטבלה. המשרד מעדכן אותה מולך; עד אז אין שינוי');
  // 14.10.2026 · מה יחול אם משנים — הפרש בנפרד מהצמדה, מריבית ומקנס (research/advances-topup-charges)
  for (const a of o.advances.filter(y => y.changeCharges?.length)) {
    const d = a.changeCharges!.find(c => c.kind === 'difference');
    const tag = a.person === 'spouse' ? ` (${who('spouse')})` : '';
    if (a.authority === 'ni' && d?.amount && d.amount > 0) nowVsLater.push(`בביטוח לאומי${tag}: אם מגדילים את המקדמה, ב״ל יחייב «הגדלת מקדמות» של כ-${nis(d.amount)} על החודשים שעברו השנה — במועד שב״ל יקבע. בתוספת הצמדה (לא מחושבת כאן), בלי ריבית`);
    if (a.authority === 'it' && d?.amount && d.amount > 0) nowVsLater.push(`במס הכנסה${tag}: אפשר להשלים מרצון כ-${nis(d.amount)} לחודשים שעברו — תשלום על חשבון השנה. אם נשאר חוב בסוף השנה, תשלום עד 31 בינואר פוטר מריבית ומהצמדה`);
  }
  const rest = h.balanceAtRecommended;
  if (rest > 0) nowVsLater.push(`במס הכנסה, מה שיישאר (כ-${nis(rest)}) ייקבע בדוח השנתי. זה אומדן, לא דרישת תשלום`);
  else if (rest < 0) nowVsLater.push(`במס הכנסה, יתרת זכות משוערת (כ-${nis(-rest)}) מתבררת בדוח השנתי — אינה החזר מיידי`);
  for (const a of o.advances.filter(y => y.authority === 'ni' && isNum(y.balanceAtRecommended) && (y.balanceAtRecommended as { value: number }).value > 0))
    nowVsLater.push(`בביטוח לאומי${a.person === 'spouse' ? ` (${who('spouse')})` : ''}, גם אחרי ההמלצה צפוי הפרש של כ-${nis((a.balanceAtRecommended as { value: number }).value)} לחודשים שעברו — ב״ל גובה אותו בנפרד או בשומה`);

  const assumptions = d.lines.map(l => {
    const side = l.chosen ? l[l.chosen] : undefined;
    const m = side ? METHOD[side.method] ?? side.method : 'לא נקבע';
    return `${l.label}${l.person === 'spouse' ? ` (${who('spouse')})` : ''}: נתוני אמת עד סוף ${MONTH_HE[cut]}; ${cut < 12 ? `לשאר השנה — ${m}${side?.assumption ? ` (${side.assumption})` : ''}` : 'שנה מלאה'}`;
  });
  const gaps = [...o.partial.map(p => p.text), ...o.persons.filter(p => p.notComputed).map(p => `${who(p.person)}: ${p.notComputed}`)];
  const savings = o.savings.filter(s => s.studyFundTopUp).map(s => `${who(s.person)}: הפקדה נוספת של ${nis(s.studyFundTopUp!.extraDeposit)} לקרן השתלמות עד סוף השנה — חיסכון משוער במס של כ-${nis(s.studyFundTopUp!.taxSaving)}`);
  if (o.savings.some(s => s.pensionPlanned > 0 || s.studyFundPlanned > 0) || savings.length) savings.push('הפקדה לפנסיה מקטינה גם היא את המס — בכפוף לתקרות. כדאי לבדוק מול המשרד לפני סוף השנה');
  const micro = (o.micro ?? []).map(m => `${d.lines.find(l => l.id === m.lineId)?.label ?? 'העסק'}: עסק זעיר — ${m.status === 'within' ? `בתוך התקרה (${nis(m.annualTurnover)} מתוך ${nis(m.ceiling)}), ניכוי 30% מהמחזור` : m.status === 'forecastExceed' ? `צפוי לחרוג מהתקרה (${nis(m.annualTurnover)} מול ${nis(m.ceiling)}) — המשרד יעדכן תיאום מס, ובשנה כזו מגישים דוח שנתי מלא` : `המחזור חרג מהתקרה — מגישים דוח שנתי מלא`}`);

  // ── הכנסות לפי מקור ──
  const SRC: Record<string, string> = { salary: 'משכורת', business: 'עסק', rent: 'שכר דירה', capital: 'הון', other: 'אחר' };
  // ‼ ללקוח: מאיפה המספר — מה שמסר, מסמך שנבדק, נתוני הרשות או הספרים (14.10.2026)
  const FROM_CLIENT: Record<string, string> = { client: 'לפי מה שמסרת, אחרי בדיקת המשרד', document: 'לפי המסמך, שנבדק במשרד', authority: 'לפי נתוני הרשות', import: 'לפי הספרים (קובץ שנקלט)', office: 'לפי הנתונים במשרד' };
  const incomes = d.lines.map(l => {
    const a = annualFor(l, d as EstimateDraft), f = forecastFor(l, d as EstimateDraft);
    const side = l.chosen ? l[l.chosen] : undefined;
    const from = l.actualFrom ?? l.actualSource?.provenance;
    const det: string[] = [`בפועל עד סוף ${MONTH_HE[cut]}: ${l.actualToCutoff == null ? 'חסר' : nis(l.actualToCutoff)}${l.actualToCutoff != null && from ? ` — ${FROM_CLIENT[from]}` : ''}`];
    if (l.source === 'business' && l.turnoverToCutoff != null && l.actualToCutoff != null) det.push(`לפי הספרים (לפני התאמות מס): מחזור ${nis(l.turnoverToCutoff)} − הוצאות ${nis(l.turnoverToCutoff - l.actualToCutoff)} = רווח ${nis(l.actualToCutoff)}`);
    if (cut < 12) det.push(`תחזית ל-${12 - cut} החודשים הבאים: ${f == null ? 'לא נקבעה' : nis(f)}${side ? ` — ${METHOD[side.method] ?? side.method}${side.assumption ? ` (${side.assumption})` : ''}` : ''}`);
    for (const o1 of (d.oneOffs ?? []).filter(z => z.lineId === l.id)) det.push(`חד־פעמי: ${o1.label} ${nis(o1.amount)} — ${o1.timing === 'inActual' ? 'כבר בתוך הבפועל, ולא הוכפל בתחזית' : 'צפוי, נוסף פעם אחת'}`);
    return { title: `${l.label}${l.person === 'spouse' ? ` · ${who('spouse')}` : ''} · ${SRC[l.source] ?? ''}`, value: a == null ? 'חסר' : nis(a), detail: det };
  });
  const adjustments = (d.adjustments ?? []).map(a => `${d.lines.find(l => l.id === a.lineId)?.label ?? 'העסק'}: ${a.bookCategory} ${a.amount > 0 ? '+' : ''}${nis(a.amount)} — ${a.reason}`);
  const CHECK_RESULT: Record<string, string> = { saving: 'נמצא חיסכון', noSaving: 'נבדק — אין חיסכון נוסף', missingData: 'לא נבדק — חסר מידע', notSupported: 'לבדיקה ידנית במשרד', notCompared: 'ההשוואה טרם בוצעה', compared: 'חושב בשתי הדרכים', undecided: 'לא הוכרע — המשרד בודק' };
  const checks = (o.checks ?? []).filter(c => c.status !== 'notApplicable')
    .map(c => ({ title: c.title, result: `${CHECK_RESULT[c.status] ?? ''}${c.saving ? ` · כ-${nis(c.saving)}` : ''}`, detail: c.action ? `${c.detail} · המלצה: ${c.action}` : c.detail }));
  const schedule: SummaryModel['schedule'] = [];
  for (const a of o.advances) {
    const rows = (o.cashflow ?? []).filter(c => c.authority === a.authority && c.person === a.person && c.kind === 'advance' && c.date)
      .map(c => ({ date: heDate(c.date), now: nis(c.current), recommended: nis(c.recommended) }));
    if (rows.length) schedule.push({ title: `${a.authority === 'it' ? 'מקדמות מס הכנסה' : 'מקדמות ביטוח לאומי'}${a.person === 'spouse' ? ` · ${who('spouse')}` : ''}`, rows,
      note: a.authority === 'ni' ? 'בהוראת קבע — ב-22 בחודש' : 'מועד שחל ביום מנוחה נדחה' });
  }

  return {
    title: `הערכת מס לשנת ${x.taxYear} — ${x.clientName}${x.spouseName && o.persons.length > 1 ? ` ו${x.spouseName}` : ''}`,
    subtitle: `גרסה ${x.version}${x.approvedAt ? ` · אושרה ${heDate(x.approvedAt)}` : ''} · הוכנה ${heDate(d.preparedOn)}`,
    period: cut >= 12 ? `שנה מלאה — נתוני אמת עד סוף דצמבר ${x.taxYear}` : `נתוני אמת עד סוף ${MONTH_HE[cut]} ${x.taxYear}; ${12 - cut} החודשים הבאים — תחזית`,
    headline,
    partial: h.partial ? 'חלק מהחישוב לא בוצע — ראו «מה חסר». הסכומים אינם הסיכום המלא.' : undefined,
    // ‼ תרחיש פתוח לא מוצג כתוצאה סופית — גם בדף הלקוח (גיא, 14.10.2026)
    open: (o.openQuestions ?? []).map(q => q.text),
    openNote: o.openQuestions?.length ? 'חלק מהחישוב תלוי בשאלה מקצועית שעוד לא הוכרעה — ראו «מה עוד לא הוכרע». הסכומים לפי ההנחה שמפורטת שם.' : undefined,
    advances, nowVsLater, assumptions, gaps, savings, micro, incomes, adjustments, checks, schedule,
    disclaimer: 'זהו אומדן של המשרד לפי הנתונים שהיו בידינו ביום האישור, ואינו חיוב או שומה של רשות המסים או של ביטוח לאומי. שינוי בהכנסות משנה את התוצאה — עדכנו אותנו.',
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** קובץ HTML עצמאי (עברית, RTL, מוכן להדפסה) — למסירה ידנית ללקוח. */
export function summaryHtml(m: SummaryModel, officeName?: string): string {
  const li = (xs: string[]) => xs.map(x => `<li>${esc(x)}</li>`).join('');
  const sec = (t: string, xs: string[]) => (xs.length ? `<section><h2>${esc(t)}</h2><ul>${li(xs)}</ul></section>` : '');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(m.title)}</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1f22;--mut:#5d6168;--bd:#e3e0d8;--due:#8a4b0c;--ok:#1f6b45}
@media (prefers-color-scheme:dark){:root{--bg:#16181b;--fg:#ecebe7;--mut:#a5a8ad;--bd:#2c2f34;--due:#e3a25a;--ok:#6cc79a}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 "Segoe UI",Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px;text-wrap:balance}h2{font-size:16px;margin:22px 0 8px}
.sub,.per{color:var(--mut);margin:0}.per{margin-top:6px}
.fig{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:8px;margin-top:16px}
.fig div{border:1px solid var(--bd);border-radius:10px;padding:10px 12px}.fig span{display:block;color:var(--mut);font-size:13px}
.fig b{font-size:17px;font-variant-numeric:tabular-nums}.due{color:var(--due)}.credit{color:var(--ok)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:start;padding:6px 8px;border-bottom:1px solid var(--bd)}th{color:var(--mut);font-weight:600}
.wrap{overflow-x:auto}.warn{border:1px solid var(--due);color:var(--due);border-radius:10px;padding:8px 12px;margin-top:12px}
ul{padding-inline-start:20px;margin:0}li{margin:3px 0}footer{margin-top:28px;color:var(--mut);font-size:13px}
h3{font-size:14px;margin:12px 0 4px}details{margin-top:6px}details summary{cursor:pointer;color:var(--mut);font-size:13px}
details.row{border-bottom:1px solid var(--bd);padding:6px 0;margin:0}details.row summary{display:flex;justify-content:space-between;gap:12px;color:var(--fg);font-size:15px}
details.row summary b{font-variant-numeric:tabular-nums;white-space:nowrap}details.row ul,details.row p{margin:6px 0 0}
@media print{details{display:block}details>summary{list-style:none}details:not([open])>*:not(summary){display:block}}
@media print{body{background:#fff;color:#000}.fig div{break-inside:avoid}}
</style></head><body><main>
<h1>${esc(m.title)}</h1><p class="sub">${esc(m.subtitle)}${officeName ? ` · ${esc(officeName)}` : ''}</p><p class="per">${esc(m.period)}</p>
${m.partial ? `<p class="warn">${esc(m.partial)}</p>` : ''}
${m.openNote ? `<p class="warn">${esc(m.openNote)}</p>` : ''}
<div class="fig">${m.headline.map(h => `<div><span>${esc(h.label)}</span><b class="${h.tone ?? ''}">${esc(h.value)}</b>${h.detail?.length ? `<details><summary>ממה זה מורכב</summary><ul>${li(h.detail)}</ul></details>` : ''}</div>`).join('')}</div>
${m.advances.length ? `<section><h2>מקדמות — היום והמלצה</h2><div class="wrap"><table><thead><tr><th>מקדמה</th><th>היום</th><th>מומלץ מהתקופה הבאה</th><th></th></tr></thead><tbody>${m.advances.map(a => `<tr><td>${esc(a.authority)} · ${esc(a.who)}</td><td>${esc(a.now)}</td><td><b>${esc(a.recommended)}</b></td><td>${esc(a.note ?? '')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
${sec('מה עכשיו ומה בהמשך', m.nowVsLater)}
${m.schedule.length ? `<section><h2>תשלומים עד סוף השנה</h2>${m.schedule.map(s => `<h3>${esc(s.title)}</h3><div class="wrap"><table><thead><tr><th>עד</th><th>במקדמה של היום</th><th>לפי ההמלצה</th></tr></thead><tbody>${s.rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.now)}</td><td><b>${esc(r.recommended)}</b></td></tr>`).join('')}</tbody></table></div>${s.note ? `<p class="sub">${esc(s.note)}</p>` : ''}`).join('')}</section>` : ''}
${m.incomes.length ? `<section><h2>הכנסות — מה נכנס לחישוב</h2>${m.incomes.map(i => `<details class="row"><summary><span>${esc(i.title)}</span><b>${esc(i.value)}</b></summary><ul>${li(i.detail)}</ul></details>`).join('')}</section>` : ''}
${sec('התאמות מס (בנפרד מהספרים)', m.adjustments)}
${m.checks.length ? `<section><h2>מה בדקנו בשבילך</h2>${m.checks.map(c => `<details class="row"><summary><span>${esc(c.title)}</span><b>${esc(c.result)}</b></summary><p class="sub">${esc(c.detail)}</p></details>`).join('')}</section>` : ''}
${sec('עסק זעיר', m.micro)}
${sec('חיסכון ופנסיה — אפשרויות לשקול', m.savings)}
${sec('על מה ההערכה נשענת', m.assumptions)}
${sec('מה עוד לא הוכרע', m.open)}
${sec('מה חסר', m.gaps)}
<footer>${esc(m.disclaimer)}</footer>
</main></body></html>`;
}

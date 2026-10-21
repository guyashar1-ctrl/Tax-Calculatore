// ─── הדוח השנתי — המנוע (שלב 4) ─────────────────────────────────────────────────
// ‼ טהור. חישוב המס — אותו מנוע של הערכת המס (computeEstimate), לשנה מלאה (חתך דצמבר, בלי תחזית): חישוב אחד במערכת.
// ‼ קלט: העובדות המאושרות של שנת המס מתיק המס (sliceYear). עובדה שמכסה רק חלק מהשנה (עד חתך ההערכה) — «חסר
//   להשלמת השנה», לא נכנסת כשנה. עובדה שממתינה לאישור — לא נכנסת.
// ‼ מקור שאינו נתמך (מכירת נכס, חו״ל, חברה בשליטה, נאמנות, שותפות, הפסדים מועברים…) — פער; נסגר רק בהשלמה
//   מקצועית מאושרת עם שדות ו«מס על הרכיב». אין «מוכן להגשה» עם פער פתוח.
// ‼ טופס 1301 ממופה ל-2025 בלבד. לשנה אחרת — טיוטה פנימית בלבד, לא להגשה.

import type { Client } from '../../types';
import type { Evidence, YearFact } from '../taxYear/types';
import { computeEstimate } from '../taxEstimate/engine';
import type { Blocker, EstimateDraft, EstimateOutputs, IncomeLine, Payment, Person, SavingsPlan } from '../taxEstimate/types';
import { isNum } from '../taxEstimate/types';
import { CATALOG_1301_2025, ANNEX_CATALOG_2025 } from '../taxForms/coverage1301';
import { lineOf, readComponents, screenerYes, sliceYear, sumComponent, trustOf } from './facts';
import type { FactReading, Trust } from './facts';
import type { AnnexStatus, FieldSource, GapKind, ReturnControl, ReturnDraft, ReturnField, ReturnGap, ReturnOutputs } from './types';
import { DOCS } from '../taxYear/documents';
import type { DocKind } from '../taxYear/types';
import { buildCoverage } from './formFields';
import { compute1320, LINES_1320 } from './annex1320';
import { DRAFT_FILL_1301 } from '../taxForms/coverage1301';
import { asOfDate, clientForTaxYear, familyStatusForYear } from '../../utils/familyStatusYear';

const r0 = (n: number) => Math.round(n);
const nis = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`;
const PERSON_HE: Record<Person, string> = { client: 'הלקוח', spouse: 'בן/בת הזוג' };
export const SUPPORTED_FORM_YEARS = [2025];

// ── אינדקס קודים (N7, 17.10.2026): קוד = (שנה, טופס, קוד, טור). אותו קוד יכול לשמש כמה שדות (181/182: קוד התואר, שנת סיום…).
//    לא בוחרים אחד בשקט: כל ההתאמות נשמרות, הבחירה לפי הטור (רשום / בן זוג / משותף) וסוג השדה, ושדה שנשאר דו-משמעי מסומן.
type CatEntry = { id: string; part: string; section: string | null; codes: Record<string, string | null> | null; label: string; kind: string };
export type CodeColumn = 'registered' | 'spouse' | 'joint';
export interface CodeMatch { entry: CatEntry; column: CodeColumn | 'id' }
const CODE_INDEX = new Map<string, CodeMatch[]>();
for (const e of CATALOG_1301_2025 as unknown as CatEntry[]) {
  for (const col of ['registered', 'spouse', 'joint'] as const) {
    const c = e.codes?.[col];
    if (c) CODE_INDEX.set(c, [...(CODE_INDEX.get(c) ?? []), { entry: e, column: col }]);
  }
  if (!e.codes || !Object.values(e.codes).some(Boolean)) CODE_INDEX.set(e.id, [...(CODE_INDEX.get(e.id) ?? []), { entry: e, column: 'id' }]);
}
/** כל ההתאמות של קוד בטופס 1301/2025 — בכל הטורים. «42» מוצא גם «042». */
export function codeMatches(code: string): CodeMatch[] {
  const raw = code.trim();
  return CODE_INDEX.get(raw) ?? CODE_INDEX.get(raw.padStart(3, '0')) ?? [];
}
/** תווית ומיקום של קוד לטור של האדם — ההתאמה לטור ולסוג; יותר מהתאמה אחת שנשארה ⇒ ambiguous. */
function codeInfo(code: string, person: Person | 'joint', kind: ReturnField['kind'] = 'amount'): { part: string; section?: string; label: string; ambiguous: boolean } {
  const all = codeMatches(code);
  if (!all.length) return { part: '?', label: `קוד ${code}`, ambiguous: false };
  const col: CodeColumn = person === 'spouse' ? 'spouse' : person === 'joint' ? 'joint' : 'registered';
  let m = all.filter(x => x.column === col);
  if (!m.length) m = all.filter(x => x.column === 'id');
  if (!m.length) m = all;
  const byKind = m.filter(x => (kind === 'amount' ? x.entry.kind === 'amount' : x.entry.kind !== 'amount'));
  if (byKind.length) m = byKind;
  const f = m[0].entry;
  return { part: f.part, section: f.section ?? undefined, label: f.label, ambiguous: new Set(m.map(x => x.entry.id)).size > 1 };
}
const docLabelOf = (kind: string) => (DOCS as Record<string, { label: string }>)[kind as DocKind]?.label ?? kind;
const annexTitle = (formId: string) => (ANNEX_CATALOG_2025 as { formId: string; title: string }[]).find(a => a.formId === formId)?.title ?? `נספח ${formId}`;

/** מקורות שהדוח לא מחשב — שאלת פתיחה; «כן» = הדוח «גיליון חלקי» (השלמה מקצועית אינה סוגרת נספח שלא מופק). */
const UNSUPPORTED: { itemKey: string; gap: string; text: string; annex?: string }[] = [
  { itemKey: 'sales.sold', gap: 'sales', text: 'מכירת נכס / מניות מחוץ לחשבון / קריפטו / חלק בעסק — רווח הון ושבח (נספחים 1322 / 1399י)', annex: '1399י' },
  { itemKey: 'foreign.income', gap: 'foreign', text: 'הכנסות או חשבונות בחו״ל (נספח ד׳ — 1324)', annex: '1324' },
  { itemKey: 'companies.controlled', gap: 'companies', text: 'חברה בשליטה — דיבידנד, משיכות 3(ט1), חברה משפחתית (חלק יא)' },
  { itemKey: 'special.trust', gap: 'trust', text: 'נאמנות (יוצר או נהנה)' },
  { itemKey: 'special.partnership', gap: 'partnership', text: 'שותפות (כולל שותפות נפט)' },
  { itemKey: 'special.nonResident', gap: 'nonResident', text: 'תושבות חוץ או ניתוק תושבות' },
  { itemKey: 'special.financialInstitution', gap: 'financialInstitution', text: 'רווח של מוסד כספי' },
  { itemKey: 'special.reportablePosition', gap: 'reportable', text: 'פעולה או עמדה חייבת בדיווח' },
];

export interface ReturnInput {
  client: Client;
  draft: ReturnDraft;
  facts: YearFact[];
  evidence: Evidence[];
  /** הערכת המס המאושרת לשנה — להשוואה ולתיאור הכיסוי. */
  estimate?: { version: number; cutoffMonth: number; outputs: EstimateOutputs };
}

export function computeReturn(input: ReturnInput): ReturnOutputs {
  const { draft, facts, evidence, estimate } = input;
  const year = draft.taxYear;
  // ‼ 16.10.2026: המצב המשפחתי של שנת הדוח, לא של היום (utils/familyStatusYear.ts) — שדות בני זוג, 1301 חלק ב׳, הצהרות
  const familyInYear = familyStatusForYear(input.client, year, asOfDate(draft.preparedOn));
  const client = clientForTaxYear(input.client, year, asOfDate(draft.preparedOn));
  const slice = sliceYear(facts, year);
  const gaps: (Blocker & { kind?: GapKind })[] = [];
  const limits: string[] = [];
  const persons = draft.persons;
  const formOk = SUPPORTED_FORM_YEARS.includes(year);
  if (!formOk) gaps.push({ code: 'form_version', text: `טופס 1301 לשנת ${year} לא ממופה (ממופה: ${SUPPORTED_FORM_YEARS.join(', ')}). אפשר להכין טיוטה פנימית לפי מבנה 2025 — לא להגשה` });

  // ‼ שורות מקור (17.10.2026): כל קריאה שתרמה לשדה נשמרת כשורה — סכום, מסמך, שאלה, אדם, שנה. sumIsField: Σ השורות = השדה.
  const src = (readings: FactReading[], text: string, opts: { sumIsField?: boolean } = {}): FieldSource => ({
    kind: 'fact', factIds: readings.map(r => r.fact.id), evidenceIds: [...new Set(readings.map(r => r.fact.evidenceId).filter(Boolean) as string[])],
    trust: readings.reduce<Trust>((t, r) => (r.trust === 'manual' || t === 'manual' ? 'manual' : r.trust === 'read' || t === 'read' ? 'read' : 'verified'), 'verified'), text,
    lines: readings.map(r => lineOf(r, evidence, docLabelOf)), sumIsField: opts.sumIsField ?? true,
  });
  const partialOf = (itemKey: string, role: string, entityRef?: string) =>
    slice.partial.find(f => f.itemKey === itemKey && f.subjectRole === role && (entityRef == null || f.entityRef === entityRef));
  const missing = (code: string, what: string, itemKey: string, role: string, entityRef?: string) => {
    const p = partialOf(itemKey, role, entityRef);
    gaps.push({ code, text: p ? `${what}: יש נתון עד ${p.periodTo?.slice(5, 7) ?? '?'}/${year} (${p.basis === 'actual_to_date' ? 'מהערכת המס' : p.basis}) — חסר נתון סופי לשנה` : `${what}: אין נתון סופי לשנה` });
  };

  // ── 1. שורות הכנסה לכל אדם ומקור — מהעובדות המלאות, לפי ישויות הכרטיס ──
  const lines: IncomeLine[] = [];
  const readingsBy = new Map<string, FactReading[]>();
  const personOf = (belongsToSpouse?: boolean): Person => (belongsToSpouse ? 'spouse' : 'client');
  for (const e of client.employers ?? []) {
    const p = personOf((e as { belongsToSpouse?: boolean }).belongsToSpouse);
    if (!persons.includes(p)) continue;
    const g = sumComponent(slice, 'salary.amounts', 'gross', p, evidence, e.id), w = sumComponent(slice, 'salary.amounts', 'withheld', p, evidence, e.id);
    if (g.amount == null) { missing(`salary_${e.id}`, `משכורת · ${e.name}`, 'salary.amounts', p, e.id); continue; }
    lines.push({ id: `sal-${e.id}`, person: p, source: 'salary', entityRef: e.id, label: `משכורת · ${e.name}`, actualToCutoff: g.amount, withheldToCutoff: w.amount ?? 0 });
    readingsBy.set(`sal-${e.id}`, [...g.readings, ...w.readings]);
    if (w.amount == null) gaps.push({ code: `salary_withheld_${e.id}`, text: `משכורת · ${e.name}: חסר המס שנוכה (טופס 106)` });
  }
  for (const b of client.businesses ?? []) {
    if ((b as { isClosed?: boolean }).isClosed) continue;
    const p = personOf((b as { belongsToSpouse?: boolean }).belongsToSpouse);
    if (!persons.includes(p)) continue;
    const m = draft.micro[b.id] ?? {};
    const pr = sumComponent(slice, 'business.profit', 'profit', p, evidence, b.id), t = sumComponent(slice, 'business.profit', 'turnover', p, evidence, b.id);
    const cw = sumComponent(slice, 'business.profit', 'customerWithholding', p, evidence, b.id);
    const isMicro = m.track === 'micro';
    if (t.amount == null && (isMicro || pr.amount == null)) { missing(`business_${b.id}`, `עסק · ${b.name || 'עסק'}`, 'business.profit', p, b.id); continue; }
    if (!isMicro && pr.amount == null) { missing(`business_profit_${b.id}`, `עסק · ${b.name || 'עסק'} — רווח לפי הספרים`, 'business.profit', p, b.id); continue; }
    lines.push({ id: `biz-${b.id}`, person: p, source: 'business', entityRef: b.id, label: b.name || 'עסק', actualToCutoff: pr.amount, turnoverToCutoff: t.amount, withheldToCutoff: cw.amount ?? 0,
      track: m.track, micro: m });
    readingsBy.set(`biz-${b.id}`, [...pr.readings, ...t.readings, ...cw.readings]);
  }
  // שכר דירה — לנכס, או סכום כולל
  const rentTotal = (role: 'client' | 'spouse' | 'couple') => {
    const per = (client.properties ?? []).filter(x => x.isRented).map(x => sumComponent(slice, 'rent.income', 'income', role, evidence, x.id));
    const all = sumComponent(slice, 'rent.incomeTotal', 'income', role, evidence);
    const rs = [...per.flatMap(x => x.readings), ...all.readings];
    return { amount: rs.length ? rs.reduce((a, r) => a + r.amount, 0) : undefined, readings: rs };
  };
  const rent = rentTotal('couple'), rentC = rentTotal('client');
  const rentAll = { amount: (rent.amount ?? 0) + (rentC.amount ?? 0), readings: [...rent.readings, ...rentC.readings] };
  if ((client.properties ?? []).some(x => x.isRented) && !rentAll.readings.length) gaps.push({ code: 'rent', text: 'שכר דירה: יש נכס מושכר בתיק ואין סכום סופי לשנה' });
  // ‼ מסלול 10%: ניכוי שכר דירה ששולם למגורי המשכיר עד 90,000 (נספח 1321, סעיף 3) — המס על הנטו
  const rentTrack = client.rentalTaxTrack ?? (client.properties ?? []).find(x => x.isRented)?.rentalTaxTrack;
  const ownHousingRent = rentTrack === 'flat10' ? Math.min(Math.max(0, draft.rent1321?.ownHousingRent ?? 0), 90_000) : 0;
  if (rentAll.readings.length && persons.includes('client')) {
    lines.push({ id: 'rent', person: 'client', source: 'rent', label: 'שכר דירה', actualToCutoff: Math.max(0, rentAll.amount - ownHousingRent) });
    readingsBy.set('rent', rentAll.readings);
  }
  // שוק ההון — לכל אדם, לפי סוג (C16, N4 — 17.10.2026): ריבית פיקדונות 15% / 25%, ריבית ורווח ני״ע 15%, דיבידנד; המס שנוכה —
  //   על ריבית פיקדונות ← 043, על ני״ע ודיבידנד ← 040; «withheld» בלי פיצול (עובדות ישנות) ← 043 כמו קודם. רווחי הון — נספח (פער).
  type CapKey = 'interest' | 'dividend' | 'depositInterest15' | 'securitiesInterest15' | 'withheld' | 'withheldDeposit' | 'withheldSecurities' | 'gains';
  const CAP_KEYS: CapKey[] = ['interest', 'dividend', 'depositInterest15', 'securitiesInterest15', 'withheld', 'withheldDeposit', 'withheldSecurities', 'gains'];
  const capBucket = () => ({ sum: Object.fromEntries(CAP_KEYS.map(k => [k, 0])) as Record<CapKey, number>, readings: Object.fromEntries(CAP_KEYS.map(k => [k, [] as FactReading[]])) as unknown as Record<CapKey, FactReading[]> });
  const cap: Record<Person, ReturnType<typeof capBucket>> = { client: capBucket(), spouse: capBucket() };
  for (const p of persons) {
    // ‼ עובדת «משק הבית» (couple) נזקפת לבן הזוג הרשום — כמו ההכנסה שאינה מיגיעה אישית (66(ד)); בעלים לחשבון — לפי subjectRole של השורה
    for (const role of p === 'client' ? (['couple', 'client'] as const) : (['spouse'] as const)) {
      for (const k of CAP_KEYS) {
        const s = sumComponent(slice, 'capital.amounts', k, role, evidence);
        if (s.amount == null) continue;
        cap[p].sum[k] += s.amount; cap[p].readings[k].push(...s.readings);
      }
    }
  }
  const capAll = (k: CapKey) => persons.reduce((a, p) => a + cap[p].sum[k], 0);
  const capitalDecided = draft.decisions.some(d => d.key === 'capital.rates');
  if (capAll('interest') + capAll('dividend') > 0 && !capitalDecided) gaps.push({ code: 'capital_rates', text: 'ריבית ודיבידנד בשיעור 25%: לאשר שיעור 25% (לא בעל מניות מהותי) ופיצול הניכוי במקור לפי 867 — הכרעת משרד' });
  for (const p of persons) {
    const c = cap[p];
    const w = c.sum.withheld + c.sum.withheldDeposit + c.sum.withheldSecurities;
    if (c.sum.interest + c.sum.dividend > 0) {
      // השיעור בדוח נקבע בהכרעת המשרד (capital.rates, 25%) — סוג שמחושב ב-25% (13.10.2026)
      lines.push({ id: `capital25-${p}`, person: p, source: 'capital', label: 'ריבית ודיבידנד (25%)', actualToCutoff: c.sum.interest + c.sum.dividend, withheldToCutoff: w, capitalKind: 'dividend' });
      readingsBy.set(`capital25-${p}`, [...c.readings.interest, ...c.readings.dividend]);
    }
    if (c.sum.depositInterest15 + c.sum.securitiesInterest15 > 0) {
      lines.push({ id: `capital15-${p}`, person: p, source: 'capital', label: 'ריבית 15% (פיקדונות, ני״ע)', actualToCutoff: c.sum.depositInterest15 + c.sum.securitiesInterest15,
        withheldToCutoff: c.sum.interest + c.sum.dividend > 0 ? 0 : w, capitalKind: 'interestUnlinked' });
      readingsBy.set(`capital15-${p}`, [...c.readings.depositInterest15, ...c.readings.securitiesInterest15]);
    }
  }
  if (capAll('gains') > 0) gaps.push({ code: 'capital_gains', text: `רווחי הון ${nis(capAll('gains'))} מני״ע — נספח ג׳ (1322) לפי 867 לכל חשבון; לא מופק כאן — מכינים מחוץ למערכת` });
  // הכנסה אחרת
  const other = sumComponent(slice, 'special.otherIncome', 'amount', 'client', evidence);
  if (other.amount) { lines.push({ id: 'other', person: 'client', source: 'other', label: 'הכנסה אחרת', actualToCutoff: other.amount }); readingsBy.set('other', other.readings); }

  // ── 2. מקורות שאינם נתמכים ──
  for (const u of UNSUPPORTED) if (screenerYes(slice, u.itemKey)) gaps.push({ code: u.gap, text: `${u.text} — לא נתמך; מכינים מחוץ למערכת, והדוח נשאר «גיליון חלקי»` });
  const carry = slice.full.find(f => f.itemKey === 'carryForward.balances' && f.answer === 'value' && readComponents(f).some(c => c.amount !== 0));
  if (carry) gaps.push({ code: 'carryForward', text: 'הפסדים מועברים / עודף זיכוי זר משנה קודמת (חלק יא, 1344) — לא נתמך; מכינים מחוץ למערכת' });
  if (screenerYes(slice, 'niBenefits.received')) gaps.push({ code: 'niBenefits', text: 'גמלאות ב״ל (לידה, מילואים, אבטלה) — לפי האישור השנתי; לא מחושב כאן — להשלים (250/270 או 158/172)' });
  for (const f of slice.pending) limits.push(`ממתין לאישור המשרד ולא נכנס: ${f.itemKey}${f.entityRef ? ` (${f.entityRef})` : ''}`);

  // ── 3. הפקדות, תשלומים ותשלומי ב״ל ──
  const savings: SavingsPlan[] = persons.map(p => {
    const pen = sumComponent(slice, 'savings.selfAmounts', 'pension', p, evidence), sf = sumComponent(slice, 'savings.selfAmounts', 'studyFund', p, evidence);
    // מטופסי 106: ההכנסה המבוטחת והפקדות העובד והמעביד — לתקרת ההכנסה המזכה ולבדיקת עמית מוטב (מדריך 2025, סעיף 53)
    const fromSalary = (c: string) => sumComponent(slice, 'salary.amounts', c, p, evidence).amount;
    return { person: p, pensionToCutoff: pen.amount, studyFundToCutoff: sf.amount, insuredSalary: fromSalary('insured'), employeeDeposits: fromSalary('employeePension'),
      employerDeposits: fromSalary('employerDeposits'), pensionTrack: draft.pensionTrack?.[p] };
  });
  const payments: Payment[] = persons.flatMap(p => {
    const a = sumComponent(slice, 'payments.advances', 'amount', p, evidence);
    return a.amount ? [{ id: `adv-${p}`, authority: 'it' as const, person: p, paidOn: `${year}-12-31`, period: `${year}-12`, amount: a.amount }] : [];
  });

  // ── 4. החישוב — מנוע ההערכה לשנה מלאה ──
  const est: EstimateDraft = {
    cutoffMonth: 12, preparedOn: draft.preparedOn, lines, oneOffs: [], adjustments: draft.adjustments,
    it: { via: 'manual', readOn: draft.preparedOn, method: 'none', frequency: 1, periods: [] },
    ni: { via: 'manual', readOn: draft.preparedOn }, itSpouse: { via: 'manual', readOn: draft.preparedOn, method: 'none', frequency: 1, periods: [] }, niSpouse: { via: 'manual', readOn: draft.preparedOn },
    niOverrides: draft.niOverrides, vat: { via: 'manual', periods: [] }, payments, savings, reconciliations: [], decisions: [],
    credits: persons.map(p => ({ person: p, donations: sumComponent(slice, 'donations.amount', 'amount', p, evidence).amount })),
  };
  // ‼ הלקוח המקורי — מנוע ההערכה גוזר בעצמו את המצב בשנה, עם ההסבר (לפני הנישואין / שנת האירוע)
  const out = computeEstimate(est, { client: input.client, taxYear: year });
  // חוסמים של מנוע המס שנוגעים לדוח (לא למקדמות קדימה)
  // ‼ דמי ב״ל (micro_ni_unverified) אינם חלק מ-1301 — שדה 030 הוא הסכום ששולם בפועל
  // ‼ 13.10.2026: חסר בתשלומי 134/ב״ל נוגע למקדמות, לא לדוח; שער בני הזוג (66(ד)) — הדוח שואל אותו בהצהרות חלק א׳ (בסבב הדוח).
  const ADV = new Set(['it_not_read', 'it_method_unknown', 'ni_not_read', 'turnover_forecast_missing', 'forecast_not_chosen', 'forecast_incomplete', 'micro_ni_unverified', 'it_periods_missing', 'ni_paid_missing', 'spouse_source_unknown']);
  for (const b of out.blockers) if (!ADV.has(b.code) && b.code !== 'unsupported_part') gaps.push(b);
  for (const p of out.partial) gaps.push(p);
  limits.push(...out.limits.filter(l => !/מקדמ|תחזית|החודשים הבאים/.test(l)));

  // ── 5. השלמות מקצועיות — סוגרות פער רק כשאושרו ──
  const approvedCompletions = draft.completions.filter(c => c.approvedAt && c.justification.trim());
  for (const c of draft.completions.filter(c => !c.approvedAt || !c.justification.trim())) limits.push(`השלמה מקצועית ל«${c.gap}» ממתינה לביסוס ולאישור — לא נכנסה`);
  // ‼ רק השלמה שמותר לה לסגור (פער נתון/חישוב, וכל הקודים שלה מופקים) נכנסת לחבות ולשדות — אחרת היא לא קיימת לחישוב
  const usable = approvedCompletions.filter(c => ['data', 'calc'].includes(kindOf(c.gap)) && c.fields.every(x => !!DRAFT_FILL_1301[x.code]));
  const manualTax = usable.reduce((a, c) => a + (c.taxAmount ?? 0), 0);

  // ── 6. שדות 1301 ──
  const fields: ReturnField[] = [];
  const add = (code: string, person: ReturnField['person'], amount: number | undefined, source: FieldSource, kind: ReturnField['kind'] = 'amount') => {
    if (kind === 'amount' && (amount == null || amount === 0)) return;
    const ci = codeInfo(code, person, kind);
    fields.push({ code, part: ci.part, section: ci.section, label: ci.label, person, kind, amount: kind === 'amount' ? r0(amount!) : undefined, checked: kind === 'checkbox' ? true : undefined, source, ambiguous: ci.ambiguous || undefined });
  };
  const code2 = (reg: string, sp: string, p: Person) => (p === 'client' ? reg : sp);
  const calcSrc = (text: string, ruleIds?: string[]): FieldSource => ({ kind: 'calculation', text, ruleIds });
  let salaryWithheldAll = 0, otherWithheld = 0;
  const otherWithheldReadings: FactReading[] = [];
  // ‼ שורות המקור של 042 — רק של האנשים שחושבו (בן/בת זוג בלי כרטיס לא נכנס/ת לדוח, ולכן גם לא לשורות)
  const salaryWithheldReadings: FactReading[] = [];
  // לכל אדם — לכותרת קובץ 1301 (ניכוי במקור ומקדמות נרשמים שם לפי בן הזוג)
  const byPerson: ReturnOutputs['byPerson'] = {};
  const bp = (p: Person) => (byPerson[p] ??= { salaryWithheld: 0, otherWithheld: 0, interestWithheld: 0, advances: 0, forms106: 0 });
  const readingsOf = (pred: (l: IncomeLine) => boolean) => lines.filter(pred).flatMap(l => readingsBy.get(l.id) ?? []);
  for (const p of persons) {
    const pr = out.persons.find(x => x.person === p);
    if (!pr || pr.notComputed) continue;
    const sal = lines.filter(l => l.person === p && l.source === 'salary');
    add(code2('158', '172', p), p, pr.salary, src(readingsOf(l => l.person === p && l.source === 'salary').filter(r => r.component === 'gross'), 'סכום ברוטו מטופסי 106'));
    salaryWithheldAll += sal.reduce((a, l) => a + (l.withheldToCutoff ?? 0), 0);
    salaryWithheldReadings.push(...readingsOf(l => l.person === p && l.source === 'salary').filter(r => r.component === 'withheld'));
    bp(p).salaryWithheld = r0(sal.reduce((a, l) => a + (l.withheldToCutoff ?? 0), 0));
    bp(p).forms106 = sal.length;
    bp(p).advances = r0(payments.filter(x => x.person === p).reduce((a, x) => a + x.amount, 0));
    const bizLines = lines.filter(l => l.person === p && l.source === 'business');
    const microLines = out.micro.filter(m => m.person === p);
    if (bizLines.length) {
      add(code2('150', '170', p), p, pr.businessTaxable, microLines.some(m => m.chosen !== 'books')
        ? calcSrc('עסק זעיר: המחזור פחות הניכוי (87ד)', ['micro.normativeRate']) : { ...src(readingsOf(l => l.person === p && l.source === 'business').filter(r => r.component === 'profit'), 'רווח לפי הספרים', { sumIsField: !pr.adjustments }), text: `רווח לפי הספרים${pr.adjustments ? ` + תיאומים ${nis(pr.adjustments)}` : ''}` });
      add(code2('238', '239', p), p, bizLines.reduce((a, l) => a + (l.turnoverToCutoff ?? 0), 0), src(readingsOf(l => l.person === p && l.source === 'business').filter(r => r.component === 'turnover'), 'מחזור ללא מע״מ'));
      otherWithheld += bizLines.reduce((a, l) => a + (l.withheldToCutoff ?? 0), 0);
      bp(p).otherWithheld += r0(bizLines.reduce((a, l) => a + (l.withheldToCutoff ?? 0), 0));
      for (const l of bizLines) otherWithheldReadings.push(...(readingsBy.get(l.id) ?? []).filter(r => r.component === 'customerWithholding'));
      if (microLines.some(m => m.mode === 'regular' && m.chosen === 'normative') && p === 'client') add('F010', p, undefined, calcSrc('עסק זעיר — דוח מלא עם 30% (סימון בחלק א׳)'), 'checkbox');
      // דמי ב״ל ששולמו על הכנסה שאינה מעבודה — לא במסלול זעיר.
      // ‼ R03/C15 (17.10.2026): מהאישור השנתי — ב״ל בלבד (בריאות נשמרת כשורה ואינה נכנסת לדוח); החזרים שהתקבלו מקטינים את הסכום.
      const niPaid = sumComponent(slice, 'payments.niPaid', 'amount', p, evidence);
      const niRefunds = sumComponent(slice, 'payments.niPaid', 'refunds', p, evidence);
      if (!microLines.some(m => m.chosen !== 'books')) {
        if (niPaid.amount != null) add(code2('030', '089', p), p, Math.max(0, niPaid.amount - (niRefunds.amount ?? 0)),
          src([...niPaid.readings, ...niRefunds.readings], niRefunds.amount ? `דמי ביטוח לאומי ששולמו בשנה ${nis(niPaid.amount)} פחות החזרים ${nis(niRefunds.amount)} (בריאות — לא לדוח)` : 'דמי ביטוח לאומי ששולמו בשנה — לפי האישור השנתי (בריאות — לא לדוח; לא על שנים קודמות)', { sumIsField: !niRefunds.amount }));
        else gaps.push({ code: `ni_paid_${p}`, text: `דמי ביטוח לאומי ששולמו כעצמאי בשנה (${PERSON_HE[p]}) — לשדה 030/089; חסר` });
      }
    }
    // פנסיה כעצמאי: ‼ 135/180 = כל הסכום ששולם («רשום את מלוא הסכום», מדריך 2025 סעיף 53); רשות המסים מפצלת לניכוי ולזיכוי.
    //   268/269 רק כשבוחרים זיכוי במקום ניכוי — לא כאן. החישוב (selfEmployedPension) מוצג במקור השורה.
    const sv = savings.find(s => s.person === p);
    if (sv?.pensionToCutoff && pr.businessTaxable > 0) {
      const pc = pr.pension;
      const penReadings = sumComponent(slice, 'savings.selfAmounts', 'pension', p, evidence).readings;
      add(code2('135', '180', p), p, sv.pensionToCutoff, { ...src(penReadings, 'הפקדות כעמית עצמאי — כל הסכום ששולם'),
        text: `כל הסכום ששולם${pc ? `; לפי החישוב (מסלול ${pc.track === 'B' ? 'ב׳ — עמית מוטב' : 'א׳'}): ניכוי ${nis(pc.deduction)}, זיכוי על ${nis(pc.creditBase + pc.extraCreditBase)}` : ''}. רשות המסים מפצלת` });
      if (pc?.beneficial && sv.pensionTrack === 'A') add(code2('233', '234', p), p, undefined, calcSrc('עמית מוטב שבחר חישוב במסלול א׳ («יחיד»)', ['pen.trackB.tier1Rate']), 'checkbox');
    }
    // נתוני 106 שהדוח צריך לחישוב הטבות קופ״ג (סעיפים 58–59, 75): הכנסה מבוטחת, הפקדות עובד ומעביד, משכורת לקרן השתלמות
    if (pr.salary > 0) {
      const comp = (c: string, label: string) => { const x = sumComponent(slice, 'salary.amounts', c, p, evidence); return { amount: x.amount, source: src(x.readings, label) }; };
      const ins = comp('insured', 'הכנסה מבוטחת — טופס 106'), ee = comp('employeePension', 'הפקדות העובד לקצבה — טופס 106'), er = comp('employerDeposits', 'הפקדות המעביד לקצבה כולל פיצויים — טופס 106'), sfs = comp('studyFundSalary', 'משכורת שבשלה הפקיד המעביד לקרן השתלמות — טופס 106');
      add(code2('244', '245', p), p, ins.amount, ins.source);
      add(code2('045', '086', p), p, ee.amount, ee.source);
      add(code2('248', '249', p), p, er.amount, er.source);
      add(code2('218', '219', p), p, sfs.amount, sfs.source);
      if (ins.amount == null && (sv?.pensionToCutoff ?? 0) > 0 && pr.businessTaxable > 0) gaps.push({ code: `insured_salary_${p}`, text: `הכנסה מבוטחת מטופס 106 (${PERSON_HE[p]}, שדה 244/245) — נדרשת לחישוב הפנסיה כעצמאי` });
    }
    if (sv?.studyFundToCutoff && pr.businessTaxable > 0) add(code2('136', '137', p), p, sv.studyFundToCutoff, src(sumComponent(slice, 'savings.selfAmounts', 'studyFund', p, evidence).readings, 'קרן השתלמות כעצמאי — הסכום ששולם'));
    const life = sumComponent(slice, 'savings.insuranceAmounts', 'life', p, evidence);
    add(code2('036', '081', p), p, life.amount, src(life.readings, 'ביטוח חיים — אישור שנתי'));
    if (life.amount) gaps.push({ code: `life_insurance_${p}`, text: `זיכוי ביטוח חיים (סעיף 45א, ${PERSON_HE[p]}) — הסכום בשדה, אבל הזיכוי לא מחושב כאן; להשלים מקצועית את השפעת המס` });
    const don = sumComponent(slice, 'donations.amount', 'amount', p, evidence);
    add(code2('037', '237', p), p, don.amount, src(don.readings, 'תרומות לפי סעיף 46 — קבלות'));
    if (don.amount && !don.readings.every(r => r.trust === 'verified')) limits.push(`תרומות (${PERSON_HE[p]}): לא כל הסכום מגובה בקבלות שאושרו`);
    const wh = sumComponent(slice, 'payments.withholding', 'amount', p, evidence);
    otherWithheld += wh.amount ?? 0;
    bp(p).otherWithheld += r0(wh.amount ?? 0);
    otherWithheldReadings.push(...wh.readings);
  }
  // ‼ 042 = רק המס שנוכה (רכיב withheld) מכל טופסי 106 — השורות שמרכיבות אותו הן שורות הניכוי, לא הברוטו
  add('042', 'joint', salaryWithheldAll, src(salaryWithheldReadings, 'מס שנוכה ממשכורת — טופסי 106'));
  // 040 (R01, C16): ניכוי במקור מלקוחות, מהכנסות אחרות ומני״ע/דיבידנד (867) — עם שורות המקור שלו
  const w040Readings = [...otherWithheldReadings, ...persons.flatMap(p => cap[p].readings.withheldSecurities)];
  otherWithheld += capAll('withheldSecurities');
  if (capAll('withheldSecurities')) bp('client').otherWithheld += r0(capAll('withheldSecurities'));
  if (otherWithheld) add('040', 'joint', otherWithheld, src(w040Readings, 'ניכוי במקור מלקוחות, מהכנסות אחרות ומני״ע/דיבידנד — אישורי ניכוי ו-867'));
  // שכר דירה לפי מסלול
  const track = client.rentalTaxTrack ?? (client.properties ?? []).find(x => x.isRented)?.rentalTaxTrack;
  if (rentAll.readings.length) {
    if (track === 'exempt') add('332', 'client', rentAll.amount, src(rentAll.readings, 'שכר דירה למגורים — פטור'));
    else if (track === 'flat10') add('284', 'client', Math.max(0, rentAll.amount - ownHousingRent), { ...src(rentAll.readings, 'שכר דירה למגורים — 10%', { sumIsField: !ownHousingRent }), text: `שכר דירה למגורים — 10%${ownHousingRent ? ` (אחרי ניכוי שכר דירה למגורים ${nis(ownHousingRent)})` : ''}` });
    else gaps.push({ code: 'rent_regular', text: 'שכר דירה במסלול הרגיל — נספח ב׳ (1321) עם הוצאות ופחת (1342) לא נתמך; מכינים מחוץ למערכת' });
  }
  // שוק ההון לכל אדם: 25% רק אחרי הכרעת המשרד; 15% — השיעור קבוע בשדה. 043 = מס שנוכה על ריבית פיקדונות (ו«withheld» בלי פיצול).
  let w043 = 0; const w043Readings: FactReading[] = [];
  for (const p of persons) {
    const c = cap[p];
    if (c.sum.interest + c.sum.dividend > 0 && capitalDecided) {
      add(code2('242', '342', p), p, c.sum.interest, src(c.readings.interest, 'ריבית על פיקדונות — 25% (לפי הכרעת המשרד)'));
      add(code2('241', '341', p), p, c.sum.dividend, src(c.readings.dividend, 'דיבידנד — 25% (לפי הכרעת המשרד)'));
    }
    add(code2('217', '317', p), p, c.sum.depositInterest15, src(c.readings.depositInterest15, 'ריבית על פיקדונות ותוכניות חיסכון — 15% (טופס 867)'));
    add(code2('211', '311', p), p, c.sum.securitiesInterest15, src(c.readings.securitiesInterest15, 'ריבית ורווחים מני״ע — 15% (טופס 867)'));
    if (c.sum.interest + c.sum.dividend > 0 && !capitalDecided) continue; // המס שנוכה על 25% נכנס רק עם ההכרעה (כמו קודם)
    w043 += c.sum.withheld + c.sum.withheldDeposit; w043Readings.push(...c.readings.withheld, ...c.readings.withheldDeposit);
  }
  if (w043) { add('043', 'joint', w043, src(w043Readings, 'ניכוי במקור מריבית — לפי טופסי 867')); bp('client').interestWithheld = r0(w043); }
  for (const c of usable) for (const f of c.fields) add(f.code, c.person, f.amount, { kind: 'completion', completionId: c.id, text: `השלמה מקצועית: ${c.justification}` });
  // ── 6ב. ערכים ידניים מעל החישוב — «#» ומנומקים (תוכנית הליווי §1.5). ‼ משנים את השדה בטופס, לא את חישוב המס.
  for (const ov of draft.overrides ?? []) {
    if (!ov.justification?.trim()) { limits.push(`ערך ידני לקוד ${ov.code} בלי נימוק — לא נכנס`); continue; }
    const i = fields.findIndex(f => f.code === ov.code && f.person === ov.person && f.kind === 'amount');
    const prev = i >= 0 ? fields[i] : undefined;
    const source: FieldSource = { kind: 'manual', text: `# ערך ידני: ${ov.justification.trim()}`, computed: prev?.amount ?? 0, lines: prev?.source.lines, sumIsField: false };
    if (prev) fields[i] = { ...prev, amount: r0(ov.amount), source };
    else { const ci = codeInfo(ov.code, ov.person); fields.push({ code: ov.code, part: ci.part, section: ci.section, label: ci.label, person: ov.person, kind: 'amount', amount: r0(ov.amount), source, ambiguous: ci.ambiguous || undefined }); }
    limits.push(`# ${ov.code}: ערך ידני ${nis(ov.amount)} במקום המחושב ${nis(prev?.amount ?? 0)} — ${ov.justification.trim()}. חישוב המס לא השתנה מהערך הידני`);
  }

  // ── 7. נספחים ──
  const annexes: AnnexStatus[] = [];
  let annex1321: ReturnOutputs['annex1321'];
  if (track === 'flat10' && rentAll.readings.length) {
    const r = draft.rent1321 ?? {};
    const props = (client.properties ?? []).filter(x => x.isRented && (x.rentalTaxTrack ?? client.rentalTaxTrack) === 'flat10').map(x => ({ id: x.id, address: [x.address, (x as { city?: string }).city].filter(Boolean).join(', '), ...(r.props?.[x.id] ?? {}) }));
    const problems: string[] = [];
    if (r.singleApartment === undefined) problems.push('«דירה יחידה» — לסמן כן/לא');
    for (const p of props) { if (!p.address) problems.push('כתובת הדירה חסרה בכרטיס'); if (!p.block?.trim() || !p.parcel?.trim()) problems.push(`${p.address || 'דירה'}: גוש וחלקה`); }
    annex1321 = { gross: r0(rentAll.amount), ownHousingRent: r0(ownHousingRent), net: r0(Math.max(0, rentAll.amount - ownHousingRent)), singleApartment: r.singleApartment, props, complete: problems.length === 0, problems };
    annexes.push({ formId: '1321', title: annexTitle('1321'), reason: 'שכר דירה למגורים במסלול 10% — סעיף 3', status: problems.length ? 'partial' : 'filled',
      rows: [{ label: 'הכנסה מהשכרת דירת מגורים (10%)', amount: annex1321.gross }, { label: 'שכר דירה ששולם למגורים (מופחת, עד 90,000)', amount: annex1321.ownHousingRent }, { label: 'הכנסה בניכוי הוצאות ← 284', amount: annex1321.net }],
      note: problems.join(' · ') || undefined });
    problems.forEach((t, i) => gaps.push({ code: `annex1321_${i}`, kind: 'data', text: `נספח 1321: ${t}` }));
  }
  const annex1320: NonNullable<ReturnOutputs['annex1320']> = [];
  for (const l of lines.filter(x => x.source === 'business')) {
    const m = out.micro.find(x => x.lineId === l.id);
    if (m && m.chosen !== 'books') { annexes.push({ formId: '1320', title: annexTitle('1320'), reason: `${l.label}: עסק זעיר — שדה 150 = המחזור פחות הניכוי; נספח 1320 לא נדרש למסלול`, person: l.person, entityRef: l.entityRef, status: 'filled', rows: [] }); continue; }
    const books = draft.books?.[l.entityRef!];
    const profitFact = sumComponent(slice, 'business.profit', 'profit', l.person, evidence, l.entityRef).amount;
    if (!books) {
      annexes.push({ formId: '1320', title: annexTitle('1320'), reason: `${l.label} (${PERSON_HE[l.person]}) — נספח לכל עסק`, person: l.person, entityRef: l.entityRef, status: 'missing', rows: [],
        note: 'חסרות שורות רווח והפסד לפי הספרים — לקלוט רו״ה או להזין' });
      gaps.push({ code: `annex1320_${l.entityRef}`, kind: 'data', text: `נספח 1320 (${l.label}): לקלוט רו״ה או להזין את שורות הנספח` });
      continue;
    }
    const c13 = compute1320(books, { profitFact, label: l.label });
    annex1320.push({ entityRef: l.entityRef!, label: l.label, lines: c13.lines, complete: c13.complete, problems: c13.problems });
    annexes.push({ formId: '1320', title: annexTitle('1320'), reason: `${l.label} (${PERSON_HE[l.person]}) — נספח לכל עסק`, person: l.person, entityRef: l.entityRef,
      status: c13.complete ? 'filled' : 'partial',
      rows: LINES_1320.filter(x => c13.lines[x.key] != null && (c13.lines[x.key] !== 0 || x.derived)).map(x => ({ label: x.label, amount: c13.lines[x.key], source: { kind: 'calculation' as const, text: x.derived ? 'מחושב' : 'מהספרים (רו״ה / הזנת משרד)' } })),
      note: c13.problems.join(' · ') || undefined });
    for (const pr of c13.problems) gaps.push({ code: `annex1320_${l.entityRef}_${gaps.length}`, kind: /שונה מהרווח/.test(pr) ? 'control' : 'data', text: `נספח 1320 (${l.label}): ${pr}` });
    if ((c13.lines['17'] ?? 0) > 0) gaps.push({ code: `annex1342_${l.entityRef}`, kind: 'annex', text: `פחת (שורה 17, ${l.label}) — נספח 1342 לא נתמך` });
    if ((c13.lines['21'] ?? 0) > 0) gaps.push({ code: `annex1343_${l.entityRef}`, kind: 'annex', text: `ניכוי נוסף בשל פחת (שורה 21, ${l.label}) — נספח 1343 לא נתמך` });
  }
  const capReadingsAll = persons.flatMap(p => CAP_KEYS.flatMap(k => cap[p].readings[k]));
  if (capReadingsAll.length) annexes.push({ formId: '867', title: 'טופסי 867 (ניכוי במקור משוק ההון)', reason: 'מצורפים לדוח', status: capReadingsAll.every(r => r.trust === 'verified') ? 'filled' : 'partial', rows: [] });
  for (const u of UNSUPPORTED) if (u.annex && screenerYes(slice, u.itemKey)) annexes.push({ formId: u.annex, title: annexTitle(u.annex), reason: u.text, status: 'missing', rows: [], note: 'לא נתמך' });

  // ── 8. בקרות התאמה ──
  const controls: ReturnControl[] = [];
  // ‼ הבקרות משוות את מה שנגזר מהעובדות למקור שלהן. השלמה מקצועית היא מקור נפרד ומתועד — לא נספרת כאן
  //   (אחרת משכורת שהושלמה מקצועית «שוברת» את בקרת 106 שלא הכירה אותה).
  // ‼ ערך ידני (#) אינו «שובר» בקרה: הבקרה משווה את המחושב (source.computed) למקורו
  const fieldSum = (codes: string[]) => fields.filter(f => codes.includes(f.code) && f.source.kind !== 'completion').reduce((a, f) => a + (f.source.kind === 'manual' ? f.source.computed ?? 0 : f.amount ?? 0), 0);
  const salaryLinesSum = lines.filter(l => l.source === 'salary').reduce((a, l) => a + (l.actualToCutoff ?? 0), 0);
  controls.push({ id: 'salary_106', text: 'משכורת: 158 + 172 = סך הברוטו בטופסי 106', ok: lines.some(l => l.source === 'salary') ? Math.abs(fieldSum(['158', '172']) - salaryLinesSum) <= 1 : null, detail: `${nis(fieldSum(['158', '172']))} מול ${nis(salaryLinesSum)}` });
  controls.push({ id: 'withheld_106', text: 'מס שנוכה ממשכורת: 042 = סך הניכוי בטופסי 106', ok: lines.some(l => l.source === 'salary') ? Math.abs(fieldSum(['042']) - salaryWithheldAll) <= 1 : null, detail: nis(salaryWithheldAll) });
  const bizTaxable = out.persons.reduce((a, p) => a + p.businessTaxable, 0);
  controls.push({ id: 'business_150', text: 'עסק: 150 + 170 = ההכנסה החייבת מעסק בחישוב (רווח + תיאומים, או המחזור פחות ניכוי זעיר)', ok: lines.some(l => l.source === 'business') ? Math.abs(fieldSum(['150', '170']) - bizTaxable) <= 1 : null, detail: `${nis(fieldSum(['150', '170']))} מול ${nis(bizTaxable)}` });
  for (const a of annex1320) {
    const l = lines.find(x => x.entityRef === a.entityRef && x.source === 'business');
    const pr = l ? out.persons.find(x => x.person === l.person) : undefined;
    const want = l ? (l.actualToCutoff ?? 0) + draft.adjustments.filter(x => x.lineId === l.id).reduce((s, x) => s + x.amount, 0) : undefined;
    if (want != null && pr) controls.push({ id: `annex1320_22_${a.entityRef}`, text: `נספח 1320 (${a.label}): שורה 22 = ההכנסה מהעסק בשדה 150/170`, ok: Math.abs(a.lines['22'] - want) <= 1, detail: `${nis(a.lines['22'])} מול ${nis(want)}` });
    if (l?.turnoverToCutoff != null) controls.push({ id: `annex1320_1_${a.entityRef}`, text: `נספח 1320 (${a.label}): שורה 1 מול המחזור (238/239) — לבדיקה`, ok: Math.abs((a.lines['1'] ?? 0) - l.turnoverToCutoff) <= 1 ? true : null, detail: `${nis(a.lines['1'] ?? 0)} מול ${nis(l.turnoverToCutoff)}` });
  }
  for (const m of out.micro) {
    controls.push({ id: `micro_${m.lineId}`, text: 'עסק זעיר: מחזור (238) בתקרה, ובלי 030/089 במסלול', ok: m.chosen === 'books' || (m.status === 'within' && !fields.some(f => f.code === '030' || f.code === '089')), detail: `${nis(m.annualTurnover)} מול תקרה ${nis(m.ceiling)}` });
  }
  // ‼ «שדה בלי מקור» (תוכנית הליווי §2.6): סכום בלי שורות מקור, בלי כלל חישוב, בלי השלמה ובלי ערך ידני מנומק — חוסם.
  const unsourced = fields.filter(f => f.kind === 'amount' && (f.amount ?? 0) !== 0
    && !(f.source.lines?.length || (f.source.kind === 'calculation' && (f.source.ruleIds?.length || f.source.text)) || f.source.kind === 'completion' || f.source.kind === 'card' || f.source.kind === 'manual'));
  controls.push({ id: 'sources', text: 'שדה בלי מקור: לכל סכום בטיוטה יש שורות מקור (מסמך / תשובה), כלל חישוב, השלמה מקצועית או ערך ידני מנומק (#)', ok: unsourced.length === 0, detail: unsourced.length ? unsourced.map(f => `${f.code} (${f.label.slice(0, 30)})`).join(', ') : 'כולם' });
  // ‼ «Σ שורות ≠ שדה»: שדה שסכומו אמור להיות סכום שורותיו — נבדק; שדה נגזר (אחרי ניכוי, ערך ידני) אינו נבדק כאן
  const sumMismatch = fields.filter(f => f.kind === 'amount' && f.source.lines?.length && f.source.sumIsField !== false
    && Math.abs(f.source.lines.reduce((a, l) => a + l.amount, 0) - (f.amount ?? 0)) > 1);
  controls.push({ id: 'lines_sum', text: 'סכום שורות המקור = השדה (לכל שדה שמורכב משורות)', ok: fields.some(f => f.source.lines?.length) ? sumMismatch.length === 0 : null,
    detail: sumMismatch.length ? sumMismatch.map(f => `${f.code}: ${nis(f.source.lines!.reduce((a, l) => a + l.amount, 0))} מול ${nis(f.amount ?? 0)}`).join(' · ') : `${fields.filter(f => f.source.lines?.length).length} שדות` });
  const ambiguousCodes = fields.filter(f => f.ambiguous).map(f => f.code);
  if (ambiguousCodes.length) limits.push(`קודים שמופיעים בטופס יותר מפעם אחת לאותו טור — התווית נבחרה לפי סוג השדה, לבדיקה: ${[...new Set(ambiguousCodes)].join(', ')}`);
  if (estimate) {
    for (const p of out.persons) {
      const e = estimate.outputs.persons.find(x => x.person === p.person);
      if (!e || !e.incomeTax) continue;
      const d = p.incomeTax - e.incomeTax;
      controls.push({ id: `estimate_${p.person}`, text: `מול הערכת המס (גרסה ${estimate.version}, ${PERSON_HE[p.person]}): פער עד 10% — לבדיקה, לא חוסם`, ok: Math.abs(d) <= Math.max(1000, e.incomeTax * 0.1), detail: `דוח ${nis(p.incomeTax)} · הערכה ${nis(e.incomeTax)} · פער ${nis(d)}` });
    }
  }
  const failed = controls.filter(c => c.ok === false && !c.id.startsWith('estimate_'));

  // ── 9. סיכום ──
  const liability = out.household.annualLiability + manualTax;
  const withheld = out.household.withheldAnnual;
  const advancesPaid = out.household.advancesPaid;
  const balance = liability - withheld - advancesPaid;

  // ── 10. בדיקת כיסוי לכל שדה ונספח בטופס — ללקוח הזה ──
  const bizPersons = persons.filter(p => lines.some(l => l.person === p && l.source === 'business'));
  const salaryPersons = persons.filter(p => lines.some(l => l.person === p && l.source === 'salary'));
  const formCoverage = buildCoverage({ client, year, persons, facts, draft, fields, balance, bizPersons, salaryPersons, gaps, annex1320, annex1321, familyInYear });
  for (const pf of formCoverage.produced) if (!fields.some(f => f.code === pf.code && f.person === pf.person)) fields.push(pf);

  // ‼ סוג כל פער קובע מה סוגר אותו. השלמה מקצועית — רק data/calc, ורק כשכל קודי השדות שלה מופקים (DRAFT_FILL_1301)
  for (const g of gaps) if (!(g as ReturnGap).kind) (g as ReturnGap).kind = kindOf(g.code);
  const typed = gaps as ReturnGap[];
  const closed = new Set<string>();
  for (const c of approvedCompletions) {
    const g = typed.find(x => x.code === c.gap);
    const badCodes = c.fields.map(f => f.code).filter(cd => !DRAFT_FILL_1301[cd]);
    if (!g) { limits.push(`השלמה מקצועית ל«${c.gap}» — אין פער כזה`); continue; }
    if (g.kind !== 'data' && g.kind !== 'calc') { limits.push(`השלמה מקצועית ל«${g.text}» לא נכנסה: פער מסוג ${KIND_HE[g.kind]} נסגר רק במימוש, לא בהשלמה`); continue; }
    if (badCodes.length) { limits.push(`השלמה מקצועית ל«${g.text}» לא נכנסה: הקודים ${badCodes.join(', ')} אינם בשדות שהמערכת מפיקה`); continue; }
    closed.add(c.gap);
  }
  const openTyped = typed.filter(g => !closed.has(g.code));
  // ‼ מקור שבתיק בלי סכום לשנה (או בלי המס שנוכה) — החבות והיתרה לא ידועות; לא מציגים 0 או «מאוזן»
  const incomplete = openTyped.some(g => /^(salary_|business_|rent$)/.test(g.code));
  // חוסרים מבדיקת הכיסוי — מקובצים לפי דרך ההשלמה
  const covGaps: ReturnGap[] = [];
  const miss = formCoverage.rows.filter(r => r.state === 'missing');
  const byFix = (f: string) => miss.filter(r => r.fix === f);
  if (byFix('declaration').length) covGaps.push({ code: 'cov_declarations', kind: 'data', text: `הצהרות בהגשה: ${byFix('declaration').length} לסמן כן/לא (${byFix('declaration').slice(0, 3).map(r => r.label.slice(0, 30)).join(' · ')}${byFix('declaration').length > 3 ? '…' : ''})` });
  if (byFix('identity').length) covGaps.push({ code: 'cov_identity', kind: 'data', text: `פרטים שהכרטיס לא מחזיק: ${[...new Set(byFix('identity').map(r => r.source.replace(/^חסר: /, '')))].slice(0, 4).join(' · ')}` });
  if (byFix('refund').length) covGaps.push({ code: 'cov_refund', kind: 'data', text: 'חשבון בנק להחזר — על שם בן הזוג הרשום' });
  if (byFix('card').length) covGaps.push({ code: 'cov_card', kind: 'data', text: `פרטים חסרים בכרטיס: ${[...new Set(byFix('card').map(r => r.label.replace(/^״בן הזוג הרשום״ - /, '')))].slice(0, 4).join(' · ')}` });
  for (const src2 of [...new Set(byFix('yearFact').map(r => r.source))]) covGaps.push({ code: `cov_year_${covGaps.length}`, kind: 'data', text: src2 });
  const notSup = [...new Set(formCoverage.rows.filter(r => r.state === 'notSupported').map(r => r.source))].map((t, i): ReturnGap => ({ code: `cov_unsupported_${i}`, kind: 'mapping', text: t }));
  const annexUnsupported = formCoverage.annexes.filter(a => a.need === 'required' && a.produced === 'none' && a.formId !== '1320' && !typed.some(g => g.code.startsWith(`annex${a.formId}`)))
    .map((a, i): ReturnGap => ({ code: `cov_annex_${a.formId}_${i}`, kind: 'annex', text: `נספח ${a.formId} (${a.reason}) — ${a.note ?? 'לא מופק'}` }));
  const unsupported: ReturnGap[] = [...openTyped.filter(g => ['annex', 'mapping', 'form'].includes(g.kind)), ...notSup, ...annexUnsupported]
    .filter((g, i, all) => all.findIndex(x => x.text === g.text) === i);
  const blockers: ReturnGap[] = [...openTyped.filter(g => !['annex', 'mapping', 'form'].includes(g.kind)), ...covGaps,
    ...failed.map((c): ReturnGap => ({ code: `control_${c.id}`, kind: 'control', text: `בקרה נכשלה: ${c.text} (${c.detail})` }))];
  const status: ReturnOutputs['status'] = blockers.length ? 'internalDraft' : unsupported.length || !formOk ? 'partialWorksheet' : 'completeWorksheet';
  const covered = estimate ? `הערכת המס (גרסה ${estimate.version}) כיסתה עד סוף חודש ${estimate.cutoffMonth}; הדוח נשען על נתונים סופיים לשנה כולה` : 'אין הערכת מס מאושרת לשנה — הדוח נבנה מהנתונים הסופיים';
  const balText = balance > 0 ? `לתשלום כ-${nis(balance)}` : balance < 0 ? `להחזר כ-${nis(-balance)}` : 'מאוזן';
  return {
    taxYear: year, formVersionId: formOk ? `1301@${year}` : '1301@2025(מבנה בלבד)', status,
    persons: out.persons,
    household: { liability: r0(liability), withheld: r0(withheld), advancesPaid: r0(advancesPaid), manualTax: r0(manualTax), balance: r0(balance), incomplete,
      explain: [`חבות ${nis(liability)}${manualTax ? ` (כולל ${nis(manualTax)} מהשלמות מקצועיות)` : ''} − ניכוי במקור ${nis(withheld)} − מקדמות ${nis(advancesPaid)} = ${balance > 0 ? `לתשלום ${nis(balance)}` : balance < 0 ? `להחזר ${nis(-balance)}` : 'מאוזן'}`] },
    fields: fields.sort((a, b) => a.part.localeCompare(b.part, 'he') || a.code.localeCompare(b.code)),
    annexes, controls, gaps: typed, blockers, unsupported, completions: approvedCompletions.filter(c => closed.has(c.gap)),
    coverage: { estimateVersion: estimate?.version, estimateCutoff: estimate?.cutoffMonth, text: covered },
    formCoverage, annex1320, annex1321, byPerson,
    micro: out.micro, limits, usedRules: out.usedRules, rulesetVersion: out.rulesetVersion,
    nextAction: blockers.length ? `להשלים: ${blockers[0].text}${blockers.length > 1 ? ` (ועוד ${blockers.length - 1})` : ''}`
      : !formOk ? `גיליון עבודה בלבד — טופס ${year} לא ממופה`
      : unsupported.length ? `גיליון עבודה חלקי — ${unsupported.length} חלקים שהמערכת לא מפיקה ללקוח הזה (${unsupported[0].text}). לא «מוכן להגשה»; ההשלמה — מחוץ למערכת או אחרי מימוש`
      : `לסקור ולאשר — ${balText}. אחרי האישור: הקלדה במערכת המקוונת לפי הגיליון (או קובץ לפי מבנה רשות המסים), חתימת הלקוח והגשה — ידנית`,
  };
}

const KIND_HE: Record<GapKind, string> = { data: 'נתון חסר', calc: 'חישוב', decision: 'הכרעה', control: 'בקרה', annex: 'נספח', mapping: 'מיפוי', form: 'טופס' };
function kindOf(code: string): GapKind {
  if (code === 'form_version') return 'form';
  if (/^(capital_gains|sales|foreign|companies|trust|partnership|nonResident|financialInstitution|reportable|carryForward|rent_regular)$/.test(code)) return 'annex';
  if (code === 'niBenefits') return 'mapping';
  if (/^(capital_rates|rule_not_verified|pension_age50)/.test(code)) return 'decision';
  if (/^(life_insurance_|rent_track_mixed|rent_exempt_couple|spouse_card_missing)/.test(code)) return 'calc';
  if (/^control_/.test(code)) return 'control';
  return 'data';
}

/** טיוטה ריקה לדוח (לפני שנשמרה גרסה) — למפת הטופס ולפתיחה ראשונה. */
export function emptyDraft(client: Client, year: number, preparedOn: string): ReturnDraft {
  return { taxYear: year, preparedOn, persons: defaultPersons(client, year), completions: [], adjustments: [], micro: {}, decisions: [] };
}

/** אומדן התחלתי של האנשים בדוח: הלקוח, ובן/בת הזוג כשנשוי/אה **בשנת הדוח** ויש לו/ה הכנסה בתיק. */
export function defaultPersons(client: Client, year?: number): Person[] {
  const spouseHasIncome = (client.employers ?? []).some(e => (e as { belongsToSpouse?: boolean }).belongsToSpouse)
    || (client.businesses ?? []).some(b => (b as { belongsToSpouse?: boolean }).belongsToSpouse);
  const married = (year ? clientForTaxYear(client, year) : client).familyStatus === 'married';
  return married && client.spouse && spouseHasIncome ? ['client', 'spouse'] : ['client'];
}

export { isNum, trustOf };

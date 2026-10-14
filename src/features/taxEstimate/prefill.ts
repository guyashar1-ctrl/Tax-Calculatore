// ─── הערכת מס: טיוטה ראשונה מהתיק (שלב 3) ────────────────────────────────────
// ‼ מה שידוע בשנת המס (עובדות שאושרו) נכנס כשורה עם הפניה למקור — עובדה, מסמך. מה שלא ידוע
//   נשאר ריק (חסר), לא 0. ישויות מהכרטיס (עסקים, מעסיקים) יוצרות שורה גם כשאין עדיין סכום.
// ‼ סכום שנשמר לתקופה אחרת מחודש החתך (למשל עד יוני כשהחתך ספטמבר) לא נכנס כ«בפועל עד החתך»;
//   הוא מוצג כרמז, כדי שהמשרד יחליט.

import type { Client } from '../../types';
import type { Evidence, YearFact } from '../taxYear/types';
import type { EstimateDraft, IncomeLine, ItAdvanceSetup, NiAdvanceSetup, SourceRef } from './types';
import { readComponents } from '../annualReturn/facts';
import { accountSpan, answeredRelevance, businessSpan, dateRange, employerSpan, periodOfRequest, propertySpan, relevanceFor, spanText } from '../taxYear/temporal';
import type { EntitySpan, Period, Relevance } from '../taxYear/temporal';

/**
 * תחולה בזמן לשורת הערכה (13.10.2026) — מהחוזה המשותף `taxYear/temporal.ts`, בלי מנגנון שני.
 * ‼ תקופת האמת: 1.1 עד סוף החתך. תקופת התחזית: מהחודש שאחרי החתך עד 31.12.
 * ‼ ישות פעילה בתיק (בלי תאריך סיום) — התחזית מניחה שהיא נמשכת; זו הנחת התחזית, לא עובדה.
 * ‼ תשובה מפורשת לשנה (period.property / period.account) קובעת רק «לא הייתה בשנה»; «חלק מהשנה» לא אומר
 *   איזה חלק — חוזרים לתאריכים בתיק. למעסיק ולעסק אין פריט period.* — רק התיק.
 */
export function linePeriod(span: EntitySpan, y: number, m: number, explicit: Relevance | null): NonNullable<IncomeLine['period']> {
  const text = spanText(span, { from: 'מ-', to: 'עד' }) || undefined;
  if (explicit === 'out') return { actual: 'out', forecast: 'out', span: text };
  const actualP: Period = periodOfRequest('estimate', y, { cutoffMonth: m });
  const actual: Relevance = m <= 0 ? 'in' : relevanceFor(actualP, span.start, span.end);
  let forecast: Relevance = 'out';
  if (m < 12) {
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`, to = `${y}-12-31`;
    const st = dateRange(span.start);
    if (st && st.lo > to) forecast = 'out';
    else if (span.end === 'open' || span.end === undefined) forecast = 'in';
    else {
      const e = dateRange(span.end);
      forecast = !e ? 'unknown' : e.hi < from ? 'out' : e.lo >= from ? 'in' : 'unknown';
    }
  }
  return { actual, forecast, span: text };
}
const both = (ps: NonNullable<IncomeLine['period']>[], k: 'actual' | 'forecast'): Relevance =>
  ps.some(x => x[k] === 'in') ? 'in' : ps.some(x => x[k] === 'unknown') ? 'unknown' : 'out';
const gone = (per: NonNullable<IncomeLine['period']>) => per.actual === 'out' && per.forecast === 'out';

/** הרכיב ש«בפועל עד החתך» קורא בכל מפתח (שאר הרכיבים — ניכוי, מחזור — נקראים בנפרד). */
const MAIN_COMPONENTS: Record<string, string[]> = {
  'salary.amounts': ['gross'], 'business.profit': ['profit'], 'rent.income': ['income'], 'rent.incomeTotal': ['income'],
  'capital.amounts': ['gains', 'dividend', 'interest'],
};
const amountOf = (f: YearFact, names: string[]): number | undefined => {
  const cs = readComponents(f).filter(c => names.includes(c.component));
  return cs.length ? cs.reduce((x, c) => x + c.amount, 0) : undefined;
};

/**
 * מקדמות מהכרטיס (קריאת שע״ם / ב״ל שכבר נשמרה ביישור הקו): השיעור והתדירות במס הכנסה, המקדמה
 * וההכנסה בב״ל. ‼ «נבדק בתאריך» נלקח רק כשהשדה הגיע מהרשות (מועד הסנכרון); ערך שהוזן ביד בכרטיס
 * נכנס בלי תאריך בדיקה — והמשרד מאשר אותו מול מסך הרשות. תשלומים לפי תקופה אינם בכרטיס.
 */
export function cardAdvances(client: Client): { it?: ItAdvanceSetup; ni?: NiAdvanceSetup; niSpouse?: NiAdvanceSetup } {
  const meta = (k: string) => client.fieldMeta?.[k];
  // ‼ רק מקור שהוא הרשות עצמה נחשב קריאה. שאלון (הלקוח מסר) או ייבוא — לא: עד שהמשרד בודק מול מסך הרשות
  //   ורושם תאריך, אין «נבדק». (עד 13.10.2026 כל מקור שאינו manual נחשב קריאה מהרשות — גם תשובת לקוח.)
  const AUTHORITY_SOURCES = new Set(['shaam', 'authority', 'institution_alignment', 'automation']);
  const fromAuthority = (k: string) => { const fm = meta(k); return fm?.syncedAt && fm.source && AUTHORITY_SOURCES.has(fm.source) ? fm.syncedAt.slice(0, 10) : undefined; };
  const viaOf = (k: string): ItAdvanceSetup['via'] => fromAuthority(k) ? 'automation' : meta(k)?.source === 'questionnaire' ? 'client' : 'manual';
  const note = (k: string, what: string) => {
    const fm = meta(k);
    const src = fm?.source ? ` (${fm.source === 'shaam' ? 'שע״ם' : fm.source === 'authority' ? 'הרשות' : fm.source === 'manual' ? 'הוזן ידנית' : fm.source})` : '';
    const at = fm?.syncedAt ? ` · ${fm.syncedAt.slice(8, 10)}.${fm.syncedAt.slice(5, 7)}.${fm.syncedAt.slice(0, 4)}` : '';
    return `${what} מהכרטיס${src}${at}`;
  };
  const out: ReturnType<typeof cardAdvances> = {};
  // ‼ «לא נדרש במקדמה» / «בוטלה» נשמרים בכרטיס כ-0% בלי תדירות (החלטת מוצר 2.9.2026) — זה «אין מקדמות», לא «0% מהמחזור, חודשי»
  //   (research/it134-esna-evidence-2026-10-13.md §3). ‼ שיעור שלא מוצג אינו 0%.
  if (client.pitAdvancePercent === 0 && !client.pitAdvanceFrequency) {
    const raw = (meta('pitAdvancePercent') as { note?: string } | undefined)?.note;
    out.it = { via: viaOf('pitAdvancePercent'), readOn: fromAuthority('pitAdvancePercent'), method: 'none', frequency: 1, periods: [],
      evidence: { note: `${note('pitAdvancePercent', 'מצב המקדמה')}: אין מקדמה פעילה («לא נדרש» או «בוטלה»)${raw ? ` — ${raw}` : ''}` } };
  } else if (client.pitAdvancePercent != null) {
    out.it = { via: viaOf('pitAdvancePercent'), readOn: fromAuthority('pitAdvancePercent'), method: 'turnoverRate', ratePct: client.pitAdvancePercent,
      frequency: client.pitAdvanceFrequency === 'bi_monthly' ? 2 : 1, periods: [], evidence: { note: note('pitAdvancePercent', 'שיעור המקדמה') } };
  }
  const ni = (adv: keyof Client & string, basis: keyof Client & string): NiAdvanceSetup | undefined => {
    const a = client[adv] as number | undefined, b = client[basis] as number | undefined;
    if (a == null && b == null) return undefined;
    return { via: viaOf(adv), readOn: fromAuthority(adv), monthlyAdvance: a, basisMonthlyIncome: b, source: { note: note(adv, 'מקדמת ב״ל') } };
  };
  out.ni = ni('niAdvanceMonthly', 'niIncomeBasisMonthly');
  out.niSpouse = ni('spouseNiAdvanceMonthly', 'spouseNiIncomeBasisMonthly');
  return out;
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const cutoffEnd = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-${String(lastDay(y, m)).padStart(2, '0')}`;

export interface PrefillResult {
  draft: EstimateDraft;
  /** העובדות שנכנסו, עם הערך — נשמר עם הגרסה. */
  inputFacts: { id: string; value: unknown }[];
  /** רמזים שלא נכנסו לחישוב (תחזית במילים, חד־פעמי במילים, סכום לתקופה אחרת). */
  hints: { lineId?: string; text: string }[];
}

export function buildDraft(input: { client: Client; taxYear: number; cutoffMonth: number; facts: YearFact[]; evidence: Evidence[]; today: string }): PrefillResult {
  const { client, taxYear: y, cutoffMonth: m, facts, evidence, today } = input;
  const accepted = facts.filter(f => f.status === 'accepted' && f.answer === 'value' && f.taxYear === y);
  const end = cutoffEnd(y, Math.max(1, m));
  const inputFacts: PrefillResult['inputFacts'] = [];
  const hints: PrefillResult['hints'] = [];
  const src = (f: YearFact): SourceRef => {
    const ev = f.evidenceId ? evidence.find(e => e.id === f.evidenceId) : undefined;
    // ‼ עובדה מאושרת — המשרד אישר אותה; המקור שלה הוא מה שהלקוח רואה בסיכום («לפי מה שמסרת» / «לפי המסמך»)
    const provenance: SourceRef['provenance'] = f.evidenceId || f.source === 'document' ? 'document'
      : f.source === 'portal' || f.source === 'legacy_questionnaire' ? 'client'
      : f.source === 'automation' ? 'authority' : f.source === 'import' ? 'import' : 'office';
    return { factId: f.id, evidenceId: f.evidenceId, documentId: ev?.documentId, provenance, checkedAt: (f.decidedAt ?? f.createdAt)?.slice(0, 10) };
  };
  /**
   * סכום «בפועל עד החתך» לישות — רק כשהתקופה מסתיימת בחתך.
   * ‼ אותו קורא רכיבים כמו הדוח השנתי (readComponents): ערך יכול להיות מספר או רכיבים בשם (ממשק המשרד, העברה
   *   מהכרטיס, שאלון ישן). קודם נקרא רק מספר — ורכיבים מהכרטיס נעלמו מההערכה בשקט.
   */
  const actualFor = (itemKey: string, entityRef?: string, role?: string) => {
    const main = MAIN_COMPONENTS[itemKey] ?? ['amount'];
    const fs = accepted.filter(f => f.itemKey === itemKey && (entityRef == null || f.entityRef === entityRef) && (role == null || f.subjectRole === role) && readComponents(f).length > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const want = m === 12 ? `${y}-12-31` : end;
    const inPeriod = fs.filter(f => (f.periodTo ?? `${y}-12-31`) === want);
    const other = fs.find(f => !inPeriod.includes(f));
    // רכיב — מהעובדה האחרונה בתקופה שיש בה אותו (ברוטו ומס שנוכה יכולים להגיע בעובדות נפרדות)
    const get = (names: string[]) => {
      const f = inPeriod.find(x => amountOf(x, names) != null);
      if (f && !inputFacts.some(i => i.id === f.id)) inputFacts.push({ id: f.id, value: f.value });
      return f ? amountOf(f, names) : undefined;
    };
    const fact = inPeriod.find(x => amountOf(x, main) != null);
    if (!fact && other) hints.push({ lineId: entityRef, text: `${itemKey}: נמצא סכום לתקופה עד ${other.periodTo ?? 'סוף השנה'} — לא עד סוף החתך; לא נכנס` });
    const amount = fact ? get(main) : undefined;
    return fact && amount != null ? { fact, value: amount, get } : undefined;
  };
  const text = (itemKey: string, entityRef?: string) => accepted.find(f => f.itemKey === itemKey && (entityRef == null || f.entityRef === entityRef) && typeof f.value === 'string');

  const lines: IncomeLine[] = [];
  // ‼ «לא קיים בשנה» לפי התאריכים בתיק — אבל סגירה אינה בהכרח היעדר תקבולים מאוחרים (גבייה, משכורת אחרונה, פיצויים)
  const periodHint = (label: string, per: NonNullable<IncomeLine['period']>) =>
    hints.push({ text: `${label}: לפי התיק לא פעיל ב-${y}${per.span ? ` (${per.span})` : ''} — לא נכנס להערכה. אם התקבלו ב-${y} תקבולים מאוחרים — להוסיף שורה; אם התאריך שגוי — לתקן בתיק` });
  // ‼ ישות שלא הייתה בתקופת האמת (התחילה אחרי החתך) — 0 ידוע, עם הסבר; לא «חסר»
  const zeroBefore = (per: NonNullable<IncomeLine['period']>) => (per.actual === 'out' && m > 0
    ? { actualToCutoff: 0, actualSource: { note: `לא פעיל עד סוף החתך לפי התיק${per.span ? ` (${per.span})` : ''}`, provenance: 'office' } as SourceRef, actualFrom: 'office' as const } : {});
  for (const b of client.businesses ?? []) {
    // ‼ עסק שנסגר במהלך השנה עדיין שייך להערכה של השנה — לא מדלגים לפי «סגור» של היום
    const per = linePeriod(businessSpan(b as Parameters<typeof businessSpan>[0]), y, m, null);
    if (gone(per)) { periodHint(b.name || 'עסק', per); continue; }
    const person = (b as { belongsToSpouse?: boolean }).belongsToSpouse ? 'spouse' as const : 'client' as const;
    const f = actualFor('business.profit', b.id);
    const turnover = f?.get(['turnover']), customerWithheld = f?.get(['customerWithholding']);
    const fc = text('business.forecast', b.id);
    const oo = text('business.oneOffs', b.id);
    if (oo) hints.push({ lineId: `biz-${b.id}`, text: `חד־פעמי לפי הלקוח: «${oo.value as string}» — להזין סכום ותזמון` });
    lines.push({
      id: `biz-${b.id}`, person, source: 'business', entityRef: b.id, label: b.name || 'עסק', period: per,
      ...zeroBefore(per), ...(f ? { actualToCutoff: f.value, actualSource: src(f.fact), actualFrom: src(f.fact).provenance } : {}),
      ...(turnover != null ? { turnoverToCutoff: turnover } : {}), ...(customerWithheld != null ? { withheldToCutoff: customerWithheld } : {}),
      client: fc ? { method: 'manual', assumption: fc.value as string, at: fc.createdAt } : undefined,
    });
  }
  for (const e of client.employers ?? []) {
    const per = linePeriod(employerSpan(e), y, m, null);
    if (gone(per)) { periodHint(`משכורת · ${e.name || 'מעסיק'}`, per); continue; }
    const person = (e as { belongsToSpouse?: boolean }).belongsToSpouse ? 'spouse' as const : 'client' as const;
    const f = actualFor('salary.amounts', e.id);
    const withheld = f?.get(['withheld']);
    lines.push({
      id: `sal-${e.id}`, person, source: 'salary', entityRef: e.id, label: `משכורת · ${e.name || 'מעסיק'}`, period: per,
      ...zeroBefore(per), ...(f ? { actualToCutoff: f.value, actualSource: src(f.fact), actualFrom: src(f.fact).provenance } : {}), ...(withheld != null ? { withheldToCutoff: withheld } : {}),
    });
  }
  // ‼ תחולת הנכס כאן היא תחולת הבעלות; תחולת ההשכרה עצמה אינה בתיק (isRented הוא מצב של היום)
  const rented = (client.properties ?? []).filter(pr => pr.isRented).map(pr => ({ pr, per: linePeriod(propertySpan(pr), y, m, answeredRelevance(facts, 'period.property', pr.id, y)) }));
  for (const r of rented.filter(r => gone(r.per))) periodHint(`נכס ${r.pr.address ?? ''}`.trim(), r.per);
  const liveProps = rented.filter(r => !gone(r.per));
  const rentF = actualFor('rent.incomeTotal', undefined) ?? undefined;
  const rentByProp = liveProps.map(r => actualFor('rent.income', r.pr.id)).filter(<T,>(x: T | undefined): x is T => !!x);
  if (rentF || rentByProp.length || liveProps.length) {
    const pers = liveProps.map(r => r.per);
    // ‼ 0 ידוע רק כשכל הנכסים בוודאות לא היו בבעלות עד החתך (נרכשו אחריו) ואין סכום אחר — אחרת «חסר»
    const allAfter = pers.length > 0 && pers.every(x => x.actual === 'out') && !rentF && !rentByProp.length && m > 0;
    const total = rentByProp.length ? rentByProp.reduce((a, f) => a + f.value, 0) : rentF ? rentF.value : allAfter ? 0 : undefined;
    const spans = liveProps.map(r => [r.pr.address, r.per.span].filter(Boolean).join(' ')).filter(Boolean).join(' · ');
    lines.push({ id: 'rent', person: 'client', source: 'rent', label: 'שכר דירה', actualToCutoff: total, actualSource: rentByProp[0] ? src(rentByProp[0].fact) : rentF ? src(rentF.fact) : allAfter ? { note: 'הנכסים נרכשו אחרי סוף החתך לפי התיק' } : undefined,
      ...(pers.length ? { period: { actual: both(pers, 'actual'), forecast: both(pers, 'forecast'), ...(spans ? { span: spans } : {}) } } : {}) });
  }
  // ‼ חשבון שנסגר השנה עדיין שייך לתקופת האמת — קודם סוננו כל הסגורים
  const accts = (client.investmentAccounts ?? []).map(a => ({ a, per: linePeriod(accountSpan(a), y, m, answeredRelevance(facts, 'period.account', a.id, y)) }));
  for (const r of accts.filter(r => gone(r.per))) periodHint(`חשבון ${r.a.institutionName ?? ''}`.trim(), r.per);
  const liveAccts = accts.filter(r => !gone(r.per));
  const capF = actualFor('capital.amounts', undefined);
  if (capF || liveAccts.length) {
    const pers = liveAccts.map(r => r.per);
    lines.push({ id: 'capital', person: 'client', source: 'capital', label: 'שוק ההון וריבית', actualToCutoff: capF?.value, actualSource: capF ? src(capF.fact) : undefined,
      ...(pers.length ? { period: { actual: both(pers, 'actual'), forecast: both(pers, 'forecast') } } : {}) });
  }
  const otherF = actualFor('special.otherIncome', undefined);
  if (otherF) lines.push({ id: 'other', person: 'client', source: 'other', label: 'הכנסה אחרת', actualToCutoff: otherF.value, actualSource: src(otherF.fact) });

  const dep = accepted.find(f => f.itemKey === 'savings.depositsEstimate');
  if (dep) hints.push({ text: `הפקדות לפי הלקוח: ${typeof dep.value === 'number' ? dep.value.toLocaleString('he-IL') + ' ₪' : String(dep.value)} — לפצל לפנסיה וקרן השתלמות` });
  const adv = accepted.find(f => f.itemKey === 'payments.advances');
  if (adv) hints.push({ text: `מקדמות ששולמו (עובדה בשנת המס): ${String(adv.value)} — להזין לפי תקופה בקריאת 134, כדי שלא ייספר פעמיים` });

  const card = cardAdvances(client);
  const spouseBiz = lines.some(l => l.person === 'spouse' && l.source === 'business');
  return {
    draft: {
      cutoffMonth: m, preparedOn: today, lines, oneOffs: [], adjustments: [],
      it: card.it ?? { via: 'manual', method: 'unknown', frequency: 1, periods: [] },
      ni: card.ni ?? { via: 'manual' },
      ...(spouseBiz ? { itSpouse: { via: 'manual' as const, method: 'unknown' as const, frequency: 1 as const, periods: [] }, niSpouse: card.niSpouse ?? { via: 'manual' as const } } : {}),
      vat: { via: 'manual', periods: [] },
      payments: [], savings: [], reconciliations: [], decisions: [],
    },
    inputFacts, hints,
  };
}

/** יישור: מחזור עד החתך בספרים מול מע״מ ומול 134. פער מעל 1% (ולפחות 500 ₪) ⇒ צריך הכרעה. */
export function reconciliationsNeeded(draft: EstimateDraft, taxYear: number): { lineId: string; books?: number; vat?: number; it134?: number }[] {
  const cut = `${taxYear}-${String(draft.cutoffMonth).padStart(2, '0')}`;
  // ‼ משווים רק תקופה זהה: קריאה דו־חודשית (134 / מע״מ) שמסתיימת לפני החתך (אוגוסט מול ספטמבר) אינה בת השוואה
  //   למחזור הספרים עד החתך — אחרת נוצר «פער» מדומה שחוסם אישור (נמצא 13.10.2026).
  const sumP = (ps: { period: string; turnover?: number; state: string }[]) => {
    const rel = ps.filter(p => p.period <= cut && p.state === 'reported' && p.turnover != null);
    if (!rel.length || !rel.some(p => p.period === cut)) return undefined;
    return rel.reduce((a, p) => a + (p.turnover ?? 0), 0);
  };
  const vat = sumP(draft.vat.periods), it = sumP(draft.it.periods);
  const biz = draft.lines.filter(l => l.source === 'business');
  // ‼ השוואה ברמת משק הבית: מע״מ ו-134 נקראים לתיק, לא לעסק; עם יותר מעסק אחד — סכום העסקים
  const books = biz.length ? biz.reduce((a, l) => a + (l.turnoverToCutoff ?? 0), 0) : undefined;
  if (books == null || !biz.some(l => l.turnoverToCutoff != null)) return [];
  const far = (x?: number) => x != null && Math.abs(x - books) > Math.max(500, books * 0.01);
  return far(vat) || far(it) ? [{ lineId: biz.length === 1 ? biz[0].id : 'all-business', books, vat, it134: it }] : [];
}

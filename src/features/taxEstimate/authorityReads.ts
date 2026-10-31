// ─── הערכת מס: מה שהקריאה מהרשויות מביאה לבד (31.10.2026) ──────────────────────────────────────────────────
// ‼ נצפה חי 31.10.2026 (קריאה בלבד, 134 של לקוח עם מקדמות פעילות): באותה תשובה ש«קרא משע״ם» כבר מקבלת יש «עודכן ב»,
//   «חודש שינוי», ההחלטה, ולכל תקופה — מחזור, חיוב ותשלום (worker/src/gmf134.mjs › advanceDetailsFrom134). בב״ל — שורת
//   המקדמה («ד"ב : 2026/1 סכום : 2062» ⇒ ממתי חלה) והיתרה (btlFileSync.mjs). כאן הם נכנסים לטיוטה — לא נכתבים ביד.
// ‼ «עודכן ברשות» ≠ «נבדק»: הראשון — מתי הרשות שינתה את ההחלטה; השני — מתי קראנו.
import type { AuthorityPeriod, EstimateDraft, ItAdvanceSetup, NiAdvanceSetup } from './types';

export interface Advance134 {
  updatedOn?: string | null;
  changeMonth?: string | null;
  firstMonth?: string | null;
  decision?: string | null;
  updatedBy?: string | null;
  periods?: { from?: string | null; to?: string | null; status?: string | null; turnover?: number | null; charge?: number | null; paid?: number | null; withheld?: number | null }[];
}
export interface AdvanceReads {
  /** at — היום שבו הקריאה הסתיימה (YYYY-MM-DD). */
  it134?: { at: string; value: unknown };
  ni?: { at: string; persons: unknown };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const stateOf = (s?: string | null): AuthorityPeriod['state'] => (s === 'דווח' ? 'reported' : s === 'טרם הגיע המועד' ? 'not_due' : 'unknown');

/** 134 ⇒ התקופות (לפי חודש הסיום, כמו ההזנה ביד) וההחלטה. קריאה ישנה מזו שבטיוטה — לא דורסת. */
export function itFrom134(it: ItAdvanceSetup, r: AdvanceReads['it134'], year: number): ItAdvanceSetup {
  const a = r?.value as Advance134 | undefined;
  if (!r || !a || (it.readOn && r.at < it.readOn)) return it;
  const periods: AuthorityPeriod[] = (a.periods ?? [])
    .filter(p => p.to && p.to.startsWith(`${year}-`))
    .map(p => ({ period: p.to!, state: stateOf(p.status), ...(num(p.turnover) != null ? { turnover: num(p.turnover) } : {}),
      ...(num(p.charge) != null ? { charged: num(p.charge) } : {}), ...(num(p.paid) != null ? { paid: num(p.paid) } : {}),
      ...(num(p.withheld) != null ? { withheld: num(p.withheld) } : {}) }));
  const decision = { ...(a.updatedOn ? { updatedOn: a.updatedOn } : {}), ...(a.changeMonth ? { changeMonth: a.changeMonth } : {}),
    ...(a.decision ? { text: a.decision } : {}), ...(a.updatedBy ? { by: a.updatedBy } : {}) };
  return { ...it, ...(periods.length ? { periods } : {}), ...(Object.keys(decision).length ? { decision } : {}), readOn: it.readOn && it.readOn > r.at ? it.readOn : r.at, via: 'automation' };
}

/**
 * ב״ל ⇒ ממתי חלה המקדמה, ו«שולם עד החתך» כשהיתרה 0. ‼ הנחה גלויה: יתרה 0 = שולם כל מה שחויב; והסכום חל מינואר
 * רק כשהשורה אומרת זאת («ד"ב : {שנה}/1» או מוקדם יותר) — אחרת לא מחשבים ולא ממלאים.
 */
export function niFromRead(ni: NiAdvanceSetup, r: AdvanceReads['ni'], role: 'client' | 'spouse', cutoff: number, year: number): NiAdvanceSetup {
  if (!r || (ni.readOn && r.at < ni.readOn)) return ni;
  const p = (Array.isArray(r.persons) ? r.persons : []).find((x: { role?: string }) => (x?.role ?? 'client') === role) as
    { sections?: { advance?: { ok?: boolean; value?: { advanceMonthly?: number; chargedFrom?: string | null } }; balance?: { ok?: boolean; value?: number } } } | undefined;
  const adv = p?.sections?.advance?.ok ? p.sections.advance.value : undefined;
  if (!adv) return ni;
  const monthly = num(adv.advanceMonthly) ?? ni.monthlyAdvance;
  const balance = p?.sections?.balance?.ok ? num(p.sections.balance.value) : undefined;
  const fromJan = !!adv.chargedFrom && adv.chargedFrom <= `${year}-01`;
  const paid = ni.paidToCutoff == null && balance === 0 && monthly != null && fromJan && cutoff > 0 ? monthly * cutoff : undefined;
  return {
    ...ni, ...(monthly != null ? { monthlyAdvance: monthly } : {}), ...(adv.chargedFrom ? { chargedFrom: adv.chargedFrom } : {}),
    ...(paid != null ? { paidToCutoff: paid, paidNote: `יתרה 0 בב״ל — שולם כל מה שחויב: ${monthly!.toLocaleString('he-IL')} ₪ × ${cutoff} חודשים` } : {}),
    readOn: ni.readOn && ni.readOn > r.at ? ni.readOn : r.at, via: 'automation',
  };
}

export function withAuthorityReads(draft: EstimateDraft, reads: AdvanceReads | undefined, year: number): EstimateDraft {
  if (!reads || draft.newBusiness) return draft;
  return {
    ...draft,
    it: itFrom134(draft.it, reads.it134, year),
    ni: niFromRead(draft.ni, reads.ni, 'client', draft.cutoffMonth, year),
    ...(draft.niSpouse ? { niSpouse: niFromRead(draft.niSpouse, reads.ni, 'spouse', draft.cutoffMonth, year) } : {}),
  };
}

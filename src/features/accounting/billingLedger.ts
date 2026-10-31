import type { Engagement } from '../../types/onboarding';
import type { AdditionalCharge } from '../../types/charges';
import { currentEngagement } from '../../utils/engagementSelectors';
import { round2 } from '../../utils/quotationCalc';

/**
 * מה ראינו בריטיינר של פייפרלס (paperless.read_retainer, 316) ומה זה אומר על כל לקוח.
 * ‼ כלל גיא (31.10.2026): כל חודש בתקופת ההסכם שלא נגבה מתווסף לתשלום עם הגשת הדוח — לכל הלקוחות.
 *   «לא נגבה» רק כשנבדק בפייפרלס וחודש הגבייה כבר עבר אותו. בלי בדיקה ⇒ «לא ידוע», לא מתווסף.
 */

export interface RetainerFee { period: string; amount: number | null; charged: boolean; chargedAt: string | null }
export interface RetainerClient {
  idNumber: string; name: string; linked: boolean;
  paymentMethod: 'credit' | 'unknown' | null; amountBeforeVat: number | null; cardEntered: boolean; fees: RetainerFee[];
}
export interface RetainerSnapshot { period: string | null; invoiceDate: string | null; clients: RetainerClient[] }

/** '2610' ⇒ '2026-10'. */
export const periodToMonth = (p: string | null | undefined): string | null =>
  p && /^\d{4}$/.test(p) ? `20${p.slice(0, 2)}-${p.slice(2)}` : null;

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '').replace(/^0+/, '');

/** הלקוח בריטיינר לפי ת״ז. שניים ⇒ null (לא מנחשים). */
export function retainerClientFor(snapshot: RetainerSnapshot | null | undefined, idNumber: string | undefined): RetainerClient | null {
  const id = digits(idNumber);
  if (!snapshot || !id) return null;
  const hits = snapshot.clients.filter(c => digits(c.idNumber) === id);
  return hits.length === 1 ? hits[0] : null;
}

export type MonthState = 'charged' | 'not_charged' | 'open' | 'unknown';
export interface LedgerMonth { month: string; state: MonthState; agreed: number; charged: number | null; chargedAt: string | null }
export interface Ledger { months: LedgerMonth[]; unpaid: LedgerMonth[]; unpaidTotal: number; current: LedgerMonth | null; period: string | null }

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * החודשים מתחילת ההסכם ועד חודש הגבייה הנוכחי בריטיינר. חודש שלפני חודש הגבייה ובלי חיוב ⇒ «לא נגבה»;
 * חודש הגבייה עצמו בלי חיוב ⇒ «פתוח». בלי בדיקה ⇒ הכול «לא ידוע» עד היום.
 */
export function clientLedger({ engagements, clientId, snapshot, retainer, today = new Date().toISOString().slice(0, 7) }: {
  engagements: Engagement[]; clientId: string; snapshot: RetainerSnapshot | null; retainer: RetainerClient | null; today?: string;
}): Ledger {
  const now = currentEngagement(engagements, clientId);
  const start = (now?.billingStartMonth ?? now?.effectiveFrom ?? '').slice(0, 7);
  const period = periodToMonth(snapshot?.period ?? null);
  const empty: Ledger = { months: [], unpaid: [], unpaidTotal: 0, current: null, period };
  if (!now || !/^\d{4}-\d{2}$/.test(start)) return empty;
  const end = period ?? today;
  if (start > end) return empty;
  const months = monthsBetween(start, end).map((month): LedgerMonth => {
    const e = currentEngagement(engagements, clientId, `${month}-15`) ?? now;
    const agreed = Number(e.monthlyTotal ?? 0);
    const fee = retainer?.fees.find(f => periodToMonth(f.period) === month && f.charged) ?? null;
    const state: MonthState = !period ? 'unknown' : fee ? 'charged' : month < period ? 'not_charged' : 'open';
    return { month, state, agreed, charged: fee?.amount ?? null, chargedAt: fee?.chargedAt ?? null };
  });
  const unpaid = months.filter(m => m.state === 'not_charged' && m.agreed > 0);
  return {
    months, unpaid, period,
    unpaidTotal: round2(unpaid.reduce((s, m) => s + m.agreed, 0)),
    current: months.find(m => m.month === end) ?? null,
  };
}

/** חיוב שמחכה להגשת הדוח (מההצעה: «עם הגשת הדוח השנתי»). */
export const isFilingCharge = (c: AdditionalCharge) => c.status !== 'paid' && /דוח/.test(c.dueTrigger ?? '');

/** לתשלום עם הגשת הדוח = החיובים שמחכים לדוח + החודשים שלא נגבו (לפני מע״מ). */
export function dueAtFiling(charges: AdditionalCharge[], clientId: string, ledger: Ledger) {
  const filing = charges.filter(c => c.clientId === clientId && isFilingCharge(c) && c.currency === 'ILS');
  const fromCharges = round2(filing.reduce((s, c) => s + c.amount, 0));
  return { filing, fromCharges, unpaidMonths: ledger.unpaid, total: round2(fromCharges + ledger.unpaidTotal) };
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1] ?? m} ${y}`; };
export const monthShort = (ym: string) => MONTHS[Number(ym.split('-')[1]) - 1] ?? ym;

// ─── הערכת מס: תזרים ומצב היישור מול הרשויות ─────────────────────────────────
// ‼ טהור (בלי React ובלי מסד). נבנה מהמקדמות שהמנוע כבר חישב — לא חישוב מס נוסף.
// ‼ מועד רק מכלל רשמי שבמרשם: מס הכנסה — ה-15 בחודש שאחרי התקופה (it.advances.methods, מדריך 2025 פרק ח);
//   ב״ל — ה-15 בחודש שאחרי (תקנה 2(א)(1) לתקנות הגבייה; חוזר 1502), ובהוראת קבע — ה-22 (ni.payment.day). השלמה לתקופות שעברו — לפי דרישת הרשות
//   או כשמשלמים מרצון; יתרת סוף שנה — מתבררת בדוח/בשומה. לא ממציאים תאריך.
// ‼ «הלקוח מסר» אינו יישור מול רשות. גם מספר שהוזן בלי תאריך בדיקה אינו קריאה.

import type { AuthorityAdvance, AuthorityAlignment, AuthorityReading, CashflowItem, EstimateDraft, NiAdvanceSetup, Person } from './types';
import { isNum } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const PERSON_HE: Record<Person, string> = { client: 'הלקוח', spouse: 'בן/בת הזוג' };

/** מס הכנסה: תקופה שמסתיימת בחודש YYYY-MM ⇒ תשלום עד ה-15 בחודש שאחריה (דצמבר ⇒ 15.01 בשנה הבאה). */
export function itDueDate(period: string): string {
  const y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7));
  return m === 12 ? `${y + 1}-01-15` : `${y}-${pad(m + 1)}-15`;
}

/** ב״ל: מקדמה לחודש YYYY-MM — עד ה-15 בחודש שאחריו (ביום מנוחה — היום שאחריו; לא מחושב כאן). */
export function niDueDate(period: string): string {
  const y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7));
  return m === 12 ? `${y + 1}-01-15` : `${y}-${pad(m + 1)}-15`;
}

/** לוח התשלומים מכאן ועד סוף השנה — לכל רשות ואדם. */
export function buildCashflow(advances: AuthorityAdvance[], draft: EstimateDraft, year: number): CashflowItem[] {
  const out: CashflowItem[] = [];
  const cutoff = draft.cutoffMonth;
  for (const a of advances) {
    if (a.authority === 'it') {
      for (const s of a.schedule) out.push({ authority: 'it', person: a.person, kind: 'advance', period: s.period, date: itDueDate(s.period), dateBasis: 'rule', current: s.current, recommended: s.recommended });
    } else {
      for (let m = cutoff + 1; m <= 12; m++) {
        const period = `${year}-${pad(m)}`;
        out.push({ authority: 'ni', person: a.person, kind: 'advance', period, date: niDueDate(period), dateBasis: 'rule',
          current: Math.round(a.current ?? 0), recommended: Math.round(a.recommended ?? a.current ?? 0), note: 'בהוראת קבע — ב-22 בחודש' });
      }
    }
    if (isNum(a.catchUp) && a.catchUp.value > 0) {
      out.push({ authority: a.authority, person: a.person, kind: 'catchUp', dateBasis: 'authorityDemand', current: 0, recommended: a.catchUp.value,
        note: a.authority === 'it' ? 'השלמה לתקופות שעברו — לפי דרישת פקיד השומה או כתשלום מרצון' : '«הגדלת מקדמות» — חיוב נפרד של ב״ל, במועד שב״ל קובע (יכול להיות גם אחרי סוף השנה, עד תחילת מרץ). האם חלים עליו הצמדה או קנס — לא פורסם' });
    }
    const bc = a.balanceAtCurrent, br = a.balanceAtRecommended;
    if (isNum(bc) || isNum(br)) {
      out.push({ authority: a.authority, person: a.person, kind: 'yearEnd', dateBasis: 'unknown',
        current: isNum(bc) ? bc.value : 0, recommended: isNum(br) ? br.value : 0,
        note: a.authority === 'it' ? 'יתרה למקדמה הזו — מתבררת בדוח השנתי (חוב או זכות)' : 'יתרה — מתבררת בשומה הסופית של ב״ל' });
    }
  }
  return out.sort((x, y) => (x.date ?? '9999') .localeCompare(y.date ?? '9999'));
}

/** ההשפעה המיידית על התזרים: מה יוצא בחלון הקרוב (ברירת מחדל 60 יום מתאריך ההכנה). */
export function nearTerm(items: CashflowItem[], fromIso: string, days = 60): { until: string; current: number; recommended: number; catchUp: number } {
  const from = new Date(fromIso + 'T00:00:00Z');
  const until = new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const inWin = items.filter(i => i.kind === 'advance' && i.date && i.date >= fromIso && i.date <= until);
  return {
    until,
    current: inWin.reduce((s, i) => s + i.current, 0),
    recommended: inWin.reduce((s, i) => s + i.recommended, 0),
    catchUp: items.filter(i => i.kind === 'catchUp').reduce((s, i) => s + i.recommended, 0),
  };
}

function stateOf(r: { via?: string; readOn?: string } | undefined): AuthorityAlignment['state'] {
  if (!r) return 'notRead';
  if (r.via === 'client') return 'clientStated';
  if (!r.readOn) return 'notRead';
  return r.via === 'automation' ? 'readFromAuthority' : 'officeEntered';
}

const STATE_HE: Record<AuthorityAlignment['state'], string> = {
  readFromAuthority: 'נקרא מהרשות',
  officeEntered: 'המשרד בדק מול הרשות',
  clientStated: 'הלקוח מסר — לא נבדק מול הרשות',
  notRead: 'לא נבדק מול הרשות',
};
const AUTH_HE = { it: 'מס הכנסה (134)', ni: 'ביטוח לאומי', vat: 'מע״מ (ESNA)' } as const;
const fmtD = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

/** תקופות 134 שהיו אמורות להופיע עד החתך ולא הופיעו — חסר, לא 0. */
export function itMissingPeriods(it: AuthorityReading & { frequency?: number; method?: string }, draft: EstimateDraft, year: number, person: Person): string[] {
  if (!it.readOn || it.method === 'none' || it.method === 'unknown') return [];
  const step = it.frequency || 1;
  const have = new Map(it.periods.map(p => [p.period, p]));
  const paidElsewhere = new Set(draft.payments.filter(p => p.authority === 'it' && p.person === person).map(p => p.period));
  const missing: string[] = [];
  for (let m = step; m <= draft.cutoffMonth; m += step) {
    const p = `${year}-${pad(m)}`;
    const x = have.get(p);
    if (x?.state === 'not_due') continue;
    if ((!x || (x.paid == null && x.charged == null)) && !paidElsewhere.has(p)) missing.push(p);
  }
  return missing;
}

/** חודשי ב״ל עד החתך בלי נתון תשלום; וחודשים שחויבו ואין לצידם תשלום. */
export function niPaymentGaps(ni: NiAdvanceSetup | undefined, cutoff: number, year: number): { missing: string[]; chargedUnpaid: string[] } {
  if (!ni || ni.paidToCutoff != null) return { missing: [], chargedUnpaid: [] };
  const have = new Map((ni.periods ?? []).map(p => [p.period, p]));
  const missing: string[] = [], chargedUnpaid: string[] = [];
  for (let m = 1; m <= cutoff; m++) {
    const p = `${year}-${pad(m)}`;
    const x = have.get(p);
    if (!x || x.paid == null) (x?.charged != null ? chargedUnpaid : missing).push(p);
  }
  return { missing, chargedUnpaid };
}

export function buildAlignment(draft: EstimateDraft, persons: Person[], bizPersons: Set<Person>, year: number): AuthorityAlignment[] {
  const out: AuthorityAlignment[] = [];
  const months = (ps: string[]) => ps.map(p => Number(p.slice(5))).join(', ');
  for (const p of persons) {
    if (!bizPersons.has(p)) continue;
    const it = p === 'client' ? draft.it : draft.itSpouse;
    const ni = p === 'client' ? draft.ni : draft.niSpouse;
    const who = p === 'spouse' ? ` · ${PERSON_HE.spouse}` : '';
    const itState = stateOf(it);
    const itGaps = it && itState !== 'notRead' && itState !== 'clientStated' ? itMissingPeriods(it, draft, year, p) : [];
    out.push({ authority: 'it', person: p, state: itState, readOn: it?.readOn, via: it?.via, hasEvidence: !!(it?.evidence?.documentId || it?.evidence?.evidenceId),
      gaps: itGaps.length ? [`תקופות בלי נתון ב-134: ${months(itGaps)} — חסר, לא 0`] : [],
      text: `${AUTH_HE.it}${who}: ${STATE_HE[itState]}${it?.readOn && itState !== 'clientStated' ? ` · ${fmtD(it.readOn)}` : ''}` });
    const niState = stateOf(ni);
    const g = niState === 'notRead' || niState === 'clientStated' ? { missing: [], chargedUnpaid: [] } : niPaymentGaps(ni, draft.cutoffMonth, year);
    const niGaps = [
      ...(g.missing.length ? [`חודשים בלי נתון תשלום: ${months(g.missing)} — חסר, לא 0`] : []),
      ...(g.chargedUnpaid.length ? [`חויב ואין תשלום רשום: ${months(g.chargedUnpaid)} — חיוב אינו תשלום`] : []),
    ];
    out.push({ authority: 'ni', person: p, state: niState, readOn: ni?.readOn, via: ni?.via, hasEvidence: !!(ni?.evidence?.documentId || ni?.evidence?.evidenceId),
      gaps: niGaps, text: `${AUTH_HE.ni}${who}: ${STATE_HE[niState]}${ni?.readOn && niState !== 'clientStated' ? ` · ${fmtD(ni.readOn)}` : ''}` });
  }
  if (bizPersons.size) {
    const v = draft.vat, s = stateOf(v);
    out.push({ authority: 'vat', person: 'client', state: s, readOn: v.readOn, via: v.via, hasEvidence: !!(v.evidence?.documentId || v.evidence?.evidenceId), gaps: [],
      text: `${AUTH_HE.vat}: ${STATE_HE[s]}${v.readOn && s !== 'clientStated' ? ` · ${fmtD(v.readOn)}` : ''}` });
  }
  return out;
}

export const ALIGNMENT_STATE_HE = STATE_HE;

// ─── הצהרת הון: מהסכומים שהמשרד רשם ליום ההצהרה — לסעיפי 1219, לסיכומים ולשינוי מול ההצהרה הקודמת (26.10.2026) ───
// ‼ גיא (26.10): «להשלים את הצהרת ההון עד הסוף — אותם עקרונות כמו הדוח השנתי». המשרד רושם סכום אחד לכל סעיף בחלק א׳
//   (עובדה «נכון ליום ההצהרה», period_kind=as_of — לא נדרסת ע״י הצהרה אחרת), והסיכומים נגזרים מהם כמו בטופס:
//   200 = 10…120 · 210 = 130 + 140 · 220 = 200 − 210 · 800 = 220 + הון העסקים (חלקים ב׳–ג׳; wealthFormGuide).
// ‼ סעיף בלי סכום ובלי «אין» = חסר, לא 0. השינוי מול ההצהרה הקודמת הוא עובדה (הפרש הון נטו), לא גישור הון.
// ‼ טהור: אותו חישוב למסך, להדפסה ולקובץ החתום.

import type { YearFact } from '../taxYear/types';
import { markersOf, type Box } from '../taxKnowledge/formMap/model';

export type SectionKind = 'asset' | 'liability' | 'business';
export interface SectionDef { code: string; itemKey: string; label: string; kind: SectionKind; area: string;
  /** שאלת הפתיחה של הלקוח: «לא» מכל מי שנשאל ⇒ הסעיף «אין» לבד (בלי עבודה של המשרד). */
  screener?: string }

/** סעיפי חלק א׳ ב-1219 (קוד הסיכום של כל סעיף) ⇐ הפריט שבו המשרד רושם את הסכום. */
export const SECTIONS: SectionDef[] = [
  { code: '10', itemKey: 'wealth.realEstate.total', screener: 'wealth.realEstate.has', label: 'נדל״ן בארץ', kind: 'asset', area: 'wRealEstate' },
  { code: '20', itemKey: 'wealth.realEstateAbroad.total', screener: 'wealth.realEstate.has', label: 'נדל״ן בחו״ל', kind: 'asset', area: 'wRealEstate' },
  { code: '30', itemKey: 'wealth.bank.total', label: 'בנקים ומוסדות כספיים', kind: 'asset', area: 'wBank' },
  { code: '40', itemKey: 'wealth.crypto.total', screener: 'wealth.crypto.has', label: 'נכסים דיגיטליים', kind: 'asset', area: 'wDigital' },
  { code: '50', itemKey: 'wealth.cash', label: 'מזומן מחוץ לבנק', kind: 'asset', area: 'wCash' },
  { code: '60', itemKey: 'wealth.funds.total', screener: 'wealth.funds.has', label: 'ביטוח, גמל, פנסיה והשתלמות', kind: 'asset', area: 'wFunds' },
  { code: '70', itemKey: 'wealth.securities.total', screener: 'wealth.securities.has', label: 'ניירות ערך וקרנות נאמנות', kind: 'asset', area: 'wSecurities' },
  { code: '80', itemKey: 'wealth.loansGiven.total', screener: 'wealth.loansGiven.has', label: 'הלוואות שנתתם', kind: 'asset', area: 'wLoansGiven' },
  { code: '90', itemKey: 'wealth.vehicles.total', screener: 'wealth.vehicles.has', label: 'רכב, שייט וטייס', kind: 'asset', area: 'wVehicles' },
  { code: '100', itemKey: 'wealth.valuables.total', screener: 'wealth.valuables.has', label: 'תכשיטים, זהב, אספנות ואומנות', kind: 'asset', area: 'wValuables' },
  { code: '110', itemKey: 'wealth.homeContents.total', label: 'תכולת בית', kind: 'asset', area: 'wValuables' },
  { code: '120', itemKey: 'wealth.other.total', screener: 'wealth.partD.has', label: 'רכוש אחר', kind: 'asset', area: 'wPartD' },
  { code: '130', itemKey: 'wealth.liabilities.total', screener: 'wealth.mortgage.has', label: 'התחייבויות לבנקים ולמוסדות', kind: 'liability', area: 'wLiabilities' },
  { code: '140', itemKey: 'wealth.loansReceived.total', screener: 'wealth.loansReceived.has', label: 'הלוואות שלקחתם מאחרים', kind: 'liability', area: 'wLiabilities' },
  { code: 'biz', itemKey: 'wealth.business.total', screener: 'wealth.companies.has', label: 'הון בעסקים ובחברות (חלקים ב׳–ג׳)', kind: 'business', area: 'wBusiness' },
];
export const SECTION_KEYS = new Set(SECTIONS.map(s => s.itemKey));

export interface SectionValue extends SectionDef { amount: number | null; none: boolean; fact?: YearFact; /** «אין» מתשובת הלקוח */ byClient?: boolean }
export interface WealthOutputs {
  asOf: string;
  sections: SectionValue[];
  /** 200 · 210 · 220 · 800 — null כשחסר סעיף שנכנס לסיכום. */
  assets: number | null; liabilities: number | null; netPrivate: number | null; total: number | null;
  missing: SectionValue[];
  previous?: { asOf?: string; total: number | null };
  change: number | null;
}

/** העובדה האחרונה שאושרה לפריט, נכון ליום ההצהרה. */
function latest(facts: YearFact[], itemKey: string, asOf: string): YearFact | undefined {
  return facts.filter(f => f.itemKey === itemKey && f.status === 'accepted' && f.periodTo === asOf)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
}

const amountOf = (f?: YearFact): { amount: number | null; none: boolean } => {
  if (!f) return { amount: null, none: false };
  if (f.answer === 'zero' || f.answer === 'no' || f.answer === 'not_applicable') return { amount: 0, none: true };
  const v = typeof f.value === 'number' ? f.value : typeof f.value === 'object' && f.value && typeof (f.value as { amount?: unknown }).amount === 'number' ? (f.value as { amount: number }).amount : Number(f.value);
  return Number.isFinite(v) ? { amount: v as number, none: false } : { amount: null, none: false };
};

/** כל מי שנשאל ענה «לא» (ואף אחד לא «כן»). */
function saidNo(facts: YearFact[], key: string, asOf: string): boolean {
  const fs = facts.filter(f => f.itemKey === key && f.periodTo === asOf && f.status !== 'rejected' && f.status !== 'superseded');
  return fs.length > 0 && fs.every(f => f.answer === 'no' || f.value === false);
}

const sum = (xs: (number | null)[]) => (xs.some(x => x === null) ? null : xs.reduce<number>((a, x) => a + (x as number), 0));

/** onCard — תחומים שיש להם ישות בכרטיס (נכס, קופה, תיק השקעות, עסק): שם «לא» של אחד מבני הזוג אינו «אין». */
export function computeWealth(facts: YearFact[], asOf: string, previous?: { facts?: YearFact[]; asOf?: string; typedNetWorth?: number | null }, opts: { onCard?: Set<string> } = {}): WealthOutputs {
  const sections = SECTIONS.map(d => {
    const f = latest(facts, d.itemKey, asOf);
    if (!f && d.screener && !opts.onCard?.has(d.area) && saidNo(facts, d.screener, asOf)) return { ...d, amount: 0, none: true, fact: undefined, byClient: true };
    return { ...d, ...amountOf(f), fact: f };
  });
  const of = (k: SectionKind) => sections.filter(s => s.kind === k).map(s => s.amount);
  const assets = sum(of('asset'));
  const liabilities = sum(of('liability'));
  const netPrivate = assets === null || liabilities === null ? null : assets - liabilities;
  const biz = of('business')[0] ?? null;
  const total = netPrivate === null || biz === null ? null : netPrivate + biz;
  let prev: WealthOutputs['previous'];
  if (previous?.asOf) {
    // ‼ הצהרה קודמת שהוכנה במערכת — אותו חישוב ליום הקודם; אחרת הסכום שהמשרד הקליד מההצהרה שהוגשה (800)
    const fromSystem = previous.facts ? computeWealth(previous.facts, previous.asOf).total : null;
    prev = { asOf: previous.asOf, total: fromSystem ?? previous.typedNetWorth ?? null };
  } else if (previous?.typedNetWorth != null) prev = { total: previous.typedNetWorth };
  return {
    asOf, sections, assets, liabilities, netPrivate, total,
    missing: sections.filter(s => s.amount === null),
    previous: prev, change: total !== null && prev?.total != null ? total - prev.total : null,
  };
}

const nis = (n: number) => Math.round(n).toLocaleString('he-IL');

/** ערכים על עמוד 1219: סכום הסעיף בקוד שלו + 200/210/220 + 800. */
/** מה שצריך כדי לצייר את הטופס — גם מהצילום שנחתם (WealthSnapshot). */
export type WealthFigures = Pick<WealthOutputs, 'assets' | 'liabilities' | 'netPrivate' | 'total'> & { sections: { code: string; amount: number | null }[] };

export function wealthValuesOnPage(page: number, out: WealthFigures): { key: string; code: string; box: Box; text: string }[] {
  const byCode: Record<string, number | null> = Object.fromEntries(out.sections.filter(s => s.code !== 'biz').map(s => [s.code, s.amount]));
  byCode['200'] = out.assets; byCode['210'] = out.liabilities; byCode['220'] = out.netPrivate; byCode['800'] = out.total;
  return markersOf('1219').filter(m => m.page === page && m.code && byCode[m.code] != null && !(byCode[m.code] === 0 && Number(m.code) < 200))
    // ‼ הסימון הוא שורת הסיכום כולה; הסכום נכתב בעמודה השמאלית («עלות ₪» / «סכום ₪») — לא על התווית המודפסת
    .map(m => ({ key: m.id, code: m.code, box: [m.box[0] + 0.004, m.box[1], 0.15, m.box[3]] as Box, text: nis(byCode[m.code] as number) }));
}

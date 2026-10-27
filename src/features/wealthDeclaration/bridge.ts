// ─── הצהרת הון: הגישור — «הפער שלא מוסבר» (27.10.2026, הדמיה מאושרת docs/proposals/2026-10-27-wealth-declaration.html) ──
// ‼ השיטה הרשמית (רשות המסים, «הסבר לשימוש בטבלאות הוצאות מחיה»): הוצאות מחיה = לוח 5 (לפי שנה, נפשות וקבוצת הכנסה)
//   + מה שהנישום הצהיר ב«טופס רמת חיים» + שכר דירה וריבית (לא כלולים בלוחות). מוצרים בני קיימא — בהצהרה עצמה.
// ‼ הגידול בהון מול: הכנסות − מס + מה שנכנס ולא מהעבודה − מה שיצא (מתנות, עזרה) − הוצאות מחיה. הפער = מה שלא מוסבר.
// ‼ חסר ≠ 0: שנה בלי הכנסה, רמת חיים שלא נענתה, הון קודם לא ידוע — אין פער כמספר, יש רשימת «חסר».
// ‼ טהור: אותו חישוב למסך ולבדיקות.
import { tableExpense } from './livingTables';

export interface YearIncome { year: number; income: number; tax: number }
/** «רמת חיים» — מה שהלקוח מסר: לשנה לכל פריט, ושכר דירה / החזר משכנתא לחודש. */
export interface LifeCosts { items: { cat: string; yearly: number }[]; rentMonthly?: number; mortgageMonthly?: number }
export interface MoneyFlow { kind: string; amount: number; year?: number }

export interface BridgeInput {
  prevAsOf?: string;
  asOf: string;
  prevTotal: number | null;
  nowTotal: number | null;
  /** התחייבויות (130+140) בקודמת ועכשיו — כדי להפריד ריבית מהחזר המשכנתא. null = לא ידוע. */
  prevLiabilities?: number | null;
  nowLiabilities?: number | null;
  incomes: YearIncome[];
  personsInYear: (year: number) => number;
  life?: LifeCosts | null;
  moneyIn?: MoneyFlow[] | null;
  moneyOut?: MoneyFlow[] | null;
}

export interface BridgeYear {
  year: number; income?: number; tax?: number; persons: number;
  table?: { amount: number; group: number; tableYear: number; exact: boolean; source: string };
  life: number; rent: number; interest: number; living?: number;
}
export interface BridgeResult {
  years: BridgeYear[];
  growth: number | null;
  incomeNet: number | null;
  moneyIn: number; moneyOut: number;
  living: number | null;
  /** ריבית ועמלות לכל התקופה: החזרי המשכנתא פחות הקטנת ההתחייבויות; null — אין התחייבויות קודמות לחשב. */
  interestTotal: number | null;
  explained: number | null;
  gap: number | null;
  missing: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** השנים שבין ההצהרות: מהשנה שאחרי הקודמת ועד שנת ההצהרה (הצהרות ליום 31.12). */
export function bridgeYears(prevAsOf: string | undefined, asOf: string): number[] {
  if (!prevAsOf) return [];
  const a = Number(prevAsOf.slice(0, 4)), b = Number(asOf.slice(0, 4));
  return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + 1 + i);
}

export function computeBridge(x: BridgeInput): BridgeResult {
  const missing: string[] = [];
  const ys = bridgeYears(x.prevAsOf, x.asOf);
  if (!x.prevAsOf) missing.push('יום ההצהרה הקודמת');
  if (x.prevTotal == null) missing.push('ההון בהצהרה הקודמת');
  if (x.nowTotal == null) missing.push('ההון ליום ההצהרה (סעיף חסר)');
  if (!x.life) missing.push('רמת חיים — עוד לא ענה');
  if (!x.moneyIn) missing.push('מה נכנס — עוד לא ענה');
  const inc = new Map(x.incomes.map(i => [i.year, i]));
  const noIncome = ys.filter(y => !inc.has(y));
  if (noIncome.length) missing.push(`הכנסה ומס לשנים ${noIncome.join(', ')}`);

  const lifeYear = x.life ? sum(x.life.items.map(i => Math.max(0, i.yearly))) : 0;
  const rentYear = x.life ? Math.max(0, x.life.rentMonthly ?? 0) * 12 : 0;
  const mortgageYear = x.life ? Math.max(0, x.life.mortgageMonthly ?? 0) * 12 : 0;
  // ‼ הריבית אינה בלוחות; מהחזרי המשכנתא מורידים את החלק שהקטין את ההתחייבויות (הוא כבר בשינוי בהון)
  const reduction = x.prevLiabilities != null && x.nowLiabilities != null ? Math.max(0, x.prevLiabilities - x.nowLiabilities) : null;
  const interestTotal = mortgageYear === 0 ? 0 : reduction == null ? null : Math.max(0, mortgageYear * ys.length - reduction);
  if (mortgageYear > 0 && interestTotal == null) missing.push('ההתחייבויות בהצהרה הקודמת — כדי להפריד ריבית מהחזר המשכנתא');
  const interestYear = interestTotal != null && ys.length ? interestTotal / ys.length : 0;

  const years: BridgeYear[] = ys.map(year => {
    const i = inc.get(year);
    const persons = x.personsInYear(year);
    const table = i ? tableExpense(year, i.income, persons) : undefined;
    const living = table ? table.amount + lifeYear + rentYear + interestYear : undefined;
    return { year, income: i?.income, tax: i?.tax, persons, table, life: lifeYear, rent: rentYear, interest: Math.round(interestYear), living: living == null ? undefined : Math.round(living) };
  });
  const moneyIn = sum((x.moneyIn ?? []).map(m => Math.max(0, m.amount)));
  const moneyOut = sum((x.moneyOut ?? []).map(m => Math.max(0, m.amount)));
  const complete = !missing.length;
  const incomeNet = noIncome.length ? null : sum(years.map(y => (y.income ?? 0) - (y.tax ?? 0)));
  const living = years.every(y => y.living != null) ? sum(years.map(y => y.living!)) : null;
  const growth = x.prevTotal != null && x.nowTotal != null ? x.nowTotal - x.prevTotal : null;
  const explained = incomeNet != null && living != null ? incomeNet + moneyIn - moneyOut - living : null;
  return {
    years, growth, incomeNet, moneyIn, moneyOut, living, interestTotal, explained,
    gap: complete && growth != null && explained != null ? Math.round(growth - explained) : null,
    missing,
  };
}

/** נפשות בבית בשנה: המבוגרים (נשואים בשנה — 2) ועוד הילדים שנולדו עד אותה שנה. */
export function personsFrom(married: (year: number) => boolean, childBirthYears: (number | undefined)[]): (year: number) => number {
  return year => (married(year) ? 2 : 1) + childBirthYears.filter(b => b != null && b <= year).length;
}

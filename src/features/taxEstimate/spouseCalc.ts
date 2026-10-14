// ─── בני זוג: חישוב נפרד מול חישוב מאוחד — במספרים (13.10.2026) ───────────────────
// מחקר: docs/tax-foundation/research/spouses-joint-separate-numeric-2026-10-13.md (ב.3, ב.4, ב.5).
// ‼ ברירת המחדל בחוק היא מאוחד (סעיף 65); נפרד — זכות לפי 66(א), רק כשמותר (66(ד)). «הרשות מחילה את הזול» — נוהל
//   של המדריך (עמ׳ 16–17, 67), לא חיסכון של המשרד. ‼ אין «אין חיסכון» בלי שני המספרים.
// ‼ בנוי מעל תוצאות calculateTax לכל אחד (אותו מנוע) — לא מנוע שני: המאוחד מחבר את ההכנסה החייבת של שניהם לטבלת
//   מדרגות אחת אצל בן הזוג הרשום, ומחליף את הנקודות האישיות של השני ב«בן זוג עובד» (סעיף 38).
// ‼ 14.10.2026 (research/joint-child-points): במאוחד אין נקודות ילדים לאף אחד מבני הזוג — 66(ג) הוא «ההוראות שיחולו על
//   החישוב הנפרד»; המדריך 2025 («רק בחישוב נפרד»); הו״ב 3/2015. לילדים במאוחד רק השפעה אחת: 2 נקודות «בן זוג עובד» במקום 1.75.
// ‼ שאלה פתוחה אחת נשארת כטווח: מי הרשום, כשלא אושר מול שע״ם — מחשבים לשני הכיוונים, ומכריעים רק אם התוצאה זהה.

import { calcBrackets, calcSurtax } from '../../utils/taxCalculations';
import type { TaxYearData } from '../../types';
import type { Person } from './types';

/** הרכיבים של אדם אחד מהחישוב הנפרד (calculateTax + תיקוני ההערכה). */
export interface SpouseSide {
  person: Person;
  /** הכנסה חייבת במדרגות (אחרי ניכויים — קופה, קרן השתלמות, 47א — כל אחד עם התקרה שלו). */
  taxable: number;
  /** הכנסה מיגיעה אישית (משכורת + עסק אחרי תיאומים) — למבחן «פי 5» (38(ב)). */
  exertion: number;
  /** שווי כל נקודות הזיכוי שלו בחישוב הנפרד. */
  pointsValue: number;
  /** מתוכן — נקודות ילדים (סעיפים 40(ב), 66(ג)). */
  childPointsValue: number;
  /** זיכויים כנגד המס שאינם נקודות: תרומות, יישוב מוטב, 45א (פנסיה, ביטוח חיים), דיווח מקוצר בזעיר. */
  credits: number;
  /** מס מחוץ למדרגות: שכירות 10%, הון בשיעור קבוע (כולל תיקון השיעור לפי סוג). */
  separateTaxes: number;
  /** בסיסי מס יסף (121ב): כל ההכנסה החייבת, וההכנסה ממקורות הוניים. */
  surtaxBase: number;
  capitalSource: number;
  /** מס ההכנסה שלו בחישוב הנפרד — כפי שההערכה מחשבת היום. */
  itSeparate: number;
}

export interface JointScenario { registered: Person; withChildren: boolean; included: boolean; tax: number }

export interface SpouseComparison {
  /** null — חישוב נפרד אינו מותר (66(ד) או שלבן הזוג השני אין יגיעה אישית). */
  separate: number | null;
  joint: { low: number; high: number; scenarios: JointScenario[] };
  /** החישוב שיחול. 'undecided' — ההכרעה תלויה בשאלה פתוחה. */
  applies: 'separate' | 'joint' | 'undecided';
  /** מס משק הבית לפי החישוב שיחול; undefined כשהמספר עצמו לא הוכרע. */
  household?: number;
  /** הטווח שנשאר פתוח (למסך ולחוסם). */
  openBecause: string[];
}

/**
 * מאוחד לרשום R ולשני S (ב.3): מדרגה אחת על ההכנסה החייבת של שניהם; נקודות R בלי (או עם) ילדים, ועוד P38 אם
 * הכנסת S מיגיעה אישית עולה על פי 5 מ-P38 (38(ב)); אחרת הכנסתו לא נכללת והנקודות לא ניתנות.
 * זיכויים של שניהם, יסף אחד, ומס בשיעור קבוע — של כל אחד, כמו שהוא.
 */
export function jointTax(R: SpouseSide, S: SpouseSide, o: { withChildren: boolean; p38: number; cpValue: number; td: TaxYearData }): JointScenario {
  const included = S.exertion > 5 * o.p38 * o.cpValue;
  const taxable = R.taxable + (included ? S.taxable : Math.max(0, S.taxable - S.exertion));
  const brackets = calcBrackets(Math.max(0, taxable), o.td).totalTax;
  const points = R.pointsValue - R.childPointsValue + (o.withChildren ? R.childPointsValue : 0) + (included ? o.p38 * o.cpValue : 0);
  const credits = R.credits + (included ? S.credits : 0);
  const income = Math.max(0, brackets - points - credits);
  const sur = calcSurtax(R.surtaxBase + (included ? S.surtaxBase : S.surtaxBase - S.exertion), R.capitalSource + S.capitalSource, o.td);
  return { registered: R.person, withChildren: o.withChildren, included, tax: Math.round(income + sur.base + sur.extra + R.separateTaxes + S.separateTaxes) };
}

/**
 * ההשוואה (ב.5). ‼ registered: מי הרשום בתיק מס הכנסה; undefined — שתי האפשרויות נכנסות לטווח.
 * ‼ hasChildren משפיע רק על נקודות «בן זוג עובד» (2 במקום 1.75) — לא על נקודות ילדים, שאינן ניתנות במאוחד.
 */
export function compareSpouses(sides: Record<Person, SpouseSide>, o: {
  separateAllowed: boolean; registered?: Person; hasChildren: boolean; p38: number; cpValue: number; td: TaxYearData;
}): SpouseComparison {
  const regs: Person[] = o.registered ? [o.registered] : ['client', 'spouse'];
  const childOpts = [false];
  const scenarios: JointScenario[] = [];
  for (const r of regs) for (const ch of childOpts) {
    const R = sides[r], S = sides[r === 'client' ? 'spouse' : 'client'];
    scenarios.push(jointTax(R, S, { withChildren: ch, p38: o.p38, cpValue: o.cpValue, td: o.td }));
  }
  const low = Math.min(...scenarios.map(s => s.tax)), high = Math.max(...scenarios.map(s => s.tax));
  const open: string[] = [];
  if (low !== high) {
    if (!o.registered) open.push('מי בן הזוג הרשום במס הכנסה — לא אושר מול שע״ם, והתוצאה תלויה בו');
  }
  const separate = o.separateAllowed ? Math.round(sides.client.itSeparate + sides.spouse.itSeparate) : null;
  if (separate == null) return { separate, joint: { low, high, scenarios }, applies: 'joint', household: low === high ? low : undefined, openBecause: open };
  if (separate < low) return { separate, joint: { low, high, scenarios }, applies: 'separate', household: separate, openBecause: [] };
  if (high < separate) return { separate, joint: { low, high, scenarios }, applies: 'joint', household: low === high ? low : undefined, openBecause: open };
  if (separate === low && low === high) return { separate, joint: { low, high, scenarios }, applies: 'separate', household: separate, openBecause: [] };
  return { separate, joint: { low, high, scenarios }, applies: 'undecided', openBecause: open };
}

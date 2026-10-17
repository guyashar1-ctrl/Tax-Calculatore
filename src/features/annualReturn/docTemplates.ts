// ─── מרשם תבניות מסמך — «מה לוקחים» מכל מסמך, לאיזו שאלה ולאיזה רכיב (שלב 1 של תוכנית הליווי, 17.10.2026) ──────────
// ‼ טהור. לכל סוג מסמך ולשנת מס: השורות («מה לוקחים ממנו» ואיפה זה במסמך), השדות להזנה, האימות, והניתוב לפריט בקטלוג
//   ולרכיב בתוכו. ההזנה — ידנית ומובנית (בלי ניתוח PDF). השיבוץ לקוד בטופס נעשה במנוע (engine.ts) — כאן רק «לאן זה הולך»
//   כתיאור למשרד, לא כאמת: האמת היא השדה שהמנוע מייצר מהשורות.
// ‼ חמשת המסמכים הנפוצים (תוכנית הליווי §2.3.1): 106, אישור שנתי מב״ל (תשלומים), 867, אישורי קופות (קופה + ביטוח), רווח והפסד.
//   שאר המסמכים — שלב 2ב. אישור תקבולים מב״ל (אבטלה, לידה, מילואים) — שלב 2א יחד עם מסך הליווי.
// ‼ מפתחות הקטלוג (itemKey) הם זהות העובדות — לא משתנים; הרכיבים נקראים ב-facts.ts (ALIASES).

import type { DocKind, SubjectRole } from '../taxYear/types';
import type { Client } from '../../types';

export type LineInput = 'amount' | 'yesno';
export interface DocLine {
  /** מפתח השורה במסמך — זהות השורה (evidence × lineKey). */
  key: string;
  label: string;
  /** איפה זה במסמך — למשרד שמקליד. */
  where: string;
  itemKey: string;
  component: string;
  input: LineInput;
  optional?: boolean;
  /** לאן זה הולך בטופס (תיאור; האמת — המנוע). «—» = נשמר ולא נכנס לדוח. */
  goesTo: string;
  /** מה לא לוקחים / מתי לא. */
  note?: string;
}
export type EntityKind = 'employer' | 'business' | 'account' | 'fund' | 'person';
export interface DocTemplate {
  docKind: DocKind;
  title: string;
  /** לכל מה המסמך (מעסיק / עסק / חשבון / קופה / אדם). */
  per: EntityKind;
  entityKind?: 'employer' | 'business' | 'account' | 'fund';
  lines: DocLine[];
  /** אימות בזמן ההזנה — טקסטים בעברית פשוטה; ריק = תקין. */
  validate: (v: Record<string, number | boolean | undefined>) => string[];
  /** בסיס: למי השורות שייכות כברירת מחדל — לפי הישות בכרטיס. */
  intro: string;
}

const pos = (v: Record<string, number | boolean | undefined>, k: string, label: string) => (typeof v[k] === 'number' && (v[k] as number) < 0 ? [`${label}: סכום שלילי אינו אפשרי`] : []);
const lte = (v: Record<string, number | boolean | undefined>, a: string, b: string, text: string) =>
  (typeof v[a] === 'number' && typeof v[b] === 'number' && (v[a] as number) > (v[b] as number) ? [text] : []);

const T2025: DocTemplate[] = [
  {
    docKind: 'form106', title: 'טופס 106 — אישור שנתי מהמעסיק', per: 'employer', entityKind: 'employer',
    intro: 'של מי ואיזה מעסיק — לפי המעסיק שבכרטיס; שני 106 לאותו אדם = שני מסמכים (ואז «תיאום מס לשנה?» — לבדיקה).',
    lines: [
      { key: '106.gross', label: 'הכנסה חייבת ממשכורת', where: 'שורות 158/172 בטופס 106 (סה״כ שכר חייב)', itemKey: 'salary.amounts', component: 'gross', input: 'amount', goesTo: '158 (בן הזוג הרשום) / 172 (בן/בת הזוג)' },
      { key: '106.withheld', label: 'מס הכנסה שנוכה', where: 'שורת 042 — «מס הכנסה שנוכה»', itemKey: 'salary.amounts', component: 'withheld', input: 'amount', goesTo: '042 (שדה משותף לשני בני הזוג)' },
      { key: '106.insured', label: 'הכנסה מבוטחת (השכר שבגינו הופרש לקצבה)', where: 'שורת 244/245', itemKey: 'salary.amounts', component: 'insured', input: 'amount', optional: true, goesTo: '244 / 245' },
      { key: '106.employeePension', label: 'הפקדת העובד לקופת גמל לקצבה', where: 'שורת 045/086', itemKey: 'salary.amounts', component: 'employeePension', input: 'amount', optional: true, goesTo: '045 / 086', note: 'הפקדות השכיר נלקחות מכאן — לא מאישור הקופה (בקרת כפל)' },
      { key: '106.employerDeposits', label: 'הפקדות המעביד לקצבה (כולל פיצויים)', where: 'שורת 248/249', itemKey: 'salary.amounts', component: 'employerDeposits', input: 'amount', optional: true, goesTo: '248 / 249' },
      { key: '106.studyFundSalary', label: 'משכורת שבשלה הפקיד המעביד לקרן השתלמות', where: 'שורת 218/219', itemKey: 'salary.amounts', component: 'studyFundSalary', input: 'amount', optional: true, goesTo: '218 / 219' },
    ],
    validate: v => [
      ...pos(v, '106.gross', 'הכנסה חייבת'), ...pos(v, '106.withheld', 'מס שנוכה'),
      ...lte(v, '106.withheld', '106.gross', 'המס שנוכה גדול מההכנסה — לבדוק את הטופס'),
      ...lte(v, '106.insured', '106.gross', 'הכנסה מבוטחת גדולה מהמשכורת — לבדוק'),
    ],
  },
  {
    docKind: 'niAnnualCert', title: 'אישור שנתי מביטוח לאומי — תשלומים (לעצמאי)', per: 'person',
    intro: 'ביטוח לאומי ובריאות הן שתי שורות נפרדות: רק דמי הביטוח הלאומי נכנסים לדוח (030/089); הבריאות נשמרת ואינה נכנסת.',
    lines: [
      { key: 'ni.paid', label: 'תשלומים בעד דמי ביטוח לאומי', where: 'הפסקה הראשונה: «תשלומים בעד דמי ביטוח לאומי (מקדמות, הפרשי שומה…) בסך …»', itemKey: 'payments.niPaid', component: 'amount', input: 'amount', goesTo: '030 / 089 — הסכום ששולם (רשות המסים מחשבת את הניכוי)' },
      { key: 'ni.health', label: 'תשלומים עבור ביטוח בריאות', where: '«כמו כן נרשמו תשלומים עבור ביטוח בריאות בסך …»', itemKey: 'payments.niPaid', component: 'health', input: 'amount', optional: true, goesTo: '— (נשמר; לא נכנס לדוח — על בריאות אין ניכוי ואין זיכוי)' },
      { key: 'ni.refunds', label: 'החזרים שהתקבלו מביטוח לאומי בשנה', where: 'שורת ההחזרים, אם קיימת', itemKey: 'payments.niPaid', component: 'refunds', input: 'amount', optional: true, goesTo: 'מקטין את 030/089 (מ-2025: תשלומים פחות החזרים)', note: 'עודף החזר על התשלומים — לבדיקה (250/270)' },
      { key: 'ni.assessmentDiff', label: 'הפרשי שומה ששולמו (בתוך הסכום)', where: 'מופיע בהערות האישור', itemKey: 'payments.niPaid', component: 'assessmentDiff', input: 'amount', optional: true, goesTo: '— (לבדיקה: תשלומים בעד שנים קודמות — רק למי שחדל להיות עצמאי)' },
    ],
    validate: v => [...pos(v, 'ni.paid', 'דמי ביטוח לאומי'), ...pos(v, 'ni.health', 'ביטוח בריאות'), ...pos(v, 'ni.refunds', 'החזרים'),
      ...lte(v, 'ni.assessmentDiff', 'ni.paid', 'הפרשי השומה גדולים מכלל התשלומים — לבדוק')],
  },
  {
    docKind: 'form867', title: 'טופס 867 — אישור שנתי מהבנק / בית ההשקעות', per: 'account', entityKind: 'account',
    intro: 'של מי החשבון — לפי הבעלים; מוסד + חשבון + שנה + אדם = זהות. 867 נוסף לאותו חשבון: «אישור מתקן» מחליף, «נוסף» מתווסף.',
    lines: [
      { key: '867.depositInterest15', label: 'ריבית על פיקדונות ותוכניות חיסכון — 15%', where: 'סעיף הריבית הלא-צמודה בשיעור 15%', itemKey: 'capital.amounts', component: 'depositInterest15', input: 'amount', optional: true, goesTo: '217 / 317 (ובסיכום 078)' },
      { key: '867.depositInterest25', label: 'ריבית על פיקדונות — 25% (צמודה)', where: 'סעיף הריבית הצמודה', itemKey: 'capital.amounts', component: 'depositInterest25', input: 'amount', optional: true, goesTo: '242 / 342 — אחרי הכרעת המשרד על 25%' },
      { key: '867.securitiesInterest15', label: 'ריבית ורווחים מני״ע — 15%', where: 'סעיף ני״ע לא צמודים', itemKey: 'capital.amounts', component: 'securitiesInterest15', input: 'amount', optional: true, goesTo: '211 / 311 (ובסיכום 060)' },
      { key: '867.dividend', label: 'דיבידנד', where: 'סעיף הדיבידנד', itemKey: 'capital.amounts', component: 'dividend', input: 'amount', optional: true, goesTo: '241 / 341 — אחרי הכרעת המשרד על 25%' },
      { key: '867.gains', label: 'רווח הון ממכירת ני״ע (ריאלי)', where: 'סעיף רווחי ההון', itemKey: 'capital.amounts', component: 'gains', input: 'amount', optional: true, goesTo: 'נספח ג׳ (1322) — לא מופק כאן; נרשם כפער', note: 'הפסד הון — בנספח, לא כאן' },
      { key: '867.withheldDeposit', label: 'מס שנוכה — על ריבית פיקדונות', where: 'עמודת המס שנוכה בסעיפי הריבית על פיקדונות', itemKey: 'capital.amounts', component: 'withheldDeposit', input: 'amount', optional: true, goesTo: '043 (ניכוי במקור מריבית)' },
      { key: '867.withheldSecurities', label: 'מס שנוכה — על ני״ע ודיבידנד', where: 'עמודת המס שנוכה בסעיפי ני״ע ודיבידנד', itemKey: 'capital.amounts', component: 'withheldSecurities', input: 'amount', optional: true, goesTo: '040 (סה״כ ניכויים במקור אחרים)', note: 'C16: 043 רק לריבית פיקדונות' },
    ],
    validate: v => {
      const inc = ['867.depositInterest15', '867.depositInterest25', '867.securitiesInterest15', '867.dividend', '867.gains'].reduce((a, k) => a + (typeof v[k] === 'number' ? (v[k] as number) : 0), 0);
      const w = ['867.withheldDeposit', '867.withheldSecurities'].reduce((a, k) => a + (typeof v[k] === 'number' ? (v[k] as number) : 0), 0);
      const out = Object.keys(v).flatMap(k => pos(v, k, k.replace('867.', '')));
      if (!Object.values(v).some(x => typeof x === 'number')) out.push('לא הוזן אף סכום — אם ב-867 הכול אפס, לרשום 0 בשורת הריבית');
      if (w > inc && inc > 0) out.push('המס שנוכה גדול מכלל ההכנסות באישור — לבדוק');
      return out;
    },
  },
  {
    docKind: 'fundAnnualCert', title: 'אישור שנתי מקופת גמל / קרן פנסיה / קרן השתלמות', per: 'fund', entityKind: 'fund',
    intro: 'של מי ואיזו קופה — לפי הקופה שבכרטיס. ‼ רק הפקדות «כעמית עצמאי»: הפקדות דרך המעסיק נלקחות מטופס 106 (בקרת כפל).',
    lines: [
      { key: 'fund.pension', label: 'הפקדות כעמית עצמאי לקופת גמל לקצבה', where: 'סעיף «הפקדות עצמאיות» / «עמית עצמאי» באישור', itemKey: 'savings.selfAmounts', component: 'pension', input: 'amount', optional: true, goesTo: '135 / 180 — כל הסכום (רשות המסים מפצלת לניכוי ולזיכוי)' },
      { key: 'fund.studyFund', label: 'הפקדות לקרן השתלמות כעצמאי', where: 'אישור קרן ההשתלמות — הפקדות העמית', itemKey: 'savings.selfAmounts', component: 'studyFund', input: 'amount', optional: true, goesTo: '136 / 137' },
    ],
    validate: v => [...pos(v, 'fund.pension', 'הפקדות לקצבה'), ...pos(v, 'fund.studyFund', 'קרן השתלמות'),
      ...(!Object.values(v).some(x => typeof x === 'number') ? ['לא הוזן סכום — אישור בלי הפקדה עצמאית לא נכנס לדוח'] : [])],
  },
  {
    docKind: 'insuranceCert', title: 'אישור שנתי מחברת הביטוח — ביטוח חיים ואובדן כושר עבודה', per: 'person',
    intro: 'הסכומים ששולמו בשנה (לא הסכום המבוטח). הזיכוי על ביטוח החיים — חישוב מקצועי בהמשך.',
    lines: [
      { key: 'ins.life', label: 'פרמיות ביטוח חיים ששולמו', where: 'סעיף «ביטוח חיים» באישור השנתי למס', itemKey: 'savings.insuranceAmounts', component: 'life', input: 'amount', optional: true, goesTo: '036 / 081' },
      { key: 'ins.disability', label: 'פרמיות אובדן כושר עבודה ששולמו', where: 'סעיף «אובדן כושר עבודה»', itemKey: 'savings.insuranceAmounts', component: 'disability', input: 'amount', optional: true, goesTo: '112 / 113 (לא מופק עדיין — נשמר)' },
    ],
    validate: v => [...pos(v, 'ins.life', 'ביטוח חיים'), ...pos(v, 'ins.disability', 'אובדן כושר'),
      ...(!Object.values(v).some(x => typeof x === 'number') ? ['לא הוזן סכום'] : [])],
  },
  {
    docKind: 'annualPnl', title: 'דוח רווח והפסד שנתי (רו״ה)', per: 'business', entityKind: 'business',
    intro: 'מהדוח נלקחים המחזור והרווח לפני תיאומי מס; שורות הנספח (1320) — בעורך «עסקים — נספח 1320». תיאומי מס — הכרעת משרד בטיוטה.',
    lines: [
      { key: 'pnl.turnover', label: 'סך ההכנסות (מחזור ללא מע״מ)', where: 'שורת סך ההכנסות ברו״ה', itemKey: 'business.profit', component: 'turnover', input: 'amount', goesTo: '238 / 239 (וב-294 למקדמות)' },
      { key: 'pnl.profit', label: 'רווח לפני תיאומי מס', where: 'השורה התחתונה ברו״ה («רווח נקי» לפני תיאומים)', itemKey: 'business.profit', component: 'profit', input: 'amount', goesTo: '150 / 170 (אחרי תיאומים שהמשרד מאשר)' },
      { key: 'pnl.customerWithholding', label: 'ניכוי במקור מלקוחות (לפי אישורי הניכוי)', where: 'ריכוז אישורי הניכוי מלקוחות — לא מהרו״ה עצמו', itemKey: 'business.profit', component: 'customerWithholding', input: 'amount', optional: true, goesTo: '040' },
    ],
    validate: v => [...pos(v, 'pnl.turnover', 'מחזור'),
      ...lte(v, 'pnl.profit', 'pnl.turnover', 'הרווח גדול מהמחזור — לבדוק'),
      ...(typeof v['pnl.turnover'] === 'number' && (v['pnl.turnover'] as number) > 300_000 ? ['מחזור מעל 300,000 ₪ — ייתכן שחייבים בטופס 6111 (לבדוק כולל מע״מ)'] : [])],
  },
];

export const DOC_TEMPLATES: Record<number, DocTemplate[]> = { 2025: T2025 };
/** התבנית לסוג מסמך ולשנה; שנה בלי מרשם משלה — המרשם האחרון שקיים (שנה אחרת = כללים אחרים; מסומן בכותרת). */
export function templateFor(docKind: DocKind, year: number): { template: DocTemplate; year: number } | undefined {
  const years = Object.keys(DOC_TEMPLATES).map(Number).sort((a, b) => a - b);
  const y = DOC_TEMPLATES[year] ? year : years.filter(x => x <= year).pop() ?? years[0];
  const t = DOC_TEMPLATES[y]?.find(x => x.docKind === docKind);
  return t ? { template: t, year: y } : undefined;
}
export const TEMPLATE_DOC_KINDS = T2025.map(t => t.docKind);

/** הישויות בכרטיס שאליהן המסמך יכול להשתייך (לבחירה בעורך). */
export function entitiesFor(t: DocTemplate, client: Client, person: 'client' | 'spouse'): { id: string; label: string }[] {
  const mine = (b?: boolean) => (person === 'spouse' ? !!b : !b);
  if (t.per === 'employer') return (client.employers ?? []).filter(e => mine((e as { belongsToSpouse?: boolean }).belongsToSpouse)).map(e => ({ id: e.id, label: e.name }));
  if (t.per === 'business') return (client.businesses ?? []).filter(b => !(b as { isClosed?: boolean }).isClosed && mine((b as { belongsToSpouse?: boolean }).belongsToSpouse)).map(b => ({ id: b.id, label: b.name || 'עסק' }));
  if (t.per === 'account') return (client.investmentAccounts ?? []).map(a => ({ id: a.id, label: `${a.institutionName}${a.accountNumber ? ` · ${a.accountNumber}` : ''}` }));
  if (t.per === 'fund') return (client.pensionFunds ?? []).map(f => ({ id: f.id, label: `${f.institutionName}${f.productName ? ` · ${f.productName}` : ''}` }));
  return [];
}

export interface LineValues { [lineKey: string]: number | boolean | undefined }
export interface SourceLineInput {
  lineKey: string; itemKey: string; subjectRole: SubjectRole; entityKind?: string; entityRef?: string; taxYear: number;
  value: Record<string, number>; requestId?: string; askId?: string;
}
/**
 * מהערכים שהוזנו — השורות לשמירה (record_source_lines): שורה לכל ערך מספרי, בערך של רכיב אחד ({ gross: 152855 }).
 * ‼ חשבון/קופה של משק הבית (couple) — לפי subjectRole שנבחר; המנוע זוקף «couple» לבן הזוג הרשום.
 */
export function linesToSave(t: DocTemplate, values: LineValues, ctx: { subjectRole: SubjectRole; entityRef?: string; taxYear: number; requestId?: string; askId?: string }): SourceLineInput[] {
  const out: SourceLineInput[] = [];
  for (const l of t.lines) {
    const v = values[l.key];
    if (typeof v !== 'number' || !isFinite(v)) continue;
    out.push({ lineKey: l.key, itemKey: l.itemKey, subjectRole: ctx.subjectRole, entityKind: t.entityKind, entityRef: ctx.entityRef, taxYear: ctx.taxYear,
      value: { [l.component]: v }, requestId: ctx.requestId, askId: ctx.askId });
  }
  return out;
}
/** השדות החובה בתבנית שלא הוזנו. */
export function missingRequired(t: DocTemplate, values: LineValues): string[] {
  return t.lines.filter(l => !l.optional && typeof values[l.key] !== 'number').map(l => l.label);
}

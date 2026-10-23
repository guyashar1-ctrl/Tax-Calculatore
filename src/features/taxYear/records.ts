// ─── רשומות מובנות בשאלון: ילדים, חשבון בנק, מעסיק, נכס, חשבון השקעות… (13.10.2026) ─────────
// ‼ גיא: «ילדים בתיבת טקסט אחת» ו«בנק, סניף וחשבון בשורה אחת» — לא. כל נתון בשדה משלו; טקסט חופשי
//   רק להערות. מה שבתיק מוצג לאישור או לתיקון (initial), לא נשאל מאפס.
// ‼ טהור (בלי React): אותם כללים ללקוח, למשרד ולבדיקות.
// ‼ תאריך עם דיוק (DatedValue, temporal.ts): «רק שנה» / «בערך» הם תשובה לגיטימית, ולא הופכים ל-1 בינואר.

import type { Client } from '../../types';
import type { RecordSchemaId } from './types';
import type { DatedValue } from './temporal';
import { isValidIsraeliId } from '../../utils/israeliId';
import { familyStatusYearProblem } from '../../utils/familyStatusYear';

export type FieldType = 'text' | 'dated' | 'date' | 'number' | 'percent' | 'choice' | 'digits' | 'bank' | 'branch' | 'hebrewText' | 'monthIn'
  /** 21.10.2026 · בחירה מרשימה ארוכה (שנה, חודש) — רשימה נפתחת, לא כפתורים. */
  | 'pick';

export interface RecordField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** הסבר קצר מתחת לשדה. */
  hint?: string;
  placeholder?: string;
  /** מוצג רק כש... (למשל פרטי חשבון זר רק כשסומן «חשבון בחו״ל»). */
  showIf?: (r: RecordValue) => boolean;
  /** ספרות: מספר מרבי של תווים; קוד בנק/סניף — עם אפסים מובילים. */
  maxLength?: number;
  /** רוחב בשורה בטלפון ובמחשב. */
  half?: boolean;
  /** 16.10.2026 · תאריך שיכול להיות בעתיד (סוף תקופת זכאות שעוד לא הסתיימה). */
  allowFuture?: boolean;
  /** 16.10.2026 · ת.ז. ישראלית — בדיקת ספרת ביקורת (utils/israeliId), כדי שטעות הקלדה תיתפס אצל הלקוח. */
  israeliId?: boolean;
  /** לתאריך עם דיוק: אילו דיוקים מותרים. ברירת מחדל: כולם. */
  precisions?: DatedValue['precision'][];
  /**
   * 20.10.2026 · 'monthIn' — חודש בתוך שנת הדוח בלבד (גיא: «עד מתי» ריק ⇒ «תאריך לא תקין», ו«אוקטובר 2026» התקבל לדוח של 2025).
   * התחלה: «לפני {שנה}» או חודש; סיום: «עדיין שם» (ריק) או חודש. הערך — DatedValue בדיוק חודש; «לפני» — התאריך מהתיק, או «לא ידוע».
   */
  year?: number;
  edge?: 'start' | 'end';
}

export type RecordValue = Record<string, unknown>;

export interface RecordSchema {
  id: RecordSchemaId;
  /** ילד/ה · מעסיק · נכס */
  noun: string;
  addLabel: string;
  multiple: boolean;
  /** «אין ילדים» — תשובה, לא «חסר». */
  noneLabel?: string;
  fields: RecordField[];
  summary: (r: RecordValue) => string;
}

const OWNER = (c?: Pick<Client, 'firstName' | 'spouseFirstName' | 'familyStatus' | 'spouse'>) => [
  { value: 'client', label: c?.firstName || 'אני' },
  ...(c?.familyStatus === 'married' ? [{ value: 'spouse', label: c.spouseFirstName || c.spouse?.firstName || 'בן/בת הזוג' }, { value: 'both', label: 'שנינו (משותף)' }] : []),
  { value: 'other', label: 'מישהו אחר' },
];

export const PRECISION_LABEL: Record<DatedValue['precision'], string> = {
  day: 'תאריך מדויק', month: 'רק חודש ושנה', year: 'רק שנה', approx: 'בערך (שנה משוערת)', unknown: 'לא יודע/ת',
};

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
/** 20.10.2026 · 'monthIn' לתצוגה: «מינואר 2025» / «לפני 2025» · «עד מאי 2025» / «עדיין שם». */
export function monthInText(v: unknown, year: number, edge: 'start' | 'end'): string {
  const d = v as DatedValue | undefined;
  if (!d || !d.precision) return edge === 'end' ? 'עדיין שם' : '';
  if (d.precision === 'month' && d.date?.startsWith(String(year))) return `${edge === 'start' ? 'מ' : 'עד '}${MONTH_NAMES[Number(d.date.slice(5, 7)) - 1]} ${year}`;
  return edge === 'start' ? `לפני ${year}` : `עד ${datedText(d)}`;
}
/** 20.10.2026 · 'monthIn' בבורר: 'before' / 'MM' / '' (סיום ריק = «עדיין שם»). */
export function monthInKey(v: unknown, year: number, edge: 'start' | 'end'): string {
  const d = v as DatedValue | undefined;
  if (!d || !d.precision) return '';
  if (d.precision === 'month' && d.date?.startsWith(String(year))) return d.date.slice(5, 7);
  return edge === 'start' ? 'before' : '';
}

export function datedText(v: unknown): string {
  const d = v as DatedValue | undefined;
  if (!d || !d.precision) return '';
  if (d.precision === 'unknown' || !d.date) return 'לא ידוע';
  const [y, m, day] = d.date.split('-');
  if (d.precision === 'year') return y;
  if (d.precision === 'approx') return `בערך ${y}`;
  if (d.precision === 'month') return `${m}/${y}`;
  return `${day}.${m}.${y}`;
}
const he = (iso?: unknown) => (typeof iso === 'string' && iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const label = (opts: { value: string; label: string }[] | undefined, v: unknown) => opts?.find(o => o.value === v)?.label ?? str(v);

const ACCOUNT_KINDS = [
  { value: 'deposit', label: 'פיקדון או חיסכון בבנק' },
  { value: 'portfolio', label: 'תיק השקעות (מניות, אג״ח, קרנות)' },
  { value: 'moneyMarket', label: 'קרן כספית' },
  { value: 'gemelInvest', label: 'קופת גמל להשקעה' },
  { value: 'other', label: 'אחר' },
];
const FUND_TYPES = [
  { value: 'pension', label: 'קרן פנסיה' }, { value: 'study', label: 'קרן השתלמות' },
  { value: 'gemel', label: 'קופת גמל' }, { value: 'managerIns', label: 'ביטוח מנהלים' }, { value: 'other', label: 'אחר' },
];
const FOREIGN_KINDS = [
  { value: 'bank', label: 'חשבון בנק' }, { value: 'investments', label: 'השקעות / ברוקר' },
  { value: 'property', label: 'נכס' }, { value: 'work', label: 'הכנסה מעבודה' }, { value: 'other', label: 'אחר' },
];
const DEALER = [
  { value: 'patur', label: 'עוסק פטור' }, { value: 'murshe', label: 'עוסק מורשה' }, { value: 'zeir', label: 'עוסק זעיר' },
  { value: 'company', label: 'חברה' }, { value: 'unknown', label: 'לא יודע/ת' },
];
export const STUDY_KINDS = [{ value: 'ba', label: 'תואר ראשון' }, { value: 'ma', label: 'תואר שני' }, { value: 'pro', label: 'לימודי מקצוע' }, { value: 'army', label: 'צבא או שירות לאומי' }];
const LIVES = [
  { value: 'withUs', label: 'גר/ה איתנו' }, { value: 'otherParent', label: 'אצל ההורה השני' }, { value: 'shared', label: 'משמורת משותפת' },
];
/** ‼ 290 · «איפה גר/ה» ⇔ משמורת בתיק (Child.custody): 'spouse' בכרטיס של הורה שאינו נשוי = ההורה השני. */
export const CUSTODY_OF_LIVES: Record<string, 'self' | 'spouse' | 'shared'> = { withUs: 'self', otherParent: 'spouse', shared: 'shared' };
const LIVES_OF_CUSTODY: Record<string, string> = { self: 'withUs', spouse: 'otherParent', shared: 'shared' };
const GENDERS = [{ value: 'female', label: 'אישה' }, { value: 'male', label: 'גבר' }];
/** ‼ 290 · הילדים לבחירה: מהשאלה (context.kids — [{id, name}]) בדף האישי, אחרת מהכרטיס. */
export const kidsContext = (c: Client) => JSON.stringify((c.children ?? []).map(k => ({ id: k.id, name: k.firstName || (k.birthYear ? `ילד/ה ${k.birthYear}` : 'ילד/ה') })));
function kidsOf(ctx: Record<string, string> | undefined, c?: Client): { value: string; label: string }[] {
  let list: { id: string; name: string }[] = [];
  try { list = JSON.parse(ctx?.kids ?? (c ? kidsContext(c) : '[]')); } catch { list = []; }
  return list.filter(k => k && k.id).map(k => ({ value: k.id, label: k.name }));
}
const ALIYAH_STATUS = [{ value: 'immigrant', label: 'עולה חדש/ה' }, { value: 'returning', label: 'תושב/ת חוזר/ת' }];
const DISABILITY_SET = [{ value: 'yes', label: 'כן' }, { value: 'no', label: 'עוד לא' }];
const MONTH_OPTIONS = MONTH_NAMES.map((m, k) => ({ value: String(k + 1).padStart(2, '0'), label: m }));
const yearOptions = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => String(from + k)).map(y => ({ value: y, label: y }));
/** «מרץ 2023» — או רק השנה כשאין חודש. */
const monthYear = (m: unknown, y: unknown, pre = '') => (str(y) ? `${pre}${Number(m) >= 1 ? `${MONTH_NAMES[Number(m) - 1]} ` : ''}${str(y)}` : '');
const IN_PERIOD = (w: string) => [
  { value: 'all', label: `כן — ${w} כולה` }, { value: 'part', label: `כן — רק בחלק מ${w}` },
  { value: 'after', label: `לא — התחיל אחרי ${w}` }, { value: 'before', label: `לא — הסתיים לפני ${w}` }, { value: 'unsure', label: 'לא בטוח/ה' },
];

/** סכמות — ללקוח מסוים (מי הבעלים, שמות בני הזוג). */
export function schemaFor(id: RecordSchemaId, c?: Client, ctx?: Record<string, string>): RecordSchema {
  // ‼ בדף האישי אין כרטיס: השמות מגיעים מהשאלה (context: clientName / spouseName / married)
  const owner = OWNER(c ?? (ctx?.clientName ? { firstName: ctx.clientName, spouseFirstName: ctx.spouseName, familyStatus: ctx.married ? 'married' : 'single', spouse: null } as unknown as Client : undefined));
  switch (id) {
    case 'children': return {
      id, noun: 'ילד', addLabel: '＋ עוד ילד', multiple: true, noneLabel: 'אין ילדים',
      fields: [
        { key: 'firstName', label: 'שם פרטי', type: 'text', required: true, half: true },
        { key: 'birthDate', label: 'תאריך לידה', type: 'date', required: true, half: true },
        { key: 'livesWith', label: 'איפה גר/ה', type: 'choice', options: LIVES, showIf: () => c?.familyStatus !== 'married' && !ctx?.married, hint: 'רלוונטי להורה שאינו נשוי — נקודות הזיכוי תלויות בכך' },
      ],
      summary: r => [str(r.firstName) || 'ילד', he(r.birthDate) && `תאריך לידה ${he(r.birthDate)}`, r.livesWith ? label(LIVES, r.livesWith) : ''].filter(Boolean).join(' · '),
    };
    case 'address': return {
      id, noun: 'כתובת', addLabel: '', multiple: false,
      fields: [
        { key: 'city', label: 'יישוב', type: 'hebrewText', required: true, half: true },
        { key: 'street', label: 'רחוב', type: 'hebrewText', required: true, half: true },
        { key: 'houseNumber', label: 'מספר בית', type: 'text', required: false, half: true, maxLength: 8, hint: 'ביישוב בלי רחובות — לא חובה' },
        { key: 'apartment', label: 'דירה', type: 'text', half: true, maxLength: 8 },
        { key: 'zip', label: 'מיקוד', type: 'digits', half: true, maxLength: 7 },
      ],
      summary: r => [[str(r.street), str(r.houseNumber)].filter(Boolean).join(' '), r.apartment ? `דירה ${str(r.apartment)}` : '', str(r.city), str(r.zip)].filter(Boolean).join(', '),
    };
    case 'bank': return {
      id, noun: 'חשבון', addLabel: '', multiple: false,
      fields: [
        { key: 'foreign', label: 'איפה החשבון?', type: 'choice', options: [{ value: 'no', label: 'חשבון בישראל' }, { value: 'yes', label: 'חשבון בחו״ל' }] },
        { key: 'bankCode', label: 'בנק', type: 'bank', required: true, showIf: r => r.foreign !== 'yes', hint: 'אפשר לחפש לפי שם או מספר הבנק' },
        { key: 'branchCode', label: 'סניף', type: 'branch', required: true, showIf: r => r.foreign !== 'yes', hint: 'מספר בן 3 ספרות, או חיפוש לפי שם הסניף או העיר' },
        { key: 'accountNumber', label: 'מספר חשבון', type: 'digits', required: true, maxLength: 13, showIf: r => r.foreign !== 'yes', hint: 'בלי מספר הבנק והסניף. אפסים בהתחלה — כמו שמופיע' },
        { key: 'country', label: 'מדינה', type: 'text', required: true, half: true, showIf: r => r.foreign === 'yes' },
        { key: 'bankName', label: 'שם הבנק', type: 'text', required: true, half: true, showIf: r => r.foreign === 'yes' },
        { key: 'iban', label: 'IBAN או מספר חשבון', type: 'text', required: true, showIf: r => r.foreign === 'yes' },
        { key: 'owners', label: 'על שם מי החשבון', type: 'choice', required: true, options: owner, hint: 'החזר מס מועבר רק לחשבון שרשום על שם הנישום' },
      ],
      summary: r => r.foreign === 'yes'
        ? [str(r.bankName), str(r.country), str(r.iban) && `חשבון ${str(r.iban)}`].filter(Boolean).join(' · ')
        : [str(r.bankName) || (r.bankCode ? `בנק ${str(r.bankCode)}` : ''), r.branchCode ? `סניף ${str(r.branchCode)}${r.branchName ? ` (${str(r.branchName)})` : ''}` : '', r.accountNumber ? `חשבון ${str(r.accountNumber)}` : '', r.owners ? `על שם ${label(owner, r.owners)}` : ''].filter(Boolean).join(' · '),
    };
    case 'employer': {
      // ‼ 20.10.2026 · בדוח השנתי (context.taxYear): חודשים בתוך השנה בלבד, «לפני {שנה}» ו«עדיין שם» — בלי «תאריך מדויק / רק שנה»
      const Y = Number(ctx?.taxYear) || 0;
      if (Y) return {
        id, noun: 'מעסיק', addLabel: '＋ עוד מעסיק', multiple: true,
        fields: [
          { key: 'name', label: 'שם המעסיק', type: 'text', required: true, placeholder: 'למשל: המדינה, בנק לאומי' },
          { key: 'startDate', label: 'מתי התחיל', type: 'monthIn', year: Y, edge: 'start', required: true, half: true },
          { key: 'endDate', label: 'עד מתי', type: 'monthIn', year: Y, edge: 'end', half: true },
        ],
        summary: r => [str(r.name), monthInText(r.startDate, Y, 'start'), monthInText(r.endDate, Y, 'end')].filter(Boolean).join(' · '),
      };
      return {
      id, noun: 'מעסיק', addLabel: '＋ עוד מעסיק', multiple: true,
      fields: [
        { key: 'name', label: 'שם המעסיק', type: 'text', required: true },
        { key: 'startDate', label: 'ממתי', type: 'dated', required: true, half: true },
        { key: 'endDate', label: 'עד מתי (אם הסתיים)', type: 'dated', half: true, hint: 'עדיין עובד/ת שם — להשאיר ריק' },
        { key: 'role', label: 'תפקיד', type: 'text' },
      ],
      summary: r => [str(r.name), datedText(r.startDate) && `מ-${datedText(r.startDate)}`, datedText(r.endDate) && `עד ${datedText(r.endDate)}`, str(r.role)].filter(Boolean).join(' · '),
    };
    }
    case 'property': return {
      id, noun: 'נכס', addLabel: '＋ עוד נכס', multiple: true,
      fields: [
        { key: 'address', label: 'כתובת הנכס', type: 'text', required: true, half: true },
        { key: 'city', label: 'יישוב (או מדינה)', type: 'text', required: true, half: true },
        { key: 'share', label: 'החלק שלכם בבעלות', type: 'percent', half: true, hint: 'למשל 100, או 50 אם יש שותף' },
        { key: 'purchaseDate', label: 'מתי נרכש', type: 'dated', half: true },
        { key: 'rentedFrom', label: 'ממתי מושכר', type: 'dated', half: true },
        { key: 'monthlyRent', label: 'שכר דירה בחודש (₪)', type: 'number', half: true },
        { key: 'soldDate', label: 'אם נמכר — מתי', type: 'dated', half: true, hint: 'לא נמכר — להשאיר ריק' },
      ],
      summary: r => [[str(r.address), str(r.city)].filter(Boolean).join(', '), r.share ? `${str(r.share)}%` : '', datedText(r.purchaseDate) && `נרכש ${datedText(r.purchaseDate)}`, datedText(r.rentedFrom) && `מושכר מ-${datedText(r.rentedFrom)}`, r.monthlyRent ? `${Number(r.monthlyRent).toLocaleString('he-IL')} ₪ לחודש` : '', datedText(r.soldDate) && `נמכר ${datedText(r.soldDate)}`].filter(Boolean).join(' · '),
    };
    case 'account': return {
      id, noun: 'חשבון', addLabel: '＋ עוד חשבון', multiple: true,
      fields: [
        { key: 'institution', label: 'הבנק או בית ההשקעות', type: 'text', required: true, half: true, placeholder: 'למשל: לאומי, מיטב, אלטשולר' },
        { key: 'kind', label: 'מה יש שם', type: 'choice', required: true, options: ACCOUNT_KINDS },
        { key: 'last4', label: '4 ספרות אחרונות של החשבון', type: 'digits', maxLength: 4, half: true, hint: 'כדי להבדיל בין שני חשבונות באותו גוף' },
        { key: 'owner', label: 'על שם מי', type: 'choice', required: true, options: owner },
        { key: 'openedDate', label: 'ממתי קיים', type: 'dated', half: true },
      ],
      summary: r => [str(r.institution), label(ACCOUNT_KINDS, r.kind), r.last4 ? `מסתיים ב-${str(r.last4)}` : '', r.owner ? `של ${label(owner, r.owner)}` : '', datedText(r.openedDate) && `מ-${datedText(r.openedDate)}`].filter(Boolean).join(' · '),
    };
    case 'fund': return {
      id, noun: 'קופה', addLabel: '＋ עוד קופה', multiple: true,
      fields: [
        { key: 'company', label: 'שם החברה', type: 'text', required: true, half: true, placeholder: 'למשל: מגדל, הראל, מור' },
        { key: 'fundType', label: 'סוג הקופה', type: 'choice', required: true, options: FUND_TYPES },
        { key: 'owner', label: 'של מי', type: 'choice', required: true, options: owner.filter(o => o.value !== 'both' && o.value !== 'other') },
      ],
      summary: r => [str(r.company), label(FUND_TYPES, r.fundType), r.owner ? `של ${label(owner, r.owner)}` : ''].filter(Boolean).join(' · '),
    };
    case 'business': return {
      id, noun: 'עסק', addLabel: '', multiple: false,
      fields: [
        { key: 'name', label: 'שם העסק', type: 'text', required: true, half: true, hint: 'אם אין שם — השם שלך' },
        { key: 'field', label: 'במה העסק עוסק', type: 'text', required: true, half: true },
        { key: 'startDate', label: 'ממתי', type: 'dated', half: true },
        { key: 'dealer', label: 'איך העסק רשום', type: 'choice', options: DEALER },
      ],
      summary: r => [str(r.name), str(r.field), datedText(r.startDate) && `מ-${datedText(r.startDate)}`, r.dealer ? label(DEALER, r.dealer) : ''].filter(Boolean).join(' · '),
    };
    case 'foreign': return {
      id, noun: 'מקור', addLabel: '＋ עוד מקור', multiple: true,
      fields: [
        { key: 'country', label: 'מדינה', type: 'text', required: true, half: true },
        { key: 'kind', label: 'מה בדיוק', type: 'choice', required: true, options: FOREIGN_KINDS },
        { key: 'institution', label: 'אצל איזה גוף', type: 'text', half: true, placeholder: 'למשל: Interactive Brokers' },
        { key: 'owner', label: 'של מי', type: 'choice', options: owner },
      ],
      summary: r => [str(r.country), label(FOREIGN_KINDS, r.kind), str(r.institution), r.owner ? `של ${label(owner, r.owner)}` : ''].filter(Boolean).join(' · '),
    };
    case 'vehicle': return {
      id, noun: 'רכב', addLabel: '＋ עוד רכב', multiple: true,
      fields: [
        { key: 'plate', label: 'מספר הרכב', type: 'digits', required: true, half: true, maxLength: 8 },
        { key: 'fromMonth', label: 'מאיזה חודש שימש לעסק', type: 'number', half: true, hint: '1 עד 12' },
        { key: 'toMonth', label: 'עד איזה חודש', type: 'number', half: true, hint: '1 עד 12' },
        { key: 'kmStart', label: 'ק״מ בתחילת השנה', type: 'number', half: true },
        { key: 'kmEnd', label: 'ק״מ בסוף השנה', type: 'number', half: true },
      ],
      summary: r => [`רכב ${str(r.plate)}`, r.fromMonth ? `חודשים ${str(r.fromMonth)}–${str(r.toMonth) || '12'}` : '', r.kmStart || r.kmEnd ? `ק״מ ${str(r.kmStart)}–${str(r.kmEnd)}` : ''].filter(Boolean).join(' · '),
    };
    case 'partners': return {
      id, noun: 'שותף', addLabel: '＋ עוד שותף', multiple: true,
      fields: [
        { key: 'name', label: 'שם', type: 'text', required: true, half: true },
        { key: 'idNumber', label: 'תעודת זהות', type: 'digits', maxLength: 9, half: true, israeliId: true },
        { key: 'share', label: 'החלק ברווחים (%)', type: 'percent', required: true, half: true },
        { key: 'works', label: 'עובד/ת בעסק', type: 'choice', options: [{ value: 'yes', label: 'כן' }, { value: 'no', label: 'לא' }], half: true },
      ],
      summary: r => [str(r.name), r.share ? `${str(r.share)}%` : '', r.works === 'yes' ? 'עובד/ת בעסק' : ''].filter(Boolean).join(' · '),
    };
    // ‼ 16.10.2026 · דמי לידה. 105 ימים אינם קבועים (הארכות, חלקי, העברה לבן הזוג) — לכן שני תאריכים, לא «תאריך לידה + 105».
    case 'maternityPeriod': return {
      id, noun: 'תקופה', addLabel: '', multiple: false,
      fields: [
        { key: 'from', label: 'מתאריך', type: 'date', required: true, half: true, allowFuture: true, hint: 'היום הראשון שעליו שולמו דמי לידה' },
        { key: 'to', label: 'עד תאריך', type: 'date', required: true, half: true, allowFuture: true, hint: 'היום האחרון — כפי שכתוב בהודעה מביטוח לאומי' },
      ],
      summary: r => [he(r.from) && `מ-${he(r.from)}`, he(r.to) && `עד ${he(r.to)}`].filter(Boolean).join(' '),
    };
    // ‼ 16.10.2026 · שנת הנישואין / הגירושין / הפטירה — שדה אחד; השאלה עצמה אומרת איזו שנה (intakeCatalog)
    case 'familyYear': return {
      id, noun: 'שנה', addLabel: '', multiple: false,
      fields: [{ key: 'year', label: 'שנה', type: 'digits', maxLength: 4, required: true, half: true, placeholder: 'למשל 2015', hint: 'בארבע ספרות' }],
      summary: r => str(r.year),
    };
    // ‼ 19.10.2026 · אירוע משפחתי בשנת הדוח: תאריך ועוד שאלה או שתיים — מסך אחד, לא שאלה לכל שדה.
    case 'deathEvent': return {
      id, noun: 'פרטים', addLabel: '', multiple: false,
      fields: [
        { key: 'date', label: 'תאריך הפטירה', type: 'date', required: true, half: true },
        { key: 'inheritance', label: 'יש צו ירושה או צו קיום צוואה?', type: 'choice', required: true,
          options: [{ value: 'yes', label: 'כן' }, { value: 'notYet', label: 'עוד לא' }, { value: 'unsure', label: 'לא יודע/ת' }] },
      ],
      summary: r => [he(r.date) && `נפטר/ה ${he(r.date)}`, r.inheritance === 'yes' ? 'יש צו' : r.inheritance === 'notYet' ? 'עוד אין צו' : ''].filter(Boolean).join(' · '),
    };
    case 'divorceEvent': return {
      id, noun: 'פרטים', addLabel: '', multiple: false,
      fields: [
        { key: 'date', label: 'מתי התגרשתם או נפרדתם?', type: 'date', required: true, half: true },
        { key: 'kids', label: 'אצל מי הילדים גרים?', type: 'choice',
          options: [{ value: 'me', label: 'אצלי' }, { value: 'other', label: 'אצל ההורה השני' }, { value: 'shared', label: 'משותף' }, { value: 'none', label: 'אין ילדים קטנים' }] },
        { key: 'alimony', label: 'יש תשלום מזונות?', type: 'choice',
          options: [{ value: 'pay', label: 'אני משלם/ת' }, { value: 'receive', label: 'אני מקבל/ת' }, { value: 'none', label: 'אין' }] },
      ],
      summary: r => [he(r.date) && `מ-${he(r.date)}`].filter(Boolean).join(' · '),
    };
    case 'marriageEvent': return {
      id, noun: 'פרטים', addLabel: '', multiple: false,
      fields: [
        { key: 'date', label: 'מתי התחתנתם?', type: 'date', required: true, half: true },
        { key: 'spouseName', label: 'שם בן/בת הזוג', type: 'text', required: true, half: true },
        { key: 'spouseWorked', label: 'בן/בת הזוג עבד/ה השנה?', type: 'choice',
          options: [{ value: 'salary', label: 'כן, כשכיר/ה' }, { value: 'business', label: 'כן, כעצמאי/ת' }, { value: 'no', label: 'לא' }] },
      ],
      summary: r => [he(r.date) && `מ-${he(r.date)}`, str(r.spouseName)].filter(Boolean).join(' · '),
    };
    // ‼ 21.10.2026 · סבב 2: לימודים, שחרור והתמחות — מקום אחד לכל אדם. מה שבתיק מגיע ממולא; תואר ⇐ «ואז התמחות?»
    //   (40ג(ג1): הנקודות יכולות להתחיל אחרי ההתמחות); שחרור ⇐ חודש ושנה (39: 36 חודשים מהחודש שאחרי).
    case 'studies': {
      const Y = Number(ctx?.taxYear) || new Date().getFullYear() - 1;
      const years = Array.from({ length: 10 }, (_, k) => String(Y - 9 + k)).map(y => ({ value: y, label: y }));
      const degree = (r: RecordValue) => ['ba', 'ma', 'pro'].includes(str(r.kind));
      return {
        id, noun: 'לימודים', addLabel: '＋ עוד לימודים או שירות', multiple: true,
        fields: [
          { key: 'kind', label: 'מה הסתיים?', type: 'choice', required: true, options: STUDY_KINDS },
          // 288 · צבא או שירות לאומי, וכמה חודשים — 39א: 23+ לגבר / 22+ לאישה = 2 נק׳ בשנה; 12+ = נקודה
          { key: 'branch', label: 'איזה שירות?', type: 'choice', required: true, options: [{ value: 'idf', label: 'צבא' }, { value: 'national', label: 'שירות לאומי' }], showIf: r => r.kind === 'army' },
          { key: 'month', label: 'חודש', type: 'pick', required: true, half: true, options: MONTH_NAMES.map((m, k) => ({ value: String(k + 1).padStart(2, '0'), label: m })), showIf: r => r.kind === 'army' },
          { key: 'year', label: 'באיזו שנה?', type: 'pick', required: true, half: true, options: years, showIf: r => !!r.kind },
          { key: 'months', label: 'כמה חודשי שירות?', type: 'number', half: true, hint: 'כתוב בתעודת השחרור', showIf: r => r.kind === 'army' },
          { key: 'intern', label: 'ואז התמחות?', type: 'choice', required: true, options: [{ value: 'no', label: 'לא' }, { value: 'yes', label: 'כן' }],
            showIf: r => degree(r) && !!str(r.year) && Number(r.year) >= Y - 8 },
          { key: 'internFrom', label: 'התמחות מ-', type: 'pick', required: true, half: true, options: years, showIf: r => degree(r) && r.intern === 'yes' },
          { key: 'internTo', label: 'עד', type: 'pick', required: true, half: true, options: years, showIf: r => degree(r) && r.intern === 'yes' },
        ],
        summary: r => [label(STUDY_KINDS, r.kind), r.kind === 'army' && str(r.month) ? `${MONTH_NAMES[Number(r.month) - 1]} ${str(r.year)}` : str(r.year),
          r.intern === 'yes' ? `התמחות ${str(r.internFrom)}–${str(r.internTo)}` : ''].filter(Boolean).join(' · '),
      };
    }
    // ‼ 23.10.2026 · 290: עלייה או חזרה — המעמד, חודש ושנה (סעיף 35: הנקודות לפי חודשי ותק, לא לפי שנה). השנים — כמו הריבוע («מ-{שנה-10}»).
    case 'aliyah': {
      const Y = Number(ctx?.taxYear) || new Date().getFullYear() - 1;
      return {
        id, noun: 'עלייה', addLabel: '', multiple: false,
        fields: [
          { key: 'status', label: 'מה מתאים?', type: 'choice', required: true, options: ALIYAH_STATUS },
          { key: 'month', label: 'חודש', type: 'pick', required: true, half: true, options: MONTH_OPTIONS },
          { key: 'year', label: 'שנה', type: 'pick', required: true, half: true, options: yearOptions(Y - 10, Y) },
        ],
        summary: r => [label(ALIYAH_STATUS, r.status), monthYear(r.month, r.year)].filter(Boolean).join(' · '),
      };
    }
    // ‼ 23.10.2026 · 290: אחוזי נכות וממתי — או «עוד לא נקבעו» (הריבוע הוא גם «מחלה קשה»). החודש נשאל רק כשהנכות התחילה
    //   בשנת הדוח או בשנה שלפניה (9(5): 185 יום בשנה); לפני כן — השנה מספיקה.
    case 'disability': {
      const Y = Number(ctx?.taxYear) || new Date().getFullYear() - 1;
      const years = [...yearOptions(Y - 29, Y).reverse(), { value: 'earlier', label: `לפני ${Y - 29}` }];
      const set = (r: RecordValue) => r.determined === 'yes';
      return {
        id, noun: 'נכות', addLabel: '', multiple: false,
        fields: [
          { key: 'determined', label: 'נקבעו אחוזי נכות?', type: 'choice', required: true, options: DISABILITY_SET },
          { key: 'percent', label: 'כמה אחוזים?', type: 'percent', required: true, half: true, hint: 'כמו שכתוב באישור', showIf: set },
          { key: 'year', label: 'מאיזו שנה?', type: 'pick', required: true, half: true, options: years, showIf: set },
          { key: 'month', label: 'מאיזה חודש?', type: 'pick', required: true, half: true, options: MONTH_OPTIONS, showIf: r => set(r) && Number(r.year) >= Y - 1 },
        ],
        summary: r => (!set(r) ? label(DISABILITY_SET, r.determined)
          : [r.percent !== undefined && r.percent !== '' ? `${str(r.percent)}%` : '', r.year === 'earlier' ? `לפני ${Y - 29}` : monthYear(r.month, r.year, 'מ-')].filter(Boolean).join(' · ')),
      };
    }
    // ‼ 290 · מין ותאריך לידה של בן/בת הזוג — מה שבתיק ממולא
    case 'spouseBasics': return {
      id, noun: 'פרטים', addLabel: '', multiple: false,
      fields: [
        { key: 'gender', label: 'אישה או גבר?', type: 'choice', required: true, options: GENDERS },
        { key: 'birthDate', label: 'תאריך לידה', type: 'date', required: true, half: true },
      ],
      summary: r => [label(GENDERS, r.gender), he(r.birthDate) && `נולד/ה ${he(r.birthDate)}`].filter(Boolean).join(' · '),
    };
    // ‼ 290 · סעיף 39ב — ימי מילואים כלוחם בשנה שלפני שנת המס
    case 'reserveDays': return {
      id, noun: 'ימים', addLabel: '', multiple: false,
      fields: [{ key: 'days', label: 'כמה ימים?', type: 'number', required: true, half: true, hint: 'כמו שכתוב באישור מצה״ל' }],
      summary: r => (str(r.days) ? `${str(r.days)} ימים` : ''),
    };
    // ‼ 290 · סעיף 45 — איזה ילד, ולזוג: למי מבני הזוג הנקודות (להורה אחד). הילדים — מהשאלה (context.kids), אין כרטיס בדף.
    case 'childDisability': {
      const kids = kidsOf(ctx, c);
      const parents = owner.filter(o => o.value === 'client' || o.value === 'spouse');
      return {
        id, noun: 'ילד', addLabel: '＋ עוד ילד', multiple: true,
        fields: [
          { key: 'child', label: 'איזה ילד?', type: 'choice', required: true, options: kids },
          { key: 'pointsTo', label: 'למי מכם הנקודות?', type: 'choice', required: true, options: parents, showIf: () => parents.length > 1, hint: 'הנקודות ניתנות להורה אחד' },
        ],
        summary: r => [label(kids, r.child), r.pointsTo ? `הנקודות ל${label(parents, r.pointsTo)}` : ''].filter(Boolean).join(' · '),
      };
    }
    // ‼ 290 · מזונות ילדים ששולמו — לכל ילד, בחודש (Child.monthlyAlimonyPaid)
    case 'childSupport': {
      const kids = kidsOf(ctx, c);
      return {
        id, noun: 'ילד', addLabel: '＋ עוד ילד', multiple: true, noneLabel: 'רק מזונות לבן/בת הזוג לשעבר',
        fields: [
          { key: 'child', label: 'לאיזה ילד?', type: 'choice', required: true, options: kids },
          { key: 'monthly', label: 'כמה בחודש (₪)?', type: 'number', required: true, half: true },
        ],
        summary: r => [label(kids, r.child), str(r.monthly) ? `${Number(r.monthly).toLocaleString('he-IL')} ₪ בחודש` : ''].filter(Boolean).join(' · '),
      };
    }
    case 'maternityAmounts': return {
      id, noun: 'סכומים', addLabel: '', multiple: false,
      fields: [
        { key: 'amount', label: 'כמה שולם (₪)', type: 'number', required: true, half: true, hint: 'הסכום באישור השנתי מביטוח לאומי' },
        { key: 'tax', label: 'כמה מס נוכה (₪)', type: 'number', half: true, hint: 'אם כתוב באישור; אפשר להשאיר ריק' },
      ],
      summary: r => [r.amount !== undefined && r.amount !== '' ? `שולם ${Number(r.amount).toLocaleString('he-IL')} ₪` : '', r.tax !== undefined && r.tax !== '' ? `מס ${Number(r.tax).toLocaleString('he-IL')} ₪` : ''].filter(Boolean).join(' · '),
    };
    case 'period': {
      const w = ctx?.periodNoun ?? 'השנה';
      // ‼ הצהרת הון — יום אחד: «כן / לא, נקנה אחרי / לא, נמכר לפני», בלי «חלק מהתקופה»
      const opts = ctx?.day ? [
        { value: 'all', label: 'כן' }, { value: 'after', label: 'לא — נקנה או נפתח אחרי התאריך' },
        { value: 'before', label: 'לא — נמכר או נסגר לפני התאריך' }, { value: 'unsure', label: 'לא בטוח/ה' },
      ] : IN_PERIOD(w);
      return {
        id, noun: 'תקופה', addLabel: '', multiple: false,
        fields: [
          { key: 'inPeriod', label: 'התשובה', type: 'choice', required: true, options: opts },
          { key: 'from', label: 'ממתי', type: 'dated', half: true, showIf: r => r.inPeriod === 'part' },
          { key: 'to', label: 'עד מתי', type: 'dated', half: true, showIf: r => r.inPeriod === 'part' },
        ],
        summary: r => [label(opts, r.inPeriod), datedText(r.from) && `מ-${datedText(r.from)}`, datedText(r.to) && `עד ${datedText(r.to)}`].filter(Boolean).join(' · '),
      };
    }
  }
}

// ── בדיקה ──────────────────────────────────────────────────────────────────────

const HEBREW_OK = /^[֐-׿0-9\s"'׳״\-.,()/]+$/;

export interface BankDirectory {
  banks: { code: string; name: string }[];
  branches: [string, string, string, string, number, string, string][];
  sourceUpdated?: string;
  source?: string;
}

/** שגיאה לכל שדה (שם השדה ← הודעה). ריק = תקין. */
export function validateRecord(schema: RecordSchema, r: RecordValue): Record<string, string> {
  const err: Record<string, string> = {};
  for (const f of schema.fields) {
    if (f.showIf && !f.showIf(r)) continue;
    const v = r[f.key];
    const empty = v == null || v === '' || (f.type === 'dated' && !(v as DatedValue).precision);
    if (empty) { if (f.required) err[f.key] = 'חסר'; continue; }
    if (f.type === 'monthIn') {
      const d = v as DatedValue;
      if (d.precision === 'month' && f.year && !(d.date ?? '').startsWith(String(f.year))) err[f.key] = `רק חודש ב-${f.year}`;
      continue;
    }
    if (f.type === 'digits' && !/^\d+$/.test(str(v))) err[f.key] = 'רק ספרות';
    else if (f.type === 'digits' && f.maxLength && str(v).length > f.maxLength) err[f.key] = `עד ${f.maxLength} ספרות`;
    else if (f.israeliId && !isValidIsraeliId(str(v))) err[f.key] = 'מספר תעודת זהות לא תקין — כדאי לבדוק שוב';
    else if (f.type === 'hebrewText' && !HEBREW_OK.test(str(v))) err[f.key] = 'בעברית';
    else if (f.type === 'number' && !(Number(v) >= 0)) err[f.key] = 'מספר לא תקין';
    else if (f.type === 'percent' && !(Number(v) > 0 && Number(v) <= 100)) err[f.key] = 'בין 1 ל-100';
    else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(str(v))) err[f.key] = 'תאריך לא תקין';
    else if (f.type === 'date' && !f.allowFuture && str(v) > new Date().toISOString().slice(0, 10)) err[f.key] = 'תאריך עתידי';
    else if (f.type === 'dated') {
      const d = v as DatedValue;
      if (d.precision !== 'unknown' && !(d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date))) err[f.key] = 'תאריך לא תקין';
    }
    else if (f.type === 'branch' && !/^\d{1,3}$/.test(str(v))) err[f.key] = 'מספר סניף — עד 3 ספרות';
    else if (f.type === 'bank' && !/^\d{1,2}$/.test(str(v))) err[f.key] = 'מספר בנק — עד 2 ספרות';
  }
  // ‼ 16.10.2026 · שנת אירוע משפחתי: ארבע ספרות, לא עתידית ולא לפני 1930 (familyStatusYearProblem — אותו כלל כמו בתיק)
  if (schema.id === 'familyYear' && !err.year && str(r.year)) {
    const p = /^\d{4}$/.test(str(r.year)) ? familyStatusYearProblem(Number(r.year)) : 'שנה בארבע ספרות';
    if (p) err.year = p;
  }
  // ‼ 20.10.2026 · מעסיק בשנת הדוח: הסיום לא לפני ההתחלה
  if (schema.id === 'employer' && !err.endDate) {
    const a = r.startDate as DatedValue | undefined; const b = r.endDate as DatedValue | undefined;
    if (a?.precision === 'month' && b?.precision === 'month' && (b.date ?? '') < (a.date ?? '')) err.endDate = 'הסיום לפני ההתחלה';
  }
  // ‼ 16.10.2026 · תקופה: הסיום לא לפני ההתחלה
  if (schema.id === 'maternityPeriod' && !err.from && !err.to && str(r.from) && str(r.to) && str(r.to) < str(r.from)) err.to = 'הסיום לפני ההתחלה';
  return err;
}

/** תשובה שלמה: רשימה (או «אין») עם כל רשומה תקינה. */
export interface RecordAnswer { items: RecordValue[]; none?: boolean }
export function answerValid(schema: RecordSchema, a: RecordAnswer): boolean {
  if (a.none) return !!schema.noneLabel && a.items.length === 0;
  if (!a.items.length) return false;
  return a.items.every(r => Object.keys(validateRecord(schema, r)).length === 0);
}

/** קוד בנק/סניף עם אפסים מובילים — כפי שנשמר. */
export const padCode = (v: unknown, w: number) => (str(v) ? str(v).padStart(w, '0') : '');

/** ניקוי לפני שליחה: שדות מוסתרים יורדים, קודים מקבלים אפסים מובילים, שמות בנק/סניף מהמאגר נשמרים לצד הקוד. */
export function cleanRecord(schema: RecordSchema, r: RecordValue, dir?: BankDirectory | null): RecordValue {
  const out: RecordValue = {};
  for (const f of schema.fields) {
    if (f.showIf && !f.showIf(r)) continue;
    const v = r[f.key];
    if (v == null || v === '') continue;
    if (f.type === 'bank') { out[f.key] = padCode(v, 2); continue; }
    if (f.type === 'branch') { out[f.key] = padCode(v, 3); continue; }
    if (f.type === 'text' || f.type === 'hebrewText' || f.type === 'digits') { out[f.key] = str(v); continue; }
    if (f.type === 'number' || f.type === 'percent') { out[f.key] = Number(v); continue; }
    out[f.key] = v;
  }
  if (schema.id === 'bank' && out.foreign !== 'yes' && dir) {
    const bank = dir.banks.find(b => b.code === out.bankCode);
    if (bank) out.bankName = bank.name;
    const br = dir.branches.find(b => b[0] === out.bankCode && b[1] === out.branchCode);
    if (br) out.branchName = br[2];
    out.branchInList = !!br;
  }
  if (r.id) out.id = r.id;
  return out;
}

// ── מהכרטיס: מה שידוע, לאישור או לתיקון ────────────────────────────────────────────

export function initialFromCard(id: RecordSchemaId, c: Client, role: 'client' | 'spouse' | 'couple'): RecordValue[] {
  const spouse = role === 'spouse';
  switch (id) {
    case 'children':
      // ‼ 290 · «איפה גר/ה» מהמשמורת שבתיק (רק להורה שאינו נשוי השדה מוצג; אצל נשוי הוא יורד בניקוי)
      return (c.children ?? []).map(ch => ({ id: ch.id, firstName: ch.firstName ?? '', birthDate: ch.birthDate || (ch.birthYear ? `${ch.birthYear}-01-01` : ''),
        ...(ch.custody && LIVES_OF_CUSTODY[ch.custody] ? { livesWith: LIVES_OF_CUSTODY[ch.custody] } : {}) }));
    // ‼ 290 · מה שבתיק — ממולא לאישור או לתיקון
    case 'aliyah': {
      const d = spouse ? c.spouse : c;
      if (!d) return [];
      const month = (n?: number | null) => (n && n >= 1 ? { month: String(n).padStart(2, '0') } : {});
      if (d.isNewImmigrant && d.aliyahYear) return [{ status: 'immigrant', year: String(d.aliyahYear), ...month(d.aliyahMonth) }];
      if (d.isReturningResident && d.returningYear) return [{ status: 'returning', year: String(d.returningYear) }];
      return [];
    }
    case 'disability': {
      const d = spouse ? c.spouse : c;
      return d && d.disabilityPercentage > 0 ? [{ determined: 'yes', percent: d.disabilityPercentage }] : [];
    }
    case 'spouseBasics': {
      const s = c.spouse;
      return s && (s.gender || s.birthDate) ? [{ ...(s.gender ? { gender: s.gender } : {}), ...(s.birthDate ? { birthDate: s.birthDate.slice(0, 10) } : {}) }] : [];
    }
    case 'reserveDays': {
      const d = spouse ? c.spouse : c;
      return d?.reserveCombatDaysPrevYear ? [{ days: d.reserveCombatDaysPrevYear }] : [];
    }
    case 'childDisability':
      return (c.children ?? []).filter(k => k.hasDisability).map(k => ({ child: k.id, ...(k.disabilityPointsTo ? { pointsTo: k.disabilityPointsTo } : {}) }));
    case 'childSupport':
      return (c.children ?? []).filter(k => (k.monthlyAlimonyPaid ?? 0) > 0).map(k => ({ child: k.id, monthly: k.monthlyAlimonyPaid }));
    case 'bank': {
      const b = (c.bankAccounts ?? []).find(x => x.isPrimary) ?? (c.bankAccounts ?? [])[0];
      if (!b) return [];
      const code = /^\d{1,2}$/.test(String((b as { bankCode?: string }).bankCode ?? '')) ? (b as { bankCode?: string }).bankCode : undefined;
      return [{ id: b.id, foreign: 'no', bankCode: code ?? '', bankName: b.bankName, branchCode: b.branchNumber ?? '', accountNumber: b.accountNumber ?? '' }];
    }
    // ‼ 21.10.2026 · לימודים וצבא: התואר והשחרור מהתיק (תואר שלישי נרשם כתואר שני — המשרד מכריע)
    case 'studies': {
      const d = spouse ? c.spouse : c;
      if (!d) return [];
      const out: RecordValue[] = [];
      if (d.hasAcademicDegree && d.academicDegreeYear) out.push({ kind: d.academicDegreeType === 'bachelor' || !d.academicDegreeType ? 'ba' : 'ma', year: String(d.academicDegreeYear) });
      const ry = d.completedIdf ? d.idfReleaseYear : d.completedNationalService ? d.nationalServiceYear : 0;
      if (ry) out.push({ kind: 'army', branch: d.completedIdf ? 'idf' : 'national', year: String(ry),
        ...(d.idfReleaseMonth ? { month: String(d.idfReleaseMonth).padStart(2, '0') } : {}),
        ...(d.serviceMonths ? { months: String(d.serviceMonths) } : {}) });
      return out;
    }
    case 'address':
      return c.city || c.address ? [{ city: c.city ?? '', street: (c as { street?: string }).street ?? c.address ?? '', houseNumber: (c as { houseNumber?: string }).houseNumber ?? '', zip: c.zipCode ?? '' }] : [];
    case 'employer':
      return (c.employers ?? []).filter(e => !!e.belongsToSpouse === spouse && !e.endDate)
        .map(e => ({ id: e.id, name: e.name, startDate: e.startDate ? { date: e.startDate.slice(0, 10), precision: /^\d{4}-01-01$/.test(e.startDate) ? 'year' : 'day' } : undefined, role: e.role ?? '' }));
    case 'business': {
      const b = (c.businesses ?? []).find(x => !!x.belongsToSpouse === spouse && !x.isClosed);
      // 251 · תאריך פתיחה מלא כשיש (טופס 821 / הכרטיס); אחרת — השנה בלבד
      return b ? [{ id: b.id, name: b.name, field: b.description ?? '', startDate: b.startDate ? { date: b.startDate.slice(0, 10), precision: 'day' } : b.startYear ? { date: `${b.startYear}-01-01`, precision: 'year' } : undefined }] : [];
    }
    default: return [];
  }
}

/** שורות לתצוגה («זה מה שידוע לנו») מתוך רשומות. */
export const recordLines = (schema: RecordSchema, items: RecordValue[]) => items.map(r => schema.summary(r)).filter(Boolean);

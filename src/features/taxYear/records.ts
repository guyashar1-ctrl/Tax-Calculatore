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

export type FieldType = 'text' | 'dated' | 'date' | 'number' | 'percent' | 'choice' | 'digits' | 'bank' | 'branch' | 'hebrewText';

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
const LIVES = [
  { value: 'withUs', label: 'גר/ה איתנו' }, { value: 'otherParent', label: 'אצל ההורה השני' }, { value: 'shared', label: 'משמורת משותפת' },
];
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
      id, noun: 'ילד/ה', addLabel: '＋ הוספת ילד/ה', multiple: true, noneLabel: 'אין ילדים',
      fields: [
        { key: 'firstName', label: 'שם פרטי', type: 'text', required: true, half: true },
        { key: 'birthDate', label: 'תאריך לידה', type: 'date', required: true, half: true },
        { key: 'livesWith', label: 'איפה גר/ה', type: 'choice', options: LIVES, showIf: () => c?.familyStatus !== 'married' && !ctx?.married, hint: 'רלוונטי להורה שאינו נשוי — נקודות הזיכוי תלויות בכך' },
      ],
      summary: r => [str(r.firstName) || 'ילד/ה', he(r.birthDate) && `נולד/ה ${he(r.birthDate)}`, r.livesWith ? label(LIVES, r.livesWith) : ''].filter(Boolean).join(' · '),
    };
    case 'address': return {
      id, noun: 'כתובת', addLabel: '', multiple: false,
      fields: [
        { key: 'city', label: 'יישוב', type: 'hebrewText', required: true, half: true },
        { key: 'street', label: 'רחוב', type: 'hebrewText', required: true, half: true },
        { key: 'houseNumber', label: 'מספר בית', type: 'text', required: true, half: true, maxLength: 8 },
        { key: 'apartment', label: 'דירה', type: 'text', half: true, maxLength: 8 },
        { key: 'zip', label: 'מיקוד', type: 'digits', half: true, maxLength: 7, hint: 'לא חובה' },
      ],
      summary: r => [[str(r.street), str(r.houseNumber)].filter(Boolean).join(' '), r.apartment ? `דירה ${str(r.apartment)}` : '', str(r.city), str(r.zip)].filter(Boolean).join(', '),
    };
    case 'bank': return {
      id, noun: 'חשבון', addLabel: '', multiple: false,
      fields: [
        { key: 'foreign', label: 'החשבון בחו״ל', type: 'choice', options: [{ value: 'no', label: 'חשבון בישראל' }, { value: 'yes', label: 'חשבון בחו״ל' }] },
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
    case 'employer': return {
      id, noun: 'מעסיק', addLabel: '＋ עוד מעסיק', multiple: true,
      fields: [
        { key: 'name', label: 'שם המעסיק', type: 'text', required: true },
        { key: 'startDate', label: 'ממתי', type: 'dated', required: true, half: true },
        { key: 'endDate', label: 'עד מתי (אם הסתיים)', type: 'dated', half: true, hint: 'עדיין עובד/ת שם — להשאיר ריק' },
        { key: 'role', label: 'תפקיד', type: 'text', hint: 'לא חובה' },
      ],
      summary: r => [str(r.name), datedText(r.startDate) && `מ-${datedText(r.startDate)}`, datedText(r.endDate) && `עד ${datedText(r.endDate)}`, str(r.role)].filter(Boolean).join(' · '),
    };
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
      return (c.children ?? []).map(ch => ({ id: ch.id, firstName: ch.firstName ?? '', birthDate: ch.birthDate || (ch.birthYear ? `${ch.birthYear}-01-01` : '') }));
    case 'bank': {
      const b = (c.bankAccounts ?? []).find(x => x.isPrimary) ?? (c.bankAccounts ?? [])[0];
      if (!b) return [];
      const code = /^\d{1,2}$/.test(String((b as { bankCode?: string }).bankCode ?? '')) ? (b as { bankCode?: string }).bankCode : undefined;
      return [{ id: b.id, foreign: 'no', bankCode: code ?? '', bankName: b.bankName, branchCode: b.branchNumber ?? '', accountNumber: b.accountNumber ?? '' }];
    }
    case 'address':
      return c.city || c.address ? [{ city: c.city ?? '', street: (c as { street?: string }).street ?? c.address ?? '', houseNumber: (c as { houseNumber?: string }).houseNumber ?? '', zip: c.zipCode ?? '' }] : [];
    case 'employer':
      return (c.employers ?? []).filter(e => !!e.belongsToSpouse === spouse && !e.endDate)
        .map(e => ({ id: e.id, name: e.name, startDate: e.startDate ? { date: e.startDate.slice(0, 10), precision: /^\d{4}-01-01$/.test(e.startDate) ? 'year' : 'day' } : undefined, role: e.role ?? '' }));
    case 'business': {
      const b = (c.businesses ?? []).find(x => !!x.belongsToSpouse === spouse && !x.isClosed);
      return b ? [{ id: b.id, name: b.name, field: b.description ?? '', startDate: b.startYear ? { date: `${b.startYear}-01-01`, precision: 'year' } : undefined }] : [];
    }
    default: return [];
  }
}

/** שורות לתצוגה («זה מה שידוע לנו») מתוך רשומות. */
export const recordLines = (schema: RecordSchema, items: RecordValue[]) => items.map(r => schema.summary(r)).filter(Boolean);

// ─── רשימות תיק המס — הגדרות שדה, נגזרות ונרמול ─────────────────────────────
//
// ‼ מה זה: הרשימות המובנות שהיו עד היום ניתנות לעריכה **רק** בעורך הישן
// (PersonalContactsTab) — ילדים, מעסיקים, נכסים, חשבונות בנק, קופות פנסיה,
// תיקי השקעות וחשבונות בחו״ל. הקובץ הזה מוציא מהעורך ההוא את *ההתנהגות*
// בלבד: אילו שדות יש לפריט, מה נגזר משינוי הרשימה, ואיך מנרמלים אותה.
//
// ‼ מה זה **לא**: אין כאן שום פריט תצוגה. הפריסה, הצפיפות והכניסה לעריכה
// נשארות של תיק המס (ListEditor + TaxFileTab). העורך הישן אינו מקור עיצוב.
//
// ‼ נגזרות מורמות בלבד: הוספת פריט מרימה דגל («יש פנסיה»), אבל הסרת פריט
// אינה מורידה אותו. הורדת דגל היא טענה עובדתית — «אין ללקוח פנסיה» — ושורה
// שנמחקה (אולי כפילות) אינה מספיקה כדי לטעון אותה. הדגל נשאר ניתן למענה
// במקום שלו: שורת «טרם ביררנו» או העריכה של אותו מקטע. העורך הישן כן הוריד
// אותם, וזו התנהגות שלא שיחזרנו במכוון.

import type { Client } from '../../types';
import {
  PROPERTY_TYPE_LABELS, CHILD_CUSTODY_LABELS, BANK_ACCOUNT_KIND_LABELS,
  PENSION_FUND_KIND_LABELS, INVESTMENT_ACCOUNT_KIND_LABELS, FOREIGN_ACCOUNT_TYPE_LABELS,
} from '../../types';

/** פריט רשימה כללי — לעריכה בלבד; הטיפוס האמיתי נשמר ב-Client. */
export type ListItem = Record<string, unknown> & { id: string };

export type ListFieldKind = 'text' | 'number' | 'money' | 'date' | 'bool' | 'select';

export interface ListField {
  key: string;
  label: string;
  kind: ListFieldKind;
  options?: [string, string][];
  /** חשיפה הדרגתית — השדה מופיע רק כשהתנאי מתקיים על הפריט עצמו. */
  when?: (item: ListItem) => boolean;
}

/** מפתחות הרשימות — כולם `GOVERNED_FACT_KEYS`, ולכן נשמרים במסלול העובדות. */
export type ListKey =
  | 'children' | 'employers' | 'properties' | 'bankAccounts'
  | 'pensionFunds' | 'investmentAccounts' | 'foreignAccounts';

export interface ListSpec {
  key: ListKey;
  /** שם הרשימה בהיסטוריית העובדות. */
  label: string;
  /** שם פריט בודד — «ילד», «מעסיק»… משמש לכותרת השורה ולכפתור ההוספה. */
  itemLabel: string;
  fields: ListField[];
  newItem: (index: number) => ListItem;
  /** פריט בלי הזיהוי המינימלי לא נשמר — כמו שורת עיסוק שלא נבחר בה סוג. */
  isEmpty: (item: ListItem) => boolean;
  /** נרמול על הרשימה כולה אחרי עריכה (למשל: חשבון ראשי יחיד). */
  normalize?: (items: ListItem[]) => ListItem[];
  /** דגלים שמורמים כשהרשימה מלאה. ראה ההערה בראש הקובץ. */
  raised?: (items: ListItem[]) => Partial<Client>;
}

const opts = (m: Record<string, string>): [string, string][] =>
  Object.entries(m) as [string, string][];

const uid = (p: string, i: number) => `${p}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`;

const NOTES: ListField = { key: 'notes', label: 'הערה', kind: 'text' };

export const LIST_SPECS: Record<ListKey, ListSpec> = {
  children: {
    key: 'children', label: 'ילדים', itemLabel: 'ילד/ה',
    fields: [
      { key: 'firstName', label: 'שם פרטי', kind: 'text' },
      { key: 'lastName', label: 'שם משפחה', kind: 'text' },
      { key: 'birthDate', label: 'תאריך לידה', kind: 'date' },
      { key: 'idNumber', label: 'ת.ז.', kind: 'text' },
      { key: 'custody', label: 'משמורת', kind: 'select', options: opts(CHILD_CUSTODY_LABELS) },
      { key: 'livesWithTaxpayer', label: 'גר/ה עם הנישום', kind: 'bool' },
      { key: 'hasDisability', label: 'ילד/ה עם נכות', kind: 'bool' },
      { key: 'disabilityPercentage', label: 'אחוז נכות', kind: 'number', when: i => i.hasDisability === true },
      { key: 'monthlyAlimonyReceived', label: 'מזונות שמתקבלים (לחודש)', kind: 'money' },
      { key: 'monthlyAlimonyPaid', label: 'מזונות שמשולמים (לחודש)', kind: 'money' },
      { key: 'educationCostsAnnual', label: 'הוצאות לימוד (לשנה)', kind: 'money' },
    ],
    newItem: i => ({ id: uid('child', i), firstName: '', birthDate: '', birthYear: 0, hasDisability: false }),
    // ‼ תאריך לידה הוא הזיהוי המינימלי: בלעדיו אין גיל, ובלי גיל אין נקודות זיכוי.
    isEmpty: i => !String(i.birthDate ?? '').trim() && !String(i.firstName ?? '').trim(),
    // ‼ birthYear נגזר מהתאריך ונשמר לתאימות — בדיוק כמו בעורך הישן.
    normalize: items => items.map(c => {
      const d = String(c.birthDate ?? '');
      const y = d ? parseInt(d.slice(0, 4), 10) : 0;
      return { ...c, birthYear: isNaN(y) ? 0 : y };
    }),
  },

  employers: {
    key: 'employers', label: 'מעבידים', itemLabel: 'מעסיק',
    fields: [
      { key: 'name', label: 'שם המעסיק', kind: 'text' },
      { key: 'taxId', label: 'ח.פ. / ע.מ.', kind: 'text' },
      { key: 'role', label: 'תפקיד', kind: 'text' },
      { key: 'startDate', label: 'תחילת עבודה', kind: 'date' },
      { key: 'endDate', label: 'סיום עבודה', kind: 'date' },
      { key: 'belongsToSpouse', label: 'המעסיק של בן/בת הזוג', kind: 'bool' },
      NOTES,
    ],
    newItem: i => ({ id: uid('emp', i), name: '' }),
    isEmpty: i => !String(i.name ?? '').trim(),
  },

  properties: {
    key: 'properties', label: 'נכסי מקרקעין', itemLabel: 'נכס',
    fields: [
      { key: 'type', label: 'סוג הנכס', kind: 'select', options: opts(PROPERTY_TYPE_LABELS) },
      { key: 'address', label: 'כתובת', kind: 'text' },
      { key: 'city', label: 'עיר', kind: 'text' },
      { key: 'sizeSqm', label: 'שטח (מ״ר)', kind: 'number' },
      { key: 'rooms', label: 'חדרים', kind: 'number' },
      { key: 'purchaseYear', label: 'שנת רכישה', kind: 'number' },
      { key: 'purchasePrice', label: 'מחיר רכישה', kind: 'money' },
      { key: 'isRented', label: 'מושכר', kind: 'bool' },
      { key: 'monthlyRent', label: 'שכ״ד לחודש', kind: 'money', when: i => i.isRented === true },
      {
        key: 'rentalTaxTrack', label: 'מסלול מיסוי לנכס', kind: 'select',
        options: [['exempt', 'פטור'], ['flat10', '10% מחזור'], ['regular', 'מסלול רגיל']],
        when: i => i.isRented === true,
      },
      NOTES,
    ],
    newItem: i => ({ id: uid('prop', i), type: 'apartment', address: '' }),
    isEmpty: i => !String(i.address ?? '').trim(),
    // ‼ propertyAddress הישן **לא** נכתב כאן: הוא אינו שדה מנוהל, והרשימה היא
    // המקור הקנוני. הערך הישן נשאר בכרטיס כפי שהוא, לא נמחק ולא מוגר.
    raised: items => (items.length > 0
      ? { hasResidentialProperty: true, numberOfProperties: items.length }
      : {}),
  },

  bankAccounts: {
    key: 'bankAccounts', label: 'חשבונות בנק', itemLabel: 'חשבון',
    fields: [
      { key: 'bankName', label: 'בנק', kind: 'text' },
      { key: 'branchNumber', label: 'מספר סניף', kind: 'text' },
      { key: 'branchName', label: 'שם הסניף', kind: 'text' },
      { key: 'accountNumber', label: 'מספר חשבון', kind: 'text' },
      { key: 'kind', label: 'סוג', kind: 'select', options: opts(BANK_ACCOUNT_KIND_LABELS) },
      { key: 'isPrimary', label: 'ראשי — להחזרי מס', kind: 'bool' },
      NOTES,
    ],
    newItem: i => ({ id: uid('bank', i), bankName: '', kind: 'checking', isPrimary: false }),
    isEmpty: i => !String(i.bankName ?? '').trim(),
    // ‼ ראשי אחד בלבד, ותמיד אחד כשיש חשבונות — החזר מס צריך יעד יחיד ומוגדר.
    // אותה חוקיות בדיוק שהייתה ב-updateBankAccount/removeBankAccount הישנים.
    normalize: items => {
      if (items.length === 0) return items;
      const firstPrimary = items.findIndex(b => b.isPrimary === true);
      const winner = firstPrimary >= 0 ? firstPrimary : 0;
      return items.map((b, i) => ({ ...b, isPrimary: i === winner }));
    },
  },

  pensionFunds: {
    key: 'pensionFunds', label: 'קופות פנסיה', itemLabel: 'קופה',
    fields: [
      { key: 'institutionName', label: 'חברה מנהלת', kind: 'text' },
      { key: 'productName', label: 'שם המוצר', kind: 'text' },
      { key: 'kind', label: 'סוג', kind: 'select', options: opts(PENSION_FUND_KIND_LABELS) },
      { key: 'isEmployerLinked', label: 'הפקדה דרך מעביד', kind: 'bool' },
      { key: 'hasSelfDeposits', label: 'הפקדות עצמאיות', kind: 'bool' },
      NOTES,
    ],
    newItem: i => ({ id: uid('pen', i), institutionName: '', kind: 'new_pension' }),
    isEmpty: i => !String(i.institutionName ?? '').trim(),
    raised: items => (items.length > 0 ? { hasPension: true } : {}),
  },

  investmentAccounts: {
    key: 'investmentAccounts', label: 'חשבונות השקעה', itemLabel: 'תיק',
    fields: [
      { key: 'institutionName', label: 'בית השקעות / בנק', kind: 'text' },
      { key: 'kind', label: 'סוג התיק', kind: 'select', options: opts(INVESTMENT_ACCOUNT_KIND_LABELS) },
      { key: 'accountNumber', label: 'מספר חשבון', kind: 'text' },
      { key: 'isClosed', label: 'התיק נסגר', kind: 'bool' },
      { key: 'closedYear', label: 'שנת הסגירה', kind: 'number', when: i => i.isClosed === true },
      NOTES,
    ],
    newItem: i => ({ id: uid('inv', i), institutionName: '', kind: 'broker_account' }),
    isEmpty: i => !String(i.institutionName ?? '').trim(),
    raised: items => (items.length > 0 ? { hasInvestments: true } : {}),
  },

  foreignAccounts: {
    key: 'foreignAccounts', label: 'חשבונות בחו״ל', itemLabel: 'חשבון בחו״ל',
    fields: [
      { key: 'type', label: 'סוג', kind: 'select', options: opts(FOREIGN_ACCOUNT_TYPE_LABELS) },
      { key: 'country', label: 'מדינה', kind: 'text' },
      { key: 'institutionName', label: 'מוסד / ברוקר', kind: 'text' },
      { key: 'accountNumber', label: 'מספר חשבון / IBAN', kind: 'text' },
      { key: 'estimatedValue', label: 'שווי משוער (₪)', kind: 'money' },
      { key: 'annualIncome', label: 'הכנסה שנתית (₪)', kind: 'money' },
      { key: 'foreignTaxPaid', label: 'מס ששולם בחו״ל (₪)', kind: 'money' },
      NOTES,
    ],
    newItem: i => ({ id: uid('fa', i), type: 'bank', country: '', institutionName: '' }),
    isEmpty: i => !String(i.country ?? '').trim() && !String(i.institutionName ?? '').trim(),
    raised: items => (items.length > 0 ? { hasForeignAssets: true } : {}),
  },
};

/** ערך שדה בתוך פריט, כמחרוזת לפקד. */
export function listFieldValue(item: ListItem, f: ListField): string {
  const v = item[f.key];
  if (f.kind === 'bool') return v === true ? 'true' : v === false ? 'false' : '';
  if (v == null) return '';
  return String(v);
}

/**
 * המרה חזרה לערך שנשמר. ‼ מספר ריק הוא `undefined` ולא `0` — אפס הוא טענה
 * («אין הכנסה»), וריק הוא היעדר ידיעה. `0` שהוקלד במפורש כן נשמר.
 */
export function coerceListField(f: ListField, raw: string): unknown {
  if (f.kind === 'bool') {
    const s = raw.trim();
    return s === 'true' ? true : s === 'false' ? false : undefined;
  }
  if (raw.trim() === '') return undefined;
  if (f.kind === 'number' || f.kind === 'money') {
    const n = Number(raw.replace(/[^\d.-]/g, ''));
    return isNaN(n) ? undefined : n;
  }
  // ‼ **בלי** trim תוך כדי הקלדה. עם trim, הרווח ב«בנק לאומי» נמחק ברגע
  // שהוקלד ולא היה אפשר להקליד שם עם רווח בכלל. הקיצוץ קורה בשמירה בלבד.
  return raw;
}

/** הרשימה המנוקה שנשמרת: טקסט מקוצץ, בלי פריטים ריקים, אחרי נרמול. */
export function cleanList(spec: ListSpec, items: ListItem[]): ListItem[] {
  const trimmed = items.map(item => {
    const out = { ...item };
    for (const f of spec.fields) {
      if (typeof out[f.key] === 'string') {
        const s = (out[f.key] as string).trim();
        out[f.key] = s === '' ? undefined : s;
      }
    }
    return out;
  });
  const kept = trimmed.filter(i => !spec.isEmpty(i));
  return spec.normalize ? spec.normalize(kept) : kept;
}

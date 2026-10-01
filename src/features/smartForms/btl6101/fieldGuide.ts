// ─── מדריך שדות 6101 — מה נכנס לכל שדה, מאיפה, ומה קורה כשחסר או סותר ─────────
// משמש את ניהול התבנית («מסמכים ללקוחות» ← התבנית). ‼ הניסוחים נגזרים מהכללים שבקוד
// (resolve.ts / template.ts) ולא מכריזים על התנהגות אחרת: «מאיפה בפועל» נלקח מהרצה של
// הפתרון על לקוחה סינתטית מלאה, כמו במחולל המלאי (scripts/gen-6101-inventory.mjs).

import type { FieldDef } from '../types';
import { CLIENT_DECLARED_KEYS, KEY_LABELS, SECTION_OF, resolve6101 } from './resolve';
import { BTL6101_PURPOSE_LABELS, DATE_KEYS, MONEY_KEYS, type Btl6101Data, type Btl6101Purpose } from './model';
import { FX_FULL } from './fixtures';
import { valueFor6101 } from './layout6101';

export type SourceCategory = 'card' | 'btl' | 'answer' | 'calc' | 'signature';

export const SOURCE_LABELS: Record<SourceCategory, string> = {
  card: 'כרטיס לקוח',
  btl: 'יישור קו ביטוח לאומי',
  answer: 'תשובה בבקשה',
  calc: 'חישוב',
  signature: 'חתימה',
};

/** צבע לכל מקור — מילוי חלש על הטופס, מסגרת מלאה כשנבחר. */
export const SOURCE_COLORS: Record<SourceCategory, string> = {
  card: '#2563eb',
  btl: '#0d9488',
  answer: '#d97706',
  calc: '#7c3aed',
  signature: '#db2777',
};

/** מפתח הנתון של שדה: «maritalStatus=married» / «email@local» / «occupations[0].from» ⇒ השם הבסיסי. */
export function dataKeyOf(f: FieldDef): string {
  if (f.dataKey.startsWith('occupations[')) return 'occupations';
  return f.dataKey.split(/[=@]/)[0];
}

export function categoryOf(f: FieldDef): SourceCategory {
  if (f.kind === 'signature') return 'signature';
  if (f.dataKey === 'declarationDate') return 'signature';
  switch (f.provenance) {
    case 'btl_sync': return 'btl';
    case 'filing': return 'answer';
    case 'derived': case 'system': return 'calc';
    default: return 'card';
  }
}

/** הסבר מתי השדה סותר — לפי הכללים ב-resolve.ts (סטטוס conflict). */
const CONFLICTS: Record<string, string> = {
  idNumber: 'ספרת הביקורת לא תקינה ⇒ «סותר» וחוסם נעילה עד תיקון בכרטיס',
  maritalStatus: 'בכרטיס מצב אחד ובב"ל אחר ⇒ «סותר — לבחור»; הכרטיס לא נדרס, מוצע הערך מב"ל',
  spouseIdNumber: 'שתי ת"ז שונות לבן/בת הזוג בכרטיס, או ספרת ביקורת לא תקינה ⇒ «סותר» וחוסם נעילה',
  bankAccount: 'בכרטיס שמורות רק ספרות אחרונות ⇒ «סותר» עד שמשלימים מספר מלא',
  withholdingFile: 'בכרטיס תיק אחד ובב"ל אחר ⇒ «סותר — לבחור»; מוצע הערך מב"ל',
};
const STALE: Record<string, string> = {
  occupations: 'נקרא מב"ל לפני יותר מ-90 יום ⇒ «ישן» — מומלץ לרענן מב"ל לפני ההגשה',
  changeFromDate: 'נקרא מב"ל לפני יותר מ-90 יום ⇒ «ישן» — מומלץ לרענן',
  incomeBefore: 'נקרא מב"ל לפני יותר מ-90 יום ⇒ «ישן» — מומלץ לרענן',
};

export interface FieldGuide {
  category: SourceCategory;
  dataLabel: string;
  section: string;
  from: string;
  example: string | null;
  /** איך הערך נכתב בטופס, במילים — null כשאין מה לומר (טקסט רגיל, ריבוע סימון). */
  format: string | null;
  ifMissing: string;
  ifConflict: string;
  when: string;
  declared: boolean;
}

let sampleCache: { fields: ReturnType<typeof resolve6101>['fields']; data: ReturnType<typeof resolve6101>['data'] } | null = null;
/** הרצה אחת של הפתרון על לקוחה סינתטית מלאה, כל התרחישים — «מאיפה בפועל» ודוגמה. */
function sample() {
  if (!sampleCache) {
    const all: Btl6101Purpose[] = ['multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'];
    const r = resolve6101({ client: FX_FULL, purposes: all, entered: {}, asOf: '2026-09-28', flags: { contactNotOwn: true, separateMailing: true } });
    sampleCache = { fields: r.fields, data: r.data };
  }
  return sampleCache;
}

/** כלל הכתיבה במילים — לא המחרוזת הטכנית שבמלאי. */
function formatText(f: FieldDef, key: string): string | null {
  if (f.kind === 'checkbox' || f.kind === 'signature') return null;
  if (f.kind === 'digits') {
    const n = (f.cells?.length ?? 1) - 1;
    if (f.groups && f.groups.length > 1) return `${n} משבצות — קידומת ומספר, ספרה בכל משבצת`;
    return `${n} משבצות — ספרה בכל משבצת${/idNumber|IdNumber/.test(key) ? '; אפס מוביל נשמר' : ''}`;
  }
  if (DATE_KEYS.has(key as keyof Btl6101Data) || /.(from|to)$/.test(f.dataKey)) return 'תאריך: יום/חודש/שנה';
  if (MONEY_KEYS.has(key as keyof Btl6101Data) || /nonWorkIncome$/.test(f.dataKey)) return 'סכום עם מפריד אלפים';
  if (f.dataKey === 'email@whole') return 'הכתובת המלאה — רק כשאינה נכנסת סביב ה-@ המודפס';
  if (f.dataKey.startsWith('email@')) return 'הכתובת מתפצלת לפני ה-@ ואחריו';
  if (f.overflow === 'shrink_wrap2') return 'מוקטן עד שנכנס; אם צריך — שתי שורות';
  return null;
}

const REQUIRED_TEXT: Record<string, string> = {
  always: 'חובה — בלי ערך השדה מסומן «חסר» בשלב הנתונים והנעילה לחתימה נחסמת',
  when_applicable: 'חובה רק כשהסעיף נבחר בהגשה — ואז, בלי ערך, הנעילה נחסמת',
  optional: 'רשות — נשאר ריק בטופס',
  signer: 'בלי חתימה הטופס לא נשמר כחתום ולא מוגש',
};

export function guideFor(f: FieldDef): FieldGuide {
  const key = dataKeyOf(f);
  const s = sample();
  const st = s.fields[key];
  const category = categoryOf(f);
  const declared = CLIENT_DECLARED_KEYS.has(key);
  const fromSample = st?.sourceLabel && st.status !== 'missing' && st.status !== 'not_applicable' ? st.sourceLabel : null;
  const from = category === 'signature'
    ? (f.kind === 'signature' ? (f.signer === 'spouse' ? 'חתימת בן/בת הזוג — במשרד או בקישור אישי' : 'חתימת המבוטח/ת — במשרד או בקישור אישי') : 'יום החתימה של המבוטח/ת (שעון ישראל)')
    : category === 'answer'
      ? (fromSample ? `מוצע מ: ${fromSample} — ונענה בהגשה` : 'נענה בהגשה עצמה (שלב «נתונים»)')
      : fromSample ?? (category === 'btl' ? 'ב"ל · רשימת עיסוקים / ההכנסה המוצהרת' : 'כרטיס הלקוח');
  let example: string | null = null;
  try {
    const v = valueFor6101(f, s.data);
    example = typeof v === 'boolean' ? (v ? 'מסומן ✗' : null) : v ? String(v).replace(/\|/g, ' ') : null;
  } catch { example = null; }
  const when = f.applies === 'always' ? 'בכל הגשה' : `רק כשבוחרים: ${f.applies.map(p => BTL6101_PURPOSE_LABELS[p as Btl6101Purpose] ?? p).join(' · ')}`;
  return {
    category,
    dataLabel: KEY_LABELS[key] ?? f.label,
    section: SECTION_OF[key] ?? '',
    from,
    example,
    format: formatText(f, key),
    ifMissing: REQUIRED_TEXT[f.required] ?? 'רשות',
    ifConflict: CONFLICTS[key] ?? STALE[key] ?? (category === 'answer' || category === 'signature'
      ? 'אין מקור שני להשוות — מה שנענה הוא מה שנכתב'
      : 'ערך שמזינים בהגשה גובר; הערך מהכרטיס נשמר כחלופה ל«חזרה»'),
    when,
    declared,
  };
}

/** כותרות המקטעים — אותן כותרות כמו בשלב הנתונים של ההגשה. */
export const SECTION_TITLES: Record<string, string> = {
  identity: 'פרטי המבוטח', marital: 'מצב משפחתי', spouse: 'פרטי בן/בת הזוג', address: 'כתובת מגורים',
  contact: 'טלפון ומייל', altContact: 'איש קשר', digital: 'הודעות דיגיטליות', mailing: 'מען למכתבים',
  bank: 'חשבון בנק', occupations: 'עיסוקים בשנתיים האחרונות', start: 'התחלת עבודה כעצמאי',
  change: 'שינוי בהיקף השעות או ההכנסה', spouseBusiness: 'בן/בת זוג עובד/ת בעסק', end: 'הפסקת עבודה כעצמאי',
  employees: 'הפסקת העסקת עובדים', business: 'כתובת העסק', declaration: 'הצהרה וחתימה',
};

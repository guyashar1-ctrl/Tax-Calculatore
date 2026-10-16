// ─── טופס 821 — רישום לצרכי מס ערך מוסף (משולב עם 821א') · עוסק יחיד ──────
// נמדד ב-15.10.2026 על הקובץ הרשמי (2 עמודים, 612×792 נק', בלי סיבוב, בלי
// AcroForm; SHA-256 למטה) — רינדור בסקאלה 8 וזיהוי קווים/משבצות/ריבועים.
//
// ‼ עמוד 2 (מנהלי חברה, רישום שותפות), «עסק בהקמה» ו«לשימוש המשרד» אינם ממופים — הטופס
// כאן לעוסק יחיד בלבד (השרת חוסם חברה). «הצהרת המייצג» (שם, תאריך, חותמת המשרד) — רק בקובץ
// החתום שהמשרד מפיק (officeRep.ts); הלקוח רואה אותה ריקה.
// ‼ המיקוד בטופס בנוי לחמש ספרות; מיקוד בן 7 ספרות נכתב כטקסט ממורכז במשבצות.
// ‼ 16.10.2026 (משוב גיא): תאריך פתיחת העסק הוא **תאריך מלא בכרטיס** (businesses[].startDate — מסך «פתיחת תיק»
//   של רשות המסים מבקש תאריך מלא), ועל הטופס נכתבות רק חודש ושנה. ענף כלכלי — רשימה סגורה (industries.ts),
//   נשמר בכרטיס העסק ומודפס בשורת «תאור מלא של פעילות העסק». «לא קיים נכס» — תיבות הנכס נשארות ריקות.

import type { FieldDef, SmartFormTemplate, UnmappedArea } from '../types';
import type { CfData, ClientFormDef, CfScreen } from './types';
import { addressLine, ilDate, splitPhone, todayIso } from './format';
import { INDUSTRIES, industryShort } from './industries';
import { ruleView } from '../../taxRules/registry';

export const VAT821_KEY = 'vat-821';
export const VAT821_SHA256 = 'ff5f46569e32b5085597e461d1c0d779c9f486c311cc38c94da184285c33d8d6';

type Base = Omit<FieldDef, 'fontSize' | 'minFontSize' | 'overflow' | 'required' | 'clientConfirmation' | 'provenance' | 'applies' | 'formatRule' | 'source' | 'page'>
  & Partial<Pick<FieldDef, 'fontSize' | 'minFontSize' | 'overflow' | 'required' | 'clientConfirmation' | 'provenance' | 'applies' | 'formatRule' | 'source' | 'page'>>;
const f = (d: Base): FieldDef => ({
  page: 1, fontSize: 10, minFontSize: 6, overflow: 'shrink', required: 'optional', clientConfirmation: false,
  provenance: 'client_record', applies: 'always', formatRule: 'as_is', source: '—', ...d,
});

// ── שלוש שורות כתובת זהות במבנה: עסק · מען למכתבים · מגורים ─────────────────
const ROWS = [
  { key: 'biz', label: 'כתובת העסק', y: 588, h: 16, fs: 10, phone: 'מס׳ טלפון בעסק' },
  { key: 'mail', label: 'מען להתכתבות', y: 544, h: 16, fs: 10, phone: 'טלפון נייד/פקס' },
  { key: 'home', label: 'כתובת המגורים', y: 505.6, h: 10.8, fs: 9, phone: 'מס׳ טלפון בבית' },
] as const;

// ‼ כתובת העסק וכתובת המגורים — חובה (כמו ב-_scf_spec); מען להתכתבות — רק כשיש.
const addressFields: FieldDef[] = ROWS.flatMap(r => [
  f({ id: `${r.key}.street`, dataKey: `${r.key}.street`, label: `${r.label} — רחוב`, section: r.label,
    box: { x: 452, y: r.y, w: 109.5, h: r.h }, kind: 'text', align: 'right', fontSize: r.fs, required: r.key === 'mail' ? 'optional' : 'always' }),
  f({ id: `${r.key}.house`, dataKey: `${r.key}.house`, label: `${r.label} — מספר`, section: r.label,
    box: { x: 392.5, y: r.y, w: 57, h: r.h }, kind: 'text', align: 'center', fontSize: r.fs }),
  f({ id: `${r.key}.city`, dataKey: `${r.key}.city`, label: `${r.label} — שם הישוב`, section: r.label,
    box: { x: 325.5, y: r.y, w: 63.5, h: r.h }, kind: 'text', align: 'center', fontSize: r.fs, required: r.key === 'mail' ? 'optional' : 'always' }),
  f({ id: `${r.key}.zip`, dataKey: `${r.key}.zip`, label: `${r.label} — מיקוד`, section: r.label,
    box: { x: 191.5, y: r.y, w: 58, h: r.h }, kind: 'text', align: 'center', fontSize: r.fs, formatRule: '7 ספרות כטקסט ממורכז (בטופס 5 משבצות)' }),
  f({ id: `${r.key}.phone`, dataKey: `${r.key}.phone`, label: `${r.label} — ${r.phone}`, section: r.label,
    box: { x: 111.5, y: r.y, w: 64.5, h: r.h }, kind: 'text', align: 'center', fontSize: r.fs }),
  f({ id: `${r.key}.prefix`, dataKey: `${r.key}.prefix`, label: `${r.label} — קידומת`, section: r.label,
    box: { x: 51.5, y: r.y, w: 44.5, h: r.h }, kind: 'text', align: 'center', fontSize: r.fs }),
]);

const ID_CELLS = [50.5, 64.75, 78.75, 92.75, 107, 121, 135.25, 149.25, 163.25, 177.25];
const TURNOVER_CELLS = [250.4, 265.1, 279.75, 294.4, 309.05, 323.7, 338.4, 353.0, 367.6, 382.45, 397.05];
const OPEN_CELLS = [170.5, 183.9, 197.1, 210.5, 223.75];
const EMP_CELLS = [50.5, 61.6, 72.75, 83.9];
const cellsBox = (c: number[], y: number, h: number) => ({ x: c[0], y, w: c[c.length - 1] - c[0], h });
const sq = (x: number, y: number) => ({ x, y, w: 6.5, h: 6.4 });

const FIELDS: FieldDef[] = [
  f({ id: 'entity.individual', dataKey: 'entity.individual', label: 'סוג ישות — יחיד', section: 'פרטי העוסק', box: { x: 297.1, y: 657.6, w: 6.6, h: 6.4 },
    kind: 'checkbox', overflow: 'none', required: 'always', provenance: 'system', source: 'עוסק יחיד (חברה נחסמת בפתיחה)' }),
  f({ id: 'idNumber', dataKey: 'idNumber', label: 'מס׳ זהות / מס׳ תיק עוסק', section: 'פרטי העוסק',
    box: cellsBox(ID_CELLS, 646, 24), cells: ID_CELLS, kind: 'digits', fontSize: 12, minFontSize: 12, overflow: 'reject', required: 'always',
    source: 'clients.id_number', formatRule: '9 ספרות', validation: 'ת"ז ישראלית תקינה' }),
  f({ id: 'dealerName', dataKey: 'dealerName', label: 'שם העוסק', section: 'פרטי העוסק', box: { x: 326, y: 647, w: 186, h: 18 },
    kind: 'text', align: 'right', fontSize: 11, overflow: 'shrink_wrap2', required: 'always', source: 'clients.first_name + last_name' }),
  f({ id: 'businessName', dataKey: 'businessName', label: 'שם העסק', section: 'פרטי העוסק', box: { x: 326, y: 627, w: 188, h: 18 },
    kind: 'text', align: 'right', fontSize: 11, overflow: 'shrink_wrap2', required: 'always', source: 'clients.business_name ‖ businesses[].name' }),
  ...addressFields,
  f({ id: 'activity.1', dataKey: 'activity.1', label: 'תאור הפעילות (שורה 1)', section: 'פעילות העסק', box: { x: 51, y: 468.2, w: 311, h: 11 }, line: 467.8,
    kind: 'text', align: 'right', required: 'always', source: 'businesses[].description ‖ business_description + ענף (businesses[].industry)', formatRule: 'תיאור העיסוק, ואז «ענף: …»; פיצול לפי מילים לשלוש שורות' }),
  f({ id: 'activity.2', dataKey: 'activity.2', label: 'תאור הפעילות (שורה 2)', section: 'פעילות העסק', box: { x: 51, y: 453.2, w: 511, h: 11.4 }, line: 452.8,
    kind: 'text', align: 'right' }),
  f({ id: 'activity.3', dataKey: 'activity.3', label: 'תאור הפעילות (שורה 3)', section: 'פעילות העסק', box: { x: 51, y: 438.1, w: 511, h: 11.4 }, line: 437.7,
    kind: 'text', align: 'right' }),
  f({ id: 'turnover', dataKey: 'turnover', label: 'מחזור שנתי משוער (ש"ח)', section: 'פעילות העסק', box: cellsBox(TURNOVER_CELLS, 419.8, 12.4), cells: TURNOVER_CELLS,
    kind: 'digits', fontSize: 10, minFontSize: 10, overflow: 'reject', required: 'always', provenance: 'filing', clientConfirmation: true,
    formatRule: 'ספרות, מיושר לימין' }),
  f({ id: 'openDate', dataKey: 'openDate', label: 'תאריך פתיחת העסק (חודש · שנה)', section: 'פעילות העסק', box: cellsBox(OPEN_CELLS, 419.8, 12.4), cells: OPEN_CELLS,
    groups: [2, 2], kind: 'digits', fontSize: 10, minFontSize: 10, overflow: 'reject', required: 'always', provenance: 'client_record', clientConfirmation: true,
    source: 'businesses[].startDate (תאריך מלא בכרטיס)', formatRule: 'MM · YY (שתי ספרות לשנה, כמו בטופס)' }),
  f({ id: 'employees', dataKey: 'employees', label: 'מס׳ מועסקים כולל בעל העסק', section: 'פעילות העסק', box: cellsBox(EMP_CELLS, 409, 23), cells: EMP_CELLS,
    kind: 'digits', fontSize: 10, minFontSize: 10, overflow: 'reject', required: 'always', provenance: 'filing', clientConfirmation: true }),
  f({ id: 'bank.name', dataKey: 'bank.name', label: 'שם הבנק', section: 'חשבון בנק', box: { x: 432, y: 346.2, w: 129, h: 10.4 }, kind: 'text', align: 'right', fontSize: 9.5,
    // ‼ שם הבנק נגזר מהקוד בשמירה — הסימון «חסר» יושב על סמל הבנק, לא כאן
    source: 'clients.bank_accounts (הראשי) — נגזר מסמל הבנק' }),
  f({ id: 'bank.branch', dataKey: 'bank.branch', label: 'הסניף', section: 'חשבון בנק', box: { x: 312, y: 346.2, w: 116, h: 10.4 }, kind: 'text', align: 'center', fontSize: 9.5, required: 'always' }),
  f({ id: 'bank.code', dataKey: 'bank.code', label: 'סמל הבנק', section: 'חשבון בנק', box: { x: 192.5, y: 346.2, w: 116, h: 10.4 }, kind: 'text', align: 'center', fontSize: 9.5, required: 'always' }),
  f({ id: 'bank.account', dataKey: 'bank.account', label: 'מס׳ חשבון', section: 'חשבון בנק', box: { x: 52.5, y: 346.2, w: 136, h: 10.4 }, kind: 'text', align: 'center', fontSize: 9.5, required: 'always' }),
  f({ id: 'prop.street', dataKey: 'prop.street', label: 'הנכס — רחוב', section: 'הנכס', box: { x: 232, y: 327.2, w: 111, h: 10.2 }, kind: 'text', align: 'right', fontSize: 9.5,
    required: 'when_applicable', source: 'כתובת העסק' }),
  f({ id: 'prop.house', dataKey: 'prop.house', label: 'הנכס — מספר', section: 'הנכס', box: { x: 165, y: 327.2, w: 43, h: 10.2 }, kind: 'text', align: 'center', fontSize: 9.5 }),
  f({ id: 'prop.city', dataKey: 'prop.city', label: 'הנכס — ישוב', section: 'הנכס', box: { x: 52, y: 327.2, w: 86, h: 10.2 }, kind: 'text', align: 'right', fontSize: 9.5, required: 'when_applicable' }),
  ...([
    ['store', 'חנות', 550.4, 304.4], ['office', 'משרד', 520.5, 304.4], ['lot', 'מגרש', 487.0, 304.4],
    ['warehouse', 'מחסן', 454.75, 304.4], ['other', 'אחר', 550.4, 290.3],
  ] as const).map(([v, label, x, y]) => f({ id: `prop.kind.${v}`, dataKey: `prop.kind=${v}`, label: `תיאור הנכס — ${label}`, section: 'הנכס',
    box: sq(x, y), kind: 'checkbox', overflow: 'none', provenance: 'filing', clientConfirmation: true, required: 'when_applicable' })),
  f({ id: 'prop.kindOther', dataKey: 'prop.kindOther', label: 'תיאור הנכס — אחר (פרט)', section: 'הנכס', box: { x: 424, y: 289.6, w: 86, h: 9.5 },
    kind: 'text', align: 'right', fontSize: 8.5, minFontSize: 5.5, provenance: 'filing' }),
  f({ id: 'prop.owned', dataKey: 'prop.tenure=owned', label: 'בבעלות של', section: 'הנכס', box: sq(407.4, 309.0), kind: 'checkbox', overflow: 'none', provenance: 'filing', required: 'when_applicable' }),
  f({ id: 'prop.ownerName', dataKey: 'prop.ownerName', label: 'בבעלות של — שם', section: 'הנכס', box: { x: 193, y: 307.6, w: 167, h: 11 },
    kind: 'text', align: 'right', fontSize: 9.5, provenance: 'filing' }),
  f({ id: 'prop.rented', dataKey: 'prop.tenure=rented', label: 'בהשכרה ל', section: 'הנכס', box: sq(407.4, 274.6), kind: 'checkbox', overflow: 'none', provenance: 'filing', required: 'when_applicable' }),
  f({ id: 'prop.landlord', dataKey: 'prop.landlord', label: 'בהשכרה ל — שם', section: 'הנכס', box: { x: 193, y: 273.2, w: 168, h: 11 },
    kind: 'text', align: 'right', fontSize: 9.5, provenance: 'filing' }),
  f({ id: 'prop.value', dataKey: 'prop.value', label: 'שווי הנכס', section: 'הנכס', box: { x: 119, y: 270, w: 69.5, h: 16 }, kind: 'text', align: 'center', fontSize: 9.5, provenance: 'filing' }),
  f({ id: 'prop.rent', dataKey: 'prop.rent', label: 'דמי השכירות השנתיים', section: 'הנכס', box: { x: 52, y: 270, w: 63, h: 16 }, kind: 'text', align: 'center', fontSize: 9.5, provenance: 'filing' }),
  f({ id: 'signDate', dataKey: 'signDate', label: 'תאריך', section: 'חתימה', box: { x: 458, y: 164, w: 103, h: 11 }, line: 163.65,
    kind: 'text', align: 'center', provenance: 'system', source: 'יום החתימה' }),
  f({ id: 'signerName', dataKey: 'signerName', label: 'שם העוסק / שם המוסמך לחתום', section: 'חתימה', box: { x: 232, y: 164, w: 136, h: 11 }, line: 163.65,
    kind: 'text', align: 'center' }),
  f({ id: 'signature', dataKey: 'signature', label: 'חתימה וחותמת', section: 'חתימה', box: { x: 52, y: 164.1, w: 96, h: 19 }, line: 163.65,
    kind: 'signature', overflow: 'none', required: 'signer', signer: 'client', provenance: 'filing' }),
  // ── הצהרת המייצג: המשרד מוסיף אחרי שהלקוח חתם — שם, תאריך, וחותמת המשרד מ«פרטי המשרד» (שמכילה גם את החתימה) ──
  f({ id: 'rep.date', dataKey: 'repDate', label: 'הצהרת המייצג — תאריך', section: 'הצהרת המייצג', box: { x: 458, y: 109, w: 103, h: 11 }, line: 108.6,
    kind: 'text', align: 'center', provenance: 'system', source: 'יום החתימה של הלקוח' }),
  f({ id: 'rep.name', dataKey: 'repName', label: 'הצהרת המייצג — שם המייצג', section: 'הצהרת המייצג', box: { x: 252, y: 109, w: 104, h: 11 }, line: 108.6,
    kind: 'text', align: 'center', provenance: 'system', source: 'פרטי המשרד — שם מלא' }),
  f({ id: 'rep.stamp', dataKey: 'repStamp', label: 'הצהרת המייצג — חתימה וחותמת', section: 'הצהרת המייצג', box: { x: 52, y: 109.2, w: 96, h: 26 },
    kind: 'signature', overflow: 'none', signer: 'office', provenance: 'system', source: 'פרטי המשרד ← חתימה וחותמת (החותמת)' }),
];

const UNMAPPED: UnmappedArea[] = [
  { id: 'settlementCode', page: 1, box: { x: 263.8, y: 505, w: 46.6, h: 100 }, label: 'סמל ישוב (×3)', reason: 'קוד למ"ס — המשרד ממלא לפי הצורך' },
  { id: 'otherEntity', page: 1, box: { x: 200, y: 607, w: 110, h: 60 }, label: 'סוגי ישות אחרים', reason: 'עוסק יחיד בלבד' },
  { id: 'inSetup', page: 1, box: { x: 50, y: 195, w: 513, h: 60 }, label: 'עסק בהקמה', reason: 'לא בגרסה זו' },
  { id: 'officeUse', page: 1, box: { x: 50, y: 20, w: 513, h: 70 }, label: 'לשימוש המשרד', reason: 'של רשות המסים' },
  { id: 'page2', page: 2, box: { x: 0, y: 0, w: 612, h: 792 }, label: 'עמוד 2 — מנהלי חברה ושותפות', reason: 'עוסק יחיד בלבד' },
];

export const VAT821_TEMPLATE: SmartFormTemplate = {
  key: VAT821_KEY,
  title: 'רישום לצרכי מס ערך מוסף (821)',
  authority: 'vat',
  formNumber: '821',
  version: '821',
  sha256: VAT821_SHA256,
  mappingVersion: 1,
  pageCount: 2,
  pageSize: { width: 612, height: 792 },
  fileUrl: '/templates/vat-821.pdf',
  fields: FIELDS,
  unmapped: UNMAPPED,
};

// ── מהנתונים לטופס ──────────────────────────────────────────────────────────
/** פיצול תיאור הפעילות לשלוש שורות לפי מילים (שורה 1 קצרה — ליד הכותרת). */
export function splitActivity(text: string | undefined): [string, string, string] {
  const words = (text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const caps = [56, 98];
  const lines: string[] = ['', '', ''];
  let i = 0;
  for (const w of words) {
    while (i < 2 && (lines[i] ? lines[i].length + 1 + w.length : w.length) > caps[i]) i++;
    lines[i] = lines[i] ? `${lines[i]} ${w}` : w;
  }
  return [lines[0], lines[1], lines[2]];
}

/** שורת «תאור מלא של פעילות העסק»: תיאור העיסוק, ואז הענף הכלכלי מהרשימה הסגורה. */
export function activityText(d: CfData): string {
  const ind = industryShort(d.industry);
  const act = (d.activity ?? '').trim();
  return [act, ind ? `ענף: ${ind}` : ''].filter(Boolean).join(' · ');
}

/** «לא קיים נכס» (מסך פתיחת תיק של רשות המסים) — תיבות הנכס נשארות ריקות. */
export const propertyExists = (d: CfData) => d.propExists !== 'no';

/** סוג העוסק לפי המחזור המשוער מול תקרת «עוסק פטור» (כלל micro.turnoverCeiling לשנת הפתיחה / השנה). */
export function dealerKindOf(d: CfData): 'exempt' | 'licensed' | undefined {
  const t = Number(d.turnover);
  if (!d.turnover || !Number.isFinite(t)) return undefined;
  const year = Number((d.openDate ?? '').slice(0, 4)) || Number(todayIso().slice(0, 4));
  const ceiling = ruleView('micro.turnoverCeiling', year)?.entry?.value ?? ruleView('micro.turnoverCeiling', year - 1)?.entry?.value;
  if (typeof ceiling !== 'number') return undefined;
  return t <= ceiling ? 'exempt' : 'licensed';
}
export const DEALER_KIND_LABEL = { exempt: 'עוסק פטור', licensed: 'עוסק מורשה' } as const;

/** מען למכתבים: מהכרטיס; אחרת — כשהלקוח אמר שזה כמו המגורים. */
function mailOf(d: CfData) {
  if (d.mailStreet || d.mailCity) return { street: d.mailStreet, house: d.mailHouse, city: d.mailCity, zip: d.mailZip };
  if (d.mailSame === 'yes') return { street: d.homeStreet, house: d.homeHouse, city: d.homeCity, zip: d.homeZip };
  return { street: undefined, house: undefined, city: undefined, zip: undefined };
}

function rowOf(key: string, d: CfData) {
  if (key === 'biz') return { street: d.bizStreet, house: d.bizHouse, city: d.bizCity, zip: d.bizZip, phone: d.bizPhone };
  if (key === 'mail') return { ...mailOf(d), phone: d.mobile };
  return { street: d.homeStreet, house: d.homeHouse, city: d.homeCity, zip: d.homeZip, phone: d.landline };
}

const money = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v).toLocaleString('en-US') : v);

function valueOf(field: FieldDef, d: CfData): string | boolean | undefined {
  const k = field.dataKey;
  if (k === 'entity.individual') return true;
  if (k === 'idNumber') return d.idNumber;
  if (k === 'dealerName' || k === 'signerName') return [d.firstName, d.lastName].filter(Boolean).join(' ') || undefined;
  if (k === 'businessName') return d.businessName;
  if (k.startsWith('activity.')) return splitActivity(activityText(d))[Number(k.slice(-1)) - 1] || undefined;
  if (k === 'turnover') return d.turnover;
  if (k === 'employees') return d.employees;
  if (k === 'openDate') {
    // ‼ תאריך מלא מהכרטיס (openDate); הגשות ישנות (לפני 251) שמרו רק חודש (openMonth)
    const m = (d.openDate ?? '').match(/^(\d{4})-(\d{2})-\d{2}$/) ?? (d.openMonth ?? '').match(/^(\d{4})-(\d{2})$/);
    return m ? `${m[2]}|${m[1].slice(2)}` : undefined;
  }
  if (k === 'signDate') return ilDate(d.signDate);
  if (k === 'repDate') return d.repName ? ilDate(d.repDate || d.signDate) : undefined;
  if (k === 'repName') return d.repName;
  const [row, part] = k.split('.');
  if (row === 'biz' || row === 'mail' || row === 'home') {
    const r = rowOf(row, d);
    if (part === 'prefix') return splitPhone(r.phone)[0] || undefined;
    if (part === 'phone') return splitPhone(r.phone)[1] || undefined;
    return (r as Record<string, string | undefined>)[part];
  }
  if (row === 'bank') {
    return part === 'name' ? d.bankName : part === 'branch' ? d.bankBranch : part === 'code' ? d.bankCode : part === 'account' ? d.bankAccount : undefined;
  }
  if (k.startsWith('prop.kind=')) return d.propKind === k.split('=')[1];
  if (k.startsWith('prop.tenure=')) return d.propTenure === k.split('=')[1];
  if (k === 'prop.kindOther') return d.propKind === 'other' ? d.propKindOther : undefined;
  if (k === 'prop.ownerName') return d.propTenure === 'owned' ? d.propParty : undefined;
  if (k === 'prop.landlord') return d.propTenure === 'rented' ? d.propParty : undefined;
  if (k === 'prop.value') return money(d.propValue);
  if (k === 'prop.rent') return d.propTenure === 'rented' ? money(d.propRent) : undefined;
  if (k === 'prop.street') return d.bizStreet;
  if (k === 'prop.house') return d.bizHouse;
  if (k === 'prop.city') return d.bizCity;
  return undefined;
}

// ── השאלון ───────────────────────────────────────────────────────────────────
const fullName = (d: CfData) => [d.firstName, d.lastName].filter(Boolean).join(' ');
const YES_NO = [{ value: 'yes', label: 'כן' }, { value: 'no', label: 'לא' }];

const SCREENS: CfScreen[] = [
  {
    id: 'identity', identity: true, title: 'הפרטים שלך', hint: 'כפי שהם רשומים בתעודת הזהות.',
    fields: [
      { key: 'firstName', label: 'שם פרטי', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'lastName', label: 'שם משפחה', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'idNumber', label: 'מספר זהות', input: 'id', store: 'card', required: true, half: true },
    ],
  },
  {
    id: 'home', title: 'כתובת המגורים וטלפון', hint: 'הכתובת שבה את/ה גר/ה היום.',
    fields: [
      { key: 'homeCity', label: 'יישוב', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'homeStreet', label: 'רחוב', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'homeHouse', label: 'מספר בית', input: 'house', store: 'card', half: true },
      { key: 'homeZip', label: 'מיקוד (לא חובה)', input: 'zip', store: 'card', half: true },
      { key: 'mobile', label: 'טלפון נייד', input: 'phone', store: 'card', half: true },
      { key: 'landline', label: 'טלפון בבית (לא חובה)', input: 'phone', store: 'card', half: true },
    ],
  },
  {
    id: 'business', title: 'העסק', hint: 'השם שבו העסק יירשם, ומה בדיוק הוא עושה.',
    why: 'מע״מ קובע לפי תיאור הפעילות את ענף העסק. כדאי לפרט — כולל פעילות משנית אם יש.',
    fields: [
      { key: 'businessName', label: 'שם העסק', input: 'text', store: 'card', required: true },
      { key: 'industry', label: 'ענף כלכלי', input: 'select', store: 'card', required: true, options: INDUSTRIES,
        hint: 'הענף הכללי שבו העסק פועל — כפי שרשות המסים מסווגת.' },
      { key: 'activity', label: 'מה בדיוק העסק עושה?', input: 'textarea', store: 'card', required: true, placeholder: 'לדוגמה: עיצוב גרפי ובניית אתרים לעסקים קטנים' },
    ],
  },
  {
    id: 'bizAddress', title: 'איפה העסק פועל?',
    hint: d => (d.bizAtHome === 'yes' && d.homeStreet ? `כתובת העסק תירשם: ${addressLine(d.homeStreet, d.homeHouse, d.homeCity)}` : 'הכתובת שבה מתבצעת הפעילות.'),
    // ‼ כתובת עסק שכבר בכרטיס אינה נשאלת שוב; נשאלה בטופס הזה ⇒ נשארת לעריכה
    showIf: d => !(d.bizStreet || d.bizCity) || !!d.bizAtHome,
    fields: [
      { key: 'bizAtHome', label: 'העסק פועל מהבית (מכתובת המגורים)?', input: 'choice', store: 'filing', options: YES_NO, required: true },
      { key: 'bizCity', label: 'יישוב', input: 'hebrew', store: 'card', required: d => d.bizAtHome === 'no', showIf: d => d.bizAtHome === 'no', half: true },
      { key: 'bizStreet', label: 'רחוב', input: 'hebrew', store: 'card', required: d => d.bizAtHome === 'no', showIf: d => d.bizAtHome === 'no', half: true },
      { key: 'bizHouse', label: 'מספר', input: 'house', store: 'card', showIf: d => d.bizAtHome === 'no', half: true },
      { key: 'bizZip', label: 'מיקוד (לא חובה)', input: 'zip', store: 'card', showIf: d => d.bizAtHome === 'no', half: true },
      { key: 'bizPhone', label: 'טלפון העסק (לא חובה)', input: 'phone', store: 'card', half: true, suggest: d => d.mobile },
    ],
    toSave: (v, d) => (v.bizAtHome === 'yes'
      ? { ...v, bizStreet: d.homeStreet, bizHouse: d.homeHouse, bizCity: d.homeCity, bizZip: d.homeZip }
      : v),
  },
  {
    id: 'mail', title: 'לאן לשלוח מכתבים ממע״מ?',
    showIf: d => !(d.mailStreet || d.mailCity) || !!d.mailSame,
    fields: [
      { key: 'mailSame', label: 'לכתובת המגורים?', input: 'choice', store: 'filing', options: YES_NO, required: true },
      { key: 'mailCity', label: 'יישוב', input: 'hebrew', store: 'card', required: d => d.mailSame === 'no', showIf: d => d.mailSame === 'no', half: true },
      { key: 'mailStreet', label: 'רחוב', input: 'hebrew', store: 'card', required: d => d.mailSame === 'no', showIf: d => d.mailSame === 'no', half: true },
      { key: 'mailHouse', label: 'מספר', input: 'house', store: 'card', showIf: d => d.mailSame === 'no', half: true },
      { key: 'mailZip', label: 'מיקוד (לא חובה)', input: 'zip', store: 'card', showIf: d => d.mailSame === 'no', half: true },
    ],
  },
  {
    id: 'opening', always: true, title: 'פתיחת העסק',
    hint: d => {
      const k = dealerKindOf(d);
      return k ? `הערכה מספיקה — המשרד יעבור על זה איתך. לפי המחזור: ${DEALER_KIND_LABEL[k]}.` : 'הערכה מספיקה — המשרד יעבור על זה איתך.';
    },
    why: 'לפי המחזור המשוער מע״מ קובע אם תירשם/י כעוסק מורשה או כעוסק פטור.',
    fields: [
      // ‼ תאריך מלא (הכרטיס + מסך «פתיחת תיק» של הרשות); על הטופס — חודש ושנה. הגשה ישנה עם openMonth מציעה את ה-1 בחודש.
      { key: 'openDate', label: 'מאיזה תאריך העסק פועל (או יפעל)?', input: 'date', store: 'card', required: true, half: true, allowFuture: true,
        suggest: d => (d.openMonth && /^\d{4}-\d{2}$/.test(d.openMonth) ? `${d.openMonth}-01` : undefined) },
      { key: 'employees', label: 'כמה עובדים בעסק, כולל אותך?', input: 'number', store: 'filing', required: true, half: true, suggest: () => '1' },
      { key: 'turnover', label: 'מחזור שנתי משוער (בשקלים)', input: 'money', store: 'filing', required: true, half: true },
      // סוג העוסק נגזר מהמחזור — נשמר עם המסך (לכרטיס העסק כשנוצר), לא נשאל
      { key: 'dealerKind', label: 'סוג עוסק (לפי המחזור)', input: 'choice', store: 'filing', showIf: () => false, derive: dealerKindOf,
        options: [{ value: 'exempt', label: 'עוסק פטור' }, { value: 'licensed', label: 'עוסק מורשה' }] },
    ],
  },
  {
    id: 'bank', title: 'חשבון בנק', hint: 'לכאן מע״מ יחזיר כספים, אם יגיעו לך החזרים.',
    fields: [
      { key: 'bankCode', label: 'בנק', input: 'bank', store: 'card', required: true },
      { key: 'bankBranch', label: 'מספר סניף', input: 'branch', store: 'card', required: true, half: true },
      { key: 'bankAccount', label: 'מספר חשבון', input: 'account', store: 'card', required: true, half: true },
    ],
  },
  {
    id: 'property', always: true, title: 'המקום שבו העסק פועל',
    hint: d => (d.bizStreet ? `${addressLine(d.bizStreet, d.bizHouse, d.bizCity)}` : 'הנכס שבו מתבצעת הפעילות.'),
    why: 'מע״מ שואל אם לעסק יש נכס (משרד, חנות, מחסן, חדר בבית). עסק שפועל אצל הלקוחות או בדרכים — בלי נכס קבוע — מסמן «לא קיים נכס», ותיבות הנכס בטופס נשארות ריקות.',
    fields: [
      { key: 'propExists', label: 'יש לעסק נכס שבו הוא פועל?', input: 'choice', store: 'filing', required: true,
        options: [{ value: 'yes', label: 'קיים נכס' }, { value: 'no', label: 'לא קיים נכס' }],
        suggest: d => (d.propKind || d.propTenure ? 'yes' : undefined) },
      { key: 'propKind', label: 'מה הנכס?', input: 'choice', store: 'filing', required: propertyExists, showIf: propertyExists,
        options: [{ value: 'office', label: 'משרד' }, { value: 'store', label: 'חנות' }, { value: 'warehouse', label: 'מחסן' }, { value: 'lot', label: 'מגרש' }, { value: 'other', label: 'אחר' }],
        suggest: d => (d.bizAtHome === 'yes' ? 'other' : undefined) },
      { key: 'propKindOther', label: 'מה בדיוק?', input: 'text', store: 'filing', showIf: d => propertyExists(d) && d.propKind === 'other', required: d => propertyExists(d) && d.propKind === 'other',
        suggest: d => (d.bizAtHome === 'yes' ? 'דירת מגורים' : undefined) },
      { key: 'propTenure', label: 'הנכס בבעלות או בשכירות?', input: 'choice', store: 'filing', required: propertyExists, showIf: propertyExists,
        options: [{ value: 'owned', label: 'בבעלות' }, { value: 'rented', label: 'בשכירות' }] },
      { key: 'propParty', label: 'על שם מי הנכס?', input: 'text', store: 'filing', showIf: d => propertyExists(d) && d.propTenure === 'owned', half: true, suggest: d => fullName(d) },
      { key: 'propParty', label: 'ממי שוכרים? (שם המשכיר)', input: 'text', store: 'filing', showIf: d => propertyExists(d) && d.propTenure === 'rented', half: true },
      { key: 'propRent', label: 'דמי שכירות לשנה (בשקלים)', input: 'money', store: 'filing', showIf: d => propertyExists(d) && d.propTenure === 'rented', half: true },
      { key: 'propValue', label: 'שווי הנכס (לא חובה)', input: 'money', store: 'filing', showIf: d => propertyExists(d) && d.propTenure === 'owned', half: true },
    ],
  },
];

const SAMPLE: CfData = {
  firstName: 'ישראל', lastName: 'ישראלי', idNumber: '000000018', mobile: '050-1234567', landline: '04-8123456',
  homeStreet: 'הרצל', homeHouse: '12', homeCity: 'חיפה', homeZip: '3303912',
  businessName: 'ישראלי עיצובים', industry: 'M', activity: 'עיצוב גרפי, מיתוג ובניית אתרים לעסקים קטנים, כולל הדפסות והפקת חומרי שיווק',
  bizAtHome: 'yes', bizStreet: 'הרצל', bizHouse: '12', bizCity: 'חיפה', bizZip: '3303912', bizPhone: '050-1234567',
  mailSame: 'yes', openDate: '2026-11-01', employees: '1', turnover: '180000', dealerKind: 'licensed',
  bankCode: '12', bankName: 'בנק הפועלים', bankBranch: '600', bankAccount: '123456',
  propExists: 'yes', propKind: 'other', propKindOther: 'דירת מגורים', propTenure: 'owned', propParty: 'ישראל ישראלי', signDate: '2026-10-15',
  repName: 'שם המייצג לדוגמה',
};

export const VAT821: ClientFormDef = {
  key: 'vat-821',
  template: VAT821_TEMPLATE,
  clientTitle: 'רישום העסק במע״מ (טופס 821)',
  authorityLabel: 'מע״מ',
  intro: 'הטופס לפתיחת תיק עוסק במע״מ. רוב הפרטים כבר אצלנו — נשאר להשלים כמה דברים על העסק ולחתום.',
  declaration: 'אני מצהיר/ה שכל הפרטים בטופס נכונים ומלאים, ומתחייב/ת לנהל פנקסי חשבונות כדין ולהודיע למע״מ על כל שינוי בעסק. ידוע לי שמסירת פרטים לא נכונים היא עבירה על החוק.',
  screens: SCREENS,
  valueOf,
  // ‼ «לא קיים נכס» ⇒ אף תיבה בחלק הנכס אינה מצוירת (וגם לא מסומנת כחסרה)
  isActive: (field, d) => (field.id.startsWith('prop.') ? propertyExists(d) : true),
  fieldRequired,
  statusNote: d => { const k = dealerKindOf(d); return k ? `לפי המחזור: ${DEALER_KIND_LABEL[k]}` : undefined; },
  questionKeys,
  markerGroups: [
    { id: 'prop.kind', label: 'תיאור הנכס — יש לסמן אחד', fieldIds: ['prop.kind.store', 'prop.kind.office', 'prop.kind.lot', 'prop.kind.warehouse', 'prop.kind.other'], required: propertyExists },
    { id: 'prop.tenure', label: 'הנכס בבעלות או בהשכרה — יש לסמן אחד', fieldIds: ['prop.owned', 'prop.rented'], required: propertyExists },
  ],
  sample: SAMPLE,
};

// ── סימון על הטופס: מה חובה בהגשה הזו, ואיזו שאלה ממלאת כל תיבה ─────────────
function fieldRequired(field: FieldDef, d: CfData): boolean {
  if (field.required === 'always') return true;
  if (field.required === 'when_applicable') return field.id.startsWith('prop.') ? propertyExists(d) : false;
  return false;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
function questionKeys(field: FieldDef): string[] {
  const k = field.dataKey;
  if (k === 'idNumber') return ['idNumber'];
  if (k === 'dealerName' || k === 'signerName') return ['firstName', 'lastName'];
  if (k === 'businessName') return ['businessName'];
  if (k.startsWith('activity.')) return ['activity', 'industry'];
  if (k === 'turnover') return ['turnover'];
  if (k === 'employees') return ['employees'];
  if (k === 'openDate') return ['openDate'];
  const [row, part] = k.split('.');
  if (row === 'biz') return part === 'phone' || part === 'prefix' ? ['bizPhone'] : ['bizAtHome', 'biz' + cap(part)];
  if (row === 'home') return part === 'phone' || part === 'prefix' ? ['landline'] : ['home' + cap(part)];
  if (row === 'mail') return part === 'phone' || part === 'prefix' ? ['mobile'] : ['mailSame', 'mail' + cap(part)];
  if (row === 'bank') return part === 'name' || part === 'code' ? ['bankCode'] : part === 'branch' ? ['bankBranch'] : ['bankAccount'];
  if (k.startsWith('prop.kind=')) return ['propExists', 'propKind'];
  if (k.startsWith('prop.tenure=')) return ['propExists', 'propTenure'];
  if (k === 'prop.kindOther') return ['propKindOther'];
  if (k === 'prop.ownerName' || k === 'prop.landlord') return ['propParty'];
  if (k === 'prop.value') return ['propValue'];
  if (k === 'prop.rent') return ['propRent'];
  if (k.startsWith('prop.')) return ['propExists', 'bizAtHome', 'bizStreet', 'bizCity'];
  return [];
}

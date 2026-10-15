// ─── טופס 4440 (12.2009) — תצהיר בדבר נשואים החיים בנפרד · רשות המסים ─────
// נמדד ב-15.10.2026 על הקובץ הרשמי (עמוד אחד, 595×842 נק', בלי סיבוב, בלי
// AcroForm; SHA-256 למטה) — מרינדור בסקאלה 8 וזיהוי קווים, משבצות ת.ז. וריבועי
// סימון (scratchpad: lines.mjs / segs.mjs). לא מטקסט שחולץ (הקובץ בקידוד גופן מותאם).
//
// ‼ בטופס שתי עמודות: «בן הזוג» (ימין) ו«בת הזוג» (שמאל). הלקוח בעמודה לפי
// המגדר שבכרטיס, ובן/בת הזוג בשנייה. נחתם רק טור הלקוח; אישור עו״ד ומספר תיק
// אינם ממופים (UNMAPPED).

import type { FieldDef, SmartFormTemplate, UnmappedArea } from '../types';
import type { CfData, ClientFormDef, CfScreen } from './types';
import { addressLine, ilDate, phoneDisplay } from './format';

export const ITA4440_KEY = 'ita-4440';
export const ITA4440_SHA256 = '6cec4c26b718306c799ae1f8c6f35fc023b79df9e3a4c009e72c83fb3e747265';

type Base = Omit<FieldDef, 'fontSize' | 'minFontSize' | 'overflow' | 'required' | 'clientConfirmation' | 'provenance' | 'applies' | 'formatRule' | 'source' | 'page'>
  & Partial<Pick<FieldDef, 'fontSize' | 'minFontSize' | 'overflow' | 'required' | 'clientConfirmation' | 'provenance' | 'applies' | 'formatRule' | 'source' | 'page'>>;
const f = (d: Base): FieldDef => ({
  page: 1, fontSize: 10, minFontSize: 6.5, overflow: 'shrink', required: 'optional', clientConfirmation: false,
  provenance: 'client_record', applies: 'always', formatRule: 'as_is', source: '—', ...d,
});

// ── עמודות: M = «בן הזוג» (ימין), F = «בת הזוג» (שמאל) ──────────────────────
const COL = {
  M: {
    last: { x: 413.5, w: 123.5 }, first: { x: 287.5, w: 123.5 }, phone: { x: 287.5, w: 144 }, addr: { x: 287.5, w: 249.5 },
    id: [433.4, 441.1, 453.3, 465.5, 477.7, 489.8, 502.1, 514.2, 526.4, 538.1],
    year: { x: 370.5, w: 47.5 }, other: { x: 292, w: 149 },
    chkSalary: { x: 527.0, y: 332.0 }, chkBusiness: { x: 375.4, y: 332.0 }, chkOther: { x: 527.0, y: 308.0 },
    sig: { x: 294.5, w: 77 }, date: { x: 452.5, w: 77.5 },
  },
  F: {
    last: { x: 156, w: 123.5 }, first: { x: 29.5, w: 124 }, phone: { x: 29.5, w: 145 }, addr: { x: 29.5, w: 250 },
    id: [175.8, 183.8, 196.0, 208.2, 220.4, 232.5, 244.7, 256.9, 269.1, 280.5],
    year: { x: 113, w: 47.5 }, other: { x: 34.5, w: 149.5 },
    chkSalary: { x: 269.7, y: 332.0 }, chkBusiness: { x: 118.1, y: 332.0 }, chkOther: { x: 269.7, y: 308.0 },
    sig: { x: 37, w: 77.5 }, date: { x: 195.2, w: 77.5 },
  },
} as const;
const COL_LABEL = { M: 'בן הזוג', F: 'בת הזוג' } as const;
const SQ = 6.4;

const columnFields = (c: 'M' | 'F'): FieldDef[] => {
  const g = COL[c];
  const L = COL_LABEL[c];
  return [
    f({ id: `${c}.lastName`, dataKey: `${c}.lastName`, label: `${L} — שם משפחה`, section: L, box: { ...g.last, y: 462, h: 21 },
      kind: 'text', align: 'right', fontSize: 11, overflow: 'shrink_wrap2', required: 'always', source: 'clients.last_name / spouse_last_name' }),
    f({ id: `${c}.firstName`, dataKey: `${c}.firstName`, label: `${L} — שם פרטי`, section: L, box: { ...g.first, y: 462, h: 21 },
      kind: 'text', align: 'right', fontSize: 11, overflow: 'shrink_wrap2', required: 'always', source: 'clients.first_name / spouse_first_name' }),
    f({ id: `${c}.idNumber`, dataKey: `${c}.idNumber`, label: `${L} — מספר זהות`, section: L,
      box: { x: g.id[0], y: 428, w: g.id[g.id.length - 1] - g.id[0], h: 12 }, cells: [...g.id], baseline: 429.8,
      kind: 'digits', fontSize: 10, minFontSize: 10, overflow: 'reject', required: 'always',
      source: 'clients.id_number / spouse_id_number', formatRule: '9 ספרות', validation: 'ת"ז ישראלית תקינה' }),
    f({ id: `${c}.phone`, dataKey: `${c}.phone`, label: `${L} — טלפון/נייד`, section: L, box: { ...g.phone, y: 428, h: 20 },
      kind: 'text', align: 'center', source: 'clients.phone / spouse_phone', formatRule: '050-1234567' }),
    f({ id: `${c}.address`, dataKey: `${c}.address`, label: `${L} — כתובת`, section: L, box: { ...g.addr, y: 393, h: 21 },
      kind: 'text', align: 'right', overflow: 'shrink_wrap2', required: 'always',
      source: 'הלקוח: clients.address + city · בן/בת הזוג: נשאל בטופס (גר/ה בנפרד)' }),
    f({ id: `${c}.incomeYear`, dataKey: `${c}.incomeYear`, label: `${L} — שנת המס`, section: L,
      box: { ...g.year, y: 356.6, h: 11 }, line: 356.2, kind: 'text', align: 'center', provenance: 'filing', source: 'השנה הקודמת' }),
    f({ id: `${c}.incSalary`, dataKey: `${c}.incSalary`, label: `${L} — משכר עבודה`, section: L,
      box: { ...g.chkSalary, w: SQ, h: SQ }, kind: 'checkbox', overflow: 'none', provenance: 'filing', clientConfirmation: true }),
    f({ id: `${c}.incBusiness`, dataKey: `${c}.incBusiness`, label: `${L} — מעסק/ממשלח יד`, section: L,
      box: { ...g.chkBusiness, w: SQ, h: SQ }, kind: 'checkbox', overflow: 'none', provenance: 'filing', clientConfirmation: true }),
    f({ id: `${c}.incOther`, dataKey: `${c}.incOther`, label: `${L} — ממקור אחר`, section: L,
      box: { ...g.chkOther, w: SQ, h: SQ }, kind: 'checkbox', overflow: 'none', provenance: 'filing', clientConfirmation: true }),
    f({ id: `${c}.incOtherText`, dataKey: `${c}.incOtherText`, label: `${L} — מקור אחר (פרט)`, section: L,
      box: { ...g.other, y: 305.9, h: 11 }, line: 305.6, kind: 'text', align: 'right', provenance: 'filing', clientConfirmation: true }),
    f({ id: `${c}.signature`, dataKey: `${c}.signature`, label: `${L} — חתימה`, section: L,
      box: { ...g.sig, y: 252.2, h: 28 }, line: 252.1, kind: 'signature', overflow: 'none', required: 'signer', signer: 'client', provenance: 'filing' }),
    f({ id: `${c}.signDate`, dataKey: `${c}.signDate`, label: `${L} — תאריך החתימה`, section: L,
      box: { ...g.date, y: 252.4, h: 12 }, line: 252.1, kind: 'text', align: 'center', provenance: 'system', source: 'יום החתימה' }),
  ];
};

const FIELDS: FieldDef[] = [
  f({ id: 'taxOffice', dataKey: 'taxOffice', label: 'אל: פקיד השומה', section: 'כותרת', box: { x: 424, y: 739.8, w: 54, h: 12 }, line: 739.4,
    kind: 'text', align: 'center', minFontSize: 6, source: 'clients.tax_office_name' }),
  f({ id: 'marriageDate', dataKey: 'marriageDate', label: 'רשומים כנשואים החל מתאריך', section: 'הצהרה', box: { x: 179, y: 534.4, w: 68, h: 12 }, line: 534.1,
    kind: 'text', align: 'center', required: 'always', provenance: 'filing', clientConfirmation: true, formatRule: 'DD/MM/YYYY',
    source: 'נשאל בטופס · שנת הנישואין נשמרת בכרטיס (marriage_year) כשחסרה' }),
  f({ id: 'separationDate', dataKey: 'separationDate', label: 'אין חיים יחד החל מתאריך', section: 'הצהרה', box: { x: 412, y: 514.4, w: 68, h: 12 }, line: 514.1,
    kind: 'text', align: 'center', required: 'always', provenance: 'filing', clientConfirmation: true, formatRule: 'DD/MM/YYYY', source: 'נשאל בטופס' }),
  ...columnFields('M'),
  ...columnFields('F'),
];

const UNMAPPED: UnmappedArea[] = [
  { id: 'fileNumber', page: 1, box: { x: 28, y: 738, w: 106, h: 28 }, label: 'מספר תיק', reason: 'ממולא בידי פקיד השומה / המשרד לפי הצורך' },
  { id: 'lawyerM', page: 1, box: { x: 287, y: 30, w: 250, h: 200 }, label: 'אישור עו״ד (בן הזוג)', reason: 'נחתם בפני עו״ד — מחוץ לטופס הדיגיטלי' },
  { id: 'lawyerF', page: 1, box: { x: 29, y: 30, w: 252, h: 200 }, label: 'אישור עו״ד (בת הזוג)', reason: 'נחתם בפני עו״ד — מחוץ לטופס הדיגיטלי' },
];

export const ITA4440_TEMPLATE: SmartFormTemplate = {
  key: ITA4440_KEY,
  title: 'תצהיר בדבר נשואים החיים בנפרד (4440)',
  authority: 'ita',
  formNumber: '4440',
  version: '12.2009',
  sha256: ITA4440_SHA256,
  mappingVersion: 1,
  pageCount: 1,
  pageSize: { width: 595, height: 842 },
  fileUrl: '/templates/ita-4440-12.2009.pdf',
  fields: FIELDS,
  unmapped: UNMAPPED,
};

// ── מי בכל עמודה ─────────────────────────────────────────────────────────────
/** הלקוח בעמודת «בן הזוג» כשהוא גבר; אחרת — «בת הזוג». */
export const clientColumn = (d: CfData): 'M' | 'F' => (d.gender === 'female' ? 'F' : 'M');

const lastYear = () => String(new Date().getFullYear() - 1);
const yes = (v: string | undefined) => v === '1';

function personValue(key: string, who: 'client' | 'spouse', d: CfData): string | boolean | undefined {
  const c = who === 'client';
  switch (key) {
    case 'lastName': return c ? d.lastName : d.spouseLastName;
    case 'firstName': return c ? d.firstName : d.spouseFirstName;
    case 'idNumber': return c ? d.idNumber : d.spouseIdNumber;
    case 'phone': return phoneDisplay(c ? d.mobile : d.spousePhone) || undefined;
    case 'address': return c ? addressLine(d.homeStreet, d.homeHouse, d.homeCity) : d.spouseAddress;
    case 'incSalary': return yes(c ? d.incSalary : d.spIncSalary);
    case 'incBusiness': return yes(c ? d.incBusiness : d.spIncBusiness);
    case 'incOther': return yes(c ? d.incOther : d.spIncOther);
    case 'incOtherText': return (c ? yes(d.incOther) : yes(d.spIncOther)) ? (c ? d.incOtherText : d.spIncOtherText) : undefined;
    case 'incomeYear': {
      const any = c ? (yes(d.incSalary) || yes(d.incBusiness) || yes(d.incOther)) : (yes(d.spIncSalary) || yes(d.spIncBusiness) || yes(d.spIncOther));
      return any ? (d.incomeYear || lastYear()) : undefined;
    }
    case 'signDate': return c ? ilDate(d.signDate) : undefined;
    default: return undefined;
  }
}

function valueOf(field: FieldDef, d: CfData): string | boolean | undefined {
  const [col, key] = field.dataKey.includes('.') ? field.dataKey.split('.') as ['M' | 'F', string] : [null, field.dataKey];
  if (!col) {
    if (key === 'marriageDate' || key === 'separationDate') return ilDate(d[key]);
    return d[key];
  }
  return personValue(key, col === clientColumn(d) ? 'client' : 'spouse', d);
}

function isActive(field: FieldDef, d: CfData): boolean {
  const [col] = field.dataKey.split('.');
  // ‼ בן/בת הזוג אינו/ה חותם/ת בגרסה זו — רק טור הלקוח מקבל חתימה ותאריך
  if (field.kind === 'signature' || field.dataKey.endsWith('.signDate')) return col === clientColumn(d);
  return true;
}

// ── השאלון ───────────────────────────────────────────────────────────────────
const spouseName = (d: CfData) => d.spouseFirstName || 'בן/בת הזוג';
const INCOME_OPTIONS = [
  { key: 'Salary', label: 'משכר עבודה (שכיר/ה)' },
  { key: 'Business', label: 'מעסק או ממשלח יד (עצמאי/ת)' },
  { key: 'Other', label: 'ממקור אחר' },
];

const SCREENS: CfScreen[] = [
  {
    id: 'identity', identity: true, title: 'הפרטים שלך',
    hint: 'כפי שהם רשומים בתעודת הזהות.',
    fields: [
      { key: 'firstName', label: 'שם פרטי', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'lastName', label: 'שם משפחה', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'idNumber', label: 'מספר זהות', input: 'id', store: 'card', required: true, half: true },
      { key: 'gender', label: 'מין (קובע באיזה טור בטופס יופיעו הפרטים שלך)', input: 'choice', store: 'card', required: true,
        options: [{ value: 'male', label: 'גבר' }, { value: 'female', label: 'אישה' }] },
    ],
  },
  {
    id: 'contact', title: 'טלפון וכתובת',
    hint: 'הכתובת שבה את/ה גר/ה היום.',
    fields: [
      { key: 'mobile', label: 'טלפון נייד', input: 'phone', store: 'card', half: true },
      { key: 'homeCity', label: 'יישוב', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'homeStreet', label: 'רחוב', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'homeHouse', label: 'מספר בית', input: 'house', store: 'card', half: true },
      { key: 'homeZip', label: 'מיקוד (לא חובה)', input: 'zip', store: 'card', half: true },
    ],
  },
  {
    id: 'spouse', identity: true, title: d => `פרטי ${d.spouseFirstName ? d.spouseFirstName : 'בן/בת הזוג'}`,
    hint: 'כפי שהם רשומים בתעודת הזהות.',
    fields: [
      { key: 'spouseFirstName', label: 'שם פרטי', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'spouseLastName', label: 'שם משפחה', input: 'hebrew', store: 'card', required: true, half: true },
      { key: 'spouseIdNumber', label: 'מספר זהות', input: 'id', store: 'card', required: true, half: true },
      { key: 'spousePhone', label: 'טלפון (לא חובה)', input: 'phone', store: 'card', half: true },
    ],
  },
  {
    id: 'dates', always: true, title: 'הנישואין והפרידה',
    hint: d => `התאריכים שיופיעו בתצהיר.${d.marriageYear && !d.marriageDate ? ` בתיק רשום שנישאתם ב-${d.marriageYear}.` : ''}`,
    why: 'בתצהיר מצהירים ממתי אתם רשומים כנשואים, וממתי אינכם חיים יחד ואינכם מנהלים משק בית משותף. מתאריך הפרידה פקיד השומה יכול להכיר בשינוי המצב.',
    fields: [
      { key: 'marriageDate', label: 'תאריך הנישואין', input: 'date', store: 'filing', required: true, half: true },
      { key: 'separationDate', label: 'ממתי אתם חיים בנפרד', input: 'date', store: 'filing', required: true, half: true },
    ],
  },
  {
    id: 'spouseAddress', always: true, title: d => `איפה ${spouseName(d)} גר/ה היום?`,
    hint: 'כתובת מלאה: רחוב, מספר ויישוב.',
    fields: [
      { key: 'spouseAddress', label: 'הכתובת', input: 'hebrew', store: 'filing', required: true, placeholder: 'לדוגמה: הרצל 12, חיפה' },
    ],
  },
  {
    id: 'income', always: true, title: d => `ממה הייתה ההכנסה שלך בשנת ${d.incomeYear || lastYear()}?`,
    hint: 'אפשר לסמן יותר מאחד. אם לא הייתה הכנסה — אפשר להמשיך בלי לסמן.',
    fields: [
      ...INCOME_OPTIONS.map(o => ({ key: `inc${o.key}`, label: o.label, input: 'check' as const, store: 'filing' as const })),
      { key: 'incOtherText', label: 'מה המקור האחר?', input: 'text', store: 'filing', showIf: d => d.incOther === '1', required: d => d.incOther === '1' },
      { key: 'incomeYear', label: 'שנת המס', input: 'text', store: 'filing', showIf: () => false, suggest: () => lastYear() },
    ],
  },
  {
    id: 'spouseIncome', always: true, title: d => `ממה הייתה ההכנסה של ${spouseName(d)} באותה שנה?`,
    hint: 'אם אינך יודע/ת — אפשר להמשיך בלי לסמן. השדה יישאר ריק בטופס.',
    fields: [
      ...INCOME_OPTIONS.map(o => ({ key: `spInc${o.key}`, label: o.label, input: 'check' as const, store: 'filing' as const })),
      { key: 'spIncOtherText', label: 'מה המקור האחר?', input: 'text', store: 'filing', showIf: d => d.spIncOther === '1', required: d => d.spIncOther === '1' },
    ],
  },
];

SCREENS.push({
  id: 'office', officeOnly: true, title: 'פרטי משרד', hint: 'ממלא המשרד — לא נשאל בדף האישי.',
  fields: [{ key: 'taxOffice', label: 'פקיד השומה (המשרד)', input: 'hebrew', store: 'card' }],
});

const SAMPLE: CfData = {
  firstName: 'ישראל', lastName: 'ישראלי', idNumber: '000000018', gender: 'male', mobile: '050-1234567',
  homeStreet: 'הרצל', homeHouse: '12', homeCity: 'חיפה', homeZip: '3303912',
  spouseFirstName: 'ישראלה', spouseLastName: 'ישראלי', spouseIdNumber: '000000026', spousePhone: '052-7654321',
  taxOffice: 'חיפה', marriageDate: '2010-06-20', separationDate: '2025-03-01', spouseAddress: 'הנביאים 4, חיפה',
  incomeYear: '2025', incSalary: '1', incBusiness: '', incOther: '', spIncSalary: '1', signDate: '2026-10-15',
};

export const ITA4440: ClientFormDef = {
  key: 'ita-4440',
  template: ITA4440_TEMPLATE,
  clientTitle: 'תצהיר על חיים בנפרד (טופס 4440)',
  authorityLabel: 'מס הכנסה',
  intro: 'תצהיר לפקיד השומה שאתם נשואים אך חיים בנפרד ואינכם מנהלים משק בית משותף.',
  declaration: 'אני מצהיר/ה שהפרטים בתצהיר נכונים ומלאים, ושידוע לי שעליי לומר את האמת ושאהיה צפוי/ה לעונשים הקבועים בחוק אם לא אעשה כן.',
  signNote: 'רשות המסים מבקשת שהתצהיר ייחתם בפני עורך/ת דין. החתימה כאן מכינה את התצהיר המלא, והמשרד יתאם איתך את אישור עורך/ת הדין.',
  screens: SCREENS,
  valueOf,
  isActive,
  sample: SAMPLE,
};

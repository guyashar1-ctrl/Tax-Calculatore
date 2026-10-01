// ─── טופס 6101 (06.2026) — מלאי השדות הסמנטי ───────────────────────────────
// נמדד ב-28.09.2026 על הקובץ הרשמי t6101.pdf (3 עמודים, 612×792 נק', בלי
// סיבוב, בלי AcroForm; SHA-256 למטה). כל מלבן נגזר מרינדור הטופס (pdfjs,
// ‏×4) ומזיהוי פיקסלים של תאים לבנים, קווי תיבות-ספרות וריבועי סימון — לא
// מטקסט שחולץ מהקובץ: בקובץ יש טקסט מוסתר («פרטי חשבון הבנק של התובע»,
// «פרטים על תקופת האבטלה…») ושורה חתוכה («כתובת מייצג») שאין להם מקום
// גלוי בטופס, ולכן הם ב-UNMAPPED ולא שדות.
//
// ‼ הקובץ הוא הסמכות. קובץ עם טביעה אחרת ⇒ המיפוי אינו חל (ראה
// templateRegistry.ts). הזזת שדה על אותו קובץ ⇒ mappingVersion עולה.

import type { FieldDef, PdfRect, SmartFormTemplate, UnmappedArea } from '../types';

export const BTL6101_TEMPLATE_KEY = 'btl-6101';
export const BTL6101_SHA256 = '79e4f387e851cf1a8218c52c4991321e9daae39f3c02f235aeaa3287c3d93754';

type Base = Omit<FieldDef, 'fontSize' | 'minFontSize' | 'overflow' | 'required' | 'clientConfirmation' | 'provenance' | 'applies' | 'formatRule' | 'source'>
  & Partial<Pick<FieldDef, 'fontSize' | 'minFontSize' | 'overflow' | 'required' | 'clientConfirmation' | 'provenance' | 'applies' | 'formatRule' | 'source'>>;

const f = (d: Base): FieldDef => ({
  fontSize: 10, minFontSize: 6.5, overflow: 'shrink', required: 'optional', clientConfirmation: false,
  provenance: 'client_record', applies: 'always', formatRule: 'as_is', source: '—',
  ...d,
});

// ── תיבות הספרות (x של כל קו, משמאל לימין) — נמדדו ─────────────────────────
const ID_CELLS_APPLICANT = [54.38, 72.13, 89.38, 106.88, 124.13, 141.63, 159.13, 176.63, 193.88, 211.13];
const ID_CELLS_SPOUSE = [54.38, 72.13, 89.63, 107.38, 124.63, 142.13, 159.88, 177.38, 194.88, 212.38];
const ID_CELLS_CONTACT = [54.88, 72.63, 90.13, 107.38, 124.88, 142.13, 159.63, 177.13, 194.63, 211.88];
const MONTH_CELLS = [54.13, 71.13, 88.63];
const YEAR_CELLS = [88.63, 105.88, 123.38, 140.88, 158.13];
const LANDLINE_CELLS = [399.13, 413.13, 427.13, 440.88, 454.63, 468.63, 482.38, 496.38, 510.13, 524.13, 537.88, 551.88];
const MOBILE_CELLS = [225.13, 242.63, 258.88, 274.88, 291.13, 307.13, 323.38, 339.63, 355.88, 372.13, 388.38];

const cellsBox = (cells: number[], y: number, h: number) =>
  ({ x: cells[0], y, w: cells[cells.length - 1] - cells[0], h });

// ── טבלת העיסוקים (סעיף 3): שלוש שורות גלויות, מלמעלה למטה ────────────────
const OCC_ROWS = [
  { y: 619.0, h: 20.3 },
  { y: 596.3, h: 20.3 },
  { y: 573.5, h: 20.5 },
];
const OCC_COLS = [
  { key: 'from', label: 'מתאריך', x: 472.3, w: 82.8, align: 'center' as const },
  { key: 'to', label: 'עד תאריך', x: 390.3, w: 75.8, align: 'center' as const },
  { key: 'occupation', label: 'עיסוק', x: 315.8, w: 68.3, align: 'right' as const },
  { key: 'nonWorkIncome', label: 'הכנסה שלא מעבודה — הכנסה ב-₪', x: 193.3, w: 116.0, align: 'center' as const },
  { key: 'nonWorkSource', label: 'הכנסה שלא מעבודה — מקור ההכנסה', x: 50.0, w: 136.8, align: 'right' as const },
];
export const OCCUPATION_VISIBLE_ROWS = OCC_ROWS.length;

const occupationFields: FieldDef[] = OCC_ROWS.flatMap((row, i) => OCC_COLS.map(col => f({
  id: `p2.occupations.r${i + 1}.${col.key}`,
  dataKey: `occupations[${i}].${col.key}`,
  label: `${col.label} (שורה ${i + 1})`,
  page: 2, section: 'occupations',
  box: { x: col.x, y: row.y + 0.5, w: col.w, h: row.h - 1 },
  kind: 'text', align: col.align, fontSize: 9.5, minFontSize: 6,
  overflow: col.key === 'occupation' || col.key === 'nonWorkSource' ? 'shrink_wrap2' : 'shrink',
  applies: ['multi_year_report'],
  required: col.key === 'from' || col.key === 'occupation' ? 'when_applicable' : 'optional',
  provenance: col.key === 'from' || col.key === 'to' || col.key === 'occupation' ? 'btl_sync' : 'filing',
  clientConfirmation: col.key === 'nonWorkIncome' || col.key === 'nonWorkSource',
  source: col.key === 'from' || col.key === 'to' || col.key === 'occupation'
    ? 'clients.ni_occupations[] (btl.sync_file או הזנה ידנית) — עיסוקים שחופפים לשנתיים שלפני תאריך ההצהרה'
    : 'הגשה בלבד — אין ב-PIVO הכנסה שלא מעבודה לפי תקופה',
  formatRule: col.key === 'from' || col.key === 'to' ? 'date dd/mm/yyyy; «עד» ריק = נמשך'
    : col.key === 'nonWorkIncome' ? 'סכום בש"ח + פרשנות מפורשת בתא («לחודש» / «לכל התקופה»); בלי המרה משנתי ובלי ניחוש'
    : col.key === 'occupation' ? 'אוצר המילים של הטופס (◊) או השם בב"ל' : 'as_is',
  validation: col.key === 'from' || col.key === 'to' ? 'תאריך תקין; «מתאריך» ≤ «עד תאריך»'
    : col.key === 'nonWorkIncome' ? 'חובה כשיש מקור הכנסה או «בעל הכנסה שלא מעבודה»; מספר; פרשנות חובה' : undefined,
})));

const FIELDS: FieldDef[] = [
  // ═══ כותרות הזהות החוזרות ═══════════════════════════════════════════════
  ...[
    { page: 1, x: 122.0, w: 140.8, line: 757.5 },
    { page: 2, x: 112.5, w: 140.8, line: 751.5 },
    { page: 3, x: 112.8, w: 140.8, line: 745.5 },
  ].map(h => f({
    id: `p${h.page}.header.idNumber`, dataKey: 'idNumber', label: `מס' ת.ז — כותרת עמוד ${h.page}`,
    page: h.page, section: 'identity', box: { x: h.x, y: h.line, w: h.w, h: 11 }, baseline: h.line + 1.9,
    kind: 'text', align: 'center', fontSize: 11, minFontSize: 11, overflow: 'reject', required: 'always',
    source: 'clients.id_number', formatRule: 'ספרות בלבד, 9 ספרות עם אפסים מובילים',
    validation: 'ת"ז ישראלית עם ספרת ביקורת תקינה',
  })),

  // ═══ סעיף 1 — פרטי המבוטח ═══════════════════════════════════════════════
  f({ id: 'p1.applicant.lastName', dataKey: 'lastName', label: 'שם משפחה', page: 1, section: 'identity',
    box: { x: 356.0, y: 552.5, w: 196.3, h: 21 }, kind: 'text', align: 'right', fontSize: 11,
    overflow: 'shrink_wrap2', required: 'always', source: 'clients.last_name' }),
  f({ id: 'p1.applicant.firstName', dataKey: 'firstName', label: 'שם פרטי', page: 1, section: 'identity',
    box: { x: 221.3, y: 552.5, w: 126.0, h: 21 }, kind: 'text', align: 'right', fontSize: 11,
    overflow: 'shrink_wrap2', required: 'always', source: 'clients.first_name' }),
  f({ id: 'p1.applicant.idNumber', dataKey: 'idNumber', label: 'מספר זהות (כולל ס"ב)', page: 1, section: 'identity',
    box: cellsBox(ID_CELLS_APPLICANT, 552.0, 13), cells: ID_CELLS_APPLICANT, baseline: 554.4,
    kind: 'digits', fontSize: 11, minFontSize: 11, overflow: 'reject', required: 'always',
    source: 'clients.id_number', formatRule: '9 ספרות; ספרת הביקורת בתיבה «ס"ב»; אפסים מובילים נשמרים',
    validation: 'ת"ז ישראלית עם ספרת ביקורת תקינה' }),

  ...([
    ['single', 'רווק', 538.0, 8.6],
    ['married', 'נשוי', 495.0, 8.75],
    ['common_law', 'ידוע בציבור', 457.5, 8.9],
    ['divorced', 'גרוש', 392.0, 8.75],
    ['widowed', 'אלמן', 351.5, 8.9],
  ] as const).map(([v, label, x, w]) => f({
    id: `p1.marital.${v}`, dataKey: `maritalStatus=${v}`, label: `מצב משפחתי — ${label}`, page: 1, section: 'marital',
    box: { x, y: 525.3, w, h: 8.7 }, kind: 'checkbox', overflow: 'none', required: 'always',
    source: 'clients.family_status · השוואה/השלמה: btl_portal_facts.familyStatus (207)', formatRule: 'single→רווק · married→נשוי · divorced→גרוש · widowed→אלמן; «ידוע בציבור» והורה-יחיד — רק בהזנה מפורשת',
    validation: 'בדיוק אחד מסומן',
  })),
  f({ id: 'p1.marital.sinceMonth', dataKey: 'maritalSinceMonth', label: 'מצב משפחתי — החל מחודש', page: 1, section: 'marital',
    box: cellsBox(MONTH_CELLS, 528.5, 11.5), cells: MONTH_CELLS, baseline: 530.9, kind: 'digits',
    fontSize: 10, minFontSize: 10, overflow: 'reject', provenance: 'filing',
    source: 'אין ב-PIVO (רק שנה)', formatRule: 'MM, 2 ספרות עם אפס מוביל', validation: '01–12' }),
  f({ id: 'p1.marital.sinceYear', dataKey: 'maritalSinceYear', label: 'מצב משפחתי — החל משנה', page: 1, section: 'marital',
    box: cellsBox(YEAR_CELLS, 528.5, 11.5), cells: YEAR_CELLS, baseline: 530.9, kind: 'digits',
    fontSize: 10, minFontSize: 10, overflow: 'reject', provenance: 'derived',
    source: 'clients.marriage_year / divorce_year / widowhood_year', formatRule: 'YYYY', validation: 'שנה ≤ שנת ההצהרה' }),

  // ── פרטי בן/בת הזוג ──
  f({ id: 'p1.spouse.lastName', dataKey: 'spouseLastName', label: 'בן/בת הזוג — שם משפחה', page: 1, section: 'spouse',
    box: { x: 356.0, y: 450.0, w: 196.3, h: 24 }, kind: 'text', align: 'right', fontSize: 11,
    overflow: 'shrink_wrap2', required: 'when_applicable', source: 'clients.spouse_last_name ‖ clients.spouse.lastName' }),
  f({ id: 'p1.spouse.firstName', dataKey: 'spouseFirstName', label: 'בן/בת הזוג — שם פרטי', page: 1, section: 'spouse',
    box: { x: 222.5, y: 450.0, w: 124.5, h: 24 }, kind: 'text', align: 'right', fontSize: 11,
    overflow: 'shrink_wrap2', required: 'when_applicable', source: 'clients.spouse_first_name ‖ clients.spouse.firstName' }),
  f({ id: 'p1.spouse.idNumber', dataKey: 'spouseIdNumber', label: 'בן/בת הזוג — מספר זהות', page: 1, section: 'spouse',
    box: cellsBox(ID_CELLS_SPOUSE, 457.0, 12), cells: ID_CELLS_SPOUSE, baseline: 458.9, kind: 'digits',
    fontSize: 11, minFontSize: 11, overflow: 'reject', required: 'when_applicable',
    source: 'clients.spouse_id_number ‖ clients.spouse.idNumber', formatRule: '9 ספרות עם אפסים מובילים',
    validation: 'ת"ז ישראלית תקינה' }),

  // ── כתובת מגורים ──
  f({ id: 'p1.address.street', dataKey: 'street', label: 'רחוב / תא דואר', page: 1, section: 'address',
    box: { x: 397.0, y: 394.0, w: 157.3, h: 16.3 }, kind: 'text', align: 'right', required: 'always',
    provenance: 'derived', source: 'clients.address (פירוק: רחוב)', formatRule: 'עברית; פירוק הכתובת החופשית דורש אישור' }),
  f({ id: 'p1.address.house', dataKey: 'houseNumber', label: "מס' בית", page: 1, section: 'address',
    box: { x: 347.5, y: 394.0, w: 43.3, h: 16.3 }, kind: 'text', align: 'center', required: 'always',
    provenance: 'derived', source: 'clients.address (פירוק: מספר)' }),
  f({ id: 'p1.address.entrance', dataKey: 'entrance', label: 'כניסה', page: 1, section: 'address',
    box: { x: 297.8, y: 394.0, w: 43.3, h: 16.3 }, kind: 'text', align: 'center',
    provenance: 'derived', source: 'clients.address (פירוק: כניסה)' }),
  f({ id: 'p1.address.apartment', dataKey: 'apartment', label: 'דירה', page: 1, section: 'address',
    box: { x: 262.8, y: 394.0, w: 28.8, h: 16.3 }, kind: 'text', align: 'center',
    provenance: 'derived', source: 'clients.address (פירוק: דירה)' }),
  f({ id: 'p1.address.city', dataKey: 'city', label: 'יישוב', page: 1, section: 'address',
    box: { x: 116.0, y: 394.0, w: 140.3, h: 16.3 }, kind: 'text', align: 'right', required: 'always',
    source: 'clients.city' }),
  f({ id: 'p1.address.zip', dataKey: 'zip', label: 'מיקוד', page: 1, section: 'address',
    box: { x: 52.0, y: 394.0, w: 57.8, h: 16.3 }, kind: 'text', align: 'center',
    source: 'clients.zip_code (206)', formatRule: '7 ספרות', validation: '5 או 7 ספרות' }),

  // ── טלפונים ומייל ──
  f({ id: 'p1.contact.landline', dataKey: 'landline', label: 'טלפון קווי', page: 1, section: 'contact',
    box: cellsBox(LANDLINE_CELLS, 358.5, 11.5), cells: LANDLINE_CELLS, groups: [4, 7], baseline: 360.4,
    kind: 'digits', fontSize: 10.5, minFontSize: 10.5, overflow: 'reject',
    source: 'clients.landline_phone (206)', formatRule: 'קידומת (2–3 ספרות) מימין לתיבות הקידומת + 7 ספרות',
    validation: 'מספר קווי ישראלי: 9 ספרות (0X) או 10 (07X)' }),
  f({ id: 'p1.contact.mobile', dataKey: 'mobile', label: 'טלפון נייד', page: 1, section: 'contact',
    box: cellsBox(MOBILE_CELLS, 358.5, 11.5), cells: MOBILE_CELLS, groups: [3, 7], baseline: 360.4,
    kind: 'digits', fontSize: 10.5, minFontSize: 10.5, overflow: 'reject',
    source: 'clients.phone', formatRule: '05X + 7 ספרות', validation: 'נייד ישראלי: 10 ספרות שמתחילות ב-05' }),
  f({ id: 'p1.contact.emailLocal', dataKey: 'email@local', label: 'דואר אלקטרוני — לפני @', page: 1, section: 'contact',
    box: { x: 62.7, y: 361.3, w: 68.6, h: 10 }, baseline: 362.3, kind: 'text', align: 'right',
    fontSize: 9, minFontSize: 5.5, source: 'clients.email', formatRule: 'החלק שלפני ה-@ המודפס, צמוד אליו (LTR)',
    validation: 'כתובת מייל תקינה' }),
  f({ id: 'p1.contact.emailDomain', dataKey: 'email@domain', label: 'דואר אלקטרוני — אחרי @', page: 1, section: 'contact',
    box: { x: 142.6, y: 361.3, w: 71.8, h: 10 }, baseline: 362.3, kind: 'text', align: 'left',
    fontSize: 9, minFontSize: 5.5, source: 'clients.email', formatRule: 'הדומיין, מיד אחרי ה-@ המודפס (LTR)' }),
  f({ id: 'p1.contact.emailWhole', dataKey: 'email@whole', label: 'דואר אלקטרוני — כתובת ארוכה', page: 1, section: 'contact',
    box: { x: 53.0, y: 340.5, w: 162.0, h: 17 }, kind: 'text', align: 'center', fontSize: 9, minFontSize: 6, overflow: 'shrink_wrap2',
    source: 'clients.email', formatRule: 'רק כשאחד החלקים לא נכנס סביב ה-@ המודפס גם בגודל המינימלי: הכתובת כולה, בשטח הריק של התא מתחת לקו (שבירה ב-@ בלבד)' }),

  // ── איש קשר חלופי (רק כשהטלפון/המייל אינם של המבוטח) ──
  f({ id: 'p1.altContact.lastName', dataKey: 'altContactLastName', label: 'שם משפחה איש קשר', page: 1, section: 'altContact',
    box: { x: 392.0, y: 278.5, w: 160.3, h: 22 }, kind: 'text', align: 'right', overflow: 'shrink_wrap2',
    provenance: 'filing', clientConfirmation: true, required: 'when_applicable',
    source: 'הגשה בלבד', formatRule: 'רק כשהלקוח מצהיר שהנייד/המייל אינם שלו' }),
  f({ id: 'p1.altContact.firstName', dataKey: 'altContactFirstName', label: 'שם פרטי איש קשר', page: 1, section: 'altContact',
    box: { x: 222.5, y: 278.5, w: 161.0, h: 22 }, kind: 'text', align: 'right', overflow: 'shrink_wrap2',
    provenance: 'filing', clientConfirmation: true, required: 'when_applicable', source: 'הגשה בלבד' }),
  f({ id: 'p1.altContact.idNumber', dataKey: 'altContactIdNumber', label: "מס' זהות איש קשר", page: 1, section: 'altContact',
    box: cellsBox(ID_CELLS_CONTACT, 278.3, 11.5), cells: ID_CELLS_CONTACT, baseline: 280.3, kind: 'digits',
    fontSize: 11, minFontSize: 11, overflow: 'reject', provenance: 'filing', clientConfirmation: true,
    required: 'when_applicable', source: 'הגשה בלבד', formatRule: '9 ספרות עם אפסים מובילים', validation: 'ת"ז ישראלית תקינה' }),
  f({ id: 'p1.digital.refuse', dataKey: 'refuseDigital', label: 'אני מסרב לקבל הודעות בערוצים הדיגיטליים', page: 1, section: 'digital',
    box: { x: 542.6, y: 264.5, w: 7.7, h: 8.8 }, kind: 'checkbox', overflow: 'none',
    provenance: 'filing', clientConfirmation: true, source: 'הצהרת הלקוח בהגשה',
    formatRule: 'מסומן רק בבחירה מפורשת של הלקוח; ברירת המחדל: לא מסומן (= הסכמה לערוצים דיגיטליים)' }),

  // ── מען למכתבים (אם שונה) ──
  ...([
    ['mailRecipient', 'שם הנמען', 489.5, 64.8, 'right'],
    ['mailStreet', 'רחוב / תא דואר', 397.0, 86.3, 'right'],
    ['mailHouse', "מס' בית", 347.5, 43.3, 'center'],
    ['mailEntrance', 'כניסה', 297.8, 43.3, 'center'],
    ['mailApartment', 'דירה', 262.8, 28.8, 'center'],
    ['mailCity', 'יישוב', 116.5, 139.8, 'right'],
    ['mailZip', 'מיקוד', 52.0, 58.3, 'center'],
  ] as const).map(([key, label, x, w, align]) => f({
    id: `p1.mailing.${key.replace('mail', '').replace(/^./, c => c.toLowerCase())}`, dataKey: key,
    label: `מען למכתבים — ${label}`, page: 1, section: 'mailing',
    box: { x, y: 188.0, w, h: 18 }, kind: 'text', align, overflow: key === 'mailRecipient' ? 'shrink_wrap2' : 'shrink',
    required: key === 'mailStreet' || key === 'mailCity' ? 'when_applicable' : 'optional',
    source: 'clients.mailing_address (206)', formatRule: 'רק כשהמען שונה מכתובת המגורים',
  })),

  // ═══ סעיף 2 — חשבון בנק ═════════════════════════════════════════════════
  f({ id: 'p1.bank.name', dataKey: 'bankName', label: 'שם הבנק', page: 1, section: 'bank',
    box: { x: 449.3, y: 90.5, w: 105.8, h: 20 }, kind: 'text', align: 'right', overflow: 'shrink_wrap2',
    source: 'clients.bank_accounts[isPrimary].bankName' }),
  f({ id: 'p1.bank.branchName', dataKey: 'bankBranchName', label: 'שם הסניף / כתובתו', page: 1, section: 'bank',
    box: { x: 223.3, y: 90.5, w: 219.5, h: 20 }, kind: 'text', align: 'right', overflow: 'shrink_wrap2',
    source: 'clients.bank_accounts[isPrimary].branchName' }),
  f({ id: 'p1.bank.branchNumber', dataKey: 'bankBranchNumber', label: "מס' סניף", page: 1, section: 'bank',
    box: { x: 175.5, y: 90.5, w: 41.3, h: 20 }, kind: 'text', align: 'center', overflow: 'reject',
    source: 'clients.bank_accounts[isPrimary].branchNumber', formatRule: 'ספרות כפי שנשמרו — אפסים מובילים נשמרים', validation: '1–4 ספרות' }),
  f({ id: 'p1.bank.account', dataKey: 'bankAccount', label: 'מספר החשבון', page: 1, section: 'bank',
    box: { x: 49.5, y: 90.5, w: 119.8, h: 20 }, kind: 'text', align: 'center', overflow: 'shrink',
    source: 'clients.bank_accounts[isPrimary].accountNumber', formatRule: 'ספרות (ומקף/לוכסן אם נשמר) — אפסים מובילים נשמרים', validation: '2–13 ספרות' }),

  // ═══ סעיף 3 — עיסוק והכנסות ═════════════════════════════════════════════
  ...occupationFields,
  f({ id: 'p2.occupations.appendixNote', dataKey: '#appendixNote', label: 'הפניה לנספח העיסוקים', page: 2, section: 'occupations',
    box: { x: 50, y: 546.5, w: 506, h: 10 }, baseline: 548.8, kind: 'text', align: 'right', fontSize: 8.5, minFontSize: 8.5,
    overflow: 'none', provenance: 'system', applies: ['multi_year_report'],
    source: 'PIVO — נכתב רק כשיש יותר משלוש תקופות', formatRule: 'מתחת למסגרת סעיף 3, מחוץ לטבלה' }),

  // ═══ סעיף 4 — עובד עצמאי ════════════════════════════════════════════════
  f({ id: 'p2.start.check', dataKey: 'startSelfEmployed', label: 'התחלתי לעבוד כעצמאי', page: 2, section: 'start',
    box: { x: 542.4, y: 434.5, w: 5.6, h: 6.0 }, kind: 'checkbox', overflow: 'none', applies: ['start'],
    provenance: 'filing', required: 'when_applicable', source: 'מטרת ההגשה' }),
  f({ id: 'p2.start.date', dataKey: 'startDate', label: 'התחלתי לעבוד כעצמאי החל מתאריך', page: 2, section: 'start',
    box: { x: 332.5, y: 433.5, w: 61.5, h: 10 }, baseline: 434.4, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['start'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה; הצעה מ-niOccupations (self_employed.fromDate)', formatRule: 'dd/mm/yyyy', validation: 'תאריך תקין' }),
  ...([
    ['1_11', '1–11 שעות בשבוע', 413.6],
    ['12_19', '12–19 שעות בשבוע', 315.9],
    ['20_plus', '20 שעות בשבוע ומעלה', 212.4],
  ] as const).map(([v, label, x]) => f({
    id: `p2.start.hours.${v}`, dataKey: `hoursBand=${v}`, label: `ממוצע שעות עבודה לשבוע — ${label}`, page: 2, section: 'start',
    box: { x, y: 405.5, w: 6.3, h: 6.8 }, kind: 'checkbox', overflow: 'none', applies: ['start'],
    required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה; הצעה מ-niOccupations.weeklyHours', formatRule: 'נגזר מממוצע השעות שהלקוח מצהיר — לא נבחר כדי להגיע לסיווג',
    validation: 'בדיוק אחד מסומן',
  })),
  f({ id: 'p2.start.monthlyIncome', dataKey: 'monthlyIncome', label: 'ממוצע הכנסה חודשית (₪)', page: 2, section: 'start',
    box: { x: 383.3, y: 389.4, w: 67.0, h: 10 }, baseline: 390.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['start'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה בלבד — ‼ לא הכנסה שנתית חלקי 12', formatRule: 'מספר שלם עם מפריד אלפים', validation: 'מספר ≥ 0' }),
  f({ id: 'p2.start.profession', dataKey: 'profession', label: 'סוג משלח היד או המקצוע', page: 2, section: 'start',
    box: { x: 231.3, y: 375.1, w: 150.3, h: 10 }, baseline: 376.0, kind: 'text', align: 'right', fontSize: 9.5,
    applies: ['start'], required: 'when_applicable', provenance: 'client_record',
    source: 'clients.businesses[].description ‖ clients.business_description', formatRule: 'עברית', validation: 'חובה לציין' }),

  f({ id: 'p2.change.check', dataKey: 'changeHours', label: 'עובד עצמאי שחל שינוי בהיקף שעות העבודה בשנה הנוכחית', page: 2, section: 'change',
    box: { x: 541.6, y: 361.5, w: 6.3, h: 6.8 }, kind: 'checkbox', overflow: 'none', applies: ['change'],
    provenance: 'filing', required: 'when_applicable', source: 'מטרת ההגשה' }),
  f({ id: 'p2.change.before.from', dataKey: 'changeFromDate', label: 'מתאריך (לפני השינוי)', page: 2, section: 'change',
    box: { x: 435.3, y: 346.0, w: 67.0, h: 10 }, baseline: 346.8, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['change'], required: 'when_applicable', provenance: 'btl_sync', clientConfirmation: true,
    source: 'niOccupations (self_employed.fromDate) / הגשה', formatRule: 'dd/mm/yyyy' }),
  f({ id: 'p2.change.before.hours', dataKey: 'hoursBefore', label: 'שעות העבודה בשבוע בממוצע היו', page: 2, section: 'change',
    box: { x: 250.0, y: 346.0, w: 50.3, h: 10 }, baseline: 346.8, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['change'], required: 'when_applicable', provenance: 'client_record', clientConfirmation: true,
    source: 'niOccupations.weeklyHours (ידני) / הגשה', validation: 'מספר 0–168' }),
  f({ id: 'p2.change.before.income', dataKey: 'incomeBefore', label: 'הכנסה חודשית ממוצעת (לפני) ₪', page: 2, section: 'change',
    box: { x: 88.5, y: 346.0, w: 61.5, h: 10 }, baseline: 346.8, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['change'], required: 'when_applicable', provenance: 'btl_sync', clientConfirmation: true,
    source: 'niIncomeBasisMonthly (ההכנסה המוצהרת בב"ל) / הגשה', formatRule: 'מספר שלם עם מפריד אלפים' }),
  f({ id: 'p2.change.after.from', dataKey: 'changeToDate', label: 'ומתאריך (השינוי)', page: 2, section: 'change',
    box: { x: 438.3, y: 331.5, w: 61.5, h: 10 }, baseline: 332.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['change'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה', formatRule: 'dd/mm/yyyy', validation: 'בשנה הנוכחית בלבד (לשון הטופס); אחרת — בדיקה מקצועית' }),
  f({ id: 'p2.change.after.hours', dataKey: 'hoursAfter', label: 'שעות העבודה בשבוע בממוצע יהיו', page: 2, section: 'change',
    box: { x: 247.5, y: 331.5, w: 50.3, h: 10 }, baseline: 332.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['change'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה', validation: 'מספר 0–168' }),
  f({ id: 'p2.change.after.income', dataKey: 'incomeAfter', label: 'הכנסה חודשית ממוצעת (אחרי) ₪', page: 2, section: 'change',
    box: { x: 88.8, y: 331.5, w: 61.5, h: 10 }, baseline: 332.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['change'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה — ‼ לא הכנסה שנתית חלקי 12', formatRule: 'מספר שלם עם מפריד אלפים' }),

  f({ id: 'p2.spouseBusiness.check', dataKey: 'spouseInBusiness', label: 'בן/בת זוג עובד בעסק', page: 2, section: 'spouseBusiness',
    box: { x: 541.6, y: 318.0, w: 6.3, h: 6.8 }, kind: 'checkbox', overflow: 'none', applies: ['spouse_in_business'],
    provenance: 'filing', required: 'when_applicable', source: 'מטרת ההגשה' }),
  f({ id: 'p2.spouseBusiness.from', dataKey: 'spouseFromDate', label: 'בן/בת הזוג עובד בעסק החל מתאריך', page: 2, section: 'spouseBusiness',
    box: { x: 328.8, y: 317.0, w: 66.8, h: 10 }, baseline: 317.8, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['spouse_in_business'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה', formatRule: 'dd/mm/yyyy' }),
  f({ id: 'p2.spouseBusiness.share', dataKey: 'spouseSharePct', label: 'חלקו בעסק (%)', page: 2, section: 'spouseBusiness',
    box: { x: 234.8, y: 317.0, w: 33.8, h: 10 }, baseline: 317.8, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['spouse_in_business'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה', validation: '0–100' }),
  f({ id: 'p2.spouseBusiness.hours', dataKey: 'spouseWeeklyHours', label: 'מספר שעות עבודה ממוצע בשבוע של בן/בת הזוג', page: 2, section: 'spouseBusiness',
    box: { x: 306.0, y: 302.5, w: 39.3, h: 10 }, baseline: 303.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['spouse_in_business'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה', validation: 'מספר 0–168' }),
  f({ id: 'p2.spouseBusiness.signature', dataKey: '#signature.spouse', label: 'חתימת בן/בת הזוג', page: 2, section: 'spouseBusiness',
    box: { x: 347.5, y: 285.6, w: 103.5, h: 15.8 }, kind: 'signature', signer: 'spouse', overflow: 'none',
    applies: ['spouse_in_business'], required: 'signer', provenance: 'filing', clientConfirmation: true,
    source: 'חתימה של בן/בת הזוג עצמם', formatRule: 'תמונה חתוכה לדיו, יחס נשמר, על הקו' }),

  f({ id: 'p2.end.check', dataKey: 'endSelfEmployed', label: 'חדלתי לעבוד כעצמאי', page: 2, section: 'end',
    box: { x: 541.6, y: 274.5, w: 6.3, h: 6.8 }, kind: 'checkbox', overflow: 'none', applies: ['end'],
    provenance: 'filing', required: 'when_applicable', source: 'מטרת ההגשה' }),
  f({ id: 'p2.end.date', dataKey: 'endDate', label: 'חדלתי לעבוד כעצמאי מתאריך', page: 2, section: 'end',
    box: { x: 358.5, y: 273.5, w: 61.5, h: 10 }, baseline: 274.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['end'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true,
    source: 'הגשה', formatRule: 'dd/mm/yyyy', validation: 'לפני השנה השוטפת ⇒ אסמכתאות תומכות (לשון הטופס)' }),
  f({ id: 'p2.end.currentOccupation', dataKey: 'currentOccupation', label: 'עיסוקי הנוכחי', page: 2, section: 'end',
    box: { x: 184.3, y: 273.5, w: 111.5, h: 10 }, baseline: 274.3, kind: 'text', align: 'right', fontSize: 9.5,
    applies: ['end'], required: 'when_applicable', provenance: 'filing', clientConfirmation: true, source: 'הגשה' }),
  f({ id: 'p2.end.currentFrom', dataKey: 'currentOccupationFrom', label: 'עיסוק נוכחי מתאריך', page: 2, section: 'end',
    box: { x: 78.3, y: 273.5, w: 61.5, h: 10 }, baseline: 274.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['end'], required: 'optional', provenance: 'filing', clientConfirmation: true, source: 'הגשה', formatRule: 'dd/mm/yyyy' }),

  f({ id: 'p2.employees.check', dataKey: 'stopEmployees', label: 'חדלתי להעסיק עובדים', page: 2, section: 'employees',
    box: { x: 541.6, y: 245.5, w: 6.3, h: 6.8 }, kind: 'checkbox', overflow: 'none', applies: ['stop_employees'],
    provenance: 'filing', required: 'when_applicable', source: 'מטרת ההגשה' }),
  f({ id: 'p2.employees.withholdingFile', dataKey: 'withholdingFile', label: "תיק ניכויים מס'", page: 2, section: 'employees',
    box: { x: 288.0, y: 244.5, w: 94.8, h: 10 }, baseline: 245.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['stop_employees'], required: 'when_applicable', source: "clients.tax_files[authority='deductions'].fileNumber · השוואה/השלמה: btl_portal_facts.withholdingFile (207)",
    formatRule: 'ספרות כפי שנשמרו', validation: '9 ספרות' }),
  f({ id: 'p2.employees.date', dataKey: 'stopEmployeesDate', label: 'חדלתי להעסיק עובדים מתאריך', page: 2, section: 'employees',
    box: { x: 151.5, y: 244.5, w: 100.5, h: 10 }, baseline: 245.3, kind: 'text', align: 'center', fontSize: 9.5,
    applies: ['stop_employees'], required: 'when_applicable', provenance: 'filing', source: 'הגשה', formatRule: 'dd/mm/yyyy' }),

  ...([
    ['bizStreet', 'רחוב', 426.8, 125.8, 'right'],
    ['bizHouse', "מס' בית", 348.8, 71.8, 'center'],
    ['bizApartment', 'דירה', 270.8, 71.8, 'center'],
    ['bizCityZip', 'יישוב + מיקוד', 168.3, 96.3, 'right'],
    ['bizPhone', 'טלפון', 52.8, 109.3, 'center'],
  ] as const).map(([key, label, x, w, align]) => f({
    id: `p2.business.${key.replace('biz', '').replace(/^./, c => c.toLowerCase())}`, dataKey: key,
    label: `כתובת עסק — ${label}`, page: 2, section: 'business',
    box: { x, y: 183.2, w, h: 15 }, kind: 'text', align, overflow: key === 'bizStreet' || key === 'bizCityZip' ? 'shrink_wrap2' : 'shrink',
    applies: ['start', 'change', 'end', 'stop_employees', 'spouse_in_business'],
    required: key === 'bizStreet' || key === 'bizCityZip' ? 'when_applicable' : 'optional',
    source: 'clients.businesses[].address (206)', formatRule: key === 'bizPhone' ? 'טלפון LTR' : 'as_is',
  })),

  // ═══ סעיף 5 — הצהרה ═════════════════════════════════════════════════════
  f({ id: 'p3.declaration.date', dataKey: 'declarationDate', label: 'תאריך', page: 3, section: 'declaration',
    box: { x: 413.0, y: 480.4, w: 104.3, h: 11 }, baseline: 481.3, kind: 'text', align: 'center', fontSize: 10.5,
    required: 'always', provenance: 'system', source: 'תאריך החתימה', formatRule: 'dd/mm/yyyy — נקבע ביום החתימה' }),
  f({ id: 'p3.declaration.signature', dataKey: '#signature.client', label: 'חתימת המבוטח', page: 3, section: 'declaration',
    box: { x: 53.0, y: 477.8, w: 127.5, h: 30 }, kind: 'signature', signer: 'client', overflow: 'none',
    required: 'signer', provenance: 'filing', clientConfirmation: true,
    source: 'חתימת המבוטח עצמו', formatRule: 'תמונה חתוכה לדיו, יחס נשמר, על הקו' }),
];

const UNMAPPED: UnmappedArea[] = [
  { id: 'p1.internal.scanning', page: 1, box: { x: 54.3, y: 663, w: 198.5, h: 86.3 },
    label: 'לשימוש פנימי בלבד (סריקה) — מס\' זהות/דרכון, דפים, סוג המסמך', reason: 'שטח פנימי של ביטוח לאומי — לא ממלאים' },
  { id: 'p1.internal.receiptStamp', page: 1, box: { x: 266, y: 663, w: 93.8, h: 86.3 },
    label: 'חותמת קבלה', reason: 'חותמת הסניף — לא ממלאים' },
  { id: 'p1.hidden.claimantBank', page: 1, box: { x: 247, y: 93, w: 111, h: 10 },
    label: '«פרטי חשבון הבנק של התובע» (טקסט מוסתר)', reason: 'קיים בשכבת הטקסט בלבד, לא גלוי ברינדור' },
  { id: 'p2.legend.occupations', page: 2, box: { x: 100, y: 676, w: 452, h: 40 },
    label: 'רשימת ◊ (לא עובד, שכיר, סטודנט…)', reason: 'אוצר מילים לעמודת «עיסוק» בטבלה — לא תיבות סימון' },
  { id: 'p2.hidden.unemployment', page: 2, box: { x: 177, y: 662, w: 350, h: 10 },
    label: '«פרטים על תקופת האבטלה…» (טקסט מוסתר)', reason: 'קיים בשכבת הטקסט בלבד, לא גלוי ברינדור' },
  { id: 'p2.clipped.representativeAddress', page: 2, box: { x: 50, y: 160, w: 505, h: 22 },
    label: 'כתובת מייצג (שורה חתוכה)', reason: 'השורה חתוכה בגבול המסגרת ואין בה תאים גלויים — לא ממלאים' },
];

// ── מיפוי 2 (28.09.2026): גיאומטריה מודפסת שנמדדה בסקאלה 8 (‎1/8 נק') ──────
// ‼ מדידת היישור (scripts/test-smart-form-6101.mjs) הראתה ש-✗ של המצב המשפחתי
// ישב 1.04 נק' מתחת למרכז הריבוע המודפס (התיבה כללה את המסגרת), ושזנבות
// (g, p, פסיק) חצו את קו הכתיבה. לכן: תיבת כל ✗ = פנים הריבוע המודפס, ולכל
// שדה-קו — הקצה העליון של הקו.

/** פנים הריבוע המודפס (x, y, רוחב×גובה) — ה-✗ ממורכז בו. */
export const CHECK_SQUARES: Record<string, PdfRect> = {
  'p1.marital.single': { x: 538.38, y: 527.0, w: 7.38, h: 7.38 },
  'p1.marital.married': { x: 495.38, y: 527.0, w: 7.38, h: 7.38 },
  'p1.marital.common_law': { x: 458.13, y: 527.0, w: 7.38, h: 7.38 },
  'p1.marital.divorced': { x: 392.5, y: 527.0, w: 7.38, h: 7.38 },
  'p1.marital.widowed': { x: 352.0, y: 527.0, w: 7.38, h: 7.38 },
  'p1.digital.refuse': { x: 543.0, y: 266.25, w: 6.38, h: 6.13 },
  'p2.start.check': { x: 542.63, y: 435.5, w: 4.75, h: 4.75 },
  'p2.start.hours.1_11': { x: 414.0, y: 406.5, w: 5.25, h: 5.25 },
  'p2.start.hours.12_19': { x: 316.13, y: 406.5, w: 5.25, h: 5.25 },
  'p2.start.hours.20_plus': { x: 212.88, y: 406.5, w: 5.25, h: 5.25 },
  'p2.change.check': { x: 542.0, y: 362.38, w: 5.25, h: 5.25 },
  'p2.spouseBusiness.check': { x: 542.0, y: 319.0, w: 5.25, h: 5.25 },
  'p2.end.check': { x: 542.0, y: 275.38, w: 5.25, h: 5.25 },
  'p2.employees.check': { x: 542.0, y: 246.5, w: 5.25, h: 5.25 },
};

/** הקצה העליון של קו הכתיבה המודפס (נק'). */
export const WRITING_LINES: Record<string, number> = {
  'p1.header.idNumber': 757.75, 'p2.header.idNumber': 751.88, 'p3.header.idNumber': 745.75,
  'p1.contact.emailLocal': 360.88, 'p1.contact.emailDomain': 360.88,
  'p2.start.date': 432.75, 'p2.start.monthlyIncome': 388.63, 'p2.start.profession': 374.25,
  'p2.change.before.from': 345.13, 'p2.change.before.hours': 345.13, 'p2.change.before.income': 345.13,
  'p2.change.after.from': 330.63, 'p2.change.after.hours': 330.63, 'p2.change.after.income': 330.63,
  'p2.spouseBusiness.from': 316.13, 'p2.spouseBusiness.share': 316.13, 'p2.spouseBusiness.hours': 301.5,
  'p2.end.date': 272.5, 'p2.end.currentOccupation': 272.5, 'p2.end.currentFrom': 272.5,
  'p2.employees.withholdingFile': 243.63, 'p2.employees.date': 243.63,
  'p3.declaration.date': 479.75,
  'p2.spouseBusiness.signature': 287.0, 'p3.declaration.signature': 479.75,
};

const MEASURED_FIELDS: FieldDef[] = FIELDS.map(f => {
  const square = CHECK_SQUARES[f.id];
  const line = WRITING_LINES[f.id];
  return { ...f, ...(square ? { box: square } : {}), ...(line != null ? { line } : {}) };
});

export const BTL6101_TEMPLATE: SmartFormTemplate = {
  key: BTL6101_TEMPLATE_KEY,
  title: 'דין וחשבון רב שנתי (6101)',
  authority: 'btl',
  formNumber: '6101',
  version: '06.2026',
  sha256: BTL6101_SHA256,
  mappingVersion: 2,
  pageCount: 3,
  pageSize: { width: 612, height: 792 },
  fileUrl: '/templates/btl-6101-06.2026.pdf',
  fields: MEASURED_FIELDS,
  unmapped: UNMAPPED,
};

export const fieldById = (id: string): FieldDef | undefined => MEASURED_FIELDS.find(x => x.id === id);

// קליטת רו״ה / 134 / ESNA — על נתונים סינתטיים בלבד (שם ומספר עוסק מומצאים).
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { identityMatches, parse134, parseAmount, parseEsna, parsePnl, parseTable, pnlToCutoff, readXlsx } from '../importers';

const MONTHS = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, '0')}/26`);
/** רו״ה במבנה של פייפרלס: כותרת, שורת חודשים, הכנסות, הוצאות לפי קטגוריה, סיכומים. נתונים עד ספטמבר. */
function pnlRows(opts: { badTotal?: boolean; gapMonth?: number } = {}): string[][] {
  const inc = MONTHS.map((_, i) => (i < 9 ? (i + 1 === opts.gapMonth ? '' : '30,000') : ''));
  const car = MONTHS.map((_, i) => (i < 9 && i + 1 !== opts.gapMonth ? '1,500' : ''));
  const sw = MONTHS.map((_, i) => (i < 9 && i + 1 !== opts.gapMonth ? '500' : ''));
  const exp = MONTHS.map((_, i) => (i < 9 && i + 1 !== opts.gapMonth ? '2,000' : ''));
  const prof = MONTHS.map((_, i) => (i < 9 && i + 1 !== opts.gapMonth ? '28,000' : ''));
  const n = opts.gapMonth ? 8 : 9;
  return [
    ['ישראל ישראלי - עוסק מורשה 123456782'],
    ['דוח רווח והפסד לתקופה 01/26 - 12/26'],
    ['קוד מיון', ...MONTHS, 'סכום'],
    ['הכנסות'],
    ['הכנסות ממתן שירותים בארץ', ...inc, (30_000 * n).toLocaleString('en-US')],
    ['סך הכנסות', ...inc, (30_000 * n + (opts.badTotal ? 1_000 : 0)).toLocaleString('en-US')],
    ['הוצאות הנהלה וכלליות'],
    ['הוצאות'],
    ['אחזקת רכב', ...car, (1_500 * n).toLocaleString('en-US')],
    ['תוכנות ושירותים', ...sw, (500 * n).toLocaleString('en-US')],
    ['סך הוצאות', ...exp, (2_000 * n).toLocaleString('en-US')],
    ['סך רווח והפסד', ...prof, (28_000 * n).toLocaleString('en-US')],
  ];
}

/** zip בשיטת stored (בלי דחיסה) — מספיק כדי לבדוק את קורא ה-xlsx. */
function storedZip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const nb = enc.encode(name), data = enc.encode(content);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, 0, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, 0, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, Object.keys(files).length, true); eocd.setUint16(10, Object.keys(files).length, true); eocd.setUint32(12, cdSize, true); eocd.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(eocd.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out.buffer;
}

export const TESTS: TestCase[] = [
  test('סכומים: פסיקים, ₪, מינוס בסוף ובסוגריים; ריק ⇒ undefined (לא 0)', () => {
    equal(parseAmount('12,345'), 12_345); equal(parseAmount('₪ 1,000-'), -1_000); equal(parseAmount('(250)'), -250); equal(parseAmount('-3.5'), -3.5);
    equal(parseAmount(''), undefined); equal(parseAmount('—'), undefined); equal(parseAmount('אין'), undefined);
  }),
  test('רו״ה: זיהוי, חודשים, סגירה עד ספטמבר, קטגוריות לתיאום — בלי אזהרות', () => {
    const p = parsePnl(pnlRows());
    equal(p.taxId, '123456782'); equal(p.name, 'ישראל ישראלי'); equal(p.year, 2026); equal(p.lastMonthWithData, 9);
    equal(p.warnings.length, 0);
    const c = pnlToCutoff(p, 9);
    equal(c.profit, 252_000); equal(c.turnover, 270_000); equal(c.monthsMeasured, 9); equal(c.checks.length, 0);
    equal(p.expenseCategories.map(x => `${x.label}:${x.toMonth(9)}`).join(','), 'אחזקת רכב:13500,תוכנות ושירותים:4500');
  }),
  test('רו״ה: סכום החודשים לא תואם לעמודת «סכום» — אזהרה; חודש ריק לפני הסגירה — לבדיקה, לא 0 בשקט', () => {
    const p = parsePnl(pnlRows({ badTotal: true, gapMonth: 5 }));
    assert(p.warnings.some(w => w.includes('סך הכנסות') && w.includes('≠')), JSON.stringify(p.warnings));
    const c = pnlToCutoff(p, 9);
    assert(c.checks.some(x => x.includes('5')), JSON.stringify(c.checks));
    const after = pnlToCutoff(p, 7);
    assert(after.checks.some(x => x.includes('אחרי חודש הסגירה')), JSON.stringify(after.checks));
  }),
  test('רו״ה: הדבקה בטאבים וגם CSV עם מרכאות — אותה תוצאה', () => {
    const rows = pnlRows();
    const tsv = rows.map(r => r.join('\t')).join('\n');
    const csv = rows.map(r => r.map(c => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
    equal(pnlToCutoff(parsePnl(parseTable(tsv)), 9).profit, 252_000);
    equal(pnlToCutoff(parsePnl(parseTable(csv)), 9).profit, 252_000);
  }),
  test('רו״ה: טבלה בלי שורת חודשים — לא נקלטת, עם הסבר', () => {
    const p = parsePnl([['סתם טקסט'], ['עוד שורה', '100']]);
    equal(p.months.length, 0);
    assert(p.warnings[0].includes('לא נמצאה שורת כותרת'), p.warnings[0]);
  }),
  test('xlsx: קורא מחרוזות משותפות ומספרים מהגיליון הראשון', async () => {
    const shared = '<sst><si><t>קוד מיון</t></si><si><t>01/26</t></si><si><t>סך רווח והפסד</t></si></sst>';
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>28000</v></c></row></sheetData></worksheet>';
    const rows = await readXlsx(storedZip({ 'xl/sharedStrings.xml': shared, 'xl/worksheets/sheet1.xml': sheet }));
    equal(JSON.stringify(rows), JSON.stringify([['קוד מיון', '01/26'], ['סך רווח והפסד', '28000']]));
  }),
  test('134: כותרת, מצבים, «עודכן ב», תקופה כפולה ושורה שלא זוהתה', () => {
    const t = parseTable(['עודכן ב- 05/10/2026', 'תקופה\tמצב דיווח\tמחזור\tחיוב\tתשלומים\tניכוי במקור\tתאריך עדכון',
      '07/2026\tדווח\t30,000\t1,500\t1,500\t0\t15/08/2026', '08/2026\tדווח\t35,000\t1,750\t1,750\t200\t15/09/2026',
      '09/2026\tטרם הגיע המועד\t\t\t\t\t', '08/2026\tדווח\t35,000\t1,750\t1,750\t200\t15/09/2026', 'סה"כ\t\t65,000\t3,250'].join('\n'));
    const r = parse134(t);
    equal(r.readOn, undefined); equal(r.decisionUpdatedOn, '2026-10-05');
    equal(r.periods.length, 4);
    equal(r.periods[2].state, 'not_due'); equal(r.periods[2].turnover, undefined);
    equal(r.periods[1].withheld, 200);
    assert(r.warnings.some(w => w.includes('פעמיים')), JSON.stringify(r.warnings));
    assert(r.skipped.length === 1, JSON.stringify(r.skipped));
  }),
  test('134 בלי כותרת: נקרא לפי סדר המסך, עם אזהרה לבדיקה', () => {
    const r = parse134(parseTable('07/2026  דווח  30,000  1,500  1,500'));
    equal(r.periods[0].turnover, 30_000); equal(r.periods[0].paid, 1_500);
    assert(r.warnings.some(w => w.includes('לפי הסדר')), JSON.stringify(r.warnings));
  }),
  test('ESNA: מחזור = חייבות + פטורות; «אקראי» בנפרד; שורת סה״כ לא נספרת; דו־חודשי 07-08/2026', () => {
    const r = parseEsna(parseTable(['תקופה\tעסקאות חייבות\tעסקאות פטורות\tעסקאות אקראי\tמס עסקאות',
      '07-08/2026\t60,000\t5,000\t\t10,200', '09/2026\t\t\t\t', '10/2026\t30,000\t\t2,000\t5,100', 'סה"כ\t90,000\t5,000\t2,000\t15,300'].join('\n')));
    equal(r.periods.map(p => `${p.period}:${p.state}:${p.turnover ?? '-'}`).join(','), '2026-08:reported:65000,2026-09:unknown:-,2026-10:reported:30000');
    equal(r.random.length, 1);
    assert(r.warnings.some(w => w.includes('אקראי')), JSON.stringify(r.warnings));
  }),
  test('זיהוי מול הכרטיס: תואם / לא תואם / לא ידוע; אפסים מובילים לא משנים', () => {
    equal(identityMatches('012345678', ['12345678']), 'match');
    equal(identityMatches('999999999', ['123456782', undefined]), 'mismatch');
    equal(identityMatches(undefined, ['1']), 'unknown');
    equal(identityMatches('1', [undefined]), 'unknown');
  }),
];

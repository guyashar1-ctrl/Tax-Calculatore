// ─── בדיקות: קריאת נתוני המבוטח מפורטל המייצגים של ביטוח לאומי ──────────────
// ‼ הפיקסצ'רים הם מה שנצפה בהקלטה של גיא (23.09.2026) על מבוטח אמיתי,
// בצורה שבה הסשן גורד אותם (טבלאות כמערכי מחרוזות, זוגות תווית/ערך), עם
// מזהים מוחלפים. הפירוט של שורה 4 («תלמיד להשכלה גבוהה, עובד») לא נפתח
// בהקלטה ולכן נבנה כאן — ובהרצה חיה על אותו מבוטח (23.09.2026) הוא אכן
// הכיל את רשומת הסטודנט 01/10/2023–30/09/2024, והרצף יצא 01/10/2023–30/09/2026,
// בדיוק כמו בסיכום של הפורטל («מ-01/10/23 עד 30/09/26»).
//
//   node --test worker/test/btl-file-sync.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseBtlDate, parseMoney, parseMonth, pickTable,
  parseOccupationSegments, parseOccupationRecords, segmentsToDrill,
  buildOccupationChains, extensionTargets, parseOccupationSummary, compareWithSummary,
  parseAdvanceLine, parseInsuredHeader, parseIncomeList, selectDirectIncome,
  parseDebitAuthorizations, parseLedgerBalance, findRepresentedRow, maskId,
} from '../src/btlFileSync.mjs';

const AS_OF = '2026-09-23';

// ── «רשימת עיסוקים» — שורות תקופה, כפי שנצפו. עמודה ראשונה: העיפרון. ──
const SEGMENTS_TABLE = {
  headerCells: ['', 'עיסוקים', 'מתאריך', 'עד תאריך'],
  dataRows: [
    ['', 'עצמאי', '01/10/2026', ''],
    ['', 'עצמאי, תלמיד להשכלה גבוהה', '01/06/2025', '30/09/2026'],
    ['', 'תלמיד להשכלה גבוהה', '17/01/2025', '31/05/2025'],
    ['', 'תלמיד להשכלה גבוהה, עובד', '01/10/2023', '16/01/2025'],
    ['', 'עובד', '01/09/2022', '30/09/2023'],
    ['', '( ללא עיסוק )', '01/09/2021', '31/08/2022'],
    ['', 'עובד', '06/08/2021', '31/08/2021'],
  ],
  rowHasAction: [true, true, true, true, true, false, true],
};

// ── «עיסוקים בתקופה» — הפירוט. שורות 0 ו-1 נצפו כלשונן. ──
const DRILL = {
  0: { headerCells: ['', 'עיסוקים', 'מתאריך', 'עד תאריך'], dataRows: [['', 'עצמאי', '01/06/2025', '']] },
  1: {
    headerCells: ['', 'עיסוקים', 'מתאריך', 'עד תאריך'],
    dataRows: [
      ['', 'תלמיד להשכלה גבוהה', '01/10/2025', '30/09/2026'],
      ['', 'עצמאי', '01/06/2025', ''],
      ['', 'תלמיד להשכלה גבוהה', '01/10/2024', '30/09/2025'],
    ],
  },
  // ‼ נבנה (לא נצפה) — ראה ההערה בראש הקובץ.
  3: {
    headerCells: ['', 'עיסוקים', 'מתאריך', 'עד תאריך'],
    dataRows: [
      ['', 'תלמיד להשכלה גבוהה', '01/10/2024', '30/09/2025'],
      ['', 'תלמיד להשכלה גבוהה', '01/10/2023', '30/09/2024'],
      ['', 'עובד', '01/09/2022', '16/01/2025'],
    ],
  },
};

/** מריץ את אותו אלגוריתם פירוט שהסשן מריץ, על הפיקסצ'רים. */
function simulateOccupations(drill = DRILL, { maxDrills = 6 } = {}) {
  const seg = parseOccupationSegments([SEGMENTS_TABLE]);
  assert.ok(seg.ok);
  const drilled = new Set();
  const records = [];
  let queue = segmentsToDrill(seg.segments, AS_OF).map(s => s.index);
  while (queue.length && drilled.size < maxDrills) {
    const i = queue.shift();
    if (drilled.has(i)) continue;
    drilled.add(i);
    if (!drill[i]) continue;
    const r = parseOccupationRecords([drill[i]]);
    assert.ok(r.ok);
    records.push(...r.records);
    if (queue.length === 0) {
      queue = extensionTargets(buildOccupationChains(records, AS_OF), seg.segments, drilled);
    }
  }
  return { chains: buildOccupationChains(records, AS_OF), drilled, records };
}

test('תאריכים: ארבע ספרות, שתי ספרות, וזבל', () => {
  assert.equal(parseBtlDate('15/06/2025'), '2025-06-15');
  assert.equal(parseBtlDate('01/10/23'), '2023-10-01');
  assert.equal(parseBtlDate(''), null);
  assert.equal(parseBtlDate('32/01/2025'), null);
});

test('סכומים: פסיקים, ח/ז, מינוס; ריק אינו 0', () => {
  assert.equal(parseMoney('47,583'), 47583);
  assert.equal(parseMoney('2,062 ח'), 2062);
  assert.equal(parseMoney('2,062 ז'), -2062);
  assert.equal(parseMoney('-320'), -320);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('אין'), null);
});

test('חודשים בעברית', () => {
  assert.equal(parseMonth('יוני'), 6);
  assert.equal(parseMonth('ספט\''), 9);
  assert.equal(parseMonth('12'), 12);
});

test('רשימת עיסוקים: שורות תקופה, «ללא עיסוק» אינו עיסוק ואין לו פירוט', () => {
  const r = parseOccupationSegments([SEGMENTS_TABLE]);
  assert.ok(r.ok);
  assert.equal(r.segments.length, 7);
  assert.deepEqual(r.segments[1].names, ['עצמאי', 'תלמיד להשכלה גבוהה']);
  assert.equal(r.segments[0].toDate, null, 'שורה בלי «עד תאריך» ⇒ פתוחה');
  const none = r.segments.find(s => s.label.includes('ללא'));
  assert.equal(none.drillable, false);
  assert.deepEqual(none.names, []);
});

test('מפרטים רק את התקופות שעדיין בתוקף: שורה 0 (פתוחה) ושורה 1 (עד 30/09/2026)', () => {
  const r = parseOccupationSegments([SEGMENTS_TABLE]);
  assert.deepEqual(segmentsToDrill(r.segments, AS_OF).map(s => s.index), [0, 1]);
});

test('שני עיסוקים בדיוק, עם התקופות המלאות — והסטודנט לא מאבד את 30/09/2026', () => {
  const { chains } = simulateOccupations();
  assert.equal(chains.length, 2, 'ספירה = 2');
  const self = chains.find(c => c.sourceLabel === 'עצמאי');
  const student = chains.find(c => c.sourceLabel === 'תלמיד להשכלה גבוהה');
  assert.ok(self && student, 'השמות המדויקים של ביטוח לאומי');
  assert.equal(self.fromDate, '2025-06-01');
  assert.equal(self.toDate, null, 'עצמאי — בלי סוף ⇒ ממשיך');
  assert.equal(student.toDate, '2026-09-30', 'תאריך הסיום של הסטודנט נשמר');
  // ‼ הרשומות כפי שהתקבלו מהמקור — לא נבלעות באיחוד.
  for (const p of [
    { fromDate: '2024-10-01', toDate: '2025-09-30' },
    { fromDate: '2025-10-01', toDate: '2026-09-30' },
  ]) {
    assert.ok(student.sourcePeriods.some(x => x.fromDate === p.fromDate && x.toDate === p.toDate),
      `הרשומה ${p.fromDate}–${p.toDate} נשמרת ב-sourcePeriods`);
  }
});

test('תאריך ההתחלה של רצף אינו תלוי בשורה שבמקרה פורטה: מפרטים אחורה עד תחילת הרצף', () => {
  const { chains, drilled } = simulateOccupations();
  assert.ok(drilled.has(3), 'שורה 4 («תלמיד להשכלה גבוהה, עובד») פורטה כי הרצף ממשיך לתוכה');
  assert.ok(!drilled.has(2), 'שורה 3 לא נחוצה — היא בתוך רצף שכבר ידוע');
  const student = chains.find(c => c.sourceLabel === 'תלמיד להשכלה גבוהה');
  assert.equal(student.fromDate, '2023-10-01', 'עקבי עם הסיכום של הפורטל («מ-01/10/23»)');
  assert.ok(!chains.some(c => c.sourceLabel === 'עובד'), '«עובד» שהסתיים ב-16/01/2025 אינו עיסוק נוכחי');
});

test('בלי הפירוט של שורה 4 (למשל נכשל) — הנתונים שנצפו בלבד: 01/10/2024 → 30/09/2026', () => {
  const { chains } = simulateOccupations({ 0: DRILL[0], 1: DRILL[1] });
  const student = chains.find(c => c.sourceLabel === 'תלמיד להשכלה גבוהה');
  assert.equal(student.fromDate, '2024-10-01');
  assert.equal(student.toDate, '2026-09-30');
  assert.equal(chains.length, 2);
});

test('הסיכום של ריכוז המידע: נקרא כבדיקת עקביות ומתיישב עם הפירוט', () => {
  const summary = parseOccupationSummary('עצמאי מ-01/06/25 תלמיד להשכלה גבוהה מ-01/10/23 עד 30/09/26');
  assert.deepEqual(summary, [
    { sourceLabel: 'עצמאי', fromDate: '2025-06-01', toDate: null },
    { sourceLabel: 'תלמיד להשכלה גבוהה', fromDate: '2023-10-01', toDate: '2026-09-30' },
  ]);
  const { chains } = simulateOccupations();
  assert.deepEqual(compareWithSummary(chains, summary), []);
  const partial = simulateOccupations({ 0: DRILL[0], 1: DRILL[1] }).chains;
  assert.deepEqual(compareWithSummary(partial, summary), ['start_differs:תלמיד להשכלה גבוהה:2023-10-01']);
});

test('עיסוקים חופפים אינם נחתכים זה מול זה', () => {
  const chains = buildOccupationChains([
    { label: 'עצמאי', fromDate: '2025-06-01', toDate: null },
    { label: 'תלמיד להשכלה גבוהה', fromDate: '2024-10-01', toDate: '2026-09-30' },
  ], AS_OF);
  assert.equal(chains.length, 2);
  assert.equal(chains[0].sourceLabel, 'תלמיד להשכלה גבוהה', 'ממוין לפי תחילה');
  assert.equal(chains[0].toDate, '2026-09-30');
});

test('דמי ביטוח: «2026 / 7-9 בסיס : עצמאי 47,583 ד"ב : 2026/1 סכום : 2062» — גם בסדר הפוך', () => {
  for (const line of [
    '2026 / 7-9 בסיס : עצמאי 47,583 ד"ב : 2026/1 סכום : 2062',
    '2026 / 9-7 בסיס : עצמאי 47,583 ד"ב : 2026/1 סכום : 2062',
  ]) {
    const a = parseAdvanceLine(line);
    assert.equal(a.year, 2026);
    assert.equal(a.fromMonth, 7);
    assert.equal(a.toMonth, 9);
    assert.equal(a.months, 3);
    assert.equal(a.basisCategory, 'עצמאי');
    assert.equal(a.periodBasis, 47583, 'הבסיס לתקופה — לא ההכנסה');
    assert.equal(a.advanceMonthly, 2062);
  }
  assert.equal(parseAdvanceLine(''), null);
  assert.equal(parseAdvanceLine('2026 / 7-9'), null, 'בלי בסיס וסכום ⇒ אין ערך');
});

test('כותרת המבוטח: ת.ז., יתרה, סוג הרשאת החיוב', () => {
  const h = parseInsuredHeader([
    { label: 'זהות:', value: '123456782' }, { label: 'טלפון:', value: '054-5538494' },
    { label: 'יתרה:', value: '0' }, { label: 'הרשאת חיוב:', value: 'חשבון בנק' },
  ]);
  assert.deepEqual(h, { idNumber: '123456782', balance: 0, debitType: 'חשבון בנק' });
});

test('רשימת הכנסות: הרשומה הישירה — 2025 · הצהרה · עצמאי · 16,500 · 15/06/2025 · תקף', () => {
  const r = parseIncomeList([{
    headerCells: ['שנה', 'מחודש', 'עד חודש', 'מקור מידע', 'מקור הכנסה', 'סכום הכנסה', 'תאריך קבלה', 'תיקון מקדמות', 'סטטוס'],
    dataRows: [['2025', 'יוני', 'יוני', 'הצהרה', 'עצמאי', '16500', '15/06/2025', '', 'תקף']],
  }]);
  assert.ok(r.ok);
  const d = selectDirectIncome(r.rows);
  assert.equal(d.year, 2025);
  assert.equal(d.monthlyAmount, 16500);
  assert.equal(d.infoSource, 'הצהרה');
  assert.equal(d.incomeSource, 'עצמאי');
  assert.equal(d.receivedDate, '2025-06-15');
  assert.equal(d.fromMonth, 6);
});

test('רשימת הכנסות: רשומה שאינה תקפה אינה נבחרת; השנה האחרונה והקבלה האחרונה גוברות', () => {
  const d = selectDirectIncome([
    { year: 2024, monthlyAmount: 9000, status: 'תקף', incomeSource: 'עצמאי', receivedDate: '2024-03-01' },
    { year: 2025, monthlyAmount: 12000, status: 'מבוטל', incomeSource: 'עצמאי', receivedDate: '2025-08-01' },
    { year: 2025, monthlyAmount: 15000, status: 'תקף', incomeSource: 'עצמאי', receivedDate: '2025-02-01' },
    { year: 2025, monthlyAmount: 16500, status: 'תקף', incomeSource: 'עצמאי', receivedDate: '2025-06-15' },
  ]);
  assert.equal(d.monthlyAmount, 16500);
  assert.equal(d.alternatives, 1);
  assert.equal(selectDirectIncome([{ year: 2025, monthlyAmount: 1, status: 'מבוטל' }]), null, 'אין תקפה ⇒ אין ערך');
});

test('הרשאות לחיוב: שורה «פתוח» ⇒ פעילה; פרטי החשבון לא נקראים בכלל', () => {
  const r = parseDebitAuthorizations([{
    headerCells: ['', 'מתאריך', 'עד תאריך', 'סטטוס', 'פרטי חשבון'],
    dataRows: [['', '24/06/2025', '', 'פתוח', '12 345 67890'], ['', '24/04/2022', '06/11/2022', 'סגור', '1111** 06/2027']],
  }]);
  assert.deepEqual(r, { ok: true, active: true, openSince: '2025-06-24', rows: 2 });
  assert.ok(!JSON.stringify(r).includes('67890'), 'מספר החשבון אינו יוצא מהפונקציה');
});

test('הרשאות לחיוב: רק סגורות ⇒ false (המקור אומר «אין»); טבלה חסרה ⇒ לא נקרא', () => {
  const closed = parseDebitAuthorizations([{
    headerCells: ['', 'מתאריך', 'עד תאריך', 'סטטוס', 'פרטי חשבון'],
    dataRows: [['', '24/04/2022', '06/11/2022', 'סגור', 'x']],
  }]);
  assert.equal(closed.ok, true);
  assert.equal(closed.active, false);
  const missing = parseDebitAuthorizations([{ headerCells: ['משהו'], dataRows: [] }]);
  assert.equal(missing.ok, false);
});

test('מצב חשבון: היתרה היא «סכום מצטבר» בשורה העליונה', () => {
  const headerCells = ['יום ערך', 'תאור', 'שנה', 'חובה', 'זכות', 'קנס', 'הצמדה', 'סימן', 'סכום מצטבר'];
  const r = parseLedgerBalance([{ headerCells, dataRows: [
    ['15/09/2026', 'תקבול ה.קבע בבנק', '', '', '2,062 ז', '', '', '', '0'],
    ['15/09/2026', 'מקדמה', '26', '2,062 ח', '', '', '', '', '2,062'],
  ] }]);
  assert.deepEqual(r, { ok: true, balance: 0, asOfDate: '2026-09-15' });
  const debt = parseLedgerBalance([{ headerCells, dataRows: [['15/09/2026', 'מקדמה', '26', '2,062 ח', '', '', '', '', '2,062']] }]);
  assert.equal(debt.balance, 2062, 'חיובי = חוב, כמו בכרטיס');
});

test('חיפוש מיוצגים: התאמה מדויקת לפי ת.ז.; אין ⇒ not_found; שתיים ⇒ ambiguous', () => {
  const t = {
    headerCells: ['', 'זהות/תיק מעסיק', 'שם', 'סוג', 'תאריך קליטה', 'הרשאה לחיוב', 'מזהה פנקס', 'סטטוס'],
    dataRows: [['', '123456782', 'ישראלי דנה', 'מבוטח', '04/08/2026', 'חשבון בנק', '', '']],
  };
  assert.deepEqual(findRepresentedRow([t], '123456782'), { found: true, index: 0, type: 'מבוטח', receivedDate: '2026-08-04' });
  assert.equal(findRepresentedRow([t], '300000007').reason, 'not_found');
  const two = { ...t, dataRows: [...t.dataRows, t.dataRows[0]] };
  assert.equal(findRepresentedRow([two], '123456782').reason, 'ambiguous');
});

test('בחירת טבלה: שתי טבלאות שונות עם אותן כותרות ⇒ ambiguous, לא ניחוש', () => {
  const a = { headerCells: ['עיסוקים', 'מתאריך', 'עד תאריך'], dataRows: [['עצמאי', '01/01/2025', '']] };
  const b = { headerCells: ['עיסוקים', 'מתאריך', 'עד תאריך'], dataRows: [['עובד', '01/01/2024', '']] };
  assert.equal(pickTable([a, b], ['עיסוקים', 'מתאריך', 'עד תאריך']).reason, 'ambiguous_table');
  assert.equal(pickTable([a, a], ['עיסוקים', 'מתאריך', 'עד תאריך']).ok, true, 'אותה טבלה פעמיים (מקוננת) — בסדר');
});

test('ת.ז. בלוג — מוסתרת', () => {
  assert.equal(maskId('123456782'), '…782');
});

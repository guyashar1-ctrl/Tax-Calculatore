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
  parseAdvanceLine, parseInsuredHeader, parseIncomeList, selectDeclaredIncome, incomeEvidence,
  parseDebitAuthorizations, parseLedgerBalance, findRepresentedRow, maskId,
  hoursBandFromLabel, recordsToDetail, parseOccupationDetail, attachDetails,
  parseSummaryFacts, familyStatusCode, parseDocumentList, isReportDocument, parseNoticeList, noticeCategory,
  parseReserveDutyBenefits, parseAnnualContributions,
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

const INCOME_HEAD = ['שנה', 'מחודש', 'עד חודש', 'מקור מידע', 'מקור הכנסה', 'סכום הכנסה', 'תאריך קבלה', 'תיקון מקדמות', 'סטטוס'];

test('רשימת הכנסות: הצהרה — 2025 · יוני · עצמאי · 16,500 · 15/06/2025 · תקף ⇒ הכנסה חודשית', () => {
  const r = parseIncomeList([{
    headerCells: INCOME_HEAD,
    dataRows: [['2025', 'יוני', 'יוני', 'הצהרה', 'עצמאי', '16500', '15/06/2025', '', 'תקף']],
  }]);
  assert.ok(r.ok);
  assert.equal(r.rows[0].amount, 16500, 'הסכום כלשונו');
  assert.ok(!('monthlyAmount' in r.rows[0]), 'השורה הגולמית אינה טוענת «לחודש»');
  const d = selectDeclaredIncome(r.rows);
  assert.equal(d.year, 2025);
  assert.equal(d.amount, 16500);
  assert.equal(d.monthlyAmount, 16500, 'הצורה לאתר שלפני 219');
  assert.equal(d.infoSource, 'הצהרה');
  assert.equal(d.incomeSource, 'עצמאי');
  assert.equal(d.receivedDate, '2025-06-15');
  assert.equal(d.fromMonth, 6);
  assert.equal(d.toMonth, 6);
});

// ‼ המקרה האמיתי (05.10.2026): שומה שנתית 47,800 נבחרה כ«47,800 לחודש».
const ASSESSMENT_TABLE = {
  headerCells: INCOME_HEAD,
  dataRows: [
    ['2025', 'ינואר', 'דצמבר', 'שומה עצמי', 'עצמאי', '47800', '05/09/2026', '', 'תקף'],
    ['2024', 'ינואר', 'דצמבר', 'שומה עצמי', 'עצמאי', '21327', '05/01/2026', '', 'תקף'],
    ['2023', 'ינואר', 'דצמבר', 'שומה עצמי', 'עצמאי', '0', '05/12/2025', '', 'תקף'],
    ['2022', 'ינואר', 'דצמבר', 'שומה עצמי', 'עצמאי', '46800', '05/08/2023', '', 'תקף'],
    ['2021', 'ינואר', 'דצמבר', 'שומה עצמי', 'עצמאי', '36400', '05/11/2022', '', 'תקף'],
    ['2021', '', '', '', 'עובד', '4860', '', '', ''],
    ['2020', 'ינואר', 'דצמבר', 'שומה עצמי', 'עצמאי', '28487', '15/11/2021', '', 'תקף'],
    ['2020', 'ינואר', 'דצמבר', 'שומה עצמי', 'עצמאי', '19487', '05/08/2021', '', 'תקף'],
  ],
};

test('רשימת הכנסות: שומות בלבד ⇒ אין הצהרה חודשית; כל השורות נשמרות כלשונן', () => {
  const r = parseIncomeList([ASSESSMENT_TABLE]);
  assert.ok(r.ok);
  assert.equal(r.rows.length, 8, 'כולל שורת השכיר ושורת האפס');
  assert.deepEqual(
    { year: r.rows[0].year, from: r.rows[0].fromMonth, to: r.rows[0].toMonth, info: r.rows[0].infoSource, amount: r.rows[0].amount },
    { year: 2025, from: 1, to: 12, info: 'שומה עצמי', amount: 47800 },
  );
  assert.equal(r.rows[2].amount, 0, 'אפס תקף הוא ערך, לא «חסר»');
  assert.equal(r.rows[5].incomeSource, 'עובד');
  assert.equal(r.rows[5].status, null);
  assert.equal(selectDeclaredIncome(r.rows), null, 'שומה אינה הצהרה — גם כשהיא האחרונה');
});

test('רשימת הכנסות: הצהרה נבחרת לפי תקופה, לא לפי סדר; שכיר/מבוטל/שומה אינם הצהרה', () => {
  const rows = [
    { year: 2025, fromMonth: 1, toMonth: 12, infoSource: 'שומה עצמי', incomeSource: 'עצמאי', amount: 47800, status: 'תקף', receivedDate: '2026-09-05' },
    { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 16500, status: 'תקף', receivedDate: '2025-06-15' },
    { year: 2025, fromMonth: 2, toMonth: 2, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 15000, status: 'תקף', receivedDate: '2025-02-01' },
    { year: 2025, fromMonth: 9, toMonth: 9, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 12000, status: 'מבוטל', receivedDate: '2025-09-01' },
    { year: 2026, fromMonth: 1, toMonth: 1, infoSource: 'הצהרה', incomeSource: 'עובד', amount: 9000, status: 'תקף', receivedDate: '2026-01-10' },
  ];
  for (const order of [rows, [...rows].reverse()]) {
    const d = selectDeclaredIncome(order);
    assert.equal(d.amount, 16500);
    assert.equal(d.alternatives, 1);
  }
  assert.equal(selectDeclaredIncome([{ year: 2025, amount: 1, status: 'מבוטל', infoSource: 'הצהרה', incomeSource: 'עצמאי' }]), null, 'אין תקפה ⇒ אין ערך');
});

test('רשימת הכנסות: שתי הצהרות מתחרות (אותה תקופה, אותו יום, סכום שונה) ⇒ לא בוחרים', () => {
  const base = { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', status: 'תקף', receivedDate: '2025-06-15' };
  assert.equal(selectDeclaredIncome([{ ...base, amount: 16500 }, { ...base, amount: 9000 }]), null);
  assert.equal(selectDeclaredIncome([{ ...base, amount: 16500 }, { ...base, amount: 16500 }]).amount, 16500, 'כפילות זהה אינה תחרות');
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
  assert.deepEqual(findRepresentedRow([t], '123456782'), { found: true, index: 0, type: 'מבוטח', receivedDate: '2026-08-04', debitAuthorization: 'חשבון בנק' });
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

// ─── פירוט עיסוק (v135z) ועמודות החיפוש — נצפו בבדיקה חיה 28.09.2026 ──────
// ‼ הערכים כאן **סינתטיים** (ת.ז. בדיקה, סכומים ומשלח יד מומצאים); רק המבנה
// — התוויות, כפתורי הרדיו, שורת ההגדרה ו«מצב:» — נלקח מהמסך.

const DETAIL_RAW = {
  pairs: [
    { label: 'זהות:', value: '123456782' }, { label: 'יתרה:', value: '0' },
    { label: 'מתאריך', value: '01/06/2025' }, { label: 'עד תאריך', value: '' },
    { label: 'רישום', value: 'כ' }, { label: 'תאריך רישום', value: '16/06/2025' },
    { label: 'הכנסה להגדרה', value: '9000' },
    { label: 'שעות עבודה בשבוע', value: '1 עד 11 שעות 12 עד 19 שעות 20 שעות ומעלה' },
    { label: 'משלח יד', value: 'ייעוץ' }, { label: 'מקור מידע', value: '' },
  ],
  radios: [
    { label: '1 עד 11 שעות', checked: false },
    { label: '12 עד 19 שעות', checked: false },
    { label: '20 שעות ומעלה', checked: true },
  ],
  lines: ['הכנסה להגדרה 9000', 'עצמאי לפי הגדרה של 12 שעות ו-15% מהשכר הממוצע', 'מצב: תקף'],
  heading: 'עיסוק - עצמאי',
};

test('טווח שעות: שלוש התוויות של הרדיו ⇒ טווח; תווית אחרת ⇒ null (לא מספר)', () => {
  assert.equal(hoursBandFromLabel('1 עד 11 שעות'), '1_11');
  assert.equal(hoursBandFromLabel('12 עד 19 שעות'), '12_19');
  assert.equal(hoursBandFromLabel('20 שעות ומעלה'), '20_plus');
  assert.equal(hoursBandFromLabel('מעל 40'), null);
});

test('פירוט עיסוק: כל השדות, הכלל מפורק, ושורת «יצירה» לא נקראת', () => {
  const p = parseOccupationDetail(DETAIL_RAW);
  assert.equal(p.ok, true);
  assert.deepEqual(p.value, {
    label: 'עצמאי', fromDate: '2025-06-01', toDate: null, hoursBand: '20_plus', definitionIncome: 9000,
    definitionText: 'עצמאי לפי הגדרה של 12 שעות ו-15% מהשכר הממוצע',
    definitionRule: { weeklyHours: 12, averageWagePct: 15 },
    profession: 'ייעוץ', registeredDate: '2025-06-16', status: 'תקף',
  });
});

test('פירוט עיסוק: אין רדיו מסומן / שני מסומנים ⇒ hoursBand null; אין הכנסה ⇒ null ולא 0', () => {
  const none = parseOccupationDetail({ ...DETAIL_RAW, radios: DETAIL_RAW.radios.map(r => ({ ...r, checked: false })) });
  assert.equal(none.value.hoursBand, null);
  const two = parseOccupationDetail({ ...DETAIL_RAW, radios: DETAIL_RAW.radios.map(r => ({ ...r, checked: true })) });
  assert.equal(two.value.hoursBand, null, 'לא מנחשים בין שני טווחים');
  const noIncome = parseOccupationDetail({ ...DETAIL_RAW, pairs: DETAIL_RAW.pairs.map(p => p.label === 'הכנסה להגדרה' ? { ...p, value: '' } : p) });
  assert.equal(noIncome.value.definitionIncome, null);
  const otherWording = parseOccupationDetail({ ...DETAIL_RAW, lines: ['עצמאי שאינו עונה להגדרה'] });
  assert.equal(otherWording.value.definitionText, 'עצמאי שאינו עונה להגדרה', 'נוסח אחר נשמר כלשונו');
  assert.equal(otherWording.value.definitionRule, null, 'ולא מפורק לכלל שלא נצפה');
  assert.equal(parseOccupationDetail({ pairs: [], radios: [], lines: [] }).ok, false);
});

test('אילו רשומות פותחים: עצמאי בתוקף בלבד, עד שתיים', () => {
  const tables = [{ headerCells: ['', 'עיסוקים', 'מתאריך', 'עד תאריך'], dataRows: [
    ['', 'תלמיד להשכלה גבוהה', '01/10/2025', '30/09/2026'],
    ['', 'עצמאי', '01/06/2025', ''],
    ['', 'עצמאי', '01/01/2020', '31/12/2020'],
  ] }];
  assert.deepEqual(recordsToDetail(tables, AS_OF), [1]);
});

test('הצמדת פירוט: רק אחרי אימות זהות ואותה רשומה; אחרת אזהרה והרשומה נשארת בלי פירוט', () => {
  const recs = () => [{ label: 'עצמאי', fromDate: '2025-06-01', toDate: null, index: 1 }];
  const ok = recs();
  assert.deepEqual(attachDetails(ok, [{ index: 1, ok: true, ...DETAIL_RAW }], '123456782'), []);
  assert.equal(ok[0].detail.hoursBand, '20_plus');
  assert.equal(ok[0].detail.periodFrom, '2025-06-01');

  const otherPerson = recs();
  assert.deepEqual(attachDetails(otherPerson, [{ index: 1, ok: true, ...DETAIL_RAW }], '300000007'), ['detail_identity_unverified:עצמאי']);
  assert.equal(otherPerson[0].detail, undefined);

  const otherRow = recs();
  const shifted = { ...DETAIL_RAW, pairs: DETAIL_RAW.pairs.map(p => p.label === 'מתאריך' ? { ...p, value: '01/01/2024' } : p) };
  assert.deepEqual(attachDetails(otherRow, [{ index: 1, ok: true, ...shifted }], '123456782'), ['detail_mismatch:עצמאי']);
  assert.equal(otherRow[0].detail, undefined);

  const failed = recs();
  assert.deepEqual(attachDetails(failed, [{ index: 1, ok: false, reason: 'record_detail_not_found' }], '123456782'), ['detail_failed:עצמאי']);
});

test('הרצף נושא את הפירוט של הרשומה המאוחרת שנפתחה', () => {
  const chains = buildOccupationChains([
    { label: 'עצמאי', fromDate: '2025-06-01', toDate: null, detail: { hoursBand: '20_plus', periodFrom: '2025-06-01' } },
    { label: 'תלמיד להשכלה גבוהה', fromDate: '2025-10-01', toDate: '2026-09-30' },
  ], AS_OF);
  assert.equal(chains.find(c => c.sourceLabel === 'עצמאי').detail.hoursBand, '20_plus');
  assert.equal('detail' in chains.find(c => c.sourceLabel !== 'עצמאי'), false, 'בלי פירוט ⇒ אין מפתח, לא null');
});

test('חיפוש מיוצגים: עמודות הסטטוס נקראות כלשונן, ו«מזהה פנקס»/«שם» לא', () => {
  const t = {
    headerCells: ['פעולות', 'זהות/תיק מעסיק', 'שם', 'סוג', 'תאריך קליטה', 'הרשאה לגימלאות', 'הרשאה לחיוב', 'מזהה פנקס', 'סטטוס'],
    dataRows: [['ממתין תוקף', '123456782', 'בדיקה ראשונה', 'מבוטח', '04/08/2026', '', 'חשבון בנק', '555', 'ממתין לאישור']],
  };
  const r = findRepresentedRow([t], '123456782');
  assert.deepEqual(r, {
    found: true, index: 0, type: 'מבוטח', receivedDate: '2026-08-04',
    debitAuthorization: 'חשבון בנק', status: 'ממתין לאישור', pendingAction: 'ממתין תוקף',
  });
  assert.ok(!JSON.stringify(r).includes('555') && !JSON.stringify(r).includes('בדיקה ראשונה'));
});

// ─── בדיקה חיה שנייה (28.09.2026): ריכוז מידע, תיק מסמכים, הודעות, גמלאות, דמי ביטוח ─
// ‼ סינתטי: המבנה (תוויות, כותרות, נוסח סוגים) מהמסך; הערכים מומצאים.

const SUMMARY_PAIRS = [
  { label: 'זהות', value: '123456782' }, { label: 'מצב משפחתי', value: 'נשוי' }, { label: 'תושבות', value: 'כן' },
  { label: 'גמלאות', value: '*' }, { label: 'ביקורת גביה', value: '' }, { label: 'הסדר תשלומים', value: '' },
  { label: 'ביקורת גביה', value: '01/24-12/24' }, { label: 'אכיפה', value: '' }, { label: 'תיק ניכויים', value: '' },
  { label: 'הוראת קבע', value: 'חב' }, { label: 'כיסוי ביטוחי', value: 'זו"ש מ- 06/25' }, { label: 'יתרה', value: '0' },
  { label: 'חובת תשלום', value: 'עצמאי' },
];

test('ריכוז מידע: עובדות עם «ריק = אין», תווית כפולה מאוחדת, וקוד מצב משפחתי', () => {
  const r = parseSummaryFacts(SUMMARY_PAIRS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    familyStatus: { raw: 'נשוי', code: 'married' },
    residency: { raw: 'כן' },
    paymentObligation: { raw: 'עצמאי' },
    coverage: { raw: 'זו"ש מ- 06/25', sinceMonth: '2025-06' },
    enforcement: { raw: null },
    paymentArrangement: { raw: null },
    collectionAudit: { raw: '01/24-12/24' },
    withholdingFile: { raw: null },
  });
  assert.ok(!('standingOrder' in r.value) && !('benefitsMark' in r.value), 'רק תוויות עם משמעות ברורה');
});

test('ריכוז מידע: בלי «מצב משפחתי»/«חובת תשלום» — זה לא ריכוז המידע (לא «אין»)', () => {
  assert.deepEqual(parseSummaryFacts([{ label: 'מלל לחיפוש', value: '' }]), { ok: false, reason: 'summary_labels_missing' });
  const noLabel = parseSummaryFacts(SUMMARY_PAIRS.filter(p => p.label !== 'אכיפה'));
  assert.equal('enforcement' in noLabel.value, false, 'תווית שלא נמצאה ⇒ המפתח חסר, לא null');
});

test('מצב משפחתי: נוסחים מוכרים ⇒ קוד; נוסח לא מוכר ⇒ null', () => {
  assert.equal(familyStatusCode('רווק'), 'single');
  assert.equal(familyStatusCode('נשואה'), 'married');
  assert.equal(familyStatusCode('גרושה'), 'divorced');
  assert.equal(familyStatusCode('אלמן'), 'widowed');
  assert.equal(familyStatusCode('ידוע בציבור'), 'common_law');
  assert.equal(familyStatusCode('אחר'), null);
  assert.equal(familyStatusCode(''), null);
});

test('תיק מסמכים: שורות עם תאריך, עמודים והפניית סריקה מגובבת; ממוין מהחדש', () => {
  const tables = [{ headerCells: ['פעולות', 'תאור', "עמ'", 'תאריך'], dataRows: [
    ['', 'יפויי כוח', '2', '04/08/2026'],
    ['', 'דין וחשבון', '3', '15/09/2026'],
    ['', '', '1', '01/01/2026'],
  ] }];
  const r = parseDocumentList(tables, ['aaaa1111bbbb2222', 'cccc3333dddd4444', null]);
  assert.deepEqual(r, { ok: true, items: [
    { description: 'דין וחשבון', date: '2026-09-15', pages: 3, scanRef: 'cccc3333dddd4444' },
    { description: 'יפויי כוח', date: '2026-08-04', pages: 2, scanRef: 'aaaa1111bbbb2222' },
  ] });
  assert.equal(isReportDocument('דין וחשבון'), true);
  assert.equal(isReportDocument('יפויי כוח'), false);
});

test('הודעות: רק סוגים רלוונטיים נשמרים (מטא-דאטה); השאר נספרים', () => {
  const tables = [{ headerCells: ['פעולות', 'תאריך', 'סוג הודעה', 'מצב', 'מען'], dataRows: [
    ['', '10/09/2026', 'הודעת יפוי כח למייצג(מ)', 'הודעה נש(מ)', 'מגורים'],
    ['', '01/09/2026', 'SMS - הסדר חוב הפרש שומה (תשלום עתידי)', 'הודעה נש(מ)', 'טלפון'],
    ['', '20/08/2026', 'דף תשלומים לעצמאי(מ)', 'הודעה נש(מ)', 'מגורים'],
    ['', '15/08/2026', 'SMS - קיים חוב בדמי ביטוח(מ)', 'הודעה נש(מ)', 'טלפון'],
    ['', '01/08/2026', 'עדכונים למבוטח', 'הודעה נשלחה', 'מגורים'],
    ['', '01/07/2026', 'הודעה לחייל משתחרר חובות/זכויות', 'לא למשלוח', 'מגורים'],
  ] }];
  const r = parseNoticeList(tables);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map(n => [n.date, n.category]), [
    ['2026-09-10', 'representation'], ['2026-09-01', 'assessment'], ['2026-08-01', 'insured_update'],
  ]);
  assert.equal(r.otherCount, 3);
  assert.ok(!JSON.stringify(r).includes('מגורים') && !JSON.stringify(r).includes('טלפון'), 'המען לא נשמר');
  assert.equal(noticeCategory('דרישה להמצאת מסמכים'), 'documents');
  assert.equal(noticeCategory('תגמולי מילואים לעצמאי'), 'reserve_duty');
  assert.equal(noticeCategory('דף תשלומים למינימליסט'), null);
});

test('גמלאות: שורות המילואים בלבד; גמלה אחרת נספרת; ריק במקור ⇒ null ולא 0', () => {
  const tables = [{ headerCells: ['', 'שנה', 'תאור גמלה', 'גמלה ברוטו', 'ניכוי מס', 'החזר חוב ברוטו', 'החזר מס'], dataRows: [
    ['', '2024', 'מילואים', '1,200', '120', '', ''],
    ['', '2025', 'מילואים', '18,450', '2,210', '', ''],
    ['', '2023', 'אבטלה', '6,000', '', '', ''],
  ] }];
  const r = parseReserveDutyBenefits(tables);
  assert.deepEqual(r, { ok: true, otherBenefitsCount: 1, rows: [
    { year: 2025, benefit: 'מילואים', gross: 18450, taxWithheld: 2210, debtRepaymentGross: null, taxRefund: null },
    { year: 2024, benefit: 'מילואים', gross: 1200, taxWithheld: 120, debtRepaymentGross: null, taxRefund: null },
  ] });
});

test('דמי ביטוח שנתיים: כותרת כפולה ⇒ לכל שנה סיווגים עם חיוב, בסיס ודמי ביטוח', () => {
  const rows = [
    ['', '', 'עצמאי', 'לא עובד', ''],
    ['פעולות', 'שנה', 'לפי שומה', 'מס מקביל', 'ביטוח בריאות', 'חיוב', 'בסיס סופי שנתי', 'דמי ביטוח לשנה', 'חיוב', 'בסיס סופי שנתי', 'דמי ביטוח לשנה', 'סה"כ דמי ביטוח'],
    ['תקופות חודשים', '2025', 'לא', '', '', 'חלקי', '120000', '12000', 'חלקי', '3000', '400', '12400'],
    ['תקופות חודשים', '2026', 'לא', '', '', 'מלא', '190000', '24000', '', '', '', '24000'],
    ['', '2027', '', '', '', '', '', '', '', '', '', '0'],
  ];
  const r = parseAnnualContributions(rows);
  assert.equal(r.ok, true);
  assert.deepEqual(r.years.map(y => y.year), [2027, 2026, 2025]);
  assert.deepEqual(r.years[2], { year: 2025, byAssessment: false, total: 12400, classes: [
    { classification: 'עצמאי', charge: 'חלקי', annualBase: 120000, annualContribution: 12000 },
    { classification: 'לא עובד', charge: 'חלקי', annualBase: 3000, annualContribution: 400 },
  ] });
  assert.deepEqual(r.years[0].classes, []);
  assert.equal(parseAnnualContributions([rows[1], rows[2]]).reason, 'group_mismatch', 'בלי שורת קבוצות — לא מנחשים שיוך');
});

test('רשימת הכנסות: יותר מ-40 שורות — כל שורות «הצהרה»/«שומה» נשלחות, רק שורות הקשר נחתכות; לא תלוי בסדר', () => {
  const ctx = Array.from({ length: 70 }, (_, i) => ({ year: 1990 + (i % 30), incomeSource: 'עובד', infoSource: null, amount: i, status: null }));
  const decl = { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 16500, status: 'תקף', receivedDate: '2025-06-15' };
  const rows = [...ctx.slice(0, 50), decl, ...ctx.slice(50)];
  const ev = incomeEvidence(rows);
  assert.equal(ev.rows, 71);
  assert.equal(ev.records.length, 41, 'שורת הבחירה + 40 שורות הקשר');
  assert.equal(ev.omitted, 30);
  assert.equal(ev.candidatesComplete, true);
  assert.ok(ev.records.some(r => r.amount === 16500), 'ההצהרה בשורה 51 נשמרה');
  assert.deepEqual(incomeEvidence([...rows].reverse()).records, ev.records, 'סדר הפוך — אותן שורות, באותו סדר');
  assert.equal(selectDeclaredIncome(rows).amount, 16500);
});

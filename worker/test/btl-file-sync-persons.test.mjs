// ─── בדיקות: קריאה לכל אדם — בידוד, כשל חלקי, נפילת סשן ──────────────────────
// ‼ הפורטל כאן מזויף: אותן פונקציות שה-handler מקבל מהסשן, אבל מוזנות
// מהפיקסצ'רים של ההקלטה. כך נבדק מה שהכי חשוב לא לשבור — שבני זוג לא
// מתערבבים, ושכשל לא הופך ל«אין ערך».
//
//   node --test worker/test/btl-file-sync-persons.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { readInsured, readSubjects } from '../src/btlFileSync.mjs';

const AS_OF = '2026-09-23';
const OCC = ['', 'עיסוקים', 'מתאריך', 'עד תאריך'];

const RIKUZ_PAIRS = [
  { label: 'זהות:', value: '123456782' }, { label: 'יתרה:', value: '0' },
  { label: 'הרשאת חיוב:', value: 'חשבון בנק' },
  { label: 'עיסוק:', value: 'עצמאי מ-01/06/25 תלמיד להשכלה גבוהה מ-01/10/23 עד 30/09/26' },
  { label: 'דמי ביטוח:', value: '2026 / 7-9 בסיס : עצמאי 47,583 ד"ב : 2026/1 סכום : 2062' },
];
const SEGMENTS = {
  headerCells: OCC,
  dataRows: [
    ['', 'עצמאי', '01/10/2026', ''],
    ['', 'עצמאי, תלמיד להשכלה גבוהה', '01/06/2025', '30/09/2026'],
    ['', 'תלמיד להשכלה גבוהה', '17/01/2025', '31/05/2025'],
    ['', 'תלמיד להשכלה גבוהה, עובד', '01/10/2023', '16/01/2025'],
  ],
  rowHasAction: [true, true, true, true],
};
const DRILL = {
  0: { headerCells: OCC, dataRows: [['', 'עצמאי', '01/06/2025', '']] },
  1: { headerCells: OCC, dataRows: [
    ['', 'תלמיד להשכלה גבוהה', '01/10/2025', '30/09/2026'],
    ['', 'עצמאי', '01/06/2025', ''],
    ['', 'תלמיד להשכלה גבוהה', '01/10/2024', '30/09/2025'],
  ] },
  // ‼ נבנה (לא נצפה) — עקבי עם הסיכום «מ-01/10/23».
  3: { headerCells: OCC, dataRows: [
    ['', 'תלמיד להשכלה גבוהה', '01/10/2023', '30/09/2024'],
    ['', 'עובד', '01/09/2022', '16/01/2025'],
  ] },
};
const INCOME = {
  headerCells: ['שנה', 'מחודש', 'עד חודש', 'מקור מידע', 'מקור הכנסה', 'סכום הכנסה', 'תאריך קבלה', 'תיקון מקדמות', 'סטטוס'],
  dataRows: [['2025', 'יוני', 'יוני', 'הצהרה', 'עצמאי', '16500', '15/06/2025', '', 'תקף']],
};
const DEBIT = { headerCells: ['', 'מתאריך', 'עד תאריך', 'סטטוס', 'פרטי חשבון'], dataRows: [['', '24/06/2025', '', 'פתוח', '12 345 67890']] };
const LEDGER = { headerCells: ['יום ערך', 'תאור', 'שנה', 'חובה', 'זכות', 'סכום מצטבר'], dataRows: [['15/09/2026', 'תקבול', '', '', '2,062 ז', '0']] };

const INSURED = { pairs: RIKUZ_PAIRS, segments: SEGMENTS, drill: DRILL, income: INCOME };
const SPOUSE = {
  pairs: [
    { label: 'זהות:', value: '300000007' }, { label: 'יתרה:', value: '0' },
    { label: 'דמי ביטוח:', value: '2026 / 7-9 בסיס : עצמאי 30,000 ד"ב : 2026/1 סכום : 1180' },
  ],
  segments: { headerCells: OCC, dataRows: [['', 'שכיר', '01/01/2020', '']] },
  drill: { 0: { headerCells: OCC, dataRows: [['', 'שכיר', '01/01/2020', '']] } },
  income: { ...INCOME, dataRows: [] },
};

/** פורטל מזויף: לכל ת.ז. הנתונים שלו; אפשר לביים כשל מקטע או נפילת סשן. */
function fakePortal({ people, failOn = {}, loseSessionOn } = {}) {
  let current = null;
  const lost = () => Object.assign(new Error('btl_session_lost'), { name: 'BtlSessionLost' });
  const guard = (what) => {
    if (loseSessionOn && loseSessionOn.id === current && loseSessionOn.at === what) throw lost();
    return failOn[`${current}:${what}`] ?? null;
  };
  return {
    async open(id) {
      if (!people[id]) return { ok: false, reason: 'not_found' };
      current = id;
      return { ok: true, pairs: people[id].pairs, representation: { type: 'מבוטח', receivedDate: '2026-08-04' } };
    },
    async readInfo() { return guard('info') ?? { ok: true, pairs: people[current].pairs }; },
    async openOccupationList() { return guard('occupations') ?? { ok: true, tables: [people[current].segments] }; },
    async drillSegment(i, opts) {
      const d = people[current].drill[i];
      if (!d) return { ok: false, reason: 'x' };
      // בלי פירוט מוגדר לאדם ⇒ הפורטל לא מחזיר פירוט בכלל (כמו לפני התוספת).
      const want = opts?.detailRows && people[current].details ? opts.detailRows([d]) : [];
      const details = want.map(index => people[current].details?.[`${i}:${index}`] ?? { index, ok: false, reason: 'record_detail_not_found' })
        .map((x, k) => ({ index: want[k], ...x }));
      return { ok: true, tables: [d], details, returned: true };
    },
    async openIncomeList() { return guard('income') ?? { ok: true, tables: [people[current].income] }; },
    async openDebitAuthorizations() { return guard('debit') ?? { ok: true, tables: [DEBIT] }; },
    async openLedger() { return guard('ledger') ?? { ok: true, tables: [LEDGER] }; },
  };
}

test('אדם אחד: כל המקטעים נקראים, ו-47,583 נשאר בסיס ולא הכנסה', async () => {
  const p = await readInsured(fakePortal({ people: { 123456782: INSURED } }), { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  assert.equal(p.ok, true);
  const s = p.sections;
  assert.equal(s.advance.value.periodBasis, 47583);
  assert.equal(s.advance.value.advanceMonthly, 2062);
  assert.equal(s.directIncome.value.monthlyAmount, 16500, 'ההכנסה הישירה — מקור נפרד');
  assert.deepEqual(s.occupations.value.map(o => [o.sourceLabel, o.fromDate, o.toDate]), [
    ['תלמיד להשכלה גבוהה', '2023-10-01', '2026-09-30'],
    ['עצמאי', '2025-06-01', null],
  ]);
  assert.deepEqual(s.occupations.warnings, []);
  assert.equal(s.debitAuthorization.value, true);
  assert.equal(s.balance.value, 0);
  assert.equal(p.representation.found, true);
  assert.ok(!JSON.stringify(p).includes('67890'), 'מספר החשבון לא יוצא מהעובד');
});

test('בני זוג מבודדים: לכל אחד הנתונים שלו, ואף ערך לא עובר ביניהם', async () => {
  const { persons } = await readSubjects(fakePortal({ people: { 123456782: INSURED, 300000007: SPOUSE } }), [
    { role: 'client', idNumber: '123456782' }, { role: 'spouse', idNumber: '300000007' },
  ], { asOf: AS_OF });
  const [a, b] = persons;
  assert.equal(a.role, 'client');
  assert.equal(b.role, 'spouse');
  assert.equal(a.sections.advance.value.advanceMonthly, 2062);
  assert.equal(b.sections.advance.value.advanceMonthly, 1180);
  assert.deepEqual(b.sections.occupations.value.map(o => o.sourceLabel), ['שכיר']);
  assert.equal(b.sections.directIncome.ok, true);
  assert.equal(b.sections.directIncome.value, null, 'אין הכנסה ברשימה ⇒ «אין», לא הערך של השני');
});

test('אחד לא נמצא, השני נקרא — התוצאה של המצליח נשמרת', async () => {
  const { persons } = await readSubjects(fakePortal({ people: { 123456782: INSURED } }), [
    { role: 'client', idNumber: '123456782' }, { role: 'spouse', idNumber: '300000007' },
  ], { asOf: AS_OF });
  assert.equal(persons[0].ok, true);
  assert.equal(persons[1].ok, false);
  assert.equal(persons[1].errorCode, 'not_found');
});

test('מקטע שנכשל מדווח כנכשל — ולא כ«אין ערך»; השאר נקראים', async () => {
  const p = await readInsured(
    fakePortal({ people: { 123456782: INSURED }, failOn: { '123456782:income': { ok: false, reason: 'income_table_not_found' } } }),
    { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  assert.equal(p.sections.directIncome.ok, false);
  assert.ok(!('value' in p.sections.directIncome), 'אין value בכלל — לא null');
  assert.equal(p.sections.advance.ok, true);
  assert.equal(p.sections.occupations.ok, true);
});

test('טבלת ההרשאות לא נקראה, אבל הכותרת אומרת «חשבון בנק» — ראיה ממקור מסומן', async () => {
  const p = await readInsured(
    fakePortal({ people: { 123456782: INSURED }, failOn: { '123456782:debit': { ok: false, reason: 'debit_table_not_found' } } }),
    { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  assert.equal(p.sections.debitAuthorization.ok, true);
  assert.equal(p.sections.debitAuthorization.value, true);
  assert.equal(p.sections.debitAuthorization.source, 'header');
});

test('הסשן נופל באמצע השני: הראשון נשמר, השני מסומן session_lost', async () => {
  const portal = fakePortal({ people: { 123456782: INSURED, 300000007: SPOUSE }, loseSessionOn: { id: '300000007', at: 'occupations' } });
  const { persons, sessionLost } = await readSubjects(portal, [
    { role: 'client', idNumber: '123456782' }, { role: 'spouse', idNumber: '300000007' },
  ], { asOf: AS_OF });
  assert.equal(sessionLost, true);
  assert.equal(persons[0].ok, true);
  assert.equal(persons[0].sections.advance.value.advanceMonthly, 2062);
  assert.equal(persons[1].ok, false);
  assert.equal(persons[1].errorCode, 'session_lost');
});

test('אם אף שורה בתוקף לא פורטה — העיסוקים «לא נקראו», לא רשימה ריקה', async () => {
  const p = await readInsured(fakePortal({ people: { 123456782: { ...INSURED, drill: {} } } }),
    { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  assert.equal(p.sections.occupations.ok, false);
  assert.equal(p.sections.occupations.reason, 'occupation_detail_unavailable');
});

// ─── פירוט עיסוק דרך הזרימה המלאה (סינתטי) ─────────────────────────────────
test('פירוט עיסוק: טווח השעות וההכנסה להגדרה מגיעים לרצף «עצמאי»; מה שלא אומת — לא', async () => {
  const detail = {
    ok: true, heading: 'עיסוק - עצמאי',
    pairs: [
      { label: 'זהות:', value: '123456782' },
      { label: 'מתאריך', value: '01/06/2025' }, { label: 'עד תאריך', value: '' },
      { label: 'תאריך רישום', value: '16/06/2025' }, { label: 'הכנסה להגדרה', value: '9000' },
      { label: 'משלח יד', value: 'ייעוץ' },
    ],
    radios: [{ label: '1 עד 11 שעות', checked: false }, { label: '12 עד 19 שעות', checked: true }, { label: '20 שעות ומעלה', checked: false }],
    lines: ['עצמאי לפי הגדרה של 12 שעות ו-15% מהשכר הממוצע', 'מצב: תקף'],
  };
  const person = { ...INSURED, details: { '0:0': detail, '1:1': detail } };
  const p = await readInsured(fakePortal({ people: { 123456782: person } }), { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  const se = p.sections.occupations.value.find(o => o.sourceLabel === 'עצמאי');
  assert.equal(se.detail.hoursBand, '12_19');
  assert.equal(se.detail.definitionIncome, 9000);
  assert.deepEqual(se.detail.definitionRule, { weeklyHours: 12, averageWagePct: 15 });
  assert.equal(p.sections.occupations.value.find(o => o.sourceLabel !== 'עצמאי').detail, undefined);
  assert.deepEqual(p.sections.occupations.warnings, []);

  // אותו פירוט, אבל הכותרת בדף היא של אדם אחר ⇒ לא מוצמד, ויש אזהרה.
  const wrong = { ...detail, pairs: detail.pairs.map(x => x.label === 'זהות:' ? { ...x, value: '300000007' } : x) };
  const q = await readInsured(fakePortal({ people: { 123456782: { ...INSURED, details: { '0:0': wrong, '1:1': wrong } } } }), { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  assert.equal(q.sections.occupations.value.find(o => o.sourceLabel === 'עצמאי').detail, undefined);
  assert.ok(q.sections.occupations.warnings.some(w => w.startsWith('detail_identity_unverified')));
});

// ─── המקטעים החדשים דרך הזרימה המלאה (סינתטי) ───────────────────────────────
function portalWithScreens(screens) {
  const base = fakePortal({ people: { 123456782: { ...INSURED, pairs: [...RIKUZ_PAIRS, { label: 'מצב משפחתי', value: 'רווק' }, { label: 'חובת תשלום', value: 'עצמאי' }] } } });
  return { ...base, ...screens };
}

test('מקטעים חדשים: נקראים; מסך ריק ⇒ «אין» (ok:true, empty); כשל מסך ⇒ ok:false, והשאר לא נפגע', async () => {
  const p = await readInsured(portalWithScreens({
    async openDocuments() { return { ok: true, tables: [{ headerCells: ['', 'תאור', "עמ'", 'תאריך'], dataRows: [['', 'דין וחשבון', '3', '15/09/2026']] }], scanRefs: ['ab12'] }; },
    async openNotices() { return { ok: false, reason: 'side_link_failed' }; },
    async openBenefits() { return { ok: true, tables: [], empty: true }; },
    async openAnnualContributions() { return { ok: true, empty: true, tables: [] }; },
    async openCorrespondence() { return { ok: true, empty: true, tables: [] }; },
    async openBenefitDebt() { return { ok: true, count: 2 }; },
  }), { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  const s = p.sections;
  assert.equal(s.summaryFacts.ok, true);
  assert.equal(s.summaryFacts.value.familyStatus.code, 'single');
  assert.deepEqual(s.documents.value.items, [{ description: 'דין וחשבון', date: '2026-09-15', pages: 3, scanRef: 'ab12' }]);
  assert.deepEqual(s.notices, { ok: false, reason: 'side_link_failed' }, 'כשל ⇒ «לא נקרא», לא «אין הודעות»');
  assert.deepEqual(s.reserveDuty, { ok: true, value: { rows: [], otherBenefitsCount: 0 }, empty: true });
  assert.deepEqual(s.correspondence.value, { count: 0 });
  assert.deepEqual(s.benefitDebt.value, { count: 2 });
  assert.equal(s.advance.ok, true, 'המקטעים הקיימים לא נפגעו');
});

test('ריכוז המידע לא נקרא ⇒ גם העובדות ממנו «לא נקרא» (לא מנחשים מזוגות של מסך אחר)', async () => {
  const p = await readInsured(fakePortal({ people: { 123456782: INSURED }, failOn: { '123456782:info': { ok: false, reason: 'summary_screen_not_reached' } } }),
    { role: 'client', idNumber: '123456782' }, { asOf: AS_OF });
  assert.deepEqual(p.sections.summaryFacts, { ok: false, reason: 'summary_unavailable' });
});

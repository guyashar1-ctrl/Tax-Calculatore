// פענוח רשימות שע״ם (IDOM / AHZM) — על דוגמאות סינתטיות בפריסה של צילום 19 ושל ה-PDF האמיתי של הצהרת ההון.
// ‼ ה-PDF האמיתי עצמו נבדק ב-scripts/e2e/shaam-filing-parse.mjs (מחוץ לריפו — פרטי לקוח).
import { assert, deepEqual, equal, test, type TestCase } from '../../../testkit/tinyTest';
import { flipRtl, itemsToGrid, toLogical } from '../parse/grid';
import { classifyHeader, parseGrid, parseShaamDate } from '../parse/parseShaam';
import { buildBatch, coverageText, fileVerdict, uncheckedWealthGroups, type ParsedFile } from '../parse/batch';
import { ANNUAL_SAMPLE_ROWS, ahzmPage, idomLegacyPage, idomPage, itemsFromLines, type Cell } from '../__fixtures__/terminal';

const parse = (lines: Cell[][]) => parseGrid(itemsToGrid(itemsFromLines(lines)));
const file = (key: string, pages: Cell[][][]): ParsedFile => ({ key, fileName: `${key}.pdf`, size: 1000, sha256: key, pages: pages.map(parse) });

export const TESTS: TestCase[] = [
  test('היפוך דו-כיווני: עברית מתהפכת, תאריך ומספר נשארים, סוגריים משתקפים, והפעולה הופכית לעצמה', () => {
    equal(flipRtl('ע\'י: ישר'), 'רשי :י\'ע');
    equal(flipRtl('סלע הדסה ו/או יאיר'), 'ריאי וא/ו הסדה עלס');
    equal(flipRtl('מועד (חוקי) 30.11.2026'), '30.11.2026 (יקוח) דעומ');
    for (const s of ['שנה 2025 עד 31/10/2026', 'מיוצגים (מיון / בחירה)', 'ש"מ לא קיימת']) equal(flipRtl(flipRtl(s)), s);
    equal(toLogical('000000018'), '000000018');
  }),
  test('תאריכים: dd/mm/yyyy, dd.mm.yyyy, yy; תאריך לא קיים — לא תקין', () => {
    equal(parseShaamDate('31/10/2026'), '2026-10-31');
    equal(parseShaamDate('30.11.2026'), '2026-11-30');
    equal(parseShaamDate('16/10/26'), '2026-10-16');
    equal(parseShaamDate('31/02/2026'), undefined);
    equal(parseShaamDate('/10/2026'), undefined);
  }),
  test('סיווג כותרות — «פקיד שומה» לפני «סעיף שומה», «מועד חוקי/תאריך ארכה» לפני «תאריך הגשה»', () => {
    equal(classifyHeader('חייב בהגשה'), 'required');
    equal(classifyHeader('מועד חוקי/ תאריך ארכה'), 'legalDue');
    equal(classifyHeader('תאריך הגשה'), 'filedOn');
    equal(classifyHeader('סעיף שומה'), 'section');
    equal(classifyHeader('פקיד שומה'), 'office');
    equal(classifyHeader('ס.ת'), 'fileType');
    equal(classifyHeader('שם משפחה ופרטי'), 'name');
    equal(classifyHeader('מספר תיק'), 'fileNumber');
    equal(classifyHeader('ח'), 'branch');
  }),
  test('צילום 19 (דוגמה): 3 דרישות פתוחות — 31.10, 30.11, 30.11; לא מ«ח» עם תאריך הגשה ולא משורות בלי «ח»', () => {
    const p = parse(idomPage({ year: 2025, rows: ANNUAL_SAMPLE_ROWS }));
    equal(p.status, 'ok', p.problems.join(' | '));
    equal(p.kind, 'annual'); equal(p.taxYear, 2025); equal(p.producedOn, '2026-10-15'); equal(p.page, 1); equal(p.pageTotal, undefined);
    deepEqual(p.columns, ['required', 'legalDue', 'filedOn', 'section', 'fileType', 'branch', 'office', 'name', 'fileNumber']);
    equal(p.rows.length, 10);
    const open = p.rows.filter(r => r.required === true && !r.filedOn && !r.noAssessment);
    deepEqual(open.map(r => [r.fileNumber, r.legalDue]), [['000000018', '2026-10-31'], ['000000034', '2026-11-30'], ['000000075', '2026-11-30']]);
    const filed = p.rows.filter(r => r.filedOn);
    deepEqual(filed.map(r => [r.fileNumber, r.filedOn, r.required]), [['000000026', '2026-06-07', true], ['000000059', '2026-05-13', true]]);
    const r6 = p.rows.find(r => r.fileNumber === '000000067')!;
    assert(r6.required === false && r6.legalDue === '2026-04-30' && r6.fileType === '91' && r6.section === '14', 'בלי «ח» — יש מועד, ס.ת 91, סעיף 14, ועדיין לא חייב');
    const na = p.rows.find(r => r.fileNumber === '000000042')!;
    assert(na.noAssessment === true && !na.legalDue && !na.filedOn && na.required === false, '«ש״מ לא קיימת» — נתון לא זמין, בלי תאריכים');
    equal(p.rows[1].name, 'דוגמה זוג ו/או ב');
    equal(p.rows[0].office, '39');
  }),
  test('IDOM מהמסלול הישן (בלי «חייב בהגשה») — «חסר סימון חבות», אף שורה לא חוזרת', () => {
    const p = parse(idomLegacyPage());
    equal(p.status, 'legacy_annual');
    equal(p.rows.length, 0);
    assert(/חייב בהגשה/.test(p.problems[0]) && /2 שורות לא נקלטו/.test(p.problems[0]), p.problems[0]);
    const v = fileVerdict(file('old', [idomLegacyPage()]));
    assert(!v.usable && v.tone === 'warn' && /חסר סימון חבות/.test(v.label), JSON.stringify(v));
  }),
  test('AHZM לא הגישו ללא קנס: מספר תיק עם אפס מוביל, שנה כפי שמופיעה, מועד, דף 1 מתוך 1', () => {
    const p = parse(ahzmPage({ group: 'unfiled_no_fine', rows: [{ file: '012345678', name: 'דוגמה זוגית ו/או בן', year: '2025', due: '30.11.2026' }] }));
    equal(p.status, 'ok', p.problems.join(' | '));
    equal(p.kind, 'wealth'); equal(p.group, 'unfiled_no_fine'); equal(p.page, 1); equal(p.pageTotal, 1);
    equal(p.producedAt, '2026-10-16T01:05:49');
    deepEqual(p.columns, ['year', 'legalDue', 'fileType', 'office', 'name', 'fileNumber']);
    const r = p.rows[0];
    deepEqual([r.fileNumber, r.yearShown, r.legalDue, r.name, r.office, r.fileType], ['012345678', '2025', '2026-11-30', 'דוגמה זוגית ו/או בן', '45', '52']);
    equal(r.required, undefined);
  }),
  test('AHZM ארבע הקבוצות מזוהות לפי הכותרת', () => {
    for (const g of ['unfiled_no_fine', 'unfiled_fine', 'filed_fine', 'filed_no_fine'] as const) {
      equal(parse(ahzmPage({ group: g, rows: [{ file: '000000018', name: 'דוגמה', year: '2024', due: '31.05.2025' }] })).group, g, g);
    }
  }),
  test('«אין תיקים שבקשת» — הקבוצה נבדקה וריקה', () => {
    const p = parse(ahzmPage({ group: 'unfiled_fine', rows: [], empty: true }));
    equal(p.status, 'empty_confirmed'); equal(p.group, 'unfiled_fine'); equal(p.rows.length, 0);
  }),
  test('תאריך לא תקין — נשמר כפי שנקרא, בלי מועד, ועם בעיה', () => {
    const p = parse(ahzmPage({ group: 'unfiled_no_fine', rows: [{ file: '000000018', name: 'דוגמה', year: '2025', due: '31.02.2026' }] }));
    const r = p.rows[0];
    equal(r.legalDue, undefined); equal(r.legalDueRaw, '31.02.2026'); assert(r.problems.length === 1, JSON.stringify(r.problems));
  }),
  test('מועד חסר — לא ידוע (לא 0 ולא היום)', () => {
    const r = parse(ahzmPage({ group: 'unfiled_no_fine', rows: [{ file: '000000018', name: 'דוגמה', year: '2025' }] })).rows[0];
    equal(r.legalDue, undefined); equal(r.legalDueRaw, undefined); deepEqual(r.problems, []);
  }),
  test('קובץ לא קשור / בלי טקסט / רשת לא קבועה', () => {
    equal(parse([[[0, 'חשבונית מס 1234']], [[0, 'סה"כ 100']]]).status, 'unrelated');
    equal(parseGrid(itemsToGrid([])).status, 'unreadable');
    const irregular = itemsFromLines(idomPage({ year: 2025, rows: ANNUAL_SAMPLE_ROWS })).map((it, k) => ({ ...it, width: it.width * (k % 2 ? 1.6 : 0.7) }));
    equal(parseGrid(itemsToGrid(irregular)).status, 'unreadable');
  }),
  test('מסך AHZM שאינו רשימת דרישות (ריכוז PF2) — לא נקלט', () => {
    equal(parse([[[55, 'שע\'מ / AHZM / הצהרת הון']], [[0, '16/10/26']], [[3, 'ריכוז כל התיקים לפי פקיד שומה']]]).status, 'unsupported');
  }),
  test('כמה עמודים וכמה קבצים: כיסוי, עמוד חסר, עמוד כפול זהה, עמוד סותר, קבוצות מאוחדות', () => {
    const p = (page: number, rows: { file: string; due: string }[]) => ahzmPage({ group: 'unfiled_no_fine', page, total: 3, rows: rows.map(r => ({ ...r, name: 'דוגמה', year: '2025' })) });
    const fine = ahzmPage({ group: 'unfiled_fine', rows: [{ file: '000000091', name: 'דוגמה', year: '2025', due: '30.11.2026' }] });
    const { batch, coverage } = buildBatch([
      file('f1', [p(1, [{ file: '000000018', due: '30.11.2026' }]), p(2, [{ file: '000000026', due: '30.11.2026' }])]),
      file('f2', [p(2, [{ file: '000000026', due: '30.11.2026' }])]),               // אותו עמוד, זהה
      file('f3', [fine]),
    ]);
    const c = coverage.find(x => x.list === 'wealth:unfiled_no_fine')!;
    deepEqual([c.pagesSeen, c.pageTotal, c.missing, c.duplicates], [[1, 2], 3, [3], [2]]);
    assert(/חסרים 3/.test(coverageText(c)), coverageText(c));
    equal(batch.rows.length, 3, 'שתי הקבוצות הפתוחות מאוחדות, בלי השורה מהעמוד הכפול');
    deepEqual(uncheckedWealthGroups(coverage, 'routine'), []);
    deepEqual(uncheckedWealthGroups(coverage, 'intake'), ['filed_fine', 'filed_no_fine']);
    const conflict = buildBatch([file('a', [p(1, [{ file: '000000018', due: '30.11.2026' }])]), file('b', [p(1, [{ file: '000000018', due: '31.12.2026' }])])]);
    equal(conflict.batch.rows.length, 0, 'עמוד שהועלה פעמיים בתוכן שונה — לא נקלט');
    deepEqual(conflict.coverage[0].conflicts, [1]);
  }),
  test('קבוצה שנייה חסרה — «לא נבדקה»; הודעת ריק מפורשת אינה כשל', () => {
    const { coverage, batch } = buildBatch([
      file('a', [ahzmPage({ group: 'unfiled_no_fine', rows: [{ file: '000000018', name: 'דוגמה', year: '2025', due: '30.11.2026' }] })]),
    ]);
    deepEqual(uncheckedWealthGroups(coverage, 'routine'), ['unfiled_fine']);
    const withEmpty = buildBatch([file('a', [ahzmPage({ group: 'unfiled_no_fine', rows: [{ file: '000000018', name: 'דוגמה', year: '2025', due: '30.11.2026' }] })]),
      file('e', [ahzmPage({ group: 'unfiled_fine', rows: [], empty: true })])]);
    deepEqual(uncheckedWealthGroups(withEmpty.coverage, 'routine'), []);
    equal(withEmpty.batch.sources.find(s => s.key === 'e')!.status, 'empty_confirmed');
    equal(coverageText(withEmpty.coverage.find(c => c.list === 'wealth:unfiled_fine')!), 'נבדקה וריקה');
    equal(batch.rows.length, 1);
    const v = fileVerdict(file('e', [ahzmPage({ group: 'unfiled_fine', rows: [], empty: true })]));
    assert(v.usable && v.tone === 'ok', JSON.stringify(v));
  }),
  test('אותו תיק בשני קבצים באותה העלאה — שורת הקובץ שהופק מאוחר יותר ראשונה', () => {
    const older = idomPage({ year: 2025, produced: '15/10/2026', rows: [{ file: '000000018', name: 'דוגמה', required: true, due: '31/10/2026' }] });
    const newer = idomPage({ year: 2025, produced: '20/10/2026', rows: [{ file: '000000018', name: 'דוגמה', required: true, due: '31/10/2026', filed: '18/10/2026' }] });
    const { batch } = buildBatch([file('old', [older]), file('new', [newer])]);
    deepEqual(batch.rows.map(r => [r.sourceKey, r.filedOn]), [['new', '2026-10-18'], ['old', undefined]]);
  }),
  test('קובץ פגום — הודעה, לא נקלט', () => {
    const v = fileVerdict({ key: 'x', fileName: 'x.pdf', size: 10, pages: [], error: 'הקובץ פגום' });
    assert(!v.usable && v.tone === 'bad', JSON.stringify(v));
    equal(buildBatch([{ key: 'x', fileName: 'x.pdf', size: 10, pages: [], error: 'הקובץ פגום' }]).batch.sources.length, 0);
  }),
];

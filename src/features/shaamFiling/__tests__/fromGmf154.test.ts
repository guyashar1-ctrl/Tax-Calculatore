// שאילתה 154 → אצווה ל«מרשימות שע״ם» (250). ‼ נתוני דמה — אותו מבנה שהעובד מחזיר (worker/src/gmf154.mjs).
import { deepEqual, equal, assert, test, type TestCase } from '../../../testkit/tinyTest';
import { batchFromGmf154, filingSummaryText, gmf154Filing, openReturnYears, GMF154_SOURCE_NAME, isGmf154Source, type Gmf154Filing, type Gmf154Year } from '../fromGmf154';
import { listName, sourceText } from '../model';

const year = (y: number, required: Gmf154Year['required'], over: Partial<Gmf154Year> = {}): Gmf154Year => ({
  year: y, page: 1, required, requiredRaw: '', filedOn: null, filedRaw: null,
  legalDue: required === 'no_year' ? null : `${y + 1}-04-30`, legalDueRaw: required === 'no_year' ? null : `30/04/${y + 1}`,
  extension: null, extensionRaw: null, extensionSource: null, section: '00', sectionText: 'שומה עצמית', ...over,
});

const filing = (over: Partial<Gmf154Filing> = {}): Gmf154Filing => ({
  years: [
    year(2025, 'required', { filedOn: '2026-06-07', filedRaw: '07/06/2026' }),
    year(2024, 'required'),
    year(2023, 'required', { extension: '2024-08-31', extensionRaw: '31/08/2024', extensionSource: 'הכנה' }),
    year(2022, 'not_required', { filedOn: '2025-11-08', filedRaw: '08/11/2025' }),
    year(2021, 'no_year'),
  ],
  wealth: [{ year: 2025, text: 'דרישה עד 31/12/2026', due: '2026-12-31', passed: false }],
  pagesRead: 2, complete: true, name: 'ישראלי ישראל ו/או ישראלה', ...over,
});

const opts = { fileNumber: '34605212', runId: 'run-1', producedOn: '2026-10-21' };

export const TESTS: TestCase[] = [
  test('נקלטות רק שנים «חייב בהגשה» בלי הגשה — עם הארכה כמועד, והמספר בתשע ספרות', () => {
    const b = batchFromGmf154(filing(), opts)!;
    const annual = b.rows.filter(r => r.sourceKey === 'gmf154:annual');
    deepEqual(annual.map(r => r.yearShown), ['2024', '2023']);
    equal(annual[0].fileNumber, '034605212');
    equal(annual[0].required, true);
    equal(annual[0].legalDue, '2025-04-30');
    equal(annual[1].legalDue, '2024-08-31');
    equal(annual[1].legalDueRaw, '31/08/2024 (ארכה · הכנה)');
  }),
  test('שנה שכבר יש לה שורה נכנסת גם כשהוגשה — כדי שתתעדכן «הוגש לפי שע״ם»', () => {
    const b = batchFromGmf154(filing(), { ...opts, knownAnnualYears: new Set(['2025', '2022']) })!;
    const r2025 = b.rows.find(r => r.yearShown === '2025' && r.sourceKey === 'gmf154:annual')!;
    equal(r2025.filedOn, '2026-06-07');
    const r2022 = b.rows.find(r => r.yearShown === '2022')!;
    equal(r2022.required, false, '«לא חייב» ⇒ השרת שומר כהקשר');
  }),
  test('הצהרת הון: נכנסת עם מועד; שנה שנקלטה מרשימת AHZM — לא נדרסת', () => {
    const b = batchFromGmf154(filing(), opts)!;
    const w = b.rows.filter(r => r.sourceKey === 'gmf154:wealth');
    equal(w.length, 1);
    equal(w[0].yearShown, '2025');
    equal(w[0].legalDue, '2026-12-31');
    const kept = batchFromGmf154(filing(), { ...opts, listWealthYears: new Set(['2025']) })!;
    equal(kept.rows.filter(r => r.sourceKey === 'gmf154:wealth').length, 0);
    equal(kept.sources.some(s => s.kind === 'wealth'), false);
  }),
  test('מקור בלי קובץ: manual, שם קבוע, sha לפי הריצה (קליטה חוזרת של אותה ריצה — אותו מקור)', () => {
    const b = batchFromGmf154(filing(), opts)!;
    const s = b.sources.find(x => x.kind === 'annual')!;
    equal(s.method, 'manual');
    equal(s.fileName, GMF154_SOURCE_NAME);
    equal(s.sha256, 'gmf154:run-1:annual');
    equal(s.status, 'ok');
    equal(batchFromGmf154(filing({ complete: false }), opts)!.sources[0].status, 'partial');
    assert(isGmf154Source({ method: 'manual', fileName: GMF154_SOURCE_NAME }), 'manual + השם');
    assert(!isGmf154Source({ method: 'pdf', fileName: GMF154_SOURCE_NAME }), 'קובץ אינו 154');
  }),
  test('אין מה לקלוט ⇒ אין אצווה (ולא נוצר מקור ריק)', () => {
    equal(batchFromGmf154(filing({ years: [year(2025, 'required', { filedOn: '2026-06-07' })], wealth: [] }), opts), null);
    equal(batchFromGmf154(filing(), { ...opts, fileNumber: '' }), null);
  }),
  test('השורה בכרטיס: מה פתוח, או שהכול הוגש — ו«נבדק מ-» כשלא קראנו עד הסוף', () => {
    equal(filingSummaryText(filing()), '', 'יש שנה פתוחה — השורות אומרות את זה');
    const done = filing({ years: [year(2025, 'required', { filedOn: '2026-06-07' }), year(2024, 'not_required')] });
    equal(filingSummaryText(done), 'כל הדוחות הנדרשים הוגשו');
    equal(filingSummaryText({ ...done, complete: false }), 'כל הדוחות הנדרשים הוגשו מ-2024');
    deepEqual(openReturnYears(filing()).map(y => y.year), [2024, 2023]);
  }),
  test('תוצאת משימה ישנה (134 בלבד) ⇒ אין שנים', () => {
    equal(gmf154Filing({ fields: { taxOffice: 'x' } }), null);
    equal(gmf154Filing(null), null);
    assert(gmf154Filing({ filing: filing() }) !== null, 'תוצאה חדשה');
  }),
  test('המקור בשורה: «מידע אודות שנות מס (154)», «נקרא» ובלי עמוד/שורה של קובץ', () => {
    const o = { kind: 'annual' as const, sourceName: GMF154_SOURCE_NAME, producedOn: '2026-10-21', evidence: { page: 1, line: 2 }, lastSeenAt: '2026-10-21T10:00:00Z' };
    equal(listName(o), 'מידע אודות שנות מס (154)');
    equal(sourceText(o), 'מקור: שע״ם · מידע אודות שנות מס (154) · נקרא 21.10.2026');
    equal(listName({ kind: 'annual' }), 'מעקב הגשת דוחות (IDOM)');
  }),
];

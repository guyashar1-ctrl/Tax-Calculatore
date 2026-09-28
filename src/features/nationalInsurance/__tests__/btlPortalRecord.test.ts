// ─── בדיקות: «מה ביטוח לאומי רושם» מול הכרטיס (207) ─────────────────────────
// ‼ נתונים סינתטיים. הצורה = מה ש-get_btl_portal_record מחזיר.

import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildBtlRecordView, familyStatusAgrees, type BtlPortalFact, type BtlPortalPerson } from '../btlPortalRecord';

const T0 = '2026-09-20T08:00:00Z';
const T1 = '2026-09-25T08:00:00Z';
const fact = (value: Record<string, unknown>, extra: Partial<BtlPortalFact> = {}): BtlPortalFact =>
  ({ value, since: T0, lastSeen: T1, screen: 'summary', history: [], ...extra });

const client = (over: Partial<Client> = {}) => ({ id: 'c', firstName: 'א', lastName: 'ב', familyStatus: 'single', ...over }) as unknown as Client;

const person = (over: Partial<BtlPortalPerson['facts']> = {}, documents: BtlPortalPerson['documents'] = []): BtlPortalPerson => ({
  facts: {
    familyStatus: fact({ raw: 'רווק', code: 'single' }),
    paymentObligation: fact({ raw: 'עצמאי' }),
    coverage: fact({ raw: 'זו"ש מ- 06/25', sinceMonth: '2025-06' }),
    residency: fact({ raw: 'כן' }),
    enforcement: fact({ raw: null }),
    representation: fact({ receivedDate: '2026-08-04' }, { screen: 'search' }),
    debitMethod: fact({ raw: 'חשבון בנק' }, { screen: 'search' }),
    ...over,
  },
  documents,
});

export const TESTS: TestCase[] = [
  test('ערכי הפורטל תואמים לכרטיס ⇒ אין «לבדיקה»; «ריק = אין» לא מוצג', () => {
    const v = buildBtlRecordView(person(), { client: client(), role: 'client' });
    equal(v.empty, false);
    deepEqual(v.conflicts, []);
    deepEqual(v.recorded.map(l => l.label), ['מצב משפחתי', 'חובת תשלום', 'כיסוי ביטוחי', 'תושבות', 'ייצוג', 'אמצעי חיוב']);
    equal(v.recorded.find(l => l.key === 'representation')!.value, 'ברשימת המיוצגים מ-04/08/2026');
    equal(v.lastReadAt, T1, 'מועד הקריאה = הקריאה האחרונה שאישרה ערך');
    deepEqual(v.declared[0], { label: 'מצב משפחתי', value: 'רווק/ה', source: 'כרטיס הלקוח' });
  }),

  test('מצב משפחתי סותר ⇒ «לבדיקה» עם שני הערכים, והכרטיס לא משתנה', () => {
    const c = client({ familyStatus: 'married' });
    const v = buildBtlRecordView(person(), { client: c, role: 'client' });
    deepEqual(v.conflicts, [{ key: 'familyStatus', text: 'מצב משפחתי: בב"ל רווק/ה, בכרטיס נשוי/אה' }]);
    equal(c.familyStatus, 'married');
  }),

  test('«הורה יחיד» בכרטיס מתיישב עם רווק/גרוש/אלמן; נוסח שלא זוהה ⇒ «לא ניתן להשוות», לא סתירה', () => {
    equal(familyStatusAgrees('singleParent', 'divorced'), true);
    equal(familyStatusAgrees('singleParent', 'married'), false);
    equal(familyStatusAgrees('married', null), null);
    const v = buildBtlRecordView(person({ familyStatus: fact({ raw: 'מעמד מיוחד' }) }), { client: client(), role: 'client' });
    equal(v.conflicts.length, 1);
    assert(v.conflicts[0].text.includes('לא ניתן להשוות'), v.conflicts[0].text);
  }),

  test('חובת תשלום שהשתנתה ⇒ הערך הנוכחי «מאז», והקודם «עד»', () => {
    const v = buildBtlRecordView(person({
      paymentObligation: fact({ raw: 'עובד (+)' }, { since: T1, history: [{ value: { raw: 'עצמאי' }, since: '2026-01-01T00:00:00Z', until: T0 }] }),
    }), { client: client(), role: 'client' });
    const l = v.recorded.find(x => x.key === 'paymentObligation')!;
    equal(l.value, 'עובד (+)');
    deepEqual(l.previous, { value: 'עצמאי', until: T0 });
    equal(v.recorded.find(x => x.key === 'familyStatus')!.previous, undefined, 'ערך שלא השתנה — בלי «קודם»');
  }),

  test('ייצוג: פעיל בכרטיס אבל «ממתין לאישור» בב"ל ⇒ לבדיקה', () => {
    const v = buildBtlRecordView(person({ representation: fact({ receivedDate: '2026-08-04', status: 'ממתין לאישור', pendingAction: 'ממתין תוקף' }) }),
      { client: client(), role: 'client', pivoRepresentation: { text: 'מיוצג', active: true } });
    assert(v.conflicts.some(c => c.key === 'representation' && c.text.includes('ממתין לאישור')), JSON.stringify(v.conflicts));
    equal(v.recorded.find(l => l.key === 'representation')!.value, 'ברשימת המיוצגים מ-04/08/2026 · סטטוס: ממתין לאישור · ממתין תוקף');
    const reverse = buildBtlRecordView(person(), { client: client(), role: 'client', pivoRepresentation: { text: 'אין ייצוג', active: false } });
    deepEqual(reverse.conflicts, [{ key: 'representation', text: 'ייצוג: בב"ל ברשימת המיוצגים, בכרטיס «אין ייצוג»' }]);
    const bothPending = buildBtlRecordView(person({ representation: fact({ status: 'ממתין לאישור' }) }),
      { client: client(), role: 'client', pivoRepresentation: { text: 'בתהליך', active: false } });
    deepEqual(bothPending.conflicts, [], 'ממתין בשני הצדדים — עקבי');
  }),

  test('מילואים שב"ל מציג למייצג ⇒ סכומים לפי שנה, והפעולה — רק באזור האישי', () => {
    const v = buildBtlRecordView(person({ reserveDuty: fact({ rows: [{ year: 2025, gross: 18450, taxWithheld: 2210 }], otherBenefitsCount: 1 }, { screen: 'benefits' }) }),
      { client: client(), role: 'client' });
    deepEqual(v.reserveDuty!.rows, [{ year: 2025, gross: 18450, taxWithheld: 2210 }]);
    assert(v.reserveDuty!.nextAction.includes('באזור האישי של המבוטח'), 'הפעולה שייכת לאזור האישי');
    assert(v.reserveDuty!.nextAction.includes('בפורטל המייצגים אין פעולה כזו'), 'לא טוענים שהמייצג יכול');
    equal(buildBtlRecordView(person(), { client: client(), role: 'client' }).reserveDuty, undefined, 'בלי שורות — בלי מקטע');
  }),

  test('מסמכים: מסמך שלא הופיע בקריאה האחרונה מסומן, לא נמחק; הודעות אחרות — רק ספירה', () => {
    const v = buildBtlRecordView(person({
      documentsRead: fact({ count: 1 }, { lastSeen: T1, screen: 'documents' }),
      notices: fact({ items: [{ date: '2026-09-10', type: 'הודעת יפוי כח למייצג(מ)', category: 'representation', state: 'הודעה נש(מ)' }], otherCount: 4 }, { screen: 'notices' }),
    }, [
      { id: 'd1', description: 'דין וחשבון', docDate: '2026-09-15', pages: 3, firstSeenAt: T0, lastSeenAt: T1 },
      { id: 'd2', description: 'יפויי כוח', docDate: '2026-08-04', pages: 2, firstSeenAt: T0, lastSeenAt: T0 },
    ]), { client: client(), role: 'client' });
    deepEqual(v.documents.map(d => [d.description, d.notInLastRead]), [['דין וחשבון', false], ['יפויי כוח', true]]);
    equal(v.notices.length, 1);
    equal(v.noticesOther, 4);
  }),

  test('דמי ביטוח שנתיים ⇒ שורה לשנה (סיווג, חיוב, בסיס, סה"כ, לפי שומה)', () => {
    const v = buildBtlRecordView(person({ annualContributions: fact({ years: [
      { year: 2025, byAssessment: false, total: 12400, classes: [{ classification: 'עצמאי', charge: 'חלקי', annualBase: 120000, annualContribution: 12000 }] },
    ] }, { screen: 'contributions' }) }), { client: client(), role: 'client' });
    deepEqual(v.contributions, [{ year: 2025, text: 'עצמאי חלקי בסיס 120,000 ₪ · סה"כ 12,400 ₪ · טרם שומה סופית' }]);
  }),

  test('בן/בת זוג: מצב משפחתי מושווה לתא המשפחתי ומסומן כך', () => {
    const v = buildBtlRecordView(person(), { client: client({ familyStatus: 'married' }), role: 'spouse' });
    assert(v.conflicts[0].text.endsWith('(של התא המשפחתי)'), v.conflicts[0].text);
  }),

  test('כשל קריאה / אין קריאה ⇒ תצוגה ריקה (לא «אין»)', () => {
    equal(buildBtlRecordView(undefined, { client: client(), role: 'client' }).empty, true);
    equal(buildBtlRecordView({ facts: {}, documents: [] }, { client: client(), role: 'client' }).empty, true);
  }),
];

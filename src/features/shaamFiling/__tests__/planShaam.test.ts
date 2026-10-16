// תוכנית הקליטה (עותק ההדגמה של _shaam_plan) + ניסוח ומעבר לבקשה. אותם תרחישים כמו scripts/sql/250/test-250.pglite.mjs.
import { assert, deepEqual, equal, test, type TestCase } from '../../../testkit/tinyTest';
import { file9, matchClient, nameWords, plan, valuesOf, type PlanClient, type PlanExisting } from '../planShaam';
import { copyState, needsRequest, obligationDueText, obligationTitle, planCounts, sourceText, stateLine, toWorkRow, type Obligation } from '../model';
import type { Batch, BatchRow } from '../parse/batch';

const CLIENTS: PlanClient[] = [
  { id: 'c1', first_name: 'דוגמה', last_name: 'ראשון', id_number: '000000018' },
  { id: 'c2', first_name: 'אבי', last_name: 'שלישי', id_number: '111111118', spouse_id_number: '000000034', spouse_first_name: 'גלית', spouse_last_name: 'שלישי' },
  { id: 'c3', first_name: 'רונית', last_name: 'שביעי', id_number: '222222226', tax_files: [{ authority: 'income_tax', fileNumber: '0000075', owner: 'joint' }] },
  { id: 'c6', first_name: 'משה', last_name: 'אחר', id_number: '777777770' },
  { id: 'c7', first_name: 'כפול', last_name: 'ראשון', id_number: '777777770' },
];
const row = (fileNumber: string, o: Partial<BatchRow> = {}): BatchRow => ({ sourceKey: 's', line: 1, fileNumber, name: '', yearShown: '2025', problems: [], ...o });
const batch = (rows: BatchRow[], o: Partial<Batch['sources'][0]> = {}): Batch => ({ sources: [{ key: 's', fileName: 's.pdf', kind: 'annual', taxYear: 2025, producedOn: '2026-10-15', status: 'ok', pages: [], ...o }], rows });

export const TESTS: TestCase[] = [
  test('מספר תיק → 9 ספרות; קצר מרופד; לא ספרות — אין', () => {
    equal(file9('34605212'), '034605212'); equal(file9('034605212'), '034605212'); equal(file9('12ab'), null); equal(file9('1234'), null);
    equal(file9('ALR990968905'), null, 'אותיות לפני המספר — לא «מנוקות»');
    deepEqual(nameWords('סלע הדסה ו/או יאיר'), ['סלע', 'הדסה', 'יאיר']);
  }),
  test('שיוך רק לפי מזהה: תיק מ״ה › ת.ז. › ת.ז. בן/בת זוג; כפול ⇒ עמום; שם לא תואם ⇒ לבדיקה', () => {
    equal(matchClient(CLIENTS, '000000075', 'שביעי רונית').clientId, 'c3');
    deepEqual([matchClient(CLIENTS, '000000018', 'ראשון דוגמה').tier, matchClient(CLIENTS, '000000018', 'ראשון דוגמה').role], ['id', 'client']);
    const sp = matchClient(CLIENTS, '000000034', 'שלישי גלית');
    deepEqual([sp.clientId, sp.role, sp.tier], ['c2', 'spouse', 'spouse_id']);
    equal(matchClient(CLIENTS, '777777770', 'אחר משה').match, 'ambiguous');
    equal(matchClient(CLIENTS, '000000018', 'כהן לגמרי').match, 'name_mismatch');
    equal(matchClient(CLIENTS, '999999998', 'ראשון').match, 'unmatched');
  }),
  test('«ח» בלבד יוצר חובה; תאריך הגשה ⇒ הוגש (היסטוריה בפעם הראשונה); ש״מ לא קיימת ⇒ הקשר', () => {
    const p = plan(batch([
      row('000000018', { name: 'ראשון', required: true, legalDue: '2026-10-31', legalDueRaw: '31/10/2026' }),
      row('000000018', { name: 'ראשון', required: true }),
      row('000000075', { name: 'שביעי', required: true, filedOn: '2026-06-07', filedOnRaw: '07/06/2026' }),
      row('000000034', { name: 'שלישי', required: false, legalDue: '2026-04-30' }),
      row('111111118', { name: 'שלישי', noAssessment: true, required: false }),
      row('12ab', { name: 'פגום', required: true }),
    ]), CLIENTS, []);
    deepEqual(p.map(x => [x.change, x.state]), [['new', 'open'], ['duplicate', undefined], ['new', 'history'], ['new', 'context'], ['new', 'context'], ['invalid', undefined]]);
    const c = planCounts(p);
    deepEqual([c.new, c.open, c.filed, c.context, c.duplicate, c.invalid], [4, 1, 1, 2, 1, 1]);
  }),
  test('שורה עם בעיית קריאה — לבדיקה, בלי לקוח, גם כשהמספר תואם', () => {
    const p = plan(batch([row('000000018', { name: 'ראשון', required: true, problems: ['מועד לא תקין: 31/02/2026'] })]), CLIENTS, [])[0];
    deepEqual([p.state, p.reason, p.clientId], ['needs_review', 'parse', undefined]);
  }),
  test('ייבוא חוזר: זהה ⇒ ללא שינוי; ישן ⇒ לא דורס; חדש עם ארכה ⇒ עודכן; הוגש אחרי פתוח ⇒ «הוגש לפי שע״ם»; פתוח אחרי הוגש ⇒ לבדיקה', () => {
    const r = row('000000018', { name: 'ראשון', required: true, legalDue: '2026-10-31', legalDueRaw: '31/10/2026' });
    const ex: PlanExisting = { id: 'o1', kind: 'annual', fileNumber: '000000018', yearShown: '2025', clientId: 'c1', role: 'client', matchKind: 'id', producedOn: '2026-10-15', state: 'open', shaamStatus: 'open', values: valuesOf(r) };
    equal(plan(batch([r]), CLIENTS, [ex])[0].change, 'unchanged');
    equal(plan(batch([{ ...r, legalDueRaw: '30/06/2026' }], { producedOn: '2026-09-01' }), CLIENTS, [ex])[0].change, 'older');
    const up = plan(batch([{ ...r, legalDueRaw: '31/01/2027', legalDue: '2027-01-31' }], { producedOn: '2026-10-20' }), CLIENTS, [ex])[0];
    deepEqual([up.change, up.state], ['updated', 'open']);
    const filed = plan(batch([{ ...r, filedOn: '2026-11-02', filedOnRaw: '02/11/2026' }], { producedOn: '2026-11-05' }), CLIENTS, [ex])[0];
    equal(filed.state, 'filed_per_shaam');
    const back = plan(batch([r], { producedOn: '2026-11-10' }), CLIENTS, [{ ...ex, shaamStatus: 'filed', state: 'filed_per_shaam' }])[0];
    deepEqual([back.state, back.reason], ['needs_review', 'contradiction']);
  }),
  test('הצהרות הון: «לא הגישו» ⇒ פתוחה; «הגישו» ⇒ היסטוריה; שיוך ידני נשמר בייבוא חוזר', () => {
    const w = (group: 'unfiled_no_fine' | 'filed_fine', o: Partial<BatchRow> = {}) => batch([row('000000018', { name: 'ראשון', legalDue: '2026-11-30', ...o })], { kind: 'wealth', group, taxYear: undefined });
    equal(plan(w('unfiled_no_fine'), CLIENTS, [])[0].state, 'open');
    equal(plan(w('filed_fine', { yearShown: '2023' }), CLIENTS, [])[0].state, 'history');
    const manual: PlanExisting = { id: 'o2', kind: 'wealth', fileNumber: '777777770', yearShown: '2025', clientId: 'c7', role: 'client', matchKind: 'manual', state: 'open', shaamStatus: 'open', values: '' };
    const again = plan(batch([row('777777770', { name: 'אחר' })], { kind: 'wealth', group: 'unfiled_no_fine' }), CLIENTS, [manual])[0];
    deepEqual([again.clientId, again.match], ['c7', 'matched']);
  }),
  test('ניסוח בתיק: «דוח שנתי — שנת מס 2025 — נדרש להגיש עד 31.10.2026», הצהרת הון «כפי שמופיעה», מועד לא ידוע', () => {
    equal(obligationTitle({ kind: 'annual', yearShown: '2025' }), 'דוח שנתי — שנת מס 2025');
    equal(obligationTitle({ kind: 'wealth', yearShown: '2025' }), 'הצהרת הון — שנה כפי שמופיעה בשע״ם: 2025');
    equal(obligationDueText({ state: 'open', shaamStatus: 'open', legalDue: '2026-10-31' }), 'נדרש להגיש עד 31.10.2026');
    equal(obligationDueText({ state: 'open', shaamStatus: 'open' }), 'נדרש להגיש · מועד לא ידוע');
    equal(obligationDueText({ state: 'history', shaamStatus: 'filed' }), 'הוגש לפי שע״ם (תאריך ההגשה לא מופיע ברשימה)');
    assert(/אינו הוכחת פטור/.test(obligationDueText({ state: 'context', shaamStatus: 'context', noAssessment: true })), 'ש״מ לא קיימת');
    equal(sourceText({ kind: 'annual', producedOn: '2026-10-15', evidence: { page: 1, line: 3 } }), 'מקור: שע״ם · מעקב הגשת דוחות (IDOM) · הופקה 15.10.2026 · עמוד 1 · שורה 3');
  }),
  test('«פתח בקשה»: דוח שנתי לפי שנת המס; הצהרת הון רק עם יום הצהרה שנבחר; מקור ומועד «נמסר»', () => {
    const o: Obligation = { id: 'o1', kind: 'annual', fileNumber: '000000018', yearShown: '2025', shaamStatus: 'open', state: 'open', clientId: 'c1', legalDue: '2026-10-31', producedOn: '2026-10-15' };
    const r = toWorkRow(o)!;
    deepEqual([r.kind, r.taxYear, r.due, r.source, r.lastAuthorityCheck], ['annual', 2025, '2026-10-31', 'portal', '2026-10-15']);
    assert(/רשימת שע״ם/.test(r.sourceNote!), r.sourceNote!);
    const w: Obligation = { ...o, kind: 'wealth', name: 'דוגמה ו/או בן', fine: true };
    equal(toWorkRow(w), null, 'בלי יום הצהרה — אין בקשה');
    const wr = toWorkRow(w, '2025-12-31')!;
    deepEqual([wr.asOfDate, wr.addressee], ['2025-12-31', 'both']);
    assert(/חייב בקנס/.test(wr.sourceNote!), 'סימון הקנס נשמר במקור');
    equal(toWorkRow({ ...o, clientId: undefined }), null);
  }),
  test('מצב בשורה ועותק', () => {
    equal(stateLine({ state: 'open' }), 'חייב · טרם נפתח');
    equal(stateLine({ state: 'open', stepId: 's', stepStatus: 'in_progress' }), 'חייב · נפתחה בקשה');
    const base: Obligation = { id: 'o', kind: 'wealth', fileNumber: '000000018', yearShown: '2023', shaamStatus: 'filed', state: 'history', clientId: 'c1' };
    equal(copyState(base), 'missing');
    equal(copyState({ ...base, copyStepId: 's', copyStepStatus: 'pending' }), 'requested');
    equal(copyState({ ...base, copyInOffice: true }), 'in_office');
    equal(copyState({ ...base, state: 'open' }), null);
    assert(needsRequest({ ...base, state: 'open' }) && !needsRequest({ ...base, state: 'open', stepId: 's', stepStatus: 'pending' }), 'needsRequest');
  }),
];

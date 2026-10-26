// ─── הדוח השנתי במשרד — «חומרים» ליד «הדוח» (25.10.2026; docs/proposals/2026-10-25-annual-office-return.html) ─────────
// ‼ מה נעול כאן:
//   · חומר: חסר ⇒ «ממתין»; הגיע עם תבנית ⇒ «הזנה»; הוזן ⇒ ✓; הגיע בלי מספרים ⇒ מספיק שהגיע; מסמך של המשרד ⇒ «אצלך».
//   · התשובות נכנסות לבד: כל תשובת לקוח ממתינה לבקשה — לאישור; מה שמעדכן את הכרטיס — עדכון ואז אישור; לא נוגעים בבקשה אחרת.
//   · הטופס עצמו: הערך מהמנוע נכתב בשדה של הקוד והטור הנכונים ב-1301.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { Evidence, InfoAsk, YearFact } from '../../taxYear/types';
import type { ItemStatus } from '../../taxYear/picture';
import { ITEM_BY_KEY } from '../../taxYear/catalog';
import { autoAcceptPlan, balanceText, filledPct, isReady, materialsOf, type Material } from '../workspace';
import { valuesOnPage } from '../formPages';
import { markersOf } from '../../taxKnowledge/formMap/model';
import type { ReturnOutputs } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'דוד', lastName: 'כהן', familyStatus: 'married', spouseFirstName: 'רחל', gender: 'male', children: [],
  employers: [{ id: 'e1', name: 'הייטק בע״מ' }, { id: 'e2', name: 'משרד החינוך', belongsToSpouse: true }], businesses: [], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {},
  spouse: { firstName: 'רחל' }, ...p,
} as unknown as Client);
const fileAsk = (id: string, docKind: string, role = 'client', p: Partial<InfoAsk> = {}): InfoAsk => ({
  id, clientId: 'c1', taxYear: 2025, stepId: 'info', parentStepId: 'req', itemKey: 'salary.form106', subjectRole: role, entityRef: undefined,
  prompt: { templateVersion: 1, title: 'טופס 106', input: { kind: 'file', docKind } }, state: 'answered', createdAt: '2026-10-25', ...p,
} as unknown as InfoAsk);
const ev = (id: string, askId: string | undefined, docKind: string, p: Partial<Evidence> = {}): Evidence => ({
  id, clientId: 'c1', taxYear: 2025, docKind, subjectRole: 'client', receivedAt: '2026-10-25T10:00:00Z', receivedVia: 'portal', extraction: 'not_supported',
  identityMatch: 'unchecked', periodMatch: 'unchecked', review: 'needs_review', askId, documentId: `d-${id}`, ...p,
} as unknown as Evidence);
const fact = (p: Partial<YearFact>): YearFact => ({ id: 'f', clientId: 'c1', taxYear: 2025, itemKey: '', subjectRole: 'client', periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
  answer: 'value', value: true, basis: 'actual', source: 'portal', status: 'pending', requestId: 'req', createdAt: '2026-10-25T10:00:00Z', ...p } as YearFact);
const mats = (asks: InfoAsk[], evidence: Evidence[], facts: YearFact[] = [], statuses: ItemStatus[] = [], c = client()) =>
  materialsOf({ client: c, year: 2025, stepId: 'req', asks, evidence, facts, statuses });
const st = (m: Material[]) => m.map(x => `${x.title}:${x.state}`).join(' | ');

export const TESTS: TestCase[] = [
  test('חומר: חסר ⇒ ממתין · 106 שהגיע ⇒ «הזנה» עם שם המעסיק · הוזן ⇒ ✓', () => {
    const a = fileAsk('a1', 'form106');
    equal(mats([a], [])[0].state, 'wait');
    const e = ev('v1', 'a1', 'form106', { entityRef: 'e1' });
    const m1 = mats([a], [e]);
    equal(st(m1), 'טופס 106 — אישור שנתי מהמעסיק · הייטק בע״מ:here'.replace('טופס 106 — אישור שנתי מהמעסיק', m1[0].title.split(' · ')[0]));
    assert(m1[0].enterable && m1[0].title.endsWith('הייטק בע״מ'), st(m1));
    const entered = fact({ id: 'x', evidenceId: 'v1', status: 'accepted', source: 'document', lineKey: '106.gross' } as Partial<YearFact>);
    equal(mats([a], [e], [entered])[0].state, 'done');
  }),
  test('מסמך בלי מספרים (אישור זכאות) ⇒ מספיק שהגיע; «אשלח אחר כך» ⇒ ממתין עם הסיבה; ראיה שנדחתה — לא נספרת', () => {
    const a = fileAsk('a2', 'degreeCert');
    const m = mats([a], [ev('v2', 'a2', 'degreeCert')]);
    equal(m[0].state, 'got');
    assert(!m[0].enterable, 'תעודה סומנה להזנה');
    const later = mats([fileAsk('a3', 'form106', 'client', { state: 'unavailable', unavailable: { reason: 'עוד לא קיבלתי', followUpOn: '2026-11-01', recordedAt: '' } } as Partial<InfoAsk>)], []);
    equal(`${later[0].state}:${later[0].sub}`, 'wait:עוד לא קיבלתי');
    equal(mats([a], [ev('v3', 'a2', 'degreeCert', { review: 'rejected' })])[0].state, 'wait');
  }),
  test('מסמך שהמשרד מוציא או מכין (רו״ה) ⇒ «אצלך», עם הזנה כשיש תבנית', () => {
    const it = { ...ITEM_BY_KEY['business.books'] };
    const s = { item: it, subjectRole: 'spouse', state: 'missing', entityRef: 'b1', entityLabel: 'הסטודיו' } as unknown as ItemStatus;
    const m = mats([], [], [], [s]);
    equal(m.length, 1);
    equal(`${m[0].who}:${m[0].state}:${m[0].enterable}`, 'spouse:mine:true');
  }),
  test('«עבדתי עם חשבוניות» ⇒ רווח והפסד אצל המשרד (לא אצל הלקוח); העסק לא בכרטיס ⇒ קודם לפתוח אותו, בלי «הכנה»', () => {
    const it = ITEM_BY_KEY['business.startedDocs'];
    equal(it.who, 'office');
    const s = { item: it, subjectRole: 'spouse', state: 'missing' } as unknown as ItemStatus;
    const m = mats([], [], [], [s]);
    equal(`${m[0].who}:${m[0].state}:${m[0].enterable}`, 'spouse:mine:false');
    assert(/פייפרלס/.test(m[0].sub ?? ''), m[0].sub ?? '');
  }),
  test('מוכן להדפסה רק כשאין ממתין ואין מה להקליד', () => {
    const a = fileAsk('a1', 'form106');
    assert(!isReady(mats([a], [])), 'מוכן כשחסר מסמך');
    assert(!isReady(mats([a], [ev('v1', 'a1', 'form106')])), 'מוכן לפני הזנה');
    assert(isReady(mats([a], [ev('v1', 'a1', 'form106', { extraction: 'office_entered' })])), 'לא מוכן אחרי הזנה');
    assert(!isReady([]), 'רשימה ריקה = מוכן');
  }),
  test('התשובות נכנסות לבד: כל תשובה ממתינה לבקשה — לאישור; ילד חדש — עדכון הכרטיס ואז אישור; בקשה אחרת — לא נוגעים', () => {
    const facts = [
      fact({ id: 'p1', itemKey: 'donations.given' }),
      fact({ id: 'p2', itemKey: 'household.children', subjectRole: 'couple', clientAssertion: 'changed', value: { items: [{ firstName: 'תום', birthDate: '2025-05-01' }] } } as Partial<YearFact>),
      fact({ id: 'p3', itemKey: 'donations.given', requestId: 'other' }),
      fact({ id: 'p4', itemKey: 'donations.given', status: 'accepted' }),
    ];
    const plan = autoAcceptPlan(client(), facts, 'req');
    const all = [...plan.card.map(c => c.fact.id), ...plan.accept.map(f => f.id)].sort();
    assert(all.includes('p1') && all.includes('p2'), JSON.stringify(all));
    assert(!all.includes('p3') && !all.includes('p4'), 'נגע בתשובה של בקשה אחרת או במאושרת');
    assert(plan.card.some(c => c.fact.id === 'p2') || plan.needsDecision.some(c => c.fact.id === 'p2'), 'ילד חדש לא מעדכן את הכרטיס');
  }),
  test('הטופס עצמו: 96,400 בשדה 158 של בן הזוג הרשום, בעמוד שבו הקוד מודפס', () => {
    const out = { fields: [{ code: '158', person: 'client', kind: 'amount', amount: 96400, label: 'משכורת', part: 'ג', source: { kind: 'fact' } }], formCoverage: { produced: [] } } as unknown as ReturnOutputs;
    const m = markersOf('1301').find(x => x.code === '158');
    assert(!!m, 'אין סימון לקוד 158 במפה');
    const vals = valuesOnPage('1301', m!.page, out);
    const v = vals.find(x => x.code === '158');
    equal(v?.text, (96400).toLocaleString('he-IL'));
    equal(valuesOnPage('1320', 1, out).length, 0);
  }),
  test('עמוד 1 של 1301: הפרטים מהכרטיס בתאים שלהם, X בתיבות שסומנו ובמצב המשפחתי; שדה ריק — לא נכתב', () => {
    const T = (code: string, text: string) => ({ code, kind: 'text', text, person: 'client' });
    const out = { fields: [], formCoverage: { produced: [T('F057', '123456782'), T('F061', '1990-04-12'), T('F067', 'נשוי/אה'), T('F083', '912345678'),
      T('F094', '12800'), T('F087', 'דין עיצובים'), T('F072', ''), { code: 'F001', kind: 'checkbox', checked: true, person: 'client' }] } } as unknown as ReturnOutputs;
    const v = Object.fromEntries(valuesOnPage('1301', 1, out).map(x => [x.code, x.text]));
    equal(v.F057, '123456782');
    equal(v.F061, '12.04.1990');
    equal(v.F083, '12345678', 'הספרה 9 מודפסת בתא');
    equal(`${v['F094:bank']}|${v['F094:branch']}`, '12|800');
    equal(v['F080+F087'], 'דין עיצובים');
    equal(v.F001, 'X');
    equal(v.F067, 'X');
    assert(!('F072' in v), 'שדה ריק נכתב');
  }),
  test('עמוד 1: עסק זעיר — בריבוע של האדם; עולה/תושב חוזר — בתיבה של האפשרות; פריסת דמי לידה — «כן»', () => {
    const out = { fields: [{ code: 'F010', kind: 'checkbox', checked: true, person: 'spouse' }], formCoverage: { produced: [
      { code: 'F012', kind: 'checkbox', checked: true, person: 'client' }, { code: 'F012.options', kind: 'text', text: 'new,veteran', person: 'client' },
      { code: 'F026', kind: 'checkbox', checked: true, person: 'client' }] } } as unknown as ReturnOutputs;
    const keys = valuesOnPage('1301', 1, out).map(v => v.key).sort().join(',');
    equal(keys, 'p1-F010-spouse,p1-F012-new,p1-F012-veteran,p1-F026');
  }),
  test('ההערכה: החזר / לתשלום / «חסרים נתונים» כשחסר מקור; האחוז מבדיקת הכיסוי', () => {
    const mk = (balance: number, incomplete = false) => ({ household: { balance, incomplete }, formCoverage: { counts: { relevant: 50, filled: 20 } } }) as unknown as ReturnOutputs;
    equal(balanceText(mk(-3420.4)), `החזר ${(3420).toLocaleString('he-IL')} ₪`);
    equal(balanceText(mk(1200)), `לתשלום ${(1200).toLocaleString('he-IL')} ₪`);
    equal(balanceText(mk(500, true)), null);
    equal(filledPct(mk(0)), 40);
  }),
];

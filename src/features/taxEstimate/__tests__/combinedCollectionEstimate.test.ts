// בדיקת שילוב (14.10.2026): חבילת האיסוף (241) + הערכת המס — נכס בלי תאריך.
// הקוד האמיתי של שתי החבילות: שאלת התחולה נשאלת גם בהערכה (picture), התשובה נכתבת לתיק ב«אשר ועדכן תאריכים»
// (periodDatesPatch), וההערכה (buildDraft) קוראת את התשובה ואת התאריכים מאותו חוזה (temporal.ts) — בלי מנגנון שני.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture } from '../../taxYear/picture';
import { periodDatesPatch } from '../../taxYear/recordToCard';
import type { YearFact } from '../../taxYear/types';
import { buildDraft } from '../prefill';

const TODAY = '2026-10-14';
const client = (props: Record<string, unknown>[]): Client => ({
  id: 'c1', firstName: 'נועה', lastName: 'לוי', familyStatus: 'single', children: [], employers: [], businesses: [],
  properties: props, investmentAccounts: [], pensionFunds: [], foreignAccounts: [], bankAccounts: [], fieldMeta: {}, rentalTaxTrack: 'regular',
} as unknown as Client);
const PX = { id: 'px', address: 'הורד 4', city: 'חיפה', isRented: true };
const periodFact = (value: unknown, answer: YearFact['answer'] = 'value'): YearFact => ({
  id: 'f-per', clientId: 'c1', taxYear: 2026, subjectRole: 'client', itemKey: 'period.property', entityKind: 'property', entityRef: 'px',
  periodKind: 'year', periodFrom: '2026-01-01', periodTo: '2026-12-31', answer, value, basis: 'actual', source: 'portal', status: 'accepted', createdAt: '2026-10-14T08:00:00Z',
} as YearFact);
const draftOf = (c: Client, facts: YearFact[]) => buildDraft({ client: c, taxYear: 2026, cutoffMonth: 9, facts, evidence: [], today: TODAY });

export const TESTS: TestCase[] = [
  test('שילוב: נכס בלי תאריך — בהערכה נשאלת שאלת התחולה; בלי תשובה השכירות «חסרה» (לא 0)', () => {
    const c = client([PX]);
    const pic = buildYearPicture({ client: c, taxYear: 2026, purpose: 'estimate', cutoffMonth: 9, today: TODAY, facts: [], evidence: [], asks: [] });
    const per = pic.statuses.find(s => s.item.key === 'period.property' && s.entityRef === 'px');
    assert(!!per && per.askable, 'שאלת התחולה לא נשאלת בהערכה');
    const rent = draftOf(c, []).draft.lines.find(l => l.source === 'rent');
    assert(!!rent, 'אין שורת שכירות');
    equal(rent!.actualToCutoff, undefined, 'בלי תשובה — חסר, לא 0');
    equal(rent!.period?.actual, 'unknown');
  }),
  test('שילוב: «לא» — הנכס יוצא מההערכה', () => {
    const d = draftOf(client([PX]), [periodFact({ inPeriod: 'before' })]);
    assert(!d.draft.lines.some(l => l.source === 'rent'), JSON.stringify(d.draft.lines.map(l => l.label)));
    const d2 = draftOf(client([PX]), [periodFact(null, 'no')]);
    assert(!d2.draft.lines.some(l => l.source === 'rent'), 'תשובת «לא» לא הוציאה את הנכס');
  }),
  test('שילוב: «בחלק מהשנה, מ-11.2026» + «אשר ועדכן תאריכים» — עד החתך 0 ידוע, התחזית חלה', () => {
    const value = { inPeriod: 'part', from: { date: '2026-11-01', precision: 'month' } };
    const c0 = client([PX]);
    const patch = periodDatesPatch(c0, 'property', 'px', value);
    assert(!!patch && patch.kind === 'properties' && patch.patch.purchaseDate === '2026-11-01', JSON.stringify(patch));
    const c1 = client([{ ...PX, ...patch!.patch }]);
    const rent = draftOf(c1, [periodFact(value)]).draft.lines.find(l => l.source === 'rent')!;
    equal(rent.actualToCutoff, 0, 'נרכש אחרי החתך — 0 ידוע עד החתך');
    equal(rent.period?.actual, 'out'); equal(rent.period?.forecast, 'in');
  }),
  test('שילוב: «בחלק מהשנה, מ-3.2026» — בתוך תקופת האמת: הסכום נדרש (חסר עד שמוזן), לא 0 ולא מוצא', () => {
    const value = { inPeriod: 'part', from: { date: '2026-03-01', precision: 'month' } };
    const c1 = client([{ ...PX, ...periodDatesPatch(client([PX]), 'property', 'px', value)!.patch }]);
    const rent = draftOf(c1, [periodFact(value)]).draft.lines.find(l => l.source === 'rent')!;
    equal(rent.period?.actual, 'in'); equal(rent.actualToCutoff, undefined);
  }),
];

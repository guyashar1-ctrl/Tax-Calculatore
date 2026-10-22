// ─── שאלון הדוח השנתי — סבב 2.1 (22.10.2026; גיא: בלי טקסט חופשי, «מה כבר מופיע אצלך», רמת סטיב ג׳ובס) ─────────────
// ‼ מה נעול כאן:
//   · שאלות כן/לא מאותו נושא ואותה ישות (מה היה בחו״ל, מה מאלה היה בעסק) — מסך סימון אחד, לא מסך לכל שאלה.
//   · פרטים שהמסמך נותן (פרטי העסקה, סכום התרומות, שכר הדירה מהחוזה) — אצל המשרד; המסמך עצמו — מהלקוח.
//   · «איפה עבדת?» — מה שכבר בכרטיס מוצג מעל השדות, והשאלה היא על מקום נוסף.
//   · נקבה בלי אות סופית באמצע מילה («תרמה», לא «תרםה»).

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type ItemStatus } from '../picture';
import { promptFor, cardLines } from '../asks';
import { buildScreens } from '../screens';
import { genderize } from '../gender';
import { ITEM_BY_KEY } from '../catalog';
import type { InfoAsk, YearFact } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'ישראל', lastName: 'ישראלי', familyStatus: 'married', spouseFirstName: 'ישראלה', gender: 'male', marriageYear: 2020,
  children: [], employers: [{ id: 'e1', name: 'משרד דוגמה', startDate: '2019-03-01' }, { id: 'e2', name: 'חברת דוגמה', belongsToSpouse: true }],
  businesses: [{ id: 'b1', name: 'סטודיו' }], properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
let n = 0;
const fact = (p: Partial<YearFact>): YearFact => ({ id: `f${++n}`, clientId: 'c1', taxYear: 2025, itemKey: '', subjectRole: 'client', periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
  answer: 'value', value: true, basis: 'actual', source: 'portal', status: 'pending', createdAt: '2026-10-22T10:00:00Z', ...p } as YearFact);
const yesno = (itemKey: string, extra: Partial<InfoAsk> = {}): InfoAsk => ({ id: `a${++n}`, clientId: 'c1', taxYear: 2025, stepId: 's', parentStepId: 'p', itemKey, subjectRole: 'client',
  prompt: { title: itemKey, why: '', input: { kind: 'yesno' } }, state: 'published', createdAt: '2026-10-22', ...extra } as InfoAsk);

export const TESTS: TestCase[] = [
  test('מסך סימון: שאלות כן/לא של אותו נושא ואותה ישות — מסך אחד; שאלה יחידה — מסך כן/לא רגיל', () => {
    const biz = (k: string) => yesno(k, { entityKind: 'business', entityRef: 'b1' });
    const scr = buildScreens([biz('business.assetsChanged'), biz('business.inventory'), biz('business.employees')], new Set(), { knownAll: true });
    equal(scr.length, 1);
    equal(scr[0].kind, 'checklist');
    const one = buildScreens([biz('business.inventory')], new Set(), { knownAll: true });
    equal(one[0].kind, 'ask');
    // ישות אחרת — מסך משלה
    const two = buildScreens([biz('business.inventory'), yesno('business.employees', { entityKind: 'business', entityRef: 'b2' })], new Set(), { knownAll: true });
    assert(two.every(s => s.kind === 'ask'), JSON.stringify(two.map(s => s.kind)));
  }),
  test('פרטים מהמסמך — אצל המשרד, עם הוראה מאיפה; המסמך — מהלקוח', () => {
    const p = buildYearPicture({ client: client(), taxYear: 2025, purpose: 'annual', today: '2026-10-22', evidence: [], asks: [],
      facts: [fact({ itemKey: 'donations.given' }), fact({ itemKey: 'sales.sold' })] });
    for (const k of ['donations.amount', 'sales.transaction', 'sales.buyer']) {
      assert(!p.toAsk.some(s => s.item.key === k), `${k} נשאל את הלקוח`);
      assert(p.officeTodo.some(s => s.item.key === k), `${k} לא אצל המשרד`);
      assert(!!ITEM_BY_KEY[k].officeNext, `${k} בלי הוראה למשרד`);
    }
    for (const k of ['donations.receipts', 'sales.docs']) assert(p.toAsk.some(s => s.item.key === k), `${k} לא מתבקש`);
  }),
  test('«איפה עבדת?»: מה שבכרטיס לאותו אדם מעל השדות, והשאלה על מקום נוסף; בלי מעסיק בכרטיס — «איפה עבדת»', () => {
    const st = (role: 'client' | 'spouse') => ({ item: ITEM_BY_KEY['salary.employerDetails'], subjectRole: role, state: 'missing', facts: [], askable: true } as unknown as ItemStatus);
    const ctx = (c: Client) => ({ client: c, taxYear: 2025, purpose: 'annual' as const });
    const me = promptFor(st('client'), ctx(client()));
    equal(me.title, 'איפה עוד עבדת ב-2025?');
    equal(JSON.stringify(me.onCard), JSON.stringify([['משרד דוגמה', 'מ-2019']]));
    const sp = promptFor(st('spouse'), ctx(client()));
    equal(sp.title, 'איפה עוד ישראלה עבדה ב-2025?');
    equal(JSON.stringify(sp.onCard), JSON.stringify([['חברת דוגמה', 'כבר אצלנו']]));
    const none = promptFor(st('client'), ctx(client({ employers: [] } as Partial<Client>)));
    equal(none.title, 'איפה עבדת ב-2025?');
    equal(none.onCard, undefined);
  }),
  test('נקבה: בלי אות סופית באמצע מילה', () => {
    equal(genderize('כמה ישראלה תרם/ה השנה?', 'f'), 'כמה ישראלה תרמה השנה?');
    equal(genderize('כמה ישראל תרם/ה השנה?', 'm'), 'כמה ישראל תרם השנה?');
  }),
  test('בלי לוכסנים: «עובדת במשרד» לבן/בת הזוג; «נכס של ישראלה» בסימון; נכס אחד — מסך סימון אחד גם לזוג וגם לנכס', () => {
    const c = client({ spouse: { firstName: 'ישראלה', gender: 'female' } } as Partial<Client>);
    equal(cardLines(ITEM_BY_KEY['salary.employers'], c, { subjectRole: 'spouse' }).join(), 'עובדת בחברת דוגמה');
    equal(cardLines(ITEM_BY_KEY['salary.employers'], c, { subjectRole: 'client' }).join(), 'עובד במשרד דוגמה');
    const st = (role: 'client' | 'spouse') => ({ item: ITEM_BY_KEY['sales.circumstances'], subjectRole: role, state: 'missing', facts: [], askable: true } as unknown as ItemStatus);
    equal(promptFor(st('client'), { client: c, taxYear: 2025, purpose: 'annual' }).checkLabel, 'ירושה, מתנה או נכס של ישראלה');
    equal(promptFor(st('spouse'), { client: c, taxYear: 2025, purpose: 'annual' }).checkLabel, 'ירושה, מתנה או נכס של ישראל');
    equal(promptFor(st('client'), { client: client({ familyStatus: 'single' } as Partial<Client>), taxYear: 2025, purpose: 'annual' }).checkLabel, 'ירושה או מתנה');
    const prop = (k: string, ref?: string) => yesno(k, { subjectRole: 'couple', ...(ref ? { entityKind: 'property', entityRef: ref } : {}) });
    const one = buildScreens([prop('rent.coOwned', 'p1'), prop('rent.expenses'), prop('rent.keyMoney')], new Set(), { knownAll: true });
    equal(one.map(x => x.kind).join(), 'checklist');
    const two = buildScreens([prop('rent.coOwned', 'p1'), prop('rent.coOwned', 'p2'), prop('rent.expenses'), prop('rent.keyMoney')], new Set(), { knownAll: true });
    assert(!two.some(x => x.kind === 'checklist' && new Set(x.asks.map(a => a.entityRef).filter(Boolean)).size > 1), 'שני נכסים באותו מסך סימון');
  }),
];

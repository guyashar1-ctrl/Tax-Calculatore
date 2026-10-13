// ─── איסוף הנתונים: התרחישים שגיא ביקש לבדוק לפני שליחה ללקוחות (12.10.2026) ──
// ‼ מה נעול כאן (מעבר ל-taxYear.test.ts):
//   · שני מעסיקים ⇒ בקשת 106 מכל אחד, לשנה של הדוח; מסמך שכבר אושר למעסיק — לא מתבקש שוב.
//   · מסמך שהועלה וטרם נבדק — «התקבל», לא «ידוע».
//   · «החזר ללקוח לתיקון» — אותה שאלה, עם הערת המשרד; התשובה הקודמת נשארת; אין כפילות.
//   · נושא שחישובו טרם מומש נאסף בכל זאת (חו״ל, מכירת נכס, שוק ההון).
//   · שאלון קליטה ישן שנפתח שוב: סבב חוזר נקלט, תשובה שלא השתנתה לא נרשמת פעמיים.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { buildYearPicture, type PictureInput } from '../picture';
import { buildAskPlan, correctionAsk } from '../asks';
import { reconcileLegacyRound, sessionNeedsSync } from '../transfer';
import type { Evidence, InfoAsk, YearFact } from '../types';

const TODAY = '2026-10-12';
let n = 0;
const id = () => `s${++n}`;
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'נועה', lastName: 'לוי', familyStatus: 'single', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const fact = (p: Partial<YearFact> & Pick<YearFact, 'itemKey'>): YearFact => ({
  id: id(), clientId: 'c1', taxYear: 2025, subjectRole: 'client', periodKind: 'year', answer: 'value', value: true,
  basis: 'declared', source: 'portal', status: 'accepted', createdAt: '2026-10-01T10:00:00Z', ...p,
});
const evidence = (p: Partial<Evidence>): Evidence => ({
  id: id(), clientId: 'c1', taxYear: 2025, docKind: 'form106', subjectRole: 'client', receivedAt: '2026-10-05T10:00:00Z',
  receivedVia: 'portal', extraction: 'not_supported', identityMatch: 'unchecked', periodMatch: 'unchecked', review: 'needs_review', ...p,
});
const pic = (p: Partial<PictureInput> & { client: Client }) =>
  buildYearPicture({ taxYear: 2025, purpose: 'annual', today: TODAY, facts: [], evidence: [], asks: [], ...p });
const ctx = (c: Client) => ({ client: c, taxYear: 2025, purpose: 'annual' as const });

const twoEmployers = client({ employers: [{ id: 'e1', name: 'אינטל' }, { id: 'e2', name: 'בנק לאומי' }] as Client['employers'] });
// הלקוח אישר שעבד כשכיר בשנה (שאלת הפתיחה נענתה ואושרה)
const worked = fact({ itemKey: 'salary.worked', answer: 'value', value: true });

export const TESTS: TestCase[] = [
  test('שני מעסיקים ⇒ 106 מכל מעסיק, לשנת הדוח — שתי שאלות נפרדות, כל אחת עם שם המעסיק', () => {
    const p = pic({ client: twoEmployers, facts: [worked] });
    const f106 = p.statuses.filter(s => s.item.key === 'salary.form106');
    equal(f106.map(s => s.entityRef).sort().join(','), 'e1,e2');
    // 106 לשנת 2025 זמין מ-1.3.2026 — היום (12.10.2026) אפשר לבקש
    assert(f106.every(s => s.state === 'missing' && s.askable), f106.map(s => `${s.entityRef}:${s.state}`).join(' '));
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], ctx(twoEmployers)).filter(e => e.itemKey === 'salary.form106');
    equal(plan.length, 2);
    assert(plan.some(e => e.prompt.title.includes('אינטל')) && plan.some(e => e.prompt.title.includes('בנק לאומי')), plan.map(e => e.prompt.title).join(' | '));
  }),
  test('מסמך שכבר התקבל ואושר למעסיק אחד — לא מתבקש שוב; רק השני', () => {
    const ok = evidence({ entityKind: 'employer', entityRef: 'e1', identityMatch: 'match', periodMatch: 'match', review: 'accepted' });
    const p = pic({ client: twoEmployers, facts: [worked], evidence: [ok] });
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], ctx(twoEmployers)).filter(e => e.itemKey === 'salary.form106');
    equal(plan.map(e => e.entityRef).join(','), 'e2');
  }),
  test('מסמך שהועלה וטרם נבדק — «התקבל, לבדיקה», לא ידוע ולא מתבקש שוב', () => {
    const up = evidence({ entityKind: 'employer', entityRef: 'e1' });
    const p = pic({ client: twoEmployers, facts: [worked], evidence: [up] });
    const s = p.statuses.find(x => x.item.key === 'salary.form106' && x.entityRef === 'e1')!;
    assert(s.state === 'docReceived', s.state);
    assert(!buildAskPlan([...p.toConfirm, ...p.toAsk], ctx(twoEmployers)).some(e => e.itemKey === 'salary.form106' && e.entityRef === 'e1'), 'נשאל שוב על מסמך שכבר הגיע');
  }),
  test('«החזר ללקוח לתיקון»: אותה שאלה, עם הערת המשרד; התשובה הקודמת לא נמחקת', () => {
    const answered = fact({ itemKey: 'sales.sold', status: 'pending', value: true });
    const origin: InfoAsk = {
      id: 'a1', clientId: 'c1', taxYear: 2025, stepId: 'i1', parentStepId: 'r1', itemKey: 'sales.sold', subjectRole: 'client',
      prompt: { title: 'האם היו לך השקעות בבנק או בבית השקעות?', why: 'רווחים ממניות וריבית חייבים בדיווח', input: { kind: 'yesno' } },
      state: 'answered', answeredFactIds: [answered.id], createdAt: '2026-10-01T10:00:00Z',
    };
    const p = pic({ client: client(), facts: [answered], asks: [origin] });
    const re = correctionAsk({ factId: answered.id, itemKey: 'sales.sold', subjectRole: 'client' }, [origin], p.statuses, ctx(client()), '  נא לפרט גם את החשבון בבית ההשקעות  ');
    assert(re !== null, 'לא נוצרה שאלה חוזרת');
    equal(re!.itemKey, 'sales.sold');
    equal(re!.prompt.title, origin.prompt.title);
    equal(re!.prompt.correction, 'נא לפרט גם את החשבון בבית ההשקעות');
    // הערה ריקה — לא שולחים
    equal(correctionAsk({ factId: answered.id, itemKey: 'sales.sold', subjectRole: 'client' }, [origin], p.statuses, ctx(client()), '   '), null);
    // פריט של המשרד — אין מה לשאול את הלקוח
    equal(correctionAsk({ itemKey: 'salary.amounts', subjectRole: 'client', entityRef: 'e1' }, [], p.statuses, ctx(client()), 'x'), null);
  }),
  test('«החזר ללקוח» למסמך: אותה בקשת קובץ (אותו מעסיק), עם ההערה', () => {
    const doc = evidence({ entityKind: 'employer', entityRef: 'e2' });
    const origin: InfoAsk = {
      id: 'a2', clientId: 'c1', taxYear: 2025, stepId: 'i1', parentStepId: 'r1', itemKey: 'salary.form106', subjectRole: 'client',
      entityKind: 'employer', entityRef: 'e2', prompt: { title: 'טופס 106 מבנק לאומי', why: '', input: { kind: 'file', docKind: 'form106' } },
      state: 'answered', evidenceIds: [doc.id], createdAt: '2026-10-01T10:00:00Z',
    };
    const re = correctionAsk({ evidenceId: doc.id, itemKey: '', subjectRole: 'client', entityKind: 'employer', entityRef: 'e2' }, [origin], [], ctx(twoEmployers), 'הקובץ חתוך — חסר העמוד השני');
    equal(re?.entityRef, 'e2');
    equal(re?.prompt.input.kind, 'file');
    equal(re?.prompt.correction, 'הקובץ חתוך — חסר העמוד השני');
  }),
  test('שינוי תשובה: «לא» ששונה ל«כן» — «כן» בלי מקור בחו״ל בתיק ⇒ מקור חדש: פרטים ודוח, בלי להיתקע; אחרי הוספה לתיק — הדוח מתבקש, פעם אחת', () => {
    const no = fact({ itemKey: 'foreign.income', answer: 'no', value: undefined, status: 'rejected' });
    const yes = fact({ itemKey: 'foreign.income', answer: 'value', value: true, status: 'accepted' });
    // ‼ 12.10.2026: אין מקור בחו״ל בכרטיס — נולד «מקור חדש» זמני: שואלים מה ואיפה, ומבקשים את הדוח שלו.
    //   לא רק «משימה למשרד» שאיש לא פועל לפיה.
    const p0 = pic({ client: client(), facts: [no, yes] });
    const scr = p0.statuses.find(s => s.item.key === 'foreign.income')!;
    assert(!scr.officeAction, `נשארה רק התראה כללית: ${scr.officeAction}`);
    const det = p0.statuses.find(s => s.item.key === 'foreign.sourceDetails')!;
    assert(!!det && det.provisional && det.state === 'missing' && det.askable, `פרטי המקור החדש לא נשאלים: ${det?.state}`);
    equal(det.entityRef, 'frn-new-client-2025');
    const doc0 = p0.statuses.find(s => s.item.key === 'foreign.statements' && s.entityRef === 'frn-new-client-2025')!;
    assert(!!doc0 && doc0.askable, `הדוח מהמקור החדש לא מתבקש: ${doc0?.state}`);
    const plan0 = buildAskPlan([...p0.toConfirm, ...p0.toAsk], ctx(client()));
    assert(plan0.some(e => e.itemKey === 'foreign.statements' && e.entityRef === 'frn-new-client-2025' && e.prompt.title.includes('המקור החדש')), 'השאלה ללקוח לא מזכירה את המקור החדש');
    // ההיסטוריה: התשובה שנדחתה עדיין ברשימת העובדות של הפריט
    equal(scr.facts.length, 2);
    // המשרד מוסיף לתיק את המקור עם אותו מזהה ⇒ זה אותו יעד: השאלה שנשלחה עליו נשארת «נשלח», לא שאלה חדשה
    const sentDoc: InfoAsk = { id: 'a9', clientId: 'c1', taxYear: 2025, stepId: 'i1', parentStepId: 'r1', itemKey: 'foreign.statements', subjectRole: 'couple',
      entityKind: 'foreign_source', entityRef: 'frn-new-client-2025', prompt: { title: 't', why: '', input: { kind: 'file', docKind: 'foreignStatement' } }, state: 'published', createdAt: TODAY };
    const added = client({ foreignAccounts: [{ id: 'frn-new-client-2025', institutionName: 'Fidelity', country: 'ארה״ב' }] as Client['foreignAccounts'] });
    const pa = pic({ client: added, facts: [no, yes], asks: [sentDoc] });
    const sameTarget = pa.statuses.filter(s => s.item.key === 'foreign.statements');
    equal(sameTarget.length, 1);
    equal(sameTarget[0].state, 'asked');
    assert(!sameTarget[0].provisional, 'אחרי ההוספה הישות עדיין זמנית');
    assert(!pa.statuses.some(s => s.item.key === 'foreign.sourceDetails' && s.state === 'missing'), 'פרטי המקור נשאלים שוב אחרי שנוסף לתיק');
    // המשרד הוסיף לתיק ⇒ הדוח מהגורם בחו״ל מתבקש, והמשימה נעלמה
    const withSrc = client({ foreignAccounts: [{ id: 'f1', institutionName: 'Fidelity', country: 'ארה״ב' }] as Client['foreignAccounts'] });
    const p = pic({ client: withSrc, facts: [no, yes] });
    const st = p.statuses.find(s => s.item.key === 'foreign.statements' && s.entityRef === 'f1')!;
    equal(st.state, 'missing');
    assert(!p.statuses.find(s => s.item.key === 'foreign.income')!.officeAction, 'המשימה נשארה אחרי שהוסף לתיק');
    // אותה שאלה כבר פורסמה ⇒ «נשלח» ולא שאלה חדשה
    const pub: InfoAsk = { id: 'a3', clientId: 'c1', taxYear: 2025, stepId: 'i1', parentStepId: 'r1', itemKey: 'foreign.statements', subjectRole: st.subjectRole,
      entityKind: 'foreign_source', entityRef: 'f1', prompt: { title: 't', why: '', input: { kind: 'file', docKind: 'foreignStatement' } }, state: 'published', createdAt: TODAY };
    const p2 = pic({ client: withSrc, facts: [no, yes], asks: [pub] });
    equal(p2.statuses.find(s => s.item.key === 'foreign.statements' && s.entityRef === 'f1')!.state, 'asked');
    assert(!buildAskPlan([...p2.toConfirm, ...p2.toAsk], ctx(withSrc)).some(e => e.itemKey === 'foreign.statements'), 'נשאל פעמיים');
  }),
  test('נושאים שחישובם טרם מומש נאספים בכל זאת: חו״ל, מכירת נכס, שוק ההון — שאלת פתיחה ללקוח', () => {
    const p = pic({ client: client() });
    for (const k of ['foreign.income', 'sales.sold', 'capital.accounts']) {
      const s = p.statuses.find(x => x.item.key === k);
      assert(!!s && s.state === 'missing' && s.askable, `${k}: ${s?.state ?? 'לא קיים בקטלוג'}`);
    }
  }),
  test('שאלון קליטה ישן שנפתח שוב: סבב חדש נקלט; תשובה שלא השתנתה — לא נרשמת פעמיים; שונה — עם מזהה סבב', () => {
    assert(sessionNeedsSync('2026-10-10T10:00:00Z', null), 'סשן שלא נקלט');
    assert(!sessionNeedsSync('2026-10-10T10:00:00Z', '2026-10-10T11:00:00Z'), 'נקלט אחרי הסיום');
    assert(sessionNeedsSync('2026-10-12T09:00:00Z', '2026-10-10T11:00:00Z'), 'סבב חוזר אחרי הקליטה — לא נקלט (הבאג)');
    assert(!sessionNeedsSync(null, null), 'סשן שלא הושלם');
    const facts = [
      { itemKey: 'donations.has', subjectRole: 'client', answer: 'value', value: true, sourceRef: 'S1:donations.has:client' },
      { itemKey: 'salary.worked', subjectRole: 'client', answer: 'no', sourceRef: 'S1:salary.worked:client' },
    ];
    const recorded = [
      { item_key: 'donations.has', subject_role: 'client', answer: 'value', value: true, source_ref: 'S1:donations.has:client' },
      { item_key: 'salary.worked', subject_role: 'client', answer: 'value', value: true, source_ref: 'S1:salary.worked:client' },
    ];
    const out = reconcileLegacyRound(facts, recorded, '2026-10-12T09:00:00Z');
    equal(out.length, 1);
    equal(out[0].itemKey, 'salary.worked');
    equal(out[0].sourceRef, 'S1@2026-10-12T09:00:00Z:salary.worked:client');
  }),
];

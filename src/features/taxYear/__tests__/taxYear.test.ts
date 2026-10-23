// ─── שנת מס: תמונת השנה, שאלות, תשובות, העברה מהכרטיס ושאלון ישן (11.10.2026) ──
// ‼ מה נעול כאן:
//   · לא שואלים שוב מה שידוע, ממתין או נשלח; מפת 1301 אינה רשימת שאלות.
//   · תשובה להערכה עד ספטמבר חלקית לדוח — שואלים «מה השתנה מאז», לא מחדש.
//   · מסמך שהתקבל ≠ ידוע; ריק ≠ אפס ≠ «לא» ≠ «לא רלוונטי».
//   · מסמך שטרם זמין — מועד לפי סוג המסמך והשנה, לא חודש אחיד.
//   · שנה לסכום מהכרטיס רק עם ראיה; בלי ראיה — «שנה לא ידועה».
//   · בן/בת הזוג והישויות (מעביד, נכס, חשבון) נפרדים.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { AREAS, ITEMS, ITEM_BY_KEY } from '../catalog';
import { buildYearPicture, type PictureInput } from '../picture';
import { answerToFacts, buildAskPlan, newAsk, promptFor } from '../asks';
import { DOCS, followUpFor } from '../documents';
import { proposeTransfers, legacyModelToFacts } from '../transfer';
import { groupForReview } from '../review';
import type { Evidence, InfoAsk, YearFact } from '../types';
import CATALOG from '../../taxForms/data/form1301-2025.catalog.json';
import ANNEX_INFO from '../../taxForms/data/annex-info-2025.json';

const TODAY = '2026-10-11';
let n = 0;
const id = () => `x${++n}`;

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'נועה', lastName: 'לוי', familyStatus: 'single', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);

const fact = (p: Partial<YearFact> & Pick<YearFact, 'itemKey'>): YearFact => ({
  id: id(), clientId: 'c1', taxYear: 2026, subjectRole: 'client', periodKind: 'year', answer: 'value', value: true,
  basis: 'actual', source: 'portal', status: 'accepted', createdAt: '2026-10-01T10:00:00Z', ...p,
});

const pic = (p: Partial<PictureInput> & { client: Client }) =>
  buildYearPicture({ taxYear: 2026, purpose: 'estimate', today: TODAY, facts: [], evidence: [], asks: [], ...p });
const st = (p: ReturnType<typeof pic>, key: string, role?: string, ref?: string) =>
  p.statuses.find(s => s.item.key === key && (!role || s.subjectRole === role) && (!ref || s.entityRef === ref));

const married = client({
  familyStatus: 'married', spouseFirstName: 'מיכל', marriageYear: 2012,
  children: [{ id: 'k1', firstName: 'דנה', birthYear: 2014, birthDate: '2014-03-01', hasDisability: false }] as Client['children'],
  employers: [{ id: 'e1', name: 'אינטל' }, { id: 'e2', name: 'בית חולים', belongsToSpouse: true }] as Client['employers'],
  businesses: [{ id: 'b1', name: 'סטודיו נועה', kind: 'osek_morshe' }] as unknown as Client['businesses'],
  properties: [{ id: 'p1', address: 'הרצל 5', city: 'חיפה', isRented: true, purchaseYear: 2019 }] as Client['properties'],
  investmentAccounts: [{ id: 'a1', institutionName: 'מיטב', openedDate: '2020-03-01' }] as Client['investmentAccounts'],
});

export const TESTS: TestCase[] = [
  // ── כיסוי: התחומים מכסים את 1301 ואת הנספחים, בלי להפוך אותם לשאלות ──
  test('כיסוי: כל שדה 1301 שייך לתחום, וכל נספח מכוסה; הפניות לפריטי נספח קיימות', () => {
    const parts = new Set(AREAS.flatMap(a => a.parts1301));
    const fields = (CATALOG as { fields: { part: string; id: string }[] }).fields;
    const orphan = fields.filter(f => !parts.has(f.part)).map(f => f.id);
    equal(orphan.join(','), '');
    equal(fields.length, 305);
    const annexes = new Set(AREAS.flatMap(a => a.annexes));
    const info = (ANNEX_INFO as { annexes: { formId: string; items: { key: string }[] }[] }).annexes;
    equal(info.filter(a => !annexes.has(a.formId)).map(a => a.formId).join(','), '');
    const keys = new Set(info.flatMap(a => a.items.map(i => i.key)));
    const bad = ITEMS.flatMap(i => (i.covers?.annexItems ?? []).filter(k => !keys.has(k)).map(k => `${i.key}→${k}`));
    equal(bad.join(','), '');
    equal(new Set(ITEMS.map(i => i.key)).size, ITEMS.length);
  }),
  test('מספר השאלות ללקוח קטן: שכיר רווק בלי נכסים — לכל היותר 8 שאלות פתיחה, בלי קודי טופס', () => {
    const c = client({ employers: [{ id: 'e1', name: 'אינטל' }] as Client['employers'] });
    const p = pic({ client: c, purpose: 'annual', taxYear: 2025 });
    // ‼ 19.10.2026 · בדוח השנתי שאלות הפתיחה הן אריחים במסך רשת אחד — סופרים מסכים, לא אריחים
    const screeners = p.toAsk.filter(s => s.item.kind === 'screener');
    const screens = screeners.filter(s => !s.item.tile).length + (screeners.some(s => s.item.tile) ? 1 : 0);
    assert(screens <= 8, `${screens} מסכי פתיחה`);
    // שמות מסמכים שהלקוח מכיר (טופס 106, 867) מותרים; קודי שדות וסעיפים — לא
    const titles = p.toAsk.map(s => promptFor(s, { client: c, taxYear: 2025, purpose: 'annual' }).title.replace(/טופס (106|867)/g, ''));
    assert(titles.every(t => !/קוד|סעיף|\d{3}/.test(t)), `קוד טופס בשאלה: ${titles.find(t => /קוד|סעיף|\d{3}/.test(t))}`);
    assert(!p.statuses.some(s => s.item.rare), 'פריט חריג נפתח בלי שהמשרד סימן');
  }),

  // ── ממידע קיים: «זה מה שידוע לנו», לא שאלה חדשה ──
  test('ממידע קיים: ילדים, מעסיק ועסק מהכרטיס — לאישור, לא לשאלה; בן/בת הזוג בנפרד', () => {
    const p = pic({ client: married });
    equal(st(p, 'household.children', 'couple')?.state, 'fromCard');
    equal(st(p, 'salary.employers', 'client')?.state, 'fromCard');
    equal(st(p, 'salary.employers', 'spouse')?.state, 'fromCard');
    const lines = promptFor(st(p, 'salary.employers', 'spouse')!, { client: married, taxYear: 2026, purpose: 'estimate' });
    assert(lines.input.kind === 'confirm' && lines.input.lines.join() === 'בית חולים', JSON.stringify(lines.input));
    equal(lines.subjectName, 'מיכל');
    assert(p.toConfirm.length >= 4, 'רשימת אישור');
    // מעביד, עסק, נכס וחשבון — יעד נפרד לכל אחד
    // 16.10.2026 · הערכה בלי מסמכים: התלוש לא נשאל; היעד לכל מעסיק נשאר בפריט הסכומים (משרד)
    assert(!st(p, 'salary.payslipToDate', 'spouse', 'e2'), 'תלוש בהערכה');
    equal(st(p, 'salary.amounts', 'spouse', 'e2')?.entityLabel, 'בית חולים');
    equal(st(p, 'rent.income', 'couple', 'p1')?.entityLabel, 'הרצל 5, חיפה');
  }),
  test('«אין שינוי» נרשם כהצהרת לקוח ממתינה, לא כאישור; המשרד מאשר במרוכז', () => {
    const p = pic({ client: married });
    const s = st(p, 'household.children', 'couple')!;
    const ctx = { client: married, taxYear: 2026, purpose: 'estimate' as const, cutoffMonth: 9 };
    const ask = newAsk(s, ctx, { id: 'a1', stepId: 's2', parentStepId: 's1', now: TODAY });
    const r = answerToFacts(ask, { kind: 'unchanged' }, ctx, TODAY);
    equal(r.facts[0].status, 'pending');
    equal(r.facts[0].clientAssertion, 'unchanged');
    const facts = r.facts.map(f => ({ ...f, id: id(), createdAt: TODAY }) as YearFact);
    const g = groupForReview(facts, []);
    equal(g.unchanged.length, 1);
    equal(g.individual.length, 0);
    assert(g.unchanged[0].knownText!.includes('דנה'), 'הפירוט נגיש באישור המרוכז');
    equal(st(pic({ client: married, facts }), 'household.children', 'couple')?.state, 'pendingReview');
  }),

  // ── שינוי שסותר מידע קיים ──
  test('שינוי של הלקוח שסותר מידע קיים — נבדק בנפרד, עם הערך הקודם', () => {
    const prev = fact({ itemKey: 'donations.amount', value: 5000 });
    const changed = fact({ itemKey: 'donations.amount', value: 12000, status: 'pending', createdAt: '2026-10-05T00:00:00Z' });
    const g = groupForReview([prev, changed], []);
    equal(g.individual.length, 1);
    assert(g.individual[0].conflict!.includes('5,000'), g.individual[0].conflict!);
    const s = st(pic({ client: client(), facts: [fact({ itemKey: 'donations.given' }), prev, changed] }), 'donations.amount', 'client');
    equal(s?.state, 'pendingReview');
    assert(!!s?.conflict, 'סתירה מסומנת');
    const asked = fact({ itemKey: 'household.children', subjectRole: 'couple', status: 'pending', clientAssertion: 'changed', value: { changed: true, note: 'נולד יואב' } });
    assert(groupForReview([asked], []).individual[0].conflict!.includes('שינוי'), 'שינוי ממה שבכרטיס');
  }),

  // ── מהערכה לדוח שנתי ──
  test('הערכה עד ספטמבר → דוח שנתי: לא שואלים מחדש; «מה השתנה מאז» לתחום ומסמך סופי', () => {
    const ctx = { client: married, taxYear: 2026, purpose: 'estimate' as const, cutoffMonth: 9 };
    const s = st(pic({ client: married }), 'donations.given', 'client')!;
    const r = answerToFacts(newAsk(s, ctx, { id: 'a', stepId: 's', parentStepId: 'p', now: TODAY }), { kind: 'yes' }, ctx, TODAY);
    equal(r.facts[0].basis, 'actual_to_date');
    equal(r.facts[0].periodTo, '2026-09-30');
    const facts = r.facts.map(f => ({ ...f, id: id(), createdAt: TODAY, status: 'accepted' }) as YearFact);
    const est = pic({ client: married, facts, cutoffMonth: 9 });
    equal(st(est, 'donations.given', 'client')?.state, 'known');
    const ann = pic({ client: married, facts, purpose: 'annual', today: '2027-03-15' });
    equal(st(ann, 'donations.given', 'client')?.state, 'partial');
    assert(!ann.toAsk.some(x => x.item.key === 'donations.given' && x.subjectRole === 'client'), 'שאלת הפתיחה לא נשאלת שוב');
    const since = st(ann, 'donations.changesSince', 'couple');
    equal(since?.state, 'missing');
    assert(promptFor(since!, { client: married, taxYear: 2026, purpose: 'annual' }).title.includes('ספטמבר'), 'הניסוח מציין מאז מתי');
    equal(st(ann, 'donations.receipts', 'client')?.state, 'missing');
  }),

  // ── מסמך חסר או שטרם זמין ──
  test('מסמך שטרם זמין: מועד לפי סוג המסמך והשנה, לא חודש אחיד', () => {
    const p = pic({ client: married, purpose: 'annual', taxYear: 2026 });
    const f106 = st(p, 'salary.form106', 'client', 'e1')!;
    equal(f106.state, 'notYetAvailable');
    equal(f106.requestableFrom, '2027-03-01');
    equal(followUpFor('niAnnualCert', 2026, TODAY).followUpOn, '2027-02-01');
    equal(followUpFor('form106', 2026, TODAY).followUpOn, '2027-03-01');
    equal(followUpFor('form106', 2025, TODAY).followUpOn, '2026-11-10'); // המועד עבר → עוד 30 יום
    assert(DOCS.form106.why.length > 10, 'סיבה מוצגת למשרד');
    // 2025: כבר אפשר לבקש
    equal(st(pic({ client: married, purpose: 'annual', taxYear: 2025 }), 'salary.form106', 'client', 'e1')?.state, 'missing');
  }),
  test('«אין לי עדיין» → מועד מעקב ומצב «ממתין», בלי הודעה; כשהמועד מגיע — «הגיע מועד התזכורת» (תזכורת משרד, לא טענה שהמסמך זמין)', () => {
    const ctx = { client: married, taxYear: 2025, purpose: 'annual' as const };
    const s = st(pic({ client: married, purpose: 'annual', taxYear: 2025 }), 'capital.form867', 'couple', 'a1')!;
    const ask = newAsk(s, ctx, { id: 'q1', stepId: 's', parentStepId: 'p', now: TODAY });
    const r = answerToFacts(ask, { kind: 'unavailable', reason: 'הבנק עוד לא שלח' }, ctx, TODAY);
    equal(r.facts.length, 0);
    equal(r.unavailable?.followUpOn, '2026-11-10');
    const asks: InfoAsk[] = [{ ...ask, state: 'unavailable', unavailable: { ...r.unavailable!, recordedAt: TODAY } }];
    equal(st(pic({ client: married, purpose: 'annual', taxYear: 2025, asks }), 'capital.form867', 'couple', 'a1')?.state, 'unavailable');
    const later = st(pic({ client: married, purpose: 'annual', taxYear: 2025, asks, today: '2026-11-12' }), 'capital.form867', 'couple', 'a1')!;
    assert(later.detail.includes('הגיע מועד התזכורת') && !later.detail.includes('זמין'), later.detail);
  }),
  test('מסמך שהתקבל אינו מידע מאושר: קבלה → בדיקה → אישור', () => {
    const ev = (review: Evidence['review'], identityMatch: Evidence['identityMatch'] = 'unchecked'): Evidence => ({
      id: id(), clientId: 'c1', taxYear: 2025, docKind: 'form867', subjectRole: 'couple', entityKind: 'account', entityRef: 'a1',
      receivedAt: TODAY, receivedVia: 'portal', extraction: 'not_supported', identityMatch, periodMatch: 'unchecked', review,
    });
    const base = { client: married, purpose: 'annual' as const, taxYear: 2025 };
    equal(st(pic({ ...base, evidence: [ev('needs_review')] }), 'capital.form867', 'couple', 'a1')?.state, 'docReceived');
    assert(st(pic({ ...base, evidence: [ev('needs_review', 'mismatch')] }), 'capital.form867', 'couple', 'a1')!.detail.includes('לא תואם'), 'אי התאמה');
    equal(st(pic({ ...base, evidence: [ev('accepted', 'match')] }), 'capital.form867', 'couple', 'a1')?.state, 'known');
    // הסכומים מה-867 — המשרד מזין; המסמך לבדו לא סוגר אותם
    equal(st(pic({ ...base, evidence: [ev('accepted', 'match')] }), 'capital.amounts', 'couple', 'a1')?.state, 'docReceived');
  }),

  // ── ריק / אפס / לא / לא רלוונטי ──
  test('ריק ≠ אפס ≠ «לא» ≠ «לא רלוונטי»', () => {
    const ctx = { client: married, taxYear: 2026, purpose: 'annual' as const };
    const s = st(pic({ client: married, purpose: 'annual', facts: [fact({ itemKey: 'rent.properties', subjectRole: 'couple' })] }), 'rent.income', 'couple', 'p1')!;
    const ask = newAsk(s, ctx, { id: 'r', stepId: 's', parentStepId: 'p', now: TODAY });
    equal(answerToFacts(ask, { kind: 'amount', amount: 0 }, ctx, TODAY).facts[0].answer, 'zero');
    equal(answerToFacts(ask, { kind: 'no' }, ctx, TODAY).facts[0].answer, 'no');
    equal(answerToFacts(ask, { kind: 'notSure' }, ctx, TODAY).facts.length, 0); // «לא בטוח» → למשרד, לא עובדה
    equal(s.state, 'missing'); // ריק = אין עובדה
    const na = fact({ itemKey: 'rent.income', subjectRole: 'couple', entityKind: 'property', entityRef: 'p1', answer: 'not_applicable', value: undefined });
    equal(st(pic({ client: married, purpose: 'annual', facts: [na] }), 'rent.income', 'couple', 'p1')?.state, 'notApplicable');
    const zero = { ...na, id: id(), answer: 'zero' as const, value: 0 };
    equal(st(pic({ client: married, purpose: 'annual', facts: [zero] }), 'rent.income', 'couple', 'p1')?.state, 'known');
  }),
  test('לא שואלים פעמיים: פריט שנשלח ועוד לא נענה, או תשובה שממתינה', () => {
    const s = st(pic({ client: married }), 'donations.given', 'client')!;
    const ask = newAsk(s, { client: married, taxYear: 2026, purpose: 'estimate' }, { id: 'q', stepId: 's', parentStepId: 'p', now: TODAY });
    const p1 = pic({ client: married, asks: [{ ...ask, state: 'published' }] });
    equal(st(p1, 'donations.given', 'client')?.state, 'asked');
    assert(!p1.toAsk.some(x => x.item.key === 'donations.given' && x.subjectRole === 'client'), 'נשאל שוב');
    const p2 = pic({ client: married, facts: [fact({ itemKey: 'donations.given', status: 'pending' })] });
    assert(!p2.toAsk.some(x => x.item.key === 'donations.given' && x.subjectRole === 'client'), 'ממתינה — נשאל שוב');
  }),

  // ── שנה לסכום מהכרטיס — רק עם ראיה ──
  test('העברה מהכרטיס: שנה רק עם ראיה; בלי ראיה «שנה לא ידועה»; הערך המקורי נשמר', () => {
    const c = client({ donationsAnnual: 3000, lifeInsuranceAnnual: 1200, rentalIncomeAnnual: 60000 } as Partial<Client>);
    const props = proposeTransfers(c, [
      { fieldKey: 'donationsAnnual', value: 3000, source: 'questionnaire', sessionTaxYear: 2024, at: '2025-04-02T10:00:00Z' },
      { fieldKey: 'lifeInsuranceAnnual', value: 1000, source: 'questionnaire', sessionTaxYear: 2024, at: '2025-04-02T10:00:00Z' }, // שונה אחר כך
      { fieldKey: 'rentalIncomeAnnual', value: 60000, source: 'manual', at: '2025-06-01T10:00:00Z' },
    ]);
    const by = (k: string) => props.find(p => p.path === k)!;
    equal(by('donationsAnnual').suggestedYear, 2024);
    assert(by('donationsAnnual').evidence!.includes('2024'), 'הראיה מוצגת');
    equal(by('lifeInsuranceAnnual').suggestedYear, null);
    equal(by('rentalIncomeAnnual').suggestedYear, null);
    equal(by('rentalIncomeAnnual').group, 'unknown');
    equal(by('rentalIncomeAnnual').original, 60000);
    equal(proposeTransfers(client({ donationsAnnual: 0 } as Partial<Client>), []).length, 0); // 0 בלי ראיה אינו נתון
  }),

  // ── קישור ישן: תשובות נשמרות לשנת הסשן, בלי כפילות ובלי דריסה ──
  test('שאלון ישן: התשובות לשנת הסשן, מזהה מקור יציב, וסתירה מול הדף האישי מוצגת ולא נדרסת', () => {
    const model = { taxYear: 2025, identity: {}, spouse: {}, income: { sources: ['salary', 'rental'], rentalGrossAnnual: 48000 }, deductionsCredits: { donationAmount: 2500, hasLifeInsurance: true } } as never;
    const a = legacyModelToFacts(model, { id: 'sess1', clientId: 'c1', taxYear: 2025 });
    const b = legacyModelToFacts(model, { id: 'sess1', clientId: 'c1', taxYear: 2025 });
    assert(a.every(f => f.taxYear === 2025 && f.source === 'legacy_questionnaire' && f.status === 'pending'), 'שנה ומקור');
    equal(JSON.stringify(a.map(f => f.sourceRef)), JSON.stringify(b.map(f => f.sourceRef)));
    equal(new Set(a.map(f => f.sourceRef)).size, a.length);
    const legacyDon = { ...a.find(f => f.itemKey === 'donations.amount')!, id: 'l1', createdAt: TODAY } as YearFact;
    const portalDon = fact({ itemKey: 'donations.amount', taxYear: 2025, value: 4000, status: 'pending' });
    const g = groupForReview([legacyDon, portalDon], []);
    assert(g.individual[0].conflict!.includes('שאלון קודם'), 'הסתירה בין המסלולים מוצגת');
    equal(g.legacy.length, 1);
  }),

  // ── כמה מקורות הכנסה ובני זוג ──
  test('כמה מקורות ובני זוג: עסק, משכורת לשניים, נכס וחשבון — כל אחד בנפרד, הנושא בכותרת', () => {
    const p = pic({ client: married, purpose: 'annual', taxYear: 2025 });
    const f106 = p.statuses.filter(s => s.item.key === 'salary.form106');
    equal(f106.map(s => `${s.subjectRole}:${s.entityRef}`).join(','), 'client:e1,spouse:e2');
    const spouseQ = promptFor(st(p, 'salary.form106', 'spouse', 'e2')!, { client: married, taxYear: 2025, purpose: 'annual' });
    equal(spouseQ.subjectName, 'מיכל');
    assert(st(p, 'business.books', 'client', 'b1') !== undefined, 'דוח רווח והפסד לעסק');
    assert(st(p, 'capital.form867', 'couple', 'a1') !== undefined, '867 לחשבון');
    // מצבים מיוחדים — רק כשהמשרד פתח
    assert(!st(p, 'special.trust'), 'נאמנות בלי סימון');
    assert(!!st(pic({ client: married, purpose: 'annual', taxYear: 2025, openedRare: ['special.trust'] }), 'special.trust', 'spouse'), 'נאמנות אחרי סימון');
  }),
  test('זוג: שאלה אחת «מי מכם?» לכל תחום; העובדות נשמרות לכל אחד; הכרטיס עונה — לא שואלים', () => {
    const ctx = { client: married, taxYear: 2026, purpose: 'estimate' as const, cutoffMonth: 9 };
    const p = pic({ client: married, cutoffMonth: 9 });
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], ctx);
    // זוג עם שתי משכורות, עסק, נכס מושכר וחשבון השקעות: 7 אישורים מהכרטיס, 7 שאלות פתיחה לזוג, ושאלות לכל עסק/נכס/חשבון/מעסיק.
    // ‼ 11.10.2026: +1 בכוונה — «שינוי שמזכה בהנחה» (תואר/שחרור/יישוב שאינם בכרטיס). בלעדיה תואר חדש לא נשאל לעולם.
    assert(plan.length <= 22, `${plan.length} שאלות לזוג עם עסק, נכס וחשבון`);
    equal(plan.filter(e => e.subjectRole === 'couple' && e.prompt.input.kind === 'who').length, 7);
    assert(!plan.some(e => ['business.assetDocs', 'sales.transaction', 'sales.docs'].includes(e.itemKey)), 'שאלת המשך לפני שאלת הפתיחה');
    const don = plan.filter(e => e.itemKey === 'donations.given');
    equal(don.length, 1);
    equal(don[0].subjectRole, 'couple');
    assert(don[0].prompt.input.kind === 'who' && don[0].prompt.input.spouseName === 'מיכל', 'שמות בני הזוג בשאלה');
    // מעסיקים בכרטיס ⇒ אין «עבדת כשכיר?», רק אישור הרשימה
    assert(!plan.some(e => e.itemKey === 'salary.worked'), 'נשאל «עבדת כשכיר» למרות שהמעסיקים בכרטיס');
    // תואר/שחרור/יישוב בלי נתון בכרטיס — לא נשאלים כאישור; במקומם שאלה אחת על שינוי שמזכה
    assert(!plan.some(e => ['household.degree', 'household.release'].includes(e.itemKey)), 'נשאל על תואר בלי נתון בכרטיס');
    equal(plan.filter(e => e.itemKey === 'household.creditChanges').length, 1);
    // תשובה «מיכל» → עובדה «כן» למיכל ו«לא» לנועה
    const ask = { id: 'w', clientId: 'c1', taxYear: 2026, stepId: 's', parentStepId: 'p', itemKey: 'donations.given', subjectRole: 'couple' as const, prompt: don[0].prompt, state: 'published' as const, createdAt: TODAY };
    const r = answerToFacts(ask, { kind: 'who', value: 'spouse' }, ctx, TODAY);
    equal(r.facts.map(f => `${f.subjectRole}:${f.answer}`).join(','), 'client:no,spouse:value');
    // השאלה לזוג מסומנת «נשלח» אצל שני האנשים — לא נשאלת שוב
    const after = pic({ client: married, asks: [ask] });
    equal(['client', 'spouse'].map(r2 => st(after, 'donations.given', r2)?.state).join(','), 'asked,asked');
  }),
  test('רכוש קבוע ועסקאות הון נאספים כבר עכשיו (לא נדחים לשלב 4)', () => {
    const p = pic({ client: married, purpose: 'estimate' });
    equal(st(p, 'business.assetsChanged', 'client', 'b1')?.state, 'missing');
    equal(st(p, 'sales.sold', 'client')?.state, 'missing');
    // 16.10.2026 · מסמכי העסקה — בדוח (בהערכה אין מסמכים); פרטי העסקה — כבר בהערכה
    const withSale = pic({ client: married, purpose: 'estimate', facts: [fact({ itemKey: 'sales.sold', status: 'pending' })] });
    equal(st(withSale, 'sales.transaction', 'client', 'new')?.state, 'missing');
    assert(!st(withSale, 'sales.docs', 'client', 'new'), 'מסמך בהערכה');
    equal(st(pic({ client: married, purpose: 'annual', facts: [fact({ itemKey: 'sales.sold', status: 'pending' })] }), 'sales.docs', 'client', 'new')?.state, 'missing');
    assert(ITEM_BY_KEY['savings.selfDeposits'].calcBlockedBy === 'pen.age50Cap', 'גיל 50 חוסם חישוב, לא איסוף');
  }),

  // ── 11.10.2026: מידע ישן בכרטיס לא מסתיר שינוי חדש ──
  test('כרטיס בלי תואר/שחרור/יישוב: נשאלת שאלה אחת על שינוי שמזכה, לכל אדם', () => {
    const p = pic({ client: married });
    equal(st(p, 'household.degree', 'client'), undefined);
    assert(p.toAsk.some(s => s.item.key === 'household.creditChanges' && s.subjectRole === 'client'), 'נשאל על הלקוח');
    assert(p.toAsk.some(s => s.item.key === 'household.creditChanges' && s.subjectRole === 'spouse'), 'נשאל על בת הזוג');
  }),
  test('תואר ישן בכרטיס (לפני 5 שנים ויותר) אינו סוגר את השאלה — אולי יש תואר חדש', () => {
    const p = pic({ client: client({ hasAcademicDegree: true, academicDegreeYear: 2015 } as Partial<Client>) });
    assert(p.toAsk.some(s => s.item.key === 'household.creditChanges'), 'נשאל');
  }),
  test('כרטיס עדכני (תואר ושחרור בשנים האחרונות, יישוב רשום): לא שואלים', () => {
    const p = pic({ client: client({ hasAcademicDegree: true, academicDegreeYear: 2024, completedIdf: true, idfReleaseYear: 2022, qualifyingSettlementId: 's1' } as Partial<Client>) });
    equal(st(p, 'household.creditChanges', 'client'), undefined);
    equal(st(p, 'household.degree', 'client')?.state, 'fromCard');
  }),
  test('«כן» שאושר והכרטיס עדיין ריק ⇒ פעולה למשרד לעדכן את הכרטיס; «לא» — בלי פעולה', () => {
    const yes = pic({ client: client(), facts: [fact({ itemKey: 'household.creditChanges' })] });
    const row = yes.officeTodo.find(s => s.item.key === 'household.creditChanges');
    assert(!!row?.officeAction && row.officeAction.includes('לעדכן את הכרטיס'), 'פעולה למשרד');
    const no = pic({ client: client(), facts: [fact({ itemKey: 'household.creditChanges', answer: 'no', value: false })] });
    equal(no.officeTodo.some(s => s.item.key === 'household.creditChanges'), false);
    equal(no.toAsk.some(s => s.item.key === 'household.creditChanges'), false);
  }),

  // ── 230 · הצהרת הון: לפי יום הצהרה, ראשונה מול המשך ──
  test('הצהרת הון: רק שאלות הון; «מאז ההצהרה הקודמת» רק בהמשך', () => {
    const w = (declKind: 'first' | 'followup') => pic({ client: married, purpose: 'wealth', taxYear: 2025, asOfDate: '2025-12-31', declKind, today: '2026-02-01' });
    const first = w('first'), next = w('followup');
    assert(first.statuses.every(x => x.item.key.startsWith('wealth.')), 'אין שאלות 1301 בהצהרת הון');
    assert(!first.statuses.some(x => x.item.key.startsWith('wealth.since.')), 'בראשונה אין «מאז»');
    assert(next.statuses.some(x => x.item.key === 'wealth.since.sources'), 'בהמשך שואלים על כסף שהתקבל');
    assert(next.statuses.some(x => x.item.key === 'wealth.prevDeclaration'), 'בהמשך המשרד מייבא את הקודמת');
    assert(!pic({ client: married }).statuses.some(x => x.item.key.startsWith('wealth.')), 'הערכת מס לא שואלת שאלות הון');
  }),
  test('הצהרת הון: עובדה נחשבת רק כשהיא ליום ההצהרה הזה', () => {
    const cash = (periodTo: string) => fact({ itemKey: 'wealth.cash', taxYear: 2025, subjectRole: 'couple', periodKind: 'as_of', periodTo, answer: 'value', value: 3000, basis: 'declared' });
    const at = (facts: YearFact[]) => st(pic({ client: married, purpose: 'wealth', taxYear: 2025, asOfDate: '2025-12-31', facts, today: '2026-02-01' }), 'wealth.cash');
    assert(at([cash('2021-12-31')])?.state !== 'known', 'מזומן מההצהרה הקודמת אינו המזומן היום');
    equal(at([cash('2025-12-31')])?.state, 'known');
  }),
  test('הצהרת הון: אישור יתרות זמין רק מהיום שאחרי יום ההצהרה; מסמכי נכס — כבר עכשיו', () => {
    const p = pic({ client: married, purpose: 'wealth', taxYear: 2025, asOfDate: '2025-12-31', today: '2025-12-20' });
    const certs = st(p, 'wealth.bank.certs')!;
    equal(certs.state, 'notYetAvailable');
    equal(certs.requestableFrom, '2026-01-01');
    const after = pic({ client: married, purpose: 'wealth', taxYear: 2025, asOfDate: '2025-12-31', today: '2026-01-05' });
    equal(st(after, 'wealth.bank.certs')?.state, 'missing');
  }),
  test('הצהרת המשך: הניסוח «מאז ההצהרה הקודמת», עם מה שהוצהר ותאריך ההצהרה', () => {
    const p = pic({ client: married, purpose: 'wealth', taxYear: 2025, asOfDate: '2025-12-31', declKind: 'followup', today: '2026-02-01' });
    const s1 = st(p, 'wealth.loansGiven.has', 'client')!;
    const ctx = { client: married, taxYear: 2025, purpose: 'wealth' as const, asOfDate: '2025-12-31', declKind: 'followup' as const, previousByArea: { wLoansGiven: '20,000 ₪' } };
    const pr = promptFor(s1, ctx);
    assert(pr.title.includes('מאז ההצהרה הקודמת'), pr.title);
    assert((pr.why ?? '').includes('בהצהרה הקודמת: 20,000 ₪') && (pr.why ?? '').includes('31.12.2025'), pr.why ?? '');
    const prFirst = promptFor(s1, { ...ctx, declKind: 'first' });
    assert(!prFirst.title.includes('מאז ההצהרה הקודמת') && !(prFirst.why ?? '').includes('בהצהרה הקודמת'), prFirst.title);
  }),
  test('הצהרת הון: דירה שאינה מושכרת נכללת (כל הנכסים), ולא נשאלת שאלת «יש לכם נדל״ן?»', () => {
    const c = client({ properties: [{ id: 'p9', address: 'הגפן 3', city: 'חיפה', isRented: false }] as Client['properties'] });
    const p = pic({ client: c, purpose: 'wealth', taxYear: 2025, asOfDate: '2025-12-31', today: '2026-02-01' });
    assert(p.statuses.some(x => x.item.key === 'wealth.realEstate.list'), 'הנכס מהכרטיס לאישור');
    assert(!p.toAsk.some(x => x.item.key === 'wealth.realEstate.has'), 'לא שואלים מחדש');
    const list = promptFor(st(p, 'wealth.realEstate.list')!, { client: c, taxYear: 2025, purpose: 'wealth', asOfDate: '2025-12-31' });
    assert(list.input.kind === 'confirm' && list.input.lines.some(l => l.includes('הגפן 3')), JSON.stringify(list.input));
    const hh = promptFor(st(pic({ client: married, purpose: 'wealth', taxYear: 2025, asOfDate: '2025-12-31', today: '2026-02-01' }), 'wealth.household')!, { client: married, taxYear: 2025, purpose: 'wealth' });
    assert(hh.input.kind === 'confirm' && hh.input.lines.some(l => l.includes('מיכל')) && hh.input.lines.some(l => l.includes('דנה')), JSON.stringify(hh.input));
  }),
];

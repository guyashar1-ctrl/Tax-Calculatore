// ─── סבב האיסוף 13.10.2026: תשובה מובנית ← תיק, עבודות מס, ומסמך מכמה תמונות ──────────────────────────
// ‼ מה נעול כאן:
//   · אישור תשובה מובנית מציע עדכון לתיק עם תמונת המצב שהלקוח ראה (סתירה ⇒ לא נדרס, ראה apply_tax_facts).
//   · השמטה אינה מחיקה: ילד/חשבון/מעסיק שלא הופיעו בתשובה — מוצגים, ובלי הכרעה מפורשת לא משתנים.
//     הכרעה: להשאיר / לתקן / נרשם בטעות / לסיים תוקף — ונכנסת לאותה הצעה (הקודם נשמר בהיסטוריה).
//   · אין כפילות: אותו ילד (מזהה, או שם+תאריך) אינו נוסף פעמיים; אותו חשבון (אפסים מובילים) — אותו חשבון.
//   · תחולה: תאריך שהלקוח נתן ← תאריכי הנכס/החשבון; «לא יודע» אינו תאריך.
//   · עבודת מס: «רשמי» רק עם בסיס; הוספה לא דורסת פרט קיים; זהות אחת לעבודה; שורה עם בעיה נעצרת לפני השרת.
//   · מסמך מכמה תמונות: סדר קריא, חלק לכל תמונה, עקיבות; חסר ⇒ אין שליחה.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { cardUpdateFor, periodDatesPatch, recordItems, updatesCard } from '../recordToCard';
import { describeValue } from '../review';
import { applyWorkMeta, deadlineView, dueState, existingFor, metaOf, rowProblems, workKey, type NewWorkRow } from '../workMeta';
import { orderedParts, partsFor, partsManifest, partsMissing, type PartFile } from '../../identity/docParts';

const TODAY = '2026-10-13';
const from = { factId: 'f1', itemKey: 'intake.children', year: 2026 };
const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'נועה', lastName: 'לוי', familyStatus: 'married', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], bankAccounts: [], fieldMeta: {}, ...p,
} as unknown as Client);
const kids = [
  { id: 'k1', firstName: 'אורי', birthDate: '2015-04-02', birthYear: 2015, hasDisability: false },
  { id: 'k2', firstName: 'מאיה', birthDate: '2018-09-10', birthYear: 2018, hasDisability: true, custody: 'joint' },
];
const patchOf = (plan: ReturnType<typeof cardUpdateFor>, key: string) => (plan!.proposals.find(p => p.fieldKey === key)?.newValue as { patch: Record<string, unknown> }).patch[key] as Record<string, unknown>[];

export const TESTS: TestCase[] = [
  test('ילדים: עדכון לפי מזהה, הוספה, בלי כפילות — ושדות שהלקוח לא ראה (נכות, משמורת) נשמרים', () => {
    const c = client({ children: kids as never });
    const plan = cardUpdateFor(c, 'intake.children', { items: [
      { id: 'k1', firstName: 'אורי', birthDate: '2015-04-03' },
      { id: 'k2', firstName: 'מאיה', birthDate: '2018-09-10' },
      { firstName: 'נגה', birthDate: '2025-01-20' },
      { firstName: 'נגה', birthDate: '2025-01-20' },
    ] }, from)!;
    const next = patchOf(plan, 'children');
    equal(next.length, 3, 'נגה נוספה פעם אחת');
    equal(next.find(k => k.id === 'k1')!.birthDate, '2015-04-03');
    equal(next.find(k => k.id === 'k1')!.birthYear, 2015);
    const m = next.find(k => k.id === 'k2')!;
    assert(m.hasDisability === true && m.custody === 'joint', 'שדות שלא נשאלו לא נמחקו');
    equal(plan.omitted.length, 0);
    const old = (plan.proposals[0].oldValue as unknown as { patch: { children: unknown[] } }).patch.children;
    equal(JSON.stringify(old), JSON.stringify(kids), 'תמונת המצב שהלקוח ראה — לבדיקת «הכרטיס השתנה מאז»');
  }),

  test('ילד שהושמט: מוצג, ובלי הכרעה — לא נמחק ולא משתנה', () => {
    const c = client({ children: kids as never });
    const plan = cardUpdateFor(c, 'intake.children', { items: [{ id: 'k1', firstName: 'אורי', birthDate: '2015-04-02' }] }, from)!;
    equal(plan.omitted.length, 1);
    equal(plan.omitted[0].id, 'k2');
    assert(!plan.omitted[0].can.includes('end'), 'ילד אינו «מסתיים בתוקף»');
    equal(plan.proposals.length, 0, 'אין שינוי בתיק בלי הכרעה');
  }),

  test('ילד שהושמט: «להשאיר» — אין שינוי; «נרשם בטעות» — יוצא, והקודם בהיסטוריה; «לתקן» — תאריך ושנת לידה', () => {
    const c = client({ children: kids as never });
    const v = { items: [{ id: 'k1', firstName: 'אורי', birthDate: '2015-04-02' }] };
    equal(cardUpdateFor(c, 'intake.children', v, from, 'couple', { k2: { action: 'keep' } })!.proposals.length, 0);
    const err = cardUpdateFor(c, 'intake.children', v, from, 'couple', { k2: { action: 'error' } })!;
    equal(patchOf(err, 'children').map(k => k.id).join(','), 'k1');
    assert(err.lines.some(l => l.includes('נרשם בטעות') && l.includes('מאיה')), err.lines.join(' | '));
    assert(JSON.stringify((err.proposals[0].oldValue as { patch: unknown }).patch).includes('מאיה'), 'הערך הקודם נשמר בהצעה');
    const fix = cardUpdateFor(c, 'intake.children', v, from, 'couple', { k2: { action: 'fix', patch: { firstName: 'מאיה', birthDate: '2018-08-10' } } })!;
    const m = patchOf(fix, 'children').find(k => k.id === 'k2')!;
    assert(m.birthDate === '2018-08-10' && m.birthYear === 2018 && m.hasDisability === true, JSON.stringify(m));
    // «לסיים תוקף» לילד — לא קיים, ולכן אינו משנה דבר
    equal(cardUpdateFor(c, 'intake.children', v, from, 'couple', { k2: { action: 'end', date: '2026-01-01' } })!.proposals.length, 0);
  }),

  test('«אין ילדים» אינו מוחק ילדים מהתיק — הוא תשובה «לא» שהמשרד בודק', () => {
    equal(cardUpdateFor(client({ children: kids as never }), 'intake.children', null, from), null);
    const v = { items: [] };
    const plan = cardUpdateFor(client({ children: kids as never }), 'intake.children', v, from)!;
    equal(plan.omitted.length, 2, 'רשימה ריקה — שני הילדים להכרעה');
    equal(plan.proposals.length, 0);
  }),

  test('בנק: אפסים מובילים — אותו חשבון; חשבון אחר — נוסף, והקודם מוצג להכרעה (נסגר / טעות / להשאיר)', () => {
    const c = client({ bankAccounts: [{ id: 'b1', bankName: 'בנק לאומי', branchNumber: '902', accountNumber: '0012345', isPrimary: true }] as never });
    const same = cardUpdateFor(c, 'intake.bankAccount', { items: [{ foreign: 'no', bankCode: '10', bankName: 'בנק לאומי', branchCode: '902', accountNumber: '12345', owners: 'client' }] }, from)!;
    equal(patchOf(same, 'bankAccounts').length, 1, 'לא נוסף חשבון שני');
    equal(same.omitted.length, 0);
    const other = cardUpdateFor(c, 'intake.bankAccount', { items: [{ foreign: 'no', bankCode: '12', bankName: 'בנק הפועלים', branchCode: '055', accountNumber: '000777', owners: 'both' }] }, from)!;
    const next = patchOf(other, 'bankAccounts');
    equal(next.length, 2, 'הקודם לא נמחק');
    assert(next.find(b => b.id === 'b1')!.isPrimary === false && next.find(b => b.id !== 'b1')!.isPrimary === true, 'החדש — להחזרים');
    equal(next.find(b => b.id !== 'b1')!.branchNumber, '055', 'אפס מוביל בסניף נשמר');
    equal(other.omitted.map(o => o.id).join(), 'b1');
    assert(other.omitted[0].can.includes('end'), 'חשבון יכול להיסגר');
    const closed = cardUpdateFor(c, 'intake.bankAccount', { items: [{ foreign: 'no', bankCode: '12', bankName: 'בנק הפועלים', branchCode: '055', accountNumber: '000777' }] }, from, 'couple', { b1: { action: 'end', date: '2026-09-30' } })!;
    equal(patchOf(closed, 'bankAccounts').find(b => b.id === 'b1')!.closedAt, '2026-09-30');
    const noDate = cardUpdateFor(c, 'intake.bankAccount', { items: [{ foreign: 'no', bankCode: '12', bankName: 'בנק הפועלים', branchCode: '055', accountNumber: '000777' }] }, from, 'couple', { b1: { action: 'end', date: '' } })!;
    assert(!('closedAt' in patchOf(noDate, 'bankAccounts').find(b => b.id === 'b1')!), 'סיום תוקף בלי תאריך — לא נכתב');
  }),

  test('מעסיק שהושמט — «העבודה הסתיימה» מוסיף תאריך סיום; מעסיק של בן/בת הזוג לא נוגע', () => {
    const c = client({ employers: [
      { id: 'e1', name: 'אינטל', startDate: '2019-01-01' }, { id: 'e2', name: 'וויקס', startDate: '2022-05-01' },
      { id: 'e3', name: 'מכבי', belongsToSpouse: true },
    ] as never });
    const v = { items: [{ id: 'e1', name: 'אינטל', startDate: { date: '2019-01-01', precision: 'year' } }] };
    const plan = cardUpdateFor(c, 'intake.employers', v, { ...from, itemKey: 'intake.employers' }, 'client', { e2: { action: 'end', date: '2026-06-30' } })!;
    equal(plan.omitted.map(o => o.id).join(), 'e2', 'רק מעסיקי הלקוח עצמו');
    const next = patchOf(plan, 'employers');
    equal(next.find(e => e.id === 'e2')!.endDate, '2026-06-30');
    equal(next.length, 3);
    assert(!updatesCard('intake.employerDetails'), 'מעסיק חדש מ«כן» — ב«הוסף לתיק», לא פעמיים');
  }),

  test('כתובת: שדה לכל עמודה, רק מה שהשתנה; ותשובה זהה — אין הצעה', () => {
    const c = client({ city: 'חיפה', address: 'הנשיא 5', zipCode: '' } as never);
    const plan = cardUpdateFor(c, 'intake.address', { items: [{ city: 'חיפה', street: 'מוריה', houseNumber: '12', apartment: '4', zip: '3457101' }] }, from)!;
    equal(plan.proposals.map(p => p.fieldKey).sort().join(), 'address,zipCode');
    equal((plan.proposals.find(p => p.fieldKey === 'address')!.newValue as unknown as { patch: { address: string } }).patch.address, 'מוריה 12 דירה 4');
    equal(cardUpdateFor(c, 'intake.address', { items: [{ city: 'חיפה', street: 'הנשיא', houseNumber: '5' }] }, from)!.proposals.length, 0);
  }),

  test('«משהו השתנה» עם רשומה — אותה רשומה; תצוגה למשרד בשורות ולא כאובייקט', () => {
    const v = { changed: true, record: { items: [{ firstName: 'נגה', birthDate: '2025-01-20' }] }, was: ['אורי'] };
    equal(recordItems(v)!.length, 1);
    const t = describeValue({ answer: 'value', value: v, itemKey: 'intake.children' });
    assert(t.startsWith('השתנה:') && t.includes('נגה') && !t.includes('[object'), t);
    const b = describeValue({ answer: 'value', value: { items: [{ foreign: 'no', bankCode: '12', bankName: 'בנק הפועלים', branchCode: '055', accountNumber: '000777' }] }, itemKey: 'intake.bankAccount' });
    assert(b.includes('סניף 055') && b.includes('000777'), b);
  }),

  test('תחולה ← תאריכי הישות: נכס נרכש/נמכר, חשבון נפתח; «לא יודע» — לא נכתב', () => {
    const c = client({ properties: [{ id: 'p1', address: 'הרצל 1', city: 'חולון' }] as never, investmentAccounts: [{ id: 'a1', institutionName: 'מיטב' }] as never });
    const p = periodDatesPatch(c, 'property', 'p1', { inPeriod: 'part', from: { date: '2025-03-01', precision: 'month' }, to: { date: '2025-11-01', precision: 'approx' } })!;
    assert(p.kind === 'properties' && p.patch.purchaseDate === '2025-03-01' && p.patch.purchasePrecision === 'month' && p.patch.isSold === true && p.patch.soldPrecision === 'approx', JSON.stringify(p));
    const a = periodDatesPatch(c, 'account', 'a1', { inPeriod: 'part', from: { date: '2025-06-01', precision: 'day' } })!;
    assert(a.kind === 'investmentAccounts' && a.patch.openedDate === '2025-06-01' && !('isClosed' in a.patch), JSON.stringify(a));
    equal(periodDatesPatch(c, 'property', 'p1', { inPeriod: 'part', from: { date: '', precision: 'unknown' } }), null);
    equal(periodDatesPatch(c, 'property', 'p1', { inPeriod: 'all' }), null);
    equal(periodDatesPatch(c, 'property', 'zzz', { inPeriod: 'part', from: { date: '2025-03-01', precision: 'day' } }), null, 'ישות שאינה בתיק');
  }),

  test('עבודת מס: «רשמי» רק עם בסיס; בלי בסיס — «נמסר, לא מאומת»', () => {
    const base: NewWorkRow = { clientId: 'c1', kind: 'annual', taxYear: 2025, due: '2026-05-31', source: 'client' };
    const reported = metaOf(base) as { deadline: { status: string } };
    equal(reported.deadline.status, 'reported');
    const v = deadlineView({ stepType: 'annual_return', payload: { work: reported } as never });
    assert(!v.officialDue && v.reportedDue === '2026-05-31' && v.short.includes('לא מאומת'), v.short);
    const verified = metaOf({ ...base, publication: 'הודעת רשות המסים על מועדי הגשה 2025' }) as { deadline: { status: string } };
    equal(verified.deadline.status, 'verified');
    equal(deadlineView({ stepType: 'annual_return', payload: { work: verified } as never }).officialDue, '2026-05-31');
    const bad = applyWorkMeta(undefined, { deadline: { status: 'verified', due: '2026-05-31' } }, 'annual', 'update');
    equal((bad as { error: string }).error, 'evidence_required');
    // הצהרת הון — מועד חי בדרישה (230), לא ב-work; «הכנה» בלי מקור — בלי דרישה
    equal((applyWorkMeta(undefined, { deadline: { status: 'reported', due: '2026-05-31' } }, 'wealth', 'update') as { error: string }).error, 'use_wealth_demand');
    assert(!('demand' in metaOf({ clientId: 'c1', kind: 'wealth', asOfDate: '2025-12-31', source: 'office' })), 'הכנה בלי דרישה — אין דרישה');
  }),

  test('עבודת מס: הוספה חוזרת לא דורסת פרט קיים (נשמר ב-kept); עריכה — כן; createdVia רק פעם אחת', () => {
    const cur = { source: 'letter' as const, internalTarget: '2026-04-01', createdVia: 'tax_file' as const };
    const r = applyWorkMeta(cur, { source: 'client', internalTarget: '2026-04-01', lastAuthorityCheck: { at: '2026-10-01' }, createdVia: 'bulk' }, 'annual', 'create') as { work: { source: string; createdVia: string; lastAuthorityCheck?: { at: string } }; kept: string[] };
    equal(r.work.source, 'letter');
    equal(r.kept.join(), 'source');
    equal(r.work.createdVia, 'tax_file');
    equal(r.work.lastAuthorityCheck?.at, '2026-10-01');
    const u = applyWorkMeta(cur, { source: 'client' }, 'annual', 'update') as { work: { source: string } };
    equal(u.work.source, 'client');
  }),

  test('הוספה מרוכזת: זהות אחת לעבודה, «כבר קיימת» לפני האישור, ושורה עם בעיה נעצרת', () => {
    const steps = [
      { id: 's1', clientId: 'c1', stepType: 'annual_return', status: 'in_progress', payload: { taxYear: 2025 } },
      { id: 's2', clientId: 'c2', stepType: 'annual_return', status: 'completed', payload: { taxYear: 2025 } },
    ] as never;
    equal(existingFor({ clientId: 'c1', kind: 'annual', taxYear: 2025 }, steps), 's1');
    equal(existingFor({ clientId: 'c2', kind: 'annual', taxYear: 2025 }, steps), null, 'עבודה שהושלמה אינה נפתחת מחדש — נוצרת חדשה');
    equal(workKey({ clientId: 'c1', kind: 'annual', taxYear: 2025 }), workKey({ clientId: 'c1', kind: 'annual', taxYear: 2025 }));
    assert(rowProblems({ clientId: 'c1', kind: 'annual', taxYear: 2026 }, TODAY).length > 0, 'שנה שלא הסתיימה');
    assert(rowProblems({ clientId: 'c1', kind: 'wealth', due: '2026-01-01', letterDate: '2026-02-01', asOfDate: '2025-12-31' }, TODAY).includes('המועד מוקדם מתאריך המכתב'), 'מועד לפני המכתב');
    equal(rowProblems({ clientId: 'c1', kind: 'annual', taxYear: 2025 }, TODAY).length, 0);
  }),

  test('מועדים: איחור, מתקרב (21 יום), ובלי מועד — לפי היעד הפנימי; עבודה סגורה — אין התראה', () => {
    const v = (due?: string, target?: string) => deadlineView({ stepType: 'annual_return', payload: { work: { ...(due ? { deadline: { status: 'reported', due } } : {}), ...(target ? { internalTarget: target } : {}) } } as never });
    equal(dueState(v('2026-10-01'), TODAY, true), 'overdue');
    equal(dueState(v('2026-10-30'), TODAY, true), 'soon');
    equal(dueState(v('2027-01-30'), TODAY, true), 'later');
    equal(dueState(v(undefined, '2026-10-20'), TODAY, true), 'soon');
    equal(dueState(v('2026-10-01'), TODAY, false), 'none');
    equal(dueState(v(), TODAY, true), 'none');
  }),

  test('מסמך מכמה תמונות: תעודת זהות — קדמי, אחורי לפי הצורך, ספח בכמה עמודים; סדר קריא ועקיבות', () => {
    const spec = partsFor('idCard');
    const f = (id: string, slot: string): PartFile => ({ id, slot, name: `${id}.jpg`, type: 'image/jpeg', size: 1000 });
    const files = [f('a2', 'appendix'), f('fr', 'front'), f('a1', 'appendix')];
    equal(partsMissing(spec, 'parts', files), null, 'אחורי אינו חובה');
    equal(orderedParts(spec, 'parts', files).map(x => x.id).join(), 'fr,a2,a1', 'קדמי ראשון; בתוך הספח — הסדר של הלקוח');
    const m = partsManifest(spec, 'parts', files);
    assert(m[0].page === 1 && m[0].part === 'צד קדמי' && m[2].part.startsWith('ספח') && m[2].name === 'a1.jpg', JSON.stringify(m));
    assert(partsMissing(spec, 'parts', [f('fr', 'front')])!.includes('ספח'), 'בלי ספח — לא נשלח');
    assert(partsMissing(spec, 'parts', [...files, f('x', 'unassigned')])!.includes('לכל תמונה'), 'תמונה בלי חלק — לא נשלח');
    equal(partsMissing(spec, 'single', [f('one', 'single')]), null, '«קובץ אחד שמכיל הכול»');
    equal(partsFor('vehicleLicense').parts.map(p => p.slot).join(), 'front,back');
    equal(partsFor('form106').parts[0].slot, 'pages');
  }),
];

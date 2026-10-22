// ─── בדיקות: «עבודות» — סקירה בלבד (16.10.2026 · עיצוב מחדש 21.10.2026) ──────────────────────────
// ‼ מה נעול כאן: לשוניות לפי הכדור + איחור בכל לשונית, קבוצות מועד בסדר קבוע, «בוטלו»/«הושלמו» מחוץ לתצוגה,
//   ו«עונת הדוחות» — רק ממה שהנתונים אומרים (הוגש / אצלי / אצל הלקוח / בלי בקשה פתוחה).

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { OnboardingStep } from '../../../types/onboarding';
import type { WorkRow } from '../../taxYear/taxWork';
import type { Obligation } from '../../shaamFiling/model';
import { agoText, closedRows, dueGroupOf, dueRelative, dueShort, groupByDue, lastShaamUpdate, seasonOf, tabCounts, tabRows, toOverview } from '../workOverviewModel';

const TODAY = '2026-10-16';
const row = (id: string, client: string, kind: WorkRow['kind'], bucket: WorkRow['bucket'], payload: Record<string, unknown>, updatedAt = '2026-10-10T00:00:00Z'): WorkRow => ({
  parent: { id, clientId: client, stepType: kind === 'annual' ? 'annual_return' : kind === 'wealth' ? 'wealth_declaration' : 'tax_file_intake',
    status: bucket === 'cancelled' ? 'cancelled' : bucket === 'done' ? 'completed' : 'in_progress', payload, updatedAt } as unknown as OnboardingStep,
  kind, title: String(payload.title ?? id), missing: [], unavailable: 0, drafts: 0, toReview: 0, answered: 0, bucket, next: bucket,
});
const due = (d: string) => ({ work: { deadline: { status: 'verified', due: d } } });
const ROWS = [
  row('a', 'c1', 'annual', 'client', { taxYear: 2025, ...due('2026-12-31') }),        // בהמשך, אצל הלקוח
  row('b', 'c2', 'annual', 'mine', { taxYear: 2025, ...due('2026-10-01') }),          // באיחור 15, אצלי
  row('c', 'c3', 'wealth', 'mine', { asOfDate: '2025-12-31', internalTarget: '2026-10-20' }), // השבוע
  row('d', 'c4', 'annual', 'cancelled', { taxYear: 2024, removal: { reason: 'בטעות' } }),
  row('e', 'c5', 'intake', 'mine', {}),                                                 // בלי מועד
  row('f', 'c6', 'annual', 'client', { taxYear: 2025, ...due('2026-10-10') }),        // באיחור, אצל הלקוח
  row('g', 'c7', 'annual', 'done', { taxYear: 2025 }, '2026-10-12T00:00:00Z'),
  row('h', 'c8', 'annual', 'done', { taxYear: 2024 }, '2026-08-01T00:00:00Z'),        // הושלם מזמן
  row('i', 'c9', 'annual', 'mine', { taxYear: 2025, ...due('2026-11-10') }),          // החודש (25 ימים)
];
const names: Record<string, string> = { c1: 'דוד כהן', c2: 'מיכל לוי', c3: 'אורית', c4: 'נטשה', c5: 'רון', c6: 'שירה', c7: 'גל', c8: 'טל', c9: 'עמית' };
const nameOf = (id: string) => names[id];
const ids = (xs: { stepId: string }[]) => xs.map(x => x.stepId).join();

const ob = (o: Partial<Obligation>): Obligation => ({ id: o.id ?? Math.random().toString(36), kind: 'annual', fileNumber: '1', yearShown: '2025', shaamStatus: 'open', state: 'open', clientId: 'c1', ...o });

export const TESTS: TestCase[] = [
  test('לשוניות: «אצלי» = הכדור אצלי, ואיחור של הלקוח מופיע גם שם', () => {
    const all = toOverview(ROWS, TODAY);
    equal(ids(tabRows(all, { kind: 'all', tab: 'mine' })), 'b,c,e,f,i');
    equal(ids(tabRows(all, { kind: 'all', tab: 'client' })), 'a,b,f');
    equal(ids(tabRows(all, { kind: 'all', tab: 'all' })), 'a,b,c,e,f,i');
    deepEqual(tabCounts(all, { kind: 'all' }), { mine: 4, client: 2, all: 6 });
  }),
  test('קבוצות מועד בסדר קבוע; בתוך קבוצה — הקרוב קודם', () => {
    const all = toOverview(ROWS, TODAY);
    const g = groupByDue(tabRows(all, { kind: 'all', tab: 'all' }));
    equal(g.map(x => `${x.id}:${ids(x.rows)}`).join(' | '), 'overdue:b,f | week:c | month:i | later:a | none:e');
    equal(dueGroupOf({ days: 7 }), 'week');
    equal(dueGroupOf({ days: 8 }), 'month');
    equal(dueGroupOf({ days: 31 }), 'month');
    equal(dueGroupOf({ days: 32 }), 'later');
    equal(dueGroupOf({ days: 0 }), 'week');
  }),
  test('סוג וחיפוש — גם במספרים', () => {
    const all = toOverview(ROWS, TODAY);
    equal(ids(tabRows(all, { kind: 'annual', tab: 'all' })), 'a,b,f,i');
    equal(ids(tabRows(all, { kind: 'all', tab: 'all', q: 'מיכל', nameOf })), 'b');
    deepEqual(tabCounts(all, { kind: 'all', q: 'מיכל', nameOf }), { mine: 1, client: 0, all: 1 });
  }),
  test('הושלמו (30 יום) ובוטלו — מחוץ לתצוגה הראשית', () => {
    const all = toOverview(ROWS, TODAY);
    const c = closedRows(all, { kind: 'all', today: TODAY });
    equal(ids(c.done), 'g');
    equal(ids(c.cancelled), 'd');
    assert(!tabRows(all, { kind: 'all', tab: 'all' }).some(x => x.stepId === 'd' || x.stepId === 'g'), 'לא בתצוגה הראשית');
    assert(all.find(x => x.stepId === 'd')!.dueDate === undefined, 'אין מועד לעבודה שבוטלה');
  }),
  test('מילים קצרות: מועד, יחסי, ומתי עודכן', () => {
    equal(dueShort('2026-10-24', TODAY), '24.10');
    equal(dueShort('2027-01-05', TODAY), '05.01.2027');
    equal(dueRelative(5), 'עוד 5 ימים');
    equal(dueRelative(-6), 'באיחור 6 ימים');
    equal(dueRelative(0), 'היום');
    equal(dueRelative(1), 'מחר');
    equal(agoText('2026-10-16T08:00:00Z', TODAY), 'היום');
    equal(agoText('2026-10-14T08:00:00Z', TODAY), 'לפני יומיים');
    equal(agoText('2026-09-01T08:00:00Z', TODAY), 'ב-01.09.2026');
    equal(lastShaamUpdate([{ uploadedAt: '2026-10-01T00:00:00Z' }, { uploadedAt: '2026-10-14T00:00:00Z' }, { uploadedAt: '2026-10-03T00:00:00Z' }]), '2026-10-14T00:00:00Z');
    equal(lastShaamUpdate([]), undefined);
    const all = toOverview(ROWS, TODAY);
    equal(all.find(x => x.stepId === 'c')!.period, 'ליום 31.12.2025');
    equal(all.find(x => x.stepId === 'e')!.period, 'פרטים קבועים');
    equal(all.find(x => x.stepId === 'b')!.days, -15);
  }),
  test('עונת הדוחות: השנה האחרונה, רק חובות שנספרות, וחלוקה אמיתית', () => {
    const bucket = (id: string) => ({ s1: 'mine', s2: 'client' } as Record<string, WorkRow['bucket']>)[id];
    const OBS = [
      ob({ shaamStatus: 'filed', state: 'filed_per_shaam' }),
      ob({ state: 'history', shaamStatus: 'filed' }),
      ob({ stepId: 's1', stepStatus: 'in_progress' }),
      ob({ stepId: 's2', stepStatus: 'pending' }),
      ob({}),                                                   // בלי בקשה
      ob({ stepId: 's3', stepStatus: 'completed' }),            // הבקשה נסגרה ושע״ם עוד לא — בלי בקשה פתוחה
      ob({ stepId: 's9', stepStatus: 'in_progress' }),          // בקשה פתוחה שאינה ברשימה — «אחר»
      ob({ state: 'needs_review' }), ob({ state: 'dismissed' }), ob({ state: 'context', shaamStatus: 'context' }),
      ob({ required: false }),
      ob({ yearShown: '2024' }),
      ob({ kind: 'wealth', yearShown: '2026' }),
    ];
    const s = seasonOf(OBS, bucket)!;
    equal(s.year, 2025);
    equal(s.total, 7);
    deepEqual(s.counts, { filed: 2, mine: 1, client: 1, noRequest: 2, other: 1 });
    equal(seasonOf([ob({ kind: 'wealth' }), ob({ state: 'needs_review' })], bucket), null, 'בלי חובות דוח שנתי — אין כרטיס');
  }),
];

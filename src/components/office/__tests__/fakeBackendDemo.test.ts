// ─── בדיקות: נתוני ההדגמה (‎?office-app‎) אינם סותרים את עצמם ────────────────
// ‼ הביקורת מצאה: הרצועה של דוד הציגה שלב שקיים רק בגרסה 2 בזמן שהריצה בגרסה 1,
// «2 מחכים לאישורך» מול טיוטה אחת במגש, ומגש «שלח בקשות» של כל לקוח הציג את
// הבקשות של דוד. כאן — שהריצה נבנית מהגרסה שלה, הספירות מהבקשות, וה«מוכן לשליחה»
// של כל לקוח הוא שלו.

import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { clientFlowRuns, demoStageCounts, readyFromNotices } from '../__fakeBackend';

type Row = Record<string, unknown>;
const step = (status: string, ball: string, published: boolean): Row =>
  ({ status, ball, published_at: published ? '2026-09-01T00:00:00Z' : null });

export const TESTS: TestCase[] = [
  test('הריצה של דוד בגרסה 1 — רק השלבים של גרסה 1', () => {
    const runs = (clientFlowRuns('sample-1').runs ?? []) as Row[];
    const onb = runs.find(r => r.flowId === 'flow-onb')!;
    equal(onb.version, 1);
    equal(onb.currentVersion, 2);
    equal(onb.upgradeAvailable, true);
    equal((onb.stages as Row[]).map(s => s.name).join('|'), 'פתיחת התיק');
  }),
  test('ספירות השלב כמו בשרת: טיוטה רק ב«מחכים לאישורך», נעול לא נספר כפתוח', () => {
    const c = demoStageCounts([
      step('waiting_client', 'client', true), step('waiting_client', 'client', true), step('blocked', 'client', true),
      step('pending', 'client', false), step('locked', 'me', true), step('locked', 'me', false),
      step('pending', 'me', true), step('completed', 'me', true), step('cancelled', 'client', true),
    ], 1);
    equal(c.total, 8);
    equal(c.done, 1);
    equal(c.client, 3);
    equal(c.office, 1);
    equal(c.drafts, 1);
    equal(c.awaitingStage, 1);
    equal(c.unannounced, 1);
  }),
  test('קריאת ב״ל «לבד» שלא רצה — נשמרת בריצה עם הסיבה, ומוצגת ברצועה של אותו לקוח', () => {
    const runs = (clientFlowRuns('sample-7').runs ?? []) as Row[];
    const annual = runs.find(r => r.flowId === 'flow-annual')!;
    const actions = ((annual.stages as Row[])[0].actions ?? []) as Row[];
    const read = actions.find(a => a.itemKey === 'btl_read')!;
    equal((read.state as Row).state, 'waiting_office');
    equal((read.ref as Row).actionType, 'btl.sync_file');
    equal(read.mode, 'auto');
  }),
  test('לקוח אחר לא מקבל את הבקשות של דוד — רק את ההודעות שלו', () => {
    const notices: Row[] = [
      { id: 'a', client_id: 'sample-1', kind: 'new', origin: 'auto', status: 'unknown', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:01:00Z' },
      { id: 'b', client_id: 'sample-2', kind: 'new', origin: 'auto', status: 'queued', due_at: '2026-10-04T12:00:00Z', kick_attempts: 0 },
      { id: 'c', client_id: 'sample-3', kind: 'new', origin: 'auto', status: 'unknown', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:01:00Z', kick_attempts: 1 },
    ];
    const r2 = readyFromNotices('sample-2', notices, 'michal@example.com').owner as Row;
    equal((r2.items as Row[]).length, 0);
    equal((r2.queued as Row).noticeId, 'b');
    equal((r2.unknown as Row[]).length, 0);
    const r3 = readyFromNotices('sample-3', notices, 'yossi@example.com').owner as Row;
    equal(r3.queued, null);
    equal((r3.unknown as Row[]).map(u => u.noticeId).join(','), 'c');
    equal((r3.unknown as Row[])[0].retryUntil, '2026-10-02T09:00:00.000Z');
  }),
];

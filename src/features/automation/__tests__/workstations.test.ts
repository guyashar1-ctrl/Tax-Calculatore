// ─── בדיקות: תמונת מחשבי העבודה (203) ─────────────────────────────────────────
// ‼ ארבעה דברים נפרדים — מחשב חי · יכולת · סשן · מחזור חיים. הבדיקות כאן
// מוכיחות שהם לא נדחסים אחד לתוך השני כשיש יותר ממחשב אחד.

import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { workstationPicture, type WorkstationRow } from '../workstations';
import SOURCE from '../../../hooks/shaamReadiness.tsx?raw';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const w = (id: string, seenAgo: number, status: WorkstationRow['status'] = {}, extra: Partial<WorkstationRow> = {}): WorkstationRow =>
  ({ workerId: id, lastSeenAt: ago(seenAgo), status, capabilities: ['shaam', 'btl'], ...extra });

export const TESTS: TestCase[] = [
  test('6 · פעימה ישנה ⇒ המחשב לא נחשב זמין', () => {
    const p = workstationPicture([w('A', 600, { shaam: { connected: true } })], NOW);
    equal(p.noWorkstation, true);
    equal(p.shaamOffline, true);
    equal(p.status.shaam, undefined, 'מצב של מחשב מת אינו מוצג כמצב נוכחי');
  }),

  test('7 · מחשב אחד כבוי ומחשב אחר חי ⇒ האוטומציה זמינה', () => {
    const p = workstationPicture([w('A-guy', 3600, { shaam: { connected: true } }), w('B', 5, { shaam: { connected: false } })], NOW);
    equal(p.noWorkstation, false);
    equal(p.shaamOffline, false);
    equal(p.btlOffline, false);
    equal(p.liveCount, 1);
  }),

  test('8 · מחשב חי + שע״ם לא מחובר ⇒ המחשב זמין, שע״ם דורש התחברות', () => {
    const p = workstationPicture([w('A', 5, { shaam: { connected: false, bootstrapped: false }, btl: { connected: false } })], NOW);
    equal(p.shaamOffline, false, 'אין «מחשב כבוי»');
    equal(p.status.shaam?.connected, false, 'אבל שע״ם לא מחובר');
  }),

  test('9 · שע״ם מחובר במחשב אחד אינו אומר דבר על ב״ל', () => {
    const p = workstationPicture([w('A', 5, { shaam: { connected: true, bootstrapped: true } })], NOW);
    equal(p.status.shaam?.connected, true);
    equal(p.status.btl, undefined);
  }),

  test('כל רשות נלקחת מהמחשב הכי מוכן עבורה — גם כשאלה מחשבים שונים', () => {
    const p = workstationPicture([
      w('A', 5, { shaam: { connected: true, bootstrapped: true }, gmf: { ready: true }, btl: { connected: false } }),
      w('B', 2, { shaam: { connected: false }, btl: { connected: true } }),
    ], NOW);
    equal(p.status.shaam?.connected, true, 'שע״ם מ-A');
    equal(p.status.gmf?.ready, true, 'השכבות של שע״ם באות יחד מאותו מחשב');
    equal(p.status.btl?.connected, true, 'ב״ל מ-B');
  }),

  test('יכולת: מחשב שנרשם לשע״ם בלבד אינו «זמין לב״ל»', () => {
    const p = workstationPicture([w('A', 5, { btl: { connected: true } }, { capabilities: ['shaam'] })], NOW);
    equal(p.shaamOffline, false);
    equal(p.btlOffline, true);
    equal(p.status.btl, undefined);
  }),

  test('מחשב שבוטל אינו נספר גם עם פעימה טרייה', () => {
    const p = workstationPicture([w('A', 5, { shaam: { connected: true } }, { revokedAt: ago(10) })], NOW);
    equal(p.noWorkstation, true);
  }),

  test('13 · שורת עובד ישנה (בלי capabilities) ⇒ נחשבת לשתי הרשויות, כמו קודם', () => {
    const p = workstationPicture([w('legacy', 5, { shaam: { connected: true } }, { capabilities: null })], NOW);
    equal(p.shaamOffline, false);
    equal(p.btlOffline, false);
  }),

  test('מקור · הספק קורא את כל מחשבי העבודה, לא «האחרון»', () => {
    equal(/\.limit\(1\)\.maybeSingle\(\)/.test(SOURCE), false, 'אין יותר limit(1)');
    equal(/workstationPicture\(rows\)/.test(SOURCE), true);
  }),
];

// ─── בדיקות: כתובת עומק שורדת F5 (24.09.2026) ────────────────────────────────
// ‼ הבאג: F5 ב-‎#/request/<id>‎ הציג «הבקשה לא נמצאה» על בקשה קיימת. שני
// גורמים: (1) השליפה רצה לפני שחזור הזהות, קיבלה «אין שורה» מ-RLS, ולא רצה
// שוב; (2) הרשימה הרזה שהגיעה אחריה איפסה את «נשלפה במלואה». הבדיקות כאן
// מריצות את הרצפים עצמם דרך הפונקציות הטהורות שה-hook והמסך משתמשים בהן.

import { test, equal, deepEqual } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import {
  lookupOutcome, resolveFetchedEntity, resolveListedEntity, mergeListKeepingHydrated,
  type EntityResolution,
} from '../routeEntity';
import APP_SOURCE from '../../App.tsx?raw';
import HOOK_SOURCE from '../../hooks/useRepresentationRequests.ts?raw';

type Row = { id: string; full?: boolean };

/** מדמה את useRepresentationRequests במצב lean — אותם כללים, בלי React. */
function simulate() {
  let userId: string | undefined;
  let requests: Row[] = [];
  const hydrated = new Set<string>();
  const lookups: Record<string, Exclude<EntityResolution, 'loading'>> = {};
  return {
    signIn(id: string) { userId = id; },
    /** hydrateRequest: לא רץ בלי משתמש; «אין שורה» נרשם רק מתשובה אמיתית. */
    hydrate(id: string, server: { data: Row | null; error: unknown }) {
      if (!userId || hydrated.has(id)) return 'skipped';
      const outcome = lookupOutcome(server);
      lookups[id] = outcome;
      if (outcome === 'found') {
        hydrated.add(id);
        requests = requests.some(r => r.id === id) ? requests.map(r => r.id === id ? server.data! : r) : [...requests, server.data!];
      }
      return outcome;
    },
    listArrives(list: Row[]) { requests = mergeListKeepingHydrated(requests, list, hydrated); },
    resolution(id: string) {
      return resolveFetchedEntity({ signedIn: !!userId, ready: requests.some(r => r.id === id) && hydrated.has(id), lookup: lookups[id] });
    },
    row(id: string) { return requests.find(r => r.id === id); },
  };
}

const REQ = 'req-845587c2';
const FULL = { data: { id: REQ, full: true }, error: null };

export const TESTS: TestCase[] = [
  test('F5 · לפני שחזור הזהות — טוען, והשליפה לא נשלחת בכלל (לא «לא נמצאה»)', () => {
    const s = simulate();
    equal(s.resolution(REQ), 'loading');
    equal(s.hydrate(REQ, { data: null, error: null }), 'skipped', 'אין שאילתה אנונימית שתחזיר «אין שורה»');
    equal(s.resolution(REQ), 'loading');
  }),

  test('F5 · הזהות שוחזרה ⇒ השליפה רצה ⇒ נמצאה', () => {
    const s = simulate();
    s.hydrate(REQ, { data: null, error: null });
    s.signIn('u1');
    equal(s.resolution(REQ), 'loading', 'לפני התשובה — טוען');
    s.hydrate(REQ, FULL);
    equal(s.resolution(REQ), 'found');
  }),

  test('F5 · הרשימה הרזה מגיעה אחרי השליפה המלאה — הבקשה נשארת נמצאת ומלאה', () => {
    const s = simulate();
    s.signIn('u1');
    s.hydrate(REQ, FULL);
    s.listArrives([{ id: REQ }, { id: 'other' }]);
    equal(s.resolution(REQ), 'found');
    equal(s.row(REQ)?.full, true, 'השורה הרזה לא דרסה את המלאה');
  }),

  test('F5 · הרשימה מגיעה לפני השליפה — טוען עד שהשליפה חוזרת, אז נמצאה', () => {
    const s = simulate();
    s.signIn('u1');
    s.listArrives([{ id: REQ }]);
    equal(s.resolution(REQ), 'loading', 'שורה רזה אינה «נמצאה» — מסך הבדיקה צריך את המלאה');
    s.hydrate(REQ, FULL);
    equal(s.resolution(REQ), 'found');
  }),

  test('ניווט פנימי · הרשימה כבר כאן, לחיצה על בקשה ⇒ נמצאה', () => {
    const s = simulate();
    s.signIn('u1');
    s.listArrives([{ id: REQ }]);
    s.hydrate(REQ, FULL);
    equal(s.resolution(REQ), 'found');
  }),

  test('מזהה שלא קיים (או לא שייך לחשבון) — «לא נמצאה» רק אחרי תשובה שהסתיימה', () => {
    const s = simulate();
    s.signIn('u1');
    equal(s.resolution('nope'), 'loading');
    s.hydrate('nope', { data: null, error: null });
    equal(s.resolution('nope'), 'not_found');
  }),

  test('כשל רשת/שרת — «שגיאה», לא «לא נמצאה»; ניסיון חוזר מצליח', () => {
    const s = simulate();
    s.signIn('u1');
    s.hydrate(REQ, { data: null, error: { message: 'Failed to fetch' } });
    equal(s.resolution(REQ), 'error');
    s.hydrate(REQ, FULL);
    equal(s.resolution(REQ), 'found');
  }),

  test('lookupOutcome', () => {
    equal(lookupOutcome({ data: { id: 'x' }, error: null }), 'found');
    equal(lookupOutcome({ data: null, error: null }), 'not_found');
    equal(lookupOutcome({ data: null, error: { message: 'x' } }), 'error');
  }),

  test('ישות מרשימה (לקוח/הצעה): טוען / נמצא / לא נמצא / שגיאה', () => {
    equal(resolveListedEntity({ signedIn: false, listLoading: false, present: false }), 'loading');
    equal(resolveListedEntity({ signedIn: true, listLoading: true, present: false }), 'loading');
    equal(resolveListedEntity({ signedIn: true, listLoading: false, present: true }), 'found');
    equal(resolveListedEntity({ signedIn: true, listLoading: false, present: false }), 'not_found');
    equal(resolveListedEntity({ signedIn: true, listLoading: false, listError: 'x', present: false }), 'error');
  }),

  test('mergeListKeepingHydrated שומר שורה מלאה שלא ברשימה, ולא נוגע בשאר', () => {
    const prev = [{ id: 'a', full: true }, { id: 'b' }];
    deepEqual(mergeListKeepingHydrated(prev, [{ id: 'b' }, { id: 'c' }], new Set(['a'])),
      [{ id: 'b' }, { id: 'c' }, { id: 'a', full: true }]);
  }),

  // ── מקור: הכללים מחוברים במקום הנכון ────────────────────────────────────
  test('מקור · אין יותר «לא נמצאה» קשיח במסך — רק דרך RouteEntityFallback', () => {
    equal((APP_SOURCE.match(/empty-state-title">הבקשה לא נמצאה/g) ?? []).length, 0);
    equal((APP_SOURCE.match(/empty-state-title">הלקוח לא נמצא/g) ?? []).length, 0);
    equal((APP_SOURCE.match(/state=\{selectedRequestFallback\}/g) ?? []).length, 2, 'בדיקה + מילוי');
  }),

  test('מקור · השליפה תלויה במשתמש, והרשימה לא מאפסת את «נשלפה במלואה» לאותו משתמש', () => {
    equal(/\}, \[lean, userId\]\);/.test(HOOK_SOURCE), true, 'hydrateRequest מתחלפת כשהמשתמש מוכר');
    equal(/if \(!lean \|\| !userId \|\|/.test(HOOK_SOURCE), true);
    equal(/mergeListKeepingHydrated\(prev, list, hydratedRef\.current\)/.test(HOOK_SOURCE), true);
  }),
];

// ‼ נעול: רק 401 של «JWT issued at future» (PGRST303) מקבל ניסיון חוזר — פעם אחת, אחרי המתנה. כל השאר עובר כמו שהוא.
import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { withClockSkewRetry, isIssuedInFuture, CLOCK_SKEW_RETRY_MS } from '../jwtClockSkewRetry';

const FUTURE = JSON.stringify({ code: 'PGRST303', details: null, hint: null, message: 'JWT issued at future' });
const res = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'application/json' } });
const scripted = (...answers: Response[]) => {
  const calls: { input: unknown; init?: RequestInit }[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit) => { calls.push({ input, init }); return answers[Math.min(calls.length - 1, answers.length - 1)]; };
  return { f, calls };
};

export const TESTS: TestCase[] = [
  test('גוף השגיאה שנמדד ב-staging הוא באורך 79 — אותו מקרה בדיוק', () => {
    equal(FUTURE.length, 79);
  }),
  test('«issued at future» ⇒ המתנה וניסיון אחד; התשובה השנייה היא שחוזרת, עם אותו גוף בקשה', async () => {
    const { f, calls } = scripted(res(401, FUTURE), res(200, '[{"id":1}]'));
    const waits: number[] = [];
    const r = await withClockSkewRetry(f, async ms => { waits.push(ms); })('https://x/rest/v1/rpc/a', { method: 'POST', body: '{"p":1}' });
    equal(r.status, 200);
    equal(calls.length, 2);
    equal(JSON.stringify(waits), JSON.stringify([CLOCK_SKEW_RETRY_MS]));
    equal(String(calls[1].init?.body), '{"p":1}');
  }),
  test('נכשל שוב ⇒ לא ניסיון שלישי (אין לולאה)', async () => {
    const { f, calls } = scripted(res(401, FUTURE), res(401, FUTURE));
    const r = await withClockSkewRetry(f, async () => {})('https://x/rest/v1/a');
    equal(r.status, 401);
    equal(calls.length, 2);
  }),
  test('401 אחר (פג תוקף, בלי הרשאה), 403, 500 ו-200 — בלי ניסיון חוזר', async () => {
    for (const r0 of [res(401, JSON.stringify({ code: 'PGRST303', message: 'JWT expired' })), res(401, '{"code":"42501","message":"permission denied"}'), res(401, 'not json'), res(403, FUTURE), res(500, FUTURE), res(200, '[]')]) {
      const { f, calls } = scripted(r0);
      await withClockSkewRetry(f, async () => { throw new Error('לא אמור לחכות'); })('https://x/a');
      equal(calls.length, 1);
    }
  }),
  test('הגוף של התשובה הראשונה עדיין קריא למי שקרא (clone)', async () => {
    const r = res(401, FUTURE);
    assert(await isIssuedInFuture(r), 'זוהה');
    equal((await r.json()).message, 'JWT issued at future');
  }),
  test('גוף מסוג stream — בלי ניסיון חוזר (אי אפשר לשלוח פעמיים)', async () => {
    const { f, calls } = scripted(res(401, FUTURE), res(200, '[]'));
    const r = await withClockSkewRetry(f, async () => {})('https://x/a', { method: 'POST', body: new ReadableStream() });
    equal(r.status, 401);
    equal(calls.length, 1);
  }),
];

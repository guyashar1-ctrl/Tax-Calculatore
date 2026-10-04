// ─── בדיקות: סוג העוסק לא ידוע — מה מחכה לו ואיפה קובעים ────────────────────────
// ‼ מה נעול כאן:
//   · סוג עוסק לא ידוע לעולם לא «רק לעוסק מורשה» / «לא חל» — הוא «סוג העוסק לא ידוע».
//   · השורה במגש: יחיד/רבים, השמות של מה שמחכה, והכפתור «לקביעת סוג העוסק».
//   · נכשל אחרי שנקבע ⇒ «לפתוח את הבקשות שחיכו», והתוצאה רק ממה שהשרת החזיר.
//   · נפתח (resolvedAt) ⇒ אין שורה.
//   · שלב שמחכה לסוג העוסק בשורת המסלול — «מחכה לסוג העוסק», לא «בהמשך».

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { kindHoldRow, kindHoldRetryText, KIND_FIELD_LABEL, KIND_RETRY_LABEL } from '../trayQueue';
import { stageWho, runLine, WAITING_KIND_TEXT, type RunNames } from '../runSummary';
import { SKIP_REASON_TEXT, kindHoldPending, serverErrorText, skipReasonText, type ClientFlowRun, type RunStage } from '../../../features/flows/api';
import { planFor, KIND_UNKNOWN_TEXT } from '../../../features/flows/preview';
import type { FlowDefinition } from '../../../features/flows/types';

const LATIN = /[A-Za-z]/;
const held = (...titles: string[]) => titles.map((t, i) => ({ key: `k${i}`, stepType: 'custom_request', source: 'office' as const, title: t }));

const counts = (p: Partial<RunStage['counts']> = {}): RunStage['counts'] =>
  ({ total: 0, done: 0, client: 0, office: 0, external: 0, unannounced: 0, drafts: 0, awaitingStage: 0, ...p });
const stage = (key: string, state: RunStage['state'], extra: Partial<RunStage> = {}): RunStage =>
  ({ key, name: key === 'a' ? 'איסוף' : 'חיבורים', opens: key === 'a' ? { after: 'start' } : { after: 'stage', stage: 'a' },
     delivery: 'approve', notifyOffice: false, state, counts: counts(), actions: null, ...extra });
const run = (stages: RunStage[]): ClientFlowRun => ({
  id: 'r1', flowId: 'f1', flowName: 'קליטת לקוח', trigger: 'quote_approved', version: 1, currentVersion: 1, upgradeAvailable: false,
  cycleKey: 'e1', status: 'active', startedAt: '2026-09-01T08:00:00Z', stages, suggestions: 0,
});
const names: RunNames = { stage: () => 'איסוף', item: () => 'בקשה', itemStage: () => undefined };

export const TESTS: TestCase[] = [
  test('השורה במגש: יחיד, רבים, ובלי בקשות שמחכות', () => {
    const one = kindHoldRow({ held: held('חיבור פייפרלס לרשות המסים') }, 'דוד')!;
    equal(one.title, 'חסר סוג העוסק — בקשה אחת מחכה לו');
    assert(one.why.includes('דוד'), one.why);
    assert(one.why.startsWith('«חיבור פייפרלס לרשות המסים» נפתחת רק אחרי שיודעים אם דוד עוסק פטור, עוסק מורשה או חברה.'), one.why);
    equal(one.button, KIND_FIELD_LABEL);
    equal(one.failed, false);
    const two = kindHoldRow({ held: held('א', 'ב') }, 'דוד')!;
    equal(two.title, 'חסר סוג העוסק — 2 בקשות מחכות לו');
    assert(two.why.startsWith('«א» ו«ב» נפתחות רק אחרי'), two.why);
    const many = kindHoldRow({ held: held('א', 'ב', 'ג', 'ד', 'ה') }, 'דוד')!;
    assert(many.why.startsWith('«א», «ב», «ג» ועוד 2 נפתחות'), many.why);
    const none = kindHoldRow({ held: [] }, 'דוד')!;
    equal(none.title, 'חסר סוג העוסק של דוד');
    for (const r of [one, two, many, none]) assert(!LATIN.test(r.title + r.why + r.button), r.title + r.why);
  }),

  test('נפתח — אין שורה; נכשל אחרי שנקבע — «לפתוח את הבקשות שחיכו»', () => {
    equal(kindHoldRow(null, 'דוד'), null);
    equal(kindHoldRow({ held: held('א'), resolvedAt: '2026-10-03T10:00:00Z' }, 'דוד'), null);
    assert(kindHoldPending({ held: [] }) && !kindHoldPending({ resolvedAt: 'x' }) && !kindHoldPending(null), 'ממתינה = בלי resolvedAt');
    const f = kindHoldRow({ held: held('א'), failedAt: '2026-10-03T10:00:00Z' }, 'דוד')!;
    equal(f.failed, true);
    equal(f.button, KIND_RETRY_LABEL);
    equal(f.title, 'סוג העוסק נקבע, אבל הבקשות שחיכו לו לא נפתחו');
    assert(!LATIN.test(f.title + f.why), f.why);
  }),

  test('«לפתוח את הבקשות שחיכו» — רק מה שהשרת אמר', () => {
    const err = (c?: string) => serverErrorText(c, 'הבקשות עדיין לא נפתחו — אפשר לנסות שוב');
    equal(kindHoldRetryText({ ok: true, created: 1 }, err).text, 'נפתחה בקשה אחת שחיכתה לסוג העוסק — היא ברשימה.');
    equal(kindHoldRetryText({ ok: true, created: 3 }, err).text, 'נפתחו 3 בקשות שחיכו לסוג העוסק — הן ברשימה.');
    assert(kindHoldRetryText({ ok: true, created: 0, notApplicable: 2 }, err).text.includes('לא נפתח דבר'), 'אף אחת לא מתאימה');
    const e = kindHoldRetryText({ ok: false, error: 'kind_unknown' }, err);
    equal(e.err, true);
    assert(e.text.includes('«פרטי הנישום»') && !LATIN.test(e.text), e.text);
    assert(!LATIN.test(kindHoldRetryText({ ok: false, error: 'request_failed' }, err).text), 'אין תשובה — בעברית');
  }),

  test('סיבת דילוג kind_unknown ותצוגת ההפעלה — «סוג העוסק לא ידוע», לא «רק לעוסק מורשה»', () => {
    assert(SKIP_REASON_TEXT.kind_unknown.startsWith('סוג העוסק לא ידוע'), SKIP_REASON_TEXT.kind_unknown);
    assert(skipReasonText('kind_unknown').includes('בתיק המס'), 'איפה קובעים');
    const def: FlowDefinition = { stages: [
      { key: 'a', name: 'איסוף', opens: { after: 'start' }, delivery: 'approve', items: [
        { key: 'x', ref: { kind: 'template', templateId: 't' }, when: { kinds: ['licensed_dealer', 'company'] } },
        { key: 'y', ref: { kind: 'template', templateId: 't' } },
      ] },
      { key: 'b', name: 'מע״מ', opens: { after: 'stage', stage: 'a' }, delivery: 'approve', when: { kinds: ['licensed_dealer'] }, items: [
        { key: 'z', ref: { kind: 'template', templateId: 't' } },
      ] },
    ] };
    const plan = planFor(def, 'manual', { kind: null }, () => 'בקשה');
    const x = plan[0].items.find(i => i.key === 'x')!;
    equal(x.applies, false);
    equal(x.why, KIND_UNKNOWN_TEXT);
    equal(x.kindUnknown, true);
    equal(plan[0].items.find(i => i.key === 'y')!.applies, true, 'מה שלא תלוי בסוג — נפתח');
    equal(plan[1].applies, false);
    equal(plan[1].why, KIND_UNKNOWN_TEXT);
    equal(plan[1].kindUnknown, true);
    equal(plan[1].items[0].why, KIND_UNKNOWN_TEXT);
    // סוג ידוע ולא מתאים — הסיבה הרגילה, לא «לא ידוע».
    const known = planFor(def, 'manual', { kind: 'exempt_dealer' }, () => 'בקשה');
    equal(known[1].why, 'רק לעוסק מורשה');
    equal(known[1].kindUnknown, false);
  }),

  test('שורת המסלול: שלב שמחכה לסוג העוסק — «מחכה לסוג העוסק», וסימן בשורה', () => {
    const waiting = stage('b', 'waiting', { waitingKind: true });
    equal(stageWho(waiting, 'דוד'), WAITING_KIND_TEXT);
    equal(stageWho(stage('b', 'waiting'), 'דוד'), 'בהמשך', 'בלי — כמו קודם');
    const open = runLine(run([stage('a', 'open', { counts: counts({ total: 1, client: 1 }) }), waiting]), 'דוד', names);
    assert(open.marks.some(m => m.full === WAITING_KIND_TEXT), JSON.stringify(open.marks));
    // שום דבר לא פתוח, והבא מחכה לסוג העוסק — זה מה שהשורה אומרת, בכחול (אצלך), בלי סימן כפול.
    const stuck = runLine(run([stage('a', 'done'), waiting]), 'דוד', names);
    equal(stuck.who, WAITING_KIND_TEXT);
    equal(stuck.tone, 'blue');
    assert(!stuck.marks.some(m => m.full === WAITING_KIND_TEXT), 'בלי סימן כפול');
    equal(runLine(run([stage('a', 'done'), stage('b', 'waiting')]), 'דוד', names).who, 'ממתין לשלב הבא');
  }),
];

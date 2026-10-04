// ─── בדיקות: כללי המסלולים באב-הטיפוס ────────────────────────────────────────
// כל בדיקה נועלת כלל אחד מהמסמך docs/DESIGN-LIBRARY-FLOWS-2026-10-02.md.

import { test, equal, includes, excludes } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { DEMO_FLOWS, DEMO_CLIENTS, type Flow, type DemoClient } from '../flowModel';
import {
  createRun, fire, completeItem, officeAction, sendNow, advance, pause, resume, cancel, skipItem,
  addToStage, applyFlowUpdate, setClient, suggestions, addSuggested, previewPlan, waitingSummary,
  portalView, publishPending, DAY, type Run,
} from '../flowEngine';

const onboarding = DEMO_FLOWS.find(f => f.id === 'onboarding')!;
const client = (id: string): DemoClient => structuredClone(DEMO_CLIENTS.find(c => c.id === id)!);
const start = (c: DemoClient, flow: Flow = onboarding): Run => fire(createRun(flow, c), 'quote:q1', 'אישור הצעה');
const lastMail = (run: Run) => run.outbox[run.outbox.length - 1];
const done = (run: Run, ...ks: string[]) => ks.reduce((r, k) => (r.items.find(i => i.key === k)?.actor === 'client' ? completeItem(r, k) : officeAction(r, k, 'ok')), run);

export const TESTS: TestCase[] = [
  test('תנאים: עוסקת פטורה בלי רו״ח קודם — בלי פייפרלס ובלי מעבר; חברה — עם', () => {
    const dana = previewPlan(onboarding, client('c-dana'));
    equal(dana.find(s => s.stage.id === 's4')!.applies, false);
    equal(dana.find(s => s.stage.id === 's6')!.applies, false);
    const alpha = previewPlan(onboarding, client('c-alpha'));
    equal(alpha.find(s => s.stage.id === 's4')!.applies, true);
    equal(alpha.find(s => s.stage.id === 's1')!.items.find(i => i.uid === 'i-tax')!.applies, false, 'שאלון — לא לחברה');
  }),

  test('לכל אדם: נשוי — אישור ב״ל לכל אחד, בשם', () => {
    const plan = previewPlan(onboarding, client('c-cohen'));
    const ni = plan.find(s => s.stage.id === 's3')!.items.find(i => i.uid === 'i-ni')!;
    equal(ni.persons?.join(','), 'דוד,רונית');
  }),

  test('שני שלבים שנפתחים יחד — מייל מרוכז אחד, בלי מייל לכל בקשה', () => {
    let run = start(client('c-alpha'));
    equal(run.outbox.filter(m => m.to === 'owner').length, 0, '«מייל באישורך» — לא יוצא לבד');
    const tray = waitingSummary(run).unsent.map(i => i.stageId);
    includes(tray, 's1');
    includes(tray, 's4');
    run = sendNow(run);
    const mails = run.outbox.filter(m => m.to === 'owner');
    equal(mails.length, 1);
    equal(mails[0].items.length, waitingSummary(start(client('c-alpha'))).unsent.length);
  }),

  test('שליחה חוזרת בלי חדש — לא יוצא מייל נוסף', () => {
    let run = sendNow(start(client('c-alpha')));
    const n = run.outbox.length;
    run = sendNow(run);
    equal(run.outbox.length, n);
    includes(run.log.map(l => l.text), 'אין חדש לשלוח — לא נשלח מייל נוסף');
  }),

  test('אירוע חוזר (אישור ההצעה שוב) — לא פותח מסלול שני ולא שולח שוב', () => {
    const run = start(client('c-dana'));
    const again = fire(run, 'quote:q1', 'אישור הצעה');
    equal(again.items.length, run.items.length);
    equal(again.outbox.length, run.outbox.length);
  }),

  test('פריט שנוסף אחרי המייל — רק הוא, בעדכון; בשלב «לבד» — בסוף היום', () => {
    let run = start(client('c-cohen'));
    run = sendNow(run);
    // שלב 3 («לבד») נפתח אחרי שהייצוג נחתם והפעולות בוצעו
    run = done(run, 's1:i-rep', 's2:i-shaam', 's2:i-btl:client', 's2:i-btl:spouse');
    const firstS3 = run.outbox.filter(m => m.items.some(k => k.startsWith('s3:')));
    equal(firstS3.length, 2, 'מייל לדוד ומייל לרונית — כל אחד עם שלו');
    run = addToStage(run, 's3', { kind: 'library', id: 'withholding' });
    const before = run.outbox.length;
    equal(run.outbox.length, before, 'לא יוצא מיד');
    run = advance(run, 8 * 60);
    const update = lastMail(run);
    equal(update.kind, 'update');
    equal(update.items.length, 1);
  }),

  test('מסמך בשלב «מייל באישורך» — במגש ולא נשלח לבד; במייל — כ«חדש»', () => {
    let run = start(client('c-dana'));
    includes(waitingSummary(run).unsent.map(i => i.key), 's1:i-guide');
    run = sendNow(run);
    includes(lastMail(run).items, 's1:i-guide');
  }),

  test('בלי מייל בכרטיס — «לא נשלח», שום דבר לא נחשב כנמסר', () => {
    let run = start(client('c-dana'));
    run = setClient(run, { email: null });
    run = sendNow(run);
    equal(lastMail(run).status, 'failed');
    equal(waitingSummary(run).unsent.length > 0, true);
    run = setClient(run, { email: 'dana@example.com' });
    run = sendNow(run);
    equal(lastMail(run).status, 'sent');
  }),

  test('פעולה מול רשות — לעולם לא רצה לבד; «לא ידוע» לא מקדם שלב', () => {
    let run = start(client('c-dana'));
    run = completeItem(run, 's1:i-rep');
    const shaam = run.items.find(i => i.key === 's2:i-shaam')!;
    equal(shaam.state, 'waiting_office');
    run = officeAction(run, 's2:i-shaam', 'unknown');
    equal(run.stages.s2.state, 'open');
    equal(run.stages.s3.state, 'waiting');
  }),

  test('עצירה: לא נפתח שלב ולא יוצא מייל; חידוש — מייל מרוכז אחד', () => {
    let run = start(client('c-cohen'));
    run = sendNow(run);
    run = pause(run);
    run = done(run, 's1:i-rep');
    equal(run.stages.s2.state, 'waiting');
    run = resume(run);
    equal(run.stages.s2.state, 'open');
  }),

  test('ביטול: פתוחים יורדים מהדף, שהושלמו נשארים', () => {
    let run = start(client('c-dana'));
    run = completeItem(run, 's1:i-docs');
    run = cancel(run);
    equal(run.items.find(i => i.key === 's1:i-docs')!.state, 'done');
    equal(portalView(run).action.length, 0);
  }),

  test('דילוג ללקוח אחד — לא חוסם את השלב ולא משנה את המסלול', () => {
    let run = start(client('c-dana'));
    run = skipItem(run, 's1:i-tax');
    run = done(run, 's1:i-rep', 's1:i-docs');
    equal(run.stages.s1.state, 'done');
    equal(onboarding.stages[0].items.some(i => i.uid === 'i-tax'), true);
  }),

  test('גרסה חדשה של מסלול — לא חלה לבד; בעדכון מפורש נוסף רק מה שחדש', () => {
    let run = start(client('c-dana'));
    const v2: Flow = structuredClone(onboarding);
    v2.version = 2;
    v2.stages[0].items.push({ uid: 'i-policy', ref: { kind: 'library', id: 'work_policy' } });
    equal(run.items.some(i => i.uid === 'i-policy'), false);
    const { run: up, added } = applyFlowUpdate(run, v2);
    equal(added.length, 1);
    equal(up.items.filter(i => i.uid === 'i-docs').length, 1, 'לא נוצר שוב מה שכבר יש');
  }),

  test('נישואים באמצע — לא מוסיף לבד, רק מציע', () => {
    let run = start(client('c-dana'));
    run = done(run, 's1:i-rep', 's2:i-shaam', 's2:i-btl:client');
    const n = run.items.length;
    run = setClient(run, { spouseName: 'אבי', spouseEmail: 'avi@example.com', facts: { married: true } });
    equal(run.items.length, n);
    const sug = suggestions(run).map(s => s.title);
    includes(sug, 'אישור ייפוי הכוח בביטוח לאומי — אבי');
    const s = suggestions(run).find(x => x.only === 'spouse')!;
    run = addSuggested(run, s.stageId, s.uid, s.only);
    equal(run.items.length, n + 1);
  }),

  test('בקשה שכבר פתוחה אצל הלקוח — מצורפת, לא נפתחת שנייה', () => {
    const run = fire(createRun(onboarding, client('c-dana'), [{ libId: 'tax_status', state: 'open', title: 'עדכון סטטוס מס', when: '28.9' }]), 'quote:q1', 'אישור הצעה');
    const tax = run.items.filter(i => i.uid === 'i-tax');
    equal(tax.length, 1);
    equal(tax[0].reused, 'attached');
    excludes(waitingSummary(run).unsent.map(i => i.key), 's1:i-tax');
  }),

  test('תזכורת: אחת לנמען, רק על מה שעוד פתוח, ועד פעמיים', () => {
    let run = sendNow(start(client('c-dana')));
    run = completeItem(run, 's1:i-docs');
    run = advance(run, 5 * DAY);
    const rem = run.outbox.filter(m => m.kind === 'reminder');
    equal(rem.length, 1);
    excludes(rem[0].items, 's1:i-docs');
    run = advance(run, 30 * DAY);
    equal(run.outbox.filter(m => m.kind === 'reminder').length, 2);
  }),

  test('«הכול באישורך» — לא מופיע בדף עד שאתה מאשר', () => {
    const flow: Flow = structuredClone(onboarding);
    flow.stages[0].delivery = 'me_first';
    let run = start(client('c-dana'), flow);
    equal(portalView(run).action.length, 0);
    run = publishPending(run);
    equal(portalView(run).action.length > 0, true);
  }),

  test('הדף של הבעלים מציג גם את בקשת בן/בת הזוג, והמייל שלה הולך אליה', () => {
    let run = sendNow(start(client('c-cohen')));
    run = done(run, 's1:i-rep', 's2:i-shaam', 's2:i-btl:client', 's2:i-btl:spouse');
    includes(portalView(run).action.map(i => i.title), 'אישור ייפוי הכוח בביטוח לאומי — רונית');
    const toRonit = run.outbox.filter(m => m.to === 'spouse');
    equal(toRonit.length, 1);
    equal(toRonit[0].address, 'ronit@example.com');
  }),
];

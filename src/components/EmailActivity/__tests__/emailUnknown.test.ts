// ─── בדיקות: «לא ידוע אם יצא» במיילים שאינם הודעה ללקוח, והתראות הקליטה ──────
// ‼ מה נעול כאן:
//   · תשובת ספק הדואר מסווגת במקום אחד (postResend): רשת/5xx/2xx בלי מזהה = לא ידוע,
//     דחייה ודאית = נכשל. אף שולח לא קורא לספק בלי הסיווג, ואין יותר resend_unreachable.
//   · unknown במסך: כתום, «לא ידוע אם יצא», עם הסיבה והצעד הבטוח — לעולם לא «נכשל»,
//     ולא נספר ב«נכשלו».
//   · תזכורות הייצוג לא משחררות את התביעה על unknown; התזכורת לאזור האישי מזכירה את המדריך.
//   · דף הרו"ח הקודם מעלה רק לשלב החומרים של המכתב (או לכלל הישן כשהמסד ישן).
//   · שתי התראות הקליטה החדשות: בקטלוג, בקבוצה «תהליך הקליטה», דלוקות, עם מייל בעברית.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';
import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  postResend, unknownOutcomeReply, isUnknownOutcome, UNKNOWN_OUTCOME, UNKNOWN_OUTCOME_TEXT,
} from '../../../../supabase/functions/_shared/resendResult';
import {
  ACCOUNTANT_NOTIFICATIONS, NOTIFICATION_BY_KIND, isNotificationEnabled, quotedTitles,
  requestNotCreatedText, kindHoldReleaseFailedText,
} from '../../../../supabase/functions/_shared/accountantNotifications';
import {
  EMAIL_STATUS_LABEL, EMAIL_STATUS_STYLE, FAILED_EMAIL_STATUSES, emailRowState, unknownEmailCause,
  unknownSendText, sendErrorView, isUnknownSendReply, isUnknownNotificationError,
  failedNotificationsHeadline, isFailedEmailStatus, type EmailStatus,
} from '../../../types/emailActivity';

const ROOT = process.cwd();
const FN = (name: string) => join(ROOT, 'supabase/functions', name, 'index.ts');
const LATIN = /[A-Za-z]/;

/** פונקציה טהורה מתוך קובץ Deno (שאי אפשר לייבא ב-Node) — מהודרת ומורצת כמו שהיא. */
function loadFn<T>(file: string, name: string): T {
  const ts = createRequire(join(ROOT, 'package.json'))('typescript') as typeof TS;
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let decl: TS.FunctionDeclaration | undefined;
  sf.forEachChild(n => { if (ts.isFunctionDeclaration(n) && n.name?.text === name) decl = n; });
  if (!decl) throw new Error(`${name} לא נמצאה ב-${file}`);
  const js = ts.transpileModule(decl.getText(sf), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(`${js}\nreturn ${name};`)() as T;
}

const fakeResponse = (status: number, body: unknown, badJson = false) => ({
  status,
  json: async () => { if (badJson) throw new Error('not json'); return body; },
});

/** כל השולחים שבאחריות הסבב הזה — אף אחד מהם לא קורא לספק בלי הסיווג. */
const SENDERS = [
  'send-step-email', 'send-onboarding-email', 'send-quotation-email', 'send-release-email',
  'send-apply-link-email', 'send-charge-payment-request-email', 'notify-accountant',
  'representation-reminders', 'quotation-reminders',
];

export const TESTS: TestCase[] = [
  // ── הסיווג ───────────────────────────────────────────────────────────────
  test('postResend: 200 עם מזהה ⇒ נשלח', async () => {
    const c = await postResend(async () => fakeResponse(200, { id: 're_1' }));
    deepEqual(c.result, { outcome: 'sent', id: 're_1' });
    equal(c.status, 200);
  }),
  test('postResend: חיבור שנפל ⇒ לא ידוע (לא חריגה)', async () => {
    const c = await postResend(async () => { throw new Error('connection reset'); });
    equal(c.result.outcome, 'unknown');
    equal(c.status, null);
    assert(c.result.outcome === 'unknown' && c.result.reason.startsWith('network: '), JSON.stringify(c.result));
  }),
  test('postResend: 5xx / 2xx בלי מזהה / גוף שאינו JSON ⇒ לא ידוע', async () => {
    equal((await postResend(async () => fakeResponse(502, { message: 'bad gateway' }))).result.outcome, 'unknown');
    equal((await postResend(async () => fakeResponse(200, {}))).result.outcome, 'unknown');
    equal((await postResend(async () => fakeResponse(200, null, true))).result.outcome, 'unknown');
    const arr = await postResend(async () => fakeResponse(500, ['x']));
    deepEqual(arr.body, {}, 'גוף שאינו אובייקט ⇒ {}');
  }),
  test('postResend: דחייה ודאית (422/401/429) ⇒ נכשל', async () => {
    equal((await postResend(async () => fakeResponse(422, { name: 'validation_error' }))).result.outcome, 'failed');
    equal((await postResend(async () => fakeResponse(429, {}))).result.outcome, 'failed');
  }),
  test('unknownOutcomeReply: הקוד, משפט בעברית בלי אנגלית, והסיבה הגולמית רק ב-reason', () => {
    const r = unknownOutcomeReply('network: connection reset by peer', true);
    equal(r.ok, false);
    equal(r.error, UNKNOWN_OUTCOME);
    equal(r.retrySafe, true);
    equal(r.detail.message, UNKNOWN_OUTCOME_TEXT);
    assert(!LATIN.test(r.detail.message), r.detail.message);
    assert(r.detail.message.includes('לא ידוע'), r.detail.message);
    assert(!r.detail.message.includes('נכשל'), 'לא ידוע אינו נכשל');
    equal(unknownOutcomeReply('x').retrySafe, false);
  }),
  test('isUnknownOutcome / isUnknownSendReply: קוד, משפט, גוף, signing-session; לא על כשל ודאי', () => {
    assert(isUnknownOutcome('unknown_outcome'), 'קוד');
    assert(isUnknownOutcome(UNKNOWN_OUTCOME_TEXT), 'המשפט שהגיע דרך edgeFunctionError');
    assert(isUnknownOutcome({ ok: false, error: 'unknown_outcome' }), 'גוף');
    assert(isUnknownOutcome({ error: 'send_failed', detail: UNKNOWN_OUTCOME_TEXT }), 'signing-session מעביר את המשפט ב-detail');
    assert(isUnknownSendReply('resend_unreachable'), 'קוד ישן של נפילת רשת');
    assert(isUnknownSendReply({ error: 'resend_unreachable' }), 'גוף ישן');
    assert(!isUnknownSendReply('resend_failed'), 'דחייה ודאית');
    assert(!isUnknownSendReply({ error: 'resend_failed', detail: { message: 'x' } }), 'דחייה ודאית בגוף');
    assert(!isUnknownSendReply(null), 'null');
  }),
  test('כל השולחים: הסיווג בכל קריאה לספק, שורת unknown ביומן, ואין יותר resend_unreachable', () => {
    for (const name of SENDERS) {
      const src = readFileSync(FN(name), 'utf8');
      assert(src.includes('postResend('), `${name}: בלי postResend`);
      assert(!/await fetch\(RESEND_EMAILS/.test(src), `${name}: קריאה לספק בלי סיווג`);
      assert(!src.includes('"resend_unreachable"'), `${name}: עדיין מחזיר resend_unreachable`);
      assert(/status: "unknown"/.test(src), `${name}: אין שורת unknown ביומן`);
    }
    for (const name of SENDERS.filter(n => !['notify-accountant', 'representation-reminders', 'quotation-reminders'].includes(n))) {
      assert(readFileSync(FN(name), 'utf8').includes('unknownOutcomeReply('), `${name}: לא מחזיר unknown_outcome`);
    }
  }),
  test('תזכורות הייצוג: על unknown התביעה לא משתחררת (רק על כשל ודאי)', () => {
    const src = readFileSync(FN('representation-reminders'), 'utf8');
    const blocks = src.split('} else if (send.outcome === "unknown") {').slice(1);
    equal(blocks.length, 3, 'שלושת המעקבים');
    for (const b of blocks) {
      const unknownPart = b.slice(0, b.indexOf('} else {'));
      assert(!/release/i.test(unknownPart), 'שחרור תביעה בענף unknown');
      assert(unknownPart.includes('status: "unknown"'), 'שורת היומן');
    }
  }),
  test('תזכורת האזור האישי: בשתי הגרסאות — המדריך המצולם', () => {
    const body = loadFn<(required: boolean) => string>(FN('representation-reminders'), 'portalReminderBody');
    for (const required of [true, false]) {
      const t = body(required);
      assert(t.includes('בדף האישי יש מדריך מצולם, צעד אחר צעד.'), t);
      assert(!LATIN.test(t), t);
    }
    assert(body(true).includes('בלי האישור הייצוג לא ייקלט'), 'חובה — בלי «אפשר לדלג»');
    assert(!body(true).includes('לדלג'), body(true));
    assert(body(false).includes('אפשר גם לדלג'), body(false));
  }),

  // ── המסך ─────────────────────────────────────────────────────────────────
  test('unknown: תווית «לא ידוע אם יצא», כתום, ולא בין «נכשלו»', () => {
    equal(EMAIL_STATUS_LABEL.unknown, 'לא ידוע אם יצא');
    assert(EMAIL_STATUS_STYLE.unknown.dot.includes('warn'), EMAIL_STATUS_STYLE.unknown.dot);
    assert(!EMAIL_STATUS_STYLE.unknown.fg.includes('red'), 'לא אדום');
    assert(!(FAILED_EMAIL_STATUSES as readonly string[]).includes('unknown'), 'unknown ב«נכשלו»');
    equal(isFailedEmailStatus('unknown'), false);
    equal(isFailedEmailStatus('failed'), true);
  }),
  test('emailRowState: unknown — הסיבה והצעד הבטוח, בלי «נכשל» ובלי אנגלית', () => {
    const r = emailRowState({ status: 'unknown' as EmailStatus, error: 'network: connection reset', kind: 'step_reminder' });
    equal(r.tone, 'unknown');
    equal(r.label, 'לא ידוע אם יצא');
    assert(!!r.hint && r.hint.includes('החיבור לספק הדואר נקטע'), String(r.hint));
    assert(!!r.hint && r.hint.includes('לפני ששולחים שוב'), String(r.hint));
    assert(!LATIN.test(String(r.hint)), String(r.hint));
    assert(!String(r.hint).includes('נכשל'), String(r.hint));
  }),
  test('emailRowState: התראה למשרד — לבדוק בתיבת המשרד; נכשל/חזר — אדום כמו קודם', () => {
    const office = emailRowState({ status: 'unknown' as EmailStatus, error: 'http 502', kind: 'notify_poa_signed' });
    assert(String(office.hint).includes('תיבת הדואר של המשרד'), String(office.hint));
    deepEqual(emailRowState({ status: 'failed', error: 'x', kind: 'quotation' }), { tone: 'failed', label: 'השליחה נכשלה' });
    deepEqual(emailRowState({ status: 'bounced', error: 'x', kind: 'quotation' }), { tone: 'failed', label: 'חזר - כתובת שגויה' });
    deepEqual(emailRowState({ status: 'delivered', kind: 'quotation' }), { tone: 'normal' });
  }),
  test('unknownEmailCause: כל סיבה במילים, גם עם הקידומת unknown_outcome', () => {
    equal(unknownEmailCause('network: reset'), 'החיבור לספק הדואר נקטע לפני שהגיעה תשובה');
    equal(unknownEmailCause('unknown_outcome: network: reset'), 'החיבור לספק הדואר נקטע לפני שהגיעה תשובה');
    equal(unknownEmailCause('ok_without_id'), 'ספק הדואר קיבל את המייל, אבל בלי אישור מלא');
    equal(unknownEmailCause('concurrent_idempotent_requests: busy'), 'ספק הדואר עוד טיפל באותו מייל');
    equal(unknownEmailCause('in_flight'), 'ספק הדואר עוד טיפל באותו מייל');
    equal(unknownEmailCause('http 502'), 'ספק הדואר ענה בתקלה, בלי לומר אם המייל יצא');
    equal(unknownEmailCause(undefined), 'ספק הדואר ענה בתקלה, בלי לומר אם המייל יצא');
  }),
  test('unknownSendText: עם מפתח — לחיצה נוספת לא תשלח פעמיים; בלי — לברר קודם', () => {
    const safe = unknownSendText({ retrySafe: true, button: 'שלח ללקוח' });
    assert(safe.includes('«שלח ללקוח»') && safe.includes('לא תשלח אותו פעמיים'), safe);
    const unsafe = unknownSendText({ recipient: 'הלקוח' });
    assert(unsafe.includes('כדאי לברר עם הלקוח') && !unsafe.includes('לחיצה נוספת'), unsafe);
    for (const t of [safe, unsafe]) {
      assert(!LATIN.test(t), t);
      assert(t.startsWith('לא ידוע אם המייל יצא'), t);
      assert(!t.includes('נכשל'), t);
    }
    const again = unknownSendText({ retrySafe: true, what: 'המייל עם ההוראות', again: 'שליחה חוזרת שלו' });
    assert(again.includes('שליחה חוזרת שלו בתוך יממה'), again);
  }),
  test('sendErrorView: unknown_outcome / אנגלית ⇒ כתום; עברית ⇒ אדום כמו שהיא', () => {
    equal(sendErrorView('unknown_outcome').tone, 'unknown');
    equal(sendErrorView(UNKNOWN_OUTCOME_TEXT).tone, 'unknown');
    const en = sendErrorView('Edge Function returned a non-2xx status code');
    equal(en.tone, 'unknown');
    assert(!LATIN.test(en.text), en.text);
    deepEqual(sendErrorView('אין הרשאה'), { tone: 'failed', text: 'אין הרשאה' });
  }),
  test('התראות למשרד: unknown_outcome / in_flight / resend_unreachable = לא ידוע; כותרת נפרדת', () => {
    assert(isUnknownNotificationError('unknown_outcome: http 502'), 'unknown_outcome');
    assert(isUnknownNotificationError('in_flight'), 'in_flight');
    assert(isUnknownNotificationError('resend_unreachable: TypeError'), 'ישן');
    assert(!isUnknownNotificationError('{"statusCode":422,"name":"validation_error"}'), 'דחייה ודאית');
    assert(!isUnknownNotificationError('לא נמצאו הנתונים שההתראה מתייחסת אליהם'), 'עברית');
    equal(failedNotificationsHeadline(1, 0), 'התראה אחת אליך לא נשלחה במייל');
    equal(failedNotificationsHeadline(0, 1), 'לא ידוע אם התראה אחת אליך יצאה במייל');
    equal(failedNotificationsHeadline(2, 3), '2 התראות אליך לא נשלחו במייל · לא ידוע אם 3 התראות אליך יצאו במייל');
  }),

  // ── התראות הקליטה החדשות ─────────────────────────────────────────────────
  test('request_not_created ו-kind_hold_release_failed: בקטלוג, «תהליך הקליטה», דלוקות, בעברית', () => {
    for (const kind of ['request_not_created', 'kind_hold_release_failed']) {
      const def = NOTIFICATION_BY_KIND[kind];
      assert(!!def, `${kind} חסרה בקטלוג`);
      equal(def.group, 'תהליך הקליטה');
      equal(def.defaultOn, true);
      equal(def.audience, undefined, 'אל המשרד');
      assert(!LATIN.test(def.label) && !LATIN.test(def.hint), `${def.label} / ${def.hint}`);
      equal(isNotificationEnabled({}, kind), true);
      equal(isNotificationEnabled({ accountantNotifications: { [kind]: false } }, kind), false);
    }
    equal(ACCOUNTANT_NOTIFICATIONS.filter(n => n.kind === 'request_not_created').length, 1);
  }),
  test('request_not_created: נושא וגוף לאחת, לכמה, ובלי כותרות', () => {
    const one = requestNotCreatedText('דנה כהן', ['שאלון היכרות']);
    equal(one.subject, '⚠️ דנה כהן - בקשה לא נוצרה');
    equal(one.body, 'ההצעה של דנה כהן אושרה, אבל «שאלון היכרות» לא נוצרה. בלשונית «בקשות» בכרטיס הלקוח מופיעה הסיבה, ואפשר ללחוץ «צור שוב» או «אין צורך».');
    const two = requestNotCreatedText('דנה כהן', ['א', 'ב', 'א', '']);
    assert(two.body.includes('2 בקשות לא נוצרו: «א», «ב»'), two.body);
    equal(two.subject, '⚠️ דנה כהן - 2 בקשות לא נוצרו');
    const none = requestNotCreatedText('', null);
    assert(none.body.startsWith('ההצעה של הלקוח אושרה, אבל בקשה שהקליטה'), none.body);
    for (const t of [one, two, none]) assert(!LATIN.test(t.body + t.subject + t.heading), t.body);
  }),
  test('kind_hold_release_failed: מה לא נפתח, שהכרטיס נשמר, ואיזה כפתור', () => {
    const one = kindHoldReleaseFailedText('דנה כהן', ['חיבור פייפרלס לרשות המסים']);
    assert(one.body.includes('«חיבור פייפרלס לרשות המסים», שחיכתה לו, לא נפתחה בגלל תקלה'), one.body);
    assert(one.body.includes('הכרטיס עצמו נשמר'), one.body);
    assert(one.body.includes('«לפתוח את הבקשות שחיכו»'), one.body);
    const many = kindHoldReleaseFailedText('דנה כהן', ['א', 'ב']);
    assert(many.body.includes('2 בקשות שחיכו לו לא נפתחו בגלל תקלה: «א», «ב»'), many.body);
    for (const t of [one, many, kindHoldReleaseFailedText('', [])]) assert(!LATIN.test(t.body + t.subject), t.body);
  }),
  test('quotedTitles: גרשיים, בלי כפילויות וריקים, ותקרה', () => {
    equal(quotedTitles(['א', 'ב', 'ג', 'ד', 'ה', 'ו']), '«א», «ב», «ג», «ד» ועוד 2');
    equal(quotedTitles([' א ', 'א', null, '']), '«א»');
    equal(quotedTitles(undefined), '');
  }),
  test('notify-accountant: יש מייל לשתי ההתראות (אחרת הן נופלות על «לא נמצאו הנתונים»)', () => {
    const src = readFileSync(FN('notify-accountant'), 'utf8');
    assert(src.includes('kind === "request_not_created" || kind === "kind_hold_release_failed"'), 'אין בונה');
    assert(src.includes('requestNotCreatedText(') && src.includes('kindHoldReleaseFailedText('), 'הנוסח לא מהקובץ המשותף');
  }),

  // ── דף הרו"ח הקודם ──────────────────────────────────────────────────────
  test('העלאה מדף השחרור: רק לשלב החומרים של המכתב; מסד ישן ⇒ הכלל הקודם', () => {
    type Verdict = (s: string, h: { data: unknown; error: { code?: string; message?: string } | null }) => string;
    const v = loadFn<Verdict>(FN('portal-upload-document'), 'releaseStepVerdict');
    equal(v('s1', { data: 's1', error: null }), 'ok');
    equal(v('s1', { data: 's2', error: null }), 'wrong_step');
    equal(v('s1', { data: null, error: null }), 'wrong_step', 'למכתב אין שלב חומרים');
    equal(v('s1', { data: null, error: { code: 'PGRST202', message: 'Could not find the function public._release_materials_step' } }), 'fallback');
    equal(v('s1', { data: null, error: { code: '42883', message: 'function does not exist' } }), 'fallback');
    equal(v('s1', { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }), 'lookup_failed');
    const src = readFileSync(FN('portal-upload-document'), 'utf8');
    assert(src.includes('admin.rpc("_release_materials_step", { p_letter_id: rel.id })'), 'הקריאה לפונקציה');
  }),
];

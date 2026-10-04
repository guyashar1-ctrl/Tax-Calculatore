// ─── בדיקות: מה המסך אומר על מייל ללקוח ─────────────────────────────────────
// ‼ מה נעול כאן:
//   · «לא ידוע אם יצא» לעולם לא «לא נשלח» — ומפנה לשורה שבכרטיס הלקוח.
//   · אין תשובה מהשרת (החיבור נפל, שער שלא ענה, קוד לא מוכר) — «לא ידוע», לא «לא נשלח».
//   · logged:false — אין «נרשם ביומן» ואין «מופיע ברשימה»; ואומר מה הלאה ובאיזה כפתור.
//   · in_flight — בעברית בלבד (תשובת ספק הדואר הגולמית לא עוברת), ואינו «לא נשלח דבר».
//     ‼ רק עם noticeId (אותו מייל). בלי — מייל אחר בתנועה: המייל הזה לא נשלח, וזו המתנה (busy).
//   · nothing_to_announce — הכול כבר נמסר: תוצאה תקינה (nothing), לא «לא נשלח דבר» באדום.
//   · «כבר נשלח קודם» אינו «נשלח אל».
//   · תצוגה מקדימה: בלי הודעת מסד נתונים ובלי קוד באנגלית.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  noticeErrorText, noticeSuccessText, noticePreviewErrorText, sendOutcome, sendSummary, errorTextFromBody,
  isDefiniteFailure, isUnknownEmailFailure, retryErrorText, RETRY_OTHER_IN_FLIGHT_TEXT,
  ALREADY_SENT_TEXT, IN_FLIGHT_TEXT, OTHER_IN_FLIGHT_TEXT, SENT_UNLOGGED_TEXT, NO_ANSWER_TEXT,
  NO_ANSWER_RETRY_TEXT, NI_NO_ANSWER_TEXT, EMAIL_NO_ANSWER_TEXT, PREVIEW_FAILED_TEXT, SENT_LOGGED_TEXT,
  NOTHING_LEFT_TITLE, OTHER_BUSY_TITLE,
  type NoticeSendResult,
} from '../noticeText';

const LATIN = /[A-Za-z]/;

/** מה ש-supabase-js / api.ts מחזירים כשאין תשובה אמיתית מהפונקציה. */
const TRANSPORT: NoticeSendResult[] = [
  { ok: false, error: 'Failed to send a request to the Edge Function' },   // FunctionsFetchError
  { ok: false, error: 'Relay Error invoking the Edge Function' },          // FunctionsRelayError
  { ok: false, error: 'Edge Function returned a non-2xx status code' },    // 504/546 בלי JSON
  { ok: false },                                                            // 5xx בלי שדה error
  { ok: false, error: 'TypeError: Cannot read properties of undefined' },  // 500 הכללי בשרת
  {},                                                                       // 2xx בלי גוף
];

export const TESTS: TestCase[] = [
  test('«לא ידוע» לעולם לא «לא נשלח», ומפנה לשורה בכרטיס', () => {
    for (const code of ['unknown', 'unknown_outcome', 'unknown_pending']) {
      const t = noticeErrorText({ ok: false, error: code });
      assert(!/לא נשלח/.test(t), `${code}: ${t}`);
      assert(/לא ידוע/.test(t), `${code}: חסר «לא ידוע» — ${t}`);
      assert(t.includes('«לא ידוע אם יצא המייל»'), `${code}: לא מפנה לשורה שבמגש — ${t}`);
      assert(!LATIN.test(t), `${code}: אותיות לטיניות — ${t}`);
    }
    // הכפתור שבאמת שולח שוב — רק בשורה שבמגש, ולכן הוא נאמר בשמו.
    assert(noticeErrorText({ error: 'unknown' }).includes('«שלח שוב (אותו מייל)»'), 'unknown: שם הכפתור');
  }),

  test('אין תשובה מהשרת — «לא ידוע», לא «המייל לא נשלח» ולא «לא נשלח דבר»', () => {
    equal(sendOutcome(null), 'noanswer');
    equal(sendOutcome(undefined), 'noanswer');
    for (const r of TRANSPORT) {
      equal(sendOutcome(r), 'noanswer', JSON.stringify(r));
      const t = noticeErrorText(r);
      equal(t, NO_ANSWER_TEXT, JSON.stringify(r));
    }
    assert(!/לא נשלח/.test(NO_ANSWER_TEXT), NO_ANSWER_TEXT);
    assert(/לא ידוע אם המייל יצא/.test(NO_ANSWER_TEXT), NO_ANSWER_TEXT);
    assert(!LATIN.test(NO_ANSWER_TEXT), NO_ANSWER_TEXT);
    // «שלח בקשות» מסמן אותו «לא ידוע» — והסיכום לא «לא נשלח דבר».
    assert(sendSummary(['unknown']).title !== 'לא נשלח דבר', 'סיכום');
    // הכפתור שנשאר בחלון — בשמו.
    assert(NO_ANSWER_RETRY_TEXT.includes('«שלח ללקוח»'), NO_ANSWER_RETRY_TEXT);
    for (const t of [NI_NO_ANSWER_TEXT, EMAIL_NO_ANSWER_TEXT]) assert(/לא ידוע/.test(t), t);
    for (const t of [NI_NO_ANSWER_TEXT, EMAIL_NO_ANSWER_TEXT, NO_ANSWER_RETRY_TEXT]) {
      assert(!/לא נשלח/.test(t), t);
      assert(!LATIN.test(t), t);
    }
  }),

  test('«לא נשלח» — רק על קוד שהשרת מחזיר לפני שמשהו יצא', () => {
    for (const code of ['resend_failed', 'lost_claim', 'no client email', 'server_not_updated', 'forbidden', 'unauthorized',
      'items_changed', 'recipient_changed', 'never_sent', 'token_save_failed']) {
      assert(isDefiniteFailure(code), code);
      equal(sendOutcome({ ok: false, error: code }), 'error', code);
      const t = noticeErrorText({ ok: false, error: code });
      assert(!LATIN.test(t), `${code}: ${t}`);
      assert(t !== NO_ANSWER_TEXT, `${code}: אינו «אין תשובה»`);
    }
    // ‼ «אין מה להודיע» — ודאי שלא נשלח בלחיצה הזו, אבל זו תוצאה תקינה (הכול כבר נמסר), לא כשל.
    assert(isDefiniteFailure('nothing_to_announce'), 'nothing_to_announce — לא «לא ידוע»');
    for (const r of TRANSPORT) assert(!isDefiniteFailure(r.error), JSON.stringify(r));
    // קוד שמוכר כסירוב אבל בלי משפט משלו — «לא נשלח», בעברית.
    equal(noticeErrorText({ error: 'bad_kind' }), 'המייל לא נשלח — אפשר לנסות שוב.');
  }),

  test('logged:false — לא «נרשם ביומן», ואומר מה הלאה: «שלח שוב (אותו מייל)» ולא «לשחרר בלי לשלוח…»', () => {
    const t = noticeSuccessText({ ok: true, logged: false });
    assert(!/נרשם ביומן|מופיע ברשימת/.test(t.replace('לא נרשם ביומן', '')), t);
    assert(/לא נרשם ביומן/.test(t), `חסר שהמייל לא נרשם — ${t}`);
    assert(/יצא/.test(t), `חסר שהמייל יצא — ${t}`);
    assert(/נרשם ביומן/.test(noticeSuccessText({ logged: true })), 'logged:true — כן נרשם');
    equal(noticeSuccessText({ logged: true }), SENT_LOGGED_TEXT);
    equal(noticeSuccessText({ alreadySent: true }), ALREADY_SENT_TEXT);
    // ההמשך — אותן מילים כמו בשורה ובכפתורים שבמגש.
    assert(SENT_UNLOGGED_TEXT.includes('«לא ידוע אם יצא המייל»'), 'השורה שתופיע');
    assert(SENT_UNLOGGED_TEXT.includes('בעוד כמה דקות'), 'מתי');
    assert(SENT_UNLOGGED_TEXT.includes('«שלח שוב (אותו מייל)»'), 'הכפתור הנכון');
    assert(SENT_UNLOGGED_TEXT.includes('לא יישלח פעמיים'), 'בלי כפילות');
    assert(SENT_UNLOGGED_TEXT.includes('ולא «לשחרר בלי לשלוח…»'), 'הכפתור שאסור — בשמו בשורה');
    assert(!SENT_UNLOGGED_TEXT.includes('לא נשלח — לשחרר'), 'הכפתור הישן כבר לא קיים');
    assert(!LATIN.test(SENT_UNLOGGED_TEXT), SENT_UNLOGGED_TEXT);
  }),

  test('in_flight עם noticeId — אותו מייל, «מחלון אחר»; עברית בלבד גם כשהשרת צירף אנגלית', () => {
    const body = { error: 'in_flight', detail: { name: 'concurrent_idempotent_requests', message: 'Same idempotency key used concurrently' } };
    const t = errorTextFromBody(body, {}, 'הפעולה נכשלה');
    assert(!LATIN.test(t), `אותיות לטיניות: ${t}`);
    assert(t.includes('מחלון אחר'), t);
    equal(t, IN_FLIGHT_TEXT);
    const n = noticeErrorText({ ok: false, error: 'in_flight', noticeId: 'n1' });
    assert(!LATIN.test(n) && n.includes('מחלון אחר'), n);
    equal(sendOutcome({ ok: false, error: 'in_flight', noticeId: 'n1' }), 'inflight');
  }),

  test('in_flight בלי noticeId — מייל אחר ללקוח בתנועה: המייל הזה לא נשלח, אבל זו המתנה ולא כשל', () => {
    const r = { ok: false, error: 'in_flight' };
    equal(sendOutcome(r), 'busy', 'המתנה — הכפתור נשאר, ובלי אדום');
    const t = noticeErrorText(r);
    equal(t, OTHER_IN_FLIGHT_TEXT);
    assert(t.includes('מייל אחר ללקוח יוצא ממש עכשיו'), t);
    assert(t.includes('המייל הזה לא נשלח'), t);
    assert(t.includes('נסו שוב בעוד רגע'), t);
    assert(!t.includes('מחלון אחר'), `לא «מחלון אחר»: ${t}`);
    assert(!LATIN.test(t), t);
    // «שלח בקשות» מסמן אותו busy — הסיכום: המתנה, לא «לא נשלח דבר».
    const s = sendSummary(['busy']);
    equal(s.tone, 'wait');
    equal(s.title, OTHER_BUSY_TITLE);
    assert(s.title !== 'לא נשלח דבר', s.title);
    assert(!LATIN.test(s.title), s.title);
  }),

  test('nothing_to_announce — הכול כבר נמסר (מחלון אחר / במייל שיצא לבד): לא «לא נשלח דבר» באדום', () => {
    equal(sendOutcome({ ok: false, error: 'nothing_to_announce' }), 'nothing');
    const s = sendSummary(['nothing']);
    equal(s.tone, 'ok');
    equal(s.title, NOTHING_LEFT_TITLE);
    assert(!/לא נשלח דבר/.test(s.title), s.title);
    // ההסבר בעברית מהשרת גובר; בלעדיו — «הכול כבר נמסר».
    assert(/כבר נמסר/.test(noticeErrorText({ ok: false, error: 'nothing_to_announce' })), 'בלי הסבר מהשרת');
    // נשלח מייל אחד ואחר «כבר נמסר» — הכותרת היא מה שיצא.
    equal(sendSummary(['ok', 'nothing']).title, 'מייל אחד נשלח');
  }),

  test('«שלח שוב (אותו מייל)» כשמייל אחר בתנועה — הניסיון לא יצא, אבל המקורי עדיין «לא ידוע»', () => {
    const t = retryErrorText({ ok: false, error: 'in_flight' });
    equal(t, RETRY_OTHER_IN_FLIGHT_TEXT);
    assert(!/לא נשלח/.test(t), t);
    assert(t.includes('מייל אחר ללקוח יוצא ממש עכשיו'), t);
    assert(!LATIN.test(t), t);
    // אותו מייל בתנועה — «מחלון אחר»; אין תשובה — «לא ידוע».
    equal(retryErrorText({ ok: false, error: 'in_flight', noticeId: 'n1' }), IN_FLIGHT_TEXT);
    equal(retryErrorText(null), NO_ANSWER_TEXT);
    equal(retryErrorText({ ok: false, error: 'Failed to send a request to the Edge Function' }), NO_ANSWER_TEXT);
    equal(retryErrorText({ ok: false, error: 'never_sent' }), noticeErrorText({ error: 'never_sent' }));
  }),

  test('מה קרה בשליחה — רק מתשובת השרת', () => {
    equal(sendOutcome({ ok: true, alreadySent: true }), 'already');
    equal(sendOutcome({ ok: true, id: 'x' }), 'sent');
    equal(sendOutcome({ ok: true, logged: true }), 'sent');
    equal(sendOutcome({ ok: true, logged: false }), 'unlogged');
    equal(sendOutcome({ ok: false, error: 'unknown' }), 'unknown');
    equal(sendOutcome({ ok: false, error: 'unknown_outcome' }), 'unknown');
    // «יש מייל קודם שלא ידוע» — הלחיצה הזו לא שלחה דבר; זה סירוב, לא «לא ידוע».
    equal(sendOutcome({ ok: false, error: 'unknown_pending' }), 'error');
    equal(sendOutcome({ ok: false, error: 'resend_failed' }), 'error');
    assert(!ALREADY_SENT_TEXT.includes('נשלח אל'), 'already אינו «נשלח אל»');
  }),

  test('כותרת הסיכום — «לא נשלח דבר» רק כשבאמת', () => {
    assert(sendSummary(['inflight']).title !== 'לא נשלח דבר', 'מחלון אחר');
    assert(sendSummary(['unknown']).title !== 'לא נשלח דבר', 'לא ידוע');
    assert(!/לא נשלח/.test(sendSummary(['unknown']).title), 'לא ידוע אינו «לא נשלח»');
    equal(sendSummary(['err']).title, 'לא נשלח דבר');
    equal(sendSummary(['err']).tone, 'failed');
    equal(sendSummary(['ok', 'err']).title, 'מייל אחד נשלח');
    equal(sendSummary(['ok', 'unlogged']).title, '2 מיילים נשלחו');
    equal(sendSummary(['already']).title, 'לא נשלח מייל חדש — כבר נשלח קודם');
    equal(sendSummary(['unknown', 'already']).tone, 'warn');
    assert(!LATIN.test(sendSummary(['inflight']).title), 'עברית בלבד');
  }),

  test('תצוגה מקדימה של הודעה — בלי הודעת מסד נתונים, בלי קוד באנגלית, ובלי «לא ידוע אם יצא»', () => {
    const db = { ok: false, error: 'server_not_updated', detail: { message: 'Could not find the function public.client_notice_preview(p_client_id, p_kind)' } };
    const t = noticePreviewErrorText(db);
    assert(!LATIN.test(t), `אנגלית: ${t}`);
    assert(t.includes('השרת עוד לא עודכן'), t);
    const f = noticePreviewErrorText({ ok: false, error: 'forbidden' });
    assert(!LATIN.test(f) && f.includes('אין הרשאה'), f);
    // ההסבר בעברית מהשרת (אין מה להודיע) — גובר.
    const nothing = { ok: false, error: 'nothing_to_announce', detail: { message: 'אין כאן משהו חדש שהלקוח עוד לא קיבל עליו מייל.' } };
    equal(noticePreviewErrorText(nothing), nothing.detail.message);
    // אין תשובה / קוד לא מוכר — «לא נבנתה», לא «לא ידוע אם יצא» (תצוגה לא שולחת).
    equal(noticePreviewErrorText(null), PREVIEW_FAILED_TEXT);
    for (const r of TRANSPORT) equal(noticePreviewErrorText(r), PREVIEW_FAILED_TEXT, JSON.stringify(r));
    assert(!/לא ידוע/.test(PREVIEW_FAILED_TEXT) && !LATIN.test(PREVIEW_FAILED_TEXT), PREVIEW_FAILED_TEXT);
  }),

  test('errorTextFromBody — לא מציג הסבר או קוד באנגלית', () => {
    // שאר הקודים — כמו קודם: ההסבר מהשרת, אחר כך הטבלה, אחר כך ברירת המחדל.
    equal(errorTextFromBody({ error: 'x', detail: { message: 'הסבר' } }, { x: 'טבלה' }, 'ברירה'), 'הסבר');
    equal(errorTextFromBody({ error: 'x' }, { x: 'טבלה' }, 'ברירה'), 'טבלה');
    equal(errorTextFromBody(null, {}, 'ברירה'), 'ברירה');
    // הסבר באנגלית (הודעת מסד נתונים) — לא; הטבלה, ואחריה ברירת המחדל.
    equal(errorTextFromBody({ error: 'server_not_updated', detail: { message: 'Could not find the function' } },
      { server_not_updated: 'השרת עוד לא עודכן לגרסה הזו.' }, 'ברירה'), 'השרת עוד לא עודכן לגרסה הזו.');
    equal(errorTextFromBody({ error: 'forbidden' }, {}, 'ברירה'), 'ברירה', 'קוד באנגלית בלי טקסט — לא מוצג');
    equal(errorTextFromBody({ error: 'weird', detail: { message: 'Something broke' } }, {}, 'ברירה'), 'ברירה');
  }),

  test('מייל שאינו הודעה (הוראות ב"ל): מתי «לא ידוע אם יצא»', () => {
    const table = { resend_failed: 'שרת המייל דחה את השליחה.' };
    assert(isUnknownEmailFailure(null, null, table), 'אין גוף');
    assert(isUnknownEmailFailure({}, 504, table), 'גוף בלי קוד');
    assert(isUnknownEmailFailure({ error: 'TypeError: x' }, 500, table), '500 בלי קוד מוכר');
    assert(!isUnknownEmailFailure({ error: 'resend_failed' }, 502, table), 'הספק דחה — ודאי');
    assert(!isUnknownEmailFailure({ error: 'ni_subject_cancelled' }, 409, table), '4xx — השרת סירב לפני השליחה');
    assert(!isUnknownEmailFailure({ error: 'in_flight' }, 409, table), 'in_flight — מטופל לחוד');
  }),
];

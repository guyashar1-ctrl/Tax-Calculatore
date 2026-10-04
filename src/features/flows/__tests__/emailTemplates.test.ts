// ─── בדיקות: נוסחי המייל לדף האישי, ומה עושים עם תשובות השרת והספק ──────────
// ‼ מה נעול כאן:
//   · מייל ראשון ומייל המשך — שני מפתחות נוסח (savedTemplateKey); נוסח שנשמר
//     למייל הראשון לא דורס את המיילים שאחריו.
//   · «הקישור לדף» כשיש מה שממתין ללקוח לא אומר «אין צורך בפעולה».
//   · תצוגה מקדימה של «חדש» בלי פריטים — נעצרת (previewGuard), כמו התפיסה בשרת.
//   · כשל רישום אחרי שליחה מוצלחת — ניסיון אחד נוסף, ו«נרשם» רק עם ok:true.
//   · 409 מהספק: «בתנועה» ⇒ לא מסמנים נשלח; «המפתח כבר שימש» ⇒ שורה ביומן.
//   · הטקסט למסך על 409 — בעברית, בלי טקסט הספק.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  baseTemplateFor, emailTemplateTitle, eventOfTemplateKey, placeholdersForKey, PROCESS_OPEN_LATER,
  REQUEST_UPDATE_TEMPLATE_KEYS, renderTemplate, savedTemplateKey, STATUS_UPDATE_WITH_ACTIONS, templateForKey,
  templateUses,
} from '../../../../supabase/functions/_shared/stepTemplates.ts';
import {
  completeWithOneRetry, noticeRecorded, previewGuard, previewGuardText, type RpcReply,
} from '../../../../supabase/functions/_shared/noticeOutcome.ts';
import {
  acctNotificationOn409, inFlightMessage, resendConflictKind,
} from '../../../../supabase/functions/_shared/resendConflict.ts';

const NO_ACTION = /אין צורך בפעולה/;
const LATIN = /[A-Za-z]/;

export const TESTS: TestCase[] = [
  test('savedTemplateKey: מייל ראשון ומייל המשך הם שני מפתחות', () => {
    equal(savedTemplateKey('process_open', true), 'process_open');
    equal(savedTemplateKey('process_open', false), 'process_open_later');
    // מסמכים ותזכורת — מפתח אחד, בלי קשר לראשון/המשך.
    equal(savedTemplateKey('documents_sent', true), 'documents_sent');
    equal(savedTemplateKey('documents_sent', false), 'documents_sent');
    equal(savedTemplateKey('portal_reminder', false), 'portal_reminder');
  }),

  test('savedTemplateKey: «הקישור לדף» עם מה שממתין — מפתח נפרד', () => {
    equal(savedTemplateKey('status_update', false), 'status_update');
    equal(savedTemplateKey('status_update', false, { hasActions: false }), 'status_update');
    equal(savedTemplateKey('status_update', false, { hasActions: true }), 'status_update_actions');
    equal(eventOfTemplateKey('status_update_actions'), 'status_update');
    equal(eventOfTemplateKey('process_open_later'), 'process_open');
  }),

  test('baseTemplateFor: מייל המשך = PROCESS_OPEN_LATER, בלי «תהליך ההצטרפות»', () => {
    const later = baseTemplateFor('process_open', false);
    deepEqual(later, PROCESS_OPEN_LATER);
    assert(!/תהליך ההצטרפות|פתחנו לכם דף/.test(later.subject + later.body), 'מייל המשך לא מדבר על פתיחה');
    const first = baseTemplateFor('process_open', true);
    assert(/תהליך ההצטרפות/.test(first.body), 'המייל הראשון נשאר כמו שהיה');
  }),

  test('status_update עם מה שממתין — בלי «אין צורך בפעולה», עם הרשימה', () => {
    const t = renderTemplate(baseTemplateFor('status_update', false, { hasActions: true }),
      { requestList: '· אישור א', statusList: '' });
    assert(!NO_ACTION.test(t.body), 'כשיש מה שממתין אסור לומר «אין צורך בפעולה»: ' + t.body);
    assert(/אישור א/.test(t.body), 'מה שממתין מופיע בגוף המייל');
    deepEqual(templateForKey('status_update_actions'), STATUS_UPDATE_WITH_ACTIONS);
  }),

  test('status_update בלי מה שממתין — הנוסח «אין צורך בפעולה» נשאר', () => {
    const t = baseTemplateFor('status_update', false, { hasActions: false });
    assert(NO_ACTION.test(t.body), 'הנוסח הרגיל לא השתנה');
  }),

  test('templateForKey מחזיר עותק — עריכה לא דורסת את המקור', () => {
    const a = templateForKey('process_open_later');
    a.subject = 'שונה';
    equal(templateForKey('process_open_later').subject, PROCESS_OPEN_LATER.subject);
  }),

  test('templateUses מזהה שדה בנוסח', () => {
    assert(templateUses('א {{requestList}} ב', 'requestList'), 'שדה רגיל');
    assert(templateUses('{{ statusList }}', 'statusList'), 'שדה עם רווחים');
    assert(!templateUses('בלי שדות', 'requestList'), 'אין שדה');
    // כל השדות שהגרסה החדשה משתמשת בהם — מוצגים כשדות לעריכה.
    for (const v of ['{{requestList}}']) {
      assert(placeholdersForKey('status_update_actions').includes(v), v);
      assert(placeholdersForKey('process_open_later').includes(v), v);
    }
  }),

  test('שמות השורות ב«מיילים» — ייחודיים, ולשתי הגרסאות של process_open', () => {
    const titles = REQUEST_UPDATE_TEMPLATE_KEYS.map(emailTemplateTitle);
    equal(new Set(titles).size, titles.length, 'אין שתי שורות באותו שם');
    equal(emailTemplateTitle('process_open'), 'מייל ראשון: פתחנו לכם דף אישי');
    equal(emailTemplateTitle('process_open_later'), 'בקשות חדשות ללקוח שכבר קיבל מייל');
    assert(REQUEST_UPDATE_TEMPLATE_KEYS.includes('process_open_later'), 'מייל המשך נערך בעמוד');
    assert(REQUEST_UPDATE_TEMPLATE_KEYS.includes('status_update_actions'), 'הקישור לדף עם מה שממתין נערך בעמוד');
  }),

  test('previewGuard: «חדש» בלי פריטים נעצר; «הקישור לדף» לא', () => {
    equal(previewGuard('new', []), 'nothing_to_announce');
    equal(previewGuard('reminder', []), 'nothing_to_announce');
    equal(previewGuard('update', []), null);
    equal(previewGuard('new', [{ stepId: 'a' }]), null);
    assert(!LATIN.test(previewGuardText('new')), 'הטקסט בעברית בלבד');
    assert(/שליחת הקישור לדף במייל/.test(previewGuardText('new')), 'מפנה לפעולה שבתפריט');
  }),

  test('noticeRecorded: «נרשם» רק עם ok:true', () => {
    assert(noticeRecorded({ data: { ok: true }, error: null }), 'ok');
    assert(noticeRecorded({ data: { ok: true, alreadyRecorded: true }, error: null }), 'כבר נרשם');
    assert(!noticeRecorded({ data: { ok: false, error: 'lost_claim' }, error: null }), 'ok:false');
    assert(!noticeRecorded({ data: null, error: null }), 'תשובה ריקה אינה ראיה');
    assert(!noticeRecorded({ data: null, error: { message: 'boom' } }), 'שגיאה');
  }),

  test('completeWithOneRetry: כשל ראשון ⇒ ניסיון אחד נוסף, ולא יותר', async () => {
    const replies: RpcReply[] = [
      { data: null, error: { message: 'deadlock' } },
      { data: { ok: true, alreadyRecorded: true }, error: null },
    ];
    let calls = 0;
    const r = await completeWithOneRetry(async () => replies[calls++]);
    equal(r.logged, true);
    equal(calls, 2);

    let calls2 = 0;
    const r2 = await completeWithOneRetry(async () => { calls2++; return { data: null, error: { message: 'down' } }; });
    equal(r2.logged, false, 'שני כשלים ⇒ לא נרשם');
    equal(calls2, 2, 'לא יותר משני ניסיונות');

    let calls3 = 0;
    const r3 = await completeWithOneRetry(async () => { calls3++; return { data: { ok: true }, error: null }; });
    equal(r3.logged, true);
    equal(calls3, 1, 'הצלחה ראשונה ⇒ בלי ניסיון נוסף');
  }),

  test('409 בהתראה למשרד: «בתנועה» ⇒ לנסות שוב; «המפתח שימש» ⇒ יומן ואז נשלח', () => {
    equal(acctNotificationOn409({ name: 'concurrent_idempotent_requests' }), 'retry_later');
    equal(acctNotificationOn409({ name: 'invalid_idempotent_request' }), 'sent_record_journal');
    equal(acctNotificationOn409({}), 'retry_later', '409 לא מוכר — לא מסמנים נשלח');
    equal(acctNotificationOn409(null), 'retry_later');
    equal(resendConflictKind({ name: 'concurrent_idempotent_requests' }), 'concurrent');
    equal(resendConflictKind({ name: 'invalid_idempotent_request' }), 'key_reused');
  }),

  test('409 במייל ללקוח: טקסט בעברית, בלי טקסט הספק', () => {
    const concurrent = inFlightMessage({ name: 'concurrent_idempotent_requests', message: 'Same idempotency key used concurrently' });
    assert(!LATIN.test(concurrent), 'בלי אנגלית: ' + concurrent);
    assert(/מחלון אחר/.test(concurrent), 'אומר שנשלח מחלון אחר');
    const reused = inFlightMessage({ name: 'invalid_idempotent_request', message: 'Same idempotency key with different payload' });
    assert(!LATIN.test(reused), 'בלי אנגלית: ' + reused);
    assert(!/מחלון אחר/.test(reused), 'מפתח שכבר שימש אינו «חלון אחר»');
  }),
];

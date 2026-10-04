// ─── בדיקות: המייל המרוכז ללקוח — איזה «ראשון», כותרת, כפתור, ופנייה ברבים ─────────
// ‼ מה נעול כאן:
//   · «ברוכים הבאים», «שמחים להתחיל» ונוסח «תהליך ההצטרפות» — רק בקליטה פתוחה שעוד לא יצא
//     בה מייל דף. לקוח ותיק בלי מייל דף (דוח שנתי, בקשה ידנית) — נוסח ההמשך ועוד שורה אחת
//     שמציגה את הדף, תחת «פתחנו לכם דף אישי».
//   · מסמך אחד — ביחיד, בטקסט ובכפתור; כמה — ברבים.
//   · פונים ללקוח ברבים בכל הנוסחים, בכותרות ובכפתור.
//   · השולח (send-process-open-email) גוזר את כל זה מ-noticeWording — לא נוסח שני.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  DOCUMENTS_SENT_ONE, PAGE_INTRO_LINE, PROCESS_OPEN_LATER, REQUEST_UPDATE_TEMPLATE_KEYS, STEP_EMAIL_KINDS, WELCOME_LINE,
  baseTemplateFor, firstPageEmailKind, noticeWording, placeholdersForKey, renderTemplate, templateForKey, withIntroLine,
  type ConsolidatedEvent, type FirstPageEmail,
} from '../../../../supabase/functions/_shared/stepTemplates.ts';

/** פנייה ביחיד («לך», «שלך», «מצידך»…) — מילה שלמה. */
const SINGULAR = /(^|[^א-ת])(לך|שלך|ממך|אותך|עליך|אליך|מצידך|בשבילך)([^א-ת]|$)/;
const ONBOARDING = /תהליך ההצטרפות/;

const word = (event: ConsolidatedEvent, first: FirstPageEmail, documentsCount = 0, hasActions = false) =>
  noticeWording({ event, first, clientFirst: 'דנה', documentsCount, hasActions });

export const TESTS: TestCase[] = [
  test('איזה «ראשון»: קליטה פתוחה ⇒ welcome; לקוח ותיק ⇒ introduce; כבר קיבל ⇒ null', () => {
    equal(firstPageEmailKind(true, true), 'welcome');
    equal(firstPageEmailKind(true, false), 'introduce');
    equal(firstPageEmailKind(false, true), null);
    equal(firstPageEmailKind(false, false), null);
  }),

  test('קליטה, מייל דף ראשון — «ברוכים הבאים», «שמחים להתחיל» ונוסח הקליטה', () => {
    const w = word('process_open', 'welcome');
    equal(w.templateKey, 'process_open');
    equal(w.heading, 'ברוכים הבאים, דנה');
    equal(w.welcomeLine, WELCOME_LINE);
    const r = renderTemplate(w.base, { requestList: '· תלושים', welcomeLine: w.welcomeLine });
    assert(ONBOARDING.test(r.body) && r.body.startsWith('שמחים להתחיל'), r.body);
  }),

  test('לקוח ותיק, מייל דף ראשון — נוסח ההמשך ושורה שמציגה את הדף; בלי «ברוכים הבאים» ובלי «הצטרפות»', () => {
    const w = word('process_open', 'introduce');
    equal(w.templateKey, 'process_open_later');
    equal(w.heading, 'דנה, פתחנו לכם דף אישי');
    equal(w.introLine, PAGE_INTRO_LINE);
    const r = renderTemplate(w.base, { requestList: '· דוח שנתי', welcomeLine: w.welcomeLine });
    const body = withIntroLine(r.body, w.base.body, w);
    assert(body.startsWith(PAGE_INTRO_LINE), 'השורה שמציגה את הדף — בראש הגוף: ' + body);
    equal(body.split(PAGE_INTRO_LINE.trim()).length, 2, 'פעם אחת');
    assert(!ONBOARDING.test(r.subject + body) && !/ברוכים הבאים/.test(w.heading + body), body);
    assert(body.includes('· דוח שנתי'), 'הרשימה');
  }),

  test('השורה שמציגה את הדף — גם בנוסח של המשרד; נוסח עם {{welcomeLine}} מקבל אותה במקום השדה, לא פעמיים', () => {
    const w = word('process_open', 'introduce');
    const own = { subject: 'עוד בקשות', body: 'הוספנו:\n{{requestList}}' };
    const r1 = renderTemplate(own, { requestList: '· א', welcomeLine: w.welcomeLine });
    equal(withIntroLine(r1.body, own.body, w), PAGE_INTRO_LINE + 'הוספנו:\n· א');
    const placed = { subject: 'עוד', body: 'שלום.\n{{welcomeLine}}הוספנו:\n{{requestList}}' };
    const r2 = renderTemplate(placed, { requestList: '· א', welcomeLine: w.welcomeLine });
    equal(withIntroLine(r2.body, placed.body, w), 'שלום.\n' + PAGE_INTRO_LINE + 'הוספנו:\n· א');
    // מייל המשך רגיל — הנוסח של המשרד כמו שהוא
    equal(withIntroLine(r1.body, own.body, word('process_open', null)), r1.body);
  }),

  test('מייל המשך — בלי שורת פתיחה, «יש משהו חדש בדף שלכם»', () => {
    const w = word('process_open', null);
    equal(w.templateKey, 'process_open_later');
    equal(w.welcomeLine, '');
    equal(w.introLine, '');
    equal(w.heading, 'דנה, יש משהו חדש בדף שלכם');
    const r = renderTemplate(w.base, { requestList: '· א', welcomeLine: w.welcomeLine });
    assert(r.body.startsWith('יש בדף האישי שלכם דברים חדשים'), r.body);
    deepEqual(baseTemplateFor('process_open', false), PROCESS_OPEN_LATER);
    // ‼ בלי שדה ריק בנוסח הנערך (חלון השליחה היה מציג [שורת פתיחה] שלא מתמלאת כמעט אף פעם).
    assert(!PROCESS_OPEN_LATER.body.includes('{{welcomeLine}}') && !placeholdersForKey('process_open_later').includes('{{welcomeLine}}'),
      'שורת ההצגה נוספת בשולח, לא כשדה בנוסח');
  }),

  test('שורת פתיחה רק במייל הבקשות — לא במסמכים, בתזכורת או בעדכון', () => {
    for (const ev of ['documents_sent', 'portal_reminder', 'status_update'] as ConsolidatedEvent[]) {
      equal(word(ev, 'welcome', 1).welcomeLine, '', ev);
      equal(word(ev, 'introduce', 1).welcomeLine, '', ev);
      equal(word(ev, 'introduce', 1).introLine, '', ev);
    }
  }),

  test('מסמך אחד ביחיד; כמה — ברבים (טקסט, נושא, כותרת וכפתור)', () => {
    const one = word('documents_sent', null, 1);
    deepEqual(one.base, DOCUMENTS_SENT_ONE);
    const r1 = renderTemplate(one.base, { documentList: '· מדריך', documentsPhrase: one.documentsPhrase });
    equal(r1.subject, 'שלחנו לכם מסמך חדש');
    assert(/המסמך מחכה לכם/.test(r1.body) && !/המסמכים/.test(r1.body), r1.body);
    equal(one.heading, 'דנה, שלחנו לכם מסמך חדש');
    equal(one.ctaLabel, 'לצפייה במסמך בדף האישי');

    const many = word('documents_sent', null, 3);
    deepEqual(many.base, templateForKey('documents_sent'));
    const r3 = renderTemplate(many.base, { documentList: '· א\n· ב\n· ג', documentsPhrase: many.documentsPhrase });
    equal(r3.subject, 'שלחנו לכם 3 מסמכים חדשים');
    assert(/המסמכים מחכים לכם/.test(r3.body), r3.body);
    equal(many.ctaLabel, 'לצפייה במסמכים בדף האישי');
  }),

  test('כותרות שלא השתנו: תזכורת, עדכון, «הקישור לדף»; בלי שם — בלי פסיק', () => {
    equal(word('portal_reminder', null).heading, 'דנה, תזכורת קטנה');
    equal(word('status_update', null).heading, 'עדכון על התהליך, דנה');
    equal(word('status_update', null, 0, true).heading, 'דנה, הנה הקישור לדף שלכם');
    equal(word('status_update', null, 0, true).templateKey, 'status_update_actions');
    equal(noticeWording({ event: 'process_open', first: null, clientFirst: '', documentsCount: 0 }).heading, 'יש משהו חדש בדף שלכם');
    equal(noticeWording({ event: 'process_open', first: 'welcome', clientFirst: ' ', documentsCount: 0 }).heading, 'ברוכים הבאים');
  }),

  test('פונים ללקוח ברבים — בכל נוסח ברירת מחדל, בכותרות ובכפתור', () => {
    const texts: string[] = [];
    for (const k of STEP_EMAIL_KINDS) { const t = templateForKey(k); texts.push(t.subject, t.body); }
    for (const k of REQUEST_UPDATE_TEMPLATE_KEYS) { const t = templateForKey(k); texts.push(t.subject, t.body); }
    texts.push(DOCUMENTS_SENT_ONE.subject, DOCUMENTS_SENT_ONE.body, WELCOME_LINE, PAGE_INTRO_LINE);
    for (const ev of ['process_open', 'documents_sent', 'status_update', 'portal_reminder'] as ConsolidatedEvent[]) {
      for (const first of ['welcome', 'introduce', null] as FirstPageEmail[]) {
        for (const n of [1, 2]) {
          const w = word(ev, first, n, n === 2);
          texts.push(w.heading, w.ctaLabel, w.welcomeLine);
        }
      }
    }
    const bad = texts.filter(t => SINGULAR.test(t));
    deepEqual(bad, [], 'פנייה ביחיד');
  }),

  test('השולח גוזר מ-noticeWording, ומעביר «קליטה פתוחה» מהשרת', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/send-process-open-email/index.ts'), 'utf8');
    assert(/noticeWording\(\{/.test(src) && /firstPageEmailKind\(isFirst, openIntake\)/.test(src), 'ההכרעה במקום אחד');
    assert(/withIntroLine\(filled\.body, merged\.body, wording\)/.test(src), 'שורת ההצגה — גם בנוסח של המשרד');
    assert(/claim\.openIntake/.test(src) && /pv as any\)\?\.openIntake/.test(src), 'מהתפיסה ומהתצוגה');
    assert(!/שלחנו לך |הקישור לדף שלך|בדף שלך|"לדף האישי שלך"/.test(src), 'אין כותרת/כפתור ביחיד בשולח');
    assert(!/"שמחים להתחיל לעבוד יחד/.test(src), 'שורת הפתיחה — מהקבוע, לא עותק');
  }),
];

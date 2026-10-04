// ─── בדיקות: השורה «לא ידוע אם יצא המייל» במגש ────────────────────────────────
// ‼ מה נעול כאן:
//   · אף פעם לא «לא נשלח» כעובדה — לא בשורה, לא בפרטים ולא בחלונות האישור.
//   · הזמן בכותרת ובחלון — מהניסיון הראשון, לא מהאחרון: ניסיון ראשון לפני 23.5 שעות
//     וניסיון אחרון לפני 5 דקות ⇒ החלון סגור, והראשי הוא שחרור (לא «שלח שוב»).
//   · בתוך החלון — «שלח שוב (אותו מייל)» ראשי; שחרור משני, ותמיד מאחורי אישור שמסביר כפילות.
//   · כתובת שהשתנתה ⇒ «לשחרר לכתובת החדשה…», והחלון אומר מאיפה לאן.
//   · שרת ישן בלי השדות החדשים ⇒ המסלול השמרני (שחרור — משני ומאחורי אישור).
//   · בקשה שכבר נסגרה ועדיין בנוסח המקורי — נאמרת בחלון השליחה החוזרת.
//   · תשובות לשליחה חוזרת: לא מעגליות («בשורה…»), ואומרות איזה כפתור עכשיו.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  unknownRowModel, unknownConfirm, trayRetryText, retryErrorText, noticeErrorText,
  UNKNOWN_CAUSE_TEXT, UNKNOWN_CAUSE_FALLBACK, RETRY_SAME_LABEL, RELEASE_ANYWAY_LABEL, RELEASE_AFTER_LABEL,
  RELEASE_NEW_ADDRESS_LABEL, RELEASED_TEXT, RELEASED_NEW_ADDRESS_TEXT, SENT_UNLOGGED_TEXT, IN_FLIGHT_TEXT,
  type UnknownRowModel,
} from '../noticeText';
import type { ReadyUnknownNotice } from '../../../hooks/readyToSendLoader';
import { SEND_MAIL_LABEL } from '../../../components/flows/trayQueue';

const LATIN = /[A-Za-z]/;
const EMAIL = /[\w.+-]+@[\w.-]+/g;
/** טקסט שמשתמש רואה — בלי הכתובות עצמן (הן נתון, לא ניסוח). */
const hebrewOnly = (t: string) => !LATIN.test(t.replace(EMAIL, ''));

const NOW = new Date(2026, 9, 3, 14, 0).getTime();
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const H23 = 23 * 3600_000;

/** הודעה מהשרת החדש — ניסיון ראשון לפני firstH שעות. */
const notice = (firstH: number, over: Partial<ReadyUnknownNotice> = {}): ReadyUnknownNotice => ({
  noticeId: 'n1', kind: 'new', subject: 'בקשות חדשות בדף שלך', items: 2,
  at: ago(firstH), lastTriedAt: ago(firstH), retryUntil: new Date(NOW - firstH * 3600_000 + H23).toISOString(),
  toEmail: 'dana@example.com', recipientChanged: false, origin: 'manual', attempts: 1, cause: 'no_answer',
  itemList: [{ title: 'מסמכים לפתיחת התיק', stillOpen: true }, { title: 'שאלון היכרות', stillOpen: true }],
  ...over,
});

const allTexts = (m: UnknownRowModel) => [m.title, m.why, m.window ?? '', ...m.details, m.primary.label, m.secondary?.label ?? ''];

export const TESTS: TestCase[] = [
  test('לכל סיבה משפט בעברית — ואף אחד אינו «לא נשלח»', () => {
    for (const [k, t] of Object.entries(UNKNOWN_CAUSE_TEXT)) {
      assert(hebrewOnly(t), `${k}: ${t}`);
      assert(!/לא נשלח/.test(t), `${k}: ${t}`);
    }
    const m = unknownRowModel(notice(2, { cause: 'cut_off' }), NOW, 'dana@example.com');
    equal(m.why, `${UNKNOWN_CAUSE_TEXT.cut_off} הבקשות לא סומנו כנמסרו.`);
    // סיבה לא מוכרת — בלי לנחש.
    const odd = unknownRowModel(notice(2, { cause: 'something_new' }), NOW, 'dana@example.com');
    equal(odd.why, `${UNKNOWN_CAUSE_FALLBACK} הבקשות לא סומנו כנמסרו.`);
  }),

  test('בתוך החלון: «שלח שוב (אותו מייל)» ראשי, שחרור משני; עד מתי — מהניסיון הראשון', () => {
    const m = unknownRowModel(notice(2), NOW, 'dana@example.com');
    equal(m.state, 'open');
    equal(m.primary.action, 'retry');
    equal(m.primary.label, RETRY_SAME_LABEL);
    equal(m.secondary?.label, RELEASE_ANYWAY_LABEL);
    assert(m.window!.includes(`«${RETRY_SAME_LABEL}» לא ישלח פעמיים`), m.window!);
    assert(m.window!.startsWith('עד מחר 11:00'), `ניסיון ראשון 12:00 + 23 שעות = מחר 11:00 — ${m.window}`);
    equal(m.title, 'לא ידוע אם יצא המייל מ-12:00');
  }),

  test('ניסיון ראשון לפני 23.5 שעות, אחרון לפני 5 דקות — החלון סגור, והראשי הוא שחרור', () => {
    const u = notice(23.5, { lastTriedAt: ago(5 / 60), attempts: 3 });
    const m = unknownRowModel(u, NOW, 'dana@example.com');
    equal(m.state, 'closed');
    equal(m.primary.action, 'release');
    equal(m.primary.label, RELEASE_AFTER_LABEL);
    equal(m.secondary, null, 'אין «שלח שוב» אחרי החלון');
    // ‼ אחרי החלון שחרור עלול להביא כפילות — ולכן השורה מציעה לברר קודם (בלי מין דקדוקי).
    equal(m.window, 'עברה יממה — ספק הדואר כבר לא יזהה כפילות. כדאי לברר עם הלקוח אם המייל הגיע, לפני השחרור.');
    equal(unknownRowModel(u, NOW, 'dana@example.com', 'דנה').window,
      'עברה יממה — ספק הדואר כבר לא יזהה כפילות. כדאי לברר עם דנה אם המייל הגיע, לפני השחרור.');
    assert(m.title.includes('02.10.26 14:30'), `הכותרת — הניסיון הראשון, לא האחרון: ${m.title}`);
    assert(m.details.some(d => d === 'ניסיונות: 3 · אחרון 13:55'), m.details.join(' | '));
    // החלון נסגר בין הציור ללחיצה — הלחיצה מחשבת מחדש.
    const u2 = notice(22.99);
    equal(unknownRowModel(u2, NOW, 'dana@example.com').state, 'open');
    equal(unknownRowModel(u2, NOW + 60_000, 'dana@example.com').state, 'closed');
  }),

  test('הכתובת השתנתה — «לשחרר לכתובת החדשה…»; גם לפי השרת וגם לפי הכרטיס', () => {
    const byServer = unknownRowModel(notice(2, { recipientChanged: true }), NOW, undefined);
    equal(byServer.state, 'recipient');
    equal(byServer.primary.label, RELEASE_NEW_ADDRESS_LABEL);
    equal(byServer.secondary, null);
    equal(byServer.window, 'הכתובת בכרטיס השתנתה מאז.');
    const byCard = unknownRowModel(notice(2), NOW, 'dana.new@example.com');
    equal(byCard.state, 'recipient');
    equal(unknownRowModel(notice(2), NOW, ' Dana@Example.com ').state, 'open', 'רווחים ואותיות גדולות — אותה כתובת');
    equal(unknownRowModel(notice(2), NOW, undefined).state, 'open', 'כתובת לא ידועה — רק השרת קובע');
    const c = unknownConfirm(byCard, 'release', 'דנה');
    equal(c.kind, 'release_new_address');
    equal(c.confirmLabel, 'לשחרר');
    assert(c.message.includes('dana@example.com') && c.message.includes('dana.new@example.com'), c.message);
    assert(c.message.includes(`«${SEND_MAIL_LABEL}»`), c.message);
    const none = unknownConfirm(unknownRowModel(notice(2), NOW, ''), 'release', 'דנה');
    assert(none.message.includes('אין כתובת מייל'), none.message);
  }),

  test('שרת ישן (בלי השדות החדשים) — המסלול השמרני', () => {
    const legacy: ReadyUnknownNotice = { noticeId: 'n9', at: ago(2), kind: 'new', subject: null, items: 3 };
    const m = unknownRowModel(legacy, NOW, 'dana@example.com');
    equal(m.state, 'unknown_window');
    equal(m.primary.action, 'retry');
    equal(m.secondary?.label, RELEASE_ANYWAY_LABEL, 'שחרור — משני');
    equal(m.window, null, 'לא ממציאים עד מתי');
    equal(m.why, `${UNKNOWN_CAUSE_FALLBACK} הבקשות לא סומנו כנמסרו.`);
    assert(m.details.includes('במייל: 3 פריטים'), m.details.join(' | '));
    const c = unknownConfirm(m, 'release', 'דנה');
    equal(c.tone, 'danger', 'שחרור תמיד מאחורי אישור שמסביר כפילות');
    assert(/פעמיים/.test(c.message), c.message);
    assert(unknownConfirm(m, 'retry', 'דנה').message.includes('יממה'), 'שליחה חוזרת בלי חלון ידוע — אומרת מה קורה אחרי יממה');
    // גם הניסיון האחרון לפני יותר מיממה ⇒ בטוח שהחלון נסגר.
    const old = unknownRowModel({ ...legacy, at: ago(30) }, NOW, 'dana@example.com');
    equal(old.state, 'closed');
    equal(old.primary.label, RELEASE_AFTER_LABEL);
  }),

  test('בקשה שכבר נסגרה ועדיין בנוסח המקורי — נאמרת בחלון השליחה החוזרת', () => {
    const u = notice(2, { itemList: [{ title: 'מסמכים לפתיחת התיק', stillOpen: true }, { title: 'שאלון היכרות', stillOpen: false }] });
    const m = unknownRowModel(u, NOW, 'dana@example.com');
    assert(m.details.includes('במייל: «מסמכים לפתיחת התיק», «שאלון היכרות» (כבר נסגרה)'), m.details.join(' | '));
    const c = unknownConfirm(m, 'retry', 'דנה');
    equal(c.kind, 'retry');
    equal(c.tone, 'normal');
    equal(c.title, 'לשלוח שוב את אותו מייל?');
    equal(c.confirmLabel, 'שלח שוב');
    assert(c.message.includes('בנוסח המקורי מופיעה גם «שאלון היכרות», שכבר נסגרה.'), c.message);
    assert(c.message.includes('ל-dana@example.com'), c.message);
    assert(c.message.includes('ספק הדואר יזהה אותו, לא ישלח שוב'), c.message);
    const two = unknownConfirm(unknownRowModel(notice(2, { itemList: [{ title: 'א', stillOpen: false }, { title: 'ב', stillOpen: false }] }), NOW, 'dana@example.com'), 'retry', 'דנה');
    assert(two.message.includes('מופיעות גם «א», «ב», שכבר נסגרו.'), two.message);
  }),

  test('חלונות השחרור — בתוך החלון ואחריו: מסוכנים, ואומרים שהבקשות עלולות להגיע פעמיים', () => {
    const inW = unknownConfirm(unknownRowModel(notice(2), NOW, 'dana@example.com'), 'release', 'דנה');
    equal(inW.kind, 'release_in_window');
    equal(inW.title, 'לשחרר בלי לבדוק?');
    equal(inW.confirmLabel, 'לשחרר בכל זאת');
    equal(inW.tone, 'danger');
    assert(inW.message.includes('ייתכן שהמייל כבר הגיע לדנה'), inW.message);
    assert(inW.message.includes('יגיעו פעמיים') && inW.message.includes(`«${RETRY_SAME_LABEL}»`), inW.message);
    const after = unknownConfirm(unknownRowModel(notice(30), NOW, 'dana@example.com'), 'release', 'דנה');
    equal(after.kind, 'release_after');
    equal(after.title, 'לשחרר לשליחה מחדש?');
    equal(after.tone, 'danger');
    assert(after.message.includes('הגיע לדנה') && after.message.includes(`«${SEND_MAIL_LABEL}»`) && after.message.includes('פעמיים'), after.message);
    // ‼ אחרי החלון — קודם לברר עם הלקוח, ורק אז לשחרר.
    assert(after.message.includes('כדאי לברר עם דנה קודם'), after.message);
    assert(after.message.indexOf('כדאי לברר') < after.message.indexOf('אחרי השחרור'), 'הבירור לפני מה שקורה בשחרור');
  }),

  test('פרטים: אל, נושא, מה במייל, ניסיונות, ומי הפעיל — בלי «יצא לבד»', () => {
    const m = unknownRowModel(notice(2, { origin: 'auto', attempts: 1 }), NOW, 'dana@example.com');
    equal(m.details[0], 'אל: dana@example.com');
    equal(m.details[1], 'נושא: «בקשות חדשות בדף שלך»');
    assert(!m.details.some(d => d.startsWith('ניסיונות')), 'ניסיון אחד — בלי שורת ניסיונות');
    assert(m.details.includes('השליחה הזו הופעלה לבד, לפי המסלול'), m.details.join(' | '));
    assert(!m.details.some(d => /יצא לבד/.test(d)), 'לא טוען שהמייל יצא');
  }),

  test('אף טקסט בשורה ובחלונות — לא «לא נשלח», ובלי אותיות לטיניות (חוץ מהכתובת)', () => {
    const models = [
      unknownRowModel(notice(2), NOW, 'dana@example.com'),
      unknownRowModel(notice(30), NOW, 'dana@example.com'),
      unknownRowModel(notice(2, { recipientChanged: true }), NOW, 'other@example.com'),
      unknownRowModel({ noticeId: 'x', at: ago(1), kind: 'new', items: 1 }, NOW, undefined),
    ];
    for (const m of models) {
      const texts = [...allTexts(m), ...(['retry', 'release'] as const).map(a => { const c = unknownConfirm(m, a, 'דנה'); return `${c.title} ${c.message} ${c.confirmLabel}`; })];
      for (const t of texts) {
        assert(!/לא נשלח/.test(t), `${m.state}: ${t}`);
        assert(hebrewOnly(t), `${m.state}: אותיות לטיניות — ${t}`);
      }
    }
  }),

  test('תשובה ל«שלח שוב» בשורה: לא מעגלית, ואומרת איזה כפתור עכשיו', () => {
    const u = trayRetryText({ ok: false, error: 'unknown_outcome' });
    assert(!/בשורה/.test(u), `מעגלי: ${u}`);
    assert(/עדיין לא ידוע/.test(u) && !/לא נשלח/.test(u), u);
    const exp = trayRetryText({ ok: false, error: 'retry_expired' });
    assert(exp.includes(`«${RELEASE_AFTER_LABEL}»`), exp);
    assert(!/אפשר לשלוח מחדש/.test(exp), 'השרת לא שחרר — לא «אפשר לשלוח מחדש»');
    assert(trayRetryText({ ok: false, error: 'recipient_changed' }).includes(`«${RELEASE_NEW_ADDRESS_LABEL}»`), 'כתובת');
    assert(trayRetryText({ ok: false, error: 'never_sent' }).includes(`«${SEND_MAIL_LABEL}»`), 'לא יצא — השרת שחרר');
    equal(trayRetryText({ ok: false, error: 'in_flight', noticeId: 'n1' }), IN_FLIGHT_TEXT);
    equal(trayRetryText(null), retryErrorText(null));
    for (const code of ['unknown_outcome', 'retry_expired', 'recipient_changed', 'never_sent', 'not_unknown', 'in_flight']) {
      assert(hebrewOnly(trayRetryText({ ok: false, error: code })), code);
    }
    // ההודעה הכללית (חלון «שלח בקשות») — מפנה לשורה, לכפתור הנכון.
    assert(noticeErrorText({ error: 'retry_expired' }).includes(`«${RELEASE_AFTER_LABEL}»`), 'retry_expired');
    assert(noticeErrorText({ error: 'recipient_changed' }).includes(`«${RELEASE_NEW_ADDRESS_LABEL}»`), 'recipient_changed');
  }),

  test('אחרי שחרור — «שלח מייל…» בשמו במגש; והכפתור הישן «לא נשלח — לשחרר» לא מוזכר בשום מקום', () => {
    assert(RELEASED_TEXT.includes(`«${SEND_MAIL_LABEL}»`), RELEASED_TEXT);
    assert(RELEASED_NEW_ADDRESS_TEXT.includes('לכתובת החדשה'), RELEASED_NEW_ADDRESS_TEXT);
    for (const t of [RELEASED_TEXT, RELEASED_NEW_ADDRESS_TEXT, SENT_UNLOGGED_TEXT]) {
      assert(!t.includes('לא נשלח — לשחרר'), t);
      assert(hebrewOnly(t), t);
    }
  }),
];

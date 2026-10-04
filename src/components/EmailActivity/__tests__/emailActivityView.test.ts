// ─── בדיקות: מייל בלשונית «פעילות», ושדות בנוסח בעברית ─────────────────────────
// ‼ מה נעול כאן:
//   · CLAUDE.md §9 — «נשלח» רק עם ראיה: כותרת השורה נגזרת מהמצב שביומן. לא ידוע אם יצא —
//     כתום, עם הסיבה והצעד הבטוח; נכשל / חזר / סומן כספאם — אדום; אף אחד מהם לא «נשלח».
//   · למי: ללקוח / לבן/בת הזוג / לרו״ח הקודם — מהכתובת שבכרטיס או מסוג המייל; אחרת בלי.
//   · «סומן כספאם» אינו «השליחה נכשלה» (המייל הגיע).
//   · שדות בנוסח ({{requestList}}) מוצגים בעריכה בשם בעברית ([רשימת הבקשות]) וחוזרים לקוד
//     בדיוק — לכל הנוסחים של המערכת.
//   · שם אחד למייל: ביומן כמו בעמוד «מיילים» (emailTemplateTitle), ובלי אנגלית.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  emailActivityView, emailRecipientPhrase, emailRowState, emailTemplateKeyOf, emailKindLabel, emailMessageLabel,
  templateFromLabels, templateToLabels, TEMPLATE_FIELD_LABELS, EMAIL_KIND_LABEL, type EmailStatus,
} from '../../../types/emailActivity';
import {
  emailTemplateTitle, templateForKey, REQUEST_UPDATE_TEMPLATE_KEYS, type SavedTemplateKey,
} from '../../../../supabase/functions/_shared/stepTemplates';

const LATIN = /[A-Za-z]/;
const card = { email: 'david@example.com', spouseEmail: 'michal@example.com' };
const mail = (status: EmailStatus, over: Partial<{ kind: string; toEmail: string; error: string }> = {}) => ({
  status, kind: 'process_open', toEmail: 'david@example.com', error: undefined as string | undefined, ...over,
});

export const TESTS: TestCase[] = [
  test('«נשלח» רק כשספק הדואר קיבל את המייל', () => {
    for (const s of ['sent', 'delivered', 'opened', 'clicked', 'delivery_delayed'] as EmailStatus[]) {
      const v = emailActivityView(mail(s), card);
      equal(v.tone, 'normal', s);
      equal(v.title, 'נשלח מייל ללקוח', s);
      equal(v.hint, undefined, `${s}: בלי שורת הסבר`);
    }
    for (const s of ['unknown', 'failed', 'bounced', 'complained'] as EmailStatus[]) {
      const v = emailActivityView(mail(s, { error: 'network: connection reset' }), card);
      assert(v.tone !== 'normal', s);
      assert(!/^נשלח/.test(v.title), `${s}: ${v.title}`);
      assert(!!v.hint, `${s}: חסר מה עושים`);
      assert(!LATIN.test(v.title + v.hint), `${s}: אנגלית — ${v.title} ${v.hint}`);
    }
  }),

  test('לא ידוע אם יצא — כתום, עם הסיבה והצעד הבטוח; לעולם לא «לא נשלח»', () => {
    const v = emailActivityView(mail('unknown', { error: 'network: connection reset' }), card);
    equal(v.tone, 'unknown');
    equal(v.title, 'לא ידוע אם המייל ללקוח יצא');
    assert(v.hint!.includes('החיבור לספק הדואר נקטע'), v.hint!);
    assert(v.hint!.includes('כדאי לברר'), v.hint!);
    assert(!/לא נשלח|נכשל/.test(v.title + v.hint), v.hint!);
  }),

  test('נכשל / חזר / ספאם — אדום, ואומר מה הלאה', () => {
    const f = emailActivityView(mail('failed', { error: 'validation_error: invalid to' }), card);
    equal(f.tone, 'failed');
    equal(f.title, 'המייל ללקוח לא נשלח');
    const b = emailActivityView(mail('bounced', { toEmail: 'davd@exmple.com' }), card);
    equal(b.tone, 'failed');
    equal(b.title, 'המייל ללקוח חזר — לא הגיע');
    assert(b.hint!.includes('«פרטי נישום»') && b.hint!.includes('ולשלוח שוב'), b.hint!);
    equal(b.fixAddressInTaxFile, true, 'כתובת הלקוח — מתקנים בתיק המס');
    const r = emailActivityView(mail('bounced', { kind: 'release', toEmail: 'prev@old.co.il' }), card);
    assert(!r.hint!.includes('פרטי נישום'), `רו״ח קודם — לא בתיק המס של הלקוח: ${r.hint}`);
    equal(r.fixAddressInTaxFile, undefined, 'כתובת של אחר — לא תיק המס של הלקוח');
    const c = emailActivityView(mail('complained'), card);
    equal(c.title, 'המייל ללקוח סומן כספאם');
  }),

  test('למי — מהכתובת שבכרטיס, או מסוג המייל; אחרת בלי לנחש', () => {
    equal(emailRecipientPhrase({ kind: 'sign', toEmail: 'Michal@Example.com ' }, card), ' לבן/בת הזוג');
    equal(emailRecipientPhrase({ kind: 'sign', toEmail: 'david@example.com' }, card), ' ללקוח');
    equal(emailRecipientPhrase({ kind: 'release', toEmail: 'prev@old.co.il' }, card), ' לרו״ח הקודם');
    // מייל לדף האישי לכתובת קודמת של הלקוח — עדיין ללקוח.
    equal(emailRecipientPhrase({ kind: 'portal_reminder', toEmail: 'old@example.com' }, card), ' ללקוח');
    // מייל לגורם חיצוני / סוג לא מוכר לכתובת אחרת — בלי «ללקוח» («אל:» אומר למי).
    equal(emailRecipientPhrase({ kind: 'step_reminder', toEmail: 'bank@example.com' }, card), '');
    equal(emailActivityView(mail('sent', { kind: 'step_reminder', toEmail: 'bank@example.com' }), card).title, 'נשלח מייל');
    equal(emailActivityView(mail('sent', { kind: 'release', toEmail: 'prev@old.co.il' }), card).title, 'נשלח מייל לרו״ח הקודם');
  }),

  test('«סומן כספאם» אינו «השליחה נכשלה»', () => {
    equal(emailRowState({ status: 'complained', kind: 'quotation' }).label, 'סומן כספאם');
    equal(emailRowState({ status: 'complained', kind: 'quotation' }).tone, 'failed');
    equal(emailRowState({ status: 'failed', kind: 'quotation' }).label, 'השליחה נכשלה');
  }),

  test('שדות בנוסח — בעברית בעריכה, וחזרה לקוד בדיוק לכל נוסח של המערכת', () => {
    for (const key of [...REQUEST_UPDATE_TEMPLATE_KEYS, 'paperless_invite', 'retainer_request'] as SavedTemplateKey[]) {
      const t = templateForKey(key);
      for (const text of [t.subject, t.body]) {
        const shown = templateToLabels(text);
        assert(!shown.includes('{{'), `${key}: נשאר קוד — ${shown}`);
        equal(templateFromLabels(shown), text, `${key}: החזרה לקוד`);
      }
    }
    equal(templateToLabels('{{welcomeLine}}ריכזנו'), '[שורת פתיחה]ריכזנו');
    // רווחים בתוך הסוגריים — אותו שדה; קוד לא מוכר נשאר כמו שהוא.
    equal(templateFromLabels(templateToLabels('א {{ requestList }} ב {{mystery}}')), 'א {{requestList}} ב {{mystery}}');
    // שם אחר לשדה (במייל לגורם חיצוני {{clientName}} הוא שם הנמען) — לשני הכיוונים.
    const own = { ...TEMPLATE_FIELD_LABELS, '{{clientName}}': 'שם הנמען' };
    equal(templateToLabels('שלום {{clientName}}', own), 'שלום [שם הנמען]');
    equal(templateFromLabels('שלום [שם הנמען]', own), 'שלום {{clientName}}');
  }),

  test('השמות של השדות שונים זה מזה — החזרה לקוד חד-משמעית', () => {
    const labels = Object.values(TEMPLATE_FIELD_LABELS);
    equal(new Set(labels).size, labels.length);
    for (const l of labels) assert(!LATIN.test(l), l);
  }),

  test('שם אחד למייל — ביומן כמו בעמוד «מיילים», בלי אנגלית', () => {
    for (const k of ['documents_sent', 'portal_reminder', 'step_reminder'] as const) {
      equal(EMAIL_KIND_LABEL[k], emailTemplateTitle(k), k);
    }
    for (const k of ['process_open', 'status_update', 'documents_sent', 'portal_reminder', 'step_reminder']) {
      assert(!LATIN.test(emailKindLabel(k)), `${k}: ${emailKindLabel(k)}`);
    }
    // הנוסח שיצא — כשהיומן שמר אותו; ערך לא מוכר — לא ממציאים.
    equal(emailTemplateKeyOf({ meta: { templateKey: 'process_open_later' } }), 'process_open_later');
    equal(emailTemplateKeyOf({ meta: { templateKey: 'nonsense' } }), undefined);
    equal(emailTemplateKeyOf({ meta: undefined }), undefined);
  }),

  test('שם המייל ביומן — לפי הנוסח שיצא כשנשמר, אחרת לפי הסוג', () => {
    equal(emailMessageLabel({ kind: 'process_open', meta: { templateKey: 'process_open' } }), emailTemplateTitle('process_open'));
    equal(emailMessageLabel({ kind: 'process_open', meta: { templateKey: 'process_open_later' } }), emailTemplateTitle('process_open_later'));
    equal(emailMessageLabel({ kind: 'process_open', meta: {} }), emailKindLabel('process_open'));
    equal(emailMessageLabel({ kind: undefined, meta: undefined }), 'מייל');
  }),
];

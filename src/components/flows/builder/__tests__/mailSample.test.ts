// ─── בדיקות: «איך ייראה» — המייל לדוגמה במסלולים ───────────────────────────
// ‼ מה נעול כאן:
//   · נוסח שהמשרד שמר למייל הראשון (process_open) לא משנה את מייל ההמשך.
//   · נוסח שנשמר למייל ההמשך (process_open_later) — הוא מה שמוצג.
//   · «הנוסח נערך ב«מיילים ← …»» מפנה לשורה שקיימת בעמוד «מיילים», באותו שם בדיוק.

import { test, equal, assert } from '../../../../testkit/tinyTest';
import type { TestCase } from '../../../../testkit/tinyTest';
import type { FirmProfile } from '../../../../types/firmProfile';
import {
  emailTemplateTitle, noticeWording, PAGE_INTRO_LINE, PROCESS_OPEN_LATER, REQUEST_UPDATE_TEMPLATE_KEYS, renderTemplate,
} from '../../../../../supabase/functions/_shared/stepTemplates.ts';
import { consolidatedMailSample, type MailSampleInput } from '../mailSample';

const profile = (commTemplates: Record<string, { subject?: string; body?: string }> = {}): FirmProfile => ({
  id: 'u1',
  firmName: 'משרד לדוגמה',
  branding: {},
  communication: {},
  settings: { commTemplates },
});

const later: MailSampleInput = { requests: ['תלושים'], documents: [], first: null, clientFirst: 'דנה', clientLast: 'לוי' };
const first: MailSampleInput = { ...later, first: 'welcome' };
const introduce: MailSampleInput = { ...later, first: 'introduce' };

const FIRST_OVERRIDE = { subject: 'נוסח קליטה', body: 'ריכזנו את כל תהליך ההצטרפות\n{{requestList}}' };

export const TESTS: TestCase[] = [
  test('נוסח שנשמר למייל הראשון לא משנה את מייל ההמשך', () => {
    const s = consolidatedMailSample(profile({ process_open: FIRST_OVERRIDE }), later);
    equal(s.templateKey, 'process_open_later');
    equal(s.subject, renderTemplate(PROCESS_OPEN_LATER, {}).subject);
    assert(!s.html.includes('תהליך ההצטרפות'), 'מייל המשך בלי «תהליך ההצטרפות»');
    // ‼ הפתיחה נגזרת מהנוסח עצמו (לא מחרוזת קשיחה) — שינוי ניסוח ב-stepTemplates לא שובר את הכלל.
    const opening = PROCESS_OPEN_LATER.body.split('\n')[0].replace('{{welcomeLine}}', '').split(':')[0].trim();
    assert(opening.length > 5 && s.html.includes(opening), `פתיחת PROCESS_OPEN_LATER: «${opening}»`);
    assert(s.html.includes('תלושים'), 'הבקשה ברשימה');
  }),

  test('נוסח שנשמר למייל הראשון — חל על המייל הראשון', () => {
    const s = consolidatedMailSample(profile({ process_open: FIRST_OVERRIDE }), first);
    equal(s.templateKey, 'process_open');
    equal(s.subject, 'נוסח קליטה');
    assert(s.html.includes('תהליך ההצטרפות'), 'הנוסח של המשרד');
  }),

  test('נוסח שנשמר למייל ההמשך — הוא מה שמוצג במייל ההמשך', () => {
    const s = consolidatedMailSample(profile({
      process_open: FIRST_OVERRIDE,
      process_open_later: { subject: 'עוד בקשות', body: 'הוספנו לך:\n{{requestList}}' },
    }), later);
    equal(s.subject, 'עוד בקשות');
    assert(s.html.includes('הוספנו לך:'), 'הנוסח של המשרד למייל ההמשך');
  }),

  test('«מיילים ← …» במסלולים = שם שורה שקיימת בעמוד «מיילים»', () => {
    const rowTitles = REQUEST_UPDATE_TEMPLATE_KEYS.map(emailTemplateTitle);
    const cases: MailSampleInput[] = [
      first, later,
      { ...later, requests: [], documents: ['מדריך הוצאות'] },
      { ...first, requests: [], documents: ['מדריך הוצאות'] },
    ];
    for (const input of cases) {
      const s = consolidatedMailSample(profile(), input);
      assert(REQUEST_UPDATE_TEMPLATE_KEYS.includes(s.templateKey), `המפתח ${s.templateKey} הוא שורה בעמוד`);
      equal(s.templateTitle, emailTemplateTitle(s.templateKey));
      assert(rowTitles.includes(s.templateTitle), `«${s.templateTitle}» קיים בעמוד «מיילים»`);
    }
    equal(consolidatedMailSample(profile(), first).templateTitle, 'מייל ראשון: פתחנו לכם דף אישי');
    equal(consolidatedMailSample(profile(), later).templateTitle, 'בקשות חדשות ללקוח שכבר קיבל מייל');
  }),

  // ‼ הכותרת, הכפתור ושורת הפתיחה — מ-noticeWording, כמו השולח. לא מחרוזות שהועתקו.
  test('הכותרת והכפתור — מאותה פונקציה שהשרת מפעיל (פנייה ברבים)', () => {
    for (const input of [first, later, introduce]) {
      const s = consolidatedMailSample(profile(), input);
      const w = noticeWording({ event: 'process_open', first: input.first, clientFirst: 'דנה', documentsCount: 0 });
      assert(s.html.includes(w.heading), `הכותרת «${w.heading}»`);
      assert(s.html.includes(w.ctaLabel), `הכפתור «${w.ctaLabel}»`);
    }
    assert(consolidatedMailSample(profile(), later).html.includes('לדף האישי שלכם'), 'כפתור ברבים');
    assert(!consolidatedMailSample(profile(), later).html.includes('בדף שלך'), 'בלי פנייה ביחיד');
  }),

  test('לקוח ותיק, מייל דף ראשון — «פתחנו לכם דף אישי» ושורת ההצגה, לא «ברוכים הבאים»', () => {
    const s = consolidatedMailSample(profile(), introduce);
    equal(s.templateKey, 'process_open_later');
    assert(s.html.includes('דנה, פתחנו לכם דף אישי'), 'הכותרת');
    assert(s.html.includes(PAGE_INTRO_LINE.trim()), 'שורת ההצגה של הדף');
    assert(!s.html.includes('ברוכים הבאים'), 'בלי «ברוכים הבאים»');
    assert(!consolidatedMailSample(profile(), later).html.includes(PAGE_INTRO_LINE.trim()), 'מייל המשך — בלי שורת ההצגה');
  }),

  test('שורת ההצגה נשארת גם בנוסח שהמשרד שמר למייל ההמשך', () => {
    const s = consolidatedMailSample(profile({ process_open_later: { subject: 'עוד', body: 'הוספנו:\n{{requestList}}' } }), introduce);
    assert(s.html.includes(PAGE_INTRO_LINE.trim()) && s.html.includes('הוספנו:'), 'שורת ההצגה + הנוסח של המשרד');
  }),

  test('מסמך אחד — ביחיד, והכפתור סופר', () => {
    const one = consolidatedMailSample(profile(), { ...later, requests: [], documents: ['מדריך'] });
    assert(one.html.includes('לצפייה במסמך בדף האישי') && one.html.includes('מסמך חדש'), 'מסמך אחד');
    const two = consolidatedMailSample(profile(), { ...later, requests: [], documents: ['א', 'ב'] });
    assert(two.html.includes('לצפייה במסמכים בדף האישי') && two.html.includes('2 מסמכים חדשים'), 'שני מסמכים');
  }),
];

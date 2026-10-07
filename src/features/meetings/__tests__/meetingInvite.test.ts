// ─── בדיקות: נוסח הזימון לפגישה ושעון ישראל ─────────────────────────────────
// ‼ מה נעול כאן:
//   · שעון ישראל: 10:00 באוקטובר (קיץ) ≠ 10:00 בנובמבר (חורף), בלי קשר לשעון המכשיר.
//   · מיילים מהוואטסאפ: כמה בשיחה, נקודה בסוף משפט, כפילויות, אותיות גדולות.
//   · שם מוצע מהעתקת וואטסאפ — לעולם לא מספר טלפון.
//   · הנוסח: פנייה בשם, «ללא עלות» רק בהיכרות, שורת עדכון בראש בשינוי מועד,
//     והחתימה מפרטי המשרד (בלי וואטסאפ — בלי מספר).
//   · (סבב 3) הנוסח הוא תבנית: נוסח המשרד גובר, שדה ריק בשורה משלו מוריד את הפסקה,
//     ונוסח המערכת מפיק בדיוק את הטקסט שיצא לפני שהתבנית נוספה.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  israelToUtcIso, utcToIsrael, addMinutes, extractEmails, suggestNameFromWhatsApp, isValidEmail,
  meetingTitle, greeting, inviteParagraphs, inviteDescription, organizerTitle, whatsappReminderText,
  meetingTemplateFor, fillInviteBody, fillInviteTitle, MEETING_TEMPLATE_DEFAULTS, MEETING_TEMPLATE_FIELDS,
  MOVE_NOTE_DEFAULT, type InviteOrg,
} from '../../../../supabase/functions/_shared/meetingInvite';

const ORG: InviteOrg = { fullName: 'גיא ישר', firmName: 'ישר רואי חשבון', representativeType: 'רואה חשבון', phone: '050-0000000', whatsapp: '050-1111111', website: 'yasharcpa.co.il' };

export const TESTS: TestCase[] = [
  test('שעון ישראל: 8.10.2026 10:00 (שעון קיץ) = 07:00Z', () => {
    equal(israelToUtcIso('2026-10-08', '10:00'), '2026-10-08T07:00:00.000Z');
  }),
  test('שעון ישראל: 1.11.2026 10:00 (אחרי המעבר לחורף) = 08:00Z', () => {
    equal(israelToUtcIso('2026-11-01', '10:00'), '2026-11-01T08:00:00.000Z');
  }),
  test('שעון ישראל: הלוך-חזור נותן את אותו תאריך ושעה', () => {
    for (const [d, t] of [['2026-10-25', '09:15'], ['2026-03-27', '23:45'], ['2026-12-31', '00:30']]) {
      deepEqual(utcToIsrael(israelToUtcIso(d, t)), { date: d, time: t });
    }
  }),
  test('addMinutes: מעבר שעה ועד חצות', () => {
    equal(addMinutes('10:45', 30), '11:15');
    equal(addMinutes('23:30', 45), '00:15');
  }),

  test('מיילים מוואטסאפ: כמה בשיחה, נקודה בסוף, כפילות ואותיות גדולות', () => {
    const text = '[6.10.2026, 14:03] דני לוי: המייל שלי Dani.Levi@Example.com ושל רותם rotem.levi@example.co.il.\n[6.10.2026, 14:04] דני לוי: שוב: dani.levi@example.com';
    deepEqual(extractEmails(text), ['dani.levi@example.com', 'rotem.levi@example.co.il']);
  }),
  test('מיילים: טקסט בלי כתובת ⇒ רשימה ריקה', () => {
    deepEqual(extractEmails('היי, אשמח לשיחה מחר'), []);
  }),
  test('isValidEmail', () => {
    assert(isValidEmail('a.b@c.co.il'), 'תקינה');
    assert(!isValidEmail('a@b'), 'בלי סיומת');
    assert(!isValidEmail('שלום@דוגמה.קום'), 'אותיות עבריות');
  }),
  test('שם מוצע: העתקה מאייפון ומאנדרואיד', () => {
    equal(suggestNameFromWhatsApp('[6.10.2026, 14:03:12] דני לוי: היי גיא'), 'דני לוי');
    equal(suggestNameFromWhatsApp('6/10/26, 14:03 - רותם כהן: היי'), 'רותם כהן');
  }),
  test('שם מוצע: מספר טלפון אינו שם, והודעה בודדת אינה מציעה כלום', () => {
    equal(suggestNameFromWhatsApp('[6.10.2026, 14:03] +972 50-123-4567: היי'), undefined);
    equal(suggestNameFromWhatsApp('המייל שלי dani@example.com'), undefined);
  }),

  test('כותרת: סוג · שמות · שם ותואר', () => {
    equal(meetingTitle({ kind: 'intro', guests: [{ email: 'd@x.com', name: 'דני לוי' }, { email: 'r@x.com', name: 'רותם' }] }, ORG),
      'שיחת היכרות · דני לוי ורותם · גיא ישר, רו״ח');
    equal(meetingTitle({ kind: 'work', topic: 'סגירת הדוח השנתי 2025', guests: [{ email: 'd@x.com' }] }, ORG),
      'סגירת הדוח השנתי 2025 · גיא ישר, רו״ח');
  }),
  test('כותרת בלי שם ובלי תואר: שם המשרד', () => {
    equal(organizerTitle({ firmName: 'משרד לדוגמה' }), 'משרד לדוגמה');
  }),
  test('פנייה: שם פרטי; שניים; בלי שם', () => {
    equal(greeting([{ email: 'a@x.com', name: 'דני לוי' }]), 'שלום דני,');
    equal(greeting([{ email: 'a@x.com', name: 'דני לוי' }, { email: 'b@x.com', name: 'רותם' }]), 'שלום דני ורותם,');
    equal(greeting([{ email: 'a@x.com' }]), 'שלום,');
  }),

  test('היכרות: ללא עלות, סדר יום, בלי שיעורי בית, וואטסאפ בחתימה', () => {
    const d = inviteDescription({ kind: 'intro', guests: [{ email: 'a@x.com', name: 'דני לוי' }], durationMin: 30, note: 'שמחתי לשמוע מכם.' }, ORG);
    assert(d.startsWith('שלום דני,\n\nשמחתי לשמוע מכם.'), 'פנייה ואז השורה האישית');
    assert(d.includes('30 דקות, ללא עלות וללא התחייבות'), 'משך וללא עלות');
    assert(d.includes('• אסביר איך אוכל לעזור ומה הצעד הבא'), 'סדר יום');
    assert(d.includes('בוואטסאפ 050-1111111'), 'מספר הוואטסאפ של המשרד');
    assert(d.endsWith('נתראה,\nגיא ישר, רו״ח\nישר רואי חשבון\n050-0000000 · yasharcpa.co.il'), 'חתימה');
  }),
  test('עבודה: נושא ומה להכין; בלי «ללא עלות»', () => {
    const ps = inviteParagraphs({ kind: 'work', guests: [], durationMin: 45, topic: 'דוח שנתי', prep: 'טופס 106\n\nאישור ניכוי' }, ORG);
    equal(ps.length, 7, 'פנייה · נושא · מה להכין · איך מצטרפים · לאשר · לשנות · חתימה');
    const d = ps.join('\n\n');
    assert(d.includes('בנושא דוח שנתי. היא תימשך 45 דקות.'), 'נושא ומשך');
    assert(d.includes('מה כדאי להכין:\n• טופס 106\n• אישור ניכוי'), 'רשימה בלי שורות ריקות');
    assert(!d.includes('ללא עלות'), 'פגישת עבודה אינה «ללא עלות»');
  }),
  test('עבודה בלי מה להכין: הכותרת «מה כדאי להכין:» לא נשארת לבד', () => {
    const d = inviteDescription({ kind: 'work', guests: [], durationMin: 45, topic: 'דוח שנתי' }, ORG);
    assert(!d.includes('מה כדאי להכין'), 'בלי רשימה — בלי כותרת');
  }),
  test('בלי וואטסאפ וטלפון במשרד: אין מספר ריק בטקסט', () => {
    const d = inviteDescription({ kind: 'intro', guests: [], durationMin: 30 }, { fullName: 'רו״ח לדוגמה' });
    assert(d.includes('המועד לא מתאים? השיבו למייל הזה ונמצא זמן אחר.'), 'רק מענה למייל');
    assert(!d.includes('בוואטסאפ'), 'בלי וואטסאפ');
  }),
  test('שינוי מועד: שורת העדכון בראש, ואז מי ביקש, ואז ההזמנה', () => {
    const ps = inviteParagraphs({ kind: 'intro', guests: [{ email: 'a@x.com', name: 'דני' }], durationMin: 30 }, ORG,
      { date: '2026-10-08', time: '12:00', note: MOVE_NOTE_DEFAULT.guest });
    equal(ps[0], 'עדכון: הפגישה עברה ליום חמישי, 8 באוקטובר בשעה 12:00.');
    equal(ps[1], 'כפי שסיכמנו, קבענו מועד חדש. נתראה!');
    equal(ps[2], 'שלום דני,');
  }),

  test('תבנית: נוסח המשרד גובר; שדה ריק או רווחים — נוסח המערכת', () => {
    const saved = { meeting_intro: { subject: 'פגישת היכרות · [x] · {{names}}', body: '{{greeting}}\n\nשמחתי שפניתם!' }, meeting_work: { subject: '  ', body: '' } };
    deepEqual(meetingTemplateFor('intro', saved), saved.meeting_intro);
    deepEqual(meetingTemplateFor('work', saved), MEETING_TEMPLATE_DEFAULTS.work);
    deepEqual(meetingTemplateFor('intro', null), MEETING_TEMPLATE_DEFAULTS.intro);
    deepEqual(meetingTemplateFor('work', 'garbage'), MEETING_TEMPLATE_DEFAULTS.work);
  }),
  test('תבנית: מה שהמשרד כתב יוצא, עם השדות ממולאים', () => {
    const tpl = { subject: 'פגישה עם {{names}}', body: '{{greeting}}\n\nשמחתי שפניתם! נדבר {{duration}}.\n\nנתראה,\n{{signature}}' };
    const input = { kind: 'intro' as const, guests: [{ email: 'a@x.com', name: 'דני לוי' }], durationMin: 30 };
    equal(meetingTitle(input, ORG, tpl), 'פגישה עם דני לוי');
    equal(inviteDescription(input, ORG, undefined, tpl),
      'שלום דני,\n\nשמחתי שפניתם! נדבר 30 דקות.\n\nנתראה,\nגיא ישר, רו״ח\nישר רואי חשבון\n050-0000000 · yasharcpa.co.il');
  }),
  test('תבנית: שדה ריק בשורה משלו מוריד את כל הפסקה; שדה ריק באמצע משפט — רק נעלם', () => {
    const ps = fillInviteBody('שלום\n\n{{note}}\n\nלהכין:\n{{prepList}}\n\nכתבו ל-{{whatsapp}} או השיבו', { note: '', prepList: '', whatsapp: '' });
    deepEqual(ps, ['שלום', 'כתבו ל- או השיבו']);
  }),
  test('תבנית: שדה לא מוכר נמחק — לא נשאר «{{…}}» אצל המוזמן', () => {
    deepEqual(fillInviteBody('שלום {{nope}} דני', {}), ['שלום דני']);
  }),
  test('כותרת מתבנית: בלי שמות אין «·  ·», ושורה אחת', () => {
    equal(fillInviteTitle('{{kind}} · {{names}} · {{organizer}}', { kind: 'שיחת היכרות', names: '', organizer: 'גיא' }), 'שיחת היכרות · גיא');
    equal(fillInviteTitle('א\nב', {}), 'א ב');
  }),
  test('כותרת ריקה בתבנית ⇒ כותרת המערכת (לאירוע ביומן חייבת להיות כותרת)', () => {
    equal(meetingTitle({ kind: 'intro', guests: [{ email: 'd@x.com', name: 'דני' }] }, ORG, { subject: '{{note}}', body: 'x' }),
      'שיחת היכרות · דני · גיא ישר, רו״ח');
  }),
  test('לכל שדה בנוסח המערכת יש שם בעברית בעורך', () => {
    const known = new Set(MEETING_TEMPLATE_FIELDS.map(f => f.token));
    for (const t of Object.values(MEETING_TEMPLATE_DEFAULTS)) {
      for (const m of `${t.subject}\n${t.body}`.match(/\{\{[a-zA-Z]+\}\}/g) ?? []) assert(known.has(m), `חסר שם ל-${m}`);
    }
  }),
  test('תזכורת וואטסאפ: היום / מחר / יום בשבוע', () => {
    const g = { email: 'a@x.com', name: 'נועה כהן' };
    equal(whatsappReminderText({ guest: g, date: '2026-10-07', time: '09:30', today: '2026-10-07', signer: 'גיא' }),
      'היי נועה, תזכורת קטנה: נדבר היום ב-09:30 ב-Google Meet. הקישור נמצא בהזמנה ששלחתי במייל. נתראה, גיא');
    assert(whatsappReminderText({ guest: g, date: '2026-10-08', time: '09:30', today: '2026-10-07' }).includes('נדבר מחר'), 'מחר');
    assert(whatsappReminderText({ guest: g, date: '2026-10-11', time: '09:30', today: '2026-10-07' }).includes('נדבר ביום ראשון'), 'יום בשבוע');
  }),
];

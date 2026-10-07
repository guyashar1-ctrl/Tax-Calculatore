// ─── בדיקות: נוסח הזימון לפגישה ושעון ישראל ─────────────────────────────────
// ‼ מה נעול כאן:
//   · שעון ישראל: 10:00 באוקטובר (קיץ) ≠ 10:00 בנובמבר (חורף), בלי קשר לשעון המכשיר.
//   · מיילים מהוואטסאפ: כמה בשיחה, נקודה בסוף משפט, כפילויות, אותיות גדולות.
//   · שם מוצע מהעתקת וואטסאפ — לעולם לא מספר טלפון.
//   · הנוסח: פנייה בשם, «ללא עלות» רק בהיכרות, שורת עדכון בראש בשינוי מועד,
//     והחתימה מפרטי המשרד (בלי וואטסאפ — בלי מספר).

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  israelToUtcIso, utcToIsrael, addMinutes, extractEmails, suggestNameFromWhatsApp, isValidEmail,
  meetingTitle, greeting, inviteBlocks, inviteDescription, organizerTitle, whatsappReminderText,
  MOVE_NOTE_DEFAULT, INVITE_WHY, type InviteOrg,
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
    const keys = inviteBlocks({ kind: 'work', guests: [], durationMin: 45, topic: 'דוח שנתי', prep: 'טופס 106\n\nאישור ניכוי' }, ORG).map(b => b.key);
    deepEqual(keys, ['greet', 'whatWork', 'prepWork', 'join', 'confirm', 'reschedule', 'sign']);
    const d = inviteDescription({ kind: 'work', guests: [], durationMin: 45, topic: 'דוח שנתי', prep: 'טופס 106\n\nאישור ניכוי' }, ORG);
    assert(d.includes('בנושא דוח שנתי. היא תימשך 45 דקות.'), 'נושא ומשך');
    assert(d.includes('מה כדאי להכין:\n• טופס 106\n• אישור ניכוי'), 'רשימה בלי שורות ריקות');
    assert(!d.includes('ללא עלות'), 'פגישת עבודה אינה «ללא עלות»');
  }),
  test('בלי וואטסאפ וטלפון במשרד: אין מספר ריק בטקסט', () => {
    const d = inviteDescription({ kind: 'intro', guests: [], durationMin: 30 }, { fullName: 'רו״ח לדוגמה' });
    assert(d.includes('המועד לא מתאים? השיבו למייל הזה ונמצא זמן אחר.'), 'רק מענה למייל');
    assert(!d.includes('בוואטסאפ'), 'בלי וואטסאפ');
  }),
  test('שינוי מועד: שורת העדכון בראש, ואז מי ביקש, ואז ההזמנה', () => {
    const blocks = inviteBlocks({ kind: 'intro', guests: [{ email: 'a@x.com', name: 'דני' }], durationMin: 30 }, ORG,
      { date: '2026-10-08', time: '12:00', note: MOVE_NOTE_DEFAULT.guest });
    equal(blocks[0].text, 'עדכון: הפגישה עברה ליום חמישי, 8 באוקטובר בשעה 12:00.');
    equal(blocks[1].text, 'כפי שסיכמנו, קבענו מועד חדש. נתראה!');
    equal(blocks[2].key, 'greet');
  }),
  test('לכל פסקה יש הסבר «למה כתוב כך»', () => {
    const all = [
      ...inviteBlocks({ kind: 'intro', guests: [], durationMin: 30, note: 'x' }, ORG, { date: '2026-10-08', time: '10:00', note: 'y' }),
      ...inviteBlocks({ kind: 'work', guests: [], durationMin: 45, prep: 'a' }, ORG),
    ];
    for (const b of all) assert(INVITE_WHY[b.key], `חסר הסבר ל-${b.key}`);
  }),
  test('תזכורת וואטסאפ: היום / מחר / יום בשבוע', () => {
    const g = { email: 'a@x.com', name: 'נועה כהן' };
    equal(whatsappReminderText({ guest: g, date: '2026-10-07', time: '09:30', today: '2026-10-07', signer: 'גיא' }),
      'היי נועה, תזכורת קטנה: נדבר היום ב-09:30 ב-Google Meet. הקישור נמצא בהזמנה ששלחתי במייל. נתראה, גיא');
    assert(whatsappReminderText({ guest: g, date: '2026-10-08', time: '09:30', today: '2026-10-07' }).includes('נדבר מחר'), 'מחר');
    assert(whatsappReminderText({ guest: g, date: '2026-10-11', time: '09:30', today: '2026-10-07' }).includes('נדבר ביום ראשון'), 'יום בשבוע');
  }),
];

// ─── בדיקות: «עם מי?» בחלון הפגישה, ו«היום שלך ביומן» (סבב 3) ───────────────
// ‼ מה נעול כאן:
//   · סוג הפגישה לפי האדם הראשון: לקוח / איש קשר / איש מקצוע ⇒ עבודה; ליד / לקוח פוטנציאלי ⇒ היכרות.
//     (הצילום של גיא, 07.10.2026: לקוח קיים קיבל «שיחת היכרות».)
//   · מה יקרה לאדם חדש — אותם כללים כמו בשרת: בפנייה של הראשון רק בשיחת היכרות של ליד.
//   · מה נשלח לשרת: saveAs לכל אדם חדש, פרטי איש קשר, וקשר רק לאדם בפנייה.
//   · הדבקה מוואטסאפ: מוכר ⇒ מהספרייה; חדש ⇒ עם השם מההודעה לראשון; בלי כפילויות.
//   · היום ביומן: אירוע שחוצה חצות נחתך, יום שלם בנפרד, «פנוי» אינו התנגשות, הפגישה שמזיזים — לא.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  autoKind, buildDirectory, defaultWho, guestsPayload, isCompanion, knownTag, newPersonFate, peopleFromPaste,
  peopleProblems, searchDirectory, type Person,
} from '../peoplePicker';
import { clashesWith, slotsOfDay } from '../DayStrip';
import type { Client } from '../../../types';
import type { Lead } from '../../../types/quotations';
import type { Contact } from '../../contacts/contactModel';
import type { CalendarEvent } from '../../../../supabase/functions/_shared/meetingCore';

const CLIENTS = [{ id: 'c1', firstName: 'דוד', lastName: 'כהן', email: 'David@x.com', spouseEmail: 'rina@x.com', spouseName: 'רינה' }] as unknown as Client[];
const LEADS = [
  { id: 'l1', fullName: 'אבי פרץ', email: 'avi@x.com', status: 'new', companions: [{ email: 'michal@x.com', name: 'מיכל', relation: 'spouse' }] },
  { id: 'l2', fullName: 'שי אורן', email: 'shai@x.com', status: 'closed', companions: [] },
] as unknown as Lead[];
const CONTACTS = [{ id: 'k1', fullName: 'רונית אברהם', email: 'ronit@x.com', role: 'רו״ח', organization: 'אברהם ושות׳' }] as unknown as Contact[];
const DIR = buildDirectory(CLIENTS, LEADS, CONTACTS);
const known = (email: string): Person => ({ email, name: DIR.get(email)!.name, known: DIR.get(email) });

export const TESTS: TestCase[] = [
  test('ספרייה: לקוח, בן/בת זוג, ליד, אדם בפנייה, איש קשר — לפי מייל באותיות קטנות', () => {
    deepEqual([...DIR.keys()].sort(), ['avi@x.com', 'david@x.com', 'michal@x.com', 'rina@x.com', 'ronit@x.com', 'shai@x.com']);
    equal(DIR.get('michal@x.com')!.tag, 'בן/בת זוג בפנייה של אבי פרץ');
    equal(DIR.get('ronit@x.com')!.tag, 'איש קשר · רו״ח · אברהם ושות׳');
  }),
  test('ליד סגור: «ייפתח מחדש» רק בשיחת היכרות', () => {
    equal(knownTag(DIR.get('shai@x.com')!, 'intro'), 'ליד · סגור, ייפתח מחדש');
    equal(knownTag(DIR.get('shai@x.com')!, 'work'), 'ליד · סגור');
  }),
  test('חיפוש: לפי שם, תפקיד או מייל; מי שכבר בפגישה לא מוצע', () => {
    // ‼ גם בן/בת הזוג — «בן/בת הזוג של דוד כהן».
    deepEqual(searchDirectory(DIR, 'כהן', new Set()).map(h => h.email), ['david@x.com', 'rina@x.com']);
    deepEqual(searchDirectory(DIR, 'רו״ח', new Set()).map(h => h.email), ['ronit@x.com']);
    deepEqual(searchDirectory(DIR, 'avi@', new Set()).map(h => h.email), ['avi@x.com']);
    deepEqual(searchDirectory(DIR, 'כהן', new Set(['david@x.com'])).map(h => h.email), ['rina@x.com']);
    deepEqual(searchDirectory(DIR, 'כ', new Set()), []);
  }),
  test('סוג הפגישה לפי הראשון: לקוח/איש קשר ⇒ עבודה; ליד ⇒ היכרות; חדש לפי «מי זה?»', () => {
    equal(autoKind(known('david@x.com')), 'work');
    equal(autoKind(known('ronit@x.com')), 'work');
    equal(autoKind(known('avi@x.com')), 'intro');
    equal(autoKind(known('michal@x.com')), 'intro');
    equal(autoKind({ email: 'n@x.com', name: 'נ', who: 'lead' }), 'intro');
    equal(autoKind({ email: 'n@x.com', name: 'נ', who: 'contact' }), 'work');
    equal(autoKind(undefined), 'intro');
  }),
  test('מה יקרה לאדם חדש: בפנייה רק בהיכרות של ליד; ליד משלו ליד לקוח', () => {
    const withLead: Person[] = [known('avi@x.com'), { email: 'n@x.com', name: 'נועה', who: 'lead' }];
    assert(isCompanion(withLead, 1, 'intro'), 'בפנייה של אבי');
    equal(newPersonFate(withLead, 1, 'intro'), 'יישמר בפנייה של אבי פרץ');
    assert(!isCompanion(withLead, 1, 'work'), 'בפגישת עבודה — לא בפנייה');
    const withClient: Person[] = [known('david@x.com'), { email: 'n@x.com', name: 'נועה', who: 'lead' }];
    equal(newPersonFate(withClient, 1, 'work'), 'יישמר כליד');
    equal(newPersonFate([known('david@x.com'), { email: 'b@x.com', name: '', who: 'none' }], 1, 'work'), 'לא יישמר — רק מוזמן');
  }),
  test('«מי זה?» מוצע: ליד כשאין אף אחד או שהראשון ליד; איש מקצוע ליד לקוח', () => {
    equal(defaultWho([]), 'lead');
    equal(defaultWho([known('avi@x.com')]), 'lead');
    equal(defaultWho([known('david@x.com')]), 'contact');
  }),
  test('מה חסר: אף אחד; ליד או איש קשר בלי שם. «רק מוזמן» בלי שם — בסדר', () => {
    equal(peopleProblems([]).length, 1);
    equal(peopleProblems([{ email: 'a@x.com', name: '', who: 'lead' }])[0], 'כתבו שם ל-a@x.com — כך הוא יישמר כליד.');
    deepEqual(peopleProblems([{ email: 'a@x.com', name: '', who: 'none' }]), []);
  }),
  test('מה נשלח לשרת: saveAs רק לחדשים, איש קשר עם פרטים, קשר רק לאדם בפנייה', () => {
    const people: Person[] = [
      known('avi@x.com'),
      { email: 'n@x.com', name: 'נועה', who: 'lead', relation: 'spouse' },
      { email: 'k@x.com', name: 'קובי', who: 'contact', role: 'עו״ד', organization: ' משרד ' },
      { email: 'z@x.com', name: '', who: 'none' },
    ];
    deepEqual(guestsPayload(people, 'intro'), [
      { email: 'avi@x.com', name: 'אבי פרץ' },
      { email: 'n@x.com', name: 'נועה', saveAs: 'lead', relation: 'spouse' },
      { email: 'k@x.com', name: 'קובי', saveAs: 'contact', contact: { role: 'עו״ד', organization: 'משרד' } },
      { email: 'z@x.com', saveAs: 'none' },
    ]);
  }),
  test('הדבקה מוואטסאפ: מוכר מהספרייה, חדש עם השם מההודעה, בלי מי שכבר בפגישה', () => {
    const text = '[7.10.2026, 10:15] דני לוי: המייל שלי dani@x.com ושל אבי Avi@x.com ושל רותם rotem@x.com';
    const out = peopleFromPaste(text, DIR, []);
    deepEqual(out.map(p => [p.email, p.name, p.known?.type ?? p.who]), [
      ['dani@x.com', 'דני לוי', 'lead'], ['avi@x.com', 'אבי פרץ', 'lead'], ['rotem@x.com', '', 'lead'],
    ]);
    deepEqual(peopleFromPaste(text, DIR, [known('avi@x.com')]).map(p => p.email), ['dani@x.com', 'rotem@x.com']);
  }),

  test('היום ביומן: שעות ישראל, חוצה חצות נחתך, יום שלם בנפרד, הפגישה שמזיזים לא נספרת', () => {
    const ev = (o: Partial<CalendarEvent>): CalendarEvent => ({
      id: 'x', title: 't', allDay: false, startsAt: null, endsAt: null, startDate: null, endDate: null, busy: true, meetingId: null, htmlLink: null, ...o,
    });
    const day = slotsOfDay([
      ev({ title: 'ישיבה', startsAt: '2026-10-08T06:00:00Z', endsAt: '2026-10-08T07:00:00Z' }),
      ev({ title: 'לילה', startsAt: '2026-10-07T20:00:00Z', endsAt: '2026-10-07T22:00:00Z' }),
      ev({ title: 'מע״מ', allDay: true, startDate: '2026-10-08', endDate: '2026-10-09' }),
      ev({ title: 'שלי', startsAt: '2026-10-08T07:00:00Z', endsAt: '2026-10-08T07:30:00Z', meetingId: 'm1' }),
    ], '2026-10-08', 'm1');
    deepEqual(day.timed.map(s => [s.title, s.start, s.end]), [['לילה', '00:00', '01:00'], ['ישיבה', '09:00', '10:00']]);
    deepEqual(day.allDay, ['מע״מ']);
  }),
  test('התנגשות: רק אירוע שתופס זמן וחופף; «פנוי» לא', () => {
    const slots = [
      { title: 'ישיבה', start: '09:00', end: '10:00', busy: true, pivo: false },
      { title: 'איסוף', start: '16:30', end: '17:00', busy: false, pivo: false },
    ];
    deepEqual(clashesWith(slots, '09:30', 30).map(s => s.title), ['ישיבה']);
    deepEqual(clashesWith(slots, '10:00', 30), []);
    deepEqual(clashesWith(slots, '16:30', 30), []);
  }),
];

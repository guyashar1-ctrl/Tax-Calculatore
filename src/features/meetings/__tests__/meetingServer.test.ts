// ─── בדיקות: ההחלטות של פונקציות השרת לפגישות ──────────────────────────────
// ‼ מה נעול כאן:
//   · תשובת Google מסווגת במקום אחד: 409 = «כבר קיים» (ניסיון קודם הצליח), 5xx/רשת = לא ידוע,
//     4xx אחר = נדחה בוודאות, 401 = לרענן, 404/410 = נמחק.
//   · invalid_grant ⇒ «צריך לחבר מחדש»; כשל אחר של רענון אינו מנתק.
//   · בייצור תמיד Google, גם אם הוגדרה כתובת מדומה; מחוץ לייצור בלי מפתחות ⇒ Google המדומה.
//   · state חתום: זיוף / תפוגה / חזרה לאתר זר — נדחים.
//   · מזהה האירוע נגזר ממזהה הפגישה (לחיצה כפולה = אירוע אחד).
//   · שיוך: לקוח קיים (גם במייל של בן/בת הזוג) גובר; ליד קיים לא משוכפל; ליד חדש רק בהיכרות ועם שם.
//   · פנייה משותפת (224): האדם השני נשמר בליד («שותפים עסקיים» כברירת מחדל), מייל שלו מוביל
//     לאותו ליד, ליד סגור נפתח בשיחת היכרות חדשה, ליד שהומר ⇒ הכרטיס, איש קשר שמור לא נעשה ליד.
//   · עדכון מהיומן: תשובות, הזזה שנעשתה ביומן, ואירוע שנמחק ביומן.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  googleCall, googleEndpoints, refreshAccessToken, signState, verifyState, safeReturnTo, eventIdFor, eventBody, rsvpFromGoogle,
} from '../../../../supabase/functions/_shared/googleCalendar';
import { parseCreate, parseMove, matchPeople, mergeCompanions, syncFromEvent } from '../../../../supabase/functions/_shared/meetingCore';

const res = (status: number, body?: unknown) => async () => new Response(body === undefined ? null : JSON.stringify(body), { status });
const PROD = 'https://uoweoqtuiettozagwgdw.supabase.co';
const STAGING = 'https://evdfxjqrkgugssfrdoxd.supabase.co';
const NOW = Date.parse('2026-10-06T09:00:00Z');
const UUID = '0f6c2a8e-3b1d-4e5f-9a7b-1c2d3e4f5a6b';

export const TESTS: TestCase[] = [
  test('סיווג: 200 ⇒ ok, 409 ⇒ conflict, 401 ⇒ auth, 410 ⇒ gone', async () => {
    equal((await googleCall(res(200, { id: 'x' }), 'u', {})).kind, 'ok');
    equal((await googleCall(res(409, {}), 'u', {})).kind, 'conflict');
    equal((await googleCall(res(401, {}), 'u', {})).kind, 'auth');
    equal((await googleCall(res(410, {}), 'u', {})).kind, 'gone');
  }),
  test('סיווג: 5xx ורשת ⇒ לא ידוע; 400/429 ⇒ נדחה בוודאות', async () => {
    equal((await googleCall(res(503, {}), 'u', {})).kind, 'unknown');
    equal((await googleCall(async () => { throw new Error('reset'); }, 'u', {})).kind, 'unknown');
    const r = await googleCall(res(400, { error: { message: 'Invalid attendee email.' } }), 'u', {});
    equal(r.kind, 'failed');
    equal(r.kind === 'failed' ? r.message : '', 'Invalid attendee email.');
    equal((await googleCall(res(429, {}), 'u', {})).kind, 'failed');
  }),
  test('רענון: invalid_grant ⇒ לחבר מחדש; 503 ⇒ לא מנתק', async () => {
    const ep = googleEndpoints({ supabaseUrl: PROD, clientIdConfigured: true });
    const a = await refreshAccessToken(res(400, { error: 'invalid_grant' }), ep, { refreshToken: 'r', clientId: 'c', clientSecret: 's' });
    assert(!a.ok && a.reconnect, 'invalid_grant');
    // כך Google עונה בפועל — קוד + הסבר. נמצא בבדיקת staging: ההסבר לבד הסתיר את הקוד.
    const real = await refreshAccessToken(res(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), ep,
      { refreshToken: 'r', clientId: 'c', clientSecret: 's' });
    assert(!real.ok && real.reconnect, 'invalid_grant עם הסבר');
    const b = await refreshAccessToken(res(503, {}), ep, { refreshToken: 'r', clientId: 'c', clientSecret: 's' });
    assert(!b.ok && !b.reconnect, '503 אינו ניתוק');
    const c = await refreshAccessToken(res(200, { access_token: 'at' }), ep, { refreshToken: 'r', clientId: 'c', clientSecret: 's' });
    assert(c.ok && c.accessToken === 'at', 'הצליח');
  }),
  test('לאן פונים: ייצור תמיד Google; staging בלי מפתחות ⇒ המדומה', () => {
    const p = googleEndpoints({ supabaseUrl: PROD, fakeUrl: 'https://evil.example/fake', clientIdConfigured: false });
    equal(p.fake, false);
    equal(p.token, 'https://oauth2.googleapis.com/token');
    const s = googleEndpoints({ supabaseUrl: STAGING, clientIdConfigured: false });
    equal(s.fake, true);
    equal(s.calendar, `${STAGING}/functions/v1/fake-google-calendar/calendar`);
    equal(googleEndpoints({ supabaseUrl: STAGING, clientIdConfigured: true }).fake, false);
  }),

  test('state: נחתם ונקרא; זיוף ותפוגה נדחים', async () => {
    const st = await signState('secret', { userId: 'u1', returnTo: 'https://crm.yasharcpa.co.il/#/', exp: NOW + 60000 });
    deepEqual(await verifyState('secret', st, NOW), { userId: 'u1', returnTo: 'https://crm.yasharcpa.co.il/#/', exp: NOW + 60000 });
    equal(await verifyState('other', st, NOW), null);
    equal(await verifyState('secret', st, NOW + 120000), null);
    const [payload, sig] = st.split('.');
    equal(await verifyState('secret', `${payload}x.${sig}`, NOW), null);
  }),
  test('חזרה אחרי החיבור: רק לאתר עצמו (ו-localhost מחוץ לייצור)', () => {
    const app = 'https://crm.yasharcpa.co.il';
    equal(safeReturnTo('https://crm.yasharcpa.co.il/#/connections', app, false), 'https://crm.yasharcpa.co.il/#/connections');
    equal(safeReturnTo('https://evil.example/', app, false), app);
    equal(safeReturnTo('http://localhost:5173/', app, false), app);
    equal(safeReturnTo('http://localhost:5173/', app, true), 'http://localhost:5173/');
  }),

  test('מזהה אירוע: נגזר מהפגישה, תווים ש-Google מקבל', () => {
    equal(eventIdFor(UUID), 'pivo0f6c2a8e3b1d4e5f9a7b1c2d3e4f5a6b');
    assert(/^[a-v0-9]{5,1024}$/.test(eventIdFor(UUID)), 'base32hex');
    let threw = false;
    try { eventIdFor('not-a-uuid'); } catch { threw = true; }
    assert(threw, 'מזהה לא תקין נדחה');
  }),
  test('גוף האירוע: Meet, מוזמנים, שעון ישראל, מוזמן לא מזמין אחרים', () => {
    const b = eventBody({ meetingId: UUID, title: 'T', description: 'D', startUtc: '2026-10-08T07:00:00.000Z', endUtc: '2026-10-08T07:30:00.000Z',
      guests: [{ email: 'a@x.com', name: 'דני' }, { email: 'b@x.com' }] }) as Record<string, any>;
    equal(b.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
    equal(b.conferenceData.createRequest.requestId, UUID);
    deepEqual(b.attendees, [{ email: 'a@x.com', displayName: 'דני' }, { email: 'b@x.com' }]);
    equal(b.start.timeZone, 'Asia/Jerusalem');
    equal(b.guestsCanInviteOthers, false);
  }),
  test('תשובות מוזמנים', () => {
    deepEqual(['accepted', 'declined', 'tentative', 'needsAction', undefined].map(rsvpFromGoogle), ['yes', 'no', 'maybe', 'none', 'none']);
  }),

  test('קלט: תקין; מיילים מנורמלים וכפילות מוסרת', () => {
    const p = parseCreate({ id: UUID, kind: 'intro', guests: [{ email: ' Dani@X.com ', name: 'דני' }, { email: 'dani@x.com' }],
      date: '2026-10-08', time: '10:00', durationMin: 30 }, NOW);
    assert(p.ok, 'תקין');
    if (p.ok) deepEqual(p.value.guests, [{ email: 'dani@x.com', name: 'דני' }]);
  }),
  test('קלט: עבר, מייל שבור, משך חריג ומזהה לא תקין — נדחים עם השדה', () => {
    const base = { id: UUID, kind: 'intro', guests: [{ email: 'a@x.com' }], date: '2026-10-08', time: '10:00', durationMin: 30 };
    const field = (b: Record<string, unknown>) => { const p = parseCreate(b, NOW); return p.ok ? 'ok' : p.field; };
    equal(field({ ...base, date: '2026-10-05' }), 'past');
    equal(field({ ...base, guests: [{ email: 'a@x' }] }), 'guests');
    equal(field({ ...base, guests: [] }), 'guests');
    equal(field({ ...base, durationMin: 500 }), 'durationMin');
    equal(field({ ...base, id: 'x' }), 'id');
    equal(field({ ...base, kind: 'party' }), 'kind');
  }),
  test('שינוי מועד: מי ביקש חובה', () => {
    const p = parseMove({ id: UUID, date: '2026-10-09', time: '12:00', durationMin: 30 }, NOW);
    assert(!p.ok && p.field === 'askedBy', 'askedBy');
    assert(parseMove({ id: UUID, date: '2026-10-09', time: '12:00', durationMin: 30, askedBy: 'guest' }, NOW).ok, 'תקין');
  }),

  test('שיוך: מייל של בן/בת זוג של לקוח ⇒ הכרטיס של הלקוח', () => {
    const m = matchPeople({ kind: 'intro', guests: [{ email: 'new@x.com', name: 'חדש' }, { email: 'spouse@x.com' }],
      clients: [{ id: 'c1', email: 'c@x.com', spouse_email: 'Spouse@X.com' }], leads: [], explicitClientId: null });
    deepEqual(m, { clientId: 'c1', leadId: null, newLead: null, addCompanions: [], reopenLead: false });
  }),
  test('שיוך: ליד קיים לא משוכפל; פתוח גובר על סגור', () => {
    const m = matchPeople({ kind: 'intro', guests: [{ email: 'd@x.com', name: 'דני' }], clients: [],
      leads: [{ id: 'l-closed', email: 'd@x.com', status: 'closed' }, { id: 'l-open', email: 'D@x.com', status: 'new' }], explicitClientId: null });
    equal(m.leadId, 'l-open');
    equal(m.newLead, null);
    equal(m.reopenLead, false);
  }),
  test('שיוך: אדם חדש בשיחת היכרות עם שם ⇒ ליד חדש; בלי שם או בפגישת עבודה ⇒ לא', () => {
    const g = [{ email: 'd@x.com', name: 'דני לוי' }];
    deepEqual(matchPeople({ kind: 'intro', guests: g, clients: [], leads: [], explicitClientId: null }).newLead, { fullName: 'דני לוי', email: 'd@x.com', companions: [] });
    equal(matchPeople({ kind: 'intro', guests: [{ email: 'd@x.com' }], clients: [], leads: [], explicitClientId: null }).newLead, null);
    equal(matchPeople({ kind: 'work', guests: g, clients: [], leads: [], explicitClientId: null }).newLead, null);
  }),
  test('שיוך: לקוח שנבחר מהכרטיס גובר על הכול', () => {
    deepEqual(matchPeople({ kind: 'work', guests: [{ email: 'x@x.com' }], clients: [], leads: [], explicitClientId: 'c9' }),
      { clientId: 'c9', leadId: null, newLead: null, addCompanions: [], reopenLead: false });
  }),
  test('פנייה משותפת: האדם השני נשמר בליד החדש — «שותפים עסקיים» כברירת מחדל, או מה שנבחר', () => {
    const m = matchPeople({ kind: 'intro', clients: [], leads: [], explicitClientId: null,
      guests: [{ email: 'avi@x.com', name: 'אבי' }, { email: 'michal@x.com', name: 'מיכל' }, { email: 'ruth@x.com' }],
      relations: { 'ruth@x.com': 'spouse' } });
    deepEqual(m.newLead, { fullName: 'אבי', email: 'avi@x.com', companions: [
      { email: 'michal@x.com', name: 'מיכל', relation: 'partner' },
      { email: 'ruth@x.com', relation: 'spouse' },
    ] });
  }),
  test('פנייה משותפת: מייל של אדם נוסף בפנייה ⇒ אותו ליד, בלי ליד שני', () => {
    const leads = [{ id: 'l1', email: 'avi@x.com', status: 'new', companions: [{ email: 'Michal@x.com', name: 'מיכל', relation: 'partner' }] }];
    const m = matchPeople({ kind: 'intro', guests: [{ email: 'michal@x.com', name: 'מיכל' }], clients: [], leads, explicitClientId: null });
    equal(m.leadId, 'l1');
    equal(m.newLead, null);
    deepEqual(m.addCompanions, []);
  }),
  test('פנייה משותפת: אדם חדש בשיחה עם ליד קיים מצטרף לפנייה; מי שיש לו ליד משלו — לא', () => {
    const leads = [{ id: 'l1', email: 'avi@x.com', status: 'new' }, { id: 'l2', email: 'dana@x.com', status: 'new' }];
    const m = matchPeople({ kind: 'intro', clients: [], leads, explicitClientId: null,
      guests: [{ email: 'avi@x.com' }, { email: 'new@x.com', name: 'חדש' }, { email: 'dana@x.com' }] });
    equal(m.leadId, 'l1');
    deepEqual(m.addCompanions, [{ email: 'new@x.com', name: 'חדש', relation: 'partner' }]);
    deepEqual(matchPeople({ kind: 'work', clients: [], leads, explicitClientId: null,
      guests: [{ email: 'avi@x.com' }, { email: 'new@x.com' }] }).addCompanions, [], 'בפגישת עבודה לא מוסיפים לפנייה');
  }),
  test('ליד סגור: שיחת היכרות חדשה ⇒ נפתח מחדש; פגישת עבודה ⇒ לא', () => {
    const leads = [{ id: 'l1', email: 'avi@x.com', status: 'closed' }];
    equal(matchPeople({ kind: 'intro', guests: [{ email: 'avi@x.com' }], clients: [], leads, explicitClientId: null }).reopenLead, true);
    equal(matchPeople({ kind: 'work', guests: [{ email: 'avi@x.com' }], clients: [], leads, explicitClientId: null }).reopenLead, false);
    equal(matchPeople({ kind: 'intro', guests: [{ email: 'avi@x.com' }], clients: [], leads: [{ ...leads[0], status: 'quoted' }], explicitClientId: null }).reopenLead, false);
  }),
  test('ליד שהומר ⇒ הפגישה בכרטיס שנוצר ממנו', () => {
    const m = matchPeople({ kind: 'intro', guests: [{ email: 'avi@x.com', name: 'אבי' }], clients: [], explicitClientId: null,
      leads: [{ id: 'l1', email: 'avi@x.com', status: 'converted', converted_client_id: 'c7' }] });
    equal(m.clientId, 'c7');
    equal(m.newLead, null);
  }),
  test('איש קשר שמור לא נעשה ליד, ולא נכנס כאדם נוסף בפנייה', () => {
    const m = matchPeople({ kind: 'intro', clients: [], leads: [], explicitClientId: null, contactEmails: ['CPA@x.com'],
      guests: [{ email: 'cpa@x.com', name: 'דנה רו״ח' }] });
    equal(m.newLead, null);
    const m2 = matchPeople({ kind: 'intro', clients: [], leads: [], explicitClientId: null, contactEmails: ['cpa@x.com'],
      guests: [{ email: 'avi@x.com', name: 'אבי' }, { email: 'cpa@x.com', name: 'דנה' }] });
    deepEqual(m2.newLead?.companions, []);
  }),
  test('איחוד אנשים בפנייה: בלי כפילות, מה שנשמר נשאר', () => {
    deepEqual(mergeCompanions([{ email: 'A@x.com', name: 'א', relation: 'spouse' }], [
      { email: 'a@x.com', relation: 'partner' }, { email: 'b@x.com', relation: 'other' },
    ]), [{ email: 'a@x.com', name: 'א', relation: 'spouse' }, { email: 'b@x.com', relation: 'other' }]);
  }),
  test('קלט: הקשר נקרא רק למוזמן השני והלאה; איש קשר דורש שם', () => {
    const base = { id: UUID, kind: 'work', date: '2026-10-08', time: '10:00', durationMin: 30 };
    const p = parseCreate({ ...base, guests: [
      { email: 'a@x.com', relation: 'spouse' },
      { email: 'b@x.com', relation: 'spouse' },
      { email: 'c@x.com', name: 'דנה', contact: { role: 'רו״ח', organization: 'משרד כהן' } },
    ] }, NOW);
    assert(p.ok, 'תקין');
    if (p.ok) {
      deepEqual(p.value.relations, { 'b@x.com': 'spouse' });
      deepEqual(p.value.saveContacts, [{ email: 'c@x.com', fullName: 'דנה', role: 'רו״ח', organization: 'משרד כהן' }]);
    }
    const bad = parseCreate({ ...base, guests: [{ email: 'a@x.com' }, { email: 'c@x.com', contact: { role: 'רו״ח' } }] }, NOW);
    assert(!bad.ok && bad.field === 'contactName', 'איש קשר בלי שם');
  }),

  test('עדכון מהיומן: תשובות לפי מייל, בלי לגעת בשם', () => {
    const s = syncFromEvent({ starts_at: '2026-10-08T07:00:00.000Z', duration_min: 30, guests: [{ email: 'a@x.com', name: 'דני', rsvp: 'none' }, { email: 'b@x.com' }] },
      { start: { dateTime: '2026-10-08T10:00:00+03:00' }, end: { dateTime: '2026-10-08T10:30:00+03:00' },
        attendees: [{ email: 'A@x.com', responseStatus: 'accepted' }] }, '2026-10-06T09:00:00.000Z');
    deepEqual(s.patch.guests, [{ email: 'a@x.com', name: 'דני', rsvp: 'yes' }, { email: 'b@x.com', rsvp: 'none' }]);
    equal(s.history, null);
    equal(s.patch.starts_at, undefined);
  }),
  test('עדכון מהיומן: הוזז ישירות ביומן ⇒ שעה חדשה + רישום', () => {
    const s = syncFromEvent({ starts_at: '2026-10-08T07:00:00.000Z', duration_min: 30, guests: [] },
      { start: { dateTime: '2026-10-08T12:00:00+03:00' }, end: { dateTime: '2026-10-08T13:00:00+03:00' } }, '2026-10-06T09:00:00.000Z');
    equal(s.patch.starts_at, '2026-10-08T09:00:00.000Z');
    equal(s.patch.duration_min, 60);
    equal(s.history?.kind, 'changed_in_google');
  }),
  test('עדכון מהיומן: נמחק ביומן ⇒ בוטלה', () => {
    equal(syncFromEvent({ starts_at: 'x', duration_min: 30, guests: [] }, 'gone', 'n').patch.status, 'canceled');
    equal(syncFromEvent({ starts_at: 'x', duration_min: 30, guests: [] }, { status: 'cancelled' }, 'n').history?.kind, 'canceled_in_google');
  }),
];

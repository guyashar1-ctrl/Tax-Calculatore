// ─── פגישות בהדגמה (?office-app) — calendar-meeting ו-google-calendar-connect בזיכרון ───
// ‼ אותה התנהגות כמו בשרת (supabase/functions/calendar-meeting) ככל שהמסך רואה אותה:
// הנוסח מאותו מודול משותף, «נשלח» רק בהצלחה, ליד נוצר רק בשיחת היכרות עם שם,
// ושליחה חוזרת עם אותו מזהה לא יוצרת פגישה שנייה. שום דבר לא יוצא מהדפדפן.
// כשלים מתוכננים לפי כתובת המוזמן: ‎fail-always‎ — Google דוחה; ‎lost-reply‎ — «לא ידוע»
// בפעם הראשונה ואז מצליח; ‎accepts‎ / ‎declines‎ — כך המוזמן «עונה» בעדכון הבא.
// ‎&nogoogle‎ בכתובת — היומן לא מחובר.

import {
  inviteDescription, meetingTitle, israelToUtcIso, utcToIsrael, MOVE_NOTE_DEFAULT, type InviteOrg,
} from '../../../supabase/functions/_shared/meetingInvite';
import { parseCreate, parseMove, matchPeople } from '../../../supabase/functions/_shared/meetingCore';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';

type Row = Record<string, any>;

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
let connected = !params.has('nogoogle');
const lostOnce = new Set<string>();

/** היום / יום העבודה ה-N (א׳–ה׳) מהיום — כדי שפגישות הדוגמה לא ייפלו על שבת. */
function dayPlus(workdays: number, time: string): string {
  let d = new Date(Date.parse(`${utcToIsrael(new Date().toISOString()).date}T12:00:00Z`));
  for (let n = 0; n < workdays;) {
    d = new Date(d.getTime() + 86400000);
    if (d.getUTCDay() !== 5 && d.getUTCDay() !== 6) n++;
  }
  return israelToUtcIso(d.toISOString().slice(0, 10), time);
}

export function seedMeetings(userId: string, org: InviteOrg): Row[] {
  const mk = (id: string, kind: 'intro' | 'work', startsAt: string, dur: number,
    guests: { email: string; name: string; rsvp: string }[], extra: Row = {}): Row => {
    const input = { kind, guests, durationMin: dur, topic: extra.topic ?? '', prep: extra.prep ?? '', note: extra.note ?? '' };
    return {
      id, user_id: userId, client_id: extra.client_id ?? null, lead_id: extra.lead_id ?? null, kind,
      topic: extra.topic ?? null, prep: extra.prep ?? null, note: extra.note ?? null,
      starts_at: startsAt, duration_min: dur, guests, title: meetingTitle(input, org), description: inviteDescription(input, org),
      status: 'scheduled', google_event_id: `pivo${id.replace(/-/g, '')}`, meet_link: `https://meet.google.com/abc-${id.slice(0, 4)}-xyz`,
      html_link: null, sent_at: new Date(Date.now() - 86400000).toISOString(), history: [{ at: new Date(Date.now() - 86400000).toISOString(), kind: 'sent' }],
      created_at: new Date(Date.now() - 86400000).toISOString(),
    };
  };
  return [
    mk('0a1b2c3d-0000-4000-8000-000000000001', 'work', dayPlus(0, '18:30'), 45,
      [{ email: 'david@example.com', name: 'דוד כהן', rsvp: 'yes' }],
      { client_id: 'sample-1', topic: 'סגירת הדוח השנתי 2025', prep: 'טופס 106\nאישורי ניכוי מס' }),
    mk('0a1b2c3d-0000-4000-8000-000000000002', 'intro', dayPlus(1, '09:30'), 30,
      [{ email: 'noa.levi@example.com', name: 'נועה לוי', rsvp: 'none' }]),
    mk('0a1b2c3d-0000-4000-8000-000000000003', 'intro', dayPlus(2, '11:00'), 30,
      [{ email: 'avi.p@example.com', name: 'אבי פרץ', rsvp: 'yes' }, { email: 'michal.p@example.com', name: 'מיכל פרץ', rsvp: 'none' }]),
  ];
}

export function fakeGoogleStatus(): Row {
  return connected ? { connected: true, email: 'office@example-cpa.co.il', connectedAt: new Date().toISOString(), lastError: null } : { connected: false };
}

export function fakeMeetingsInvoke(name: string, body: Row, tables: Record<string, Row[]>, userId: string, org: InviteOrg): { data: Row; error: null } {
  const ok = (data: Row) => ({ data, error: null as null });
  const fail = (error: string, detail?: Row) => ok({ ok: false, error, ...(detail ? { detail } : {}) });

  if (name === 'google-calendar-connect') {
    if (body.action === 'disconnect') { connected = false; return ok({ ok: true }); }
    // החיבור «מצליח» מיד: חוזרים לאותו עמוד עם ?google=connected, כמו שהשרת מחזיר.
    // ‼ החזרה טוענת את הדף מחדש וההדגמה נשכחת — ‎&nogoogle‎ יורד, אחרת היה כתוב
    // «היומן חובר» ליד «לא מחובר».
    connected = true;
    const u = new URL(String(body.returnTo ?? window.location.href));
    u.searchParams.delete('nogoogle');
    u.searchParams.set('google', 'connected');
    return ok({ ok: true, url: u.toString() });
  }

  const meetings = (tables.meetings ??= []);
  const now = new Date();
  const nowIso = now.toISOString();
  if (!connected && body.action !== 'sync') return fail('google_not_connected');

  if (body.action === 'freebusy') {
    const date = String(body.date);
    const busy = meetings.filter(m => m.status === 'scheduled' && utcToIsrael(m.starts_at).date === date).map(m => {
      const s = utcToIsrael(m.starts_at).time;
      const e = utcToIsrael(new Date(Date.parse(m.starts_at) + m.duration_min * 60000).toISOString()).time;
      return { start: s, end: e };
    });
    // אירוע שאינו מ-PIVO — כדי שיהיה מה לראות ב«תפוס».
    busy.push({ start: '13:00', end: '14:00' });
    return ok({ ok: true, busy });
  }

  if (body.action === 'create') {
    const p = parseCreate(body, now.getTime());
    if (!p.ok) return fail('bad_input', { field: p.field });
    const input = p.value;
    const existing = meetings.find(m => m.id === input.id);
    if (existing?.status === 'scheduled') return ok({ ok: true, meeting: existing });
    const emails = input.guests.map(g => g.email).join(' ');
    if (/fail-always/.test(emails)) {
      if (!existing) meetings.push({ id: input.id, user_id: userId, status: 'failed', kind: input.kind, guests: input.guests, starts_at: israelToUtcIso(input.date, input.time), duration_min: input.durationMin, title: '', description: '', history: [] });
      return fail('google_failed', { message: 'Invalid attendee email.', status: 400 });
    }
    const row: Row = existing ?? {
      id: input.id, user_id: userId, client_id: input.clientId, lead_id: null, kind: input.kind,
      topic: input.topic || null, prep: input.prep || null, note: input.note || null,
      starts_at: israelToUtcIso(input.date, input.time), duration_min: input.durationMin,
      guests: input.guests.map(g => ({ ...g, rsvp: 'none' })), title: meetingTitle(input, org), description: inviteDescription(input, org),
      status: 'sending', history: [], created_at: nowIso,
    };
    if (!existing) meetings.push(row);
    if (/lost-reply/.test(emails) && !lostOnce.has(input.id)) {
      lostOnce.add(input.id);
      row.status = 'unknown';
      return fail('unknown_outcome', { message: 'Backend Error' });
    }
    Object.assign(row, {
      status: 'scheduled', sent_at: nowIso, google_event_id: `pivo${input.id.replace(/-/g, '')}`,
      meet_link: `https://meet.google.com/new-${input.id.slice(0, 4)}-dem`, history: [...(row.history ?? []), { at: nowIso, kind: 'sent' }],
    });
    if (!row.client_id) {
      const clients = SAMPLE_CLIENTS.map(c => ({ id: c.id, email: c.email ?? null, spouse_email: c.spouseEmail ?? null }));
      const match = matchPeople({ kind: row.kind, guests: row.guests, clients, leads: (tables.leads ?? []).map(l => ({ id: l.id, email: l.email, status: l.status })), explicitClientId: null });
      if (match.clientId) row.client_id = match.clientId;
      else if (match.newLead) {
        const lead = { id: `lead-${Date.now()}`, user_id: userId, full_name: match.newLead.fullName, email: match.newLead.email, status: 'new', source: 'accountant', has_previous_accountant: false, created_at: nowIso, updated_at: nowIso };
        (tables.leads ??= []).unshift(lead);
        row.lead_id = lead.id;
      } else if (match.leadId) row.lead_id = match.leadId;
    }
    return ok({ ok: true, meeting: row });
  }

  if (body.action === 'move') {
    const p = parseMove(body, now.getTime());
    if (!p.ok) return fail('bad_input', { field: p.field });
    const row = meetings.find(m => m.id === p.value.id);
    if (!row) return fail('not_found');
    if (row.status !== 'scheduled') return fail('not_scheduled');
    const to = israelToUtcIso(p.value.date, p.value.time);
    const input = { kind: row.kind, guests: row.guests, durationMin: p.value.durationMin, topic: row.topic ?? '', prep: row.prep ?? '', note: row.note ?? '' };
    Object.assign(row, {
      description: inviteDescription(input, org, { date: p.value.date, time: p.value.time, note: p.value.note || MOVE_NOTE_DEFAULT[p.value.askedBy] }),
      history: [...row.history, { at: nowIso, kind: 'moved', from: row.starts_at, to, askedBy: p.value.askedBy }],
      starts_at: to, duration_min: p.value.durationMin,
    });
    return ok({ ok: true, meeting: row });
  }

  if (body.action === 'cancel') {
    const row = meetings.find(m => m.id === body.id);
    if (!row) return fail('not_found');
    Object.assign(row, { status: 'canceled', canceled_at: nowIso, history: [...row.history, { at: nowIso, kind: 'canceled' }] });
    return ok({ ok: true, meeting: row });
  }

  if (body.action === 'sync') {
    let updated = 0;
    for (const m of meetings) {
      if (m.status !== 'scheduled') continue;
      const guests = m.guests.map((g: Row) => ({ ...g, rsvp: /accepts/.test(g.email) ? 'yes' : /declines/.test(g.email) ? 'no' : g.rsvp ?? 'none' }));
      if (JSON.stringify(guests) !== JSON.stringify(m.guests)) { m.guests = guests; updated++; }
    }
    return ok({ ok: true, updated });
  }

  return fail('unknown_action');
}

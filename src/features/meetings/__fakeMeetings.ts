// ─── פגישות בהדגמה (?office-app) — calendar-meeting ו-google-calendar-connect בזיכרון ───
// ‼ אותה התנהגות כמו בשרת (supabase/functions/calendar-meeting) ככל שהמסך רואה אותה:
// הנוסח מאותו מודול משותף, «נשלח» רק בהצלחה, ליד נוצר רק בשיחת היכרות עם שם,
// ושליחה חוזרת עם אותו מזהה לא יוצרת פגישה שנייה. שום דבר לא יוצא מהדפדפן.
// כשלים מתוכננים לפי כתובת המוזמן: ‎fail-always‎ — Google דוחה; ‎lost-reply‎ — «לא ידוע»
// בפעם הראשונה ואז מצליח; ‎accepts‎ / ‎declines‎ — כך המוזמן «עונה» בעדכון הבא.
// ‎&nogoogle‎ בכתובת — היומן לא מחובר.
// (226) גם: לידים עם «אנשים בפנייה», ליד סגור, אנשי קשר, ו«הפרד לליד נפרד» — באותה
// התנהגות כמו בשרת (matchPeople / mergeCompanions / split_lead_companion).
// (סבב 3) גם: «מי זה?» (saveAs), והיומן (events) — הפגישות של PIVO ועוד כמה אירועים «אישיים»
// שאינם מ-PIVO (ישיבת צוות, ארוחת צהריים, יום שלם), כדי שלשונית «יומן» תיראה כמו ביומן אמיתי.

import {
  inviteDescription, meetingTitle, meetingTemplateFor, israelToUtcIso, utcToIsrael, MOVE_NOTE_DEFAULT,
  type InviteOrg, type MeetingKind,
} from '../../../supabase/functions/_shared/meetingInvite';
import {
  parseCreate, parseMove, parseRange, matchPeople, mergeCompanions, calendarEventsFrom,
  type PeopleOutcome, type GoogleListItem,
} from '../../../supabase/functions/_shared/meetingCore';
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

const low = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** לידים ואנשי קשר להדגמה — פנייה משותפת (אבי + מיכל + רון), ליד סגור, ושלושה אנשי קשר. */
export function seedPeople(userId: string): { leads: Row[]; contacts: Row[] } {
  const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const lead = (id: string, full_name: string, email: string, status: string, extra: Row = {}): Row => ({
    id, user_id: userId, full_name, email, status, source: 'accountant', has_previous_accountant: false,
    companions: [], created_at: ago(extra.days ?? 2), updated_at: ago(extra.days ?? 2), ...extra,
  });
  const contact = (id: string, full_name: string, role: string, organization: string, email: string, phone: string | null): Row => ({
    id, user_id: userId, full_name, role, organization, email, phone, notes: null, created_at: ago(20), updated_at: ago(20),
  });
  return {
    leads: [
      lead('lead-demo-avi', 'אבי פרץ', 'avi.p@example.com', 'new', {
        business_name: 'פרץ עיצובים', referral_source: 'חבר', days: 1,
        companions: [
          { name: 'מיכל פרץ', email: 'michal.p@example.com', relation: 'spouse' },
          { name: 'רון שגיא', email: 'ron.s@example.com', relation: 'partner' },
        ],
      }),
      lead('lead-demo-noa', 'נועה לוי', 'noa.levi@example.com', 'new', { days: 1 }),
      lead('lead-demo-shai', 'שי אורן', 'shai.o@example.com', 'closed', { days: 60 }),
    ],
    contacts: [
      contact('ct-demo-ronit', 'רונית אברהם', 'רו״ח', 'אברהם ושות׳', 'ronit@avraham-cpa.example', '03-5551234'),
      contact('ct-demo-yael', 'יעל ברק', 'עו״ד', 'ברק ושות׳ משרד עורכי דין', 'yael@barak-law.example', null),
      contact('ct-demo-dani', 'דני שגב', 'יועץ/ת פנסיוני/ת', 'הראל', 'dani.s@example.com', '052-5550000'),
    ],
  };
}

/** «הפרד לליד נפרד» בהדגמה — אותם כללים כמו split_lead_companion (226). */
/** (228) «העבר ללידים» — כמו move_contact_to_lead: לקוח ⇒ סירוב; ליד פתוח באותו מייל ⇒ אותו ליד; לא נמחק. */
export function fakeMoveContactToLead(tables: Record<string, Row[]>, userId: string, args: Row): Row {
  const contacts = (tables.contacts ??= []);
  const c = contacts.find(x => x.id === args.p_contact_id);
  if (!c) return { ok: false, error: 'contact_not_found' };
  if (c.moved_to_lead_id) return { ok: true, leadId: c.moved_to_lead_id, existing: true, already: true };
  const email = low(c.email);
  const client = email ? SAMPLE_CLIENTS.find(x => low(x.email) === email || low(x.spouseEmail) === email) : undefined;
  if (client) return { ok: false, error: 'is_client', clientId: client.id };
  const leads = (tables.leads ??= []);
  const existing = email ? leads.find(l => low(l.email) === email && !l.converted_client_id && l.status !== 'closed') : undefined;
  let leadId = existing?.id as string | undefined;
  if (!leadId) {
    const now = new Date().toISOString();
    const notes = [['הועבר מאנשי הקשר', c.role, c.organization].filter(Boolean).join(' · '), c.notes].filter(Boolean).join('\n');
    leadId = `lead-${Date.now()}`;
    leads.unshift({ id: leadId, user_id: userId, full_name: c.full_name, email: email || null, phone: c.phone ?? null, notes,
      status: 'new', source: 'accountant', has_previous_accountant: false, companions: [], created_at: now, updated_at: now });
  }
  // ‼ כמו בשרת: לא נמחק — מסומן «עבר ללידים».
  Object.assign(c, { moved_to_lead_id: leadId, moved_at: new Date().toISOString() });
  return { ok: true, leadId, existing: !!existing };
}

export function fakeSplitLeadCompanion(tables: Record<string, Row[]>, userId: string, args: Row): Row {
  const leads = (tables.leads ??= []);
  const l = leads.find(x => x.id === args.p_lead_id);
  if (!l) return { ok: false, error: 'lead_not_found' };
  const email = low(args.p_email);
  const comp = (l.companions ?? []).find((c: Row) => low(c.email) === email);
  if (!comp) {
    const done = leads.find(x => x.split_from_lead_id === l.id && low(x.email) === email);
    return done ? { ok: true, leadId: done.id, already: true } : { ok: false, error: 'companion_not_found' };
  }
  const client = SAMPLE_CLIENTS.find(c => low(c.email) === email || low(c.spouseEmail) === email);
  if (client) return { ok: false, error: 'is_client', clientId: client.id };
  let target = leads.find(x => x.id !== l.id && low(x.email) === email && !x.converted_client_id && x.status !== 'closed');
  if (!target) {
    const name = String(args.p_name ?? '').trim() || String(comp.name ?? '').trim();
    if (!name) return { ok: false, error: 'name_required' };
    const now = new Date().toISOString();
    target = {
      id: `lead-${Date.now()}`, user_id: userId, full_name: name, email, status: 'new', source: 'accountant',
      business_name: l.business_name ?? null, referral_source: l.referral_source ?? null, split_from_lead_id: l.id,
      has_previous_accountant: false, companions: [], created_at: now, updated_at: now,
    };
    leads.unshift(target);
  }
  l.companions = (l.companions ?? []).filter((c: Row) => low(c.email) !== email);
  return { ok: true, leadId: target.id };
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
      [{ email: 'noa.levi@example.com', name: 'נועה לוי', rsvp: 'none' }], { lead_id: 'lead-demo-noa' }),
    mk('0a1b2c3d-0000-4000-8000-000000000003', 'intro', dayPlus(2, '11:00'), 30,
      [{ email: 'avi.p@example.com', name: 'אבי פרץ', rsvp: 'yes' }, { email: 'michal.p@example.com', name: 'מיכל פרץ', rsvp: 'none' }],
      { lead_id: 'lead-demo-avi' }),
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
  // ‼ כמו בשרת: הנוסח שהמשרד שמר (settings.commTemplates) — מהפרופיל של ההדגמה.
  const tpl = (kind: MeetingKind) => meetingTemplateFor(kind, (tables.profiles?.[0]?.settings as Row | undefined)?.commTemplates);
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

  if (body.action === 'events') {
    const rg = parseRange(body);
    if (!rg.ok) return fail('bad_input', { field: rg.field });
    const items: GoogleListItem[] = meetings.filter(m => m.status === 'scheduled').map(m => ({
      id: m.google_event_id ?? `pivo${String(m.id).replace(/-/g, '')}`, status: 'confirmed', summary: m.title,
      start: { dateTime: m.starts_at }, end: { dateTime: new Date(Date.parse(m.starts_at) + m.duration_min * 60000).toISOString() },
    }));
    // אירועים שאינם מ-PIVO — בכל יום עבודה בטווח.
    for (let d = rg.from; d < rg.to; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
      const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (wd === 6) continue;
      const at = (t: string) => israelToUtcIso(d, t);
      if (wd === 0) items.push({ id: `g-team-${d}`, summary: 'ישיבת צוות', start: { dateTime: at('09:00') }, end: { dateTime: at('09:30') } });
      if (wd >= 1 && wd <= 4) items.push({ id: `g-lunch-${d}`, summary: 'ארוחת צהריים', start: { dateTime: at('13:00') }, end: { dateTime: at('14:00') } });
      if (wd === 2) items.push({ id: `g-bank-${d}`, summary: 'פגישה בבנק', start: { dateTime: at('10:00') }, end: { dateTime: at('11:00') } });
      if (wd === 3) items.push({ id: `g-kids-${d}`, summary: 'איסוף ילדים', start: { dateTime: at('16:30') }, end: { dateTime: at('17:00') }, transparency: 'transparent' });
      if (wd === 4) items.push({ id: `g-vat-${d}`, summary: 'מועד דיווח מע״מ', start: { date: d }, end: { date: new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) } });
    }
    const known = new Set(meetings.map(m => String(m.id)));
    const t0 = israelToUtcIso(rg.from, '00:00'), t1 = israelToUtcIso(rg.to, '00:00');
    const inRange = items.filter(e => (e.start?.date ? e.start.date >= rg.from && e.start.date < rg.to
      : String(e.start?.dateTime) < t1 && String(e.end?.dateTime) > t0));
    return ok({ ok: true, from: rg.from, to: rg.to, events: calendarEventsFrom(inRange, known) });
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
      guests: input.guests.map(g => ({ ...g, rsvp: 'none' })),
      title: meetingTitle(input, org, tpl(input.kind)), description: inviteDescription(input, org, undefined, tpl(input.kind)),
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
    const people: PeopleOutcome = { leadCreated: false, leadReopened: false, companionsAdded: 0, contactsSaved: 0, extraLeadsCreated: 0 };
    const contacts = (tables.contacts ??= []);
    for (const c of input.saveContacts) {
      // ‼ כמו האינדקס הייחודי בשרת: גם מי שעבר ללידים תופס את המייל.
      if (contacts.some(x => low(x.email) === c.email)) continue;
      contacts.push({ id: `ct-${Date.now()}-${people.contactsSaved}`, user_id: userId, full_name: c.fullName, email: c.email,
        role: c.role || null, organization: c.organization || null, phone: null, notes: null, created_at: nowIso, updated_at: nowIso });
      people.contactsSaved++;
    }
    {
      const clients = SAMPLE_CLIENTS.map(c => ({ id: c.id, email: c.email ?? null, spouse_email: c.spouseEmail ?? null }));
      const leads = (tables.leads ??= []);
      const match = matchPeople({
        kind: row.kind, guests: row.guests, clients, explicitClientId: row.client_id ?? null,
        leads: leads.map(l => ({ id: l.id, email: l.email, status: l.status, companions: l.companions, converted_client_id: l.converted_client_id })),
        contactEmails: contacts.filter(c => !c.moved_to_lead_id).map(c => c.email), relations: input.relations, saveAs: input.saveAs,
      });
      if (match.clientId) row.client_id = match.clientId;
      if (match.newLead) {
        const lead = { id: `lead-${Date.now()}`, user_id: userId, full_name: match.newLead.fullName, email: match.newLead.email, status: 'new', source: 'accountant', has_previous_accountant: false, companions: match.newLead.companions, created_at: nowIso, updated_at: nowIso };
        leads.unshift(lead);
        row.lead_id = lead.id;
        people.leadCreated = true;
        people.companionsAdded = match.newLead.companions.length;
      } else if (match.leadId) {
        row.lead_id = match.leadId;
        const l = leads.find(x => x.id === match.leadId);
        if (l && match.addCompanions.length) { l.companions = mergeCompanions(l.companions, match.addCompanions); people.companionsAdded = match.addCompanions.length; }
        if (l && match.reopenLead && l.status === 'closed') { l.status = 'new'; people.leadReopened = true; }
      }
      match.extraLeads.forEach((x, i) => {
        const lead = { id: `lead-${Date.now()}-${i}`, user_id: userId, full_name: x.fullName, email: x.email, status: 'new', source: 'accountant', has_previous_accountant: false, companions: [], created_at: nowIso, updated_at: nowIso };
        leads.unshift(lead);
        row.lead_id ??= lead.id;
        people.extraLeadsCreated = (people.extraLeadsCreated ?? 0) + 1;
      });
    }
    return ok({ ok: true, meeting: row, people });
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
      description: inviteDescription(input, org, { date: p.value.date, time: p.value.time, note: p.value.note || MOVE_NOTE_DEFAULT[p.value.askedBy] }, tpl(row.kind)),
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

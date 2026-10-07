// ═══════════════════════════════════════════════════════════════════════════
//  פגישות — ההחלטות הטהורות של calendar-meeting
// ═══════════════════════════════════════════════════════════════════════════
//  בדיקת קלט, שיוך ללקוח/ליד, ועדכון מהיומן. בלי Deno API ובלי רשת —
//  כדי שבדיקות היחידה יריצו את אותו קוד שרץ בשרת.
// ═══════════════════════════════════════════════════════════════════════════

import {
  MEETING_KINDS, isValidEmail, israelToUtcIso, type MeetingKind, type MeetingGuest, type MoveAskedBy,
} from './meetingInvite.ts';
import { rsvpFromGoogle, type GoogleEvent, type Rsvp } from './googleCalendar.ts';

export interface CreateInput {
  id: string;
  kind: MeetingKind;
  guests: MeetingGuest[];
  date: string;
  time: string;
  durationMin: number;
  topic: string;
  prep: string;
  note: string;
  clientId: string | null;
}

export interface MoveInput {
  id: string;
  date: string;
  time: string;
  durationMin: number;
  askedBy: MoveAskedBy;
  note: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function parseWhen(b: Record<string, unknown>, nowMs: number): Parsed<{ date: string; time: string; durationMin: number }> {
  const date = str(b.date, 10), time = str(b.time, 5);
  if (!DATE_RE.test(date)) return { ok: false, field: 'date' };
  if (!TIME_RE.test(time)) return { ok: false, field: 'time' };
  const durationMin = Number(b.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 10 || durationMin > 240) return { ok: false, field: 'durationMin' };
  // ‼ חמש דקות חסד: מי שקובע «עכשיו» לא נדחה בגלל שעון מכשיר שמקדים.
  if (new Date(israelToUtcIso(date, time)).getTime() < nowMs - 5 * 60000) return { ok: false, field: 'past' };
  return { ok: true, value: { date, time, durationMin } };
}

export function parseCreate(body: unknown, nowMs: number): Parsed<CreateInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = str(b.id, 36);
  if (!UUID_RE.test(id)) return { ok: false, field: 'id' };
  const kind = b.kind as MeetingKind;
  if (!MEETING_KINDS.includes(kind)) return { ok: false, field: 'kind' };
  if (!Array.isArray(b.guests) || b.guests.length === 0 || b.guests.length > 10) return { ok: false, field: 'guests' };
  const guests: MeetingGuest[] = [];
  for (const g of b.guests as Record<string, unknown>[]) {
    const email = str(g?.email, 254).toLowerCase();
    if (!isValidEmail(email)) return { ok: false, field: 'guests' };
    if (guests.some(x => x.email === email)) continue;
    const name = str(g?.name, 80);
    guests.push(name ? { email, name } : { email });
  }
  const when = parseWhen(b, nowMs);
  if (!when.ok) return when;
  const clientId = str(b.clientId, 64) || null;
  return {
    ok: true,
    value: { id, kind, guests, ...when.value, topic: str(b.topic, 120), prep: str(b.prep, 1000), note: str(b.note, 500), clientId },
  };
}

export function parseMove(body: unknown, nowMs: number): Parsed<MoveInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = str(b.id, 36);
  if (!UUID_RE.test(id)) return { ok: false, field: 'id' };
  const askedBy = b.askedBy === 'guest' ? 'guest' : b.askedBy === 'office' ? 'office' : null;
  if (!askedBy) return { ok: false, field: 'askedBy' };
  const when = parseWhen(b, nowMs);
  if (!when.ok) return when;
  return { ok: true, value: { id, ...when.value, askedBy, note: str(b.note, 500) } };
}

// ─── שיוך: לקוח קיים, ליד קיים, או ליד חדש ─────────────────────────────────

export interface ClientRow { id: string; email: string | null; spouse_email: string | null }
export interface LeadRow { id: string; email: string | null; status: string | null }

export interface PeopleMatch {
  clientId: string | null;
  leadId: string | null;
  /** ליד חדש — רק בשיחת היכרות, רק לאדם הראשון, ורק כשיש לו שם (leads.full_name חובה). */
  newLead: { fullName: string; email: string } | null;
}

const low = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * ‼ אדם אחד = רשומה אחת: מייל של לקוח קיים (או של בן/בת הזוג שלו) ⇒ הפגישה בכרטיס שלו.
 * מייל של ליד קיים ⇒ אותו ליד, בלי ליד שני. רק אדם חדש לגמרי בשיחת היכרות נעשה ליד.
 * בפגישת עבודה לא נוצר ליד: אדם לא מוכר שם הוא לרוב מנהל חשבונות או שותף, לא לקוח פוטנציאלי.
 */
export function matchPeople(a: {
  kind: MeetingKind; guests: MeetingGuest[]; clients: ClientRow[]; leads: LeadRow[]; explicitClientId: string | null;
}): PeopleMatch {
  if (a.explicitClientId) return { clientId: a.explicitClientId, leadId: null, newLead: null };
  for (const g of a.guests) {
    const c = a.clients.find(x => low(x.email) === g.email || low(x.spouse_email) === g.email);
    if (c) return { clientId: c.id, leadId: null, newLead: null };
  }
  const primary = a.guests[0];
  if (!primary) return { clientId: null, leadId: null, newLead: null };
  const matches = a.leads.filter(l => low(l.email) === primary.email);
  const lead = matches.find(l => l.status !== 'closed') ?? matches[0];
  if (lead) return { clientId: null, leadId: lead.id, newLead: null };
  const name = (primary.name ?? '').trim();
  if (a.kind === 'intro' && name) return { clientId: null, leadId: null, newLead: { fullName: name, email: primary.email } };
  return { clientId: null, leadId: null, newLead: null };
}

// ─── עדכון מהיומן: Google הוא מקור האמת לשעה ולתשובות ─────────────────────

export interface StoredGuest { email: string; name?: string; rsvp?: Rsvp }

export interface HistoryEntry {
  at: string;
  kind: 'sent' | 'moved' | 'canceled' | 'changed_in_google' | 'canceled_in_google';
  from?: string;
  to?: string;
  askedBy?: MoveAskedBy;
}

export interface SyncResult {
  patch: Record<string, unknown>;
  history: HistoryEntry | null;
}

export function syncFromEvent(
  m: { starts_at: string; duration_min: number; guests: StoredGuest[] },
  e: GoogleEvent | 'gone',
  nowIso: string,
): SyncResult {
  if (e === 'gone' || e.status === 'cancelled') {
    return { patch: { status: 'canceled', canceled_at: nowIso, rsvp_checked_at: nowIso }, history: { at: nowIso, kind: 'canceled_in_google' } };
  }
  const byEmail = new Map((e.attendees ?? []).map(x => [low(x.email), rsvpFromGoogle(x.responseStatus)]));
  const guests = m.guests.map(g => ({ ...g, rsvp: byEmail.get(low(g.email)) ?? g.rsvp ?? 'none' }));
  const patch: Record<string, unknown> = { guests, rsvp_checked_at: nowIso };
  let history: HistoryEntry | null = null;
  const s = e.start?.dateTime ? new Date(e.start.dateTime).getTime() : NaN;
  const en = e.end?.dateTime ? new Date(e.end.dateTime).getTime() : NaN;
  if (Number.isFinite(s) && s !== new Date(m.starts_at).getTime()) {
    const startsAt = new Date(s).toISOString();
    patch.starts_at = startsAt;
    history = { at: nowIso, kind: 'changed_in_google', from: m.starts_at, to: startsAt };
  }
  if (Number.isFinite(s) && Number.isFinite(en)) {
    const dur = Math.round((en - s) / 60000);
    if (dur >= 10 && dur <= 240 && dur !== m.duration_min) patch.duration_min = dur;
  }
  return { patch, history };
}

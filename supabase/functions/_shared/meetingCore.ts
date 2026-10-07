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

// ─── מי עוד בפנייה (226) ─────────────────────────────────────────────────────
// ‼ אותם שמות בתפקיד «אנשי קשר נוספים» שהטריגר tg_carry_lead_companions כותב בכרטיס
//   כשהליד נעשה לקוח (supabase/226-lead-companions-contacts.sql) — לשנות בשני המקומות.
export const COMPANION_RELATIONS = ['partner', 'spouse', 'other'] as const;
export type CompanionRelation = typeof COMPANION_RELATIONS[number];
export const COMPANION_RELATION_LABELS: Record<CompanionRelation, string> = {
  partner: 'שותף/ה עסקי/ת',
  spouse: 'בן/בת זוג',
  other: 'אחר/ת',
};
/** ברירת המחדל לאדם השני בשיחת היכרות — החלטת גיא (07.10.2026). */
export const DEFAULT_COMPANION_RELATION: CompanionRelation = 'partner';

export interface Companion {
  email: string;
  name?: string;
  relation: CompanionRelation;
}

/**
 * «מי זה?» לאדם חדש בחלון (סבב 3, 07.10.2026): לקוח פוטנציאלי ⇒ ליד (או אדם נוסף בפנייה של
 * מי שבא איתו), איש מקצוע ⇒ אנשי קשר, או רק מוזמן — לא נשמר. ‼ בלי saveAs (גרסה ישנה של
 * המסך) — ההתנהגות של סבב 2: ליד רק בשיחת היכרות, ואנשים נוספים בפנייה.
 */
export const SAVE_AS = ['lead', 'contact', 'none'] as const;
export type SaveAs = typeof SAVE_AS[number];

/** איש קשר שנשמר מהזימון — מי שאינו לקוח ואינו ליד (רו״ח אחר, עו״ד…). */
export interface NewContact {
  email: string;
  fullName: string;
  role: string;
  organization: string;
}

export interface CreateInput {
  id: string;
  kind: MeetingKind;
  guests: MeetingGuest[];
  /** הקשר של כל מוזמן נוסף לראשון — לפי מייל. */
  relations: Record<string, CompanionRelation>;
  /** «מי זה?» שנבחר לאדם חדש — לפי מייל. */
  saveAs: Record<string, SaveAs>;
  saveContacts: NewContact[];
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
  const relations: Record<string, CompanionRelation> = {};
  const saveAs: Record<string, SaveAs> = {};
  const saveContacts: NewContact[] = [];
  for (const g of b.guests as Record<string, unknown>[]) {
    const email = str(g?.email, 254).toLowerCase();
    if (!isValidEmail(email)) return { ok: false, field: 'guests' };
    if (guests.some(x => x.email === email)) continue;
    const name = str(g?.name, 80);
    if (guests.length > 0 && COMPANION_RELATIONS.includes(g?.relation as CompanionRelation)) {
      relations[email] = g.relation as CompanionRelation;
    }
    if (SAVE_AS.includes(g?.saveAs as SaveAs)) saveAs[email] = g.saveAs as SaveAs;
    // ‼ ליד בלי שם הוא רק כתובת — leads.full_name חובה.
    if (saveAs[email] === 'lead' && !name) return { ok: false, field: 'leadName' };
    const c = g?.contact as Record<string, unknown> | undefined;
    if (c && typeof c === 'object') {
      // ‼ איש קשר בלי שם הוא רק כתובת — contacts.full_name חובה.
      if (!name) return { ok: false, field: 'contactName' };
      saveContacts.push({ email, fullName: name, role: str(c.role, 60), organization: str(c.organization, 120) });
      saveAs[email] = 'contact';
    } else if (saveAs[email] === 'contact') {
      return { ok: false, field: 'contact' };
    }
    guests.push(name ? { email, name } : { email });
  }
  const when = parseWhen(b, nowMs);
  if (!when.ok) return when;
  const clientId = str(b.clientId, 64) || null;
  return {
    ok: true,
    value: {
      id, kind, guests, relations, saveAs, saveContacts, ...when.value,
      topic: str(b.topic, 120), prep: str(b.prep, 1000), note: str(b.note, 500), clientId,
    },
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
export interface LeadRow {
  id: string;
  email: string | null;
  status: string | null;
  companions?: { email?: string | null; name?: string | null; relation?: string | null }[] | null;
  converted_client_id?: string | null;
}

export interface PeopleMatch {
  clientId: string | null;
  leadId: string | null;
  /** ליד חדש — רק בשיחת היכרות, לאדם הראשון, ורק כשיש לו שם (leads.full_name חובה). */
  newLead: { fullName: string; email: string; companions: Companion[] } | null;
  /** אנשים חדשים בפנייה של ליד קיים (שיחת היכרות בלבד). */
  addCompanions: Companion[];
  /** ליד סגור שנקבעה איתו שיחת היכרות חדשה — חוזר להיות «חדש». */
  reopenLead: boolean;
  /**
   * (סבב 3) אנשים שסומנו «לקוח פוטנציאלי» ואינם בפנייה של ליד בפגישה הזו — כל אחד ליד משלו.
   * למשל לקוח קיים שמביא איתו חבר לפגישת עבודה.
   */
  extraLeads: { fullName: string; email: string }[];
}

/** מה קרה לאנשים אחרי שהזימון יצא — למסך «נשלח». נכתב רק במה שבאמת נשמר. */
export interface PeopleOutcome {
  leadCreated: boolean;
  leadReopened: boolean;
  companionsAdded: number;
  contactsSaved: number;
  /** (סבב 3) לידים נוספים שנוצרו — extraLeads. חסר בשרת ישן. */
  extraLeadsCreated?: number;
}

const low = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

const NONE: PeopleMatch = { clientId: null, leadId: null, newLead: null, addCompanions: [], reopenLead: false, extraLeads: [] };

/** הליד שהמייל הזה שייך לו — כראשי או כאדם נוסף בפנייה. פתוח גובר על סגור, וסגור על שהומר. */
export function leadForEmail(leads: LeadRow[], email: string): LeadRow | undefined {
  const e = low(email);
  const ms = leads.filter(l => low(l.email) === e || (l.companions ?? []).some(c => low(c?.email) === e));
  const converted = (l: LeadRow) => !!l.converted_client_id || l.status === 'converted';
  return ms.find(l => !converted(l) && l.status !== 'closed')
    ?? ms.find(l => !converted(l))
    ?? ms.find(l => !!l.converted_client_id);
}

/**
 * ‼ אדם אחד = רשומה אחת: מייל של לקוח קיים (או של בן/בת הזוג שלו) ⇒ הפגישה בכרטיס שלו.
 * מייל של ליד קיים — כראשי או כאדם נוסף בפנייה שלו ⇒ אותו ליד, בלי ליד שני; ליד שכבר
 * הומר ⇒ הכרטיס שנוצר ממנו. רק אדם חדש לגמרי בשיחת היכרות נעשה ליד, והאנשים שהגיעו איתו
 * נשמרים בפנייה שלו (relation, ברירת מחדל «שותפים עסקיים») — עד שמפרידים אותם.
 * בפגישת עבודה לא נוצר ליד ולא נוספים אנשים לפנייה: אדם לא מוכר שם הוא לרוב מנהל חשבונות,
 * רו״ח אחר או שותף — לשם כך «שמור כאיש קשר». איש קשר שמור לעולם אינו נעשה ליד מעצמו.
 * (סבב 3) «מי זה?» גובר: «לקוח פוטנציאלי» נעשה ליד גם בפגישת עבודה — בפנייה של מי שבא איתו
 * כשיש פנייה בשיחת היכרות, ואחרת ליד משלו (extraLeads); «רק מוזמן» לא נשמר בשום מקום.
 */
export function matchPeople(a: {
  kind: MeetingKind;
  guests: MeetingGuest[];
  clients: ClientRow[];
  leads: LeadRow[];
  explicitClientId: string | null;
  contactEmails?: string[];
  relations?: Record<string, CompanionRelation>;
  saveAs?: Record<string, SaveAs>;
}): PeopleMatch {
  const contacts = new Set((a.contactEmails ?? []).map(low));
  const said = (email: string) => a.saveAs?.[low(email)];
  const clientOf = (email: string) => a.clients.find(x => low(x.email) === low(email) || low(x.spouse_email) === low(email));
  /** «לקוח פוטנציאלי» שאינו מוכר בשום מקום ⇒ ליד משלו. */
  const extraLeads = (skip: Set<string>) => a.guests
    .filter(g => {
      const e = low(g.email);
      return said(e) === 'lead' && !!g.name?.trim() && !skip.has(e)
        && !clientOf(e) && !leadForEmail(a.leads, e) && !contacts.has(e);
    })
    .map(g => ({ fullName: g.name!.trim(), email: low(g.email) }));

  if (a.explicitClientId) return { ...NONE, clientId: a.explicitClientId, extraLeads: extraLeads(new Set()) };
  for (const g of a.guests) {
    const c = clientOf(g.email);
    if (c) return { ...NONE, clientId: c.id, extraLeads: extraLeads(new Set()) };
  }
  const primary = a.guests[0];
  if (!primary) return NONE;

  let lead: LeadRow | undefined;
  for (const g of a.guests) {
    lead = leadForEmail(a.leads, g.email);
    if (lead) break;
  }
  if (lead?.converted_client_id) return { ...NONE, clientId: lead.converted_client_id, extraLeads: extraLeads(new Set()) };

  const taken = new Set<string>([
    low(lead?.email),
    ...(lead?.companions ?? []).map(c => low(c?.email)),
  ]);
  const companionsFrom = (skip: string) => a.kind !== 'intro' ? [] : a.guests
    .filter(g => {
      const e = low(g.email);
      if (e === skip || taken.has(e) || contacts.has(e)) return false;
      if (said(e) === 'none' || said(e) === 'contact') return false;
      // ‼ מי שיש לו ליד משלו נשאר בליד שלו — לא נעשה «אדם נוסף» בפנייה של אחר.
      const own = leadForEmail(a.leads, e);
      return !own || own.id === lead?.id;
    })
    .map(g => ({
      email: low(g.email),
      ...(g.name?.trim() ? { name: g.name.trim() } : {}),
      relation: a.relations?.[low(g.email)] ?? DEFAULT_COMPANION_RELATION,
    }));

  if (lead) {
    const addCompanions = companionsFrom('');
    return {
      ...NONE,
      leadId: lead.id,
      addCompanions,
      reopenLead: a.kind === 'intro' && lead.status === 'closed',
      extraLeads: extraLeads(new Set([...taken, ...addCompanions.map(c => c.email)])),
    };
  }
  const name = (primary.name ?? '').trim();
  const p = low(primary.email);
  const primaryIsLead = said(p) === 'lead' || (a.kind === 'intro' && !said(p));
  if (primaryIsLead && name && !contacts.has(p)) {
    const companions = companionsFrom(p);
    return {
      ...NONE,
      newLead: { fullName: name, email: p, companions },
      extraLeads: extraLeads(new Set([p, ...companions.map(c => c.email)])),
    };
  }
  return { ...NONE, extraLeads: extraLeads(new Set()) };
}

/** האנשים בפנייה אחרי הוספה — בלי כפילויות לפי מייל; מה שכבר נשמר לא משתנה. */
export function mergeCompanions(existing: LeadRow['companions'], add: Companion[]): Companion[] {
  const out: Companion[] = (existing ?? [])
    .filter(c => !!c?.email)
    .map(c => ({
      email: low(c.email),
      ...(c.name ? { name: c.name } : {}),
      relation: COMPANION_RELATIONS.includes(c.relation as CompanionRelation) ? c.relation as CompanionRelation : DEFAULT_COMPANION_RELATION,
    }));
  for (const c of add) if (!out.some(x => x.email === low(c.email))) out.push(c);
  return out;
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

// ─── היומן (סבב 3): האירועים ביומן Google לטווח תאריכים ───────────────────
// ‼ לקריאה בלבד: לשונית «יומן» ו«היום שלך ביומן» בחלון. Google הוא מקור האמת; פגישה של PIVO
//   מזוהה לפי מזהה האירוע שנגזר ממזהה הפגישה (eventIdFor) — או pivoMeetingId שנשמר באירוע.

export interface GoogleListItem {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

export interface CalendarEvent {
  id: string;
  title: string;
  allDay: boolean;
  /** אירוע עם שעה — רגע מוחלט (ISO). */
  startsAt: string | null;
  endsAt: string | null;
  /** אירוע של יום שלם — תאריך התחלה ותאריך סיום (לא כולל), כמו ב-Google. */
  startDate: string | null;
  endDate: string | null;
  /** «פנוי» ב-Google (transparent) — מוצג, אבל לא תופס את הזמן. */
  busy: boolean;
  /** פגישה שנקבעה מ-PIVO — מזהה השורה ב-meetings. */
  meetingId: string | null;
  htmlLink: string | null;
}

const UUID_FROM_EVENT = /^pivo([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/;

/** מזהה הפגישה ב-PIVO מתוך מזהה האירוע (eventIdFor הפוך) — או null. */
export function meetingIdFromEventId(eventId: string | undefined): string | null {
  const m = (eventId ?? '').match(UUID_FROM_EVENT);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : null;
}

/**
 * מה שמוצג ביומן. ‼ אירוע שבוטל או שסירבת לו — לא מוצג (כך גם ב-Google). מזהה פגישה מוחזר רק
 * כשהוא באמת שורה של הרו״ח הזה (known) — אירוע שמישהו אחר יצר עם מזהה דומה אינו «של PIVO».
 */
export function calendarEventsFrom(items: GoogleListItem[], known: Set<string>): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const e of items) {
    if (!e.id || e.status === 'cancelled') continue;
    if ((e.attendees ?? []).some(x => x.self && x.responseStatus === 'declined')) continue;
    const allDay = !e.start?.dateTime && !!e.start?.date;
    if (!allDay && !e.start?.dateTime) continue;
    const mid = e.extendedProperties?.private?.pivoMeetingId ?? meetingIdFromEventId(e.id);
    out.push({
      id: e.id,
      title: (e.summary ?? '').trim() || '(ללא כותרת)',
      allDay,
      startsAt: allDay ? null : new Date(e.start!.dateTime!).toISOString(),
      endsAt: allDay ? null : new Date(e.end?.dateTime ?? e.start!.dateTime!).toISOString(),
      startDate: allDay ? e.start!.date! : null,
      endDate: allDay ? (e.end?.date ?? e.start!.date!) : null,
      busy: e.transparency !== 'transparent',
      meetingId: mid && known.has(mid) ? mid : null,
      htmlLink: e.htmlLink ?? null,
    });
  }
  return out;
}

/** טווח תאריכים ליומן — עד 6 שבועות, כדי שבקשה אחת לא תמשוך שנה שלמה. */
export function parseRange(b: Record<string, unknown>): { ok: true; from: string; to: string } | { ok: false; field: string } {
  const from = str(b.from, 10), to = str(b.to, 10);
  if (!DATE_RE.test(from)) return { ok: false, field: 'from' };
  if (!DATE_RE.test(to) || to <= from) return { ok: false, field: 'to' };
  const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000;
  if (days > 42) return { ok: false, field: 'to' };
  return { ok: true, from, to };
}

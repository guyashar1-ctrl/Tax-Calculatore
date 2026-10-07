// ─── פגישות — המודל במסך, טקסטים לשגיאות, ורמזים לרשימות ─────────────────────
// ‼ הנוסח של ההזמנה עצמה לא כאן: supabase/functions/_shared/meetingInvite.ts (אותו
// קוד בתצוגה ובשרת). כאן רק מה שהמסך צריך כדי להציג פגישה שכבר נשמרה.

import {
  utcToIsrael, shortDay, longDay, addMinutes, MEETING_KIND_LABELS, type MeetingKind,
} from '../../../supabase/functions/_shared/meetingInvite';
import type { Rsvp } from '../../../supabase/functions/_shared/googleCalendar';

export type MeetingStatus = 'sending' | 'scheduled' | 'unknown' | 'failed' | 'canceled';

export interface MeetingGuestRow {
  email: string;
  name?: string;
  rsvp?: Rsvp;
}

export interface MeetingHistoryRow {
  at: string;
  kind: 'sent' | 'moved' | 'canceled' | 'changed_in_google' | 'canceled_in_google';
  from?: string;
  to?: string;
  askedBy?: 'office' | 'guest';
}

export interface Meeting {
  id: string;
  clientId?: string;
  leadId?: string;
  kind: MeetingKind;
  topic?: string;
  prep?: string;
  note?: string;
  startsAt: string;
  durationMin: number;
  guests: MeetingGuestRow[];
  title: string;
  description: string;
  status: MeetingStatus;
  meetLink?: string;
  htmlLink?: string;
  sentAt?: string;
  canceledAt?: string;
  lastError?: string;
  history: MeetingHistoryRow[];
  createdAt?: string;
}

export function meetingFromDb(r: Record<string, any>): Meeting {
  return {
    id: r.id,
    clientId: r.client_id ?? undefined,
    leadId: r.lead_id ?? undefined,
    kind: r.kind,
    topic: r.topic ?? undefined,
    prep: r.prep ?? undefined,
    note: r.note ?? undefined,
    startsAt: r.starts_at,
    durationMin: r.duration_min,
    guests: Array.isArray(r.guests) ? r.guests : [],
    title: r.title,
    description: r.description,
    status: r.status,
    meetLink: r.meet_link ?? undefined,
    htmlLink: r.html_link ?? undefined,
    sentAt: r.sent_at ?? undefined,
    canceledAt: r.canceled_at ?? undefined,
    lastError: r.last_error ?? undefined,
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: r.created_at ?? undefined,
  };
}

export interface GoogleConnection {
  connected: boolean;
  email?: string;
  connectedAt?: string;
  lastError?: string | null;
}

/**
 * «יום ה׳, 8 באוק׳ · 10:00–10:30» — בשעון ישראל, בלי קשר לשעון המכשיר.
 * ‼ הטווח עטוף בבידוד שמאל-לימין (LRI…PDI) בתוך הטקסט עצמו: בשורה עברית בלי בידוד
 * «10:00–10:30» מוצג «10:30–10:00». כך גם ברמז ברשימה, בשבב בכרטיס וביומן הפעילות.
 */
export function meetingWhen(m: Pick<Meeting, 'startsAt' | 'durationMin'>): { date: string; time: string; label: string } {
  const { date, time } = utcToIsrael(m.startsAt);
  return { date, time, label: `${shortDay(date)} · ⁦${time}–${addMinutes(time, m.durationMin)}⁩` };
}

/** «היום» / «מחר» / «יום חמישי, 8 באוקטובר» — כותרת קבוצה ברשימה. */
export function dayHeading(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  if (diff === 0) return `היום · ${longDay(date)}`;
  if (diff === 1) return `מחר · ${longDay(date)}`;
  return longDay(date);
}

/** היום בשעון ישראל, ‎YYYY-MM-DD‎. */
export function israelToday(now: Date = new Date()): string {
  return utcToIsrael(now.toISOString()).date;
}

export const RSVP_LABELS: Record<Rsvp, string> = {
  yes: 'אושרה הגעה',
  maybe: 'אולי',
  no: 'לא יגיעו',
  none: 'לא התקבלה תשובה',
};

export const RSVP_TONE: Record<Rsvp, 'ok' | 'warn' | 'err' | 'muted'> = {
  yes: 'ok', maybe: 'warn', no: 'err', none: 'muted',
};

/** פגישות שעוד לא עברו (כולל אחת שמתקיימת עכשיו), לפי מועד. */
export function upcomingMeetings(list: Meeting[], now: Date = new Date()): Meeting[] {
  const t = now.getTime();
  return list
    .filter(m => m.status === 'scheduled' || m.status === 'unknown')
    .filter(m => Date.parse(m.startsAt) + m.durationMin * 60000 > t)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** המפתח לפי מייל במפת הרמזים — לליד שהופרד מפנייה משותפת ולאיש קשר. */
export const cueEmailKey = (email: string) => `email:${email.trim().toLowerCase()}`;

/**
 * רמז לשורה ברשימת האנשים: הפגישה הקרובה של כל לקוח/ליד — לפי המזהה, וגם לפי המייל של
 * כל מוזמן (cueEmailKey). ‼ כך ליד שהופרד מפנייה משותפת, או ליד שהומר ללקוח, ממשיכים
 * לראות את הפגישה שנקבעה לפני כן — הפגישה עצמה שייכת לרשומה המקורית.
 */
export function meetingCueByPerson(list: Meeting[], now: Date = new Date()): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of upcomingMeetings(list, now)) {
    const cue = `${m.kind === 'intro' ? MEETING_KIND_LABELS.intro : 'פגישה'} · ${meetingWhen(m).label}`;
    for (const id of [m.clientId, m.leadId]) if (id && !out.has(id)) out.set(id, cue);
    for (const g of m.guests) {
      const k = cueEmailKey(g.email);
      if (!out.has(k)) out.set(k, cue);
    }
  }
  return out;
}

/** הפגישות שהמייל הזה הוזמן אליהן — הקרובות קודם, ואחריהן מה שכבר היה (מהחדש לישן). */
export function meetingsWithEmail(list: Meeting[], email: string | undefined, now: Date = new Date()): { upcoming: Meeting[]; past: Meeting[] } {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return { upcoming: [], past: [] };
  const mine = list.filter(m => m.guests.some(g => g.email.toLowerCase() === e));
  const upcoming = upcomingMeetings(mine, now);
  const t = now.getTime();
  const past = mine
    .filter(m => m.status === 'scheduled' && Date.parse(m.startsAt) + m.durationMin * 60000 <= t)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, past };
}

/** מה כתוב ביומן הפעילות על כל רישום בפגישה. */
export function historyTitle(h: MeetingHistoryRow): string {
  switch (h.kind) {
    case 'sent': return 'נשלח זימון לפגישה';
    case 'moved': return h.askedBy === 'guest' ? 'מועד הפגישה שונה לבקשת המוזמנים' : 'מועד הפגישה שונה';
    case 'canceled': return 'הפגישה בוטלה';
    case 'changed_in_google': return 'מועד הפגישה שונה ביומן';
    case 'canceled_in_google': return 'הפגישה בוטלה ביומן';
  }
}

// ─── שגיאות מהשרת — בעברית, עם מה עושים ──────────────────────────────────────

export const MEETING_ERRORS: Record<string, string> = {
  unauthorized: 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.',
  forbidden: 'למשתמש הזה אין הרשאה לקבוע פגישות.',
  bad_input: 'חסר פרט בטופס. בדקו את המיילים, התאריך והשעה.',
  google_not_connected: 'יומן Google עוד לא מחובר. מחברים פעם אחת ב«המשרד ← חיבורים».',
  google_reconnect: 'Google ביטל את החיבור ליומן. צריך לחבר מחדש ב«המשרד ← חיבורים».',
  google_not_configured: 'החיבור ל-Google עוד לא הוגדר בשרת. ההוראות: docs/MEETINGS-GOOGLE-CALENDAR.md.',
  google_unavailable: 'Google לא ענה כרגע. שום דבר לא נשלח. נסו שוב בעוד דקה.',
  google_failed: 'Google דחה את הזימון. שום דבר לא נשלח.',
  unknown_outcome: 'לא ידוע אם הזימון יצא: Google לא החזיר תשובה ברורה. «שלח שוב» בטוח — הוא לא ייצור פגישה שנייה.',
  not_scheduled: 'הפגישה הזו לא ביומן, ולכן אי אפשר לשנות אותה.',
  canceled_in_google: 'הפגישה כבר בוטלה ביומן Google.',
  canceled: 'הפגישה הזו בוטלה.',
  not_found: 'הפגישה לא נמצאה.',
  save_failed: 'השמירה נכשלה. שום דבר לא נשלח. נסו שוב.',
};

const PAST_FIELD: Record<string, string> = {
  past: 'המועד כבר עבר.',
  contactName: 'כתבו שם לאיש הקשר שנשמר.',
  leadName: 'כתבו שם לאדם החדש — כך הוא יישמר כליד.',
  contact: 'חסרים פרטי איש הקשר.',
  guests: 'אחת מכתובות המייל לא תקינה.',
  date: 'בחרו תאריך.',
  time: 'בחרו שעה.',
  durationMin: 'משך הפגישה לא תקין.',
};

export function meetingErrorText(reply: { error?: string; detail?: { field?: string; message?: string } } | null | undefined): string {
  const code = reply?.error ?? '';
  if (code === 'bad_input' && reply?.detail?.field && PAST_FIELD[reply.detail.field]) return PAST_FIELD[reply.detail.field];
  if (code === 'google_failed' && reply?.detail?.message) return `${MEETING_ERRORS.google_failed} (${reply.detail.message})`;
  return MEETING_ERRORS[code] ?? 'משהו השתבש. שום דבר לא נשלח. נסו שוב.';
}

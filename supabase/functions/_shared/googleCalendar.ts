// ═══════════════════════════════════════════════════════════════════════════
//  יומן Google — פנייה, סיווג תשובות, וחתימת state לחיבור
// ═══════════════════════════════════════════════════════════════════════════
//  טהור: בלי Deno API ובלי ייבוא חיצוני (fetch מוזרק), כדי שבדיקות היחידה
//  ב-Node יריצו את אותו קוד בדיוק (src/features/meetings/__tests__).
//
//  ‼ סיווג התשובה הוא המקום היחיד שקובע מה קרה, באותה רוח כמו resendResult:
//    ok        — Google קיבל
//    conflict  — 409: אירוע עם המזהה הזה כבר קיים (ניסיון קודם הצליח) ⇒ לקרוא אותו
//    gone      — 404/410: האירוע לא קיים (נמחק ביומן)
//    auth      — 401: המפתח פג ⇒ לרענן פעם אחת
//    failed    — דחייה ודאית (4xx אחר, 429): שום דבר לא נוצר; מותר לנסות שוב
//    unknown   — רשת / 5xx: לא ידוע אם נוצר. שליחה חוזרת עם אותו מזהה בטוחה (409 ⇒ קריאה)
// ═══════════════════════════════════════════════════════════════════════════

import { PROD_PROJECT_REF } from './resendResult.ts';
import { MEETING_TIME_ZONE } from './meetingInvite.ts';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

export interface GoogleEndpoints {
  authorize: string;
  token: string;
  userinfo: string;
  revoke: string;
  calendar: string;
  fake: boolean;
}

const REAL: GoogleEndpoints = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
  revoke: 'https://oauth2.googleapis.com/revoke',
  calendar: 'https://www.googleapis.com/calendar/v3',
  fake: false,
};

/**
 * לאן פונים. ‼ בייצור תמיד Google, גם אם משתנה הסביבה הוגדר בטעות.
 * בסביבה אחרת: GOOGLE_API_FAKE_URL אם הוגדר, ואם אין מפתחות OAuth בכלל —
 * Google המדומה של סביבת הבדיקות (fake-google-calendar), כך שאפשר לבדוק את כל
 * המסלול בלי חשבון Google ובלי שאף הזמנה תצא לאדם אמיתי.
 */
export function googleEndpoints(args: { supabaseUrl: string; fakeUrl?: string; clientIdConfigured: boolean }): GoogleEndpoints {
  const isProd = !args.supabaseUrl || args.supabaseUrl.includes(PROD_PROJECT_REF);
  if (isProd) return REAL;
  const fake = args.fakeUrl || (!args.clientIdConfigured ? `${args.supabaseUrl.replace(/\/$/, '')}/functions/v1/fake-google-calendar` : '');
  if (!fake) return REAL;
  const base = fake.replace(/\/$/, '');
  return {
    authorize: `${base}/authorize`, token: `${base}/token`, userinfo: `${base}/userinfo`,
    revoke: `${base}/revoke`, calendar: `${base}/calendar`, fake: true,
  };
}

// ─── סיווג ──────────────────────────────────────────────────────────────────

export type GoogleOutcome<T = Record<string, unknown>> =
  | { kind: 'ok'; status: number; data: T }
  | { kind: 'conflict'; status: number }
  | { kind: 'gone'; status: number }
  | { kind: 'auth'; status: number }
  | { kind: 'failed'; status: number; message: string }
  | { kind: 'unknown'; status: number; message: string };

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function errorMessage(body: unknown, status: number): string {
  const b = body as { error?: { message?: string } | string; error_description?: string } | null;
  if (b && typeof b.error === 'object' && b.error?.message) return String(b.error.message);
  // ‼ OAuth מחזיר קוד + הסבר ({error:'invalid_grant', error_description:'Token has been…'}).
  // הקוד חייב להישאר בהודעה — לפיו מזהים «צריך לחבר מחדש» (נמצא בבדיקת staging, 07.10.2026).
  if (b && typeof b.error === 'string') {
    return typeof b.error_description === 'string' ? `${b.error}: ${b.error_description}` : b.error;
  }
  if (b && typeof b.error_description === 'string') return b.error_description;
  return `HTTP ${status}`;
}

export async function googleCall<T = Record<string, unknown>>(fetchFn: FetchFn, url: string, init: RequestInit): Promise<GoogleOutcome<T>> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (e) {
    return { kind: 'unknown', status: 0, message: `network: ${String(e).slice(0, 200)}` };
  }
  const text = await res.text().catch(() => '');
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  const s = res.status;
  if (s >= 200 && s < 300) return { kind: 'ok', status: s, data: (body ?? {}) as T };
  if (s === 401) return { kind: 'auth', status: s };
  if (s === 409) return { kind: 'conflict', status: s };
  if (s === 404 || s === 410) return { kind: 'gone', status: s };
  if (s >= 500) return { kind: 'unknown', status: s, message: errorMessage(body, s) };
  return { kind: 'failed', status: s, message: errorMessage(body, s) };
}

// ─── מפתחות ─────────────────────────────────────────────────────────────────

export type TokenResult =
  | { ok: true; accessToken: string; refreshToken?: string; scope?: string; idToken?: string }
  | { ok: false; reconnect: boolean; message: string };

async function tokenRequest(fetchFn: FetchFn, ep: GoogleEndpoints, params: Record<string, string>): Promise<TokenResult> {
  const r = await googleCall<{ access_token?: string; refresh_token?: string; scope?: string; id_token?: string }>(fetchFn, ep.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (r.kind === 'ok' && r.data.access_token) {
    return { ok: true, accessToken: r.data.access_token, refreshToken: r.data.refresh_token, scope: r.data.scope, idToken: r.data.id_token };
  }
  // ‼ invalid_grant = Google ביטל את ההרשאה (סיסמה הוחלפה, הוסרה גישה) — רק חיבור מחדש יעזור.
  const reconnect = r.kind === 'failed' && /invalid_grant/i.test(r.message);
  return { ok: false, reconnect, message: 'message' in r ? r.message : `HTTP ${r.status}` };
}

export function exchangeCode(fetchFn: FetchFn, ep: GoogleEndpoints, a: { code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  return tokenRequest(fetchFn, ep, {
    grant_type: 'authorization_code', code: a.code, client_id: a.clientId, client_secret: a.clientSecret, redirect_uri: a.redirectUri,
  });
}

export function refreshAccessToken(fetchFn: FetchFn, ep: GoogleEndpoints, a: { refreshToken: string; clientId: string; clientSecret: string }) {
  return tokenRequest(fetchFn, ep, {
    grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: a.clientId, client_secret: a.clientSecret,
  });
}

export function authorizeUrl(ep: GoogleEndpoints, a: { clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const q = new URLSearchParams({
    client_id: a.clientId,
    redirect_uri: a.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    // offline + consent: כדי לקבל refresh token גם בחיבור חוזר.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: a.state,
  });
  if (a.loginHint) q.set('login_hint', a.loginHint);
  return `${ep.authorize}?${q.toString()}`;
}

// ─── state חתום לחיבור ─────────────────────────────────────────────────────
// ‼ החזרה מ-Google מגיעה בלי JWT. ה-state נושא את זהות הרו"ח ואת כתובת החזרה,
// חתום ב-HMAC ותקף 15 דקות — כך שאי אפשר לחבר יומן לחשבון של מישהו אחר.

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const utf8 = (s: string) => new TextEncoder().encode(s);

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', utf8(`google-oauth-state:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(data))));
}

export interface OAuthState { userId: string; returnTo: string; exp: number }

export async function signState(secret: string, s: OAuthState): Promise<string> {
  const payload = b64url(utf8(JSON.stringify({ u: s.userId, r: s.returnTo, e: s.exp, n: crypto.randomUUID() })));
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyState(secret: string, state: string, nowMs: number): Promise<OAuthState | null> {
  const [payload, sig] = (state || '').split('.');
  if (!payload || !sig) return null;
  if ((await hmac(secret, payload)) !== sig) return null;
  try {
    const o = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { u?: string; r?: string; e?: number };
    if (!o.u || !o.r || typeof o.e !== 'number' || o.e < nowMs) return null;
    return { userId: o.u, returnTo: o.r, exp: o.e };
  } catch {
    return null;
  }
}

/** לאן מותר לחזור אחרי החיבור: כתובת האפליקציה, או localhost מחוץ לייצור. */
export function safeReturnTo(requested: string | undefined, appUrl: string, allowLocal: boolean): string {
  try {
    const u = new URL(requested ?? '');
    const app = new URL(appUrl);
    if (u.origin === app.origin) return u.toString();
    if (allowLocal && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.toString();
  } catch { /* נופל לברירת המחדל */ }
  return appUrl;
}

// ─── אירוע ─────────────────────────────────────────────────────────────────

/** מזהה האירוע ב-Google נגזר ממזהה הפגישה ⇒ שליחה חוזרת לא יוצרת אירוע שני. */
export function eventIdFor(meetingId: string): string {
  const hex = meetingId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('meeting id must be a uuid');
  return `pivo${hex}`;
}

export interface EventSpec {
  meetingId: string;
  title: string;
  description: string;
  startUtc: string;
  endUtc: string;
  guests: { email: string; name?: string }[];
}

export function eventTimes(s: Pick<EventSpec, 'startUtc' | 'endUtc'>) {
  return {
    start: { dateTime: s.startUtc, timeZone: MEETING_TIME_ZONE },
    end: { dateTime: s.endUtc, timeZone: MEETING_TIME_ZONE },
  };
}

export function eventBody(s: EventSpec): Record<string, unknown> {
  return {
    id: eventIdFor(s.meetingId),
    summary: s.title,
    description: s.description,
    ...eventTimes(s),
    attendees: s.guests.map(g => ({ email: g.email, ...(g.name ? { displayName: g.name } : {}) })),
    conferenceData: { createRequest: { requestId: s.meetingId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    // זוג רואה זה את זה; מוזמן לא מזמין אחרים בשם המשרד.
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: true,
    reminders: { useDefault: true },
    extendedProperties: { private: { pivoMeetingId: s.meetingId } },
  };
}

export interface GoogleEvent {
  id?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: { email?: string; responseStatus?: string }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

export function meetLinkOf(e: GoogleEvent): string | null {
  return e.hangoutLink ?? e.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri ?? null;
}

export type Rsvp = 'none' | 'yes' | 'no' | 'maybe';

export function rsvpFromGoogle(s: string | undefined): Rsvp {
  if (s === 'accepted') return 'yes';
  if (s === 'declined') return 'no';
  if (s === 'tentative') return 'maybe';
  return 'none';
}

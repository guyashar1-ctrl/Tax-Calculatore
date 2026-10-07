// ═══════════════════════════════════════════════════════════════════════════
//  fake-google-calendar — Google (OAuth + Calendar) מדומה ל-staging בלבד. ‼ לא נפרס לייצור.
// ═══════════════════════════════════════════════════════════════════════════
//  עונה כמו Google לנתיבים ש-google-calendar-connect ו-calendar-meeting משתמשים בהם
//  (_shared/googleCalendar.ts → googleEndpoints), ושומר ב-test_fake_google_events.
//  כך נבדק כל המסלול האמיתי — חיבור, זימון, 409 בשליחה חוזרת, שינוי מועד, ביטול,
//  ותשובות מוזמנים — בלי חשבון Google ובלי שאף הזמנה יוצאת לאדם.
//
//  התנהגויות לבדיקה, לפי כתובת המוזמן:
//    · ‎fail-always‎ — 400: Google דוחה (אין אירוע)
//    · ‎lost-reply‎  — האירוע נשמר אבל התשובה 503 (Google יצר והתשובה אבדה) ⇒ «לא ידוע»;
//                      שליחה חוזרת ⇒ 409 ⇒ קריאה ⇒ נשלח, בלי אירוע שני
//    · ‎accepts‎ / ‎declines‎ / ‎maybe‎ — כך המוזמן «עונה» בקריאה הבאה
//  ומפתח רענון ‎fake-rt-revoked‎ ⇒ invalid_grant («צריך לחבר מחדש»).
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PROD_PROJECT_REF } from "../_shared/resendResult.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const FAKE_EMAIL = "office@pivo-staging.test";
const SCOPE = "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";
const json = (b: unknown, status = 200) =>
  new Response(b === null ? null : JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const gErr = (status: number, message: string) => json({ error: { code: status, message } }, status);

type Ev = Record<string, unknown> & {
  id: string; status?: string; description?: string; summary?: string;
  start?: { dateTime?: string }; end?: { dateTime?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
};

function withRsvp(e: Ev): Ev {
  return {
    ...e,
    attendees: (e.attendees ?? []).map(a => ({
      ...a,
      responseStatus: /accepts/.test(a.email) ? "accepted" : /declines/.test(a.email) ? "declined"
        : /maybe/.test(a.email) ? "tentative" : "needsAction",
    })),
  };
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || SUPABASE_URL.includes(PROD_PROJECT_REF)) return json({ error: "forbidden" }, 403);
  const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/fake-google-calendar/, "") || "/";

  // ── OAuth ──────────────────────────────────────────────────────────────────
  if (path === "/authorize") {
    const back = new URL(url.searchParams.get("redirect_uri") ?? "");
    back.searchParams.set("code", "fake-code");
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    return new Response(null, { status: 302, headers: { Location: back.toString() } });
  }
  if (path === "/token") {
    const form = new URLSearchParams(await req.text());
    if (form.get("grant_type") === "authorization_code") {
      if (form.get("code") !== "fake-code") return json({ error: "invalid_grant" }, 400);
      return json({ access_token: "fake-at", refresh_token: "fake-rt", scope: SCOPE, expires_in: 3600, token_type: "Bearer" });
    }
    if (form.get("refresh_token") === "fake-rt-revoked") return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
    return json({ access_token: "fake-at", scope: SCOPE, expires_in: 3600, token_type: "Bearer" });
  }
  if (path === "/userinfo") return json({ email: FAKE_EMAIL, email_verified: true });
  if (path === "/revoke") return json({});

  // ── Calendar ───────────────────────────────────────────────────────────────
  if (req.headers.get("Authorization") !== "Bearer fake-at") return gErr(401, "Invalid Credentials");
  const sendUpdates = url.searchParams.get("sendUpdates") ?? "none";
  const log = (calls: unknown[]) => [...calls, { at: new Date().toISOString(), method: req.method, sendUpdates }];

  if (path === "/calendar/freeBusy" && req.method === "POST") {
    const b = await req.json();
    const { data } = await admin.from("test_fake_google_events").select("event");
    const busy = (data ?? []).map(r => r.event as Ev)
      .filter(e => e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime
        && e.start.dateTime < b.timeMax && e.end.dateTime > b.timeMin)
      .map(e => ({ start: e.start!.dateTime, end: e.end!.dateTime }));
    return json({ calendars: { primary: { busy } } });
  }

  const m = path.match(/^\/calendar\/calendars\/primary\/events(?:\/([a-v0-9]+))?$/);
  if (!m) return gErr(404, "Not Found");
  const id = m[1];

  // ‼ (סבב 3) רשימת אירועים לטווח — לשונית «יומן». כמו Google: בלי מבוטלים, לפי שעת התחלה.
  if (!id && req.method === "GET") {
    const timeMin = url.searchParams.get("timeMin") ?? "";
    const timeMax = url.searchParams.get("timeMax") ?? "";
    const { data } = await admin.from("test_fake_google_events").select("event");
    const items = (data ?? []).map(r => withRsvp(r.event as Ev))
      .filter(e => e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime
        && (!timeMax || e.start.dateTime < timeMax) && (!timeMin || e.end.dateTime > timeMin))
      .sort((a, b) => String(a.start?.dateTime).localeCompare(String(b.start?.dateTime)));
    return json({ kind: "calendar#events", items });
  }

  if (!id && req.method === "POST") {
    const e = await req.json() as Ev;
    const emails = (e.attendees ?? []).map(a => a.email).join(" ");
    if (/fail-always/.test(emails)) return gErr(400, "Invalid attendee email.");
    const { data: existing } = await admin.from("test_fake_google_events").select("id").eq("id", e.id).maybeSingle();
    if (existing) return gErr(409, "The requested identifier already exists.");
    const stored: Ev = {
      ...e, status: "confirmed",
      hangoutLink: `https://meet.google.com/fak-${e.id.slice(4, 8)}-${e.id.slice(8, 11)}`,
      htmlLink: `https://calendar.google.com/calendar/event?eid=${e.id}`,
      attendees: (e.attendees ?? []).map(a => ({ ...a, responseStatus: "needsAction" })),
    };
    delete stored.conferenceData;
    await admin.from("test_fake_google_events").insert({ id: e.id, event: stored, calls: log([]) });
    if (/lost-reply/.test(emails)) return gErr(503, "Backend Error");
    return json(withRsvp(stored));
  }

  const { data: row } = await admin.from("test_fake_google_events").select("*").eq("id", id ?? "").maybeSingle();
  if (!row) return gErr(404, "Not Found");
  const ev = row.event as Ev;

  if (req.method === "GET") return json(withRsvp(ev));
  if (req.method === "PATCH") {
    if (ev.status === "cancelled") return gErr(410, "Resource has been deleted");
    const patch = await req.json() as Partial<Ev>;
    const next = { ...ev, ...patch };
    await admin.from("test_fake_google_events").update({ event: next, calls: log(row.calls), updated_at: new Date().toISOString() }).eq("id", id);
    return json(withRsvp(next));
  }
  if (req.method === "DELETE") {
    if (ev.status === "cancelled") return gErr(410, "Resource has been deleted");
    await admin.from("test_fake_google_events").update({ event: { ...ev, status: "cancelled" }, calls: log(row.calls) }).eq("id", id);
    return json(null, 204);
  }
  return gErr(405, "Method Not Allowed");
});

// Edge Function: calendar-meeting
// פגישה ב-Google Meet מהיומן של הרו"ח: יצירה, שינוי מועד, ביטול, «פנוי?», ותשובות המוזמנים.
//
// ‼ היומן של Google הוא מקור האמת לשעה ולתשובות; PIVO שומר את ההקשר ואת מה שנשלח.
// ‼ «נשלח» (status='scheduled' + sent_at) נכתב רק אחרי ש-Google קיבל את האירוע.
// ‼ מזהה הפגישה נוצר בדפדפן ומזהה האירוע נגזר ממנו (eventIdFor) — לחיצה כפולה, שתי
//   לשוניות או רשת שנפלה לא יוצרות אירוע שני: Google עונה 409 וקוראים את הקיים.
// ‼ הנוסח נבנה כאן מ-_shared/meetingInvite.ts — אותו קוד שמצייר את התצוגה המקדימה, עם אותה
//   תבנית: נוסח המשרד מ-profiles.settings.commTemplates (ספריית הבקשות ← פגישות), או נוסח המערכת.
// ‼ ליד נוצר רק אחרי ש-Google קיבל, ורק במעבר הראשון ל-scheduled (עדכון מותנה) —
//   שתי בקשות במקביל לא יוצרות שני לידים. באותו מעבר: האנשים הנוספים נשמרים בפנייה,
//   ליד סגור חוזר להיות «חדש» (שיחת היכרות), ואנשי קשר שסומנו נשמרים (226).
//
// אבטחה: verify_jwt=false בשער; הרו"ח מזוהה מה-JWT ונבדק מול is_authorized.
// כל פעולה על פגישה בודקת שהיא של אותו רו"ח.
// (סבב 3) events — האירועים ביומן לטווח תאריכים, לקריאה בלבד: לשונית «יומן» ו«היום שלך ביומן».
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  inviteDescription, meetingTitle, meetingTemplateFor, israelToUtcIso, utcToIsrael, MOVE_NOTE_DEFAULT,
  type InviteOrg, type InviteInput, type MeetingKind, type MeetingTemplate,
} from "../_shared/meetingInvite.ts";
import {
  googleEndpoints, googleCall, refreshAccessToken, eventBody, eventTimes, eventIdFor, meetLinkOf,
  type GoogleEndpoints, type GoogleEvent, type GoogleOutcome,
} from "../_shared/googleCalendar.ts";
import {
  parseCreate, parseMove, parseRange, matchPeople, mergeCompanions, syncFromEvent, calendarEventsFrom,
  type HistoryEntry, type StoredGuest, type ClientRow, type LeadRow, type PeopleOutcome, type GoogleListItem,
} from "../_shared/meetingCore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
const EP: GoogleEndpoints = googleEndpoints({
  supabaseUrl: SUPABASE_URL, fakeUrl: Deno.env.get("GOOGLE_API_FAKE_URL"), clientIdConfigured: !!CLIENT_ID,
});

interface MeetingRow {
  id: string;
  user_id: string;
  client_id: string | null;
  lead_id: string | null;
  kind: "intro" | "work";
  topic: string | null;
  prep: string | null;
  note: string | null;
  starts_at: string;
  duration_min: number;
  guests: StoredGuest[];
  title: string;
  description: string;
  status: "sending" | "scheduled" | "unknown" | "failed" | "canceled";
  google_event_id: string | null;
  meet_link: string | null;
  html_link: string | null;
  sent_at: string | null;
  rsvp_checked_at: string | null;
  history: HistoryEntry[];
}

function orgFromProfile(p: Record<string, unknown> | null): InviteOrg {
  const comm = (p?.communication ?? {}) as Record<string, unknown>;
  return {
    fullName: (p?.full_name as string) ?? undefined,
    firmName: (p?.firm_name as string) ?? undefined,
    representativeType: (p?.representative_type as string) ?? undefined,
    phone: (p?.phone as string) ?? undefined,
    whatsapp: (comm.whatsapp as string) ?? undefined,
    website: (p?.website as string) ?? undefined,
  };
}

/** הנוסח שהמשרד שמר לסוג הפגישה (או נוסח המערכת) — אותה פונקציה שהתצוגה בחלון קוראת לה. */
function templateFromProfile(p: Record<string, unknown> | null, kind: MeetingKind): MeetingTemplate {
  const settings = (p?.settings ?? {}) as Record<string, unknown>;
  return meetingTemplateFor(kind, settings.commTemplates);
}

function inviteInputOf(m: Pick<MeetingRow, "kind" | "guests" | "duration_min" | "topic" | "prep" | "note">): InviteInput {
  return {
    kind: m.kind,
    guests: m.guests.map(g => ({ email: g.email, name: g.name })),
    durationMin: m.duration_min,
    topic: m.topic ?? "",
    prep: m.prep ?? "",
    note: m.note ?? "",
  };
}

const endUtc = (startUtc: string, min: number) => new Date(new Date(startUtc).getTime() + min * 60000).toISOString();

/** מפתח גישה טרי מהחיבור השמור. כשל ודאי ⇒ מסומן בחיבור «צריך לחבר מחדש». */
async function accessTokenFor(admin: SupabaseClient, userId: string):
  Promise<{ ok: true; token: string } | { ok: false; code: string; status: number }> {
  if (!EP.fake && (!CLIENT_ID || !CLIENT_SECRET)) return { ok: false, code: "google_not_configured", status: 500 };
  const { data: conn } = await admin.from("google_calendar_connections")
    .select("refresh_token").eq("user_id", userId).maybeSingle();
  if (!conn?.refresh_token) return { ok: false, code: "google_not_connected", status: 409 };
  const t = await refreshAccessToken(fetch, EP, {
    refreshToken: conn.refresh_token, clientId: CLIENT_ID || "fake-client", clientSecret: CLIENT_SECRET || "fake-secret",
  });
  const now = new Date().toISOString();
  if (!t.ok) {
    if (t.reconnect) {
      await admin.from("google_calendar_connections")
        .update({ last_error: "reconnect", last_error_at: now }).eq("user_id", userId);
      return { ok: false, code: "google_reconnect", status: 409 };
    }
    return { ok: false, code: "google_unavailable", status: 502 };
  }
  await admin.from("google_calendar_connections")
    .update({ last_ok_at: now, last_error: null, last_error_at: null }).eq("user_id", userId);
  return { ok: true, token: t.accessToken };
}

const cal = (path: string) => `${EP.calendar}/calendars/primary${path}`;

function gcall<T = GoogleEvent>(token: string, method: string, url: string, body?: unknown): Promise<GoogleOutcome<T>> {
  return googleCall<T>(fetch, url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** האירוע נוצר, אבל Meet נוצר לפעמים באיחור של שנייה — קריאה אחת נוספת. */
async function readEvent(token: string, eventId: string): Promise<GoogleEvent | null> {
  const r = await gcall(token, "GET", cal(`/events/${eventId}`));
  return r.kind === "ok" ? r.data : null;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const fail = (error: string, status: number, detail?: unknown) => json({ ok: false, error, ...(detail ? { detail } : {}) }, status);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id ?? null;
    if (!userId) return fail("unauthorized", 401);
    const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authorized } = await asUser.rpc("is_authorized");
    if (authorized !== true) return fail("forbidden", 403);

    const now = new Date();
    const nowIso = now.toISOString();

    const loadMeeting = async (id: string): Promise<MeetingRow | null> => {
      const { data } = await admin.from("meetings").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      return (data as MeetingRow) ?? null;
    };
    const reply = (m: MeetingRow | null) => json({ ok: true, meeting: m });

    // ── «פנוי?» — שעות תפוסות ביום אחד, מהיומן כולו ──────────────────────────
    if (action === "freebusy") {
      const date = String(body.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("bad_input", 400, { field: "date" });
      const tok = await accessTokenFor(admin, userId);
      if (!tok.ok) return fail(tok.code, tok.status);
      const timeMin = israelToUtcIso(date, "00:00");
      const timeMax = new Date(new Date(timeMin).getTime() + 24 * 3600000).toISOString();
      const r = await gcall<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(
        tok.token, "POST", `${EP.calendar}/freeBusy`, { timeMin, timeMax, timeZone: "Asia/Jerusalem", items: [{ id: "primary" }] });
      if (r.kind !== "ok") return fail("google_unavailable", 502);
      const busy = Object.values(r.data.calendars ?? {}).flatMap(c => c.busy ?? []).map(x => ({
        start: utcToIsrael(x.start).time,
        end: utcToIsrael(x.end).date === date ? utcToIsrael(x.end).time : "24:00",
        startUtc: x.start,
        endUtc: x.end,
      }));
      return json({ ok: true, busy });
    }

    // ── היומן: האירועים לטווח תאריכים (שעון ישראל, «עד» לא כולל) ─────────────
    if (action === "events") {
      const rg = parseRange(body);
      if (!rg.ok) return fail("bad_input", 400, { field: rg.field });
      const tok = await accessTokenFor(admin, userId);
      if (!tok.ok) return fail(tok.code, tok.status);
      const timeMin = israelToUtcIso(rg.from, "00:00");
      const timeMax = israelToUtcIso(rg.to, "00:00");
      const items: GoogleListItem[] = [];
      let pageToken = "";
      // ‼ עד 4 עמודים (1000 אירועים) — יומן עמוס בשבוע אחד לא מגיע לזה; לא לולאה בלי סוף.
      for (let page = 0; page < 4; page++) {
        const q = new URLSearchParams({
          timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: "Asia/Jerusalem",
          ...(pageToken ? { pageToken } : {}),
        });
        const r = await gcall<{ items?: GoogleListItem[]; nextPageToken?: string }>(tok.token, "GET", cal(`/events?${q.toString()}`));
        if (r.kind !== "ok") return fail("google_unavailable", 502);
        items.push(...(r.data.items ?? []));
        pageToken = r.data.nextPageToken ?? "";
        if (!pageToken) break;
      }
      const { data: mine } = await admin.from("meetings").select("id")
        .eq("user_id", userId).gte("starts_at", new Date(new Date(timeMin).getTime() - 86400000).toISOString())
        .lt("starts_at", timeMax);
      const known = new Set(((mine ?? []) as { id: string }[]).map(x => x.id));
      return json({ ok: true, from: rg.from, to: rg.to, events: calendarEventsFrom(items, known) });
    }

    // ── פגישה חדשה ────────────────────────────────────────────────────────────
    if (action === "create") {
      const p = parseCreate(body, now.getTime());
      if (!p.ok) return fail("bad_input", 400, { field: p.field });
      const input = p.value;

      if (input.clientId) {
        const { data: c } = await admin.from("clients").select("id").eq("id", input.clientId).eq("user_id", userId).maybeSingle();
        if (!c) return fail("not_found", 404, { field: "clientId" });
      }

      const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      const org = orgFromProfile(profile);
      const tpl = templateFromProfile(profile, input.kind);
      const startUtc = israelToUtcIso(input.date, input.time);
      const fresh = {
        kind: input.kind,
        topic: input.topic || null,
        prep: input.prep || null,
        note: input.note || null,
        starts_at: startUtc,
        duration_min: input.durationMin,
        guests: input.guests.map(g => ({ ...g, rsvp: "none" })),
        title: meetingTitle(input, org, tpl),
        description: inviteDescription({ ...input }, org, undefined, tpl),
      };

      let m = await loadMeeting(input.id);
      if (m && m.status === "scheduled") return reply(m);
      if (m && m.status === "canceled") return fail("canceled", 409);
      if (!m) {
        const { data: ins, error: insErr } = await admin.from("meetings")
          .insert({ id: input.id, user_id: userId, client_id: input.clientId, status: "sending", ...fresh })
          .select("*").maybeSingle();
        if (insErr && insErr.code !== "23505") {
          console.error("[calendar-meeting] insert failed", insErr.code, insErr.message);
          return fail("save_failed", 500);
        }
        m = (ins as MeetingRow) ?? await loadMeeting(input.id);
        if (!m) return fail("save_failed", 500);
      } else if (m.status === "failed") {
        // ‼ נדחה בוודאות ⇒ שום דבר לא נוצר ביומן, ומותר לשלוח את מה שבחלון עכשיו.
        const { data: upd } = await admin.from("meetings")
          .update({ ...fresh, status: "sending", last_error: null }).eq("id", m.id).eq("user_id", userId)
          .select("*").maybeSingle();
        m = (upd as MeetingRow) ?? m;
      }
      // ‼ status 'sending'/'unknown': שולחים בדיוק את מה שנשמר — ייתכן שהאירוע כבר קיים ביומן.

      const tok = await accessTokenFor(admin, userId);
      if (!tok.ok) {
        await admin.from("meetings").update({ status: "failed", last_error: tok.code }).eq("id", m.id);
        return fail(tok.code, tok.status);
      }

      const spec = {
        meetingId: m.id, title: m.title, description: m.description,
        startUtc: m.starts_at, endUtc: endUtc(m.starts_at, m.duration_min),
        guests: m.guests.map(g => ({ email: g.email, name: g.name })),
      };
      const r = await gcall(tok.token, "POST", cal(`/events?conferenceDataVersion=1&sendUpdates=all`), eventBody(spec));
      let event: GoogleEvent | null = null;
      if (r.kind === "ok") event = r.data;
      else if (r.kind === "conflict") event = await readEvent(tok.token, eventIdFor(m.id));

      if (!event) {
        const unknown = r.kind === "unknown" || r.kind === "conflict";
        const message = "message" in r ? r.message : `HTTP ${r.status}`;
        await admin.from("meetings")
          .update({ status: unknown ? "unknown" : "failed", last_error: message.slice(0, 500) }).eq("id", m.id);
        return unknown
          ? fail("unknown_outcome", 502, { message })
          : fail("google_failed", 502, { message, status: r.status });
      }
      if (!meetLinkOf(event) && event.id) event = (await readEvent(tok.token, event.id)) ?? event;

      // ‼ המעבר ל-scheduled מותנה — רק הבקשה שעשתה אותו ממשיכה לשיוך וליצירת ליד.
      const sentEntry: HistoryEntry = { at: nowIso, kind: "sent" };
      const { data: won } = await admin.from("meetings")
        .update({
          status: "scheduled", sent_at: nowIso, last_error: null,
          google_event_id: event.id ?? eventIdFor(m.id), meet_link: meetLinkOf(event), html_link: event.htmlLink ?? null,
          history: [...(m.history ?? []), sentEntry],
        })
        .eq("id", m.id).in("status", ["sending", "unknown", "failed"])
        .select("*").maybeSingle();
      if (!won) return reply(await loadMeeting(m.id));

      let final = won as MeetingRow;
      const people: PeopleOutcome = { leadCreated: false, leadReopened: false, companionsAdded: 0, contactsSaved: 0, extraLeadsCreated: 0 };
      // ‼ אנשי קשר קודם: מי שנשמר כאיש קשר לא נעשה ליד ולא «אדם נוסף» בפנייה.
      for (const c of input.saveContacts) {
        const { error: cErr } = await admin.from("contacts").insert({
          user_id: userId, full_name: c.fullName, email: c.email,
          role: c.role || null, organization: c.organization || null,
        });
        if (!cErr) people.contactsSaved++;
        else if (cErr.code !== "23505") console.error("[calendar-meeting] contact insert failed", cErr.code, cErr.message);
      }
      const [{ data: clients }, { data: leads }, { data: contacts }] = await Promise.all([
        admin.from("clients").select("id, email, spouse_email").eq("user_id", userId),
        admin.from("leads").select("id, email, status, companions, converted_client_id").eq("user_id", userId),
        admin.from("contacts").select("email").eq("user_id", userId).not("email", "is", null),
      ]);
      const leadRows = (leads ?? []) as LeadRow[];
      const match = matchPeople({
        kind: final.kind,
        guests: final.guests,
        clients: (clients ?? []) as ClientRow[],
        leads: leadRows,
        // ‼ פגישה מכרטיס לקוח — שם היא נרשמת; עדיין נוצרים לידים למי שסומן «לקוח פוטנציאלי».
        explicitClientId: final.client_id,
        contactEmails: ((contacts ?? []) as { email: string }[]).map(c => c.email),
        relations: input.relations,
        saveAs: input.saveAs,
      });
      let leadId = match.leadId;
      if (match.newLead) {
        const { data: lead, error: leadErr } = await admin.from("leads").insert({
          user_id: userId, full_name: match.newLead.fullName, email: match.newLead.email,
          status: "new", source: "accountant", companions: match.newLead.companions,
        }).select("id").maybeSingle();
        if (leadErr) console.error("[calendar-meeting] lead insert failed", leadErr.code, leadErr.message);
        leadId = (lead?.id as string) ?? null;
        people.leadCreated = !!leadId;
        people.companionsAdded = leadId ? match.newLead.companions.length : 0;
      } else if (leadId && (match.addCompanions.length || match.reopenLead)) {
        const current = leadRows.find(l => l.id === leadId);
        const patch: Record<string, unknown> = {};
        if (match.addCompanions.length) patch.companions = mergeCompanions(current?.companions, match.addCompanions);
        // ‼ רק סגור ⇒ חדש. ליד בשלב «נשלחה הצעה» לא חוזר אחורה.
        if (match.reopenLead) patch.status = "new";
        let q = admin.from("leads").update(patch).eq("id", leadId).eq("user_id", userId);
        if (match.reopenLead) q = q.eq("status", "closed");
        const { data: upd, error: updErr } = await q.select("id").maybeSingle();
        if (updErr) console.error("[calendar-meeting] lead update failed", updErr.code, updErr.message);
        if (upd) {
          people.leadReopened = match.reopenLead;
          people.companionsAdded = match.addCompanions.length;
        }
      }
      // (סבב 3) «לקוח פוטנציאלי» שאינו בפנייה — ליד משלו. ‼ אותו מעבר מותנה ל-scheduled ⇒ פעם אחת.
      for (const x of match.extraLeads) {
        const { data: lead, error: leadErr } = await admin.from("leads").insert({
          user_id: userId, full_name: x.fullName, email: x.email, status: "new", source: "accountant",
        }).select("id").maybeSingle();
        if (leadErr) { console.error("[calendar-meeting] extra lead insert failed", leadErr.code, leadErr.message); continue; }
        people.extraLeadsCreated = (people.extraLeadsCreated ?? 0) + 1;
        leadId ??= (lead?.id as string) ?? null;
      }
      const clientId = match.clientId ?? final.client_id;
      if (clientId !== final.client_id || (leadId ?? null) !== final.lead_id) {
        const { data: linked } = await admin.from("meetings")
          .update({ client_id: clientId, lead_id: leadId }).eq("id", final.id).select("*").maybeSingle();
        if (linked) final = linked as MeetingRow;
      }
      return json({ ok: true, meeting: final, people });
    }

    // ── שינוי מועד ────────────────────────────────────────────────────────────
    if (action === "move") {
      const p = parseMove(body, now.getTime());
      if (!p.ok) return fail("bad_input", 400, { field: p.field });
      const mv = p.value;
      const m = await loadMeeting(mv.id);
      if (!m) return fail("not_found", 404);
      if (m.status !== "scheduled" || !m.google_event_id) return fail("not_scheduled", 409);

      const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      const org = orgFromProfile(profile);
      const note = mv.note || MOVE_NOTE_DEFAULT[mv.askedBy];
      const base = { ...m, duration_min: mv.durationMin };
      // ‼ העדכון יוצא בנוסח של היום — אותו נוסח שחלון «שינוי מועד» מציג לפני השליחה.
      const description = inviteDescription(inviteInputOf(base), org, { date: mv.date, time: mv.time, note },
        templateFromProfile(profile, m.kind));
      const startUtc = israelToUtcIso(mv.date, mv.time);

      const tok = await accessTokenFor(admin, userId);
      if (!tok.ok) return fail(tok.code, tok.status);
      const r = await gcall(tok.token, "PATCH", cal(`/events/${m.google_event_id}?sendUpdates=all`), {
        description, ...eventTimes({ startUtc, endUtc: endUtc(startUtc, mv.durationMin) }),
      });
      if (r.kind === "gone") {
        await admin.from("meetings").update({ status: "canceled", canceled_at: nowIso,
          history: [...(m.history ?? []), { at: nowIso, kind: "canceled_in_google" }] }).eq("id", m.id);
        return fail("canceled_in_google", 409);
      }
      if (r.kind !== "ok") {
        const message = "message" in r ? r.message : `HTTP ${r.status}`;
        // ‼ לא ידוע אם המועד השתנה ⇒ לא כותבים מועד חדש. «עדכן מהיומן» יראה מה קרה.
        return fail(r.kind === "unknown" ? "unknown_outcome" : "google_failed", 502, { message });
      }
      const entry: HistoryEntry = { at: nowIso, kind: "moved", from: m.starts_at, to: startUtc, askedBy: mv.askedBy };
      const { data: upd } = await admin.from("meetings").update({
        starts_at: startUtc, duration_min: mv.durationMin, description,
        history: [...(m.history ?? []), entry],
      }).eq("id", m.id).select("*").maybeSingle();
      return reply((upd as MeetingRow) ?? m);
    }

    // ── ביטול ─────────────────────────────────────────────────────────────────
    if (action === "cancel") {
      const id = String(body.id ?? "");
      const m = await loadMeeting(id);
      if (!m) return fail("not_found", 404);
      if (m.status === "canceled") return reply(m);
      if (m.status !== "scheduled" || !m.google_event_id) {
        // לא הגיע ליומן (נכשל) ⇒ אין מה לבטל ב-Google; רק מסירים מהרשימה.
        if (m.status === "failed") {
          const { data: upd } = await admin.from("meetings").update({ status: "canceled", canceled_at: nowIso })
            .eq("id", m.id).select("*").maybeSingle();
          return reply((upd as MeetingRow) ?? m);
        }
        return fail("not_scheduled", 409);
      }
      const tok = await accessTokenFor(admin, userId);
      if (!tok.ok) return fail(tok.code, tok.status);
      const r = await gcall(tok.token, "DELETE", cal(`/events/${m.google_event_id}?sendUpdates=all`));
      if (r.kind !== "ok" && r.kind !== "gone") {
        const message = "message" in r ? r.message : `HTTP ${r.status}`;
        return fail(r.kind === "unknown" ? "unknown_outcome" : "google_failed", 502, { message });
      }
      const { data: upd } = await admin.from("meetings").update({
        status: "canceled", canceled_at: nowIso,
        history: [...(m.history ?? []), { at: nowIso, kind: "canceled" }],
      }).eq("id", m.id).select("*").maybeSingle();
      return reply((upd as MeetingRow) ?? m);
    }

    // ── תשובות המוזמנים ושינויים שנעשו ישירות ביומן ──────────────────────────
    if (action === "sync") {
      const from = new Date(now.getTime() - 2 * 3600000).toISOString();
      const to = new Date(now.getTime() + 45 * 86400000).toISOString();
      const fresh = new Date(now.getTime() - 60000).toISOString();
      const { data: rows } = await admin.from("meetings").select("*")
        .eq("user_id", userId).eq("status", "scheduled").gte("starts_at", from).lte("starts_at", to)
        .or(`rsvp_checked_at.is.null,rsvp_checked_at.lt."${fresh}"`)
        .order("starts_at").limit(25);
      const list = (rows ?? []) as MeetingRow[];
      if (list.length === 0) return json({ ok: true, updated: 0 });
      const tok = await accessTokenFor(admin, userId);
      if (!tok.ok) return fail(tok.code, tok.status);
      let updated = 0;
      for (const m of list) {
        if (!m.google_event_id) continue;
        const r = await gcall(tok.token, "GET", cal(`/events/${m.google_event_id}`));
        if (r.kind !== "ok" && r.kind !== "gone") continue;
        const s = syncFromEvent(m, r.kind === "gone" ? "gone" : r.data, nowIso);
        const patch = s.history ? { ...s.patch, history: [...(m.history ?? []), s.history] } : s.patch;
        const { error } = await admin.from("meetings").update(patch).eq("id", m.id);
        if (!error) updated++;
      }
      return json({ ok: true, updated });
    }

    return fail("unknown_action", 400);
  } catch (e) {
    console.error("[calendar-meeting] crashed", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});


// Edge Function: google-calendar-connect
// חיבור חד-פעמי של PIVO ליומן Google של המשרד (OAuth), וניתוק.
//
//   POST {action:'start', returnTo}  (JWT)  ⇒ { ok, url } — לאן לשלוח את הדפדפן
//   GET  ?code&state                 (Google מחזיר לכאן)  ⇒ 302 חזרה ל-PIVO עם ?google=connected|error
//   POST {action:'disconnect'}       (JWT)  ⇒ ביטול ההרשאה ב-Google ומחיקת המפתח
//
// ‼ המפתח (refresh token) נשמר רק ב-google_calendar_connections, שהדפדפן לא קורא (225).
// ‼ החזרה מ-Google מגיעה בלי JWT — הזהות היא state חתום (HMAC, 15 דקות), ולכן
//   הפונקציה פתוחה בשער (config.toml) ואינה סומכת על שום דבר אחר בבקשה.
// ‼ בחשבון Google Workspace מגדירים את האפליקציה «פנימית» — בלי אישור של Google
//   ובלי ניתוק כל 7 ימים. ההוראות: docs/MEETINGS-GOOGLE-CALENDAR.md.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  googleEndpoints, authorizeUrl, exchangeCode, googleCall, signState, verifyState, safeReturnTo, GOOGLE_SCOPES,
} from "../_shared/googleCalendar.ts";
import { PROD_PROJECT_REF } from "../_shared/resendResult.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
const STATE_SECRET = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET") || SERVICE_ROLE;
const APP_URL = Deno.env.get("APP_URL") || "https://crm.yasharcpa.co.il";
const IS_PROD = !SUPABASE_URL || SUPABASE_URL.includes(PROD_PROJECT_REF);
const EP = googleEndpoints({ supabaseUrl: SUPABASE_URL, fakeUrl: Deno.env.get("GOOGLE_API_FAKE_URL"), clientIdConfigured: !!CLIENT_ID });
// ‼ חייבת להיות זהה לכתובת שנרשמה ב-Google Cloud («Authorized redirect URIs»).
const REDIRECT_URI = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/google-calendar-connect`;

function backTo(returnTo: string, result: "connected" | "error", reason?: string): Response {
  const u = new URL(returnTo);
  u.searchParams.set("google", result);
  if (reason) u.searchParams.set("reason", reason);
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  const clientId = CLIENT_ID || (EP.fake ? "fake-client" : "");
  const clientSecret = CLIENT_SECRET || (EP.fake ? "fake-secret" : "");

  try {
    // ── החזרה מ-Google ─────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const st = await verifyState(STATE_SECRET, url.searchParams.get("state") ?? "", Date.now());
      if (!st) return backTo(APP_URL, "error", "state");
      if (url.searchParams.get("error")) return backTo(st.returnTo, "error", "denied");
      const code = url.searchParams.get("code") ?? "";
      if (!code || !clientId) return backTo(st.returnTo, "error", "config");

      const t = await exchangeCode(fetch, EP, { code, clientId, clientSecret, redirectUri: REDIRECT_URI });
      if (!t.ok) return backTo(st.returnTo, "error", "token");
      if (!t.refreshToken) return backTo(st.returnTo, "error", "no_refresh");
      const missing = GOOGLE_SCOPES.filter(s => s.startsWith("https://") && t.scope && !t.scope.split(" ").includes(s));
      if (missing.length) return backTo(st.returnTo, "error", "scopes");

      const info = await googleCall<{ email?: string }>(fetch, EP.userinfo, { headers: { Authorization: `Bearer ${t.accessToken}` } });
      const email = info.kind === "ok" ? (info.data.email ?? "") : "";
      if (!email) return backTo(st.returnTo, "error", "userinfo");

      const now = new Date().toISOString();
      const { error } = await admin.from("google_calendar_connections").upsert({
        user_id: st.userId, google_email: email, refresh_token: t.refreshToken, scopes: t.scope ?? GOOGLE_SCOPES.join(" "),
        connected_at: now, last_ok_at: now, last_error: null, last_error_at: null,
      }, { onConflict: "user_id" });
      if (error) {
        console.error("[google-calendar-connect] save failed", error.code, error.message);
        return backTo(st.returnTo, "error", "save");
      }
      return backTo(st.returnTo, "connected");
    }

    // ── מהמערכת: הרו"ח המחובר בלבד ───────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const authHeader = req.headers.get("Authorization") || "";
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    const user = userData?.user ?? null;
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authorized } = await asUser.rpc("is_authorized");
    if (authorized !== true) return json({ ok: false, error: "forbidden" }, 403);

    if (body.action === "start") {
      if (!clientId) return json({ ok: false, error: "google_not_configured" }, 500);
      const returnTo = safeReturnTo(typeof body.returnTo === "string" ? body.returnTo : undefined, APP_URL, !IS_PROD);
      const state = await signState(STATE_SECRET, { userId: user.id, returnTo, exp: Date.now() + 30 * 60000 });
      return json({ ok: true, url: authorizeUrl(EP, { clientId, redirectUri: REDIRECT_URI, state }) });
    }

    if (body.action === "disconnect") {
      const { data: conn } = await admin.from("google_calendar_connections").select("refresh_token").eq("user_id", user.id).maybeSingle();
      if (conn?.refresh_token) {
        // ‼ גם אם הביטול ב-Google נכשל — המפתח נמחק מ-PIVO, ו-PIVO לא יכול לפעול ביומן.
        await googleCall(fetch, `${EP.revoke}?token=${encodeURIComponent(conn.refresh_token)}`, { method: "POST" });
      }
      await admin.from("google_calendar_connections").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[google-calendar-connect] crashed", String(e));
    return req.method === "GET" ? backTo(APP_URL, "error", "crash") : json({ ok: false, error: String(e) }, 500);
  }
});

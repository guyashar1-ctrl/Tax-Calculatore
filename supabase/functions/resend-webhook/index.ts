// Edge Function: resend-webhook
// מקבל אירועי Resend (delivered/bounced/opened/clicked/...) ומעדכן את email_messages
// בזמן אמת לפי resend_id. מאמת חתימת Svix אם RESEND_WEBHOOK_SECRET מוגדר.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function verifySvix(secret: string, id: string, ts: string, sig: string, payload: string): Promise<boolean> {
  try {
    const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const data = new TextEncoder().encode(`${id}.${ts}.${payload}`);
    const mac = await crypto.subtle.sign("HMAC", key, data);
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    const provided = sig.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
    return provided.includes(expected);
  } catch (_e) {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";
  const raw = await req.text();

  if (SECRET) {
    const id = req.headers.get("svix-id") || "";
    const ts = req.headers.get("svix-timestamp") || "";
    const sig = req.headers.get("svix-signature") || "";
    const ok = await verifySvix(SECRET, id, ts, sig, raw);
    if (!ok) return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); } catch (_e) { return new Response("bad json", { status: 400 }); }
  const type: string = evt?.type || "";
  const emailId: string | undefined = evt?.data?.email_id || evt?.data?.id;
  if (!emailId) return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();
  const q = () => admin.from("email_messages");

  try {
    if (type === "email.delivered") {
      await q().update({ status: "delivered", delivered_at: now, updated_at: now }).eq("resend_id", emailId).in("status", ["sent", "delivery_delayed"]);
      await q().update({ delivered_at: now, updated_at: now }).eq("resend_id", emailId).is("delivered_at", null);
    } else if (type === "email.delivery_delayed") {
      await q().update({ status: "delivery_delayed", updated_at: now }).eq("resend_id", emailId).eq("status", "sent");
    } else if (type === "email.bounced") {
      await q().update({ status: "bounced", error: "bounced", updated_at: now }).eq("resend_id", emailId);
    } else if (type === "email.complained") {
      await q().update({ status: "complained", updated_at: now }).eq("resend_id", emailId);
    } else if (type === "email.opened") {
      await q().update({ opened_at: now, updated_at: now }).eq("resend_id", emailId).is("opened_at", null);
      await q().update({ status: "opened", updated_at: now }).eq("resend_id", emailId).in("status", ["sent", "delivered", "delivery_delayed"]);
    } else if (type === "email.clicked") {
      await q().update({ clicked_at: now, updated_at: now }).eq("resend_id", emailId).is("clicked_at", null);
      await q().update({ status: "clicked", updated_at: now }).eq("resend_id", emailId).in("status", ["sent", "delivered", "opened", "delivery_delayed"]);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

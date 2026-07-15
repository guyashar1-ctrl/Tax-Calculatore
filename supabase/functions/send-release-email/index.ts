// Edge Function: send-release-email
// שולח מכתב שחרור לרו"ח הקודם. הנמען הוא כתובת מפורשת (הרו"ח הקודם), לא הלקוח.
// verify_jwt=false בשער + אימות פנימי; שולח רק בהקשר לקוח של המשתמש.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { clientId, to, subject, html } = await req.json();
    if (!clientId || !to || !subject || !html) return json({ error: "missing clientId/to/subject/html" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: client } = await admin.from("clients").select("id,user_id").eq("id", clientId).single();
    if (!client || client.user_id !== user.id) return json({ error: "not found" }, 404);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    const firmName = (profile?.firm_name || "המשרד").trim();
    const comm = profile?.communication || {};
    const fromAddress = (comm.senderEmail && String(comm.senderEmail).trim()) || "onboarding@resend.dev";
    const replyTo = (comm.replyTo && String(comm.replyTo).trim()) || profile?.email || undefined;

    const payload: Record<string, unknown> = { from: `${firmName} <${fromAddress}>`, to: [to], subject, html };
    if (replyTo) payload.reply_to = replyTo;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await r.json();

    const logBase = { user_id: user.id, client_id: clientId, to_email: to, subject, kind: "release", meta: { from: `${firmName} <${fromAddress}>` } };
    if (!r.ok) {
      await admin.from("email_messages").insert({ ...logBase, status: "failed", error: JSON.stringify(body).slice(0, 500) });
      return json({ error: "resend_failed", detail: body }, 502);
    }
    await admin.from("email_messages").insert({ ...logBase, resend_id: body.id, status: "sent" });
    return json({ ok: true, id: body.id, from: `${firmName} <${fromAddress}>` });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

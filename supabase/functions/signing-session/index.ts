// Edge Function: signing-session
// עמוד החתימה הציבורי (ללא התחברות). כל חותם מזוהה בטוקן אישי (signToken).
//   action=get    → פרטי הסשן: שם החותם, אזורי החתימה, קישור חתום ל-PDF, ערכים קיימים.
//   action=submit → קבלת חתימות החותם, עדכון סטטוס; כשכולם חתמו → awaiting_stamp.
// אבטחה: verify_jwt=false בשער; הזיהוי הוא הטוקן האקראי (32 hex) עצמו, כמו onboarding.
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
    const { action, token, values } = await req.json();
    if (!token || typeof token !== "string") return json({ error: "missing token" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // איתור הבקשה לפי טוקן החותם (בתוך מערך ה-signers)
    const { data: reqRow, error: findErr } = await admin
      .from("representation_requests")
      .select("*")
      .contains("signers", JSON.stringify([{ signToken: token }]))
      .maybeSingle();
    if (findErr) return json({ error: findErr.message }, 500);
    if (!reqRow) return json({ error: "not_found" }, 404);

    const signers: any[] = Array.isArray(reqRow.signers) ? reqRow.signers : [];
    const me = signers.find((s) => s?.signToken === token);
    if (!me) return json({ error: "not_found" }, 404);

    const setup = reqRow.signature_setup;
    if (!setup?.pdfDocId || !Array.isArray(setup?.fields)) return json({ error: "no_setup" }, 409);

    if (action === "get") {
      // קישור חתום ל-PDF (שעה) מתוך מאגר המסמכים
      const { data: doc } = await admin
        .from("documents")
        .select("storage_path, file_name")
        .eq("id", setup.pdfDocId)
        .eq("user_id", reqRow.user_id)
        .maybeSingle();
      if (!doc?.storage_path) return json({ error: "pdf_missing" }, 404);
      const { data: signed, error: urlErr } = await admin.storage
        .from("client-documents")
        .createSignedUrl(doc.storage_path, 3600);
      if (urlErr || !signed?.signedUrl) return json({ error: "url_failed" }, 500);

      const { data: profile } = await admin.from("profiles").select("firm_name, branding").eq("id", reqRow.user_id).maybeSingle();

      return json({
        ok: true,
        signerId: me.id,
        signerName: me.name,
        alreadySigned: me.signStatus === "signed",
        requestStatus: reqRow.status,
        clientName: reqRow.client_name,
        firmName: profile?.firm_name || "",
        branding: profile?.branding || {},
        fields: setup.fields,
        signersPublic: signers.map((s) => ({ id: s.id, name: s.name, signStatus: s.signStatus })),
        values: reqRow.signature_values || {},
        pdfUrl: signed.signedUrl,
        pdfFileName: setup.pdfFileName || doc.file_name,
      });
    }

    if (action === "submit") {
      if (reqRow.status !== "pending_signature") return json({ error: "wrong_status" }, 409);
      if (me.signStatus === "signed") return json({ error: "already_signed" }, 409);
      if (!values || typeof values !== "object") return json({ error: "missing values" }, 400);

      // מותר לחותם למלא רק את השדות שלו; כל שדות החובה שלו חייבים להיות מלאים
      const myFields = setup.fields.filter((f: any) => f.signerId === me.id);
      const cleaned: Record<string, any> = {};
      for (const f of myFields) {
        const v = (values as any)[f.id];
        if (!v) return json({ error: "incomplete", fieldId: f.id }, 400);
        const imageDataUrl = typeof v.imageDataUrl === "string" && v.imageDataUrl.startsWith("data:image/") ? v.imageDataUrl : undefined;
        const text = typeof v.text === "string" ? v.text.slice(0, 300) : undefined;
        if (!imageDataUrl && !text) return json({ error: "incomplete", fieldId: f.id }, 400);
        cleaned[f.id] = { fieldId: f.id, imageDataUrl, text, signedAt: new Date().toISOString() };
      }

      const now = new Date().toISOString();
      const newSigners = signers.map((s) => s.signToken === token ? { ...s, signStatus: "signed", signedAt: now } : s);
      const allSigned = newSigners.every((s) => s.signStatus === "signed");
      const newValues = { ...(reqRow.signature_values || {}), ...cleaned };

      const upd: Record<string, unknown> = {
        signers: newSigners,
        signature_values: newValues,
        updated_at: now,
      };
      if (allSigned) upd.status = "awaiting_stamp";

      const { error: upErr } = await admin.from("representation_requests").update(upd).eq("id", reqRow.id);
      if (upErr) return json({ error: upErr.message }, 500);

      if (allSigned && reqRow.linked_client_id) {
        await admin.from("clients").update({ representation_status: "awaiting_stamp", updated_at: now }).eq("id", reqRow.linked_client_id);
      }
      return json({ ok: true, allSigned });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

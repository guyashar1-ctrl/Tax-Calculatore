// Edge Function: automation-worker — נקודת הכניסה היחידה של העובד המקומי.
//
// ‼ יסוד האוטומציה הכללי (לא ספציפי לשע״ם), ראה docs/PIVO-AUTOMATION-FOUNDATION.html
// ו-supabase/150-automation-jobs.sql לסמנטיקה המלאה. ארבע פעולות בלבד —
// claim / heartbeat / complete / fail — כל אחת עוטפת RPC אחד ב-security definer.
//
// ‼ אימות: x-worker-secret בלבד, מאומת מול verify_automation_worker_secret
// (Vault). לא Authorization/service-role — הסוד הזה מוגבל לתפיסה/דיווח על
// automation_jobs ותו לא, ולכן פשרה עליו לא חושפת את שאר המסד. ה-service-role
// עצמו יושב רק כאן, על השרת, ולעולם לא מגיע לתהליך העובד על מחשב המשרד.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Op = "claim" | "heartbeat" | "complete" | "fail" | "status";

interface Body {
  op: Op;
  userId?: string;
  workerId: string;
  jobId?: string;
  actionTypes?: string[];
  leaseSeconds?: number;
  workerVersion?: string;
  result?: Record<string, unknown>;
  artifacts?: unknown[];
  errorCode?: string;
  errorDetail?: string;
  needsHuman?: string;
  /** מצב חיבור לרשויות — דגלים בלבד, לעולם לא מידע אימות. */
  status?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-worker-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const secret = req.headers.get("x-worker-secret") || "";
    if (!secret) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: validSecret, error: secretErr } = await admin.rpc("verify_automation_worker_secret", { p: secret });
    if (secretErr || validSecret !== true) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.op || !body.workerId) return json({ ok: false, error: "bad_request" }, 400);

    if (body.op === "claim") {
      if (!body.userId) return json({ ok: false, error: "bad_request: userId required" }, 400);
      const { data, error } = await admin.rpc("claim_next_automation_job", {
        p_user_id: body.userId,
        p_worker_id: body.workerId,
        p_action_types: body.actionTypes ?? null,
        p_lease_seconds: body.leaseSeconds ?? 60,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, job: data ?? null });
    }

    if (body.op === "heartbeat") {
      if (!body.userId) return json({ ok: false, error: "bad_request: userId required" }, 400);
      const { data, error } = await admin.rpc("heartbeat_automation_job", {
        p_user_id: body.userId,
        p_worker_id: body.workerId,
        p_job_id: body.jobId ?? null,
        p_lease_seconds: body.leaseSeconds ?? 60,
        p_worker_version: body.workerVersion ?? null,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    if (body.op === "status") {
      if (!body.userId) return json({ ok: false, error: "bad_request: userId required" }, 400);
      const { data, error } = await admin.rpc("report_worker_status", {
        p_user_id: body.userId,
        p_worker_id: body.workerId,
        p_status: body.status ?? {},
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    if (body.op === "complete") {
      if (!body.jobId) return json({ ok: false, error: "bad_request: jobId required" }, 400);
      const { data, error } = await admin.rpc("complete_automation_job", {
        p_worker_id: body.workerId,
        p_job_id: body.jobId,
        p_result: body.result ?? {},
        p_artifacts: body.artifacts ?? [],
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    if (body.op === "fail") {
      if (!body.jobId || !body.errorCode) return json({ ok: false, error: "bad_request: jobId+errorCode required" }, 400);
      const { data, error } = await admin.rpc("fail_automation_job", {
        p_worker_id: body.workerId,
        p_job_id: body.jobId,
        p_error_code: body.errorCode,
        p_error_detail: body.errorDetail ?? null,
        p_needs_human: body.needsHuman ?? null,
      });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json(data);
    }

    return json({ ok: false, error: "unknown_op" }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});

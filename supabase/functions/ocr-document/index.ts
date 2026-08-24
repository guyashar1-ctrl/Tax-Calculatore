// Edge Function: ocr-document
// ניתוח מסמכים (ת"ז, רישיון, תלוש...) דרך Gemini — בשרת בלבד.
// מפתח ה-AI לא מגיע לעולם לדפדפן. רק משתמש מחובר ומורשה יכול לקרוא.
//
// אבטחה: bearer JWT → getUser → בדיקת authorized_users. אין מפתח בקוד הצד-לקוח.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type DocType =
  | "id_card" | "drivers_license" | "salary_slip"
  | "form_1301" | "tax_assessment" | "general";

// המודל ניתן לשינוי דרך משתנה סביבה GEMINI_MODEL (בלי פריסה מחדש).
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function buildPrompt(docType: DocType): string {
  const base = `אתה מנתח מסמכים מקצועי. נתח את המסמך המצורף וחלץ את כל הנתונים הרלוונטיים.
החזר את התוצאה **אך ורק** כ-JSON תקין (ללא markdown, ללא backticks) בפורמט הבא:
{
  "documentType": "סוג המסמך שזוהה",
  "confidence": "high/medium/low",
  "summary": "תיאור קצר של המסמך בעברית",
  "data": { },
  "additionalFields": { }
}`;
  switch (docType) {
    case "id_card":
      return `${base}

זהו תעודת זהות ישראלית או ספח. חלץ את השדות הבאים ב-data:
- "firstName": שם פרטי
- "lastName": שם משפחה
- "idNumber": מספר זהות (9 ספרות)
- "birthDate": תאריך לידה בפורמט YYYY-MM-DD
- "gender": "male" או "female"
- "city": עיר מגורים
- "address": כתובת מלאה
אם יש ספח - חלץ גם פרטי בן/בת זוג וילדים ב-additionalFields.`;
    case "drivers_license":
      return `${base}

זהו רישיון נהיגה ישראלי. חלץ את השדות הבאים ב-data:
- "firstName": שם פרטי
- "lastName": שם משפחה
- "idNumber": מספר זהות (9 ספרות)
- "birthDate": תאריך לידה בפורמט YYYY-MM-DD
- "address": כתובת
- "city": עיר`;
    case "salary_slip":
      return `${base}

זהו תלוש שכר ישראלי. חלץ את השדות הבאים ב-data:
- "firstName": שם העובד
- "lastName": שם משפחה
- "idNumber": מספר זהות
- "grossSalary": שכר ברוטו (מספר)
- "employerName": שם המעסיק
חלץ ב-additionalFields: ניכויים, שכר נטו, תאריך, וכל שדה נוסף רלוונטי.`;
    case "form_1301":
      return `${base}

זהו טופס 1301 של רשות המיסים. חלץ את כל השדות האפשריים כולל:
- פרטי הנישום (שם, ת.ז., כתובת)
- הכנסות
- ניכויים
- זיכויים
- כל שדה רלוונטי`;
    case "tax_assessment":
      return `${base}

זוהי שומת מס הכנסה. חלץ את כל הנתונים הרלוונטיים כולל:
- פרטי הנישום
- הכנסה חייבת
- מס שנקבע
- זיכויים ופטורים`;
    default:
      return `${base}

נתח את המסמך וחלץ כל מידע רלוונטי שיכול לשמש למילוי פרטי לקוח:
פרטים אישיים (שם, ת.ז., כתובת, טלפון), הכנסות, או כל מידע פיננסי.`;
  }
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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // חסין לשם הסוד: קודם השם התקני, ואם חסר — כל מפתח סביבה שמכיל "gemini".
    let GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      const envs = Deno.env.toObject();
      const k = Object.keys(envs).find((k) => /gemini/i.test(k) && envs[k]);
      if (k) GEMINI_API_KEY = envs[k];
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── אימות: משתמש מחובר ──
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user?.email) return json({ success: false, error: "unauthorized" }, 401);

    // ── הרשאה: המייל ברשימת המורשים ופעיל ──
    const { data: rows } = await admin.from("authorized_users").select("email").eq("active", true);
    const authorized = (rows ?? []).some((r) => String(r.email).toLowerCase() === user.email!.toLowerCase());
    if (!authorized) return json({ success: false, error: "forbidden" }, 403);

    if (!GEMINI_API_KEY) {
      const seen = Object.keys(Deno.env.toObject()).filter((k) => /gemini/i.test(k));
      return json({ success: false, error: "מפתח ה-AI לא הוגדר בשרת (GEMINI_API_KEY)", seenKeys: seen }, 500);
    }

    const { base64, mimeType, docType } = await req.json();
    if (!base64) return json({ success: false, error: "missing document data" }, 400);
    const dt: DocType = ["id_card", "drivers_license", "salary_slip", "form_1301", "tax_assessment"].includes(docType)
      ? docType : "general";
    const supportedMime = mimeType === "application/pdf" ? "application/pdf"
      : String(mimeType).startsWith("image/") ? mimeType : "application/octet-stream";

    const r = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(dt) }, { inline_data: { mime_type: supportedMime, data: base64 } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return json({ success: false, error: `שגיאת API (${r.status}): ${errBody.substring(0, 800)}` }, 502);
    }
    const body = await r.json();
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ success: false, error: "לא התקבלה תשובה מ-Gemini" }, 502);

    const cleaned = String(text).replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return json({
        success: true,
        data: { ...(parsed.data ?? {}), documentType: parsed.documentType, confidence: parsed.confidence, additionalFields: parsed.additionalFields },
        summary: parsed.summary || "המסמך נותח בהצלחה",
      });
    } catch {
      return json({ success: true, data: { rawText: text }, summary: "המסמך נותח אך לא הוחזר JSON מובנה. הטקסט הגולמי זמין." });
    }
  } catch (e) {
    return json({ success: false, error: `שגיאת שרת: ${String(e)}` }, 500);
  }
});

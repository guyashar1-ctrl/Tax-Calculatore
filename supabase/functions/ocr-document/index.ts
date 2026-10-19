// Edge Function: ocr-document
// ניתוח מסמכים (ת"ז, רישיון, תלוש...) דרך Gemini — בשרת בלבד.
// מפתח ה-AI לא מגיע לעולם לדפדפן. רק משתמש מחובר ומורשה יכול לקרוא.
//
// אבטחה: bearer JWT → getUser → בדיקת authorized_users. אין מפתח בקוד הצד-לקוח.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type DocType =
  | "id_card" | "drivers_license" | "salary_slip"
  | "form_1301" | "tax_assessment" | "prior_return" | "general";

// המודל ניתן לשינוי דרך משתנה סביבה GEMINI_MODEL (בלי פריסה מחדש).
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_FALLBACK_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-flash-lite-latest"}:generateContent`;

// ‼ 19.10.2026 · «הדוח של שנה שעברה כנקודת פתיחה» (docs/proposals/2026-10-19-simple-annual-questionnaire.html):
//   סט שהוגש (1301 + נספחים) ⇒ רק מה שהשאלון צריך לדעת. התוצאה היא הצעה למשרד, לא נתון — המשרד מסמן מה נכון
//   לפני שמשהו נכנס לכרטיס או מוצג ללקוח (src/features/taxYear/priorReturn.ts). לכן: רק מה שכתוב, בלי השלמות.
const PRIOR_RETURN_PROMPT = `זהו סט דוח שנתי שהוגש למס הכנסה בישראל: טופס 1301 (או 1214/0135) ונספחים — טופסי 106, 867, אישורי קצבה,
אישורי ביטוח והפקדות, מכתבי פקיד שומה. קרא את כל העמודים. המטרה: לדעת מה היה לנישומים בשנה הזו, כדי לשאול אותם בשנה הבאה «עדיין?».
החזר **אך ורק** JSON תקין, בלי markdown, במבנה הזה (מערך ריק כשאין; אל תמציא — רק מה שכתוב במסמך):
{
  "taxYear": 2024,
  "registered": { "firstName": "", "lastName": "" },
  "spouse": { "firstName": "", "lastName": "" } או null,
  "familyStatus": "married" | "single" | "divorced" | "widowed" | "unknown",
  "children": [ { "firstName": "", "birthYear": 0 } ],
  "employers": [ { "name": "שם המעסיק כפי שבטופס 106", "side": "registered" | "spouse", "evidence": "" } ],
  "businesses": [ { "name": "", "side": "registered" | "spouse", "evidence": "" } ],
  "pensions": [ { "payer": "מי משלם את הקצבה (קרן פנסיה, מינהלת הגמלאות, ביטוח לאומי…)", "side": "registered" | "spouse", "survivors": false, "evidence": "" } ],
  "disability": [ { "side": "registered" | "spouse", "percent": 0, "evidence": "פטור לפי סעיף 9(5), שדה 309/109, מכתב פקיד שומה" } ],
  "accounts": [ { "institution": "בנק או בית השקעות שהוציא 867", "side": "registered" | "spouse" | "joint", "evidence": "" } ],
  "lifeInsurance": [ { "insurer": "", "side": "registered" | "spouse", "evidence": "שדה 036/081 או אישור מבטח" } ],
  "pensionDeposits": [ { "institution": "", "side": "registered" | "spouse", "evidence": "הפקדה עצמאית לקופה, שדה 135/180" } ],
  "rental": false, "foreign": false, "capitalGains": false, "donations": false,
  "niBenefits": [ { "kind": "דמי לידה / מילואים / אבטלה / נכות…", "side": "registered" | "spouse" } ],
  "notes": [ "עד 5 דברים חריגים שכדאי שהמשרד ידע, בעברית קצרה" ]
}
כללים: "registered" = בן הזוג הרשום בטופס 1301, "spouse" = בן/בת הזוג. מעסיק של ביטוח חיים או פנסיה דרך העבודה אינו "lifeInsurance"/"pensionDeposits" —
רק ביטוח/הפקדה פרטיים שנדרש עליהם זיכוי או ניכוי. "evidence" — קצר: מספר שדה או שם הטופס והעמוד. שמות מוסדות — כפי שכתובים, בעברית.`;

function buildPrompt(docType: DocType): string {
  if (docType === "prior_return") return PRIOR_RETURN_PROMPT;
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
    // ‼ מפתח השירות = קריאה פנימית (בדיקות קבלה מול מסמך אמיתי, בלי להתחבר בשם המשרד). המפתח הזה כבר עוקף כל מדיניות.
    //   החתימה נבדקת בשער (verify_jwt = true ב-config.toml) — לכן אפשר לסמוך על ה-role שבתוך האסימון.
    //   ‼ אם השער יכובה לפונקציה הזו, הענף השני חייב לרדת.
    const roleOf = (t: string) => { try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role; } catch { return null; } };
    const internal = token.length > 0 && (token === SERVICE_KEY || roleOf(token) === "service_role");
    if (!internal) {
      const { data: userData } = await admin.auth.getUser(token);
      const user = userData?.user;
      if (!user?.email) return json({ success: false, error: "unauthorized" }, 401);

      // ── הרשאה: המייל ברשימת המורשים ופעיל ──
      const { data: rows } = await admin.from("authorized_users").select("email").eq("active", true);
      const authorized = (rows ?? []).some((r) => String(r.email).toLowerCase() === user.email!.toLowerCase());
      if (!authorized) return json({ success: false, error: "forbidden" }, 403);
    }

    if (!GEMINI_API_KEY) {
      const seen = Object.keys(Deno.env.toObject()).filter((k) => /gemini/i.test(k));
      return json({ success: false, error: "מפתח ה-AI לא הוגדר בשרת (GEMINI_API_KEY)", seenKeys: seen }, 500);
    }

    const body0 = await req.json();
    const { docType } = body0;
    let { base64, mimeType } = body0;
    // 19.10.2026 · מסמך שכבר בתיק: השרת מוריד אותו בעצמו (סט שהוגש הוא 10MB+ — לא עובר דרך הדפדפן)
    if (!base64 && typeof body0.documentId === "string") {
      const { data: doc } = await admin.from("documents").select("storage_path, file_type").eq("id", body0.documentId).maybeSingle();
      if (!doc?.storage_path) return json({ success: false, error: "document_not_found" }, 404);
      const { data: blob, error: dlErr } = await admin.storage.from("client-documents").download(doc.storage_path);
      if (dlErr || !blob) return json({ success: false, error: "document_download_failed" }, 502);
      const buf = new Uint8Array(await blob.arrayBuffer());
      // ‼ בקשה אחת ל-Gemini מוגבלת ל-20MB; base64 מנפח בשליש
      if (buf.byteLength > 14 * 1024 * 1024) return json({ success: false, error: "file_too_large", sizeMb: Math.round(buf.byteLength / 1048576) }, 413);
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      base64 = btoa(bin);
      mimeType = doc.file_type || blob.type || "application/pdf";
    }
    if (!base64) return json({ success: false, error: "missing document data" }, 400);
    const dt: DocType = ["id_card", "drivers_license", "salary_slip", "form_1301", "tax_assessment", "prior_return"].includes(docType)
      ? docType : "general";
    const supportedMime = mimeType === "application/pdf" ? "application/pdf"
      : String(mimeType).startsWith("image/") ? mimeType : "application/octet-stream";

    const request = JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(dt) }, { inline_data: { mime_type: supportedMime, data: base64 } }] }],
      generationConfig: dt === "prior_return"
        ? { temperature: 0, maxOutputTokens: 8192, responseMimeType: "application/json" }
        : { temperature: 0.1, maxOutputTokens: 4096 },
    });
    // ‼ 19.10.2026 · «עומס» (503/429) אצל המודל הראשי ⇒ מודל אחד חלופי, פעם אחת. קריאה בלבד — אין סכנת כפילות.
    const callModel = (url: string) => fetch(`${url}?key=${GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: request });
    let r = await callModel(GEMINI_URL);
    if ((r.status === 503 || r.status === 429) && GEMINI_FALLBACK_URL !== GEMINI_URL) { await r.body?.cancel(); r = await callModel(GEMINI_FALLBACK_URL); }
    if (!r.ok) {
      const errBody = await r.text();
      if (r.status === 503 || r.status === 429) return json({ success: false, error: "busy", detail: errBody.substring(0, 300) }, 503);
      return json({ success: false, error: `שגיאת API (${r.status}): ${errBody.substring(0, 800)}` }, 502);
    }
    const body = await r.json();
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ success: false, error: "לא התקבלה תשובה מ-Gemini" }, 502);

    const cleaned = String(text).replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      // הדוח הקודם חוזר כמות שהוא — המבנה שלו הוא החוזה (priorReturn.ts), לא data/additionalFields
      if (dt === "prior_return") return json({ success: true, reading: parsed, summary: "הדוח נקרא" });
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

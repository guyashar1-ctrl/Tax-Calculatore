/**
 * Gemini Vision API — ניתוח מסמכים וחילוץ נתונים
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ─── סוגי מסמכים שאנחנו יודעים לנתח ─────────────────────────────────────────

export type DocAnalysisType =
  | 'id_card'           // תעודת זהות
  | 'drivers_license'   // רישיון נהיגה
  | 'salary_slip'       // תלוש שכר
  | 'form_1301'         // טופס 1301
  | 'tax_assessment'    // שומת מס
  | 'general';          // מסמך כללי

// ─── תוצאות ניתוח ────────────────────────────────────────────────────────────

export interface ExtractedClientData {
  // פרטים אישיים
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  birthDate?: string;       // YYYY-MM-DD
  gender?: 'male' | 'female';
  phone?: string;
  email?: string;
  city?: string;
  address?: string;

  // הכנסות (מתלוש שכר / שומה)
  grossSalary?: number;
  employerName?: string;

  // כל שדה נוסף שזוהה
  rawText?: string;
  confidence?: string;
  documentType?: string;
  additionalFields?: Record<string, string>;
}

export interface AnalysisResult {
  success: boolean;
  data: ExtractedClientData;
  summary: string;           // תיאור טקסטואלי של מה שנמצא
  error?: string;
}

// ─── המרת קובץ ל-base64 ─────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── בניית prompt לפי סוג המסמך ──────────────────────────────────────────────

function buildPrompt(docType: DocAnalysisType): string {
  const base = `אתה מנתח מסמכים מקצועי. נתח את המסמך המצורף וחלץ את כל הנתונים הרלוונטיים.
החזר את התוצאה **אך ורק** כ-JSON תקין (ללא markdown, ללא backticks) בפורמט הבא:
{
  "documentType": "סוג המסמך שזוהה",
  "confidence": "high/medium/low",
  "summary": "תיאור קצר של המסמך בעברית",
  "data": {
    ...שדות שחולצו...
  },
  "additionalFields": {
    ...שדות נוספים שזוהו...
  }
}`;

  switch (docType) {
    case 'id_card':
      return `${base}

זהו תעודת זהות ישראלית או ספח. חלץ את השדות הבאים ב-data:
- "firstName": שם פרטי
- "lastName": שם משפחה
- "idNumber": מספר זהות (9 ספרות)
- "birthDate": תאריך לידה בפורמט YYYY-MM-DD
- "gender": "male" או "female"
- "city": עיר מגורים
- "address": כתובת מלאה
אם יש ספח — חלץ גם פרטי בן/בת זוג וילדים ב-additionalFields.`;

    case 'drivers_license':
      return `${base}

זהו רישיון נהיגה ישראלי. חלץ את השדות הבאים ב-data:
- "firstName": שם פרטי
- "lastName": שם משפחה
- "idNumber": מספר זהות (9 ספרות)
- "birthDate": תאריך לידה בפורמט YYYY-MM-DD
- "address": כתובת
- "city": עיר`;

    case 'salary_slip':
      return `${base}

זהו תלוש שכר ישראלי. חלץ את השדות הבאים ב-data:
- "firstName": שם העובד
- "lastName": שם משפחה
- "idNumber": מספר זהות
- "grossSalary": שכר ברוטו (מספר)
- "employerName": שם המעסיק
חלץ ב-additionalFields: ניכויים, שכר נטו, תאריך, וכל שדה נוסף רלוונטי.`;

    case 'form_1301':
      return `${base}

זהו טופס 1301 של רשות המיסים. חלץ את כל השדות האפשריים כולל:
- פרטי הנישום (שם, ת.ז., כתובת)
- הכנסות
- ניכויים
- זיכויים
- כל שדה רלוונטי`;

    case 'tax_assessment':
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

// ─── קריאה ל-Gemini API ──────────────────────────────────────────────────────

export async function analyzeDocument(
  fileData: ArrayBuffer,
  mimeType: string,
  docType: DocAnalysisType = 'general',
): Promise<AnalysisResult> {
  if (!API_KEY) {
    return { success: false, data: {}, summary: '', error: 'מפתח API לא הוגדר. הוסף VITE_GEMINI_API_KEY בקובץ .env' };
  }

  const base64Data = arrayBufferToBase64(fileData);
  const prompt = buildPrompt(docType);

  // Gemini API supports these MIME types for vision
  const supportedMime = mimeType === 'application/pdf' ? 'application/pdf'
    : mimeType.startsWith('image/') ? mimeType
    : 'application/octet-stream';

  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: supportedMime,
                data: base64Data,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { success: false, data: {}, summary: '', error: `שגיאת API (${response.status}): ${errBody.substring(0, 200)}` };
    }

    const json = await response.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return { success: false, data: {}, summary: '', error: 'לא התקבלה תשובה מ-Gemini' };
    }

    // Parse JSON from response (strip markdown if present)
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed: {
      documentType?: string;
      confidence?: string;
      summary?: string;
      data?: Record<string, unknown>;
      additionalFields?: Record<string, string>;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // If JSON parsing fails, return the raw text
      return {
        success: true,
        data: { rawText: text },
        summary: 'המסמך נותח אך לא הוחזר JSON מובנה. הטקסט הגולמי זמין.',
      };
    }

    const data: ExtractedClientData = {
      ...(parsed.data as ExtractedClientData ?? {}),
      documentType: parsed.documentType,
      confidence: parsed.confidence,
      additionalFields: parsed.additionalFields,
    };

    return {
      success: true,
      data,
      summary: parsed.summary || 'המסמך נותח בהצלחה',
    };
  } catch (err) {
    return {
      success: false,
      data: {},
      summary: '',
      error: `שגיאת רשת: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── בדיקת זמינות API ────���───────────────────────────────────────────────────

export function isGeminiAvailable(): boolean {
  return !!API_KEY;
}

/**
 * ניתוח מסמכים וחילוץ נתונים.
 *
 * הקריאה ל-Gemini עברה לשרת (פונקציית ocr-document). מפתח ה-AI לא מגיע יותר
 * לדפדפן — הדפדפן שולח את המסמך לפונקציה, שמוודאת שהמשתמש מורשה וקוראת ל-AI
 * עם מפתח שיושב רק בשרת. הקובץ הזה נשאר כשכבת נוחות (המרה ל-base64 + טיפוסים).
 */
import { supabase } from '../lib/supabase';

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

// ─── קריאה לפונקציית ה-OCR בשרת ──────────────────────────────────────────────
// בניית ה-prompt והקריאה ל-Gemini עברו לפונקציה ocr-document (בשרת).

export async function analyzeDocument(
  fileData: ArrayBuffer,
  mimeType: string,
  docType: DocAnalysisType = 'general',
): Promise<AnalysisResult> {
  try {
    const base64 = arrayBufferToBase64(fileData);
    const { data, error } = await supabase.functions.invoke('ocr-document', {
      body: { base64, mimeType, docType },
    });
    if (error) {
      return { success: false, data: {}, summary: '', error: `שגיאת ניתוח: ${error.message}` };
    }
    if (!data?.success) {
      return { success: false, data: {}, summary: '', error: data?.error || 'הניתוח נכשל' };
    }
    return {
      success: true,
      data: (data.data ?? {}) as ExtractedClientData,
      summary: data.summary || 'המסמך נותח בהצלחה',
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

// ─── זמינות ה-OCR ────────────────────────────────────────────────────────────
// המפתח יושב בשרת; הזמינות נקבעת שם. תמיד מציגים את הכפתור, והשרת יחזיר שגיאה
// ברורה אם המפתח לא הוגדר.

export function isGeminiAvailable(): boolean {
  return true;
}

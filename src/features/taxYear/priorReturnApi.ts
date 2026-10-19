// 19.10.2026 · הדוח של שנה שעברה — איתור בין מסמכי הלקוח וקריאה (ocr-document, docType prior_return).
// ‼ הקובץ לא עובר דרך הדפדפן: השרת מוריד אותו מהאחסון לפי המזהה (סט שהוגש הוא 10MB ומעלה).
// ‼ קובץ שהמשרד בוחר מהמחשב (אין דוח בתיק) — נשלח ישירות לקריאה, ולא נשמר במסמכים.

import { supabase } from '../../lib/supabase';
import { isPriorReturnDoc, type PriorReading } from './priorReturn';

export interface PriorDoc { id: string; fileName: string; sizeMb: number }

export async function findPriorReturnDocs(clientId: string, taxYear: number): Promise<PriorDoc[]> {
  const { data, error } = await supabase.from('documents').select('id, file_name, category, year, file_size, label_id')
    .eq('client_id', clientId).eq('year', String(taxYear - 1));
  if (error || !data?.length) return [];
  const labelIds = [...new Set(data.map(d => d.label_id).filter(Boolean))] as string[];
  const { data: labels } = labelIds.length ? await supabase.from('document_labels').select('id, name').in('id', labelIds) : { data: [] };
  const nameOf = new Map((labels ?? []).map(l => [l.id as string, String(l.name)]));
  return data
    .filter(d => isPriorReturnDoc({ fileName: String(d.file_name), category: d.category as string, year: d.year as string, label: d.label_id ? nameOf.get(d.label_id as string) : null }, taxYear))
    .map(d => ({ id: String(d.id), fileName: String(d.file_name), sizeMb: Math.round(Number(d.file_size ?? 0) / 104857.6) / 10 }));
}

export type ReadResult = { ok: true; reading: PriorReading } | { ok: false; error: string };

const ERR: Record<string, string> = {
  busy: 'שירות הקריאה עמוס כרגע — לנסות שוב בעוד דקה',
  file_too_large: 'הקובץ גדול מדי לקריאה אוטומטית (מעל 14MB) — אפשר לפרסם בלי, או להעלות רק את טופס 1301',
  document_not_found: 'המסמך לא נמצא בתיק',
  document_download_failed: 'לא הצלחנו להוריד את המסמך מהתיק',
  forbidden: 'אין הרשאה לקריאת מסמכים',
};

async function invoke(body: Record<string, unknown>): Promise<ReadResult> {
  const { data, error } = await supabase.functions.invoke('ocr-document', { body: { ...body, docType: 'prior_return' } });
  // שגיאת HTTP מגיעה עם גוף JSON — לקרוא את הקוד שלו
  let payload = data as { success?: boolean; reading?: PriorReading; error?: string } | null;
  if (error && (error as { context?: Response }).context) {
    try { payload = await (error as { context: Response }).context.json(); } catch { /* נשאר null */ }
  }
  if (payload?.success && payload.reading) return { ok: true, reading: payload.reading };
  const code = payload?.error ?? error?.message ?? 'read_failed';
  return { ok: false, error: ERR[code] ?? (payload?.success ? 'הקריאה לא החזירה מבנה מוכר — אפשר לנסות שוב או לפרסם בלי' : `הקריאה נכשלה (${code.slice(0, 120)})`) };
}

export const readPriorReturnDoc = (documentId: string) => invoke({ documentId });

export async function readPriorReturnFile(file: File): Promise<ReadResult> {
  if (file.size > 14 * 1024 * 1024) return { ok: false, error: ERR.file_too_large };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return invoke({ base64: btoa(bin), mimeType: file.type || 'application/pdf' });
}

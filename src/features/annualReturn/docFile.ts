// ─── קובץ של מסמך שהלקוח העלה — לצפייה ליד ההזנה ולסט ההדפסה (25.10.2026) ──────────────────────────────────
// ‼ אותו מסלול כמו מאגר המסמכים (useDocumentStore.getDoc): documents.storage_path ⇒ storage.download מהדלי הפרטי.
//   אין קישור ציבורי; כתובת blob מקומית בלבד, שמשוחררת כשסוגרים.
import { supabase } from '../../lib/supabase';

const BUCKET = 'client-documents';
export interface LoadedFile { url: string; type: string; name: string; bytes: ArrayBuffer }

export async function loadDocumentFile(documentId: string): Promise<LoadedFile | null> {
  const { data: row, error } = await supabase.from('documents').select('storage_path, file_name, file_type').eq('id', documentId).maybeSingle();
  if (error || !row?.storage_path) return null;
  const { data: blob, error: dl } = await supabase.storage.from(BUCKET).download(String(row.storage_path));
  if (dl || !blob) return null;
  const name = String(row.file_name ?? 'מסמך');
  const type = String(row.file_type || blob.type || (/\.pdf$/i.test(name) ? 'application/pdf' : ''));
  const bytes = await blob.arrayBuffer();
  return { url: URL.createObjectURL(new Blob([bytes], { type })), type, name, bytes };
}

export const isPdf = (f: Pick<LoadedFile, 'type' | 'name'>) => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);

/** הקובץ כתמונות (לסט ההדפסה): תמונה — כמו שהיא; PDF — כל עמוד לתמונה. */
export async function fileAsImages(f: LoadedFile, maxEdge = 1600): Promise<string[]> {
  if (!isPdf(f)) {
    const reader = new FileReader();
    return [await new Promise<string>((res, rej) => { reader.onload = () => res(String(reader.result)); reader.onerror = rej; reader.readAsDataURL(new Blob([f.bytes], { type: f.type })); })];
  }
  const { loadPdf, renderThumbnail } = await import('../../utils/pdfRender');
  const pdf = await loadPdf(f.bytes);
  const out: string[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const c = document.createElement('canvas');
    await renderThumbnail(pdf.doc, i, c, maxEdge);
    out.push(c.toDataURL('image/jpeg', 0.85));
  }
  return out;
}

// ─── מאגר מסמכים מבוסס Supabase Storage ────────────────────────────────
// מחליף את useIndexedDB.ts. הממשק זהה למה שהיה כדי לא לשבור consumers,
// אבל מאחורי הקלעים הקבצים נשמרים ב-bucket 'client-documents' של Supabase
// והמטא-נתונים בטבלה public.documents.
//
// רינדור הנתיב של הקובץ ב-bucket: <user_id>/<client_id>/<doc_id>
// (RLS מבטיח שכל משתמש רואה רק קבצים תחת התיקייה שלו.)
//
// שינוי קונספטואלי חשוב מ-IndexedDB:
//   getDocsByClient — מחזיר *רק מטא-נתונים*, fileData=ArrayBuffer(0). זה מהיר.
//   getDoc(id)      — מוריד גם את הבייטים של הקובץ. השתמש בו רק כשבאמת צריך
//                     את התוכן (תצוגה מקדימה / הורדה / OCR וכו').

import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const BUCKET = 'client-documents';

export type DocCategory =
  | 'id_card'              // תעודת זהות / ספח
  | 'drivers_license'      // רישיון נהיגה
  | 'form_1301'            // טופס 1301
  | 'residence_certificate'// אישור מגורים
  | 'salary_slip'          // תלוש שכר
  | 'pension_statement'    // אישור קרן פנסיה
  | 'business_document'    // מסמך עסקי
  | 'tax_assessment'       // שומת מס
  | 'ni_document'          // מסמך ביטוח לאומי
  | 'other';               // אחר

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  id_card: 'תעודת זהות / ספח',
  drivers_license: 'רישיון נהיגה',
  form_1301: 'טופס 1301',
  residence_certificate: 'אישור מגורים (ישוב מזכה)',
  salary_slip: 'תלוש שכר',
  pension_statement: 'אישור קרן פנסיה / ביטוח מנהלים',
  business_document: 'מסמך עסקי',
  tax_assessment: 'שומת מס',
  ni_document: 'מסמך ביטוח לאומי',
  other: 'אחר',
};

export interface StoredDoc {
  id: string;
  clientId: string;
  fileName: string;
  fileType: string;       // MIME type
  fileSize: number;
  category: DocCategory;
  year: number | 'general';
  uploadedAt: string;
  description: string;
  notes: string;
  /**
   * תוכן הקובץ. מ-getDocsByClient ⇒ ArrayBuffer ריק (לא נטען עדיין).
   * מ-getDoc(id) ⇒ הבייטים האמיתיים. כדי להבחין בין "מסמך אמיתי שלא נטען" ל"דמה",
   * ראה השדה _remote.
   */
  fileData: ArrayBuffer;
  /**
   * סימון פנימי: יש קובץ אמיתי באחסון (גם אם fileData עדיין ריק כי לא טענו אותו).
   * דמה (sample/fake) — _remote = false.
   */
  _remote?: boolean;
  linkedTo?: string;
  linkedLabel?: string;
}

function storagePath(userId: string, clientId: string, docId: string): string {
  return `${userId}/${clientId}/${docId}`;
}

function rowToStoredDoc(row: any, withBytes?: ArrayBuffer): StoredDoc {
  const yearText: string = row.year ?? 'general';
  const yearVal: number | 'general' =
    yearText === 'general' ? 'general' : (parseInt(yearText, 10) || 'general');
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    category: row.category as DocCategory,
    year: yearVal,
    uploadedAt: row.uploaded_at,
    description: row.description ?? '',
    notes: row.notes ?? '',
    fileData: withBytes ?? new ArrayBuffer(0),
    _remote: true,
    linkedTo: row.linked_to ?? undefined,
    linkedLabel: row.linked_label ?? undefined,
  };
}

export function useDocumentStore() {
  const { user } = useAuth();
  const userId = user?.id;

  async function saveDoc(doc: StoredDoc): Promise<void> {
    console.log('[useDocumentStore.saveDoc] start', {
      docId: doc.id,
      clientId: doc.clientId,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      hasBytes: doc.fileData.byteLength > 0,
      userId,
    });
    if (!userId) {
      const msg = 'אינך מחובר/ת. נסה להיכנס שוב לאפליקציה.';
      console.error('[useDocumentStore.saveDoc]', msg);
      throw new Error(msg);
    }

    const path = storagePath(userId, doc.clientId, doc.id);
    console.log('[useDocumentStore.saveDoc] storage path:', path);

    // 1. אם יש בייטים — מעלים ל-Storage. אם אין (דמה / מטא-בלבד) — מדלגים.
    if (doc.fileData.byteLength > 0) {
      const blob = new Blob([doc.fileData], { type: doc.fileType || 'application/octet-stream' });
      const { data: upData, error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: doc.fileType || 'application/octet-stream' });
      if (upErr) {
        console.error('[useDocumentStore.saveDoc] storage.upload failed', upErr);
        throw new Error(`שמירה ב-Storage נכשלה: ${upErr.message || JSON.stringify(upErr)}`);
      }
      console.log('[useDocumentStore.saveDoc] storage upload OK', upData);
    }

    // 2. upsert מטא-נתונים בטבלה
    const yearText = typeof doc.year === 'number' ? String(doc.year) : doc.year;
    const row = {
      id: doc.id,
      user_id: userId,
      client_id: doc.clientId,
      storage_path: path,
      file_name: doc.fileName,
      file_type: doc.fileType || 'application/octet-stream',
      file_size: doc.fileSize,
      category: doc.category,
      year: yearText,
      description: doc.description ?? '',
      notes: doc.notes ?? '',
      linked_to: doc.linkedTo ?? null,
      linked_label: doc.linkedLabel ?? null,
      uploaded_at: doc.uploadedAt,
    };
    console.log('[useDocumentStore.saveDoc] inserting row:', row);
    const { data: ins, error } = await supabase
      .from('documents')
      .upsert(row, { onConflict: 'id' })
      .select();
    if (error) {
      console.error('[useDocumentStore.saveDoc] documents upsert failed', error);
      throw new Error(`שמירת מטא-נתונים נכשלה: ${error.message || JSON.stringify(error)}`);
    }
    console.log('[useDocumentStore.saveDoc] DB insert OK', ins);
    // event גלובלי כדי שכל המסכים שמציגים מסמכים של הלקוח הזה ירעננו
    window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId: doc.clientId } }));
  }

  async function getDocsByClient(clientId: string): Promise<StoredDoc[]> {
    // לא מסננים לפי user_id — RLS עושה את זה אוטומטית, וזה מבטל בעיה אפשרית
    // של חוסר התאמה (case/format/uuid-vs-text) בין userId שלנו ל-user_id בטבלה.
    console.log('[useDocumentStore.getDocsByClient] querying', { clientId });
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false });
    console.log('[useDocumentStore.getDocsByClient] raw result', {
      hasError: !!error,
      error,
      rowCount: data?.length ?? 0,
    });
    if (error) {
      console.error('[useDocumentStore.getDocsByClient] FAILED', error);
      return [];
    }
    return (data ?? []).map(row => rowToStoredDoc(row));
  }

  async function getDoc(id: string): Promise<StoredDoc | undefined> {
    if (!userId) return undefined;
    const { data: row, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !row) {
      if (error) console.error('getDoc metadata failed', error);
      return undefined;
    }
    // מורידים את הבייטים מהאחסון
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .download(row.storage_path);
      if (dlErr) {
        console.warn('getDoc download failed (returning metadata only)', dlErr);
        return rowToStoredDoc(row);
      }
      const bytes = await blob.arrayBuffer();
      return rowToStoredDoc(row, bytes);
    } catch (err) {
      console.warn('getDoc download exception', err);
      return rowToStoredDoc(row);
    }
  }

  async function deleteDoc(id: string): Promise<void> {
    if (!userId) throw new Error('Not signed in');

    // קודם נשלוף את ה-storage_path כדי לדעת מה למחוק מהאחסון
    const { data: row } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (row?.storage_path) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
      if (rmErr) console.warn('storage.remove failed (continuing)', rmErr);
    }

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      console.error('documents delete failed', error);
      throw error;
    }
    // event גלובלי כדי שכל המסכים שמציגים מסמכים ירעננו
    if (row?.storage_path) {
      // מחלצים את ה-clientId מהנתיב — '<userId>/<clientId>/<docId>'
      const parts = String(row.storage_path).split('/');
      if (parts.length >= 2) {
        window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId: parts[1] } }));
      }
    }
  }

  return { saveDoc, getDocsByClient, getDoc, deleteDoc };
}

// ─── עזר לסניף "האם המסמך הזה הוא דמה (אין לו קובץ אמיתי)?" ───────────
// קודם השתמשנו ב-fileData.byteLength === 0. זה לא עובד יותר כי מטא-נתונים
// מוחזרים בלי בייטים. עכשיו: דמה = id מתחיל ב-'fake-' (סמפלים) או _remote=false.
export function isPlaceholderDoc(d: StoredDoc): boolean {
  if (d._remote) return false;
  if (d.id.startsWith('fake-')) return true;
  return d.fileData.byteLength === 0; // fallback לקוד ישן שעדיין לא עבר
}

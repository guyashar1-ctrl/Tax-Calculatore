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
  | 'engagement_contract'  // הסכם התקשרות (הצעת מחיר חתומה)
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
  engagement_contract: 'הסכם התקשרות',
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
  /** התיקייה שבה יושב המסמך. null/undefined = הרמה הראשית של הלקוח. */
  folderId?: string | null;
  /** תווית מקצועית אחת (M3) — document_labels.id. חובה על כל פריט. */
  labelId?: string | null;
}

/** תיקייה בתוך מסמכי לקוח. ארגון לוגי בלבד — הקובץ ב-Storage לא זז. */
export interface DocFolder {
  id: string;
  clientId: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  /** תווית מקצועית אחת (M3) — יורשת לילדים חדשים כברירת מחדל, לא מחייבת בעצמה. */
  labelId?: string | null;
  /** שנה (M3) — 'כללי' או שנה כמחרוזת. */
  year?: string | null;
}

/** תווית מקצועית מנוהלת-משרד (M3). 'לבדיקה' היא השמורה — legacy שטרם סווג. */
export interface DocumentLabel {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
  isReserved: boolean;
}

function rowToLabel(row: any): DocumentLabel {
  return { id: row.id, userId: row.user_id, name: row.name, sortOrder: row.sort_order ?? 0, isReserved: !!row.is_reserved };
}

function rowToFolder(row: any): DocFolder {
  return {
    id: row.id,
    clientId: row.client_id,
    parentId: row.parent_id ?? null,
    name: row.name,
    createdAt: row.created_at,
    labelId: row.label_id ?? null,
    year: row.year ?? null,
  };
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
    folderId: row.folder_id ?? null,
    labelId: row.label_id ?? null,
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
      folder_id: doc.folderId ?? null,
      label_id: doc.labelId ?? null,
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

  // ─── תיקיות ─────────────────────────────────────────────────────────────
  async function getFoldersByClient(clientId: string): Promise<DocFolder[]> {
    const { data, error } = await supabase
      .from('document_folders')
      .select('*')
      .eq('client_id', clientId)
      .order('name', { ascending: true });
    if (error) {
      console.error('[useDocumentStore.getFoldersByClient] FAILED', error);
      return [];
    }
    return (data ?? []).map(rowToFolder);
  }

  /**
   * יוצרת תיקייה — ואם כבר קיימת תיקייה באותו שם תחת אותו הורה, מחזירה אותה.
   * העלאת תיקייה מהמחשב נשענת על זה: מסלול קבצים חוזר על אותם שמות תיקיות.
   */
  async function createFolder(
    clientId: string, name: string, parentId: string | null,
    meta?: { labelId?: string | null; year?: string | null },
  ): Promise<DocFolder> {
    if (!userId) throw new Error('אינך מחובר/ת. נסה להיכנס שוב לאפליקציה.');
    const clean = name.trim();
    if (!clean) throw new Error('שם התיקייה לא יכול להיות ריק');

    const existing = await supabase
      .from('document_folders')
      .select('*')
      .eq('client_id', clientId)
      .eq('name', clean);
    const match = (existing.data ?? []).find((r: any) => (r.parent_id ?? null) === parentId);
    if (match) return rowToFolder(match);

    const row = {
      id: crypto.randomUUID(),
      user_id: userId,
      client_id: clientId,
      parent_id: parentId,
      name: clean,
      label_id: meta?.labelId ?? null,
      year: meta?.year ?? null,
    };
    const { data, error } = await supabase.from('document_folders').insert(row).select().single();
    if (error) {
      // מרוץ מול יצירה מקבילה (העלאת תיקייה מרובת קבצים) — נשלוף את הקיימת
      const retry = await supabase
        .from('document_folders')
        .select('*')
        .eq('client_id', clientId)
        .eq('name', clean);
      const found = (retry.data ?? []).find((r: any) => (r.parent_id ?? null) === parentId);
      if (found) return rowToFolder(found);
      console.error('[useDocumentStore.createFolder] FAILED', error);
      throw new Error(`יצירת התיקייה נכשלה: ${error.message || JSON.stringify(error)}`);
    }
    window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId } }));
    return rowToFolder(data);
  }

  async function renameFolder(id: string, name: string): Promise<void> {
    if (!userId) throw new Error('אינך מחובר/ת.');
    const clean = name.trim();
    if (!clean) throw new Error('שם התיקייה לא יכול להיות ריק');
    const { error } = await supabase
      .from('document_folders')
      .update({ name: clean })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(`שינוי שם התיקייה נכשל: ${error.message || JSON.stringify(error)}`);
  }

  /**
   * מוחקת תיקייה. תת-התיקיות נמחקות איתה (cascade), והקבצים שהיו בהן
   * עוברים לרמה הראשית (on delete set null) — קובץ לא נמחק בטעות.
   */
  async function deleteFolder(id: string): Promise<void> {
    if (!userId) throw new Error('אינך מחובר/ת.');
    const { error } = await supabase
      .from('document_folders')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(`מחיקת התיקייה נכשלה: ${error.message || JSON.stringify(error)}`);
  }

  /** מעביר מסמכים קיימים לתיקייה (או לרמה הראשית כש-folderId=null). */
  async function moveDocsToFolder(docIds: string[], folderId: string | null): Promise<void> {
    if (!userId) throw new Error('אינך מחובר/ת.');
    if (docIds.length === 0) return;
    const { error } = await supabase
      .from('documents')
      .update({ folder_id: folderId })
      .in('id', docIds)
      .eq('user_id', userId);
    if (error) throw new Error(`העברת המסמכים נכשלה: ${error.message || JSON.stringify(error)}`);
  }

  // ─── תוויות מקצועיות (M3) ──────────────────────────────────────────────
  async function getLabels(): Promise<DocumentLabel[]> {
    const { data, error } = await supabase
      .from('document_labels')
      .select('*')
      .order('is_reserved', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) { console.error('[useDocumentStore.getLabels] FAILED', error); return []; }
    return (data ?? []).map(rowToLabel);
  }

  async function createLabel(name: string): Promise<DocumentLabel> {
    if (!userId) throw new Error('אינך מחובר/ת.');
    const clean = name.trim();
    if (!clean) throw new Error('שם התווית לא יכול להיות ריק');
    const { data, error } = await supabase
      .from('document_labels')
      .insert({ user_id: userId, name: clean })
      .select().single();
    if (error) throw new Error(`יצירת התווית נכשלה: ${error.message || JSON.stringify(error)}`);
    return rowToLabel(data);
  }

  async function renameLabel(id: string, name: string): Promise<void> {
    if (!userId) throw new Error('אינך מחובר/ת.');
    const clean = name.trim();
    if (!clean) throw new Error('שם התווית לא יכול להיות ריק');
    const { error } = await supabase
      .from('document_labels')
      .update({ name: clean })
      .eq('id', id).eq('user_id', userId).eq('is_reserved', false);
    if (error) throw new Error(`שינוי שם התווית נכשל: ${error.message || JSON.stringify(error)}`);
  }

  /** מחיקה בטוחה — פריטים שהיו מתויגים בה עוברים ל'לבדיקה' קודם (ראה 95-…sql). */
  async function deleteLabel(id: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('delete_document_label', { p_label_id: id });
    if (error) return { ok: false, error: error.message };
    return data as { ok: boolean; error?: string };
  }

  // ─── קישור מסמך לכמה לקוחות (M3) ────────────────────────────────────────
  async function getLinkedClientIds(documentId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('document_clients').select('client_id').eq('document_id', documentId);
    if (error) { console.error('[useDocumentStore.getLinkedClientIds] FAILED', error); return []; }
    return (data ?? []).map((r: any) => r.client_id);
  }

  async function linkDocumentClient(documentId: string, clientId: string): Promise<void> {
    if (!userId) throw new Error('אינך מחובר/ת.');
    const { error } = await supabase
      .from('document_clients')
      .upsert({ user_id: userId, document_id: documentId, client_id: clientId }, { onConflict: 'document_id,client_id' });
    if (error) throw new Error(`קישור הלקוח נכשל: ${error.message || JSON.stringify(error)}`);
  }

  async function unlinkDocumentClient(documentId: string, clientId: string): Promise<void> {
    const { error } = await supabase
      .from('document_clients').delete().eq('document_id', documentId).eq('client_id', clientId);
    if (error) throw new Error(`ביטול הקישור נכשל: ${error.message || JSON.stringify(error)}`);
  }

  /**
   * מסמכי לקוח כולל מסמכים ששייכים בעיקר ללקוח אחר אבל מקושרים גם אליו
   * (למשל חוזה שכירות משותף לבני זוג) — בלי לשכפל תוצאות.
   */
  async function getDocsByClientIncludingLinked(clientId: string): Promise<StoredDoc[]> {
    const [primary, linkRows] = await Promise.all([
      supabase.from('documents').select('*').eq('client_id', clientId).order('uploaded_at', { ascending: false }),
      supabase.from('document_clients').select('document_id').eq('client_id', clientId),
    ]);
    if (primary.error) { console.error('[getDocsByClientIncludingLinked] primary FAILED', primary.error); return []; }
    const primaryDocs = (primary.data ?? []).map(row => rowToStoredDoc(row));
    const linkedIds = (linkRows.data ?? []).map((r: any) => r.document_id).filter((id: string) => !primaryDocs.some(d => d.id === id));
    if (linkedIds.length === 0) return primaryDocs;
    const extra = await supabase.from('documents').select('*').in('id', linkedIds);
    if (extra.error) return primaryDocs;
    return [...primaryDocs, ...(extra.data ?? []).map(row => rowToStoredDoc(row))];
  }

  /**
   * העברת מסמך ללקוח אחר — הבעלות עוברת, ואין עותק שני.
   * ‼ שלוש פעולות שונות ואסור לבלבל ביניהן:
   *   linkDocumentClient  — אותו קובץ, כמה לקוחות. עריכה משפיעה על כולם.
   *   moveDocToClient     — הקובץ עוזב את הלקוח הנוכחי. אין כפילות.
   *   duplicateDocToClient— עותק עצמאי חדש. עריכה בו לא נוגעת במקור.
   * ‼ folder_id מתאפס: תיקייה שייכת ללקוח, ותיקיית המקור אינה קיימת אצל היעד.
   * הקובץ עצמו זז ב-Storage דרך move בצד השרת — בלי הורדה/העלאה, ולכן
   * אין רגע שבו הבייטים קיימים רק בזיכרון הדפדפן.
   */
  async function moveDocToClient(docId: string, targetClientId: string): Promise<{ ok: boolean; error?: string }> {
    if (!userId) return { ok: false, error: 'אינך מחובר/ת.' };
    const { data: row } = await supabase
      .from('documents').select('storage_path, client_id')
      .eq('id', docId).eq('user_id', userId).maybeSingle();
    if (!row) return { ok: false, error: 'המסמך לא נמצא.' };
    if (row.client_id === targetClientId) return { ok: false, error: 'המסמך כבר שייך ללקוח הזה.' };

    const from = row.storage_path as string | null;
    const to = storagePath(userId, targetClientId, docId);
    if (from && from !== to) {
      const { error: mvErr } = await supabase.storage.from(BUCKET).move(from, to);
      // ‼ אם הקובץ עצמו לא זז — עוצרים. עדכון השורה לבדו היה מותיר רשומה
      // שמצביעה על נתיב ריק, כלומר מסמך "קיים" בלי קובץ.
      if (mvErr) return { ok: false, error: `העברת הקובץ נכשלה: ${mvErr.message}` };
    }
    const { error } = await supabase.from('documents')
      .update({ client_id: targetClientId, storage_path: to, folder_id: null })
      .eq('id', docId).eq('user_id', userId);
    if (error) return { ok: false, error: `עדכון המסמך נכשל: ${error.message}` };

    // קישור עודף ליעד (אם היה) הופך למיותר ברגע שהוא הבעלים
    await supabase.from('document_clients').delete()
      .eq('document_id', docId).eq('client_id', targetClientId);

    window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId: row.client_id } }));
    window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId: targetClientId } }));
    return { ok: true };
  }

  /**
   * שכפול ללקוח אחר — עותק עצמאי לגמרי (id חדש, קובץ חדש באחסון).
   * שינוי שם/תוכן בעותק אינו נוגע במקור, וזה כל ההבדל מ"קשר ללקוח נוסף".
   */
  async function duplicateDocToClient(docId: string, targetClientId: string): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!userId) return { ok: false, error: 'אינך מחובר/ת.' };
    const { data: row } = await supabase
      .from('documents').select('*')
      .eq('id', docId).eq('user_id', userId).maybeSingle();
    if (!row) return { ok: false, error: 'המסמך לא נמצא.' };

    const newId = crypto.randomUUID();
    const to = storagePath(userId, targetClientId, newId);
    if (row.storage_path) {
      const { error: cpErr } = await supabase.storage.from(BUCKET).copy(row.storage_path, to);
      if (cpErr) return { ok: false, error: `העתקת הקובץ נכשלה: ${cpErr.message}` };
    }
    const { error } = await supabase.from('documents').insert({
      ...row,
      id: newId,
      client_id: targetClientId,
      storage_path: to,
      folder_id: null,           // תיקיות שייכות ללקוח — מתחילים בשורש
      uploaded_at: new Date().toISOString(),
    });
    if (error) {
      // ניקוי הקובץ שהועתק, כדי לא להשאיר יתום באחסון
      if (row.storage_path) await supabase.storage.from(BUCKET).remove([to]);
      return { ok: false, error: `יצירת העותק נכשלה: ${error.message}` };
    }
    window.dispatchEvent(new CustomEvent('crm:docs-changed', { detail: { clientId: targetClientId } }));
    return { ok: true, id: newId };
  }

  // ─── קישור מסמך למשימה — document_task_links (M3) ───────────────────────
  async function getLinkedTaskIds(documentId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('document_task_links').select('task_id').eq('document_id', documentId);
    if (error) { console.error('[useDocumentStore.getLinkedTaskIds] FAILED', error); return []; }
    return (data ?? []).map((r: any) => r.task_id);
  }

  async function getLinkedDocIdsForTask(taskId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('document_task_links').select('document_id').eq('task_id', taskId);
    if (error) { console.error('[useDocumentStore.getLinkedDocIdsForTask] FAILED', error); return []; }
    return (data ?? []).map((r: any) => r.document_id);
  }

  async function linkDocumentTask(documentId: string, taskId: string): Promise<void> {
    if (!userId) throw new Error('אינך מחובר/ת.');
    const { error } = await supabase
      .from('document_task_links')
      .upsert({ user_id: userId, document_id: documentId, task_id: taskId }, { onConflict: 'document_id,task_id' });
    if (error) throw new Error(`קישור המשימה נכשל: ${error.message || JSON.stringify(error)}`);
  }

  async function unlinkDocumentTask(documentId: string, taskId: string): Promise<void> {
    const { error } = await supabase
      .from('document_task_links').delete().eq('document_id', documentId).eq('task_id', taskId);
    if (error) throw new Error(`ביטול קישור המשימה נכשל: ${error.message || JSON.stringify(error)}`);
  }

  return {
    saveDoc, getDocsByClient, getDoc, deleteDoc,
    getFoldersByClient, createFolder, renameFolder, deleteFolder, moveDocsToFolder,
    getLabels, createLabel, renameLabel, deleteLabel,
    getLinkedClientIds, linkDocumentClient, unlinkDocumentClient, getDocsByClientIncludingLinked,
    moveDocToClient, duplicateDocToClient,
    getLinkedTaskIds, getLinkedDocIdsForTask, linkDocumentTask, unlinkDocumentTask,
  };
}

// ─── ייפוי כוח: רק הגרסה העדכנית מוצגת ────────────────────────────────
// בזרימת הייצוג נשמרים שני קבצים: 'poa-pdf-<reqId>' (הטופס שהועלה לחתימה)
// ו-'signed-poa-<reqId>' (אותו טופס אחרי כל החתימות והחותמת). הלא-חתום נשאר
// באחסון כי "חתום מחדש" צורב את החתימות דווקא עליו — אבל ברשימת המסמכים אין
// טעם בשניהם, ולכן ברגע שיש חתום, הלא-חתום מוסתר.
export function withoutSupersededPoa(docs: StoredDoc[]): StoredDoc[] {
  const signedRequestIds = new Set(
    docs.filter(d => d.id.startsWith('signed-poa-')).map(d => d.id.slice('signed-poa-'.length))
  );
  if (signedRequestIds.size === 0) return docs;
  return docs.filter(d =>
    !(d.id.startsWith('poa-pdf-') && signedRequestIds.has(d.id.slice('poa-pdf-'.length)))
  );
}

// ─── עזר לסניף "האם המסמך הזה הוא דמה (אין לו קובץ אמיתי)?" ───────────
// קודם השתמשנו ב-fileData.byteLength === 0. זה לא עובד יותר כי מטא-נתונים
// מוחזרים בלי בייטים. עכשיו: דמה = id מתחיל ב-'fake-' (סמפלים) או _remote=false.
export function isPlaceholderDoc(d: StoredDoc): boolean {
  if (d._remote) return false;
  if (d.id.startsWith('fake-')) return true;
  return d.fileData.byteLength === 0; // fallback לקוד ישן שעדיין לא עבר
}

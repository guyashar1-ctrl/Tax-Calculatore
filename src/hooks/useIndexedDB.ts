import { useEffect, useRef } from 'react';

const DB_NAME = 'crm_documents_db';
const DB_VERSION = 1;
const STORE = 'documents';

export interface StoredDoc {
  id: string;
  clientId: string;
  fileName: string;
  fileType: string;    // MIME type
  fileSize: number;
  category: DocCategory;
  year: number | 'general';
  uploadedAt: string;
  description: string;
  notes: string;
  fileData: ArrayBuffer;
}

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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('clientId', 'clientId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function useDocumentDB() {
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    openDB().then(db => { dbRef.current = db; });
    return () => { dbRef.current?.close(); };
  }, []);

  async function saveDoc(doc: StoredDoc): Promise<void> {
    const db = dbRef.current ?? await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getDocsByClient(clientId: string): Promise<StoredDoc[]> {
    const db = dbRef.current ?? await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('clientId');
      const req = index.getAll(clientId);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteDoc(id: string): Promise<void> {
    const db = dbRef.current ?? await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getDoc(id: string): Promise<StoredDoc | undefined> {
    const db = dbRef.current ?? await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return { saveDoc, getDocsByClient, deleteDoc, getDoc };
}

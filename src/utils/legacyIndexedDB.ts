// ─── קריאה מה-IndexedDB הישן (לצורכי הגירה לענן בלבד) ───────────────────
// נכון להיום, הקבצים החדשים נשמרים ב-Supabase Storage (ראה useDocumentStore).
// הקובץ הזה משמש רק להגירה חד-פעמית של קבצים שכבר נשמרו אצל המשתמש בדפדפן
// המקומי לפני המעבר.

import type { StoredDoc } from '../hooks/useDocumentStore';

const DB_NAME = 'crm_documents_db';
const DB_VERSION = 1;
const STORE = 'documents';

function openLegacyDB(): Promise<IDBDatabase> {
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

/** קריאה של כל הקבצים שיש ב-IndexedDB הישן. כולל בייטים. */
export async function listAllLegacyDocs(): Promise<StoredDoc[]> {
  let db: IDBDatabase;
  try { db = await openLegacyDB(); } catch { return []; }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as any[] ?? []) as StoredDoc[]);
    req.onerror = () => resolve([]);
    tx.oncomplete = () => db.close();
  });
}

/** מחיקת קובץ מה-IndexedDB הישן (אחרי שהועלה לענן). */
export async function deleteLegacyDoc(id: string): Promise<void> {
  let db: IDBDatabase;
  try { db = await openLegacyDB(); } catch { return; }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

/** מחיקה גורפת של ה-IndexedDB הישן (אחרי שכל הקבצים הוגרו). */
export async function deleteLegacyDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

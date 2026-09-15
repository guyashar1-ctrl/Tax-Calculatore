// ─── קריאה מה-IndexedDB הישן (לצורכי הגירה לענן בלבד) ───────────────────
// נכון להיום, הקבצים החדשים נשמרים ב-Supabase Storage (ראה useDocumentStore).
// הקובץ הזה משמש רק להגירה חד-פעמית של קבצים שכבר נשמרו אצל המשתמש בדפדפן
// המקומי לפני המעבר.

import type { StoredDoc } from '../hooks/useDocumentStore';

const DB_NAME = 'crm_documents_db';
const DB_VERSION = 1;
const STORE = 'documents';

/**
 * ‼ פותח את ה-DB הישן **בלי ליצור אותו**. הגרסה הקודמת רשמה onupgradeneeded
 * שיצר את ה-store — ולכן כל משתמש שמעולם לא היו לו קבצים מקומיים קיבל DB ריק
 * בדפדפן, רק כי הבאנר בדק אם יש מה להגר. אם הדפדפן מודיע על שדרוג (DB חדש
 * או ישן יותר) — מבטלים את הפתיחה; אין שם כלום להגר.
 * ‼ ההפעלה חוזרת בכל טעינה, ולכן גם פותחים רק אחרי שבדקנו שה-DB קיים
 * (indexedDB.databases, היכן שנתמך).
 */
async function openLegacyDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  if (typeof indexedDB.databases === 'function') {
    try {
      const list = await indexedDB.databases();
      if (!list.some(d => d.name === DB_NAME)) return null;
    } catch { /* לא נתמך — ממשיכים לפתיחה השמרנית */ }
  }
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      // DB שלא היה קיים (או בגרסה ישנה) — לא יוצרים כלום ולא משאירים שריד.
      req.transaction?.abort();
      resolve(null);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve(null); return; }
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/**
 * כמה קבצים יש ב-IndexedDB הישן — בלי לטעון את הבייטים שלהם.
 * ‼ הבאנר צריך רק לדעת אם יש מה להגר; getAll() משך את כל הקבצים לזיכרון
 * בכל טעינה של האפליקציה רק כדי לבדוק אורך של מערך.
 */
export async function countLegacyDocs(): Promise<number> {
  const db = await openLegacyDB();
  if (!db) return 0;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror = () => resolve(0);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

/** קריאה של כל הקבצים שיש ב-IndexedDB הישן. כולל בייטים — רק בהגירה עצמה. */
export async function listAllLegacyDocs(): Promise<StoredDoc[]> {
  const db = await openLegacyDB();
  if (!db) return [];
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
  const db = await openLegacyDB();
  if (!db) return;
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

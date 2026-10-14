// ─── שמירת חלקים שעוד לא נשלחו — במכשיר עצמו (13.10.2026) ──────────────────────────
// ‼ צילמתם צד אחד ויצאתם — כשחוזרים מאותו מכשיר, הוא עדיין שם. החלקים לא עולים לשרת לפני האישור
//   (מסמך חלקי אינו מסמך), ולכן נשמרים ב-IndexedDB של הדפדפן, לפי הבקשה והשאלה. אחרי שליחה מוצלחת —
//   נמחקים. ‼ לא עובר בין מכשירים, ובגלישה פרטית עלול לא להישמר — אז פשוט מתחילים מחדש (לא שגיאה).

const DB = 'pivo-doc-parts';
const STORE = 'parts';

function open(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

export interface StoredParts { mode: 'parts' | 'single'; files: { id: string; slot: string; rotation?: number; file: File }[]; savedAt: string }

export async function loadParts(key: string): Promise<StoredParts | null> {
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const g = tx.objectStore(STORE).get(key);
      g.onsuccess = () => resolve((g.result as StoredParts | undefined) ?? null);
      g.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function saveParts(key: string, v: StoredParts): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

export async function clearParts(key: string): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

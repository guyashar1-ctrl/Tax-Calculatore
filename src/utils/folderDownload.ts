// ─── הורדת מסמכים ותיקיות — לתיקייה במחשב, או ל-ZIP ─────────────────────────
// ‼ 19.10.2026 · גיא: «לסמן מסמכים אצל לקוח ולהוריד אותם פשוט לתיקייה במחשב».
//   תיקייה שנבחרה יורדת עם כל מה שבתוכה, כתת-תיקייה באותו שם. בכרום (מחשב) הקבצים
//   נכתבים ישר לתיקייה שבוחרים (showDirectoryPicker); בדפדפן בלי התמיכה — ZIP אחד.
//   קובץ קיים בתיקייה לעולם לא נדרס: הקובץ החדש מקבל « (2)».

import { sanitizeFileBaseName, uniqueEntryName } from './zipArchive';

export interface PlanFolder { id: string; parentId: string | null; name: string }
export interface PlanDoc { id: string; folderId?: string | null; fileName: string; description?: string; uploadedAt: string }

export interface PlannedFile {
  docId: string;
  /** תיקיות בדרך, מהשורש של מה שנבחר — כבר בשמות בטוחים ומיוחדים. */
  dir: string[];
  name: string;
  /** לרשימת מה שחסר — השם שהמשרד מכיר. */
  label: string;
  date: Date;
}

export interface DownloadPlan {
  files: PlannedFile[];
  /** כל התיקיות שייווצרו, גם ריקות — כדי שהמבנה במחשב יהיה כמו כאן. */
  dirs: string[][];
}

const dirKey = (dir: string[]) => dir.join('/').toLowerCase();

/**
 * מה יורד. תיקייה שנבחרה ⇒ כל מה שמתחתיה; תיקייה/מסמך שכבר נכללים בתיקייה
 * נבחרת אחרת (בחירה מתוך חיפוש) — פעם אחת בלבד, במקום שלהם בתוך התיקייה.
 */
export function planDownload(
  selectedFolders: PlanFolder[], selectedDocs: PlanDoc[], allFolders: PlanFolder[], allDocs: PlanDoc[],
): DownloadPlan {
  const byId = new Map(allFolders.map(f => [f.id, f]));
  const selectedFolderIds = new Set(selectedFolders.map(f => f.id));
  const insideSelected = (folderId: string | null | undefined) => {
    for (let id = folderId ?? null, guard = 0; id && guard < 100; id = byId.get(id)?.parentId ?? null, guard++) {
      if (selectedFolderIds.has(id)) return true;
    }
    return false;
  };

  const takenIn = new Map<string, Set<string>>();
  const unique = (dir: string[], name: string) => {
    const k = dirKey(dir);
    if (!takenIn.has(k)) takenIn.set(k, new Set());
    return uniqueEntryName(name, takenIn.get(k)!);
  };
  const files: PlannedFile[] = [];
  const dirs: string[][] = [];
  const seenDocs = new Set<string>();
  const addDoc = (d: PlanDoc, dir: string[]) => {
    if (seenDocs.has(d.id)) return;
    seenDocs.add(d.id);
    const stamp = new Date(d.uploadedAt);
    files.push({
      docId: d.id, dir, name: unique(dir, d.fileName || d.description || 'מסמך'),
      label: d.description || d.fileName || 'מסמך', date: isNaN(stamp.getTime()) ? new Date() : stamp,
    });
  };
  const walk = (folder: PlanFolder, parentDir: string[], depth: number) => {
    if (depth > 50) return;
    const dir = [...parentDir, unique(parentDir, sanitizeFileBaseName(folder.name) || 'תיקייה')];
    dirs.push(dir);
    for (const d of allDocs) if ((d.folderId ?? null) === folder.id) addDoc(d, dir);
    for (const f of allFolders) if ((f.parentId ?? null) === folder.id) walk(f, dir, depth + 1);
  };

  for (const f of selectedFolders) if (!insideSelected(f.parentId)) walk(f, [], 0);
  for (const d of selectedDocs) if (!insideSelected(d.folderId)) addDoc(d, []);
  return { files, dirs };
}

/** הנתיב בתוך ה-ZIP. */
export const zipPath = (f: PlannedFile) => [...f.dir, f.name].join('/');

// ── שמירה ישירה לתיקייה במחשב ─────────────────────────────────────────────

type DirHandle = {
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: BufferSource | Blob): Promise<void>; close(): Promise<void> }>;
  }>;
};
/** התיקייה שנבחרה במחשב (null = הורדה כ-ZIP, או שבוטלה הבחירה). */
export type PickedFolder = DirHandle | null;

/** הודעה לשגיאה בשמירה — בלי קודים באנגלית. */
export function downloadErrorText(e: unknown): string {
  if (e instanceof Error && e.message === 'ZIP_TOO_LARGE') return 'החבילה גדולה מדי (מעל 4GB). בחר פחות מסמכים.';
  if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
    return 'הדפדפן לא קיבל הרשאה לשמור בתיקייה הזו. אפשר לבחור תיקייה אחרת, או להוריד כ-ZIP.';
  }
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return 'אין מספיק מקום פנוי בדיסק.';
  return 'השמירה נכשלה. אפשר לנסות שוב, או להוריד כ-ZIP.';
}

type PickerWindow = Window & { showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirHandle> };

/** כרום/אדג׳ במחשב. בטלפון, בספארי ובפיירפוקס — אין, ונשארים עם ZIP. */
export function canSaveToFolder(): boolean {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (typeof (window as PickerWindow).showDirectoryPicker !== 'function') return false;
  try { return window.self === window.top; } catch { return false; }
}

/**
 * חלון בחירת התיקייה. ‼ חייב לרוץ ישר מהלחיצה (לפני הורדת הקבצים) — אחרת
 * הדפדפן חוסם אותו. ביטול ⇒ null.
 */
export async function pickFolder(): Promise<DirHandle | null> {
  try {
    return await (window as PickerWindow).showDirectoryPicker!({ mode: 'readwrite', id: 'pivo-docs' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

async function exists(dir: DirHandle, name: string): Promise<boolean> {
  try { await dir.getFileHandle(name); return true; } catch { return false; }
}

/** שם פנוי בתיקייה במחשב — « (2)» לפני הסיומת, כמו הורדה חוזרת בדפדפן. */
async function freeName(dir: DirHandle, name: string): Promise<string> {
  if (!(await exists(dir, name))) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!(await exists(dir, candidate))) return candidate;
  }
}

/** כותב את הקבצים (שהבייטים שלהם כבר הורדו) לתיקייה שנבחרה. מחזיר כמה נכתבו. */
export async function writePlanToFolder(
  root: DirHandle, plan: DownloadPlan, bytes: Map<string, ArrayBuffer>, onFile?: () => void,
): Promise<number> {
  const handles = new Map<string, DirHandle>([['', root]]);
  const dirOf = async (dir: string[]): Promise<DirHandle> => {
    let cur = root;
    for (let i = 0; i < dir.length; i++) {
      const k = dirKey(dir.slice(0, i + 1));
      let h = handles.get(k);
      if (!h) { h = await cur.getDirectoryHandle(dir[i], { create: true }); handles.set(k, h); }
      cur = h;
    }
    return cur;
  };
  for (const d of plan.dirs) await dirOf(d);
  let written = 0;
  for (const f of plan.files) {
    const data = bytes.get(f.docId);
    if (!data) continue;
    const dir = await dirOf(f.dir);
    const fh = await dir.getFileHandle(await freeName(dir, f.name), { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
    written++;
    onFile?.();
  }
  return written;
}

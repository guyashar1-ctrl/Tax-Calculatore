// ─── מסמכים — מערכת קבצים רגילה + שכבת מטא-דאטה מקצועית דקה (M3) ───────────
// מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
// (מקטע #v-docs). סרגל כלים רגוע: חיפוש | תווית | שנה | הוסף▾. כל פריט —
// שנה + תווית מקצועית אחת. 'לבדיקה' היא תווית שמורה ל-legacy שטרם סווג;
// לעולם לא יורשת לילד חדש (הכרעה סגורה — ראה docs/PLAN... / הבקשה).
//
// ‼ cw-tabpanel ולא cw-tab (וכנ"ל בעטיפה החיצונית ב-DocumentsTab.tsx):
// cw-tab היא גם מחלקת כפתור הטאב (display:flex שורה) — כלים/נתיב/רשימה
// נדחסו לשורה אופקית אחת וכל מקטע כווץ למינימום, בדיוק "התוכן דחוס בשטח
// צר" + "הרבה שטח ריק" שדווחו. tabpanel = flex column+gap, כמו כל טאב אחר.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Client } from '../../types';
import { useDocumentStore, type StoredDoc, type DocFolder, type DocumentLabel } from '../../hooks/useDocumentStore';
import { AVAILABLE_YEARS } from '../../data/taxData';
import { supabase } from '../../lib/supabase';
import { EmptyState } from '../ui/States';
import LabelSelect from '../ui/LabelSelect';
import { buildZip, sanitizeFileBaseName, uniqueEntryName, triggerBlobDownload } from '../../utils/zipArchive';
import { looksConvertible, imageToPdfBytes, pdfFileNameFor, ImageConversionError } from '../../utils/imageToPdf';
import { useToast } from '../ui/Toast';

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.csv';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
/** שנת מסמך כפי שהיא מוצגת ומסוננת — 'general' במסד הוא 'כללי' על המסך. */
function docYearLabel(year: number | 'general'): string {
  return year === 'general' ? 'כללי' : String(year);
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Props {
  client: Client;
  allClients: Client[];
}

interface MetaDraft { year: string; labelId: string }

export default function DocumentsWorkspace({ client, allClients }: Props) {
  const db = useDocumentStore();
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [labels, setLabels] = useState<DocumentLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterYear, setFilterYear] = useState('');

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [uploadModal, setUploadModal] = useState<{ files: File[]; meta: MetaDraft } | null>(null);
  const [folderModal, setFolderModal] = useState<{ name: string; meta: MetaDraft } | null>(null);
  const [folderUploadModal, setFolderUploadModal] = useState<{ files: File[]; meta: MetaDraft } | null>(null);
  const [requestModal, setRequestModal] = useState<{ title: string; year: string; labelId: string } | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelError, setLabelError] = useState('');

  const [drawerDoc, setDrawerDoc] = useState<StoredDoc | null>(null);
  const [drawerLinkedClients, setDrawerLinkedClients] = useState<string[]>([]);
  const [drawerLinkedTasks, setDrawerLinkedTasks] = useState<{ id: string; title: string }[]>([]);
  const [addClientPick, setAddClientPick] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  // ‼ העברה ושכפול ירדו מהמגירה ועברו לסרגל הבחירה: הן פועלות על
  // מסמך אחד או על עשרה באותה מחווה, ולכן מקומן ליד "הורדה" ולא בתוך
  // כרטיס של מסמך בודד. השאריות כאן משרתות רק את המחיקה מהמגירה.
  const [docActionBusy, setDocActionBusy] = useState(false);
  const [docActionError, setDocActionError] = useState('');
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState(false);
  const [folderEdit, setFolderEdit] = useState<DocFolder | null>(null);
  const [folderEditName, setFolderEditName] = useState('');
  const [folderEditMeta, setFolderEditMeta] = useState<MetaDraft>({ year: '', labelId: '' });
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<DocFolder | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState('');

  // ─── בחירה מרובה והורדה כחבילה ─────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [zipModal, setZipModal] = useState<{ name: string } | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [zipError, setZipError] = useState<{ message: string; failed: string[] } | null>(null);

  // ─── המרת תצלום ל-PDF ─────────────────────────────────────────────────
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState('');
  /**
   * ‼ אותו לקח כמו נעילת האריזה: state לא מתעדכן בין שתי לחיצות באותו
   * tick, ולחיצה כפולה הייתה יוצרת שני מסמכי PDF זהים שאיש לא ביקש.
   */
  const convertRunningRef = useRef(false);

  // ─── פעולות על הבחירה: יעד להעברה/העתקה, מחיקה, גרירה ───────────────
  const [destModal, setDestModal] = useState<{ mode: 'move' | 'copy'; clientId: string; folderId: string } | null>(null);
  const [destFolders, setDestFolders] = useState<DocFolder[]>([]);
  const [destFoldersLoading, setDestFoldersLoading] = useState(false);
  const [destBusy, setDestBusy] = useState(false);
  const [destError, setDestError] = useState('');
  const destRunningRef = useRef(false);

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState('');
  const bulkDeleteRunningRef = useRef(false);

  /** המסמכים שנגררים כרגע. ריק = אין גרירה פעילה. */
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);

  const { showToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentFolderId(null);
    setSelectedIds(new Set());
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  useEffect(() => {
    function handleChange(e: Event) {
      const ce = e as CustomEvent<{ clientId?: string }>;
      if (!ce.detail?.clientId || ce.detail.clientId === client.id) void loadAll();
    }
    window.addEventListener('crm:docs-changed', handleChange);
    return () => window.removeEventListener('crm:docs-changed', handleChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function loadAll() {
    setLoading(true);
    const [d, f, l] = await Promise.all([
      db.getDocsByClientIncludingLinked(client.id),
      db.getFoldersByClient(client.id),
      db.getLabels(),
    ]);
    setDocs(d);
    setFolders(f);
    setLabels(l);
    setLoading(false);
  }

  /** תווית שנוצרה במקום נכנסת לרשימה באותו סדר שבו getLabels מחזיר (שמורה בסוף). */
  function mergeLabel(label: DocumentLabel) {
    setLabels(prev => prev.some(l => l.id === label.id)
      ? prev
      : [...prev, label].sort((a, b) =>
          Number(a.isReserved) - Number(b.isReserved) ||
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, 'he')));
  }

  const reservedLabel = useMemo(() => labels.find(l => l.isReserved), [labels]);
  const foldersById = useMemo(() => {
    const m = new Map<string, DocFolder>();
    folders.forEach(f => m.set(f.id, f));
    return m;
  }, [folders]);
  const labelsById = useMemo(() => {
    const m = new Map<string, DocumentLabel>();
    labels.forEach(l => m.set(l.id, l));
    return m;
  }, [labels]);

  const breadcrumb = useMemo(() => {
    const path: DocFolder[] = [];
    let id = currentFolderId;
    const guard = new Set<string>();
    while (id && !guard.has(id)) {
      guard.add(id);
      const f = foldersById.get(id);
      if (!f) break;
      path.unshift(f);
      id = f.parentId;
    }
    return path;
  }, [currentFolderId, foldersById]);

  /** האב לצורך ירושת מטא-דאטה: תיקיית האב הנוכחית, או null בשורש. */
  const parentFolder = breadcrumb.length ? breadcrumb[breadcrumb.length - 1] : null;

  /** ברירת מחדל לפריט חדש: יורש מהאב — חוץ מ'לבדיקה', שלעולם לא יורשת. */
  function defaultMetaForNewItem(): MetaDraft {
    if (!parentFolder) return { year: '', labelId: '' };
    const inheritLabel = parentFolder.labelId && parentFolder.labelId !== reservedLabel?.id ? parentFolder.labelId : '';
    return { year: parentFolder.year || '', labelId: inheritLabel };
  }

  const q = search.trim().toLowerCase();
  const rows: { kind: 'folder' | 'file'; folder?: DocFolder; doc?: StoredDoc; path?: string }[] = useMemo(() => {
    if (q) {
      const fileRows = docs
        .filter(d => {
          const label = d.labelId ? labelsById.get(d.labelId)?.name ?? '' : '';
          const hay = `${d.fileName} ${d.description} ${label} ${d.year}`.toLowerCase();
          return hay.includes(q);
        })
        .map(d => ({ kind: 'file' as const, doc: d, path: folderPathLabel(d.folderId ?? null, foldersById) }));
      const folderRows = folders
        .filter(f => f.name.toLowerCase().includes(q))
        .map(f => ({ kind: 'folder' as const, folder: f, path: folderPathLabel(f.parentId, foldersById) }));
      return [...folderRows, ...fileRows];
    }
    const hereFolders = folders.filter(f => (f.parentId ?? null) === currentFolderId);
    const hereDocs = docs.filter(d => (d.folderId ?? null) === currentFolderId);
    return [
      ...hereFolders.map(f => ({ kind: 'folder' as const, folder: f })),
      ...hereDocs.map(d => ({ kind: 'file' as const, doc: d })),
    ];
  }, [q, docs, folders, currentFolderId, foldersById, labelsById]);

  const filteredRows = rows.filter(r => {
    if (r.kind === 'folder') {
      if (filterLabel && r.folder!.labelId !== filterLabel) return false;
      if (filterYear && (r.folder!.year || '') !== filterYear) return false;
      return true;
    }
    if (filterLabel && r.doc!.labelId !== filterLabel) return false;
    // ‼ מסמך נשמר עם year='general' ותיקייה עם 'כללי'. בלי הנרמול הזה בחירת
    // "כללי" בסרגל הייתה מסתירה בדיוק את המסמכים הכלליים שביקשו לראות.
    if (filterYear && docYearLabel(r.doc!.year) !== filterYear) return false;
    return true;
  });

  function goRoot() { clearSelection(); setSearch(''); setCurrentFolderId(null); }
  function goInto(id: string) { clearSelection(); setSearch(''); setCurrentFolderId(id); }
  function goCrumb(index: number) { clearSelection(); setSearch(''); setCurrentFolderId(breadcrumb[index]?.id ?? null); }

  // ─── בחירה מרובה ────────────────────────────────────────────────────────
  // ‼ הבחירה שייכת לתצוגה הנוכחית בלבד. מסמך שסומן ואז יצא מהתצוגה (ניווט,
  // חיפוש, סינון) לא ייארז — אחרת הייתה יורדת חבילה עם קבצים שאינם על המסך
  // ואיש אינו זוכר שסימן. לכן גם ניקוי מפורש בכל שינוי תצוגה, וגם חיתוך
  // בטיחות מול מה שמוצג ברגע ההורדה.
  const visibleDocs = useMemo(
    () => filteredRows.filter(r => r.kind === 'file').map(r => r.doc!),
    [filteredRows],
  );
  const selectedDocs = useMemo(
    () => visibleDocs.filter(d => selectedIds.has(d.id)),
    [visibleDocs, selectedIds],
  );
  const allVisibleSelected = visibleDocs.length > 0 && selectedDocs.length === visibleDocs.length;
  const someVisibleSelected = selectedDocs.length > 0 && !allVisibleSelected;

  function clearSelection() { setSelectedIds(new Set()); }

  function toggleDoc(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleDocs.map(d => d.id)));
  }

  // ─── הורדה מרוכזת כחבילה אחת ───────────────────────────────────────────
  /** מה שכן נאסף כשחלק מהקבצים נכשלו — מיועד להורדה חלקית מפורשת בלבד. */
  const partialRef = useRef<{ entries: { name: string; data: ArrayBuffer; date: Date }[]; base: string } | null>(null);
  /**
   * ‼ נעילת האריזה יושבת ב-ref ולא ב-state בכוונה. שתי לחיצות באותו tick
   * (הקשה כפולה, או Enter פעמיים ברצף) רצות שתיהן לפני שהרינדור הבא מסמן
   * את הכפתור כמושבת — ואז zipBusy עדיין false בשתיהן, ויורדות שתי חבילות
   * זהות. ref מתעדכן מיד ולכן חוסם את השנייה. אומת בדפדפן: לפני התיקון
   * ירדו שני קבצים, אחרי — אחד.
   */
  const zipRunningRef = useRef(false);

  function openZipModal() {
    if (selectedDocs.length === 0) return;
    partialRef.current = null;
    setZipError(null);
    setZipProgress(0);
    setZipModal({ name: `${client.firstName} ${client.lastName}`.trim() });
  }
  function closeZipModal() {
    if (zipBusy) return;
    partialRef.current = null;
    setZipModal(null);
    setZipError(null);
  }

  /** ‼ מי שמקליד 'דוח 2025.zip' מתכוון לשם, לא ל'דוח 2025.zip.zip'. */
  function zipBaseOf(raw: string): string {
    return sanitizeFileBaseName(raw).replace(/\.zip$/i, '').trim();
  }
  /**
   * ‼ שם הקובץ לתצוגה בתוך משפט עברי. בלי הסימן U+200E שביניהם, '2025.zip'
   * מתפרק לשלושה קטעי כיווניות (מספר · נקודה · לטינית) ומוצג «...דוח zip.2025»
   * — כלומר המסך מבטיח שם קובץ אחר ממה שיירד. הסימן מאחד את הסיומת לקטע
   * לטיני אחד. אומת בדפדפן על חמישה סוגי שמות (עברי, לטיני, מסתיים בספרה).
   */
  function zipDisplayName(base: string): string {
    return `${base}\u200E.zip`;
  }
  const zipBaseName = zipModal ? zipBaseOf(zipModal.name) : '';

  async function runZipDownload() {
    if (zipRunningRef.current || !zipModal || selectedDocs.length === 0) return;
    const base = zipBaseOf(zipModal.name);
    if (!base) return;

    const targets = selectedDocs;
    zipRunningRef.current = true;
    setZipBusy(true);
    setZipError(null);
    setZipProgress(0);
    partialRef.current = null;
    try {
      const taken = new Set<string>();
      const entries: { name: string; data: ArrayBuffer; date: Date }[] = [];
      const failed: string[] = [];
      for (const d of targets) {
        // אותו מסלול הרשאות בדיוק כמו 'פתח את הקובץ': getDoc מסנן לפי המשתמש
        // ו-RLS מסנן שוב בצד השרת. אין כאן ערוץ גישה חדש לקבצים.
        const full = await db.getDoc(d.id).catch(() => undefined);
        if (!full || full.fileData.byteLength === 0) {
          failed.push(d.description || d.fileName);
        } else {
          const stamp = new Date(d.uploadedAt);
          entries.push({
            name: uniqueEntryName(d.fileName || d.description || 'מסמך', taken),
            data: full.fileData,
            date: isNaN(stamp.getTime()) ? new Date() : stamp,
          });
        }
        setZipProgress(n => n + 1);
      }

      // ‼ לא אורזים בשקט חבילה חסרה: מה שיורד כאן מוגש לרשות, ומסמך שנעדר
      // בלי שנאמר עליו דבר מתגלה רק שם. עוצרים, מפרטים מה נכשל, ורק בלחיצה
      // נוספת ומפורשת מוסרים את מה שכן נאסף.
      if (failed.length > 0) {
        partialRef.current = entries.length > 0 ? { entries, base } : null;
        setZipError({
          message: failed.length === targets.length
            ? 'אף אחד מהמסמכים שנבחרו לא נמצא באחסון. לא נוצרה חבילה.'
            : `${failed.length} מתוך ${targets.length} מסמכים לא נמצאו באחסון, ולכן החבילה לא נוצרה.`,
          failed,
        });
        return;
      }

      triggerBlobDownload(buildZip(entries), `${base}.zip`);
      setZipModal(null);
      clearSelection();
    } catch (e) {
      const msg = e instanceof Error && e.message === 'ZIP_TOO_LARGE'
        ? 'החבילה גדולה מדי (מעל 4GB). בחר פחות מסמכים.'
        : e instanceof Error ? e.message : 'יצירת החבילה נכשלה.';
      setZipError({ message: msg, failed: [] });
    } finally {
      zipRunningRef.current = false;
      setZipBusy(false);
    }
  }

  /** הורדה חלקית — רק אחרי שראו במפורש מה חסר ובחרו בכל זאת. */
  function downloadPartial() {
    const pending = partialRef.current;
    if (!pending || zipRunningRef.current) return;
    // ‼ מתאפס מיד: אותה לחיצה כפולה שנחסמה למעלה חייבת להיחסם גם כאן.
    partialRef.current = null;
    try {
      triggerBlobDownload(buildZip(pending.entries), `${pending.base}.zip`);
      setZipModal(null);
      setZipError(null);
      clearSelection();
    } catch (e) {
      setZipError({ message: e instanceof Error ? e.message : 'יצירת החבילה נכשלה.', failed: [] });
    }
  }

  // ─── העלאת קובץ ────────────────────────────────────────────────────────
  function openUploadFile() {
    setAddMenuOpen(false);
    fileInputRef.current?.click();
  }
  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadModal({ files, meta: defaultMetaForNewItem() });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
  async function confirmUpload() {
    if (!uploadModal) return;
    if (!uploadModal.meta.year || !uploadModal.meta.labelId) return;
    for (const file of uploadModal.files) {
      const buf = await file.arrayBuffer();
      const doc: StoredDoc = {
        id: crypto.randomUUID(),
        clientId: client.id,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        category: 'other',
        year: uploadModal.meta.year === 'כללי' ? 'general' : (Number(uploadModal.meta.year) || 'general'),
        uploadedAt: new Date().toISOString(),
        description: file.name.replace(/\.[^./\\]+$/, ''),
        notes: '',
        fileData: buf,
        folderId: currentFolderId,
        labelId: uploadModal.meta.labelId,
      };
      await db.saveDoc(doc);
    }
    setUploadModal(null);
    void loadAll();
  }

  // ─── יצירת תיקייה ──────────────────────────────────────────────────────
  function openCreateFolder() {
    setAddMenuOpen(false);
    setFolderModal({ name: '', meta: defaultMetaForNewItem() });
  }
  async function confirmCreateFolder() {
    if (!folderModal) return;
    const name = folderModal.name.trim();
    if (!name || !folderModal.meta.year || !folderModal.meta.labelId) return;
    await db.createFolder(client.id, name, currentFolderId, {
      labelId: folderModal.meta.labelId,
      year: folderModal.meta.year,
    });
    setFolderModal(null);
    void loadAll();
  }

  // ─── העלאת תיקייה מהמחשב ───────────────────────────────────────────────
  function openUploadFolder() {
    setAddMenuOpen(false);
    folderInputRef.current?.click();
  }
  function handleFolderPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []).filter(f => !f.name.startsWith('.') && f.name !== 'Thumbs.db');
    if (picked.length === 0) return;
    setFolderUploadModal({ files: picked, meta: defaultMetaForNewItem() });
    if (folderInputRef.current) folderInputRef.current.value = '';
  }
  async function confirmFolderUpload() {
    if (!folderUploadModal) return;
    if (!folderUploadModal.meta.year || !folderUploadModal.meta.labelId) return;
    const { meta, files } = folderUploadModal;
    const pathToId = new Map<string, string>();
    async function ensurePath(segments: string[]): Promise<string | null> {
      let parent = currentFolderId;
      let key = '';
      for (const seg of segments) {
        key = key ? `${key}/${seg}` : seg;
        const known = pathToId.get(key);
        if (known) { parent = known; continue; }
        const folder = await db.createFolder(client.id, seg, parent, { labelId: meta.labelId, year: meta.year });
        pathToId.set(key, folder.id);
        parent = folder.id;
      }
      return parent;
    }
    for (const file of files) {
      const relPath = ((file as any).webkitRelativePath as string) || file.name;
      const segments = relPath.split('/').filter(Boolean);
      const dirSegments = segments.slice(0, -1);
      const folderId = await ensurePath(dirSegments);
      const buf = await file.arrayBuffer();
      const doc: StoredDoc = {
        id: crypto.randomUUID(),
        clientId: client.id,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        category: 'other',
        year: meta.year === 'כללי' ? 'general' : (Number(meta.year) || 'general'),
        uploadedAt: new Date().toISOString(),
        description: file.name.replace(/\.[^./\\]+$/, ''),
        notes: '',
        fileData: buf,
        folderId,
        labelId: meta.labelId,
      };
      await db.saveDoc(doc);
    }
    setFolderUploadModal(null);
    void loadAll();
  }

  // ─── בקש מסמך מהלקוח — קיצור דרך למערכת הבקשות הקיימת ───────────────────
  function openRequest() {
    setAddMenuOpen(false);
    // ‼ בלי תווית מראש: 'לבדיקה' אינה אפשרות כאן, וברירת מחדל שאינה ברשימה
    // הייתה מציגה בורר ריק לכאורה עם ערך נסתר מאחוריו.
    setRequestModal({ title: 'מסמך נדרש', year: String(new Date().getFullYear()), labelId: '' });
  }
  async function confirmRequest() {
    if (!requestModal || !requestModal.title.trim() || !requestModal.year || !requestModal.labelId) return;
    setRequestBusy(true);
    setRequestError('');
    try {
      const { data, error } = await supabase.rpc('create_onboarding_request', {
        p_client_id: client.id,
        p_step_type: 'custom_request',
        p_payload: {
          title: requestModal.title.trim(),
          clientTitle: requestModal.title.trim(),
          documentYear: requestModal.year,
          documentLabelId: requestModal.labelId,
          requirements: [{ key: 'doc', kind: 'file', label: requestModal.title.trim(), done: false }],
        },
        p_due_date: null,
        p_depends_on: null,
        p_published: false,
        p_required_for_close: false,
        p_owner: 'client',
        p_stage_id: null,
      });
      // ‼ ה-RPC מחזיר {ok:false,error} בלי לזרוק. בלי הבדיקה הזו המודל היה
      // נסגר כאילו הבקשה נוצרה, והרו"ח היה ממתין לקובץ שאיש לא התבקש להעלות.
      const res = data as { ok?: boolean; error?: string } | null;
      if (error || !res?.ok) {
        setRequestError(error?.message ?? res?.error ?? 'יצירת הבקשה נכשלה.');
        return;
      }
      setRequestModal(null);
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : 'יצירת הבקשה נכשלה.');
    } finally {
      setRequestBusy(false);
    }
  }

  // ─── תוויות ────────────────────────────────────────────────────────────
  async function addLabel() {
    if (!newLabelName.trim()) return;
    setLabelBusy(true); setLabelError('');
    try {
      await db.createLabel(newLabelName.trim());
      setNewLabelName('');
      void loadAll();
    } catch (e) {
      setLabelError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setLabelBusy(false);
    }
  }
  /** שינוי שם — רק כשבאמת השתנה, כדי לא לכתוב על כל יציאה מהשדה. */
  async function renameLabelTo(label: DocumentLabel, name: string) {
    const clean = name.trim();
    if (!clean || clean === label.name) return;
    setLabelBusy(true); setLabelError('');
    try {
      await db.renameLabel(label.id, clean);
      setLabels(prev => prev.map(l => (l.id === label.id ? { ...l, name: clean } : l)));
    } catch (e) {
      setLabelError(e instanceof Error ? e.message : 'שינוי השם נכשל');
    } finally {
      setLabelBusy(false);
    }
  }

  async function removeLabel(id: string) {
    setLabelBusy(true); setLabelError('');
    const res = await db.deleteLabel(id);
    if (!res.ok) setLabelError(res.error === 'reserved_label' ? 'לא ניתן למחוק תווית שמורה' : 'המחיקה נכשלה');
    setLabelBusy(false);
    void loadAll();
  }

  // ─── מגירת פרטים ───────────────────────────────────────────────────────
  async function openDrawer(doc: StoredDoc) {
    setDrawerDoc(doc);
    const [clients, tasks] = await Promise.all([
      db.getLinkedClientIds(doc.id),
      db.getLinkedTaskIds(doc.id),
    ]);
    setDrawerLinkedClients(clients);
    if (tasks.length > 0) {
      const { data } = await supabase.from('tasks').select('id, title').in('id', tasks);
      setDrawerLinkedTasks((data ?? []).map((r: any) => ({ id: r.id, title: r.title })));
    } else {
      setDrawerLinkedTasks([]);
    }
    setAddClientPick('');
    setRenameDraft(doc.description || '');
    setDocActionError(''); setConfirmDeleteDoc(false);
    setFileBusy(false); setFileError(''); setConvertError('');
  }
  function closeDrawer() {
    setDrawerDoc(null); setDrawerLinkedClients([]); setDrawerLinkedTasks([]);
    setDocActionError(''); setConfirmDeleteDoc(false);
    setFileBusy(false); setFileError(''); setConvertError('');
  }

  async function saveDrawerMeta(patch: Partial<Pick<StoredDoc, 'labelId' | 'year' | 'description' | 'folderId'>>) {
    if (!drawerDoc) return;
    const updated = { ...drawerDoc, ...patch };
    await db.saveDoc(updated);
    setDrawerDoc(updated);
    void loadAll();
  }

  /** שינוי שם — נשמר רק כשבאמת השתנה, כדי לא לכתוב על כל יציאה מהשדה. */
  async function commitRename() {
    if (!drawerDoc) return;
    const next = renameDraft.trim();
    if (next === (drawerDoc.description || '')) return;
    await saveDrawerMeta({ description: next });
  }



  async function deleteDrawerDoc() {
    if (!drawerDoc) return;
    setDocActionBusy(true); setDocActionError('');
    try {
      await db.deleteDoc(drawerDoc.id);
      setConfirmDeleteDoc(false);
      closeDrawer();
      void loadAll();
    } catch (e) {
      setDocActionError(e instanceof Error ? e.message : 'המחיקה נכשלה');
    } finally {
      setDocActionBusy(false);
    }
  }

  // ─── תיקיות: עריכה ומחיקה ──────────────────────────────────────────────
  function openFolderEdit(f: DocFolder) {
    setFolderEdit(f);
    setFolderEditName(f.name);
    setFolderEditMeta({ year: f.year || '', labelId: f.labelId || '' });
    setFolderError('');
  }

  /** כל מה שיושב מתחת לתיקייה, לכל עומק — תת-תיקיות והקבצים שבהן. */
  function descendantsOf(folderId: string): { folderIds: string[]; docIds: string[] } {
    const folderIds: string[] = [];
    const queue = [folderId];
    while (queue.length) {
      const cur = queue.shift()!;
      folders.forEach(f => {
        if ((f.parentId ?? null) === cur) { folderIds.push(f.id); queue.push(f.id); }
      });
    }
    const under = new Set([folderId, ...folderIds]);
    const docIds = docs.filter(d => d.folderId && under.has(d.folderId)).map(d => d.id);
    return { folderIds, docIds };
  }

  /**
   * ‼ תווית/שנה של תיקייה חלות על כל מה שבתוכה, לכל עומק. עד כה הן היו
   * ברירת מחדל ברגע היצירה בלבד, ולכן סיווג מחדש של תיקייה שלמה חייב
   * נגיעה בכל קובץ בנפרד. הבקשה: התיקייה מסווגת את תוכנה.
   */
  async function commitFolderEdit() {
    if (!folderEdit) return;
    const name = folderEditName.trim();
    const { year, labelId } = folderEditMeta;
    if (!name || !year || !labelId) return;
    const labelChanged = labelId !== (folderEdit.labelId || '');
    const yearChanged = year !== (folderEdit.year || '');
    setFolderBusy(true); setFolderError('');
    try {
      await db.updateFolder(folderEdit.id, { name, labelId, year });
      if (labelChanged || yearChanged) {
        const { folderIds, docIds } = descendantsOf(folderEdit.id);
        const folderPatch: { labelId?: string; year?: string } = {};
        const docPatch: { labelId?: string; year?: string } = {};
        if (labelChanged) { folderPatch.labelId = labelId; docPatch.labelId = labelId; }
        // שנה נשמרת 'כללי' על תיקייה ו-'general' על מסמך — ראה docYearLabel
        if (yearChanged) { folderPatch.year = year; docPatch.year = year === 'כללי' ? 'general' : year; }
        await db.setFoldersMeta(folderIds, folderPatch);
        await db.setDocsMeta(docIds, docPatch);
      }
      setFolderEdit(null);
      void loadAll();
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : 'שמירת התיקייה נכשלה');
    } finally { setFolderBusy(false); }
  }

  async function runDeleteFolder() {
    if (!confirmDeleteFolder) return;
    setFolderBusy(true); setFolderError('');
    try {
      await db.deleteFolder(confirmDeleteFolder.id);
      if (currentFolderId === confirmDeleteFolder.id) setCurrentFolderId(confirmDeleteFolder.parentId ?? null);
      setConfirmDeleteFolder(null);
      void loadAll();
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : 'המחיקה נכשלה');
    } finally { setFolderBusy(false); }
  }

  async function addClientLink() {
    if (!drawerDoc || !addClientPick) return;
    await db.linkDocumentClient(drawerDoc.id, addClientPick);
    setDrawerLinkedClients(prev => [...prev, addClientPick]);
    setAddClientPick('');
  }
  async function removeClientLink(clientId: string) {
    if (!drawerDoc) return;
    await db.unlinkDocumentClient(drawerDoc.id, clientId);
    setDrawerLinkedClients(prev => prev.filter(id => id !== clientId));
  }

  /**
   * ‼ לחיצה על שורה פותחת את המגירה בלבד — היא מרכז הפעולות של המסמך.
   * קודם הלחיצה גם הורידה את הקובץ ופתחה אותו בלשונית חדשה, והלשונית
   * הזו קפצה מעל המגירה שנפתחה מאחוריה — כך שהפעולות (שם/תיקייה/העברה/
   * שכפול/מחיקה) היו קיימות אך בלתי נראות בפועל. הצפייה בקובץ עברה
   * לכפתור מפורש בתוך המגירה.
   */
  async function openFileInNewTab() {
    if (!drawerDoc) return;
    setFileBusy(true); setFileError('');
    // ‼ הלשונית נפתחת *לפני* ההורדה: window.open אחרי await כבר אינו
    // נחשב תגובה ישירה ללחיצה, וחוסמי הפופ-אפ חוסמים אותו.
    const w = window.open('', '_blank');
    try {
      const full = await db.getDoc(drawerDoc.id);
      if (!full || full.fileData.byteLength === 0) {
        w?.close();
        setFileError('הקובץ עצמו אינו זמין להורדה.');
        return;
      }
      const blob = new Blob([full.fileData], { type: drawerDoc.fileType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      else window.open(url, '_blank');   // אם נחסם — ניסיון ישיר
      // שחרור הזיכרון אחרי שללשונית הספיק לטעון
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      w?.close();
      setFileError(e instanceof Error ? e.message : 'פתיחת הקובץ נכשלה.');
    } finally {
      setFileBusy(false);
    }
  }

  /**
   * המרת תצלום ל-PDF. נוצר מסמך *חדש* דרך אותו saveDoc של כל העלאה —
   * אותו bucket, אותה טבלה, אותו user_id ואותו RLS. המקור אינו נקרא
   * לכתיבה, אינו נמחק ואינו משתנה: הוא נשאר ברשימה לצד ה-PDF.
   */
  async function convertDrawerDocToPdf() {
    if (convertRunningRef.current || !drawerDoc) return;
    const source = drawerDoc;
    convertRunningRef.current = true;
    setConvertBusy(true); setConvertError('');
    try {
      // ‼ הבייטים מגיעים מהאחסון דרך getDoc — אותו מסלול הרשאות של
      // 'פתח את הקובץ'. סוג הקובץ נקבע מהתוכן שחזר משם ולא מהסיומת.
      const full = await db.getDoc(source.id);
      if (!full || full.fileData.byteLength === 0) {
        setConvertError('הקובץ עצמו אינו זמין באחסון, ולכן אין מה להמיר.');
        return;
      }
      const pdfBytes = await imageToPdfBytes(new Uint8Array(full.fileData));

      // שם פנוי אצל הלקוח שאליו המסמך שייך — לא אצל הלקוח שממנו הסתכלנו
      const siblings = await db.getDocsByClient(source.clientId);
      const taken = new Set(siblings.map(d => (d.fileName || '').toLowerCase()));
      const fileName = uniqueEntryName(pdfFileNameFor(source.fileName), taken);

      const fileData = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(fileData).set(pdfBytes);

      const created: StoredDoc = {
        id: crypto.randomUUID(),
        clientId: source.clientId,
        fileName,
        fileType: 'application/pdf',
        fileSize: fileData.byteLength,
        category: source.category,
        year: source.year,
        uploadedAt: new Date().toISOString(),
        description: source.description || pdfFileNameFor(source.fileName).replace(/\.pdf$/i, ''),
        // ‼ המקור נרשם בהערות ולא בשדה חדש: linked_to כבר תפוס למשמעות
        // אחרת (הצגת המסמך במסך אחר), ומיגרציה רק בשביל שורת ייחוס
        // אינה מוצדקת. ראה LinkedDocsWidget / InstitutionAlignment.
        notes: `הומר ל-PDF מתוך «${source.fileName}».`,
        fileData,
        folderId: source.folderId ?? null,
        labelId: source.labelId ?? null,
      };
      await db.saveDoc(created);

      // אותו הקשר בדיוק: תצלום שנראה כאן מכוח קישור ללקוח נוסף — גם
      // ה-PDF שנגזר ממנו ייראה באותם מקומות, אחרת הוא "נעלם" מהמסך
      // שממנו בוצעה ההמרה.
      const links = await db.getLinkedClientIds(source.id);
      for (const cid of links) {
        if (cid !== source.clientId) await db.linkDocumentClient(created.id, cid);
      }

      closeDrawer();
      void loadAll();
      showToast(`נוצר PDF: ${fileName} · התצלום המקורי נשאר`);
    } catch (e) {
      setConvertError(
        e instanceof ImageConversionError ? e.message
          : e instanceof Error ? `ההמרה נכשלה: ${e.message}` : 'ההמרה נכשלה.');
    } finally {
      convertRunningRef.current = false;
      setConvertBusy(false);
    }
  }

  // ─── יעד: תיקייה אצל הלקוח הזה, או לקוח אחר + תיקייה אצלו ────────────
  // ‼ אותו דיאלוג משרת גם העברה וגם העתקה, כי השאלה זהה — "לאן?" —
  // ורק מה שקורה למקור שונה. שני דיאלוגים נפרדים היו מכריחים את המשתמש
  // ללמוד פעמיים את אותה היררכיה.
  const destIsOtherClient = !!destModal && destModal.clientId !== client.id;
  const destClient = destModal ? allClients.find(c => c.id === destModal.clientId) ?? null : null;

  useEffect(() => {
    if (!destModal) return;
    // תיקיות של הלקוח הנוכחי כבר בזיכרון; לכל לקוח אחר שולפים בנפרד.
    if (destModal.clientId === client.id) { setDestFolders(folders); setDestFoldersLoading(false); return; }
    let cancelled = false;
    setDestFoldersLoading(true);
    void (async () => {
      const f = await db.getFoldersByClient(destModal.clientId);
      if (cancelled) return;
      setDestFolders(f);
      setDestFoldersLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destModal?.clientId, client.id, folders]);

  function openDestination(mode: 'move' | 'copy') {
    if (selectedDocs.length === 0) return;
    destRunningRef.current = false;
    setDestError('');
    // ברירת המחדל היא התיקייה הנוכחית אצל אותו לקוח — הפעולה הנפוצה היא
    // סידור פנימי, ולא העברה ללקוח אחר.
    setDestModal({ mode, clientId: client.id, folderId: currentFolderId ?? '' });
  }
  function closeDestination() {
    if (destBusy) return;
    setDestModal(null);
    setDestError('');
  }

  /**
   * מבצעת את ההעברה/ההעתקה על כל המסמכים שנבחרו.
   * ‼ מורכבת מהפעולות הקיימות ואינה עוקפת אותן: moveDocToClient מזיז את
   * הקובץ באחסון ומנקה קישור עודף, duplicateDocToClient יוצר עותק עצמאי,
   * ו-moveDocsToFolder מניח את התוצאה בתיקיית היעד. כל השמירות שהיו שם
   * ממשיכות לחול.
   */
  async function runDestination() {
    if (destRunningRef.current || !destModal || destFoldersLoading || selectedDocs.length === 0) return;
    const { mode, clientId: targetClientId, folderId } = destModal;
    const targetFolder = folderId || null;
    const sameClient = targetClientId === client.id;
    const targets = selectedDocs;

    destRunningRef.current = true;
    setDestBusy(true); setDestError('');
    try {
      const landed: string[] = [];
      const failed: string[] = [];
      for (const d of targets) {
        const name = d.description || d.fileName;
        if (mode === 'copy') {
          const res = await db.duplicateDocToClient(d.id, targetClientId);
          if (!res.ok || !res.id) { failed.push(`${name} — ${res.error ?? 'ההעתקה נכשלה'}`); continue; }
          landed.push(res.id);
        } else if (sameClient) {
          landed.push(d.id);
        } else {
          const res = await db.moveDocToClient(d.id, targetClientId);
          if (!res.ok) { failed.push(`${name} — ${res.error ?? 'ההעברה נכשלה'}`); continue; }
          landed.push(d.id);
        }
      }
      if (landed.length > 0) await db.moveDocsToFolder(landed, targetFolder);

      if (failed.length > 0) {
        // ‼ מרעננים גם בכישלון חלקי: חלק מהמסמכים כבר זזו בפועל, ומסך
        // שממשיך להציג את המצב הישן משקר.
        void loadAll();
        clearSelection();
        setDestError(
          landed.length === 0
            ? `הפעולה נכשלה:\n${failed.join('\n')}`
            : `${landed.length} מתוך ${targets.length} בוצעו. נכשלו:\n${failed.join('\n')}`);
        return;
      }

      const where = destinationLabel(targetClientId, targetFolder);
      const many = targets.length > 1;
      const verb = mode === 'copy'
        ? (many ? `${targets.length} עותקים נוצרו ב` : 'נוצר עותק ב')
        : (many ? `${targets.length} מסמכים הועברו ל` : 'המסמך הועבר ל');
      setDestModal(null);
      clearSelection();
      void loadAll();
      showToast(`${verb}${where}`);
    } catch (e) {
      void loadAll();
      setDestError(e instanceof Error ? e.message : 'הפעולה נכשלה.');
    } finally {
      destRunningRef.current = false;
      setDestBusy(false);
    }
  }

  /** "לקוח › תיקייה" — או רק התיקייה כשהלקוח לא משתנה. */
  function destinationLabel(targetClientId: string, folderId: string | null): string {
    const list = targetClientId === client.id ? folders : destFolders;
    const byId = new Map(list.map(f => [f.id, f]));
    const folderName = folderId ? folderPathLabel(folderId, byId) : 'הרמה הראשית';
    if (targetClientId === client.id) return `«${folderName}»`;
    const c = allClients.find(x => x.id === targetClientId);
    const who = c ? `${c.firstName} ${c.lastName}`.trim() : 'הלקוח שנבחר';
    return `${who} › «${folderName}»`;
  }

  // ─── מחיקה מרובה ──────────────────────────────────────────────────────
  async function runBulkDelete() {
    if (bulkDeleteRunningRef.current || selectedDocs.length === 0) return;
    const targets = selectedDocs;
    bulkDeleteRunningRef.current = true;
    setBulkDeleteBusy(true); setBulkDeleteError('');
    try {
      const failed: string[] = [];
      for (const d of targets) {
        try { await db.deleteDoc(d.id); }
        catch (e) { failed.push(`${d.description || d.fileName} — ${e instanceof Error ? e.message : 'נכשל'}`); }
      }
      void loadAll();
      if (failed.length > 0) {
        setBulkDeleteError(`${targets.length - failed.length} מתוך ${targets.length} נמחקו. נכשלו:\n${failed.join('\n')}`);
        clearSelection();
        return;
      }
      setConfirmBulkDelete(false);
      clearSelection();
      showToast(targets.length === 1 ? 'המסמך נמחק' : `${targets.length} מסמכים נמחקו`);
    } finally {
      bulkDeleteRunningRef.current = false;
      setBulkDeleteBusy(false);
    }
  }

  // ─── גרירה לתיקייה (שולחן עבודה) ──────────────────────────────────────
  // ‼ גרירה מזיזה בין תיקיות של אותו לקוח בלבד. מעבר בין לקוחות הוא
  // שינוי בעלות, והוא נשאר פעולה מפורשת דרך "העברה" — לא משהו שקורה
  // כשהיד מחליקה. לכן יעדי הנפילה הם שורות התיקיות של המסך הזה בלבד.
  const canDrag = useMemo(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  ), []);

  function handleDocDragStart(e: React.DragEvent, doc: StoredDoc) {
    // מסמך שנגרר מתוך בחירה — כל הבחירה נוסעת איתו. מסמך שאינו בבחירה
    // נוסע לבדו, בלי לשנות את הבחירה הקיימת.
    const ids = selectedIds.has(doc.id) ? selectedDocs.map(d => d.id) : [doc.id];
    setDraggingIds(ids);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ids.join(','));
  }
  function handleDragEnd() {
    setDraggingIds([]);
    setDropFolderId(null);
  }
  function handleFolderDragOver(e: React.DragEvent, folderId: string) {
    if (draggingIds.length === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropFolderId !== folderId) setDropFolderId(folderId);
  }
  function handleFolderDragLeave(folderId: string) {
    if (dropFolderId === folderId) setDropFolderId(null);
  }
  async function handleFolderDrop(e: React.DragEvent, folder: DocFolder) {
    e.preventDefault();
    const ids = draggingIds;
    handleDragEnd();
    if (ids.length === 0) return;
    // מסמך שכבר יושב בתיקייה הזאת אינו "העברה" — לא כותבים ולא מודיעים.
    const moving = docs.filter(d => ids.includes(d.id) && (d.folderId ?? null) !== folder.id);
    if (moving.length === 0) return;
    try {
      await db.moveDocsToFolder(moving.map(d => d.id), folder.id);
      clearSelection();
      void loadAll();
      showToast(moving.length === 1
        ? `המסמך הועבר ל«${folder.name}»`
        : `${moving.length} מסמכים הועברו ל«${folder.name}»`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ההעברה נכשלה');
    }
  }
  const yearOptions = useMemo(() => ['כללי', ...AVAILABLE_YEARS.map(String)], []);

  // ‼ "אין פריטים שמתאימים לסינון" זו הודעת סינון — ומוצגת גם ללקוח שמעולם
  // לא סונן שום דבר, פשוט עוד אין לו מסמכים. סרגל כלים מלא (חיפוש/תווית/
  // שנה/נהל-תוויות) מעל משפט על "סינון" כשאין מה לסנן קורא כמו תקלה, לא
  // כמו התחלה. ראה docs/UX-CONVERGENCE-AUDIT-2026-08.md §9/§17 #6.
  const hasAnyContent = docs.length > 0 || folders.length > 0;
  const hasActiveFilter = !!q.trim() || !!filterLabel || !!filterYear;
  const isFirstRun = !loading && !hasAnyContent && !hasActiveFilter && currentFolderId === null;

  return (
    <div className="cw-tabpanel ial-docs" onClick={() => addMenuOpen && setAddMenuOpen(false)}>
      {!isFirstRun && (
      <div className="docw-toolbar">
        <input
          className="ial-doc-search"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="חפש קובץ, תיקייה, תווית או שנה…"
          value={search}
          onChange={e => { clearSelection(); setSearch(e.target.value); }}
        />
        <select value={filterLabel} onChange={e => { clearSelection(); setFilterLabel(e.target.value); }}>
          <option value="">כל התוויות</option>
          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => { clearSelection(); setFilterYear(e.target.value); }}>
          <option value="">כל השנים</option>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ position: 'relative' }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); setAddMenuOpen(v => !v); }}>
            הוסף ▾
          </button>
          {addMenuOpen && (
            <div className="ial-doc-menu" onClick={e => e.stopPropagation()}>
              <button type="button" onClick={openUploadFile}>העלה קובץ</button>
              <button type="button" onClick={openUploadFolder}>העלה תיקייה</button>
              <button type="button" onClick={openCreateFolder}>צור תיקייה</button>
              <hr />
              <button type="button" onClick={openRequest}>בקש מסמך מהלקוח</button>
              <hr />
              {/* ‼ פעולת ניהול נדירה — לא שייכת לרמת הכלים הראשית לצד
                  חיפוש/תווית/שנה, שם היא מתחרה בגובה עם מה שמשתמשים בו כל
                  יום. ראה docs/UX-CONVERGENCE-AUDIT-2026-08.md §9/§21 Phase 4. */}
              <button type="button" onClick={() => { setAddMenuOpen(false); setLabelManagerOpen(true); }}>נהל תוויות</button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" multiple accept={FILE_ACCEPT} style={{ display: 'none' }} onChange={handleFilesPicked} />
        <input
          ref={folderInputRef} type="file" style={{ display: 'none' }} onChange={handleFolderPicked}
          {...({ webkitdirectory: '', directory: '' } as any)}
        />
      </div>
      )}

      {isFirstRun ? (
        <div className="cw-section">
          <EmptyState
            headline="עוד אין מסמכים"
            sentence="כל קובץ מקבל שנה ותווית מקצועית אחת, ואפשר לקשר אותו לכמה לקוחות בלי לשכפל."
            action={{ label: 'העלה קובץ', onClick: openUploadFile }}
            quietLink={{ label: 'בקש מסמך מהלקוח', onClick: openRequest }}
          />
          <input ref={fileInputRef} type="file" multiple accept={FILE_ACCEPT} style={{ display: 'none' }} onChange={handleFilesPicked} />
        </div>
      ) : (
      <>
      {/* ‼ המסמכים עצמם ראשוניים: הכלים למעלה קומפקטיים, הנתיב+הרשימה
          מיד מתחתיהם באותה מידה — לא עוד כרטיס נפרד עם ריפוד עצמאי. */}
      <div className="docw-path">
        <button type="button" className="ial-back" style={{ marginBottom: 0 }} onClick={goRoot}>כל המסמכים</button>
        {!q && breadcrumb.map((f, i) => (
          <span key={f.id} style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--ink-4)' }}>/</span>
            <button type="button" className="ial-back" style={{ marginBottom: 0 }} onClick={() => goCrumb(i)}>{f.name}</button>
          </span>
        ))}
        {q && <span>תוצאות חיפוש בכל התיקיות</span>}
        <span className="docw-path-count">{filteredRows.length} פריטים</span>
      </div>

      {/* ‼ סרגל הפעולה נולד מהבחירה ומת איתה. פס הורדה קבוע היה מתחרה
          בגובה עם "הוסף▾" על מסך שברוב הזמן אין בו בחירה כלל. */}
      {selectedDocs.length > 0 && (
        <div className="docw-bulkbar">
          <span className="docw-bulkbar-count">
            {selectedDocs.length === 1 ? 'מסמך אחד נבחר' : `${selectedDocs.length} מסמכים נבחרו`}
          </span>
          <button type="button" className="docw-bulkbar-clear" onClick={clearSelection}>נקה בחירה</button>
          {/* במסך צר שורת הכותרת מוסתרת ואיתה "בחר הכל" — כאן היא חוזרת */}
          <button type="button" className="docw-bulkbar-clear docw-bulkbar-all" onClick={toggleAllVisible}>
            {allVisibleSelected ? 'בטל בחירת הכל' : `בחר הכל (${visibleDocs.length})`}
          </button>
          <span className="docw-bulkbar-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={openZipModal}>הורדה</button>
            <button type="button" className="btn btn-sm" onClick={() => openDestination('move')}>העברה</button>
            <button type="button" className="btn btn-sm" onClick={() => openDestination('copy')}>העתקה</button>
            {/* מחיקה שקטה: אותה שורה, בלי משקל של כפתור מלא — היא הפעולה
                היחידה כאן שאי אפשר לבטל. */}
            <button type="button" className="docw-bulkbar-danger"
              onClick={() => { setBulkDeleteError(''); setConfirmBulkDelete(true); }}>מחיקה</button>
          </span>
        </div>
      )}

      {loading ? (
        <div className="docw-list"><div className="docw-empty">טוען…</div></div>
      ) : filteredRows.length === 0 ? (
        <div className="docw-list"><div className="docw-empty">אין פריטים שמתאימים לסינון.</div></div>
      ) : (
        <div className="docw-list">
          <div className="docw-head-row">
            <span className="docw-sel">
              <input
                type="checkbox"
                aria-label="בחר את כל המסמכים המוצגים"
                title="בחר את כל המסמכים המוצגים"
                disabled={visibleDocs.length === 0}
                checked={allVisibleSelected}
                ref={el => { if (el) el.indeterminate = someVisibleSelected; }}
                onChange={toggleAllVisible}
              />
            </span>
            <span>שם</span><span>תווית</span><span>שנה</span><span>עודכן</span>
          </div>
          {filteredRows.map(r => {
            if (r.kind === 'folder') {
              const f = r.folder!;
              const label = f.labelId ? labelsById.get(f.labelId) : null;
              return (
                <div
                  key={f.id} className={`docw-row docw-folder-row${dropFolderId === f.id ? ' is-drop-target' : ''}`}
                  role="button" tabIndex={0}
                  onClick={() => goInto(f.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goInto(f.id); } }}
                  onDragOver={e => handleFolderDragOver(e, f.id)}
                  onDragLeave={() => handleFolderDragLeave(f.id)}
                  onDrop={e => handleFolderDrop(e, f)}
                >
                  {/* תיקייה אינה מסמך ואינה נארזת — התא נשאר ריק כדי
                      שהעמודות של שתי סוגי השורות יישארו מיושרות. */}
                  <span className="docw-sel" aria-hidden="true" />
                  <span className="docw-name">
                    📁 {f.name}
                    {r.path && <span className="docw-path-hint">{r.path}</span>}
                  </span>
                  <span>{label && <span className="ial-doc-label-chip">{label.name}</span>}</span>
                  <span className="docw-col-year">{f.year || '—'}</span>
                  <span className="docw-col-updated">
                    {fmtDate(f.createdAt)}
                    {/* פעולות התיקייה יושבות על השורה שלה — שם הן רלוונטיות */}
                    <span className="docw-folder-actions">
                      <button type="button" title="שם, תווית ושנה"
                        onClick={e => { e.stopPropagation(); openFolderEdit(f); }}>ערוך</button>
                      <button type="button" title="מחיקת התיקייה" style={{ color: 'var(--err)' }}
                        onClick={e => { e.stopPropagation(); setConfirmDeleteFolder(f); setFolderError(''); }}>מחק</button>
                    </span>
                  </span>
                </div>
              );
            }
            const d = r.doc!;
            const label = d.labelId ? labelsById.get(d.labelId) : null;
            return (
              <div
                key={d.id}
                className={`docw-row docw-doc-row${selectedIds.has(d.id) ? ' is-selected' : ''}${draggingIds.includes(d.id) ? ' is-dragging' : ''}${canDrag ? ' is-draggable' : ''}`}
                role="button" tabIndex={0}
                onClick={() => openDrawer(d)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(d); } }}
                draggable={canDrag}
                onDragStart={canDrag ? e => handleDocDragStart(e, d) : undefined}
                onDragEnd={canDrag ? handleDragEnd : undefined}
              >
                {/* ‼ stopPropagation: לחיצה על השורה פותחת את המגירה, וסימון
                    התיבה אינו אמור לפתוח אותה. */}
                <span className="docw-sel" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`בחר את ${d.description || d.fileName}`}
                    checked={selectedIds.has(d.id)}
                    onChange={() => toggleDoc(d.id)}
                    onKeyDown={e => e.stopPropagation()}
                  />
                </span>
                <span className="docw-name">
                  {d.description || d.fileName}
                  <span className="docw-path-hint">{r.path || d.fileName}</span>
                </span>
                <span>{label && <span className="ial-doc-label-chip">{label.name}</span>}</span>
                <span className="docw-col-year">{d.year === 'general' ? 'כללי' : d.year}</span>
                <span className="docw-col-updated">{fmtDate(d.uploadedAt)}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="csub" style={{ margin: '.5rem .2rem 0', fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
        המסמכים פנימיים למשרד. הלקוח אינו רואה אותם — מה שמבקשים ממנו עובר דרך בקשת לקוח.
      </div>
      </>
      )}

      {/* ── מגירת פרטי מסמך ───────────────────────────────────────────── */}
      {drawerDoc && (
        <div className="ial-doc-drawer-shade" onClick={closeDrawer}>
          <div className="ial-doc-drawer" onClick={e => e.stopPropagation()}>
            {/* ‼ המגירה מתארת מסמך אחד. כל מה שפועל על *אוסף* מסמכים —
                העברה, העתקה, הורדה — ירד מכאן לסרגל הבחירה, ששם הוא עובד
                גם על מסמך אחד וגם על עשרה. מה שנשאר: מי המסמך, איך פותחים
                אותו, והשדות שבאמת שלו. */}
            <div className="docw-drawer-top">
              <div className="docw-drawer-id">
                <h3>{drawerDoc.description || drawerDoc.fileName}</h3>
                <div className="csub">{drawerDoc.fileName} · {fmtSize(drawerDoc.fileSize)}</div>
              </div>
              <button type="button" className="ui-icon-btn" aria-label="סגירה" onClick={closeDrawer}>✕</button>
            </div>

            <div className="docw-drawer-actions">
              <button
                type="button" className="ui-btn ui-btn-primary"
                disabled={fileBusy} onClick={openFileInNewTab}
              >{fileBusy ? 'פותח…' : 'פתח את הקובץ'}</button>
              {/* מוצג רק על תצלום — מסמך שהוא כבר PDF אין מה להמיר. */}
              {looksConvertible(drawerDoc.fileType, drawerDoc.fileName) && (
                <button
                  type="button" className="ui-btn ui-btn-ghost"
                  disabled={convertBusy} onClick={convertDrawerDocToPdf}
                  title="ייווצר מסמך PDF חדש לצד התצלום; המקור נשאר"
                >{convertBusy ? 'ממיר…' : 'המר ל-PDF'}</button>
              )}
            </div>
            {fileError && <div className="docw-drawer-err">{fileError}</div>}
            {convertError && <div className="docw-drawer-err">{convertError}</div>}

            {/* ‼ שם התצוגה בלבד. שם הקובץ המקורי אינו משתנה, כדי שהקובץ
                שיירד למחשב יישאר מזוהה — ולכן הוא מוצג למעלה ליד הגודל. */}
            <label className="lbl" style={{ marginTop: '.9rem' }}>שם המסמך</label>
            <input
              className="inp"
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder={drawerDoc.fileName}
            />

            <div className="ial-doc-fact" style={{ marginTop: '.7rem', alignItems: 'flex-start' }}>
              <label style={{ paddingTop: '.35rem' }}>תווית</label>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 1, minWidth: 0 }}>
                <LabelSelect
                  className=""
                  value={drawerDoc.labelId ?? ''}
                  labels={labels}
                  onChange={id => id && saveDrawerMeta({ labelId: id })}
                  onCreated={mergeLabel}
                />
              </div>
            </div>
            <div className="ial-doc-fact">
              <label>שנה</label>
              <select
                value={drawerDoc.year === 'general' ? 'כללי' : String(drawerDoc.year)}
                onChange={e => saveDrawerMeta({ year: e.target.value === 'כללי' ? 'general' : Number(e.target.value) } as any)}
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {/* התיקייה מוצגת כעובדה ולא כבורר: שינוי מקום נעשה מסרגל
                הבחירה או בגרירה, ושם הוא עובד גם על כמה מסמכים יחד. */}
            <div className="ial-doc-fact">
              <label>תיקייה</label>
              <span>{folderPathLabel(drawerDoc.folderId ?? null, foldersById)}</span>
            </div>

            <div className="ial-doc-sechead" title="קישור = אותו קובץ אצל כמה לקוחות; עריכה משנה אותו אצל כולם">
              לקוחות מקושרים
            </div>
            <div className="ial-doc-fact"><b>{client.firstName} {client.lastName}</b><span>ראשי</span></div>
            {drawerLinkedClients.map(cid => {
              const c = allClients.find(x => x.id === cid);
              if (!c) return null;
              return (
                <div className="ial-doc-fact" key={cid}>
                  <b>{c.firstName} {c.lastName}</b>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeClientLink(cid)}>הסר</button>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem' }}>
              <select value={addClientPick} onChange={e => setAddClientPick(e.target.value)} style={{ flex: 1 }}>
                <option value="">קשר ללקוח נוסף…</option>
                {allClients.filter(c => c.id !== client.id && !drawerLinkedClients.includes(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" disabled={!addClientPick} onClick={addClientLink}>קשר</button>
            </div>

            {/* נפתח רק כשיש מה להראות — כותרת מעל "אין" היא רעש. */}
            {drawerLinkedTasks.length > 0 && (
              <>
                <div className="ial-doc-sechead">משימות מקושרות</div>
                {drawerLinkedTasks.map(t => <div className="ial-doc-fact" key={t.id}><b>{t.title}</b></div>)}
              </>
            )}

            {docActionError && <div className="docw-drawer-err">{docActionError}</div>}
            <div className="docw-drawer-foot">
              <button type="button" className="docw-bulkbar-danger"
                onClick={() => setConfirmDeleteDoc(true)}>מחיקת המסמך</button>
            </div>
          </div>
        </div>
      )}

      {/* ── יעד: העברה או העתקה של המסמכים שנבחרו ────────────────────── */}
      {destModal && (() => {
        const isMove = destModal.mode === 'move';
        const count = selectedDocs.length;
        return (
          <div className="modal-backdrop" onClick={closeDestination}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <h3>{isMove ? 'העברת מסמכים' : 'העתקת מסמכים'}</h3>
              <div className="csub" style={{ marginTop: '.4rem' }}>
                {isMove
                  ? (count === 1 ? 'המסמך יעבור ליעד שתבחר.' : `${count} מסמכים יעברו ליעד שתבחר.`)
                  : (count === 1
                    ? 'ייווצר עותק ביעד שתבחר. המסמך נשאר גם כאן.'
                    : `${count} עותקים ייווצרו ביעד שתבחר. המסמכים נשארים גם כאן.`)}
              </div>

              <label className="lbl">לקוח</label>
              <select
                className="inp" value={destModal.clientId} disabled={destBusy}
                onChange={e => setDestModal({ ...destModal, clientId: e.target.value, folderId: '' })}
              >
                <option value={client.id}>{client.firstName} {client.lastName} — הלקוח הנוכחי</option>
                {allClients.filter(c => c.id !== client.id).map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>

              <label className="lbl">תיקייה</label>
              <select
                className="inp" value={destModal.folderId} disabled={destBusy || destFoldersLoading}
                onChange={e => setDestModal({ ...destModal, folderId: e.target.value })}
              >
                <option value="">הרמה הראשית</option>
                {destFolders.map(f => (
                  <option key={f.id} value={f.id}>
                    {folderPathLabel(f.id, new Map(destFolders.map(x => [x.id, x])))}
                  </option>
                ))}
              </select>
              {destFoldersLoading && <div className="csub" style={{ marginTop: '.25rem' }}>טוען תיקיות…</div>}
              {!destFoldersLoading && destFolders.length === 0 && (
                <div className="csub" style={{ marginTop: '.25rem' }}>אין תיקיות אצל הלקוח הזה — היעד יהיה הרמה הראשית.</div>
              )}

              {/* ‼ ההבחנה שחייבת להיות מפורשת: שינוי תיקייה הוא סידור
                  פנימי, ומעבר ללקוח אחר הוא שינוי בעלות על הקובץ. */}
              {destIsOtherClient ? (
                <div className="note warn">
                  {isMove ? (
                    <>הקובץ <b>יעזוב</b> את {client.firstName} ויעבור לבעלות {destClient ? `${destClient.firstName} ${destClient.lastName}`.trim() : 'הלקוח שנבחר'}. לא יישאר כאן עותק.</>
                  ) : (
                    <>ייווצר עותק <b>עצמאי</b> אצל {destClient ? `${destClient.firstName} ${destClient.lastName}`.trim() : 'הלקוח שנבחר'}. עריכה בעותק לא תשפיע על המסמך כאן.</>
                  )}
                </div>
              ) : (
                <div className="note">
                  {isMove ? 'שינוי תיקייה בלבד — המסמכים נשארים אצל אותו לקוח.' : 'עותק נוסף אצל אותו לקוח.'}
                </div>
              )}

              {destError && (
                <div className="note warn" style={{ marginTop: '.5rem', color: 'var(--err)', whiteSpace: 'pre-line' }}>{destError}</div>
              )}
              <div className="foot">
                {/* ‼ אין לאשר בזמן שתיקיות היעד עדיין נטענות: הבורר מציג
                    אז "הרמה הראשית" כברירת מחדל, ואישור באותו רגע היה
                    מנחית את המסמכים בשורש במקום בתיקייה שהמשתמש התכוון
                    אליה — בלי שום סימן שמשהו השתבש. */}
                <button type="button" className="btn btn-primary"
                  disabled={destBusy || destFoldersLoading || count === 0} onClick={runDestination}>
                  {destBusy ? 'מבצע…' : isMove ? 'העבר' : 'העתק'}
                </button>
                <button type="button" className="btn" disabled={destBusy} onClick={closeDestination}>ביטול</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── אישור מחיקה של המסמכים שנבחרו ────────────────────────────── */}
      {confirmBulkDelete && (
        <div className="modal-backdrop" onClick={() => !bulkDeleteBusy && setConfirmBulkDelete(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>מחיקת מסמכים</h3>
            <div className="csub" style={{ marginTop: '.5rem', lineHeight: 1.7 }}>
              {selectedDocs.length === 1
                ? <>«{selectedDocs[0].description || selectedDocs[0].fileName}» יימחק לצמיתות, כולל הקובץ עצמו.</>
                : <>{selectedDocs.length} מסמכים יימחקו לצמיתות, כולל הקבצים עצמם.</>}
              <br />לא ניתן לשחזר.
            </div>
            {bulkDeleteError && (
              <div className="note warn" style={{ marginTop: '.5rem', color: 'var(--err)', whiteSpace: 'pre-line' }}>{bulkDeleteError}</div>
            )}
            <div className="foot">
              <button type="button" className="btn btn-primary" style={{ background: 'var(--err)', borderColor: 'var(--err)' }}
                disabled={bulkDeleteBusy} onClick={runBulkDelete}>{bulkDeleteBusy ? 'מוחק…' : 'מחק לצמיתות'}</button>
              <button type="button" className="btn" disabled={bulkDeleteBusy} onClick={() => setConfirmBulkDelete(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
      {/* ── אישור מחיקת מסמך ─────────────────────────────────────────── */}
      {confirmDeleteDoc && drawerDoc && (
        <div className="modal-backdrop" onClick={() => !docActionBusy && setConfirmDeleteDoc(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>מחיקת המסמך</h3>
            <div className="csub" style={{ marginTop: '.5rem', lineHeight: 1.7 }}>
              «{drawerDoc.description || drawerDoc.fileName}» יימחק לצמיתות, כולל הקובץ עצמו.
              {drawerLinkedClients.length > 0 && <> הוא מקושר גם ל-{drawerLinkedClients.length} לקוחות נוספים — המחיקה תסיר אותו גם אצלם.</>}
              <br />לא ניתן לשחזר.
            </div>
            {docActionError && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.4rem' }}>{docActionError}</div>}
            <div className="foot">
              <button type="button" className="btn btn-primary" style={{ background: 'var(--err)', borderColor: 'var(--err)' }}
                disabled={docActionBusy} onClick={deleteDrawerDoc}>{docActionBusy ? 'מוחק…' : 'מחק לצמיתות'}</button>
              <button type="button" className="btn" disabled={docActionBusy} onClick={() => setConfirmDeleteDoc(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* ── עריכת תיקייה: שם, תווית ושנה ─────────────────────────────── */}
      {folderEdit && (() => {
        const { folderIds, docIds } = descendantsOf(folderEdit.id);
        const changesContent =
          folderEditMeta.labelId !== (folderEdit.labelId || '') ||
          folderEditMeta.year !== (folderEdit.year || '');
        const parts = [
          docIds.length ? (docIds.length === 1 ? 'קובץ אחד' : `${docIds.length} קבצים`) : '',
          folderIds.length ? (folderIds.length === 1 ? 'תת-תיקייה אחת' : `${folderIds.length} תת-תיקיות`) : '',
        ].filter(Boolean);
        // ו' החיבור נצמדת למילה אבל מקבלת מקף לפני ספרה — "ותת-תיקייה", "ו-2 קבצים"
        const inside = parts.length < 2
          ? parts[0] ?? ''
          : `${parts[0]} ${/^\d/.test(parts[1]) ? 'ו-' : 'ו'}${parts[1]}`;
        return (
          <div className="modal-backdrop" onClick={() => !folderBusy && setFolderEdit(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <h3>עריכת התיקייה</h3>
              <label className="lbl">שם</label>
              <input className="inp" value={folderEditName} autoFocus
                onChange={e => setFolderEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void commitFolderEdit(); }} />
              <label className="lbl required">שנה</label>
              <select className="inp" value={folderEditMeta.year}
                onChange={e => setFolderEditMeta({ ...folderEditMeta, year: e.target.value })}>
                <option value="">בחר שנה…</option>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <label className="lbl required">תווית</label>
              <LabelSelect
                value={folderEditMeta.labelId}
                labels={labels}
                onChange={id => setFolderEditMeta({ ...folderEditMeta, labelId: id })}
                onCreated={mergeLabel}
              />
              <div className={changesContent && inside ? 'note warn' : 'note'}>
                {inside
                  ? <>התווית והשנה של התיקייה חלות על כל מה שבתוכה — {inside}.{changesContent && <> <b>שינוי שביצעת יוחל עליהם עכשיו.</b></>}</>
                  : <>התיקייה ריקה — התווית והשנה ישמשו כברירת מחדל למה שייכנס אליה.</>}
              </div>
              {folderError && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.4rem' }}>{folderError}</div>}
              <div className="foot">
                <button type="button" className="btn btn-primary"
                  disabled={folderBusy || !folderEditName.trim() || !folderEditMeta.year || !folderEditMeta.labelId}
                  onClick={commitFolderEdit}>{folderBusy ? 'שומר…' : 'שמור'}</button>
                <button type="button" className="btn" disabled={folderBusy} onClick={() => setFolderEdit(null)}>ביטול</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── אישור מחיקת תיקייה ───────────────────────────────────────── */}
      {confirmDeleteFolder && (() => {
        const inside = docs.filter(d => d.folderId === confirmDeleteFolder.id).length;
        const subFolders = folders.filter(f => f.parentId === confirmDeleteFolder.id).length;
        return (
          <div className="modal-backdrop" onClick={() => !folderBusy && setConfirmDeleteFolder(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <h3>מחיקת התיקייה</h3>
              <div className="csub" style={{ marginTop: '.5rem', lineHeight: 1.7 }}>
                «{confirmDeleteFolder.name}» תימחק.
                {(inside > 0 || subFolders > 0)
                  ? <> יש בה {inside > 0 ? `${inside} מסמכים` : ''}{inside > 0 && subFolders > 0 ? ' ו-' : ''}{subFolders > 0 ? `${subFolders} תת-תיקיות` : ''}.
                      <br />‼ מומלץ להעביר אותם קודם — אחרת הם עלולים להישאר בלי תיקייה.</>
                  : <> התיקייה ריקה.</>}
              </div>
              {folderError && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.4rem' }}>{folderError}</div>}
              <div className="foot">
                <button type="button" className="btn btn-primary" style={{ background: 'var(--err)', borderColor: 'var(--err)' }}
                  disabled={folderBusy} onClick={runDeleteFolder}>{folderBusy ? 'מוחק…' : 'מחק תיקייה'}</button>
                <button type="button" className="btn" disabled={folderBusy} onClick={() => setConfirmDeleteFolder(null)}>ביטול</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ניהול תוויות ─────────────────────────────────────────────── */}
      {labelManagerOpen && (
        <div className="modal-backdrop" onClick={() => setLabelManagerOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>תוויות מקצועיות</h3>
            <div className="csub">הרשימה משותפת לכל הלקוחות. תווית שנוספת כאן זמינה מיד בכל תיק.</div>
            {labels.map(l => (
              <div key={l.id} className="ial-doc-fact">
                {l.isReserved ? (
                  <b>{l.name} (שמורה)</b>
                ) : (
                  <input
                    className="inp" style={{ flex: 1, marginTop: 0 }} defaultValue={l.name} disabled={labelBusy}
                    onBlur={e => renameLabelTo(l, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                )}
                {!l.isReserved && (
                  <button type="button" className="btn btn-sm btn-ghost" disabled={labelBusy} onClick={() => removeLabel(l.id)}>מחק</button>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.6rem' }}>
              <input value={newLabelName} onChange={e => setNewLabelName(e.target.value)} placeholder="תווית חדשה" style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm btn-primary" disabled={labelBusy} onClick={addLabel}>הוסף</button>
            </div>
            {labelError && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.3rem' }}>{labelError}</div>}
            <div className="foot" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn" onClick={() => setLabelManagerOpen(false)}>סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* ── מודל העלאת קובץ ──────────────────────────────────────────── */}
      {uploadModal && (
        <MetaModal
          title={`העלה ${uploadModal.files.length > 1 ? `${uploadModal.files.length} קבצים` : 'קובץ'}`}
          meta={uploadModal.meta}
          labels={labels}
          yearOptions={yearOptions}
          rootRequiresExplicit={!parentFolder}
          onLabelCreated={mergeLabel}
          onChange={meta => setUploadModal({ ...uploadModal, meta })}
          onCancel={() => setUploadModal(null)}
          onConfirm={confirmUpload}
          confirmLabel="שמור"
        />
      )}

      {/* ── מודל יצירת תיקייה ────────────────────────────────────────── */}
      {folderModal && (
        <div className="modal-backdrop" onClick={() => setFolderModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>צור תיקייה</h3>
            <label className="lbl">שם</label>
            <input className="inp" value={folderModal.name} onChange={e => setFolderModal({ ...folderModal, name: e.target.value })} autoFocus />
            <MetaFields
              meta={folderModal.meta} labels={labels} yearOptions={yearOptions}
              rootRequiresExplicit={!parentFolder}
              onLabelCreated={mergeLabel}
              onChange={meta => setFolderModal({ ...folderModal, meta })}
            />
            <div className="foot">
              <button type="button" className="btn btn-primary" onClick={confirmCreateFolder}
                disabled={!folderModal.name.trim() || !folderModal.meta.year || !folderModal.meta.labelId}>צור</button>
              <button type="button" className="btn" onClick={() => setFolderModal(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* ── מודל העלאת תיקייה מהמחשב ─────────────────────────────────── */}
      {folderUploadModal && (
        <MetaModal
          title={`העלה תיקייה — ${folderUploadModal.files.length} קבצים`}
          meta={folderUploadModal.meta}
          labels={labels}
          yearOptions={yearOptions}
          rootRequiresExplicit={!parentFolder}
          note="כל מה שבתוכה יקבל כברירת מחדל את אותה שנה ותווית. פריט מסוים אפשר לשנות אחר כך."
          onLabelCreated={mergeLabel}
          onChange={meta => setFolderUploadModal({ ...folderUploadModal, meta })}
          onCancel={() => setFolderUploadModal(null)}
          onConfirm={confirmFolderUpload}
          confirmLabel="העלה"
        />
      )}

      {/* ── מודל שם החבילה להורדה ───────────────────────────────────── */}
      {zipModal && (
        <div className="modal-backdrop" onClick={closeZipModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>הורדת מסמכים</h3>
            <div className="csub" style={{ marginTop: '.4rem' }}>
              {selectedDocs.length === 1 ? 'מסמך אחד יירד' : `${selectedDocs.length} מסמכים יירדו`} כקובץ ZIP אחד. המסמכים כאן נשארים כמו שהם.
            </div>
            <label className="lbl">שם החבילה</label>
            <input
              className="inp"
              value={zipModal.name}
              autoFocus
              disabled={zipBusy}
              placeholder="לדוגמה: גיא ישר - דוח 2025"
              onChange={e => { setZipModal({ name: e.target.value }); setZipError(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && zipBaseName && !zipBusy) void runZipDownload(); }}
            />
            {/* הסיומת נוספת מאליה — אין טעם להקליד אותה, ואם הוקלדה היא לא תוכפל */}
            <div className="csub" style={{ marginTop: '.3rem' }}>
              {zipBaseName
                ? `הקובץ יישמר בשם «${zipDisplayName(zipBaseName)}»`
                : 'צריך שם לחבילה — אותיות, ספרות, מקף או רווח.'}
            </div>
            {zipError && (
              <div className="note warn" style={{ marginTop: '.6rem' }}>
                <div style={{ color: 'var(--err)' }}>{zipError.message}</div>
                {zipError.failed.length > 0 && (
                  <ul style={{ margin: '.4rem 0 0', paddingInlineStart: '1.1rem' }}>
                    {zipError.failed.map(name => <li key={name}>{name}</li>)}
                  </ul>
                )}
                {partialRef.current && (
                  <button type="button" className="btn btn-sm" style={{ marginTop: '.5rem' }} onClick={downloadPartial}>
                    הורד בכל זאת את {partialRef.current.entries.length} המסמכים שנמצאו
                  </button>
                )}
              </div>
            )}
            <div className="foot">
              <button
                type="button" className="btn btn-primary"
                disabled={zipBusy || !zipBaseName || selectedDocs.length === 0}
                onClick={runZipDownload}
              >{zipBusy ? `אורז ${Math.min(zipProgress + 1, selectedDocs.length)} מתוך ${selectedDocs.length}…` : 'הורדה'}</button>
              <button type="button" className="btn" disabled={zipBusy} onClick={closeZipModal}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* ── מודל בקשת מסמך מהלקוח ────────────────────────────────────── */}
      {requestModal && (
        <div className="modal-backdrop" onClick={() => !requestBusy && setRequestModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>בקש מסמך מהלקוח</h3>
            <div className="csub">קיצור דרך לבקשת לקוח רגילה — טיוטה, לא נשלחת אוטומטית. הקובץ שיתקבל יישמר כאן עם השנה והתווית שנבחרו.</div>
            <label className="lbl">מה לבקש?</label>
            <input className="inp" value={requestModal.title} onChange={e => setRequestModal({ ...requestModal, title: e.target.value })} />
            <label className="lbl">שנה למסמך שיתקבל</label>
            <select className="inp" value={requestModal.year} onChange={e => setRequestModal({ ...requestModal, year: e.target.value })}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label className="lbl">תווית למסמך שיתקבל</label>
            <LabelSelect
              value={requestModal.labelId}
              labels={labels}
              includeReserved={false}
              onChange={id => setRequestModal({ ...requestModal, labelId: id })}
              onCreated={mergeLabel}
            />
            {requestError && <div style={{ color: 'var(--err)', fontSize: 'var(--fs-12)', marginTop: '.4rem' }}>{requestError}</div>}
            <div className="foot">
              <button type="button" className="btn btn-primary" disabled={requestBusy || !requestModal.title.trim() || !requestModal.labelId}
                onClick={confirmRequest}>{requestBusy ? 'יוצר…' : 'צור בקשה'}</button>
              <button type="button" className="btn" onClick={() => setRequestModal(null)} disabled={requestBusy}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function folderPathLabel(folderId: string | null, foldersById: Map<string, DocFolder>): string {
  const path: string[] = [];
  let id = folderId;
  const guard = new Set<string>();
  while (id && !guard.has(id)) {
    guard.add(id);
    const f = foldersById.get(id);
    if (!f) break;
    path.unshift(f.name);
    id = f.parentId;
  }
  return path.length ? path.join(' / ') : 'הרמה הראשית';
}

function MetaFields({ meta, labels, yearOptions, rootRequiresExplicit, onChange, onLabelCreated }: {
  meta: MetaDraft; labels: DocumentLabel[]; yearOptions: string[]; rootRequiresExplicit: boolean;
  onChange: (m: MetaDraft) => void; onLabelCreated: (l: DocumentLabel) => void;
}) {
  return (
    <>
      <label className="lbl required">שנה</label>
      <select className="inp" value={meta.year} onChange={e => onChange({ ...meta, year: e.target.value })}>
        <option value="">בחר שנה…</option>
        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <label className="lbl required">תווית</label>
      <LabelSelect
        value={meta.labelId}
        labels={labels}
        onChange={id => onChange({ ...meta, labelId: id })}
        onCreated={onLabelCreated}
      />
      {rootRequiresExplicit ? (
        <div className="note warn">שורש המסמכים — אין תיקייה שממנה לרשת. בחר שנה ותווית.</div>
      ) : (meta.year && meta.labelId) ? (
        <div className="note">נבחר אוטומטית לפי התיקייה. אפשר לשנות.</div>
      ) : null}
    </>
  );
}

function MetaModal({ title, meta, labels, yearOptions, rootRequiresExplicit, note, onChange, onLabelCreated, onCancel, onConfirm, confirmLabel }: {
  title: string; meta: MetaDraft; labels: DocumentLabel[]; yearOptions: string[]; rootRequiresExplicit: boolean; note?: string;
  onChange: (m: MetaDraft) => void; onLabelCreated: (l: DocumentLabel) => void;
  onCancel: () => void; onConfirm: () => void; confirmLabel: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <MetaFields meta={meta} labels={labels} yearOptions={yearOptions} rootRequiresExplicit={rootRequiresExplicit} onChange={onChange} onLabelCreated={onLabelCreated} />
        {note && <div className="note">{note}</div>}
        <div className="foot">
          <button type="button" className="btn btn-primary" disabled={!meta.year || !meta.labelId} onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="btn" onClick={onCancel}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

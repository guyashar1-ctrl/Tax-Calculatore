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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentFolderId(null);
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

  function goRoot() { setSearch(''); setCurrentFolderId(null); }
  function goInto(id: string) { setSearch(''); setCurrentFolderId(id); }
  function goCrumb(index: number) { setSearch(''); setCurrentFolderId(breadcrumb[index]?.id ?? null); }

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
    setRequestModal({ title: 'מסמך נדרש', year: String(new Date().getFullYear()), labelId: reservedLabel?.id ?? '' });
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
  }
  function closeDrawer() { setDrawerDoc(null); setDrawerLinkedClients([]); setDrawerLinkedTasks([]); }

  async function saveDrawerMeta(patch: Partial<Pick<StoredDoc, 'labelId' | 'year' | 'description'>>) {
    if (!drawerDoc) return;
    const updated = { ...drawerDoc, ...patch };
    await db.saveDoc(updated);
    setDrawerDoc(updated);
    void loadAll();
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

  async function openDocFile(doc: StoredDoc) {
    const full = await db.getDoc(doc.id);
    if (!full || full.fileData.byteLength === 0) { openDrawer(doc); return; }
    const blob = new Blob([full.fileData], { type: doc.fileType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    openDrawer(doc);
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
          onChange={e => setSearch(e.target.value)}
        />
        <select value={filterLabel} onChange={e => setFilterLabel(e.target.value)}>
          <option value="">כל התוויות</option>
          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}>
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

      {loading ? (
        <div className="docw-list"><div className="docw-empty">טוען…</div></div>
      ) : filteredRows.length === 0 ? (
        <div className="docw-list"><div className="docw-empty">אין פריטים שמתאימים לסינון.</div></div>
      ) : (
        <div className="docw-list">
          <div className="docw-head-row">
            <span>שם</span><span>תווית</span><span>שנה</span><span>עודכן</span>
          </div>
          {filteredRows.map(r => {
            if (r.kind === 'folder') {
              const f = r.folder!;
              const label = f.labelId ? labelsById.get(f.labelId) : null;
              return (
                <div
                  key={f.id} className="docw-row" role="button" tabIndex={0}
                  onClick={() => goInto(f.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goInto(f.id); } }}
                >
                  <span className="docw-name">
                    📁 {f.name}
                    {r.path && <span className="docw-path-hint">{r.path}</span>}
                  </span>
                  <span>{label && <span className="ial-doc-label-chip">{label.name}</span>}</span>
                  <span className="docw-col-year">{f.year || '—'}</span>
                  <span className="docw-col-updated">{fmtDate(f.createdAt)}</span>
                </div>
              );
            }
            const d = r.doc!;
            const label = d.labelId ? labelsById.get(d.labelId) : null;
            return (
              <div
                key={d.id} className="docw-row" role="button" tabIndex={0}
                onClick={() => openDocFile(d)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDocFile(d); } }}
              >
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
            <button type="button" className="btn btn-sm" onClick={closeDrawer}>סגור</button>
            <h3 style={{ margin: '.8rem 0 .2rem' }}>{drawerDoc.description || drawerDoc.fileName}</h3>
            <div className="csub">מסמך פנימי למשרד · {fmtSize(drawerDoc.fileSize)}</div>

            <div className="ial-doc-fact">
              <label>תווית</label>
              <select value={drawerDoc.labelId ?? ''} onChange={e => saveDrawerMeta({ labelId: e.target.value })}>
                {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
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
            <div className="ial-doc-fact"><b>תיקייה</b><span>{drawerDoc.folderId ? foldersById.get(drawerDoc.folderId)?.name ?? '—' : 'הרמה הראשית'}</span></div>

            <div className="ial-doc-sechead">לקוחות מקושרים</div>
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
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
              <select value={addClientPick} onChange={e => setAddClientPick(e.target.value)} style={{ flex: 1 }}>
                <option value="">קשר ללקוח נוסף…</option>
                {allClients.filter(c => c.id !== client.id && !drawerLinkedClients.includes(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" disabled={!addClientPick} onClick={addClientLink}>קשר</button>
            </div>
            <div className="note" style={{ marginTop: '.5rem' }}>קובץ אחד יכול להיות מקושר לכמה לקוחות — בלי לשכפל אותו.</div>

            <div className="ial-doc-sechead">משימות מקושרות</div>
            {drawerLinkedTasks.length === 0
              ? <div className="csub">אין משימות מקושרות.</div>
              : drawerLinkedTasks.map(t => <div className="ial-doc-fact" key={t.id}><b>{t.title}</b></div>)}
          </div>
        </div>
      )}

      {/* ── ניהול תוויות ─────────────────────────────────────────────── */}
      {labelManagerOpen && (
        <div className="modal-backdrop" onClick={() => setLabelManagerOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>תוויות מקצועיות</h3>
            {labels.map(l => (
              <div key={l.id} className="ial-doc-fact">
                <b>{l.name}{l.isReserved ? ' (שמורה)' : ''}</b>
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
          onChange={meta => setFolderUploadModal({ ...folderUploadModal, meta })}
          onCancel={() => setFolderUploadModal(null)}
          onConfirm={confirmFolderUpload}
          confirmLabel="העלה"
        />
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
            <select className="inp" value={requestModal.labelId} onChange={e => setRequestModal({ ...requestModal, labelId: e.target.value })}>
              <option value="">בחר תווית…</option>
              {labels.filter(l => !l.isReserved).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
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

function MetaFields({ meta, labels, yearOptions, rootRequiresExplicit, onChange }: {
  meta: MetaDraft; labels: DocumentLabel[]; yearOptions: string[]; rootRequiresExplicit: boolean;
  onChange: (m: MetaDraft) => void;
}) {
  return (
    <>
      <label className="lbl required">שנה</label>
      <select className="inp" value={meta.year} onChange={e => onChange({ ...meta, year: e.target.value })}>
        <option value="">בחר שנה…</option>
        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <label className="lbl required">תווית</label>
      <select className="inp" value={meta.labelId} onChange={e => onChange({ ...meta, labelId: e.target.value })}>
        <option value="">בחר תווית…</option>
        {labels.filter(l => !l.isReserved).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        {labels.filter(l => l.isReserved).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      {rootRequiresExplicit ? (
        <div className="note warn">שורש המסמכים — אין תיקייה שממנה לרשת. בחר שנה ותווית.</div>
      ) : (meta.year && meta.labelId) ? (
        <div className="note">נבחר אוטומטית לפי התיקייה. אפשר לשנות.</div>
      ) : null}
    </>
  );
}

function MetaModal({ title, meta, labels, yearOptions, rootRequiresExplicit, note, onChange, onCancel, onConfirm, confirmLabel }: {
  title: string; meta: MetaDraft; labels: DocumentLabel[]; yearOptions: string[]; rootRequiresExplicit: boolean; note?: string;
  onChange: (m: MetaDraft) => void; onCancel: () => void; onConfirm: () => void; confirmLabel: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <MetaFields meta={meta} labels={labels} yearOptions={yearOptions} rootRequiresExplicit={rootRequiresExplicit} onChange={onChange} />
        {note && <div className="note">{note}</div>}
        <div className="foot">
          <button type="button" className="btn btn-primary" disabled={!meta.year || !meta.labelId} onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="btn" onClick={onCancel}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

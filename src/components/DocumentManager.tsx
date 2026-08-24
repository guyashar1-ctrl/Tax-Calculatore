import { useState, useEffect, useRef, useMemo } from 'react';
import { Client } from '../types';
import { useDocumentDB, StoredDoc, DocFolder, DocCategory, DOC_CATEGORY_LABELS, isPlaceholderDoc, withoutSupersededPoa } from '../hooks/useIndexedDB';
import { AVAILABLE_YEARS } from '../data/taxData';
import { analyzeDocument, isGeminiAvailable, AnalysisResult, DocAnalysisType, ExtractedClientData } from '../utils/geminiVision';

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.doc,.docx';

type SortField = 'description' | 'category' | 'year' | 'fileName' | 'uploadedAt' | 'fileSize';
type SortDir = 'asc' | 'desc';

// מיפוי DocCategory ל-DocAnalysisType
const CATEGORY_TO_ANALYSIS: Partial<Record<DocCategory, DocAnalysisType>> = {
  id_card: 'id_card',
  drivers_license: 'drivers_license',
  salary_slip: 'salary_slip',
  form_1301: 'form_1301',
  tax_assessment: 'tax_assessment',
};

interface Props {
  client: Client;
  allClients: Client[];
  onBack: () => void;
  onApplyExtractedData?: (data: ExtractedClientData) => void;
}

function generateSampleDocs(clientId: string): StoredDoc[] {
  const sampleSets: Record<string, { category: DocCategory; year: number | 'general'; description: string; fileName: string; uploadedAt: string }[]> = {
    'sample-1': [
      { category: 'id_card', year: 'general', description: 'צילום תעודת זהות + ספח מעודכן', fileName: 'tz_david_cohen.pdf', uploadedAt: '2024-01-15T10:30:00Z' },
      { category: 'salary_slip', year: 2024, description: 'תלוש שכר דצמבר - חברת הייטק', fileName: 'salary_dec_2024.pdf', uploadedAt: '2025-01-05T09:00:00Z' },
      { category: 'salary_slip', year: 2024, description: 'תלוש שכר ינואר - חברת הייטק', fileName: 'salary_jan_2024.pdf', uploadedAt: '2024-02-03T11:20:00Z' },
      { category: 'pension_statement', year: 2024, description: 'אישור שנתי מנורה מבטחים - הפקדות 2024', fileName: 'pension_menora_2024.pdf', uploadedAt: '2025-02-10T14:00:00Z' },
      { category: 'form_1301', year: 2024, description: 'טופס 1301 מתואם עם רו"ח', fileName: 'form_1301_2024.pdf', uploadedAt: '2025-03-01T08:45:00Z' },
      { category: 'tax_assessment', year: 2023, description: 'שומת מס הכנסה 2023 - סופי', fileName: 'shuma_2023.pdf', uploadedAt: '2024-06-20T16:30:00Z' },
    ],
    'sample-2': [
      { category: 'id_card', year: 'general', description: 'צילום תעודת זהות + ספח עם ילדים', fileName: 'tz_michal_levi.pdf', uploadedAt: '2024-03-10T12:00:00Z' },
      { category: 'salary_slip', year: 2025, description: 'תלוש שכר מרץ - משרד החינוך', fileName: 'salary_mar_2025.pdf', uploadedAt: '2025-04-02T10:15:00Z' },
      { category: 'salary_slip', year: 2024, description: 'סיכום שנתי תלושי שכר 2024', fileName: 'salary_summary_2024.pdf', uploadedAt: '2025-01-15T13:00:00Z' },
      { category: 'ni_document', year: 2024, description: 'אישור הורה יחיד - ביטוח לאומי', fileName: 'single_parent_ni.pdf', uploadedAt: '2024-04-18T09:30:00Z' },
      { category: 'other', year: 2024, description: 'אישור נכות 50% לילד - ועדה רפואית', fileName: 'disability_child_2024.pdf', uploadedAt: '2024-05-22T11:00:00Z' },
    ],
    'sample-3': [
      { category: 'id_card', year: 'general', description: 'צילום תעודת זהות + ספח', fileName: 'tz_yossi_avraham.pdf', uploadedAt: '2023-12-01T10:00:00Z' },
      { category: 'business_document', year: 2024, description: 'דוח רווח והפסד - ייעוץ עסקי ופיננסי', fileName: 'pnl_2024.pdf', uploadedAt: '2025-02-28T15:00:00Z' },
      { category: 'business_document', year: 2024, description: 'אישור עוסק מורשה - מע"מ', fileName: 'vat_cert_2024.pdf', uploadedAt: '2024-01-10T08:30:00Z' },
      { category: 'tax_assessment', year: 2023, description: 'שומת מס 2023 - סופי אושר', fileName: 'shuma_2023_yossi.pdf', uploadedAt: '2024-07-15T14:20:00Z' },
      { category: 'pension_statement', year: 2024, description: 'אישור הפקדות קרן כלל - שנתי', fileName: 'pension_klal_2024.pdf', uploadedAt: '2025-01-20T11:45:00Z' },
      { category: 'business_document', year: 2025, description: 'חשבוניות רבעון 1 - 2025', fileName: 'invoices_q1_2025.pdf', uploadedAt: '2025-04-01T09:00:00Z' },
      { category: 'form_1301', year: 2024, description: 'טופס 1301 שנתי - הוגש דיגיטלית', fileName: 'form_1301_2024_yossi.pdf', uploadedAt: '2025-03-15T16:00:00Z' },
    ],
    'sample-4': [
      { category: 'id_card', year: 'general', description: 'צילום ת.ז. + ספח', fileName: 'tz_orit_shapira.pdf', uploadedAt: '2024-02-05T10:00:00Z' },
      { category: 'salary_slip', year: 2024, description: 'תלוש שכר ממשרד - דצמבר 2024', fileName: 'salary_office_dec24.pdf', uploadedAt: '2025-01-08T09:30:00Z' },
      { category: 'business_document', year: 2024, description: 'דוח הכנסות הדרכה עצמאית 2024', fileName: 'freelance_income_2024.pdf', uploadedAt: '2025-02-20T14:00:00Z' },
      { category: 'other', year: 2024, description: 'אישור תיאום מס - שני מקורות הכנסה', fileName: 'tax_coord_2024.pdf', uploadedAt: '2024-03-12T11:00:00Z' },
    ],
    'sample-5': [
      { category: 'id_card', year: 'general', description: 'צילום תעודת זהות - עולה חדשה', fileName: 'tz_natasha.pdf', uploadedAt: '2023-08-15T10:00:00Z' },
      { category: 'other', year: 'general', description: 'תעודת עלייה - 2023', fileName: 'aliyah_cert_2023.pdf', uploadedAt: '2023-08-20T12:00:00Z' },
      { category: 'salary_slip', year: 2025, description: 'תלוש שכר פברואר 2025', fileName: 'salary_feb_2025_natasha.pdf', uploadedAt: '2025-03-05T09:00:00Z' },
      { category: 'ni_document', year: 2024, description: 'אישור זכאות הנחות עולה חדש - ב"ל', fileName: 'ni_oleh_2024.pdf', uploadedAt: '2024-04-10T13:30:00Z' },
    ],
    'sample-6': [
      { category: 'id_card', year: 'general', description: 'צילום ת.ז. + ספח עם 4 ילדים', fileName: 'tz_mohammad.pdf', uploadedAt: '2023-11-01T10:00:00Z' },
      { category: 'residence_certificate', year: 2024, description: 'אישור מגורים בשדרות - ישוב מזכה', fileName: 'residence_sderot_2024.pdf', uploadedAt: '2024-01-25T11:00:00Z' },
      { category: 'ni_document', year: 2024, description: 'אישור נכות 35% - תאונת עבודה', fileName: 'disability_35_ni.pdf', uploadedAt: '2024-02-14T09:45:00Z' },
      { category: 'salary_slip', year: 2024, description: 'סיכום שנתי תלושי שכר 2024', fileName: 'salary_summary_2024_moh.pdf', uploadedAt: '2025-01-12T10:30:00Z' },
      { category: 'pension_statement', year: 2024, description: 'אישור הפקדות פסגות 2024', fileName: 'pension_psagot_2024.pdf', uploadedAt: '2025-02-05T14:00:00Z' },
    ],
    'sample-7': [
      { category: 'id_card', year: 'general', description: 'צילום תעודת זהות', fileName: 'tz_ron_barlev.pdf', uploadedAt: '2023-10-15T10:00:00Z' },
      { category: 'business_document', year: 2024, description: 'דוח רווח והפסד - משרד עו"ד', fileName: 'pnl_2024_ron.pdf', uploadedAt: '2025-02-25T15:00:00Z' },
      { category: 'business_document', year: 2024, description: 'רישיון עו"ד + אישור עוסק מורשה', fileName: 'lawyer_license.pdf', uploadedAt: '2024-01-05T08:30:00Z' },
      { category: 'tax_assessment', year: 2023, description: 'שומת מס 2023 - היטל עושר', fileName: 'shuma_surtax_2023.pdf', uploadedAt: '2024-08-01T16:00:00Z' },
      { category: 'pension_statement', year: 2024, description: 'אישור קרן השתלמות אנליסט', fileName: 'keren_analyst_2024.pdf', uploadedAt: '2025-01-18T11:00:00Z' },
      { category: 'form_1301', year: 2024, description: 'טופס 1301 - כולל נספח שכירות', fileName: 'form_1301_2024_ron.pdf', uploadedAt: '2025-03-20T09:00:00Z' },
      { category: 'business_document', year: 2025, description: 'חשבוניות רבעון 1 - 2025', fileName: 'invoices_q1_2025_ron.pdf', uploadedAt: '2025-04-02T10:00:00Z' },
    ],
  };

  const items = sampleSets[clientId];
  if (!items) return [];

  return items.map((item, i) => ({
    id: `fake-${clientId}-${i}`,
    clientId,
    fileName: item.fileName,
    fileType: 'application/pdf',
    fileSize: Math.floor(Math.random() * 900000) + 100000,
    category: item.category,
    year: item.year,
    uploadedAt: item.uploadedAt,
    description: item.description,
    notes: '',
    fileData: new ArrayBuffer(0),
  }));
}

const baseName = (fileName: string) => fileName.replace(/\.[^./\\]+$/, '') || fileName;

export default function DocumentManager({ client, allClients, onBack, onApplyExtractedData }: Props) {
  const db = useDocumentDB();
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // ── תיקיות ──
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameFolderTarget, setRenameFolderTarget] = useState<DocFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [moveModal, setMoveModal] = useState<{ docIds: string[] } | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>('');
  const [moving, setMoving] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderUpload, setFolderUpload] = useState<{ rootName: string; files: File[] } | null>(null);
  const [folderUpCat, setFolderUpCat] = useState<DocCategory>('other');
  const [folderUpYear, setFolderUpYear] = useState<number | 'general'>('general');
  const [folderProgress, setFolderProgress] = useState<{ done: number; total: number } | null>(null);

  // Filters
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterText, setFilterText] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('uploadedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Selection for bulk copy
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Copy modal
  const [copyModal, setCopyModal] = useState<{ docIds: string[] } | null>(null);
  const [copyTargetId, setCopyTargetId] = useState<string>('');
  const [copyEditDesc, setCopyEditDesc] = useState('');
  const [copyEditCat, setCopyEditCat] = useState<DocCategory>('other');
  const [copyEditYear, setCopyEditYear] = useState<number | 'general'>('general');
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');

  // Edit modal — לעריכת מטא-נתונים של מסמך קיים
  const [editModal, setEditModal] = useState<StoredDoc | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCat, setEditCat] = useState<DocCategory>('other');
  const [editYear, setEditYear] = useState<number | 'general'>('general');
  const [editNotes, setEditNotes] = useState('');
  const [editFolderId, setEditFolderId] = useState<string>('');
  const [editReplaceFile, setEditReplaceFile] = useState<File | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Preview
  const [preview, setPreview] = useState<{ doc: StoredDoc; url: string } | null>(null);

  // AI Analysis
  const [analyzing, setAnalyzing] = useState<string | null>(null); // doc id being analyzed
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const geminiAvailable = isGeminiAvailable();

  // Upload form state
  const [upCategory, setUpCategory] = useState<DocCategory>('other');
  const [upYear, setUpYear] = useState<number | 'general'>('general');
  const [upDescription, setUpDescription] = useState('');
  const [upNotes, setUpNotes] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // טעינה רגילה כשהלקוח משתנה
  useEffect(() => {
    setCurrentFolderId(null);
    loadDocs();
    loadFolders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  // האזנה ל-event גלובלי 'crm:docs-changed' — נשלח אחרי upload/delete מכל מקום באפליקציה.
  // ככה אם המשתמש העלה מסמך ממסך אחר (למשל ממשימה במודל), הרשימה כאן תתעדכן.
  useEffect(() => {
    function handleChange(e: Event) {
      const ce = e as CustomEvent<{ clientId?: string }>;
      // נטען מחדש אם זה הלקוח שלנו (או אם לא צוין clientId)
      if (!ce.detail?.clientId || ce.detail.clientId === client.id) {
        loadDocs();
        loadFolders();
      }
    }
    window.addEventListener('crm:docs-changed', handleChange);
    return () => window.removeEventListener('crm:docs-changed', handleChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  function loadFolders() {
    db.getFoldersByClient(client.id).then(f => {
      setFolders(f);
      // אם התיקייה שהיינו בתוכה נמחקה (או שייכת ללקוח אחר) — חוזרים לרמה הראשית
      setCurrentFolderId(prev => (prev && !f.some(x => x.id === prev) ? null : prev));
    });
  }

  function loadDocs() {
    db.getDocsByClient(client.id).then(d => {
      console.log('[DocumentManager] loaded', d.length, 'docs for client', client.id);
      let allDocs = withoutSupersededPoa(d);
      if (d.length === 0 && client.id.startsWith('sample-')) {
        const fakes = generateSampleDocs(client.id);
        allDocs = [...allDocs, ...fakes];
        // מסמכי דמה לנתוני הדוגמה בלבד. אם השמירה נכשלת (למשל כשנכנסים ישר
        // לכתובת של לשונית המסמכים והחיבור עוד לא הסתיים) — הם עדיין מוצגים,
        // ואין טעם להפיל על זה שגיאה.
        fakes.forEach(doc => { void db.saveDoc(doc).catch(() => {}); });
      }
      setDocs(allDocs);
      setLoading(false);
    });
  }

  // Sort toggle
  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'uploadedAt' ? 'desc' : 'asc');
    }
  }

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="sort-icon inactive">{'\u21C5'}</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  // ── עזרי תיקיות ──
  const foldersById = useMemo(() => {
    const m = new Map<string, DocFolder>();
    folders.forEach(f => m.set(f.id, f));
    return m;
  }, [folders]);

  // הנתיב מהרמה הראשית ועד התיקייה הנוכחית — לפירורי הלחם
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

  const folderPathText = (folderId: string | null | undefined): string => {
    const names: string[] = [];
    let id = folderId ?? null;
    const guard = new Set<string>();
    while (id && !guard.has(id)) {
      guard.add(id);
      const f = foldersById.get(id);
      if (!f) break;
      names.unshift(f.name);
      id = f.parentId;
    }
    return names.join(' / ');
  };

  const childFolders = useMemo(
    () => folders
      .filter(f => (f.parentId ?? null) === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [folders, currentFolderId],
  );

  // רשימה שטוחה של כל התיקיות, בסדר היררכי — לתפריטי "העבר לתיקייה"
  const folderOptions = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      folders
        .filter(f => (f.parentId ?? null) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .forEach(f => {
          out.push({ id: f.id, label: `${'  '.repeat(depth)}${depth ? '↳ ' : ''}${f.name}` });
          walk(f.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }, [folders]);

  // כמה פריטים יש בתוך תיקייה, כולל תת-תיקיות — כדי שהשורה תגיד משהו
  const folderItemCount = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    folders.forEach(f => {
      const key = f.parentId ?? '';
      childrenOf.set(key, [...(childrenOf.get(key) || []), f.id]);
    });
    const docsIn = new Map<string, number>();
    docs.forEach(d => {
      const key = d.folderId ?? '';
      docsIn.set(key, (docsIn.get(key) || 0) + 1);
    });
    const counts = new Map<string, number>();
    const walk = (id: string): number => {
      if (counts.has(id)) return counts.get(id)!;
      counts.set(id, 0); // שובר לולאה אם איכשהו נוצר מעגל
      const total = (docsIn.get(id) || 0) + (childrenOf.get(id) || []).reduce((s, c) => s + walk(c), 0);
      counts.set(id, total);
      return total;
    };
    folders.forEach(f => walk(f.id));
    return counts;
  }, [folders, docs]);

  // חיפוש חוצה תיקיות: כשמחפשים, מציגים תוצאות מכל התיקיות ולא רק מהנוכחית
  const searching = filterText.trim().length > 0;

  // Filter + sort
  const filtered = useMemo(() => {
    let list = docs.filter(d => {
      if (!searching && (d.folderId ?? null) !== currentFolderId) return false;
      if (filterYear !== 'all' && String(d.year) !== filterYear) return false;
      if (filterCat !== 'all' && d.category !== filterCat) return false;
      if (filterText) {
        const q = filterText.toLowerCase();
        const match =
          d.fileName.toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q) ||
          (d.notes || '').toLowerCase().includes(q) ||
          DOC_CATEGORY_LABELS[d.category].toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'description':
          cmp = (a.description || a.fileName).localeCompare(b.description || b.fileName, 'he');
          break;
        case 'category':
          cmp = DOC_CATEGORY_LABELS[a.category].localeCompare(DOC_CATEGORY_LABELS[b.category], 'he');
          break;
        case 'year': {
          const ya = a.year === 'general' ? 0 : a.year;
          const yb = b.year === 'general' ? 0 : b.year;
          cmp = ya - yb;
          break;
        }
        case 'fileName':
          cmp = a.fileName.localeCompare(b.fileName);
          break;
        case 'uploadedAt':
          cmp = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
          break;
        case 'fileSize':
          cmp = a.fileSize - b.fileSize;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [docs, filterYear, filterCat, filterText, sortField, sortDir, currentFolderId, searching]);

  // Stats
  const yearCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    docs.forEach(d => { const k = String(d.year); counts[k] = (counts[k] || 0) + 1; });
    return counts;
  }, [docs]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    docs.forEach(d => { counts[d.category] = (counts[d.category] || 0) + 1; });
    return counts;
  }, [docs]);

  const activeFilters = (filterYear !== 'all' ? 1 : 0) + (filterCat !== 'all' ? 1 : 0) + (filterText ? 1 : 0);

  // פילטר מוצג רק כשיש בו ברירה — שנה אחת או קטגוריה אחת הן לא סינון.
  const yearOptions = useMemo(() => {
    const keys = Object.keys(yearCounts);
    const years = keys.filter(k => k !== 'general').sort((a, b) => Number(b) - Number(a));
    return keys.includes('general') ? [...years, 'general'] : years;
  }, [yearCounts]);

  const catOptions = useMemo(
    () => (Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).filter(k => catCounts[k]),
    [catCounts],
  );

  const showSearch = docs.length >= 5;
  const showFilterBar = showSearch || yearOptions.length > 1 || catOptions.length > 1 || activeFilters > 0;

  // Upload
  function validateUpload(): string[] {
    const errors: string[] = [];
    if (!upDescription.trim()) errors.push('יש להזין תיאור למסמך');
    if (!fileRef.current?.files?.length) errors.push('יש לבחור קובץ');
    return errors;
  }

  async function handleUpload() {
    const files = fileRef.current?.files;
    if (!files || !files.length) return;
    const errors = validateUpload();
    if (errors.length) { setFormErrors(errors); return; }
    setFormErrors([]);
    setUploading(true);
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      const doc: StoredDoc = {
        id: crypto.randomUUID(),
        clientId: client.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        category: upCategory,
        year: upYear,
        uploadedAt: new Date().toISOString(),
        description: upDescription.trim(),
        notes: upNotes,
        fileData: buf,
        folderId: currentFolderId,
      };
      await db.saveDoc(doc);
      setDocs(prev => [...prev, doc]);
    }
    setUploading(false);
    setShowUploadForm(false);
    setUpDescription('');
    setUpNotes('');
    setUpCategory('other');
    setUpYear('general');
    if (fileRef.current) fileRef.current.value = '';
  }

  // ─── פעולות תיקייה ────────────────────────────────────────────────────
  async function submitNewFolder() {
    const name = newFolderName.trim();
    if (!name) { setFolderError('יש להזין שם לתיקייה'); return; }
    setFolderBusy(true);
    setFolderError('');
    try {
      const created = await db.createFolder(client.id, name, currentFolderId);
      setFolders(prev => (prev.some(f => f.id === created.id) ? prev : [...prev, created]));
      setNewFolderOpen(false);
      setNewFolderName('');
    } catch (err: any) {
      setFolderError(err?.message || 'יצירת התיקייה נכשלה');
    } finally {
      setFolderBusy(false);
    }
  }

  async function submitRenameFolder() {
    if (!renameFolderTarget) return;
    const name = renameFolderName.trim();
    if (!name) { setFolderError('שם התיקייה לא יכול להיות ריק'); return; }
    setFolderBusy(true);
    setFolderError('');
    try {
      await db.renameFolder(renameFolderTarget.id, name);
      setFolders(prev => prev.map(f => (f.id === renameFolderTarget.id ? { ...f, name } : f)));
      setRenameFolderTarget(null);
    } catch (err: any) {
      setFolderError(err?.message || 'שינוי השם נכשל');
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleDeleteFolder(folder: DocFolder) {
    const count = folderItemCount.get(folder.id) || 0;
    const msg = count > 0
      ? `למחוק את התיקייה "${folder.name}"?\n\n${count} המסמכים שבתוכה לא יימחקו - הם יעברו לרמה הראשית של המסמכים.`
      : `למחוק את התיקייה "${folder.name}"?`;
    if (!confirm(msg)) return;
    try {
      await db.deleteFolder(folder.id);
      loadFolders();
      loadDocs();
    } catch (err: any) {
      alert(err?.message || 'מחיקת התיקייה נכשלה');
    }
  }

  // ─── העלאת תיקייה שלמה מהמחשב ─────────────────────────────────────────
  function handleFolderPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    // מדלגים על קבצים נסתרים (.DS_Store, Thumbs.db וכו') — הם רק רעש ברשימה
    const files = picked.filter(f => !f.name.startsWith('.') && f.name !== 'Thumbs.db');
    if (files.length === 0) {
      if (picked.length > 0) alert('לא נמצאו קבצים להעלאה בתיקייה שנבחרה');
      return;
    }
    const relPath = (files[0] as any).webkitRelativePath as string | undefined;
    const rootName = relPath ? relPath.split('/')[0] : 'תיקייה חדשה';
    setFolderUpCat('other');
    setFolderUpYear('general');
    setFolderProgress(null);
    setFolderUpload({ rootName, files });
  }

  async function executeFolderUpload() {
    if (!folderUpload) return;
    setFolderBusy(true);
    setFolderError('');
    const pathToId = new Map<string, string>();
    const created: DocFolder[] = [];

    async function ensurePath(segments: string[]): Promise<string | null> {
      let parent = currentFolderId;
      let key = '';
      for (const seg of segments) {
        key = key ? `${key}/${seg}` : seg;
        const known = pathToId.get(key);
        if (known) { parent = known; continue; }
        const folder = await db.createFolder(client.id, seg, parent);
        pathToId.set(key, folder.id);
        created.push(folder);
        parent = folder.id;
      }
      return parent;
    }

    const total = folderUpload.files.length;
    let done = 0;
    const failedFiles: string[] = [];
    const newDocs: StoredDoc[] = [];

    try {
      for (const file of folderUpload.files) {
        setFolderProgress({ done, total });
        const relPath = ((file as any).webkitRelativePath as string) || file.name;
        const segments = relPath.split('/').filter(Boolean);
        const dirSegments = segments.slice(0, -1);
        try {
          const folderId = await ensurePath(dirSegments);
          const buf = await file.arrayBuffer();
          const doc: StoredDoc = {
            id: crypto.randomUUID(),
            clientId: client.id,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
            category: folderUpCat,
            year: folderUpYear,
            uploadedAt: new Date().toISOString(),
            description: baseName(file.name),
            notes: '',
            fileData: buf,
            folderId,
          };
          await db.saveDoc(doc);
          newDocs.push({ ...doc, fileData: new ArrayBuffer(0), _remote: true });
        } catch (err) {
          console.error('folder upload failed for', relPath, err);
          failedFiles.push(file.name);
        }
        done++;
        setFolderProgress({ done, total });
      }

      setFolders(prev => {
        const known = new Set(prev.map(f => f.id));
        return [...prev, ...created.filter(f => !known.has(f.id))];
      });
      setDocs(prev => [...prev, ...newDocs]);
      // נכנסים לתיקייה שנוצרה — כדי שרואים מיד את מה שעלה
      const rootId = pathToId.get(folderUpload.rootName);
      if (rootId) setCurrentFolderId(rootId);

      setFolderUpload(null);
      setFolderProgress(null);
      if (folderInputRef.current) folderInputRef.current.value = '';
      if (failedFiles.length > 0) {
        alert(`הועלו ${newDocs.length} קבצים. ${failedFiles.length} נכשלו:\n${failedFiles.slice(0, 10).join('\n')}`);
      }
    } catch (err: any) {
      setFolderError(err?.message || 'העלאת התיקייה נכשלה');
    } finally {
      setFolderBusy(false);
    }
  }

  // ─── העברת מסמכים לתיקייה ─────────────────────────────────────────────
  function openMoveModal(docIds: string[]) {
    const first = docs.find(d => d.id === docIds[0]);
    setMoveTarget(docIds.length === 1 ? (first?.folderId ?? '') : (currentFolderId ?? ''));
    setMoveModal({ docIds });
  }

  async function executeMove() {
    if (!moveModal) return;
    const target = moveTarget === '' ? null : moveTarget;
    // מסמכי דמה (sample) לא קיימים באמת בשרת — אין מה להעביר
    const ids = moveModal.docIds.filter(id => {
      const d = docs.find(x => x.id === id);
      return d && !isPlaceholderDoc(d);
    });
    if (ids.length === 0) { setMoveModal(null); return; }
    setMoving(true);
    try {
      await db.moveDocsToFolder(ids, target);
      setDocs(prev => prev.map(d => (ids.includes(d.id) ? { ...d, folderId: target } : d)));
      setSelected(new Set());
      setMoveModal(null);
    } catch (err: any) {
      alert(err?.message || 'ההעברה נכשלה');
    } finally {
      setMoving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק מסמך זה?')) return;
    await db.deleteDoc(id);
    setDocs(prev => prev.filter(d => d.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (preview?.doc.id === id) { URL.revokeObjectURL(preview.url); setPreview(null); }
  }

  // מחיקה במקבץ של כל המסמכים שסומנו
  const [bulkDeleting, setBulkDeleting] = useState(false);
  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const msg = ids.length === 1
      ? 'למחוק את המסמך שנבחר?'
      : `למחוק ${ids.length} מסמכים שנבחרו? פעולה זו לא ניתנת לביטול.`;
    if (!confirm(msg)) return;

    setBulkDeleting(true);
    let deleted = 0, failed = 0;
    for (const id of ids) {
      try {
        await db.deleteDoc(id);
        deleted++;
      } catch (err) {
        console.error('bulk delete failed for', id, err);
        failed++;
      }
    }
    setDocs(prev => prev.filter(d => !ids.includes(d.id)));
    setSelected(new Set());
    if (preview && ids.includes(preview.doc.id)) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
    setBulkDeleting(false);
    if (failed > 0) {
      alert(`נמחקו ${deleted}, נכשלו ${failed}. ראה קונסול לפרטים.`);
    }
  }

  // ── עריכת מטא-נתונים של מסמך קיים ──
  function openEditModal(doc: StoredDoc) {
    if (isPlaceholderDoc(doc)) return;
    setEditModal(doc);
    setEditFileName(doc.fileName);
    setEditDesc(doc.description || '');
    setEditCat(doc.category);
    setEditYear(doc.year);
    setEditNotes(doc.notes || '');
    setEditFolderId(doc.folderId ?? '');
    setEditReplaceFile(null);
    if (editFileRef.current) editFileRef.current.value = '';
  }
  function closeEditModal() {
    setEditModal(null);
    setEditReplaceFile(null);
    if (editFileRef.current) editFileRef.current.value = '';
  }
  // בחירת קובץ חלופי בעריכה — משנה גם את שם הקובץ המוצג (אלא אם המשתמש שינה אותו ידנית)
  function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setEditReplaceFile(file);
    if (file && (!editFileName.trim() || editFileName === editModal?.fileName)) {
      setEditFileName(file.name);
    }
  }
  async function saveEdit() {
    if (!editModal) return;
    if (!editFileName.trim()) { alert('שם הקובץ לא יכול להיות ריק'); return; }
    if (!editDesc.trim())     { alert('יש להזין תיאור'); return; }
    if (!editCat)             { alert('יש לבחור קטגוריה'); return; }
    if (editYear === undefined || editYear === null) { alert('יש לבחור שנה'); return; }

    setSavingEdit(true);
    try {
      // אם נבחר קובץ חלופי — קוראים את הבייטים שלו ומחליפים את הקובץ באחסון
      // (saveDoc דורס את הקובץ הקיים באותו נתיב). אחרת — שולחים בייטים ריקים
      // ומעדכנים רק מטא-נתונים.
      let fileData = new ArrayBuffer(0);
      let fileType = editModal.fileType;
      let fileSize = editModal.fileSize;
      let uploadedAt = editModal.uploadedAt;
      if (editReplaceFile) {
        fileData = await editReplaceFile.arrayBuffer();
        fileType = editReplaceFile.type || editModal.fileType;
        fileSize = editReplaceFile.size;
        uploadedAt = new Date().toISOString();
      }

      const updated: StoredDoc = {
        ...editModal,
        fileName: editFileName.trim(),
        description: editDesc.trim(),
        category: editCat,
        year: editYear,
        notes: editNotes,
        folderId: editFolderId === '' ? null : editFolderId,
        fileType,
        fileSize,
        uploadedAt,
        fileData,
      };
      await db.saveDoc(updated);
      // עדכון מקומי של הרשימה — בלי הבייטים (חוסך זיכרון; ייטענו בעת תצוגה/הורדה)
      setDocs(prev => prev.map(d => d.id === updated.id ? { ...updated, fileData: new ArrayBuffer(0), _remote: true } : d));
      // אם המסמך שהוחלף פתוח בתצוגה מקדימה — סוגרים כדי לא להציג בייטים ישנים
      if (editReplaceFile && preview?.doc.id === updated.id) {
        URL.revokeObjectURL(preview.url);
        setPreview(null);
      }
      closeEditModal();
    } catch (err: any) {
      console.error('saveEdit failed', err);
      alert(`שגיאה בשמירה: ${err?.message || err}`);
    } finally {
      setSavingEdit(false);
    }
  }

  // עוזר: מוודא שלמסמך יש בייטים בזיכרון. אם הוא רק מטא-נתונים (חוזר מ-getDocsByClient),
  // מוריד את הקובץ מהאחסון בענן. מחזיר undefined אם זה דמה (sample) ללא קובץ.
  async function ensureBytes(doc: StoredDoc): Promise<StoredDoc | undefined> {
    if (doc.fileData.byteLength > 0) return doc;
    if (isPlaceholderDoc(doc)) return undefined;
    const full = await db.getDoc(doc.id);
    return full && full.fileData.byteLength > 0 ? full : undefined;
  }

  async function handlePreview(doc: StoredDoc) {
    if (preview?.doc.id === doc.id) { URL.revokeObjectURL(preview.url); setPreview(null); return; }
    const full = await ensureBytes(doc);
    if (!full) return;
    if (preview) URL.revokeObjectURL(preview.url);
    const blob = new Blob([full.fileData], { type: full.fileType });
    const url = URL.createObjectURL(blob);
    setPreview({ doc: full, url });
  }

  async function handleDownload(doc: StoredDoc) {
    const full = await ensureBytes(doc);
    if (!full) return;
    const blob = new Blob([full.fileData], { type: full.fileType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = full.fileName; a.click();
    URL.revokeObjectURL(url);
  }

  // AI Analysis
  async function handleAnalyze(doc: StoredDoc) {
    const full = await ensureBytes(doc);
    if (!full) return;
    setAnalyzing(full.id);
    setAnalysisResult(null);
    const docAnalysisType = CATEGORY_TO_ANALYSIS[full.category] || 'general';
    const result = await analyzeDocument(full.fileData, full.fileType, docAnalysisType);
    setAnalysisResult(result);
    setAnalyzing(null);
  }

  // Selection
  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(d => d.id)));
    }
  }

  // Copy modal
  function openCopyModal(docIds: string[]) {
    if (docIds.length === 1) {
      const doc = docs.find(d => d.id === docIds[0]);
      if (doc) {
        setCopyEditDesc(doc.description || '');
        setCopyEditCat(doc.category);
        setCopyEditYear(doc.year);
      }
    } else {
      setCopyEditDesc('');
      setCopyEditCat('other');
      setCopyEditYear('general');
    }
    setCopyTargetId('');
    setCopySuccess('');
    setCopyModal({ docIds });
  }

  async function executeCopy() {
    if (!copyModal || !copyTargetId) return;
    setCopying(true);
    const docsToClone = copyModal.docIds.map(id => docs.find(d => d.id === id)).filter(Boolean) as StoredDoc[];
    const newDocs: StoredDoc[] = [];
    for (const docMeta of docsToClone) {
      // הרשימה מחזיקה מטא-נתונים בלבד; בלי הבייטים ההעתק היה נוצר בלי קובץ
      const doc = (await ensureBytes(docMeta)) ?? docMeta;
      const newDoc: StoredDoc = {
        ...doc,
        id: crypto.randomUUID(),
        clientId: copyTargetId,
        // תיקייה שייכת ללקוח מסוים — העתקה ללקוח אחר נוחתת אצלו ברמה הראשית
        folderId: copyTargetId === client.id ? (doc.folderId ?? null) : null,
        uploadedAt: new Date().toISOString(),
        description: copyModal.docIds.length === 1 ? copyEditDesc || doc.description : doc.description,
        category: copyModal.docIds.length === 1 ? copyEditCat : doc.category,
        year: copyModal.docIds.length === 1 ? copyEditYear : doc.year,
      };
      await db.saveDoc(newDoc);
      newDocs.push({ ...newDoc, fileData: new ArrayBuffer(0), _remote: true });
    }
    // If copied to same client, add to current docs list
    if (copyTargetId === client.id) {
      setDocs(prev => [...prev, ...newDocs]);
    }
    const targetName = allClients.find(c => c.id === copyTargetId);
    const isSelf = copyTargetId === client.id;
    setCopying(false);
    setCopySuccess(
      newDocs.length === 1
        ? `המסמך ${isSelf ? 'שוכפל' : 'הועתק ל' + (targetName ? targetName.firstName + ' ' + targetName.lastName : 'לקוח אחר')}`
        : `${newDocs.length} מסמכים ${isSelf ? 'שוכפלו' : 'הועתקו ל' + (targetName ? targetName.firstName + ' ' + targetName.lastName : 'לקוח אחר')}`
    );
    setTimeout(() => { setCopyModal(null); setCopySuccess(''); setSelected(new Set()); }, 1800);
  }

  // Preview bar
  const isPreviewOpen = preview !== null;
  const previewDoc = preview?.doc;
  const isImage = previewDoc?.fileType.startsWith('image/');
  const isPDF = previewDoc?.fileType === 'application/pdf';

  return (
    <div>
      {/* כותרת אחת, לפי מסך 09: השם והמונה באותה שורה, הפעולה הראשית בקצה.
          קודם היו כאן שלוש שורות — קישור חזרה, כותרת עם אמוג'י ושורת מונה —
          שלוש רמות היררכיה על מסך שיש בו דבר אחד. */}
      <div className="pg-head">
        <div className="pg-head-main">
          <div className="doc-title-row">
            <span className="pg-title">מסמכי {client.firstName} {client.lastName}</span>
            <span className="pg-count">{docs.length}</span>
          </div>
          <button type="button" className="doc-back-link" onClick={onBack}>{'←'} חזרה לפרטי לקוח</button>
        </div>
        <div className="pg-actions">
          <button className="btn btn-secondary" onClick={() => { setFolderError(''); setNewFolderName(''); setNewFolderOpen(true); }}>
            {'📁'} תיקייה חדשה
          </button>
          <button className="btn btn-secondary" onClick={() => folderInputRef.current?.click()}>
            {'⬆️'} העלאת תיקייה
          </button>
          <button className="btn btn-primary" onClick={() => setShowUploadForm(s => !s)}>
            {showUploadForm ? 'ביטול' : 'העלאת מסמך'}
          </button>
        </div>
      </div>

      {/* בורר תיקייה מהמחשב — מוסתר, נפתח מהכפתור למעלה.
          webkitdirectory הוא התכונה שמאפשרת לבחור תיקייה שלמה; React לא מכיר
          אותה בטיפוסים ולכן היא מוזרקת כאן. */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderPicked}
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      {/* פירורי לחם — הנתיב בתוך התיקיות */}
      {(breadcrumb.length > 0 || childFolders.length > 0) && (
        <div className="doc-breadcrumb">
          <button
            type="button"
            className={`doc-crumb ${currentFolderId === null ? 'is-current' : ''}`}
            onClick={() => setCurrentFolderId(null)}
          >
            {'📂'} כל המסמכים
          </button>
          {breadcrumb.map((f, i) => (
            <span key={f.id} className="doc-crumb-wrap">
              <span className="doc-crumb-sep">{'›'}</span>
              <button
                type="button"
                className={`doc-crumb ${i === breadcrumb.length - 1 ? 'is-current' : ''}`}
                onClick={() => setCurrentFolderId(f.id)}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Upload form */}
      {showUploadForm && (
        <div className="card doc-upload-card">
          {currentFolderId && (
            <div className="doc-upload-target">
              {'📁'} המסמך ייכנס לתיקייה: <strong>{folderPathText(currentFolderId)}</strong>
            </div>
          )}
          <div className="card-header"><span className="card-title">{'\u2B06\uFE0F'} העלאת מסמך חדש</span></div>
          <div className="card-body">
            {formErrors.length > 0 && (
              <div className="alert alert-warning" style={{ marginBottom: '.75rem' }}>
                {formErrors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <div className="form-grid form-grid-3">
              <div className="form-group">
                <label className="required">קטגוריה</label>
                <select value={upCategory} onChange={e => setUpCategory(e.target.value as DocCategory)}>
                  {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map(k => (
                    <option key={k} value={k}>{DOC_CATEGORY_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="required">שנה רלוונטית</label>
                <select value={String(upYear)} onChange={e => setUpYear(e.target.value === 'general' ? 'general' : +e.target.value)}>
                  <option value="general">כללי (לא תלוי שנה)</option>
                  {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="required">תיאור המסמך</label>
                <input value={upDescription} onChange={e => setUpDescription(e.target.value)} placeholder="למשל: תלוש שכר ינואר 2024..." />
              </div>
              <div className="form-group">
                <label>הערות נוספות</label>
                <input value={upNotes} onChange={e => setUpNotes(e.target.value)} placeholder="הערה אופציונלית..." />
              </div>
              <div className="form-group span-2">
                <label className="required">בחר קובץ (PDF, תמונה, Word)</label>
                <input ref={fileRef} type="file" accept={FILE_ACCEPT} multiple disabled={uploading} />
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem' }}>
              <button className="btn btn-primary" disabled={uploading} onClick={handleUpload}>
                {uploading ? 'מעלה...' : '\u2B06\uFE0F העלה מסמך'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowUploadForm(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilterBar && (
        <div className="doc-filters">
          {showSearch && (
          <div className="doc-filter-search">
            <span className="doc-filter-icon">{'\uD83D\uDD0D'}</span>
            <input
              type="text"
              placeholder="חיפוש חופשי..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
          </div>
          )}
          {yearOptions.length > 1 && (
            <select className="doc-filter-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="all">כל השנים</option>
              {yearOptions.map(y => (
                <option key={y} value={y}>{y === 'general' ? 'כללי' : y} ({yearCounts[y]})</option>
              ))}
            </select>
          )}
          {catOptions.length > 1 && (
            <select className="doc-filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">כל הקטגוריות</option>
              {catOptions.map(k => (
                <option key={k} value={k}>{DOC_CATEGORY_LABELS[k]} ({catCounts[k]})</option>
              ))}
            </select>
          )}
          {activeFilters > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterYear('all'); setFilterCat('all'); setFilterText(''); }}>
              {'\u2715'} נקה סינון ({activeFilters})
            </button>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="doc-bulk-bar">
          <span>{selected.size} מסמכים נבחרו</span>
          <button className="btn btn-secondary btn-sm" onClick={() => openMoveModal(Array.from(selected))} disabled={bulkDeleting}>
            {'📁'} העברה לתיקייה
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => openCopyModal(Array.from(selected))} disabled={bulkDeleting}>
            {'\uD83D\uDCCB'} שכפול / העתקה
          </button>
          <button
            className="btn btn-sm doc-bulk-delete"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            title="מחיקה לצמיתות של כל המסמכים שנבחרו"
          >
            {bulkDeleting ? '\u23F3 מוחק...' : `\uD83D\uDDD1 מחק ${selected.size}`}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>
            {'\u2715'} בטל בחירה
          </button>
        </div>
      )}

      {/* Results info */}
      {activeFilters > 0 && filtered.length !== docs.length && (
        <div style={{ fontSize: '.8125rem', color: 'var(--gray-500)', marginBottom: '.75rem' }}>
          מציג {filtered.length} מתוך {docs.length} מסמכים
        </div>
      )}

      {/* Document table */}
      {loading ? (
        <div className="doc-loading">
          <div className="doc-loading-spinner" />
          <span>טוען מסמכים...</span>
        </div>
      ) : docs.length === 0 && folders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\uD83D\uDCC4'}</div>
          <div className="empty-state-title">אין מסמכים עדיין</div>
          <div className="empty-state-desc">לחץ "העלאת מסמך" להוספת המסמך הראשון, או "תיקייה חדשה" כדי לארגן מראש</div>
        </div>
      ) : filtered.length === 0 && (searching || activeFilters > 0 || childFolders.length === 0) ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\uD83D\uDD0D'}</div>
          <div className="empty-state-title">
            {searching || activeFilters > 0 ? 'לא נמצאו מסמכים' : 'התיקייה ריקה'}
          </div>
          <div className="empty-state-desc">
            {searching || activeFilters > 0
              ? 'נסה לשנות את הסינון'
              : 'העלה לכאן מסמך, או סמן מסמכים קיימים והעבר אותם לתיקייה'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--blue)' }}
                    />
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('description')}>
                    <span>תיאור</span> {sortIcon('description')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('category')}>
                    <span>קטגוריה</span> {sortIcon('category')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('year')}>
                    <span>שנה</span> {sortIcon('year')}
                  </th>
                  <th className="th-sortable" onClick={() => toggleSort('uploadedAt')}>
                    <span>תאריך העלאה</span> {sortIcon('uploadedAt')}
                  </th>
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('fileSize')}>
                    <span>גודל</span> {sortIcon('fileSize')}
                  </th>
                  <th style={{ width: 140 }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {/* תיקיות ראשונות — ובחיפוש מוותרים עליהן, כי אז מציגים תוצאות מכל התיקיות */}
                {!searching && childFolders.map(folder => (
                  <tr key={`folder-${folder.id}`} className="doc-row doc-folder-row">
                    <td />
                    <td colSpan={4} onClick={() => setCurrentFolderId(folder.id)}>
                      <button type="button" className="doc-folder-open">
                        <span className="doc-folder-icon">{'📁'}</span>
                        <span className="doc-folder-name">{folder.name}</span>
                        <span className="doc-folder-count">
                          {(folderItemCount.get(folder.id) || 0) === 0
                            ? 'ריקה'
                            : `${folderItemCount.get(folder.id)} מסמכים`}
                        </span>
                      </button>
                    </td>
                    <td className="hide-mobile" />
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '.2rem' }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          title="שינוי שם התיקייה"
                          onClick={() => { setFolderError(''); setRenameFolderName(folder.name); setRenameFolderTarget(folder); }}
                        >
                          {'✏️'}
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          title="מחיקת התיקייה (המסמכים יעברו לרמה הראשית)"
                          style={{ color: 'var(--red)' }}
                          onClick={() => handleDeleteFolder(folder)}
                        >
                          {'🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.map(doc => {
                  const isFake = isPlaceholderDoc(doc);
                  const canPreview = !isFake && (doc.fileType.startsWith('image/') || doc.fileType === 'application/pdf');

                  return (
                    <tr key={doc.id} className={`doc-row ${selected.has(doc.id) ? 'doc-row-selected' : ''}`}>
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(doc.id)}
                          onChange={() => toggleSelect(doc.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--blue)' }}
                        />
                      </td>
                      <td>
                        <div className="doc-cell-desc">{doc.description || doc.fileName}</div>
                        <div className="doc-file-sub">{doc.fileName}</div>
                        {searching && doc.folderId && (
                          <button
                            type="button"
                            className="doc-cell-folder"
                            onClick={() => { setFilterText(''); setCurrentFolderId(doc.folderId!); }}
                            title="פתיחת התיקייה"
                          >
                            {'📁'} {folderPathText(doc.folderId)}
                          </button>
                        )}
                        {doc.linkedTo && (
                          <div className="doc-cell-linked">
                            {doc.linkedLabel || 'מקושר'}
                          </div>
                        )}
                        {doc.notes && <div className="doc-cell-notes">{doc.notes}</div>}
                      </td>
                      <td>
                        <span className="doc-cat-text">
                          {DOC_CATEGORY_LABELS[doc.category]}
                        </span>
                      </td>
                      <td className="doc-year-cell">
                        {doc.year === 'general' ? (
                          <span style={{ color: 'var(--gray-400)', fontSize: '.8rem' }}>כללי</span>
                        ) : doc.year}
                      </td>
                      <td style={{ fontSize: '.8125rem', whiteSpace: 'nowrap' }}>
                        {new Date(doc.uploadedAt).toLocaleDateString('he-IL')}
                      </td>
                      <td className="hide-mobile" style={{ fontSize: '.8125rem' }}>{fmt(doc.fileSize)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '.2rem' }}>
                          {canPreview && (
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handlePreview(doc)} title="תצוגה מקדימה">
                              {preview?.doc.id === doc.id ? '\uD83D\uDD3C' : '\uD83D\uDC41\uFE0F'}
                            </button>
                          )}
                          {!isFake && (
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDownload(doc)} title="הורדה">
                              {'\u2B07\uFE0F'}
                            </button>
                          )}
                          {geminiAvailable && !isFake && (
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              onClick={() => handleAnalyze(doc)}
                              title="נתח מסמך עם AI"
                              style={{ color: 'var(--green)' }}
                              disabled={analyzing === doc.id}
                            >
                              {analyzing === doc.id ? '\u23F3' : '\uD83E\uDDE0'}
                            </button>
                          )}
                          {!isFake && (
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              onClick={() => openEditModal(doc)}
                              title="עריכת פרטי מסמך"
                              style={{ color: 'var(--gray-700)' }}
                            >
                              {'\u270F\uFE0F'}
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => openCopyModal([doc.id])}
                            title="שכפול / העתקה"
                            style={{ color: 'var(--blue)' }}
                          >
                            {'\uD83D\uDCCB'}
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => handleDelete(doc.id)}
                            title="מחיקה"
                            style={{ color: 'var(--red)' }}
                          >
                            {'\uD83D\uDDD1\uFE0F'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview panel */}
      {isPreviewOpen && preview && (
        <div className="doc-preview-panel card" style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <span className="card-title">{'\uD83D\uDC41\uFE0F'} תצוגה מקדימה: {previewDoc?.fileName}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
              {'\u2715'} סגור
            </button>
          </div>
          <div style={{ maxHeight: 500, overflow: 'auto', background: 'var(--gray-50)' }}>
            {isImage ? (
              <img src={preview.url} alt={previewDoc?.fileName} style={{ maxWidth: '100%', display: 'block', margin: '0 auto', padding: '.5rem' }} />
            ) : isPDF ? (
              <iframe src={preview.url} title={previewDoc?.fileName} style={{ width: '100%', height: 480, border: 'none' }} />
            ) : null}
          </div>
        </div>
      )}

      {/* תיקייה חדשה */}
      {newFolderOpen && (
        <div className="doc-modal-overlay" onClick={() => !folderBusy && setNewFolderOpen(false)}>
          <div className="doc-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="doc-modal-header">
              <h3>{'📁'} תיקייה חדשה</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setNewFolderOpen(false)} disabled={folderBusy}>{'✕'}</button>
            </div>
            <div className="doc-modal-body">
              {currentFolderId && (
                <div style={{ fontSize: '.8125rem', color: 'var(--gray-500)', marginBottom: '.5rem' }}>
                  תיפתח בתוך: <strong>{folderPathText(currentFolderId)}</strong>
                </div>
              )}
              <div className="form-group">
                <label className="required">שם התיקייה</label>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitNewFolder(); }}
                  placeholder="למשל: התאמת מס 2026"
                />
              </div>
              {folderError && <div className="alert alert-warning" style={{ marginTop: '.5rem' }}>{folderError}</div>}
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={submitNewFolder} disabled={folderBusy}>
                  {folderBusy ? 'יוצר...' : 'צור תיקייה'}
                </button>
                <button className="btn btn-secondary" onClick={() => setNewFolderOpen(false)} disabled={folderBusy}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* שינוי שם תיקייה */}
      {renameFolderTarget && (
        <div className="doc-modal-overlay" onClick={() => !folderBusy && setRenameFolderTarget(null)}>
          <div className="doc-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="doc-modal-header">
              <h3>{'✏️'} שינוי שם תיקייה</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setRenameFolderTarget(null)} disabled={folderBusy}>{'✕'}</button>
            </div>
            <div className="doc-modal-body">
              <div className="form-group">
                <label className="required">שם התיקייה</label>
                <input
                  autoFocus
                  value={renameFolderName}
                  onChange={e => setRenameFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitRenameFolder(); }}
                />
              </div>
              {folderError && <div className="alert alert-warning" style={{ marginTop: '.5rem' }}>{folderError}</div>}
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={submitRenameFolder} disabled={folderBusy}>
                  {folderBusy ? 'שומר...' : 'שמור'}
                </button>
                <button className="btn btn-secondary" onClick={() => setRenameFolderTarget(null)} disabled={folderBusy}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* אישור העלאת תיקייה מהמחשב */}
      {folderUpload && (
        <div className="doc-modal-overlay" onClick={() => !folderBusy && setFolderUpload(null)}>
          <div className="doc-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="doc-modal-header">
              <h3>{'📁'} העלאת תיקייה</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setFolderUpload(null)} disabled={folderBusy}>{'✕'}</button>
            </div>
            <div className="doc-modal-body">
              <div style={{ marginBottom: '.9rem', fontSize: '.9rem' }}>
                תיקייה <strong>{folderUpload.rootName}</strong> - {folderUpload.files.length} קבצים
                {' '}({fmt(folderUpload.files.reduce((s, f) => s + f.size, 0))})
                {currentFolderId && <> תיכנס אל <strong>{folderPathText(currentFolderId)}</strong></>}
              </div>
              <div style={{ fontSize: '.8125rem', color: 'var(--gray-500)', marginBottom: '.9rem' }}>
                מבנה תת-התיקיות יישמר. התיאור של כל מסמך יהיה שם הקובץ - אפשר לערוך אחר כך.
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label>קטגוריה לכל הקבצים</label>
                  <select value={folderUpCat} onChange={e => setFolderUpCat(e.target.value as DocCategory)} disabled={folderBusy}>
                    {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map(k => (
                      <option key={k} value={k}>{DOC_CATEGORY_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>שנה לכל הקבצים</label>
                  <select value={String(folderUpYear)} onChange={e => setFolderUpYear(e.target.value === 'general' ? 'general' : +e.target.value)} disabled={folderBusy}>
                    <option value="general">כללי (לא תלוי שנה)</option>
                    {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              {folderProgress && (
                <div style={{ marginTop: '.75rem', fontSize: '.875rem', color: 'var(--blue)' }}>
                  מעלה {folderProgress.done} מתוך {folderProgress.total}...
                </div>
              )}
              {folderError && <div className="alert alert-warning" style={{ marginTop: '.5rem' }}>{folderError}</div>}
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={executeFolderUpload} disabled={folderBusy}>
                  {folderBusy ? 'מעלה...' : `העלה ${folderUpload.files.length} קבצים`}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setFolderUpload(null); if (folderInputRef.current) folderInputRef.current.value = ''; }}
                  disabled={folderBusy}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* העברת מסמכים לתיקייה */}
      {moveModal && (
        <div className="doc-modal-overlay" onClick={() => !moving && setMoveModal(null)}>
          <div className="doc-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="doc-modal-header">
              <h3>{'📁'} העברה לתיקייה</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setMoveModal(null)} disabled={moving}>{'✕'}</button>
            </div>
            <div className="doc-modal-body">
              <div style={{ marginBottom: '.75rem', fontSize: '.875rem', color: 'var(--gray-600)' }}>
                {moveModal.docIds.length === 1 ? 'מעביר מסמך אחד' : `מעביר ${moveModal.docIds.length} מסמכים`}
              </div>
              <div className="form-group">
                <label>תיקיית יעד</label>
                <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)}>
                  <option value="">{'📂'} כל המסמכים (רמה ראשית)</option>
                  {folderOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              {folderOptions.length === 0 && (
                <div style={{ fontSize: '.8125rem', color: 'var(--gray-500)' }}>
                  אין עדיין תיקיות. סגור וצור תיקייה חדשה קודם.
                </div>
              )}
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={executeMove} disabled={moving}>
                  {moving ? 'מעביר...' : 'העבר'}
                </button>
                <button className="btn btn-secondary" onClick={() => setMoveModal(null)} disabled={moving}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copy modal overlay */}
      {copyModal && (
        <div className="doc-modal-overlay" onClick={() => !copying && setCopyModal(null)}>
          <div className="doc-modal" onClick={e => e.stopPropagation()}>
            <div className="doc-modal-header">
              <h3>{'\uD83D\uDCCB'} שכפול / העתקת מסמכים</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setCopyModal(null)}>{'\u2715'}</button>
            </div>
            <div className="doc-modal-body">
              {copySuccess ? (
                <div className="doc-copy-success">
                  <span style={{ fontSize: '2rem' }}>{'\u2705'}</span>
                  <span>{copySuccess}</span>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '.75rem', fontSize: '.875rem', color: 'var(--gray-600)' }}>
                    {copyModal.docIds.length === 1 ? 'מעתיק מסמך אחד' : `מעתיק ${copyModal.docIds.length} מסמכים`}
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="required">לקוח יעד</label>
                    <select value={copyTargetId} onChange={e => setCopyTargetId(e.target.value)}>
                      <option value="">בחר לקוח...</option>
                      <option value={client.id}>{'\uD83D\uDD04'} {client.firstName} {client.lastName} (לקוח נוכחי - שכפול)</option>
                      {allClients.filter(c => c.id !== client.id).map(c => (
                        <option key={c.id} value={c.id}>{c.firstName} {c.lastName} - {c.idNumber}</option>
                      ))}
                    </select>
                  </div>

                  {copyModal.docIds.length === 1 && (
                    <>
                      <div className="form-grid form-grid-3" style={{ marginBottom: '1rem' }}>
                        <div className="form-group">
                          <label>תיאור</label>
                          <input value={copyEditDesc} onChange={e => setCopyEditDesc(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label>קטגוריה</label>
                          <select value={copyEditCat} onChange={e => setCopyEditCat(e.target.value as DocCategory)}>
                            {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map(k => (
                              <option key={k} value={k}>{DOC_CATEGORY_LABELS[k]}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>שנה</label>
                          <select value={String(copyEditYear)} onChange={e => setCopyEditYear(e.target.value === 'general' ? 'general' : +e.target.value)}>
                            <option value="general">כללי</option>
                            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-start' }}>
                    <button
                      className="btn btn-primary"
                      disabled={!copyTargetId || copying}
                      onClick={executeCopy}
                    >
                      {copying ? 'מעתיק...' : '\uD83D\uDCCB העתק'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setCopyModal(null)}>ביטול</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit metadata modal */}
      {editModal && (
        <div className="doc-modal-overlay" onClick={() => !savingEdit && closeEditModal()}>
          <div className="doc-modal" onClick={e => e.stopPropagation()}>
            <div className="doc-modal-header">
              <h3>{'\u270F\uFE0F'} עריכת פרטי מסמך</h3>
              <button className="btn btn-ghost btn-icon" onClick={closeEditModal} disabled={savingEdit}>{'\u2715'}</button>
            </div>
            <div className="doc-modal-body">
              <div className="form-grid form-grid-2" style={{ marginBottom: '1rem' }}>
                <div className="form-group span-full">
                  <label className="required">תיאור המסמך</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    placeholder="לדוגמה: תלוש שכר דצמבר 2025"
                    autoFocus
                  />
                </div>
                <div className="form-group span-full">
                  <label className="required">שם הקובץ</label>
                  <input
                    type="text"
                    value={editFileName}
                    onChange={e => setEditFileName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="required">קטגוריה</label>
                  <select value={editCat} onChange={e => setEditCat(e.target.value as DocCategory)}>
                    {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map(k => (
                      <option key={k} value={k}>{DOC_CATEGORY_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="required">שנה</label>
                  <select value={String(editYear)} onChange={e => setEditYear(e.target.value === 'general' ? 'general' : +e.target.value)}>
                    <option value="general">כללי / רב-שנתי</option>
                    {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="form-group span-full">
                  <label>תיקייה</label>
                  <select value={editFolderId} onChange={e => setEditFolderId(e.target.value)}>
                    <option value="">{'📂'} כל המסמכים (רמה ראשית)</option>
                    {folderOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group span-full">
                  <label>הערות (אופציונלי)</label>
                  <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                </div>
                <div className="form-group span-full">
                  <label>החלפת הקובץ עצמו (אופציונלי)</label>
                  <div style={{ fontSize: '.8125rem', color: 'var(--gray-500)', marginBottom: '.4rem' }}>
                    הקובץ הנוכחי: <strong>{editModal.fileName}</strong> ({fmt(editModal.fileSize)}).
                    בחר קובץ חדש כדי להחליף אותו - אם לא תבחר, הקובץ יישאר כפי שהוא.
                  </div>
                  <input
                    ref={editFileRef}
                    type="file"
                    accept={FILE_ACCEPT}
                    onChange={handleEditFileChange}
                    disabled={savingEdit}
                  />
                  {editReplaceFile && (
                    <div style={{ fontSize: '.8125rem', color: 'var(--green)', marginTop: '.4rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                      {'✅'} קובץ חדש נבחר: <strong>{editReplaceFile.name}</strong> ({fmt(editReplaceFile.size)})
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setEditReplaceFile(null); if (editFileRef.current) editFileRef.current.value = ''; }}
                        disabled={savingEdit}
                      >
                        {'✕'} בטל החלפה
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={closeEditModal} disabled={savingEdit}>ביטול</button>
                <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? '\u23F3 שומר...' : '\uD83D\uDCBE שמור שינויים'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analysis results modal */}
      {analysisResult && (
        <div className="doc-modal-overlay" onClick={() => setAnalysisResult(null)}>
          <div className="doc-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="doc-modal-header" style={{ background: analysisResult.success ? 'var(--green-light)' : 'var(--red-light)' }}>
              <h3>{analysisResult.success ? '\uD83E\uDDE0 תוצאות ניתוח מסמך' : '\u274C שגיאה בניתוח'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setAnalysisResult(null)}>{'\u2715'}</button>
            </div>
            <div className="doc-modal-body">
              {analysisResult.error ? (
                <div className="alert alert-warning">{analysisResult.error}</div>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem', fontSize: '.875rem', color: 'var(--gray-600)' }}>
                    {analysisResult.summary}
                    {analysisResult.data.confidence && (
                      <span className="badge badge-green" style={{ marginRight: '.5rem' }}>
                        {`רמת ביטחון: ${analysisResult.data.confidence}`}
                      </span>
                    )}
                    {analysisResult.data.documentType && (
                      <span className="badge badge-blue" style={{ marginRight: '.5rem' }}>
                        {analysisResult.data.documentType}
                      </span>
                    )}
                  </div>

                  {/* Extracted fields */}
                  <div className="table-wrap" style={{ marginBottom: '1rem' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>שדה</th>
                          <th>ערך שחולץ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.data.firstName && <tr><td>שם פרטי</td><td><strong>{analysisResult.data.firstName}</strong></td></tr>}
                        {analysisResult.data.lastName && <tr><td>שם משפחה</td><td><strong>{analysisResult.data.lastName}</strong></td></tr>}
                        {analysisResult.data.idNumber && <tr><td>ת.ז.</td><td><strong>{analysisResult.data.idNumber}</strong></td></tr>}
                        {analysisResult.data.birthDate && <tr><td>תאריך לידה</td><td>{analysisResult.data.birthDate}</td></tr>}
                        {analysisResult.data.gender && <tr><td>מין</td><td>{analysisResult.data.gender === 'male' ? 'זכר' : 'נקבה'}</td></tr>}
                        {analysisResult.data.city && <tr><td>עיר</td><td>{analysisResult.data.city}</td></tr>}
                        {analysisResult.data.address && <tr><td>כתובת</td><td>{analysisResult.data.address}</td></tr>}
                        {analysisResult.data.phone && <tr><td>טלפון</td><td>{analysisResult.data.phone}</td></tr>}
                        {analysisResult.data.grossSalary && <tr><td>שכר ברוטו</td><td>{'\u20AA'}{Number(analysisResult.data.grossSalary).toLocaleString('he-IL')}</td></tr>}
                        {analysisResult.data.employerName && <tr><td>מעסיק</td><td>{analysisResult.data.employerName}</td></tr>}
                        {analysisResult.data.additionalFields && Object.entries(analysisResult.data.additionalFields).map(([k, v]) => (
                          <tr key={k}><td style={{ color: 'var(--gray-500)' }}>{k}</td><td>{v}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {analysisResult.data.rawText && !analysisResult.data.firstName && (
                    <div style={{ marginBottom: '1rem', padding: '.75rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', fontSize: '.8125rem', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', direction: 'rtl' }}>
                      {analysisResult.data.rawText}
                    </div>
                  )}

                  {/* Apply button */}
                  {onApplyExtractedData && (analysisResult.data.firstName || analysisResult.data.idNumber) && (
                    <button
                      className="btn btn-green"
                      onClick={() => {
                        onApplyExtractedData(analysisResult.data);
                        setAnalysisResult(null);
                      }}
                    >
                      {'\u2705'} החל נתונים על פרטי הלקוח
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

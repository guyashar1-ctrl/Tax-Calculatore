import { useState, useEffect, useRef, useMemo } from 'react';
import { Client } from '../types';
import { useDocumentDB, StoredDoc, DocCategory, DOC_CATEGORY_LABELS } from '../hooks/useIndexedDB';
import { AVAILABLE_YEARS } from '../data/taxData';
import { analyzeDocument, isGeminiAvailable, AnalysisResult, DocAnalysisType, ExtractedClientData } from '../utils/geminiVision';

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const CATEGORY_COLORS: Record<DocCategory, string> = {
  id_card: '#3b82f6',
  drivers_license: '#8b5cf6',
  form_1301: '#ef4444',
  residence_certificate: '#10b981',
  salary_slip: '#f59e0b',
  pension_statement: '#06b6d4',
  business_document: '#6366f1',
  tax_assessment: '#ec4899',
  ni_document: '#14b8a6',
  other: '#6b7280',
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

export default function DocumentManager({ client, allClients, onBack, onApplyExtractedData }: Props) {
  const db = useDocumentDB();
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

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

  useEffect(() => {
    db.getDocsByClient(client.id).then(d => {
      let allDocs = d;
      if (d.length === 0 && client.id.startsWith('sample-')) {
        const fakes = generateSampleDocs(client.id);
        allDocs = [...d, ...fakes];
        fakes.forEach(doc => db.saveDoc(doc));
      }
      setDocs(allDocs);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

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

  // Filter + sort
  const filtered = useMemo(() => {
    let list = docs.filter(d => {
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
  }, [docs, filterYear, filterCat, filterText, sortField, sortDir]);

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

  async function handleDelete(id: string) {
    if (!confirm('למחוק מסמך זה?')) return;
    await db.deleteDoc(id);
    setDocs(prev => prev.filter(d => d.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (preview?.doc.id === id) { URL.revokeObjectURL(preview.url); setPreview(null); }
  }

  async function handlePreview(doc: StoredDoc) {
    if (doc.fileData.byteLength === 0) return;
    if (preview?.doc.id === doc.id) { URL.revokeObjectURL(preview.url); setPreview(null); return; }
    if (preview) URL.revokeObjectURL(preview.url);
    const blob = new Blob([doc.fileData], { type: doc.fileType });
    const url = URL.createObjectURL(blob);
    setPreview({ doc, url });
  }

  function handleDownload(doc: StoredDoc) {
    if (doc.fileData.byteLength === 0) return;
    const blob = new Blob([doc.fileData], { type: doc.fileType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = doc.fileName; a.click();
    URL.revokeObjectURL(url);
  }

  // AI Analysis
  async function handleAnalyze(doc: StoredDoc) {
    if (doc.fileData.byteLength === 0) return;
    setAnalyzing(doc.id);
    setAnalysisResult(null);
    const docAnalysisType = CATEGORY_TO_ANALYSIS[doc.category] || 'general';
    const result = await analyzeDocument(doc.fileData, doc.fileType, docAnalysisType);
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
    for (const doc of docsToClone) {
      const newDoc: StoredDoc = {
        ...doc,
        id: crypto.randomUUID(),
        clientId: copyTargetId,
        uploadedAt: new Date().toISOString(),
        description: copyModal.docIds.length === 1 ? copyEditDesc || doc.description : doc.description,
        category: copyModal.docIds.length === 1 ? copyEditCat : doc.category,
        year: copyModal.docIds.length === 1 ? copyEditYear : doc.year,
      };
      await db.saveDoc(newDoc);
      newDocs.push(newDoc);
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
      {/* Header */}
      <div className="doc-header">
        <div>
          <div style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginBottom: '.25rem' }}>
            <span className="doc-back-link" onClick={onBack}>{'\u2190'} חזרה לפרטי לקוח</span>
          </div>
          <h1 className="doc-title">{'\uD83D\uDCC1'} מסמכי {client.firstName} {client.lastName}</h1>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)' }}>{docs.length} מסמכים</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUploadForm(s => !s)}>
          {showUploadForm ? '\u2715 ביטול' : '\u2B06\uFE0F העלאת מסמך'}
        </button>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="card doc-upload-card">
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

      {/* Stats strip */}
      {docs.length > 0 && (
        <div className="doc-stats-strip">
          <div className="doc-stat">
            <span className="doc-stat-number">{docs.length}</span>
            <span className="doc-stat-label">מסמכים</span>
          </div>
          <div className="doc-stat-divider" />
          <div className="doc-stat">
            <span className="doc-stat-number">{Object.keys(yearCounts).length}</span>
            <span className="doc-stat-label">שנים</span>
          </div>
          <div className="doc-stat-divider" />
          <div className="doc-stat">
            <span className="doc-stat-number">{Object.keys(catCounts).length}</span>
            <span className="doc-stat-label">קטגוריות</span>
          </div>
        </div>
      )}

      {/* Filters */}
      {docs.length > 0 && (
        <div className="doc-filters">
          <div className="doc-filter-search">
            <span className="doc-filter-icon">{'\uD83D\uDD0D'}</span>
            <input
              type="text"
              placeholder="חיפוש חופשי..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
          </div>
          <select className="doc-filter-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="all">כל השנים</option>
            <option value="general">כללי</option>
            {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y} {yearCounts[y] ? `(${yearCounts[y]})` : ''}</option>)}
          </select>
          <select className="doc-filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="all">כל הקטגוריות</option>
            {(Object.entries(DOC_CATEGORY_LABELS) as [DocCategory, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v} {catCounts[k] ? `(${catCounts[k]})` : ''}</option>
            ))}
          </select>
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
          <button className="btn btn-secondary btn-sm" onClick={() => openCopyModal(Array.from(selected))}>
            {'\uD83D\uDCCB'} שכפול / העתקה
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
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
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\uD83D\uDCC4'}</div>
          <div className="empty-state-title">אין מסמכים עדיין</div>
          <div className="empty-state-desc">לחץ "העלאת מסמך" להוספת המסמך הראשון</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\uD83D\uDD0D'}</div>
          <div className="empty-state-title">לא נמצאו מסמכים</div>
          <div className="empty-state-desc">נסה לשנות את הסינון</div>
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
                  <th className="th-sortable hide-mobile" onClick={() => toggleSort('fileName')}>
                    <span>קובץ</span> {sortIcon('fileName')}
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
                {filtered.map(doc => {
                  const isFake = doc.fileData.byteLength === 0;
                  const catColor = CATEGORY_COLORS[doc.category];
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
                        {doc.notes && <div className="doc-cell-notes">{doc.notes}</div>}
                      </td>
                      <td>
                        <span className="doc-cat-pill" style={{ background: catColor + '18', color: catColor, borderColor: catColor + '40' }}>
                          {DOC_CATEGORY_LABELS[doc.category]}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {doc.year === 'general' ? (
                          <span style={{ color: 'var(--gray-400)', fontSize: '.8rem' }}>כללי</span>
                        ) : doc.year}
                      </td>
                      <td className="hide-mobile">
                        <div className="doc-cell-filename">{doc.fileName}</div>
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
                      <option value={client.id}>{'\uD83D\uDD04'} {client.firstName} {client.lastName} (לקוח נוכחי — שכפול)</option>
                      {allClients.filter(c => c.id !== client.id).map(c => (
                        <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.idNumber}</option>
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

import { useState, useEffect, useRef } from 'react';
import { Client } from '../types';
import { useDocumentDB, StoredDoc, DocCategory, DOC_CATEGORY_LABELS } from '../hooks/useIndexedDB';
import { AVAILABLE_YEARS } from '../data/taxData';

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface Props {
  client: Client;
  onBack: () => void;
}

export default function DocumentManager({ client, onBack }: Props) {
  const db = useDocumentDB();
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [preview, setPreview] = useState<{ doc: StoredDoc; url: string } | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Upload form state
  const [upCategory, setUpCategory] = useState<DocCategory>('other');
  const [upYear, setUpYear] = useState<number | 'general'>('general');
  const [upNotes, setUpNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    db.getDocsByClient(client.id).then(d => {
      setDocs(d.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
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
        notes: upNotes,
        fileData: buf,
      };
      await db.saveDoc(doc);
      setDocs(prev => [doc, ...prev]);
    }
    setUploading(false);
    setShowUploadForm(false);
    setUpNotes('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק מסמך זה?')) return;
    await db.deleteDoc(id);
    setDocs(prev => prev.filter(d => d.id !== id));
    if (preview?.doc.id === id) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
  }

  async function handlePreview(doc: StoredDoc) {
    if (preview?.doc.id === doc.id) { URL.revokeObjectURL(preview.url); setPreview(null); return; }
    if (preview) URL.revokeObjectURL(preview.url);
    const blob = new Blob([doc.fileData], { type: doc.fileType });
    const url = URL.createObjectURL(blob);
    setPreview({ doc, url });
  }

  function handleDownload(doc: StoredDoc) {
    const blob = new Blob([doc.fileData], { type: doc.fileType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = docs.filter(d => {
    if (filterYear !== 'all' && String(d.year) !== filterYear) return false;
    if (filterCat !== 'all' && d.category !== filterCat) return false;
    return true;
  });

  // Group by year
  const groups: Record<string, StoredDoc[]> = {};
  for (const d of filtered) {
    const key = String(d.year);
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  }
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'general') return 1;
    if (b === 'general') return -1;
    return Number(b) - Number(a);
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginBottom: '.25rem' }}>
            <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={onBack}>← חזרה לפרטי לקוח</span>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>📁 מסמכי {client.firstName} {client.lastName}</h1>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)' }}>{docs.length} מסמכים</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUploadForm(s => !s)}>
          {showUploadForm ? '✕ ביטול' : '⬆️ העלאת מסמך'}
        </button>
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--blue-border)' }}>
          <div className="card-header"><span className="card-title">⬆️ העלאת מסמך חדש</span></div>
          <div className="card-body">
            <div className="form-grid form-grid-3">
              <div className="form-group">
                <label>קטגוריה</label>
                <select value={upCategory} onChange={e => setUpCategory(e.target.value as DocCategory)}>
                  {(Object.keys(DOC_CATEGORY_LABELS) as DocCategory[]).map(k => (
                    <option key={k} value={k}>{DOC_CATEGORY_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>שנה רלוונטית</label>
                <select value={String(upYear)} onChange={e => setUpYear(e.target.value === 'general' ? 'general' : +e.target.value)}>
                  <option value="general">כללי (לא תלוי שנה)</option>
                  {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>הערות</label>
                <input value={upNotes} onChange={e => setUpNotes(e.target.value)} placeholder="הערה אופציונלית..." />
              </div>
              <div className="form-group span-full">
                <label className="required">בחר קובץ (PDF, תמונה)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif"
                  multiple
                  onChange={e => handleUpload(e.target.files)}
                  disabled={uploading}
                />
                {uploading && <p style={{ color: 'var(--blue)', marginTop: '.5rem' }}>מעלה...</p>}
              </div>
            </div>
            <div className="alert alert-info" style={{ marginTop: '.75rem' }}>
              ℹ️ הקבצים נשמרים באחסון מקומי בדפדפן (IndexedDB). בגרסה הבאה יועברו לאחסון ענן.
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          style={{ padding: '.4rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--gray-300)' }}
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
        >
          <option value="all">כל השנים</option>
          <option value="general">כללי</option>
          {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          style={{ padding: '.4rem .75rem', borderRadius: 'var(--radius)', border: '1px solid var(--gray-300)' }}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="all">כל הקטגוריות</option>
          {(Object.entries(DOC_CATEGORY_LABELS) as [DocCategory, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Document list */}
      {loading ? (
        <p style={{ color: 'var(--gray-500)' }}>טוען...</p>
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <div className="empty-state-title">אין מסמכים עדיין</div>
          <div className="empty-state-desc">לחץ "העלאת מסמך" להוספה</div>
        </div>
      ) : sortedKeys.length === 0 ? (
        <div className="empty-state"><div className="empty-state-title">לא נמצאו מסמכים בפילטר זה</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {sortedKeys.map(key => (
            <div key={key}>
              <div style={{ fontSize: '.9375rem', fontWeight: 700, color: 'var(--gray-700)', marginBottom: '.5rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span>📂</span>
                <span>{key === 'general' ? 'כללי' : `שנת מס ${key}`}</span>
                <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--gray-400)' }}>({groups[key].length} מסמכים)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {groups[key].map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    isPreview={preview?.doc.id === doc.id}
                    previewUrl={preview?.doc.id === doc.id ? preview.url : undefined}
                    onPreview={() => handlePreview(doc)}
                    onDownload={() => handleDownload(doc)}
                    onDelete={() => handleDelete(doc.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({ doc, isPreview, previewUrl, onPreview, onDownload, onDelete }: {
  doc: StoredDoc;
  isPreview: boolean;
  previewUrl?: string;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const isImage = doc.fileType.startsWith('image/');
  const isPDF = doc.fileType === 'application/pdf';
  const ext = doc.fileName.split('.').pop()?.toUpperCase() ?? '?';

  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem 1rem', background: isPreview ? 'var(--blue-light)' : 'white' }}>
        {/* Icon */}
        <div style={{ width: 36, height: 36, borderRadius: 6, background: isPDF ? '#fee2e2' : isImage ? '#d1fae5' : 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, color: isPDF ? 'var(--red)' : isImage ? 'var(--green)' : 'var(--gray-500)', flexShrink: 0 }}>
          {isPDF ? 'PDF' : isImage ? '🖼️' : ext}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.fileName}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-gray" style={{ fontSize: '.7rem' }}>{DOC_CATEGORY_LABELS[doc.category]}</span>
            <span>{fmt(doc.fileSize)}</span>
            <span>{new Date(doc.uploadedAt).toLocaleDateString('he-IL')}</span>
            {doc.notes && <span>· {doc.notes}</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0 }}>
          {(isImage || isPDF) && (
            <button className="btn btn-secondary btn-sm" onClick={onPreview} title="תצוגה מקדימה">
              {isPreview ? '🔼' : '👁️'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onDownload} title="הורדה">⬇️</button>
          <button className="btn btn-danger btn-sm" onClick={onDelete} title="מחיקה">🗑️</button>
        </div>
      </div>

      {/* Preview */}
      {isPreview && previewUrl && (
        <div style={{ borderTop: '1px solid var(--gray-200)', maxHeight: 500, overflow: 'auto', background: 'var(--gray-50)' }}>
          {isImage ? (
            <img src={previewUrl} alt={doc.fileName} style={{ maxWidth: '100%', display: 'block', margin: '0 auto', padding: '.5rem' }} />
          ) : isPDF ? (
            <iframe src={previewUrl} title={doc.fileName} style={{ width: '100%', height: 480, border: 'none' }} />
          ) : null}
        </div>
      )}
    </div>
  );
}

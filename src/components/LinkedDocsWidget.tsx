// ─── רכיב מסמכים מקושרים ──────────────────────────────────────────────────
// מאפשר להעלות, לצפות, ולהסיר מסמכים מקושרים למקום ספציפי בתיק הלקוח.
// המסמך נשמר רגיל ב-IndexedDB של הלקוח (DocumentManager רואה אותו),
// ה-linkedTo רק מאפשר להציגו גם במקום הרלוונטי (משימה / שדה אישי / וכו').
//
// בעת העלאה — מציג טופס מטא-נתונים (קטגוריה / שנה / תיאור), בדיוק כמו
// ב-DocumentManager הראשי. אסור לשמור בלי תיאור וקטגוריה ושנה.

import { useEffect, useRef, useState } from 'react';
import { useDocumentDB, StoredDoc, DocCategory, DOC_CATEGORY_LABELS } from '../hooks/useIndexedDB';
import { AVAILABLE_YEARS } from '../data/taxData';

interface Props {
  clientId: string;
  /** מפתח קישור — לדוגמה "task:abc123" או "personal:idf_service" */
  linkKey: string;
  /** תווית של הקישור — לדוגמה "תעודת שחרור" — נשמרת על המסמך */
  linkLabel: string;
  /** קטגוריה ברירת-מחדל למסמך שייווצר */
  defaultCategory?: DocCategory;
  /** קומפקטי (תצוגה צרה לתת-סעיף) */
  compact?: boolean;
}

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.doc,.docx';

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface PendingUpload {
  file: File;
  description: string;
  category: DocCategory;
  year: number | 'general';
  notes: string;
}

export default function LinkedDocsWidget({
  clientId,
  linkKey,
  linkLabel,
  defaultCategory = 'other',
  compact = false,
}: Props) {
  const db = useDocumentDB();
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── בורר מסמכים קיימים ──
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allClientDocs, setAllClientDocs] = useState<StoredDoc[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');

  async function reload() {
    if (!clientId) return;
    try {
      const all = await db.getDocsByClient(clientId);
      console.log('[LinkedDocs.reload]', all.length, 'docs for client', clientId, '— filtering by linkKey:', linkKey);
      setAllClientDocs(all);
      const filtered = all.filter(d => d.linkedTo === linkKey);
      console.log('[LinkedDocs.reload] showing', filtered.length, 'after filter');
      setDocs(filtered);
    } catch (err) {
      console.error('[LinkedDocs.reload] failed', err);
      setDocs([]);
      setAllClientDocs([]);
    }
  }

  useEffect(() => {
    reload();
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, linkKey]);

  // האזנה ל-event גלובלי כדי שאם מישהו שינה מסמכים מאזור אחר באפליקציה — נתעדכן.
  useEffect(() => {
    function handleChange(e: Event) {
      const ce = e as CustomEvent<{ clientId?: string }>;
      if (!ce.detail?.clientId || ce.detail.clientId === clientId) {
        reload();
      }
    }
    window.addEventListener('crm:docs-changed', handleChange);
    return () => window.removeEventListener('crm:docs-changed', handleChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, linkKey]);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !files.length) return;
    const file = files[0];      // מטפלים בקובץ אחד בכל פעם — קטגוריה/שנה לכל אחד
    const currentYear = new Date().getFullYear();
    const yearDefault = AVAILABLE_YEARS.includes(currentYear) ? currentYear : AVAILABLE_YEARS[0];
    setPending({
      file,
      description: linkLabel,
      category: defaultCategory,
      year: yearDefault,
      notes: '',
    });
    setErrors([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function confirmUpload() {
    if (!pending) return;
    const errs: string[] = [];
    if (!pending.description.trim()) errs.push('יש להזין תיאור למסמך');
    if (!pending.category) errs.push('יש לבחור קטגוריה');
    if (!pending.year) errs.push('יש לבחור שנה');
    if (errs.length) { setErrors(errs); return; }

    if (!clientId) {
      setErrors(['חסר מזהה לקוח — לא ניתן לשמור. אנא רענן ונסה שוב.']);
      return;
    }

    setLoading(true);
    setErrors([]);
    console.log('[LinkedDocs.confirmUpload] start', { clientId, linkKey, fileName: pending.file.name });
    try {
      const buf = await pending.file.arrayBuffer();
      const doc: StoredDoc = {
        id: crypto.randomUUID(),
        clientId,
        fileName: pending.file.name,
        fileType: pending.file.type || 'application/octet-stream',
        fileSize: pending.file.size,
        category: pending.category,
        year: pending.year,
        uploadedAt: new Date().toISOString(),
        description: pending.description.trim(),
        notes: pending.notes,
        fileData: buf,
        linkedTo: linkKey,
        linkedLabel: linkLabel,
      };
      await db.saveDoc(doc);
      console.log('[LinkedDocs.confirmUpload] saveDoc OK, reloading...');
      await reload();
      console.log('[LinkedDocs.confirmUpload] reload done');
      setPending(null);
    } catch (err: any) {
      console.error('[LinkedDocs.confirmUpload] FAILED', err);
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      setErrors([`שמירה נכשלה: ${msg}`]);
      // לא סוגרים את הטופס כדי שהמשתמש יראה את ההודעה ויוכל לנסות שוב
    } finally {
      setLoading(false);
    }
  }

  function cancelUpload() {
    setPending(null);
    setErrors([]);
  }

  async function handleRemove(id: string) {
    if (!confirm('להסיר את המסמך?')) return;
    await db.deleteDoc(id);
    reload();
  }

  /** מבטל קישור (לא מוחק את המסמך — רק מסיר את ה-linkedTo) */
  async function handleUnlink(doc: StoredDoc) {
    if (!confirm('לבטל את הקישור? המסמך עצמו יישאר בתיק המסמכים של הלקוח.')) return;
    const next: StoredDoc = { ...doc, linkedTo: undefined, linkedLabel: undefined };
    await db.saveDoc(next);
    reload();
  }

  async function openPicker() {
    if (!clientId) return;
    try {
      const all = await db.getDocsByClient(clientId);
      setAllClientDocs(all);
    } catch { /* ignore */ }
    setPickerOpen(true);
    setPickerSearch('');
  }

  async function linkExistingDoc(doc: StoredDoc) {
    const next: StoredDoc = { ...doc, linkedTo: linkKey, linkedLabel: linkLabel };
    await db.saveDoc(next);
    setPickerOpen(false);
    reload();
  }

  async function handlePreview(doc: StoredDoc) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // doc מ-getDocsByClient הוא מטא-בלבד; טעינה אמיתית של הבייטים מהענן ב-getDoc
    let bytes = doc.fileData;
    if (bytes.byteLength === 0) {
      const full = await db.getDoc(doc.id);
      if (!full || full.fileData.byteLength === 0) return;
      bytes = full.fileData;
    }
    const blob = new Blob([bytes], { type: doc.fileType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    window.open(url, '_blank');
  }

  if (!clientId) {
    return (
      <div className="cw-linked-docs-empty">
        <span style={{ color: 'var(--gray-400)', fontSize: '.75rem' }}>
          📎 ניתן לצרף מסמכים אחרי שמירת הלקוח
        </span>
      </div>
    );
  }

  return (
    <div className={`cw-linked-docs ${compact ? 'cw-linked-docs--compact' : ''}`}>
      {docs.length > 0 && (
        <div className="cw-linked-docs-list">
          {docs.map(d => (
            <div key={d.id} className="cw-linked-doc-row">
              <span className="cw-linked-doc-icon">📎</span>
              <button
                type="button"
                className="cw-linked-doc-name"
                onClick={() => handlePreview(d)}
                title="פתח לצפייה"
              >
                {d.fileName}
              </button>
              <span className="cw-linked-doc-cat">{DOC_CATEGORY_LABELS[d.category]}</span>
              <span className="cw-linked-doc-year">{d.year === 'general' ? 'כללי' : d.year}</span>
              <span className="cw-linked-doc-size">{fmt(d.fileSize)}</span>
              <button
                type="button"
                className="cw-linked-doc-remove"
                onClick={() => handleUnlink(d)}
                title="בטל קישור (המסמך יישאר בתיק)"
              >🔗✕</button>
              <button
                type="button"
                className="cw-linked-doc-remove"
                onClick={() => handleRemove(d.id)}
                title="מחק את המסמך לחלוטין"
              >🗑</button>
            </div>
          ))}
        </div>
      )}

      {pending ? (
        <div className="cw-linked-upload-form">
          <div className="cw-linked-upload-head">
            <span>📎 {pending.file.name}</span>
            <span className="cw-linked-doc-size">{fmt(pending.file.size)}</span>
          </div>
          <div className="form-grid form-grid-3" style={{ gap: '.5rem' }}>
            <div className="form-group span-full">
              <label className="required">תיאור המסמך</label>
              <input
                type="text"
                value={pending.description}
                onChange={e => setPending({ ...pending, description: e.target.value })}
                placeholder="לדוגמה: תעודת שחרור 2006"
              />
            </div>
            <div className="form-group">
              <label className="required">קטגוריה</label>
              <select
                value={pending.category}
                onChange={e => setPending({ ...pending, category: e.target.value as DocCategory })}
              >
                {(Object.entries(DOC_CATEGORY_LABELS) as [DocCategory, string][]).map(([k, v]) =>
                  <option key={k} value={k}>{v}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="required">שנה</label>
              <select
                value={String(pending.year)}
                onChange={e => setPending({ ...pending, year: e.target.value === 'general' ? 'general' : Number(e.target.value) })}
              >
                <option value="general">כללי / רב-שנתי</option>
                {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>הערות (אופציונלי)</label>
              <input
                type="text"
                value={pending.notes}
                onChange={e => setPending({ ...pending, notes: e.target.value })}
              />
            </div>
          </div>

          {errors.length > 0 && (
            <div className="cw-linked-upload-errors">
              {errors.map((err, i) => <div key={i}>⚠ {err}</div>)}
            </div>
          )}

          <div className="cw-linked-upload-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancelUpload} disabled={loading}>
              בטל
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={confirmUpload} disabled={loading}>
              {loading ? '⏳ שומר...' : '💾 שמור מסמך'}
            </button>
          </div>
        </div>
      ) : pickerOpen ? (
        <div className="cw-linked-picker">
          <div className="cw-linked-picker-head">
            <span>🔗 בחר מסמך מהתיק לקישור</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(false)}>סגור</button>
          </div>
          <input
            type="text"
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            placeholder="🔍 חיפוש לפי שם, תיאור, קטגוריה..."
            className="cw-linked-picker-search"
            autoFocus
          />
          {(() => {
            const q = pickerSearch.trim().toLowerCase();
            const available = allClientDocs
              .filter(d => d.linkedTo !== linkKey)
              .filter(d => !q || (
                (d.fileName || '').toLowerCase().includes(q) ||
                (d.description || '').toLowerCase().includes(q) ||
                (DOC_CATEGORY_LABELS[d.category] || '').toLowerCase().includes(q)
              ));
            if (available.length === 0) {
              return (
                <div className="cw-linked-picker-empty">
                  {allClientDocs.length === 0 ? 'אין מסמכים בתיק הלקוח עדיין' : 'אין מסמכים מתאימים'}
                </div>
              );
            }
            return (
              <div className="cw-linked-picker-list">
                {available.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    className="cw-linked-picker-row"
                    onClick={() => linkExistingDoc(d)}
                  >
                    <span className="cw-linked-doc-icon">📄</span>
                    <div className="cw-linked-picker-text">
                      <div className="cw-linked-picker-title">{d.description || d.fileName}</div>
                      <div className="cw-linked-picker-meta">
                        <span>{d.fileName}</span>
                        <span className="cw-linked-doc-cat">{DOC_CATEGORY_LABELS[d.category]}</span>
                        <span className="cw-linked-doc-year">{d.year === 'general' ? 'כללי' : d.year}</span>
                        {d.linkedTo && d.linkedTo !== linkKey && (
                          <span className="cw-linked-picker-warn">⚠ מקושר כרגע למקום אחר</span>
                        )}
                      </div>
                    </div>
                    <span className="cw-linked-picker-action">קשר ←</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="cw-linked-docs-actions">
          <label className="cw-linked-docs-upload">
            <input
              ref={fileRef}
              type="file"
              accept={FILE_ACCEPT}
              onChange={handleFilePick}
              style={{ display: 'none' }}
              disabled={loading}
            />
            <span>📎 {docs.length === 0 ? 'צרף מסמך חדש' : 'צרף מסמך חדש'}</span>
          </label>
          <button type="button" className="cw-linked-docs-link-btn" onClick={openPicker} disabled={loading}>
            🔗 קשר מסמך מהתיק
          </button>
        </div>
      )}
    </div>
  );
}

// ─── מסמכים מקושרים דרך תיק המסמכים (M3) ────────────────────────────────────
// ‼ זה מנגנון נפרד מ-LinkedDocsWidget הישן (שמצרף קובץ ישירות למשימה). כאן
// מקשרים למסמך שכבר קיים בתיק המסמכים של הלקוח (document_task_links) — כדי
// שהקישור יופיע גם בכיוון ההפוך, בכרטיס המסמך עצמו. שני המנגנונים מוצגים
// יחד בכוונה — לא לאחד אותם בלי לבדוק את שאר מוקדי השימוש (מכתב שחרור, KYC).

import { useEffect, useState } from 'react';
import { useDocumentStore, type StoredDoc, type DocumentLabel } from '../hooks/useDocumentStore';
import { AVAILABLE_YEARS } from '../data/taxData';

interface Props {
  clientId: string;
  taskId: string;
  taskTitle?: string;
}

export default function TaskLinkedDocuments({ clientId, taskId, taskTitle }: Props) {
  const db = useDocumentStore();
  const [allDocs, setAllDocs] = useState<StoredDoc[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [labels, setLabels] = useState<DocumentLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [pickValue, setPickValue] = useState('');
  const [uploadDraft, setUploadDraft] = useState<{ file: File; year: string; labelId: string } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [docs, linked, labelList] = await Promise.all([
      db.getDocsByClientIncludingLinked(clientId),
      db.getLinkedDocIdsForTask(taskId),
      db.getLabels(),
    ]);
    setAllDocs(docs);
    setLinkedIds(linked);
    setLabels(labelList);
    setLoading(false);
  }

  useEffect(() => {
    if (clientId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, taskId]);

  if (!clientId) return null;

  const linkedDocs = allDocs.filter(d => linkedIds.includes(d.id));
  const unlinkedDocs = allDocs.filter(d => !linkedIds.includes(d.id));

  async function addLink() {
    if (!pickValue) return;
    await db.linkDocumentTask(pickValue, taskId);
    setPickValue('');
    setPicking(false);
    void load();
  }

  async function removeLink(docId: string) {
    await db.unlinkDocumentTask(docId, taskId);
    void load();
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reserved = labels.find(l => l.isReserved);
    setUploadDraft({ file, year: String(new Date().getFullYear()), labelId: reserved?.id ?? '' });
  }

  async function confirmUpload() {
    if (!uploadDraft || !uploadDraft.year || !uploadDraft.labelId) return;
    setUploadBusy(true);
    try {
      const buf = await uploadDraft.file.arrayBuffer();
      const docId = crypto.randomUUID();
      const doc: StoredDoc = {
        id: docId,
        clientId,
        fileName: uploadDraft.file.name,
        fileType: uploadDraft.file.type || 'application/octet-stream',
        fileSize: uploadDraft.file.size,
        category: 'other',
        year: uploadDraft.year === 'כללי' ? 'general' : (Number(uploadDraft.year) || 'general'),
        uploadedAt: new Date().toISOString(),
        description: taskTitle ? `מסמך משימה — ${taskTitle}` : uploadDraft.file.name.replace(/\.[^./\\]+$/, ''),
        notes: '',
        fileData: buf,
        folderId: null,
        labelId: uploadDraft.labelId,
      };
      await db.saveDoc(doc);
      await db.linkDocumentTask(docId, taskId);
      setUploadDraft(null);
      void load();
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div>
      {loading ? (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>טוען…</div>
      ) : linkedDocs.length === 0 ? (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>אין מסמכים מקושרים מתיק המסמכים.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
          {linkedDocs.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: 'var(--fs-13)' }}>
              <span style={{ flex: 1 }}>{d.fileName}</span>
              <button type="button" className="ui-linkbtn" style={{ color: 'var(--red)' }} onClick={() => removeLink(d.id)}>
                הסר קישור
              </button>
            </div>
          ))}
        </div>
      )}

      {picking && (
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem', alignItems: 'center' }}>
          <select value={pickValue} onChange={(e) => setPickValue(e.target.value)} style={{ flex: 1 }}>
            <option value="">— בחר מסמך מהתיק —</option>
            {unlinkedDocs.map(d => (
              <option key={d.id} value={d.id}>{d.fileName}</option>
            ))}
          </select>
          <button type="button" className="btn btn-sm btn-primary" disabled={!pickValue} onClick={addLink}>קשר</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPicking(false); setPickValue(''); }}>ביטול</button>
        </div>
      )}

      {uploadDraft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginTop: '.4rem', padding: '.4rem', border: '1px solid var(--hairline-2)', borderRadius: 'var(--r-input,6px)' }}>
          <div style={{ fontSize: 'var(--fs-13)' }}>{uploadDraft.file.name}</div>
          <select value={uploadDraft.year} onChange={(e) => setUploadDraft({ ...uploadDraft, year: e.target.value })}>
            {['כללי', ...AVAILABLE_YEARS.map(String)].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={uploadDraft.labelId} onChange={(e) => setUploadDraft({ ...uploadDraft, labelId: e.target.value })}>
            <option value="">בחר תווית…</option>
            {labels.filter(l => !l.isReserved).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            {labels.filter(l => l.isReserved).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '.4rem' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={uploadBusy || !uploadDraft.labelId} onClick={confirmUpload}>
              {uploadBusy ? 'שומר…' : 'שמור וקשר'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setUploadDraft(null)} disabled={uploadBusy}>ביטול</button>
          </div>
        </div>
      )}

      {!picking && !uploadDraft && (
        <div style={{ display: 'flex', gap: '.8rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="ui-linkbtn" onClick={() => setPicking(true)}>
            + קשר מסמך קיים מתיק המסמכים
          </button>
          <label className="ui-linkbtn" style={{ cursor: 'pointer' }}>
            + העלה מסמך חדש
            <input type="file" style={{ display: 'none' }} onChange={onPickFile} />
          </label>
        </div>
      )}
    </div>
  );
}

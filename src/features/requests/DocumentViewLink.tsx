// ─── «צפה» בקובץ שהגיע לבקשה (30.10.2026) ──────────────────────────────────────
// ‼ גיא: שורה ירוקה של «מסמכים מהלקוח» אמרה «הועלה» בלי דרך לראות את הקובץ. אותו מסלול כמו
// בדוח השנתי (loadDocumentFile): הורדה מהדלי הפרטי, כתובת blob מקומית — בלי קישור ציבורי.
import { useState } from 'react';
import DocumentViewerDialog from '../../components/DocumentViewerDialog';
import { loadDocumentFile } from '../annualReturn/docFile';

export default function DocumentViewLink({ documentId, title }: { documentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ui-linkbtn" onClick={() => setOpen(true)}>צפה</button>
      {open && (
        <DocumentViewerDialog title={title} onClose={() => setOpen(false)}
          load={async () => {
            const f = await loadDocumentFile(documentId);
            if (!f) throw new Error('הקובץ לא נמצא במסמכים.');
            URL.revokeObjectURL(f.url);
            return { bytes: new Uint8Array(f.bytes), fileName: f.name, mime: f.type || 'application/octet-stream' };
          }} />
      )}
    </>
  );
}

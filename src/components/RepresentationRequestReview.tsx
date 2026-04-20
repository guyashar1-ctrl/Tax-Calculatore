import { useEffect, useState } from 'react';
import {
  RepresentationRequest,
  AccountantPartB,
  AUTHORITY_LABELS,
  REPRESENTATION_STATUS_LABELS,
  REPRESENTATION_STATUS_BADGE,
} from '../types';
import { useDocumentDB, StoredDoc } from '../hooks/useIndexedDB';
import { generateSignedPoaPdf, downloadPdfBytes, toPureArrayBuffer } from '../utils/poaPdfGenerator';
import SignaturePad from './SignaturePad';

interface Props {
  request: RepresentationRequest;
  onBack: () => void;
  onSign: (req: RepresentationRequest, partB: AccountantPartB, signedPdfStoredId: string) => void;
  onMarkActive: (req: RepresentationRequest) => void;
  onDelete: (id: string) => void;
  onOpenFill: (id: string) => void;
}

const REP_TYPE_OPTIONS = [
  'רואה חשבון',
  'יועץ מס',
  'עורך דין',
];

export default function RepresentationRequestReview({
  request,
  onBack,
  onSign,
  onMarkActive,
  onDelete,
  onOpenFill,
}: Props) {
  const db = useDocumentDB();
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [preview, setPreview] = useState<{ doc: StoredDoc; url: string } | null>(null);

  // Accountant sign mode
  const [signMode, setSignMode] = useState(false);
  const [partB, setPartB] = useState<AccountantPartB>(
    request.partB ?? {
      firmName: '',
      representativeNumber: '',
      representativeType: 'רואה חשבון',
      incomeTaxFileNumber: '',
      vatDealerNumber: '',
      withholdingFileNumber: '',
      signatureDataUrl: '',
      signedAt: '',
    }
  );
  const [signErrors, setSignErrors] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // Generated PDF preview
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    db.getDocsByClient(`req-${request.id}`).then(setDocs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  useEffect(() => {
    // טעינת ה-PDF החתום אם קיים
    if (request.signedPdfStoredId) {
      db.getDoc(request.signedPdfStoredId).then(d => {
        if (d) {
          const blob = new Blob([d.fileData], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setGeneratedPdfUrl(url);
        }
      });
    }
    return () => {
      if (generatedPdfUrl) URL.revokeObjectURL(generatedPdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.signedPdfStoredId]);

  const submission = request.submission;
  const authorityList = request.authorities.map(a => AUTHORITY_LABELS[a]).join(', ');

  const fmt = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  function openPreview(doc: StoredDoc) {
    const blob = new Blob([doc.fileData], { type: doc.fileType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    setPreview({ doc, url });
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  function validatePartB(): string[] {
    const e: string[] = [];
    if (!partB.firmName.trim()) e.push('יש להזין שם משרד');
    if (!partB.representativeNumber.trim()) e.push('יש להזין מספר מייצג');
    if (!partB.signatureDataUrl) e.push('יש לחתום על הטופס');
    return e;
  }

  async function handleSignAndGenerate() {
    const e = validatePartB();
    if (e.length) {
      setSignErrors(e);
      return;
    }
    setSignErrors([]);
    setGenerating(true);
    try {
      const filledPartB: AccountantPartB = {
        ...partB,
        signedAt: new Date().toISOString(),
      };
      // יצירת PDF סופי
      const pdfBytes = await generateSignedPoaPdf({
        request: { ...request, partB: filledPartB },
      });

      // שמירה ל-IndexedDB
      const storedId = `signed-poa-${request.id}`;
      const sub = request.submission!;
      const fileName = `${sub.lastName} ${sub.firstName} ייפוי כוח חתום.pdf`;
      await db.saveDoc({
        id: storedId,
        clientId: request.linkedClientId, // משויך ללקוח האמיתי
        fileName,
        fileType: 'application/pdf',
        fileSize: pdfBytes.byteLength,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: 'טופס ייפוי כוח 2279א\'5 חתום (מייצג + לקוח)',
        notes: '',
        fileData: toPureArrayBuffer(pdfBytes),
      });

      onSign(request, filledPartB, storedId);
      setSignMode(false);
    } catch (err) {
      setSignErrors([`שגיאה ביצירת ה-PDF: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPdf() {
    if (!request.signedPdfStoredId) return;
    const stored = await db.getDoc(request.signedPdfStoredId);
    if (!stored) return;
    const bytes = new Uint8Array(stored.fileData);
    downloadPdfBytes(bytes, stored.fileName);
  }

  async function handleRegeneratePdf() {
    // יצירה מחדש של ה-PDF (אם המייצג כבר חתם בעבר וצריך להחליף)
    if (!request.partB) return;
    setGenerating(true);
    try {
      const pdfBytes = await generateSignedPoaPdf({ request });
      const storedId = request.signedPdfStoredId || `signed-poa-${request.id}`;
      const sub = request.submission!;
      const fileName = `${sub.lastName} ${sub.firstName} ייפוי כוח חתום.pdf`;
      await db.saveDoc({
        id: storedId,
        clientId: request.linkedClientId,
        fileName,
        fileType: 'application/pdf',
        fileSize: pdfBytes.byteLength,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: 'טופס ייפוי כוח 2279א\'5 חתום (מייצג + לקוח)',
        notes: '',
        fileData: toPureArrayBuffer(pdfBytes),
      });
      // רענון תצוגה
      const blob = new Blob([toPureArrayBuffer(pdfBytes)], { type: 'application/pdf' });
      if (generatedPdfUrl) URL.revokeObjectURL(generatedPdfUrl);
      setGeneratedPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      alert(`שגיאה: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: 4 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gray-900)' }}>
              📨 בקשת ייצוג
            </h1>
            <span className={`badge ${REPRESENTATION_STATUS_BADGE[request.status]}`}>
              {REPRESENTATION_STATUS_LABELS[request.status]}
            </span>
          </div>
          <p style={{ fontSize: '.875rem', color: 'var(--gray-500)' }}>
            {request.clientName || request.clientEmail} · נוצרה {new Date(request.createdAt).toLocaleDateString('he-IL')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onBack}>← חזרה</button>
          {request.status === 'pending_fill' && (
            <button className="btn btn-primary" onClick={() => onOpenFill(request.id)}>
              🧪 הדמיית מילוי
            </button>
          )}
          {request.status === 'awaiting_accountant' && !signMode && (
            <button className="btn btn-green btn-lg" onClick={() => setSignMode(true)}>
              ✍️ חתום ויצור ייפוי כוח חתום
            </button>
          )}
          {request.status === 'awaiting_authorities' && (
            <button className="btn btn-green" onClick={() => onMarkActive(request)}>
              ✓ סמן כמיוצג פעיל
            </button>
          )}
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('למחוק את הבקשה? פעולה זו תמחק גם את הקבצים שהועלו ואת הלקוח שנוצר.')) onDelete(request.id);
            }}
          >🗑️ מחק</button>
        </div>
      </div>

      {/* פרטי הבקשה */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">⚙️ הגדרות הבקשה</div></div>
        <div className="card-body">
          <div className="form-grid form-grid-2">
            <div>
              <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>שם לקוח</div>
              <div style={{ fontWeight: 500 }}>{request.clientName || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>מייל</div>
              <div style={{ fontWeight: 500 }} dir="ltr">{request.clientEmail}</div>
            </div>
            <div>
              <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>סוג ייפוי כוח</div>
              <div style={{ fontWeight: 500 }}>ייפוי כוח ראשי (השעמ)</div>
            </div>
            <div>
              <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>רשויות</div>
              <div style={{ fontWeight: 500 }}>{authorityList}</div>
            </div>
            {request.notes && (
              <div className="span-2">
                <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>הערות שנשלחו ללקוח</div>
                <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{request.notes}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── מסך החתמה של המייצג ──────────────────────────────────────── */}
      {signMode && submission && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--green)' }}>
          <div className="card-header" style={{ background: 'var(--green-light)' }}>
            <div className="card-title">✍️ חתימת המייצג + מילוי חלק ב' של הטופס</div>
          </div>
          <div className="card-body">
            {signErrors.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '.75rem', background: 'var(--red-light)', borderRadius: 'var(--radius)', color: 'var(--red)' }}>
                {signErrors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}

            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label>שם המשרד המייצג <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={partB.firmName} onChange={e => setPartB(p => ({ ...p, firmName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>מספר מייצג <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={partB.representativeNumber} onChange={e => setPartB(p => ({ ...p, representativeNumber: e.target.value }))} dir="ltr" />
              </div>
              <div className="form-group">
                <label>סוג מייצג</label>
                <select
                  value={partB.representativeType}
                  onChange={e => setPartB(p => ({ ...p, representativeType: e.target.value }))}
                >
                  {REP_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" />

              {request.authorities.includes('incomeTax') && (
                <div className="form-group">
                  <label>מספר תיק במס הכנסה (אופציונלי)</label>
                  <input value={partB.incomeTaxFileNumber} onChange={e => setPartB(p => ({ ...p, incomeTaxFileNumber: e.target.value }))} dir="ltr" />
                </div>
              )}
              {request.authorities.includes('vat') && (
                <div className="form-group">
                  <label>מספר עוסק במע"מ (אופציונלי)</label>
                  <input value={partB.vatDealerNumber} onChange={e => setPartB(p => ({ ...p, vatDealerNumber: e.target.value }))} dir="ltr" />
                </div>
              )}
              {request.authorities.includes('withholding') && (
                <div className="form-group">
                  <label>מספר תיק ניכויים (אופציונלי)</label>
                  <input value={partB.withholdingFileNumber} onChange={e => setPartB(p => ({ ...p, withholdingFileNumber: e.target.value }))} dir="ltr" />
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label style={{ marginBottom: '.5rem' }}>חתימה וחותמת המייצג <span style={{ color: 'var(--red)' }}>*</span></label>
              <SignaturePad value={partB.signatureDataUrl} onChange={s => setPartB(p => ({ ...p, signatureDataUrl: s }))} />
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => { setSignMode(false); setSignErrors([]); }} disabled={generating}>
                ביטול
              </button>
              <button className="btn btn-green btn-lg" onClick={handleSignAndGenerate} disabled={generating}>
                {generating ? 'יוצר PDF...' : '✓ חתום ויצור PDF סופי'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PDF סופי שנוצר ──────────────────────────────────────────── */}
      {request.signedPdfStoredId && generatedPdfUrl && !signMode && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--green)' }}>
          <div className="card-header" style={{ background: 'var(--green-light)' }}>
            <div className="card-title">📄 ייפוי כוח חתום (טופס 2279א'5)</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleDownloadPdf}>⬇️ הורד PDF</button>
              <button className="btn btn-secondary" onClick={handleRegeneratePdf} disabled={generating}>
                {generating ? 'מעדכן...' : '🔄 צור מחדש'}
              </button>
              <a href={generatedPdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                👁️ פתח בכרטיסייה חדשה
              </a>
            </div>
            <iframe
              src={generatedPdfUrl}
              title="ייפוי כוח חתום"
              style={{ width: '100%', height: '600px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)' }}
            />
          </div>
        </div>
      )}

      {/* רשימת מסמכים שנדרשו */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">📋 מסמכים שנדרשו ({request.requestedDocs.length})</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {request.requestedDocs.map(doc => {
              const uploaded = submission?.uploadedDocs.find(u => u.docItemId === doc.id);
              return (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.6rem',
                    padding: '.5rem .75rem',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <span>{uploaded ? '✅' : doc.required ? '❌' : '⚪'}</span>
                  <div style={{ flex: 1, fontSize: '.875rem' }}>
                    {doc.label}
                    {doc.required && <span className="badge badge-red" style={{ marginRight: 6, fontSize: '.65rem' }}>חובה</span>}
                  </div>
                  {uploaded && (
                    <span style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{uploaded.fileName}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* הגשה — פרטים שהלקוח מילא */}
      {submission ? (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <div className="card-title">👤 הפרטים שמולאו על ידי הלקוח</div>
            </div>
            <div className="card-body">
              <div className="form-grid form-grid-2">
                <Field label="שם פרטי" value={submission.firstName} />
                <Field label="שם משפחה" value={submission.lastName} />
                <Field label="ת.ז." value={submission.idNumber} ltr />
                <Field label="תאריך לידה" value={submission.birthDate} />
                <Field label="טלפון" value={submission.phone} ltr />
                <Field label="מייל" value={submission.email} ltr />
                <Field label="עיר" value={submission.city} />
                <Field label="כתובת" value={submission.address} />
                <Field label="אישור SMS / מייל" value={submission.allowSmsEmail ? 'אושר' : 'לא אושר'} />
                {submission.notes && (
                  <div className="span-2">
                    <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>הערות הלקוח</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{submission.notes}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* קבצים שהועלו */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header"><div className="card-title">📎 קבצים שהועלו ({docs.length})</div></div>
            <div className="card-body">
              {docs.length === 0 ? (
                <div style={{ color: 'var(--gray-500)', fontSize: '.875rem' }}>אין קבצים</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {docs.map(doc => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '.75rem',
                        padding: '.6rem .8rem',
                        border: '1px solid var(--gray-200)',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>📄</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.875rem', fontWeight: 500 }}>{doc.description}</div>
                        <div style={{ fontSize: '.7rem', color: 'var(--gray-500)' }}>
                          {doc.fileName} · {fmt(doc.fileSize)}
                        </div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => openPreview(doc)}>👁️ צפייה</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* חתימת לקוח */}
          {submission.signatureDataUrl && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header"><div className="card-title">✍️ חתימת הלקוח</div></div>
              <div className="card-body">
                <div style={{
                  border: '1px solid var(--gray-200)',
                  borderRadius: 'var(--radius)',
                  background: 'white',
                  padding: '.5rem',
                  display: 'inline-block',
                }}>
                  <img
                    src={submission.signatureDataUrl}
                    alt="חתימת לקוח"
                    style={{ maxHeight: 150, display: 'block' }}
                  />
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--gray-500)', marginTop: '.5rem' }}>
                  נחתם בתאריך: {new Date(submission.signedAt).toLocaleString('he-IL')}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ background: 'var(--orange-light)', borderColor: 'var(--orange)' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <span style={{ fontSize: '1.5rem' }}>⏳</span>
              <div>
                <strong style={{ color: 'var(--orange)' }}>הלקוח עדיין לא מילא את הטופס</strong>
                <div style={{ fontSize: '.85rem', color: 'var(--gray-700)', marginTop: 4 }}>
                  במצב הדגמה — לחץ על "הדמיית מילוי" כדי לפתוח את הטופס מנקודת המבט של הלקוח.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 'var(--radius)',
              padding: '1rem',
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <strong>{preview.doc.fileName}</strong>
              <button className="btn btn-ghost" onClick={closePreview}>✕</button>
            </div>
            {preview.doc.fileType.startsWith('image/') ? (
              <img src={preview.url} alt={preview.doc.fileName} style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
            ) : preview.doc.fileType === 'application/pdf' ? (
              <iframe src={preview.url} style={{ width: '80vw', height: '75vh', border: 'none' }} title={preview.doc.fileName} />
            ) : (
              <div style={{ padding: '2rem', color: 'var(--gray-600)' }}>לא ניתן להציג קובץ מסוג זה.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>{label}</div>
      <div style={{ fontWeight: 500 }} dir={ltr ? 'ltr' : undefined}>{value || '—'}</div>
    </div>
  );
}

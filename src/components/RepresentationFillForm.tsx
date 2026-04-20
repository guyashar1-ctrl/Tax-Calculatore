import { useState, useMemo } from 'react';
import {
  RepresentationRequest,
  RequestSubmission,
  UploadedDocRef,
  AUTHORITY_LABELS,
  Gender,
} from '../types';
import { useDocumentDB, StoredDoc } from '../hooks/useIndexedDB';
import { analyzeDocument, isGeminiAvailable } from '../utils/geminiVision';
import SignaturePad from './SignaturePad';

interface Props {
  request: RepresentationRequest;
  onSubmit: (submission: RequestSubmission) => void;
  onCancel: () => void;
}

const FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif';

interface FieldState {
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string;
  gender: Gender;
  phone: string;
  email: string;
  city: string;
  address: string;
  notes: string;
}

function emptyFields(req: RepresentationRequest): FieldState {
  // Pre-fill from existing submission if any (for editing) or hint from request
  if (req.submission) {
    const s = req.submission;
    return {
      firstName: s.firstName, lastName: s.lastName, idNumber: s.idNumber,
      birthDate: s.birthDate, gender: s.gender, phone: s.phone, email: s.email,
      city: s.city, address: s.address, notes: s.notes,
    };
  }
  // Try to split clientName hint
  const parts = (req.clientName || '').trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    idNumber: '',
    birthDate: '',
    gender: 'male',
    phone: '',
    email: req.clientEmail || '',
    city: '',
    address: '',
    notes: '',
  };
}

export default function RepresentationFillForm({ request, onSubmit, onCancel }: Props) {
  const db = useDocumentDB();
  const [fields, setFields] = useState<FieldState>(emptyFields(request));
  const [uploads, setUploads] = useState<UploadedDocRef[]>(request.submission?.uploadedDocs ?? []);
  const [signature, setSignature] = useState<string>(request.submission?.signatureDataUrl ?? '');
  const [agreed, setAgreed] = useState<boolean>(!!request.submission);
  const [allowSmsEmail, setAllowSmsEmail] = useState<boolean>(request.submission?.allowSmsEmail ?? true);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState<string | null>(null); // doc item id
  const [ocrStatus, setOcrStatus] = useState<string>(''); // text shown to user during OCR
  const geminiAvailable = isGeminiAvailable();

  const upd = <K extends keyof FieldState>(k: K, v: FieldState[K]) =>
    setFields(f => ({ ...f, [k]: v }));

  /** ממזג נתונים שחולצו מ-OCR לתוך השדות, רק לשדות ריקים. */
  function applyOcrToFields(extracted: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    birthDate?: string;
    gender?: 'male' | 'female';
    city?: string;
    address?: string;
  }) {
    setFields(prev => ({
      ...prev,
      firstName: prev.firstName || extracted.firstName || '',
      lastName: prev.lastName || extracted.lastName || '',
      idNumber: prev.idNumber || extracted.idNumber || '',
      birthDate: prev.birthDate || extracted.birthDate || '',
      gender: prev.gender || extracted.gender || 'male',
      city: prev.city || extracted.city || '',
      address: prev.address || extracted.address || '',
    }));
  }

  async function handleFileChange(docItemId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(docItemId);
    try {
      const buf = await file.arrayBuffer();
      const storedId = `req-${request.id}-${docItemId}-${crypto.randomUUID().slice(0, 8)}`;
      const doc: StoredDoc = {
        id: storedId,
        clientId: `req-${request.id}`, // יוחלף ל-clientId אמיתי בעת ההמרה
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        category: docItemId === 'id_card' ? 'id_card'
                : docItemId === 'drivers_license' ? 'drivers_license'
                : 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: request.requestedDocs.find(d => d.id === docItemId)?.label || file.name,
        notes: '',
        fileData: buf,
      };
      await db.saveDoc(doc);
      setUploads(prev => {
        // הסרת קובץ קודם עבור אותו doc item (החלפה)
        const old = prev.find(u => u.docItemId === docItemId);
        if (old) db.deleteDoc(old.storedDocId);
        const filtered = prev.filter(u => u.docItemId !== docItemId);
        return [...filtered, { docItemId, storedDocId: storedId, fileName: file.name, fileSize: file.size }];
      });

      // ─── OCR אוטומטי לת.ז. ורישיון נהיגה ─────────────────────────────
      if (geminiAvailable && (docItemId === 'id_card' || docItemId === 'drivers_license')) {
        setOcrStatus(docItemId === 'id_card' ? 'מנתח תעודת זהות...' : 'מנתח רישיון נהיגה...');
        try {
          const result = await analyzeDocument(
            buf,
            file.type,
            docItemId === 'id_card' ? 'id_card' : 'drivers_license'
          );
          if (result.success && result.data) {
            applyOcrToFields(result.data);
            setOcrStatus(`✓ הפרטים חולצו ומולאו אוטומטית מ${docItemId === 'id_card' ? 'תעודת הזהות' : 'רישיון הנהיגה'}`);
            setTimeout(() => setOcrStatus(''), 4000);
          } else {
            setOcrStatus(`לא הצלחנו לחלץ פרטים אוטומטית — אנא מלא ידנית`);
            setTimeout(() => setOcrStatus(''), 4000);
          }
        } catch {
          setOcrStatus('שגיאה בניתוח אוטומטי — אנא מלא ידנית');
          setTimeout(() => setOcrStatus(''), 4000);
        }
      }
    } finally {
      setUploading(null);
    }
  }

  async function removeUpload(docItemId: string) {
    const u = uploads.find(x => x.docItemId === docItemId);
    if (!u) return;
    await db.deleteDoc(u.storedDocId);
    setUploads(prev => prev.filter(x => x.docItemId !== docItemId));
  }

  function validate(): string[] {
    const e: string[] = [];
    if (!fields.firstName.trim()) e.push('יש להזין שם פרטי');
    if (!fields.lastName.trim()) e.push('יש להזין שם משפחה');
    if (!fields.idNumber.trim()) e.push('יש להזין תעודת זהות');
    else if (!/^\d{5,9}$/.test(fields.idNumber.trim())) e.push('תעודת זהות לא תקינה');
    if (!fields.phone.trim()) e.push('יש להזין מספר טלפון');
    else if (!/^[\d\-+\s()]{7,}$/.test(fields.phone.trim())) e.push('מספר טלפון לא תקין');
    if (!fields.email.trim()) e.push('יש להזין מייל');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) e.push('מייל לא תקין');

    // מסמכי חובה
    for (const doc of request.requestedDocs) {
      if (doc.required && !uploads.some(u => u.docItemId === doc.id)) {
        e.push(`חסר מסמך חובה: ${doc.label}`);
      }
    }
    if (!agreed) e.push('יש לאשר את ייפוי הכוח');
    if (!signature) e.push('יש לחתום על ייפוי הכוח');
    return e;
  }

  function handleSubmit() {
    const e = validate();
    if (e.length) {
      setErrors(e);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors([]);
    const submission: RequestSubmission = {
      ...fields,
      uploadedDocs: uploads,
      signatureDataUrl: signature,
      signedAt: new Date().toISOString(),
      allowSmsEmail,
    };
    onSubmit(submission);
  }

  const authorityList = useMemo(
    () => request.authorities.map(a => AUTHORITY_LABELS[a]).join(', '),
    [request.authorities]
  );

  const fmt = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gray-900)' }}>
              📨 בקשת ייצוג — מילוי פרטים
            </h1>
            <p style={{ fontSize: '.875rem', color: 'var(--gray-500)', marginTop: 2 }}>
              ייפוי כוח ראשי (השעמ) מול: {authorityList}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onCancel}>← חזרה</button>
        </div>
      </div>

      {/* OCR status banner */}
      {ocrStatus && (
        <div className="card" style={{ marginBottom: '1rem', background: 'var(--blue-light)', borderColor: 'var(--blue)' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', color: 'var(--blue-dark)' }}>
            <span style={{ fontSize: '1.1rem' }}>🤖</span>
            <span>{ocrStatus}</span>
          </div>
        </div>
      )}

      {/* תזכורת מהמייצג */}
      {request.notes && (
        <div className="card" style={{ marginBottom: '1rem', background: 'var(--blue-light)', borderColor: 'var(--blue)' }}>
          <div className="card-body">
            <div style={{ fontSize: '.75rem', color: 'var(--blue-dark)', fontWeight: 600, marginBottom: 4 }}>הודעה מהמייצג:</div>
            <div style={{ fontSize: '.875rem', color: 'var(--gray-700)', whiteSpace: 'pre-wrap' }}>{request.notes}</div>
          </div>
        </div>
      )}

      {/* שגיאות */}
      {errors.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--red)', background: 'var(--red-light)' }}>
          <div className="card-body" style={{ color: 'var(--red)' }}>
            {errors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        </div>
      )}

      {/* פרטים אישיים */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <div className="card-title">👤 פרטים אישיים</div>
        </div>
        <div className="card-body">
          {geminiAvailable && (
            <div style={{ fontSize: '.8rem', color: 'var(--gray-500)', marginBottom: '.75rem' }}>
              💡 העלאת תעודת זהות או רישיון נהיגה תמלא חלק מהפרטים אוטומטית
            </div>
          )}
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>שם פרטי <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={fields.firstName} onChange={e => upd('firstName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>שם משפחה <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={fields.lastName} onChange={e => upd('lastName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>תעודת זהות <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={fields.idNumber} onChange={e => upd('idNumber', e.target.value)} dir="ltr" />
            </div>
            <div className="form-group">
              <label>תאריך לידה</label>
              <input type="date" value={fields.birthDate} onChange={e => upd('birthDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>מין</label>
              <select value={fields.gender} onChange={e => upd('gender', e.target.value as Gender)}>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
            <div className="form-group">
              <label>טלפון <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={fields.phone} onChange={e => upd('phone', e.target.value)} dir="ltr" placeholder="050-1234567" />
            </div>
            <div className="form-group">
              <label>מייל <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="email" value={fields.email} onChange={e => upd('email', e.target.value)} dir="ltr" />
            </div>
            <div className="form-group">
              <label>עיר</label>
              <input value={fields.city} onChange={e => upd('city', e.target.value)} />
            </div>
            <div className="form-group span-2">
              <label>כתובת</label>
              <input value={fields.address} onChange={e => upd('address', e.target.value)} />
            </div>
            <div className="form-group span-2">
              <label>הערות (אופציונלי)</label>
              <textarea
                rows={2}
                value={fields.notes}
                onChange={e => upd('notes', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* העלאת מסמכים */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <div className="card-title">📎 העלאת מסמכים</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {request.requestedDocs.map(doc => {
              const uploaded = uploads.find(u => u.docItemId === doc.id);
              return (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.75rem',
                    padding: '.75rem',
                    border: `1px solid ${uploaded ? 'var(--green)' : 'var(--gray-200)'}`,
                    borderRadius: 'var(--radius)',
                    background: uploaded ? 'var(--green-light)' : 'white',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{uploaded ? '✅' : '📄'}</span>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: '.9rem', fontWeight: 500 }}>
                      {doc.label}
                      {doc.required && <span style={{ color: 'var(--red)', marginRight: 4 }}>*</span>}
                    </div>
                    {uploaded ? (
                      <div style={{ fontSize: '.75rem', color: 'var(--gray-600)' }}>
                        {uploaded.fileName} · {fmt(uploaded.fileSize)}
                      </div>
                    ) : (
                      <div style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>
                        {doc.required ? 'חובה' : 'לא חובה'}
                      </div>
                    )}
                  </div>
                  {uploaded ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeUpload(doc.id)}
                      style={{ color: 'var(--red)' }}
                    >🗑️ הסר</button>
                  ) : (
                    <label className="btn btn-secondary btn-sm" style={{ margin: 0 }}>
                      {uploading === doc.id ? 'מעלה...' : '+ העלה קובץ'}
                      <input
                        type="file"
                        accept={FILE_ACCEPT}
                        style={{ display: 'none' }}
                        disabled={uploading === doc.id}
                        onChange={e => handleFileChange(doc.id, e.target.files)}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ייפוי כוח + חתימה */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><div className="card-title">⚖️ ייפוי כוח (טופס 2279א'5 — השעמ)</div></div>
        <div className="card-body">
          <div
            style={{
              padding: '1rem',
              background: 'var(--gray-50)',
              border: '1px solid var(--gray-200)',
              borderRadius: 'var(--radius)',
              fontSize: '.85rem',
              color: 'var(--gray-700)',
              lineHeight: 1.7,
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '.5rem' }}>נוסח ייפוי הכוח:</div>
            <p>
              אני הח"מ, <strong>{fields.firstName} {fields.lastName}</strong>
              {fields.idNumber && <>, ת.ז. <strong>{fields.idNumber}</strong></>},
              מייפה/ים בזה את כוחו של המייצג ושל כל עובדיו הרשאים לייצג נישומים על פי כל דין,
              להיות בא כוחי ולפעול בשמי בכל פעולה שהינה בסמכותו לפי החוק, בקשר לכל אותן הפעולות
              שאני רשאי וחייב לעשותן לפי פקודת מס הכנסה, חוק מע"מ וחוק מס רכוש לרבות פשרה.
            </p>
            <p>
              ייפוי כוח זה תקף ל-24 חודשים מיום קליטתו או חתימתו (לפי המאוחר) אם הוא מיועד לטיפול
              בהחזר מס ליחיד שאינו חייב בהגשת דו"ח (סוג תיק 9.1). במקרים אחרים — תקף עד למתן הודעת ביטול.
            </p>
            <p>
              הייצוג כולל סמכות לפעול מול הרשויות הבאות: <strong>{authorityList}</strong>.
            </p>
            <p style={{ fontSize: '.75rem', color: 'var(--gray-500)' }}>
              * חתימתך תיחתם דיגיטלית על טופס 2279א'5. לאחר ההגשה, רואה החשבון יחתום ויוסיף את חותמת המשרד.
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', marginBottom: '.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span style={{ fontSize: '.875rem' }}>
              אני מאשר/ת את האמור לעיל ונותן/ת ייפוי כוח למייצג כמתואר.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', marginBottom: '1rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allowSmsEmail}
              onChange={e => setAllowSmsEmail(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span style={{ fontSize: '.875rem' }}>
              אני מאשר/ת לרשות המסים לשלוח אליי הודעות באמצעות SMS או דואר אלקטרוני.
            </span>
          </label>

          <div className="form-group">
            <label style={{ marginBottom: '.5rem' }}>חתימה <span style={{ color: 'var(--red)' }}>*</span></label>
            <SignaturePad value={signature} onChange={setSignature} />
          </div>
        </div>
      </div>

      {/* שליחה */}
      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={onCancel}>ביטול</button>
        <button className="btn btn-primary btn-lg" onClick={handleSubmit}>📤 שלח את הבקשה</button>
      </div>
    </div>
  );
}

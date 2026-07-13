import { useEffect, useState } from 'react';
import {
  RepresentationRequest,
  RequestSubmission,
  Gender,
  AccountantPartB,
  AUTHORITY_LABELS,
  REPRESENTATION_STATUS_LABELS,
  REPRESENTATION_STATUS_BADGE,
  ONBOARDING_SECONDARY_LABELS,
} from '../types';
import { useDocumentDB, StoredDoc } from '../hooks/useIndexedDB';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { generateSignedPoaPdf, downloadPdfBytes, toPureArrayBuffer } from '../utils/poaPdfGenerator';
import SignaturePad from './SignaturePad';
import RepSignersStatus from './RepSignersStatus';
import { isSpouseRequest, getRequestSigners, effectiveSignStatus } from '../utils/repSigners';
import { SignatureSetup, SignatureValue } from '../types';
import PoaProduceEditor from './signatureRequest/PoaProduceEditor';
import SigningRoom, { SavedMarks } from './signatureRequest/SigningRoom';
import { burnSignaturesIntoPdf } from '../utils/signaturePdf';

interface Props {
  request: RepresentationRequest;
  onBack: () => void;
  /** שלב הפקת הטופס: ה-PDF הועלה, האזורים סומנו — לשלוח קישורי חתימה */
  onProduceWithSetup: (req: RepresentationRequest, setup: SignatureSetup) => Promise<void> | void;
  /** ה-PDF הסופי (חתום + חותמת) נשמר; ממתין ל"נשלח לשע"ם" */
  onSaveSignedPdf: (req: RepresentationRequest, values: Record<string, SignatureValue>, signedPdfStoredId: string) => Promise<void> | void;
  onMarkSentToShaam: (req: RepresentationRequest) => Promise<void> | void;
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
  onProduceWithSetup,
  onSaveSignedPdf,
  onMarkSentToShaam,
  onSign,
  onMarkActive,
  onDelete,
  onOpenFill,
}: Props) {
  const db = useDocumentDB();
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null);
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
    // טעינת ה-PDF החתום אם קיים. תלוי ב-user כדי לא לרוץ לפני שההזדהות נטענה
    // (אחרת getDoc מחזיר undefined ולא מנסה שוב).
    if (request.signedPdfStoredId && user) {
      db.getDoc(request.signedPdfStoredId).then(d => {
        if (d && d.fileData.byteLength > 0) {
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
  }, [request.signedPdfStoredId, user]);

  // טעינת פרופיל המשרד — לחותמת ולמילוי מוקדם של חלק ב'
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', u.user.id).single();
      setProfile(data);
    })();
  }, []);

  useEffect(() => {
    if (!profile) return;
    setPartB(p => ({
      ...p,
      firmName: p.firmName || profile.firm_name || '',
      representativeNumber: p.representativeNumber || profile.representative_number || '',
      representativeType: p.representativeType || profile.representative_type || 'רואה חשבון',
    }));
  }, [profile]);

  const submission = request.submission;
  const authorityList = request.authorities.map(a => AUTHORITY_LABELS[a]).join(', ');

  // בקשות אונבורדינג חדשות (Phase 2): מזוהות ע"י טוקן; הזרימה הישנה (מסמכים/הדמיה/חתימה) לא רלוונטית להן.
  const isNewOnboarding = !!request.onboardingToken;
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  async function resendEmail(stage: 'onboard' | 'sign' = 'onboard') {
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-onboarding-email', { body: { requestId: request.id, stage } });
      if (error) setEmailStatus(`⚠ ${error.message}`);
      else if (data?.ok) setEmailStatus(`✓ מייל נשלח ל-${request.clientEmail}`);
      else setEmailStatus(`⚠ ${data?.detail?.message || data?.error || 'שליחה נכשלה'}`);
    } catch (e) {
      setEmailStatus(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSendingEmail(false);
    }
  }
  const ident = request.identification;
  const onboardingSubmitted = request.onboardingStatus === 'submitted';
  const onboardingLink = request.onboardingToken
    ? `${window.location.origin}/?onboard=${request.onboardingToken}`
    : '';
  const newFlowNote =
    request.status === 'awaiting_accountant' ? 'מוכן — לחצו "הפק טופס ושלח לחתימה" למעלה.'
    : request.status === 'pending_signature' ? 'הטופס נשלח ללקוח לחתימה.'
    : request.status === 'awaiting_stamp' ? 'הלקוח חתם — חתמו והוסיפו חותמת (כפתור למעלה).'
    : request.status === 'awaiting_authorities' ? 'נשלח לשע"מ, ממתין לאישור.'
    : request.status === 'active' ? 'הלקוח מיוצג פעיל ✓'
    : 'הפרטים נכתבו לכרטיס הלקוח.';

  const fmt = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  async function openPreview(doc: StoredDoc) {
    // doc מ-getDocsByClient — מטא בלבד. טוענים את הבייטים בפועל מהענן.
    let bytes = doc.fileData;
    if (bytes.byteLength === 0) {
      const full = await db.getDoc(doc.id);
      if (!full || full.fileData.byteLength === 0) return;
      bytes = full.fileData;
    }
    const blob = new Blob([bytes], { type: doc.fileType || 'application/octet-stream' });
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

  // בונה RequestSubmission: בזרימה הישנה מגיע מוכן; בזרימת האונבורדינג נבנה מהזיהוי + החתימה.
  function buildSubmission(): RequestSubmission | null {
    if (request.submission) return request.submission;
    if (!request.onboardingToken) return null;
    const ident = request.identification || {};
    const nameParts = (request.clientName || '').trim().split(/\s+/);
    return {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      idNumber: ident.idNumber || '',
      birthDate: ident.birthDate || '',
      gender: 'male' as Gender,
      phone: '',
      email: request.clientEmail || '',
      city: '',
      address: '',
      notes: '',
      uploadedDocs: [],
      signatureDataUrl: ident.signatureDataUrl || '',
      signedAt: ident.signedAt || '',
      allowSmsEmail: false,
    };
  }

  // תמונת מיתוג (חותמת/חתימה) כ-dataURL. pdf-lib תומך ב-PNG/JPG בלבד — SVG מדולג.
  async function loadBrandingImage(url?: string): Promise<string | undefined> {
    if (!url || /\.svg(\?|$)/i.test(url)) return undefined;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(new Error('image read failed'));
        fr.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }
  const loadStampDataUrl = () => loadBrandingImage(profile?.branding?.stampUrl);

  // ── זרימת החתימה החדשה: עורך הפקה + חדר חתימה של הרו"ח ──
  const setup = request.signatureSetup;
  const [showProduceEditor, setShowProduceEditor] = useState(false);
  const [stampRoom, setStampRoom] = useState<{ pdfBytes: ArrayBuffer; marks: SavedMarks } | null>(null);
  const [stampError, setStampError] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  async function openStampRoom() {
    if (!setup) return;
    setStampError('');
    try {
      const doc = await db.getDoc(setup.pdfDocId);
      if (!doc || doc.fileData.byteLength === 0) throw new Error('ה-PDF שהועלה לא נמצא במאגר המסמכים');
      const [sig, stamp] = await Promise.all([
        loadBrandingImage(profile?.branding?.signatureUrl),
        loadBrandingImage(profile?.branding?.stampUrl),
      ]);
      setStampRoom({ pdfBytes: doc.fileData, marks: { signature: sig, stamp } });
    } catch (e) {
      setStampError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleStampComplete(values: Record<string, SignatureValue>) {
    if (!setup || !stampRoom) return;
    setFinalizing(true);
    try {
      const merged = { ...(request.signatureValues || {}), ...values };
      const burned = await burnSignaturesIntoPdf(stampRoom.pdfBytes.slice(0), setup.fields, merged);
      const storedId = `signed-poa-${request.id}`;
      await db.saveDoc({
        id: storedId,
        clientId: request.linkedClientId,
        fileName: `${request.clientName || 'לקוח'} — ייפוי כוח חתום.pdf`,
        fileType: 'application/pdf',
        fileSize: burned.byteLength,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: 'ייפוי כוח חתום (כל החותמים + חותמת המשרד)',
        notes: '',
        fileData: toPureArrayBuffer(burned),
      });
      await onSaveSignedPdf(request, merged, storedId);
      const blob = new Blob([toPureArrayBuffer(burned)], { type: 'application/pdf' });
      if (generatedPdfUrl) URL.revokeObjectURL(generatedPdfUrl);
      setGeneratedPdfUrl(URL.createObjectURL(blob));
      setStampRoom(null);
    } catch (e) {
      setStampError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalizing(false);
    }
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
      const sub = buildSubmission();
      if (!sub) throw new Error('חסרים נתוני הלקוח');
      const stampDataUrl = await loadStampDataUrl();
      // יצירת PDF סופי — עם חתימת הלקוח, חתימת המייצג, וחותמת המשרד
      const pdfBytes = await generateSignedPoaPdf({
        request: { ...request, submission: sub, partB: filledPartB },
        stampDataUrl,
      });

      // שמירה ל-IndexedDB
      const storedId = `signed-poa-${request.id}`;
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
          {!isNewOnboarding && request.status === 'pending_fill' && (
            <button className="btn btn-primary" onClick={() => onOpenFill(request.id)}>
              🧪 הדמיית מילוי
            </button>
          )}
          {!isNewOnboarding && request.status === 'awaiting_accountant' && !signMode && (
            <button className="btn btn-green btn-lg" onClick={() => setSignMode(true)}>
              ✍️ חתום ויצור ייפוי כוח חתום
            </button>
          )}
          {isNewOnboarding && request.status === 'awaiting_accountant' && onboardingSubmitted && (
            <button className="btn btn-green btn-lg" onClick={() => setShowProduceEditor(true)}>
              📄 העלה טופס וסמן אזורי חתימה
            </button>
          )}
          {request.status === 'awaiting_stamp' && setup && !request.signedPdfStoredId && (
            <button className="btn btn-green btn-lg" onClick={() => void openStampRoom()}>
              ✍️ חתום + הוסף חותמת
            </button>
          )}
          {request.status === 'awaiting_stamp' && setup && request.signedPdfStoredId && (
            <button className="btn btn-green btn-lg" onClick={() => void onMarkSentToShaam(request)}>
              📤 נשלח לשע"ם
            </button>
          )}
          {isNewOnboarding && request.status === 'awaiting_stamp' && !setup && !signMode && (
            <button className="btn btn-green btn-lg" onClick={() => setSignMode(true)}>
              ✍️ חתום + הוסף חותמת
            </button>
          )}
          {request.status === 'awaiting_authorities' && (
            <button className="btn btn-green" onClick={() => onMarkActive(request)}>
              ✓ סמן כמיוצג פעיל (אושר בשע"ם)
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

      {/* סטטוס חתימות — נישום + בן/בת זוג */}
      {isSpouseRequest(request) && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><div className="card-title">✍ סטטוס חתימות</div></div>
          <div className="card-body">
            <RepSignersStatus request={request} />
          </div>
        </div>
      )}

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
      {signMode && (
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

      {/* רשימת מסמכים שנדרשו — רק בזרימה הישנה */}
      {!isNewOnboarding && (
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
      )}

      {/* פרטי ההזדהות (זרימת אונבורדינג חדשה) / ההגשה (זרימה ישנה) */}
      {isNewOnboarding ? (
        onboardingSubmitted ? (
          <>
            {ident && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><div className="card-title">👤 פרטי הזדהות שהלקוח מילא</div></div>
                <div className="card-body">
                  <div className="form-grid form-grid-2">
                    <Field label="תעודת זהות" value={ident.idNumber || ''} ltr />
                    <Field label="תאריך לידה" value={ident.birthDate || ''} ltr />
                    <Field label={ident.secondaryType ? ONBOARDING_SECONDARY_LABELS[ident.secondaryType] : 'מזהה משני'} value={ident.secondaryValue || ''} ltr />
                    <Field label="נשלח בתאריך" value={request.onboardingSubmittedAt ? new Date(request.onboardingSubmittedAt).toLocaleString('he-IL') : ''} />
                  </div>
                  <div style={{ marginTop: '.75rem', fontSize: '.8rem', color: 'var(--gray-500)' }}>✓ {newFlowNote}</div>
                </div>
              </div>
            )}

            {request.status === 'pending_signature' && setup && (
              <div className="card" style={{ background: 'var(--orange-light)', borderColor: 'var(--orange)', marginBottom: '1rem' }}>
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.6rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>✍️</span>
                    <strong style={{ color: 'var(--orange)' }}>נשלח לחתימה — קישור אישי לכל חותם</strong>
                  </div>
                  {getRequestSigners(request).map(s => {
                    const signed = effectiveSignStatus(request, s) === 'signed';
                    const link = s.signToken ? `${window.location.origin}/?sign=${s.signToken}` : '';
                    return (
                      <div key={s.id} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '.5rem' }}>
                        <span style={{ minWidth: 150, fontSize: '.85rem', fontWeight: signed ? 600 : 400, color: signed ? '#0F6E56' : 'var(--gray-700)' }}>
                          👤 {s.name} — {signed ? '✅ חתם/ה' : '⏳ ממתין/ה'}
                        </span>
                        {!signed && link && (
                          <>
                            <input readOnly value={link} dir="ltr" style={{ flex: 1, minWidth: 160, fontSize: '.75rem' }} onFocus={e => e.currentTarget.select()} />
                            <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(link).catch(() => {}); }}>העתק</button>
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={sendingEmail}
                              onClick={async () => {
                                setSendingEmail(true); setEmailStatus(null);
                                try {
                                  const { data, error } = await supabase.functions.invoke('send-onboarding-email', { body: { requestId: request.id, stage: 'sign', signerId: s.id } });
                                  setEmailStatus(error || !data?.ok ? `⚠ ${error?.message || data?.error || 'שליחה נכשלה'}` : `✓ מייל נשלח ל-${s.email}`);
                                } finally { setSendingEmail(false); }
                              }}
                            >📧 שלח</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {emailStatus && (
                    <div style={{ marginTop: '.25rem', fontSize: '.8rem', color: emailStatus.startsWith('✓') ? '#0F6E56' : 'var(--red)' }}>{emailStatus}</div>
                  )}
                </div>
              </div>
            )}
            {request.status === 'pending_signature' && !setup && (
              <div className="card" style={{ background: 'var(--orange-light)', borderColor: 'var(--orange)', marginBottom: '1rem' }}>
                <div className="card-body">
                  <div style={{ fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: '.6rem' }}>הטופס נשלח ללקוח לחתימה (זרימה ותיקה).</div>
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    <input readOnly value={onboardingLink} dir="ltr" style={{ flex: 1, minWidth: 180, fontSize: '.8rem' }} onFocus={e => e.currentTarget.select()} />
                    <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(onboardingLink).catch(() => {}); }}>העתק קישור</button>
                    <button className="btn btn-primary btn-sm" onClick={() => resendEmail('sign')} disabled={sendingEmail}>
                      {sendingEmail ? 'שולח…' : '📧 שלח קישור חתימה'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {request.status === 'awaiting_stamp' && request.identification?.signatureDataUrl && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-header"><div className="card-title">✍️ חתימת הלקוח התקבלה</div></div>
                <div className="card-body">
                  <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', background: 'white', padding: '.5rem', display: 'inline-block' }}>
                    <img src={request.identification.signatureDataUrl} alt="חתימת לקוח" style={{ maxHeight: 120, display: 'block' }} />
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--gray-600)', marginTop: '.6rem' }}>
                    לחצו "חתום + הוסף חותמת" למעלה כדי לחתום, להטביע את חותמת המשרד, וליצור את ה-PDF הסופי.
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card" style={{ background: 'var(--orange-light)', borderColor: 'var(--orange)', marginBottom: '1rem' }}>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.6rem' }}>
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
                <strong style={{ color: 'var(--orange)' }}>ממתין למילוי הלקוח</strong>
              </div>
              <div style={{ fontSize: '.85rem', color: 'var(--gray-700)', marginBottom: '.6rem' }}>
                שלחו ללקוח את קישור ההזדהות. כשימלא — הפרטים יופיעו כאן.
              </div>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <input readOnly value={onboardingLink} dir="ltr" style={{ flex: 1, minWidth: 180, fontSize: '.8rem' }} onFocus={e => e.currentTarget.select()} />
                <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(onboardingLink).catch(() => {}); }}>העתק קישור</button>
                <button className="btn btn-primary btn-sm" onClick={() => resendEmail('onboard')} disabled={sendingEmail}>
                  {sendingEmail ? 'שולח…' : '📧 שלח מייל שוב'}
                </button>
              </div>
              {emailStatus && (
                <div style={{ marginTop: '.5rem', fontSize: '.8rem', color: emailStatus.startsWith('✓') ? 'var(--green-dark, #0F6E56)' : 'var(--red)' }}>{emailStatus}</div>
              )}
            </div>
          </div>
        )
      ) : submission ? (
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

      {/* עורך הפקת הטופס — העלאת PDF + סימון אזורי חתימה */}
      {showProduceEditor && (
        <PoaProduceEditor
          request={request}
          onCancel={() => setShowProduceEditor(false)}
          onContinue={async (s) => { await onProduceWithSetup(request, s); setShowProduceEditor(false); }}
        />
      )}

      {/* חדר החתימה של הרו"ח — חתימה + חותמת על ה-PDF שהלקוחות כבר חתמו */}
      {stampRoom && setup && (
        <SigningRoom
          pdfBytes={stampRoom.pdfBytes.slice(0)}
          pdfFileName={setup.pdfFileName}
          fields={setup.fields}
          signers={[
            ...getRequestSigners(request).map((s, i) => ({ id: s.id, source: 'manual' as const, name: s.name, email: s.email, order: i + 1 })),
            { id: 'accountant', source: 'manual' as const, name: 'אני — רו"ח', email: '', order: 99 },
          ]}
          activeSignerId="accountant"
          savedMarks={stampRoom.marks}
          initialValues={request.signatureValues || {}}
          title={finalizing ? 'מייצר PDF סופי…' : '✍ חתימה + חותמת המשרד'}
          onComplete={v => void handleStampComplete(v)}
          onCancel={() => setStampRoom(null)}
        />
      )}
      {stampError && (
        <div style={{ position: 'fixed', bottom: 16, insetInlineStart: 16, background: 'var(--red-light)', color: 'var(--red)', padding: '.6rem .9rem', borderRadius: 8, zIndex: 1200, fontSize: '.85rem' }}>
          ⚠ {stampError}
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

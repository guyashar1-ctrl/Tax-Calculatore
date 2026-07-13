// ─── חדר החתימה ──────────────────────────────────────────────────────────
// חוויית חתימה בסגנון WeSign: החותם רואה את ה-PDF עם כל מקומות החתימה מסומנים,
// לוחץ על מקום → נפתח חלון חתימה (ציור / העלאת תמונה / חתימה שמורה), החתימה
// נשמרת לשימוש חוזר לאורך התהליך, יש חיווי כמה נחתם וניווט אוטומטי למקום הבא.
// בסיום — ההורה מטביע את הערכים על ה-PDF (burnSignaturesIntoPdf).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SignatureField,
  SignatureFieldKind,
  SignatureValue,
  Signer,
  SIGNATURE_FIELD_KIND_LABELS,
} from '../../types';
import { loadPdf, renderPage, PdfDocument } from '../../utils/pdfRender';
import SignaturePad from '../SignaturePad';

export interface SavedMarks {
  signature?: string; // dataURL PNG/JPG
  stamp?: string;     // dataURL PNG/JPG
}

interface Props {
  pdfBytes: ArrayBuffer;                       // עותק שאפשר "לצרוך" (pdfjs מנתק את ה-buffer)
  pdfFileName?: string;
  fields: SignatureField[];
  signers: Signer[];
  activeSignerId: string;                      // מי חותם עכשיו
  savedMarks?: SavedMarks;                      // חתימה/חותמת שמורות (רו"ח) — הוספה בלחיצה
  initialValues?: Record<string, SignatureValue>; // ערכים שכבר מולאו (חותם קודם)
  title?: string;
  onComplete: (values: Record<string, SignatureValue>) => void;
  onCancel: () => void;
}

const SIGNER_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#ec4899', '#0891b2'];
const colorForSigner = (signers: Signer[], id: string) =>
  SIGNER_COLORS[Math.max(0, signers.findIndex(s => s.id === id)) % SIGNER_COLORS.length];

export default function SigningRoom(p: Props) {
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [pages, setPages] = useState<{ width: number; height: number }[]>([]);
  const [loadError, setLoadError] = useState('');
  const [values, setValues] = useState<Record<string, SignatureValue>>(p.initialValues ?? {});

  // חתימה/חותמת אחרונות של החותם הנוכחי — לשימוש חוזר ("להשתמש בקודמת?")
  const [lastMark, setLastMark] = useState<Partial<Record<SignatureFieldKind, string>>>({});

  // חלונות משנה
  const [signModal, setSignModal] = useState<{ field: SignatureField } | null>(null);
  const [textModal, setTextModal] = useState<{ field: SignatureField } | null>(null);
  const [reusePrompt, setReusePrompt] = useState<{ field: SignatureField; dataUrl: string } | null>(null);

  const markerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── טעינת ה-PDF פעם אחת ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { doc, pages: pgs } = await loadPdf(p.pdfBytes);
        if (cancelled) return;
        setPdfDoc(doc);
        setPages(pgs.map(pg => ({ width: pg.width, height: pg.height })));
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [p.pdfBytes]);

  const activeColor = colorForSigner(p.signers, p.activeSignerId);
  const activeSigner = p.signers.find(s => s.id === p.activeSignerId);

  const myFields = useMemo(
    () => p.fields.filter(f => f.signerId === p.activeSignerId),
    [p.fields, p.activeSignerId],
  );
  const doneCount = myFields.filter(f => !!values[f.id]).length;
  const allDone = myFields.length > 0 && doneCount === myFields.length;
  const nextUnfilled = myFields.find(f => !values[f.id]);

  function scrollToField(fieldId: string) {
    const el = markerRefs.current[fieldId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setFieldValue(field: SignatureField, patch: Partial<SignatureValue>) {
    setValues(prev => ({
      ...prev,
      [field.id]: { fieldId: field.id, signedAt: new Date().toISOString(), ...patch },
    }));
    // ניווט אוטומטי למקום הבא שעדיין לא נחתם
    const remaining = myFields.filter(f => f.id !== field.id && !values[f.id]);
    if (remaining[0]) setTimeout(() => scrollToField(remaining[0].id), 200);
  }

  // ── לחיצה על שדה של החותם הנוכחי ──
  function clickField(field: SignatureField) {
    if (field.signerId !== p.activeSignerId) return;
    if (field.kind === 'text') {
      setTextModal({ field });
      return;
    }
    const cached = lastMark[field.kind];
    if (cached) {
      setReusePrompt({ field, dataUrl: cached });
    } else {
      setSignModal({ field });
    }
  }

  function applyImage(field: SignatureField, dataUrl: string) {
    setFieldValue(field, { imageDataUrl: dataUrl });
    setLastMark(prev => ({ ...prev, [field.kind]: dataUrl }));
    setSignModal(null);
    setReusePrompt(null);
  }

  if (loadError) {
    return (
      <div className="modal-backdrop" onClick={p.onCancel}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
          <div className="modal-header"><h3>שגיאה בטעינת המסמך</h3></div>
          <div className="modal-body"><div style={{ color: 'var(--red)' }}>⚠ {loadError}</div></div>
          <div className="modal-footer"><button className="btn btn-secondary" onClick={p.onCancel}>סגור</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" style={{ alignItems: 'stretch' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 940, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '96vh' }}>

        {/* כותרת + התקדמות */}
        <div className="modal-header" style={{ borderBottom: `3px solid ${activeColor}` }}>
          <div>
            <h3 style={{ margin: 0 }}>{p.title || '✍ חתימה על המסמך'}</h3>
            <div style={{ fontSize: '.82rem', color: 'var(--gray-600)', marginTop: 2 }}>
              {activeSigner?.name ? <>חותם/ת: <strong style={{ color: activeColor }}>{activeSigner.name}</strong> · </> : null}
              נחתמו {doneCount} מתוך {myFields.length}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={p.onCancel}>✕</button>
        </div>

        {/* פס הנחיה + כפתור "למקום הבא" */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem 1rem',
          background: allDone ? 'var(--green-light)' : `${activeColor}12`, borderBottom: '1px solid var(--gray-200)',
        }}>
          <span style={{ fontSize: '1.2rem' }}>{allDone ? '✅' : '👇'}</span>
          <div style={{ flex: 1, fontSize: '.88rem', color: 'var(--gray-800)' }}>
            {allDone
              ? 'כל מקומות החתימה מולאו. אפשר לסיים.'
              : <>לחצו על מקום החתימה המסומן כדי לחתום. נותרו <strong>{myFields.length - doneCount}</strong> מקומות.</>}
          </div>
          {!allDone && nextUnfilled && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => scrollToField(nextUnfilled.id)}>
              למקום הבא ↓
            </button>
          )}
        </div>

        {/* גוף — עמודי ה-PDF עם הסימונים */}
        <div className="modal-body" style={{ flex: 1, overflow: 'auto', background: 'var(--gray-100)', padding: '1rem' }}>
          {!pdfDoc ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>טוען מסמך…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              {pages.map((_, idx) => (
                <SigningPage
                  key={idx}
                  pdfDoc={pdfDoc}
                  pageIndex={idx}
                  fields={p.fields.filter(f => f.pageIndex === idx)}
                  signers={p.signers}
                  activeSignerId={p.activeSignerId}
                  values={values}
                  onClickField={clickField}
                  registerRef={(fid, el) => { markerRefs.current[fid] = el; }}
                />
              ))}
            </div>
          )}
        </div>

        {/* כפתורי תחתית */}
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={p.onCancel}>ביטול</button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!allDone}
            onClick={() => p.onComplete(values)}
          >
            {allDone ? '✓ סיום וחתימה' : `נותרו ${myFields.length - doneCount} מקומות`}
          </button>
        </div>
      </div>

      {/* חלון חתימה (ציור / העלאה / שמורה) */}
      {signModal && (
        <SignCaptureModal
          kind={signModal.field.kind}
          color={activeColor}
          savedMark={signModal.field.kind === 'stamp' ? p.savedMarks?.stamp : p.savedMarks?.signature}
          onConfirm={(dataUrl) => applyImage(signModal.field, dataUrl)}
          onCancel={() => setSignModal(null)}
        />
      )}

      {/* חלון "להשתמש בחתימה הקודמת?" */}
      {reusePrompt && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header"><h3>נמצאה {SIGNATURE_FIELD_KIND_LABELS[reusePrompt.field.kind]} קודמת</h3></div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 8, display: 'inline-block', background: 'white' }}>
                <img src={reusePrompt.dataUrl} alt="" style={{ maxHeight: 90, maxWidth: 260 }} />
              </div>
              <p style={{ marginTop: '.75rem', color: 'var(--gray-700)', fontSize: '.9rem' }}>
                להשתמש באותה {SIGNATURE_FIELD_KIND_LABELS[reusePrompt.field.kind]} גם כאן?
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { const f = reusePrompt.field; setReusePrompt(null); setSignModal({ field: f }); }}>
                צור חדשה
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-primary" onClick={() => applyImage(reusePrompt.field, reusePrompt.dataUrl)}>
                השתמש בקודמת
              </button>
            </div>
          </div>
        </div>
      )}

      {/* חלון טקסט (תאריך / שם) */}
      {textModal && (
        <TextCaptureModal
          placeholder={textModal.field.placeholder}
          initial={values[textModal.field.id]?.text || ''}
          onConfirm={(text) => { setFieldValue(textModal.field, { text }); setTextModal(null); }}
          onCancel={() => setTextModal(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//                       עמוד יחיד + סימונים
// ─────────────────────────────────────────────────────────────────────

interface PageProps {
  pdfDoc: PdfDocument;
  pageIndex: number;
  fields: SignatureField[];
  signers: Signer[];
  activeSignerId: string;
  values: Record<string, SignatureValue>;
  onClickField: (f: SignatureField) => void;
  registerRef: (fieldId: string, el: HTMLDivElement | null) => void;
}

function SigningPage(p: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    (async () => {
      try {
        await renderPage(p.pdfDoc, p.pageIndex, canvas, 1.4);
        if (!cancelled) setReady(true);
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') console.error('render page failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [p.pdfDoc, p.pageIndex]);

  return (
    <div style={{ position: 'relative', boxShadow: '0 2px 10px rgba(0,0,0,.12)', background: 'white', lineHeight: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
      {ready && p.fields.map(f => {
        const mine = f.signerId === p.activeSignerId;
        const val = p.values[f.id];
        const filled = !!val;
        const color = colorForSigner(p.signers, f.signerId);
        const signer = p.signers.find(s => s.id === f.signerId);
        const label = SIGNATURE_FIELD_KIND_LABELS[f.kind];
        return (
          <div
            key={f.id}
            ref={el => p.registerRef(f.id, el)}
            onClick={() => mine && !filled && p.onClickField(f)}
            title={mine ? (filled ? `${label} — לחץ להחלפה` : `לחץ ל${label}`) : `${label} של ${signer?.name || 'חותם אחר'}`}
            style={{
              position: 'absolute',
              left: `${f.xPct * 100}%`,
              top: `${f.yPct * 100}%`,
              width: `${f.widthPct * 100}%`,
              height: `${f.heightPct * 100}%`,
              boxSizing: 'border-box',
              border: filled ? `2px solid var(--green, #059669)` : (mine ? `2px dashed ${color}` : `1.5px dotted ${color}99`),
              background: filled ? 'transparent' : (mine ? `${color}18` : `${color}0d`),
              borderRadius: 4,
              cursor: mine && !filled ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              animation: mine && !filled ? 'sigPulse 1.6s ease-in-out infinite' : undefined,
            }}
          >
            {filled ? (
              val.imageDataUrl
                ? <img src={val.imageDataUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: '.7rem', color: '#111', lineHeight: 1.1, padding: '0 2px', textAlign: 'center' }}>{val.text}</span>
            ) : (
              <span style={{ fontSize: '.68rem', fontWeight: 600, color, lineHeight: 1.1, textAlign: 'center', pointerEvents: 'none' }}>
                {mine ? `✍ ${label}` : `${label} · ${signer?.name?.split(' ')[0] || ''}`}
              </span>
            )}
            {mine && filled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); p.onClickField(f); }}
                style={{ position: 'absolute', top: -9, insetInlineEnd: -9, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--gray-700)', color: 'white', fontSize: 10, cursor: 'pointer', lineHeight: '18px', padding: 0 }}
                title="החלף"
              >↺</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//                חלון לכידת חתימה/חותמת (ציור / העלאה / שמורה)
// ─────────────────────────────────────────────────────────────────────

function SignCaptureModal(props: {
  kind: SignatureFieldKind;
  color: string;
  savedMark?: string;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'draw' | 'upload'>('draw');
  const [drawn, setDrawn] = useState('');
  const [uploaded, setUploaded] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const label = SIGNATURE_FIELD_KIND_LABELS[props.kind];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/image\/(png|jpe?g)/i.test(f.type)) { alert('יש להעלות תמונה PNG או JPG'); return; }
    const reader = new FileReader();
    reader.onload = () => setUploaded(String(reader.result || ''));
    reader.readAsDataURL(f);
  }

  const current = tab === 'draw' ? drawn : uploaded;

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header"><h3>הוספת {label}</h3><button className="btn btn-ghost btn-icon" onClick={props.onCancel}>✕</button></div>
        <div className="modal-body">
          {props.savedMark && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginBottom: '.85rem', display: 'flex', alignItems: 'center', gap: '.6rem', justifyContent: 'center' }}
              onClick={() => props.onConfirm(props.savedMark!)}
            >
              <img src={props.savedMark} alt="" style={{ maxHeight: 34, maxWidth: 120, background: 'white' }} />
              השתמש ב{label} השמורה שלי
            </button>
          )}

          <div className="sig-kind-toggle" style={{ marginBottom: '.85rem' }}>
            <button type="button" className={tab === 'draw' ? 'active' : ''} onClick={() => setTab('draw')}>✍ ציור</button>
            <button type="button" className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>📤 העלאת תמונה</button>
          </div>

          {tab === 'draw' ? (
            <SignaturePad value={drawn} onChange={setDrawn} height={170} />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleFile} />
              {uploaded ? (
                <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 10, background: 'white', display: 'inline-block' }}>
                  <img src={uploaded} alt="" style={{ maxHeight: 150, maxWidth: '100%' }} />
                </div>
              ) : (
                <div style={{ border: '2px dashed var(--gray-300)', borderRadius: 8, padding: '2rem', color: 'var(--gray-500)' }}>
                  תמונת {label} (PNG/JPG). מומלץ רקע שקוף.
                </div>
              )}
              <div style={{ marginTop: '.7rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  {uploaded ? 'בחר תמונה אחרת' : '📤 בחר תמונה'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ביטול</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary" disabled={!current} onClick={() => props.onConfirm(current)}>
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//                        חלון טקסט (תאריך / שם)
// ─────────────────────────────────────────────────────────────────────

function TextCaptureModal(props: {
  placeholder?: string;
  initial: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(props.initial);
  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h3>{props.placeholder || 'הזנת טקסט'}</h3><button className="btn btn-ghost btn-icon" onClick={props.onCancel}>✕</button></div>
        <div className="modal-body">
          <input
            type="text"
            autoFocus
            value={text}
            placeholder={props.placeholder}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && text.trim()) props.onConfirm(text.trim()); }}
            style={{ width: '100%' }}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={props.onCancel}>ביטול</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => props.onConfirm(text.trim())}>אישור</button>
        </div>
      </div>
    </div>
  );
}

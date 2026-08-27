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
  /**
   * חותמים שמקומות החתימה שלהם לא יוצגו כלל. הלקוח לא אמור לראות איפה הרו"ח
   * חותם — זה מבלבל אותו ומעלה שאלות על טופס שאינו שלם. תוכן קבוע (טקסט,
   * ✓/✗ שהרו"ח הניח בהפקה) תמיד מוצג, כי הוא חלק מהטופס עצמו.
   */
  hiddenSignerIds?: string[];
  /** מאפשר לגרור ולשנות גודל של חתימות שכבר מולאו — לפני שה-PDF הסופי נצרב. */
  adjustable?: boolean;
  /**
   * תווית כפתור הסיום. ‼ כשיש עוד טופס אחרי זה — "סיום וחתימה" משקר: הלקוח
   * חושב שסיים וסוגר את החלון, ונשאר טופס לא חתום. ברירת המחדל נשמרת.
   */
  completeLabel?: string;
  onComplete: (values: Record<string, SignatureValue>, fields: SignatureField[]) => void;
  onCancel: () => void;
}

/** תוכן שהרו"ח הניח בהפקה — נצרב תמיד, לא שייך לאף חותם. */
const STATIC_KINDS: SignatureFieldKind[] = ['label', 'check', 'cross'];
const isStatic = (k: SignatureFieldKind) => STATIC_KINDS.includes(k);

/** מלבן יחסי (0..1) של שדה על העמוד. */
export interface FieldRect { xPct: number; yPct: number; widthPct: number; heightPct: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// צבעי החותמים מסומנים על דף PDF לבן — ערכים קבועים, לא תלויי ערכה
const SIGNER_COLORS = ['#3f5f8f', '#2e7d5b', '#b07515', '#6b4a87', '#a4406a', '#17767c'];
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

  // גאומטריה מעודכנת של שדות שהוזזו/שונו בגודלם בחדר הזה. מוחלת על ה-PDF
  // הסופי, ולכן היא הצורה האמיתית של הטופס מרגע השינוי.
  const [geom, setGeom] = useState<Record<string, FieldRect>>({});
  const fields = useMemo(
    () => p.fields.map(f => (geom[f.id] ? { ...f, ...geom[f.id] } : f)),
    [p.fields, geom],
  );

  const visibleFields = useMemo(() => {
    const hidden = new Set(p.hiddenSignerIds || []);
    return fields.filter(f => isStatic(f.kind) || !hidden.has(f.signerId));
  }, [fields, p.hiddenSignerIds]);

  const myFields = useMemo(
    () => visibleFields.filter(f => f.signerId === p.activeSignerId),
    [visibleFields, p.activeSignerId],
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
          <div className="modal-body"><div style={{ color: 'var(--danger)' }}>{loadError}</div></div>
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
            <h3 style={{ margin: 0 }}>{p.title || 'חתימה על המסמך'}</h3>
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: 2 }}>
              {activeSigner?.name ? <>חותם/ת: <strong style={{ color: activeColor }}>{activeSigner.name}</strong> · </> : null}
              נחתמו {doneCount} מתוך {myFields.length}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={p.onCancel}>✕</button>
        </div>

        {/* פס הנחיה + כפתור "למקום הבא" */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.6rem 1rem',
          background: allDone ? 'var(--green-light)' : `${activeColor}12`, borderBottom: '1px solid var(--hairline-1)',
        }}>
          <span style={{ fontSize: 'var(--fs-20)' }}>{allDone ? '✅' : '👇'}</span>
          <div style={{ flex: 1, fontSize: 'var(--fs-14)', color: 'var(--ink-1)' }}>
            {allDone
              ? 'כל מקומות החתימה מולאו. אפשר לסיים.'
              : <>לחצו על מקום החתימה המסומן כדי לחתום. נותרו <strong>{myFields.length - doneCount}</strong> מקומות.</>}
            {p.adjustable && (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: 2 }}>
                כל חתימה על הטופס - שלכם ושל הלקוח - ניתנת לגרירה, ולשינוי גודל מהפינה. כך היא תיצרב ב-PDF.
              </div>
            )}
          </div>
          {!allDone && nextUnfilled && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => scrollToField(nextUnfilled.id)}>
              למקום הבא ↓
            </button>
          )}
        </div>

        {/* גוף — עמודי ה-PDF עם הסימונים */}
        <div className="modal-body" style={{ flex: 1, overflow: 'auto', background: 'var(--hairline-2)', padding: '1rem' }}>
          {!pdfDoc ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink-3)' }}>טוען מסמך…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              {pages.map((_, idx) => (
                <SigningPage
                  key={idx}
                  pdfDoc={pdfDoc}
                  pageIndex={idx}
                  fields={visibleFields.filter(f => f.pageIndex === idx)}
                  signers={p.signers}
                  activeSignerId={p.activeSignerId}
                  values={values}
                  adjustable={!!p.adjustable}
                  onClickField={clickField}
                  onAdjustField={(id, rect) => setGeom(prev => ({ ...prev, [id]: rect }))}
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
            onClick={() => p.onComplete(values, fields)}
          >
            {allDone ? (p.completeLabel || 'סיום וחתימה') : `נותרו ${myFields.length - doneCount} מקומות`}
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
              <div style={{ border: '1px solid var(--hairline-1)', borderRadius: 8, padding: 8, display: 'inline-block', background: 'white' }}>
                <img src={reusePrompt.dataUrl} alt="" style={{ maxHeight: 90, maxWidth: 260 }} />
              </div>
              <p style={{ marginTop: '.75rem', color: 'var(--ink-2)', fontSize: 'var(--fs-14)' }}>
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
  adjustable: boolean;
  onClickField: (f: SignatureField) => void;
  onAdjustField: (fieldId: string, rect: FieldRect) => void;
  registerRef: (fieldId: string, el: HTMLDivElement | null) => void;
}

function SigningPage(p: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // גרירה/מתיחה פעילה. moved מבדיל בין לחיצה (=החלפת חתימה) לגרירה.
  const drag = useRef<
    | { id: string; mode: 'move' | 'resize'; x0: number; y0: number; rect: FieldRect; pw: number; ph: number; moved: boolean }
    | null
  >(null);
  const justDragged = useRef(false);

  function beginDrag(e: React.PointerEvent, f: SignatureField, mode: 'move' | 'resize') {
    const wrap = wrapRef.current;
    if (!p.adjustable || !wrap) return;
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    drag.current = {
      id: f.id, mode, x0: e.clientX, y0: e.clientY, pw: r.width, ph: r.height, moved: false,
      rect: { xPct: f.xPct, yPct: f.yPct, widthPct: f.widthPct, heightPct: f.heightPct },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function moveDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3 && Math.abs(e.clientY - d.y0) < 3) return;
    d.moved = true;
    const dx = (e.clientX - d.x0) / d.pw;
    const dy = (e.clientY - d.y0) / d.ph;
    if (d.mode === 'move') {
      p.onAdjustField(d.id, {
        ...d.rect,
        xPct: clamp(d.rect.xPct + dx, 0, 1 - d.rect.widthPct),
        yPct: clamp(d.rect.yPct + dy, 0, 1 - d.rect.heightPct),
      });
    } else {
      p.onAdjustField(d.id, {
        ...d.rect,
        widthPct: clamp(d.rect.widthPct + dx, 0.02, 1 - d.rect.xPct),
        heightPct: clamp(d.rect.heightPct + dy, 0.01, 1 - d.rect.yPct),
      });
    }
  }

  function endDrag() {
    if (drag.current?.moved) {
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
    }
    drag.current = null;
  }

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
    <div ref={wrapRef} style={{ position: 'relative', boxShadow: '0 2px 10px rgba(0,0,0,.12)', background: 'white', lineHeight: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
      {ready && p.fields.map(f => {
        // תוכן קבוע שהרו"ח הניח בהפקה — מוצג כפי שיודפס, לא אינטראקטיבי
        if (f.kind === 'label' || f.kind === 'check' || f.kind === 'cross') {
          return (
            <div
              key={f.id}
              style={{
                position: 'absolute',
                left: `${f.xPct * 100}%`,
                top: `${f.yPct * 100}%`,
                width: `${f.widthPct * 100}%`,
                height: `${f.heightPct * 100}%`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
                fontWeight: 600, color: '#111',
                fontSize: f.kind === 'label' ? '.72rem' : '1rem',
                lineHeight: 1.1, overflow: 'hidden', textAlign: 'center',
              }}
            >
              {f.kind === 'check' ? '✓' : f.kind === 'cross' ? '✗' : f.staticText}
            </div>
          );
        }
        const mine = f.signerId === p.activeSignerId;
        const val = p.values[f.id];
        const filled = !!val;
        const color = colorForSigner(p.signers, f.signerId);
        const signer = p.signers.find(s => s.id === f.signerId);
        const label = SIGNATURE_FIELD_KIND_LABELS[f.kind];
        // גרירה מותרת רק על מה שכבר נחתם — מלבן ריק אין טעם להזיז
        const movable = p.adjustable && filled;
        return (
          <div
            key={f.id}
            ref={el => p.registerRef(f.id, el)}
            onClick={() => { if (justDragged.current) return; if (mine && !filled) p.onClickField(f); }}
            onPointerDown={movable ? e => beginDrag(e, f, 'move') : undefined}
            onPointerMove={movable ? moveDrag : undefined}
            onPointerUp={movable ? endDrag : undefined}
            onPointerCancel={movable ? endDrag : undefined}
            title={movable ? `${label} של ${signer?.name || ''} - גררו להזזה, מהפינה לשינוי גודל`
              : mine ? (filled ? `${label} - לחץ להחלפה` : `לחץ ל${label}`) : `${label} של ${signer?.name || 'חותם אחר'}`}
            style={{
              position: 'absolute',
              left: `${f.xPct * 100}%`,
              top: `${f.yPct * 100}%`,
              width: `${f.widthPct * 100}%`,
              height: `${f.heightPct * 100}%`,
              boxSizing: 'border-box',
              border: filled
                ? (movable ? '2px dashed var(--blue, #3f5f8f)' : '2px solid var(--green, var(--ok))')
                : (mine ? `2px dashed ${color}` : `1.5px dotted ${color}99`),
              background: filled ? 'transparent' : (mine ? `${color}18` : `${color}0d`),
              borderRadius: 4,
              cursor: movable ? 'move' : (mine && !filled ? 'pointer' : 'default'),
              touchAction: movable ? 'none' : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: movable ? 'visible' : 'hidden',
              animation: mine && !filled ? 'sigPulse 1.6s ease-in-out infinite' : undefined,
            }}
          >
            {filled ? (
              val.imageDataUrl
                ? <img src={val.imageDataUrl} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }} />
                : <span style={{ fontSize: 'var(--fs-12)', color: '#111', lineHeight: 1.1, padding: '0 2px', textAlign: 'center' }}>{val.text}</span>
            ) : (
              <span style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color, lineHeight: 1.1, textAlign: 'center', pointerEvents: 'none' }}>
                {mine ? `${label}` : `${label} · ${signer?.name?.split(' ')[0] || ''}`}
              </span>
            )}
            {mine && filled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (!justDragged.current) p.onClickField(f); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ position: 'absolute', top: -9, insetInlineEnd: -9, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--ink-2)', color: 'white', fontSize: 'var(--fs-12)', cursor: 'pointer', lineHeight: '18px', padding: 0 }}
                title="החלף"
              >↺</button>
            )}
            {/* ידית שינוי גודל — פינה תחתונה, מחוץ למלבן כדי שלא תכסה את החתימה */}
            {movable && (
              <div
                onPointerDown={e => beginDrag(e, f, 'resize')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClick={e => e.stopPropagation()}
                title="גררו לשינוי גודל"
                style={{
                  position: 'absolute', right: -7, bottom: -7, width: 14, height: 14,
                  borderRadius: 3, background: 'var(--blue, #3f5f8f)', border: '2px solid #fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,.3)', cursor: 'nwse-resize', touchAction: 'none',
                }}
              />
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
            <button type="button" className={tab === 'draw' ? 'active' : ''} onClick={() => setTab('draw')}>ציור</button>
            <button type="button" className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>העלאת תמונה</button>
          </div>

          {tab === 'draw' ? (
            <SignaturePad value={drawn} onChange={setDrawn} height={170} />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleFile} />
              {uploaded ? (
                <div style={{ border: '1px solid var(--hairline-1)', borderRadius: 8, padding: 10, background: 'white', display: 'inline-block' }}>
                  <img src={uploaded} alt="" style={{ maxHeight: 150, maxWidth: '100%' }} />
                </div>
              ) : (
                <div style={{ border: '2px dashed var(--hairline-1)', borderRadius: 8, padding: '2rem', color: 'var(--ink-3)' }}>
                  תמונת {label} (PNG/JPG). מומלץ רקע שקוף.
                </div>
              )}
              <div style={{ marginTop: '.7rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  {uploaded ? 'בחר תמונה אחרת' : 'בחר תמונה'}
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

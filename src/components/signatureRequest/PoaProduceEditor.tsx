// ─── עורך הפקת טופס ייפוי הכוח ─────────────────────────────────────────────
// השלב המרכזי בזרימת הייצוג: הרו"ח מעלה את ה-PDF האמיתי ומסמן עליו את כל
// אזורי החתימה — של הלקוח, של בן/בת הזוג (אם קיים/ת), שלו עצמו + חותמת המשרד.
// רק אחרי שהכול מסומן, "המשך ושלח לחתימה" שולח את קישורי החתימה האישיים.

import { useMemo, useRef, useState } from 'react';
import {
  RepresentationRequest,
  SignatureField,
  SignatureFieldKind,
  SignatureSetup,
  Signer,
  STATIC_FIELD_KINDS,
} from '../../types';
import { getRequestSigners } from '../../utils/repSigners';
import { loadPdf, PdfDocument } from '../../utils/pdfRender';
import { useDocumentDB } from '../../hooks/useIndexedDB';
import { FieldsPanel, DEFAULT_FIELD_SIZES } from './SignatureRequestEditor';

interface Props {
  request: RepresentationRequest;
  onContinue: (setup: SignatureSetup) => Promise<void> | void;
  onCancel: () => void;
}

export default function PoaProduceEditor({ request, onContinue, onCancel }: Props) {
  const docDb = useDocumentDB();

  // חותמים לסימון: הלקוח, בן/בת הזוג אם יש, ותמיד "אני (רו"ח + חותמת)"
  const signers: Signer[] = useMemo(() => {
    const reps = getRequestSigners(request);
    const list: Signer[] = reps.map((s, i) => ({
      id: s.id, source: 'manual', name: s.name, email: s.email, order: i + 1,
    }));
    list.push({ id: 'accountant', source: 'manual', name: 'אני — רו"ח', email: '', order: list.length + 1 });
    return list;
  }, [request]);

  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfPages, setPdfPages] = useState<{ width: number; height: number }[]>([]);
  const [pdfLoadError, setPdfLoadError] = useState('');
  const pdfDocId = useRef(`poa-pdf-${request.id}`).current;

  const [fields, setFields] = useState<SignatureField[]>(request.signatureSetup?.fields ?? []);
  const [activeSignerId, setActiveSignerId] = useState(signers[0].id);
  const [activeKind, setActiveKind] = useState<SignatureFieldKind>('signature');
  const [lastSizes, setLastSizes] = useState({ ...DEFAULT_FIELD_SIZES });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFileSelected(file: File) {
    setPdfLoadError('');
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfLoadError(`הקובץ "${file.name}" אינו PDF.`);
      return;
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch (err: any) {
      setPdfLoadError(`שגיאה בקריאת הקובץ: ${err?.message || err}`);
      return;
    }
    try {
      await docDb.saveDoc({
        id: pdfDocId,
        clientId: request.linkedClientId,
        fileName: file.name,
        fileType: file.type || 'application/pdf',
        fileSize: file.size,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: 'טופס ייפוי כוח — לחתימה',
        notes: '',
        fileData: bytes.slice(0),
        linkedTo: `rep:${request.id}`,
        linkedLabel: 'ייפוי כוח לחתימה',
      });
    } catch (err: any) {
      setPdfLoadError(`שגיאה בהעלאה לענן: ${err?.message || err}`);
      return;
    }
    setPdfFileName(file.name);
    if (fields.length > 0 && confirm('להחליף PDF? הסימונים הקיימים יימחקו.')) setFields([]);
    try {
      const { doc, pages } = await loadPdf(bytes);
      setPdfDoc(doc);
      setPdfPages(pages.map(p => ({ width: p.width, height: p.height })));
    } catch (err: any) {
      setPdfLoadError(`לא הצלחתי לטעון את ה-PDF: ${err?.message || err}`);
    }
  }

  // "טקסט שלי": במקום prompt של הדפדפן — מודל מעוצב; שומרים את נקודת הלחיצה עד לאישור
  const [labelDraft, setLabelDraft] = useState<{ pageIndex: number; xPct: number; yPct: number; text: string } | null>(null);

  function placeField(kind: SignatureFieldKind, pageIndex: number, xPct: number, yPct: number, staticText?: string) {
    const { w, h } = lastSizes[kind];
    const isStatic = STATIC_FIELD_KINDS.includes(kind);
    setFields(prev => [...prev, {
      id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      // תוכן קבוע לא שייך לאף חותם — הוא נצרב על הטופס לפני השליחה
      signerId: isStatic ? 'static' : activeSignerId,
      kind,
      pageIndex,
      xPct: Math.max(0, Math.min(1 - w, xPct - w / 2)),
      yPct: Math.max(0, Math.min(1 - h, yPct - h / 2)),
      widthPct: w,
      heightPct: h,
      ...(staticText ? { staticText } : {}),
    }]);
  }

  function addFieldAt(pageIndex: number, xPct: number, yPct: number) {
    if (activeKind === 'label') {
      setLabelDraft({ pageIndex, xPct, yPct, text: '' });
      return;
    }
    placeField(activeKind, pageIndex, xPct, yPct);
  }

  function confirmLabelDraft() {
    if (!labelDraft || !labelDraft.text.trim()) return;
    placeField('label', labelDraft.pageIndex, labelDraft.xPct, labelDraft.yPct, labelDraft.text.trim());
    setLabelDraft(null);
  }

  // ── שלמות הסימון: כל חותם צריך חתימה אחת; לרו"ח מספיקה חתימה או חותמת ──
  const checklist = useMemo(() => {
    const items: { label: string; done: boolean }[] = [{ label: 'הועלה קובץ PDF', done: !!pdfDoc }];
    for (const s of signers) {
      if (s.id === 'accountant') continue;
      items.push({ label: `חתימה של ${s.name}`, done: fields.some(f => f.signerId === s.id && f.kind === 'signature') });
    }
    items.push({
      label: 'חתימה או חותמת שלי (רו"ח)',
      done: fields.some(f => f.signerId === 'accountant' && (f.kind === 'signature' || f.kind === 'stamp')),
    });
    return items;
  }, [pdfDoc, fields, signers]);
  const ready = checklist.every(c => c.done);

  async function handleContinue() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await onContinue({
        pdfDocId,
        pdfFileName,
        fields,
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err?.message || String(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" style={{ alignItems: 'stretch' }}>
      <div className="modal sig-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1060, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '96vh' }}>
        <div className="modal-header">
          <h3>הפקת טופס — סימון אזורי חתימה</h3>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onCancel} disabled={busy}>✕</button>
        </div>

        {/* צ'קליסט שלמות — מה שחסר בולט בכתום */}
        <div style={{ display: 'flex', gap: '.9rem', flexWrap: 'wrap', padding: '.55rem 1rem', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', fontSize: '.78rem' }}>
          {checklist.map(c => (
            <span
              key={c.label}
              style={{
                color: c.done ? 'var(--green-dark, var(--ok))' : 'var(--warn)',
                fontWeight: 600,
                background: c.done ? 'transparent' : 'var(--chip-amber-bg)',
                padding: c.done ? undefined : '2px 8px',
                borderRadius: 8,
              }}
            >
              {c.done ? '✓' : 'חסר:'} {c.label}
            </span>
          ))}
        </div>

        <div className="modal-body sig-body" style={{ flex: 1, overflow: 'auto' }}>
          <FieldsPanel
            kinds={['signature', 'stamp', 'text', 'label', 'check', 'cross']}
            pdfDoc={pdfDoc}
            pdfFileName={pdfFileName}
            pdfPages={pdfPages}
            pdfLoadError={pdfLoadError}
            handleFileSelected={f => void handleFileSelected(f)}
            fields={fields}
            signers={signers}
            activeSignerId={activeSignerId}
            setActiveSignerId={setActiveSignerId}
            activeKind={activeKind}
            setActiveKind={setActiveKind}
            addFieldAt={addFieldAt}
            removeField={id => setFields(prev => prev.filter(f => f.id !== id))}
            updateField={(id, patch) => setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))}
            rememberSize={(kind, w, h) => setLastSizes(prev => ({ ...prev, [kind]: { w, h } }))}
          />
        </div>

        {error && (
          <div style={{ padding: '.5rem 1rem', color: 'var(--red)', fontSize: '.85rem' }}>{error}</div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>ביטול</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-primary btn-lg" onClick={handleContinue} disabled={!ready || busy}>
            {busy
              ? 'שולח…'
              : ready
              ? 'המשך ושלח לחתימה'
              : `חסר: ${checklist.filter(c => !c.done).map(c => c.label).join(' · ')}`}
          </button>
        </div>
      </div>

      {/* מודל "טקסט שלי" — מחליף את prompt של הדפדפן */}
      {labelDraft && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={e => { if (e.target === e.currentTarget) setLabelDraft(null); }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>טקסט על הטופס</h3>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setLabelDraft(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginBottom: '.6rem' }}>
                הטקסט ייכתב על הטופס במקום שלחצת, לפני השליחה לחתימה. אפשר לגרור ולשנות גודל אחר כך.
              </div>
              <input
                type="text"
                autoFocus
                value={labelDraft.text}
                placeholder="למשל: שם המשרד, מספר תיק…"
                onChange={e => setLabelDraft(d => d ? { ...d, text: e.target.value } : d)}
                onKeyDown={e => { if (e.key === 'Enter') confirmLabelDraft(); if (e.key === 'Escape') setLabelDraft(null); }}
                style={{ width: '100%' }}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setLabelDraft(null)}>ביטול</button>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-primary" disabled={!labelDraft.text.trim()} onClick={confirmLabelDraft}>
                הוסף לטופס
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

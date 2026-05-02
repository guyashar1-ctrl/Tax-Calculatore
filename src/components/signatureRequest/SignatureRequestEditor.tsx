// ─── עורך בקשת חתימה ─────────────────────────────────────────────────────
// מודל בן 2 שלבים שנפתח מתוך TaskForm:
//   שלב 1 — חותמים: בחירה מאנשי הקשר של הלקוח + הוספת חיצוניים + סדר חתימה.
//   שלב 2 — סימון: העלאת PDF, רינדור עם pdfjs, ולחיצה על העמוד מסמנת מיקום
//            חתימה / טקסט עבור חותם נבחר.
//
// בשלב הזה — שמירה למשימה בלבד. שליחה במייל / חתימה אמיתית = Phase 2.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Client,
  SignatureField,
  SignatureFieldKind,
  SignatureRequest,
  Signer,
} from '../../types';
import { ClientContact } from '../../types/clientWorkspace';
import { loadPdf, renderPage, PdfDocument } from '../../utils/pdfRender';
import { useDocumentDB } from '../../hooks/useIndexedDB';

interface Props {
  client: Client | undefined;        // הלקוח שהמשימה משויכת אליו (אם יש)
  taskId: string;                    // מזהה המשימה (לשמירה ב-IndexedDB אם נצטרך)
  initial?: SignatureRequest;        // אם כבר קיימת — עריכה
  onSave: (req: SignatureRequest, updatedClient?: Client) => void;
  onCancel: () => void;
}

type Step = 'signers' | 'fields';

// ── עזרי אנשי קשר ────────────────────────────────────────────────────
function buildClientSelfContact(c: Client): { id: string; name: string; email: string; phone: string } {
  const name = `${c.firstName} ${c.lastName}`.trim() || '(הנישום)';
  return { id: 'self', name, email: c.email || '', phone: c.phone || '' };
}

// PDFים של בקשות חתימה נשמרים עכשיו ב-Supabase Storage (כמו שאר המסמכים),
// בקטגוריה 'other' עם linkedTo='signature:<taskId>'. ראה useDocumentStore.

// ─────────────────────────────────────────────────────────────────────
//                              MAIN
// ─────────────────────────────────────────────────────────────────────

export default function SignatureRequestEditor({
  client,
  taskId,
  initial,
  onSave,
  onCancel,
}: Props) {
  const docDb = useDocumentDB();
  const [step, setStep] = useState<Step>('signers');

  // ── State: חותמים ──
  const [signers, setSigners] = useState<Signer[]>(initial?.signers ?? []);
  const [requireOrder, setRequireOrder] = useState<boolean>(initial?.requireOrder ?? false);

  // ── State: PDF ──
  // pdfDoc — מופע pdfjs מוכן לרינדור עמוד נתון (נטען פעם אחת ומשותף לכל העמודים).
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>(initial?.pdfFileName ?? '');
  const [pdfPages, setPdfPages] = useState<{ width: number; height: number }[]>([]);
  const [pdfLoadError, setPdfLoadError] = useState<string>('');
  // מזהה רשומת המסמך ב-Supabase. נוצר חד-פעמית. אם נטען מ-initial — משתמשים במזהה הקיים.
  const [pdfDocId] = useState<string>(initial?.pdfDocId ?? `sigpdf-${taskId}-${Date.now()}`);

  // ── State: שדות לסימון ──
  const [fields, setFields] = useState<SignatureField[]>(initial?.fields ?? []);
  const [activeSignerId, setActiveSignerId] = useState<string>('');
  const [activeKind, setActiveKind] = useState<SignatureFieldKind>('signature');
  // גודל ברירת מחדל לכל סוג סימון — עדכון אחרי resize ידני, כדי שהבא יהיה באותו גודל.
  const [lastSizes, setLastSizes] = useState<Record<SignatureFieldKind, { w: number; h: number }>>({
    signature: { w: 0.22, h: 0.06 },
    text:      { w: 0.18, h: 0.035 },
  });

  // ── הוספת חותם חיצוני ──
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualDraft, setManualDraft] = useState({ name: '', email: '', phone: '', saveToClientContacts: true });

  // ── טעינת PDF קיים מהענן אם יש (רק בפתיחה ראשונית) ──
  useEffect(() => {
    if (!initial?.pdfDocId) return;
    let cancelled = false;
    docDb.getDoc(initial.pdfDocId).then(d => {
      if (!d || cancelled) return;
      if (d.fileData.byteLength > 0) {
        ingestPdfBytes(d.fileData.slice(0));
      }
    }).catch(err => console.warn('loadPdf from cloud failed', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.pdfDocId]);

  // טעינת bytes ל-pdfjs פעם אחת — שומר את ה-doc, ועמודים יזכו לרינדור משותף.
  async function ingestPdfBytes(bytes: ArrayBuffer) {
    console.log('[sig] ingestPdfBytes start, bytes:', bytes.byteLength);
    try {
      setPdfLoadError('');
      const { doc, pages } = await loadPdf(bytes);
      console.log('[sig] loadPdf done, pages:', pages.length);
      setPdfDoc(doc);
      setPdfPages(pages.map(p => ({ width: p.width, height: p.height })));
    } catch (err: any) {
      console.error('[sig] loadPdf failed', err);
      setPdfLoadError(`לא הצלחתי לטעון את ה-PDF: ${err?.message || err}`);
      setPdfDoc(null);
      setPdfPages([]);
    }
  }

  // ── חותם נוכחי לבחירה ──
  useEffect(() => {
    if (signers.length > 0 && !signers.some(s => s.id === activeSignerId)) {
      setActiveSignerId(signers[0].id);
    }
  }, [signers, activeSignerId]);

  // ── רשימת אנשי קשר לבחירה משלב 1 ──
  const candidateContacts = useMemo(() => {
    if (!client) return [];
    const list: { id: string; label: string; signer: Omit<Signer, 'order'> }[] = [];
    const self = buildClientSelfContact(client);
    list.push({
      id: self.id,
      label: `${self.name} (הנישום)`,
      signer: { id: self.id, source: 'client_self', name: self.name, email: self.email, phone: self.phone },
    });
    for (const c of client.additionalContacts ?? []) {
      list.push({
        id: c.id,
        label: `${c.name} · ${c.role}`,
        signer: {
          id: c.id,
          source: 'client_contact',
          sourceContactId: c.id,
          name: c.name,
          email: c.email || '',
          phone: c.phone || '',
        },
      });
    }
    return list;
  }, [client]);

  // ── פעולות חותמים ──
  function isContactSelected(id: string): boolean {
    return signers.some(s => s.id === id);
  }
  function toggleContact(id: string) {
    const cand = candidateContacts.find(c => c.id === id);
    if (!cand) return;
    if (isContactSelected(id)) {
      setSigners(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
    } else {
      setSigners(prev => [...prev, { ...cand.signer, order: prev.length + 1 }]);
    }
  }
  function addManualSigner() {
    if (!manualDraft.name.trim() || !manualDraft.email.trim()) return;
    const id = `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setSigners(prev => [...prev, {
      id,
      source: 'manual',
      name: manualDraft.name.trim(),
      email: manualDraft.email.trim(),
      phone: manualDraft.phone.trim() || undefined,
      order: prev.length + 1,
      saveToClientContacts: !!manualDraft.saveToClientContacts,
    }]);
    setManualDraft({ name: '', email: '', phone: '', saveToClientContacts: true });
    setShowAddManual(false);
  }
  function removeSigner(id: string) {
    setSigners(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
    setFields(prev => prev.filter(f => f.signerId !== id));
  }
  function moveSigner(id: string, dir: -1 | 1) {
    setSigners(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }

  // ── PDF ──
  async function handleFileSelected(file: File) {
    console.log('[sig] file selected:', file.name, file.size, 'bytes, type:', file.type);
    setPdfLoadError('');
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfLoadError(`הקובץ "${file.name}" אינו PDF. בחר קובץ עם סיומת .pdf`);
      return;
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch (err: any) {
      console.error('[sig] file.arrayBuffer failed', err);
      setPdfLoadError(`שגיאה בקריאת הקובץ: ${err?.message || err}`);
      return;
    }
    // העלאה ל-Supabase Storage כמסמך של הלקוח. מקשרים לתווית 'task:<id>' (ולא
    // 'signature:<id>') כדי שהמסמך יופיע גם ב"מסמכים מקושרים" של המשימה וגם
    // בתיק המסמכים הכללי של הלקוח.
    if (client) {
      try {
        const yearNow = new Date().getFullYear();
        await docDb.saveDoc({
          id: pdfDocId,
          clientId: client.id,
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          category: 'other',
          year: yearNow,
          uploadedAt: new Date().toISOString(),
          description: `${file.name} (לחתימה)`,
          notes: '',
          fileData: bytes.slice(0), // Supabase יקח עותק; את המקור pdfjs יצרוך
          linkedTo: `task:${taskId}`,
          linkedLabel: `מסמך לחתימה`,
        });
      } catch (err: any) {
        console.error('[sig] save to cloud failed', err);
        setPdfLoadError(`שגיאה בהעלאה לענן: ${err?.message || err}`);
        return;
      }
    } else {
      console.warn('[sig] no client context — PDF not saved to cloud (test mode?)');
    }
    setPdfFileName(file.name);
    // אם כבר היו סימונים — שאל לפני שאתה דורס.
    if (fields.length > 0 && confirm('להחליף PDF? כל הסימונים הקיימים ימחקו.')) {
      setFields([]);
    }
    await ingestPdfBytes(bytes); // pdfjs יקח לעצמו את ה-bytes
  }

  // ── שדות (סימונים) ──
  function addFieldAt(pageIndex: number, xPct: number, yPct: number) {
    if (!activeSignerId) {
      console.warn('[sig] click ignored — no active signer');
      return;
    }
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { w: widthPct, h: heightPct } = lastSizes[activeKind];
    // ממקמים סביב נקודת הלחיצה (clamp לתוך העמוד)
    const x = Math.max(0, Math.min(1 - widthPct, xPct - widthPct / 2));
    const y = Math.max(0, Math.min(1 - heightPct, yPct - heightPct / 2));
    setFields(prev => [...prev, {
      id,
      signerId: activeSignerId,
      kind: activeKind,
      pageIndex,
      xPct: x,
      yPct: y,
      widthPct,
      heightPct,
    }]);
  }
  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id));
  }
  // עדכון של שדה קיים — שמירת מיקום/גודל אחרי גרירה/שינוי גודל, וגם החלפת חותם
  function updateField(id: string, patch: Partial<SignatureField>) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }
  // לאחר resize של תיבה — שומרים את הגודל הזה כברירת מחדל לסימונים הבאים מאותו סוג
  function rememberSize(kind: SignatureFieldKind, w: number, h: number) {
    setLastSizes(prev => ({ ...prev, [kind]: { w, h } }));
  }

  // ── שמירה ──
  function handleSave() {
    if (signers.length === 0) {
      alert('יש לבחור לפחות חותם אחד');
      return;
    }
    const now = new Date().toISOString();
    const req: SignatureRequest = {
      id: initial?.id ?? `sr-${Date.now()}`,
      pdfFileName: pdfFileName || initial?.pdfFileName || '',
      pdfDocId,
      signers,
      fields,
      requireOrder,
      status: 'draft',
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };

    // אם המשתמש סימן "שמור גם באנשי הקשר של הלקוח" על חותמים ידניים — נחזיר client מעודכן
    let updatedClient: Client | undefined;
    if (client) {
      const toAdd: ClientContact[] = signers
        .filter(s => s.source === 'manual' && s.saveToClientContacts && s.email)
        .map(s => ({
          id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'מבקשת חתימה',
          name: s.name,
          email: s.email,
          phone: s.phone,
        }));
      if (toAdd.length > 0) {
        updatedClient = {
          ...client,
          additionalContacts: [...(client.additionalContacts ?? []), ...toAdd],
        };
      }
    }
    onSave(req, updatedClient);
  }

  // ── הרכבה ──
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal sig-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📝 מסמך לחתימה {initial ? '— עריכה' : ''}</h3>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
        </div>

        <div className="sig-steps">
          <button
            type="button"
            className={`sig-step ${step === 'signers' ? 'active' : ''}`}
            onClick={() => setStep('signers')}
          >1. חותמים{signers.length > 0 && <span className="sig-step-count">{signers.length}</span>}</button>
          <button
            type="button"
            className={`sig-step ${step === 'fields' ? 'active' : ''}`}
            onClick={() => signers.length > 0 && setStep('fields')}
            disabled={signers.length === 0}
          >2. סימון על ה-PDF{fields.length > 0 && <span className="sig-step-count">{fields.length}</span>}</button>
        </div>

        <div className="modal-body sig-body">
          {step === 'signers' ? (
            <SignersPanel
              client={client}
              candidateContacts={candidateContacts}
              signers={signers}
              isContactSelected={isContactSelected}
              toggleContact={toggleContact}
              showAddManual={showAddManual}
              setShowAddManual={setShowAddManual}
              manualDraft={manualDraft}
              setManualDraft={setManualDraft}
              addManualSigner={addManualSigner}
              removeSigner={removeSigner}
              moveSigner={moveSigner}
              requireOrder={requireOrder}
              setRequireOrder={setRequireOrder}
            />
          ) : (
            <FieldsPanel
              pdfDoc={pdfDoc}
              pdfFileName={pdfFileName}
              pdfPages={pdfPages}
              pdfLoadError={pdfLoadError}
              handleFileSelected={handleFileSelected}
              fields={fields}
              signers={signers}
              activeSignerId={activeSignerId}
              setActiveSignerId={setActiveSignerId}
              activeKind={activeKind}
              setActiveKind={setActiveKind}
              addFieldAt={addFieldAt}
              removeField={removeField}
              updateField={updateField}
              rememberSize={rememberSize}
            />
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>ביטול</button>
          <div style={{ flex: 1 }} />
          {step === 'signers' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep('fields')}
              disabled={signers.length === 0}
            >המשך לסימון ←</button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setStep('signers')}>→ חזרה לחותמים</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={signers.length === 0}
              >שמור על המשימה</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//                          SIGNERS PANEL
// ─────────────────────────────────────────────────────────────────────

interface SignersPanelProps {
  client: Client | undefined;
  candidateContacts: { id: string; label: string; signer: Omit<Signer, 'order'> }[];
  signers: Signer[];
  isContactSelected: (id: string) => boolean;
  toggleContact: (id: string) => void;
  showAddManual: boolean;
  setShowAddManual: (b: boolean) => void;
  manualDraft: { name: string; email: string; phone: string; saveToClientContacts: boolean };
  setManualDraft: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string; saveToClientContacts: boolean }>>;
  addManualSigner: () => void;
  removeSigner: (id: string) => void;
  moveSigner: (id: string, dir: -1 | 1) => void;
  requireOrder: boolean;
  setRequireOrder: (b: boolean) => void;
}

function SignersPanel(p: SignersPanelProps) {
  return (
    <div className="sig-signers">
      {!p.client && (
        <div className="empty-state" style={{ padding: '1rem' }}>
          <div className="empty-state-title">בחר/י לקוח קודם</div>
          <div className="empty-state-desc">חותמים נשלפים אוטומטית מאנשי הקשר של הלקוח. לאחר שתבחר/י לקוח לטופס, נחזור לכאן.</div>
        </div>
      )}

      {p.client && (
        <>
          <div className="sig-section">
            <h4>אנשי קשר של הלקוח</h4>
            <div className="sig-candidates">
              {p.candidateContacts.length === 0 ? (
                <div className="cw-empty">אין אנשי קשר. אפשר להוסיף חותם חיצוני למטה.</div>
              ) : p.candidateContacts.map(cand => {
                const sel = p.isContactSelected(cand.id);
                const noEmail = !cand.signer.email;
                return (
                  <label
                    key={cand.id}
                    className={`sig-candidate ${sel ? 'selected' : ''} ${noEmail ? 'no-email' : ''}`}
                  >
                    <input type="checkbox" checked={sel} onChange={() => p.toggleContact(cand.id)} disabled={noEmail} />
                    <div className="sig-candidate-text">
                      <div className="sig-candidate-name">{cand.label}</div>
                      <div className="sig-candidate-meta" dir="ltr">
                        {cand.signer.email || <span style={{ color: 'var(--red)' }}>חסר אימייל</span>}
                        {cand.signer.phone && <span> · {cand.signer.phone}</span>}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="sig-section">
            <div className="sig-section-row">
              <h4>חותם חיצוני (לא קיים אצל הלקוח)</h4>
              {!p.showAddManual && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => p.setShowAddManual(true)}>+ הוסף חותם חיצוני</button>
              )}
            </div>
            {p.showAddManual && (
              <div className="sig-manual-form">
                <div className="form-grid form-grid-3">
                  <div className="form-group">
                    <label>שם מלא</label>
                    <input type="text" value={p.manualDraft.name} onChange={e => p.setManualDraft(d => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>אימייל</label>
                    <input type="email" value={p.manualDraft.email} onChange={e => p.setManualDraft(d => ({ ...d, email: e.target.value }))} dir="ltr" />
                  </div>
                  <div className="form-group">
                    <label>טלפון (אופציונלי)</label>
                    <input type="tel" value={p.manualDraft.phone} onChange={e => p.setManualDraft(d => ({ ...d, phone: e.target.value }))} dir="ltr" />
                  </div>
                  <div className="form-group span-full">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={p.manualDraft.saveToClientContacts}
                        onChange={e => p.setManualDraft(d => ({ ...d, saveToClientContacts: e.target.checked }))}
                      />
                      שמור גם באנשי הקשר של הלקוח
                    </label>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.setShowAddManual(false)}>בטל</button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={p.addManualSigner}
                    disabled={!p.manualDraft.name.trim() || !p.manualDraft.email.trim()}
                  >הוסף</button>
                </div>
              </div>
            )}
          </div>

          {p.signers.length > 0 && (
            <div className="sig-section">
              <div className="sig-section-row">
                <h4>חותמים נבחרים ({p.signers.length})</h4>
                <label className="checkbox-row" style={{ marginTop: 0 }}>
                  <input type="checkbox" checked={p.requireOrder} onChange={e => p.setRequireOrder(e.target.checked)} />
                  סדר חתימה חשוב (הראשון חותם, אחר כך השני, וכו׳)
                </label>
              </div>
              <ol className="sig-signers-list">
                {p.signers.map((s, i) => (
                  <li key={s.id} className="sig-signer-row">
                    <span className="sig-signer-num">{i + 1}</span>
                    <div className="sig-signer-info">
                      <div className="sig-signer-name">{s.name}</div>
                      <div className="sig-signer-meta" dir="ltr">{s.email}{s.phone ? ` · ${s.phone}` : ''}</div>
                    </div>
                    {p.requireOrder && (
                      <div className="sig-signer-order">
                        <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => p.moveSigner(s.id, -1)}>↑</button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={i === p.signers.length - 1} onClick={() => p.moveSigner(s.id, 1)}>↓</button>
                      </div>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.removeSigner(s.id)} style={{ color: 'var(--red)' }}>הסר</button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//                          FIELDS PANEL
// ─────────────────────────────────────────────────────────────────────

interface FieldsPanelProps {
  pdfDoc: PdfDocument | null;
  pdfFileName: string;
  pdfPages: { width: number; height: number }[];
  pdfLoadError: string;
  handleFileSelected: (f: File) => void;
  fields: SignatureField[];
  signers: Signer[];
  activeSignerId: string;
  setActiveSignerId: (id: string) => void;
  activeKind: SignatureFieldKind;
  setActiveKind: (k: SignatureFieldKind) => void;
  addFieldAt: (pageIndex: number, xPct: number, yPct: number) => void;
  removeField: (id: string) => void;
  updateField: (id: string, patch: Partial<SignatureField>) => void;
  rememberSize: (kind: SignatureFieldKind, w: number, h: number) => void;
}

function FieldsPanel(p: FieldsPanelProps) {
  const activeSigner = p.signers.find(s => s.id === p.activeSignerId);
  const myFieldsCount = p.fields.filter(f => f.signerId === p.activeSignerId).length;
  const totalFields = p.fields.length;

  // צבע של החותם הנוכחי — כדי לתת פידבק חזותי בסרגל ובמרקרים
  const activeColor = activeSigner ? colorForSigner(p.signers, activeSigner.id) : 'var(--blue)';

  // input קובץ נסתר עם ref — תבנית אמינה יותר מ-label-wraps-input. גם מאפסים את ה-value
  // אחרי בחירה כדי שאותו קובץ יוכל להיבחר שוב.
  const fileInputRef = useRef<HTMLInputElement>(null);
  function openPicker() { fileInputRef.current?.click(); }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) p.handleFileSelected(f);
    e.target.value = ''; // אפשר לבחור את אותו קובץ שוב
  }

  return (
    <div className="sig-fields">
      {/* input אחד נסתר משותף לשני הכפתורים (העלאה ראשונה / החלפת קובץ) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        onChange={handleInputChange}
      />

      {!p.pdfDoc ? (
        <div className="sig-upload-area">
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-title">העלה את ה-PDF לחתימה</div>
            <div className="empty-state-desc">לאחר ההעלאה — לחץ על מקום בעמוד כדי לסמן איפה כל חותם יחתום או יכתוב טקסט.</div>
            {p.pdfLoadError && (
              <div style={{
                background: 'var(--red-light)', color: 'var(--red)',
                padding: '.6rem .8rem', borderRadius: 'var(--radius)',
                margin: '.75rem auto', maxWidth: 500, fontSize: '.85rem',
              }}>
                ⚠ {p.pdfLoadError}
              </div>
            )}
            <br />
            <button type="button" className="btn btn-primary" onClick={openPicker}>
              📤 העלאת PDF
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* פס הוראה ברור ובולט — מסביר למשתמש בדיוק מה לעשות */}
          <div className="sig-instruction" style={{ borderColor: activeColor }}>
            <span className="sig-instruction-icon" style={{ background: activeColor }}>
              {p.activeKind === 'signature' ? '✍' : '📝'}
            </span>
            <div className="sig-instruction-text">
              <strong>לחץ על המקום בעמוד</strong> שבו <strong style={{ color: activeColor }}>{activeSigner?.name || '—'}</strong>{' '}
              צריך {p.activeKind === 'signature' ? 'לחתום' : 'לכתוב טקסט'}.
              {' '}
              <span style={{ color: 'var(--gray-600)', fontSize: '.8rem' }}>
                (סימונים: {myFieldsCount} עבור החותם, {totalFields} בסה"כ)
              </span>
            </div>
          </div>

          <div className="sig-toolbar">
            <div className="sig-toolbar-group">
              <span className="sig-toolbar-label">📄 {p.pdfFileName || 'PDF'}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={openPicker}>
                החלף קובץ
              </button>
            </div>
            <div className="sig-toolbar-group">
              <span className="sig-toolbar-label">חותם:</span>
              <select
                value={p.activeSignerId}
                onChange={e => p.setActiveSignerId(e.target.value)}
                style={{ borderInlineStartColor: activeColor, borderInlineStartWidth: 4 }}
              >
                {p.signers.map(s => {
                  const count = p.fields.filter(f => f.signerId === s.id).length;
                  return <option key={s.id} value={s.id}>{s.order}. {s.name}{count ? ` (${count})` : ''}</option>;
                })}
              </select>
            </div>
            <div className="sig-toolbar-group">
              <span className="sig-toolbar-label">סוג:</span>
              <div className="sig-kind-toggle">
                <button
                  type="button"
                  className={p.activeKind === 'signature' ? 'active' : ''}
                  onClick={() => p.setActiveKind('signature')}
                >✍ חתימה</button>
                <button
                  type="button"
                  className={p.activeKind === 'text' ? 'active' : ''}
                  onClick={() => p.setActiveKind('text')}
                >📝 טקסט</button>
              </div>
            </div>
          </div>

          {p.pdfLoadError ? (
            <div className="empty-state">
              <div className="empty-state-icon">⚠</div>
              <div className="empty-state-title">{p.pdfLoadError}</div>
            </div>
          ) : (
            <div className="sig-pdf-canvas-wrap">
              {p.pdfPages.map((_, idx) => (
                <PdfPageWithMarkers
                  key={`${p.pdfFileName}-${idx}`}
                  pdfDoc={p.pdfDoc!}
                  pageIndex={idx}
                  fields={p.fields.filter(f => f.pageIndex === idx)}
                  signers={p.signers}
                  onClick={(xPct, yPct) => p.addFieldAt(idx, xPct, yPct)}
                  onRemoveField={p.removeField}
                  onUpdateField={p.updateField}
                  onRememberSize={p.rememberSize}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//                       SINGLE PDF PAGE + MARKERS
// ─────────────────────────────────────────────────────────────────────

interface PageProps {
  pdfDoc: PdfDocument;
  pageIndex: number;
  fields: SignatureField[];
  signers: Signer[];
  onClick: (xPct: number, yPct: number) => void;
  onRemoveField: (id: string) => void;
  onUpdateField: (id: string, patch: Partial<SignatureField>) => void;
  onRememberSize: (kind: SignatureFieldKind, w: number, h: number) => void;
}

const SIGNER_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#ec4899', '#0891b2'];

function colorForSigner(signers: Signer[], signerId: string): string {
  const idx = signers.findIndex(s => s.id === signerId);
  return SIGNER_COLORS[idx % SIGNER_COLORS.length] || '#2563eb';
}

// 8 ידיות שינוי גודל — n/s/e/w עבור קצוות, ne/se/sw/nw עבור פינות
const RESIZE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type ResizeDir = typeof RESIZE_DIRS[number];

function PdfPageWithMarkers({
  pdfDoc, pageIndex, fields, signers,
  onClick, onRemoveField, onUpdateField, onRememberSize,
}: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [, setRendered] = useState(false);
  const [renderError, setRenderError] = useState<string>('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDoc) return;
    let cancelled = false;
    setRendered(false);
    setRenderError('');
    (async () => {
      try {
        await renderPage(pdfDoc, pageIndex, canvas, 1.4);
        if (!cancelled) setRendered(true);
      } catch (e: any) {
        if (e?.name === 'RenderingCancelledException') return;
        console.error('renderPage failed for page', pageIndex, e);
        if (!cancelled) setRenderError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageIndex]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!wrapRef.current) return;
    const target = e.target as HTMLElement;
    // לחיצה על מרקר קיים או על אחד מהכפתורים שלו — לא יוצרת חדש
    if (target.closest('.sig-marker')) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return;
    onClick(xPct, yPct);
  }

  // ── גרירה של מרקר במקום ──
  function startDrag(e: React.MouseEvent, f: SignatureField) {
    if (!wrapRef.current) return;
    // אל תתחיל גרירה אם לחצו על כפתור/select בתוך המרקר
    const t = e.target as HTMLElement;
    if (t.closest('.sig-marker-x, .sig-marker-resize, .sig-marker-select, select, option')) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = f.xPct;
    const startY = f.yPct;

    function onMove(ev: MouseEvent) {
      const dxPct = (ev.clientX - startMouseX) / rect.width;
      const dyPct = (ev.clientY - startMouseY) / rect.height;
      const nx = Math.max(0, Math.min(1 - f.widthPct, startX + dxPct));
      const ny = Math.max(0, Math.min(1 - f.heightPct, startY + dyPct));
      onUpdateField(f.id, { xPct: nx, yPct: ny });
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── שינוי גודל של מרקר ──
  // 8 ידיות: 4 פינות (nw/ne/se/sw) ו-4 קצוות (n/e/s/w).
  // מחזיקים מקבע את הקצה הנגדי וגוררים את הקצה שנבחר.
  function startResize(e: React.MouseEvent, f: SignatureField, dir: ResizeDir) {
    if (!wrapRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = f.xPct;
    const startY = f.yPct;
    const startW = f.widthPct;
    const startH = f.heightPct;
    const rightEdge = startX + startW;   // נשאר קבוע כשגוררים מהשמאל (w)
    const bottomEdge = startY + startH;  // נשאר קבוע כשגוררים מלמעלה (n)
    const minW = 0.03;
    const minH = 0.012;

    let lastW = startW, lastH = startH;
    function onMove(ev: MouseEvent) {
      const dx = (ev.clientX - startMouseX) / rect.width;
      const dy = (ev.clientY - startMouseY) / rect.height;
      let nx = startX, ny = startY, nw = startW, nh = startH;

      if (dir.includes('e')) {
        nw = Math.max(minW, Math.min(1 - startX, startW + dx));
      }
      if (dir.includes('w')) {
        let newX = Math.max(0, startX + dx);
        newX = Math.min(rightEdge - minW, newX);
        nx = newX;
        nw = rightEdge - newX;
      }
      if (dir.includes('s')) {
        nh = Math.max(minH, Math.min(1 - startY, startH + dy));
      }
      if (dir.includes('n')) {
        let newY = Math.max(0, startY + dy);
        newY = Math.min(bottomEdge - minH, newY);
        ny = newY;
        nh = bottomEdge - newY;
      }
      lastW = nw; lastH = nh;
      onUpdateField(f.id, { xPct: nx, yPct: ny, widthPct: nw, heightPct: nh });
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // אחרי resize ידני — הגודל הזה הופך לברירת מחדל לסימונים הבאים מאותו סוג
      onRememberSize(f.kind, lastW, lastH);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className="sig-pdf-page">
      <div className="sig-pdf-page-label">
        עמוד {pageIndex + 1}
        {renderError && <span style={{ color: 'var(--red)', marginInlineStart: '.5rem' }}>· שגיאה ברינדור: {renderError}</span>}
      </div>
      <div ref={wrapRef} className="sig-pdf-page-inner" onClick={handleClick}>
        <canvas ref={canvasRef} />
        {fields.map(f => {
          const signer = signers.find(s => s.id === f.signerId);
          const color = colorForSigner(signers, f.signerId);
          return (
            <div
              key={f.id}
              className={`sig-marker sig-marker-${f.kind}`}
              style={{
                left: `${f.xPct * 100}%`,
                top: `${f.yPct * 100}%`,
                width: `${f.widthPct * 100}%`,
                height: `${f.heightPct * 100}%`,
                borderColor: color,
                background: `${color}22`,
              }}
              title={`${f.kind === 'signature' ? 'חתימה' : 'טקסט'} · ${signer?.name ?? 'חותם'} — גרור להזיז, גרור פינה לשנות גודל`}
              onMouseDown={(e) => startDrag(e, f)}
            >
              {/* תווית עם דרופדאון לחותם — אפשר להחליף חותם ישירות מהתיבה */}
              <select
                className="sig-marker-select"
                value={f.signerId}
                onChange={(e) => onUpdateField(f.id, { signerId: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ background: color }}
                title="החלף חותם"
              >
                {signers.map(s => (
                  <option key={s.id} value={s.id}>
                    {f.kind === 'signature' ? '✍' : '📝'} {s.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="sig-marker-x"
                onClick={(e) => { e.stopPropagation(); onRemoveField(f.id); }}
                onMouseDown={(e) => e.stopPropagation()}
                aria-label="הסר"
              >×</button>

              {/* 8 ידיות שינוי גודל — פינות וקצוות */}
              {RESIZE_DIRS.map(dir => (
                <div
                  key={dir}
                  className={`sig-marker-handle sig-marker-handle-${dir}`}
                  style={{ borderColor: color, color }}
                  onMouseDown={(e) => startResize(e, f, dir)}
                  onClick={(e) => e.stopPropagation()}
                  title="גרור לשינוי גודל"
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

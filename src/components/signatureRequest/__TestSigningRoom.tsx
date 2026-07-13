// ⚠ דף בדיקה זמני — אימות "חדר החתימה" + הטבעת ה-PDF, ללא התחברות.
// נטען רק כש-URL כולל ?test-signroom=1. יוסר לאחר אימות.

import { useEffect, useState } from 'react';
import { SignatureField, SignatureValue, Signer } from '../../types';
import SigningRoom from './SigningRoom';
import { burnSignaturesIntoPdf } from '../../utils/signaturePdf';

const TEMPLATE_URL = '/templates/poa_2279a5.pdf';

const SIGNERS: Signer[] = [
  { id: 'client', source: 'client_self', name: 'רותי לקוח', email: 'ruti@example.com', order: 1 },
];

// שדות דמה על עמוד 0 של טופס 2279 — חתימה, חותמת וטקסט תאריך
const FIELDS: SignatureField[] = [
  { id: 'sig1', signerId: 'client', kind: 'signature', pageIndex: 0, xPct: 0.06, yPct: 0.60, widthPct: 0.22, heightPct: 0.05 },
  { id: 'stamp1', signerId: 'client', kind: 'stamp', pageIndex: 0, xPct: 0.30, yPct: 0.58, widthPct: 0.12, heightPct: 0.09 },
  { id: 'date1', signerId: 'client', kind: 'text', pageIndex: 0, xPct: 0.72, yPct: 0.60, widthPct: 0.18, heightPct: 0.03, placeholder: 'תאריך' },
];

export default function TestSigningRoom() {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [result, setResult] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch(TEMPLATE_URL).then(r => r.arrayBuffer()).then(setBytes).catch(e => setResult('template load failed: ' + e));
  }, []);

  // חשיפה ל-eval לצורך אימות אוטומטי (0×0 viewport חוסם לחיצות ידניות)
  useEffect(() => {
    if (!bytes) return;
    (window as any).__signRoomTest = {
      async runEmbed() {
        const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const values: Record<string, SignatureValue> = {
          sig1: { fieldId: 'sig1', imageDataUrl: tinyPng, signedAt: new Date().toISOString() },
          stamp1: { fieldId: 'stamp1', imageDataUrl: tinyPng, signedAt: new Date().toISOString() },
          date1: { fieldId: 'date1', text: '13/07/2026', signedAt: new Date().toISOString() },
        };
        const out = await burnSignaturesIntoPdf(bytes.slice(0), FIELDS, values);
        const head = new TextDecoder().decode(out.slice(0, 5));
        return { ok: head === '%PDF-', inBytes: bytes.byteLength, outBytes: out.byteLength };
      },
    };
  }, [bytes]);

  async function handleComplete(values: Record<string, SignatureValue>) {
    if (!bytes) return;
    try {
      const out = await burnSignaturesIntoPdf(bytes.slice(0), FIELDS, values);
      const head = new TextDecoder().decode(out.slice(0, 5));
      const buf = new ArrayBuffer(out.byteLength);
      new Uint8Array(buf).set(out);
      const blob = new Blob([buf], { type: 'application/pdf' });
      setPdfUrl(URL.createObjectURL(blob));
      setResult(`✓ הוטבע. תקין=${head === '%PDF-'} · ${bytes.byteLength}→${out.byteLength} bytes`);
      setOpen(false);
    } catch (e: any) {
      setResult('embed failed: ' + (e?.message || e));
    }
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'Heebo, sans-serif' }}>
      <h1>🧪 בדיקה: חדר החתימה + הטבעת PDF</h1>
      <p style={{ color: '#6b7280' }}>הוסיפו <code>?test-signroom=1</code> לכתובת.</p>
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!bytes}>פתח חדר חתימה</button>
      </div>
      {result && <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '.75rem', borderRadius: 8, direction: 'ltr', textAlign: 'left' }}>{result}</div>}
      {pdfUrl && <iframe title="out" src={pdfUrl} style={{ width: '100%', height: 500, marginTop: '1rem', border: '1px solid #ddd' }} />}
      {open && bytes && (
        <SigningRoom
          pdfBytes={bytes.slice(0)}
          pdfFileName="poa_2279a5.pdf"
          fields={FIELDS}
          signers={SIGNERS}
          activeSignerId="client"
          title="חתימה על ייפוי כוח (בדיקה)"
          onComplete={handleComplete}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

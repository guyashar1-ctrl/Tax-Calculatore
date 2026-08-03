// מכתב שחרור לרו"ח קודם — הרו"ח בודק, עורך במידת הצורך, ושולח.
// לא נשלח אוטומטית. אחרי שליחה מוצלחת, המייל נשמר כ-PDF במסמכי הלקוח —
// כך שרואים בדיוק מה נשלח, ממי (כתובת המשרד) ולאן (הרו"ח הקודם).

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import type { QuotationBrand } from './quotationBranding';
import {
  defaultReleaseSubject, defaultReleaseBody, buildReleaseEmailHtml, generateReleaseEmailPdf,
} from '../../utils/releaseLetter';

interface Props {
  clientId: string;
  clientName: string;
  businessName?: string;
  prevAccountant: { name?: string; email?: string; phone?: string };
  brand: QuotationBrand;
  /** נקרא רק אחרי שליחה מוצלחת — מקדם את שלב הקליטה ל"נשלח". */
  onSent?: () => void;
  onClose: () => void;
}

export default function ReleaseLetterDialog({ clientId, clientName, businessName, prevAccountant, brand, onSent, onClose }: Props) {
  const { saveDoc } = useDocumentStore();
  const ctx = { clientName, businessName, prevAccountantName: prevAccountant.name };
  const [toEmail, setToEmail] = useState(prevAccountant.email ?? '');
  const [subject, setSubject] = useState(defaultReleaseSubject(ctx));
  const [body, setBody] = useState(defaultReleaseBody(ctx, brand.firmName));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const fromLabel = `${brand.firmName}${brand.email ? ` <${brand.email}>` : ''}`;

  async function handleSend() {
    setNotice(null);
    if (!toEmail.trim()) { setNotice({ kind: 'err', text: 'חסר מייל של הרו״ח הקודם.' }); return; }
    setBusy(true);
    try {
      const html = buildReleaseEmailHtml(body, brand);
      const { data: res, error } = await supabase.functions.invoke('send-release-email', {
        body: { clientId, to: toEmail.trim(), subject, html },
      });
      if (error || !res?.ok) {
        setNotice({ kind: 'err', text: `השליחה נכשלה: ${error?.message || res?.detail?.message || res?.error || 'שגיאה'}` });
        return;
      }
      // שמירת המייל שנשלח כמסמך בכרטיס הלקוח
      const dateStr = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
      const pdf = await generateReleaseEmailPdf({
        from: res.from || fromLabel, to: toEmail.trim(), date: dateStr, subject, bodyText: body,
      }, brand);
      const docId = crypto.randomUUID();
      await saveDoc({
        id: docId, clientId,
        fileName: `מכתב שחרור — רו״ח קודם ${dateStr}.pdf`,
        fileType: 'application/pdf',
        fileSize: pdf.byteLength,
        category: 'other',
        year: 'general',
        uploadedAt: new Date().toISOString(),
        description: `מכתב שחרור שנשלח ל${prevAccountant.name || 'רו״ח הקודם'} (${toEmail.trim()})`,
        notes: `נשלח מ-${res.from || fromLabel}`,
        fileData: pdf.buffer.slice(0) as ArrayBuffer,
      });
      setDone(true);
      setNotice({ kind: 'ok', text: 'המכתב נשלח ונשמר במסמכי הלקוח.' });
      onSent?.();
    } catch (e) {
      setNotice({ kind: 'err', text: `שגיאה: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal task-modal" style={{ maxWidth: 620, width: '100%' }}>
        <div className="modal-header">
          <h3>מכתב שחרור לרו״ח הקודם</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--gray-600)', background: 'var(--gray-50)', borderRadius: 8, padding: '8px 10px' }}>
            נשלח מ: <b dir="ltr">{fromLabel}</b>. בדוק את התוכן ושלח — לא נשלח אוטומטית. עותק יישמר במסמכי הלקוח.
          </div>
          <label style={{ fontSize: 12, color: 'var(--gray-600)' }}>אל (מייל הרו״ח הקודם)
            <input value={toEmail} onChange={e => setToEmail(e.target.value)} dir="ltr" style={{ textAlign: 'right', marginTop: 4 }} disabled={busy || done} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--gray-600)' }}>נושא
            <input value={subject} onChange={e => setSubject(e.target.value)} style={{ marginTop: 4 }} disabled={busy || done} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--gray-600)' }}>תוכן המכתב
            <textarea rows={11} value={body} onChange={e => setBody(e.target.value)} style={{ marginTop: 4, width: '100%', lineHeight: 1.7 }} disabled={busy || done} />
          </label>
          {notice && (
            <div className={`alert ${notice.kind === 'ok' ? 'alert-info' : 'alert-warning'}`}>{notice.text}</div>
          )}
        </div>
        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          {done ? (
            <button className="btn btn-primary" onClick={onClose}>סיום</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>ביטול</button>
              <button className="btn btn-primary" onClick={handleSend} disabled={busy}>{busy ? 'שולח…' : 'שליחה לרו״ח הקודם'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

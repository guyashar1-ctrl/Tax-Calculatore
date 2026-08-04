// מכתב שחרור לרו"ח קודם — הרו"ח מרכיב, בודק, ושולח. לא נשלח אוטומטית.
//
// ‼ שלושה דברים שהופכים את זה ממייל לבקשה מקצועית: תאריך הפסקת ההתקשרות
// (בלעדיו למכתב אין תוקף), רשימת החומרים המבוקשים, וכלל 16 — חלון ההתנגדות
// של הרו"ח הקודם. הלקוח מכותב תמיד: הוא זה שמפסיק את ההתקשרות, ולא נכון
// שיגלה על כך אחר כך.
//
// אחרי שליחה מוצלחת המייל נשמר כ-PDF במסמכי הלקוח — רואים בדיוק מה נשלח ולמי.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import type { QuotationBrand } from './quotationBranding';
import type { ReleaseMaterial } from '../../utils/releaseLetter';
import {
  RELEASE_MATERIALS, defaultReleaseSubject, defaultReleaseBody,
  buildReleaseEmailHtml, generateReleaseEmailPdf,
} from '../../utils/releaseLetter';

interface Props {
  clientId: string;
  clientName: string;
  businessName?: string;
  clientEmail?: string;
  prevAccountant: { name?: string; email?: string; phone?: string };
  brand: QuotationBrand;
  /** נקרא רק אחרי שליחה מוצלחת — מקדם את שלב הקליטה ל"נשלח". */
  onSent?: (sent: {
    materialKeys: string[]; objectionDueDate: string;
    /** הנוסח הסופי והטוקן — כדי שדף הרו"ח הקודם יציג בדיוק את מה שנשלח. */
    subject?: string; body?: string; releaseToken?: string;
  }) => void;
  /** שלב מכתב השחרור. קיים ⇒ נטבע טוקן ולמכתב יתווסף קישור לדף החתימה. */
  stepId?: string;
  onClose: () => void;
}

/** חלון ההתנגדות של כלל 16 — שלושה ימי עסקים, בלי שישי-שבת. */
function addBusinessDays(from: Date, days: number): string {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();               // 5 = שישי, 6 = שבת
    if (wd !== 5 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ReleaseLetterDialog({
  clientId, clientName, businessName, clientEmail, prevAccountant, brand, onSent, onClose, stepId,
}: Props) {
  const { saveDoc } = useDocumentStore();
  const ctx = { clientName, businessName, prevAccountantName: prevAccountant.name };

  const [toEmail, setToEmail] = useState(prevAccountant.email ?? '');
  const [ccClient, setCcClient] = useState(true);
  const [serviceEndDate, setServiceEndDate] = useState(todayISO());
  const [materials, setMaterials] = useState<ReleaseMaterial[]>(RELEASE_MATERIALS.map(m => ({ ...m })));
  const [paidThrough, setPaidThrough] = useState('');
  const [outstanding, setOutstanding] = useState('');

  const compose = (o?: Partial<{
    serviceEndDate: string; materials: ReleaseMaterial[]; paidThrough: string; outstanding: string;
  }>) => defaultReleaseBody(ctx, brand.firmName, {
    serviceEndDate: o?.serviceEndDate ?? serviceEndDate,
    materials: o?.materials ?? materials,
    paidThroughLabel: o?.paidThrough ?? paidThrough,
    outstanding: (o?.outstanding ?? outstanding).split('\n').filter(t => t.trim()),
  });

  const [subject, setSubject] = useState(defaultReleaseSubject(ctx));
  const [body, setBody] = useState(() => compose());
  // ברגע שהרו"ח נגע בנוסח, המערכת מפסיקה לדרוס אותו. יש כפתור לבנות מחדש.
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const fromLabel = `${brand.firmName}${brand.email ? ` <${brand.email}>` : ''}`;
  const locked = busy || done;

  function sync(next: Parameters<typeof compose>[0]) {
    if (!edited) setBody(compose(next));
  }

  function toggleMaterial(key: string) {
    const next = materials.map(m => (m.key === key ? { ...m, checked: !m.checked } : m));
    setMaterials(next);
    sync({ materials: next });
  }

  async function handleSend() {
    setNotice(null);
    if (!toEmail.trim()) { setNotice({ kind: 'err', text: 'חסר מייל של הרו״ח הקודם.' }); return; }
    if (!serviceEndDate) { setNotice({ kind: 'err', text: 'חסר תאריך הפסקת ההתקשרות.' }); return; }
    setBusy(true);
    try {
      // ‼ שולחים דגל ולא כתובת — השרת לוקח את המייל מהכרטיס, כדי שהפונקציה
      // לא תוכל לשמש לשליחת עותק לכתובת שרירותית.
      const wantsCc = ccClient && !!clientEmail?.trim();

      // ‼ הרו"ח הקודם חותם ומעלה את החומרים בדף משלו. בלי הקישור הזה המכתב
      // יוצא בלי הדרך היחידה לענות עליו (הכרעת גיא 2026-08-05).
      let releaseToken: string | undefined;
      if (stepId) {
        const { data: mint } = await supabase.rpc('mint_release_token', { p_step_id: stepId });
        releaseToken = (mint as { ok?: boolean; token?: string } | null)?.token;
      }
      const finalBody = releaseToken
        ? `${body}\n\nלחתימה על השחרור ולהעלאת החומרים:\n${window.location.origin}/?release=${releaseToken}`
        : body;

      const html = buildReleaseEmailHtml(finalBody, brand);
      const { data: res, error } = await supabase.functions.invoke('send-release-email', {
        body: { clientId, to: toEmail.trim(), ccClient: wantsCc, subject, html },
      });
      if (error || !res?.ok) {
        setNotice({ kind: 'err', text: `השליחה נכשלה: ${error?.message || res?.detail?.message || res?.error || 'שגיאה'}` });
        return;
      }
      const dateStr = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
      const pdf = await generateReleaseEmailPdf({
        from: res.from || fromLabel, to: toEmail.trim(), date: dateStr, subject, bodyText: finalBody,
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
        description: `מכתב שחרור שנשלח ל${prevAccountant.name || 'רו״ח הקודם'} (${toEmail.trim()})${res.cc ? ` · עותק ל${clientName}` : ''}`,
        notes: `נשלח מ-${res.from || fromLabel}`,
        fileData: pdf.buffer.slice(0) as ArrayBuffer,
      });
      setDone(true);
      setNotice({ kind: 'ok', text: 'המכתב נשלח ונשמר במסמכי הלקוח.' });
      onSent?.({
        materialKeys: materials.filter(m => m.checked).map(m => m.key),
        objectionDueDate: addBusinessDays(new Date(), 3),
        subject, body: finalBody, releaseToken,
      });
    } catch (e) {
      setNotice({ kind: 'err', text: `שגיאה: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const label = { fontSize: 12, color: 'var(--gray-600)' } as const;

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal task-modal" style={{ maxWidth: 720, width: '100%' }}>
        <div className="modal-header">
          <h3>מכתב שחרור לרו״ח הקודם</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--gray-600)', background: 'var(--gray-50)', borderRadius: 8, padding: '8px 10px' }}>
            נשלח מ: <b dir="ltr">{fromLabel}</b>. בדוק ושלח — לא נשלח אוטומטית. עותק יישמר במסמכי הלקוח.
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
            <label style={label}>אל (מייל הרו״ח הקודם)
              <input value={toEmail} onChange={e => setToEmail(e.target.value)} dir="ltr"
                style={{ textAlign: 'right', marginTop: 4 }} disabled={locked} />
            </label>
            <label style={label}>הפסקת ההתקשרות מתאריך
              <input type="date" value={serviceEndDate} disabled={locked}
                onChange={e => { setServiceEndDate(e.target.value); sync({ serviceEndDate: e.target.value }); }}
                style={{ marginTop: 4 }} />
            </label>
          </div>

          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={ccClient} disabled={locked || !clientEmail}
              onChange={e => setCcClient(e.target.checked)} />
            <span>
              לשלוח עותק ל{clientName}
              {clientEmail ? <span dir="ltr" style={{ color: 'var(--gray-500)' }}> ({clientEmail})</span>
                           : <span style={{ color: 'var(--err)' }}> — אין מייל בכרטיס</span>}
            </span>
          </label>

          <fieldset style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 10px' }}>
            <legend style={label}>מה מבקשים ממנו</legend>
            <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }}>
              {materials.map(m => (
                <label key={m.key} style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={m.checked} disabled={locked}
                    onChange={() => toggleMaterial(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label style={label}>הלקוח כבר שילם לו עבור (אופציונלי — משאיר אותו מייצג ראשי עד ההגשה)
            <input value={paidThrough} disabled={locked}
              placeholder="דוחות שנתיים לשנת 2025 והנהלת חשבונות עד פברואר 2026"
              onChange={e => { setPaidThrough(e.target.value); sync({ paidThrough: e.target.value }); }}
              style={{ marginTop: 4 }} />
          </label>

          <label style={label}>דוחות או דיווחים שהוא עדיין חייב ללקוח (שורה לכל אחד, אופציונלי)
            <textarea rows={2} value={outstanding} disabled={locked}
              onChange={e => { setOutstanding(e.target.value); sync({ outstanding: e.target.value }); }}
              style={{ marginTop: 4, width: '100%' }} />
          </label>

          <label style={label}>נושא
            <input value={subject} onChange={e => setSubject(e.target.value)} style={{ marginTop: 4 }} disabled={locked} />
          </label>

          <label style={label}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              תוכן המכתב
              {edited && (
                <button type="button" className="btn btn-sm btn-ghost" disabled={locked}
                  onClick={() => { setEdited(false); setBody(compose()); }}>
                  בנה מחדש מהשדות
                </button>
              )}
            </span>
            <textarea rows={14} value={body} disabled={locked}
              onChange={e => { setBody(e.target.value); setEdited(true); }}
              style={{ marginTop: 4, width: '100%', lineHeight: 1.7 }} />
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

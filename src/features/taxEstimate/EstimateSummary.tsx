// ─── הערכת מס: סיכום ללקוח — צפייה, הורדה ופרסום בדף האישי ──────────────────────
// ‼ רק מגרסה מאושרת, ומאותה שורה (אין עותק). הורדה = מסירה ידנית. פרסום בדף האישי מצביע על אותה גרסה
//   (232 — חבילה נפרדת, טרם הוחלה); השליחה עצמה — דרך «שלח בקשות» הקיים, לא מכאן.
import { useMemo, useState } from 'react';
import type { Client } from '../../types';
import { buildSummary, summaryHtml } from './summary';
import * as api from './api';
import { he } from './parts';
import type { EstimateVersion } from './types';

export function EstimateSummary({ client, version, onPublished }: { client: Client; version: EstimateVersion; onPublished: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const html = useMemo(() => {
    if (!version.outputs) return '';
    const m = buildSummary({ clientName: [client.firstName, client.lastName].filter(Boolean).join(' '), spouseName: client.spouse?.firstName || undefined,
      taxYear: version.taxYear, version: version.version, approvedAt: version.approvedAt, draft: version.draft, outputs: version.outputs });
    return summaryHtml(m);
  }, [client, version]);
  if (!html) return null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `הערכת-מס-${version.taxYear}-גרסה-${version.version}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg({ ok: true, text: 'הקובץ ירד. אפשר לפתוח ולהדפיס ל-PDF, ולמסור ללקוח ביד.' });
  };
  const publish = async (on: boolean) => {
    setBusy(true);
    const r = await api.publishEstimate(version.id, on);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: /function|does not exist|schema cache/i.test(r.error) ? 'הפרסום בדף האישי עוד לא הופעל בסביבה הזו (חבילה 232 ממתינה לאישור). בינתיים — הורדה ומסירה ידנית.' : r.error === 'not_approved' ? 'אפשר לפרסם רק גרסה מאושרת' : `הפרסום נכשל (${r.error})` });
      return;
    }
    setMsg({ ok: true, text: on ? 'פורסם בדף האישי של הלקוח — אותה גרסה. כדי שהלקוח יידע: «שלח בקשות» בכרטיס.' : 'הוסר מהדף האישי.' });
    onPublished();
  };
  return (
    <div className="te-lines">
      <p className="ty-note">נבנה מגרסה {version.version}{version.approvedAt ? ` (אושרה ${he(version.approvedAt.slice(0, 10))})` : ''} בלבד. שינוי בנתונים יוצר גרסה חדשה — והסיכום שלה.</p>
      <iframe className="te-summary-frame" title={`סיכום ללקוח — גרסה ${version.version}`} srcDoc={html} sandbox="" />
      <div className="ty-actions">
        <button type="button" className="btn btn-primary" onClick={download}>הורד ללקוח (HTML להדפסה)</button>
        {version.publishedAt
          ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void publish(false)}>הסר מהדף האישי</button>
          : <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void publish(true)}>פרסם בדף האישי</button>}
        {version.publishedAt && <span className="ty-chip green">בדף האישי מ-{he(version.publishedAt.slice(0, 10))}</span>}
      </div>
      {msg && <p className={msg.ok ? 'ty-ok' : 'ty-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}

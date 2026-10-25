// ─── 297 · אישורים שנתיים מ-413 — «צפה» ו«הנפק אישורים» ליד השורה ────────────
// גיא (25.10.2026): «לכתוב כמה אנחנו רוצים ואם זה לא נותן — לתת מה שיש או הכי קרוב».
// לחיצה אחת מנפיקה את שני האישורים בשיעור הנמוך ביותר שמותר; «שיעור אחר» — רק כשצריך.
// ‼ הכפתור אומר בדיוק מה הוא עושה (הנפקה ברשות), והשורה אומרת מה יצא — לא «הונפק» בלי ריצה
// שהצליחה. השמירה והעדכון בכרטיס קורים בשרת (record_authority_certificate).

import { useState } from 'react';
import DocumentViewerDialog, { type ViewerFile } from '../DocumentViewerDialog';
import { useDocumentStore } from '../../hooks/useDocumentStore';
import type { AutomationJob } from '../../types/automation';
import type { StartJobResult } from '../../lib/automationJobStart';

export function CertificateViewButton({ documentId, title }: { documentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const docs = useDocumentStore();
  const load = async (): Promise<ViewerFile> => {
    const d = await docs.getDoc(documentId);
    if (!d || !d.fileData || d.fileData.byteLength === 0) throw new Error('הקובץ לא נמצא במסמכים.');
    return { bytes: new Uint8Array(d.fileData), fileName: d.fileName, mime: 'application/pdf' };
  };
  return (
    <>
      <button type="button" className="ui-linkbtn" onClick={() => setOpen(true)}>צפה</button>
      {open && <DocumentViewerDialog title={title} load={load} onClose={() => setOpen(false)} />}
    </>
  );
}

const OPEN = new Set(['queued', 'running']);

export function CertificateIssueButton({ job, busy, blocked, onRun }: {
  job: AutomationJob | null;
  busy: boolean;
  /** למה אי אפשר (אין עסק בכרטיס) — אז לא מציירים כלום. */
  blocked: string | null;
  onRun: (desiredRate: number | null) => Promise<StartJobResult>;
}) {
  const [other, setOther] = useState(false);
  const [rate, setRate] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  if (blocked) return null;
  const running = busy || (!!job && OPEN.has(job.status));
  // ‼ תוצאה של ריצה שנכשלה — מתחת לכפתור, במילים של העובד. ריצה ישנה (מעל יממה) אינה מצב.
  const finished = job?.finishedAt ?? job?.updatedAt ?? job?.createdAt;
  const fresh = !!finished && Date.now() - new Date(finished).getTime() < 24 * 3600_000;
  const failure = fresh && job && (job.status === 'failed' || job.status === 'needs_human')
    ? (job.status === 'needs_human' ? job.needsHuman : job.errorDetail) : null;

  const start = async (desired: number | null) => {
    setStartError(null);
    const r = await onRun(desired);
    if (!r.ok) setStartError(r.error ?? 'ההנפקה לא התחילה.');
    else { setOther(false); setRate(''); }
  };
  const rateNum = rate.trim() === '' ? null : Number(rate);
  const rateOk = rateNum != null && Number.isInteger(rateNum) && rateNum >= 0 && rateNum <= 50;

  return (
    <div className="txf-cert-issue" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="txf-check-btn btn-automation" disabled={running}
          title="מנפיק בשע״ם אישור ניכוי מס במקור ואישור ניהול ספרים, בשיעור הנמוך ביותר שמותר"
          onClick={() => void start(null)}>
          <span className="txf-check-lbl">{running ? 'מנפיק…' : 'הנפק אישורים'}</span>
        </button>
        {!running && !other && (
          <button type="button" className="ui-linkbtn" onClick={() => setOther(true)}>שיעור אחר</button>
        )}
      </div>
      {other && !running && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <label htmlFor="cert-rate">שיעור ניכוי</label>
          <input id="cert-rate" inputMode="numeric" value={rate} autoFocus
            onChange={e => setRate(e.target.value.replace(/\D/g, '').slice(0, 2))}
            style={{ width: 56, textAlign: 'center' }} aria-describedby="cert-rate-hint" />
          <span>%</span>
          <button type="button" className="ui-linkbtn" disabled={!rateOk} onClick={() => void start(rateNum)}>הנפק</button>
          <button type="button" className="ui-linkbtn" onClick={() => { setOther(false); setRate(''); }}>ביטול</button>
          <span id="cert-rate-hint" style={{ color: 'var(--ink-4)' }}>אם שע״ם לא מתירה — יונפק הקרוב שמותר</span>
        </div>
      )}
      {(startError || failure) && (
        <div className="txf-check-err" role="status">{startError ?? failure}</div>
      )}
    </div>
  );
}

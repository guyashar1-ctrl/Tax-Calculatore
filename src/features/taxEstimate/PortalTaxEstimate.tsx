// ─── הדף האישי: הערכת המס שפורסמה (232) ─────────────────────────────────────────
// ‼ נקראת מהשרת מהגרסה המאושרת והמפורסמת עצמה, ונבנית באותו מודל כמו הקובץ שהמשרד מוריד — אין עותק.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { buildSummary, summaryHtml } from './summary';
import type { EstimateDraft, EstimateOutputs } from './types';

type View = { ok: true; version: number; taxYear: number; approvedAt?: string; clientName: string; spouseName?: string; draft: EstimateDraft; outputs: EstimateOutputs } | { ok: false; error: string };

export default function PortalTaxEstimate({ stepId, token, onClose }: { stepId: string; token: string; onClose: () => void }) {
  const [v, setV] = useState<View | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.rpc('portal_tax_estimate', { p_token: token, p_step_id: stepId }).then(({ data, error }) => {
      if (!live) return;
      setV(error ? { ok: false, error: error.message } : (data as View));
    });
    return () => { live = false; };
  }, [stepId, token]);
  if (!v) return <p style={{ fontSize: 13, margin: '8px 0 0' }}>טוען…</p>;
  if (!v.ok) return <p role="alert" style={{ fontSize: 13, margin: '8px 0 0' }}>ההערכה לא זמינה כרגע — ייתכן שהמשרד מעדכן אותה.</p>;
  const html = summaryHtml(buildSummary({ clientName: v.clientName, spouseName: v.spouseName, taxYear: v.taxYear, version: v.version, approvedAt: v.approvedAt, draft: v.draft, outputs: v.outputs }));
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <iframe title={`הערכת המס לשנת ${v.taxYear}`} srcDoc={html} sandbox="" style={{ width: '100%', height: 'min(75vh, 680px)', border: '1px solid #e3e0d8', borderRadius: 10, background: '#fff' }} />
      <button type="button" onClick={onClose} style={{ alignSelf: 'flex-start', fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #d8d4ca', background: 'transparent', cursor: 'pointer' }}>סגירה</button>
    </div>
  );
}

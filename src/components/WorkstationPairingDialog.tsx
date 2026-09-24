// ─── «חיבור מחשב עבודה» — קוד צימוד חד-פעמי למחשב נוסף (203) ─────────────────
// ‼ לא לוח ניהול: רק הצעד האנושי היחיד שמוסיף מחשב — קוד שתקף 15 דקות,
// ופקודה אחת להרצה במחשב החדש. האסימון עצמו נוצר בשרת ונשמר רק במחשב ההוא.

import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import { supabase } from '../lib/supabase';

export default function WorkstationPairingDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.rpc('create_workstation_pairing', { p_label: null });
      if (cancelled) return;
      if (e || !data?.ok) setError('לא הצלחתי ליצור קוד. נסו שוב בעוד רגע.');
      else setCode(data.code as string);
    })();
    return () => { cancelled = true; };
  }, []);

  const command = code
    ? `powershell -NoProfile -ExecutionPolicy Bypass -File worker\\install-workstation.ps1 -Code ${code}`
    : '';

  return (
    <Modal title="חיבור מחשב עבודה" onClose={onClose} width={520}
      footer={<button type="button" className="ui-btn ui-btn-ghost" onClick={onClose} data-autofocus>סגירה</button>}>
      <p style={{ marginTop: 0, lineHeight: 1.7 }}>
        כל מחשב שיש בו את תוכנת PIVO לעבודה מול הרשויות יכול להריץ את האוטומציה.
        במחשב החדש, בתיקיית ההתקנה של PIVO, הריצו את הפקודה הזאת. הקוד תקף 15 דקות ולשימוש אחד.
      </p>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      {!code && !error && <div style={{ color: 'var(--ink-3)' }}>יוצר קוד…</div>}
      {code && (
        <>
          <div style={{ fontSize: 'var(--fs-24, 24px)', fontWeight: 600, letterSpacing: '.15em', margin: '.5rem 0' }}
            className="ltr-isolate" dir="ltr">{code}</div>
          <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--surface-2)', padding: '.6rem', borderRadius: 6, fontSize: 'var(--fs-12)' }}>{command}</pre>
          <button type="button" className="ui-btn ui-btn-sm" onClick={() => void navigator.clipboard?.writeText(command)}>העתק פקודה</button>
          <p style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
            ההתחברות לשע״ם ולביטוח לאומי נעשית בכל מחשב בנפרד — אין העברה של סיסמאות או חיבורים בין מחשבים.
          </p>
        </>
      )}
    </Modal>
  );
}

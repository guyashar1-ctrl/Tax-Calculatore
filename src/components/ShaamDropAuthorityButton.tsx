// ─── «לא צריך ייצוג ב…» — רשות שע״ם יוצאת מהבקשה ב-PIVO ──────────────────────
// ‼ הכרעת גיא (28.09.2026): מ"ה נקלט, ניכויים «ממתין לפתיחת התיק» כי אין תיק —
// המשרד יכול להחליט שבסוף לא צריך ייצוג בניכויים. כתיבה אחת בשרת (205,
// `drop_shaam_authority`): הרשות יוצאת מהמרשם בכרטיס ומהיקף הבקשה, ואם כל מה
// שנשאר פעיל — הבקשה נגמרת.
// ‼ PIVO לא מבטלת בשע״ם. בקשה שכבר נפתחה שם נשארת עד שתבוטל שם (או מעצמה אחרי
// 6 חודשים בלי תיק) — והחלון אומר את זה במפורש.

import { useState } from 'react';
import { supabase } from '../lib/supabase';

const ERRORS: Record<string, string> = {
  already_active: 'הייצוג ברשות הזו כבר נקלט - אין מה להסיר.',
  last_authority: 'זו רשות השע״ם היחידה בבקשה - אין מה להשאיר.',
  not_requested: 'לא התבקש ייצוג ברשות הזו.',
  forbidden: 'אין הרשאה לפעולה הזו.',
  unauthenticated: 'יש להתחבר מחדש.',
};

interface Props {
  clientId: string;
  authority: 'incomeTax' | 'vat' | 'withholding';
  label: string;
  onChanged?: () => void;
}

export default function ShaamDropAuthorityButton({ clientId, authority, label, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const ok = window.confirm(
      `להסיר את הייצוג ב${label} מהבקשה?\n\n`
      + `ב-PIVO: ${label} יוצא מהבקשה ומהכרטיס, ואם כל השאר כבר נקלט - הייצוג יסומן פעיל.\n`
      + `בשע״ם לא משתנה כלום: אם יש שם בקשה ל${label}, היא נשארת עד שתבוטל שם `
      + `(או מעצמה, אחרי 6 חודשים בלי תיק).`);
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('drop_shaam_authority', {
        p_client_id: clientId, p_authority: authority,
      });
      if (rpcError) { setError(rpcError.message); return; }
      const res = data as { ok?: boolean; reason?: string } | null;
      if (!res?.ok) { setError(ERRORS[res?.reason ?? ''] ?? (res?.reason || 'ההסרה נכשלה')); return; }
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההסרה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
        data-testid="shaam-drop-authority"
        style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-12)', padding: '0 .25rem' }}
        title={`לא צריך ייצוג ב${label}? הסרה מהבקשה ב-PIVO (לא בשע״ם).`}
        onClick={() => void run()}>
        {busy ? 'מסיר…' : `לא צריך ייצוג ב${label} - הסר מהבקשה`}
      </button>
      {error && <div className="rep-track-next-err">{error}</div>}
    </>
  );
}

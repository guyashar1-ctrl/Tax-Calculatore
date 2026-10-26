// ─── PIVO מול פייפרלס ללקוח אחד: המשימות, ושתי הפעולות מהמסך (304/306) ──────
// ‼ הכפתורים קוראים לפונקציות בשרת (start_paperless_setup / check_paperless_now) —
// הקלט (ת״ז, הסכום) נקבע שם, לא בדפדפן.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { PAPERLESS_CHECK_CARD_ACTION_TYPE, PAPERLESS_SETUP_CLIENT_ACTION_TYPE } from '../../types/automation';

const START_ERRORS: Record<string, string> = {
  no_signed_amount: 'אין הסכם חתום עם סכום חודשי — אין לפי מה להגדיר את הריטיינר.',
  missing_id_number: 'חסר מספר זהות בכרטיס הלקוח.',
  no_open_setup: 'ההקמה בפייפרלס כבר סגורה.',
  nothing_to_check: 'אין מה לבדוק — התשלום החודשי כבר הושלם.',
  forbidden: 'אין הרשאה ללקוח הזה.',
};

export function usePaperlessPivo(clientId: string) {
  const setup = useAutomationJob(clientId, PAPERLESS_SETUP_CLIENT_ACTION_TYPE);
  const check = useAutomationJob(clientId, PAPERLESS_CHECK_CARD_ACTION_TYPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(fn: 'start_paperless_setup' | 'check_paperless_now', args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    const r = (data ?? {}) as { ok?: boolean; error?: string };
    if (e || !r.ok) { setError(START_ERRORS[r.error ?? ''] ?? 'הפעולה לא נשלחה — נסו שוב.'); return; }
    await Promise.all([setup.reload(), check.reload()]);
  }

  return {
    setupJob: setup.job,
    checkJob: check.job,
    busy,
    error,
    startSetup: (overrideAmount = false) =>
      call('start_paperless_setup', { p_client_id: clientId, p_override_amount: overrideAmount }),
    checkNow: () => call('check_paperless_now', { p_client_id: clientId }),
  };
}

export type PaperlessPivo = ReturnType<typeof usePaperlessPivo>;

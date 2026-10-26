// ─── שורת PIVO בבקשה «הקמת העסק בפייפרלס» (304) ─────────────────────────────
// מה PIVO עושה בפייפרלס ללקוח הזה, ומה (אם בכלל) צריך ממך. ההמחשה המאושרת:
// docs/proposals/2026-10-26-paperless-automation.html (לשונית «איך זה ייראה אצלך»).
// ‼ הכפתורים קוראים לפונקציות בשרת (start_paperless_setup / check_paperless_now) —
// הקלט (ת״ז, הסכום) נקבע שם, לא בדפדפן.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { PAPERLESS_CHECK_CARD_ACTION_TYPE, PAPERLESS_SETUP_CLIENT_ACTION_TYPE } from '../../types/automation';
import type { OnboardingStep } from '../../types/onboarding';
import { conflictText, pivoPaperlessState } from './pivoPaperless';

const START_ERRORS: Record<string, string> = {
  no_signed_amount: 'אין הסכם חתום עם סכום חודשי — אין לפי מה להגדיר את הריטיינר.',
  missing_id_number: 'חסר מספר זהות בכרטיס הלקוח.',
  no_open_setup: 'ההקמה בפייפרלס כבר סגורה.',
  nothing_to_check: 'אין מה לבדוק — התשלום החודשי כבר הושלם.',
  forbidden: 'אין הרשאה ללקוח הזה.',
};

const fmt = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const hm = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return same ? `היום ${hm}` : `${d.getDate()}.${d.getMonth() + 1} ${hm}`;
};

const line = (tone: 'run' | 'ok' | 'wait' | 'you' | 'bad'): React.CSSProperties => ({
  display: 'flex', gap: '.45rem', alignItems: 'flex-start', flexWrap: 'wrap',
  padding: '.45rem .6rem', borderRadius: 8, marginBottom: '.5rem', fontSize: '.92em',
  background: tone === 'ok' ? 'var(--ok-bg)' : tone === 'you' ? 'var(--warn-bg)'
    : tone === 'bad' ? 'var(--danger-bg)' : tone === 'run' ? 'var(--info-bg)' : 'var(--surface-2, var(--warn-bg-soft))',
  color: tone === 'ok' ? 'var(--ok)' : tone === 'you' ? 'var(--warn)'
    : tone === 'bad' ? 'var(--danger)' : tone === 'run' ? 'var(--info)' : 'var(--ink-2)',
  border: tone === 'you' ? '1px solid var(--warn)' : tone === 'bad' ? '1px solid var(--danger)' : '1px solid transparent',
});
const tag: React.CSSProperties = {
  fontSize: '.78em', fontWeight: 700, borderRadius: 999, padding: '0 .5rem',
  background: 'var(--info-bg)', color: 'var(--info)', flex: 'none',
};

export function PaperlessPivoLine({ clientId, step, retainer, open, onKeepPaperlessAmount }: {
  clientId: string;
  step: OnboardingStep;
  retainer?: OnboardingStep;
  /** ההקמה פתוחה — רק אז מציעים «הקם בפייפרלס». */
  open: boolean;
  /** «הסכום בפייפרלס נכון, להשאיר» — סימון ידני של סעיף הריטיינר וניקוי הפער. */
  onKeepPaperlessAmount: () => void;
}) {
  const setup = useAutomationJob(clientId, PAPERLESS_SETUP_CLIENT_ACTION_TYPE);
  const check = useAutomationJob(clientId, PAPERLESS_CHECK_CARD_ACTION_TYPE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const state = pivoPaperlessState({ setupJob: setup.job, checkJob: check.job, step, retainer });

  async function call(fn: 'start_paperless_setup' | 'check_paperless_now', args: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    const r = (data ?? {}) as { ok?: boolean; error?: string };
    if (error || !r.ok) { setErr(START_ERRORS[r.error ?? ''] ?? 'הפעולה לא נשלחה — נסו שוב.'); return; }
    await Promise.all([setup.reload(), check.reload()]);
  }
  const startSetup = (override = false) => call('start_paperless_setup', { p_client_id: clientId, p_override_amount: override });
  const checkNow = () => call('check_paperless_now', { p_client_id: clientId });

  const btn = (label: string, onClick: () => void, primary = false) => (
    <button type="button" className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'}`} disabled={busy} onClick={onClick}>{label}</button>
  );
  const P = <span style={tag}>PIVO</span>;

  let body: React.ReactNode = null;
  switch (state.kind) {
    case 'login':
      body = <div style={line('you')}>{P}<span>צריך אותך: להתחבר לפייפרלס בחלון שבמחשב המשרד. אחרי ההתחברות זה ממשיך לבד.</span></div>;
      break;
    case 'running':
      body = (
        <div style={line('run')} role="status">{P}
          <span>{state.what === 'setup' ? 'מקים בפייפרלס…' : 'בודק בפייפרלס…'}</span>
        </div>
      );
      break;
    case 'unknown':
      body = (
        <div style={line('you')}>{P}
          <span style={{ flex: '1 1 14rem' }}>לא ידוע אם הכול נשמר בפייפרלס — ההקמה נקטעה באמצע. PIVO לא ינסה שוב לבד; הבדיקה רק קוראת.</span>
          {btn('בדוק עכשיו', checkNow, true)}
        </div>
      );
      break;
    case 'conflict':
      body = (
        <div style={line('you')}>{P}
          <span style={{ flex: '1 1 14rem' }}>{conflictText(state.conflict)}</span>
          <span style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
            {btn(`עדכן בפייפרלס ל־${state.conflict.agreedBeforeVat.toLocaleString('he-IL')}`, () => startSetup(true), true)}
            {state.conflict.paperlessBeforeVat != null && (!state.conflict.paperlessPayment || state.conflict.paperlessPayment === 'credit')
              && btn(`${state.conflict.paperlessBeforeVat.toLocaleString('he-IL')} נכון, להשאיר`, onKeepPaperlessAmount)}
          </span>
        </div>
      );
      break;
    case 'failed':
      body = (
        <div style={line('bad')}>{P}
          <span style={{ flex: '1 1 14rem' }}>לא הושלם בפייפרלס{state.detail ? `: ${state.detail}` : '.'}</span>
          {open && btn('נסה שוב', () => startSetup(false), true)}
        </div>
      );
      break;
    case 'cardEntered':
      body = state.byPivo
        ? <div style={line('ok')}>{P}<span>ראה בפייפרלס שהלקוח הזין כרטיס · {fmt(state.at)}</span></div>
        : null;
      break;
    case 'waitingCard':
      body = (
        <div style={line('wait')}>{P}
          <span style={{ flex: '1 1 14rem' }}>
            {state.byPivo ? `הוקם בפייפרלס ${fmt(state.setupAt)} לפי ההסכם` : 'הריטיינר עודכן'} · ממתין שהלקוח יזין כרטיס.
            {' '}PIVO בודק כל בוקר{state.checkedAt ? ` · נבדק ${fmt(state.checkedAt)}` : ''}.
          </span>
          {btn('בדוק עכשיו', checkNow)}
        </div>
      );
      break;
    case 'idle':
      body = open ? (
        <div style={line('wait')}>{P}
          <span style={{ flex: '1 1 14rem' }}>יכול להקים את הלקוח בפייפרלס לפי ההסכם: מספר עוסק, שם העסק, משיכת עוסקים, סליקת אשראי והסכום החודשי.</span>
          {btn('הקם בפייפרלס', () => startSetup(false), true)}
        </div>
      ) : null;
      break;
  }

  return (
    <>
      {body}
      {err && <div role="alert" style={{ color: 'var(--danger)', fontSize: '.9em', marginTop: '-.3rem', marginBottom: '.5rem' }}>{err}</div>}
    </>
  );
}

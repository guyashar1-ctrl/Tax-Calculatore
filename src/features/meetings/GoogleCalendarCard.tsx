// ─── «יומן Google» בעמוד «חיבורים» ──────────────────────────────────────────
// ‼ חיבור הוא רק כניסה: «מחובר» = יש מפתח שמור ו-Google לא ביטל אותו (last_error).
// המפתח עצמו לעולם לא מגיע לדפדפן (225) — כאן רק המצב, דרך google_calendar_status.
// ‼ החזרה מ-Google נוחתת כאן עם ‎?google=connected|error‎ — מציגים ומנקים מהכתובת.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { GoogleConnection } from './meetingModel';

const RETURN_ERRORS: Record<string, string> = {
  denied: 'החיבור בוטל בחלון של Google. אפשר לנסות שוב.',
  scopes: 'לא אושרו כל ההרשאות. בחלון של Google צריך לסמן גם את היומן.',
  no_refresh: 'Google לא החזיר מפתח קבוע. נתקו את PIVO בהגדרות החשבון ב-Google ונסו שוב.',
  config: 'החיבור ל-Google עוד לא הוגדר בשרת (מזהה האפליקציה חסר).',
  state: 'פג הזמן לחיבור. לחצו שוב «חיבור».',
};

function Status({ tone, children }: { tone: 'on' | 'off' | 'warn'; children: React.ReactNode }) {
  return <span className={`of-conn-state is-${tone}`}><span className="of-conn-dot" aria-hidden="true" />{children}</span>;
}

export default function GoogleCalendarCard() {
  const [conn, setConn] = useState<GoogleConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    const { data } = await supabase.rpc('google_calendar_status');
    const s = (data ?? {}) as Record<string, any>;
    setConn({ connected: !!s.connected, email: s.email, connectedAt: s.connectedAt, lastError: s.lastError ?? null });
  }

  useEffect(() => {
    load();
    const url = new URL(window.location.href);
    const back = url.searchParams.get('google');
    if (back) {
      const reason = url.searchParams.get('reason') ?? '';
      setMessage(back === 'connected'
        ? { tone: 'ok', text: 'היומן חובר. מעכשיו «שלח זימון» יוצא מהיומן הזה.' }
        : { tone: 'err', text: RETURN_ERRORS[reason] ?? 'החיבור לא הושלם. נסו שוב.' });
      url.searchParams.delete('google');
      url.searchParams.delete('reason');
      window.history.replaceState(null, '', url.toString());
    }
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}#/firm/connections`;
    const { data, error } = await supabase.functions.invoke('google-calendar-connect', { body: { action: 'start', returnTo } });
    if (error || !data?.ok || !data.url) {
      setBusy(false);
      setMessage({ tone: 'err', text: data?.error === 'google_not_configured'
        ? RETURN_ERRORS.config : 'לא הצלחנו לפתוח את החיבור ל-Google. נסו שוב.' });
      return;
    }
    window.location.assign(data.url);
  }

  async function disconnect() {
    setBusy(true);
    await supabase.functions.invoke('google-calendar-connect', { body: { action: 'disconnect' } });
    setBusy(false);
    setMessage({ tone: 'ok', text: 'היומן נותק. פגישות שכבר נקבעו נשארות ביומן שלך ב-Google.' });
    load();
  }

  const needsReconnect = !!conn?.connected && conn.lastError === 'reconnect';
  return (
    <li className="of-conn">
      <div className="of-conn-head">
        <h2 className="of-conn-name">יומן Google</h2>
        {!conn ? <Status tone="off">בודק…</Status>
          : needsReconnect ? <Status tone="warn">צריך לחבר מחדש</Status>
            : conn.connected ? <Status tone="on">מחובר</Status> : <Status tone="off">לא מחובר</Status>}
      </div>
      <p className="of-conn-what">
        {conn?.connected && !needsReconnect
          ? <>מאפשר: זימון לפגישה ב-Google Meet מהיומן <span className="ltr-isolate">{conn.email}</span>, שינוי מועד, ביטול, ולראות מי אישר הגעה.</>
          : 'בלי חיבור אין: זימון לפגישה ב-Google Meet מתוך PIVO.'}
      </p>
      {needsReconnect && (
        <p className="of-conn-todo"><b>מה לעשות:</b> Google ביטל את החיבור (למשל אחרי החלפת סיסמה). לוחצים «חיבור מחדש» ומאשרים.</p>
      )}
      {message && <p className={`of-conn-todo mt-conn-msg is-${message.tone}`} role="status">{message.text}</p>}
      <div className="of-conn-acts">
        {(!conn?.connected || needsReconnect) ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !conn} onClick={connect}>
              {busy ? 'פותח את Google…' : needsReconnect ? 'חיבור מחדש' : 'חיבור יומן Google'}
            </button>
            <span className="of-muted">נפתח חלון של Google: בוחרים את חשבון המשרד ומאשרים גישה ליומן. פעם אחת.</span>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={disconnect}>ניתוק</button>
        )}
      </div>
    </li>
  );
}

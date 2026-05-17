import { useState } from 'react';
import { useAuth, DEV_AUTO_LOGIN_ENABLED } from '../hooks/useAuth';

const IS_DEV = import.meta.env.DEV;

export default function LoginScreen() {
  const { signInWithGoogle, signInWithDevUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
      setBusy(false);
    }
  }

  async function handleDevLogin() {
    setBusy(true);
    setError(null);
    try {
      await signInWithDevUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">📊</div>
        <h1 className="login-title">CRM רואה חשבון</h1>
        <p className="login-subtitle">היכנס כדי לגשת ללקוחות, למשימות ולמסמכים שלך</p>

        <button
          type="button"
          className="login-google-btn"
          onClick={handleClick}
          disabled={busy}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2C41 35.2 44 30 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          {busy ? 'מתחבר…' : 'התחבר עם Google'}
        </button>

        {IS_DEV && (
          <button
            type="button"
            onClick={handleDevLogin}
            disabled={busy}
            style={{
              marginTop: 12,
              padding: '10px 16px',
              background: '#fef3c7',
              color: '#92400e',
              border: '1px dashed #f59e0b',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            🧪 כניסה כמשתמש בדיקה (DEV בלבד)
            {DEV_AUTO_LOGIN_ENABLED && <span style={{ fontSize: 11, opacity: 0.7, display: 'block' }}>auto-login פעיל — אמור להיכנס אוטומטית</span>}
          </button>
        )}

        {error && <div className="login-error">שגיאה: {error}</div>}

        <p className="login-footnote">
          הנתונים שלך מוצפנים ופרטיים. רק אתה רואה אותם.
        </p>
      </div>
    </div>
  );
}

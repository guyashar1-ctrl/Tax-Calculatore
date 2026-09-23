// ─── «יש גרסה חדשה של PIVO» ────────────────────────────────────────────────
// ‼ בודק ברקע (כל דקה ובחזרה ללשונית) לאיזה bundle מפנה index.html עכשיו.
// אם הוא שונה מזה שרץ בלשונית — פס קטן עם «רענון». לא מרענן לבד: ייתכן
// שהרו"ח באמצע הקלדה, ורענון אוטומטי היה מוחק לו עבודה.
// פעיל בפרודקשן בלבד (בפיתוח vite מגיש מודולים ולא bundle).

import { useEffect, useState } from 'react';
import { mainBundleName, isNewVersionAvailable } from '../lib/appVersion';

const CHECK_MS = 60_000;

function currentBundle(): string | null {
  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[src]')];
  for (const s of scripts) {
    const name = mainBundleName(s.getAttribute('src'));
    if (name) return name;
  }
  return null;
}

export default function NewVersionBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const mine = currentBundle();
    if (!mine) return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        if (isNewVersionAvailable(mine, await res.text())) setAvailable(true);
      } catch { /* רשת — ננסה בפעם הבאה */ }
    };
    const timer = setInterval(() => { void check(); }, CHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void check();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (!available) return null;
  return (
    <div role="status" style={{
      position: 'fixed', bottom: 16, insetInlineStart: 16, zIndex: 2000,
      background: 'var(--card, #fff)', color: 'var(--ink-1, #111)',
      border: '1px solid color-mix(in srgb, var(--ink-1, #111) 18%, transparent)', borderRadius: 10, boxShadow: 'var(--shadow-lg, 0 4px 16px rgba(0,0,0,.12))',
      padding: '.6rem .8rem', display: 'flex', gap: '.6rem', alignItems: 'center', maxWidth: 'calc(100vw - 32px)',
      fontSize: 'var(--fs-13, 13px)',
    }}>
      <span>יש גרסה חדשה של PIVO. רעננו כדי לקבל את התיקונים האחרונים.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
        רענון
      </button>
    </div>
  );
}

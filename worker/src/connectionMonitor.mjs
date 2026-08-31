// connectionMonitor.mjs — מה שמדליק את הנורית בכותרת של PIVO, ומה ששומר
// על הסשן ער.
//
// שני קצבים שונים בכוונה:
//   · בדיקת מצב (CHECK_EVERY_MS)     — זולה, רק כדי לדעת ירוק/אפור.
//   · נגיעת keep-alive (KEEPALIVE_MS) — כל רבע שעה, רק כשמחוברים.
//
// ‼ אין AI כאן. בדיקת כותרת קבועה ובקשת HEAD אחת — זהו.
// ‼ שום דבר מהסשן לא נשמר: רק דגל בוליאני וחותמת זמן עולים ל-Supabase.

import { attach, detach, classifyShaamAuth, keepAlive } from './browserSession.mjs';
import { reportStatus } from './apiClient.mjs';

const CHECK_EVERY_MS = 30_000;
const KEEPALIVE_MS = 15 * 60_000;

let lastCheck = 0;
let lastKeepAlive = 0;
let lastReported = null;

/**
 * נקרא מכל סבב של הלולאה הראשית. עושה עבודה רק כשהגיע הזמן, כדי שתשאול
 * המשימות יישאר מהיר.
 */
export async function tickConnectionMonitor(userId, workerId, log) {
  const now = Date.now();
  if (now - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = now;

  let connected = false;
  const conn = await attach();
  if (conn.ok) {
    try {
      const auth = await classifyShaamAuth(conn.page);
      connected = !!auth.authenticated;

      if (connected && now - lastKeepAlive >= KEEPALIVE_MS) {
        lastKeepAlive = now;
        const ka = await keepAlive(conn.page);
        log(`keep-alive לשע״ם: ${ka.ok ? `ok (${ka.status})` : `לא בוצע — ${ka.detail}`}`);
      }
    } finally {
      await detach(conn.browser);
    }
  }

  // מדווחים רק כשמשהו השתנה — אחרת זו כתיבה מיותרת כל 30 שניות.
  if (connected !== lastReported) {
    lastReported = connected;
    log(`מצב חיבור לשע״ם: ${connected ? 'מחובר' : 'לא מחובר'}`);
  }
  await reportStatus(userId, workerId, {
    shaam: { connected, checkedAt: new Date(now).toISOString() },
  }).catch(() => { /* דיווח מצב שנכשל לא מפיל את העובד */ });
}

/** אחרי connect/disconnect — מאלץ בדיקה מיידית במקום להמתין ל-30 שניות. */
export function invalidateConnectionCache() {
  lastCheck = 0;
}

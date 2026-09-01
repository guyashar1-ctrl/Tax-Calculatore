// connectionMonitor.mjs — מה שמדליק את הנורית בכותרת של PIVO, ומה ששומר
// על הסשן ער.
//
// שני קצבים, ולכל אחד תפקיד אחר:
//   · LOCAL_CHECK_MS  — זול, מקומי. "יש בכלל חלון, והדף עומד על שע״ם?"
//     נותן ירוק מהר אחרי שהרו"ח מתחבר, בלי להעמיס בקשות על הפורטל.
//   · SERVER_PROBE_MS — בקשה אחת לשרת. **גם** מאמתת שהסשן חי **וגם**
//     מחזיקה אותו ער. זהו מקור האמת.
//
// ‼ למה בקשת אמת ולא רק כותרת הטאב: כותרת של דף שכבר טעון נשארת "HomePage"
// גם אחרי שהשרת ניתק את הסשן. בלי בדיקה טרייה הנורית הייתה נשארת ירוקה
// מעל סשן מת — בדיוק הדבר שהיא אמורה למנוע.
//
// ‼ SERVER_PROBE_MS חייב להיות **הרבה מתחת** לזמן הניתוק של שע״ם (כ-15 דק'
// לפי מה שנצפה בעבודה יומיומית). מרווח ששווה לזמן הניתוק הוא הגרלה: די
// שהבקשה תאחר בשנייה והסשן כבר מת. 4 דקות משאירות שוליים של פי שלושה.
//
// ‼ אין AI כאן. בקשה קבועה לכתובת קבועה ובדיקת מחרוזת קבועה — זהו.
// ‼ שום דבר מהסשן לא נשמר: רק דגל בוליאני וחותמת זמן עולים ל-Supabase.

import { attach, detach, classifyShaamAuth, probeServerSession } from './browserSession.mjs';
import { reportStatus } from './apiClient.mjs';

const LOCAL_CHECK_MS = 30_000;
const SERVER_PROBE_MS = 4 * 60_000;

let lastCheck = 0;
let lastProbe = 0;
let lastReported = null;

/**
 * נקרא מכל סבב של הלולאה הראשית. עושה עבודה רק כשהגיע הזמן, כדי שתשאול
 * המשימות יישאר מהיר.
 */
export async function tickConnectionMonitor(userId, workerId, log) {
  const now = Date.now();
  if (now - lastCheck < LOCAL_CHECK_MS) return;
  lastCheck = now;

  let connected = false;
  const conn = await attach();
  if (conn.ok) {
    try {
      const local = await classifyShaamAuth(conn.page);
      connected = !!local.authenticated;

      // בדיקת אמת + keep-alive באותה בקשה. רצה גם כשהבדיקה המקומית אמרה
      // "מחובר" — היא בדיוק זו שיכולה לשקר.
      if (now - lastProbe >= SERVER_PROBE_MS) {
        lastProbe = now;
        const probe = await probeServerSession(conn.page);
        if (probe.ok) {
          // תשובת השרת גוברת על הכותרת המקומית, לשני הכיוונים.
          connected = probe.authenticated;
          log(`בדיקת סשן מול שע״ם: ${probe.authenticated ? 'חי' : 'פג'} · ${probe.detail}`);
        } else {
          log(`בדיקת סשן מול שע״ם נכשלה: ${probe.detail}`);
        }
      }
    } finally {
      await detach(conn.browser);
    }
  }

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
  lastProbe = 0;
}

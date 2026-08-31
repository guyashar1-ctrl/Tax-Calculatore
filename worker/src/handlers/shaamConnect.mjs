// shaamConnect.mjs — "התחברות לשע״ם" מהכותרת. פותח את חלון Chrome הייעודי
// אם הוא סגור, ומדווח מה מצב האימות.
//
// ‼ הגבול נשמר: הפונקציה פותחת חלון בלבד. את בחירת האישור הדיגיטלי ואת
// ה-PIN מבצע הרו"ח בעצמו, בחלון הגלוי. אין כאן ולא יהיה כאן שום ניסיון
// לעקוף, למלא או ללחוץ על דיאלוג אימות.
import { attach, detach, classifyShaamAuth, launchDedicatedChrome } from '../browserSession.mjs';
import { NeedsHumanError } from '../errors.mjs';

export const actionType = 'shaam.connect';

const AUTH_PENDING =
  'חלון שע״ם נפתח. יש להשלים בו את בחירת האישור הדיגיטלי ואת קוד ה-PIN. ' +
  'מיד לאחר מכן הנורית בכותרת תידלק בירוק.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  let conn = await attach();

  if (!conn.ok && conn.reason === 'not_running') {
    ctx.log('החלון סגור — פותח חלון Chrome ייעודי');
    launchDedicatedChrome();
    // המתנה קצרה שהדפדפן יעלה. אם עדיין לא — הרו"ח יראה "דרוש אישור"
    // ויוכל ללחוץ שוב; לא נועלים את המשימה בלולאת המתנה ארוכה.
    await new Promise((r) => setTimeout(r, 4000));
    conn = await attach();
  }

  if (!conn.ok) {
    // 'blocked' = החלון פתוח וממתין לאישור/PIN — בדיוק המצב שבו הרו"ח
    // צריך לפעול, ולכן needs_human ולא כישלון.
    throw new NeedsHumanError(AUTH_PENDING, `chrome_${conn.reason ?? 'not_running'}`);
  }

  try {
    const auth = await classifyShaamAuth(conn.page);
    ctx.log('מצב אימות:', auth);
    if (auth.authenticated) return { result: { connected: true, system: 'shaam' } };
    throw new NeedsHumanError(AUTH_PENDING, auth.state);
  } finally {
    await detach(conn.browser);
  }
}

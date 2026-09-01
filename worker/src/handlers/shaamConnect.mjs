// shaamConnect.mjs — מה שקורה כשהרו"ח לוחץ "שע״ם" בכותרת של PIVO.
//
// שלושה מצבים, בסדר הזה בדיוק:
//   1. כבר מאומת        ⇒ לא נוגעים בכלום, מדווחים "מחובר".
//   2. החלון פתוח       ⇒ מביאים לחזית ומנווטים לשע״ם אם צריך. לא פותחים שני.
//   3. החלון סגור       ⇒ פותחים אותו.
// בשני האחרונים התוצאה היא needs_human: הרו"ח משלים אישור + PIN בחלון,
// וניטור החיבור מדליק את הנורית לירוק תוך שניות.
//
// ‼ הגבול המוחלט: הפונקציה פותחת/ממקדת חלון בלבד. בחירת אישור דיגיטלי,
// PIN ו-OTP נעשים על ידי הרו"ח. אין כאן שום ניסיון למלא, ללחוץ או לעקוף
// דיאלוג אימות — לא היום ולא בהמשך.
import {
  attach, detach, classifyShaamAuth, launchDedicatedChrome, focusShaamWindow,
} from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.connect';

const AUTH_PENDING =
  'חלון שע״ם פתוח וממתין לך. יש להשלים בו בחירת אישור דיגיטלי והזנת PIN — ' +
  'ואז הנורית בכותרת תידלק בירוק תוך כמה שניות.';

const CHROME_NOT_FOUND =
  'לא נמצאה התקנה של Google Chrome במחשב הזה. התקינו Chrome, או הגדירו את הנתיב ' +
  'אליו במשתנה הסביבה PIVO_CHROME_EXE של העובד המקומי.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  // ── 1. כבר מאומת? לא נוגעים. ──
  let conn = await attach();
  if (conn.ok) {
    try {
      const auth = await classifyShaamAuth(conn.page);
      if (auth.authenticated) {
        ctx.log('כבר מאומת — לא נוגע בחלון');
        return { result: { connected: true, system: 'shaam', action: 'none' } };
      }
      // ── 2. פתוח אבל לא מאומת: לחזית, לא חלון נוסף. ──
      ctx.log('החלון פתוח ולא מאומת — מביא לחזית');
      await focusShaamWindow(conn.page);
      throw new NeedsHumanError(AUTH_PENDING, 'awaiting_manual_auth');
    } finally {
      await detach(conn.browser);
    }
  }

  // 'blocked' = החלון פתוח אבל דיאלוג אישור/PIN כבר ממתין. אין מה לפתוח.
  if (conn.reason === 'blocked') {
    ctx.log('החלון פתוח וחסום מול דיאלוג אימות');
    throw new NeedsHumanError(AUTH_PENDING, 'awaiting_manual_auth');
  }

  // ── 3. סגור: פותחים. ──
  ctx.log('החלון סגור — פותח חלון Chrome ייעודי');
  const launched = launchDedicatedChrome();
  if (!launched.ok) {
    throw new PermanentError(CHROME_NOT_FOUND, launched.reason);
  }

  // המתנה קצרה שהחלון יעלה, ואז בדיקה אחת. לא ממתינים לאימות עצמו —
  // זה יכול לקחת דקות, והעובד מריץ משימה אחת בכל רגע.
  await new Promise((r) => setTimeout(r, 4000));
  conn = await attach();
  if (conn.ok) {
    try {
      const auth = await classifyShaamAuth(conn.page);
      if (auth.authenticated) {
        return { result: { connected: true, system: 'shaam', action: 'launched' } };
      }
    } finally {
      await detach(conn.browser);
    }
  }
  throw new NeedsHumanError(AUTH_PENDING, 'awaiting_manual_auth');
}

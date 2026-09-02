// btlConnect.mjs — מה שקורה כשהרו"ח לוחץ «ביטוח לאומי» בכותרת של PIVO.
//
// ‼ שכבה אחת בלבד, בניגוד לשע״ם: «מערכת ייצוג לקוחות» של ב״ל היא יעד אחד
// מאחורי שער אימות אחד. אין כאן GMF/מע״מ/מגן ואין ניווט בין מערכות.
//
// האימות עצמו — ת.ז., קוד משתמש, סיסמה, וקוד חד-פעמי לנייד — נעשה **על ידי
// הרו"ח** בחלון הגלוי שנפתח. האוטומציה מביאה אותו לנקודה הנכונה ועוצרת.
// היא לא מקלידה סיסמאות ולא קודים חד-פעמיים. אף פעם.
//
// הזרימה: חלון קיים? לנצל. סגור? לפתוח. לא מחובר? להביא לחזית ולעצור.
import {
  attachBtl, detachBtl, classifyBtlAuth, probeBtlSession,
  launchDedicatedBtlChrome, focusBtlWindow, pickBtlPage,
} from '../btlSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'btl.connect';

const BTL_AUTH_PENDING =
  'חלון «מערכת ייצוג לקוחות» של ביטוח לאומי פתוח וממתין לך. יש להזין בו קוד ' +
  'משתמש (ואת הקוד החד-פעמי שיישלח לנייד) — ואז הנורית תידלק בירוק לבד, ' +
  'בלי צורך ללחוץ שוב.';

const CHROME_NOT_FOUND =
  'לא נמצאה התקנה של Google Chrome במחשב הזה. התקינו Chrome, או הגדירו את הנתיב ' +
  'אליו במשתנה הסביבה PIVO_CHROME_EXE של העובד המקומי.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  let conn = await attachBtl();

  if (!conn.ok && conn.reason === 'not_running') {
    ctx.log('חלון ביטוח לאומי סגור — פותח חלון Chrome ייעודי');
    const launched = launchDedicatedBtlChrome();
    if (!launched.ok) throw new PermanentError(CHROME_NOT_FOUND, launched.reason);
    await new Promise((r) => setTimeout(r, 4000));
    conn = await attachBtl();
  }

  if (!conn.ok) {
    ctx.log('לא ניתן להתחבר לחלון ביטוח לאומי:', conn.reason);
    throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');
  }

  try {
    // ‼ הלשונית הראשונה אינה בהכרח זו שבה הרו"ח התחבר. בוחרים לשונית
    // מחוברת אם יש כזו — אחרת שיפוט על לשונית מתה היה מדווח «מנותק».
    const page = await pickBtlPage(conn.context, conn.page);

    const local = await classifyBtlAuth(page);
    ctx.log(`מצב מקומי: ${local.connected ? 'מחובר' : `לא מחובר (${local.reason})`} · ${local.pathname ?? '—'}`);
    if (!local.connected) {
      await focusBtlWindow(page);
      throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');
    }

    // ‼ דף טעון אינו עדות לסשן חי. השאלה נשאלת מהשרת.
    const session = await probeBtlSession(page);
    ctx.log(`בדיקת סשן מול השרת: ${session.ok ? session.detail : `נכשלה — ${session.detail}`}`);
    if (session.ok && !session.connected) {
      await focusBtlWindow(page);
      throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');
    }

    return { result: { ready: true, system: 'btl', btl: true } };
  } finally {
    await detachBtl(conn.browser);
  }
}

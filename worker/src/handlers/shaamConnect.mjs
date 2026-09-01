// shaamConnect.mjs — מה שקורה כשהרו"ח לוחץ "שע״ם" בכותרת של PIVO.
//
// ‼ "מחובר" פירושו **הסביבה מוכנה לאוטומציה**, לא "נכנסתי לפורטל". יש שתי
// שכבות אימות נפרדות, ואם השנייה לא מוכנה כל אוטומציה תיתקל בקיר סיסמה
// באמצע הדרך:
//   1. פורטל שע״ם  — אישור דיגיטלי + PIN (כרטיס חכם).
//   2. מערכת גביית מס הכנסה (GMF) — שם משתמש וסיסמה משלה.
// שתיהן מוזנות **ידנית** על ידי הרו"ח בחלון הגלוי. האוטומציה מביאה אותו
// לנקודה הנכונה ועוצרת — היא לא מקלידה אישור, PIN, OTP או סיסמה. אף פעם.
//
// הזרימה: חלון קיים? לנצל. סגור? לפתוח. פורטל לא מאומת? לעצור שם.
// פורטל מאומת אך GMF לא? להביא למסך ה-GMF ולעצור שם. שתיהן מוכנות? ירוק.
import {
  attach, detach, classifyShaamAuth, probeServerSession,
  launchDedicatedChrome, focusShaamWindow, openGmfAndCheck, openVatAndCheck,
} from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.connect';

const SHAAM_AUTH_PENDING =
  'חלון שע״ם פתוח וממתין לך. יש להשלים בו בחירת אישור דיגיטלי והזנת PIN — ' +
  'ואז אמשיך אוטומטית, בלי צורך ללחוץ שוב.';

const GMF_AUTH_PENDING =
  'שלב 2 מתוך 3 — מערכת גביית מס הכנסה מבקשת סיסמה. הזינו אותה בחלון שע״ם ' +
  'שנפתח, ואמשיך משם לבד. האוטומציה לא מזינה סיסמאות.';

const VAT_AUTH_PENDING =
  'שלב 3 מתוך 3 — מע״מ מבקשת סיסמה. הזינו אותה בחלון שע״ם שנפתח, ואז הנורית ' +
  'תידלק בירוק לבד. האוטומציה לא מזינה סיסמאות.';

const CHROME_NOT_FOUND =
  'לא נמצאה התקנה של Google Chrome במחשב הזה. התקינו Chrome, או הגדירו את הנתיב ' +
  'אליו במשתנה הסביבה PIVO_CHROME_EXE של העובד המקומי.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  let conn = await attach();

  // ── חלון סגור: לפתוח. ──
  if (!conn.ok && conn.reason === 'not_running') {
    ctx.log('החלון סגור — פותח חלון Chrome ייעודי');
    const launched = launchDedicatedChrome();
    if (!launched.ok) throw new PermanentError(CHROME_NOT_FOUND, launched.reason);
    await new Promise((r) => setTimeout(r, 4000));
    conn = await attach();
  }

  // 'blocked' = החלון פתוח ודיאלוג אישור/PIN כבר ממתין.
  if (!conn.ok) {
    ctx.log('לא ניתן להתחבר לחלון:', conn.reason);
    throw new NeedsHumanError(SHAAM_AUTH_PENDING, 'awaiting_shaam_auth');
  }

  try {
    // ── שכבה 1: פורטל שע״ם ──
    const local = await classifyShaamAuth(conn.page);
    if (!local.authenticated) {
      ctx.log('הפורטל אינו מאומת — מביא את החלון לנקודת ההתחברות');
      await focusShaamWindow(conn.page);
      throw new NeedsHumanError(SHAAM_AUTH_PENDING, 'awaiting_shaam_auth');
    }
    const session = await probeServerSession(conn.page);
    if (!session.authenticated) {
      ctx.log('סשן הפורטל פג מול השרת');
      await focusShaamWindow(conn.page);
      throw new NeedsHumanError(SHAAM_AUTH_PENDING, 'awaiting_shaam_auth');
    }
    ctx.log('שכבה 1 — פורטל שע״ם: מאומת');

    // ── שכבה 2: מערכת גביית מס הכנסה ──
    // ‼ ברצף, באותה לשונית. המערכות האלה מסרבות להיפתח פעמיים במקביל
    // ("למניעת שיבוש הנתונים לא ניתן לפתוח את אותו הישום" — נצפה במגן),
    // ולכן פתיחה מקבילה או בלשוניות נוספות הייתה מייצרת שגיאות בעצמה.
    const gmf = await openGmfAndCheck(conn.page);
    ctx.log(`שכבה 2 — GMF: ${gmf.ready ? 'מוכנה' : `דרושה התחברות (${gmf.reason})`} · ${gmf.pathname}`);
    if (!gmf.ready) {
      if (gmf.reason === 'unexpected_destination') {
        throw new PermanentError(
          `הניווט למערכת הגבייה הגיע ליעד לא צפוי (${gmf.pathname}).`,
          'gmf_unexpected_destination',
        );
      }
      throw new NeedsHumanError(GMF_AUTH_PENDING, 'awaiting_gmf_auth');
    }

    // ── שכבה 3: מע״מ ──
    const vat = await openVatAndCheck(conn.page);
    ctx.log(`שכבה 3 — מע״מ: ${vat.ready ? 'מוכנה' : `דרושה התחברות (${vat.reason})`} · ${vat.pathname}`);
    if (!vat.ready) {
      if (vat.reason === 'unexpected_destination') {
        throw new PermanentError(
          `הניווט למע״מ הגיע ליעד לא צפוי (${vat.pathname}).`,
          'vat_unexpected_destination',
        );
      }
      throw new NeedsHumanError(VAT_AUTH_PENDING, 'awaiting_vat_auth');
    }

    return { result: { ready: true, system: 'shaam', shaam: true, gmf: true, vat: true } };
  } finally {
    await detach(conn.browser);
  }
}

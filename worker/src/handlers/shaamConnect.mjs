// shaamConnect.mjs — מה שקורה כשהרו"ח לוחץ "התחבר לשע״ם" בכותרת של PIVO.
//
// ‼ "מחובר" (ירוק) = חיבור **טרי** שעבר שני שלבים: (1) פורטל שע״ם — כרטיס
// חכם + PIN, ידנית בחלון הגלוי; (2) כניסה למערכת גביית מס הכנסה (GMF), שהיא
// ה-bootstrap: הסיסמה המשנית שלה משותפת עם מע״מ, ומעבר השער הזה הוא מה
// שהופך את הסשן ל"שמיש". תיקון מוצר (16.09.2026, נצפה חי — ראה
// warmupManager.ensureGmf): לפני כן ה-job המתין לניווט בארבע תת-המערכות
// לפני שדיווח הצלחה, והנורית חיכתה יותר מדי. מע״מ/מגן/ייצוג **אינן** תנאי
// לירוק: connectionMonitor.mjs מגלה אותן ברקע (שכבה אחת בכל סבב), ופעולה
// עסקית שזקוקה לאחת מהן מבקשת אותה נקודתית (shaam.ensure_capability).
// סגירת החלון מאפסת את ה-bootstrap — חיבור חדש מוכיח GMF מחדש (ראה
// resetShaamLifecycle ב-connectionMonitor.mjs).
// האוטומציה לעולם לא מקלידה אישור, PIN, OTP או סיסמה ולא נוגעת בחלונית
// הסיסמאות של Chrome — היא רק ממקדת את השדה ולוחצת «כניסה» אחרי שמולא.
import {
  attach, detach, classifyShaamAuth, probeServerSession,
  launchDedicatedChrome, focusShaamWindow, readGmfOnCurrentPage,
} from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { runCapabilities, HUMAN_MESSAGE } from '../warmupManager.mjs';

export const actionType = 'shaam.connect';

const SHAAM_AUTH_PENDING =
  'חלון שע״ם פתוח וממתין לך. יש להשלים בו בחירת אישור דיגיטלי והזנת PIN — ' +
  'ואז אמשיך אוטומטית, בלי צורך ללחוץ שוב.';

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
    // ── אימות בסיסי: פורטל שע״ם ──
    // ‼ תוקן חי (16.09.2026, ראה docs/SHAAM-AUTOMATION-HANDOFF.md): הבדיקה
    // המקומית (כותרת הטאב) יכולה **רק להעלות** ל"מאומת" — היא שוללת בטעות
    // ברגע שהטאב עומד על GMF/מע״מ/מגן ולא על HomePage, מה שקורה בדיוק אחרי
    // כל warm-up מוצלח (connectionMonitor מזיז את הטאב הזה). בלי fallback
    // ל-probeServerSession, כל connect שני היה נכשל ב-awaiting_shaam_auth
    // למרות שהסשן חי — נצפה בפועל בבדיקה הזו. אותו עיקרון בדיוק שכבר קיים
    // ב-connectionMonitor.mjs, כאן עם probe בלתי-מותנה בזמן כי זו פעולה
    // חד-פעמית ולא תשאול תקופתי.
    const local = await classifyShaamAuth(conn.page);
    let authenticated = local.authenticated;
    if (!authenticated) {
      const session = await probeServerSession(conn.page);
      authenticated = session.authenticated;
    }
    if (!authenticated) {
      ctx.log('הפורטל אינו מאומת — מביא את החלון לנקודת ההתחברות');
      await focusShaamWindow(conn.page);
      throw new NeedsHumanError(SHAAM_AUTH_PENDING, 'awaiting_shaam_auth');
    }
    ctx.log('שלב 1 — פורטל שע״ם: מאומת. עובר ל-bootstrap: מערכת גביית מס הכנסה');

    // ── שלב 2: bootstrap ב-GMF בלבד — אותו מנגנון ensure של ensureCapability,
    // כולל כתיבת progress עמידה (reasonCode ל-popover) וכיבוד cancel_requested.
    // ‼ לשונית שכבר עומדת על מסך GMF מאומת (תפריט או מסך עבודה של הרו"ח)
    // היא הוכחה — לא מנווטים ממנה; runCapabilities בכל מקרה לא נוגע במסך עבודה.
    const onGmf = await readGmfOnCurrentPage(conn.page);
    if (onGmf.ready === true) {
      ctx.log(`שלב 2 — GMF כבר מאומתת בלשונית (${onGmf.reason}). החיבור מוכן`);
      return { result: { ready: true, system: 'shaam', bootstrap: 'gmf' } };
    }
    const { progress } = await runCapabilities(ctx, conn.page, ['gmf']);
    const gmf = progress?.capabilities?.gmf;

    if (gmf?.state === 'ready') {
      ctx.log(`שלב 2 — GMF: מאומתת (${gmf.reasonCode}). החיבור מוכן`);
      return { result: { ready: true, system: 'shaam', bootstrap: 'gmf' } };
    }
    if (gmf?.state === 'human_required') {
      throw new NeedsHumanError(HUMAN_MESSAGE.gmf, 'awaiting_gmf_auth');
    }
    throw new PermanentError(
      `הכניסה למערכת גביית מס הכנסה לא הצליחה (${gmf?.reasonCode ?? 'unknown'}).`,
      'gmf_unavailable',
    );
  } finally {
    await detach(conn.browser);
  }
}

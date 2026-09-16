// shaamConnect.mjs — מה שקורה כשהרו"ח לוחץ "התחבר לשע״ם" בכותרת של PIVO.
//
// ‼ "מחובר" פירושו **הסביבה מוכנה לאוטומציה**, לא "נכנסתי לפורטל". אימות
// בסיסי (פורטל, כרטיס חכם + PIN) מוזן ידנית ע"י הרו"ח בחלון הגלוי. אחריו,
// PIVO מכינה אוטומטית את היכולות שנבחרו (GMF/מע״מ/מגן/ייצוג) — ראה
// warmupManager.mjs. האוטומציה לעולם לא מקלידה אישור, PIN, OTP או סיסמה.
//
// ‼ פרק 16 §16.1/§16.9: לא שרשרת throw שנעצרת בראשונה שדורשת אדם. כל
// capability נבדקת בנפרד ומדווחת בנפרד; "3 מתוך 4 מוכנות" הוא completed
// עם outcome חלקי, לא failed. needs_human נשלח רק כשאין אף capability
// מוכנה ואין יותר מה לבדוק ברשימה הנתונה.
import {
  attach, detach, classifyShaamAuth, probeServerSession,
  launchDedicatedChrome, focusShaamWindow,
} from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { runCapabilities, firstHumanRequired, anyReady, allSettled, DEFAULT_CAPABILITIES, HUMAN_MESSAGE } from '../warmupManager.mjs';

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

export async function run(ctx, input = {}) {
  const capabilities = Array.isArray(input.selectedCapabilities) && input.selectedCapabilities.length
    ? input.selectedCapabilities
    : DEFAULT_CAPABILITIES;

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
    ctx.log('אימות בסיסי — פורטל שע״ם: מאומת. מתחיל הכנת סביבת עבודה');

    // ‼ אחרי אימות בסיסי — warm-up אוטומטי, בלי כפתור נוסף. אותו מנגנון
    // בדיוק שמשמש גם שחזור נקודתי (shaamEnsureCapability.mjs).
    const { progress } = await runCapabilities(ctx, conn.page, capabilities);

    const outcome = allSettled(progress, capabilities) ? 'full' : 'partial';
    ctx.log(`הכנת סביבת עבודה: ${outcome}`);

    if (outcome === 'partial' && !anyReady(progress, capabilities)) {
      // אף capability לא מוכנה — זו עדיין לא כשל סופי, אלא ממתין לאדם.
      const blocking = firstHumanRequired(progress, capabilities);
      throw new NeedsHumanError(
        HUMAN_MESSAGE[blocking] ?? SHAAM_AUTH_PENDING,
        blocking ? `awaiting_${blocking}_auth` : 'awaiting_shaam_auth',
      );
    }

    return { result: { ready: outcome === 'full', outcome, progress, system: 'shaam' } };
  } finally {
    await detach(conn.browser);
  }
}

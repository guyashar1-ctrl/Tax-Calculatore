// shaamEnsureCapability.mjs — שחזור נקודתי של capability בודדת בזמן פעולה
// עסקית (למשל: קריאת שאילתה 134 נתקלת ב-GMF שפג, ומבקשת "הכן מחדש רק GMF").
//
// ‼ פרק 16 §16.1: "במשך היום משחזרים רק את capability הפעולה ואת תלויותיה
// המוכחות... אינו מפעיל מחדש warm-up מלא." זו הסיבה שזה handler נפרד
// מ-shaam.connect ולא רק קריאה לו עם רשימה קצרה יותר — מבחינת ה-UI/ה-job
// queue זו כוונה שונה (recover, לא warm-up), אבל שתיהן קוראות בדיוק לאותו
// runCapabilities ב-warmupManager.mjs. זה כל הרעיון של "אותו מנגנון ensure".
import { attach, detach, classifyShaamAuth, probeServerSession, focusShaamWindow } from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { runCapabilities, HUMAN_MESSAGE } from '../warmupManager.mjs';

export const actionType = 'shaam.ensure_capability';

const SHAAM_AUTH_PENDING =
  'חלון שע״ם פתוח וממתין לך. יש להשלים בו בחירת אישור דיגיטלי והזנת PIN — ' +
  'ואז אמשיך אוטומטית, בלי צורך ללחוץ שוב.';

const MISSING_CAPABILITY = 'לא צוינה יכולת לשחזור (capability חסר בקלט).';

const BOOTSTRAP_REQUIRED =
  'זהו חיבור חדש לשע״ם: קודם התחברו מהכותרת (כרטיס+PIN, וכניסה למערכת גביית מס הכנסה). ' +
  'אחרי שהחיבור ירוק, אמשיך למערכת הזו לבד.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx, input = {}) {
  const capability = input.capability;
  if (!capability) throw new PermanentError(MISSING_CAPABILITY, 'missing_capability');

  const conn = await attach();
  // ‼ בניגוד ל-shaam.connect: אין כאן launchDedicatedChrome. אם החלון סגור,
  // אין בסיס לשחזור נקודתי — האימות הבסיסי עצמו חסר, וזה תפקיד warm-up
  // מלא, לא ensure ממוקד. מבקשים מהרו"ח להתחיל מ"התחבר לשע״ם".
  if (!conn.ok) {
    ctx.log('לא ניתן להתחבר לחלון:', conn.reason);
    throw new NeedsHumanError(SHAAM_AUTH_PENDING, 'awaiting_shaam_auth');
  }

  try {
    // ‼ בדיקה מקומית (כותרת) יכולה רק להעלות ל"מאומת" — ראה ההערה המפורטת
    // ב-shaamConnect.mjs. probeServerSession הוא ה-fallback כשהיא שוללת,
    // לא אישור נוסף כשהיא כבר מאשרת.
    const local = await classifyShaamAuth(conn.page);
    let authenticated = local.authenticated;
    if (!authenticated) {
      const session = await probeServerSession(conn.page);
      authenticated = session.authenticated;
    }
    if (!authenticated) {
      ctx.log('אימות בסיסי חסר — לא ניתן לשחזר capability בלעדיו');
      await focusShaamWindow(conn.page);
      throw new NeedsHumanError(SHAAM_AUTH_PENDING, 'awaiting_shaam_auth');
    }

    const { progress } = await runCapabilities(ctx, conn.page, [capability]);
    const evidence = progress?.capabilities?.[capability];

    if (evidence?.state === 'ready') {
      return { result: { ready: true, capability, evidence } };
    }
    if (evidence?.state === 'human_required') {
      // ‼ שער מחזור-החיים: מחזור חדש שטרם הקים GMF. ממתינים ל-GMF (לא
      // ליכולת עצמה) — כך report_worker_status מחדש את ה-job ברגע ש-GMF
      // מאומתת, ואז האישור האוטומטי של היכולת מותר.
      if (evidence.reasonCode === 'bootstrap_required') {
        throw new NeedsHumanError(BOOTSTRAP_REQUIRED, 'awaiting_gmf_auth');
      }
      throw new NeedsHumanError(
        HUMAN_MESSAGE[capability] ?? SHAAM_AUTH_PENDING,
        `awaiting_${capability}_auth`,
      );
    }
    throw new PermanentError(
      `שחזור ${capability} לא הצליח (${evidence?.reasonCode ?? 'unknown'}).`,
      'ensure_capability_unavailable',
    );
  } finally {
    await detach(conn.browser);
  }
}

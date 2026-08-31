// shaamDetect.mjs — primitive #1: "מצא את שע״ם". Attach to the dedicated
// SHAAM Chrome window (launch-shaam-chrome.bat), confirm the SHAAM domain
// responds, detach. Does NOT judge authentication — that is
// shaamCheckAuth.mjs's job. Never launches, closes, or logs into a browser.
import { attach, detach, detectShaam } from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.detect';

const ATTACH_MESSAGES = {
  not_running:
    'חלון Chrome הייעודי לשע״ם אינו פתוח. הריצו פעם אחת את worker/launch-shaam-chrome.bat ' +
    '(לחיצה כפולה) והשאירו אותו פתוח, ואז לחצו שוב על הבדיקה כאן.',
  blocked:
    'חלון Chrome הייעודי פתוח אך ממתין לאישור שלכם — כנראה דיאלוג בחירת אישור דיגיטלי או ' +
    'בקשת PIN. השלימו אותו בחלון, ואז לחצו שוב על הבדיקה כאן.',
  no_context: 'חלון Chrome הייעודי פתוח אך אין בו אף לשונית. פתחו לשונית כלשהי ונסו שוב.',
};

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  ctx.log('שלב 1: מתחבר לחלון Chrome הייעודי ובודק אם שע״ם מגיב');
  const conn = await attach();
  if (!conn.ok) {
    ctx.log('חיבור נכשל:', conn.reason, conn.detail);
    throw new NeedsHumanError(
      ATTACH_MESSAGES[conn.reason] ?? ATTACH_MESSAGES.not_running,
      `chrome_${conn.reason ?? 'not_running'}`,
    );
  }
  try {
    const probe = await detectShaam(conn.page);
    ctx.log('תוצאת בדיקה:', probe);
    if (!probe.reachable) {
      // כשל רשת אמיתי — לא דיאלוג שממתין ללחיצה, ולכן אין פעולה אנושית
      // חד-פעמית שתפתור אותו. תקלת תשתית ⇒ failed, לא needs_human.
      throw new PermanentError(
        `שע״ם לא מגיב מחלון Chrome הייעודי: ${probe.detail}. בדקו חיבור אינטרנט ושהחלון עדיין פתוח.`,
        'shaam_unreachable',
      );
    }
    return {
      result: {
        found: true,
        browserConnected: true,
        shaamDetected: true,
        detail: probe.detail,
      },
    };
  } finally {
    // ‼ תמיד מתנתקים, גם בכישלון — אבל אף פעם לא סוגרים את Chrome עצמו.
    await detach(conn.browser);
  }
}

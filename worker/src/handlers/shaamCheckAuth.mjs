// shaamCheckAuth.mjs — primitive #2: "בדוק התחברות לשע״ם". Deterministic
// authenticated/not-authenticated classification against the dedicated SHAAM
// Chrome window. Not authenticated ⇒ needs_human with a clear Hebrew message.
// Never touches certificate selection, PIN, OTP, or any native auth dialog.
import { attach, detach, classifyShaamAuth } from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.check_auth';

const ATTACH_MESSAGES = {
  not_running:
    'חלון Chrome הייעודי לשע״ם אינו פתוח. הריצו פעם אחת את worker/launch-shaam-chrome.bat ' +
    '(לחיצה כפולה) והשאירו אותו פתוח, ואז לחצו שוב על הבדיקה כאן.',
  blocked:
    'חלון Chrome הייעודי פתוח וממתין לאישור שלכם — דיאלוג בחירת אישור דיגיטלי או בקשת PIN. ' +
    'השלימו אותו בחלון, ואז לחצו שוב על הבדיקה כאן.',
  no_context: 'חלון Chrome הייעודי פתוח אך אין בו אף לשונית. פתחו לשונית כלשהי ונסו שוב.',
};

const NEEDS_HUMAN_MESSAGES = {
  auth_required:
    'יש להתחבר ידנית לשע״ם בחלון Chrome הייעודי: לבחור את האישור הדיגיטלי ולהזין את קוד ה-PIN ' +
    'של הכרטיס החכם, ואז ללחוץ שוב על הבדיקה כאן.',
  card_not_recognized:
    'הכרטיס החכם לא זוהה בחלון Chrome הייעודי. נסו לנתק ולחבר מחדש את הכרטיס, ואז להריץ שוב.',
  unknown:
    'שע״ם החזיר מסך לא מזוהה. יש לבדוק ידנית בחלון Chrome הייעודי מה מוצג שם.',
};

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  ctx.log('שלב 2: בודק מצב התחברות לשע״ם');
  const conn = await attach();
  if (!conn.ok) {
    ctx.log('חיבור נכשל:', conn.reason, conn.detail);
    throw new NeedsHumanError(
      ATTACH_MESSAGES[conn.reason] ?? ATTACH_MESSAGES.not_running,
      `chrome_${conn.reason ?? 'not_running'}`,
    );
  }
  try {
    const auth = await classifyShaamAuth(conn.page);
    ctx.log('תוצאת בדיקה:', auth);

    if (auth.authenticated) return { result: { authenticated: true } };

    if (auth.state === 'unreachable') {
      throw new PermanentError(`שע״ם לא נגיש: ${auth.detail}`, 'shaam_unreachable');
    }
    throw new NeedsHumanError(NEEDS_HUMAN_MESSAGES[auth.state] ?? NEEDS_HUMAN_MESSAGES.unknown, auth.state);
  } finally {
    await detach(conn.browser);
  }
}

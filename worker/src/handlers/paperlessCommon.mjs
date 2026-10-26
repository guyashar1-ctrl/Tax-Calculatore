// paperlessCommon.mjs — חיבור לחלון הפייפרלס, משותף להקמה ולבדיקת הכרטיס.
import {
  attachPaperless, detachPaperless, launchDedicatedPaperlessChrome, pickPaperlessPage,
  classifyPaperlessUrl, focusPaperlessWindow, readParams,
} from '../paperlessSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const PAPERLESS_AUTH_PENDING =
  'חלון הפייפרלס במחשב המשרד אינו מחובר. התחברו בו (מייל וקוד לנייד) — ' +
  'ההקמה תמשיך לבד מיד אחרי ההתחברות.';

/** מתחבר לחלון; סגור ⇒ פותח על מסך הכניסה; לא מחובר ⇒ ממתין לרו"ח. */
export async function connectPaperless(ctx) {
  let conn = await attachPaperless();
  if (!conn.ok && conn.reason === 'not_running') {
    ctx.log('חלון הפייפרלס סגור — פותח חלון Chrome ייעודי על מסך הכניסה');
    const launched = launchDedicatedPaperlessChrome();
    if (!launched.ok) throw new PermanentError('לא נמצאה התקנה של Google Chrome במחשב הזה.', launched.reason);
    await new Promise((r) => setTimeout(r, 4000));
    conn = await attachPaperless();
  }
  if (!conn.ok) throw new NeedsHumanError(PAPERLESS_AUTH_PENDING, 'awaiting_paperless_auth');
  const page = await pickPaperlessPage(conn.context);
  if (!classifyPaperlessUrl(page.url()).connected) {
    await focusPaperlessWindow(page);
    await detachPaperless(conn.browser);
    throw new NeedsHumanError(PAPERLESS_AUTH_PENDING, 'awaiting_paperless_auth');
  }
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  let params;
  try {
    params = await readParams(page);
  } catch (e) {
    await detachPaperless(conn.browser);
    if (e?.code === 'paperless_unauthorized' || !classifyPaperlessUrl(page.url()).connected) {
      throw new NeedsHumanError(PAPERLESS_AUTH_PENDING, 'awaiting_paperless_auth');
    }
    throw e;
  }
  return { browser: conn.browser, page, params };
}

/**
 * תרגום כשל באמצע לשגיאה שהמשרד מבין. ‼ 401 באמצע = הכניסה פגה (והאפליקציה
 * ניתקה) — ממתין לרו"ח, לא «נכשל».
 */
export function translatePaperlessError(e, page, stage) {
  if (e instanceof NeedsHumanError || e instanceof PermanentError) return e;
  if (e?.code === 'paperless_unauthorized' || (page && !classifyPaperlessUrl(page.url()).connected)) {
    return new NeedsHumanError(PAPERLESS_AUTH_PENDING, 'awaiting_paperless_auth');
  }
  const detail = String(e?.message ?? e).split('\n')[0].slice(0, 160);
  return new PermanentError(`הפעולה בפייפרלס נעצרה בשלב «${stage.label}»: ${detail}`, `paperless_${stage.key}`);
}

// paperlessConnect.mjs — «פייפרלס» בכותרת (306): פותח את החלון הייעודי על מסך הכניסה,
// ומחכה שהרו"ח יתחבר בו (מייל + קוד לנייד). העובד לא מקליד כלום.
// ‼ ממתין לאדם ⇒ awaiting_paperless_auth; report_worker_status מחדש את המשימה ברגע שהנורית
// ירוקה, והריצה החוזרת רואה מחובר ומסתיימת.
import {
  attachPaperless, detachPaperless, launchDedicatedPaperlessChrome, pickPaperlessPage,
  classifyPaperlessUrl, focusPaperlessWindow,
} from '../paperlessSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'paperless.connect';

const PAPERLESS_LOGIN_PENDING =
  'חלון הפייפרלס פתוח במחשב המשרד וממתין לך. מתחברים בו עם המייל והקוד שנשלח לנייד — ' +
  'והנורית תידלק בירוק לבד, בלי ללחוץ שוב.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  let conn = await attachPaperless();
  if (!conn.ok && conn.reason === 'not_running') {
    ctx.log('חלון הפייפרלס סגור — פותח חלון Chrome ייעודי על מסך הכניסה');
    const launched = launchDedicatedPaperlessChrome();
    if (!launched.ok) throw new PermanentError('לא נמצאה התקנה של Google Chrome במחשב הזה.', launched.reason);
    await new Promise((r) => setTimeout(r, 4000));
    conn = await attachPaperless();
  }
  if (!conn.ok) throw new NeedsHumanError(PAPERLESS_LOGIN_PENDING, 'awaiting_paperless_auth');
  try {
    const page = await pickPaperlessPage(conn.context);
    await focusPaperlessWindow(page);
    if (!classifyPaperlessUrl(page.url()).connected) {
      throw new NeedsHumanError(PAPERLESS_LOGIN_PENDING, 'awaiting_paperless_auth');
    }
    return { result: { ready: true, system: 'paperless', paperless: true } };
  } finally {
    await detachPaperless(conn.browser);
  }
}

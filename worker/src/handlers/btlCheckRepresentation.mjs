// btlCheckRepresentation.mjs — "בדוק קבלת הייצוג" (פרק 17).
// מיוצגים → ייפוי כוח → מעקב ייפוי כוח, לפי אסמכתא + ת.ז. — לעולם לא
// "השורה הראשונה".
//
// ‼ קריאה בלבד. שום דבר כאן לא כותב ל-PIVO — התוצאה חוזרת ל-`result`, וטריגר
// בשרת (187, `sync_btl_representation_from_job`) הוא זה שמעדכן את
// `representation_requests.execution` כשהסטטוס 'approved'. ראה כלל התשתית
// §9: "היטל אינו מקור אמת" — worker לא מכריע ייצוג פעיל, הוא רק מדווח מה
// ראה במסך, ופונקציה בשרת מתרגמת את זה למצב עסקי.
//
// ‼ סטטוס לא מוכר: לא מנחשים. חוזרים עם status:'unknown' ו-rawStatus לאבחון.
// ‼ לא נמצאה שורה תואמת: status:'not_found' — לא כישלון-משימה, זו תשובה
// אמיתית שיכולה לקרות (למשל אם המועד עבר וביטוח לאומי מחק את הרישום).
import {
  attachBtl, detachBtl, classifyBtlAuth, probeBtlSession, pickBtlPage, focusBtlWindow,
  launchDedicatedBtlChrome,
  openPoaTrackingScreen, findPoaTrackingRow,
} from '../btlSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'btl.check_representation';

const BTL_AUTH_PENDING =
  'חלון «מערכת ייצוג לקוחות» של ביטוח לאומי סגור או שאינו מחובר. יש לפתוח ' +
  'אותו ולהתחבר (לחצו "ביטוח לאומי" בכותרת), ואז להריץ שוב.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx, input) {
  const role = input?.role;
  const idNumber = String(input?.idNumber ?? '').replace(/\D/g, '');
  const referenceNumber = String(input?.referenceNumber ?? '').trim();
  if (role !== 'client' && role !== 'spouse') {
    throw new PermanentError('לא נמסר תפקיד תקין (client/spouse) לפעולה הזו.', 'bad_subject_role');
  }
  if (!idNumber) throw new PermanentError('אין תעודת זהות תקינה לאדם הזה בכרטיס.', 'missing_id_number');
  if (!referenceNumber) {
    throw new PermanentError('אין קוד אסמכתא שמור לאדם הזה — אין מה לבדוק. יש להזין ייפוי כוח קודם.', 'missing_reference');
  }

  let conn = await attachBtl();
  if (!conn.ok && conn.reason === 'not_running') {
    ctx.log('חלון ביטוח לאומי סגור — פותח חלון Chrome ייעודי על מסך הכניסה');
    const launched = launchDedicatedBtlChrome();
    if (!launched.ok) throw new PermanentError('לא נמצאה התקנה של Google Chrome במחשב הזה.', launched.reason);
    await new Promise((r) => setTimeout(r, 4000));
    conn = await attachBtl();
  }
  if (!conn.ok) throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');

  try {
    const page = await pickBtlPage(conn.context, conn.page);
    const local = await classifyBtlAuth(page);
    if (!local.connected) {
      await focusBtlWindow(page);
      throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');
    }
    const session = await probeBtlSession(page);
    if (session.ok && !session.connected) {
      await focusBtlWindow(page);
      throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');
    }

    ctx.log(`פותח מסך "מעקב ייפוי כוח" · מחפש אסמכתא ${referenceNumber} · ת.ז. ${idNumber}`);
    const tracking = await openPoaTrackingScreen(page);
    if (!tracking.ok) {
      throw new PermanentError(
        `פתיחת מסך מעקב ייפוי כוח נכשלה (${tracking.reason ?? 'unknown'})` +
        (tracking.failedAt ? ` — לא נמצא "${tracking.failedAt}" בתפריט` : '') +
        '. ייתכן שהמסך השתנה או שהניווט טרם אומת מול האתר האמיתי.',
        `tracking_nav_${tracking.reason ?? 'failed'}`,
      );
    }
    const row = await findPoaTrackingRow(page, { referenceNumber, idNumber });

    if (row?.reason === 'ambiguous_match') {
      throw new PermanentError(
        `נמצאו כמה שורות עם אותה אסמכתא (${referenceNumber}) במסך המעקב — לא מכריע סטטוס בלי בירור ידני.`,
        'ambiguous_reference',
      );
    }
    if (!row?.found) {
      ctx.log(`לא נמצאה שורה תואמת במסך המעקב (${row?.reason ?? 'unknown'})`);
      return { result: { role, referenceNumber, status: 'not_found' } };
    }

    if (row.idNumber && row.idNumber !== idNumber) {
      // ‼ נמצאה שורה עם אותה אסמכתא אבל ת.ז. אחרת — אי-התאמה, לא מדווחים
      // "אושר" על סמך זה. ראה דרישת המשימה: "ID/reference mismatch".
      throw new PermanentError(
        `נמצאה שורה עם אסמכתא ${referenceNumber} אבל ת.ז. שונה מהצפוי — לא מדווח סטטוס עד שזה מתברר.`,
        'reference_id_mismatch',
      );
    }

    ctx.log(`סטטוס במסך המעקב: ${row.rawStatus ?? '—'}`);
    if (row.rawStatus === 'ממתין לאישור') {
      return { result: { role, referenceNumber, status: 'pending', rawStatus: row.rawStatus, deadline: row.deadline ?? null } };
    }
    if (row.rawStatus === 'מאושר') {
      return { result: { role, referenceNumber, status: 'approved', rawStatus: row.rawStatus } };
    }
    return { result: { role, referenceNumber, status: 'unknown', rawStatus: row.rawStatus ?? null } };
  } finally {
    await detachBtl(conn.browser);
  }
}

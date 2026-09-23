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
//
// ‼ התוצאה היא **תמיד** קריאה מלאה של השורה — status קנוני
// ('approved'|'pending'|'expired'|'cancelled'|'unknown'|'not_found'),
// rawStatus גולמי, אסמכתא, מועד אחרון ות.ז. כפי שהופיעו. עד 23.09.2026
// מסלול ה-'approved' החזיר רק סטטוס וזרק את המועד; זה נראה מיותר עד
// שהתברר שהוא בדיוק מה שהרו"ח מחפש כשהוא מיישב רישום שנוצר ידנית בפורטל.
import {
  attachBtl, detachBtl, classifyBtlAuth, probeBtlSession, pickBtlPage, focusBtlWindow,
  launchDedicatedBtlChrome,
  openPoaTrackingScreen, findPoaTrackingRow, sameIdNumber,
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
        // ‼ אותו תיקון כמו ב-btlCreateRepresentation (23.09.2026): הניווט
        // כבר מנסה לעבור בעצמו ל«מערכת ייצוג לקוחות», ולכן ההודעה מפנה
        // למה שבאמת נשאר לבדוק במקום להאשים את הקוד.
        'פתיחת מסך "מעקב ייפוי כוח" נכשלה' +
        (tracking.failedAt ? ` — לא נמצא "${tracking.failedAt}" בתפריט` : '') +
        '. ' + (tracking.recoveryAttempted
          ? 'פתחתי את «מערכת ייצוג לקוחות» מחדש וגם אז לא נמצא התפריט. בדקו שחלון ביטוח לאומי עדיין מחובר (ייתכן שהסשן פג).'
          : 'בדקו שחלון ביטוח לאומי פתוח ומחובר.'),
        `tracking_nav_${tracking.reason ?? 'nav_failed'}`,
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
      return { result: { role, referenceNumber, found: false, status: 'not_found', reason: row?.reason ?? 'unknown' } };
    }

    if (row.idNumber && !sameIdNumber(row.idNumber, idNumber)) {
      // ‼ נמצאה שורה עם אותה אסמכתא אבל ת.ז. אחרת — אי-התאמה, לא מדווחים
      // "אושר" על סמך זה. ראה דרישת המשימה: "ID/reference mismatch".
      // ‼ ההשוואה בלי אפסים מובילים — ביטוח לאומי משמיט אפס מוביל בת.ז.
      throw new PermanentError(
        `נמצאה שורה עם אסמכתא ${referenceNumber} אבל ת.ז. שונה מהצפוי — לא מדווח סטטוס עד שזה מתברר.`,
        'reference_id_mismatch',
      );
    }

    // ‼ הסיווג נעשה ב-selectTrackingRow (btlTracking.mjs) ולא כאן, ולא
    // בהשוואת מחרוזות מקומית: תו כיווניות אחד או רווח קשיח בעמודת הסטטוס
    // הפילו השוואה ישירה, ונפילה כזו הייתה יוצאת כ-'unknown' בשקט. ‼ מה
    // שאסור: 'unknown' לעולם אינו מתגלגל ל-'approved' — לא כאן ולא בשרת.
    ctx.log(`סטטוס במסך המעקב: ${row.rawStatus ?? '—'} ⇒ ${row.status}`);
    return {
      result: {
        role,
        referenceNumber: row.referenceNumber ?? referenceNumber,
        found: true,
        status: row.status,
        rawStatus: row.rawStatus ?? null,
        // ‼ גם באישור: המועד והאסמכתא הם עובדות חיצוניות שה-CRM צריך גם
        // כשהוא כבר יודע שאושר. עד 23.09.2026 הם נזרקו במסלול 'approved'.
        deadline: row.deadline ?? null,
        idNumber: row.idNumber ?? null,
        candidates: row.candidates ?? 1,
      },
    };
  } finally {
    await detachBtl(conn.browser);
  }
}

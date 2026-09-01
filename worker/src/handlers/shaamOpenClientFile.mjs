// shaamOpenClientFile.mjs — «פתח פרטי תיק»: פותח את שאילתה 181 («פרטי תיק»)
// במערכת גביית מס הכנסה, עבור הלקוח שממנו נלחץ הכפתור.
//
// ‼ הפעולה **אינה** מנהלת התחברות ואינה מנחשת מזהים:
//   · הכנת שכבות האימות שייכת לזרימת החיבור שבכותרת (shaam.connect).
//   · מספר התיק מגיע מ-PIVO ב-input. העובד לא קורא את טבלת הלקוחות ולא
//     גוזר ת.ז. בעצמו — מה שהוזמן הוא מה שנפתח.
//
// ‼ עדיין לא מחלצת שום נתון מקצועי מהמסך. היא פותחת ומאמתת שנפתח התיק
// הנכון, וזהו.
import {
  attach, detach, probeServerSession, openClientFileDetails, verifyFileDetailsFor,
} from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.open_client_file';

const NOT_READY =
  'החיבור לשע״ם אינו מוכן. לחצו על "שע״ם" בכותרת והשלימו את החיבור, ואז הריצו שוב.';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx, input) {
  const fileNumber = String(input?.fileNumber ?? '').replace(/\D/g, '');
  if (!fileNumber) {
    throw new PermanentError(
      'לא נמסר מספר תיק במס הכנסה ללקוח הזה. יש להשלים אותו בתיק המס ואז לנסות שוב.',
      'missing_file_number',
    );
  }

  const conn = await attach();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');

  try {
    const session = await probeServerSession(conn.page);
    if (!session.authenticated) throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');

    ctx.log(`פותח «פרטי תיק» (שאילתה 181) · ${fileNumber.length} ספרות`);
    const opened = await openClientFileDetails(conn.page, fileNumber);
    if (!opened.ok) {
      if (opened.reason === 'gmf_not_ready') {
        throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
      }
      // ‼ חומת אימות (למשל «פג תוקף האימות» שדורשת קוד חד-פעמי) אינה תקלה
      // ואינה משהו שהאוטומציה מטפלת בו. עוצרים ומחזירים את ההכרעה לאדם.
      if (opened.reason === 'blocked_by_modal' || opened.reason === 'submit_click_blocked') {
        throw new NeedsHumanError(
          `מסך מס הכנסה חסום בחלונית של שע״ם${opened.modalTitle ? ` («${opened.modalTitle}»)` : ''}. ` +
          'יש לפתוח את חלון Chrome הייעודי, לטפל בחלונית ידנית, ואז להריץ שוב. ' +
          'האוטומציה לא נוגעת בחלונית אימות.',
          'shaam_auth_wall',
        );
      }
      throw new PermanentError(
        `לא הצלחתי לפתוח את מסך פרטי התיק (${opened.reason}).`,
        opened.reason,
      );
    }

    ctx.log(`נחת ב: ${opened.pathname} · לשונית חדשה: ${opened.usedNewTab} · דפים: ${opened.pageCountBefore}→${opened.pageCountAfter}`);

    // ‼ "נפתח מסך" אינו הצלחה. חייבים לוודא שזה התיק שביקשנו — ועל הדף
    // שבאמת נפתח, שאינו בהכרח זה שממנו לחצנו.
    const check = await verifyFileDetailsFor(opened.page, fileNumber);
    ctx.log('אימות מסך:', check);
    if (check.hasPasswordField) throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
    if (!check.matchesRequestedFile || !check.hasContent) {
      throw new PermanentError(
        'המסך שנפתח אינו תואם את מספר התיק שנשלח — לא מדווח הצלחה.',
        'file_mismatch',
      );
    }

    return {
      result: {
        opened: true,
        system: 'shaam',
        area: 'income_tax_file_details',
        query: '181',
        path: opened.pathname,
      },
    };
  } finally {
    await detach(conn.browser);
  }
}

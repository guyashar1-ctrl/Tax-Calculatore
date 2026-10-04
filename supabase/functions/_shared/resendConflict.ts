// ═══════════════════════════════════════════════════════════════════════════
//  409 מספק הדואר על מפתח אידמפוטנטיות — מה הוא אומר ומה עושים — טהור.
// ═══════════════════════════════════════════════════════════════════════════
//  Resend מחזיר 409 בשני מצבים שונים מאוד:
//    concurrent_idempotent_requests — בקשה אחרת עם אותו מפתח עדיין בתנועה.
//      עוד לא ידוע אם היא תצליח ⇒ לא מסמנים «נשלח»; ניסיון חוזר באותו מפתח
//      יקבל את התשובה של המקורית.
//    invalid_idempotent_request — המפתח כבר שימש עם גוף אחר ⇒ ניסיון קודם
//      הגיע לספק, ושליחה נוספת באותו מפתח לא תצא.
//  בלי Deno ובלי DOM: הפונקציות בשרת מייבאות מכאן, ובדיקות היחידה בודקות אותו.
// ═══════════════════════════════════════════════════════════════════════════

export type ResendConflict = 'concurrent' | 'key_reused' | 'other';

export function resendConflictKind(body: unknown): ResendConflict {
  const name = String((body as { name?: unknown } | null)?.name ?? '');
  if (name === 'concurrent_idempotent_requests') return 'concurrent';
  if (name === 'invalid_idempotent_request') return 'key_reused';
  return 'other';
}

/**
 * התראה למשרד (notify-accountant) שקיבלה 409:
 *   retry_later         — לא מסמנים sent_at; הדופק הבא שולח שוב באותו מפתח.
 *   sent_record_journal — ניסיון קודם יצא: רושמים שורה ביומן המיילים ואז sent_at.
 * ‼ 409 שאינו מוכר — כמו «בתנועה»: אותו מפתח לא ישלח מייל שני, ואחרי שלושה
 * ניסיונות ההתראה מופיעה במסך כהתראה שלא יצאה.
 */
export type AcctOn409 = 'retry_later' | 'sent_record_journal';

export function acctNotificationOn409(body: unknown): AcctOn409 {
  return resendConflictKind(body) === 'key_reused' ? 'sent_record_journal' : 'retry_later';
}

/** הטקסט למסך כשמייל ללקוח קיבל 409. ‼ בלי טקסט הספק (באנגלית) — הוא רק לקונסול. */
export function inFlightMessage(body: unknown): string {
  return resendConflictKind(body) === 'concurrent'
    ? 'המייל הזה נשלח ממש עכשיו מחלון אחר — רעננו בעוד רגע.'
    : 'ייתכן שהמייל הזה כבר יצא בניסיון קודם, ולכן הוא לא נשלח שוב. כדאי לוודא עם הלקוח שקיבל אותו.';
}

// ─── שומר יציאה · שינויים שלא נשמרו ─────────────────────────────────────────
// מסך שמחזיק טיוטה רושם כאן שומר. App שואל אותו לפני כל מעבר מסך (וגם
// ב"אחורה" של הדפדפן). השומר מחליט: מותר לעבור מיד, או שהוא מציג חלון
// "יש שינויים שלא נשמרו" ומפעיל את המעבר רק אחרי שהמשתמש בחר.
//
// ‼ מודול ולא Context: App קורא ל-setView בעשרות מקומות, וכולם צריכים לעבור
// דרך אותה בדיקה. שומר אחד בכל רגע — רק מסך אחד פתוח.

/** מחזיר true אם מותר לעבור עכשיו. false = השומר לקח אחריות ויקרא ל-proceed בעצמו. */
export type LeaveGuard = (proceed: () => void) => boolean;

let current: LeaveGuard | null = null;

export function setLeaveGuard(guard: LeaveGuard | null): void {
  current = guard;
}

/** מבקש לעזוב את המסך הנוכחי. מחזיר true אם המעבר בוצע מיד. */
export function requestLeave(proceed: () => void): boolean {
  if (!current || current(proceed)) {
    proceed();
    return true;
  }
  return false;
}

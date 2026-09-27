// btlLoginWatch.mjs — כמה מהר מזהים שהרו"ח סיים להתחבר לביטוח לאומי.
//
// ‼ למה (27.09.2026, מהיומן של guy-office-pc): הבדיקה עצמה ב«מעקב ייפוי
// כוח» לוקחת 5 שניות, אבל מהרגע שהרו"ח סיים להתחבר ועד שהיא התחילה עברו עד
// 40 שניות: הסבב הרגיל בודק את החלון פעם ב-30 שניות, ואחריו הלולאה ישנה 5
// שניות לפני שהיא תופסת את המשימה שהמסך שלח.
//
// הכלל: מהרגע שחלון ב״ל פתוח ולא מחובר — «ממתינים להתחברות», ומציצים בו כל
// 2 שניות. ברגע שזוהה חיבור — עוד חצי דקה של לולאה צפופה, כדי שהמשימה
// שהמסך שולח תיתפס תוך שניות.
//
// ‼ ההמתנה מוגבלת ל-10 דקות מהרגע שהחלון נראה מנותק. חלון שנשכח על מסך
// הכניסה חוזר לקצב הרגיל, ולא מוחזק בדגימה צפופה כל היום.
//
// ‼ טהור ובלי Chrome, כדי שייבדק ב-node (worker/test/btl-login-watch.test.mjs).

export const BTL_LOGIN_WATCH_MS = 10 * 60_000;
export const BTL_LOGIN_PEEK_MS = 2_000;
export const FAST_LOOP_AFTER_LOGIN_MS = 30_000;
export const FAST_LOOP_MS = 2_000;

/** מצב התחלתי: לא ממתינים להתחברות, אין לולאה צפופה. */
export function initialBtlWatch() {
  return { since: 0, lastPeek: 0, fastUntil: 0 };
}

/**
 * אחרי בדיקה מלאה של החלון (הסבב הרגיל). `wasConnected` — מה שדווח לפני
 * הבדיקה הזו, כדי לזהות מעבר למחובר.
 */
export function afterBtlCheck(w, now, { connected, windowOpen, wasConnected }) {
  const fastUntil = connected && !wasConnected ? now + FAST_LOOP_AFTER_LOGIN_MS : w.fastUntil;
  if (connected || !windowOpen) return { ...w, since: 0, fastUntil };
  return { ...w, since: w.since || now, fastUntil };
}

/** ממתינים עכשיו להתחברות (חלון פתוח, לא מחובר, פחות מ-10 דקות). */
export function watchingBtlLogin(w, now) {
  return w.since > 0 && now - w.since < BTL_LOGIN_WATCH_MS;
}

/** הגיע הזמן להציץ שוב בחלון, בין שני סבבים רגילים. */
export function btlPeekDue(w, now) {
  return watchingBtlLogin(w, now) && now - w.lastPeek >= BTL_LOGIN_PEEK_MS;
}

/**
 * תוצאת ההצצה. `windowOpen: false` = החלון נסגר ⇒ מפסיקים להמתין.
 * חיבור ⇒ מפסיקים להמתין ופותחים חצי דקה של לולאה צפופה.
 */
export function afterBtlPeek(w, now, { connected, windowOpen }) {
  if (connected) return { since: 0, lastPeek: now, fastUntil: now + FAST_LOOP_AFTER_LOGIN_MS };
  if (!windowOpen) return { ...w, since: 0, lastPeek: now };
  return { ...w, lastPeek: now };
}

/** כמה הלולאה הראשית ישנה כשאין משימה. */
export function loopSleepMs(w, now, pollMs) {
  return watchingBtlLogin(w, now) || now < w.fastUntil ? Math.min(FAST_LOOP_MS, pollMs) : pollMs;
}

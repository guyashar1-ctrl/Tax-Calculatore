// shaamAuthState.mjs — מודל המצב המפורש להתחברות לשע״ם, לפי החלטת מוצר
// מאושרת: התחברות ראשית פעם אחת → הכנת אמצעי המשנה פעם אחת → מוכן →
// תת-מערכות נפתחות לבד רק כשעבודה אמיתית צריכה אותן.
//
// ‼ למה קובץ נפרד ולא עוד `if` בתוך connectionMonitor.mjs: המצב הזה נבדק
// גם בלי דפדפן (פונקציות טהורות, קלט = מה שכבר נקרא מה-DOM), וגם משמש
// יותר ממקום אחד — הכפתור/הודעת המסך צריכים את אותה הכרעה בדיוק.
//
// ‼ עקרון-העל (חובה 6): **לא מסווגים לפי URL בלבד.** hash/pathname הם
// רמז, לא ראיה. הראיה היא צורת ה-DOM: יש שדה סיסמה? יש לו ערך? יש
// חלונית שדורשת אדם? יש בדיוק כפתור אישור אחד חד-משמעי?

/** @enum {string} */
export const AUTH_STATE = Object.freeze({
  /** ההתחברות הראשית (כרטיס חכם/PIN) עצמה דורשת אדם. */
  MAIN_HUMAN_AUTH_REQUIRED: 'MAIN_HUMAN_AUTH_REQUIRED',
  /** סשן הפורטל הראשי חי — אין צורך בפעולת אדם. */
  MAIN_SESSION_AVAILABLE: 'MAIN_SESSION_AVAILABLE',
  /** הראשי הצליח, אבל אמצעי המשנה לא הוכן במחזור החיים הנוכחי. */
  SECONDARY_CREDENTIAL_SETUP_REQUIRED: 'SECONDARY_CREDENTIAL_SETUP_REQUIRED',
  /** מסך כניסה של תת-מערכת, עם ראיית DOM חד-משמעית שהערך כבר מולא. */
  SAVED_CREDENTIAL_CONTINUATION: 'SAVED_CREDENTIAL_CONTINUATION',
  /** כבר בתוך תת-המערכת המבוקשת. */
  SUBSYSTEM_READY: 'SUBSYSTEM_READY',
  /** דחייה/כרטיס/חסימה/מצב אבטחה — לעצור, לא לנסות שוב. */
  AUTH_REJECTED_OR_SECURITY_BLOCK: 'AUTH_REJECTED_OR_SECURITY_BLOCK',
  /** לא ניתן לסווג בביטחון — לא לוחצים כלום. */
  UNKNOWN_AUTH_STATE: 'UNKNOWN_AUTH_STATE',
});

/**
 * המצב הראשי (פורטל שע״ם). קלט: מה ש-`classifyShaamAuth` כבר מחזיר
 * (browserSession.mjs) — אין כאן קריאת DOM חדשה, רק תרגום למודל האחיד.
 */
export function mainAuthState(local) {
  if (!local) return AUTH_STATE.UNKNOWN_AUTH_STATE;
  if (local.authenticated) return AUTH_STATE.MAIN_SESSION_AVAILABLE;
  if (local.state === 'card_not_recognized') return AUTH_STATE.AUTH_REJECTED_OR_SECURITY_BLOCK;
  if (local.state === 'auth_required') return AUTH_STATE.MAIN_HUMAN_AUTH_REQUIRED;
  if (local.state === 'unreachable') return AUTH_STATE.MAIN_HUMAN_AUTH_REQUIRED;
  return AUTH_STATE.UNKNOWN_AUTH_STATE;
}

/**
 * מצב מסך הכניסה/המשך של **תת-מערכת** (GMF, מערכת הייצוג, וכו').
 *
 * ‼ קלט אחיד, מנורמל — כל תת-מערכת קוראת את ה-DOM שלה בעצמה (הצורה שונה
 * בפועל: GMF משתמש ב-`#pass`, מערכת הייצוג ב-`input[type=password]`
 * כללי) ומעבירה לכאן רק עובדות בוליאניות. ‼ לעולם לא value של סיסמה —
 * רק "יש ערך?".
 *
 * @param {{
 *   onLoginScreen: boolean,        // המסך שזוהה הוא מסך כניסה/המשך של התת-מערכת
 *   blockingSignal?: boolean,      // חסימה/יותר מדי ניסיונות/הגבלה זמנית
 *   humanOnlyModal?: boolean,      // חלונית שדורשת אדם (למשל "החלפת סיסמה")
 *   hasPasswordField: boolean,
 *   passwordHasValue: boolean,
 *   submitButtonCount: number,     // כפתורי אישור גלויים שאותרו **מבנית**
 * }} snap
 * @returns {string} AUTH_STATE
 */
export function subsystemLoginState(snap) {
  if (!snap) return AUTH_STATE.UNKNOWN_AUTH_STATE;
  if (snap.blockingSignal) return AUTH_STATE.AUTH_REJECTED_OR_SECURITY_BLOCK;
  if (!snap.onLoginScreen) return AUTH_STATE.SUBSYSTEM_READY;
  if (snap.humanOnlyModal) return AUTH_STATE.SECONDARY_CREDENTIAL_SETUP_REQUIRED;
  // ‼ אין שדה סיסמה כלל — לא בהכרח "אין מה להזין": ייתכן טופס אחר שלא
  // מוכר (נצפה בפועל, 23.09.2026: מסך "מערכת לרישום ייצוג" עם שם משתמש
  // כטקסט קבוע מהכרטיס ובלי input[type=password] כלל). לא מנחשים — לא
  // ידוע, לא "צריך הכנה".
  if (!snap.hasPasswordField) return AUTH_STATE.UNKNOWN_AUTH_STATE;
  if (!snap.passwordHasValue) return AUTH_STATE.SECONDARY_CREDENTIAL_SETUP_REQUIRED;
  // ‼ יותר מכפתור "אישור" חד-משמעי אחד = לא בטוחים איזה מהם הנכון
  // (נצפה בפועל במערכת הייצוג: כמה כפתורי "אישור" לא קשורים על אותו עמוד).
  if (snap.submitButtonCount !== 1) return AUTH_STATE.UNKNOWN_AUTH_STATE;
  return AUTH_STATE.SAVED_CREDENTIAL_CONTINUATION;
}

/** מותר ניסיון המשך אוטומטי (חובה 7: קליק אחד, לא יותר) רק במצב הזה. */
export function allowsAutomaticContinuation(state) {
  return state === AUTH_STATE.SAVED_CREDENTIAL_CONTINUATION;
}

/** דורש עצירה + הודעה לאדם, בלי שום ניסיון נוסף. */
export function requiresHumanNow(state) {
  return state === AUTH_STATE.MAIN_HUMAN_AUTH_REQUIRED
    || state === AUTH_STATE.SECONDARY_CREDENTIAL_SETUP_REQUIRED
    || state === AUTH_STATE.AUTH_REJECTED_OR_SECURITY_BLOCK
    || state === AUTH_STATE.UNKNOWN_AUTH_STATE;
}

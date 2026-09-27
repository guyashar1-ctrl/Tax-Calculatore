// gmfRelogin.mjs — מה שפעולה עסקית (יישור קו, פרטי תיק, פתיחת מס הכנסה)
// עושה כשהיא נוחתת על מסך הכניסה של GMF באמצע עבודה.
//
// ‼ למה (27.09.2026): «יישור קו» נתקע על מסך הכניסה של GMF — 2.5 דקות אחרי
// שגיא נכנס — ועצר ב«החיבור לשע״ם אינו מוכן». הפורטל היה חי; חסרה רק
// הסיסמה השנייה, שכבר שמורה ב-Chrome. עכשיו: נכנסים איתה וממשיכים.
import { ensureGmfLogin, gmfAutoAllowed, beginShaamLoginCycle } from './gmfAutoLogin.mjs';
import { markGmfVerified, gmfOpenForSeconds, noteGmfClosed, FULL_LOGIN_DONE_LOG } from './connectionMonitor.mjs';
import { GMF_LOGIN_PATH, isFirstPasswordPath } from './browserSession.mjs';

export function isGmfLoginPath(pathname) {
  return typeof pathname === 'string' && pathname.startsWith(GMF_LOGIN_PATH);
}

/**
 * פעולה נחתה על מסך של הסיסמה הראשונה (הפורטל מנותק) ⇒ מחזור התחברות חדש:
 * מכאן גם הסיסמה השנייה ידנית, עד התחברות מלאה.
 */
export function noteFirstPasswordLanding(pathname) {
  if (!isFirstPasswordPath(pathname)) return false;
  beginShaamLoginCycle('portal_login_required');
  return true;
}

/** הודעה לרו"ח כשהכניסה לא הושלמה — מוצגת כמו שהיא ב-PIVO. */
export function gmfReloginMessage(reason) {
  if (reason === 'saved_password_rejected') {
    return 'מערכת גביית מס הכנסה לא קיבלה את הסיסמה ששמורה ב-Chrome (אולי הוחלפה). ' +
      'בחלון שע״ם: הקלידו את הסיסמה הנוכחית, לחצו «כניסה» ואשרו ל-Chrome לעדכן אותה — ואז הריצו שוב.';
  }
  if (reason === 'human_only_modal') {
    return 'מסך הכניסה של מערכת גביית מס הכנסה פתוח עם חלונית שדורשת אותך. טפלו בה בחלון שע״ם, ואז הריצו שוב.';
  }
  if (reason === 'manual_login_cycle') {
    return 'זו התחברות חדשה לשע״ם, ולכן את הסיסמה השנייה אתם מאשרים בעצמכם. ' +
      'בחלון שע״ם: בחרו את הסיסמה של מערכת גביית מס הכנסה ולחצו «כניסה» (או טפלו בהחלפת סיסמה) — ואז הריצו שוב.';
  }
  return 'מערכת גביית מס הכנסה ביקשה שוב את הסיסמה השנייה, ולא הצלחתי להיכנס לבד. ' +
    'בחלון שע״ם: בחרו את הסיסמה השמורה או הקלידו אותה ולחצו «כניסה» (ואשרו ל-Chrome לשמור) — ואז הריצו שוב.';
}

/**
 * הדף עומד על מסך הכניסה של GMF: סיסמה שמורה, ואם אין — עד 45 שניות לאדם
 * (החלון בחזית והשדה בפוקוס). ok ⇒ GMF פתוחה והפעולה ממשיכה.
 */
export async function reloginGmf(page, log) {
  const s = gmfOpenForSeconds();
  const how = gmfAutoAllowed() ? 'נכנס עם הסיסמה השמורה ב-Chrome' : 'מחזור התחברות חדש — ממתין לרו"ח';
  log(`GMF ביקשה שוב את הסיסמה השנייה${s != null ? ` — ${s} שנ׳ אחרי שנפתחה` : ''} · ${how}`);
  noteGmfClosed();
  const r = await ensureGmfLogin(page, { log });
  if (r.ok) {
    if (markGmfVerified()) log(FULL_LOGIN_DONE_LOG);
    log(`נכנסתי ל-GMF (${r.via === 'saved_password' ? 'סיסמה שמורה' : 'הרו"ח'}) — ממשיך`);
  }
  return r;
}

// shaamOpenIncomeTax.mjs — "פתח מס הכנסה": פותח את **מערכת גביית מס הכנסה**
// מתוך סשן שע״ם שכבר מאומת.
//
// ‼ הכתובת נלקחה מהקישור האמיתי בדף הבית של הפורטל ("מערכת גביית מס הכנסה"),
// לא נוחשה. ניווט ישיר ולא לחיצה על סלקטור: הקישור הוא href רגיל ולא
// postback של WebForms, ולכן כתובת יציבה יותר מאשר מיקום בתפריט שעשוי לזוז.
//
// ‼ הפעולה מניחה חיבור מוכן ואינה מנהלת התחברות. הכנת שתי שכבות האימות
// (פורטל שע״ם + מערכת הגבייה) שייכת לזרימת החיבור שבכותרת — shaam.connect.
// אם בכל זאת נתקלים כאן בקיר סיסמה, זו עדות שהחיבור לא הושלם: המשימה
// נעצרת עם "החיבור אינו מוכן" ומפנה לכותרת, במקום לפתוח תהליך התחברות
// שני מתוך כפתור בדיקה. האוטומציה לעולם אינה מקלידה סיסמה, PIN או OTP.
import { attach, detach } from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.open_income_tax';

const GMF_URL = 'https://shaam.taxes.gov.il/gmf-main-menu?browser=Chrome';
const GMF_PATH = '/gmf-main-menu';

const ATTACH_MESSAGES = {
  not_running:
    'חלון שע״ם אינו פתוח. לחצו על "שע״ם" בכותרת כדי לפתוח אותו, ואז נסו שוב.',
  blocked:
    'חלון שע״ם ממתין לאישור דיגיטלי או ל-PIN. השלימו אותו בחלון ואז נסו שוב.',
  no_context: 'חלון שע״ם פתוח אך אין בו אף לשונית. פתחו לשונית ונסו שוב.',
};

export async function preflight() {
  return { ok: true };
}

export async function run(ctx) {
  const conn = await attach();
  if (!conn.ok) {
    throw new NeedsHumanError(
      ATTACH_MESSAGES[conn.reason] ?? ATTACH_MESSAGES.not_running,
      `chrome_${conn.reason ?? 'not_running'}`,
    );
  }

  try {
    // ‼ אין בדיקת פורטל נפרדת כאן: מוכנות GMF אינה נגזרת ממוכנות הפורטל.
    // הבדיקה התפעולית האמיתית — הנתיב ושדה הסיסמה אחרי ההתייצבות, למטה —
    // כבר מזהה סשן מת (הפניה ל-/login) והיא הסמכות היחידה.
    ctx.log('מנווט למערכת גביית מס הכנסה');
    await conn.page.goto(GMF_URL, { waitUntil: 'domcontentloaded', timeout: 25000 })
      .catch((e) => ctx.log('ניווט הסתיים עם אזהרה:', String(e).split('\n')[0]));

    // ‼ חובה להמתין להתייצבות לפני שמכריעים. מערכת הגבייה היא אפליקציית
    // עמוד-יחיד: goto חוזר כבר ב-/gmf-main-menu/, ורק אחר כך היא מפנה בצד
    // הלקוח ל-/login. קריאת הכתובת מיד אחרי goto דיווחה "הצלחה" בזמן שעל
    // המסך היה מסך סיסמה. אומת בפועל, ולכן הבדיקה כאן היא על מצב מיוצב.
    const settled = await settle(conn.page);
    ctx.log(`נחת ב: ${settled.pathname} · שדה סיסמה: ${settled.hasPasswordField}`);

    if (!settled.pathname.startsWith(GMF_PATH)) {
      // ‼ הפניה לכניסת הפורטל (למשל אחרי חומת OTP, או סשן שער שפג) היא
      // עדות ל"החיבור אינו מוכן" — לא לתקלה מבנית. בלי ההבחנה הזאת, פורטל
      // שנפל היה נופל כאן ל-PermanentError, שאין ממנו חזרה בלי התערבות.
      if (settled.pathname.includes('/taxes-login/')) {
        throw new NeedsHumanError(
          'הפורטל של שע״ם מבקש אימות מחדש. לחצו על "שע״ם" בכותרת והשלימו את ' +
          'ההתחברות בחלון הייעודי, ואז הריצו שוב.',
          'shaam_portal_auth_required',
        );
      }
      throw new PermanentError(
        `הניווט לא הגיע למערכת הגבייה (${settled.pathname}).`,
        'unexpected_destination',
      );
    }

    // ‼ הפעולה הזאת **אינה** מנהלת התחברות. הכנת שתי שכבות האימות שייכת
    // לזרימת החיבור שבכותרת (shaam.connect). אם הגענו לקיר סיסמה — סימן
    // שהחיבור לא הושלם, ואומרים זאת במפורש במקום לגרור את הרו"ח לתהליך
    // התחברות מתוך כפתור בדיקה.
    if (settled.hasPasswordField || settled.pathname.includes('/login')) {
      throw new NeedsHumanError(
        'החיבור לשע״ם אינו מוכן — מערכת גביית מס הכנסה עדיין מבקשת התחברות. ' +
        'לחצו על "שע״ם" בכותרת והשלימו את החיבור, ואז הריצו שוב.',
        'shaam_connection_not_ready',
      );
    }

    return {
      result: {
        opened: true,
        system: 'shaam',
        area: 'income_tax_collection',
        path: settled.pathname,
      },
    };
  } finally {
    await detach(conn.browser);
  }
}

/**
 * ממתין שהאפליקציה תסיים, ואז מחזיר את המצב האמיתי.
 *
 * ‼ "הכתובת לא השתנתה בין שתי דגימות" נוסה ונכשל: ההפניה של האפליקציה
 * למסך ההתחברות מגיעה אחרי יותר משנייה, והלולאה יצאה לפני כן והכריזה
 * הצלחה מעל מסך סיסמה. אומת מול הדפדפן, לא בהנחה.
 *
 * לכן: קודם ממתינים שהרשת תשקוט (סוף הטעינה של אפליקציית העמוד היחיד),
 * ואז ממשיכים לדגום עד לסוף החלון — יוצאים מוקדם **רק** כששדה הסיסמה
 * הופיע, כי זו הכרעה ודאית. יציאה מוקדמת על "נראה יציב" היא בדיוק הבאג.
 */
async function settle(page, { idleMs = 15000, watchMs = 6000, stepMs = 500 } = {}) {
  await page.waitForLoadState('networkidle', { timeout: idleMs })
    .catch(() => { /* אפליקציה שמתשאלת ברקע לא תשקוט — נמשיך לדגום */ });

  const deadline = Date.now() + watchMs;
  let snapshot = await snap(page);
  while (Date.now() < deadline) {
    if (snapshot.hasPasswordField) return snapshot;
    await page.waitForTimeout(stepMs);
    snapshot = await snap(page);
  }
  return snapshot;
}

async function snap(page) {
  const href = page.url();
  let hasPasswordField = false;
  try {
    hasPasswordField = await page.evaluate(() => !!document.querySelector('input[type=password]'));
  } catch { /* ניווט באמצע — ננסה בדגימה הבאה */ }
  let pathname = '/';
  try { pathname = new URL(href).pathname; } catch { /* about:blank וכדומה */ }
  return { href, pathname, hasPasswordField };
}

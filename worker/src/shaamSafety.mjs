// ─── בטיחות פנייה לשע״ם — ניסיון אחד, ועצירה מסודרת ─────────────────────────
//
// ‼ הכלל: **פנייה חיצונית אחת לכל פעולה.** כישלון, דחייה, חלונית לא מוכרת,
// או תוצאה שאי אפשר להכריע — עוצרים, מדווחים לאדם, ולא מנסים שוב. שע״ם היא
// מערכת ממשלתית עם כרטיס חכם: ניסיון חוזר מסכן חסימה של הכרטיס ושל המשתמש,
// ויכול להוליד בקשה או שידור כפולים.
//
// ‼ החלוקה שהכול נשען עליה:
//   לפני נגיעה בשע״ם  ⇒ כשל מקומי. ניסיון נוסף בטוח (אבל עדיין ביוזמת אדם).
//   אחרי נגיעה בשע״ם  ⇒ תוצאה לא ידועה. **לעולם לא חוזרים** — קודם קוראים
//                       מה קרה שם בפועל («בדוק קבלת הייצוג»), ורק אז מחליטים.
// הסימן שמבדיל ביניהם הוא `progress.externalAttempt`, שנכתב **לפני**
// האינטראקציה ולא אחריה. מיגרציה 196 קוראת אותו בדיוק כך.

import { updateJobProgress } from './apiClient.mjs';
import { NeedsHumanError } from './errors.mjs';

/**
 * מנהל ה-progress של משימה אחת, עם מעקב גרסה ל-CAS.
 *
 * ‼ הגרסה נלקחת מהתשובה ולא מ«קודמת + 1»: עדכון שנדחה היה מפיל בשקט את כל
 * הבאים אחריו — וביניהם `externalAttempt`, שהוא בדיוק הסימן שאסור לאבד.
 */
/**
 * @param write פונקציית הכתיבה. ברירת המחדל היא ה-edge function; הפרמטר
 *   קיים כדי שהבדיקות יוכלו להזריק כותב — מרחב מודול ב-ESM קפוא ואי אפשר
 *   להחליף בו ייצוא, ודווקא כאן נדרשת בדיקה של **כשל** כתיבה.
 */
export function progressTracker(ctx, write = updateJobProgress) {
  const state = { ...(ctx.job.progress ?? {}) };
  let rev = ctx.job.revision ?? 0;

  const save = async () => {
    const r = await write(ctx.workerId, ctx.job.id, rev, state);
    if (r?.ok && r.job) { rev = r.job.revision ?? rev + 1; return true; }
    ctx.log(`שמירת התקדמות נדחתה (${r?.error ?? 'unknown'})`);
    return false;
  };

  return {
    get: () => state,
    /** האם המשימה הזאת כבר נגעה בשע״ם (גם בריצה קודמת שקרסה). */
    touchedExternal: () => !!state.externalAttempt,
    set: async (patch) => { Object.assign(state, patch); return save(); },
    /**
     * ‼ נקראת **מיד לפני** הפעולה החיצונית הראשונה, ולא אחריה. אם התהליך
     * ימות בדיוק בשנייה הבאה, הסימן כבר במסד, והתשתית (196) תסרב לתפוס
     * את המשימה מחדש.
     */
    markExternalAttempt: async (stage) => {
      state.externalAttempt = { at: new Date().toISOString(), stage };
      const okSaved = await save();
      if (!okSaved) {
        // ‼ לא הצלחנו לרשום שאנחנו עומדים לגעת בשע״ם ⇒ **לא נוגעים**.
        // בלי הסימן, קריסה הייתה נראית כמו כשל מקומי, והתשתית הייתה
        // מריצה שוב — בדיוק מה שאסור.
        throw new NeedsHumanError(
          'לא הצלחתי לרשום את תחילת הפעולה מול שע״ם, ולכן לא ביצעתי אותה. ' +
          'שום דבר לא נשלח לרשות. בדקו את החיבור לאינטרנט והריצו שוב.',
          'progress_write_failed_before_external',
        );
      }
    },
  };
}

/**
 * שער הכניסה של כל פעולה משנה: משימה שכבר נגעה בשע״ם אינה מורצת שוב.
 *
 * ‼ קו הגנה **שני**: מיגרציה 196 כבר מונעת את התפיסה מחדש. זה כאן למקרה
 * שהמשימה הגיעה בכל זאת (שורה שהוחזרה ידנית ל-queued, מסד ישן, מרוץ).
 */
export function assertNotAlreadyAttempted(progress, { operation, howToCheck }) {
  if (!progress.touchedExternal()) return;
  throw new NeedsHumanError(
    `${operation} כבר נוסתה מול שע״ם במשימה הזאת, ולא ידוע אם הרשות קלטה אותה. ` +
    'המערכת לא תנסה שוב מעצמה — ניסיון חוזר עלול ליצור כפילות. ' +
    howToCheck,
    'external_outcome_unknown',
  );
}

// ── סימני חסימה/אבטחה — עוצרים הכול ────────────────────────────────────────
//
// ‼ כשמופיע אחד מאלה, האוטומציה מפסיקה לגעת בשע״ם בריצה הזאת. לא מרעננים,
// לא מנסים מסלול אחר, לא בודקים "אולי זה חלף". כל אלה הם בדיוק ההתנהגות
// שמובילה לחסימה אמיתית.
const BLOCKING_PATTERNS = [
  { code: 'too_many_attempts', re: /ניסיונות|נסיונות|חריגה ממספר/ },
  { code: 'access_blocked', re: /חסומ|נחסמ|הרשאה נדחתה|אין הרשאה|גישה נדחתה/ },
  { code: 'card_problem', re: /כרטיס חכם|הכרטיס אינו|תקלה בכרטיס|אישור דיגיטלי/ },
  { code: 'otp_required', re: /קוד חד.?פעמי|סיסמה חד.?פעמית|אימות דו.?שלבי/ },
  { code: 'temporarily_restricted', re: /מושהה|הושהתה|זמנית אינו|נסה מאוחר יותר|נסו מאוחר יותר/ },
];

/**
 * סורק את המסך אחרי סימן אבטחה/חסימה. מחזיר `null` כשנקי.
 * ‼ קריאה בלבד — לא נוגע בכלום.
 */
export async function detectBlockingSignal(page) {
  const text = await page.evaluate(() => (document.body?.innerText || '').slice(0, 6000))
    .catch(() => '');
  const flat = text.replace(/\s+/g, ' ');
  for (const p of BLOCKING_PATTERNS) {
    const m = p.re.exec(flat);
    if (m) {
      const i = Math.max(0, m.index - 60);
      return { code: p.code, excerpt: flat.slice(i, i + 200).trim() };
    }
  }
  return null;
}

/** הודעה לרו"ח על סימן חסימה — בלי ז'רגון, עם מה לעשות. */
export function blockingError(signal, operation) {
  return new NeedsHumanError(
    `${operation} נעצרה: שע״ם הציגה הודעה שנראית כמו מגבלת גישה או אבטחה ` +
    `(«${signal.excerpt}»). האוטומציה לא תנסה שוב, כדי לא לגרום לחסימה. ` +
    'בדקו את החלון של שע״ם ואת הכרטיס, ורק אחרי שהמצב ברור — הפעילו שוב ידנית.',
    `shaam_${signal.code}`,
  );
}

/**
 * ראיות אבחון בטוחות ממסך שלא זוהה — **בלי** לגעת בו.
 *
 * ‼ זה מה שמחליף «לנסות ללחוץ על משהו דומה»: אוספים מה רואים, עוצרים,
 * ומתקנים את הקוד מחוץ למערכת החיה. אין ניסוי וטעייה מול שע״ם.
 * ‼ לא נאסף מידע מזהה של לקוח: רק כתובת, כותרות, ושמות פקדים.
 */
export async function captureDiagnostics(page, stage) {
  const snap = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const digits = (s) => s.replace(/\b\d{5,}\b/g, '#####');
    return {
      url: location.href.split('?')[0],
      hash: location.hash.slice(0, 60),
      headings: [...document.querySelectorAll('h1,h2,h3,legend')]
        .map((e) => digits(clean(e.textContent))).filter(Boolean).slice(0, 8),
      buttons: [...document.querySelectorAll('button, input[type=button], input[type=submit], a[role=button]')]
        .map((e) => clean(e.textContent || e.value)).filter(Boolean).slice(0, 25),
      fieldLabels: [...document.querySelectorAll('label')]
        .map((e) => digits(clean(e.textContent))).filter(Boolean).slice(0, 25),
      dialogOpen: !!document.querySelector('[role=dialog], .modal:not([style*="display: none"])'),
      hasPasswordField: !!document.querySelector('input[type=password]'),
    };
  }).catch((e) => ({ error: String(e).slice(0, 200) }));
  return { stage, ...snap };
}

/**
 * מסך לא מזוהה ⇒ עצירה, עם ראיות בלוג ועם הודעה אנושית במסך.
 *
 * ‼ ההודעה לרו"ח אינה שגיאת Playwright ואינה שם של selector. הפירוט
 * הטכני נשאר ב-`errorDetail` וביומן העובד.
 */
export function unknownScreenError(operation, stage, diagnostics) {
  const seen = (diagnostics.headings ?? []).slice(0, 3).join(' · ')
    || (diagnostics.buttons ?? []).slice(0, 4).join(' · ')
    || 'מסך לא מזוהה';
  return new NeedsHumanError(
    `${operation} נעצרה לפני ביצוע: המסך בשע״ם אינו זה שצפינו לו בשלב «${stage}». ` +
    `מה שנראה על המסך: ${seen}. לא נלחץ שום דבר ולא נשלח דבר לרשות. ` +
    'יש לבדוק את החלון ולדווח — האוטומציה תתוקן לפני ניסיון נוסף.',
    'shaam_unexpected_screen',
  );
}

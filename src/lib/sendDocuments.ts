// ─── שליחת מסמכים ללקוח ──────────────────────────────────────────────────────
// בקשה אחת שנושאת כמה קבצים, משני מקורות שונים, ואפשר גם רק מלל.
//
// ‼ שני מקורות ולא אחד, וההבדל ביניהם הוא בעלות ולא נוחות:
//   'office' — קובץ בספריית המשרד (מדריך הוצאות מוכרות וכד'). זהה לכל
//              הלקוחות, יושב פעם אחת ב-firm-resources, והקישור אליו נפתר
//              בשרת בכל טעינה — החלפת הקובץ משנה מיד את מה שכולם פותחים.
//   'client' — קובץ בתיק של הלקוח הזה. פרטי, ולכן נשמר כאן **מזהה בלבד**:
//              הדף האישי מבקש אותו דרך portal-open-document, שחותם קישור
//              זמני רק אחרי שהוא מוודא שהקובץ אכן נשלח ללקוח הזה.
//
// ‼ הפתיחה היא מה שסוגר, ואין הצהרת "עברתי על המסמך" (הכרעת גיא 2026-08-31).
// זה שונה מבקשת המדריך הישנה (מיגרציה 108), ובכוונה: מדריך שנשלח כדי שיקראו
// אותו הוא לא אותו דבר כמו מסמך שנשלח כדי שיהיה ללקוח. בקשות ישנות אינן
// נוגעות — הן ממשיכות לשאת את `reviewed` ולהיסגר בו.

export type SendResourceSource = 'office' | 'client';

/** קובץ אחד בתוך בקשת שליחה. `key` הוא גם המפתח של הדרישה שנסגרת בפתיחתו. */
export interface SendResource {
  key: string;
  source: SendResourceSource;
  /** source='office' — המזהה בספריית המשרד (profiles.settings.client_documents). */
  officeId?: string;
  /** source='client' — המזהה בטבלת documents של הלקוח. */
  documentId?: string;
  /** מה שהלקוח רואה. */
  label: string;
  fileName?: string;
}

/** מפתח יציב לפי המיקום ברשימה — נשמר על הבקשה ולכן חייב להיות דטרמיניסטי. */
export const resourceKey = (index: number) => `a${index + 1}`;

/**
 * השם שהלקוח יראה על קובץ מהתיק שלו.
 *
 * ‼ בדרך כלל זה שם התצוגה שהמשרד נתן למסמך. אבל חלק מהמסמכים נוצרים
 * אוטומטית עם *משפט* במקום שם ("הצעת מחיר 2026-008 שאושרה ונחתמה על ידי…
 * — נשמרה אוטומטית עם פתיחת הלקוח"), ומשפט כזה ככותרת אצל הלקוח נקרא כמו
 * תקלה. ארוך מדי ⇒ נופלים לשם הקובץ, שהוא מה שיירד אליו ממילא.
 */
const MAX_LABEL = 60;
export function documentLabel(d: { description?: string; fileName?: string }): string {
  const desc = (d.description || '').trim();
  const base = (d.fileName || '').replace(/\.[^./\\]+$/, '').trim();
  if (desc && desc.length <= MAX_LABEL) return desc;
  return base || desc.slice(0, MAX_LABEL) || 'מסמך';
}

export interface SendDocumentsInput {
  resources: SendResource[];
  /** המלל החופשי כפי שהוקלד. ריק ⇒ אין הודעה. */
  message?: string;
}

/**
 * שם ברירת המחדל של הודעה בלי קבצים.
 * ‼ נחוץ בצד הרו"ח — שם הבקשה ברשימה — אבל בדף האישי כותרת הקטע כבר אומרת
 * אותו דבר, ולכן הדף מדלג עליו כשהוא זהה. שני מקומות, מחרוזת אחת.
 */
export const MESSAGE_DEFAULT_TITLE = 'הודעה מהמשרד';

/** הכותרת שהלקוח רואה — נגזרת, כדי שלא יהיה עוד שדה חובה בחלון. */
export function sendDocumentsTitle(resources: SendResource[]): string {
  if (resources.length === 0) return MESSAGE_DEFAULT_TITLE;
  if (resources.length === 1) return resources[0].label;
  return `${resources.length} מסמכים מהמשרד`;
}

/**
 * ה-payload של בקשת «שליחת מסמכים ללקוח».
 *
 * ‼ `clientResources` (רבים) ולא `clientResource` (יחיד): השדה הישן ממשיך
 * לחיות על בקשות שכבר נשלחו, ו-build_client_portal קורא את שניהם. שם נפרד
 * ולא הרחבה של אותו שדה — כדי שבקשה ותיקה תמשיך להיפתח בדיוק כמו קודם.
 */
export function buildSendDocumentsPayload(
  { resources, message }: SendDocumentsInput,
): Record<string, unknown> {
  const text = (message ?? '').trim();
  const title = sendDocumentsTitle(resources);

  // ‼ הודעה בלי קבצים אינה בקשה: אין לה דרישות, אין לה כפתור, והדף האישי
  // מצייר אותה ככרטיס שקט שאינו נספר ב"כמה נשאר". היא יורדת מהדף כשהמשרד
  // סוגר אותה — ולא בשום פעולה של הלקוח, שאין לו כאן מה לעשות.
  if (resources.length === 0) {
    return {
      title,
      clientTitle: title,
      message: text,
      messageOnly: true,
      requirements: [],
    };
  }

  return {
    title,
    clientTitle: title,
    clientSub: resources.length === 1 ? 'מסמך מהמשרד' : `${resources.length} קבצים`,
    clientCta: resources.length === 1 ? 'לפתיחת המסמך' : undefined,
    message: text || undefined,
    clientResources: resources.map(r => ({
      key: r.key,
      source: r.source,
      officeId: r.source === 'office' ? r.officeId : undefined,
      documentId: r.source === 'client' ? r.documentId : undefined,
      label: r.label,
      fileName: r.fileName,
    })),
    // דרישה אחת לכל קובץ, וכולן חובה: הבקשה נסגרת כשכל מה ששלחנו נפתח.
    requirements: resources.map(r => ({
      key: r.key,
      kind: 'confirm' as const,
      label: `פתיחת ${r.label}`,
      done: false,
      required: true,
    })),
  };
}

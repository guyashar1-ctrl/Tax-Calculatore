// ─── ספריית המסמכים של המשרד ────────────────────────────────────────────────
// מסמכים קבועים שהמשרד נותן ללקוחות — מדריך הוצאות מוכרות, וכל מה שיתווסף.
// ‼ לא מסמך בתיק של לקוח: הקובץ זהה לכולם, יושב ב-Storage פעם אחת, ומצביעים
// אליו. לכן גם אין פריט קטלוג נפרד לכל קובץ — יש פריט אחד, «שליחת מסמך
// ללקוח», ובוחרים בתוכו מה לשלוח.
//
// ‼ הבקשה אצל הלקוח נפתרת ל**קובץ העדכני** בזמן הפתיחה, ולא לצילום מרגע
// השליחה — כמו קישור ההרשמה לפייפרלס, שנפתר מהגדרות המשרד בכל רינדור.
// לכן גרסאות קודמות אינן נמחקות אלא נערמות ב-history: מתי כל לקוח פתח רשום
// על הבקשה שלו, והצלבה מול ההיסטוריה אומרת איזו גרסה הייתה פעילה אז.
//
// ‼ תאימות לאחור: המדריך שנשמר בעבר תחת settings.expenses_guide ממשיך
// לעבוד — הוא נקרא כפריט בספרייה עם המזהה 'expenses_guide', וכל בקשה
// שכבר נשלחה ומצביעה למזהה הזה ממשיכה להיפתח בדיוק כמו קודם.

import type { FirmProfile } from '../types/firmProfile';

export const GUIDE_BUCKET = 'firm-resources';

/** המזהה ההיסטורי של מדריך ההוצאות. נשמר כדי שבקשות ותיקות ימשיכו לעבוד. */
export const EXPENSES_GUIDE_KEY = 'expenses_guide';
export const EXPENSES_GUIDE_TITLE = 'מדריך הוצאות מוכרות';

/** המפתח בהגדרות המשרד שמחזיק את הספרייה. */
export const LIBRARY_KEY = 'client_documents';

export interface DocVersion {
  path: string;
  url: string;
  fileName: string;
  at: string;
}

export interface ClientDocument extends DocVersion {
  /** מזהה יציב — נשמר על הבקשה ולכן לעולם לא משתנה. */
  id: string;
  /** השם שהלקוח רואה. */
  label: string;
  /** גרסאות קודמות, מהחדשה לישנה. הקבצים נשארים ב-Storage. */
  history?: DocVersion[];
}

type Settings = Record<string, unknown>;

/**
 * ספריית המסמכים של המשרד. קוראת גם את המדריך הישן שנשמר בשדה נפרד, כדי
 * שמשרד שהעלה מדריך לפני המעבר לספרייה לא יאבד אותו.
 */
export function documentLibrary(profile: Pick<FirmProfile, 'settings'>): ClientDocument[] {
  const settings = (profile.settings ?? {}) as Settings;
  const raw = settings[LIBRARY_KEY];
  if (Array.isArray(raw)) {
    return raw.filter((d): d is ClientDocument => {
      const x = d as Partial<ClientDocument>;
      return !!x && typeof x === 'object' && !!x.id && !!x.url && !!x.path;
    });
  }
  const legacy = settings[EXPENSES_GUIDE_KEY] as Partial<ClientDocument> | undefined;
  if (legacy?.url && legacy?.path) {
    return [{
      id: EXPENSES_GUIDE_KEY,
      label: EXPENSES_GUIDE_TITLE,
      path: legacy.path, url: legacy.url,
      fileName: legacy.fileName ?? 'expenses-guide.pdf',
      at: legacy.at ?? new Date().toISOString(),
      history: legacy.history ?? [],
    }];
  }
  return [];
}

export const findDocument = (profile: Pick<FirmProfile, 'settings'>, id: string) =>
  documentLibrary(profile).find(d => d.id === id);

/** מזהה חדש למסמך — יציב, ולכן נגזר מהזמן ולא מהשם (שם משתנה). */
export const newDocumentId = () => `doc_${Date.now().toString(36)}`;

/**
 * הוספת מסמך חדש לספרייה.
 * ‼ כותב תמיד את המערך המלא, כולל המרה של המדריך הישן — כך הפריט הישן
 * נשמר בספרייה במקום להישאר בשדה נפרד שאיש כבר לא קורא.
 */
export function withAddedDocument(
  profile: Pick<FirmProfile, 'settings'>,
  doc: ClientDocument,
): Settings {
  const next = [...documentLibrary(profile).filter(d => d.id !== doc.id), doc];
  return { ...(profile.settings as Settings), [LIBRARY_KEY]: next };
}

/** החלפת הקובץ של מסמך קיים. הגרסה הקודמת יורדת להיסטוריה ולא נמחקת. */
export function withReplacedFile(
  profile: Pick<FirmProfile, 'settings'>,
  id: string,
  next: DocVersion,
): Settings {
  const lib = documentLibrary(profile);
  const updated = lib.map(d => d.id !== id ? d : {
    ...d, ...next,
    history: [
      { path: d.path, url: d.url, fileName: d.fileName, at: d.at },
      ...(d.history ?? []),
    ].slice(0, 20),
  });
  return { ...(profile.settings as Settings), [LIBRARY_KEY]: updated };
}

/** שינוי השם שהלקוח רואה. הקובץ עצמו לא נוגע. */
export function withRenamedDocument(
  profile: Pick<FirmProfile, 'settings'>,
  id: string,
  label: string,
): Settings {
  const updated = documentLibrary(profile).map(d => d.id === id ? { ...d, label } : d);
  return { ...(profile.settings as Settings), [LIBRARY_KEY]: updated };
}

/**
 * הסרת מסמך מהספרייה.
 * ‼ הקובץ עצמו נשאר ב-Storage: בקשות שכבר נשלחו מצביעות אליו, ומחיקה
 * הייתה הופכת אותן לכפתור שנפתח לשום מקום.
 */
export function withRemovedDocument(
  profile: Pick<FirmProfile, 'settings'>,
  id: string,
): Settings {
  return {
    ...(profile.settings as Settings),
    [LIBRARY_KEY]: documentLibrary(profile).filter(d => d.id !== id),
  };
}

/** ה-payload של בקשת "שליחת מסמך ללקוח". דרישה אחת מסוג 'confirm' — נסגרת
 *  בפתיחת הקובץ עצמה דרך portal_submit_step, בלי שהלקוח מאשר שקרא. */
export function buildDocumentRequestPayload(doc: ClientDocument): Record<string, unknown> {
  return {
    title: doc.label,
    clientTitle: doc.label,
    clientSub: 'מסמך מהמשרד — כמה דקות קריאה',
    clientCta: 'לפתיחת המסמך',
    clientResource: doc.id,
    requirements: [
      { key: 'opened', kind: 'confirm' as const, label: 'פתיחת המסמך', done: false, required: true },
    ],
  };
}

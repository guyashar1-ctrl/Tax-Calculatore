// ─── מדריך ההוצאות המוכרות — נכס אחד של המשרד ───────────────────────────────
// קובץ אחד משותף לכל הלקוחות, שמנוהל במסך המשרד. ‼ לא מסמך בתיק של לקוח:
// הוא זהה לכולם, ולכן הוא יושב ב-Storage פעם אחת ומצביעים אליו.
//
// ‼ הבקשה אצל הלקוח נפתרת ל**קובץ העדכני** בזמן הפתיחה, ולא לצילום מרגע
// השליחה — בדיוק כמו קישור ההרשמה לפייפרלס, שנפתר מהגדרות המשרד בכל רינדור
// של הדף (ראה build_client_portal). המשמעות: החלפת הקובץ משנה מיד את מה
// שייפתח בכל בקשה, פתוחה או שהושלמה.
//
// ‼ ולכן הגרסאות הקודמות **אינן נמחקות** אלא נערמות ב-history. מתי כל לקוח
// פתח רשום על הבקשה שלו (doneAt), והצלבה מול ההיסטוריה אומרת איזו גרסה
// הייתה פעילה אז — בלי להישען על נתון שהדפדפן של הלקוח שלח.

import type { FirmProfile } from '../types/firmProfile';

export const GUIDE_BUCKET = 'firm-resources';

/** ‼ מזהה קבוע. הוא נשמר על הבקשה ומשמש את השרת לפתור את הקובץ. */
export const EXPENSES_GUIDE_KEY = 'expenses_guide';

export const EXPENSES_GUIDE_TITLE = 'מדריך הוצאות מוכרות';

export interface GuideVersion {
  path: string;
  url: string;
  fileName: string;
  at: string;
}

export interface ClientGuideSetting extends GuideVersion {
  /** גרסאות קודמות, מהחדשה לישנה. הקבצים עצמם נשארים ב-Storage. */
  history?: GuideVersion[];
}

/** המדריך הפעיל של המשרד, אם הועלה. */
export function currentGuide(profile: Pick<FirmProfile, 'settings'>): ClientGuideSetting | null {
  const raw = (profile.settings as Record<string, unknown> | undefined)?.[EXPENSES_GUIDE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Partial<ClientGuideSetting>;
  return g.url && g.path ? (g as ClientGuideSetting) : null;
}

/** הגרסה החדשה נכנסת, והקודמת יורדת לראש ההיסטוריה. */
export function withNewGuide(
  profile: Pick<FirmProfile, 'settings'>,
  next: GuideVersion,
): Record<string, unknown> {
  const prev = currentGuide(profile);
  const history = [
    ...(prev ? [{ path: prev.path, url: prev.url, fileName: prev.fileName, at: prev.at }] : []),
    ...(prev?.history ?? []),
  ].slice(0, 20);
  return {
    ...(profile.settings as Record<string, unknown>),
    [EXPENSES_GUIDE_KEY]: { ...next, history },
  };
}

/** ה-payload של בקשת המדריך. דרישה אחת מסוג 'confirm' — נסגרת בפתיחת הקובץ
 *  עצמה דרך portal_submit_step, בלי שהלקוח מאשר שקרא. */
export function buildGuideRequestPayload(): Record<string, unknown> {
  return {
    title: EXPENSES_GUIDE_TITLE,
    clientTitle: EXPENSES_GUIDE_TITLE,
    clientSub: 'מה כדאי לשמור ולהעביר אלינו — כמה דקות קריאה',
    clientCta: 'לפתיחת המדריך',
    clientResource: EXPENSES_GUIDE_KEY,
    requirements: [
      { key: 'opened', kind: 'confirm' as const, label: 'פתיחת המדריך', done: false, required: true },
    ],
  };
}

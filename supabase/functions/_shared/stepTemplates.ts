// ═══════════════════════════════════════════════════════════════════════════
//  תבניות המיילים של שלבי הקליטה — מקור האמת לנוסח ברירת המחדל
// ═══════════════════════════════════════════════════════════════════════════
//  נצרך משתי הסביבות מאותו קובץ ממש:
//    • Frontend (Vite/TS):  import { ... } from '../../supabase/functions/_shared/stepTemplates.ts'
//    • Edge Functions (Deno): import { ... } from '../_shared/stepTemplates.ts'
//
//  ולכן, כמו designSystem.ts, הקובץ חייב להישאר טהור: בלי React, בלי DOM,
//  בלי Deno API ובלי ייבוא חיצוני — רק טיפוסים, טקסט ופונקציות שמחזירות
//  מחרוזות. מסך ההגדרות מציג בדיוק את מה שהשרת ישלח, כי זה אותו טקסט.
//
//  הגדרות המשרד (profiles.settings.commTemplates) רק *דורסות* את מה שכאן,
//  ועריכה לפני שליחה דורסת את שתיהן. הנוסח כאן הוא מה שיוצא כשלא נגעו בכלום.
// ═══════════════════════════════════════════════════════════════════════════

// ‼ המייל נגזר מה**אירוע** שגרם לו, לא ממסגרת קליטה אחת לכולם. לקוח יכול
// להיות באמצע קליטה, בלי שום פעולה שנדרשת ממנו, ובאותו רגע לקבל שני מסמכים
// חדשים — ואז המסמכים הם הכותרת, וסטטוס הקליטה הוא הקשר משני.
//   process_open     – יש בקשות שממתינות ללקוח (וגם מייל הפתיחה הראשון)
//   documents_sent   – המשרד שלח מסמכים, ואין מה שממתין ללקוח
//   status_update    – אין בקשות ואין מסמכים חדשים; רק מה שבטיפולנו
//   portal_reminder  – (214) תזכורת על מה שכבר נמסר ועדיין פתוח. אינה «חדש».
// ‼ לשני אירועים יש שתי גרסאות, ולכל גרסה נוסח שמור משלה (savedTemplateKey):
//   process_open      – המייל הראשון («פתחנו לכם דף») / process_open_later — בקשות חדשות אחר כך.
//   status_update     – אין מה שממתין ללקוח / status_update_actions — יש מה שממתין לו.
export const STEP_EMAIL_KINDS = ['paperless_invite', 'retainer_request', 'step_reminder', 'intake_questionnaire', 'process_open', 'documents_sent', 'status_update', 'portal_reminder'] as const;

export type StepEmailKind = typeof STEP_EMAIL_KINDS[number];

export interface StepEmailTemplate {
  subject: string;
  body: string;
}

/** שמות המיילים בעברית — לכותרות מסכים ולתפריטים. */
export const STEP_EMAIL_KIND_LABELS: Record<StepEmailKind, string> = {
  paperless_invite: 'הזמנה לפייפרלס',
  retainer_request: 'בקשת הרשאת תשלום',
  step_reminder: 'תזכורת קליטה',
  intake_questionnaire: 'עדכון סטטוס מס',
  process_open: 'פתיחת התהליך - הדף האישי',
  documents_sent: 'שליחת מסמכים ללקוח',
  status_update: 'עדכון סטטוס - בלי פעולה נדרשת',
  portal_reminder: 'תזכורת - מה שעוד ממתין בדף האישי',
};

/** השדות שיוחלפו בערכים אמיתיים. מוצג כמקרא במסך ההגדרות. */
export const STEP_TEMPLATE_PLACEHOLDERS = [
  '{{clientName}}',
  '{{firmName}}',
  '{{paperlessInviteUrl}}',
  '{{amount}}',
  '{{billingStartMonth}}',
  '{{authUrl}}',
  '{{requestList}}',
  '{{welcomeLine}}',
  '{{documentList}}',
  '{{documentsPhrase}}',
  '{{statusList}}',
] as const;

/** השדות הרלוונטיים לכל סוג מייל — מקרא ממוקד במקום רשימה שכולה לא רלוונטית. */
export const PLACEHOLDERS_BY_KIND: Record<StepEmailKind, string[]> = {
  paperless_invite: ['{{clientName}}', '{{firmName}}', '{{paperlessInviteUrl}}'],
  retainer_request: ['{{clientName}}', '{{firmName}}', '{{amount}}', '{{billingStartMonth}}', '{{authUrl}}'],
  step_reminder: ['{{clientName}}', '{{firmName}}', '{{requestTitle}}', '{{requestSub}}'],
  intake_questionnaire: ['{{clientName}}', '{{firmName}}'],
  process_open: ['{{clientName}}', '{{firmName}}', '{{welcomeLine}}', '{{requestList}}'],
  documents_sent: ['{{clientName}}', '{{firmName}}', '{{documentsPhrase}}', '{{documentList}}'],
  status_update: ['{{clientName}}', '{{firmName}}', '{{statusList}}'],
  portal_reminder: ['{{clientName}}', '{{firmName}}', '{{requestList}}'],
};

// ‼ הנוסחים נכתבים בגוף שני רבים ("אתם") כמו שאר המיילים ללקוחות במערכת.
// הקישור עצמו אינו בגוף הטקסט אלא בכפתור שהפונקציה מוסיפה — אחרת הלקוח
// מקבל כתובת ארוכה באמצע פסקה, ולוחץ על הדבר הלא נכון.
const TEMPLATES: Record<StepEmailKind, StepEmailTemplate> = {
  paperless_invite: {
    subject: 'ברוכים הבאים - הכלי שנעבוד איתו',
    body:
      'שמחים להתחיל לעבוד יחד.\n' +
      'את הנהלת החשבונות השוטפת שלכם ננהל בפייפרלס - מערכת אחת שבה נאסף כל מה שקשור לעסק, ושדרכה נעבוד יחד לאורך כל השנה.\n' +
      '\n' +
      'מה זה נותן לכם:\n' +
      '· לצלם ולהעלות מסמכי הוצאות ישירות מהטלפון, ברגע שהם מגיעים\n' +
      '· לשלוח מסמכים במייל או להעלות אותם מהמחשב\n' +
      '· לעקוב אחרי פעילות העסק ואחרי התשלומים הצפויים לרשויות\n' +
      '· להפיק חשבוניות וקבלות דיגיטליות ללקוחות שלכם\n' +
      '\n' +
      'פתיחת החשבון לוקחת כדקה: לוחצים על הכפתור, ממלאים כמה פרטים, והחשבון מחובר אלינו.\n' +
      'מכאן והלאה כל מה שתעלו יגיע ישירות אלינו - בלי לאסוף קבלות בסוף השנה.',
  },
  retainer_request: {
    subject: 'הרשאה לתשלום החודשי',
    body:
      'בהצעת המחיר שאישרתם סוכם על שכר טרחה חודשי של {{amount}}, החל מחודש {{billingStartMonth}}.\n' +
      '\n' +
      'זו אינה בקשה חדשה - רק ההקמה בפועל של אותו סכום כהרשאה קבועה בפייפרלס, כדי שהחיוב יתבצע מדי חודש בלי שנצטרך לחזור אליכם.\n' +
      '\n' +
      'האישור נעשה בקישור שלמטה ולוקח פחות מדקה.',
  },
  // ‼ הנוסח נגזר מהבקשה עצמה ({{requestTitle}} / {{requestSub}}) ולא נכתב
  // בנפרד. הכרעת גיא 2026-08-05: מערכת תבניות אחת. נוסח שיושב גם על הבקשה
  // וגם בתבנית מייל נפרדת סותר את עצמו ביום שמשנים אחד מהם.
  // ‼ הכותרת עומדת בשורה משלה ולא משובצת באמצע משפט. הניסוחים של הבקשות הם
  // ציוויים ("להעלות 3 מסמכים"), ושיבוץ אחרי ש' נותן "רצינו להזכיר שלהעלות".
  step_reminder: {
    subject: '{{requestTitle}}',
    body:
      'רצינו להזכיר שהבקשה הבאה עדיין ממתינה:\n' +
      '\n' +
      '{{requestTitle}}\n' +
      '{{requestSub}}\n' +
      '\n' +
      'אם כבר טיפלתם בזה - תודה, אפשר להתעלם מהמייל הזה. אם משהו לא ברור או לא עובד, אפשר להשיב למייל ונעזור.',
  },
  // ‼ השאלון אינו טופס גיוס אלא מיפוי: כל שאלה שהלקוח עונה עליה כאן היא
  // שאלה שלא נשאל אותו בטלפון בדצמבר. הנוסח מסביר את זה, כי לקוח שלא מבין
  // למה הוא ממלא — לא ממלא.
  intake_questionnaire: {
    subject: 'שאלון קצר - כדי שנכיר את התמונה המלאה',
    body:
      'כדי שנוכל לטפל בענייני המס שלכם נכון, נשמח להכיר כמה פרטים על המצב שלכם.\n' +
      '\n' +
      'השאלון מתאים את עצמו לתשובות שלכם - עונים רק על מה שרלוונטי, ואפשר לסמן "לא בטוח" בכל שאלה ולהשאיר אותה לבירור איתנו.\n' +
      '\n' +
      'מה נשאל:\n' +
      '· מצב משפחתי וילדים - קובע נקודות זיכוי\n' +
      '· מקורות ההכנסה שלכם\n' +
      '· הפקדות לפנסיה, קרן השתלמות וביטוחים - מזכות בהטבות מס\n' +
      '· נכסים והלוואות - נדרשים להצהרת הון\n' +
      '\n' +
      'מה שתמלאו כאן יישמר בתיק, ולא נצטרך לחזור על השאלות בכל דוח שנתי.',
  },
  // ‼ המייל היחיד שמדבר על כל התהליך ולא על בקשה אחת. {{requestList}} נבנה
  // בשרת מהדף האישי עצמו — מאותם פריטים בדיוק שהלקוח יראה כשילחץ. רשימה
  // שנכתבת כאן ביד הייתה מתיישנת ביום הראשון שמוסיפים או מסירים בקשה.
  process_open: {
    subject: 'פתחנו לכם דף אישי - הנה מה שנשאר',
    body:
      '{{welcomeLine}}ריכזנו את כל תהליך ההצטרפות בדף אישי אחד: מה כבר הושלם, מה בטיפולנו, ומה ממתין לכם.\n' +
      '\n' +
      'מה חדש עבורכם:\n' +
      '{{requestList}}\n' +
      '\n' +
      'אין צורך לשמור את המייל הזה - הדף מתעדכן מעצמו, ואפשר לחזור אליו מאותו קישור בכל שלב.',
  },
  // ‼ המסמכים הם הכותרת, לא הקליטה. הלקוח לא נדרש לשום דבר כאן, ולכן אין
  // במייל הזה שום ניסוח של מטלה, דחיפות או "ממתין לך". סטטוס הקליטה מגיע
  // כהקשר משני, בבלוק נפרד שהשרת מוסיף — ולא כפסקה שמתחרה במסמכים.
  // ‼ מסמך אחד — DOCUMENTS_SENT_ONE (baseTemplateFor עם documentsCount: 1).
  documents_sent: {
    subject: 'שלחנו לכם {{documentsPhrase}}',
    body:
      '{{documentList}}\n' +
      '\n' +
      'המסמכים מחכים לכם בדף האישי - אפשר לצפות בהם ולהוריד אותם בכל שלב.',
  },
  // ‼ 214: תזכורת היא מייל נפרד, עם שם משלו — לא «שליחה חוזרת» של מייל הבקשות.
  // היא מפרטת רק מה שכבר נמסר ועדיין פתוח, ואינה מסמנת דבר כחדש.
  portal_reminder: {
    subject: 'תזכורת - מה שעוד ממתין לכם',
    body:
      'רצינו להזכיר שהדברים הבאים עדיין ממתינים לכם בדף האישי:\n' +
      '\n' +
      '{{requestList}}\n' +
      '\n' +
      'אם כבר טיפלתם בזה - תודה, אפשר להתעלם מהמייל הזה. אם משהו לא ברור או לא עובד, אפשר להשיב למייל ונעזור.',
  },
  // ‼ אין בקשות ואין מסמכים חדשים: המייל היחיד שנשאר לומר הוא "מה קורה אצלנו".
  status_update: {
    subject: 'עדכון על התהליך שלכם',
    body:
      'רצינו לעדכן איפה הדברים עומדים:\n' +
      '\n' +
      '{{statusList}}\n' +
      '\n' +
      'כרגע אין צורך בפעולה מצידכם - נעדכן אתכם כאן ברגע שיהיה מה לעשות.',
  },
};

/**
 * «מה חדש» ללקוח שכבר יש לו דף (דוח שנתי, בקשה שנוספה אחר כך) — בלי «פתחנו לכם דף»
 * ובלי «תהליך ההצטרפות», שמתאימים רק למייל הראשון של הקליטה. נוסח שהמשרד שמר לגרסה
 * הזו (commTemplates.process_open_later) — גובר. נוסח המייל הראשון לא נוגע בה.
 * ‼ לקוח ותיק שזה מייל הדף הראשון שלו (firstPageEmailKind 'introduce') — השולח מוסיף בראש
 * הגוף שורה אחת שמציגה את הדף (PAGE_INTRO_LINE; noticeWording.introLine), גם בנוסח של המשרד.
 */
export const PROCESS_OPEN_LATER: StepEmailTemplate = {
  subject: 'יש בקשות חדשות בדף האישי שלכם',
  body:
    'יש בדף האישי שלכם דברים חדשים שמחכים לכם:\n' +
    '{{requestList}}\n' +
    '\n' +
    'הכול מרוכז בדף האישי — אפשר לחזור אליו מאותו קישור בכל שלב.',
};

/** «שלחנו לכם מסמך חדש» — מסמך אחד, ביחיד. ‼ חל רק כשהמשרד לא שמר נוסח משלו. */
export const DOCUMENTS_SENT_ONE: StepEmailTemplate = {
  subject: 'שלחנו לכם {{documentsPhrase}}',
  body:
    '{{documentList}}\n' +
    '\n' +
    'המסמך מחכה לכם בדף האישי - אפשר לצפות בו ולהוריד אותו בכל שלב.',
};

/**
 * «הקישור לדף» כשיש בקשות שממתינות ללקוח. ‼ נוסח נפרד: הנוסח של status_update
 * אומר «כרגע אין צורך בפעולה מצידכם» — וכאן יש. {{requestList}} = מה שממתין לו.
 * מה שבטיפולנו מתווסף בשרת בבלוק נפרד, אלא אם הנוסח כולל {{statusList}}.
 */
export const STATUS_UPDATE_WITH_ACTIONS: StepEmailTemplate = {
  subject: 'הקישור לדף האישי שלכם',
  body:
    'הנה הקישור לדף האישי שלכם.\n' +
    '\n' +
    'מה שממתין לכם שם:\n' +
    '{{requestList}}\n' +
    '\n' +
    'הדף מתעדכן מעצמו, ואפשר לחזור אליו מאותו קישור בכל שלב.',
};

/** גרסה של סוג מייל שיש לה נוסח שמור משלה. */
export type TemplateVariantKey = 'process_open_later' | 'status_update_actions';
/** המפתח תחת settings.commTemplates — סוג מייל, או גרסה שלו. */
export type SavedTemplateKey = StepEmailKind | TemplateVariantKey;

const VARIANT_OF: Record<TemplateVariantKey, StepEmailKind> = {
  process_open_later: 'process_open',
  status_update_actions: 'status_update',
};

const VARIANT_TEMPLATES: Record<TemplateVariantKey, StepEmailTemplate> = {
  process_open_later: PROCESS_OPEN_LATER,
  status_update_actions: STATUS_UPDATE_WITH_ACTIONS,
};

const VARIANT_PLACEHOLDERS: Record<TemplateVariantKey, string[]> = {
  process_open_later: ['{{clientName}}', '{{firmName}}', '{{requestList}}'],
  status_update_actions: ['{{clientName}}', '{{firmName}}', '{{requestList}}', '{{statusList}}'],
};

export function isTemplateVariant(key: string): key is TemplateVariantKey {
  return Object.prototype.hasOwnProperty.call(VARIANT_OF, key);
}

/** סוג המייל של מפתח נוסח — לכפתור, ליעד הקישור ולסוג ביומן. */
export function eventOfTemplateKey(key: SavedTemplateKey): StepEmailKind {
  return isTemplateVariant(key) ? VARIANT_OF[key] : key;
}

export interface TemplateContext {
  /** status_update: יש בדף בקשות שממתינות ללקוח. */
  hasActions?: boolean;
  /** documents_sent: כמה מסמכים במייל — מסמך אחד ⇒ הנוסח ביחיד (DOCUMENTS_SENT_ONE). */
  documentsCount?: number;
}

/**
 * ‼ איזה נוסח שמור חל על המייל — מקום אחד לשרת (send-process-open-email) ולתצוגה
 * במסך (mailSample). נוסח שנשמר למייל הראשון לא דורס את המיילים שאחריו, ונוסח
 * «אין צורך בפעולה» לא יוצא כשיש מה שממתין ללקוח.
 */
export function savedTemplateKey(kind: StepEmailKind, first: boolean, ctx: TemplateContext = {}): SavedTemplateKey {
  if (kind === 'process_open' && !first) return 'process_open_later';
  if (kind === 'status_update' && ctx.hasActions) return 'status_update_actions';
  return kind;
}

/** נוסח ברירת המחדל של מפתח נוסח. מוחזר עותק, כדי שעריכה לא תדרוס את המקור. */
export function templateForKey(key: SavedTemplateKey): StepEmailTemplate {
  return isTemplateVariant(key) ? { ...VARIANT_TEMPLATES[key] } : defaultTemplate(key);
}

/** ברירת המחדל לאירוע — ‼ מקום אחד לשרת (send-process-open-email) ולתצוגה במסך (mailSample). */
export function baseTemplateFor(kind: StepEmailKind, first: boolean, ctx: TemplateContext = {}): StepEmailTemplate {
  const key = savedTemplateKey(kind, first, ctx);
  if (key === 'documents_sent' && ctx.documentsCount === 1) return { ...DOCUMENTS_SENT_ONE };
  return templateForKey(key);
}

// ─── המייל המרוכז ללקוח: איזה «ראשון», הכותרת והכפתור ─────────────────────────
// ‼ מקום אחד לשולח (send-process-open-email) ולתצוגה בבונה (mailSample): מה שהשרת
// כותב סביב הנוסח — הכותרת, שורת הפתיחה והכפתור — נגזר כאן, לא מועתק.

/**
 * איזה מייל דף ראשון:
 *   · 'welcome' — קליטה פתוחה ועוד לא יצא ללקוח מייל דף: «ברוכים הבאים», «שמחים להתחיל»
 *     ונוסח «תהליך ההצטרפות» (process_open);
 *   · 'introduce' — לקוח ותיק (דוח שנתי, בקשה ידנית) שזה מייל הדף הראשון שלו: נוסח ההמשך
 *     (process_open_later) ועוד שורה אחת שמציגה את הדף — לא «תהליך ההצטרפות»;
 *   · null — כבר קיבל מייל דף.
 * isFirst = _client_first_page_email; openIntake = open_intake_engagement_id (214).
 */
export type FirstPageEmail = 'welcome' | 'introduce' | null;

export function firstPageEmailKind(isFirst: boolean, openIntake: boolean): FirstPageEmail {
  if (!isFirst) return null;
  return openIntake ? 'welcome' : 'introduce';
}

/** שורת הפתיחה של מייל הקליטה הראשון. */
export const WELCOME_LINE = 'שמחים להתחיל לעבוד יחד.\n';
/** השורה שמציגה את הדף ללקוח ותיק — מתחת לכותרת «פתחנו לכם דף אישי». */
export const PAGE_INTRO_LINE = 'מעכשיו נרכז בו את כל מה שנצטרך מכם, והוא מתעדכן מעצמו.\n';

export type ConsolidatedEvent = 'process_open' | 'documents_sent' | 'status_update' | 'portal_reminder';

export interface NoticeWordingInput {
  event: ConsolidatedEvent;
  first: FirstPageEmail;
  /** השם הפרטי של הלקוח — לכותרת. ריק ⇒ כותרת בלי שם. */
  clientFirst: string;
  /** כמה מסמכים חדשים (קבצים) במייל. */
  documentsCount: number;
  /** status_update: יש בדף מה שממתין ללקוח. */
  hasActions?: boolean;
}

export interface NoticeWording {
  /** הנוסח השמור שחל (savedTemplateKey) — שם השורה ב«מיילים». */
  templateKey: SavedTemplateKey;
  /** ברירת המחדל כשהמשרד לא שמר נוסח (כולל מסמך אחד ביחיד). */
  base: StepEmailTemplate;
  /** הערך של {{welcomeLine}}. */
  welcomeLine: string;
  /**
   * 'introduce' — השורה שמציגה את הדף. ‼ נוסח בלי {{welcomeLine}} (ברירת המחדל של מייל ההמשך,
   * או נוסח של המשרד) — היא בראש הגוף (withIntroLine), כדי שלא תיעלם.
   */
  introLine: string;
  /** «מסמך חדש» / «3 מסמכים חדשים» — {{documentsPhrase}}. */
  documentsPhrase: string;
  heading: string;
  ctaLabel: string;
}

/** ‼ פנייה ללקוח ברבים («לכם», «שלכם») — כמו כל הנוסחים כאן. */
export function noticeWording(i: NoticeWordingInput): NoticeWording {
  const name = i.clientFirst.trim();
  const withName = (text: string) => (name ? `${name}, ${text}` : text);
  const welcome = i.first === 'welcome';
  const documentsPhrase = i.documentsCount === 1 ? 'מסמך חדש' : `${i.documentsCount} מסמכים חדשים`;
  const ctx: TemplateContext = { hasActions: i.event === 'status_update' && !!i.hasActions, documentsCount: i.documentsCount };
  const templateKey = savedTemplateKey(i.event, welcome, ctx);
  const heading = i.event === 'documents_sent' ? withName(`שלחנו לכם ${documentsPhrase}`)
    : i.event === 'status_update' && ctx.hasActions ? withName('הנה הקישור לדף שלכם')
    : i.event === 'status_update' ? 'עדכון על התהליך' + (name ? `, ${name}` : '')
    : i.event === 'portal_reminder' ? withName('תזכורת קטנה')
    : welcome ? 'ברוכים הבאים' + (name ? `, ${name}` : '')
    : i.first === 'introduce' ? withName('פתחנו לכם דף אישי')
    : withName('יש משהו חדש בדף שלכם');
  const introLine = i.event === 'process_open' && i.first === 'introduce' ? PAGE_INTRO_LINE : '';
  return {
    templateKey,
    base: baseTemplateFor(i.event, welcome, ctx),
    welcomeLine: i.event !== 'process_open' ? '' : welcome ? WELCOME_LINE : introLine,
    introLine,
    documentsPhrase,
    heading,
    ctaLabel: i.event === 'documents_sent'
      ? (i.documentsCount === 1 ? 'לצפייה במסמך בדף האישי' : 'לצפייה במסמכים בדף האישי')
      : 'לדף האישי שלכם',
  };
}

/**
 * הגוף אחרי renderTemplate, עם שורת ההצגה של הדף: נוסח שיש בו {{welcomeLine}} — כבר קיבל אותה
 * במקום השדה; נוסח בלעדיו — היא בראש הגוף.
 */
export function withIntroLine(renderedBody: string, templateBody: string, w: Pick<NoticeWording, 'introLine'>): string {
  return w.introLine && !templateUses(templateBody, 'welcomeLine') ? w.introLine + renderedBody : renderedBody;
}

export function placeholdersForKey(key: SavedTemplateKey): string[] {
  return isTemplateVariant(key) ? [...VARIANT_PLACEHOLDERS[key]] : [...PLACEHOLDERS_BY_KIND[key]];
}

/** הנוסח משתמש בשדה (למשל requestList) — אחרת השרת מוסיף את התוכן בבלוק משלו. */
export function templateUses(text: string, name: string): boolean {
  return new RegExp('\\{\\{\\s*' + name + '\\s*\\}\\}').test(text);
}

/**
 * ‼ שם השורה בעמוד «מיילים» — מקום אחד. «איך ייראה» במסלולים מפנה לשורה בשם
 * הזה בדיוק; שם שונה שולח את המשתמש לחפש שורה שלא קיימת.
 */
export const EMAIL_TEMPLATE_TITLES: Partial<Record<SavedTemplateKey, string>> = {
  process_open: 'מייל ראשון: פתחנו לכם דף אישי',
  process_open_later: 'בקשות חדשות ללקוח שכבר קיבל מייל',
  documents_sent: 'מסמכים חדשים בדף האישי',
  status_update: 'עדכון מצב — בלי פעולה נדרשת',
  status_update_actions: 'הקישור לדף — עם מה שממתין ללקוח',
  step_reminder: 'תזכורת על בקשה',
  portal_reminder: 'תזכורת על מה שממתין בדף',
};

export function emailTemplateTitle(key: SavedTemplateKey): string {
  return EMAIL_TEMPLATE_TITLES[key] ?? STEP_EMAIL_KIND_LABELS[eventOfTemplateKey(key)];
}

/** השורות של «עדכונים ללקוח על הבקשות» בעמוד «מיילים», לפי הסדר. */
export const REQUEST_UPDATE_TEMPLATE_KEYS: readonly SavedTemplateKey[] = [
  'process_open', 'process_open_later', 'documents_sent', 'status_update', 'status_update_actions',
  'portal_reminder', 'step_reminder', 'intake_questionnaire',
];

/** נוסח ברירת המחדל של סוג מייל. מוחזר עותק, כדי שעריכה לא תדרוס את המקור. */
export function defaultTemplate(kind: StepEmailKind): StepEmailTemplate {
  const t = TEMPLATES[kind];
  return { subject: t.subject, body: t.body };
}

/**
 * החלפת {{שדה}} בערכים. שדה שאין לו ערך נמחק מהטקסט ולא נשאר כסוגריים —
 * לקוח שמקבל "{{amount}}" במייל מבין (בצדק) שמישהו לא בדק מה נשלח אליו.
 */
export function renderTemplate(
  tpl: StepEmailTemplate,
  vars: Record<string, string | number | undefined | null>,
): StepEmailTemplate {
  const fill = (text: string): string =>
    text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      const v = vars[key];
      return v === undefined || v === null ? '' : String(v);
    });
  // שדה ריק משאיר שורה ריקה באמצע הפסקה. מכווצים, אחרת המייל נראה שבור
  // בדיוק כשהרו"ח לא מילא ניסוח משנה לבקשה.
  const body = fill(tpl.body).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
  return { subject: fill(tpl.subject).trim(), body };
}

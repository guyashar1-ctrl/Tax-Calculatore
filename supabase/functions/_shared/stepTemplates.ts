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

export const STEP_EMAIL_KINDS = ['paperless_invite', 'retainer_request', 'step_reminder'] as const;

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
};

/** השדות שיוחלפו בערכים אמיתיים. מוצג כמקרא במסך ההגדרות. */
export const STEP_TEMPLATE_PLACEHOLDERS = [
  '{{clientName}}',
  '{{firmName}}',
  '{{paperlessInviteUrl}}',
  '{{amount}}',
  '{{billingStartMonth}}',
  '{{authUrl}}',
] as const;

/** השדות הרלוונטיים לכל סוג מייל — מקרא ממוקד במקום רשימה שכולה לא רלוונטית. */
export const PLACEHOLDERS_BY_KIND: Record<StepEmailKind, string[]> = {
  paperless_invite: ['{{clientName}}', '{{firmName}}', '{{paperlessInviteUrl}}'],
  retainer_request: ['{{clientName}}', '{{firmName}}', '{{amount}}', '{{billingStartMonth}}', '{{authUrl}}'],
  step_reminder: ['{{clientName}}', '{{firmName}}'],
};

// ‼ הנוסחים נכתבים בגוף שני רבים ("אתם") כמו שאר המיילים ללקוחות במערכת.
// הקישור עצמו אינו בגוף הטקסט אלא בכפתור שהפונקציה מוסיפה — אחרת הלקוח
// מקבל כתובת ארוכה באמצע פסקה, ולוחץ על הדבר הלא נכון.
const TEMPLATES: Record<StepEmailKind, StepEmailTemplate> = {
  paperless_invite: {
    subject: 'ברוכים הבאים — הכלי שנעבוד איתו',
    body:
      'שמחים להתחיל לעבוד יחד.\n' +
      'את הנהלת החשבונות השוטפת שלכם ננהל בפייפרלס — מערכת אחת שבה נאסף כל מה שקשור לעסק, ושדרכה נעבוד יחד לאורך כל השנה.\n' +
      '\n' +
      'מה זה נותן לכם:\n' +
      '· לצלם ולהעלות מסמכי הוצאות ישירות מהטלפון, ברגע שהם מגיעים\n' +
      '· לשלוח מסמכים במייל או להעלות אותם מהמחשב\n' +
      '· לעקוב אחרי פעילות העסק ואחרי התשלומים הצפויים לרשויות\n' +
      '· להפיק חשבוניות וקבלות דיגיטליות ללקוחות שלכם\n' +
      '\n' +
      'פתיחת החשבון לוקחת כדקה: לוחצים על הכפתור, ממלאים כמה פרטים, והחשבון מחובר אלינו.\n' +
      'מכאן והלאה כל מה שתעלו יגיע ישירות אלינו — בלי לאסוף קבלות בסוף השנה.',
  },
  retainer_request: {
    subject: 'הרשאה לתשלום החודשי',
    body:
      'בהצעת המחיר שאישרתם סוכם על שכר טרחה חודשי של {{amount}}, החל מחודש {{billingStartMonth}}.\n' +
      '\n' +
      'זו אינה בקשה חדשה — רק ההקמה בפועל של אותו סכום כהרשאה קבועה בפייפרלס, כדי שהחיוב יתבצע מדי חודש בלי שנצטרך לחזור אליכם.\n' +
      '\n' +
      'האישור נעשה בקישור שלמטה ולוקח פחות מדקה.',
  },
  step_reminder: {
    subject: 'תזכורת קצרה',
    body:
      'רצינו להזכיר שהפעולה האחרונה שביקשנו עדיין ממתינה להשלמה.\n' +
      '\n' +
      'אם כבר טיפלתם בה — תודה, אפשר להתעלם מהמייל הזה. אם משהו לא ברור או לא עובד, אפשר להשיב למייל ונעזור.',
  },
};

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
  return { subject: fill(tpl.subject).trim(), body: fill(tpl.body) };
}

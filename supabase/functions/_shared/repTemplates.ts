// ═══════════════════════════════════════════════════════════════════════════
//  תבניות המיילים והכרטיס בדף האישי של תהליך הייצוג — מקור האמת לנוסח
//  ברירת המחדל. נצרך משתי הסביבות מאותו קובץ ממש, בדיוק כמו stepTemplates.ts:
//    • Frontend (Vite/TS):  import { ... } from '../../supabase/functions/_shared/repTemplates.ts'
//    • Edge Functions (Deno): import { ... } from '../_shared/repTemplates.ts'
//  ולכן הקובץ טהור: בלי React, בלי DOM, בלי Deno API ובלי ייבוא חיצוני.
//
//  הגדרות המשרד (profiles.settings.representation.templates) רק *דורסות* את
//  מה שכאן — שדה ריק/לא-מוגדר נופל חזרה לברירת המחדל. מסך ההגדרות מציג
//  בדיוק את מה שהשרת ישלח, כי זה אותו טקסט (ראה docs/prototypes/representation-settings.html).
//
//  ‼ "אישרתי באזור האישי" וכתובת היעד ב-gov.il אינם כאן בכוונה: הם קבועים
//  במערכת (system-owned), נכתבים ישירות ב-SQL (ensure_rep_client_approval_step)
//  ואינם ניתנים לדריסה מהמשרד. ראה REP_PORTAL_CARD_FIXED למטה — קבוע לתצוגה
//  בלבד בצד הלקוח (preview), לא נשלח לשרת.
// ═══════════════════════════════════════════════════════════════════════════

export const REP_MAIL_KINDS = ['rep_onboard', 'rep_sign', 'rep_ni_approve', 'rep_prerequisites', 'rep_active'] as const;
export type RepMailKind = typeof REP_MAIL_KINDS[number];

export interface RepMailTemplate {
  subject: string;
  heading: string;
  body: string;
  cta: string;
}

export const REP_MAIL_KIND_LABELS: Record<RepMailKind, string> = {
  rep_onboard: 'מייל הזיהוי',
  rep_sign: 'מייל החתימה',
  rep_ni_approve: 'הוראות אישור בביטוח הלאומי',
  rep_prerequisites: 'השלמת פרטים חסרים',
  rep_active: 'מייל "הייצוג פעיל"',
};

// ‼ הנוסח כאן זהה תו-בתו לזה שהיה קשיח ב-send-onboarding-email/index.ts לפני
// שהמסך הזה נבנה (186) — שינוי מיקום, לא שינוי טקסט. השוואה: git blame.
const REP_MAIL_DEFAULTS: Record<RepMailKind, RepMailTemplate> = {
  rep_onboard: {
    subject: 'ברוכים הבאים - נשאר רק לאמת את הזהות',
    heading: 'נעים להכיר',
    body: 'שמחים שבחרתם בנו. כדי שנתחיל לייצג אתכם מול רשויות המס, נשאר רק לאמת כמה פרטי זיהוי.',
    cta: 'להשלמת הפרטים',
  },
  rep_sign: {
    subject: 'הטופס מוכן - נשאר רק לחתום',
    heading: 'כמעט סיימנו',
    body: 'הכנו עבורכם את טופס ייפוי הכוח לייצוג מול רשויות המס. נשאר רק לחתום. אחרי החתימה נגיש את בקשת הייצוג לרשויות.',
    cta: 'לחתימה על הטופס',
  },
  rep_ni_approve: {
    subject: 'פעולה נדרשת - אישור ייפוי הכוח בביטוח הלאומי',
    heading: 'נשאר צעד אחד בביטוח הלאומי',
    body: 'הזנו עבורכם את ייפוי הכוח באתר הביטוח הלאומי. הביטוח הלאומי דורש שאתם תאשרו אותו בעצמכם - עד שלא תאשרו, הייצוג בביטוח הלאומי אינו בתוקף. אפשר לאשר באחת משתי הדרכים שלמטה, לוקח כדקה.',
    cta: 'לאישור באתר הביטוח הלאומי',
  },
  rep_prerequisites: {
    subject: 'כמה פרטים קצרים - כדי להמשיך בטיפול בייצוג בביטוח הלאומי',
    heading: 'נשארו כמה פרטים',
    body: 'כדי שנוכל להמשיך בטיפול בייצוג שלכם מול הביטוח הלאומי, חסרים לנו כמה פרטים. הקישור פותח טופס קצר ומאובטח שמבקש רק את מה שבאמת חסר - לוקח פחות מדקה.',
    cta: 'למילוי הפרטים',
  },
  rep_active: {
    subject: 'הייצוג אושר - נתחיל לעבוד',
    heading: 'הכול מוכן',
    body: 'הייצוג שלכם מול רשויות המס אושר בהצלחה. ניצור קשר בקרוב להשלמת הפרטים הראשוניים. תודה שבחרתם בנו!',
    cta: '',
  },
};

/** נוסח ברירת המחדל של מייל ייצוג. מוחזר עותק, כדי שעריכה לא תדרוס את המקור. */
export function defaultRepMailTemplate(kind: RepMailKind): RepMailTemplate {
  const t = REP_MAIL_DEFAULTS[kind];
  return { ...t };
}

/** override חלקי מהמשרד — שדה ריק/חסר נופל לברירת המחדל, לא נכתב כמחרוזת ריקה. */
export interface RepMailOverride {
  subject?: string;
  heading?: string;
  body?: string;
  cta?: string;
}

/** ממזג override מעל ברירת המחדל — משמש גם בשרת (שליחה) וגם במסך (preview). */
export function resolveRepMailTemplate(kind: RepMailKind, override?: RepMailOverride | null): RepMailTemplate {
  const base = defaultRepMailTemplate(kind);
  if (!override) return base;
  return {
    subject: override.subject?.trim() || base.subject,
    heading: override.heading?.trim() || base.heading,
    body: override.body?.trim() || base.body,
    cta: override.cta?.trim() || base.cta,
  };
}

// ── כרטיס "זירוז אישור הייצוג באזור האישי" ──────────────────────────────────
// שלושה שדות הסבר ניתנים לעריכה; הכותרת, טקסט הכפתור, וכתובת ה-gov.il קבועים
// (system-owned) — ראה ensure_rep_client_approval_step ב-SQL, שם הם נכתבים
// ישירות ואינם נקראים מכאן.

export interface RepPortalCardOverride {
  sub?: string;
  note?: string;
  noteAfter?: string;
  linkLabel?: string;
}

export const REP_PORTAL_CARD_DEFAULTS: Required<RepPortalCardOverride> = {
  sub: 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות',
  note: 'יש לך כבר משתמש באזור האישי של רשות המסים?\n\nכן - נכנסים בקישור, לוחצים "לכניסה למערכת" ומזדהים. מחפשים את הבקשה שבה מופיע שם המשרד כמייצג, ובוחרים אישור. שתי דקות.\n\nלא - קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.\n\nאם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.',
  noteAfter: 'ואם לא הסתדר - אין בעיה. הייצוג ייכנס לתוקף גם בלי זה, זה פשוט לוקח כמה ימים יותר.',
  linkLabel: 'לכניסה לאזור האישי',
};

/** מה שקבוע ולא נחשף לעריכה — לתצוגה מקדימה במסך ההגדרות בלבד. */
export const REP_PORTAL_CARD_FIXED = {
  title: 'זירוז אישור הייצוג באזור האישי',
  cta: 'אישרתי באזור האישי',
  linkUrl: 'https://www.gov.il/he/service/personal_area_taxes',
} as const;

export function resolveRepPortalCard(override?: RepPortalCardOverride | null): Required<RepPortalCardOverride> {
  if (!override) return { ...REP_PORTAL_CARD_DEFAULTS };
  return {
    sub: override.sub?.trim() || REP_PORTAL_CARD_DEFAULTS.sub,
    note: override.note?.trim() || REP_PORTAL_CARD_DEFAULTS.note,
    noteAfter: override.noteAfter?.trim() || REP_PORTAL_CARD_DEFAULTS.noteAfter,
    linkLabel: override.linkLabel?.trim() || REP_PORTAL_CARD_DEFAULTS.linkLabel,
  };
}

// ── תזכורות אוטומטיות · חדש (186) ────────────────────────────────────────────
// יכולת חדשה, כבויה כברירת מחדל לכל משרד. שני פרמטרים בלבד, בכוונה —
// לא מנוע כללים. ראה supabase/functions/representation-reminders.

export const REP_REMINDER_AUDIENCES = ['sign', 'niClient', 'niSpouse', 'portal'] as const;
export type RepReminderAudience = typeof REP_REMINDER_AUDIENCES[number];

export interface RepReminderConfig {
  enabled: boolean;
  afterDays: number;
  maxReminders: number;
}

export const REP_REMINDER_DEFAULTS: Record<RepReminderAudience, RepReminderConfig> = {
  sign: { enabled: false, afterDays: 7, maxReminders: 2 },
  niClient: { enabled: false, afterDays: 7, maxReminders: 2 },
  niSpouse: { enabled: false, afterDays: 10, maxReminders: 1 },
  portal: { enabled: false, afterDays: 10, maxReminders: 1 },
};

export function resolveRepReminderConfig(
  audience: RepReminderAudience,
  override?: Partial<RepReminderConfig> | null,
): RepReminderConfig {
  const base = REP_REMINDER_DEFAULTS[audience];
  if (!override) return { ...base };
  return {
    enabled: override.enabled ?? base.enabled,
    afterDays: Number.isFinite(override.afterDays) ? Math.min(60, Math.max(1, Number(override.afterDays))) : base.afterDays,
    maxReminders: Number.isFinite(override.maxReminders) ? Math.min(5, Math.max(1, Number(override.maxReminders))) : base.maxReminders,
  };
}

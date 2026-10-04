// מרכז התקשורת — רשומת מייל יוצא. מבנה עצמאי, ניתן לקידום למרכז תקשורת מלא.

import { isUnknownOutcome } from '../../supabase/functions/_shared/resendResult.ts';
import { EMAIL_TEMPLATE_TITLES, emailTemplateTitle, type SavedTemplateKey } from '../../supabase/functions/_shared/stepTemplates.ts';
import { failureReasonText } from '../lib/providerErrorText';

export type EmailStatus =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'failed'
  /**
   * ‼ לא ידוע אם יצא: הספק לא החזיר תשובה מכריעה (רשת שנפלה, 5xx, 2xx בלי מזהה).
   * ייתכן שהמייל אצל הנמען — לכן הוא לעולם לא «נכשל» (אדום) ולא «נשלח».
   */
  | 'unknown';

export interface EmailMessage {
  id: string;
  clientId?: string;
  requestId?: string;
  resendId?: string;
  toEmail: string;
  subject?: string;
  kind?: string;
  status: EmailStatus;
  error?: string;
  sentAt: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
  /** גוף המייל כפי שנשלח. חסר במיילים שנשלחו לפני שהשמירה נוספה. */
  html?: string;
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  sent: 'נשלח',
  delivered: 'נמסר',
  delivery_delayed: 'מתעכב',
  bounced: 'הוקפץ',
  complained: 'סומן כספאם',
  opened: 'נפתח',
  clicked: 'נלחץ',
  failed: 'נכשל',
  unknown: 'לא ידוע אם יצא',
};

// שם המייל בשפה של הרו"ח. ה-kind נשמר באנגלית ע"י פונקציות השרת, וברשימה של
// הלקוח צריך לקרוא "בקשת חתימה" ולא "sign".
export const EMAIL_KIND_LABEL: Record<string, string> = {
  onboard: 'קישור ייצוג - אימות זהות',
  onboarding: 'קישור ייצוג - אימות זהות',   // שם ישן של אותו מייל
  sign: 'בקשת חתימה על ייפוי הכוח',
  active: 'הייצוג אושר',
  intake: 'שאלון עדכון פרטים',
  intake_questionnaire: 'עדכון סטטוס מס',
  ni_approve: 'אישור ייפוי כוח בביטוח לאומי',
  quotation: 'הצעת מחיר',
  quotation_test: 'הצעת מחיר - שליחת בדיקה',
  quotation_reminder: 'תזכורת להצעת מחיר',
  release: 'מכתב העברת טיפול לרו״ח הקודם',
  // מיילים של שלבי הקליטה
  paperless_invite: 'הזמנה לפייפרלס',
  retainer_request: 'בקשת הרשאת תשלום',
  // ‼ שם אחד למייל: כמו השורה שלו בעמוד «מיילים» (emailTemplateTitle).
  step_reminder: emailTemplateTitle('step_reminder'),
  weekly_backup: 'גיבוי שבועי',
  // «שלח ללקוח» מהדף האישי — שלושה מצבים של אותו כפתור.
  // ‼ ל-process_open ול-status_update שני נוסחים כל אחד (ראשון/המשך, בלי/עם מה שממתין),
  // ושני שמות בעמוד «מיילים». כל עוד היומן לא שומר איזה נוסח יצא (meta.templateKey,
  // emailTemplateKeyOf) — שם שמכסה את שניהם, מאותן מילים.
  process_open: 'בקשות חדשות בדף האישי',
  documents_sent: emailTemplateTitle('documents_sent'),
  status_update: 'הקישור לדף ועדכון מצב',
  // (214) תזכורת על מה שכבר נמסר ועדיין פתוח — מהמגש, או לבד לפי השלב במסלול
  portal_reminder: emailTemplateTitle('portal_reminder'),
  // תזכורות ייצוג אוטומטיות (representation-reminders)
  representation_reminder_sign: 'תזכורת אוטומטית - חתימה',
  representation_reminder_niClient: 'תזכורת אוטומטית - אישור בביטוח לאומי',
  representation_reminder_niSpouse: 'תזכורת אוטומטית - אישור בביטוח לאומי (בן/בת זוג)',
  representation_reminder_portal: 'תזכורת אוטומטית - אישור באזור האישי',
  // התראות פנימיות — נשלחות לרו"ח עצמו, לא ללקוח
  notify_quotation_approved: 'התראה - הצעה אושרה',
  notify_onboarding_submitted: 'התראה - מולאו פרטי ייצוג',
  notify_poa_signed: 'התראה - נחתם ייפוי כוח',
  notify_request_not_created: 'התראה - בקשה מהקליטה לא נוצרה',
  notify_kind_hold_release_failed: 'התראה - הבקשות שחיכו לסוג העוסק לא נפתחו',
};

export const emailKindLabel = (kind?: string): string =>
  (kind && EMAIL_KIND_LABEL[kind]) || 'מייל';

/**
 * איזה נוסח יצא במייל הזה (meta.templateKey — «מייל ראשון» / «בקשות חדשות ללקוח שכבר קיבל
 * מייל» וכו'). undefined — היומן לא שמר (מייל ישן, או שרת שעוד לא כותב את המפתח).
 */
export function emailTemplateKeyOf(m: Pick<EmailMessage, 'meta'>): SavedTemplateKey | undefined {
  const k = m.meta?.templateKey;
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATE_TITLES, k)
    ? k as SavedTemplateKey : undefined;
}

/**
 * שם המייל ביומן — ‼ אותו שם כמו השורה שלו בעמוד «מיילים» כשהיומן שמר איזה נוסח יצא
 * (meta.templateKey); אחרת — השם של הסוג (emailKindLabel), שמכסה את שני הנוסחים.
 */
export function emailMessageLabel(m: Pick<EmailMessage, 'kind' | 'meta'>): string {
  const key = emailTemplateKeyOf(m);
  return key ? emailTemplateTitle(key) : emailKindLabel(m.kind);
}

/**
 * מייל שנשלח לרו״ח עצמו ולא ללקוח.
 *
 * ‼ אסור שיופיע תחת "מיילים שנשלחו ללקוח". חלק מההתראות **כן** נושאות
 * `client_id` (הן יודעות על איזה לקוח הן מדווחות), ולכן הן נכנסו לכרטיס דרך
 * ההתאמה הראשית ולא רק דרך הכתובת — הסינון הזה הוא השער היחיד שעוצר אותן.
 * מקומן ביומן המיילים של המשרד.
 */
export const isInternalEmailKind = (kind?: string): boolean =>
  !!kind && (kind.startsWith('notify_') || kind === 'weekly_backup');

// bg/fg/dot — צבעים תואמי כהה/בהיר דרך ערכים מפורשים
export const EMAIL_STATUS_STYLE: Record<EmailStatus, { bg: string; fg: string; dot: string }> = {
  sent: { bg: 'var(--chip-blue-bg)', fg: 'var(--chip-blue-tx)', dot: 'var(--br)' },
  delivered: { bg: 'var(--chip-green-bg)', fg: 'var(--chip-green-tx)', dot: 'var(--ok)' },
  delivery_delayed: { bg: 'var(--chip-amber-bg)', fg: 'var(--chip-amber-tx)', dot: 'var(--warn)' },
  opened: { bg: 'var(--chip-violet-bg)', fg: 'var(--chip-violet-tx)', dot: 'var(--info)' },
  clicked: { bg: 'var(--chip-violet-bg)', fg: 'var(--chip-violet-tx)', dot: 'var(--info)' },
  bounced: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
  complained: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
  failed: { bg: 'var(--chip-red-bg)', fg: 'var(--chip-red-tx)', dot: 'var(--err)' },
  unknown: { bg: 'var(--chip-amber-bg)', fg: 'var(--chip-amber-tx)', dot: 'var(--warn)' },
};

// ─── «לא ידוע אם יצא» — מה יודעים ומה עושים, במקום אחד ─────────────────────
// ‼ המסכים (שורת מייל בשלב, מיילים של הלקוח, יומן המשרד, חלונות השליחה) קוראים
// מכאן — אין מפה שנייה. כלל: unknown הוא כתום ולא אדום, ואינו נספר ב«נכשלו».

/** הספק דחה / חזר / סומן כספאם — אדום. ‼ unknown אינו כאן. */
export const FAILED_EMAIL_STATUSES: readonly EmailStatus[] = ['bounced', 'complained', 'failed'];

export const isFailedEmailStatus = (s: string | undefined): boolean =>
  !!s && (FAILED_EMAIL_STATUSES as readonly string[]).includes(s);

export const isUnknownEmailStatus = (s: string | undefined): boolean => s === 'unknown';

/**
 * למה לא ידוע — מהסיבה שהשרת שמר (טקסט הספק, באנגלית, שלא מוצג).
 * אותן מילים כמו בשורת «לא ידוע אם יצא המייל» במגש.
 */
export function unknownEmailCause(error?: string | null): string {
  const e = String(error ?? '').toLowerCase();
  if (e.startsWith('unknown_outcome:')) return unknownEmailCause(e.slice('unknown_outcome:'.length).trim());
  if (e.startsWith('network') || e.startsWith('resend_unreachable') || e.startsWith('fetch_failed')) {
    return 'החיבור לספק הדואר נקטע לפני שהגיעה תשובה';
  }
  if (e === 'ok_without_id') return 'ספק הדואר קיבל את המייל, אבל בלי אישור מלא';
  if (e.includes('idempotent') || e === 'in_flight') return 'ספק הדואר עוד טיפל באותו מייל';
  return 'ספק הדואר ענה בתקלה, בלי לומר אם המייל יצא';
}

/** הצעד הבטוח. ‼ התראה למשרד — הנמען הוא המשרד עצמו. */
export function unknownEmailNextStep(kind?: string): string {
  return isInternalEmailKind(kind)
    ? 'כדאי לבדוק בתיבת הדואר של המשרד אם הגיע.'
    : 'לפני ששולחים שוב — כדאי לברר עם הנמען אם קיבל אותו.';
}

export type EmailRowTone = 'failed' | 'unknown' | 'normal';

/**
 * מצב השורה של מייל אחד: אדום (נכשל/חזר), כתום (לא ידוע אם יצא — עם הסיבה והצעד
 * הבטוח), או רגיל (הגיע/נפתח).
 */
export function emailRowState(m: Pick<EmailMessage, 'status' | 'error' | 'kind'>): {
  tone: EmailRowTone; label?: string; hint?: string;
} {
  if (isUnknownEmailStatus(m.status)) {
    return {
      tone: 'unknown',
      label: EMAIL_STATUS_LABEL.unknown,
      hint: `${unknownEmailCause(m.error)}. ${unknownEmailNextStep(m.kind)}`,
    };
  }
  if (isFailedEmailStatus(m.status)) {
    // ‼ «סומן כספאם» — המייל הגיע, והנמען סימן אותו. זה לא «השליחה נכשלה».
    return {
      tone: 'failed',
      label: m.status === 'bounced' ? 'חזר - כתובת שגויה' : m.status === 'complained' ? EMAIL_STATUS_LABEL.complained : 'השליחה נכשלה',
    };
  }
  return { tone: 'normal' };
}

// ─── מייל בלשונית «פעילות» של הלקוח ──────────────────────────────────────────
// ‼ CLAUDE.md §9: «נשלח» רק עם ראיה. כותרת השורה נגזרת מהמצב שביומן — לא «נשלח מייל
// ללקוח» לכל שורה. התראה למשרד אינה תקשורת עם הלקוח ואינה מופיעה שם (isInternalEmailKind).

/** מיילים שתמיד יוצאים לכתובת שבכרטיס הלקוח (גם אם היא השתנתה מאז). */
const CLIENT_EMAIL_KINDS = new Set([
  'process_open', 'documents_sent', 'status_update', 'portal_reminder', 'onboard', 'onboarding', 'active',
  'intake', 'intake_questionnaire', 'quotation', 'quotation_reminder', 'paperless_invite', 'retainer_request',
]);

const normAddr = (e?: string | null) => (e ?? '').trim().toLowerCase();

/** למי המייל, במילים — « ללקוח», « לבן/בת הזוג», « לרו״ח הקודם», או '' (השורה «אל:» אומרת). */
export function emailRecipientPhrase(
  m: Pick<EmailMessage, 'kind' | 'toEmail'>,
  card: { email?: string | null; spouseEmail?: string | null },
): string {
  const to = normAddr(m.toEmail);
  if (to && to === normAddr(card.spouseEmail)) return ' לבן/בת הזוג';
  if (to && to === normAddr(card.email)) return ' ללקוח';
  if (m.kind === 'release') return ' לרו״ח הקודם';
  if (m.kind && CLIENT_EMAIL_KINDS.has(m.kind)) return ' ללקוח';
  return '';
}

export interface EmailActivityView {
  title: string;
  tone: EmailRowTone;
  /** מה יודעים ומה עושים — רק כשהמייל לא יצא כרגיל. */
  hint?: string;
  /** הכתובת של הלקוח לא קיבלה את המייל — מתקנים אותה בתיק המס («פרטי נישום»). */
  fixAddressInTaxFile?: boolean;
}

/**
 * כותרת ושורת הסבר למייל בציר הזמן של הלקוח. ‼ «נשלח» רק כשספק הדואר קיבל אותו;
 * «לא ידוע אם יצא» — כתום, עם הסיבה והצעד הבטוח (emailRowState); נכשל/חזר — אדום.
 */
export function emailActivityView(
  m: Pick<EmailMessage, 'status' | 'error' | 'kind' | 'toEmail'>,
  card: { email?: string | null; spouseEmail?: string | null },
): EmailActivityView {
  const to = emailRecipientPhrase(m, card);
  const row = emailRowState(m);
  if (row.tone === 'unknown') return { tone: 'unknown', title: `לא ידוע אם המייל${to} יצא`, hint: row.hint };
  if (m.status === 'bounced') {
    const client = to === ' ללקוח';
    return {
      tone: 'failed', title: `המייל${to} חזר — לא הגיע`,
      hint: `הכתובת לא קיבלה את המייל. כדאי לבדוק אותה${client ? ' בתיק המס, ב«פרטי נישום»,' : ''} ולשלוח שוב.`,
      ...(client ? { fixAddressInTaxFile: true } : {}),
    };
  }
  if (m.status === 'complained') {
    return { tone: 'failed', title: `המייל${to} סומן כספאם`, hint: 'הנמען סימן אותו כספאם — מיילים הבאים לכתובת הזו עלולים לא להגיע.' };
  }
  if (row.tone === 'failed') {
    return { tone: 'failed', title: `המייל${to} לא נשלח`, hint: `${failureReasonText(m.error ?? '')}.` };
  }
  return { tone: 'normal', title: `נשלח מייל${to}` };
}

// ─── שדות שמתמלאים לבד בנוסח — שם בעברית במקום הקוד ──────────────────────────
// ‼ הנוסח נשמר ונשלח עם {{קוד}}, והשרת ממלא אותו לכל לקוח. מי שעורך רואה במקומו את
// השם בעברית בסוגריים מרובעים — אותו שם כמו בכפתור שמכניס את השדה — וההמרה חוזרת
// לקוד לפני שמירה ושליחה. קוד שלא מוכר למייל נשאר כמו שהוא.

/** השם בעברית של כל שדה שמתמלא לבד. */
export const TEMPLATE_FIELD_LABELS: Record<string, string> = {
  '{{clientName}}': 'שם הלקוח',
  '{{firmName}}': 'שם המשרד',
  '{{paperlessInviteUrl}}': 'קישור ההזמנה',
  '{{amount}}': 'הסכום',
  '{{billingStartMonth}}': 'חודש תחילת החיוב',
  '{{authUrl}}': 'קישור ההרשאה',
  '{{requestTitle}}': 'שם הבקשה',
  '{{requestSub}}': 'פירוט הבקשה',
  '{{welcomeLine}}': 'שורת פתיחה',
  '{{requestList}}': 'רשימת הבקשות',
  '{{documentsPhrase}}': '«מסמך» או «מסמכים»',
  '{{documentList}}': 'רשימת המסמכים',
  '{{statusList}}': 'מה בטיפולנו',
};

const FIELD_TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** {{קוד}} ← [שם בעברית], לעריכה. */
export function templateToLabels(text: string, labels: Record<string, string> = TEMPLATE_FIELD_LABELS): string {
  return text.replace(FIELD_TOKEN, (whole, name: string) => {
    const label = labels[`{{${name}}}`];
    return label ? `[${label}]` : whole;
  });
}

/** [שם בעברית] ← {{קוד}}, לפני שמירה ושליחה. */
export function templateFromLabels(text: string, labels: Record<string, string> = TEMPLATE_FIELD_LABELS): string {
  // ארוכים קודם — שם שמכיל שם קצר יותר לא נשבר באמצע.
  const pairs = Object.entries(labels).sort((a, b) => b[1].length - a[1].length);
  let out = text;
  for (const [token, label] of pairs) out = out.split(`[${label}]`).join(token);
  return out;
}

/**
 * המשפט אחרי «שלח» כשהשרת ענה unknown_outcome. retrySafe — השרת שלח עם מפתח קבוע,
 * ולכן לחיצה נוספת מאותו מקום (בתוך יממה) לא תשלח פעמיים.
 * what — מה נשלח, בלשון זכר יחיד («המייל», «המייל עם ההוראות»).
 */
export function unknownSendText(opts?: {
  retrySafe?: boolean; what?: string; button?: string; recipient?: string;
  /** איך שולחים שוב מהמקום הזה — ברירת מחדל: «לחיצה נוספת על «{button}»». */
  again?: string;
}): string {
  const what = opts?.what ?? 'המייל';
  const head = `לא ידוע אם ${what} יצא — ספק הדואר לא החזיר תשובה ברורה.`;
  if (opts?.retrySafe) {
    const again = opts.again ?? `לחיצה נוספת על «${opts.button ?? 'שלח'}»`;
    return `${head} ${again} בתוך יממה לא תשלח אותו פעמיים: אם כבר יצא, ספק הדואר יזהה אותו.`;
  }
  return `${head} לפני ששולחים שוב — כדאי לברר עם ${opts?.recipient ?? 'הנמען'} אם קיבל אותו.`;
}

/**
 * שגיאה ממסך שמקבל מהמארח רק משפט (Error.message) אחרי ניסיון שליחה.
 *   unknown_outcome (קוד או המשפט של השרת)       → כתום: לא ידוע אם יצא.
 *   משפט בעברית                                  → אדום, כמו שהוא (השרת/המארח הסביר).
 *   קוד או משפט באנגלית (למשל «non-2xx status»)  → כתום: לא התקבלה תשובה ברורה —
 *     ‼ השרת לא אמר שהמייל לא יצא, ולכן גם המסך לא אומר.
 */
export function sendErrorView(
  message: string | null | undefined,
  opts?: { what?: string; recipient?: string },
): { tone: 'unknown' | 'failed'; text: string } {
  const m = String(message ?? '').trim();
  if (isUnknownSendReply(m)) return { tone: 'unknown', text: unknownSendText(opts) };
  if (/[\u0590-\u05FF]/.test(m)) return { tone: 'failed', text: m };
  return {
    tone: 'unknown',
    text: `לא התקבלה תשובה ברורה מהשרת — לא ידוע אם ${opts?.what ?? 'המייל'} יצא. `
      + `לפני ששולחים שוב — כדאי לברר עם ${opts?.recipient ?? 'הנמען'} אם קיבל אותו.`,
  };
}

/**
 * תשובת פונקציית מייל → «לא ידוע אם יצא»? מכיר את הקוד בגוף, את המשפט שהשרת מצרף
 * (כשמסך מקבל רק משפט — edgeFunctionError), ואת הקוד הישן resend_unreachable
 * (נפילת רשת בשרת שעוד לא עודכן) — שגם הוא אינו «לא נשלח».
 */
export function isUnknownSendReply(v: unknown): boolean {
  if (v === 'resend_unreachable') return true;
  if (isUnknownOutcome(v)) return true;
  return !!v && typeof v === 'object' && (v as { error?: unknown }).error === 'resend_unreachable';
}

// ─── התראות למשרד שלא יצאו (accountant_notifications.error) ────────────────

/**
 * ההתראה נשארה בלי הכרעה מהספק: unknown_outcome (נפילת רשת / 5xx / 2xx בלי מזהה),
 * in_flight (409 — ניסיון אחר באותו מפתח עוד בתנועה), או resend_unreachable מגרסה ישנה.
 * ‼ אלה «לא ידוע אם יצאה» — לא «לא נשלחה».
 */
export function isUnknownNotificationError(error: string | null | undefined): boolean {
  return /^(unknown_outcome|in_flight|resend_unreachable)\b/.test(String(error ?? '').trim());
}

/** שורת הכותרת של באנר ההתראות — כמה לא יצאו, וכמה לא ידוע אם יצאו. */
export function failedNotificationsHeadline(failed: number, unknown: number): string {
  const parts: string[] = [];
  if (failed > 0) parts.push(failed === 1 ? 'התראה אחת אליך לא נשלחה במייל' : `${failed} התראות אליך לא נשלחו במייל`);
  if (unknown > 0) {
    parts.push(unknown === 1
      ? 'לא ידוע אם התראה אחת אליך יצאה במייל'
      : `לא ידוע אם ${unknown} התראות אליך יצאו במייל`);
  }
  return parts.join(' · ');
}

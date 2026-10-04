// ─── לאן כל כפתור/קישור מוביל — מקור אחד לעורכי ההודעות ולתצוגות המקדימות ───
// ‼ כל יעד כאן נלקח מהקוד ששולח בפועל, לא מנוסח הכפתור:
//   · send-onboarding-email — onboard (‎?portal=‎ או ‎?onboard=‎), sign (‎?sign=‎),
//     ni_approve (NI_SITE), prerequisites (‎?participant=‎), active — בלי כפתור.
//   · send-step-email / send-process-open-email / representation-reminders —
//     הדף האישי (‎?portal=‎).
//   · ReleaseLetterDialog — ‎?release=‎ (רק כשהמכתב נשלח מתוך הבקשה).
//   · כרטיס האזור האישי — REP_PORTAL_CARD_FIXED.linkUrl (קבוע, לא נערך).
// ‼ קישור אישי נוצר בשליחה, לכל לקוח בנפרד. בעורך מוצגת דוגמה מסומנת בלבד —
// לעולם לא טוקן אמיתי, ולעולם לא של לקוח אחר.
import { REP_PORTAL_CARD_FIXED } from '../../../supabase/functions/_shared/repTemplates.ts';
import { NI_APPROVAL_SITE, NI_APPROVAL_SITE_LABEL } from '../../types';

export interface FixedDestination {
  kind: 'fixed';
  /** שם מובן — מה יש שם. */
  name: string;
  url: string;
  /** האם צריך להתחבר, ובמה. */
  access: string;
}

export interface PersonalDestination {
  kind: 'personal';
  name: string;
  /** הפרמטר בכתובת — ‎?portal=‎, ‎?sign=‎ וכו'. */
  param: 'portal' | 'onboard' | 'sign' | 'participant' | 'release';
  access: string;
  /** מתי היעד הזה (כשיש כמה). */
  when?: string;
}

export interface NoDestination { kind: 'none'; text: string }

export type LinkDestination = FixedDestination | PersonalDestination | NoDestination;

export const TAX_PERSONAL_AREA: FixedDestination = {
  kind: 'fixed',
  name: 'האזור האישי של רשות המסים',
  url: REP_PORTAL_CARD_FIXED.linkUrl,
  access: 'נדרשות כניסה והזדהות באתר רשות המסים. שם הלקוח מאשר את המייצג.',
};

export const NI_APPROVAL: FixedDestination = {
  kind: 'fixed',
  name: `${NI_APPROVAL_SITE_LABEL} · ביטוח לאומי`,
  url: NI_APPROVAL_SITE,
  access: 'בלי סיסמה: ת.ז., מספר האסמכתא מהמייל, והזדהות בכרטיס אשראי על שם המבוטח או בטלפון/מייל שמעודכנים בביטוח לאומי.',
};

export const CLIENT_PAGE: PersonalDestination = {
  kind: 'personal',
  name: 'הדף האישי של הלקוח',
  param: 'portal',
  access: 'קישור אישי וקבוע ללקוח — בלי סיסמה.',
};

/**
 * יעדי הכפתור בהודעות הייצוג (מזהי REP_MESSAGES).
 * ‼ «הייצוג פעיל» יוצא בלי כפתור — אלא אם המשרד כתב לו טקסט כפתור, ואז השרת
 * מצמיד לו את קישור הבקשה (send-onboarding-email: ctaHref = link).
 */
export function repMessageDestinations(id: string, ctaText?: string): LinkDestination[] {
  switch (id) {
    case 'onboard':
      return [
        { ...CLIENT_PAGE, when: 'כשללקוח יש הצעה מאושרת או תהליך פתוח' },
        { kind: 'personal', name: 'טופס בקשת הייצוג', param: 'onboard', access: 'קישור אישי לבקשה — בלי סיסמה.', when: 'בקשת ייצוג שנפתחה לבד, בלי הצעה ובלי תהליך' },
      ];
    case 'sign':
      return [{ kind: 'personal', name: 'דף החתימה על ייפוי הכוח', param: 'sign', access: 'קישור נפרד לכל חותם — בלי סיסמה.' }];
    case 'ni_approve':
      return [NI_APPROVAL];
    case 'prerequisites':
      return [{ kind: 'personal', name: 'טופס השלמת הפרטים החסרים', param: 'participant', access: 'רק השדות החסרים; תקף 14 יום — בלי סיסמה.' }];
    case 'active':
      return ctaText?.trim()
        ? [{ kind: 'personal', name: 'טופס בקשת הייצוג', param: 'onboard', access: 'קישור אישי לבקשה — בלי סיסמה.' }]
        : [{ kind: 'none', text: 'אין כפתור במייל הזה (טקסט הכפתור ריק).' }];
    case 'portal':
      return [TAX_PERSONAL_AREA];
    default:
      return [CLIENT_PAGE];
  }
}

/** יעד הכפתור במיילי הבקשות ובמכתב לרו״ח הקודם. */
export function stepEmailDestinations(key: string): LinkDestination[] {
  if (key === 'release_letter') {
    return [{ kind: 'personal', name: 'דף העברת החומרים לרו״ח הקודם', param: 'release', access: 'קישור אישי לבקשה הזו — בלי סיסמה. מצורף כשהמכתב נשלח מתוך הבקשה.' }];
  }
  // ‼ send-step-email: «תזכורת על בקשה» יוצאת רק לגורם חיצוני (רו״ח קודם או גורם אחר), ולגורם
  // חיצוני אין כפתור — הקישור הקבוע הוא הדף האישי של הלקוח, ואסור שיגיע לצד שלישי.
  if (key === 'step_reminder') return [{ kind: 'none', text: 'אין כפתור במייל הזה: הוא יוצא לגורם חיצוני, והקישור לדף של הלקוח לא נשלח אליו.' }];
  return [CLIENT_PAGE];
}

/**
 * טקסט הכפתור כפי שהשרת כותב אותו (send-step-email CTA_LABEL,
 * send-process-open-email). ‼ «תזכורת על בקשה» — בלי כפתור (לגורם חיצוני).
 */
export const STEP_EMAIL_CTA: Record<string, string> = {
  process_open: 'לדף האישי שלכם',
  documents_sent: 'לצפייה במסמכים בדף האישי',
  status_update: 'לדף האישי שלכם',
  intake_questionnaire: 'למילוי השאלון',
  paperless_invite: 'לפתיחת החשבון בפייפרלס',
  retainer_request: 'לאישור ההרשאה',
  release_letter: 'להעברת החומרים',
};

/** «gov.il», «b2b.btl.gov.il» — שם האתר בלי www, לקריאה מהירה. */
export function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** כתובת לדוגמה, מסומנת — בלי טוקן אמיתי. */
export function personalExample(host: string, param: PersonalDestination['param']): string {
  return `${host}/?${param}=`;
}

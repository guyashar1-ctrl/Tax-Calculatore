// ─── המגש: מה יוצא לבד, מתי, ומה מחכה לרו"ח ──────────────────────────────
// ‼ מודול טהור (בלי React ובלי supabase) — כדי שאפשר יהיה לבדוק את השורה.
// ‼ שלוש עובדות מהשרת (214) שהשורה לא משקרת עליהן:
//   1. המייל שיוצא לבד כולל רק פריטים של שלב «לבד» (delivery='auto') מריצה
//      שאינה בעצירה. בקשה ידנית, שלב «באישורך» וכל השאר — רק במייל שהרו"ח שולח.
//      תור קיים בלי פריט כזה ⇒ השרת מדלג עליו — לא מבטיחים כלום.
//   2. השעה בתור היא «לא לפני»: המייל יוצא בבדיקה המתוזמנת הבאה אחריה, ולא בה.
//      שעה שכבר עברה לא מוצגת.
//   3. התפיסה (claim_client_notice) מדלגת על התור גם כשאין כתובת מייל בכרטיס,
//      וגם כשיש מייל קודם מאותו סוג שלא ידוע אם יצא — אז אין «יישלח לבד», אלא הסיבה.

import { kindHoldPending } from '../../types/onboarding';

export const SEND_NOW_LABEL = 'שלח עכשיו';
export const SEND_MAIL_LABEL = 'שלח מייל…';

/** תור שלא יצא רבע שעה אחרי הזמן — המנגנון לא הצליח לבעוט בו. */
export const STALE_AFTER_MS = 15 * 60_000;

/**
 * אחרי «אל תשלח לבד». ‼ הביטול הוא של המייל הזה בלבד: אם ייפתח אחר כך עוד
 * משהו שיוצא לבד, המייל שלו יכלול גם את מה שנעצר כאן (214, השרת לוקח את כל
 * מה שבשלבי «לבד» ועוד לא נמסר).
 */
export const QUEUE_CANCELLED_TEXT =
  `לא יישלח עכשיו. הבקשות מחכות ל«${SEND_MAIL_LABEL}» — אבל אם ייפתח עוד משהו שיוצא לבד, הן ייכללו במייל שלו.`;

export const PAUSED_QUEUE_TEXT = 'המסלול בעצירה — המייל לא ייצא לבד. אפשר לשלוח בעצמך, אחרי סקירה.';

/** ‼ העובדה קודם, עם שם המסלול — בטלפון ההסבר נחתך אחרי שתי שורות. */
export function pausedQueueText(flowName?: string | null): string {
  const name = String(flowName ?? '').trim();
  return name ? `«${name}» בעצירה — המייל לא ייצא לבד. אפשר לשלוח בעצמך.` : PAUSED_QUEUE_TEXT;
}

/** אין כתובת בכרטיס — השרת ידלג על התור (no_email). */
export const NO_EMAIL_QUEUE_TEXT = `אין כתובת מייל בכרטיס — לא ייצא לבד. אחרי שתוסיפו כתובת אפשר לשלוח ב«${SEND_MAIL_LABEL}».`;

/** מייל קודם מאותו סוג שלא ידוע אם יצא — השרת ידלג על התור (unknown_pending). */
export const UNKNOWN_PENDING_QUEUE_TEXT =
  'יש מייל קודם שלא ידוע אם יצא — עד שמכריעים עליו בשורה «לא ידוע אם יצא המייל», לא ייצא לבד.';

/**
 * מייל «חדש» קודם שלא ידוע אם יצא. ‼ השרת מסרב לכל מייל «חדש» נוסף — גם לזה שהרו"ח שולח
 * (214, unknown_pending) — ולכן אין «שלח מייל…» בשורה: קודם מכריעים. השורה שלו מוצגת מעל
 * (NoticeTray). ההוראות לביטוח לאומי הן מייל אחר, והן לא מחכות.
 * ‼ קצר — בטלפון ההסבר נחתך אחרי שתי שורות.
 */
export function unknownBlocksNewText(withNi: boolean): string {
  return withNi
    ? 'מייל חדש — רק אחרי ההכרעה על המייל הקודם, בשורה שמעל. את ההוראות לביטוח לאומי אפשר לשלוח עכשיו.'
    : 'קודם מכריעים על המייל הקודם, בשורה שמעל — עד אז לא יוצא מייל חדש.';
}

/** רק ההוראות לביטוח לאומי — מייל ייעודי, לא «מה שחדש בדף». */
export const NI_ONLY_WHY = 'מייל ייעודי עם ההוראות לאישור בביטוח לאומי. רואים אותו לפני שהוא יוצא.';

export interface TrayQueueInput {
  items: readonly { stepId: string; delivery?: string; title?: string | null }[];
  queued: { dueAt: string; kickAttempts?: number } | null | undefined;
  pausedStepIds: ReadonlySet<string>;
  now: number;
  /** יש כתובת מייל בכרטיס (ready.owner.email). */
  hasEmail: boolean;
  /** יש מייל קודם מסוג התור שלא ידוע אם יצא (ready.owner.unknown). */
  unknownPending: boolean;
}

export interface TrayQueueLine {
  /** יש מייל שיוצא לבד — הכפתור הוא «שלח עכשיו», ויש «אל תשלח לבד». */
  live: boolean;
  /** ההסבר בשורה; null — אין מה לומר על התור (המגש מציג את ההסבר הרגיל). */
  why: string | null;
  /** כמה מהפריטים החדשים ייכללו במייל שיוצא לבד. */
  autoCount: number;
  /** כמה מחכים למייל שהרו"ח שולח. */
  waitingCount: number;
  /** המייל שהיה יוצא לבד מוחזק כי המסלול בעצירה — השורה מקשרת לחידוש. */
  paused?: boolean;
}

// ─── «חסר סוג העוסק» — בקשות שמחכות לסוג העוסק (engagements.kind_hold) ─────────
// ‼ סוג עוסק לא ידוע לעולם לא נהיה «עוסק מורשה» בשקט: מה שתלוי בסוג לא נוצר
// (מוחזק), וכל השאר נפתח. כשסוג העוסק נקבע בתיק המס («פרטי הנישום») השרת פותח את
// מה שחיכה — רק מה שמתאים לסוג. השורה אומרת מה מחכה, ולמה, וכפתור אחד למקום שבו קובעים.

export const KIND_FIELD_LABEL = 'לקביעת סוג העוסק';
export const KIND_RETRY_LABEL = 'לפתוח את הבקשות שחיכו';

/** מה המגש צריך מ-kind_hold — חלק מ-KindHold (types/onboarding, engagement.kindHold); צורה חלקית מספיקה. */
export interface KindHoldLike {
  held?: { title?: string | null; stepType?: string }[] | null;
  resolvedAt?: string | null;
  failedAt?: string | null;
}

export interface KindHoldRow {
  title: string;
  why: string;
  /** השחרור נכשל אחרי שסוג העוסק נקבע — הכפתור הוא «לפתוח את הבקשות שחיכו». */
  failed: boolean;
  button: string;
}

const listTitles = (titles: string[]) => {
  const shown = titles.slice(0, 3).map(t => `«${t}»`);
  const rest = titles.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} ועוד ${rest}`;
  return shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} ו${shown[shown.length - 1]}`;
};

/** השורה במגש. null — אין מה לומר (אין החזקה, או שכבר נפתח). */
export function kindHoldRow(h: KindHoldLike | null | undefined, firstName: string): KindHoldRow | null {
  // ‼ «ממתינה» — אותו כלל בכל המסכים (types/onboarding): יש החזקה בלי resolvedAt.
  if (!kindHoldPending(h)) return null;
  const titles = (h.held ?? []).map(x => String(x.title ?? '').trim()).filter(Boolean);
  const n = (h.held ?? []).length;
  const list = listTitles(titles);
  if (h.failedAt) {
    return {
      failed: true, button: KIND_RETRY_LABEL,
      title: 'סוג העוסק נקבע, אבל הבקשות שחיכו לו לא נפתחו',
      why: `${list ? `${list} — ` : ''}אפשר לפתוח אותן עכשיו. ייפתח רק מה שמתאים לסוג העוסק שנקבע.`,
    };
  }
  const which = `עוסק פטור, עוסק מורשה או חברה`;
  if (n === 0) {
    return {
      failed: false, button: KIND_FIELD_LABEL,
      title: `חסר סוג העוסק של ${firstName}`,
      why: `עד שיודעים אם ${firstName} ${which} — הקליטה לא נסגרת.`,
    };
  }
  return {
    failed: false, button: KIND_FIELD_LABEL,
    // ‼ כותרת קצרה (בטלפון): השם — בהסבר שמתחת.
    title: n === 1 ? 'חסר סוג העוסק — בקשה אחת מחכה לו' : `חסר סוג העוסק — ${n} בקשות מחכות לו`,
    why: `${list || (n === 1 ? 'הבקשה' : 'הבקשות')} ${n === 1 ? 'נפתחת' : 'נפתחות'} רק אחרי שיודעים אם ${firstName} ${which}. שאר הבקשות לא מחכות לזה.`,
  };
}

/** אחרי «לפתוח את הבקשות שחיכו» — מה השרת אמר (retry_kind_hold). */
export function kindHoldRetryText(
  r: { ok?: boolean; created?: number; notApplicable?: number; error?: string },
  errorText: (code: string | undefined) => string,
): { text: string; err: boolean } {
  if (r.ok === false || r.error) return { text: errorText(r.error), err: true };
  const created = r.created ?? 0;
  if (created === 1) return { text: 'נפתחה בקשה אחת שחיכתה לסוג העוסק — היא ברשימה.', err: false };
  if (created > 1) return { text: `נפתחו ${created} בקשות שחיכו לסוג העוסק — הן ברשימה.`, err: false };
  if ((r.notApplicable ?? 0) > 0) return { text: 'אף אחת מהבקשות שחיכו לא מתאימה לסוג העוסק שנקבע — לא נפתח דבר.', err: false };
  return { text: 'לא נפתח דבר — הרשימה נטענת מחדש.', err: false };
}

/** שעה:דקה בשעון המקומי. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function trayQueueLine({ items, queued, pausedStepIds, now, hasEmail, unknownPending }: TrayQueueInput): TrayQueueLine {
  const auto = items.filter(i => i.delivery === 'auto' && !pausedStepIds.has(i.stepId));
  const waitingCount = items.length - auto.length;
  if (!queued || items.length === 0) return { live: false, why: null, autoCount: 0, waitingCount: items.length };

  if (auto.length === 0) {
    const autoPaused = items.some(i => i.delivery === 'auto' && pausedStepIds.has(i.stepId));
    return { live: false, why: autoPaused ? PAUSED_QUEUE_TEXT : null, autoCount: 0, waitingCount, ...(autoPaused ? { paused: true } : {}) };
  }

  // ‼ השרת ידלג על התור — לא מבטיחים, ואומרים למה.
  if (!hasEmail) return { live: false, why: NO_EMAIL_QUEUE_TEXT, autoCount: auto.length, waitingCount };
  if (unknownPending) return { live: false, why: UNKNOWN_PENDING_QUEUE_TEXT, autoCount: auto.length, waitingCount };

  const due = Date.parse(queued.dueAt);
  const attempts = queued.kickAttempts ?? 0;
  if (attempts >= 5 || (Number.isFinite(due) && due < now - STALE_AFTER_MS)) {
    return {
      live: false,
      why: `לא יצא לבד${attempts ? ` (${attempts} ניסיונות)` : ''} — אפשר לשלוח עכשיו.`,
      autoCount: auto.length, waitingCount,
    };
  }

  const before = Number.isFinite(due) && now < due;
  const when = before ? `בדקות הקרובות (לא לפני ${clockTime(queued.dueAt)})` : 'בדקות הקרובות';
  // הכול יוצא לבד — המשפט הוא על המייל (אחד); אחרת — מה מהפריטים בו.
  if (waitingCount === 0) {
    return { live: true, why: `${before ? 'יישלח לבד' : 'ייצא לבד'} ${when}.`, autoCount: auto.length, waitingCount };
  }
  const one = auto.length === 1;
  const verb = before ? (one ? 'יישלח לבד' : 'יישלחו לבד') : (one ? 'ייצא לבד' : 'ייצאו לבד');
  // ‼ מה יוצא לבד — בשם, כשזה פריט אחד (שם קצר: בטלפון ההסבר נחתך אחרי שתי שורות).
  const autoTitle = one ? String(auto[0].title ?? '').trim() : '';
  const who = one ? (autoTitle ? `«${autoTitle.length > 20 ? `${autoTitle.slice(0, 19)}…` : autoTitle}»` : 'אחד') : String(auto.length);
  // ‼ השאר מחכים למייל שהרו"ח שולח — לא «מחכים ל«שלח עכשיו»»: אחרי שהמייל האוטומטי יוצא
  // הכפתור הוא «שלח מייל…», והם עדיין מחכים. ‼ קצר: בטלפון ההסבר נחתך אחרי שתי שורות —
  // ולכן כשיש שעה, בלי «בדקות הקרובות».
  const whenShort = before ? `, לא לפני ${clockTime(queued.dueAt)}` : ' בדקות הקרובות';
  return { live: true, why: `${who} ${verb}${whenShort}; השאר — במייל שתשלח.`, autoCount: auto.length, waitingCount };
}

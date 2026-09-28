// ─── מרכז ביצוע הייצוג — הכללים שקובעים מה מוצג, איפה, ובאיזה צבע ────────────
//
// ‼ למה הקובץ הזה קיים (24.09.2026): אותם שלושה באגים חזרו שוב ושוב, כל פעם
// בפיצ'ר אחר, כי כל עמודה במסך החליטה לבד:
//   1. **פעולה כפולה** — «בדוק קבלת הייצוג» הופיע שלוש פעמים באותו מסך
//      (ראש עמודת מס הכנסה, בתוך שלב 7, ראש עמודת ב״ל של בן הזוג).
//   2. **מצב ישן ליד מצב סופי** — «המועד עבר, יש להזין מחדש בב״ל» ליד
//      «אושר - הייצוג בב״ל פעיל».
//   3. **מידע סביל בצבע של פעולה** — הודעת מועד על רקע ורדרד, כמו כפתור
//      אוטומציה.
// לכן ההחלטות האלה יושבות כאן, כפונקציות טהורות שנבדקות, והמסך רק מצייר.
//
// ‼ שלושת הכללים:
//   · **יישוב מול הרשויות הוא פעולה של המרכז, לא של עמודה.** פעולת «בדוק»
//     (שע״ם 'check', ב״ל 'check_btl') לעולם לא מצוירת בעמודה או בשלב — יש
//     לה כפתור אחד ליד כותרת המרכז (RepresentationReconcileButton).
//   · **סדר קדימות:** סופי (פעיל/אושר) > מצב נוכחי שדורש פעולה > היסטוריה
//     (מועד שעבר, הוראות ביניים). מצב סופי משתיק כל אזהרת ביניים.
//   · **ורוד שמור לפעולת אוטומציה** (`btn-automation`). הודעה — מידע, אזהרה,
//     פעולה נדרשת — מקבלת NoticeTone, ואף אחד מהם אינו ורוד.

import type { NiExternalState, NiTracking } from '../../types';
import type { NiRepresentationLine } from '../../utils/niPersons';
import {
  shaamLifecycle, shaamProgressLine, shaamDocumentsInShaam, type ShaamRequestTracking, type ShaamRequiredDocument, type ShaamSystemKey,
} from './shaamRepresentation';

// ── 1. צבע: הודעה אינה פעולה ────────────────────────────────────────────────

/**
 * סוגי ההודעות במרכז. ‼ אין כאן 'automation': ורוד הוא לכפתור שמריץ
 * אוטומציה בלבד, ולכן הודעה לא יכולה לבחור בו גם בטעות.
 */
export type NoticeTone = 'info' | 'warning' | 'required' | 'danger' | 'success' | 'muted';

export interface NoticeStyle {
  background: string;
  color: string;
  border?: string;
  borderInlineStart?: string;
  fontWeight?: number;
}

/**
 * הטוקנים של כל סוג. ‼ רק טוקנים קיימים מ-index.css, ואף אחד מהם אינו
 * `--automation-*`. גם «שגיאה» אינה מילוי ורדרד (`--err-bg` קרוב מדי
 * לוורוד של האוטומציה): היא טקסט בצבע סכנה עם קו בצד.
 */
export const NOTICE_STYLES: Record<NoticeTone, NoticeStyle> = {
  info: { background: 'var(--surface-2)', color: 'var(--ink-3)' },
  muted: { background: 'transparent', color: 'var(--ink-4)' },
  warning: { background: 'var(--warn-bg)', color: 'var(--ink-1)' },
  required: {
    background: 'var(--warn-bg)', color: 'var(--ink-1)',
    border: '1px solid var(--chip-orange-bd)', fontWeight: 500,
  },
  danger: { background: 'transparent', color: 'var(--danger)', borderInlineStart: '3px solid var(--danger)' },
  success: { background: 'transparent', color: 'var(--success-text)' },
};

// ── 2. יישוב מול הרשויות: פעולה אחת, של המרכז ───────────────────────────────

/** האם הפעולה היא «בדוק קבלת הייצוג» — קריאה חוזרת, לא צעד בתהליך. */
export function isReconcileAction(kind: string | undefined | null): boolean {
  return kind === 'check' || kind === 'check_btl';
}

/**
 * הפעולה שמותר לצייר בראש עמודה. ‼ יישוב לעולם לא — יש לו כפתור מרכזי.
 * כך פיצ'ר עתידי שמוסיף «בדוק» לרשות חדשה לא יוליד כפתור שני.
 */
export function columnAction<T extends { kind: string; disabled?: boolean }>(action: T | null | undefined): T | null {
  if (!action || isReconcileAction(action.kind)) return null;
  return action;
}

// ── 3. ביטוח לאומי: קדימות סופי > נוכחי > היסטורי ──────────────────────────

/** ימים עד המועד (שלילי = עבר). `today` מוזרק כדי שייבדק. */
export function daysUntil(deadline?: string, today: Date = new Date()): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

export interface NiTrackView {
  /** הייצוג בב״ל פעיל לאדם הזה — מצב סופי. */
  final: boolean;
  /** הודעת המועד, רק כשהיא עדיין רלוונטית. סופי ⇒ null, תמיד. */
  deadlineNotice: { tone: NoticeTone; text: string } | null;
  /** טופס עריכת אסמכתא/מועד — פעולת ביניים; במצב סופי מוצג כעובדה. */
  editableReference: boolean;
  /** מה שב״ל אמרה בקריאה האחרונה — רק כשזה עוד רלוונטי (לא סופי). */
  showExternalEvidence: boolean;
  /** «סמן כאושר» — גיבוי ידני, רק כשלא סופי. */
  showManualConfirm: boolean;
}

/**
 * מה מסלול ב״ל של אדם אחד מציג עכשיו.
 * ‼ «סופי» = `confirmedAt` על המסלול, **או** הראיה של הכרטיס (`line.kind ===
 * 'active'`, למשל שורת תיק ב״ל במצב פעיל). אחד מהם מספיק: כשב״ל כבר פעיל,
 * מועד שעבר הוא היסטוריה, ו«יש להזין מחדש» הוא הוראה לעשות שוב משהו שכבר הצליח.
 * ‼ הנתונים עצמם (אסמכתא, מועד) לא נמחקים — רק לא מוצגים כהוראה.
 */
export function niTrackView(ni: NiTracking, line?: Pick<NiRepresentationLine, 'kind'> | null, today: Date = new Date()): NiTrackView {
  const final = !!ni.confirmedAt || line?.kind === 'active';
  if (final) {
    return { final, deadlineNotice: null, editableReference: false, showExternalEvidence: false, showManualConfirm: false };
  }
  const left = ni.referenceNumber ? daysUntil(ni.deadline, today) : null;
  const deadlineNotice = left === null ? null
    : left < 0 ? { tone: 'warning' as const, text: `המועד לאישור עבר לפני ${Math.abs(left)} ימים - יש להזין מחדש בב״ל` }
    : left <= 14 ? { tone: 'warning' as const, text: `נותרו ${left} ימים לאישור` }
    : { tone: 'info' as const, text: `נותרו ${left} ימים לאישור` };
  return { final, deadlineNotice, editableReference: true, showExternalEvidence: true, showManualConfirm: true };
}

// ── 4. שע״ם: מה נכנס לשלב 6 («נשלח לשע״ם») ─────────────────────────────────

export interface ShaamSubmittedFacts {
  /** חסר ⇒ הוגש מחוץ ל-PIVO (שע״ם אומרת שהמסמכים אצלה). */
  submittedAt?: string;
  submittedOutside: boolean;
  /** «סטטוס בשע״ם» — במילים של שע״ם. null ⇒ שע״ם עוד לא מסרה מצב. */
  status: string | null;
  /** צפי סיום ההשהייה (ISO), רק ממקור של שע״ם ורק כשההשהייה רלוונטית. */
  suspensionEndsAt?: string;
  /** הלקוח חייב לאשר («ממתין לאישור לקוח») — פעולה נדרשת, לא מידע. */
  clientApprovalRequired: boolean;
  /** כל המערכים נקלטו — שלב 7 הושלם. */
  final: boolean;
  requiredDocuments: ShaamRequiredDocument[];
  /** 28.09 · מערכים שאין להם תיק — ייקלטו מעצמם אם ייפתח תיק (עם אפשרות להסיר מהבקשה). */
  missingFileSystems: { label: string; authority?: ShaamSystemKey; deadline?: string }[];
  /** 28.09 · מה שהמשרד צריך לעשות (טעינה חוזרת, ביטול עם סיבה). */
  officeAction?: string;
  /** 28.09 · שורה קצרה על מצב שאין לו פעולה (השהיית מטה, ביטול+סיבה). */
  note?: string;
}

/**
 * העובדות של הגשה שכבר נשלחה — שלוש שורות, בלי פרוזה. null ⇒ לא נשלחה.
 * ‼ מקור אחד: shaamLifecycle (שעושה כבר את ההכרעה «קריאה מלפני ההגשה אינה
 * מצב»). כאן רק בוחרים מה מוצג.
 */
export function shaamSubmittedFacts(t: ShaamRequestTracking | undefined): ShaamSubmittedFacts | null {
  if (!t || (!t.submittedAt && !shaamDocumentsInShaam(t))) return null;
  const l = shaamLifecycle(t);
  const final = l.ball === 'done';
  const states = l.systems.map(s => s.raw).filter(Boolean);
  const distinct = [...new Set(states)];
  let status: string | null;
  if (final) status = distinct[0] ?? 'נקלט בהצלחה';
  else if (distinct.length === 1 && states.length === l.systems.length) status = distinct[0];
  else if (distinct.length > 0) status = l.systems.map(s => `${s.label}: ${s.raw || 'טרם עודכן'}`).join(' · ');
  else if (l.requestStateRaw) status = l.requestStateRaw;
  // ‼ לפני קריאה מהרשימה: מה ששע״ם עצמה כתבה במסך אישור הקליטה.
  else if (!l.reconciled && /השהי/.test(t.submissionConfirmation?.text ?? '')) status = 'השהייה';
  else status = null;
  const suspended = !final && (l.systems.some(s => s.state === 'suspended') || (!l.reconciled && status === 'השהייה'));
  const stoppedWithReason = l.systems.find(s => (s.state === 'cancelled' || s.state === 'rejected') && s.cancelReason);
  return {
    submittedAt: t.submittedAt,
    submittedOutside: !t.submittedAt,
    status,
    suspensionEndsAt: suspended ? l.nextMilestone?.date : undefined,
    clientApprovalRequired: !!l.clientAction,
    final,
    requiredDocuments: l.requiredDocuments,
    missingFileSystems: l.systems.filter(s => s.missingFile).map(s => ({ label: s.label, authority: s.authority, deadline: s.fileOpeningDeadline })),
    officeAction: l.officeAction,
    note: stoppedWithReason ? `${stoppedWithReason.label}: ${stoppedWithReason.cancelReason}`
      : l.systems.some(s => s.state === 'authority_review') ? 'בבדיקה פרטנית של מרשם המייצגים - אין מועד ידוע' : undefined,
  };
}

// ── 5. «בדוק קבלת הייצוג»: מה נאמר מתחת לכפתור ─────────────────────────────
//
// ‼ 27.09.2026 (עידן רוקח): כל בדיקה שהצליחה הוצגה כ«נבדק» — בלי לומר מה
// נמצא. התשובה («ממתין לאישור») נקברה בשלב 4, והרו"ח ראה כפתור שרץ ונגמר
// בלי תוצאה. עכשיו השורה מתחת לכפתור היא התוצאה עצמה, במשפט אחד.
// ‼ המקור הוא הנתון השמור (מה שהטריגר בשרת כתב), לא זיכרון הדפדפן — כדי
// שהשורה תישאר גם אחרי רענון, יחד עם שעת הבדיקה.

export interface ReconcileLine {
  text: string;
  tone: NoticeTone;
  /** מתי נקראה הרשות (ISO) — כדי לדעת אם השורה כבר משקפת בדיקה שרצה עכשיו. */
  at: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 23.11.2026 — כמו בשאר המרכז. ‼ תאריך בלבד (YYYY-MM-DD) נקרא כיום מקומי, לא UTC. */
function dayText(dateish: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateish);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateish);
  return isNaN(d.getTime()) ? dateish : `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/** «נבדק היום 15:47» / «נבדק 26.9.2026 15:47». */
export function checkedAtText(iso: string, today: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'נבדק';
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return sameDay(d, today) ? `נבדק היום ${time}` : `נבדק ${dayText(iso)} ${time}`;
}

const NI_STATES: readonly NiExternalState[] = ['approved', 'pending', 'expired', 'cancelled', 'unknown', 'not_found'];

/**
 * ההוראות (אסמכתא + מועד) הגיעו למבוטח — אותו תנאי כמו שלב 3 במרכז.
 * ‼ בלי האסמכתא אין למבוטח מה לאשר בב״ל, ולכן «ממתין לאישור המבוטח» לפני
 * שהן יצאו מתאר את הסיבה הלא נכונה (27.09.2026, עידן רוקח).
 */
export function niInstructionsDelivered(ni: Pick<NiTracking, 'instructionsSentAt' | 'instructionsSentWith'>): boolean {
  return ni.instructionsSentWith === 'signature' || !!ni.instructionsSentAt;
}

const INSTRUCTIONS_NOT_SENT = 'ההוראות לאישור עוד לא נשלחו למבוטח';

/**
 * התוצאה האחרונה מול ב״ל, מהנתון השמור. null ⇒ עוד לא נבדק מול ב״ל (ואין
 * סיבה אחרת לומר משהו).
 * ‼ 'unknown' לעולם אינו «אושר» — רק מצטט את מה שב״ל הציגה.
 * ‼ סדר: מה שב״ל אמרה (אושר/פג/בוטל/לא נמצא) > המועד עבר > ההוראות לא יצאו >
 * ממתין לאישור.
 */
export function niReconcileLine(
  ni: Pick<NiTracking, 'externalState' | 'rawExternalState' | 'syncedAt' | 'deadline' | 'referenceNumber'
    | 'instructionsSentAt' | 'instructionsSentWith'>,
  today: Date = new Date(),
): ReconcileLine | null {
  const delivered = niInstructionsDelivered(ni);
  if (!ni.syncedAt || !ni.externalState) {
    // ‼ עוד לא נבדק, אבל יש מה לומר: למה עדיין אין טעם לבדוק.
    return ni.referenceNumber && !delivered
      ? { text: `${INSTRUCTIONS_NOT_SENT} - עד אז אין לו מה לאשר`, tone: 'required', at: '' }
      : null;
  }
  const when = ` · ${checkedAtText(ni.syncedAt, today)}`;
  const at = ni.syncedAt;
  switch (ni.externalState) {
    case 'approved':
      return { text: `אושר - הייצוג בב״ל פעיל${when}`, tone: 'success', at };
    case 'pending': {
      // ‼ «ממתין עד 20.9» כשהיום כבר 27.9 אינו מצב — המועד עבר (כמו niTrackView).
      const left = daysUntil(ni.deadline, today);
      if (left !== null && left < 0) {
        return { text: `טרם אושר - המועד לאישור עבר ב-${dayText(ni.deadline!)}${when}`, tone: 'warning', at };
      }
      if (!delivered) return { text: `טרם אושר - ${INSTRUCTIONS_NOT_SENT}${when}`, tone: 'required', at };
      return {
        text: `טרם אושר - ממתין לאישור המבוטח${ni.deadline ? ` עד ${dayText(ni.deadline)}` : ''}${when}`,
        tone: 'required', at,
      };
    }
    case 'expired':
      return { text: `פג תוקף - צריך להזין מחדש בב״ל${when}`, tone: 'warning', at };
    case 'cancelled':
      return { text: `הרישום בוטל בב״ל${when}`, tone: 'warning', at };
    case 'not_found':
      return {
        text: `לא נמצא בב״ל רישום${ni.referenceNumber ? ` לאסמכתא ${ni.referenceNumber}` : ''}${when}`,
        tone: 'warning', at,
      };
    default:
      return {
        text: `ב״ל מציגה «${ni.rawExternalState?.trim() || '—'}» - מצב שלא זוהה${when}`,
        tone: 'warning', at,
      };
  }
}

/**
 * אותה שורה, ישר מתוצאת המשימה שהסתיימה — לפני שהנתון השמור נטען מחדש.
 * ‼ אותו נרמול כמו הטריגר בשרת (195): מצב שאינו ברשימה הסגורה ⇒ 'unknown',
 * ומועד/אסמכתא שלא הגיעו לא מוחקים את השמורים.
 */
export function niReconcileLineFromJob(
  result: unknown, finishedAt: string | undefined, prev: NiTracking, today: Date = new Date(),
): ReconcileLine | null {
  const r = (result ?? {}) as { status?: string; rawStatus?: string | null; deadline?: string | null; referenceNumber?: string | null };
  const state = NI_STATES.find(s => s === r.status) ?? 'unknown';
  return niReconcileLine({
    ...prev,
    externalState: state,
    rawExternalState: r.rawStatus ?? undefined,
    deadline: r.deadline || prev.deadline,
    referenceNumber: r.referenceNumber || prev.referenceNumber,
    syncedAt: finishedAt || new Date().toISOString(),
  }, today);
}

/**
 * התוצאה האחרונה מול שע״ם — אותו משפט שהמרכז כבר אומר (shaamProgressLine),
 * עם שעת הבדיקה. null ⇒ עוד לא נבדק, או שהקריאה היחידה קדמה להגשה (אז היא
 * לא מתארת את המצב של עכשיו — ראה shaamLifecycle).
 */
export function shaamReconcileLine(t: ShaamRequestTracking | undefined, today: Date = new Date()): ReconcileLine | null {
  if (!t?.syncedAt) return null;
  if (t.submittedAt && !shaamLifecycle(t).reconciled) return null;
  const line = shaamProgressLine(t);
  const tone: NoticeTone = line.ball === 'done' ? 'success'
    : line.ball === 'client' ? 'required'
    : line.ball === 'office' ? 'warning'
    : 'info';
  return { text: `${line.text.replace(/\.$/, '')} · ${checkedAtText(t.syncedAt, today)}`, tone, at: t.syncedAt };
}

/**
 * הכפתור «שקט» (מסגרת ורודה בלי מילוי) כשאף אחת מהבדיקות לא צפויה לשנות
 * משהו עכשיו — למשל ההוראות עוד לא יצאו למבוטח. ‼ עדיין ורוד (אוטומציה)
 * ועדיין לחיץ: אולי המבוטח קיבל את האסמכתא בטלפון. רק לא מושך את העין
 * מהפעולה שבאמת תקדם את העניין.
 */
export function reconcileIsPremature(targets: { premature?: boolean }[]): boolean {
  return targets.length > 0 && targets.every(t => !!t.premature);
}

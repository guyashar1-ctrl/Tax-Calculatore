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

import type { NiTracking } from '../../types';
import type { NiRepresentationLine } from '../../utils/niPersons';
import {
  shaamLifecycle, type ShaamRequestTracking, type ShaamRequiredDocument,
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
  submittedAt: string;
  /** «סטטוס בשע״ם» — במילים של שע״ם. null ⇒ שע״ם עוד לא מסרה מצב. */
  status: string | null;
  /** צפי סיום ההשהייה (ISO), רק ממקור של שע״ם ורק כשההשהייה רלוונטית. */
  suspensionEndsAt?: string;
  /** הלקוח חייב לאשר («ממתין לאישור לקוח») — פעולה נדרשת, לא מידע. */
  clientApprovalRequired: boolean;
  /** כל המערכים נקלטו — שלב 7 הושלם. */
  final: boolean;
  requiredDocuments: ShaamRequiredDocument[];
}

/**
 * העובדות של הגשה שכבר נשלחה — שלוש שורות, בלי פרוזה. null ⇒ לא נשלחה.
 * ‼ מקור אחד: shaamLifecycle (שעושה כבר את ההכרעה «קריאה מלפני ההגשה אינה
 * מצב»). כאן רק בוחרים מה מוצג.
 */
export function shaamSubmittedFacts(t: ShaamRequestTracking | undefined): ShaamSubmittedFacts | null {
  if (!t?.submittedAt) return null;
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
  return {
    submittedAt: t.submittedAt,
    status,
    suspensionEndsAt: suspended ? l.nextMilestone?.date : undefined,
    clientApprovalRequired: !!l.clientAction,
    final,
    requiredDocuments: l.requiredDocuments,
  };
}

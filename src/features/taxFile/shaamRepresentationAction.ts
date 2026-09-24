// ─── תא הפעולה ההקשרית של מס הכנסה/שע״ם (פרק 17) ─────────────────────────────
// ‼ פונקציה טהורה אחת לשני המשטחים — תיק המס (client.representationStatus)
// ומרכז ביצוע הייצוג (request.status) — כדי שהתווית לא תסטה ביניהם.
// ‼ הפעולה נגזרת משני דברים בלבד: סטטוס הבקשה, ומצב האינטגרציה שנשמר
// בפועל (`execution.shaam[key]`). לא ממציאים «נשלח לשע״ם» בלי ראיה —
// `submittedAt` נכתב רק אחרי אישור קליטה מהרשות (194).
//
// ‼ 24.09.2026 · החוזה: **שלב** אחד נגזר (shaamLifecycleStage), והפעולה נגזרת
// ממנו. ארבעה דברים שונים ואסור לערבב ביניהם:
//   1. מחשב האוטומציה דולק/כבוי        — useShaamReadiness.workerOffline
//   2. שע״ם מחוברת/לא                    — useAutomationGate.ready
//   3. מערכת הייצוג נבדקה/טרם נבדקה      — useAutomationGate.unverified
//   4. איפה ההגשה במחזור החיים           — כאן, ורק כאן
// 1–3 הם תנאי-קדם להרצה (צבע הכפתור, מה קורה בלחיצה). הם **לא** משנים את
// הפעולה העסקית שמוצעת. ובאותו אופן «טרם נבדק אם כבר קיימת בקשה» אינו שלב:
// הבדיקה הזאת קורית בתוך «הזן ייפוי כוח בשע״ם», בעובד, לפני כל נגיעה (202).

import type { RepresentationStatus } from '../../types';
import type { ShaamRequestTracking } from '../representation/shaamRepresentation';
import { allSystemsAccepted, shaamRequestExists, shaamRowsFormOneRequest } from '../representation/shaamRepresentation';
import {
  SHAAM_CREATE_REPRESENTATION_ACTION_TYPE,
  SHAAM_SUBMIT_POA_ACTION_TYPE,
  SHAAM_CHECK_REPRESENTATION_ACTION_TYPE,
} from '../../types/automation';

export type ShaamActionKind = 'create' | 'submit' | 'check' | 'none';

export interface ShaamRepresentationAction {
  kind: ShaamActionKind;
  label: string;
  /** ה-action_type של משימת האוטומציה, וגם מפתח ה-capability. */
  actionType: string;
  /** כשהפעולה אינה זמינה — משפט אחד שמסביר למה, ל-title. */
  reason?: string;
  /** הפעולה מושבתת (ולא רק «צריך חיבור») — למשל טופס שטרם הוחתם. */
  disabled?: boolean;
}

/**
 * איפה ההגשה במחזור החיים מול שע״ם.
 *   not_started        · אין שום עדות לבקשה ⇒ «הזן ייפוי כוח בשע״ם»
 *                        (שבודק בעצמו שאין כבר בקשה, ולא יוצר כפולה).
 *   signatures_pending · יש בקשה בשע״ם (נוצרה כאן, או נמצאה שם) והטופס טרם
 *                        נחתם והוחתם ⇒ השלב הבא הוא החתימה, והשידור מושבת.
 *   signed_ready       · יש בקשה והטופס חתום ומוחתם ⇒ «שלח טופס חתום».
 *   ambiguous          · השורות שנמצאו אינן בקשה אחת ⇒ לא משדרים.
 *   submitted          · נשלח (או סומן ידנית כנשלח) ⇒ רק קריאת מצב.
 *   waiting_client     · שע״ם: «ממתין לאישור לקוח» ⇒ הלקוח חייב לאשר.
 *   active             · הכול נקלט / הייצוג פעיל ⇒ סופי, גובר על כל השאר.
 */
export type ShaamLifecycleStage =
  | 'not_started' | 'signatures_pending' | 'signed_ready' | 'ambiguous'
  | 'submitted' | 'waiting_client' | 'active';

export function shaamLifecycleStage(
  status: RepresentationStatus | null | undefined,
  tracking?: ShaamRequestTracking,
  stamped?: boolean,
): ShaamLifecycleStage | null {
  if (!status) return null;
  // ‼ סופי גובר: מה שהסטטוס אומר, או מה ששע״ם אמרה על כל המערכים.
  if (status === 'active' || allSystemsAccepted(tracking)) return 'active';
  if (tracking?.submittedAt) return tracking.clientApprovalRequiredAt ? 'waiting_client' : 'submitted';
  // ‼ «ממתין לרשויות» בלי שום עדות מהאינטגרציה = סומן ידנית כנשלח (או משטח
  // שלא מקבל את מצב שע״ם, כמו תיק המס). זה לעולם לא «טרם הוזן».
  if (!shaamRequestExists(tracking)) return status === 'awaiting_authorities' ? 'submitted' : 'not_started';
  // ‼ נמצאה בלי מספר בקשה (הדסה סלע, 23.09.2026) — השידור מאתר אותה לפי ישות
  // + שם, ולכן השורות חייבות לתאר בקשה אחת. מערך כפול = שתי בקשות.
  if (!tracking?.requestNumber && !shaamRowsFormOneRequest(tracking)) return 'ambiguous';
  if (stamped) return 'signed_ready';
  // סומן ידנית כ«נשלח» בלי שהאוטומציה שידרה — עדיין אפשר לבדוק מצב.
  if (status === 'awaiting_authorities') return 'submitted';
  return 'signatures_pending';
}

const CHECK = { kind: 'check' as const, label: 'בדוק קבלת הייצוג', actionType: SHAAM_CHECK_REPRESENTATION_ACTION_TYPE };
const SUBMIT = { kind: 'submit' as const, label: 'שלח טופס חתום לשע״ם', actionType: SHAAM_SUBMIT_POA_ACTION_TYPE };
export const SHAAM_ENTER_LABEL = 'הזן ייפוי כוח בשע״ם';

/**
 * @param status סטטוס בקשת הייצוג (או `client.representationStatus`).
 * @param tracking מצב ההגשה בשע״ם, כשידוע. חסר ⇒ טרם נפתחה בקשה.
 * @param stamped כל טופסי הבקשה נחתמו והוטבעה עליהם חותמת — התנאי לשידור.
 * ‼ 'check' הוא יישוב (קריאה חוזרת), לא צעד בתהליך: המרכז מצייר אותו פעם
 * אחת ליד הכותרת (representationCenter.isReconcileAction), ולא בעמודה.
 */
export function shaamRepresentationAction(
  status: RepresentationStatus | null | undefined,
  tracking?: ShaamRequestTracking,
  stamped?: boolean,
): ShaamRepresentationAction | null {
  const stage = shaamLifecycleStage(status, tracking, stamped);
  switch (stage) {
    case null:
      return null;
    case 'active':
      // ‼ «פעיל» אצלנו, אבל שע״ם עוד לא אמרה שהכול נקלט — קריאה עוד שווה משהו.
      return status === 'active' && shaamRequestExists(tracking) && !allSystemsAccepted(tracking) ? CHECK : null;
    case 'submitted':
    case 'waiting_client':
      return CHECK;
    case 'not_started':
      // ‼ 24.09.2026 · לחיצה אחת. הבדיקה אם כבר יש בקשה בשע״ם (הדסה סלע —
      // הוזנה שם ידנית) רצה בתוך הפעולה, בעובד, לפני אימות הישות; נמצאה ⇒
      // לא נוצרת שנייה, והמצב שלה נקלט כאן (202).
      return { kind: 'create', label: SHAAM_ENTER_LABEL, actionType: SHAAM_CREATE_REPRESENTATION_ACTION_TYPE };
    case 'ambiguous':
      return {
        ...SUBMIT, disabled: true,
        reason: 'בבדיקה האחרונה בשע״ם נמצאו שורות שאינן בקשה אחת (תאריכים/מצבים שונים או מערך כפול) — '
          + 'אי אפשר לקבוע לאיזו בקשה לשדר, ולכן לא משדרים. בדקו בשע״ם את הבקשות הפתוחות של האדם הזה.',
      };
    case 'signed_ready':
      return SUBMIT;
    case 'signatures_pending':
      return {
        ...SUBMIT, disabled: true,
        reason: !tracking?.requestNumber
          ? 'הטופס טרם נחתם בידי כל החותמים והוחתם בחותמת המשרד — אי אפשר לשדר לשע״ם.'
          : tracking.formDocumentId
            ? 'הטופס טרם נחתם והוחתם בחותמת — אי אפשר לשדר לשע״ם.'
            : 'טופס ייפוי הכוח טרם הובא משע״ם.',
      };
  }
}

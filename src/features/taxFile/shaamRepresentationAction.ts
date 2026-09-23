// ─── תא הפעולה ההקשרית של מס הכנסה/שע״ם (פרק 17) ─────────────────────────────
// ‼ פונקציה טהורה אחת לשני המשטחים — תיק המס (client.representationStatus)
// ומרכז ביצוע הייצוג (request.status) — כדי שהתווית לא תסטה ביניהם.
// ‼ הפעולה נגזרת משני דברים בלבד: סטטוס הבקשה, ומצב האינטגרציה שנשמר
// בפועל (`execution.shaam[key]`). לא ממציאים «נשלח לשע״ם» בלי ראיה —
// `submittedAt` נכתב רק אחרי אישור קליטה מהרשות (194).

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
 * @param status סטטוס בקשת הייצוג (או `client.representationStatus`).
 * @param tracking מצב ההגשה בשע״ם, כשידוע. חסר ⇒ טרם נפתחה בקשה.
 * @param stamped כל טופסי הבקשה נחתמו והוטבעה עליהם חותמת — התנאי לשידור.
 */
export function shaamRepresentationAction(
  status: RepresentationStatus | null | undefined,
  tracking?: ShaamRequestTracking,
  stamped?: boolean,
): ShaamRepresentationAction | null {
  if (!status) return null;
  // ‼ «פעיל» הוא סוף הדרך אצלנו, אבל כל עוד לא ראינו את שע״ם אומרת שהכול
  // נקלט — בדיקה עדיין שווה משהו. אחרי שראינו, אין מה להציע.
  if (status === 'active') {
    if (shaamRequestExists(tracking) && !allSystemsAccepted(tracking)) {
      return { kind: 'check', label: 'בדוק קבלת הייצוג', actionType: SHAAM_CHECK_REPRESENTATION_ACTION_TYPE };
    }
    return null;
  }

  // כבר שודר — מכאן והלאה רק קוראים מצב.
  if (tracking?.submittedAt) {
    return { kind: 'check', label: 'בדוק קבלת הייצוג', actionType: SHAAM_CHECK_REPRESENTATION_ACTION_TYPE };
  }

  // יש בקשה בשע״ם וטופס — נשאר לשדר את החתום.
  if (tracking?.requestNumber) {
    if (stamped) {
      return { kind: 'submit', label: 'שלח טופס חתום לשע״ם', actionType: SHAAM_SUBMIT_POA_ACTION_TYPE };
    }
    if (status === 'awaiting_authorities') {
      // סומן ידנית כ«נשלח» בלי שהאוטומציה שידרה — עדיין אפשר לבדוק מצב.
      return { kind: 'check', label: 'בדוק קבלת הייצוג', actionType: SHAAM_CHECK_REPRESENTATION_ACTION_TYPE };
    }
    return {
      kind: 'submit', label: 'שלח טופס חתום לשע״ם', actionType: SHAAM_SUBMIT_POA_ACTION_TYPE,
      disabled: true,
      reason: tracking.formDocumentId
        ? 'הטופס טרם נחתם והוחתם בחותמת — אי אפשר לשדר לשע״ם.'
        : 'טופס ייפוי הכוח טרם הובא משע״ם.',
    };
  }

  // ‼ 23.09.2026 · אין ל-PIVO עדיין מספר בקשה בשע״ם — אבל זה לא אומר
  // שאין שם בקשה. ייתכן שהיא הוזנה ידנית (בדיוק המקרה של הדסה סלע):
  // הוגשה בפועל בשע״ם, בלי שדרך PIVO. ‼ לא דורשים מהרו"ח להעתיק מספר בקשה
  // ידנית — «בדוק קבלת הייצוג» מוצא אותו לבד (חיפוש לפי ישות, worker
  // מיוחס). לפני שמציעים «צור בקשה» — קודם בודקים שהיא לא כבר שם, כדי
  // שלא ליצור כפילות. בדיקה היא קריאה בלבד, ולכן בטוחה גם כשאין שם כלום.
  // ‼ «בדוק» מצא את הבקשה בשע״ם (שורות משויכות) אבל מספר הבקשה לא נחשף
  // ב-DOM — המקרה האמיתי של הדסה סלע (23.09.2026). הבקשה **קיימת**, ולכן
  // לעולם לא «צור»: זו הייתה פותחת אימות ישות חוזר מול שע״ם על בקשה פתוחה.
  // ‼ השידור לא דורש מספר בקשה: העובד מאתר אותה לפי ישות + שם, ועוצר לפני
  // העלאה אם הייחוס אינו חד-משמעי (singleAttributedRequest, openedScreenMatches).
  // כאן חוסמים רק את מה שכבר ידוע כדו-משמעי מהבדיקה האחרונה.
  if (shaamRequestExists(tracking)) {
    const submit = { kind: 'submit' as const, label: 'שלח טופס חתום לשע״ם', actionType: SHAAM_SUBMIT_POA_ACTION_TYPE };
    if (!shaamRowsFormOneRequest(tracking)) {
      return {
        ...submit, disabled: true,
        reason: 'בבדיקה האחרונה בשע״ם נמצאו שורות שאינן בקשה אחת (תאריכים/מצבים שונים או מערך כפול) — '
          + 'אי אפשר לקבוע לאיזו בקשה לשדר, ולכן לא משדרים. בדקו בשע״ם את הבקשות הפתוחות של האדם הזה.',
      };
    }
    if (stamped) return submit;
    if (status === 'awaiting_authorities') {
      return { kind: 'check', label: 'בדוק קבלת הייצוג', actionType: SHAAM_CHECK_REPRESENTATION_ACTION_TYPE };
    }
    return {
      ...submit, disabled: true,
      reason: 'הטופס טרם נחתם בידי כל החותמים והוחתם בחותמת המשרד — אי אפשר לשדר לשע״ם.',
    };
  }
  if (!tracking?.syncedAt) {
    return { kind: 'check', label: 'בדוק קבלת הייצוג', actionType: SHAAM_CHECK_REPRESENTATION_ACTION_TYPE };
  }
  // כבר נבדקה בשע״ם, ולא נמצאה שם שום שורה שלה — עכשיו אפשר באמת ליצור.
  return { kind: 'create', label: 'הזן את הפרטים בשע״ם', actionType: SHAAM_CREATE_REPRESENTATION_ACTION_TYPE };
}

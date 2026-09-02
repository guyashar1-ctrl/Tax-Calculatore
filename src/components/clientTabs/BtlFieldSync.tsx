// ─── פרימיטיב סנכרון לשדה בודד מול ביטוח לאומי ─────────────────────────────
// ‼ אותו מודל שאושר לשע״ם ואותו עיצוב בדיוק (‎.ial-fsync‎): שדה-שדה, כפתור
// משלו לכל שדה שיש לו מקור ודאי ברשות. אין כאן «סנכרן הכול» ברמת הסעיף —
// תזמור יבוא רק אחרי שכל פרימיטיב הוכח לבדו. ראה ShaamFieldSync.
//
// ‼ **אבן דרך זו: מקום ומצב בלבד — עדיין בלי קריאה.** הקורא האוטומטי
// מביטוח לאומי (מסלול הניווט והחילוץ) טרם נבנה, ולכן לכפתור אין ‎onClick‎
// והוא ‎disabled‎ תמיד. זו החלטה ולא חוסר: כפתור שמייצר משימה שאיש אינו
// יודע לבצע היה מותיר «דרוש אדם» תלוי באוויר, וכפתור שמדווח הצלחה בלי
// לקרוא כלום היה נתון שגוי בתיק. עדיף כפתור שאומר בפירוש «עוד לא נבנה».
//
// ‼ המוכנות נקראת מאותו חוזה משותף שמדליק את הנורית בכותרת — אותו ערך
// בדיוק. אסור שהשדה יכריז «לא מחובר» בזמן שהכותרת ירוקה, וזו בדיוק
// התקלה שכבר נתפסה פעם אחת בצד שע״ם.

import { useShaamReadiness } from '../../hooks/shaamReadiness';

/**
 * השדות שקיבלו כפתור. ‼ רשימה מפורשת ולא «כל שדה של ב״ל»: כפתור על שדה
 * שאין לו מקור מוכח ברשות הוא הבטחה שלא נוכל לקיים.
 */
export const BTL_SYNC_FIELDS: ReadonlySet<string> = new Set(['niBalance']);

export default function BtlFieldSync({ fieldKey }: { fieldKey: string }) {
  const { status, workerOffline } = useShaamReadiness();
  if (!BTL_SYNC_FIELDS.has(fieldKey)) return null;

  // ‼ אותה נוסחה שהכותרת משתמשת בה: מצב לא ידוע (עובד כבוי) אינו «מחובר».
  const connected = !workerOffline && !!status.btl?.connected;

  const reason = workerOffline
    ? 'מחשב האוטומציה אינו פעיל, ולכן אי אפשר לקרוא מביטוח לאומי.'
    : !connected
      ? 'אין חיבור פעיל לביטוח לאומי — התחברו מהכפתור «ביטוח לאומי» בכותרת.'
      : 'הקריאה האוטומטית של היתרה מביטוח לאומי עדיין לא נבנתה.';

  return (
    <div className="ial-fsync">
      <button type="button" className="ial-fsync-btn" disabled
        title={reason} aria-label={reason}>
        ⟳
      </button>
      <span className="ial-fsync-msg">{reason}</span>
    </div>
  );
}

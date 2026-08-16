// ─── פעימה חיה ──────────────────────────────────────────────────────────────
// ‼ חלק ניכר מהתנועה במערכת אינו מגיע מהרו"ח אלא מהלקוח: הוא פותח את ההצעה,
// מאשר וחותם, ממלא בקשה בדף האישי. כל אלה נכתבים בשרת, ולכן המסך הפתוח של
// הרו"ח לא יודע עליהם — הוא הציג "נשלחה, ממתין לתשובה" דקות אחרי שההצעה כבר
// אושרה, עד שמישהו רענן. אין כאן דחיפה מהשרת (טבלאות המערכת אינן בפרסום
// ה-realtime), ולכן המסך שואל בעצמו — בקצב נמוך, ורק כשהוא מול העיניים.
//
// שלושה טריגרים, כולם לאותה משיכה שקטה:
//   1. כל PULSE_MS בזמן שהלשונית גלויה
//   2. חזרה ללשונית (visibilitychange) — הרגע הכי סביר שמשהו קרה בינתיים
//   3. חזרה למיקוד החלון (focus), למי שעובד בשני חלונות זה לצד זה

import { useEffect, useRef } from 'react';

export const PULSE_MS = 20_000;

/**
 * מריץ את כל הרענונים יחד. הפונקציות חייבות להיות יציבות (useCallback) —
 * אחרת הטיימר נבנה מחדש בכל רינדור ואף פעם לא מספיק לפעום.
 */
export function useLivePulse(enabled: boolean, refreshers: Array<() => void | Promise<unknown>>) {
  // ‼ הרשימה נשמרת ב-ref ולא ברשימת התלויות: מערך חדש נוצר בכל רינדור של
  // הקורא, וכתלות הוא היה מאפס את הטיימר בלי סוף.
  const latest = useRef(refreshers);
  latest.current = refreshers;

  // מונע חפיפה: משיכה איטית לא תיערם על עצמה בפעימה הבאה.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    async function pulse() {
      if (inFlight.current) return;
      if (document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        await Promise.all(latest.current.map(fn => {
          try { return Promise.resolve(fn()); } catch { return Promise.resolve(); }
        }));
      } finally {
        inFlight.current = false;
      }
    }

    const timer = window.setInterval(pulse, PULSE_MS);
    function onVisible() { if (document.visibilityState === 'visible') void pulse(); }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled]);
}

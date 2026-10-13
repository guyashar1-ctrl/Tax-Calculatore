// ─── מה מתהליכי המס זמין באתר — לטקסטים של ידע המס ─────────────────────────
// ‼ ידע המס שוחרר לפני תהליכי הדוחות (החלטת גיא, 11.10.2026). אותו קוד ידע רץ
// בשני הענפים, והקובץ הזה הוא ההבדל היחיד ביניהם: בשחרור הידע (master) — false,
// בענף tax-foundation — true. דף ידע לא מפנה למסך שאינו קיים באתר; הוא אומר
// «בפיתוח» ומסביר איך עושים ביד.

export interface Availability {
  /** הערכת מס לשנה מתוך «תיק מס» (features/taxEstimate, מיגרציות 231–232). */
  taxEstimate: boolean;
  /** טיוטת הדוח השנתי 1301, מילוי וקובץ (features/annualReturn, מיגרציה 233). */
  annualReturn: boolean;
  /** בקשת «הצהרת הון» — איסוף ובדיקה (features/taxYear, מיגרציה 230). */
  wealthRequest: boolean;
  /** שנות מס, שאלון שנתי ואיסוף (features/taxYear, מיגרציה 229). */
  taxYear: boolean;
}

export const AVAILABLE: Availability = {
  taxEstimate: false,
  annualReturn: false,
  wealthRequest: true,
  taxYear: true,
};

/** תווית אחידה ליכולת שטרם שוחררה. */
export const NOT_RELEASED = 'בפיתוח — עדיין לא באתר';

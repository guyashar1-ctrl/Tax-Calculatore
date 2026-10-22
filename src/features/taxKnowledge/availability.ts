// ─── מה מתהליכי המס זמין באתר — לטקסטים של ידע המס ─────────────────────────
// ‼ דף ידע לא מפנה למסך שאינו קיים באתר; הוא אומר «בפיתוח» ומסביר איך עושים ביד.
// חבילת «ידע והערכת מס» (13.10.2026): האיסוף (229/230/236) כבר בייצור, ההערכה (231–232)
// עולה איתה; הכנת הדוח השנתי (233) נשארת בענף tax-foundation — שם הקובץ הזה כולו true.

export interface Availability {
  /** הערכת מס לשנה מתוך «תיק מס» (features/taxEstimate, מיגרציות 231–232). */
  taxEstimate: boolean;
  /** טיוטת הדוח השנתי 1301, מילוי וקובץ (features/annualReturn, מיגרציה 233). */
  annualReturn: boolean;
  /** בקשת «הצהרת הון» — איסוף ובדיקה (features/taxYear, מיגרציה 230). */
  wealthRequest: boolean;
  /** שנות מס, שאלון שנתי ואיסוף (features/taxYear, מיגרציה 229). */
  taxYear: boolean;
  /**
   * «שאל»: תשובה מנוסחת בידי AI מהכללים (knowledge-answer). ‼ 22.10.2026 — כבוי: המפתח החינמי של Gemini עמד
   * בשתי שאלות ואז חרג ממכסה (כל שאלה שולחת את כל המאגר), והמכסה משותפת לקריאת מסמכי הלקוחות. גיא: «אם זה לא
   * חינם או שאתה לא מבסוט — נוותר». בלי זה: החיפוש המיידי בכללים, ושאלה בלי כלל נשמרת לעדכון הבא.
   */
  askAi: boolean;
}

export const AVAILABLE: Availability = {
  taxEstimate: true,
  annualReturn: false,
  wealthRequest: true,
  taxYear: true,
  askAi: false,
};

/** תווית אחידה ליכולת שטרם שוחררה. */
export const NOT_RELEASED = 'בפיתוח — עדיין לא באתר';

// ─── פעולות «לדוגמה» — המשותף לכל המסכים שהלקוח מגיע אליהם בקישור אישי ─────────
// ‼ אסור ששום דבר בקובץ הזה יפנה לרשת: לא supabase, לא fetch, לא window.open.
// מסך בתצוגה לדוגמה מקבל פעולות שמחזירות «הוצג בלבד» — והמסך עצמו אומר
// ליד הפקד שנלחץ שלא נשמר ולא נשלח דבר, ואינו מתקדם.

/** תשובה של פעולה שבתצוגה לדוגמה לא בוצעה בפועל. */
export interface SimulatedResult { status: 'simulated' }

export const SIMULATED: SimulatedResult = { status: 'simulated' };

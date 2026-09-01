// ─── סוגי תיק במס הכנסה — מיפוי דטרמיניסטי, מגורסה ───────────────────────
//
// ‼ שע״ם מחזירה **קוד** בלבד (למשל "42"). הקוד נשמר כמו שהוא, בדיוק כפי
// שהתקבל, ולעולם לא מומר לטקסט בשמירה. הטבלה כאן היא שכבת תצוגה בלבד:
// היא מסבירה לרו"ח מה הקוד אומר, ואינה מקור אמת על התיק.
//
// ‼ אין קריאת רשת בזמן ריצה. המקור הוא רשימה סטטית בקוד, ממוספרת בגרסה,
// כדי ששינוי בעתיד יהיה קומיט שאפשר לראות ולא הפתעה מאתר חיצוני.
//
// מקור: cpa-ea.co.il — "סוגי תיק במס הכנסה וקודים", נקרא ב-2026-09-01.
// עדכון הרשימה = העלאת INCOME_TAX_FILE_TYPES_VERSION.

export const INCOME_TAX_FILE_TYPES_VERSION = 1;

export interface IncomeTaxFileType {
  /** הקוד כפי ששע״ם מחזירה אותו. */
  code: string;
  /** התיאור הקצר של סוג התיק. */
  description: string;
  /** משפט הסבר לרו"ח — מה זה אומר בפועל. */
  explanation: string;
}

export const INCOME_TAX_FILE_TYPES: readonly IncomeTaxFileType[] = [
  { code: '10', description: 'תיק סגור ללא יתרות', explanation: 'תיק שנסגר סופית ואין בו חובות או יתרות פתוחות.' },
  { code: '13', description: 'תיק נפטר שהטיפול בו טרם הסתיים', explanation: 'נישום שנפטר אך הליך השומה או הסגירה טרם הושלם.' },
  { code: '15', description: 'תיק עזבונות', explanation: 'תיק עבור נכסי עזבון לאחר פטירת הנישום.' },
  { code: '16', description: 'תיק עזבונות', explanation: 'תיק נוסף לעזבון.' },
  { code: '17', description: 'תיק נישום מנותק', explanation: 'תיק של נישום שאין אפשרות ליצור איתו קשר.' },
  { code: '19', description: 'פטור מניכוי במקור שלא משכר', explanation: 'תיק שנפתח רק לצורך קבלת אישור פטור לניכוי מס.' },
  { code: '20', description: 'פטור מניהול פנקסים', explanation: 'נישום שאינו חייב בניהול ספרים, לרוב בשל הכנסות נמוכות.' },
  { code: '21', description: 'מיזם נפט — היתר מוקדם', explanation: 'תיק לפעילות ראשונית בתחום חיפושי הנפט.' },
  { code: '22', description: 'מיזם נפט — שותף מדווח', explanation: 'תיק עבור שותף מדווח במיזם נפט.' },
  { code: '23', description: 'מיזם נפט — לא שותף מדווח', explanation: 'בעלים שאינו שותף מדווח בפרויקט.' },
  { code: '24', description: 'מיזם נפט — בעל תשלום נגזר', explanation: 'תיק לנישום המקבל תשלומים כפועל יוצא מהמיזם.' },
  { code: '25', description: 'מיזם נפט — היתר מוקדם', explanation: 'כמו קוד 21 — שלב מוקדם בפרויקט.' },
  { code: '26', description: 'מיזם נפט — שותף או לא מדווח', explanation: 'תיק משולב לפי תפקיד הנישום במיזם.' },
  { code: '28', description: 'שותפות נפט', explanation: 'תיק פעילות לשותפות בתחום הנפט.' },
  { code: '30', description: 'תיק מנהל בחברה', explanation: 'תיק עצמאי שנפתח עבור מנהל חברה.' },
  { code: '31', description: 'משאבי טבע', explanation: 'תיק פעילות בתחום הפקת משאבי טבע.' },
  { code: '32', description: 'משאבי טבע', explanation: 'תיק פעילות בתחום הפקת משאבי טבע.' },
  { code: '40', description: 'עוסק יחיד ועוסק זעיר', explanation: 'נישום המדווח כעצמאי או כזעיר לעניין מע״מ.' },
  { code: '41', description: 'חשבונאות חד-צדית פשוטה', explanation: 'נישום עם הכנסות פשוטות, חובת ניהול ספרים בסיסית.' },
  { code: '42', description: 'חד-צדית מורכבת, דווח מצטבר', explanation: 'מערכת חשבונאית פשוטה אך מדווחת בסיכום תקופתי.' },
  { code: '43', description: 'חקלאי לא מדווח כפול', explanation: 'חקלאי ללא מערכת חשבונאית כפולה.' },
  { code: '44', description: 'עוסק זעיר', explanation: 'נישום קטן עם היקף הכנסות נמוך.' },
  { code: '45', description: 'נאמנות חייבת בדו״ח', explanation: 'נאמנות החייבת בהגשת דוח שנתי למס הכנסה.' },
  { code: '46', description: 'נאמנות לא חייבת בדו״ח', explanation: 'נאמנות פטורה מחובת הדיווח.' },
  { code: '52', description: 'חד-צדית מורכבת, דיווח מזומן', explanation: 'ניהול חשבונות פשוט לפי תזרים מזומנים.' },
  { code: '53', description: 'שיטה כפולה', explanation: 'מערכת חשבונאית מלאה כפולה.' },
  { code: '60', description: 'פטק״א', explanation: 'תאגיד זכויות פנסיה לפי הסכם בין-לאומי.' },
  { code: '61', description: 'חברה לא עסקית', explanation: 'חברה שמטרותיה ניהול נכסים, השכרה, השקעות וכדומה.' },
  { code: '62', description: 'חברה לא מוגדרת', explanation: 'תאגיד שאינו מוגדר במסגרת חקלאית.' },
  { code: '63', description: 'חברת פשמ״ג', explanation: 'חברה לפי הגדרה משתנה — ניהול מבוקר.' },
  { code: '64', description: 'קיבוץ / מושב / אגודה חקלאית', explanation: 'תאגידים חקלאיים קואופרטיביים.' },
  { code: '68', description: 'שותפות נפט', explanation: 'כמו 28 — שותפות רשומה במיזם נפט.' },
  { code: '70', description: 'חברה לא פעילה', explanation: 'חברה רשומה שטרם החלה לפעול.' },
  { code: '71', description: 'פטור ניכוי במקור בלבד', explanation: 'תאגיד ללא פעילות, רק לצורך פטור ממס במקור.' },
  { code: '73', description: 'חברה שהפסיקה פעילותה', explanation: 'חברה שחדלה לפעול ואין לה יתרה.' },
  { code: '75', description: 'תיק דיבידנד', explanation: 'תיק משני לדיווח תשלומי דיבידנד.' },
  { code: '76', description: 'חברה עם יתרה', explanation: 'חברה לא פעילה אך עדיין עם יתרת חוב או נכסים.' },
  { code: '77', description: 'חברה לא פעילה — הליך נמשך', explanation: 'טיפול שומתי טרם הושלם.' },
  { code: '78', description: 'חברה שנמחקה', explanation: 'חברה סגורה שנמחקה מרשם החברות.' },
  { code: '80', description: 'חברה בפירוק', explanation: 'תהליך פירוק שוטף של חברה.' },
  { code: '81', description: 'פירוק מרצון', explanation: 'פירוק לפי החלטת בעלי המניות.' },
  { code: '82', description: 'פירוק לפי צו', explanation: 'פירוק כפוי בהוראת בית משפט.' },
  { code: '83', description: 'פשיטת רגל', explanation: 'נישום בהליך פשיטת רגל.' },
  { code: '84', description: 'מלכ״ר — טרם נבדק', explanation: 'פנייה לאישור מוסד ציבורי ממתינה לבדיקה.' },
  { code: '85', description: 'מלכ״ר מאושר', explanation: 'מוסד ציבורי פעיל שקיבל אישור.' },
  { code: '86', description: 'מלכ״ר לא מאושר', explanation: 'מלכ״ר פעיל אך טרם אושר.' },
  { code: '87', description: 'מלכ״ר לא פעיל', explanation: 'ארגון ללא כוונת רווח שאינו פעיל.' },
  { code: '88', description: 'מלכ״ר מאושר למע״מ בלבד', explanation: 'מאושר לעניין מע״מ בלבד.' },
  { code: '91', description: 'תיק החזרים', explanation: 'תיק פתוח לצורך קבלת החזרי מס.' },
  { code: '92', description: 'נישום ושכר אשתו — חייב בדו״ח', explanation: 'חובת דיווח עקב הכנסות ממשכורת.' },
  { code: '93', description: 'הכנסות לא משכר — חייב בדו״ח', explanation: 'תיק עם הכנסות נוספות החייב בדיווח.' },
  { code: '94', description: 'דוח ללא פנקס', explanation: 'הכנסות מנכסים או רווחים ללא ניהול פנקסים.' },
  { code: '95', description: 'שכ״ד לפי סעיף 122', explanation: 'תיק לדיווח על הכנסות מהשכרת דירה פרטית.' },
  { code: '96', description: 'תיק מיועד לסגירה', explanation: 'תיק לא פעיל בתהליך סגירה.' },
  { code: '97', description: 'תיק שכיר מיוחד', explanation: 'שכיר במעמד מיוחד או יוצא דופן.' },
  { code: '98', description: 'סגירה עם יתרות', explanation: 'תיק לקראת סיום אך עדיין עם טיפול ויתרות.' },
];

const BY_CODE = new Map(INCOME_TAX_FILE_TYPES.map((t) => [t.code, t]));

/**
 * ‼ מחזיר undefined לקוד שאינו ברשימה — ובכוונה. קוד לא מוכר מוצג כמו
 * שהוא, בלי ניחוש ובלי "הכי קרוב": עדיף שהרו"ח יראה "42" בלי הסבר מאשר
 * הסבר שגוי.
 */
export function incomeTaxFileType(code: string | null | undefined): IncomeTaxFileType | undefined {
  if (!code) return undefined;
  return BY_CODE.get(String(code).trim());
}

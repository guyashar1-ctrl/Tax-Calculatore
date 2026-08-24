// ─────────────────────────────────────────────────────────────────────────────
// מיפוי סוגי עסקים → תוספת ניהול הספרים
//
// נבנה מההגדרות שבתוספות עצמן (הרשימה הסגורה בתוספת ה', הגדרת "רופא" בתוספת ו',
// החרגת השיפוצים בתוספת ד', הספרים המיוחדים בסעיף 3 לתוספת יא' ועוד) + אימות
// מול כל-זכות ומקורות מקצועיים. caveat = מקרה גבול שדורש שיקול דעת.
// ─────────────────────────────────────────────────────────────────────────────
import { BusinessTypeEntry } from './types';

export const BUSINESS_TYPES: BusinessTypeEntry[] = [
  // ── מזון והסעדה ──
  { label: 'מסעדה', keywords: ['מסעדות', 'אוכל', 'הסעדה', 'שף'], addendumId: 'k', reasoning: 'מסעדה מנויה במפורש בתוספת יא - כולל יומן שירות (מלצרים ופדיונם).', caveat: 'אם הוצג לקהל שדמי השירות כלולים במחיר - פטור מיומן השירות.', confidence: 'high' },
  { label: 'בית קפה', keywords: ['קפה', 'קפיטריה'], addendumId: 'k', reasoning: 'הגשת מזון ומשקאות במקום = שירות; דינו כמסעדה.', caveat: null, confidence: 'high' },
  { label: 'פאב / בר', keywords: ['פאב', 'בר', 'אלכוהול'], addendumId: 'k', reasoning: '"בעל מסעדה" כולל כל עסק המעסיק מלצרים.', caveat: 'כניסה בתשלום/מופעים - גם כללי מקום עינוג ציבורי (מלאי כרטיסים).', confidence: 'high' },
  { label: 'דוכן פלאפל / שווארמה / מזון מהיר', keywords: ['פלאפל', 'שווארמה', 'מזון רחוב', 'פיצה'], addendumId: 'k', reasoning: 'הכנת מזון לצריכה מיידית = שירות.', caveat: 'קיוסק שמוכר רק מזון ארוז מתוצרת אחרים - קמעונאי (ג\').', confidence: 'medium' },
  { label: 'פודטראק', keywords: ['משאית אוכל'], addendumId: 'k', reasoning: 'כמו דוכן מזון.', caveat: null, confidence: 'medium' },
  { label: 'קייטרינג', keywords: ['אירועים', 'הסעדת אירועים'], addendumId: 'k', reasoning: 'שירותי הסעדה עם ספר הזמנות.', caveat: 'ייצור מזון ארוז בסדרות לשיווק לחנויות - יצרן (א\').', confidence: 'medium' },
  { label: 'אולם / גן אירועים', keywords: ['אולם שמחות', 'אולם מסיבות'], addendumId: 'k', reasoning: 'מנוי במפורש - ספר הזמנות עם מספר מנות ותאריך האירוע.', caveat: null, confidence: 'high' },
  { label: 'מלון / צימר / פנסיון', keywords: ['מלונאות', 'צימרים', 'אירוח'], addendumId: 'k', reasoning: 'מנוי במפורש - ספר אורחים.', caveat: 'דירת נופש בודדת - ייתכן שאינה עסק כלל.', confidence: 'high' },
  { label: 'מאפייה', keywords: ['מאפיה', 'לחם', 'מאפים'], addendumId: 'a', reasoning: 'אפייה = ייצור (תוספת א\'), גם אם המכירה בחנות צמודה.', caveat: 'נקודת מכירה קמעונאית משמעותית מוסיפה חובות קמעונאי (סרט קופה).', confidence: 'high' },
  { label: 'קונדיטוריה / עוגות בהזמנה', keywords: ['קונדיטורית', 'עוגות', 'מגשי אירוח'], addendumId: 'a', reasoning: 'ייצור דברי מאפה, גם לפי מפרט לקוח = ייצור.', caveat: 'אם עיקר הפעילות אירוח והגשה - יא\'.', confidence: 'medium' },

  // ── רכב ותחבורה ──
  { label: 'מוסך', keywords: ['מכונאי', 'תיקון רכב', 'פחחות', 'צמיגים'], addendumId: 'k', reasoning: 'מנוי במפורש - יומן עבודה לכל רכב + מדרגות מחזור מיוחדות למוסכים.', caveat: 'מוסך שגם סוחר ברכב - על הסחר חלה גם תוספת י\'.', confidence: 'high' },
  { label: 'מכון רישוי (טסט)', keywords: ['טסט', 'בדיקת רכב'], addendumId: 'k', reasoning: 'שירות ללא תוספת ייעודית.', caveat: null, confidence: 'high' },
  { label: 'שטיפת רכב', keywords: ['רחיצת מכוניות', 'דיטיילינג'], addendumId: 'k', reasoning: 'שירות רגיל.', caveat: 'סיכה/רחיצה בתחנת דלק - תוספת יד\' (שוברי סיכה/רחיצה).', confidence: 'medium' },
  { label: 'תחנת דלק', keywords: ['דלק', 'תדלוק'], addendumId: 'n', reasoning: 'תוספת ייעודית - חשבונאות כפולה ממוחשבת + דו"ח מכירות דלק יומי.', caveat: 'חנות הנוחות שבתחנה - פעילות קמעונאית (ג\') לצד יד\'.', confidence: 'high' },
  { label: 'השכרת רכב', keywords: ['רנט א קאר'], addendumId: 'k', reasoning: 'מנוי במפורש - חוזי השכרה ממוספרים עם מד ק"מ.', caveat: 'ליסינג מימוני (שכירות-מכר) = מסחר ברכב - תוספת י\'.', confidence: 'high' },
  { label: 'מונית', keywords: ['נהג מונית', 'גט', 'הסעה'], addendumId: 'k', reasoning: 'מסלול מקוצר מיוחד: תקבולים ותשלומים + סרט קופה + תיק תעוד חוץ בלבד.', caveat: null, confidence: 'high' },
  { label: 'הובלות', keywords: ['מוביל', 'משאית', 'הובלת דירות', 'שליחויות'], addendumId: 'k', reasoning: 'מנוי במפורש - ספר הובלות יומי.', caveat: null, confidence: 'high' },
  { label: 'הסעות', keywords: ['הסעת עובדים', 'מיניבוס', 'אוטובוס'], addendumId: 'k', reasoning: 'מנוי במפורש - ספר הסעות.', caveat: null, confidence: 'high' },
  { label: 'סוחר רכב / מגרש מכוניות', keywords: ['טרייד אין', 'יד שנייה', 'מגרש רכבים'], addendumId: 'j', reasoning: 'תוספת ייעודית - ספר הסחר לכל רכב.', caveat: null, confidence: 'high' },
  { label: 'מתווך רכב', keywords: ['תיווך רכב'], addendumId: 'j', reasoning: 'תוספת ייעודית - ספר תיווך.', caveat: null, confidence: 'high' },
  { label: 'מורה נהיגה / בית ספר לנהיגה', keywords: ['שיעורי נהיגה', 'לימוד נהיגה'], addendumId: 'g', reasoning: 'תוספת ייעודית הכוללת במפורש מורה נהיגה - ספר רכב, יומן הזמנות וספר תלמידים.', caveat: null, confidence: 'high' },

  // ── בנייה ותיקונים ──
  { label: 'קבלן בניין', keywords: ['קבלן', 'בניה', 'שלד', 'יזם בונה'], addendumId: 'd', reasoning: 'ביצוע עבודות בניה - חשבון עבודה לכל יחידת בניה.', caveat: 'המדרגה נקבעת לפי "עלות בניה" או מחזור - הגבוה.', confidence: 'high' },
  { label: 'עבודות עפר / חפירה / הריסה', keywords: ['באגר', 'שופל', 'הריסות'], addendumId: 'd', reasoning: 'מנויות במפורש בהגדרת עבודות בניה.', caveat: null, confidence: 'high' },
  { label: 'סלילה / תשתיות / ביוב', keywords: ['כבישים', 'ניקוז', 'צנרת תשתית'], addendumId: 'd', reasoning: 'מנויות במפורש בהגדרת עבודות בניה.', caveat: null, confidence: 'high' },
  { label: 'שיפוצניק', keywords: ['שיפוצים', 'צבע', 'גבס', 'ריצוף'], addendumId: 'k', reasoning: 'שיפוצים ותיקונים בבניינים מוחרגים מתוספת ד\' - תוספת יא\' עם יומן עבודה יומי.', caveat: 'אם מבצע גם בניה חדשה/חפירה/סלילה - על אותו חלק חלה תוספת ד\'.', confidence: 'high' },
  { label: 'חשמלאי', keywords: ['חשמל', 'לוח חשמל'], addendumId: 'k', reasoning: 'תיקונים והתקנות = שירות; בבניינים - יומן עבודה.', caveat: 'קבלן משנה בבניה חדשה בהיקף משמעותי - ייתכן ד\'.', confidence: 'high' },
  { label: 'אינסטלטור', keywords: ['אינסטלציה', 'שרברב', 'צנרת'], addendumId: 'k', reasoning: 'תיקוני אינסטלציה בבניינים - יא\' עם יומן עבודה.', caveat: 'הנחת צינורות ועבודות ביוב תשתיתיות = עבודות בניה - ד\'.', confidence: 'high' },
  { label: 'טכנאי מזגנים', keywords: ['מיזוג אוויר', 'התקנת מזגנים'], addendumId: 'k', reasoning: 'התקנה ותיקון אצל הלקוח = שירות; בבניינים - יומן עבודה.', caveat: null, confidence: 'high' },
  { label: 'מנעולן', keywords: ['מנעולים', 'שכפול מפתחות'], addendumId: 'k', reasoning: 'שירות תיקונים.', caveat: null, confidence: 'high' },
  { label: 'מדביר', keywords: ['הדברה', 'מזיקים'], addendumId: 'k', reasoning: 'שירות עם ספר הזמנות.', caveat: null, confidence: 'high' },
  { label: 'גנן', keywords: ['גינון', 'אחזקת גינות', 'עיצוב גינות'], addendumId: 'k', reasoning: 'אחזקת גינות של לקוחות = שירות (לא חקלאות).', caveat: null, confidence: 'high' },

  // ── מקצועות חופשיים (תוספת ה' — רשימה סגורה) ──
  { label: 'עורך דין', keywords: ['עו"ד', 'משרד עורכי דין'], addendumId: 'e', reasoning: 'מנוי במפורש ברשימה הסגורה - כולל ספר לקוחות.', caveat: null, confidence: 'high' },
  { label: 'רואה חשבון', keywords: ['רו"ח', 'ראיית חשבון', 'ביקורת'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'יועץ מס', keywords: ['ייעוץ מס'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'מנהל חשבונות עצמאי', keywords: ['הנהלת חשבונות', 'חשב שכר'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: 'חשב שכר שאינו מנהל חשבונות אינו ברשימה - פורמלית יא\'.', confidence: 'high' },
  { label: 'אדריכל', keywords: ['אדריכלות', 'תכנון'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'מהנדס', keywords: ['הנדסה', 'מהנדס בניין'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: 'מהנדס תוכנה שנותן שירותי פיתוח - בפועל רבים מסווגים כיא\'.', confidence: 'high' },
  { label: 'הנדסאי', keywords: ['הנדסאי בניין'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'טכנאי מוסמך', keywords: ['טכנאי אלקטרוניקה'], addendumId: 'e', reasoning: '"טכנאי" מנוי במפורש (בעל תואר טכנאי במקצועו).', caveat: 'טכנאי שירות שדה שמוכר גם חלפים - בפועל לרוב יא\'.', confidence: 'medium' },
  { label: 'טכנאי שיניים', keywords: ['מעבדת שיניים', 'כתרים'], addendumId: 'e', reasoning: 'מנוי במפורש + חובות נוספות: ספר הזמנות ומלאי מתכות עדינות.', caveat: null, confidence: 'high' },
  { label: 'שמאי', keywords: ['שמאות', 'שמאי מקרקעין', 'שמאי רכב'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'מודד מוסמך', keywords: ['מדידות'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'כלכלן', keywords: ['ייעוץ כלכלי', 'אנליסט'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'יועץ עסקי / ארגוני / ניהולי', keywords: ['ייעוץ עסקי', 'ייעוץ ארגוני'], addendumId: 'e', reasoning: 'יועץ לארגון ויועץ לניהול מנויים במפורש.', caveat: 'יועץ שיווק/תדמית אינו ברשימה - יא\'.', confidence: 'high' },
  { label: 'חוקר פרטי', keywords: ['חקירות'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'מתרגם', keywords: ['תרגום'], addendumId: 'e', reasoning: 'מתורגמן מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'טוען רבני', keywords: ['בית דין רבני'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'עורך פטנטים', keywords: ['פטנטים', 'קניין רוחני'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'אגרונום', keywords: ['ייעוץ חקלאי'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'מעבדה רפואית / כימית', keywords: ['מעבדת בדיקות'], addendumId: 'e', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },

  // ── רפואה (תוספת ו') ──
  { label: 'רופא', keywords: ['רופא משפחה', 'מרפאה פרטית'], addendumId: 'f', reasoning: 'תוספת ייעודית - יומן יומי עם שם כל מתרפא.', caveat: null, confidence: 'high' },
  { label: 'רופא שיניים', keywords: ['מרפאת שיניים'], addendumId: 'f', reasoning: 'תוספת ו\' + כרטיס אישי לכל מתרפא ומלאי מתכות עדינות.', caveat: null, confidence: 'high' },
  { label: 'פסיכולוג', keywords: ['טיפול נפשי'], addendumId: 'f', reasoning: 'הגדרת "רופא" כוללת במפורש פסיכולוג.', caveat: 'מטפל רגשי שאינו פסיכולוג מוסמך - יא\'.', confidence: 'high' },
  { label: 'פיזיותרפיסט', keywords: ['פיזיותרפיה', 'שיקום'], addendumId: 'f', reasoning: 'מנוי במפורש בהגדרת רופא.', caveat: null, confidence: 'high' },
  { label: 'וטרינר', keywords: ['וטרינריה', 'חיות מחמד'], addendumId: 'f', reasoning: 'מנוי במפורש בהגדרת רופא.', caveat: 'מכירת מזון/מוצרים בהיקף ניכר - פעילות קמעונאית (ג\') במקביל.', confidence: 'high' },
  { label: 'מטפל אלטרנטיבי', keywords: ['עיסוי', 'דיקור', 'רפלקסולוגיה', 'נטורופתיה'], addendumId: 'k', reasoning: 'רפואה משלימה אינה ברשימות ה\'/ו\' - סעיף הסל.', caveat: null, confidence: 'high' },
  { label: 'דיאטן / תזונאי', keywords: ['תזונה'], addendumId: 'k', reasoning: 'אינו מנוי בו\' או ה\' - ברירת המחדל יא\'.', caveat: 'הרשימות סגורות; אין להרחיבן לדיאטנים.', confidence: 'medium' },

  // ── מסחר (ב'/ג') ──
  { label: 'בית מרקחת', keywords: ['רוקח', 'פארם'], addendumId: 'c', reasoning: 'קמעונאי; מנוי במפורש בדרישות מוגברות (ספר תקבולים כבר ממחזור נמוך).', caveat: null, confidence: 'high' },
  { label: 'חנות בגדים', keywords: ['בוטיק', 'אופנה', 'הלבשה'], addendumId: 'c', reasoning: 'מכירת טובין לצרכן - קמעונאי עם סרט קופה.', caveat: 'מעצבת שתופרת ומוכרת מתוצרתה - יצרן (א\').', confidence: 'high' },
  { label: 'מכולת / מינימרקט', keywords: ['צרכניה'], addendumId: 'c', reasoning: 'קמעונאי; ייתכן מסלול "עוסק יחיד" מקוצר.', caveat: null, confidence: 'high' },
  { label: 'סופרמרקט', keywords: ['רשת מזון'], addendumId: 'c', reasoning: 'קמעונאי.', caveat: null, confidence: 'high' },
  { label: 'ירקן', keywords: ['פירות וירקות'], addendumId: 'c', reasoning: 'מנוי בהגדרת עוסק יחיד.', caveat: 'מגדל שמוכר מתוצרתו - חקלאי (יב\').', confidence: 'high' },
  { label: 'קצביה', keywords: ['בשר', 'אטליז', 'עופות'], addendumId: 'c', reasoning: 'חיתוך ואריזה נלווים למסחר אינם ייצור.', caveat: 'מפעל עיבוד בשר לשיווק - יצרן/סיטונאי.', confidence: 'high' },
  { label: 'חנות פרחים', keywords: ['משלוחי פרחים', 'זרים'], addendumId: 'c', reasoning: 'שזירת זר נלווית למסחר.', caveat: 'מגדל פרחים - חקלאי (יב\').', confidence: 'high' },
  { label: 'פיצוציה / קיוסק', keywords: ['סיגריות', 'חטיפים', 'חנות נוחות'], addendumId: 'c', reasoning: 'קמעונאי.', caveat: null, confidence: 'high' },
  { label: 'חנות תכשיטים', keywords: ['תכשיטים', 'זהב'], addendumId: 'c', reasoning: 'מנויה במפורש; תלוש קופה אינו מחליף חשבונית במתכות יקרות.', caveat: 'צורף שמייצר - א\'; סוחר אבני חן - טז\'.', confidence: 'high' },
  { label: 'חנות תמרוקים', keywords: ['פרפומריה', 'טיפוח'], addendumId: 'c', reasoning: 'מנויה במפורש בדרישות מוגברות.', caveat: null, confidence: 'high' },
  { label: 'אופטיקאי', keywords: ['משקפיים', 'עדשות'], addendumId: 'c', reasoning: 'מנוי במפורש.', caveat: null, confidence: 'high' },
  { label: 'חנות אונליין / איקומרס', keywords: ['אינטרנט', 'אמזון', 'אטסי', 'חנות וירטואלית'], addendumId: 'c', reasoning: 'מכירה לצרכן היא קמעונאות גם כשהיא מקוונת.', caveat: 'מוכר בעיקר לעסקים - ב\'; ממכירת ייצור עצמי - א\'.', confidence: 'high' },
  { label: 'דרופשיפינג', keywords: ['dropshipping', 'שילוח ישיר'], addendumId: 'c', reasoning: 'המוכר בשמו לצרכן = קמעונאי גם ללא מלאי פיזי.', caveat: 'מודל עמלת תיווך בלבד - יא\'; תלוי מי מוציא את החשבונית ללקוח.', confidence: 'medium' },
  { label: 'סיטונאי / יבואן / מפיץ', keywords: ['סיטונאות', 'יבוא', 'B2B', 'הפצה'], addendumId: 'b', reasoning: 'מוכר למי שהטובין מלאי אצלו.', caveat: 'מכירות ניכרות לצרכנים - דרישות קמעונאי על אותו חלק.', confidence: 'high' },
  { label: 'דוכן בשוק', keywords: ['באסטה', 'רוכלות'], addendumId: 'c', reasoning: 'מכירה לצרכן.', caveat: 'לרוכלים זעירים ייתכנו הקלות פרטניות מפקיד השומה.', confidence: 'high' },

  // ── ייצור (א') ──
  { label: 'מפעל / בית מלאכה', keywords: ['ייצור', 'מפעל'], addendumId: 'a', reasoning: 'ייצור, הפקה, הרכבה, השלמה - הגדרת יצרן.', caveat: null, confidence: 'high' },
  { label: 'נגר', keywords: ['נגרות', 'רהיטים', 'מטבחים'], addendumId: 'a', reasoning: 'ייצור רהיטים גם לפי מפרט לקוח = ייצור.', caveat: 'נגר שעיקר עיסוקו תיקונים והתקנות - יא\'.', confidence: 'high' },
  { label: 'מסגר', keywords: ['מסגרות', 'שערים', 'סורגים'], addendumId: 'a', reasoning: 'ייצור מוצרי מתכת לפי הזמנה.', caveat: 'עיקר תיקונים בשטח - יא\'; קונסטרוקציה בבניה - ייתכן ד\'.', confidence: 'high' },
  { label: 'בית דפוס', keywords: ['דפוס', 'הדפסות'], addendumId: 'a', reasoning: 'הדפסה = ייצור, כולל מחומר גלם של אחר.', caveat: 'חנות צילום מסמכים קטנה - בפועל לעיתים יא\'.', confidence: 'high' },
  { label: 'צורף', keywords: ['צורפות', 'תכשיטנות'], addendumId: 'a', reasoning: 'ייצור תכשיטים.', caveat: 'מכירה קמעונאית מוסיפה כללי ג\'; אבני חן - טז\'.', confidence: 'medium' },
  { label: 'תופרת / תיקוני בגדים', keywords: ['תפירה', 'מכפלת'], addendumId: 'k', reasoning: 'תיקון בגדי הלקוח = שירות.', caveat: 'תפירת בגדים חדשים למכירה - ייצור (א\').', confidence: 'high' },

  // ── חינוך והדרכה ──
  { label: 'גן ילדים פרטי', keywords: ['גן', 'פעוטון', 'מעון'], addendumId: 'h', reasoning: 'הגדרת בית ספר כוללת במפורש גן ילדים.', caveat: null, confidence: 'high' },
  { label: 'משפחתון / צהרון', keywords: ['מטפלת ילדים'], addendumId: 'h', reasoning: 'מסגרת חינוך קבועה - כמו גן.', caveat: 'טיפול בילדים בודדים (פחות מ-5) - יא\'.', confidence: 'medium' },
  { label: 'בית ספר פרטי / מכללה / קורסים', keywords: ['מכללה', 'קורס', 'הכשרה', 'אולפן'], addendumId: 'h', reasoning: 'לימוד שיטתי או הדרכה מקצועית - ספר תלמידים.', caveat: 'הדרכה מקרית עד 30 ימי הדרכה בשנה - יא\'.', confidence: 'high' },
  { label: 'מורה פרטי', keywords: ['שיעורים פרטיים'], addendumId: 'k', reasoning: 'הוראה ליחידים או קבוצות מתחת ל-5 אינה "בית ספר".', caveat: 'קבוצות של 5+ באופן שיטתי - ח\'.', confidence: 'high' },
  { label: 'חוגים / סטודיו (יוגה, פילאטיס, מחול)', keywords: ['יוגה', 'פילאטיס', 'מחול', 'חוג'], addendumId: 'h', reasoning: 'הדרכה לאומנויות וספורט בקבוצות של 5+ = בית ספר.', caveat: 'שיעורים פרטיים בלבד - יא\'.', confidence: 'high' },
  { label: 'חדר כושר', keywords: ['מכון כושר', 'ג\'ים'], addendumId: 'h', reasoning: 'שיעורים קבוצתיים = הדרכת ספורט (ח\').', caveat: 'מנוי לשימוש חופשי במתקנים בלבד - יש הרואים בכך שירות (יא\'); נבחן לפי אופי הפעילות.', confidence: 'medium' },
  { label: 'מאמן כושר אישי', keywords: ['אימון אישי', 'פיטנס'], addendumId: 'k', reasoning: 'אימון אחד-על-אחד = שירות.', caveat: 'קבוצות של 5+ - ח\'.', confidence: 'medium' },
  { label: 'מרצה / מנחה סדנאות', keywords: ['הרצאות', 'סדנאות'], addendumId: 'k', reasoning: 'הדרכה מקרית (עד 30 ימי הדרכה) מוחרגת מח\'.', caveat: 'מערך קבוע לקבוצות 5+ מעבר ל-30 יום - ח\'.', confidence: 'high' },

  // ── נדל"ן ופיננסים ──
  { label: 'מתווך דירות', keywords: ['תיווך', 'נדל"ן', 'סוכן נדלן'], addendumId: 'i', reasoning: 'תוספת ייעודית - ספר עסקאות; מעל 620,000 ₪ עמלה - חשבונאות כפולה.', caveat: null, confidence: 'high' },
  { label: 'סוחר מקרקעין / יזם', keywords: ['פליפ דירות', 'עסקאות נדלן'], addendumId: 'i', reasoning: 'מסחר בזכויות במקרקעין - ספר זכויות.', caveat: 'יזם שבונה בעצמו - קבלן (ד\'); משכיר לטווח ארוך אינו סוחר.', confidence: 'high' },
  { label: 'משכיר נכסים (בהיקף עסקי)', keywords: ['שכירות', 'השכרת נכסים'], addendumId: 'k', reasoning: 'השכרה שמגיעה כדי עסק - סעיף הסל.', caveat: 'השכרה פסיבית של דירות מגורים בודדות אינה עסק - לרוב אין חובת פנקסים; מסלולי פטור/10% אינם דורשים ספרים.', confidence: 'medium' },
  { label: 'Airbnb / השכרה לטווח קצר', keywords: ['אירוח קצר', 'דירות נופש'], addendumId: 'k', reasoning: 'בהיקף עסקי - דומה לפנסיון (ספר אורחים).', caveat: 'דירה בודדת - שאלת קיום עסק בכלל.', confidence: 'medium' },
  { label: 'סוכן ביטוח', keywords: ['ביטוח', 'פנסיוני'], addendumId: 'o', reasoning: 'תוספת ייעודית - ספר פוליסות וספר הכנסות; סוכנות מורשית להדפסה - כפולה תמיד.', caveat: 'משווק פנסיוני שאינו סוכן מורשה - יא\'.', confidence: 'high' },
  { label: 'צ\'יינג\' / המרת מטבע', keywords: ['מט"ח', 'המרות'], addendumId: 'k', reasoning: 'מנוי במפורש - שוברי המרה, ספר כניסת מט"ח, מלאי חודשי.', caveat: null, confidence: 'high' },
  { label: 'יהלומן', keywords: ['יהלומים', 'בורסה', 'ליטוש', 'אבני חן'], addendumId: 'p', reasoning: 'תוספת ייעודית לעיבוד, מסחר ותיווך אבנים יקרות.', caveat: null, confidence: 'high' },

  // ── חקלאות ──
  { label: 'חקלאי / משק', keywords: ['חקלאות', 'גידולים'], addendumId: 'l', reasoning: 'תוספת ייעודית - ספר המשק.', caveat: null, confidence: 'high' },
  { label: 'רפת / לול / דיר', keywords: ['ביצים', 'חלב', 'בקר'], addendumId: 'l', reasoning: 'בעלי חיים ותוצרתם = תוצרת חקלאית.', caveat: null, confidence: 'high' },
  { label: 'מטע / כרם / פרדס', keywords: ['מטעים', 'קטיף'], addendumId: 'l', reasoning: 'מדרגות גם לפי שטח (200/375 דונם).', caveat: 'יקב שמייצר יין - הייצור בא\'; הגידול ביב\'.', confidence: 'high' },
  { label: 'משתלה', keywords: ['שתילים', 'צמחי נוי'], addendumId: 'l', reasoning: 'צמחי נוי = תוצרת חקלאית.', caveat: 'קונה צמחים מוכנים ומוכרת לצרכן בלבד - קמעונאי (ג\').', confidence: 'medium' },

  // ── שירותים אישיים ועסקיים (יא') ──
  { label: 'מספרה', keywords: ['ספר', 'עיצוב שיער', 'ברבר'], addendumId: 'k', reasoning: 'שירות לצרכן.', caveat: 'מכירת מוצרים בהיקף ניכר - חובות קמעונאי נלוות.', confidence: 'high' },
  { label: 'קוסמטיקאית', keywords: ['טיפולי פנים', 'פדיקור', 'מניקור'], addendumId: 'k', reasoning: 'שירות.', caveat: null, confidence: 'high' },
  { label: 'מכון יופי / ציפורניים', keywords: ['לק ג\'ל', 'בניית ציפורניים'], addendumId: 'k', reasoning: 'שירות.', caveat: null, confidence: 'high' },
  { label: 'מכבסה / ניקוי יבש', keywords: ['כביסה', 'גיהוץ'], addendumId: 'k', reasoning: 'שירות.', caveat: null, confidence: 'high' },
  { label: 'צלם', keywords: ['צילום אירועים', 'סטודיו'], addendumId: 'k', reasoning: 'שירות עם ספר הזמנות.', caveat: null, confidence: 'high' },
  { label: 'גרפיקאי / מעצב', keywords: ['עיצוב גרפי', 'מיתוג'], addendumId: 'k', reasoning: 'אינו ברשימת ה\' - סעיף הסל.', caveat: null, confidence: 'high' },
  { label: 'מתכנת / פרילנסר הייטק', keywords: ['פיתוח', 'תוכנה', 'בניית אתרים', 'QA'], addendumId: 'k', reasoning: 'מתכנת אינו ברשימה הסגורה של ה\' - נותן שירות.', caveat: 'מהנדס מוסמך העוסק בהנדסה - ניתן לטעון לה\'.', confidence: 'high' },
  { label: 'שיווק דיגיטלי / קמפיינים', keywords: ['פרסום', 'סושיאל', 'קידום אתרים'], addendumId: 'k', reasoning: 'אינו ברשימת ה\'.', caveat: null, confidence: 'high' },
  { label: 'יוטיובר / משפיען', keywords: ['אינפלואנסר', 'תוכן', 'טיקטוק'], addendumId: 'k', reasoning: 'משלח יד ללא תוספת ייעודית - פסקה (2) של סעיף הסל.', caveat: null, confidence: 'high' },
  { label: 'מעצב פנים', keywords: ['עיצוב פנים', 'הום סטיילינג'], addendumId: 'k', reasoning: 'אינו ברשימת ה\' (בשונה מאדריכל).', caveat: 'אדריכל פנים בעל רישיון אדריכל - ה\'.', confidence: 'high' },
  { label: 'די ג\'יי / מוזיקאי אירועים', keywords: ['דיג\'יי', 'להקה', 'הגברה'], addendumId: 'k', reasoning: 'שירותי בידור עם ספר הזמנות.', caveat: null, confidence: 'high' },
  { label: 'קולנוע / אולם מופעים', keywords: ['מופעים', 'כרטיסים', 'עינוג ציבורי'], addendumId: 'k', reasoning: 'מקום עינוג ציבורי - רישום תנועת מלאי כרטיסים.', caveat: null, confidence: 'high' },
];

/** שאלות הכרעה — למי שלא מצא את העסק ברשימה. הסדר חשוב: מהספציפי לסעיף הסל. */
export const DECISION_QUESTIONS: { question: string; answer: string }[] = [
  { question: 'העסק מייצר, מעבד, מרכיב או אורז מוצרים? (גם מחומר גלם של הלקוח, גם לפי הזמנה)', answer: 'כן → תוספת א\' (יצרנים). מיון ואריזה שנלווים למסחר או לשירות אינם ייצור.' },
  { question: 'העסק מוכר סחורה מתוצרת אחרים - למי?', answer: 'בעיקר לעסקים (הסחורה מלאי אצלם) → תוספת ב\' (סיטונאים). לצרכן הסופי → תוספת ג\' (קמעונאים).' },
  { question: 'העסק מבצע עבודות בניה - בניה חדשה, חפירה, הריסה, ביוב, סלילה?', answer: 'כן → תוספת ד\' (קבלנים). שיפוצים ותיקונים בבניינים קיימים → תוספת יא\' עם יומן עבודה.' },
  { question: 'המקצוע ברשימה הסגורה של מקצועות חופשיים או רפואה?', answer: 'עו"ד, רו"ח, יועץ מס, אדריכל, מהנדס, שמאי וכו\' → ה\'. רופא, פסיכולוג, פיזיותרפיסט, וטרינר → ו\'. מקצוע דומה שאינו ברשימה (מתכנת, גרפיקאי) → יא\'.' },
  { question: 'ענף עם תוספת ייעודית?', answer: 'לימוד נהיגה → ז\'; בית ספר/גן/חוגים 5+ → ח\'; מקרקעין → ט\'; רכב → י\'; חקלאות → יב\'; דלק → יד\'; ביטוח → טו\'; יהלומים → טז\'.' },
  { question: 'שום דבר לא התאים?', answer: '→ תוספת יא\' (נותני שירותים ואחרים) - סעיף הסל שחל על כל עסק או משלח יד שלא נכנס לתוספת אחרת.' },
];

// מקור המיון התפעולי של המשרד. גרסה מאושרת 29.10.2026; ללא פרטי לקוחות.
import type { HandbookData } from './model';

export const OFFICE_HANDBOOK: HandbookData = {
  "date": "2026-10-29",
  "scope": "shareable_office_invoice_classification_handbook",
  "audience": "משרדי הנהלת חשבונות",
  "containsClientData": false,
  "rows": [
    {
      "id": "office-01",
      "group": "תוכנות ושירותים",
      "when": "תוכנה או שירות דיגיטלי מספק ישראלי, עם מע״מ",
      "examples": "תוכנה מקומית, חתימה דיגיטלית, דומיין מספק ישראלי",
      "code": "3680",
      "name": "תוכנות ושירותים",
      "secondary": "תוכנות ישראל",
      "note": "השם המשפטי והמסמך קובעים את מדינת הספק.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-02",
      "group": "תוכנות ושירותים",
      "when": "תוכנה או שירות דיגיטלי ישראלי שהמסמך שלו ללא מס תשומות",
      "examples": "גישה למערכת ייצוג; שירות מקומי ללא מע״מ",
      "code": "3680",
      "name": "תוכנות ושירותים",
      "secondary": "תוכנות ושירותים — ישראל ללא מס תשומות",
      "note": "אין להשתמש במשני כדי לעקוף חשבונית מס חסרה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-03",
      "group": "תוכנות ושירותים",
      "when": "תוכנה או שירות דיגיטלי מספק בחו״ל",
      "examples": "Claude / Anthropic, ChatGPT / OpenAI, Workspace, ElevenLabs",
      "code": "3680",
      "name": "תוכנות ושירותים",
      "secondary": "תוכנות חו״ל",
      "note": "גם חיוב בשקלים יכול להיות מספק חו״ל. מטבע נבדק בנפרד. דומיין/חתימה: אותה משפחה, משני לפי הספק.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-04",
      "group": "תוכנות ושירותים",
      "when": "פרסום וקידום העסק",
      "examples": "Google Ads, מודעות Meta, קמפיין",
      "code": "3620",
      "name": "פרסום וקידום מכירות",
      "secondary": "ללא",
      "note": "Google Workspace הוא תוכנה; Google Ads הוא פרסום.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-05",
      "group": "רכב ונסיעות",
      "when": "תדלוק הרכב",
      "examples": "בנזין/סולר בקבלת תחנת דלק",
      "code": "3567",
      "name": "דלק",
      "secondary": "מספר הרכב",
      "note": "מוצרים מחנות הנוחות מסווגים לפי מה שנקנה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-06",
      "group": "רכב ונסיעות",
      "when": "תיקון, טיפול, צמיגים, חלקים או פחחות לרכב",
      "examples": "טיפול תקופתי, צמיגים, חלקים ותיקון פחחות",
      "code": "3566",
      "name": "מוסך וטיפולים",
      "secondary": "מספר הרכב",
      "note": "מעדיפים את הסעיף הזה על ״אחזקת רכב״ הכללי כשמהות הטיפול ברורה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-07",
      "group": "רכב ונסיעות",
      "when": "ביטוח רכב, אגרת רישוי וטסט",
      "examples": "ביטוח חובה/מקיף, אגרת רכב, מכון רישוי",
      "code": "3566",
      "name": "ביטוח רכב ורישוי",
      "secondary": "מספר הרכב",
      "note": "ביטוח עסק שייך לביטוחים. מע״מ נבדק לפי כל רכיב ומסמך.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-08",
      "group": "רכב ונסיעות",
      "when": "חניה",
      "examples": "חניון, חניה בתשלום",
      "code": "3566",
      "name": "חניה",
      "secondary": "מספר הרכב",
      "note": "קנס חניה — קנסות. חניה קבועה בעסק נבדקת לפי ההסדר.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-09",
      "group": "רכב ונסיעות",
      "when": "ליסינג",
      "examples": "תשלום לפי הסכם ליסינג",
      "code": "3566",
      "name": "ליסינג",
      "secondary": "מספר הרכב",
      "note": "מקדמה/רכישה אינה תשלום שוטף אוטומטי.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-10",
      "group": "רכב ונסיעות",
      "when": "השכרת רכב",
      "examples": "חברת השכרת רכב",
      "code": "3566",
      "name": "השכרת רכב",
      "secondary": "מספר הרכב",
      "note": "לפי מהות החוזה; נסיעת חו״ל מקושרת גם לתיק הנסיעה בתיעוד.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-11",
      "group": "רכב ונסיעות",
      "when": "תחבורה ציבורית ונסיעות בארץ",
      "examples": "רכבת, אוטובוס, מונית עסקית",
      "code": "3560",
      "name": "נסיעות",
      "secondary": "ללא",
      "note": "יש גם גרסה ״נסיעות ללא מעמ״. בוחרים לפי המסמך והגדרת הלקוח.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-12",
      "group": "רכב ונסיעות",
      "when": "הוצאה במסגרת נסיעה עסקית לחו״ל",
      "examples": "טיסה, לינה, תחבורה בנסיעה",
      "code": "3660",
      "name": "נסיעות לחול",
      "secondary": "הנסיעה המסוימת",
      "note": "מצרפים מטרה ותאריכים. רכישת מוצר בחו״ל מסווגת לפי המוצר, ולא אוטומטית כנסיעה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-13",
      "group": "משרד וציוד",
      "when": "ציוד משרדי מתכלה",
      "examples": "נייר, דיו ועטים",
      "code": "3680",
      "name": "משרדיות",
      "secondary": "ללא",
      "note": "מכשיר עמיד או ריהוט קטן — ציוד קל; מחשב חדש — רכוש קבוע, בכפוף לחריג מאושר.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-14",
      "group": "משרד וציוד",
      "when": "פריט קטן לשימוש חוזר, עד 500 ₪ לפריט",
      "examples": "מדף קטן, מברשת וכלי עבודה קטנים",
      "code": "3536",
      "name": "ציוד קל",
      "secondary": "ללא",
      "note": "עלות לאחר מס תשומות שניתן לקזז; לעוסק פטור העלות כוללת מע״מ. בוחנים ערכה/נכס יחד. סף זה הוא כלל משרדי למיון.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-15",
      "group": "משרד וציוד",
      "when": "מחשב חדש וציוד עיבוד נתונים",
      "examples": "מחשב נייד/נייח",
      "code": "8050",
      "name": "רכוש קבוע - מחשבים וציוד עיבוד נתונים",
      "secondary": "ללא",
      "note": "מעבירים לרשימת רכוש; חריג הוצאה שוטפת מחייב החלטה מפורשת.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-16",
      "group": "משרד וציוד",
      "when": "טלפון נייד חדש",
      "examples": "רכישת מכשיר",
      "code": "8050",
      "name": "רכוש קבוע - טלפון נייד",
      "secondary": "ללא",
      "note": "חשבון הסלולר השוטף — טלפון נייד 3650.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-17",
      "group": "משרד וציוד",
      "when": "מכונה או ציוד עמיד מעל סף ציוד קל",
      "examples": "מכונת עבודה, מכשיר לעסק",
      "code": "8030",
      "name": "רכוש קבוע - מכונות וציוד",
      "secondary": "ללא",
      "note": "להבחין מרכיב לתיקון ציוד קיים. חריג של קליטה כהוצאה שוטפת טעון אישור פרטני בתיק הלקוח.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-18",
      "group": "משרד וציוד",
      "when": "ריהוט מעל סף ציוד קל",
      "examples": "שולחן, ארון, ספרייה",
      "code": "8060",
      "name": "רכוש קבוע - רהיטים ואביזרים",
      "secondary": "ללא",
      "note": "ריהוט קטן עד הסף — ציוד קל.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-19",
      "group": "משרד וציוד",
      "when": "תיקון שוטף בעסק או בציוד קיים",
      "examples": "תיקון מזגן, תיקון מכונה, חלף שהותקן בתיקון",
      "code": "3550",
      "name": "הוצאות אחזקה ותיקונים",
      "secondary": "ללא",
      "note": "רכישת מכונה חדשה אינה תיקון. שיפוץ משביח נבדק כרכוש.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-20",
      "group": "משרד וציוד",
      "when": "שכירות — חשבון ביתי משותף",
      "examples": "משרד, חנות, קליניקה",
      "code": "3570",
      "name": "שכירות",
      "secondary": "ללא",
      "note": "מיון המקושר למשרד ביתי: מפעיל את אחוז הלקוח לתקופה, ללא קוד משני נוסף. סכום החשבונית המלא נשמר. נדרש אישור פרטני לשכירות דירת מגורים לפני קליטה.",
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-53",
      "group": "משרד וציוד",
      "when": "שכירות — לעסק בלבד",
      "examples": "משרד/קליניקה/נכס עסקי נפרד",
      "code": "3570",
      "name": "שכירות 100%",
      "secondary": "ללא",
      "note": "100% מבסיס הוצאה עסקית שאושר; אינו מפעיל אחוז בית. לא בוחרים גרסה זו כדי לעקוף ייחוס של חשבון ביתי משותף.",
      "displayOrder": 20.1,
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "100% מבסיס ההוצאה שאושר; מע״מ בנפרד."
      }
    },
    {
      "id": "office-21",
      "group": "משרד וציוד",
      "when": "ארנונה — חשבון ביתי משותף",
      "examples": "חיוב עירייה בגין הנכס",
      "code": "3575",
      "name": "ארנונה",
      "secondary": "ללא",
      "note": "מיון המקושר למשרד ביתי: מפעיל את אחוז הלקוח לתקופה, ללא קוד משני נוסף. סכום החשבונית המלא נשמר. ראו פירוט אופן ההכרה בהוצאות הבית בהמשך.",
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-54",
      "group": "משרד וציוד",
      "when": "ארנונה — לעסק בלבד",
      "examples": "משרד/קליניקה/נכס עסקי נפרד",
      "code": "3575",
      "name": "ארנונה 100%",
      "secondary": "ללא",
      "note": "100% מבסיס הוצאה עסקית שאושר; אינו מפעיל אחוז בית. לא בוחרים גרסה זו כדי לעקוף ייחוס של חשבון ביתי משותף.",
      "displayOrder": 21.1,
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "100% מבסיס ההוצאה שאושר; מע״מ בנפרד."
      }
    },
    {
      "id": "office-22",
      "group": "משרד וציוד",
      "when": "ועד בית — חשבון ביתי משותף",
      "examples": "חיוב ועד הנכס",
      "code": "3575",
      "name": "ועד בית",
      "secondary": "ללא",
      "note": "מיון המקושר למשרד ביתי: מפעיל את אחוז הלקוח לתקופה, ללא קוד משני נוסף. סכום החשבונית המלא נשמר. ראו פירוט אופן ההכרה בהוצאות הבית בהמשך.",
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-23",
      "group": "משרד וציוד",
      "when": "חשמל — חשבון ביתי משותף",
      "examples": "חברת החשמל / ספק החשמל",
      "code": "3590",
      "name": "חשמל",
      "secondary": "ללא",
      "note": "מיון המקושר למשרד ביתי: מפעיל את אחוז הלקוח לתקופה, ללא קוד משני נוסף. סכום החשבונית המלא נשמר. ראו פירוט אופן ההכרה בהוצאות הבית בהמשך.",
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-55",
      "group": "משרד וציוד",
      "when": "חשמל — לעסק בלבד",
      "examples": "משרד/קליניקה/נכס עסקי נפרד",
      "code": "3590",
      "name": "חשמל 100%",
      "secondary": "ללא",
      "note": "100% מבסיס הוצאה עסקית שאושר; אינו מפעיל אחוז בית. לא בוחרים גרסה זו כדי לעקוף ייחוס של חשבון ביתי משותף.",
      "displayOrder": 23.1,
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "100% מבסיס ההוצאה שאושר; מע״מ בנפרד."
      }
    },
    {
      "id": "office-24",
      "group": "משרד וציוד",
      "when": "מים — חשבון ביתי משותף",
      "examples": "תאגיד מים",
      "code": "3590",
      "name": "מים",
      "secondary": "ללא",
      "note": "מיון המקושר למשרד ביתי: מפעיל את אחוז הלקוח לתקופה, ללא קוד משני נוסף. סכום החשבונית המלא נשמר. ראו פירוט אופן ההכרה בהוצאות הבית בהמשך.",
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-56",
      "group": "משרד וציוד",
      "when": "מים — לעסק בלבד",
      "examples": "משרד/קליניקה/נכס עסקי נפרד",
      "code": "3590",
      "name": "מים 100%",
      "secondary": "ללא",
      "note": "100% מבסיס הוצאה עסקית שאושר; אינו מפעיל אחוז בית. לא בוחרים גרסה זו כדי לעקוף ייחוס של חשבון ביתי משותף.",
      "displayOrder": 24.1,
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "100% מבסיס ההוצאה שאושר; מע״מ בנפרד."
      }
    },
    {
      "id": "office-25",
      "group": "משרד וציוד",
      "when": "ניקיון ושמירה",
      "examples": "מנקה, חברת ניקיון/שמירה",
      "code": "3595",
      "name": "שמירה וניקיון",
      "secondary": "ללא",
      "note": "לפי השירות בפועל והשימוש העסקי.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-26",
      "group": "משרד וציוד",
      "when": "ביטוח עסק או אחריות מקצועית — ללא מע״מ",
      "examples": "ביטוח משרד, אחריות רו״ח",
      "code": "3515",
      "name": "ביטוחים 100%",
      "secondary": "ללא",
      "note": "לעסק בלבד: אינו מופחת בגלל אחוז משרד ביתי. ביטוח בית מעורב — ביטוחים, לאחר אישור; מסמך עם מע״מ — ביטוחים עם מעמ.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "100% מבסיס ההוצאה שאושר; מע״מ בנפרד."
      }
    },
    {
      "id": "office-58",
      "group": "משרד וציוד",
      "when": "ביטוח הנכס הביתי — לאחר אישור ייחוס",
      "examples": "ביטוח הבית המשותף לעסק ולמגורים",
      "code": "3515",
      "name": "ביטוחים",
      "secondary": "ללא",
      "note": "מפעיל אחוז הבית. אין לבחור בו לביטוח אחריות מקצועית בלעדי לעסק.",
      "displayOrder": 26.1,
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-60",
      "group": "משרד וציוד",
      "when": "ביטוח עסק — מסמך עם מע״מ",
      "examples": "שירות ביטוח/שירות מתאים לעסק במסמך הכולל מע״מ",
      "code": "3515",
      "name": "ביטוחים עם מעמ",
      "secondary": "ללא",
      "note": "מיון מלא שאינו מפעיל אחוז בית; הזכאות והמע״מ נבדקים לפי המסמך.",
      "displayOrder": 26.1,
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "100% מבסיס ההוצאה שאושר; מע״מ בנפרד."
      }
    },
    {
      "id": "office-27",
      "group": "תקשורת",
      "when": "אינטרנט — קו לעסק בלבד",
      "examples": "ספק אינטרנט, Partner עם שירות אינטרנט והשכרת נתב",
      "code": "3650",
      "name": "אינטרנט",
      "secondary": "ללא",
      "note": "100% מבסיס הוצאה שאושר. קו מעורב בבית — אינטרנט יחסי; המיון אינטרנט אינו מפעיל את אחוז הבית.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "100% מבסיס ההוצאה שאושר; מע״מ בנפרד."
      }
    },
    {
      "id": "office-57",
      "group": "תקשורת",
      "when": "אינטרנט — משותף לבית ולעסק",
      "examples": "אינטרנט ונתב בבית בשימוש מעורב",
      "code": "3650",
      "name": "אינטרנט יחסי",
      "secondary": "ללא",
      "note": "מפעיל אחוז משרד ביתי שהמשרד אישר ללקוח ולתקופה. אין להסיק שימוש עסקי מלא לפי שם הספק.",
      "displayOrder": 27.1,
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-28",
      "group": "תקשורת",
      "when": "חשבון סלולר שוטף",
      "examples": "Partner, סלקום, פלאפון — שירות סלולרי",
      "code": "3650",
      "name": "טלפון נייד",
      "secondary": "ללא",
      "note": "אם החשבון כולל מכשיר או שירות נוסף בוחנים את הרכיבים.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-29",
      "group": "תקשורת",
      "when": "טלפון קווי",
      "examples": "קו טלפון בעסק",
      "code": "3650",
      "name": "טלפון קווי",
      "secondary": "ללא",
      "note": "השירות בפועל קובע; לא שם חברת התקשורת בלבד.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-59",
      "group": "תקשורת",
      "when": "תקשורת מעורבת — לפי סוג השירות שאושר",
      "examples": "שירות משותף לעסק ולבית",
      "code": "3650",
      "name": "תקשורת יחסי",
      "secondary": "ללא",
      "note": "מפעיל אחוז בית. אינו כלל גורף לסלולר או לטלפון עם כללי ניכוי מיוחדים.",
      "displayOrder": 29.1,
      "recognition": {
        "homeProfileLinked": true,
        "mode": "client_home_office_percentage",
        "text": "לפי אחוז הבית של הלקוח, לתקופה שאושרה."
      }
    },
    {
      "id": "office-30",
      "group": "תקשורת",
      "when": "דואר",
      "examples": "דואר ישראל, משלוח מסמכים",
      "code": "3650",
      "name": "דואר",
      "secondary": "ללא",
      "note": "משלוח הקשור לרכישת ציוד מצטרף לעלות הרכישה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-31",
      "group": "תקשורת",
      "when": "שליחויות משרדיות",
      "examples": "שליח להעברת מסמכים",
      "code": "3650",
      "name": "שליחויות",
      "secondary": "ללא",
      "note": "הובלת סחורה/יבוא נבחנת לפי הפעילות.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-32",
      "group": "שירותים ומימון",
      "when": "הנהלת חשבונות ושכר טרחת רואה חשבון",
      "examples": "חשבונית שכר טרחה של רואה חשבון או מנהל חשבונות",
      "code": "3540",
      "name": "הנהלת חשבונות",
      "secondary": "ללא",
      "note": "השם האחיד לסיווג שירותי הנהלת חשבונות ושכר טרחה; אין לבחור שירותים מקצועיים בכל פעם מחדש.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-33",
      "group": "שירותים ומימון",
      "when": "ייעוץ עסקי או שירות מקצועי לניהול העסק",
      "examples": "ייעוץ עסקי חד פעמי או שירות מקצועי לניהול העסק",
      "code": "3540",
      "name": "שירותים מקצועיים",
      "secondary": "ללא",
      "note": "אין להשתמש בתוכנות רק משום שהתשלום חודשי. מהות השירות קובעת.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-34",
      "group": "שירותים ומימון",
      "when": "שירות משפטי לעסק",
      "examples": "עורך דין, הליך עסקי",
      "code": "3665",
      "name": "הוצאות משפטיות",
      "secondary": "ללא",
      "note": "שירות פרטי או שירות הקשור לרכישת נכס נבדק לפני מיון.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-35",
      "group": "שירותים ומימון",
      "when": "קבלן המבצע חלק מהשירות ללקוח שלנו",
      "examples": "ביצוע מקצועי בפרויקט לקוח",
      "code": "1310",
      "name": "עבודות חוץ וקבלני משנה",
      "secondary": "ללא",
      "note": "שונה מייעוץ לניהול העסק עצמו.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-36",
      "group": "שירותים ומימון",
      "when": "עמלת סליקה",
      "examples": "PayMe, חברת סליקה",
      "code": "3100",
      "name": "עלויות סליקה",
      "secondary": "ללא",
      "note": "שירות תוכנה אצל אותו ספק — תוכנות ושירותים; מפרידים רכיבים.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-37",
      "group": "שירותים ומימון",
      "when": "עמלת בנק",
      "examples": "דמי ניהול ועמלות בנקאיות",
      "code": "3100",
      "name": "עמלות בנק",
      "secondary": "ללא",
      "note": "ריבית בנפרד; קרן הלוואה אינה הוצאה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-38",
      "group": "שירותים ומימון",
      "when": "ריבית בנקאית",
      "examples": "ריבית עסקית לתאגיד בנקאי",
      "code": "5010",
      "name": "לתאגידים בנקאיים",
      "secondary": "ללא",
      "note": "החזר קרן ושימוש פרטי נבדקים בנפרד.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-39",
      "group": "שירותים ומימון",
      "when": "קורס, כנס וספרות מקצועית",
      "examples": "קורס שיווק לעסק, כנס מקצועי, ספר מקצועי",
      "code": "3600",
      "name": "השתלמות וספרות מקצועית",
      "secondary": "ללא",
      "note": "תוכנת לימוד ומנוי לכלי עבודה אינם אותו דבר. רכישת מקצוע חדש/תואר נבדקת בנפרד.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-40",
      "group": "שירותים ומימון",
      "when": "דמי חבר מקצועיים",
      "examples": "לשכת רואי חשבון, איגוד מקצועי",
      "code": "3600",
      "name": "דמי חבר",
      "secondary": "ללא",
      "note": "אגרת רישיון ממשלתית — מיסים ואגרות.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-41",
      "group": "שירותים ומימון",
      "when": "אגרת רישיון מקצועי או רישיון עסק",
      "examples": "אגרת רישיון רו״ח, רישיון עסק",
      "code": "3575",
      "name": "מיסים ואגרות",
      "secondary": "ללא",
      "note": "תשלום מס אישי או ביטוח לאומי אישי נבחן בנפרד. בקטלוג שנבדק הסעיף מסומן ״עבודה מהבית״. לפני קליטת אגרה עסקית יש לבדוק את הגדרת הסעיף; אין להפחית אגרת עסק לפי אחוז הבית אוטומטית.",
      "recognition": {
        "homeProfileLinked": true,
        "mode": "manual_review",
        "text": "לבירור הגדרת הסעיף לפני קליטה; לא מפעילים אחוז בית על אגרת עסק אוטומטית."
      }
    },
    {
      "id": "office-42",
      "group": "פעילות והוצאות נוספות",
      "when": "חומר שמשמש בטיפול או בתהליך העבודה",
      "examples": "צבע לטיפול במספרה, חומרי עבודה מתכלים",
      "code": "1330",
      "name": "קניות חומרי גלם וחומרי בנייה בארץ ובחול",
      "secondary": "ללא",
      "note": "מוצר שנקנה כדי למכור ללקוח — קניות סחורה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-43",
      "group": "פעילות והוצאות נוספות",
      "when": "מוצרים למכירה שנקנו בישראל",
      "examples": "שמפו שנקנה למכירה",
      "code": "1320",
      "name": "קניות סחורה בארץ",
      "secondary": "ללא",
      "note": "כלי עבודה לשימוש במספרה — ציוד קל/רכוש לפי הכלל.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-44",
      "group": "פעילות והוצאות נוספות",
      "when": "מוצרים למכירה שנקנו בחו״ל",
      "examples": "סחורה למכירה מיובאת",
      "code": "1340",
      "name": "קניית סחורות בחול",
      "secondary": "ללא",
      "note": "מיון לפי מהות הרכישה; לא כל רכישה בחו״ל היא סחורה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-45",
      "group": "פעילות והוצאות נוספות",
      "when": "כיבוד קל לעסק עם מע״מ במסמך",
      "examples": "שתייה וכיבוד קל",
      "code": "3625",
      "name": "כיבודים עם מעמ",
      "secondary": "ללא",
      "note": "ההכרה למס נבחנת בנפרד; ארוחה פרטית אינה כיבוד אוטומטי.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-46",
      "group": "פעילות והוצאות נוספות",
      "when": "כיבוד קל לעסק ללא מע״מ במסמך",
      "examples": "כיבוד ללא מס תשומות",
      "code": "3625",
      "name": "כיבודים ללא מעמ",
      "secondary": "ללא",
      "note": "זהות המוצר והשימוש העסקי נדרשים גם כשאין מע״מ.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-47",
      "group": "פעילות והוצאות נוספות",
      "when": "מתנה ללקוח או לספק",
      "examples": "מתנה עסקית מתועדת",
      "code": "3625",
      "name": "מתנות",
      "secondary": "ללא",
      "note": "מתעדים מקבל ומטרה; מתנה לעובד נבדקת כשכר.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-48",
      "group": "פעילות והוצאות נוספות",
      "when": "תרומה",
      "examples": "קבלה על תרומה",
      "code": "3625",
      "name": "תרומות",
      "secondary": "ללא",
      "note": "נבחנת בנפרד מהוצאה עסקית רגילה לצורכי מס.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-49",
      "group": "פעילות והוצאות נוספות",
      "when": "קנס",
      "examples": "קנס חניה, קנס מנהלי",
      "code": "3625",
      "name": "קנסות",
      "secondary": "ללא",
      "note": "דמי חניה רגילים — חניה 3566.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-50",
      "group": "פעילות והוצאות נוספות",
      "when": "בגדי עבודה",
      "examples": "מדים או ביגוד מגן לעסק",
      "code": "3685",
      "name": "בגדי עבודה",
      "secondary": "ללא",
      "note": "בגד רגיל מחייב בירור שימוש; לא מסווגים אוטומטית.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-51",
      "group": "לבירור",
      "when": "תשלום אישי, מקדמת מס או ביטוח לאומי אישי",
      "examples": "מס הכנסה, דמי ביטוח לאומי, הפקדה אישית",
      "code": "",
      "name": "טיפול אישי / תשלומי מס — לבדיקת משרד",
      "secondary": "ללא",
      "note": "אין לשייך למיסים ואגרות עסקיים כדי לסיים קליטה.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    },
    {
      "id": "office-52",
      "group": "לבירור",
      "when": "פריט שהמהות או השימוש שלו אינם ברורים",
      "examples": "חשבונית מעורבת או ענף שטרם מופה",
      "code": "",
      "name": "לבירור עם מסמך לדוגמה",
      "secondary": "ללא",
      "note": "קובעים כלל ומוסיפים לאותה טבלה. אין לבחור ״שונות״ או לפתוח משני לכל ספק.",
      "recognition": {
        "homeProfileLinked": false,
        "mode": "section_specific",
        "text": "לפי כלל הסעיף; ללא הפחתת בית."
      }
    }
  ],
  "homeOffice": {
    "date": "2026-10-29",
    "scope": "home_office_recognition",
    "source": {
      "catalog": "קטלוג קודי המיון שנבדק; יש לאמת את ההגדרות במשרד המיישם",
      "homeFlagColumn": "עבודה מהבית",
      "paperlessGuide": "https://academy-ac.paperless.tax/he/articles/11124680",
      "incomeTax": "https://www.btl.gov.il/Laws1/02_0103_000000.pdf",
      "vat": "https://www.gov.il/BlobFolder/legalinfo/law6317-04-14/he/LegalInformation_kesher_6317-04-14.pdf"
    },
    "entries": [
      {
        "kind": "חשמל",
        "code": "3590",
        "homeName": "חשמל",
        "businessName": "חשמל 100%",
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "חשבון משותף לדירה — לפי אחוז הלקוח; מונה/משרד עסקי נפרד — המיון המלא."
      },
      {
        "kind": "מים",
        "code": "3590",
        "homeName": "מים",
        "businessName": "מים 100%",
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "אותו עיקרון: חשבון ביתי משותף לעומת הוצאה עסקית נפרדת."
      },
      {
        "kind": "ארנונה",
        "code": "3575",
        "homeName": "ארנונה",
        "businessName": "ארנונה 100%",
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "לפי הנכס שבחשבון והשימוש המאושר; ארנונה אינה כוללת מס תשומות."
      },
      {
        "kind": "ועד בית",
        "code": "3575",
        "homeName": "ועד בית",
        "businessName": null,
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "קוד זה מקושר לבית. לא נמצא בקטלוג שנבדק סעיף בשם ועד בית 100%; חיוב לעסק נפרד יובא לבחירת מיון מאושרת, בלי להמציא קוד."
      },
      {
        "kind": "שכירות",
        "code": "3570",
        "homeName": "שכירות",
        "businessName": "שכירות 100%",
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "שכירות דירת מגורים אינה מאושרת אוטומטית בגלל אחוז הבית. נדרש אישור פרטני לחוזה ולטיפול המס/ניכוי במקור לפני קליטה."
      },
      {
        "kind": "אינטרנט",
        "code": "3650",
        "homeName": "אינטרנט יחסי",
        "businessName": "אינטרנט",
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "משותף לבית ולעסק — יחסי לפי האחוז שאושר. קו המשמש לעסק בלבד — אינטרנט. שם הספק אינו קובע שימוש."
      },
      {
        "kind": "ביטוח הנכס",
        "code": "3515",
        "homeName": "ביטוחים",
        "businessName": "ביטוחים 100%",
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "הגרסה היחסית מיועדת לביטוח בית שהותר לייחוס. ביטוח עסק או אחריות מקצועית בלעדיים אינם מופחתים בגלל עבודה מהבית. למסמך עם מע״מ קיימת גרסה נפרדת."
      },
      {
        "kind": "תקשורת מעורבת",
        "code": "3650",
        "homeName": "תקשורת יחסי",
        "businessName": "תקשורת 100%",
        "homeProfileLinked": true,
        "businessProfileLinked": false,
        "secondary": "ללא",
        "recognition": "בסיס ההוצאה לייחוס × אחוז משרד ביתי מאושר של הלקוח לתקופה",
        "requiresApprovedPercentageAndEffectivePeriod": true,
        "requiresExplicitVatTreatment": true,
        "exampleCalculationScope": "no_input_vat_deducted",
        "note": "לבחירה כשזהו סוג השירות שאושר; אין להעתיק את שיעור הבית אוטומטית לחשבון סלולר או לטלפון עם כללי הכרה משלו."
      }
    ],
    "missingPercentage": "לבירור; חסר אינו אפס",
    "explicitZero": "אין חלק מוכר בחשבון הביתי המשותף; הוצאה עסקית נפרדת נבחנת במיון המלא",
    "thirtyPercent": "דוגמה בלבד; לא נקבעה כאן תקרה חוקית או זכאות אוטומטית",
    "vat": "החישוב והדוגמאות כאן ללא קיזוז מס תשומות; במורשה יש לקבוע בנפרד טיפול במע״מ ובסיס הוצאה, ולבדוק תוצאת המערכת",
    "avoidDoubleAllocation": true,
    "examples": [
      {
        "gross": 1000,
        "percent": 0,
        "deductible": 0,
        "vatDeducted": 0
      },
      {
        "gross": 1000,
        "percent": 10,
        "deductible": 100,
        "vatDeducted": 0
      },
      {
        "gross": 1000,
        "percent": 20,
        "deductible": 200,
        "vatDeducted": 0
      },
      {
        "gross": 1000,
        "percent": 25,
        "deductible": 250,
        "vatDeducted": 0
      },
      {
        "gross": 1000,
        "percent": 30,
        "deductible": 300,
        "vatDeducted": 0
      }
    ],
    "mechanism": {
      "primaryCode": "3590",
      "primaryName": "חשמל",
      "homeOfficeFlag": true,
      "percentageSource": "אחוז משרד ביתי בכרטיס הלקוח",
      "secondaryRequired": false,
      "fullBusinessPrimaryName": "חשמל 100%",
      "fullBusinessHomeOfficeFlag": false,
      "example": {
        "profilePercent": 25,
        "documentGross": 1000,
        "recognizedExpense": 250,
        "inputVatDeducted": 0
      },
      "examplesAreFictional": true
    }
  },
  "source": "שמות וקודי סעיף, שיעורי 100% וסימון עבודה מהבית אומתו מול קטלוג פייפרלס; יש לוודא הגדרות במשרד המיישם. כלל הלקוח תלוי באישור ובתחולה",
  "generalLightEquipmentThreshold": 500,
  "secondaryDefault": "ללא",
  "exceptions": [],
  "exceptionPolicy": "חריגים מאושרים נשמרים בתיק הלקוח ואינם נכללים במדריך הכללי לשיתוף"
};

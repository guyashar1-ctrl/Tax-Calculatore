המשך את פרויקט PIVO — תשתית המס. חבילת איסוף הנתונים (קליטה, דוח שנתי, הצהרת הון) **בייצור מ-13.10.2026**. הבא בתור: סגירת האיסוף (טלפון אמיתי + ניקוי לקוח הבדיקה), ואז חבילת ידע המס.

קרא קודם, בסדר הזה:
1. נקודת ההמשך המחייבת — סעיפים A עד I בראש הקובץ:
   C:\Users\guyas\pivo-wt\tax-foundation\docs\tax-foundation\CONTINUATION.md
2. מסמך השחרור (מה עלה, איך אומת, התאוששות) — במאסטר:
   C:\Users\guyas\pivo-wt\tax-collection-rc\docs\RELEASE-TAX-COLLECTION-2026-10-12.md
3. נקודת ההתאוששות ומניפסט נתוני הבדיקה בייצור:
   C:\Users\guyas\PIVO\backups\collection-20261013\README.md ו-qa-test-data-manifest.md
4. חבילת הידע העצורה: ראש C:\Users\guyas\pivo-wt\tax-knowledge-release\docs\RELEASE-TAX-KNOWLEDGE-2026-10-11.md
5. הנחיות: C:\Users\guyas\Desktop\code Projects\Tax Calculator\CLAUDE.md, docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md ו-docs/RELEASE-VISUAL-GUIDE-POLICY.md (מדריך חזותי לכל שחרור).

עותקים (לבדוק git status בפועל; אין stash, checkout, reset או clean):
- master העדכני: C:\Users\guyas\pivo-wt\tax-collection-rc (נקי, = origin/master אחרי 0b91ef5). חבילה חדשה — על origin/master העדכני.
- מקור הקוד: C:\Users\guyas\pivo-wt\tax-foundation (בסיס ישן b9588ca, שינויים רבים שלא נשמרו) — ידע המס, הערכת המס 231–232, הדוח השנתי 233.

המשימה (סעיף H ב-CONTINUATION):
1. אם גיא דיווח שבדק בטלפון אמיתי ואישר ניקוי — לנקות את לקוח הבדיקה בייצור לפי המניפסט בלבד, ולאמת 0 שאריות (שורות ואחסון).
2. חבילת ידע המס (F + F2 בעמודי הלימוד), על master עדכני; לסיים בבקשת אישור אחת עם מדריך חזותי.
3. אחריה: הערכת מס (231–232), ואז הכנת הדוחות (233, 1301, 1219, השוואת הון).

הרשאות (סעיף G): קריאה בלבד בייצור וב-staging מותרת. כל שינוי בייצור (כולל ניקוי), commit/push של חבילה חדשה, שליחה ללקוחות או הודעות — רק אחרי אישור מפורש של גיא בצ'אט.

בסיום: מה נעשה ואיך אומת, מה נבדק, מה נשאר. לעדכן את CONTINUATION.md, את מסמך החבילה ו-docs/CODEX-PROJECT-STATE.md בעותק הראשי.

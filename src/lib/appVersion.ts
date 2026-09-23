// ─── זיהוי גרסה חדשה של האפליקציה — טהור ────────────────────────────────────
// ‼ 23.09.2026 · PIVO היא אפליקציית עמוד אחד עם ניתוב hash: מעבר בין מסכים
// אינו טוען קוד מחדש. לשונית שנפתחה לפני פריסה ממשיכה להריץ את הגרסה הישנה
// שעות — וכך תיקון שכבר חי בפרודקשן «לא עבד» אצל הרו"ח. ה-index.html מוגש
// עם max-age=0, ולכן די לבדוק לאיזה bundle הוא מפנה עכשיו.

/** שם ה-bundle הראשי (index-XXXX.js) מתוך HTML או מתוך כתובת סקריפט. */
export function mainBundleName(htmlOrSrc: string | null | undefined): string | null {
  const m = /\/assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(String(htmlOrSrc ?? ''));
  return m ? m[1] : null;
}

/** יש גרסה חדשה רק כששני השמות ידועים ושונים — אחרת לא מטרידים. */
export function isNewVersionAvailable(currentBundle: string | null, servedHtml: string | null | undefined): boolean {
  const served = mainBundleName(servedHtml);
  return !!currentBundle && !!served && served !== currentBundle;
}

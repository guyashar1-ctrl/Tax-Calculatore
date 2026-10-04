// ─── הנוסח בוואטסאפ כשהרו"ח שולח את הקישור לדף בעצמו ─────────────────────────
// ‼ אותו כלל כמו המייל (firstPageEmailKind ב-supabase/functions/_shared/stepTemplates.ts,
// מועתק — לא מיובא, זה קוד של השרת): «פתחנו לך דף… תהליך ההצטרפות» רק כשיש קליטה
// פתוחה ועוד לא יצא ללקוח מייל דף. כל השאר (דוח שנתי, בקשה ידנית, לקוח שכבר קיבל
// מייל) — נוסח ניטרלי, בלי «פתחנו» ובלי «הצטרפות».

/** סוגי המיילים שנחשבים «מייל דף» (_client_first_page_email, 214). */
export const PAGE_EMAIL_KINDS = ['process_open', 'documents_sent', 'status_update', 'portal_reminder'] as const;

/** קליטה פתוחה ועוד לא יצא מייל דף ⇒ נוסח «ברוכים הבאים». */
export function portalShareWelcome(openIntake: boolean, hadPageEmail: boolean): boolean {
  return openIntake && !hadPageEmail;
}

export function portalShareText(clientName: string, link: string, welcome: boolean): string {
  const first = clientName.trim().split(/\s+/)[0] || '';
  const hello = first ? `היי ${first},` : 'היי,';
  const body = welcome
    ? 'פתחנו לך דף אישי שבו מרוכז כל תהליך ההצטרפות - מה כבר הושלם, מה בטיפולנו, ומה ממתין לך:'
    : 'יש לך דף אישי שבו מרוכז כל מה שפתוח מולנו - מה כבר הושלם, מה בטיפולנו, ומה ממתין לך:';
  return `${hello}\n${body}\n${link}\nהדף מתעדכן מעצמו, אפשר לחזור אליו מאותו קישור בכל שלב.`;
}

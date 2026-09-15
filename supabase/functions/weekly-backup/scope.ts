// תיחום הגיבוי לפרופיל אחד — טהור (בלי Deno/supabase-js) כדי שהמבחן
// scripts/staging-test-edge-atomic.mjs יריץ בדיוק את הקוד שנפרס.
//
// ‼ עד 174 הגיבוי אסף את **כל** הטבלאות של **כל** המשרדים לקובץ אחד, וכל בעל
// פרופיל קיבל דיווח עליו. משרד אחד לא אמור לדעת אפילו כמה לקוחות יש לאחר;
// לכן הקובץ נבנה לכל פרופיל בנפרד, ושם האובייקט מתחיל במזהה המשתמש.

/** כל טבלאות המידע שנכללות בגיבוי, ואיך כל אחת מתוחמת לפרופיל. */
export type TableScope =
  | { kind: "user_id" }                       // עמודת user_id
  | { kind: "profile_id" }                    // profiles.id
  | { kind: "session" }                       // דרך annual_report_sessions.user_id
  | { kind: "own_email" };                    // authorized_users — רק השורה של הכתובת עצמה

export const TABLE_SCOPES: Record<string, TableScope> = {
  clients: { kind: "user_id" },
  tasks: { kind: "user_id" },
  leads: { kind: "user_id" },
  quotations: { kind: "user_id" },
  quotation_templates: { kind: "user_id" },
  quotation_counters: { kind: "user_id" },
  service_catalog: { kind: "user_id" },
  representation_requests: { kind: "user_id" },
  cases: { kind: "user_id" },
  documents: { kind: "user_id" },
  document_task_links: { kind: "user_id" },
  employees: { kind: "user_id" },
  profiles: { kind: "profile_id" },
  annual_report_sessions: { kind: "user_id" },
  annual_report_answers: { kind: "session" },
  annual_report_model_snapshots: { kind: "session" },
  email_messages: { kind: "user_id" },
  authorized_users: { kind: "own_email" },
};

export const TABLES = Object.keys(TABLE_SCOPES);

/** שם האובייקט בדלי "backups": תיקייה לכל משתמש, קובץ ליום. */
export function backupObjectName(userId: string, dateStr: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error(`bad user id: ${userId}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error(`bad date: ${dateStr}`);
  return `${userId}/backup-${dateStr}.json`;
}

/** חלוקה לקבוצות — מסנן in(...) עם אלפי מזהים חורג מאורך URL. */
export function chunk<T>(list: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// תיחום הגיבוי לפרופיל אחד — טהור (בלי Deno/supabase-js) כדי שהמבחן
// scripts/staging-test-edge-atomic.mjs יריץ בדיוק את הקוד שנפרס.
//
// ‼ עד 174 הגיבוי אסף את **כל** הטבלאות של **כל** המשרדים לקובץ אחד, וכל בעל
// פרופיל קיבל דיווח עליו. משרד אחד לא אמור לדעת אפילו כמה לקוחות יש לאחר;
// לכן הקובץ נבנה לכל פרופיל בנפרד, ושם האובייקט מתחיל במזהה המשתמש.
//
// ‼ (10.10.2026) הרשימה נכתבה ביד ונעצרה ב-23.09: בקשות, הסכמים, הספרייה,
// המסלולים, הפגישות ואנשי הקשר לא נשמרו. מעכשיו כל טבלה ב-supabase/*.sql חייבת
// להופיע כאן או ב-EXCLUDED עם סיבה — backupScope.test.ts נופל על טבלה חדשה שנשכחה.

/** איך טבלה מתוחמת לפרופיל אחד. */
export type TableScope =
  | { kind: "user_id"; column?: string }      // עמודת בעלים (ברירת מחדל user_id)
  | { kind: "profile_id" }                    // profiles.id
  | { kind: "office" }                        // office_id = profiles.office_id
  | { kind: "own_email" }                     // authorized_users — רק השורה של הכתובת עצמה
  | { kind: "via"; column: string; parent: string } // column ∈ מזהי השורות שכבר נאספו מ-parent
  | { kind: "any"; of: TableScope[] };        // איחוד, בלי כפילויות לפי המפתח

// ‼ הסדר קובע: טבלת הורה (parent של via) חייבת להופיע לפני הילדים שלה.
export const TABLE_SCOPES: Record<string, TableScope> = {
  profiles: { kind: "profile_id" },
  authorized_users: { kind: "own_email" },
  employees: { kind: "user_id" },
  // לקוחות ואנשים
  clients: { kind: "user_id" },
  leads: { kind: "user_id" },
  contacts: { kind: "user_id" },
  meetings: { kind: "user_id" },
  tasks: { kind: "user_id" },
  cases: { kind: "user_id" },
  // הצעות, הסכמים ותשלומים
  quotations: { kind: "user_id" },
  quotation_templates: { kind: "user_id" },
  quotation_counters: { kind: "user_id" },
  service_catalog: { kind: "user_id" },
  engagements: { kind: "user_id" },
  additional_charges: { kind: "user_id" },
  retainer_direct_payments: { kind: "user_id" },
  // בקשות ומסלולים
  representation_requests: { kind: "user_id" },
  // 311: קבוצות של המשרד אצל לקוח — לפני הבקשות שמפנות אליהן (work_group_id).
  client_work_groups: { kind: "user_id" },
  onboarding_steps: { kind: "user_id" },
  onboarding_step_dependencies: { kind: "user_id" },
  onboarding_events: { kind: "user_id" },
  request_participant_links: { kind: "user_id" },
  journey_stages: { kind: "user_id" },
  flow_runs: { kind: "user_id" },
  client_notices: { kind: "user_id" },
  client_notice_items: { kind: "via", column: "step_id", parent: "onboarding_steps" },
  client_step_notice_state: { kind: "via", column: "step_id", parent: "onboarding_steps" },
  client_home_office_answers: { kind: "user_id" },
  client_home_office_approvals: { kind: "user_id" },
  accountant_notifications: { kind: "user_id" },
  // ספרייה ומסלולים של המשרד (שייכים למשרד, לא למשתמש)
  journey_templates: { kind: "any", of: [{ kind: "user_id" }, { kind: "office" }] },
  office_journey_defaults: { kind: "office" },
  office_flows: { kind: "office" },
  office_flow_versions: { kind: "via", column: "flow_id", parent: "office_flows" },
  // מסמכים
  document_folders: { kind: "user_id" },
  document_labels: { kind: "user_id" },
  documents: { kind: "user_id" },
  document_clients: { kind: "user_id" },
  document_task_links: { kind: "user_id" },
  document_pdf_builds: { kind: "user_id" },
  document_organize_log: { kind: "any", of: [{ kind: "user_id", column: "folder_user_id" }, { kind: "via", column: "doc_id", parent: "documents" }] },
  // רשויות, דוחות וטפסים
  tax_fact_changes: { kind: "user_id" },
  // 229 · שנת מס: עובדות, ראיות, שאלות ללקוח והעברות מהכרטיס
  tax_year_facts: { kind: "user_id" },
  tax_evidence: { kind: "user_id" },
  tax_info_asks: { kind: "user_id" },
  // 266 · העותק הנסתר של עבודות מס שנמחקו לגמרי (לבדיקות) — בגיבוי, כי זה בדיוק מה שמשחזרים ממנו טעות
  tax_work_trash: { kind: "user_id" },
  tax_card_transfers: { kind: "user_id" },
  // 231 · גרסאות הערכת מס — קלט, הנחות, הכרעות ותוצאה (הגרסה המאושרת אינה ניתנת לשחזור מחישוב חוזר)
  tax_estimates: { kind: "user_id" },
  annual_returns: { kind: "user_id" }, // 233 · גרסאות הדוח השנתי (17.10.2026)
  annual_return_signings: { kind: "user_id" }, // 297 · החתימה על סט הדוח השנתי בדף האישי (25.10.2026)
  // 250 · חובות הגשה שנקלטו מרשימות שע״ם ומקורות הקליטה (הקובץ עצמו בדלי office-imports)
  shaam_filing_sources: { kind: "user_id" },
  shaam_filing_obligations: { kind: "user_id" },
  shaam_filing_source_effects: { kind: "user_id" }, // 305 · מה כל העלאה עשתה — הבסיס ל«ביטול ההעלאה»
  // 281 · «ידע מקצועי»: השאלות שנשאלו ו«מה אני לומד» (הקבצים עצמם בדלי knowledge-inbox)
  knowledge_questions: { kind: "user_id" },
  knowledge_inbox: { kind: "user_id" },
  btl_portal_facts: { kind: "user_id" },
  btl_portal_documents: { kind: "user_id" },
  automation_jobs: { kind: "user_id" },
  annual_report_sessions: { kind: "user_id" },
  annual_report_answers: { kind: "via", column: "session_id", parent: "annual_report_sessions" },
  annual_report_model_snapshots: { kind: "via", column: "session_id", parent: "annual_report_sessions" },
  smart_form_filings: { kind: "user_id" },
  smart_form_revisions: { kind: "user_id" },
  smart_form_events: { kind: "user_id" },
  smart_form_mappings: { kind: "user_id", column: "created_by" },
  // מיילים ומפת הדרך
  email_messages: { kind: "user_id" },
  vision_docs: { kind: "user_id" },
};

/** טבלאות שלא נכנסות לגיבוי בכוונה — ולמה. אחרי שחזור מחברים אותן מחדש. */
export const EXCLUDED: Record<string, string> = {
  google_calendar_connections: "מפתח גישה ליומן Google — סוד; מחברים מחדש ב«המשרד ← חיבורים»",
  automation_workers: "רישום מחשב העבודה (טביעת מפתח) — משייכים מחדש",
  automation_workstation_pairings: "קודי שיוך חד-פעמיים למחשב העבודה",
  automation_job_followups: "תור «הפעל הכול» קצר-חיים (270) — מה שלא שוחרר מפעילים שוב בלחיצה",
  invariant_check_runs: "יומן ריצות של הבדיקה היומית (282) — נבנה מחדש בריצה הבאה; ההפרות עצמן נפתחות כמשימות (שבגיבוי)",
  pivo_weekly_notes: "בוטלה ב-244 (15.10.2026) — «PIVO השבוע» נשמר עם השבוע במפת הדרך (vision_docs, שבגיבוי)",
  // 285 · רשימות ציבוריות שנבנות מחדש מהמקור — לא נתוני משרד
  il_localities: "רשימת היישובים של רשות האוכלוסין — scripts/load-il-address-lists.mjs",
  il_streets: "רשימת הרחובות של רשות האוכלוסין — scripts/load-il-address-lists.mjs",
  il_locality_aliases: "שמות נרדפים קבועים — במיגרציה 285",
  tax_eligible_localities: "היישובים המזכים — 285-eligible-localities-seed.sql (נוצר מהקוד)",
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

/** מזהה שורה לאיחוד בלי כפילויות: id אם יש, אחרת כל השורה. */
export const rowKey = (row: Record<string, unknown>): string => (row.id != null ? `id:${String(row.id)}` : JSON.stringify(row));

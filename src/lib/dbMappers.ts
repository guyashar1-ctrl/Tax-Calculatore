import type {
  Client,
  Task,
  RepresentationRequest,
} from '../types';
import type { Employee } from '../types/clientWorkspace';
import type { FirmProfile } from '../types/firmProfile';
import type {
  Lead,
  ServiceCatalogItem,
  QuotationTemplate,
  Quotation,
} from '../types/quotations';
import type { Engagement, OnboardingStep, OnboardingEvent } from '../types/onboarding';
import type { AdditionalCharge } from '../types/charges';
import type { TaxFactChange } from '../types/taxFacts';
import type { AutomationJob, AutomationWorker } from '../types/automation';

function toSnake(s: string): string {
  // Convert camelCase / PascalCase to snake_case, treating runs of uppercase
  // letters as a single acronym. e.g. "completedIDF" → "completed_idf",
  // "XMLParser" → "xml_parser", "birthDate" → "birth_date".
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function rowToObject<T>(row: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[toCamel(k)] = v === null ? undefined : v;
  }
  return out as T;
}

function objectToRow<T extends Record<string, any>>(obj: T, exclude: string[] = []): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (exclude.includes(k)) continue;
    if (v === undefined) continue;
    // Skip empty strings: PostgreSQL rejects '' for date/numeric columns. Letting the
    // column take its default (NULL) is the consistent behavior across all column types.
    if (v === '') continue;
    out[toSnake(k)] = v;
  }
  return out;
}

// ───────────────────────────────────────── Client ─────────────────────────

// ‼ lifecycle_stage ו-merged_from_lead_id נכתבים בשרת בלבד (refresh_lifecycle_stages
// והמיזוג). שמירה רגילה של הכרטיס לא מחזירה אותם: המסך עלול להחזיק ערך שהתיישן
// מרגע הטעינה, ושליחתו בחזרה הייתה מגלגלת את השלב אחורה. העברה לארכיון כותבת את
// העמודה ישירות (setClientLifecycleStage ב-useClients) ולא דרך המיפוי הזה.
const CLIENT_OMIT_ON_WRITE = ['updatedAt', 'lifecycleStage', 'mergedFromLeadId'];

// שדות מחרוזת שהאפליקציה מניחה שתמיד קיימים (קוראת עליהם .charAt/.toLowerCase/.localeCompare).
// ב-DB הם עלולים להיות null (למשל לקוח שנוצר חלקית / יובא) — מאפסים ל-'' כדי שלא יקרוס.
const CLIENT_STRING_FIELDS = [
  'firstName', 'lastName', 'idNumber', 'phone', 'email', 'city', 'address',
  'birthDate', 'spouseName', 'spouseIdNumber',
] as const;

export function clientFromDb(row: Record<string, any>): Client {
  const c = rowToObject<Client>(row);
  for (const k of CLIENT_STRING_FIELDS) {
    if ((c as any)[k] == null) (c as any)[k] = '';
  }
  if (!c.children) c.children = [] as any;
  if (!c.tags) c.tags = [];
  // ארבע הרשימות החדשות — ברירת מחדל [] אם null/undefined ב-DB
  if (!c.investmentAccounts) c.investmentAccounts = [];
  if (!c.bankAccounts) c.bankAccounts = [];
  if (!c.employers) c.employers = [];
  if (!c.pensionFunds) c.pensionFunds = [];
  // הרשימות הנוספות לכיסוי 1301
  if (!c.additionalCitizenships) c.additionalCitizenships = [];
  if (!c.dependentRelatives) c.dependentRelatives = [];
  if (!c.businesses) c.businesses = [];
  return c;
}

// שדות הליד שהועתקו ללקוח (שם עסק, סוג עוסק, פרטי הרו"ח הקודם, מקור ההפניה,
// עסק חדש/העברה) נוסעים על המיפוי הגנרי camel↔snake, כמו כל שדה אופציונלי אחר:
// ערך undefined פשוט לא נכלל ב-UPDATE, ולכן שמירה חלקית לא מאפסת אותו.
export function clientToDb(client: Partial<Client>, userId?: string): Record<string, any> {
  const row = objectToRow(client, CLIENT_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  return row;
}

// ───────────────────────────────────────── Task ───────────────────────────

const TASK_OMIT_ON_WRITE = ['updatedAt'];

export function taskFromDb(row: Record<string, any>): Task {
  const t = rowToObject<Task>(row);
  // משימת מערכת (בדיקת עדכניות וכו') — client_id NULL במסד ↔ 'system' באפליקציה
  if (!t.clientId) t.clientId = 'system';
  return t;
}

export function taskToDb(task: Partial<Task>, userId?: string): Record<string, any> {
  const row = objectToRow(task, TASK_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  if (row.client_id === 'system') row.client_id = null;
  return row;
}

// ────────────────────────── RepresentationRequest ─────────────────────────

const REP_OMIT_ON_WRITE = ['updatedAt'];

export function repRequestFromDb(row: Record<string, any>): RepresentationRequest {
  // DB column is part_b → camelCase becomes partB. Same for all others.
  const r = rowToObject<RepresentationRequest>(row);
  if (!r.requestedDocs) r.requestedDocs = [] as any;
  if (!r.authorities) r.authorities = [] as any;
  // signed_pdf_path משמש כמצביע ל-docId של ה-PDF החתום במאגר המסמכים.
  // rowToObject המיר אותו ל-signedPdfPath; ממפים חזרה ל-signedPdfStoredId ומנקים.
  const anyR = r as unknown as { signedPdfPath?: string };
  if (anyR.signedPdfPath) {
    r.signedPdfStoredId = anyR.signedPdfPath;
    delete anyR.signedPdfPath;
  }
  return r;
}

export function repRequestToDb(req: Partial<RepresentationRequest>, userId?: string): Record<string, any> {
  // signedPdfStoredId (מצביע במאגר המסמכים) נשמר בעמודה signed_pdf_path.
  const { signedPdfStoredId, signedPdfPath: _legacy, ...rest } = req as Partial<RepresentationRequest> & { signedPdfPath?: string };
  const row = objectToRow(rest, REP_OMIT_ON_WRITE);
  if (signedPdfStoredId) row.signed_pdf_path = signedPdfStoredId;
  if (userId) row.user_id = userId;
  return row;
}

// ───────────────────────────────────────── Employee ───────────────────────

const EMP_OMIT_ON_WRITE = ['updatedAt'];

export function employeeFromDb(row: Record<string, any>): Employee {
  return rowToObject<Employee>(row);
}

export function employeeToDb(emp: Partial<Employee>, userId?: string): Record<string, any> {
  const row = objectToRow(emp, EMP_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  return row;
}

// ───────────────────────────────────────── FirmProfile ────────────────────
// מורחב מטבלת profiles. שדות ה-jsonb (branding/communication/settings) עוברים
// כמות שהם — המרת camel↔snake חלה רק על מפתחות הרמה העליונה.

const PROFILE_OMIT_ON_WRITE = ['id', 'updatedAt', 'createdAt'];

export function profileFromDb(row: Record<string, any>): FirmProfile {
  const p = rowToObject<FirmProfile>(row);
  if (!p.branding) p.branding = {};
  if (!p.communication) p.communication = {};
  if (!p.settings) p.settings = {};
  return p;
}

export function profileToDb(profile: Partial<FirmProfile>): Record<string, any> {
  return objectToRow(profile, PROFILE_OMIT_ON_WRITE);
}

// ──────────────────────────── מודול הצעות מחיר ─────────────────────────────

export function leadFromDb(row: Record<string, any>): Lead {
  return rowToObject<Lead>(row);
}

// שדות אופציונליים של ליד. objectToRow מדלג על ''/undefined כדי לא לשלוח
// מחרוזת ריקה לעמודת תאריך/מספר — אבל בעדכון זה אומר שהעמודה כלל לא נכללת
// ב-UPDATE, ולכן ניקוי שדה בטופס "לא נשמר" והערך הישן חוזר למסך.
// כאן ריק מתורגם ל-NULL מפורש, אך ורק לשדות שנמסרו במפורש באובייקט.
const LEAD_NULLABLE = [
  'phone', 'email', 'businessName', 'dealerType', 'notes',
  'prevAccountantName', 'prevAccountantEmail', 'prevAccountantPhone',
  'referralSource', 'businessTransfer',
] as const;

export function leadToDb(lead: Partial<Lead>, userId?: string): Record<string, any> {
  const row = objectToRow(lead, ['updatedAt']);
  if (userId) row.user_id = userId;
  const src = lead as Record<string, unknown>;
  for (const key of LEAD_NULLABLE) {
    if (key in src && (src[key] === undefined || src[key] === '')) row[toSnake(key)] = null;
  }
  return row;
}

export function serviceCatalogFromDb(row: Record<string, any>): ServiceCatalogItem {
  return rowToObject<ServiceCatalogItem>(row);
}

export function serviceCatalogToDb(item: Partial<ServiceCatalogItem>, userId?: string): Record<string, any> {
  const row = objectToRow(item, ['updatedAt']);
  if (userId) row.user_id = userId;
  return row;
}

export function quotationTemplateFromDb(row: Record<string, any>): QuotationTemplate {
  const t = rowToObject<QuotationTemplate>(row);
  if (!t.serviceIds) t.serviceIds = [];
  return t;
}

export function quotationTemplateToDb(tpl: Partial<QuotationTemplate>, userId?: string): Record<string, any> {
  const row = objectToRow(tpl, ['updatedAt']);
  if (userId) row.user_id = userId;
  return row;
}

// quotation_number נקבע ב-DB (טריגר מונה שנתי) — לא נשלח בהכנסה כדי לא לדרוס
const QUOTATION_OMIT_ON_INSERT = ['updatedAt', 'quotationNumber'];

export function quotationFromDb(row: Record<string, any>): Quotation {
  const q = rowToObject<Quotation>(row);
  if (!q.items) q.items = [];
  if (!q.events) q.events = [];
  return q;
}

export function quotationToDb(q: Partial<Quotation>, userId?: string, forInsert = false): Record<string, any> {
  const row = objectToRow(q, forInsert ? QUOTATION_OMIT_ON_INSERT : ['updatedAt']);
  if (userId) row.user_id = userId;
  return row;
}

// ─────────────────────────────── חיוב נוסף ─────────────────────────────────

const CHARGE_OMIT_ON_WRITE = ['updatedAt'];

export function chargeFromDb(row: Record<string, any>): AdditionalCharge {
  const c = rowToObject<AdditionalCharge>(row);
  // עמודת numeric חוזרת כמחרוזת מ-PostgREST — כמו monthlyTotal ב-engagementFromDb.
  if (c.amount !== undefined) c.amount = Number(c.amount);
  return c;
}

export function chargeToDb(charge: Partial<AdditionalCharge>, userId?: string): Record<string, any> {
  const row = objectToRow(charge, CHARGE_OMIT_ON_WRITE);
  if (userId) row.user_id = userId;
  return row;
}

// ──────────────────────────────── מודול הקליטה ─────────────────────────────
// קריאה בלבד מהדפדפן: התקשרויות ושלבים נוצרים ומתקדמים אך ורק דרך פונקציות
// השרת (create_engagement_for_quotation / advance_onboarding_step), ולכן אין
// כאן מיפוי לכיוון הכתיבה.

export function engagementFromDb(row: Record<string, any>): Engagement {
  const e = rowToObject<Engagement>(row);
  if (e.monthlyTotal !== undefined) e.monthlyTotal = Number(e.monthlyTotal);
  return e;
}

export function stepFromDb(row: Record<string, any>): OnboardingStep {
  const s = rowToObject<OnboardingStep>(row);
  if (!s.payload) s.payload = {};
  if (s.needsAttention === undefined) s.needsAttention = false;
  return s;
}

export function eventFromDb(row: Record<string, any>): OnboardingEvent {
  const ev = rowToObject<OnboardingEvent>(row);
  if (!ev.meta) ev.meta = {};
  return ev;
}

// ─────────────────────────────── תיק מס — מעברים ───────────────────────────
// קריאה בלבד מהדפדפן: status משתנה אך ורק דרך propose/accept/reject/manual
// ב-supabase/90-tax-fact-reconciliation.sql — אין UPDATE ישיר על הטבלה הזו.

export function taxFactChangeFromDb(row: Record<string, any>): TaxFactChange {
  return rowToObject<TaxFactChange>(row);
}

// ────────────────────────── יסוד האוטומציה — קריאה בלבד ────────────────────
// כתיבה עוברת רק דרך create_automation_job/cancel_automation_job (הדפדפן)
// או claim/heartbeat/complete/fail (העובד המקומי, דרך automation-worker) —
// ראה supabase/150-automation-jobs.sql.

export function automationJobFromDb(row: Record<string, any>): AutomationJob {
  const j = rowToObject<AutomationJob>(row);
  if (!j.input) j.input = {};
  if (!j.artifacts) j.artifacts = [];
  return j;
}

export function automationWorkerFromDb(row: Record<string, any>): AutomationWorker {
  return rowToObject<AutomationWorker>(row);
}

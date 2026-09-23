// ─── ייצוג מול שע״ם — המודל המשותף ────────────────────────────────────────────
//
// מה שיושב כאן הוא **הכל מלבד הדפדפן**: מה מותר לבקש בשע״ם עבור לקוח מסוים,
// אילו פרטים חייבים להיות בכרטיס לפני שנוגעים ברשות, איך קוראים את המצב
// שחוזר משם, ואיפה נופלות החתימות על טופס 2279.
//
// ‼ הגבול המרכזי של המהלך (ומקור הבאג היקר ביותר כאן): **PIVO קובע מה,
// שע״ם קובע איך.** ההיקף נקרא מ«חובת ייצוג מול» שנשמר על הבקשה — לא
// מהמסך של שע״ם, לא מ«מה הגיוני», ולא ממה שהרו"ח סימן ידנית פעם אחת
// בהדגמה. הזנה ידנית בהדגמה היא מעשה של אדם, לא חוק עסקי.
//
// ‼ ביטוח לאומי אינו מערך בשע״ם. יש לו פורטל משלו, אסמכתא משלו ומסלול משלו
// (NiTracking, פרק 17). ייצוג שהתבקש בב"ל לעולם אינו גורר סימון כלשהו כאן.

import type {
  AuthorityRepresentations, Client, RepAuthorityKind, RepTarget,
  RepresentationRequest, SignatureField,
} from '../../types';
import { shaamSubmissions, requestScope, peopleFromClient, type ShaamSubmission, type ScopePeople } from '../../utils/repScope';

// ── 1. אילו מערכים קיימים בזרימת הייצוג של שע״ם ──────────────────────────────

/**
 * המערכים שמסך «בקשות ייפוי כוח» בשע״ם מציע (נצפו בהקלטה, 23.09.2026):
 * מס הכנסה, מע"מ, ניכויים. ‼ ביטוח לאומי **אינו** ברשימה ואין לו מקבילה —
 * מיפוי שלו לאחד מאלה הוא הרחבת היקף, ואסור.
 */
export const SHAAM_SYSTEMS = ['incomeTax', 'vat', 'withholding'] as const;
export type ShaamSystemKey = typeof SHAAM_SYSTEMS[number];

/** התווית **כפי שהיא מופיעה במסך של שע״ם** — זה מה שהעובד מחפש בטבלה. */
export const SHAAM_SYSTEM_SCREEN_LABELS: Record<ShaamSystemKey, string> = {
  incomeTax: 'מס הכנסה',
  vat: 'מע"מ',
  withholding: 'ניכויים',
};

/** סוג הייצוג שנבחר בכל שורה. בזרימה הזו תמיד «ראשי» (נצפה בהקלטה). */
export const SHAAM_REPRESENTATION_TYPE = 'ראשי';

function isShaamSystem(a: RepAuthorityKind): a is ShaamSystemKey {
  return (SHAAM_SYSTEMS as readonly string[]).includes(a);
}

/**
 * המערכים שיסומנו בשע״ם עבור הגשה אחת —
 * **חיתוך** בין מה שהתבקש ב-PIVO לבין מה שהזרימה הזאת תומכת בו.
 *
 * ‼ אף פעם לא איחוד ולא ברירת מחדל. `submission.authorities` כבר נגזר
 * מההיקף ההיסטורי של הבקשה (`repScope.shaamSubmissions`), ולכן כל מה
 * שנשאר כאן הוא לסנן החוצה את מה שאינו מערך בשע״ם — היום ביטוח לאומי בלבד.
 */
export function shaamSystemsOf(submission: Pick<ShaamSubmission, 'authorities'>): ShaamSystemKey[] {
  return submission.authorities.filter(isShaamSystem);
}

/**
 * ההגשות בשע״ם של הבקשה — אחת לכל אדם, ורק אלה שיש בהן מערך אחד לפחות.
 *
 * ‼ הגשה שכל תוכנה היה ביטוח לאומי יורדת כאן לגמרי: אין לה מה לחפש בשע״ם.
 */
export function shaamSubmissionsOf(
  request: Pick<RepresentationRequest, 'scope'>,
  client: Client | null | undefined,
  registeredOwner?: RepTarget,
  people?: ScopePeople,
): ShaamSubmission[] {
  const scope = requestScope(request, client);
  const who = people ?? peopleFromClient(client);
  return shaamSubmissions(scope, who, registeredOwner)
    .filter(s => shaamSystemsOf(s).length > 0);
}

/**
 * מספר התיק שמוזן בשורת המערך.
 *
 * ‼ לא מניחים שכל המערכים חולקים מספר: `tax_files` הוא מקור האמת, ורק
 * כשאין שם מספר נופלים לת.ז. של בעל ההגשה — וזה בדיוק מה שמופיע בשע״ם
 * לעוסק יחיד ולתיק מס הכנסה של הרשום/ה (מספר התיק במ"ה **הוא** הת.ז.).
 * תיק שטרם נפתח נשאר ריק, והעובד עוצר עליו — לא ממציא אפסים.
 */
export function shaamFileNumberOf(
  client: Client | null | undefined,
  system: ShaamSystemKey,
  target: RepTarget,
  personIdNumber: string,
): string {
  const authority = system === 'incomeTax' ? 'income_tax' : system === 'vat' ? 'vat' : 'deductions';
  const owner: RepTarget | 'joint' = target;
  const file = (client?.taxFiles ?? []).find(f =>
    f.authority === authority && (f.owner === owner || f.owner === 'joint'));
  const fromFile = file?.fileNumber?.replace(/\D/g, '') ?? '';
  if (fromFile) return fromFile;
  // מס הכנסה ומע"מ ליחיד — מספר התיק הוא הת.ז. (נצפה בטופס 2279 שהופק).
  if (system === 'incomeTax' || system === 'vat') return personIdNumber.replace(/\D/g, '');
  return '';
}

// ── 2. הפרטים שהאדם חייב להחזיק לפני שנוגעים בשע״ם ──────────────────────────

/** אדם אחד, כפי ש-PIVO מכיר אותו — הקלט היחיד שמותר לאוטומציה. */
export interface ShaamPersonFacts {
  role: RepTarget;
  name: string;
  idNumber: string;
  /** ISO (YYYY-MM-DD). שע״ם דורש DDMMYYYY — ההמרה בעובד. */
  birthDate: string;
  secondaryType?: 'parentId' | 'driverLicense' | 'passport';
  secondaryValue?: string;
  phone: string;
  email: string;
  /** טלפון בן/בת הזוג — נדרש בשלב «פרטי התקשרות» כשיש בן/בת זוג. */
  spousePhone: string;
}

export interface PreflightIssue {
  /** מפתח יציב לבדיקות ולוגים. */
  code: string;
  /** משפט אחד לרו"ח, בלי ז'רגון. */
  message: string;
  /** מי חסר — כדי שההודעה תדע להגיד «של מי». */
  role: RepTarget;
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
  /** המערכים שיסומנו — גם כשיש חוסרים, כדי שהמסך יוכל להראות מה תוכנן. */
  systems: ShaamSystemKey[];
  /** מספר התיק שייכנס בכל שורה. */
  fileNumbers: Partial<Record<ShaamSystemKey, string>>;
}

const ID_RE = /^\d{5,9}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * הכל-או-כלום לפני פנייה חיצונית: אם משהו חסר — **לא מתחילים**.
 *
 * ‼ «חסר» נבדק מול מה ש-PIVO באמת מחזיק, ולעולם לא מושלם בהיסק: מספר טלפון
 * של בן/בת זוג שאינו בכרטיס נשאר חסר, גם כשהרו"ח מכיר אותו בעל פה. ההדגמה
 * הידנית שבה הוא הוקלד ישירות בשע״ם אינה היתר לגזור אותו (ובוודאי לא
 * מהטלפון של הנישום — זה אדם אחר).
 *
 * @param needsSpouseContact האם מסך «פרטי התקשרות» יבקש טלפון בן/בת זוג —
 *   נגזר ממצב משפחתי בכרטיס, לא מהמסך של שע״ם.
 */
export function preflightShaamSubmission(
  submission: ShaamSubmission,
  person: ShaamPersonFacts,
  client: Client | null | undefined,
  needsSpouseContact: boolean,
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const role = submission.target;
  const who = submission.personName || (role === 'spouse' ? 'בן/בת הזוג' : 'הלקוח/ה');
  const add = (code: string, message: string) => issues.push({ code, message, role });

  const systems = shaamSystemsOf(submission);
  if (systems.length === 0) {
    add('no_systems', `לא התבקש בשע״ם אף מערך עבור ${who} — אין מה להזין.`);
  }

  const id = (person.idNumber || '').replace(/\D/g, '');
  if (!ID_RE.test(id)) add('missing_id_number', `חסרה תעודת זהות של ${who} בכרטיס.`);
  if (!ISO_DATE_RE.test(person.birthDate || '')) {
    add('missing_birth_date', `חסר תאריך לידה של ${who} בכרטיס — שע״ם דורש אותו לאימות הישות.`);
  }
  // ‼ «חובה למלא אחד מהשדות הבאים» במסך אימות הישות. בלי אחד מהשלושה אי
  // אפשר לאמת, וניסיון עיוור מסתכן בחסימת המשתמש בשע״ם.
  const secondary = (person.secondaryValue || '').trim();
  if (!secondary || !person.secondaryType) {
    add('missing_secondary_identity', `חסר אמצעי זיהוי נוסף של ${who} (ת.ז. הורה / רישיון נהיגה / דרכון) — בלעדיו שע״ם לא מאמת את הישות.`);
  }

  const fileNumbers: Partial<Record<ShaamSystemKey, string>> = {};
  for (const s of systems) {
    const n = shaamFileNumberOf(client, s, role, id);
    fileNumbers[s] = n;
    if (!n) {
      add(`missing_file_number_${s}`, `חסר מספר תיק ${SHAAM_SYSTEM_SCREEN_LABELS[s]} של ${who} בכרטיס.`);
    }
  }

  if (needsSpouseContact && !(person.spousePhone || '').trim()) {
    add('missing_spouse_phone', 'חסר מספר טלפון של בן/בת הזוג — שע״ם מבקש אותו במסך פרטי ההתקשרות.');
  }
  if (!(person.email || '').trim() && !(person.phone || '').trim()) {
    add('missing_contact', `חסרים פרטי התקשרות של ${who} — נדרש טלפון או דוא"ל.`);
  }

  return { ok: issues.length === 0, issues, systems, fileNumbers };
}

// ── 3. המצב שחוזר משע״ם ─────────────────────────────────────────────────────
//
// שתי עמודות נפרדות ב«רשימת בקשות», ולא מצב אחד (נצפו בהקלטה):
//   «מצב בקשה» — מה קורה למסמכים של הבקשה כולה.
//   «מצב מערך» — מה קורה לכל מערך בנפרד. שני מערכים באותה בקשה יכולים
//                להיות אחד נקלט ואחד ממתין לפתיחת תיק.
// ‼ לכן אסור לשטח לסטטוס אחד: «נכשל/הצליח» היה מוחק בדיוק את המידע שהרו"ח
// צריך — מי צריך לפעול עכשיו.

export type ShaamRequestState =
  | 'awaiting_documents'    // המתנה למסמכים
  | 'documents_uploading'   // מסמכים בטעינה
  | 'documents_received'    // התקבלו המסמכים
  | 'documents_approved'    // מסמכים אושרו
  | 'unknown';

export type ShaamSystemState =
  | 'accepted'                 // נקלט בהצלחה — התיק פעיל
  | 'suspended'                // השהיה לקליטה
  | 'awaiting_client_approval' // ממתין לאישור לקוח
  | 'awaiting_file_opening'    // ממתין לפתיחת תיק
  | 'pending'                  // נמסר, אין עדיין מצב
  | 'unknown';

export const SHAAM_REQUEST_STATE_LABELS: Record<ShaamRequestState, string> = {
  awaiting_documents: 'המתנה למסמכים',
  documents_uploading: 'מסמכים בטעינה',
  documents_received: 'התקבלו המסמכים',
  documents_approved: 'מסמכים אושרו',
  unknown: 'מצב לא ידוע',
};

export const SHAAM_SYSTEM_STATE_LABELS: Record<ShaamSystemState, string> = {
  accepted: 'תיק פעיל',
  suspended: 'השהיה לקליטה',
  awaiting_client_approval: 'ממתין לאישור הלקוח',
  awaiting_file_opening: 'ממתין לפתיחת תיק',
  pending: 'בטיפול שע״ם',
  unknown: 'מצב לא ידוע',
};

/** מנקה גרשיים/רווחים כדי שהשוואת טקסט לא תיפול על ניסוח זהה בתו אחד. */
function norm(text: string | undefined | null): string {
  return (text ?? '').replace(/["'״׳]/g, '"').replace(/\s+/g, ' ').trim();
}

/**
 * «מצב בקשה» ← מחרוזת. ‼ לא מזהה ⇒ `unknown`, לא ניחוש: מצב לא מוכר חייב
 * להיראות לא מוכר, אחרת שינוי ניסוח אצל הרשות ייקרא בשקט כהצלחה.
 */
export function parseShaamRequestState(text: string | undefined | null): ShaamRequestState {
  const t = norm(text);
  if (!t) return 'unknown';
  if (t.includes('המתנה למסמכים') || t.includes('ממתין למסמכים')) return 'awaiting_documents';
  if (t.includes('בטעינה')) return 'documents_uploading';
  if (t.includes('אושרו')) return 'documents_approved';
  if (t.includes('התקבלו')) return 'documents_received';
  return 'unknown';
}

/** «מצב מערך» ← מחרוזת. ריק הוא מצב תקף («נמסר, טרם עודכן»), לא כישלון. */
export function parseShaamSystemState(text: string | undefined | null): ShaamSystemState {
  const t = norm(text);
  if (!t) return 'pending';
  if (t.includes('לאישור לקוח')) return 'awaiting_client_approval';
  if (t.includes('לפתיחת התיק') || t.includes('לפתיחת תיק')) return 'awaiting_file_opening';
  if (t.includes('נקלט')) return 'accepted';
  if (t.includes('השהי')) return 'suspended';
  return 'unknown';
}

/**
 * «צפוי לסיום השהייה» — התא מחזיק או תאריך או טקסט מצב (נצפו שניהם).
 * מחזיר ISO רק כשבאמת יש שם תאריך.
 */
export function parseShaamDate(text: string | undefined | null): string | undefined {
  const m = /(\d{2})[./](\d{2})[./](\d{4})/.exec(norm(text));
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** מצב מערך אחד כפי שנקרא מהמסך. */
export interface ShaamSystemStatus {
  /** «מס הכנסה» / «מעמ» / «ניכויים» — כפי שהופיע בעמודת «מערך». */
  systemLabel: string;
  /**
   * «שם הלקוח» כפי שהופיע ברשימת הבקשות בשע״ם — ראיה על מי בן/בת הזוג
   * הרשום/ה במס הכנסה. ראה `matchRegisteredPersonName`.
   */
  clientName?: string;
  /** «מצב בקשה» של השורה, כטקסט. */
  rawRequestState?: string;
  /** «מצב מערך» של השורה, כטקסט. */
  rawSystemState?: string;
  fileNumber?: string;
  repType?: string;
  enteredAt?: string;
  /** «צפוי לסיום השהייה» — לפעמים תאריך, לפעמים טקסט מצב. */
  suspensionEndsRaw?: string;
  systemUpdatedAtRaw?: string;
  requestNumber?: string;
}

/** מצב מערך אחד, מתורגם — זה מה שהמסך מציג. */
export interface ShaamSystemView {
  systemLabel: string;
  state: ShaamSystemState;
  /** ISO, רק כשבתא באמת היה תאריך. */
  suspensionEndsAt?: string;
}

/**
 * התרגום היחיד משורה גולמית למצב עסקי.
 *
 * ‼ הסיווג חי כאן ולא בעובד: כך ניסוח חדש אצל הרשות מתגלה במקום אחד
 * ונבדק בבדיקות יחידה, ולא מתורגם פעמיים בשני צדדים שיסטו זה מזה.
 */
export function classifyShaamSystem(row: ShaamSystemStatus): ShaamSystemView {
  return {
    systemLabel: row.systemLabel || 'מערך',
    state: parseShaamSystemState(row.rawSystemState),
    suspensionEndsAt: parseShaamDate(row.suspensionEndsRaw),
  };
}

/** מה שנשמר ב-PIVO על ההגשה. מצב אינטגרציה עמיד, לא צילום מסך. */
export interface ShaamRequestTracking {
  /** «מספר בקשה» בשע״ם — המזהה החיצוני. מרגע שיש אותו, לא יוצרים בקשה שנייה. */
  requestNumber?: string;
  /** הבקשה נוצרה בשע״ם (שלושת השלבים הראשונים הושלמו). */
  createdAt?: string;
  /** מסמך טופס 2279 שהורד ונשמר בתיק הלקוח. */
  formDocumentId?: string;
  /** שם הקובץ כפי שנשמר — להצגה ולרשומת מסמך החתימה. */
  formFileName?: string;
  formFetchedAt?: string;
  /** הטופס החתום הועלה **ושע״ם אישרה את הקליטה**. זה, ורק זה, «נשלח לשע״ם». */
  submittedAt?: string;
  /** הסנכרון האחרון שהצליח. */
  syncedAt?: string;
  requestState?: ShaamRequestState;
  rawRequestState?: string;
  systems?: ShaamSystemStatus[];
  /** השלב שהאוטומציה הגיעה אליו — כדי שניסיון חוזר ימשיך ולא יתחיל מחדש. */
  stage?: ShaamIntegrationStage;
}

/** מפת ההגשות של הבקשה, לפי `ShaamSubmission.key` ('person:client'). */
export type ShaamExecution = Record<string, ShaamRequestTracking>;

/**
 * השלבים העמידים של האינטגרציה. ‼ סדר עולה, ומשמשים לחישוב «מאיפה ממשיכים»:
 * ניסיון חוזר לעולם לא מתחיל מ-create כשכבר יש `requestNumber`.
 */
export type ShaamIntegrationStage =
  | 'none' | 'request_created' | 'form_fetched' | 'submitted' | 'active';

const STAGE_ORDER: ShaamIntegrationStage[] = ['none', 'request_created', 'form_fetched', 'submitted', 'active'];

/** השלב שבו ההגשה נמצאת בפועל — נגזר מהעובדות, לא מדגל שנכתב ביד. */
/**
 * יש עדות שהבקשה **קיימת** בשע״ם: מספר בקשה, או שורות שנקראו ושויכו אליה.
 *
 * ‼ 23.09.2026 · נצפה בפועל (הדסה סלע): «בדוק קבלת הייצוג» מצא את הבקשה
 * ברשימת «בקשות בתהליך» ושייך אליה שלוש שורות — אבל מספר הבקשה לא נחשף
 * ב-DOM. בלי הכלל הזה, `syncedAt` בלי `requestNumber` נקרא כ«נבדק ולא
 * נמצא», והמסך הציע «הזן את הפרטים בשע״ם» — כלומר אימות ישות חוזר מול
 * שע״ם על בקשה שכבר פתוחה. שורות נשמרות רק אחרי שיוך fail-closed
 * (attributeRows), ולכן הן ראיה, לא ניחוש.
 */
export function shaamRequestExists(t: ShaamRequestTracking | undefined): boolean {
  return !!t?.requestNumber || (t?.systems?.length ?? 0) > 0;
}

/**
 * השורות שנשמרו מתארות **בקשה אחת** — התנאי לשידור בלי מספר בקשה.
 *
 * ‼ אותו כלל כמו singleAttributedRequest בעובד (שם הוא נאכף שוב, חי, לפני
 * כל העלאה): אותו יום הזנה, אותו מצב בקשה, ואף מערך לא פעמיים. מערך כפול
 * פירושו שתי בקשות פתוחות לאותו אדם — ואז אין «הבקשה» לשדר אליה.
 */
export function shaamRowsFormOneRequest(t: ShaamRequestTracking | undefined): boolean {
  const rows = t?.systems ?? [];
  if (rows.length === 0) return false;
  const clean = (v: string | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
  const numbers = new Set(rows.map(r => (r.requestNumber ?? '').replace(/\D/g, '')).filter(Boolean));
  if (numbers.size > 1) return false;
  const dates = new Set(rows.map(r => clean(r.enteredAt)));
  if (dates.size !== 1 || dates.has('')) return false;
  if (new Set(rows.map(r => clean(r.rawRequestState))).size !== 1) return false;
  const systems = rows.map(r => clean(r.systemLabel));
  return systems.every(Boolean) && new Set(systems).size === systems.length;
}

export function shaamStageOf(t: ShaamRequestTracking | undefined): ShaamIntegrationStage {
  if (!t) return 'none';
  if (allSystemsAccepted(t)) return 'active';
  if (t.submittedAt) return 'submitted';
  if (t.formDocumentId) return 'form_fetched';
  if (shaamRequestExists(t)) return 'request_created';
  return 'none';
}

export function stageAtLeast(a: ShaamIntegrationStage, b: ShaamIntegrationStage): boolean {
  return STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b);
}

/**
 * כל המערכים שהתבקשו נקלטו. ‼ ריק אינו «הכל נקלט»: בלי ולו מערך אחד
 * שנצפה, אין ראיה לשום דבר.
 */
export function allSystemsAccepted(t: ShaamRequestTracking | undefined): boolean {
  const list = t?.systems ?? [];
  if (list.length === 0) return false;
  return list.every(row => classifyShaamSystem(row).state === 'accepted');
}

/** כל שורות המערך, מתורגמות — הצורה שהמסך מצייר. */
export function shaamSystemViews(t: ShaamRequestTracking | undefined): ShaamSystemView[] {
  return (t?.systems ?? []).map(classifyShaamSystem);
}

/** אצל מי הכדור, במילה אחת — זה מה שמסך הייצוג צריך להראות. */
export type ShaamBall = 'office' | 'client' | 'authority' | 'done';

export interface ShaamProgressLine {
  ball: ShaamBall;
  /** משפט אחד: מה קרה ומה הלאה. */
  text: string;
  /** תאריך שרלוונטי להצגה (סיום השהייה), כשיש. */
  until?: string;
}

/**
 * התרגום היחיד ממצב חיצוני למשפט אנושי. ‼ במקום אחד, כדי ששני המשטחים
 * (מרכז הביצוע וכרטיס הרשות) לא יספרו שני סיפורים על אותה בקשה.
 */
export function shaamProgressLine(t: ShaamRequestTracking | undefined): ShaamProgressLine {
  if (!t || !shaamRequestExists(t)) {
    return { ball: 'office', text: 'טרם נפתחה בקשת ייצוג בשע״ם.' };
  }
  if (allSystemsAccepted(t)) {
    return { ball: 'done', text: 'הייצוג נקלט בשע״ם בכל המערכים שהתבקשו.' };
  }
  const views = shaamSystemViews(t);
  const waitingClient = views.find(s => s.state === 'awaiting_client_approval');
  if (waitingClient) {
    return { ball: 'client', text: 'שע״ם ממתינה לאישור הלקוח באזור האישי — עד שיאשר, הקליטה לא מתקדמת.' };
  }
  if (!t.submittedAt) {
    if (!t.formDocumentId) {
      if (!t.requestNumber) {
        // ‼ נמצאה בשע״ם בלי ש-PIVO פתחה אותה (הוזנה ידנית) — הטופס לא הגיע
        // דרך האוטומציה, ולכן לא אומרים «נשאר להביא»: מדווחים מה שנקרא.
        const state = parseShaamRequestState(t.rawRequestState ?? t.systems?.[0]?.rawRequestState);
        return {
          ball: 'office',
          text: `הבקשה פתוחה בשע״ם (נמצאה ברשימת הבקשות בתהליך) — ${SHAAM_REQUEST_STATE_LABELS[state]}.`,
        };
      }
      return { ball: 'office', text: `הבקשה נפתחה בשע״ם (${t.requestNumber}) — נשאר להביא את טופס ייפוי הכוח.` };
    }
    return { ball: 'office', text: 'טופס ייפוי הכוח מוכן — נשאר להחתים ולשדר אותו לשע״ם.' };
  }
  const suspended = views.find(s => s.state === 'suspended');
  if (suspended) {
    return {
      ball: 'authority',
      text: suspended.suspensionEndsAt
        ? 'שע״ם בהשהיה לקליטה.'
        : 'שע״ם בהשהיה לקליטה — טרם נמסר מועד סיום.',
      until: suspended.suspensionEndsAt,
    };
  }
  const opening = views.find(s => s.state === 'awaiting_file_opening');
  if (opening) {
    return { ball: 'authority', text: 'שע״ם ממתינה לפתיחת התיק — הבקשה תיקלט כשייפתח.' };
  }
  return { ball: 'authority', text: 'הטופס שודר לשע״ם — הבקשה בטיפול הרשות.' };
}

// ── 4. אזורי החתימה על טופס 2279 שמופק בשע״ם ────────────────────────────────
//
// ‼ המספרים כאן **נמדדו**, לא נאמדו: הם המיקומים שגיא סימן ידנית על טופס
// 2279 אמיתי שהופק בשע״ם (בקשה 2026538930, «ייפוי כח לחתימה הדס וסלע.pdf»,
// 23.09.2026), כפי שנשמרו ב-`representation_requests.signature_documents`.
// הוצלבו מול סימון ידני שני על טופס 2279 אחר משע״ם (27.08.2026): מרכזי
// התיבות נבדלים בפחות מ-0.6% מגובה/רוחב העמוד.
//
// ‼ יחידות: אחוז מגודל העמוד (בדיוק כמו `SignatureField`) — ולכן אינם
// תלויים ב-DPI, ב-zoom או בגודל הנייר. כל טופסי 2279 שנבדקו הם עמוד אחד
// 612×792 נק', בלי סיבוב.
//
// ‼ המיקום נגזר מ**התפקיד בטופס**, לא ממגדר ולא מ«מי פתח את הבקשה»:
// התיבה האמצעית היא «חתימת בן זוג רשום», והשמאלית «חתימת בן/בת הזוג».
// אשה יכולה להיות בת הזוג הרשומה, ואז היא זו שחותמת באמצעית.
export interface Form2279Box {
  xPct: number; yPct: number; widthPct: number; heightPct: number;
}

export const FORM_2279_TEMPLATE: {
  /** «חתימת בן זוג רשום/העוסק» — התיבה האמצעית בשורת החתימות. */
  registeredSigner: Form2279Box;
  /** «חתימת בן/בת הזוג/העוסק» — התיבה השמאלית. רק כשיש בן/בת זוג. */
  otherSpouse: Form2279Box;
  /** חתימת המייצג + חותמת המשרד, מתחת לחלק ב'. */
  accountantStamp: Form2279Box;
} = {
  registeredSigner: { xPct: 0.3934938248867116, yPct: 0.5141197691937937, widthPct: 0.1487377943942933, heightPct: 0.03382656485562341 },
  otherSpouse: { xPct: 0.13005731072135313, yPct: 0.5113501234488552, widthPct: 0.1487377943942933, heightPct: 0.03382656485562341 },
  accountantStamp: { xPct: 0.09886512564599877, yPct: 0.7129217899296978, widthPct: 0.22514095909038695, heightPct: 0.066606306884761 },
};

let fieldSeq = 0;
function fieldId(prefix: string): string {
  fieldSeq += 1;
  return `f-shaam-${prefix}-${fieldSeq}`;
}

/**
 * אזורי החתימה של טופס 2279 שהופק בשע״ם — מוכנים לזרימת החתימה הקיימת.
 *
 * @param registeredOwner מי חותם/ת במקום «בן זוג רשום». כשאין הכרעה עדיין,
 *   הקורא מעביר את בעל ההגשה — זה בדיוק מי שהטופס הופק על שמו.
 * @param bothSign האם יש בן/בת זוג שחותם/ת גם כן (מס הכנסה אצל זוג נשוי).
 */
export function buildForm2279Fields(
  registeredOwner: RepTarget,
  bothSign: boolean,
): SignatureField[] {
  const other: RepTarget = registeredOwner === 'client' ? 'spouse' : 'client';
  const fields: SignatureField[] = [{
    id: fieldId(`sig-${registeredOwner}`),
    signerId: registeredOwner,
    kind: 'signature',
    pageIndex: 0,
    ...FORM_2279_TEMPLATE.registeredSigner,
  }];
  if (bothSign) {
    fields.push({
      id: fieldId(`sig-${other}`),
      signerId: other,
      kind: 'signature',
      pageIndex: 0,
      ...FORM_2279_TEMPLATE.otherSpouse,
    });
  }
  fields.push({
    id: fieldId('stamp'),
    signerId: 'accountant',
    kind: 'stamp',
    pageIndex: 0,
    ...FORM_2279_TEMPLATE.accountantStamp,
  });
  return fields;
}

// ── 5. בן/בת הזוג הרשום/ה — הראיה שנקראת מ«בדוק קבלת הייצוג» ───────────────
//
// ‼ 23.09.2026 · «הזן את הפרטים בשע״ם»/«בדוק קבלת הייצוג» אינם רק פעולה
// טכנית: העמודה «שם הלקוח» ברשימת הבקשות בשע״ם היא ראיה **חיצונית** על מי
// רשום/ה במס הכנסה — בדיוק העובדה ש-`registeredOwnerOf` (annualReport/
// profile.ts) מסרב לנחש. הפונקציה כאן **לא** כותבת שום דבר — היא רק
// מכריעה, מתוך טקסט חופשי מהמסך, איזה מהמועמדים הידועים (לקוח/ה או
// בן/בת הזוג) הוא זה שמופיע. הכתיבה בפועל (`registeredSpouseVerified` +
// `taxFiles[income_tax].owner`) עוברת דרך **אותו נתיב בדיוק** שהרו"ח כבר
// משתמש בו ידנית (TaxFilesSection) — לא נתיב כתיבה מקביל.
//
// ‼ לעולם לא מגדר. לעולם לא סדר. רק התאמת טקסט לשני שמות ידועים מראש.
// שני התאמות (שניהם מופיעים, או אף אחד) = לא הוכרע — לא מנחשים.
export type RegisteredPersonMatch = 'client' | 'spouse' | 'ambiguous' | 'no_match';

/** מנקה מחרוזת להשוואה: רווחים כפולים, גרשיים, פסיקים בין שם משפחה לפרטי. */
function normName(text: string | undefined | null): string {
  return (text ?? '')
    .replace(/["'״׳,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * האם שני חלקי השם (פרטי, משפחה) מופיעים בטקסט המועמד — בכל סדר.
 * ‼ לא התאמה תת-מחרוזתית גולמית: "הדסה" לבד יכול להתאים בטעות לטקסט
 * אחר. דורשים גם שם פרטי וגם שם משפחה, שניהם באורך אמיתי (לא ריקים).
 */
function nameAppearsIn(haystack: string, fullName: string): boolean {
  const parts = normName(fullName).split(' ').filter((p) => p.length >= 2);
  if (parts.length < 2) return false;
  return parts.every((p) => haystack.includes(p));
}

/**
 * מתאים את «שם הלקוח» שנקרא משע״ם לאחד משני המועמדים הידועים.
 *
 * @param shaamClientName הטקסט הגולמי מעמודת «שם הלקוח» ברשימת הבקשות.
 * @param clientFullName שם הלקוח/ה על הכרטיס (client role בהגשה).
 * @param spouseFullName שם בן/בת הזוג הידוע (spouse role בהגשה), אם יש.
 */
export function matchRegisteredPersonName(
  shaamClientName: string | undefined | null,
  clientFullName: string,
  spouseFullName?: string | null,
): RegisteredPersonMatch {
  const haystack = normName(shaamClientName);
  if (!haystack) return 'no_match';
  const clientHit = nameAppearsIn(haystack, clientFullName);
  const spouseHit = !!spouseFullName && nameAppearsIn(haystack, spouseFullName);
  if (clientHit && spouseHit) return 'ambiguous';
  if (clientHit) return 'client';
  if (spouseHit) return 'spouse';
  return 'no_match';
}

/**
 * האם שני בני הזוג חותמים על הטופס של ההגשה הזאת.
 *
 * ‼ מס הכנסה אצל זוג נשוי הוא תיק של משק הבית ושניהם חותמים (וזה גם מה
 * שהטופס אומר: «מומלץ להחתים את בן הזוג השני»). מע"מ/ניכויים הם תיק אישי —
 * טופס של אדם אחד.
 */
export function form2279BothSign(
  submission: Pick<ShaamSubmission, 'authorities'>,
  married: boolean,
): boolean {
  return married && submission.authorities.includes('incomeTax');
}

/** ההיקף כפי שיוצג ליד הפעולה — «מס הכנסה, מע"מ». */
export function shaamSystemsLabel(systems: ShaamSystemKey[]): string {
  return systems.map(s => SHAAM_SYSTEM_SCREEN_LABELS[s]).join(', ');
}

/** אילו רשויות ב-PIVO אינן חלק מהזרימה הזאת — להסבר במסך. */
export function nonShaamAuthorities(scope: AuthorityRepresentations | undefined): RepAuthorityKind[] {
  const out: RepAuthorityKind[] = [];
  const ni = scope?.nationalInsurance;
  if (ni && ni.status !== 'none') out.push('nationalInsurance');
  return out;
}

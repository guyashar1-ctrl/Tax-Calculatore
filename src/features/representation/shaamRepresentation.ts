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
 *
 * ‼ כלל מוצר (גיא, 24.09.2026): גם **ניכויים** — מספר מפורש בכרטיס גובר, ובלעדיו
 * מספר התיק הוא הת.ז. של בעל ההגשה. היעדר מספר ניכויים נפרד אינו חוסם הזנה.
 * ‼ הכלל רק קובע *איזה מספר* נכתב בשורה; הוא לעולם לא מוסיף את ניכויים לבקשה —
 * זה נקבע ב-shaamSystemsOf, רק כש-PIVO דורשת ייצוג בניכויים.
 * אין ת.ז. תקינה ⇒ ריק, וההזנה עוצרת על «חסרה תעודת זהות». שום ערך אחר לא נגזר.
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
  // מס הכנסה ומע"מ ליחיד — מספר התיק הוא הת.ז. (נצפה בטופס 2279 שהופק); ניכויים — כלל מוצר.
  const id = personIdNumber.replace(/\D/g, '');
  return ID_RE.test(id) ? id : '';
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

/**
 * טלפון ישראלי שמסך פרטי ההתקשרות בשע״ם יכול לקבל: קידומת מהרשימה + 7 ספרות.
 * ‼ אותו כלל כמו `splitShaamPhone` בעובד (+972 ⇒ 0; 9–10 ספרות שמתחילות ב-0).
 */
export function shaamPhoneValid(phone: string | null | undefined): boolean {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  return /^0\d{8,9}$/.test(d);
}
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
    // ‼ בלי ת.ז. אין גם מספר תיק (הוא הת.ז.) — «חסרה תעודת זהות» כבר אומרת את
    // הדבר היחיד שצריך להשלים; לא מוסיפים לה הודעת תיק שמתחזה לדרישה נפרדת.
    if (!n && ID_RE.test(id)) {
      add(`missing_file_number_${s}`, `חסר מספר תיק ${SHAAM_SYSTEM_SCREEN_LABELS[s]} של ${who} בכרטיס.`);
    }
  }

  if (needsSpouseContact && !(person.spousePhone || '').trim()) {
    add('missing_spouse_phone', 'חסר מספר טלפון של בן/בת הזוג — שע״ם מבקש אותו במסך פרטי ההתקשרות.');
  } else if ((person.spousePhone || '').trim() && !shaamPhoneValid(person.spousePhone)) {
    add('bad_spouse_phone', 'מספר הטלפון של בן/בת הזוג בכרטיס אינו תקין.');
  }
  // ‼ 28.09.2026 · שע״ם דורשת במסך פרטי ההתקשרות טלפון של המיוצג (אלא אם יש לה
  // כבר מאומת — ואת זה אי אפשר לדעת מראש). המסך הזה בא **אחרי** שהבקשה נוצרה,
  // ולכן דוא"ל בלבד אינו מספיק: בלי טלפון הבקשה הייתה נפתחת ונתקעת באמצע.
  if (!shaamPhoneValid(person.phone)) {
    add('missing_phone', (person.phone || '').trim()
      ? `מספר הטלפון של ${who} בכרטיס אינו תקין — שע״ם שולחת אליו את הקישור לאישור הייצוג.`
      : `חסר מספר טלפון של ${who} בכרטיס — שע״ם שולחת אליו את הקישור לאישור הייצוג.`);
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

// ‼ 28.09.2026 · המילונים המלאים נקראו חי מרשימות הסינון של שע״ם עצמה
// («מצב בקשה», «מצב מערך»), והקודים מנתוני הטבלה. קוד — כשיש — גובר על טקסט.
export type ShaamRequestState =
  | 'awaiting_documents'    // 1 המתנה למסמכים
  | 'documents_received'    // 2 התקבלו המסמכים
  | 'documents_approved'    // 3 מסמכים אושרו
  | 'rejected'              // 4 נדחה
  | 'documents_uploading'   // 5 מסמכים בטעינה
  | 'upload_failed'         // 6 כשל-ממתין לטעינת חוזרת
  | 'cancelled'             // בוטלה (טקסט ישן)
  | 'unknown';

/** «מצב בקשה» לפי הקוד של שע״ם (statusBakashaKod). */
export const SHAAM_REQUEST_STATE_BY_CODE: Record<number, ShaamRequestState> = {
  1: 'awaiting_documents', 2: 'documents_received', 3: 'documents_approved',
  4: 'rejected', 5: 'documents_uploading', 6: 'upload_failed',
};

export type ShaamSystemState =
  | 'accepted'                 // 5 נקלט בהצלחה — התיק פעיל
  | 'suspended'                // 2 השהייה
  | 'authority_review'         // 3 השהיית מטה — בדיקה פרטנית של מרשם המייצגים, בלי מועד
  | 'awaiting_client_approval' // 7 בתיק 91 — הלקוח חייב לאשר
  | 'awaiting_file_opening'    // 1 (או 7 בתיק שאינו 91) — אין עדיין תיק במערך
  | 'rejected'                 // נדחה
  | 'cancelled'                // 6 בוטל
  | 'pending'                  // נמסר, אין עדיין מצב
  | 'unknown';

export const SHAAM_REQUEST_STATE_LABELS: Record<ShaamRequestState, string> = {
  awaiting_documents: 'המתנה למסמכים',
  documents_uploading: 'מסמכים בטעינה',
  documents_received: 'התקבלו המסמכים',
  documents_approved: 'מסמכים אושרו',
  rejected: 'נדחתה',
  upload_failed: 'כשל בטעינה - ממתין לטעינה חוזרת',
  cancelled: 'בוטלה',
  unknown: 'מצב לא ידוע',
};

export const SHAAM_SYSTEM_STATE_LABELS: Record<ShaamSystemState, string> = {
  accepted: 'תיק פעיל',
  suspended: 'השהיה לקליטה',
  authority_review: 'בבדיקת מרשם המייצגים',
  awaiting_client_approval: 'ממתין לאישור הלקוח',
  awaiting_file_opening: 'ממתין לפתיחת תיק',
  rejected: 'נדחה',
  cancelled: 'בוטל',
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
  if (t.includes('כשל')) return 'upload_failed';
  if (t.includes('המתנה למסמכים') || t.includes('ממתין למסמכים')) return 'awaiting_documents';
  if (t.includes('בוטל')) return 'cancelled';
  if (t.includes('נדח')) return 'rejected';
  if (t.includes('בטעינה')) return 'documents_uploading';
  if (t.includes('אושרו')) return 'documents_approved';
  if (t.includes('התקבלו')) return 'documents_received';
  return 'unknown';
}

/** «מצב מערך» ← מחרוזת. ריק הוא מצב תקף («נמסר, טרם עודכן»), לא כישלון. */
export function parseShaamSystemState(text: string | undefined | null): ShaamSystemState {
  const t = norm(text);
  if (!t) return 'pending';
  if (t.includes('בוטל')) return 'cancelled';
  if (t.includes('נדח')) return 'rejected';
  // ‼ 28.09.2026 · «ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק» הוא **קוד אחד (7)**
  // לשני מצבים: אישור לקוח רק בתיק 91, אחרת פתיחת תיק. מהטקסט לבדו אי אפשר
  // להכריע — ההכרעה ב-classifyShaamRow (לפי הפירוט). כאן: פתיחת תיק.
  if (t.includes('כל השאר')) return 'awaiting_file_opening';
  if (t.includes('לאישור לקוח') || t.includes('לאישור הלקוח')) return 'awaiting_client_approval';
  if (t.includes('לפתיחת התיק') || t.includes('לפתיחת תיק')) return 'awaiting_file_opening';
  if (t.includes('נקלט')) return 'accepted';
  if (t.includes('השהיית מטה')) return 'authority_review';
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
  // ── 28.09.2026 · מנתוני הטבלה בשע״ם (כשנקראו) ──
  /** statusBakashaKod · 1..6. */
  requestStateCode?: number;
  /** statusTikKod · 1,2,3,5,6,7. */
  systemStateCode?: number;
  /** kodMaarach · 1 מ"ה, 2 מע"מ, 5 ניכויים. */
  systemCode?: number;
  /** ת.ז. המיוצג (misMuzag) — 9 ספרות. */
  entityId?: string;
  /** אין עדיין תיק במערך (isBehamtana / «לא קיים תיק»). */
  noFile?: boolean;
  /** סיבת ביטול (bitulTeur), כששע״ם ביטלה. */
  cancelReason?: string;
  /** הפירוט הציג (גלוי) «תיק החזר מס (91)». undefined ⇒ הפירוט לא נקרא. */
  tik91?: boolean;
  repTypeCode?: number;
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
    state: classifyShaamRow(row),
    suspensionEndsAt: parseShaamDate(row.suspensionEndsRaw),
  };
}

/**
 * מצב מערך אחד — לפי הקוד של שע״ם כשיש, אחרת לפי הטקסט.
 * ‼ קוד 7 («ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק») = אישור לקוח **רק**
 * בתיק 91: הפירוט מציג (גלוי) «תיק החזר מס (91)», או ש«צפי לסיום השהייה»
 * אומר «ממתין לאישור לקוח» (נצפה חי אצל דן רכס). בלי אחד מהם — פתיחת תיק.
 */
export function classifyShaamRow(row: ShaamSystemStatus): ShaamSystemState {
  const code = row.systemStateCode;
  const clientEvidence = row.tik91 === true || /לאישור\s*(ה)?לקוח/.test(norm(row.suspensionEndsRaw));
  if (typeof code === 'number') {
    switch (code) {
      case 1: return 'awaiting_file_opening';
      case 2: return 'suspended';
      case 3: return 'authority_review';
      case 5: return 'accepted';
      case 6: return 'cancelled';
      case 7: return clientEvidence ? 'awaiting_client_approval' : 'awaiting_file_opening';
      default: return 'unknown';
    }
  }
  const byText = parseShaamSystemState(row.rawSystemState);
  if (byText === 'awaiting_file_opening' && norm(row.rawSystemState).includes('כל השאר') && clientEvidence) {
    return 'awaiting_client_approval';
  }
  return byText;
}

/** «מצב בקשה» של שורה — לפי קוד כשיש. */
export function shaamRowRequestState(row: ShaamSystemStatus | undefined): ShaamRequestState {
  const code = row?.requestStateCode;
  if (typeof code === 'number' && SHAAM_REQUEST_STATE_BY_CODE[code]) return SHAAM_REQUEST_STATE_BY_CODE[code];
  return parseShaamRequestState(row?.rawRequestState);
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
  // ── 201 · אחרי ההגשה ──────────────────────────────────────────────────────
  /** מתי נקראה שע״ם בפועל (לא מתי נשמר). קריאה ישנה ממנה אינה דורסת. */
  observedAt?: string;
  /** הבדיקה האחרונה לא מצאה את הבקשה ב«בקשות בתהליך». עובדה, לא מסקנה. */
  notInListAt?: string;
  /** צפי סיום ההשהייה (ISO) — **כפי ששע״ם מסרה**, לעולם לא מחושב אצלנו. */
  suspensionEndsAt?: string;
  suspensionEndsSource?: 'request_list' | 'submission_confirmation';
  /** מה ששע״ם אמרה במסך אישור הקליטה — כמו שהוא. */
  submissionConfirmation?: { text: string; at: string };
  /** הפעם הראשונה ששע״ם הציגה «ממתין לאישור לקוח». */
  clientApprovalRequiredAt?: string;
  /** מסמכים נוספים ששע״ם דרשה במסך טעינת המסמכים, ומה PIVO עשתה עם כל אחד. */
  requiredDocuments?: ShaamRequiredDocument[];
  requiredDocumentsObservedAt?: string;
  /** 204 · הת.ז. שבכותרת מסך «טעינת מסמכים» — בעלי כל הדרישות במסך הזה. */
  requiredDocumentsEntityId?: string;
  /** 204 · האדם בכרטיס שהת.ז. הזו ממופה אליו. null ⇒ לא ניתן לשייך בוודאות. */
  requiredDocumentsPerson?: 'client' | 'spouse' | null;
  /** 204 · מצב ההמתנה העמיד של השידור על מסמכים — ראה ShaamDocumentsGate. */
  documentsGate?: ShaamDocumentsGate;
  lastStaleReadingAt?: string;
  /** 202 · «הזן ייפוי כוח בשע״ם» מצא שהבקשה כבר קיימת שם, ולא יצר חדשה. */
  foundBeforeCreateAt?: string;
  /** 205 · «לידיעתך» של שלב 2 כמו ששע״ם הציגה (מה יש לצרף) — ראיה בלבד. */
  creationNotice?: { text: string; at: string };
  /** 208 · «בהמשך תתבקש לצרף» כרשימה — דרישות המסמכים של הבקשה, מרגע היצירה. */
  creationAttach?: string[];
  /** 208 · המערכים שנפתחו בבקשה בשע״ם (כפי שהוזנו), לזיהוי טופס שכולל רשות שהוסרה. */
  requestedSystems?: string[];
  /** 208 · רשות הוסרה אחרי שהבקשה נפתחה בשע״ם ⇒ הבקשה שם צריכה ביטול ופתיחה מחדש. */
  replacement?: ShaamReplacement;
  /** 208 · בקשות קודמות להגשה הזאת שבוטלו (הוחלפו) — היסטוריה, לא מצב. */
  history?: (Omit<ShaamRequestTracking, 'history'> & { archivedAt?: string; archivedHow?: string })[];
}

export interface ShaamReplacement {
  reason: 'authority_removed';
  requestNumber: string;
  /** «ניכויים» / «מע"מ» — מה שהוסר מהבקשה. */
  removed: string[];
  supersededFormDocumentId?: string;
  at: string;
  /** סומן «ביטלתי בשע״ם», אבל «הזן» מצא את אותה בקשה עדיין פתוחה שם (208). */
  stillOpenAt?: string;
}

/**
 * סוג המסמך המזהה ששע״ם מבקשת. null ⇒ לא מסמך מזהה (או לא זוהה).
 * ‼ 204 · שורה 2 בשע״ם היא «תצלום תעודת זהות או רישיון נהיגה» ⇒ idOrLicense.
 */
export type ShaamIdentityDocKind = 'idCard' | 'passport' | 'idOrPassport' | 'idOrLicense' | 'driverLicense';

/** מה נעשה עם דרישת מסמך — נכתב בשרת (201, ensure_shaam_identity_document_request). */
export type ShaamRequiredDocumentHandling =
  | 'exists' | 'requested' | 'already_requested' | 'ambiguous_materials' | 'unrecognized' | 'no_request'
  | 'needs_document_assignment' | 'unsupported';

export interface ShaamRequiredDocument {
  label: string;
  required?: boolean;
  /** 204 · שורת המסמך הקבועה בשע״ם (1–5). */
  slotId?: number | null;
  kind?: ShaamIdentityDocKind | 'inheritance' | 'guardianship' | 'unknown' | null;
  handling?: ShaamRequiredDocumentHandling;
  /** 204 · הדרישה באה משע״ם — לא מבקשה של המשרד. */
  requiredBy?: 'shaam';
  /** 204 · בעל הדרישה: הת.ז. בכותרת שע״ם ⇒ אדם בכרטיס. null ⇒ לא ניתן לשייך. */
  person?: 'client' | 'spouse' | null;
  personName?: string | null;
}

/**
 * 204 · מצב השידור מול מסמכים ששע״ם דורשת — נכתב בשרת מתוצאת משימת השידור.
 *   awaiting_required_documents   · חסר מסמך; בקשה נפתחה ללקוח; ממשיך מעצמו כשמגיע.
 *   needs_document_assignment     · הת.ז. בכותרת שע״ם אינה אדם אחד בכרטיס.
 *   document_not_pdf_convertible  · המסמך בפורמט שאי אפשר להפוך ל-PDF.
 *   unsupported_required_document · צו ירושה / אפוטרופוס / שורה לא מוכרת — ידני.
 *   first_live_verification       · שומר המקרה החי הראשון: הכול מוכן, לא הועלה.
 *   required_document_unavailable · המסמך לא נקרא מהתיק.
 *   resume_queued                 · המסמך הגיע, ונוצרה משימת שידור חדשה אחת.
 *   submitted                     · השידור הצליח.
 */
export type ShaamDocumentsGateState =
  | 'awaiting_required_documents' | 'needs_document_assignment' | 'document_not_pdf_convertible'
  | 'unsupported_required_document' | 'first_live_verification' | 'required_document_unavailable'
  | 'resume_queued' | 'submitted';

export interface ShaamDocumentsPlanSlot {
  slotId: number; kind: string; label: string;
  status: string;
  person?: 'client' | 'spouse' | null; personName?: string | null;
  docKind?: string | null; sourceDocumentIds?: string[]; pageCount?: number | null; fileName?: string | null;
}

export interface ShaamDocumentsGate {
  state: ShaamDocumentsGateState;
  jobId?: string;
  at?: string;
  entityId?: string;
  person?: 'client' | 'spouse' | null;
  rows?: { slotId: number | null; kind: string; label: string; hasFile?: boolean }[];
  plan?: { entityId?: string; decision?: string; slots?: ShaamDocumentsPlanSlot[] };
  detail?: string;
  resumeJobId?: string;
  resumedAt?: string;
  resumePendingOpenJob?: boolean;
}

/** המצבים שבהם השידור **ממתין** (ולא רץ/הושלם) — הכפתור לא מוצע כ«נסה שוב». */
export const SHAAM_DOCUMENTS_BLOCKING_STATES: readonly ShaamDocumentsGateState[] = [
  'awaiting_required_documents', 'needs_document_assignment', 'document_not_pdf_convertible',
  'unsupported_required_document', 'first_live_verification', 'required_document_unavailable',
];

/** מצב ההמתנה כשהוא חוסם את השידור, או null. */
export function shaamDocumentsBlocked(t: ShaamRequestTracking | undefined): ShaamDocumentsGate | null {
  const g = t?.documentsGate;
  if (!g || t?.submittedAt) return null;
  return SHAAM_DOCUMENTS_BLOCKING_STATES.includes(g.state) ? g : null;
}

/**
 * סוג המסמך המזהה מתוך התווית בשע״ם. ‼ תאום של public.shaam_identity_doc_kind
 * (201/204) — אותו כלל בשני הצדדים. תווית שלא זוהתה ⇒ null, ולא ניחוש.
 * ‼ 204 · «תעודת זהות או רישיון נהיגה» ⇒ idOrLicense (כל אחד מהשניים מספק).
 */
export function shaamIdentityDocKind(label: string | undefined | null): ShaamIdentityDocKind | null {
  const l = (label ?? '').replace(/["״׳']/g, '');
  // ‼ 208 · «צילום תעודת הזהות» (עם ה' הידיעה) — כך שע״ם כתבה בלידיעתך של שלב 2.
  const id = /(תעודת\s*ה?זהות|ת\.\s*ז\.?|תז(?![א-ת])|ספח)/.test(l);
  const license = /(רישיון|רשיון)/.test(l);
  const passport = /דרכון/.test(l);
  if (id && license) return 'idOrLicense';
  if (id && passport) return 'idOrPassport';
  if (id) return 'idCard';
  if (passport) return 'passport';
  if (/(רישיון|רשיון)\s*נהיגה/.test(l)) return 'driverLicense';
  return null;
}

const REQUIRED_DOC_HANDLING_TEXT: Record<ShaamRequiredDocumentHandling, string> = {
  exists: 'כבר קיים בחומרי הלקוח - לא נדרש לבקש שוב',
  requested: 'נוספה בקשת מסמך ללקוח',
  already_requested: 'כבר מבוקש מהלקוח',
  ambiguous_materials: 'בתיק יש צילום תעודה שלא ידוע של מי הוא - יש לשייך אותו או לבקש ידנית',
  unrecognized: 'מסמך שאינו ת.ז./דרכון - לטיפול המשרד',
  no_request: 'אין בקשת ייצוג פעילה לשייך אליה את הדרישה',
  needs_document_assignment: 'לא ניתן לקבוע בוודאות של מי המסמך - הת.ז. בשע״ם אינה תואמת לאדם אחד בכרטיס',
  unsupported: 'מסמך שאינו מסמך מזהה - להשלמה ידנית בשע״ם',
};

export function shaamRequiredDocumentText(d: ShaamRequiredDocument): string {
  return d.handling ? REQUIRED_DOC_HANDLING_TEXT[d.handling] : '';
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
  if (shaamSettled(t)) return 'active';
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
  // ‼ 201 · אחרי ההגשה רק קריאה שמאחריה נחשבת ראיה.
  if (t?.submittedAt && !shaamReconciledAfterSubmission(t)) return false;
  const list = t?.systems ?? [];
  if (list.length === 0) return false;
  return list.every(row => classifyShaamSystem(row).state === 'accepted');
}

/** מערך שממתין לפתיחת תיק **שלא קיים** — ייקלט מעצמו אם ייפתח תיק. */
export function shaamAwaitingMissingFile(row: ShaamSystemStatus): boolean {
  if (classifyShaamRow(row) !== 'awaiting_file_opening') return false;
  const digits = (row.fileNumber ?? '').replace(/\D/g, '');
  return row.noFile === true || /לא\s*קיים\s*תיק/.test(norm(row.fileNumber)) || (digits !== '' && /^0+$/.test(digits));
}

/**
 * «גמור» לפי רשות (הכרעת גיא, 28.09.2026): כל מה שיש לו תיק נקלט, והשאר
 * ממתינים לפתיחת תיק שלא קיים (שע״ם קולטת אותם מעצמה אם ייפתח תיק, ומבטלת
 * אחרי 6 חודשים). ‼ לפחות מערך אחד נקלט — אחרת אין ראיה לשום ייצוג.
 */
export function shaamSettled(t: ShaamRequestTracking | undefined): boolean {
  if (allSystemsAccepted(t)) return true;
  if (t?.submittedAt && !shaamReconciledAfterSubmission(t)) return false;
  const list = t?.systems ?? [];
  const accepted = list.filter(r => classifyShaamRow(r) === 'accepted');
  return accepted.length > 0 && list.every(r => classifyShaamRow(r) === 'accepted' || shaamAwaitingMissingFile(r));
}

/** ISO date + n ימים. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * ‼ 28.09.2026 · מתוך ההדרכה של שע״ם: «בקשה אשר לא צורפו עבורה טפסים במשך 30
 * יום – תבוטל אוטומטית». המועד (ISO date) — רק כשיש בקשה שעוד לא שודרה.
 */
export function shaamUploadDeadline(t: ShaamRequestTracking | undefined): string | undefined {
  if (!t || t.submittedAt || !shaamRequestExists(t)) return undefined;
  const entered = parseShaamDate(t.systems?.find(r => r.enteredAt)?.enteredAt);
  const base = entered ?? (t.createdAt ? t.createdAt.slice(0, 10) : undefined);
  return base ? addDays(base, 30) : undefined;
}

/** «בקשה אשר במשך 6 חודשים לא נפתח לגביה תיק … תבוטל אוטומטית». */
export function shaamFileOpeningDeadline(row: ShaamSystemStatus): string | undefined {
  const entered = parseShaamDate(row.enteredAt);
  if (!entered) return undefined;
  const d = new Date(`${entered}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 6);
  return d.toISOString().slice(0, 10);
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

// ── 5. אחרי ההגשה — מה שע״ם אומרת עכשיו ─────────────────────────────────────
//
// ‼ 201 · שע״ם היא מקור האמת אחרי ההגשה. שלושה כללים:
//   · צילום רשימה שנקרא **לפני** ההגשה אינו מתאר את המצב — לא מוצג בכלל.
//   · הטקסט של שע״ם מוצג כמו שהוא («השהייה», לא «השהיה לקליטה»). הסיווג
//     משמש להחלטה מי צריך לפעול, לא להחלפת המילים של הרשות.
//   · «ממתין לאישור לקוח» הוא **פעולת חובה** של הלקוח — לא זירוז.

const ms = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/**
 * ‼ 28.09.2026 · המסמכים כבר אצל שע״ם, גם כשהם לא עברו דרך PIVO (דן רכס —
 * הוזן ושודר ידנית באוגוסט): «מצב בקשה» 2/3/5, או מערך שכבר עבר את שלב
 * המסמכים. ‼ קוד 6 («כשל-ממתין לטעינת חוזרת») אינו «אצל שע״ם» — צריך לטעון שוב.
 */
export function shaamDocumentsInShaam(t: ShaamRequestTracking | undefined): boolean {
  const rows = t?.systems ?? [];
  if (rows.length === 0) return false;
  const req = shaamRowRequestState(rows[0]);
  if (req === 'upload_failed' || req === 'awaiting_documents') return false;
  if (req === 'documents_received' || req === 'documents_approved' || req === 'documents_uploading') return true;
  return rows.some(r => ['accepted', 'suspended', 'authority_review', 'awaiting_client_approval'].includes(classifyShaamRow(r)));
}

/** ‼ 28.09.2026 · שע״ם מציגה «כשל-ממתין לטעינת חוזרת» — הטופס צריך להיטען שוב. */
export function shaamUploadFailed(t: ShaamRequestTracking | undefined): boolean {
  const rows = t?.systems ?? [];
  if (rows.length === 0) return false;
  if (t?.submittedAt && !shaamReconciledAfterSubmission(t)) return false;
  return shaamRowRequestState(rows[0]) === 'upload_failed';
}

/** יש קריאה של שע״ם שנעשתה אחרי ההגשה (ולכן מתארת את מה שקרה לטופס). */
export function shaamReconciledAfterSubmission(t: ShaamRequestTracking | undefined): boolean {
  if (!t?.submittedAt) return false;
  const seen = ms(t.observedAt ?? t.syncedAt);
  return Number.isFinite(seen) && seen >= ms(t.submittedAt);
}

export interface ShaamSystemLine {
  label: string;
  /** «מצב מערך» כפי ששע״ם כתבה אותו. ריק ⇒ שע״ם טרם עדכנה. */
  raw: string;
  state: ShaamSystemState;
  /** 28.09 · אין תיק במערך — ייקלט מעצמו אם ייפתח (עד המועד). */
  missingFile?: boolean;
  fileOpeningDeadline?: string;
  /** 28.09 · סיבת ביטול, כפי ששע״ם כתבה. */
  cancelReason?: string;
  /** 28.09 · המפתח של הרשות ב-PIVO (לפי kodMaarach/התווית). */
  authority?: ShaamSystemKey;
}

/** המערך של השורה כרשות ב-PIVO. */
export function shaamRowAuthority(row: ShaamSystemStatus): ShaamSystemKey | undefined {
  if (row.systemCode === 1) return 'incomeTax';
  if (row.systemCode === 2) return 'vat';
  if (row.systemCode === 5) return 'withholding';
  const l = norm(row.systemLabel).replace(/"/g, '');
  if (l.includes('מס הכנסה')) return 'incomeTax';
  if (l.includes('מעמ')) return 'vat';
  if (l.includes('ניכויים')) return 'withholding';
  return undefined;
}

export interface ShaamLifecycleView {
  submitted: boolean;
  submittedAt?: string;
  /** יש קריאה מאחרי ההגשה. בלעדיה — אין מצב חיצוני להציג. */
  reconciled: boolean;
  observedAt?: string;
  /** «מצב בקשה» כפי ששע״ם כתבה אותו (רק מקריאה שאחרי ההגשה). */
  requestStateRaw?: string;
  systems: ShaamSystemLine[];
  ball: ShaamBall;
  headline: string;
  /** פעולת חובה של הלקוח — כרגע רק «ממתין לאישור לקוח». */
  clientAction?: { required: true; title: string; text: string };
  /** מה המשרד צריך לעשות, כשיש. */
  officeAction?: string;
  /** מידע נוסף על מערך אחר באותה בקשה (למשל «ממתין לפתיחת תיק»). */
  note?: string;
  /** אבן הדרך הבאה ומועדה — רק תאריך ששע״ם מסרה. */
  nextMilestone?: { text: string; date?: string };
  requiredDocuments: ShaamRequiredDocument[];
}

export function shaamLifecycle(t: ShaamRequestTracking | undefined): ShaamLifecycleView {
  const requiredDocuments = t?.requiredDocuments ?? [];
  // ‼ 28.09.2026 · הוגש מחוץ ל-PIVO (ידנית בשע״ם) — שע״ם עצמה אומרת שהמסמכים אצלה.
  const outside = !t?.submittedAt && shaamDocumentsInShaam(t);
  const base = {
    submitted: !!t?.submittedAt || outside, submittedAt: t?.submittedAt, observedAt: t?.observedAt,
    requiredDocuments,
  };
  if (!t || (!t.submittedAt && !outside)) {
    const line = shaamProgressLine(t);
    return { ...base, reconciled: false, systems: [], ball: line.ball, headline: line.text };
  }

  const reconciled = outside || shaamReconciledAfterSubmission(t);
  const systems: ShaamSystemLine[] = reconciled
    ? (t.systems ?? []).map(r => {
      const state = classifyShaamRow(r);
      const missingFile = shaamAwaitingMissingFile(r);
      return {
        label: r.systemLabel || 'מערך',
        raw: (r.rawSystemState ?? '').trim(),
        state,
        ...(missingFile ? { missingFile, fileOpeningDeadline: shaamFileOpeningDeadline(r) } : {}),
        ...(r.cancelReason ? { cancelReason: r.cancelReason } : {}),
        ...(shaamRowAuthority(r) ? { authority: shaamRowAuthority(r) } : {}),
      };
    })
    : [];
  // «מצב בקשה» מהשורה שנקראה (כמו שהשרת שומר אותו), ורק מקריאה שאחרי ההגשה.
  const requestStateRaw = reconciled ? (t.systems?.[0]?.rawRequestState ?? t.rawRequestState ?? '').trim() || undefined : undefined;
  // ‼ רק תאריך ששע״ם מסרה: מהשרת (201), ואם אין — מפירוט השורה שנקרא.
  const suspensionDate = t.suspensionEndsAt
    ?? (reconciled ? (t.systems ?? []).map(r => parseShaamDate(r.suspensionEndsRaw)).find(Boolean) : undefined);
  const suspensionMilestone = suspensionDate
    ? { text: t.suspensionEndsSource === 'submission_confirmation'
          ? 'צפי לסיום ההשהייה (כפי ששע״ם מסרה באישור הקליטה)'
          : 'צפי לסיום ההשהייה (כפי ששע״ם מציגה)',
        date: suspensionDate }
    : undefined;
  const opening = systems.filter(s => s.state === 'awaiting_file_opening');
  // ‼ «ממתין לפתיחת תיק» — הכדור אצל הרשות (כמו לפני 201). לא ממציאים פעולה למשרד.
  // ‼ 28.09 · לפי ההדרכה של שע״ם: נקלט אוטומטית בלילה שאחרי פתיחת התיק, ומתבטל אחרי 6 חודשים.
  const openingNote = opening.length
    ? `${opening.map(s => s.label).join(', ')}: שע״ם ממתינה לפתיחת תיק - הייצוג במערך הזה ייקלט מעצמו בלילה שאחרי פתיחת התיק${opening[0].fileOpeningDeadline ? `, ויתבטל אם לא ייפתח תיק עד ${opening[0].fileOpeningDeadline}` : ''}.`
    : undefined;
  const v = { ...base, reconciled, systems, requestStateRaw };

  if (!reconciled) {
    return {
      ...v, ball: 'authority',
      // ‼ אין כאן «הריצו בדוק»: לבדיקה יש כפתור אחד ליד כותרת המרכז.
      headline: 'הטופס החתום נקלט בשע״ם. המצב העדכני אחרי ההגשה טרם נקרא משע״ם.',
      nextMilestone: suspensionMilestone,
    };
  }
  if (systems.length > 0 && systems.every(s => s.state === 'accepted')) {
    return { ...v, ball: 'done', headline: 'הייצוג נקלט בשע״ם בכל המערכים שהתבקשו.' };
  }
  // ‼ הכרעת גיא (28.09.2026): «פעיל לפי רשות» — כל מה שיש לו תיק נקלט.
  if (shaamSettled(t)) {
    const acc = systems.filter(s => s.state === 'accepted').map(s => s.label).join(', ');
    return { ...v, ball: 'done', headline: `הייצוג נקלט בשע״ם ב${acc}.`, note: openingNote };
  }
  if (shaamUploadFailed(t)) {
    return {
      ...v, ball: 'office',
      headline: 'שע״ם מציגה «כשל-ממתין לטעינת חוזרת» - הטופס לא נקלט וצריך לטעון אותו שוב.',
      officeAction: 'לשלוח שוב את הטופס החתום לשע״ם.',
    };
  }
  if (t.notInListAt && ms(t.notInListAt) >= ms(t.submittedAt)) {
    return {
      ...v, ball: 'office',
      headline: 'הבקשה כבר לא מופיעה ב«בקשות בתהליך» בשע״ם.',
      officeAction: 'לבדוק בשע״ם אם הייצוג נקלט או שהבקשה בוטלה - PIVO לא מסיקה אחד מהשניים.',
    };
  }
  if (systems.some(s => s.state === 'awaiting_client_approval')) {
    return {
      ...v, ball: 'client',
      headline: 'הייצוג ממתין לאישור הלקוח.',
      clientAction: {
        required: true,
        title: 'הייצוג ממתין לאישור הלקוח',
        // ‼ 28.09 · מההדרכה של שע״ם: ההודעה ללקוח (מסרון, מייל ומכתב) יוצאת משע״ם
        // עצמה, ובשע״ם אין פעולה «שלח שוב». התזכורת — מ-PIVO.
        text: 'רשות המסים שלחה ללקוח הודעה (מסרון, מייל ומכתב) עם קישור לאישור הייצוג. הלקוח חייב לאשר - בקישור או באזור האישי. בשע״ם אין אפשרות לשלוח את ההודעה שוב.',
      },
      note: openingNote,
    };
  }
  const stopped = systems.find(s => s.state === 'rejected' || s.state === 'cancelled');
  if (stopped) {
    return {
      ...v, ball: 'office',
      headline: `שע״ם מציגה «${stopped.raw}» ב${stopped.label}${stopped.cancelReason ? ` - ${stopped.cancelReason}` : ''}.`,
      officeAction: 'לבדוק את הבקשה בשע״ם ולהחליט איך ממשיכים.',
    };
  }
  if (systems.some(s => s.state === 'authority_review')) {
    return {
      ...v, ball: 'authority',
      headline: 'הבקשה בבדיקה פרטנית של מרשם המייצגים ברשות המסים («השהיית מטה») - אין מועד ידוע.',
      note: openingNote,
    };
  }
  if (systems.some(s => s.state === 'suspended')) {
    return {
      ...v, ball: 'authority',
      headline: 'הבקשה בהשהייה בשע״ם - אין פעולה נדרשת עד סיום ההשהייה.',
      note: openingNote,
      nextMilestone: suspensionMilestone,
    };
  }
  if (opening.length) {
    return { ...v, ball: 'authority', headline: 'שע״ם ממתינה לפתיחת תיק - הבקשה תיקלט כשייפתח.', note: openingNote };
  }
  const unknown = systems.find(s => s.state === 'unknown');
  return {
    ...v, ball: 'authority',
    headline: unknown ? `שע״ם מציגה «${unknown.raw}» ב${unknown.label}.` : 'הטופס נקלט בשע״ם - הבקשה בטיפול הרשות.',
  };
}

/**
 * התרגום היחיד ממצב חיצוני למשפט אנושי. ‼ במקום אחד, כדי ששני המשטחים
 * (מרכז הביצוע וכרטיס הרשות) לא יספרו שני סיפורים על אותה בקשה.
 */
export function shaamProgressLine(t: ShaamRequestTracking | undefined): ShaamProgressLine {
  // ‼ 201 · אחרי ההגשה — אותו מקור כמו המסך (shaamLifecycle), כדי שלא יהיו שני סיפורים.
  // ‼ 28.09 · כולל הגשה שנעשתה מחוץ ל-PIVO (שע״ם אומרת שהמסמכים אצלה).
  if (t?.submittedAt || shaamDocumentsInShaam(t)) {
    const l = shaamLifecycle(t);
    return { ball: l.ball, text: l.headline, until: l.nextMilestone?.date };
  }
  if (!t || !shaamRequestExists(t)) {
    return { ball: 'office', text: 'טרם נפתחה בקשת ייצוג בשע״ם.' };
  }
  if (shaamSettled(t)) {
    return { ball: 'done', text: 'הייצוג נקלט בשע״ם בכל המערכים שהתבקשו.' };
  }
  if (shaamUploadFailed(t)) {
    return { ball: 'office', text: 'שע״ם מציגה «כשל-ממתין לטעינת חוזרת» - יש לשלוח שוב את הטופס החתום.' };
  }
  const views = shaamSystemViews(t);
  const waitingClient = views.find(s => s.state === 'awaiting_client_approval');
  if (waitingClient) {
    return { ball: 'client', text: 'שע״ם ממתינה לאישור הלקוח באזור האישי — עד שיאשר, הקליטה לא מתקדמת.' };
  }
  if (!t.submittedAt) {
    if (!t.formDocumentId) {
      if (!t.requestNumber || (t.systems?.length ?? 0) > 0) {
        // ‼ נמצאה בשע״ם בלי ש-PIVO פתחה אותה (הוזנה ידנית) — הטופס לא הגיע
        // דרך האוטומציה, ולכן לא אומרים «נשאר להביא»: מדווחים מה שנקרא.
        // ‼ 199: גם כשהמספר נקרא אחר כך מהבקשה שנפתחה — אותה בקשה, אותו דיווח.
        const state = t.systems?.[0] ? shaamRowRequestState(t.systems[0]) : parseShaamRequestState(t.rawRequestState);
        const which = t.requestNumber ? `הבקשה ${t.requestNumber}` : 'הבקשה';
        return {
          ball: 'office',
          text: `${which} פתוחה בשע״ם (נמצאה ברשימת הבקשות בתהליך) — ${SHAAM_REQUEST_STATE_LABELS[state]}.`,
          until: shaamUploadDeadline(t),
        };
      }
      return { ball: 'office', text: `הבקשה נפתחה בשע״ם (${t.requestNumber}) — נשאר להביא את טופס ייפוי הכוח.`, until: shaamUploadDeadline(t) };
    }
    // ‼ 28.09 · «בקשה שלא צורפו לה טפסים 30 יום תבוטל» (ההדרכה של שע״ם).
    return { ball: 'office', text: 'טופס ייפוי הכוח מוכן — נשאר להחתים ולשדר אותו לשע״ם.', until: shaamUploadDeadline(t) };
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
  /**
   * ✓ ליד «אני/אנחנו מאשר/ים לרשות המסים לשלוח הודעות באמצעות מסרון (sms) או
   * לתיבת הדואר האלקטרוני». ‼ 28.09.2026 · גיא סימן אותו ידנית בהדגמה המוקלטת
   * (לזימי, 27.08) — ובטופס שהוכן אוטומטית (הדסה, 23.09) הוא נשאר ריק.
   */
  smsConsentCheck: Form2279Box;
  /** ✓ ליד «אני מאשר שייפוי הכוח המקורי עליו חתמו הנישום ו/או בן/ת זוגו נמצא במשרדי». אותו מקור. */
  representativeOriginalCheck: Form2279Box;
} = {
  registeredSigner: { xPct: 0.3934938248867116, yPct: 0.5141197691937937, widthPct: 0.1487377943942933, heightPct: 0.03382656485562341 },
  otherSpouse: { xPct: 0.13005731072135313, yPct: 0.5113501234488552, widthPct: 0.1487377943942933, heightPct: 0.03382656485562341 },
  accountantStamp: { xPct: 0.09886512564599877, yPct: 0.7129217899296978, widthPct: 0.22514095909038695, heightPct: 0.066606306884761 },
  // ‼ המיקומים המדויקים שגיא סימן בעורך על טופס 2279 אמיתי (בקשה 2026495063, 27.08.2026).
  smsConsentCheck: { xPct: 0.8738551401869159, yPct: 0.49810469314079425, widthPct: 0.035, heightPct: 0.025 },
  representativeOriginalCheck: { xPct: 0.8703504672897197, yPct: 0.7246389891696752, widthPct: 0.035, heightPct: 0.025 },
};

/**
 * עוגני הטקסט של טופס 2279 (5א) כפי ששע״ם מפיקה אותו — מיקום (שמאל, מלמעלה,
 * באחוזי עמוד) של מילים קבועות בטופס. ‼ 28.09.2026 · נמדדו בשכבת הטקסט של שני
 * טפסים אמיתיים (23.09 ו-27.08, זוג נשוי וגרוש) — זהים עד שלוש ספרות אחרי הנקודה.
 * התבנית שלמעלה נכונה רק כשהעוגנים במקומם; אחרת — לא מסמנים אוטומטית.
 */
export const FORM_2279_ANCHORS: { id: string; text: string; x: number; y: number }[] = [
  { id: 'registered_signature_label', text: 'חתימת', x: 0.498, y: 0.549 },
  { id: 'registered_word', text: 'רשום', x: 0.431, y: 0.549 },
  { id: 'other_spouse_signature_label', text: 'חתימת', x: 0.231, y: 0.549 },
  { id: 'sms_consent_line', text: 'אני', x: 0.855, y: 0.518 },
  { id: 'representative_original_line', text: 'אני', x: 0.846, y: 0.743 },
  { id: 'representative_stamp_label', text: 'וחותמת', x: 0.175, y: 0.773 },
];

/** פריט טקסט מעמוד 1 — x/y באחוזי עמוד (y מלמעלה). */
export interface Form2279TextItem { s: string; x: number; y: number }

export interface Form2279Layout {
  numPages: number;
  width: number;
  height: number;
  items: Form2279TextItem[];
}

/**
 * האם הטופס שהתקבל משע״ם הוא בדיוק הטופס שהתבנית נמדדה עליו.
 * ‼ עמוד אחד, 612×792 נק', וכל העוגנים במקומם (סטייה עד ~1% מהעמוד). אחרת —
 * `ok:false` ו**לא** מסמנים אזורי חתימה אוטומטית (מיקום שגוי היה נחתם).
 */
export function verifyForm2279Layout(layout: Form2279Layout | null | undefined): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!layout) return { ok: false, problems: ['form_not_read'] };
  if (layout.numPages !== 1) problems.push(`pages:${layout.numPages}`);
  if (Math.abs(layout.width - 612) > 2 || Math.abs(layout.height - 792) > 2) problems.push(`size:${Math.round(layout.width)}x${Math.round(layout.height)}`);
  for (const a of FORM_2279_ANCHORS) {
    const hit = layout.items.some(i => i.s.trim() === a.text && Math.abs(i.x - a.x) <= 0.012 && Math.abs(i.y - a.y) <= 0.008);
    if (!hit) problems.push(`anchor:${a.id}`);
  }
  return { ok: problems.length === 0, problems };
}

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
  // ‼ 28.09.2026 · שני ה-✓ שגיא סימן בהדגמה המוקלטת — תוכן קבוע של המשרד,
  // נצרב על הטופס לפני השליחה (signerId 'static', כמו בעורך).
  fields.push(
    { id: fieldId('check-sms'), signerId: 'static', kind: 'check', pageIndex: 0, ...FORM_2279_TEMPLATE.smsConsentCheck },
    { id: fieldId('check-original'), signerId: 'static', kind: 'check', pageIndex: 0, ...FORM_2279_TEMPLATE.representativeOriginalCheck },
  );
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

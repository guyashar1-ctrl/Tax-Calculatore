// ─── קיבוץ שורות "מה אני צריך מהלקוח" — כרטיס אחד למושג ─────────────────────
// ‼ שלושה כללי קיבוץ, בסדר הזה (אב-הטיפוס המאושר requests-v2-approved.html):
//
// 1. שרשרת-מושג = כרטיס אחד. "פתיחת חשבון פייפרלס" היא הזמנה+חיבור, ו"מעבר
//    מרו״ח קודם" היא פרטים+מכתב שחרור+קבלת חומרים. בעיני הרו"ח זה דבר אחד.
//
// 2. ייצוג = תהליך אחד (סבב 4, הכרעת גיא): כל עוד שלב «ייצוג מול הרשויות» פתוח,
//    «ייצוג בביטוח לאומי» לכל אדם ו«צילום תעודה לרשות המסים» של **אותה** בקשת
//    ייצוג יורדים לתוכו. כשההורה נסגר / חסר / שייך לבקשה אחרת — כל חלק עומד
//    לבדו (יסודות §6: בנים מסתיימים כל אחד בזמנו).
//
// 3. בקשה שתלויה בכרטיס אחר יורדת לתוכו ככרטיס-בן (childOf באב-הטיפוס):
//    "הרשאה לחיוב חודשי" תלויה בחיבור הפייפרלס, ולכן היא נקראת כצעד ההמשך
//    שלו — לא כשורה נפרדת ברשימה. זה הכלל שהופך רשימה שטוחה לתהליך.
//    ומשימת «אישור אישי» של בן/בת הזוג יורדת לבקשה של בעל הכרטיס שממנה נולדה.
//
// הפונקציה קובעת רק **מי בתוך מי**; הרינדור עצמו נשאר ב-OnboardingTab, ששם
// יושבים הכרטיסים הייעודיים (PaperlessStepCard, ReleaseStepCard…).
// ‼ summarizeRow קובע את מצב השורה כולה: חלק שדורש אותך לעולם לא נבלע בתוך
// שורה שמצבה נגזר מהחלק הראשי בלבד (זה מה שהסתיר פעולות עד סבב 4).

import type { OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { isStepOpen, compareStepsForOffice, LEGACY_AUTO_OFFICE_TYPES } from '../types/onboarding';
import type { Attention, WaitingOn } from './requestAttention';

// ─── מה השורה הזאת — הגדרה אחת ───────────────────────────────────────────────
// ‼ יושבות כאן ולא ב-requestAttention כדי שהקיבוץ (כאן) והספירה (שם) לא ייבאו
// זה מזה במעגל. requestAttention מייצא אותן הלאה — המסכים מייבאים משם.

type PayloadLike = { payload?: unknown };
const payloadOf = (s: PayloadLike): Record<string, unknown> =>
  (s.payload && typeof s.payload === 'object' ? s.payload : {}) as Record<string, unknown>;
const isObject = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const truthy = (v: unknown): boolean => v === true || v === 'true';

/**
 * שורה שלעולם לא מופיעה בדף הלקוח — משימה פנימית (internalTask) או משימת האישור
 * האישי של בן/בת הזוג (personalConfirmFor). השרת מסנן את שתיהן מהדף ומהמיילים, ולכן
 * «טיוטה», «עוד לא בדף», «בדף מ-…» ו«פרסם בדף» לא אומרים עליהן דבר.
 */
export function neverOnClientPage(step: PayloadLike): boolean {
  const p = payloadOf(step);
  return truthy(p.internalTask) || typeof p.personalConfirmFor === 'string';
}

/**
 * יש בבקשה משהו בשביל הלקוח (או גורם חיצוני) — מה למלא, לקרוא, לפתוח או לאשר.
 * ‼ התאום של public._payload_has_client_content בשרת (216 §9). שינוי כאן — שם.
 */
export function hasClientContent(payload: unknown): boolean {
  if (!isObject(payload)) return false;
  const p = payload as Record<string, unknown>;
  const list = (k: string) => Array.isArray(p[k]) && (p[k] as unknown[]).length > 0;
  const text = (k: string) => typeof p[k] === 'string' && (p[k] as string).trim() !== '';
  return list('requirements') || list('checklist') || list('clientResources')
    || (p.clientResource != null && p.clientResource !== '') || text('clientLinkUrl')
    || truthy(p.messageOnly)
    || isObject(p.externalParty)
    || 'smartForm' in p || 'shaamIdentity' in p || 'guideKey' in p;
}

/**
 * «משימה פנימית ישנה — לבדיקה» (216 §9): בקשה בלי שום תוכן ללקוח, בלי ראיה שנוצרה
 * כמשימה של המשרד — ולכן היא עדיין בדף של הלקוח, והמשרד מחליט («הסתר מהדף» / עריכה).
 */
export function isLegacyInternalReview(s: PayloadLike & { stepType: OnboardingStepType | string }): boolean {
  if (s.stepType !== 'custom_request') return false;
  const p = payloadOf(s);
  return truthy(p.internalTaskReview) && !neverOnClientPage(s) && !hasClientContent(p);
}

/**
 * משימה פנימית — «העבודה שלי», לא בקשה מלקוח.
 * ‼ (סבב 4) לא לפי הכדור לבדו: משימה של המשרד שהועברה ל«ממתין ללקוח» היא עדיין
 * משימה פנימית (הסימון בשרת), ובקשה של הלקוח שהלקוח השלים (הכדור עבר למשרד) היא
 * עדיין בקשה — לבדיקה, לא «עבודה פנימית».
 * ‼ הגשת טופס חכם (206) — בקשה מול לקוח עם מחזור משלה, גם כשהכדור אצל המשרד.
 */
export function isManualInternal(
  s: { stepType: OnboardingStepType | string; ball?: string | null } & PayloadLike,
): boolean {
  if (s.stepType !== 'custom_request') return false;
  const p = payloadOf(s);
  if (p.smartForm) return false;
  if (isLegacyInternalReview(s)) return false;
  return neverOnClientPage(s) || (s.ball === 'me' && !hasClientContent(p));
}

/** שם ישן — אותה הגדרה (OnboardingTab). */
export const isManualInternalTask = (s: OnboardingStep): boolean => isManualInternal(s);

/**
 * «אישור אישי של בן/בת הזוג» (215: personalConfirmFor + officeNote): משימת משרד
 * (אותם כפתורים כמו משימה פנימית — «בוצע» / «אין צורך»), אבל זו בקשה חובה מהמסלול
 * שאין לה מסלול אישי נתמך — ולכן כחולה ונספרת בתג ובפעולה הבאה, ולא נבלעת.
 * ‼ המקום היחיד שמזהה אותה — requestAttention ו-runSummary מייצאים מכאן.
 */
export const isSpouseConfirmTask = (s: { ball?: string | null; payload?: object | null }): boolean =>
  s.ball === 'me' && typeof (s.payload as { personalConfirmFor?: unknown } | null | undefined)?.personalConfirmFor === 'string';

/**
 * «לא נוצרה — «X»» (217): בקשה שהייתה אמורה להיווצר ולא נוצרה. שורת משרד אדומה
 * ב«בקשות» — נספרת בתג, «תקוע» בשולחן — עם הסיבה, «צור שוב» ו«אין צורך».
 */
export const isCreationProblem = (s: { ball?: string | null; payload?: object | null }): boolean =>
  s.ball === 'me' && isObject((s.payload as { creationProblem?: unknown } | null | undefined)?.creationProblem);

// ─── הסוגים ─────────────────────────────────────────────────────────────────

export type ClientRowKind = 'paperless' | 'prevAccountant' | 'representation' | 'single';

export interface ClientFacingRow {
  key: string;
  kind: ClientRowKind;
  /** כל השלבים בשרשרת-המושג, בסדר הפנימי שלהם — תמיד יש לפחות אחד. */
  members: OnboardingStep[];
  /** השלב שקובע כותרת וכרטיס — הראשון הפתוח, אחרת הראשון. */
  primary: OnboardingStep;
  /** כרטיסי-המשך שתלויים בכרטיס הזה ומוצגים בתוכו. */
  children: ClientFacingRow[];
  /**
   * חלק מבקשת ייצוג שאינה פתוחה כאן (ההורה נסגר / חסר / שייך לבקשה אחרת) —
   * שורה עצמאית, עם שורת הקשר «חלק מבקשת הייצוג…» ו«למרכז הייצוג ←».
   */
  repPart?: boolean;
}

export interface RowGroupingOptions {
  /**
   * בקשת הייצוג הנוכחית של הלקוח (clients.representation_request_id).
   * undefined = לא ידוע (מסך שאין לו את הכרטיס, למשל השולחן) ⇒ כל חלק נחשב
   * שייך להורה הפתוח; null = אין ללקוח בקשת ייצוג ⇒ כל חלק עומד לבדו.
   */
  representationRequestId?: string | null;
}

/**
 * בקשות לקוח שמוצגות ב"מה אני צריך מהלקוח". כל מה שלא ברשימה הזאת (kyc, הקמה
 * פנימית, ביקורת חודש ראשון, שיחת פתיחה, יישור קו למוסדות, פתיחת תיקים) שייך
 * ל"העבודה שלי". שלבי הייצוג — REPRESENTATION_TYPES ו«שדרוג לייצוג ראשי» (חלק של
 * הייצוג, isRepresentationPart) — מקובצים לבד.
 *
 * ‼ 'rep_client_approval' אינו כאן במכוון (הכרעת גיא): הוא אינו בקשה עצמאית
 * אלא צעד בתוך ביצוע הייצוג, ומקומו בבלוק "מס הכנסה" שבמרכז הביצוע — בין
 * "נשלח לשע״ם" ל"הייצוג פעיל". שורה נפרדת במשטח הבקשות ניתקה אותו מהתהליך
 * שהוא חלק ממנו, והציגה כמשימה בפני עצמה מה שהוא קיצור דרך בתוך משימה אחרת.
 * ‼ הלקוח כן ממשיך לראות אותו בדף האישי — שם הוא פריט ככל פריט, כי מבחינתו
 * זו באמת פעולה אחת שמבקשים ממנו.
 */
export const CLIENT_FACING_TYPES: OnboardingStepType[] = [
  'client_documents', 'prev_accountant_details', 'paperless_invite', 'paperless_connection',
  // ‼ אינו חבר בשרשרת הפייפרלס אלא כרטיס בפני עצמו: הוא תלוי בחיבור,
  // ולכן הקינון לפי תלות מציב אותו מתחתיו — באותה צורה שהרשאת התשלום
  // יושבת שם. חברות בשרשרת הייתה מסתירה אותו מאחורי כותרת "פייפרלס".
  'paperless_tax_authority',
  'retainer_authorization', 'intake_questionnaire', 'custom_request',
  'release_letter', 'materials_received',
];

/** שלבי הייצוג — ההורה (נגזר מ-representation_requests) והחלק לכל רשות×אדם (157). */
export const REPRESENTATION_TYPES: OnboardingStepType[] = ['representation', 'authority_representation'];

/**
 * ‼ עבודה פנימית שהמרכיב יוצר לבד — **אינה מוצגת במשטח הבקשות** (הכרעת גיא).
 * המשטח הזה הוא "מה אני צריך מאנשים אחרים", לא מערכת לניהול משימות המשרד;
 * כרטיסים אוטומטיים כמו "הקמה פנימית" הפכו אותו ללוח מטלות.
 *
 * ‼ שום דבר לא נמחק: השלבים ממשיכים להתקיים במסד וממשיכים להופיע ביומן
 * "מה קרה". רק התצוגה כאן ירדה — ואיתה גם החסימה של סגירת הקליטה, כי אסור
 * שגיא ייחסם על ידי פריט שהמסך בכוונה לא מראה לו.
 * העבודה הפנימית שכן מוצגת: "יישור קו ללקוח", ומשימה שהרו"ח הוסיף בעצמו.
 *
 * ‼ רשימה אחת בלבד — היא חיה ב-types/onboarding.ts, כי אותה רשימה בדיוק גם
 * קובעת מה לא חוסם סגירה. שני עותקים היו נפרדים ביום שמישהו יוסיף סוג.
 */
export { LEGACY_AUTO_OFFICE_TYPES as AUTO_OFFICE_TYPES } from '../types/onboarding';

/** «שדרוג לייצוג ראשי» — נפתח כשהייצוג נלקח כמשני (sync_representation_upgrade_step). */
export const isRepresentationUpgrade = (s: Pick<OnboardingStep, 'stepType'>): boolean =>
  s.stepType === 'representation_upgrade';

/**
 * מה שמשטח הבקשות לא מציג מתוך העבודה הפנימית האוטומטית: LEGACY_AUTO_OFFICE_TYPES, **חוץ**
 * מ«שדרוג לייצוג ראשי» — הוא חלק של הייצוג (יסודות §6: בן שעומד לבד כשההורה נסגר), ולכן
 * גלוי ב«בקשות» — מקובץ תחת «ייצוג מול הרשויות» כשההורה פתוח, ולבד כשנסגר.
 * ‼ סגירת הקליטה לא משתנה: isStepRequiredForClose ממשיך לקרוא את LEGACY_AUTO_OFFICE_TYPES,
 * והשדרוג אינו חוסם אותה (גם בשרת — required_for_close=false).
 */
export const SURFACE_HIDDEN_OFFICE_TYPES: OnboardingStepType[] =
  LEGACY_AUTO_OFFICE_TYPES.filter(t => t !== 'representation_upgrade');

/**
 * שלבים שמסך אחר מנהל, ולכן אינם מוצגים במשטח הבקשות **בשום קטע** — לא
 * ב"מה אני צריך מהלקוח" ולא ב"העבודה שלי".
 *
 * ‼ ההבדל מ-AUTO_OFFICE_TYPES: אלה אינם עבודה פנימית שהוסתרה, אלא עבודה
 * שיש לה בית טוב יותר. «אישור המייצג באזור האישי» חי בבלוק "מס הכנסה"
 * שבמרכז ביצוע הייצוג, בין "נשלח לשע״ם" ל"הייצוג פעיל" — שם הוא נקרא
 * כקיצור דרך בתוך התהליך, ולא כמשימה עצמאית שצריך לזכור לסגור.
 * ‼ שורה במשטח **וגם** שורה במרכז הביצוע היו שני מקומות לאותו דבר; הכפתור
 * שסוגר הוא אחד ("סמן כמיוצג פעיל"), ולכן גם התצוגה צריכה להיות אחת.
 */
export const EXECUTION_OWNED_TYPES: OnboardingStepType[] = ['rep_client_approval'];

/** «צילום תעודה לרשות המסים» (208) — בקשת אישור של צילום שבתיק, לבקשת ייצוג מסוימת. */
export const isShaamIdentityStep = (s: Pick<OnboardingStep, 'stepType'> & PayloadLike): boolean =>
  s.stepType === 'custom_request' && isObject(payloadOf(s).shaamIdentity);

/** לאיזו בקשת ייצוג שייך חלק (ב"ל לאדם / צילום תעודה). ריק ⇒ לא ידוע. */
export function representationRequestOf(s: Pick<OnboardingStep, 'stepType'> & PayloadLike): string | null {
  const p = payloadOf(s);
  const v = s.stepType === 'authority_representation'
    ? p.representationRequestId
    : (p.shaamIdentity as { requestId?: unknown } | undefined)?.requestId;
  return typeof v === 'string' && v ? v : null;
}

/** חלק בבקשת הייצוג (לא ההורה עצמו): ב"ל לאדם, צילום תעודה לשע״ם, שדרוג לייצוג ראשי. */
export const isRepresentationPart = (s: Pick<OnboardingStep, 'stepType'> & PayloadLike): boolean =>
  s.stepType === 'authority_representation' || isShaamIdentityStep(s) || isRepresentationUpgrade(s);

/**
 * החלק שייך לבקשת הייצוג `reqId`. undefined = לא ידוע (השולחן) ⇒ כן; null = אין ללקוח
 * בקשת ייצוג ⇒ לא. ‼ «שדרוג לייצוג ראשי» אינו נושא מזהה בקשה — הוא של הייצוג של הלקוח,
 * כלומר של הבקשה הנוכחית.
 */
export function belongsToRepresentationRequest(
  s: Pick<OnboardingStep, 'stepType'> & PayloadLike, reqId: string | null | undefined,
): boolean {
  if (reqId === undefined) return true;
  if (!reqId) return false;
  if (isRepresentationUpgrade(s)) return true;
  return representationRequestOf(s) === reqId;
}

/**
 * חלק של בקשת ייצוג **קודמת**: יש לו מזהה בקשה, והוא לא של הבקשה הנוכחית.
 * ‼ הביצוע שבמסך (מסלולי ב"ל, מצב הבקשה) הוא של הבקשה הנוכחית — אסור לקרוא אותו עבורו.
 * undefined (לא ידוע) ⇒ לא; חלק בלי מזהה (שורה ישנה) ⇒ לא.
 */
export function isStaleRepresentationPart(
  s: Pick<OnboardingStep, 'stepType'> & PayloadLike, reqId: string | null | undefined,
): boolean {
  if (reqId === undefined) return false;
  const own = representationRequestOf(s);
  return !!own && own !== reqId;
}

const roleRank = (s: OnboardingStep): number => {
  const p = payloadOf(s);
  const role = s.stepType === 'authority_representation'
    ? p.subjectRole
    : (p.shaamIdentity as { person?: unknown } | undefined)?.person;
  return role === 'spouse' ? 1 : 0;
};

/** החבר הפעיל של שרשרת: הראשון הפתוח בסדר הפנימי, אחרת הראשון (הכול נסגר). */
function pickPrimary(members: OnboardingStep[]): OnboardingStep {
  return members.find(s => isStepOpen(s.status)) ?? members[0];
}

const bySort = (a: ClientFacingRow, b: ClientFacingRow) =>
  compareStepsForOffice(a.primary, b.primary);

/**
 * מקבצת את שלבי הלקוח לכרטיסים, בסדר התצוגה.
 *
 * @param depParents כל ההורים של כל שלב (מיגרציה 78). בלעדיו נופלים לעמודת
 *   ההורה היחיד — מה שמספיק לפייפרלס→הרשאה, שהוא המקרה שהאב-טיפוס מדגים.
 */
export function buildClientFacingRows(
  steps: OnboardingStep[],
  depParents?: Map<string, string[]>,
  opts: RowGroupingOptions = {},
): ClientFacingRow[] {
  const pool = steps.filter(s => s.status !== 'cancelled' && (
    CLIENT_FACING_TYPES.includes(s.stepType)
    // ‼ הורה שנסגר אינו שורה פתוחה; חלק שנסגר — כמו כל בקשה שהושלמה.
    || (s.stepType === 'representation' && isStepOpen(s.status))
    || s.stepType === 'authority_representation'
    || isRepresentationUpgrade(s)));
  const byType = new Map<OnboardingStepType, OnboardingStep>();
  for (const s of pool) if (!byType.has(s.stepType)) byType.set(s.stepType, s);

  const merged = new Set<string>();
  const rows: ClientFacingRow[] = [];
  const mk = (
    key: string, kind: ClientRowKind, members: OnboardingStep[], preferred?: OnboardingStep,
  ): ClientFacingRow =>
    ({ key, kind, members, primary: preferred ?? pickPrimary(members), children: [] });

  // ── ייצוג מול הרשויות — תהליך אחד ───────────────────────────────────────
  const repParent = pool.find(s => s.stepType === 'representation');
  const wantReq = opts.representationRequestId;
  const repParts = pool.filter(isRepresentationPart);
  const inGroup = (s: OnboardingStep): boolean => !!repParent && belongsToRepresentationRequest(s, wantReq);
  // ב"ל לכל אדם קודם (לקוח, אחר כך בן/בת הזוג), אחריו צילומי התעודה, ובסוף השדרוג לראשי.
  const partRank = (s: OnboardingStep): number => (isRepresentationUpgrade(s) ? 2 : isShaamIdentityStep(s) ? 1 : 0);
  if (repParent) {
    const parts = repParts.filter(inGroup).sort((a, b) =>
      partRank(a) - partRank(b)
      || roleRank(a) - roleRank(b)
      || compareStepsForOffice(a, b));
    const members = [repParent, ...parts];
    members.forEach(s => merged.add(s.id));
    rows.push(mk('representation', 'representation', members, repParent));
  }

  const invite = byType.get('paperless_invite');
  const connection = byType.get('paperless_connection');
  if (invite || connection) {
    const members = [invite, connection].filter((s): s is OnboardingStep => !!s);
    members.forEach(s => merged.add(s.id));
    rows.push(mk('paperless', 'paperless', members));
  }

  const prevDetails = byType.get('prev_accountant_details');
  const release = byType.get('release_letter');
  const materials = byType.get('materials_received');
  if (prevDetails || release || materials) {
    const members = [prevDetails, release, materials].filter((s): s is OnboardingStep => !!s);
    members.forEach(s => merged.add(s.id));
    // ‼ מכתב השחרור הוא תמיד פניו של המסלול, גם כשהוא נעול (ממתין לפרטים)
    // וגם כשהוא כבר נסגר (נחתם) והחומרים עדיין נאספים. הכרטיס שלו הוא
    // סביבת העבודה של ההעברה כולה — מי, מה מבקשים, מה נשלח ומה חזר.
    rows.push(mk('prevAccountant', 'prevAccountant', members, release));
  }

  for (const s of pool) {
    if (merged.has(s.id)) continue;
    const row = mk(s.id, 'single', [s]);
    if (isRepresentationPart(s)) row.repPart = true;
    rows.push(row);
  }

  const rowOfStep = new Map<string, ClientFacingRow>();
  for (const row of rows) for (const m of row.members) rowOfStep.set(m.id, row);

  // ── «אישור אישי» של בן/בת הזוג יורד לבקשה שממנה נולד ─────────────────────
  // ‼ אותה ריצה ואותו פריט (215: שורה שנייה לאותו פריט). עדיפות לחלק שבדף בשם
  // בן/בת הזוג (subjectRole 'spouse'), אחרת לבקשה של בעל הכרטיס.
  const absorbed = new Set<ClientFacingRow>();
  for (const task of pool) {
    if (!isSpouseConfirmTask(task) || !task.flowRunId) continue;
    const itemKey = task.flowItemKey ?? (typeof task.payload?.personalConfirmFor === 'string' ? task.payload.personalConfirmFor : null);
    if (!itemKey) continue;
    const candidates = pool.filter(o => o.id !== task.id && o.flowRunId === task.flowRunId
      && o.flowItemKey === itemKey && !isSpouseConfirmTask(o) && !isCreationProblem(o));
    const owner = candidates.find(o => o.payload?.subjectRole === 'spouse') ?? candidates[0];
    const ownerRow = owner ? rowOfStep.get(owner.id) : undefined;
    const taskRow = rowOfStep.get(task.id);
    if (!ownerRow || !taskRow || ownerRow === taskRow || absorbed.has(ownerRow)) continue;
    ownerRow.members.push(task);
    rowOfStep.set(task.id, ownerRow);
    absorbed.add(taskRow);
  }
  const live = rows.filter(r => !absorbed.has(r));

  // ── קינון לפי תלות ────────────────────────────────────────────────────────
  // ‼ רק רמה אחת. שרשרת תלויות ארוכה מקוננת לעומק הייתה בונה עץ שאי אפשר
  // לסרוק, וזה בדיוק מה שהאב-טיפוס נמנע ממנו: כרטיס, ומתחתיו צעד ההמשך שלו.
  const parentsOf = (s: OnboardingStep): string[] => {
    const multi = depParents?.get(s.id);
    if (multi && multi.length > 0) return multi;
    return s.dependsOnStepId ? [s.dependsOnStepId] : [];
  };

  const nested = new Set<string>();
  for (const row of live) {
    // שרשרת-מושג אינה יורדת לתוך אחרת: היא כבר מייצגת מושג שלם בפני עצמו.
    if (row.kind !== 'single') continue;
    // ‼ «לא נוצרה» היא בעיה של המשרד — שורה אדומה משלה, לא צעד המשך של אחרת.
    if (isCreationProblem(row.primary)) continue;
    const parentRows = new Set(
      parentsOf(row.primary).map(pid => rowOfStep.get(pid)).filter((r): r is ClientFacingRow => !!r && r !== row));
    // בדיוק הורה אחד — ואינו כרטיס שכבר קונן בעצמו (רמה אחת בלבד).
    if (parentRows.size !== 1) continue;
    const parent = [...parentRows][0];
    if (nested.has(parent.key)) continue;
    parent.children.push(row);
    nested.add(row.key);
  }

  for (const row of live) row.children.sort(bySort);
  return live.filter(r => !nested.has(r.key)).sort(bySort);
}

/** כל החלקים של שורה — החברים בסדרם, ואחריהם כרטיסי-ההמשך. */
export function rowParts(row: ClientFacingRow): OnboardingStep[] {
  return [...row.members, ...row.children.flatMap(rowParts)];
}

// ─── מצב השורה כולה ─────────────────────────────────────────────────────────

export interface RowSummary {
  /** המקטע והצבע של השורה כולה: דורש אותך אם חלק כלשהו דורש; אדום אם חלק כלשהו אדום. */
  attn: Attention;
  /**
   * החלק שקובע את המצב והפעולה בשורה הסגורה: הראשון האדום שדורש אותך, אחרת הראשון
   * שדורש אותך (בסדר החלקים). null ⇒ אין מה לעשות עכשיו.
   */
  lead: OnboardingStep | null;
  /** עוד כמה חלקים דורשים אותך, מעבר ל-lead. */
  moreMine: number;
  /** אצל מי ממתינים (בסדר החלקים, בלי כפילות) — כשאין מה לעשות. */
  waitingOn: WaitingOn[];
  /** כל החלקים הפתוחים נעולים. */
  allLocked: boolean;
  /** החלקים הפתוחים. */
  openParts: OnboardingStep[];
}

/**
 * מצב השורה כולה מתוך מצב כל חלק.
 * ‼ שורה של חלק אחד מחזירה בדיוק את המצב שלו — שום דבר לא משתנה בשורות רגילות.
 */
export function summarizeRow(row: ClientFacingRow, attnOf: (s: OnboardingStep) => Attention): RowSummary {
  const openParts = rowParts(row).filter(s => isStepOpen(s.status));
  const atts = openParts.map(s => ({ s, a: attnOf(s) }));
  const mine = atts.filter(x => x.a.kind === 'mine');
  const red = mine.filter(x => x.a.tone === 'red');
  const lead = red[0]?.s ?? mine[0]?.s ?? null;
  const waitingAtts = atts.filter(x => x.a.kind !== 'mine' && x.a.kind !== 'done'
    && x.a.waitingOn !== 'locked' && x.s.status !== 'locked');
  const waitingOn: WaitingOn[] = [];
  for (const x of waitingAtts) {
    const w: WaitingOn = x.a.waitingOn ?? 'client';
    if (!waitingOn.includes(w)) waitingOn.push(w);
  }
  const allLocked = atts.length > 0 && mine.length === 0 && waitingAtts.length === 0;
  let attn: Attention;
  if (atts.length === 1) attn = atts[0].a;
  else if (mine.length > 0) attn = { kind: 'mine', tone: red.length > 0 ? 'red' : 'blue' };
  else if (waitingAtts.length > 0) attn = { kind: 'waiting', tone: 'gray', waitingOn: waitingAtts[0].a.waitingOn };
  else if (allLocked) attn = { kind: 'waiting', tone: 'gray', waitingOn: 'locked' };
  else attn = { kind: 'done', tone: 'gray' };
  return { attn, lead, moreMine: Math.max(0, mine.length - 1), waitingOn, allLocked, openParts };
}

/**
 * האם השורה הסגורה צריכה את מצב הקבוצה במקום מצב החלק הראשי: יותר מחלק פתוח
 * אחד, או שהראשי עצמו כבר נסגר (מכתב שנחתם בזמן שהחומרים עוד נאספים).
 */
export const rowNeedsGroupState = (row: ClientFacingRow, sum: RowSummary): boolean =>
  sum.openParts.length > 1 || (sum.openParts.length > 0 && !isStepOpen(row.primary.status));

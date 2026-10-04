// ─── השער של הדף האישי — התאום של client_step_gate_open (214) ─────────────────
// בקשה שפורסמה גלויה ללקוח (בדף האישי, במייל ובתזכורות) רק כשהשער פתוח לה:
//   · אין קליטה פתוחה ⇒ כמו קודם: התקשרות כלשהי של הלקוח נפתחה ללקוח
//     (process_published_at), או שאין לו התקשרות בכלל;
//   · יש קליטה פתוחה (open_intake_engagement_id: 'onboarding', האחרונה שנוצרה) ⇒
//     הקליטה נפתחה ללקוח, או שהבקשה פורסמה **לפני** שהקליטה נוצרה.
// ‼ הכרעות גיא (03.10):
//   (א) כרטיס «אישור הייצוג באזור האישי» של קליטה חדשה שטרם פורסמה — לא בדף ולא בתזכורת.
//   (ב) לקוח שחוזר — מה שפורסם בהתקשרות הקודמת ועדיין פתוח נשאר בדף (payload.carriedFrom);
//       הקליטה החדשה — טיוטה עד שהמשרד מפרסם אותה («פרסם בדף»).
// ‼ השרת הוא מקור האמת; כאן התאום שחייב לענות אותו דבר. שינוי כאן — גם שם:
//   supabase/214-client-notices.sql (client_step_gate_open), 217 (client_process_published),
//   216 (build_client_portal: «ייצוג מול הרשויות» מוצג תמיד, בלי קשר לשער).

import type { Engagement, OnboardingStep } from '../types/onboarding';
import { portalShowsStep } from '../types/onboarding';
import { neverOnClientPage } from './clientFacingRows';
import { formatDate } from './dateFormat';

/** מה שהשער צריך מהתקשרות — engagementFromDb נותן את כל אלה. */
export type GateEngagement = Pick<Engagement, 'status' | 'processPublishedAt' | 'createdAt'> & {
  id?: string;
  clientId?: string;
};

/** מה שהשער צריך משלב. */
export type GateStep = Pick<OnboardingStep, 'stepType' | 'publishedAt'> & {
  clientId?: string;
  payload?: unknown;
};

/**
 * רגע בזמן במיקרו-שניות (כמו timestamptz). ‼ לא Date.parse לבד: הוא חותך למילישנייה,
 * ו«קטן ממש» בין שתי חותמות של אותה מילישנייה היה מתהפך. null ⇒ לא תאריך.
 */
function micros(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(.*?T\d{2}:\d{2}(?::\d{2})?)(?:[.,](\d+))?(.*)$/.exec(iso);
  const base = Date.parse(m ? m[1] + m[3] : iso);
  if (Number.isNaN(base)) return null;
  return base * 1000 + Number((m?.[2] ?? '').padEnd(6, '0').slice(0, 6));
}

/** a < b — «קטן ממש», כמו `published_at < created_at` במסד. חסר ⇒ false (coalesce(…, false)). */
export function isBefore(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = micros(a), y = micros(b);
  return x !== null && y !== null && x < y;
}

/** ההתקשרויות של הלקוח — המסך מחזיק את כל ההתקשרויות של המשרד. */
export function engagementsOf<E extends GateEngagement>(engagements: readonly E[], clientId: string | undefined): E[] {
  return clientId ? engagements.filter(e => e.clientId === undefined || e.clientId === clientId) : [...engagements];
}

/**
 * הקליטה הפתוחה — open_intake_engagement_id: 'onboarding', האחרונה לפי created_at.
 * ‼ `order by created_at desc` ב-Postgres מציב ריק ראשון — וכך גם כאן.
 */
export function openIntake<E extends GateEngagement>(engagements: readonly E[]): E | null {
  const rank = (e: E) => micros(e.createdAt) ?? Number.POSITIVE_INFINITY;
  let best: E | null = null;
  for (const e of engagements) {
    if (e.status === 'onboarding' && (!best || rank(e) > rank(best))) best = e;
  }
  return best;
}

/**
 * client_step_gate_open(לקוח, published_at) — `engagements` של הלקוח בלבד (engagementsOf).
 * publishedAt ריק ⇒ השער ברמת הלקוח (clientProcessPublished).
 */
export function stepGateOpen(publishedAt: string | null | undefined, engagements: readonly GateEngagement[]): boolean {
  const intake = openIntake(engagements);
  if (intake) return !!intake.processPublishedAt || isBefore(publishedAt, intake.createdAt);
  return engagements.length === 0 || engagements.some(e => !!e.processPublishedAt);
}

/** client_process_published — «התהליך נפתח ללקוח»: השער לבקשה שאין לה זמן פרסום. */
export const clientProcessPublished = (engagements: readonly GateEngagement[]): boolean =>
  stepGateOpen(null, engagements);

/**
 * פורסמה (לא טיוטה): published_at מלא — או חסר (נתון ישן בלי העמודה, stepFromDb),
 * ובלי הסימון הישן payload.published=false. אותה הגדרה כמו isDraftStep במסך הבקשות.
 */
export function isPublishedStep(step: GateStep): boolean {
  if (step.publishedAt === null) return false;
  const p = (step.payload && typeof step.payload === 'object' ? step.payload : {}) as { published?: unknown };
  return String(p.published ?? 'true') !== 'false';
}

/**
 * בדף האישי עכשיו — מה ש-build_client_portal מציג: פורסמה, אינה משימה של המשרד
 * (neverOnClientPage), והשער פתוח לה. ‼ «ייצוג מול הרשויות» מוצג תמיד — כמו בשרת.
 * ‼ הסוגים שהדף בכלל מכיר (portalShowsStep) — לא כאן: «בדף מ-…» נשען על מצב השלב.
 */
export function visibleOnClientPage(step: GateStep, engagements: readonly GateEngagement[]): boolean {
  if (!isPublishedStep(step) || neverOnClientPage(step)) return false;
  if (step.stepType === 'representation') return true;
  return stepGateOpen(step.publishedAt, engagementsOf(engagements, step.clientId));
}

/**
 * מאז מתי הבקשה בדף — ל«בדף מ-…». null ⇒ לא בדף.
 * ‼ לא תמיד זמן הפרסום שלה: בקשה שנולדה בקליטה ופורסמה לפני שהקליטה נפתחה ללקוח נכנסה
 * לדף רק כשהקליטה נפתחה (process_published_at). מה שפורסם לפני הקליטה — מזמן הפרסום שלו.
 */
export function onClientPageFrom(step: GateStep, engagements: readonly GateEngagement[]): string | null {
  if (!visibleOnClientPage(step, engagements)) return null;
  const pub = step.publishedAt ?? null;
  if (!pub || step.stepType === 'representation') return pub;
  const engs = engagementsOf(engagements, step.clientId);
  const intake = openIntake(engs);
  let opened: string | null | undefined;
  if (intake) {
    if (isBefore(pub, intake.createdAt)) return pub;
    opened = intake.processPublishedAt;
  } else {
    // השער נפתח עם ההתקשרות הראשונה שנפתחה ללקוח.
    opened = engs.map(e => e.processPublishedAt).filter((x): x is string => !!x)
      .reduce<string | null>((min, x) => (min === null || isBefore(x, min) ? x : min), null);
  }
  return opened && isBefore(pub, opened) ? opened : pub;
}

/**
 * «ממתין לפרסום»: פורסמה ושייכת לדף — אבל השער סוגר אותה (קליטה חדשה שטרם פורסמה).
 * תופיע בדף כשהמשרד מפרסם («פרסם בדף» ⇒ publish_case_changes פותחת את הקליטה).
 * ‼ בקשה שעברה מההתקשרות הקודמת (פורסמה לפני הקליטה) — בדף, ולכן לא כאן.
 */
export function awaitsPublication(step: GateStep, engagements: readonly GateEngagement[]): boolean {
  return isPublishedStep(step) && !neverOnClientPage(step) && portalShowsStep(step.stepType)
    && !visibleOnClientPage(step, engagements);
}

/** payload.carriedFrom (217) — בקשה פתוחה שעברה מהתקשרות שהסתיימה לקליטה החדשה. */
export interface CarriedFrom {
  engagementId?: string;
  /** מתי ההתקשרות הקודמת הסתיימה. */
  endedAt?: string;
}

export function carriedFrom(step: { payload?: unknown }): CarriedFrom | null {
  const p = (step.payload && typeof step.payload === 'object' ? step.payload : {}) as { carriedFrom?: unknown };
  const c = p.carriedFrom;
  return c && typeof c === 'object' && !Array.isArray(c) ? (c as CarriedFrom) : null;
}

/** «מההתקשרות הקודמת · עד 12.05.26» — שורת ההקשר השקטה של בקשה שעברה. */
export function carriedFromLine(step: { payload?: unknown }): string | null {
  const c = carriedFrom(step);
  if (!c) return null;
  const end = formatDate(c.endedAt, 'list');
  return end ? `מההתקשרות הקודמת · עד ${end}` : 'מההתקשרות הקודמת';
}

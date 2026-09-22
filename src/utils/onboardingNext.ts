// ─── "מה הפעולה הבאה" — מקור אמת אחד ─────────────────────────────────────────
// ‼ הלוגיקה הזו נולדה בשורת הכדור של לשונית הקליטה, ועכשיו היא משרתת שלושה
// מסכים: הכרטיס, השולחן, ומסך הלקוחות. היא יושבת כאן בדיוק מהסיבה הזו —
// שולחן שמחשב דחיפות אחרת מהכרטיס הוא שולחן שמשקר.

import type { OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { isStepOpen } from '../types/onboarding';
import { countRequestsNeedingMe, isOnRequestsSurface, isManualInternal, stepNeedsMe } from './requestAttention';

/** מה הפעולה הבאה כשהכדור אצלי — ניסוח של עשייה, לא של סטטוס. */
export const NEXT_ACTION: Record<OnboardingStepType, string> = {
  representation: 'להמשיך את תהליך הייצוג',
  representation_upgrade: 'לשדרג את הייצוג למייצג ראשי',
  rep_client_approval: 'לבדוק בשע״ם אם האישור של הלקוח נקלט',
  file_opening: 'לפתוח את התיקים ברשויות',
  release_letter: 'לשלוח לרו״ח הקודם את מכתב העברת הטיפול',
  materials_received: 'לאסוף את החומרים מהרו״ח הקודם',
  paperless_invite: 'ממתינים שהלקוח יירשם לפייפרלס',
  paperless_connection: 'להיכנס לחשבון הפייפרלס ולהשלים את החיבור',
  paperless_tax_authority: 'ממתינים שהלקוח יחבר את פייפרלס לרשות המסים',
  data_import: 'לייבא את ההיסטוריה לפייפרלס',
  data_verification: 'לאמת את הנתונים בפייפרלס',
  retainer_authorization: 'להקים את הרשאת התשלום החודשי',
  internal_setup: 'להשלים את ההקמה הפנימית',
  kyc_identification: 'להשלים את הכרת הלקוח',
  first_month_review: 'לבצע את ביקורת החודש הראשון',
  intake_questionnaire: 'לשלוח ללקוח עדכון סטטוס מס',
  client_documents: 'לאסוף את המסמכים מהלקוח',
  prev_accountant_details: 'לקבל מהלקוח את פרטי הרו״ח הקודם',
  custom_request: 'לטפל בבקשה שהגדרת',
  institution_alignment_btl: 'לבצע יישור קו מול ביטוח לאומי',
  institution_alignment_vat: 'לבצע יישור קו מול מע״מ',
  institution_alignment_income: 'לבצע יישור קו מול מס הכנסה',
  opening_call: 'לקיים שיחת פתיחה עם הלקוח',
  // ‼ תמיד נדרס בפועל בזרימה — הפעולה תלוית-מצב ונגזרת מ-execution (ראה
  // TaxFileTab/NiInstructionsDialog), לא ניסוח קבוע אחד לכל השלב.
  authority_representation: 'להמשיך את הייצוג ברשות',
};

/** תאריך יעד רק אם הוא בטווח שבועיים — אחרת הוא אינו שיקול דחיפות. */
const SOON_DAYS = 14;

export function soonDue(due?: string | null): string | null {
  if (!due) return null;
  const days = (new Date(due).getTime() - Date.now()) / 86400000;
  return days <= SOON_DAYS ? due : null;
}

/** דירוג דחיפות. נמוך = דחוף יותר. */
export function urgency(step: OnboardingStep): number {
  if (step.status === 'blocked' || step.status === 'failed') return 0;
  if (step.needsAttention) return 1;
  if (step.status === 'locked') return 5;
  if (step.ball === 'me') return 2;
  if (step.ball === 'client') return 3;
  return 4;
}

/**
 * השלב שהוא "הדבר הבא" של הלקוח.
 * ‼ שלב נעול נבחר רק כשאין שום שלב פתיח — אין מה לעשות איתו, והכרזה עליו
 * כפעולה הבאה שולחת את הרו"ח לכרטיס בלי כפתור. כשזה קורה, המסר הנכון הוא
 * "הכול ממתין למשהו אחר".
 */
export function nextStepForClient(steps: OnboardingStep[]): OnboardingStep | null {
  const open = steps.filter(s => isStepOpen(s.status));
  if (open.length === 0) return null;
  const actionable = open.filter(s => s.status !== 'locked');
  /* ‼ v3: מה שמוצג במסך הבקשות ודורש לחיצה קודם לכל שלב מוסתר — אחרת "עכשיו:
     לבצע את ביקורת החודש הראשון" הצביע על שלב שהמסך בכוונה לא מראה. */
  const rank = (s: OnboardingStep) => (isOnRequestsSurface(s) && !isManualInternal(s) && stepNeedsMe(s) ? 0 : 1);
  return (actionable.length > 0 ? actionable : open).slice().sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const u = urgency(a) - urgency(b);
    if (u !== 0) return u;
    // ‼ יעד רחוק אינו דוחק. שלב בלי תאריך הוא העבודה של עכשיו, ואילו "ביקורת
    // חודש ראשון" בעוד חודש לא אמורה לדחוק את מכתב השחרור להיום.
    const ad = soonDue(a.dueDate) ?? '';
    const bd = soonDue(b.dueDate) ?? '';
    if (ad !== bd) return ad === '' ? 1 : bd === '' ? -1 : ad.localeCompare(bd);
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  })[0];
}

/** שלב תקוע = בעיה אמיתית: חסום או נכשל. ‼ v3: needs_attention לבדו אינו
 *  "תקוע" — השרת מרים אותו גם כש"הלקוח סיים, לבדיקה", וזו פעולה (כחול),
 *  לא תקלה (אדום). */
export function isStuckStep(s: OnboardingStep): boolean {
  return isStepOpen(s.status) && (s.status === 'blocked' || s.status === 'failed');
}

/** לאיזה מקטע בשולחן שייך הלקוח. תקוע גובר על הכול. */
export type DeskBucket = 'stuck' | 'mine' | 'others';

export interface ClientOnboardingSummary {
  clientId: string;
  /** כל השלבים של הלקוח, בלי מבוטלים. */
  steps: OnboardingStep[];
  openSteps: OnboardingStep[];
  /** הפעולה הבאה, או null כשהכול סגור. */
  next: OnboardingStep | null;
  /** השלב התקוע הראשון — מה שמצדיק את הצבע האדום. */
  stuck: OnboardingStep | null;
  done: number;
  total: number;
  bucket: DeskBucket;
}

/**
 * קיבוץ שלבים לפי לקוח + סיווג לשלושת מקטעי השולחן.
 * ‼ שורה אחת ללקוח ולא שורה לשלב: לקוח עם שבעה שלבים פתוחים דורש ממני
 * פעולה אחת, לא שבע. השאר הוא רעש שמסתיר את מה שבאמת צריך לקרות.
 */
export function summarizeClientOnboarding(steps: OnboardingStep[]): ClientOnboardingSummary[] {
  const byClient = new Map<string, OnboardingStep[]>();
  for (const s of steps) {
    if (s.status === 'cancelled') continue;
    const list = byClient.get(s.clientId);
    if (list) list.push(s);
    else byClient.set(s.clientId, [s]);
  }

  const out: ClientOnboardingSummary[] = [];
  byClient.forEach((clientSteps, clientId) => {
    const openSteps = clientSteps.filter(s => isStepOpen(s.status));
    if (openSteps.length === 0) return;   // קליטה שהסתיימה אינה על השולחן

    const next = nextStepForClient(clientSteps);
    const stuck = openSteps.filter(isStuckStep).sort((a, b) => urgency(a) - urgency(b))[0] ?? null;
    /* ‼ v3: "לטיפולי" במסך המשימות = אותה הגדרה כמו התג ומקטע «לטיפולי» של
       הלקוח (requestAttention). ball='me' לבדו ספר גם המתנה לפייפרלס ועבודה
       פנימית מוסתרת — ולקוח היה "אצלי" בלי שום כפתור ללחוץ. */
    const bucket: DeskBucket = stuck ? 'stuck' : countRequestsNeedingMe(clientSteps) > 0 ? 'mine' : 'others';

    out.push({
      clientId,
      steps: clientSteps,
      openSteps,
      next,
      stuck,
      done: clientSteps.length - openSteps.length,
      total: clientSteps.length,
      bucket,
    });
  });
  return out;
}

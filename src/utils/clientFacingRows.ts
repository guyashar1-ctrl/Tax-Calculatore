// ─── קיבוץ שורות "מה אני צריך מהלקוח" — מיזוג שרשראות ────────────────────────
// ‼ שרשרת = מושג אחד בעיני הלקוח, אבל כמה שלבים בשרת (מסך "תהליך" המאוחד,
// לפי הפרוטוטייפ המאושר): פייפרלס = הזמנה+חיבור, רו"ח קודם = פרטים+מכתב
// שחרור+קבלת חומרים. שתי השרשראות האלה כבר היו ממוזגות ב-OnboardingProcessBuilder
// (במצב בנייה, סטטי) — כאן אותו עיקרון, בשביל המסך המאוחד שמחליף אותו.
//
// הפונקציה כאן קובעת רק אילו שלבים שייכים לאיזו שורה ומי מהם "פעיל" (קובע
// כותרת/סטטוס/פעולה של השורה המכווצת) — הרינדור עצמו נשאר ב-OnboardingTab,
// ששם יושבים כל הכרטיסים הייעודיים (PaperlessStepCard, ReleaseStepCard...).
// שרשרת שנפתחת מציגה את כל חבריה דרך אותם כרטיסים בדיוק, בלי לשכפל לוגיקה.

import type { OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { isStepOpen } from '../types/onboarding';

export type ClientRowKind = 'paperless' | 'prevAccountant' | 'single';

export interface ClientFacingRow {
  key: string;
  kind: ClientRowKind;
  /** כל השלבים בשרשרת, בסדר הפנימי שלהם — תמיד יש לפחות אחד. */
  members: OnboardingStep[];
  /** השלב שקובע כותרת/סטטוס/פעולה של השורה המכווצת — הראשון הפתוח, אחרת הראשון. */
  primary: OnboardingStep;
}

/**
 * בקשות לקוח שמוצגות ב"מה אני צריך מהלקוח". שלב הייצוג אינו כאן — הוא נגזר
 * מ-representation_requests ולא נושא step_type קבוע לכל מקרה (ראה OnboardingTab,
 * שמוסיף אותו כשורה ראשונה בנפרד). כל מה שלא ברשימה הזאת (kyc, הקמה פנימית,
 * ביקורת חודש ראשון, שדרוג ייצוג, שיחת פתיחה, יישור קו למוסדות, פתיחת תיקים)
 * שייך ל"העבודה שלי".
 */
export const CLIENT_FACING_TYPES: OnboardingStepType[] = [
  'client_documents', 'prev_accountant_details', 'paperless_invite', 'paperless_connection',
  'retainer_authorization', 'intake_questionnaire', 'custom_request',
  'release_letter', 'materials_received',
];

/** החבר הפעיל של שרשרת: הראשון הפתוח בסדר הפנימי, אחרת הראשון (הכול נסגר). */
function pickPrimary(members: OnboardingStep[]): OnboardingStep {
  return members.find(s => isStepOpen(s.status)) ?? members[0];
}

/**
 * מקבצת את שלבי הלקוח לשורות "מה אני צריך מהלקוח", בסדר התצוגה (sort_order
 * של החבר הפעיל של כל שורה). custom_request/intake_questionnaire יכולים
 * להופיע כמה פעמים — כל אחד שורה משלו, לא ממוזג.
 */
export function buildClientFacingRows(steps: OnboardingStep[]): ClientFacingRow[] {
  const pool = steps.filter(s => CLIENT_FACING_TYPES.includes(s.stepType));
  const byType = new Map<OnboardingStepType, OnboardingStep>();
  for (const s of pool) if (!byType.has(s.stepType)) byType.set(s.stepType, s);

  const merged = new Set<string>();
  const rows: ClientFacingRow[] = [];

  const invite = byType.get('paperless_invite');
  const connection = byType.get('paperless_connection');
  if (invite || connection) {
    const members = [invite, connection].filter((s): s is OnboardingStep => !!s);
    members.forEach(s => merged.add(s.id));
    rows.push({ key: 'paperless', kind: 'paperless', members, primary: pickPrimary(members) });
  }

  const prevDetails = byType.get('prev_accountant_details');
  const release = byType.get('release_letter');
  const materials = byType.get('materials_received');
  if (prevDetails || release || materials) {
    const members = [prevDetails, release, materials].filter((s): s is OnboardingStep => !!s);
    members.forEach(s => merged.add(s.id));
    rows.push({ key: 'prevAccountant', kind: 'prevAccountant', members, primary: pickPrimary(members) });
  }

  for (const s of pool) {
    if (merged.has(s.id)) continue;
    rows.push({ key: s.id, kind: 'single', members: [s], primary: s });
  }

  return rows.sort((a, b) =>
    (a.primary.sortOrder ?? 0) - (b.primary.sortOrder ?? 0)
    || (a.primary.createdAt ?? '').localeCompare(b.primary.createdAt ?? ''));
}

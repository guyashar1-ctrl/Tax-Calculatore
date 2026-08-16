// ─── קיבוץ שורות "מה אני צריך מהלקוח" — כרטיס אחד למושג ─────────────────────
// ‼ שני כללי קיבוץ, בסדר הזה (אב-הטיפוס המאושר requests-v2-approved.html):
//
// 1. שרשרת-מושג = כרטיס אחד. "פתיחת חשבון פייפרלס" היא הזמנה+חיבור, ו"מעבר
//    מרו״ח קודם" היא פרטים+מכתב שחרור+קבלת חומרים. בעיני הרו"ח זה דבר אחד.
//
// 2. בקשה שתלויה בכרטיס אחר יורדת לתוכו ככרטיס-בן (childOf באב-הטיפוס):
//    "הרשאה לחיוב חודשי" תלויה בחיבור הפייפרלס, ולכן היא נקראת כצעד ההמשך
//    שלו — לא כשורה נפרדת ברשימה. זה הכלל שהופך רשימה שטוחה לתהליך.
//
// הפונקציה קובעת רק **מי בתוך מי**; הרינדור עצמו נשאר ב-OnboardingTab, ששם
// יושבים הכרטיסים הייעודיים (PaperlessStepCard, ReleaseStepCard…).

import type { OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { isStepOpen } from '../types/onboarding';

export type ClientRowKind = 'paperless' | 'prevAccountant' | 'single';

export interface ClientFacingRow {
  key: string;
  kind: ClientRowKind;
  /** כל השלבים בשרשרת-המושג, בסדר הפנימי שלהם — תמיד יש לפחות אחד. */
  members: OnboardingStep[];
  /** השלב שקובע כותרת/סטטוס/פעולה של הכרטיס — הראשון הפתוח, אחרת הראשון. */
  primary: OnboardingStep;
  /** כרטיסי-המשך שתלויים בכרטיס הזה ומוצגים בתוכו. */
  children: ClientFacingRow[];
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

/** משימה פנימית שהרו"ח הוסיף בעצמו — בקשה חופשית שהכדור בה אצלו. */
export const isManualInternalTask = (s: OnboardingStep): boolean =>
  s.stepType === 'custom_request' && s.ball === 'me';

/** החבר הפעיל של שרשרת: הראשון הפתוח בסדר הפנימי, אחרת הראשון (הכול נסגר). */
function pickPrimary(members: OnboardingStep[]): OnboardingStep {
  return members.find(s => isStepOpen(s.status)) ?? members[0];
}

const bySort = (a: ClientFacingRow, b: ClientFacingRow) =>
  (a.primary.sortOrder ?? 0) - (b.primary.sortOrder ?? 0)
  || (a.primary.createdAt ?? '').localeCompare(b.primary.createdAt ?? '');

/**
 * מקבצת את שלבי הלקוח לכרטיסים, בסדר התצוגה.
 *
 * @param depParents כל ההורים של כל שלב (מיגרציה 78). בלעדיו נופלים לעמודת
 *   ההורה היחיד — מה שמספיק לפייפרלס→הרשאה, שהוא המקרה שהאב-טיפוס מדגים.
 */
export function buildClientFacingRows(
  steps: OnboardingStep[],
  depParents?: Map<string, string[]>,
): ClientFacingRow[] {
  const pool = steps.filter(s => CLIENT_FACING_TYPES.includes(s.stepType));
  const byType = new Map<OnboardingStepType, OnboardingStep>();
  for (const s of pool) if (!byType.has(s.stepType)) byType.set(s.stepType, s);

  const merged = new Set<string>();
  const rows: ClientFacingRow[] = [];
  const mk = (key: string, kind: ClientRowKind, members: OnboardingStep[]): ClientFacingRow =>
    ({ key, kind, members, primary: pickPrimary(members), children: [] });

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
    rows.push(mk('prevAccountant', 'prevAccountant', members));
  }

  for (const s of pool) {
    if (merged.has(s.id)) continue;
    rows.push(mk(s.id, 'single', [s]));
  }

  // ── קינון לפי תלות ────────────────────────────────────────────────────────
  // ‼ רק רמה אחת. שרשרת תלויות ארוכה מקוננת לעומק הייתה בונה עץ שאי אפשר
  // לסרוק, וזה בדיוק מה שהאב-טיפוס נמנע ממנו: כרטיס, ומתחתיו צעד ההמשך שלו.
  const rowOfStep = new Map<string, ClientFacingRow>();
  for (const row of rows) for (const m of row.members) rowOfStep.set(m.id, row);

  const parentsOf = (s: OnboardingStep): string[] => {
    const multi = depParents?.get(s.id);
    if (multi && multi.length > 0) return multi;
    return s.dependsOnStepId ? [s.dependsOnStepId] : [];
  };

  const nested = new Set<string>();
  for (const row of rows) {
    // שרשרת-מושג אינה יורדת לתוך אחרת: היא כבר מייצגת מושג שלם בפני עצמו.
    if (row.kind !== 'single') continue;
    const parentRows = new Set(
      parentsOf(row.primary).map(pid => rowOfStep.get(pid)).filter((r): r is ClientFacingRow => !!r && r !== row));
    // בדיוק הורה אחד — ואינו כרטיס שכבר קונן בעצמו (רמה אחת בלבד).
    if (parentRows.size !== 1) continue;
    const parent = [...parentRows][0];
    if (nested.has(parent.key)) continue;
    parent.children.push(row);
    nested.add(row.key);
  }

  for (const row of rows) row.children.sort(bySort);
  return rows.filter(r => !nested.has(r.key)).sort(bySort);
}

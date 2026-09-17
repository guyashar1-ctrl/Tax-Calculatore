// ─── הגדרת תהליך — «ממה התהליך מורכב» ─────────────────────────────────────────
// המילון המשותף לכל תיאורי התהליכים שמסך «ניהול המשרד → תהליכים» מציג (M2).
//
// ‼ זה **תיאור**, לא מנוע: שום דבר כאן אינו יוצר שלב, אינו מעביר סטטוס ואינו
//   מעריך תנאי. מעברי המצב, התלויות והתנאים ממשיכים לחיות בשרת (המחולל,
//   הטריגרים, advance_onboarding_step) — והתיאור חייב לשקף אותם. מה שכן מקשר:
//   `stepType` על שלב שהוא בקשה אמיתית ו-`statuses` על שלב ייצוג — ובדיקת
//   הקבועים (scripts/test-process-catalog.ts, scripts/staging-test-process-
//   catalog.ts) נופלת כשהתיאור מצביע על סוג שלא קיים, או כשהמחולל/הטריגר
//   בפרודקשן זזו בלי שהתיאור זז איתם.
//
// ‼ טהור בכוונה: בלי React, בלי supabase, בלי ייבוא מ-utils שגורר את הדוח
//   השנתי — כדי ש-node יריץ עליו את הבדיקות בלי בנייה.

import type { OnboardingStepType } from '../types/onboarding';
import type { RepresentationStatus } from '../types';

/** מי פועל בשלב — אוצר מילים אחד לכל התהליכים. */
export type ProcessActor = 'client' | 'office' | 'system' | 'external';

export const ACTOR_LABELS: Record<ProcessActor, string> = {
  client: 'הלקוח',
  office: 'המשרד',
  system: 'המערכת',
  external: 'רשות / גורם חיצוני',
};

/**
 * מה טיבו של השלב מבחינת המשרד:
 *   fixed        — חלק קבוע מהתהליך; אין מה להגדיר.
 *   conditional  — נוצר רק כשתנאי עסקי מתקיים (`when` מסביר איזה).
 *   optional     — קיים תמיד אך אינו חוסם השלמה.
 *   configurable — המשרד יכול לכבות/לערוך אותו (איפה — `configureIn`).
 */
export type StageKind = 'fixed' | 'conditional' | 'optional' | 'configurable';

export interface ProcessStage {
  key: string;
  title: string;
  actor: ProcessActor;
  /** משפט אחד-שניים: מה קורה בשלב. */
  what: string;
  kind?: StageKind;
  /** לשלב מותנה/רשות: מתי הוא מופיע — «מופיע כש…», «רק עבור…». */
  when?: string;
  /** מה נדרש כדי לעבור את השלב (מידע, מסמכים, פעולות). */
  requires?: string[];
  /** מה יכול לתקוע. */
  blocks?: string;
  /** מה מותר לדחות בלי לאבד את מה שכבר נעשה. */
  deferrable?: string;
  /** מה פירוש «הושלם» לשלב הזה. */
  done?: string;
  /** השלב רץ במקביל לקודמו (ולא אחריו). */
  parallel?: boolean;
  /** קישור לסוג הבקשה האמיתי ב-onboarding_steps — נבדק בבדיקת הקבועים. */
  stepType?: OnboardingStepType;
  /** לשלבי הייצוג: אילו סטטוסים של הבקשה נמצאים בשלב הזה (כל סטטוס פעם אחת). */
  statuses?: RepresentationStatus[];
  /** תתי-שלבים שמוצגים בפתיחה בלבד. */
  substages?: ProcessStage[];
  /** איפה במשרד מגדירים את השלב הזה (מזהה מקטע ב«ניהול המשרד»). */
  configureIn?: OfficeSectionId;
}

export type OfficeSectionId =
  | 'representation' | 'requestDefaults' | 'paperless' | 'quotations' | 'clientDocs';

export type ProcessClassification =
  /** תהליך רב-שלבי אמיתי — יש לו סדר, שלבים ותנאים. */
  | 'multi_stage'
  /** בקשה בודדת: מה מבקשים, מי פועל, מה זה «הושלם». בלי ציר זמן מומצא. */
  | 'single_step'
  /** חלק מתהליך-אב; מוצג תחתיו, ורשום כאן כדי שיהיה לו שם ומקום. */
  | 'sub_process'
  /** עבודה פנימית של המשרד — מוצגת בקצרה, בלי שלבי לקוח. */
  | 'internal';

export type ProcessGroup = 'journey' | 'requests' | 'internal';

export const PROCESS_GROUP_LABELS: Record<ProcessGroup, string> = {
  journey: 'קליטה ומסלולים',
  requests: 'בקשות מהלקוח',
  internal: 'עבודה פנימית',
};

export interface ProcessDefinition {
  key: string;
  name: string;
  group: ProcessGroup;
  classification: ProcessClassification;
  /** משפט אחד: מה התהליך משיג. */
  purpose: string;
  /** מה מתחיל אותו. */
  trigger: string;
  /** מה פירוש «הסתיים». */
  completion: string;
  /** איפה האמת חיה (לקורא במשרד — בלי מונחי מסד). */
  source: string;
  stages: ProcessStage[];
  /** לתת-תהליך: מפתח תהליך-האב. */
  parentKey?: string;
  /** מה המשרד יכול להגדיר, ואיפה. */
  configurable?: { text: string; section: OfficeSectionId };
  /** תהליך מותנה: מתי הוא בכלל נוצר. */
  when?: string;
}

/** מספור שלבים לתצוגה: מקביל אינו מקבל מספר משלו. */
export function numberStages<S extends ProcessStage>(stages: S[]): { stage: S; n: number | null }[] {
  let n = 0;
  return stages.map(stage => {
    if (stage.parallel) return { stage, n: null };
    n += 1;
    return { stage, n };
  });
}

// ─── «חומרים מרו״ח קודם» — בקשה אחת שמורכבת משלושה שלבים ────────────────────
// בעיני הרו"ח זו בקשה אחת ברשימה: מוסיפים בלחיצה, מסירים בלחיצה. שלושת
// השלבים שמאחוריה הם פרט מימוש שלא אמור לדלוף למסך — הם כבר מוצגים ככרטיס
// אחד (buildClientFacingRows) וההסרה מורידה את שלושתם יחד.
//
// ‼ שני מקומות יוצרים אותה — הקטלוג ב"+ בקשה" והכפתור בדף המסע — ולכן
// הלוגיקה יושבת כאן ולא באחד מהם. שתי גרסאות היו נפרדות ביום הראשון.

import type { OnboardingStep } from '../types/onboarding';
import { supabase } from './supabase';

/** שלושת השלבים, בסדר היצירה. הסדר הוא גם סדר התלות. */
export const PREV_ACCOUNTANT_STEP_TYPES: string[] = [
  'prev_accountant_details', 'release_letter', 'materials_received',
];

/** האם השלב הוא אחד משלושת החלקים של «חומרים מרו״ח קודם». */
export const isPrevAccountantStep = (stepType: string): boolean =>
  PREV_ACCOUNTANT_STEP_TYPES.includes(stepType);

export interface PrevAccountantTrackOptions {
  clientId: string;
  /** כל שלבי הלקוח — לזיהוי מה כבר קיים (לא מבוטל). */
  steps: OnboardingStep[];
  /** האימייל שעל הכרטיס. קיים ⇒ השאלה ללקוח היא אישור בלבד. */
  prevAccountantEmail?: string | null;
  /** false ⇒ השלבים נולדים כטיוטה ולא מופיעים ללקוח עד הפרסום הבא. */
  published: boolean;
}

/** מה עוד חסר מהבקשה אצל הלקוח. ריק ⇒ הכול קיים. */
export function missingPrevAccountantSteps(steps: OnboardingStep[]): string[] {
  const live = new Set(
    steps.filter(s => s.status !== 'cancelled').map(s => s.stepType as string));
  return PREV_ACCOUNTANT_STEP_TYPES.filter(t => !live.has(t));
}

/**
 * יוצרת את מה שחסר בלבד — בדיוק כמו רצף הפייפרלס. שלב שכבר קיים אצל הלקוח
 * אינו נוצר שוב אלא משמש עוגן לתלות של הבא אחריו, ולכן לחיצה חוזרת רק
 * משלימה חסרים ולעולם לא מכפילה.
 */
export async function createPrevAccountantTrack(
  opts: PrevAccountantTrackOptions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { clientId, steps, published } = opts;
  const live = steps.filter(s => s.status !== 'cancelled');
  const idOf = (t: string) => live.find(s => s.stepType === t)?.id ?? null;

  // ‼ בלי מייל אין למי לשלוח את המכתב, ולכן הוא תלוי בשאלה ונולד נעול.
  // עם מייל — השאלה היא בקשת אישור בלבד: לא נועלת את המכתב ולא חוסמת סגירה.
  const hasEmail = !!opts.prevAccountantEmail?.trim();

  async function ensure(
    stepType: string,
    payload: Record<string, unknown>,
    dependsOn: string | null,
    owner: string,
    requiredForClose: boolean,
  ): Promise<{ id: string } | { error: string }> {
    const existing = idOf(stepType);
    if (existing) return { id: existing };
    const { data, error } = await supabase.rpc('create_onboarding_request', {
      p_client_id: clientId,
      p_step_type: stepType,
      p_payload: payload,
      p_due_date: null,
      p_depends_on: dependsOn,
      p_published: published,
      p_required_for_close: requiredForClose,
      p_owner: owner,
      p_stage_id: null,
    });
    const res = data as { ok?: boolean; stepId?: string; error?: string } | null;
    if (error || !res?.ok || !res.stepId) {
      return { error: 'פתיחת הבקשה «חומרים מרו״ח קודם» נכשלה.' };
    }
    return { id: res.stepId };
  }

  const details = await ensure(
    'prev_accountant_details',
    hasEmail
      ? {
          clientTitle: 'לאשר את פרטי רואה החשבון הקודם',
          clientSub: 'הפרטים שאצלנו מוצגים למילוי מראש — רק לוודא שהם נכונים',
          clientCta: 'לאישור',
        }
      : {
          clientTitle: 'פרטי רואה החשבון הקודם שלך',
          clientSub: 'שם, אימייל וטלפון — כדי שנפנה אליו בשמך',
          clientCta: 'למילוי',
        },
    null, 'client', !hasEmail,
  );
  if ('error' in details) return { ok: false, error: details.error };

  const release = await ensure(
    'release_letter', {}, hasEmail ? null : details.id, 'me', true);
  if ('error' in release) return { ok: false, error: release.error };

  // מעקב החומרים נולד ריק ותלוי במכתב — הרשימה שנשלחת בפועל היא שממלאת אותו.
  const materials = await ensure(
    'materials_received', { checklist: [] }, release.id, 'me', true);
  if ('error' in materials) return { ok: false, error: materials.error };

  return { ok: true };
}

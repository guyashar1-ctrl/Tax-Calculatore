// ─── מנוע מוכנות הסגירה של סביבת הסקירה ──────────────────────────────────────
// ‼ קיים רק בענף הסקירה. זו הרצה מקומית של onboarding_close_readiness, כדי
// שהסקירה תיחסם בדיוק כמו מול השרת. הכללים עצמם נלקחים מ-types/onboarding.ts
// — אותו מקור שהמסך משתמש בו — ולכן אין כאן כלל שלישי שממציא לעצמו תשובה.

import type { Engagement, OnboardingStep } from '../types/onboarding';
import { blockingStepsForClose } from '../types/onboarding';

interface Store {
  steps: OnboardingStep[];
  engagements: Engagement[];
  onClosed: (engagementId: string, forced: boolean, reason: string | null) => void;
}

let store: Store | null = null;

/** סביבת הסקירה מזריקה כאן את המצב הנוכחי שלה בכל רינדור. */
export function bindReviewCloseStore(s: Store) { store = s; }

export interface ReviewReadiness {
  ok: true;
  engagementId: string;
  alreadyClosed: boolean;
  blocking: { id: string; stepType: string; status: string; ball: string }[];
  ready: boolean;
}

export function reviewCloseReadiness(engagementId: string): ReviewReadiness {
  const eng = store?.engagements.find(e => e.id === engagementId);
  const steps = (store?.steps ?? []).filter(s => s.engagementId === engagementId || s.clientId === eng?.clientId);
  const blocking = blockingStepsForClose(steps.filter(s => s.status !== 'cancelled'));
  return {
    ok: true,
    engagementId,
    alreadyClosed: !!eng && eng.status !== 'onboarding',
    blocking: blocking.map(s => ({ id: s.id, stepType: s.stepType, status: s.status, ball: s.ball })),
    ready: blocking.length === 0,
  };
}

export function reviewApplyClose(engagementId: string, forced: boolean, reason: string | null) {
  store?.onClosed(engagementId, forced, reason);
}

// מסלולי מדריך מצולם — בלי React ובלי CSS, כדי שהרישום (photoGuides.ts) והבדיקות יוכלו לספור צעדים.
import type { PhotoGuideStep } from './PhotoGuide';

/** הצעדים שמוצגים במסלול — כל צעד עם המיקום שלו ברשימה המלאה (לצילומים). צעד בלי `track` משותף לכולם. */
export function stepsOnTrack(steps: readonly PhotoGuideStep[], track: string | null | undefined): { step: PhotoGuideStep; at: number }[] {
  return steps.map((step, at) => ({ step, at })).filter(({ step }) => !step.track || step.track === track);
}

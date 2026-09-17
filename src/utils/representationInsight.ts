// ─── מה קרה, מה חסר, ומי צריך לפעול — על בקשת ייצוג אחת ─────────────────────
// ‼ היטל לקריאה בלבד (191). שלושה מסכי משרד — כרטיס «בקשות», שורת המצב, ומסך
// הבקשה — שואלים אותה שאלה על הקליטה: הלקוח בכלל פתח? עד איפה הגיע? חסר
// צילום תעודה? נגזר פעם אחת כאן, מאותם מקורות שהשרת כותב:
//   identification.draft   — שמירה במעבר שלב (save_onboarding_step)
//   identity_docs ↔ scope  — הדרישה (identityRequirements) מול מה שהגיע
//   identityDeferred       — הלקוח בחר «אעלה מאוחר יותר»
//   client_documents       — הבית של ההעלאה המאוחרת, ואם הלקוח בכלל רואה אותו

import type { Client, RepresentationRequest } from '../types';
import type { OnboardingStep } from '../types/onboarding';
import { identityRequirements, missingIdentity } from './identityEvidence';
import { peopleFromClient, requestScope } from './repScope';

export const ONBOARDING_FORM_STEPS = 4;
export const ONBOARDING_STEP_TITLES = ['הפרטים', 'פרטי קשר', 'מצב משפחתי', 'צילום תעודות'];

export interface RepresentationInsight {
  /** שלב הטופס האחרון שנשמר (1–3), 0 = טרם נשמר. */
  draftStep: number;
  openedAt?: string;
  lastActivityAt?: string;
  /** מי עדיין חייב צילום תעודה — לפי היקף הבקשה ומה שכבר הגיע. */
  missingIdentity: { person: 'client' | 'spouse'; name: string; prompt: string }[];
  /** הלקוח בחר במפורש להעלות מאוחר יותר. */
  identityDeferred: boolean;
  identityDeferredAt?: string;
  /** מי בדיוק נדחה — «אעלה מאוחר יותר» הוא לכל אדם בנפרד. */
  deferredPersons: ('client' | 'spouse')[];
  /** בן/בת הזוג ממלא/ת (וגם מצלם/ת) בקישור משלו/ה — התבקש ולא הושלם (149). */
  spouseFillPending: boolean;
  /** בקשת «מסמכים מהלקוח» שמחזיקה את פריט ההעלאה, אם קיימת. */
  docsRequest?: { stepId: string; published: boolean; open: boolean };
}

export function representationInsight(
  request: RepresentationRequest,
  client: Client | undefined | null,
  steps?: OnboardingStep[],
): RepresentationInsight {
  const ident = request.identification ?? {};
  const draft = ident.draft ?? {};
  const people = peopleFromClient(client);
  const submitted = request.onboardingStatus === 'submitted';
  // לפני ההגשה המצב המשפחתי חי בטיוטה; אחריה — בכרטיס.
  if (!submitted && draft.values?.familyStatus) people.married = draft.values.familyStatus === 'married';
  const reqs = identityRequirements(requestScope(request, client), people, {
    client: submitted ? ident.secondaryType : draft.values?.secondaryType,
    spouse: submitted ? ident.spouseSecondaryType : draft.values?.spouseSecondaryType,
  });
  const missing = missingIdentity(reqs, request.identityDocs ?? undefined)
    .map(r => ({ person: r.person, name: r.personName, prompt: r.prompt }));

  const docsStep = (steps ?? []).find(s =>
    s.clientId === request.linkedClientId && s.stepType === 'client_documents' && s.status !== 'cancelled');

  return {
    draftStep: Number(draft.step ?? 0) || 0,
    openedAt: draft.openedAt,
    lastActivityAt: draft.lastActivityAt ?? draft.savedAt,
    missingIdentity: missing,
    identityDeferred: (ident.identityDeferred?.length ?? 0) > 0,
    identityDeferredAt: ident.identityDeferredAt,
    deferredPersons: (ident.identityDeferred ?? []).filter((p): p is 'client' | 'spouse' => p === 'client' || p === 'spouse'),
    spouseFillPending: !!ident.spouseFillRequestedAt && !ident.spouseFillSubmittedAt,
    docsRequest: docsStep ? {
      stepId: docsStep.id,
      published: !!docsStep.publishedAt && docsStep.payload?.published !== false,
      open: !['completed', 'verified', 'skipped', 'cancelled'].includes(docsStep.status),
    } : undefined,
  };
}

/** «לפני 3 ימים» / «היום» — לשורת פעילות אחרונה. */
export function relativeDays(iso?: string): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

/**
 * שורת ההתקדמות של הקליטה, לכרטיס ולשורת המצב — כשהבקשה עוד ב-pending_fill.
 * «הקישור טרם נפתח» · «נפתח, טרם שמר פרטים» · «שמר עד שלב 2 מתוך 4 (פרטי קשר) · לפני 3 ימים».
 */
export function onboardingProgressLine(i: RepresentationInsight): string {
  if (!i.openedAt && !i.draftStep) return 'הקישור טרם נפתח';
  const when = i.lastActivityAt ? ` · ${relativeDays(i.lastActivityAt)}` : '';
  if (!i.draftStep) return `הלקוח פתח את הקישור, טרם שמר פרטים${when}`;
  const next = Math.min(i.draftStep + 1, ONBOARDING_FORM_STEPS);
  return `הלקוח שמר עד שלב ${i.draftStep} מתוך ${ONBOARDING_FORM_STEPS} · ממשיך ב«${ONBOARDING_STEP_TITLES[next - 1]}»${when}`;
}

/**
 * שורת הצילום החסר — אחרי ההגשה. ריק כשאין מה להגיד.
 * ‼ אומרת גם *איפה* הלקוח יעלה: אם בקשת המסמכים עוד לא פורסמה, הוא לא רואה
 * אותה — וזה בדיוק המקרה שבו המשרד חושב שהלקוח יעלה והלקוח לא יודע.
 */
export function missingIdentityLine(i: RepresentationInsight): string {
  if (i.missingIdentity.length === 0) return '';
  // ‼ לכל אדם הסיבה שלו: הלקוח דחה את שלו; בן/בת הזוג מצלם/ת בקישור שלו/ה.
  const who = i.missingIdentity.map(m => {
    if (i.deferredPersons.includes(m.person)) return `${m.name} (בחר/ה להעלות מאוחר יותר)`;
    if (m.person === 'spouse' && i.spouseFillPending) return `${m.name} (ממלא/ת בקישור נפרד)`;
    return m.name;
  }).join(', ');
  const base = `חסר צילום תעודה: ${who}`;
  // הבית של ההעלאה המאוחרת רלוונטי רק למי שנדחה ועדיין חסר.
  const deferredStillMissing = i.missingIdentity.some(m => i.deferredPersons.includes(m.person));
  if (!deferredStillMissing || !i.docsRequest) return base;
  if (!i.docsRequest.open) return `${base} · בקשת המסמכים סגורה`;
  if (!i.docsRequest.published) return `${base} · ממתין ב«מסמכים מהלקוח» - הבקשה טרם פורסמה ללקוח`;
  return `${base} · ממתין להעלאה בדף האישי («מסמכים מהלקוח»)`;
}

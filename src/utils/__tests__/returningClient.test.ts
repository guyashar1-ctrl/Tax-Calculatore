// ─── לקוח שחוזר (217 ⑨): «של העבודה הנוכחית» בדפדפן ─────────────────────────
// stepTypeTaken / stepForCurrentWork / missingPrevAccountantSteps / releaseLetterAnchors.
import { test, equal, assert, deepEqual, type TestCase } from '../../testkit/tinyTest';
import type { OnboardingStep } from '../../types/onboarding';
import {
  PER_ENGAGEMENT_STEP_TYPES, releaseLetterAnchors, stepForCurrentWork, stepTypeTaken,
} from '../../lib/clientState';
import { missingPrevAccountantSteps } from '../../lib/prevAccountantTrack';

let n = 0;
function st(p: Partial<OnboardingStep> & Pick<OnboardingStep, 'stepType' | 'status'>): OnboardingStep {
  n += 1;
  return {
    id: p.id ?? `s${n}`, clientId: 'c1', engagementId: 'e-new', track: 'tools', scope: 'person', ball: 'client',
    needsAttention: false, payload: {}, completionMethod: 'manual', createdAt: `2026-0${1 + (n % 8)}-01T00:00:00Z`,
    ...p,
  } as OnboardingStep;
}

export const TESTS: TestCase[] = [
  test('הרשימה — בדיוק ששת הסוגים שנפתחים מחדש בכל התקשרות (כמו per_engagement_step_types בשרת)', () => {
    deepEqual([...PER_ENGAGEMENT_STEP_TYPES].sort(), [
      'client_documents', 'intake_questionnaire', 'materials_received', 'prev_accountant_details',
      'release_letter', 'retainer_authorization',
    ]);
  }),
  test('stepTypeTaken: סוג «לכל התקשרות» שהושלם בהתקשרות קודמת — פנוי', () => {
    const old = st({ stepType: 'client_documents', status: 'completed', engagementId: 'e-old' });
    assert(!stepTypeTaken([old], 'client_documents', 'e-new'), 'old completed ⇒ free');
  }),
  test('stepTypeTaken: פתוח איפה שהוא — תפוס; הושלם בהתקשרות הנוכחית — תפוס', () => {
    assert(stepTypeTaken([st({ stepType: 'client_documents', status: 'waiting_client', engagementId: 'e-old' })], 'client_documents', 'e-new'), 'open anywhere');
    assert(stepTypeTaken([st({ stepType: 'client_documents', status: 'completed', engagementId: 'e-new' })], 'client_documents', 'e-new'), 'completed in current');
    assert(!stepTypeTaken([st({ stepType: 'client_documents', status: 'cancelled', engagementId: 'e-new' })], 'client_documents', 'e-new'), 'cancelled never');
    assert(stepTypeTaken([st({ stepType: 'client_documents', status: 'completed', engagementId: undefined })], 'client_documents', null), 'no engagement ⇒ unassigned row counts');
  }),
  test('stepTypeTaken: סוג «פעם אחת ללקוח» שהושלם בכל מקום — תפוס', () => {
    assert(stepTypeTaken([st({ stepType: 'paperless_invite', status: 'completed', engagementId: 'e-old' })], 'paperless_invite', 'e-new'), 'L type');
    assert(stepTypeTaken([st({ stepType: 'representation', status: 'completed', engagementId: 'e-old' })], 'representation', 'e-new'), 'L type');
  }),
  test('stepForCurrentWork: רשאה ישנה שהושלמה וחדשה פתוחה ⇒ החדשה', () => {
    const oldR = st({ id: 'old', stepType: 'retainer_authorization', status: 'completed', engagementId: 'e-old', createdAt: '2025-01-01T00:00:00Z' });
    const newR = st({ id: 'new', stepType: 'retainer_authorization', status: 'locked', engagementId: 'e-new', createdAt: '2026-09-01T00:00:00Z' });
    equal(stepForCurrentWork([oldR, newR], 'retainer_authorization', 'e-new')?.id, 'new');
    // בלי פתוח — של ההתקשרות הנוכחית, אחר כך החדש ביותר.
    const doneNew = { ...newR, status: 'completed' as const };
    equal(stepForCurrentWork([oldR, doneNew], 'retainer_authorization', 'e-new')?.id, 'new');
    equal(stepForCurrentWork([oldR], 'retainer_authorization', 'e-new')?.id, 'old');
    equal(stepForCurrentWork([], 'retainer_authorization', 'e-new'), undefined);
  }),
  test('missingPrevAccountantSteps: מסלול שהושלם בהתקשרות קודמת ⇒ שלושתם חסרים בהתקשרות החדשה', () => {
    const chain = ['prev_accountant_details', 'release_letter', 'materials_received'].map(t =>
      st({ stepType: t as OnboardingStep['stepType'], status: 'completed', engagementId: 'e-old' }));
    deepEqual(missingPrevAccountantSteps(chain, 'e-new'), ['prev_accountant_details', 'release_letter', 'materials_received']);
    deepEqual(missingPrevAccountantSteps(chain.map(s => ({ ...s, engagementId: 'e-new' })), 'e-new'), []);
  }),
  test('releaseLetterAnchors: מכתב ישן שהושלם + חומרים חדשים בהתקשרות אחרת ⇒ לא פני הכרטיס', () => {
    const oldLetter = st({ id: 'L0', stepType: 'release_letter', status: 'completed', engagementId: 'e-old' });
    const newLetter = st({ id: 'L1', stepType: 'release_letter', status: 'pending', engagementId: 'e-new' });
    const newMat = st({ id: 'M1', stepType: 'materials_received', status: 'locked', engagementId: 'e-new', dependsOnStepId: 'L1' });
    assert(!releaseLetterAnchors(oldLetter, [oldLetter, newLetter, newMat]), 'old letter');
  }),
  test('releaseLetterAnchors: חידוש — החומרים עברו להתקשרות החדשה ותלויים במכתב ⇒ עדיין פני הכרטיס', () => {
    const letter = st({ id: 'L0', stepType: 'release_letter', status: 'completed', engagementId: 'e-old' });
    const mat = st({ id: 'M0', stepType: 'materials_received', status: 'waiting_client', engagementId: 'e-new', dependsOnStepId: 'L0' });
    assert(releaseLetterAnchors(letter, [letter, mat]), 'dependency wins');
    const deps = new Map([['M0', ['L0']]]);
    assert(releaseLetterAnchors(letter, [letter, { ...mat, dependsOnStepId: undefined }], deps), 'multi-parent table');
    assert(!releaseLetterAnchors({ ...letter, status: 'pending' }, [letter, mat]), 'open letter is a normal row');
  }),
];

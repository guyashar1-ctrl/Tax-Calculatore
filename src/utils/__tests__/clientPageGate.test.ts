// ─── השער של הדף האישי (clientPageGate) — אותם מקרים כמו client_step_gate_open בשרת ───
// לקוח ראשון (קליטה שטרם פורסמה / שפורסמה) · בלי התקשרות · לקוח שחוזר (מה שעבר מול
// מה שחדש) · כרטיס אישור הייצוג לפני/אחרי הקליטה · התקשרות פעילה שנפתחה / שלא נפתחה.
import { test, equal, assert, type TestCase } from '../../testkit/tinyTest';
import type { OnboardingStep } from '../../types/onboarding';
import {
  awaitsPublication, carriedFromLine, clientProcessPublished, engagementsOf, isBefore, onClientPageFrom, openIntake,
  stepGateOpen, visibleOnClientPage, type GateEngagement,
} from '../clientPageGate';
import { onClientPageSince, stepAttention } from '../requestAttention';

const T = (d: number) => new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString();

const eng = (p: Partial<GateEngagement> & Pick<GateEngagement, 'status'>): GateEngagement =>
  ({ id: `e-${Math.random().toString(36).slice(2, 8)}`, clientId: 'c1', createdAt: T(0), ...p });

const st = (p: Partial<OnboardingStep> & Pick<OnboardingStep, 'stepType'>): OnboardingStep => ({
  id: `s-${Math.random().toString(36).slice(2, 8)}`, clientId: 'c1', engagementId: 'e1', track: 'tools',
  scope: 'person', status: 'waiting_client', ball: 'client', needsAttention: false, payload: {},
  completionMethod: 'manual', publishedAt: T(10), createdAt: T(10),
  ...p,
} as OnboardingStep);

export const TESTS: TestCase[] = [
  test('לקוח ראשון: קליטה שטרם פורסמה ⇒ מה שפורסם בה לא בדף; אחרי הפרסום — בדף', () => {
    const intake = eng({ status: 'onboarding', createdAt: T(5) });
    const docs = st({ stepType: 'client_documents', publishedAt: T(5) });
    equal(stepGateOpen(docs.publishedAt, [intake]), false, 'gate');
    equal(clientProcessPublished([intake]), false, 'client gate');
    equal(visibleOnClientPage(docs, [intake]), false, 'visible');
    equal(awaitsPublication(docs, [intake]), true, 'awaits');
    const published = { ...intake, processPublishedAt: T(6) };
    equal(visibleOnClientPage(docs, [published]), true, 'after publish');
    equal(awaitsPublication(docs, [published]), false);
    equal(clientProcessPublished([published]), true);
  }),
  test('«לפני» = קטן ממש: מה שפורסם ברגע שהקליטה נוצרה (אותה טרנזקציה) שייך לקליטה', () => {
    const at = '2026-10-03T19:51:07.123456+00:00';
    const intake = eng({ status: 'onboarding', createdAt: at });
    equal(stepGateOpen(at, [intake]), false, 'equal');
    equal(stepGateOpen('2026-10-03T19:51:07.123455+00:00', [intake]), true, 'one microsecond before');
    equal(stepGateOpen('2026-10-03T19:51:07.123457+00:00', [intake]), false, 'one microsecond after');
    assert(isBefore('2026-10-03T19:51:07.123Z', '2026-10-03T22:51:07.124+03:00'), 'offsets');
    assert(!isBefore(null, at) && !isBefore(at, undefined), 'missing ⇒ false');
  }),
  test('בלי התקשרות בכלל ⇒ פתוח (כמו קודם)', () => {
    equal(stepGateOpen(T(1), []), true);
    equal(clientProcessPublished([]), true);
    equal(visibleOnClientPage(st({ stepType: 'custom_request' }), []), true);
  }),
  test('לקוח שחוזר: מה שעבר מההתקשרות הקודמת בדף; מה שנוצר בקליטה החדשה — ממתין לפרסום', () => {
    const old = eng({ status: 'ended', createdAt: T(0), processPublishedAt: T(1) });
    const intake = eng({ status: 'onboarding', createdAt: T(300) });
    const carried = st({ stepType: 'custom_request', publishedAt: T(20),
      payload: { title: 'פתוח מהעבר', carriedFrom: { engagementId: old.id, endedAt: T(250) } } });
    const fresh = st({ stepType: 'client_documents', publishedAt: T(300) });
    const engs = [intake, old];
    equal(visibleOnClientPage(carried, engs), true, 'carried visible');
    equal(awaitsPublication(carried, engs), false, 'carried is not unpublished');
    equal(visibleOnClientPage(fresh, engs), false, 'new hidden');
    equal(awaitsPublication(fresh, engs), true, 'new awaits publication');
    // ‼ ההתקשרות הקודמת נפתחה — אבל השער של קליטה פתוחה הוא הדגל שלה בלבד.
    equal(clientProcessPublished(engs), false, 'client gate = the open intake');
    const pub = [{ ...intake, processPublishedAt: T(301) }, old];
    equal(visibleOnClientPage(fresh, pub), true, 'after publish');
    equal(visibleOnClientPage(carried, pub), true);
  }),
  test('כרטיס אישור הייצוג: לפני הקליטה — בדף; נולד בקליטה שטרם פורסמה — לא', () => {
    const old = eng({ status: 'ended', processPublishedAt: T(1) });
    const intake = eng({ status: 'onboarding', createdAt: T(100) });
    const before = st({ stepType: 'rep_client_approval', publishedAt: T(50) });
    const after = st({ stepType: 'rep_client_approval', publishedAt: T(120) });
    equal(visibleOnClientPage(before, [old, intake]), true, 'before');
    equal(visibleOnClientPage(after, [old, intake]), false, 'after');
    equal(awaitsPublication(after, [old, intake]), true);
  }),
  test('התקשרות פעילה (בלי קליטה פתוחה): נפתחה ⇒ בדף; לא נפתחה ⇒ לא', () => {
    const active = eng({ status: 'active', processPublishedAt: T(2) });
    equal(visibleOnClientPage(st({ stepType: 'custom_request', publishedAt: T(500) }), [active]), true);
    const closed = eng({ status: 'active' });
    equal(stepGateOpen(T(500), [closed]), false);
    equal(clientProcessPublished([closed]), false);
    // התקשרות קודמת אחת שנפתחה מספיקה, כשאין קליטה פתוחה.
    equal(stepGateOpen(T(500), [closed, eng({ status: 'ended', processPublishedAt: T(1) })]), true);
  }),
  test('הקליטה הפתוחה = האחרונה שנוצרה (open_intake_engagement_id)', () => {
    const a = eng({ status: 'onboarding', createdAt: T(10), processPublishedAt: T(11) });
    const b = eng({ status: 'onboarding', createdAt: T(20) });
    equal(openIntake([a, b]), b);
    equal(stepGateOpen(T(15), [a, b]), true, 'published before the latest');
    equal(stepGateOpen(T(25), [a, b]), false);
    equal(openIntake([eng({ status: 'active' }), eng({ status: 'ended' })]), null);
  }),
  test('טיוטה, משימה פנימית — לעולם לא בדף; «ייצוג מול הרשויות» — תמיד (כמו בשרת)', () => {
    const intake = eng({ status: 'onboarding', createdAt: T(5) });
    const draft = st({ stepType: 'custom_request', publishedAt: null });
    equal(visibleOnClientPage(draft, []), false, 'draft');
    equal(awaitsPublication(draft, [intake]), false, 'draft is a draft, not «ממתין לפרסום»');
    // הסימון הישן — לפעמים כמחרוזת (כמו isDraftStep: String(…) === 'false').
    const legacyDraft = st({ stepType: 'custom_request', payload: { published: 'false' } as unknown as OnboardingStep['payload'] });
    equal(visibleOnClientPage(legacyDraft, []), false, 'payload.published=false');
    const internal = st({ stepType: 'custom_request', payload: { internalTask: true } });
    equal(visibleOnClientPage(internal, []), false, 'internal');
    equal(awaitsPublication(internal, [intake]), false);
    const rep = st({ stepType: 'representation', publishedAt: T(9) });
    equal(visibleOnClientPage(rep, [intake]), true, 'representation always');
    equal(awaitsPublication(rep, [intake]), false);
    // סוג שהדף לא מכיר (הקמה פנימית) — אינו «ממתין לפרסום».
    equal(awaitsPublication(st({ stepType: 'internal_setup', publishedAt: T(9) }), [intake]), false);
  }),
  test('רק ההתקשרויות של הלקוח של השלב', () => {
    const other = eng({ status: 'onboarding', clientId: 'c2', createdAt: T(1) });
    const mine = eng({ status: 'active', clientId: 'c1', processPublishedAt: T(1) });
    equal(engagementsOf([other, mine], 'c1').length, 1);
    equal(visibleOnClientPage(st({ stepType: 'custom_request', publishedAt: T(9) }), [other, mine]), true);
  }),
  test('«בדף מ-…» רק כשהבקשה באמת בדף לפי השער — ומאז שנכנסה לדף', () => {
    const intake = eng({ status: 'onboarding', createdAt: T(5) });
    const req = st({ stepType: 'custom_request', publishedAt: T(6),
      payload: { requirements: [{ key: 'a', kind: 'file', label: 'x', done: false }] } });
    const a = stepAttention(req);
    equal(onClientPageSince(req, a, false), T(6), 'בלי התקשרויות — כמו קודם');
    equal(onClientPageSince(req, a, false, [intake]), null, 'hidden by the intake');
    // הקליטה נפתחה ב-T(9): הבקשה שהוכנה ב-T(6) נכנסה לדף רק אז.
    equal(onClientPageSince(req, a, false, [{ ...intake, processPublishedAt: T(9) }]), T(9), 'since the intake opened');
    // נוספה אחרי שהקליטה כבר נפתחה — מזמן הפרסום שלה.
    equal(onClientPageFrom({ ...req, publishedAt: T(12) }, [{ ...intake, processPublishedAt: T(9) }]), T(12));
    // עברה מההתקשרות הקודמת (פורסמה לפני הקליטה) — מזמן הפרסום שלה, גם כשהקליטה טרם פורסמה.
    const old = eng({ status: 'ended', createdAt: T(0), processPublishedAt: T(1) });
    equal(onClientPageFrom({ ...req, publishedAt: T(3) }, [intake, old]), T(3), 'carried');
    // בלי קליטה פתוחה: השער נפתח עם ההתקשרות הראשונה שנפתחה.
    equal(onClientPageFrom({ ...req, publishedAt: T(2) }, [eng({ status: 'active', processPublishedAt: T(4) })]), T(4));
    equal(onClientPageFrom({ ...req, publishedAt: T(2) }, []), T(2), 'no engagement');
  }),
  test('שורת ההקשר של בקשה שעברה', () => {
    equal(carriedFromLine(st({ stepType: 'custom_request', payload: { carriedFrom: { endedAt: '2026-05-12T10:00:00Z' } } })),
      'מההתקשרות הקודמת · עד 12.05.26');
    equal(carriedFromLine(st({ stepType: 'custom_request', payload: { carriedFrom: { engagementId: 'x' } } })), 'מההתקשרות הקודמת');
    equal(carriedFromLine(st({ stepType: 'custom_request' })), null);
  }),
];

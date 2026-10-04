// ─── סבב 5 · משטח הבקשות: שדרוג לראשי, חלק של בקשה קודמת, אישור נדרש, ב"ל בלי שלב ───
// F2 (a)(b)(c) · F X-1 / G X-3 · H2 X-1 · G H1.a · F4 · E X-7 — הלוגיקה הטהורה שמאחורי המסך.
import { test, equal, assert, deepEqual, type TestCase } from '../../testkit/tinyTest';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { isStepRequiredForClose, LEGACY_AUTO_OFFICE_TYPES } from '../../types/onboarding';
import {
  buildClientFacingRows, belongsToRepresentationRequest, isRepresentationPart, isStaleRepresentationPart,
  SURFACE_HIDDEN_OFFICE_TYPES,
} from '../clientFacingRows';
import {
  countRequestsNeedingMe, isOnRequestsSurface, requestRows, rowSummary, stepAttention, type AttentionContext,
} from '../requestAttention';
import {
  groupWaitingState, lamed, moreMineLabel, MINE_STATE_TEXT, repShortAction, rowStateFor,
} from '../requestPresentation';
import { authRepRowModel, niTrackNeedsSend } from '../authorityRepresentationRow';
import { niCancelledText } from '../niPersons';
import { subjectRoleOf } from '../../components/clientTabs/InlineComposer';
import { hideStepDoneText } from '../../features/flows/api';
import { formatRoute, parseHash } from '../../lib/appRoute';

let n = 0;
function st(p: Partial<OnboardingStep> & Pick<OnboardingStep, 'stepType' | 'status' | 'ball'>): OnboardingStep {
  n += 1;
  return {
    id: p.id ?? `r5-${n}`, clientId: 'c1', engagementId: 'e1', track: 'tools', scope: 'person',
    needsAttention: false, payload: {}, completionMethod: 'manual',
    createdAt: `2026-09-${String(10 + (n % 15)).padStart(2, '0')}T08:00:00Z`, sortOrder: n * 10,
    ...p,
  } as OnboardingStep;
}
const REQ = 'req-now';
const rep = (status: OnboardingStep['status'] = 'waiting_client') =>
  st({ id: 'rep', stepType: 'representation', status, ball: status === 'waiting_client' ? 'client' : 'me' });
const ni = (id: string, role: 'client' | 'spouse', reqId = REQ, status: OnboardingStep['status'] = 'in_progress') =>
  st({ id, stepType: 'authority_representation', status, ball: 'me',
    payload: { authority: 'national_insurance', subjectRole: role, representationRequestId: reqId } });
const upg = (needsAttention = false, extra: Record<string, unknown> = {}) =>
  st({ id: 'upg', stepType: 'representation_upgrade', status: 'pending', ball: 'me', needsAttention,
    payload: { secondaryAuthorities: ['incomeTax'], ...extra } });
const ctx = (p: Partial<AttentionContext> = {}): AttentionContext => ({ representationRequestId: REQ, repStatus: 'pending_signature', ...p });

export const TESTS: TestCase[] = [
  // ── F2(a) «שדרוג לייצוג ראשי» — חלק של הייצוג ──────────────────────────────
  test('שדרוג לראשי: על משטח הבקשות, אבל עדיין לא חוסם את סגירת הקליטה', () => {
    assert(isOnRequestsSurface(upg()), 'on the surface');
    assert(!SURFACE_HIDDEN_OFFICE_TYPES.includes('representation_upgrade'), 'not hidden');
    assert(LEGACY_AUTO_OFFICE_TYPES.includes('representation_upgrade'), 'still in the close-gate list');
    equal(isStepRequiredForClose(upg()), false, 'non-blocking for close');
    assert(SURFACE_HIDDEN_OFFICE_TYPES.includes('kyc_identification'), 'other auto-office steps stay hidden');
  }),
  test('שדרוג לראשי: מקובץ תחת ההורה הפתוח (אחרון בחלקים); כשההורה נסגר — עומד לבד', () => {
    const rows = buildClientFacingRows([upg(), rep(), ni('ni-c', 'client')], undefined, { representationRequestId: REQ });
    equal(rows.length, 1);
    deepEqual(rows[0].members.map(m => m.id), ['rep', 'ni-c', 'upg']);
    const closed = buildClientFacingRows([rep('completed'), upg(true)], undefined, { representationRequestId: REQ });
    equal(closed.length, 1);
    assert(!!closed[0].repPart && closed[0].primary.id === 'upg', 'standalone part');
    assert(isRepresentationPart(upg()), 'a representation part');
    assert(belongsToRepresentationRequest(upg(), REQ), 'belongs to the current request');
    assert(!belongsToRepresentationRequest(upg(), null), 'no request ⇒ not grouped');
  }),
  test('שדרוג לראשי: דורש אותך רק כשהגיע הזמן; עד אז «בהמשך» ולא משנה את מצב ההורה', () => {
    equal(stepAttention(upg(true)).kind, 'mine');
    const later = stepAttention(upg(false));
    equal(later.kind, 'waiting'); equal(later.waitingOn, 'locked');
    equal(rowStateFor({ kind: later.kind, tone: 'gray', waitingOn: later.waitingOn, status: 'pending' }).text, 'בהמשך');
    const row = requestRows([rep(), upg(false)], ctx())[0];
    const sum = rowSummary(row, ctx());
    equal(sum.attn.kind, 'waiting');
    deepEqual(sum.waitingOn, ['client'], 'the dormant reminder does not add «ולרו״ח הקודם»');
    equal(countRequestsNeedingMe([rep(), upg(true)], ctx()), 1, 'due ⇒ the representation row needs me (once)');
  }),

  // ── F X-1 / G X-3: חלק של בקשת ייצוג קודמת ──────────────────────────────────
  test('חלק של בקשה קודמת: לא קורא את הביצוע של הבקשה הנוכחית, לא דורש אותך', () => {
    const old = ni('ni-old', 'client', 'req-old');
    assert(isStaleRepresentationPart(old, REQ), 'stale');
    assert(!isStaleRepresentationPart(ni('ni-c', 'client'), REQ), 'current is not stale');
    assert(!isStaleRepresentationPart(old, undefined), 'unknown request ⇒ not stale');
    // הבקשה הנוכחית כבר אישרה את הלקוח — זה לא «ממתין לרשות» של החלק הישן.
    const a = stepAttention(old, ctx({ niExecution: { client: { referenceNumber: '1', confirmedAt: '2026-09-23T00:00:00Z' } } }));
    deepEqual(a, { kind: 'waiting', tone: 'gray' });
    equal(countRequestsNeedingMe([old], ctx()), 0);
  }),

  // ── H2 X-1: אישור נדרש באזור האישי ─────────────────────────────────────────
  test('אישור נדרש: «ייצוג מול הרשויות» ממתין לאדם שצריך לאשר — לא לרשות', () => {
    const parent = rep('in_progress');
    equal(stepAttention(parent, ctx({ repStatus: 'awaiting_authorities' })).waitingOn, 'authority');
    equal(stepAttention(parent, ctx({ repStatus: 'awaiting_authorities', repApprovalWaitingOn: 'spouse' })).waitingOn, 'spouse');
    equal(stepAttention(parent, ctx({ repStatus: 'awaiting_authorities', repApprovalWaitingOn: 'client' })).waitingOn, 'client');
    // רק בהמתנה לרשויות — בשלב אחר הסימון לא משנה דבר.
    equal(stepAttention(parent, ctx({ repStatus: 'awaiting_stamp', repApprovalWaitingOn: 'client' })).kind, 'mine');
  }),

  // ── F2(c): ב"ל בלי שלב שההוראות שלו מחכות ───────────────────────────────────
  test('ב"ל בלי שלב: «שלח הוראות» רק כשיש אסמכתא ואין מסלול אחר; נספר בשורת הייצוג', () => {
    const today = '2026-10-04';
    assert(niTrackNeedsSend({ referenceNumber: '75160009', deadline: '2026-11-01' }, { today }), 'ref, not sent');
    assert(!niTrackNeedsSend({ referenceNumber: '1' }, { ridesWithSignature: true, today }), 'rides with the signature');
    assert(!niTrackNeedsSend({ referenceNumber: '1', instructionsSentAt: '2026-10-01' }, { today }), 'already sent');
    assert(!niTrackNeedsSend({ referenceNumber: '1', deadline: '2026-10-01' }, { today }), 'expired');
    assert(!niTrackNeedsSend({ enteredAt: '2026-10-01' }, { today }), 'no reference yet');
    const steps = [rep('in_progress')];
    const c = ctx({ repStatus: 'pending_signature', niSendWithoutStep: ['client'] });
    equal(countRequestsNeedingMe(steps, ctx({ repStatus: 'pending_signature' })), 0, 'without the virtual part');
    equal(countRequestsNeedingMe(steps, c), 1, 'the virtual part needs me');
    equal(rowSummary(requestRows(steps, c)[0], c).lead, null, 'no step leads');
  }),

  // ── G H1.a: אדם שבוטל ────────────────────────────────────────────────────────
  test('ב"ל שבוטל: «הבקשה בוטלה ב-PIVO · תאריך» רק כשהאדם יצא מהרשימה', () => {
    const areas = { nationalInsurance: { status: 'in_process', targets: ['client'], cancelled: { spouse: { at: '2026-10-04T08:00:00Z', stage: 'sent' } } } } as unknown as Client['authorityRepresentations'];
    const t = niCancelledText(areas, 'spouse');
    assert(!!t && t.startsWith('הבקשה בוטלה ב-PIVO'), String(t));
    assert(!!t && t.includes('‏'), 'RLM keeps «PIVO · date» in reading order');
    equal(niCancelledText(areas, 'client'), null, 'still a target');
    const again = { nationalInsurance: { status: 'in_process', targets: ['client', 'spouse'], cancelled: { spouse: { at: '2026-10-04T08:00:00Z', stage: 'sent' } } } } as unknown as Client['authorityRepresentations'];
    equal(niCancelledText(again, 'spouse'), null, 'requested again ⇒ not cancelled');
  }),

  // ── F2(b): המצב והחלק הנוסף בשמם ────────────────────────────────────────────
  test('«ועוד: …» — החלק הנוסף בשמו; מצב כללי לא נוסף; יותר מאחד — מספר', () => {
    equal(moreMineLabel([]), null);
    equal(moreMineLabel([{ label: 'ביטוח לאומי · לקוח12', state: 'חסרים פרטים' }]), 'ועוד: ביטוח לאומי · לקוח12 — חסרים פרטים');
    equal(moreMineLabel([{ label: 'צילום תעודה לרשות המסים · רותם', state: MINE_STATE_TEXT }]), 'ועוד: צילום תעודה לרשות המסים · רותם');
    equal(moreMineLabel([{ label: 'א' }, { label: 'ב' }]), 'ועוד 2 לטיפולך');
  }),
  test('בקשת הייצוג אצלך — מה לעשות, במילים ספורות (ליד «למרכז הייצוג»)', () => {
    equal(repShortAction('awaiting_stamp'), 'לחתום ולהוסיף חותמת');
    equal(repShortAction('awaiting_accountant'), 'להזין ולהפיק טופס');
    equal(repShortAction('pending_signature', 'unsent'), 'לשלוח ללקוח לחתימה');
    equal(repShortAction('pending_signature'), null);
    equal(repShortAction('awaiting_authorities'), null);
  }),

  // ── F4: משימה פנימית ────────────────────────────────────────────────────────
  test('משימה פנימית: «פתוחה» / «בהמתנה» — אף פעם לא «ממתין ל{שם}»', () => {
    equal(rowStateFor({ kind: 'internal', tone: 'gray', status: 'pending', clientFirstName: 'שרון' }).text, 'פתוחה');
    equal(rowStateFor({ kind: 'internal', tone: 'gray', waitingOn: 'client', status: 'waiting_client', clientFirstName: 'שרון' }).text, 'בהמתנה');
    const hidden = st({ stepType: 'custom_request', status: 'waiting_client', ball: 'client', payload: { title: 'x', internalTask: true } });
    equal(stepAttention(hidden).kind, 'internal');
  }),

  // ── E X-7: «ל» + שם ─────────────────────────────────────────────────────────
  test('«ל» + שם: «לשרון», ובלי שם «ללקוח» — לא «להלקוח»', () => {
    equal(lamed('שרון'), 'לשרון');
    equal(lamed('הדסה'), 'להדסה', 'ה׳ בתחילת שם אינה ה׳ הידיעה');
    equal(lamed(''), 'ללקוח');
    equal(lamed('הלקוח'), 'ללקוח');
    equal(lamed(undefined), 'ללקוח');
    equal(lamed('בן/בת הזוג'), 'לבן/בת הזוג');
    equal(rowStateFor({ kind: 'waiting', tone: 'gray', waitingOn: 'client', status: 'waiting_client', clientFirstName: 'הלקוח' }).text, 'ממתין ללקוח');
    equal(groupWaitingState(['client', 'spouse'], false, { client: 'הלקוח', spouse: 'רותם' }).text, 'ממתין ללקוח ולרותם');
    equal(authRepRowModel({ open: true, first: 'הלקוח', tone: 'gray', missing: [], today: '2026-10-04',
      track: { referenceNumber: '1', instructionsSentAt: '2026-10-01', deadline: '2026-11-01' } }).state?.text, 'ממתין ללקוח');
  }),

  // ── G G1.b: צילום התעודה של בן/בת הזוג ───────────────────────────────────────
  test('צילום תעודה של בן/בת הזוג — הנושא הוא בן/בת הזוג גם בלי subjectRole', () => {
    equal(subjectRoleOf({ shaamIdentity: { person: 'spouse', kind: 'idCard' } }), 'spouse');
    equal(subjectRoleOf({ shaamIdentity: { person: 'client', kind: 'idCard' } }), undefined);
    equal(subjectRoleOf({ subjectRole: 'spouse' }), 'spouse');
    equal(subjectRoleOf(null), undefined);
  }),

  // ── F4: «הסתר מהדף» — מה קרה, ואם המשימה חזרה אליך (backToOffice מהשרת) ──────
  test('«הסתר מהדף»: המשפט אומר לאן עברה, ו«וחזרה אליך» רק כשהשרת החזיר backToOffice', () => {
    equal(hideStepDoneText({}, 'שרון'), 'הוסתרה מהדף של שרון — עברה ל«עבודה פנימית»');
    equal(hideStepDoneText({ backToOffice: true }, 'שרון'), 'הוסתרה מהדף של שרון — עברה ל«עבודה פנימית» וחזרה אליך');
  }),

  // ── B5.1 / B5.2: הקישור מהשורה נוחת על הפריט במשרד ─────────────────────────────
  test('כתובת «המשרד» נושאת את מה לפתוח: בקשה בספרייה, שלב במסלול', () => {
    const lib = formatRoute({ view: 'firmProfile', officePage: 'library', officeFocus: 'request:tpl-7' });
    equal(lib, '/firm/library/request%3Atpl-7');
    deepEqual(parseHash('#' + lib), { view: 'firmProfile', officePage: 'library', officeFocus: 'request:tpl-7' });
    const flow = formatRoute({ view: 'firmProfile', officePage: 'flows', officeFocus: 'flow:f-onb:s2:pp' });
    deepEqual(parseHash('#' + flow), { view: 'firmProfile', officePage: 'flows', officeFocus: 'flow:f-onb:s2:pp' });
    // בלי עמוד — אין פוקוס; כתובת ישנה בלי פוקוס — כמו קודם.
    equal(formatRoute({ view: 'firmProfile', officeFocus: 'request:x' }), '/firm');
    deepEqual(parseHash('#/firm/library'), { view: 'firmProfile', officePage: 'library' });
  }),
];

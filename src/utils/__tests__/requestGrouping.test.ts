// ─── סבב 4: תהליך אחד = שורה אחת (clientFacingRows · requestAttention) ────────
// ייצוג מול הרשויות עם החלקים שלו, מצב השורה כולה, התג סופר תהליכים, «לא נוצרה»,
// משימות פנימיות ישנות, וב"ל לאדם (authRepRowModel).
import { test, equal, assert, deepEqual, type TestCase } from '../../testkit/tinyTest';
import type { OnboardingStep } from '../../types/onboarding';
import {
  buildClientFacingRows, summarizeRow, rowNeedsGroupState, rowParts,
  hasClientContent, isManualInternal, isLegacyInternalReview, neverOnClientPage,
} from '../clientFacingRows';
import {
  stepAttention, countRequestsNeedingMe, hasRedRequest, requestRows, rowSummary, onClientPageSince,
  type AttentionContext,
} from '../requestAttention';
import { groupWaitingState, moreMineText, rowStateFor } from '../requestPresentation';
import { authRepRowModel, niTrackLine, representationPartLabel, taxAuthorityScopeLine } from '../authorityRepresentationRow';
import { isStuckStep, nextActionText, nextStepForClient } from '../onboardingNext';
import { editOwnerOf } from '../../components/clientTabs/InlineComposer';

let n = 0;
function st(p: Partial<OnboardingStep> & Pick<OnboardingStep, 'stepType' | 'status' | 'ball'>): OnboardingStep {
  n += 1;
  return {
    id: p.id ?? `s${n}`, clientId: 'c1', engagementId: 'e1', track: 'tools', scope: 'person',
    needsAttention: false, payload: {}, completionMethod: 'manual',
    createdAt: `2026-09-${String(10 + (n % 15)).padStart(2, '0')}T08:00:00Z`, sortOrder: n * 10,
    ...p,
  } as OnboardingStep;
}
const REQ = 'req-1';
const rep = (status: OnboardingStep['status'] = 'waiting_client') =>
  st({ id: 'rep', stepType: 'representation', status, ball: status === 'waiting_client' ? 'client' : 'me' });
const ni = (id: string, role: 'client' | 'spouse', extra: Record<string, unknown> = {}, status: OnboardingStep['status'] = 'pending') =>
  st({ id, stepType: 'authority_representation', status, ball: 'me',
    payload: { authority: 'national_insurance', subjectRole: role, subjectName: role === 'spouse' ? 'רותם ישנה' : 'הדסה', representationRequestId: REQ, ...extra } });
const shaam = (id: string, person: 'client' | 'spouse', requestId = REQ) =>
  st({ id, stepType: 'custom_request', status: 'pending', ball: 'client',
    payload: { shaamIdentity: { key: `${requestId}:${person}:idCard`, requestId, person, kind: 'idCard' }, requirements: [{ key: 'identity_confirm', kind: 'confirm', label: 'x', done: false }] } });
const problem = (id: string, extra: Partial<OnboardingStep> = {}) =>
  st({ id, stepType: 'custom_request', status: 'pending', ball: 'me', ...extra,
    payload: { title: 'לא נוצרה — «X»', internalTask: true, creationProblem: { key: `k-${id}`, reason: 'library_item_missing', next: 'add', itemTitle: 'X', attempts: 1 } } });

const ctxWith = (p: Partial<AttentionContext> = {}): AttentionContext => ({ representationRequestId: REQ, repStatus: 'pending_signature', ...p });
const names = { client: 'הדסה', spouse: 'רותם' };

export const TESTS: TestCase[] = [
  // ── קיבוץ ────────────────────────────────────────────────────────────────
  test('ייצוג: ב"ל לכל אדם וצילומי התעודה של אותה בקשה יורדים להורה הפתוח — לקוח, בן/בת זוג, ואז צילומים', () => {
    const rows = buildClientFacingRows([shaam('sh-s', 'spouse'), ni('ni-s', 'spouse'), rep(), ni('ni-c', 'client'), shaam('sh-c', 'client')], undefined, { representationRequestId: REQ });
    equal(rows.length, 1);
    equal(rows[0].kind, 'representation');
    deepEqual(rows[0].members.map(m => m.id), ['rep', 'ni-c', 'ni-s', 'sh-c', 'sh-s']);
    equal(rows[0].primary.id, 'rep');
  }),
  test('ייצוג: הורה סגור / חסר / בקשה אחרת ⇒ כל חלק עומד לבדו (repPart)', () => {
    const closed = buildClientFacingRows([rep('completed'), ni('ni-s', 'spouse')], undefined, { representationRequestId: REQ });
    equal(closed.length, 1); equal(closed[0].kind, 'single'); assert(!!closed[0].repPart, 'repPart');
    const missing = buildClientFacingRows([ni('ni-c', 'client'), shaam('sh', 'client')], undefined, { representationRequestId: REQ });
    equal(missing.length, 2); assert(missing.every(r => r.repPart), 'both standalone');
    const other = buildClientFacingRows([rep(), ni('ni-old', 'client', { representationRequestId: 'req-old' })], undefined, { representationRequestId: REQ });
    equal(other.length, 2);
    equal(other.find(r => r.kind === 'representation')?.members.length, 1, 'רק ההורה');
    assert(!!other.find(r => r.primary.id === 'ni-old')?.repPart, 'הישן עומד לבד');
    const none = buildClientFacingRows([rep(), ni('ni-c', 'client')], undefined, { representationRequestId: null });
    equal(none.length, 2, 'אין ללקוח בקשת ייצוג ⇒ אין קיבוץ');
  }),
  test('ייצוג: מבוטל לא נכנס; בלי מזהה בקשה (השולחן) — מקובץ להורה הפתוח', () => {
    const rows = buildClientFacingRows([rep(), ni('ni-x', 'spouse', {}, 'cancelled'), ni('ni-c', 'client')]);
    equal(rows.length, 1);
    deepEqual(rows[0].members.map(m => m.id), ['rep', 'ni-c']);
  }),
  test('פייפרלס ורו״ח קודם — כמו קודם (שרשרת אחת, המכתב הוא הפנים)', () => {
    const inv = st({ id: 'inv', stepType: 'paperless_invite', status: 'waiting_client', ball: 'client' });
    const con = st({ id: 'con', stepType: 'paperless_connection', status: 'locked', ball: 'me' });
    const det = st({ id: 'det', stepType: 'prev_accountant_details', status: 'completed', ball: 'client' });
    const rel = st({ id: 'rel', stepType: 'release_letter', status: 'pending', ball: 'me' });
    const mat = st({ id: 'mat', stepType: 'materials_received', status: 'locked', ball: 'prev_accountant', dependsOnStepId: 'rel' });
    const rows = buildClientFacingRows([inv, con, det, rel, mat]);
    equal(rows.length, 2);
    deepEqual(rows.find(r => r.kind === 'paperless')?.members.map(m => m.id), ['inv', 'con']);
    equal(rows.find(r => r.kind === 'prevAccountant')?.primary.id, 'rel');
  }),
  test('«אישור אישי» של בן/בת הזוג יורד לבקשה של בעל הכרטיס מאותה ריצה ואותו פריט', () => {
    const own = st({ id: 'own', stepType: 'custom_request', status: 'waiting_client', ball: 'client', flowRunId: 'r1', flowItemKey: 'i7',
      payload: { title: 'אישור תנאים', requirements: [{ key: 'a', kind: 'confirm', label: 'x', done: false }] } });
    const task = st({ id: 'task', stepType: 'custom_request', status: 'pending', ball: 'me', flowRunId: 'r1', flowItemKey: 'i7',
      payload: { title: 'אישור אישי של רותם — «אישור תנאים»', personalConfirmFor: 'i7', internalTask: true } });
    const rows = buildClientFacingRows([own, task]);
    equal(rows.length, 1);
    deepEqual(rows[0].members.map(m => m.id), ['own', 'task']);
    equal(countRequestsNeedingMe([own, task]), 1, 'התהליך דורש אותך פעם אחת');
    const lone = buildClientFacingRows([task]);
    equal(lone.length, 1, 'בלי הבקשה של בעל הכרטיס — לבד');
  }),
  test('«לא נוצרה» לא יורדת לתוך בקשה אחרת, ולא נחשבת «הבקשה של בעל הכרטיס»', () => {
    const parent = st({ id: 'p', stepType: 'custom_request', status: 'waiting_client', ball: 'client', payload: { requirements: [{ key: 'a', kind: 'file', label: 'x', done: false }] } });
    const pr = problem('pr', { dependsOnStepId: 'p' });
    const rows = buildClientFacingRows([parent, pr]);
    equal(rows.length, 2);
  }),

  // ── מצב השורה כולה ──────────────────────────────────────────────────────────
  test('מקרה הצילום: פרטים חסרים לבן/בת הזוג גוברים על ההורה שממתין ללקוח', () => {
    const gated = ni('ni-s', 'spouse', { prerequisites: { missing: ['spouseIdNumber'] } });
    const rows = requestRows([rep(), ni('ni-c', 'client'), gated], ctxWith({
      niExecution: { client: { enteredAt: '2026-09-01', referenceNumber: '1', instructionsSentAt: '2026-09-02' } },
    }));
    const sum = rowSummary(rows[0], ctxWith({ niExecution: { client: { enteredAt: '2026-09-01', referenceNumber: '1', instructionsSentAt: '2026-09-02' } } }));
    equal(sum.lead?.id, 'ni-s');
    equal(sum.attn.kind, 'mine');
    equal(sum.moreMine, 0);
    assert(rowNeedsGroupState(rows[0], sum), 'מצב קבוצה');
    const m = authRepRowModel({ open: true, first: 'לקוח12', tone: 'blue', missing: ['spouseIdNumber'] });
    deepEqual(m.state, { text: 'חסרים פרטים', tone: 'amber' });
    equal(m.primary?.label, 'השלמת פרטים');
    equal(representationPartLabel(gated, { client: 'הדסה', spouse: 'לקוח12' }), 'ביטוח לאומי · לקוח12', 'השם הנוכחי, לא subjectName');
  }),
  test('אדום גובר על כחול; «ועוד 1 לטיפולך»', () => {
    const blocked = st({ id: 'b', stepType: 'custom_request', status: 'blocked', ball: 'client', flowRunId: 'r', flowItemKey: 'k',
      payload: { requirements: [{ key: 'a', kind: 'file', label: 'x', done: false }] } });
    const task = st({ id: 't', stepType: 'custom_request', status: 'pending', ball: 'me', flowRunId: 'r', flowItemKey: 'k',
      payload: { personalConfirmFor: 'k', internalTask: true } });
    const row = buildClientFacingRows([blocked, task])[0];
    const sum = summarizeRow(row, s => stepAttention(s));
    equal(sum.lead?.id, 'b');
    deepEqual(sum.attn, { kind: 'mine', tone: 'red' });
    const two = summarizeRow(buildClientFacingRows([rep('in_progress'), ni('a', 'client'), ni('b', 'spouse')], undefined, { representationRequestId: REQ })[0],
      s => stepAttention(s, ctxWith({ repStatus: 'awaiting_accountant' })));
    equal(two.lead?.id, 'rep');
    equal(two.moreMine, 2);
    equal(moreMineText(1), 'ועוד 1 לטיפולך');
    equal(moreMineText(0), null);
  }),
  test('אין מה לעשות — «ממתין ל…» לאחד, לשניים ול-3 ומעלה; הכול נעול — «בהמשך»', () => {
    equal(groupWaitingState(['client'], false, names).text, 'ממתין להדסה');
    equal(groupWaitingState(['client', 'spouse'], false, names).text, 'ממתין להדסה ולרותם');
    equal(groupWaitingState(['client', 'spouse', 'authority'], false, names).text, 'ממתין ל-3 גורמים');
    equal(groupWaitingState([], true, names).text, 'בהמשך');
    const ctx = ctxWith({ niExecution: { spouse: { referenceNumber: '2', instructionsSentAt: '2026-09-01' } } });
    const row = requestRows([rep(), ni('ni-s', 'spouse', {}, 'waiting_client')], ctx)[0];
    const sum = rowSummary(row, ctx);
    equal(sum.lead, null);
    deepEqual(sum.waitingOn, ['client', 'spouse']);
    const locked = buildClientFacingRows([
      st({ id: 'l1', stepType: 'paperless_invite', status: 'locked', ball: 'client' }),
      st({ id: 'l2', stepType: 'paperless_connection', status: 'locked', ball: 'me' }),
    ])[0];
    const ls = summarizeRow(locked, s => stepAttention(s));
    assert(ls.allLocked, 'allLocked');
    equal(ls.attn.waitingOn, 'locked');
  }),
  test('פייפרלס: החלק השני שדורש אותך עולה לשורה (לא נבלע באפור של ההזמנה)', () => {
    const inv = st({ id: 'inv', stepType: 'paperless_invite', status: 'waiting_client', ball: 'client' });
    const con = st({ id: 'con', stepType: 'paperless_connection', status: 'pending', ball: 'me' });
    const row = buildClientFacingRows([inv, con])[0];
    equal(row.primary.id, 'inv');
    const sum = summarizeRow(row, s => stepAttention(s));
    equal(sum.lead?.id, 'con');
    equal(sum.attn.kind, 'mine');
    equal(countRequestsNeedingMe([inv, con]), 1);
  }),
  test('רו״ח קודם: המכתב נחתם והחומרים בדרך ⇒ «ממתין לרו״ח הקודם», לא «הושלם»', () => {
    const rel = st({ id: 'rel', stepType: 'release_letter', status: 'completed', ball: 'me' });
    const mat = st({ id: 'mat', stepType: 'materials_received', status: 'waiting_client', ball: 'prev_accountant', dependsOnStepId: 'rel' });
    const row = buildClientFacingRows([rel, mat])[0];
    equal(row.primary.id, 'rel');
    const sum = summarizeRow(row, s => stepAttention(s));
    assert(rowNeedsGroupState(row, sum), 'הראשי סגור ⇒ מצב קבוצה');
    equal(groupWaitingState(sum.waitingOn, sum.allLocked, names).text, 'ממתין לרו״ח הקודם');
    equal(sum.attn.kind, 'waiting');
  }),
  test('שורה רגילה (חלק אחד) — בדיוק המצב של החלק', () => {
    const d = st({ id: 'd', stepType: 'client_documents', status: 'waiting_client', ball: 'client' });
    const row = buildClientFacingRows([d])[0];
    const sum = summarizeRow(row, s => stepAttention(s));
    deepEqual(sum.attn, stepAttention(d));
    assert(!rowNeedsGroupState(row, sum), 'לא קבוצה');
    deepEqual(rowParts(row).map(s => s.id), ['d']);
  }),

  // ── התג סופר תהליכים ────────────────────────────────────────────────────────
  test('התג: ייצוג עם שני חלקים שדורשים אותך = 1; ב"ל לבד = 1; פייפרלס עם שניים = 1', () => {
    const ctx = ctxWith({ repStatus: 'awaiting_accountant' });
    equal(countRequestsNeedingMe([rep('in_progress'), ni('a', 'client'), ni('b', 'spouse')], ctx), 1);
    equal(countRequestsNeedingMe([ni('a', 'client')], ctxWith()), 1);
    const inv = st({ id: 'inv', stepType: 'paperless_invite', status: 'pending', ball: 'client', needsAttention: true });
    const con = st({ id: 'con', stepType: 'paperless_connection', status: 'pending', ball: 'me' });
    equal(countRequestsNeedingMe([inv, con]), 1);
  }),
  test('ב"ל: אסמכתא שתצא עם בקשת החתימה — ממתינים, לא «שלח הוראות» (כמו מרכז הייצוג)', () => {
    const track = { enteredAt: '2026-09-01', referenceNumber: '75', deadline: '2099-01-01' };
    const a = stepAttention(ni('a', 'client'), ctxWith({ repStatus: 'pending_fill', niExecution: { client: track } }));
    equal(a.kind, 'waiting');
    const sent = stepAttention(ni('a', 'client'), ctxWith({ repStatus: 'pending_signature', niExecution: { client: track } }));
    equal(sent.kind, 'mine', 'מייל החתימה כבר יצא ⇒ שולחים בנפרד');
    const unsent = stepAttention(ni('a', 'client'), ctxWith({ repStatus: 'pending_signature', repSendPhase: 'unsent', niExecution: { client: track } }));
    equal(unsent.kind, 'waiting');
    const m = authRepRowModel({ open: true, first: 'הדסה', tone: 'gray', track, missing: [], ridesWithSignature: true });
    assert(m.withSignature && !m.readyToSend, 'withSignature');
    equal(m.primary, null);
    equal(m.state?.text, 'יוצא עם החתימה');
    deepEqual(stepAttention(rep(), ctxWith({ repSendPhase: 'unsent' })), { kind: 'mine', tone: 'blue' }, 'טופס מוכן ומייל לא יצא — אצלך');
  }),
  test('authRepRowModel: הזנה, שליחה, נשלח, פג, PIVO עובד/נתקע', () => {
    const today = '2026-10-03';
    equal(authRepRowModel({ open: true, first: 'א', tone: 'blue', missing: [], today }).primary?.label, 'הזן בב״ל');
    const ready = authRepRowModel({ open: true, first: 'א', tone: 'blue', missing: [], today, track: { referenceNumber: '1', deadline: '2026-11-01' } });
    equal(ready.primary?.kind, 'send');
    const sent = authRepRowModel({ open: true, first: 'א', tone: 'gray', missing: [], today, track: { referenceNumber: '1', instructionsSentAt: '2026-10-01' } });
    equal(sent.state?.text, 'ממתין לא'); equal(sent.autoAction?.kind, 'check_btl'); equal(sent.primary, null);
    const expired = authRepRowModel({ open: true, first: 'א', tone: 'red', missing: [], today, track: { referenceNumber: '1', deadline: '2026-09-01' } });
    equal(expired.state?.text, 'האסמכתא פגה'); equal(expired.primary?.label, 'הזן מחדש');
    equal(authRepRowModel({ open: true, first: 'א', tone: 'gray', missing: [], today, job: { status: 'running' } }).state?.text, 'PIVO עובד');
    equal(authRepRowModel({ open: true, first: 'א', tone: 'red', missing: [], today, track: { referenceNumber: '1' }, job: { status: 'needs_human' } }).state?.text, 'PIVO נתקע');
    equal(authRepRowModel({ open: false, first: 'א', tone: 'gray', missing: ['x'] }).primary, null, 'סגור — בלי פעולה');
  }),
  test('שורות קריאה בלבד ושמות בפירוט «לפי רשות ואדם»', () => {
    equal(niTrackLine(undefined, 'הדסה'), null);
    equal(niTrackLine({ referenceNumber: '9' }, 'הדסה', { ridesWithSignature: true }), 'אסמכתא 9 · ההוראות יוצאות עם בקשת החתימה');
    equal(niTrackLine({ referenceNumber: '9', instructionsSentAt: 'x' }, 'הדסה'), 'ממתין לאישור של הדסה');
    equal(niTrackLine({ confirmedAt: 'x' }, 'הדסה'), 'אושר');
    equal(taxAuthorityScopeLine({ incomeTax: { status: 'in_process' }, vat: { status: 'active' }, nationalInsurance: { status: 'in_process' } }), 'רשות המסים · מס הכנסה, מע״מ');
    equal(taxAuthorityScopeLine(undefined), 'רשות המסים');
    equal(representationPartLabel(shaam('x', 'spouse'), names), 'צילום תעודה לרשות המסים · רותם');
  }),

  // ── «לא נוצרה» ──────────────────────────────────────────────────────────────
  test('«לא נוצרה»: אדום, נספר פעם אחת, תקוע, ראשון ב«מה עכשיו», ולא «עבודה פנימית»', () => {
    const pr = problem('pr');
    const docs = st({ id: 'd', stepType: 'client_documents', status: 'waiting_client', ball: 'client' });
    deepEqual(stepAttention(pr), { kind: 'mine', tone: 'red' });
    equal(countRequestsNeedingMe([pr, docs]), 1);
    assert(hasRedRequest([pr]), 'red');
    assert(isStuckStep(pr), 'stuck');
    const own = st({ id: 'o', stepType: 'custom_request', status: 'pending', ball: 'me', payload: { internalTask: true, title: 'משימה' } });
    equal(nextStepForClient([own, docs, pr])?.id, 'pr');
    equal(nextActionText(pr), 'לטפל בבקשה שלא נוצרה');
    assert(isManualInternal(pr), 'סימון פנימי (לא בדף) — אבל השורה ברשימה הראשית');
    equal(requestRows([pr]).length, 1);
  }),

  // ── משימות פנימיות ישנות (216 §9) ──────────────────────────────────────────
  test('משימה פנימית: מסומנת עם כדור אצל הלקוח — עדיין פנימית; כדור אצלי עם פריטים — בקשה (לבדיקה)', () => {
    const waitingTask = st({ stepType: 'custom_request', status: 'waiting_client', ball: 'client', payload: { internalTask: true, title: 'x' } });
    assert(isManualInternal(waitingTask), 'marked + ball client ⇒ internal');
    equal(stepAttention(waitingTask).kind, 'internal');
    equal(stepAttention(waitingTask).waitingOn, 'client');
    const doneByClient = st({ stepType: 'custom_request', status: 'in_progress', ball: 'me', needsAttention: true,
      payload: { requirements: [{ key: 'f', kind: 'file', label: 'x', done: true }] } });
    assert(!isManualInternal(doneByClient), 'items ⇒ not internal');
    equal(stepAttention(doneByClient).kind, 'mine');
    assert(isManualInternal(st({ stepType: 'custom_request', status: 'pending', ball: 'me', payload: { title: 'x' } })), 'ball me, no content ⇒ internal');
    equal(rowStateFor({ kind: 'internal', tone: 'gray', status: 'pending' }).text, 'פתוחה');
    // ‼ משימה פנימית אינה «ממתין לשרון» — שרון לא רואה אותה. המשרד שם אותה בהמתנה.
    equal(rowStateFor({ kind: 'internal', tone: 'gray', waitingOn: 'client', status: 'waiting_client', clientFirstName: 'שרון' }).text, 'בהמתנה');
  }),
  test('משימה ישנה לבדיקה: לא פנימית, דורשת החלטה; «הסתר מהדף» הופך אותה לפנימית', () => {
    const review = st({ stepType: 'custom_request', status: 'waiting_client', ball: 'client', payload: { title: 'x', internalTaskReview: true } });
    assert(isLegacyInternalReview(review), 'review');
    assert(!isManualInternal(review), 'not internal');
    equal(stepAttention(review).kind, 'mine');
    const hidden = { ...review, payload: { title: 'x', internalTask: true } };
    assert(!isLegacyInternalReview(hidden) && isManualInternal(hidden), 'after hide');
    const withItems = { ...review, payload: { ...review.payload, requirements: [{ key: 'a', kind: 'file', label: 'x', done: false }] } };
    assert(!isLegacyInternalReview(withItems), 'with content — a real request');
  }),
  test('hasClientContent — התאום של _payload_has_client_content', () => {
    assert(!hasClientContent({}), 'empty');
    assert(!hasClientContent({ title: 'x', clientTitle: 'x', internalTask: true }), 'title only');
    assert(hasClientContent({ requirements: [{ key: 'a' }] }), 'requirements');
    assert(hasClientContent({ checklist: [{ key: 'a' }] }), 'checklist');
    assert(hasClientContent({ clientLinkUrl: ' https://x ' }), 'link');
    assert(!hasClientContent({ clientLinkUrl: '  ' }), 'blank link');
    assert(hasClientContent({ messageOnly: 'true' }), 'message');
    assert(hasClientContent({ externalParty: { kind: 'other' } }), 'external');
    assert(!hasClientContent({ externalParty: null }), 'external null');
    assert(hasClientContent({ guideKey: 'g' }), 'guide');
    assert(hasClientContent({ shaamIdentity: {} }), 'shaam');
  }),
  test('«בדף מ-…» רק על מה שבאמת בדף: לא משימה פנימית ולא טיוטה', () => {
    const pub = '2026-09-20T08:00:00Z';
    const req = st({ stepType: 'custom_request', status: 'waiting_client', ball: 'client', publishedAt: pub, payload: { requirements: [{ key: 'a', kind: 'file', label: 'x', done: false }] } });
    equal(onClientPageSince(req, stepAttention(req), false), pub);
    equal(onClientPageSince(req, stepAttention(req), true), null, 'draft');
    const internal = { ...req, payload: { title: 'x', internalTask: true } };
    assert(neverOnClientPage(internal), 'internal');
    equal(onClientPageSince(internal, { kind: 'waiting', tone: 'gray', waitingOn: 'client' }, false), null);
  }),
  test('עריכה: מי מטפל — לפי הסימון, לא לפי הכדור', () => {
    equal(editOwnerOf(st({ stepType: 'custom_request', status: 'in_progress', ball: 'me',
      payload: { requirements: [{ key: 'a', kind: 'file', label: 'x', done: true }] } })), 'client');
    equal(editOwnerOf(st({ stepType: 'custom_request', status: 'waiting_client', ball: 'client', payload: { internalTask: true } })), 'me');
    equal(editOwnerOf(st({ stepType: 'custom_request', status: 'pending', ball: 'external', payload: { externalParty: { kind: 'other' } } })), 'external');
  }),
];

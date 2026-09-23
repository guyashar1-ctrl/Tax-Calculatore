// ─── בדיקות: הייצוג מול שע״ם ─────────────────────────────────────────────────
// ‼ מה שנבדק כאן הוא בדיוק מה שאסור שיישבר בשקט: איזה מערך נבחר בשע״ם,
// מה חוסם פנייה חיצונית, איך נקרא המצב שחוזר, ומאיפה ממשיכים אחרי כישלון.

import type {
  AuthorityRepresentations, Client, RepresentationRequest, RepTarget,
} from '../../../types';
import { test, equal, deepEqual, assert, includes, excludes } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  shaamSubmissionsOf, shaamSystemsOf, preflightShaamSubmission,
  parseShaamRequestState, parseShaamSystemState, parseShaamDate,
  shaamStageOf, allSystemsAccepted, shaamProgressLine,
  buildForm2279Fields, form2279BothSign, FORM_2279_TEMPLATE, matchRegisteredPersonName,
  shaamRowsFormOneRequest,
  type ShaamRequestTracking,
} from '../shaamRepresentation';
import { shaamPersonFacts, shaamBirthDateInput } from '../shaamPersonFacts';
import { shaamRepresentationAction } from '../../taxFile/shaamRepresentationAction';
import { peopleFromClient } from '../../../utils/repScope';
import { allDocumentsStamped } from '../../../utils/repDocuments';

// ‼ 201: קריאה של שע״ם נחשבת ראיה אחרי ההגשה רק כשנעשתה אחריה.
const SUBMITTED = '2026-09-23T20:42:35Z';
const OBSERVED = '2026-09-23T20:43:10Z';

function hadassaTracking(): ShaamRequestTracking {
  const row = (systemLabel: string, fileNumber: string) => ({
    systemLabel, fileNumber, repType: 'ראשי', enteredAt: '23/09/2026', clientName: 'סלע הדסה',
    requestNumber: '', rawSystemState: '', rawRequestState: 'המתנה למסמכים',
  });
  return {
    syncedAt: '2026-09-23T14:50:03Z', requestNumber: '', rawRequestState: 'המתנה למסמכים',
    systems: [row('מס הכנסה', '034605212'), row('מעמ', '034605212'), row('ניכויים', 'לא קיים תיק')],
  };
}

// ── מכונות עזר ──────────────────────────────────────────────────────────────

function client(over: Partial<Client> = {}): Client {
  return {
    id: 'c1', firstName: 'הדסה', lastName: 'סלע', idNumber: '034605212',
    birthDate: '1985-10-30', phone: '0524409230', email: 'hadassa@example.test',
    familyStatus: 'single', spouseName: '', spouseIdNumber: '',
    spouseWorking: false, spouseIncome: 0, spouse: null,
    taxFiles: [],
    ...over,
  } as unknown as Client;
}

function request(over: Partial<RepresentationRequest> = {}): RepresentationRequest {
  return {
    id: 'r1', linkedClientId: 'c1', clientName: 'הדסה סלע', clientEmail: 'hadassa@example.test',
    authorities: [], requestedDocs: [], notes: '', status: 'awaiting_accountant',
    createdAt: '', updatedAt: '', submission: null, submittedAt: null,
    partB: null, signedPdfStoredId: null, ocrExtracted: null,
    identification: {
      idNumber: '034605212', birthDate: '1985-10-30',
      secondaryType: 'parentId', secondaryValue: '067574996',
      phone: '0524409230', email: 'hadassa@example.test',
      familyStatus: 'single',
    },
    ...over,
  } as unknown as RepresentationRequest;
}

const scope = (o: AuthorityRepresentations): AuthorityRepresentations => o;
const IT = { status: 'in_process' as const };
const active = (targets?: RepTarget[]) => ({ status: 'in_process' as const, ...(targets ? { targets } : {}) });

/** לקוח נשוי עם בן זוג — ברירת המחדל של רוב המקרים כאן. */
function married(over: Partial<Client> = {}): Client {
  return client({
    familyStatus: 'married', spouseName: 'יאיר סלע',
    spouseFirstName: 'יאיר', spouseLastName: 'סלע', spouseIdNumber: '036693828',
    ...over,
  });
}

function marriedRequest(over: Partial<RepresentationRequest> = {}): RepresentationRequest {
  const base = request();
  return {
    ...base,
    identification: {
      ...base.identification,
      familyStatus: 'married',
      spouseName: 'יאיר סלע', spouseFirstName: 'יאיר', spouseLastName: 'סלע',
      spouseIdNumber: '036693828', spouseBirthDate: '1985-01-01',
      spouseSecondaryType: 'parentId', spouseSecondaryValue: '011111118',
    },
    ...over,
  } as RepresentationRequest;
}

function subFor(req: RepresentationRequest, c: Client, target: RepTarget, owner?: RepTarget) {
  const subs = shaamSubmissionsOf(req, c, owner, peopleFromClient(c));
  const s = subs.find(x => x.target === target);
  assert(s, `no submission for ${target}`);
  return s;
}

// ── 1–5: מצב משפחתי ופרטי בן/בת הזוג ────────────────────────────────────────

export const TESTS: TestCase[] = [
  test('1 · לקוח רווק: הגשה אחת, בלי דרישת טלפון בן/בת זוג', () => {
    const c = client();
    const req = request({ scope: scope({ incomeTax: IT }) });
    const subs = shaamSubmissionsOf(req, c, undefined, peopleFromClient(c));
    equal(subs.length, 1);
    equal(subs[0].target, 'client');
    const facts = shaamPersonFacts(req, c, 'client');
    const pre = preflightShaamSubmission(subs[0], facts, c, false);
    assert(pre.ok, `preflight should pass: ${pre.issues.map(i => i.code).join()}`);
    equal(form2279BothSign(subs[0], false), false);
  }),

  test('2 · לקוח נשוי עם טלפון ומייל לבן/בת הזוג — עובר', () => {
    const c = married({ spousePhone: '0501234567', spouseEmail: 'yair@example.test' });
    const req = marriedRequest({ scope: scope({ incomeTax: IT }) });
    const s = subFor(req, c, 'client', 'client');
    const facts = shaamPersonFacts(req, c, 'client');
    equal(facts.spousePhone, '0501234567');
    const pre = preflightShaamSubmission(s, facts, c, true);
    assert(pre.ok, `preflight should pass: ${pre.issues.map(i => i.code).join()}`);
  }),

  test('3 · לקוח נשוי ותיק בלי טלפון/מייל לבן/בת הזוג — השדות ריקים, לא מומצאים', () => {
    const c = married();
    const req = marriedRequest({ scope: scope({ incomeTax: IT }) });
    const facts = shaamPersonFacts(req, c, 'client');
    equal(facts.spousePhone, '', 'אסור ליפול לטלפון של הנישום');
    equal(shaamPersonFacts(req, c, 'spouse').email, '', 'אסור ליפול למייל של הנישום');
  }),

  test('4 · חסר טלפון בן/בת זוג כששע״ם מבקש אותו — עצירה עם הודעה מפורשת', () => {
    const c = married();
    const req = marriedRequest({ scope: scope({ incomeTax: IT }) });
    const s = subFor(req, c, 'client', 'client');
    const pre = preflightShaamSubmission(s, shaamPersonFacts(req, c, 'client'), c, true);
    equal(pre.ok, false);
    includes(pre.issues.map(i => i.code), 'missing_spouse_phone');
    assert(pre.issues.some(i => i.message.includes('טלפון של בן/בת הזוג')), 'הודעה בעברית ברורה');
  }),

  test('5 · חסרים פרטי התקשרות לגמרי — נחסם', () => {
    const c = client({ phone: '', email: '' });
    const req = request({ scope: scope({ incomeTax: IT }), clientEmail: '', identification: { idNumber: '034605212', birthDate: '1985-10-30', secondaryType: 'parentId', secondaryValue: '067574996' } } as Partial<RepresentationRequest>);
    const s = subFor(req, c, 'client');
    const pre = preflightShaamSubmission(s, shaamPersonFacts(req, c, 'client'), c, false);
    equal(pre.ok, false);
    includes(pre.issues.map(i => i.code), 'missing_contact');
  }),

  // ── 6–10: מיפוי המערכים ───────────────────────────────────────────────────

  test('6 · רק מס הכנסה התבקש — רק מס הכנסה נבחר בשע״ם', () => {
    const c = client();
    const req = request({ scope: scope({ incomeTax: IT }) });
    const s = subFor(req, c, 'client');
    deepEqual(shaamSystemsOf(s), ['incomeTax']);
  }),

  test('7 · מס הכנסה + מע"מ', () => {
    const c = client();
    const req = request({ scope: scope({ incomeTax: IT, vat: active(['client']) }) });
    const s = subFor(req, c, 'client');
    deepEqual(shaamSystemsOf(s), ['incomeTax', 'vat']);
  }),

  test('8 · מס הכנסה + מע"מ + ביטוח לאומי — שע״ם מקבלת מ"ה ומע"מ בלבד', () => {
    const c = married({ spousePhone: '0501234567' });
    const req = marriedRequest({
      scope: scope({ incomeTax: IT, vat: active(['client']), nationalInsurance: active(['client', 'spouse']) }),
    });
    const s = subFor(req, c, 'client', 'client');
    const systems = shaamSystemsOf(s);
    deepEqual(systems, ['incomeTax', 'vat']);
    excludes(systems, 'withholding', 'ניכויים לא התבקש ואסור שייבחר');
    assert(!(systems as string[]).includes('nationalInsurance'), 'ב"ל אינו מערך בשע״ם');
  }),

  test('9 · ניכויים התבקש במפורש — נבחר', () => {
    const c = client();
    const req = request({ scope: scope({ incomeTax: IT, withholding: active(['client']) }) });
    const s = subFor(req, c, 'client');
    includes(shaamSystemsOf(s), 'withholding');
  }),

  test('10 · ניכויים לא התבקש — לעולם לא נבחר', () => {
    const c = client();
    const req = request({ scope: scope({ incomeTax: IT, vat: active(['client']) }) });
    const s = subFor(req, c, 'client');
    excludes(shaamSystemsOf(s), 'withholding');
  }),

  test('10ב · רק ביטוח לאומי התבקש — אין בכלל הגשה בשע״ם', () => {
    const c = married();
    const req = marriedRequest({ scope: scope({ nationalInsurance: active(['client', 'spouse']) }) });
    equal(shaamSubmissionsOf(req, c, undefined, peopleFromClient(c)).length, 0);
  }),

  test('10ג · מע"מ של בן/בת הזוג — הגשה שנייה על ת.ז. שלו/ה', () => {
    const c = married({ spousePhone: '0501234567' });
    const req = marriedRequest({ scope: scope({ incomeTax: IT, vat: active(['spouse']) }) });
    const subs = shaamSubmissionsOf(req, c, 'client', peopleFromClient(c));
    equal(subs.length, 2);
    const sp = subs.find(x => x.target === 'spouse');
    assert(sp, 'spouse submission');
    deepEqual(shaamSystemsOf(sp), ['vat']);
    const facts = shaamPersonFacts(req, c, 'spouse');
    equal(facts.idNumber, '036693828');
    const pre = preflightShaamSubmission(sp, facts, c, true);
    equal(pre.fileNumbers.vat, '036693828', 'מספר תיק המע"מ הוא הת.ז. של בעל ההגשה');
  }),

  test('10ד · מספר תיק מהכרטיס גובר על הת.ז.', () => {
    const c = client({ taxFiles: [{ id: 'f1', authority: 'vat', fileNumber: '557788991', owner: 'client', repStatus: 'none' }] } as Partial<Client>);
    const req = request({ scope: scope({ vat: active(['client']) }) });
    const s = subFor(req, c, 'client');
    const pre = preflightShaamSubmission(s, shaamPersonFacts(req, c, 'client'), c, false);
    equal(pre.fileNumbers.vat, '557788991');
  }),

  test('10ה · ניכויים בלי תיק בכרטיס — נעצר, לא ממציא אפסים', () => {
    const c = client();
    const req = request({ scope: scope({ withholding: active(['client']) }) });
    const s = subFor(req, c, 'client');
    const pre = preflightShaamSubmission(s, shaamPersonFacts(req, c, 'client'), c, false);
    equal(pre.ok, false);
    includes(pre.issues.map(i => i.code), 'missing_file_number_withholding');
    equal(pre.fileNumbers.withholding, '');
  }),

  // ── 11–12: אימות ישות ──────────────────────────────────────────────────────

  test('11 · חסר אמצעי זיהוי נוסף — עוצרים לפני שנוגעים בשע״ם', () => {
    const c = client();
    const req = request({
      scope: scope({ incomeTax: IT }),
      identification: { idNumber: '034605212', birthDate: '1985-10-30', phone: '05', email: 'a@b.test' },
    } as Partial<RepresentationRequest>);
    const s = subFor(req, c, 'client');
    const pre = preflightShaamSubmission(s, shaamPersonFacts(req, c, 'client'), c, false);
    equal(pre.ok, false);
    includes(pre.issues.map(i => i.code), 'missing_secondary_identity');
  }),

  test('12 · חסר תאריך לידה — עוצרים (אין ניסיון אימות עיוור)', () => {
    const c = client({ birthDate: '' });
    const req = request({
      scope: scope({ incomeTax: IT }),
      identification: { idNumber: '034605212', secondaryType: 'parentId', secondaryValue: '067574996', email: 'a@b.test' },
    } as Partial<RepresentationRequest>);
    const s = subFor(req, c, 'client');
    const pre = preflightShaamSubmission(s, shaamPersonFacts(req, c, 'client'), c, false);
    equal(pre.ok, false);
    includes(pre.issues.map(i => i.code), 'missing_birth_date');
  }),

  test('12ב · תאריך לידה מומר לתבנית של שע״ם', () => {
    equal(shaamBirthDateInput('1985-10-30'), '30101985');
    equal(shaamBirthDateInput(undefined), '');
  }),

  // ── 16–18, 27: אידמפוטנטיות והמשך בטוח ────────────────────────────────────

  test('16 · קיימת כבר בקשה בשע״ם — הפעולה הבאה אינה «צור», אלא «שדר»', () => {
    const t: ShaamRequestTracking = { requestNumber: '2026538930', formDocumentId: 'poa-1' };
    equal(shaamStageOf(t), 'form_fetched');
    const a = shaamRepresentationAction('awaiting_stamp', t, true);
    equal(a?.kind, 'submit');
  }),

  test('17 · לפני שנבדק בשע״ם — «בדוק»; אחרי בדיקה שלא מצאה — «צור»; עם מספר בקשה — לעולם לא «צור» שוב', () => {
    // ‼ 23.09.2026 · תיקון: אסור להציע «צור» לפני שבדקו שהבקשה לא כבר קיימת
    // בשע״ם (למשל הוזנה ידנית) — אחרת נוצרת בקשה כפולה.
    equal(shaamRepresentationAction('awaiting_accountant', undefined, false)?.kind, 'check');
    equal(shaamStageOf(undefined), 'none');
    const notFound: ShaamRequestTracking = { syncedAt: '2026-09-23T13:00:00Z' };
    equal(shaamRepresentationAction('awaiting_accountant', notFound, false)?.kind, 'create');
    const t: ShaamRequestTracking = { requestNumber: '2026538930' };
    equal(shaamStageOf(t), 'request_created');
    const a = shaamRepresentationAction('awaiting_accountant', t, false);
    assert(a?.kind !== 'create', 'אסור להציע יצירה כשכבר יש בקשה');
  }),

  test('18 · הטופס כבר שודר ואושר — לא מציעים שידור נוסף', () => {
    const t: ShaamRequestTracking = { requestNumber: '2026538930', formDocumentId: 'poa-1', submittedAt: '2026-09-23T10:00:00Z' };
    equal(shaamStageOf(t), 'submitted');
    const a = shaamRepresentationAction('awaiting_authorities', t, true);
    equal(a?.kind, 'check');
  }),

  test('18ב · טופס שטרם הוחתם — «שדר» מושבת עם סיבה', () => {
    const t: ShaamRequestTracking = { requestNumber: '2026538930', formDocumentId: 'poa-1' };
    const a = shaamRepresentationAction('pending_signature', t, false);
    equal(a?.kind, 'submit');
    equal(a?.disabled, true);
    assert((a?.reason ?? '').includes('טרם נחתם'), 'סיבה מפורשת');
  }),

  test('27 · המשך בטוח אחרי כשל ביניים — השלב נגזר מהעובדות', () => {
    equal(shaamStageOf({ requestNumber: 'x' }), 'request_created');
    equal(shaamStageOf({ requestNumber: 'x', formDocumentId: 'd' }), 'form_fetched');
    equal(shaamStageOf({ requestNumber: 'x', formDocumentId: 'd', submittedAt: 't' }), 'submitted');
    equal(shaamStageOf({
      requestNumber: 'x', formDocumentId: 'd', submittedAt: SUBMITTED, observedAt: OBSERVED,
      systems: [{ systemLabel: 'מס הכנסה', rawSystemState: 'נקלט בהצלחה' }],
    }), 'active');
  }),

  // ── 20–25: מצבי שע״ם ──────────────────────────────────────────────────────

  test('20 · המתנה למסמכים', () => {
    equal(parseShaamRequestState('המתנה למסמכים'), 'awaiting_documents');
  }),

  test('21 · מסמכים בטעינה / התקבלו / אושרו', () => {
    equal(parseShaamRequestState('מסמכים בטעינה'), 'documents_uploading');
    equal(parseShaamRequestState('התקבלו המסמכים'), 'documents_received');
    equal(parseShaamRequestState('מסמכים אושרו'), 'documents_approved');
    equal(parseShaamRequestState('משהו חדש לגמרי'), 'unknown');
  }),

  test('22 · ממתין לאישור לקוח — הכדור אצל הלקוח', () => {
    equal(parseShaamSystemState('ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק'), 'awaiting_client_approval');
    const line = shaamProgressLine({
      requestNumber: 'x', submittedAt: SUBMITTED, observedAt: OBSERVED,
      systems: [{ systemLabel: 'מס הכנסה', rawSystemState: 'ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק' }],
    });
    equal(line.ball, 'client');
  }),

  test('23 · השהיה לקליטה + מועד סיום', () => {
    equal(parseShaamSystemState('השהיה'), 'suspended');
    equal(parseShaamDate('24/09/2026'), '2026-09-24');
    equal(parseShaamDate('ממתין לאישור לקוח'), undefined);
    const line = shaamProgressLine({
      requestNumber: 'x', submittedAt: SUBMITTED, observedAt: OBSERVED,
      systems: [{ systemLabel: 'מס הכנסה', rawSystemState: 'השהיה', suspensionEndsRaw: '24/09/2026' }],
    });
    equal(line.ball, 'authority');
    equal(line.until, '2026-09-24');
  }),

  test('24 · תיק פעיל — כל המערכים נקלטו', () => {
    equal(parseShaamSystemState('נקלט בהצלחה'), 'accepted');
    const t: ShaamRequestTracking = {
      requestNumber: 'x', submittedAt: SUBMITTED, observedAt: OBSERVED,
      systems: [
        { systemLabel: 'מס הכנסה', rawSystemState: 'נקלט בהצלחה' },
        { systemLabel: 'מעמ', rawSystemState: 'נקלט בהצלחה' },
      ],
    };
    equal(allSystemsAccepted(t), true);
    equal(shaamProgressLine(t).ball, 'done');
  }),

  test('25 · ממתין לפתיחת תיק — לא כישלון', () => {
    equal(parseShaamSystemState('ממתין לפתיחת התיק'), 'awaiting_file_opening');
    const t: ShaamRequestTracking = {
      requestNumber: 'x', submittedAt: SUBMITTED, observedAt: OBSERVED,
      systems: [
        { systemLabel: 'מס הכנסה', rawSystemState: 'נקלט בהצלחה' },
        { systemLabel: 'ניכויים', rawSystemState: 'ממתין לפתיחת התיק' },
      ],
    };
    equal(allSystemsAccepted(t), false, 'לא הכול נקלט');
    equal(shaamProgressLine(t).ball, 'authority');
    assert(!shaamProgressLine(t).text.includes('נכשל'), 'לא מתואר ככישלון');
  }),

  test('25ב · אין ולו מערך אחד שנצפה — לא מכריזים «הכול נקלט»', () => {
    equal(allSystemsAccepted({ requestNumber: 'x', systems: [] }), false);
    equal(allSystemsAccepted({ requestNumber: 'x' }), false);
  }),

  // ── 26: הרשום/ה במס הכנסה ─────────────────────────────────────────────────

  test('26 · האישה היא בת הזוג הרשומה — היא חותמת בתיבת «בן זוג רשום»', () => {
    // מקרה ההדגמה: הדסה (הלקוחה) היא הרשומה, יאיר הוא בן/בת הזוג.
    const fields = buildForm2279Fields('client', true);
    const registered = fields.find(f => f.signerId === 'client');
    const other = fields.find(f => f.signerId === 'spouse');
    assert(registered && other, 'שתי חתימות');
    equal(registered.xPct, FORM_2279_TEMPLATE.registeredSigner.xPct);
    equal(other.xPct, FORM_2279_TEMPLATE.otherSpouse.xPct);
    assert(registered.xPct > other.xPct, 'התיבה של הרשום/ה ימינה מזו של בן/בת הזוג');
  }),

  test('26ב · כשבן/בת הזוג הוא/היא הרשום/ה — התיבות מתחלפות, בלי קשר למגדר', () => {
    const fields = buildForm2279Fields('spouse', true);
    const registered = fields.find(f => f.signerId === 'spouse');
    const other = fields.find(f => f.signerId === 'client');
    assert(registered && other, 'שתי חתימות');
    equal(registered.xPct, FORM_2279_TEMPLATE.registeredSigner.xPct);
    equal(other.xPct, FORM_2279_TEMPLATE.otherSpouse.xPct);
  }),

  test('26ג · רווק/ה — חתימה אחת + חותמת, בלי תיבת בן/בת זוג', () => {
    const fields = buildForm2279Fields('client', false);
    equal(fields.length, 2);
    equal(fields.filter(f => f.kind === 'signature').length, 1);
    equal(fields.filter(f => f.kind === 'stamp').length, 1);
  }),

  test('26ד · חותמת המשרד ממוקמת מתחת לחלק ב\'', () => {
    const stamp = buildForm2279Fields('client', true).find(f => f.kind === 'stamp');
    assert(stamp, 'stamp field');
    equal(stamp.signerId, 'accountant');
    assert(stamp.yPct > 0.6 && stamp.yPct < 0.8, 'באזור החותמת שנמדד על הטופס האמיתי');
  }),

  test('26ז · התבנית נאמנה לשני הסימונים הידניים שנמדדו', () => {
    // ‼ שומר על הקבועים: אלה המיקומים שגיא סימן בפועל על שני טופסי 2279
    // אמיתיים שהופקו בשע״ם (23.09.2026 ו-27.08.2026), כפי שנשמרו ב-
    // representation_requests.signature_documents. הסטייה נמדדת על **מרכזי**
    // התיבות, כי השני נשאר בגודל ברירת המחדל של העורך.
    const center = (b: { xPct: number; yPct: number; widthPct: number; heightPct: number }) =>
      ({ x: b.xPct + b.widthPct / 2, y: b.yPct + b.heightPct / 2 });
    const near = (a: number, b: number, tol: number, what: string) =>
      assert(Math.abs(a - b) <= tol, `${what}: ${a.toFixed(4)} מול ${b.toFixed(4)} (סטייה מותרת ${tol})`);

    // סימון ידני #1 — «ייפוי כח לחתימה הדס וסלע.pdf», 23.09.2026
    const m1sig = center({ xPct: 0.3934938248867116, yPct: 0.5141197691937937, widthPct: 0.1487377943942933, heightPct: 0.03382656485562341 });
    const m1stamp = center({ xPct: 0.09886512564599877, yPct: 0.7129217899296978, widthPct: 0.22514095909038695, heightPct: 0.066606306884761 });
    // סימון ידני #2 — «ייפוי כח שימי.pdf», 27.08.2026 (גודל ברירת מחדל)
    const m2sig = center({ xPct: 0.35845794392523367, yPct: 0.5031678700361011, widthPct: 0.22, heightPct: 0.06 });
    const m2stamp = center({ xPct: 0.15728971962616822, yPct: 0.6916516245487364, widthPct: 0.12, heightPct: 0.1 });

    const tsig = center(FORM_2279_TEMPLATE.registeredSigner);
    const tstamp = center(FORM_2279_TEMPLATE.accountantStamp);
    near(tsig.x, m1sig.x, 0.002, 'חתימת הרשום/ה · X מול סימון 1');
    near(tsig.y, m1sig.y, 0.002, 'חתימת הרשום/ה · Y מול סימון 1');
    near(tsig.x, m2sig.x, 0.01, 'חתימת הרשום/ה · X מול סימון 2');
    near(tsig.y, m2sig.y, 0.01, 'חתימת הרשום/ה · Y מול סימון 2');
    near(tstamp.x, m1stamp.x, 0.002, 'חותמת · X מול סימון 1');
    near(tstamp.y, m1stamp.y, 0.002, 'חותמת · Y מול סימון 1');
    near(tstamp.x, m2stamp.x, 0.01, 'חותמת · X מול סימון 2');
    near(tstamp.y, m2stamp.y, 0.01, 'חותמת · Y מול סימון 2');
  }),

  test('26ח · שתי תיבות החתימה באותו גובה ואינן חופפות', () => {
    const { registeredSigner: a, otherSpouse: b } = FORM_2279_TEMPLATE;
    assert(Math.abs(a.yPct - b.yPct) < 0.01, 'אותה שורת חתימות');
    assert(b.xPct + b.widthPct < a.xPct, 'התיבות אינן חופפות');
    assert(a.xPct + a.widthPct < 0.7, 'לא נכנסות לאזור «תאריך» שמימין');
  }),

  test('26ה · מע"מ בלבד לאדם אחד — טופס של אדם אחד, בלי חתימת בן/בת זוג', () => {
    const c = married({ spousePhone: '0501234567' });
    const req = marriedRequest({ scope: scope({ vat: active(['client']) }) });
    const s = subFor(req, c, 'client');
    equal(form2279BothSign(s, true), false);
  }),

  test('26ו · מס הכנסה אצל זוג נשוי — שני בני הזוג חותמים', () => {
    const c = married({ spousePhone: '0501234567' });
    const req = marriedRequest({ scope: scope({ incomeTax: IT }) });
    const s = subFor(req, c, 'client', 'client');
    equal(form2279BothSign(s, true), true);
  }),

  // ── בן/בת הזוג הרשום/ה — ראיה מ«שם הלקוח» בשע״ם (23.09.2026) ────────────

  test('28 · אדם א׳ (הלקוח/ה) רשום/ה — לא מגדר, לא סדר PIVO', () => {
    equal(matchRegisteredPersonName('סלע הדסה', 'הדסה סלע', 'יאיר סלע'), 'client');
  }),

  test('28ב · אדם ב׳ (בן/בת הזוג) רשום/ה — אותה פונקציה, תוצאה הפוכה', () => {
    equal(matchRegisteredPersonName('סלע יאיר', 'הדסה סלע', 'יאיר סלע'), 'spouse');
  }),

  test('28ג · המקרה האמיתי של הדסה סלע — מתאים ל-client', () => {
    equal(matchRegisteredPersonName('הדסה סלע', 'הדסה סלע', 'יאיר סלע'), 'client');
  }),

  test('28ד · שני השמות מופיעים — מעורפל, לא מוכרעים', () => {
    equal(matchRegisteredPersonName('הדסה סלע ויאיר סלע', 'הדסה סלע', 'יאיר סלע'), 'ambiguous');
  }),

  test('28ה · אף שם לא מופיע — לא מוכרעים, לא מנחשים', () => {
    equal(matchRegisteredPersonName('דנה כהן', 'הדסה סלע', 'יאיר סלע'), 'no_match');
  }),

  test('28ו · טקסט ריק/לא ידוע — לא מוכרעים', () => {
    equal(matchRegisteredPersonName('', 'הדסה סלע', 'יאיר סלע'), 'no_match');
    equal(matchRegisteredPersonName(undefined, 'הדסה סלע', 'יאיר סלע'), 'no_match');
  }),

  test('28ז · שם פרטי לבד אינו מספיק להתאמה — נמנעים מהתאמת-שווא', () => {
    // "הדסה" לבד יכול לשקף לקוחה אחרת עם אותו שם פרטי — דורשים גם משפחה.
    equal(matchRegisteredPersonName('הדסה כהן', 'הדסה סלע', 'יאיר סלע'), 'no_match');
  }),

  test('28ח · בלי בן/בת זוג ידוע/ה — מתאימים רק ללקוח/ה', () => {
    equal(matchRegisteredPersonName('הדסה סלע', 'הדסה סלע', null), 'client');
    equal(matchRegisteredPersonName('יאיר סלע', 'הדסה סלע', null), 'no_match');
  }),
  // ── 29 · נמצאה בשע״ם בלי מספר בקשה — הצורה האמיתית של הדסה סלע (23.09.2026) ──
  // ‼ «בדוק» ייחס שורות לבקשה, אבל מספר הבקשה לא נחשף ב-DOM. הבקשה קיימת,
  // ולכן לעולם לא «צור» (אימות ישות חוזר), ולא «טרם נפתחה».

  // השורות כפי שנקראו בפועל משע״ם (הדסה סלע, 23.09.2026): שלוש שורות, אותו
  // יום הזנה ואותו מצב בקשה, בלי מספר בקשה.
  // (הפונקציה, ולא קבוע: TESTS נבנה לפני שהקוד שמתחת רץ.)

  test('29 · שורות משויכות בלי מספר בקשה — הבקשה קיימת; לא «צור», לא «טרם נפתחה»', () => {
    const t = hadassaTracking();
    equal(shaamStageOf(t), 'request_created');
    const a = shaamRepresentationAction('awaiting_accountant', t, false);
    assert(a?.kind !== 'create', 'אסור להציע יצירה על בקשה קיימת');
    const line = shaamProgressLine(t).text;
    assert(!line.includes('טרם נפתחה'), 'לא «טרם נפתחה» כשנמצאו שורות');
    assert(!line.includes('()'), 'אין סוגריים ריקים במקום מספר');
    assert(line.includes('נמצאה ברשימת הבקשות'), line);
  }),

  test('29ב · טופס חתום + בקשה שיוחסה בלי מספר — «שלח טופס חתום לשע״ם» פעיל', () => {
    const a = shaamRepresentationAction('awaiting_stamp', hadassaTracking(), true);
    equal(a?.kind, 'submit');
    equal(a?.actionType, 'shaam.submit_poa');
    equal(a?.disabled, undefined);
    equal(shaamRowsFormOneRequest(hadassaTracking()), true);
  }),

  test('29ג · אין טופס חתום סופי (חתימה חסרה / חותמת חסרה) — «שלח» מושבת עם סיבה', () => {
    const a = shaamRepresentationAction('awaiting_stamp', hadassaTracking(), false);
    equal(a?.kind, 'submit');
    equal(a?.disabled, true);
    assert((a?.reason ?? '').includes('טרם נחתם'), a?.reason ?? '');
    // ‼ «חתום» = לכל מסמך יש PDF סופי, שנוצר רק בחדר החותמת אחרי כל החותמים.
    const doc = { key: 'person:client', title: '', pdfDocId: 'p', pdfFileName: 'f.pdf', fields: [], createdAt: '' };
    equal(allDocumentsStamped({ signatureDocuments: [{ ...doc, signedPdfStoredId: null }] } as unknown as RepresentationRequest), false);
    equal(allDocumentsStamped({ signatureDocuments: [{ ...doc, signedPdfStoredId: 'signed-poa-x' }] } as unknown as RepresentationRequest), true);
  }),

  test('29ד · שורות שאינן בקשה אחת — «שלח» מושבת, לא מנחשים', () => {
    const base = hadassaTracking();
    const dupSystem: ShaamRequestTracking = { ...base, systems: [...base.systems!, { ...base.systems![0] }] };
    const twoDates: ShaamRequestTracking = { ...base, systems: [base.systems![0], { ...base.systems![1], enteredAt: '01/08/2026' }] };
    const twoNumbers: ShaamRequestTracking = { ...base, systems: [
      { ...base.systems![0], requestNumber: '2026000001' }, { ...base.systems![1], requestNumber: '2026000002' }] };
    for (const t of [dupSystem, twoDates, twoNumbers]) {
      equal(shaamRowsFormOneRequest(t), false);
      const a = shaamRepresentationAction('awaiting_stamp', t, true);
      equal(a?.kind, 'submit');
      equal(a?.disabled, true);
    }
  }),

  test('29ה · כבר שודר — אין «שלח» נוסף, רק «בדוק»', () => {
    const t = { ...hadassaTracking(), submittedAt: '2026-09-23T19:00:00Z' };
    equal(shaamRepresentationAction('awaiting_authorities', t, true)?.kind, 'check');
  }),

  test('29ו · נבדקה ולא נמצאה שום שורה — רק אז «צור»; «פעיל» עם שורות שטרם נקלטו — «בדוק»', () => {
    equal(shaamRepresentationAction('awaiting_accountant', { syncedAt: 't', systems: [] }, false)?.kind, 'create');
    equal(shaamRepresentationAction('active', hadassaTracking(), false)?.kind, 'check');
  }),

  test('29ז · הדסה בתיבת «בן זוג רשום» בטופס — לפי ההכרעה, לא לפי מגדר או סדר', () => {
    // אזורי החתימה כפי שנשמרו בבקשה האמיתית (23.09.2026).
    const fields = buildForm2279Fields('client', true);
    const at = (signer: string) => fields.find(f => f.signerId === signer)!;
    equal(at('client').xPct, FORM_2279_TEMPLATE.registeredSigner.xPct);
    equal(at('spouse').xPct, FORM_2279_TEMPLATE.otherSpouse.xPct);
    equal(at('accountant').xPct, FORM_2279_TEMPLATE.accountantStamp.xPct);
    equal(matchRegisteredPersonName('סלע הדסה', 'הדסה סלע', 'יאיר סלע'), 'client');
  }),
  test('29ח · המספר נקרא מהבקשה שנפתחה (199) — אותה הודעה עם המספר, לא «נשאר להביא טופס»; «שלח» פעיל', () => {
    const t = { ...hadassaTracking(), requestNumber: '2026538930' };
    const line = shaamProgressLine(t).text;
    assert(line.includes('2026538930') && line.includes('נמצאה ברשימת הבקשות'), line);
    assert(!line.includes('נשאר להביא'), line);
    const a = shaamRepresentationAction('awaiting_stamp', t, true);
    equal(a?.kind, 'submit');
    equal(a?.disabled, undefined);
  }),
];

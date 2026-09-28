// ─── מחזור החיים בשע״ם — מול מה שנצפה במערכת החיה (28.09.2026) ─────────────
// ‼ כל תרחיש כאן הוא שורה אמיתית מ«בקשות בתהליך» (הקודים והטקסט כמו שהם),
// עם שם/ת.ז. בדויים. ההכרעות: קוד 7 = אישור לקוח רק בתיק 91; «פעיל לפי רשות»
// (גיא); הגשה שנעשתה ידנית בשע״ם אינה «טרם שודר».

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { ShaamRequestTracking, ShaamSystemStatus } from '../shaamRepresentation';
import {
  classifyShaamRow, parseShaamSystemState, parseShaamRequestState, shaamSettled, allSystemsAccepted,
  shaamDocumentsInShaam, shaamUploadFailed, shaamUploadDeadline, shaamFileOpeningDeadline, shaamLifecycle,
  shaamRowAuthority, shaamRowRequestState,
} from '../shaamRepresentation';
import { shaamSubmittedFacts } from '../representationCenter';
import { shaamLifecycleStage, shaamRepresentationAction } from '../../taxFile/shaamRepresentationAction';

const OBS = '2026-09-28T05:40:00.000Z';
const row = (r: Partial<ShaamSystemStatus>): ShaamSystemStatus => ({ systemLabel: 'מס הכנסה', fileNumber: '500033345', enteredAt: '12/08/2026', ...r });
const DAN = row({ rawRequestState: 'התקבלו המסמכים', rawSystemState: 'ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק', requestStateCode: 2, systemStateCode: 7, systemCode: 1, suspensionEndsRaw: 'ממתין לאישור לקוח', tik91: true });
const CODE7_OPEN = row({ fileNumber: 'לא קיים תיק', rawSystemState: 'ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק', requestStateCode: 2, systemStateCode: 7, systemCode: 1, suspensionEndsRaw: 'לא בהשהייה', tik91: false, noFile: true });
const IT_OK = row({ enteredAt: '27/08/2026', rawRequestState: 'מסמכים אושרו', rawSystemState: 'נקלט בהצלחה', requestStateCode: 3, systemStateCode: 5, systemCode: 1 });
const VAT_OK = row({ ...IT_OK, systemLabel: 'מעמ', systemCode: 2 });
const WH_NOFILE = row({ enteredAt: '27/08/2026', systemLabel: 'ניכויים', fileNumber: 'לא קיים תיק', rawRequestState: 'מסמכים אושרו', rawSystemState: 'ממתין לפתיחת התיק', requestStateCode: 3, systemStateCode: 1, systemCode: 5, noFile: true });
const SUSP = row({ enteredAt: '23/09/2026', rawRequestState: 'התקבלו המסמכים', rawSystemState: 'השהייה', requestStateCode: 2, systemStateCode: 2, systemCode: 1, suspensionEndsRaw: '06/10/2026' });
const track = (systems: ShaamSystemStatus[], extra: Partial<ShaamRequestTracking> = {}): ShaamRequestTracking =>
  ({ requestNumber: '2026900021', observedAt: OBS, syncedAt: OBS, systems, ...extra });

export const TESTS: TestCase[] = [
  test('קוד 7 · אישור לקוח רק בתיק 91 (פירוט גלוי / «צפי» = «ממתין לאישור לקוח»)', () => {
    equal(classifyShaamRow(DAN), 'awaiting_client_approval');
    equal(classifyShaamRow(CODE7_OPEN), 'awaiting_file_opening');
    // טקסט ישן בלי קודים: המשולב לבדו אינו אישור לקוח; עם ראיה — כן.
    equal(parseShaamSystemState('ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק'), 'awaiting_file_opening');
    equal(classifyShaamRow(row({ rawSystemState: 'ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק', suspensionEndsRaw: 'ממתין לאישור לקוח' })), 'awaiting_client_approval');
    equal(classifyShaamRow(row({ rawSystemState: 'ממתין לאישור לקוח' })), 'awaiting_client_approval');
  }),

  test('מילון · «השהיית מטה» ≠ «השהייה»; «כשל-ממתין לטעינת חוזרת» = טעינה חוזרת; קוד גובר על טקסט', () => {
    equal(classifyShaamRow(row({ rawSystemState: 'השהיית מטה', systemStateCode: 3 })), 'authority_review');
    equal(parseShaamSystemState('השהיית מטה'), 'authority_review');
    equal(parseShaamSystemState('השהייה'), 'suspended');
    equal(parseShaamRequestState('כשל-ממתין לטעינת חוזרת'), 'upload_failed');
    equal(shaamRowRequestState(row({ rawRequestState: 'משהו חדש', requestStateCode: 3 })), 'documents_approved');
    equal(classifyShaamRow(row({ rawSystemState: 'ניסוח חדש לגמרי', systemStateCode: 5 })), 'accepted');
    equal(shaamRowAuthority(row({ systemLabel: 'מעמ' })), 'vat');
    equal(shaamRowAuthority(row({ systemLabel: 'x', systemCode: 5 })), 'withholding');
  }),

  test('«פעיל לפי רשות» (הכרעת גיא): מ"ה+מע"מ נקלטו, ניכויים בלי תיק ⇒ settled; תיק קיים שממתין ⇒ לא', () => {
    const t = track([IT_OK, VAT_OK, WH_NOFILE], { submittedAt: '2026-08-27T10:00:00.000Z' });
    equal(allSystemsAccepted(t), false);
    equal(shaamSettled(t), true);
    equal(shaamLifecycleStage('awaiting_authorities', t, true), 'active');
    const withFile = track([IT_OK, { ...WH_NOFILE, noFile: false, fileNumber: '934567890' }], { submittedAt: '2026-08-27T10:00:00.000Z' });
    equal(shaamSettled(withFile), false);
    equal(shaamSettled(track([WH_NOFILE])), false, 'בלי אף מערך שנקלט — אין ראיה לייצוג');
  }),

  test('«פעיל לפי רשות» · המסך: נקלט במ"ה ובמע"מ; ניכויים «אין תיק» עם מועד הביטול, והכדור «הושלם»', () => {
    const t = track([IT_OK, VAT_OK, WH_NOFILE], { submittedAt: '2026-08-27T10:00:00.000Z' });
    const l = shaamLifecycle(t);
    equal(l.ball, 'done');
    assert(l.headline.includes('מס הכנסה') && l.headline.includes('מעמ'), l.headline);
    const f = shaamSubmittedFacts(t)!;
    equal(f.final, true);
    deepEqual(f.missingFileSystems, [{ label: 'ניכויים', authority: 'withholding', deadline: '2027-02-27' }]);
  }),

  test('הוזן ושודר ידנית בשע״ם (דן רכס): המסמכים אצל שע״ם ⇒ «נשלח», לא «שלח טופס»; ממתין לאישור לקוח', () => {
    const t = track([DAN], { clientApprovalRequiredAt: OBS });
    equal(shaamDocumentsInShaam(t), true);
    equal(shaamLifecycleStage('awaiting_authorities', t, true), 'waiting_client');
    equal(shaamRepresentationAction('awaiting_authorities', t, true)?.kind, 'check');
    const f = shaamSubmittedFacts(t)!;
    deepEqual([f.submittedAt, f.submittedOutside, f.clientApprovalRequired], [undefined, true, true]);
    const l = shaamLifecycle(t);
    assert(!!l.clientAction && l.clientAction.text.includes('אין אפשרות לשלוח את ההודעה שוב'), 'אין «שלח שוב» בשע״ם');
  }),

  test('כשל בטעינה (קוד 6): «שלח שוב» מופיע, גם אחרי «נשלח» — ורק כשהטופס חתום', () => {
    const failed = track([row({ rawRequestState: 'כשל-ממתין לטעינת חוזרת', requestStateCode: 6 })], { submittedAt: '2026-09-23T10:05:00.000Z' });
    equal(shaamUploadFailed(failed), true);
    equal(shaamDocumentsInShaam(failed), false);
    const a = shaamRepresentationAction('awaiting_authorities', failed, true)!;
    deepEqual([a.kind, a.disabled ?? false], ['submit', false]);
    assert(a.label.includes('שוב'), a.label);
    equal(shaamLifecycleStage('awaiting_authorities', failed, false), 'submitted', 'לא חתום ⇒ לא מציעים שידור');
    // קריאה ישנה מלפני ההגשה אינה ראיה לכשל.
    const stale = { ...failed, observedAt: '2026-09-20T00:00:00.000Z' };
    equal(shaamUploadFailed(stale), false);
  }),

  test('בוטל עם סיבה, והשהיית מטה — שורה קצרה במסך, בלי פרוזה', () => {
    const c = track([row({ systemLabel: 'ניכויים', rawRequestState: 'נדחה', rawSystemState: 'בוטל', requestStateCode: 4, systemStateCode: 6, cancelReason: 'אי טעינת מסמכים במועד' })], { submittedAt: '2026-08-04T10:00:00.000Z' });
    equal(shaamSubmittedFacts(c)!.note, 'ניכויים: אי טעינת מסמכים במועד');
    const hq = track([row({ rawRequestState: 'התקבלו המסמכים', rawSystemState: 'השהיית מטה', requestStateCode: 2, systemStateCode: 3 })], { submittedAt: '2026-09-23T10:00:00.000Z' });
    equal(shaamLifecycle(hq).ball, 'authority');
    assert((shaamSubmittedFacts(hq)!.note ?? '').includes('מרשם המייצגים'), 'השהיית מטה — שורה');
  }),

  test('השהייה (הדסה): הצפי מהרשימה, והכדור אצל הרשות', () => {
    const t = track([SUSP], { submittedAt: '2026-09-23T10:05:00.000Z' });
    const f = shaamSubmittedFacts(t)!;
    deepEqual([f.status, f.suspensionEndsAt, f.final], ['השהייה', '2026-10-06', false]);
  }),

  test('מועדים מההדרכה של שע״ם: 30 יום לטעינת הטופס מיום ההזנה; 6 חודשים לפתיחת תיק', () => {
    const created = track([row({ enteredAt: '23/09/2026', rawRequestState: 'המתנה למסמכים', requestStateCode: 1 })]);
    equal(shaamUploadDeadline(created), '2026-10-23');
    equal(shaamUploadDeadline({ ...created, submittedAt: '2026-09-25T00:00:00.000Z' }), undefined);
    equal(shaamUploadDeadline({ requestNumber: '2026900000', createdAt: '2026-09-01T10:00:00.000Z' }), '2026-10-01');
    equal(shaamFileOpeningDeadline(WH_NOFILE), '2027-02-27');
  }),
];

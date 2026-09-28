// ─── 204 · מסמכים ששע״ם דורשת: שלב, עצירה, תצוגה, המרה ────────────────────
// ‼ שני מושגים שאסור לערבב: מסמך שהמשרד ביקש (לא חוסם) ומסמך ששע״ם דורשת
// (חוסם רק את השידור). כאן נבדק שהשני לא נגזר מהראשון, ולהפך.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { PDFDocument, degrees } from 'pdf-lib';
import type { ShaamRequestTracking } from '../shaamRepresentation';
import { shaamIdentityDocKind, shaamDocumentsBlocked } from '../shaamRepresentation';
import { shaamLifecycleStage, shaamRepresentationAction } from '../../taxFile/shaamRepresentationAction';
import { shaamStopState } from '../shaamJobSafety';
import { shaamDocumentsView } from '../shaamDocumentsGate';
import { documentPartsToPdfWith, ImageConversionError, type PdfLib } from '../../../../supabase/functions/_shared/imageToPdfCore.ts';
import { repSendPhase, representationStatusLabel, representationAction } from '../../../utils/representationAction';
import { repRequestToDb } from '../../../lib/dbMappers';
import type { AutomationJob } from '../../../types/automation';
import type { RepresentationRequest } from '../../../types';

const LIB = { PDFDocument, degrees } as unknown as PdfLib;
const TRACK: ShaamRequestTracking = { requestNumber: '2026538930', formDocumentId: 'f1' };
const gate = (state: string, extra: Record<string, unknown> = {}): ShaamRequestTracking => ({
  ...TRACK,
  requiredDocuments: [{ label: 'תצלום תעודת זהות או רישיון נהיגה', kind: 'idOrLicense', slotId: 2, person: 'spouse', personName: 'מיכל בדיקה', handling: 'requested', requiredBy: 'shaam' }],
  documentsGate: { state: state as never, jobId: 'j1', person: 'spouse', ...extra },
});
const job = (errorCode: string, extra: Partial<AutomationJob> = {}) =>
  ({ id: 'j', status: 'failed', actionType: 'shaam.submit_poa', errorCode, progress: {}, ...extra }) as unknown as AutomationJob;

// מסמך PNG זעיר תקין (1×1)
const PNG_1PX = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

export const TESTS: TestCase[] = [
  test('סיווג: «תעודת זהות או רישיון נהיגה» = idOrLicense (לא ת.ז. בלבד), רישיון לבד, דרכון', () => {
    equal(shaamIdentityDocKind('תצלום תעודת זהות או רישיון נהיגה'), 'idOrLicense');
    equal(shaamIdentityDocKind('צילום רישיון נהיגה'), 'driverLicense');
    equal(shaamIdentityDocKind('צילום דרכון'), 'passport');
    equal(shaamIdentityDocKind('צילום תעודת זהות'), 'idCard');
    equal(shaamIdentityDocKind('צו ירושה + מכתב מעו"ד'), null);
  }),

  test('שלב: חתום + ממתין למסמך ⇒ documents_blocked; בלי שער ⇒ signed_ready', () => {
    equal(shaamLifecycleStage('awaiting_stamp', gate('awaiting_required_documents'), true), 'documents_blocked');
    equal(shaamLifecycleStage('awaiting_stamp', TRACK, true), 'signed_ready');
    // ‼ החתימה עצמה לא מושפעת: לפני החתימה השלב הוא עדיין «ממתין לחתימות».
    equal(shaamLifecycleStage('pending_signature', gate('awaiting_required_documents'), false), 'signatures_pending');
  }),

  test('פעולה: ממתין למסמך / המרה / לא נתמך / אימות ראשון ⇒ מושבת (לא «נסה שוב»)', () => {
    for (const s of ['awaiting_required_documents', 'document_not_pdf_convertible', 'unsupported_required_document', 'first_live_verification']) {
      const a = shaamRepresentationAction('awaiting_stamp', gate(s), true)!;
      equal(a.kind, 'submit', s);
      equal(a.disabled, true, s);
      assert(!!a.reason, `${s}: יש הסבר`);
    }
  }),

  test('פעולה: אי אפשר לשייך / לא נקרא ⇒ השידור זמין — התיקון בידי המשרד', () => {
    equal(shaamRepresentationAction('awaiting_stamp', gate('needs_document_assignment'), true)!.disabled, false);
    equal(shaamRepresentationAction('awaiting_stamp', gate('required_document_unavailable'), true)!.disabled, false);
  }),

  test('שער שהוחלף ב-resume_queued / submitted אינו חוסם', () => {
    equal(shaamDocumentsBlocked(gate('resume_queued')), null);
    equal(shaamDocumentsBlocked({ ...gate('awaiting_required_documents'), submittedAt: '2026-09-27T10:00:00Z' }), null);
  }),

  test('עצירה: קודי המסמכים ⇒ documents_wait, לא נגע בשע״ם, «נסה שוב» רק כשהתיקון במשרד', () => {
    const w = shaamStopState(job('awaiting_required_documents'))!;
    deepEqual([w.kind, w.mayHaveActed, w.allowDirectRetry, w.suggestCheck], ['documents_wait', false, false, false]);
    equal(shaamStopState(job('first_live_verification'))!.allowDirectRetry, false);
    equal(shaamStopState(job('needs_document_assignment'))!.allowDirectRetry, true);
    // ‼ גם אם איכשהו נרשם סימן נגיעה — «לא ידוע אם נקלט» גובר (לא documents_wait).
    const touched = shaamStopState(job('ambiguous_submit_result', { progress: { externalAttempt: { at: 'x' } } } as never))!;
    equal(touched.kind, 'outcome_unknown');
  }),

  test('תצוגה: מה חסר, ממי, ומתי יש כלי צירוף', () => {
    const v = shaamDocumentsView(gate('awaiting_required_documents'))!;
    equal(v.items[0].personName, 'מיכל בדיקה');
    equal(v.items[0].label, 'צילום תעודת זהות או רישיון נהיגה');
    deepEqual(v.attach, [{ person: 'spouse', personName: 'מיכל בדיקה', kind: 'idOrLicense' }]);
    // ‼ אי אפשר לשייך ⇒ אין צירוף (הוא רק היה מנחש).
    const na = shaamDocumentsView({ ...gate('needs_document_assignment'), requiredDocuments: [{ label: 'x', kind: 'idOrLicense', person: null, handling: 'needs_document_assignment' }] })!;
    equal(na.attach.length, 0);
  }),

  test('תצוגה: עצירת אימות ראשון מציגה את התוכנית, לא «חסר»', () => {
    const v = shaamDocumentsView(gate('first_live_verification', {
      plan: { decision: 'first_live_verification', slots: [{ slotId: 2, kind: 'idOrLicense', label: 'x', status: 'ready', personName: 'מיכל בדיקה', fileName: 'צילום.pdf', pageCount: 2 }] },
    }))!;
    equal(v.state, 'first_live_verification');
    equal(v.plan.length, 1);
    equal(v.plan[0].pageCount, 2);
    equal(v.attach.length, 0);
  }),

  test('תצוגה: אחרי שהמסמך הגיע (resume_queued) השורה אומרת «התקבל», בלי כלי צירוף', () => {
    const v = shaamDocumentsView(gate('resume_queued'))!;
    equal(v.items[0].handling, 'התקבל - יועלה בשידור');
    equal(v.attach.length, 0);
  }),

  test('תצוגה: השידור ממתין למסמך ⇒ מועד הביטול של שע״ם (30 יום מההזנה) מוצג; אחרי המשך — לא', () => {
    const t = { ...gate('awaiting_required_documents'), createdAt: '2026-09-23T09:20:00.000Z' };
    equal(shaamDocumentsView(t)!.uploadDeadline, '2026-10-23');
    equal(shaamDocumentsView({ ...gate('resume_queued'), createdAt: '2026-09-23T09:20:00.000Z' })!.uploadDeadline, undefined);
  }),

  test('תצוגה: אין דרישה משע״ם ⇒ אין כלום (מסמך שהמשרד ביקש אינו כאן)', () => {
    equal(shaamDocumentsView(TRACK), null);
    equal(shaamDocumentsView(undefined), null);
  }),

  test('תווית: «נשלח לחתימת הלקוח» רק כשהמייל יצא', () => {
    const ready = { status: 'pending_signature' as const, execution: {} };
    equal(repSendPhase(ready), 'unsent');
    equal(representationStatusLabel('pending_signature', repSendPhase(ready)), 'מוכן לשליחה ללקוח');
    equal(representationAction('pending_signature', 'unsent').mine, true);
    equal(repSendPhase({ status: 'pending_signature', execution: { signatureEmailSentAt: '2026-09-27T08:00:00Z' } }), null);
    equal(representationStatusLabel('pending_signature', null), 'נשלח לחתימת הלקוח');
  }),

  test('שמירה מהדפדפן לא דורסת את identity_docs (נכתב בשרת בלבד)', () => {
    const row = repRequestToDb({ id: 'r', identityDocs: {}, execution: {} } as unknown as RepresentationRequest);
    equal('identity_docs' in row, false);
  }),
  test('המרה: PNG + PDF של אותו מסמך ⇒ PDF אחד, כל העמודים, לפי הסדר', async () => {
    const one = await PDFDocument.create(); one.addPage(); one.addPage();
    const pdfBytes = await one.save();
    const out = await documentPartsToPdfWith(LIB, [PNG_1PX, pdfBytes]);
    equal(out.pageCount, 3);
    const back = await PDFDocument.load(out.bytes);
    equal(back.getPageCount(), 3);
  }),

  test('המרה: HEIC/WEBP/טקסט ⇒ ImageConversionError (לא מדלגים על עמוד)', async () => {
    const heic = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    let threw = false;
    try { await documentPartsToPdfWith(LIB, [PNG_1PX, heic]); } catch (e) { threw = e instanceof ImageConversionError; }
    assert(threw, 'HEIC ⇒ שגיאה');
    let empty = false;
    try { await documentPartsToPdfWith(LIB, []); } catch (e) { empty = e instanceof ImageConversionError; }
    assert(empty, 'אין קבצים ⇒ שגיאה');
  }),
];

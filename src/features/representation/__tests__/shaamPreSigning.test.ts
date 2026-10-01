// ─── 208 · מסמכי שע״ם לפני החתימה · החלפה אחרי הסרת רשות · PDF מצילום ───────
// ‼ «יש בתיק» אינו «אושר ע"י הלקוח». כאן נבדק שהמסך, «מה יישלח ללקוח» והחסימה
// של השידור נגזרים מאותה הכרעה — ושההמרה ל-PDF לא מייצרת קובץ חלקי.

import { test, equal, assert, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { PDFDocument } from 'pdf-lib';
import type { ShaamRequestTracking } from '../shaamRepresentation';
import {
  shaamCreationRequirements, shaamPreSigningDocs, shaamClientDocumentsPending, shaamSendPreview,
} from '../shaamPreSigningDocs';
import { shaamLifecycleStage, shaamRepresentationAction } from '../../taxFile/shaamRepresentationAction';
import { ensurePdfVersion, pdfVersionId, type DocDbForPdf } from '../../../utils/documentPdf';
import type { StoredDoc } from '../../../hooks/useDocumentStore';
import type { RepresentationRequest, AuthorityRepresentations } from '../../../types';
import { shaamSubmissions } from '../../../utils/repScope';
import { shaamSystemsOf } from '../shaamRepresentation';

// הטקסט שנשמר אצל עידן רוקח (28.09.2026) — מילה במילה מהמסך של שע״ם.
const IDAN_NOTICE = 'הבקשה נקלטה בהצלחה. בהמשך תתבקש לצרף: טופס ייפוי כוח חתום. צילום תעודת הזהות או רישיון נהיגה של הלקוח. נא לוודא שהמסמכים קריאים.';
const TRACK: ShaamRequestTracking = {
  requestNumber: '2026544926', formDocumentId: 'form-1',
  creationNotice: { text: IDAN_NOTICE, at: '2026-09-28T09:00:00Z' },
} as ShaamRequestTracking;
const req = (identityDocs: RepresentationRequest['identityDocs']) => ({ identityDocs }) as Pick<RepresentationRequest, 'identityDocs'>;
const docsOf = (t: ShaamRequestTracking, r: Pick<RepresentationRequest, 'identityDocs'>, signed = false) =>
  shaamPreSigningDocs({ tracking: t, submissionKey: 'person:client', request: r, personName: 'עידן רוקח', signed });

// PNG 1×1 תקין, ו-JPEG מינימלי (SOI + SOF0 1×1 + EOI) — pdf-lib קורא רק את הכותרת.
const PNG_1PX = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
const JPG_1PX = new Uint8Array([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
  0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF, 0xD9]);
const HEIC = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);

function memDb(files: Record<string, { name: string; type: string; bytes: Uint8Array; at?: string }>) {
  const docs = new Map<string, StoredDoc>();
  for (const [id, f] of Object.entries(files)) {
    const buf = new ArrayBuffer(f.bytes.byteLength); new Uint8Array(buf).set(f.bytes);
    docs.set(id, {
      id, clientId: 'c1', fileName: f.name, fileType: f.type, fileSize: buf.byteLength, category: 'id_card' as StoredDoc['category'],
      year: 'general', uploadedAt: f.at ?? '2026-09-28T08:00:00Z', description: '', notes: '', fileData: buf,
    });
  }
  const saved: StoredDoc[] = [];
  const db: DocDbForPdf = {
    async getDoc(id) { return docs.get(id); },
    async getDocsByClient() { return [...docs.values()].map(d => ({ ...d, fileData: new ArrayBuffer(0) })); },
    async saveDoc(d) { saved.push(d); docs.set(d.id, d); },
  };
  return { db, saved, docs };
}

export const TESTS: TestCase[] = [
  test('הדרישות מרגע היצירה: מהטקסט של שע״ם — ייפוי כוח + ת.ז./רישיון', () => {
    deepEqual(shaamCreationRequirements(TRACK).map(r => r.kind), ['poa', 'idOrLicense']);
    // רשימה מפורשת מהעובד (creationAttach) גוברת על הטקסט.
    deepEqual(shaamCreationRequirements({ ...TRACK, creationAttach: ['צילום דרכון של הלקוח'] }).map(r => r.kind), ['passport']);
    deepEqual(shaamCreationRequirements({ requestNumber: '1' }), []);
  }),

  test('אין צילום בתיק ⇒ «חסר», והלקוח יתבקש להעלות', () => {
    const d = docsOf(TRACK, req({}));
    const id = d.find(x => x.kind === 'idOrLicense')!;
    equal(id.status, 'missing');
    assert(!!id.clientAction && /להעלות/.test(id.clientAction), 'בקשת העלאה');
    const preview = shaamSendPreview(d);
    equal(preview.length, 2);
    assert(/חתימה/.test(preview[0]) && /להעלות/.test(preview[1]), 'חתימה ואז העלאה');
    assert(/השידור ימתין עד שהלקוח יעלה/.test(shaamClientDocumentsPending(d)!), 'סיבת חסימה');
  }),

  test('יש צילום בתיק שלא אושר ⇒ «ממתין לאישור הלקוח» (קיום קובץ אינו אישור)', () => {
    const d = docsOf(TRACK, req({ client: [{ documentId: 'id-front', docKind: 'idCard', fileName: 'id.jpg' }] }));
    const id = d.find(x => x.kind === 'idOrLicense')!;
    equal(id.status, 'awaiting_confirmation');
    assert(/לאשר/.test(id.clientAction ?? '') && /אחר/.test(id.clientAction ?? ''), 'לאשר או להחליף');
    assert(/לא אישר/.test(shaamClientDocumentsPending(d)!), 'השידור ממתין לאישור');
  }),

  test('הלקוח אישר ⇒ «אושר», ואין מה לבקש', () => {
    const d = docsOf(TRACK, req({ client: [{ documentId: 'id-front', docKind: 'idCard', fileName: 'id.jpg', clientConfirmedAt: '2026-09-28T10:00:00Z' }] }), true);
    equal(d.find(x => x.kind === 'idOrLicense')!.status, 'confirmed');
    equal(d.find(x => x.kind === 'poa')!.status, 'signed');
    equal(shaamClientDocumentsPending(d), null);
    deepEqual(shaamSendPreview(d), []);
  }),

  test('צילום של בן/בת הזוג אינו עונה על דרישה של הנישום', () => {
    const d = docsOf(TRACK, req({ spouse: [{ documentId: 'sp', docKind: 'idCard', clientConfirmedAt: '2026-09-28T10:00:00Z' }] }));
    equal(d.find(x => x.kind === 'idOrLicense')!.status, 'missing');
  }),

  test('שידור: חתום אבל הלקוח לא אישר ⇒ «שלח טופס חתום» מושבת עם הסבר', () => {
    const pending = shaamClientDocumentsPending(docsOf(TRACK, req({ client: [{ documentId: 'x', docKind: 'idCard' }] }), true));
    equal(shaamLifecycleStage('awaiting_stamp', TRACK, true, { clientDocumentsPending: pending }), 'client_documents_pending');
    const a = shaamRepresentationAction('awaiting_stamp', TRACK, true, { clientDocumentsPending: pending })!;
    equal(a.kind, 'submit');
    equal(a.disabled, true);
    equal(a.reason, pending ?? undefined);
    // אושר ⇒ השידור פתוח.
    equal(shaamRepresentationAction('awaiting_stamp', TRACK, true, { clientDocumentsPending: null })!.disabled, undefined);
  }),

  test('רשות הוסרה אחרי שהבקשה נפתחה בשע״ם ⇒ ממתין לביטול שם; אחרי הביטול ⇒ «הזן» מחדש', () => {
    const replaced: ShaamRequestTracking = {
      requestNumber: '2026544926', systems: [{ system: 'מס הכנסה' }] as never,
      replacement: { reason: 'authority_removed', requestNumber: '2026544926', removed: ['ניכויים'], supersededFormDocumentId: 'form-1', at: '2026-09-28T11:00:00Z' },
    } as ShaamRequestTracking;
    equal(shaamLifecycleStage('awaiting_accountant', replaced, false), 'replacement_pending');
    equal(shaamRepresentationAction('awaiting_accountant', replaced, false)!.kind, 'check');
    // אין דרישות מסמכים לבקשה שממתינה לביטול — הטופס שלה בוטל.
    deepEqual(docsOf(replaced, req({})), []);
    // אחרי שהועברה להיסטוריה — אין בקשה, והפעולה היא יצירה חדשה.
    const archived = { history: [{ ...replaced, archivedAt: '2026-09-28T12:00:00Z', archivedHow: 'office_confirmed' }] } as unknown as ShaamRequestTracking;
    equal(shaamLifecycleStage('awaiting_accountant', archived, false), 'not_started');
    equal(shaamRepresentationAction('awaiting_accountant', archived, false)!.kind, 'create');
  }),

  test('«הסר מהבקשה»: הבקשה החדשה בשע״ם נבנית רק ממה שנשאר בהיקף', () => {
    const people = { married: false, clientName: 'דנה', spouseName: '' };
    const before = { incomeTax: { status: 'in_process' }, withholding: { status: 'in_process' } } as unknown as AuthorityRepresentations;
    deepEqual(shaamSubmissions(before, people).flatMap(shaamSystemsOf), ['incomeTax', 'withholding']);
    // מה ש-remove_authority_before_signing משאיר בהיקף הבקשה
    const after = { incomeTax: { status: 'in_process' } } as unknown as AuthorityRepresentations;
    deepEqual(shaamSubmissions(after, people).flatMap(shaamSystemsOf), ['incomeTax']);
  }),

  test('PDF לשע״ם: שני צדי תעודה (PNG + JPG) ⇒ PDF אחד, לפי הסדר, לצד המקור', async () => {
    const { db, saved } = memDb({
      front: { name: 'front.png', type: 'image/png', bytes: PNG_1PX },
      back: { name: 'back.jpg', type: 'image/jpeg', bytes: JPG_1PX },
    });
    const r = await ensurePdfVersion(db, 'c1', ['front', 'back'], { fileName: 'ת.ז. (PDF לשע״ם).pdf' });
    assert(r.ok, 'הצליח');
    if (!r.ok) return;
    equal(r.created, true);
    equal(r.pageCount, 2);
    equal(saved.length, 1);
    equal(r.doc.fileType, 'application/pdf');
    deepEqual(r.doc.sourceDocumentIds, ['front', 'back']);
    equal(r.doc.id, await pdfVersionId(['back', 'front']), 'אותו מזהה כמו בשרת, בלי תלות בסדר');
    const back = await PDFDocument.load(new Uint8Array(r.doc.fileData));
    equal(back.getPageCount(), 2);
    // המקורות נשארים — שום דבר לא נמחק ולא הוחלף.
    assert(!!(await db.getDoc('front')) && !!(await db.getDoc('back')), 'המקור נשמר');
    // קריאה שנייה ⇒ אותו PDF, בלי לבנות שוב.
    const again = await ensurePdfVersion(db, 'c1', ['front', 'back'], { fileName: 'x.pdf' });
    assert(again.ok && !again.created && again.doc.id === r.doc.id, 'שימוש חוזר');
    equal(saved.length, 1);
  }),

  test('PDF לשע״ם: כשל המרה / חריגה מגודל ⇒ שגיאה גלויה, ושום קובץ לא נשמר', async () => {
    const heic = memDb({ a: { name: 'a.heic', type: 'image/heic', bytes: HEIC } });
    const r1 = await ensurePdfVersion(heic.db, 'c1', ['a'], { fileName: 'x.pdf' });
    assert(!r1.ok && r1.error.length > 0, 'HEIC ⇒ שגיאה');
    equal(heic.saved.length, 0);
    const big = memDb({ a: { name: 'a.png', type: 'image/png', bytes: PNG_1PX } });
    const r2 = await ensurePdfVersion(big.db, 'c1', ['a'], { fileName: 'x.pdf', maxBytes: 10 });
    assert(!r2.ok && /גדול מדי/.test(r2.error), 'חריגה מהמגבלה');
    equal(big.saved.length, 0);
    const missing = memDb({});
    const r3 = await ensurePdfVersion(missing.db, 'c1', ['nope'], { fileName: 'x.pdf' });
    assert(!r3.ok, 'מסמך שלא בתיק ⇒ שגיאה');
  }),

  test('PDF לשע״ם: מקור שכבר PDF ⇒ הוא עצמו, בלי עותק', async () => {
    const one = await PDFDocument.create(); one.addPage();
    const { db, saved } = memDb({ p: { name: 'id.pdf', type: 'application/pdf', bytes: await one.save() } });
    const r = await ensurePdfVersion(db, 'c1', ['p'], { fileName: 'x.pdf' });
    assert(r.ok && r.doc.id === 'p' && !r.created, 'אותו מסמך');
    equal(saved.length, 0);
  }),
];

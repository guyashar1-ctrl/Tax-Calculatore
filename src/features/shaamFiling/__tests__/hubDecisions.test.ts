// 305 · נכתב מיד, בקשה פנימית לבד, ביטול העלאה — הטקסטים שהמסך מציג מתשובת השרת.
// ‼ הכללים עצמם בשרת (scripts/staging-test-305-shaam-hub.mjs); כאן — שהסיכום אומר בדיוק את מה שהשרת החזיר, בלי להגזים.
import { deepEqual, equal, assert, test, type TestCase } from '../../../testkit/tinyTest';
import { importSummaryParts, mergeUndo, undoSummaryText, type ImportSummary, type UndoSummary } from '../model';

const sum = (o: Partial<ImportSummary> = {}): ImportSummary => ({ written: 0, unchanged: 0, review: 0, opened: 0, linked: 0, needDay: 0, openFailed: 0, ...o });
const undo = (o: Partial<UndoSummary> = {}): UndoSummary => ({ deleted: 0, restored: 0, cancelledRequests: 0, gone: 0, kept: [], keptRequests: [], ...o });

export const TESTS: TestCase[] = [
  test('סיכום הקליטה: «נכתבו לתיקים · לבדיקה · נפתחו בקשות» תמיד, גם כשאפס', () => {
    deepEqual(importSummaryParts(sum({ written: 5, review: 1, opened: 2 })), ['נכתבו לתיקים 5', 'לבדיקה 1', 'נפתחו בקשות 2']);
    deepEqual(importSummaryParts(sum()), ['נכתבו לתיקים 0', 'לבדיקה 0', 'נפתחו בקשות 0']);
  }),
  test('סיכום הקליטה: קישור לבקשה קיימת, ללא שינוי, הון שממתין ליום ופתיחה שנכשלה — רק כשיש', () => {
    const p = importSummaryParts(sum({ written: 1, linked: 1, unchanged: 3, needDay: 2, openFailed: 1 }));
    assert(p.includes('קושרו לבקשה קיימת 1'), 'linked');
    assert(p.includes('ללא שינוי 3'), 'unchanged');
    assert(p.includes('הצהרות הון — ממתינות ליום הצהרה 2'), 'needDay');
    assert(p.includes('בקשות שלא נפתחו 1'), 'openFailed');
    equal(p.length, 7);
  }),
  test('ביטול: מה נמחק, מה חזר, אילו בקשות בוטלו', () => {
    equal(undoSummaryText(undo({ deleted: 4, restored: 1, cancelledRequests: 1 })), 'בוטלה: 4 נמחקו · 1 הוחזרו לקודם · בקשה אחת בוטלה');
    equal(undoSummaryText(undo({ cancelledRequests: 3 })), 'בוטלה: 3 בקשות בוטלו');
  }),
  test('ביטול: מה שאדם עבד עליו נשאר — נספר פעם אחת לכל שורה ולכל בקשה', () => {
    const u = undo({ deleted: 1, kept: [{ obligationId: 'a', reason: 'newer_upload' }, { obligationId: 'a', reason: 'newer_upload' }, { obligationId: 'b', reason: 'office_changed' }],
      keptRequests: [{ stepId: 's1', reason: 'worked_on' }] });
    equal(undoSummaryText(u), 'בוטלה: 1 נמחקו · נשארו 2 (טופלו או עודכנו אחר כך) · בקשה אחת שכבר עבדו עליה נשארה');
  }),
  test('ביטול בלי שינוי — לא טוען שנמחק משהו', () => {
    equal(undoSummaryText(undo()), 'בוטלה: לא היה מה להחזיר');
  }),
  test('כמה קבצים באותה העלאה — הביטולים מתחברים', () => {
    const m = mergeUndo([undo({ deleted: 2, cancelledRequests: 1 }), undo({ restored: 1, kept: [{ obligationId: 'x', reason: 'office_changed' }] })]);
    equal(m.deleted, 2); equal(m.restored, 1); equal(m.cancelledRequests, 1); equal(m.kept.length, 1);
  }),
];

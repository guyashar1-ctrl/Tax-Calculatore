// ─── בדיקות: בקשה שהייתה אמורה להיווצר ולא נוצרה ────────────────────────────
// ‼ מה נעול כאן:
//   · לכל קוד ש-_creation_problem_class מסווג כבעיה — סיבה בעברית, ומה עושים בשמות הכפתורים.
//   · «נמחק מהספרייה» — אין «צור שוב» (לא יכול להצליח); תוכן לא תקין — «צור שוב» + «פתח בספרייה».
//   · בסיכום ההפעלה: הבעיות קודם, «באדום ברשימת הבקשות», ובנפרד מדילוג תמים.
//   · שורת «לא נוצרה» לא מוצעת לצירוף לשלב.
//   · הבונה מסמן לפני השמירה בקשה שנמחקה (בלי עותק) ומסמך שהוסר.
//   · «צור שוב» / «אין צורך» — רק מה שהשרת אמר.

import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  CREATION_PROBLEM_CODES, CREATION_PROBLEM_STATUS, SKIP_REASON_TEXT, creationProblemText, creationReasonText, creationSkipConfirm,
  retryCreationText, skipReasonText, type CreationProblemNext,
} from '../../../features/flows/api';
import { lateCandidates, materializedSummary } from '../runSummary';
import { REPEATABLE_STEP_TYPES } from '../../../features/flows/compile';
import { buildLibraryLookup, libraryIssues } from '../builder/model';
import type { FlowDefinition } from '../../../features/flows/types';

const CODE_LIKE = /[a-z_]{4,}/;
const LATIN = /[A-Za-z]/;

export const TESTS: TestCase[] = [
  test('כל קוד בעיה — סיבה בעברית, גם ב«למה לא נוצר» וגם בסיבת דילוג', () => {
    for (const code of [...CREATION_PROBLEM_CODES, 'code_we_do_not_know']) {
      for (const ref of [undefined, { kind: 'template' }, { kind: 'document' }]) {
        const t = creationProblemText({ reason: code, next: 'retry', ref });
        // ‼ B5.5 — «לא נוצרה» הוא המצב של השורה; הסיבה לא חוזרת עליו.
        assert(!!t.reason && !t.reason.includes('לא נוצרה'), t.reason);
        assert(!LATIN.test(t.reason + t.next), `${code}: ${t.reason} ${t.next}`);
      }
      if (code !== 'code_we_do_not_know') {
        assert(!!SKIP_REASON_TEXT[code], `${code}: אין טקסט דילוג`);
        assert(!CODE_LIKE.test(skipReasonText(code)), `${code}: ${skipReasonText(code)}`);
      }
    }
    equal(creationReasonText('library_item_missing', 'document'), 'המסמך הוסר מהספרייה');
    equal(creationReasonText('library_item_missing', 'template'), 'הבקשה כבר לא קיימת בספרייה');
    equal(creationReasonText('no_requirements'), 'בבקשה בספרייה אין מה למלא');
    equal(creationReasonText('weird'), 'היצירה נכשלה בשרת');
    assert(!LATIN.test(CREATION_PROBLEM_STATUS), CREATION_PROBLEM_STATUS);
  }),

  test('מה עושים — לפי next, בשמות הכפתורים שבשורה', () => {
    const of = (next: CreationProblemNext) => creationProblemText({ reason: 'x', next });
    deepEqual(of('retry').actions, ['retry']);
    assert(of('retry').next.includes('«צור שוב»') && of('retry').next.includes('«אין צורך»'), of('retry').next);
    deepEqual(of('library').actions, ['retry', 'library']);
    assert(of('library').next.includes('«פתח בספרייה»'), of('library').next);
    deepEqual(of('add').actions, ['add'], 'נמחק מהספרייה — אין «צור שוב»');
    assert(!of('add').next.includes('«צור שוב»') && of('add').next.includes('«＋ בקשה חדשה»'), of('add').next);
    deepEqual(of('flow').actions, ['flow']);
    assert(of('flow').next.includes('«פתח את המסלול»'), of('flow').next);
    // ‼ חסר נתון בכרטיס (card) — «צור שוב» אחרי שהפרט בכרטיס; לא «＋ בקשה חדשה» (מחוץ למסלול).
    const card = creationProblemText({ reason: 'spouse_name_missing', next: 'retry' });
    deepEqual(card.actions, ['retry']);
    assert(card.next.includes('«צור שוב»') && !card.next.includes('בקשה חדשה'), card.next);
    assert(card.reason.includes('תיק המס') && card.reason.includes('«משפחה ובן/בת זוג»'), card.reason);
    equal(creationProblemText({ reason: 'x', next: 'retry', attempts: 1, lastAt: '2026-10-02T10:00:00Z' }).lastTry, null);
    equal(creationProblemText({ reason: 'x', next: 'retry', attempts: 3, lastAt: '2026-10-02T10:00:00Z' }).lastTry, 'ניסיון אחרון: 02.10.26');
  }),

  test('«אין צורך» ו«צור שוב» — החלון והתוצאה', () => {
    const c = creationSkipConfirm({ itemTitle: 'מדריך הוצאות', requiredForClose: true, inFlow: true });
    equal(c.title, 'אין צורך ב«מדריך הוצאות»?');
    assert(c.message.startsWith('הבקשה נדרשת לסגירת הקליטה. ') && c.message.endsWith('השלב במסלול ימשיך בלעדיה.'), c.message);
    deepEqual(c.payload, { reason: 'not_applicable', note: 'אין צורך — הבקשה לא נוצרה' });
    const plain = creationSkipConfirm({ itemTitle: 'א' });
    assert(!plain.message.includes('נדרשת') && !plain.message.includes('השלב'), plain.message);
    equal(retryCreationText({ ok: true, resolved: true, stepId: 's9' }, 'מדריך').text, 'נוצרה — «מדריך» ברשימה');
    equal(retryCreationText({ ok: true, resolved: false, reason: 'library_item_missing' }, 'מדריך').text, 'עדיין לא נוצרה — הסיבה עודכנה בשורה');
    equal(retryCreationText({ ok: true, resolved: true, reason: 'exists' }, 'מדריך').text, 'כבר קיימת אצל הלקוח — השורה נסגרה');
    equal(retryCreationText({ ok: true, resolved: true, reason: 'not_applicable' }, 'מדריך').text, 'לא חלה עוד על הלקוח — השורה נסגרה');
    for (const e of ['not_a_problem', 'entry_not_found', 'not_running', 'forbidden', 'request_failed']) {
      const r = retryCreationText({ ok: false, error: e }, 'מדריך');
      assert(r.err && !LATIN.test(r.text), `${e}: ${r.text}`);
    }
  }),

  test('סיכום ההפעלה: הבעיות קודם, «באדום ברשימת הבקשות של…», ובנפרד מדילוג תמים', () => {
    const lines = materializedSummary({
      created: [{ itemKey: 'a', stepId: 's1' }],
      skipped: [
        { itemKey: 'b', reason: 'not_applicable' },
        { itemKey: 'c', reason: 'library_item_missing', problem: true, problemStepId: 'p1' },
        { itemKey: 'd', reason: 'no_requirements', problem: true, problemStepId: 'p2', role: 'spouse' },
      ],
    }, k => ({ a: 'שאלון', b: 'ייצוג', c: 'מדריך הוצאות', d: 'אישור בנק' } as Record<string, string>)[k], 'דוד');
    equal(lines[0], 'לא נוצרה «מדריך הוצאות» — הפריט כבר לא קיים בספרייה. היא מופיעה באדום ברשימת הבקשות של דוד.');
    assert(lines[1].includes('«אישור בנק» (בן/בת הזוג)') && lines[1].includes('באדום'), lines[1]);
    equal(lines[2], 'נוספה בקשה אחת');
    assert(lines[3].startsWith('דולגה «ייצוג» — ') && !lines[3].includes('באדום'), lines[3]);
    // שרת ישן בלי problem — הכול «דולגה», כמו קודם.
    deepEqual(materializedSummary({ skipped: [{ itemKey: 'c', reason: 'library_item_missing' }] }, () => 'מדריך'), ['דולגה «מדריך» — נמחק מהספרייה']);
    for (const l of lines) assert(!LATIN.test(l), l);
  }),

  test('שורת «לא נוצרה» לא מוצעת לצירוף לשלב', () => {
    const base = { stepType: 'custom_request', status: 'pending', createdAt: '2026-09-05T00:00:00Z', publishedAt: '2026-09-05T00:00:00Z' };
    const c = lateCandidates([
      { id: 'real', ...base, payload: {} },
      { id: 'problem', ...base, payload: { internalTask: true, creationProblem: { key: 'gen:e:od1', reason: 'library_item_missing' } } },
    ], { startedAt: '2026-09-01T08:00:00Z' }, REPEATABLE_STEP_TYPES, s => s.id);
    deepEqual(c.map(x => x.id), ['real']);
  }),

  test('הבונה: בקשה שנמחקה בלי עותק, ומסמך שהוסר — מסומנים לפני השמירה; בקשה עם עותק — תקינה', () => {
    const def: FlowDefinition = { stages: [{ key: 's1', name: 'פתיחה', opens: { after: 'start' }, delivery: 'approve', items: [
      { key: 'gone', ref: { kind: 'template', templateId: 'missing' } },
      { key: 'copy', ref: { kind: 'template', templateId: 'missing2' }, snapshot: { stepType: 'custom_request', title: 'עם עותק', payload: { requirements: [{ key: 'r', kind: 'file', label: 'קובץ' }] } } },
      { key: 'doc', ref: { kind: 'document', docId: 'd-gone' }, snapshot: { stepType: 'custom_request', title: 'מדריך הוצאות' } },
      { key: 'docok', ref: { kind: 'document', docId: 'd1' } },
    ] }] };
    const lib = buildLibraryLookup([], [{ id: 'd1', label: 'מסמך קיים', path: 'p', url: 'u', fileName: 'f.pdf', at: '2026-10-01T00:00:00Z' }]);
    const issues = libraryIssues(def, lib, 'manual');
    deepEqual(issues.map(i => i.itemKey).sort(), ['doc', 'gone']);
    const doc = issues.find(i => i.itemKey === 'doc')!;
    equal(doc.notCreated, 'הוסר מהספרייה');
    assert(doc.message.startsWith('המסמך «מדריך הוצאות» הוסר מהספרייה'), doc.message);
    equal(issues.find(i => i.itemKey === 'gone')!.notCreated, 'נמחקה מהספרייה');
    for (const i of issues) assert(!LATIN.test(i.message), i.message);
    // גם בקליטה — אותו כלל (המחולל יפתח שורה אדומה אצל כל לקוח).
    deepEqual(libraryIssues(def, lib, 'quote_approved').map(i => i.itemKey).sort(), ['doc', 'gone']);
  }),
];

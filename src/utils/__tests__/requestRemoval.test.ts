// ─── בדיקות: «הסרת בקשה» — מה התפריט מציע, ומתי ההסרה מיידית או בפרסום (15.10.2026) ─────
// ‼ מה נעול כאן:
//   · בקשה שעוד לא בדף (או משימה פנימית) — מיידית; בקשה שבדף — «בפרסום», וניתנת לביטול עד אז.
//   · כל סוג שאין לו הסרה רגילה אומר למה ומה עושים במקום — לא כפתור חסר.
//   · בקשה שנסגרה היא היסטוריה: אין הסרה.
//   · ייצוג: ב"ל לאדם נשאר עם המחיקה/ביטול הייעודיים; ייצוג שאושר — חסום; אין הסרה כללית.
//   · טופס 6101 — ביטול רק לפני חתימה.

import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import {
  pageChangesText, removalErrorText, removalPlan, removalWhen, SMART_FORM_CANCELLABLE,
  type RemovalInput, type RemovalTarget,
} from '../requestRemoval';

const t = (p: Partial<RemovalTarget> = {}): RemovalTarget => ({ published: true, internal: false, pendingCancel: false, ...p });
const base = (p: Partial<RemovalInput> = {}): RemovalInput => ({
  title: 'מסמכים לפתיחת התיק', status: 'waiting_client', kind: 'standard', targets: [t()], ...p,
});

export const TESTS: TestCase[] = [
  test('בקשה שעוד לא פורסמה — הסרה מיידית, עם אישור', () => {
    const p = removalPlan(base({ status: 'pending', targets: [t({ published: false })] }));
    assert(p.kind === 'remove', p.kind);
    if (p.kind !== 'remove') return;
    equal(p.when, 'now');
    assert(p.hint.includes('מיידית'), p.hint);
    assert(p.dialog.lead.includes('מיידית'), p.dialog.lead);
    assert(p.dialog.stays.some(s => s.includes('פעילות')), 'ההיסטוריה נשמרת');
  }),

  test('בקשה שכבר בדף — ההסרה ממתינה לפרסום ולא מוצגת כהושלמה', () => {
    const p = removalPlan(base());
    assert(p.kind === 'remove', p.kind);
    if (p.kind !== 'remove') return;
    equal(p.when, 'on_publish');
    assert(p.hint.includes('פרסם בדף'), p.hint);
    assert(p.dialog.lead.includes('לא מיידית'), p.dialog.lead);
    assert(p.dialog.stays.some(s => s.includes('לבטל את ההסרה')), 'אפשר לבטל עד הפרסום');
    assert(p.dialog.stays.some(s => s.includes('לא שולחת הודעה')), 'ההסרה אינה שולחת מייל');
    assert(!p.dialog.lead.includes('הוסרה'), 'אסור לטעון שהוסרה');
  }),

  test('הסרה שממתינה — «בטל את ההסרה», בלי חלון', () => {
    const p = removalPlan(base({ targets: [t({ pendingCancel: true })] }));
    equal(p.kind, 'undo');
    if (p.kind === 'undo') assert(p.hint.includes('עדיין רואה'), p.hint);
  }),

  test('משימה פנימית — מיידית גם כשהייתה בדף', () => {
    const p = removalPlan(base({ targets: [t({ internal: true })] }));
    assert(p.kind === 'remove', p.kind);
    if (p.kind !== 'remove') return;
    equal(p.when, 'now');
    assert(p.menuLabel.includes('משימה'), p.menuLabel);
    // הסרה ממתינה ישנה על משימה פנימית (מלפני הכלל) — לחיצה מבטלת אותה
    equal(removalPlan(base({ targets: [t({ internal: true, pendingCancel: true })] })).kind, 'undo');
  }),

  test('רו״ח קודם — שלושה שלבים, והחלון אומר את זה; מעורב = מיידי ובפרסום', () => {
    const p = removalPlan(base({
      kind: 'prev_accountant', title: 'חומרים מרו״ח קודם',
      targets: [t({ published: false }), t({ published: false }), t({ published: true })],
    }));
    assert(p.kind === 'remove', p.kind);
    if (p.kind !== 'remove') return;
    equal(p.when, 'mixed');
    assert(p.dialog.lead.includes('השלבים הפתוחים של המסלול (3)') && p.dialog.lead.includes('נשאר בהיסטוריה'), p.dialog.lead);
    equal(removalWhen([t({ published: false }), t({ published: false })]), 'now');
    equal(removalWhen([t(), t()]), 'on_publish');
  }),

  test('שלב שכבר ממתין להסרה לא משנה את התזמון של השאר', () => {
    equal(removalWhen([t({ pendingCancel: true }), t({ published: false })]), 'now');
    equal(removalWhen([t({ pendingCancel: true }), t()]), 'on_publish');
  }),

  test('בקשות שממתינות לה — אזהרה שהן יישארו נעולות', () => {
    const p = removalPlan(base({ dependents: ['הרשאה לחיוב חודשי'] }));
    assert(p.kind === 'remove', p.kind);
    if (p.kind === 'remove') assert((p.dialog.warn ?? '').includes('הרשאה לחיוב חודשי') && p.dialog.warn!.includes('נעולות'), String(p.dialog.warn));
    const none = removalPlan(base());
    if (none.kind === 'remove') equal(none.dialog.warn, undefined);
  }),

  test('בקשה שהושלמה או דולגה — היסטוריה, אין הסרה', () => {
    for (const status of ['completed', 'verified', 'skipped', 'cancelled'] as const) {
      const p = removalPlan(base({ status }));
      assert(p.kind === 'blocked', `${status}: ${p.kind}`);
      if (p.kind === 'blocked') assert(p.reason.includes('נשמר'), p.reason);
    }
    // גם ייצוג או ב"ל שהושלמו — היסטוריה, לא ביטול ב"ל
    equal(removalPlan(base({ status: 'completed', kind: 'ni_part', niStage: 'sent' })).kind, 'blocked');
  }),

  test('ייצוג: ההורה חסום ומפנה למרכז הייצוג; ב"ל לאדם — מחיקה/ביטול ייעודיים; מאושר — חסום', () => {
    const parent = removalPlan(base({ kind: 'rep_parent' }));
    assert(parent.kind === 'blocked', parent.kind);
    if (parent.kind === 'blocked') {
      equal(parent.next, 'representation');
      assert(parent.reason.includes('אינה מבטלת ייצוג ברשות'), parent.reason);
    }
    equal(removalPlan(base({ kind: 'ni_part', niStage: 'not_sent', personName: 'רותם' })).kind, 'ni_cancel');
    const sent = removalPlan(base({ kind: 'ni_part', niStage: 'sent', personName: 'רותם' }));
    assert(sent.kind === 'ni_cancel' && sent.hint.includes('רותם') && sent.hint.includes('מקומי'), JSON.stringify(sent));
    const approved = removalPlan(base({ kind: 'ni_part', niStage: null }));
    assert(approved.kind === 'blocked', approved.kind);
    if (approved.kind === 'blocked') assert(approved.reason.includes('אושר'), approved.reason);
  }),

  test('שדרוג לייצוג ראשי, אישור בן/בת זוג, «לא נוצרה», השלמת מידע ומשימת מערכת — חסומים עם סיבה', () => {
    const cases = ['rep_upgrade', 'spouse_confirm', 'creation_problem', 'tax_child', 'system'] as const;
    for (const kind of cases) {
      const p = removalPlan(base({ kind }));
      assert(p.kind === 'blocked', `${kind}: ${p.kind}`);
      if (p.kind === 'blocked') assert(p.reason.length > 30, `${kind}: סיבה קצרה מדי`);
    }
    const spouse = removalPlan(base({ kind: 'spouse_confirm' }));
    if (spouse.kind === 'blocked') assert(spouse.reason.includes('אין צורך'), 'מפנה לפעולה שכן קיימת');
  }),

  test('עבודת מס — חלון ההסרה של 242, לא הסרה רגילה', () => {
    const p = removalPlan(base({ kind: 'tax_work' }));
    equal(p.kind, 'tax_work');
  }),

  test('טופס 6101 — ביטול רק לפני חתימה, וכל השאר אומר למה', () => {
    for (const st of SMART_FORM_CANCELLABLE) {
      const p = removalPlan(base({ kind: 'smart_form', smartState: st }));
      assert(p.kind === 'cancel_form', `${st}: ${p.kind}`);
    }
    const locked = removalPlan(base({ kind: 'smart_form', smartState: 'awaiting_signatures' }));
    if (locked.kind === 'cancel_form') assert((locked.dialog.warn ?? '').includes('קישור'), 'אזהרה על קישור שנשלח');
    for (const st of ['signed', 'awaiting_client_submission', 'submitted', 'info_requested', 'result_received', 'closed']) {
      const p = removalPlan(base({ kind: 'smart_form', smartState: st }));
      assert(p.kind === 'blocked', `${st}: ${p.kind}`);
    }
    const signed = removalPlan(base({ kind: 'smart_form', smartState: 'signed' }));
    if (signed.kind === 'blocked') assert(signed.reason.includes('חתום'), signed.reason);
  }),

  test('«פרסם בדף»: הסרה ממתינה לא מוצגת כ«עוד לא בדף» — הלקוח עדיין רואה אותה', () => {
    const only = pageChangesText([{ title: 'אישור תושבות', removal: true }], false, 'שרון');
    assert(only.head.startsWith('תוסר מהדף בפרסום'), only.head);
    assert(only.why.includes('עדיין רואה אותה'), only.why);
    assert(!only.head.includes('עוד לא בדף') && !only.why.includes('לא יראה'), 'לא אומר שהלקוח לא רואה');
    const mixed = pageChangesText([{ title: 'חוזה', removal: false }, { title: 'אישור תושבות', removal: true }], true, 'שרון');
    assert(mixed.head.includes('עוד לא בדף: «חוזה»') && mixed.head.includes('הסרה אחת ממתינה: «אישור תושבות»'), mixed.head);
    assert(mixed.why.includes('נשאר אצלו'), mixed.why);
    // בלי הסרות — הנוסח הקודם בדיוק
    const plain = pageChangesText([{ title: 'א', removal: false }, { title: 'ב', removal: false }], false, 'שרון');
    equal(plain.head, '2 שינויים עוד לא בדף: «א», «ב»');
    equal(plain.why, 'הפרסום לא שולח מייל. שרון לא יראה עד שתפרסם.');
    equal(pageChangesText([{ title: 'א', removal: false }], true, 'שרון').head, 'עוד לא בדף: «א»');
  }),

  test('תגובות השרת: ok:false מוסבר, ולא-מוכר לא נבלע', () => {
    equal(removalErrorText('step_terminal').stale, true);
    equal(removalErrorText('not_published').stale, true);
    equal(removalErrorText('forbidden').stale, false);
    assert(removalErrorText('משהו-לא-מוכר').text.length > 10, 'יש הודעה גם לקוד לא מוכר');
    equal(removalErrorText(undefined, 'השלב נעול').text, 'השלב נעול');
  }),
];

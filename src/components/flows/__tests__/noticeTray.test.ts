// ─── בדיקות: שורת התור במגש («יישלח לבד») ──────────────────────────────────
// ‼ מה נעול כאן:
//   · «יישלח לבד» רק לפריטים של שלב «לבד» מריצה שאינה בעצירה — השאר מחכים לכפתור.
//   · תור בלי פריט כזה ⇒ אין הבטחה (השרת ידלג עליו).
//   · השעה היא «לא לפני», ושעה שעברה לא מוצגת.
//   · «אל תשלח לבד» לא מבטיח שזה לא ייצא לבד לעולם.
//   · אין כתובת בכרטיס, או מייל קודם שלא ידוע אם יצא ⇒ השרת ידלג על התור:
//     אין «יישלח לבד» ואין «שלח עכשיו», אלא הסיבה.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import {
  trayQueueLine, unknownBlocksNewText, QUEUE_CANCELLED_TEXT, SEND_NOW_LABEL, SEND_MAIL_LABEL, PAUSED_QUEUE_TEXT,
  NO_EMAIL_QUEUE_TEXT, UNKNOWN_PENDING_QUEUE_TEXT, NI_ONLY_WHY, pausedQueueText, type TrayQueueInput,
} from '../trayQueue';

// ‼ שעון מקומי — כמו המגש (השעה שמוצגת היא השעה המקומית של הדפדפן).
const at = (h: number, m: number) => new Date(2026, 9, 3, h, m).getTime();
const iso = (h: number, m: number) => new Date(at(h, m)).toISOString();
const item = (stepId: string, delivery?: string) => ({ stepId, delivery });
const queued = { dueAt: iso(14, 2) };
const noPause = new Set<string>();
/** ברירת מחדל: יש כתובת בכרטיס ואין מייל «לא ידוע». */
const line = (over: Partial<TrayQueueInput> & Pick<TrayQueueInput, 'items'>) => trayQueueLine({
  queued, pausedStepIds: noPause, now: at(14, 0), hasEmail: true, unknownPending: false, ...over,
});
const LATIN = /[A-Za-z]/;

export const TESTS: TestCase[] = [
  test('(א) שתי בקשות באישורך ואחת «לבד» — מבטיחים שליחה לבד לאחת בלבד', () => {
    const q = line({ items: [item('a', 'approve'), item('b', 'approve'), item('c', 'auto')] });
    equal(q.live, true);
    equal(q.autoCount, 1);
    equal(q.waitingCount, 2);
    assert(q.why!.startsWith('אחד יישלח לבד, לא לפני 14:02'), q.why!);
    // ‼ השאר מחכים למייל שהרו"ח שולח — לא ל«שלח עכשיו», שנעלם אחרי שהמייל האוטומטי יוצא.
    assert(q.why!.includes('השאר — במייל שתשלח'), q.why!);
    assert(!q.why!.includes(`«${SEND_NOW_LABEL}»`), q.why!);
    // ‼ בטלפון ההסבר נחתך אחרי שתי שורות — קצר.
    assert(q.why!.length <= 60, `${q.why!.length}: ${q.why}`);
    // אחרי השעה — «בדקות הקרובות», בלי שעה שעברה.
    const past = line({ items: [item('a', 'approve'), item('c', 'auto')], now: at(14, 5) });
    assert(past.why!.startsWith('אחד ייצא לבד בדקות הקרובות;'), past.why!);
    assert(!past.why!.includes('14:02'), past.why!);
  }),

  test('מייל «חדש» קודם שלא ידוע אם יצא — אין «שלח מייל…», קודם מכריעים; ההוראות לב"ל לא מחכות', () => {
    const t = unknownBlocksNewText(false);
    assert(t.includes('קודם מכריעים על המייל הקודם'), t);
    assert(t.includes('לא יוצא מייל חדש'), t);
    assert(!/לא נשלח/.test(t), t);
    assert(!LATIN.test(t), t);
    assert(t.length <= 70, `בטלפון — עד שתי שורות: ${t.length}`);
    const ni = unknownBlocksNewText(true);
    assert(ni.includes('ההוראות לביטוח לאומי') && ni.includes('עכשיו'), ni);
    assert(!LATIN.test(ni), ni);
    // רק ההוראות — מייל ייעודי, לא «מה שחדש».
    assert(NI_ONLY_WHY.includes('ביטוח לאומי') && !NI_ONLY_WHY.includes('מה שחדש'), NI_ONLY_WHY);
  }),

  test('(ב) רק בקשה באישורך, ותור קיים — אין «יישלח לבד»', () => {
    const q = line({ items: [item('a', 'approve')] });
    equal(q.live, false);
    equal(q.why, null);
    // בקשה ידנית בלי delivery — כמו «באישורך».
    const m = line({ items: [item('a')] });
    equal(m.live, false);
    equal(m.why, null);
  }),

  test('(ג) «לבד» בריצה בעצירה + באישורך — אין «יישלח לבד»', () => {
    const q = line({ items: [item('p', 'auto'), item('a', 'approve')], pausedStepIds: new Set(['p']) });
    equal(q.live, false);
    assert(!/יישלח לבד/.test(q.why ?? ''), q.why ?? '');
    equal(q.why, PAUSED_QUEUE_TEXT);
  }),

  test('(ד) אין כתובת מייל בכרטיס — לא מבטיחים «יישלח לבד», ואומרים למה', () => {
    const q = line({ items: [item('c', 'auto'), item('a', 'approve')], hasEmail: false });
    equal(q.live, false, 'בלי «שלח עכשיו» ובלי «אל תשלח לבד»');
    equal(q.why, NO_EMAIL_QUEUE_TEXT);
    assert(!/יישלח לבד/.test(q.why!), q.why!);
    assert(q.why!.includes('לא ייצא לבד'), q.why!);
    assert(q.why!.includes('אין כתובת מייל בכרטיס'), q.why!);
    assert(q.why!.includes(`«${SEND_MAIL_LABEL}»`), `שם הכפתור שנשאר: ${q.why}`);
    assert(!LATIN.test(q.why!), q.why!);
    // גם כשהשעה כבר עברה — הסיבה, לא «לא יצא לבד… אפשר לשלוח עכשיו».
    equal(line({ items: [item('c', 'auto')], hasEmail: false, now: at(14, 30) }).why, NO_EMAIL_QUEUE_TEXT);
  }),

  test('(ה) מייל קודם «לא ידוע אם יצא» — לא מבטיחים «יישלח לבד», ומפנים לשורה שלו', () => {
    const q = line({ items: [item('c', 'auto')], unknownPending: true });
    equal(q.live, false);
    equal(q.why, UNKNOWN_PENDING_QUEUE_TEXT);
    assert(q.why!.includes('«לא ידוע אם יצא המייל»'), `השם של השורה במגש: ${q.why}`);
    assert(q.why!.includes('לא ייצא לבד'), q.why!);
    assert(!/יישלח לבד/.test(q.why!), q.why!);
    assert(!LATIN.test(q.why!), q.why!);
  }),

  test('(ו) בלי פריט «לבד» — אין שורת סיבה גם בלי כתובת (אין מה להבטיח)', () => {
    equal(line({ items: [item('a', 'approve')], hasEmail: false }).why, null);
    equal(line({ items: [item('a', 'approve')], unknownPending: true }).why, null);
    equal(line({ items: [item('c', 'auto')], queued: null, hasEmail: false }).why, null);
  }),

  test('השעה היא «לא לפני» — ושעה שעברה לא מוצגת', () => {
    const before = line({ items: [item('c', 'auto')] });
    assert(before.why!.includes('לא לפני 14:02'), before.why!);
    assert(before.why!.includes('בדקות הקרובות'), before.why!);
    const after = line({ items: [item('c', 'auto')], now: at(14, 4) });
    equal(after.live, true);
    assert(after.why!.includes('בדקות הקרובות'), after.why!);
    assert(!after.why!.includes('14:02'), `שעה שעברה: ${after.why}`);
    // שתי בקשות «לבד» ושום דבר שמחכה — המשפט על המייל, בלי מספר.
    const both = line({ items: [item('c', 'auto'), item('d', 'auto')] });
    assert(both.why!.startsWith('יישלח לבד'), both.why!);
  }),

  test('תור שלא יצא רבע שעה אחרי הזמן — לא מבטיחים, מציעים לשלוח', () => {
    const q = line({ items: [item('c', 'auto')], now: at(14, 20) });
    equal(q.live, false);
    assert(q.why!.includes('לא יצא לבד'), q.why!);
    const tried = line({ items: [item('c', 'auto')], queued: { ...queued, kickAttempts: 5 } });
    equal(tried.live, false);
    assert(tried.why!.includes('5 ניסיונות'), tried.why!);
  }),

  test('בלי תור או בלי חדש — אין שורת תור', () => {
    equal(line({ items: [item('c', 'auto')], queued: null }).why, null);
    equal(line({ items: [] }).live, false);
  }),

  test('«אל תשלח לבד» — לא מבטיח שזה לא ייצא לבד אף פעם', () => {
    assert(!/לא יישלח לבד/.test(QUEUE_CANCELLED_TEXT), QUEUE_CANCELLED_TEXT);
    assert(QUEUE_CANCELLED_TEXT.includes('«שלח מייל…»'), 'שם הכפתור שנשאר');
    assert(QUEUE_CANCELLED_TEXT.includes('ייכללו'), 'אומר שהמייל האוטומטי הבא יכלול אותן');
  }),

  test('מה יוצא לבד — בשם, כשזה פריט אחד (ובקיצור)', () => {
    const named = line({ items: [{ stepId: 'a', delivery: 'approve', title: 'תלושים' }, { stepId: 'c', delivery: 'auto', title: 'אישור ניהול חשבון' }] });
    assert(named.why!.startsWith('«אישור ניהול חשבון» יישלח לבד, לא לפני 14:02;'), named.why!);
    const long = line({ items: [{ stepId: 'a', delivery: 'approve' }, { stepId: 'c', delivery: 'auto', title: 'שם ארוך מאוד של בקשה שנפתחה במסלול' }] });
    assert(long.why!.includes('…» יישלח לבד') && long.why!.length <= 80, long.why!);
  }),

  test('מסלול בעצירה שמחזיק מייל שהיה יוצא לבד — paused, והעובדה קודם עם שם המסלול', () => {
    const q = line({ items: [item('a', 'approve'), item('c', 'auto')], pausedStepIds: new Set(['c']) });
    equal(q.paused, true);
    equal(q.live, false);
    equal(line({ items: [item('a', 'approve')] }).paused, undefined);
    const t = pausedQueueText('דוח שנתי 2025');
    assert(t.startsWith('«דוח שנתי 2025» בעצירה'), t);
    assert(!LATIN.test(t), t);
    equal(pausedQueueText(''), PAUSED_QUEUE_TEXT);
  }),
];

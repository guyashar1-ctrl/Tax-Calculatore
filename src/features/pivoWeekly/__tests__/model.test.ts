// ─── בדיקות: «PIVO השבוע» — שבוע, בקשה ל-Claude, פירוק התשובה (15.10.2026) ────
import { test, equal, deepEqual, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { weekStartOf, weekLabel, buildPrompt, noteLines, recentWeeks, defaultWeek, journalText } from '../model';

const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 10); };

export const TESTS: TestCase[] = [
  test('השבוע מתחיל ביום ראשון, גם כשהיום שבת או ראשון', () => {
    equal(weekStartOf(day('2026-10-15')), '2026-10-11'); // חמישי
    equal(weekStartOf(day('2026-10-17')), '2026-10-11'); // שבת
    equal(weekStartOf(day('2026-10-11')), '2026-10-11'); // ראשון
    equal(weekStartOf(day('2026-01-01')), '2025-12-28'); // מעבר שנה
  }),

  test('שם השבוע: חודש אחד, בין חודשים ובין שנים', () => {
    equal(weekLabel('2026-10-11'), '11–17 באוקטובר 2026');
    equal(weekLabel('2026-09-27'), '27 בספטמבר – 3 באוקטובר 2026');
    equal(weekLabel('2025-12-28'), '28 בדצמבר 2025 – 3 בינואר 2026');
    equal(weekLabel('2026-10-11', false), '11–17 באוקטובר');
  }),

  test('הבקשה: טווח git מדויק לשבוע, קריאה בלבד, ופורמט התשובה', () => {
    const p = buildPrompt('2026-10-11');
    for (const s of ['11–17 באוקטובר 2026 (11.10.2026 עד 17.10.2026)', 'git log --all --since=2026-10-11 --until=2026-10-18',
      'קריאה בלבד, בלי לשנות שום דבר', 'בייצור / ב־staging / בפיתוח', '«הכי משמעותי השבוע:»']) {
      assert(p.includes(s), `בבקשה חסר: ${s}`);
    }
  }),

  test('התשובה מפורקת לשורות בלי תבליטים, מספור והדגשות', () => {
    deepEqual(noteLines('**• הצהרת הון (בייצור)**\r\n- הערכת מס\n\n2. עיר בעברית\n  * עוד דבר  \nהכי משמעותי השבוע: משהו'),
      ['הצהרת הון (בייצור)', 'הערכת מס', 'עיר בעברית', 'עוד דבר', 'הכי משמעותי השבוע: משהו']);
    deepEqual(noteLines('   \n'), []);
  }),

  test('השבועות לבחירה: הנוכחי ואחורה', () => {
    deepEqual(recentWeeks(day('2026-10-15'), 3), ['2026-10-11', '2026-10-04', '2026-09-27']);
  }),

  test('ברירת המחדל: השבוע הנוכחי; בראשון/שני — השבוע שנגמר, אם עוד ריק', () => {
    equal(defaultWeek(day('2026-10-15'), new Set()), '2026-10-11');
    equal(defaultWeek(day('2026-10-18'), new Set()), '2026-10-11'); // ראשון אחרי
    equal(defaultWeek(day('2026-10-18'), new Set(['2026-10-11'])), '2026-10-18');
    equal(defaultWeek(day('2026-10-21'), new Set()), '2026-10-18'); // רביעי
  }),

  test('כל היומן כטקסט: החדש למעלה, שורה לכל דבר', () => {
    equal(journalText([
      { weekStart: '2026-10-04', body: 'א' },
      { weekStart: '2026-10-11', body: '• ב\n• ג' },
    ]), '11–17 באוקטובר 2026\n• ב\n• ג\n\n4–10 באוקטובר 2026\n• א');
  }),
];

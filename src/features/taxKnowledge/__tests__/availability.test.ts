// ─── בדיקות: ידע המס לא מפנה ליכולת שלא שוחררה (11.10.2026) ────────────────
// ‼ מה נעול כאן: כשהיכולת כבויה ב-availability.ts (שחרור הידע ל-master), שום טקסט
// בנושאים, בפריטים הפתוחים ובפרומפט התחזוקה לא מתאר מסך או קובץ שאינם באתר —
// ומה שכן נאמר עליהם הוא «בפיתוח». כשהיכולת דולקת (ענף tax-foundation) — ההפניה חוזרת.

import { test, assert, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { AVAILABLE, NOT_RELEASED } from '../availability';
import { TOPICS, TOPIC_BY_ID } from '../topics';
import { OPEN_ITEMS } from '../../taxRules/openItems';
import { buildMaintenancePrompt } from '../maintenancePrompt';
import { ruleUsage } from '../../taxRules/impact';
import ADVANCES_BODY from '../topics/AdvancesBody.tsx?raw';
import WEALTH_BODY from '../topics/WealthBody.tsx?raw';
import COVERAGE_VIEW from '../FormCoverage.tsx?raw';

const topicText = TOPICS.flatMap(t => [t.lead, ...t.gaps]).join('\n');
const openText = OPEN_ITEMS.map(i => i.meanwhileText).join('\n');
const prompt = buildMaintenancePrompt({ kind: 'all' });

export const TESTS: TestCase[] = [
  test('הערכת מס: הנושאים והפרומפט מפנים למסך ולקוד רק כשהיא שוחררה', () => {
    equal(/ההערכה במערכת \(שלב 3\)/.test(TOPIC_BY_ID.advances.gaps.join('\n')), AVAILABLE.taxEstimate, 'פער «מקדמות»');
    equal(prompt.includes('features/taxEstimate/engine.ts'), AVAILABLE.taxEstimate, 'פרומפט: מנוע ההערכה');
    equal(prompt.includes('features/taxFile/hub.ts'), AVAILABLE.taxEstimate, 'פרומפט: תיק המס כמרכז');
    if (!AVAILABLE.taxEstimate) assert(TOPIC_BY_ID.advances.gaps.some(g => g.includes(NOT_RELEASED)), 'מקדמות: «בפיתוח»');
    // הגוף של «מקדמות» מכריע לפי הדגל — לא טקסט קשיח אחד
    assert(ADVANCES_BODY.includes('AVAILABLE.taxEstimate'), 'AdvancesBody נשען על הדגל');
  }),
  test('הצהרת הון: «בקשת הצהרת הון» מתוארת כקיימת רק כשהיא שוחררה', () => {
    const claims = /בקשת «הצהרת הון» (?:במערכת מכסה|\(230\) אוספת)/;
    equal(claims.test(topicText + '\n' + openText), AVAILABLE.wealthRequest, 'נושא ופריט פתוח');
    if (!AVAILABLE.wealthRequest) {
      assert(TOPIC_BY_ID.wealth.gaps.some(g => g.includes(NOT_RELEASED)), 'נושא: «בפיתוח»');
      assert(OPEN_ITEMS.find(i => i.id === 'wealth.content')!.meanwhileText.includes(NOT_RELEASED), 'פריט פתוח: «בפיתוח»');
    }
    assert(WEALTH_BODY.includes('AVAILABLE.wealthRequest'), 'WealthBody נשען על הדגל');
  }),
  test('דוח שנתי: ציר «ממולא בטיוטה» ונתיבי המילוי בפרומפט — רק כשהוא שוחרר', () => {
    equal(prompt.includes('annualReturn/'), AVAILABLE.annualReturn, 'פרומפט: קוד הדוח');
    equal(prompt.includes('SUPPORTED_FORM_YEARS'), AVAILABLE.annualReturn, 'פרומפט: שנות טופס נתמכות');
    assert(COVERAGE_VIEW.includes('!AVAILABLE.annualReturn ? undefined'), 'מפת הכיסוי לא מציגה מילוי כשהדוח כבוי');
  }),
  test('השפעת כלל: רכיבים של יכולת שלא שוחררה לא נרשמים כמושפעים', () => {
    const paths = ruleUsage('micro.turnoverCeiling').consumers.map(c => c.path);
    equal(paths.some(p => p.includes('features/taxEstimate')), AVAILABLE.taxEstimate, 'מנוע ההערכה');
    equal(paths.some(p => p.includes('features/taxYear')), AVAILABLE.taxYear, 'שנות מס ושאלון');
  }),
];

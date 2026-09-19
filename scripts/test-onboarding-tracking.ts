// test-onboarding-tracking.ts — «טרם נפתח» מול «אין מידע» לפי גבול המעקב (191).
// הרצה: node scripts/test-onboarding-tracking.ts
import assert from 'node:assert/strict';
import {
  LINK_OPEN_TRACKING_SINCE, linkOpenTracked, noOpenInfoLine, LINK_NOT_OPENED_LINE, LINK_OPEN_UNKNOWN_LINE,
} from '../src/lib/onboardingTracking.ts';

assert.equal(LINK_OPEN_TRACKING_SINCE, '2026-09-19T07:26:02Z', 'הגבול = רגע ההחלה של 191 על הפרודקשן');
// בקשה מלפני המעקב — כמו 9cec3ac2 (1.9.2026) — אין מידע
assert.equal(linkOpenTracked('2026-09-01T08:54:55.677Z'), false);
assert.equal(noOpenInfoLine('2026-09-01T08:54:55.677Z'), LINK_OPEN_UNKNOWN_LINE);
// רגע לפני הגבול — עדיין אין מידע
assert.equal(noOpenInfoLine('2026-09-19T07:26:01Z'), LINK_OPEN_UNKNOWN_LINE);
// מהגבול והלאה — טרם נפתח
assert.equal(noOpenInfoLine('2026-09-19T07:26:02Z'), LINK_NOT_OPENED_LINE);
assert.equal(noOpenInfoLine('2026-09-20T10:00:00+03:00'), LINK_NOT_OPENED_LINE);
// בלי תאריך / תאריך לא תקין — לא ממציאים «אין מידע»
assert.equal(noOpenInfoLine(undefined), LINK_NOT_OPENED_LINE);
assert.equal(noOpenInfoLine('not-a-date'), LINK_NOT_OPENED_LINE);
console.log('7 passed');

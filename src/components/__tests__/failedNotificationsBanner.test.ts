// ─── בדיקות: באנר ההתראות שנכשלו — סיבה בעברית, לא תשובת הספק הגולמית ───────
import { test, equal } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import { failureReasonText as f } from '../../lib/providerErrorText';

export const TESTS: TestCase[] = [
  test('מפתח שגוי (401) — «הגדרת שליחת המיילים»', () => {
    equal(f('{"statusCode":401,"name":"validation_error","message":"API key is invalid"}'), 'הגדרת שליחת המיילים במערכת לא תקינה');
    equal(f('{"message":"API key is invalid","name":"validation_error","statusCode":401}'), 'הגדרת שליחת המיילים במערכת לא תקינה');
  }),
  test('הספק לא זמין — רשת או 5xx', () => {
    equal(f('resend_unreachable: TypeError: fetch failed'), 'שירות המייל לא היה זמין');
    equal(f('{"statusCode":503,"message":"x"}'), 'שירות המייל לא היה זמין');
  }),
  test('דחייה אחרת — בלי הקוד; מספר בכתובת אינו 5xx', () => {
    equal(f('{"statusCode":422,"message":"Invalid to field user523@x.com"}'), 'שירות המייל דחה את השליחה');
  }),
  test('הודעה שכבר בעברית — כמו שהיא', () => {
    equal(f('לא נמצאו הנתונים שההתראה מתייחסת אליהם'), 'לא נמצאו הנתונים שההתראה מתייחסת אליהם');
  }),
];

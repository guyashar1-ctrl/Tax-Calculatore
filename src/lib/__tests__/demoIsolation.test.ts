// ─── בידוד מסכי ההדגמה מהייצור — demoIsolation.ts ─────────────────────────────
// ‼ נמצא ב-03.10: שרת פיתוח שהופעל בלי מצב ההדגמה טען את כתובת הייצור והתחבר
// בעצמו גם במסכי ההדגמה. הכלל: מסך הדגמה/בדיקה + כתובת ייצור + dev ⇒ מבודד.
import { test, equal, assert, type TestCase } from '../../testkit/tinyTest';
import {
  ISOLATED_SUPABASE_URL, effectiveSupabaseUrl, isDemoRoute, isProductionUrl, requestUrlOf, shouldIsolateFromProduction,
} from '../demoIsolation';

const PROD = 'https://uoweoqtuiettozagwgdw.supabase.co';
const STAGING = 'https://evdfxjqrkgugssfrdoxd.supabase.co';

export const TESTS: TestCase[] = [
  test('כל מסכי ההדגמה והבדיקה מזוהים', () => {
    for (const s of ['?office-app', '?office-app#/clients', '?demo', '?flows-demo', '?portal=demo&office-app', '?portal=demo',
      '?test-requests&sc=ni', '?test-exec&scenario=shaam-suspended', '?test-institutions&client=x', '?test-office', '?x=1&test-sig']) {
      assert(isDemoRoute(s), s);
    }
  }),

  test('האפליקציה עצמה ודפים אמיתיים של לקוחות אינם הדגמה', () => {
    for (const s of ['', '?portal=abc123', '?quote=abc', '?sign=tok', '?release=tok', '?demo-not=1', '?testing=1']) {
      assert(!isDemoRoute(s), s || '(ריק)');
    }
  }),

  test('מסך הדגמה מול הייצור ⇒ מבודד, והכתובת לא מובילה לשום מקום', () => {
    assert(shouldIsolateFromProduction(true, '?test-exec', PROD), 'test-exec');
    assert(shouldIsolateFromProduction(true, '?portal=demo&office-app', PROD), 'portal demo');
    equal(effectiveSupabaseUrl(true, PROD), ISOLATED_SUPABASE_URL);
    assert(!isProductionUrl(ISOLATED_SUPABASE_URL), 'הכתובת החלופית אינה ייצור');
  }),

  test('סביבת הבדיקות לא נחסמת — מסכי הבדיקה שם צריכים אותה', () => {
    assert(!shouldIsolateFromProduction(true, '?test-institutions&client=x', STAGING), 'staging');
    equal(effectiveSupabaseUrl(false, STAGING), STAGING);
  }),

  test('האפליקציה עצמה בשרת הפיתוח ובבנייה לייצור — ללא שינוי', () => {
    assert(!shouldIsolateFromProduction(true, '', PROD), 'הכתובת הרגילה בשרת הפיתוח');
    assert(!shouldIsolateFromProduction(false, '?test-exec', PROD), 'בנייה לייצור: DEV=false');
    equal(effectiveSupabaseUrl(false, PROD), PROD);
  }),

  test('כתובת הבקשה נקראת מכל צורה — מחרוזת, URL, Request', () => {
    equal(requestUrlOf(`${PROD}/rest/v1/clients`), `${PROD}/rest/v1/clients`);
    equal(requestUrlOf(new URL(`${PROD}/auth/v1/token`)), `${PROD}/auth/v1/token`);
    equal(requestUrlOf({ url: `${PROD}/functions/v1/x` }), `${PROD}/functions/v1/x`);
    assert(isProductionUrl(requestUrlOf({ url: `${PROD}/functions/v1/x` })), 'Request לייצור מזוהה');
  }),
];

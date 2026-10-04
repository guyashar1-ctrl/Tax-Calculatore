// ─── הקודים שהשרת מחזיר בפועל (216 §9, 217) — לכל אחד משפט בעברית ───────────
// ‼ קורא את גופי הפונקציות מקבצי ה-SQL: retry_kind_hold (ועוטפת השחרור), retry_request_creation
// (ומה ש-flow_run_add_items מעביר), hide_step_from_client. קוד חדש בשרת בלי טקסט כאן — נופל.
// קוד לא מוכר — «לא הצלחנו — נסה שוב», לעולם לא «נכשל».
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert, type TestCase } from '../../../testkit/tinyTest';
import {
  GENERIC_RETRY_TEXT, HIDE_STEP_ERROR_TEXT, RETRY_CREATION_ERROR_TEXT, RETRY_KIND_HOLD_ERROR_TEXT,
  hideStepErrorText, retryCreationText, retryKindHoldErrorText,
} from '../api';

const SUPA = join(process.cwd(), 'supabase');
const sql = (f: string) => readFileSync(join(SUPA, f), 'utf8');

/** גוף הפונקציה (ההגדרה האחרונה בקובץ) — עד סוף ה-$$ / $function$ שלה. */
function body(file: string, fn: string): string {
  const s = sql(file);
  const at = s.lastIndexOf(`create or replace function public.${fn}(`);
  assert(at >= 0, `${fn} ב-${file}`);
  const rest = s.slice(at);
  const open = rest.match(/as \$(\w*)\$/);
  assert(!!open, `${fn}: תחילת הגוף`);
  const tag = `$${open![1]}$`;
  const from = rest.indexOf(tag) + tag.length;
  return rest.slice(from, rest.indexOf(tag, from));
}
/** כל 'error', '<קוד>' שבגוף. */
const errorCodes = (b: string) => [...b.matchAll(/'error',\s*'([a-z_]+)'/g)].map(m => m[1]);

const hasText = (table: Record<string, string>, code: string) => typeof table[code] === 'string' && table[code].trim() !== '';
const noCodes = (t: string) => assert(!/[a-z]{3,}_[a-z]/i.test(t) && !/נכשל/.test(t), `בלי קוד ובלי «נכשל»: ${t}`);

export const TESTS: TestCase[] = [
  test('retry_kind_hold (217): כל קוד — משפט; גם מה שעוטפת השחרור ו-release_kind_hold מחזירות', () => {
    const codes = new Set([
      ...errorCodes(body('217-requests-integrity.sql', 'retry_kind_hold')),
      ...errorCodes(body('217-requests-integrity.sql', '_release_kind_hold_safe')),
      ...errorCodes(body('217-requests-integrity.sql', 'release_kind_hold')),
    ]);
    assert(codes.has('release_failed') && codes.has('kind_unknown') && codes.has('forbidden'), [...codes].join(','));
    for (const c of codes) assert(hasText(RETRY_KIND_HOLD_ERROR_TEXT, c), `retry_kind_hold: ${c}`);
  }),

  test('retry_request_creation (217): כל קוד — משפט, כולל מה ש-flow_run_add_items מעביר', () => {
    const codes = new Set([
      ...errorCodes(body('217-requests-integrity.sql', 'retry_request_creation')),
      ...errorCodes(body('215-flows.sql', 'flow_run_add_items')),
    ]);
    for (const c of ['not_a_problem', 'entry_not_found', 'not_running', 'forbidden']) assert(codes.has(c), c);
    for (const c of codes) assert(hasText(RETRY_CREATION_ERROR_TEXT, c), `retry_request_creation: ${c}`);
  }),

  test('hide_step_from_client (216 §9): כל קוד — משפט', () => {
    const codes = new Set(errorCodes(body('216-flows-onboarding-integration.sql', 'hide_step_from_client')));
    for (const c of ['forbidden', 'step_not_found', 'not_a_request', 'has_client_content']) assert(codes.has(c), c);
    for (const c of codes) assert(hasText(HIDE_STEP_ERROR_TEXT, c), `hide_step_from_client: ${c}`);
  }),

  test('קוד לא מוכר / אין קוד ⇒ «לא הצלחנו — נסה שוב», בלי «נכשל» ובלי קוד', () => {
    equal(GENERIC_RETRY_TEXT, 'לא הצלחנו — נסה שוב');
    for (const c of ['brand_new_code', '', null, undefined]) {
      equal(retryKindHoldErrorText(c), GENERIC_RETRY_TEXT);
      equal(hideStepErrorText(c), GENERIC_RETRY_TEXT);
    }
    equal(retryCreationText({ ok: false, error: 'brand_new_code' }, 'x').text, GENERIC_RETRY_TEXT);
    for (const t of [...Object.values(RETRY_KIND_HOLD_ERROR_TEXT), ...Object.values(RETRY_CREATION_ERROR_TEXT),
      ...Object.values(HIDE_STEP_ERROR_TEXT)]) noCodes(t);
  }),

  test('retryCreationText: הצורה של 217 — how / reason / attempts', () => {
    equal(retryCreationText({ ok: true, resolved: true, how: 'created', stepId: 's1' }, 'מסמכים').text, 'נוצרה — «מסמכים» ברשימה');
    equal(retryCreationText({ ok: true, resolved: true, how: 'exists', reason: 'exists', stepId: 's1' }, 'x').text, 'כבר קיימת אצל הלקוח — השורה נסגרה');
    equal(retryCreationText({ ok: true, resolved: true, how: 'not_applicable', reason: 'not_applicable' }, 'x').text, 'לא חלה עוד על הלקוח — השורה נסגרה');
    // שרת שמחזיר רק reason (בלי how)
    equal(retryCreationText({ ok: true, resolved: true, reason: 'exists' }, 'x').text, 'כבר קיימת אצל הלקוח — השורה נסגרה');
    const again = retryCreationText({ ok: true, resolved: false, reason: 'no_requirements', attempts: 3 }, 'x');
    equal(again.text, 'עדיין לא נוצרה — הסיבה עודכנה בשורה');
    noCodes(again.text);
  }),
];

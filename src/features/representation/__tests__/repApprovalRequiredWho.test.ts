// ─── (H2.5b) אישור הייצוג כשהוא נדרש — של מי? (04.10.2026) ─────────────────────
// ‼ מה נעול כאן: «שלך» רק כשבעל הכרטיס עצמו ממתין; בת הזוג — בשמה; שניהם — «שלך ושל רחל»;
//   אף אחד לא מסומן כממתין ⇒ null (ומי שקורא נשאר בנוסח הקבוע). אותו כלל בשרת
//   (_rep_approval_required_sub ב-217) — שורת המשנה בדף; כאן — התזכורת במייל.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { REP_PORTAL_CARD_DEFAULTS, repApprovalRequiredWho } from '../../../../supabase/functions/_shared/repTemplates.ts';
import { REP_CLIENT_APPROVAL } from '../../../types/onboarding';

const DAVID = { person: 'client', name: 'דוד', systems: ['מע״מ'] };
const RACHEL = { person: 'spouse', name: 'רחל', systems: ['מס הכנסה', 'מע״מ'] };

export const TESTS: TestCase[] = [
  test('בעל הכרטיס ממתין ⇒ «שלך»; בת הזוג ⇒ «של רחל»; שניהם ⇒ «שלך ושל רחל»', () => {
    equal(repApprovalRequiredWho([{ ...DAVID, awaiting: ['מע״מ'] }, RACHEL]), 'שלך');
    equal(repApprovalRequiredWho([DAVID, { ...RACHEL, awaiting: ['מס הכנסה'] }]), 'של רחל');
    equal(repApprovalRequiredWho([{ ...DAVID, awaiting: ['מע״מ'] }, { ...RACHEL, awaiting: ['מס הכנסה'] }]), 'שלך ושל רחל');
  }),

  test('בת הזוג בלי שם ⇒ «של בן/בת הזוג» (לא «שלך»)', () => {
    equal(repApprovalRequiredWho([{ person: 'spouse', name: '  ', systems: [], awaiting: ['מע״מ'] }]), 'של בן/בת הזוג');
    equal(repApprovalRequiredWho([{ person: 'spouse', systems: [], awaiting: ['מע״מ'] }]), 'של בן/בת הזוג');
  }),

  test('אף אחד לא מסומן כממתין / אין נתון / קלט משונה ⇒ null', () => {
    equal(repApprovalRequiredWho([DAVID, RACHEL]), null);
    equal(repApprovalRequiredWho([{ ...DAVID, awaiting: [] }]), null);
    equal(repApprovalRequiredWho([]), null);
    equal(repApprovalRequiredWho(null), null);
    equal(repApprovalRequiredWho({ person: 'client', awaiting: ['מע״מ'] }), null);
    equal(repApprovalRequiredWho([{ person: 'other', name: 'x', awaiting: ['מע״מ'] }, 7, null]), null);
  }),

  test('אותו כלל בשרת: _rep_approval_required_sub ב-217 בונה «נדרש - רשות המסים ממתינה לאישור » + «שלך» / «של {שם}» / «בן/בת הזוג», מחוברים ב-« ו»', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase', '217-requests-integrity.sql'), 'utf8');
    const at = sql.indexOf('create or replace function public._rep_approval_required_sub');
    assert(at >= 0, 'הפונקציה חסרה ב-217');
    const body = sql.slice(at, sql.indexOf('$function$;', at));
    for (const piece of ["'נדרש - רשות המסים ממתינה לאישור '", "concat_ws(' ו'", "then 'שלך'", "'של ' || coalesce(name, 'בן/בת הזוג')"]) {
      assert(body.includes(piece), `חסר בשרת: ${piece}`);
    }
  }),

  test('משך אחד בכרטיס הזירוז: «שתי דקות» בשורת המשנה ובהסבר — זהה בקוד ובשרת (217), בלי «שלוש דקות»', () => {
    equal(REP_PORTAL_CARD_DEFAULTS.sub, REP_CLIENT_APPROVAL.sub);
    assert(REP_PORTAL_CARD_DEFAULTS.sub.includes('שתי דקות'), REP_PORTAL_CARD_DEFAULTS.sub);
    assert(REP_PORTAL_CARD_DEFAULTS.note.includes('שתי דקות'), 'ההסבר');
    const sql = readFileSync(join(process.cwd(), 'supabase', '217-requests-integrity.sql'), 'utf8');
    const at = sql.search(/CREATE OR REPLACE FUNCTION public\.ensure_rep_client_approval_step/i);
    assert(at >= 0, 'ensure_rep_client_approval_step חסרה ב-217');
    const body = sql.slice(at, sql.indexOf('$function$;', at + 80));
    assert(body.includes(`'${REP_PORTAL_CARD_DEFAULTS.sub}'`), 'שורת המשנה בשרת שונה מהקוד');
    assert(!body.includes('שלוש דקות'), 'נשאר «שלוש דקות» בשרת');
  }),
];

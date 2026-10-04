// ─── «לא ידוע אם יצא» — מייל החתימה, תזכורת ההצעה וקישור הייצוג (ביקורת C4-b) ──
// ‼ מה נעול כאן (04.10.2026):
//   · מייל החתימה (מסך בקשת הייצוג): אין תשובה / שער / 5xx בלי קוד / unknown_outcome ⇒
//     UNKNOWN_OUTCOME_TEXT **לבדו** — מרכז הייצוג מציג אותו כתום. «המייל לא נשלח (…)» —
//     רק לדחייה ודאית, ובעברית בלבד.
//   · App: תזכורת להצעה וקישור הייצוג במייל — אותה הכרעה (isUncertainSendReply); החלון
//     של הייצוג מקבל emailUnknown ומציג כתום, לא «המייל לא נשלח».

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';
import { test, equal, assert, type TestCase } from '../../testkit/tinyTest';
import { isUnknownSendReply } from '../../types/emailActivity';
import { UNKNOWN_OUTCOME_TEXT, unknownOutcomeReply } from '../../../supabase/functions/_shared/resendResult';
import { errorTextFromBody, isUnknownEmailFailure } from '../../features/flows/noticeText';

const ROOT = process.cwd();
const SRC = (p: string) => join(ROOT, 'src', p);
const read = (f: string) => readFileSync(f, 'utf8');
const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;

/** הצהרות עליונות מקובץ מסך, מהודרות ומורצות עם התלויות בשם — בלי לייבא את המסך. */
function loadDecls<T extends Record<string, unknown>>(file: string, names: string[], deps: Record<string, unknown> = {}): T {
  const ts = createRequire(join(ROOT, 'package.json'))('typescript') as typeof TS;
  const source = read(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const parts: string[] = [];
  const found = new Set<string>();
  sf.forEachChild(n => {
    if (ts.isFunctionDeclaration(n) && n.name && names.includes(n.name.text)) {
      parts.push(n.getText(sf)); found.add(n.name.text);
    } else if (ts.isVariableStatement(n)) {
      const hit = n.declarationList.declarations.map(d => (ts.isIdentifier(d.name) ? d.name.text : '')).filter(x => names.includes(x));
      if (hit.length) { parts.push(n.getText(sf)); hit.forEach(h => found.add(h)); }
    }
  });
  const missing = names.filter(x => !found.has(x));
  if (missing.length) throw new Error(`לא נמצאו ב-${file}: ${missing.join(', ')}`);
  const js = ts.transpileModule(parts.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const depNames = Object.keys(deps);
  return new Function(...depNames, `${js}\nreturn { ${names.join(', ')} };`)(...depNames.map(k => deps[k])) as T;
}

/** תשובת שגיאה עם גוף JSON (FunctionsHttpError) — context הוא ה-Response. */
const httpError = (status: number, body: unknown) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: { status, clone: () => ({ json: async () => body, text: async () => JSON.stringify(body) }) },
});
/** שער שענה ב-HTML — אין גוף JSON. */
const htmlError = (status: number) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: { status, clone: () => ({ json: async () => { throw new Error('not json'); }, text: async () => '<html>Gateway Timeout</html>' }) },
});
/** החיבור נפל — אין תשובה בכלל. */
const fetchError = { message: 'Failed to send a request to the Edge Function', context: new Error('network') };

type SignHelpers = { signatureSendResult: (data: unknown, error: unknown) => Promise<string | null>; SIGN_SEND_ERRORS: Record<string, string> };
const sign = () => loadDecls<SignHelpers>(SRC('components/RepresentationRequestReview.tsx'),
  ['SIGN_SEND_ERRORS', 'signReplyBody', 'signatureSendResult'],
  { isUnknownSendReply, isUnknownEmailFailure, errorTextFromBody, UNKNOWN_OUTCOME_TEXT });

type AppHelpers = {
  isUncertainSendReply: (body: Record<string, unknown> | null, error: unknown, table: Record<string, string>) => boolean;
  functionReplyBody: (data: unknown, error: unknown) => Promise<Record<string, unknown> | null>;
  QUOTE_REMINDER_SEND_ERRORS: Record<string, string>;
  ONBOARD_LINK_SEND_ERRORS: Record<string, string>;
};
const app = () => loadDecls<AppHelpers>(SRC('App.tsx'),
  ['AUTH_EXPIRED_TEXT', 'QUOTE_REMINDER_SEND_ERRORS', 'ONBOARD_LINK_SEND_ERRORS', 'functionReplyBody', 'functionReplyStatus', 'isUncertainSendReply'],
  { isUnknownSendReply, isUnknownEmailFailure });

/** מה החלון / מרכז הייצוג יקבל מהמארח: null, המשפט של «לא ידוע», או סיבה. */
async function appVerdict(error: unknown, table: 'QUOTE_REMINDER_SEND_ERRORS' | 'ONBOARD_LINK_SEND_ERRORS', data: unknown = null) {
  const h = app();
  const body = await h.functionReplyBody(data, error);
  return h.isUncertainSendReply(body, error, h[table]) ? 'unknown' : errorTextFromBody(body as never, h[table], 'השרת דחה את השליחה');
}

export const TESTS: TestCase[] = [
  // ── מייל החתימה ──────────────────────────────────────────────────────────
  test('מייל החתימה: אין תשובה / שער HTML / 5xx בלי קוד / unknown_outcome ⇒ המשפט של «לא ידוע» לבדו', async () => {
    const s = sign();
    for (const err of [fetchError, htmlError(504), httpError(500, { error: 'TypeError: boom' }), httpError(502, unknownOutcomeReply('network: reset'))]) {
      const r = await s.signatureSendResult(null, err);
      equal(r, UNKNOWN_OUTCOME_TEXT);
      assert(isUnknownSendReply(r), 'מרכז הייצוג מזהה אותו כ«לא ידוע»');
    }
  }),
  test('מייל החתימה: דחייה ודאית ⇒ «המייל לא נשלח (…)» בעברית, בלי טקסט הספק', async () => {
    const s = sign();
    equal(await s.signatureSendResult(null, httpError(400, { error: 'signer not found' })), 'המייל לא נשלח (לחותם אין כתובת מייל או קישור חתימה)');
    const provider = await s.signatureSendResult(null, httpError(502, { error: 'resend_failed', detail: { name: 'validation_error', message: 'API key is invalid' } }));
    equal(provider, 'המייל לא נשלח (ספק הדואר דחה את המייל)');
    const ni = await s.signatureSendResult(null, httpError(400, { error: 'ni_reference_missing', detail: { message: 'התבקש ייצוג בביטוח לאומי - יש להזין את מספר האסמכתא לפני השליחה.' } }));
    assert(ni?.startsWith('המייל לא נשלח (התבקש ייצוג בביטוח לאומי') ?? false, String(ni));
    const odd = await s.signatureSendResult(null, httpError(403, { error: 'internal_calls_send_sign_only' }));
    assert(!!odd && HEBREW.test(odd) && !LATIN.test(odd), String(odd));
  }),
  test('מייל החתימה: הצלחה ⇒ null; הטבלה — עברית בלבד, בלי unknown_outcome', async () => {
    const s = sign();
    equal(await s.signatureSendResult({ ok: true, id: 'x' }, null), null);
    for (const [k, v] of Object.entries(s.SIGN_SEND_ERRORS)) assert(HEBREW.test(v) && !LATIN.test(v), `${k}: ${v}`);
    assert(!('unknown_outcome' in s.SIGN_SEND_ERRORS), 'unknown אינו «לא נשלח»');
  }),

  // ── App: תזכורת להצעה וקישור הייצוג ─────────────────────────────────────
  test('תזכורת להצעה: אין תשובה / שער / 5xx בלי קוד / unknown_outcome ⇒ «לא ידוע»', async () => {
    for (const err of [fetchError, htmlError(504), httpError(500, { error: 'TypeError: boom' }), httpError(502, unknownOutcomeReply('http 502'))]) {
      equal(await appVerdict(err, 'QUOTE_REMINDER_SEND_ERRORS'), 'unknown');
    }
  }),
  test('תזכורת להצעה: הספק דחה / אין נמען ⇒ משפט בעברית שאומר שלא נשלחה', async () => {
    const r = await appVerdict(httpError(502, { error: 'resend_failed', detail: { message: 'API key is invalid' } }), 'QUOTE_REMINDER_SEND_ERRORS');
    assert(r.includes('לא נשלחה') && !LATIN.test(r), r);
    const n = await appVerdict(httpError(400, { error: 'no recipient email' }), 'QUOTE_REMINDER_SEND_ERRORS');
    assert(n.includes('אין כתובת מייל'), n);
  }),
  test('קישור הייצוג במייל: אין תשובה ⇒ «לא ידוע»; אין כתובת ⇒ סיבה קצרה בעברית', async () => {
    equal(await appVerdict(fetchError, 'ONBOARD_LINK_SEND_ERRORS'), 'unknown');
    equal(await appVerdict(httpError(400, { error: 'no client email' }), 'ONBOARD_LINK_SEND_ERRORS'), 'אין כתובת מייל בבקשה');
  }),
  test('הטבלאות ב-App: עברית בלבד, בלי unknown_outcome', () => {
    const h = app();
    for (const [k, v] of Object.entries({ ...h.QUOTE_REMINDER_SEND_ERRORS, ...h.ONBOARD_LINK_SEND_ERRORS })) {
      assert(HEBREW.test(v) && !LATIN.test(v), `${k}: ${v}`);
    }
    assert(!('unknown_outcome' in h.QUOTE_REMINDER_SEND_ERRORS) && !('unknown_outcome' in h.ONBOARD_LINK_SEND_ERRORS), 'unknown אינו «לא נשלח»');
  }),
  test('מקור: התזכורת — «לא ידוע» גם בחריגה, ורישום האירוע אחרי השליחה אינו הופך אותה ל«לא נשלחה»', () => {
    const src = read(SRC('App.tsx'));
    const fn = src.slice(src.indexOf('async function sendQuotationReminder'), src.indexOf('async function handleCreateRepresentationFromQuotation'));
    assert(fn.includes('if (isUncertainSendReply(body, error, QUOTE_REMINDER_SEND_ERRORS)) return UNKNOWN_OUTCOME_TEXT;'), 'הכרעה אחת');
    assert(/catch \{\s*\/\/[^\n]*\n\s*return UNKNOWN_OUTCOME_TEXT;/.test(fn), 'חריגה ⇒ לא ידוע');
    assert(/try \{\s*await updateQuotation\([\s\S]*?\} catch \(e\) \{\s*console\.warn/.test(fn), 'כשל ברישום האירוע — לא כשל שליחה');
    assert(!fn.includes('edgeFunctionError'), 'בלי הטקסט הגולמי של השגיאה');
  }),
  test('מקור: חלון הייצוג — emailUnknown כתום, ו«המייל לא נשלח» רק כשהשרת הכריע', () => {
    const src = read(SRC('components/RepresentationOnboardingDialog.tsx'));
    assert(src.includes('emailUnknown?: boolean'), 'הדגל מגיע מהמארח');
    assert(/result\.emailUnknown && \([\s\S]*?var\(--chip-amber-tx\)[\s\S]*?לא ידוע אם המייל יצא/.test(src), 'כתום, «לא ידוע אם המייל יצא»');
    assert(src.includes('!result.emailSent && !result.emailUnknown && result.emailError'), '«לא נשלח» רק בלי unknown');
  }),
];

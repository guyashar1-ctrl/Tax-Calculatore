// ─── בדיקות: «לא ידוע אם יצא» אצל המארחים — לעולם לא «נכשל», ולא «נשלח» ──────
// ‼ מה נעול כאן (סבב 4):
//   · App: קישור המילוי ודרישת התשלום מעבירים לחלון משפט שמבחין בין «לא נשלח»
//     (עברית, אדום) ל«לא ידוע אם יצא» (המשפט של השרת, כתום). דרישת תשלום שלא ידוע
//     אם יצאה נשארת «נשלחה» גם בדפדפן — רק כשהשרת החדש שמר את התפיסה.
//   · מכתב לרו"ח קודם: unknown כתום עם הצעד הבטוח; שליחה נוספת רק אחרי אישור.
//   · מרכז הייצוג: ניסיון שלא ידוע אם יצא אינו «נשלח», ושליחה נוספת עוברת אישור.
//   · מיילי ההצעה: unknown כתום עם הסיבה, לא «השליחה נכשלה» ולא «הגיע/נפתח».
//   · signing-session מעביר unknown_outcome כמו שהוא; weekly-backup מסווג דרך postResend.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';
import { test, equal, assert } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import {
  isUnknownSendReply, sendErrorView, unknownSendText,
} from '../../types/emailActivity';
import {
  UNKNOWN_OUTCOME_TEXT, isUnknownOutcome, unknownOutcomeReply,
} from '../../../supabase/functions/_shared/resendResult';
import { errorTextFromBody, isUnknownEmailFailure } from '../../features/flows/noticeText';

const ROOT = process.cwd();
const SRC = (p: string) => join(ROOT, 'src', p);
const FN = (name: string) => join(ROOT, 'supabase/functions', name, 'index.ts');
const read = (f: string) => readFileSync(f, 'utf8');
const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;

/**
 * הצהרות עליונות (פונקציות / קבועים) מתוך קובץ מסך — מהודרות ומורצות כמו שהן,
 * עם התלויות שהן מייבאות מוזרקות בשם. ‼ בלי לייבא את המסך (App וחבריו מושכים
 * את כל האפליקציה).
 */
function loadDecls<T extends Record<string, unknown>>(file: string, names: string[], deps: Record<string, unknown> = {}): T {
  const ts = createRequire(join(ROOT, 'package.json'))('typescript') as typeof TS;
  const source = read(file);
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
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

/** שגיאת supabase.functions.invoke עם תשובה (FunctionsHttpError) — context הוא ה-Response. */
const httpError = (status: number, body: unknown) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: {
    status,
    clone: () => ({ json: async () => body, text: async () => JSON.stringify(body) }),
  },
});
/** החיבור נפל — אין תשובה בכלל. */
const fetchError = { message: 'Failed to send a request to the Edge Function', context: new Error('network') };

// edgeFunctionError — כמו המקור (utils/functionError), בלי לייבא את המסך.
async function edgeFunctionError(error: unknown, fallback = 'שגיאה לא ידועה'): Promise<string> {
  const ctx = (error as { context?: { text?: () => Promise<string>; clone?: () => { text: () => Promise<string> } } } | null)?.context;
  if (ctx && typeof ctx.clone === 'function') {
    const raw = await ctx.clone().text();
    const parsed = JSON.parse(raw) as { detail?: { message?: string }; message?: string; error?: string };
    const pick = parsed.detail?.message ?? parsed.message ?? parsed.error;
    if (typeof pick === 'string' && pick.trim()) return pick.trim();
  }
  const msg = (error as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}

type AppHelpers = {
  functionReplyBody: (data: unknown, error: unknown) => Promise<Record<string, unknown> | null>;
  emailSendErrorText: (body: Record<string, unknown> | null, error: unknown, table: Record<string, string>) => Promise<string>;
  APPLY_LINK_SEND_ERRORS: Record<string, string>;
  CHARGE_SEND_ERRORS: Record<string, string>;
};
const app = () => loadDecls<AppHelpers>(SRC('App.tsx'),
  ['AUTH_EXPIRED_TEXT', 'APPLY_LINK_SEND_ERRORS', 'CHARGE_SEND_ERRORS', 'functionReplyBody', 'emailSendErrorText'],
  { isUnknownSendReply, UNKNOWN_OUTCOME_TEXT, edgeFunctionError });

/** מה החלון (NewPersonDialog / PersonDirectory) יעשה עם המשפט. */
async function appSendView(data: unknown, error: unknown, table: 'APPLY_LINK_SEND_ERRORS' | 'CHARGE_SEND_ERRORS') {
  const h = app();
  const msg = await h.emailSendErrorText(await h.functionReplyBody(data, error), error, h[table]);
  return { msg, view: sendErrorView(msg) };
}

type ReleaseHelpers = {
  RELEASE_SEND_ERRORS: Record<string, string>;
  replyBody: (error: unknown) => Promise<{ error?: string; detail?: { message?: string } } | null>;
  replyStatus: (error: unknown) => number | null;
};
const release = () => loadDecls<ReleaseHelpers>(SRC('components/quotations/ReleaseLetterDialog.tsx'),
  ['RELEASE_SEND_ERRORS', 'replyBody', 'replyStatus']);

/** אותה הכרעה כמו handleSend בחלון המכתב. */
async function releaseOutcome(error: unknown, res?: unknown): Promise<{ kind: 'unknown' | 'err'; text: string }> {
  const r = release();
  const b = (res ?? await r.replyBody(error)) as { error?: string; detail?: { message?: string } } | null;
  if (isUnknownSendReply(b) || isUnknownEmailFailure(b, r.replyStatus(error), r.RELEASE_SEND_ERRORS)) {
    return { kind: 'unknown', text: unknownSendText({ what: 'המכתב', recipient: 'הרו״ח הקודם' }) };
  }
  return { kind: 'err', text: errorTextFromBody(b, r.RELEASE_SEND_ERRORS, 'השליחה נכשלה — המכתב לא נשלח.') };
}

const unknownBody = (extra: Record<string, unknown> = {}) => ({ ...unknownOutcomeReply('network: reset'), ...extra });

export const TESTS: TestCase[] = [
  // ── App: קישור המילוי ────────────────────────────────────────────────────
  test('קישור המילוי: unknown_outcome ⇒ המשפט של השרת ⇒ כתום, לא «נכשל»', async () => {
    const { msg, view } = await appSendView(null, httpError(502, unknownBody()), 'APPLY_LINK_SEND_ERRORS');
    equal(msg, UNKNOWN_OUTCOME_TEXT);
    equal(view.tone, 'unknown');
    assert(!view.text.includes('נכשל'), view.text);
  }),
  test('קישור המילוי: הספק דחה ⇒ משפט בעברית שאומר שלא נשלח ⇒ אדום', async () => {
    const { msg, view } = await appSendView(null, httpError(502, { error: 'resend_failed', detail: { message: 'API key is invalid' } }), 'APPLY_LINK_SEND_ERRORS');
    assert(HEBREW.test(msg) && !LATIN.test(msg), msg);
    assert(msg.includes('לא נשלח'), msg);
    equal(view.tone, 'failed');
  }),
  test('קישור המילוי: אין תשובה בכלל ⇒ כתום «לא התקבלה תשובה ברורה»', async () => {
    const { view } = await appSendView(null, fetchError, 'APPLY_LINK_SEND_ERRORS');
    equal(view.tone, 'unknown');
  }),
  test('קישור המילוי: 500 עם קוד לא מוכר ⇒ כתום, לא «נכשל»', async () => {
    const { view } = await appSendView(null, httpError(500, { error: 'TypeError: boom' }), 'APPLY_LINK_SEND_ERRORS');
    equal(view.tone, 'unknown');
  }),
  test('הטבלאות ב-App: כל משפט בעברית, בלי קוד', () => {
    const h = app();
    for (const [k, v] of Object.entries({ ...h.APPLY_LINK_SEND_ERRORS, ...h.CHARGE_SEND_ERRORS })) {
      assert(HEBREW.test(v) && !LATIN.test(v), `${k}: ${v}`);
    }
    assert(!('unknown_outcome' in h.APPLY_LINK_SEND_ERRORS) && !('unknown_outcome' in h.CHARGE_SEND_ERRORS), 'unknown לא בטבלת «לא נשלח»');
  }),
  test('functionReplyBody: גוף מה-context; null כשאין תשובה או כשהגוף אינו JSON', async () => {
    const h = app();
    equal((await h.functionReplyBody(null, httpError(502, { error: 'x' })))?.error, 'x');
    equal(await h.functionReplyBody(null, fetchError), null);
    const notJson = { context: { clone: () => ({ json: async () => { throw new Error('not json'); } }) } };
    equal(await h.functionReplyBody(null, notJson), null);
    equal((await h.functionReplyBody({ ok: false, error: 'y' }, null))?.error, 'y');
  }),

  // ── App: דרישת תשלום ─────────────────────────────────────────────────────
  test('דרישת תשלום: unknown ⇒ החלון מקבל את המשפט של השרת (כתום, «לא תישלח שוב מכאן»)', async () => {
    const { msg } = await appSendView(null, httpError(502, unknownBody({ requestedAt: '2026-10-03T10:00:00Z' })), 'CHARGE_SEND_ERRORS');
    assert(isUnknownSendReply(msg), msg);
  }),
  test('דרישת תשלום: מסמנים «נשלחה» רק כשהשרת החדש שמר את התפיסה (unknown_outcome), לא על resend_unreachable הישן', () => {
    assert(isUnknownOutcome(unknownBody()), 'unknown_outcome');
    assert(!isUnknownOutcome({ error: 'resend_unreachable', detail: { message: 'fetch failed' } }), 'השרת הישן החזיר את החיוב לממתין');
    const src = read(SRC('App.tsx'));
    const fn = src.slice(src.indexOf('async function requestChargePayment'), src.indexOf('function handleContinueLead'));
    assert(/if \(isUnknownOutcome\(body\)\) \{[\s\S]*?status: 'requested', requestedAt: at/.test(fn), 'סימון «נשלחה» על unknown_outcome');
    assert(fn.includes("typeof body?.requestedAt === 'string' ? body.requestedAt"), 'requestedAt מהתשובה');
    assert(!/error\?\.message \|\|/.test(fn), 'לא «non-2xx status code»');
  }),
  test('דרישת תשלום: חסרה כתובת ⇒ משפט בעברית (אדום), לא קוד', async () => {
    const { msg, view } = await appSendView(null, httpError(400, { error: 'missing_client_email' }), 'CHARGE_SEND_ERRORS');
    assert(msg.includes('אין כתובת מייל'), msg);
    equal(view.tone, 'failed');
  }),
  test('בקשת ייצוג חדשה: unknown / פג הזמן מסומנים emailUnknown — לא «לא נשלח» בלבד', () => {
    const src = read(SRC('App.tsx'));
    const fn = src.slice(src.indexOf('async function saveRepresentationRequest'), src.indexOf('async function handleCreateRepresentation('));
    assert(fn.includes('emailUnknown = isUnknownSendReply(body)'), 'unknown_outcome מסומן');
    assert(fn.includes('emailUnknown = timedOut'), 'פג הזמן מסומן');
    assert(fn.includes('return { link, emailSent, emailError, emailUnknown, clientId }'), 'הדגל חוזר לחלון');
  }),

  // ── מכתב לרו"ח הקודם ─────────────────────────────────────────────────────
  test('מכתב: unknown_outcome ⇒ כתום עם הצעד הבטוח, בלי «השליחה נכשלה»', async () => {
    const o = await releaseOutcome(httpError(502, unknownBody()));
    equal(o.kind, 'unknown');
    assert(o.text.includes('לא ידוע אם המכתב יצא') && o.text.includes('לברר עם הרו״ח הקודם'), o.text);
    assert(!o.text.includes('נכשל'), o.text);
  }),
  test('מכתב: אין תשובה / 500 בלי קוד מוכר ⇒ לא ידוע', async () => {
    equal((await releaseOutcome(fetchError)).kind, 'unknown');
    equal((await releaseOutcome(httpError(500, { error: 'TypeError: x' }))).kind, 'unknown');
  }),
  test('מכתב: הספק דחה / נושא ארוך ⇒ «לא נשלח» בעברית, בלי טקסט הספק', async () => {
    const r = await releaseOutcome(httpError(502, { error: 'resend_failed', detail: { name: 'validation_error', message: 'API key is invalid' } }));
    equal(r.kind, 'err');
    assert(r.text.includes('לא נשלח') && !LATIN.test(r.text), r.text);
    const long = await releaseOutcome(httpError(400, { error: 'subject_too_long', detail: { message: 'נושא המייל ארוך מ-200 תווים.' } }));
    equal(long.kind, 'err');
    equal(long.text, 'נושא המייל ארוך מ-200 תווים.');
  }),
  test('מכתב: אחרי unknown — שליחה נוספת רק אחרי אישור שמסביר את הכפילות', () => {
    const src = read(SRC('components/quotations/ReleaseLetterDialog.tsx'));
    assert(!src.includes('השליחה נכשלה: ${why}'), 'הקידומת הישנה ירדה');
    assert(/if \(unknownTried && !window\.confirm\(/.test(src), 'אישור לפני שליחה חוזרת');
    assert(src.includes('יקבל אותו פעמיים'), 'האישור אומר את הסיכון');
    assert(src.includes("unknownTried ? 'שלח שוב'"), 'הכפתור אומר «שלח שוב»');
    for (const v of Object.values(release().RELEASE_SEND_ERRORS)) assert(HEBREW.test(v) && !LATIN.test(v), v);
  }),

  // ── מרכז הייצוג ──────────────────────────────────────────────────────────
  test('מרכז הייצוג: «לא ידוע» מזוהה גם כשהמארח עטף אותו ב«המייל לא נשלח (…)»', () => {
    const { isUnknownSendError } = loadDecls<{ isUnknownSendError: (e: string | null | undefined) => boolean }>(
      SRC('components/RepresentationExecutionCenter.tsx'), ['isUnknownSendError'], { isUnknownSendReply, UNKNOWN_OUTCOME_TEXT });
    assert(isUnknownSendError(`המייל לא נשלח (${UNKNOWN_OUTCOME_TEXT})`), 'עטוף');
    assert(isUnknownSendError(UNKNOWN_OUTCOME_TEXT), 'כמו שהוא');
    assert(!isUnknownSendError('המייל לא נשלח (API key is invalid)'), 'דחייה ודאית');
    assert(!isUnknownSendError(null), 'הצלחה');
  }),
  test('מרכז הייצוג: ניסיון unknown אינו «נשלח»; «שלח» ו«שליחה חוזרת» אחריו עוברים אישור', () => {
    const src = read(SRC('components/RepresentationExecutionCenter.tsx'));
    assert(!src.includes("emails.find(m => m.status !== 'failed')"), 'הבאג: unknown נקרא כ«נשלח»');
    assert(src.includes("emails.find(m => m.status !== 'failed' && !isUnknownEmailStatus(m.status))"), 'רק מה שיצא');
    assert(src.includes("lastUnknown ? 'לא ידוע אם המייל יצא'"), 'מצב החותם');
    assert(src.includes('unknownRecipients.length > 0 ? setConfirmResendUnknown(true) : proceedSend()'), '«שלח» אחרי unknown ⇒ אישור');
    assert(src.includes('confirmLabel="שלח שוב בכל זאת"') && src.includes('cancelLabel="אברר קודם"'), 'חלון האישור');
    assert(src.includes("lastUnknown && !confirmAgain ? setConfirmAgain(true) : void remind()"), '«שליחה חוזרת» ⇒ אישור');
    assert(src.includes("isUnknownEmailStatus(latest?.status) ? undefined"), 'אין «תזכורת» בלחיצה אחת אחרי unknown');
    assert(src.includes("activeEmails.some(m => m.status !== 'failed')"), 'כשל ודאי לא מסתיר את «הייצוג אושר»');
  }),

  // ── מיילי ההצעה / «נשלחו לאחרונה» ───────────────────────────────────────
  test('מיילי ההצעה: unknown כתום עם הסיבה — לא «השליחה נכשלה» ולא טקסט הספק באדום', () => {
    const src = read(SRC('components/quotations/QuotationEmailsPanel.tsx'));
    assert(!src.includes("['bounced', 'complained', 'failed'].includes(m.status)"), 'הרשימה הקשיחה ירדה');
    assert(src.includes('const row = emailRowState(m)'), 'emailRowState');
    assert(/row\.tone === 'unknown'\s*\? <div style=\{\{ color: 'var\(--chip-amber-tx\)'/.test(src), 'השורה הכתומה במקום השגיאה הגולמית');
  }),

  // ── שרת ──────────────────────────────────────────────────────────────────
  test('signing-session: unknown_outcome מועבר כמו שהוא (לא send_failed); קריאה שנפלה = לא ידוע', () => {
    const src = read(FN('signing-session'));
    assert(src.includes('import { isUnknownOutcome, unknownOutcomeReply } from "../_shared/resendResult.ts"'), 'ייבוא');
    const i = src.indexOf('if (isUnknownOutcome(sendBody)');
    assert(i > 0 && i < src.indexOf('error: "send_failed"'), 'הבדיקה לפני send_failed');
    assert(src.includes('return json(unknownOutcomeReply(reason, sendBody?.retrySafe === true), 502)'), 'מעביר את retrySafe');
    assert(/catch \(e\) \{\s*\/\/[^\n]*\n\s*return json\(unknownOutcomeReply\("network: "/.test(src), 'fetch שנפל ⇒ unknown');
    // PublicSignPage מזהה את הצורה החדשה
    assert(isUnknownSendReply(unknownOutcomeReply('http 502')), 'תואם לדף החתימה');
  }),
  test('weekly-backup: הקריאה לספק רק דרך postResend; רשת/5xx ⇒ unknown, לא failed', () => {
    const src = read(FN('weekly-backup'));
    assert(src.includes('const call = await postResend(() => fetch(RESEND_EMAILS'), 'postResend');
    assert(!/=\s*await fetch\(RESEND_EMAILS/.test(src), 'אין fetch ישיר לספק');
    assert(src.includes('status: "unknown", error: call.result.reason'), 'שורה unknown');
    assert(src.includes('call.result.outcome === "sent"'), 'sent רק עם מזהה');
  }),

  // ── עמוד האוטומציות ──────────────────────────────────────────────────────
  test('תזכורות הייצוג: שני הנושאים מוצגים (reminderSubjectsText)', () => {
    const src = read(SRC('components/office/pages/AutomationsPage.tsx'));
    assert(src.includes('{reminderSubjectsText(rr)} · נוסח קבוע'), 'הנושאים מהעוזר');
    assert(!src.includes('«{rr.subject}» · נוסח קבוע'), 'רק הנושא הראשון — ירד');
  }),
];

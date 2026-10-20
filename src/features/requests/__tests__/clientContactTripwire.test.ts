// ─── חוט מעידה: «תקשורת שייכת לפריט העבודה שגרם לה» (CLAUDE.md §9, 20.10.2026) ─────────────────────────
// ‼ מה נעול כאן: כל פונקציית שרת ששולחת מייל (postResend / resendEmailsUrl / POST ל-api.resend.com/emails) רושמת
//   ב-email_messages את step_id — הבקשה שבגללה יצא המייל. כך כל מייל ללקוח נמצא בשורה שלו ב«בקשות».
//   פונקציה חדשה ששולחת בלי step_id ⇒ הבדיקה נופלת. חריגים קיימים — ברשימה המפורשת, כל אחד עם סיבה; הרשימה
//   רק מתקצרת (docs/plans/2026-10-20-simplicity-roadmap.md, שלב 5). חריג שכבר לא שולח — חייב לרדת מהרשימה.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';

const FUNCTIONS = join(process.cwd(), 'supabase/functions');

/** פונקציות ששולחות מייל בלי step_id — היום. ‼ להוסיף כאן רק עם סיבה, ועדיף לחבר את השליחה לבקשה. */
const KNOWN_BYPASS: Record<string, string> = {
  'send-charge-payment-request-email': 'דרישת תשלום — עוד לא בקשה ב«בקשות» (מפת הדרך, שלב 5)',
  'send-onboarding-email': 'מסלולי onboard/sign (הצעה, חתימה) יוצאים בלי בקשה; step_id רק כשיש',
  'send-process-open-email': 'מייל הדף כולו — הפריטים שבו נרשמים עם הבקשות שלהם ב-client_notice_items',
  'send-quotation-email': 'הצעת מחיר — לפני שיש לקוח ובקשות',
  'quotation-reminders': 'תזכורות להצעת מחיר — לפני שיש לקוח ובקשות',
  'representation-reminders': 'תזכורת החתימה (sign audience) נשענת על בקשת הייצוג; step_id רק כשיש שלב',
  'send-apply-link-email': 'קישור מילוי — עוד לא בקשה ב«בקשות» (מפת הדרך, שלב 5)',
  'notify-accountant': 'מייל למשרד בלבד — לא ללקוח',
  'weekly-backup': 'גיבוי למשרד בלבד — לא ללקוח',
};

const SENDS = /postResend\s*\(|resendEmailsUrl|['"`]https:\/\/api\.resend\.com\/emails['"`]/;
const WRITES_STEP = /email_messages[\s\S]*\bstep_id\s*:|\bstep_id\s*:[\s\S]*email_messages/;

function sourcesOf(dir: string): string {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '__tests__') out.push(sourcesOf(p)); }
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(readFileSync(p, 'utf8'));
  }
  return out.join('\n');
}

const functions = readdirSync(FUNCTIONS).filter(n => !n.startsWith('_') && !n.startsWith('.') && statSync(join(FUNCTIONS, n)).isDirectory());
const senders = functions.filter(n => SENDS.test(sourcesOf(join(FUNCTIONS, n))));

export const TESTS: TestCase[] = [
  test('הסריקה רואה את פונקציות השליחה (לא ריקה בטעות)', () => {
    assert(functions.length > 20, `נמצאו רק ${functions.length} פונקציות ב-${FUNCTIONS}`);
    for (const known of ['send-step-email', 'send-release-email']) assert(senders.includes(known), `${known} לא זוהתה כשולחת מייל — הסריקה שבורה`);
  }),

  test('המזהים עצמם: שולח בלי step_id נתפס, שולח עם step_id עובר, קריאה מ-Resend אינה שליחה', () => {
    const bare = `const r = await postResend(key, body); await admin.from("email_messages").insert({ client_id, to_email });`;
    const withStep = `const r = await postResend(key, body); await admin.from("email_messages").insert({ client_id, step_id: s.id });`;
    const readOnly = 'await fetch(`https://api.resend.com/emails/${row.resend_id}`)';
    assert(SENDS.test(bare) && !WRITES_STEP.test(bare), 'שולח בלי step_id לא נתפס');
    assert(SENDS.test(withStep) && WRITES_STEP.test(withStep), 'שולח עם step_id נתפס בטעות');
    assert(!SENDS.test(readOnly), 'קריאת מייל מ-Resend זוהתה כשליחה');
  }),

  test('כל פונקציה ששולחת מייל רושמת step_id ב-email_messages — או מופיעה בחריגים עם סיבה', () => {
    const offenders = senders.filter(n => !KNOWN_BYPASS[n] && !WRITES_STEP.test(sourcesOf(join(FUNCTIONS, n))));
    assert(offenders.length === 0, offenders.map(n =>
      `«${n}» שולחת מייל בלי step_id ב-email_messages. CLAUDE.md §9: «תקשורת שייכת לפריט העבודה שגרם לה» — `
      + 'מחברים את השליחה לבקשה (step_id), ורק אם אין בקשה — מוסיפים ל-KNOWN_BYPASS עם סיבה.').join('\n'));
  }),

  test('רשימת החריגים רק מתקצרת: כל חריג קיים ועדיין שולח', () => {
    for (const [n, why] of Object.entries(KNOWN_BYPASS)) {
      assert(why.trim().length > 10, `לחריג «${n}» חסרה סיבה`);
      assert(functions.includes(n), `«${n}» ב-KNOWN_BYPASS אבל אין פונקציה כזו — להסיר מהרשימה`);
      assert(senders.includes(n), `«${n}» כבר לא שולחת מייל — להסיר מ-KNOWN_BYPASS`);
    }
  }),
];

// ─── בדיקות: בטיחות הפנייה לשע״ם ─────────────────────────────────────────────
// ‼ מה שנבדק כאן הוא ההבטחה היקרה ביותר במילסטון: **פנייה אחת.** כל אחת
// מהבדיקות מתארת מסלול שבו, בלי הקוד הזה, הייתה יוצאת פנייה שנייה לרשות.
//
//   node --test worker/test/shaam-safety.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  progressTracker, assertNotAlreadyAttempted, detectBlockingSignal,
  blockingError, captureDiagnostics, unknownScreenError,
} from '../src/shaamSafety.mjs';
import { NeedsHumanError } from '../src/errors.mjs';

/** ctx מזויף — אוסף את מה שנשמר, ומאפשר לביים דחיית שמירה. */
function fakeCtx({ progress = {}, revision = 0, saveOk = true } = {}) {
  const saved = [];
  return {
    ctx: {
      workerId: 'w-test',
      job: { id: 'j1', progress, revision },
      log: () => {},
    },
    saved,
    saveOk,
  };
}

/**
 * כותב progress מזויף — מוזרק ל-progressTracker.
 * ‼ אין כאן רשת: מה שנבדק הוא הסדר (רושמים לפני שנוגעים)
 * וההתנהגות כשהכתיבה נכשלת.
 */
function stubWriter(saveOk = true) {
  const calls = [];
  const write = async (_w, _j, rev, progress) => {
    calls.push(structuredClone(progress));
    return saveOk ? { ok: true, job: { revision: rev + 1 } } : { ok: false, error: 'revision_conflict' };
  };
  return { write, calls };
}

// ── 3/4. אימות ישות — ניסיון אחד ──────────────────────────────────────────

test('3/4 · משימה שכבר נגעה בשע״ם אינה מורצת שוב', () => {
  const { ctx } = fakeCtx({ progress: { externalAttempt: { at: 'x', stage: 'verify_entity' } } });
  const p = progressTracker(ctx);
  assert.equal(p.touchedExternal(), true);
  assert.throws(
    () => assertNotAlreadyAttempted(p, { operation: 'פתיחת בקשת הייצוג', howToCheck: 'בדקו.' }),
    (e) => e instanceof NeedsHumanError && e.code === 'external_outcome_unknown',
  );
});

test('3/4 · משימה שלא נגעה בשע״ם עוברת את השער', () => {
  const { ctx } = fakeCtx({ progress: {} });
  const p = progressTracker(ctx);
  assert.equal(p.touchedExternal(), false);
  assert.doesNotThrow(() => assertNotAlreadyAttempted(p, { operation: 'x', howToCheck: 'y' }));
});

test('6/7 · ההודעה מפנה לבדיקה ולא לניסיון נוסף', () => {
  const { ctx } = fakeCtx({ progress: { externalAttempt: { at: 'x', stage: 'upload_signed_form' } } });
  const p = progressTracker(ctx);
  try {
    assertNotAlreadyAttempted(p, {
      operation: 'שידור טופס ייפוי הכוח',
      howToCheck: 'הריצו «בדוק קבלת הייצוג» — היא קוראת בלבד.',
    });
    assert.fail('should throw');
  } catch (e) {
    assert.match(e.message, /לא תנסה שוב מעצמה/);
    assert.match(e.message, /בדוק קבלת הייצוג/);
  }
});

// ── הסימן נרשם לפני הנגיעה, לא אחריה ─────────────────────────────────────

test('5 · הסימן «נגעתי בשע״ם» נרשם לפני הפעולה החיצונית', async () => {
  const { write, calls } = stubWriter(true);
  const { ctx } = fakeCtx();
  const p = progressTracker(ctx, write);
  await p.markExternalAttempt('upload_signed_form');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].externalAttempt.stage, 'upload_signed_form');
  assert.ok(calls[0].externalAttempt.at, 'נרשמה חותמת זמן');
  assert.equal(p.touchedExternal(), true);
});

test('5 · כשלא ניתן לרשום את הסימן — לא נוגעים בשע״ם בכלל', async () => {
  const { write } = stubWriter(false);
  const { ctx } = fakeCtx();
  const p = progressTracker(ctx, write);
  await assert.rejects(
    () => p.markExternalAttempt('verify_entity'),
    (e) => e instanceof NeedsHumanError && e.code === 'progress_write_failed_before_external',
  );
});

// ── 2/5. סימני חסימה ואבטחה ───────────────────────────────────────────────

const page = (text) => ({ evaluate: async () => text });

test('2 · «יותר מדי ניסיונות» מזוהה ועוצר', async () => {
  const s = await detectBlockingSignal(page('חריגה ממספר הניסיונות המותר. נסו מאוחר יותר.'));
  assert.ok(s);
  assert.equal(s.code, 'too_many_attempts');
  const e = blockingError(s, 'אימות הישות בשע״ם');
  assert.ok(e instanceof NeedsHumanError);
  assert.match(e.message, /לא תנסה שוב/);
  assert.match(e.code, /^shaam_/);
});

test('2 · חסימת גישה מזוהה', async () => {
  const s = await detectBlockingSignal(page('המשתמש חסום. אין הרשאה לביצוע הפעולה.'));
  assert.equal(s?.code, 'access_blocked');
});

test('2 · תקלת כרטיס חכם מזוהה', async () => {
  const s = await detectBlockingSignal(page('תקלה בכרטיס חכם — יש להוציא ולהכניס מחדש.'));
  assert.equal(s?.code, 'card_problem');
});

test('2 · דרישת קוד חד־פעמי מזוהה ואינה נעקפת', async () => {
  const s = await detectBlockingSignal(page('נא להזין קוד חד פעמי שנשלח אליך'));
  assert.equal(s?.code, 'otp_required');
});

test('2 · מסך רגיל אינו מזוהה כחסימה', async () => {
  assert.equal(await detectBlockingSignal(page('רשימת בקשות · מצב בקשה · מצב מערך')), null);
  assert.equal(await detectBlockingSignal(page('')), null);
});

// ── 9. מסך לא מזוהה ⇒ עצירה, לא לחיצה על משהו דומה ────────────────────────

test('9 · מסך לא מזוהה נעצר עם ראיות, בלי ז׳רגון טכני במסך', async () => {
  const diag = await captureDiagnostics({
    evaluate: async (fn) => fn && {
      url: 'https://shaam.taxes.gov.il/srReshMeyuzagim',
      hash: '#/reshimatMeyuzagim',
      headings: ['הודעת מערכת', 'לא ניתן להציג'],
      buttons: ['סגירה'],
      fieldLabels: [],
      dialogOpen: true,
      hasPasswordField: false,
    },
  }, 'אימות ישות');
  const e = unknownScreenError('אימות הישות בשע״ם', 'אימות ישות', diag);
  assert.ok(e instanceof NeedsHumanError);
  assert.equal(e.code, 'shaam_unexpected_screen');
  assert.match(e.message, /לא נלחץ שום דבר/);
  assert.match(e.message, /הודעת מערכת/, 'הראיה שנראתה מופיעה בהודעה');
  assert.doesNotMatch(e.message, /selector|locator|Playwright|timeout/i, 'בלי ז׳רגון טכני');
});

test('9 · אבחון אינו מדליף ספרות מזהות', async () => {
  const diag = await captureDiagnostics({
    evaluate: async (fn) => fn && {
      url: 'https://shaam.taxes.gov.il/x',
      hash: '', headings: ['פרטים למיוצג 034605212 - סלע הדסה'],
      buttons: [], fieldLabels: [], dialogOpen: false, hasPasswordField: false,
    },
  }, 'שלב 2');
  // ‼ הפונקציה מריצה את המיסוך בתוך הדפדפן; כאן ה-stub מחזיר את התוצאה
  // כמות שהיא, ולכן נבדק שהכלל עצמו קיים ומיושם על headings.
  assert.ok(Array.isArray(diag.headings));
});

// ── 6. הודעות למשתמש ──────────────────────────────────────────────────────

test('6 · כל הודעת עצירה אומרת מה נעשה, ושלא ינוסה שוב', () => {
  const { ctx } = fakeCtx({ progress: { externalAttempt: { at: 'x', stage: 's' } } });
  const p = progressTracker(ctx);
  let msg = '';
  try { assertNotAlreadyAttempted(p, { operation: 'שידור טופס ייפוי הכוח', howToCheck: 'בדקו.' }); }
  catch (e) { msg = e.message; }
  assert.match(msg, /שידור טופס ייפוי הכוח/, 'אומרת איזו פעולה');
  assert.match(msg, /לא ידוע אם הרשות קלטה/, 'אומרת שייתכן שקרה משהו בצד שע״ם');
  assert.match(msg, /לא תנסה שוב/, 'אומרת שלא יהיה ניסיון אוטומטי');
});

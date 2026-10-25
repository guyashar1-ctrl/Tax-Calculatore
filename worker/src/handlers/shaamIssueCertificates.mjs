// shaamIssueCertificates.mjs — «הנפק אישורים»: אישור ניכוי מס במקור + אישור ניהול ספרים (413).
//
// ‼ פעולה **משנה** ברשות, ולכן רק בלחיצה של אדם (אף פעם לא מהקריאה או ממסלול).
// ‼ הכלל של גיא (25.10.2026): מבקשים את השיעור הנמוך ביותר — פטור מלא — ואם אסור, יורדים לבד
// למה שמותר. את הכלל של עסק חדש (5%) המסך עצמו אוכף ולכן התכנית מחושבת מראש (gmf413.mjs);
// דחייה אחרת של «בדיקה» עם שיעור מפורש ⇒ תיקון אחד לשיעור הזה. «בדיקה» אינה הנפקה.
// ‼ אידמפוטנטי לפי מצב: לפני כל הנפקה קוראים את מצב האישור — אישור בתוקף לא מונפק שוב, רק נשמר.
// ‼ ניסיון אחד: הסימן externalAttempt נרשם לפני «עדכון»; משימה שכבר נגעה בשע״ם לא רצה שוב.
import { attach, detach } from '../browserSession.mjs';
import { open413, issueWithholding, issueBookkeeping, backToEntry } from '../gmf413Session.mjs';
import { plannedRates, rateFromError, ratesText } from '../gmf413.mjs';
import { readOne, saveOne, saveMessage, CERT_LABEL } from '../certificates413.mjs';
import { progressTracker, assertNotAlreadyAttempted } from '../shaamSafety.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.issue_annual_certificates';

const NOT_READY =
  'החיבור לשע״ם אינו מוכן. לחצו על "שע״ם" בכותרת והשלימו את החיבור, ואז הריצו שוב.';
const HOW_TO_CHECK =
  'הריצו «קריאת תיק מס הכנסה מהשע״ם» כדי לראות מה הונפק בפועל, ורק אז החליטו אם להנפיק שוב.';

export async function preflight() { return { ok: true }; }

const REASON_TEXT = {
  locked: 'שע״ם נעלה את הקטנת השיעור בתיק הזה — רק רכז ומעלה ברשות יכולים להנפיק.',
  deficiencies: 'בתיק יש ליקויים ששע״ם מבקשת להסביר לפני הנפקה — מנפיקים ידנית במסך 413.',
  form_changed: 'מסך ההנפקה בשע״ם השתנה — לא מילאתי אותו. מנפיקים ידנית במסך 413.',
  no_confirm_dialog: 'אחרי «בדיקה» שע״ם לא הציגה אישור להנפקה. מנפיקים ידנית במסך 413.',
};

function failureText(kind, out) {
  const head = `${CERT_LABEL[kind]}: `;
  if (out.reason === 'rejected' || out.reason === 'refused') return `${head}שע״ם לא הנפיקה — «${out.text || 'ללא הסבר'}».`;
  return head + (REASON_TEXT[out.reason] ?? `לא הונפק (${out.reason}).`);
}

/** ההודעה שנשמרת בכרטיס כשההנפקה לא קרתה: של שע״ם כשיש, אחרת ההסבר שלנו. */
const messageOf = (out) => ((out.reason === 'rejected' || out.reason === 'refused') && out.text ? out.text : REASON_TEXT[out.reason] ?? null);
/** סירוב שאין טעם לנסות שוב בלחיצה (בפתיחת הכרטיס, נעילה, ליקויים). */
const BLOCKING = new Set(['locked', 'deficiencies']);

export async function run(ctx, input) {
  const entity = String(input?.certEntity ?? '').replace(/\D/g, '');
  if (!entity) {
    throw new PermanentError('לא נמסר מספר עוסק (ת.ז. של בעל העסק) — אין למי להנפיק אישור.', 'missing_entity');
  }
  const desiredRaw = input?.desiredRate;
  const desired = desiredRaw == null || desiredRaw === '' ? null : Math.max(0, Math.min(99, Math.round(Number(desiredRaw))));

  const progress = progressTracker(ctx);
  assertNotAlreadyAttempted(progress, { operation: 'הנפקת האישורים', howToCheck: HOW_TO_CHECK });

  const conn = await attach();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
  let tab = null;
  const outcome = {};
  const failures = [];
  try {
    const opened = await open413(conn.page);
    if (!opened.ok) {
      if (opened.reason === 'gmf_not_ready') throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
      throw new PermanentError(`לא הצלחתי לפתוח את מסך 413 בשע״ם (${opened.reason}).`, opened.reason);
    }
    const work = opened.page;
    tab = opened.created ? work : null;

    // ── ניכוי מס במקור (הקטנות) ──
    const w = await readOne(work, entity, 'withholding', ctx.log);
    if (!w.ok) {
      failures.push(failureText('withholding', w));
      outcome.withholding = { issued: false, reason: w.reason, text: w.text ?? null };
      if (w.reason === 'refused' && w.text) await saveMessage(ctx, 'withholding', { message: w.text, blocked: true });
    } else if (w.info.valid) {
      const saved = await saveOne(ctx, w);
      outcome.withholding = { issued: false, already: true, ratesText: ratesText(w.info.rates), validUntil: w.info.validUntil, documentId: saved?.documentId ?? null };
    } else if (w.info.locked || w.info.deficiencies > 0) {
      const out = { reason: w.info.locked ? 'locked' : 'deficiencies' };
      failures.push(failureText('withholding', out));
      outcome.withholding = { issued: false, ...out };
      await saveMessage(ctx, 'withholding', { message: messageOf(out), blocked: BLOCKING.has(out.reason), info: w.info });
    } else {
      const plan = plannedRates(w.info, desired);
      const replan = (text, cur) => {
        const n = rateFromError(text);
        const highest = Math.max(0, ...cur.rows.map((r) => (r.exempt ? 0 : r.rate)));
        return n != null && n > highest ? plannedRates(w.info, n) : null;
      };
      const out = await issueWithholding(work, {
        plan, replan, log: ctx.log,
        markAttempt: () => progress.markExternalAttempt('issue_withholding'),
      });
      if (out.ok) {
        await backToEntry(work);
        const after = await readOne(work, entity, 'withholding', ctx.log);
        const requested = desired == null ? 'הנמוך ביותר' : `${desired}%`;
        const note = plan.reason ?? (out.plan !== plan ? 'שע״ם לא אישרה את המבוקש — הונפק הקרוב שמותר' : null);
        const saved = after.ok ? await saveOne(ctx, after, { issued: true, requested, note }) : null;
        outcome.withholding = {
          issued: true, requested, note,
          ratesText: after.ok ? ratesText(after.info.rates) : null,
          validUntil: after.ok ? after.info.validUntil : null,
          documentId: saved?.documentId ?? null,
        };
      } else if (out.sent && out.reason === 'unknown') {
        // ‼ «עדכון» נלחץ ולא חזרה תשובה ⇒ לא ידוע אם הונפק. לא ממשיכים ולא מנסים שוב.
        throw new NeedsHumanError(
          `ההנפקה של ${CERT_LABEL.withholding} נשלחה לשע״ם ולא התקבלה תשובה — לא ידוע אם הונפק. ${HOW_TO_CHECK}`,
          'external_outcome_unknown',
        );
      } else {
        failures.push(failureText('withholding', out));
        outcome.withholding = { issued: false, reason: out.reason, text: out.text ?? null };
        await saveMessage(ctx, 'withholding', { message: messageOf(out), blocked: false, info: w.info });
      }
    }
    await backToEntry(work);

    // ── ניהול ספרים (גופים) ── ‼ נקרא מחדש: הנפקת «הקטנות» מוציאה לעיתים גם את «גופים».
    const b = await readOne(work, entity, 'bookkeeping', ctx.log);
    if (!b.ok) {
      failures.push(failureText('bookkeeping', b));
      outcome.bookkeeping = { issued: false, reason: b.reason, text: b.text ?? null };
      if (b.reason === 'refused' && b.text) await saveMessage(ctx, 'bookkeeping', { message: b.text, blocked: true });
    } else if (b.info.valid) {
      const saved = await saveOne(ctx, b, outcome.withholding?.issued ? { issued: true } : {});
      outcome.bookkeeping = { issued: false, already: true, validUntil: b.info.validUntil, documentId: saved?.documentId ?? null };
    } else {
      const out = await issueBookkeeping(work, { markAttempt: () => progress.markExternalAttempt('issue_bookkeeping') });
      if (out.ok) {
        await backToEntry(work);
        const after = await readOne(work, entity, 'bookkeeping', ctx.log);
        const saved = after.ok ? await saveOne(ctx, after, { issued: true }) : null;
        outcome.bookkeeping = { issued: true, validUntil: after.ok ? after.info.validUntil : null, documentId: saved?.documentId ?? null };
      } else if (out.sent && out.reason === 'unknown') {
        throw new NeedsHumanError(
          `ההנפקה של ${CERT_LABEL.bookkeeping} נשלחה לשע״ם ולא התקבלה תשובה — לא ידוע אם הונפק. ${HOW_TO_CHECK}`,
          'external_outcome_unknown',
        );
      } else {
        failures.push(failureText('bookkeeping', out));
        outcome.bookkeeping = { issued: false, reason: out.reason, text: out.text ?? null };
        await saveMessage(ctx, 'bookkeeping', { message: messageOf(out), blocked: false, info: b.info });
      }
    }

    ctx.log(`413 הנפקה: ${JSON.stringify(outcome)}`);
    if (failures.length) {
      // מה שהונפק כבר נשמר בתיק; ההודעה אומרת בדיוק מה לא.
      throw new PermanentError(failures.join(' '), 'certificate_not_issued');
    }
    return { result: { system: 'shaam', area: 'annual_certificates', entity: `***${entity.slice(-3)}`, outcome } };
  } finally {
    if (tab) await tab.close().catch(() => {});
    await detach(conn.browser);
  }
}

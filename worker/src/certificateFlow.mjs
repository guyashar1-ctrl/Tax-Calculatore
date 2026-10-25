// certificateFlow.mjs — שני האישורים מ-413 בריצה אחת: קריאה, ואם חסר ומותר — הנפקה, ושמירה.
//
// ‼ גיא (26.10.2026, על יובל גרוסמן): «למה זה לא פשוט מנפיק אישור? תמצא דרך להפוך את הכול ליותר
// יעיל ומהיר». לכן קריאת התיק שהרו"ח לוחץ עליה בתיק המס (issue=true) מנפיקה במקום את מה שחסר —
// באותה לשונית, בלי משימה שנייה ובלי לפתוח את שע״ם שוב. קריאה ממסלול (שרת) לא שולחת את הדגל.
// ‼ אידמפוטנטי לפי מצב: לפני כל הנפקה נקרא מצב האישור, ואישור בתוקף לעולם לא מונפק שוב —
// גם אם המשימה רצה שוב אחרי קריסה. externalAttempt נרשם לפני «עדכון».
import { NeedsHumanError } from './errors.mjs';
import { plannedRates, rateFromError, ratesText } from './gmf413.mjs';
import { issueWithholding, issueBookkeeping, backToEntry } from './gmf413Session.mjs';
import { readOne, saveOne, saveMessage, CERT_LABEL } from './certificates413.mjs';

export const HOW_TO_CHECK =
  'הריצו «קריאת תיק מס הכנסה מהשע״ם» כדי לראות מה הונפק בפועל, ורק אז החליטו אם להנפיק שוב.';

const REASON_TEXT = {
  locked: 'שע״ם נעלה את הקטנת השיעור בתיק הזה — רק רכז ומעלה ברשות יכולים להנפיק.',
  deficiencies: 'בתיק יש ליקויים ששע״ם מבקשת להסביר לפני הנפקה — מנפיקים ידנית במסך 413.',
  form_changed: 'מסך ההנפקה בשע״ם השתנה — לא מילאתי אותו. מנפיקים ידנית במסך 413.',
  no_confirm_dialog: 'אחרי «בדיקה» שע״ם לא הציגה אישור להנפקה. מנפיקים ידנית במסך 413.',
};
/** סירוב שאין טעם לנסות שוב בלחיצה. */
const BLOCKING = new Set(['locked', 'deficiencies']);

export function failureText(kind, out) {
  const head = `${CERT_LABEL[kind]}: `;
  if (out.reason === 'rejected' || out.reason === 'refused') return `${head}שע״ם לא הנפיקה — «${out.text || 'ללא הסבר'}».`;
  return head + (REASON_TEXT[out.reason] ?? `לא הונפק (${out.reason}).`);
}
const messageOf = (out) => ((out.reason === 'rejected' || out.reason === 'refused') && out.text ? out.text : REASON_TEXT[out.reason] ?? null);

/** תקציר אחיד לתוצאת המשימה — אותו מבנה שהמסך קורא (authorityAutomation: certificates.*). */
const summaryOf = (info, extra = {}) => ({
  ok: true, status: info.valid ? 'valid' : 'none', statusText: info.statusText,
  validUntil: info.validUntil, ratesText: ratesText(info.rates), ...extra,
});

/**
 * אישור אחד: קריאה; בתוקף ⇒ שמירה; סירוב ⇒ ההודעה נשמרת; חסר + issue ⇒ הנפקה, קריאה חוזרת ושמירה.
 * @returns {{ summary: object, failure: string|null, unknown?: string }}
 */
async function ensureOne(ctx, work, entity, kind, { issue, desired, progress }) {
  const label = CERT_LABEL[kind];
  const read = await readOne(work, entity, kind, ctx.log);
  if (!read.ok) {
    if (read.reason === 'refused' && read.text) {
      const saved = await saveMessage(ctx, kind, { message: read.text, blocked: true });
      return { summary: { ok: true, status: 'none', message: read.text, blocked: true, saved: !!saved?.ok }, failure: failureText(kind, read) };
    }
    return { summary: { ok: false, reason: read.reason }, failure: failureText(kind, read) };
  }
  const info = read.info;
  if (info.valid) {
    const saved = await saveOne(ctx, read);
    return { summary: summaryOf(info, { documentId: saved?.documentId ?? null, saved: !!saved?.ok }), failure: null };
  }
  if (!issue) {
    const saved = await saveOne(ctx, read);
    return { summary: summaryOf(info, { saved: !!saved?.ok }), failure: null };
  }
  if (kind === 'withholding' && (info.locked || info.deficiencies > 0)) {
    const out = { reason: info.locked ? 'locked' : 'deficiencies' };
    await saveMessage(ctx, kind, { message: messageOf(out), blocked: BLOCKING.has(out.reason), info });
    return { summary: summaryOf(info, { message: messageOf(out), blocked: true }), failure: failureText(kind, out) };
  }

  let out;
  let plan = null;
  if (kind === 'withholding') {
    plan = plannedRates(info, desired);
    const replan = (text, cur) => {
      const n = rateFromError(text);
      const highest = Math.max(0, ...cur.rows.map((r) => (r.exempt ? 0 : r.rate)));
      return n != null && n > highest ? plannedRates(info, n) : null;
    };
    out = await issueWithholding(work, { plan, replan, log: ctx.log, markAttempt: () => progress.markExternalAttempt('issue_withholding') });
  } else {
    out = await issueBookkeeping(work, { markAttempt: () => progress.markExternalAttempt('issue_bookkeeping') });
  }

  if (out.ok) {
    await backToEntry(work);
    const after = await readOne(work, entity, kind, ctx.log);
    const requested = kind === 'withholding' ? (desired == null ? 'הנמוך ביותר' : `${desired}%`) : undefined;
    const note = kind === 'withholding'
      ? (plan.reason ?? (out.plan !== plan ? 'שע״ם לא אישרה את המבוקש — הונפק הקרוב שמותר' : null)) : null;
    const saved = after.ok ? await saveOne(ctx, after, { issued: true, ...(requested ? { requested } : {}), ...(note ? { note } : {}) }) : null;
    ctx.log(`413 ${label}: הונפק${note ? ` (${note})` : ''}`);
    return {
      summary: after.ok
        ? summaryOf(after.info, { issued: true, note, documentId: saved?.documentId ?? null, saved: !!saved?.ok })
        : { ok: true, status: 'valid', issued: true, note },
      failure: null,
    };
  }
  if (out.sent && out.reason === 'unknown') {
    // ‼ «עדכון» נלחץ ולא חזרה תשובה ⇒ לא ידוע אם הונפק. לא ממשיכים ולא מנסים שוב.
    return { summary: { ok: false, reason: 'external_outcome_unknown' }, failure: null,
      unknown: `ההנפקה של ${label} נשלחה לשע״ם ולא התקבלה תשובה — לא ידוע אם הונפק. ${HOW_TO_CHECK}` };
  }
  await saveMessage(ctx, kind, { message: messageOf(out), blocked: false, info });
  return { summary: summaryOf(info, { message: messageOf(out) }), failure: failureText(kind, out) };
}

/**
 * שני האישורים, לפי הסדר. ‼ ניהול ספרים נקרא אחרי ניכוי במקור — הנפקת «הקטנות» מוציאה לעיתים גם
 * את «גופים» (הסימון «הנפקת אישור גופים» במסך מסומן מראש).
 * @returns {{ summary: {withholding, bookkeeping}, failures: string[], unknown: string|null }}
 */
export async function processCertificates(ctx, work, entity, { issue = false, desired = null, progress = null } = {}) {
  if (issue && !progress) throw new Error('processCertificates: issue requires progress');
  const summary = {};
  const failures = [];
  let unknown = null;
  for (const kind of ['withholding', 'bookkeeping']) {
    if (unknown) break;
    const r = await ensureOne(ctx, work, entity, kind, { issue, desired, progress });
    summary[kind] = r.summary;
    if (r.failure) failures.push(r.failure);
    if (r.unknown) unknown = r.unknown;
    await backToEntry(work);
  }
  return { summary, failures, unknown };
}

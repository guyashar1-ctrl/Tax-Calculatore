// shaamIssueCertificates.mjs — «הנפק אישורים»: אישור ניכוי מס במקור + אישור ניהול ספרים (413).
//
// ‼ פעולה **משנה** ברשות, ולכן רק בלחיצה של אדם (אף פעם לא ממסלול). מ-26.10.2026 קריאת התיק
// מהכפתור בתיק המס מנפיקה בעצמה את מה שחסר (certificateFlow.mjs); הכפתור הזה נשאר ל«שיעור אחר»
// ולניסיון חוזר.
// ‼ הכלל של גיא (25.10.2026): מבקשים את השיעור הנמוך ביותר — פטור מלא — ואם אסור, יורדים לבד
// למה שמותר. ניסיון אחד: הסימן externalAttempt נרשם לפני «עדכון»; משימה שכבר נגעה בשע״ם לא רצה שוב.
import { attach, detach } from '../browserSession.mjs';
import { open413 } from '../gmf413Session.mjs';
import { processCertificates, HOW_TO_CHECK } from '../certificateFlow.mjs';
import { progressTracker, assertNotAlreadyAttempted } from '../shaamSafety.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.issue_annual_certificates';

const NOT_READY =
  'החיבור לשע״ם אינו מוכן. לחצו על "שע״ם" בכותרת והשלימו את החיבור, ואז הריצו שוב.';

export async function preflight() { return { ok: true }; }

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
  try {
    const opened = await open413(conn.page);
    if (!opened.ok) {
      if (opened.reason === 'gmf_not_ready') throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
      throw new PermanentError(`לא הצלחתי לפתוח את מסך 413 בשע״ם (${opened.reason}).`, opened.reason);
    }
    tab = opened.created ? opened.page : null;
    const { summary, failures, unknown } = await processCertificates(ctx, opened.page, entity, { issue: true, desired, progress });
    ctx.log(`413 הנפקה: ${JSON.stringify(summary)}`);
    if (unknown) throw new NeedsHumanError(unknown, 'external_outcome_unknown');
    // מה שהונפק כבר נשמר בתיק; ההודעה אומרת בדיוק מה לא.
    if (failures.length) throw new PermanentError(failures.join(' '), 'certificate_not_issued');
    const outcome = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { ...v, issued: !!v.issued, already: !v.issued && v.status === 'valid' }]));
    return { result: { system: 'shaam', area: 'annual_certificates', entity: `***${entity.slice(-3)}`, outcome } };
  } finally {
    if (tab) await tab.close().catch(() => {});
    await detach(conn.browser);
  }
}

// shaamCheckRepresentation.mjs — «בדוק קבלת הייצוג»: קורא את מצב הבקשה
// מרשימת הבקשות בשע״ם ומחזיר אותו כמו שהוא.
//
// ‼ פעולה **קוראת בלבד**. אינה יוצרת, אינה משדרת, אינה לוחצת על שום דבר
// בעל תופעת לוואי. זה מה שמאפשר להריץ אותה שוב ושוב בלי סיכון.
//
// ‼ מה שהיא מחזירה הוא הטקסט הגולמי של שתי העמודות («מצב בקשה» ו«מצב
// מערך») לכל מערך בנפרד. הסיווג לתוויות עסקיות נעשה בצד PIVO
// (features/representation/shaamRepresentation.ts) — מקום אחד, ונבדק
// בבדיקות יחידה. כאן מחושב רק דגל אחד: האם **כל** המערכים נקלטו, כי זו
// העובדה היחידה שהטריגר בשרת פועל לפיה.

import { attach, detach } from '../browserSession.mjs';
import { openRepresentationSystem, findRequestRows, currentRequestRows, classifyRequestGroup } from '../shaamRepresentationSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { detectBlockingSignal, blockingError, captureDiagnostics, unknownScreenError } from '../shaamSafety.mjs';

export const actionType = 'shaam.check_representation';

const NOT_READY =
  'מערכת רישום הייצוג בשע״ם אינה מוכנה. לחצו על "שע״ם" בכותרת, השלימו את ' +
  'ההתחברות, ואז הריצו שוב.';

export async function preflight() {
  return { ok: true };
}

/** «נקלט בהצלחה» — הניסוח היחיד שמשמעותו תיק פעיל (נצפה ברשימה). */
export const ACCEPTED_RE = /נקלט/;

/** מערך נקלט: קוד 5 (נתוני הטבלה), ובהיעדר קוד — «נקלט» בטקסט. */
const rowAccepted = (r) => (Number.isInteger(r?.systemStateCode) ? r.systemStateCode === 5 : ACCEPTED_RE.test(r?.rawSystemState ?? ''));

/** האם **כל** המערכים שנצפו נקלטו. ריק אינו «הכול נקלט». פונקציה טהורה. */
export function allRowsAccepted(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.every(rowAccepted);
}

/**
 * שורות הרשימה כפי שהן נמסרות ל-PIVO. ‼ משותף לבדיקה ולבדיקה שבתוך
 * «הזן ייפוי כוח בשע״ם» — אותו מבנה, כדי שהטריגר יקרא את שתיהן אותו דבר.
 */
export function reportedRows(foundRows, requestNumber = '') {
  return foundRows.map(r => ({
    systemLabel: r.system ?? '',
    // ‼ 23.09.2026 · «שם הלקוח» כפי שהוא מופיע ברשימת הבקשות בשע״ם —
    // ראיה על מי בן/בת הזוג הרשום/ה במס הכנסה, ולא רק תיאור השורה.
    // ההתאמה לשם ספציפי נעשית ב-PIVO (shaamRepresentation.ts) — כאן רק
    // מעבירים את מה שנקרא, כמו כל שדה גולמי אחר בקובץ הזה.
    clientName: r.clientName ?? '',
    rawRequestState: r.requestState ?? '',
    rawSystemState: r.systemState ?? '',
    fileNumber: r.fileNumber ?? '',
    repType: r.repType ?? '',
    enteredAt: r.date ?? '',
    // «צפוי לסיום השהייה» — לפעמים תאריך, לפעמים טקסט מצב. מועבר כמו שהוא;
    // הפירוש (תאריך או לא) נעשה ב-PIVO.
    suspensionEndsRaw: r.detail?.suspensionEnds ?? '',
    systemUpdatedAtRaw: r.detail?.systemUpdatedAt ?? '',
    requestNumber: r.detail?.requestNumber ?? requestNumber,
    // ‼ 28.09.2026 · מנתוני הטבלה בשע״ם (כשיש) — קודים מדויקים, לא ניסוח.
    ...(Number.isInteger(r.codes?.requestState) ? { requestStateCode: r.codes.requestState } : {}),
    ...(Number.isInteger(r.codes?.systemState) ? { systemStateCode: r.codes.systemState } : {}),
    ...(Number.isInteger(r.codes?.system) ? { systemCode: r.codes.system } : {}),
    ...(Number.isInteger(r.codes?.repType) ? { repTypeCode: r.codes.repType } : {}),
    ...(r.detail?.entityId ? { entityId: r.detail.entityId } : {}),
    ...(r.noFile === true ? { noFile: true } : {}),
    ...(r.cancelReason ? { cancelReason: r.cancelReason } : {}),
    ...(typeof r.tik91 === 'boolean' ? { tik91: r.tik91 } : {}),
  }));
}

export async function run(ctx, input) {
  const submissionKey = String(input?.submissionKey ?? '');
  const role = input?.role;
  const requestNumber = String(input?.requestNumber ?? '').replace(/\D/g, '');
  const entityId = String(input?.entityId ?? '').replace(/\D/g, '');
  // ‼ 23.09.2026 · ראיית שיוך כשאין עדיין מספר בקשה שמור: בלי מספר בקשה,
  // findRequestRows לא יכול לבסס שיוך משורה שלא נושאת מזהה — נדרש שם
  // מועמד להשוואה (attributeRows). ראה matchRegisteredPersonName ב-PIVO.
  const personName = String(input?.personName ?? '').trim();

  if (role !== 'client' && role !== 'spouse') {
    throw new PermanentError('לא נמסר תפקיד תקין (client/spouse) לפעולה הזו.', 'bad_subject_role');
  }
  if (!submissionKey) throw new PermanentError('לא נמסר מפתח הגשה.', 'missing_submission_key');
  if (!requestNumber && !entityId) {
    throw new PermanentError(
      'אין מספר בקשה ואין מספר ישות — אין לפי מה לחפש בשע״ם, ולא מנחשים לפי שם.',
      'nothing_to_search_by',
    );
  }
  // ‼ 28.09.2026 · נתוני הטבלה נושאים ת.ז. בכל שורה — שיוך לפי ת.ז. מדויקת
  // מספיק; השם הוא ראיה נוספת, לא תנאי. בלי ת.ז. ובלי מספר — עדיין עוצרים.
  if (!requestNumber && !personName && !entityId) {
    throw new PermanentError(
      'אין מספר בקשה שמור ואין שם לקוח לאימות שיוך — לא ניתן לבסס בבטחה שהתוצאה שייכת לאדם הזה.',
      'missing_attribution_evidence',
    );
  }

  const conn = await attach();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'awaiting_shaam_auth');

  try {
    const page = conn.page;

    // ‼ גם פעולה קוראת-בלבד עוצרת על סימן אבטחה/חסימה: הסיכון
    // של ניסיונות חוזרים אינו תלוי בכך שאנחנו רק קוראים.
    const blocked = await detectBlockingSignal(page);
    if (blocked) throw blockingError(blocked, 'בדיקת קבלת הייצוג');

    const open = await openRepresentationSystem(page);
    if (!open.ok) {
      if (open.reason === 'login_required') throw new NeedsHumanError(NOT_READY, 'awaiting_shaam_auth');
      const diag = await captureDiagnostics(page, 'פתיחת מערכת רישום הייצוג');
      ctx.log('אבחון מסך:', JSON.stringify(diag));
      throw unknownScreenError('בדיקת קבלת הייצוג', 'פתיחת מערכת רישום הייצוג', diag);
    }

    // ‼ 201 · מתי נקראה שע״ם — לפני הקריאה. השרת לא נותן לקריאה ישנה יותר
    // (או לקריאה שקדמה להגשה) לדרוס מצב שנקרא אחריה.
    const observedAt = new Date().toISOString();
    const found = await findRequestRows(page, { requestNumber, entityId, expectedClientName: personName, expandDetails: true });
    if (!found.ok) {
      // ‼ כשלא ניתן לבסס שהשורות שייכות לבקשה שלנו — לא מדווחים מצב.
      // מצב שגוי כאן מסמן ייצוג כפעיל על סמך שורה של אדם אחר.
      if (found.reason === 'identity_mismatch' || found.reason === 'cannot_attribute') {
        throw new NeedsHumanError(
          'לא הצלחתי לוודא שהשורות שהוצגו ברשימת הבקשות שייכות לבקשה הזאת, ולכן ' +
          'לא עדכנתי שום מצב. שום דבר לא שונה בשע״ם. בדקו את הבקשה ידנית ברשימה.',
          'request_identity_unverified',
        );
      }
      const diag = await captureDiagnostics(page, 'רשימת הבקשות');
      ctx.log('אבחון מסך:', JSON.stringify(diag), '·', found.reason, found.failedAt ?? '');
      throw unknownScreenError('בדיקת קבלת הייצוג', 'רשימת הבקשות', diag);
    }

    if (found.rows.length === 0) {
      // ‼ «לא נמצאה» אינו כישלון של הייצוג ואינו כישלון של הפעולה: ייתכן
      // שהבקשה כבר נקלטה ועברה מ«בקשות בתהליך» לייצוגים פעילים. מדווחים
      // עובדה, ולא מסקנה.
      ctx.log(`לא נמצאה שורה לבקשה ${requestNumber || entityId} ברשימת הבקשות בתהליך`);
      return {
        result: {
          submissionKey, role, requestNumber,
          found: false,
          observedAt,
          rows: [],
          allAccepted: false,
          note: 'הבקשה אינה מופיעה ברשימת הבקשות בתהליך.',
        },
      };
    }

    // ‼ 28.09.2026 · לאותו אדם יכולות להיות כמה בקשות — מדווחים על אחת.
    const current = currentRequestRows(found.rows, { requestNumber });
    if (!current.ok) {
      throw new NeedsHumanError(
        'לאדם הזה יש בשע״ם יותר מבקשה פתוחה אחת, ולא ברור לאיזו מהן PIVO מתייחסת. ' +
        'שום מצב לא עודכן ושום דבר לא שונה בשע״ם. בדקו ב«בקשות בתהליך».',
        'request_identity_unverified',
      );
    }
    const rows = reportedRows(current.rows, current.requestNumber || requestNumber);

    const allAccepted = allRowsAccepted(rows);
    // ‼ הכרעת גיא (28.09.2026): «פעיל לפי רשות» — כל מה שיש לו תיק נקלט, והשאר
    // ממתינים לפתיחת תיק שלא קיים ⇒ הבקשה גמורה.
    const settled = allAccepted || classifyRequestGroup(current.rows) === 'settled';
    ctx.log(`נמצאו ${rows.length} שורות · כולן נקלטו: ${allAccepted}`);
    for (const r of rows) ctx.log(`  · ${r.systemLabel}: בקשה="${r.rawRequestState}" מערך="${r.rawSystemState}"${r.suspensionEndsRaw ? ` צפי="${r.suspensionEndsRaw}"` : ''}`);

    return {
      result: {
        submissionKey, role,
        requestNumber: rows[0].requestNumber || requestNumber,
        found: true,
        observedAt,
        rows,
        allAccepted,
        settled,
        ...(current.others?.length ? { otherRequests: current.others } : {}),
      },
    };
  } finally {
    await detach(conn.browser);
  }
}

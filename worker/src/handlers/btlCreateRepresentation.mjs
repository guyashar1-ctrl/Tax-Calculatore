// btlCreateRepresentation.mjs — "הזן ייפוי כוח בביטוח לאומי" (פרק 17).
// מיוצגים → ייפוי כוח → הוספת ייפוי כוח מבוטח, לאדם אחד (154).
//
// ‼ אידמפוטנטיות: זו פעולה עם תופעת לוואי חיצונית שאי אפשר לבטל בקלות
// (יצירת ייפוי כוח אמיתי אצל ביטוח לאומי). ארבע רמות הגנה:
//   1. `automation_jobs_open_unique` (150) — לא ניתן לפתוח שתי משימות
//      פתוחות מאותו action_type לאותו client_id בו-זמנית.
//   2. הבדיקה למטה (`input.existingReferenceNumber`) — אם ל-PIVO כבר יש
//      אסמכתא ידועה לאדם הזה, לא מנסים ליצור עוד אחת; ה-UI לא אמור בכלל
//      להציע את הפעולה הזו במצב כזה (ראה niRepresentationAction), אבל
//      הבדיקה כאן היא קו הגנה שני ולא סומכת על ה-UI.
//   3. בדיקה חיה מול מסך המעקב **לפני כל ניסיון**, לא רק אחרי קריסה —
//      לפי ת.ז. (אין עדיין אסמכתא ידועה). PIVO יכול להיות לא מסונכרן
//      (למשל מישהו יצר ייפוי כוח ישירות באתר) — הבדיקה החיה קודמת לכל
//      הגשה, לא רק ל-retry.
//   4. CAS על progress (168/183): מסמנים `progress.submitted=true` **מיד**
//      אחרי לחיצה על "הוספה" ולפני שמחלצים את התוצאה, כדי שקריסה בדיוק שם
//      לא תישכח — אבל בדיקה #3 כבר הייתה קורית ממילא בניסיון החוזר, כי היא
//      תמיד רצה קודם.
//
// ‼ הניווט/מילוי/דיאלוג-האישור (worker/src/btlSession.mjs) מעוגנים במבנה
// שנצפה חי (16.09.2026); כל כשל ניווט מדווח כ-PermanentError ברור — לעולם
// לא retry עיוור של «הוספה». תוצאה דו-משמעית אחרי הגשה ⇒ needs_human,
// והניסיון הבא מתחיל שוב מבדיקת המעקב (למטה) ולא מהגשה.
import {
  attachBtl, detachBtl, classifyBtlAuth, probeBtlSession, pickBtlPage, focusBtlWindow,
  launchDedicatedBtlChrome,
  openAddPoaScreen, submitAddPoaForm, extractPoaConfirmation,
  openPoaTrackingScreen, findPoaTrackingRow,
} from '../btlSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { updateJobProgress } from '../apiClient.mjs';

export const actionType = 'btl.create_representation';

const BTL_AUTH_PENDING =
  'חלון «מערכת ייצוג לקוחות» של ביטוח לאומי סגור או שאינו מחובר. יש לפתוח ' +
  'אותו ולהתחבר (לחצו "ביטוח לאומי" בכותרת), ואז להריץ שוב.';

export async function preflight() {
  return { ok: true };
}

// ‼ אורכי שדה נצפו חי בטופס האמיתי (16.09.2026): ת.ז. עד 9, שנת לידה עד 4,
// שם פרטי עד 15, שם משפחה עד 17 — maxlength ב-HTML אוכף רק הקלדה, לא ערך
// שנקבע דרך JS (בדיוק איך ש-fillFieldByLabel כותב). בלי הבדיקה כאן, שם
// ארוך מדי היה נשלח חתוך/שגוי בלי שום שגיאה גלויה.
const BTL_FIELD_MAX = { idNumber: 9, birthYear: 4, firstName: 15, lastName: 17 };

function validateSubject(input) {
  const role = input?.role;
  const idNumber = String(input?.idNumber ?? '').replace(/\D/g, '');
  const firstName = String(input?.firstName ?? '').trim();
  const lastName = String(input?.lastName ?? '').trim();
  const birthYear = Number(input?.birthYear);
  if (role !== 'client' && role !== 'spouse') {
    throw new PermanentError('לא נמסר תפקיד תקין (client/spouse) לפעולה הזו.', 'bad_subject_role');
  }
  if (!idNumber || idNumber.length < 5) {
    throw new PermanentError('אין תעודת זהות תקינה לאדם הזה בכרטיס.', 'missing_id_number');
  }
  if (idNumber.length > BTL_FIELD_MAX.idNumber) {
    throw new PermanentError(`תעודת הזהות ארוכה מדי (${idNumber.length} ספרות) — הטופס בביטוח לאומי מוגבל ל-${BTL_FIELD_MAX.idNumber}.`, 'id_number_too_long');
  }
  if (!firstName || !lastName) {
    throw new PermanentError('חסר שם פרטי או שם משפחה בכרטיס — נדרשים שניהם לטופס ביטוח לאומי.', 'missing_name');
  }
  if (firstName.length > BTL_FIELD_MAX.firstName || lastName.length > BTL_FIELD_MAX.lastName) {
    throw new PermanentError(
      `שם פרטי/משפחה ארוך מדי לטופס ביטוח לאומי (עד ${BTL_FIELD_MAX.firstName}/${BTL_FIELD_MAX.lastName} תווים) — יש לקצר בכרטיס או להזין ידנית.`,
      'name_too_long',
    );
  }
  if (!Number.isFinite(birthYear) || birthYear < 1900 || birthYear > new Date().getFullYear()) {
    throw new PermanentError('חסרה שנת לידה תקינה בכרטיס — נדרשת לטופס ביטוח לאומי.', 'missing_birth_year');
  }
  return { role, idNumber, firstName, lastName, birthYear };
}

/** שלב ניווט/מילוי שכשל: הודעה קריאה + קוד, מהצעד+הסיבה שהוחזרו מ-btlSession. */
function navFailure(step, r) {
  return new PermanentError(
    `שלב "${step}" בביטוח לאומי נכשל (${r.reason ?? 'unknown'})` +
    (r.failedAt ? ` — לא נמצא "${r.failedAt}" בתפריט` : '') +
    '. ייתכן שהמסך השתנה או שהניווט טרם אומת מול האתר האמיתי; יש לבדוק ידנית ולעדכן את הקוד.',
    `${step}_${r.reason ?? 'failed'}`,
  );
}

export async function run(ctx, input) {
  const subject = validateSubject(input);

  // ‼ קו הגנה שני נגד כפילות — ראה הערת האידמפוטנטיות בראש הקובץ.
  if (input?.existingReferenceNumber) {
    throw new PermanentError(
      `כבר קיימת אסמכתא (${input.existingReferenceNumber}) לאדם הזה — לא יוצרים ייפוי כוח נוסף.`,
      'already_exists',
    );
  }

  // ‼ אותו מסלול בדיוק כמו btl.connect: חלון סגור ⇒ פותחים אותו על מסך
  // הכניסה ועוצרים ל-needs_human. הרו"ח מתחבר בעצמו (ת.ז./קוד/סיסמה/OTP),
  // ו-report_worker_status (187) מחדש את **אותה** משימה כשהחיבור מדווח.
  let conn = await attachBtl();
  if (!conn.ok && conn.reason === 'not_running') {
    ctx.log('חלון ביטוח לאומי סגור — פותח חלון Chrome ייעודי על מסך הכניסה');
    const launched = launchDedicatedBtlChrome();
    if (!launched.ok) throw new PermanentError('לא נמצאה התקנה של Google Chrome במחשב הזה.', launched.reason);
    await new Promise((r) => setTimeout(r, 4000));
    conn = await attachBtl();
  }
  if (!conn.ok) throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');

  try {
    const page = await pickBtlPage(conn.context, conn.page);
    const local = await classifyBtlAuth(page);
    if (!local.connected) {
      await focusBtlWindow(page);
      throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');
    }
    const session = await probeBtlSession(page);
    if (session.ok && !session.connected) {
      await focusBtlWindow(page);
      throw new NeedsHumanError(BTL_AUTH_PENDING, 'awaiting_btl_auth');
    }

    // ‼ בדיקה חיה מול מסך המעקב — **תמיד**, לא רק אחרי קריסה. לפני שיוצרים
    // ייפוי כוח חדש, מוודאים מול ביטוח לאומי עצמו (לא רק מול PIVO) שאין
    // כבר רישום פתוח לת.ז. הזו. גם עונה על "מה אם התהליך קרס אחרי הגשה
    // קודמת" — אותה בדיקה בדיוק, פשוט תמיד קודמת, לא רק בניסיון חוזר.
    ctx.log(`בודק מול מסך המעקב שאין כבר ייפוי כוח פתוח לת.ז. ${subject.idNumber}`);
    const tracking = await openPoaTrackingScreen(page);
    if (!tracking.ok) throw navFailure('פתיחת מסך מעקב לבדיקת כפילות', tracking);
    const existing = await findPoaTrackingRow(page, { idNumber: subject.idNumber });
    if (existing?.found) {
      ctx.log(`נמצא רישום קיים אצל ביטוח לאומי · אסמכתא ${existing.referenceNumber} · סטטוס ${existing.rawStatus} — לא יוצר כפול`);
      return { result: { role: subject.role, referenceNumber: existing.referenceNumber, deadline: existing.deadline, reconciled: true } };
    }
    if (existing?.reason === 'ambiguous_match') {
      throw new PermanentError(
        `נמצאו כמה רישומים עם ת.ז. ${subject.idNumber} במסך המעקב — לא יוצר ייפוי כוח נוסף בלי בירור ידני.`,
        'ambiguous_existing_records',
      );
    }
    ctx.log(`אין רישום קיים במעקב (${existing?.reason ?? 'unknown'}) — ממשיך ליצירה`);

    ctx.log(`פותח מסך "הוספת ייפוי כוח מבוטח" עבור ${subject.firstName} ${subject.lastName}`);
    const opened = await openAddPoaScreen(page);
    if (!opened.ok) throw navFailure('פתיחת מסך הוספת ייפוי כוח', opened);

    // ‼ נקודת ה-checkpoint: אחרי זה, "הוספה" עומדת להילחץ. אם ה-worker
    // קורס אחרי הלחיצה, הניסיון הבא יידע לא לשלוח שוב עיוור (ראה למעלה).
    const progress = { ...(ctx.job.progress ?? {}), submitted: true };
    await updateJobProgress(ctx.workerId, ctx.job.id, ctx.job.revision ?? 0, progress);

    const submitted = await submitAddPoaForm(page, subject);
    if (!submitted.ok) throw navFailure('מילוי/שליחת טופס ייפוי הכוח', submitted);

    const confirmation = await extractPoaConfirmation(page);
    if (confirmation.ok && confirmation.alreadyExisted) {
      // ‼ ביטוח לאומי דחה כי כבר קיים ייפוי כוח למבוטח — ומסר את האסמכתא.
      // זו תוצאת reconcile, לא כישלון: משלימים מועד אחרון ממסך המעקב.
      ctx.log(`ביטוח לאומי: ייפוי כוח כבר קיים · אסמכתא ${confirmation.referenceNumber} — משלים מועד ממסך המעקב`);
      const tracking2 = await openPoaTrackingScreen(page);
      const row = tracking2.ok ? await findPoaTrackingRow(page, { referenceNumber: confirmation.referenceNumber }) : null;
      return {
        result: {
          role: subject.role,
          referenceNumber: confirmation.referenceNumber,
          deadline: row?.found ? (row.deadline ?? null) : null,
          reconciled: true,
        },
      };
    }
    if (!confirmation.ok) {
      // ‼ תוצאה דו-משמעית אחרי הגשה — בדיוק המצב ש-progress.submitted נועד
      // לו: הניסיון הבא (needs_human, לא permanent) יתאם מול המעקב לפני
      // שהוא שוקל לשלוח שוב, במקום לוותר או לנסות שוב עיוור מיד.
      throw new NeedsHumanError(
        `הטופס הוגש אך לא זוהתה עדות ברורה להצלחה (${confirmation.reason}). ` +
        'בדקו את חלון ביטוח לאומי — אם ייפוי הכוח נוצר, הריצו שוב ואמת יאתר אותו ' +
        'לפי ת.ז. במסך המעקב במקום ליצור כפול.',
        'ambiguous_submit_result',
      );
    }
    if (!confirmation.referenceNumber) {
      throw new PermanentError('הוגש הטופס אך לא הצלחתי לקרוא קוד אסמכתא מהתוצאה — יש לבדוק ידנית.', 'no_reference_extracted');
    }

    ctx.log(`התקבלה אסמכתא ${confirmation.referenceNumber} · מועד אחרון ${confirmation.deadline ?? '—'}`);
    return {
      result: {
        role: subject.role,
        referenceNumber: confirmation.referenceNumber,
        deadline: confirmation.deadline ?? null,
      },
    };
  } finally {
    await detachBtl(conn.browser);
  }
}

// btlSyncFile.mjs — «עדכן נתונים מביטוח לאומי»: קריאת תיק המבוטח לכל אדם.
//
// ‼ קורא בלבד. שום ערך לא נכתב לכרטיס מכאן — התוצאה חוזרת ל-PIVO, ושם היא
// מוצגת לרו"ח כהצעת שינוי דרך אותו מנגנון של תיק המס (כמו שע״ם-134).
//
// ‼ לכל אדם (subject) תוצאה משלו, ומקטע שנכשל מדווח ככזה — לא כ«אין ערך».
// אם כל האנשים נכשלו, המשימה נכשלת; אם חלק הצליחו, היא מצליחה עם הכשלים
// מסומנים לכל אדם.
import { attachBtl, detachBtl, pickBtlPage, classifyBtlAuth, probeBtlSession } from '../btlSession.mjs';
import {
  BtlSessionLost, openRepresentedInsured, readInfoSummary, openOccupationList,
  drillOccupationSegment, openIncomeList, openDebitAuthorizations, openRealValueLedger, returnToRepresentedHome,
} from '../btlInsuredSession.mjs';
import { readSubjects, maskId } from '../btlFileSync.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'btl.sync_file';

const NOT_READY =
  'החיבור לביטוח לאומי אינו מוכן. לחצו על "ביטוח לאומי" בכותרת והשלימו את ההתחברות, ואז הריצו שוב.';

const PERSON_ERRORS = {
  not_found: 'לא נמצא ברשימת המיוצגים בביטוח לאומי',
  ambiguous: 'נמצאה יותר משורה אחת בחיפוש — לא ניתן להכריע',
  identity_mismatch: 'התיק שנפתח אינו של האדם הזה — לא נקרא ממנו דבר',
  session_lost: 'החיבור לביטוח לאומי נותק באמצע',
};

export async function preflight() { return { ok: true }; }

/** היום לפי שעון ישראל — «בתוקף» נמדד מול התאריך המקומי ולא UTC. */
function todayInIsrael() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}

function validSubjects(input) {
  const list = Array.isArray(input?.subjects) ? input.subjects : [];
  return list
    .map(s => ({ role: s?.role, idNumber: String(s?.idNumber ?? '').replace(/\D/g, ''), label: s?.label ?? null }))
    .filter(s => (s.role === 'client' || s.role === 'spouse') && s.idNumber.length >= 5);
}

export async function run(ctx, input) {
  const subjects = validSubjects(input);
  if (subjects.length === 0) {
    throw new PermanentError('לא נמסר אף אדם עם ת.ז. לבדיקה מול ביטוח לאומי.', 'no_subjects');
  }
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(input?.asOf ?? '')) ? input.asOf : todayInIsrael();

  const conn = await attachBtl();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'btl_connection_not_ready');
  let touchedPage = null;
  try {
    // ‼ הלשונית של «מערכת ייצוג לקוחות» עצמה — לא לשונית עזרה (תרמי״ל)
    // שיושבת על אותו דומיין. ‼ ובכוונה **לא** לשונית חדשה ונסתרת: המבוטח
    // שנבחר נשמר כנראה בסשן ולא בלשונית, ולכן פתיחת מבוטח אחר ברקע הייתה
    // משנה בשקט את ההקשר של הלשונית שהרו"ח עובד בה. עדיף שיראה את החלון זז.
    const appTab = conn.context.pages().find(p => /\/BTL\.ILG\.Meyazgim/i.test(p.url()));
    const page = appTab ?? await pickBtlPage(conn.context, conn.page);
    const auth = await classifyBtlAuth(page);
    if (!auth.connected) throw new NeedsHumanError(NOT_READY, 'btl_connection_not_ready');
    const probe = await probeBtlSession(page);
    if (probe.ok && !probe.connected) throw new NeedsHumanError(NOT_READY, 'btl_connection_not_ready');

    const portal = {
      open: (id) => openRepresentedInsured(page, id),
      readInfo: () => readInfoSummary(page),
      openOccupationList: () => openOccupationList(page),
      drillSegment: (i) => drillOccupationSegment(page, i),
      openIncomeList: () => openIncomeList(page),
      openDebitAuthorizations: () => openDebitAuthorizations(page),
      openLedger: () => openRealValueLedger(page),
    };

    ctx.log(`קורא תיק מבוטח · ${subjects.map(s => `${s.role}:${maskId(s.idNumber)}`).join(' · ')} · נכון ל-${asOf}`);
    touchedPage = page;
    const { persons, sessionLost } = await readSubjects(portal, subjects, { asOf, log: ctx.log });

    for (const p of persons) {
      if (!p.ok) p.error = PERSON_ERRORS[p.errorCode] ?? 'לא הצלחתי לפתוח את התיק בביטוח לאומי';
    }
    if (persons.every(p => !p.ok)) {
      if (sessionLost && persons.every(p => p.errorCode === 'session_lost')) {
        throw new NeedsHumanError(NOT_READY, 'btl_connection_not_ready');
      }
      throw new PermanentError(
        persons.map(p => `${p.label ?? p.role}: ${p.error}`).join(' · '),
        persons.length === 1 ? persons[0].errorCode : 'all_persons_failed',
      );
    }

    return { result: { system: 'btl', area: 'insured_file', asOf, persons } };
  } catch (e) {
    if (e instanceof BtlSessionLost) throw new NeedsHumanError(NOT_READY, 'btl_connection_not_ready');
    throw e;
  } finally {
    if (touchedPage) {
      const back = await returnToRepresentedHome(touchedPage);
      ctx.log(back ? 'החלון הוחזר לדף «מיוצגים» (בלי מבוטח נבחר)' : 'לא הצלחתי להחזיר את החלון לדף «מיוצגים»');
    }
    await detachBtl(conn.browser);
  }
}

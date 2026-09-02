// shaamSyncIncomeTaxFile.mjs — «סנכרון מול שע״ם» לסעיף מס הכנסה:
// קורא את שדות ראש התיק משאילתה 134 («מקדמות — פרטי דרישה ודיווח»).
//
// ‼ קורא בלבד. שום ערך לא נכתב לכרטיס מכאן — התוצאה חוזרת ל-PIVO, ושם היא
// מוצגת לרו"ח כהצעת שינוי דרך אותו מנגנון של תיק המס. עובד אוטומטי לא
// מכריע עובדה מקצועית.
//
// ‼ ארבעה שדות בלבד, וזה מכוון: אלה היחידים שנמצא להם עוגן חד-משמעי במסך
// החי. שיעור המקדמה ותדירות הדיווח **לא** נכללים — ראה דוח המיפוי; אין
// להם תווית ייעודית במסך הזה, וניחוש היה גרוע מכלום.
import {
  attach, detach, probeServerSession, openAdvancesInfo,
  extractIncomeTaxFileFacts, verifyFileDetailsFor,
} from '../browserSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.sync_income_tax_file';

const NOT_READY =
  'החיבור לשע״ם אינו מוכן. לחצו על "שע״ם" בכותרת והשלימו את החיבור, ואז הריצו שוב.';

export async function preflight() { return { ok: true }; }

export async function run(ctx, input) {
  const fileNumber = String(input?.fileNumber ?? '').replace(/\D/g, '');
  if (!fileNumber) {
    throw new PermanentError(
      'לא נמסר מספר תיק במס הכנסה ללקוח הזה. יש להשלים אותו בתיק המס ואז לנסות שוב.',
      'missing_file_number',
    );
  }

  const conn = await attach();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');

  try {
    const session = await probeServerSession(conn.page);
    if (!session.authenticated) throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');

    ctx.log(`קורא «מקדמות — פרטי דרישה ודיווח» (134) · ${fileNumber.length} ספרות`);
    const opened = await openAdvancesInfo(conn.page, fileNumber);
    if (opened.steps) for (const st of opened.steps) ctx.log(`   · ${st}`);
    if (!opened.ok) {
      if (opened.reason === 'gmf_not_ready') {
        throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
      }
      if (opened.reason === 'blocked_by_modal' || opened.reason === 'submit_click_blocked') {
        throw new NeedsHumanError(
          `מסך מס הכנסה חסום בחלונית של שע״ם${opened.modalTitle ? ` («${opened.modalTitle}»)` : ''}. ` +
          'יש לטפל בחלונית בחלון Chrome הייעודי ואז להריץ שוב.',
          'shaam_auth_wall',
        );
      }
      throw new PermanentError(
        `לא הצלחתי לפתוח את מסך המקדמות (${opened.reason}).`, opened.reason,
      );
    }

    // ‼ לפני קריאת ולו ערך אחד: לוודא שזה התיק שביקשנו. קריאת שדות ממסך של
    // תיק אחר היא הדרך הקצרה ביותר לשתול נתון של לקוח זר בכרטיס.
    const check = await verifyFileDetailsFor(opened.page, fileNumber);
    if (!check.fileNumberInScreenText || !check.hasContent) {
      throw new PermanentError(
        'המסך שנפתח אינו תואם את מספר התיק שנשלח — לא קורא ממנו נתונים.',
        'file_mismatch',
      );
    }

    const raw = await extractIncomeTaxFileFacts(opened.page);
    const fields = {};
    const unavailable = [];
    for (const [key, r] of Object.entries(raw)) {
      if (key === 'pathname') continue;
      if (r?.ok) fields[key] = r.text;
      else unavailable.push({ key, reason: r?.reason ?? 'unknown' });
    }
    ctx.log(`נקראו ${Object.keys(fields).length} שדות · חסרים/דו-משמעיים: ${unavailable.length}`);
    if (unavailable.length) ctx.log('לא נקרא: ' + JSON.stringify(unavailable));

    if (Object.keys(fields).length === 0) {
      throw new PermanentError(
        'לא הצלחתי לקרוא אף שדה מהמסך — ייתכן ששע״ם שינתה את מבנה המסך.',
        'no_fields_extracted',
      );
    }

    return {
      result: {
        system: 'shaam', query: '134', area: 'income_tax_file',
        path: opened.pathname, fields, unavailable,
      },
    };
  } finally {
    await detach(conn.browser);
  }
}

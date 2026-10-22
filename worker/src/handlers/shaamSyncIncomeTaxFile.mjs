// shaamSyncIncomeTaxFile.mjs — «סנכרון מול שע״ם» לסעיף מס הכנסה.
//
// ‼ קורא בלבד. שום ערך לא נכתב לכרטיס מכאן — התוצאה חוזרת ל-PIVO, ושם היא
// מוצגת לרו"ח כהצעת שינוי דרך אותו מנגנון של תיק המס. עובד אוטומטי לא
// מכריע עובדה מקצועית.
//
// ‼ סדר הקריאה (21.10.2026, החלטת גיא):
//   1. 154 «מידע אודות שנות מס» — ראש התיק (סוג תיק, פקיד שומה, חוליה, ענף),
//      סך יתרת חוב/זכות, מצב המקדמות, חבות והגשה לכל שנת מס, ודרישות הצהרת הון.
//   2. 134 «מקדמות — פרטי דרישה ודיווח» — **רק** כשיש מקדמות פעילות: שיעור
//      ותדירות לא מופיעים ב-154. «לא נדרש» / «בוטלה» ב-154 מספיקים לבד.
// ‼ 154 שלא נפתחה מסיבה שאינה התחברות/חלונית ⇒ ממשיכים ל-134 כמו קודם, ומדווחים
// שהשנים לא נקראו. התחברות/חלונית ⇒ עוצרים, כמו תמיד.
import {
  attach, detach, openAdvancesInfo, openTaxYearsInfo,
  extractIncomeTaxFileFacts, verifyFileDetailsFor,
} from '../browserSession.mjs';
import { parseTaxYears, openYears } from '../gmf154.mjs';
import { reportingFrom134 } from '../gmf134.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';
import { isGmfLoginPath, reloginGmf, gmfReloginMessage, noteFirstPasswordLanding } from '../gmfRelogin.mjs';

export const actionType = 'shaam.sync_income_tax_file';

const NOT_READY =
  'החיבור לשע״ם אינו מוכן. לחצו על "שע״ם" בכותרת והשלימו את החיבור, ואז הריצו שוב.';

export async function preflight() { return { ok: true }; }

/**
 * פותח שאילתה, ואם GMF ביקשה את הסיסמה השנייה באמצע — נכנס עם השמורה ומנסה
 * פעם אחת נוספת. ‼ קריאה בלבד, ולכן ניסיון נוסף אינו פנייה כפולה לרשות.
 */
async function openWithRelogin(ctx, page, open) {
  let opened = await open();
  if (opened.steps) for (const st of opened.steps) ctx.log(`   · ${st}`);
  if (!opened.ok && opened.reason === 'gmf_not_ready' && isGmfLoginPath(opened.pathname)) {
    const relog = await reloginGmf(page, ctx.log);
    if (!relog.ok) throw new NeedsHumanError(gmfReloginMessage(relog.reason), 'shaam_gmf_login_required');
    opened = await open();
    if (opened.steps) for (const st of opened.steps) ctx.log(`   · ${st}`);
  }
  return opened;
}

/** כשלי התחברות וחלונית — עוצרים את כל הריצה. אחרים — מוחזרים לטיפול. */
function stopOnAuth(opened) {
  if (opened.ok) return;
  if (opened.reason === 'gmf_not_ready') {
    // הפורטל מבקש שוב את הסיסמה הראשונה ⇒ מחזור התחברות חדש (ידני).
    noteFirstPasswordLanding(opened.pathname);
    throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
  }
  if (opened.reason === 'blocked_by_modal' || opened.reason === 'submit_click_blocked') {
    throw new NeedsHumanError(
      `מסך מס הכנסה חסום בחלונית של שע״ם${opened.modalTitle ? ` («${opened.modalTitle}»)` : ''}. ` +
      'יש לטפל בחלונית בחלון Chrome הייעודי ואז להריץ שוב.',
      'shaam_auth_wall',
    );
  }
}

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
    // ‼ אין כאן שער נפרד של פורטל (probeServerSession): מוכנות GMF אינה
    // נגזרת ממוכנות הפורטל. הבדיקה התפעולית — נתיב, שדה סיסמה, חומת אימות —
    // כבר קיימת בפותחי השאילתות, והיא הסמכות היחידה כאן.
    ctx.log(`קורא «מידע אודות שנות מס» (154) · ${fileNumber.length} ספרות`);
    const opened154 = await openWithRelogin(ctx, conn.page, () => openTaxYearsInfo(conn.page, fileNumber));
    stopOnAuth(opened154);

    const unavailable = [];
    let years = null;
    if (opened154.ok) {
      years = parseTaxYears({ head: opened154.head, pages: opened154.pages, fileNumber, user: opened154.user });
      if (!years.ok) {
        if (years.reason === 'file_mismatch') {
          throw new PermanentError('המסך שנפתח אינו תואם את מספר התיק שנשלח — לא קורא ממנו נתונים.', 'file_mismatch');
        }
        ctx.log(`154 לא פוענחה (${years.reason}${years.detail ? ` · ${years.detail}` : ''}) — ממשיך ל-134`);
        unavailable.push({ key: 'taxYears', reason: years.reason });
        years = null;
      } else {
        const open = openYears(years.filing);
        ctx.log(`154: ${years.filing.years.length} שנים ב-${years.filing.pagesRead} עמודים`
          + ` · חייב ולא הוגש: ${open.length ? open.map((y) => y.year).join(', ') : 'אין'}`
          + ` · הצהרת הון: ${years.fields.wealthDemand} · מקדמות: ${years.advance}`);
      }
    } else {
      ctx.log(`154 לא נפתחה (${opened154.reason}) — ממשיך ל-134`);
      unavailable.push({ key: 'taxYears', reason: opened154.reason });
    }

    let fields = years ? { ...years.fields } : {};
    let advancePeriods = null;
    let path = years ? opened154.pathname : null;
    const need134 = !years || years.advance === 'active';
    if (need134) {
      ctx.log(`קורא «מקדמות — פרטי דרישה ודיווח» (134)${years ? ' · יש מקדמות פעילות' : ''}`);
      const opened = await openWithRelogin(ctx, conn.page, () => openAdvancesInfo(conn.page, fileNumber));
      stopOnAuth(opened);
      if (!opened.ok) {
        if (!years) throw new PermanentError(`לא הצלחתי לפתוח את מסך המקדמות (${opened.reason}).`, opened.reason);
        ctx.log(`134 לא נפתחה (${opened.reason}) — שיעור ותדירות המקדמות לא נקראו`);
        unavailable.push({ key: 'advanceRate', reason: opened.reason }, { key: 'advanceFrequency', reason: opened.reason });
      } else {
        // ‼ לפני קריאת ולו ערך אחד: לוודא שזה התיק שביקשנו.
        const check = await verifyFileDetailsFor(opened.page, fileNumber);
        if (!check.fileNumberInScreenText || !check.hasContent) {
          throw new PermanentError('המסך שנפתח אינו תואם את מספר התיק שנשלח — לא קורא ממנו נתונים.', 'file_mismatch');
        }
        const raw = await extractIncomeTaxFileFacts(opened.page);
        const from134 = {};
        for (const [key, r] of Object.entries(raw)) {
          if (key === 'pathname') continue;
          if (r?.ok) from134[key] = r.text;
          else if (!years) unavailable.push({ key, reason: r?.reason ?? 'unknown' });
        }
        if (years) {
          // ‼ מ-134 רק המקדמות. «יתרה» של 134 היא יתרת חשבון המקדמות לשנה — היתרה
          // בכרטיס היא סך יתרת החוב/הזכות של התיק מ-154. ראש התיק — מ-154.
          for (const key of ['advanceRate', 'advanceFrequency', 'advanceStatus', 'advanceStatusRaw', 'advanceReason']) {
            if (from134[key] != null) fields[key] = from134[key];
          }
          for (const key of ['advanceRate', 'advanceFrequency']) {
            if (from134[key] == null && !from134.advanceStatus) unavailable.push({ key, reason: raw[key]?.reason ?? 'unknown' });
          }
        } else {
          fields = from134;
        }
        path = path ? `${path} + ${opened.pathname}` : opened.pathname;
        // «מצב דיווחים» (דיווחי המקדמות) — מהמונה ומהתקופות של 134.
        const rep = reportingFrom134(opened.tik);
        if (rep.status) {
          fields.reportingStatus = rep.status;
          advancePeriods = rep.periods;
          ctx.log(`134: מצב דיווחים — ${rep.status}`);
        } else {
          unavailable.push({ key: 'reportingStatus', reason: opened.tik ? 'no_counter' : 'tik_not_captured' });
        }
      }
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
        system: 'shaam',
        query: years ? (need134 ? '154+134' : '154') : '134',
        area: 'income_tax_file',
        path, fields, unavailable,
        ...(years ? { filing: years.filing } : {}),
        ...(advancePeriods ? { advancePeriods } : {}),
      },
    };
  } finally {
    await detach(conn.browser);
  }
}

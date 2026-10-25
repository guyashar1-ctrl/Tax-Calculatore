// shaamSyncVatFile.mjs — «קריאת תיק מע״מ מהשע״ם»: «פרטי עוסק» במערכת הגבייה.
//
// ‼ קורא בלבד. שום ערך לא נכתב לכרטיס מכאן — התוצאה חוזרת ל-PIVO כטקסט
// גולמי, ושם היא מנורמלת ומוצגת לרו"ח כהצעת שינוי (authorityAutomation.ts),
// בדיוק כמו קריאת 134 של מס הכנסה.
//
// ‼ פנייה אחת: אין ניסיון חוזר פנימי. כשל ⇒ עוצרים ומדווחים.
import { attach, detach } from '../browserSession.mjs';
import { openVatWorkPage, openOsek, readOsekTabs } from '../vatSession.mjs';
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'shaam.sync_vat_file';

const NOT_READY =
  'מערכת מע״מ בשע״ם אינה מוכנה. לחצו על "שע״ם" בכותרת והשלימו את החיבור, ואז הריצו שוב.';

export async function preflight() { return { ok: true }; }

export async function run(ctx, input) {
  const osekNumber = String(input?.osekNumber ?? '').replace(/\D/g, '');
  if (!osekNumber) {
    throw new PermanentError('לא נמסר מספר עוסק במע״מ ללקוח הזה. יש להשלים אותו בתיק המס ואז לנסות שוב.', 'missing_osek_number');
  }

  const conn = await attach();
  if (!conn.ok) throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
  try {
    const t0 = Date.now();
    const opened = await openVatWorkPage(conn.page);
    ctx.log(`מע״מ: ${opened.ok ? (opened.reused ? 'לשונית קיימת' : 'נפתח תפריט') : `לא מוכנה (${opened.reason})`} · ${opened.pathname ?? ''}`);
    if (!opened.ok) {
      if (opened.reason === 'login_required' || opened.reason === 'unexpected_destination') {
        throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
      }
      throw new PermanentError(`לא הצלחתי לפתוח את מערכת מע״מ (${opened.reason}).`, opened.reason);
    }
    const page = opened.page;

    const osek = await openOsek(page, osekNumber);
    if (!osek.ok) {
      if (osek.reason === 'login_required') throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
      if (osek.reason === 'osek_not_found') {
        throw new PermanentError(
          `שע״ם: «${osek.detail}» — מספר העוסק ${osekNumber} לא נמצא, או שאינו מיוצג על ידי המשרד.`,
          'osek_not_found',
        );
      }
      throw new PermanentError(`לא הצלחתי לפתוח את פרטי העוסק (${osek.reason}).`, osek.reason);
    }
    ctx.log(`פרטי עוסק נפתחו · ${osekNumber.length} ספרות`);

    const tabs = await readOsekTabs(page, osekNumber, (s) => ctx.log(`   · ${s}`));
    if (!tabs.ok) {
      if (tabs.reason === 'login_required') throw new NeedsHumanError(NOT_READY, 'shaam_connection_not_ready');
      if (tabs.reason === 'osek_mismatch') {
        throw new PermanentError('המסך שנפתח אינו של מספר העוסק שנשלח — לא קורא ממנו נתונים.', 'file_mismatch');
      }
      throw new PermanentError(`לא הצלחתי לקרוא את לשוניות פרטי העוסק (${tabs.reason}).`, tabs.reason);
    }

    const fields = {};
    const unavailable = [];
    for (const [key, text] of Object.entries(tabs.raw)) {
      if (text) fields[key] = text;
      else unavailable.push({ key, reason: text === null ? 'missing' : 'empty' });
    }
    ctx.log(`נקראו ${Object.keys(fields).length} שדות · חסרים: ${unavailable.length} · ${Math.round((Date.now() - t0) / 1000)} ש׳`);
    if (unavailable.length) ctx.log('לא נקרא: ' + JSON.stringify(unavailable));
    if (Object.keys(fields).length === 0) {
      throw new PermanentError('לא הצלחתי לקרוא אף שדה מהמסך — ייתכן ששע״ם שינתה את מבנה המסך.', 'no_fields_extracted');
    }

    return {
      result: { system: 'shaam', area: 'vat_file', path: tabs.pathname, fields, unavailable },
    };
  } finally {
    await detach(conn.browser);
  }
}

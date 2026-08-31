// devTestAutomation.mjs — הפעולה היחידה של אבן דרך 1: מוכיחה שהצנרת עובדת
// מקצה לקצה, בלי לגעת בשום רשות אמיתית. ראה src/types/automation.ts
// (DEV_STUB_ACTION_TYPE) — ה-UI ב-ChecksTab.tsx יוצר משימות עם action_type הזה.
import { NeedsHumanError, PermanentError } from '../errors.mjs';

export const actionType = 'dev.test_automation';

export async function preflight() {
  return { ok: true };
}

export async function run(ctx, input) {
  ctx.log('dev.test_automation: מתחיל (המתנה מדומה של 2 שניות)');
  await new Promise((r) => setTimeout(r, 2000));

  // שלושה נתיבים נשלטים, לבדיקת כל מסלול מה-UI: forceFail / forceNeedsHuman / רגיל.
  if (input?.forceNeedsHuman) {
    throw new NeedsHumanError('בדיקה מדומה: נדרש אימות אנושי', 'auth_required');
  }
  if (input?.forceFail) {
    throw new PermanentError('בדיקה מדומה: כישלון מכוון לבדיקת נתיב השגיאה', 'forced_failure');
  }

  ctx.log('dev.test_automation: הצליח');
  return {
    result: {
      message: 'הצנרת הושלמה בהצלחה — מהעובד המקומי חזרה ל-PIVO',
      ranAt: new Date().toISOString(),
      echoedInput: input ?? {},
    },
  };
}

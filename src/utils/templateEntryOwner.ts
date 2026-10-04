// ─── מי מבצע בקשה מהספרייה / מתבנית — התאום של השרת ─────────────────────────
// ‼ התאום של public._template_entry_owner ו-public._step_template_owner (216 §9).
// השרת הוא שקובע בפועל מי מבצע בקשה שנוצרת מרשומה בספרייה או בתבנית (_flow_item_spec,
// apply_journey_template, save/update_request_template, save_journey_template). המסך
// מציג מראש את אותה תשובה — בבונה המסלולים, בספרייה, בעורך הבקשה ובקומפוזר — כדי שלא
// יבטיח «משימה למשרד» על בקשה שתיפתח ללקוח, או להפך. שינוי כאן — שם, ולהפך
// (הבדיקות ב-__tests__/templateEntryOwner.test.ts הן אותם מקרים כמו ב-test-r4-engine.sql).

import { hasClientContent } from './clientFacingRows';

export type TemplateOwner = 'client' | 'me' | 'external';

/** רשומה בספרייה / בתבנית — {stepType, owner, officeTask, payload}, כפי שנשמרה. */
export interface TemplateEntryLike {
  stepType?: string | null;
  owner?: string | null;
  /** «משימה של המשרד» שנבחרה במפורש (upsert_library_request / save_journey_template). */
  officeTask?: unknown;
  payload?: unknown;
}

/**
 * סוגי בקשה שבהם בעלים «המשרד» אינו מספיק לבדו — אלה בקשות שהלקוח ממלא. בכל סוג אחר
 * (מכתב, חיבור, פתיחת תיקים…) הבעלים נשמר כמו שהוא.
 */
const CLIENT_SIDE_TYPES = ['custom_request', 'client_documents', 'prev_accountant_details'];

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** כמו `->> 'x' = 'true'` ב-SQL: true או 'true'. */
const isTrue = (v: unknown): boolean => v === true || v === 'true';

/**
 * מי מבצע בקשה שנוצרת מהרשומה הזו:
 *   · 'external' — הבעלים גורם חיצוני, או שיש בבקשה גורם חיצוני (externalParty);
 *   · 'me' — הבעלים המשרד, ו: נבחרה במפורש «משימה של המשרד» (officeTask), או שהסוג אינו
 *     בקשה שהלקוח ממלא, או (בבקשה חופשית) שזו הודעת מלל או שאין בה שום דבר ללקוח;
 *   · אחרת 'client'. ‼ בעלים 'me' שנגזר פעם מהכדור (תבנית שנשמרה מבקשה שהלקוח השלים)
 *     אינו הופך בקשה עם פריטים ללקוח למשימה נסתרת.
 */
export function templateEntryOwner(entry: TemplateEntryLike | null | undefined): TemplateOwner {
  const e = entry ?? {};
  const payload = isObject(e.payload) ? e.payload : null;
  if (e.owner === 'external' || isObject(payload?.externalParty)) return 'external';
  const stepType = e.stepType || 'custom_request';
  if (e.owner === 'me' && (
    isTrue(e.officeTask)
    || !CLIENT_SIDE_TYPES.includes(stepType)
    || (stepType === 'custom_request' && (isTrue(payload?.messageOnly) || !hasClientContent(e.payload)))
  )) return 'me';
  return 'client';
}

/**
 * הבעלים שנשמר כשבקשה אצל לקוח נשמרת לספרייה / לתבנית — התאום של _step_template_owner.
 * ‼ לא לפי הכדור לבדו: משימה פנימית שהועברה ל«ממתין ללקוח» היא עדיין של המשרד, ובקשה
 * שהלקוח השלים (הכדור עבר למשרד) היא עדיין שלו.
 */
export function stepTemplateOwner(stepType: string, ball: string | null | undefined, payload: unknown): TemplateOwner {
  const p = isObject(payload) ? payload : null;
  if (isObject(p?.externalParty)) return 'external';
  if (isTrue(p?.internalTask) || (!!p && 'personalConfirmFor' in p)) return 'me';
  if (ball === 'client') return 'client';
  if (stepType === 'custom_request' && !isTrue(p?.messageOnly) && hasClientContent(payload)) return 'client';
  if (stepType === 'client_documents' || stepType === 'prev_accountant_details') return 'client';
  return 'me';
}

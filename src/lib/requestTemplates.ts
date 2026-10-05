// ─── תבניות בקשה ────────────────────────────────────────────────────────────
// תבנית היא **נקודת התחלה**, לא מקור חי: בחירה בה מייצרת עותק עצמאי לבקשה
// של הלקוח, ומשם השניים אינם קשורים. עריכת הבקשה לעולם אינה נוגעת בתבנית,
// ושינוי התבנית לעולם אינו נוגע בבקשות שכבר נוצרו.
//
// ‼ הצילום עצמו אינו נעשה כאן — create_onboarding_request מעתיק את התוכן
// אל השלב, וכך זה עבד מאז ומעולם. מה שנוסף כאן הוא רק המסלול ההפוך:
// לקחת בקשה ולשמור אותה חזרה כתבנית, במפורש.
//
// ‼ בעלות: המשרד (journey_templates.office_id), לא המשתמש. תבנית שנשמרת
// אצל אחד נראית לכל מי שעובד באותו משרד. תבנית מובנית (office_id = null)
// גלויה לכולם ואינה ניתנת לעריכה — "עדכן תבנית" עליה יוצר עותק של המשרד.

import { supabase } from './supabase';

export interface TemplateEntry {
  key?: string;
  stepType: string;
  owner?: 'client' | 'me' | 'external';
  requiredForClose?: boolean;
  payload: Record<string, unknown>;
}

export interface RequestTemplate {
  id: string;
  name: string;
  description?: string | null;
  kind: 'journey' | 'request';
  /** null = תבנית מובנית של המערכת. */
  officeId: string | null;
  seedKey: string | null;
  entries: TemplateEntry[];
  /**
   * עותק של המשרד: המזהים של המובנית שהוא מחליף. ‼ פריט במסלול שנוסף כשהבקשה
   * הייתה מובנית מצביע על המזהה שלה — והשרת קורא את ההתאמה (_library_template).
   */
  overrides?: string[];
  /**
   * עותק של המשרד: הנוסח המוכן שהוא מחליף — כדי ש«חזרה לנוסח המוכן» תדע מה
   * חוזר, ושהספרייה תזהה עותק שלא שונה בפועל. המובנית עצמה לא מוצגת לצידו.
   */
  preset?: PresetRef;
}

export interface PresetRef {
  id: string;
  name: string;
  description?: string | null;
  entries: TemplateEntry[];
}

/** התבנית מובנית ⇒ אי אפשר לכתוב עליה; "עדכן" ייצור עותק של המשרד. */
export const isSeedTemplate = (t: RequestTemplate) => t.officeId === null;

/**
 * ‼ עותק של המשרד גובר על מובנית עם אותו seed_key: ברגע שהמשרד ערך את
 * "מסמכים מהלקוח" משלו, הוא לא אמור לראות גם את המקורית לצידה. העותק נושא
 * את מזהי המובנית (overrides) ואת הנוסח שלה (preset).
 */
export function mergeOfficeOverrides(rows: RequestTemplate[]): RequestTemplate[] {
  const overridden = new Set(
    rows.filter(t => t.officeId !== null && t.seedKey).map(t => t.seedKey as string));
  const out = rows.map(t => {
    if (t.officeId === null || !t.seedKey) return t;
    const seeds = rows.filter(s => s.officeId === null && s.seedKey === t.seedKey);
    const p = seeds[0];
    return {
      ...t,
      overrides: seeds.map(s => s.id),
      ...(p ? { preset: { id: p.id, name: p.name, description: p.description ?? null, entries: p.entries } } : {}),
    };
  });
  return out.filter(t => !(t.officeId === null && t.seedKey && overridden.has(t.seedKey)));
}

/** תבניות הבקשה שזמינות למשרד — שלו והמובנות. */
export async function loadRequestTemplates(): Promise<RequestTemplate[]> {
  const { data, error } = await supabase
    .from('journey_templates')
    .select('id,name,description,kind,office_id,seed_key,entries')
    .eq('kind', 'request')
    .order('name');
  if (error || !data) return [];

  return mergeOfficeOverrides(data.map(r => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    kind: 'request',
    officeId: (r.office_id as string | null) ?? null,
    seedKey: (r.seed_key as string | null) ?? null,
    entries: Array.isArray(r.entries) ? (r.entries as TemplateEntry[]) : [],
  })));
}

/**
 * עותק של המשרד שלא שונה בפועל מהנוסח המוכן — שם, מי עושה, חובה, והנוסח
 * והפריטים (differsFromTemplate). כך «חזרה לנוסח המוכן» שנעשתה בעדכון (כשהעותק
 * בשימוש במסלול ואי אפשר למחוק אותו) נראית בספרייה כמו נוסח מוכן.
 */
export function matchesPreset(t: RequestTemplate): boolean {
  if (!t.preset) return false;
  const a = t.entries[0];
  const b = t.preset.entries[0];
  if (!a || !b) return false;
  return t.name.trim() === t.preset.name.trim()
    && (a.stepType || 'custom_request') === (b.stepType || 'custom_request')
    && (a.owner ?? 'client') === (b.owner ?? 'client')
    && (a.requiredForClose !== false) === (b.requiredForClose !== false)
    && !differsFromTemplate(b, a.payload ?? {});
}

/** הבקשה שפריט מצביע עליה — כולל מובנית שהמשרד התאים (אותו כלל כמו _library_template בשרת). */
export const templateForRef = (list: RequestTemplate[], id: string) =>
  list.find(t => t.id === id || !!t.overrides?.includes(id));
export const refersTo = (t: RequestTemplate, id: string) => t.id === id || !!t.overrides?.includes(id);

/**
 * «מהספרייה» ב«＋ בקשה חדשה» בכרטיס הלקוח — בקשות חופשיות בלבד, של המשרד ונוסחים מוכנים יחד
 * (כמו ברשימה בספרייה). ‼ סוג קבוע («מסמכים מהלקוח», «פרטי הרו״ח הקודם») לא מוצע כאן: מכאן
 * נפתח קומפוזר של בקשה חופשית, והטופס האמיתי (רשימת מסמכים, שם/מייל/טלפון) היה הולך לאיבוד.
 * לסוגים האלה יש פריט בקטלוג שמעל, שקורא את אותה שורה בספרייה.
 */
export const cardLibraryRequests = (list: RequestTemplate[]) =>
  list.filter(t => (t.entries[0]?.stepType || 'custom_request') === 'custom_request');

/** התבנית לפי מפתח מובנה — כולל עותק המשרד אם קיים. */
export const templateBySeed = (list: RequestTemplate[], seedKey: string) =>
  list.find(t => t.seedKey === seedKey);

export const firstEntry = (t: RequestTemplate): TemplateEntry | undefined => t.entries[0];

/**
 * מה שהנוסח בספרייה נושא ללקוח מעבר למה שהקומפוזר עורך — עובר הלאה כמו שהוא.
 * ‼ הקומפוזר בונה את ה-payload מהשדות שעל המסך בלבד; בלי המפתחות האלה בקשה שנוצרה מהספרייה
 * הגיעה ללקוח בלי ההסבר ובלי המדריך המצולם (כך נזרק גם ההסבר של «הקמת הרשאה לחיוב חשבון»).
 */
export const TEMPLATE_CARRY_KEYS = ['clientNote', 'clientNoteAfter', 'clientRefs', 'clientPhotoGuide'] as const;

/** ערך שיש בו תוכן, לפי הסוג של המפתח: clientRefs — רשימה לא ריקה; האחרים — מחרוזת לא ריקה. */
export const hasCarryValue = (key: typeof TEMPLATE_CARRY_KEYS[number], v: unknown): boolean =>
  key === 'clientRefs' ? Array.isArray(v) && v.length > 0 : typeof v === 'string' && v.trim() !== '';

/** רק מפתחות קיימים ולא ריקים, בערך המקורי. תוכן חסר ⇒ {}. */
export function templateCarryOver(content: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!content || typeof content !== 'object') return out;
  for (const k of TEMPLATE_CARRY_KEYS) if (hasCarryValue(k, content[k])) out[k] = content[k];
  return out;
}

/**
 * האם התוכן שנוצר שונה ממה שהתבנית נתנה. ‼ משווים רק את מה שהמשתמש יכול
 * לערוך בפועל — כותרת, ניסוחים והפריטים — ולא את כל ה-payload: שדות שנוספים
 * בדרך (published, templateOrigin) היו הופכים כל בקשה ל"שונה".
 * ‼ «מה הלקוח רואה» (clientTitle) נבדק בנפרד מהשם (title) כשהצד השני נושא אותו:
 * בבקשה חופשית בספרייה title הוא תמיד שם הבקשה, ולכן שינוי בכותרת ללקוח בלבד
 * לא נראה — «נוסח מוכן» נשאר והחזרה לנוסח המוכן נעלמה. קומפוזר שמאחד את השניים
 * (שולח title בלבד) נבדק כמו קודם.
 */
export function differsFromTemplate(
  entry: TemplateEntry | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!entry) return false;
  const norm = (p: Record<string, unknown>) => JSON.stringify({
    title: String(p.title ?? p.clientTitle ?? '').trim(),
    clientSub: String(p.clientSub ?? '').trim(),
    clientCta: String(p.clientCta ?? '').trim(),
    items: (Array.isArray(p.requirements) ? p.requirements : Array.isArray(p.checklist) ? p.checklist : [])
      .map((x) => {
        const it = x as Record<string, unknown>;
        return { label: String(it.label ?? '').trim(), kind: it.kind ?? null, required: it.required !== false };
      }),
  });
  if (norm(entry.payload) !== norm(payload)) return true;
  if (payload.clientTitle === undefined) return false;
  const seen = (p: Record<string, unknown>) => String(p.clientTitle ?? p.title ?? '').trim();
  return seen(entry.payload ?? {}) !== seen(payload);
}

export async function saveRequestTemplate(stepId: string, name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('save_request_template', {
    p_step_id: stepId, p_name: name,
  });
  const res = data as { ok?: boolean; error?: string } | null;
  return error || !res?.ok ? (res?.error ?? 'save_failed') : null;
}

export async function updateRequestTemplate(templateId: string, stepId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('update_request_template', {
    p_template_id: templateId, p_step_id: stepId,
  });
  const res = data as { ok?: boolean; error?: string } | null;
  return error || !res?.ok ? (res?.error ?? 'update_failed') : null;
}

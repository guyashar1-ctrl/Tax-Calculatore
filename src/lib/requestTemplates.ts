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
}

/** התבנית מובנית ⇒ אי אפשר לכתוב עליה; "עדכן" ייצור עותק של המשרד. */
export const isSeedTemplate = (t: RequestTemplate) => t.officeId === null;

/**
 * תבניות הבקשה שזמינות למשרד — שלו והמובנות.
 * ‼ עותק של המשרד גובר על מובנית עם אותו seed_key: ברגע שהמשרד ערך את
 * "מסמכים מהלקוח" משלו, הוא לא אמור לראות גם את המקורית לצידה.
 */
export async function loadRequestTemplates(): Promise<RequestTemplate[]> {
  const { data, error } = await supabase
    .from('journey_templates')
    .select('id,name,description,kind,office_id,seed_key,entries')
    .eq('kind', 'request')
    .order('name');
  if (error || !data) return [];

  const rows: RequestTemplate[] = data.map(r => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    kind: 'request',
    officeId: (r.office_id as string | null) ?? null,
    seedKey: (r.seed_key as string | null) ?? null,
    entries: Array.isArray(r.entries) ? (r.entries as TemplateEntry[]) : [],
  }));

  const overridden = new Set(
    rows.filter(t => t.officeId !== null && t.seedKey).map(t => t.seedKey as string));
  return rows.filter(t => !(t.officeId === null && t.seedKey && overridden.has(t.seedKey)));
}

/** התבנית לפי מפתח מובנה — כולל עותק המשרד אם קיים. */
export const templateBySeed = (list: RequestTemplate[], seedKey: string) =>
  list.find(t => t.seedKey === seedKey);

export const firstEntry = (t: RequestTemplate): TemplateEntry | undefined => t.entries[0];

/**
 * האם התוכן שנוצר שונה ממה שהתבנית נתנה. ‼ משווים רק את מה שהמשתמש יכול
 * לערוך בפועל — כותרת, ניסוחים והפריטים — ולא את כל ה-payload: שדות שנוספים
 * בדרך (published, templateOrigin) היו הופכים כל בקשה ל"שונה".
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
  return norm(entry.payload) !== norm(payload);
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

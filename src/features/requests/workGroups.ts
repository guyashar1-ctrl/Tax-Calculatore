// ─── קבוצות של המשרד אצל לקוח (311, שלב 2) ─────────────────────────────────────
// ‼ כל בקשה היא נקודה; מסמנים כמה ← «לחבר» ← שם. קבוצה יכולה להיות בתוך קבוצה,
// גם פייפרלס / רו״ח קודם (builtinKey). אין לקבוצה סדר משלה — מקומה הוא של הבקשה
// הראשונה שבה. כל כתיבה דרך פונקציה בשרת; הטבלה לקריאה בלבד מהדפדפן.
import { supabase } from '../../lib/supabase';

export type BuiltinGroupKey = 'paperless' | 'prevAccountant';

export interface WorkGroup {
  id: string;
  clientId: string;
  parentGroupId: string | null;
  name: string;
  builtinKey: BuiltinGroupKey | null;
}

/** נקודה שסומנה, כפי שהשרת מבין אותה. */
export type PickMember =
  | { kind: 'step'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'builtin'; key: BuiltinGroupKey };

export const WORK_GROUP_ERROR_TEXT: Record<string, string> = {
  forbidden: 'אין הרשאה.',
  client_not_found: 'הלקוח לא נמצא.',
  name_required: 'צריך שם לקבוצה.',
  need_two: 'מחברים לפחות שתי נקודות.',
  mixed_levels: 'מחברים נקודות מאותה רמה בלבד.',
  inside_builtin: 'בתוך פייפרלס או העברה מרו״ח קודם הסדר קבוע — אי אפשר לקבץ שם.',
  step_not_found: 'אחת הבקשות כבר לא קיימת. רעננו ונסו שוב.',
  group_not_found: 'הקבוצה כבר לא קיימת. רעננו ונסו שוב.',
  bad_member: 'אי אפשר לחבר את מה שסומן.',
  network: 'לא הצלחנו להגיע לשרת. שום דבר לא נשמר — נסו שוב.',
};
export const workGroupErrorText = (code?: string): string =>
  (code && WORK_GROUP_ERROR_TEXT[code]) || 'הפעולה לא הצליחה. נסו שוב.';

export function workGroupFromDb(row: Record<string, unknown>): WorkGroup {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    parentGroupId: (row.parent_group_id as string | null) ?? null,
    name: String(row.name ?? ''),
    builtinKey: (row.builtin_key as BuiltinGroupKey | null) ?? null,
  };
}

export async function loadWorkGroups(clientId: string): Promise<WorkGroup[] | null> {
  const { data, error } = await supabase.from('client_work_groups').select('*').eq('client_id', clientId);
  // ‼ מסד בלי הטבלה (לפני 311) או תקלה — בלי קבוצות, והרשימה עובדת כמו קודם.
  if (error) return null;
  return (data ?? []).map(r => workGroupFromDb(r as Record<string, unknown>));
}

type Result = { ok: true; groupId?: string } | { ok: false; error: string };
async function call(name: string, args: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: 'network' };
  const r = (data ?? {}) as { ok?: boolean; error?: string; groupId?: string };
  return r.ok ? { ok: true, groupId: r.groupId } : { ok: false, error: r.error ?? 'unknown' };
}

export const createWorkGroup = (clientId: string, name: string, members: PickMember[]) =>
  call('create_work_group', { p_client_id: clientId, p_name: name, p_members: members });
export const renameWorkGroup = (groupId: string, name: string) =>
  call('rename_work_group', { p_group_id: groupId, p_name: name });
export const dissolveWorkGroup = (groupId: string) =>
  call('dissolve_work_group', { p_group_id: groupId });

/** (312, שלב 3) קבוצה שהמשרד בנה = כלל ב«כללי פתיחה» באותו שם. נקרא אחרי חיבור ושינוי שם —
 *  השרת עולה לקבוצה העליונה, ומחזיר אילו בקשות לא נכנסו לכלל (פייפרלס, ייצוג, עבודה של המערכת). */
export type SaveAsRuleResult =
  | { ok: true; created: boolean; skipped: string[] }
  | { ok: false; error: string };
export async function saveWorkGroupAsRule(groupId: string): Promise<SaveAsRuleResult> {
  const { data, error } = await supabase.rpc('save_work_group_as_flow', { p_group_id: groupId });
  if (error) return { ok: false, error: 'network' };
  const r = (data ?? {}) as { ok?: boolean; error?: string; created?: boolean; skipped?: unknown };
  const skipped = Array.isArray(r.skipped) ? r.skipped.map(String) : [];
  return r.ok ? { ok: true, created: !!r.created, skipped } : { ok: false, error: r.error ?? 'unknown' };
}

/** ההודעה אחרי השמירה ככלל. ‼ «from_rule» (קבוצה שנפתחה מכלל) ו«nothing_to_save» אינם תקלה — בלי הודעה. */
export function saveAsRuleNote(name: string, r: SaveAsRuleResult): { text: string; err: boolean } | null {
  if (!r.ok) {
    if (r.error === 'from_rule' || r.error === 'nothing_to_save') return null;
    return { err: true, text: `הקבוצה נשמרה, אבל לא נשמרה ב«כללי פתיחה». נסו לשנות את שמה שוב.` };
  }
  const without = r.skipped.length ? ` · לא בכלל: ${r.skipped.join(', ')}` : '';
  return { err: false, text: `«${name}» ${r.created ? 'נשמרה' : 'עודכנה'} גם ב«כללי פתיחה»${without}` };
}

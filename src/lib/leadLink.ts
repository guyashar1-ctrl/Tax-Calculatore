// ─── קישור ליד לכרטיס — הדלת האחת של הדפדפן ──────────────────────────────────
// ‼ (168) "הליד הומר" הוא עובדה אחת שחיה בשלושה שדות. המקור הוא
// clients.merged_from_lead_id, והשרת גוזר ממנו את leads.status ואת
// leads.converted_client_id בטריגר. הדפדפן לא כותב יותר `status: 'converted'`
// בעצמו — הוא מקשר, והליד מתעדכן מעצמו. מחיקת הכרטיס מחזירה את הליד להיות
// ליד, בלי שאף מסך יצטרך לזכור את זה.

import { supabase } from './supabase';

export async function linkLeadToClient(leadId: string, clientId: string): Promise<void> {
  const { data, error } = await supabase.rpc('link_lead_to_client', {
    p_lead_id: leadId, p_client_id: clientId,
  });
  if (error) throw error;
  const res = data as { ok?: boolean; error?: string } | null;
  if (!res?.ok) throw new Error(`link_lead_to_client: ${res?.error ?? 'unknown'}`);
}

export type SplitCompanionResult =
  | { ok: true; leadId: string; already?: boolean }
  | { ok: false; error: 'name_required' | 'is_client' | 'companion_not_found' | 'lead_not_found' | 'forbidden' | 'failed'; clientId?: string };

/**
 * «הפרד לליד נפרד» (224) — אדם מהפנייה המשותפת נעשה ליד משלו, באותה פעולה שמוציאה
 * אותו מהפנייה. לחיצה כפולה ⇒ אותו ליד (השרת נועל את הפנייה).
 */
export async function splitLeadCompanion(leadId: string, email: string, name?: string): Promise<SplitCompanionResult> {
  const { data, error } = await supabase.rpc('split_lead_companion', {
    p_lead_id: leadId, p_email: email, p_name: name ?? null,
  });
  if (error) return { ok: false, error: 'failed' };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok && typeof r.leadId === 'string') return { ok: true, leadId: r.leadId, already: !!r.already };
  type Err = Extract<SplitCompanionResult, { ok: false }>['error'];
  return { ok: false, error: (typeof r.error === 'string' ? r.error : 'failed') as Err, clientId: r.clientId as string | undefined };
}

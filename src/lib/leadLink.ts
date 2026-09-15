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

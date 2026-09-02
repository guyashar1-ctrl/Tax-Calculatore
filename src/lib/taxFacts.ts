// ─── תיק מס — עטיפות RPC דקות, בלי תלות ב-React ─────────────────────────────
// נקראות גם מ-useTaxFacts (לשונית תיק המס, מוקד על לקוח אחד) וגם מזרימת
// הדוח השנתי (AnnualReport, שיכולה לרוץ על כל לקוח) — לכן פונקציות טהורות,
// לא הוק. ראה supabase/90-tax-fact-reconciliation.sql לסמנטיקה המלאה.

import { supabase } from './supabase';
import type { ProposedFact } from '../types/taxFacts';

export interface TaxFactRpcResult {
  ok: boolean;
  error?: string;
  change?: Record<string, any>;
  proposed?: number;
  id?: string;
  /** הלקוח המעודכן (שורת DB גולמית) — מוחזר מ-accept/manual, שעכשיו כותבים
   *  ל-clients בתוך אותה קריאה. ראה useTaxFacts.ts להמרה ל-Client. */
  client?: Record<string, any>;
  /** רק כש-error === 'stale_conflict' — אילו מפתחות בהצעה כבר לא תואמים
   *  את הערך המקובל הנוכחי (מישהו/משהו שינה אותו אחרי שההצעה נוצרה). */
  staleFields?: string[];
}

/** מציע שינויים — לעולם לא כותב ל-clients. כל פריט נוחת כ-pending. */
export async function proposeTaxFacts(
  clientId: string,
  // ‼ 'automation' — ערך שנקרא מהרשות על-ידי העובד המקומי ואומץ בלחיצה.
  // רישומו כ-'manual' היה אומר שהרו"ח הקליד אותו, וזה פשוט לא נכון.
  // מיגרציה 151 הוסיפה את המקור הזה בשרת בדיוק בשביל זה.
  source: 'questionnaire' | 'institution_alignment' | 'import' | 'automation',
  sourceRef: string | null,
  items: ProposedFact[],
): Promise<TaxFactRpcResult> {
  if (items.length === 0) return { ok: true, proposed: 0 };
  const { data, error } = await supabase.rpc('propose_tax_facts', {
    p_client_id: clientId,
    p_source: source,
    p_source_ref: sourceRef,
    p_items: items.map(i => ({
      field_key: i.fieldKey, label: i.label,
      old_value: i.oldValue ?? null, new_value: i.newValue, note: i.note ?? null,
    })),
  });
  if (error) return { ok: false, error: error.message };
  return data as TaxFactRpcResult;
}

export async function acceptTaxFactChange(changeId: string): Promise<TaxFactRpcResult> {
  const { data, error } = await supabase.rpc('accept_tax_fact_change', { p_change_id: changeId });
  if (error) return { ok: false, error: error.message };
  return data as TaxFactRpcResult;
}

export async function rejectTaxFactChange(changeId: string, note?: string): Promise<TaxFactRpcResult> {
  const { data, error } = await supabase.rpc('reject_tax_fact_change', {
    p_change_id: changeId, p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return data as TaxFactRpcResult;
}

export async function recordManualFactChange(
  clientId: string,
  fieldKey: string,
  label: string,
  oldDisplay: string,
  newDisplay: string,
  patch: Record<string, unknown>,
): Promise<TaxFactRpcResult> {
  const { data, error } = await supabase.rpc('record_manual_fact_change', {
    p_client_id: clientId,
    p_field_key: fieldKey,
    p_label: label,
    p_old_value: { display: oldDisplay },
    p_new_value: { display: newDisplay, patch },
    p_note: null,
  });
  if (error) return { ok: false, error: error.message };
  return data as TaxFactRpcResult;
}

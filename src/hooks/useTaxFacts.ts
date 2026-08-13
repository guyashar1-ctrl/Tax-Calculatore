// ─── תיק מס — הצעות ממתינות ללקוח אחד, ופעולות אישור/דחייה/עריכה ידנית ─────
// הערך המקובל נשאר על Client. ההוק הזה מנהל רק את שכבת המעברים
// (tax_fact_changes) — הכתיבה בפועל ל-clients קורית בתוך אותה קריאת RPC
// (ראה 91-tax-fact-transactions.sql): קריאת הערך הנוכחי, בדיקת עדכניות,
// כתיבת clients+field_meta וסימון הסטטוס/ההיסטוריה הם כולם צד שרת אחד,
// טרנזקציוני. ‼ ההוק הזה לא כותב ל-clients בעצמו יותר — הוא רק שולח את
// הפעולה ומתרגם את הלקוח המעודכן שחוזר מהשרת בחזרה ל-Client.
import { useCallback, useEffect, useState } from 'react';
import type { Client } from '../types';
import type { TaxFactChange } from '../types/taxFacts';
import { supabase } from '../lib/supabase';
import { taxFactChangeFromDb, clientFromDb } from '../lib/dbMappers';
import { acceptTaxFactChange, rejectTaxFactChange, recordManualFactChange } from '../lib/taxFacts';

export function useTaxFacts(clientId: string | undefined) {
  const [pending, setPending] = useState<TaxFactChange[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clientId) { setPending([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('tax_fact_changes')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (!error) setPending((data ?? []).map(taxFactChangeFromDb));
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  /**
   * מאשר הצעה. הכתיבה כולה — קריאת הערך הנוכחי, בדיקת עדכניות, כתיבת
   * clients+field_meta וסימון accepted — קורית בשרת בתוך קריאת ה-RPC
   * הזו (ראה 91-tax-fact-transactions.sql). אם הערך המקובל השתנה מאז
   * שההצעה נוצרה, השרת מסרב עם error='stale_conflict' ולא נוגע בכלום.
   */
  async function acceptFact(
    change: TaxFactChange,
  ): Promise<{ ok: boolean; error?: string; staleFields?: string[]; client?: Client }> {
    const res = await acceptTaxFactChange(change.id);
    if (!res.ok) return { ok: false, error: res.error, staleFields: res.staleFields };
    void refresh();
    return { ok: true, client: res.client ? clientFromDb(res.client) : undefined };
  }

  /** דוחה הצעה — "השאר את הערך הנוכחי". clients לא זז; ההצעה נשמרת כהחלטה. */
  async function rejectFact(changeId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
    const res = await rejectTaxFactChange(changeId, note);
    if (res.ok) void refresh();
    return { ok: res.ok, error: res.error };
  }

  /**
   * עריכה ידנית של הרו"ח — הסמכות הסופית. כתיבת clients+field_meta והוספת
   * שורת ההיסטוריה 'accepted' קורות יחד בשרת, בתוך קריאת ה-RPC הזו —
   * לא עובר דרך pending בכלל (כבר ההחלטה הסופית).
   */
  async function recordManualEdit(
    clientId: string,
    fieldKey: string,
    label: string,
    oldDisplay: string,
    newDisplay: string,
    patch: Partial<Client>,
  ): Promise<{ ok: boolean; error?: string; client?: Client }> {
    const res = await recordManualFactChange(
      clientId, fieldKey, label, oldDisplay, newDisplay, patch as Record<string, unknown>,
    );
    if (res.ok) void refresh();
    return { ok: res.ok, error: res.error, client: res.client ? clientFromDb(res.client) : undefined };
  }

  return { pending, loading, refresh, acceptFact, rejectFact, recordManualEdit };
}

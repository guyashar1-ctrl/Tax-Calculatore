// ─── תיק מס — הצעות ממתינות ללקוח אחד, ופעולות אישור/דחייה/עריכה ידנית ─────
// הערך המקובל נשאר על Client. ההוק הזה מנהל רק את שכבת המעברים
// (tax_fact_changes) ואת הכתיבה בפועל ל-clients שקורית אחרי אישור/עריכה.
//
// ‼ סדר בטוח, לא אטומי לגמרי (ראה הערת הראש ב-90-tax-fact-reconciliation.sql):
// קודם נכתב הערך האמיתי ל-clients דרך updateClient() הטיפוסי הקיים,
// ורק אחרי הצלחה מסמנים accepted בשרת. כישלון באמצע משאיר לכל היותר טיוטה
// pending תקועה — לעולם לא ערך שגוי בכרטיס.

import { useCallback, useEffect, useState } from 'react';
import type { Client } from '../types';
import type { TaxFactChange } from '../types/taxFacts';
import { supabase } from '../lib/supabase';
import { taxFactChangeFromDb } from '../lib/dbMappers';
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
   * מאשר הצעה: כותב את הפאץ' האמיתי ל-clients (דרך updateClient הקיים —
   * טיפוסי, כבר בדוק), ורק אחרי הצלחה מסמן accepted בשרת. הצעה מידעית
   * בלבד (בלי patch — למשל "מספר ילדים השתנה") פשוט מסומנת accepted,
   * בלי כתיבה לכרטיס — אין מה להחיל אוטומטית.
   */
  async function acceptFact(
    change: TaxFactChange,
    client: Client,
    updateClient: (c: Client) => Promise<Client>,
  ): Promise<{ ok: boolean; error?: string; client?: Client }> {
    const patch = change.newValue.patch;
    let updated = client;
    if (patch && Object.keys(patch).length > 0) {
      const now = new Date().toISOString();
      const fieldMeta = { ...(client.fieldMeta ?? {}) };
      for (const key of Object.keys(patch)) {
        fieldMeta[key] = { source: 'questionnaire', syncedAt: now };
      }
      updated = await updateClient({ ...client, ...patch, fieldMeta, updatedAt: now } as Client);
    }
    const res = await acceptTaxFactChange(change.id);
    if (!res.ok) return { ok: false, error: res.error };
    void refresh();
    return { ok: true, client: updated };
  }

  /** דוחה הצעה — "השאר את הערך הנוכחי". clients לא זז; ההצעה נשמרת כהחלטה. */
  async function rejectFact(changeId: string, note?: string): Promise<{ ok: boolean; error?: string }> {
    const res = await rejectTaxFactChange(changeId, note);
    if (res.ok) void refresh();
    return { ok: res.ok, error: res.error };
  }

  /**
   * עריכה ידנית של הרו"ח — הסמכות הסופית. כותב ל-clients קודם, ואז רושם
   * את השורה כ-accepted-מיידית (לא עובר דרך pending בכלל — כבר ההחלטה).
   */
  async function recordManualEdit(
    client: Client,
    fieldKey: string,
    label: string,
    oldDisplay: string,
    newDisplay: string,
    patch: Partial<Client>,
    updateClient: (c: Client) => Promise<Client>,
  ): Promise<{ ok: boolean; error?: string; client?: Client }> {
    const now = new Date().toISOString();
    const fieldMeta = { ...(client.fieldMeta ?? {}) };
    for (const key of Object.keys(patch)) {
      fieldMeta[key] = { source: 'manual', syncedAt: now };
    }
    const updated = await updateClient({ ...client, ...patch, fieldMeta, updatedAt: now } as Client);

    const res = await recordManualFactChange(client.id, fieldKey, label, oldDisplay, newDisplay, patch as Record<string, unknown>);
    if (res.ok) void refresh();
    return { ok: res.ok, error: res.error, client: updated };
  }

  return { pending, loading, refresh, acceptFact, rejectFact, recordManualEdit };
}

// ─── מה מוכן לצאת ללקוח ולאנשי משק הבית — קריאה אחת, מקור אחד ─────────────────
// עוטף את client_ready_to_send (מיגרציה 192). המגש «שלח בקשות», גלולת
// «טרם נשלח» על הכרטיסים ותת-הכותרת «הדף נשלח לאחרונה…» קוראים כולם מכאן —
// אם היו גוזרים כל אחד לבד, המונים היו סוטים זה מזה כמו "פתוחות" הישן.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ReadyOwnerItem {
  stepId: string;
  stepType: string;
  title?: string;
  publishedAt: string;
  /** תוכן שהשתנה אחרי הפרסום (פריט שנוסף, עריכה שפורסמה, פתיחה מחדש) — 192. */
  changedAt?: string;
}

export interface ReadyPerson {
  role: 'client' | 'spouse';
  name: string;
  email?: string;
  stepId: string;
  requestId: string;
  referenceNumber: string;
  deadline?: string;
}

export interface ReadyToSend {
  owner: { email?: string; lastSentAt?: string | null; items: ReadyOwnerItem[] };
  persons: ReadyPerson[];
}

export const EMPTY_READY: ReadyToSend = { owner: { items: [] }, persons: [] };

export function useReadyToSend(clientId: string | undefined, refreshKey: unknown) {
  const [ready, setReady] = useState<ReadyToSend>(EMPTY_READY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clientId) { setReady(EMPTY_READY); return; }
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('client_ready_to_send', { p_client_id: clientId });
    setLoading(false);
    const res = data as (ReadyToSend & { ok?: boolean; error?: string }) | null;
    if (rpcError || !res?.ok) {
      setError(rpcError?.message ?? res?.error ?? 'לא הצלחתי לבדוק מה מוכן לשליחה.');
      return;
    }
    setError(null);
    setReady({
      owner: { email: res.owner?.email, lastSentAt: res.owner?.lastSentAt ?? null, items: res.owner?.items ?? [] },
      persons: res.persons ?? [],
    });
  }, [clientId]);

  useEffect(() => { void reload(); }, [reload, refreshKey]);

  return { ready, loading, error, reload };
}

/** כמה מיילים ייצאו מ«שלח בקשות» — נמען לכל קבוצה. */
export function readyRecipientCount(r: ReadyToSend): number {
  return (r.owner.items.length > 0 ? 1 : 0) + r.persons.length;
}

import { useEffect, useState, useCallback } from 'react';
import type { EmailMessage } from '../types/emailActivity';
import { supabase } from '../lib/supabase';

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function fromDb(row: Record<string, any>): EmailMessage {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v === null ? undefined : v;
  return out as EmailMessage;
}

export function useEmailMessages(userId: string | undefined) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('email_messages')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(200);
    if (error) { setError(error.message); setLoading(false); return; }
    setMessages((data ?? []).map(fromDb));
    setError(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { messages, loading, error, reload: load };
}

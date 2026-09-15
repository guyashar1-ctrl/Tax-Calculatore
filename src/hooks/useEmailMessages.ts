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

/**
 * ‼ העמודה html היא גוף המייל השלם. בייצור: 635KB של html לעומת 130KB בכל
 * שאר העמודות של 200 השורות האחרונות — וכרטיס לקוח מרכיב את ההוק הזה 3–4
 * פעמים. הרשימה נטענת בלי html; מי שפותח מייל לצפייה מושך אותו ב-fetchEmailHtml.
 */
const LIST_COLUMNS = [
  'id', 'user_id', 'client_id', 'request_id', 'resend_id', 'to_email', 'subject', 'kind',
  'status', 'error', 'sent_at', 'delivered_at', 'opened_at', 'clicked_at', 'meta',
  'created_at', 'updated_at', 'idempotency_key', 'step_id',
].join(',');

export interface EmailMessagesOptions {
  /**
   * מצמצם לשורות של הלקוח. ‼ שורות **בלי** שיוך ללקוח נשלפות גם הן — מיילים
   * ישנים נשמרו בלי client_id, והקוראים מזהים אותם לפי כתובת (belongsToClientCard).
   */
  clientId?: string;
  /** מוסיף גם את שורות הבקשה (request_id) — למרכז הייצוג. */
  requestId?: string;
  /** לטעון גם את גוף המייל. ליומן המשרד שסופר "כמה בלי עותק". */
  withHtml?: boolean;
}

export function useEmailMessages(userId: string | undefined, opts?: EmailMessagesOptions) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clientId = opts?.clientId;
  const requestId = opts?.requestId;
  // ‼ קורא שלא העביר אפשרויות מקבל את ההתנהגות הישנה (כולל html) — כדי לא
  // לשבור מסך שעדיין קורא m.html ישירות. קוראים חדשים מעבירים אפשרויות.
  const withHtml = opts ? !!opts.withHtml : true;

  const load = useCallback(async () => {
    if (!userId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from('email_messages')
      .select(withHtml ? '*' : LIST_COLUMNS);
    if (clientId || requestId) {
      const or = ['client_id.is.null'];
      if (clientId) or.push(`client_id.eq.${clientId}`);
      if (requestId) or.push(`request_id.eq.${requestId}`);
      q = q.or(or.join(','));
    }
    const { data, error } = await q
      .order('sent_at', { ascending: false })
      .limit(200);
    if (error) { setError(error.message); setLoading(false); return; }
    setMessages((data ?? []).map(fromDb));
    setError(null);
    setLoading(false);
  }, [userId, clientId, requestId, withHtml]);

  useEffect(() => { load(); }, [load]);

  return { messages, loading, error, reload: load };
}

/**
 * גוף מייל אחד, לפי דרישה. null = אין עותק שמור (מייל מלפני שהשמירה נוספה) —
 * ואז הקורא ממשיך ל-backfill-email-html שמושך מ-Resend.
 */
export async function fetchEmailHtml(messageId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('html')
    .eq('id', messageId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.html as string | null) ?? null;
}

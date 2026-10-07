// ─── פגישות — טעינה, מצב החיבור ליומן, ופעולות דרך השרת ────────────────────
// ‼ הדפדפן לא כותב לטבלת meetings (225): כל יצירה/הזזה/ביטול עוברים דרך
// calendar-meeting, שכותב רק אחרי ש-Google קיבל. כאן רק קוראים ומבקשים.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { meetingFromDb, meetingErrorText, type GoogleConnection, type Meeting } from './meetingModel';
import type { PeopleOutcome } from '../../../supabase/functions/_shared/meetingCore';

export type MeetingReply =
  | { ok: true; meeting: Meeting; people?: PeopleOutcome }
  | { ok: false; error: string; text: string };

async function replyBody(data: unknown, error: unknown): Promise<Record<string, any> | null> {
  if (data && typeof data === 'object') return data as Record<string, any>;
  const ctx = (error as { context?: { clone?: () => Response } } | null)?.context;
  if (!ctx || typeof ctx.clone !== 'function') return null;
  try {
    const b: unknown = await ctx.clone().json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, any> : null;
  } catch {
    return null;
  }
}

export async function callMeetingFunction(body: Record<string, unknown>): Promise<Record<string, any>> {
  try {
    const { data, error } = await supabase.functions.invoke('calendar-meeting', { body });
    const b = await replyBody(data, error);
    // ‼ אין תשובה בכלל (רשת) ⇒ לא ידוע אם יצא — לא «נכשל». שליחה חוזרת בטוחה (אותו מזהה).
    if (!b) return { ok: false, error: error ? 'unknown_outcome' : 'save_failed' };
    return b;
  } catch {
    return { ok: false, error: 'unknown_outcome' };
  }
}

export interface MeetingsApi {
  meetings: Meeting[];
  connection: GoogleConnection | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** תשובות המוזמנים ושינויים שנעשו ישירות ביומן — מ-Google, אחת לדקה לכל היותר. */
  syncFromGoogle: () => Promise<void>;
  send: (action: 'create' | 'move' | 'cancel', body: Record<string, unknown>) => Promise<MeetingReply>;
  freebusy: (date: string) => Promise<{ start: string; end: string }[] | null>;
}

export function useMeetings(userId: string | undefined): MeetingsApi {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [connection, setConnection] = useState<GoogleConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const synced = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const since = new Date(Date.now() - 45 * 86400000).toISOString();
    const [{ data }, { data: st }] = await Promise.all([
      supabase.from('meetings').select('*').gte('starts_at', since).order('starts_at', { ascending: true }).limit(300),
      supabase.rpc('google_calendar_status'),
    ]);
    setMeetings((data ?? []).map(meetingFromDb));
    const s = (st ?? {}) as Record<string, any>;
    setConnection({ connected: !!s.connected, email: s.email, connectedAt: s.connectedAt, lastError: s.lastError ?? null });
    setLoading(false);
  }, [userId]);

  const syncFromGoogle = useCallback(async () => {
    const r = await callMeetingFunction({ action: 'sync' });
    if (r.ok && r.updated > 0) await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) { setMeetings([]); setConnection(null); setLoading(false); return; }
    refresh();
    function onVisible() { if (document.visibilityState === 'visible') refresh(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, refresh]);

  // ‼ פעם אחת בטעינה, ורק כשיש חיבור ופגישה קרובה — לא בכל רינדור.
  useEffect(() => {
    if (synced.current || !connection?.connected) return;
    if (!meetings.some(m => m.status === 'scheduled' && Date.parse(m.startsAt) > Date.now() - 2 * 3600000)) return;
    synced.current = true;
    syncFromGoogle();
  }, [connection, meetings, syncFromGoogle]);

  const send = useCallback(async (action: 'create' | 'move' | 'cancel', body: Record<string, unknown>): Promise<MeetingReply> => {
    const r = await callMeetingFunction({ action, ...body });
    // ‼ גם בכישלון — השורה בשרת אולי השתנתה (נכשל / לא ידוע), והרשימה צריכה להראות את זה.
    await refresh();
    if (r.ok && r.meeting) return { ok: true, meeting: meetingFromDb(r.meeting), ...(r.people ? { people: r.people as PeopleOutcome } : {}) };
    return { ok: false, error: String(r.error ?? ''), text: meetingErrorText(r) };
  }, [refresh]);

  const freebusy = useCallback(async (date: string) => {
    const r = await callMeetingFunction({ action: 'freebusy', date });
    return r.ok && Array.isArray(r.busy) ? r.busy as { start: string; end: string }[] : null;
  }, []);

  return { meetings, connection, loading, refresh, syncFromGoogle, send, freebusy };
}

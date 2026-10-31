import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Client } from '../../types';

/**
 * שתי קריאות המשרד בפייפרלס (316) — משימת עובד אחת לכל לחיצה, בלי AI, בלי כתיבה.
 * התוצאה האחרונה שהצליחה נשארת מוצגת עד הקריאה הבאה, עם מועד הקריאה.
 */
export type OfficeRead = 'paperless.read_retainer' | 'paperless.read_pending';

export interface PendingRow { name: string; business: string; type: string; all: number; upcoming: number }
export interface PendingReading { clients: PendingRow[]; total: number; tableTotal: number | null; badge: number | null; filtered: boolean }

interface Job { id: string; status: string; result: Record<string, unknown> | null; error_detail: string | null; needs_human: string | null; finished_at: string | null; created_at: string }
export interface OfficeReadState<T> {
  latest: { data: T; readAt: string } | null;
  /** משימה שעדיין לא הסתיימה — «בודק…» או «ממתין להתחברות לפייפרלס». */
  open: { status: string; message: string | null } | null;
  /** הניסיון האחרון נכשל (אחרי התוצאה האחרונה שהצליחה). */
  failed: string | null;
  unavailable: boolean;
}

const RPC: Record<OfficeRead, string> = { 'paperless.read_retainer': 'read_paperless_retainer_now', 'paperless.read_pending': 'read_paperless_pending_now' };
const KEY: Record<OfficeRead, 'retainer' | 'pending'> = { 'paperless.read_retainer': 'retainer', 'paperless.read_pending': 'pending' };

export function usePaperlessRead<T>(action: OfficeRead) {
  const [state, setState] = useState<OfficeReadState<T>>({ latest: null, open: null, failed: null, unavailable: false });
  const [starting, setStarting] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('automation_jobs')
      .select('id,status,result,error_detail,needs_human,finished_at,created_at')
      .eq('action_type', action).is('client_id', null)
      .order('created_at', { ascending: false }).limit(10);
    if (error) { setState(s => ({ ...s, unavailable: true })); return null; }
    const jobs = (data ?? []) as Job[];
    const ok = jobs.find(j => j.status === 'succeeded' && j.result?.[KEY[action]]);
    const open = jobs.find(j => ['queued', 'running', 'needs_human'].includes(j.status)) ?? null;
    const lastFail = jobs.find(j => j.status === 'failed');
    const failedAfterOk = lastFail && (!ok || lastFail.created_at > ok.created_at) ? (lastFail.error_detail ?? 'הבדיקה נכשלה') : null;
    setState({
      latest: ok ? { data: ok.result![KEY[action]] as T, readAt: String(ok.result!.readAt ?? ok.finished_at ?? ok.created_at) } : null,
      open: open ? { status: open.status, message: open.status === 'needs_human' ? (open.needs_human ?? open.error_detail) : null } : null,
      failed: open ? null : failedAfterOk,
      unavailable: false,
    });
    return open;
  }, [action]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const open = await load();
      if (!alive) return;
      if (open) timer.current = window.setTimeout(tick, open.status === 'needs_human' ? 10000 : 3000);
    };
    void tick();
    return () => { alive = false; if (timer.current) window.clearTimeout(timer.current); };
  }, [load, state.open?.status]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.rpc(RPC[action]);
      if (error || !(data as { ok?: boolean })?.ok) setState(s => ({ ...s, failed: 'לא ניתן להתחיל בדיקה כרגע.' }));
      await load();
    } finally { setStarting(false); }
  }, [action, load]);

  return { ...state, starting, start, busy: starting || !!state.open };
}

export function readAgo(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
  const sameDay = d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) === now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  return sameDay ? `היום ${time}` : `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' })} ${time}`;
}

const tokens = (s: string) => s.replace(/[״"'׳\-–]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/** שורה בטבלת הממתינים ⇒ הלקוח ב-PIVO: לפי שם מלא (בכל סדר) או שם העסק — רק התאמה יחידה. */
export function matchPendingRows(rows: PendingRow[], clients: Client[]) {
  const byClient = new Map<string, PendingRow>();
  const unmatched: PendingRow[] = [];
  for (const r of rows) {
    const keys = [tokens(r.name), tokens(r.business)];
    const hits = clients.filter(c => {
      const full = tokens(`${c.firstName ?? ''} ${c.lastName ?? ''}`);
      const biz = c.businessName ? tokens(c.businessName) : '';
      return (!!full && keys.includes(full)) || (!!biz && keys.includes(biz));
    });
    if (hits.length === 1 && !byClient.has(hits[0].id)) byClient.set(hits[0].id, r); else unmatched.push(r);
  }
  return { byClient, unmatched };
}

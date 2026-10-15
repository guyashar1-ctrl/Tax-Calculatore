// ─── הנתונים של «עבודות לקוחות» — טעינה אחת לרשימה ולמסילה (14.10.2026) ─────────────────────────
// ‼ המסילה מציגה כמה פתוח בכל סוג, והרשימה מציגה את השורות — מאותו מקור, כדי שהמספר והרשימה לא יסתרו.
// ‼ קורא רק onboarding_steps ו-tax_info_asks / tax_year_facts / tax_evidence (כמו TaxWorkView לפני הפיצול).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Client } from '../../types';
import type { OnboardingStep } from '../../types/onboarding';
import { supabase } from '../../lib/supabase';
import { stepFromDb } from '../../lib/dbMappers';
import { buildWorkRows, WORK_STEP_TYPES, type WorkKind, type WorkRow } from './taxWork';

type Row = Record<string, unknown>;
export interface TaxWorkData { steps: OnboardingStep[]; asks: Row[]; facts: Row[]; evidence: Row[] }

export function useTaxWork(clients: Client[]) {
  const [data, setData] = useState<TaxWorkData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const st = await supabase.from('onboarding_steps').select('*').in('step_type', [...WORK_STEP_TYPES, 'info_collection']);
    if (st.error) { setErr(st.error.message); return; }
    const steps = ((st.data ?? []) as Row[]).map(r => stepFromDb(r));
    const infoIds = steps.filter(s => s.stepType === 'info_collection').map(s => s.id);
    if (!infoIds.length) { setData({ steps, asks: [], facts: [], evidence: [] }); setErr(null); return; }
    const a = await supabase.from('tax_info_asks').select('id, step_id, state, prompt, unavailable').in('step_id', infoIds);
    if (a.error) { setErr(a.error.message); return; }
    const askIds = ((a.data ?? []) as Row[]).map(x => String(x.id));
    const [f, e] = askIds.length
      ? await Promise.all([
        supabase.from('tax_year_facts').select('ask_id, status').in('ask_id', askIds).eq('status', 'pending'),
        supabase.from('tax_evidence').select('ask_id, review').in('ask_id', askIds).eq('review', 'needs_review'),
      ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (f.error || e.error) { setErr((f.error ?? e.error)!.message); return; }
    setData({ steps, asks: (a.data ?? []) as Row[], facts: (f.data ?? []) as Row[], evidence: (e.data ?? []) as Row[] });
    setErr(null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const rows: WorkRow[] = useMemo(() => !data ? [] : buildWorkRows(
    data.steps,
    data.asks.map(x => {
      const p = (x.prompt ?? {}) as { title?: string; subjectName?: string };
      return { id: String(x.id), stepId: String(x.step_id), state: String(x.state), title: p.title ?? '', subjectName: p.subjectName };
    }),
    data.facts.map(x => ({ askId: x.ask_id ? String(x.ask_id) : undefined, status: String(x.status) })),
    data.evidence.map(x => ({ askId: x.ask_id ? String(x.ask_id) : undefined, review: String(x.review) })),
    id => byId.get(id)?.firstName ?? '',
  ).filter(r => byId.has(r.parent.clientId)), [data, byId]);

  /** לכל סוג: כמה פתוחות, וכמה מהן ממתינות למשרד — למסילה. */
  const counts = useMemo(() => {
    const out: Record<WorkKind | 'all', { open: number; mine: number }> = {
      all: { open: 0, mine: 0 }, intake: { open: 0, mine: 0 }, annual: { open: 0, mine: 0 }, wealth: { open: 0, mine: 0 }, estimate: { open: 0, mine: 0 },
    };
    for (const r of rows) {
      if (r.bucket === 'done' || r.bucket === 'cancelled') continue;
      for (const k of ['all', r.kind] as const) { out[k].open++; if (r.bucket === 'mine') out[k].mine++; }
    }
    return out;
  }, [rows]);

  return { data, err, rows, counts, load, byId };
}
export type TaxWorkState = ReturnType<typeof useTaxWork>;

// ─── שלושת הצעדים בשורת בקשת תיק מס + טעינת הנתונים שלהם ללקוח אחד (17.10.2026, שלב 1) ────────────────────
// ‼ הצעדים הם תצוגה של מצב קיים (requestSteps.ts) — לא כפתורים ולא מנוע. הפעולות נשארות בתוך השורה (TaxYearProcess)
//   ובתיק המס («אשר הכול»).

import { useEffect, useState } from 'react';
import type { OnboardingStep } from '../../types/onboarding';
import { supabase } from '../../lib/supabase';
import { buildWorkRows, kindOf, type WorkAsk, type WorkEvidence, type WorkFact, type WorkRow } from './taxWork';
import { deriveRequestSteps, pendingToCardFor, type RequestStepsView } from './requestStepsModel';
import './taxYear.css';

type Row = Record<string, unknown>;
interface StepsData {
  asks: WorkAsk[];
  facts: (WorkFact & { id: string; requestId?: string })[];
  evidence: WorkEvidence[];
  pending: { source: string; sourceRef?: string }[];
}

/**
 * הנתונים לצעדים — ארבע קריאות קטנות ללקוח (רק כשיש לו בקשת תיק מס), נטענות מחדש עם כל שינוי בבקשות (refreshKey).
 * ‼ אותם מקורות כמו «עבודות לקוחות» (useTaxWork) + ההצעות הממתינות בתיק — לא ספירה שנייה.
 */
export function useRequestStepsData(clientId: string, enabled: boolean, refreshKey: string): StepsData | null {
  const [data, setData] = useState<StepsData | null>(null);
  useEffect(() => {
    if (!enabled || !clientId) return;
    let live = true;
    void (async () => {
      const [a, f, e, c] = await Promise.all([
        supabase.from('tax_info_asks').select('id, step_id, state, prompt').eq('client_id', clientId),
        supabase.from('tax_year_facts').select('id, ask_id, request_id, status').eq('client_id', clientId),
        supabase.from('tax_evidence').select('ask_id, review').eq('client_id', clientId).eq('review', 'needs_review'),
        supabase.from('tax_fact_changes').select('id, source, source_ref').eq('client_id', clientId).eq('status', 'pending'),
      ]);
      if (!live || a.error || f.error || e.error || c.error) return;
      setData({
        asks: ((a.data ?? []) as Row[]).map(x => ({ id: String(x.id), stepId: String(x.step_id), state: String(x.state), title: String((x.prompt as { title?: string } | null)?.title ?? '') })),
        facts: ((f.data ?? []) as Row[]).map(x => ({ id: String(x.id), askId: x.ask_id ? String(x.ask_id) : undefined, requestId: x.request_id ? String(x.request_id) : undefined, status: String(x.status) })),
        evidence: ((e.data ?? []) as Row[]).map(x => ({ askId: x.ask_id ? String(x.ask_id) : undefined, review: String(x.review) })),
        pending: ((c.data ?? []) as Row[]).map(x => ({ source: String(x.source), sourceRef: x.source_ref ? String(x.source_ref) : undefined })),
      });
    })();
    return () => { live = false; };
  }, [clientId, enabled, refreshKey]);
  return data;
}

/**
 * לכל בקשת תיק מס של הלקוח — הצעדים והשבב; מחושב פעם אחת לרשימה.
 * ‼ לא hook: ב-OnboardingTab זה נקרא אחרי ה-return המוקדם של מסך המיקוד (hooks-after-institution-focus-return).
 */
export function requestStepsViews(
  steps: OnboardingStep[], data: StepsData | null, firstName: string, awaitingPublish: Set<string>,
): Map<string, { row: WorkRow; view: RequestStepsView }> {
  const out = new Map<string, { row: WorkRow; view: RequestStepsView }>();
  if (!steps.some(s => kindOf(s))) return out;
  const d = data ?? { asks: [], facts: [], evidence: [], pending: [] };
  const alignment = steps.filter(s => s.stepType.startsWith('institution_alignment_'));
  for (const row of buildWorkRows(steps, d.asks, d.facts, d.evidence, () => firstName)) {
    const view = deriveRequestSteps(row, alignment, pendingToCardFor(row.parent.id, d.pending, d.facts), {
      firstName, awaitingPage: !!row.info && awaitingPublish.has(row.info.id),
    });
    out.set(row.parent.id, { row, view });
  }
  return out;
}

export default function RequestSteps({ view }: { view: RequestStepsView }) {
  return (
    <div className="rs-steps" data-request-steps>
      {view.steps.map(s => (
        <div key={s.key} className={`rs-step is-${s.tone}`} data-rs-step={s.key}>
          <div className="rs-h"><span className="rs-dot" aria-hidden="true" />{s.title}</div>
          <p className="rs-line">{s.line}</p>
        </div>
      ))}
    </div>
  );
}

// ─── «התשובות נכנסות לבד» — כלל אחד לשלושת התהליכים (דוח שנתי, הצהרת הון, הערכת מס) (26.10.2026) ──────────────
// ‼ גיא (25.10): «התשובות נכנסות לדוח ולתיק לבד, אני לא רוצה מיליון אישורים». אחרי שהלקוח סיים לענות (לא באמצע),
//   פעם אחת לכל מצב: עדכון הכרטיס במה שאפשר עד הסוף (אחד על השני — 290), ואישור כל התשובות של הבקשה.
//   עדכון כרטיס שצריך הכרעה (התשובה לא מכסה את כל מה שבכרטיס) — plan.needsDecision, שורה אחת במסך.
import { useEffect, useMemo, useRef } from 'react';
import type { Client } from '../../types';
import type { ProposedFact } from '../../types/taxFacts';
import type { YearFact } from './types';
import * as tyApi from './api';
import { cardUpdateFor } from './recordToCard';
import { autoAcceptPlan } from '../annualReturn/workspace';

type ApplyCard = (proposals: ProposedFact[], sourceRef: string) => Promise<{ ok: boolean; client?: Client; error?: string }>;

export function useAutoAccept(o: { client: Client; facts: YearFact[]; stepId: string; filling: boolean; busy: boolean;
  run: (fn: () => Promise<unknown>, done?: string) => Promise<boolean>; applyCard: ApplyCard; enabled?: boolean }) {
  const { client, facts, stepId, filling, busy, run, applyCard, enabled = true } = o;
  const plan = useMemo(() => autoAcceptPlan(client, facts, stepId), [client, facts, stepId]);
  const autoKey = useRef('');
  useEffect(() => {
    if (!enabled || filling || busy || (!plan.card.length && !plan.accept.length)) return;
    const key = [...plan.card.map(c => c.fact.id), ...plan.accept.map(f => f.id)].sort().join(',');
    if (autoKey.current === key) return;
    autoKey.current = key;
    void run(async () => {
      let cur = client;
      for (const { fact } of plan.card) {
        const p = cardUpdateFor(cur, fact.itemKey, fact.value, { factId: fact.id, itemKey: fact.itemKey, year: fact.taxYear }, fact.subjectRole);
        if (p?.proposals.length) { const a = await applyCard(p.proposals, `tax_year_fact:${fact.id}`); if (a.client) cur = a.client; }
      }
      const ids = [...plan.card.map(c => c.fact.id), ...plan.accept.map(f => f.id)];
      return ids.length ? tyApi.decideFacts(ids, 'accept') : { ok: true };
    });
  }, [plan, filling, busy, run, client, applyCard, enabled]);
  return plan;
}

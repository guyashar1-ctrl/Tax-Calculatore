// ─── ממתינים לאישורך — שלבי קליטה שהכדור אצלי ────────────────────────────────
// ‼ יושב במסך המשימות ולא ב"על השולחן שלי": מסך השולחן אינו נגיש מהניווט,
// ומקטע שנקבר שם לא היה נראה אף פעם. קליטה שנתקעת חייבת להופיע במסך שנפתח.
// רשימה ריקה לא מציגה קופסה ריקה, אלא כלום.

import { useState } from 'react';
import type { Client } from '../types';
import type { OnboardingStep } from '../types/onboarding';
import { STEP_BALL_LABELS, STEP_TYPE_LABELS, isStepOpen } from '../types/onboarding';

interface Props {
  steps: OnboardingStep[];
  clients: Client[];
  onOpen?: (clientId: string) => void;
}

export default function OnboardingWaitingSection({ steps, clients, onOpen }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const waiting = steps.filter(s => isStepOpen(s.status) && (s.ball === 'me' || s.needsAttention));
  if (waiting.length === 0) return null;

  const nameOf = (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    return c ? `${c.firstName} ${c.lastName}`.trim() : 'לקוח';
  };

  return (
    <section className="task-group task-group-green">
      <header className="task-group-header" onClick={() => setCollapsed(c => !c)}>
        <span className={`task-group-arrow ${collapsed ? 'collapsed' : ''}`}>▾</span>
        <span className="task-group-icon">📥</span>
        <span className="task-group-title">ממתינים לאישורך</span>
        <span className="task-group-count">{waiting.length}</span>
      </header>

      {!collapsed && (
        <div className="task-group-body">
          {waiting.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap',
              padding: '.45rem .2rem', borderTop: '1px solid var(--hairline-2)', fontSize: 'var(--fs-13)',
            }}>
              <strong style={{ minWidth: 120 }}>{nameOf(s.clientId)}</strong>
              <span style={{ flex: 1, minWidth: 140, color: 'var(--ink-2)' }}>
                {STEP_TYPE_LABELS[s.stepType]}
                {s.needsAttention && <span style={{ color: 'var(--err)' }}> · דורש טיפול</span>}
              </span>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                הכדור {STEP_BALL_LABELS[s.ball]}
              </span>
              {onOpen && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpen(s.clientId)}>
                  לקליטה ←
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

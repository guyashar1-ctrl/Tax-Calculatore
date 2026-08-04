// ─── מסך המעקב: כל מי שבקליטה, בשורה אחת לכל אחד ─────────────────────────────
// ‼ השולחן עונה על "מה אני עושה עכשיו". כאן עונים על שאלה אחרת: "איך מתקדמות
// כל הקליטות" — מי כמעט גמור, מי מלא חורים, ומי תקוע ואצל מי. זה המבט שנדרש
// כשיש עשר קליטות במקביל, ושהשולחן במכוון אינו נותן.
//
// ‼ אותם עיגולים ואותם צבעים של המפה בכרטיס. שתי שפות ויזואליות לאותו מידע
// מכריחות את העין ללמוד פעמיים.

import type { Client } from '../types';
import type { Engagement, OnboardingStep } from '../types/onboarding';
import { STEP_BALL_LABELS, STEP_TYPE_LABELS, isStepOpen } from '../types/onboarding';
import { MiniJourney } from './clientTabs/OnboardingJourneyMap';
import { NEXT_ACTION, summarizeClientOnboarding } from '../utils/onboardingNext';
import { EmptyState } from './ui/States';

interface Props {
  clients: Client[];
  steps: OnboardingStep[];
  engagements: Engagement[];
  onOpen: (clientId: string) => void;
}

/** כמה ימים הקליטה פתוחה — מרגע אישור ההצעה. */
function daysInOnboarding(eng?: Engagement): number | null {
  const from = eng?.approvedAt ?? eng?.createdAt;
  if (!from) return null;
  const d = Math.floor((Date.now() - new Date(from).getTime()) / 86400000);
  return d >= 0 ? d : null;
}

export default function OnboardingClientsTable({ clients, steps, engagements, onOpen }: Props) {
  const summaries = summarizeClientOnboarding(steps);
  const byClient = new Map(clients.map(c => [c.id, c]));
  const engByClient = new Map<string, Engagement>();
  for (const e of engagements) {
    const prev = engByClient.get(e.clientId);
    if (!prev || (e.approvedAt ?? '') < (prev.approvedAt ?? '')) engByClient.set(e.clientId, e);
  }

  // תקוע קודם, ואז לפי ותק — קליטה שיושבת שלושה שבועות דורשת מבט לפני אחת מאתמול.
  const rows = summaries
    .map(s => ({ s, days: daysInOnboarding(engByClient.get(s.clientId)) }))
    .sort((a, b) => {
      const stuckDiff = Number(!!b.s.stuck) - Number(!!a.s.stuck);
      if (stuckDiff !== 0) return stuckDiff;
      return (b.days ?? -1) - (a.days ?? -1);
    });

  if (rows.length === 0) {
    return (
      <EmptyState
        headline="אין קליטות פתוחות"
        sentence="קליטה נפתחת אוטומטית כשלקוח מאשר הצעת מחיר."
      />
    );
  }

  return (
    <div className="cl-table-wrap">
      <table className="cl-table">
        <thead>
          <tr>
            <th>לקוח</th>
            <th style={{ whiteSpace: 'nowrap' }}>בקליטה</th>
            <th style={{ whiteSpace: 'nowrap' }}>התקדמות</th>
            <th>מפה</th>
            <th>הפעולה הבאה</th>
            <th style={{ whiteSpace: 'nowrap' }}>אצל מי</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, days }) => {
            const c = byClient.get(s.clientId);
            const name = c ? `${c.firstName} ${c.lastName}`.trim() || 'לקוח' : 'לקוח';
            const step = s.stuck ?? s.next;
            return (
              <tr key={s.clientId} onClick={() => onOpen(s.clientId)} style={{ cursor: 'pointer' }}>
                <td>
                  <strong>{name}</strong>
                  {s.stuck && (
                    <span style={{
                      marginInlineStart: '.4rem', fontSize: 'var(--fs-12)',
                      color: 'var(--err)', fontWeight: 600, whiteSpace: 'nowrap',
                    }}>⚠ תקוע</span>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
                  {days === null ? '—' : days === 0 ? 'היום' : `${days} ימים`}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{s.done}/{s.total}</td>
                <td><MiniJourney steps={s.steps} /></td>
                <td style={{ color: s.stuck ? 'var(--err)' : 'var(--ink-2)' }}>
                  {step
                    ? (s.stuck
                        ? STEP_TYPE_LABELS[step.stepType]
                        : step.ball === 'me' && isStepOpen(step.status) && step.status !== 'locked'
                          ? NEXT_ACTION[step.stepType]
                          : STEP_TYPE_LABELS[step.stepType])
                    : '—'}
                </td>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-3)' }}>
                  {step ? STEP_BALL_LABELS[step.ball] : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── הרשת — מסך הבוקר ─────────────────────────────────────────────────────────
// שורה ללקוח, עמודה לבקשה, ובקצה: מה הפעולה הבאה וכפתור אחד לבצע אותה.
//
// ‼ העמודות אינן "שלבים" אלא הבקשות שהרו"ח באמת עוקב אחריהן. שלב שאין לו
// עמודה עדיין נספר ב"הפעולה הבאה" — הרשת מקצרת את המבט, לא מסתירה עבודה.
//
// ‼ הפעולה הבאה מגיעה מאותה פונקציה שמניעה את הכרטיס ואת השולחן
// (utils/onboardingNext). שני מסכים שמחשבים "הבא בתור" אחרת סותרים זה את זה.

import { useMemo, useState } from 'react';
import type { Client } from '../types';
import type { Engagement, OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { STEP_TYPE_LABELS, isStepOpen, paperlessSetupItems } from '../types/onboarding';
import { NEXT_ACTION, isStuckStep, summarizeClientOnboarding } from '../utils/onboardingNext';
import { EmptyState } from './ui/States';

interface Props {
  clients: Client[];
  steps: OnboardingStep[];
  engagements: Engagement[];
  onOpen: (clientId: string) => void;
}

type CellTone = 'done' | 'wait' | 'late' | 'stuck' | 'locked' | 'none';

interface Cell { text: string; tone: CellTone }

const TONE_COLOR: Record<CellTone, string> = {
  done: 'var(--ink-3)',      // ‼ הושלם אינו אירוע — אפור, לא ירוק
  wait: 'var(--ink-2)',
  late: 'var(--warn)',
  stuck: 'var(--err)',
  locked: 'var(--ink-3)',
  none: 'var(--ink-3)',
};

/** מעל זה השלב מסומן "דורש טיפול" בשרת (refresh_onboarding_attention). סף אחד. */
const WAIT_DAYS = 7;

const COLUMNS: { key: string; label: string; kinds: OnboardingStepType[] }[] = [
  { key: 'prev', label: 'רו״ח קודם', kinds: ['prev_accountant_details', 'release_letter', 'materials_received'] },
  { key: 'docs', label: 'מסמכים', kinds: ['client_documents'] },
  { key: 'paperless', label: 'פייפרלס', kinds: ['paperless_invite', 'paperless_connection'] },
  { key: 'billing', label: 'הרשאת חיוב', kinds: ['retainer_authorization'] },
  { key: 'rep', label: 'ייצוג', kinds: ['representation', 'representation_upgrade', 'file_opening'] },
];

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d >= 0 ? d : null;
}

/** ‼ שלב החיבור לפייפרלס נמדד מול חמישה סעיפים, והחמישי ("הלקוח הזין כרטיס")
 *  חי כחותמת על שלב התשלום ולא ברשימה שלו — ולכן ספירה של payload.checklist
 *  לבדו הציגה כאן "4/4" בזמן שכרטיס הבקשה אמר "4 מתוך 5". */
function checklistCount(s: OnboardingStep, all: OnboardingStep[]): string | null {
  if (s.stepType === 'paperless_connection'
    && s.payload?.paperlessStatus !== 'not_applicable'
    && (s.payload?.checklist?.length ?? 0) > 0) {
    const items = paperlessSetupItems(s, all.find(x => x.stepType === 'retainer_authorization'));
    return `${items.filter(i => i.done).length}/${items.length}`;
  }
  const list = s.payload?.checklist;
  if (!list?.length) return null;
  return `${list.filter(i => i.done).length}/${list.length}`;
}

/** מצב עמודה אחת: מה קורה בקבוצת השלבים שלה, בלשון קצרה. */
function cellFor(steps: OnboardingStep[], kinds: OnboardingStepType[]): Cell {
  const group = steps.filter(s => kinds.includes(s.stepType) && s.status !== 'cancelled');
  if (group.length === 0) return { text: '-', tone: 'none' };

  const open = group.filter(s => isStepOpen(s.status));
  if (open.length === 0) {
    return { text: group.every(s => s.status === 'skipped') ? 'לא נדרש' : '✓', tone: 'done' };
  }

  const stuck = open.find(isStuckStep);
  if (stuck) {
    const d = daysSince(stuck.updatedAt);
    return { text: d && d > 0 ? `תקוע · ${d} ימים` : 'תקוע', tone: 'stuck' };
  }

  // שלב שכולו נעול אינו "ממתין" — הוא פשוט עוד לא בתור.
  const actionable = open.filter(s => s.status !== 'locked');
  if (actionable.length === 0) return { text: 'נעול', tone: 'locked' };

  const focus = actionable[0];
  const count = checklistCount(focus, steps);
  const d = daysSince(focus.updatedAt);
  const late = focus.ball === 'client' && d !== null && d >= WAIT_DAYS;
  const parts = [count, d !== null && d > 0 ? `${d} ימים` : null].filter(Boolean);

  return {
    text: parts.length ? parts.join(' · ') : (focus.ball === 'me' ? 'אצלך' : 'ממתין'),
    tone: late ? 'late' : 'wait',
  };
}

export default function OnboardingGrid({ clients, steps, engagements, onOpen }: Props) {
  const [mineOnly, setMineOnly] = useState(true);

  const byClient = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const engByClient = useMemo(() => {
    const m = new Map<string, Engagement>();
    for (const e of engagements) {
      const prev = m.get(e.clientId);
      if (!prev || (e.approvedAt ?? '') < (prev.approvedAt ?? '')) m.set(e.clientId, e);
    }
    return m;
  }, [engagements]);

  const rows = useMemo(() => summarizeClientOnboarding(steps)
    // ‼ שלבים ששרדו מחיקת כרטיס אינם שורה בטבלה.
    .filter(s => byClient.has(s.clientId))
    .map(s => {
      const eng = engByClient.get(s.clientId);
      const step = s.stuck ?? s.next;
      const needsMe = !!s.stuck || (step?.ball === 'me' && isStepOpen(step.status) && step.status !== 'locked');
      return {
        ...s,
        eng,
        step,
        needsMe,
        days: daysSince(eng?.approvedAt ?? eng?.createdAt),
        cells: COLUMNS.map(col => cellFor(s.steps, col.kinds)),
      };
    })
    .sort((a, b) => {
      const stuckDiff = Number(!!b.stuck) - Number(!!a.stuck);
      if (stuckDiff !== 0) return stuckDiff;
      const mineDiff = Number(b.needsMe) - Number(a.needsMe);
      if (mineDiff !== 0) return mineDiff;
      return (b.days ?? -1) - (a.days ?? -1);
    }), [steps, byClient, engByClient]);

  const mineCount = rows.filter(r => r.needsMe).length;
  const shown = mineOnly ? rows.filter(r => r.needsMe) : rows;

  if (rows.length === 0) {
    return (
      <EmptyState
        headline="אין קליטות פתוחות"
        sentence="קליטה נפתחת אוטומטית כשלקוח מאשר הצעת מחיר."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: '.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={mineOnly ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'}
          onClick={() => setMineOnly(v => !v)}
          aria-pressed={mineOnly}
        >
          רק מה שדורש ממני · {mineCount}
        </button>
        <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
          {mineOnly && mineCount < rows.length
            ? `מוצגים ${shown.length} מתוך ${rows.length} קליטות`
            : `${rows.length} קליטות פתוחות`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', margin: '.4rem 0' }}>
          אין כרגע קליטה שמחכה לך - הכל אצל הלקוחות או אצל גורמי חוץ.
        </p>
      ) : (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th>לקוח</th>
                {COLUMNS.map(c => <th key={c.key} style={{ whiteSpace: 'nowrap' }}>{c.label}</th>)}
                <th>הפעולה הבאה</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const c = byClient.get(r.clientId);
                const name = `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'לקוח ללא שם';
                const action = r.step
                  ? (r.stuck
                      ? STEP_TYPE_LABELS[r.step.stepType]
                      : r.needsMe
                        ? NEXT_ACTION[r.step.stepType]
                        : `${STEP_TYPE_LABELS[r.step.stepType]} - ${r.step.ball === 'client' ? 'אצל הלקוח' : 'ממתין'}`)
                  : 'הכל סגור';
                return (
                  <tr key={r.clientId} onClick={() => onOpen(r.clientId)} style={{ cursor: 'pointer' }}>
                    <td>
                      <strong>{name}</strong>
                      <span style={{ display: 'block', fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                        {r.days === null ? '' : r.days === 0 ? 'נפתחה היום' : `יום ${r.days}`}
                        {` · ${r.done} מתוך ${r.total}`}
                      </span>
                    </td>
                    {r.cells.map((cell, i) => (
                      <td key={COLUMNS[i].key} style={{ whiteSpace: 'nowrap', color: TONE_COLOR[cell.tone] }}>
                        {cell.text}
                      </td>
                    ))}
                    <td style={{ color: r.stuck ? 'var(--err)' : r.needsMe ? 'var(--ink)' : 'var(--ink-3)' }}>
                      {action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

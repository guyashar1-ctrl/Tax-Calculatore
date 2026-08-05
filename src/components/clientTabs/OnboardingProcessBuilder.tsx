// ─── בונה התהליך — הרגע שאחרי החתימה ─────────────────────────────────────────
// ‼ המסך הזה קיים כדי שהלקוח לא יקבל רשימת מטלות שהרו"ח לא ראה. ייפוי הכוח
// כבר נפתח לו מיד בחתימה (הרגע החם); כל השאר ממתין ללחיצה אחת כאן.
//
// ‼ אותה שפה של מרכז השליטה, במצב בנייה. מי שלמד מסך אחד יודע גם את השני.

import { useMemo, useState } from 'react';
import type { Engagement, OnboardingStep } from '../../types/onboarding';
import { STEP_BALL_LABELS, STEP_TYPE_LABELS } from '../../types/onboarding';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import { supabase } from '../../lib/supabase';
import AddRequestDialog from './AddRequestDialog';
import JourneyTemplatesDialog from './JourneyTemplatesDialog';

interface Props {
  clientName: string;
  engagement: Engagement;
  /** כל השלבים של הלקוח — כולל מבוטלים, כי כאן "מבוטל" הוא פשוט מתג כבוי. */
  steps: OnboardingStep[];
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  refresh?: () => void;
}

/** מה שקורה בלי שביקשו — מוצג כדי שהרו"ח לא יחפש אותו ברשימה. */
const AUTOMATIC: OnboardingStep['stepType'][] = ['representation', 'representation_upgrade'];

/** בקשות שהלקוח רואה בדף האישי. השאר הוא עבודה פנימית. */
const CLIENT_FACING: OnboardingStep['stepType'][] = [
  'client_documents', 'prev_accountant_details', 'paperless_connection',
  'retainer_authorization', 'intake_questionnaire',
];

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--ink-3)',
      letterSpacing: '.02em', paddingTop: '.2rem',
    }}>{children}</span>
  );
}

function clientVoice(s: OnboardingStep): { title: string; sub: string } {
  const p = s.payload ?? {};
  return {
    title: p.clientTitle || STEP_TYPE_LABELS[s.stepType],
    sub: p.clientSub || '',
  };
}

export default function OnboardingProcessBuilder({
  clientName, engagement, steps, advance, refresh,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const mine = useMemo(
    () => steps.filter(s => s.engagementId === engagement.id || s.clientId === engagement.clientId),
    [steps, engagement]);

  const autoSteps = useMemo(
    () => mine.filter(s => AUTOMATIC.includes(s.stepType) && s.status !== 'cancelled'),
    [mine]);

  // הסדר שהרו"ח קבע גובר; סדר היצירה הוא רק שובר שוויון.
  const rows = useMemo(
    () => mine
      .filter(s => !AUTOMATIC.includes(s.stepType))
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
                   || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [mine]);

  const active = rows.filter(s => s.status !== 'cancelled');
  const askRows = rows.filter(s => CLIENT_FACING.includes(s.stepType));
  const officeRows = rows.filter(s => !CLIENT_FACING.includes(s.stepType));

  // ‼ התצוגה המקדימה חייבת להתנהג כמו הדף האישי, אחרת היא מבטיחה משהו אחר:
  // שלב נעול אינו פעולה ממוספרת אצל הלקוח אלא שורת "ייפתח בהמשך".
  const preview = active.filter(s => CLIENT_FACING.includes(s.stepType) && s.status !== 'locked');
  const previewLocked = active.filter(s => CLIENT_FACING.includes(s.stepType) && s.status === 'locked');

  async function toggle(step: OnboardingStep) {
    setBusyId(step.id);
    setError(null);
    const on = step.status === 'cancelled';
    const res = await advance(step.id, on ? 'reopen' : 'cancel',
      on ? { note: 'הוחזר לתהליך בבונה' } : { note: 'הוסר מהתהליך בבונה' });
    if (!res.ok) setError(res.message || 'לא הצלחתי לשנות את הבקשה.');
    setBusyId(null);
  }

  /** סידור השורות. הסדר הזה הוא מה שהלקוח יראה בדף האישי. */
  async function move(id: string, dir: -1 | 1) {
    const list = rows.map(s => s.id);
    const i = list.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setBusyId(id);
    const { error: rpcError } = await supabase.rpc('reorder_onboarding_steps', {
      p_client_id: engagement.clientId, p_ids: list,
    });
    setBusyId(null);
    if (rpcError) { setError(rpcError.message); return; }
    refresh?.();
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('publish_onboarding_process', {
      p_engagement_id: engagement.id,
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) setError('לא הצלחתי לפתוח את התהליך. נסה שוב.');
    else refresh?.();
    setPublishing(false);
  }

  return (
    <section className="ob-builder" style={{ display: 'grid', gap: '.9rem' }}>
      <header style={{ display: 'grid', gap: '.25rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <span style={{
            padding: '.1rem .5rem', borderRadius: '.4rem', fontSize: 'var(--fs-12)',
            fontWeight: 600, background: 'var(--ok-bg, #e4f1ea)', color: 'var(--ok, #17845b)',
          }}>ההצעה אושרה</span>
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
            {clientName}
            {engagement.monthlyTotal ? ` · ${engagement.monthlyTotal.toLocaleString('he-IL')} ₪ לחודש` : ''}
          </span>
        </span>
        <h3 style={{ margin: 0 }}>מה אתה צריך ממנו, ובאיזה סדר?</h3>
        <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
          ייפוי הכוח כבר נפתח לו. שאר הבקשות יופיעו בדף האישי שלו רק אחרי שתלחץ "פתח ללקוח".
        </p>
      </header>

      {error && (
        <div role="alert" style={{
          padding: '.5rem .7rem', borderRadius: '.5rem',
          background: 'var(--err-bg, #fdeaea)', color: 'var(--err)', fontSize: 'var(--fs-13)',
        }}>{error}</div>
      )}

      {autoSteps.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap',
          padding: '.55rem .75rem', borderRadius: '.55rem', background: 'var(--bg-2, #f3f2f0)',
        }}>
          <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>קורה מעצמו</span>
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
            {[...new Set(autoSteps.map(s => STEP_TYPE_LABELS[s.stepType]))].join(' · ')}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0,1fr) minmax(0,22rem)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          {rows.length === 0 && (
            <p style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', margin: 0 }}>
              אין בקשות להרכיב — ההצעה לא יצרה שלבים שדורשים משהו מהלקוח.
            </p>
          )}

          {askRows.length > 0 && <GroupTitle>מה אני מבקש ממנו</GroupTitle>}
          {[...askRows, ...officeRows].map((s, idx) => {
            const off = s.status === 'cancelled';
            const locked = !!s.dependsOnStepId;
            // ‼ הכרת הלקוח היא חתימה רגולטורית — אין מתג שמכבה אותה.
            const fixed = s.stepType === 'kyc_identification';
            const officeHead = idx === askRows.length && officeRows.length > 0;
            return (
              <div key={s.id} style={{ display: 'grid', gap: '.5rem' }}>
              {officeHead && <GroupTitle>אצלי במשרד</GroupTitle>}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '.7rem',
                padding: '.6rem .75rem', borderRadius: '.55rem',
                border: `1px solid ${off ? 'var(--bd)' : 'var(--bd-strong, var(--bd))'}`,
                background: off ? 'transparent' : 'var(--card, #fff)',
                opacity: off ? .6 : 1,
              }}>
                {fixed ? (
                  <span
                    title="חובה רגולטורית — לא ניתן להסיר"
                    style={{
                      flexShrink: 0, width: '2.1rem', textAlign: 'center',
                      fontSize: 'var(--fs-12)', color: 'var(--ink-3)',
                    }}>חובה</span>
                ) : (
                <button
                  type="button"
                  onClick={() => void toggle(s)}
                  disabled={busyId === s.id}
                  aria-pressed={!off}
                  aria-label={`${off ? 'להוסיף' : 'להסיר'} — ${STEP_TYPE_LABELS[s.stepType]}`}
                  style={{
                    flexShrink: 0, width: '2.1rem', height: '1.2rem', padding: '.12rem',
                    display: 'inline-flex', alignItems: 'center', border: 'none',
                    borderRadius: '999px', cursor: 'pointer',
                    background: off ? 'var(--bd-strong, #d3d6da)' : 'var(--accent)',
                    justifyContent: off ? 'flex-start' : 'flex-end',
                  }}
                >
                  <span style={{ width: '.95rem', height: '.95rem', borderRadius: '999px', background: '#fff' }} />
                </button>
                )}

                <span style={{ display: 'grid', gap: '.1rem', flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: off ? 'var(--ink-3)' : 'var(--ink)' }}>
                    {STEP_TYPE_LABELS[s.stepType]}
                  </span>
                  {clientVoice(s).sub && (
                    <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{clientVoice(s).sub}</span>
                  )}
                </span>

                <span style={{
                  flexShrink: 0, fontSize: 'var(--fs-12)', color: 'var(--ink-3)',
                  padding: '.15rem .45rem', borderRadius: '.35rem', background: 'var(--bg-2, #f3f2f0)',
                  whiteSpace: 'nowrap',
                }}>{STEP_BALL_LABELS[s.ball]}</span>

                {locked && (
                  <span style={{ flexShrink: 0, fontSize: 'var(--fs-12)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                    🔒 בתור
                  </span>
                )}

                {/* ‼ הסדר כאן הוא הסדר שהלקוח יראה בדף האישי, ולכן הוא חלק
                    מההרכבה ולא קישוט. חצים ולא גרירה — בלי ספריות חדשות. */}
                <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למעלה"
                    disabled={busyId === s.id} onClick={() => void move(s.id, -1)}
                    style={{ padding: '0 .3rem' }}>↑</button>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למטה"
                    disabled={busyId === s.id} onClick={() => void move(s.id, 1)}
                    style={{ padding: '0 .3rem' }}>↓</button>
                </span>
              </div>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: '.4rem', justifySelf: 'start' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(true)}>+ בקשה</button>
            <button type="button" className="btn btn-ghost" onClick={() => setTemplatesOpen(true)}>תבניות מסע</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', flexWrap: 'wrap', paddingTop: '.2rem' }}>
            <button type="button" className="btn btn-primary" onClick={() => void publish()} disabled={publishing}>
              {publishing ? 'פותח…' : 'צור את התהליך ופתח ללקוח'}
            </button>
            <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>אפשר לשנות הכל אחר כך.</span>
          </div>
        </div>

        <aside style={{
          display: 'grid', gap: '.5rem', padding: '.75rem',
          borderRadius: '.6rem', background: 'var(--bg-2, #f3f2f0)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--fs-13)' }}>מה הוא יראה</span>
          {preview.length === 0 && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
              אף בקשה לא מופנית ללקוח — הדף שלו יראה רק את מה שבטיפולנו.
            </span>
          )}
          {previewLocked.map(s => (
            <div key={s.id} style={{
              display: 'flex', gap: '.5rem', alignItems: 'center',
              padding: '.5rem', borderRadius: '.5rem', border: '1px dashed var(--bd)',
              fontSize: 'var(--fs-12)', color: 'var(--ink-3)',
            }}>
              <span aria-hidden="true">🔒</span>
              <span>{clientVoice(s).title} — ייפתח בהמשך</span>
            </div>
          ))}
          {preview.map((s, i) => {
            const v = clientVoice(s);
            return (
              <div key={s.id} style={{
                display: 'flex', gap: '.55rem', alignItems: 'flex-start',
                padding: '.55rem', borderRadius: '.5rem', background: 'var(--card, #fff)',
                border: '1px solid var(--bd)',
              }}>
                <span style={{
                  flexShrink: 0, width: '1.35rem', height: '1.35rem', borderRadius: '.35rem',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--fs-12)', fontWeight: 700,
                  border: '2px solid var(--bd-strong, #d3d6da)', color: 'var(--ink-3)',
                }}>{i + 1}</span>
                <span style={{ display: 'grid', gap: '.15rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--fs-13)' }}>{v.title}</span>
                  {v.sub && <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{v.sub}</span>}
                </span>
              </div>
            );
          })}
        </aside>
      </div>

      {addOpen && (
        <AddRequestDialog
          clientId={engagement.clientId}
          steps={mine}
          processPublished={false}
          onClose={() => setAddOpen(false)}
          onCreated={() => refresh?.()}
        />
      )}

      {templatesOpen && (
        <JourneyTemplatesDialog
          clientId={engagement.clientId}
          clientName={clientName}
          onClose={() => setTemplatesOpen(false)}
          onApplied={() => refresh?.()}
        />
      )}
    </section>
  );
}

// ─── שער הכיסוי — "מאזן 1301" ────────────────────────────────────────────────
// הרגע שבו יודעים שלא פספסנו: כל סעיף בטופס חייב להיות 🟢 (מכוסה) או
// 🔴 (נבדק ולא רלוונטי). 🟡 (טרם הוכרע) חוסם את המעבר להכנת הדוח.
// כאן גם מתקבלות החלטות הרו"ח (מסלול שכירות, חישוב נפרד, פריסות...).

import { useEffect, useMemo, useState } from 'react';
import type { AnnualReportSession, QuestionNode, SectionKey } from './types';
import type { AnswerValue } from './types';
import { SECTION_LABELS } from './form1301Fields';
import { computeAllFieldStatuses, getQuestionById, nodeInFlow } from './engine';
import { annualReportTree, chaptersForModel } from './tree';
import { getAnswersForSession, saveAnswer, updateSessionState } from './repository';
import QuestionCard from './QuestionCard';

interface Props {
  session: AnnualReportSession;
  clientName: string;
  onSessionUpdate: (s: AnnualReportSession) => void;
  onReady: () => void;   // נלחץ "מוכן להכנה" (סטטוס עודכן) — ההורה מחליף מסך
}

export default function CoverageGate({ session, clientName, onSessionUpdate, onReady }: Props) {
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [openDecision, setOpenDecision] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const answers = await getAnswersForSession(session.id);
        if (!cancelled) setAnsweredIds(new Set(answers.map((a) => a.questionId)));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [session.id]);

  const model = session.model;
  const liveChapters = useMemo(() => chaptersForModel(model), [model]);

  // ─── החלטות רו"ח רלוונטיות שטרם נענו ────────────────────────────────────
  const pendingDecisions: QuestionNode[] = useMemo(() => {
    return Object.values(annualReportTree.nodes).filter((n) => {
      if (n.audience !== 'accountant') return false;
      if (answeredIds.has(n.id)) return false;
      if (!liveChapters.includes(n.chapter ?? 'finish')) return false;
      if (n.visibleWhen && !n.visibleWhen(model)) return false;
      return nodeInFlow(n, model);
    });
  }, [answeredIds, liveChapters, model]);

  // ─── סטטוס שדות מקובץ לפי חלקי הטופס ────────────────────────────────────
  const bySection = useMemo(() => {
    const statuses = computeAllFieldStatuses(model, answeredIds);
    const groups = new Map<SectionKey, typeof statuses>();
    for (const s of statuses) {
      const arr = groups.get(s.field.section) ?? [];
      arr.push(s);
      groups.set(s.field.section, arr);
    }
    return groups;
  }, [model, answeredIds]);

  const totals = useMemo(() => {
    let active = 0, pruned = 0, pending = 0;
    for (const arr of bySection.values()) {
      for (const s of arr) {
        if (s.status === 'active') active++;
        else if (s.status === 'pruned') pruned++;
        else pending++;
      }
    }
    return { active, pruned, pending };
  }, [bySection]);

  const blocked = totals.pending > 0 || pendingDecisions.length > 0;

  async function answerDecision(node: QuestionNode, value: AnswerValue) {
    setSaving(true);
    try {
      const newModel = node.applyToModel(model, value);
      await saveAnswer(session.id, node.id, value);
      const updated = await updateSessionState(session.id, { model: newModel });
      setAnsweredIds((prev) => new Set(prev).add(node.id));
      setOpenDecision(null);
      onSessionUpdate(updated);
    } finally {
      setSaving(false);
    }
  }

  async function markReady(override: boolean) {
    if (blocked && !override) return;
    if (blocked && override) {
      const ok = window.confirm(
        `נותרו ${totals.pending} סעיפים שטרם הוכרעו ו-${pendingDecisions.length} החלטות פתוחות.\nלסמן "מוכן להכנה" בכל זאת?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const updated = await updateSessionState(session.id, { status: 'mapping_done' });
      onSessionUpdate(updated);
      onReady();
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div style={{ maxWidth: 900, margin: '2rem auto', textAlign: 'center', color: 'var(--gray-500)' }}>טוען מאזן…</div>;

  return (
    <div style={{ maxWidth: 980, margin: '1.5rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '.5rem' }}>
        <h2 style={{ margin: 0 }}>🚦 מאזן כיסוי 1301 — {clientName} · {session.taxYear}</h2>
        <span className="num" style={{ fontWeight: 700 }}>
          <span style={{ color: 'var(--green)' }}>{totals.active} 🟢 מכוסים</span>
          {' · '}<span style={{ color: 'var(--red)' }}>{totals.pruned} 🔴 לא רלוונטיים</span>
          {' · '}<span style={{ color: '#b45309' }}>{totals.pending} 🟡 טרם הוכרעו</span>
        </span>
      </div>
      <p style={{ color: 'var(--gray-600)', fontSize: '.9rem' }}>
        כל סעיף חייב להיות ירוק (רלוונטי ומכוסה) או אדום (נבדק ולא רלוונטי). צהוב = השאלון טרם הכריע לגביו.
      </p>

      {/* ─── החלטות רו"ח פתוחות ─── */}
      {pendingDecisions.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', border: '1.5px solid #f2d492' }}>
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>🧑‍💼 החלטות מקצועיות פתוחות ({pendingDecisions.length})</h3>
            <p style={{ fontSize: '.85rem', color: 'var(--gray-600)', marginTop: 0 }}>
              אלה הכרעות שלך, לא של הלקוח — למשל בחירת מסלול שכירות אחרי הרצת מחשבון האופטימיזציה.
            </p>
            {pendingDecisions.map((n) => (
              <div key={n.id} style={{ borderTop: '1px solid var(--gray-100)', padding: '.6rem 0' }}>
                {openDecision === n.id ? (
                  <QuestionCard
                    node={n}
                    disabled={saving}
                    submitLabel="שמור החלטה"
                    onSubmit={(v) => void answerDecision(n, v)}
                    onCancel={() => setOpenDecision(null)}
                  />
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem' }}>
                    <span style={{ fontSize: '.9rem', fontWeight: 600 }}>{n.question}</span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenDecision(n.id)}>
                      הכרע עכשיו
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── מאזן לפי חלקי הטופס ─── */}
      <div className="card">
        <div className="card-body">
          {Array.from(bySection.entries()).map(([section, fields]) => {
            const pend = fields.filter((f) => f.status === 'pending');
            const act = fields.filter((f) => f.status === 'active');
            const icon = pend.length > 0 ? '🟡' : act.length > 0 ? '🟢' : '🔴';
            return (
              <details key={section} open={pend.length > 0} style={{ borderBottom: '1px solid var(--gray-100)', padding: '.45rem 0' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.92rem', display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <span>{icon}</span>
                  <span style={{ flex: 1 }}>{SECTION_LABELS[section]}</span>
                  <span className="num" style={{ fontSize: '.78rem', color: 'var(--gray-500)' }}>
                    {act.length} פעילים · {pend.length} פתוחים · {fields.length - act.length - pend.length} לא רלוונטיים
                  </span>
                </summary>
                <div style={{ padding: '.4rem .2rem .2rem 0' }}>
                  {fields.map((f) => {
                    const missingQs = f.status === 'pending'
                      ? f.field.sourceQuestionIds.filter((q) => !answeredIds.has(q))
                        .map((q) => getQuestionById(q)?.question ?? q)
                      : [];
                    return (
                      <div key={f.field.fieldNumber} style={{ display: 'flex', gap: '.5rem', fontSize: '.82rem', padding: '.2rem 0', alignItems: 'baseline' }}>
                        <span>{f.status === 'active' ? '🟢' : f.status === 'pruned' ? '🔴' : '🟡'}</span>
                        <span className="num" style={{ fontWeight: 700, minWidth: 74 }}>{f.field.fieldNumber}</span>
                        <span style={{ flex: 1 }}>
                          {f.field.hebrewLabel}
                          {missingQs.length > 0 && (
                            <span style={{ display: 'block', fontSize: '.72rem', color: '#b45309' }}>
                              ממתין ל: {missingQs.slice(0, 2).join(' · ')}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* ─── פס הסיום ─── */}
      <div style={{
        marginTop: '1rem', padding: '.8rem 1.1rem', borderRadius: 10, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.6rem',
        background: blocked ? '#FBF2E2' : '#E8F3EC',
        border: blocked ? '1.5px solid #f2d492' : '1.5px solid #b7dcc4',
      }}>
        <span style={{ fontWeight: 700, fontSize: '.9rem', color: blocked ? '#b45309' : 'var(--green)' }}>
          {blocked
            ? `⛔ נותרו ${totals.pending} סעיפים פתוחים ו-${pendingDecisions.length} החלטות — המאזן לא סגור.`
            : '✓ המאזן סגור: כל סעיפי הטופס הוכרעו. אפשר לעבור להכנת הדוח.'}
        </span>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {blocked && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => void markReady(true)}>
              עקוף וסמן בכל זאת
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || blocked}
            style={{ opacity: blocked ? 0.5 : 1 }}
            onClick={() => void markReady(false)}
          >
            ✓ סמן כמוכן להכנה
          </button>
        </div>
      </div>
    </div>
  );
}

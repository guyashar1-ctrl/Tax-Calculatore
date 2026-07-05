// ─── סרגל העץ החי — מלווה את הראיון (מצב רו"ח בלבד) ─────────────────────────
// גרסה מכווצת של עץ ההחלטות: פרקים עם נקודות סטטוס + מד כיסוי 1301 חי.
// "הרחב מפה" פותח את TreeMapView המלא כשכבת-על. בזרימת לקוח עתידית — לא מוצג.

import { useMemo, useState } from 'react';
import type { AnnualReportSession, ChapterKey, QuestionNode, TaxpayerModel } from './types';
import { CHAPTER_LABELS } from './types';
import { chaptersForModel, nodesByChapter } from './tree';
import { computeAllFieldStatuses, nodeInFlow } from './engine';
import TreeMapView from './TreeMapView';
import type { Client } from '../../types';

interface Props {
  model: TaxpayerModel;
  answeredQuestionIds: Set<string>;
  currentQuestionId: string | null;
  client?: Client | null;
  session?: AnnualReportSession | null;
}

const CHAPTER_ICONS: Record<ChapterKey, string> = {
  identity_family: '👤', salary: '💼', business: '🧾', rental: '🏠',
  capital: '📈', pension_ni: '🌅', foreign: '✈️', companies: '🏢',
  deductions: '💝', special: '⭐', finish: '📋',
};

export default function CoverageRail({ model, answeredQuestionIds, currentQuestionId, client, session }: Props) {
  const [mapOpen, setMapOpen] = useState(false);

  const liveChapters = useMemo(() => chaptersForModel(model), [model]);
  const byChapter = useMemo(() => nodesByChapter(), []);

  function nodeState(node: QuestionNode): 'done' | 'now' | 'todo' | 'cut' {
    if (node.id === currentQuestionId) return 'now';
    if (answeredQuestionIds.has(node.id)) return 'done';
    const chapterAlive = liveChapters.includes(node.chapter ?? 'finish');
    const visible = !node.visibleWhen || node.visibleWhen(model);
    return chapterAlive && visible && nodeInFlow(node, model) ? 'todo' : 'cut';
  }

  const meter = useMemo(() => {
    const statuses = computeAllFieldStatuses(model, answeredQuestionIds);
    return {
      active: statuses.filter((s) => s.status === 'active').length,
      pruned: statuses.filter((s) => s.status === 'pruned').length,
      pending: statuses.filter((s) => s.status === 'pending').length,
      total: statuses.length,
    };
  }, [model, answeredQuestionIds]);

  const pct = (n: number) => `${Math.round((n / Math.max(1, meter.total)) * 100)}%`;

  return (
    <div style={{
      border: '1px solid var(--gray-200)', borderRadius: 12,
      background: 'linear-gradient(180deg,#FBFBF8,#F4F5F2)', padding: '.75rem .8rem', fontSize: '.78rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, marginBottom: '.5rem' }}>
        <span>🌳 עץ הראיון</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '.7rem', padding: '.1rem .4rem' }}
          onClick={() => setMapOpen(true)}
        >
          הרחב מפה ⤢
        </button>
      </div>

      {liveChapters.map((ch) => {
        const nodes = (byChapter.get(ch) ?? []);
        if (nodes.length === 0) return null;
        const states = nodes.map((n) => nodeState(n));
        const isDone = states.every((s) => s === 'done' || s === 'cut');
        const isNow = states.includes('now');
        return (
          <div key={ch} style={{ marginBottom: '.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '.74rem', color: isNow ? 'var(--blue)' : 'var(--gray-600)' }}>
              <span>{CHAPTER_ICONS[ch]} {CHAPTER_LABELS[ch]}</span>
              <span>{isDone ? <span style={{ color: 'var(--green)' }}>✓</span> : isNow ? '●' : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
              {nodes.map((n) => {
                const s = nodeState(n);
                return (
                  <span
                    key={n.id}
                    title={n.question}
                    style={{
                      width: 9, height: 9, borderRadius: 3, display: 'inline-block',
                      background: s === 'done' ? 'var(--green)' : s === 'now' ? 'var(--blue)' : s === 'cut' ? '#EDEBE4' : 'white',
                      border: s === 'todo' ? '1.5px solid #C9C6BD' : s === 'cut' ? '1px dashed #C9C6BD' : 'none',
                      outline: s === 'now' ? '2px solid #dbeafe' : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: '.55rem', borderTop: '1px dashed var(--gray-200)', paddingTop: '.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }} className="num">
          <span>כיסוי 1301</span>
          <span>
            <span style={{ color: 'var(--green)' }}>{meter.active}🟢</span>
            {' · '}<span style={{ color: 'var(--red)' }}>{meter.pruned}🔴</span>
            {' · '}<span style={{ color: '#b45309' }}>{meter.pending}🟡</span>
          </span>
        </div>
        <div style={{ height: 7, borderRadius: 99, background: '#E8E6DF', overflow: 'hidden', display: 'flex', margin: '.3rem 0' }}>
          <i style={{ width: pct(meter.active), background: 'var(--green)' }} />
          <i style={{ width: pct(meter.pruned), background: '#D8B4AC' }} />
          <i style={{ width: pct(meter.pending), background: '#E8D9A8' }} />
        </div>
        <div style={{ fontSize: '.66rem', color: 'var(--gray-500)' }}>
          🟡 = סעיפים שטרם הוכרעו. בסוף הראיון המונה חייב לרדת ל-0 (שער הכיסוי).
        </div>
      </div>

      {mapOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 200,
            overflowY: 'auto', padding: '2rem 0',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setMapOpen(false); }}
        >
          <div style={{ background: 'var(--gray-50)', maxWidth: 1320, margin: '0 auto', borderRadius: 14, padding: '1rem 0 2rem', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1.5rem' }}>
              <strong>🌳 מפת העץ המלאה — המסלול הנוכחי מודגש</strong>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMapOpen(false)}>✕ סגור</button>
            </div>
            <TreeMapView
              clients={client ? [client] : []}
              sessions={session ? [session] : []}
              initialOverlaySessionId={session?.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}

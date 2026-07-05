// ─── מפת עץ ההחלטות — תצוגת מוצר לרו"ח ─────────────────────────────────────
// נבנית אוטומטית מ-tree.ts + form1301Fields.ts ולכן תמיד מסונכרנת עם השאלון.
// כוללת: פריסת פרקים, לוח פרטים לכל שאלה (שדות 1301 / מסמכים / כרטיס),
// סימולציית גיזום לפי אריחי השער, ושכבת מסלול של סשן לקוח אמיתי.

import { useEffect, useMemo, useState } from 'react';
import type { AnnualReportSession, ChapterKey, QuestionNode, TaxpayerModel } from './types';
import { CHAPTER_LABELS, emptyModel } from './types';
import { annualReportTree, chaptersForModel, estimateTotalQuestions } from './tree';
import { form1301Fields, fieldByNumber } from './form1301Fields';
import { computeAllFieldStatuses } from './engine';
import { getAnswersForSession } from './repository';
import type { Client } from '../../types';

interface Props {
  clients: Client[];
  sessions: AnnualReportSession[];
}

const CHAPTER_ORDER: ChapterKey[] = [
  'identity_family', 'salary', 'business', 'rental', 'capital',
  'pension_ni', 'foreign', 'deductions', 'companies', 'special', 'finish',
];

const LAYER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  question:   { label: 'שאלה ללקוח', color: '#1d4ed8', bg: '#dbeafe' },
  document:   { label: 'נשלף ממסמך', color: '#7c3aed', bg: '#ede9fe' },
  accountant: { label: 'טיפול רו"ח', color: '#b45309', bg: '#fef3c7' },
  auto:       { label: 'אוטומטי', color: '#047857', bg: '#d1fae5' },
};

const GATE_TILES = [
  { value: 'salary', label: '💼 שכיר' },
  { value: 'business', label: '🧾 עצמאי' },
  { value: 'rental', label: '🏠 שכירות' },
  { value: 'capital', label: '📈 שוק ההון' },
  { value: 'pension_ni', label: '🌅 קצבאות' },
  { value: 'foreign', label: '✈️ חו"ל' },
  { value: 'companies', label: '🏢 חברות' },
  { value: 'other', label: '⭐ אחר' },
];

export default function TreeMapView({ clients, sessions }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('year_map');
  const [simTiles, setSimTiles] = useState<string[]>(GATE_TILES.map((t) => t.value));
  const [simMarried, setSimMarried] = useState(true);
  const [overlaySessionId, setOverlaySessionId] = useState<string>('');
  const [overlayAnswered, setOverlayAnswered] = useState<Set<string>>(new Set());

  // ─── מודל סימולציה מהאריחים המסומנים ─────────────────────────────────
  const simModel: TaxpayerModel = useMemo(() => {
    const gate = annualReportTree.nodes['year_map'];
    let m = emptyModel(2025);
    if (gate) m = gate.applyToModel(m, simTiles);
    m = {
      ...m,
      identity: { ...m.identity, maritalStatus: simMarried ? 'married' : 'single' },
      // מדליקים דגלים מייצגים כדי שגם צמתים מותנים יופיעו "חיים" בסימולציה המלאה
      income: {
        ...m.income,
        hasPensionIncome: simTiles.includes('pension_ni') || undefined,
        hasInterestIncome: simTiles.includes('capital') || undefined,
        hasOtherIncome: simTiles.includes('other') || undefined,
      },
    };
    return m;
  }, [simTiles, simMarried]);

  const liveChapters = useMemo(() => chaptersForModel(simModel), [simModel]);

  // ─── שאלות לפי פרק ─────────────────────────────────────────────────────
  const nodesByChapter = useMemo(() => {
    const map = new Map<ChapterKey, QuestionNode[]>();
    for (const ch of CHAPTER_ORDER) map.set(ch, []);
    for (const node of Object.values(annualReportTree.nodes)) {
      const ch = node.chapter ?? 'finish';
      map.get(ch)?.push(node);
    }
    return map;
  }, []);

  function nodeAlive(node: QuestionNode): boolean {
    const ch = node.chapter ?? 'finish';
    if (!liveChapters.includes(ch)) return false;
    if (node.visibleWhen && !node.visibleWhen(simModel)) return false;
    return true;
  }

  // ─── סטטוס שדות 1301 לסימולציה ────────────────────────────────────────
  const fieldStats = useMemo(() => {
    const aliveQuestionIds = new Set(
      Object.values(annualReportTree.nodes).filter((n) => nodeAlive(n)).map((n) => n.id),
    );
    const statuses = computeAllFieldStatuses(simModel, aliveQuestionIds);
    const active = statuses.filter((s) => s.status === 'active').length;
    const pruned = statuses.filter((s) => s.status === 'pruned').length;
    const pending = statuses.filter((s) => s.status === 'pending').length;
    return { active, pruned, pending, total: form1301Fields.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simModel]);

  // ─── שכבת מסלול לקוח ───────────────────────────────────────────────────
  useEffect(() => {
    if (!overlaySessionId) { setOverlayAnswered(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const answers = await getAnswersForSession(overlaySessionId);
        if (!cancelled) setOverlayAnswered(new Set(answers.map((a) => a.questionId)));
      } catch {
        if (!cancelled) setOverlayAnswered(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [overlaySessionId]);

  const selectedNode = annualReportTree.nodes[selectedNodeId] ?? null;

  const estQuestions = estimateTotalQuestions(simModel);

  function clientNameFor(s: AnnualReportSession): string {
    const c = clients.find((x) => x.id === s.clientId);
    return c ? `${c.firstName} ${c.lastName}`.trim() : 'לקוח';
  }

  return (
    <div style={{ maxWidth: 1300, margin: '1rem auto', padding: '0 1rem' }}>
      {/* ─── סרגל סימולציה ─── */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '.9rem', alignItems: 'center', padding: '.8rem 1.1rem' }}>
          <strong style={{ fontSize: '.9rem' }}>🧪 סימולציה:</strong>
          {GATE_TILES.map((t) => {
            const on = simTiles.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                className="btn btn-sm"
                onClick={() => setSimTiles((prev) => on ? prev.filter((v) => v !== t.value) : [...prev, t.value])}
                style={{
                  border: on ? '1.5px solid var(--blue)' : '1.5px solid var(--gray-200)',
                  background: on ? 'var(--blue-light, #dbeafe)' : 'white',
                  color: on ? 'var(--blue)' : 'var(--gray-500)',
                  fontWeight: 600,
                }}
              >
                {t.label}
              </button>
            );
          })}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem', fontWeight: 600 }}>
            <input type="checkbox" checked={simMarried} onChange={(e) => setSimMarried(e.target.checked)} />
            נשוי/אה
          </label>
          <div style={{ flex: 1 }} />
          <span className="num" style={{ fontSize: '.85rem', color: 'var(--gray-600)' }}>
            צפי: <b>{estQuestions}</b> שאלות · שדות 1301:
            <b style={{ color: 'var(--green)' }}> {fieldStats.active} פעילים</b> ·
            <span style={{ color: 'var(--red)' }}> {fieldStats.pruned} נגזמו</span> ·
            <span style={{ color: 'var(--orange, #d97706)' }}> {fieldStats.pending} ממתינים</span>
            {' '}מתוך {fieldStats.total}
          </span>
        </div>
      </div>

      {/* ─── שכבת לקוח ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '1rem', fontSize: '.85rem' }}>
        <span>🧭 הנחת מסלול לקוח על המפה:</span>
        <select
          className="input"
          style={{ maxWidth: 320, padding: '.35rem .6rem' }}
          value={overlaySessionId}
          onChange={(e) => setOverlaySessionId(e.target.value)}
        >
          <option value="">— ללא —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {clientNameFor(s)} · {s.taxYear} · {s.status === 'in_progress' ? 'בתהליך' : 'הושלם'}
            </option>
          ))}
        </select>
        {overlaySessionId && (
          <span style={{ color: 'var(--green)', fontWeight: 600 }} className="num">
            {overlayAnswered.size} שאלות נענו במסלול הזה
          </span>
        )}
      </div>

      <div className="ar-treemap-layout">
        {/* ─── המפה: פרקים כשורות, שאלות כצמתים ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
          {CHAPTER_ORDER.map((ch) => {
            const nodes = nodesByChapter.get(ch) ?? [];
            if (nodes.length === 0) return null;
            const chapterAlive = liveChapters.includes(ch);
            return (
              <div
                key={ch}
                style={{
                  display: 'flex', gap: '.6rem', alignItems: 'flex-start',
                  opacity: chapterAlive ? 1 : 0.45,
                  background: 'white', border: '1px solid var(--gray-200)', borderRadius: 10,
                  padding: '.6rem .8rem',
                }}
              >
                <div style={{ minWidth: 118, paddingTop: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '.85rem', color: chapterAlive ? 'var(--gray-800)' : 'var(--gray-400)' }}>
                    {CHAPTER_LABELS[ch]}
                  </div>
                  <div style={{ fontSize: '.7rem', color: 'var(--gray-400)' }} className="num">
                    {nodes.length} שאלות{!chapterAlive && ' · נגזם'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', flex: 1 }}>
                  {nodes.map((node) => {
                    const alive = nodeAlive(node);
                    const selected = node.id === selectedNodeId;
                    const visited = overlayAnswered.has(node.id);
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        title={node.question}
                        style={{
                          fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 600, cursor: 'pointer',
                          padding: '.3rem .55rem', borderRadius: 7, maxWidth: 190,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          border: selected ? '2px solid var(--blue)'
                            : visited ? '2px solid var(--green)'
                            : alive ? '1.5px solid var(--gray-300)' : '1.5px dashed var(--gray-200)',
                          background: selected ? 'var(--blue-light, #dbeafe)'
                            : visited ? '#e8f5ee'
                            : alive ? 'white' : 'var(--gray-50)',
                          color: alive ? 'var(--gray-700)' : 'var(--gray-400)',
                        }}
                      >
                        {visited && '✓ '}{shortLabel(node)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: '.74rem', color: 'var(--gray-500)', display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '.2rem .2rem' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid var(--gray-300)', borderRadius: 3, verticalAlign: -1 }} /> שאלה חיה בסימולציה</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px dashed var(--gray-300)', borderRadius: 3, background: 'var(--gray-50)', verticalAlign: -1 }} /> נגזמת (לא תישאל)</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--green)', borderRadius: 3, background: '#e8f5ee', verticalAlign: -1 }} /> נענתה במסלול הלקוח</span>
          </div>
        </div>

        {/* ─── לוח פרטי צומת ─── */}
        <div className="card" style={{ position: 'sticky', top: '1rem' }}>
          <div className="card-body" style={{ padding: '1rem 1.1rem' }}>
            {selectedNode ? <NodeInspector node={selectedNode} /> : <span className="muted">בחר שאלה במפה</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function shortLabel(node: QuestionNode): string {
  const q = node.question;
  return q.length > 34 ? q.slice(0, 32) + '…' : q;
}

// ─── לוח פרטים: מה השאלה מפעילה, דורשת ומעדכנת ────────────────────────────

function NodeInspector({ node }: { node: QuestionNode }) {
  const fields = (node.targetFieldCodes ?? []).map((c) => fieldByNumber[c]).filter(Boolean);
  const docs = new Map<string, string>();
  const crmPaths = new Set<string>();
  for (const f of fields) {
    for (const d of f.requiredDocuments) docs.set(d.code, d.name);
    crmPaths.add(f.modelPath);
  }
  const answers = node.type === 'boolean'
    ? ['כן', 'לא']
    : (node.options ?? []).map((o) => o.label);

  return (
    <div>
      <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.05em', color: 'var(--gray-400)' }}>
        {node.chapter ? CHAPTER_LABELS[node.chapter] : ''} · {node.id}
      </div>
      <div style={{ fontWeight: 800, fontSize: '.98rem', lineHeight: 1.45, margin: '.3rem 0 .6rem' }}>
        {node.question}
      </div>
      {node.helpText && (
        <div style={{ fontSize: '.8rem', color: 'var(--gray-500)', marginBottom: '.6rem' }}>{node.helpText}</div>
      )}

      {answers.length > 0 && (
        <>
          <InspectorTitle>תשובות אפשריות</InspectorTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: '.4rem' }}>
            {answers.slice(0, 8).map((a, i) => (
              <span key={i} style={{ fontSize: '.72rem', background: 'var(--gray-100)', borderRadius: 99, padding: '.1rem .55rem' }}>{a}</span>
            ))}
          </div>
        </>
      )}

      <InspectorTitle>שדות 1301 שהשאלה מזינה ({fields.length})</InspectorTitle>
      {fields.length === 0 && <div style={{ fontSize: '.8rem', color: 'var(--gray-400)' }}>שאלת ניתוב — לא מזינה שדה ישירות</div>}
      {fields.map((f) => {
        const layer = LAYER_LABELS[f.dataLayer ?? 'question'];
        const codes = f.codes ? [f.codes.registered, f.codes.spouse, f.codes.joint].filter(Boolean).join(' / ') : f.fieldNumber;
        return (
          <div key={f.fieldNumber} style={{ padding: '.4rem 0', borderBottom: '1px dashed var(--gray-100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span className="num" style={{ fontWeight: 800, fontSize: '.78rem', background: 'var(--gray-100)', borderRadius: 4, padding: '0 .4rem' }}>{codes}</span>
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: layer.color, background: layer.bg, borderRadius: 99, padding: '.05rem .5rem' }}>{layer.label}</span>
            </div>
            <div style={{ fontSize: '.8rem', marginTop: 2 }}>{f.hebrewLabel}</div>
            {f.officialRef && <div style={{ fontSize: '.68rem', color: 'var(--gray-400)' }}>{f.officialRef}</div>}
            {f.accountantAction && <div style={{ fontSize: '.7rem', color: '#b45309' }}>🔧 {f.accountantAction}</div>}
          </div>
        );
      })}

      {docs.size > 0 && (
        <>
          <InspectorTitle>מסמכים שנדרשים כשהענף נדלק</InspectorTitle>
          {Array.from(docs.values()).slice(0, 6).map((name, i) => (
            <div key={i} style={{ fontSize: '.78rem', padding: '.15rem 0' }}>📎 {name}</div>
          ))}
        </>
      )}

      {crmPaths.size > 0 && (
        <>
          <InspectorTitle>מתעדכן בפרופיל הלקוח</InspectorTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
            {Array.from(crmPaths).slice(0, 6).map((p) => (
              <span key={p} style={{ fontSize: '.7rem', direction: 'ltr', background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, borderRadius: 99, padding: '.08rem .55rem' }}>{p}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InspectorTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.06em', color: 'var(--gray-500)', margin: '.7rem 0 .25rem' }}>
      {children}
    </div>
  );
}

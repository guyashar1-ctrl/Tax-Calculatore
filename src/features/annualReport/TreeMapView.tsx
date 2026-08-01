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
  /** פתיחה עם מסלול לקוח מודגש (למשל מתוך overlay של הסרגל). */
  initialOverlaySessionId?: string;
}

const CHAPTER_ORDER: ChapterKey[] = [
  'identity_family', 'salary', 'business', 'rental', 'capital',
  'pension_ni', 'foreign', 'deductions', 'companies', 'special', 'finish',
];

const LAYER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  question:   { label: 'שאלה ללקוח', color: 'var(--chip-blue-tx)', bg: 'var(--chip-blue-bg)' },
  document:   { label: 'נשלף ממסמך', color: 'var(--info)', bg: 'var(--chip-violet-bg)' },
  accountant: { label: 'טיפול רו"ח', color: 'var(--warn)', bg: 'var(--chip-amber-bg)' },
  auto:       { label: 'אוטומטי', color: 'var(--ok)', bg: 'var(--chip-green-bg)' },
};

const GATE_TILES = [
  { value: 'salary', label: 'שכיר' },
  { value: 'business', label: 'עצמאי' },
  { value: 'rental', label: 'שכירות' },
  { value: 'capital', label: 'שוק ההון' },
  { value: 'pension_ni', label: 'קצבאות' },
  { value: 'foreign', label: 'חו"ל' },
  { value: 'companies', label: 'חברות' },
  { value: 'other', label: 'אחר' },
];

export default function TreeMapView({ clients, sessions, initialOverlaySessionId }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('year_map');
  const [simTiles, setSimTiles] = useState<string[]>(GATE_TILES.map((t) => t.value));
  const [simMarried, setSimMarried] = useState(true);
  const [overlaySessionId, setOverlaySessionId] = useState<string>(initialOverlaySessionId ?? '');
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
          <strong style={{ fontSize: '14px' }}>סימולציה:</strong>
          {GATE_TILES.map((t) => {
            const on = simTiles.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                className={`tm-tile ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                onClick={() => setSimTiles((prev) => on ? prev.filter((v) => v !== t.value) : [...prev, t.value])}
              >
                {t.label}
              </button>
            );
          })}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '14px', fontWeight: 600 }}>
            <input type="checkbox" checked={simMarried} onChange={(e) => setSimMarried(e.target.checked)} />
            נשוי/אה
          </label>
          <div style={{ flex: 1 }} />
          <span className="num" style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
            צפי: <b>{estQuestions}</b> שאלות · שדות 1301:
            <b style={{ color: 'var(--green)' }}> {fieldStats.active} פעילים</b> ·
            <span style={{ color: 'var(--red)' }}> {fieldStats.pruned} נגזמו</span> ·
            <span style={{ color: 'var(--orange, var(--warn))' }}> {fieldStats.pending} ממתינים</span>
            {' '}מתוך {fieldStats.total}
          </span>
        </div>
      </div>

      {/* ─── שכבת לקוח ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '1rem', fontSize: '14px' }}>
        <span>הנחת מסלול לקוח על המפה:</span>
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
              /* פרק = שורה עם קו, לא כרטיס. הצומת עצמו נשאר גלולה, כי
                 שם המצב (חיה / נגזמה / נענתה / נבחרה) הוא-הוא המידע. */
              <div key={ch} className={`tm-chapter ${chapterAlive ? '' : 'is-pruned'}`}>
                <div className="tm-chapter-label">
                  <div className="tm-chapter-name">{CHAPTER_LABELS[ch]}</div>
                  <div className="tm-chapter-count num">
                    {nodes.length} שאלות{!chapterAlive && ' · נגזם'}
                  </div>
                </div>
                <div className="tm-nodes">
                  {nodes.map((node) => {
                    const alive = nodeAlive(node);
                    const selected = node.id === selectedNodeId;
                    const visited = overlayAnswered.has(node.id);
                    const state = selected ? 'selected' : visited ? 'visited' : alive ? 'alive' : 'pruned';
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        title={node.question}
                        className={`tm-node is-${state}`}
                      >
                        {visited && '✓ '}{shortLabel(node)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', display: 'flex', gap: '1rem', flexWrap: 'wrap', padding: '.2rem .2rem' }}>
            <span><span className="tm-key is-alive" /> שאלה חיה בסימולציה</span>
            <span><span className="tm-key is-pruned" /> נגזמת (לא תישאל)</span>
            <span><span className="tm-key is-visited" /> נענתה במסלול הלקוח</span>
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
      <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--gray-400)' }}>
        {node.chapter ? CHAPTER_LABELS[node.chapter] : ''} · {node.id}
      </div>
      <div style={{ fontWeight: 600, fontSize: 'var(--fs-15)', lineHeight: 1.45, margin: '.3rem 0 .6rem' }}>
        {node.question}
      </div>
      {node.helpText && (
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '.6rem' }}>{node.helpText}</div>
      )}

      {answers.length > 0 && (
        <>
          <InspectorTitle>תשובות אפשריות</InspectorTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: '.4rem' }}>
            {answers.slice(0, 8).map((a, i) => (
              <span key={i} className="tm-pill">{a}</span>
            ))}
          </div>
        </>
      )}

      <InspectorTitle>שדות 1301 שהשאלה מזינה ({fields.length})</InspectorTitle>
      {fields.length === 0 && <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>שאלת ניתוב — לא מזינה שדה ישירות</div>}
      {fields.map((f) => {
        const layer = LAYER_LABELS[f.dataLayer ?? 'question'];
        const codes = f.codes ? [f.codes.registered, f.codes.spouse, f.codes.joint].filter(Boolean).join(' / ') : f.fieldNumber;
        return (
          <div key={f.fieldNumber} style={{ padding: '.4rem 0', borderBottom: '1px dashed var(--gray-100)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span className="num tm-code">{codes}</span>
              <span className="tm-layer" style={{ color: layer.color }}>{layer.label}</span>
            </div>
            <div style={{ fontSize: '13px', marginTop: 2 }}>{f.hebrewLabel}</div>
            {f.officialRef && <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{f.officialRef}</div>}
            {f.accountantAction && <div style={{ fontSize: '12px', color: 'var(--warn)' }}>{f.accountantAction}</div>}
          </div>
        );
      })}

      {docs.size > 0 && (
        <>
          <InspectorTitle>מסמכים שנדרשים כשהענף נדלק</InspectorTitle>
          {Array.from(docs.values()).slice(0, 6).map((name, i) => (
            <div key={i} style={{ fontSize: '13px', padding: '.15rem 0' }}>{name}</div>
          ))}
        </>
      )}

      {crmPaths.size > 0 && (
        <>
          <InspectorTitle>מתעדכן בפרופיל הלקוח</InspectorTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
            {Array.from(crmPaths).slice(0, 6).map((p) => (
              <span key={p} className="tm-pill" style={{ direction: 'ltr' }}>{p}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InspectorTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '.06em', color: 'var(--gray-500)', margin: '.7rem 0 .25rem' }}>
      {children}
    </div>
  );
}

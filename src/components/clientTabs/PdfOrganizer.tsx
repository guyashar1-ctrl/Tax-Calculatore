// ─── סביבת העבודה של עמודי PDF ─────────────────────────────────────────
// המסך שבו רואים את העמודים עצמם ומסדרים אותם לפני שנוצר קובץ. הוא נבנה
// כמשטח אחד לכל פעולות העמודים (מיזוג, סידור, סיבוב, הסרה) ולא כחלון
// חד-פעמי למיזוג — כדי שפעולות עתידיות ייכנסו לאותו מודל ולא לבנות משלהן.
//
// ‼ העמודים הם הגיבור: תמונות ממוזערות אמיתיות, גדולות, עם מספר סידורי
// שקט. כפתורי הסיבוב וההסרה מופיעים בריחוף בלבד — משטח שבו כל עמוד נושא
// שני כפתורים קבועים הופך רשת של 40 עמודים לרעש.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPdf, renderThumbnail, type PdfDocument } from '../../utils/pdfRender';
import {
  buildInitialPlan, movePage, rotatePage, removePage,
  type PlanPage, type PlanSource,
} from '../../utils/pdfPages';
import Icon from '../ui/Icon';

export interface OrganizerSource extends PlanSource {
  bytes: Uint8Array;
}

interface Props {
  sources: OrganizerSource[];
  /** שם ברירת המחדל לקובץ שייווצר. */
  initialName: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onCreate: (plan: PlanPage[], name: string) => void;
}

/** צבע עדין לכל מסמך מקור — כדי לדעת מאיפה הגיע עמוד בלי להעמיס טקסט. */
const SOURCE_TINTS = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#06b6d4'];

export default function PdfOrganizer({
  sources, initialName, busy, error, onCancel, onCreate,
}: Props) {
  const [plan, setPlan] = useState<PlanPage[]>(() => buildInitialPlan(sources));
  const [name, setName] = useState(initialName);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 760);

  useEffect(() => {
    function onResize() { setNarrow(window.innerWidth < 760); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Esc סוגר, כמו בכל שאר החלונות במערכת
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel]);

  // מונע גלילה של הדף מאחורי המשטח
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const sourceById = useMemo(() => {
    const m = new Map<string, { source: OrganizerSource; tint: string; index: number }>();
    sources.forEach((s, i) => m.set(s.docId, { source: s, tint: SOURCE_TINTS[i % SOURCE_TINTS.length], index: i }));
    return m;
  }, [sources]);

  const multiSource = sources.length > 1;

  // ─── גרירה ─────────────────────────────────────────────────────────────
  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const targetIndex = plan.findIndex(p => p.id === targetId);
    setPlan(cur => movePage(cur, dragId, targetIndex));
    setDragId(null);
    setOverId(null);
  }

  /** הזזה במקלדת ובמסך צר — גרירה אינה אמינה במגע. */
  function nudge(id: string, delta: -1 | 1) {
    const at = plan.findIndex(p => p.id === id);
    if (at < 0) return;
    setPlan(cur => movePage(cur, id, at + delta));
  }

  const canCreate = plan.length > 0 && name.trim().length > 0 && !busy;

  return (
    <div className="pdfw-scrim" role="dialog" aria-modal="true" aria-label="ארגון עמודי PDF">
      <div className="pdfw">
        <header className="pdfw-head">
          <div>
            <h2 className="pdfw-title">{multiSource ? 'מיזוג PDF' : 'ארגון עמודים'}</h2>
            <div className="pdfw-sub">
              {plan.length === 1 ? 'עמוד אחד' : `${plan.length} עמודים`}
              {multiSource && ` · מתוך ${sources.length} קבצים`}
            </div>
          </div>
          <button type="button" className="ui-icon-btn" onClick={onCancel} disabled={busy} aria-label="סגירה">
            <Icon name="close" />
          </button>
        </header>

        <div className="pdfw-pages">
          {plan.map((page, index) => {
            const meta = sourceById.get(page.sourceId);
            return (
              <PageCard
                key={page.id}
                page={page}
                index={index}
                total={plan.length}
                tint={multiSource ? meta?.tint : undefined}
                sourceLabel={multiSource ? meta?.source.label : undefined}
                bytes={meta?.source.bytes}
                narrow={narrow}
                dragging={dragId === page.id}
                dropTarget={overId === page.id && dragId !== null && dragId !== page.id}
                disabled={busy}
                onDragStart={() => setDragId(page.id)}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={() => setOverId(page.id)}
                onDrop={() => handleDrop(page.id)}
                onRotate={() => setPlan(cur => rotatePage(cur, page.id, 1))}
                onRemove={() => setPlan(cur => removePage(cur, page.id))}
                onNudge={d => nudge(page.id, d)}
              />
            );
          })}
          {plan.length === 0 && (
            <div className="pdfw-empty">הסרת את כל העמודים. החזר אחד לפחות כדי ליצור מסמך.</div>
          )}
        </div>

        <footer className="pdfw-foot">
          <label className="pdfw-name">
            <span>שם הקובץ</span>
            <input
              className="inp" value={name} disabled={busy}
              onChange={e => setName(e.target.value)}
              placeholder="לדוגמה: דוח שנתי 2025"
            />
          </label>
          {error && <div className="pdfw-error">{error}</div>}
          <div className="pdfw-cta">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>ביטול</button>
            <button
              type="button" className="btn btn-primary"
              disabled={!canCreate}
              onClick={() => onCreate(plan, name.trim())}
            >
              {busy ? 'יוצר…' : multiSource ? 'צור PDF מאוחד' : 'שמור PDF מאורגן'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── כרטיס עמוד ────────────────────────────────────────────────────────

interface CardProps {
  page: PlanPage;
  index: number;
  total: number;
  tint?: string;
  sourceLabel?: string;
  bytes?: Uint8Array;
  narrow: boolean;
  dragging: boolean;
  dropTarget: boolean;
  disabled: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onRotate: () => void;
  onRemove: () => void;
  onNudge: (d: -1 | 1) => void;
}

function PageCard(p: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  // ‼ רינדור עצל: מסמך בן 80 עמודים לא מרנדר 80 קנבסים בבת אחת. העמוד
  // מצויר רק כשהוא מתקרב לאזור הנראה, ורק פעם אחת.
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { root: null, rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || rendered || !p.bytes) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await getSharedDoc(p.page.sourceId, p.bytes!);
        if (cancelled || !canvasRef.current) return;
        await withRenderSlot(async () => {
          if (cancelled || !canvasRef.current) return;
          await renderThumbnail(doc, p.page.sourceIndex, canvasRef.current, THUMB_MAX_EDGE);
        });
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) setRendered(true);   // נכשל — נשאר הריבוע האפור
      }
    })();
    return () => { cancelled = true; };
  }, [visible, rendered, p.bytes, p.page.sourceId, p.page.sourceIndex]);

  const quarter = p.page.rotation % 180 !== 0;

  return (
    <div
      ref={ref}
      className={[
        'pdfw-card',
        p.dragging ? 'is-dragging' : '',
        p.dropTarget ? 'is-drop' : '',
      ].filter(Boolean).join(' ')}
      draggable={!p.disabled}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.page.id); p.onDragStart(); }}
      onDragEnd={p.onDragEnd}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; p.onDragOver(); }}
      onDrop={e => { e.preventDefault(); p.onDrop(); }}
      tabIndex={0}
      role="group"
      aria-label={`עמוד ${p.index + 1} מתוך ${p.total}`}
      onKeyDown={e => {
        // הזזה במקלדת: Ctrl/⌘ + חצים. בלי מקש עזר החצים גוללים כרגיל.
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); p.onNudge(-1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); p.onNudge(1); }
      }}
    >
      <div className="pdfw-thumb">
        <div className={`pdfw-thumb-inner${quarter ? ' is-quarter' : ''}`}>
          <canvas
            ref={canvasRef}
            className="pdfw-canvas"
            style={{ transform: `rotate(${p.page.rotation}deg)` }}
          />
        </div>
        {!rendered && <span className="pdfw-loading" aria-hidden="true" />}

        {/* פעולות העמוד — בריחוף ובמיקוד בלבד */}
        <div className="pdfw-tools">
          <button type="button" title="סובב רבע סיבוב" aria-label={`סובב עמוד ${p.index + 1}`}
            disabled={p.disabled} onClick={p.onRotate}>↻</button>
          <button type="button" title="הסר מהמסמך" aria-label={`הסר עמוד ${p.index + 1}`}
            className="pdfw-tool-remove" disabled={p.disabled} onClick={p.onRemove}>✕</button>
        </div>

        {/* במסך צר גרירה אינה אמינה — כאן מזיזים בכפתורים */}
        {p.narrow && (
          <div className="pdfw-move">
            <button type="button" aria-label="הזז אחורה" disabled={p.disabled || p.index === 0}
              onClick={() => p.onNudge(-1)}>›</button>
            <button type="button" aria-label="הזז קדימה" disabled={p.disabled || p.index === p.total - 1}
              onClick={() => p.onNudge(1)}>‹</button>
          </div>
        )}
      </div>

      <div className="pdfw-meta">
        <span className="pdfw-num">{p.index + 1}</span>
        {p.tint && (
          <span className="pdfw-source" title={p.sourceLabel}>
            <i style={{ background: p.tint }} />
            {p.sourceLabel}
          </span>
        )}
      </div>
    </div>
  );
}

const THUMB_MAX_EDGE = 320;

/**
 * ‼ תקרה למספר הרינדורים שרצים יחד. בלי זה, מסמך בן מאות עמודים פותח
 * מאות בקשות ציור בבת אחת: הזיכרון מתמלא בקנבסים והעמודים שהמשתמש באמת
 * רואה נדחקים לסוף התור. עם תקרה, מה שנמצא על המסך מצויר ראשון והשאר
 * ממתין בשקט.
 */
const MAX_CONCURRENT_RENDERS = 3;
let activeRenders = 0;
const renderWaiting: (() => void)[] = [];

async function withRenderSlot(job: () => Promise<void>): Promise<void> {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>(resolve => renderWaiting.push(resolve));
  }
  activeRenders++;
  try {
    await job();
  } finally {
    activeRenders--;
    renderWaiting.shift()?.();
  }
}

// ‼ מסמך pdfjs אחד לכל מקור, משותף לכל הכרטיסים שלו. בלי זה כל עמוד היה
// מפרסר מחדש את כל הקובץ — 30 עמודים = 30 פענוחים של אותם בייטים.
const docCache = new Map<string, Promise<PdfDocument>>();

function getSharedDoc(sourceId: string, bytes: Uint8Array): Promise<PdfDocument> {
  const hit = docCache.get(sourceId);
  if (hit) return hit;
  const promise = loadPdf(bytes).then(r => r.doc);
  docCache.set(sourceId, promise);
  return promise;
}

/** משוחרר בסגירת המשטח — אחרת מסמכים נשארים בזיכרון בין פתיחה לפתיחה. */
export function releaseOrganizerCache() {
  for (const p of docCache.values()) {
    p.then(doc => { try { doc.destroy(); } catch { /* כבר נסגר */ } }).catch(() => { /* לא נטען */ });
  }
  docCache.clear();
}

// ─── עריכת עמוד: טקסט, סימונים, ציור, תמונה וחתימה ─────────────────────
// העמוד מוצג גדול, וכל מה שמוסיפים עליו יושב בשכבה שקופה מעליו. הסימון
// נשמר באחוזים מהעמוד המוצג, ולכן הוא נוחת באותו מקום בדיוק גם בקובץ
// שנוצר — בלי קשר לזום או לגודל החלון.
//
// ‼ השכבה כולה ב-dir="ltr" למרות שהמערכת מימין לשמאל: "שמאל" של סימון
// חייב להיות שמאל הדף. בלי זה כל סימון היה נוחת במראה.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPdf, renderThumbnail, type PdfDocument } from '../../utils/pdfRender';
import type { Annotation, AnnotationKind } from '../../utils/pdfAnnotations';
import type { PlanPage } from '../../utils/pdfPages';

export type EditTool = AnnotationKind | 'select';

interface Props {
  page: PlanPage;
  /** מידות ומקור העמוד לרינדור. */
  bytes: Uint8Array;
  sourceRotation: number;
  annotations: Annotation[];
  tool: EditTool;
  color: string;
  /** תמונה שנבחרה להצבה (data URL) — רלוונטי לכלי 'image'. */
  pendingImage: string | null;
  onAdd: (a: Annotation) => void;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onRemove: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** גודל ברירת מחדל לסימון שמונח בלחיצה אחת, באחוזים מהעמוד. */
const TAP_SIZE = { w: 0.07, h: 0.05 };
const TEXT_SIZE = { w: 0.5, h: 0.08 };

export default function PdfPageEditor({
  page, bytes, sourceRotation, annotations, tool, color, pendingImage,
  onAdd, onUpdate, onRemove, selectedId, onSelect,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  type Draft = { x: number; y: number; w: number; h: number; pts?: { x: number; y: number }[] };
  const [draft, setDraftState] = useState<Draft | null>(null);
  // ‼ הטיוטה נשמרת גם ב-ref: גרירה מהירה שולחת down→move→up בלי רינדור
  // ביניהם, ואז ה-state שנקרא בסגירה עדיין ריק והצורה לא נוצרת כלל.
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (v: Draft | null | ((cur: Draft | null) => Draft | null)) => {
    const next = typeof v === 'function' ? v(draftRef.current) : v;
    draftRef.current = next;
    setDraftState(next);
  };
  const dragRef = useRef<{ mode: 'create' | 'move' | 'resize'; id?: string; startX: number; startY: number; orig?: Annotation } | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);

  const totalRotation = (((sourceRotation + page.rotation) % 360) + 360) % 360;

  // ─── רינדור העמוד ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const loaded = await loadPdf(bytes);
        if (cancelled) { loaded.doc.destroy(); return; }
        docRef.current?.destroy();
        docRef.current = loaded.doc;
        if (canvasRef.current) {
          await renderThumbnail(loaded.doc, page.sourceIndex, canvasRef.current, 1400);
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, page.sourceIndex]);

  const docRef = useRef<PdfDocument | null>(null);
  useEffect(() => () => { docRef.current?.destroy(); docRef.current = null; }, []);

  // ─── מיקום יחסי בתוך העמוד ───────────────────────────────────────────
  function rel(e: { clientX: number; clientY: number }) {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  /** סוגרת תיבת טקסט פתוחה, ומסירה אותה אם נשארה ריקה. */
  function finishText() {
    const id = editingText;
    setEditingText(null);
    if (!id) return;
    const ann = annotations.find(a => a.id === id);
    if (ann && !(ann.text ?? '').trim()) onRemove(id);
  }

  const isShape = (t: EditTool) =>
    t === 'highlight' || t === 'rectangle' || t === 'circle' || t === 'line' || t === 'draw';

  function onPointerDown(e: React.PointerEvent) {
    if (editingText) { finishText(); return; }
    if (tool === 'select') { onSelect(null); return; }
    const p = rel(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (tool === 'check' || tool === 'cross') {
      onAdd(mkAnnotation(tool, page.id, p.x - TAP_SIZE.w / 2, p.y - TAP_SIZE.h / 2, TAP_SIZE.w, TAP_SIZE.h, color));
      return;
    }
    if (tool === 'image') {
      if (!pendingImage) return;
      const w = 0.28, h = 0.2;
      onAdd({ ...mkAnnotation('image', page.id, p.x - w / 2, p.y - h / 2, w, h, color), imageData: pendingImage });
      return;
    }
    if (tool === 'text') {
      const a = mkAnnotation('text', page.id, p.x, p.y, TEXT_SIZE.w, TEXT_SIZE.h, color);
      a.text = '';
      a.fontPct = 0.028;
      onAdd(a);
      onSelect(a.id);
      setEditingText(a.id);
      return;
    }
    if (isShape(tool)) {
      dragRef.current = { mode: 'create', startX: p.x, startY: p.y };
      setDraft({ x: p.x, y: p.y, w: 0, h: 0, pts: tool === 'draw' ? [{ x: 0, y: 0 }] : undefined });
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const p = rel(e);
    if (d.mode === 'create') {
      if (tool === 'draw') {
        setDraft(cur => {
          if (!cur) return cur;
          const minX = Math.min(cur.x, p.x), minY = Math.min(cur.y, p.y);
          const maxX = Math.max(cur.x + cur.w, p.x), maxY = Math.max(cur.y + cur.h, p.y);
          return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, pts: [...(cur.pts ?? []), { x: p.x, y: p.y }] };
        });
      } else {
        setDraft({
          x: Math.min(d.startX, p.x), y: Math.min(d.startY, p.y),
          w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY),
        });
      }
      return;
    }
    if (d.mode === 'move' && d.id && d.orig) {
      onUpdate(d.id, {
        xPct: Math.min(1, Math.max(0, d.orig.xPct + (p.x - d.startX))),
        yPct: Math.min(1, Math.max(0, d.orig.yPct + (p.y - d.startY))),
      });
      return;
    }
    if (d.mode === 'resize' && d.id && d.orig) {
      onUpdate(d.id, {
        widthPct: Math.max(0.02, d.orig.widthPct + (p.x - d.startX)),
        heightPct: Math.max(0.02, d.orig.heightPct + (p.y - d.startY)),
      });
    }
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    const draft = draftRef.current;
    if (!d || d.mode !== 'create' || !draft) { setDraft(null); return; }
    const minSize = 0.012;
    if (tool === 'draw') {
      const pts = draft.pts ?? [];
      if (pts.length > 1 && draft.w > 0.002 && draft.h > 0.002) {
        const a = mkAnnotation('draw', page.id, draft.x, draft.y, Math.max(draft.w, 0.01), Math.max(draft.h, 0.01), color);
        // הנקודות נשמרות יחסית לתיבה, כך שהזזה או שינוי גודל נושאים אותן
        a.points = pts.map(pt => ({
          x: (pt.x - draft.x) / Math.max(draft.w, 0.01),
          y: (pt.y - draft.y) / Math.max(draft.h, 0.01),
        }));
        onAdd(a);
      }
    } else if (draft.w > minSize && draft.h > minSize) {
      onAdd(mkAnnotation(tool as AnnotationKind, page.id, draft.x, draft.y, draft.w, draft.h, color));
    }
    setDraft(null);
  }

  const pageAnns = useMemo(() => annotations.filter(a => a.pageId === page.id), [annotations, page.id]);
  const quarter = totalRotation === 90 || totalRotation === 270;

  return (
    <div className="pdfe-stage-wrap">
      <div
        ref={stageRef}
        dir="ltr"
        className={`pdfe-stage${tool !== 'select' ? ' is-drawing' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className={`pdfe-canvas${quarter ? ' is-quarter' : ''}`}
          style={{ transform: `rotate(${page.rotation}deg)` }} />
        {!ready && <span className="pdfe-loading" aria-hidden="true" />}

        {pageAnns.map(a => (
          <AnnotationBox
            key={a.id}
            ann={a}
            selected={selectedId === a.id}
            editing={editingText === a.id}
            onPick={() => { if (tool === 'select') onSelect(a.id); }}
            onStartMove={e => {
              if (tool !== 'select') return;
              const p = rel(e);
              dragRef.current = { mode: 'move', id: a.id, startX: p.x, startY: p.y, orig: a };
              onSelect(a.id);
            }}
            onStartResize={e => {
              const p = rel(e);
              dragRef.current = { mode: 'resize', id: a.id, startX: p.x, startY: p.y, orig: a };
            }}
            onText={v => onUpdate(a.id, { text: v })}
            onDoneText={finishText}
            onEditText={() => { if (tool === 'select') { onSelect(a.id); setEditingText(a.id); } }}
            onDelete={() => { onRemove(a.id); onSelect(null); }}
          />
        ))}

        {draft && (
          <div
            className={`pdfe-draft pdfe-draft-${tool}`}
            style={{
              left: `${draft.x * 100}%`, top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`, height: `${draft.h * 100}%`,
              borderColor: color, background: tool === 'highlight' ? color : undefined,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── תיבת סימון בשכבה ──────────────────────────────────────────────────

function AnnotationBox({
  ann, selected, editing, onPick, onStartMove, onStartResize, onText, onDoneText, onEditText, onDelete,
}: {
  ann: Annotation; selected: boolean; editing: boolean;
  onPick: () => void;
  onStartMove: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent) => void;
  onText: (v: string) => void;
  onDoneText: () => void;
  onEditText: () => void;
  onDelete: () => void;
}) {
  const style: React.CSSProperties = {
    left: `${ann.xPct * 100}%`, top: `${ann.yPct * 100}%`,
    width: `${ann.widthPct * 100}%`, height: `${ann.heightPct * 100}%`,
  };
  const stop = (e: React.PointerEvent) => { e.stopPropagation(); };

  return (
    <div
      className={`pdfe-ann pdfe-ann-${ann.kind}${selected ? ' is-selected' : ''}`}
      style={style}
      onPointerDown={e => { stop(e); onPick(); onStartMove(e); }}
      onDoubleClick={() => { if (ann.kind === 'text') onEditText(); }}
    >
      {ann.kind === 'highlight' && <span className="pdfe-fill" style={{ background: ann.color, opacity: .35 }} />}
      {ann.kind === 'rectangle' && <span className="pdfe-outline" style={{ borderColor: ann.color }} />}
      {ann.kind === 'circle' && <span className="pdfe-outline is-round" style={{ borderColor: ann.color }} />}
      {ann.kind === 'line' && (
        <svg className="pdfe-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="0" y1="0" x2="100" y2="100" stroke={ann.color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {ann.kind === 'draw' && ann.points && (
        <svg className="pdfe-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={ann.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
            fill="none" stroke={ann.color} strokeWidth="3" vectorEffect="non-scaling-stroke"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      )}
      {(ann.kind === 'check' || ann.kind === 'cross') && (
        <svg className="pdfe-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {ann.kind === 'check' ? (
            <polyline points="12,52 42,84 88,16" fill="none" stroke={ann.color} strokeWidth="4"
              vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <>
              <line x1="14" y1="14" x2="86" y2="86" stroke={ann.color} strokeWidth="4" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1="86" y1="14" x2="14" y2="86" stroke={ann.color} strokeWidth="4" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </>
          )}
        </svg>
      )}
      {ann.kind === 'image' && ann.imageData && (
        <img className="pdfe-img" src={ann.imageData} alt="" draggable={false} />
      )}
      {ann.kind === 'text' && (
        editing ? (
          <textarea
            className="pdfe-textarea"
            autoFocus
            dir="auto"
            value={ann.text ?? ''}
            style={{ color: ann.color }}
            onPointerDown={e => e.stopPropagation()}
            onChange={e => onText(e.target.value)}
            onBlur={onDoneText}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Escape') { (e.target as HTMLTextAreaElement).blur(); }
            }}
          />
        ) : (
          <span className="pdfe-text" dir="auto" style={{ color: ann.color }}>{ann.text}</span>
        )
      )}

      {selected && (
        <>
          <button
            type="button" className="pdfe-del" aria-label="מחק סימון"
            onPointerDown={e => { e.stopPropagation(); }}
            onClick={e => { e.stopPropagation(); onDelete(); }}
          >✕</button>
          <span
            className="pdfe-handle"
            onPointerDown={e => { e.stopPropagation(); onStartResize(e); }}
          />
        </>
      )}
    </div>
  );
}

// ─── יצירת סימון ───────────────────────────────────────────────────────

export function mkAnnotation(
  kind: AnnotationKind, pageId: string, x: number, y: number, w: number, h: number, color: string,
): Annotation {
  return {
    id: `an-${Math.random().toString(36).slice(2, 10)}`,
    pageId, kind,
    xPct: Math.min(1, Math.max(0, x)),
    yPct: Math.min(1, Math.max(0, y)),
    widthPct: Math.max(0.01, w),
    heightPct: Math.max(0.01, h),
    color,
    thicknessPct: 0.004,
  };
}

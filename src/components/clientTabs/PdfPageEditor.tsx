// ─── עריכת עמוד: טקסט, סימונים, ציור, תמונה וחתימה ─────────────────────
// העמוד מוצג גדול, וכל מה שמוסיפים עליו יושב בשכבה שקופה מעליו.
//
// ‼ עיקרון ה-WYSIWYG שכל הקובץ הזה בנוי סביבו: כל מידה על המסך נגזרת
// מגודל *הדף המוצג* — גודל טקסט מאחוז גובה הדף, עובי קו מאחוז רוחב הדף
// — בדיוק כמו בצריבה. קודם גודל הטקסט נגזר מרוחב החלון (vw) ועובי הקו
// היה קבוע, ולכן מה שנראה על המסך לא תאם את הקובץ שנוצר. עכשיו הם אותו
// מספר, מומר לפיקסלים דרך מדידת הדף בפועל (ResizeObserver).
//
// ‼ כשכלי ציור פעיל, שכבת הסימונים שקופה ללחיצות (pointer-events:none):
// משיכת עיפרון שנייה שעוברת מעל קו קיים מציירת — לא גוררת את הקו הקיים.
// זה היה "העיפרון לא עובד": הקו הראשון הצליח, וכל קו שנגע בו אחר כך הזיז
// אותו במקום לצייר.
//
// ‼ השכבה כולה ב-dir="ltr" למרות שהמערכת מימין לשמאל: "שמאל" של סימון
// חייב להיות שמאל הדף. בלי זה כל סימון היה נוחת במראה.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadPdf, renderThumbnail, type PdfDocument } from '../../utils/pdfRender';
import {
  DEFAULT_FONT_PCT, DEFAULT_THICKNESS_PCT, FONT_PCT_MAX, FONT_PCT_MIN, THICKNESS_STEPS,
  type Annotation, type AnnotationKind, type LatinFamily,
} from '../../utils/pdfAnnotations';
import type { PlanPage } from '../../utils/pdfPages';

export type EditTool = AnnotationKind | 'select';

interface Props {
  page: PlanPage;
  bytes: Uint8Array;
  sourceRotation: number;
  annotations: Annotation[];
  tool: EditTool;
  color: string;
  zoom: number;
  pendingImage: string | null;
  onAdd: (a: Annotation) => void;
  /** עדכון תוך-כדי-גרירה — לא נכנס להיסטוריה. */
  onLiveUpdate: (id: string, patch: Partial<Annotation>) => void;
  /** עדכון תכונה מהסרגל הצף — נכנס להיסטוריה. */
  onCommitPatch: (id: string, patch: Partial<Annotation>) => void;
  /** תיחום מחווה: ההיסטוריה מקבלת רשומה אחת לגרירה שלמה, לא לכל פיקסל. */
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onRemove: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const TAP_SIZE = { w: 0.07, h: 0.05 };
const TEXT_W = 0.42;

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Draft = { x: number; y: number; w: number; h: number; up?: boolean; pts?: { x: number; y: number }[] };
type Drag =
  | { mode: 'create'; startX: number; startY: number }
  | { mode: 'maybe-move'; id: string; startX: number; startY: number; orig: Annotation }
  | { mode: 'move'; id: string; startX: number; startY: number; orig: Annotation }
  | { mode: 'resize'; id: string; handle: Handle; startX: number; startY: number; orig: Annotation };

export default function PdfPageEditor({
  page, bytes, sourceRotation, annotations, tool, color, zoom, pendingImage,
  onAdd, onLiveUpdate, onCommitPatch, onGestureStart, onGestureEnd,
  onRemove, selectedId, onSelect,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PdfDocument | null>(null);
  const [ready, setReady] = useState(false);
  const [stagePx, setStagePx] = useState({ w: 1, h: 1 });
  const [draft, setDraftState] = useState<Draft | null>(null);
  // ‼ הטיוטה נשמרת גם ב-ref: גרירה מהירה שולחת down→move→up בלי רינדור
  // ביניהם, ואז ה-state שנקרא בסגירה עדיין ריק והצורה לא נוצרת כלל.
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (v: Draft | null) => { draftRef.current = v; setDraftState(v); };
  const dragRef = useRef<Drag | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);

  const totalRotation = (((sourceRotation + page.rotation) % 360) + 360) % 360;
  const quarter = totalRotation === 90 || totalRotation === 270;

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
          await renderThumbnail(loaded.doc, page.sourceIndex, canvasRef.current, 1600);
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, page.sourceIndex]);

  useEffect(() => () => { docRef.current?.destroy(); docRef.current = null; }, []);

  // ─── מדידת הדף המוצג — הבסיס לכל המרת אחוז→פיקסל ─────────────────────
  // ‼ המדידה סינכרונית (getBoundingClientRect ב-layout effect) ולא רק
  // ResizeObserver: RO נמסר בצינור הציור של הדפדפן, ובלשונית שאינה
  // מציירת פריימים הוא פשוט לא יורה — אותה מלכודת של pdfjs. המדידה
  // הישירה עובדת תמיד; RO נשאר כגיבוי למקרים שהמכל משתנה בלי אירוע.
  const measureStage = useCallback(() => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || r.width < 2) return;
    setStagePx(prev =>
      Math.abs(prev.w - r.width) > 0.5 || Math.abs(prev.h - r.height) > 0.5
        ? { w: r.width, h: r.height }
        : prev);
  }, []);

  useLayoutEffect(() => { measureStage(); }, [measureStage, ready, zoom, page.rotation]);

  useEffect(() => {
    window.addEventListener('resize', measureStage);
    const el = stageRef.current;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureStage) : null;
    if (el && ro) ro.observe(el);
    return () => { window.removeEventListener('resize', measureStage); ro?.disconnect(); };
  }, [measureStage]);

  // ─── מיקום יחסי בתוך הדף ─────────────────────────────────────────────
  function rel(e: { clientX: number; clientY: number }) {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  /** סוגרת תיבת טקסט פתוחה; ריקה — נמחקת. */
  function finishText() {
    const id = editingText;
    setEditingText(null);
    if (!id) return;
    const ann = annotations.find(a => a.id === id);
    if (ann && !(ann.text ?? '').trim()) onRemove(id);
  }

  const isShape = (t: EditTool) =>
    t === 'highlight' || t === 'rectangle' || t === 'circle' || t === 'line' || t === 'draw';

  /** תיבת טקסט קיימת שמכילה את הנקודה — כלי הטקסט עורך אותה במקום ליצור חדשה. */
  function textAnnAt(p: { x: number; y: number }): Annotation | null {
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const a = pageAnns[i];
      if (a.kind !== 'text') continue;
      if (p.x >= a.xPct && p.x <= a.xPct + a.widthPct && p.y >= a.yPct && p.y <= a.yPct + a.heightPct) return a;
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (editingText) { finishText(); return; }
    if (tool === 'select') { onSelect(null); return; }
    const p = rel(e);
    stageRef.current?.setPointerCapture?.(e.pointerId);

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
      // לחיצה על טקסט קיים עורכת אותו — לא יוצרת תיבה חופפת
      const existing = textAnnAt(p);
      if (existing) { onSelect(existing.id); setEditingText(existing.id); return; }
      const fontPct = DEFAULT_FONT_PCT;
      const a = mkAnnotation('text', page.id, Math.min(p.x, 1 - TEXT_W), p.y, TEXT_W, fontPct * 1.6, color);
      a.text = '';
      a.fontPct = fontPct;
      onAdd(a);
      onSelect(a.id);
      setEditingText(a.id);
      return;
    }
    if (isShape(tool)) {
      dragRef.current = { mode: 'create', startX: p.x, startY: p.y };
      setDraft({ x: p.x, y: p.y, w: 0, h: 0, pts: tool === 'draw' ? [{ x: p.x, y: p.y }] : undefined });
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const p = rel(e);

    if (d.mode === 'create') {
      const cur = draftRef.current;
      if (!cur) return;
      if (tool === 'draw') {
        const pts = cur.pts ?? [];
        const last = pts[pts.length - 1];
        // ‼ סינון נקודות צפופות מדי — בלי זה משיכה אחת צוברת אלפי נקודות
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.0025) return;
        const minX = Math.min(cur.x, p.x), minY = Math.min(cur.y, p.y);
        const maxX = Math.max(cur.x + cur.w, p.x), maxY = Math.max(cur.y + cur.h, p.y);
        setDraft({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, pts: [...pts, { x: p.x, y: p.y }] });
      } else {
        setDraft({
          x: Math.min(d.startX, p.x), y: Math.min(d.startY, p.y),
          w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY),
          up: p.y < d.startY !== p.x < d.startX ? undefined : undefined,
          ...(tool === 'line' ? { up: (p.x - d.startX) * (p.y - d.startY) < 0 } : {}),
        });
      }
      return;
    }

    // ‼ סף תזוזה: לחיצה לבחירה עם רעד של פיקסל אינה "הזזה" — בלי הסף,
    // כל בחירה הזיזה את הסימון טיפה והיסטוריה התמלאה זבל.
    if (d.mode === 'maybe-move') {
      if (Math.hypot(p.x - d.startX, p.y - d.startY) < 0.004) return;
      onGestureStart();
      dragRef.current = { ...d, mode: 'move' };
    }

    const dd = dragRef.current!;
    if (dd.mode === 'move') {
      onLiveUpdate(dd.id, {
        xPct: Math.min(1 - dd.orig.widthPct, Math.max(0, dd.orig.xPct + (p.x - dd.startX))),
        yPct: Math.min(1 - dd.orig.heightPct, Math.max(0, dd.orig.yPct + (p.y - dd.startY))),
      });
      return;
    }
    if (dd.mode === 'resize') {
      onLiveUpdate(dd.id, resizeRect(dd.orig, dd.handle, p.x - dd.startX, p.y - dd.startY));
    }
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;

    if (d.mode === 'move' || d.mode === 'resize') { onGestureEnd(); return; }
    if (d.mode === 'maybe-move') return;   // לחיצה בלבד — בחירה כבר קרתה

    const draft = draftRef.current;
    setDraft(null);
    if (!draft) return;
    const minSize = 0.008;
    if (tool === 'draw') {
      const pts = draft.pts ?? [];
      if (pts.length > 1) {
        const w = Math.max(draft.w, 0.005), h = Math.max(draft.h, 0.005);
        const a = mkAnnotation('draw', page.id, draft.x, draft.y, w, h, color);
        a.points = pts.map(pt => ({ x: (pt.x - draft.x) / w, y: (pt.y - draft.y) / h }));
        onAdd(a);
      }
    } else if (draft.w > minSize && draft.h > minSize) {
      const a = mkAnnotation(tool as AnnotationKind, page.id, draft.x, draft.y, draft.w, draft.h, color);
      if (tool === 'line' && draft.up) a.flipLine = true;
      onAdd(a);
    }
  }

  const pageAnns = useMemo(() => annotations.filter(a => a.pageId === page.id), [annotations, page.id]);
  const selected = selectedId ? pageAnns.find(a => a.id === selectedId) ?? null : null;
  const drawing = tool !== 'select';

  const fitHeight = `calc((100vh - 345px) * ${zoom})`;

  return (
    <div className={`pdfe-stage-wrap${zoom > 1 ? ' is-zoomed' : ''}`}>
      <div
        ref={stageRef}
        dir="ltr"
        data-tool={tool}
        className={`pdfe-stage${drawing ? ' is-drawing' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas
          ref={canvasRef}
          className={`pdfe-canvas${quarter ? ' is-quarter' : ''}`}
          style={{ transform: `rotate(${page.rotation}deg)`, maxHeight: fitHeight, maxWidth: `${100 * zoom}%` }}
        />
        {!ready && <span className="pdfe-loading" aria-hidden="true" />}

        {pageAnns.map(a => (
          <AnnotationBox
            key={a.id}
            ann={a}
            stagePx={stagePx}
            selected={selectedId === a.id}
            editing={editingText === a.id}
            selectTool={tool === 'select'}
            onPointerDownBox={e => {
              if (tool !== 'select') return;
              e.stopPropagation();
              onSelect(a.id);
              const p = rel(e);
              dragRef.current = { mode: 'maybe-move', id: a.id, startX: p.x, startY: p.y, orig: a };
            }}
            onStartResize={(e, handle) => {
              e.stopPropagation();
              const p = rel(e);
              onGestureStart();
              dragRef.current = { mode: 'resize', id: a.id, handle, startX: p.x, startY: p.y, orig: a };
              stageRef.current?.setPointerCapture?.((e as React.PointerEvent).pointerId);
            }}
            onText={v => onLiveUpdate(a.id, { text: v })}
            onAutoHeight={hPct => onLiveUpdate(a.id, { heightPct: hPct })}
            onDoneText={finishText}
            onEditText={() => { if (tool === 'select') { onSelect(a.id); setEditingText(a.id); } }}
            onDelete={() => { onRemove(a.id); onSelect(null); }}
          />
        ))}

        {draft && tool !== 'draw' && (
          <div
            className={`pdfe-draft pdfe-draft-${tool}`}
            style={{
              left: `${draft.x * 100}%`, top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`, height: `${draft.h * 100}%`,
              borderColor: color, background: tool === 'highlight' ? color : undefined,
            }}
          />
        )}
        {draft && tool === 'draw' && draft.pts && draft.pts.length > 1 && (
          <svg className="pdfe-livedraw" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={draft.pts.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
              fill="none" stroke={color}
              strokeWidth={(DEFAULT_THICKNESS_PCT * stagePx.w)}
              vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* סרגל צף לסימון הנבחר — רק התכונות של הסוג הזה */}
      {selected && tool === 'select' && !editingText && (
        <ContextBar
          ann={selected}
          stagePx={stagePx}
          onPatch={patch => onCommitPatch(selected.id, patch)}
          onDelete={() => { onRemove(selected.id); onSelect(null); }}
        />
      )}
    </div>
  );
}

// ─── שינוי גודל: 8 ידיות, מעוגן לצד הנגדי ──────────────────────────────

function resizeRect(orig: Annotation, handle: Handle, dx: number, dy: number): Partial<Annotation> {
  let x = orig.xPct, y = orig.yPct, w = orig.widthPct, h = orig.heightPct;
  const min = 0.015;

  if (handle.includes('e')) w = orig.widthPct + dx;
  if (handle.includes('w')) { x = orig.xPct + dx; w = orig.widthPct - dx; }
  if (handle.includes('s')) h = orig.heightPct + dy;
  if (handle.includes('n')) { y = orig.yPct + dy; h = orig.heightPct - dy; }

  // ‼ תמונה נשמרת ביחס גובה-רוחב כשמושכים פינה — כמו שכל כלי גרפי מתנהג
  if (orig.kind === 'image' && handle.length === 2) {
    const s = Math.max(w / orig.widthPct, h / orig.heightPct);
    const nw = orig.widthPct * s, nh = orig.heightPct * s;
    if (handle.includes('w')) x = orig.xPct + orig.widthPct - nw;
    if (handle.includes('n')) y = orig.yPct + orig.heightPct - nh;
    w = nw; h = nh;
  }

  if (w < min) { if (handle.includes('w')) x -= min - w; w = min; }
  if (h < min) { if (handle.includes('n')) y -= min - h; h = min; }
  return { xPct: Math.max(0, x), yPct: Math.max(0, y), widthPct: w, heightPct: h };
}

// ─── תיבת סימון בשכבה ──────────────────────────────────────────────────

const OVERLAY_FAMILY: Record<LatinFamily, string> = {
  // ‼ אותם קובצי גופן של ה-PDF נטענים כ-webfont, ולכן הגלישה על המסך
  // נשברת באותם מקומות כמו בקובץ. serif/mono ממופים לגופני מערכת תואמי-
  // מטריקה ל-Times/Courier של התקן.
  sans: "'NotoSansPDF','NotoSansHebrewPDF',sans-serif",
  serif: "'Times New Roman','NotoSansHebrewPDF',serif",
  mono: "'Courier New','NotoSansHebrewPDF',monospace",
};

function AnnotationBox({
  ann, stagePx, selected, editing, selectTool,
  onPointerDownBox, onStartResize, onText, onAutoHeight, onDoneText, onEditText, onDelete,
}: {
  ann: Annotation;
  stagePx: { w: number; h: number };
  selected: boolean;
  editing: boolean;
  selectTool: boolean;
  onPointerDownBox: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent, h: Handle) => void;
  onText: (v: string) => void;
  onAutoHeight: (hPct: number) => void;
  onDoneText: () => void;
  onEditText: () => void;
  onDelete: () => void;
}) {
  const style: React.CSSProperties = {
    left: `${ann.xPct * 100}%`, top: `${ann.yPct * 100}%`,
    width: `${ann.widthPct * 100}%`, height: `${ann.heightPct * 100}%`,
  };
  // WYSIWYG: פיקסלים = אחוז × גודל הדף המוצג — אותם מספרים כמו בצריבה
  const fontPx = (ann.fontPct ?? DEFAULT_FONT_PCT) * stagePx.h;
  const strokePx = Math.max(1, (ann.thicknessPct ?? DEFAULT_THICKNESS_PCT) * stagePx.w);
  const markPx = Math.max(1.2, Math.min(ann.widthPct * stagePx.w, ann.heightPct * stagePx.h) * 0.14);

  const textStyle: React.CSSProperties = {
    color: ann.color,
    fontSize: fontPx,
    lineHeight: 1.32,
    fontFamily: OVERLAY_FAMILY[ann.fontFamily ?? 'sans'],
    fontWeight: ann.bold ? 700 : 400,
  };

  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) {
      const ta = taRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }, [editing]);

  /** גובה התיבה עוקב אחרי התוכן — הצריבה מציירת מראש התיבה ולמטה. */
  const syncHeight = () => {
    const ta = taRef.current;
    if (!ta || stagePx.h <= 1) return;
    const hPct = Math.max((ta.scrollHeight + 2) / stagePx.h, fontPx * 1.5 / stagePx.h);
    if (Math.abs(hPct - ann.heightPct) > 0.004) onAutoHeight(hPct);
  };
  useLayoutEffect(() => { if (editing) syncHeight(); });   // אחרי כל עדכון טקסט/גופן

  return (
    <div
      className={`pdfe-ann pdfe-ann-${ann.kind}${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
      style={style}
      onPointerDown={onPointerDownBox}
      onDoubleClick={() => { if (ann.kind === 'text') onEditText(); }}
    >
      {ann.kind === 'highlight' && <span className="pdfe-fill" style={{ background: ann.color, opacity: .35 }} />}
      {ann.kind === 'rectangle' && (
        <span className="pdfe-outline" style={{
          borderColor: ann.color, borderWidth: strokePx,
          background: ann.fillColor ? ann.fillColor : undefined, opacity: ann.fillColor ? .5 : undefined,
        }} />
      )}
      {ann.kind === 'circle' && (
        <span className="pdfe-outline is-round" style={{
          borderColor: ann.color, borderWidth: strokePx,
          background: ann.fillColor ? ann.fillColor : undefined, opacity: ann.fillColor ? .5 : undefined,
        }} />
      )}
      {ann.kind === 'line' && (
        <svg className="pdfe-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line
            x1="0" y1={ann.flipLine ? 100 : 0} x2="100" y2={ann.flipLine ? 0 : 100}
            stroke={ann.color} strokeWidth={strokePx} vectorEffect="non-scaling-stroke" strokeLinecap="round"
          />
        </svg>
      )}
      {ann.kind === 'draw' && ann.points && (
        <svg className="pdfe-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={ann.points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
            fill="none" stroke={ann.color} strokeWidth={strokePx} vectorEffect="non-scaling-stroke"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      )}
      {(ann.kind === 'check' || ann.kind === 'cross') && (
        <svg className="pdfe-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {ann.kind === 'check' ? (
            <polyline points="12,52 42,84 88,16" fill="none" stroke={ann.color} strokeWidth={markPx}
              vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <>
              <line x1="14" y1="14" x2="86" y2="86" stroke={ann.color} strokeWidth={markPx} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1="86" y1="14" x2="14" y2="86" stroke={ann.color} strokeWidth={markPx} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
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
            ref={taRef}
            className="pdfe-textarea"
            dir="auto"
            value={ann.text ?? ''}
            style={textStyle}
            placeholder="הקלד…"
            onPointerDown={e => e.stopPropagation()}
            onChange={e => onText(e.target.value)}
            onBlur={() => { syncHeight(); onDoneText(); }}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
            }}
          />
        ) : (
          <span className="pdfe-text" dir="auto" style={textStyle}>{ann.text}</span>
        )
      )}

      {selected && selectTool && !editing && (
        <>
          <button
            type="button" className="pdfe-del" aria-label="מחק סימון"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete(); }}
          >✕</button>
          {HANDLES.map(h => (
            <span
              key={h}
              className={`pdfe-h pdfe-h-${h}`}
              onPointerDown={e => onStartResize(e, h)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── סרגל צף לסימון הנבחר ──────────────────────────────────────────────
// ‼ progressive disclosure: מוצג רק כשסימון נבחר, ורק התכונות של הסוג
// הזה. טקסט מקבל גודל/מודגש/גופן; קווים וצורות מקבלים עובי; מלבן ועיגול
// גם מילוי. תמונה — כלום (יש לה ידיות ומחיקה, אין לה תכונות).

const FAMILY_ORDER: LatinFamily[] = ['sans', 'serif', 'mono'];
const FAMILY_LABEL: Record<LatinFamily, string> = { sans: 'Aa', serif: 'Tt', mono: 'Mm' };

function ContextBar({ ann, stagePx, onPatch, onDelete }: {
  ann: Annotation;
  stagePx: { w: number; h: number };
  onPatch: (p: Partial<Annotation>) => void;
  onDelete: () => void;
}) {
  const isText = ann.kind === 'text';
  const hasStroke = ['draw', 'line', 'rectangle', 'circle'].includes(ann.kind);
  const hasFill = ann.kind === 'rectangle' || ann.kind === 'circle';
  if (!isText && !hasStroke && !hasFill) return null;

  const fontPct = ann.fontPct ?? DEFAULT_FONT_PCT;
  const thickness = ann.thicknessPct ?? DEFAULT_THICKNESS_PCT;
  const thickIdx = THICKNESS_STEPS.findIndex(t => Math.abs(t - thickness) < 0.0005);
  const family = ann.fontFamily ?? 'sans';

  // מעל הסימון; כשהוא צמוד לראש הדף — מתחתיו
  const below = ann.yPct * stagePx.h < 44;
  const style: React.CSSProperties = {
    left: `${Math.min(78, Math.max(2, ann.xPct * 100))}%`,
    top: below ? `calc(${(ann.yPct + ann.heightPct) * 100}% + 8px)` : `calc(${ann.yPct * 100}% - 40px)`,
  };

  return (
    <div className="pdfe-ctx" dir="rtl" style={style} onPointerDown={e => e.stopPropagation()}>
      {isText && (
        <>
          <button type="button" title="הקטן טקסט" aria-label="הקטן טקסט"
            onClick={() => onPatch({ fontPct: Math.max(FONT_PCT_MIN, fontPct / 1.2) })}>א−</button>
          <button type="button" title="הגדל טקסט" aria-label="הגדל טקסט"
            onClick={() => onPatch({ fontPct: Math.min(FONT_PCT_MAX, fontPct * 1.2) })}>א+</button>
          <button type="button" title="מודגש" aria-label="מודגש" aria-pressed={!!ann.bold}
            className={ann.bold ? 'is-on' : ''}
            onClick={() => onPatch({ bold: !ann.bold })}><b>B</b></button>
          <button type="button" title="גופן לטיני" aria-label="גופן לטיני"
            onClick={() => onPatch({ fontFamily: FAMILY_ORDER[(FAMILY_ORDER.indexOf(family) + 1) % FAMILY_ORDER.length] })}
          >{FAMILY_LABEL[family]}</button>
        </>
      )}
      {hasStroke && (
        <button type="button" title="עובי קו" aria-label="עובי קו"
          onClick={() => onPatch({ thicknessPct: THICKNESS_STEPS[(thickIdx + 1) % THICKNESS_STEPS.length] })}>
          <span className="pdfe-ctx-stroke" style={{ height: 1 + ((thickIdx + 1) % THICKNESS_STEPS.length) * 2 }} />
        </button>
      )}
      {hasFill && (
        <button type="button" title="מילוי" aria-label="מילוי" aria-pressed={!!ann.fillColor}
          className={ann.fillColor ? 'is-on' : ''}
          onClick={() => onPatch({ fillColor: ann.fillColor ? null : ann.color })}>▨</button>
      )}
      <span className="pdfe-ctx-sep" />
      <button type="button" title="מחק" aria-label="מחק" className="pdfe-ctx-del" onClick={onDelete}>✕</button>
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
    thicknessPct: DEFAULT_THICKNESS_PCT,
  };
}

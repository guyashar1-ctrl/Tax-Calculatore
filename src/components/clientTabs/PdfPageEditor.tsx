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
  DEFAULT_FONT_PCT, DEFAULT_THICKNESS_PCT,
  fillColorOf, fillOpacityOf, lineEnds, presetFor, strokeOpacityOf, strokeVisible, withLineEnds,
  type Annotation, type AnnotationKind, type LatinFamily, type LineEnds,
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
  /** תיחום מחווה: ההיסטוריה מקבלת רשומה אחת לגרירה שלמה, לא לכל פיקסל. */
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onRemove: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Enter על טקסט נבחר — ההורה מבקש לפתוח אותו לעריכה. */
  editRequest: { id: string; n: number } | null;
  /** טקסט נסגר; kept=false אם היה ריק ונמחק. ההורה עובר לכלי הבחירה. */
  onTextDone: (id: string, kept: boolean) => void;
}

const TAP_SIZE = { w: 0.07, h: 0.05 };
const TEXT_W = 0.42;

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Draft = {
  x: number; y: number; w: number; h: number;
  pts?: { x: number; y: number }[];
  /** קו בטיוטה — הנקודות עצמן, ולא רק התיבה שסביבן. */
  ends?: LineEnds;
};
type Drag =
  | { mode: 'create'; startX: number; startY: number }
  | { mode: 'maybe-move'; id: string; startX: number; startY: number; orig: Annotation }
  | { mode: 'move'; id: string; startX: number; startY: number; orig: Annotation }
  | { mode: 'resize'; id: string; handle: Handle; startX: number; startY: number; orig: Annotation }
  | { mode: 'endpoint'; id: string; end: 1 | 2; orig: Annotation };

export default function PdfPageEditor({
  page, bytes, sourceRotation, annotations, tool, color, zoom, pendingImage,
  onAdd, onLiveUpdate, onGestureStart, onGestureEnd,
  onRemove, selectedId, onSelect, editRequest, onTextDone,
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
          // ‼ מרוץ מול שעון: רינדור של pdfjs עלול לא להסתיים כלל בלשונית
          // שאינה מציירת פריימים. בלי המרוץ, ready נשאר false לנצח והמסך
          // ממשיך להציג שכבת טעינה מעל עמוד שכבר צויר.
          await Promise.race([
            renderThumbnail(loaded.doc, page.sourceIndex, canvasRef.current, 1600),
            new Promise(res => setTimeout(res, 2500)),
          ]);
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

  /**
   * ‼ לכידת המצביע אל הדף בכל מחווה. בלי זה, ברגע שהעכבר חוצה את שולי
   * הדף באמצע גרירה — האירועים מפסיקים להגיע והאובייקט 'נתקע'. זה היה
   * חלק גדול מ'ההזזה לא עובדת' בעכבר אמיתי; באירועים סינתטיים זה לא
   * נראה, כי הם נשלחים ישירות לדף.
   */
  function capturePointer(e: React.PointerEvent) {
    try { stageRef.current?.setPointerCapture(e.pointerId); } catch { /* מגע שהשתחרר */ }
  }

  // ─── מיקום יחסי בתוך הדף ─────────────────────────────────────────────
  function rel(e: { clientX: number; clientY: number }) {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  useEffect(() => {
    if (!editRequest) return;
    const ann = annotations.find(a => a.id === editRequest.id);
    if (ann?.kind === 'text') { onSelect(ann.id); setEditingText(ann.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);

  /** סוגרת תיבת טקסט פתוחה; ריקה — נמחקת. ההורה מקבל דיווח. */
  function finishText() {
    const id = editingText;
    setEditingText(null);
    if (!id) return;
    const ann = annotations.find(a => a.id === id);
    const kept = !!ann && !!(ann.text ?? '').trim();
    if (ann && !kept) onRemove(id);
    onTextDone(id, kept);
  }

  const isShape = (t: EditTool) =>
    t === 'highlight' || t === 'whiteout' || t === 'rectangle'
    || t === 'circle' || t === 'line' || t === 'draw';

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
    // ‼ בלי זה, גרירה אמיתית מעל טקסט מתחילה סימון-טקסט של הדפדפן
    // שחוטף את המחווה (לעיתים עד pointercancel). לא נראה באירועים
    // סינתטיים — ולכן שרד את סבב ה-QA הקודם.
    e.preventDefault();
    if (editingText) { finishText(); return; }
    if (tool === 'select') { onSelect(null); return; }
    const p = rel(e);
    capturePointer(e);

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
      setDraft({
        x: p.x, y: p.y, w: 0, h: 0,
        pts: tool === 'draw' ? [{ x: p.x, y: p.y }] : undefined,
        ends: tool === 'line' ? { x1: p.x, y1: p.y, x2: p.x, y2: p.y } : undefined,
      });
    }
  }

  /** גרירת נקודת קצה של קו — הקצה השני לא זז. */
  function onStartEndpoint(e: React.PointerEvent, ann: Annotation, end: 1 | 2) {
    e.stopPropagation();
    e.preventDefault();
    capturePointer(e);
    onSelect(ann.id);
    onGestureStart();
    dragRef.current = { mode: 'endpoint', id: ann.id, end, orig: ann };
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
      } else if (tool === 'line') {
        // ‼ הקו נשמר כשתי נקודות ולא כתיבה: כך נשמר איזה קצה התחיל היכן,
        // וקו אופקי או אנכי גמור הוא מצב תקין ולא תיבה בגובה אפס.
        setDraft({
          ...draftLineBox(d.startX, d.startY, p.x, p.y),
          ends: { x1: d.startX, y1: d.startY, x2: p.x, y2: p.y },
        });
      } else {
        setDraft({
          x: Math.min(d.startX, p.x), y: Math.min(d.startY, p.y),
          w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY),
        });
      }
      return;
    }

    if (d.mode === 'endpoint') {
      const cur = lineEnds(d.orig);
      const next: LineEnds = d.end === 1
        ? { ...cur, x1: p.x, y1: p.y }
        : { ...cur, x2: p.x, y2: p.y };
      onLiveUpdate(d.id, withLineEnds(next));
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
      const maxX = Math.max(0, 1 - dd.orig.widthPct);
      const maxY = Math.max(0, 1 - dd.orig.heightPct);
      const nx = Math.min(maxX, Math.max(0, dd.orig.xPct + (p.x - dd.startX)));
      const ny = Math.min(maxY, Math.max(0, dd.orig.yPct + (p.y - dd.startY)));
      if (dd.orig.kind === 'line') {
        // ‼ הזזת קו מזיזה את שתי הנקודות באותה מידה — הזווית והאורך נשמרים.
        const e = lineEnds(dd.orig);
        const dx = nx - dd.orig.xPct, dy = ny - dd.orig.yPct;
        onLiveUpdate(dd.id, withLineEnds({
          x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy,
        }));
        return;
      }
      onLiveUpdate(dd.id, { xPct: nx, yPct: ny });
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

    if (d.mode === 'move' || d.mode === 'resize' || d.mode === 'endpoint') { onGestureEnd(); return; }
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
    } else if (tool === 'line') {
      // קו נמדד באורכו ולא בתיבתו — אחרת קו אופקי מושלם היה נדחה
      const e = draft.ends;
      if (e && Math.hypot(e.x2 - e.x1, e.y2 - e.y1) > minSize) {
        const a = mkAnnotation('line', page.id, draft.x, draft.y, draft.w, draft.h, color);
        onAdd({ ...a, ...withLineEnds(e) });
      }
    } else if (draft.w > minSize && draft.h > minSize) {
      onAdd(mkAnnotation(tool as AnnotationKind, page.id, draft.x, draft.y, draft.w, draft.h, color));
    }
  }

  const pageAnns = useMemo(() => annotations.filter(a => a.pageId === page.id), [annotations, page.id]);
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
        onDragStart={e => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className={`pdfe-canvas${quarter ? ' is-quarter' : ''}`}
          style={{ transform: `rotate(${page.rotation}deg)`, maxHeight: fitHeight, maxWidth: `${100 * zoom}%` }}
        />
        {!ready && <span className="pdfe-loading" aria-hidden="true" />}

        {pageAnns.map(a => {
          const onDownBox = (e: React.PointerEvent) => {
            if (tool !== 'select') return;
            e.stopPropagation();
            e.preventDefault();
            capturePointer(e);
            onSelect(a.id);
            const p = rel(e);
            dragRef.current = { mode: 'maybe-move', id: a.id, startX: p.x, startY: p.y, orig: a };
          };
          // ‼ קו אינו תיבה: הוא נשלט בשתי נקודות קצה, ולכן הוא לא מקבל
          // את 8 הידיות אלא רכיב משלו. תיבה חוסמת של קו אלכסוני מכסה שטח
          // גדול שאינו הקו, ולחיצה בתוכה נתפסה כאילו נגעו בו.
          if (a.kind === 'line') {
            return (
              <LineObject
                key={a.id}
                ann={a}
                stagePx={stagePx}
                selected={selectedId === a.id}
                selectTool={tool === 'select'}
                onPointerDownLine={onDownBox}
                onStartEndpoint={(e, end) => onStartEndpoint(e, a, end)}
              />
            );
          }
          return (
            <AnnotationBox
              key={a.id}
              ann={a}
              stagePx={stagePx}
              selected={selectedId === a.id}
              editing={editingText === a.id}
              selectTool={tool === 'select'}
              onPointerDownBox={onDownBox}
              onStartResize={(e, handle) => {
                e.stopPropagation();
                e.preventDefault();
                const p = rel(e);
                onGestureStart();
                dragRef.current = { mode: 'resize', id: a.id, handle, startX: p.x, startY: p.y, orig: a };
                capturePointer(e);
              }}
              onText={v => onLiveUpdate(a.id, { text: v })}
              onAutoHeight={hPct => onLiveUpdate(a.id, { heightPct: hPct })}
              onDoneText={finishText}
              onEditText={() => { if (tool === 'select') { onSelect(a.id); setEditingText(a.id); } }}
              onDelete={() => { onRemove(a.id); onSelect(null); }}
            />
          );
        })}

        {draft && tool === 'line' && draft.ends && (
          <svg className="pdfe-livedraw" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              x1={draft.ends.x1 * 100} y1={draft.ends.y1 * 100}
              x2={draft.ends.x2 * 100} y2={draft.ends.y2 * 100}
              stroke={color} strokeWidth={Math.max(1, DEFAULT_THICKNESS_PCT * stagePx.w)}
              vectorEffect="non-scaling-stroke" strokeLinecap="round"
            />
          </svg>
        )}
        {draft && tool !== 'draw' && tool !== 'line' && (
          <div
            className={`pdfe-draft pdfe-draft-${tool}`}
            style={{
              left: `${draft.x * 100}%`, top: `${draft.y * 100}%`,
              width: `${draft.w * 100}%`, height: `${draft.h * 100}%`,
              borderColor: color,
              background: tool === 'highlight' ? color : tool === 'whiteout' ? '#fff' : undefined,
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

    </div>
  );
}

/** התיבה החוסמת של קו בטיוטה — לתצוגה בלבד; הנקודות הן הסמכות. */
function draftLineBox(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2), y: Math.min(y1, y2),
    w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
  };
}

// ─── קו: גוף אחד ושתי נקודות קצה ───────────────────────────────────────
// ‼ ה-SVG פרוש על כל הדף ואינו קולט לחיצות; רק שני הקווים שבתוכו כן —
// הקו הנראה, ומעליו קו שקוף ועבה שהוא אזור התפיסה. כך אפשר לתפוס גם קו
// דק בלי לכוון לפיקסל, ובלי שהתיבה החוסמת תחטוף לחיצות שאינן עליו.

const LINE_HIT_PX = 14;

function LineObject({ ann, stagePx, selected, selectTool, onPointerDownLine, onStartEndpoint }: {
  ann: Annotation;
  stagePx: { w: number; h: number };
  selected: boolean;
  selectTool: boolean;
  onPointerDownLine: (e: React.PointerEvent) => void;
  onStartEndpoint: (e: React.PointerEvent, end: 1 | 2) => void;
}) {
  const e = lineEnds(ann);
  const strokePx = Math.max(1, (ann.thicknessPct ?? DEFAULT_THICKNESS_PCT) * stagePx.w);
  const pt = (x: number, y: number) => ({ left: `${x * 100}%`, top: `${y * 100}%` });

  return (
    <div className={`pdfe-line-obj${selected ? ' is-selected' : ''}`}>
      <svg className="pdfe-linesvg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          x1={e.x1 * 100} y1={e.y1 * 100} x2={e.x2 * 100} y2={e.y2 * 100}
          stroke={ann.color} strokeWidth={strokePx} strokeOpacity={strokeOpacityOf(ann)}
          vectorEffect="non-scaling-stroke" strokeLinecap="round"
        />
        <line
          className="pdfe-linehit"
          x1={e.x1 * 100} y1={e.y1 * 100} x2={e.x2 * 100} y2={e.y2 * 100}
          stroke="transparent" strokeWidth={LINE_HIT_PX}
          vectorEffect="non-scaling-stroke" strokeLinecap="round"
          onPointerDown={onPointerDownLine}
        />
      </svg>
      {selected && selectTool && (
        <>
          <span className="pdfe-end pdfe-end-1" style={pt(e.x1, e.y1)} title="נקודת ההתחלה"
            onPointerDown={ev => onStartEndpoint(ev, 1)} />
          <span className="pdfe-end pdfe-end-2" style={pt(e.x2, e.y2)} title="נקודת הסיום"
            onPointerDown={ev => onStartEndpoint(ev, 2)} />
        </>
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
  const fill = fillColorOf(ann);
  const stroke = strokeVisible(ann);
  const shape = ['highlight', 'whiteout', 'rectangle', 'circle'].includes(ann.kind);

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
    const prevH = ta.style.height;
    ta.style.height = '0px';
    const content = ta.scrollHeight;
    ta.style.height = prevH || '100%';
    const hPct = Math.min(0.92, Math.max((content + 2) / stagePx.h, (fontPx * 1.5) / stagePx.h));
    if (Math.abs(hPct - ann.heightPct) > 0.004) onAutoHeight(hPct);
  };
  useLayoutEffect(() => { if (editing) syncHeight(); });   // אחרי כל עדכון טקסט/גופן

  return (
    <div
      className={`pdfe-ann pdfe-ann-${ann.kind}${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
      style={style}
      onPointerDown={onPointerDownBox}
      onDoubleClick={() => { if (ann.kind === 'text') onEditText(); }}
      title={ann.kind === 'text' && selectTool && !editing ? 'לחיצה כפולה או Enter לעריכה' : undefined}
    >
      {/* ‼ המילוי והמסגרת הם שתי שכבות נפרדות, בדיוק כמו בצריבה: השקיפות
          של המילוי אינה נוגעת במסגרת, ומסגרת אפשר לכבות לגמרי. */}
      {shape && fill && (
        <span className={`pdfe-fill${ann.kind === 'circle' ? ' is-round' : ''}`}
          style={{ background: fill, opacity: fillOpacityOf(ann) }} />
      )}
      {shape && stroke && (
        <span className={`pdfe-outline${ann.kind === 'circle' ? ' is-round' : ''}`}
          style={{ borderColor: ann.color, borderWidth: strokePx, opacity: strokeOpacityOf(ann) }} />
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
      {/* רקע תיבת הטקסט — שכבה מתחת לאותיות, בשקיפות משלה */}
      {ann.kind === 'text' && fill && (
        <span className="pdfe-fill" style={{ background: fill, opacity: fillOpacityOf(ann) }} />
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

// ─── יצירת סימון ───────────────────────────────────────────────────────

export function mkAnnotation(
  kind: AnnotationKind, pageId: string, x: number, y: number, w: number, h: number, color: string,
): Annotation {
  // ‼ לקו אין רצפת מידות: קו אופקי הוא תיבה בגובה אפס, וזה מצב תקין.
  const floor = kind === 'line' ? 0 : 0.01;
  return {
    id: `an-${Math.random().toString(36).slice(2, 10)}`,
    pageId, kind,
    xPct: Math.min(1, Math.max(0, x)),
    yPct: Math.min(1, Math.max(0, y)),
    widthPct: Math.max(floor, w),
    heightPct: Math.max(floor, h),
    color,
    thicknessPct: DEFAULT_THICKNESS_PCT,
    // ברירות המחדל של הכלי — הדגשה שקופה, הסתרה לבנה אטומה וכו'
    ...presetFor(kind, color),
  };
}

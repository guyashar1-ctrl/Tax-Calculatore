// ─── תצוגת טופס חכם — ה-PDF שהייצוא הפיק, עמוד אחרי עמוד ───────────────────
// ‼ אין כאן שכבת ציור משלנו: מציגים את הבייטים שיצאו מ-exportSmartForm, ולכן
// מה שרואים הוא מה שנחתם ונשמר. מלבני השדות (לחיצה ⇒ השדה בטופס הנתונים)
// ממוקמים ב-viewport.convertToViewportRectangle של pdfjs — אותה טרנספורמציה
// שבה העמוד עצמו מצויר, בכל זום.

import { useEffect, useRef, useState } from 'react';
import { loadPdf, type LoadedPdf } from '../../utils/pdfRender';
import type { PdfRect } from './types';

export interface Hotspot { page: number; box: PdfRect; key: string; tone: 'ok' | 'warn' | 'bad' | 'muted'; title: string }

interface Props {
  bytes: Uint8Array | null;
  hotspots?: Hotspot[];
  onHotspot?: (key: string) => void;
  activeKey?: string | null;
  busy?: boolean;
}

const TONE: Record<Hotspot['tone'], string> = {
  ok: 'rgba(22,163,74,.10)', warn: 'rgba(217,119,6,.16)', bad: 'rgba(220,38,38,.16)', muted: 'transparent',
};
const TONE_BORDER: Record<Hotspot['tone'], string> = {
  ok: 'rgba(22,163,74,.45)', warn: 'rgba(217,119,6,.8)', bad: 'rgba(220,38,38,.85)', muted: 'transparent',
};

export default function SmartFormPreview({ bytes, hotspots = [], onHotspot, activeKey, busy }: Props) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // ‼ רוחב העמוד מותאם לרוחב שיש — בטלפון עמוד בגודל מחשב נחתך, והחותם לא רואה את כולו.
  const pagesRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1.25);
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      if (w > 0) setFit(Math.min(1.25, Math.max(0.4, (w - 8) / 612)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!bytes) return;
    loadPdf(bytes).then(p => { if (!cancelled) { setPdf(prev => { void prev?.doc.destroy(); return p; }); setError(null); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [bytes]);

  return (
    <div className="sf-preview" dir="ltr">
      <div className="sf-preview-bar" dir="rtl">
        <span className="sf-preview-title">הטופס כפי שייחתם{busy ? ' · מעדכן…' : ''}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="הקטנה">−</button>
        <span className="sf-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setZoom(z => Math.min(2.4, +(z + 0.2).toFixed(1)))} aria-label="הגדלה">+</button>
      </div>
      {error && <div className="sf-preview-error" dir="rtl">לא ניתן להציג את הטופס: {error}</div>}
      <div className="sf-pages" ref={pagesRef}>
        {pdf && Array.from({ length: pdf.numPages }, (_, i) => (
          <PreviewPage key={`${i}-${pdf.doc.fingerprints?.[0] ?? ''}`} pdf={pdf} index={i} zoom={zoom} fit={fit}
            hotspots={hotspots.filter(h => h.page === i + 1)} onHotspot={onHotspot} activeKey={activeKey} />
        ))}
      </div>
    </div>
  );
}

function PreviewPage({ pdf, index, zoom, fit, hotspots, onHotspot, activeKey }: {
  pdf: LoadedPdf; index: number; zoom: number; fit: number; hotspots: Hotspot[]; onHotspot?: (k: string) => void; activeKey?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rects, setRects] = useState<{ h: Hotspot; left: number; top: number; width: number; height: number }[]>([]);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const cssScale = fit * zoom;

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await pdf.doc.getPage(index + 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = page.getViewport({ scale: cssScale });
      const vpHi = page.getViewport({ scale: cssScale * dpr });
      const c = canvasRef.current;
      if (!c || cancelled) return;
      c.width = Math.floor(vpHi.width); c.height = Math.floor(vpHi.height);
      c.style.width = `${vp.width}px`; c.style.height = `${vp.height}px`;
      setSize({ w: vp.width, h: vp.height });
      task = page.render({ canvas: c, viewport: vpHi });
      try { await task.promise; } catch { /* בוטל */ }
      if (cancelled) return;
      // ‼ אותה טרנספורמציה שבה העמוד צויר — לא חישוב ידני של y הפוך.
      setRects(hotspots.map(h => {
        const [x1, y1, x2, y2] = vp.convertToViewportRectangle([h.box.x, h.box.y, h.box.x + h.box.w, h.box.y + h.box.h]);
        return { h, left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
      }));
    })();
    return () => { cancelled = true; task?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, index, cssScale, JSON.stringify(hotspots.map(h => [h.key, h.tone, h.box]))]);

  return (
    <div className="sf-page" style={size ? { width: size.w, height: size.h } : undefined}>
      <canvas ref={canvasRef} />
      {onHotspot && rects.map(r => (
        <button key={r.h.key + r.left} type="button" className={`sf-hot${activeKey === r.h.key ? ' is-active' : ''}`}
          title={r.h.title}
          style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: TONE[r.h.tone], borderColor: TONE_BORDER[r.h.tone] }}
          onClick={() => onHotspot(r.h.key)} />
      ))}
    </div>
  );
}

// ─── תצוגת טופס חכם — ה-PDF שהייצוא הפיק, עמוד אחרי עמוד ───────────────────
// ‼ אין כאן שכבת ציור משלנו: מציגים את הבייטים שיצאו מ-exportSmartForm, ולכן
// מה שרואים הוא מה שנחתם ונשמר. מלבני השדות (לחיצה ⇒ השדה בטופס הנתונים)
// ממוקמים ב-viewport.convertToViewportRectangle של pdfjs — אותה טרנספורמציה
// שבה העמוד עצמו מצויר, בכל זום.
// ‼ 16.10.2026 · תצוגה חיה: העמוד מצויר לקנבס נסתר ורק אז מועתק — כך הטופס לא מהבהב
//   לבן בכל הקלדה. סימונים (mark): «חסר» / ✓ / «כאן הלקוח חותם» — שכבה מעל, בלי לגעת ב-PDF.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadPdf, type LoadedPdf } from '../../utils/pdfRender';
import type { PdfRect } from './types';

export type HotspotMark = 'ok' | 'missing' | 'sign' | 'signed';
export interface Hotspot {
  page: number; box: PdfRect; key: string; tone: 'ok' | 'warn' | 'bad' | 'muted'; title: string;
  /** סימון מצב על הטופס (תיבת חובה / חתימה) — במקום צבע הרקע של tone. */
  mark?: HotspotMark;
  /** תווית גלויה מעל התיבה (למשל «כאן הלקוח חותם»). */
  tag?: string;
}

interface Props {
  bytes: Uint8Array | null;
  hotspots?: Hotspot[];
  onHotspot?: (key: string) => void;
  activeKey?: string | null;
  busy?: boolean;
  /** כותרת הסרגל (ברירת מחדל: «הטופס כפי שייחתם»). */
  title?: string;
  /** רוחב מרבי של עמוד ביחידות סקאלה (1 = 612 נק׳ ⇒ 612px). ברירת מחדל 1.25. */
  maxFit?: number;
}

const TONE: Record<Hotspot['tone'], string> = {
  ok: 'rgba(22,163,74,.10)', warn: 'rgba(217,119,6,.16)', bad: 'rgba(220,38,38,.16)', muted: 'transparent',
};
const TONE_BORDER: Record<Hotspot['tone'], string> = {
  ok: 'rgba(22,163,74,.45)', warn: 'rgba(217,119,6,.8)', bad: 'rgba(220,38,38,.85)', muted: 'transparent',
};

export default function SmartFormPreview({ bytes, hotspots = [], onHotspot, activeKey, busy, title, maxFit = 1.25 }: Props) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // ‼ רוחב העמוד מותאם לרוחב שיש — בטלפון עמוד בגודל מחשב נחתך, והחותם לא רואה את כולו.
  const pagesRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(maxFit);
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      if (w > 0) setFit(Math.min(maxFit, Math.max(0.4, (w - 8) / 612)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxFit]);

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
        <span className="sf-preview-title">{title ?? 'הטופס כפי שייחתם'}{busy ? ' · מעדכן…' : ''}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="הקטנה">−</button>
        <span className="sf-zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setZoom(z => Math.min(2.4, +(z + 0.2).toFixed(1)))} aria-label="הגדלה">+</button>
      </div>
      {error && <div className="sf-preview-error" dir="rtl">לא ניתן להציג את הטופס: {error}</div>}
      <div className="sf-pages" ref={pagesRef}>
        {pdf && Array.from({ length: pdf.numPages }, (_, i) => (
          <PreviewPage key={i} pdf={pdf} index={i} zoom={zoom} fit={fit}
            hotspots={hotspots.filter(h => h.page === i + 1)} onHotspot={onHotspot} activeKey={activeKey} />
        ))}
      </div>
    </div>
  );
}

type Vp = { width: number; height: number; convertToViewportRectangle: (r: number[]) => number[] };

function PreviewPage({ pdf, index, zoom, fit, hotspots, onHotspot, activeKey }: {
  pdf: LoadedPdf; index: number; zoom: number; fit: number; hotspots: Hotspot[]; onHotspot?: (k: string) => void; activeKey?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vp, setVp] = useState<Vp | null>(null);
  const cssScale = fit * zoom;

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await pdf.doc.getPage(index + 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const view = page.getViewport({ scale: cssScale });
      const vpHi = page.getViewport({ scale: cssScale * dpr });
      // ‼ ציור לקנבס נסתר; ההעתקה לקנבס הגלוי קורית רק כשהעמוד מוכן — בלי הבהוב לבן בתצוגה חיה
      const off = document.createElement('canvas');
      off.width = Math.floor(vpHi.width); off.height = Math.floor(vpHi.height);
      task = page.render({ canvas: off, viewport: vpHi });
      try { await task.promise; } catch { return; /* בוטל */ }
      const c = canvasRef.current;
      if (!c || cancelled) return;
      if (c.width !== off.width || c.height !== off.height) { c.width = off.width; c.height = off.height; }
      c.style.width = `${view.width}px`; c.style.height = `${view.height}px`;
      c.getContext('2d')?.drawImage(off, 0, 0);
      setVp(view as unknown as Vp);
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, index, cssScale]);

  // ‼ אותה טרנספורמציה שבה העמוד צויר — לא חישוב ידני של y הפוך. הסימונים מתעדכנים בלי לצייר את העמוד מחדש.
  const rects = useMemo(() => {
    if (!vp) return [];
    return hotspots.map(h => {
      const [x1, y1, x2, y2] = vp.convertToViewportRectangle([h.box.x, h.box.y, h.box.x + h.box.w, h.box.y + h.box.h]);
      return { h, left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    });
  }, [vp, hotspots]);

  // סימון פעיל (למשל השאלה שעונים עליה עכשיו) — נגלל לעין בתוך התצוגה
  const pageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!activeKey || !vp) return;
    const el = pageRef.current?.querySelector<HTMLElement>(`[data-hot="${CSS.escape(activeKey)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [activeKey, vp]);

  // ‼ גודל התגים יחסי לעמוד: בטלפון העמוד קטן, ותג של 14px על כל תיבה מסתיר את הטופס
  const size = vp ? { width: vp.width, height: vp.height, ['--sf-badge' as string]: `${Math.max(8, Math.min(14, vp.width / 46))}px` } : undefined;
  return (
    <div className="sf-page" ref={pageRef} style={size as React.CSSProperties | undefined}>
      <canvas ref={canvasRef} />
      {rects.map(r => {
        const Tag: 'button' | 'span' = onHotspot ? 'button' : 'span';
        const mark = r.h.mark;
        const cls = `sf-hot${mark ? ` is-${mark}` : ''}${activeKey === r.h.key ? ' is-active' : ''}`;
        const style: React.CSSProperties = mark
          ? { left: r.left, top: r.top, width: r.width, height: r.height }
          : { left: r.left, top: r.top, width: r.width, height: r.height, background: TONE[r.h.tone], borderColor: TONE_BORDER[r.h.tone] };
        return (
          <Tag key={r.h.key} {...(Tag === 'button' ? { type: 'button' as const, onClick: () => onHotspot?.(r.h.key) } : {})}
            className={cls} title={r.h.title} data-hot={r.h.key} data-mark={mark} aria-label={mark ? `${r.h.title} — ${MARK_TEXT[mark]}` : r.h.title} style={style}>
            {mark && mark !== 'sign' && <i className="sf-hot-badge" aria-hidden="true">{mark === 'missing' ? '!' : '✓'}</i>}
            {r.h.tag && <b className="sf-hot-tag" dir="rtl">{r.h.tag}</b>}
          </Tag>
        );
      })}
    </div>
  );
}

export const MARK_TEXT: Record<HotspotMark, string> = { ok: 'מלא', missing: 'חסר', sign: 'אזור החתימה של הלקוח', signed: 'נחתם' };

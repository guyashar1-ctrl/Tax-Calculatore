// ─── צפייה במסמך — בתוך הדף, גם בטלפון (01.10.2026) ─────────────────────────
// ‼ PDF מוצג כעמודים מרונדרים (pdfjs) ולא ב-iframe: בטלפון iframe של PDF לא
// מוצג בכלל (רק «הורדה»). תמונה מוצגת כמו שהיא. בראש: מה רואים (איזו גרסה),
// ובתחתית: הורדה ופתיחה בכרטיסייה חדשה.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Modal from './ui/Modal';
import { loadPdf, type PdfDocument } from '../utils/pdfRender';

export interface ViewerFile {
  bytes: Uint8Array; fileName: string; mime: string;
  /** ‼ כשמוצגת גרסה לתצוגה (HEIC ⇒ JPG) — ההורדה היא של המקור, לא של התצוגה. */
  original?: { bytes: Uint8Array; fileName: string; mime: string };
}

interface Props {
  title: string;
  /** איזו גרסה מוצגת — משפט אחד. */
  caption?: ReactNode;
  /** תג קצר ליד הכותרת («סופי», «PDF לשע״ם»…). */
  badge?: { text: string; tone: 'done' | 'wait' | 'neutral' };
  /** טוען קובץ אחד (PDF או תמונה) — או כמה תמונות (שני צדדים). */
  load: () => Promise<ViewerFile | ViewerFile[]>;
  /** מקומות חתימה עתידיים — מעל ה-PDF הראשון בלבד. */
  overlay?: ViewerOverlay | null;
  /** כמה עמודים יש בקובץ שנטען — לבדיקת מקומות בעמוד שאינו קיים. */
  onPages?: (n: number) => void;
  onClose: () => void;
}

/** מקום חתימה עתידי על הטופס — מצויר מעל העמוד, לא נצרב עליו. */
export interface ViewerOverlayBox {
  id: string;
  pageIndex: number;
  xPct: number; yPct: number; widthPct: number; heightPct: number;
  /** «חתימה · עידן רוקח» */
  label: string;
  tone: 'client' | 'spouse' | 'office' | 'static';
}

export interface ViewerOverlay {
  boxes: ViewerOverlayBox[];
  /** מקרא: מי חותם איפה. */
  legend: { tone: ViewerOverlayBox['tone']; text: string }[];
  /** משפט אחד מעל המקרא — מה הסימונים (ומה הם לא). */
  note?: string;
}

const ZOOMS = [1, 1.5, 2, 3];
const RENDER_ERROR = 'לא הצלחנו להציג את הקובץ כאן. אפשר להוריד אותו או לפתוח בכרטיסייה חדשה.';

/**
 * ‼ 04.10.2026 · כל עמודי ה-PDF, עם הגדלה ומעבר בין עמודים — גם בטלפון. העמוד מרונדר
 * מחדש לפי ההגדלה (לא מתיחה של תמונה קטנה), עם תקרה כדי לא לחנוק טלפון.
 * הסימונים הם שכבה מעל העמוד, באחוזים — אותם אחוזים שהחתימה נצרבת לפיהם.
 */
function PdfPages({ bytes, overlay, onPages }: { bytes: Uint8Array; overlay?: ViewerOverlay | null; onPages?: (n: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(0);
  const [showMarks, setShowMarks] = useState(true);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const wraps = useRef<(HTMLDivElement | null)[]>([]);
  /** מעבר בכפתור: העמוד שנבחר נשאר «הנוכחי» בזמן הגלילה (גם כשהעמוד האחרון לא מגיע לראש המסך). */
  const jumpedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { doc: d } = await loadPdf(bytes);
        if (cancelled) return;
        const s: { w: number; h: number }[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const vp = (await d.getPage(i)).getViewport({ scale: 1 });
          s.push({ w: vp.width, h: vp.height });
        }
        if (cancelled) return;
        setSizes(s); setDoc(d); onPages?.(d.numPages);
      } catch {
        if (!cancelled) setErr(RENDER_ERROR);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes]);

  // ‼ תקרה של 3000 פיקסלים לרוחב העמוד: בטלפון קנבס גדול מזה נופל בשקט ללבן.
  useEffect(() => {
    if (!doc || !host.current) return;
    let cancelled = false;
    const width = Math.max(280, host.current.clientWidth) * zoom;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    (async () => {
      for (let i = 1; i <= doc.numPages && !cancelled; i++) {
        const c = canvases.current[i - 1];
        if (!c) continue;
        const page = await doc.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min((width / vp1.width) * dpr, 3000 / vp1.width) });
        const off = document.createElement('canvas');
        off.width = Math.round(vp.width); off.height = Math.round(vp.height);
        // ‼ canvasContext ולא { canvas }: המסלול שלא תלוי בפריימים (ראה pdfRender.renderThumbnail).
        await page.render({ canvasContext: off.getContext('2d')!, viewport: vp, canvas: off } as never).promise;
        if (cancelled) return;
        c.width = off.width; c.height = off.height;
        c.getContext('2d')!.drawImage(off, 0, 0);
      }
    })().catch(() => { if (!cancelled) setErr(RENDER_ERROR); });
    return () => { cancelled = true; };
  }, [doc, zoom]);

  // איזה עמוד מול העיניים — לשורת «עמוד 2 מתוך 3». ‼ העמוד שחוצה קו בשליש העליון של
  // המסך, לא «הכי גלוי»: בטלפון שני עמודים קצרים גלויים במלואם, ו«הבא» היה קופץ לאחרון.
  useEffect(() => {
    if (sizes.length < 2) return;
    let raf = 0;
    const pick = () => {
      raf = 0;
      if (Date.now() - jumpedAt.current < 900) return;
      const line = window.innerHeight * 0.35;
      const rects = wraps.current.map(w => w?.getBoundingClientRect());
      let idx = rects.findIndex(r => !!r && r.top <= line && r.bottom > line);
      if (idx < 0) idx = rects.findIndex(r => !!r && r.bottom > 0);
      if (idx >= 0) setCurrent(idx);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    document.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('scroll', onScroll, true); if (raf) cancelAnimationFrame(raf); };
  }, [sizes.length]);

  const goTo = (i: number) => {
    const n = Math.max(0, Math.min(sizes.length - 1, i));
    jumpedAt.current = Date.now();
    setCurrent(n);
    wraps.current[n]?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  };
  const zi = ZOOMS.indexOf(zoom);
  const boxes = overlay && showMarks ? overlay.boxes : [];
  const lost = overlay && sizes.length > 0 ? overlay.boxes.filter(b => b.pageIndex >= sizes.length) : [];

  return (
    <>
      {err && <div className="dv-err">{err}</div>}
      {overlay && (
        <div className="dv-legend" data-testid="dv-legend">
          {overlay.note && <div className="dv-legend-note">{overlay.note}</div>}
          {overlay.legend.length > 0 && (
            <div className="dv-legend-items">
              {overlay.legend.map((l, i) => (
                <span key={i} className="dv-legend-item" data-tone={l.tone}><span className="dv-swatch" aria-hidden="true" />{l.text}</span>
              ))}
            </div>
          )}
          {overlay.boxes.length > 0 && (
            <label className="dv-toggle">
              <input type="checkbox" checked={showMarks} onChange={e => setShowMarks(e.target.checked)} data-testid="dv-marks-toggle" />
              הצגת מקומות החתימה על הטופס
            </label>
          )}
          {lost.length > 0 && (
            <div className="dv-err" data-testid="dv-lost">
              {lost.length === 1 ? 'מקום חתימה אחד מסומן' : `${lost.length} מקומות חתימה מסומנים`} בעמוד שאינו קיים בקובץ.
            </div>
          )}
        </div>
      )}
      {sizes.length > 0 && (
        <div className="dv-bar" data-testid="dv-bar">
          {sizes.length > 1 ? (
            <span className="dv-bar-group">
              <button type="button" className="dv-btn" aria-label="העמוד הקודם" disabled={current === 0} onClick={() => goTo(current - 1)}>›</button>
              <span className="dv-bar-text" data-testid="dv-page">עמוד {current + 1} מתוך {sizes.length}</span>
              <button type="button" className="dv-btn" aria-label="העמוד הבא" disabled={current >= sizes.length - 1} onClick={() => goTo(current + 1)}>‹</button>
            </span>
          ) : null}
          <span className="dv-bar-group">
            <button type="button" className="dv-btn" aria-label="הקטנה" disabled={zi <= 0} onClick={() => setZoom(ZOOMS[zi - 1])}>−</button>
            <button type="button" className="dv-btn dv-btn-wide" data-testid="dv-zoom" title="התאמה לרוחב" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button type="button" className="dv-btn" aria-label="הגדלה" data-testid="dv-zoom-in" disabled={zi >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zi + 1])}>+</button>
          </span>
        </div>
      )}
      <div ref={host} className="dv-pages" data-zoom={zoom}>
        {sizes.map((sz, i) => (
          <div key={i} ref={el => { wraps.current[i] = el; }} className="dv-pagewrap" data-page={i}
            style={{ width: `${zoom * 100}%`, aspectRatio: `${sz.w} / ${sz.h}` }}>
            <canvas ref={el => { canvases.current[i] = el; }} className="dv-page" aria-label={`עמוד ${i + 1}`} style={{ direction: 'ltr' }} />
            {boxes.filter(b => b.pageIndex === i).map(b => (
              <div key={b.id} className="dv-mark" data-tone={b.tone} data-testid="dv-mark" title={b.label}
                data-side={b.xPct + b.widthPct / 2 < 0.5 ? 'left' : 'right'}
                style={{ left: `${b.xPct * 100}%`, top: `${b.yPct * 100}%`, width: `${b.widthPct * 100}%`, height: `${b.heightPct * 100}%` }}>
                <span className="dv-mark-label">{b.tone === 'static' ? '✓' : b.label}</span>
              </div>
            ))}
            {sizes.length > 1 && <div className="dv-pageno" aria-hidden="true">{i + 1}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

export default function DocumentViewerDialog({ title, caption, badge, load, overlay, onPages, onClose }: Props) {
  const [files, setFiles] = useState<ViewerFile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    load().then(f => { if (!cancelled) setFiles(Array.isArray(f) ? f : [f]); })
      .catch(e => { if (!cancelled) setErr(e instanceof Error && e.message ? e.message : 'הקובץ לא נטען.'); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!files) return;
    const u = files.map(f => URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime })));
    const d = files.map(f => (f.original ? URL.createObjectURL(new Blob([f.original.bytes as BlobPart], { type: f.original.mime })) : null));
    setUrls(u);
    setDownloads(d.map((x, i) => x ?? u[i]));
    return () => [...u, ...d].forEach(x => x && URL.revokeObjectURL(x));
  }, [files]);

  // ‼ כמה תמונות מאותו קובץ (HEIC עם שתי תמונות) — הורדה אחת של הקובץ המקורי, לא כפתור לכל תמונה.
  const dl = files ? files.map((f, i) => ({ i, key: f.original?.bytes ?? f.bytes, name: f.original?.fileName ?? f.fileName }))
    .filter((x, idx, all) => all.findIndex(y => y.key === x.key) === idx) : [];
  const footer = files && urls.length ? (
    <div className="dv-foot">
      {dl.map((d, n) => (
        <a key={d.i} className="btn btn-primary btn-sm" href={downloads[d.i] ?? urls[d.i]} download={d.name} data-testid="dv-download">
          {dl.length > 1 ? `הורדת קובץ ${n + 1}` : 'הורדה'}
        </a>
      ))}
      {files.length === 1 && (
        <a className="rc-link" href={urls[0]} target="_blank" rel="noreferrer">פתיחה בכרטיסייה חדשה</a>
      )}
      <span className="dv-file">{dl.length === 1 ? dl[0].name : `${dl.length} קבצים`}</span>
    </div>
  ) : null;

  return (
    <Modal title={<span className="dv-title">{title}{badge && <span className="dv-badge" data-tone={badge.tone}>{badge.text}</span>}</span>}
      onClose={onClose} width={880} footer={footer}>
      <div className="dv" data-testid="document-viewer">
        {caption && <p className="dv-caption">{caption}</p>}
        {err && <div className="dv-err">{err}</div>}
        {!files && !err && <div className="dv-loading">טוען…</div>}
        {files?.map((f, i) => (
          <div key={i} className="dv-item">
            {files.length > 1 && <div className="dv-meta">עמוד {i + 1}</div>}
            {f.mime === 'application/pdf'
              ? <PdfPages bytes={f.bytes} overlay={i === 0 ? overlay : null} onPages={i === 0 ? onPages : undefined} />
              : urls[i] ? <img className="dv-image" src={urls[i]} alt={`${title}${files.length > 1 ? ` · ${i + 1}` : ''}`} /> : null}
          </div>
        ))}
      </div>
    </Modal>
  );
}

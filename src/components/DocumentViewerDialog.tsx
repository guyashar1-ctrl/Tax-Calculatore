// ─── צפייה במסמך — בתוך הדף, גם בטלפון (01.10.2026) ─────────────────────────
// ‼ PDF מוצג כעמודים מרונדרים (pdfjs) ולא ב-iframe: בטלפון iframe של PDF לא
// מוצג בכלל (רק «הורדה»). תמונה מוצגת כמו שהיא. בראש: מה רואים (איזו גרסה),
// ובתחתית: הורדה ופתיחה בכרטיסייה חדשה.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Modal from './ui/Modal';
import { loadPdf } from '../utils/pdfRender';

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
  onClose: () => void;
}

function PdfPages({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    if (!el) return;
    (async () => {
      try {
        const { doc } = await loadPdf(bytes);
        if (cancelled) return;
        setPages(doc.numPages);
        const width = Math.max(280, el.clientWidth);
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        for (let i = 1; i <= doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i);
          const vp1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / vp1.width) * dpr });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          c.className = 'dv-page';
          c.style.direction = 'ltr';
          c.setAttribute('aria-label', `עמוד ${i}`);
          // ‼ canvasContext ולא { canvas }: המסלול שלא תלוי בפריימים (ראה pdfRender.renderThumbnail).
          await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as never).promise;
          if (!cancelled) el.appendChild(c);
        }
      } catch {
        if (!cancelled) setErr('לא הצלחנו להציג את הקובץ כאן. אפשר להוריד אותו או לפתוח בכרטיסייה חדשה.');
      }
    })();
    return () => { cancelled = true; el.replaceChildren(); };
  }, [bytes]);
  return (
    <>
      {pages > 1 && <div className="dv-meta">{pages} עמודים</div>}
      {err && <div className="dv-err">{err}</div>}
      <div ref={host} className="dv-pages" />
    </>
  );
}

export default function DocumentViewerDialog({ title, caption, badge, load, onClose }: Props) {
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
              ? <PdfPages bytes={f.bytes} />
              : urls[i] ? <img className="dv-image" src={urls[i]} alt={`${title}${files.length > 1 ? ` · ${i + 1}` : ''}`} /> : null}
          </div>
        ))}
      </div>
    </Modal>
  );
}

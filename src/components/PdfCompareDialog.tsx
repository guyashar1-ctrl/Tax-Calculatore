// ─── השוואה: PDF באיכות המקור מול גרסת ההגשה (211) ──────────────────────────
// גיא: «אם איכות הגרסה המוקטנת אינה מובטחת, אל תעביר אותה אוטומטית להגשה כאילו
// הכול תקין; הצג השוואה ברורה או בקש מקור מתאים יותר».
// ‼ מה מוצג: האזורים עם הפרטים העדינים ביותר בכל עמוד שהשתנה (שם טקסט קטן נפגע
// ראשון), משני הקבצים, באותו גודל ובאותה רזולוציה — פיקסל של המקור מול אותו
// מקום בגרסת ההגשה. לא «נראה בסדר בתמונה מוקטנת».
// ‼ ההחלטה שייכת לגרסה הזאת בלבד: צילום שהוחלף ⇒ בנייה חדשה ⇒ החלטה חדשה.

import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import { loadPdf, type PdfDocument } from '../utils/pdfRender';
import type { ViewerFile } from './DocumentViewerDialog';
import type { PdfBuild } from '../hooks/useDocumentPdfBuilds';
import { fitOnA4, type FocusRegion } from '../utils/imageToPdf';

interface Props {
  title: string;
  build: PdfBuild;
  loadDoc: (id: string) => Promise<ViewerFile>;
  onDecide?: (decision: 'approve' | 'reject' | 'reopen') => Promise<void>;
  onClose: () => void;
}

/** 30.3MB מול 30MB — בלי עיגול שמשווה בין שני מספרים שונים. */
const mb = (n?: number | null) => (n ? `${String(+(n / 1048576).toFixed(n >= 10 * 1048576 ? 1 : 2))}MB` : '');

/** אזור אחד מעמוד, ברזולוציית המקור. */
function Crop({ doc, region, scale, label }: { doc: PdfDocument; region: FocusRegion; scale: number; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    if (!el) return;
    (async () => {
      const page = await doc.getPage(region.page + 1);
      const full = page.getViewport({ scale });
      const x0 = Math.round(region.x * full.width), y0 = Math.round(region.y * full.height);
      const w = Math.max(1, Math.round(region.w * full.width)), h = Math.max(1, Math.round(region.h * full.height));
      const vp = page.getViewport({ scale, offsetX: -x0, offsetY: -y0 });
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.className = 'pdfc-canvas';
      c.setAttribute('aria-label', label);
      await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as never).promise;
      if (!cancelled) { el.replaceChildren(c); setShown(true); }
    })().catch(() => { if (!cancelled) { el.textContent = 'לא הצלחנו להציג את האזור.'; setShown(true); } });
    return () => { cancelled = true; };
  }, [doc, region, scale, label]);
  // ‼ סריקה גדולה (48MP) מפוענחת במלואה לכל אזור — כמה שניות. עד אז — הודעה, לא מסגרת ריקה.
  return (
    <div className="pdfc-crop">
      {!shown && <div className="pdfc-wait">מציג את האזור ברזולוציה מלאה…</div>}
      <div ref={host} />
    </div>
  );
}

export default function PdfCompareDialog({ title, build, loadDoc, onDecide, onClose }: Props) {
  const [docs, setDocs] = useState<{ original: PdfDocument; submission: PdfDocument; files: ViewerFile[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [decideErr, setDecideErr] = useState<string | null>(null);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [o, s] = await Promise.all([loadDoc(build.id), loadDoc(build.submissionDocumentId ?? build.id)]);
      const [od, sd] = await Promise.all([loadPdf(o.bytes), loadPdf(s.bytes)]);
      if (!cancelled) setDocs({ original: od.doc, submission: sd.doc, files: [o, s] });
    })().catch(e => { if (!cancelled) setErr(e instanceof Error && e.message ? e.message : 'הקבצים לא נטענו.'); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.id, build.submissionDocumentId]);

  useEffect(() => {
    if (!docs) return;
    const u = docs.files.map(f => URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: 'application/pdf' })));
    setUrls(u);
    return () => u.forEach(x => URL.revokeObjectURL(x));
  }, [docs]);

  const pages = build.submissionPages;
  const p0 = pages[0];
  const downscaled = build.submissionMode === 'downscaled';
  const state = build.submissionState;
  const limit = mb(build.submissionLimit ?? 30 * 1048576);
  // ‼ קנה מידה: פיקסל של תמונת המקור = פיקסל בקנבס (אותה הצבה על הדף כמו בהמרה).
  const scaleFor = (page: number) => {
    const m = pages.find(p => p.page === page) ?? p0;
    if (!m) return 3;
    return Math.min(12, Math.max(1, m.srcW / fitOnA4(m.srcW, m.srcH).dw));
  };

  const decide = async (d: 'approve' | 'reject' | 'reopen') => {
    if (!onDecide) return;
    setBusy(d); setDecideErr(null);
    try { await onDecide(d); onClose(); }
    catch (e) { setDecideErr(e instanceof Error ? e.message : 'ההחלטה לא נשמרה.'); }
    finally { setBusy(null); }
  };

  const summary = downscaled
    ? <>ה-PDF באיכות המקור ({mb(build.pdfBytes)}) גדול ממגבלת ההעלאה ({limit}), ולכן גרסת ההגשה <b>הוקטנה</b>
        {p0 ? <> מ-{p0.srcW.toLocaleString('he-IL')}×{p0.srcH.toLocaleString('he-IL')} ל-{p0.outW.toLocaleString('he-IL')}×{p0.outH.toLocaleString('he-IL')} פיקסלים</> : null}
        {p0 ? (p0.quality >= 1 ? ', בלי דחיסה' : `, JPEG ${Math.round(p0.quality * 100)}%`) : ''}
        {' '}({mb(build.submissionBytes)}). הקטנה אינה ערובה שטקסט קטן נשאר קריא — השוו את האזורים העדינים ביותר.</>
    : <>ה-PDF באיכות המקור ({mb(build.pdfBytes)}) גדול ממגבלת ההעלאה ({limit}). גרסת ההגשה נשמרה <b>ברזולוציה המלאה</b>,
        בדחיסת JPEG {p0 ? `${Math.round(p0.quality * 100)}%` : ''} ({mb(build.submissionBytes)}).</>;

  const footer = (
    <div className="pdfc-foot">
      {state === 'review' && onDecide && (
        <>
          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !docs} onClick={() => void decide('approve')} data-testid="pc-approve">
            {busy === 'approve' ? 'שומר…' : 'קריא — לאשר להגשה'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => void decide('reject')} data-testid="pc-reject">
            {busy === 'reject' ? 'שומר…' : 'לא קריא — צריך צילום טוב יותר'}
          </button>
        </>
      )}
      {(state === 'approved' || state === 'rejected') && onDecide && (
        <>
          <span className="pdfc-decided" data-tone={state === 'approved' ? 'done' : 'danger'}>
            {state === 'approved' ? 'אישרת שהגרסה קריאה' : 'סימנת שצריך צילום טוב יותר'}
          </span>
          <button type="button" className="rc-quiet" disabled={!!busy} onClick={() => void decide('reopen')} data-testid="pc-reopen">
            {busy === 'reopen' ? 'שומר…' : 'ביטול ההחלטה'}
          </button>
        </>
      )}
      {state === 'auto' && <span className="pdfc-decided" data-tone="done">רזולוציה מלאה — עוברת להגשה בלי החלטה נוספת</span>}
      <span className="pdfc-downloads">
        {urls[0] && <a className="rc-link" href={urls[0]} download={docs?.files[0].fileName} data-testid="pc-dl-original">הורדת המקור</a>}
        {urls[1] && <a className="rc-link" href={urls[1]} download={docs?.files[1].fileName} data-testid="pc-dl-submission">הורדת גרסת ההגשה</a>}
      </span>
    </div>
  );

  return (
    <Modal title={<span className="dv-title">{title}<span className="dv-badge" data-tone={state === 'review' ? 'wait' : state === 'rejected' ? 'neutral' : 'done'}>
      {state === 'review' ? 'לבדיקתך' : state === 'approved' ? 'אושר' : state === 'rejected' ? 'נפסל' : 'רזולוציה מלאה'}</span></span>}
      onClose={onClose} width={980} footer={footer}>
      <div className="pdfc" data-testid="pdf-compare">
        <p className="dv-caption">{summary}</p>
        {err && <div className="dv-err">{err}</div>}
        {decideErr && <div className="dv-err">{decideErr}</div>}
        {!docs && !err && <div className="dv-loading">טוען את שני הקבצים…</div>}
        {docs && build.submissionFocus.length === 0 && <div className="dv-meta">אין אזורים להשוואה — אפשר להוריד את שני הקבצים.</div>}
        {docs && build.submissionFocus.map((r, i) => (
          <div key={i} className="pdfc-row">
            <div className="pdfc-row-head">
              {build.submissionFocus.length > 1 || (build.pageCount ?? 1) > 1 ? `עמוד ${r.page + 1} · ` : ''}אזור {i + 1} — הפרטים העדינים ביותר
            </div>
            <div className="pdfc-pair">
              <figure className="pdfc-side">
                <figcaption>מקור</figcaption>
                <Crop doc={docs.original} region={r} scale={scaleFor(r.page)} label={`מקור · אזור ${i + 1}`} />
              </figure>
              <figure className="pdfc-side">
                <figcaption>{downscaled ? 'להגשה (מוקטן)' : 'להגשה'}</figcaption>
                <Crop doc={docs.submission} region={r} scale={scaleFor(r.page)} label={`להגשה · אזור ${i + 1}`} />
              </figure>
            </div>
          </div>
        ))}
        {state === 'review' && (
          <p className="dv-meta">אם הטקסט הקטן לא קריא בגרסת ההגשה — «לא קריא» חוסם את ההגשה עד שיגיע צילום טוב יותר (צילום רגיל בטלפון, לא סריקה ענקית).</p>
        )}
      </div>
    </Modal>
  );
}

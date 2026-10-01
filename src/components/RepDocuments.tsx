// ─── «מסמכי הבקשה» — ייפוי הכוח והצילום המזהה, בלחיצה אחת (01.10.2026) ──────
// גיא: «פעולה ברורה ונגישה של ׳צפה בייפוי הכוח׳, בלי לחפש בתוך שלבי התהליך».
// שורה לכל מסמך: מה הוא, באיזה מצב, וכפתור צפייה. הצילום וה-PDF שנוצר ממנו
// נפרדים מייפוי הכוח, וכל אחד נפתח לבד.
// ‼ שני מצבים נפרדים לצילום: «PDF מוכן» (הכנה טכנית) ו«הלקוח אישר» (החלטה של
// הלקוח, 208). אחד לא מסיק את השני.

import { useState } from 'react';
import DocumentViewerDialog, { type ViewerFile } from './DocumentViewerDialog';
import type { PoaVersion } from '../features/representation/poaVersion';
import type { PdfBuild } from '../hooks/useDocumentPdfBuilds';

export interface PoaEntry {
  key: string;
  name: string;
  version: PoaVersion | null;
  /** אין טופס נוכחי — למה. */
  noneReason?: string;
}

export interface IdEntry {
  key: string;
  name: string;
  sources: { documentId: string; fileName?: string }[];
  /** הלקוח אישר שזה המסמך שלו (208). */
  confirmed: boolean;
  /** האם לשאול בכלל (שע״ם דורשת). */
  approvalRelevant: boolean;
  build?: PdfBuild;
}

interface Props {
  poa: PoaEntry[];
  ids: IdEntry[];
  loadDoc: (id: string) => Promise<ViewerFile>;
  /** ייפוי כוח חתום על ידי הלקוח — מורכב לתצוגה. */
  composeClientSigned: (v: PoaVersion) => Promise<ViewerFile>;
  /** תמונה שהדפדפן לא מציג (HEIC/TIFF) ⇒ גרסה מפוענחת לתצוגה. */
  displayable: (f: ViewerFile) => Promise<ViewerFile>;
  onRetry: (buildId: string) => void;
  onRegenerateFinal?: () => void;
  regeneratingFinal?: boolean;
}

type Open = { title: string; caption?: string; badge?: { text: string; tone: 'done' | 'wait' | 'neutral' }; load: () => Promise<ViewerFile | ViewerFile[]> };

const isPdfName = (n?: string) => !!n && /\.pdf$/i.test(n);
const extOf = (n?: string) => (n?.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase().replace('JPEG', 'JPG');

function pdfLine(e: IdEntry): { text: string; tone?: 'done' | 'wait' | 'danger'; next?: string; retry?: boolean } {
  if (e.sources.length === 1 && isPdfName(e.sources[0].fileName)) return { text: 'הקובץ הוא PDF', tone: 'done' };
  const b = e.build;
  if (!b) return { text: 'ה-PDF יוכן אוטומטית', tone: 'wait' };
  if (b.status === 'ready') {
    return { text: `PDF מוכן${b.pageCount ? ` · ${b.pageCount === 1 ? 'עמוד אחד' : `${b.pageCount} עמודים`}` : ''}${b.lossless === false ? ' · נדחס לגודל המותר' : ''}`, tone: 'done' };
  }
  if (b.buildingHere || b.status === 'pending') return { text: 'מכין PDF…', tone: 'wait' };
  if (b.status === 'needs_browser') return { text: 'ממיר בדפדפן…', tone: 'wait' };
  return { text: `לא ניתן להכין PDF: ${b.errorMessage ?? 'שגיאה'}`, tone: 'danger', next: b.errorNext ?? undefined, retry: true };
}

export default function RepDocuments({ poa, ids, loadDoc, composeClientSigned, displayable, onRetry, onRegenerateFinal, regeneratingFinal }: Props) {
  const [open, setOpen] = useState<Open | null>(null);
  if (poa.length === 0 && ids.length === 0) return null;

  return (
    <section data-testid="rc-documents">
      <div className="rc-section-head"><div className="rc-section-title">מסמכי הבקשה</div></div>
      <div className="rc-list">
        {poa.map(p => (
          <div key={p.key} className="rc-doc" data-testid="rc-doc-poa" data-version={p.version?.kind ?? 'none'}>
            <div className="rc-doc-main">
              <div className="rc-doc-name">{p.name}</div>
              {p.version ? (
                <div className="rc-doc-line">
                  <span className="rc-doc-state" data-tone={p.version.kind === 'final' ? 'done' : p.version.kind === 'client_signed' ? 'wait' : undefined}>{p.version.label}</span>
                </div>
              ) : (
                <div className="rc-doc-line rc-doc-muted">{p.noneReason}</div>
              )}
            </div>
            {p.version && (
              <div className="rc-doc-acts">
                <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-view-poa"
                  onClick={() => {
                    const v = p.version!;
                    setOpen({
                      title: p.name, caption: v.caption,
                      badge: { text: v.kind === 'final' ? 'סופי' : v.kind === 'client_signed' ? 'חתום על ידי הלקוח' : 'לחתימה', tone: v.kind === 'final' ? 'done' : v.kind === 'client_signed' ? 'wait' : 'neutral' },
                      load: async () => (v.burnClientSignatures ? composeClientSigned(v) : { ...(await loadDoc(v.documentId)), fileName: v.fileName }),
                    });
                  }}>
                  צפייה בייפוי הכוח
                </button>
                {p.version.kind === 'final' && onRegenerateFinal && (
                  <button type="button" className="rc-quiet" disabled={regeneratingFinal} onClick={onRegenerateFinal}>
                    {regeneratingFinal ? 'יוצר מחדש…' : 'יצירה מחדש'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {ids.map(e => {
          const pl = pdfLine(e);
          const images = e.sources.filter(s => !isPdfName(s.fileName));
          const kinds = [...new Set(images.map(s => extOf(s.fileName)).filter(Boolean))].join('/');
          const photoText = e.sources.length > 1 ? `${e.sources.length} צילומים${kinds ? ` (${kinds})` : ''}` : `צילום${kinds ? ` ${kinds}` : ''}`;
          return (
            <div key={e.key} className="rc-doc" data-testid="rc-doc-id" data-pdf={e.build?.status ?? 'none'}>
              <div className="rc-doc-main">
                <div className="rc-doc-name">{e.name}</div>
                <div className="rc-doc-line">
                  <span>{photoText}</span>
                  <span className="rc-doc-sep" aria-hidden="true">·</span>
                  <span className="rc-doc-state" data-tone={pl.tone} data-testid="rc-doc-pdf-state">{pl.text}</span>
                  {e.approvalRelevant && (
                    <>
                      <span className="rc-doc-sep" aria-hidden="true">·</span>
                      <span className="rc-doc-state" data-tone={e.confirmed ? 'done' : 'wait'} data-testid="rc-doc-approval">
                        {e.confirmed ? 'הלקוח אישר שזה המסמך שלו' : 'ממתין לאישור הלקוח'}
                      </span>
                    </>
                  )}
                </div>
                {pl.next && <div className="rc-doc-next">{pl.next}</div>}
                {e.build?.status === 'ready' && e.build.notes.length > 0 && <div className="rc-doc-next">{e.build.notes.join(' ')}</div>}
              </div>
              <div className="rc-doc-acts">
                <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-view-photo"
                  onClick={() => setOpen({
                    title: `${e.name} · ${e.sources.length > 1 ? 'הצילומים' : 'הצילום'}`,
                    caption: e.sources.length > 1 ? 'הקבצים המקוריים, לפי סדר העמודים.' : 'הקובץ המקורי שהועלה.',
                    load: async () => Promise.all(e.sources.map(async s => displayable(await loadDoc(s.documentId)))),
                  })}>
                  {e.sources.length > 1 ? 'צילומים' : 'צילום'}
                </button>
                {e.build?.status === 'ready' && (
                  <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-view-pdf"
                    onClick={() => setOpen({
                      title: `${e.name} · PDF`,
                      caption: `ה-PDF שנוצר מ${e.sources.length > 1 ? 'הצילומים' : 'הצילום'}${e.build!.pageCount ? ` · ${e.build!.pageCount === 1 ? 'עמוד אחד' : `${e.build!.pageCount} עמודים`}` : ''}. זה הקובץ שיוגש לשע״ם${e.confirmed ? '' : ' אחרי שהלקוח יאשר'}.`,
                      badge: { text: 'PDF לשע״ם', tone: 'neutral' },
                      load: () => loadDoc(e.build!.id),
                    })}>
                    PDF
                  </button>
                )}
                {pl.retry && e.build && (
                  <button type="button" className="rc-quiet" onClick={() => onRetry(e.build!.id)}>נסה שוב</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open && <DocumentViewerDialog title={open.title} caption={open.caption} badge={open.badge} load={open.load} onClose={() => setOpen(null)} />}
    </section>
  );
}


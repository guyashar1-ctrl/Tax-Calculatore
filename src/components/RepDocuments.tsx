// ─── «מסמכי הבקשה» — ייפוי הכוח והצילום המזהה, בלחיצה אחת (01.10.2026) ──────
// גיא: «פעולה ברורה ונגישה של ׳צפה בייפוי הכוח׳, בלי לחפש בתוך שלבי התהליך».
// שורה לכל מסמך: מה הוא, באיזה מצב, וכפתור צפייה. הצילום וה-PDF שנוצר ממנו
// נפרדים מייפוי הכוח, וכל אחד נפתח לבד.
// ‼ שני מצבים נפרדים לצילום: «PDF מוכן» (הכנה טכנית) ו«הלקוח אישר» (החלטה של
// הלקוח, 208). אחד לא מסיק את השני.
// ‼ 211 · שתי גרסאות: PDF באיכות המקור (תמיד), וגרסת הגשה נפרדת רק כשהמקור חורג
// מ-30MB. גרסה מוקטנת לא עוברת להגשה עד שהמשרד השווה והחליט.

import { useState } from 'react';
import DocumentViewerDialog, { type ViewerFile } from './DocumentViewerDialog';
import PdfCompareDialog from './PdfCompareDialog';
import type { PoaVersion } from '../features/representation/poaVersion';
import { poaOverlay } from '../features/representation/poaOverlay';
import type { RepSignatureDocument, RepSigner, SignatureValue } from '../types';
import { hasSeparateSubmission, type PdfBuild } from '../hooks/useDocumentPdfBuilds';

export interface PoaEntry {
  key: string;
  name: string;
  version: PoaVersion | null;
  /** אין טופס נוכחי — למה. */
  noneReason?: string;
  /** המסמך שנשלח לחתימה — מקור מקומות החתימה בתצוגה. */
  doc?: RepSignatureDocument;
  /** «עידן רוקח: חתימה · המשרד: חתימה וחותמת · 2 סימונים קבועים» */
  placesLine?: string;
  /** מה חסר כדי שהטופס יהיה מוכן לחתימה (signatureReadiness). */
  problems?: string[];
}

/**
 * ‼ 04.10.2026 · «צפייה בייפוי הכוח» — הקובץ בגרסה הנוכחית, ומעליו מקומות החתימה
 * העתידיים מאותו מסמך שנשלח לחתימה (לא סימון לדוגמה). מוצג גם מהכרטיס «מה עכשיו».
 */
export function PoaViewer({ entry, signers, values, loadDoc, composeClientSigned, onPages, onClose }: {
  entry: PoaEntry;
  signers: RepSigner[];
  values?: Record<string, SignatureValue> | null;
  loadDoc: (id: string) => Promise<ViewerFile>;
  composeClientSigned: (v: PoaVersion) => Promise<ViewerFile>;
  onPages?: (n: number) => void;
  onClose: () => void;
}) {
  const v = entry.version;
  if (!v) return null;
  const overlay = entry.doc ? poaOverlay({ doc: entry.doc, version: v, signers, values }) : null;
  return (
    <DocumentViewerDialog title={entry.name} caption={v.caption}
      badge={{ text: v.kind === 'final' ? 'סופי' : v.kind === 'client_signed' ? 'חתום על ידי הלקוח' : 'לחתימה', tone: v.kind === 'final' ? 'done' : v.kind === 'client_signed' ? 'wait' : 'neutral' }}
      load={async () => (v.burnClientSignatures ? composeClientSigned(v) : { ...(await loadDoc(v.documentId)), fileName: v.fileName })}
      overlay={overlay} onPages={onPages} onClose={onClose} />
  );
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
  /** החותמים — לשם בכל מקום חתימה. */
  signers: RepSigner[];
  signatureValues?: Record<string, SignatureValue> | null;
  /** פתיחת עורך מקומות החתימה — הדרך לתקן טופס שחסר בו מקום. */
  onFixPlaces?: () => void;
  ids: IdEntry[];
  loadDoc: (id: string) => Promise<ViewerFile>;
  /** ייפוי כוח חתום על ידי הלקוח — מורכב לתצוגה. */
  composeClientSigned: (v: PoaVersion) => Promise<ViewerFile>;
  /** תמונה שהדפדפן לא מציג (HEIC) ⇒ גרסה מפוענחת לתצוגה (תמונה לכל עמוד). */
  displayable: (f: ViewerFile) => Promise<ViewerFile[]>;
  onRetry: (buildId: string) => void;
  onDecide?: (build: PdfBuild, decision: 'approve' | 'reject' | 'reopen') => Promise<void>;
  /** מחשב המשרד מחובר (null — לא ידוע). */
  officeOnline?: boolean | null;
  onRegenerateFinal?: () => void;
  regeneratingFinal?: boolean;
}

type Open = { title: string; caption?: string; badge?: { text: string; tone: 'done' | 'wait' | 'neutral' }; load: () => Promise<ViewerFile | ViewerFile[]> };

const isPdfName = (n?: string) => !!n && /\.pdf$/i.test(n);
const extOf = (n?: string) => (n?.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase().replace('JPEG', 'JPG');
const pagesText = (n?: number | null) => (n ? (n === 1 ? 'עמוד אחד' : `${n} עמודים`) : '');

type Tone = 'done' | 'wait' | 'attention' | 'danger';

export function pdfLine(e: IdEntry, officeOnline?: boolean | null): { text: string; tone?: Tone; next?: string; retry?: boolean } {
  if (e.sources.length === 1 && isPdfName(e.sources[0].fileName)) return { text: 'הקובץ הוא PDF', tone: 'done' };
  const b = e.build;
  if (!b) return { text: 'ה-PDF יוכן אוטומטית', tone: 'wait' };
  if (b.status === 'ready') {
    const pages = pagesText(b.pageCount);
    switch (b.submissionState) {
      case 'review':
        return {
          text: b.submissionSameFile ? 'ה-PDF נדחס — לבדיקתך'
            : b.submissionMode === 'downscaled' ? 'גרסת ההגשה הוקטנה — לבדיקתך' : 'גרסת ההגשה נדחסה — לבדיקתך',
          tone: 'attention',
          next: b.submissionSameFile
            ? 'הצילום גדול מדי לשמירה כ-PDF בלי אובדן, ולכן נשמר דחוס. בדקו בהשוואה שהטקסט הקטן קריא: אם כן — לאשר; אם לא — לבקש צילום טוב יותר. עד ההחלטה ההגשה ממתינה.'
            : 'הקובץ המקורי גדול ממגבלת ההעלאה של שע״ם. בדקו בהשוואה שהטקסט הקטן קריא: אם כן — לאשר; אם לא — לבקש צילום טוב יותר. עד ההחלטה ההגשה ממתינה.',
        };
      case 'approved':
        return { text: `PDF מוכן${pages ? ` · ${pages}` : ''} · להגשה: ${b.submissionMode === 'downscaled' ? 'מוקטן' : 'דחוס'}, אישרת שקריא`, tone: 'done' };
      case 'rejected':
        return {
          text: 'סימנת שצריך צילום טוב יותר — אין PDF להגשה', tone: 'danger',
          next: 'להחליף את הצילום (מהתיק, או לבקש מהלקוח צילום רגיל בטלפון). אפשר לבטל את ההחלטה בהשוואה.',
        };
      default:
        return { text: `PDF מוכן${pages ? ` · ${pages}` : ''}`, tone: 'done' };
    }
  }
  if (b.status === 'pending') return { text: 'מכין PDF…', tone: 'wait' };
  if (b.status === 'needs_worker') {
    if (b.errorCode === 'transient' && b.errorMessage) return { text: 'ממיר במחשב המשרד — ניסיון נוסף בקרוב', tone: 'wait', next: b.errorMessage };
    return officeOnline === false
      ? { text: 'ממתין למחשב המשרד', tone: 'wait', next: 'מחשב המשרד לא מחובר כרגע. ההמרה תתבצע אוטומטית כשיתחבר — אין צורך להשאיר את הדף פתוח.' }
      : { text: 'ממיר במחשב המשרד…', tone: 'wait' };
  }
  return { text: `לא ניתן להכין PDF: ${b.errorMessage ?? 'שגיאה'}`, tone: 'danger', next: b.errorNext ?? undefined, retry: true };
}

export default function RepDocuments({
  poa, signers, signatureValues, onFixPlaces, ids, loadDoc, composeClientSigned, displayable, onRetry, onDecide, officeOnline, onRegenerateFinal, regeneratingFinal,
}: Props) {
  const [open, setOpen] = useState<Open | null>(null);
  const [openPoa, setOpenPoa] = useState<PoaEntry | null>(null);
  const [compare, setCompare] = useState<{ title: string; build: PdfBuild } | null>(null);
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
              {p.version?.kind !== 'final' && p.placesLine && (
                <div className="rc-doc-line rc-doc-muted" data-testid="rc-doc-places">מקומות חתימה: {p.placesLine}</div>
              )}
              {p.version?.kind !== 'final' && p.problems && p.problems.length > 0 && (
                <div className="rc-doc-next" data-tone="danger" data-testid="rc-doc-problems">
                  {p.problems.map((t, i) => <div key={i}>{t}</div>)}
                </div>
              )}
            </div>
            {p.version && (
              <div className="rc-doc-acts">
                <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-view-poa" onClick={() => setOpenPoa(p)}>
                  צפייה בייפוי הכוח
                </button>
                {p.version.kind !== 'final' && p.problems && p.problems.length > 0 && onFixPlaces && (
                  <button type="button" className="btn btn-primary btn-sm" data-testid="rc-fix-places" onClick={onFixPlaces}>תיקון מקומות החתימה</button>
                )}
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
          const pl = pdfLine(e, officeOnline);
          const b = e.build;
          const separate = hasSeparateSubmission(b);
          const images = e.sources.filter(s => !isPdfName(s.fileName));
          const kinds = [...new Set(images.map(s => extOf(s.fileName)).filter(Boolean))].join('/');
          const photoText = e.sources.length > 1 ? `${e.sources.length} צילומים${kinds ? ` (${kinds})` : ''}` : `צילום${kinds ? ` ${kinds}` : ''}`;
          return (
            <div key={e.key} className="rc-doc" data-testid="rc-doc-id" data-pdf={b?.status ?? 'none'} data-submission={b?.submissionState ?? 'none'}>
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
                {b?.status === 'ready' && b.notes.length > 0 && <div className="rc-doc-next">{b.notes.join(' ')}</div>}
              </div>
              <div className="rc-doc-acts">
                {b?.submissionState === 'review' && onDecide && (
                  <button type="button" className="btn btn-primary btn-sm" data-testid="rc-compare"
                    onClick={() => setCompare({ title: `${e.name} · השוואה`, build: b })}>
                    השוואה והחלטה
                  </button>
                )}
                <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-view-photo"
                  onClick={() => setOpen({
                    title: `${e.name} · ${e.sources.length > 1 ? 'הצילומים' : 'הצילום'}`,
                    caption: e.sources.length > 1 ? 'הקבצים המקוריים, לפי סדר העמודים.' : 'הקובץ המקורי שהועלה.',
                    load: async () => (await Promise.all(e.sources.map(async s => displayable(await loadDoc(s.documentId))))).flat(),
                  })}>
                  {e.sources.length > 1 ? 'צילומים' : 'צילום'}
                </button>
                {b?.status === 'ready' && (
                  <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-view-pdf"
                    onClick={() => setOpen({
                      title: `${e.name} · PDF`,
                      caption: separate
                        ? `ה-PDF באיכות המקור${b.pageCount ? ` · ${pagesText(b.pageCount)}` : ''}. להגשה לשע״ם משמשת גרסה נפרדת וקטנה יותר (ראו «השוואה»).`
                        : `ה-PDF שנוצר מ${e.sources.length > 1 ? 'הצילומים' : 'הצילום'}${b.pageCount ? ` · ${pagesText(b.pageCount)}` : ''}. זה הקובץ שיוגש לשע״ם${e.confirmed ? '' : ' אחרי שהלקוח יאשר'}.`,
                      badge: { text: separate ? 'איכות המקור' : 'PDF לשע״ם', tone: 'neutral' },
                      load: () => loadDoc(b.id),
                    })}>
                    PDF
                  </button>
                )}
                {(separate || b?.submissionSameFile) && b && b.submissionState !== 'review' && (
                  <button type="button" className="rc-quiet" data-testid="rc-compare"
                    onClick={() => setCompare({ title: `${e.name} · השוואה`, build: b })}>
                    השוואה
                  </button>
                )}
                {pl.retry && b && (
                  <button type="button" className="rc-quiet" onClick={() => onRetry(b.id)}>נסה שוב</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {openPoa && (
        <PoaViewer entry={openPoa} signers={signers} values={signatureValues} loadDoc={loadDoc}
          composeClientSigned={composeClientSigned} onClose={() => setOpenPoa(null)} />
      )}
      {open && <DocumentViewerDialog title={open.title} caption={open.caption} badge={open.badge} load={open.load} onClose={() => setOpen(null)} />}
      {compare && (
        <PdfCompareDialog title={compare.title} build={compare.build} loadDoc={loadDoc}
          onDecide={onDecide ? d => onDecide(compare.build, d) : undefined} onClose={() => setCompare(null)} />
      )}
    </section>
  );
}

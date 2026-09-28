// ─── 208 · מה שע״ם דורשת לבקשה — לפני השליחה לחתימה ─────────────────────────
// ‼ רשימה אחת להגשה: כל מסמך ששע״ם כתבה ביצירה («בהמשך תתבקש לצרף»), של מי,
// ובאיזה מצב — חסר / יש בתיק וממתין לאישור הלקוח / אושר. «יש בתיק» אינו אישור.
// ‼ צילום (JPG/PNG) — שע״ם מקבלת רק PDF. «הכן PDF» בונה אותו עכשיו, לצד המקור,
// ובודק שהוא תקין ובגבול של שע״ם; כשל מוצג כאן ולא מגיע לשידור.

import { useState } from 'react';
import type { ShaamPreSigningDoc } from '../features/representation/shaamPreSigningDocs';
import { useDocumentDB } from '../hooks/useIndexedDB';
import { ensurePdfVersion } from '../utils/documentPdf';
import IdentityDocAttach from './IdentityDocAttach';

interface Props {
  items: ShaamPreSigningDoc[];
  /** כותרת ההגשה, כשיש יותר מאחת (בני זוג). */
  title?: string;
  clientId?: string;
  /** לצירוף צילום שכבר בתיק לאדם (בלי ⇒ בלי כלי צירוף). */
  requestId?: string;
  usedDocumentIds?: string[];
  onChanged?: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  to_sign: 'var(--ink-2)',
  signed: 'var(--success, #1f7a3d)',
  missing: 'var(--orange, #b45309)',
  awaiting_confirmation: 'var(--orange, #b45309)',
  confirmed: 'var(--success, #1f7a3d)',
  manual: 'var(--ink-2)',
};

const isPdfName = (n?: string) => !!n && /\.pdf$/i.test(n);
const sizeText = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))}KB` : `${(b / 1048576).toFixed(1)}MB`);

export default function ShaamPreSigningDocsList({ items, title, clientId, requestId, usedDocumentIds, onChanged }: Props) {
  const db = useDocumentDB();
  const [pdf, setPdf] = useState<Record<string, { busy?: boolean; ok?: string; err?: string }>>({});
  if (items.length === 0) return null;

  async function makePdf(d: ShaamPreSigningDoc) {
    if (!clientId) return;
    setPdf(p => ({ ...p, [d.key]: { busy: true } }));
    const res = await ensurePdfVersion(db, clientId, d.documents.map(x => x.documentId), {
      fileName: `תעודה מזהה - ${d.personName} (PDF לשע״ם).pdf`,
    });
    setPdf(p => ({
      ...p,
      [d.key]: res.ok
        ? { ok: `PDF מוכן לשע״ם: ${res.doc.fileName}${res.pageCount ? ` · ${res.pageCount} עמ׳` : ''} · ${sizeText(res.doc.fileSize)}${res.created ? '' : ' (כבר היה)'}` }
        : { err: res.error },
    }));
  }

  return (
    <div data-testid="shaam-presign-docs" style={{ fontSize: 'var(--fs-13)', lineHeight: 1.7, marginTop: '.4rem' }}>
      <div style={{ fontWeight: 600 }}>
        מה רשות המסים דורשת לבקשה הזאת{title ? ` · ${title}` : ''}
      </div>
      {items.map(d => {
        const images = d.documents.filter(x => !isPdfName(x.fileName));
        const st = pdf[d.key];
        return (
          <div key={d.key} data-testid="shaam-presign-doc" data-status={d.status} style={{ marginTop: '.2rem' }}>
            {/* ‼ התווית היא הנוסח של שע״ם («… של הלקוח») — השם נוסף לידה, לא בתוכה. */}
            · {d.label}{d.kind !== 'poa' && d.personName ? <> · <b>{d.personName}</b></> : null}
            {' - '}<span style={{ color: STATUS_COLOR[d.status] }}>{d.statusText}</span>
            {d.documents.length > 1 && (
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', paddingInlineStart: '.8rem' }}>
                {d.documents.map((x, i) => `עמוד ${i + 1}: ${x.fileName || 'צילום'}`).join(' · ')}
              </div>
            )}
            {/* ‼ צילום שכבר הגיע למשרד (וואטסאפ וכד') — שיוך לאדם. אחרי השיוך הלקוח עדיין מתבקש לאשר. */}
            {d.status === 'missing' && clientId && requestId && (
              <div style={{ paddingInlineStart: '.8rem' }}>
                <IdentityDocAttach
                  requestId={requestId} clientId={clientId}
                  missing={[{ person: d.person, name: d.personName, kind: d.kind === 'passport' ? 'passport' : 'idOrLicense' }]}
                  usedDocumentIds={usedDocumentIds}
                  onAttached={() => onChanged?.()}
                />
              </div>
            )}
            {clientId && images.length > 0 && d.status !== 'missing' && (
              <div style={{ paddingInlineStart: '.8rem' }}>
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                  צילום - שע״ם מקבלת רק PDF, והוא יומר לפני השידור.{' '}
                </span>
                {!st?.ok && (
                  <button type="button" className="btn btn-ghost btn-sm" data-testid="shaam-presign-pdf"
                    disabled={!!st?.busy} style={{ padding: '0 .25rem', fontSize: 'var(--fs-12)' }}
                    onClick={() => void makePdf(d)}>
                    {st?.busy ? 'ממיר…' : 'הכן PDF עכשיו'}
                  </button>
                )}
                {st?.ok && <div data-testid="shaam-presign-pdf-ok" style={{ fontSize: 'var(--fs-12)', color: 'var(--success, #1f7a3d)' }}>✓ {st.ok}</div>}
                {st?.err && <div data-testid="shaam-presign-pdf-err" className="rep-track-next-err">{st.err} השידור לשע״ם ייעצר על המסמך הזה עד שיוחלף בצילום תקין.</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// חתימה וחותמת — העלאה, החלפה והסרה. משמש את «פרטי המשרד» (ProfilePage).
//
// ‼ שניהם בדלי פרטי: נשמר נתיב בלבד, והתצוגה נפתרת בהורדה מאומתת.
// ‼ החלפה/הסרה משנות את הטיוטה בלבד. הקובץ הקודם נמחק רק אחרי שמירה שהצליחה.
import { useEffect, useState } from 'react';
import type { FirmProfile, FirmBranding } from '../../../types/firmProfile';
import { FIRM_PRIVATE_BUCKET, downloadPrivateDataUrl } from '../../../utils/privateAsset';
import { assetRef, type AssetRef } from '../officeModel';
import { imageProblem, uniquePath, uploadFile } from '../assets';

type Kind = 'signature' | 'stamp';

const FIELDS: Record<Kind, { path: keyof FirmBranding; url: keyof FirmBranding; prefix: string }> = {
  signature: { path: 'signaturePath', url: 'signatureUrl', prefix: 'signature' },
  stamp: { path: 'stampPath', url: 'stampUrl', prefix: 'stamp' },
};

export function usePrivateImage(path?: string) {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    setSrc(undefined);
    downloadPrivateDataUrl(path).then(s => { if (!cancelled) setSrc(s); });
    return () => { cancelled = true; };
  }, [path]);
  return src;
}

export function AssetSlot({ kind, draft, saved, setDraft, noteUpload }: {
  kind: Kind; draft: FirmProfile; saved: FirmProfile;
  setDraft: React.Dispatch<React.SetStateAction<FirmProfile>>;
  noteUpload: (r: AssetRef) => void;
}) {
  const f = FIELDS[kind];
  const path = draft.branding[f.path] as string | undefined;
  const savedPath = saved.branding[f.path] as string | undefined;
  const src = usePrivateImage(path);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const noun = kind === 'signature' ? 'חתימה' : 'חותמת';
  const pending = path !== savedPath;

  async function onFile(file: File) {
    setErr(null);
    const problem = imageProblem(file);
    if (problem) { setErr(problem); return; }
    setBusy(true);
    const p = uniquePath(draft.id, f.prefix, file);
    const upErr = await uploadFile(FIRM_PRIVATE_BUCKET, p, file);
    setBusy(false);
    if (upErr) { setErr(`ההעלאה נכשלה: ${upErr}`); return; }
    noteUpload(assetRef(FIRM_PRIVATE_BUCKET, p));
    // דלי פרטי — נתיב בלבד, בלי כתובת ציבורית.
    setDraft(d => ({ ...d, branding: { ...d.branding, [f.url]: undefined, [f.path]: p } }));
  }

  function remove() {
    setErr(null);
    setDraft(d => ({ ...d, branding: { ...d.branding, [f.url]: undefined, [f.path]: undefined } }));
  }

  return (
    <div className="of-asset">
      <div className={`of-asset-box${kind === 'stamp' ? ' is-square' : ''}`}>
        {src ? <img src={src} alt={noun} />
          : path ? <span className="of-muted">טוען…</span>
            : <span className="of-muted">אין {noun}</span>}
      </div>
      <div className="of-asset-acts">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className={`btn btn-secondary btn-sm${busy ? ' is-busy' : ''}`} style={{ cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'מעלה…' : path ? `החלפת ${noun}` : `העלאת ${noun}`}
            <input type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={busy}
              onChange={e => { const file = e.target.files?.[0]; if (file) void onFile(file); e.target.value = ''; }} />
          </label>
          {path && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>הסרה</button>
          )}
        </div>
        {pending && (
          <span className="of-tag is-pending">
            {path ? 'נכנס לשימוש אחרי שמירה' : 'יוסר אחרי שמירה'}
          </span>
        )}
        <span className="of-muted">PNG · JPG · SVG · WEBP · עד 2MB</span>
        {err && <span className="of-field-hint is-error" role="alert">{err}</span>}
      </div>
    </div>
  );
}

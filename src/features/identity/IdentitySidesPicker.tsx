// ─── בוחר צדדי תעודה — מצלמה / גלריה / קובץ, תצוגה מקדימה, החלפה, אישור ⇒ PDF אחד ──
// ‼ ראה idSides.ts. משמש את הדף האישי, את טופס הייצוג ואת כרטיס הלקוח במשרד.
// ‼ שני קלטי קובץ לכל משבצת, בכוונה: «צילום» (capture — המצלמה ישירות בטלפון) ו«מהגלריה
// או קובץ» (בלי capture). קלט אחד עם capture הכריח מצלמה ולא נתן לבחור תמונה קיימת.
import { useEffect, useId, useRef, useState } from 'react';
import {
  ID_SLOT_LABELS, buildIdPdf, canPreviewInBrowser, defaultIdMode, idMissingText, idOrderedFiles, idReady, idSlotsFor,
  IdPdfError, isPdfFile, type IdDocKind, type IdMode, type IdParts, type IdSlot,
} from './idSides';

export interface IdentitySidesPickerTone { ink: string; muted: string; border: string; accent: string; radius: number | string }

const OFFICE_TONE: IdentitySidesPickerTone = {
  ink: 'var(--ink-1, #1d1d1b)', muted: 'var(--ink-3, #6b6b68)', border: 'var(--line, #e3e2dd)',
  accent: 'var(--accent, #2f5d8a)', radius: 8,
};

export interface IdentitySidesPickerProps {
  kind: IdDocKind;
  /** שם הקובץ שנבנה (בלי .pdf) — «תעודת זהות - אמיר». */
  fileName: string;
  /** מה קורה באישור — העלאה לשרת. מחזיר הודעת שגיאה, או null כשהצליח. */
  onConfirm: (pdf: File) => Promise<string | null>;
  onCancel?: () => void;
  disabled?: boolean;
  /** מגבלת השרת לקובץ. ברירת מחדל: 10MB (הדף האישי וטופס הייצוג). */
  maxBytes?: number;
  tone?: IdentitySidesPickerTone;
  confirmLabel?: string;
}

export default function IdentitySidesPicker({
  kind, fileName, onConfirm, onCancel, disabled, maxBytes = 10 * 1024 * 1024, tone = OFFICE_TONE, confirmLabel = 'אישור ושליחה',
}: IdentitySidesPickerProps) {
  const uid = useId();
  const [mode, setMode] = useState<IdMode>(defaultIdMode(kind));
  const [parts, setParts] = useState<IdParts>({});
  const [busy, setBusy] = useState<'pdf' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  function put(slot: IdSlot, file: File | undefined) {
    setError(null);
    setParts(p => {
      const old = p[slot]?.previewUrl;
      if (old) URL.revokeObjectURL(old);
      if (!file) { const n = { ...p }; delete n[slot]; return n; }
      const previewUrl = canPreviewInBrowser(file) ? URL.createObjectURL(file) : undefined;
      if (previewUrl) urls.current.push(previewUrl);
      return { ...p, [slot]: { file, previewUrl } };
    });
  }

  async function confirm() {
    if (!idReady(mode, parts) || busy || disabled) return;
    setError(null);
    setBusy('pdf');
    let pdf: File;
    try {
      pdf = await buildIdPdf(idOrderedFiles(mode, parts), { name: fileName, maxBytes });
    } catch (e) {
      setBusy(null);
      setError(e instanceof IdPdfError ? e.message : 'לא הצלחנו להכין את הקובץ.');
      return;
    }
    setBusy('send');
    const err = await onConfirm(pdf);
    setBusy(null);
    if (err) setError(err);
  }

  const slots = idSlotsFor(kind, mode);
  const ready = idReady(mode, parts);
  const missing = idMissingText(mode, parts, kind);
  const off = !!disabled || !!busy;
  const btn = (primary: boolean): React.CSSProperties => ({
    font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 40, padding: '8px 12px', borderRadius: tone.radius,
    fontSize: 13.5, fontWeight: 600, cursor: off ? 'default' : 'pointer', opacity: off ? .6 : 1,
    border: primary ? 'none' : `1px solid ${tone.border}`, background: primary ? tone.accent : '#fff',
    color: primary ? '#fff' : tone.ink,
  });
  const link: React.CSSProperties = {
    font: 'inherit', background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: tone.muted,
    textDecoration: 'underline', cursor: off ? 'default' : 'pointer',
  };

  return (
    <div data-testid="id-sides-picker" style={{ display: 'grid', gap: 10, marginTop: 6 }}>
      {kind !== 'passport' && (
        <div style={{ fontSize: 12.5, color: tone.muted }}>
          {mode === 'sides'
            ? <>מצרפים כל צד בנפרד - מצילום, מהגלריה או מקובץ. <button type="button" style={link} disabled={off}
                onClick={() => { setMode('single'); setError(null); }}>יש לי קובץ אחד עם שני הצדדים</button></>
            : <>קובץ אחד שכבר מכיל את שני הצדדים. <button type="button" style={link} disabled={off}
                onClick={() => { setMode('sides'); setError(null); }}>לצרף כל צד בנפרד</button></>}
        </div>
      )}

      {slots.map(slot => {
        const part = parts[slot];
        const optional = slot === 'extra';
        return (
          <div key={slot} data-slot={slot} style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 10,
            border: `1px ${part ? 'solid' : 'dashed'} ${tone.border}`, borderRadius: tone.radius, background: '#fff',
          }}>
            <div style={{
              width: 76, height: 52, flexShrink: 0, borderRadius: 6, overflow: 'hidden', display: 'grid', placeItems: 'center',
              background: '#f4f3ef', color: tone.muted, fontSize: 20,
            }} aria-hidden="true">
              {part?.previewUrl
                ? <img src={part.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : part ? (isPdfFile(part.file) ? '📄' : '🖼') : (slot === 'back' ? '↩' : '🪪')}
            </div>
            <div style={{ flex: 1, minWidth: 140, display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: tone.ink }}>
                {kind === 'passport' && slot === 'single' ? 'עמוד התמונה בדרכון' : ID_SLOT_LABELS[slot]}
              </span>
              <span style={{ fontSize: 12, color: part ? '#2E7D53' : tone.muted, overflowWrap: 'anywhere' }}>
                {part ? `✓ ${part.file.name}` : optional ? 'אם יש' : 'עוד לא צורף'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <label style={btn(false)} aria-disabled={off}>
                📷 {part ? 'צילום מחדש' : 'צילום'}
                <input type="file" accept="image/*" capture="environment" disabled={off} style={{ display: 'none' }}
                  data-testid={`id-${slot}-camera`} aria-describedby={`${uid}-hint`}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) put(slot, f); }} />
              </label>
              <label style={btn(false)} aria-disabled={off}>
                🖼 {part ? 'החלפה' : 'מהגלריה או קובץ'}
                <input type="file" accept="image/*,application/pdf" disabled={off} style={{ display: 'none' }}
                  data-testid={`id-${slot}-file`} aria-describedby={`${uid}-hint`}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) put(slot, f); }} />
              </label>
              {part && (
                <button type="button" style={link} disabled={off} onClick={() => put(slot, undefined)}>הסרה</button>
              )}
            </div>
          </div>
        );
      })}

      <div id={`${uid}-hint`} style={{ fontSize: 12, color: tone.muted, lineHeight: 1.5 }}>
        {mode === 'sides' && kind !== 'passport'
          ? 'אפשר לצרף צד אחד עכשיו ואת השני אחר כך. שום דבר לא נשלח עד האישור - ואז הצדדים נשמרים כקובץ PDF אחד.'
          : 'שום דבר לא נשלח עד האישור. תמונה נשמרת כקובץ PDF.'}
      </div>
      {missing && <div role="status" style={{ fontSize: 12.5, color: '#6B5A2E', fontWeight: 600 }}>{missing}</div>}
      {error && <div role="alert" style={{ fontSize: 12.5, color: '#a63a3a', fontWeight: 600 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={{ ...btn(true), opacity: !ready || off ? .55 : 1 }} disabled={!ready || off}
          data-testid="id-confirm" onClick={() => void confirm()}>
          {busy === 'pdf' ? 'מכין PDF…' : busy === 'send' ? 'שולח…' : confirmLabel}
        </button>
        {onCancel && <button type="button" style={link} disabled={!!busy} onClick={onCancel}>ביטול</button>}
      </div>
    </div>
  );
}

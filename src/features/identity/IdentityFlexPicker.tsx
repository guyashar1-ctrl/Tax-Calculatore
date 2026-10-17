// ─── העלאת תעודה גמישה — אזור אחד, תיוג לכל תמונה, בדיקת שלמות ⇒ PDF אחד (גיא, 16.10.2026) ──
// ‼ הכללים ב-idFlex.ts. מחליף את שלוש התיבות הקבועות (536e4c2): «צלמו או העלו איך שנוח — תמונה
//   אחת של הכול, או כמה». אחרי כל תמונה: תמונה ממוזערת + בחירה סגורה מה היא, עם ברירת מחדל לפי
//   הסדר; «אישור ושליחה» רק כשהסט שלם, ועד אז שבב «עוד חסר: …».
// ‼ שני קלטי קובץ, בכוונה: «צילום» (capture — המצלמה בטלפון) ו«מהגלריה או קובץ» (בלי capture, כמה
//   יחד). קלט אחד עם capture הכריח מצלמה ולא נתן לבחור תמונה קיימת.
// ‼ שום דבר לא נשלח עד האישור; אז התמונות הופכות ל-PDF אחד לפי סדר העמודים, וההרכב (מה כל עמוד)
//   נמסר יחד איתו — נשמר ליד הרשומה, כדי שבמשרד יראו מה הגיע ואיך.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildIdPdf, canPreviewInBrowser, IdPdfError, isPdfFile } from './idSides';
import {
  completeText, defaultTag, idSetComplete, missingText, orderForPdf, partsManifest, setKindFor, tagOptions,
  type IdDocKind, type IdPartsManifest, type IdSetKind, type IdTag,
} from './idFlex';
import { rotateImage } from './rotateImage';
import './idFlex.css';

/** המותג של המשרד בדף הלקוח / בטופס הייצוג. בלי tone — הטוקנים של המערכת (גם במצב כהה). */
export interface IdentityPickerTone {
  ink: string; muted: string; border: string; accent: string; radius: number | string;
  /** רקע הכרטיס והשקע; ברירת מחדל: טוקני המערכת. */
  card?: string; well?: string; accentInk?: string;
}

export interface IdentityFlexPickerProps {
  kind: IdDocKind;
  /** שם הקובץ שנבנה (בלי .pdf) — «תעודת זהות - אמיר». */
  fileName: string;
  /** מה קורה באישור — העלאה לשרת. מחזיר הודעת שגיאה, או null כשהצליח. */
  onConfirm: (pdf: File, manifest: IdPartsManifest) => Promise<string | null>;
  onCancel?: () => void;
  disabled?: boolean;
  /** מגבלת השרת לקובץ. ברירת מחדל: 10MB (הדף האישי וטופס הייצוג). */
  maxBytes?: number;
  tone?: IdentityPickerTone;
  confirmLabel?: string;
}

interface Item { id: string; file: File; tag: IdTag; url?: string; rotation: 0 | 90 | 180 | 270 }
let seq = 0;
const nid = () => `f${Date.now().toString(36)}${(++seq).toString(36)}`;

const LEAD: Record<IdSetKind, string> = {
  idCard: 'צלמו או העלו איך שנוח: תמונה אחת של הכול, או כמה תמונות — צד אחרי צד. צריך שיהיו קדמי, אחורי וספח.',
  driverLicense: 'צלמו או העלו איך שנוח: תמונה אחת של שני הצדדים, או כל צד בנפרד.',
  passport: 'צלמו או העלו את עמוד התמונה בדרכון.',
};

export default function IdentityFlexPicker({
  kind, fileName, onConfirm, onCancel, disabled, maxBytes = 10 * 1024 * 1024, tone, confirmLabel = 'אישור ושליחה',
}: IdentityFlexPickerProps) {
  const uid = useId();
  const [chosen, setChosen] = useState<'idCard' | 'driverLicense'>('idCard');
  const set = setKindFor(kind, chosen);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<'pdf' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const options = useMemo(() => tagOptions(set), [set]);
  const tags = items.map(i => i.tag);
  const complete = idSetComplete(set, tags);
  const missing = missingText(set, tags);
  const off = !!disabled || !!busy;

  function add(files: File[]) {
    setError(null);
    setItems(list => {
      const next = [...list];
      for (const file of files) {
        const url = canPreviewInBrowser(file) ? URL.createObjectURL(file) : undefined;
        if (url) urls.current.push(url);
        // ‼ ברירת המחדל נקבעת לפי מה שכבר צורף, כולל התמונות שנבחרו יחד בפעולה הזו.
        next.push({ id: nid(), file, tag: defaultTag(set, next.map(i => i.tag), file), url, rotation: 0 });
      }
      return next;
    });
  }
  const patch = (id: string, p: Partial<Item>) => setItems(list => list.map(i => (i.id === id ? { ...i, ...p } : i)));
  const remove = (id: string) => { setError(null); setItems(list => list.filter(i => i.id !== id)); };

  /** החלפת סוג התעודה (ת.ז. ⇄ רישיון) — התגים מתורגמים לסט החדש; מה שאין בו הופך ל«קדמי». */
  function chooseKind(k: 'idCard' | 'driverLicense') {
    if (k === chosen) return;
    setChosen(k);
    const allowed = new Set(tagOptions(setKindFor(kind, k)).map(o => o.value));
    setItems(list => list.map(i => (allowed.has(i.tag) ? i : { ...i, tag: 'front' as IdTag })));
  }

  async function confirm() {
    if (!complete || off) return;
    setError(null);
    setBusy('pdf');
    const ordered = orderForPdf(items);
    let pdf: File;
    try {
      const files = await Promise.all(ordered.map(i => rotateImage(i.file, i.rotation)));
      pdf = await buildIdPdf(files, { name: fileName, maxBytes });
    } catch (e) {
      setBusy(null);
      // ‼ כשל בבנייה לא שולח דבר ולא מוחק: התמונות נשארות, אפשר להחליף את הבעייתית ולנסות שוב.
      setError(`${e instanceof IdPdfError ? e.message : 'לא הצלחנו להכין את הקובץ.'} התמונות שצורפו נשארו כאן.`);
      return;
    }
    setBusy('send');
    const manifest = partsManifest(set, ordered.map(i => ({ tag: i.tag, name: i.file.name, type: i.file.type, size: i.file.size, rotation: i.rotation })));
    const err = await onConfirm(pdf, manifest);
    setBusy(null);
    if (err) setError(err);
  }

  const style = tone ? ({
    '--idf-ink': tone.ink, '--idf-muted': tone.muted, '--idf-border': tone.border, '--idf-accent': tone.accent,
    '--idf-radius': typeof tone.radius === 'number' ? `${tone.radius}px` : tone.radius,
    ...(tone.card ? { '--idf-card': tone.card } : {}), ...(tone.well ? { '--idf-well': tone.well } : {}),
    ...(tone.accentInk ? { '--idf-accent-ink': tone.accentInk } : {}),
  } as React.CSSProperties) : undefined;

  const inputs = (
    <div className="idf-add">
      <label className="idf-btn" aria-disabled={off}>📷 צילום
        <input type="file" accept="image/*" capture="environment" disabled={off} hidden data-testid="idf-camera"
          aria-describedby={`${uid}-hint`}
          onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) add(f); }} />
      </label>
      <label className="idf-btn" aria-disabled={off}>🖼 מהגלריה או קובץ
        <input type="file" accept="image/*,application/pdf" multiple disabled={off} hidden data-testid="idf-file"
          aria-describedby={`${uid}-hint`}
          onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) add(f); }} />
      </label>
    </div>
  );

  return (
    <div className={`idf${items.length ? ' has' : ''}`} data-testid="id-flex-picker" data-set={set} data-complete={complete ? '1' : '0'} style={style}>
      <p className="idf-lead">{LEAD[set]}</p>
      {kind === 'idOrLicense' && (
        <div className="idf-kind" role="group" aria-label="איזו תעודה מצלמים">
          <span>מה מצלמים?</span>
          <button type="button" aria-pressed={chosen === 'idCard'} disabled={off} onClick={() => chooseKind('idCard')}>תעודת זהות</button>
          <button type="button" aria-pressed={chosen === 'driverLicense'} disabled={off} onClick={() => chooseKind('driverLicense')}>רישיון נהיגה</button>
        </div>
      )}

      <div className="idf-drop">
        {items.length === 0 && <p className="idf-drop-text">עוד לא צורף כלום. אפשר מהמצלמה, מהגלריה או קובץ PDF.</p>}
        {items.length > 0 && (
          <ul className="idf-files" aria-label="התמונות שצורפו">
            {items.map(i => (
              <li key={i.id} className="idf-file" data-tag={i.tag}>
                <span className="idf-thumb" aria-hidden="true" style={i.rotation ? { transform: `rotate(${i.rotation}deg)` } : undefined}>
                  {i.url ? <img src={i.url} alt="" /> : isPdfFile(i.file) ? '📄' : '🖼'}
                </span>
                <span className="idf-file-main">
                  {options.length > 0 ? (
                    <label className="idf-tag">
                      <span>מה בתמונה?</span>
                      <select value={i.tag} disabled={off} data-testid="idf-tag" aria-label={`מה בתמונה — ${i.file.name}`}
                        onChange={e => patch(i.id, { tag: e.target.value as IdTag })}>
                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  ) : <span className="idf-tag"><span>עמוד התמונה</span></span>}
                  <span className="idf-name">{i.file.name}</span>
                </span>
                <span className="idf-acts">
                  {i.url && <button type="button" className="idf-link" disabled={off} aria-label={`סיבוב ${i.file.name}`}
                    onClick={() => patch(i.id, { rotation: ((i.rotation + 90) % 360) as Item['rotation'] })}>↻ סיבוב</button>}
                  <button type="button" className="idf-link" disabled={off} onClick={() => remove(i.id)}>הסרה</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {inputs}
      </div>

      {missing && <div role="status" className="idf-chip warn" data-testid="idf-missing">{missing}</div>}
      {complete && <div role="status" className="idf-chip ok" data-testid="idf-complete">✓ {completeText(set)}</div>}
      <p id={`${uid}-hint`} className="idf-hint">
        {set === 'passport'
          ? 'שום דבר לא נשלח עד האישור. התמונה נשמרת כקובץ PDF.'
          : 'שום דבר לא נשלח עד האישור — ואז הכול נשמר כקובץ PDF אחד, לפי הסדר: קדמי, אחורי, ספח.'}
      </p>
      {error && <div role="alert" className="idf-err">{error}</div>}

      <div className="idf-confirm">
        <button type="button" className="idf-btn primary" disabled={!complete || off} data-testid="id-confirm" onClick={() => void confirm()}>
          {busy === 'pdf' ? 'מכין PDF…' : busy === 'send' ? 'שולח…' : confirmLabel}
        </button>
        {onCancel && <button type="button" className="idf-link" disabled={!!busy} onClick={onCancel}>ביטול</button>}
      </div>
    </div>
  );
}

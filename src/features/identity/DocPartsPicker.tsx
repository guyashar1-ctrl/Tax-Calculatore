// ─── מסמך אחד מכמה קבצים — אזורי העלאה מסומנים, תצוגה מקדימה, החלפה, סדר וסיבוב ⇒ PDF אחד ─────
// ‼ ראו docParts.ts. הרחבה של IdentitySidesPicker (536e4c2) לשאלון: אותו בניית PDF (buildIdPdf), אותם שני
//   קלטים לכל אזור («צילום» עם מצלמה ו«מהגלריה או קובץ» בלי) — קלט אחד עם capture הכריח מצלמה.
// ‼ «כמה תמונות יחד»: כל תמונה נכנסת ל«לשיוך» ובוחרים לה חלק אחד (בחירה יחידה). שליחה רק כשהכול משויך.
// ‼ התקדמות חלקית נשמרת במכשיר (partsStore.ts). כשל בבניית ה-PDF או בהעלאה — החלקים נשארים, ואין «נשלח».

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildIdPdf, canPreviewInBrowser, IdPdfError, isPdfFile } from './idSides';
import { orderedParts, partsFor, partsManifest, partsMissing, type PartFile, type PartsMode } from './docParts';
import { clearParts, loadParts, saveParts } from './partsStore';
import './docParts.css';

export interface DocPartsPickerProps {
  docKind: string;
  /** שם הקובץ שנבנה (בלי .pdf). */
  fileName: string;
  /** מפתח לשמירה במכשיר (בקשה + שאלה). בלי מפתח — לא נשמר. */
  storeKey?: string;
  /** אישור ⇒ העלאה. מחזיר הודעת שגיאה, או null כשהצליח. */
  onConfirm: (pdf: File, manifest: ReturnType<typeof partsManifest>) => Promise<string | null>;
  disabled?: boolean;
  maxBytes?: number;
  confirmLabel?: string;
}

type Item = PartFile & { file: File; url?: string };
let seq = 0;
const nid = () => `p${Date.now().toString(36)}${(++seq).toString(36)}`;

async function rotateImage(f: File, deg: number): Promise<File> {
  if (!deg || !canPreviewInBrowser(f)) return f;
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const swap = deg === 90 || deg === 270;
  const c = document.createElement('canvas');
  c.width = swap ? bmp.height : bmp.width; c.height = swap ? bmp.width : bmp.height;
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2); g.rotate((deg * Math.PI) / 180); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.95));
  return blob ? new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
}

export default function DocPartsPicker({ docKind, fileName, storeKey, onConfirm, disabled, maxBytes = 10 * 1024 * 1024, confirmLabel = 'אישור ושליחה' }: DocPartsPickerProps) {
  const spec = useMemo(() => partsFor(docKind), [docKind]);
  const uid = useId();
  const [mode, setMode] = useState<PartsMode>('parts');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<'pdf' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  const mk = (file: File, slot: string, rotation?: number, id?: string): Item => {
    const url = canPreviewInBrowser(file) ? URL.createObjectURL(file) : undefined;
    if (url) urls.current.push(url);
    return { id: id ?? nid(), slot, name: file.name, type: file.type, size: file.size, rotation: (rotation as Item['rotation']) ?? 0, file, url };
  };

  // שחזור מהמכשיר — פעם אחת
  useEffect(() => {
    let live = true;
    if (!storeKey) { setRestored(true); return; }
    void loadParts(storeKey).then(s => {
      if (!live) return;
      if (s && s.files.length) { setMode(s.mode); setItems(s.files.map(x => mk(x.file, x.slot, x.rotation, x.id))); }
      setRestored(true);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  // שמירה במכשיר אחרי כל שינוי (רק אחרי השחזור, כדי לא למחוק לפני שנטען)
  useEffect(() => {
    if (!storeKey || !restored) return;
    if (!items.length) { void clearParts(storeKey); return; }
    void saveParts(storeKey, { mode, files: items.map(i => ({ id: i.id, slot: i.slot, rotation: i.rotation, file: i.file })), savedAt: new Date().toISOString() });
  }, [items, mode, storeKey, restored]);

  const def = (slot: string) => spec.parts.find(p => p.slot === slot);
  const add = (slot: string, files: File[]) => {
    setError(null);
    setItems(list => {
      const d = def(slot);
      // חלק של קובץ אחד (צד קדמי) — קובץ חדש מחליף; חלק של כמה (ספח, עמודים) — מתווסף
      const keep = slot === 'single' || (d && !d.multi) ? list.filter(i => i.slot !== slot) : list;
      const added = (slot === 'single' || (d && !d.multi) ? files.slice(0, 1) : files).map(f => mk(f, slot));
      return [...keep, ...added];
    });
  };
  const patch = (id: string, p: Partial<Item>) => setItems(list => list.map(i => (i.id === id ? { ...i, ...p } : i)));
  const remove = (id: string) => setItems(list => list.filter(i => i.id !== id));
  const move = (id: string, dir: -1 | 1) => setItems(list => {
    const it = list.find(i => i.id === id)!;
    const same = list.filter(i => i.slot === it.slot);
    const k = same.indexOf(it), j = k + dir;
    if (j < 0 || j >= same.length) return list;
    const other = same[j];
    return list.map(i => (i.id === it.id ? other : i.id === other.id ? it : i));
  });

  const current = items.filter(i => (mode === 'single' ? i.slot === 'single' : i.slot !== 'single'));
  const missing = partsMissing(spec, mode, current);
  const off = !!disabled || !!busy;

  async function confirm() {
    if (missing || off) return;
    setError(null);
    setBusy('pdf');
    let pdf: File;
    const ordered = orderedParts(spec, mode, current) as Item[];
    try {
      const files = await Promise.all(ordered.map(i => rotateImage(i.file, i.rotation ?? 0)));
      pdf = await buildIdPdf(files, { name: fileName, maxBytes });
    } catch (e) {
      setBusy(null);
      // ‼ כשל באיחוד לא שולח דבר ולא מוחק: אומרים מה קרה, ושהתמונות שצורפו עדיין כאן
      setError(`${e instanceof IdPdfError ? e.message : 'לא הצלחנו להכין את הקובץ.'} התמונות שצורפו נשמרו — אפשר להסיר או להחליף את התמונה הבעייתית ולנסות שוב.`);
      return;
    }
    setBusy('send');
    const err = await onConfirm(pdf, partsManifest(spec, mode, ordered));
    setBusy(null);
    if (err) { setError(`${err} החלקים נשמרו — אפשר לנסות שוב.`); return; }
    if (storeKey) await clearParts(storeKey);
    setItems([]);
  }

  const inputs = (slot: string, multi: boolean, testid: string) => (
    <div className="dp-add">
      <label className="dp-btn" aria-disabled={off}>📷 צילום
        <input type="file" accept="image/*" capture="environment" disabled={off} hidden data-testid={`${testid}-camera`}
          onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) add(slot, f); }} />
      </label>
      <label className="dp-btn" aria-disabled={off}>🖼 מהגלריה או קובץ
        <input type="file" accept="image/*,application/pdf" multiple={multi} disabled={off} hidden data-testid={`${testid}-file`}
          onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) add(slot, f); }} />
      </label>
    </div>
  );

  const thumb = (i: Item, idx: number, count: number) => (
    <li key={i.id} className="dp-file" data-part-file={i.slot}>
      <span className="dp-thumb" aria-hidden="true" style={i.rotation ? { transform: `rotate(${i.rotation}deg)` } : undefined}>
        {i.url ? <img src={i.url} alt="" /> : isPdfFile(i.file) ? '📄' : '🖼'}
      </span>
      <span className="dp-name">{count > 1 ? `עמוד ${idx + 1} · ` : ''}{i.name}</span>
      <span className="dp-acts">
        {i.slot === 'unassigned' && (
          <select aria-label={`איזה חלק — ${i.name}`} value="" onChange={e => patch(i.id, { slot: e.target.value })}>
            <option value="">לאיזה חלק?</option>
            {spec.parts.map(p => <option key={p.slot} value={p.slot}>{p.label}</option>)}
          </select>
        )}
        {i.url && <button type="button" className="dp-link" disabled={off} onClick={() => patch(i.id, { rotation: (((i.rotation ?? 0) + 90) % 360) as Item['rotation'] })} aria-label={`סיבוב ${i.name}`}>↻ סיבוב</button>}
        {count > 1 && idx > 0 && <button type="button" className="dp-link" disabled={off} onClick={() => move(i.id, -1)} aria-label="הזזה למעלה">↑</button>}
        {count > 1 && idx < count - 1 && <button type="button" className="dp-link" disabled={off} onClick={() => move(i.id, 1)} aria-label="הזזה למטה">↓</button>}
        <button type="button" className="dp-link" disabled={off} onClick={() => remove(i.id)}>הסרה</button>
      </span>
    </li>
  );

  const unassigned = items.filter(i => i.slot === 'unassigned');
  return (
    <div className="dp" data-testid="doc-parts-picker" aria-describedby={`${uid}-hint`}>
      {spec.parts.length > 1 && (
        <div className="dp-mode">
          {mode === 'parts'
            ? <>כל חלק בנפרד — מצילום, מהגלריה או מקובץ. <button type="button" className="dp-link" disabled={off} onClick={() => { setMode('single'); setError(null); }}>יש לי קובץ אחד שמכיל הכול</button></>
            : <>קובץ אחד שמכיל הכול. <button type="button" className="dp-link" disabled={off} onClick={() => { setMode('parts'); setError(null); }}>לצרף כל חלק בנפרד</button></>}
        </div>
      )}

      {mode === 'single' ? (
        <section className="dp-slot" data-slot="single">
          <b className="dp-slot-title">{spec.singleLabel}</b>
          <ul className="dp-files">{current.map((i, k) => thumb(i, k, 1))}</ul>
          {inputs('single', false, 'dp-single')}
        </section>
      ) : (
        <>
          {spec.parts.map(p => {
            const list = items.filter(i => i.slot === p.slot);
            return (
              <section key={p.slot} className={`dp-slot${list.length ? ' has' : ''}`} data-slot={p.slot}>
                <b className="dp-slot-title">{p.label}{!p.required && <span className="dp-opt"> (לא חובה)</span>}</b>
                {p.hint && <span className="dp-hint">{p.hint}</span>}
                {list.length > 0 && <ul className="dp-files">{list.map((i, k) => thumb(i, k, list.length))}</ul>}
                {(p.multi || list.length === 0) && inputs(p.slot, !!p.multi, `dp-${p.slot}`)}
                {!p.multi && list.length > 0 && inputs(p.slot, false, `dp-${p.slot}-replace`)}
              </section>
            );
          })}
          {spec.parts.length > 1 && (
            <section className="dp-slot dp-bulk" data-slot="unassigned">
              <b className="dp-slot-title">כמה תמונות יחד</b>
              <span className="dp-hint">בוחרים כמה תמונות, ולכל אחת — לאיזה חלק היא שייכת.</span>
              {unassigned.length > 0 && <ul className="dp-files">{unassigned.map((i, k) => thumb(i, k, 1))}</ul>}
              <label className="dp-btn" aria-disabled={off}>🖼 בחירת כמה תמונות
                <input type="file" accept="image/*,application/pdf" multiple disabled={off} hidden data-testid="dp-bulk-file"
                  onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) setItems(l => [...l, ...f.map(x => mk(x, 'unassigned'))]); }} />
              </label>
            </section>
          )}
        </>
      )}

      <p id={`${uid}-hint`} className="dp-hint">שום דבר לא נשלח עד האישור — ואז החלקים נשמרים כקובץ PDF אחד, בסדר הזה.{storeKey ? ' מה שכבר צורף נשמר במכשיר הזה, גם אם יוצאים.' : ''}</p>
      {missing && current.length > 0 && <div role="status" className="dp-missing">{missing}</div>}
      {error && <div role="alert" className="ty-err">{error}</div>}
      <div className="dp-confirm">
        <button type="button" className="btn btn-primary" disabled={!!missing || off} data-testid="dp-confirm" onClick={() => void confirm()}>
          {busy === 'pdf' ? 'מכין PDF…' : busy === 'send' ? 'שולח…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

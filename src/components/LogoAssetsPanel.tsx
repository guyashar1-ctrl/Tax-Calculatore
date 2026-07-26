// ─── נכסי הלוגו של המשרד ──────────────────────────────────────────────────────
// שלושה מקומות, כל אחד עם דרישה טכנית אחרת (ראה LogoSurface ב-types/firmProfile).
// אפשר להעלות קובץ בודד לכל מקום, או להעלות את ערכת המותג כולה כקובץ ZIP ולבחור
// מתוכה — כי ערכות מותג מגיעות כארכיון עם עשרות וריאציות.

import { useMemo, useRef, useState } from 'react';
import type { FirmBranding, LogoSurface } from '../types/firmProfile';
import { LOGO_SURFACE_LABELS, resolveLogo, isLogoFallback } from '../types/firmProfile';
import {
  readBrandKitZip,
  entryToFile,
  entryToObjectUrl,
  svgFileToPng,
  type BrandKitEntry,
} from '../utils/logoAssets';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

const SURFACES: { id: LogoSurface; hint: string }[] = [
  { id: 'app', hint: 'ברירת המחדל. מוצג במערכת ובעמודי הלקוח על רקע בהיר. כל פורמט, כולל SVG.' },
  { id: 'dark', hint: 'לרצועות הכהות — ראש המייל וראש הצעת המחיר. העלה את הגרסה הלבנה/הבהירה של הלוגו.' },
  { id: 'email', hint: 'בגוף המייל. חייב PNG או JPG — ג׳ימייל ואאוטלוק אינם מציגים SVG. קובץ SVG יומר אוטומטית.' },
];

export interface LogoUploadRequest {
  surface: LogoSurface;
  file: File;
}

interface Props {
  branding: FirmBranding;
  darkBg: string;                       // צבע הרצועה הכהה מהעיצוב הנבחר — לתצוגה נאמנה
  firmName: string;
  busySurface: LogoSurface | null;
  onUpload: (req: LogoUploadRequest) => Promise<void>;
  onRemove: (surface: LogoSurface) => Promise<void>;
  onError: (message: string | null) => void;
}

export default function LogoAssetsPanel({
  branding, darkBg, firmName, busySurface, onUpload, onRemove, onError,
}: Props) {
  const [kit, setKit] = useState<BrandKitEntry[] | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const kitInput = useRef<HTMLInputElement>(null);

  async function accept(surface: LogoSurface, incoming: File) {
    onError(null);
    setNote(null);

    let file = incoming;
    // מייל: SVG לא מוצג בתוכנות מייל — ממירים ל-PNG לפני ההעלאה
    if (surface === 'email' && file.type === 'image/svg+xml') {
      try {
        const res = await svgFileToPng(file);
        file = res.file;
        setNote(res.fontsEmbedded
          ? `הקובץ הומר אוטומטית ל-PNG (${res.width}×${res.height}) עם הפונטים המקוריים, כדי שיוצג גם בג׳ימייל ובאאוטלוק.`
          : `הקובץ הומר ל-PNG (${res.width}×${res.height}). לא הצלחתי לטעון את הפונטים המקוריים — כדאי להשוות לתצוגה למטה.`);
      } catch (e) {
        onError(`ההמרה ל-PNG נכשלה: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }

    if (!ACCEPTED.includes(file.type)) {
      onError('פורמט לא נתמך — יש להעלות PNG, JPG, SVG או WEBP');
      return;
    }
    if (file.size > MAX_BYTES) {
      onError('הקובץ גדול מדי — עד 2MB');
      return;
    }
    await onUpload({ surface, file });
  }

  async function loadKit(file: File | null) {
    if (!file) return;
    onError(null);
    setNote(null);
    setKitBusy(true);
    try {
      const entries = await readBrandKitZip(file);
      if (entries.length === 0) {
        onError('לא נמצאו קובצי תמונה בארכיון');
        return;
      }
      setKit(entries);
    } catch (e) {
      onError(`לא הצלחתי לקרוא את הארכיון: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setKitBusy(false);
    }
  }

  return (
    <>
      <div style={card}>
        <div style={cardHead}>
          <div>
            <div style={cardTitle}>הלוגו של המשרד</div>
            <div style={sub}>
              כל מקום שלא הועלה אליו לוגו משתמש בלוגו הראשי — אז מספיק להעלות אחד כדי להתחיל.
            </div>
          </div>
          <label className="btn btn-secondary" style={{ cursor: kitBusy ? 'default' : 'pointer', opacity: kitBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {kitBusy ? 'קורא…' : '📦 העלה ערכת מותג (ZIP)'}
            <input
              ref={kitInput}
              type="file"
              accept=".zip,application/zip"
              style={{ display: 'none' }}
              disabled={kitBusy}
              onChange={e => { const f = e.target.files?.[0] ?? null; void loadKit(f); e.target.value = ''; }}
            />
          </label>
        </div>

        {note && (
          <div style={{ margin: '0 0 14px', padding: '.6rem .8rem', borderRadius: 8, background: 'var(--chip-green-bg)', color: 'var(--chip-green-tx)', fontSize: 12.5, lineHeight: 1.6 }}>
            {note}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {SURFACES.map(({ id, hint }) => {
            const url = resolveLogo(branding, id);
            const inherited = isLogoFallback(branding, id);
            const own = id === 'app' ? branding.logoUrl : id === 'dark' ? branding.logoOnDarkUrl : branding.emailLogoUrl;
            const busy = busySurface === id;
            const onDark = id === 'dark';
            return (
              <div key={id} style={slot}>
                <div style={{
                  width: 128, height: 78, borderRadius: 10, flexShrink: 0,
                  border: '1px dashed var(--gray-300)',
                  background: onDark ? darkBg : 'var(--gray-50)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {url
                    ? <img
                        src={url}
                        alt=""
                        style={{
                          maxWidth: '84%', maxHeight: '78%', objectFit: 'contain',
                          filter: onDark && !branding.logoOnDarkUrl ? 'brightness(0) invert(1)' : undefined,
                        }}
                      />
                    : <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>אין לוגו</span>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{LOGO_SURFACE_LABELS[id]}</span>
                    {inherited && <span style={tag}>יורש מהראשי</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.6 }}>{hint}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <label className="btn btn-primary btn-sm" style={{ cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                      {busy ? 'מעלה…' : own ? 'החלף' : 'העלה'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        style={{ display: 'none' }}
                        disabled={busy}
                        onChange={e => { const f = e.target.files?.[0]; if (f) void accept(id, f); e.target.value = ''; }}
                      />
                    </label>
                    {own && (
                      <button className="btn btn-sm" disabled={busy} onClick={() => { onError(null); void onRemove(id); }}>
                        הסר
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LogoPreviewCard branding={branding} darkBg={darkBg} firmName={firmName} />

      {kit && (
        <BrandKitPicker
          entries={kit}
          onPick={(entry, surface) => { void accept(surface, entryToFile(entry)); }}
          onClose={() => setKit(null)}
        />
      )}
    </>
  );
}

// ─── תצוגה: איפה כל לוגו מופיע בפועל ────────────────────────────────────────

function LogoPreviewCard({ branding, darkBg, firmName }: { branding: FirmBranding; darkBg: string; firmName: string }) {
  const appLogo = resolveLogo(branding, 'app');
  const darkLogo = resolveLogo(branding, 'dark');
  const emailLogo = resolveLogo(branding, 'email');
  const darkIsFallback = isLogoFallback(branding, 'dark');

  if (!appLogo) return null;

  return (
    <div style={card}>
      <div style={cardTitle}>איך זה ייראה ללקוח</div>
      <div style={sub}>שלושת המקומות, עם הלוגו שמוגדר לכל אחד כרגע.</div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
        <PreviewFrame label="ראש המייל ללקוח">
          <div style={{ background: '#ffffff', padding: '18px 20px', borderBottom: '1px solid #E8E5E0' }}>
            {emailLogo
              ? <img src={emailLogo} alt="" style={{ maxHeight: 34, maxWidth: 150, objectFit: 'contain' }} />
              : <span style={{ fontSize: 15, fontWeight: 600, color: '#1B1F24' }}>{firmName}</span>}
          </div>
          <div style={{ background: '#ffffff', padding: '14px 20px 20px' }}>
            <div style={{ height: 8, width: '62%', borderRadius: 4, background: '#EFEDE9' }} />
            <div style={{ height: 8, width: '84%', borderRadius: 4, background: '#EFEDE9', marginTop: 8 }} />
          </div>
        </PreviewFrame>

        <PreviewFrame label="רצועה כהה (הצעת מחיר / מייל)">
          <div style={{ background: darkBg, padding: '20px' }}>
            {darkLogo
              ? <img
                  src={darkLogo}
                  alt=""
                  style={{ maxHeight: 34, maxWidth: 150, objectFit: 'contain', filter: darkIsFallback ? 'brightness(0) invert(1)' : undefined }}
                />
              : <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{firmName}</span>}
          </div>
          <div style={{ background: '#ffffff', padding: '14px 20px 20px' }}>
            <div style={{ height: 8, width: '70%', borderRadius: 4, background: '#EFEDE9' }} />
          </div>
        </PreviewFrame>

        <PreviewFrame label="דף הזדהות / שאלון">
          <div style={{ background: '#FAF9F6', padding: '20px', textAlign: 'center' }}>
            <img src={appLogo} alt="" style={{ maxHeight: 36, maxWidth: 150, objectFit: 'contain' }} />
          </div>
          <div style={{ background: '#ffffff', padding: '14px 20px 20px' }}>
            <div style={{ height: 8, width: '54%', borderRadius: 4, background: '#EFEDE9', margin: '0 auto' }} />
          </div>
        </PreviewFrame>
      </div>

      {darkIsFallback && (
        <div style={{ marginTop: 14, padding: '.65rem .85rem', borderRadius: 8, background: 'var(--chip-amber-bg)', color: 'var(--chip-amber-tx)', fontSize: 12.5, lineHeight: 1.65 }}>
          לרצועה הכהה אין עדיין לוגו משלה, ולכן הלוגו הראשי מוצג כצללית לבנה אחידה.
          אם יש בערכה גרסה לבנה של הלוגו — כדאי להעלות אותה למקום «לוגו לרקע כהה».
        </div>
      )}
    </div>
  );
}

function PreviewFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--gray-500)', marginBottom: 6 }}>{label}</div>
      <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

// ─── בוחר מתוך ערכת מותג ────────────────────────────────────────────────────

function BrandKitPicker({
  entries, onPick, onClose,
}: {
  entries: BrandKitEntry[];
  onPick: (entry: BrandKitEntry, surface: LogoSurface) => void;
  onClose: () => void;
}) {
  // הכתובות נוצרות פעם אחת לכל פתיחה; הדפדפן משחרר אותן כשהעמוד נסגר
  const previews = useMemo(() => entries.map(entryToObjectUrl), [entries]);
  const groups = useMemo(() => {
    const map = new Map<string, number[]>();
    entries.forEach((e, i) => {
      const list = map.get(e.folder) ?? [];
      list.push(i);
      map.set(e.folder, list);
    });
    return [...map.entries()];
  }, [entries]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 880, width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>ערכת המותג — {entries.length} קבצים</h3>
            <div style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 2 }}>
              בחר לכל מקום את הגרסה המתאימה. קובץ SVG שייבחר למייל יומר אוטומטית ל-PNG.
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {groups.map(([folder, idxs]) => (
            <div key={folder} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, direction: 'ltr', textAlign: 'right' }}>{folder}</div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
                {idxs.map(i => {
                  const e = entries[i];
                  const isSvg = e.mime === 'image/svg+xml';
                  // רקע משובץ מבהיר איפה הלוגו שקוף ואיפה לבן — קריטי כדי לזהות
                  // גרסה לבנה, שעל רקע לבן נראית כאילו הקובץ ריק
                  return (
                    <div key={e.path} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden', background: 'var(--card)' }}>
                      <div style={{
                        height: 74, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8,
                        backgroundColor: 'var(--gray-100)',
                        backgroundImage: 'linear-gradient(45deg, var(--gray-200) 25%, transparent 25%), linear-gradient(-45deg, var(--gray-200) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--gray-200) 75%), linear-gradient(-45deg, transparent 75%, var(--gray-200) 75%)',
                        backgroundSize: '12px 12px',
                        backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
                      }}>
                        <img src={previews[i]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                      <div style={{ padding: '7px 9px 9px' }}>
                        <div style={{ fontSize: 11, color: 'var(--gray-600)', direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.name}>
                          {e.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--gray-400)', direction: 'ltr', textAlign: 'right', marginTop: 1 }}>
                          {isSvg ? 'SVG' : e.mime.replace('image/', '').toUpperCase()} · {Math.max(1, Math.round(e.size / 1024))}KB
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>
                          <button className="btn btn-sm" style={pick} onClick={() => onPick(e, 'app')}>ראשי</button>
                          <button className="btn btn-sm" style={pick} onClick={() => onPick(e, 'dark')}>כהה</button>
                          <button className="btn btn-sm" style={pick} onClick={() => onPick(e, 'email')}>מייל</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { border: '0.5px solid var(--gray-200)', borderRadius: 12, padding: 18, background: 'var(--card)', marginBottom: 14 };
const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 14 };
const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--gray-800)' };
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--gray-500)', marginTop: 3, lineHeight: 1.6 };
const slot: React.CSSProperties = { display: 'flex', gap: 14, alignItems: 'flex-start', padding: 12, border: '1px solid var(--gray-200)', borderRadius: 10, flexWrap: 'wrap' };
const tag: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, padding: '.1rem .45rem', borderRadius: 5, background: 'var(--chip-slate-bg)', color: 'var(--chip-slate-tx)' };
const pick: React.CSSProperties = { flex: 1, fontSize: 11.5, padding: '.25rem 0', justifyContent: 'center' };

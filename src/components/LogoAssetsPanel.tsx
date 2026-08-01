// ─── נכסי הלוגו של המשרד ──────────────────────────────────────────────────────
// שלושה מקומות, כל אחד עם דרישה טכנית אחרת (ראה LogoSurface ב-types/firmProfile),
// ובקרת גודל אחת שחלה על כולם. התצוגה למטה מראה את התוצאה בפועל.

import { useState } from 'react';
import type { FirmBranding, LogoSurface } from '../types/firmProfile';
import {
  LOGO_SURFACE_LABELS,
  LOGO_SCALE_MIN,
  LOGO_SCALE_MAX,
  resolveLogo,
  isLogoFallback,
  logoScale,
} from '../types/firmProfile';
import { svgFileToPng } from '../utils/logoAssets';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

const SURFACES: { id: LogoSurface; hint: string }[] = [
  { id: 'app', hint: 'ברירת המחדל. מוצג בעמודי הלקוח על רקע בהיר. כל פורמט, כולל SVG.' },
  { id: 'dark', hint: 'לרצועות הכהות — ראש המייל וראש הצעת המחיר. העלה את הגרסה הלבנה, ועדיף פריסה רחבה: הרצועה נמוכה, ובלוגו מוערם הכיתוב מתחת לשם נעשה זעיר.' },
  { id: 'email', hint: 'בגוף המייל, על רקע בהיר. גם כאן עדיפה פריסה רחבה.' },
];

// שתי המשבצות האלה נצרכות בתוך מיילים, ותוכנות מייל אינן מציגות SVG כלל —
// לכן כל SVG שמגיע אליהן מומר ל-PNG לפני ההעלאה.
const RASTERISE_SURFACES: LogoSurface[] = ['dark', 'email'];

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
  onScaleChange: (scale: number) => void;
  onError: (message: string | null) => void;
}

export default function LogoAssetsPanel({
  branding, darkBg, firmName, busySurface, onUpload, onRemove, onScaleChange, onError,
}: Props) {
  const [note, setNote] = useState<string | null>(null);
  const scale = logoScale(branding);

  async function accept(surface: LogoSurface, incoming: File) {
    onError(null);
    setNote(null);

    let file = incoming;
    if (RASTERISE_SURFACES.includes(surface) && file.type === 'image/svg+xml') {
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

    // הלוגו הראשי משמש כברירת מחדל גם במיילים. אם הוא SVG ואין עדיין לוגו מייל,
    // המייל היה יוצא עם קובץ שתוכנות מייל לא מציגות — לכן מייצרים לו PNG מקביל.
    if (surface === 'app' && incoming.type === 'image/svg+xml' && !branding.emailLogoUrl) {
      try {
        const res = await svgFileToPng(incoming);
        await onUpload({ surface: 'email', file: res.file });
        setNote(`הלוגו הראשי הוא SVG, שתוכנות מייל אינן מציגות — לכן יצרתי ממנו גם גרסת PNG (${res.width}×${res.height}) והצבתי אותה כלוגו למיילים. אפשר להחליף אותה בכל רגע.`);
      } catch {
        setNote('הלוגו הראשי הוא SVG. תוכנות מייל אינן מציגות SVG — כדאי להעלות גם קובץ PNG במשבצת «לוגו למיילים».');
      }
    }
  }

  return (
    <>
      <div style={card}>
        <div style={cardTitle}>הלוגו של המשרד</div>
        <div style={sub}>
          כל מקום שלא הועלה אליו לוגו משתמש בלוגו הראשי — אז מספיק להעלות אחד כדי להתחיל.
        </div>

        {note && (
          <div style={{ margin: '14px 0 0', padding: '.6rem .8rem', borderRadius: 8, background: 'var(--chip-green-bg)', color: 'var(--chip-green-tx)', fontSize: 'var(--fs-13)', lineHeight: 1.6 }}>
            {note}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
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
                  border: '1px dashed var(--hairline-1)',
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
                    : <span style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-400)' }}>אין לוגו</span>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--fs-14)' }}>{LOGO_SURFACE_LABELS[id]}</span>
                    {inherited && <span style={tag}>יורש מהראשי</span>}
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.6 }}>{hint}</div>
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

        <LogoSizeControl scale={scale} disabled={!branding.logoUrl} onChange={onScaleChange} />
      </div>

      <LogoPreviewCard branding={branding} darkBg={darkBg} firmName={firmName} />
    </>
  );
}

// ─── בקרת גודל ──────────────────────────────────────────────────────────────

function LogoSizeControl({ scale, disabled, onChange }: { scale: number; disabled: boolean; onChange: (s: number) => void }) {
  const pct = Math.round(scale * 100);
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--gray-200)', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 'var(--fs-14)' }}>גודל הלוגו</div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 3, lineHeight: 1.6 }}>
            חל על כל המקומות יחד. התצוגה למטה מתעדכנת מיד.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 'var(--fs-15)', fontWeight: 600, minWidth: 58, textAlign: 'center', color: 'var(--br)' }}>
            {pct}%
          </span>
          {pct !== 100 && (
            <button className="btn btn-sm" disabled={disabled} onClick={() => onChange(1)} style={{ fontSize: 'var(--fs-12)' }}>
              אפס
            </button>
          )}
        </div>
      </div>

      <input
        type="range"
        min={LOGO_SCALE_MIN * 100}
        max={LOGO_SCALE_MAX * 100}
        step={5}
        value={pct}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value) / 100)}
        style={{ width: '100%', marginTop: 12, accentColor: 'var(--br)', cursor: disabled ? 'default' : 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-12)', color: 'var(--gray-400)', marginTop: 2 }}>
        <span>{Math.round(LOGO_SCALE_MAX * 100)}% · גדול</span>
        <span>{Math.round(LOGO_SCALE_MIN * 100)}% · קטן</span>
      </div>
    </div>
  );
}

// ─── תצוגה: איפה כל לוגו מופיע בפועל ────────────────────────────────────────

function LogoPreviewCard({ branding, darkBg, firmName }: { branding: FirmBranding; darkBg: string; firmName: string }) {
  const appLogo = resolveLogo(branding, 'app');
  const darkLogo = resolveLogo(branding, 'dark');
  const emailLogo = resolveLogo(branding, 'email');
  const darkIsFallback = isLogoFallback(branding, 'dark');
  const s = logoScale(branding);

  if (!appLogo) return null;

  return (
    <div style={card}>
      <div style={cardTitle}>איך זה ייראה ללקוח</div>
      <div style={sub}>שלושת המקומות, בגודל שנבחר למעלה.</div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
        <PreviewFrame label="ראש המייל ללקוח">
          <div style={{ background: '#ffffff', padding: '18px 20px', borderBottom: '1px solid #E8E5E0' }}>
            {emailLogo
              ? <img src={emailLogo} alt="" style={{ maxHeight: 34 * s, maxWidth: 150 * s, objectFit: 'contain' }} />
              : <span style={{ fontSize: 'var(--fs-15)', fontWeight: 600, color: '#1B1F24' }}>{firmName}</span>}
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
                  style={{ maxHeight: 34 * s, maxWidth: 150 * s, objectFit: 'contain', filter: darkIsFallback ? 'brightness(0) invert(1)' : undefined }}
                />
              : <span style={{ fontSize: 'var(--fs-15)', fontWeight: 600, color: '#fff' }}>{firmName}</span>}
          </div>
          <div style={{ background: '#ffffff', padding: '14px 20px 20px' }}>
            <div style={{ height: 8, width: '70%', borderRadius: 4, background: '#EFEDE9' }} />
          </div>
        </PreviewFrame>

        <PreviewFrame label="דף הזדהות / שאלון">
          <div style={{ background: '#FAF9F6', padding: '20px', textAlign: 'center' }}>
            <img src={appLogo} alt="" style={{ maxHeight: 36 * s, maxWidth: 150 * s, objectFit: 'contain' }} />
          </div>
          <div style={{ background: '#ffffff', padding: '14px 20px 20px' }}>
            <div style={{ height: 8, width: '54%', borderRadius: 4, background: '#EFEDE9', margin: '0 auto' }} />
          </div>
        </PreviewFrame>
      </div>

      {darkIsFallback && (
        <div style={{ marginTop: 14, padding: '.65rem .85rem', borderRadius: 8, background: 'var(--chip-amber-bg)', color: 'var(--chip-amber-tx)', fontSize: 'var(--fs-13)', lineHeight: 1.65 }}>
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
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginBottom: 6 }}>{label}</div>
      <div style={{ border: '1px solid var(--hairline-1)', borderRadius: 'var(--r-input)', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

const card: React.CSSProperties = { borderTop: '1px solid var(--hairline-2)', padding: '16px 0 18px', marginBottom: 0 };
const cardTitle: React.CSSProperties = { fontSize: 'var(--fs-15)', fontWeight: 600, color: 'var(--gray-800)' };
const sub: React.CSSProperties = { fontSize: 'var(--fs-12)', color: 'var(--gray-500)', marginTop: 3, lineHeight: 1.6 };
const slot: React.CSSProperties = { display: 'flex', gap: 14, alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid var(--hairline-2)', flexWrap: 'wrap' };
const tag: React.CSSProperties = { fontSize: 'var(--fs-12)', fontWeight: 600, padding: '.1rem .45rem', borderRadius: 5, background: 'var(--chip-slate-bg)', color: 'var(--chip-slate-tx)' };

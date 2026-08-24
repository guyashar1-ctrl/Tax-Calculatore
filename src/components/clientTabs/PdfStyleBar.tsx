// ─── סרגל העיצוב של הסימון הנבחר ───────────────────────────────────────
// ‼ הסרגל יושב בשורה קבועה מתחת לכלים ולא צף מעל הדף. שלוש סיבות:
// הוא לעולם אינו מכסה את מה שעורכים, הוא נשאר במקומו בגלילה ובזום, ואין
// צורך לחשב לו מיקום מול הדף (הגרסה הצפה חישבה אחוזים מול חלון המסך
// כולו, ולכן נחתה במקום שרירותי).
//
// ‼ גילוי הדרגתי: הסרגל הראשי מחזיק כלים בלבד. תכונות העיצוב נפתחות רק
// כשיש סימון נבחר, ורק אלה ששייכות לו — לפי capsOf, אותו מקור אמת שממנו
// נגזרת גם הצריבה.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ANNOTATION_LABELS, DEFAULT_FONT_PCT, DEFAULT_THICKNESS_PCT,
  FONT_PCT_MAX, FONT_PCT_MIN, THICKNESS_STEPS,
  capsOf, fillColorOf, fillOpacityOf, strokeOpacityOf, strokeVisible,
  type Annotation, type LatinFamily,
} from '../../utils/pdfAnnotations';

/** לוח הצבעים של העיצוב — דיו כהה, לבן להסתרה, וארבעה צבעי סימון. */
export const STYLE_PALETTE = [
  '#111827', '#ffffff', '#e02424', '#1552d8', '#0a8a3c', '#f59e0b', '#facc15',
];

const FAMILY_ORDER: LatinFamily[] = ['sans', 'serif', 'mono'];
const FAMILY_LABEL: Record<LatinFamily, string> = { sans: 'Aa', serif: 'Tt', mono: 'Mm' };

interface Props {
  ann: Annotation;
  /** שינוי שנכנס להיסטוריה — לחיצה על צבע, עובי, גופן. */
  onPatch: (p: Partial<Annotation>) => void;
  /** שינוי רציף תוך כדי גרירת מחוון — לא נכנס להיסטוריה בפני עצמו. */
  onLive: (p: Partial<Annotation>) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onEditText: () => void;
  onDelete: () => void;
}

export default function PdfStyleBar({
  ann, onPatch, onLive, onGestureStart, onGestureEnd, onEditText, onDelete,
}: Props) {
  const caps = capsOf(ann.kind);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setOpen(null); }, [ann.id]);

  const fill = fillColorOf(ann);
  const fontPct = ann.fontPct ?? DEFAULT_FONT_PCT;
  const thickness = ann.thicknessPct ?? DEFAULT_THICKNESS_PCT;
  const family = ann.fontFamily ?? 'sans';

  const pop = (key: string, node: ReactNode) => (open === key ? (
    <>
      <button type="button" className="pdfe-pop-scrim" aria-label="סגור" onClick={() => setOpen(null)} />
      <div className="pdfe-pop" dir="rtl">{node}</div>
    </>
  ) : null);

  return (
    <div className="pdfe-style" dir="rtl" data-kind={ann.kind}>
      <span className="pdfe-style-label">{ANNOTATION_LABELS[ann.kind]}</span>

      {/* ── טקסט: גודל, הדגשה, גופן, צבע אותיות ─────────────────────── */}
      {caps.text && (
        <>
          <div className="pdfe-style-group">
            <button type="button" className="pdfe-sb" title="הקטן טקסט" aria-label="הקטן טקסט"
              onClick={() => onPatch({ fontPct: Math.max(FONT_PCT_MIN, +(fontPct / 1.15).toFixed(5)) })}>א−</button>
            <span className="pdfe-style-val">{Math.round(fontPct * 1000)}</span>
            <button type="button" className="pdfe-sb" title="הגדל טקסט" aria-label="הגדל טקסט"
              onClick={() => onPatch({ fontPct: Math.min(FONT_PCT_MAX, +(fontPct * 1.15).toFixed(5)) })}>א+</button>
          </div>
          <button type="button" className={`pdfe-sb${ann.bold ? ' is-on' : ''}`} aria-pressed={!!ann.bold}
            title="מודגש" aria-label="מודגש" onClick={() => onPatch({ bold: !ann.bold })}><b>B</b></button>
          <button type="button" className="pdfe-sb" title="גופן לטיני" aria-label="גופן לטיני"
            onClick={() => onPatch({ fontFamily: FAMILY_ORDER[(FAMILY_ORDER.indexOf(family) + 1) % FAMILY_ORDER.length] })}
          >{FAMILY_LABEL[family]}</button>

          <span className="pdfe-style-pop">
            <SwatchButton label="צבע טקסט" color={ann.color}
              onClick={() => setOpen(o => (o === 'ink' ? null : 'ink'))} />
            {pop('ink', (
              <ColorRow value={ann.color} onPick={c => { if (c) onPatch({ color: c }); setOpen(null); }} />
            ))}
          </span>
        </>
      )}

      {/* ── מילוי / רקע ──────────────────────────────────────────────── */}
      {caps.fill && (
        <span className="pdfe-style-pop">
          <SwatchButton label={caps.text ? 'רקע' : 'מילוי'} color={fill}
            onClick={() => setOpen(o => (o === 'fill' ? null : 'fill'))} />
          {pop('fill', (
            <>
              <ColorRow
                value={fill}
                allowNone={ann.kind !== 'whiteout' && ann.kind !== 'highlight'}
                noneLabel={caps.text ? 'ללא רקע' : 'ללא מילוי'}
                onPick={c => onPatch({ fillColor: c })}
              />
              {caps.fillOpacity && (
                <OpacityRow
                  label="שקיפות המילוי"
                  value={fillOpacityOf(ann)}
                  disabled={!fill}
                  onLive={v => onLive({ fillOpacity: v })}
                  onStart={onGestureStart}
                  onEnd={onGestureEnd}
                />
              )}
            </>
          ))}
        </span>
      )}

      {/* ── מסגרת / קו ───────────────────────────────────────────────── */}
      {caps.stroke && (
        <span className="pdfe-style-pop">
          <SwatchButton
            label={ann.kind === 'rectangle' || ann.kind === 'circle' ? 'מסגרת' : 'צבע'}
            color={strokeVisible(ann) ? ann.color : null}
            onClick={() => setOpen(o => (o === 'stroke' ? null : 'stroke'))}
          />
          {pop('stroke', (
            <>
              <ColorRow
                value={strokeVisible(ann) ? ann.color : null}
                allowNone={ann.kind === 'rectangle' || ann.kind === 'circle'}
                noneLabel="ללא מסגרת"
                onPick={c => onPatch(c === null ? { noStroke: true } : { color: c, noStroke: false })}
              />
              <div className="pdfe-pop-row">
                <span className="pdfe-pop-label">עובי</span>
                <span className="pdfe-widths">
                  {THICKNESS_STEPS.map((t, i) => (
                    <button
                      key={t} type="button" aria-label={`עובי ${i + 1}`}
                      className={`pdfe-width${Math.abs(t - thickness) < 0.0005 ? ' is-on' : ''}`}
                      onClick={() => onPatch({ thicknessPct: t, noStroke: false })}
                    ><i style={{ height: 1 + i * 2 }} /></button>
                  ))}
                </span>
              </div>
              <OpacityRow
                label="שקיפות הקו"
                value={strokeOpacityOf(ann)}
                disabled={!strokeVisible(ann)}
                onLive={v => onLive({ strokeOpacity: v })}
                onStart={onGestureStart}
                onEnd={onGestureEnd}
              />
            </>
          ))}
        </span>
      )}

      {caps.text && (
        <button type="button" className="pdfe-sb pdfe-sb-wide" onClick={onEditText}>ערוך טקסט</button>
      )}

      <span className="pdfe-style-grow" />
      <span className="pdfe-style-hint">
        {ann.kind === 'line' ? 'גרור נקודת קצה כדי לכוון · גרור את הקו כדי להזיז'
          : ann.kind === 'whiteout' ? 'מכסה את מה שמתחת · אינה מוחקת מהקובץ'
            : 'גרור להזזה · פינות לשינוי גודל'}
      </span>
      <button type="button" className="pdfe-sb pdfe-sb-del" title="מחק (Delete)" aria-label="מחק סימון"
        onClick={onDelete}>✕</button>
    </div>
  );
}

// ─── חלקים ─────────────────────────────────────────────────────────────

function SwatchButton({ label, color, onClick }: {
  label: string; color: string | null; onClick: () => void;
}) {
  return (
    <button type="button" className="pdfe-sb pdfe-sb-swatch" onClick={onClick} title={label} aria-label={label}>
      <span className="pdfe-style-name">{label}</span>
      <i className={`pdfe-chip${color ? '' : ' is-none'}`} style={color ? { background: color } : undefined} />
    </button>
  );
}

function ColorRow({ value, onPick, allowNone, noneLabel }: {
  value: string | null;
  onPick: (c: string | null) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="pdfe-pop-row">
      <span className="pdfe-colorrow">
        {STYLE_PALETTE.map(c => (
          <button
            key={c} type="button" aria-label={`צבע ${c}`}
            className={`pdfe-colordot${value?.toLowerCase() === c ? ' is-on' : ''}`}
            style={{ background: c }}
            onClick={() => onPick(c)}
          />
        ))}
        {allowNone && (
          <button
            type="button"
            className={`pdfe-colordot is-none${value === null ? ' is-on' : ''}`}
            title={noneLabel} aria-label={noneLabel}
            onClick={() => onPick(null)}
          />
        )}
      </span>
    </div>
  );
}

/**
 * ‼ המחוון מעדכן תוך כדי גרירה (onLive) ורושם להיסטוריה רק בסופה: כך
 * רואים את השקיפות משתנה על הדף בזמן אמת, ו"בטל" אחד מחזיר את הערך
 * הקודם במקום לפרק את הגרירה לעשרות צעדים.
 */
function OpacityRow({ label, value, disabled, onLive, onStart, onEnd }: {
  label: string;
  value: number;
  disabled?: boolean;
  onLive: (v: number) => void;
  onStart: () => void;
  onEnd: () => void;
}) {
  const active = useRef(false);
  const begin = () => { if (!active.current) { active.current = true; onStart(); } };
  const finish = () => { if (active.current) { active.current = false; onEnd(); } };
  useEffect(() => finish, []);   // סגירת החלונית באמצע גרירה לא משאירה מחווה פתוחה

  return (
    <div className="pdfe-pop-row">
      <span className="pdfe-pop-label">{label}</span>
      <input
        type="range" min={0} max={100} step={5}
        className="pdfe-range"
        value={Math.round(value * 100)}
        disabled={disabled}
        aria-label={label}
        onPointerDown={begin}
        onKeyDown={begin}
        onChange={e => { begin(); onLive(Number(e.target.value) / 100); }}
        onPointerUp={finish}
        onKeyUp={finish}
        onBlur={finish}
      />
      <span className="pdfe-pop-val">{Math.round(value * 100)}%</span>
    </div>
  );
}

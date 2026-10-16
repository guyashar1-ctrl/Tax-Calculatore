// ─── הטופס החי: מתעדכן תוך כדי הקלדה, עם סימון כל תיבת חובה ואזור החתימה (16.10.2026) ─────
// ‼ גיא: «כל שדה שממלאים מופיע מיד במקומו על הטופס, בלי שמור ובלי רענון». הרכיב מקבל את הנתונים
//   המאוחדים (כרטיס ∪ תשובות שמורות ∪ מה שמוקלד עכשיו), מצייר את ה-PDF אחרי השהיה קצרה (debounce),
//   ומשאיר את הגרסה הקודמת על המסך עד שהחדשה מוכנה — אין רגע ריק.
// ‼ הסימונים (formMarkers) הם שכבה מעל התמונה, לא חלק מה-PDF: הקובץ שנחתם נקי מהם.
//   מה שנראה כאן הוא בדיוק מה שייחתם — אותו מנוע ייצוא (renderClientForm).

import { useEffect, useMemo, useRef, useState } from 'react';
import SmartFormPreview, { type Hotspot } from '../SmartFormPreview';
import type { SmartFormTemplate } from '../types';
import type { CfData, ClientFormDef } from './types';
import { formMarkers, renderClientForm, type FormMarker } from './registry';

interface Props {
  def: ClientFormDef;
  /** הנתונים כפי שהם עכשיו — כולל מה שמוקלד ועוד לא נשמר. */
  data: CfData;
  template?: SmartFormTemplate;
  /** חתימת הלקוח (אחרי חתימה) — נצרבת בתצוגה. */
  signature?: string | null;
  /** חותמת המשרד (הצהרת המייצג) — רק בקובץ החתום של המשרד. */
  stamp?: string | null;
  draftMark?: string;
  /** סימון תיבות החובה והחתימה על הטופס. ברירת מחדל: כן. */
  markers?: boolean;
  /** מפתחות שאלון שעונים עליהן עכשיו — התיבות שלהן מודגשות ונגללות לעין. */
  focusKeys?: string[];
  /** לחיצה על סימון (למשל «חסר» ⇒ פתיחת השאלה). */
  onMarker?: (m: FormMarker) => void;
  /** המתנה לפני ציור מחדש (מ״ש). */
  debounceMs?: number;
  title?: string;
  /** תווית אזור החתימה (ברירת מחדל לפי המצב). */
  signTag?: string;
  /** מתי «נחתם» ⇒ סימון החתימה ירוק. */
  signed?: boolean;
  /** האם לצייר בכלל (למשל כשהחותמת עוד נטענת). */
  ready?: boolean;
  maxFit?: number;
  onRenderError?: (message: string) => void;
}

export default function LiveFormPreview({
  def, data, template, signature, stamp, draftMark, markers = true, focusKeys, onMarker, debounceMs = 220, title, signTag, signed, ready = true, maxFit, onRenderError,
}: Props) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(true);
  const dataKey = useMemo(() => JSON.stringify(data), [data]);
  const seq = useRef(0);

  useEffect(() => {
    if (!ready) return;
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      void renderClientForm(def, data, { template, signature: signature ?? null, stamp: stamp ?? null, draftMark })
        .then(r => { if (seq.current === my) { setBytes(r.bytes); setBusy(false); } })
        .catch(e => { if (seq.current === my) { setBusy(false); onRenderError?.(e instanceof Error ? e.message : String(e)); } });
    }, bytes ? debounceMs : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, dataKey, template, signature, stamp, draftMark, ready]);

  const list = useMemo(() => (markers ? formMarkers(def, data, { signed }) : []), [def, dataKey, markers, signed]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus = useMemo(() => new Set(focusKeys ?? []), [focusKeys]);
  const activeKey = useMemo(() => list.find(m => m.state !== 'sign' && m.state !== 'signed' && m.questionKeys.some(k => focus.has(k)))?.key ?? null, [list, focus]);
  const hotspots: Hotspot[] = useMemo(() => list.map(m => ({
    page: m.page, box: m.box, key: m.key, tone: 'muted', title: m.label, mark: m.state,
    tag: m.state === 'sign' ? (signTag ?? m.label) : m.state === 'signed' ? 'נחתם' : undefined,
  })), [list, signTag]);
  const byKey = useMemo(() => new Map(list.map(m => [m.key, m])), [list]);

  return (
    <SmartFormPreview bytes={bytes} busy={busy} title={title} hotspots={hotspots} activeKey={activeKey} maxFit={maxFit}
      onHotspot={onMarker ? k => { const m = byKey.get(k); if (m) onMarker(m); } : undefined} />
  );
}

/** שורת סיכום: כמה תיבות חובה עוד חסרות, ואילו. */
export function MissingSummary({ markers, onPick }: { markers: FormMarker[]; onPick?: (m: FormMarker) => void }) {
  const missing = markers.filter(m => m.state === 'missing');
  const filled = markers.filter(m => m.state === 'ok').length;
  if (!missing.length) {
    return <p className="cf-live-sum is-ok" role="status">✓ כל תיבות החובה בטופס מלאות ({filled})</p>;
  }
  return (
    <div className="cf-live-sum" role="status">
      <span className="cf-live-sum-h">חסר בטופס · {missing.length}{filled ? ` (מלא: ${filled})` : ''}</span>
      <span className="cf-live-sum-list">
        {missing.slice(0, 10).map(m => onPick
          ? <button key={m.key} type="button" className="cf-live-chip" onClick={() => onPick(m)}>{shortLabel(m.label)}</button>
          : <span key={m.key} className="cf-live-chip is-static">{shortLabel(m.label)}</span>)}
        {missing.length > 10 && <span className="cf-live-chip is-static">+{missing.length - 10}</span>}
      </span>
    </div>
  );
}

const shortLabel = (l: string) => l.replace(/\s*\(.*?\)\s*$/, '');

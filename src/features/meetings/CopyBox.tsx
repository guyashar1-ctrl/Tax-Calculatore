// ─── טקסט מוכן להעתקה לוואטסאפ ───────────────────────────────────────────────
// ‼ PIVO לא שולח וואטסאפ ולא מסמן «נשלח»: מעתיקים, והרו"ח שולח מהטלפון שלו.

import { useRef, useState } from 'react';

export default function CopyBox({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'select'>('idle');
  const ref = useRef<HTMLDivElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      const range = document.createRange();
      if (ref.current) range.selectNodeContents(ref.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      setState('select');
    }
  }

  return (
    <div className="mt-copy">
      <span className="mt-hint">{label}</span>
      <div className="mt-copy-text" ref={ref}>{text}</div>
      <div className="mt-copy-acts">
        <button type="button" className="ui-btn ui-btn-ghost" onClick={copy}>{state === 'copied' ? 'הועתק' : 'העתקה'}</button>
        {state === 'select' && <span className="mt-hint">הטקסט סומן — העתיקו ידנית.</span>}
      </div>
    </div>
  );
}

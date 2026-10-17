// ─── בוחר ענף כלכלי (מע״מ) — חיפוש לפי מילה או קוד, מתוך 591 הענפים של רשות המסים ───────
// ‼ 16.10.2026: במקום רשימה סגורה קצרה — הרשימה הרשמית (src/data/vatBranches). הערך הנשמר הוא הקוד.
//   מתאים לשאלון של הלקוח (טלפון: רשימה מתחת לשדה, 48px לשורה) ולכרטיס במשרד. ענף שחייב ברישום כעוסק
//   מורשה (תקנה 13) מסומן ברשימה ומתחת לבחירה.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { VAT_BRANCH_BY_CODE, SECTION_LABEL, licensedRuleOf, searchBranches, type VatBranch } from '../../data/vatBranches';

interface Props {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** להציג את הערת «חייב ברישום כעוסק מורשה» מתחת לבחירה. ברירת מחדל: כן. */
  showLicensed?: boolean;
}

export default function VatBranchPicker({ id, value, onChange, disabled, placeholder, showLicensed = true, ...aria }: Props) {
  const uid = useId();
  const inputId = id ?? `${uid}-branch`;
  const selected = value ? VAT_BRANCH_BY_CODE[value] : undefined;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => (open ? searchBranches(q, 10) : []), [q, open]);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (b: VatBranch) => { onChange(b.code); setQ(''); setOpen(false); };
  const rule = showLicensed ? licensedRuleOf(value) : undefined;

  if (selected) {
    return (
      <div className="vbp" ref={wrap}>
        <div className="vbp-sel">
          <span className="vbp-code" dir="ltr">{selected.code}</span>
          <span className="vbp-name">{selected.name}</span>
          <span className="vbp-sec">{SECTION_LABEL[selected.section] ?? ''}</span>
          {!disabled && <button type="button" className="vbp-x" onClick={() => { onChange(''); setOpen(true); }} aria-label="החלפת ענף">✕</button>}
        </div>
        {rule && (
          <p className={`vbp-lic is-${rule.level}`} data-vbp-licensed={rule.level}>
            {rule.level === 'mandatory' ? 'ענף זה חייב ברישום כעוסק מורשה' : 'ייתכן שענף זה חייב ברישום כעוסק מורשה'} (תקנה {rule.group}) — {rule.note}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="vbp" ref={wrap}>
      <input id={inputId} type="search" value={q} disabled={disabled} placeholder={placeholder ?? 'חיפוש ענף — מילה או קוד (לדוגמה: שליחויות, 6920)'}
        autoComplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-controls={`${inputId}-list`} aria-autocomplete="list"
        aria-invalid={aria['aria-invalid'] || undefined} aria-describedby={aria['aria-describedby']}
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(hits.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
          else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && q.trim() && (
        <ul className="vbp-list" id={`${inputId}-list`} role="listbox">
          {hits.length === 0 && <li className="vbp-empty">לא נמצא ענף. נסו מילה אחרת (למשל «ייעוץ», «מסחר», «הובלה»).</li>}
          {hits.map((b, i) => {
            const r = licensedRuleOf(b.code);
            return (
              <li key={b.code} role="option" aria-selected={i === hi} className={`vbp-item${i === hi ? ' is-hi' : ''}`}
                onMouseDown={e => { e.preventDefault(); pick(b); }} onMouseEnter={() => setHi(i)}>
                <span className="vbp-code" dir="ltr">{b.code}</span>
                <span className="vbp-name">{b.name}</span>
                {r?.level === 'mandatory' && <span className="vbp-tag">מורשה</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

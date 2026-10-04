// ─── «המשרד» · אבני בניין משותפות לעמודים ────────────────────────────────────
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export function Section({ title, sub, aside, children, id }: {
  title?: ReactNode; sub?: ReactNode; aside?: ReactNode; children?: ReactNode; id?: string;
}) {
  return (
    <section className="of-sec" aria-labelledby={id}>
      {(title || aside) && (
        <div className="of-sec-head">
          <div>
            {title && <h2 className="of-sec-title" id={id}>{title}</h2>}
            {sub && <p className="of-sec-sub">{sub}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * שדה: תווית, הפקד, והסבר מתחת.
 * ‼ ההסבר מחוץ ל-<label> ומקושר ב-aria-describedby — אחרת קורא מסך מקריא את
 * כל ההסבר כשם השדה.
 */
export function Field({ label, hint, hintTone, children, wide }: {
  label: ReactNode; hint?: ReactNode; hintTone?: 'warn' | 'error'; children: ReactNode; wide?: boolean;
}) {
  const hintId = useId();
  const control = hint && isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': hintId })
    : children;
  return (
    <div className="of-field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label className="of-field-wrap">
        <span className="of-field-label">{label}</span>
        {control}
      </label>
      {hint && <span id={hintId} className={`of-field-hint${hintTone ? ` is-${hintTone}` : ''}`}>{hint}</span>}
    </div>
  );
}

export function Check({ checked, onChange, label, hint, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean;
}) {
  return (
    <label className="of-check" style={disabled ? { opacity: .55, cursor: 'default' } : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="of-check-label">{label}</span>
        {hint && <span className="of-check-hint">{hint}</span>}
      </span>
    </label>
  );
}

/** «עובר לעמוד אחר במשרד» — כפתור שנראה כמו קישור. */
export function GoTo({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="of-link" onClick={onClick}>{children}</button>;
}

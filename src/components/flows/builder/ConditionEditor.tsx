// «למי זה חל» — סוגי לקוח (אחד מהם) ועובדות (כולן). אוצר מילים סגור: רק מה
// שהשרת יודע להעריך (flow_when_matches). אין ניסוח חופשי.
import { useState } from 'react';
import { CLIENT_KIND_LABELS, CLIENT_KIND_ORDER } from '../../../types/journeyDefaults';
import { FLOW_FACT_KEYS, FLOW_FACT_LABELS, type FlowFactKey, type When } from '../../../features/flows/types';
import { onlyPhrase, whenParts } from '../../../features/flows/conditions';
import { cleanWhen } from './model';

/**
 * «למי» בשורה אחת — «לכל הלקוחות» / «רק לעוסק פטור» — והעורך נפתח רק כשרוצים
 * לשנות. ‼ רוב השלבים והפריטים לכולם; שמונה בוררים פתוחים הסתירו את מה שחשוב.
 */
export function ConditionField(props: Parameters<typeof ConditionEditor>[0] & { label: string; extra?: string | null }) {
  const parts = [...whenParts(props.value), ...(props.extra ? [props.extra] : [])];
  const [open, setOpen] = useState(false);
  return (
    <div className="fl-condf">
      <div className="fl-condf-row">
        <span className="fl-condf-l">{props.label}</span>
        <span className={`fl-condf-v${parts.length ? ' is-branch' : ''}`}>{onlyPhrase(parts)}</span>
        <button type="button" className="fl-link" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'סגירה' : 'שינוי'}</button>
      </div>
      {open && <ConditionEditor {...props} />}
    </div>
  );
}

export default function ConditionEditor({ value, onChange, kindsOnly, kindsOnlyWhy }: {
  value?: When;
  onChange: (w: When | undefined) => void;
  /** בקשת מערכת בקליטה: השערים במחולל קבועים, ולכן רק סוג לקוח. */
  kindsOnly?: boolean;
  kindsOnlyWhy?: string;
}) {
  const kinds = value?.kinds ?? [];
  const facts = value?.facts ?? [];
  const set = (next: When) => onChange(cleanWhen(next));
  const factVal = (k: FlowFactKey): 'any' | 'yes' | 'no' => {
    const f = facts.find(x => x.key === k);
    return !f ? 'any' : f.is ? 'yes' : 'no';
  };
  return (
    <div className="fl-cond">
      <div role="group" aria-label="סוג לקוח">
        <div className="fl-cond-l">סוג לקוח</div>
        <div className="fl-chiprow">
          {CLIENT_KIND_ORDER.map(k => {
            const on = kinds.includes(k);
            return (
              <button key={k} type="button" className={`fl-toggle${on ? ' is-on' : ''}`} aria-pressed={on}
                onClick={() => set({ ...value, kinds: on ? kinds.filter(x => x !== k) : [...kinds, k] })}>
                {CLIENT_KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
        <div className="fl-hint">{kinds.length ? 'רק לסוגים המסומנים' : 'אף אחד לא מסומן = כל הסוגים'}</div>
      </div>
      {kindsOnly ? (
        kindsOnlyWhy ? <p className="fl-hint">{kindsOnlyWhy}</p> : null
      ) : (
        <ul className="fl-cond-facts" aria-label="מה ידוע על הלקוח">
          {FLOW_FACT_KEYS.map(k => (
            <li key={k}>
              <span>{FLOW_FACT_LABELS[k].yes}</span>
              <select value={factVal(k)} aria-label={FLOW_FACT_LABELS[k].yes} onChange={e => {
                const v = e.target.value;
                const rest = facts.filter(x => x.key !== k);
                set({ ...value, facts: v === 'any' ? rest : [...rest, { key: k, is: v === 'yes' }] });
              }}>
                <option value="any">לא משנה</option>
                <option value="yes">רק כן</option>
                <option value="no">רק לא</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
